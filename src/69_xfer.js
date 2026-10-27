/* =================== PASAR TUS DATOS A OTRO DISPOSITIVO (POR CÓDIGO) =================== */
// Sin servidor propio: en un dispositivo pulsas «Enviar» y sale un código de 8 cifras; en el otro lo escribes y se cargan
// tus ajustes, perfiles, bloques de sesión, favoritos, rangos, historial y la música elegida. Del código salen a la vez
// la clave (AES-GCM, derivada con PBKDF2) y el canal de un servicio público de mensajes (ntfy.sh) donde se dejan los datos
// cifrados unas horas: el servicio no puede leerlos y, sin el código, nadie sabe en qué canal están. Lo que depende de
// cada aparato (la habitación escaneada, los aparatos colocados, la sesión de Spotify) no se manda.
const XFER = { base: 'https://ntfy.sh', last: null, busy: false };
const XFER_KEYS = ['reparena3-settings', 'reparena3-combos', 'reparena3-profiles', 'reparena3-favs', 'reparena3-ui', 'reparena3-rankfit', 'reparena3-session', 'reparena3-sessions', 'reparena3-history', 'reparena3-arcghost', 'reparena3-spotify'];
const XFER_CHUNK = 3000; // (cada mensaje, por debajo de los 4 KB que admite el servicio sin adjuntos)
const XFER_HOURS = 12;
const _xEnc = new TextEncoder(), _xDec = new TextDecoder();
const xferHex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const xferB64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
const xferUnB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const xferCodeOk = c => /^\d{8}$/.test(String(c || '').replace(/\D/g, ''));
const xferFmt = c => String(c).replace(/\D/g, '').replace(/^(\d{4})(\d{4})$/, '$1 $2');
async function xferTopic(code) { return 'reparena-' + xferHex(await crypto.subtle.digest('SHA-256', _xEnc.encode('reparena-canal:' + code))).slice(0, 32); }
async function xferKey(code) {
  const base = await crypto.subtle.importKey('raw', _xEnc.encode(code), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: _xEnc.encode('reparena-xfer-v1'), iterations: 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function xferZip(bytes, back) { // (comprimido si el navegador sabe; si no, tal cual)
  if (typeof CompressionStream === 'undefined') return null;
  const s = new Blob([bytes]).stream().pipeThrough(back ? new DecompressionStream('deflate-raw') : new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
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
  const plain = _xEnc.encode(JSON.stringify(xferPack())), zip = await xferZip(plain), body = zip || plain;
  const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await xferKey(code), body));
  const all = new Uint8Array(13 + ct.length); all[0] = zip ? 1 : 0; all.set(iv, 1); all.set(ct, 13);
  const b64 = xferB64(all), n = Math.ceil(b64.length / XFER_CHUNK), id = xferHex(crypto.getRandomValues(new Uint8Array(4))), topic = await xferTopic(code);
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
  const all = xferUnB64(got);
  let body; try { body = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(1, 13) }, await xferKey(code), all.slice(13))); } catch (e) { throw new Error('no se pudo descifrar: revisa el código'); }
  if (all[0] === 1) body = await xferZip(body, true);
  const p = JSON.parse(_xDec.decode(body)); if (!p || p.v !== 1 || !p.d) throw new Error('el envío no es de RepArena');
  return p;
}
// Cargar lo recibido: sustituye lo de este aparato (el historial se junta, sin repetir partidas; de Spotify se conserva el
// inicio de sesión de aquí) y vuelve a empezar la página para que todo lo lea
function xferApply(p, reload = true) {
  for (const k of XFER_KEYS) {
    const v = p.d[k]; if (v === undefined) continue;
    if (k === 'reparena3-history') {
      const mine = store(k) || [], seen = new Set(mine.map(r => `${r.date}|${r.ex}|${r.reps}`));
      store(k, mine.concat(v.filter(r => r && !seen.has(`${r.date}|${r.ex}|${r.reps}`))).sort((a, b) => (a.date || 0) - (b.date || 0)).slice(-400));
    } else if (k === 'reparena3-spotify') store(k, Object.assign({}, store(k) || {}, v.clientId ? { clientId: v.clientId } : {}, v.lists ? { lists: v.lists } : {}, v.picks ? { picks: v.picks } : {}, v.favs ? { favs: v.favs } : {}, v.bpms ? { bpms: v.bpms } : {}));
    else store(k, v);
  }
  if (reload) setTimeout(() => location.reload(), 300);
}

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

/* ---------- En la página ---------- */
function xferInitPage() {
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
