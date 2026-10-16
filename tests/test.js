// Prueba sin gráficos: juega partidas completas en todos los modos con un THREE simulado.
// Uso: python3 src/build.py && node tests/test.js
'use strict';
const fs = require('fs'), vm = require('vm');
const THREE = require('./three-mock.js');
const E = require('./env-mock.js');
const winListeners = {};
const storage = new Map();
Object.assign(global, {
  THREE, document: E.document, window: global, innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1,
  addEventListener: (ev, fn) => (winListeners[ev] = winListeners[ev] || []).push(fn),
  localStorage: { getItem: k => storage.has(k) ? storage.get(k) : null, setItem: (k, v) => storage.set(k, String(v)) },
  location: { protocol: 'https:', hostname: 'example.com', origin: 'https://example.com', pathname: '/reparena/', search: '', assign(u) { this.assigned = u; } },
  history: { replaceState(a, b, u) { global.location.search = ''; global.location.replaced = u; } },
  AudioContext: E.AudioContext
});
Object.defineProperty(global, 'navigator', { value: { xr: E.makeXR() }, configurable: true });
global.XRRigidTransform = E.XRRigidTransform;
// ---- Spotify falso: la página vuelve de Spotify con ?code=… y el juego usa la Web API ----
const SPOT = { calls: [], playing: true, vol: 50, track: 'Eye of the Tiger', tokenCalls: 0, noDevice: false };
storage.set('reparena3-spotify', JSON.stringify({ clientId: 'testclient' }));
storage.set('reparena3-spotify-pkce', JSON.stringify({ verifier: 'v'.repeat(64), state: 'st123' }));
global.location.search = '?code=abc&state=st123';
global.fetch = async (url, opts = {}) => {
  const method = opts.method || 'GET'; SPOT.calls.push(method + ' ' + url.replace(/^https:\/\/[^/]+/, ''));
  const res = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body, text: async () => body === undefined ? '' : JSON.stringify(body) });
  if (url === 'https://accounts.spotify.com/api/token') {
    SPOT.tokenCalls++; const b = new URLSearchParams(String(opts.body));
    if (b.get('client_id') !== 'testclient') return res(400, { error: 'invalid_client' });
    if (b.get('grant_type') === 'authorization_code' && (b.get('code') !== 'abc' || b.get('code_verifier') !== 'v'.repeat(64) || b.get('redirect_uri') !== 'https://example.com/reparena/')) return res(400, { error: 'invalid_grant' });
    return res(200, { access_token: 'tok' + SPOT.tokenCalls, expires_in: 3600, refresh_token: 'ref' + SPOT.tokenCalls });
  }
  if (!url.startsWith('https://api.spotify.com/v1/')) throw new Error('unexpected fetch ' + url);
  if (!/^Bearer tok\d+$/.test(opts.headers.Authorization)) return res(401, { error: { status: 401, message: 'The access token expired' } });
  const path = url.slice('https://api.spotify.com/v1'.length);
  if (method === 'GET' && path === '/me/player') return SPOT.noDevice ? res(204) : res(200, { is_playing: SPOT.playing, device: { id: 'quest', name: 'Quest 3', volume_percent: SPOT.vol, supports_volume: true }, item: { name: SPOT.track, artists: [{ name: 'Survivor' }] } });
  if (method === 'GET' && path === '/me/player/devices') return res(200, { devices: SPOT.noDevice ? [] : [{ id: 'quest', is_active: true }] });
  if (method === 'PUT' && path === '/me/player/pause') { SPOT.playing = false; return res(204); }
  if (method === 'PUT' && path === '/me/player/play') { SPOT.playing = true; return res(204); }
  if (method === 'POST' && path === '/me/player/next') { SPOT.track = 'Siguiente canción'; return res(204); }
  if (method === 'POST' && path === '/me/player/previous') return res(204);
  if (method === 'PUT' && path.startsWith('/me/player/volume?volume_percent=')) { SPOT.vol = +path.split('=')[1]; return res(204); }
  return res(404, { error: { status: 404, message: 'Not found' } });
};
let src = fs.readFileSync(require('path').join(__dirname, '..', 'build', 'game.js'), 'utf8');
const expose = `
window.__RA = { stand, get state(){return state}, get menu(){return menu}, settings, get enemies(){return enemies}, get arcs(){return arcs}, get stats(){return stats}, get waveIdx(){return waveIdx}, get lives(){return lives},
  PV, startPreview, renderer, gates, hands, head, onRep, onCharge, openPause, settingsMenu, lobbyMenu, keypadKey, keypadOK, openKeypad, activeWidgets, SPLEGS, debris, get projs(){return projs}, get spawnQueue(){return spawnQueue},
  setSetting, startXR, gloves, watch, exitAll, beginRun, AUD, PADD, PNORM, scene, arena, HJ, get xrActive(){return xrActive}, resumeGame, get calibRef(){return calibRef}, HL, endRun, get score(){return score}, DET, get msg(){return msg},
  SP, spRefresh, spNowText, spToggle, EQ, BAR, PLACE, POOL, barNear, eqPose, pool, eqGroup, SES, startSession, get stateT(){return stateT}, GUN, BLASTERS, camera, BOLTS, get touches(){return touches}, TCH };
})();`;
src = src.replace(/\}\)\(\);\s*$/, expose);
const errors = [];
const origWarn = console.warn; console.warn = (...a) => { errors.push('WARN ' + a.join(' ')); };
vm.runInThisContext(src, { filename: 'game.js' });
const RA = window.__RA;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let T = 0;
function frame(n = 1, dtMs = 33, xrFrame) {
  for (let i = 0; i < n; i++) {
    T += dtMs;
    try { RA.renderer.loop(T, xrFrame ? xrFrame() : undefined); }
    catch (e) { errors.push('FRAME ERROR at state=' + RA.state + ': ' + e.stack.split('\n').slice(0, 6).join('\n')); throw e; }
  }
}
function key(type, code, keyName) { (winListeners[type] || []).forEach(f => f({ code, key: keyName || code, repeat: false, preventDefault() {} })); }
function findW(label) { const w = RA.activeWidgets().find(w => w.label === label); if (!w) throw new Error('widget not found: ' + label + ' in [' + RA.activeWidgets().map(w => w.label).join('|') + ']'); return w; }
function press(label) { findW(label).onPress(); }
function log(...a) { console.log(...a); }

async function runConfig(name, cfg, simulate, maxSec = 420, check, unfinished = false) {
  for (const k in cfg) RA.setSetting(k, cfg[k]);
  RA.startPreview(); frame(3);
  press('EMPEZAR');
  let t = 0, last = '', kills = 0, maxEnemies = 0, sawPlay = false;
  while (t < maxSec && RA.state !== 'end') {
    simulate(t); frame(1); t += 0.033;
    if (RA.state !== last) { last = RA.state; }
    if (RA.state === 'play') sawPlay = true;
    maxEnemies = Math.max(maxEnemies, RA.enemies.length + RA.arcs.length);
  }
  const s = RA.stats;
  log(`${name}: state=${RA.state} t=${t.toFixed(0)}s reps=${s.reps} perfect=${s.perfect} partial=${s.partial} kills=${s.kills} taken=${s.taken} shots=${s.shots} hits=${s.hits} maxActive=${maxEnemies} particles=${RA.PADD.p.length}/${RA.PNORM.p.length} debris=${RA.debris.length} score=${RA.score}` + (RA.settings.mode === 'bars' ? ` falls=${s.falls} hold=${s.hold.toFixed(0)}s` : ''));
  if (check) { const why = check(s); if (why) errors.push(`${name}: ${why}`); }
  if (RA.state !== 'end' && unfinished) RA.endRun(false, true); // prueba que no debe terminar sola
  else if (RA.state !== 'end') errors.push(`${name}: did not finish (state ${RA.state}, wave ${RA.waveIdx}, queue ${RA.spawnQueue.length}, enemies ${RA.enemies.length})`);
  press('Menú principal'); frame(5);
  RA.exitAll(); frame(1);
}
const squatSim = (period = 2.6) => t => { RA.PV.crouch = (t % period) < period * 0.55; };
// barras: solo se mueve cuando la oleada está en marcha (al colgarse hay que estar quieto)
const pullSim = (period = 2.6) => t => { RA.PV.crouch = RA.state === 'play' && (t % period) < period * 0.5; };
const fallOnce = (at, sim) => t => { sim(t); RA.PV.fall = RA.state === 'play' && RA.stats.falls === 0 && t > at; };
let curlSide = 0; const curlSim = t => { const ph = t % 1.4; if (ph < 0.034) { RA.onCharge(); RA.onRep({ perfect: false }, (curlSide++ % 2) ? 'left' : 'right'); } };

(async () => {
  await sleep(150);
  log('boot ok; renders so far', RA.renderer.renders);
  const base = { lives: 0, waves: 2, repsWave: 4, repsInc: 1, rest: 5, walkTime: 8, flySpeed: 6, maxAlive: 5, perfectTime: 1.0, arcRate: 20, arcSpeed: 12, arcMin: 15, arcMax: 30 };
  await runConfig('Asalto+sentadillas', { ...base, mode: 'walkers', exercise: 'squat' }, squatSim());
  await runConfig('Asalto+flexiones', { ...base, mode: 'walkers', exercise: 'pushup', walkTime: 6 }, squatSim(2.6));
  await runConfig('Asalto+flexiones cargadas (3 s abajo)', { ...base, mode: 'walkers', exercise: 'pushup', walkTime: 20, repsWave: 6, perfectTime: 0 }, t => { RA.PV.crouch = (t % 4.4) < 3.4; }, 420, s => s.kills < s.reps * 0.6 ? `la carga no aumenta el daño (${s.kills} muertes con ${s.reps} disparos)` : '');
  const sides = new Set();
  await runConfig('Asalto+plancha con un brazo', { ...base, mode: 'walkers', exercise: 'plank1', walkTime: 10 }, t => {
    RA.PV.keys.KeyQ = (t % 3) > 0.2 && (t % 3) < 1.0; RA.PV.keys.KeyE = (t % 3) > 1.5 && (t % 3) < 2.3;
    RA.enemies.forEach(e => sides.add(e.pos.x < 0 ? 'izq' : 'der'));
  }, 420, s => s.kills < 4 ? 'la plancha con un brazo no mata arañas' : sides.size < 2 ? 'las arañas no llegan por los dos lados' : '');
  RA.PV.keys.KeyQ = RA.PV.keys.KeyE = false;
  const supCfg = { ...base, mode: 'flyers', exercise: 'superman', supHold: 2, supRange: 12, flySpeed: 8 };
  await runConfig('Enjambre+superman (aguanta 2,6 s)', supCfg, t => { RA.PV.crouch = RA.state === 'play' && (t % 4) < 2.9; }, 420, s => s.reps < 5 ? 'el superman no dispara al aguantar' : s.partial ? 'aguantando lo pedido no debería haber medias' : s.kills < 5 ? 'no derriba a los voladores' : '');
  await runConfig('Enjambre+superman demasiado corto', { ...supCfg, waves: 1 }, t => { RA.PV.crouch = RA.state === 'play' && (t % 2.5) < 1.0; }, 30, s => s.reps ? 'subir y bajar rápido no debería disparar' : !s.partial ? 'debería avisar de que hay que aguantar' : '', true);
  await runConfig('Enjambre+superman brazos encogidos', { ...supCfg, waves: 1 }, t => { RA.PV.keys.KeyR = true; RA.PV.crouch = RA.state === 'play' && (t % 4) < 2.9; }, 30, s => s.reps ? 'con los brazos encogidos no debería disparar' : '', true);
  RA.PV.keys.KeyR = false;
  await runConfig('Asalto+curl', { ...base, mode: 'walkers', exercise: 'curl' }, curlSim);
  await runConfig('Enjambre+sentadillas', { ...base, mode: 'flyers', exercise: 'squat' }, squatSim());
  await runConfig('Enjambre+flexiones', { ...base, mode: 'flyers', exercise: 'pushup' }, squatSim());
  await runConfig('Enjambre+curl', { ...base, mode: 'flyers', exercise: 'curl' }, curlSim);
  await runConfig('Arcos', { ...base, mode: 'arcs', exercise: 'squat', arcDouble: 40 }, t => { RA.PV.crouch = true; });
  await runConfig('Arcos sin agacharse (golpes)', { ...base, mode: 'arcs', exercise: 'squat', lives: 3, waves: 1 }, t => { RA.PV.crouch = false; }, 120);
  // ---- Pistolas: las sentadillas cargan munición y el gatillo (T) dispara donde miras ----
  const aimShoot = every => t => { RA.PV.crouch = (t % 2.6) < 1.4; const e = RA.enemies.find(x => x.alive); if (e && (t % every) < 0.04 && RA.GUN.ammo) { const c = e.center(new THREE.Vector3()); RA.camera.lookAt(c); RA.PV.keys.KeyT = true; } else RA.PV.keys.KeyT = false; };
  await runConfig('Asalto+pistolas (apunta y dispara)', { ...base, mode: 'walkers', exercise: 'squat', pistol: 1, walkTime: 14 }, aimShoot(0.7), 420, s => s.kills < 4 ? 'las pistolas no matan robots' : s.shots < s.kills ? 'no cuenta los disparos' : '');
  await runConfig('Enjambre+pistolas (apunta y dispara)', { ...base, mode: 'flyers', exercise: 'squat', pistol: 1, flySpeed: 8 }, aimShoot(0.4), 420, s => s.kills < 6 ? 'las pistolas no derriban voladores' : '');
  let maxAmmo = 0;
  await runConfig('Asalto+pistolas sin disparar', { ...base, mode: 'walkers', exercise: 'squat', pistol: 1, waves: 1, walkTime: 30 }, t => { RA.PV.crouch = (t % 2.6) < 1.4; RA.PV.keys.KeyT = false; maxAmmo = Math.max(maxAmmo, RA.GUN.ammo); }, 25, s => s.kills ? 'sin apretar el gatillo no debería disparar' : maxAmmo !== 3 ? `la munición debería llegar a 3 y no pasar (${maxAmmo})` : '', true);
  RA.PV.keys.KeyT = false; RA.camera.rotation.set(0, 0, 0); RA.setSetting('pistol', 0);
  // ---- Toques: aros para la cabeza y gemas para las manos (Espacio y G los alcanzan) ----
  const assist = () => { RA.PV.crouch = true; RA.PV.keys.KeyG = true; };
  for (const [name, ex, extra] of [['sentadillas', 'squat', {}], ['saltos', 'jump', {}], ['abdominales', 'abs', {}], ['flexiones (aros)', 'pushup', {}],
    ['combinado de pie', 'combo', { comboBase: 'stand', comboStand: 'squat,jump,punch', comboOrder: 'seq' }], ['combinado plancha', 'combo', { comboBase: 'floor', comboFloor: 'push,plank,tap', plankHold: 3 }], ['combinado boca arriba', 'combo', { comboBase: 'abs', comboAbs: 'crunch,twist,knee', comboOrder: 'seq' }]]) {
    const parts = new Set();
    await runConfig('Toques+' + name, { ...base, mode: 'touch', exercise: ex, lives: 0, waves: 1, repsWave: 6, tchHands: 40, tchArrive: 2, tchGap: 2, ...extra }, t => { assist(); RA.touches.forEach(x => parts.add(x.part + ':' + x.move)); }, 200,
      s => s.taken ? `falla ${s.taken} objetivos` : s.reps < 6 ? 'no cuenta los toques' : RA.settings.exercise === 'combo' && parts.size < 3 ? `el combinado no mezcla movimientos (${[...parts]})` : '');
    log('   movimientos:', [...parts].join(' '));
  }
  RA.PV.keys.KeyG = false; RA.PV.crouch = false;
  await runConfig('Toques sin moverse', { ...base, mode: 'touch', exercise: 'squat', waves: 1, repsWave: 4, lives: 0, tchArrive: 2, tchGap: 2 }, () => { RA.PV.crouch = false; }, 60, s => s.reps ? 'sin moverse no debería tocar nada' : s.taken < 4 ? 'los objetivos no tocados no cuentan como fallo' : '');
  const arr = new Set();
  await runConfig('Toques al ritmo (120 BPM)', { ...base, mode: 'touch', exercise: 'squat', waves: 1, repsWave: 6, lives: 0, tchArrive: 2, tchGap: 1.3, bpm: 120 }, t => { assist(); RA.touches.forEach(x => arr.add(+x.arriveAt.toFixed(4))); }, 120, s => {
    const a = [...arr].sort((x, y) => x - y), off = a.slice(1).map((x, i) => (x - a[i]) / 0.5).filter(k => Math.abs(k - Math.round(k)) > 0.04 || Math.round(k) < 1);
    return a.length < 5 ? 'no llegan objetivos' : off.length ? 'los objetivos no llegan en el pulso: ' + a.join(' ') : '';
  });
  RA.setSetting('bpm', 0); RA.PV.keys.KeyG = false; RA.PV.crouch = false;
  await runConfig('Asalto con vidas (derrota)', { ...base, mode: 'walkers', exercise: 'squat', lives: 1, walkTime: 4 }, t => { RA.PV.crouch = false; }, 120);
  await runConfig('Jefe en oleada final', { ...base, mode: 'walkers', exercise: 'squat', waves: 1, repsWave: 10 }, squatSim(2.4));
  const bars = { ...base, mode: 'bars', barArrive: 2, barWait: 0, fallMargin: 12, dipBars: '2' };
  await runConfig('Barras+remo (pompas)', { ...bars, exercise: 'row', barTarget: 'bubbles' }, pullSim(), 420, s => s.reps < 9 ? 'pocas repeticiones' : s.kills < 4 ? 'no revienta las pompas' : '');
  await runConfig('Barras+remo una paralela', { ...bars, exercise: 'row', dipBars: '1', barTarget: 'bubbles' }, pullSim(), 420, s => s.kills < 4 ? 'con una paralela no revienta las pompas' : '');
  await runConfig('Barras+dominadas (bichos)', { ...bars, exercise: 'pullup', barTarget: 'bugs' }, pullSim(3), 420, s => s.kills < 4 ? 'no revienta los bichos' : '');
  await runConfig('Barras+colgado', { ...bars, exercise: 'hang', hangTime: 5, hangInc: 5 }, t => {}, 120, s => s.hold < 14 ? 'no cuenta el tiempo colgado' : '');
  await runConfig('Barras+remo con caída', { ...bars, exercise: 'row', lives: 3 }, fallOnce(9, pullSim()), 420, s => s.falls !== 1 ? 'la caída no se detecta' : s.taken < 1 ? 'la caída no quita vida' : '');
  await runConfig('Barras+colgado caída (derrota)', { ...bars, exercise: 'hang', lives: 1, hangTime: 30 }, fallOnce(6, t => {}), 120, s => s.falls !== 1 ? 'la caída no se detecta' : '');
  await runConfig('Barras bichos sin reventar (pican)', { ...bars, exercise: 'pullup', barTarget: 'bugs', barWait: 2, lives: 2 }, t => {}, 120, s => s.taken < 2 ? 'los bichos no pican al agotarse el tiempo' : '');
  await runConfig('Barras pompas sin reventar (se escapan)', { ...bars, exercise: 'row', barTarget: 'bubbles', barWait: 2, waves: 1, repsWave: 3 }, (t => { RA.PV.crouch = RA.state === 'play' && t > 25 && (t % 2.6) < 1.3; }), 200, s => s.taken !== 0 ? 'las pompas no deberían hacer daño' : '');

  // ---- menús ----
  RA.setSetting('mode', 'walkers'); RA.setSetting('exercise', 'squat');
  RA.startPreview(); frame(2);
  RA.settingsMenu(() => RA.lobbyMenu()); frame(2);
  for (const tab of ['Partida', 'Ejercicio', 'Enemigos', 'Sistema']) {
    press(tab); frame(1);
    const ws = RA.activeWidgets();
    ws.filter(w => w.kind === 'slider').forEach(w => { w.drag(0.7); w.commit(); w.drag(0.0); w.commit(); });
    ws.filter(w => w.label === '+').forEach(w => w.onPress());
    ws.filter(w => w.label === '−').forEach(w => w.onPress());
    frame(1);
  }
  press('Partida'); frame(1);
  const val = RA.activeWidgets().find(w => w.style === 'value'); val.onPress(); frame(1);
  ['1', '2', ',', '⌫', '5'].forEach(k => findW(k).onPress()); findW('OK').onPress(); frame(1);
  log('keypad result lives =', RA.settings.lives);
  press('Sistema'); frame(1); press('No'); frame(1); press('Sí'); frame(1); press('Columna'); frame(1); RA.activeWidgets().find(w => w.label === 'Auto' && w.style !== 'value').onPress(); frame(1);
  press('Volver'); frame(2);
  press('Arcos'); frame(1); log('Arcos offers only squats:', !RA.activeWidgets().some(w => w.label === 'Flexiones'), RA.settings.exercise);
  if (RA.activeWidgets().some(w => w.label === 'Flexiones') || RA.settings.exercise !== 'squat') errors.push('Arcos debería ofrecer solo sentadillas');
  // Toques: ejercicios propios, combinado con movimientos a elegir y ritmo marcado al compás
  press('Toques'); frame(1); const tw = RA.activeWidgets().map(w => w.label);
  log('Toques exercises:', ['Sentadillas', 'Saltos', 'Abdominales', 'Flexiones', 'Combinado'].every(l => tw.includes(l)), 'curl hidden', !tw.includes('Curl'));
  if (!['Saltos', 'Abdominales', 'Combinado'].every(l => tw.includes(l)) || tw.includes('Curl')) errors.push('el menú de Toques no ofrece sus ejercicios');
  RA.setSetting('comboFloor', 'push'); press('Combinado'); frame(1); press('Plancha'); frame(1); RA.activeWidgets().filter(w => w.label === 'Plancha')[1].onPress(); frame(1); press('Toque'); frame(1);
  log('combo floor moves:', RA.settings.comboBase, RA.settings.comboFloor);
  if (RA.settings.comboBase !== 'floor' || RA.settings.comboFloor !== 'push,plank,tap') errors.push('no se eligen los movimientos del combinado: ' + RA.settings.comboFloor);
  for (let i = 0; i < 4; i++) { findW(RA.activeWidgets().find(w => /^Al compás/.test(w.label)).label).onPress(); frame(1); await sleep(400); }
  log('tap tempo bpm', RA.settings.bpm); if (Math.abs(RA.settings.bpm - 150) > 12) errors.push('marcar el ritmo al compás no da ~150 BPM: ' + RA.settings.bpm);
  press('Sin ritmo'); frame(1); RA.setSetting('comboBase', 'stand');
  press('Enjambre'); frame(1); press('Más ajustes'); frame(1); press('Enemigos'); frame(1); press('Mirada'); frame(1); press('Volver'); frame(1);
  // barras: menús, colocar aparatos y pestaña de ajustes
  press('Barras'); frame(1); log('bars mode', RA.settings.mode, RA.settings.exercise);
  // colocar: el atril se oculta, H = manos arriba; a los 5 s queda colocada y aparece el menú de ajuste
  press('Colocar paralelas'); frame(2); log('placing: menu hidden', !RA.menu, 'on', RA.PLACE.on);
  if (RA.menu || !RA.PLACE.on) errors.push('Colocar no entra en el modo colocación');
  key('keydown', 'KeyH'); frame(120); const early = RA.PLACE.wait; frame(80); key('keyup', 'KeyH'); frame(60);
  log('hands up: placed at 4 s?', early, '→ menu', RA.activeWidgets().some(w => w.label === 'Girar izquierda'), 'dip', RA.settings.dipH, RA.settings.dipGap);
  if (early || !RA.activeWidgets().some(w => w.label === 'Girar izquierda')) errors.push('la colocación con las manos arriba no espera 5 s o no abre los ajustes');
  const dip0 = { ...RA.eqPose('dip') };
  press('Izquierda'); press('Alejar'); press('Girar izquierda'); press('Listo'); frame(1);
  log('dip nudged', (RA.eqPose('dip').x - dip0.x).toFixed(3), (RA.eqPose('dip').z - dip0.z).toFixed(3), (RA.eqPose('dip').yaw - dip0.yaw).toFixed(3), 'edit', RA.EQ.edit);
  press('Dominadas'); frame(1); press('Ajustar'); frame(1); RA.activeWidgets().filter(w => w.label === '+').forEach(w => w.onPress()); press('Listo'); frame(1);
  press('Colocar barra'); frame(3); key('keydown', 'Escape'); key('keyup', 'Escape'); frame(2); log('cancel placement → lobby menu', !!RA.menu && RA.activeWidgets().some(w => w.label === 'EMPEZAR'), 'on', RA.PLACE.on);
  if (RA.PLACE.on || !RA.activeWidgets().some(w => w.label === 'EMPEZAR')) errors.push('Esc no cancela la colocación');
  press('Más ajustes'); frame(1); press('Barras'); frame(1); RA.activeWidgets().filter(w => w.kind === 'slider').forEach(w => { w.drag(0.6); w.commit(); }); press('Bichos'); frame(1); press('Volver'); frame(1);
  press('Colgado'); frame(1); press('EMPEZAR'); frame(60); RA.openPause(); frame(2); press('Volver a colgarme'); frame(5); log('bars recalib state', RA.state, RA.BAR.phase);
  RA.openPause(); frame(2); press('Menú principal'); frame(2); press('Asalto'); frame(1); log('back to', RA.settings.mode, RA.settings.exercise);
  // ---- sesión: tres bloques seguidos, ajustes intactos y resumen ----
  RA.setSetting('mode', 'walkers'); RA.setSetting('exercise', 'squat'); RA.setSetting('waves', 5); RA.setSetting('repsWave', 12); RA.setSetting('rest', 2); RA.setSetting('lives', 0);
  RA.SES.blocks = [{ mode: 'arcs', ex: 'squat', n: 6 }, { mode: 'walkers', ex: 'pushup', n: 5 }, { mode: 'bars', ex: 'hang', n: 8 }]; RA.SES.rest = 3;
  const hist0 = JSON.parse(storage.get('reparena3-history') || '[]').length;
  RA.lobbyMenu(true); frame(2); log('lobby shows session:', RA.activeWidgets().some(w => /EMPEZAR SESIÓN/.test(w.label)));
  RA.activeWidgets().find(w => /EMPEZAR SESIÓN/.test(w.label)).onPress(); frame(2);
  let blocksSeen = new Set(), storedDuring = null;
  for (let i = 0; i < 9000 && RA.state !== 'end'; i++) {
    const ex = RA.settings.exercise; blocksSeen.add(RA.SES.idx + ':' + ex);
    RA.PV.crouch = RA.state === 'play' && (ex === 'squat' ? true : ex === 'pushup' ? (i % 80) < 44 : false);
    if (RA.SES.idx === 1 && !storedDuring) { RA.setSetting('volume', 75); storedDuring = JSON.parse(storage.get('reparena3-settings')); }
    frame(1);
  }
  RA.PV.crouch = false;
  const hist1 = JSON.parse(storage.get('reparena3-history') || '[]').length;
  log('session: state', RA.state, 'blocks played', [...blocksSeen].join(' '), 'results', RA.SES.results.map(r => r.reps).join('/'), 'stored mode during block 2', storedDuring && storedDuring.mode, 'restored', RA.settings.mode, RA.settings.exercise, RA.settings.waves, 'history +', hist1 - hist0);
  if (RA.state !== 'end' || RA.SES.results.length !== 3) errors.push('la sesión no juega los tres bloques');
  if (!storedDuring || storedDuring.mode !== 'walkers' || storedDuring.exercise !== 'squat') errors.push('durante la sesión se guardan los ajustes del bloque');
  if (RA.settings.mode !== 'walkers' || RA.settings.exercise !== 'squat' || RA.settings.waves !== 5) errors.push('al acabar la sesión no se restauran los ajustes');
  if (hist1 - hist0 !== 3) errors.push('el historial no recibe los bloques de la sesión');
  RA.SES.blocks = []; press('Menú principal'); frame(2);
  // pausa durante partida
  RA.setSetting('mode', 'walkers'); RA.setSetting('exercise', 'squat'); RA.lobbyMenu(); frame(1); press('EMPEZAR'); frame(120);
  RA.openPause(); frame(2); press('Ajustes'); frame(1); press('Volver'); frame(1); press('Continuar'); frame(10);
  RA.openPause(); frame(2); press('Terminar ronda'); frame(2); press('Otra ronda'); frame(30); log('mode after menu tests', RA.settings.mode);
  // desktop pointer path on a slider: emulate raycast by setting userData sizes
  RA.exitAll(); frame(1);

  // ---- WebXR con manos ----
  const xrFrame = makeXRFrame();
  await RA.startXR(false); for (let k = 0; k < 40; k++) { frame(2, 16, xrFrame); await sleep(20); } frame(40, 16, xrFrame);
  log('XR mode', RA.settings.mode, RA.settings.exercise); log('XR lobby state', RA.state, 'menu?', !!RA.menu, 'gloves seg count', RA.gloves.right.seg.count);
  // pulsar EMPEZAR con el índice derecho
  const w = findW('EMPEZAR'); w.mesh.updateWorldMatrix(true, false);
  const p = w.mesh.getWorldPosition(new THREE.Vector3()), n = w.mesh.getWorldDirection(new THREE.Vector3());
  XRS.tip = p.clone().addScaledVector(n, 0.05); frame(3, 16, xrFrame);
  XRS.tip = p.clone().addScaledVector(n, 0.02); frame(2, 16, xrFrame);
  XRS.tip = p.clone().addScaledVector(n, -0.01); frame(2, 16, xrFrame);
  log('after finger press state =', RA.state, RA.settings.mode);
  XRS.tip = null;
  frame(200, 16, xrFrame); log('after calib state =', RA.state, 'calibRef', RA.calibRef.toFixed(2));
  for (let i = 0; i < 1500 && RA.state !== 'end'; i++) { XRS.headY = (i % 150) < 80 ? 1.30 : 1.70; frame(1, 16, xrFrame); }
  log('XR squats: state', RA.state, 'reps', RA.stats.reps, 'kills', RA.stats.kills);
  // abrir menú desde la muñeca: girar la muñeca izquierda hacia la cara
  RA.beginRun(); frame(250, 16, xrFrame);
  XRS.wristUp = true; frame(5, 16, xrFrame);
  log('watch visible', RA.watch.mesh.visible);
  const wp = RA.watch.mesh.getWorldPosition(new THREE.Vector3()), wn = RA.watch.mesh.getWorldDirection(new THREE.Vector3());
  XRS.tip = wp.clone().addScaledVector(wn, 0.04); frame(2, 16, xrFrame); XRS.tip = wp.clone().addScaledVector(wn, -0.005); frame(2, 16, xrFrame);
  log('after watch press state =', RA.state); XRS.wristUp = false; XRS.tip = null;
  if (RA.state === 'paused') { press('Salir del juego'); frame(3, 16, xrFrame); }
  log('after exit xrActive', RA.xrActive, 'state', RA.state);
  await RA.startXR(true); await sleep(700); frame(20, 16, xrFrame); log('AR lobby', RA.state); RA.exitAll(); frame(2, 16, xrFrame);

  // ---- Barras en XR: colocar la barra con las manos, ancla persistente, dominadas y caída ----
  for (const [k, v] of Object.entries({ mode: 'bars', exercise: 'pullup', lives: 3, waves: 2, repsWave: 3, repsInc: 0, rest: 0, barTarget: 'bubbles', barWait: 0, barArrive: 2, fallMargin: 12, pullRange: 35 })) RA.setSetting(k, v);
  storage.delete('reparena3-equip'); RA.EQ.xr.door.set = false; RA.EQ.xr.door.handle = null;
  XRS.headY = 1.7; await RA.startXR(true); await sleep(700); frame(20, 16, xrFrame);
  log('XR bars: anchors requested', navigator.xr.last.opts.optionalFeatures.includes('anchors'), 'state', RA.state);
  press('EMPEZAR'); frame(2, 16, xrFrame); log('EMPEZAR without bar starts placement:', RA.PLACE.on, 'menu hidden', !RA.menu);
  XRS.grip = { left: new THREE.Vector3(-0.25, 0.95, -0.1), right: new THREE.Vector3(0.25, 0.95, -0.1) }; frame(400, 16, xrFrame);
  log('hands down 6 s: placed?', RA.EQ.xr.door.set);
  if (RA.EQ.xr.door.set) errors.push('se coloca la barra con las manos abajo');
  XRS.grip = { left: new THREE.Vector3(-0.3, 2.21, -0.35), right: new THREE.Vector3(0.3, 2.21, -0.35) };
  frame(200, 16, xrFrame); const at3 = RA.EQ.xr.door.set; frame(150, 16, xrFrame); log('hands over head: placed at 3.2 s?', at3, 'at 5.6 s?', RA.EQ.xr.door.set);
  if (at3 || !RA.EQ.xr.door.set) errors.push('las manos arriba no colocan la barra a los 5 s');
  XRS.grip = null; frame(100, 16, xrFrame); log('adjust menu after placing:', RA.activeWidgets().some(w => w.label === 'Girar izquierda'));
  const door = RA.EQ.xr.door; log('door from hands: set', door.set, 'doorH', RA.settings.doorH, 'x', door.x.toFixed(2), 'z', door.z.toFixed(2), 'yaw', door.yaw.toFixed(2));
  if (!door.set || Math.abs(RA.settings.doorH - 222) > 2 || Math.abs(door.z + 0.35) > 0.02) errors.push('colocar la barra con las manos no funciona');
  press('Listo'); frame(2, 16, xrFrame); await sleep(10); frame(2, 16, xrFrame);
  log('anchor handle', door.handle, 'saved', JSON.parse(storage.get('reparena3-equip')).door.handle);
  if (!door.handle) errors.push('no se guarda el ancla persistente');
  const barGrip = { left: new THREE.Vector3(-0.3, 2.21, -0.35), right: new THREE.Vector3(0.3, 2.21, -0.35) };
  press('EMPEZAR'); frame(2, 16, xrFrame); XRS.headY = 1.56; frame(100, 16, xrFrame);
  log('standing under the bar with hands down: still mounting?', RA.state === 'mount'); if (RA.state !== 'mount') errors.push('XR barras: de pie con las manos abajo se da por colgado');
  XRS.grip = barGrip; frame(330, 16, xrFrame); log('after mount state', RA.state, 'ref', RA.BAR.ref.toFixed(2));
  if (RA.state !== 'play') errors.push('XR barras: no empieza la oleada al colgarse (' + RA.state + ')');
  const up = i => { XRS.headY = (i % 120) < 60 ? 1.56 + 0.4 : 1.56; frame(1, 16, xrFrame); };
  for (let i = 0; i < 2000 && RA.stats.reps < 2; i++) up(i);
  XRS.headY = 1.48; frame(15, 16, xrFrame); XRS.headY = 1.56; frame(30, 16, xrFrame); const r0 = RA.stats.reps;
  for (let i = 0; i < 400 && RA.stats.reps < r0 + 2; i++) up(i);
  log('reps after a deeper dip (no fall):', RA.stats.reps - r0, 'falls', RA.stats.falls);
  if (RA.stats.reps - r0 < 2 || RA.stats.falls) errors.push('XR barras: tras bajar algo más sin caer, deja de contar');
  XRS.headY = 1.36; frame(10, 16, xrFrame); log('after letting go: state', RA.state, 'falls', RA.stats.falls, 'lives', RA.lives);
  if (RA.state !== 'mount' || RA.stats.falls !== 1) errors.push('XR barras: soltarse no te tira al charco');
  XRS.headY = 1.56; frame(330, 16, xrFrame); log('back on the bar', RA.state);
  // caer de pie: la cabeza sube un poco, pero las manos bajan y se ven
  XRS.grip = null; XRS.headY = 1.66; frame(40, 16, xrFrame); log('let go landing on feet: state', RA.state, 'falls', RA.stats.falls);
  if (RA.state !== 'mount' || RA.stats.falls !== 2) errors.push('XR barras: al caer de pie sigue contando que estás colgado');
  frame(300, 16, xrFrame); if (RA.state !== 'mount') errors.push('XR barras: de pie tras caer se vuelve a dar por colgado');
  XRS.grip = barGrip; XRS.headY = 1.56; frame(330, 16, xrFrame); log('back on the bar again', RA.state);
  for (let i = 0; i < 4000 && RA.state !== 'end'; i++) up(i);
  XRS.grip = null;
  log('XR pull-ups: state', RA.state, 'reps', RA.stats.reps, 'perfect', RA.stats.perfect, 'kills', RA.stats.kills, 'falls', RA.stats.falls);
  if (RA.state !== 'end' || RA.stats.kills < 3) errors.push('XR barras: la partida no termina bien');
  RA.exitAll(); frame(2, 16, xrFrame);
  // otra sesión: la barra vuelve a su sitio gracias al ancla, aunque el origen de la sesión haya cambiado
  E.anchorStore.get(door.handle).position.x += 1; const oldX = door.x;
  await RA.startXR(true); await sleep(50); frame(5, 16, xrFrame);
  log('anchor restored', navigator.xr.last.restored[0] === door.handle, 'x moved by', (door.x - oldX).toFixed(2));
  if (Math.abs(door.x - oldX - 1) > 0.01) errors.push('el ancla restaurada no mueve la barra');
  RA.exitAll(); frame(2, 16, xrFrame);

  // ---- Plancha con un brazo en XR: cada brazo dispara a su lado; los dos a la vez no cuentan ----
  for (const [k, v] of Object.entries({ mode: 'walkers', exercise: 'plank1', lives: 0, waves: 1, repsWave: 30, rest: 0, walkTime: 6, maxAlive: 4, spawnGap: 0.5 })) RA.setSetting(k, v);
  XRS.headY = 1.7; await RA.startXR(false); await sleep(700); frame(20, 16, xrFrame);
  RA.beginRun(); XRS.headY = 0.55; frame(200, 16, xrFrame); frame(250, 16, xrFrame);
  log('plank1 after calib', RA.state, 'enemies', RA.enemies.length);
  const sideOf = e => e.pos.x < 0 ? 'left' : 'right', hpSide = s => RA.enemies.filter(e => e.alive && sideOf(e) === s).reduce((a, e) => a + e.hp, 0);
  const hl0 = hpSide('left'), hr0 = hpSide('right'), pr0 = RA.stats.reps;
  XRS.lift = 'left'; frame(40, 16, xrFrame); XRS.lift = null; frame(40, 16, xrFrame);
  log('lift left: reps +' + (RA.stats.reps - pr0), 'left hp', hl0, '→', hpSide('left'), 'right hp', hr0, '→', hpSide('right'));
  if (RA.stats.reps - pr0 !== 1 || hpSide('right') < hr0) errors.push('plancha: levantar el brazo izquierdo no dispara solo a la izquierda');
  const r1 = RA.stats.reps; XRS.lift = 'both'; frame(60, 16, xrFrame); XRS.lift = null; frame(30, 16, xrFrame);
  log('lift both: reps +' + (RA.stats.reps - r1));
  if (RA.stats.reps !== r1) errors.push('plancha: levantar los dos brazos no debería disparar');
  RA.exitAll(); frame(2, 16, xrFrame);

  // ---- Una sola paralela: las manos van a lo largo de la barra ----
  for (const [k, v] of Object.entries({ mode: 'bars', exercise: 'row', dipBars: '1', dipGap: 58 })) RA.setSetting(k, v);
  XRS.headY = 1.7; await RA.startXR(true); await sleep(700); frame(20, 16, xrFrame);
  press('Colocar paralela'); frame(2, 16, xrFrame); XRS.headY = 0.45;
  XRS.grip = { left: new THREE.Vector3(-0.25, 0.95, -0.2), right: new THREE.Vector3(0.25, 0.95, -0.2) }; frame(350, 16, xrFrame); XRS.grip = null;
  const dip1 = RA.EQ.xr.dip; log('one dip bar from hands: set', dip1.set, 'yaw', dip1.yaw.toFixed(2), 'dipH', RA.settings.dipH, 'gap kept', RA.settings.dipGap);
  if (!dip1.set || Math.abs(Math.abs(dip1.yaw) - Math.PI / 2) > 0.05 || RA.settings.dipGap !== 58) errors.push('colocar una sola paralela con las manos no funciona');
  XRS.headY = 1.7; frame(100, 16, xrFrame); press('Listo'); frame(2, 16, xrFrame); RA.setSetting('dipBars', '2'); RA.exitAll(); frame(2, 16, xrFrame);

  // ---- Al calibrar, el entorno se coloca según tu posición y hacia dónde mira tu cuerpo (en plancha, mirando al suelo) ----
  for (const [k, v] of Object.entries({ mode: 'walkers', exercise: 'pushup', lives: 0, waves: 1, repsWave: 4 })) RA.setSetting(k, v);
  XRS.headY = 1.7; await RA.startXR(true); await sleep(700); frame(20, 16, xrFrame);
  RA.beginRun(); XRS.headX = 1.0; XRS.headZ = 0.3; XRS.headY = 0.55;
  XRS.headQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.4, -Math.PI / 2, 0, 'YXZ')); // cuerpo hacia +X, mirando al suelo
  frame(200, 16, xrFrame);
  log('calib follows body: state', RA.state, 'arena pos', RA.arena.position.x.toFixed(2), RA.arena.position.z.toFixed(2), 'yaw', RA.arena.rotation.y.toFixed(2));
  if (RA.state !== 'ready' || Math.abs(RA.arena.position.x - 1) > 0.02 || Math.abs(RA.arena.position.z - 0.3) > 0.02 || Math.abs(RA.arena.rotation.y + Math.PI / 2) > 0.05) errors.push('al calibrar el entorno no se coloca según el cuerpo');
  XRS.headX = XRS.headZ = 0; XRS.headQ = null; RA.exitAll(); frame(2, 16, xrFrame);

  // ---- Flexiones en XR: calibrar un poco alto o mirar al suelo no debe impedir el disparo ----
  for (const [k, v] of Object.entries({ mode: 'walkers', exercise: 'pushup', lives: 0, waves: 1, repsWave: 6, rest: 0, walkTime: 30, pushDepth: 13 })) RA.setSetting(k, v);
  for (const [name, calibY, topY, low, want] of [['calibrada a cuatro patas', 0.68, 0.56, 0.22, 4], ['mirando al suelo', 0.56, 0.51, 0.22, 4], ['medias flexiones', 0.56, 0.56, 0.08, 0]]) {
    XRS.headY = 1.7; await RA.startXR(false); await sleep(700); frame(20, 16, xrFrame);
    RA.beginRun(); XRS.headY = calibY; frame(200, 16, xrFrame); XRS.headY = topY; frame(60, 16, xrFrame);
    for (let i = 0; i < 1000 && RA.state !== 'end'; i++) { XRS.headY = (i % 150) < 75 ? topY - low : topY; frame(1, 16, xrFrame); }
    log(`XR push-ups ${name}: reps`, RA.stats.reps, 'partial', RA.stats.partial);
    if (want ? RA.stats.reps < want : RA.stats.reps) errors.push(`flexiones ${name}: ${RA.stats.reps} repeticiones`);
    RA.exitAll(); frame(2, 16, xrFrame);
  }

  // ---- Spotify ----
  await sleep(50);
  log('spotify: connected', !!RA.SP.cfg.refresh, 'url cleaned', global.location.replaced, 'now:', RA.spNowText());
  if (!RA.SP.cfg.refresh || !/Eye of the Tiger/.test(RA.spNowText())) errors.push('Spotify: no se conecta con el código de vuelta');
  RA.setSetting('mode', 'walkers'); RA.setSetting('exercise', 'squat');
  RA.startPreview(); frame(2); press('Pausa'); await sleep(20); frame(2); log('after Pausa: playing', SPOT.playing, 'button', RA.activeWidgets().some(w => w.label === 'Play'));
  press('Siguiente'); await sleep(20); press('Vol +'); await sleep(20); await RA.spRefresh(); frame(2);
  log('after next/vol:', RA.spNowText());
  for (const c of ['PUT /v1/me/player/pause', 'POST /v1/me/player/next', 'PUT /v1/me/player/volume?volume_percent=60']) if (!SPOT.calls.includes(c)) errors.push('Spotify: falta la llamada ' + c);
  RA.SP.cfg.access = 'caducado'; const tc = SPOT.tokenCalls; await RA.spRefresh(); log('expired token refreshed', SPOT.tokenCalls === tc + 1, RA.spNowText());
  if (SPOT.tokenCalls !== tc + 1 || RA.SP.err) errors.push('Spotify: no renueva el token caducado');
  SPOT.noDevice = true; await RA.spRefresh(); RA.spToggle(); await sleep(20); log('no device:', RA.spNowText());
  if (!/pon algo a sonar/.test(RA.spNowText())) errors.push('Spotify: sin reproductor no avisa');
  SPOT.noDevice = false; RA.exitAll(); frame(1);

  console.warn = origWarn;
  // ---- Menú en la muñeca izquierda: sale al mirarla, se pulsa con el índice derecho y se recoge ----
  RA.setSetting('menuWhere', 'wrist'); RA.setSetting('mode', 'walkers'); RA.setSetting('exercise', 'squat');
  XRS.headY = 1.7; await RA.startXR(false); await sleep(700); frame(40, 16, xrFrame);
  {
    const m = RA.menu, g = m.group, lw = new THREE.Vector3(-0.2, 1.25, -0.3);
    log('wrist menu: on wrist', m.wrist, 'visible', g.visible, 'scale', g.scale.x.toFixed(2), 'dist to wrist', g.position.distanceTo(lw).toFixed(2), 'stand', RA.stand.visible);
    if (!m.wrist || !g.visible || Math.abs(g.scale.x - 0.46) > 0.01 || g.position.distanceTo(lw) > 0.45 || RA.stand.visible) errors.push('el menú no sale de la muñeca izquierda');
    const w = RA.activeWidgets().find(w => w.label === 'Más ajustes'), wp = new THREE.Vector3(), wn = new THREE.Vector3(0, 0, 1);
    w.mesh.getWorldPosition(wp); wn.copy(w.mesh.localToWorld(new THREE.Vector3(0, 0, 1))).sub(wp).normalize();
    const before = g.position.clone();
    for (const d of [0.08, 0.05, 0.03, 0.015, 0.0, -0.01]) { XRS.tip = wp.clone().addScaledVector(wn, d); frame(2, 16, xrFrame); }
    XRS.tip = null; frame(2, 16, xrFrame);
    const pressed = RA.activeWidgets().some(x => x.label === 'Volver' || x.label === '‹ Volver' || /Volver/.test(x.label));
    log('wrist menu poke with right index → settings opened', pressed, 'panel kept still', before.distanceTo(g.position) < 0.01);
    if (!pressed) errors.push('el panel de la muñeca no se puede pulsar con el índice derecho');
    XRS.noLeft = true; frame(60, 16, xrFrame); log('left hand away: panel hidden', !RA.menu.group.visible);
    if (RA.menu.group.visible) errors.push('el panel de la muñeca no se recoge al bajar la mano');
    XRS.noLeft = false; frame(40, 16, xrFrame);
    if (!RA.menu.group.visible) errors.push('el panel de la muñeca no vuelve a salir');
  }
  RA.setSetting('menuWhere', 'stand'); RA.exitAll(); frame(2, 16, xrFrame);
  RA.setSetting('menuWhere', 'wrist');

  // ---- Pistolas en XR con mandos: bláster en cada mano y el gatillo dispara ----
  for (const [k, v] of Object.entries({ mode: 'flyers', exercise: 'squat', pistol: 1, lives: 0, waves: 1, repsWave: 6, rest: 0, flySpeed: 8, squatDepth: 25 })) RA.setSetting(k, v);
  XRS.controllers = true; XRS.headY = 1.7; await RA.startXR(false); await sleep(700); frame(20, 16, xrFrame);
  RA.beginRun(); frame(250, 16, xrFrame); log('pistol XR state', RA.state, 'blasters', RA.BLASTERS.left.visible, RA.BLASTERS.right.visible, 'palm hidden', !RA.gloves.left.palm.visible);
  if (!RA.BLASTERS.left.visible || !RA.BLASTERS.right.visible || RA.gloves.left.palm.visible) errors.push('pistolas XR: no se ven los blásters en los mandos');
  for (let i = 0; i < 2400 && RA.state !== 'end'; i++) { const ph = i % 160; XRS.headY = ph < 70 ? 1.38 : 1.7; XRS.trig = ph > 100 && ph < 104 ? 'right' : ph > 120 && ph < 124 ? 'left' : null; frame(1, 16, xrFrame); }
  log('pistol XR: shots', RA.stats.shots, 'hits', RA.stats.hits, 'kills', RA.stats.kills, 'reps', RA.stats.reps, 'state', RA.state);
  if (RA.stats.shots < 4) errors.push('pistolas XR: el gatillo de los mandos no dispara');
  XRS.controllers = false; XRS.trig = null; RA.setSetting('pistol', 0); RA.exitAll(); frame(2, 16, xrFrame);

  // ---- Toques en XR: abdominales boca arriba; el entorno mira hacia los pies y la cabeza alcanza los aros ----
  for (const [k, v] of Object.entries({ mode: 'touch', exercise: 'abs', lives: 0, waves: 1, repsWave: 5, tchHands: 0, tchArrive: 2, tchGap: 2.5, tchWindow: 1.5 })) RA.setSetting(k, v);
  XRS.headY = 1.7; await RA.startXR(false); await sleep(700); frame(20, 16, xrFrame);
  RA.beginRun(); XRS.headX = 0.5; XRS.headZ = -0.2; XRS.headY = 0.2;
  XRS.headQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.3, Math.PI / 2, 0, 'YXZ')); // boca arriba, pies hacia -X
  frame(250, 16, xrFrame);
  log('abs XR calib: state', RA.state, 'arena yaw', RA.arena.rotation.y.toFixed(2), 'ref', RA.TCH.ref.toFixed(2));
  if (RA.state !== 'ready' || Math.abs(RA.arena.rotation.y - Math.PI / 2) > 0.05) errors.push('abdominales XR: boca arriba el entorno no mira hacia los pies');
  const lie = new THREE.Vector3(0.5, 0.2, -0.2);
  for (let i = 0; i < 2500 && RA.state !== 'end'; i++) {
    const tg = RA.touches.find(x => x.alive && !x.judged && x.mode === 'wait'), p = tg ? RA.arena.localToWorld(tg.pos.clone()) : lie;
    XRS.headX += (p.x - XRS.headX) * 0.15; XRS.headY += (p.y - XRS.headY) * 0.15; XRS.headZ += (p.z - XRS.headZ) * 0.15; frame(1, 16, xrFrame);
  }
  log('abs XR: reps', RA.stats.reps, 'misses', RA.stats.taken, 'state', RA.state);
  if (RA.stats.reps < 5 || RA.stats.taken) errors.push(`abdominales XR: ${RA.stats.reps} tocados, ${RA.stats.taken} fallos`);
  XRS.headX = XRS.headZ = 0; XRS.headQ = null; RA.exitAll(); frame(2, 16, xrFrame);

  // ---- Superman en XR: tumbado mirando al suelo; subir ~10 cm y aguantar dispara, con las manos por delante ----
  for (const [k, v] of Object.entries({ mode: 'flyers', exercise: 'superman', lives: 0, waves: 1, repsWave: 30, rest: 0, supHold: 2, supRange: 8, supArms: 'yes' })) RA.setSetting(k, v);
  for (const [name, calibY, lieY, liftY, handsZ, want] of [['normal', 0.25, 0.25, 0.35, -0.6, 3], ['calibrado más bajo', 0.15, 0.25, 0.35, -0.6, 3], ['calibrado más alto', 0.45, 0.25, 0.35, -0.6, 3], ['manos junto a la cabeza', 0.25, 0.25, 0.35, 0.0, 0], ['subiendo poco', 0.25, 0.25, 0.29, -0.6, 0]]) {
    XRS.headY = 1.7; await RA.startXR(false); await sleep(700); frame(20, 16, xrFrame);
    RA.beginRun(); XRS.headY = calibY; XRS.headQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.2, 0, 0, 'YXZ'));
    XRS.hands = { left: new THREE.Vector3(-0.2, 0.08, -0.55), right: new THREE.Vector3(0.2, 0.08, -0.55) };
    frame(250, 16, xrFrame);
    XRS.hands = { left: new THREE.Vector3(-0.2, 0.08, handsZ), right: new THREE.Vector3(0.2, 0.08, handsZ) };
    XRS.headY = lieY; frame(120, 16, xrFrame); const r0 = RA.stats.reps;
    if (process.env.DBG) log(name, 'after lie', RA.state, JSON.stringify(RA.DET.su));
    for (let i = 0; i < 1500; i++) { const up = (i % 300) < 190; if (process.env.DBG && i % 50 === 0) log(i, RA.state, RA.DET.su.state, RA.DET.su.ref.toFixed(3), RA.DET.su.lo.toFixed(3), XRS.headY); XRS.headY = up ? liftY : lieY; XRS.headQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(up ? -0.5 : -1.2, 0, 0, 'YXZ')); frame(1, 16, xrFrame); }
    const got = RA.stats.reps - r0; log(`superman XR ${name}: reps ${got}`);
    if (want ? got < want : got) errors.push(`superman XR (${name}): ${got} disparos`);
    XRS.hands = null; XRS.headQ = null; RA.exitAll(); frame(2, 16, xrFrame);
  }
  log('\nERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
  log('audio nodes created', E.stats().audioNodes);
})().catch(e => { console.log('FATAL', e.stack); console.log('ERRORS so far:\n' + errors.join('\n')); });

// ---------- simulador de frames XR ----------
const XRS = { headY: 1.7, tip: null, wristUp: false };
function makeXRFrame() {
  const HJ = RA.HJ;
  const mkHand = side => { const m = new Map(); HJ.forEach(n => m.set(n, { name: n, side })); m.size; return m; };
  const handL = mkHand('left'), handR = mkHand('right');
  const sources = [{ handedness: 'left', hand: handL, targetRaySpace: { ray: 'left' } }, { handedness: 'right', hand: handR, targetRaySpace: { ray: 'right' } }];
  const pads = { left: { buttons: [{ pressed: false }] }, right: { buttons: [{ pressed: false }] } };
  const ctrls = ['left', 'right'].map(h => ({ handedness: h, gripSpace: { grip: h }, targetRaySpace: { ray: h }, gamepad: pads[h] }));
  return () => {
    const s = RA.renderer.xr.getSession(), src = XRS.controllers ? ctrls : sources; if (s) s.inputSources = src;
    pads.left.buttons[0].pressed = XRS.trig === 'left'; pads.right.buttons[0].pressed = XRS.trig === 'right';
    return {
      session: s || { inputSources: src },
      getViewerPose() { const q = XRS.headQ || { x: 0, y: 0, z: 0, w: 1 }; return { transform: { position: { x: XRS.headX || 0, y: XRS.headY, z: XRS.headZ || 0 }, orientation: { x: q.x, y: q.y, z: q.z, w: q.w } } }; },
      createAnchor(xf, space) { return Promise.resolve(E.makeAnchor({ position: { ...xf.position }, orientation: { ...xf.orientation } })); },
      getPose(space) { if (space.anchorPose) return { transform: space.anchorPose }; if (space.grip) return { transform: { position: { x: space.grip === 'left' ? -0.2 : 0.2, y: XRS.headY - 0.4, z: -0.3 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } }; const x = space.ray === 'left' ? -0.2 : 0.2; return { transform: { position: { x, y: XRS.headY - 0.4, z: -0.3 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } }; },
      getJointPose(j) {
        if (XRS.noLeft && j.side === 'left') return null;
        const side = j.side === 'left' ? -1 : 1, i = HJ.indexOf(j.name);
        let pos = { x: side * 0.2 + (i % 5) * 0.01, y: XRS.headY - 0.45 + Math.floor(i / 5) * 0.01, z: -0.3 - Math.floor(i / 5) * 0.02 };
        let ori = { x: 0, y: 0, z: 0, w: 1 };
        if (j.side === 'left' && XRS.wristUp) { pos = { x: -0.1 + (i % 5) * 0.01, y: XRS.headY - 0.3, z: -0.35 - Math.floor(i / 5) * 0.02 }; ori = { x: 0.7071, y: 0, z: 0, w: 0.7071 }; }
        if (j.side === 'right' && i === 9 && XRS.tip) pos = { x: XRS.tip.x, y: XRS.tip.y, z: XRS.tip.z };
        if (XRS.lift === j.side || XRS.lift === 'both') pos.y += 0.4;
        if (XRS.hands) { const g = XRS.hands[j.side]; pos = { x: g.x + (i % 5) * 0.01, y: g.y, z: g.z - Math.floor(i / 5) * 0.02 }; }
        if (XRS.grip) { const g = XRS.grip[j.side]; pos = { x: g.x, y: g.y - (i === 10 ? 0.02 : 0), z: g.z + (i === 10 ? 0.02 : 0) }; }
        return { transform: { position: pos, orientation: ori }, radius: 0.009 };
      }
    };
  };
}
