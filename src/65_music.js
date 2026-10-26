
/* =================== MÚSICA: SPOTIFY =================== */
// El juego es también un reproductor de Spotify (Web Playback SDK): la página aparece como el dispositivo «RepArena
// (Quest)» y, al pulsar Play, la música se pasa ahí y suena en las gafas. El resto (siguiente, volumen…) va por la Web API.
// Si el reproductor no puede arrancar (sin el permiso «streaming», sin Premium…), Play despierta otro reproductor tuyo.
// Inicio de sesión con Authorization Code + PKCE, sin servidor. Hace falta Spotify Premium y una app propia
// creada en developer.spotify.com con esta página como Redirect URI.
const SP_KEY = 'reparena3-spotify', SP_PKCE = 'reparena3-spotify-pkce';
const SP_SCOPES = 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-read-collaborative user-library-read';
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
  if (!r.ok) { const e = new Error(r.status === 404 || (j && j.error && j.error.reason === 'NO_ACTIVE_DEVICE') ? 'NO_DEVICE' : (j && j.error && j.error.message) || 'HTTP ' + r.status); e.status = r.status; throw e; }
  return j;
}
function spErrText(e) {
  const m = String((e && e.message) || e);
  if (m === 'NO_DEVICE') return 'Abre Spotify en las Quest o el móvil y pon algo a sonar';
  if (m === 'LIBRARY') return 'Vuelve a pulsar Conectar con Spotify (en la página): hace falta permiso para ver tus canciones que te gustan';
  if (m === 'NOT_YOURS') return 'Spotify solo deja ver las canciones de tus listas (o de las colaborativas): esta puedes ponerla entera';
  if (m === 'LOGIN' || /invalid_grant|refresh token/i.test(m)) return 'Vuelve a conectar Spotify en la página';
  if (/premium/i.test(m)) return 'Hace falta Spotify Premium';
  if (/fetch|network/i.test(m)) return 'Sin conexión con Spotify';
  return 'Spotify: ' + m;
}

/* ---------- Mandos ---------- */
async function spRefresh() {
  if (!spConnected()) return;
  SP.lastRef = Date.now();
  // sin reproductor (204) se mantiene el aviso de abrir Spotify: si no, se borraba medio segundo después de pulsar Play
  try { SP.st = await spApi('GET', '/me/player'); if (SP.st || SP.err !== spErrText(new Error('NO_DEVICE'))) SP.err = ''; } catch (e) { SP.err = spErrText(e); }
  spMenuSync(); spPage(); spAutoTempo();
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
    const p = new window.Spotify.Player({ name: 'RepArena (Quest)', volume: SP.cfg.vol != null ? SP.cfg.vol / 100 : 0.8, getOAuthToken: cb => { spToken().then(cb).catch(() => {}); } });
    p.addListener('ready', ({ device_id }) => { SPP.id = device_id; SPP.state = 'ready'; SPP.err = ''; if (SP.cfg.vol != null && p.setVolume) Promise.resolve(p.setVolume(SP.cfg.vol / 100)).catch(() => {}); spMenuSync(); spPage(); });
    p.addListener('not_ready', () => { SPP.state = 'loading'; });
    p.addListener('authentication_error', () => fail('Para que suene en las gafas, vuelve a conectar Spotify en la página (hace falta un permiso nuevo)'));
    p.addListener('account_error', () => fail('Para que suene en las gafas hace falta Spotify Premium'));
    p.addListener('initialization_error', () => fail('Este navegador no puede reproducir Spotify: sonará en otro reproductor tuyo'));
    p.addListener('playback_error', () => {});
    p.addListener('player_state_changed', s => { if (s && SP.st && spHereNow()) { SP.st.is_playing = !s.paused; } if (s && s.track_window && s.track_window.current_track && s.track_window.current_track.id !== SP.tempoId) SP.pollT = Math.min(SP.pollT, 0.5); });
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
// Todas tus listas (las tuyas y las que sigues), de 50 en 50. Desde 2026, a las apps en modo desarrollo (como la tuya)
// Spotify solo les deja ver las canciones de las listas tuyas o colaborativas: las demás se marcan (mine: false) y se
// pueden poner enteras, pero no elegir sus canciones
async function spMyLists() {
  if (!SP.meId) { try { const me = await spApi('GET', '/me'); SP.meId = me && me.id; } catch (e) { /* sin saberlo, se intenta con todas */ } }
  const out = []; let url = '/me/playlists?limit=50';
  for (let i = 0; i < 6 && url; i++) {
    const j = await spApi('GET', url);
    (j && j.items || []).forEach(p => { if (!p) return; const n = (p.items || p.tracks || {}).total, own = p.owner && p.owner.id; out.push({ id: p.id, name: p.name, uri: p.uri, n, mine: !SP.meId || !own || own === SP.meId || !!p.collaborative }); });
    url = j && j.next ? j.next.replace('https://api.spotify.com/v1', '') : null;
  }
  // las de otros usuarios no se enseñan (no se pueden elegir sus canciones): si estaban marcadas, dejan de estarlo
  const other = new Set(out.filter(l => !l.mine).map(l => l.id)), was = spLists();
  if (was.some(l => other.has(l.id))) { SP.cfg.lists = was.filter(l => !other.has(l.id)); spSave(); }
  return out;
}
// Lo que se puede elegir: tus canciones que te gustan (las sueltas) y tus listas (las tuyas y las colaborativas)
const SP_LIKED = { id: 'liked', name: '♥ Canciones que te gustan', liked: true };
const spOwnLists = () => (SP.mine || []).filter(l => l.mine !== false);
const spPickable = () => [SP_LIKED, ...spOwnLists()];
// Reproduce esas listas en las gafas (o en el reproductor activo): una, tal cual y al azar; varias, sus canciones mezcladas
async function spPlayLists(lists = spLists()) {
  if (!lists.length) return;
  const dev = spHereOk() ? SPP.id : SP.st && SP.st.device && SP.st.device.id, q = dev ? '?device_id=' + encodeURIComponent(dev) : '';
  if (lists.length === 1) await spApi('PUT', '/me/player/play' + q, { context_uri: lists[0].uri });
  else {
    let uris = [];
    for (const l of lists) { try { uris.push(...(await spListTracks(l.id)).map(t => t.uri)); } catch (e) { if (e.message !== 'NOT_YOURS') throw e; } } // (las que no se pueden leer, fuera)
    for (let i = uris.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [uris[i], uris[k]] = [uris[k], uris[i]]; }
    uris = uris.slice(0, 150);
    await spApi('PUT', '/me/player/play' + q, uris.length ? { uris } : { context_uri: lists[0].uri }); // (si no se puede leer ninguna, la primera entera)
  }
  try { await spApi('PUT', '/me/player/shuffle?state=true' + (dev ? '&device_id=' + encodeURIComponent(dev) : '')); } catch (e) { /* da igual */ }
  SP.started = true; if (SP.st) SP.st.is_playing = true;
}
// Las canciones de una lista (hasta 300): { uri, name, by }. Desde 2026 se piden en /items (cada entrada trae «item»; antes
// /tracks y «track»: se aceptan las dos) y solo de listas tuyas o colaborativas: si no, NOT_YOURS
async function spListTracks(id) {
  SP.trk = SP.trk || {}; if (SP.trk[id]) return SP.trk[id];
  const out = []; let url = id === 'liked' ? '/me/tracks?limit=50' : `/playlists/${id}/items?limit=50`, legacy = false; // (las que te gustan: tu biblioteca)
  for (let i = 0; i < 6 && url; i++) {
    let j;
    try { j = await spApi('GET', url); }
    catch (e) {
      if (!i && !legacy && e.status === 404) { legacy = true; url = `/playlists/${id}/tracks?limit=100`; i--; continue; } // (por si /items no existiera)
      if (id === 'liked' && (e.status === 403 || e.status === 401)) throw new Error('LIBRARY');
      if (e.status === 403) { const l = (SP.mine || []).find(x => x.id === id); if (l) l.mine = false; throw new Error('NOT_YOURS'); }
      throw e;
    }
    (j && j.items || []).forEach(x => { const t = x && (x.item || x.track); if (t && t.uri && t.uri.startsWith('spotify:track:')) out.push({ uri: t.uri, name: t.name, by: (t.artists || []).map(a => a.name).join(', ') }); });
    url = j && j.next ? j.next.replace('https://api.spotify.com/v1', '') : null;
  }
  return (SP.trk[id] = out);
}
const spDev = () => spHereOk() ? SPP.id : SP.st && SP.st.device && SP.st.device.id;
const spQ = (dev = spDev()) => dev ? '?device_id=' + encodeURIComponent(dev) : '';
// Una lista entera (al azar o en orden) o desde una de sus canciones
async function spPlayList(l, fromUri, shuffle) {
  const q = spQ(); await spApi('PUT', '/me/player/play' + q, fromUri ? { context_uri: l.uri, offset: { uri: fromUri } } : { context_uri: l.uri });
  try { await spApi('PUT', '/me/player/shuffle?state=' + (!!shuffle) + (q ? '&' + q.slice(1) : '')); } catch (e) { /* da igual */ }
  SP.started = true; SP.block = null; if (SP.st) SP.st.is_playing = true;
}
// La música de un bloque de la sesión: sus canciones, en orden y en bucle mientras dura (si el bloque anterior tenía las
// mismas, siguen sin empezar de nuevo)
async function spPlayTracks(tracks) {
  const uris = tracks.map(t => t.uri).filter(Boolean).slice(0, 100); if (!uris.length) return;
  const q = spQ(); await spApi('PUT', '/me/player/play' + q, { uris });
  try { await spApi('PUT', '/me/player/shuffle?state=false' + (q ? '&' + q.slice(1) : '')); await spApi('PUT', '/me/player/repeat?state=context' + (q ? '&' + q.slice(1) : '')); } catch (e) { /* da igual */ }
  SP.started = true; if (SP.st) SP.st.is_playing = true;
}
function spBlockMusic(b) {
  const tr = b && Array.isArray(b.music) ? b.music : []; if (!tr.length || !spConnected()) return false;
  const key = tr.map(t => t.uri).join(','); if (SP.block === key && spPlaying()) return true;
  SP.block = key; SP.resume = false; spDo(() => spPlayTracks(tr)); return true;
}
function spToggle() {
  spDo(async () => {
    if (spPlaying()) { await spApi('PUT', '/me/player/pause'); SP.st.is_playing = false; }
    else if (spPicks().length && !SP.started) { await spPlayTracks(spPicks()); SP.block = null; } // la primera vez, tus canciones elegidas (en orden y en bucle)…
    else if (spLists().length && !SP.started) await spPlayLists(); // …o tus listas; luego Play reanuda
    else if (spHereOk() && !spHereNow()) await spToHere(); // en pausa en otro dispositivo: Play la trae a las gafas
    else if (SP.st && SP.st.device) { await spApi('PUT', '/me/player/play'); SP.st.is_playing = true; }
    else await spWake();
  });
}
// Al terminar la partida, Spotify se pausa (y vuelve a oírse el ambiente de la arena); al empezar la siguiente, sigue la
// música que sonaba
// (en su propia cola, y vale la última: si acabas una partida mientras aún se reanudaba la música, se pausa igual)
function spRoundQueue(want) {
  SP.want = want;
  SP.roundQ = (SP.roundQ || Promise.resolve()).then(async () => {
    if (SP.want !== want || !spConnected()) return;
    try { await spApi('PUT', want === 'pause' ? '/me/player/pause' : '/me/player/play'); if (SP.st) SP.st.is_playing = want === 'play'; SP.err = ''; } catch (e) { SP.err = spErrText(e); }
    spMenuSync(); setTimeout(spRefresh, 500);
  });
}
function spRoundEnd() {
  SP.resume = spConnected() && (spPlaying() || SP.want === 'play'); if (!SP.resume) return;
  if (SP.st) SP.st.is_playing = false; AUDM.music = false; applyVolume(); spRoundQueue('pause');
}
function spRoundStart() {
  if (!SP.resume) return; SP.resume = false; if (!spConnected() || (spPlaying() && SP.want !== 'pause')) return;
  spRoundQueue('play');
}
function spNext() { spDo(() => spApi('POST', '/me/player/next')); }
function spPrev() { spDo(() => spApi('POST', '/me/player/previous')); }
// Volumen. El juego lleva la cuenta: Spotify tarda en reflejar los cambios (y al volver a leerlo devolvía el
// valor viejo, así que el botón «no hacía nada»), y el reproductor de las gafas a menudo informa de un 0 que
// hacía que bajar lo silenciara. En las gafas se cambia directamente en su reproductor; fuera, por la Web API
// (agrupando las pulsaciones seguidas). Las pulsaciones nunca se pierden aunque haya otra orden en curso.
function spVolNow() {
  if (SP.volT && Date.now() - SP.volT < 8000) return SP.vol;
  const rep = SP.st && SP.st.device && SP.st.device.volume_percent;
  if (spHereNow() || !(rep > 0)) return SP.cfg.vol != null ? SP.cfg.vol : rep > 0 ? rep : 60;
  return rep;
}
function spVol(d) {
  if (!spConnected()) return;
  const dev = SP.st && SP.st.device;
  if (dev && dev.supports_volume === false && !spHereNow()) { SP.err = 'Spotify: ese reproductor no deja cambiar el volumen desde fuera'; spMenuSync(); return; }
  const v = clamp(Math.round((spVolNow() + d) / 5) * 5, 0, 100);
  SP.vol = v; SP.volT = Date.now(); SP.cfg.vol = v; spSave(); if (dev) dev.volume_percent = v; SP.err = ''; spMenuSync();
  if (spHereNow() && SPP.player && SPP.player.setVolume) { Promise.resolve(SPP.player.setVolume(v / 100)).catch(() => {}); return; }
  clearTimeout(SP.volTimer);
  SP.volTimer = setTimeout(() => { spApi('PUT', '/me/player/volume?volume_percent=' + SP.vol).catch(e => { SP.err = spErrText(e); spMenuSync(); }); }, 250);
}
// Ritmo de la canción que suena. Spotify dejó de dar el análisis de audio a las apps nuevas (finales de 2024): se le
// pregunta por si acaso y, si no, a Deezer, que da el tempo de muchísimas canciones (buscándola por su código ISRC o
// por artista y título). Sin el instante de los pulsos, se cuentan desde el principio de la canción (casi siempre
// empieza en un pulso); «Encajar el pulso» lo afina. Devuelve null si nadie lo sabe
async function spTempo() {
  const st = await spApi('GET', '/me/player'), it = st && st.item; if (!it || !it.id) throw new Error('NO_DEVICE');
  const start = performance.now() / 1000 - (st.progress_ms || 0) / 1000;
  try { const a = await spApi('GET', '/audio-analysis/' + it.id); if (a && a.track && a.track.tempo) return { bpm: a.track.tempo, beat0: a.beats && a.beats.length ? start + a.beats[0].start : start, id: it.id }; } catch (e) { /* sin permiso */ }
  try { const f = await spApi('GET', '/audio-features/' + it.id); if (f && f.tempo) return { bpm: f.tempo, beat0: start, id: it.id }; } catch (e) { /* sin permiso */ }
  const bpm = await dzTempo(it); return bpm ? { bpm, beat0: start, id: it.id } : null;
}
// Deezer responde sin permisos y por JSONP (su API no deja leerla con fetch desde otra web)
function jsonp(url, ms = 6000) {
  return new Promise((res, rej) => {
    if (typeof document === 'undefined' || !document.createElement) { rej(new Error('NO_DOM')); return; }
    const cb = '__rajp' + Math.random().toString(36).slice(2), s = document.createElement('script');
    const done = (v, e) => { clearTimeout(t); delete window[cb]; if (s.parentNode) s.parentNode.removeChild(s); if (e) rej(e); else res(v); };
    const t = setTimeout(() => done(null, new Error('TIMEOUT')), ms);
    window[cb] = v => done(v); s.onerror = () => done(null, new Error('NET'));
    s.src = url + (url.includes('?') ? '&' : '?') + 'output=jsonp&callback=' + cb; (document.head || document.body).appendChild(s);
  });
}
async function dzTempo(it) {
  const bpmOf = async id => { const t = await jsonp('https://api.deezer.com/track/' + id); return t && t.bpm > 40 ? t.bpm : 0; };
  const isrc = it.external_ids && it.external_ids.isrc;
  if (isrc) try { const b = await bpmOf('isrc:' + encodeURIComponent(isrc)); if (b) return b; } catch (e) { /* no está */ }
  const artist = it.artists && it.artists[0] ? it.artists[0].name : '';
  try {
    const r = await jsonp('https://api.deezer.com/search?limit=3&q=' + encodeURIComponent(`artist:"${artist}" track:"${it.name}"`));
    for (const x of (r && r.data) || []) { const b = await bpmOf(x.id); if (b) return b; }
  } catch (e) { /* sin conexión */ }
  return 0;
}
// «Ritmo de Spotify» activado: al cambiar de canción, el ritmo cambia solo
function spAutoTempo() {
  const it = SP.st && SP.st.item; if (!SP.cfg.autoBpm || !it || !it.id || it.id === SP.tempoId || SP.tempoBusy) return;
  SP.tempoId = it.id; SP.tempoBusy = true;
  spotifyTempo().then(m => { if (state === 'play' || state === 'rest' || (menu && menu.music !== null)) say(m, '#ffd166', 2.5); if (menu && menu.rebuild && !menu.keypad) menu.rebuild(); }).finally(() => { SP.tempoBusy = false; });
}
function spNowText() {
  if (!spConnected()) return '';
  if (SP.err) return SP.err;
  const it = SP.st && SP.st.item;
  if (!it) return SP.st ? 'Spotify: no suena nada' : 'Spotify: buscando reproductor…';
  const who = it.artists ? it.artists.map(a => a.name).join(', ') : it.show ? it.show.name : '';
  const vol = SP.st.device ? ` · vol. ${spVolNow()}%` : '';
  return `${spPlaying() ? 'Suena' : 'En pausa'}: ${it.name}${who ? ' — ' + who : ''}${vol}`;
}
// Filas para los menús del juego (principal y pausa)
function musicRows() {
  if (!spConnected()) return [];
  if (Date.now() - SP.lastRef > 3000) SP.pollT = 0;
  const here = spHereOk() && spPlaying() && !spHereNow() ? [{ t: 'btns', items: [{ label: 'Que suene en las gafas', style: 'primary', onPress: () => spDo(spToHere) }] }] : [];
  const where = SP.st && SP.st.device && SP.st.device.name ? ` (en ${SP.st.device.name})` : '';
  const L = spLists(), lists = [{ t: 'btns', items: [...L.slice(0, 2).map(l => ({ label: l.name, onPress: () => spDo(() => spPlayLists([l])) })), ...(L.length > 1 ? [{ label: `Mezcladas (${L.length})`, onPress: () => spDo(() => spPlayLists(L)) }] : []),
    { label: 'Listas y canciones  ▸', accent: '#a68bff', flex: 1.4, onPress: () => { const b = menu && menu.rebuild; SP.loadErr = ''; spListMenu(b || (() => hideMenu())); } }] }];
  return [{ t: 'text', text: spNowText() + (spPlaying() && !spHereNow() ? where : ''), color: SP.err ? '#ff8a3d' : '#3cf0c6', music: true }, ...here, ...lists,
    ...(SPP.state === 'error' ? [{ t: 'text', text: SPP.err, color: '#ffd166' }] : []),
    { t: 'btns', items: [{ label: 'Anterior', onPress: spPrev }, { label: spPlaying() ? 'Pausa' : 'Play', style: 'primary', onPress: spToggle }, { label: 'Siguiente', onPress: spNext }, { label: 'Vol −', onPress: () => spVol(-10) }, { label: 'Vol +', onPress: () => spVol(10) }] }];
}
// Elegir en el juego cualquiera de tus listas (de 8 en 8) y, dentro, ponerla entera, al azar o desde una canción
function spListMenu(back, page = 0) {
  const again = p => spListMenu(back, p), rows = [{ t: 'title', text: 'TUS LISTAS' }];
  if (spPicks().length) rows.push({ t: 'btns', items: [{ label: `▶ Tus canciones elegidas (${spPicks().length})`, style: 'primary', onPress: () => spDo(async () => { await spPlayTracks(spPicks()); SP.block = null; }) }] });
  if (!SP.mine) { rows.push({ t: 'text', text: SP.loadErr || 'Cargando tus listas…', color: SP.loadErr ? '#ff8a3d' : '#ffd166' });
    if (SP.loadErr) rows.push({ t: 'btns', items: [{ label: 'Reintentar', onPress: () => { SP.loadErr = ''; again(page); } }] });
    else if (!SP.loading) { SP.loading = true; spMyLists().then(l => { SP.mine = l; SP.loadErr = ''; }).catch(e => { SP.loadErr = spErrText(e); }).finally(() => { SP.loading = false; if (menu && menu.spList) again(page); }); } }
  else {
    const L = spPickable(), N = 8, pages = Math.max(1, Math.ceil(L.length / N)), p = clamp(page, 0, pages - 1), slice = L.slice(p * N, p * N + N); // (las de otros usuarios no: Spotify no deja ver sus canciones)
    for (let i = 0; i < slice.length; i += 2) rows.push({ t: 'btns', items: slice.slice(i, i + 2).map(l => ({ label: l.name, onPress: () => spTrackMenu(l, () => again(p)) })) });
    if (pages > 1) rows.push({ t: 'btns', items: [{ label: '◀', onPress: () => again(p - 1) }, { label: `${p + 1} / ${pages}`, style: 'ghost', onPress: () => {} }, { label: '▶', onPress: () => again(p + 1) }] });
  }
  rows.push({ t: 'btns', items: [{ label: 'Volver', onPress: back }] });
  const m = openMenu(rows, { accent: MC.sound }); m.rebuild = () => again(page); m.spList = true;
}
function spTrackMenu(l, back, page = 0) {
  const again = p => spTrackMenu(l, back, p), T = SP.trk && SP.trk[l.id], rows = [{ t: 'title', text: l.name }];
  const all = sh => spDo(async () => { if (!l.liked) return spPlayList(l, null, sh); const t = (await spListTracks(l.id)).slice(); if (sh) for (let k = t.length - 1; k > 0; k--) { const r = Math.floor(Math.random() * (k + 1)); [t[k], t[r]] = [t[r], t[k]]; } await spPlayTracks(t); SP.block = null; }); // (las que te gustan no son una lista: se ponen sus canciones)
  rows.push({ t: 'btns', items: [{ label: l.liked ? '▶ Todas' : '▶ Toda la lista', style: 'primary', onPress: () => all(false) }, { label: 'Al azar', onPress: () => all(true) }] });
  if (l.mine === false) rows.push({ t: 'text', text: spErrText(new Error('NOT_YOURS')), color: '#a49fc8' });
  else if (!T) { rows.push({ t: 'text', text: SP.loadErr || 'Cargando sus canciones…', color: '#ffd166' });
    if (SP.loadErr) rows.push({ t: 'btns', items: [{ label: 'Reintentar', onPress: () => { SP.loadErr = ''; again(page); } }] });
    else if (!SP.loading) { SP.loading = true; spListTracks(l.id).catch(e => { if (e.message !== 'NOT_YOURS') SP.loadErr = spErrText(e); }).finally(() => { SP.loading = false; if (menu && menu.spTrk === l.id) again(page); }); } }
  else {
    const N = 8, pages = Math.max(1, Math.ceil(T.length / N)), p = clamp(page, 0, pages - 1);
    rows.push({ t: 'text', text: T.length ? 'Toca una canción para que la lista empiece por ella' : 'Esta lista no tiene canciones que se puedan poner', color: '#a49fc8' });
    for (const t of T.slice(p * N, p * N + N)) rows.push({ t: 'btns', items: [{ label: `${t.name}${t.by ? ' — ' + t.by : ''}`, onPress: () => spDo(async () => { if (!l.liked) return spPlayList(l, t.uri, false); const k = T.indexOf(t); await spPlayTracks(T.slice(k).concat(T.slice(0, k))); SP.block = null; }) }] });
    if (pages > 1) rows.push({ t: 'btns', items: [{ label: '◀', onPress: () => again(p - 1) }, { label: `${p + 1} / ${pages}`, style: 'ghost', onPress: () => {} }, { label: '▶', onPress: () => again(p + 1) }] });
  }
  rows.push({ t: 'btns', items: [{ label: 'Volver', onPress: back }] });
  const m = openMenu(rows, { accent: MC.sound }); m.rebuild = () => again(page); m.spTrk = l.id;
}
// Minicontroles para el menú de muñeca o el atril (principal y pausa): lo que suena y anterior, pausa/play, siguiente y
// volumen, con iconos. Pulsarlos en plena partida no la termina: la pausa sigue ahí y «Continuar» la reanuda
function spMiniRows() {
  if (!spConnected()) return [];
  if (Date.now() - SP.lastRef > 3000) SP.pollT = 0;
  const it = SP.st && SP.st.item, now = SP.err || (it ? `♪ ${it.name}${it.artists ? ' — ' + it.artists.map(a => a.name).join(', ') : ''}` : 'Spotify: no suena nada');
  return [{ t: 'text', text: now, color: SP.err ? '#ff8a3d' : '#a68bff', music: true },
    { t: 'btns', h: 0.058, items: [{ label: 'Anterior', icon: 'prev', onPress: spPrev }, { label: spPlaying() ? 'Pausa' : 'Play', icon: spPlaying() ? 'pause' : 'play', style: 'primary', flex: 1.3, onPress: spToggle },
      { label: 'Siguiente', icon: 'next', onPress: spNext }, { label: 'Vol −', icon: 'voldown', onPress: () => spVol(-10) }, { label: 'Vol +', icon: 'volup', onPress: () => spVol(10) }] }];
}
function spMenuSync() { if (menu && menu.music !== null && !menu.keypad && menu.music !== spNowText() && menu.rebuild) menu.rebuild(); }
// Con el menú de música abierto, se pregunta a Spotify cada 5 s; si no, cada 8 s (para callar el ambiente mientras
// suena y para seguir el ritmo de cada canción)
function spTick(dt) {
  const on = spConnected() && spPlaying(); if (on !== AUDM.music) { AUDM.music = on; applyVolume(); }
  if (!spConnected()) return;
  SP.pollT -= dt; if (SP.pollT <= 0) { SP.pollT = menu && menu.music !== null ? 5 : 8; spRefresh(); }
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
// Tus listas: cada una con su casilla (toda la lista) y «Canciones ▾», que despliega sus canciones para elegir solo las
// que quieras. Las canciones elegidas (de una o varias listas) suenan ellas, en el orden en que las marcaste y en bucle;
// si no eliges ninguna, suenan las listas marcadas (varias, mezcladas). Los nombres largos ocupan las líneas que haga falta
const spPicks = () => (SP.cfg.picks || []).filter(t => t && t.uri);
const escSp = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function spListsPage() {
  const host = $('#spLists'); if (!host) return;
  const chosen = new Set(spLists().map(l => l.id)), P = spPicks(), on = new Set(P.map(t => t.uri)), open = SP.openList;
  let h = P.length ? `<div class="sppicks"><b>Canciones elegidas (${P.length})</b>: suenan ellas, en este orden y en bucle.<div class="chips">${P.map((t, k) => `<span class="chip">${k + 1}. ${escSp(t.name)}<button class="btn tiny" data-sp="rm" data-k="${k}" aria-label="Quitar ${escSp(t.name)}">✕</button></span>`).join('')}<button class="btn small" data-sp="clear">Quitar todas</button></div></div>` : '';
  if (open) { // dentro de una lista: solo sus canciones
    const l = spPickable().find(x => x.id === open) || { name: '' }, T = SP.trk && SP.trk[open];
    h += `<div class="spin"><button class="btn small" data-sp="back">← Tus listas</button><b>${escSp(l.name)}</b></div>`;
    h += T ? (T.length ? `<div class="sptracks">${T.map(t => `<label><input type="checkbox" data-trk="${escSp(t.uri)}" ${on.has(t.uri) ? 'checked' : ''}><span>${escSp(t.name)}<small> — ${escSp(t.by)}</small></span></label>`).join('')}</div>` : '<p class="hint">Aquí no hay canciones que se puedan poner.</p>') : `<p class="status">${escSp(SP.trkErr || 'Cargando sus canciones…')}</p>`;
  } else { // tus listas (y las canciones que te gustan): la casilla pone la lista entera; «Abrir» enseña sus canciones
    const L = SP.mine ? spPickable() : spLists();
    h += L.map(l => `<div class="sprow">${l.liked ? `<span class="lname">${escSp(l.name)}</span>` : `<label><input type="checkbox" data-id="${l.id}" ${chosen.has(l.id) ? 'checked' : ''}><span>${escSp(l.name)}</span></label>`}<button class="btn tiny" data-sp="open" data-id="${l.id}">Abrir ▸</button></div>`).join('');
  }
  host.innerHTML = h;
  if (!host.querySelectorAll || host.dataset.wired) return; host.dataset.wired = '1';
  host.addEventListener('change', ev => {
    const el = ev.target;
    if (el.dataset.id) { const on2 = new Set([...host.querySelectorAll('input[data-id]:checked')].map(x => x.dataset.id)), all2 = SP.mine || spLists(); SP.cfg.lists = all2.filter(l => on2.has(l.id) || (!host.querySelector(`input[data-id="${l.id}"]`) && spLists().some(x => x.id === l.id))).map(l => ({ id: l.id, name: l.name, uri: l.uri })); }
    else if (el.dataset.trk) { const T = (SP.trk && SP.trk[SP.openList]) || [], t = T.find(x => x.uri === el.dataset.trk); if (!t) return; const P2 = spPicks(); SP.cfg.picks = el.checked ? (P2.some(x => x.uri === t.uri) || P2.length >= 100 ? P2 : P2.concat({ uri: t.uri, name: t.name, by: t.by })) : P2.filter(x => x.uri !== t.uri); spListsPage(); }
    SP.started = false; spSave(); spMenuSync();
  });
  host.addEventListener('click', ev => {
    const b = ev.target.closest && ev.target.closest('button[data-sp]'); if (!b) return;
    if (b.dataset.sp === 'open') { const id = b.dataset.id; SP.openList = id; SP.trkErr = ''; spListsPage();
      if (!(SP.trk && SP.trk[id])) spListTracks(id).then(spListsPage).catch(e => { SP.trkErr = /NOT_YOURS|LIBRARY/.test(e.message) ? spErrText(e) : 'No se pudieron cargar sus canciones: ' + spErrText(e); spListsPage(); }); return; }
    if (b.dataset.sp === 'back') { SP.openList = null; spListsPage(); return; }
    if (b.dataset.sp === 'rm') SP.cfg.picks = spPicks().filter((_, k) => k !== +b.dataset.k); else if (b.dataset.sp === 'clear') SP.cfg.picks = [];
    SP.started = false; spSave(); spListsPage(); spMenuSync();
  });
}
