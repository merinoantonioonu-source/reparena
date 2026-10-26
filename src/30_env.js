
/* =================== PANELES DE TEXTO =================== */
// opts.hd: el lienzo, tantas veces más grande (más nítido), dibujando igual (W y H siguen siendo los de px)
function makePanel(w, h, px = 1024, opts = {}) {
  const k = opts.hd || 1, c = mkCanvas(Math.round(px * k), Math.round(px * k * h / w)), ctx = c.getContext('2d'), tex = new THREE.CanvasTexture(c);
  if (k !== 1 && ctx.scale) ctx.scale(k, k);
  tex.encoding = THREE.sRGBEncoding; tex.anisotropy = MAX_ANISO;
  // escriben su profundidad (lo transparente del lienzo, no): las Quest recolocan cada imagen al último movimiento de la
  // cabeza según la profundidad de cada punto, y un panel sin ella se recolocaba como si estuviera al fondo (temblaba)
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: opts.depthTest !== false, depthWrite: opts.depthWrite !== false, alphaTest: 0.04, toneMapped: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  if (opts.depthTest === false) m.renderOrder = 30;
  return { c, ctx, tex, mesh: m, w, h, W: Math.round(c.width / k), H: Math.round(c.height / k) };
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
const FD = '"Bungee","Arial Black",sans-serif', FB = '"Rubik",system-ui,sans-serif';
// El tamaño de letra para que el texto quepa: el ancho crece con el tamaño, así que basta medir una vez (y comprobar);
// cambiar de letra es caro y, probando de 2 en 2, construir un menú se llevaba casi todo el tiempo (tirones en las gafas)
// (las medidas, en un lienzo aparte y recordadas: cada botón tiene su lienzo, y estrenar letra en cada uno también cuesta)
let _fitCtx = null; const _fitW = new Map();
function fitWidth(font, text) {
  const k = font + '\u0001' + text; let w = _fitW.get(k); if (w !== undefined) return w;
  if (!_fitCtx) _fitCtx = mkCanvas(8).getContext('2d'); if (_fitCtx.font !== font) _fitCtx.font = font;
  w = _fitCtx.measureText(text).width; if (_fitW.size > 4000) _fitW.clear(); _fitW.set(k, w); return w;
}
function fitFont(c, text, max, start, fam) {
  const f0 = fam.replace('%', start), w = fitWidth(f0, text); let fs = start;
  if (w > max && fs > 14) { fs = Math.max(14, Math.floor(start * max / w)); if (fs > 14 && fitWidth(fam.replace('%', fs), text) > max) fs = Math.max(14, fs - 2); }
  c.font = fam.replace('%', fs); return fs;
}

/* =================== ENTORNO VR =================== */
const env = new THREE.Group(); scene.add(env);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { time: { value: 0 }, flash: { value: 0 } },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform float time; uniform float flash; varying vec3 vP;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x), f.y); }
    float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<4;i++){ v+=a*vnoise(p); p*=2.03; a*=0.5; } return v; }
    void main(){
      vec3 d = normalize(vP); float h = d.y;
      vec3 top = vec3(0.02,0.025,0.05), mid = vec3(0.1,0.045,0.05), low = vec3(0.3,0.085,0.045);
      vec3 c = mix(low, mid, smoothstep(-0.05, 0.22, h)); c = mix(c, top, smoothstep(0.2, 0.85, h));
      vec2 uv = d.xz / (max(h, 0.0) + 0.22) * 1.4 + vec2(time*0.012, time*0.005);
      float cl = smoothstep(0.38, 0.85, fbm(uv));
      vec3 cloudCol = mix(vec3(0.045,0.035,0.045), vec3(0.32,0.1,0.06), smoothstep(0.32, -0.02, h));
      c = mix(c, cloudCol, cl * smoothstep(-0.02, 0.12, h) * 0.9);
      c += flash * vec3(0.55,0.6,0.85) * (0.35 + cl * 1.2) * smoothstep(-0.1, 0.3, h);
      gl_FragColor = vec4(c, 1.0);
    }`
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), skyMat); sky.renderOrder = -10; env.add(sky);
const envFloor = new THREE.Mesh(new THREE.CircleGeometry(36, 64), M.floor); envFloor.rotation.x = -Math.PI / 2; envFloor.receiveShadow = true; env.add(envFloor);
const outerGround = new THREE.Mesh(new THREE.RingGeometry(35.9, 150, 48), std({ color: 0x15100e, roughness: 1 })); outerGround.rotation.x = -Math.PI / 2; outerGround.position.y = -0.01; env.add(outerGround);
const envLights = []; // luces rojas de la muralla que parpadean
(function buildEnv() {
  const k = new Kit(), R = rng(99);
  // muralla de hormigón con almenas
  k.add('wall', G.cyl(34, 34, 16, 72, 4, true), C.concrete, 0, 8, 0);
  for (let i = 0; i < 36; i++) { const a = i / 36 * TAU; k.add('concrete', G.box(3.2, 1.6, 1.4, 3), C.concrete, Math.cos(a) * 34.4, 16.6, Math.sin(a) * 34.4, 0, -a, 0); }
  // pilares, tuberías y pasarela
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU + 0.13, x = Math.cos(a) * 32.6, z = Math.sin(a) * 32.6;
    k.add('steel', G.box(1.6, 17, 1.6, 2), C.dark, x, 8.5, z, 0, -a, 0);
    k.add('steel', G.box(2.0, 0.5, 2.0, 2), C.hazard, x, 1.6, z, 0, -a, 0);
    envLights.push(new V3(Math.cos(a) * 31.7, 12.5, Math.sin(a) * 31.7));
  }
  k.add('steel', G.tor(33.2, 0.55, 8, 96), C.gun, 0, 5.2, 0, Math.PI / 2, 0, 0);
  k.add('steel', G.tor(33.2, 0.35, 8, 96), C.dark, 0, 6.4, 0, Math.PI / 2, 0, 0);
  k.add('steel', G.tor(32.4, 0.9, 4, 96), C.dark, 0, 10, 0, Math.PI / 2, 0, 0);
  for (let i = 0; i < 48; i++) { const a = i / 48 * TAU; k.add('steel', G.box(0.08, 1.2, 0.08, 1), C.gun, Math.cos(a) * 31.6, 10.9, Math.sin(a) * 31.6); }
  // torres lejanas
  for (let i = 0; i < 14; i++) {
    const a = R() * TAU, r = 48 + R() * 25, h = 18 + R() * 30, w = 4 + R() * 6;
    k.add('concrete', G.box(w, h, w, 6), C.concrete, Math.cos(a) * r, h / 2, Math.sin(a) * r, 0, R() * 3, 0);
    envLights.push(new V3(Math.cos(a) * r, h + 0.6, Math.sin(a) * r));
  }
  // bidones y chatarra
  for (const [x, z] of [[-9, -6], [10, -8], [-13, 4], [14, 3], [6, 12], [-7, 13]]) {
    k.add('steel', G.cyl(0.32, 0.32, 0.9, 14, 1.5), C.redPaint, x, 0.45, z);
    k.add('steel', G.tor(0.32, 0.025, 4, 16), C.dark, x, 0.3, z, Math.PI / 2, 0, 0); k.add('steel', G.tor(0.32, 0.025, 4, 16), C.dark, x, 0.65, z, Math.PI / 2, 0, 0);
  }
  for (let i = 0; i < 18; i++) { const a = R() * TAU, r = 14 + R() * 16; k.add('steel', G.box(0.4 + R() * 1.4, 0.2 + R() * 0.8, 0.4 + R() * 1.2, 1), R() < 0.5 ? C.dark : C.gun, Math.cos(a) * r, 0.2, Math.sin(a) * r, R() * 0.5, R() * 3, R() * 0.4); }
  const wallMat = M.concrete.clone(); wallMat.side = THREE.BackSide;
  const g = k.build({ concrete: M.concrete, steel: M.steel, wall: wallMat }, { receive: true });
  env.add(g);
  // luces rojas (halos)
  const hk = new Kit(); envLights.forEach(p => { hk.add('glow', G.sph(0.18, 8, 6), C.red, p.x, p.y, p.z); hk.add('halo', G.halo(2.6), C.redHalo, p.x, p.y, p.z); });
  const hg = hk.build({ glow: M.glow, halo: M.halo.clone() }); env.add(hg); envLights.mesh = hg.children[1];
})();
// Focos de búsqueda (conos de luz volumétrica falsa)
const searchlights = [];
for (let i = 0; i < 3; i++) {
  const a = -Math.PI / 2 + (i - 1) * 0.9, grp = new THREE.Group(); grp.position.set(Math.cos(a) * 31, 15.5, Math.sin(a) * 31);
  const geo = new THREE.ConeGeometry(2.6, 30, 24, 1, true); geo.translate(0, -15, 0);
  const cone = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: TX.cone, color: 0xb8c8ff, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false }));
  grp.add(cone); const lamp = new THREE.Mesh(G.cyl(0.5, 0.6, 0.6, 14), M.steel); tint(lamp.geometry, C.dark); grp.add(lamp);
  env.add(grp); searchlights.push({ grp, a, ph: i * 2.1 });
}
const barrelFires = [[-9, -6], [10, -8], [-13, 4], [14, 3], [6, 12], [-7, 13]].map(([x, z]) => new V3(x, 0.95, z));
const smokeCols = [new V3(-38, 6, -46), new V3(44, 6, -30), new V3(10, 6, 52)];

/* =================== ARENA (también en realidad mixta) =================== */
const arena = new THREE.Group(); scene.add(arena);
const keyLight = new THREE.DirectionalLight(0xc8d2ff, 1.1); keyLight.position.set(-5, 10, 4); arena.add(keyLight); arena.add(keyLight.target); keyLight.target.position.set(0, 0, -4);
keyLight.castShadow = true; keyLight.shadow.mapSize.set(1024, 1024);
Object.assign(keyLight.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 30 }); keyLight.shadow.bias = -0.0006; keyLight.shadow.normalBias = 0.02;
const rimLight = new THREE.DirectionalLight(0xff3a22, 0.9); rimLight.position.set(2, 4, -12); arena.add(rimLight); arena.add(rimLight.target);
const gateLight = new THREE.PointLight(0xff3a10, 1.4, 12, 2); arena.add(gateLight);
const catcher = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), M.shadowCatcher); catcher.rotation.x = -Math.PI / 2; catcher.position.y = 0.002; catcher.receiveShadow = true; arena.add(catcher);
const safeRing = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.0, 64), new THREE.MeshBasicMaterial({ color: 0x3cf0c6, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }));
safeRing.rotation.x = -Math.PI / 2; safeRing.position.y = 0.006; arena.add(safeRing);
const hazardLine = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.16), M.hazard); hazardLine.rotation.x = -Math.PI / 2; hazardLine.position.set(0, 0.005, -1.65); hazardLine.receiveShadow = true; arena.add(hazardLine);
M.hazard.map.repeat.set(8, 1);

// Por dentro, las compuertas son negras (sin luz ni niebla que las aclare) y dos velos de oscuridad hacen que lo que sale
// aparezca desde la penumbra: abiertas, no se ve el fondo
const M_VOID = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
const M_DARK = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false, fog: false, side: THREE.DoubleSide });
function gateDark(g, w, h) { for (const z of [-0.45, -0.95]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M_DARK); p.position.set(0, h / 2, z); p.renderOrder = 2; g.add(p); } }
function makeGate() {
  const g = new THREE.Group(), k = new Kit(), ks = new Kit();
  for (const s of [-1, 1]) {
    k.add('steel', G.box(0.55, 3.7, 0.9), C.dark, s * 1.5, 1.85, 0);
    k.add('steel', G.box(0.62, 0.35, 1.0), C.gun, s * 1.5, 0.17, 0);
    k.add('paint', G.box(0.08, 3.0, 0.6), C.hazard, s * 1.25, 1.5, 0.12);
    k.add('steel', G.cyl(0.05, 0.05, 2.6, 10), C.chrome, s * 1.78, 1.6, 0.32);
    k.add('steel', G.cyl(0.08, 0.08, 0.6, 10), C.dark, s * 1.78, 0.4, 0.32);
    k.add('steel', G.box(0.2, 0.2, 0.2), C.gun, s * 1.78, 2.95, 0.32);
    ks.add('concrete', G.box(1.2, 1.2, 2.2, 2), C.concrete, s * 2.2, 0.6, -0.3, 0, s * 0.15, 0); // bloques a los lados: fuera cuando la compuerta va en una pared real
    k.add('glow', G.box(0.03, 2.4, 0.02), C.red, s * 1.22, 1.6, 0.46);
  }
  k.add('paint', G.box(3.5, 0.55, 0.95), C.hazard, 0, 3.42, 0);
  k.add('steel', G.box(3.8, 0.16, 1.05), C.dark, 0, 3.76, 0);
  k.add('steel', G.box(1.0, 0.25, 0.3), C.gun, 0, 3.95, 0.1);
  // túnel interior, negro
  k.add('void', G.box(2.5, 3.1, 0.12), C.black, 0, 1.55, -1.5);
  for (const s of [-1, 1]) k.add('void', G.box(0.12, 3.1, 1.5), C.black, s * 1.25, 1.55, -0.75);
  k.add('void', G.box(2.5, 0.12, 1.5), C.black, 0, 3.05, -0.75); k.add('void', G.box(2.5, 0.02, 1.5), C.black, 0, 0.012, -0.75); // techo y suelo
  const frame = k.build({ steel: M.steel, paint: M.paint, concrete: M.concrete, glow: M.glow, halo: M.halo, void: M_VOID }, { cast: true, receive: true });
  g.add(frame); gateDark(frame, 2.4, 3.0);
  const side = ks.build({ concrete: M.concrete }, { cast: true, receive: true }); g.add(side);
  const ramp = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.35), M.hazard); ramp.rotation.x = -Math.PI / 2; ramp.position.set(0, 0.006, 0.75); g.add(ramp);
  const doorGeo = new THREE.BoxGeometry(1.23, 3.0, 0.16); // (cerradas dejan una raja de 1 cm: antes se solapaban 2 cm y sus caras peleaban, destellando)
  const doorL = new THREE.Mesh(doorGeo, M.door), doorR = new THREE.Mesh(doorGeo, M.door);
  doorL.position.set(-0.62, 1.5, 0.06); doorR.position.set(0.62, 1.5, 0.06); doorR.rotation.y = Math.PI;
  [doorL, doorR].forEach(d => { d.castShadow = true; d.receiveShadow = true; g.add(d); });
  // baliza giratoria
  const beacon = new THREE.Group(); beacon.position.set(0, 4.2, 0.1); g.add(beacon);
  const bMat = new THREE.MeshBasicMaterial({ color: 0x330800, toneMapped: false });
  beacon.add(new THREE.Mesh(G.cyl(0.13, 0.15, 0.22, 14), bMat));
  const beamMat = new THREE.MeshBasicMaterial({ map: TX.cone, color: 0xff3010, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const beamGeo = new THREE.ConeGeometry(0.7, 4, 12, 1, true); beamGeo.translate(0, -2, 0); beamGeo.rotateZ(Math.PI / 2);
  const beam1 = new THREE.Mesh(beamGeo, beamMat), beam2 = new THREE.Mesh(beamGeo, beamMat); beam2.rotation.y = Math.PI;
  const spin = new THREE.Group(); spin.add(beam1, beam2); beacon.add(spin);
  const glowSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.halo, color: 0xff4010, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  glowSpr.scale.set(1.6, 1.6, 1); beacon.add(glowSpr);
  arena.add(g);
  return { g, frame, side, ramp, beacon, doorL, doorR, bMat, beamMat, glowSpr, spin, open: 0, openT: 0, x: 0, z: 0, scale: 1, wasOpen: false, on: true };
}
const gates = [makeGate(), makeGate(), makeGate()];
// Las compuertas en uso (en una habitación pequeña puede que solo quepan una o dos)
const liveGates = () => { const l = gates.filter(g => g.on); return l.length ? l : gates; };

// Agujeros del suelo para las arañas (flexiones y plancha): a unos 2 m, lejos de las manos, para verlas venir
const hatchPos = [[-0.75, -1.85], [0.75, -1.85], [-1.6, -1.15], [1.6, -1.15]], hatchSide = [[-1.75, -0.55], [1.75, -0.55], [-1.7, 0.35], [1.7, 0.35]];
const hatches = hatchPos.map(([x, z]) => {
  const g = new THREE.Group(); g.position.set(x, 0, z); arena.add(g);
  const k = new Kit();
  k.add('steel', G.cyl(0.2, 0.22, 0.03, 20), C.gun, 0, 0.012, 0);
  k.add('steel', G.cyl(0.16, 0.16, 0.034, 20), C.black, 0, 0.014, 0);
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; k.add('steel', G.box(0.03, 0.03, 0.05), C.dark, Math.cos(a) * 0.19, 0.03, Math.sin(a) * 0.19, 0, -a, 0); }
  k.add('halo', G.plane(0.3, 0.3), col(0.5, 0.05, 0.02), 0, 0.036, 0, -Math.PI / 2, 0, 0);
  g.add(k.build({ steel: M.steel, halo: M.halo }, { receive: true }));
  const lk = new Kit(); for (let i = 0; i < 5; i++) lk.add('steel', G.box(0.3, 0.012, 0.03), C.steel, 0, 0, (i - 2) * 0.055);
  lk.add('steel', G.box(0.03, 0.014, 0.3), C.dark, 0, 0, 0);
  const lid = lk.build({ steel: M.steel }, { cast: true }); lid.position.y = 0.035; g.add(lid);
  return { g, lid, open: 0, openT: 0, x, z, on: true };
});
const liveHatches = () => { const l = hatches.filter(h => h.on); return l.length ? l : hatches; };

// Vía de los arcos
const arcTrack = new THREE.Group(); arena.add(arcTrack);
const railMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false, transparent: true, opacity: 0.85 });
const rails = [-1.12, 1.12].map(x => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 1), railMat); m.position.x = x; arcTrack.add(m); return m; });
const trackFloor = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1), std({ color: 0x0c0a0c, roughness: 0.4, metalness: 0.6, transparent: true, opacity: 0.7 })); trackFloor.rotation.x = -Math.PI / 2; trackFloor.position.y = 0.003; trackFloor.receiveShadow = true; arcTrack.add(trackFloor);

/* ---------- Marcador fijo ---------- */
const board = makePanel(1, 0.445, 1024); board.mesh.material.transparent = false; board.mesh.material.depthWrite = true; // siempre visible y opaco
const boardRig = new THREE.Group(); arena.add(boardRig);
const boardFrameMat = M.steel.clone();
let boardDirty = true;
const layoutHooks = []; // lo que se recoloca con la arena (el bosque de día)
function arenaDepth() { const P = roomPlan(); return settings.depth > 0 ? settings.depth : P && isFinite(P.front) ? clamp(P.front - 0.3, 2.5, 6) : (arMode ? 6 : 11); }
function gateScale() { return arMode ? 0.72 : 1; }
function boardMode() { return settings.board === 'auto' ? (arMode ? 'column' : 'gate') : settings.board; }
function layoutArena() {
  const D = arenaDepth(), push = isTiny(), low = isFloor() || settings.exercise === 'inchworm', gs = gateScale(), arcs = settings.mode === 'arcs';
  const sp = Math.max(3.6 * gs, D * 0.42);
  const plan = roomPlan(), roomGates = plan && plan.gates.some(Boolean); // realidad mixta: en tus paredes
  gates.forEach((g, i) => {
    const P = roomGates ? plan.gates[i] : null; g.on = !roomGates || !!P;
    if (P) { g.x = P.x; g.z = P.z; g.scale = plan.gs; g.g.rotation.y = P.rot; }
    else { g.x = (i - 1) * sp; g.z = -D; g.scale = gs; g.g.rotation.y = Math.atan2(-g.x, D); }
    g.g.position.set(g.x, 0, g.z); g.g.scale.setScalar(g.scale); g.side.visible = !roomGates;
    g.g.visible = g.on && !push && !forestOn();
  });
  const mg = gates[1].on ? gates[1] : liveGates()[0], mr = mg.g.rotation.y;
  gateLight.position.set(mg.x - Math.sin(mr) * 0.6, 1.6 * mg.scale, mg.z - Math.cos(mr) * 0.6);
  const hp = oneArm() ? hatchSide : hatchPos; // en la plancha, dos a cada lado
  // colocadas a mano: las tuyas (si pusiste menos de cuatro, sobran); con el escaneo: en suelo libre
  const mh = plan && plan.hatches && plan.hatches.length ? plan.hatches : null, taken = [];
  hatches.forEach((h, i) => { h.on = !mh || i < mh.length; [h.x, h.z] = mh && h.on ? [mh[i].x, mh[i].z] : plan && !mh ? roomHatch(plan, hp[i][0], hp[i][1], taken) : hp[i]; taken.push([h.x, h.z]); h.g.position.set(h.x, 0, h.z); h.g.visible = push && settings.mode !== 'arcs' && h.on; });
  safeRing.visible = !push && !isBars(); hazardLine.visible = !push && !arMode && foesHas('robots') && !natureOn() && !islandOn();
  arcTrack.visible = arcs;
  if (arcs) { const len = D + 2; rails.forEach(r => { r.scale.z = len; r.position.set(r.position.x, 0.006, -D / 2 + 1); }); trackFloor.scale.y = len; trackFloor.position.z = -D / 2 + 1; }
  catcher.visible = arMode && !!settings.shadows && settings.look !== 'comic' && !forestOn();
  keyLight.target.position.set(0, 0, -D * 0.45);
  const ext = Math.max(6, D * 0.65); Object.assign(keyLight.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext }); keyLight.shadow.camera.updateProjectionMatrix();
  keyLight.position.set(-5, 10, 4 - D * 0.45);
  while (boardRig.children.length) boardRig.remove(boardRig.children[0]);
  const rig = new THREE.Group(); boardRig.add(rig);
  const k = new Kit();
  if (low) {
    // en el suelo: tumbado casi plano delante de las manos, inclinado hacia tu cara. Así no se levanta en el camino
    // de lo que viene hacia tu cabeza (los objetivos y los bichos llegan por encima de 20 cm)
    const tilt = 1.19, nY = Math.sin(tilt), nZ = Math.cos(tilt);
    rig.position.set(0, 0, -0.95);
    k.add('steel', G.box(0.76, 0.36, 0.025), C.dark, 0, 0.075 - nY * 0.016, -nZ * 0.016, -tilt, 0, 0);
    rig.add(k.build({ steel: boardFrameMat }, { receive: true }));
    board.mesh.position.set(0, 0.075, 0); board.mesh.rotation.set(-tilt, 0, 0); board.mesh.scale.setScalar(0.7);
  } else if (forestOn()) {
    // en el bosque, un cartel de madera clavado en dos postes, a un lado
    rig.position.set(-1.35, 0, -2.3); rig.rotation.y = Math.atan2(1.35, 2.3);
    for (const s of [-1, 1]) k.add('bark', G.cyl(0.05, 0.06, 2.35, 8), C_DEAD, s * 0.55, 1.17, -0.06);
    for (let i = 0; i < 3; i++) k.add('bark', G.box(1.22, 0.19, 0.04), C_DEAD, 0, 1.71 + i * 0.19, -0.04, 0, 0, (i - 1) * 0.02);
    rig.add(k.build({ bark: M.bark }, { cast: true }));
    board.mesh.position.set(0, 1.9, -0.015); board.mesh.rotation.set(0.05, 0, 0); board.mesh.scale.setScalar(1.05);
  } else if (isBars() && settings.exercise === 'row') {
    // remo: tumbado mirando al techo; placeRowBoard lo pone encima de tu cara al colgarte
    rig.position.set(0, 2.4, -1.2); rig.rotation.set(Math.PI / 2, 0, 0);
    board.mesh.position.set(0, 0, 0); board.mesh.rotation.set(0, 0, 0); board.mesh.scale.setScalar(0.9);
  } else if (boardMode() === 'gate') {
    // por encima de la baliza de la compuerta (hasta 4,3 m): desde los ojos, también en cuclillas, no la tapa nada
    const W = clamp(D * 0.36, 1.8, 4.2) * Math.max(gs, 0.85), H = W * 0.445, yc = 4.75 * gs + H / 2;
    rig.position.set(0, 0, -D - 0.35);
    for (const s of [-1, 1]) k.add('steel', G.box(0.2, yc + H / 2, 0.2), C.dark, s * (W / 2 + 0.18), (yc + H / 2) / 2, -0.15);
    const tilt = Math.atan((yc - 1.6) / D) * 0.8;
    k.add('steel', G.box(W + 0.22, H + 0.22, 0.12), C.gun, 0, yc, -0.08, tilt, 0, 0);
    rig.add(k.build({ steel: boardFrameMat }, { cast: true }));
    board.mesh.position.set(0, yc, -0.01); board.mesh.rotation.set(tilt, 0, 0); board.mesh.scale.setScalar(W);
  } else if (plan && plan.board && plan.board.wall !== false && boardMode() === 'column') {
    // realidad mixta con la habitación escaneada: colgado en una de tus paredes, a la altura de los ojos
    const B = plan.board, W = 1.1, tilt = 0.06;
    rig.position.set(B.x, 0, B.z); rig.rotation.y = B.rot;
    k.add('steel', G.box(W + 0.1, W * 0.445 + 0.1, 0.05), C.gun, 0, 1.75, 0.0, tilt, 0, 0);
    rig.add(k.build({ steel: boardFrameMat }, { cast: true }));
    board.mesh.position.set(0, 1.75, 0.03); board.mesh.rotation.set(tilt, 0, 0); board.mesh.scale.setScalar(W);
  } else {
    const B = plan && plan.board, cx = B ? B.x : -Math.min(2.4, D * 0.3 + 0.7), cz = B ? B.z : -Math.min(3.0, D * 0.55); // colocado a mano en medio de la habitación: en su columna
    rig.position.set(cx, 0, cz); rig.rotation.y = Math.atan2(-cx, -cz);
    k.add('steel', G.cyl(0.3, 0.36, 0.12, 20), C.dark, 0, 0.06, 0);
    k.add('steel', G.cyl(0.1, 0.12, 2.0, 16), C.steel, 0, 1.06, 0);
    k.add('glow', G.box(0.04, 1.7, 0.02), C.teal, 0, 1.0, 0.11);
    const W = 1.25, tilt = Math.atan(0.6 / Math.hypot(cx, cz));
    k.add('steel', G.box(W + 0.1, W * 0.445 + 0.1, 0.08), C.gun, 0, 2.3, -0.05, tilt, 0, 0);
    rig.add(k.build({ steel: boardFrameMat, glow: M.glow }, { cast: true }));
    board.mesh.position.set(0, 2.3, -0.005); board.mesh.rotation.set(tilt, 0, 0); board.mesh.scale.setScalar(W);
  }
  rig.add(board.mesh);
  if (isBars() && settings.exercise === 'row' && BAR.board) placeRowBoard(false);
  boardDirty = true; layoutHooks.forEach(f => f());
}
function applyEnvMode() {
  env.visible = !arMode;
  scene.fog = arMode ? null : new THREE.FogExp2(0x1c1214, 0.028);
  renderer.setClearColor(0x000000, arMode ? 0 : 1);
  hemi.intensity = arMode ? 0.95 : 0.42; hemi.color.setHex(arMode ? 0xdfe6ff : 0x8d98b8);
  keyLight.intensity = arMode ? 0.9 : 1.05; rimLight.intensity = arMode ? 0.25 : 0.9;
  renderer.toneMappingExposure = arMode ? 1.0 : 1.2;
  layoutArena(); applyVolume(); applyForest(); applyNature(); applyIsland(); applyComic();
}
function applyShadows() {
  const on = !!settings.shadows && settings.look !== 'comic'; // (el estilo cómic va sin sombras en tiempo real)
  renderer.shadowMap.enabled = on; keyLight.castShadow = on;
  scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); });
  catcher.visible = arMode && !!settings.shadows && settings.look !== 'comic' && !forestOn();
}
settingHooks.push(k => {
  if (['depth', 'board', 'mode', 'exercise', '*'].includes(k)) layoutArena();
  if (k === 'shadows' || k === '*') applyShadows();
});

/* ---------- Animación del entorno ---------- */
const ENV = { lightningT: 12, flash: 0, emitT: 0 };
function updateEnv(dt, t) {
  skyMat.uniforms.time.value = t;
  if (!arMode && !forestOn() && !NAT.group.visible && !ISL.group.visible && !comicArenaOn()) { // (la fortaleza de noche: rayos, focos, fuegos)
    ENV.lightningT -= dt;
    if (ENV.lightningT <= 0) { ENV.lightningT = rand(14, 34); ENV.flash = 1; ENV.flash2 = 0.25; const d = rand(0.6, 2.5); setTimeout(() => SND.thunder(d), 200); }
    if (ENV.flash > 0) { ENV.flash = Math.max(0, ENV.flash - dt * 3.5); if (ENV.flash2 && ENV.flash < 0.4) { ENV.flash = 0.8; ENV.flash2 = 0; } }
    skyMat.uniforms.flash.value = ENV.flash * (Math.random() < 0.85 ? 1 : 0.3);
    hemi.intensity = 0.42 + ENV.flash * 1.4;
    searchlights.forEach(s => { const pitch = 1.0 + Math.sin(t * 0.21 + s.ph * 1.7) * 0.15; s.grp.rotation.set(0, 0, 0); s.grp.rotateY(-(s.a + Math.sin(t * 0.13 + s.ph) * 0.55)); s.grp.rotateZ(-pitch); });
    if (envLights.mesh) envLights.mesh.material.opacity = 0.55 + 0.45 * Math.max(0, Math.sin(t * 2.2));
    ENV.emitT -= dt;
    if (ENV.emitT <= 0) {
      ENV.emitT = 0.07;
      for (const p of barrelFires) { if (Math.random() < 0.8) fx.fire(p, 0.22); if (Math.random() < 0.25) fx.smoke(p.clone().add(new V3(0, 0.6, 0)), 0.5, 0.5, 3); }
      for (const p of smokeCols) if (Math.random() < 0.5) fx.bigSmoke(p);
    }
  }
  gateLight.intensity = (arMode ? 0.6 : 1.4) * (0.8 + 0.2 * Math.sin(t * 13) * Math.sin(t * 7.3)) + Math.max(...gates.map(g => g.open)) * 1.5;
}
function updateGates(dt, t) {
  for (const g of gates) {
    if (g.openT > 0) g.openT -= dt;
    const target = g.openT > 0 ? 1 : 0; g.open += (target - g.open) * Math.min(1, dt * 3.2);
    if (g.nat) { // en el bosque, puertas de tablones que se abren hacia dentro, sobre sus goznes
      const a = g.open * 1.35, cx = 0.63 * Math.cos(a), cz = 0.06 - 0.63 * Math.sin(a);
      g.doorL.position.set(-1.25 + cx, 1.5, cz); g.doorL.rotation.y = a; g.doorR.position.set(1.25 - cx, 1.5, cz); g.doorR.rotation.y = Math.PI - a;
    } else { g.doorL.position.set(-0.62 - g.open * 1.25, 1.5, 0.06); g.doorR.position.set(0.62 + g.open * 1.25, 1.5, 0.06); g.doorL.rotation.y = 0; g.doorR.rotation.y = Math.PI; }
    const on = g.openT > 0 || g.open > 0.05;
    g.spin.rotation.y += dt * 6;
    g.beamMat.opacity = on ? 0.35 : 0; g.glowSpr.material.opacity = on ? 0.6 + 0.4 * Math.sin(t * 12) : 0;
    g.bMat.color.setHex(on ? 0xff2a08 : 0x330800);
    if (target && !g.wasOpen && g.g.visible) { const p = arena.localToWorld(new V3(g.x, 0.3, g.z + 0.5)); for (const s of [-1, 1]) for (let i = 0; i < 6; i++) fx.steam(arena.localToWorld(new V3(g.x + s * 1.3 * g.scale, 0.3 + i * 0.25, g.z + 0.4)), s); SND.door(p); }
    g.wasOpen = !!target;
  }
  for (const h of hatches) { if (h.openT > 0) h.openT -= dt; const tg = h.openT > 0 ? 1 : 0; h.open += (tg - h.open) * Math.min(1, dt * 5); h.lid.position.x = h.open * 0.33; }
}
