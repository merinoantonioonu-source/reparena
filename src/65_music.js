
/* =================== MÚSICA: SPOTIFY COMO MANDO A DISTANCIA =================== */
// La música suena en la app de Spotify (en las Quest o en el móvil) y el juego la controla con la Web API.
// Inicio de sesión con Authorization Code + PKCE, sin servidor. Hace falta Spotify Premium y una app propia
// creada en developer.spotify.com con esta página como Redirect URI.
const SP_KEY = 'reparena3-spotify', SP_PKCE = 'reparena3-spotify-pkce';
const SP_SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';
const SP = { cfg: store(SP_KEY) || {}, st: null, err: '', busy: false, pollT: 0, lastRef: 0 };
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
  SP.cfg.access = j.access_token; SP.cfg.exp = Date.now() + (j.expires_in || 3600) * 1000; if (j.refresh_token) SP.cfg.refresh = j.refresh_token; spSave();
}
// Vuelta desde Spotify con ?code=… (o ?error=…)
async function spHandleRedirect() {
  const q = new URLSearchParams(location.search || ''); if (!q.has('code') && !q.has('error')) return;
  const pk = store(SP_PKCE) || {}; store(SP_PKCE, {}); history.replaceState(null, '', spRedirect());
  if (q.get('error')) { spStatus('Spotify no dio permiso (' + q.get('error') + ').', true); return; }
  if (!pk.verifier || q.get('state') !== pk.state) { spStatus('La respuesta de Spotify no coincide. Vuelve a pulsar Conectar.', true); return; }
  try {
    await spTokenReq({ grant_type: 'authorization_code', code: q.get('code'), redirect_uri: spRedirect(), client_id: SP.cfg.clientId, code_verifier: pk.verifier });
    spStatus('Conectado. Pon algo a sonar en Spotify y pulsa Probar.'); spPage(); spRefresh();
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
async function spWake() { // sin reproductor activo: despierta el primero disponible
  const d = await spApi('GET', '/me/player/devices'), list = (d && d.devices) || [];
  if (!list.length) throw new Error('NO_DEVICE');
  await spApi('PUT', '/me/player', { device_ids: [(list.find(x => x.is_active) || list[0]).id], play: true });
}
function spToggle() { spDo(async () => { if (spPlaying()) { await spApi('PUT', '/me/player/pause'); SP.st.is_playing = false; } else if (SP.st && SP.st.device) { await spApi('PUT', '/me/player/play'); SP.st.is_playing = true; } else await spWake(); }); }
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
  return [{ t: 'text', text: spNowText(), color: SP.err ? '#ff8a3d' : '#3cf0c6', music: true },
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
  $('#btnSpOff').addEventListener('click', () => { SP.cfg = { clientId: SP.cfg.clientId }; SP.st = null; SP.err = ''; spSave(); spStatus('Desconectado.'); spPage(); });
  spPage();
  spHandleRedirect();
}
