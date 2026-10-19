
/* =================== MÚSICA: SPOTIFY =================== */
// El juego es también un reproductor de Spotify (Web Playback SDK): la página aparece como el dispositivo «RepArena
// (Quest)» y, al pulsar Play, la música se pasa ahí y suena en las gafas. El resto (siguiente, volumen…) va por la Web API.
// Si el reproductor no puede arrancar (sin el permiso «streaming», sin Premium…), Play despierta otro reproductor tuyo.
// Inicio de sesión con Authorization Code + PKCE, sin servidor. Hace falta Spotify Premium y una app propia
// creada en developer.spotify.com con esta página como Redirect URI.
const SP_KEY = 'reparena3-spotify', SP_PKCE = 'reparena3-spotify-pkce';
const SP_SCOPES = 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-read-collaborative';
const SP = { cfg: store(SP_KEY) || {}, st: null, err: '', busy: false, pollT: 0, lastRef: 0, mine: null, started: false };
const spRedirect = () => location.origin + location.pathname.replace(/index\.html$/, '');
const spConnected = () => !!SP.cfg.refresh;
const spPlaying = () => !!(SP.st && SP.st.is_playing);
function spSave() { store(SP_KEY, SP.cfg); }
function b64url(bytes) { let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function spStatus(text, bad) { const el = $('#spStatus'); if (el) { el.textContent = text; el.style.color = bad ? 'var(--red)' : ''; } }

/* ---------- Inicio de sesión ---------- */
async function spConnect() {
  const id = (SP.cfg.clientId || '').trim(); if (!id) { spStatus('Escribe primero el Client ID de tu app de Spotify.', true); return; }
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48))), st = b64url(crypto.getRandomValues(new Uint8Array(12)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  store(SP_PKCE, { verifier, state: st });
  const q = new URLSearchParams({ client_id: id, response_type: 'code', redirect_uri: spRedirect(), code_challenge_method: 'S256', code_challenge: challenge, scope: SP_SCOPES, state: st });
  location.assign('https://accounts.spotify.com/authorize?' + q);
}
async function spTokenReq(body) {
  const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { if (body.grant_type === 'refresh_token' && j.error === 'invalid_grant') { delete SP.cfg.refresh; spSave(); } throw new Error(j.error_description || j.error || 'HTTP ' + r.status); }
  SP.cfg.access = j.access_token; SP.cfg.exp = Date.now() + (j.expires_in || 3600) * 1000; if (j.refresh_token) SP.cfg.refresh = j.refresh_token; if (j.scope) SP.cfg.scopes = j.scope; spSave();
}
// Vuelta desde Spotify con ?code=… (o ?error=…)
async function spHandleRedirect() {
  const q = new URLSearchParams(location.search || ''); if (!q.has('code') && !q.has('error')) return;
  const pk = store(SP_PKCE) || {}; store(SP_PKCE, {}); history.replaceState(null, '', spRedirect());
  if (q.get('error')) { spStatus('Spotify no dio permiso (' + q.get('error') + ').', true); return; }
  if (!pk.verifier || q.get('state') !== pk.state) { spStatus('La respuesta de Spotify no coincide. Vuelve a pulsar Conectar.', true); return; }
  try {
    await spTokenReq({ grant_type: 'authorization_code', code: q.get('code'), redirect_uri: spRedirect(), client_id: SP.cfg.clientId, code_verifier: pk.verifier });
    spStatus('Conectado. La música sonará en estas gafas (o el navegador) al pulsar Play.'); spPage(); spRefresh(); spPlayerInit();
  } catch (e) { spStatus('No se pudo conectar: ' + e.message, true); }
}
async function spToken() {
  if (SP.cfg.access && Date.now() < (SP.cfg.exp || 0) - 60000) return SP.cfg.access;
  if (!SP.cfg.refresh) throw new Error('LOGIN');
  await spTokenReq({ grant_type: 'refresh_token', refresh_token: SP.cfg.refresh, client_id: SP.cfg.clientId });
  return SP.cfg.access;
}
async function spApi(method, path, body, retry = true) {
  const r = await fetch('https://api.spotify.com/v1' + path, { method, headers: Object.assign({ Authorization: 'Bearer ' + await spToken() }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401 && retry) { SP.cfg.exp = 0; return spApi(method, path, body, false); }
  if (r.status === 202 || r.status === 204) return null;
  const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = null; }
  if (!r.ok) throw new Error(r.status === 404 || (j && j.error && j.error.reason === 'NO_ACTIVE_DEVICE') ? 'NO_DEVICE' : (j && j.error && j.error.message) || 'HTTP ' + r.status);
  return j;
}
function spErrText(e) {
  const m = String((e && e.message) || e);
  if (m === 'NO_DEVICE') return 'Abre Spotify en las Quest o el móvil y pon algo a sonar';
  if (m === 'LOGIN' || /invalid_grant|refresh token/i.test(m)) return 'Vuelve a conectar Spotify en la página';
  if (/premium/i.test(m)) return 'Hace falta Spotify Premium';
  if (/fetch|network/i.test(m)) return 'Sin conexión con Spotify';
  return 'Spotify: ' + m;
}

/* ---------- Mandos ---------- */
async function spRefresh() {
  if (!spConnected()) return;
  SP.lastRef = Date.now();
  try { SP.st = await spApi('GET', '/me/player'); SP.err = ''; } catch (e) { SP.err = spErrText(e); }
  spMenuSync(); spPage();
}
async function spDo(fn) {
  if (SP.busy || !spConnected()) return; SP.busy = true;
  try { await fn(); SP.err = ''; } catch (e) { SP.err = spErrText(e); } finally { SP.busy = false; }
  spMenuSync(); setTimeout(spRefresh, 500); // Spotify tarda un momento en reflejar el cambio
}
/* ---------- Reproductor en la propia página: la música suena en las gafas ---------- */
const SPP = { player: null, id: '', state: '', err: '' }; // state: '' (sin arrancar), 'loading', 'ready', 'error'
const spHereOk = () => SPP.state === 'ready' && !!SPP.id;
const spHereNow = () => spHereOk() && !!(SP.st && SP.st.device && SP.st.device.id === SPP.id);
function spPlayerInit() {
  const host = typeof document !== 'undefined' && (document.head || document.body);
  if (SPP.state || !spConnected() || typeof window === 'undefined' || !host || !host.appendChild || !document.createElement) return;
  SPP.state = 'loading';
  const fail = msg => { SPP.state = 'error'; SPP.err = msg; spMenuSync(); spPage(); };
  window.onSpotifyWebPlaybackSDKReady = () => {
    const p = new window.Spotify.Player({ name: 'RepArena (Quest)', volume: 0.8, getOAuthToken: cb => { spToken().then(cb).catch(() => {}); } });
    p.addListener('ready', ({ device_id }) => { SPP.id = device_id; SPP.state = 'ready'; SPP.err = ''; spMenuSync(); spPage(); });
    p.addListener('not_ready', () => { SPP.state = 'loading'; });
    p.addListener('authentication_error', () => fail('Para que suene en las gafas, vuelve a conectar Spotify en la página (hace falta un permiso nuevo)'));
    p.addListener('account_error', () => fail('Para que suene en las gafas hace falta Spotify Premium'));
    p.addListener('initialization_error', () => fail('Este navegador no puede reproducir Spotify: sonará en otro reproductor tuyo'));
    p.addListener('playback_error', () => {});
    SPP.player = p; p.connect();
  };
  const sc = document.createElement('script'); sc.src = 'https://sdk.scdn.co/spotify-player.js'; sc.async = true;
  sc.onerror = () => fail('No se pudo cargar el reproductor de Spotify');
  host.appendChild(sc);
}
// Los navegadores solo dejan sonar audio tras un gesto del usuario: se «despierta» al entrar en las gafas
function spPlayerUnlock() { try { if (SPP.player && SPP.player.activateElement) SPP.player.activateElement(); } catch (e) {} }
// Pasa la música al reproductor de las gafas (y que suene)
async function spToHere() { await spApi('PUT', '/me/player', { device_ids: [SPP.id], play: true }); if (SP.st) { SP.st.is_playing = true; SP.st.device = Object.assign({}, SP.st.device, { id: SPP.id, name: 'RepArena (Quest)' }); } }
async function spWake() { // sin reproductor activo: las gafas si están listas; si no, el primero disponible
  if (spHereOk()) { await spToHere(); return; }
  const d = await spApi('GET', '/me/player/devices'), list = (d && d.devices) || [];
  if (!list.length) throw new Error('NO_DEVICE');
  await spApi('PUT', '/me/player', { device_ids: [(list.find(x => x.is_active) || list[0]).id], play: true });
}
/* ---------- Tus listas: las elegidas suenan al pulsar Play (varias, mezcladas) ---------- */
const spLists = () => (SP.cfg.lists || []).filter(l => l && l.uri);
async function spMyLists() { // todas tus listas (las tuyas y las que sigues), de 50 en 50
  const out = []; let url = '/me/playlists?limit=50';
  for (let i = 0; i < 6 && url; i++) { const j = await spApi('GET', url); (j && j.items || []).forEach(p => p && out.push({ id: p.id, name: p.name, uri: p.uri, n: p.tracks && p.tracks.total })); url = j && j.next ? j.next.replace('https://api.spotify.com/v1', '') : null; }
  return out;
}
// Reproduce esas listas en las gafas (o en el reproductor activo): una, tal cual y al azar; varias, sus canciones mezcladas
async function spPlayLists(lists = spLists()) {
  if (!lists.length) return;
  const dev = spHereOk() ? SPP.id : SP.st && SP.st.device && SP.st.device.id, q = dev ? '?device_id=' + encodeURIComponent(dev) : '';
  if (lists.length === 1) await spApi('PUT', '/me/player/play' + q, { context_uri: lists[0].uri });
  else {
    let uris = [];
    for (const l of lists) { const j = await spApi('GET', `/playlists/${l.id}/tracks?limit=100&fields=items(track(uri))`); uris.push(...(j && j.items || []).map(x => x.track && x.track.uri).filter(u => u && u.startsWith('spotify:track:'))); }
    for (let i = uris.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [uris[i], uris[k]] = [uris[k], uris[i]]; }
    uris = uris.slice(0, 150); if (!uris.length) throw new Error('esas listas no tienen canciones que se puedan poner');
    await spApi('PUT', '/me/player/play' + q, { uris });
  }
  try { await spApi('PUT', '/me/player/shuffle?state=true' + (dev ? '&device_id=' + encodeURIComponent(dev) : '')); } catch (e) { /* da igual */ }
  SP.started = true; if (SP.st) SP.st.is_playing = true;
}
function spToggle() {
  spDo(async () => {
    if (spPlaying()) { await spApi('PUT', '/me/player/pause'); SP.st.is_playing = false; }
    else if (spLists().length && !SP.started) await spPlayLists(); // la primera vez, tus listas; luego Play reanuda
    else if (spHereOk() && !spHereNow()) await spToHere(); // en pausa en otro dispositivo: Play la trae a las gafas
    else if (SP.st && SP.st.device) { await spApi('PUT', '/me/player/play'); SP.st.is_playing = true; }
    else await spWake();
  });
}
function spNext() { spDo(() => spApi('POST', '/me/player/next')); }
function spPrev() { spDo(() => spApi('POST', '/me/player/previous')); }
function spVol(d) {
  spDo(async () => {
    const dev = SP.st && SP.st.device; if (!dev) throw new Error('NO_DEVICE');
    if (dev.supports_volume === false) throw new Error('ese reproductor no deja cambiar el volumen desde fuera');
    const v = clamp(Math.round(((dev.volume_percent == null ? 50 : dev.volume_percent) + d) / 5) * 5, 0, 100);
    await spApi('PUT', '/me/player/volume?volume_percent=' + v); dev.volume_percent = v;
  });
}
// Ritmo de la canción que suena: Spotify dejó de dar el análisis de audio a las apps nuevas (finales de
// 2024), así que puede fallar; entonces devuelve null y el ritmo se marca tocando al compás
async function spTempo() {
  const st = await spApi('GET', '/me/player'), it = st && st.item; if (!it || !it.id) throw new Error('NO_DEVICE');
  const start = performance.now() / 1000 - (st.progress_ms || 0) / 1000;
  try { const a = await spApi('GET', '/audio-analysis/' + it.id); if (a && a.track && a.track.tempo) return { bpm: a.track.tempo, beat0: a.beats && a.beats.length ? start + a.beats[0].start : null }; } catch (e) { /* sin permiso */ }
  try { const f = await spApi('GET', '/audio-features/' + it.id); if (f && f.tempo) return { bpm: f.tempo, beat0: null }; } catch (e) { /* sin permiso */ }
  return null;
}
function spNowText() {
  if (!spConnected()) return '';
  if (SP.err) return SP.err;
  const it = SP.st && SP.st.item;
  if (!it) return SP.st ? 'Spotify: no suena nada' : 'Spotify: buscando reproductor…';
  const who = it.artists ? it.artists.map(a => a.name).join(', ') : it.show ? it.show.name : '';
  const vol = SP.st.device && SP.st.device.volume_percent != null ? ` · vol. ${SP.st.device.volume_percent}%` : '';
  return `${spPlaying() ? 'Suena' : 'En pausa'}: ${it.name}${who ? ' — ' + who : ''}${vol}`;
}
// Filas para los menús del juego (principal y pausa)
function musicRows() {
  if (!spConnected()) return [];
  if (Date.now() - SP.lastRef > 3000) SP.pollT = 0;
  const here = spHereOk() && spPlaying() && !spHereNow() ? [{ t: 'btns', items: [{ label: 'Que suene en las gafas', style: 'primary', onPress: () => spDo(spToHere) }] }] : [];
  const where = SP.st && SP.st.device && SP.st.device.name ? ` (en ${SP.st.device.name})` : '';
  const L = spLists(), lists = L.length ? [{ t: 'btns', items: [...L.slice(0, 3).map(l => ({ label: l.name, onPress: () => spDo(() => spPlayLists([l])) })), ...(L.length > 1 ? [{ label: `Todas mezcladas (${L.length})`, onPress: () => spDo(() => spPlayLists(L)) }] : [])] }] : [];
  return [{ t: 'text', text: spNowText() + (spPlaying() && !spHereNow() ? where : ''), color: SP.err ? '#ff8a3d' : '#3cf0c6', music: true }, ...here, ...lists,
    ...(SPP.state === 'error' ? [{ t: 'text', text: SPP.err, color: '#ffd166' }] : []),
    { t: 'btns', items: [{ label: 'Anterior', onPress: spPrev }, { label: spPlaying() ? 'Pausa' : 'Play', style: 'primary', onPress: spToggle }, { label: 'Siguiente', onPress: spNext }, { label: 'Vol −', onPress: () => spVol(-10) }, { label: 'Vol +', onPress: () => spVol(10) }] }];
}
function spMenuSync() { if (menu && menu.music !== null && !menu.keypad && menu.music !== spNowText() && menu.rebuild) menu.rebuild(); }
function spTick(dt) {
  if (!spConnected() || !menu || menu.music === null) return;
  SP.pollT -= dt; if (SP.pollT <= 0) { SP.pollT = 5; spRefresh(); }
}

/* ---------- Sección de la página ---------- */
function spPage() {
  const now = $('#spNow'); if (now) now.textContent = spConnected() ? spNowText() : 'Sin conectar';
  const off = $('#btnSpOff'); if (off) off.disabled = !spConnected();
}
function spInitPage() {
  const inp = $('#spClient'); inp.value = SP.cfg.clientId || '';
  inp.addEventListener('input', () => { SP.cfg.clientId = inp.value.trim(); spSave(); });
  $('#spRedirect').textContent = spRedirect();
  $('#btnSpConnect').addEventListener('click', () => { spConnect().catch(e => spStatus('No se pudo abrir Spotify: ' + e.message, true)); });
  $('#btnSpTest').addEventListener('click', async () => { if (!spConnected()) { spStatus('Primero pulsa Conectar con Spotify.', true); return; } spStatus('Comprobando…'); await spRefresh(); spStatus(SP.err || spNowText(), !!SP.err); });
  $('#btnSpLists').addEventListener('click', async () => {
    if (!spConnected()) { spStatus('Primero pulsa Conectar con Spotify.', true); return; }
    spStatus('Cargando tus listas…');
    try { SP.mine = await spMyLists(); spStatus(SP.mine.length ? `${SP.mine.length} listas: marca las que quieras para entrenar.` : 'No tienes listas en Spotify.'); spListsPage(); }
    catch (e) { spStatus(/insufficient|scope|403/i.test(e.message) ? 'Vuelve a pulsar Conectar con Spotify: hace falta el permiso para leer tus listas.' : spErrText(e), true); }
  });
  $('#btnSpOff').addEventListener('click', () => { SP.cfg = { clientId: SP.cfg.clientId }; SP.st = null; SP.err = ''; spSave(); spStatus('Desconectado.'); spPage(); });
  spPage(); spListsPage();
  spHandleRedirect();
  spPlayerInit();
}
// Casillas con tus listas (las cargadas y, si no, las ya elegidas)
function spListsPage() {
  const host = $('#spLists'); if (!host) return;
  const chosen = new Set(spLists().map(l => l.id)), all = SP.mine || spLists();
  host.innerHTML = all.map(l => `<label><input type="checkbox" data-id="${l.id}" ${chosen.has(l.id) ? 'checked' : ''}><span>${String(l.name).replace(/[<&"]/g, c => ({ '<': '&lt;', '&': '&amp;', '"': '&quot;' }[c]))}</span></label>`).join('');
  if (!host.querySelectorAll) return;
  host.querySelectorAll('input').forEach(i => i.addEventListener('change', () => {
    const on = new Set([...host.querySelectorAll('input:checked')].map(x => x.dataset.id));
    SP.cfg.lists = all.filter(l => on.has(l.id)).map(l => ({ id: l.id, name: l.name, uri: l.uri })); SP.started = false; spSave(); spMenuSync();
  }));
}
