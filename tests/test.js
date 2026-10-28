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
  if (method === 'PUT' && path === '/me/player') { const b = JSON.parse(opts.body); SPOT.device = b.device_ids[0]; SPOT.playing = !!b.play; return res(204); }
  if (method === 'GET' && path === '/me/player') return SPOT.noDevice ? res(204) : res(200, { is_playing: SPOT.playing, device: { id: SPOT.device || 'phone', name: SPOT.device === 'quest-sdk' ? 'RepArena (Quest)' : 'Móvil', volume_percent: SPOT.vol, supports_volume: true }, item: { id: 'id-' + SPOT.track, name: SPOT.track, artists: [{ name: 'Survivor' }], external_ids: { isrc: 'USSM18200001' } } });
  if (method === 'GET' && path === '/me/player/devices') return res(200, { devices: SPOT.noDevice ? [] : [{ id: 'quest', is_active: true }] });
  if (method === 'PUT' && path === '/me/player/pause') { SPOT.playing = false; return res(204); }
  if (method === 'PUT' && path.startsWith('/me/player/play')) { SPOT.playing = true; SPOT.playBody = opts.body ? JSON.parse(opts.body) : null; SPOT.playPath = path; return res(204); }
  if (method === 'PUT' && path.startsWith('/me/player/shuffle')) return res(204);
  if (method === 'GET' && path.startsWith('/me/playlists')) return res(200, { items: [{ id: 'pl1', name: 'Correr', uri: 'spotify:playlist:pl1', tracks: { total: 3 } }, { id: 'pl2', name: 'Pesas', uri: 'spotify:playlist:pl2', tracks: { total: 2 } }], next: null });
  if (method === 'GET' && path.startsWith('/playlists/')) { const id = path.split('/')[2]; return res(200, { items: [1, 2, 3].map(i => ({ track: { uri: `spotify:track:${id}-${i}` } })) }); }
  if (method === 'POST' && path === '/me/player/next') { SPOT.track = 'Siguiente canción'; return res(204); }
  if (method === 'POST' && path === '/me/player/previous') return res(204);
  if (method === 'PUT' && path.startsWith('/me/player/volume?volume_percent=')) { SPOT.vol = +path.split('=')[1]; return res(204); }
  return res(404, { error: { status: 404, message: 'Not found' } });
};
let src = fs.readFileSync(require('path').join(__dirname, '..', 'build', 'game.js'), 'utf8');
const expose = `
window.__RA = { viewQ, BIGN, arxMul, WIN, startWave, hideMenu, cheer, say, BRACE, drawBoard, get combo(){return combo}, set combo(v){combo = v}, punchStep, PUNCH, FRONT_MIN, SP_FADE, WM, wristFar, DEMOV, center, showToast, PK, PERKS, GH, RUSH, GOLD, CHEST, perkOnHit, perkSlow, hurtPlayer, onKilled, registerRep, ghostText, rushStart, rushStop, chestMaybe, stand, get state(){return state}, get menu(){return menu}, settings, get enemies(){return enemies}, get arcs(){return arcs}, get stats(){return stats}, get waveIdx(){return waveIdx}, get lives(){return lives},
  PV, startPreview, renderer, gates, hands, head, onRep, onCharge, openPause, settingsMenu, lobbyMenu, keypadKey, keypadOK, openKeypad, activeWidgets, SPLEGS, debris, get projs(){return projs}, get spawnQueue(){return spawnQueue},
  setSetting, startXR, gloves, watch, exitAll, beginRun, AUD, PADD, PNORM, scene, arena, HJ, get xrActive(){return xrActive}, resumeGame, get calibRef(){return calibRef}, HL, endRun, onWatch, VX, vortex, SWD, blockPoint, get arMode(){return arMode}, forest, env, get xrAR(){return xrAR}, eqLocal, dipOne, pokeWidgets, fingers, Btn, panelHides, collectThreats, HUD, board, toastP, progress, kcalOf, progressLine, HTH, POKE, SCHEMA, gateSolids, beatNow, RPL: (() => { try { return RPL; } catch (e) { return null; } })(), spMyLists, spPlayLists, locks, lasers, SPP, spPlayerInit, get menuH(){return menu && menu.H}, SND, buzzLoop, saberLoop, sampleNames, get score(){return score}, DET, get msg(){return msg},
  COMIC, CFX, get renderer(){return renderer}, SP, MODE_EX, OUT, ISL, NAT, sceneryNewRun, FOE_GATE, FOE_HATCH, FOE_FLY, BEAST, BEAST_DEF, BEAST_CLIPS, ROCKS, ATK_ZONE, blockStart, blockPoint, beastReady, buildWave, foesMenu, HATCH_KIND, FLYER_KIND, groundList, flyList, envSolids, solidPush, boardDay, drawBoard, RAMP, rampWaveEnd, PREFS, profiles, EX_SHORT, spVol, WARN, onPartial, demoDraw, DEMOP, DEMOV, DEMO, spRefresh, spTick, spNowText, dayStats, spToggle, EQ, BAR, PLACE, POOL, TENT, ARX, ARX_DECO, barTopPoint, AUDM, ambMute, GAME_STATES, barNear, eqPose, pool, eqGroup, SES, startSession, get stateT(){return stateT}, GUN, BLASTERS, camera, BOLTS, get touches(){return touches}, foes, autoAim, aimManual, ROBOT_KIND, hatches, ROOM, roomPlan, liveGates, roomBlocked, boardRig, EQ, TCH, IW, DET, dv, get waveIdx(){return waveIdx}, GUARD, guardAbsorb, armsMenu, GV, LKL, locks, gazeLock, XFER, xferSend, xferFetch, xferApply, xferMenu, spListMenu, spBlockMusic, blockMusic, sesMusicHTML, applyBlock, spListTracks, endSession, sessSave, sessLoad, savedSessions, xferPack, spToggle, sesSetHTML, blockFields, sesDup, sesMove, renderSession, tempoRows, spFavToggle, spTrackMenu, rankVals, spSongBpmSet, spAutoTempo, rankFitAdd, RANK, CHG, blockExRank, endMenu, BPM_SRC, BPMQ, RB, rbBpms, spBpmPrefetch, spBpmCell, spBpmScale, spTrackBpm, LADDER, DEV, devSet, devVal, devCell, devEye, devEyeToggle, devExport, devImport, devToggle, devRows, devTap, devTableHTML, menuFull, EXS, exSongs, exSongsSet, exSongsStart, exSongsHTML };
})();`;
src = src.replace(/\}\)\(\);\s*$/, expose);
const errors = [];
const origWarn = console.warn; console.warn = (...a) => { errors.push('WARN ' + a.join(' ')); };
vm.runInThisContext(src, { filename: 'game.js' });
const RA = window.__RA;
Object.assign(RA.SP_FADE, { out: 0, in: 0 }); // (sin los fundidos de Spotify en las pruebas, salvo en la suya: en el juego duran 2,5 s y 1,5 s)
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
// los submenús del principal llevan «  ▸» y el ejercicio se elige en su propio menú: findW los encuentra igual
const wLabel = w => (w.label || '').replace(/\s+▸$/, '');
function exLabels() { const b = RA.activeWidgets().find(w => /^Ejercicio:/.test(w.label)); if (!b) return []; b.onPress(); const l = RA.activeWidgets().map(w => w.label); findW('Volver').onPress(); return l; }
function findW(label) {
  let w = RA.activeWidgets().find(w => w.label === label || wLabel(w) === label);
  for (const re of [/^Ejercicio:/, /^Entorno/, /^Sonido/]) { if (w) break; const b = RA.activeWidgets().find(x => re.test(x.label)); if (b) { b.onPress(); w = RA.activeWidgets().find(x => x.label === label); if (!w) RA.activeWidgets().find(x => x.label === 'Volver').onPress(); } }
  if (!w) throw new Error('widget not found: ' + label + ' in [' + RA.activeWidgets().map(w => w.label).join('|') + ']'); return w; }
function press(label) { findW(label).onPress(); }
// Armas ▸ del menú principal: abrirlo, o leer lo que trae y volver (sin el botón, nada)
function openArms() { const b = RA.activeWidgets().find(w => /^Armas: /.test(w.label)); if (b) { b.onPress(); frame(1); } return !!b; }
function armsLabels() { if (!openArms()) return []; const l = RA.activeWidgets().map(w => w.label); press('Volver'); frame(1); return l; }
function log(...a) { console.log(...a); }
// centro del borde de arriba del menú (de ahí cuelga: los menús que se suceden lo comparten)
function menuTop() { const g = RA.menu.group, h = RA.menu.H / 2; return new THREE.Vector3(g.position.x - h * Math.sin(0.38) * Math.sin(g.rotation.y), g.position.y + h * Math.cos(0.38), g.position.z - h * Math.sin(0.38) * Math.cos(g.rotation.y)); }

// ONLY=expresión: solo las partidas cuyo nombre encaja (para depurar deprisa)
// Pone unos ajustes como antes de guardarlos por modo y ejercicio: sin lo guardado, el modo y el ejercicio primero
function applyCfg(cfg) { storage.delete('reparena3-combos'); RA.PV.guard = false; if (!('guard' in cfg)) cfg = { ...cfg, guard: 'off' }; if (!('perks' in cfg)) cfg = { ...cfg, perks: 0 }; if (!('foeLadder' in cfg)) cfg = { ...cfg, foeLadder: 0 }; // (la defensa y las mejoras, que esperan a que elijas, solo en sus pruebas)
  // (como los pone el juego, no tú: no van a la tabla del rango)
  RA.RANK.applying = true; try { for (const k of ['mode', 'exercise']) if (k in cfg) RA.setSetting(k, cfg[k]); for (const k in cfg) if (k !== 'mode' && k !== 'exercise') RA.setSetting(k, cfg[k]); } finally { RA.RANK.applying = false; } }
async function runConfig(name, cfg, simulate, maxSec = 420, check, unfinished = false) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY).test(name)) return;
  // (cada prueba parte de lo que hay: sin lo guardado de cada modo y ejercicio, y el modo y el ejercicio antes que lo demás)
  applyCfg(cfg);
  RA.startPreview(); frame(3);
  press('EMPEZAR');
  let t = 0, last = '', kills = 0, maxEnemies = 0, sawPlay = false;
  while (t < maxSec && RA.state !== 'end') {
    simulate(t); frame(1); t += 0.033;
    if (RA.state !== last) { last = RA.state; }
    if (RA.state === 'play') sawPlay = true;
    maxEnemies = Math.max(maxEnemies, RA.enemies.length + RA.arcs.length);
  }
  if (RA.state === 'end') for (let i = 0; i < 260 && !RA.menu; i++) frame(1); // el resumen sale tras el aviso de victoria o derrota
  const s = RA.stats;
  log(`${name}: state=${RA.state} t=${t.toFixed(0)}s reps=${s.reps} perfect=${s.perfect} partial=${s.partial} kills=${s.kills} taken=${s.taken} shots=${s.shots} hits=${s.hits} maxActive=${maxEnemies} particles=${RA.PADD.p.length}/${RA.PNORM.p.length} debris=${RA.debris.length} score=${RA.score}` + (RA.settings.mode === 'bars' ? ` falls=${s.falls} hold=${s.hold.toFixed(0)}s` : ''));
  const ended = RA.state === 'end';
  if (check) { const why = check(s); if (why) errors.push(`${name}: ${why}`); }
  if (!ended && unfinished) RA.endRun(false, true); // prueba que no debe terminar sola
  else if (!ended) errors.push(`${name}: did not finish (state ${RA.state}, wave ${RA.waveIdx}, queue ${RA.spawnQueue.length}, enemies ${RA.enemies.length})`);
  if (RA.activeWidgets().some(w => w.label === 'Menú principal')) press('Menú principal'); frame(5);
  RA.exitAll(); frame(1);
}
// Ningún panel puede quedarse tapando (opaco) algo que viene hacia ti más de un instante (lo que tarda en desvanecerse)
const PAN = { behind: 0, streak: 0, worst: 0, toast: 0, boardFade: false };
const watchPanels = sim => t => {
  const n = RA.collectThreats();
  const b = RA.board.mesh.parent && RA.panelHides(RA.board.mesh, 1, 0.445, false, n), bt = RA.toastP.mesh.visible && RA.panelHides(RA.toastP.mesh, RA.toastP.w, RA.toastP.h, true, n);
  if (b) PAN.behind++; if (bt) PAN.toast++;
  const bad = bt && RA.toastP.mesh.material.opacity > 0.5; // el marcador se ve siempre (opaco): solo cuentan los avisos
  if (b && RA.board.mesh.material.opacity < 1) PAN.boardFade = true;
  PAN.streak = bad ? PAN.streak + 0.033 : 0; PAN.worst = Math.max(PAN.worst, PAN.streak);
  sim(t);
};
const panelCheck = (name, more) => s => { const why = more ? more(s) : ''; const r = PAN.worst > 0.35 ? `${name}: un aviso tapa lo que viene durante ${PAN.worst.toFixed(2)} s` : PAN.boardFade ? `${name}: el marcador se aclara (tiene que verse siempre)` : ''; log(`   paneles: ${PAN.behind} fotogramas con algo tras el marcador, ${PAN.toast} tras un aviso, peor racha opaca ${PAN.worst.toFixed(2)} s`); Object.assign(PAN, { behind: 0, streak: 0, worst: 0, toast: 0, boardFade: false }); return why || r; };
const squatSim = (period = 2.6) => t => { RA.PV.crouch = (t % period) < period * 0.55; };
// barras: solo se mueve cuando la oleada está en marcha (al colgarse hay que estar quieto)
const pullSim = (period = 2.6) => t => { RA.PV.crouch = RA.state === 'play' && (t % period) < period * 0.5; };
const fallOnce = (at, sim) => t => { sim(t); RA.PV.fall = RA.state === 'play' && RA.stats.falls === 0 && t > at; };
let curlSide = 0; const curlSim = t => { const ph = t % 1.4; if (ph < 0.034) { RA.onCharge(); RA.onRep({ perfect: false }, (curlSide++ % 2) ? 'left' : 'right'); } };

(async () => {
  await sleep(150);
  log('boot ok; renders so far', RA.renderer.renders);
  // la dificultad creciente sube poco a poco: un 4 % por oleada por defecto (quien tenía el 6 % de antes pasa al 4 %)
  log(`ramp by default ${RA.settings.ramp} % (version ${RA.settings.rampV})`); if (RA.settings.ramp !== 4) errors.push('la dificultad creciente debería subir un 4 % por oleada por defecto');
  { const simpleDef = RA.settings.menuLevel; RA.devToggle(true); RA.setSetting('menuLevel', 'full'); /* (el completo es del desarrollador) */ log('menu level by default', simpleDef); if (simpleDef !== 'simple') errors.push('el menú debería empezar en sencillo'); } // el resto de pruebas, con el menú completo
  // ---- Botones táctiles: como un botón de verdad (llegar por delante, hundirlo y sacar el dedo para otra) ----
  {
    const hits = [], a = new RA.Btn('A', 0.1, 0.06, () => hits.push('A')), b = new RA.Btn('B', 0.1, 0.06, () => hits.push('B'));
    a.mesh.position.set(-0.05, 1.5, -0.5); b.mesh.position.set(0.051, 1.5, -0.5); a.baseZ = b.baseZ = -0.5;
    const poke = (x, z, n = 1) => { for (let i = 0; i < n; i++) { a.mesh.updateMatrixWorld(); b.mesh.updateMatrixWorld(); RA.fingers.length = 0; RA.fingers.push({ side: 'right', p: new THREE.Vector3(x, 1.5, -0.5 + z) }); RA.pokeWidgets([a, b], 0.016); } };
    const tap = x => { poke(x, 0.04, 3); for (let k = 0; k <= 10; k++) poke(x, 0.04 - k * 0.006); poke(x, -0.02, 5); poke(x, 0.04, 5); };
    tap(0.0005); const edge = hits.length;            // justo entre los dos
    await sleep(300); tap(-0.05); const one = hits.join('');
    // hundido, temblando sin salir por delante: no vuelve a pulsar; ni resbalando hasta el vecino
    await sleep(300); poke(-0.05, 0.04, 3); for (let k = 0; k <= 8; k++) poke(-0.05, 0.04 - k * 0.006); const hits1 = hits.join('');
    for (const z of [-0.004, -0.015, -0.002, -0.012, 0.004, -0.01]) poke(-0.05, z, 2); const jitter = hits.join('');
    for (let x = -0.05; x <= 0.06; x += 0.01) poke(x, -0.012); poke(0.05, -0.012, 4); const slid = hits.join('');
    poke(0.05, 0.05, 5);
    // un barrido de lado que roza B por delante y se mete: no cuenta
    await sleep(300); for (let k = 0; k < 8; k++) poke(0.01 + k * 0.012, 0.02 - k * 0.0045); poke(0.12, 0.06, 4); const swipe = hits.join('');
    // sacando el dedo, el mismo botón se puede pulsar otra vez (los + y −)
    await sleep(300); tap(-0.05); const again = hits.join('');
    await sleep(300); tap(0.05); const other = hits.join('');
    RA.fingers.length = 0;
    log('buttons: edge', edge, '· tap A', one, '· first push', hits1, '· jitter while pressed', jitter, '· slide onto B', slid, '· side swipe', swipe, '· again after pulling back', again, '· B', other);
    if (edge || one !== 'A' || hits1 !== 'AA' || jitter !== 'AA' || slid !== 'AA' || swipe !== 'AA' || again !== 'AAA' || other !== 'AAAB') errors.push(`botones táctiles: pulsaciones de más o de menos (${edge}, ${one}, ${hits1}, ${jitter}, ${slid}, ${swipe}, ${again}, ${other})`);
  }
  const base = { lives: 0, waves: 2, repsWave: 4, repsInc: 1, rest: 5, walkTime: 8, flySpeed: 6, maxAlive: 5, perfectTime: 1.0, arcRate: 20, arcSpeed: 12, arcMin: 15, arcMax: 30, arcPatterns: 0, arcNew: 0, arcFever: 0, arcMace: 0, arcPlank: 0 }; // (los arcos de siempre: las coreografías y lo nuevo tienen su prueba)
  // ---- Estilo cómic (prueba): se elige en Entorno; sombreado de dibujo, contornos de tinta y la fortaleza con cielo y suelo de cómic; al quitarlo, todo como antes ----
  { const gm = RA.gloves.left.seg.material, nm0 = gm.normalMap, map0 = gm.map, col0 = gm.color.getHex(), outl = v => { let n = 0; RA.scene.traverse(o => { if (o.userData && o.userData.isOutline && o.visible) n++; }); return n; };
    RA.setSetting('scenery', 'arena'); RA.startPreview(); frame(3); RA.setSetting('look', 'comic'); frame(3);
    const on = { comicMat: !!(RA.COMIC.st.get(gm) || {}).on, noMaps: !gm.normalMap && !gm.map, comicWorld: !!(RA.COMIC.world && RA.COMIC.world.visible), fortressHidden: !RA.env.visible, noShadows: !RA.renderer.shadowMap.enabled, outlines: outl() };
    RA.setSetting('look', 'real'); frame(3);
    const off = { real: !(RA.COMIC.st.get(gm) || {}).on, maps: gm.normalMap === nm0 && gm.map === map0 && gm.color.getHex() === col0, fortress: RA.env.visible && !RA.COMIC.world.visible, outlinesHidden: outl() === 0, shadows: RA.renderer.shadowMap.enabled === !!RA.settings.shadows };
    RA.exitAll(); frame(1);
    log(`comic look: on ${JSON.stringify(on)} · back to realistic ${JSON.stringify(off)}`);
    if (Object.values(on).some(v => !v) || Object.values(off).some(v => !v)) errors.push('estilo cómic: no cambia bien los materiales, los contornos y el escenario, o al quitarlo no vuelve todo como estaba'); }
  // al final, «Traer menú» y luego «Menú principal»: el principal sale donde estaba el que trajiste
  const bringMenu = () => {
    RA.camera.position.set(0.8, 1.6, 1.6); frame(2); const before = menuTop();
    RA.onWatch(); frame(2); const brought = menuTop();
    press('Menú principal'); frame(2); const lobby = menuTop();
    log('bring menu: moved', before.distanceTo(brought).toFixed(2), 'main menu offset from brought', lobby.distanceTo(brought).toFixed(3));
    RA.camera.position.set(0, 1.6, 0);
    return before.distanceTo(brought) < 0.3 || lobby.distanceTo(brought) > 0.01 ? '«Traer menú» y luego «Menú principal»: el menú principal no sale donde estaba el traído' : '';
  };
  await runConfig('Asalto+sentadillas', { ...base, mode: 'walkers', exercise: 'squat' }, squatSim(), 420, bringMenu);
  // «Traer menú» al final de la ronda y luego «Menú principal»: el principal sale donde estaba el que trajiste
  await runConfig('Asalto+flexiones', { ...base, mode: 'walkers', exercise: 'pushup', walkTime: 6 }, squatSim(2.6));
  await runConfig('Asalto+flexiones cargadas (3 s abajo)', { ...base, mode: 'walkers', exercise: 'pushup', walkTime: 20, repsWave: 6, perfectTime: 0 }, t => { RA.PV.crouch = (t % 4.4) < 3.4; }, 420, s => s.kills < s.reps * 0.6 ? `la carga no aumenta el daño (${s.kills} muertes con ${s.reps} disparos)` : '');
  const sides = new Set();
  await runConfig('Asalto+plancha con un brazo', { ...base, mode: 'walkers', exercise: 'plank1', walkTime: 10 }, t => {
    RA.PV.keys.KeyQ = (t % 3) > 0.2 && (t % 3) < 1.0; RA.PV.keys.KeyE = (t % 3) > 1.5 && (t % 3) < 2.3;
    RA.enemies.forEach(e => sides.add(e.pos.x < 0 ? 'izq' : 'der'));
  }, 420, s => s.kills < 4 ? 'la plancha con un brazo no mata arañas' : sides.size < 2 ? 'las arañas no llegan por los dos lados' : '');
  RA.PV.keys.KeyQ = RA.PV.keys.KeyE = false;
  const supCfg = { ...base, mode: 'flyers', exercise: 'superman', supHold: 2, supRange: 12, flySpeed: 8 };
  // a ritmo normal (subir, aguantar 2 s y bajar: una cada 4,5 s) los voladores no deben picar antes de dar tiempo a cargar
  { let A = null; await runConfig('superman: tiempo para cargar', { ...base, mode: 'combat', exercise: 'superman', supHold: 2, supRange: 12, flySpeed: 7, maxAlive: 5, waves: 1, repsWave: 14, lives: 0 }, t => { RA.PV.crouch = RA.state === 'play' && (t % 4.5) < 3.2; }, 300, s => { A = { ...s }; });
    if (A && (A.taken > 2 || A.reps < 6)) errors.push(`superman: los voladores pican antes de que dé tiempo a cargar el disparo (${A.taken} picotazos en ${A.reps} repeticiones)`); }
  await runConfig('Enjambre+superman (aguanta 2,6 s)', supCfg, watchPanels(t => { RA.PV.crouch = RA.state === 'play' && (t % 4) < 2.9; }), 420, panelCheck('superman', s => s.reps < 5 ? 'el superman no dispara al aguantar' : s.partial ? 'aguantando lo pedido no debería haber medias' : s.kills < 5 ? 'no derriba a los voladores' : ''));
  await runConfig('Enjambre+superman demasiado corto', { ...supCfg, waves: 1 }, t => { RA.PV.crouch = RA.state === 'play' && (t % 2.5) < 1.0; }, 30, s => s.reps ? 'subir y bajar rápido no debería disparar' : !s.partial ? 'debería avisar de que hay que aguantar' : '', true);
  await runConfig('Enjambre+superman brazos encogidos', { ...supCfg, waves: 1 }, t => { RA.PV.keys.KeyR = true; RA.PV.crouch = RA.state === 'play' && (t % 4) < 2.9; }, 30, s => s.reps ? 'con los brazos encogidos no debería disparar' : '', true);
  RA.PV.keys.KeyR = false;
  await runConfig('Asalto+curl', { ...base, mode: 'walkers', exercise: 'curl' }, curlSim);
  // ---- Zancadas, fondos en silla, press de hombro y plancha lateral ----
  await runConfig('Asalto+zancadas', { ...base, mode: 'walkers', exercise: 'lunge' }, squatSim(2.8), 420, s => s.partial > 1 ? 'zancadas completas cuentan como medias' : '');
  await runConfig('Enjambre+zancadas', { ...base, mode: 'flyers', exercise: 'lunge', flySpeed: 8 }, squatSim(2.8));
  await runConfig('Asalto+fondos en silla', { ...base, mode: 'walkers', exercise: 'dips' }, squatSim(2.6), 420, s => s.partial > 1 ? 'fondos completos cuentan como medios' : '');
  await runConfig('Enjambre+fondos en silla', { ...base, mode: 'flyers', exercise: 'dips', flySpeed: 8 }, squatSim(2.6));
  await runConfig('Asalto+press de hombro', { ...base, mode: 'walkers', exercise: 'press' }, squatSim(1.8), 420, s => s.reps < 10 ? 'el press no cuenta las repeticiones' : '');
  // ---- Antebrazos con la barra flexible: un giro carga y el siguiente (al revés) dispara ----
  await runConfig('Combate+antebrazos (barra flexible)', { ...base, mode: 'combat', foes: 'robots', exercise: 'twist', twistDeg: 70, walkTime: 14 }, squatSim(1.6), 420, s => s.reps < 9 ? `pocos disparos girando la barra (${s.reps})` : s.partial ? 'giros completos cuentan como cortos' : s.kills < 4 ? 'no mata robots' : '');
  RA.PV.twistScale = 0.55;
  await runConfig('Antebrazos con giros cortos', { ...base, mode: 'combat', foes: 'robots', exercise: 'twist', twistDeg: 70, waves: 1, walkTime: 30 }, squatSim(1.6), 25, s => s.reps ? 'giros cortos no deberían disparar' : !s.partial ? 'debería avisar de que hay que girar más' : '', true);
  RA.PV.twistScale = 1; RA.PV.crouch = false;
  // sentadillas en combate: aguantar abajo carga el disparo (×2, ×3, ×4), como en las flexiones
  for (const aim of ['auto', 'hands']) { let maxPow = 1; const F = { seen: new Set(), y: 9, gone: null };
    await runConfig(`Combate sentadilla aguantada (${aim})`, { ...base, mode: 'combat', foes: 'robots', aim, exercise: 'squat', waves: 1, repsWave: 4 }, t => { RA.PV.crouch = (t % 5) < 3.4; const m = /CARGA ×(\d)/.exec(RA.msg.text || ''); if (m) maxPow = Math.max(maxPow, +m[1]);
      // la carga, también en el suelo (agachado es lo que ves): ×2, ×3 y, a ×4, «¡ARRIBA!»; se va al disparar
      const cm = RA.CHG.p.mesh; if (cm.visible) { F.seen.add(RA.CHG.text); F.y = Math.min(F.y, cm.position.y); } if (F.seen.size && !RA.PV.crouch && t % 5 > 4 && F.gone === null) F.gone = !cm.visible; }, 200, s => maxPow < 4 ? `aguantar abajo en la sentadilla no carga el disparo (×${maxPow})` : '', true);
    log(`  squat held low (${aim}): charge up to ×${maxPow} · on the floor: ${[...F.seen].join(' → ')} (y ${F.y.toFixed(2)}) · gone after standing up ${F.gone}`);
    if (!F.seen.has('CARGA ×2') || !F.seen.has('×4 · ¡ARRIBA!') || F.y > 0.1 || !F.gone) errors.push('carga: debería verse en el suelo (×2… y a ×4 «¡ARRIBA!») e irse al disparar'); }
  // zancadas: también cargan aguantando abajo; y bajando mucho más de lo pedido, la recarga profunda (×4 al instante)
  { let lunge = 1, deep = 0, deepOff = 0, quick = 1;
    await runConfig('Combate zancada aguantada', { ...base, mode: 'combat', foes: 'robots', aim: 'auto', exercise: 'lunge', waves: 1, repsWave: 4, deepDrop: 30 }, t => { RA.PV.crouch = (t % 5) < 3.4; const m = /CARGA ×(\d)/.exec(RA.msg.text || ''); if (m) lunge = Math.max(lunge, +m[1]); }, 200, s => '', true);
    await runConfig('Combate sentadilla con recarga profunda', { ...base, mode: 'combat', foes: 'robots', aim: 'auto', exercise: 'squat', waves: 1, repsWave: 4, deepDrop: 6 }, t => { RA.PV.crouch = (t % 2.6) < 1.0; const tx = RA.msg.text || ''; if (/PROFUNDA/.test(tx)) deep++; const m = /DISPARO ×(\d)/.exec(tx); if (m) quick = Math.max(quick, +m[1]); }, 200, s => '', true);
    await runConfig('Combate sentadilla sin llegar a la recarga profunda', { ...base, mode: 'combat', foes: 'robots', aim: 'auto', exercise: 'squat', waves: 1, repsWave: 4, deepDrop: 30 }, t => { RA.PV.crouch = (t % 2.6) < 1.0; if (/PROFUNDA/.test(RA.msg.text || '')) deepOff++; }, 200, s => '', true);
    log(`  lunge held low: charge up to ×${lunge} · deep squat (6 cm extra): deep reloads seen ${deep}, quick squat shot up to ×${quick} · not deep enough (30 cm): ${deepOff}`);
    if (lunge < 4) errors.push(`zancadas: aguantar abajo no carga el disparo (×${lunge})`);
    if (!deep || quick < 4 || deepOff) errors.push('recarga profunda: bajando mucho el disparo debería salir ×4 al instante (y sin bajar tanto, no)'); }
  // press de hombro: las cámaras pierden la mano en cuanto pasa por encima de los ojos (subiendo deprisa): cuenta igual
  await runConfig('Combate press de hombro, la mano se pierde arriba', { ...base, mode: 'combat', foes: 'robots', aim: 'auto', exercise: 'press', waves: 2, repsWave: 6 }, t => { squatSim(1.8)(t); RA.PV.lostAbove = 0; }, 200, s => s.reps < 10 ? `el press no cuenta si la mano se pierde arriba (${s.reps} reps)` : s.partial > 1 ? 'el press da medias de más al perder la mano arriba' : '');
  RA.PV.lostAbove = null;
  await runConfig('Enjambre+press de hombro', { ...base, mode: 'flyers', exercise: 'press', flySpeed: 8 }, squatSim(1.8));
  await runConfig('Asalto+plancha lateral', { ...base, mode: 'walkers', exercise: 'splank', splHold: 2, walkTime: 14 }, () => { RA.PV.crouch = false; }, 420, s => s.partial ? 'aguantando quieto no debería cortarse' : '');
  await runConfig('Enjambre+plancha lateral', { ...base, mode: 'flyers', exercise: 'splank', splHold: 2, flySpeed: 8 }, () => { RA.PV.crouch = false; }, 420);
  await runConfig('Plancha lateral con la cadera cayendo', { ...base, mode: 'walkers', exercise: 'splank', splHold: 3, waves: 1, walkTime: 30 }, t => { RA.PV.crouch = RA.state === 'play' && (t % 2.4) > 1.6; }, 30, s => s.reps ? 'con la cadera cayendo antes de tiempo no debería disparar' : !s.partial ? 'debería avisar de que sube la cadera' : '', true);
  RA.PV.crouch = false;
  await runConfig('Enjambre+sentadillas', { ...base, mode: 'flyers', exercise: 'squat' }, squatSim());
  // apuntando con la mirada, el jugador mira al bicho más cercano (si no, desde trampillas a 2 m casi nunca cruzan delante)
  const lookNearest = sim => t => { sim(t); const e = RA.enemies.find(x => x.alive); if (e) RA.camera.lookAt(e.center(new THREE.Vector3())); };
  await runConfig('Enjambre+flexiones', { ...base, mode: 'flyers', exercise: 'pushup' }, lookNearest(squatSim()));
  RA.camera.rotation.set(0, 0, 0);
  // con barra o kettlebell: las dos manos a la vez; sentadilla con press: hay que subir las pesas para disparar
  await runConfig('Combate curl con barra', { ...base, mode: 'combat', foes: 'robots', aim: 'auto', exercise: 'curl2' }, squatSim(2.0), 420, s => s.reps < 9 ? 'el curl con barra no cuenta las repeticiones' : s.partial > 2 ? 'el curl con barra da medias de más' : '');
  // elevaciones frontales con una sola pesa (las dos manos juntas): cuentan al llegar a los hombros con los brazos al frente
  await runConfig('Combate elevaciones frontales', { ...base, mode: 'combat', foes: 'flyers', aim: 'auto', exercise: 'fraise' }, squatSim(2.4), 420, s => s.reps < 9 ? 'las elevaciones frontales no cuentan las repeticiones' : s.kills < 4 ? 'las elevaciones frontales no derriban voladores' : '');
  { const pf = RA.settings.perfectTime; RA.setSetting('fraiseRange', 70); // (con un recorrido mayor del que se hace, no cuenta: a medias)
    await runConfig('Combate elevaciones frontales cortas', { ...base, mode: 'combat', foes: 'flyers', aim: 'auto', exercise: 'fraise', waves: 1, repsWave: 3, fraiseRange: 70 }, squatSim(2.4), 25, s => s.reps ? `con 70 cm de recorrido no deberían contar subidas de 62 (${s.reps})` : !s.partial ? 'debería avisar de que sube poco' : '', true);
    RA.setSetting('fraiseRange', 45); RA.setSetting('perfectTime', pf); }
  await runConfig('Combate press con barra', { ...base, mode: 'combat', foes: 'flyers', aim: 'auto', exercise: 'press2' }, squatSim(1.8), 420, s => s.reps < 9 ? 'el press con barra no cuenta las repeticiones' : '');
  await runConfig('Combate sentadilla con press', { ...base, mode: 'combat', foes: 'robots', aim: 'auto', exercise: 'thruster' }, squatSim(3.0), 420, s => s.reps < 9 ? 'la sentadilla con press no dispara' : s.partial > 2 ? 'la sentadilla con press da medias de más' : '');
  await runConfig('Sentadilla con press sin subir las pesas', { ...base, mode: 'combat', foes: 'robots', aim: 'auto', exercise: 'thruster', waves: 1 }, t => { squatSim(3.0)(t); RA.PV.noArms = true; }, 30, s => s.reps ? 'sin subir las pesas no debería disparar' : s.partial < 3 ? 'no avisa de que hay que subir las pesas' : '', true);
  RA.PV.noArms = false;
  // peso muerto: bajar y subir dispara, sin necesidad de ver las manos
  await runConfig('Combate peso muerto (sin manos)', { ...base, mode: 'combat', foes: 'robots', aim: 'auto', exercise: 'dlrow' }, t => { squatSim(3.0)(t); RA.hands.left.ok = RA.hands.right.ok = false; }, 420, s => s.reps < 6 || !s.kills ? 'el peso muerto no dispara (sin manos)' : s.partial > 2 ? 'el peso muerto da medias de más' : '');
  { let fxMax = 0;
    await runConfig('Cómic: combate con monstruos y voladores', { ...base, mode: 'combat', aim: 'auto', exercise: 'squat', look: 'comic', scenery: 'arena', foesGate: 'robot,zombie,imp', foesFly: 'drone,bee' }, t => { squatSim(2.4)(t); fxMax = Math.max(fxMax, RA.CFX.list.length); }, 420, s => s.kills < 3 ? 'con el estilo cómic no se juega bien' : '');
    log(`comic effects on screen at once: up to ${fxMax}`); if (fxMax < 2) errors.push('estilo cómic: al acertar y derribar deberían salir las onomatopeyas y las líneas de impacto'); }
  RA.setSetting('look', 'real');
  // ejercicios en dos tiempos: bajar carga y el gesto al subir dispara; sin el gesto, no
  const chainCfg = { ...base, mode: 'combat', foes: 'robots', aim: 'auto' };
  for (const [ex, name, per, flag] of [['frontsq', 'sentadilla con elevación frontal', 3.0, 'noArms'], ['swing', 'swing con kettlebell', 2.4, 'noArms'], ['jsquat', 'sentadilla con salto', 3.0, 'noJump'], ['chop', 'leñador', 2.6, 'chopSame']]) {
    await runConfig(`Combate ${name}`, { ...chainCfg, exercise: ex }, squatSim(per), 420, s => s.reps < 7 ? `${name}: no dispara` : s.partial > 2 ? `${name}: da medias de más` : '');
    await runConfig(`${name} sin el gesto`, { ...chainCfg, exercise: ex, waves: 1 }, t => { RA.PV[flag] = true; squatSim(per)(t); }, 30, s => s.reps ? `${name}: sin el gesto no debería disparar` : s.partial < 3 ? `${name}: no avisa de qué falta` : '', true);
    RA.PV[flag] = false;
  }
  // dificultad creciente: en cada oleada superada, enemigos antes y más a la vez y algo más de recorrido; sin ella, igual
  for (const ramp of [10, 0]) {
    const seen = {};
    await runConfig(`dificultad creciente ${ramp} %`, { ...base, mode: 'combat', foes: 'robots', aim: 'auto', exercise: 'squat', waves: 4, repsWave: 3, repsInc: 0, rest: 0, ramp, walkTime: 8, squatDepth: 26, maxAlive: 5 }, t => {
      squatSim(2.6)(t); if (RA.state === 'play') seen[RA.waveIdx] = [RA.dv('walkTime'), RA.dv('squatDepth'), RA.dv('maxAlive'), RA.dv('pace_robot'), RA.RAMP.lvl];
    }, 420, s => {
      const w = Object.keys(seen).map(Number).sort((a, b) => a - b), last = seen[w[w.length - 1]], first = seen[0];
      log(`  ramp ${ramp} %: ` + w.map(i => `oleada ${i + 1} (nivel ${seen[i][4]}): llegan en ${seen[i][0].toFixed(2)} s, bajada ${seen[i][1].toFixed(1)} cm, ${seen[i][2]} a la vez, gestos ${Math.round(seen[i][3])} %`).join(' · '));
      if (w.length < 4) return 'no se juegan las cuatro oleadas';
      if (ramp && !(last[4] === 3 && Math.abs(last[0] - 8 / 1.3) < 0.01 && Math.abs(last[1] - 26 * 1.12) < 0.01 && last[2] === 6 && Math.abs(last[3] - RA.settings.pace_robot * 1.15) < 0.01 && first[0] === 8 && first[1] === 26)) return 'la dificultad creciente no sube como debe';
      if (!ramp && (last[0] !== 8 || last[1] !== 26 || last[2] !== 5)) return 'sin dificultad creciente algo cambia';
      return '';
    });
  }
  // si en una oleada te dan mucho, la siguiente no sube; superada con soltura, sí
  { RA.setSetting('ramp', 6); const R = RA.RAMP, st = RA.stats; Object.assign(R, { lvl: 2, t0: st.taken, f0: st.falls }); st.taken += 6; RA.rampWaveEnd(true); const held = R.lvl, n1 = R.note;
    Object.assign(R, { t0: st.taken, f0: st.falls }); st.taken += 1; RA.rampWaveEnd(true); const up = R.lvl, n2 = R.note; RA.rampWaveEnd(false); const lost = R.lvl;
    log(`ramp after a rough wave: level ${held} (“${n1}”) · after a clean one ${up} (“${n2}”) · after a lost one ${lost}`);
    if (held !== 2 || up !== 3 || lost !== 3 || !/18 %/.test(n2)) errors.push('dificultad creciente: no se para tras una oleada con muchos golpes o no sube tras una limpia'); R.lvl = 0; }
  // monstruos de archivo (Imp y Puglin): aquí no hay cargador de glTF, así que en su lugar salen robots, sin errores
  { const kinds = new Set();
    await runConfig('monstruos sin modelos → robots', { ...base, mode: 'combat', foes: 'robots', aim: 'auto', exercise: 'squat', foesGate: 'imp,puglin,zombie,zgreen,zchubby,raptor,demon,yeti,alientall' }, t => { squatSim(2.6)(t); RA.enemies.forEach(e => kinds.add(e.kind)); }, 420,
      s => [...kinds].some(k => !['scout', 'heavy', 'titan'].includes(k)) ? `sin los modelos deberían salir robots (${[...kinds]})` : s.kills < 4 ? 'no se derriba a nadie' : ''); }
  // los enemigos elegidos (Ajustes → Enemigos): con sus modelos (aquí, de mentira: sin cargador de glTF) salen ellos, cada
  // uno a su manera: los zombis y monstruitos de las compuertas andando, los voladores volando (el dragón, de jefe) y, en
  // flexiones, cangrejos, setas y calaveras de las trampillas
  { const fakeKind = k => { const D = RA.BEAST_DEF[k], g = new THREE.Group(); for (const n of ['Body', 'Head', 'Torso', 'LowerArm.R']) { const b = new THREE.Group(); b.name = n; g.add(b); } g.add(new THREE.Mesh());
      const clips = {}; for (const a in D.alias) clips[a] = { name: D.alias[a], duration: 0.5, tracks: [] }; return { scene: g, clips, map: null }; };
    const NEW = ['zgreen', 'zchubby', 'demon', 'greendemon', 'cyclops', 'yeti', 'skull', 'alien', 'alientall', 'crab', 'mushroom', 'bee', 'bat', 'cthulhu', 'dragon', 'skeleton', 'captain', 'sharky', 'mako'];
    for (const k of NEW) RA.BEAST.kinds[k] = fakeKind(k);
    const seen = new Set(), cls = new Set(), ctrY = [];
    await runConfig('enemigos elegidos: zombis, monstruitos y voladores', { ...base, mode: 'combat', aim: 'auto', exercise: 'squat', foesGate: 'zgreen,zchubby,demon,yeti,alientall', foesFly: 'bee,bat,cthulhu,dragon', waves: 2, repsWave: 26, maxAlive: 4, walkTime: 6, flySpeed: 6 },
      t => { squatSim(2.6)(t); RA.enemies.forEach(e => { seen.add(e.kind); cls.add(e.constructor.name); if (e.kind === 'demon' && e.alive) ctrY.push(e.center(new THREE.Vector3()).y - e.root.position.y); }); }, 420, s => s.kills < 6 ? `pocos derribados (${s.kills})` : '');
    { const h = RA.BEAST_DEF.demon.h, m = ctrY.length ? Math.min(...ctrY) : -1; log(`cute monster aim centre: ${m.toFixed(2)} m above its feet (height ${h} m)`); if (!(m > h * 0.35)) errors.push('monstruitos: la diana y los disparos deberían ir al cuerpo, no a sus pies'); }
    const want = ['zgreen', 'zchubby', 'demon', 'yeti', 'alientall', 'bee', 'bat', 'cthulhu', 'dragon'], miss = want.filter(k => k !== 'dragon' && !seen.has(k) && !seen.has(k + 'boss')), extra = [...seen].filter(k => !want.some(w => k === w || k === w + 'boss'));
    log(`chosen enemies: seen ${[...seen].join(',')} · classes ${[...cls].join(',')} · missing ${miss.join(',') || 'none'} · not chosen ${extra.join(',') || 'none'}`);
    if (miss.length || extra.length) errors.push(`enemigos elegidos: no salen justo los marcados (faltan ${miss}, sobran ${extra})`);
    // los piratas: esqueleto, capitán y tiburones; con el capitán marcado, el jefe es él
    const pseen = new Set();
    await runConfig('enemigos elegidos: piratas', { ...base, mode: 'combat', aim: 'auto', exercise: 'squat', foesGate: 'skeleton,captain,sharky,mako', foesFly: '', waves: 2, repsWave: 26, maxAlive: 4, walkTime: 6 },
      t => { squatSim(2.6)(t); RA.enemies.forEach(e => pseen.add(e.kind + ':' + e.constructor.name)); }, 420, s => s.kills < 6 ? `pocos derribados (${s.kills})` : '');
    log(`pirates: ${[...pseen].join(',')}`);
    if (!['skeleton', 'captain', 'sharky', 'mako', 'captainboss'].every(k => pseen.has(k + ':Beast'))) errors.push('piratas: no salen el esqueleto, el capitán, los tiburones y el capitán de jefe');
    // los que tienen piernas solo se desplazan andando: nada de deslizarse quietos (al golpear, al retroceder, al llegar a su
    // puesto o empujados por otro); retroceder tras el golpe es andar de espaldas
    { const L = { frames: 0, moving: 0, glide: 0, ex: [], back: 0, prev: new Map() };
      await runConfig('piernas: solo se desplazan andando', { ...base, mode: 'combat', aim: 'auto', exercise: 'squat', foesGate: 'robot,zgreen,skeleton', foesFly: '', waves: 2, repsWave: 30, maxAlive: 4, walkTime: 6 }, t => {
        RA.PV.crouch = t > 30 && (t % 3) < 1.4; // primero dejan que lleguen y golpeen; luego, a derribarlos (disparos y tambaleos)
        for (const e of RA.enemies) { if (!e.alive || e.type !== 'robot') continue; const p = L.prev.get(e); L.prev.set(e, e.pos.clone()); if (!p) continue;
          const v = Math.hypot(e.pos.x - p.x, e.pos.z - p.z) / 0.033; L.frames++; if (e.backing) L.back++;
          if (v < 0.15 || e.state === 'down' || e.dodge > 0 || e.state === 'emerge') continue; L.moving++;
          const legs = Math.abs(e.aspd) > 0.09 && (!e.D || /Walk|Jog|Sprint|Roll/.test(e.cur || ''));
          if (!legs) { L.glide++; if (L.ex.length < 4) L.ex.push(`${e.kind} ${e.state} ${v.toFixed(2)} m/s anim ${(e.aspd || 0).toFixed(2)} ${e.cur || ''}`); } }
      }, 70, s => '', true);
      log(`legs: ${L.moving} moving frames of ${L.frames}, gliding ${L.glide} ${L.ex.join(' · ')} · walking backwards ${L.back}`);
      if (L.glide > L.moving * 0.01) errors.push(`piernas: hay enemigos que se desplazan sin mover las piernas (${L.glide} de ${L.moving}: ${L.ex[0]})`);
      if (!L.back) errors.push('piernas: tras el golpe deberían retroceder andando de espaldas'); }
    const hseen = new Set();
    await runConfig('enemigos de las trampillas: cangrejo, seta y calavera', { ...base, mode: 'combat', aim: 'auto', exercise: 'pushup', foesHatch: 'crab,mushroom,skull', foesFly: '', waves: 2, repsWave: 10, walkTime: 6 },
      t => { squatSim(2.4)(t); RA.enemies.forEach(e => hseen.add(e.kind + ':' + e.constructor.name)); }, 420, s => s.kills < 4 ? `pocos derribados (${s.kills})` : '');
    log(`hatch enemies: ${[...hseen].join(',')}`);
    if (!['hcrab', 'hmushroom', 'hskull'].every(k => hseen.has(k + ':HatchBeast')) || [...hseen].some(k => !/^h(crab|mushroom|skull)(boss)?:HatchBeast$/.test(k))) errors.push('trampillas: no salen solo los monstruitos elegidos');
    // sin ninguno de tierra: solo voladores; sin ninguno de nada: robots
    RA.setSetting('exercise', 'squat'); RA.setSetting('foesGate', ''); RA.setSetting('foesFly', 'bee'); const onlyFly = RA.foes(), wave = RA.buildWave(0).map(e => e.kind);
    RA.setSetting('foesFly', 'bee,dragon'); RA.setSetting('waves', 1); const bossFly = RA.buildWave(0).map(e => e.kind); RA.setSetting('waves', 3);
    RA.setSetting('foesFly', ''); const none = RA.foes(), wave0 = RA.buildWave(0).map(e => e.kind);
    log(`no ground enemies: ${onlyFly} (${[...new Set(wave)]}) · boss wave with the dragon: ${[...new Set(bossFly)]} · none at all: ${none} (${[...new Set(wave0)]})`);
    if (bossFly[bossFly.length - 1] !== 'dragon') errors.push('voladores: con el dragón marcado, el jefe debería ser el dragón');
    if (onlyFly !== 'flyers' || wave.some(k => k !== 'bee') || none !== 'robots' || wave0.some(k => !['scout', 'heavy'].includes(k))) errors.push('enemigos: sin los de tierra deberían salir solo voladores, y sin ninguno, robots');
    // «Qué enemigos salen»: de una vez, solo los que andan o solo los voladores, sin perder lo marcado en cada grupo
    RA.setSetting('foesGate', 'robot,zombie'); RA.setSetting('foesFly', 'bee,bat');
    RA.setSetting('foeKind', 'ground'); const kg = RA.foes(), wg = new Set(RA.buildWave(0).map(e => e.kind));
    RA.setSetting('foeKind', 'fly'); const kf = RA.foes(), wf = new Set(RA.buildWave(0).map(e => e.kind));
    RA.setSetting('foeKind', 'both'); const kb = RA.foes(), keep = RA.settings.foesGate === 'robot,zombie' && RA.settings.foesFly === 'bee,bat';
    log(`foe kind: ground ${kg} (${[...wg]}) · fly ${kf} (${[...wf]}) · both ${kb} · picks kept ${keep}`);
    if (kg !== 'robots' || kf !== 'flyers' || kb !== 'mix' || [...wf].some(k => !['bee', 'bat'].includes(k)) || [...wg].some(k => ['bee', 'bat'].includes(k)) || !keep) errors.push('enemigos: «Qué enemigos salen» debería dejar solo los que andan o solo los voladores sin perder lo marcado');
    RA.setSetting('foesGate', RA.SCHEMA.find(f => f.key === 'foesGate').def); RA.setSetting('foesFly', RA.SCHEMA.find(f => f.key === 'foesFly').def);
    // cada modo y ejercicio conserva sus ajustes (y los enemigos); el rango es de cada uno: cambiarlo no toca los demás
    { storage.delete('reparena3-combos'); RA.setSetting('rank', 'cabo'); RA.setSetting('mode', 'combat'); RA.setSetting('exercise', 'squat');
      RA.setSetting('foesGate', 'zombie'); RA.setSetting('repsWave', 17); RA.setSetting('walkTime', 9);
      RA.setSetting('exercise', 'pushup'); RA.setSetting('foesHatch', 'crab'); RA.setSetting('repsWave', 23);
      RA.setSetting('mode', 'touch'); RA.setSetting('tchArrive', 2.5);
      RA.setSetting('mode', 'combat'); RA.setSetting('exercise', 'squat'); const sq = [RA.settings.foesGate, RA.settings.repsWave, RA.settings.walkTime];
      RA.setSetting('exercise', 'pushup'); const pu = [RA.settings.foesHatch, RA.settings.repsWave];
      RA.setSetting('rank', 'general'); const genWalk = RA.settings.walkTime; RA.setSetting('exercise', 'squat'); const sqGen = [RA.settings.walkTime, RA.settings.foesGate, RA.settings.repsWave, RA.settings.rank];
      log(`settings per mode and exercise: squat ${sq} · push-ups ${pu} · general on push-ups (walk ${genWalk}) → squat ${sqGen}`);
      if (sq.join() !== 'zombie,17,9' || pu.join() !== 'crab,23') errors.push('ajustes: cada modo y ejercicio debería conservar lo que elegiste (también los enemigos)');
      if (sqGen[0] !== 9 || sqGen[1] !== 'zombie' || sqGen[2] !== 17 || sqGen[3] !== 'cabo' || genWalk !== 5) errors.push('ajustes: el rango debería ser de cada ejercicio (el general en flexiones no toca las sentadillas)');
      RA.setSetting('rank', 'cabo'); storage.delete('reparena3-combos'); }
    for (const k of NEW) delete RA.BEAST.kinds[k];
    RA.setSetting('foesGate', RA.SCHEMA.find(f => f.key === 'foesGate').def); RA.setSetting('foesHatch', 'spider'); RA.setSetting('foesFly', 'drone,hornet'); }
  // un disparo cargado ×3 o ×4 derriba (sale despedido hacia atrás y se levanta); a los jefes, no
  { let downs = 0, moved = 0, bossDown = false; const seen = new Map(), P0 = new THREE.Vector3(0, 1.4, -2);
    await runConfig('derribo con disparos cargados', { ...base, mode: 'combat', foes: 'robots', aim: 'auto', exercise: 'squat', foesGate: 'robot', waves: 2, repsWave: 12, walkTime: 6, maxAlive: 3 }, t => {
      RA.PV.crouch = (t % 4.6) < 1.2;
      for (const e of RA.enemies) if (e.type === 'robot' && e.alive && e.out && e.state !== 'down' && Math.random() < 0.01) { e.hp += 2; e.onHit(1, false, P0, 4); } // como un disparo ×4 que no lo mata
      for (const e of RA.enemies) { if (e.type !== 'robot') continue; if (e.state === 'down') { if (e.K.boss) bossDown = true; if (!seen.has(e)) { seen.set(e, { x: e.pos.x, z: e.pos.z }); downs++; } else { const a = seen.get(e); moved = Math.max(moved, Math.hypot(e.pos.x - a.x, e.pos.z - a.z)); } } else seen.delete(e); }
    }, 420, s => '');
    log(`knockdown: ${downs} robots knocked down, pushed back up to ${moved.toFixed(2)} m · a boss knocked down ${bossDown}`);
    if (downs < 1 || moved < 0.8 || bossDown) errors.push('derribo: un disparo cargado ×3 o ×4 debería derribar y echar atrás (a los jefes, no)'); }
  // Defensa 1: cada impacto aparta un poco al enemigo y le retrasa el golpe que preparaba (a los jefes, mucho menos)
  { const P0 = new THREE.Vector3(0, 1.4, -2), probes = [], pushes = [], delays = []; let off = null;
    await runConfig('defensa: retroceso con cada impacto', { ...base, mode: 'combat', exercise: 'squat', foeKind: 'ground', foesGate: 'robot', waves: 1, repsWave: 40, walkTime: 6, maxAlive: 2 }, t => {
      RA.PV.crouch = false;
      for (const e of RA.enemies) if (e.type === 'robot' && e.alive && e.state === 'windup' && e.st > 0.25 && !probes.some(p => p.e === e) && probes.length < 2) { const d0 = Math.hypot(e.pos.x - RA.HL.x, e.pos.z - RA.HL.z), st = e.st; e.hp += 1; e.onHit(1, false, P0, 1); probes.push({ e, d0, t, st, st1: e.st }); }
      for (const p of probes) if (!p.done && t - p.t > 0.25) { p.done = true; pushes.push(Math.hypot(p.e.pos.x - RA.HL.x, p.e.pos.z - RA.HL.z) - p.d0); delays.push(p.st - p.st1); }
      if (!off && probes.length >= 2 && probes.every(p => p.done)) { const e = RA.enemies.find(e => e.alive && e.type === 'robot' && e.state === 'windup' && !(e.pushV && e.pushV.length() > 0.01)); if (e) { RA.setSetting('knockback', 0); off = { e, x: e.pos.x, z: e.pos.z, t }; e.hp += 1; e.onHit(1, false, P0, 1); } }
      if (off && t - off.t > 0.25) { off.moved = Math.hypot(off.e.pos.x - off.x, off.e.pos.z - off.z); RA.endRun(false, true); }
    }, 120, s => '', true);
    RA.setSetting('knockback', 100);
    log(`knockback: pushed back ${pushes.map(v => v.toFixed(2)).join(' ')} m · strike delayed ${delays.map(v => v.toFixed(2)).join(' ')} s · with 0 % moved ${off && off.moved !== undefined ? off.moved.toFixed(3) : '?'}`);
    if (pushes.length < 2 || pushes.some(v => v < 0.07)) errors.push('defensa: cada impacto debería apartar al enemigo unos centímetros');
    if (delays.some(v => v < 0.1)) errors.push('defensa: un impacto mientras prepara el golpe debería retrasárselo');
    if (!off || !(off.moved < 0.02)) errors.push('defensa: con «Retroceso» a 0 % no deberían moverse al recibir'); }
  // Defensa 2: las perfectas llenan el escudo por técnica; lleno, para solo el siguiente golpe y aparta al enemigo
  { let fill = null, shieldHit = null;
    await runConfig('defensa: escudo por técnica', { ...base, mode: 'combat', exercise: 'squat', guard: 'tech', foeKind: 'ground', foesGate: 'robot', waves: 1, repsWave: 40, walkTime: 6, maxAlive: 1 }, t => {
      RA.PV.crouch = false;
      if (fill === null && RA.state === 'play') { const c0 = RA.GUARD.charge; for (let i = 0; i < 4; i++) { RA.onCharge(); RA.onRep({ perfect: true }); } fill = [c0, RA.GUARD.charge]; }
      const e = RA.enemies.find(e => e.alive && e.type === 'robot');
      if (fill && !shieldHit && e && e.state === 'strike') shieldHit = { e, taken: RA.stats.taken };
      if (shieldHit && !shieldHit.done && shieldHit.e.state === 'knock') { shieldHit.done = true; shieldHit.taken2 = RA.stats.taken; shieldHit.stun = shieldHit.e.stunT; shieldHit.charge = RA.GUARD.charge; }
      if (shieldHit && shieldHit.done && !shieldHit.next && e && e.state === 'knock' && e.st > 3) {} 
      if (shieldHit && shieldHit.done && RA.stats.taken > shieldHit.taken2) RA.endRun(false, true); // el siguiente golpe ya entra (el escudo se gastó)
    }, 90, s => '', true);
    log(`technique shield: charge ${fill && fill.map(v => v.toFixed(2)).join(' → ')} · hit absorbed ${shieldHit && shieldHit.taken2 === shieldHit.taken} · stunned ${shieldHit && shieldHit.stun > 0} · charge after ${shieldHit && shieldHit.charge} · shields ${RA.stats.shields}`);
    if (!fill || fill[1] < 1) errors.push('defensa: cuatro repeticiones perfectas deberían llenar el escudo');
    if (!shieldHit || !shieldHit.done || shieldHit.taken2 !== shieldHit.taken || !(shieldHit.stun > 0) || shieldHit.charge !== 0) errors.push('defensa: con el escudo lleno, el golpe no debería hacer daño, el enemigo debería quedar aturdido y el escudo, gastarse'); }
  // Defensa 3: el puño cerrado delante del pecho (de pie, manos libres): subido mientras el enemigo prepara el golpe es
  // una parada (rebota y queda aturdido); mantenido desde antes, solo bloquea
  for (const ex of ['squat']) {
    let mode = 'parry', parryAt = -1, blockFrom = -1, warned = false, shown = false;
    await runConfig(`defensa: guardia (${ex})`, { ...base, mode: 'combat', exercise: ex, guard: 'full', guardDiff: 'normal', foeKind: 'ground', foesGate: 'robot', waves: 1, repsWave: 60, walkTime: 6, maxAlive: 1 }, t => {
      RA.PV.crouch = false; const e = RA.enemies.find(e => e.alive && e.type === 'robot');
      if (e && e.state === 'windup' && e.st > 0.2) warned = warned || RA.GV.warn.some(w => w.visible && w.material.opacity > 0.3);
      if (mode === 'guard' || RA.PV.guard) shown = shown || RA.GV.shield.left.visible;
      if (mode === 'parry') { RA.PV.guard = !!e && (e.state === 'windup' || e.state === 'strike') && !(e.stunT > 0); if (RA.stats.parries >= 1) { mode = 'block'; blockFrom = t; } }
      else if (mode === 'block') { RA.PV.guard = true; if (RA.stats.blocks >= 1) { mode = 'done'; RA.PV.guard = false; RA.endRun(false, true); } }
    }, 120, s => '', true);
    RA.PV.guard = false;
    log(`guard ${ex}: parries ${RA.stats.parries} blocks ${RA.stats.blocks} taken ${RA.stats.taken} energy ${RA.GUARD.en.toFixed(2)} score ${RA.score} · windup warning ${warned} · shield shown ${shown}`);
    if (!warned) errors.push(`defensa (${ex}): mientras prepara el golpe, el enemigo debería brillar avisando`);
    if (!shown) errors.push(`defensa (${ex}): con la guardia subida debería verse el escudo`);
    if (RA.stats.parries < 1 || RA.stats.blocks < 1 || RA.stats.taken) errors.push(`defensa (${ex}): la guardia debería parar (subida a tiempo) y bloquear (mantenida) sin recibir daño`); }
  // Defensa 4: con pesas (curl con barra: las manos juntas delante del pecho en cada repetición) o con las manos apoyadas
  // (flexiones, quieto en la postura) no hay gestos: ni escudo ni burbuja, solo el escudo por técnica
  for (const ex of ['curl2', 'pushup']) {
    let up = 0, shown = false;
    await runConfig(`defensa: sin gestos (${ex})`, { ...base, mode: 'combat', exercise: ex, guard: 'full', foeKind: 'ground', foesGate: 'robot', foesHatch: 'spider', waves: 1, repsWave: 60, walkTime: 5, maxAlive: 2 }, t => {
      RA.PV.crouch = false; RA.PV.guard = RA.state === 'play'; // (las manos juntas delante del pecho todo el rato)
      if (RA.GUARD.up) up++; shown = shown || RA.GV.shield.left.visible || RA.GV.shield.right.visible;
      if (t > 25) RA.endRun(false, true);
    }, 60, s => '', true);
    RA.PV.guard = false;
    log(`no gestures (${ex}): guard up frames ${up} · shield shown ${shown}`);
    if (up || shown) errors.push(`defensa (${ex}): con pesas o con las manos apoyadas no debería subirse la guardia ni verse el escudo`); }
  RA.setSetting('foeKind', 'both'); RA.setSetting('foesHatch', 'spider'); // (lo que tocaron las pruebas de la defensa)
  // el diablillo (con un modelo de mentira): golpes variados (gancho, tajos…), cada uno con su marca de parada; derribado
  // cae de espaldas y se levanta con sus animaciones; y el lanzador te tira piedras: te dan si no te mueves, se esquivan
  // apartándote y se paran con la mano
  { const g = new THREE.Group(); for (const n of ['spine_03', 'Head', 'hand_r', 'pelvis']) { const b = new THREE.Group(); b.name = n; g.add(b); } g.children[2].position.set(0.2, 1.2, 0.3); g.add(new THREE.Mesh());
    const clips = {}; for (const n of RA.BEAST_CLIPS) clips[n] = { name: n, duration: { Hit_Knockback: 0.83, LayToIdle: 1.53, Sword_Regular_C: 2, OverhandThrow: 1.33 }[n] || 0.6, tracks: [] };
    const wasReady = RA.BEAST.ready; RA.BEAST.ready = true; RA.BEAST.kinds.imp = { scene: g, clips, maps: [null, null, null], normal: null, orm: null, emissive: null };
    const atks = new Set(), downClips = new Set();
    await runConfig('diablillo: golpes variados y derribo', { ...base, mode: 'combat', foes: 'robots', aim: 'auto', exercise: 'squat', foesGate: 'imp', waves: 2, repsWave: 16, walkTime: 5, maxAlive: 3, lives: 0 }, t => {
      RA.PV.crouch = (t % 4.6) < 0.9; // sin cargar: que lleguen a golpear
      for (const e of RA.enemies) { if (e.constructor.name !== 'Beast') continue; if (t > 30 && e.alive && e.out && (e.state === 'walk' || e.state === 'windup') && !downClips.has('LayToIdle') && Math.random() < 0.03) { e.hp += 2; e.onHit(1, false, e.center(new THREE.Vector3()), 4); } /* (como un disparo ×4 que no lo mata; hasta verlo levantarse) */ if (e.state === 'windup' && e.atk) atks.add(e.atk); if (e.state === 'down') downClips.add(e.cur); }
    }, 420, s => '', true);
    const zones = ['Melee_Hook', 'Sword_Regular_A', 'Sword_Regular_B', 'Sword_Regular_C', 'Punch_Jab'].map(a => { const r = { atk: a, pos: new THREE.Vector3(0, 0, -2) }; RA.blockStart(r); const P = RA.blockPoint(r, new THREE.Vector3()); return `${a}:${r.zone}/${r.zoneSide}@${P.x.toFixed(2)}`; });
    log(`imp attacks: ${[...atks].join(',')} · knocked down playing ${[...downClips].join(',')} · block marks ${zones.join(' ')}`);
    if (atks.size < 3) errors.push(`diablillo: los golpes no varían (${[...atks]})`);
    if (!downClips.has('Hit_Knockback') || !downClips.has('LayToIdle')) errors.push('diablillo derribado: debería caer (Hit_Knockback) y levantarse (LayToIdle)');
    const side = z => +z.split('@')[1]; if (!(zones[0].includes(':mid/-1') && zones[1].includes(':low/-1') && zones[2].includes(':mid/1') && zones[3].includes(':high/0') && side(zones[0]) < side(zones[4]) - 0.2 && side(zones[2]) > side(zones[4]) + 0.2)) errors.push('espada: la marca de parada no sigue la altura y el lado de cada golpe');
    // el lanzador
    const runThrow = async (name, react) => { const R = { thrown: 0, hit: 0, other: 0 }, fly = new Map();
      await runConfig(name, { ...base, mode: 'combat', foes: 'robots', aim: 'auto', exercise: 'squat', foesGate: 'thrower', waves: 1, repsWave: 30, walkTime: 4, maxAlive: 2, lives: 0 }, t => {
        RA.PV.crouch = false; const h = RA.hands.right; RA.PV.handAt = null; react(null, h);
        for (const r of RA.ROCKS) { if (!fly.has(r)) { fly.set(r, 'fly'); R.thrown++; } if (r.mode === 'fly') react(r, h); else if (fly.get(r) === 'fly') { fly.set(r, 'done'); R.other++; } }
        for (const [r, m] of fly) if (!RA.ROCKS.includes(r)) { if (m === 'fly') R.hit++; fly.delete(r); }
      }, 50, s => { R.taken = s.taken; return ''; }, true); return R; };
    const home = RA.camera.position.clone();
    const still = await runThrow('lanzador: quieto, te dan', () => {});
    const dodge = await runThrow('lanzador: apartándote, las esquivas', r => { if (!r) RA.camera.position.x = home.x; else if (r.t > r.T - 0.45) RA.camera.position.x = RA.arena.localToWorld(r.to.clone()).x + 0.7; }); // a punto de llegar una: un paso al lado de donde iba
    RA.camera.position.x = home.x;
    const parry = await runThrow('lanzador: parándolas con la mano', r => { if (r && r.t > r.T * 0.6) RA.PV.handAt = RA.arena.localToWorld(r.to.clone()); }); // la mano, donde llega
    RA.PV.handAt = null;
    log(`thrower: still → thrown ${still.thrown}, hit ${still.hit} (taken ${still.taken}) · dodging → thrown ${dodge.thrown}, dodged ${dodge.other}, hit ${dodge.hit} · parrying → thrown ${parry.thrown}, parried ${parry.other}, hit ${parry.hit}`);
    if (still.hit < 2 || still.other || !still.taken) errors.push('lanzador: quieto, las piedras deberían darte'); // (las que siguen en el aire al acabar no cuentan)
    if (dodge.thrown < 2 || dodge.hit > 0 || dodge.other < 2) errors.push('lanzador: apartándote, las piedras deberían fallar');
    if (parry.thrown < 2 || parry.hit > 0 || parry.other < 2) errors.push('lanzador: con la mano en su camino, las piedras deberían pararse');
    delete RA.BEAST.kinds.imp; RA.BEAST.ready = wasReady; RA.setSetting('foesGate', RA.SCHEMA.find(f => f.key === 'foesGate').def); }
  // cada enemigo: rapidez de gestos y velocidad al desplazarse, por separado; más rápidos no llegan antes (lo gastan en
  // zigzag o paradas); con esquivas se apartan de golpe
  { const runMove = async (name, pace, spd, move) => { const R = { arrive: [], vmax: 0, dodges: 0, sp: [], ex: [], atk: [] }, born = new Map(), seen = new Set(), wu = new Map();
      await runConfig(name, { ...base, mode: 'combat', foes: 'robots', aim: 'auto', exercise: 'squat', foesGate: 'robot', walkTime: 8, maxAlive: 2, pace_robot: pace, spd_robot: spd, move_robot: move }, t => {
        RA.PV.crouch = false;
        for (const e of RA.enemies) { if (!e.alive || e.type !== 'robot' || e.K.boss) continue; if (!born.has(e)) born.set(e, t);
          if (e.state === 'walk' && !e.charged && e.spd > 0.15) (e.out ? R.sp : R.ex).push(e.spd); if (e.dodge > 0 && !seen.has(e.dodgeT)) { seen.add(e.dodgeT); R.dodges++; }
          if (e.state === 'windup' && !e._arr) { e._arr = 1; R.arrive.push(t - born.get(e)); }
          if (e.state === 'windup' && !wu.has(e)) wu.set(e, t); if (e.state === 'walk' && wu.has(e)) { R.atk.push(t - wu.get(e)); wu.delete(e); } } // golpe entero: preparar, golpear y retroceder
      }, 40, s => '', true);
      const med = a => { a.sort((x, y) => x - y); return a[a.length >> 1] || 0; }; R.med = med(R.arrive); R.v = med(R.sp); R.vx = med(R.ex); R.a = med(R.atk); return R; };
    if (!process.env.ONLY || new RegExp(process.env.ONLY).test('robots a su ritmo')) {
      const A = await runMove('robots a su ritmo', 100, 100, 'straight'), G = await runMove('robots con gestos al 250 %', 250, 100, 'straight'), F = await runMove('robots que se desplazan al 250 %', 100, 250, 'straight');
      const Z = await runMove('robots en zigzag al 200 %', 100, 200, 'zigzag'), D = await runMove('robots con esquivas', 150, 100, 'dodge');
      log(`gestures: a whole attack ${A.a.toFixed(2)} s at 100 %, ${G.a.toFixed(2)} s with gestures at 250 %, ${F.a.toFixed(2)} s with travel at 250 %`);
      log(`travel: 100 % ${A.v.toFixed(2)} m/s (leaving the gate ${A.vx.toFixed(2)}), arrives ${A.med.toFixed(1)} s · gestures 250 % ${G.v.toFixed(2)} m/s · travel 250 % ${F.v.toFixed(2)} m/s (leaving ${F.vx.toFixed(2)}), arrives ${F.med.toFixed(1)} s · zigzag 200 % ${Z.v.toFixed(2)} m/s, arrives ${Z.med.toFixed(1)} s · dodges ${D.dodges}`);
      if (!A.a || !G.a || G.a > A.a / 1.8) errors.push(`cada enemigo: con más rapidez de gestos el golpe debería ir más deprisa (${A.a.toFixed(2)} → ${G.a.toFixed(2)} s)`);
      if (!F.a || Math.abs(F.a - A.a) > A.a * 0.2) errors.push(`cada enemigo: la velocidad al desplazarse no debería cambiar sus gestos (${A.a.toFixed(2)} → ${F.a.toFixed(2)} s)`);
      if (Math.abs(G.v - A.v) > A.v * 0.25) errors.push(`cada enemigo: la rapidez de gestos no debería cambiar lo deprisa que se desplazan (${A.v.toFixed(2)} → ${G.v.toFixed(2)} m/s)`);
      if (F.v < A.v * 1.8 || Z.v < A.v * 1.4 || F.vx < A.vx * 1.8) errors.push(`cada enemigo: la velocidad al desplazarse no cambia lo deprisa que van (100 % ${A.v.toFixed(2)}, 250 % ${F.v.toFixed(2)}, al salir ${A.vx.toFixed(2)} → ${F.vx.toFixed(2)}, zigzag ${Z.v.toFixed(2)} m/s)`);
      if (!A.med || !Z.med || !F.med || Math.abs(Z.med - A.med) > A.med * 0.35 || Math.abs(F.med - A.med) > A.med * 0.35) errors.push(`cada enemigo: más deprisa no deberían llegar mucho antes ni después (${A.med.toFixed(1)} → ${F.med.toFixed(1)} / ${Z.med.toFixed(1)} s)`);
      if (D.dodges < 2) errors.push(`cada enemigo: con esquivas no se apartan nunca (${D.dodges})`);
    }
    for (const g of ['robot', 'beast']) { RA.setSetting('pace_' + g, 150); RA.setSetting('spd_' + g, 100); RA.setSetting('move_' + g, 'zigzag,bursts,dodge'); } RA.setSetting('maxAlive', 5); RA.setSetting('foesGate', RA.SCHEMA.find(f => f.key === 'foesGate').def); }
  // inchworm: seis huellas (las del medio cambian de sitio), caminar con las manos por todas y la flexión en las últimas
  const iwMid = new Set();
  await runConfig('Combate flexiones inchworm', { ...base, mode: 'combat', foes: 'robots', exercise: 'inchworm', walkTime: 10 }, t => {
    RA.PV.iwAuto = true; const m = RA.IW.prints.find(p => p.pair === 1 && p.side === 'left'); iwMid.add(m.x.toFixed(2) + m.z.toFixed(2));
  }, 420, s => s.reps < 5 ? `inchworm: pocas repeticiones (${s.reps})` : iwMid.size < 3 ? 'inchworm: las huellas del medio no cambian de sitio' : RA.IW.prints.length !== 6 ? 'inchworm: no hay seis huellas' : '');
  await runConfig('inchworm sin las huellas del medio', { ...base, mode: 'combat', foes: 'robots', exercise: 'inchworm', waves: 1 }, t => { RA.PV.iwAuto = RA.PV.iwSkip = true; }, 40,
    s => s.reps ? 'inchworm: sin pasar por todas las huellas no debería disparar' : s.partial < 2 ? 'inchworm: no avisa de que faltan huellas' : '', true);
  RA.PV.iwAuto = RA.PV.iwSkip = false; RA.PV.iwT = 0;
  // las compuertas son sólidas: ningún robot se mete en sus pilares o en los bloques de los lados, ni cruza el hueco con las puertas cerradas
  { let inSolid = 0, closedPass = 0, frames = 0;
    await runConfig('Robots y compuertas sólidas', { ...base, mode: 'combat', foes: 'robots', aim: 'auto', exercise: 'squat', maxAlive: 6, spawnGap: 0.4, walkTime: 8, waves: 2, repsWave: 6 }, t => {
      squatSim(2.6)(t); frames++;
      const S = RA.envSolids();
      for (const e of RA.enemies) { if (!e.alive || e.type !== 'robot') continue;
        if (S.some(c => (e.out || c.g !== e.gate) && Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < c.r * 0.8)) inSolid++;
        for (const g of RA.gates) { if (!g.on || (g === e.gate && !e.out)) continue; // por ninguna puerta cerrada (ni la suya, ya fuera)
          const r = g.g.rotation.y, lx = (e.pos.x - g.x) * Math.cos(r) - (e.pos.z - g.z) * Math.sin(r), lz = (e.pos.x - g.x) * Math.sin(r) + (e.pos.z - g.z) * Math.cos(r);
          if (Math.abs(lx) < 1.2 * g.scale && Math.abs(lz) < 0.15 * g.scale && g.open < 0.4) closedPass++; } }
    }, 420, () => '');
    log(`gates are solid: robot frames inside a pillar or block ${inSolid}, crossing a closed door ${closedPass} (of ${frames} frames)`);
    if (inSolid) errors.push('los robots atraviesan los pilares o los bloques de las compuertas');
    if (closedPass) errors.push('los robots cruzan compuertas cerradas'); }
  // los voladores salen por el hueco de la compuerta: nunca atraviesan su techo ni sus paredes
  { let through = 0, frames = 0, inside = 0, hiY = 0;
    await runConfig('Voladores y techo de las compuertas', { ...base, mode: 'combat', foes: 'flyers', aim: 'auto', exercise: 'squat', maxAlive: 6, spawnGap: 0.4, flySpeed: 6, waves: 2, repsWave: 6 }, t => {
      squatSim(2.6)(t); frames++;
      for (const e of RA.enemies) { if (!e.alive || e.type !== 'flyer') continue;
        const g = RA.gates.filter(g => g.on).reduce((a, b) => Math.hypot(b.x - e.pos.x, b.z - e.pos.z) < Math.hypot(a.x - e.pos.x, a.z - e.pos.z) ? b : a), r = g.g.rotation.y, sc = g.scale, lx = ((e.pos.x - g.x) * Math.cos(r) - (e.pos.z - g.z) * Math.sin(r)) / sc, lz = ((e.pos.x - g.x) * Math.sin(r) + (e.pos.z - g.z) * Math.cos(r)) / sc;
        if (lz < 0.5 && lz > -1.6 && Math.abs(lx) < 2) { inside++; hiY = Math.max(hiY, (e.pos.y + e.radius) / sc); if (e.pos.y + e.radius > 2.99 * sc || Math.abs(lx) + e.radius / sc > 1.19) through++; } }
    }, 420, () => '');
    log(`flyers leave through the gap: frames inside a gate ${inside} (highest top ${hiY.toFixed(2)} m, ceiling 2.99) · through the ceiling or walls ${through} (of ${frames} frames)`);
    if (!inside) errors.push('voladores: la prueba no vio ninguno saliendo de una compuerta');
    if (through) errors.push('los voladores atraviesan el techo o las paredes de las compuertas'); }
  // derrota: al perder la última vida, fundido a negro con «DERROTA» delante y, solo, el resumen con sus botones
  { applyCfg({ mode: 'combat', foes: 'robots', aim: 'auto', exercise: 'squat', lives: 1, waves: 3, repsWave: 30, walkTime: 3, maxAlive: 3, ramp: 0 });
    RA.startPreview(); frame(3); press('EMPEZAR'); let i = 0; for (; i < 60 * 60 && RA.state !== 'end'; i++) frame(1);
    const O = RA.OUT; frame(60); const dark = O.veil.material.opacity, title = O.title.mesh.visible, menuEarly = !!RA.menu;
    for (let k = 0; k < 120 && !RA.menu; k++) frame(1); const lw = RA.activeWidgets().map(w => w.label);
    const titleRow = RA.menu && RA.menu.rows && RA.menu.rows[0]; frame(40);
    const mp = RA.menu && RA.menu.group.getWorldPosition(new THREE.Vector3()), R = O.black.scale.x, menuIn = !!mp && mp.distanceTo(O.black.position) < R - 0.3, solid = O.black.visible && !O.black.material.transparent && O.black.material.opacity === 1;
    log(`defeat: ended ${RA.state} after ${(i / 60).toFixed(0)} s · 1 s later: black ${dark.toFixed(2)}, title ${title}, summary already ${menuEarly} · then summary “${titleRow && titleRow.text}” with ${['Otra ronda', 'Menú principal'].filter(l => lw.includes(l)).join(' + ')} · behind it solid black ${solid} (radius ${R.toFixed(2)}, menu inside ${menuIn}) · enemies left ${RA.enemies.length}`);
    if (RA.state !== 'end' || dark < 0.99 || !title || menuEarly || !lw.includes('Otra ronda') || !lw.includes('Menú principal') || !titleRow || titleRow.text !== 'DERROTA') errors.push('derrota: no funde a negro, no avisa claramente o no sale solo el resumen con sus opciones');
    if (!solid || !menuIn || RA.enemies.length) errors.push('derrota: el negro no es total y definitivo detrás del resumen');
    // el resumen se queda (sin cuenta atrás) hasta que pulsas: «Menú principal» lleva al menú
    { for (let k = 0; k < 60 * 20; k++) frame(1); const still = RA.state === 'end' && !!RA.menu && RA.activeWidgets().some(w => w.label === 'Otra ronda');
      press('Menú principal'); frame(2); log(`summary card: still there after 20 s ${still} · after pressing Menú principal: ${RA.state}`);
      if (!still) errors.push('resumen: debería quedarse delante, sin cuenta atrás, hasta que pulses algo');
      if (RA.state !== 'lobby') errors.push('resumen: «Menú principal» debería llevar al menú principal'); }
    if (O.veil.visible || O.black.visible) errors.push('derrota: el fundido no se quita al volver al menú');
    // terminarla tú: también a negro, y el resumen enseguida
    RA.setSetting('lives', 3); RA.startPreview(); frame(3); press('EMPEZAR'); for (let k = 0; k < 600 && RA.state !== 'play'; k++) frame(1);
    RA.endRun(false, true); frame(10); const early = !!RA.menu; frame(20); const mBlack = O.black.visible, mMenu = !!RA.menu && RA.activeWidgets().some(w => w.label === 'Otra ronda');
    log(`manual end: menu after 10 frames ${early} · after 30: black ${mBlack}, summary ${mMenu}`);
    if (early || !mBlack || !mMenu) errors.push('al terminar la ronda tú, no funde a negro con el resumen');
    press('Menú principal'); frame(3);
    RA.setSetting('lives', 0); RA.setSetting('ramp', 6); RA.exitAll(); frame(1); }
  // un empujón que mete a alguien en una puerta cerrada lo deja fuera, por el lado más corto
  { const door = RA.envSolids().find(c => c.g && c.r < 0.4 * c.g.scale), e = { pos: { x: 0, z: 0 }, radius: 0.4, out: true, gate: null };
    if (door) { e.pos.x = door.x + 0.05; e.pos.z = door.z; RA.solidPush(e); }
    const d = door ? Math.hypot(e.pos.x - door.x, e.pos.z - door.z) : 0; log(`push out of a closed door: ${d.toFixed(2)} m from its centre (needs ${door ? (door.r + 0.4).toFixed(2) : '?'})`);
    if (!door || d < door.r + 0.4 - 1e-6) errors.push('un empujón puede meter a un enemigo en una puerta cerrada'); }
  // ritmo en Combate: los enemigos salen en el pulso
  { let spawnBeats = [], lastN = 0;
    await runConfig('Combate con ritmo (100 BPM)', { ...base, mode: 'combat', foes: 'mix', aim: 'auto', exercise: 'squat', bpm: 100, spawnGap: 0.9 }, t => { squatSim()(t); if (RA.enemies.length > lastN) spawnBeats.push(RA.beatNow() % 1); lastN = RA.enemies.length; }, 420, s => s.kills < 4 ? 'con ritmo no se juega' : '');
    const off = spawnBeats.map(f => Math.min(f, 1 - f)), worst = Math.max(0, ...off);
    log(`combat beat: ${spawnBeats.length} spawns, furthest from a beat ${(worst * 100).toFixed(0)}% of a beat`);
    if ((spawnBeats.length || !process.env.ONLY) && (!spawnBeats.length || worst > 0.15)) errors.push('con ritmo, los enemigos no salen en el pulso');
    RA.setSetting('bpm', 0); }
  // Combate: cualquier enemigo con cualquier puntería
  // la diana es un contorno de neón rojo en el robot al que apuntas: sale en él (solo en él), parpadea y nunca el aro antiguo
  { const LK = { on: 0, n: 0, other: 0, ring: 0, kLo: 1, kHi: 0, dead: 0 };
    await runConfig('Combate robots apuntando con la mirada', { ...base, mode: 'combat', foes: 'robots', aim: 'gaze', exercise: 'squat', walkTime: 10 }, t => { squatSim()(t); const e = RA.enemies.find(x => x.alive); if (e) RA.camera.lookAt(e.center(new THREE.Vector3()));
      const g = RA.gazeLock(), vis = x => !!(x.lkl && x.lkl.length && x.lkl[0].visible);
      if (g && RA.state === 'play') { LK.n++; if (vis(g)) LK.on++; LK.kLo = Math.min(LK.kLo, RA.LKL.k); LK.kHi = Math.max(LK.kHi, RA.LKL.k); if (LK.prev !== undefined) LK.jump = Math.max(LK.jump || 0, Math.abs(RA.LKL.k - LK.prev)); LK.prev = RA.LKL.k; } else LK.prev = undefined;
      for (const x of RA.enemies) { if (x !== g && x.alive && vis(x)) LK.other++; if (!x.alive && vis(x)) LK.dead++; }
      if (Object.values(RA.locks).some(r => r.visible)) LK.ring++;
    }, 420, s => s.kills < 3 ? 'apuntando tú no se derriban robots' : s.hits < s.shots * 0.5 ? 'mirando al robot se falla demasiado' : '');
    log(`lock outline: on the aimed robot ${LK.on}/${LK.n} · on others ${LK.other} · on dead ones ${LK.dead} · old ring ${LK.ring} · glow ${LK.kLo.toFixed(2)}–${LK.kHi.toFixed(2)}, biggest step per frame ${(LK.jump || 0).toFixed(3)}`);
    if (LK.on < LK.n * 0.9 || LK.other || LK.dead || LK.ring || LK.kHi - LK.kLo < 0.3 || LK.jump > 0.12) errors.push('diana: el robot apuntado debería llevar el contorno de neón con un brillo que sube y baja despacio (solo él, nunca el aro antiguo)'); }
  // la mirada baja al agacharse y aún no ha vuelto al subir (cuando se dispara): el rayo va igual al robot que mirabas
  { let crT = -9; await runConfig('Combate mirada que se mueve en la sentadilla', { ...base, mode: 'combat', foes: 'robots', aim: 'gaze', exercise: 'squat', walkTime: 10 }, t => { squatSim()(t); if (RA.PV.crouch) crT = t; const e = RA.enemies.find(x => x.alive); if (e) { RA.camera.lookAt(e.center(new THREE.Vector3())); if (t - crT < 0.5) RA.camera.rotateX(-0.42); } }, 420, s => s.kills < 3 ? 'con la mirada moviéndose no se derriban robots' : s.shots > s.hits * 2.5 || s.taken > 4 ? `con la mirada moviéndose en la sentadilla se falla demasiado (${s.hits}/${s.shots}, golpes recibidos ${s.taken})` : ''); } // los fallos que quedan: disparos sin ningún robot a la vista
  RA.camera.rotation.set(0, 0, 0);
  // (y el estallido de cada uno sale donde murió: onKilled pregunta su posición cuando ya se ha quitado de la escena)
  { const last = new Map(); let far = 0, deaths = 0;
    await runConfig('Combate voladores automática', { ...base, mode: 'combat', foes: 'flyers', aim: 'auto', exercise: 'squat', flySpeed: 8 }, t => { squatSim()(t);
      for (const e of RA.enemies) { if (e.type !== 'flyer') continue; if (e.alive) last.set(e, e.root.getWorldPosition(new THREE.Vector3())); else if (last.has(e)) { deaths++; far = Math.max(far, e.center(new THREE.Vector3()).distanceTo(last.get(e))); last.delete(e); } }
    }, 420, s => s.kills < 6 ? 'la puntería automática no derriba voladores' : '');
    log(`flyer deaths: ${deaths} · burst at most ${far.toFixed(2)} m from where it died`);
    if (deaths && far > 0.5) errors.push(`voladores: el estallido sale a ${far.toFixed(2)} m de donde murió el volador`); }
  const MIX = { robots: 0, flyers: 0 };
  await runConfig('Combate mezcla', { ...base, mode: 'combat', foes: 'mix', aim: 'auto', exercise: 'squat', walkTime: 10, flySpeed: 8 }, t => { squatSim()(t); for (const e of RA.enemies) if (e.alive) MIX[e.type === 'robot' ? 'robots' : 'flyers'] = 1; }, 420, s => !MIX.robots || !MIX.flyers ? 'la mezcla no trae robots y voladores' : s.kills < 4 ? 'en la mezcla no se derriba a nadie' : '');
  await runConfig('Combate mezcla en flexiones', { ...base, mode: 'combat', foes: 'mix', aim: 'auto', exercise: 'pushup', walkTime: 8 }, squatSim(2.6), 420, s => s.kills < 4 ? 'en flexiones con mezcla no se derriba a nadie' : '');
  await runConfig('Enjambre+curl', { ...base, mode: 'flyers', exercise: 'curl' }, curlSim);
  await runConfig('Arcos', { ...base, mode: 'arcs', exercise: 'squat', arcDouble: 40 }, t => { RA.PV.crouch = true; });
  // arcos inclinados: hay que apartarse hacia el lado alto; aparición regular o irregular
  const gaps = { regular: [], irregular: [] };
  for (const timing of ['regular', 'irregular']) {
    let last = -1, n = -1;
    await runConfig('Arcos ' + timing, { ...base, mode: 'arcs', exercise: 'squat', arcDouble: 0, arcJump: 0, arcTiming: timing, arcTilt: 0, waves: 1, repsWave: 12, arcRate: 20 }, t => { RA.PV.crouch = true; const q = RA.spawnQueue.length; if (n >= 0 && q < n) { if (last >= 0) gaps[timing].push(t - last); last = t; } n = q; }, 200);
  }
  const spread = g => g.length ? Math.max(...g) - Math.min(...g) : 0;
  log('arc gaps spread: regular', spread(gaps.regular).toFixed(2), 'irregular', spread(gaps.irregular).toFixed(2), 'irregular mean', (gaps.irregular.reduce((a, b) => a + b, 0) / gaps.irregular.length).toFixed(2));
  if (spread(gaps.regular) > 0.1 || spread(gaps.irregular) < 1.0) errors.push('la aparición regular/irregular de los arcos no se nota');
  // espera máxima: con pocos arcos por minuto (uno cada 20 s), nunca más de lo pedido entre uno y el siguiente
  { const G = []; let last = -1, n = -1;
    await runConfig('Arcos con espera máxima', { ...base, mode: 'arcs', exercise: 'squat', arcDouble: 0, arcJump: 0, arcTiming: 'irregular', arcTilt: 0, waves: 1, repsWave: 6, arcRate: 3, arcMaxGap: 4 }, t => { RA.PV.crouch = true; const q = RA.spawnQueue.length; if (n >= 0 && q < n) { if (last >= 0) G.push(t - last); last = t; } n = q; }, 200);
    log('arc max wait 4 s at 3 arcs/min: gaps', G.map(g => g.toFixed(1)).join(' '));
    if (!G.length || Math.max(...G) > 4.15) errors.push('arcos: la espera máxima entre uno y el siguiente no se respeta'); }
  await runConfig('Arcos inclinados (apartándose)', { ...base, mode: 'arcs', exercise: 'squat', arcDouble: 0, arcJump: 0, arcTilt: 100, arcTiltMax: 25, arcShift: 40, waves: 1, repsWave: 8, lives: 0 }, t => { RA.PV.crouch = true; }, 200, s => s.taken ? `golpes al apartarse hacia el lado alto: ${s.taken}` : '');
  // inclinados anchos y con poca bajada: el lado alto queda a 1 m (zancada lateral); la barra se estira y no se mete en el suelo
  { let W = { hw: 0, lean: 0, low: 9, drop: 9 }; await runConfig('Arcos inclinados anchos (separación y bajada propias)', { ...base, mode: 'arcs', exercise: 'squat', arcDouble: 0, arcJump: 0, arcNew: 0, arcMace: 0, arcPlank: 0, arcTilt: 100, arcTiltMax: 30, arcShift: 100, arcTiltW: 300, arcTiltDrop: 12, arcPatterns: 0, arcRight: 100, waves: 1, repsWave: 6, lives: 0 }, t => { RA.PV.crouch = true;
      for (const a of RA.arcs) if (a.tilt && a.hw) { W.hw = Math.max(W.hw, a.hw); W.lean = Math.max(W.lean, Math.abs(a.leanX || 0)); W.low = Math.min(W.low, a.barY - Math.tan(Math.abs(a.tilt)) * a.hw); W.drop = Math.min(W.drop, a.drop); } }, 200, s => s.taken > 1 ? `golpes apartándose 1 m hacia el lado alto: ${s.taken}` : '');
    log(`tilt wide: half width ${W.hw.toFixed(2)} · lean ${W.lean.toFixed(2)} m · low end ${W.low.toFixed(2)} m · drop ${W.drop.toFixed(2)}`);
    if (W.hw && (W.hw < 1.45 || W.lean < 0.95 || W.low < 0.1 || W.drop > 0.15)) errors.push(`arcos inclinados: separación ${W.hw}, desplazamiento ${W.lean}, extremo bajo ${W.low} o bajada ${W.drop} no siguen los ajustes`); for (const [k, v] of Object.entries({ arcTiltW: 200, arcTiltDrop: 0, arcShift: 40, arcPatterns: RA.SCHEMA.find(f => f.key === 'arcPatterns').def, arcRight: 50 })) RA.setSetting(k, v); }
  RA.PV.noLean = true;
  await runConfig('Arcos inclinados sin apartarse', { ...base, mode: 'arcs', exercise: 'squat', arcDouble: 0, arcJump: 0, arcTilt: 100, arcTiltMax: 25, arcShift: 40, arcMin: 30, arcMax: 30, waves: 1, repsWave: 6, lives: 0 }, t => { RA.PV.crouch = true; }, 200, s => s.taken < 4 ? `sin apartarse deberían golpear casi todos (${s.taken})` : '');
  RA.PV.noLean = false; RA.setSetting('arcTilt', 0);
  // vallas bajas: hay que saltarlas (subida rápida de la cabeza); de puntillas despacio no vale
  await runConfig('Arcos con vallas (saltando)', { ...base, mode: 'arcs', exercise: 'squat', arcJump: 100, arcDouble: 0, waves: 1, repsWave: 8, lives: 0, jumpHeight: 10 }, t => { RA.PV.crouch = true; }, 200, s => s.taken ? `${s.taken} vallas no saltadas` : s.reps < 8 ? 'no cuenta los saltos' : '');
  await runConfig('Arcos con vallas sin saltar', { ...base, mode: 'arcs', exercise: 'squat', arcJump: 100, arcDouble: 0, waves: 1, repsWave: 4, lives: 0, jumpHeight: 10 }, t => { RA.PV.crouch = true; RA.PV.noJump = true; }, 200, s => s.reps ? 'sin saltar no deberían contar las vallas' : s.taken < 4 ? 'las vallas no golpean si no saltas' : '');
  await runConfig('Arcos con vallas de puntillas (despacio)', { ...base, mode: 'arcs', exercise: 'squat', arcJump: 100, arcDouble: 0, waves: 1, repsWave: 4, lives: 0, jumpHeight: 10 }, t => { RA.PV.crouch = true; RA.PV.noJump = false; RA.PV.slowJump = true; }, 200, s => s.reps ? 'subir despacio (de puntillas) no debería contar como salto' : '');
  RA.PV.noJump = RA.PV.slowJump = false;
  // la escalera de enemigos: en la primera oleada, solo los fáciles de entre los elegidos; en la última, ya entran los duros (y se anuncian)
  { const sv = { ...RA.settings }; RA.setSetting('mode', 'combat'); RA.setSetting('exercise', 'squat'); for (const [k, v] of Object.entries({ foeLadder: 1, foesGate: 'zombie,raptor,yeti', foesFly: '', foeKind: 'all', rank: 'cabo', waves: 6, repsWave: 20 })) RA.setSetting(k, v);
    const kinds = i => [...new Set(RA.buildWave(i).filter(e => !/boss/.test(e.kind)).map(e => e.kind))].sort().join(',');
    const w0 = kinds(0), w1 = kinds(1), w3 = kinds(3), fresh3 = RA.LADDER.fresh.join(','), w5 = kinds(5); RA.setSetting('foeLadder', 0); const off = kinds(0);
    log(`foe ladder: wave 1 ${w0} · wave 2 ${w1} · wave 4 ${w3} (new ${fresh3}) · wave 6 ${w5} · without the ladder ${off}`);
    if (w0 !== 'zombie' || !w5.includes('yeti') || !off.includes('yeti')) errors.push(`escalera de enemigos: la primera oleada debería traer solo los fáciles y la última, los duros (${w0} → ${w5}; sin ella, ${off})`);
    for (const k in sv) RA.setSetting(k, sv[k]); }
  // al fallo: no se acaba en la última oleada, siempre con vidas (con infinitas, 3) y termina al perderlas, con la oleada a la que llegaste
  { const F = {}; await runConfig('Arcos al fallo', { ...base, mode: 'arcs', exercise: 'squat', toFail: 1, lives: 0, waves: 1, repsWave: 4, repsInc: 0, rest: 0, arcTilt: 0, arcJump: 0, arcDouble: 0, arcNew: 0, arcMace: 0, arcPlank: 0, arcOrbs: 0, arcRate: 20 }, t => { RA.PV.crouch = t < 22; F.wave = RA.waveIdx; },
      300, s => { F.txt = RA.menu && RA.menu.rows ? RA.menu.rows.map(r => r.text || '').join(' | ') : ''; return s.taken !== 3 ? `deberían quitarse 3 vidas (${s.taken} golpes)` : F.wave < 1 ? 'no pasa de la última oleada' : !/Al fallo: oleada|Récord al fallo/.test(F.txt) ? 'el resumen no dice a qué oleada llegaste' : ''; });
    log(`to failure: reached wave ${F.wave + 1} · ${(F.txt || '').slice(0, 120)}`); RA.setSetting('toFail', 0); }
  // la tabla del desarrollador: cada casilla manda en su rango (también las filas que el rango no tocaba), se exporta y se
  // importa, y es de cada modo y ejercicio
  { const sv = { ...RA.settings }; RA.devImport('{}'); RA.setSetting('mode', 'arcs'); RA.setSetting('exercise', 'squat'); RA.setSetting('rank', 'cabo');
    RA.devSet('arcSpeed', 2, 9.5); RA.devSet('arcTilt', 2, 40); const now = [RA.settings.arcSpeed, RA.settings.arcTilt];
    RA.setSetting('rank', 'general'); const gen = [RA.settings.arcSpeed, RA.settings.arcTilt]; RA.setSetting('rank', 'cabo'); const back = [RA.settings.arcSpeed, RA.settings.arcTilt], touched = false;
    const exp = RA.devExport(), html = RA.devTableHTML(), rows = RA.devRows();
    RA.devImport('{}'); const cleared = RA.devCell('arcSpeed', 2) === null; const msg = RA.devImport(exp), again = RA.devCell('arcTilt', 2);
    RA.setSetting('mode', 'combat'); const other = RA.devCell('arcSpeed', 2), bad = RA.devImport('no es json');
    log(`dev table: cabo ${now} · general ${gen} · cabo again ${back} (touched ${touched}) · rows ${rows.length} (${rows.slice(0, 4).join(',')}…) · html ${html.length} chars · import ${msg} → ${again} · in Combate ${other} · bad import “${bad}”`);
    if (String(now) !== '9.5,40' || String(gen) !== '14,0' || String(back) !== '9.5,40' || touched) errors.push('tabla del desarrollador: sus valores no mandan en su rango (o el rango queda «retocado»)');
    if (!rows.includes('arcSpeed') || !rows.includes('arcTiltW') || rows.includes('rank') || rows.includes('squatDepth') || !/dvtab/.test(html) || !/Velocidad/.test(html)) errors.push('tabla del desarrollador: las filas no son las de la dificultad de este modo y ejercicio');
    if (!cleared || again !== 40 || other !== null || !/válid/.test(bad)) errors.push('tabla del desarrollador: no se exporta, se importa o es de cada modo y ejercicio');
    RA.devImport('{}'); for (const k in sv) if (RA.settings[k] !== sv[k]) RA.setSetting(k, sv[k]); }
  // arcos al compás: con ritmo, cada arco llega a la cabeza justo en un pulso
  { const arr = [], seen = new Set(); await runConfig('Arcos al compás (120 BPM)', { ...base, mode: 'arcs', exercise: 'squat', bpm: 120, arcBeat: 1, arcTilt: 0, arcJump: 0, arcDouble: 0, arcNew: 0, arcMace: 0, arcPlank: 0, arcOrbs: 0, waves: 1, repsWave: 10, lives: 0, arcRate: 20 }, t => { RA.PV.crouch = true;
      for (const a of RA.arcs) if (!seen.has(a) && a.z >= RA.HL.z) { seen.add(a); const f = RA.beatNow() % 1; arr.push(Math.min(f, 1 - f)); } }, 200, s => s.reps < 10 ? 'al compás no se completa la oleada' : '');
    const worst = Math.max(0, ...arr); log(`arcs beat: ${arr.length} arrivals, furthest from a beat ${(worst * 100).toFixed(0)}% of a beat`);
    if (arr.length && worst > 0.12) errors.push(`arcos al compás: llegan fuera del pulso (hasta un ${(worst * 100).toFixed(0)} % de pulso)`); RA.setSetting('bpm', 0); }
  // arcos con coreografías, obstáculos nuevos (láser, paredes y rueda), orbes, fiebre y metas (metros, fantasma y medalla)
  { const A = { kinds: new Set(), fever: false, deco: false, orbs: 0, gaps: [] }; let lastN = -1, lastT = 0; storage.delete('reparena3-arcghost');
    await runConfig('Arcos con coreografías y obstáculos nuevos', { ...base, mode: 'arcs', exercise: 'squat', arcPatterns: 1, arcNew: 100, arcWallTilt: 100, arcOrbs: 100, arcFever: 1, arcMove: 1, arcTilt: 30, arcJump: 0, arcDouble: 0, waves: 1, repsWave: 24, lives: 0, arcRate: 20, arcMaxGap: 6 }, t => {
      RA.PV.crouch = true; RA.arcs.forEach(a => A.kinds.add(a.kind || (a.spin ? 'wheel' : a.jump ? 'jump' : a.tilt ? 'tilt' : 'arc')));
      if (RA.ARX.fever) A.fever = true; if (RA.ARX_DECO.visible) A.deco = true;
      for (const o of RA.ARX.orbs) { if (!o.seen) { o.seen = 1; (A.bands = A.bands || {})[o.band] = Math.min((A.bands || {})[o.band] ?? 9, o.pos.y); (A.bandsHi = A.bandsHi || {})[o.band] = Math.max(A.bandsHi[o.band] ?? 0, o.pos.y); } A.orbs = Math.max(A.orbs, RA.ARX.orbs.length); A.osc = Math.max(A.osc || 0, Math.abs(o.grp.position.x - o.pos.x)); o.pos.copy(RA.HL); o.amp = 0; } // (vuelan oscilando; luego la cabeza va a por cada orbe)
      for (const a of RA.arcs) if (a.kind === 'walls' && a.ang) A.tiltWalls = (A.tiltWalls || 0) + (a.counted ? 0 : (a.counted = 1));
      const q = RA.spawnQueue.length; if (lastN >= 0 && q < lastN) { A.gaps.push(+(t - lastT).toFixed(2)); lastT = t; } lastN = q;
    }, 300, s => { A.txt = RA.menu && RA.menu.rows ? RA.menu.rows.map(r => r.text || '').join(' | ') : ''; return ''; });
    const txt = A.txt || '', ghost = JSON.parse(storage.get('reparena3-arcghost') || 'null');
    log(`arcs+: kinds ${[...A.kinds].join(',')} · fever ${A.fever} · moving deco ${A.deco} · orbs collected ${RA.ARX.got} · gaps ${A.gaps.slice(0, 10).join(' ')} · ${Math.round(RA.ARX.dist)} m · ghost saved ${!!ghost} · taken ${RA.stats.taken} · summary medal ${/Medalla/.test(txt)} (${RA.state}: ${txt.slice(0, 160)})`);
    if (!['laser', 'walls', 'wheel'].every(k => A.kinds.has(k))) errors.push('arcos: faltan obstáculos nuevos (láser, paredes o rueda): ' + [...A.kinds]);
    if (RA.stats.taken > 2) errors.push(`arcos: apartándose al lado libre deberían esquivarse los obstáculos nuevos (${RA.stats.taken} golpes)`);
    if (!A.fever || !A.deco || !RA.ARX.got || !ghost || !(RA.ARX.dist > 10) || !/Medalla/.test(txt)) errors.push('arcos: falta la fiebre, el avance, los orbes, el fantasma, los metros o la medalla');
    if (new Set(A.gaps.map(g => Math.round(g * 2))).size < 3) errors.push('arcos: las coreografías deberían marcar huecos distintos entre obstáculos');
    log(`arcs+: walls that came tilted ${A.tiltWalls || 0} · orbs swing up to ${((A.osc || 0) * 100).toFixed(0)} cm off their path`);
    if (A.bands) { log(`arcs+: orb heights ${Object.keys(A.bands).map(b => `${b} ${A.bands[b].toFixed(2)}–${A.bandsHi[b].toFixed(2)}`).join(' · ')}`); if (!(A.bands.low < 0.96) || !(A.bandsHi.high > 1.7)) errors.push('arcos: deberían llegar orbes muy bajos (agacharse) y por encima de la cabeza'); }
    if (A.kinds.size && (!A.tiltWalls || !(A.osc > 0.04))) errors.push('arcos: deberían llegar paredes inclinadas y los orbes, oscilando'); } // (si la partida se jugó: con ONLY, no)
  // la maza: agachándose pasa por encima; de pie y con la bola en el centro, golpea. El arco de plancha: en plancha se pasa;
  // de pie, no. La fiebre: cada una de la ronda, algo más deprisa
  { const mace = { kinds: 0 };
    await runConfig('Arcos con maza (agachándose)', { ...base, mode: 'arcs', exercise: 'squat', arcPatterns: 0, arcMace: 100, arcJump: 0, arcDouble: 0, waves: 1, repsWave: 4, lives: 0 }, t => { RA.PV.crouch = true; if (RA.arcs.some(a => a.kind === 'mace')) mace.kinds++; }, 200, s => s.taken ? `${s.taken} golpes de la maza agachándose` : s.reps < 4 ? 'no cuentan las mazas esquivadas' : '');
    await runConfig('Arcos con maza en círculo (agachándose)', { ...base, mode: 'arcs', exercise: 'squat', arcPatterns: 0, arcMace: 100, arcMaceRound: 100, arcJump: 0, arcDouble: 0, waves: 1, repsWave: 4, lives: 0 }, t => { RA.PV.crouch = true; for (const a of RA.arcs) if (a.kind === 'mace' && a.round) mace.round = (mace.round || 0) + 1; }, 200, s => s.taken ? `${s.taken} golpes de la maza que gira agachándose` : s.reps < 4 ? 'no cuentan las mazas que giran esquivadas' : '');
    await runConfig('Arcos con maza (de pie, la bola en el centro)', { ...base, mode: 'arcs', exercise: 'squat', arcPatterns: 0, arcMace: 100, arcMaceRound: 50, arcJump: 0, arcDouble: 0, waves: 1, repsWave: 4, lives: 0 }, t => { RA.PV.crouch = false; for (const a of RA.arcs) if (a.kind === 'mace') a.ph = -a.w * a.t; }, 200, s => s.taken < 4 ? `de pie con la bola en el centro deberían golpear las 4 (${s.taken})` : '');
    const pk = { v: 0, big: false, pass: false, orbIn: false, orbAfter: false };
    await runConfig('Arcos de plancha (al suelo)', { ...base, mode: 'arcs', exercise: 'squat', arcPatterns: 0, arcPlank: 100, arcPlankSpeed: 3.5, arcSpeed: 7, arcJump: 0, arcDouble: 0, waves: 1, repsWave: 3, lives: 0 }, t => { RA.PV.crouch = true;
      if (RA.BIGN.t >= 0) pk.big = true;
      for (const a of RA.arcs) if (a.plank) { pk.v = a.speed; if (RA.arcs.some(b => b !== a && !b.plank && b.t < a.t && b.z > a.z)) pk.pass = true; } // (¿alguno que salió después lo adelanta?)
      // con el panel entre oleadas delante no sale ningún orbe; al irse, sí
      if (t > 3 && !pk.armed) { pk.armed = true; pk.n0 = RA.ARX.orbs.length; RA.WIN.t = 0.01; RA.ARX.orbT = 0.05; }
      if (pk.armed && RA.WIN.t >= 0 && RA.ARX.orbs.length > pk.n0) pk.orbIn = true;
      if (pk.armed && RA.WIN.t < 0 && RA.ARX.orbs.length > pk.n0) pk.orbAfter = true; }, 200, s => s.taken ? `${s.taken} golpes en plancha` : s.reps < 3 ? 'no cuentan los arcos de plancha' : '');
    await runConfig('Arcos de plancha de pie', { ...base, mode: 'arcs', exercise: 'squat', arcPatterns: 0, arcPlank: 100, arcJump: 0, arcDouble: 0, waves: 1, repsWave: 3, lives: 0 }, t => { RA.PV.crouch = false; }, 200, s => s.taken < 3 ? `de pie deberían golpear los arcos de plancha (${s.taken})` : '');
    const F = RA.ARX, keep = [F.fever, F.feverN]; F.fever = true; const m = [1, 2, 3, 6].map(n => (F.feverN = n, RA.arxMul())); [F.fever, F.feverN] = keep;
    log(`arcs: plank arc at ${(pk.v * 3.6).toFixed(1)} km/h (others 7) · big notice ${pk.big} · overtaken ${pk.pass} · orb during the wave panel ${pk.orbIn}, after it ${pk.orbAfter}`);
    if (pk.armed && (!(pk.v * 3.6 < 4) || !pk.big || pk.pass)) errors.push('arcos: el arco de plancha debería llegar más despacio, con un aviso grande, y sin que lo adelante ningún otro');
    if (pk.armed && (pk.orbIn || !pk.orbAfter)) errors.push('entre oleadas: con el panel delante no debería salir ningún orbe (y al irse, sí)');
    log(`arcs: mace seen ${mace.kinds > 0} (round ${!!mace.round}) · fever speed by fever number ${m.map(v => '×' + v.toFixed(2)).join(' ')}`);
    if (mace.kinds && !mace.round) errors.push('arcos: con «Mazas en círculo» al 100 % deberían girar en círculo');
    if (!(m[0] < m[1] && m[1] < m[2] && m[3] <= 2 + 1e-9)) errors.push('arcos: cada fiebre de la ronda debería ir algo más deprisa que la anterior (con tope)'); }
  await runConfig('Arcos sin agacharse (golpes)', { ...base, mode: 'arcs', exercise: 'squat', lives: 3, waves: 1 }, t => { RA.PV.crouch = false; }, 120);
  // ---- Pistolas: las sentadillas cargan munición y el gatillo (T) dispara donde miras ----
  const aimShoot = every => t => { RA.PV.crouch = (t % 2.6) < 1.4; const e = RA.enemies.find(x => x.alive); if (e && (t % every) < 0.04 && RA.GUN.ammo) { const c = e.center(new THREE.Vector3()); RA.camera.lookAt(c); RA.PV.keys.KeyT = true; } else RA.PV.keys.KeyT = false; };
  await runConfig('Asalto+pistolas (apunta y dispara)', { ...base, mode: 'walkers', exercise: 'squat', pistol: 1, walkTime: 14 }, aimShoot(0.7), 420, s => s.kills < 4 ? 'las pistolas no matan robots' : s.shots < s.kills ? 'no cuenta los disparos' : '');
  await runConfig('Enjambre+pistolas (apunta y dispara)', { ...base, mode: 'flyers', exercise: 'squat', pistol: 1, flySpeed: 8 }, aimShoot(0.4), 420, s => s.kills < 6 ? 'las pistolas no derriban voladores' : '');
  let maxAmmo = 0;
  await runConfig('Asalto+pistolas sin disparar', { ...base, mode: 'walkers', exercise: 'squat', pistol: 1, waves: 1, walkTime: 30 }, t => { RA.PV.crouch = (t % 2.6) < 1.4; RA.PV.keys.KeyT = false; maxAmmo = Math.max(maxAmmo, RA.GUN.ammo); }, 25, s => s.kills ? 'sin apretar el gatillo no debería disparar' : maxAmmo !== 2 ? `la munición debería llegar a una por pistola (2) y no pasar (${maxAmmo})` : '', true);
  RA.PV.keys.KeyT = false; RA.camera.rotation.set(0, 0, 0); RA.setSetting('pistol', 0);
  // ---- Pasar los datos a otro dispositivo por código (con un servicio de mensajes de mentira: como ntfy.sh) ----
  { const topics = new Map(), realFetch = globalThis.fetch; let posts = 0;
    globalThis.fetch = async (url, o = {}) => {
      const m = String(url).match(/^https:\/\/ntfy\.sh\/([\w-]+)(\/json.*)?$/); if (!m) return realFetch ? realFetch(url, o) : { ok: false, status: 404 };
      const L = topics.get(m[1]) || []; topics.set(m[1], L);
      if (o.method === 'POST') { if (String(o.body).length > 4096) return { ok: false, status: 413 }; posts++; L.push({ event: 'message', message: String(o.body) }); return { ok: true, status: 200, text: async () => '' }; }
      return { ok: true, status: 200, text: async () => [{ event: 'open' }, ...L].map(x => JSON.stringify(x)).join('\n') };
    };
    const ses0 = JSON.stringify(storage.get('reparena3-session') || null), prof = [{ name: 'Mañana suave', s: { mode: 'combat', exercise: 'squat', walkTime: 21 } }];
    storage.set('reparena3-profiles', JSON.stringify(prof)); storage.set('reparena3-session', JSON.stringify({ blocks: [{ mode: 'combat', ex: 'squat', n: 30 }, { mode: 'touch', ex: 'slam', n: 20 }], rest: 45 }));
    storage.set('reparena3-history', JSON.stringify(Array.from({ length: 300 }, (_, i) => ({ ex: 'squat', mode: 'combat', reps: 10 + i % 7, perfect: 3, kills: 2, win: true, time: 120, work: 100, kcal: 9.5, date: 1.7e12 + i * 6e5 })))); // (que no quepa en un mensaje)
    storage.set('reparena3-spotify', JSON.stringify({ clientId: 'abc', refresh: 'SECRETO', access: 'SECRETO', lists: [{ id: 'l1', name: 'Correr', uri: 'spotify:playlist:l1' }] }));
    storage.set('reparena3-roomset', JSON.stringify({ gates: [1, 2] }));
    let code = null, got = null, bad = '', wrong = '';
    try { code = await RA.xferSend(); got = await RA.xferFetch(code); } catch (e) { bad = e.message; }
    try { await RA.xferFetch(String((+code + 1) % 1e8).padStart(8, '0')); wrong = 'aceptó un código equivocado'; } catch (e) { wrong = e.message; }
    const chunks = posts, raw = [...topics.values()].flat().map(x => x.message).join('');
    // el otro dispositivo: otros perfiles y bloques, una partida suya en el historial y su propio inicio de sesión de Spotify
    storage.set('reparena3-profiles', '[]'); storage.set('reparena3-session', JSON.stringify({ blocks: [], rest: 60 })); storage.set('reparena3-history', JSON.stringify([{ ex: 'pushup', mode: 'combat', reps: 5, date: 1.9e12 }]));
    storage.set('reparena3-spotify', JSON.stringify({ clientId: 'abc', refresh: 'MIO' })); storage.set('reparena3-roomset', JSON.stringify({ gates: [9] }));
    if (got) RA.xferApply(got, false);
    const P = JSON.parse(storage.get('reparena3-profiles') || '[]'), S = JSON.parse(storage.get('reparena3-session') || '{}'), H = JSON.parse(storage.get('reparena3-history') || '[]'), SP2 = JSON.parse(storage.get('reparena3-spotify') || '{}'), RM = JSON.parse(storage.get('reparena3-roomset') || '{}');
    log(`transfer by code: code ${code} · ${chunks} messages · readable in transit ${/Mañana|Correr|SECRETO/.test(raw)} · wrong code → «${wrong}» · received profiles ${P.length} blocks ${(S.blocks || []).length} history ${H.length} · spotify login kept ${SP2.refresh} lists ${(SP2.lists || []).length} · tokens sent ${/SECRETO/.test(JSON.stringify(got || {}))} · room kept ${JSON.stringify(RM.gates)}${bad ? ' · error ' + bad : ''}`);
    if (bad || !/^\d{8}$/.test(code || '') || chunks < 2) errors.push(`envío por código: no funciona (${bad || 'código ' + code + ', ' + chunks + ' mensajes'})`);
    if (/Mañana|Correr|SECRETO/.test(raw)) errors.push('envío por código: los datos deberían ir cifrados');
    if (!/descifrar|nada/.test(wrong)) errors.push('envío por código: con otro código no debería poder leerse (' + wrong + ')');
    if (P.length !== 1 || (S.blocks || []).length !== 2 || H.length !== 301 || SP2.refresh !== 'MIO' || (SP2.lists || []).length !== 1 || /SECRETO/.test(JSON.stringify(got || {})) || JSON.stringify(RM.gates) !== '[9]') errors.push('envío por código: al recibir deberían llegar perfiles, bloques, historial (juntado) y listas, sin tokens ni la habitación');
    // y en el juego: el menú con Enviar y Recibir
    RA.xferMenu(() => {}); const lab = RA.activeWidgets().map(w => w.label).join('|'); log(`   transfer menu: ${lab}`);
    if (!/Enviar desde aquí/.test(lab) || !/Recibir/.test(lab)) errors.push('envío por código: falta el menú en el juego');
    { RA.activeWidgets().find(w => /^Recibir/.test(w.label)).onPress(); for (const d of code) RA.keypadKey(d); RA.keypadOK(); for (let i = 0; i < 40 && !RA.activeWidgets().some(w => /^Cargar/.test(w.label)); i++) await sleep(50);
      const l2 = RA.activeWidgets().map(w => w.label).join('|'); log(`   typed the code on the keypad → ${l2}`); if (!/Cargar y reiniciar/.test(l2)) errors.push('envío por código: al escribir el código en el teclado del juego debería ofrecer cargar lo recibido');
      RA.activeWidgets().find(w => w.label === 'Cancelar').onPress(); }
    globalThis.fetch = realFetch; storage.set('reparena3-session', ses0); storage.delete('reparena3-profiles'); storage.delete('reparena3-roomset'); storage.delete('reparena3-spotify'); storage.delete('reparena3-history'); }
  // ---- Spotify: elegir lista y canción en el juego, y la música de cada bloque (varias canciones, en orden y en bucle) ----
  { const realFetch = globalThis.fetch, calls = [], cfg0 = RA.SP.cfg, st0 = RA.SP.st; let oldCalls = 0;
    // (como la API desde 2026: las canciones, en /items y cada una en «item»; /tracks responde 403; la lista 10 es de otro usuario)
    const lists = Array.from({ length: 11 }, (_, i) => ({ id: 'L' + i, name: 'Lista ' + i, uri: 'spotify:playlist:L' + i, items: { total: 5 }, owner: { id: i === 10 ? 'otro' : 'yo' }, collaborative: false }));
    const tracks = id => ({ items: Array.from({ length: 12 }, (_, k) => ({ item: { uri: `spotify:track:${id}-${k}`, name: `Canción ${k}`, artists: [{ name: 'Grupo' }] } })), next: null });
    globalThis.fetch = async (url, o = {}) => {
      const u = String(url); if (!u.startsWith('https://api.spotify.com/v1')) return realFetch(url, o);
      const path = u.slice('https://api.spotify.com/v1'.length); calls.push({ m: o.method, path, body: o.body ? JSON.parse(o.body) : null });
      const res = j => ({ ok: true, status: j ? 200 : 204, text: async () => j ? JSON.stringify(j) : '' }), forbidden = { ok: false, status: 403, text: async () => JSON.stringify({ error: { status: 403, message: 'Forbidden' } }) };
      if (path === '/me') return res({ id: 'yo' });
      if (path.startsWith('/me/tracks')) return res({ items: Array.from({ length: 4 }, (_, k) => ({ track: { uri: `spotify:track:fav-${k}`, name: `Favorita ${k}`, artists: [{ name: 'Yo' }] } })), next: null });
      if (path.startsWith('/me/playlists')) return res({ items: lists, next: null });
      if (/^\/playlists\/\w+\/tracks/.test(path)) { oldCalls++; return forbidden; }
      const mt = path.match(/^\/playlists\/(\w+)\/items/); if (mt) return mt[1] === 'L10' ? forbidden : res(tracks(mt[1]));
      if (path.startsWith('/me/player') && o.method === 'GET') return res({ is_playing: true, device: { id: 'D1', name: 'PC' }, item: { name: 'Canción 3', artists: [{ name: 'Grupo' }] } });
      return res(null);
    };
    RA.SP.cfg = { clientId: 'x', refresh: 'r', access: 'a', exp: Date.now() + 3.6e6 }; RA.SP.st = { is_playing: true, device: { id: 'D1', name: 'PC' } }; RA.SP.mine = null; RA.SP.trk = {}; RA.SP.busy = false; RA.SP.block = null;
    const waitFor = async (f, n = 60) => { for (let i = 0; i < n && !f(); i++) await sleep(25); return f(); };
    const labels = () => RA.activeWidgets().map(w => w.label);
    // en el juego: tus listas de 8 en 8 → una lista → sus canciones → desde la 4.ª
    RA.spListMenu(() => {}); await waitFor(() => labels().includes('Lista 0'));
    const page1 = labels().filter(l => /^Lista|te gustan/.test(l)).length, liked1 = labels().some(l => /te gustan/.test(l)); RA.activeWidgets().find(w => w.label === '▶').onPress(); const page2 = labels().filter(l => /^Lista/.test(l)).length, l10 = labels().includes('Lista 10');
    RA.activeWidgets().find(w => w.label === 'Lista 9').onPress(); await waitFor(() => labels().some(l => /^Canción 3/.test(l)));
    RA.activeWidgets().find(w => /^Canción 3/.test(w.label)).onPress(); await waitFor(() => calls.some(c => c.m === 'PUT' && c.path.startsWith('/me/player/play')));
    const fromSong = calls.find(c => c.m === 'PUT' && c.path.startsWith('/me/player/play'));
    // la música de un bloque: dos canciones de una lista y una de otra, en ese orden y en bucle; el bloque siguiente con las mismas no las reinicia
    await sleep(600); calls.length = 0; RA.SP.busy = false;
    const mus = RA.blockMusic({ music: [{ uri: 'spotify:track:L1-2', name: 'A', by: 'x' }, { uri: 'spotify:track:L1-5', name: 'B', by: 'x' }, { uri: 'spotify:track:L7-0', name: 'C', by: 'y' }, { uri: 'nope' }] }).music;
    RA.SES.blocks = [{ mode: 'combat', ex: 'squat', n: 10, foes: 'robots', music: mus }, { mode: 'combat', ex: 'squat', n: 10, foes: 'robots', music: mus }];
    RA.applyBlock(0); await waitFor(() => calls.some(c => c.path.startsWith('/me/player/repeat')));
    const play = calls.find(c => c.m === 'PUT' && c.path.startsWith('/me/player/play')), rep = calls.find(c => c.path.startsWith('/me/player/repeat')), shuf = calls.find(c => c.path.startsWith('/me/player/shuffle'));
    await sleep(600); const n0 = calls.filter(c => c.path.startsWith('/me/player/play')).length; RA.applyBlock(1); await sleep(200); const n1 = calls.filter(c => c.path.startsWith('/me/player/play')).length;
    // y en la página, el selector del bloque
    RA.SES.mList = 'L1'; await RA.spListTracks('L1'); const html = RA.sesMusicHTML(RA.SES.blocks[0], 0); // (dentro de la lista 1)
    // la lista de otro usuario: no se pueden ver sus canciones (Spotify, 2026), se marca y se explica; entera sí se pone
    let other = ''; try { await RA.spListTracks('L10'); other = 'leída'; } catch (e) { other = e.message; }
    const L10 = RA.SP.mine.find(l => l.id === 'L10'), mineFlags = RA.SP.mine.filter(l => l.mine).length; RA.SES.mList = ''; const htmlL = RA.sesMusicHTML(RA.SES.blocks[0], 0);
    RA.SES.mList = 'liked'; await RA.spListTracks('liked'); const htmlF = RA.sesMusicHTML(RA.SES.blocks[0], 0);
    log(`   2026 API: old /tracks calls ${oldCalls} · other user's list → ${other} (mine ${L10 && L10.mine}) · own lists ${mineFlags} of 11 · block picker lists ${(htmlL.match(/data-a="mlist"/g) || []).length} (other user's shown ${/Lista 10/.test(htmlL)}, liked ${/te gustan/.test(htmlL)}) · inside liked: ${(htmlF.match(/data-m="trk"/g) || []).length} songs, back ${/mback/.test(htmlF)}, lists hidden ${!/data-a="mlist"/.test(htmlF)}`);
    if (oldCalls || other !== 'NOT_YOURS' || !L10 || L10.mine !== false || mineFlags !== 10) errors.push('Spotify: las canciones deberían pedirse en /items y las listas de otros usuarios quedar marcadas');
    if (/Lista 10/.test(htmlL) || !/te gustan/.test(htmlL) || (htmlL.match(/data-a="mlist"/g) || []).length !== 11) errors.push('Spotify: el selector del bloque debería enseñar tus canciones que te gustan y tus listas, sin las de otros usuarios');
    if ((htmlF.match(/data-m="trk"/g) || []).length !== 4 || !/mback/.test(htmlF) || /data-a="mlist"/.test(htmlF)) errors.push('Spotify: dentro de una lista deberían verse solo sus canciones (y volver a tus listas)');
    { // favoritas (★): al abrir una lista salen las primeras, en el bloque y en el juego (con ★); y van en el envío por código
      const T = RA.SP.trk.L1, last = T[T.length - 1]; RA.spFavToggle(last.uri); RA.SES.mList = 'L1';
      const hb = RA.sesMusicHTML(RA.SES.blocks[0], 0), firstB = (/data-uri="([^"]+)"/.exec(hb) || [])[1], starOn = /class="spfav on"/.test(hb);
      RA.spTrackMenu({ id: 'L1', name: 'Lista 1', uri: 'spotify:playlist:L1' }, () => {}); const gl = RA.activeWidgets().map(w => w.label).find(l => /Canción|L1-/.test(l) || /^★/.test(l)) || '';
      const inPack = /favs/.test(JSON.stringify(RA.xferPack())); RA.spFavToggle(last.uri); const off = !(RA.SP.cfg.favs || []).length; RA.SES.mList = '';
      log(`   favourites: first in the block picker ${firstB === last.uri} (star on ${starOn}) · first in game “${gl}” · in the code transfer ${inPack} · toggled off ${off}`);
      if (firstB !== last.uri || !starOn || !/^★/.test(gl) || !inPack || !off) errors.push('Spotify: las canciones favoritas deberían salir las primeras al abrir una lista (bloque y juego, con ★) y pasar por el código'); }
    { // compás propio de cada canción: cuando suena manda sobre el ritmo; al pasar a otra sin compás, vuelve el de antes;
      // se guarda desde el juego, se ve en la página y en el juego y viaja con el código
      const T = RA.SP.trk.L1, u = T[0].uri, st0 = RA.SP.st, b0 = RA.settings.bpm, a0 = RA.SP.cfg.autoBpm; RA.SP.cfg.autoBpm = false; RA.setSetting('bpm', 90);
      RA.SP.st = { is_playing: true, progress_ms: 3000, item: { id: 'L1-0', uri: u, name: T[0].name } }; RA.SP.tempoId = null; RA.spAutoTempo();
      const saveL = RA.tempoRows(() => {}).flatMap(r => r.items || []).map(i => i.label).find(l => /^Guardar 90 BPM/.test(l));
      RA.spSongBpmSet(u, 128); const onSong = RA.settings.bpm, quit = RA.tempoRows(() => {}).flatMap(r => r.items || []).some(i => i.label === 'Quitar el ritmo de esta canción');
      RA.SP.st = { is_playing: true, progress_ms: 0, item: { id: 'L1-1', uri: T[1].uri, name: T[1].name } }; RA.spAutoTempo(); const after = RA.settings.bpm;
      RA.spFavToggle(u); RA.SES.mList = 'L1'; const hb = RA.sesMusicHTML(RA.SES.blocks[0], 0), inPage = new RegExp(`data-bpm="${u}"[^>]*value="128"`).test(hb);
      RA.spTrackMenu({ id: 'L1', name: 'Lista 1', uri: 'spotify:playlist:L1' }, () => {}); const gl = RA.activeWidgets().map(w => w.label).find(l => /128 BPM/.test(l)) || '';
      const inPack = /"bpms":\{[^}]*128/.test(JSON.stringify(RA.xferPack()));
      RA.spFavToggle(u); RA.spSongBpmSet(u, 0); RA.SES.mList = ''; RA.SP.st = st0; RA.SP.cfg.autoBpm = a0; RA.setSetting('bpm', b0);
      log(`   song tempo: save button “${saveL}” · playing it → ${onSong} BPM (quit button ${quit}) · next song without one → ${after} · in the block picker ${inPage} · in game “${gl}” · in the code transfer ${inPack}`);
      if (!saveL || onSong !== 128 || !quit || after !== 90 || !inPage || !/128 BPM/.test(gl) || !inPack) errors.push('Spotify: el compás guardado de una canción debería ponerse al sonar (y quitarse con la siguiente), verse en la página y en el juego y pasar por el código'); }
    { // compás encontrado solo: al abrir una lista se busca en Deezer (por ISRC) y, lo que no sepa, en ReccoBeats (de 40 en
      // 40, con el ID de Spotify); sale en gris (≈), se corrige con ×2 / ÷2 y, con el ritmo de cada canción, suena a ese ritmo
      const dz0 = RA.BPM_SRC.dz, rb0 = RA.BPM_SRC.rb, f0 = globalThis.fetch, asked = { dz: [], rb: [] }, auto0 = RA.SP.cfg.bpmAuto, a0 = RA.SP.cfg.autoBpm, st0 = RA.SP.st, b0 = RA.settings.bpm;
      RA.BPMQ.list.length = 0; await waitFor(() => !RA.BPMQ.busy, 80); RA.SP.cfg.bpmAuto = {}; RA.BPMQ.seen.clear(); RA.RB.off = false; RA.RB.wait = 0; // (lo que buscaban las pruebas de antes, fuera)
      const T = [0, 1, 2, 3].map(k => ({ uri: 'spotify:track:Z' + k, name: 'Tema ' + k, by: 'Grupo', isrc: 'ISRC' + k }));
      RA.BPM_SRC.dz = async t => { asked.dz.push(t.isrc); return t.isrc === 'ISRC0' ? 124.4 : t.isrc === 'ISRC1' ? 61 : 0; };
      globalThis.fetch = async (u, o) => { if (!/reccobeats/.test(u)) return f0(u, o); asked.rb.push(u); const ids = /ids=([^&]+)/.exec(u)[1].split(',');
        return { ok: true, status: 200, json: async () => ({ content: ids.filter(id => id !== 'Z3').map(id => ({ href: 'https://open.spotify.com/track/' + id, tempo: 132.2 })) }) }; };
      RA.BPM_SRC.rb = rb0; RA.spBpmPrefetch(T); await waitFor(() => !RA.BPMQ.busy && RA.SP.cfg.bpmAuto['spotify:track:Z3'], 240);
      const got = T.map(t => RA.spTrackBpm(t.uri)), cell = RA.spBpmCell(T[0]), none = RA.spBpmCell(T[3]);
      RA.spBpmScale(T[1].uri, 2); const doubled = RA.spTrackBpm(T[1].uri);
      // al sonar, con el ritmo de cada canción
      RA.SP.cfg.autoBpm = true; RA.setSetting('bpm', 90); RA.SP.st = { is_playing: true, progress_ms: 0, item: { id: 'Z2', uri: T[2].uri, name: 'Tema 2' } }; RA.SP.tempoId = null; RA.spAutoTempo(); const playing = RA.settings.bpm;
      RA.SP.cfg.autoBpm = false; RA.SP.st = { is_playing: true, progress_ms: 0, item: { id: 'Z0', uri: T[0].uri, name: 'Tema 0' } }; RA.SP.tempoId = null; RA.spAutoTempo(); const off = RA.settings.bpm;
      log(`   tempo found by itself: ${got.map(g => g.b + '/' + g.src).join(' ')} · Deezer asked ${asked.dz.length}, ReccoBeats ${asked.rb.length} call(s) for ${(/ids=([^&]+)/.exec(asked.rb[0] || '') || [, ''])[1]} · cell “${/placeholder="([^"]+)"/.exec(cell)[1]}” with ×2 ${/data-bpmx="2"/.test(cell)} · not found “${/placeholder="([^"]+)"/.exec(none)[1]}” · ×2 on 61 → ${doubled.b}/${doubled.src} · playing Tema 2 → ${playing} BPM · next one without «ritmo de cada canción» → ${off} (back to the one before)`);
      if (got[0].b !== 124 || got[0].src !== 'dz' || got[2].b !== 132 || got[2].src !== 'rb' || got[3].b !== 0 || asked.rb.length !== 1) errors.push('Spotify: el compás debería buscarse solo (Deezer y, si no, ReccoBeats de una vez) y guardarse');
      if (!/placeholder="≈124"/.test(cell) || /data-bpmx/.test(none) || !/placeholder="—"/.test(none) || doubled.b !== 122 || doubled.src !== 'own') errors.push('Spotify: el compás encontrado debería verse en gris (≈), «—» si no se encuentra, y ×2 debería corregirlo');
      if (playing !== 132 || off !== 90) errors.push(`Spotify: con «Ritmo de cada canción» debería sonar al compás encontrado (y sin él, volver al de antes) (${playing}, ${off})`);
      // ReccoBeats sin respuesta (el navegador no deja): se deja para esta sesión y no rompe nada
      RA.RB.off = false; globalThis.fetch = async u => { if (/reccobeats/.test(u)) throw new TypeError('Failed to fetch'); return f0(u); };
      const r2 = await RA.rbBpms(['spotify:track:Q1']); const offNow = RA.RB.off; RA.RB.off = false;
      log(`   ReccoBeats unreachable → ${JSON.stringify(r2)} · switched off for the session ${offNow}`); if (JSON.stringify(r2) !== '{}' || !offNow) errors.push('Spotify: si ReccoBeats no responde, debería dejarse sin romper nada');
      RA.BPM_SRC.dz = dz0; RA.BPM_SRC.rb = rb0; globalThis.fetch = f0; RA.SP.cfg.bpmAuto = auto0; RA.SP.cfg.autoBpm = a0; RA.SP.st = st0; RA.setSetting('bpm', b0); RA.spSongBpmSet(T[1].uri, 0); }
    log(`spotify: lists in game ${page1}+${page2} (of 11) · from a song → ${JSON.stringify(fromSong && fromSong.body)} · block music ${(mus || []).length} songs → play ${JSON.stringify(play && play.body)} · repeat ${rep && rep.path} · shuffle ${shuf && shuf.path} · next block with the same songs restarts them ${n1 > n0} · page picker: chips ${(html.match(/class="chip"/g) || []).length}, tracks ${(html.match(/data-m="trk"/g) || []).length}, checked ${(html.match(/ checked/g) || []).length}`);
    if (page1 !== 8 || page2 !== 3 || !liked1 || l10) errors.push(`Spotify: en el juego deberían salir tus canciones que te gustan y tus listas (no las de otros usuarios), de 8 en 8 (${page1}+${page2}, me gusta ${liked1}, ajena ${l10})`);
    if (!fromSong || !fromSong.body || fromSong.body.context_uri !== 'spotify:playlist:L9' || !fromSong.body.offset || fromSong.body.offset.uri !== 'spotify:track:L9-3') errors.push('Spotify: tocar una canción debería poner su lista empezando por ella');
    if (!mus || mus.length !== 3 || !play || JSON.stringify(play.body.uris) !== JSON.stringify(['spotify:track:L1-2', 'spotify:track:L1-5', 'spotify:track:L7-0']) || !/state=context/.test(rep && rep.path) || !/state=false/.test(shuf && shuf.path)) errors.push('Spotify: la música del bloque debería sonar en su orden y en bucle');
    if (n1 > n0) errors.push('Spotify: si el bloque siguiente tiene las mismas canciones, no deberían empezar de nuevo');
    if ((html.match(/class="chip"/g) || []).length !== 3 || (html.match(/data-m="trk"/g) || []).length !== 12 || (html.match(/ checked/g) || []).length !== 2) errors.push('Spotify: en la página, el bloque debería enseñar sus canciones y las de la lista elegida, marcadas las suyas');
    { await sleep(600); calls.length = 0; RA.SP.busy = false; RA.SP.started = false; RA.SP.st = { is_playing: false, device: { id: 'D1', name: 'PC' } }; RA.SP.cfg.picks = [{ uri: 'spotify:track:L3-1', name: 'X' }, { uri: 'spotify:track:L5-4', name: 'Y' }];
      RA.spToggle(); await waitFor(() => calls.some(c => c.path.startsWith('/me/player/play'))); const pp = calls.find(c => c.path.startsWith('/me/player/play'));
      log(`   picked songs → Play plays ${JSON.stringify(pp && pp.body)}`); if (!pp || JSON.stringify(pp.body && pp.body.uris) !== JSON.stringify(['spotify:track:L3-1', 'spotify:track:L5-4'])) errors.push('Spotify: con canciones elegidas, Play debería poner esas, en su orden'); }
    { // el ritmo: «Al compás» siempre se ve, también con el ritmo de Spotify puesto (y entonces, además, «Encajar el pulso»)
      const b0 = RA.settings.bpm, a0 = RA.SP.cfg.autoBpm; RA.SP.cfg.autoBpm = true; RA.setSetting('bpm', 120);
      const L = RA.tempoRows(() => {}).flatMap(r => r.items || []).map(i => i.label); RA.SP.cfg.autoBpm = a0; RA.setSetting('bpm', b0);
      log(`   rhythm with Spotify's tempo on: ${L.join(' · ')}`); if (!L.includes('Al compás') || !L.includes('Encajar el pulso')) errors.push('ritmo: con el de Spotify puesto debería seguir viéndose «Al compás»'); }
    await sleep(700); globalThis.fetch = realFetch; RA.SP.cfg = cfg0; RA.SP.st = st0; RA.SP.mine = null; RA.SES.blocks = []; RA.SES.mList = ''; }
  // ---- Bloques con perfil y ajustes propios (⚙); sesiones guardadas con nombre (y por el código) ----
  { const w0 = RA.settings.walkTime, l0 = RA.settings.lives, prof0 = storage.get('reparena3-profiles'), ses0 = storage.get('reparena3-session'), sv0 = storage.get('reparena3-sessions');
    storage.set('reparena3-profiles', JSON.stringify([{ name: 'Piernas a tope', s: { mode: 'touch', exercise: 'slam', walkTime: (w0 === 9 ? 10 : 9), lives: 5, sndVol: 3 } }]));
    RA.SES.blocks = [{ mode: 'combat', ex: 'squat', n: 30, foes: 'robots', prof: 'Piernas a tope' }, { mode: 'combat', ex: 'fraise', n: 20, foes: 'flyers', set: { lives: 3 } }];
    const wp = w0 === 9 ? 10 : 9; RA.SES.orig = {}; ['mode', 'exercise', 'waves', 'repsWave', 'repsInc', 'hangTime', 'hangInc', 'foesGate', 'foesHatch', 'foesFly', 'aim'].forEach(k => { RA.SES.orig[k] = RA.settings[k]; }); RA.SES.active = true;
    RA.applyBlock(0); const b0 = [RA.settings.exercise, RA.settings.walkTime, RA.settings.lives];
    RA.applyBlock(1); const b1 = [RA.settings.exercise, RA.settings.walkTime, RA.settings.lives];
    const saved = JSON.parse(storage.get('reparena3-settings') || '{}'); RA.setSetting('sndVol', RA.settings.sndVol); const saved2 = JSON.parse(storage.get('reparena3-settings') || '{}');
    RA.endSession(); const after = [RA.settings.walkTime, RA.settings.lives];
    const F = RA.blockFields(RA.SES.blocks[1]).map(f => f.key), html = RA.sesSetHTML(RA.SES.blocks[1], 1);
    // duplicar: la copia, debajo y con todo (también sus canciones); editarla no cambia la original
    RA.SES.blocks[1].music = [{ uri: 'spotify:track:x', name: 'X', by: 'y' }]; const dupOk = RA.sesDup(1), copy = RA.SES.blocks[2];
    if (copy) { copy.n = 99; copy.set.lives = 7; copy.music.push({ uri: 'spotify:track:z', name: 'Z', by: 'y' }); }
    const dupRes = copy && RA.SES.blocks[1].n === 20 && RA.SES.blocks[1].set.lives === 3 && RA.SES.blocks[1].music.length === 1 && copy.music.length === 2 && copy.ex === 'fraise';
    log(`   duplicate block: ${dupOk} · copy below with everything, independent ${dupRes}`); if (!dupOk || !dupRes) errors.push('bloques: duplicar debería copiar el bloque entero debajo (con canciones) y la copia editarse aparte');
    RA.SES.blocks.splice(2, 1);
    { // mover un bloque (al soltarlo tras arrastrarlo): el último al principio y de vuelta
      const tag = RA.SES.blocks.map((b, k) => (b._t = k, b)); const L = tag.length;
      const m1 = RA.sesMove(L - 1, 0), first = RA.SES.blocks[0]._t === L - 1, m2 = RA.sesMove(0, L - 1), back = RA.SES.blocks.every((b, k) => b._t === k), same = RA.sesMove(1, 1) === false, far = RA.sesMove(0, 99) && RA.SES.blocks[L - 1]._t === 0;
      RA.sesMove(L - 1, 0); RA.SES.blocks.forEach(b => delete b._t);
      log(`   move block (drag and drop): last to first ${m1 && first} · back ${m2 && back} · same place no-op ${same} · past the end ${far}`); if (!(m1 && first && m2 && back && same && far)) errors.push('bloques: arrastrar y soltar debería mover el bloque al sitio elegido');
    }
    // guardar la sesión con su nombre, vaciarla y cargarla de nuevo; y que vaya en el envío por código
    const okSave = RA.sessSave('Mi sesión'); RA.SES.blocks = []; const okLoad = RA.sessLoad(RA.savedSessions().findIndex(x => x.name === 'Mi sesión'));
    const back = JSON.stringify(RA.SES.blocks), inPack = !!(RA.xferPack().d['reparena3-sessions'] || []).find(x => x.name === 'Mi sesión');
    RA.lobbyMenu(); const lob = RA.activeWidgets().find(w => /^Sesiones guardadas/.test(w.label)); if (lob) lob.onPress(); const inGame = RA.activeWidgets().map(w => w.label).filter(l => /Mi sesión/.test(l));
    if (!lob || !inGame.length) errors.push('sesiones guardadas: en el menú del juego debería salir «Sesiones guardadas ▸» con las tuyas'); else log(`   in game: ${lob.label} → ${inGame.join(', ')}`);
    log(`blocks: with profile → ${b0.join(' ')} · with own settings → ${b1.join(' ')} · saved during the session lives ${saved2.lives} walk ${saved2.walkTime} · after the session ${after.join(' ')} (before ${w0} ${l0}) · own settings offered ${F.length} (fraiseRange ${F.includes('fraiseRange')}, rank ${F.includes('rank')}) · marked ${/class="bfield own"/.test(html)} · saved session ${okSave} ${okLoad} → ${back.length} chars · in the code transfer ${inPack}`);
    if (b0[0] !== 'squat' || b0[1] !== wp || b0[2] !== 5) errors.push('bloques: el perfil del bloque debería ponerse mientras se juega (sin cambiar su ejercicio)');
    if (b1[0] !== 'fraise' || b1[1] !== w0 || b1[2] !== 3) errors.push('bloques: el bloque siguiente debería quitar el perfil del anterior y poner sus ajustes propios');
    if (saved2.lives !== l0 || saved2.walkTime !== w0) errors.push('bloques: lo del bloque no debería quedarse guardado en tus ajustes');
    if (after[0] !== w0 || after[1] !== l0) errors.push('bloques: al acabar la sesión, tus ajustes deberían volver a como estaban');
    if (!F.includes('fraiseRange') || F.includes('rank') || F.includes('sndVol') || F.includes('exercise')) errors.push('bloques: el engranaje debería ofrecer los ajustes de su ejercicio (no el rango, el sonido ni el ejercicio)');
    if (!okSave || !okLoad || !/Piernas a tope/.test(back) || !/"lives":3/.test(back) || !inPack) errors.push('sesiones guardadas: deberían guardarse con su nombre (con perfil y ajustes de cada bloque), cargarse y pasar por el código');
    RA.SES.blocks = []; for (const [k, v] of [['reparena3-profiles', prof0], ['reparena3-session', ses0], ['reparena3-sessions', sv0]]) if (v === undefined) storage.delete(k); else storage.set(k, v); }
  // ---- Toques: aros para la cabeza y gemas para las manos (Espacio y G los alcanzan) ----
  const assist = () => { RA.PV.crouch = true; RA.PV.keys.KeyG = true; };
  for (const [name, ex, extra] of [['slam', 'slam', {}], ['saltos', 'jump', {}], ['abdominales', 'abs', {}], ['abdominales laterales', 'abs', { absMoves: 'side' }], ['flexiones (aros)', 'pushup', {}],
    ['combinado de pie', 'combo', { comboBase: 'stand', comboStand: 'squat,jump,punch', comboOrder: 'seq' }], ['combinado plancha', 'combo', { comboBase: 'floor', comboFloor: 'push,plank,tap', plankHold: 3 }], ['combinado boca arriba', 'combo', { comboBase: 'abs', comboAbs: 'crunch,twist,knee', comboOrder: 'seq' }]]) {
    const parts = new Set(); let fromSide = true;
    await runConfig('Toques+' + name, { ...base, mode: 'touch', exercise: ex, lives: 0, waves: 1, repsWave: 6, tchHands: 40, tchArrive: 2, tchGap: 2, ...extra }, watchPanels(t => { assist(); RA.touches.forEach(x => { parts.add(x.part + ':' + x.move); if (x.move === 'side' && Math.abs(x.from.x) < 2) fromSide = false; }); }), 200,
      panelCheck(name, s => s.taken ? `falla ${s.taken} objetivos` : s.reps < 6 ? 'no cuenta los toques' : RA.settings.exercise === 'combo' && parts.size < 3 ? `el combinado no mezcla movimientos (${[...parts]})` : extra.absMoves === 'side' && ([...parts].join() !== 'hand:side' || !fromSide) ? `los abdominales laterales no traen solo diamantes por los lados (${[...parts]})` : ''));
    log('   movimientos:', [...parts].join(' '));
  }
  RA.PV.keys.KeyG = false; RA.PV.crouch = false;
  // Slam: obliga a moverse de verdad (amebas a los lados, muy abajo, delante o arriba; diamantes a ras de suelo) y alterna de lado;
  // agachándose sin más (sin pasos laterales) se escapan las de los lados
  { const P = { side: [], duck: [], low: [], fwd: [], floor: [], jump: 0, sides: [] }, seen = new Set(); let lastSide = 0, alt = 0, same = 0;
    await runConfig('Toques slam (posiciones)', { ...base, mode: 'touch', exercise: 'slam', lives: 0, waves: 1, repsWave: 24, tchHands: 35, tchArrive: 1.5, tchGap: 1.2 }, t => { assist(); RA.touches.forEach(x => { if (seen.has(x)) return; seen.add(x);
      const S = RA.TCH.ref; if (x.move === 'lside') P.side.push(Math.abs(x.pos.x)); if (x.move === 'duck') P.duck.push(S - x.pos.y); if (x.move === 'low') P.low.push(x.pos.y); if (x.move === 'lfwd') P.fwd.push(-x.pos.z); if (x.move === 'jump') P.jump++;
      const sd = x.hand === 'left' ? -1 : 1; if (lastSide) (sd !== lastSide ? alt++ : same++); lastSide = sd; if (x.move === 'floor') P.floor.push(x.pos.y); }); }, 200, s => '');
    const mn = a => a.length ? Math.min(...a) : 0, mx = a => a.length ? Math.max(...a) : 9;
    log(`slam: side amebas ${P.side.length} at ≥ ${mn(P.side).toFixed(2)} m · deep ones ${P.duck.length} ≥ ${mn(P.duck).toFixed(2)} m down · floor diamonds ${P.low.length} ≤ ${mx(P.low).toFixed(2)} m high · forward ${P.fwd.length} · jumps ${P.jump} · side changes ${alt} vs repeats ${same}`);
    log(`slam floor pads: ${P.floor.length} at ${P.floor.map(y => y.toFixed(2)).join(' ')} m · deep amebas at least ${(mn(P.duck) * 100).toFixed(0)} cm below standing (squat ${RA.settings.squatDepth} + ${RA.settings.slamDeep} cm)`);
    if (!P.side.length || mn(P.side) < 0.4 || !P.duck.length || mn(P.duck) < (RA.settings.squatDepth + RA.settings.slamDeep) / 100 - 0.005 || !P.low.length || mx(P.low) > 0.55 || alt < same * 3) errors.push('Slam: los objetivos no obligan a moverse (a los lados, muy abajo, a ras de suelo) o no alternan de lado');
    if (!P.floor.length || mx(P.floor) > 0.05) errors.push('Slam: deberían salir pulsadores en el suelo para golpearlos con la mano');
    RA.PV.keys.KeyG = false; RA.PV.crouch = false; let missSide = 0, hm = null;
    await runConfig('Toques slam solo agachándose', { ...base, mode: 'touch', exercise: 'slam', lives: 0, waves: 1, repsWave: 10, tchHands: 0, tchArrive: 1.5, tchGap: 1.5 }, t => {
      if (RA.PV.home) { hm = RA.PV.home.clone(); RA.PV.home = null; } if (hm) { RA.camera.position.set(hm.x, hm.y - ((t % 2) < 1 ? 0.4 : 0), hm.z); RA.PV.y = RA.camera.position.y; } // la cabeza solo sube y baja
      RA.touches.forEach(x => { if (x.move === 'lside' && x.judged && !x._c) { x._c = 1; if (x.mode === 'pass') missSide++; } }); }, 200, s => '');
    log(`slam just squatting: side amebas missed ${missSide}`);
    if (!missSide) errors.push('Slam: sin paso lateral no deberían poder tocarse las amebas de los lados'); }
  // se pueden tocar mientras viajan: la cabeza va a buscar la ameba (o la mano el diamante) a mitad de camino,
  // y entre un toque y el siguiente vuelve a su postura de partida
  const midway = new Set(); let home = null;
  // la compuerta de delante, abierta mientras llegan los objetivos; cerrada en el descanso; se reabre en la oleada siguiente
  { const seen = { play: 0, playN: 0, rest: 0, restN: 0, reopen: false }; let rests = 0, lastSt = '';
    await runConfig('Toques: compuerta abierta durante la oleada', { ...base, mode: 'touch', exercise: 'slam', lives: 0, waves: 2, repsWave: 4, rest: 4, tchHands: 40, tchArrive: 2, tchGap: 2 }, t => {
      assist(); const open = Math.max(...RA.gates.map(g => g.open));
      if (RA.state !== lastSt) { if (RA.state === 'rest') rests++; lastSt = RA.state; }
      if (RA.state === 'play' && RA.touches.some(x => x.alive && !x.judged && x.mode === 'approach')) { seen.playN++; if (open > 0.8) seen.play++; if (rests) seen.reopen = seen.reopen || open > 0.8; }
      if (RA.state === 'rest' && RA.stateT > 2) { seen.restN++; if (open < 0.1) seen.rest++; }
    });
    RA.PV.keys.KeyG = false; RA.PV.crouch = false;
    log(`touch gate: open while targets come ${seen.play}/${seen.playN} · closed in the rest ${seen.rest}/${seen.restN} · reopened next wave ${seen.reopen}`);
    if (seen.play < seen.playN * 0.7 || seen.rest < seen.restN * 0.9 || !seen.restN || !seen.reopen) errors.push('Toques: la compuerta debería estar abierta mientras llegan los objetivos, cerrada en el descanso y reabrirse en la oleada siguiente'); }
  await runConfig('Toques en pleno viaje', { ...base, mode: 'touch', exercise: 'slam', waves: 1, repsWave: 5, lives: 0, tchArrive: 4, tchGap: 4.5, tchHands: 40 }, () => {
    if (RA.PV.home) { home = RA.PV.home.clone(); RA.PV.home = null; }
    const x = RA.touches.find(o => o.alive && !o.judged && o.mode === 'approach' && RA.TCH.clock > o.spawnT + 1.5);
    const ready = x && (x.part === 'head' ? RA.TCH.headArm.armed : RA.TCH.arm[x.hand].armed);
    if (!x || x.part !== 'head' || !ready) { RA.camera.position.copy(home); RA.PV.y = home.y; }
    if (x && ready) { const w = x.center(new THREE.Vector3()); if (x.part === 'head') { RA.camera.position.set(w.x, w.y, w.z); RA.PV.y = w.y; } else { RA.PV.handAt = w; RA.PV.handSide = x.hand; } if (x.arriveAt - RA.TCH.clock > 1) midway.add(x); }
    else RA.PV.handAt = null;
  }, 120, s => s.reps < 4 ? `tocando a mitad de camino solo cuenta ${s.reps}` : midway.size < 4 ? 'no se tocaron a mitad de camino' : '');
  // la ameba se mueve mucho mientras llega (serpentea y sube y baja) y casi nada esperando delante de ti
  { let far = 0, near = 0;
    await runConfig('Toques ameba que se mueve', { ...base, mode: 'touch', exercise: 'slam', waves: 1, repsWave: 3, lives: 0, tchArrive: 3, tchGap: 3, tchHands: 0 }, () => {
      for (const x of RA.touches) { if (!x.alive || !x.ring) continue; const p = x.root.position, d = Math.hypot(p.x - (x.mode === 'wait' ? x.pos.x : p.x), p.y - (x.mode === 'wait' ? x.pos.y : p.y));
        if (x.mode === 'approach') { const k = (p.z - x.from.z) / (x.pos.z - x.from.z), lx = x.from.x + (x.pos.x - x.from.x) * k; far = Math.max(far, Math.abs(p.x - lx)); }
        else if (x.mode === 'wait') near = Math.max(near, d); }
    }, 60, () => '', true);
    log(`ameba sway: off its path while coming ${(far * 100).toFixed(0)} cm · waiting ${(near * 100).toFixed(1)} cm`);
    if (far < 0.15 || near > 0.04) errors.push('Toques: la ameba no se mueve lo bastante al llegar, o se mueve demasiado esperando'); }
  // sin volver a la postura de partida, solo cuenta el primero: la cabeza se queda abajo y va de ameba en ameba
  await runConfig('Toques sin volver a la postura', { ...base, mode: 'touch', exercise: 'combo', comboBase: 'stand', comboStand: 'squat', waves: 1, repsWave: 4, lives: 0, tchArrive: 2, tchGap: 2.2, tchHands: 0 }, () => {
    if (RA.PV.home) { home = RA.PV.home.clone(); RA.PV.home = null; }
    const x = RA.touches.find(o => o.alive && !o.judged), w = x ? RA.arena.localToWorld(x.pos.clone()) : home.clone().add(new THREE.Vector3(0, -0.2, 0)); // (adonde llega, sin su bamboleo)
    RA.camera.position.set(w.x, Math.min(w.y, home.y - 0.15), w.z); RA.PV.y = RA.camera.position.y;
  }, 60, s => s.reps !== 1 ? `con la cabeza abajo todo el rato cuentan ${s.reps} amebas (debería ser 1)` : s.taken < 3 ? 'las amebas no tocadas no cuentan como fallo' : '');
  // diamantes: solo vale la mano que piden, y entre uno y otro esa mano tiene que volver
  let flip = 1;
  for (const [name, mode, want] of [['con la otra mano', 'wrong', 0], ['sin retirar la mano', 'stay', 1], ['retirando la mano', 'back', 4], ['con un puñetazo rápido que la atraviesa', 'fast', 4]]) {
    await runConfig('Toques diamantes ' + name, { ...base, mode: 'touch', exercise: 'combo', comboBase: 'stand', comboStand: 'punch', waves: 1, repsWave: 4, lives: 0, tchArrive: 2, tchGap: 2.2, tchHands: 100 }, () => {
      if (RA.PV.home) RA.PV.home = null;
      const x = RA.touches.find(o => o.alive && !o.judged); if (!x) { if (mode === 'back') RA.PV.handAt = null; return; }
      const armed = RA.TCH.arm[x.hand].armed, w = x.center(new THREE.Vector3());
      if (mode === 'back' && !armed) { RA.PV.handAt = null; return; }
      if (mode === 'stay' && x.mode !== 'wait') return; // la mano se queda donde tocó hasta que llega el siguiente
      if (mode === 'fast') { if (x.mode !== 'wait') { RA.PV.handAt = null; return; } flip = -flip; w.z += flip * 0.3; } // ningún fotograma cae dentro del diamante
      RA.PV.handAt = w; RA.PV.handSide = mode === 'wrong' ? (x.hand === 'left' ? 'right' : 'left') : mode === 'stay' ? 'right' : x.hand;
      if (mode === 'stay') { RA.touches.forEach(o => { o.hand = 'right'; }); }
    }, 60, s => s.reps !== want ? `${s.reps} diamantes tocados (deberían ser ${want})` : '');
  }
  RA.PV.handSide = null;
  // en la vida real la cabeza no pasa justo por el centro ni vuelve exactamente a su altura: también tiene que contar
  await runConfig('Toques descentrado y volviendo casi del todo', { ...base, mode: 'touch', exercise: 'slam', waves: 1, repsWave: 5, lives: 0, tchArrive: 2, tchGap: 2.2, tchHands: 0 }, () => {
    if (RA.PV.home) { home = RA.PV.home.clone(); RA.PV.home = null; }
    const x = RA.touches.find(o => o.alive && !o.judged && o.mode === 'wait'), w = x && RA.TCH.headArm.armed ? RA.arena.localToWorld(x.pos.clone()).add(new THREE.Vector3(0.12, 0.02, 0.05)) : home.clone().add(new THREE.Vector3(0.05, -0.07, 0));
    RA.camera.position.copy(w); RA.PV.y = w.y;
  }, 60, s => s.reps < 5 ? `descentrado 12 cm o volviendo a 7 cm de la altura de pie solo cuentan ${s.reps} de 5` : '');
  // flexiones: solo amebas, algunas desplazadas hacia un hombro
  let maxX = 0, gems = 0;
  await runConfig('Toques flexiones hacia los hombros', { ...base, mode: 'touch', exercise: 'pushup', waves: 1, repsWave: 12, lives: 0, tchArrive: 2, tchGap: 1.5, tchHands: 100 }, t => { RA.PV.crouch = true; RA.touches.forEach(x => { maxX = Math.max(maxX, Math.abs(x.pos.x)); if (x.part === 'hand') gems++; }); }, 60,
    s => gems ? 'en flexiones no debería haber diamantes' : maxX < 0.06 ? 'las amebas de las flexiones siempre van al centro' : '');
  RA.PV.handAt = null;
  await runConfig('Toques sin moverse', { ...base, mode: 'touch', exercise: 'slam', waves: 1, repsWave: 4, lives: 0, tchArrive: 2, tchGap: 2 }, () => { RA.PV.crouch = false; }, 60, s => s.reps ? 'sin moverse no debería tocar nada' : s.taken < 4 ? 'los objetivos no tocados no cuentan como fallo' : '');
  const arr = new Set();
  await runConfig('Toques al ritmo (120 BPM)', { ...base, mode: 'touch', exercise: 'slam', waves: 1, repsWave: 6, lives: 0, tchArrive: 2, tchGap: 1.3, bpm: 120 }, t => { assist(); RA.touches.forEach(x => arr.add(+x.arriveAt.toFixed(4))); }, 120, s => {
    const a = [...arr].sort((x, y) => x - y), off = a.slice(1).map((x, i) => (x - a[i]) / 0.5).filter(k => Math.abs(k - Math.round(k)) > 0.04 || Math.round(k) < 1);
    return a.length < 5 ? 'no llegan objetivos' : off.length ? 'los objetivos no llegan en el pulso: ' + a.join(' ') : '';
  });
  RA.setSetting('bpm', 0); RA.PV.keys.KeyG = false; RA.PV.crouch = false;
  // ---- Muchos robots a la vez: cada uno a su puesto, sin chocar, sin atascarse y sin ir uno contra otro ----
  const RB = { minGap: 9, stuck: new Map(), worstStuck: 0, facing: 0, frames: 0, slots: 0 };
  await runConfig('Asalto multitud de robots', { ...base, mode: 'walkers', exercise: 'squat', waves: 1, repsWave: 40, maxAlive: 7, spawnGap: 0.6, walkTime: 8, lives: 0 }, t => {
    RA.PV.crouch = t > 20 && (t % 2.6) < 1.4; // primero se acumulan sin disparar
    const R = RA.enemies.filter(e => e.alive && e.type === 'robot');
    for (const a of R) {
      if (a.state === 'walk' && a.spd < 0.05 && Math.hypot(a.slot.x - a.pos.x, a.slot.z - a.pos.z) > 0.3 && RA.state === 'play') { const v = (RB.stuck.get(a) || 0) + 0.033; RB.stuck.set(a, v); RB.worstStuck = Math.max(RB.worstStuck, v); } else RB.stuck.set(a, 0);
      for (const b of R) if (a !== b) {
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz);
        if (a.root.uuid < b.root.uuid || !a.root.uuid) RB.minGap = Math.min(RB.minGap, d - a.radius - b.radius);
        // uno contra otro: cerca y mirándose de frente
        const ang = (y, x, z) => Math.abs(Math.atan2(Math.sin(Math.atan2(x, z) - y), Math.cos(Math.atan2(x, z) - y)));
        if (d < 1.4 && a.state === 'walk' && ang(a.yaw, dx, dz) < 0.5 && ang(b.yaw, -dx, -dz) < 0.5) RB.facing++;
        if (a.slot.distanceTo(b.slot) < 0.5) RB.slots++;
      }
    }
    RB.frames++;
  }, 420, s => { log(`   robots: hueco mínimo ${RB.minGap.toFixed(2)} m, peor atasco ${RB.worstStuck.toFixed(1)} s, fotogramas andando de cara a otro ${RB.facing} de ${RB.frames}, puestos repetidos ${RB.slots}`);
    return RB.minGap < -0.05 ? 'los robots se solapan' : RB.worstStuck > 1.5 ? `un robot se atasca ${RB.worstStuck.toFixed(1)} s` : RB.facing > RB.frames * 0.02 ? 'los robots andan de cara unos contra otros' : RB.slots ? 'dos robots comparten puesto' : s.kills < 8 ? 'no se matan robots' : ''; });
  await runConfig('Asalto con vidas (derrota)', { ...base, mode: 'walkers', exercise: 'squat', lives: 1, walkTime: 4 }, t => { RA.PV.crouch = false; }, 120);
  await runConfig('Jefe en oleada final', { ...base, mode: 'walkers', exercise: 'squat', waves: 1, repsWave: 10 }, squatSim(2.4));
  const bars = { ...base, mode: 'bars', barArrive: 2, barWait: 0, fallMargin: 12, dipBars: '2' };
  await runConfig('Barras+remo (pompas)', { ...bars, exercise: 'row', barTarget: 'bubbles' }, watchPanels(pullSim()), 420, panelCheck('remo', s => s.reps < 9 ? 'pocas repeticiones' : s.kills < 4 ? 'no revienta las pompas' : ''));
  await runConfig('Barras+remo una paralela', { ...bars, exercise: 'row', dipBars: '1', barTarget: 'bubbles' }, pullSim(), 420, s => s.kills < 4 ? 'con una paralela no revienta las pompas' : '');
  // remo con avispas: esperan a 3/4 de la altura de la barra, pasado su borde hacia la cabeza, y vuelan niveladas mirándote
  for (const bars_ of ['2', '1']) {
    const W = { n: 0, bad: [], maxPitch: 0 };
    await runConfig('Barras+remo avispas (' + bars_ + ' paralela' + (bars_ === '1' ? ')' : 's)'), { ...bars, exercise: 'row', dipBars: bars_, barTarget: 'bugs' }, t => {
      pullSim()(t);
      for (const e of RA.enemies) if (e.alive && e.K && e.K.wasp && e.mode === 'wait' && e.slotIndex() === 0) { // la primera: las demás esperan detrás
        const w = RA.arena.localToWorld(e.slot.clone()), l = RA.eqLocal(RA.eqPose('dip'), w, new THREE.Vector3()), m = RA.eqLocal(RA.eqPose('dip'), RA.BAR.mountXZ.clone(), new THREE.Vector3());
        const H = RA.settings.dipH / 100, L = RA.settings.dipLen / 200;
        const okY = Math.abs(w.y - Math.max(RA.BAR.ref + RA.settings.rowRange / 100 + 0.04, H * 0.75 + 0.05)) < 0.02, okXZ = bars_ === '1' ? Math.sign(l.x) === Math.sign(m.x || 1) && Math.abs(Math.abs(l.x) - 0.12) < 0.01 : Math.abs(l.z) > L && Math.sign(l.z) === Math.sign(m.z || 1);
        if (!(okY && okXZ)) W.bad.push(`${l.x.toFixed(2)},${w.y.toFixed(2)},${l.z.toFixed(2)}`);
        W.maxPitch = Math.max(W.maxPitch, Math.abs(e.root.rotation.x)); W.n++;
      }
    }, 420, s => { log(`   avispas: ${W.n} fotogramas esperando, fuera de sitio ${W.bad.length} ${W.bad.slice(0, 2).join(' ')}, inclinación máx. ${W.maxPitch.toFixed(2)} rad`);
      return !W.n ? 'no se ven avispas esperando' : W.bad.length ? 'las avispas no esperan a 3/4 de la barra (algo más arriba) pasado su borde' : W.maxPitch > 0.36 ? 'las avispas se ponen en vertical' : ''; });
  }
  RA.setSetting('dipBars', '2');
  // por los lados: llegan en diagonal (desde delante y su lado, a la vista) y se paran apartados del centro, alternando
  // (los dos brazos por igual); y nunca dos a la vez: espaciados una repetición (±15 %)
  for (const [ex, target, sides] of [['pullup', 'bubbles', 100], ['row', 'bugs', 100], ['pullup', 'bubbles', 0], ['row', 'bubbles', 50]]) {
    const B = { lat: [], from: [], ang: [], arr: [], seen: new Set(), arrived: new Set() };
    await runConfig(`Barras ${ex} ${target}${sides ? ` por los lados ${sides} %` : ''}`, { ...bars, exercise: ex, barTarget: target, barMix: sides, barOffset: 20, barArrive: 2, waves: 1, repsWave: 10 }, t => {
      pullSim(4.2)(t); // (más despacio que el hueco entre objetivos: así llegan todos y esperan)
      const ax = new THREE.Vector3(); { const e = RA.eqPose(); const c = Math.cos(e.yaw), s_ = Math.sin(e.yaw); ax.set(c, 0, -s_).applyAxisAngle(new THREE.Vector3(0, 1, 0), -RA.arena.rotation.y); }
      for (const e of RA.enemies) { if (e.type !== 'target') continue;
        if (!B.seen.has(e)) { B.seen.add(e); const d = e.pos.clone().sub(e.slot); d.y = 0; B.from.push(Math.abs(d.dot(ax))); if (e.side) B.ang.push(Math.acos(Math.min(1, Math.abs(d.dot(ax)) / (d.length() || 1))) * 180 / Math.PI); } // (ang: 0° = de lado del todo)
        if (e.mode === 'wait' && !B.arrived.has(e)) { B.arrived.add(e); B.arr.push(t); if (e.slotIndex() === 0) { const top = new THREE.Vector3(); RA.barTopPoint(top); B.lat.push(e.slot.clone().sub(top).dot(ax)); } } }
    }, 420, s => '');
    const gaps = B.arr.slice(1).map((x, i) => x - B.arr[i]), G = ex === 'row' ? 2.6 : 3.2, L = B.lat.filter(x => x < -0.1).length, R = B.lat.filter(x => x > 0.1).length;
    log(`bars ${ex} ${target} sides ${sides}: stops ${B.lat.map(x => x.toFixed(2)).join(' ')} (left ${L}, right ${R}) · came from ${B.from.slice(0, 4).map(x => x.toFixed(1)).join(' ')} m to the side${B.ang.length ? `, side ones at ${Math.min(...B.ang).toFixed(0)}–${Math.max(...B.ang).toFixed(0)}° from straight sideways` : ''} · gaps between arrivals ${gaps.map(x => x.toFixed(1)).join(' ')}`);
    const Cn = B.lat.filter(x => Math.abs(x) < 0.05).length;
    if (sides === 100 && (!B.lat.length || B.lat.some(x => Math.abs(Math.abs(x) - 0.2) > 0.03) || Math.abs(L - R) > 1 || Math.min(...B.from) < 1.2)) errors.push(`barras (${ex}): por los lados deberían llegar de un lado, pararse a 20 cm del centro y alternar`);
    if (B.ang.some(a => a < 25 || a > 65)) errors.push(`barras (${ex}): los de los lados deberían llegar en diagonal, desde delante y su lado (${B.ang.map(a => a.toFixed(0)).join(' ')}°)`);
    const nLat = B.from.filter(x => x > 1.2).length, nMid = B.from.filter(x => x < 0.8).length;
    if (sides === 50 && (nLat < 3 || Math.abs(nLat - nMid) > 1 || Math.abs(L - R) > 1 || B.lat.some(x => Math.abs(x) >= 0.05 && Math.abs(Math.abs(x) - 0.2) > 0.03))) errors.push(`barras (${ex}): con el 50 % por los lados deberían mezclarse los del centro con los de los lados (por los lados ${nLat}, al centro ${nMid}; paradas a la izquierda ${L}, a la derecha ${R})`);
    if (!sides && B.lat.some(x => Math.abs(x) > 0.05)) errors.push('barras: sin «por los lados» deberían pararse en el centro');
    if (gaps.length < 3 || Math.min(...gaps) < G * 0.7) errors.push(`barras (${ex}): llegan dos casi a la vez (huecos ${gaps.map(x => x.toFixed(1)).join(' ')})`);
  }
  RA.setSetting('barMix', 0);
  await runConfig('Barras+dominadas (bichos)', { ...bars, exercise: 'pullup', barTarget: 'bugs' }, pullSim(3), 420, s => s.kills < 4 ? 'no revienta los bichos' : '');
  await runConfig('Barras+colgado', { ...bars, exercise: 'hang', hangTime: 5, hangInc: 5 }, t => {}, 120, s => s.hold < 14 ? 'no cuenta el tiempo colgado' : '');
  await runConfig('Barras+remo con caída', { ...bars, exercise: 'row', lives: 3 }, fallOnce(9, pullSim()), 420, s => s.falls !== 1 ? 'la caída no se detecta' : s.taken < 1 ? 'la caída no quita vida' : '');
  // remolino: se cierra al ritmo del tiempo colgado y queda cerrado justo al cumplirlo
  const VR = { half: null, closedAtRest: null, openMount: 0, noPool: true };
  await runConfig('Barras+colgado remolino', { ...bars, exercise: 'hang', hangPit: 'vortex', hangTime: 10, hangInc: 0, waves: 2, rest: 5 }, t => {
    if (RA.state === 'mount') VR.openMount = Math.max(VR.openMount, RA.VX.R);
    if (RA.state === 'play' && RA.waveIdx === 0 && VR.half === null && RA.BAR.hold >= RA.BAR.need / 2) VR.half = RA.VX.R;
    if (RA.state === 'rest' && RA.stateT > 0.5 && VR.closedAtRest === null) VR.closedAtRest = RA.VX.R;
    if (RA.pool.visible) VR.noPool = false;
  }, 120, s => { log(`   remolino: abierto al colgarse ${VR.openMount.toFixed(2)}, a mitad de tiempo ${VR.half && VR.half.toFixed(2)}, en el descanso ${VR.closedAtRest && VR.closedAtRest.toFixed(2)}, charco oculto ${VR.noPool}`);
    return VR.openMount < 0.95 ? 'el remolino no se abre al colgarse' : Math.abs(VR.half - 0.5) > 0.08 ? 'el remolino no se cierra al ritmo del tiempo' : VR.closedAtRest > 0.05 ? 'el remolino no se cierra al cumplir el tiempo' : !VR.noPool ? 'con el remolino no debería verse el charco' : s.hold < 19 ? 'no cuenta el tiempo colgado' : ''; });
  // soltarse con el remolino: te engulle, pierdes una vida y esa oleada termina (pasa a la siguiente)
  const VF = { failedWave: -1, holdAtFail: 0, lives0: 0, waves: new Set() };
  await runConfig('Barras+colgado remolino soltándose', { ...bars, exercise: 'hang', hangPit: 'vortex', hangTime: 10, hangInc: 0, waves: 2, rest: 5, lives: 3 }, fallOnce(9, t => {
    VF.waves.add(RA.waveIdx); if (RA.state === 'play' && RA.stats.falls === 0) { VF.holdAtFail = RA.BAR.hold; VF.failedWave = RA.waveIdx; }
  }), 120, s => { log(`   soltándose: caídas ${s.falls}, vidas ${RA.lives}, aguantado ${VF.holdAtFail.toFixed(1)} s de 10 en la oleada ${VF.failedWave + 1}, oleadas jugadas ${[...VF.waves].map(w => w + 1)}`);
    return s.falls !== 1 ? 'la caída no se detecta' : RA.lives !== 2 ? 'te engulle sin quitar una vida' : !VF.waves.has(1) || s.hold > 16 ? 'la oleada no termina al engullirte' : ''; });
  await runConfig('Barras+colgado caída (derrota)', { ...bars, exercise: 'hang', lives: 1, hangTime: 30 }, fallOnce(6, t => {}), 120, s => s.falls !== 1 ? 'la caída no se detecta' : '');
  // tentáculos animados (con un modelo de mentira): se lanzan hacia los pies, más largos, y al caer barren todos
  { const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a)), clip = (name, duration) => ({ name, duration, tracks: [] }), g = new THREE.Group(); g.add(new THREE.Mesh());
    const resetTents = () => { RA.POOL.tents.forEach(T => RA.pool.remove(T.root)); RA.POOL.tents.length = 0; };
    resetTents(); Object.assign(RA.TENT, { st: 'ready', scene: g, clips: { Idle: clip('Tentacle_Idle', 3.3), Attack: clip('Tentacle_Attack', 0.9), Attack2: clip('Tentacle_Attack2', 1), Poke: clip('Tentacle_Poke', 1.3) }, hits: 0 });
    const TT = { mdl: 0, aim: 9, grow: 0 };
    await runConfig('Barras+colgado tentáculos animados', { ...bars, exercise: 'hang', hangPit: 'pool', lives: 3, hangTime: 20 }, fallOnce(12, t => {
      for (const T of RA.POOL.tents) { if (!T.mdl) continue; TT.mdl = Math.max(TT.mdl, RA.POOL.tents.filter(x => x.mdl).length);
        if (T.k > 0.95) { RA.pool.updateMatrixWorld(); const f = RA.pool.worldToLocal(RA.head.p.clone()), P = T.root.position; TT.aim = Math.min(TT.aim, Math.abs(wrapA(Math.atan2(f.x - P.x, f.z - P.z) - T.root.rotation.y))); TT.grow = Math.max(TT.grow, T.root.scale.x / (0.062 * T.s)); } }
    }), 120, s => { log(`   tentáculos animados: ${TT.mdl} · lanzamientos ${RA.TENT.hits} · desvío hacia los pies ${TT.aim.toFixed(2)} rad · crecen ×${TT.grow.toFixed(2)}`);
      return TT.mdl !== 5 ? 'no salen los 5 tentáculos animados' : RA.TENT.hits < 7 ? 'los tentáculos animados no se lanzan (ni barren al caer)' : TT.aim > 0.15 ? 'el tentáculo no apunta a los pies' : TT.grow < 1.2 ? 'el tentáculo no se estira para llegar' : ''; });
    resetTents(); RA.TENT.st = 'failed'; }
  await runConfig('Barras bichos sin reventar (pican)', { ...bars, exercise: 'pullup', barTarget: 'bugs', barWait: 2, lives: 2 }, t => {}, 120, s => s.taken < 2 ? 'los bichos no pican al agotarse el tiempo' : '');
  await runConfig('Barras pompas sin reventar (se escapan)', { ...bars, exercise: 'row', barTarget: 'bubbles', barWait: 2, waves: 1, repsWave: 3 }, (t => { RA.PV.crouch = RA.state === 'play' && t > 25 && (t % 2.6) < 1.3; }), 200, s => s.taken !== 0 ? 'las pompas no deberían hacer daño' : '');

  // ---- marcador: lo de hoy (con la ronda en curso) y lo que falta para el récord de un día con este ejercicio ----
  { const saved = storage.get('reparena3-history'), now = Date.now(), D = 864e5, mk = (dd, ex, reps, time) => ({ ex, mode: 'combat', reps, perfect: 0, kills: 0, win: true, time, kcal: 5, date: now - dd * D });
    storage.set('reparena3-history', JSON.stringify([mk(0, 'squat', 20, 300), mk(0, 'pushup', 15, 200), mk(1, 'squat', 30, 400), mk(1, 'squat', 25, 300), mk(3, 'squat', 40, 500)]));
    RA.setSetting('mode', 'combat'); RA.setSetting('exercise', 'squat'); RA.startPreview(); frame(1); RA.beginRun(); frame(250);
    const d = RA.boardDay(), st = RA.stats; RA.drawBoard();
    log(`board day: today ${Math.round(d.time)} s (saved 500 + run ${Math.round(st.time)}) · squats ${d.n} (saved 20 + run ${st.reps}) · best day ${d.best}`);
    if (d.best !== 55 || d.n !== 20 + st.reps || Math.abs(d.time - 500 - st.time) > 0.01) errors.push('marcador: no cuenta bien lo de hoy o el récord de un día');
    RA.exitAll(); frame(1); if (saved) storage.set('reparena3-history', saved); else storage.delete('reparena3-history'); }
  // ---- menús ----
  RA.setSetting('mode', 'walkers'); RA.setSetting('exercise', 'squat');
  RA.startPreview(); frame(2);
  RA.settingsMenu(() => RA.lobbyMenu()); frame(2);
  for (const tab of ['Partida', 'Tu cuerpo', 'Enemigos', 'Armas', 'Menú', 'Tu meta']) {
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
  press('Menú'); frame(1); press('No'); frame(1); press('Sí'); frame(1);
  { const tabs = RA.activeWidgets().filter(w => w.style === 'tab' || w.style === 'selected').map(w => w.label); log('settings tabs:', tabs.join(', '));
    if (tabs.some(l => /Sonido|Entorno/.test(l))) errors.push('menú: sonido y entorno deberían tener su submenú, no una pestaña en Ajustes'); }
  press('Volver'); frame(2);
  // Armas: pistolas, puntería con las manos y espadas juntas, en su pestaña y en su submenú (y fuera de Enemigos)
  { const mKeys = () => RA.menu.rows.filter(r => r.t === 'field').map(r => r.key), tabKeys = t => { RA.settingsMenu(() => RA.lobbyMenu(), t); frame(1); return mKeys(); };
    const fg = RA.settings.foesGate, ff = RA.settings.foesFly; RA.setSetting('mode', 'combat'); RA.setSetting('exercise', 'squat'); RA.setSetting('foesGate', 'robots'); RA.setSetting('foesFly', ''); RA.setSetting('aim', 'hands'); RA.setSetting('menuLevel', 'full');
    const arm = tabKeys('armas'), foe = tabKeys('enemigos'); RA.lobbyMenu(); frame(1);
    const btn = (RA.activeWidgets().find(w => /^Armas: /.test(w.label)) || {}).label, inside = (openArms(), mKeys()); press('Volver'); frame(1);
    const mainHas = mKeys().some(k => ['aim', 'throwPick', 'sword', 'swordKind', 'pistol'].includes(k));
    log(`arms: tab ${arm.join(',')} · enemies tab ${foe.join(',')} · button “${btn}” · submenu ${inside.join(',')} · weapons left in the main menu ${mainHas}`);
    if (!['pistol', 'aim', 'throwPick', 'sword'].every(k => arm.includes(k) && inside.includes(k)) || foe.some(k => ['pistol', 'aim', 'throwPick', 'assist'].includes(k))) errors.push('armas: las pistolas, la puntería y las espadas deberían ir juntas en Armas (y no en Enemigos)');
    if (!btn || mainHas) errors.push('armas: el menú principal debería llevar el botón Armas ▸ en lugar de los ajustes sueltos');
    RA.setSetting('foesGate', fg); RA.setSetting('foesFly', ff); RA.setSetting('aim', 'auto'); RA.setSetting('mode', 'walkers'); RA.lobbyMenu(); frame(1); }
  // rangos: cada uno pone toda la dificultad (también la de la defensa); se eligen con la hilera de galones del menú (sin
  // otro selector debajo); lo que cambias en un rango se queda como valor de ese rango en ese ejercicio (en la tabla)
  { RA.setSetting('mode', 'combat'); RA.setSetting('exercise', 'squat'); RA.setSetting('rank', 'general'); const g = { lives: RA.settings.lives, walk: RA.settings.walkTime, max: RA.settings.maxAlive, gd: RA.settings.guardDiff };
    RA.setSetting('rank', 'recluta'); const r = { lives: RA.settings.lives, walk: RA.settings.walkTime, max: RA.settings.maxAlive, gd: RA.settings.guardDiff };
    RA.lobbyMenu(); frame(1); const badges = RA.activeWidgets().filter(w => w.badge !== undefined), dup = RA.activeWidgets().some(w => /^Rango: /.test(w.label || ''));
    badges[3].onPress(); frame(1); const sg = [RA.settings.rank, RA.settings.walkTime];
    RA.setSetting('walkTime', 30); const cell = RA.devCell('walkTime', 3); RA.setSetting('rank', 'cabo'); const cabo = RA.settings.walkTime; RA.setSetting('rank', 'sargento'); const kept = RA.settings.walkTime;
    RA.setSetting('walkTime', 11); const back = [RA.settings.walkTime, RA.devCell('walkTime', 3)];
    log(`ranks: general ${JSON.stringify(g)} · recluta ${JSON.stringify(r)} · ${badges.length} insignia buttons, rank button below ${dup} · 4th → ${sg} · walk 30 on sargento → table ${cell}, cabo ${cabo}, sargento again ${kept} · back to 11 → ${JSON.stringify(back)}`);
    if (!(g.walk < r.walk && g.max > r.max && g.lives === 1 && r.lives === 0 && g.gd === 'hard' && r.gd === 'easy')) errors.push('rangos: el general debería ser más difícil que el recluta (también la defensa)');
    if (badges.length !== 7 || dup || sg[0] !== 'sargento' || sg[1] !== 11) errors.push('rangos: deberían elegirse con la hilera de galones, sin otro selector debajo');
    if (cell !== 30 || cabo === 30 || kept !== 30 || back[0] !== 11 || back[1] !== null) errors.push('rangos: lo que cambias en un rango debería quedarse como su valor en ese ejercicio (y en la tabla)');
    // cada ejercicio guarda su rango (con sus valores): sargento con 25 s en sentadillas, recluta en curl
    RA.setSetting('rank', 'sargento'); RA.setSetting('walkTime', 25); RA.setSetting('exercise', 'curl'); RA.setSetting('rank', 'recluta'); const curl = [RA.settings.rank, RA.settings.walkTime];
    RA.setSetting('exercise', 'squat'); const sq = [RA.settings.rank, RA.settings.walkTime]; RA.setSetting('exercise', 'curl'); const curl2 = RA.settings.rank;
    log(`   per exercise: curl ${JSON.stringify(curl)} · back to squats ${JSON.stringify(sq)} · curl again ${curl2}`);
    if (curl[0] !== 'recluta' || curl[1] === 25 || sq[0] !== 'sargento' || sq[1] !== 25 || curl2 !== 'recluta') errors.push('rangos: cada ejercicio debería guardar su rango (y sus valores)');
    // subir o bajar: 3 rondas ganadas con muchas perfectas proponen subir; 2 derrotas, bajar (solo lo propone)
    storage.delete('reparena3-rankfit'); const a1 = RA.rankFitAdd(true, 90), a2 = RA.rankFitAdd(true, 80), up = RA.rankFitAdd(true, 75), keep = RA.settings.rank;
    const d1 = RA.rankFitAdd(false, 40), down = RA.rankFitAdd(false, 30), mixed = (RA.rankFitAdd(true, 50), RA.rankFitAdd(true, 90), RA.rankFitAdd(true, 90));
    log(`   promotion: after 3 good wins → ${up} (before: ${a1}, ${a2}; rank still ${keep}) · after 2 defeats → ${down} (${d1}) · wins with few perfects → ${mixed}`);
    if (a1 || a2 || up !== 'soldado' || keep !== 'recluta' || d1 || down !== null || mixed) errors.push('rangos: tras 3 rondas buenas debería proponer subir (sin cambiarlo solo) y no con pocas perfectas');
    RA.setSetting('rank', 'soldado'); storage.delete('reparena3-rankfit'); RA.rankFitAdd(false, 40); const down2 = RA.rankFitAdd(false, 40);
    if (down2 !== 'recluta') errors.push('rangos: tras 2 derrotas seguidas debería proponer bajar'); log(`   demotion from soldado after 2 defeats → ${down2}`);
    { // en el resumen, el botón para subir (y al pulsarlo, sube ese ejercicio y desaparece la propuesta)
      const S = { win: true, manual: false, hang: false, got: 12, unit: 'repeticiones', ex: 'x', sub: 'y', pct: 90, stars: 3, tiles: [[1, 'a'], [2, 'b'], [3, 'c'], [4, 'd'], [5, 'e'], [6, 'f']], chips: [], today: '', rankTo: 'cabo' };
      RA.endMenu('¡VICTORIA!', S); frame(1); const b = RA.activeWidgets().find(w => w.label === 'Subir a Cabo'); if (b) b.onPress(); frame(1);
      const gone = !RA.activeWidgets().some(w => /^Subir a/.test(w.label)); log(`   summary offers “Subir a Cabo” ${!!b} → rank ${RA.settings.rank}, offer gone ${gone}`);
      if (!b || RA.settings.rank !== 'cabo' || !gone) errors.push('rangos: el resumen debería ofrecer subir de rango con un botón'); }
    // un bloque sin rango propio juega con el de su ejercicio
    const curlRank = RA.settings.rank; RA.setSetting('exercise', 'squat'); const bl = RA.blockExRank({ mode: 'combat', ex: 'curl' }).rank; log(`   block without its own rank → curl's ${bl} (squats: ${RA.settings.rank})`);
    if (bl !== curlRank || bl === RA.settings.rank) errors.push('sesiones: un bloque sin rango debería jugar con el de su ejercicio');
    storage.delete('reparena3-rankfit'); RA.setSetting('exercise', 'curl'); RA.setSetting('rank', 'cabo'); RA.setSetting('exercise', 'squat'); RA.setSetting('rank', 'cabo'); RA.setSetting('mode', 'walkers'); RA.lobbyMenu(); frame(1); }
  // sonido y entorno, cada uno en su submenú (y sin nada de sonido en Ajustes)
  press('Sonido'); frame(1); { const ks = RA.activeWidgets().filter(w => w.kind === 'slider').map(w => w.f.key); log('sound menu sliders:', ks.join(', '));
    if (!ks.includes('volume') || !ks.includes('ambient')) errors.push('menú: el submenú de sonido no tiene los volúmenes'); }
  press('Volver'); frame(1); press('Entorno'); frame(1); press('Columna'); frame(1); RA.activeWidgets().find(w => w.label === 'Auto' && w.style !== 'value').onPress(); frame(1);
  { const lw = RA.activeWidgets().map(w => w.label), ks = RA.activeWidgets().filter(w => w.kind === 'slider').map(w => w.f.key); log('scene menu: scenery', lw.includes('Bosque'), 'sliders', ks.join(', '));
    if (!lw.includes('Bosque') || !ks.includes('depth')) errors.push('menú: el submenú de entorno no tiene el escenario o la distancia'); }
  press('Volver'); frame(2);
  // el ojo del desarrollador: lo marcado sale en el menú del jugador (a la derecha del principal y en Ajustes); sin
  // estrellas. Luego, restablecer una pestaña, perfiles y la última pestaña recordada
  { const sl = () => RA.activeWidgets().filter(w => w.kind === 'slider').map(w => w.f.key), vals = () => RA.activeWidgets().filter(w => w.style === 'value').length;
    const fieldsNow = () => (RA.menu && RA.menu.rows || []).flatMap(r => r.t === 'cols' ? r.cols.flat() : [r]).filter(r => r.t === 'field').map(r => r.key);
    const ml = RA.settings.menuLevel; RA.setSetting('menuLevel', 'simple'); RA.lobbyMenu(); frame(1); const before = fieldsNow().includes('repsInc'), stars = RA.activeWidgets().some(w => /[★☆]/.test(w.label));
    RA.devEyeToggle('repsInc'); RA.lobbyMenu(); frame(1); const inLobby = fieldsNow().includes('repsInc');
    press('Ajustes'); frame(1); press('Partida'); frame(1); const inSet = sl().includes('repsInc'); press('Volver'); frame(1); RA.devEyeToggle('repsInc');
    const vol = !stars; RA.setSetting('menuLevel', ml);
    RA.setSetting('rest', 45); RA.setSetting('waves', 9); RA.setSetting('volume', 30);
    press('Ajustes'); frame(1); press('Partida'); frame(1); press('Restablecer Partida'); frame(1); const armed = RA.settings.rest; press('¿Restablecer Partida? Otra vez'); frame(1);
    log(`eye: extra reps in the lobby ${before} → ${inLobby} · in Ajustes ${inSet} · no stars ${vol} · reset Partida: before confirming rest ${armed}, after rest ${RA.settings.rest} waves ${RA.settings.waves} · other groups kept: volume ${RA.settings.volume}`);
    if (before || !inLobby || !inSet || !vol) errors.push('ojo del desarrollador: lo marcado debería salir en el menú del jugador (y no quedar estrellas)');
    if (armed !== 45 || RA.settings.rest !== 20 || RA.settings.waves !== 5 || RA.settings.volume !== 30) errors.push('restablecer pestaña: no pide confirmar o toca otros grupos');
    press('Perfiles'); frame(1); RA.setSetting('lives', 7); press('Guardar: ' + 'Combate · ' + RA.EX_SHORT[RA.settings.exercise]); frame(1);
    RA.setSetting('lives', 2); RA.setSetting('volume', 90); const prof = RA.profiles(); press(prof[0].name); frame(1);
    log(`profiles: saved ${prof.length} “${prof[0].name}” · loaded lives ${RA.settings.lives} volume ${RA.settings.volume} · back in ${RA.activeWidgets().some(w => w.label === 'Perfiles  ▸') ? 'Ajustes' : '?'}`);
    if (prof.length !== 1 || RA.settings.lives !== 7 || RA.settings.volume !== 30) errors.push('perfiles: no se guardan o no se cargan');
    press('Perfiles'); frame(1); press('Borrar'); frame(1); press('¿Borrar?'); frame(1); const left = RA.profiles().length;
    press('Volver'); frame(1); press('Menú'); frame(1); press('Volver'); frame(1); press('Ajustes'); frame(1); const tabOn = RA.activeWidgets().find(w => w.style === 'selected' && ['Partida', 'Menú', 'Tu cuerpo'].includes(w.label));
    log(`profiles: after deleting ${left} · tab remembered: ${tabOn && tabOn.label}`);
    if (left !== 0 || !tabOn || tabOn.label !== 'Menú') errors.push('perfiles: no se borran, o Ajustes no recuerda la pestaña');
    press('Volver'); frame(1); RA.setSetting('lives', 3); RA.setSetting('volume', 80); RA.lobbyMenu(); frame(1); }
  // ---- Nunca detrás de ti, y a golpes se apartan ----
  if (!process.env.ONLY || /front|punch/.test(process.env.ONLY)) {
    const saved = { ...RA.settings }, V = THREE.Vector3, sq = squatSim(2.4), T = { t: 0 }, step = (n, sim) => { for (let i = 0; i < n; i++) { if (sim) sim(T.t); frame(1); T.t += 0.033; } };
    applyCfg({ mode: 'combat', exercise: 'squat', aim: 'auto', foesGate: 'robot', foesFly: 'drone', lives: 0, waves: 1, repsWave: 40, repsInc: 0, rest: 0, walkTime: 4, perks: 0, surprises: 0 });
    RA.startPreview(); frame(3); press('EMPEZAR');
    while (T.t < 30 && RA.state !== 'play') step(1);
    step(450); // (sin repeticiones no se dispara: que lleguen a sus puestos)
    RA.PV.keys.KeyW = true; step(30); RA.PV.keys.KeyW = false; // avanzas 1,5 m hacia ellos
    let worst = -9, seen = 0;
    for (let i = 0; i < 500; i++) { step(1); for (const e of RA.enemies) if (e.alive && (e.out || e.type === 'flyer') && e.pos) { seen++; worst = Math.max(worst, e.pos.z - RA.HL.z); } }
    log(`never behind you: after stepping 1.5 m forward, enemies checked ${seen} times · closest to your side ${worst.toFixed(2)} m (must stay below −${RA.FRONT_MIN})`);
    if (!seen || worst > -RA.FRONT_MIN + 0.02) errors.push('los enemigos no deberían ponerse a tu altura ni detrás de ti (también si avanzas)');
    // un puñetazo rápido al que tienes delante lo echa atrás y lo aturde, sin quitarle vida
    const e = RA.enemies.find(x => x.alive && x.type === 'robot' && x.out && ['walk', 'windup', 'strike'].includes(x.state)); // (no uno que ya retrocede tras golpear)
    let stun = 0, hp0 = 0, hp1 = 0, back = 0, slow = 0;
    if (e) {
      const h = RA.hands.left, c = e.center(new V()), dir = c.clone().sub(RA.head.p).normalize(); hp0 = e.hp; const away = () => Math.hypot(e.pos.x - RA.HL.x, e.pos.z - RA.HL.z), d0 = away();
      h.ok = true; h.wrist.copy(c).addScaledVector(dir, -0.28); RA.PUNCH.left.ok = false; RA.PUNCH.left.cd = 0; RA.punchStep(0.016);
      h.wrist.addScaledVector(dir, 0.07); RA.punchStep(0.016); stun = e.stunT || 0; hp1 = e.hp;
      // otra, despacio: no cuenta
      const e2 = RA.enemies.find(x => x.alive && x.type === 'robot' && x.out && x !== e);
      if (e2) { const c2 = e2.center(new V()), d2 = c2.clone().sub(RA.head.p).normalize(); e2.stunT = 0; RA.PUNCH.left.ok = false; RA.PUNCH.left.cd = 0; h.wrist.copy(c2).addScaledVector(d2, -0.2); RA.punchStep(0.016); h.wrist.addScaledVector(d2, 0.005); RA.punchStep(0.016); slow = e2.stunT || 0; }
      step(8); back = away() - d0; // (más lejos de ti)
    }
    log(`punch: robot ${!!e} · stunned ${stun.toFixed(2)} s · pushed back ${(back * 100).toFixed(0)} cm · hp ${hp0} → ${hp1} · a slow touch stuns ${slow.toFixed(2)} s`);
    if (!e || stun <= 0 || back < 0.1 || hp1 !== hp0 || slow > 0) errors.push('golpe: un puñetazo rápido debería echar atrás al enemigo y aturdirlo, sin quitarle vida (y uno lento, no)');
    for (const k in saved) if (RA.settings[k] !== saved[k]) RA.setSetting(k, saved[k]);
    RA.lobbyMenu(); frame(2); }
  // ---- El marcador (rosco doble) y los avisos: las celebraciones, en el marcador; lo que pide hacer algo, delante de ti ----
  if (!process.env.ONLY || /board|marcador/.test(process.env.ONLY)) {
    const saved = { ...RA.settings }, T = { t: 0 }, step = n => { for (let i = 0; i < n; i++) { frame(1); T.t += 0.033; } };
    applyCfg({ mode: 'combat', exercise: 'squat', aim: 'auto', foesGate: 'robot', lives: 3, waves: 5, repsWave: 40, rest: 0, guard: 'on', perks: 0, surprises: 0, toasts: 1 });
    RA.startPreview(); frame(3); press('EMPEZAR');
    while (T.t < 30 && RA.state !== 'play') step(1);
    RA.toastP.mesh.visible = false; RA.cheer('¡PERFECTA!', '#3cf0c6', 1); const cheerOk = RA.msg.text === '¡PERFECTA!' && !RA.toastP.mesh.visible;
    RA.say('¡Agáchate para parar el golpe!', '#ff8a3d', 1); const faceOk = RA.toastP.mesh.visible && RA.msg.text === '¡PERFECTA!';
    RA.setSetting('toasts', 0); RA.say('Vuelve a la plancha', '#ff8a3d', 1); const offOk = RA.msg.text === 'Vuelve a la plancha'; RA.setSetting('toasts', 1);
    // con racha, relámpago y una frase larga se dibuja sin fallar (el lienzo simulado falla con textos raros o radios negativos)
    let drawOk = true; try { RA.combo = 13; RA.cheer('¡Cofre! Mejora extra: Doble o nada', '#ffd166', 1); RA.drawBoard(); RA.rushStart(12); step(5); RA.drawBoard(); RA.rushStop(true); RA.combo = 20; RA.drawBoard(); } catch (e) { drawOk = false; log('board error ' + e.message); }
    // el brazalete: con la mano izquierda a la vista, se ve y se llena con el escudo
    RA.PV.handSide = 'left'; RA.PV.handAt = RA.head.p.clone().add(new THREE.Vector3(-0.2, -0.4, -0.3)); RA.GUARD.charge = 0.5; step(20);
    const brOn = RA.BRACE.g.visible, brK = RA.BRACE.k; RA.PV.handAt = null; step(2); const brOff = !RA.BRACE.g.visible;
    // entre oleadas: fundido leve y el panel con la oleada que empieza; nadie llega hasta que se va
    for (const e of RA.enemies) e.alive = false; RA.startWave(1); step(15); const inOn = RA.WIN.t > 0 && RA.WIN.veil.visible && RA.WIN.veil.material.opacity > 0.3 && RA.WIN.veil.material.opacity < 0.6 && RA.WIN.p.mesh.visible, none = !RA.enemies.some(e => e.alive);
    step(70); const inOff = RA.WIN.t < 0 && !RA.WIN.veil.visible; step(60); const came = RA.enemies.some(e => e.alive);
    log(`wave intro: dim and panel ${inOn} · nobody comes during it ${none} · gone after ${RA.WIN.dur} s ${inOff} · then they come ${came}`);
    if (!inOn || !none || !inOff || !came) errors.push('entre oleadas: debería oscurecerse un poco con el panel de la oleada que empieza, y llegar los enemigos cuando se va');
    log(`board: cheer on the board only ${cheerOk} · action in front of you ${faceOk} · with view notices off, on the board ${offOk} · draws ${drawOk} · bracelet ${brOn} (${brK.toFixed(2)}) hidden without the hand ${brOff}`);
    if (!cheerOk || !faceOk || !offOk) errors.push('avisos: las celebraciones van solo al marcador y lo que pide hacer algo, delante de ti (con los avisos de la vista apagados, al marcador)');
    if (!drawOk) errors.push('marcador: falla al dibujarse con racha, relámpago o una frase larga');
    if (!brOn || Math.abs(brK - 0.5) > 0.1 || !brOff) errors.push('escudo: el brazalete debería verse en el antebrazo, llenarse con el escudo y ocultarse sin la mano');
    for (const k in saved) if (RA.settings[k] !== saved[k]) RA.setSetting(k, saved[k]);
    RA.lobbyMenu(); frame(2); }
  // ---- Para que no aburra (79_perks): mejoras entre oleadas, carrera contra el récord, sorpresas y la música que manda ----
  if (!process.env.ONLY || /perks/.test(process.env.ONLY)) {
    const saved = { ...RA.settings }; // (se devuelven tal cual al acabar: las pruebas siguientes cuentan con ellos)
    const V = THREE.Vector3, sq = squatSim(2.4), real = Math.random, step = (n, sim) => { for (let i = 0; i < n; i++) { if (sim) sim(T.t); frame(1); T.t += 0.033; } }, T = { t: 0 };
    storage.set('reparena3-ghosts', JSON.stringify({ 'combat:squat': { n: 9, tl: [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9] } }));
    applyCfg({ mode: 'combat', exercise: 'squat', aim: 'auto', lives: 3, waves: 3, repsWave: 4, repsInc: 0, rest: 6, ramp: 0, perks: 1, surprises: 0, ghost: 1, bpm: 0, musicLead: 1 });
    RA.startPreview(); frame(3); press('EMPEZAR');
    let gtxt = null;
    // la primera oleada, hasta el descanso: la carrera contra el récord en el marcador y, al poco, las cartas
    while (T.t < 200 && RA.state !== 'rest') { step(1, sq); if (RA.state === 'play' && !gtxt && RA.ghostText()) gtxt = RA.ghostText()[0]; }
    RA.PV.crouch = false; step(60);
    const cards = RA.activeWidgets().filter(w => Object.values(RA.PERKS).some(p => p.name === w.label)).map(w => w.label), menuPerks = !!(RA.menu && RA.menu.perks);
    if (cards.length) { press(cards[0]); frame(2); } const picked = RA.PK.has.size;
    // un cofre en el descanso: se abre saltando (en el ordenador, al soltar Espacio tras agacharte) y da otra mejora
    RA.setSetting('surprises', 1); Math.random = () => 0; RA.chestMaybe(); Math.random = real; RA.setSetting('surprises', 0);
    const chestOn = RA.CHEST.on; RA.PV.crouch = true; step(30); RA.PV.crouch = false; step(30); const opened = RA.CHEST.opened, afterChest = RA.PK.has.size;
    // la segunda: sin elegir, la oleada siguiente espera (aunque se acabe el descanso y se cierre el panel); al elegir,
    // empieza a los 3 s (y la tercera será larga, para el relámpago)
    while (T.t < 400 && !(RA.state === 'rest' && RA.waveIdx === 1)) step(1, sq);
    RA.setSetting('repsWave', 40); RA.PV.crouch = false; const t0 = T.t; while (T.t < t0 + 12 && RA.state === 'rest') step(1);
    const waited = RA.state === 'rest' && !!RA.PK.offer; if (RA.menu && RA.menu.perks) RA.hideMenu(); step(80); const back = !!(RA.menu && RA.menu.perks);
    const cards2 = RA.activeWidgets().filter(w => Object.values(RA.PERKS).some(p => p.name === w.label)).map(w => w.label); if (cards2.length) { press(cards2[0]); frame(2); }
    const t1 = T.t; while (T.t < t1 + 8 && RA.state === 'rest') step(1); const startIn = T.t - t1;
    const auto = RA.PK.has.size;
    log(`perks: ghost on the board “${gtxt}” · cards in the rest ${menuPerks} [${cards.join(', ')}] · picked ${picked} · chest shown ${chestOn}, opened by a jump ${opened} → ${afterChest} perks · waits for you ${waited}, panel back ${back}, starts ${startIn.toFixed(1)} s after picking → ${auto} (${[...RA.PK.has].join(', ')})`);
    if (!gtxt || !/RÉCORD/.test(gtxt)) errors.push('récord: el marcador no compara con tu mejor ronda');
    if (!menuPerks || cards.length !== 3 || picked !== 1) errors.push('mejoras: en el descanso no salen 3 cartas para elegir una');
    if (!chestOn || !opened || afterChest !== 2) errors.push('cofre: no sale, no se abre saltando o no da la mejora extra');
    if (!waited || !back || auto !== 3 || startIn > 4) errors.push('mejoras: la oleada siguiente debería esperar a que elijas (y empezar a los 3 s de elegir)');
    // los efectos, uno a uno, en plena oleada: escudo, escarcha, doble o nada, relámpago y enemigo dorado
    while (T.t < 450 && !(RA.state === 'play' && RA.enemies.some(e => e.alive))) step(1, sq);
    const e = RA.enemies.find(x => x.alive);
    RA.PK.has.add('shield'); RA.PK.shield = 1; const l0 = RA.lives; RA.hurtPlayer({ silent: true }); const l1 = RA.lives; RA.hurtPlayer({ silent: true }); const l2 = RA.lives;
    let frost = false, slow = 1; if (e) { RA.PK.has.add('frost'); RA.perkOnHit(e, { perfect: true, to: e.center(new V()) }); frost = e.frostT > 2.5; slow = RA.perkSlow(e); }
    const had = RA.PK.has.has('gold'); RA.PK.has.add('gold'); let s0 = RA.score; RA.registerRep(true); const dA = RA.score - s0; RA.PK.has.delete('gold');
    s0 = RA.score; RA.registerRep(true); const dB = RA.score - s0; RA.rushStart(20); s0 = RA.score; RA.registerRep(true); const dC = RA.score - s0; RA.rushStop(true); if (had) RA.PK.has.add('gold');
    let gold = 0; if (e) { s0 = RA.score; RA.onKilled(e); const plain = RA.score - s0; e.golden = true; s0 = RA.score; RA.onKilled(e); gold = (RA.score - s0) / plain; e.golden = false; }
    log(`perks: shield lives ${l0} → ${l1} → ${l2} · frost ${frost} (pace ×${slow.toFixed(2)}) · perfect points: double or nothing ${dA}, plain ${dB}, in a rush ${dC} · golden kill ×${gold.toFixed(1)}`);
    if (l1 !== l0 || l2 !== l0 - 1) errors.push('mejoras: el escudo no para (solo) el primer golpe');
    if (!frost || slow > 0.5) errors.push('mejoras: la escarcha no frena a los de alrededor');
    if (dA < dB * 1.6 || dC < dB * 1.6) errors.push('mejoras: doble o nada / relámpago no doblan los puntos');
    if (Math.abs(gold - 3) > 0.01) errors.push('sorpresas: el enemigo dorado no vale el triple');
    // la música manda: con ritmo, el relámpago espera al principio de una frase (cada 32 pulsos), con cuenta atrás
    RA.setSetting('bpm', 120); RA.setSetting('surprises', 1); RA.RUSH.planT = 0.01; step(2, sq);
    const at = RA.RUSH.at, ahead = at - RA.beatNow();
    while (T.t < 520 && !RA.RUSH.on && RA.state === 'play') step(1, sq);
    const rushOn = RA.RUSH.on, len = RA.RUSH.left;
    log(`music leads: rush waits for beat ${at} (${ahead.toFixed(1)} beats ahead, phrase start ${at % 32 === 0}) · starts ${rushOn}, lasts ${len.toFixed(1)} s (32 beats at 120 BPM = 16 s)`);
    if (!(at > 0) || at % 32 !== 0 || ahead < 4 || ahead > 36 || !rushOn || Math.abs(len - 16) > 0.6) errors.push('la música manda: el relámpago no empieza en una frase de la canción ni dura una frase');
    // al acabar, si fue tu mejor ronda, queda como récord para la próxima
    RA.rushStop(true); RA.endRun(false, true); frame(2); const G2 = JSON.parse(storage.get('reparena3-ghosts'))['combat:squat'];
    log(`ghost saved after the round: ${G2.n} reps (before 9), timeline of ${G2.tl.length} points`);
    if (!(G2.n > 9) || G2.tl.length < 10) errors.push('récord: la mejor ronda no se guarda para la próxima');
    for (const k in saved) if (RA.settings[k] !== saved[k]) RA.setSetting(k, saved[k]);
    RA.lobbyMenu(); frame(2); }
  // menú sencillo: Ajustes y el principal sin lo de afinar; un toque lo pasa a completo
  { const keys = () => RA.activeWidgets().filter(w => w.kind === 'slider').map(w => w.f.key), labels = () => RA.activeWidgets().map(w => w.label);
    RA.devToggle(false); RA.setSetting('aim', 'hands'); RA.setSetting('menuLevel', 'simple'); RA.lobbyMenu(); frame(1); const lobbyS = armsLabels().includes('Al que miras');
    press('Ajustes'); frame(1); press('Partida'); frame(1); const partS = keys(), noDev = !labels().includes('Ver todos los ajustes (menú completo)');
    RA.devToggle(true); RA.settingsMenu(() => RA.lobbyMenu(), 'partida'); frame(1); press('Ver todos los ajustes (menú completo)'); frame(1); const partF = keys();
    press('Ver solo lo del jugador'); frame(1); press('Volver'); frame(1); RA.setSetting('menuLevel', 'full'); RA.lobbyMenu(); frame(1); const lobbyF = armsLabels().includes('Al que miras');
    // (las pruebas que siguen cuentan con el menú completo, como antes: el del desarrollador)
    log(`player menu: Partida ${partS.join(',')} · full (developer) ${partF.join(',')} · no full menu without developer mode ${noDev} · “el rayo va” in Armas ▸: simple ${lobbyS}, full ${lobbyF}`);
    if (partS.includes('repsInc') || !partF.includes('repsInc') || !partS.includes('rest') || lobbyS || !lobbyF || !noDev) errors.push('menú del jugador: no esconde lo de afinar, o el completo (del desarrollador) no lo enseña');
    RA.setSetting('aim', 'auto'); RA.lobbyMenu(); frame(1); }
  press('Combate'); frame(1); { const lw = RA.activeWidgets().map(w => w.label).concat(exLabels(), armsLabels()); log('Combate exercises:', ['Sentadillas', 'Zancadas', 'Fondos silla', 'Press hombro', 'Plancha lateral', 'Plancha 1 brazo', 'Superman'].every(l => lw.includes(l)), 'foes+aim', lw.some(l => /^Enemigos: /.test(l)) && ['Automática', 'Con las manos', 'Con la mirada'].every(l => lw.includes(l))); if (!['Zancadas', 'Fondos silla', 'Press hombro', 'Plancha lateral', 'Plancha 1 brazo', 'Superman'].every(l => lw.includes(l))) errors.push('el menú no ofrece los ejercicios de Combate'); if (!(lw.some(l => /^Enemigos: /.test(l)) && ['Automática', 'Con las manos', 'Con la mirada'].every(l => lw.includes(l)))) errors.push('Combate no deja elegir enemigos y puntería'); }
  // Superman: siempre voladores y puntería automática (no se ofrece elegirla); plancha con un brazo: siempre arañas
  press('Superman'); frame(1); { const lw = RA.activeWidgets().map(w => w.label).concat(armsLabels()); log('superman: foes', RA.foes(), 'aim offered', lw.includes('Con las manos')); if (RA.foes() !== 'flyers' || lw.includes('Con las manos')) errors.push('el superman debería traer voladores con puntería automática'); }
  press('Plancha 1 brazo'); frame(1); if (RA.foes() !== 'robots') errors.push('la plancha con un brazo debería traer arañas');
  press('Sentadillas'); frame(1);
  // menú por zonas del cuerpo: solo los ejercicios del modo (Combate), agrupados
  RA.setSetting('exSort', 'body'); RA.lobbyMenu(); frame(1);
  { const lw = exLabels(), want = ['Curl barra', 'Sent. + press', 'Flexiones', 'Sentadillas'], not = ['Remo invertido', 'Saltos', 'Abdominales'];
    press('Curl barra'); frame(1); const m3 = RA.settings.mode;
    log('menú por zonas:', want.every(l => lw.includes(l)), '· sin los de otros modos:', !not.some(l => lw.includes(l)), '· curl con barra →', m3);
    if (!want.every(l => lw.includes(l))) errors.push('el menú por zonas no muestra los ejercicios del modo');
    if (not.some(l => lw.includes(l))) errors.push('el menú por zonas muestra ejercicios de otros modos');
    if (m3 !== 'combat') errors.push('el menú por zonas cambió el modo'); }
  RA.setSetting('exSort', 'mode'); press('Sentadillas'); frame(1);
  press('Arcos'); frame(1); const aw = exLabels(); log('Arcos offers only squats:', !aw.includes('Flexiones'), RA.settings.exercise);
  if (aw.includes('Flexiones') || RA.settings.exercise !== 'squat') errors.push('Arcos debería ofrecer solo sentadillas');
  // Toques: ejercicios propios, combinado con movimientos a elegir y ritmo marcado al compás
  press('Toques'); frame(1); const tw = exLabels();
  log('Toques exercises:', ['Slam', 'Saltos', 'Abdominales', 'Flexiones', 'Combinado'].every(l => tw.includes(l)), 'curl hidden', !tw.includes('Curl'), 'squats only as Slam', !tw.includes('Sentadillas'));
  if (!['Slam', 'Saltos', 'Abdominales', 'Combinado'].every(l => tw.includes(l)) || tw.includes('Curl') || tw.includes('Sentadillas')) errors.push('el menú de Toques no ofrece sus ejercicios (con el Slam en lugar de sentadillas y zancadas)');
  RA.setSetting('comboFloor', 'push'); press('Combinado'); frame(1); press('Plancha'); frame(1); RA.activeWidgets().filter(w => w.label === 'Plancha')[1].onPress(); frame(1); press('Toque'); frame(1);
  log('combo floor moves:', RA.settings.comboBase, RA.settings.comboFloor);
  if (RA.settings.comboBase !== 'floor' || RA.settings.comboFloor !== 'push,plank,tap') errors.push('no se eligen los movimientos del combinado: ' + RA.settings.comboFloor);
  for (let i = 0; i < 4; i++) { findW(RA.activeWidgets().find(w => /^Al compás/.test(w.label)).label).onPress(); frame(1); await sleep(400); }
  log('tap tempo bpm', RA.settings.bpm); if (Math.abs(RA.settings.bpm - 150) > 12) errors.push('marcar el ritmo al compás no da ~150 BPM: ' + RA.settings.bpm);
  press('Sin ritmo'); frame(1); RA.setSetting('comboBase', 'stand');
  // Enemigos ▸: cada uno se marca o se quita; sin ninguno de las compuertas, solo voladores
  press('Combate'); frame(1); press(RA.activeWidgets().find(w => /^Enemigos: /.test(w.label)).label); frame(1);
  const gate0 = RA.settings.foesGate, gateLabels = RA.FOE_GATE.filter(o => gate0.split(',').includes(o[0])).map(o => o[1]);
  for (const l of gateLabels) { RA.activeWidgets().find(w => w.label === l).onPress(); frame(1); }
  press('Abeja'); frame(1); const flyNow = RA.settings.foesFly, foesNow = RA.foes(); press('Volver'); frame(1);
  press('Ajustes'); frame(1); press('Armas'); frame(1); press('Con la mirada'); frame(1); press('Volver'); frame(1);
  log('combat flyers gaze:', foesNow, flyNow, RA.settings.aim, '· gate left', JSON.stringify(RA.settings.foesGate)); if (foesNow !== 'flyers' || !flyNow.includes('bee') || RA.settings.aim !== 'gaze') errors.push('no se eligen solo voladores (con la abeja) y la mirada');
  RA.setSetting('foesGate', gate0); RA.setSetting('foesFly', 'drone,hornet'); RA.lobbyMenu(); frame(1); openArms(); press('Automática'); frame(1); press('Volver'); frame(1);
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
  press('Ajustes'); frame(1); press('Barras'); frame(1); RA.activeWidgets().filter(w => w.kind === 'slider').forEach(w => { w.drag(0.6); w.commit(); }); press('Bichos'); frame(1); press('Volver'); frame(1);
  press('Colgado'); frame(1); press('EMPEZAR'); frame(60); RA.openPause(); frame(2); press('Volver a colgarme'); frame(5); log('bars recalib state', RA.state, RA.BAR.phase);
  RA.openPause(); frame(2); press('Menú principal'); frame(2); press('Combate'); frame(1); log('back to', RA.settings.mode, RA.settings.exercise);
  // ---- sesión: tres bloques seguidos, ajustes intactos y resumen ----
  RA.setSetting('mode', 'walkers'); RA.setSetting('exercise', 'squat'); RA.setSetting('waves', 5); RA.setSetting('repsWave', 12); RA.setSetting('rest', 2); RA.setSetting('lives', 0);
  RA.SES.blocks = [{ mode: 'arcs', ex: 'squat', n: 6 }, { mode: 'combat', ex: 'pushup', n: 5, foes: 'robots' }, { mode: 'bars', ex: 'hang', n: 8 }]; RA.SES.rest = 3;
  const hist0 = JSON.parse(storage.get('reparena3-history') || '[]').length;
  RA.lobbyMenu(); frame(2); log('lobby shows session:', RA.activeWidgets().some(w => /EMPEZAR SESIÓN/.test(w.label)));
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
  if (!storedDuring || storedDuring.mode !== 'combat' || storedDuring.exercise !== 'squat') errors.push('durante la sesión se guardan los ajustes del bloque');
  if (RA.settings.mode !== 'combat' || RA.settings.exercise !== 'squat' || RA.settings.waves !== 5) errors.push('al acabar la sesión no se restauran los ajustes');
  // vueltas y rango por bloque: dos bloques × 2 vueltas; el segundo, de general (sus vidas, mientras dura), y al acabar, tu rango
  { const rk0 = RA.settings.rank, lv0 = RA.settings.lives, gen = RA.rankVals('general');
    RA.SES.blocks = [{ mode: 'arcs', ex: 'squat', n: 4 }, { mode: 'arcs', ex: 'squat', n: 4, rank: 'general' }]; RA.SES.rounds = 2; RA.SES.rest = 1;
    const lbl = (RA.lobbyMenu(), frame(2), (RA.activeWidgets().find(w => /EMPEZAR SESIÓN/.test(w.label)) || {}).label || '');
    RA.startSession(); frame(2); const seen = [], rankIn = {};
    for (let i = 0; i < 20000 && (RA.SES.active || RA.state !== 'end'); i++) { // (un bloque perdido también pasa al siguiente)
      const k = RA.SES.round + ':' + RA.SES.idx; if (RA.state === 'play' && seen[seen.length - 1] !== k) { seen.push(k); rankIn[k] = [RA.settings.rank, RA.settings.lives]; }
      RA.PV.crouch = RA.state === 'play' && (i % 70) < 35; frame(1);
    }
    RA.PV.crouch = false; const R = RA.SES.results;
    log(`session rounds: lobby “${lbl}” · played ${seen.join(' ')} · results ${R.length} (rounds ${R.map(r => r.round).join('')}) · block 2 rank ${JSON.stringify(rankIn['0:1'])} (general lives ${gen.lives}) · after: rank ${RA.settings.rank} lives ${RA.settings.lives}`);
    if (seen.join(' ') !== '0:0 0:1 1:0 1:1' || R.length !== 4 || !/× 2/.test(lbl)) errors.push('sesión: con 2 vueltas debería jugar los bloques dos veces seguidas');
    if (!rankIn['0:1'] || rankIn['0:1'][0] !== 'general' || rankIn['0:1'][1] !== gen.lives || (rankIn['0:0'] && rankIn['0:0'][0] !== rk0)) errors.push('sesión: el rango del bloque debería ponerse solo mientras se juega ese bloque');
    if (RA.settings.rank !== rk0 || RA.settings.lives !== lv0) errors.push('sesión: al acabar, el rango y sus ajustes deberían volver a los tuyos');
    RA.SES.rounds = 1; }
  // ---- sonidos propios: cualquier efecto o bucle con su archivo en sounds/ suena en lugar del sintetizado ----
  { const C = RA.AUD.C, used = [], mk = C.createBufferSource.bind(C);
    C.createBufferSource = () => { const n = mk(); const st = n.start; n.start = function (...a) { used.push(this.buffer && this.buffer.tag); return st.apply(this, a); }; return n; };
    const fake = tag => ({ tag, duration: 1 }), P = new THREE.Vector3(0, 1, -2);
    RA.SND.roar(P); RA.SND.swordHit(P, true); const before = used.filter(Boolean).length;
    Object.assign(RA.AUD.samples, { 'rugido-robot': fake('rugido'), 'espada-golpe': fake('golpe'), 'espada-golpe-laser': fake('golpe-laser'), 'oleada': fake('oleada'), 'zumbido-dron': fake('dron'), 'espada-laser-zumbido': fake('sable') });
    RA.SND.roar(P); RA.SND.swordHit(P, true); RA.SND.swordHit(P, false); RA.SND.horn();
    const dr = RA.buzzLoop('drone', P), sb = RA.saberLoop(P); sb.set(P, 3);
    const got = used.filter(Boolean), names = RA.sampleNames();
    log(`own sounds: synthesized used files ${before} · with files ${got.join(',')} · loops from file ${!!(dr && dr.fileSrc)} ${!!(sb && sb.fileSrc)} · names ${names.length}`);
    if (before || got.join(',') !== 'rugido,golpe-laser,golpe,oleada,dron,sable') errors.push('sonidos propios: los archivos no sustituyen a los efectos');
    if (!names.includes('espada-golpe-laser') || !names.includes('ambiente-bosque') || names.length < 50) errors.push('sonidos propios: faltan nombres en la lista');
    // cada enemigo con su voz: el zombi no suena con el rugido del robot; con su archivo, con el suyo
    used.length = 0; RA.SND.roar(P, 0.75, 'zombie'); RA.SND.hiss(P, 0.8, 'wasp'); RA.SND.hiss(P, 1); const noOwn = used.filter(Boolean).join(',');
    Object.assign(RA.AUD.samples, { 'rugido-zombi': fake('zombi'), 'siseo-avispa': fake('avispa'), 'siseo-arana': fake('arana'), 'ataque-arana': fake('salto') });
    used.length = 0; RA.SND.roar(P, 0.75, 'zombie'); RA.SND.roar(P, 1.6, 'raptor'); RA.SND.hiss(P, 0.8, 'wasp'); RA.SND.hiss(P, 1); RA.SND.squish(P); RA.SND.whoosh(P, 'spider'); RA.SND.whoosh(P); const own = used.filter(Boolean).join(',');
    log(`enemy voices: without their files ${noOwn || 'synthesized'} · with them ${own}`);
    if (noOwn || own !== 'zombi,avispa,arana,salto') errors.push('sonidos propios: cada enemigo no suena con su propio archivo');
    if (!['rugido-zombi', 'rugido-velociraptor', 'rugido-diablillo', 'rugido-puglin', 'siseo-avispa', 'ataque-arana', 'arco-pasa', 'rugido-zombi-gordo', 'voz-yeti', 'voz-cangrejo', 'voz-dragon'].every(n => names.includes(n))) errors.push('sonidos propios: faltan las voces de los enemigos en la lista');
    dr.stop(); sb.stop(); for (const k of ['rugido-robot', 'espada-golpe', 'espada-golpe-laser', 'oleada', 'zumbido-dron', 'espada-laser-zumbido', 'rugido-zombi', 'siseo-avispa', 'siseo-arana', 'ataque-arana']) delete RA.AUD.samples[k];
    C.createBufferSource = mk;
  }
  { const seen = new Set(), dup = RA.SCHEMA.map(f => f.key).filter(k => seen.has(k) || !seen.add(k)); log('settings with the same key:', dup.join(', ') || 'none'); if (dup.length) errors.push('ajustes repetidos (se pisan entre sí): ' + dup.join(', ')); }
  // ---- entorno: sin cargador de glTF (aquí) el bosque no se puede cargar y sigue la fortaleza, sin errores ----
  { RA.setSetting('scenery', 'nature'); frame(1); const envOn = RA.env.visible; RA.setSetting('scenery', 'arena'); frame(1);
    log('scenery nature without loader: fortress visible', envOn); if (!envOn) errors.push('entorno: si el bosque no se puede cargar debería verse la fortaleza');
    RA.setSetting('scenery', 'island'); frame(1); const islEnv = RA.env.visible, islGrp = RA.ISL.group.visible; RA.setSetting('scenery', 'mix'); const picks = [];
    for (let i = 0; i < 3; i++) { RA.sceneryNewRun(); picks.push(RA.NAT.pick); } RA.setSetting('scenery', 'arena'); frame(1);
    log('scenery island without loader: fortress visible', islEnv, '· island shown', islGrp, '· alternating', picks.join(' → '));
    if (!islEnv || islGrp) errors.push('entorno: si la isla no se puede cargar debería verse la fortaleza');
    if (new Set(picks).size !== 3) errors.push('entorno: «Alternar» debería pasar por la fortaleza, el bosque y la isla'); }
  // ---- progreso: calorías en cada ronda, racha de días y resumen de hoy ----
  { const H = JSON.parse(storage.get('reparena3-history') || '[]'), last = H[H.length - 1], txt = RA.activeWidgets().map(w => w.label || '').join(' | ') + ' ' + (RA.menu && RA.menu.rows ? RA.menu.rows.map(r => r.text || '').join(' | ') : '');
    const now = Date.now(), D = 864e5, mk = (dd, ex = 'squat', time = 600) => ({ ex, mode: 'combat', reps: 10, perfect: 0, kills: 0, win: true, time, date: now - dd * D });
    RA.setSetting('weight', 70);
    const P1 = RA.progress([mk(0), mk(1), mk(2), mk(5), mk(6), mk(7), mk(8)], now), P2 = RA.progress([mk(1), mk(2)], now), P3 = RA.progress([mk(3)], now), P0 = RA.progress([], now);
    const k = RA.kcalOf('squat', 600, 0, 70), kOld = P1.today.kcal;
    log(`progress: last run kcal ${last && last.kcal} work ${last && last.work}/${last && last.time} s · streaks ${P1.streak}/${P1.best} ${P2.streak} (hoy no) ${P3.streak} ${P0.streak} · week days ${P1.week.days} · 10 min squats ${k.toFixed(1)} kcal, old record ${kOld.toFixed(1)} · line "${RA.progressLine()}"`);
    if (!last || !(last.kcal > 0) || !(last.work > 0) || last.work > last.time) errors.push('progreso: la ronda no guarda las calorías o el tiempo de oleada');
    if (P1.streak !== 3 || P1.best !== 4 || P2.streak !== 2 || P2.trainedToday || P3.streak !== 0 || P0.streak !== 0 || P1.week.days !== 5) errors.push('progreso: la racha de días no se cuenta bien');
    if (Math.abs(k - 67.4) > 0.5 || !(kOld > 30 && kOld < 67.4)) errors.push('progreso: la estimación de calorías no cuadra');
    if (!/Hoy: .*kcal.*racha 1 día/.test(RA.progressLine())) errors.push('progreso: el menú no muestra lo de hoy y la racha');
    // «Hoy», arriba de la página: lo de hoy, frente a ayer y al mejor día, y los últimos 7 días
    const DS = RA.dayStats([mk(0, 'squat', 300), mk(0, 'pushup', 240), mk(1, 'squat', 900), mk(4, 'lunge', 1500)], now);
    log(`today panel: today ${DS.today.reps} reps ${DS.today.time} s ${Object.keys(DS.today.ex).join('+')} · yesterday ${DS.yest.reps} · best day ${DS.best.time} s · week ${DS.week.map(w => Math.round(w.v.time / 60)).join(',')}`);
    if (DS.today.reps !== 20 || DS.today.time !== 540 || DS.yest.reps !== 10 || DS.best.time !== 1500 || DS.week.length !== 7 || DS.week[6].v.time !== 540 || DS.week[2].v.time !== 1500) errors.push('progreso: el panel de «Hoy» no cuenta bien el día, el de ayer, el mejor o la semana');
  }
  if (hist1 - hist0 !== 3) errors.push('el historial no recibe los bloques de la sesión');
  RA.SES.blocks = []; press('Menú principal'); frame(2);
  // ---- los menús que se suceden salen en el mismo sitio (cuelgan del mismo borde de arriba), al alcance de la mano ----
  { RA.setSetting('mode', 'combat'); RA.setSetting('exercise', 'squat'); RA.startPreview(); frame(2); RA.beginRun(); frame(10); RA.endRun(true, true); frame(30); // (tras el fundido a negro)
    const top = menuTop;
    const t1 = top(), h1 = RA.menu.H, dist = Math.hypot(t1.x - RA.head.p.x, t1.z - RA.head.p.z); press('Menú principal'); frame(2); const t2 = top(), h2 = RA.menu.H;
    log(`menus in place: summary H ${h1.toFixed(2)} → main menu H ${h2.toFixed(2)} · top edge moved ${(t1.distanceTo(t2) * 100).toFixed(1)} cm · top edge ${(dist * 100).toFixed(0)} cm away`);
    if (t1.distanceTo(t2) > 0.005) errors.push('el menú que sigue al resumen no sale en el mismo sitio');
    if (dist > 0.75) errors.push('el menú sale demasiado lejos');
    frame(1); }
  // pausa durante partida
  RA.setSetting('mode', 'walkers'); RA.setSetting('exercise', 'squat'); RA.lobbyMenu(); frame(1); press('EMPEZAR'); frame(120);
  RA.openPause(); frame(2); press('Ajustes'); frame(1); press('Volver'); frame(1); press('Continuar'); frame(10);
  RA.openPause(); frame(2); press('Terminar ronda'); frame(30); press('Otra ronda'); frame(30); log('mode after menu tests', RA.settings.mode);
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
  if (process.env.ONLY && !process.env.XR) { log('\nERRORS:', errors.length ? '\n' + errors.join('\n') : 'none'); return; }
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
  applyCfg({ mode: 'bars', exercise: 'pullup', lives: 3, waves: 2, repsWave: 3, repsInc: 0, rest: 0, barTarget: 'bubbles', barWait: 0, barArrive: 2, fallMargin: 12, pullRange: 35 });
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
  // sin ancla, la barra se queda en su sitio de la habitación gracias al suelo del guardián (bounded-floor),
  // aunque en la sesión siguiente el origen de local-floor esté en otro sitio y girado
  E.bounded.on = true; door.handle = null; door.anchor = null;
  await RA.startXR(true); await sleep(50); frame(5, 16, xrFrame);
  const b0 = door.b && { ...door.b }, x0 = door.x, z0 = door.z; log('bounded pose stored', !!b0); RA.exitAll(); frame(2, 16, xrFrame);
  const yb = 0.4, q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yb);
  E.bounded.pose = { position: { x: 0.5, y: 0, z: -0.3 }, orientation: { x: q.x, y: q.y, z: q.z, w: q.w } };
  await RA.startXR(true); await sleep(50); frame(5, 16, xrFrame);
  const ex = 0.5 + Math.cos(yb) * x0 + Math.sin(yb) * z0, ez = -0.3 - Math.sin(yb) * x0 + Math.cos(yb) * z0;
  log('bar with new session origin:', door.x.toFixed(3), door.z.toFixed(3), 'expected', ex.toFixed(3), ez.toFixed(3));
  if (!b0 || Math.hypot(door.x - ex, door.z - ez) > 0.005) errors.push('sin ancla, la barra no se queda en su sitio de la habitación al cambiar el origen de la sesión');
  RA.exitAll(); frame(2, 16, xrFrame); E.bounded.on = false; E.bounded.pose = { position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } };

  // ---- Plancha con un brazo en XR: cada brazo dispara a su lado; los dos a la vez no cuentan ----
  applyCfg({ mode: 'walkers', exercise: 'plank1', lives: 0, waves: 1, repsWave: 30, rest: 0, walkTime: 6, maxAlive: 4, spawnGap: 0.5 });
  XRS.headY = 1.7; await RA.startXR(false); await sleep(700); frame(20, 16, xrFrame);
  RA.beginRun(); XRS.headY = 0.55; frame(200, 16, xrFrame); frame(250, 16, xrFrame);
  log('plank1 after calib', RA.state, 'enemies', RA.enemies.length);
  const sideOf = e => e.pos.x < 0 ? 'left' : 'right', hpSide = s => RA.enemies.filter(e => e.alive && sideOf(e) === s).reduce((a, e) => a + e.hp, 0);
  const hl0 = hpSide('left'), hr0 = hpSide('right'), pp0 = RA.stats.reps;
  XRS.lift = 'left'; frame(40, 16, xrFrame); XRS.lift = null; frame(40, 16, xrFrame);
  log('lift left: reps +' + (RA.stats.reps - pp0), 'left hp', hl0, '→', hpSide('left'), 'right hp', hr0, '→', hpSide('right'));
  if (RA.stats.reps - pp0 !== 1 || hpSide('right') < hr0) errors.push('plancha: levantar el brazo izquierdo no dispara solo a la izquierda');
  const r1 = RA.stats.reps; XRS.lift = 'both'; frame(60, 16, xrFrame); XRS.lift = null; frame(30, 16, xrFrame);
  log('lift both: reps +' + (RA.stats.reps - r1));
  if (RA.stats.reps !== r1) errors.push('plancha: levantar los dos brazos no debería disparar');
  RA.exitAll(); frame(2, 16, xrFrame);

  // ---- Una sola paralela: las manos van a lo largo de la barra ----
  applyCfg({ mode: 'bars', exercise: 'row', dipBars: '1', dipGap: 58 });
  XRS.headY = 1.7; await RA.startXR(true); await sleep(700); frame(20, 16, xrFrame);
  press('Colocar paralela'); frame(2, 16, xrFrame); XRS.headY = 0.45;
  XRS.grip = { left: new THREE.Vector3(-0.25, 0.95, -0.2), right: new THREE.Vector3(0.25, 0.95, -0.2) }; frame(350, 16, xrFrame); XRS.grip = null;
  const dip1 = RA.EQ.xr.dip; log('one dip bar from hands: set', dip1.set, 'yaw', dip1.yaw.toFixed(2), 'dipH', RA.settings.dipH, 'gap kept', RA.settings.dipGap);
  if (!dip1.set || Math.abs(Math.abs(dip1.yaw) - Math.PI / 2) > 0.05 || RA.settings.dipGap !== 58) errors.push('colocar una sola paralela con las manos no funciona');
  XRS.headY = 1.7; frame(100, 16, xrFrame); press('Listo'); frame(2, 16, xrFrame); RA.setSetting('dipBars', '2'); RA.exitAll(); frame(2, 16, xrFrame);

  // ---- Remo en XR: colgarse con los brazos algo doblados y luego estirarlos (la cabeza baja 15 cm) no es soltarse ----
  applyCfg({ mode: 'bars', exercise: 'row', dipBars: '1', lives: 0, waves: 1, repsWave: 4, rest: 0, rowRange: 30, fallMargin: 12, barArrive: 1.5, barWait: 0 });
  XRS.headY = 1.7; await RA.startXR(true); await sleep(700); frame(20, 16, xrFrame);
  { const topY = RA.settings.dipH / 100, grip = { left: new THREE.Vector3(-0.25, topY, -0.2), right: new THREE.Vector3(0.25, topY, -0.2) };
    XRS.headQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.2, 0, 0, 'YXZ')); XRS.grip = grip; XRS.headY = 0.53;
    RA.beginRun(); frame(330, 16, xrFrame); log('row XR mounted with bent arms: state', RA.state);
    for (let k = 0; k < 30; k++) { XRS.headY = 0.53 - 0.15 * k / 30; frame(2, 16, xrFrame); } frame(60, 16, xrFrame);
    log('row XR after straightening the arms: state', RA.state, 'falls', RA.stats.falls);
    if (RA.stats.falls) errors.push('remo XR: estirar los brazos tras colgarse con ellos doblados cuenta como soltarse');
    for (let i = 0; i < 1600 && RA.state !== 'end'; i++) { XRS.headY = (i % 120) < 60 ? 0.38 + 0.36 : 0.38; frame(1, 16, xrFrame); }
    log('row XR reps', RA.stats.reps, 'state', RA.state, 'falls', RA.stats.falls);
    if (RA.stats.reps < 3 || RA.state !== 'end' || RA.stats.falls) errors.push(`remo XR: ${RA.stats.reps} repeticiones, ${RA.stats.falls} caídas, ${RA.state}`); // (la última oleada trae una pompa jefe: con perfectas cae en menos)
    XRS.headQ = null; XRS.grip = null; RA.setSetting('dipBars', '2'); RA.exitAll(); frame(2, 16, xrFrame); }

  // ---- Al calibrar, el entorno se coloca según tu posición y hacia dónde mira tu cuerpo (en plancha, mirando al suelo) ----
  applyCfg({ mode: 'walkers', exercise: 'pushup', lives: 0, waves: 1, repsWave: 4 });
  XRS.headY = 1.7; await RA.startXR(true); await sleep(700); frame(20, 16, xrFrame);
  RA.beginRun(); XRS.headX = 1.0; XRS.headZ = 0.3; XRS.headY = 0.55;
  XRS.headQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.4, -Math.PI / 2, 0, 'YXZ')); // cuerpo hacia +X, mirando al suelo
  frame(200, 16, xrFrame);
  log('calib follows body: state', RA.state, 'arena pos', RA.arena.position.x.toFixed(2), RA.arena.position.z.toFixed(2), 'yaw', RA.arena.rotation.y.toFixed(2));
  if (RA.state !== 'ready' || Math.abs(RA.arena.position.x - 1) > 0.02 || Math.abs(RA.arena.position.z - 0.3) > 0.02 || Math.abs(RA.arena.rotation.y + Math.PI / 2) > 0.05) errors.push('al calibrar el entorno no se coloca según el cuerpo');
  XRS.headX = XRS.headZ = 0; XRS.headQ = null; RA.exitAll(); frame(2, 16, xrFrame);
  // de pie, las compuertas no acompañan a la cabeza mientras calibras; al calibrar, el entorno se desliza hasta quedar delante
  { applyCfg({ mode: 'walkers', exercise: 'squat', lives: 0, waves: 1, repsWave: 4 });
    XRS.headY = 1.7; await RA.startXR(true); await sleep(700); frame(20, 16, xrFrame);
    RA.beginRun(); const y0 = RA.arena.rotation.y, p0 = RA.arena.position.clone(); let drift = 0, i = 0;
    XRS.headX = 0.5; XRS.headZ = -0.2; XRS.headY = 1.7;
    for (; i < 400 && RA.state === 'calib'; i++) { XRS.headQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.8 + 0.5 * Math.sin(i / 9), 0, 'YXZ')); if (i > 150) XRS.headQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.8, 0, 'YXZ')); frame(1, 16, xrFrame); if (RA.state === 'calib') drift = Math.max(drift, Math.abs(RA.arena.rotation.y - y0), RA.arena.position.distanceTo(p0)); }
    const atCal = RA.arena.rotation.y; frame(70, 16, xrFrame);
    log(`standing calib: arena moved while calibrating ${drift.toFixed(3)} · at calibration yaw ${atCal.toFixed(2)} → after the glide ${RA.arena.rotation.y.toFixed(2)} pos ${RA.arena.position.x.toFixed(2)},${RA.arena.position.z.toFixed(2)} · state ${RA.state}`);
    if (drift > 0.01) errors.push('de pie, las compuertas no deberían moverse con la cabeza mientras calibras');
    if (Math.abs(RA.arena.rotation.y - 0.8) > 0.05 || Math.abs(RA.arena.position.x - 0.5) > 0.03 || Math.abs(RA.arena.position.z + 0.2) > 0.03) errors.push('de pie, al calibrar el entorno debería colocarse delante de ti');
    XRS.headX = XRS.headZ = 0; XRS.headQ = null; RA.exitAll(); frame(2, 16, xrFrame); }

  // ---- Flexiones en XR: calibrar un poco alto o mirar al suelo no debe impedir el disparo ----
  applyCfg({ mode: 'walkers', exercise: 'pushup', lives: 0, waves: 1, repsWave: 6, rest: 0, walkTime: 30, pushDepth: 13 });
  for (const [name, calibY, topY, low, want] of [['calibrada a cuatro patas', 0.68, 0.56, 0.22, 4], ['mirando al suelo', 0.56, 0.51, 0.22, 4], ['medias flexiones', 0.56, 0.56, 0.08, 0]]) {
    XRS.headY = 1.7; await RA.startXR(false); await sleep(700); frame(20, 16, xrFrame);
    RA.beginRun(); XRS.headY = calibY; frame(200, 16, xrFrame); XRS.headY = topY; frame(60, 16, xrFrame);
    for (let i = 0; i < 1000 && RA.state !== 'end'; i++) { XRS.headY = (i % 150) < 75 ? topY - low : topY; frame(1, 16, xrFrame); }
    log(`XR push-ups ${name}: reps`, RA.stats.reps, 'partial', RA.stats.partial);
    if (want ? RA.stats.reps < want : RA.stats.reps) errors.push(`flexiones ${name}: ${RA.stats.reps} repeticiones`);
    RA.exitAll(); frame(2, 16, xrFrame);
  }

  // ---- Caricatura del ejercicio: todos los ejercicios en todos sus modos se dibujan; junto al menú y en la espera ----
  { const bad = [];
    for (const mode of Object.keys(RA.MODE_EX)) for (const ex of RA.MODE_EX[mode]) { if (!RA.DEMO[ex]) { bad.push(ex + ' sin caricatura'); continue; } for (const t of [0.1, 0.9, 1.7, 2.6]) { try { RA.demoDraw(RA.DEMOP.ctx, RA.DEMOP.W, RA.DEMOP.H, ex, mode, t); } catch (e) { bad.push(`${ex}/${mode}: ${e.message}`); break; } } }
    log('demo drawings:', bad.length ? bad.join(' · ') : 'all ok'); if (bad.length) errors.push('caricaturas: ' + bad.join(' · '));
    RA.setSetting('mode', 'combat'); RA.setSetting('exercise', 'squat'); RA.startPreview(); frame(3);
    const inMenu = () => { let n = 0; RA.menu && RA.menu.group.traverse(o => { if (o.material === RA.DEMOP.mesh.material) n++; }); return n; };
    const m1 = inMenu(); press('EMPEZAR'); frame(40); const waitVis = RA.DEMOV.head.visible, st = RA.state;
    // en la espera, a la derecha del panel del centro y a su altura (no por encima, casi fuera de la vista)
    const cm = RA.center.mesh, rel = RA.DEMOV.head.position.clone().sub(cm.position).applyQuaternion(cm.quaternion.clone().invert()), beside = cm.visible && rel.x > 0.5 && Math.abs(rel.y) < 0.08 && Math.abs(rel.z) < 0.08;
    for (let i = 0; i < 300 && RA.state !== 'play'; i++) frame(1);
    log('demo next to the lobby menu', m1, '· during', st, 'visible', waitVis, `(beside the centre panel ${beside}: ${rel.x.toFixed(2)}, ${rel.y.toFixed(2)}, ${rel.z.toFixed(2)})`, '· in play hidden', !RA.DEMOV.head.visible, '· texture alive', !RA.DEMOP.tex.disposed);
    if (!beside) errors.push('caricatura: en la espera debería salir a la derecha del panel del centro, a su altura');
    if (m1 !== 1 || !waitVis || RA.DEMOV.head.visible) errors.push('la caricatura no aparece junto al menú o en la espera');
    RA.exitAll(); frame(1); }

  // ---- Avisos de corrección: grandes en el suelo durante 4 s ----
  RA.setSetting('mode', 'walkers'); RA.setSetting('exercise', 'squat'); RA.startPreview(); frame(3); press('EMPEZAR');
  for (let i = 0; i < 300 && RA.state !== 'play'; i++) frame(1);
  RA.onPartial('¡Baja más!'); frame(100); const wv = RA.WARN.p.mesh.visible, wy = RA.WARN.p.mesh.position.y; frame(40);
  log('floor warning: visible at 3.3 s', wv, 'on the floor (y)', wy.toFixed(2), 'hidden at 4.6 s', !RA.WARN.p.mesh.visible, 'log', RA.WARN.log.slice(-1)[0]);
  if (!wv || wy > 0.1 || RA.WARN.p.mesh.visible) errors.push('el aviso no se queda 4 s escrito en el suelo');
  RA.exitAll(); frame(1);

  // ---- Spotify ----
  await sleep(50);
  log('spotify: connected', !!RA.SP.cfg.refresh, 'url cleaned', global.location.replaced, 'now:', RA.spNowText());
  if (!RA.SP.cfg.refresh || !/Eye of the Tiger/.test(RA.spNowText())) errors.push('Spotify: no se conecta con el código de vuelta');
  // minicontroles (con iconos) en el menú principal y en la pausa; usarlos en plena partida no la termina; con música, sin ambiente
  { RA.setSetting('mode', 'walkers'); RA.setSetting('exercise', 'squat'); SPOT.playing = true; await RA.spRefresh(); RA.startPreview(); frame(2); // (sonando: la partida anterior la pausó al acabar)
    const lw = RA.activeWidgets(), mini = ['prev', 'next', 'voldown', 'volup'].every(k => lw.some(w => w.icon === k)) && lw.some(w => w.icon === 'pause' || w.icon === 'play');
    RA.beginRun(); frame(30); RA.openPause(); frame(2); const inPause = RA.activeWidgets().some(w => w.icon === 'next');
    RA.activeWidgets().find(w => w.icon === 'next').onPress(); await sleep(20); frame(2); const st = RA.state; press('Continuar'); frame(2); const back = RA.state;
    const muted = RA.AUDM.music && RA.ambMute();
    log(`spotify mini controls: main menu ${mini} · pause ${inPause} · state after «next» in the pause ${st} → after Continuar ${back} · ambience muted while it plays ${muted}`);
    if (!mini || !inPause) errors.push('Spotify: faltan los minicontroles con iconos en el menú principal o en la pausa');
    if (st !== 'paused' || !RA.GAME_STATES.includes(back)) errors.push('Spotify: usar los minicontroles en plena partida no debería terminarla (pausa y se reanuda)');
    if (!muted) errors.push('Spotify: mientras suena, el sonido ambiente debería callarse');
    RA.exitAll(); frame(2); }
  // al terminar la partida, Spotify se pausa y vuelve el ambiente; al empezar la siguiente, la música sigue
  { RA.setSetting('mode', 'walkers'); RA.setSetting('exercise', 'squat'); SPOT.playing = true; await RA.spRefresh(); RA.startPreview(); frame(2);
    // (fundidos cortos para la prueba: el volumen baja en pasos hasta 0, se pausa y vuelve a su volumen; al seguir, sube)
    Object.assign(RA.SP_FADE, { out: 100, in: 100 }); const vStart = SPOT.vol;
    RA.beginRun(); frame(30); await sleep(300); const n0 = SPOT.calls.length; // (lo que quedara de un fundido anterior, terminado)
    RA.endRun(true, true); await sleep(300); frame(2); const paused = !SPOT.playing, amb = !RA.ambMute();
    const vols = SPOT.calls.slice(n0).filter(c => c.includes('volume_percent=')).map(c => +c.split('=')[1]), iP = SPOT.calls.slice(n0).indexOf('PUT /v1/me/player/pause');
    const v0 = vols[0] ? Math.round(vols[0] / 0.8) : 0, fadeOk = vols.length >= 6 && vols.slice(0, 5).every((v, i, a) => !i || v <= a[i - 1]) && vols[4] === 0 && iP > 0 && vols[5] === v0 && SPOT.vol === v0;
    RA.beginRun(); await sleep(300); frame(2); const resumed = SPOT.playing, upOk = SPOT.vol === v0;
    // en una sesión: entre bloques sigue la canción del que acaba; el bloque siguiente, si trae la misma, la sigue, y si
    // trae otra, la que sonaba se apaga poco a poco y la nueva entra subiendo
    SPOT.playing = true; await RA.spRefresh(); const m1 = [{ uri: 'spotify:track:A1' }], m2 = [{ uri: 'spotify:track:B2' }];
    RA.spBlockMusic({ music: m1 }); await sleep(300); const n1 = SPOT.calls.length; RA.spBlockMusic({ music: m1 }); await sleep(200); const same = SPOT.playing && !SPOT.calls.slice(n1).some(c => c.startsWith('PUT /v1/me/player/play'));
    const n2 = SPOT.calls.length; RA.spBlockMusic({ music: m2 }); await sleep(400); const cs = SPOT.calls.slice(n2), iPlay = cs.findIndex(c => c.startsWith('PUT /v1/me/player/play')), bv = cs.filter(c => c.includes('volume_percent=')).map(c => +c.split('=')[1]);
    const down = cs.slice(0, iPlay).filter(c => c.includes('volume_percent=')).map(c => +c.split('=')[1]), blockFade = iPlay > 0 && down.length >= 5 && down[down.length - 1] === 0 && SPOT.playing && SPOT.playBody && SPOT.playBody.uris[0] === m2[0].uri && bv[bv.length - 1] > 0 && !cs.includes('PUT /v1/me/player/pause');
    log(`spotify between blocks: same songs keep playing ${same} · other songs → the old one fades ${down.join('→')}, then the new one (${SPOT.playBody && SPOT.playBody.uris[0]}) comes up to ${bv[bv.length - 1]}, no pause`);
    if (!same || !blockFade) errors.push('Spotify: entre bloques, la canción del que acaba debería seguir y, si el siguiente trae otra, fundirse con ella (bajando la vieja y subiendo la nueva, sin pausa)');
    // las canciones del ejercicio (del jugador): al empezar la ronda suenan ellas, al azar; y van en lo que exporta el desarrollador
    RA.exSongsSet([{ uri: 'spotify:track:E1', name: 'E1' }, { uri: 'spotify:track:E2', name: 'E2' }]); RA.beginRun(); await sleep(400); frame(2);
    const exPlay = SPOT.playBody && SPOT.playBody.uris.slice().sort().join(','), exInExport = /track:E1/.test(RA.devExport()), exHtml = /Canciones de/.test(RA.exSongsHTML());
    RA.endRun(true, true); await sleep(300); frame(2); RA.exSongsSet([]); RA.SP.block = null;
    log(`exercise songs: played ${exPlay} · in the developer export ${exInExport} · page ${exHtml}`);
    if (exPlay !== 'spotify:track:E1,spotify:track:E2' || !exInExport || !exHtml) errors.push('canciones del ejercicio: al empezar la ronda deberían sonar ellas (y exportarse con la tabla)');
    Object.assign(RA.SP_FADE, { out: 0, in: 0 }); SPOT.vol = vStart; SPOT.playing = true; await RA.spRefresh();
    log(`spotify between games: paused at the end ${paused} after fading ${vols.slice(0, 6).join('→')} (back to ${SPOT.vol}) · ambience back ${amb} · resumed on the next game ${resumed}, volume back ${upOk}`);
    if (!fadeOk || !upOk) errors.push('Spotify: al acabar, la canción debería apagarse poco a poco (y volver a su volumen) en vez de cortarse');
    if (!paused || !amb || !resumed) errors.push('Spotify: al terminar la partida debería pausarse (y oírse el ambiente) y al empezar otra, seguir sonando');
    RA.exitAll(); frame(2); }
  RA.setSetting('mode', 'walkers'); RA.setSetting('exercise', 'squat');
  RA.startPreview(); frame(2); press('Sonido'); frame(1); press('Pausa'); await sleep(20); frame(2); log('after Pausa: playing', SPOT.playing, 'button', RA.activeWidgets().some(w => w.label === 'Play'));
  press('Siguiente'); await sleep(20); press('Vol +'); await sleep(320); await RA.spRefresh(); frame(2);
  log('after next/vol:', RA.spNowText());
  for (const c of ['PUT /v1/me/player/pause', 'POST /v1/me/player/next', 'PUT /v1/me/player/volume?volume_percent=60']) if (!SPOT.calls.includes(c)) errors.push('Spotify: falta la llamada ' + c);
  // volumen: pulsaciones seguidas no se pierden aunque Spotify tarde en reflejarlas, y un 0 falso del reproductor no silencia
  { press('Vol +'); press('Vol +'); press('Vol +'); frame(1); await sleep(320); log('three quick Vol +: spotify volume', SPOT.vol);
    if (SPOT.vol !== 90) errors.push(`Spotify: tres «Vol +» seguidos deberían dejar 90 (${SPOT.vol})`);
    RA.SP.volT = 0; SPOT.vol = 0; await RA.spRefresh(); press('Vol −'); await sleep(320); log('device reports 0, Vol − →', SPOT.vol);
    if (SPOT.vol !== 80) errors.push(`Spotify: con un 0 falso del reproductor, «Vol −» debería dejar 80 (${SPOT.vol})`); }
  RA.SP.cfg.access = 'caducado'; const tc = SPOT.tokenCalls; await RA.spRefresh(); log('expired token refreshed', SPOT.tokenCalls === tc + 1, RA.spNowText());
  if (SPOT.tokenCalls !== tc + 1 || RA.SP.err) errors.push('Spotify: no renueva el token caducado');
  // el juego como reproductor (Web Playback SDK): al pulsar Play, la música pasa a las gafas en vez de sonar en el móvil
  { let src = ''; global.document.head = { appendChild(sc) { src = sc.src; } };
    global.Spotify = { Player: class { constructor(o) { this.o = o; this.l = {}; } addListener(e, f) { this.l[e] = f; } connect() { setTimeout(() => this.l.ready({ device_id: 'quest-sdk' }), 0); return Promise.resolve(true); } activateElement() {} } };
    RA.SPP.state = ''; RA.spPlayerInit(); global.onSpotifyWebPlaybackSDKReady(); await sleep(10);
    SPOT.playing = false; SPOT.device = 'phone'; await RA.spRefresh(); RA.spToggle(); await sleep(30); await RA.spRefresh();
    log(`spotify player in the game: sdk ${/sdk\.scdn\.co/.test(src)} · ready ${RA.SPP.state} ${RA.SPP.id} · after Play the music is on ${SPOT.device} (playing ${SPOT.playing}) · ${RA.spNowText()}`);
    if (!/sdk\.scdn\.co/.test(src) || RA.SPP.state !== 'ready' || SPOT.device !== 'quest-sdk' || !SPOT.playing) errors.push('Spotify: al pulsar Play la música no pasa al reproductor de las gafas');
    // en las gafas, el volumen se cambia en su propio reproductor (sin pasar por la Web API)
    let sdkVol = null; RA.SPP.player.setVolume = v => { sdkVol = v; return Promise.resolve(); }; const n0 = SPOT.calls.length; RA.SP.volT = 0;
    RA.spVol(-10); await sleep(320); log('volume in the glasses: sdk setVolume', sdkVol, 'web api calls', SPOT.calls.slice(n0).filter(c => /volume/.test(c)).length);
    if (sdkVol !== 0.7 || SPOT.calls.slice(n0).some(c => /volume/.test(c))) errors.push(`Spotify: en las gafas el volumen debería ir al reproductor (${sdkVol})`);
    delete global.document.head; delete global.Spotify; SPOT.device = null; RA.SPP.state = ''; RA.SPP.id = ''; }
  // tus listas: Play (la primera vez) pone las elegidas; varias, sus canciones mezcladas
  { const mine = await RA.spMyLists(); RA.SP.cfg.lists = [mine[0]]; RA.SP.started = false; SPOT.playing = false; await RA.spRefresh(); RA.spToggle(); await sleep(30);
    const one = SPOT.playBody && SPOT.playBody.context_uri; RA.SP.cfg.lists = mine; await RA.spPlayLists(); const many = SPOT.playBody && SPOT.playBody.uris || [];
    log(`spotify lists: ${mine.map(l => l.name).join(', ')} · Play with one → ${one} · with two → ${many.length} tracks from ${new Set(many.map(u => u.split(':')[2].split('-')[0])).size} lists`);
    if (one !== 'spotify:playlist:pl1' || many.length !== 6 || new Set(many.map(u => u.split(':')[2].split('-')[0])).size !== 2) errors.push('Spotify: no pone las listas elegidas');
    RA.SP.cfg.lists = []; }
  // con Spotify sonando, el sonido ambiente se calla del todo; en pausa vuelve
  { RA.setSetting('ambient', 60); SPOT.playing = true; await RA.spRefresh(); RA.spTick(0.016); const on = RA.AUD.amb.gain.value;
    SPOT.playing = false; await RA.spRefresh(); RA.spTick(0.016); const off = RA.AUD.amb.gain.value;
    log('ambient with Spotify playing', on, '· paused', off); if (on !== 0 || Math.abs(off - 0.6) > 1e-6) errors.push('con Spotify sonando el sonido ambiente debería estar a 0 %'); }
  // ritmo de Spotify: la Web API ya no lo da (404 aquí) y se pregunta a Deezer (JSONP): por ISRC no lo sabe, buscando sí
  { const urls = []; global.document.head = { appendChild(sc) { const u = sc.src; urls.push(u); const cb = /callback=([^&]+)/.exec(u)[1]; setTimeout(() => global[cb](u.includes('isrc:') ? { bpm: 0 } : u.includes('/search') ? { data: [{ id: 42 }] } : { id: 42, bpm: 128.4 }), 0); } };
    RA.setSetting('mode', 'touch'); RA.setSetting('exercise', 'squat'); RA.setSetting('bpm', 0); SPOT.playing = true; await RA.spRefresh();
    RA.startPreview(); frame(2); press('Sonido'); frame(1); press('Ritmo de cada canción'); await sleep(40); frame(1);
    log('spotify tempo via deezer:', RA.settings.bpm, 'BPM · auto', RA.SP.cfg.autoBpm, '· asked', urls.map(u => u.replace(/[?&]output.*/, '').replace('https://api.deezer.com', '')).join(' , '));
    if (RA.settings.bpm !== 128 || !RA.SP.cfg.autoBpm) errors.push('Ritmo de Spotify: no saca el ritmo de la canción (Deezer)');
    SPOT.track = 'Otra canción'; await RA.spRefresh(); await sleep(40); log('next song: tempo asked again', urls.length > 3);
    if (urls.length <= 3) errors.push('Ritmo de Spotify: al cambiar de canción no se busca su ritmo');
    RA.SP.cfg.autoBpm = false; RA.setSetting('bpm', 0); SPOT.playing = false; delete global.document.head; RA.exitAll(); frame(1); }
  SPOT.noDevice = true; await RA.spRefresh(); RA.spToggle(); await sleep(600); log('no device:', RA.spNowText());
  if (!/pon algo a sonar/.test(RA.spNowText())) errors.push('Spotify: sin reproductor no avisa');
  SPOT.noDevice = false; RA.exitAll(); frame(1);

  console.warn = origWarn;
  // ---- Menú en la muñeca izquierda: sale al mirarla, se pulsa con el índice derecho y se recoge ----
  RA.setSetting('menuWhere', 'wrist'); RA.setSetting('wristDist', 55); RA.setSetting('mode', 'walkers'); RA.setSetting('exercise', 'squat');
  XRS.headY = 1.7; await RA.startXR(false); await sleep(700); for (let i = 0; i < 8; i++) { frame(5, 16, xrFrame); if (process.env.DBG) log('WM', RA.WM.e.toFixed(2), RA.WM.on, RA.WM.near, !!RA.menu, RA.settings.wristDist, RA.menu && RA.menu.group.scale.x, RA.menu && RA.menu.wrist); }
  {
    const m = RA.menu, g = m.group, hd = Math.hypot(g.position.x, g.position.z), V = THREE.Vector3;
    // derecho (sin ladearse) y de cara a ti: su eje x, horizontal; su normal, hacia los ojos
    const level = () => { const q = RA.menu.group.quaternion, x = new V(1, 0, 0).applyQuaternion(q), n = new V(0, 0, 1).applyQuaternion(q), to = new V(0, 1.7, 0).sub(RA.menu.group.position).normalize(); return { roll: Math.abs(x.y), face: n.dot(to) }; };
    const L0 = level();
    log('wrist menu: on wrist', m.wrist, 'opens by itself', g.visible && RA.WM.on, 'scale', g.scale.x.toFixed(2), 'horizontal distance to eyes', hd.toFixed(2), 'stand', RA.stand.visible, 'roll', L0.roll.toFixed(3), 'faces eyes', L0.face.toFixed(2));
    if (!m.wrist || !g.visible || Math.abs(g.scale.x - 0.46 * 55 / 45) > 0.01 || Math.abs(hd - 0.55) > 0.03 || RA.stand.visible) errors.push('el menú de muñeca no queda a la distancia elegida');
    if (L0.roll > 0.01 || L0.face < 0.98) errors.push('el menú de muñeca no sale derecho y de cara a ti');
    RA.setSetting('wristDist', 75); frame(60, 16, xrFrame); const hd2 = Math.hypot(RA.menu.group.position.x, RA.menu.group.position.z);
    log('wrist menu at 75 cm:', hd2.toFixed(2)); if (Math.abs(hd2 - 0.75) > 0.03) errors.push('cambiar la distancia del menú de muñeca no lo aleja');
    // con la cabeza ladeada 25°, sale igual de derecho
    XRS.headQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.44, 'YXZ')); RA.setSetting('wristDist', 55); frame(60, 16, xrFrame);
    const L1 = level(); XRS.headQ = null; frame(2, 16, xrFrame);
    log('wrist menu with the head tilted 25°: roll', L1.roll.toFixed(3)); if (L1.roll > 0.01) errors.push('el menú de muñeca se ladea con la cabeza');
    const w = RA.activeWidgets().find(w => /^Ajustes/.test(w.label)), wp = new V(), wn = new V(0, 0, 1);
    w.mesh.getWorldPosition(wp); wn.copy(w.mesh.localToWorld(new V(0, 0, 1))).sub(wp).normalize();
    const top0 = RA.WM.top.clone();
    for (const d of [0.08, 0.05, 0.03, 0.015, 0.0, -0.01]) { XRS.tip = wp.clone().addScaledVector(wn, d); frame(2, 16, xrFrame); }
    XRS.tip = null; frame(2, 16, xrFrame);
    const pressed = RA.activeWidgets().some(x => /Volver/.test(x.label)), kept = RA.WM.top.distanceTo(top0) < 0.002 && RA.menu.group.visible;
    log('wrist menu poke with right index → settings opened', pressed, 'top edge kept in place', kept);
    if (!pressed) errors.push('el panel de la muñeca no se puede pulsar con el índice derecho');
    if (!kept) errors.push('el submenú de la muñeca no sale en el mismo sitio');
    // con una mano izquierda de verdad: el panel ya no sigue a la mano; ningún gesto lo cierra, solo «✕ Cerrar»; solo MENÚ lo vuelve a abrir
    { const p0 = new V(-0.15, 1.3, -0.32), toFace = new V(0, 1.7, 0).sub(p0).normalize();
      const pose = (p, n, fist) => { XRS.left = { p, n, f: new V(0.3, 0.6, -0.75), fist }; };
      const pressWatch = async () => { frame(30, 16, xrFrame); await sleep(500); if (!RA.watch.mesh.visible) return false; const p = RA.watch.mesh.getWorldPosition(new V()), n = RA.watch.mesh.getWorldDirection(new V()); for (const d of [0.04, 0.02, 0.0, -0.012]) { XRS.tip = p.clone().addScaledVector(n, d); frame(2, 16, xrFrame); } XRS.tip = null; frame(30, 16, xrFrame); return true; };
      const pressClose = async () => { await sleep(300); const w = RA.activeWidgets().find(x => /Cerrar/.test(x.label)); if (!w) return false; const p = w.mesh.getWorldPosition(new V()), n = w.mesh.localToWorld(new V(0, 0, 1)).sub(p).normalize();
        for (const d of [0.05, 0.03, 0.015, 0.0, -0.012]) { XRS.tip = p.clone().addScaledVector(n, d); frame(2, 16, xrFrame); } XRS.tip = null; frame(30, 16, xrFrame); return true; };
      const g0 = RA.menu.group.position.clone();
      pose(p0.clone(), toFace, false); frame(40, 16, xrFrame); const open1 = RA.menu.group.visible && RA.WM.e > 0.9;
      let worst = 0; for (let i = 0; i < 40; i++) { pose(p0.clone().add(new V(Math.sin(i * 2.1), Math.cos(i * 1.7), Math.sin(i * 1.3)).multiplyScalar(0.003)), toFace, false); frame(1, 16, xrFrame); worst = Math.max(worst, RA.menu.group.position.distanceTo(g0)); }
      const ahead = p0.clone().add(new V(0.1, -0.2, -0.15)); pose(ahead, new V(0, 1.7, 0).sub(ahead).normalize(), false); frame(30, 16, xrFrame);
      const still = RA.menu.group.position.distanceTo(g0);
      XRS.left = null; XRS.noLeft = true; frame(60, 16, xrFrame); const noHand = RA.menu.group.visible; XRS.noLeft = false;
      pose(p0.clone(), new V(0.05, -1, 0.1), false); frame(12, 16, xrFrame); const palmDown = RA.menu.group.visible;
      pose(p0.clone(), toFace, true); frame(12, 16, xrFrame); const fist = RA.menu.group.visible;
      pose(p0.clone(), toFace, false); frame(10, 16, xrFrame);
      const closeBtn = await pressClose(); frame(20, 16, xrFrame); const closed = !RA.menu.group.visible;
      frame(40, 16, xrFrame); const stays = !RA.menu.group.visible;
      const watchOk = await pressWatch(), back = RA.menu.group.visible && RA.WM.e > 0.9;
      log(`wrist menu with a real hand: open ${open1} · moves ${(worst * 1000).toFixed(1)} mm with hand jitter, ${(still * 100).toFixed(1)} cm when the hand moves 25 cm, stays without the hand ${noHand} · stays open with the palm down ${palmDown} and with a fist ${fist} · «✕ Cerrar» ${closeBtn} closes ${closed}, stays closed looking at the wrist ${stays} · MENÚ button shown ${watchOk}, reopens ${back}`);
      if (!open1) errors.push('menú de muñeca: no está abierto');
      if (worst > 0.0005 || still > 0.001 || !noHand) errors.push('menú de muñeca: debería quedarse quieto delante aunque muevas o bajes la mano');
      if (!palmDown || !fist) errors.push('menú de muñeca: ningún gesto de la mano debería cerrarlo (solo «✕ Cerrar»)');
      if (!closeBtn || !closed || !stays) errors.push('menú de muñeca: «✕ Cerrar» debería cerrarlo (y no volver solo al mirar la muñeca)');
      if (!watchOk || !back) errors.push('menú de muñeca: cerrado, el botón MENÚ de la muñeca debería volver a abrirlo');
      XRS.left = null; frame(10, 16, xrFrame); }
    // girado de espaldas, el botón lo trae delante otra vez
    XRS.headQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0, 'YXZ')); frame(20, 16, xrFrame);
    const far = RA.wristFar(); RA.onWatch(); frame(40, 16, xrFrame); const gp = RA.menu.group.position;
    log('turned around: panel out of sight', far, '→ MENÚ brings it to z =', gp.z.toFixed(2)); XRS.headQ = null;
    if (!far || !(gp.z > 0.4) || !RA.menu.group.visible) errors.push('menú de muñeca: girado de espaldas, el botón debería traerlo delante');
    frame(20, 16, xrFrame);
    // ---- Los avisos de la vista no se ladean con la cabeza (de pie): ni el del centro, ni PERFECTA, ni la caricatura ----
    { const roll = m => Math.abs(new V(1, 0, 0).applyQuaternion(m.quaternion).y); // (están sueltos en la escena)
      XRS.headQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, 0.3, 0.44, 'YXZ')); RA.beginRun(); frame(20, 16, xrFrame);
      const c = RA.center.mesh.visible ? roll(RA.center.mesh) : -1; const tz = RA.settings.toasts; RA.setSetting('toasts', 1); RA.showToast('PERFECTA', '#ffd166', 2); RA.setSetting('toasts', tz); frame(1, 16, xrFrame);
      const t = RA.toastP.mesh.visible ? roll(RA.toastP.mesh) : -1, d = RA.DEMOV ? roll(RA.DEMOV.head) : 0;
      XRS.headQ = null;
      log(`notices with the head tilted 25° (standing): centre roll ${c.toFixed(3)} · toast roll ${t.toFixed(3)} · demo roll ${d.toFixed(3)}`);
      if (!(c >= 0 && c < 0.01) || !(t >= 0 && t < 0.01) || d > 0.01) errors.push('los avisos de la vista se ladean con la cabeza (de pie deberían ir siempre derechos)');
      RA.lobbyMenu(); frame(20, 16, xrFrame); }
    // ---- En plancha (mirando al suelo): los avisos, de cara a los ojos y con lo de arriba hacia la cabeza; ladearla no los gira ----
    { const ex0 = RA.settings.exercise; RA.setSetting('exercise', 'pushup'); RA.lobbyMenu(); frame(3, 16, xrFrame);
      XRS.headQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.1, 0, 0, 'YXZ')); frame(5, 16, xrFrame);
      let q = RA.viewQ(); const up0 = new V(0, 1, 0).applyQuaternion(q), n0 = new V(0, 0, 1).applyQuaternion(q);
      XRS.headQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.1, 0, 0.45, 'YXZ')); frame(3, 16, xrFrame); q = RA.viewQ(); const up1 = new V(0, 1, 0).applyQuaternion(q);
      XRS.headQ = null; frame(5, 16, xrFrame); RA.setSetting('exercise', ex0);
      log(`notices in plank: text up ${up0.x.toFixed(2)},${up0.y.toFixed(2)},${up0.z.toFixed(2)} (toward the head: -z) · faces the eyes ${n0.y.toFixed(2)} · after tilting the head ${up1.x.toFixed(2)},${up1.y.toFixed(2)},${up1.z.toFixed(2)}`);
      if (!(up0.z < -0.9) || !(n0.y > 0.9) || up1.distanceTo(up0) > 0.05) errors.push('en plancha, los avisos deberían salir de cara a los ojos, con lo de arriba hacia la cabeza, y no girar al ladearla'); }
    // ---- Ya calibrado, los avisos de la partida salen en un sitio fijo: no siguen a la cabeza ----
    { XRS.headQ = null; RA.beginRun(); frame(200, 16, xrFrame); const st = RA.state, tz = RA.settings.toasts; RA.setSetting('toasts', 1);
      RA.showToast('COMBO ×10', '#ffd166', 3); frame(2, 16, xrFrame); const p0 = RA.toastP.mesh.position.clone();
      XRS.headQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 1.1, 0, 'YXZ')); frame(90, 16, xrFrame);
      RA.showToast('¡PERFECTA!', '#3cf0c6', 3); frame(30, 16, xrFrame); const p1 = RA.toastP.mesh.position.clone(); RA.setSetting('toasts', tz); XRS.headQ = null;
      log(`game notices after calibrating (${st}): toast moved ${(p0.distanceTo(p1) * 100).toFixed(1)} cm after turning the head 63°`);
      if (!['ready', 'play'].includes(st) || p0.distanceTo(p1) > 0.03) errors.push('avisos de la partida: ya calibrado deberían salir siempre en el mismo sitio, sin seguir a la cabeza');
      RA.lobbyMenu(); frame(20, 16, xrFrame); }
  }
  RA.setSetting('menuWhere', 'stand'); RA.exitAll(); frame(2, 16, xrFrame);
  RA.setSetting('menuWhere', 'wrist');
  // ---- La pulsación que abre un menú no toca el menú nuevo: hay que retirar el dedo antes de pulsar otra vez ----
  { RA.setSetting('menuWhere', 'stand'); XRS.headY = 1.7; await RA.startXR(false); await sleep(700); frame(30, 16, xrFrame); RA.lobbyMenu(); frame(40, 16, xrFrame);
    const at = (w, d) => { const p = w.mesh.getWorldPosition(new THREE.Vector3()), n = w.mesh.localToWorld(new THREE.Vector3(0, 0, 1)).sub(p).normalize(); return p.addScaledVector(n, d); };
    const poke = (w, ds) => { for (const d of ds) { XRS.tip = at(w, d); frame(2, 16, xrFrame); if (process.env.DBG) log('  poke', w.label, d, 'need', RA.POKE.need.right, 'menuH', RA.menuH && RA.menuH.toFixed(2)); } };
    poke(findW('Ajustes'), [0.08, 0.05, 0.03, 0.015, 0.0, -0.01]); const opened = RA.activeWidgets().some(w => w.label === 'Volver');
    const tab = RA.activeWidgets().find(w => w.style === 'tab'), before = JSON.stringify(RA.settings);
    await sleep(500); poke(tab, [-0.01, 0.015, -0.01, 0.015, -0.01]); const sameTab = !RA.activeWidgets().some(w => w.label === tab.label && w.style === 'selected'), same = JSON.stringify(RA.settings) === before;
    poke(tab, [0.06]); await sleep(500); poke(tab, [0.06, 0.03, 0.015, 0.0, -0.01]); const nowTab = RA.activeWidgets().some(w => w.label === tab.label && w.style === 'selected');
    XRS.tip = null; frame(2, 16, xrFrame);
    log(`poke re-arm: settings opened ${opened} · without pulling back, tab ${tab.label} untouched ${sameTab}, settings unchanged ${same} · after pulling back, tab pressed ${nowTab}`);
    if (!opened || !sameTab || !same) errors.push('la pulsación que abre un menú (sin retirar el dedo) no debería tocar el menú nuevo');
    if (!nowTab) errors.push('después de retirar el dedo, la siguiente pulsación debería contar');
    RA.exitAll(); frame(2, 16, xrFrame); RA.setSetting('menuWhere', 'wrist'); }

  // ---- Pistolas en XR con mandos: bláster en cada mano y el gatillo dispara ----
  applyCfg({ mode: 'flyers', exercise: 'squat', pistol: 1, lives: 0, waves: 1, repsWave: 6, rest: 0, flySpeed: 8, squatDepth: 25 });
  XRS.controllers = true; XRS.headY = 1.7; await RA.startXR(false); await sleep(700); frame(20, 16, xrFrame);
  RA.beginRun(); frame(250, 16, xrFrame); log('pistol XR state', RA.state, 'blasters', RA.BLASTERS.left.visible, RA.BLASTERS.right.visible, 'palm hidden', !RA.gloves.left.palm.visible);
  if (!RA.BLASTERS.left.visible || !RA.BLASTERS.right.visible || RA.gloves.left.palm.visible) errors.push('pistolas XR: no se ven los blásters en los mandos');
  { const st0 = RA.state; (RA.renderer.xr.getSession().listeners.selectstart || []).forEach(f => f({ inputSource: { handedness: 'right' } })); frame(2, 16, xrFrame);
    log('pistol XR: trigger (selectstart) state', st0, '→', RA.state); if (RA.state === 'paused') errors.push('pistolas XR: el gatillo abre el menú en vez de solo disparar'); }
  for (let i = 0; i < 2400 && RA.state !== 'end'; i++) { const ph = i % 160; XRS.headY = ph < 70 ? 1.38 : 1.7; XRS.trig = ph > 100 && ph < 104 ? 'right' : ph > 120 && ph < 124 ? 'left' : null; frame(1, 16, xrFrame); }
  log('pistol XR: shots', RA.stats.shots, 'hits', RA.stats.hits, 'kills', RA.stats.kills, 'reps', RA.stats.reps, 'state', RA.state);
  if (RA.stats.shots < 4) errors.push('pistolas XR: el gatillo de los mandos no dispara');
  { const strong = (XRS.haptics || []).filter(h => h[1] >= 0.7).length; log('pistol XR: strong haptic pulses', strong); if (strong < RA.stats.shots - 1) errors.push('pistolas XR: el mando no vibra al disparar'); }
  XRS.controllers = false; XRS.trig = null; RA.setSetting('pistol', 0); RA.exitAll(); frame(2, 16, xrFrame);

  // ---- Mandos como manos (sentadillas, sin pistolas): se ven manos, el rayo sale apuntando y con el gatillo, y gatillo y agarre a la vez son el puño ----
  { applyCfg({ mode: 'combat', exercise: 'squat', aim: 'hands', foesGate: 'robot', foesFly: 'drone', lives: 0, waves: 1, repsWave: 30, rest: 0, walkTime: 3, squatDepth: 25, padHands: 1, guard: 'full' });
    XRS.controllers = true; XRS.headY = 1.7; XRS.ctrl = null; await RA.startXR(false); await sleep(700); frame(20, 16, xrFrame);
    RA.beginRun(); frame(250, 16, xrFrame);
    const G = RA.gloves.right, vis = RA.hands.right.virt && G.seg.count > 0 && G.palm.visible && !G.pad.visible;
    const st0 = RA.state; (RA.renderer.xr.getSession().listeners.selectstart || []).forEach(f => f({ inputSource: { handedness: 'right' } })); frame(2, 16, xrFrame); const noPause = RA.state !== 'paused';
    // el puño: con el gatillo y el agarre, los dedos se doblan (la punta del índice se acerca a la palma)
    const tipOpen = RA.hands.right.J[9].p.distanceTo(RA.hands.right.J[0].p); XRS.trig = 'right'; XRS.squeeze = 'right'; frame(15, 16, xrFrame); const tipFist = RA.hands.right.J[9].p.distanceTo(RA.hands.right.J[0].p); XRS.trig = null; XRS.squeeze = null; frame(15, 16, xrFrame);
    // una sentadilla carga; apuntar con el mando derecho a un enemigo y el gatillo lanza el rayo
    for (let i = 0; i < 600 && !RA.enemies.some(e => e.alive && (e.out || e.type === 'flyer')); i++) frame(1, 16, xrFrame);
    XRS.headY = 1.36; frame(60, 16, xrFrame); XRS.headY = 1.7; frame(30, 16, xrFrame);
    const e = RA.enemies.find(x => x.alive && (x.out || x.type === 'flyer')), charged = !!(RA.HTH.right.c); let shot = false;
    if (e) { const V = THREE.Vector3, p = new V(0.2, 1.3, -0.3), c = RA.arena.localToWorld(e.center(new V()).clone()), d = c.clone().sub(p).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new V(0, 0, -1), d);
      XRS.ctrl = { right: { p, q } }; frame(5, 16, xrFrame); const s0 = RA.stats.shots; XRS.trig = 'right'; frame(3, 16, xrFrame); XRS.trig = null; frame(12, 16, xrFrame); shot = RA.stats.shots > s0; }
    // el escudo: puño (gatillo y agarre) delante del pecho
    XRS.ctrl = { left: { p: new THREE.Vector3(-0.05, 1.45, -0.3), q: new THREE.Quaternion() } }; XRS.trig = 'left'; XRS.squeeze = 'left'; frame(10, 16, xrFrame); const guard = RA.GUARD.up === 'fist'; XRS.trig = null; XRS.squeeze = null; frame(5, 16, xrFrame);
    log(`pad hands XR: hands seen ${vis} · trigger does not pause ${noPause} (${st0} → ${RA.state}) · fist curls the fingers ${tipOpen.toFixed(3)} → ${tipFist.toFixed(3)} m · charged ${charged} · aim + trigger shoots ${shot} · fist in front of the chest = shield ${guard}`);
    if (!vis) errors.push('mandos como manos: con los mandos en sentadillas debería verse una mano, no el mando');
    if (!noPause) errors.push('mandos como manos: el gatillo no debería abrir la pausa (lanza el rayo)');
    if (!(tipFist < tipOpen - 0.03)) errors.push('mandos como manos: gatillo y agarre deberían cerrar el puño');
    if (!charged || !shot) errors.push('mandos como manos: apuntar con la mano y apretar el gatillo debería lanzar el rayo cargado');
    if (!guard) errors.push('mandos como manos: el puño delante del pecho debería sacar el escudo');
    XRS.ctrl = null; XRS.controllers = false; XRS.trig = null; XRS.squeeze = null; RA.setSetting('guard', 'off'); RA.exitAll(); frame(2, 16, xrFrame); }

  // ---- Espadas en XR con mandos ----
  // La hoja sale del agarre por −Z: para un tajo se coloca el mando de modo que la hoja apunte a `center` y se barre en `sweep`
  const _Z = new THREE.Vector3(0, 0, -1);
  const holdSword = (side, center, bladeDir, sweep, s) => { const p = center.clone().addScaledVector(bladeDir, -0.55).addScaledVector(sweep, s); XRS.ctrl = XRS.ctrl || {}; XRS.ctrl[side] = { p, q: new THREE.Quaternion().setFromUnitVectors(_Z, bladeDir.clone().normalize()) }; };
  const restSword = side => holdSword(side, new THREE.Vector3(side === 'left' ? -0.3 : 0.3, 1.0, -0.6), new THREE.Vector3(0, -0.3, -1).normalize(), new THREE.Vector3(1, 0, 0), 0);
  const swingAt = (side, c, n = 8) => { const to = c.clone().sub(new THREE.Vector3(0, c.y, 0)); to.y = 0; to.normalize(); const sw = new THREE.Vector3(to.z, 0, -to.x); for (let k = 0; k <= n; k++) { holdSword(side, c, to, sw, -0.45 + 0.9 * k / n); frame(1, 16, xrFrame); } };
  for (const [name, kind, charge, block] of [['metálica con carga', 'metal', true, 0], ['láser sin cargar', 'laser', false, 0], ['metálica bloqueando', 'metal', true, 1]]) {
    const reps_ = block ? 12 : 6;
    applyCfg({ mode: 'walkers', aim: 'hands', exercise: 'squat', sword: 'one', swordHand: 'right', swordKind: kind, swordBlock: block, swordSpeed: 1.6, pistol: 0, lives: 0, waves: 1, repsWave: reps_, rest: 0, walkTime: 6, maxAlive: 2, spawnGap: 1, squatDepth: 25 });
    XRS.controllers = true; XRS.haptics = []; XRS.headY = 1.7; restSword('right'); restSword('left'); await RA.startXR(false); await sleep(700); frame(20, 16, xrFrame);
    RA.beginRun(); frame(250, 16, xrFrame);
    const vis = RA.SWD.s.right.g.visible && !RA.SWD.s.left.g.visible && !RA.gloves.right.palm.visible;
    let parries = 0, wasStun = new Set(), squats = 0, aimSeen = false;
    let swingCool = 0;
    for (let i = 0; i < 3600 && RA.state !== 'end'; i++) {
      const ph = i % 150; let crouch = charge && ph < 60; swingCool--;
      const R = RA.enemies.filter(e => e.alive && e.type === 'robot' && e.state !== 'emerge');
      for (const e of R) if (e.stunT > 0 && !wasStun.has(e)) { wasStun.add(e); parries++; }
      const w = block && R.find(e => e.zone && e.state === 'windup' && e.st > 0.3);
      if (w) { // bloqueo: la hoja en la marca, agachado si es medio o bajo
        crouch = w.zone !== 'high'; XRS.headY = crouch ? (w.zone === 'low' ? 1.32 : 1.45) : 1.7; frame(1, 16, xrFrame);
        const p = RA.blockPoint(w, new THREE.Vector3()); holdSword('right', p, new THREE.Vector3(1, 0, -0.2).normalize(), new THREE.Vector3(0, 1, 0), 0); frame(1, 16, xrFrame); continue;
      }
      XRS.headY = crouch ? 1.38 : 1.7;
      const near = R.find(e => Math.hypot(e.pos.x, e.pos.z) < 1.7);
      if (near && !crouch && swingCool <= 0 && (block ? near.stunT > 0 : !charge || RA.SWD.perf.length)) { swingCool = 30; const c = RA.arena.localToWorld(new THREE.Vector3(near.pos.x, 1.2, near.pos.z)); swingAt('right', c); restSword('right'); continue; }
      restSword('right'); frame(1, 16, xrFrame); if (Object.values(RA.locks).some(l => l.visible) || RA.lasers.left.visible || RA.lasers.right.visible) aimSeen = true;
    }
    if (aimSeen) errors.push(`espada XR (${name}): con espada no debería verse la diana ni el láser`);
    const strong = XRS.haptics.filter(h => h[0] === 'right' && h[1] >= 0.45).length, any = XRS.haptics.filter(h => h[0] === 'right').length;
    log(`sword XR ${name}: visible ${vis} state ${RA.state} reps ${RA.stats.reps} kills ${RA.stats.kills} hits ${RA.stats.hits} taken ${RA.stats.taken} parries ${parries} haptics strong ${strong} any ${any}`);
    if (!vis) errors.push(`espada XR (${name}): no se ve la espada en la mano derecha`);
    if (charge && !block && (RA.state !== 'end' || RA.stats.kills < 2)) errors.push(`espada XR (${name}): los tajos cargados no derriban robots`);
    if (!charge && RA.stats.kills) errors.push(`espada XR (${name}): sin cargar con sentadillas no debería hacer daño`);
    if (!charge && !any) errors.push(`espada XR (${name}): el mando no vibra al chocar la hoja`);
    if (charge && !block && !strong) errors.push(`espada XR (${name}): el mando no vibra al golpear`);
    if (block && (parries < 2 || RA.stats.kills < 1)) errors.push(`espada XR (${name}): no se paran los golpes con la espada o no hay contraataque`);
    RA.exitAll(); frame(2, 16, xrFrame);
  }
  // espada en una mano y bláster en la otra; o dos espadas
  for (const [sw, pis] of [['one', 1], ['two', 0]]) {
    applyCfg({ mode: 'walkers', exercise: 'squat', sword: sw, swordHand: 'right', pistol: pis, lives: 0, waves: 1, repsWave: 6 });
    XRS.controllers = true; XRS.headY = 1.7; restSword('right'); restSword('left'); await RA.startXR(false); await sleep(700); frame(20, 16, xrFrame);
    RA.beginRun(); frame(250, 16, xrFrame); const a0 = RA.GUN.ammo, c0 = RA.SWD.perf.length; XRS.headY = 1.38; frame(60, 16, xrFrame); XRS.headY = 1.7; frame(60, 16, xrFrame);
    const L = RA.SWD.s.left.g.visible, Rv = RA.SWD.s.right.g.visible, bl = RA.BLASTERS.left.visible, br = RA.BLASTERS.right.visible;
    log(`swords ${sw}${pis ? ' + blaster' : ''}: left sword ${L} right sword ${Rv} left blaster ${bl} right blaster ${br} · squat → charge ${c0}→${RA.SWD.perf.length} ammo ${a0}→${RA.GUN.ammo}`);
    if (sw === 'one' ? (L || !Rv || !bl || br || RA.GUN.ammo <= a0) : (!L || !Rv)) errors.push(`espadas (${sw}${pis ? ' y bláster' : ''}): no se reparten bien las manos`);
    if (RA.SWD.perf.length <= c0) errors.push('espadas: la sentadilla no carga la hoja');
    RA.exitAll(); frame(2, 16, xrFrame);
  }
  RA.setSetting('pistol', 0);
  // Toques con espada: bloques que se cortan en la dirección de su flecha, en la postura que piden
  for (const [name, mode, want] of [['bien', 'ok', 6], ['al revés de la flecha', 'reverse', 0], ['sin agacharse ni inclinarse', 'pose', 0], ['con una estocada recta', 'stab', 0]]) {
    applyCfg({ mode: 'touch', exercise: 'slam', sword: 'one', swordHand: 'right', swordKind: 'laser', swordSpeed: 1.6, tchHands: 100, lives: 0, waves: 1, repsWave: 6, tchArrive: 2, tchGap: 4.5, tchWindow: 2, squatDepth: 25 }); // bloques espaciados: al barrer no hay otro cerca (también valen de camino, y se cortaría ese)
    XRS.controllers = true; XRS.haptics = []; XRS.headY = 1.7; XRS.headX = 0; restSword('right'); restSword('left'); await RA.startXR(false); await sleep(700); frame(20, 16, xrFrame);
    RA.beginRun(); frame(250, 16, xrFrame);
    const moves = new Set(); let maxDeb = 0, deb0 = RA.debris.length; // la base baja si desaparecen restos de antes
    // si al revés se cuela un corte, dice en qué fase del movimiento (preparar, barrido, retirada, espera) para cazarlo
    const FR = (ph, t) => { const r0 = RA.stats.reps; frame(1, 16, xrFrame); deb0 = Math.min(deb0, RA.debris.length); maxDeb = Math.max(maxDeb, RA.debris.length - deb0); if (mode === 'reverse' && RA.stats.reps > r0) log('REVCUT', ph, t && t.move, 'vel', ['x', 'y', 'z'].map(k => RA.SWD.s.right.vel[k].toFixed(2)).join(','), 'cutDir', t && ['x', 'y', 'z'].map(k => t.cutDir[k].toFixed(2)).join(','), 'normal', t && ['x', 'y', 'z'].map(k => t.normal[k].toFixed(2)).join(','), 'arenaYaw', RA.arena.rotation.y.toFixed(3), RA.touches.filter(x => x.alive && x.part === 'cut').map(x => x.mode + (x === t ? '*' : '') + ':' + [x.pos.x, x.pos.y, x.pos.z].map(v => v.toFixed(2)).join(',')).join(' ')); };
    for (let i = 0; i < 3000 && RA.state !== 'end'; i++) {
      const t = RA.touches.find(x => x.alive && !x.judged && x.part === 'cut' && x.mode === 'wait');
      XRS.headY = 1.7; XRS.headX = 0; XRS.headZ = 0;
      if (t) {
        moves.add(t.move);
        if (mode !== 'pose') { if (t.move === 'cutLow') XRS.headY = 1.48; if (t.move === 'cutSide') XRS.headX = Math.sign(t.pos.x) * 0.16; if (t.move === 'cutFwd') XRS.headZ = -0.22; if (t.move === 'cutHigh') XRS.headY = 1.7 + RA.settings.jumpHeight / 100 * 0.7 + 0.03; }
        frame(1, 16, xrFrame);
        const c = RA.arena.localToWorld(t.pos.clone()), dir = t.normal.clone().negate(), sw = t.cutDir.clone().multiplyScalar(mode === 'reverse' ? -1 : 1);
        holdSword('right', c.clone().addScaledVector(t.normal, 1.5), dir, sw, -0.3); FR('prep', t); // se prepara delante, lejos del bloque (al venir de la retirada, la hoja se mueve en la dirección de la flecha)
        if (mode === 'stab') for (let k = 0; k <= 6; k++) { holdSword('right', c.clone().addScaledVector(t.normal, 0.6 - 0.9 * k / 6), dir, sw, 0); FR('stab', t); }
        else for (let k = 0; k <= 6; k++) { holdSword('right', c, dir, sw, -0.3 + 0.6 * k / 6); FR('sweep' + k, t); }
        holdSword('right', c.clone().addScaledVector(t.normal, 1.5), dir, sw, 0.3); FR('retreat', t); // retira la hoja hacia ti, sin volver a pasar por el bloque
        for (let k = 0; k < 20; k++) FR('wait' + k, t); continue; // la hoja se queda retirada hasta el siguiente
      }
      FR('idle', null); deb0 = Math.min(deb0, RA.debris.length); maxDeb = Math.max(maxDeb, RA.debris.length - deb0);
    }
    const hits = XRS.haptics.filter(h => h[0] === 'right' && h[1] >= 0.7 && h[2] === 60).length;
    log(`sword touch ${name}: cuts ${RA.stats.reps} misses ${RA.stats.taken} moves ${[...moves].join(',')} halves ${maxDeb} slice haptics ${hits}`);
    if (RA.stats.reps !== want) errors.push(`Toques con espada (${name}): ${RA.stats.reps} cortes (deberían ser ${want})`);
    if (want && (maxDeb < 2 || hits < want)) errors.push(`Toques con espada (${name}): faltan mitades o vibración`); // los tipos de bloque salen al azar: a veces todos iguales
    RA.exitAll(); frame(2, 16, xrFrame);
  }
  XRS.headX = 0;
  XRS.ctrl = null; XRS.controllers = false; RA.setSetting('sword', 'off');

  // ---- Toques en XR: abdominales boca arriba; el entorno mira hacia los pies y la cabeza alcanza los aros ----
  applyCfg({ mode: 'touch', exercise: 'abs', absMoves: 'crunch,twist,knee', lives: 0, waves: 1, repsWave: 5, tchHands: 0, tchArrive: 2, tchGap: 2.5, tchWindow: 1.5 });
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

  // ---- Press de hombro en XR: por encima de la cabeza las manos se pierden y la repetición cuenta igual ----
  applyCfg({ mode: 'walkers', exercise: 'press', lives: 0, waves: 1, repsWave: 30, rest: 0, walkTime: 20, pressRange: 32 });
  XRS.headY = 1.7; await RA.startXR(false); await sleep(700); frame(20, 16, xrFrame);
  const sh = y => ({ left: new THREE.Vector3(-0.22, y, -0.1), right: new THREE.Vector3(0.22, y, -0.1) });
  RA.beginRun(); XRS.hands = sh(1.55); frame(250, 16, xrFrame); log('press XR calib', RA.state, 'bottom', RA.DET.pr.left.bottom.toFixed(2));
  let prR = RA.stats.reps;
  for (let i = 0; i < 3; i++) { for (let k = 0; k <= 20; k++) { XRS.hands = sh(1.55 + 0.4 * k / 20); frame(2, 16, xrFrame); } for (let k = 20; k >= 0; k--) { XRS.hands = sh(1.55 + 0.4 * k / 20); frame(2, 16, xrFrame); } }
  log('press XR visible: reps', RA.stats.reps - prR); if (RA.stats.reps - prR !== 6) errors.push(`press XR: 3 subidas con las dos manos deberían ser 6 (${RA.stats.reps - prR})`);
  prR = RA.stats.reps;
  for (let i = 0; i < 3; i++) { for (let k = 0; k <= 14; k++) { XRS.hands = sh(1.55 + 0.4 * k / 20); frame(2, 16, xrFrame); } XRS.noHands = true; frame(30, 16, xrFrame); XRS.noHands = false; XRS.hands = sh(1.55); frame(30, 16, xrFrame); }
  log('press XR lost overhead: reps', RA.stats.reps - prR); if (RA.stats.reps - prR !== 6) errors.push(`press XR: con las manos perdidas arriba deberían ser 6 (${RA.stats.reps - prR})`);
  XRS.hands = null; RA.exitAll(); frame(2, 16, xrFrame);
  // ---- Combate con las manos desnudas: la repetición carga UN rayo y se lanza con el gesto (atrás y adelante deprisa) con
  // cualquier mano; igual con las pistolas activadas (sin mandos no se dispara pellizcando) ----
  for (const [variant, pis] of [['puntería con las manos', 0], ['pistolas sin mandos', 1]]) {
    applyCfg({ mode: 'combat', foes: 'flyers', aim: pis ? 'auto' : 'hands', throwPick: 'hand', exercise: 'squat', lives: 0, waves: 1, repsWave: 14, repsInc: 0, rest: 0, flySpeed: 5, maxAlive: 3, spawnGap: 1, pistol: pis, sword: 'off', squatDepth: 25 });
    const rest = () => ({ left: new THREE.Vector3(-0.25, 1.0, -0.1), right: new THREE.Vector3(0.25, 1.0, -0.1) });
    XRS.controllers = false; XRS.headY = 1.7; XRS.hands = rest(); await RA.startXR(false); await sleep(700); frame(20, 16, xrFrame); RA.beginRun(); frame(250, 16, xrFrame);
    const throwAt = (side, slow) => {
      for (let i = 0; i < 200 && !RA.enemies.some(x => x.alive) && RA.state !== 'end'; i++) frame(1, 16, xrFrame); // hace falta un enemigo al que lanzar
      const e = RA.enemies.find(x => x.alive), back = new THREE.Vector3(side === 'left' ? -0.2 : 0.2, XRS.headY - 0.25, 0);
      XRS.hands[side] = back.clone(); frame(4, 16, xrFrame);
      const d = (e ? e.center(new THREE.Vector3()) : new THREE.Vector3(0, 1.5, -5)).sub(back).normalize(), n = slow ? 50 : 5;
      for (let k = 1; k <= n; k++) { if (e && e.alive && !slow) d.copy(e.center(new THREE.Vector3())).sub(back).normalize(); XRS.hands[side] = back.clone().addScaledVector(d, 0.5 * k / n); frame(1, 16, xrFrame); } // sigue al enemigo
      frame(6, 16, xrFrame); XRS.hands = rest(); frame(2, 16, xrFrame);
    };
    const squat = () => { XRS.headY = 1.38; frame(70, 16, xrFrame); XRS.headY = 1.7; frame(30, 16, xrFrame); };
    const charges = () => (RA.HTH.left.c ? 1 : 0) + (RA.HTH.right.c ? 1 : 0);
    squat(); squat(); const charged = charges(), shots0 = RA.stats.shots; // dos repeticiones sin lanzar: sigue siendo una por mano
    XRS.pinch = 'right'; frame(10, 16, xrFrame); XRS.pinch = null; frame(4, 16, xrFrame); const pinchShots = RA.stats.shots - shots0;
    throwAt('right', true); const slowShots = RA.stats.shots - shots0;
    throwAt('left'); const one = RA.stats.shots - shots0; throwAt('right'); const two = RA.stats.shots - shots0; throwAt('left'); const extra = RA.stats.shots - shots0 - two;
    // sin manos a la vista: la repetición carga las dos manos y no dispara sola; una sacudida que no va hacia ningún enemigo
    // no lanza (la carga sigue); una sacudida desde la cadera hacia el enemigo, en plena bajada, sí
    const seen = new Set(); let autoOrbs = 0; const scan = () => RA.projs.forEach(p => { if (p.kind === 'orb' && !seen.has(p)) { seen.add(p); autoOrbs++; } });
    { const s0 = RA.stats.shots; XRS.noHands = true; XRS.headY = 1.38; for (let i = 0; i < 70; i++) { frame(1, 16, xrFrame); scan(); } XRS.headY = 1.7; for (let i = 0; i < 30; i++) { frame(1, 16, xrFrame); scan(); }
      XRS.noHands = false; XRS.hands = rest(); for (let i = 0; i < 10; i++) { frame(1, 16, xrFrame); scan(); } var noHandShots = RA.stats.shots - s0 + autoOrbs, noHandCharges = charges(); }
    { const s0 = RA.stats.shots, back = new THREE.Vector3(0.2, XRS.headY - 0.25, 0);
      // hacia el suelo, por el lado más alejado de todos los enemigos (un volador puede bajar mucho)
      const cands = [[0, -0.8, -0.6], [0.6, -0.8, -0.2], [-0.4, -0.8, -0.4], [0.3, -0.9, -0.3], [0.7, -0.7, 0.1]].map(c => new THREE.Vector3(...c).normalize());
      const gap = c => Math.min(Math.PI, ...RA.enemies.filter(x => x.alive).map(x => x.center(new THREE.Vector3()).sub(back).angleTo(c)));
      const d = cands.reduce((a, c) => gap(c) > gap(a) ? c : a);
      XRS.hands.right = back.clone(); frame(4, 16, xrFrame); for (let k = 1; k <= 5; k++) { XRS.hands.right = back.clone().addScaledVector(d, 0.1 * k); frame(1, 16, xrFrame); }
      frame(8, 16, xrFrame); XRS.hands = rest(); frame(4, 16, xrFrame); var floorShots = RA.stats.shots - s0, floorCharges = charges(); }
    { const s0 = RA.stats.shots; XRS.hands.right = new THREE.Vector3(0.25, XRS.headY - 0.75, 0.05); frame(6, 16, xrFrame);
      for (let i = 0; i < 200 && !RA.enemies.some(x => x.alive); i++) frame(1, 16, xrFrame);
      for (let k = 1; k <= 8; k++) { XRS.headY = 1.7 - 0.03 * k; frame(1, 16, xrFrame); } // bajando
      const hip = XRS.hands.right.clone(), e = RA.enemies.find(x => x.alive), d = (e ? e.center(new THREE.Vector3()) : new THREE.Vector3(0, 1.5, -5)).sub(hip).normalize();
      for (let k = 1; k <= 5; k++) { XRS.headY -= 0.03; XRS.hands.right = hip.clone().addScaledVector(d, 0.11 * k); frame(1, 16, xrFrame); }
      frame(8, 16, xrFrame); XRS.headY = 1.7; XRS.hands = rest(); frame(30, 16, xrFrame); var hipShots = RA.stats.shots - s0; }
    log(`throw XR (${variant}): no hands → shots ${noHandShots}, charges kept ${noHandCharges} · flick at the floor → shots ${floorShots}, charges ${floorCharges} · flick from the hip while squatting → shots ${hipShots}`);
    if (noHandShots || noHandCharges !== 2) errors.push(`lanzar con la mano (${variant}): sin manos a la vista no debería dispararse solo, sino quedarse cargado`);
    if (floorShots || floorCharges !== 2) errors.push(`lanzar con la mano (${variant}): una sacudida que no va hacia ningún enemigo no debería lanzar ni gastar la carga`);
    if (hipShots !== 1) errors.push(`lanzar con la mano (${variant}): la sacudida desde la cadera hacia el enemigo, bajando en la sentadilla, debería lanzar`);
    // las gafas pierden la mano en pleno lanzamiento: sale igual
    squat(); for (let i = 0; i < 200 && !RA.enemies.some(x => x.alive); i++) frame(1, 16, xrFrame);
    { const back = new THREE.Vector3(0.2, XRS.headY - 0.25, 0), e = RA.enemies.find(x => x.alive), d = (e ? e.center(new THREE.Vector3()) : new THREE.Vector3(0, 1.5, -5)).sub(back).normalize();
      XRS.hands.right = back.clone(); frame(4, 16, xrFrame); for (let k = 1; k <= 3; k++) { XRS.hands.right = back.clone().addScaledVector(d, 0.1 * k); frame(1, 16, xrFrame); }
      const s0 = RA.stats.shots; XRS.noHands = true; frame(4, 16, xrFrame); XRS.noHands = false; XRS.hands = rest(); frame(4, 16, xrFrame); var lostShot = RA.stats.shots - s0; }
    // sacudidas como las de verdad: desde la guardia (manos adelantadas), en arco, con el temblor del seguimiento, deprisa o
    // despacio (1 m/s), hacia el enemigo esté donde esté, y a veces perdiendo la mano justo al final: deben salir casi todas
    { const jit = () => new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.006); let fired = 0, tried = 0;
      for (let r = 0; r < 6; r++) { squat(); for (const side of ['left', 'right']) {
        for (let i = 0; i < 200 && !RA.enemies.some(x => x.alive) && RA.state !== 'end'; i++) frame(1, 16, xrFrame);
        const e = RA.enemies.find(x => x.alive); if (!e || RA.state === 'end') continue; tried++;
        const s0 = RA.stats.shots, g = new THREE.Vector3(side === 'left' ? -0.22 : 0.22, XRS.headY - 0.35, -0.3);
        for (let k = 0; k < 8; k++) { XRS.hands[side] = g.clone().add(jit()); frame(1, 16, xrFrame); }
        const n = r % 2 ? 9 : 26, up = new THREE.Vector3(0, 1, 0);
        for (let k = 1; k <= n; k++) { const d = e.center(new THREE.Vector3()).sub(g).normalize(), u = k / n; XRS.hands[side] = g.clone().addScaledVector(d, 0.42 * u).addScaledVector(up, 0.08 * Math.sin(Math.PI * u)).add(jit()); if (r % 3 === 2 && k === n) XRS.noHands = true; frame(1, 16, xrFrame); }
        XRS.noHands = false; frame(10, 16, xrFrame); XRS.hands = rest(); frame(6, 16, xrFrame);
        if (RA.stats.shots > s0) fired++;
      } }
      log(`throw XR (${variant}): real-looking flicks from guard → ${fired} of ${tried}`);
      if (fired < tried - 1) errors.push(`lanzar con la mano (${variant}): las sacudidas desde la guardia no salen siempre (${fired} de ${tried})`); }
    // coger impulso deprisa (la mano atrás, junto a la oreja) y lanzar enseguida: el impulso no cuenta como lanzamiento y
    // no debe estropear el lanzamiento de verdad, que va al enemigo al que apunta
    { let fired = 0, tried = 0, right = 0;
      for (let r = 0; r < 4; r++) { squat(); for (const side of ['left', 'right']) {
        for (let i = 0; i < 200 && !RA.enemies.some(x => x.alive) && RA.state !== 'end'; i++) frame(1, 16, xrFrame);
        const e = RA.enemies.find(x => x.alive); if (!e || RA.state === 'end') continue; tried++;
        const s0 = RA.stats.shots, p0 = e.pending, h0 = e.hp, g = new THREE.Vector3(side === 'left' ? -0.22 : 0.22, XRS.headY - 0.35, -0.3), ear = new THREE.Vector3(side === 'left' ? -0.3 : 0.3, XRS.headY - 0.1, 0.12);
        for (let k = 0; k < 6; k++) { XRS.hands[side] = g.clone(); frame(1, 16, xrFrame); }
        for (let k = 1; k <= 6; k++) { XRS.hands[side] = g.clone().lerp(ear, k / 6); frame(1, 16, xrFrame); } // atrás a 3 m/s
        frame(2, 16, xrFrame);
        for (let k = 1; k <= 9; k++) { const d = e.center(new THREE.Vector3()).sub(ear).normalize(); XRS.hands[side] = ear.clone().addScaledVector(d, 0.5 * k / 9); frame(1, 16, xrFrame); }
        frame(10, 16, xrFrame); XRS.hands = rest(); frame(6, 16, xrFrame);
        if (RA.stats.shots === s0 + 1) fired++; if (e.pending > p0 || e.hp < h0 || !e.alive) right++;
      } }
      log(`throw XR (${variant}): fast wind-up then throw → ${fired} of ${tried} fired once, ${right} at the aimed enemy`);
      if (fired < tried - 1 || right < tried - 1) errors.push(`lanzar con la mano (${variant}): coger impulso deprisa estropea el lanzamiento (${fired}/${right} de ${tried})`); }
    let k = 0; for (let i = 0; i < 30 && RA.state !== 'end'; i++) { squat(); throwAt(k++ % 2 ? 'left' : 'right'); }
    log(`throw XR (${variant}): charges after two reps ${charged} · pinch shots ${pinchShots} · slow push shots ${slowShots} · left ${one}, right ${two}, a third without a rep ${extra} · hand lost mid-throw ${lostShot} · state ${RA.state} reps ${RA.stats.reps} shots ${RA.stats.shots} hits ${RA.stats.hits}`);
    if (charged !== 2 || shots0) errors.push(`lanzar con la mano (${variant}): cada repetición debería cargar un rayo en cada mano, sin acumular más (y no dispararlo sola)`);
    if (pinchShots || slowShots) errors.push(`lanzar con la mano (${variant}): pellizcar o empujar despacio no debería lanzar el rayo`);
    if (one !== 1 || two !== 2 || extra) errors.push(`lanzar con la mano (${variant}): cada mano lanza su rayo, y sin otra repetición no hay más (izquierda ${one}, derecha ${two}, otra ${extra})`);
    if (lostShot !== 1) errors.push(`lanzar con la mano (${variant}): si las gafas pierden la mano en pleno lanzamiento, el rayo debería salir igual`);
    if (RA.state !== 'end' || RA.stats.shots < 3 || RA.stats.hits < RA.stats.shots * 0.5) errors.push(`lanzar con la mano (${variant}): el gesto no lanza el rayo o no acierta`);
    XRS.hands = null; RA.setSetting('aim', 'auto'); RA.setSetting('pistol', 0); RA.exitAll(); frame(2, 16, xrFrame);
  }
  // «al que miras»: con dos robots parados, miras a uno y lanzas hacia el hueco entre los dos (más cerca del otro): el rayo
  // va al que miras; con «hacia donde lanzas», al del lado de la mano
  { applyCfg({ mode: 'combat', foes: 'robots', aim: 'hands', throwPick: 'gaze', exercise: 'squat', lives: 0, waves: 1, repsWave: 40, repsInc: 0, rest: 0, walkTime: 60, maxAlive: 3, spawnGap: 1, pistol: 0, sword: 'off', squatDepth: 25 });
    const rest = () => ({ left: new THREE.Vector3(-0.25, 1.0, -0.1), right: new THREE.Vector3(0.25, 1.0, -0.1) });
    XRS.controllers = false; XRS.headY = 1.7; XRS.hands = rest(); await RA.startXR(false); await sleep(700); frame(20, 16, xrFrame); RA.beginRun(); frame(250, 16, xrFrame);
    const look = p => { const dx = p.x, dy = p.y - XRS.headY, dz = p.z, q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ')); XRS.headQ = { x: q.x, y: q.y, z: q.z, w: q.w }; };
    const squat = () => { XRS.headY = 1.38; frame(70, 16, xrFrame); XRS.headY = 1.7; frame(30, 16, xrFrame); };
    const res = {};
    for (const mode of ['gaze', 'hand']) {
      RA.setSetting('throwPick', mode); let ok = 0, n = 0;
      for (let r = 0; r < 4; r++) {
        // dos vecinos (sin nadie entre ellos) sin ningún rayo de antes de camino hacia ellos
        const pair = () => { const al = RA.enemies.filter(x => x.alive).sort((a, b) => a.center(new THREE.Vector3()).x - b.center(new THREE.Vector3()).x);
          for (let k = 0; k + 1 < al.length; k++) if (!al[k].pending && !al[k + 1].pending) return [al[k], al[k + 1]]; return null; };
        for (let i = 0; i < 180 && RA.projs.length; i++) frame(1, 16, xrFrame); // sin rayos de antes en el aire
        let P2 = null; for (let i = 0; i < 900 && !(P2 = pair()); i++) frame(1, 16, xrFrame); if (!P2) break;
        const [A, B] = P2, pa = A.center(new THREE.Vector3()), pb = B.center(new THREE.Vector3());
        XRS.headQ = null; squat(); look(pa); frame(40, 16, xrFrame); // mirando al de la izquierda
        const g = new THREE.Vector3(0.22, XRS.headY - 0.35, -0.3), aim = mode === 'gaze' ? pa.clone().lerp(pb, 0.62) : pb.clone(), a0 = A.pending + (A.maxHp - A.hp), b0 = B.pending + (B.maxHp - B.hp);
        for (let k = 0; k < 6; k++) { XRS.hands.right = g.clone(); frame(1, 16, xrFrame); }
        for (let k = 1; k <= 9; k++) { XRS.hands.right = g.clone().addScaledVector(aim.clone().sub(g).normalize(), 0.45 * k / 9); frame(1, 16, xrFrame); }
        frame(8, 16, xrFrame); XRS.hands = rest(); frame(6, 16, xrFrame); n++;
        const hitA = A.pending + (A.maxHp - A.hp) > a0 || !A.alive, hitB = B.pending + (B.maxHp - B.hp) > b0 || !B.alive;
        if (mode === 'gaze' ? hitA && !hitB : hitB && !hitA) ok++;
      }
      res[mode] = `${ok}/${n}`; if (!n || ok < n - (mode === 'hand' ? 1 : 0)) errors.push(`lanzar con la mano (${mode === 'gaze' ? 'al que miras' : 'hacia donde lanzas'}): el rayo no va al enemigo que toca (${ok} de ${n})`);
    }
    log(`throw XR choose target: looking at the left robot → with “al que miras”, throwing between both, ${res.gaze} to the one looked at · with “hacia donde lanzas”, throwing at the other, ${res.hand} to the one the hand points to`);
    XRS.headQ = null; XRS.hands = null; RA.setSetting('aim', 'auto'); RA.exitAll(); frame(2, 16, xrFrame); }

  // ---- Antebrazos en XR: las muñecas giran unos 90° cada una en sentidos contrarios ----
  applyCfg({ mode: 'combat', foes: 'robots', exercise: 'twist', twistDeg: 70, lives: 0, waves: 1, repsWave: 30, rest: 0, walkTime: 20 });
  XRS.headY = 1.7; await RA.startXR(false); await sleep(700); frame(20, 16, xrFrame);
  XRS.twist = -Math.PI / 4; RA.beginRun(); frame(250, 16, xrFrame); log('twist XR calib', RA.state);
  { const r0 = RA.stats.reps; let ch = 0;
    for (let n = 0; n < 6; n++) { const from = n % 2 ? Math.PI / 4 : -Math.PI / 4; for (let k = 0; k <= 30; k++) { XRS.twist = from + (-2 * from) * k / 30; frame(1, 16, xrFrame); } if (RA.DET.tw.n % 2) ch++; frame(10, 16, xrFrame); }
    log('twist XR: 6 twists → shots', RA.stats.reps - r0, 'charges seen', ch); if (RA.stats.reps - r0 !== 3) errors.push(`antebrazos XR: 6 giros deberían ser 3 disparos (${RA.stats.reps - r0})`);
    const r1 = RA.stats.reps; for (let n = 0; n < 6; n++) { const from = n % 2 ? 0.25 : -0.25; for (let k = 0; k <= 30; k++) { XRS.twist = from - 2 * from * k / 30; frame(1, 16, xrFrame); } }
    log('twist XR: wiggling 30° each way → shots', RA.stats.reps - r1); if (RA.stats.reps !== r1) errors.push('antebrazos XR: un meneo pequeño no debería disparar'); }
  XRS.twist = null; RA.exitAll(); frame(2, 16, xrFrame);

  // ---- Superman en XR: tumbado mirando al suelo; subir ~10 cm y aguantar dispara, con las manos por delante ----
  applyCfg({ mode: 'flyers', exercise: 'superman', lives: 0, waves: 1, repsWave: 30, rest: 0, supHold: 2, supRange: 8, supArms: 'yes' });
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
  // ---- Dentro del juego se pasa de VR a realidad mixta y al revés; colgado de la barra, el bosque se ve en las dos ----
  applyCfg({ mode: 'walkers', exercise: 'squat' });
  XRS.headY = 1.7; await RA.startXR(false); await sleep(700); frame(20, 16, xrFrame);
  const vr0 = !RA.arMode && RA.env.visible; press('Realidad mixta'); frame(2, 16, xrFrame);
  const mr = RA.arMode && !RA.env.visible; press('Realidad virtual'); frame(2, 16, xrFrame);
  const vr1 = !RA.arMode && RA.env.visible; press('Realidad mixta'); frame(2, 16, xrFrame);
  RA.setSetting('mode', 'bars'); RA.setSetting('exercise', 'hang'); frame(2, 16, xrFrame);
  const forestMR = RA.arMode && RA.forest.visible && !RA.env.visible;
  RA.setSetting('exercise', 'pullup'); frame(2, 16, xrFrame); const noForest = !RA.forest.visible;
  log('view switch: VR', vr0, '→ MR', mr, '→ VR', vr1, '· forest in MR while hanging', forestMR, '· gone for pull-ups', noForest);
  if (!(vr0 && mr && vr1)) errors.push('no se puede pasar de VR a realidad mixta y al revés dentro del juego');
  if (!forestMR || !noForest) errors.push('colgado en realidad mixta no aparece el bosque');
  // ---- Curl con barra en XR: solo cuenta si suben las dos manos juntas ----
  applyCfg({ mode: 'combat', foes: 'robots', aim: 'auto', exercise: 'curl2', lives: 0, waves: 1, repsWave: 30, walkTime: 20 });
  XRS.headY = 1.7; XRS.headQ = null; XRS.hands = { left: { x: -0.2, y: 0.95, z: -0.2 }, right: { x: 0.2, y: 0.95, z: -0.2 } };
  await RA.startXR(false); await sleep(700); frame(20, 16, xrFrame); RA.beginRun(); frame(250, 16, xrFrame);
  const curlCycle = (sides, n) => { for (let c = 0; c < n; c++) for (let i = 0; i < 80; i++) { const up = i >= 20 && i < 50; for (const sd of ['left', 'right']) XRS.hands[sd].y = up && sides.includes(sd) ? 1.42 : 0.95; frame(1, 16, xrFrame); } };
  const c0 = RA.stats.reps, cp0 = RA.stats.partial; curlCycle(['left'], 4); const oneArm = RA.stats.reps - c0, oneMsg = RA.stats.partial - cp0;
  const c1 = RA.stats.reps; curlCycle(['left', 'right'], 4); const twoArms = RA.stats.reps - c1;
  log('curl con barra XR: solo la izquierda', oneArm, 'reps', oneMsg, 'avisos · las dos', twoArms, 'reps');
  if (oneArm || !oneMsg) errors.push('curl con barra: subiendo un solo brazo no debería contar (y debería avisar)');
  if (twoArms < 4) errors.push('curl con barra: subiendo las dos manos juntas no cuenta');
  // con la barra, el seguimiento puede ver una mano más baja (aquí, al 75 % del recorrido) y un instante después: cuenta igual
  { const r0 = RA.stats.reps, p0 = RA.stats.partial;
    for (let c = 0; c < 4; c++) for (let i = 0; i < 80; i++) { XRS.hands.left.y = i >= 20 && i < 50 ? 1.42 : 0.95; XRS.hands.right.y = i >= 26 && i < 52 ? 1.15 : 0.95; frame(1, 16, xrFrame); }
    const uneven = RA.stats.reps - r0, msgs = RA.stats.partial - p0;
    log(`curl con barra XR: one hand seen lower and later → ${uneven} reps, ${msgs} warnings`);
    if (uneven < 4 || msgs) errors.push('curl con barra: con las dos manos subiendo (una vista algo más baja o más tarde) debería contar sin avisar'); }
  // aguantando la barra a la altura de los hombros, el disparo se carga (como abajo en la sentadilla) y sale al bajarla
  { const r0 = RA.stats.reps; let pow = 0, early = false;
    for (let i = 0; i < 240; i++) { const up = i >= 10 && i < 180; for (const sd of ['left', 'right']) XRS.hands[sd].y = up ? 1.42 : 0.95; frame(1, 16, xrFrame);
      if (up && RA.stats.reps > r0) early = true; const m = /DISPARO ×(\d)/.exec(RA.msg.text || ''); if (m && RA.msg.t > 0) pow = Math.max(pow, +m[1]); }
    log(`curl con barra XR aguantando 2,7 s arriba: disparo ×${pow} · ${RA.stats.reps - r0} rep · salió antes de bajar ${early}`);
    if (pow < 3 || early || RA.stats.reps - r0 !== 1) errors.push('curl: aguantar la pesa a la altura de los hombros debería cargar el disparo (×3 o más) y dispararlo al bajarla'); }
  XRS.hands = null; RA.exitAll(); frame(2, 16, xrFrame);
  // ---- Realidad mixta en una habitación escaneada: compuertas en las paredes, con el camino libre de muebles ----
  // 4 × 5 m, techo a 2,5 m; tú en el centro mirando a -Z con la pared de delante a 2,6 m; un sofá delante a la
  // izquierda (plano) y una mesa delante a la derecha (malla)
  const roomQ = yaw => { const c = Math.SQRT1_2, cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2); return { x: cy * c, y: sy * c, z: -sy * c, w: cy * c }; }; // giro yaw · 90° en X: la normal (eje Y del plano) mira hacia dentro
  const ROOMSIM = { planes: new Set(), meshes: new Set() };
  const wallP = (x, z, yaw, W) => ROOMSIM.planes.add({ semanticLabel: 'wall', orientation: 'vertical', lastChangedTime: 1, planeSpace: { room: { position: { x, y: 0, z }, orientation: roomQ(yaw) } }, polygon: [[-W / 2, -2.5], [W / 2, -2.5], [W / 2, 0], [-W / 2, 0]].map(([a, b]) => ({ x: a, y: 0, z: b, w: 1 })) });
  wallP(0, -2.6, 0, 4); wallP(0, 2.4, Math.PI, 4); wallP(-2, -0.1, Math.PI / 2, 5); wallP(2, -0.1, -Math.PI / 2, 5);
  ROOMSIM.planes.add({ semanticLabel: 'ceiling', orientation: 'horizontal', lastChangedTime: 1, planeSpace: { room: { position: { x: 0, y: 2.5, z: 0 }, orientation: { x: 1, y: 0, z: 0, w: 0 } } }, polygon: [[-2, -2.6], [2, -2.6], [2, 2.4], [-2, 2.4]].map(([a, b]) => ({ x: a, y: 0, z: b, w: 1 })) });
  const SOFA = { x0: -2.0, x1: -0.6, z0: -2.0, z1: -1.2 }, TABLE = { x0: 0.8, x1: 1.6, z0: -1.3, z1: -0.7 };
  ROOMSIM.planes.add({ semanticLabel: 'couch', orientation: 'horizontal', lastChangedTime: 1, planeSpace: { room: { position: { x: -1.3, y: 0.45, z: -1.6 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } }, polygon: [[-0.7, -0.4], [0.7, -0.4], [0.7, 0.4], [-0.7, 0.4]].map(([a, b]) => ({ x: a, y: 0, z: b, w: 1 })) });
  { const v = [], idx = []; for (const y of [0, 0.75]) for (const [x, z] of [[-0.4, -0.3], [0.4, -0.3], [0.4, 0.3], [-0.4, 0.3]]) v.push(x, y, z); for (const [a, b, c] of [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1], [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0]]) idx.push(a, b, c);
    ROOMSIM.meshes.add({ semanticLabel: 'table', lastChangedTime: 1, meshSpace: { room: { position: { x: 1.2, y: 0, z: -1.0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } }, vertices: new Float32Array(v), indices: new Uint32Array(idx) }); }
  const inBox = (B, x, z, m) => x > B.x0 - m && x < B.x1 + m && z > B.z0 - m && z < B.z1 + m;
  const pathHits = (ax, az, bx, bz, m) => { for (let i = 0; i <= 40; i++) { const k = i / 40, x = ax + (bx - ax) * k, z = az + (bz - az) * k; if (inBox(SOFA, x, z, m) || inBox(TABLE, x, z, m)) return true; } return false; };
  applyCfg({ mode: 'combat', foes: 'robots', aim: 'auto', exercise: 'squat', roomMode: 'scan', lives: 0, waves: 1, repsWave: 30, walkTime: 8, maxAlive: 4, spawnGap: 0.5 });
  XRS.room = ROOMSIM; XRS.headY = 1.7; XRS.headX = 0; XRS.headZ = 0; XRS.headQ = null;
  await RA.startXR(true); await sleep(700); frame(60, 16, xrFrame);
  const P = RA.roomPlan(), live = RA.gates.filter(g => g.on), gw = new THREE.Vector3();
  const gInfo = live.map(g => { RA.arena.updateMatrixWorld(); g.g.getWorldPosition(gw); const r = g.g.rotation.y + RA.arena.rotation.y; return { x: gw.x, z: gw.z, nx: Math.sin(r), nz: Math.cos(r), s: g.scale }; });
  log('room:', RA.ROOM.walls.length, 'walls', RA.ROOM.furn.length, 'furniture', '· gates', gInfo.map(g => `(${g.x.toFixed(2)}, ${g.z.toFixed(2)}) n(${g.nx.toFixed(2)}, ${g.nz.toFixed(2)}) ×${g.s.toFixed(2)}`).join(' '), '· occluders', RA.ROOM.occl.visible, RA.ROOM.occl.children.length - 1, '+', RA.ROOM.wallOcc.children.length);
  if (RA.ROOM.walls.length !== 4 || RA.ROOM.furn.length !== 2) errors.push('no se leen las paredes y los muebles escaneados');
  if (!P || !live.length) errors.push('con la habitación escaneada las compuertas no van a las paredes');
  const onWall = g => Math.abs(g.z - (-2.6 + 0.45 * g.s)) < 0.05 && g.nz > 0.99 || Math.abs(g.x - (-2 + 0.45 * g.s)) < 0.05 && g.nx > 0.99 || Math.abs(g.x - (2 - 0.45 * g.s)) < 0.05 && g.nx < -0.99;
  if (gInfo.some(g => !onWall(g))) errors.push('alguna compuerta no está pegada a una pared mirando hacia dentro');
  if (gInfo.some(g => g.s > 0.56)) errors.push('la compuerta no cabe bajo el techo de 2,5 m');
  if (gInfo.some(g => pathHits(g.x + g.nx * 0.5, g.z + g.nz * 0.5, 0, 0, 0.15))) errors.push('el camino de alguna compuerta hasta ti pasa por un mueble');
  if (!gInfo.some(g => g.nz > 0.99 && Math.abs(g.x) < 0.6)) errors.push('no hay compuerta en la pared de delante');
  { RA.boardRig.children[0].getWorldPosition(gw); const dW = Math.min(Math.abs(gw.z + 2.6), Math.abs(gw.z - 2.4), Math.abs(gw.x + 2), Math.abs(gw.x - 2)); log('board on wall at', gw.x.toFixed(2), gw.z.toFixed(2), 'distance to wall', dW.toFixed(3)); if (dW > 0.1) errors.push('el marcador no se cuelga en una pared'); }
  if (!RA.ROOM.occl.visible || RA.ROOM.occl.children.length - 1 < 2 || RA.ROOM.wallOcc.children.length < 5) errors.push('las paredes y los muebles no tapan lo virtual (o no hay hueco en las compuertas)');
  // los robots salen de esas compuertas y sus puestos de ataque no caen en un mueble
  RA.beginRun(); frame(200, 16, xrFrame); const badSlot = [], seenBots = new Set(), st0 = RA.state;
  for (let i = 0; i < 1500; i++) { XRS.headY = (i % 140) < 70 ? 1.7 : 1.3; frame(1, 16, xrFrame); if (i % 10) continue; for (const e of RA.enemies) if (e.alive && e.type === 'robot' && e.slotOk) { seenBots.add(e); const sw = RA.arena.localToWorld(e.slot.clone()); if (inBox(SOFA, sw.x, sw.z, 0.1) || inBox(TABLE, sw.x, sw.z, 0.1)) badSlot.push(`${sw.x.toFixed(2)},${sw.z.toFixed(2)}`); } }
  log('robots in the room: after calib', st0, '→', RA.state, 'robots seen', seenBots.size, 'slots in furniture', badSlot.length);
  if (seenBots.size < 3) errors.push('en la habitación no salen robots');
  if (badSlot.length) errors.push('algún robot elige su puesto dentro de un mueble: ' + badSlot.slice(0, 3).join(' '));
  XRS.headY = 1.7; RA.exitAll(); frame(2, 16, xrFrame);
  // en flexiones, las trampillas en suelo libre y dentro de la habitación
  RA.setSetting('exercise', 'pushup'); await RA.startXR(true); await sleep(700); frame(60, 16, xrFrame);
  const hs = RA.hatches.map(h => RA.arena.localToWorld(new THREE.Vector3(h.x, 0, h.z)));
  log('room hatches', hs.map(h => `(${h.x.toFixed(2)}, ${h.z.toFixed(2)})`).join(' '));
  if (hs.some((h, i) => hs.some((o, j) => j !== i && h.distanceTo(o) < 0.55))) errors.push('dos trampillas casi en el mismo sitio');
  if (hs.some(h => inBox(SOFA, h.x, h.z, 0.2) || inBox(TABLE, h.x, h.z, 0.2) || Math.abs(h.x) > 1.75 || h.z < -2.35 || h.z > 2.15)) errors.push('alguna trampilla cae en un mueble o fuera de la habitación');
  // en VR, o con el ajuste apagado, todo como siempre
  RA.setSetting('exercise', 'squat'); frame(40, 16, xrFrame); RA.setSetting('roomMode', 'off'); frame(40, 16, xrFrame);
  const offOk = RA.gates.every(g => g.on && g.side.visible) && !RA.ROOM.occl.visible; RA.setSetting('roomMode', 'scan'); frame(40, 16, xrFrame);
  press('Realidad virtual'); frame(40, 16, xrFrame); const vrOk = RA.gates.every(g => g.on && g.side.visible) && !RA.ROOM.occl.visible;
  log('room off → default', offOk, '· VR → default', vrOk);
  if (!offOk || !vrOk) errors.push('sin adaptar a la habitación (o en VR) las compuertas no vuelven a su sitio');
  RA.exitAll(); frame(2, 16, xrFrame); XRS.room = null;
  // ---- Coste por fotograma de la habitación: aunque el escaneo «cambie» sin parar, no puede pesar ----
  {
    const BIG = { planes: new Set(ROOMSIM.planes), meshes: new Set() }, nv = 20000, vv = new Float32Array(nv * 3), ii = new Uint32Array(nv * 3);
    for (let i = 0; i < nv * 3; i++) { vv[i] = Math.random() * 3 - 1.5; ii[i] = i % nv; }
    const big = { semanticLabel: 'other', lastChangedTime: 1, meshSpace: { room: { position: { x: 1.2, y: 0, z: -1.0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } }, vertices: vv, indices: ii }; BIG.meshes.add(big);
    for (const m of ROOMSIM.meshes) BIG.meshes.add(m);
    const ms = (n, churn) => { const t0 = process.hrtime.bigint(); for (let i = 0; i < n; i++) { if (churn) { big.lastChangedTime++; for (const p of BIG.planes) p.lastChangedTime++; } frame(1, 16, xrFrame); } return Number(process.hrtime.bigint() - t0) / 1e6 / n; };
    applyCfg({ mode: 'combat', foes: 'robots', aim: 'auto', exercise: 'squat', roomMode: 'scan', lives: 0, waves: 1, repsWave: 30 });
    XRS.room = null; await RA.startXR(true); await sleep(700); frame(30, 16, xrFrame); const base = ms(200, false);
    XRS.room = BIG; frame(30, 16, xrFrame); const stat = ms(200, false), churnMR = ms(200, true);
    RA.lobbyMenu(); frame(2, 16, xrFrame); press('Realidad virtual'); frame(5, 16, xrFrame); const churnVR = ms(200, true);
    RA.lobbyMenu(); frame(2, 16, xrFrame); press('Realidad mixta'); RA.beginRun(); frame(200, 16, xrFrame); const churnPlay = ms(200, true);
    log(`perf habitación (ms/fotograma, JS): sin habitación ${base.toFixed(2)} · estática ${stat.toFixed(2)} · cambiando en RM ${churnMR.toFixed(2)} · cambiando en VR ${churnVR.toFixed(2)} · cambiando en partida ${churnPlay.toFixed(2)}`);
    if (churnMR > base + 1.5 || churnVR > base + 1.5 || churnPlay > base + 1.5) errors.push('la habitación pesa demasiado por fotograma cuando el escaneo cambia');
    XRS.room = null; RA.exitAll(); frame(2, 16, xrFrame);
  }
  // ---- Escaneo como el de las Quest: «wall face», una malla enorme sin etiqueta y un «mueble» donde estás tú ----
  {
    const Q = { planes: new Set(), meshes: new Set() };
    for (const p of ROOMSIM.planes) Q.planes.add(p.semanticLabel === 'wall' ? { ...p, semanticLabel: 'wall face' } : p);
    for (const m of ROOMSIM.meshes) Q.meshes.add(m);
    const big = new Float32Array([-3, 0, -3, 3, 0, -3, 3, 2.4, 3, -3, 2.4, 3]); Q.meshes.add({ semanticLabel: '', lastChangedTime: 1, meshSpace: { room: { position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } }, vertices: big, indices: new Uint32Array([0, 1, 2, 0, 2, 3]) });
    Q.planes.add({ semanticLabel: 'table', orientation: 'horizontal', lastChangedTime: 1, planeSpace: { room: { position: { x: 0, y: 0.7, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } }, polygon: [[-0.4, -0.3], [0.4, -0.3], [0.4, 0.3], [-0.4, 0.3]].map(([a, b]) => ({ x: a, y: 0, z: b, w: 1 })) });
    applyCfg({ mode: 'combat', foes: 'robots', aim: 'auto', exercise: 'squat', roomMode: 'scan', roomShow: 0, roomOcclude: 1, lives: 0, waves: 1, repsWave: 30, walkTime: 8 });
    XRS.room = Q; XRS.headY = 1.7; XRS.headX = 0; XRS.headZ = 0; XRS.headQ = null;
    await RA.startXR(true); await sleep(700); frame(60, 16, xrFrame);
    const furnUsed = RA.ROOM.uf.length, gatesOn = RA.gates.filter(g => g.on).length, P = RA.roomPlan();
    log('quest-like scan: walls', RA.ROOM.walls.length, '· furniture read', RA.ROOM.furn.length, 'used', furnUsed, '· gates', gatesOn, P && P.gates.filter(Boolean).length);
    if (RA.ROOM.walls.length !== 4) errors.push('no se reconocen las paredes etiquetadas «wall face»');
    if (RA.ROOM.furn.length !== 3 || furnUsed !== 2) errors.push('una malla enorme sin etiqueta o un «mueble» donde estás tú se toman por muebles');
    // «Ver lo escaneado» pinta paredes y muebles; sin oclusión, no se tapa nada
    RA.setSetting('roomShow', 1); frame(2, 16, xrFrame); const shown = RA.ROOM.occl.visible && RA.ROOM.occl.children.some(o => o.material && o.material.colorWrite !== false);
    RA.setSetting('roomShow', 0); RA.setSetting('roomOcclude', 0); frame(2, 16, xrFrame); const noOcc = !RA.ROOM.occl.visible; RA.setSetting('roomOcclude', 1);
    log('scan view', shown, '· occlusion off', noOcc);
    if (!shown || !noOcc) errors.push('no se puede ver lo escaneado o apagar la oclusión');
    XRS.room = null; RA.exitAll(); frame(2, 16, xrFrame);
  }
  // ---- Habitación pequeña: no cumple los requisitos y se coloca a mano (y se recuerda) ----
  const TINY = { planes: new Set(), meshes: new Set() };
  for (const [x, z, yaw] of [[0, -1.2, 0], [0, 1.2, Math.PI], [-1.2, 0, Math.PI / 2], [1.2, 0, -Math.PI / 2]]) TINY.planes.add({ semanticLabel: 'wall', orientation: 'vertical', lastChangedTime: 2, planeSpace: { room: { position: { x, y: 0, z }, orientation: roomQ(yaw) } }, polygon: [[-1.2, -2.5], [1.2, -2.5], [1.2, 0], [-1.2, 0]].map(([a, b]) => ({ x: a, y: 0, z: b, w: 1 })) });
  applyCfg({ mode: 'combat', foes: 'robots', aim: 'auto', exercise: 'squat', roomMode: 'scan', lives: 0, waves: 1, repsWave: 30, walkTime: 8 });
  XRS.room = TINY; XRS.noHands = true; XRS.headY = 1.7; XRS.headX = 0; XRS.headZ = 0; XRS.headQ = null;
  await RA.startXR(true); await sleep(700); frame(60, 16, xrFrame); RA.lobbyMenu(); frame(2, 16, xrFrame);
  { const P = RA.roomPlan(), main = RA.activeWidgets().map(w => w.label); findW('Entorno').onPress(); const lw = RA.activeWidgets().map(w => w.label); findW('Volver').onPress(); log('tiny room: main menu points to the room', main.includes('Entorno  ▸'), '· why', P && P.why, '· offers manual', lw.includes('Colocar a mano'));
    if (!P || !P.why || !/1,7/.test(P.why) || !lw.includes('Colocar a mano')) errors.push('en una habitación que no cumple los requisitos no se explica el motivo ni se ofrece colocarla a mano'); }
  const lookAt = (x, z) => { const dx = x - (XRS.headX || 0), dz = z - (XRS.headZ || 0), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.atan2(-XRS.headY, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ')); XRS.headQ = { x: q.x, y: q.y, z: q.z, w: q.w }; frame(3, 16, xrFrame); };
  press('Colocar a mano'); frame(2, 16, xrFrame); press('Aquí juego'); frame(2, 16, xrFrame);
  lookAt(0, -1.0); press('Colocar aquí'); lookAt(-1.0, -0.4); press('Colocar aquí'); XRS.headQ = null; frame(2, 16, xrFrame);
  press('Siguiente: trampillas →'); lookAt(0.7, -0.8); press('Colocar aquí'); lookAt(-0.7, -0.8); press('Colocar aquí'); lookAt(0, -0.3); press('Colocar aquí'); XRS.headQ = null; frame(2, 16, xrFrame);
  press('Siguiente: marcador →'); press('Sin marcador propio'); frame(60, 16, xrFrame);
  const MP = RA.roomPlan(), mg = RA.gates.filter(g => g.on).map(g => { RA.arena.updateMatrixWorld(); const p = g.g.getWorldPosition(new THREE.Vector3()), r = g.g.rotation.y + RA.arena.rotation.y; return { x: p.x, z: p.z, nx: Math.sin(r), nz: Math.cos(r) }; });
  const stored = JSON.parse(storage.get('reparena3-roomset') || 'null'), eqS = JSON.parse(storage.get('reparena3-equip') || 'null');
  log('manual room:', RA.settings.roomMode, 'gates', mg.map(g => `(${g.x.toFixed(2)}, ${g.z.toFixed(2)}) n(${g.nx.toFixed(2)}, ${g.nz.toFixed(2)})`).join(' '), '· hatches on', RA.hatches.filter(h => h.on).length, '· stored', stored && stored.gates.length, stored && stored.hatches.length, '· spot saved', !!(eqS && eqS.spot && eqS.spot.set), '· anchor', !!RA.EQ.xr.spot.anchor);
  if (RA.settings.roomMode !== 'manual' || !MP || !MP.manual) errors.push('al terminar de colocar no pasa a «Colocada a mano»');
  if (mg.length !== 2 || !mg.some(g => Math.abs(g.z - (-1.2 + 0.45 * 0.6)) < 0.08 && g.nz > 0.99) || !mg.some(g => Math.abs(g.x - (-1.2 + 0.45 * 0.6)) < 0.08 && g.nx > 0.99)) errors.push('las compuertas colocadas a mano no están donde se pusieron (pegadas a su pared)');
  if (RA.hatches.filter(h => h.on).length !== 2) errors.push('no se usan las trampillas colocadas a mano (ni se ocultan las que sobran)');
  if (!stored || stored.gates.length !== 2 || stored.hatches.length !== 2 || !(eqS && eqS.spot && eqS.spot.set)) errors.push('la habitación colocada a mano no se guarda para otras sesiones');
  // en otra sesión sigue ahí, y los robots salen de esas compuertas
  RA.exitAll(); frame(2, 16, xrFrame); await RA.startXR(true); await sleep(700); frame(60, 16, xrFrame);
  const again = RA.gates.filter(g => g.on).length; RA.beginRun(); frame(200, 16, xrFrame);
  const fromGate = new Set(); for (let i = 0; i < 900; i++) { XRS.headY = (i % 140) < 70 ? 1.7 : 1.3; frame(1, 16, xrFrame); for (const e of RA.enemies) if (e.alive && e.type === 'robot' && !fromGate.has(e)) { fromGate.add(e); e.spawnAt = RA.arena.localToWorld(e.pos.clone()); } }
  const near = [...fromGate].filter(e => mg.some(g => Math.hypot(e.spawnAt.x - g.x, e.spawnAt.z - g.z) < 1.5)).length;
  log('next session: gates on', again, '· robots', fromGate.size, 'from the placed gates', near);
  if (again !== 2) errors.push('en otra sesión no se recuerda la habitación colocada a mano');
  if (fromGate.size < 2 || near < fromGate.size) errors.push('los robots no salen de las compuertas colocadas a mano');
  // ajustar lo colocado: se agarra una compuerta pellizcando sobre ella, se arrastra mirando a otro sitio y se suelta
  { RA.exitAll(); frame(2, 16, xrFrame); await RA.startXR(true); await sleep(700); frame(60, 16, xrFrame); RA.lobbyMenu(); frame(2, 16, xrFrame);
    press('Ajustar (arrastrar)'); frame(2, 16, xrFrame); const R = RA.RPL, g0 = R.gates[0] && { x: R.gates[0].x, z: R.gates[0].z }, n0 = R.gates.length;
    XRS.noHands = false; XRS.handsAway = true; lookAt(g0.x, g0.z); frame(4, 16, xrFrame); const aim0 = R.aim.clone();
    XRS.pinch = 'right'; frame(3, 16, xrFrame); const grabbed = !!R.drag; lookAt(1.0, -0.3); frame(6, 16, xrFrame); XRS.pinch = null; frame(3, 16, xrFrame);
    const g1 = R.gates[0]; XRS.headQ = null; press('Guardar'); frame(20, 16, xrFrame);
    const st = JSON.parse(storage.get('reparena3-roomset') || 'null');
    log(`drag in placement: prefilled ${n0} gates · aim at gate ${aim0.x.toFixed(2)},${aim0.z.toFixed(2)} vs ${g0.x.toFixed(2)},${g0.z.toFixed(2)} · grabbed ${grabbed} · moved to ${g1.x.toFixed(2)},${g1.z.toFixed(2)} (wall ${g1.wall}) · saved gates ${st && st.gates.length}`);
    if (n0 !== 2 || !grabbed || Math.hypot(g1.x - g0.x, g1.z - g0.z) < 0.5 || !st || st.gates.length !== 2) errors.push('no se puede ajustar la habitación arrastrando lo colocado');
    XRS.noHands = true; XRS.handsAway = false; }
  // lo fácil: las trampillas y el marcador, solos; el asistente dice en qué paso vas
  { RA.exitAll(); frame(2, 16, xrFrame); await RA.startXR(true); await sleep(700); frame(60, 16, xrFrame); RA.lobbyMenu(); frame(2, 16, xrFrame);
    press('Recolocar'); frame(2, 16, xrFrame);
    press('Aquí juego'); frame(2, 16, xrFrame); lookAt(0, -1.0); press('Colocar aquí'); XRS.headQ = null; frame(2, 16, xrFrame);
    press('Siguiente: trampillas →'); press('Ponerlas solas'); frame(2, 16, xrFrame); const nh = RA.RPL.hatches.length; press('Junto a las compuertas'); frame(30, 16, xrFrame);
    const st = JSON.parse(storage.get('reparena3-roomset') || 'null');
    log(`easy placement: hatches placed by themselves ${nh} · board saved ${!!(st && st.board)} · gates ${st && st.gates.length}`);
    if (nh !== 4 || !st || !st.board || st.gates.length !== 1) errors.push('colocar a mano: «Ponerlas solas» y «Junto a las compuertas» no colocan las trampillas y el marcador'); }
  XRS.headY = 1.7; RA.exitAll(); frame(2, 16, xrFrame); XRS.room = null; XRS.noHands = false; RA.setSetting('roomMode', 'scan');
  log('\nERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
  log('audio nodes created', E.stats().audioNodes);
})().catch(e => { console.log('FATAL', e.stack); console.log('ERRORS so far:\n' + errors.join('\n')); });

// ---------- simulador de frames XR ----------
// Mano izquierda realista: muñeca p, normal de la palma n (hacia el lado de la palma), dedos hacia f; fist: puño cerrado.
// En la izquierda, el pulgar queda hacia n × f
function leftJoint(i, L) {
  const V = THREE.Vector3, n = L.n.clone().normalize(), f = L.f.clone().normalize(), th = new V().crossVectors(n, f).normalize(), P = (...t) => { const v = L.p.clone(); for (const [d, k] of t) v.addScaledVector(d, k); return { x: v.x, y: v.y, z: v.z }; };
  if (i === 0) return P();
  if (i < 5) return P([th, 0.025 + i * 0.012], [f, 0.02 + i * 0.015], [n, 0.01]); // pulgar
  const k = Math.floor((i - 5) / 5), m = (i - 5) % 5, side = 0.03 - k * 0.02; // índice … meñique, de través
  if (m === 0) return P([th, side * 0.6], [f, 0.035]);
  if (m === 1 || !L.fist) return P([th, side], [f, 0.09 + [0, 0, 0.04, 0.065, 0.085][m]]);
  return P([th, side], [f, [0, 0, 0.1, 0.075, 0.05][m]], [n, [0, 0, 0.03, 0.045, 0.035][m]]); // doblado hacia la palma
}
const XRS = { headY: 1.7, tip: null, wristUp: false };
function makeXRFrame() {
  const HJ = RA.HJ;
  const mkHand = side => { const m = new Map(); HJ.forEach(n => m.set(n, { name: n, side })); m.size; return m; };
  const handL = mkHand('left'), handR = mkHand('right');
  const sources = [{ handedness: 'left', hand: handL, targetRaySpace: { ray: 'left' } }, { handedness: 'right', hand: handR, targetRaySpace: { ray: 'right' } }];
  // mandos con vibración: cada pulso queda apuntado en XRS.haptics
  const pads = Object.fromEntries(['left', 'right'].map(h => [h, { buttons: [{ pressed: false }, { pressed: false }], hapticActuators: [{ pulse(v, ms) { (XRS.haptics = XRS.haptics || []).push([h, v, ms]); return Promise.resolve(true); } }] }]));
  const ctrls = ['left', 'right'].map(h => ({ handedness: h, gripSpace: { grip: h }, targetRaySpace: { ray: h }, gamepad: pads[h] }));
  return () => {
    const s = RA.renderer.xr.getSession(), src = XRS.controllers ? ctrls : sources; if (s) s.inputSources = src;
    pads.left.buttons[0].pressed = XRS.trig === 'left'; pads.right.buttons[0].pressed = XRS.trig === 'right';
    pads.left.buttons[1].pressed = XRS.squeeze === 'left'; pads.right.buttons[1].pressed = XRS.squeeze === 'right'; // (el botón de agarre)
    return {
      session: s || { inputSources: src },
      detectedPlanes: XRS.room ? XRS.room.planes : undefined, detectedMeshes: XRS.room ? XRS.room.meshes : undefined,
      getViewerPose() { const q = XRS.headQ || { x: 0, y: 0, z: 0, w: 1 }; return { transform: { position: { x: XRS.headX || 0, y: XRS.headY, z: XRS.headZ || 0 }, orientation: { x: q.x, y: q.y, z: q.z, w: q.w } } }; },
      createAnchor(xf, space) { return Promise.resolve(E.makeAnchor({ position: { ...xf.position }, orientation: { ...xf.orientation } })); },
      getPose(space) { if (space.room) return { transform: space.room }; if (space.bounded) return { transform: E.bounded.pose }; if (space.anchorPose) return { transform: space.anchorPose }; if ((space.grip || space.ray) && XRS.ctrl && XRS.ctrl[space.grip || space.ray]) { const c = XRS.ctrl[space.grip || space.ray]; return { transform: { position: { x: c.p.x, y: c.p.y, z: c.p.z }, orientation: { x: c.q.x, y: c.q.y, z: c.q.z, w: c.q.w } } }; } if (space.grip) return { transform: { position: { x: space.grip === 'left' ? -0.2 : 0.2, y: XRS.headY - 0.4, z: -0.3 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } }; const x = space.ray === 'left' ? -0.2 : 0.2; return { transform: { position: { x, y: XRS.headY - 0.4, z: -0.3 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } }; },
      getJointPose(j) {
        if ((XRS.noLeft && j.side === 'left') || XRS.noHands) return null;
        const side = j.side === 'left' ? -1 : 1, i = HJ.indexOf(j.name);
        let pos = { x: side * 0.2 + (i % 5) * 0.01, y: XRS.headY - 0.45 + Math.floor(i / 5) * 0.01, z: -0.3 - Math.floor(i / 5) * 0.02 };
        let ori = { x: 0, y: 0, z: 0, w: 1 };
        if (j.side === 'left' && XRS.wristUp) { pos = { x: -0.1 + (i % 5) * 0.01, y: XRS.headY - 0.3, z: -0.35 - Math.floor(i / 5) * 0.02 }; ori = { x: 0.7071, y: 0, z: 0, w: 0.7071 }; }
        if (j.side === 'right' && i === 9 && XRS.tip) pos = { x: XRS.tip.x, y: XRS.tip.y, z: XRS.tip.z };
        if (XRS.lift === j.side || XRS.lift === 'both') pos.y += 0.4;
        if (XRS.twist != null) { // barra flexible: muñecas fijas, nudillos girando alrededor del eje izquierda-derecha
          const sg = j.side === 'left' ? -1 : 1, a = sg * XRS.twist, w = { x: sg * 0.2, y: XRS.headY - 0.42, z: -0.38 };
          pos = i === 0 ? w : { x: w.x + (i % 5) * 0.004 * sg, y: w.y + Math.sin(a) * 0.08 * (0.6 + (i % 5) * 0.1), z: w.z - Math.cos(a) * 0.08 * (0.6 + (i % 5) * 0.1) };
        }
        if (XRS.hands) { const g = XRS.hands[j.side]; pos = { x: g.x + (i % 5) * 0.01, y: g.y, z: g.z - Math.floor(i / 5) * 0.02 }; }
        if (XRS.handsAway) pos = { x: pos.x, y: XRS.headY - 0.9, z: 0.4 }; // manos bajadas, junto al cuerpo
        if (XRS.pinch === j.side && (i === 4 || i === 9)) { const w = HJ.indexOf('wrist'); pos = { x: pos.x - (i % 5) * 0.01 + 0.03, y: pos.y + 0.02, z: pos.z - 0.06 }; } // pulgar e índice juntos
        if (XRS.grip) { const g = XRS.grip[j.side]; pos = { x: g.x, y: g.y - (i === 10 ? 0.02 : 0), z: g.z + (i === 10 ? 0.02 : 0) }; }
        if (XRS.left && j.side === 'left') pos = leftJoint(i, XRS.left); // mano izquierda con forma de mano: palma, dedos y puño
        return { transform: { position: pos, orientation: ori }, radius: 0.009 };
      }
    };
  };
}
