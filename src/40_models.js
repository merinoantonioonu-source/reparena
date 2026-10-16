
/* =================== MODELOS =================== */
const RIGS = {};
const MAT_ROBOT = { main: M.robot, paint: M.robotPaint, glow: M.glowSkin, halo: M.haloSkin };
const MAT_ROBOT_STATIC = { main: M.steel, paint: M.paint, glow: M.glow, halo: M.halo };

/* ---------- Segador: esqueleto de pesadilla con patas invertidas ---------- */
function buildRipper() {
  const R = new Rig();
  R.bone('hips', null, 0, 1.12, 0).bone('spine', 'hips', 0, 0.06, -0.02).bone('chest', 'spine', 0, 0.40, 0)
   .bone('neck', 'chest', 0, 0.30, 0.06).bone('head', 'neck', 0, 0.12, 0.02).bone('jaw', 'head', 0, -0.03, 0.035);
  for (const [sd, sx] of [['L', 1], ['R', -1]]) {
    R.bone('sh' + sd, 'chest', sx * 0.25, 0.25, 0).bone('el' + sd, 'sh' + sd, 0, -0.36, 0).bone('ha' + sd, 'el' + sd, 0, -0.34, 0);
    R.bone('th' + sd, 'hips', sx * 0.12, -0.03, 0).bone('kn' + sd, 'th' + sd, 0, -0.46, 0).bone('an' + sd, 'kn' + sd, 0, -0.50, 0);
  }
  const P = (b, g, c, ...t) => R.add(b, 'main', g, c, ...t), GL = (b, g, c, ...t) => R.add(b, 'glow', g, c, ...t), HA = (b, s, c, x, y, z) => R.add(b, 'halo', G.halo(s), c, x, y, z);
  // cadera
  P('hips', G.box(0.3, 0.12, 0.18), C.dark); P('hips', G.box(0.2, 0.08, 0.06), C.steel, 0, -0.03, 0.09);
  P('hips', G.cyl(0.05, 0.05, 0.34, 10), C.black, 0, -0.03, 0, 0, 0, Math.PI / 2);
  for (const s of [-1, 1]) P('hips', G.cyl(0.014, 0.014, 0.18, 6), C.chrome, s * 0.1, 0.07, -0.06, 0.4, 0, 0);
  for (let i = 0; i < 4; i++) P('hips', G.box(0.06 - i * 0.01, 0.05, 0.07), i % 2 ? C.steel : C.dark, 0, -0.02 - i * 0.03, -0.12 - i * 0.06, -0.5, 0, 0);
  P('hips', G.cone(0.02, 0.12, 5), C.chrome, 0, -0.14, -0.33, -2.1, 0, 0);
  for (const [sd, sx] of [['L', 1], ['R', -1]]) {
    const th = 'th' + sd, kn = 'kn' + sd, an = 'an' + sd, sh = 'sh' + sd, el = 'el' + sd, ha = 'ha' + sd;
    P(th, G.sph(0.065, 10, 8), C.black); P(th, G.box(0.08, 0.4, 0.1), C.dark, 0, -0.22, 0);
    P(th, G.box(0.11, 0.26, 0.035), C.steel, 0, -0.18, 0.065, 0.06, 0, 0); P(th, G.cyl(0.015, 0.015, 0.34, 6), C.chrome, 0, -0.22, -0.065);
    P(th, G.box(0.03, 0.08, 0.05), C.dark, sx * 0.06, -0.1, 0);
    P(kn, G.sph(0.058, 10, 8), C.black); P(kn, G.cone(0.028, 0.14, 6), C.steel, 0, 0.03, 0.07, 1.25, 0, 0);
    P(kn, G.box(0.07, 0.46, 0.08), C.dark, 0, -0.25, 0); P(kn, G.box(0.09, 0.3, 0.03), C.steel, 0, -0.22, 0.05);
    P(kn, G.cyl(0.013, 0.013, 0.36, 6), C.chrome, 0, -0.25, -0.055);
    P(an, G.sph(0.045, 10, 8), C.black); P(an, G.box(0.055, 0.3, 0.065), C.dark, 0, -0.15, 0);
    for (const k of [-1, 0, 1]) { P(an, G.box(0.026, 0.024, 0.15), C.steel, k * 0.045, -0.315, 0.07, 0, k * 0.28, 0); P(an, G.cone(0.013, 0.07, 5), C.chrome, k * 0.068, -0.325, 0.175, Math.PI / 2 + 0.35, 0, 0); }
    P(an, G.cone(0.012, 0.07, 5), C.chrome, 0, -0.3, -0.05, -Math.PI / 2 - 0.4, 0, 0);
    // brazo largo con garras
    P(sh, G.sph(0.06, 10, 8), C.black); P(sh, G.box(0.13, 0.07, 0.16), C.steel, sx * 0.02, 0.045, 0, 0, 0, -sx * 0.25);
    P(sh, G.cone(0.025, 0.13, 5), C.dark, sx * 0.07, 0.1, 0, 0, 0, -sx * 0.9);
    P(sh, G.box(0.055, 0.34, 0.065), C.dark, 0, -0.19, 0); P(sh, G.cyl(0.012, 0.012, 0.28, 6), C.chrome, sx * 0.04, -0.18, 0.02);
    P(el, G.sph(0.045, 10, 8), C.black); P(el, G.box(0.05, 0.32, 0.085), C.steel, 0, -0.17, 0);
    for (let k = 0; k < 3; k++) P(el, G.cone(0.015, 0.09, 4), C.dark, sx * 0.045, -0.07 - k * 0.09, -0.02, 0, 0, -sx * 1.4);
    P(ha, G.box(0.075, 0.06, 0.045), C.dark, 0, -0.03, 0);
    for (const k of [-1, 0, 1]) { P(ha, G.box(0.013, 0.21, 0.02), C.steel, k * 0.026, -0.16, 0.03, -0.28, 0, 0); P(ha, G.cone(0.009, 0.07, 4), C.chrome, k * 0.026, -0.29, 0.07, 2.65, 0, 0); }
  }
  // columna vertebral expuesta
  for (let i = 0; i < 6; i++) P('spine', G.box(0.1 - i * 0.004, 0.045, 0.08), i % 2 ? C.steel : C.dark, 0, 0.03 + i * 0.064, -0.02);
  for (const s of [-1, 1]) P('spine', G.cyl(0.011, 0.011, 0.42, 6), C.black, s * 0.065, 0.2, -0.05);
  P('spine', G.cyl(0.017, 0.017, 0.36, 6), C.chrome, 0, 0.2, 0.05);
  // caja torácica con núcleo rojo
  P('chest', G.box(0.07, 0.32, 0.05), C.steel, 0, 0.13, 0.11);
  for (let i = 0; i < 4; i++) { const r = 0.15 - Math.abs(i - 1.5) * 0.012; P('chest', G.tor(r, 0.011, 5, 14, Math.PI * 1.55), C.bone, 0, 0.02 + i * 0.075, 0, Math.PI / 2, 0, Math.PI * 0.725); }
  GL('chest', G.sph(0.055, 12, 8), C.red, 0, 0.12, 0.01); HA('chest', 0.45, C.redHalo, 0, 0.12, 0.09);
  P('chest', G.box(0.3, 0.34, 0.05), C.dark, 0, 0.13, -0.1); P('chest', G.box(0.52, 0.08, 0.16), C.steel, 0, 0.27, -0.01);
  for (const s of [-1, 1]) P('chest', G.cone(0.035, 0.22, 6), C.steel, s * 0.22, 0.37, -0.02, 0, 0, -s * 0.5);
  for (let k = 0; k < 3; k++) P('chest', G.cone(0.025, 0.16, 5), C.dark, 0, 0.06 + k * 0.1, -0.15, -1.1, 0, 0);
  // cuello y cráneo
  P('neck', G.cyl(0.03, 0.04, 0.14, 8), C.dark, 0, 0.06, 0);
  for (const s of [-1, 1]) P('neck', G.cyl(0.008, 0.008, 0.16, 5), C.black, s * 0.035, 0.06, -0.02, 0.2, 0, 0);
  P('head', G.sph(1, 16, 12), C.bone, 0, 0.07, -0.01, 0, 0, 0, 0.105, 0.115, 0.135);
  P('head', G.box(0.19, 0.03, 0.06), C.dark, 0, 0.085, 0.095, -0.25, 0, 0);
  for (const s of [-1, 1]) { P('head', G.sph(0.03, 10, 8), C.black, s * 0.042, 0.05, 0.1); GL('head', G.sph(0.016, 8, 6), C.red, s * 0.042, 0.05, 0.118); HA('head', 0.14, C.redHalo, s * 0.042, 0.05, 0.13); P('head', G.box(0.03, 0.06, 0.07), C.steel, s * 0.085, 0.02, 0.05); }
  P('head', G.cone(0.012, 0.03, 3), C.black, 0, 0.018, 0.125, Math.PI, 0, 0);
  P('head', G.box(0.17, 0.035, 0.05), C.bone, 0, -0.005, 0.08);
  for (let i = 0; i < 8; i++) { const a = (i / 7 - 0.5) * 1.6; P('head', G.cone(0.0075, 0.034, 4), C.chrome, Math.sin(a) * 0.075, -0.036, 0.07 + Math.cos(a) * 0.035, Math.PI, 0, 0); }
  for (let k = 0; k < 4; k++) P('head', G.cone(0.014, 0.08, 4), C.dark, 0, 0.17 - k * 0.02, -0.02 - k * 0.045, -0.6 - k * 0.25, 0, 0);
  P('jaw', G.box(0.15, 0.028, 0.11), C.bone, 0, -0.025, 0.05); P('jaw', G.cyl(0.012, 0.012, 0.18, 6), C.black, 0, 0, 0, 0, 0, Math.PI / 2);
  for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 1.5; P('jaw', G.cone(0.007, 0.03, 4), C.chrome, Math.sin(a) * 0.065, -0.002, 0.06 + Math.cos(a) * 0.035); }
  const r = R.build(); r.legL = [0.46, 0.5, 0.33]; r.hipOff = -0.03; r.kind = 'ripper'; return r;
}

/* ---------- Destructor (y Coloso): mole blindada con cañón rotativo ---------- */
function buildDestroyer(boss) {
  const R = new Rig();
  R.bone('hips', null, 0, 1.0, 0).bone('spine', 'hips', 0, 0.08, 0).bone('chest', 'spine', 0, 0.2, 0)
   .bone('head', 'chest', 0, 0.4, 0.2).bone('jaw', 'head', 0, -0.06, 0.08)
   .bone('shL', 'chest', 0.4, 0.32, 0).bone('elL', 'shL', 0, -0.36, 0).bone('clawL', 'elL', 0, -0.38, 0)
   .bone('shR', 'chest', -0.4, 0.32, 0).bone('elR', 'shR', 0, -0.36, 0).bone('gunR', 'elR', 0, -0.2, 0);
  for (const [sd, sx] of [['L', 1], ['R', -1]]) R.bone('th' + sd, 'hips', sx * 0.17, -0.04, 0).bone('kn' + sd, 'th' + sd, 0, -0.47, 0).bone('an' + sd, 'kn' + sd, 0, -0.45, 0);
  const P = (b, g, c, ...t) => R.add(b, 'main', g, c, ...t), PT = (b, g, c, ...t) => R.add(b, 'paint', g, c, ...t), GL = (b, g, c, ...t) => R.add(b, 'glow', g, c, ...t), HA = (b, s, c, x, y, z) => R.add(b, 'halo', G.halo(s), c, x, y, z);
  const pc = boss ? C.crimson : C.redPaint;
  P('hips', G.box(0.42, 0.18, 0.3), C.dark);
  for (const s of [-1, 0, 1]) PT('hips', G.box(0.14, 0.2, 0.04), pc, s * 0.15, -0.08, 0.16, 0.15, 0, 0);
  for (const [sd, sx] of [['L', 1], ['R', -1]]) {
    const th = 'th' + sd, kn = 'kn' + sd, an = 'an' + sd;
    P(th, G.sph(0.09, 10, 8), C.black); PT(th, G.box(0.16, 0.42, 0.18), pc, 0, -0.22, 0);
    for (const s of [-1, 1]) P(th, G.cyl(0.018, 0.018, 0.36, 6), C.chrome, s * 0.06, -0.22, -0.1);
    P(kn, G.sph(0.08, 10, 8), C.black); P(kn, G.box(0.17, 0.16, 0.06), C.steel, 0, 0.0, 0.1, -0.3, 0, 0); P(kn, G.cone(0.03, 0.12, 5), C.dark, 0, 0.03, 0.15, 1.35, 0, 0);
    P(kn, G.box(0.13, 0.42, 0.15), C.dark, 0, -0.23, 0); PT(kn, G.box(0.15, 0.24, 0.05), pc, 0, -0.18, 0.08);
    P(kn, G.cyl(0.02, 0.02, 0.34, 6), C.chrome, 0, -0.22, -0.09);
    P(an, G.sph(0.06, 10, 8), C.black); P(an, G.box(0.22, 0.09, 0.34), C.dark, 0, -0.05, 0.06); P(an, G.box(0.24, 0.05, 0.12), C.steel, 0, -0.06, 0.24);
    for (const k of [-1, 1]) P(an, G.cone(0.02, 0.07, 4), C.chrome, k * 0.08, -0.07, 0.32, Math.PI / 2 + 0.3, 0, 0);
  }
  P('spine', G.cyl(0.11, 0.13, 0.22, 10), C.black, 0, 0.1, 0);
  // torso jorobado
  PT('chest', G.box(0.66, 0.48, 0.44), pc, 0, 0.22, 0);
  P('chest', G.box(0.5, 0.3, 0.06), C.steel, 0, 0.18, 0.24, 0.12, 0, 0);
  for (let i = 0; i < 4; i++) P('chest', G.box(0.32, 0.022, 0.02), C.black, 0, 0.1 + i * 0.05, 0.275);
  P('chest', G.box(0.52, 0.32, 0.28), C.dark, 0, 0.42, -0.14);
  for (const s of [-1, 1]) { P('chest', G.cyl(0.05, 0.055, 0.42, 10), C.gun, s * 0.15, 0.55, -0.26); P('chest', G.cyl(0.058, 0.058, 0.05, 10), C.black, s * 0.15, 0.77, -0.26); }
  for (let k = 0; k < 4; k++) P('chest', G.cone(0.035, 0.18, 5), C.steel, (k % 2 ? 1 : -1) * 0.06, 0.58 - k * 0.02, -0.08 - k * 0.07, -0.9, 0, 0);
  if (boss) for (const s of [-1, 1]) { PT('chest', G.box(0.22, 0.2, 0.26), pc, s * 0.36, 0.62, -0.05); for (let i = 0; i < 6; i++) P('chest', G.cyl(0.025, 0.025, 0.02, 8), C.black, s * 0.36 + ((i % 3) - 1) * 0.06, 0.6 + Math.floor(i / 3) * 0.07, 0.085, Math.PI / 2, 0, 0); }
  // cabeza hundida
  P('head', G.box(0.26, 0.18, 0.24), C.steel, 0, 0.02, 0);
  P('head', G.box(0.28, 0.05, 0.1), C.dark, 0, 0.1, 0.09, 0.35, 0, 0);
  if (boss) {
    for (let i = 0; i < 6; i++) { const x = ((i % 3) - 1) * 0.07, y = 0.035 - Math.floor(i / 3) * 0.045; GL('head', G.sph(0.016, 8, 6), C.red, x, y, 0.122); HA('head', 0.13, C.redHalo, x, y, 0.13); }
  } else { GL('head', G.box(0.2, 0.024, 0.012), C.red, 0, 0.03, 0.121); HA('head', 0.18, C.redHalo, -0.05, 0.03, 0.13); HA('head', 0.18, C.redHalo, 0.05, 0.03, 0.13); }
  for (const s of [-1, 1]) {
    const hs = boss ? 1.5 : 1;
    P('head', G.cone(0.04 * hs, 0.2 * hs, 6), C.bone, s * 0.13, 0.13, -0.02, -0.3, 0, -s * 0.7);
    P('head', G.cone(0.022 * hs, 0.14 * hs, 5), C.bone, s * (0.13 + 0.12 * hs), 0.13 + 0.1 * hs, 0.02, 0.6, 0, -s * 0.2);
  }
  if (boss) for (let k = 0; k < 5; k++) P('head', G.cone(0.02, 0.1, 4), C.dark, (k - 2) * 0.05, 0.14, -0.08, -0.4, 0, (k - 2) * 0.15);
  P('jaw', G.box(0.22, 0.07, 0.06), C.dark, 0, -0.02, 0.05);
  for (let i = 0; i < 5; i++) P('jaw', G.box(0.012, 0.05, 0.015), C.chrome, (i - 2) * 0.035, -0.02, 0.085);
  // hombros
  for (const [sd, sx] of [['L', 1], ['R', -1]]) {
    const sh = 'sh' + sd, el = 'el' + sd;
    P(sh, G.sph(0.1, 10, 8), C.black); PT(sh, G.box(0.28, 0.14, 0.32), pc, sx * 0.04, 0.08, 0, 0, 0, -sx * 0.3);
    for (let k = 0; k < 3; k++) P(sh, G.cone(0.03, 0.16, 5), C.steel, sx * (0.04 + k * 0.03), 0.17, (k - 1) * 0.09, 0, 0, -sx * 0.5);
    P(sh, G.box(0.13, 0.34, 0.14), C.dark, 0, -0.2, 0);
    P(el, G.sph(0.08, 10, 8), C.black);
  }
  // brazo izquierdo: pinza trituradora
  PT('elL', G.box(0.16, 0.36, 0.17), pc, 0, -0.2, 0); for (const s of [-1, 1]) P('elL', G.cyl(0.018, 0.018, 0.3, 6), C.chrome, s * 0.09, -0.2, 0.05);
  P('clawL', G.box(0.18, 0.1, 0.15), C.dark, 0, -0.04, 0);
  for (const k of [-1, 0, 1]) { P('clawL', G.box(0.04, 0.24, 0.05), C.steel, k * 0.06, -0.19, 0.03, -0.3, 0, 0); P('clawL', G.cone(0.025, 0.1, 4), C.chrome, k * 0.06, -0.33, 0.1, 2.6, 0, 0); }
  // brazo derecho: cañón rotativo
  P('elR', G.cyl(0.1, 0.11, 0.3, 12), C.dark, 0, -0.16, 0); P('elR', G.box(0.08, 0.16, 0.14), C.gun, -0.12, -0.15, 0);
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; P('gunR', G.cyl(0.016, 0.016, 0.42, 6), C.gun, Math.cos(a) * 0.05, -0.22, Math.sin(a) * 0.05); }
  P('gunR', G.cyl(0.08, 0.08, 0.03, 12), C.dark, 0, -0.38, 0); GL('gunR', G.tor(0.05, 0.006, 4, 16), C.orange, 0, -0.42, 0, Math.PI / 2, 0, 0);
  const r = R.build(); r.legL = [0.47, 0.45, 0.09]; r.hipOff = -0.04; r.kind = boss ? 'colossus' : 'destroyer'; return r;
}

/* ---------- Araña: cuerpo con skinning; las patas van instanciadas aparte ---------- */
const SPIDER_LEGS = [0, 1, 2, 3].flatMap(i => [1, -1].map(s => ({ i, s, hip: new V3(s * 0.026, -0.002, 0.024 - i * 0.014), ang: [0.5, 1.1, 1.85, 2.5][i], L: [0.13, 0.115, 0.11, 0.13][i], group: (i + (s > 0 ? 0 : 1)) % 2 })));
function buildSpider() {
  const R = new Rig();
  R.bone('body', null, 0, 0.055, 0).bone('abd', 'body', 0, 0.004, -0.04)
   .bone('fangL', 'body', 0.011, -0.008, 0.05).bone('fangR', 'body', -0.011, -0.008, 0.05)
   .bone('palpL', 'body', 0.02, -0.006, 0.05).bone('palpR', 'body', -0.02, -0.006, 0.05);
  const P = (b, g, c, ...t) => R.add(b, 'main', g, c, ...t), GS = (b, g, c, ...t) => R.add(b, 'gloss', g, c, ...t);
  P('body', G.sph(1, 18, 12), C.chitin, 0, 0, 0.005, 0, 0, 0, 0.036, 0.021, 0.046);
  P('body', spikes(0, 0, 0.005, 0.036, 0.021, 0.046, 200, 0.006, 0.0009, { upper: true }), C.hair);
  P('body', G.sph(1, 12, 8), C.chitin, 0, -0.012, 0.005, 0, 0, 0, 0.03, 0.012, 0.038);
  for (const s of [-1, 1]) {
    GS('body', G.sph(0.0058, 10, 8), C.fang, s * 0.009, 0.014, 0.044); GS('body', G.sph(0.0036, 8, 6), C.fang, s * 0.018, 0.012, 0.04);
    GS('body', G.sph(0.0026, 6, 5), C.fang, s * 0.008, 0.02, 0.031); GS('body', G.sph(0.0026, 6, 5), C.fang, s * 0.016, 0.018, 0.034);
    R.add('body', 'glow', G.sph(0.0027, 8, 6), col(1, 0.07, 0.02), s * 0.0093, 0.0152, 0.0488); // ojos rojos: brillan más cuanto más cerca y más rabiosa
    R.add('body', 'glow', G.sph(0.0017, 6, 5), col(1, 0.07, 0.02), s * 0.0178, 0.0122, 0.0425);
    const f = s > 0 ? 'fangL' : 'fangR', p = s > 0 ? 'palpL' : 'palpR';
    P(f, G.sph(1, 10, 8), C.chel, 0, 0, 0, 0.25, 0, 0, 0.0095, 0.013, 0.0095);
    P(f, spikes(0, 0, 0, 0.0095, 0.013, 0.0095, 30, 0.004, 0.0007), C.hair);
    GS(f, G.cone(0.0026, 0.014, 6), C.fang, -s * 0.002, -0.014, 0.004, Math.PI - 0.35, 0, s * 0.35);
    P(p, limbBetween(new V3(0, 0, 0), new V3(s * 0.006, -0.004, 0.016), 0.003, 0.0026), C.legDark);
    P(p, limbBetween(new V3(s * 0.006, -0.004, 0.016), new V3(s * 0.009, -0.016, 0.026), 0.0026, 0.0022), C.legDark);
    P(p, G.sph(0.0038, 8, 6), C.chel, s * 0.009, -0.017, 0.026);
  }
  R.add('abd', 'pat', G.sph(1, 20, 14), C.white, 0, 0.012, -0.058, 0, 0, 0, 0.048, 0.04, 0.062);
  P('abd', spikes(0, 0.012, -0.058, 0.048, 0.04, 0.062, 320, 0.008, 0.001, { back: -0.6 }), C.hair);
  P('abd', G.cyl(0.006, 0.008, 0.014, 8), C.chitin, 0, 0.004, -0.004, Math.PI / 2, 0, 0);
  for (const s of [-1, 1]) P('abd', G.cone(0.003, 0.011, 5), C.chitin, s * 0.004, 0.002, -0.121, -Math.PI / 2 - 0.3, 0, 0);
  return R.build();
}
const SPLEGS = { fem: null, tib: null, n: 0 };
function legSegGeo(r0, r1, bands, hairN, hairLen) {
  const parts = [];
  for (const [y0, y1, c] of bands) { const g = G.cyl(lerp(r0, r1, y1), lerp(r0, r1, y0), y1 - y0, 7); g.translate(0, (y0 + y1) / 2, 0); parts.push(tint(ensureAttrs(g.toNonIndexed()), c)); }
  const pos = [];
  for (let i = 0; i < hairN; i++) {
    const y = Math.random(), a = Math.random() * TAU, r = lerp(r0, r1, y), n = new V3(Math.cos(a), 0, Math.sin(a)), t = new V3(-n.z, 0, n.x).multiplyScalar(0.0007);
    const p = new V3(n.x * r, y, n.z * r), tip = p.clone().addScaledVector(n, hairLen * (0.5 + Math.random())).add(new V3(0, 0.04 + Math.random() * 0.05, 0));
    pos.push(p.x - t.x, p.y, p.z - t.z, p.x + t.x, p.y, p.z + t.z, tip.x, tip.y, tip.z);
  }
  const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hg.computeVertexNormals();
  parts.push(tint(ensureAttrs(hg), C.hair));
  return mergeGeos(parts);
}
function initSpiderLegs() {
  const fem = legSegGeo(0.0062, 0.0046, [[0, 0.1, C.legRing], [0.1, 0.9, C.legDark], [0.9, 1, C.legRing]], 46, 0.006);
  const tib = legSegGeo(0.0046, 0.0013, [[0, 0.08, C.legRing], [0.08, 0.52, C.legDark], [0.52, 0.6, C.legRing], [0.6, 1, C.legDark]], 40, 0.005);
  SPLEGS.fem = new THREE.InstancedMesh(fem, M.leg, 200); SPLEGS.tib = new THREE.InstancedMesh(tib, M.leg, 200);
  for (const m of [SPLEGS.fem, SPLEGS.tib]) { m.frustumCulled = false; m.castShadow = true; m.count = 0; if (m.instanceMatrix.setUsage) m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); arena.add(m); }
}
const _lq = new Q4(), _ls = new V3(), _ld = new V3(), _lm = new THREE.Matrix4();
function legInstance(mesh, i, a, b, s) {
  _ld.subVectors(b, a); const len = _ld.length(); if (len < 1e-5) { _ld.set(0, 1, 0); }
  _lq.setFromUnitVectors(_up, _ld.normalize()); _lm.compose(a, _lq, _ls.set(s, Math.max(len, 1e-4), s)); mesh.setMatrixAt(i, _lm);
}

/* ---------- Drones (cuadricóptero, bombardero, nodriza) ---------- */
function buildDrone(v) {
  const R = new Rig(), n = v === 'drone' ? 4 : 6, armL = v === 'carrier' ? 0.26 : v === 'bomber' ? 0.21 : 0.18;
  R.bone('body', null);
  for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * TAU; R.bone('r' + i, 'body', Math.cos(a) * armL, 0.045, Math.sin(a) * armL); }
  R.bone('cam', 'body', 0, -0.04, 0.08);
  const P = (b, g, c, ...t) => R.add(b, 'main', g, c, ...t), GL = (b, g, c, ...t) => R.add(b, 'glow', g, c, ...t), HA = (b, s, c, x, y, z) => R.add(b, 'halo', G.halo(s), c, x, y, z);
  const shell = v === 'carrier' ? C.dark : v === 'bomber' ? C.olive : C.gun;
  P('body', G.box(0.15, 0.035, 0.21, 0.3), C.carbon); P('body', G.sph(0.1, 16, 8, 0.3, 0, TAU, 0, Math.PI / 2), shell, 0, 0.015, 0, 0, 0, 0, 1, 0.55, 1.3);
  P('body', G.box(0.03, 0.006, 0.18), C.red, 0, 0.068, 0);
  P('body', G.box(0.1, 0.045, 0.12, 0.3), C.black, 0, -0.035, -0.01);
  for (let i = 0; i < n; i++) {
    const a = (i + 0.5) / n * TAU, x = Math.cos(a) * armL, z = Math.sin(a) * armL;
    P('body', G.box(armL, 0.016, 0.028, 0.3), C.carbon, x / 2, 0.012, z / 2, 0, -a, 0);
    P('body', G.cyl(0.022, 0.027, 0.04, 12), C.gun, x, 0.03, z);
    P('body', G.box(0.006, 0.06, 0.006), C.black, x * 0.7, -0.02, z * 0.7);
    P('r' + i, G.cyl(0.008, 0.008, 0.02, 8), C.chrome);
    R.add('r' + i, 'rotor', G.cylRaw(armL * 0.55, armL * 0.55, 0.002, 24), C.white, 0, 0.008, 0);
  }
  for (const s of [-1, 1]) { GL('body', G.sph(0.008, 6, 5), C.red, s * 0.05, 0.0, 0.106); HA('body', 0.07, C.redHalo, s * 0.05, 0, 0.11); }
  GL('body', G.sph(0.007, 6, 5), C.blue, 0, 0.01, -0.106); HA('body', 0.06, C.blue, 0, 0.01, -0.11);
  P('body', G.cyl(0.003, 0.003, 0.08, 5), C.black, 0.04, 0.09, -0.06); GL('body', G.sph(0.006, 6, 5), C.red, 0.04, 0.132, -0.06);
  P('cam', G.sph(0.03, 12, 8), C.black); GL('cam', G.sph(0.012, 8, 6), C.red, 0, 0, 0.025); HA('cam', 0.14, C.redHalo, 0, 0, 0.032);
  if (v === 'bomber') {
    P('body', G.cyl(0.035, 0.035, 0.18, 12), C.olive, 0, -0.09, 0, Math.PI / 2, 0, 0);
    P('body', G.cone(0.035, 0.05, 12), C.olive, 0, -0.09, 0.115, Math.PI / 2, 0, 0);
    for (let k = 0; k < 4; k++) P('body', G.box(0.002, 0.04, 0.04), C.dark, 0, -0.09, -0.1, 0, 0, k * Math.PI / 4);
    P('body', G.cyl(0.036, 0.036, 0.02, 12), C.hazard, 0, -0.09, 0.03, Math.PI / 2, 0, 0);
    GL('body', G.sph(0.008, 6, 5), C.amber, 0, -0.05, 0.05); HA('body', 0.1, C.amber, 0, -0.05, 0.05);
  }
  if (v === 'carrier') {
    P('body', G.sph(0.16, 18, 10, 0.4, 0, TAU, 0, Math.PI / 2), C.dark, 0, 0.02, 0, 0, 0, 0, 1, 0.6, 1);
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; GL('body', G.sph(0.012, 6, 5), C.red, Math.cos(a) * 0.15, 0.03, Math.sin(a) * 0.15); HA('body', 0.1, C.redHalo, Math.cos(a) * 0.16, 0.03, Math.sin(a) * 0.16); P('body', G.cone(0.014, 0.1, 5), C.steel, Math.cos(a) * 0.1, -0.08, Math.sin(a) * 0.1, Math.PI, 0, 0); }
    for (const s of [-1, 1]) P('body', G.cyl(0.018, 0.018, 0.2, 8), C.gun, s * 0.12, -0.04, 0.08, Math.PI / 2, 0, 0);
  }
  return R.build();
}

/* ---------- Avispa gigante ---------- */
function buildHornet() {
  const R = new Rig();
  R.bone('body', null).bone('head', 'body', 0, 0.004, 0.05).bone('abd', 'body', 0, -0.004, -0.032)
   .bone('mandL', 'head', 0.008, -0.012, 0.018).bone('mandR', 'head', -0.008, -0.012, 0.018);
  for (const [sd, sx] of [['L', 1], ['R', -1]]) R.bone('w' + sd + '1', 'body', sx * 0.012, 0.02, 0.014).bone('w' + sd + '2', 'body', sx * 0.012, 0.018, -0.002);
  const P = (b, g, c, ...t) => R.add(b, 'main', g, c, ...t), GS = (b, g, c, ...t) => R.add(b, 'gloss', g, c, ...t);
  P('body', G.sph(1, 14, 10), C.waspK, 0, 0, 0, 0, 0, 0, 0.024, 0.022, 0.032);
  P('body', spikes(0, 0, 0, 0.024, 0.022, 0.032, 140, 0.004, 0.0007), col(0.45, 0.3, 0.12));
  P('body', G.sph(1, 10, 8), C.waspY, 0, 0.017, 0.006, 0, 0, 0, 0.012, 0.006, 0.012);
  for (const s of [-1, 1]) P('body', G.sph(1, 8, 6), C.waspO, s * 0.016, 0.012, 0.02, 0, 0, 0, 0.006, 0.005, 0.006);
  P('head', G.sph(1, 14, 10), C.waspY, 0, 0, 0.008, 0, 0, 0, 0.02, 0.019, 0.014);
  for (const s of [-1, 1]) {
    GS('head', G.sph(1, 12, 10), C.eyeWasp, s * 0.014, 0.004, 0.006, 0, 0, s * 0.3, 0.008, 0.015, 0.011);
    P('head', G.tube([new V3(s * 0.005, 0.014, 0.018), new V3(s * 0.012, 0.03, 0.034), new V3(s * 0.024, 0.036, 0.052), new V3(s * 0.03, 0.03, 0.066)], 0.0012, 10, 4), C.black);
    const md = s > 0 ? 'mandL' : 'mandR';
    P(md, G.box(0.012, 0.004, 0.008), C.waspO, -s * 0.003, 0, 0.004, 0, s * 0.5, 0); P(md, G.cone(0.003, 0.008, 4), C.black, -s * 0.008, 0, 0.009, Math.PI / 2, 0, 0);
  }
  for (let i = 0; i < 3; i++) GS('head', G.sph(0.0018, 5, 4), C.eyeWasp, (i - 1) * 0.005, 0.018, 0.004);
  // patas colgando
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
    const a = new V3(s * 0.012, -0.016, 0.016 - i * 0.012), b = new V3(s * 0.03, -0.03, 0.02 - i * 0.016), c = new V3(s * 0.034, -0.058, 0.012 - i * 0.022), d = new V3(s * 0.036, -0.078, 0.004 - i * 0.03);
    P('body', limbBetween(a, b, 0.0024, 0.002), C.waspK); P('body', limbBetween(b, c, 0.002, 0.0016), C.waspY); P('body', limbBetween(c, d, 0.0014, 0.001), C.waspO);
  }
  // abdomen con bandas
  P('abd', G.cyl(0.004, 0.004, 0.01, 8), C.waspK, 0, 0, -0.004, Math.PI / 2, 0, 0);
  const prof = t => 0.023 * Math.pow(Math.sin(Math.PI * (t * 0.92 + 0.06)), 0.7);
  const N = 7, Lz = 0.075;
  for (let k = 0; k < N; k++) {
    const t0 = k / N, t1 = (k + 1) / N, z0 = -0.009 - t0 * Lz, z1 = -0.009 - t1 * Lz;
    const mid = (t0 + t1) / 2, zm = -0.009 - mid * Lz;
    P('abd', G.cyl(prof(mid), prof(t0), z0 - zm, 14), C.waspY, 0, 0, (z0 + zm) / 2, -Math.PI / 2, 0, 0);
    P('abd', G.cyl(prof(t1), prof(mid), zm - z1, 14), C.waspK, 0, 0, (zm + z1) / 2, -Math.PI / 2, 0, 0);
  }
  GS('abd', G.cone(0.0022, 0.014, 6), C.waspK, 0, -0.002, -0.09, -Math.PI / 2, 0, 0);
  // alas
  for (const [sd, sx] of [['L', 1], ['R', -1]]) for (const [k, w, h] of [[1, 0.06, 0.018], [2, 0.042, 0.013]]) {
    const g = new THREE.PlaneGeometry(w, h); g.translate(w / 2, 0, 0); g.rotateX(-Math.PI / 2); if (sx < 0) g.scale(-1, 1, 1); g.rotateY(sx * -0.35);
    R.add('w' + sd + k, 'wing', g, C.white);
  }
  return R.build();
}

/* ---------- Tentáculo del charco (modo Barras) ---------- */
function buildTentacle() {
  const R = new Rig(), N = 9, L = 0.1, rad = i => 0.052 * (1 - i / N) + 0.007;
  for (let i = 0; i < N; i++) R.bone('t' + i, i ? 't' + (i - 1) : null, 0, i ? L : 0, 0);
  for (let i = 0; i < N; i++) {
    const r0 = rad(i), r1 = rad(i + 1), b = 't' + i;
    R.add(b, 'main', G.cyl(r1, r0, L * 1.05, 10), i % 2 ? col(0.2, 0.07, 0.2) : col(0.25, 0.09, 0.24), 0, L / 2, 0);
    for (const s of [-1, 1]) R.add(b, 'main', G.sph(1, 8, 6), col(0.78, 0.5, 0.56), s * r0 * 0.45, L * 0.5, r0 * 0.78, 0, 0, 0, r0 * 0.34, r0 * 0.34, r0 * 0.2); // ventosas en la cara interior
    if (i % 2) R.add(b, 'glow', G.sph(0.006, 6, 5), C.green, 0, L * 0.5, -r0 * 0.92);
  }
  R.add('t' + (N - 1), 'main', G.cone(0.011, 0.05, 8), col(0.2, 0.07, 0.2), 0, L + 0.02, 0);
  return R.build();
}
M.tentacleSkin = std({ vertexColors: true, normalMap: SURF.chitin.normal, roughness: 0.22, metalness: 0.05, skinning: true });

/* ---------- Arcos de energía ---------- */
const ARC_FRAMES = {};
const arcLineMat = new THREE.LineBasicMaterial({ color: 0xffd0c8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
function arcFrame(H) {
  const key = H.toFixed(2); if (ARC_FRAMES[key]) return ARC_FRAMES[key].clone();
  const k = new Kit();
  for (const s of [-1, 1]) {
    k.add('steel', G.box(0.24, H, 0.34), C.dark, s * 1.13, H / 2, 0);
    k.add('steel', G.box(0.5, 0.1, 0.62), C.gun, s * 1.13, 0.05, 0);
    k.add('steel', G.box(0.3, 0.06, 0.4), C.gun, s * 1.13, H * 0.33, 0);
    k.add('steel', G.box(0.3, 0.06, 0.4), C.gun, s * 1.13, H * 0.66, 0);
    for (let i = 0; i < 5; i++) k.add('paint', G.box(0.25, 0.12, 0.35), i % 2 ? C.black : C.hazard, s * 1.13, 0.2 + i * 0.12, 0);
    k.add('glow', G.box(0.02, H - 0.25, 0.04), C.red, s * 1.0, H / 2, 0);
    k.add('steel', G.cyl(0.03, 0.03, H - 0.2, 8), C.chrome, s * 1.28, H / 2, 0.12);
  }
  k.add('steel', G.box(2.5, 0.22, 0.38), C.dark, 0, H + 0.05, 0);
  k.add('paint', G.box(2.3, 0.1, 0.4), C.hazard, 0, H - 0.1, 0);
  for (let i = 0; i < 3; i++) k.add('glow', G.sph(0.04, 8, 6), C.red, (i - 1) * 0.6, H + 0.18, 0.1);
  const g = k.build({ steel: M.steel, paint: M.paint, glow: M.glow }, { cast: true, receive: true });
  ARC_FRAMES[key] = g; return g.clone();
}
function makeArcObj(barY, H, tilt = 0) {
  const grp = new THREE.Group(); grp.add(arcFrame(H));
  const bar = new THREE.Group(); bar.position.y = barY; bar.rotation.z = tilt; grp.add(bar);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffb0a0, toneMapped: false });
  const core = new THREE.Mesh(G.cylRaw(0.016, 0.016, 2.0, 8), coreMat); core.rotation.z = Math.PI / 2; bar.add(core);
  const glowMat = new THREE.MeshBasicMaterial({ map: TX.beam, color: 0xff2a14, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
  for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(2.05, 0.26), glowMat); p.rotation.x = i * Math.PI / 3; bar.add(p); }
  for (const s of [-1, 1]) { const e = new THREE.Mesh(G.box(0.1, 0.12, 0.2), M.steel); tint(e.geometry, C.gun); e.position.x = s * 0.98; bar.add(e); }
  const lines = [0, 1].map(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(26 * 3), 3)); const l = new THREE.Line(g, arcLineMat); l.frustumCulled = false; bar.add(l); return l; });
  const curtainMat = new THREE.MeshBasicMaterial({ map: TX.scan, color: 0xff2010, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
  const ch = Math.max(0.05, H - barY - 0.05), curtain = new THREE.Mesh(new THREE.PlaneGeometry(2.0, ch), curtainMat); curtain.position.y = barY + ch / 2 + 0.02; grp.add(curtain);
  if (tilt) { // cortina trapezoidal: el borde de abajo sigue a la barra inclinada
    const p = curtain.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, Math.min(ch / 2 - 0.02, p.getY(i) + Math.tan(tilt) * p.getX(i)));
    p.needsUpdate = true;
  }
  return { grp, bar, coreMat, glowMat, curtainMat, curtain, lines };
}
function zapLines(lines) {
  for (const l of lines) {
    const a = l.geometry.attributes.position, n = a.count;
    for (let i = 0; i < n; i++) { const t = i / (n - 1), x = -0.95 + t * 1.9, k = Math.sin(t * Math.PI); a.setXYZ(i, x, (Math.random() - 0.5) * 0.06 * k, (Math.random() - 0.5) * 0.06 * k); }
    a.needsUpdate = true;
  }
}

/* ---------- Guantes robóticos (seguimiento de manos) ---------- */
const HJ = ['wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'];
['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'].forEach(f => HJ.push(f + '-metacarpal', f + '-phalanx-proximal', f + '-phalanx-intermediate', f + '-phalanx-distal', f + '-tip'));
const G_SEGS = [[1, 2], [2, 3], [3, 4]], G_JOINTS = [1, 2, 3], G_TIPS = [4, 9, 14, 19, 24], G_KNUCK = [6, 11, 16, 21];
[5, 10, 15, 20].forEach(b => { G_SEGS.push([b + 1, b + 2], [b + 2, b + 3], [b + 3, b + 4]); G_JOINTS.push(b + 1, b + 2, b + 3); });
const gloveGeo = (() => {
  const seg = new THREE.CylinderGeometry(0.42, 0.5, 1, 6); seg.rotateX(-Math.PI / 2); seg.translate(0, 0, -0.5);
  const ridge = new THREE.BoxGeometry(0.42, 0.22, 0.86); ridge.translate(0, 0.42, -0.5);
  const segG = mergeGeos([tint(ensureAttrs(seg.toNonIndexed()), C.gun), tint(ensureAttrs(ridge.toNonIndexed()), C.steel)]);
  const guard = mergeGeos([tint(ensureAttrs(new THREE.BoxGeometry(1, 0.45, 1).toNonIndexed()), C.steel)]);
  return { seg: segG, joint: new THREE.SphereGeometry(0.5, 10, 8), tip: new THREE.SphereGeometry(0.5, 10, 8), guard };
})();
const gloveMat = std({ map: SURF.steel.map, normalMap: SURF.steel.normal, roughnessMap: SURF.steel.orm, metalnessMap: SURF.steel.orm, metalness: 1, roughness: 1, vertexColors: true, color: 0x9aa0b0 });
const gloveJointMat = std({ color: 0x1a1b20, roughness: 0.75, metalness: 0.2 });
function makeGlove(side) {
  const tipMat = new THREE.MeshBasicMaterial({ color: 0x3cf0c6, toneMapped: false });
  const inst = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.castShadow = true; if (m.instanceMatrix.setUsage) m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); return m; };
  const g = { side, tipMat, seg: inst(gloveGeo.seg, gloveMat, G_SEGS.length), joint: inst(gloveGeo.joint, gloveJointMat, G_JOINTS.length), tip: inst(gloveGeo.tip, tipMat, 5), guard: inst(gloveGeo.guard, gloveMat, 4), pulse: 0 };
  const k = new Kit();
  k.add('steel', G.box(0.078, 0.014, 0.078, 0.2), C.gun, 0, 0.013, -0.046);
  for (let i = 0; i < 3; i++) k.add('steel', G.box(0.07 - i * 0.008, 0.008, 0.03, 0.2), C.steel, 0, 0.022 + i * 0.002, -0.07 + i * 0.022, 0.08, 0, 0);
  k.add('steel', G.box(0.072, 0.012, 0.074, 0.2), C.black, 0, -0.009, -0.046);
  for (const s of [-1, 1]) k.add('steel', G.box(0.01, 0.024, 0.07, 0.2), C.dark, s * 0.041, 0.004, -0.045);
  k.add('steel', G.cyl(0.036, 0.033, 0.075, 12, 0.2), C.dark, 0, 0, 0.032, Math.PI / 2, 0, 0);
  k.add('steel', G.cyl(0.038, 0.038, 0.012, 12, 0.2), C.steel, 0, 0, 0.005, Math.PI / 2, 0, 0);
  const palm = k.build({ steel: gloveMat }, { cast: true });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.005, 6), tipMat); core.position.set(0, 0.0215, -0.042); palm.add(core);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.037, 0.003, 4, 20), tipMat); ring.position.z = 0.012; palm.add(ring);
  palm.visible = false; scene.add(palm); g.palm = palm;
  return g;
}
const gloves = { left: makeGlove('left'), right: makeGlove('right') };
const _gm = new THREE.Matrix4(), _gq = new Q4(), _gp = new V3(), _gs = new V3(), _goff = new V3();
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0), _gw = new THREE.Color();
function updateGloves(dt) {
  for (const side of ['left', 'right']) {
    const h = hands[side], g = gloves[side];
    g.pulse = Math.max(0, g.pulse - dt * 3);
    // en los Toques, las puntas del color de los diamantes de esa mano (izquierda azul, derecha naranja)
    if (settings.mode === 'touch') { g.tipMat.color.setHex(TCH_COL[side]); g.tipMat.color.lerp(_gw.setRGB(1, 1, 1), g.pulse); }
    else g.tipMat.color.setRGB(0.24 + g.pulse * 0.76, 0.94 + g.pulse * 0.06, 0.78 + g.pulse * 0.2);
    const show = h.isHand && h.ok, J = h.J;
    if (!show) {
      for (const m of [g.seg, g.joint, g.tip, g.guard]) m.count = 0;
      g.palm.visible = !h.isHand && h.ok && !(pistolOn() && GAME_STATES.includes(state)); // con pistolas se ve el bláster
      if (g.palm.visible) { g.palm.position.copy(h.wrist); g.palm.quaternion.copy(h.wristQ); g.palm.scale.setScalar(1); }
      continue;
    }
    G_SEGS.forEach(([a, b], i) => {
      const A = J[a], B = J[b]; if (!A.ok || !B.ok) { g.seg.setMatrixAt(i, ZERO_M); return; }
      const r = Math.max(0.006, A.r), len = A.p.distanceTo(B.p);
      _goff.set(0, r * 0.15, 0).applyQuaternion(A.q); _gp.copy(A.p).add(_goff);
      _gm.compose(_gp, A.q, _gs.set(r * 2.25, r * 1.9, len)); g.seg.setMatrixAt(i, _gm);
    });
    G_JOINTS.forEach((j, i) => { const A = J[j]; if (!A.ok) { g.joint.setMatrixAt(i, ZERO_M); return; } const r = Math.max(0.006, A.r) * 2.05; _gm.compose(A.p, A.q, _gs.set(r, r, r)); g.joint.setMatrixAt(i, _gm); });
    G_TIPS.forEach((j, i) => { const A = J[j]; if (!A.ok) { g.tip.setMatrixAt(i, ZERO_M); return; } const r = Math.max(0.005, A.r) * 2.1; _gm.compose(A.p, A.q, _gs.set(r, r, r)); g.tip.setMatrixAt(i, _gm); });
    G_KNUCK.forEach((j, i) => { const A = J[j]; if (!A.ok) { g.guard.setMatrixAt(i, ZERO_M); return; } const r = Math.max(0.007, A.r); _goff.set(0, r * 1.1, 0).applyQuaternion(A.q); _gp.copy(A.p).add(_goff); _gm.compose(_gp, A.q, _gs.set(r * 2.6, r * 1.3, r * 2.3)); g.guard.setMatrixAt(i, _gm); });
    for (const m of [g.seg, g.joint, g.tip, g.guard]) { m.count = m.instanceMatrix.count; m.instanceMatrix.needsUpdate = true; }
    g.palm.visible = true; g.palm.position.copy(J[0].p); g.palm.quaternion.copy(J[0].q);
    const size = J[11].ok ? J[0].p.distanceTo(J[11].p) / 0.095 : 1; g.palm.scale.setScalar(clamp(size, 0.75, 1.3));
  }
}

/* ---------- Construcción inicial ---------- */
function buildRigs() {
  RIGS.scout = buildRipper(); RIGS.heavy = buildDestroyer(false); RIGS.titan = buildDestroyer(true);
  RIGS.tentacle = buildTentacle(); RIGS.spider = buildSpider(); RIGS.drone = buildDrone('drone'); RIGS.bomber = buildDrone('bomber'); RIGS.carrier = buildDrone('carrier'); RIGS.hornet = buildHornet();
  initSpiderLegs();
  // chatarra decorativa: restos de robots tirados por el suelo (solo VR)
  for (const [x, z, ry, kind] of [[-6.5, -4, 0.6, 'scout'], [7.5, -5.5, 2.2, 'heavy'], [-11, -9, 1.4, 'scout'], [12, 6, -0.8, 'heavy']]) {
    const r = RIGS[kind], grp = new THREE.Group();
    for (const ch of ['main', 'paint']) if (r.chans[ch]) grp.add(new THREE.Mesh(r.chans[ch], MAT_ROBOT_STATIC[ch]));
    grp.position.set(x, 0.18, z); grp.rotation.set(0, ry, Math.PI / 2 - 0.15); env.add(grp);
  }
}
