
/* =================== BOSQUE ENCANTADO (Barras · Colgado, en VR) =================== */
// Colgado de la barra no tiene sentido el almacén: es de noche en un bosque sombrío y húmedo, con niebla entre los
// troncos, luz de luna, luciérnagas y setas que brillan. La barra es una rama gruesa de un árbol enorme de la que
// cuelgas, y debajo espera la ciénaga con los tentáculos. Solo en VR: en realidad mixta se ve tu habitación.
const forestOn = () => !arMode && isBars() && settings.exercise === 'hang';
SURF.bark = surface(256, 256, 83, S => {
  fillAll(S, '#4a3b30', 128, 0.92, 0);
  const { a, h, r, rnd } = S;
  // grietas verticales que se ramifican: la corteza de un árbol viejo
  for (let i = 0; i < 30; i++) {
    let x = rnd() * 256, y = rnd() * 256; const wd = 2 + rnd() * 4;
    for (let k = 0; k < 12; k++) {
      const nx = x + (rnd() - 0.5) * 10, ny = y + 10 + rnd() * 22;
      for (const [c, st, lw] of [[a, 'rgba(14,10,8,0.85)', wd], [h, '#000', wd + 2], [r, 'rgba(0,255,0,1)', wd]]) wrapDraw(256, x, y, 40, (X, Y) => { c.strokeStyle = st; c.lineWidth = lw; c.beginPath(); c.moveTo(X, Y); c.lineTo(X + nx - x, Y + ny - y); c.stroke(); });
      x = nx; y = ny; if (y > 256) y -= 256;
    }
  }
  mottle(S, 140, 40, 0.25, 0.06); speckle(S, 6000, 0.25, 0.06, 0.3, 1.6);
  for (let i = 0; i < 10; i++) { const x = rnd() * 256, y = rnd() * 256, rad = 10 + rnd() * 24; wrapDraw(256, x, y, rad, (X, Y) => { blob(a, X, Y, rad, 'rgba(58,92,40,0.55)'); blob(h, X, Y, rad * 0.8, 'rgba(255,255,255,0.18)'); }); } // musgo
}, 3.2);
SURF.moss = surface(256, 256, 89, S => {
  fillAll(S, '#1f2a17', 128, 0.95, 0);
  const { a, rnd } = S;
  mottle(S, 220, 50, 0.35, 0.05);
  for (let i = 0; i < 900; i++) { a.fillStyle = rnd() < 0.5 ? 'rgba(70,52,30,0.45)' : 'rgba(46,70,30,0.5)'; const x = rnd() * 256, y = rnd() * 256; a.beginPath(); a.ellipse(x, y, 2 + rnd() * 4, 1 + rnd() * 2, rnd() * TAU, 0, TAU); a.fill(); } // hojarasca
  speckle(S, 8000, 0.3, 0.05, 0.4, 1.4);
}, 2.4);
SURF.moss.map.repeat.set(36, 36); SURF.moss.normal.repeat.set(36, 36); SURF.moss.orm.repeat.set(36, 36);
M.bark = std({ map: SURF.bark.map, normalMap: SURF.bark.normal, roughnessMap: SURF.bark.orm, metalness: 0, roughness: 1, vertexColors: true });
M.leaf = std({ vertexColors: true, roughness: 0.95, metalness: 0 });
const C_BARK = col(0.7, 0.64, 0.6), C_DEAD = col(0.5, 0.48, 0.46), C_LEAF = [col(0.035, 0.09, 0.05), col(0.025, 0.065, 0.045), col(0.05, 0.11, 0.055), col(0.07, 0.09, 0.04)];

const forest = new THREE.Group(); forest.visible = false; scene.add(forest);
// Cielo nocturno: verde oscuro abajo, azul casi negro arriba, una luna con halo entre jirones de nubes y alguna estrella
const forestSkyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { time: { value: 0 } },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform float time; varying vec3 vP;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x), f.y); }
    void main(){
      vec3 d = normalize(vP); float h = d.y;
      vec3 c = mix(vec3(0.03,0.06,0.045), vec3(0.012,0.02,0.04), smoothstep(-0.05, 0.6, h));
      vec3 m = normalize(vec3(-0.45, 0.42, -0.79)); float md = dot(d, m);
      c += vec3(0.5,0.6,0.7) * pow(max(md, 0.0), 220.0) * 0.6 + vec3(0.12,0.17,0.22) * pow(max(md, 0.0), 14.0);
      c = mix(c, vec3(0.9,0.95,1.0), smoothstep(0.9991, 0.9994, md));
      vec2 uv = d.xz / (max(h, 0.0) + 0.3) * 2.0 + vec2(time * 0.006, 0.0);
      float cl = smoothstep(0.45, 0.85, vnoise(uv) * 0.6 + vnoise(uv * 2.3) * 0.4);
      c = mix(c, vec3(0.05,0.07,0.08) + vec3(0.15,0.18,0.2) * pow(max(md, 0.0), 6.0), cl * 0.75 * smoothstep(0.0, 0.2, h));
      float st = step(0.9975, hash(floor(d.xz / (h + 0.4) * 160.0))) * smoothstep(0.15, 0.5, h) * (1.0 - cl);
      c += vec3(0.6,0.65,0.8) * st * (0.5 + 0.5 * sin(time * 2.0 + hash(floor(d.zx * 90.0)) * 20.0));
      gl_FragColor = vec4(c, 1.0);
    }`
});
const forestSky = new THREE.Mesh(new THREE.SphereGeometry(140, 32, 16), forestSkyMat); forestSky.renderOrder = -10; forest.add(forestSky);
const forestGround = new THREE.Mesh(new THREE.CircleGeometry(60, 64), std({ map: SURF.moss.map, normalMap: SURF.moss.normal, roughnessMap: SURF.moss.orm, metalness: 0, roughness: 1 }));
forestGround.rotation.x = -Math.PI / 2; forestGround.position.y = -0.005; forestGround.receiveShadow = true; forest.add(forestGround);
// Lo que se mueve: luciérnagas y niebla baja entre los árboles
const FOREST = { flies: [], mist: [], built: '', owlT: 6, creakT: 9 };
const mistTex = texFrom((() => { const c = mkCanvas(128), x = c.getContext('2d'), R = rng(17); for (let i = 0; i < 26; i++) { const px = 64 + (R() - 0.5) * 70, py = 64 + (R() - 0.5) * 40, rr = 14 + R() * 30; blob(x, px, py, rr, 'rgba(255,255,255,0.25)'); } x.globalCompositeOperation = 'destination-in'; const g = x.createRadialGradient(64, 64, 20, 64, 64, 63); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return c; })());

// Un árbol: tronco retorcido en tramos que se estrechan, raíces, ramas y copas de hojas oscuras (o seco y desnudo)
function forestTree(k, x, z, h, r, R, dead, away) {
  let p = new V3(x, 0, z); const segs = 6, lean = new V3(R() - 0.5, 0, R() - 0.5).multiplyScalar(0.25);
  const pts = [p.clone()];
  for (let i = 1; i <= segs; i++) { const q = p.clone().add(new V3((R() - 0.5) * 0.35 + lean.x, h / segs, (R() - 0.5) * 0.35 + lean.z)); pts.push(q); p = q; }
  for (let i = 0; i < segs; i++) k.add('bark', limbBetween(pts[i], pts[i + 1], r * (1 - i / segs * 0.7) * (i ? 1 : 1.25), r * (1 - (i + 1) / segs * 0.7), 9), dead ? C_DEAD : C_BARK);
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + R(), d = new V3(Math.cos(a), 0, Math.sin(a)); k.add('bark', limbBetween(new V3(x, r * 1.2, z), new V3(x + d.x * r * 3.2, -0.05, z + d.z * r * 3.2), r * 0.5, r * 0.12, 6), C_BARK); }
  const nb = 3 + Math.floor(R() * 3); // away: ninguna rama hacia la barra
  for (let i = 0; i < nb; i++) {
    const s = pts[2 + Math.floor(R() * (segs - 2))], a = away ? Math.PI * (0.6 + R() * 0.8) : R() * TAU, len = h * (0.22 + R() * 0.22), e = s.clone().add(new V3(Math.cos(a) * len, len * (dead ? 0.15 + R() * 0.3 : 0.45), Math.sin(a) * len));
    k.add('bark', limbBetween(s, e, r * 0.38, r * 0.08, 6), dead ? C_DEAD : C_BARK);
    if (dead) { const t = e.clone().add(new V3((R() - 0.5) * 0.8, 0.3 + R() * 0.4, (R() - 0.5) * 0.8)); k.add('bark', limbBetween(e, t, r * 0.08, r * 0.03, 5), C_DEAD); }
    else for (let j = 0; j < 2; j++) k.add('leaf', G.sph(len * (0.45 + R() * 0.3), 10, 7), C_LEAF[Math.floor(R() * 4)], e.x + (R() - 0.5) * 0.6, e.y + (R() - 0.3) * 0.5, e.z + (R() - 0.5) * 0.6, R(), R(), R(), 1, 0.65 + R() * 0.3, 1);
  }
  if (!dead) for (let j = 0; j < 3; j++) k.add('leaf', G.sph(h * (0.16 + R() * 0.1), 10, 7), C_LEAF[Math.floor(R() * 4)], p.x + (R() - 0.5) * h * 0.25, p.y + (R() - 0.2) * h * 0.12, p.z + (R() - 0.5) * h * 0.25, R(), R(), R(), 1, 0.7, 1);
  // setas que brillan en la base
  if (R() < 0.45) for (let j = 0; j < 3 + R() * 4; j++) {
    const a = R() * TAU, d = r * (1.2 + R() * 0.8), mx = x + Math.cos(a) * d, mz = z + Math.sin(a) * d, ms = 0.025 + R() * 0.04, c = R() < 0.6 ? col(0.25, 1, 0.85) : col(0.55, 0.45, 1);
    k.add('bark', G.cyl(ms * 0.25, ms * 0.3, ms * 1.4, 6), col(0.8, 0.8, 0.75), mx, ms * 0.7, mz);
    k.add('glow', G.sph(ms, 8, 5, TS, 0, TAU, 0, Math.PI / 2), c, mx, ms * 1.4, mz);
    if (j === 0) k.add('halo', G.halo(ms * 9), col(c.r * 0.5, c.g * 0.5, c.b * 0.5), mx, ms * 2, mz);
  }
}
function buildForest() {
  const H = settings.doorH / 100, W = settings.doorW / 100, key = H + ':' + W; if (FOREST.built === key) return; FOREST.built = key;
  for (const g of ['trees', 'hero']) { const o = FOREST[g]; if (o) { forest.remove(o); o.traverse(n => { if (n.geometry) n.geometry.dispose(); }); } }
  const R = rng(1234);
  let k = new Kit();
  for (let i = 0; i < 90; i++) {
    const a = R() * TAU, d = 3.4 + Math.pow(R(), 0.8) * 30; if (Math.abs(Math.sin(a)) * d < 2.2 && Math.cos(a) * d < 0 && d < 5) continue; // hueco junto al árbol de la rama
    const h = 6 + R() * 10; forestTree(k, Math.cos(a) * d, Math.sin(a) * d, h, 0.18 + R() * 0.3, R, R() < 0.18);
  }
  // matorrales y troncos caídos
  for (let i = 0; i < 40; i++) { const a = R() * TAU, d = 2.6 + R() * 14; k.add('leaf', G.sph(0.25 + R() * 0.4, 9, 6), C_LEAF[Math.floor(R() * 4)], Math.cos(a) * d, 0.1, Math.sin(a) * d, 0, R() * 3, 0, 1, 0.55, 1); }
  for (let i = 0; i < 6; i++) { const a = R() * TAU, d = 4 + R() * 10, x = Math.cos(a) * d, z = Math.sin(a) * d, b = R() * TAU, L = 2 + R() * 3; k.add('bark', limbBetween(new V3(x, 0.15, z), new V3(x + Math.cos(b) * L, 0.12, z + Math.sin(b) * L), 0.2, 0.15, 9), C_DEAD); }
  FOREST.trees = k.build({ bark: M.bark, leaf: M.leaf, glow: M.glow, halo: M.halo }, { cast: false, receive: true }); forest.add(FOREST.trees);
  // El árbol enorme del que sale la rama a la que estás agarrado (en las coordenadas de la barra: la barra va por X)
  k = new Kit();
  const tx = -(W / 2 + 1.5), tr = 0.55;
  forestTree(k, tx, 0.35, Math.max(9, H + 6), tr, R, false, true);
  // la rama: gruesa junto al tronco, recta donde agarras (a la altura de la barra real) y se adelgaza más allá
  const p0 = new V3(tx + tr * 0.6, H + 0.32, 0.12), p1 = new V3(-W / 2 - 0.35, H + 0.06, 0.02), g0 = new V3(-W / 2 - 0.12, H, 0), g1 = new V3(W / 2 + 0.12, H, 0), p2 = new V3(W / 2 + 0.6, H + 0.03, -0.03), p3 = new V3(W / 2 + 1.25, H + 0.18, -0.12);
  k.add('bark', limbBetween(p0, p1, 0.17, 0.06, 12), C_BARK); k.add('bark', limbBetween(p1, g0, 0.06, 0.036, 12), C_BARK);
  k.add('bark', limbBetween(g0, g1, 0.034, 0.03, 12), C_BARK); k.add('bark', limbBetween(g1, p2, 0.03, 0.022, 10), C_BARK); k.add('bark', limbBetween(p2, p3, 0.022, 0.008, 8), C_BARK);
  for (const [s, e] of [[p1, new V3(p1.x + 0.1, H + 0.7, -0.3)], [p2, new V3(p2.x + 0.2, H + 0.45, 0.3)], [p3, new V3(p3.x + 0.4, H + 0.35, 0.1)]]) { k.add('bark', limbBetween(s, e, 0.015, 0.004, 6), C_BARK); k.add('leaf', G.sph(0.22, 7, 5), C_LEAF[0], e.x, e.y + 0.05, e.z, 0, 0, 0, 1, 0.7, 1); }
  FOREST.hero = k.build({ bark: M.bark, leaf: M.leaf, glow: M.glow, halo: M.halo }, { cast: true, receive: true }); forest.add(FOREST.hero);
  if (!FOREST.flies.length) {
    const fm = new THREE.SpriteMaterial({ map: TX.halo, color: 0xc8ff6a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    for (let i = 0; i < 40; i++) { const s = new THREE.Sprite(fm.clone()), a = R() * TAU, d = 1.2 + R() * 9; s.scale.setScalar(0.05); forest.add(s); FOREST.flies.push({ s, base: new V3(Math.cos(a) * d, 0.3 + R() * 2.6, Math.sin(a) * d), ph: R() * TAU, sp: 0.3 + R() * 0.6 }); }
    const mm = new THREE.SpriteMaterial({ map: mistTex, color: 0x9fb4b0, transparent: true, opacity: 0.2, depthWrite: false });
    for (let i = 0; i < 16; i++) { const s = new THREE.Sprite(mm), a = R() * TAU, d = 2.5 + R() * 14; s.scale.set(5 + R() * 4, 1.6 + R(), 1); forest.add(s); FOREST.mist.push({ s, base: new V3(Math.cos(a) * d, 0.5 + R() * 0.6, Math.sin(a) * d), ph: R() * TAU }); }
  }
}
settingHooks.push(k => { if (['doorH', 'doorW', '*'].includes(k) && FOREST.built) buildForest(); });

/* ---------- Entrar y salir del bosque: luces, niebla, cielo y sonido ---------- */
const LIGHT0 = { hemiC: 0x8d98b8, hemiG: 0x2a1814, key: 0xc8d2ff, rim: 0xff3a22 };
function applyForest() {
  const on = forestOn(); if (on) buildForest();
  forest.visible = on; env.visible = !arMode && !on;
  if (on) {
    scene.fog = new THREE.FogExp2(0x0a1411, 0.07); renderer.setClearColor(0x050a08, 1);
    hemi.color.setHex(0x4a68a0); hemi.groundColor.setHex(0x080e08); hemi.intensity = 0.4;
    keyLight.color.setHex(0x9db6ff); keyLight.intensity = 0.5; rimLight.color.setHex(0x3cff9a); rimLight.intensity = 0.2; renderer.toneMappingExposure = 1.15;
  } else {
    hemi.color.setHex(LIGHT0.hemiC); hemi.groundColor.setHex(LIGHT0.hemiG); keyLight.color.setHex(LIGHT0.key); rimLight.color.setHex(LIGHT0.rim);
  }
  ambientRefresh();
}
function updateForest(dt, t) {
  if (!forest.visible) return;
  const e = eqPose('door'); forest.position.set(e.x, 0, e.z); forest.rotation.y = e.yaw;
  forestSkyMat.uniforms.time.value = t;
  for (const f of FOREST.flies) { // vuelan despacio en círculos y se encienden y apagan
    const k = t * f.sp + f.ph; f.s.position.set(f.base.x + Math.sin(k) * 0.6, f.base.y + Math.sin(k * 1.7) * 0.25, f.base.z + Math.cos(k * 0.8) * 0.6);
    f.s.material.opacity = Math.max(0, Math.sin(t * 1.3 + f.ph * 3)) * 0.9;
  }
  for (const m of FOREST.mist) m.s.position.set(m.base.x + Math.sin(t * 0.05 + m.ph) * 1.5, m.base.y, m.base.z + Math.cos(t * 0.04 + m.ph) * 1.5);
  // sonidos sueltos del bosque: un búho a lo lejos, ramas que crujen
  FOREST.owlT -= dt; if (FOREST.owlT <= 0) { FOREST.owlT = rand(9, 22); const a = rand(0, TAU); SND.owl(new V3(Math.cos(a) * 18, 6, Math.sin(a) * 18)); }
  FOREST.creakT -= dt; if (FOREST.creakT <= 0) { FOREST.creakT = rand(6, 15); const a = rand(0, TAU); SND.creak(new V3(Math.cos(a) * 6, 4, Math.sin(a) * 6)); }
}
settingHooks.push(k => { if (['mode', 'exercise'].includes(k) && (xrActive || preview)) applyEnvMode(); });
