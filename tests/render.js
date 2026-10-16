// Renderiza modelos con un rasterizador por software para revisar formas (sin texturas).
// Uso: python3 src/build.py && node tests/render.js  → imágenes en tests/out/
'use strict';
const fs = require('fs'), vm = require('vm');
const THREE = require('./three-mock.js');
const E = require('./env-mock.js');
const R = require('./raster.js');
const V3 = THREE.Vector3;
const storage = new Map();
Object.assign(global, { THREE, document: E.document, window: global, innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) }, location: { protocol: 'https:', hostname: 'x' }, AudioContext: E.AudioContext });
Object.defineProperty(global, 'navigator', { value: { xr: E.makeXR() }, configurable: true });
let src = fs.readFileSync(require('path').join(__dirname, '..', 'build', 'game.js'), 'utf8');
src = src.replace(/\}\)\(\);\s*$/, `window.__RA = { RIGS, Robot, Spider, Flyer, Arc, makeArcObj, gates, hatches, layoutArena, arena, env, scene, SPLEGS, settings, setSetting, ensureRigs, HL, head, gloves, hands, updateGloves, HJ, openMenu, lobbyMenu, settingsMenu, get menu(){return menu}, stand, MAT_ROBOT, makeGate, boardRig, applyEnvMode, startPreview, renderer, camera, get enemies(){return enemies}, set enemies(v){enemies=v} }; })();`);
vm.runInThisContext(src, { filename: 'game.js' });
const RA = window.__RA;
RA.ensureRigs();
const out = require('path').join(__dirname, 'out') + '/'; fs.mkdirSync(out, { recursive: true });
function shot(obj, views, file, opts = {}) {
  const tris = R.collect(obj, opts);
  const imgs = views.map(v => R.render(tris, Object.assign({ w: 420, h: 420 }, v)));
  fs.writeFileSync(out + file, R.grid(imgs, views.length));
  console.log(file, tris.length, 'tris');
}
const front = (c, d, h = 1) => ({ eye: new V3(c.x + 0, c.y + h * 0.15, c.z + d), target: c });
const side = (c, d) => ({ eye: new V3(c.x + d, c.y + 0.1 * d, c.z), target: c });
const q34 = (c, d) => ({ eye: new V3(c.x + d * 0.7, c.y + d * 0.35, c.z + d * 0.7), target: c });
const top = (c, d) => ({ eye: new V3(c.x + 0.001, c.y + d, c.z + 0.2 * d), target: c });

// Robots (pose: walking mid-stride) in their own scene root
RA.HL.set(0, 1.6, 3);
for (const kind of ['scout', 'heavy', 'titan']) {
  const fakeGate = { x: 0, z: -2, g: { rotation: { y: 0 } }, openT: 0 };
  const r = new RA.Robot({ kind, hp: 3 }, fakeGate);
  r.pos.set(0, 0, 0); r.yaw = 0; r.speed = 0.7; r.root.position.set(0, 0, 0); r.root.rotation.y = 0;
  for (let i = 0; i < 9; i++) r.animate(0.033, i * 0.033, true);
  const grp = new THREE.Group(); grp.add(r.root);
  const h = kind === 'titan' ? 1.6 : 1.05;
  shot(grp, [front(new V3(0, h, 0), kind === 'titan' ? 6 : 4), side(new V3(0, h, 0), kind === 'titan' ? 6 : 4), q34(new V3(0, h, 0), kind === 'titan' ? 5.5 : 3.6)], `robot_${kind}.png`);
  // attack windup pose
  r.arm = 1; r.jaw = 1; r.animate(0.033, 1, false);
  shot(grp, [front(new V3(0, h + 0.2, 0), kind === 'titan' ? 6.5 : 4.2), side(new V3(0, h + 0.2, 0), kind === 'titan' ? 6.5 : 4.2)], `robot_${kind}_attack.png`);
  // head close-up
  const hp = r.B.head.getWorldPosition(new V3());
  shot(grp, [front(hp, kind === 'titan' ? 1.6 : 0.9, 0.2), q34(hp, kind === 'titan' ? 1.4 : 0.8)], `robot_${kind}_head.png`);
}
// Spider with legs
RA.setSetting('exercise', 'pushup'); RA.setSetting('mode', 'walkers');
{
  const hatch = { x: 0, z: -0.2, openT: 0 };
  RA.HL.set(0, 0.45, 0.4);
  const sp = new RA.Spider({ kind: 'heavy', hp: 3 }, hatch);
  sp.pos.set(0, 0, 0); sp.mode = 'run'; sp.target.set(0, 0, 0.5); sp.yaw = 0;
  for (let i = 0; i < 40; i++) { sp.run = true; sp.runT = 1; sp.update(0.033, i * 0.033); }
  RA.SPLEGS.n = 0; sp.drawLegs(); RA.SPLEGS.fem.count = RA.SPLEGS.tib.count = RA.SPLEGS.n;
  const grp = new THREE.Group(); grp.add(sp.root); grp.add(RA.SPLEGS.fem); grp.add(RA.SPLEGS.tib);
  const c = sp.root.position.clone().add(new V3(0, 0.05, 0));
  shot(grp, [front(c, 0.55, 0.5), side(c, 0.55), top(c, 0.6), q34(c, 0.5)], 'spider.png');
  sp.mode = 'rear'; sp.st = 0; for (let i = 0; i < 15; i++) sp.update(0.033, 2 + i * 0.033);
  RA.SPLEGS.n = 0; sp.drawLegs(); RA.SPLEGS.fem.count = RA.SPLEGS.tib.count = RA.SPLEGS.n;
  shot(grp, [front(c, 0.55, 0.5), side(c, 0.55)], 'spider_rear.png');
  sp.kill(); for (let i = 0; i < 20; i++) sp.update(0.033, 3 + i * 0.033);
  RA.SPLEGS.n = 0; sp.drawLegs(); RA.SPLEGS.fem.count = RA.SPLEGS.tib.count = RA.SPLEGS.n;
  shot(grp, [front(c, 0.55, 0.5), side(c, 0.55)], 'spider_dead.png');
}
// Flyers
RA.setSetting('exercise', 'squat'); RA.setSetting('mode', 'flyers');
for (const kind of ['drone', 'hornet', 'bomber', 'carrier']) {
  const inst = RA.RIGS[kind].instance(kind === 'hornet' ? { main: new THREE.MeshStandardMaterial({ vertexColors: true, skinning: true }), gloss: new THREE.MeshStandardMaterial({ vertexColors: true, skinning: true }), wing: new THREE.MeshBasicMaterial({ skinning: true, transparent: true, side: 2, color: 0xbbbbbb }) } : { main: new THREE.MeshStandardMaterial({ vertexColors: true, skinning: true }), glow: new THREE.MeshBasicMaterial({ vertexColors: true, skinning: true }), rotor: new THREE.MeshBasicMaterial({ skinning: true, color: 0x555555 }) });
  const grp = new THREE.Group(); grp.add(inst.root);
  const s = kind === 'hornet' ? 0.12 : kind === 'carrier' ? 0.6 : 0.4;
  shot(grp, [front(new V3(0, 0, 0), s * 1.6, 0.6), side(new V3(0, 0, 0), s * 1.6), top(new V3(0, 0, 0), s * 1.8)], `flyer_${kind}.png`);
}
// Arc + gate + kiosk
{
  const o = RA.makeArcObj(1.35, 2.55); const grp = new THREE.Group(); grp.add(o.grp);
  shot(grp, [front(new V3(0, 1.2, 0), 5), q34(new V3(0, 1.2, 0), 4.5)], 'arc.png', { additive: true });
  const g = RA.makeGate(); const gg = new THREE.Group(); gg.add(g.g); g.g.position.set(0, 0, 0); g.g.rotation.y = 0;
  shot(gg, [front(new V3(0, 1.8, 0), 7), q34(new V3(0, 1.8, 0), 6.5)], 'gate.png');
}
// Glove from a plausible hand pose
{
  const h = RA.hands.right; h.isHand = true; h.ok = true;
  const wrist = new V3(0.1, 1.2, -0.3), fingers = [[-0.035, 4], [-0.015, 5], [0.005, 5], [0.025, 5], [0.042, 5]];
  const J = h.J; J[0].p.copy(wrist); J[0].q.set(0, 0, 0, 1); J[0].ok = true;
  // thumb 1-4, fingers base 5,10,15,20
  const lens = [0.045, 0.04, 0.025, 0.022, 0.02];
  for (let fi = 0; fi < 5; fi++) {
    const base = fi === 0 ? 1 : 5 * fi, n = fi === 0 ? 4 : 5, x = [-0.03, -0.02, 0.0, 0.02, 0.037][fi];
    let p = wrist.clone().add(new V3(x * 0.6, 0, -0.01));
    for (let k = 0; k < n; k++) {
      const j = J[base + k]; j.p.copy(p); j.ok = true; j.r = 0.0095 - k * 0.0012;
      const curl = fi === 0 ? 0.2 : 0.18 * k; const dir = new V3(fi === 0 ? -0.6 : x * 2, -Math.sin(curl), -Math.cos(curl)).normalize();
      j.q.setFromUnitVectors(new V3(0, 0, -1), dir);
      p = p.clone().addScaledVector(dir, k === 0 ? (fi === 0 ? 0.03 : 0.07) : lens[k - 1] || 0.02);
    }
  }
  h.wrist.copy(wrist); h.wristQ.copy(J[0].q);
  RA.updateGloves(0.016);
  const g = RA.gloves.right, grp = new THREE.Group(); [g.seg, g.joint, g.tip, g.guard, g.palm].forEach(m => grp.add(m));
  const c = wrist.clone().add(new V3(0, 0, -0.07));
  shot(grp, [{ eye: c.clone().add(new V3(0, 0.25, 0.08)), target: c }, side(c, 0.3), q34(c, 0.26)], 'glove.png');
}
console.log('done');
// ---- Menús: maqueta de colores para ver la distribución ----
{
  RA.setSetting('mode', 'walkers'); RA.setSetting('exercise', 'squat');
  RA.head.p.set(0, 1.6, 0); RA.head.q.set(0, 0, 0, 1);
  const pal = { normal: 0x3355ff, primary: 0xff3399, selected: 0x33ffcc, value: 0xffcc33, tab: 0x666699, danger: 0xff3333, ghost: 0x444444, key: 0x9999ff };
  function paint(m) { m.group.children.forEach((c, i) => { if (i === 0) { c.material.color.setHex(0x221a3a); return; } }); m.widgets.forEach(w => { w.mesh.material.color.setHex(w.kind === 'slider' ? 0xaaaaaa : (pal[w.style] || 0xffffff)); }); }
  const views = [];
  RA.lobbyMenu(true); paint(RA.menu);
  let c = RA.menu.group.position.clone();
  const grp = () => { const g = new THREE.Group(); g.add(RA.menu.group); g.add(RA.stand); return g; };
  const eye = c.clone().add(new V3(0, 0.33, 0.85));
  let g1 = grp(); const t1 = R.collect(g1); views.push(R.render(t1, { eye, target: c, w: 420, h: 420 })); views.push(R.render(t1, { eye: c.clone().add(new V3(1.4, 0.2, 0.6)), target: c.clone().add(new V3(0, -0.4, 0)), w: 420, h: 420 }));
  RA.scene.add(RA.menu.group); RA.scene.add(RA.stand);
  RA.settingsMenu(() => RA.lobbyMenu(), 'ejercicio'); paint(RA.menu);
  let g2 = grp(); views.push(R.render(R.collect(g2), { eye, target: c, w: 420, h: 420 }));
  fs.writeFileSync(out + 'menus.png', R.grid(views, 3)); console.log('menus.png');
}
// ---- Vista del jugador: entorno + arena ----
{
  RA.setSetting('mode', 'walkers'); RA.setSetting('exercise', 'squat');
  RA.layoutArena();
  const sc = RA.scene; sc.updateMatrixWorld(true);
  const tris = R.collect(sc);
  const v1 = R.render(tris, { eye: new V3(0, 1.6, 0), target: new V3(0, 1.9, -10), fov: 90, w: 640, h: 400 });
  const v2 = R.render(tris, { eye: new V3(0, 1.6, 0), target: new V3(10, 3, 0), fov: 90, w: 640, h: 400 });
  const v3 = R.render(tris, { eye: new V3(0, 1.6, 0), target: new V3(0, 6, 10), fov: 90, w: 640, h: 400 });
  const v4 = R.render(tris, { eye: new V3(8, 9, 8), target: new V3(0, 0, -6), fov: 70, w: 640, h: 400 });
  fs.writeFileSync(out + 'world.png', R.grid([v1, v2, v3, v4], 2)); console.log('world.png', tris.length);
}
