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
  location: { protocol: 'https:', hostname: 'example.com' },
  AudioContext: E.AudioContext
});
Object.defineProperty(global, 'navigator', { value: { xr: E.makeXR() }, configurable: true });
let src = fs.readFileSync(require('path').join(__dirname, '..', 'build', 'game.js'), 'utf8');
const expose = `
window.__RA = { get state(){return state}, get menu(){return menu}, settings, get enemies(){return enemies}, get arcs(){return arcs}, get stats(){return stats}, get waveIdx(){return waveIdx}, get lives(){return lives},
  PV, startPreview, renderer, gates, hands, head, onRep, onCharge, openPause, settingsMenu, lobbyMenu, keypadKey, keypadOK, openKeypad, activeWidgets, SPLEGS, debris, get projs(){return projs}, get spawnQueue(){return spawnQueue},
  setSetting, startXR, gloves, watch, exitAll, beginRun, AUD, PADD, PNORM, scene, arena, HJ, get xrActive(){return xrActive}, resumeGame, get calibRef(){return calibRef}, HL, endRun, get score(){return score}, DET, get msg(){return msg} };
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

async function runConfig(name, cfg, simulate, maxSec = 420) {
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
  log(`${name}: state=${RA.state} t=${t.toFixed(0)}s reps=${s.reps} perfect=${s.perfect} kills=${s.kills} taken=${s.taken} shots=${s.shots} hits=${s.hits} maxActive=${maxEnemies} particles=${RA.PADD.p.length}/${RA.PNORM.p.length} debris=${RA.debris.length} score=${RA.score}`);
  if (RA.state !== 'end') errors.push(`${name}: did not finish (state ${RA.state}, wave ${RA.waveIdx}, queue ${RA.spawnQueue.length}, enemies ${RA.enemies.length})`);
  press('Menú principal'); frame(5);
  RA.exitAll(); frame(1);
}
const squatSim = (period = 2.6) => t => { RA.PV.crouch = (t % period) < period * 0.55; };
let curlSide = 0; const curlSim = t => { const ph = t % 1.4; if (ph < 0.034) { RA.onCharge(); RA.onRep({ perfect: false }, (curlSide++ % 2) ? 'left' : 'right'); } };

(async () => {
  await sleep(150);
  log('boot ok; renders so far', RA.renderer.renders);
  const base = { lives: 0, waves: 2, repsWave: 4, repsInc: 1, rest: 5, walkTime: 8, flySpeed: 6, maxAlive: 5, perfectTime: 1.0, arcRate: 20, arcSpeed: 12, arcMin: 15, arcMax: 30 };
  await runConfig('Asalto+sentadillas', { ...base, mode: 'walkers', exercise: 'squat' }, squatSim());
  await runConfig('Asalto+flexiones', { ...base, mode: 'walkers', exercise: 'pushup', walkTime: 6 }, squatSim(2.6));
  await runConfig('Asalto+curl', { ...base, mode: 'walkers', exercise: 'curl' }, curlSim);
  await runConfig('Enjambre+sentadillas', { ...base, mode: 'flyers', exercise: 'squat' }, squatSim());
  await runConfig('Enjambre+flexiones', { ...base, mode: 'flyers', exercise: 'pushup' }, squatSim());
  await runConfig('Enjambre+curl', { ...base, mode: 'flyers', exercise: 'curl' }, curlSim);
  await runConfig('Arcos', { ...base, mode: 'arcs', exercise: 'squat', arcDouble: 40 }, t => { RA.PV.crouch = true; });
  await runConfig('Arcos sin agacharse (golpes)', { ...base, mode: 'arcs', exercise: 'squat', lives: 3, waves: 1 }, t => { RA.PV.crouch = false; }, 120);
  await runConfig('Asalto con vidas (derrota)', { ...base, mode: 'walkers', exercise: 'squat', lives: 1, walkTime: 4 }, t => { RA.PV.crouch = false; }, 120);
  await runConfig('Jefe en oleada final', { ...base, mode: 'walkers', exercise: 'squat', waves: 1, repsWave: 10 }, squatSim(2.4));

  // ---- menús ----
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
  press('Arcos'); frame(1); press('Flexiones'); frame(1); log('mode after picking Flexiones in Arcos:', RA.settings.mode, RA.settings.exercise);
  press('Enjambre'); frame(1); press('Más ajustes'); frame(1); press('Enemigos'); frame(1); press('Mirada'); frame(1); press('Volver'); frame(1);
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

  console.warn = origWarn;
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
  return () => {
    const s = RA.renderer.xr.getSession(); if (s) s.inputSources = sources;
    return {
      session: s || { inputSources: sources },
      getViewerPose() { return { transform: { position: { x: 0, y: XRS.headY, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } }; },
      getPose(space) { const x = space.ray === 'left' ? -0.2 : 0.2; return { transform: { position: { x, y: XRS.headY - 0.4, z: -0.3 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } }; },
      getJointPose(j) {
        const side = j.side === 'left' ? -1 : 1, i = HJ.indexOf(j.name);
        let pos = { x: side * 0.2 + (i % 5) * 0.01, y: XRS.headY - 0.45 + Math.floor(i / 5) * 0.01, z: -0.3 - Math.floor(i / 5) * 0.02 };
        let ori = { x: 0, y: 0, z: 0, w: 1 };
        if (j.side === 'left' && XRS.wristUp) { pos = { x: -0.1 + (i % 5) * 0.01, y: XRS.headY - 0.3, z: -0.35 - Math.floor(i / 5) * 0.02 }; ori = { x: 0.7071, y: 0, z: 0, w: 0.7071 }; }
        if (j.side === 'right' && i === 9 && XRS.tip) pos = { x: XRS.tip.x, y: XRS.tip.y, z: XRS.tip.z };
        return { transform: { position: pos, orientation: ori }, radius: 0.009 };
      }
    };
  };
}
