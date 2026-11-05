/* =================== PULSÓMETRO (BLUETOOTH) =================== */
// Tu pulso en el marcador, de un reloj o una banda que lo emita como pulsómetro Bluetooth normal (el servicio estándar
// «heart_rate»): los Amazfit con Zepp OS 3 o más («Emitir frecuencia cardíaca» / Heart Rate Push), Polar, Garmin
// («Transmitir frecuencia cardíaca»), Wahoo… Se conecta desde la página (el navegador pide elegirlo: hace falta un
// toque) y sigue conectado al entrar en las gafas. Si el navegador no tiene Bluetooth para páginas web, lo dice.
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
  if (v < 30 || v > 240) return; HR.bpm = v; HR.t = performance.now(); HR.max = Math.max(HR.max, v);
  if (typeof boardDirty !== 'undefined') boardDirty = true;
  const now = $('#hrNow'); if (now) { now.textContent = `♥ ${v} lpm`; now.style.color = hrCol(v); }
}
async function hrAttach(dev) {
  hrStatus(`Conectando con ${dev.name || 'el pulsómetro'}…`);
  const srv = await dev.gatt.connect(), svc = await srv.getPrimaryService('heart_rate'), ch = await svc.getCharacteristic('heart_rate_measurement');
  ch.addEventListener('characteristicvaluechanged', ev => hrParse(ev.target.value)); await ch.startNotifications();
  HR.char = ch; HR.tries = 0; hrStatus(`Conectado: ${dev.name || 'pulsómetro'}. Tu pulso sale en el marcador del juego.`);
}
// Si se pierde (el reloj se aleja o deja de emitir), se intenta otra vez unas cuantas veces
function hrLost() {
  HR.char = null; if (!HR.dev) return;
  if (HR.tries++ >= 5) { hrStatus('Se perdió el pulsómetro. Vuelve a pulsar «Conectar pulsómetro».', true); return; }
  hrStatus('Se perdió el pulsómetro: reconectando…', true);
  setTimeout(() => { if (HR.dev) hrAttach(HR.dev).catch(hrLost); }, 2500);
}
async function hrConnect() {
  if (!hrOk()) { hrStatus('Este navegador no deja conectar aparatos Bluetooth desde una página web (en las Quest, el navegador de Meta puede no permitirlo). Prueba en Chrome o Edge en un ordenador o un móvil Android.', true); return; }
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
  const d = HR.dev; HR.dev = null; HR.char = null; HR.bpm = 0;
  try { if (d && d.gatt && d.gatt.connected) d.gatt.disconnect(); } catch (e) { /* da igual */ }
  if (!quiet) hrStatus('Desconectado.'); const now = $('#hrNow'); if (now) now.textContent = '';
  if (typeof boardDirty !== 'undefined') boardDirty = true;
}
function hrInitPage() {
  const b = $('#btnHr'), o = $('#btnHrOff'); if (!b) return;
  b.addEventListener('click', hrConnect); if (o) o.addEventListener('click', () => hrOff());
  hrStatus(hrOk() ? 'Sin conectar.' : 'Este navegador no deja conectar aparatos Bluetooth desde una página web: el botón lo intentará igualmente.', !hrOk());
}
// En el marcador, arriba a la derecha, bajo las vidas: un corazón y el número, del color de tu zona
function drawPulse(c, x, y) {
  const b = hrNow(); if (!b) return;
  const col = hrCol(b), t = String(b);
  c.save(); c.textAlign = 'right'; c.textBaseline = 'middle'; c.font = `46px ${FD}`; glowText(c, t, x, y, col, 10); const tw = c.measureText(t).width;
  c.translate(x - tw - 34, y); c.font = `40px ${FB}`; c.textAlign = 'center'; glowText(c, '♥', 0, 2, col, 12); c.restore();
}
