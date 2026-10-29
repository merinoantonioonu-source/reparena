
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
    (j && j.items || []).forEach(x => { const t = x && (x.item || x.track); if (t && t.uri && t.uri.startsWith('spotify:track:')) out.push({ uri: t.uri, name: t.name, by: (t.artists || []).map(a => a.name).join(', '), isrc: (t.external_ids && t.external_ids.isrc) || '' }); }); // (isrc: para buscar su compás)
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
  SP.block = key; SP.resume = false; SP.want = 'block'; // (lo que quedara en cola de la ronda —pausar la del bloque anterior o seguirla—, ya no)
  // la que sonaba (la del bloque anterior, que ha seguido en el descanso) se va bajando y la del bloque entra subiendo
  spDo(async () => { const v0 = spVolNow(), fade = SP_FADE.in > 0; if (spPlaying()) await spFadeOut(v0); else if (fade) await spVolTry(0); await spPlayTracks(tr); await spFadeIn(v0); });
  return true;
}
// Fundidos: la canción no se corta de golpe. En las gafas el volumen se cambia en su reproductor (suave, en 20 pasos);
// en otro dispositivo, por la Web API en pocos pasos (cada uno es una petición). Si el reproductor no deja cambiar el
// volumen, sin fundido. El volumen elegido (SP.cfg.vol) no se toca: se vuelve a él
const SP_FADE = { out: 2500, in: 1500 };
const spWait = ms => new Promise(r => setTimeout(r, ms));
const spCanFade = () => spConnected() && !(SP.st && SP.st.device && SP.st.device.supports_volume === false && !spHereNow());
async function spVolTry(v) { if (!spCanFade()) return; try { if (spHereNow() && SPP.player && SPP.player.setVolume) await SPP.player.setVolume(v / 100); else await spApi('PUT', '/me/player/volume?volume_percent=' + Math.round(v)); if (SP.st && SP.st.device) SP.st.device.volume_percent = Math.round(v); } catch (e) { /* sin fundido */ } }
// (un fundido nuevo deja a medias el anterior: nunca hay dos peleándose por el volumen; devuelve si llegó al final)
async function spFade(from, to, ms) { const id = SP.fadeN = (SP.fadeN || 0) + 1; if (!spCanFade() || !(ms > 0)) return true; /* (0: sin fundido) */ const n = spHereNow() && SPP.player && SPP.player.setVolume ? 20 : 5; for (let i = 1; i <= n; i++) { if (SP.fadeN !== id) return false; await spVolTry(from + (to - from) * i / n); await spWait(ms / n); } return SP.fadeN === id; }
const spFadeOut = (v0, ms = SP_FADE.out) => spFade(v0, 0, ms);
const spFadeIn = (v0, ms = SP_FADE.in) => spFade(0, v0, ms);
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
    // con fundido: al pausar, baja poco a poco (y, ya en pausa, vuelve a su volumen); al seguir, entra subiendo
    const v0 = spVolNow();
    try {
      const fade = SP_FADE.out > 0;
      if (want === 'pause') { const done = await spFadeOut(v0); if (SP.want !== want || !done) { if (done && fade) await spVolTry(v0); return; } await spApi('PUT', '/me/player/pause'); if (fade) await spVolTry(v0); }
      else { if (SP_FADE.in > 0) await spVolTry(0); await spApi('PUT', '/me/player/play'); await spFadeIn(v0); }
      if (SP.st) SP.st.is_playing = want === 'play'; SP.err = '';
    } catch (e) { SP.err = spErrText(e); await spVolTry(v0); }
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
// pregunta por si acaso y, si no, a los servicios de fuera (spFindBpm). Sin el instante de los pulsos, se cuentan desde el
// principio de la canción (casi siempre empieza en un pulso); «Encajar el pulso» lo afina. Devuelve null si nadie lo sabe
async function spTempo() {
  const st = await spApi('GET', '/me/player'), it = st && st.item; if (!it || !it.id) throw new Error('NO_DEVICE');
  const start = performance.now() / 1000 - (st.progress_ms || 0) / 1000;
  const known = spTrackBpm(it.uri); if (known.b) return { bpm: known.b, beat0: start, id: it.id, src: known.src };
  try { const a = await spApi('GET', '/audio-analysis/' + it.id); if (a && a.track && a.track.tempo) { spBpmCache(it.uri, a.track.tempo, 'sp'); return { bpm: a.track.tempo, beat0: a.beats && a.beats.length ? start + a.beats[0].start : start, id: it.id, src: 'sp' }; } } catch (e) { /* sin permiso */ }
  try { const f = await spApi('GET', '/audio-features/' + it.id); if (f && f.tempo) { spBpmCache(it.uri, f.tempo, 'sp'); return { bpm: f.tempo, beat0: start, id: it.id, src: 'sp' }; } } catch (e) { /* sin permiso */ }
  const r = await spFindBpm(spTrackInfo(it)); return r.b ? { bpm: r.b, beat0: start, id: it.id, src: r.src } : null;
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
// Lo que hace falta para buscar una canción fuera: su código ISRC (lo da Spotify), el ID de Spotify, artista y título
const spTrackInfo = t => ({ uri: t.uri, isrc: t.isrc || (t.external_ids && t.external_ids.isrc) || '', artist: t.artist || (t.artists && t.artists[0] ? t.artists[0].name : String(t.by || '').split(',')[0].trim()), name: t.name || '' });
// Deezer: por el código ISRC y, si no, buscando por artista y título (en bastantes canciones el BPM viene a 0: no lo sabe)
async function dzBpm(t) {
  const bpmOf = async id => { const x = await jsonp('https://api.deezer.com/track/' + id); return x && x.bpm > SP_BPM_MIN ? x.bpm : 0; };
  if (t.isrc) try { const b = await bpmOf('isrc:' + encodeURIComponent(t.isrc)); if (b) return b; } catch (e) { /* no está */ }
  if (!t.name) return 0;
  try {
    const r = await jsonp('https://api.deezer.com/search?limit=3&q=' + encodeURIComponent(`artist:"${t.artist}" track:"${t.name}"`));
    for (const x of (r && r.data) || []) { const b = await bpmOf(x.id); if (b) return b; }
  } catch (e) { /* sin conexión */ }
  return 0;
}
// ReccoBeats: el tempo con el ID de Spotify, de 40 en 40, sin clave. Si no responde (sin conexión o el navegador no deja
// leerlo), no se le vuelve a preguntar en lo que queda de sesión; si pide calma (429), se deja para luego
const RB = { off: false, wait: 0 };
async function rbBpms(uris) {
  const ids = uris.map(u => String(u).split(':')[2]).filter(Boolean), out = {};
  if (RB.off || !ids.length || typeof fetch !== 'function' || Date.now() < RB.wait) return out;
  for (let i = 0; i < ids.length; i += 40) {
    const part = ids.slice(i, i + 40); let r, j;
    try { r = await fetch('https://api.reccobeats.com/v1/audio-features?ids=' + part.join(','), { headers: { Accept: 'application/json' } }); }
    catch (e) { RB.off = true; return out; }
    if (r.status === 429) { RB.wait = Date.now() + 1000 * (+(r.headers && r.headers.get && r.headers.get('Retry-After')) || 30); return out; }
    if (!r.ok) continue;
    try { j = await r.json(); } catch (e) { continue; }
    const L = Array.isArray(j) ? j : (j && (j.content || j.data || j.audio_features)) || [];
    for (const x of L) {
      if (!x || !(x.tempo > SP_BPM_MIN)) continue;
      const sid = part.find(id => (x.href && String(x.href).includes(id)) || x.id === id || x.spotifyId === id) || (part.length === 1 && L.length === 1 ? part[0] : null);
      if (sid) out['spotify:track:' + sid] = x.tempo;
    }
  }
  return out;
}
const BPM_SRC = { dz: dzBpm, rb: rbBpms }; // (las pruebas los cambian por unos falsos)
const BPM_NAME = { dz: 'Deezer', rb: 'ReccoBeats', sp: 'Spotify' };
// Lo encontrado fuera se guarda por canción (no hace falta que viaje con el código: se vuelve a buscar). Lo que no se
// encontró se vuelve a probar al cabo de un mes. bpmAuto: { uri: [bpm, fuente, cuándo] } (bpm 0: no se encontró)
const SP_AUTO_MAX = 2000, SP_RETRY = 30 * 864e5;
function spBpmCache(uri, bpm, src) {
  const A = SP.cfg.bpmAuto || (SP.cfg.bpmAuto = {}); delete A[uri];
  bpm = Math.round(+bpm || 0); A[uri] = [bpm >= SP_BPM_MIN && bpm <= SP_BPM_TOP ? bpm : 0, src || '', Date.now()];
  const ks = Object.keys(A); for (let i = 0; i < ks.length - SP_AUTO_MAX; i++) delete A[ks[i]];
  spSave();
}
const spAutoBpm = uri => { const a = uri && (SP.cfg.bpmAuto || {})[uri]; return a ? { b: a[0] || 0, src: a[1], tried: a[0] > 0 || Date.now() - a[2] < SP_RETRY } : { b: 0, src: '', tried: false }; };
// El compás que vale para una canción: el tuyo o, si no, el encontrado fuera
const spTrackBpm = uri => { const own = spSongBpm(uri); if (own) return { b: own, src: 'own' }; const a = spAutoBpm(uri); return { b: a.b, src: a.src }; };
// Busca el compás de una canción: Deezer y, si no lo sabe, ReccoBeats; lo guarda (también si nadie lo sabe)
async function spFindBpm(t) {
  const a = spAutoBpm(t.uri); if (a.tried) return a;
  let b = 0, src = '';
  try { b = await BPM_SRC.dz(t); if (b) src = 'dz'; } catch (e) { /* sin conexión */ }
  if (!b) { try { b = (await BPM_SRC.rb([t.uri]))[t.uri] || 0; if (b) src = 'rb'; } catch (e) { /* no responde */ } }
  if (b || !RB.off) spBpmCache(t.uri, b, src); // (si ReccoBeats no respondía, no se da por buscada: se probará otra vez)
  return { b: Math.round(b) || 0, src };
}
// Al abrir una lista (en la página, en la música de un bloque o en el juego) se buscan los compases que falten, poco a
// poco: primero Deezer, una a una; las que no sepa, a ReccoBeats de 40 en 40. Lo que se va sabiendo aparece al momento
const BPMQ = { list: [], busy: false, seen: new Set() };
function spBpmPrefetch(T) {
  for (const t of T || []) if (t && t.uri && !BPMQ.seen.has(t.uri) && !spSongBpm(t.uri) && !spAutoBpm(t.uri).tried) { BPMQ.seen.add(t.uri); BPMQ.list.push(spTrackInfo(t)); }
  if (!BPMQ.busy && BPMQ.list.length) spBpmRun();
}
async function spBpmRun() {
  BPMQ.busy = true; const miss = [];
  try {
    while (BPMQ.list.length) {
      const t = BPMQ.list.shift(); let b = 0;
      try { b = await BPM_SRC.dz(t); } catch (e) { /* sin conexión */ }
      if (b) { spBpmCache(t.uri, b, 'dz'); spBpmShow(); } else miss.push(t.uri);
      if (miss.length >= 40 || (!BPMQ.list.length && miss.length)) {
        const batch = miss.splice(0), got = await BPM_SRC.rb(batch).catch(() => ({}));
        for (const u of batch) if (got[u]) spBpmCache(u, got[u], 'rb'); else if (!RB.off) spBpmCache(u, 0, ''); // (si ReccoBeats no respondía, otra vez será)
        spBpmShow();
      }
      await new Promise(r => setTimeout(r, 250)); // (sin agobiar a Deezer: unas 4 por segundo)
    }
  } finally { BPMQ.busy = false; }
}
// Lo encontrado, a la vista (sin redibujar mientras escribes un compás)
function spBpmShow() {
  clearTimeout(BPMQ.t); BPMQ.t = setTimeout(() => {
    const a = typeof document !== 'undefined' && document.activeElement; if (a && a.classList && a.classList.contains('spbpm')) { spBpmShow(); return; }
    spListsPage(); if (SES.musicOpen >= 0) renderSession(); if (menu && menu.spTrk && menu.rebuild) menu.rebuild();
  }, 600);
}
// Compás propio de cada canción: lo guardas tú (en la página, junto a cada canción, o en el juego, «Guardar el ritmo para
// esta canción») y, cuando suena, manda sobre todo. Pasa por el código
const SP_BPM_MAX = 500, SP_BPM_MIN = 40, SP_BPM_TOP = 200;
const spSongBpm = uri => { const b = uri && (SP.cfg.bpms || {})[uri]; return b >= SP_BPM_MIN && b <= SP_BPM_TOP ? b : 0; };
function spSongBpmSet(uri, bpm) {
  const B = Object.assign({}, SP.cfg.bpms); bpm = Math.round(+bpm);
  delete B[uri]; if (bpm >= SP_BPM_MIN && bpm <= SP_BPM_TOP) B[uri] = bpm; // (la última, al final: si hay demasiadas, se va la más antigua)
  const ks = Object.keys(B); for (let i = 0; i < ks.length - SP_BPM_MAX; i++) delete B[ks[i]];
  SP.cfg.bpms = B; spSave();
  const it = SP.st && SP.st.item; if (it && it.uri === uri) { SP.tempoId = null; spAutoTempo(); } // (si suena ahora, ya)
}
// ×2 o ÷2: a veces los servicios dan el doble o la mitad del tempo de verdad; el resultado pasa a ser tuyo
function spBpmScale(uri, k) { const v = spTrackBpm(uri).b; if (v) spSongBpmSet(uri, clamp(Math.round(v * k), SP_BPM_MIN, SP_BPM_TOP)); }
// «Ritmo de cada canción» (activado si no lo quitaste): con cada canción, su compás (el tuyo o el encontrado fuera)
const spAuto = () => SP.cfg.autoBpm !== false;
// Al cambiar de canción: con su compás guardado (el tuyo, siempre; el encontrado fuera, con el ritmo de cada canción), ese
// (contado desde el principio de la canción: «Encajar el pulso» lo afina); sin él, se busca y, si nadie lo sabe, vuelve el
// que tenías antes
function spSongTempoSet(b, src) {
  if (!SP.songOn) { SP.songOn = true; SP.baseBpm = settings.bpm; }
  setSetting('bpm', b); TCH.beat0 = perfNow() - ((SP.st && SP.st.progress_ms) || 0) / 1000; if (typeof BEAT !== 'undefined') BEAT.off = null;
  if (state === 'play' || state === 'rest' || (menu && menu.music !== null)) say(`Ritmo de esta canción: ${b} BPM (${src === 'own' ? 'el tuyo' : BPM_NAME[src] || 'encontrado'})`, '#ffd166', 2.5);
  if (menu && menu.rebuild && !menu.keypad) menu.rebuild();
}
function spSongTempoOff() { if (SP.songOn) { SP.songOn = false; setSetting('bpm', SP.baseBpm || 0); if (menu && menu.rebuild && !menu.keypad) menu.rebuild(); } }
function spAutoTempo() {
  const it = SP.st && SP.st.item; if (!it || !it.id || it.id === SP.tempoId || SP.tempoBusy) return;
  SP.tempoId = it.id; const own = spSongBpm(it.uri);
  if (own) { spSongTempoSet(own, 'own'); return; }
  if (!spAuto()) { spSongTempoOff(); return; }
  const a = spAutoBpm(it.uri);
  if (a.b) { spSongTempoSet(a.b, a.src); return; }
  if (a.tried) { spSongTempoOff(); return; }
  SP.tempoBusy = true; const id = it.id;
  spTempo().then(r => { const cur = SP.st && SP.st.item; if (!cur || cur.id !== id) return; if (r) { spSongTempoSet(Math.round(r.bpm), r.src); TCH.beat0 = r.beat0; } else spSongTempoOff(); })
    .catch(() => {}).finally(() => { SP.tempoBusy = false; spBpmShow(); });
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
    spBpmPrefetch(T); // (los compases que falten, poco a poco)
    const N = 8, pages = Math.max(1, Math.ceil(T.length / N)), p = clamp(page, 0, pages - 1), F = spFavs(), TF = spFavFirst(T); // (tus favoritas, primero y con ★)
    rows.push({ t: 'text', text: T.length ? 'Toca una canción para que la lista empiece por ella' : 'Esta lista no tiene canciones que se puedan poner', color: '#a49fc8' });
    for (const t of TF.slice(p * N, p * N + N)) rows.push({ t: 'btns', items: [{ label: `${F.has(t.uri) ? '★ ' : ''}${t.name}${t.by ? ' — ' + t.by : ''}${spBpmTag(t.uri)}`, onPress: () => spDo(async () => { if (!l.liked) return spPlayList(l, t.uri, false); const k = T.indexOf(t); await spPlayTracks(T.slice(k).concat(T.slice(0, k))); SP.block = null; }) }] });
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
// El reproductor pequeño del menú principal: todo junto en un cuadrado. Arriba, un rótulo que se desplaza con lo que suena
// (sin tener que enseñarlo entero de una vez); debajo, anterior, play/pausa y siguiente, y bajar y subir el volumen
const MARQ = { p: null, text: '', x: 0, t: 0 };
function spPlayerRows() {
  if (!spConnected()) return [];
  if (Date.now() - SP.lastRef > 3000) SP.pollT = 0;
  const it = SP.st && SP.st.item; MARQ.text = SP.err || (it ? `♪ ${it.name}${it.artists ? ' — ' + it.artists.map(a => a.name).join(', ') : ''}` : 'Spotify: no suena nada'); MARQ.col = SP.err ? '#ff8a3d' : '#a68bff';
  return [{ t: 'canvas', h: 0.04, draw: (c, x, y, w, h) => { rr(c, x, y, w, h, h * 0.3); c.fillStyle = 'rgba(166,139,255,0.12)'; c.fill(); },
      mount: (group, x0, cy, cw, h) => { const P = makePanel(cw - 0.012, h - 0.008, 512); P.mesh.position.set(x0 + cw / 2, cy, 0.002); P.mesh.renderOrder = RO.widget; group.add(P.mesh); MARQ.p = P; MARQ.x = 0; MARQ.t = 0; spMarqDraw(); } },
    { t: 'btns', h: 0.05, items: [{ label: 'Anterior', icon: 'prev', onPress: spPrev }, { label: spPlaying() ? 'Pausa' : 'Play', icon: spPlaying() ? 'pause' : 'play', style: 'primary', onPress: spToggle }, { label: 'Siguiente', icon: 'next', onPress: spNext }] },
    { t: 'btns', h: 0.05, items: [{ label: 'Vol −', icon: 'voldown', onPress: () => spVol(-10) }, { label: 'Vol +', icon: 'volup', onPress: () => spVol(10) }] }];
}
function spMarqDraw() {
  const P = MARQ.p, c = P.ctx, W = P.W, H = P.H; c.clearRect(0, 0, W, H);
  c.font = `600 ${Math.round(H * 0.62)}px ${FB}`; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillStyle = MARQ.col || '#a68bff';
  const tw = c.measureText(MARQ.text).width, gap = W * 0.25;
  if (tw <= W * 0.96) c.fillText(MARQ.text, (W - tw) / 2, H / 2); // (si cabe, quieto y en medio)
  else { const x = -(MARQ.x % (tw + gap)); c.fillText(MARQ.text, x, H / 2); c.fillText(MARQ.text, x + tw + gap, H / 2); }
  P.tex.needsUpdate = true;
}
// (a unos 20 dibujos por segundo, y solo con el reproductor a la vista)
function spMarqStep(dt) {
  const P = MARQ.p; if (!P || !P.mesh.parent || !P.mesh.parent.parent) { MARQ.p = null; return; }
  MARQ.x += dt * P.W * 0.18; MARQ.t -= dt; if (MARQ.t > 0) return; MARQ.t = 0.05; spMarqDraw();
}
// En la columna de Sonido del principal: tus listas y, si suena en otro dispositivo, traerla a las gafas (los botones ya
// están en el reproductor)
function spListRows() {
  if (!spConnected()) return [];
  const here = spHereOk() && spPlaying() && !spHereNow() ? [{ t: 'btns', items: [{ label: 'Que suene en las gafas', style: 'primary', onPress: () => spDo(spToHere) }] }] : [];
  const L = spLists();
  return [...here, { t: 'btns', items: [...L.slice(0, 2).map(l => ({ label: l.name, onPress: () => spDo(() => spPlayLists([l])) })), ...(L.length > 1 ? [{ label: `Mezcladas (${L.length})`, onPress: () => spDo(() => spPlayLists(L)) }] : [])] },
    { t: 'btns', items: [{ label: 'Listas y canciones  ▸', accent: '#a68bff', onPress: () => { const b = menu && menu.rebuild; SP.loadErr = ''; spListMenu(b || (() => hideMenu())); } }] },
    ...(SPP.state === 'error' ? [{ t: 'text', text: SPP.err, color: '#ffd166' }] : [])].filter(r => r.t !== 'btns' || r.items.length);
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
// Canciones favoritas (★, las marcas tú, en RepArena: no tocan Spotify): al abrir una lista salen las primeras
const SP_FAV_MAX = 300;
const spFavs = () => new Set(SP.cfg.favs || []);
function spFavToggle(uri) { const F = (SP.cfg.favs || []).filter(u => u !== uri); if (F.length === (SP.cfg.favs || []).length) F.unshift(uri); SP.cfg.favs = F.slice(0, SP_FAV_MAX); spSave(); }
function spFavFirst(T) { const F = spFavs(); return F.size ? T.filter(t => F.has(t.uri)).concat(T.filter(t => !F.has(t.uri))) : T; }
// El compás de cada canción: el tuyo (escrito) o, en gris, el encontrado fuera («≈124»), que se cambia escribiendo encima;
// ×2 y ÷2 lo corrigen cuando un servicio da el doble o la mitad. Buscando: «…»; si nadie lo sabe: «—»
function spBpmCell(t) {
  const own = spSongBpm(t.uri), a = spAutoBpm(t.uri), v = own || a.b, ph = a.b ? '≈' + a.b : a.tried ? '—' : BPMQ.seen.has(t.uri) ? '…' : 'BPM';
  const tip = own ? 'Tu compás: cuando suene, el juego irá a este ritmo' : a.b ? `Encontrado en ${BPM_NAME[a.src] || 'otro servicio'}: ${a.b} BPM. Escribe otro para cambiarlo` : a.tried ? 'No se encontró: escríbelo tú (o márcalo en el juego «Al compás»)' : 'Su compás (BPM): se busca solo';
  return `<span class="spbpmc"><input type="number" class="spbpm${!own && a.b ? ' auto' : ''}" data-bpm="${escSp(t.uri)}" min="${SP_BPM_MIN}" max="${SP_BPM_TOP}" step="1" inputmode="numeric" placeholder="${ph}" value="${own || ''}" aria-label="Compás de ${escSp(t.name)} (BPM)" title="${escSp(tip)}">${v ? `<button type="button" class="spx" data-a="bpmx" data-bpmx="2" data-u="${escSp(t.uri)}" title="El doble (${Math.min(SP_BPM_TOP, v * 2)})">×2</button><button type="button" class="spx" data-a="bpmx" data-bpmx="0.5" data-u="${escSp(t.uri)}" title="La mitad (${Math.max(SP_BPM_MIN, Math.round(v / 2))})">÷2</button>` : ''}</span>`;
}
// en el juego, junto al nombre: « · 128 BPM» (el tuyo) o « · ≈124 BPM» (encontrado)
const spBpmTag = uri => { const k = spTrackBpm(uri); return k.b ? ` · ${k.src === 'own' ? '' : '≈'}${k.b} BPM` : ''; };
const spFavBtn = (uri, F) => `<button type="button" class="spfav${F.has(uri) ? ' on' : ''}" data-a="fav" data-fav="${escSp(uri)}" aria-pressed="${F.has(uri)}" aria-label="Favorita" title="${F.has(uri) ? 'Quitar de favoritas' : 'Favorita: sale la primera al abrir la lista'}">★</button>`;
function spListsPage() {
  const host = $('#spLists'); if (!host) return;
  const chosen = new Set(spLists().map(l => l.id)), P = spPicks(), on = new Set(P.map(t => t.uri)), open = SP.openList;
  let h = P.length ? `<div class="sppicks"><b>Canciones elegidas (${P.length})</b>: suenan ellas, en este orden y en bucle.<div class="chips">${P.map((t, k) => `<span class="chip">${k + 1}. ${escSp(t.name)}<button class="btn tiny" data-sp="rm" data-k="${k}" aria-label="Quitar ${escSp(t.name)}">✕</button></span>`).join('')}<button class="btn small" data-sp="clear">Quitar todas</button></div></div>` : '';
  if (open) { // dentro de una lista: solo sus canciones
    const l = spPickable().find(x => x.id === open) || { name: '' }, T = SP.trk && SP.trk[open];
    h += `<div class="spin"><button class="btn small" data-sp="back">← Tus listas</button><b>${escSp(l.name)}</b></div>`;
    const F = spFavs(); if (T) spBpmPrefetch(T); // (las favoritas, primero; ★ las marca; los compases que falten, se buscan)
    h += T ? (T.length ? `<div class="sptracks">${spFavFirst(T).map(t => `<div class="sptrk">${spFavBtn(t.uri, F)}<label><input type="checkbox" data-trk="${escSp(t.uri)}" ${on.has(t.uri) ? 'checked' : ''}><span>${escSp(t.name)}<small> — ${escSp(t.by)}</small></span></label>${spBpmCell(t)}</div>`).join('')}</div>` : '<p class="hint">Aquí no hay canciones que se puedan poner.</p>') : `<p class="status">${escSp(SP.trkErr || 'Cargando sus canciones…')}</p>`;
  } else { // tus listas (y las canciones que te gustan): la casilla pone la lista entera; «Abrir» enseña sus canciones
    const L = SP.mine ? spPickable() : spLists();
    h += L.map(l => `<div class="sprow">${l.liked ? `<span class="lname">${escSp(l.name)}</span>` : `<label><input type="checkbox" data-id="${l.id}" ${chosen.has(l.id) ? 'checked' : ''}><span>${escSp(l.name)}</span></label>`}<button class="btn tiny" data-sp="open" data-id="${l.id}">Abrir ▸</button></div>`).join('');
  }
  host.innerHTML = h;
  if (!host.querySelectorAll || host.dataset.wired) return; host.dataset.wired = '1';
  host.addEventListener('change', ev => {
    const el = ev.target;
    if (el.dataset.bpm !== undefined) { spSongBpmSet(el.dataset.bpm, el.value); renderSession(); return; }
    if (el.dataset.id) { const on2 = new Set([...host.querySelectorAll('input[data-id]:checked')].map(x => x.dataset.id)), all2 = SP.mine || spLists(); SP.cfg.lists = all2.filter(l => on2.has(l.id) || (!host.querySelector(`input[data-id="${l.id}"]`) && spLists().some(x => x.id === l.id))).map(l => ({ id: l.id, name: l.name, uri: l.uri })); }
    else if (el.dataset.trk) { const T = (SP.trk && SP.trk[SP.openList]) || [], t = T.find(x => x.uri === el.dataset.trk); if (!t) return; const P2 = spPicks(); SP.cfg.picks = el.checked ? (P2.some(x => x.uri === t.uri) || P2.length >= 100 ? P2 : P2.concat({ uri: t.uri, name: t.name, by: t.by })) : P2.filter(x => x.uri !== t.uri); spListsPage(); }
    SP.started = false; spSave(); spMenuSync();
  });
  host.addEventListener('click', ev => {
    const f = ev.target.closest && ev.target.closest('button[data-fav]'); if (f) { spFavToggle(f.dataset.fav); spListsPage(); renderSession(); return; }
    const x = ev.target.closest && ev.target.closest('button[data-bpmx]'); if (x) { spBpmScale(x.dataset.u, +x.dataset.bpmx); spListsPage(); renderSession(); return; }
    const b = ev.target.closest && ev.target.closest('button[data-sp]'); if (!b) return;
    if (b.dataset.sp === 'open') { const id = b.dataset.id; SP.openList = id; SP.trkErr = ''; spListsPage();
      if (!(SP.trk && SP.trk[id])) spListTracks(id).then(spListsPage).catch(e => { SP.trkErr = /NOT_YOURS|LIBRARY/.test(e.message) ? spErrText(e) : 'No se pudieron cargar sus canciones: ' + spErrText(e); spListsPage(); }); return; }
    if (b.dataset.sp === 'back') { SP.openList = null; spListsPage(); return; }
    if (b.dataset.sp === 'rm') SP.cfg.picks = spPicks().filter((_, k) => k !== +b.dataset.k); else if (b.dataset.sp === 'clear') SP.cfg.picks = [];
    SP.started = false; spSave(); spListsPage(); spMenuSync();
  });
}
