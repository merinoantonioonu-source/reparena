/* =================== PASAR TUS DATOS A OTRO DISPOSITIVO (POR CÓDIGO) =================== */
// Sin servidor propio: en un dispositivo pulsas «Enviar» y sale un código de 8 cifras; en el otro lo escribes y se cargan
// tus ajustes, perfiles, bloques de sesión, favoritos, rangos, historial y la música elegida. Del código salen a la vez
// la clave (AES-GCM, derivada con PBKDF2) y el canal de un servicio público de mensajes (ntfy.sh) donde se dejan los datos
// cifrados unas horas: el servicio no puede leerlos y, sin el código, nadie sabe en qué canal están. Lo que depende de
// cada aparato (la habitación escaneada, los aparatos colocados, la sesión de Spotify) no se manda.
const XFER = { base: 'https://ntfy.sh', last: null, busy: false };
const XFER_KEYS = ['reparena3-settings', 'reparena3-combos', 'reparena3-profiles', 'reparena3-favs', 'reparena3-ui', 'reparena3-rankfit', 'reparena3-session', 'reparena3-sessions', 'reparena3-history', 'reparena3-arcghost', 'reparena3-spotify', 'reparena3-exsongs',
  'reparena3-career', 'reparena3-ghosts', 'reparena3-dev', 'reparena3-devon']; // (tu carrera, tus mejores rondas y la tabla y el modo del desarrollador, también)
const XFER_CHUNK = 3000; // (cada mensaje, por debajo de los 4 KB que admite el servicio sin adjuntos)
const XFER_HOURS = 12;
const _xEnc = new TextEncoder(), _xDec = new TextDecoder();
const xferHex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const xferB64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
const xferUnB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const xferCodeOk = c => /^\d{8}$/.test(String(c || '').replace(/\D/g, ''));
const xferFmt = c => String(c).replace(/\D/g, '').replace(/^(\d{4})(\d{4})$/, '$1 $2');
async function xferTopic(code) { return 'reparena-' + xferHex(await crypto.subtle.digest('SHA-256', _xEnc.encode('reparena-canal:' + code))).slice(0, 32); }
async function xferKey(code, salt = 'reparena-xfer-v1') {
  const base = await crypto.subtle.importKey('raw', _xEnc.encode(code), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: _xEnc.encode(salt), iterations: 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function xferZip(bytes, back) { // (comprimido si el navegador sabe; si no, tal cual)
  if (typeof CompressionStream === 'undefined') return null;
  const s = new Blob([bytes]).stream().pipeThrough(back ? new DecompressionStream('deflate-raw') : new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
// Cifrar y descifrar un paquete con el código: comprimido si se puede, AES-GCM, y en texto (base64)
async function xferSeal(code, obj, salt) {
  const plain = _xEnc.encode(JSON.stringify(obj)), zip = await xferZip(plain), body = zip || plain;
  const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await xferKey(code, salt), body));
  const all = new Uint8Array(13 + ct.length); all[0] = zip ? 1 : 0; all.set(iv, 1); all.set(ct, 13); return xferB64(all);
}
async function xferOpen(code, b64, salt) {
  const all = xferUnB64(b64);
  let body; try { body = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(1, 13) }, await xferKey(code, salt), all.slice(13))); } catch (e) { throw new Error('no se pudo descifrar: revisa el código'); }
  if (all[0] === 1) body = await xferZip(body, true);
  const p = JSON.parse(_xDec.decode(body)); if (!p || p.v !== 1 || !p.d) throw new Error('el envío no es de RepArena');
  return p;
}
// Lo que se manda: cada clave tal cual, salvo Spotify (solo tu app y la música elegida: el inicio de sesión es de cada aparato)
function xferPack() {
  const d = {};
  for (const k of XFER_KEYS) {
    let v = store(k); if (v === null || v === undefined) continue;
    if (k === 'reparena3-spotify') { const { clientId, lists, picks, favs, bpms } = v; v = { clientId, lists, picks, favs, bpms }; }
    d[k] = v;
  }
  return { v: 1, at: Date.now(), from: xrActive ? 'gafas' : 'navegador', d };
}
function xferSummary(p) {
  const d = p.d || {}, prof = (d['reparena3-profiles'] || []).length, ses = ((d['reparena3-session'] || {}).blocks || []).length, hist = (d['reparena3-history'] || []).length;
  const sv = (d['reparena3-sessions'] || []).length;
  return `${prof} ${prof === 1 ? 'perfil' : 'perfiles'} · ${ses} ${ses === 1 ? 'bloque' : 'bloques'} de sesión · ${sv} ${sv === 1 ? 'sesión guardada' : 'sesiones guardadas'} · ${hist} ${hist === 1 ? 'partida' : 'partidas'} en el historial · ajustes`;
}
// Enviar: devuelve el código
async function xferSend() {
  const rnd = crypto.getRandomValues(new Uint32Array(2)), code = String(rnd[0] % 100000000).padStart(8, '0');
  const b64 = await xferSeal(code, xferPack()), n = Math.ceil(b64.length / XFER_CHUNK), id = xferHex(crypto.getRandomValues(new Uint8Array(4))), topic = await xferTopic(code);
  for (let i = 0; i < n; i++) {
    const r = await fetch(`${XFER.base}/${topic}`, { method: 'POST', body: `RA1|${id}|${i}|${n}|${b64.slice(i * XFER_CHUNK, (i + 1) * XFER_CHUNK)}` }); // (sin cabeceras propias: así el navegador no tiene que preguntar antes)
    if (!r.ok) throw new Error('el servicio respondió ' + r.status);
  }
  XFER.last = { code, t: Date.now() }; return code;
}
// Recibir: busca en el canal del código el último envío completo y lo descifra (no aplica nada todavía)
async function xferFetch(code) {
  code = String(code).replace(/\D/g, ''); if (!xferCodeOk(code)) throw new Error('el código tiene 8 cifras');
  const topic = await xferTopic(code), r = await fetch(`${XFER.base}/${topic}/json?poll=1&since=${XFER_HOURS}h`);
  if (!r.ok) throw new Error('el servicio respondió ' + r.status);
  const sets = new Map(); let lastId = null;
  for (const line of (await r.text()).split('\n')) {
    let m; try { m = JSON.parse(line); } catch (e) { continue; }
    if (!m || m.event !== 'message' || typeof m.message !== 'string' || !m.message.startsWith('RA1|')) continue;
    const [, id, i, n, part] = m.message.split('|'); if (!sets.has(id)) sets.set(id, { n: +n, parts: [] });
    sets.get(id).parts[+i] = part; lastId = id;
  }
  // el más reciente que esté entero
  const ids = [...sets.keys()].reverse(); let got = null;
  for (const id of [lastId, ...ids]) { const s = id && sets.get(id); if (s && s.parts.filter(x => x !== undefined).length === s.n) { got = s.parts.join(''); break; } }
  if (!got) throw new Error(sets.size ? 'el envío llegó incompleto: vuelve a enviarlo' : 'no hay nada con ese código (¿caducó? duran ' + XFER_HOURS + ' h)');
  return xferOpen(code, got);
}
// Dos historiales en uno, sin repetir partidas (las 400 últimas)
const histMerge = (a, b) => { const seen = new Set(a.map(r => `${r.date}|${r.ex}|${r.reps}`)); return a.concat((b || []).filter(r => r && !seen.has(`${r.date}|${r.ex}|${r.reps}`))).sort((x, y) => (x.date || 0) - (y.date || 0)).slice(-400); };
// Cargar lo recibido: sustituye lo de este aparato (el historial se junta, sin repetir partidas; de Spotify se conserva el
// inicio de sesión de aquí) y vuelve a empezar la página para que todo lo lea
function xferApply(p, reload = true, merged = false) {
  for (const k of XFER_KEYS) {
    const v = p.d[k]; if (v === undefined) continue;
    if (k === 'reparena3-history' && !merged) {
      store(k, histMerge(store(k) || [], v));
    } else if (k === 'reparena3-spotify') store(k, Object.assign({}, store(k) || {}, v.clientId ? { clientId: v.clientId } : {}, v.lists ? { lists: v.lists } : {}, v.picks ? { picks: v.picks } : {}, v.favs ? { favs: v.favs } : {}, v.bpms ? { bpms: v.bpms } : {}));
    else store(k, v);
  }
  if (reload) setTimeout(() => location.reload(), 300);
}

/* ---------- Sincronización automática: un código fijo y Firebase ---------- */
// El código fijo (16 cifras) se crea en un aparato y se escribe una vez en el otro; los dos lo recuerdan. Cada aparato
// deja sus datos cifrados en una Realtime Database de Firebase (por su API web, sin librerías) a los pocos segundos de
// cambiar algo (acabar una ronda, tocar un ajuste…). Al abrir la página, al volver a ella y al entrar en las gafas, si el
// otro aparato tiene datos más recientes, pregunta si importarlos. Firebase solo guarda algo ilegible en un hueco cuyo
// nombre sale del código (y sus reglas no dejan listar nada). Al subir se juntan las partidas de los dos: el historial no
// pierde nada aunque se diga «Ahora no»; lo demás (ajustes, perfiles, rangos, carrera) es el del que cambió lo último
const SYNC_DB = 'https://reparena-62309-default-rtdb.europe-west1.firebasedatabase.app'; // (la Realtime Database del proyecto «reparena»; vacía: sin sincronización)
const SYNC = { db: SYNC_DB, t: null, busy: false, applying: false, ready: false, salt: 'reparena-sync-v1', key: 'reparena3-sync' };
const syncSt = () => store(SYNC.key) || {}; // (lo de este aparato, que no viaja: el código, quién es y cuándo cambió o subió algo)
const syncSet = o => store(SYNC.key, Object.assign(syncSt(), o));
const syncOn = () => !!(SYNC.db && syncSt().code);
const syncCodeOk = c => /^\d{16}$/.test(String(c || '').replace(/\D/g, ''));
const syncFmt = c => String(c).replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');
function syncDev() { const s = syncSt(); if (!s.dev) { s.dev = xferHex(crypto.getRandomValues(new Uint8Array(6))); store(SYNC.key, s); } return s.dev; }
const syncWho = () => { const u = (typeof navigator !== 'undefined' && navigator.userAgent) || ''; return /OculusBrowser|Quest/i.test(u) ? 'las gafas' : /Mobi|Android|iPhone|iPad/i.test(u) ? 'el móvil' : 'el ordenador'; };
function syncWhen(at) {
  const d = new Date(at), n = new Date(), hm = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }), days = Math.round((new Date(n.toDateString()) - new Date(d.toDateString())) / 864e5);
  return days === 0 ? `hoy a las ${hm}` : days === 1 ? `ayer a las ${hm}` : `el ${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} a las ${hm}`;
}
async function syncUrl(sub = '') { return `${SYNC.db.replace(/\/+$/, '')}/sync/${xferHex(await crypto.subtle.digest('SHA-256', _xEnc.encode('reparena-sync:' + syncSt().code)))}${sub}.json`; }
async function syncGet(sub) { const r = await fetch(await syncUrl(sub)); if (!r.ok) throw new Error('Firebase respondió ' + r.status); return r.json(); }
// Cada ajuste lleva su hora: al guardar algo que viaja, se apunta la de cada campo que cambió (en los ajustes, cada ajuste;
// en lo que no es una ficha de campos, como los perfiles o el historial, la clave entera) y, con un código, sube a los 4 s.
// Así, al juntar lo de los dos aparatos, de cada ajuste gana el que se cambió más tarde, venga de donde venga: un ajuste
// tocado en el PC no se pierde porque luego juegues en las gafas sin importar. Lo que la página guarda sola al cargarse
// (las misiones del día, los ajustes recolocados…) no cuenta: si no, al abrirla siempre parecería lo más nuevo (SYNC.ready)
const syncIsObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const syncParse = raw => { try { return JSON.parse(raw); } catch (e) { return null; } };
function syncTouch(k, oldRaw) {
  if (SYNC.applying || !SYNC.ready || !XFER_KEYS.includes(k)) return;
  const raw = localStorage.getItem(k); if (raw === oldRaw) return;
  const now = Date.now(), st = syncSt(), kt = st.kt || (st.kt = {}), T = kt[k] || (kt[k] = {}), nv = syncParse(raw), ov = syncParse(oldRaw);
  if (k !== 'reparena3-history' && syncIsObj(nv) && syncIsObj(ov)) { let any = false; for (const f of new Set([...Object.keys(nv), ...Object.keys(ov)])) if (JSON.stringify(nv[f]) !== JSON.stringify(ov[f])) { T[f] = now; any = true; } if (!any) return; }
  else T['*'] = now;
  st.at = now; store(SYNC.key, st); if (syncOn()) { clearTimeout(SYNC.t); SYNC.t = setTimeout(() => syncPush().catch(() => {}), 4000); }
}
storeHook = syncTouch;
const syncFt = (T, f) => Math.max((T && T[f]) || 0, (T && T['*']) || 0); // (la hora de un campo: la suya o la de la clave entera)
const syncKt = T => Math.max(0, ...Object.values(T || {}));
// Juntar lo de aquí (L) y lo de allí (R), cada uno { d: datos, kt: horas }: el historial, sumado; en las fichas de campos
// (los ajustes…), cada campo del lado que lo cambió más tarde; lo demás, entero del lado más reciente. Empate: lo de aquí,
// salvo al importar (preferR), que es lo que se ha pedido
function syncMerge(L, R, preferR = false) {
  const d = {}, kt = {}, Ld = L.d || {}, Rd = R.d || {};
  const pick = (ta, tb) => tb > ta || (tb === ta && preferR);
  for (const k of new Set([...Object.keys(Ld), ...Object.keys(Rd)])) {
    const a = Ld[k], b = Rd[k], A = (L.kt || {})[k] || {}, B = (R.kt || {})[k] || {}, T = kt[k] = {};
    if (k === 'reparena3-history') { d[k] = histMerge(a || [], b || []); T['*'] = Math.max(syncKt(A), syncKt(B)); continue; }
    if (b === undefined) { d[k] = a; Object.assign(T, A); continue; }
    if (a === undefined) { d[k] = b; Object.assign(T, B); continue; }
    if (syncIsObj(a) && syncIsObj(b)) {
      const o = {}; for (const f of new Set([...Object.keys(a), ...Object.keys(b)])) { const ta = syncFt(A, f), tb = syncFt(B, f), src = pick(ta, tb) ? b : a; if (f in src) o[f] = src[f]; if (ta || tb) T[f] = Math.max(ta, tb); }
      d[k] = o;
    } else { const ta = syncKt(A), tb = syncKt(B); d[k] = pick(ta, tb) ? b : a; if (ta || tb) T['*'] = Math.max(ta, tb); }
  }
  return { d, kt };
}
// Lo que trae lo de allí que aquí aún no está: ajustes más nuevos, otras cosas más nuevas y partidas que faltan
function syncNews(L, R) {
  const Ld = L.d || {}, Rd = R.d || {}, fresh = !syncKt(Object.assign({}, ...Object.values(L.kt || {}))); // (aquí nunca se ha apuntado nada: todo lo de allí vale)
  let sets = 0, other = 0, games = 0;
  for (const k of Object.keys(Rd)) {
    const a = Ld[k], b = Rd[k], A = (L.kt || {})[k] || {}, B = (R.kt || {})[k] || {};
    if (k === 'reparena3-history') { const seen = new Set((a || []).map(r => `${r.date}|${r.ex}|${r.reps}`)); games += (b || []).filter(r => r && !seen.has(`${r.date}|${r.ex}|${r.reps}`)).length; continue; }
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (syncIsObj(a) && syncIsObj(b)) { for (const f of new Set([...Object.keys(a), ...Object.keys(b)])) if (JSON.stringify(a[f]) !== JSON.stringify(b[f]) && (fresh || syncFt(B, f) > syncFt(A, f))) { if (k === STORE_KEY) sets++; else other++; } }
    else if (a === undefined || fresh || syncKt(B) > syncKt(A)) other++;
  }
  return sets || other || games ? { sets, other, games } : null;
}
const syncLocal = () => ({ d: xferPack().d, kt: syncSt().kt || {} });
async function syncRemote() { const cur = await syncGet(); if (!cur || !cur.blob) return null; const o = await xferOpen(syncSt().code, cur.blob, SYNC.salt); return { meta: cur.meta || {}, d: o.d, kt: o.kt || {} }; }
// Subir: lo de aquí junto con lo de allí (de cada ajuste, el más reciente; las partidas de los dos)
async function syncPush() {
  if (!syncOn() || SYNC.busy) return false; SYNC.busy = true;
  try {
    const st = syncSt(), dev = syncDev(), L = syncLocal(); let M = L;
    try { const R = await syncRemote(); if (R) M = syncMerge(L, R); } catch (e) { /* (otro código o datos rotos: se sobrescribe) */ }
    const ver = Date.now(), at = Math.max(st.at || 0, ...Object.values(M.kt).map(syncKt)) || ver;
    const meta = { ver, at, dev, from: syncWho(), n: (M.d['reparena3-history'] || []).length };
    const blob = await xferSeal(st.code, { v: 1, at, from: syncWho(), d: M.d, kt: M.kt }, SYNC.salt);
    const r = await fetch(await syncUrl(), { method: 'PUT', body: JSON.stringify({ meta, blob }) }); // (sin cabeceras propias)
    if (!r.ok) throw new Error('Firebase respondió ' + r.status);
    syncSet({ up: st.at || ver }); return true;
  } finally { SYNC.busy = false; }
}
// Al entrar: si lo último que hay arriba lo subió el otro aparato y trae algo que aquí no está (y no se ha contestado ya),
// devuelve qué trae para preguntar; si no, y aquí hay cambios sin subir, los sube
async function syncCheck() {
  if (!syncOn()) return null;
  const st = syncSt(), meta = await syncGet('/meta');
  if (!meta) { await syncPush(); return null; }
  const ver = meta.ver || meta.at || 0;
  if (meta.dev !== syncDev() && ver > (st.seen || 0)) {
    const R = await syncRemote(), news = R && syncNews(syncLocal(), R);
    if (news) return Object.assign({}, meta, { news });
    syncSet({ seen: ver }); // (nada nuevo para aquí)
  }
  if ((st.at || 0) > (st.up || 0)) await syncPush();
  return null;
}
// Importar: lo de aquí junto con lo de allí, ganando lo de allí salvo lo que aquí se cambió después; y reiniciar
async function syncImport(meta, reload = true) {
  const R = await syncRemote(); if (!R) throw new Error('ya no hay datos que importar');
  const M = syncMerge(syncLocal(), R, true), st = syncSt();
  SYNC.applying = true; try { xferApply({ v: 1, d: M.d }, false, true); } finally { SYNC.applying = false; }
  const at = Math.max(st.at || 0, ...Object.values(M.kt).map(syncKt));
  syncSet({ kt: M.kt, at, seen: (R.meta.ver || R.meta.at || 0), up: R.meta.at >= at ? at : 0 }); // (si aquí queda algo más nuevo, se sube luego)
  if (reload) setTimeout(() => location.reload(), 300);
  return M;
}
const syncDecline = meta => syncSet({ seen: meta.ver || meta.at }); // («Ahora no»: no vuelve a preguntar por estos datos)
function syncNewCode() { const r = crypto.getRandomValues(new Uint32Array(2)); return String(r[0] % 1e8).padStart(8, '0') + String(r[1] % 1e8).padStart(8, '0'); }
// Crear un código en este aparato (y subir ya lo de aquí) o vincular con el del otro (devuelve qué trae, si hay, para preguntar)
async function syncCreate() { const code = syncNewCode(); syncSet({ code, seen: 0, up: 0 }); syncDev(); await syncPush(); return code; }
async function syncLink(code) {
  code = String(code).replace(/\D/g, ''); if (!syncCodeOk(code)) throw new Error('el código tiene 16 cifras');
  syncSet({ code, seen: 0, up: 0 }); syncDev();
  return syncCheck();
}
function syncUnlink() { clearTimeout(SYNC.t); syncSet({ code: null }); }
const syncAskText = m => { const n = m.news || {}, parts = [n.sets ? `${n.sets} ${n.sets === 1 ? 'ajuste' : 'ajustes'}` : '', n.other ? `${n.other} ${n.other === 1 ? 'cambio' : 'cambios'} más (perfiles, rangos, sesiones…)` : '', n.games ? `${n.games} ${n.games === 1 ? 'partida' : 'partidas'}` : ''].filter(Boolean);
  return `${m.from ? m.from[0].toUpperCase() + m.from.slice(1) : 'El otro aparato'} tiene cambios más recientes (${syncWhen(m.at)}${parts.length ? ': ' + parts.join(', ') : ''}). ¿Importarlos? Se queda lo más nuevo de cada ajuste (lo que hayas cambiado aquí después no se toca) y se juntan las partidas.`; };

/* ---------- En el juego ---------- */
function xferMenu(back, view = {}) {
  const again = v => xferMenu(back, v), run = (fn, next) => { if (XFER.busy) return; XFER.busy = true; again({ ...view, wait: true });
    fn().then(r => { XFER.busy = false; again(next(r)); }).catch(e => { XFER.busy = false; again({ err: (e && e.message) || String(e) }); }); };
  const rows = [{ t: 'title', text: 'A OTRO DISPOSITIVO' }];
  if (view.wait) rows.push({ t: 'text', text: 'Un momento…', color: '#ffd166' });
  else if (view.code) rows.push({ t: 'text', text: 'Escribe este código en el otro dispositivo (en el juego: Ajustes ▸ → Perfiles ▸ → A otro dispositivo; o en la página):', color: '#a49fc8' }, { t: 'title', text: xferFmt(view.code), color: '#3cf0c6' }, { t: 'text', text: `Vale durante ${XFER_HOURS} h · los datos van cifrados`, color: '#a49fc8' });
  else if (view.got) rows.push({ t: 'text', text: `Recibido (desde ${view.got.from || 'otro dispositivo'}): ${xferSummary(view.got)}`, color: '#3cf0c6' }, { t: 'text', text: 'Al cargarlo se sustituyen los ajustes, perfiles y bloques de aquí (el historial se junta) y RepArena vuelve a empezar: tendrás que volver a entrar.', color: '#ffd166' });
  else rows.push({ t: 'text', text: view.err ? '✕ ' + view.err : 'Lleva tus ajustes, perfiles, bloques de sesión, historial y música elegida de un dispositivo a otro (p. ej. del PC a las gafas) con un código de 8 cifras.', color: view.err ? '#ff6a6a' : '#a49fc8' });
  if (view.got) rows.push({ t: 'btns', items: [{ label: 'Cargar y reiniciar', style: 'primary', flex: 2, onPress: () => { xferApply(view.got); say('Datos cargados: reiniciando…', '#3cf0c6', 2); } }, { label: 'Cancelar', onPress: () => again({}) }] });
  else if (!view.wait) rows.push({ t: 'btns', items: [
    { label: 'Enviar desde aquí', style: 'primary', onPress: () => run(xferSend, code => ({ code })) },
    { label: 'Recibir (escribir código)', onPress: () => openKeypad({ label: 'Código de 8 cifras', short: 'Código del otro dispositivo', unit: '' }, null, { code: true, maxLen: 8, onOK: str => run(() => xferFetch(str), got => ({ got })) }) }] });
  rows.push({ t: 'btns', items: [{ label: 'Volver', onPress: back }] });
  const m = openMenu(rows, { accent: MC.prof }); m.rebuild = () => again(view);
}

// La sincronización, en el juego (Ajustes ▸ → Perfiles ▸ → Sincronización ▸)
function syncMenu(back, view = {}) {
  const again = v => syncMenu(back, v), run = (fn, next) => { if (SYNC.busy && !view.ask) return; again({ wait: true });
    fn().then(r => again(next(r))).catch(e => again({ err: (e && e.message) || String(e) })); };
  const s = syncSt(), rows = [{ t: 'title', text: view.ask ? 'DATOS MÁS RECIENTES' : 'SINCRONIZACIÓN' }];
  if (view.wait) rows.push({ t: 'text', text: 'Un momento…', color: '#ffd166' });
  else if (view.ask) rows.push({ t: 'text', text: syncAskText(view.ask), color: '#ffd166' }, { t: 'btns', items: [
    { label: 'Importar y reiniciar', style: 'primary', flex: 2, onPress: () => run(() => syncImport(view.ask), () => ({ done: true })) },
    { label: 'Ahora no', onPress: () => { syncDecline(view.ask); back(); } }] });
  else if (view.done) rows.push({ t: 'text', text: 'Importado: RepArena vuelve a empezar (tendrás que volver a entrar en las gafas).', color: '#3cf0c6' });
  else {
    if (view.err) rows.push({ t: 'text', text: '✕ ' + view.err, color: '#ff6a6a' });
    if (view.code) rows.push({ t: 'text', text: 'Tu código fijo. Escríbelo una vez en el otro aparato (en el juego: Ajustes ▸ → Perfiles ▸ → Sincronización ▸ → Vincular; o en la página):', color: '#a49fc8' }, { t: 'title', text: syncFmt(view.code), color: '#3cf0c6' });
    if (s.code) {
      if (!view.code) rows.push({ t: 'text', text: `Vinculado con el código ${syncFmt(s.code)}. ${s.up ? `Última subida: ${syncWhen(s.up)}.` : 'Aún no ha subido nada.'}${view.ok ? ' ' + view.ok : ''}`, color: '#3cf0c6' });
      rows.push({ t: 'btns', items: [
        { label: 'Sincronizar ahora', style: 'primary', onPress: () => run(async () => { const m = await syncCheck(); if (m) return { ask: m }; await syncPush(); return { ok: 'Todo al día.' }; }, r => r) },
        { label: 'Desvincular', style: 'danger', onPress: () => { syncUnlink(); again({}); } }] });
    } else {
      rows.push({ t: 'text', text: 'Con un código fijo, tus ajustes, perfiles, sesiones, historial y carrera se guardan cifrados y pasan solos de un aparato a otro: al entrar, si el otro tiene algo más reciente, te pregunta si lo importas.', color: '#a49fc8' });
      rows.push({ t: 'btns', items: [
        { label: 'Crear código', style: 'primary', onPress: () => run(syncCreate, code => ({ code })) },
        { label: 'Vincular (escribir código)', onPress: () => openKeypad({ label: 'Código de 16 cifras', short: 'Código fijo del otro aparato', unit: '' }, null, { code: true, maxLen: 16, onOK: str => run(() => syncLink(str), m => m ? { ask: m } : { ok: 'Vinculado.' }) }) }] });
    }
  }
  if (!view.ask && !view.done) rows.push({ t: 'btns', items: [{ label: 'Volver', onPress: back }] });
  const m = openMenu(rows, { accent: MC.prof }); m.rebuild = () => again(view);
}
// Al entrar en las gafas: si el otro aparato tiene algo más reciente, lo pregunta antes del menú principal
function syncAskOnEntry() { if (!syncOn()) return; syncCheck().then(m => { if (m && xrActive && state === 'lobby') syncMenu(() => lobbyMenu(), { ask: m }); }).catch(() => {}); }

/* ---------- En la página ---------- */
function xferInitPage() {
  setTimeout(() => { SYNC.ready = true; }, 3000); syncInitPage();
  const send = $('#btnXferSend'), recv = $('#btnXferRecv'), inp = $('#xferCode'), st = $('#xferStatus'); if (!send) return;
  const say2 = (t, bad) => { st.textContent = t; st.style.color = bad ? 'var(--red)' : ''; };
  send.addEventListener('click', async () => {
    send.disabled = true; say2('Enviando…');
    try { const c = await xferSend(); say2(`Código: ${xferFmt(c)} — escríbelo en el otro dispositivo (vale ${XFER_HOURS} h).`); } catch (e) { say2('No se pudo enviar: ' + e.message, true); }
    send.disabled = false;
  });
  recv.addEventListener('click', async () => {
    recv.disabled = true; say2('Buscando…');
    try {
      const p = await xferFetch(inp.value);
      if (confirm(`Recibido: ${xferSummary(p)}.\n\nSe sustituyen los ajustes, perfiles y bloques de aquí (el historial se junta). ¿Cargar?`)) { say2('Cargado: recargando la página…'); xferApply(p); } else say2('No se ha cargado nada.');
    } catch (e) { say2('No se pudo recibir: ' + e.message, true); }
    recv.disabled = false;
  });
}
// La sincronización, en la página: crear o vincular el código, y la pregunta al abrirla (y al volver a ella)
function syncInitPage() {
  const box = $('#syncBox'), ask = $('#syncAsk'); if (!box || !SYNC.db) return; box.hidden = false;
  const inp = $('#syncCode'), st = $('#syncStatus'), say2 = (t, bad) => { st.textContent = t; st.style.color = bad ? 'var(--red)' : ''; };
  const show = () => { const s = syncSt(); $('#syncNew').hidden = !!s.code; $('#syncLinked').hidden = !s.code; if (s.code && !st.textContent) say2(`Vinculado con el código ${syncFmt(s.code)}.${s.up ? ` Última subida: ${syncWhen(s.up)}.` : ''}`); };
  let pending = null;
  const offer = m => { if (!m || !ask) return; pending = m; $('#syncAskTxt').textContent = syncAskText(m); ask.hidden = false; };
  $('#btnSyncYes').addEventListener('click', async () => { const m = pending; ask.hidden = true; if (!m) return; say2('Importando…'); try { await syncImport(m); say2('Importado: recargando la página…'); } catch (e) { say2('No se pudo importar: ' + e.message, true); } });
  $('#btnSyncNo').addEventListener('click', () => { if (pending) syncDecline(pending); pending = null; ask.hidden = true; });
  const busy = async (btn, fn) => { btn.disabled = true; try { await fn(); } catch (e) { say2('No se pudo: ' + e.message, true); } btn.disabled = false; show(); };
  $('#btnSyncNew').addEventListener('click', e => busy(e.currentTarget, async () => { say2('Creando…'); const c = await syncCreate(); say2(`Tu código fijo: ${syncFmt(c)}. Escríbelo una vez en el otro aparato (en el juego: Ajustes ▸ → Perfiles ▸ → Sincronización ▸ → Vincular).`); }));
  $('#btnSyncLink').addEventListener('click', e => busy(e.currentTarget, async () => { say2('Vinculando…'); const m = await syncLink(inp.value); inp.value = ''; say2(m ? 'Vinculado: el otro aparato tiene datos.' : 'Vinculado.'); offer(m); }));
  $('#btnSyncNow').addEventListener('click', e => busy(e.currentTarget, async () => { say2('Sincronizando…'); const m = await syncCheck(); if (m) { say2(''); offer(m); } else { await syncPush(); say2(`Todo al día (${syncWhen(Date.now())}).`); } }));
  $('#btnSyncOff').addEventListener('click', () => { syncUnlink(); say2('Desvinculado: este aparato ya no sincroniza.'); show(); });
  show();
  // al abrir la página y al volver a ella (como mucho, una vez por minuto)
  let last = 0; const check = () => { if (!syncOn() || Date.now() - last < 60e3 || (ask && !ask.hidden)) return; last = Date.now(); syncCheck().then(offer).catch(() => {}); };
  check(); if (document.addEventListener) document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
}
