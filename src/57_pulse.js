/* =================== PULSÓMETRO (BLUETOOTH) =================== */
// Tu pulso en el marcador, de un reloj o una banda que lo emita como pulsómetro Bluetooth normal (el servicio estándar
// «heart_rate»): los Amazfit con Zepp OS 3 o más («Emitir frecuencia cardíaca» / Heart Rate Push), Polar, Garmin
// («Transmitir frecuencia cardíaca»), Wahoo… Se conecta desde la página (el navegador pide elegirlo: hace falta un
// toque) y sigue conectado al entrar en las gafas. Si el navegador no tiene Bluetooth para páginas web, lo dice. El de
// las Quest no lo tiene (responde como si no hubiera Bluetooth): el pulso llega entonces por el móvil (ver «Del móvil a
// las gafas», abajo).
// Colores por zonas, con tu pulso máximo estimado (220 − edad, o el que pongas): azul suave, verde (quema), amarillo
// (aeróbico), naranja (umbral) y rojo (máximo)
const HR = { dev: null, char: null, bpm: 0, t: 0, st: '', bad: false, tries: 0, max: 0 };
const hrOk = () => typeof navigator !== 'undefined' && !!navigator.bluetooth && typeof navigator.bluetooth.requestDevice === 'function';
const hrNow = () => HR.bpm && performance.now() - HR.t < 6000 ? HR.bpm : 0; // (sin datos en 6 s: nada)
const HR_ZONES = [[0.6, '#7fd4ff'], [0.7, '#3cf0c6'], [0.8, '#c8f560'], [0.9, '#ffb36b'], [9, '#ff3b5c']];
const hrMax = () => settings.hrMax || 190;
const hrCol = b => (HR_ZONES.find(z => b < z[0] * hrMax()) || HR_ZONES[4])[1];
function hrStatus(t, bad) { HR.st = t; HR.bad = !!bad; const el = typeof document !== 'undefined' && $('#hrStatus'); if (el) { el.textContent = t; el.style.color = bad ? 'var(--red)' : ''; } const off = $('#btnHrOff'); if (off) off.disabled = !HR.dev; }
// Lo que manda el pulsómetro: el primer byte dice si el pulso viene en 8 o en 16 bits
function hrParse(dv) {
  const f = dv.getUint8(0), v = f & 1 ? dv.getUint16(1, true) : dv.getUint8(1);
  if (v < 30 || v > 240) return; HR.bpm = v; HR.t = performance.now(); HR.max = Math.max(HR.max, v); HR.from = '';
  if (typeof boardDirty !== 'undefined') boardDirty = true; hrxSend(v);
  const now = $('#hrNow'); if (now) { now.textContent = `♥ ${v} lpm`; now.style.color = hrCol(v); }
}
async function hrAttach(dev) {
  hrStatus(`Conectando con ${dev.name || 'el pulsómetro'}…`);
  const srv = await dev.gatt.connect(), svc = await srv.getPrimaryService('heart_rate'), ch = await svc.getCharacteristic('heart_rate_measurement');
  ch.addEventListener('characteristicvaluechanged', ev => hrParse(ev.target.value)); await ch.startNotifications();
  HR.char = ch; HR.tries = 0; HRX.note = ''; hrStatus(`Conectado: ${dev.name || 'pulsómetro'}. ${hrxHow()}`);
}
// Si se pierde (el reloj se aleja o deja de emitir), se intenta otra vez unas cuantas veces
function hrLost() {
  HR.char = null; if (!HR.dev) return;
  if (HR.tries++ >= 5) { hrStatus('Se perdió el pulsómetro. Vuelve a pulsar «Conectar pulsómetro».', true); return; }
  hrStatus('Se perdió el pulsómetro: reconectando…', true);
  setTimeout(() => { if (HR.dev) hrAttach(HR.dev).catch(hrLost); }, 2500);
}
async function hrConnect() {
  if (!hrOk()) { hrStatus(/OculusBrowser|Quest/i.test(navigator.userAgent || '') ? 'El navegador de las gafas no deja conectar aparatos Bluetooth desde una página. Conéctalo en el móvil (Chrome en Android) con esta misma página y vincula los dos con el código de sincronización (Ajustes → Sincronización automática): el móvil te pasa el pulso a las gafas.' : 'Este navegador no deja conectar aparatos Bluetooth desde una página web. Prueba en Chrome o Edge en un móvil Android o en un ordenador.', true); return; }
  try {
    if (navigator.bluetooth.getAvailability && !(await navigator.bluetooth.getAvailability())) { hrStatus('El Bluetooth de este aparato está apagado o el navegador no puede usarlo.', true); return; }
    hrStatus('Elige tu reloj o pulsómetro en la lista…');
    const dev = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
    if (HR.dev && HR.dev !== dev) hrOff(true); HR.dev = dev; dev.addEventListener('gattserverdisconnected', hrLost);
    await hrAttach(dev);
  } catch (e) {
    hrStatus(e && e.name === 'NotFoundError' ? 'No apareció ninguno o no elegiste. ¿Está emitiendo el pulso? En los Amazfit: Ajustes → Frecuencia cardíaca → «Emitir frecuencia cardíaca» (o empieza un entrenamiento en el reloj).' : 'No se pudo conectar: ' + (e && e.message || e), true);
  }
}
function hrOff(quiet) {
  const d = HR.dev; HR.dev = null; HR.char = null; HR.bpm = 0; hrxWake(false);
  try { if (d && d.gatt && d.gatt.connected) d.gatt.disconnect(); } catch (e) { /* da igual */ }
  if (!quiet) hrStatus('Desconectado.'); const now = $('#hrNow'); if (now) now.textContent = '';
  if (typeof boardDirty !== 'undefined') boardDirty = true;
}
function hrInitPage() {
  const b = $('#btnHr'), o = $('#btnHrOff'); if (!b) return;
  b.addEventListener('click', hrConnect); if (o) o.addEventListener('click', () => hrOff());
  hrStatus(hrOk() ? 'Sin conectar.' : 'Este navegador no deja conectar aparatos Bluetooth desde una página web: el botón lo intentará igualmente.', !hrOk());
}
/* ---------- Del móvil a las gafas ---------- */
// El navegador de las gafas no deja conectar el pulsómetro, así que lo pasa el móvil: la página del móvil, con el
// pulsómetro conectado y el código de sincronización (los dos aparatos vinculados), deja cada pulso nuevo (como mucho uno
// por segundo) cifrado con ese código en la misma base de datos de Firebase, en otro hueco que sale del código; las gafas,
// mientras juegas, lo escuchan (un flujo de Firebase: llega en menos de un segundo; si el navegador no sabe, preguntan cada
// 2 s) y sale en el marcador como si el pulsómetro estuviera conectado a ellas. Un pulso de hace más de 15 s no vale.
// Mientras lo pasa, la pantalla del móvil no se apaga: si se apaga o cambias de app, el navegador para la página
const HRX = { key: null, kc: '', last: 0, sent: 0, busy: false, ok: false, note: '', es: null, esCode: '', opening: false, noStream: false, chk: 0, pollT: 0, polling: false, lastT: 0, lock: null, locking: false };
const HRX_SALT = 'reparena-pulso-v1';
async function hrxUrl() { return `${SYNC.db.replace(/\/+$/, '')}/sync/${xferHex(await crypto.subtle.digest('SHA-256', _xEnc.encode('reparena-pulso:' + syncSt().code)))}.json`; }
function hrxKey() { const c = syncSt().code; if (HRX.kc !== c) { HRX.kc = c; HRX.key = xferKey(c, HRX_SALT); } return HRX.key; } // (sacar la clave del código cuesta: una vez)
async function hrxSeal(o) { const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await hrxKey(), _xEnc.encode(JSON.stringify(o)))), all = new Uint8Array(12 + ct.length); all.set(iv); all.set(ct, 12); return xferB64(all); }
async function hrxOpen(b64) { const all = xferUnB64(b64); return JSON.parse(_xDec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, await hrxKey(), all.slice(12)))); }
const hrxHow = () => !(typeof SYNC !== 'undefined' && SYNC.db) ? 'Tu pulso sale en el marcador del juego.' : syncOn() ? 'Te paso el pulso a las gafas (las dos con el mismo código de sincronización): deja esta página abierta; la pantalla no se apagará.' : 'Para verlo en las gafas, vincula este aparato y las gafas con el código de sincronización (Ajustes → Sincronización automática) y deja esta página abierta.';
function hrxNote(t, bad) { if (HRX.note === t) return; HRX.note = t; if (HR.dev) hrStatus(`Conectado: ${HR.dev.name || 'pulsómetro'}. ${t}`, bad); }
// En el aparato con el pulsómetro (fuera de las gafas): cada pulso nuevo, como mucho uno por segundo (y, aunque no cambie, cada 4 s)
function hrxSend(v) {
  if (typeof SYNC === 'undefined' || !syncOn() || HRX.busy || xrActive) return;
  const now = performance.now(); if (now - HRX.sent < 1000 || (v === HRX.last && now - HRX.sent < 4000)) return;
  HRX.busy = true; HRX.sent = now; HRX.last = v; hrxWake(true);
  (async () => {
    const at = Date.now(), blob = await hrxSeal({ b: v, t: at, m: HR.max, w: syncWho() });
    const r = await fetch(await hrxUrl(), { method: 'PUT', body: JSON.stringify({ meta: { ver: at, at, dev: syncDev(), from: syncWho(), n: 0 }, blob }) }); // (con la misma forma que lo sincronizado: lo admiten sus reglas)
    if (!r.ok) throw new Error('Firebase respondió ' + r.status);
    HRX.ok = true; hrxNote(hrxHow());
  })().catch(e => { HRX.ok = false; hrxNote('No se pudo pasar el pulso a las gafas (' + ((e && e.message) || e) + '): lo intento otra vez.', true); }).finally(() => { HRX.busy = false; });
}
// La pantalla del móvil, encendida mientras pasa el pulso (si el navegador sabe)
async function hrxWake(on) {
  try {
    if (!on) { const L = HRX.lock; HRX.lock = null; if (L) await L.release(); return; }
    if (HRX.lock || HRX.locking || typeof navigator === 'undefined' || !navigator.wakeLock || (typeof document !== 'undefined' && document.hidden)) return;
    HRX.locking = true; const L = await navigator.wakeLock.request('screen'); HRX.lock = L; L.addEventListener('release', () => { if (HRX.lock === L) HRX.lock = null; });
  } catch (e) { /* sin permiso o sin la función: da igual */ } finally { HRX.locking = false; }
}
// Lo que llega (en las gafas): el pulso, si es de hace menos de 15 s y más nuevo que el último
async function hrxTake(node) {
  if (!node || typeof node.blob !== 'string') return false;
  let p; try { p = await hrxOpen(node.blob); } catch (e) { return false; } // (de otro código o roto)
  if (!p || !(p.b >= 30 && p.b <= 240) || Math.abs(Date.now() - p.t) > 15000 || p.t <= HRX.lastT) return false;
  HRX.lastT = p.t; HR.bpm = p.b; HR.t = performance.now(); HR.max = Math.max(HR.max, p.b, p.m || 0); HR.from = p.w || 'el móvil';
  if (typeof boardDirty !== 'undefined') boardDirty = true;
  const now = $('#hrNow'); if (now) { now.textContent = `♥ ${p.b} lpm`; now.style.color = hrCol(p.b); }
  if (!HR.dev) hrStatus(`Tu pulso llega desde ${HR.from}, por la sincronización.`);
  return true;
}
function hrxClose() { if (HRX.es) { HRX.es.close(); HRX.es = null; } }
// En las gafas (o al probar en el ordenador), mientras se juega y sin pulsómetro propio: escuchar el hueco del pulso
function hrxStep(dt) {
  if ((HRX.chk -= dt) > 0) return; const step = 0.5 - HRX.chk; HRX.chk = 0.5; // (dos veces por segundo basta)
  const code = typeof SYNC !== 'undefined' && SYNC.db && !HR.char ? syncSt().code : null;
  if (!code) { hrxClose(); return; } if (HRX.es && HRX.esCode !== code) hrxClose(); // (otro código: otro hueco)
  if (typeof EventSource !== 'undefined' && !HRX.noStream) {
    if (HRX.es || HRX.opening) return; HRX.opening = true;
    hrxUrl().then(url => {
      const es = HRX.es = new EventSource(url), take = ev => { try { const m = JSON.parse(ev.data); if (m && m.path === '/') hrxTake(m.data); } catch (e) { /* nada */ } };
      HRX.esCode = code; es.addEventListener('put', take); es.addEventListener('patch', take);
      const off = () => { if (HRX.es === es) { hrxClose(); HRX.noStream = true; } }; // (si Firebase no deja escuchar, se pregunta cada 2 s)
      es.addEventListener('cancel', off); es.onerror = () => { if (es.readyState === 2) off(); }; // (cerrado del todo; si solo se cortó, se reconecta solo)
    }).catch(() => {}).finally(() => { HRX.opening = false; });
    return;
  }
  if ((HRX.pollT -= step) > 0 || HRX.polling) return; HRX.pollT = 2; HRX.polling = true;
  hrxUrl().then(u => fetch(u)).then(r => r.ok ? r.json() : null).then(hrxTake).catch(() => {}).finally(() => { HRX.polling = false; });
}
// En el marcador, arriba a la derecha, bajo las vidas: un corazón y el número, del color de tu zona
function drawPulse(c, x, y) {
  const b = hrNow(); if (!b) return;
  const col = hrCol(b), t = String(b);
  c.save(); c.textAlign = 'right'; c.textBaseline = 'middle'; c.font = `46px ${FD}`; glowText(c, t, x, y, col, 10); const tw = c.measureText(t).width;
  c.translate(x - tw - 34, y); c.font = `40px ${FB}`; c.textAlign = 'center'; glowText(c, '♥', 0, 2, col, 12); c.restore();
}
