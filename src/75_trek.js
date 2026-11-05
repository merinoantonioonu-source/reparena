/* =================== TRAVESÍA =================== */
// Recorres un sendero del bosque a fuerza de repeticiones: cada una te da impulso (las perfectas, más) y, si paras, te
// paras. Vas de pie sobre una plataforma de madera quieta bajo los pies (lo fijo alrededor evita el mareo), que avanza
// despacio y siempre en línea recta (como mucho TREK_VMAX). Cada oleada es un tramo con su paisaje: bosque, pradera del
// lago y pinar al atardecer; el paisaje nuevo va llegando por delante. Por el camino, retos de otro movimiento (troncos,
// ramas bajas, cofres con cadenas, el derrumbe, el arroyo y el desfiladero) y lobos que te persiguen.
// El paisaje son trozos de 24 m (TREK_CH) con los modelos del Stylized Nature MegaKit (los del bosque, 34_nature) en
// instancias; cuando uno queda detrás, pasa al frente con el paisaje del tramo que toca. El suelo y el sendero no se
// mueven: corre su textura
const TREK_VMAX = 2, TREK_CH = 24, TREK_N = 5, TREK_PATH = 96; // (5 trozos: siempre hay al menos 12 m de paisaje detrás)
const TREK = { group: new THREE.Group(), nextChase: 30, keys: 0, halt: null, chase: null, v: 0, dist: 0, biome: 0, slots: [], cache: {}, obs: [], next: 0, got: 0, ducked: 0, hits: 0, light: null };
TREK.group.visible = false; arena.add(TREK.group);
const trekOn = () => settings.mode === 'trek';
const TREK_BIOMES = [
  { name: 'Bosque', pano: 'bosque', fog: 0xc4dcea, dens: 0.014, hemi: 0xd6ecff, hemiI: 0.95, key: 0xfff0d2, keyI: 1.5, dusk: 0,
    trees: ['CommonTree_3', 'CommonTree_4', 'CommonTree_5', 'CommonTree_4', 'Pine_2'], nTree: 9, bush: 5, rock: 3, flower: 10, water: false },
  { name: 'Aldea', pano: 'aldea', fog: 0xd6e6ee, dens: 0.011, hemi: 0xe8f0ff, hemiI: 1.0, key: 0xfff2dc, keyI: 1.55, dusk: 0,
    trees: ['CommonTree_4', 'CommonTree_3', 'Bush_Common_Flowers'], nTree: 3, bush: 4, rock: 1, flower: 18, water: false, village: true },
  { name: 'Pradera del lago', pano: 'lago', fog: 0xd2e8f2, dens: 0.009, hemi: 0xe2f2ff, hemiI: 1.0, key: 0xfff6e0, keyI: 1.6, dusk: 0,
    trees: ['CommonTree_4', 'Bush_Common_Flowers', 'CommonTree_3'], nTree: 4, bush: 6, rock: 4, flower: 20, water: true },
  { name: 'Pinar al atardecer', pano: 'atardecer', fog: 0xe3a27c, dens: 0.016, hemi: 0xffc9a0, hemiI: 0.8, key: 0xffa860, keyI: 1.25, dusk: 1,
    trees: ['Pine_2', 'Pine_4', 'Pine_5', 'Pine_4', 'DeadTree_1'], nTree: 10, bush: 3, rock: 5, flower: 5, water: false }
];
// El cielo de día se tiñe de atardecer en el pinar: naranja en el horizonte y malva arriba
const TREK_DUSK = { value: 0 };
Object.assign(natSkyMat.uniforms, { uDusk: TREK_DUSK });
natSkyMat.fragmentShader = 'uniform float uDusk;\n' + natSkyMat.fragmentShader.replace('gl_FragColor = vec4(c, 1.0);', `
      vec3 dk = mix(vec3(1.0, 0.56, 0.32), vec3(0.36, 0.3, 0.55), smoothstep(-0.02, 0.5, h)) + vec3(1.0, 0.7, 0.4) * pow(max(dot(d, normalize(vec3(0.0, 0.08, -1.0))), 0.0), 18.0) * 0.6;
      c = mix(c, dk * (0.8 + 0.25 * c), uDusk);
      gl_FragColor = vec4(c, 1.0);`);

/* ---------- Lo que no se mueve: la plataforma, el sendero y la luz ---------- */
const trekTex = (draw, rx = 1, ry = 1) => { const c = mkCanvas(256), x = c.getContext('2d'); draw(x, rng(5)); return texFrom(c, { repeat: [rx, ry] }); };
const TREK_PATH_TEX = trekTex((x, R) => {
  const g = x.createLinearGradient(0, 0, 256, 0); g.addColorStop(0, '#5f8f3a'); g.addColorStop(0.2, '#8a7448'); g.addColorStop(0.5, '#9b8155'); g.addColorStop(0.8, '#8a7448'); g.addColorStop(1, '#5f8f3a');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) { const X = 40 + R() * 176, Y = R() * 256; x.fillStyle = R() < 0.5 ? 'rgba(70,52,30,0.35)' : 'rgba(190,165,120,0.3)'; x.fillRect(X, Y, 2 + R() * 4, 2 + R() * 3); } // (tierra y piedrecitas)
}, 1, 1);
// El sendero es una cinta que sigue la curva: una fila de vértices por metro, de 20 m detrás a 100 delante, y su textura
// pegada a la distancia recorrida (cada 4 m, una vez)
const TREK_RIB = 121;
const trekPath = (() => {
  const g = new THREE.BufferGeometry(), n = TREK_RIB * 2, nor = new Float32Array(n * 3), idx = [];
  for (let i = 0; i < n; i++) nor[i * 3 + 1] = 1;
  for (let i = 0; i < TREK_RIB - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2)); g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: TREK_PATH_TEX, roughness: 1, metalness: 0 })); m.frustumCulled = false; m.receiveShadow = true; TREK.group.add(m); return m;
})();
/* ---------- Las curvas del sendero ---------- */
// El sendero serpentea: su rumbo cambia despacio (como mucho unos 27°, y a lo sumo 3° por segundo a la velocidad más alta)
// y el mundo gira a tu alrededor para que lo tengas siempre delante; tú sigues sobre la plataforma, mirando al frente.
// Cada cosa del camino tiene su distancia a lo largo del sendero (s) y su separación a la derecha (u): trekBend la pone en
// la arena. Sin «Sendero con curvas», recto
const trekTh = s => settings.trekCurves && trekOn() ? 0.35 * Math.sin(s * TAU / 120) + 0.12 * Math.sin(s * TAU / 70 + 1.3) : 0;
const TREK_CV = { ds: 0.5, s0: -60, x: [0], z: [0], on: -1 };
function trekP(s, out) { // el punto del sendero a la distancia s (tabla que crece según hace falta)
  const C = TREK_CV, cv = !!settings.trekCurves && trekOn(); if (C.on !== cv) { C.on = cv; C.x = [0]; C.z = [0]; } // (en Arcos, recto)
  const f = Math.max(0, (s - C.s0) / C.ds), i = Math.floor(f);
  while (C.x.length < i + 2) { const k = C.x.length - 1, th = trekTh(C.s0 + (k + 0.5) * C.ds); C.x.push(C.x[k] + Math.sin(th) * C.ds); C.z.push(C.z[k] - Math.cos(th) * C.ds); }
  const t = f - i; out.x = C.x[i] + (C.x[i + 1] - C.x[i]) * t; out.z = C.z[i] + (C.z[i + 1] - C.z[i]) * t; return out;
}
const TF = { x: 0, z: 0, c: 1, s: 0, th: 0 }, _tkp = { x: 0, z: 0 }, _tkq = { x: 0, z: 0 };
function trekFrame() { trekP(TREK.dist, _tkp); TF.x = _tkp.x; TF.z = _tkp.z; TF.th = trekTh(TREK.dist); TF.c = Math.cos(TF.th); TF.s = Math.sin(TF.th); }
// (s, u) → la arena (out.x, out.z); devuelve cuánto hay que girar lo que está allí
function trekBend(s, u, out) {
  trekP(s, _tkp); const th = trekTh(s), vx = _tkp.x + u * Math.cos(th) - TF.x, vz = _tkp.z + u * Math.sin(th) - TF.z;
  out.x = vx * TF.c + vz * TF.s; out.z = -vx * TF.s + vz * TF.c; return TF.th - th;
}
// la cinta del sendero, en su sitio
function trekRibbon() {
  const g = trekPath.geometry, P = g.attributes.position.array, U = g.attributes.uv.array;
  for (let i = 0; i < TREK_RIB; i++) {
    const s = TREK.dist - 20 + i, a = trekBend(s, 0, _tkq), nx = Math.cos(a), nz = -Math.sin(a), k = i * 6;
    P[k] = _tkq.x - nx * 1.5; P[k + 1] = 0.004; P[k + 2] = _tkq.z - nz * 1.5; P[k + 3] = _tkq.x + nx * 1.5; P[k + 4] = 0.004; P[k + 5] = _tkq.z + nz * 1.5;
    U[i * 4] = 0; U[i * 4 + 1] = s / 4; U[i * 4 + 2] = 1; U[i * 4 + 3] = s / 4;
  }
  g.attributes.position.needsUpdate = true; g.attributes.uv.needsUpdate = true;
}
// la plataforma de tablones, con dos faroles delante (lo quieto que se ve al avanzar)
const TREK_DECK = (() => {
  const g = new THREE.Group(), wood = std({ map: trekTex((x, R) => { for (let i = 0; i < 8; i++) { x.fillStyle = `hsl(28,${35 + R() * 15}%,${26 + R() * 10}%)`; x.fillRect(0, i * 32, 256, 30); x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, i * 32 + 30, 256, 2); } }), roughness: 0.9 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 1.5), wood); deck.position.y = 0.012; deck.receiveShadow = true; g.add(deck);
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(G.cyl(0.03, 0.04, 0.8, 8), wood); post.position.set(s * 0.82, 0.42, -0.7); g.add(post);
    const lamp = new THREE.Mesh(G.box(0.08, 0.11, 0.08), new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false })); lamp.position.set(s * 0.82, 0.88, -0.7); g.add(lamp);
    const glow = glowSprite(0xffc070, 0.3, 0.45); glow.position.copy(lamp.position); g.add(glow);
  }
  TREK.group.add(g); return g;
})();

/* ---------- El paisaje, por trozos ---------- */
// Cada trozo es una lista de [modelo, posición dentro del trozo]; todos los trozos se dibujan juntos, con una sola pieza por
// modelo y material (si no, cada trozo pedía sus propias piezas: el doble de dibujo que el bosque, y en las gafas no llegaba)
function trekChunk(b, slot) {
  const key = b + '_' + slot; if (TREK.cache[key]) return TREK.cache[key];
  const B = TREK_BIOMES[b], R = rng(101 + b * 37 + slot * 11), list = [], taken = [];
  const add = (n, x, z, s) => { if (NAT.parts[n]) list.push([n, new THREE.Matrix4().compose(new V3(x, 0, z), new Q4().setFromAxisAngle(_up, R() * TAU), new V3(s, s, s))]); };
  const free = (x, z, r) => !taken.some(t => Math.hypot(t.x - x, t.z - z) < t.r + r);
  // side: -1, 1 o 0 (a los dos); con el lago, la derecha es agua
  const scatter = (n, x0, x1, fn) => { for (let i = 0, k = 0; i < n && k < n * 20; k++) { const s = R() < 0.5 ? -1 : 1; const x = s * (x0 + R() * (x1 - x0)), z = -R() * TREK_CH; if (B.water && x > 2.7) continue; /* (en el agua, nada) */ if (fn(x, z) !== false) i++; } };
  if (B.village && ALD.ready) { // la aldea: casas montadas con las piezas del Medieval Village, de cara al camino, con sus vallas, carros y cajas
    for (const sd of [-1, 1]) { const z = -(4 + R() * 6), n = R() < 0.5 ? 'Aldea_Casa' : 'Aldea_Casona', x = sd * (n === 'Aldea_Casa' ? 6.5 : 7.5) + sd * R() * 2;
      list.push([n, new THREE.Matrix4().compose(new V3(x, 0, z), new Q4().setFromAxisAngle(_up, -sd * Math.PI / 2 + (R() - 0.5) * 0.2), new V3(1, 1, 1))]); taken.push({ x, z, r: 5 });
      if (R() < 0.6) { const x2 = sd * (4.2 + R()), z2 = z - 4 - R() * 3; add(R() < 0.5 ? 'Prop_Wagon' : 'Prop_Crate', x2, z2, R() < 0.5 ? 0.8 : 0.6); taken.push({ x: x2, z: z2, r: 1.5 }); }
      for (let k = 0; k < 5; k++) { const fz = -2 - k * 2.05; if (R() < 0.85) list.push(['Prop_WoodenFence_Single', new THREE.Matrix4().compose(new V3(sd * 2.6, 0, fz), new Q4().setFromAxisAngle(_up, Math.PI / 2), new V3(1, 1, 1))]); } }
  }
  scatter(B.nTree, 3.6, 15, (x, z) => { if (!free(x, z, 2.8)) return false; add(pick3(R, B.trees), x, z, 0.8 + R() * 0.55); taken.push({ x, z, r: 2.8 }); });
  scatter(B.bush, 2.2, 6, (x, z) => { if (!free(x, z, 1.2)) return false; add(R() < 0.5 ? 'Bush_Common' : 'Bush_Common_Flowers', x, z, 0.45 + R() * 0.3); taken.push({ x, z, r: 1.2 }); });
  scatter(B.rock, 2.4, 10, (x, z) => { if (!free(x, z, 1)) return false; add(`Rock_Medium_${1 + Math.floor(R() * 3)}`, x, z, 0.3 + R() * 0.45); taken.push({ x, z, r: 1 }); });
  scatter(36, 1.6, 7, (x, z) => add(['Grass_Common_Short', 'Grass_Common_Short', 'Grass_Common_Tall', 'Grass_Wispy_Short'][Math.floor(R() * 4)], x, z, 0.2 + R() * 0.15));
  scatter(B.flower, 1.7, 6, (x, z) => add('Flower_3_Group', x, z, 0.22 + R() * 0.12));
  scatter(6, 2, 7, (x, z) => add(['Fern_1', 'Plant_1_Big', 'Clover_1', 'Mushroom_Common'][Math.floor(R() * 4)], x, z, 0.3 + R() * 0.2));
  if (B.water) for (let i = 0; i < 10; i++) add(R() < 0.6 ? 'Grass_Wispy_Tall' : 'Grass_Common_Tall', 2.6 + R() * 0.9, -R() * TREK_CH, 0.3 + R() * 0.2); // (juncos en la orilla)
  return (TREK.cache[key] = list);
}
/* ---------- El agua: ondas que el viento eriza y, en el río, la corriente ---------- */
// En la tarjeta gráfica: la superficie se riza con ondas finas en varias direcciones y con ruido, y el viento las aviva a
// rachas (manchas rizadas que corren por el lago). Refleja el cielo más cuanto más de lado la miras (Fresnel), con el
// color del horizonte abajo y el azul arriba, y el sol saca destellos que bailan. En el río, todo baja con la corriente:
// la superficie, unas vetas de espuma y, alrededor de cada piedra, su espuma y la estela que deja río abajo
const TREK_WT = { value: 0 }, TREK_SUN = { value: new THREE.Vector3(0.4, 0.7, -0.6) };
const TREK_WATER_VS = `varying vec2 vP; varying vec3 vW;
  #include <fog_pars_vertex>
  void main() { vP = position.xy; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
  }`;
const TREK_WATER_FS = `uniform float time, uFlow; uniform vec2 uOff; uniform vec3 uSun, uDeep; uniform vec3 uRocks[8]; uniform vec4 uHole; uniform mat4 uHoleM;
  varying vec2 vP; varying vec3 vW;
  #include <common>
  #include <fog_pars_fragment>
  float hs(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float ns(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), f.x), mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), f.x), f.y); }
  float H(vec2 p) {
    vec2 q = p - vec2(time * uFlow, 0.0); // (en el río, todo baja con la corriente)
    float g = 0.3 + 1.1 * ns(p * 0.13 + vec2(time * 0.22, time * 0.09)); // rachas de viento
    float h = sin(dot(q, vec2(2.3, 1.1)) + time * 2.1) * 0.5 + sin(dot(q, vec2(-1.7, 2.9)) + time * 2.7) * 0.35 + sin(dot(q, vec2(4.6, -3.1)) + time * 3.9) * 0.18;
    h += (ns(q * 3.1 + time * vec2(0.5, 0.3)) - 0.5) * 0.7 + (ns(q * 7.3 - time * vec2(0.4, 0.8)) - 0.5) * 0.35;
    #ifdef RIVER
      h += (ns(vec2(q.x * 0.9, q.y * 3.5)) - 0.5) * 1.2; // remolinos alargados en la dirección de la corriente
    #endif
    return h * g;
  }
  void main() {
    vec3 hP = (uHoleM * vec4(vW, 1.0)).xyz; if (hP.x > uHole.x && hP.x < uHole.y && hP.z > uHole.z && hP.z < uHole.w) discard;
    vec2 p = vP + uOff; float e = 0.05, k = 0.07;
    vec3 N = normalize(vec3(-(H(p + vec2(e, 0.0)) - H(p - vec2(e, 0.0))) / (2.0 * e) * k, 1.0, (H(p + vec2(0.0, e)) - H(p - vec2(0.0, e))) / (2.0 * e) * k));
    vec3 V = normalize(cameraPosition - vW), R = reflect(-V, N);
    float fr = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    vec3 hz = vec3(0.78, 0.87, 0.93);
    #ifdef USE_FOG
      hz = fogColor;
    #endif
    vec3 sky = mix(hz, vec3(0.3, 0.5, 0.85), clamp(R.y * 1.6, 0.0, 1.0));
    vec3 c = mix(uDeep, sky, fr) + vec3(1.0, 0.95, 0.82) * pow(max(dot(R, normalize(uSun)), 0.0), 220.0) * 2.2; // destellos del sol
    #ifdef RIVER
      vec2 q = p - vec2(time * uFlow, 0.0);
      float foam = smoothstep(0.72, 0.92, ns(vec2(q.x * 0.7, q.y * 4.0))) * 0.45; // vetas de espuma que bajan
      for (int i = 0; i < 8; i++) { vec3 r = uRocks[i]; if (r.z <= 0.0) continue; vec2 d = p - r.xy; float dl = length(d) - r.z;
        float wake = d.x > 0.0 ? exp(-abs(d.y) * 5.0 / (1.0 + d.x * 0.8)) * exp(-d.x * 0.7) : 0.0; // la estela, río abajo
        foam += (smoothstep(0.1, -0.05, dl) * 0.8 + wake * 0.6) * smoothstep(0.25, 0.75, ns(q * 7.0 + float(i) * 3.1)); } // (a jirones, no un halo)
      c = mix(c, vec3(0.92, 0.96, 0.97), clamp(foam, 0.0, 0.9));
    #endif
    gl_FragColor = vec4(c, 1.0);
    #include <fog_fragment>
  }`;
function trekWaterMat(river) {
  const u = { time: TREK_WT, uSun: TREK_SUN, uHole: TREK_HOLE, uHoleM: TREK_HOLE_M, uFlow: { value: river ? 0.9 : 0 }, uOff: { value: new THREE.Vector2() }, uDeep: { value: new THREE.Color(river ? 0x123a36 : 0x0b2c3c) },
    uRocks: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) }, fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 2000 }, fogDensity: { value: 0.00025 } };
  return new THREE.ShaderMaterial({ uniforms: u, vertexShader: TREK_WATER_VS, fragmentShader: TREK_WATER_FS, fog: true, defines: river ? { RIVER: 1 } : {} });
}
// las piezas de dibujo, una por modelo y material, con sitio para todos los trozos; y un lago por hueco (se ve en los de agua)
function trekInst() {
  if (TREK.inst) return TREK.inst; const cap = {};
  for (let b = 0; b < TREK_BIOMES.length; b++) for (let i = 0; i < TREK_N; i++) { const c = {}; trekChunk(b, i).forEach(([n]) => c[n] = (c[n] || 0) + 1); for (const n in c) cap[n] = Math.max(cap[n] || 0, c[n]); }
  TREK.inst = {}; TREK.lakes = [];
  for (const n in cap) TREK.inst[n] = NAT.parts[n].map(p => { const m = new THREE.InstancedMesh(p.geo, p.mat, cap[n] * TREK_N); m.count = 0; m.frustumCulled = false; if (m.instanceMatrix.setUsage) m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); TREK.group.add(m); return m; });
  for (let i = 0; i < TREK_N; i++) { const w = new THREE.Mesh(new THREE.PlaneGeometry(40, TREK_CH * 1.3), trekWaterMat(false)); w.rotation.x = -Math.PI / 2; w.visible = false; TREK.group.add(w); TREK.lakes.push(w); } // (más largo que el trozo: en las curvas se solapan y no queda raya entre ellos)
  return TREK.inst;
}
// Cada hueco del frente lleva su trozo: el del tramo en el que entra al pasar al frente (así el paisaje nuevo llega de lejos)
const _tkm = new THREE.Matrix4(), _tkr = new THREE.Matrix4();
function trekLayout() {
  if (!NAT.ready || !(ALD.ready || ALD.failed)) return; const I = trekInst(); // (con la aldea ya montada: sus casas van en las mismas piezas de dibujo)
  const span = TREK_CH * TREK_N, off = ((TREK.dist % span) + span) % span, n = {};
  for (const k in I) n[k] = 0;
  // (en el arroyo y el desfiladero no crece nada: ni árboles en el agua ni hierba flotando sobre el vacío)
  const cut = TREK.obs.filter(o => o.len).map(o => { const z = -(o.at - TREK.dist), m = o.kind === 'stream' ? 3.5 : 2; return [z + m, z - o.len - m]; });
  for (let i = 0; i < TREK_N; i++) {
    let z = -i * TREK_CH + off; if (z > TREK_CH * 1.5) z -= span; // (de 12–36 m por detrás a casi span por delante)
    const S = TREK.slots[i] || (TREK.slots[i] = { b: -1, z: 99 });
    if (S.b < 0 || z < S.z - TREK_CH * 0.5) S.b = TREK.biome; // (acaba de pasar al frente: con el paisaje de ahora)
    S.z = z;
    for (const [k, M] of trekChunk(S.b, i)) { const zz = M.elements[14] + z; if (cut.length && Math.abs(M.elements[12]) < 17 && cut.some(c => zz < c[0] && zz > c[1])) continue;
      const a = trekBend(TREK.dist - zz, M.elements[12], _tkq); _tkm.copy(M); _tkm.elements[12] = 0; _tkm.elements[14] = 0; if (a) _tkm.premultiply(_tkr.makeRotationY(a)); _tkm.elements[12] = _tkq.x; _tkm.elements[14] = _tkq.z; // (en su sitio de la curva)
      for (const m of I[k]) m.setMatrixAt(n[k], _tkm); n[k]++; }
    const w = TREK.lakes[i]; w.visible = TREK_BIOMES[S.b].water; const a = trekBend(TREK.dist - (z - TREK_CH / 2), 3.2 + 20, _tkq); w.position.set(_tkq.x, 0.02, _tkq.z); w.rotation.set(-Math.PI / 2, 0, a); w.material.uniforms.uOff.value.set(0, TREK.dist - (z - TREK_CH / 2)); // (las ondas siguen de un trozo al otro, sin costura)
  }
  for (const k in I) for (const m of I[k]) { m.count = n[k]; m.instanceMatrix.needsUpdate = true; }
}

/* ---------- La aldea: casas montadas con piezas del Medieval Village (Quaternius) ---------- */
// Cada pieza es un modelo aparte (models/aldea/); sus texturas, reducidas, en models/tex/aldea/. Las paredes miden 2 × 3,1 m:
// la casa es de 4 × 4 (dos paredes por lado) y la casona de 6 × 6 (tres), con esquinas, ventanas con contraventanas,
// puerta, tejado de tejas y chimenea. Cada casa se junta en una sola pieza por material (así se dibuja de una vez)
const ALD = { ready: false, loading: false, failed: false, parts: {} };
const ALD_PIECES = ['Wall_Plaster_Straight', 'Wall_Plaster_Window_Wide_Round', 'Wall_Plaster_Door_Round', 'Wall_Plaster_WoodGrid', 'Wall_UnevenBrick_Straight', 'Wall_UnevenBrick_Window_Wide_Round', 'Wall_UnevenBrick_Door_Round',
  'Corner_Exterior_Wood', 'Corner_Exterior_Brick', 'Roof_RoundTiles_4x4', 'Roof_RoundTiles_6x6', 'Prop_Chimney', 'Window_Wide_Round1', 'WindowShutters_Wide_Round_Open', 'Door_1_Round', 'Prop_Wagon', 'Prop_Crate', 'Prop_WoodenFence_Single', 'Roof_Front_Brick4', 'Roof_Front_Brick6'];
const ALD_TEX = { MI_Plaster: 'plaster', MI_UnevenBrick: 'unevenbrick', MI_WoodTrim: 'woodtrim', MI_WoodTrim_Wear: 'woodtrim', MI_RoundTiles: 'roundtiles', MI_RockTrim: 'rocktrim', MI_Brick: 'brick', MI_RedBrick: 'redbrick' };
function aldLoad() {
  if (ALD.ready || ALD.loading || ALD.failed) return;
  if (!THREE.GLTFLoader || typeof document === 'undefined') { ALD.failed = true; return; }
  ALD.loading = true; const L = new THREE.GLTFLoader(), T = new THREE.TextureLoader(), mats = {};
  const mat = n => mats[n] || (mats[n] = (() => { const t = ALD_TEX[n]; let map = null; if (t) { map = T.load(`models/tex/aldea/${t}.jpg`); map.encoding = THREE.sRGBEncoding; map.flipY = false; }
    const m = new THREE.MeshStandardMaterial({ map, color: n === 'MI_WindowGlass' ? 0x9fc7e8 : 0xffffff, roughness: 0.9, metalness: 0 }); m.name = n; return m; })());
  Promise.all(ALD_PIECES.map(n => new Promise((res, rej) => L.load(`models/aldea/${n}.glb`, g => res([n, g]), undefined, rej)))).then(all => {
    for (const [n, g] of all) {
      g.scene.updateMatrixWorld(true); const parts = [];
      g.scene.traverse(o => { if (!o.isMesh) return; const geo = new THREE.BufferGeometry(); for (const a of ['position', 'normal', 'uv']) if (o.geometry.attributes[a]) geo.setAttribute(a, natFloat(o.geometry.attributes[a])); if (o.geometry.index) geo.setIndex(o.geometry.index); geo.applyMatrix4(o.matrixWorld); parts.push({ geo, mat: mat(o.material.name) }); });
      ALD.parts[n] = parts;
    }
    for (const n of ['Prop_Wagon', 'Prop_Crate', 'Prop_WoodenFence_Single']) NAT.parts[n] = ALD.parts[n]; // (los sueltos, como cualquier modelo del paisaje)
    NAT.parts.Aldea_Casa = aldHouse(2, 'Plaster', 'Wood'); NAT.parts.Aldea_Casona = aldHouse(3, 'UnevenBrick', 'Brick');
    ALD.ready = true; ALD.loading = false;
  }).catch(e => { ALD.failed = true; ALD.loading = false; console.log('No se pudo cargar la aldea:', e && e.message); });
}
// n paredes por lado; la fachada (+z) con la puerta en medio y ventanas; los lados, con una ventana; la de atrás, lisa
function aldHouse(n, wall, corner) {
  const half = n, put = [], M = (x, z, ry, y = 0) => new THREE.Matrix4().compose(new V3(x, y, z), new Q4().setFromAxisAngle(_up, ry), new V3(1, 1, 1));
  const W = k => `Wall_${wall}_${k}`;
  for (const [ry, ax] of [[0, 'f'], [Math.PI, 'b'], [Math.PI / 2, 'r'], [-Math.PI / 2, 'l']]) for (let i = 0; i < n; i++) {
    const t = -half + 1 + i * 2, x = ax === 'f' || ax === 'b' ? (ax === 'f' ? t : -t) : (ax === 'r' ? half : -half), z = ax === 'f' ? half : ax === 'b' ? -half : (ax === 'r' ? -t : t);
    const door = ax === 'f' && i === Math.floor(n / 2), win = !door && (ax === 'f' || ((ax === 'r' || ax === 'l') && i % 2 === 0));
    put.push([door ? W('Door_Round') : win ? W('Window_Wide_Round') : (wall === 'Plaster' && ax === 'b' ? 'Wall_Plaster_WoodGrid' : W('Straight')), M(x, z, ry)]);
    if (win) { put.push(['Window_Wide_Round1', M(x, z, ry)]); put.push(['WindowShutters_Wide_Round_Open', M(x, z, ry)]); }
  }
  for (const [x, z] of [[half, half], [-half, half], [half, -half], [-half, -half]]) put.push([`Corner_Exterior_${corner}`, M(x, z, 0)]);
  put.push([n === 2 ? 'Roof_RoundTiles_4x4' : 'Roof_RoundTiles_6x6', M(0, 0, 0, 3.12)]); put.push(['Prop_Chimney', M(half - 1, -half + 1, 0, 3.0)]);
  for (const ry of [0, Math.PI]) put.push([n === 2 ? 'Roof_Front_Brick4' : 'Roof_Front_Brick6', M(0, ry ? -half : half, ry, 3.12)]); // (los hastiales, bajo el tejado)
  const byMat = new Map();
  for (const [p, m] of put) for (const part of ALD.parts[p] || []) { const g = part.geo.clone(); g.applyMatrix4(m); (byMat.get(part.mat) || byMat.set(part.mat, []).get(part.mat)).push(g); }
  return [...byMat].map(([mat, gs]) => ({ geo: mergeGeos(gs), mat }));
}

/* ---------- Los retos del camino ---------- */
// Piden otro movimiento que el que te hace avanzar: con las piernas (sentadillas, zancadas, frontales), un tronco caído en el
// suelo que hay que saltar; con los brazos (curl), una rama baja apoyada en dos rocas, para agacharse; y, en todos, cofres a
// un lado para alargar la mano. Todo apoyado en el suelo, con su sombra, y avanzando con él
const TREK_BARK = std({ color: 0x7a5232, roughness: 0.95 });
const TREK_CHEST = { wood: std({ color: 0x8a5a2b, roughness: 0.8 }), gold: std({ color: 0xffc94a, roughness: 0.35, metalness: 0.8 }) };
const TREK_SHADOW = (() => { const c = mkCanvas(128), x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 4, 64, 64, 62); g.addColorStop(0, 'rgba(20,30,10,0.55)'); g.addColorStop(1, 'rgba(20,30,10,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }); })();
const trekLegs = () => ['squat', 'lunge', 'frontsq'].includes(settings.exercise);
// los retos de cada ejercicio: nunca el mismo movimiento que te hace avanzar (la roca se embiste con zancadas: no con ellas)
// (el arroyo y el desfiladero se cruzan saltando: no con la sentadilla con salto)
// (los bandidos, con todos: se les gana esquivando)
const trekKinds = () => { const ex = settings.exercise; return ex === 'lunge' ? ['log', 'chest', 'stream', 'bandit', 'chasm'] : trekLegs() ? ['log', 'chest', 'stream', 'bandit', 'rock', 'chasm'] : ex === 'jsquat' ? ['chest', 'rock', 'bandit'] : ['branch', 'chest', 'stream', 'bandit', 'rock', 'chasm']; };
// el movimiento que rompe las cadenas del cofre: saltos (si avanzas con las piernas), zancadas (con la sentadilla con salto) o sentadillas (con curl)
const trekChainMove = () => trekLegs() ? 'jump' : settings.exercise === 'jsquat' ? 'lunge' : 'squat';
const TREK_MOVE = { jump: ['salto', 'saltos'], lunge: ['zancada', 'zancadas'], squat: ['sentadilla', 'sentadillas'] };
function trekShadow(g, w, d, x = 0) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), TREK_SHADOW); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.012, 0); g.add(m); }
// una pieza de la isla pirata (cofre cerrado, cofre con oro), si ya se cargó
function trekPart(g, n, s) { for (const p of (typeof ISL !== 'undefined' && ISL.parts[n]) || []) { const m = new THREE.Mesh(p.geo, p.mat); m.scale.setScalar(s); g.add(m); } }
function trekRock(g, x, s) { const n = `Rock_Medium_${1 + Math.floor(Math.random() * 3)}`; for (const p of NAT.parts[n] || []) { const m = new THREE.Mesh(p.geo, p.mat); m.position.x = x; m.scale.setScalar(s); m.rotation.y = Math.random() * TAU; g.add(m); } }
function trekObsMesh(o) {
  const g = new THREE.Group();
  if (o.kind === 'branch') { // una rama gruesa apoyada en dos rocas grandes, a la altura que obliga a agacharse
    const log = new THREE.Mesh(G.cyl(0.13, 0.16, 4.2, 12), TREK_BARK); log.rotation.z = Math.PI / 2 + 0.03; log.position.y = o.y + 0.14; g.add(log);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(G.cyl(0.11, 0.16, o.y + 0.14, 8), TREK_BARK); p.position.set(s * 1.85, (o.y + 0.14) / 2, 0); g.add(p); trekRock(g, s * 1.85, 0.75); }
    trekShadow(g, 4.4, 0.9);
  } else if (o.kind === 'log') { // un tronco caído atravesado en el sendero: hay que saltarlo
    const log = new THREE.Mesh(G.cyl(0.11, 0.13, 3.4, 12), TREK_BARK); log.rotation.z = Math.PI / 2; log.rotation.y = 0.08; log.position.y = 0.11; g.add(log);
    for (const s of [-1, 1]) trekRock(g, s * 1.9, 0.45);
    trekShadow(g, 3.8, 0.8);
  } else if (o.kind === 'chest') { // el cofre de la isla pirata (Pirate Kit), en medio del camino y atado con cadenas
    o.box = new THREE.Group(); g.add(o.box); trekPart(o.box, 'Chest_Closed', 0.9);
    o.links = []; for (const a of [-0.35, 0.35]) for (let i = 0; i < 26; i++) { const t = i / 26 * TAU, l = new THREE.Mesh(MACE.link, MACE.ballMat); l.position.set(Math.cos(t) * 0.42 + a * 0.4, 0.32 + Math.sin(t) * 0.34, 0); l.rotation.set(0, i % 2 ? Math.PI / 2 : 0, t); l.scale.setScalar(1.4); g.add(l); o.links.push(l); }
    o.glow = glowSprite(0xffd166, 0.9, 0.45); o.glow.position.y = 0.5; g.add(o.glow); trekShadow(g, 1.2, 1);
  } else if (o.kind === 'stream') { // el arroyo: agua de orilla a orilla y piedras planas en zigzag (cada una, a un lado)
    // las orillas serpentean (en el sendero, el ancho justo de las piedras)
    o.eN = x => 1.2 * Math.sin(0.2 * x) + 0.5 * Math.sin(0.55 * x); o.eF = x => -o.len - 1.3 * Math.sin(0.17 * x) + 0.5 * Math.sin(0.5 * x);
    const wg = new THREE.PlaneGeometry(34, o.len, 68, 1), wp = wg.attributes.position; for (let i = 0; i < wp.count; i++) { const x = wp.getX(i); wp.setY(i, -o.len / 2 - (wp.getY(i) > 0 ? o.eF(x) : o.eN(x))); }
    const w = new THREE.Mesh(wg, trekWaterMat(true)); w.rotation.x = -Math.PI / 2; w.position.set(0, 0.03, -o.len / 2); w.userData.own = w.userData.ownMat = true; g.add(w); o.water = w;
    const R = rng(o.seed), L = [];
    o.stones = []; for (let k = 1; k <= o.need; k++) { const n = `Rock_Medium_${1 + k % 3}`, b = trekRockBox(n), sx = rand(0.7, 0.85) / b.w, sy = 0.3 / b.h, x = o.sides[k - 1] * 0.42, z = o.stop - k * o.step; L.push([n, trekM(x, 0.13 - (b.y0 + b.h) * sy, z, R() * TAU, sx, sy, sx)]); o.stones.push(new V3(x, 0.16, z)); }
    trekBanks(L, R, o.eN, o.eF);
    o.stones.forEach((p, i) => { if (i < 8) w.material.uniforms.uRocks.value[i].set(p.x, -p.z - o.len / 2, 0.36); }); // (las piedras, en las coordenadas del agua: su espuma y su estela)
    trekMerge(g, L); o.glow = glowSprite(0x8ff0ff, 0.9, 0.45); o.glow.position.copy(o.stones[0]); g.add(o.glow);
  } else if (o.kind === 'chasm') { // el desfiladero: un tajo hondo en el suelo y pilares de roca; cada salto, al siguiente
    const D = 12, box = new THREE.BoxGeometry(34, D, o.len, 1, 6, 1); box.translate(0, -D / 2, -o.len / 2);
    const P = box.attributes.position, col = new Float32Array(P.count * 3); for (let i = 0; i < P.count; i++) { const k = 0.95 * Math.exp(P.getY(i) * 0.28); col[i * 3] = k; col[i * 3 + 1] = k * 0.92; col[i * 3 + 2] = k * 0.85; } // (más oscuro cuanto más hondo)
    box.setAttribute('color', new THREE.BufferAttribute(col, 3)); const pit = new THREE.Mesh(box, trekPitMat()); pit.userData.own = true; g.add(pit);
    const R = rng(o.seed), L = []; trekRims(L, R, 0); trekRims(L, R, -o.len); trekMerge(g, L);
    o.pillars = []; o.stones = []; for (let k = 1; k < o.need; k++) { const p = new THREE.Group(), x = (R() - 0.5) * 0.3, z = o.stop - k * o.step; p.position.set(x, 0, z); p.rotation.y = R() * TAU; for (const q of trekPillar()) p.add(new THREE.Mesh(q.geo, q.mat)); g.add(p); o.pillars.push(p); o.stones.push(new V3(x, 0.3, z)); }
    o.stones.push(new V3(0, 0.3, -o.len - 0.4)); o.glow = glowSprite(0xffd166, 0.9, 0.45); o.glow.position.copy(o.stones[0]); g.add(o.glow);
  } else if (o.kind === 'bandit') { // los bandidos, plantados en el sendero, uno detrás de otro
    const n = waveIdx >= 4 ? 3 : waveIdx >= 2 ? 2 : 1;
    o.bandits = []; for (let i = 0; i < n; i++) { const b = { x: (i % 2 ? 1 : -1) * (i ? 0.7 : 0.15), z: -i * 1.3, st: 'wait', t: 0, hp: waveIdx >= 2 ? 4 : 3, /* (los golpes que hay que esquivarle) */ skin: i % 2, ph: Math.random() * 3 }; o.bandits.push(b); trekBandMesh(g, b); }
    o.warn = glowSprite(0xff3b5c, 0.8, 0); g.add(o.warn); trekShadow(g, 2.4, 3.4, 0);
  } else { // el derrumbe: una roca grande atravesada en el sendero
    o.box = new THREE.Group(); g.add(o.box); trekRock(o.box, 0, 1.5); trekShadow(g, 3, 2);
  }
  TREK.group.add(g); return g;
}
// Rocas del paisaje (Stylized Nature MegaKit) juntas en una sola pieza por material: pocas llamadas de dibujo
const trekM = (x, y, z, ry, sx, sy = sx, sz = sx) => new THREE.Matrix4().compose(new V3(x, y, z), new Q4().setFromAxisAngle(_up, ry), new V3(sx, sy, sz));
function trekMergeParts(list) {
  const by = new Map();
  for (const [n, m] of list) for (const p of NAT.parts[n] || []) { const q = p.geo.clone(); q.applyMatrix4(m); (by.get(p.mat) || by.set(p.mat, []).get(p.mat)).push(q); }
  return [...by].map(([mat, gs]) => ({ geo: mergeGeos(gs), mat }));
}
function trekMerge(g, list) { for (const q of trekMergeParts(list)) { const m = new THREE.Mesh(q.geo, q.mat); m.userData.own = true; g.add(m); } }
// lo que mide una roca a escala 1 (ancho, alto y dónde empieza por abajo)
function trekRockBox(n) {
  const c = TREK.rbox || (TREK.rbox = {}); if (c[n]) return c[n];
  const p = (NAT.parts[n] || [])[0]; let r = { w: 3, h: 2, y0: 0 };
  if (p && p.geo.computeBoundingBox) { p.geo.computeBoundingBox(); const b = p.geo.boundingBox; if (b) r = { w: Math.max(0.1, b.max.x - b.min.x, b.max.z - b.min.z), h: Math.max(0.1, b.max.y - b.min.y), y0: b.min.y }; }
  if (p) c[n] = r; return r;
}
// las orillas del arroyo: piedras y juncos a los dos lados del sendero
function trekBanks(L, R, eN, eF) {
  for (const [e, out] of [[eN, 0.5], [eF, -0.5]]) for (const sd of [-1, 1]) for (let x = 1.2 + R() * 0.4; x < 12; x += 0.9 + R() * 1.2) {
    const X = sd * x, z = e(X), n = `Rock_Medium_${1 + Math.floor(R() * 3)}`, b = trekRockBox(n), s = (0.35 + R() * 0.4) / b.w; L.push([n, trekM(X, -b.y0 * s - 0.05, z + (R() - 0.5) * 0.5, R() * TAU, s)]);
    if (R() < 0.7) L.push([R() < 0.6 ? 'Grass_Wispy_Tall' : 'Grass_Common_Tall', trekM(X + sd * 0.4, 0, e(X + sd * 0.4) + out + (R() - 0.5) * 0.4, R() * TAU, 0.3 + R() * 0.2)]);
  }
}
// el borde del desfiladero: rocas que asoman sobre el vacío, dejando libre el paso del sendero
function trekRims(L, R, z) {
  for (const sd of [-1, 1]) for (let x = 1.1 + R() * 0.3; x < 11; x += 0.8 + R()) { const n = `Rock_Medium_${1 + Math.floor(R() * 3)}`, b = trekRockBox(n), s = (0.6 + R() * 0.7) / b.w, sy = (0.35 + R() * 0.5) / b.h; L.push([n, trekM(sd * x, -0.1 - b.y0 * sy, z + (R() - 0.5) * 0.4, R() * TAU, s, sy, s)]); }
}
// un pilar de roca que sube del fondo: una piedra plana arriba (donde se aterriza) y otras más altas debajo, hasta el fondo
function trekPillar() {
  if (TREK.pillar) return TREK.pillar; if (!NAT.ready) return [];
  const L = [];
  for (let k = 0; k < 6; k++) { const n = `Rock_Medium_${1 + k % 3}`, b = trekRockBox(n), sx = (k ? 0.95 : 1.15) / b.w, h = k ? 2.6 : 0.55, sy = h / b.h, top = k ? -0.3 - (k - 1) * 2.3 : 0.1; L.push([n, trekM(0, top - (b.y0 + b.h) * sy, 0, k * 1.7, sx, sy, sx)]); }
  return (TREK.pillar = trekMergeParts(L));
}
// las paredes del desfiladero, con la textura de las rocas del bosque y más oscuras hacia el fondo
function trekPitMat() {
  if (TREK.pitMat) return TREK.pitMat;
  const src = (NAT.parts.Rock_Medium_1 || [])[0], map = src && src.mat.map ? src.mat.map.clone() : null;
  if (map) { map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(10, 4); map.needsUpdate = true; }
  return (TREK.pitMat = new THREE.MeshBasicMaterial({ map, color: 0x9a907e, vertexColors: true, side: THREE.BackSide })); // (sin luces: lo oscuro del fondo lo ponen los colores)
}
// El hueco del desfiladero en el suelo: el césped, el sendero y el agua no se pintan encima (así se ve el tajo de verdad)
const TREK_HOLE = { value: new THREE.Vector4(1, -1, 0, 0) }, TREK_HOLE_M = { value: new THREE.Matrix4() };
function trekHoleMat(m) {
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uHole: TREK_HOLE, uHoleM: TREK_HOLE_M });
    sh.vertexShader = 'varying vec3 vHoleP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vHoleP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform vec4 uHole;\nuniform mat4 uHoleM;\nvarying vec3 vHoleP;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n  vec3 hP = (uHoleM * vec4(vHoleP, 1.0)).xyz; if (hP.x > uHole.x && hP.x < uHole.y && hP.z > uHole.z && hP.z < uHole.w) discard;');
  };
  m.customProgramCacheKey = () => 'trekhole'; if (typeof comicPatch === 'function') comicPatch(m); // (y el cómic encima, como en los demás)
}
for (const m of [natGround.material, trekPath.material]) trekHoleMat(m);
// El tramo: cuántas repeticiones pide (lo pone la partida); los retos salen a ratos, uno de cada tipo por turnos
function trekWave(i) {
  TREK.biome = i % TREK_BIOMES.length; if (i) cheer(`Tramo ${i + 1}: ${TREK_BIOMES[TREK.biome].name}`, '#8fdc5a', 2.4);
  TREK.next = TREK.dist + 9; return [];
}
function trekSpawn() {
  const K = trekKinds(), kind = K[(TREK.nObs = (TREK.nObs || 0) + 1) % K.length], /* (por turnos) */ top = calibRef + HEAD_TOP;
  const o = { kind, at: TREK.next, judged: false, side: Math.random() < 0.5 ? -1 : 1, y: top - rand(0.22, 0.34), maxUp: -1 };
  if (o.kind === 'bandit' && !TREK_BAND.scene && !TREK_BAND.bare) { trekBandLoad(); o.kind = trekKinds().includes('log') ? 'log' : 'rock'; } // (los bandidos, en cuanto estén cargados)
  if (o.kind === 'bandit') Object.assign(o, { fixed: true, stop: 3.2 });
  if (kind === 'chest' && !(typeof ISL !== 'undefined' && ISL.ready)) { if (typeof islandLoad === 'function') islandLoad(); o.kind = 'log'; if (!trekKinds().includes('log')) o.kind = 'rock'; } // (el cofre, cuando la isla esté cargada)
  const N = Math.min(8, 4 + waveIdx); if (o.kind === 'chest') Object.assign(o, { move: trekChainMove(), need: N }); if (o.kind === 'rock') Object.assign(o, { move: 'lunge', need: Math.min(7, 3 + Math.ceil(waveIdx / 2)) });
  // el arroyo y el desfiladero se quedan quietos bajo la plataforma (no siguen a la cabeza) y te paras al borde, a 0,9 m;
  // cada movimiento te lleva un paso (step) adelante; exit es dónde acabas, ya en la otra orilla
  if (o.kind === 'stream') { const n = Math.min(8, 4 + waveIdx); Object.assign(o, { move: 'jump', need: n, step: 1.1, sides: Array.from({ length: n }, (_, k) => k % 2 ? 1 : -1), len: n * 1.1 - 0.9 + 0.6, exit: o.at - 0.9 + (n + 1) * 1.1 }); }
  if (o.kind === 'chasm') { const n = Math.min(7, 4 + Math.floor(waveIdx / 2)); Object.assign(o, { move: 'jump', need: n, step: 1.6, len: (n - 1) * 1.6 + 1.1 - 0.9, exit: o.at - 0.9 + n * 1.6 }); } // (n saltos: n − 1 pilares y la otra orilla)
  if (o.len) Object.assign(o, { fixed: true, stop: 0.9, seed: Math.floor(Math.random() * 1e4) });
  o.mesh = trekObsMesh(o); TREK.obs.push(o); TREK.next += rand(10, 16) + (o.len || 0);
}
// Lo rápido que avanzas sale de cada repetición: de su ritmo (el tiempo desde la anterior) y, con las piernas, de lo
// hondo que bajaste (frente a lo que pide el ejercicio); las perfectas, algo más. Esa velocidad se mantiene un poco más
// de lo que tardaste en hacerla; sin la siguiente, frenas
function trekRep(opts) {
  if (TREK.halt) { trekHaltSay(TREK.halt); return; } // (parado: lo que toca es el otro movimiento)
  const now = performance.now() / 1000, gap = TREK.lastRep ? now - TREK.lastRep : 2.4; TREK.lastRep = now;
  const kc = clamp(2.4 / Math.max(0.5, gap), 0.6, 1.5);
  const req = (settings.exercise === 'lunge' ? dv('lungeDepth') : dv('squatDepth')) / 100, depth = calibRef - TREK.minY;
  const ki = trekLegs() || settings.exercise === 'jsquat' ? clamp(depth / Math.max(0.05, req), 0.6, 1.6) : 1;
  TREK.minY = 9; TREK.kc = kc; TREK.ki = ki;
  // el turbo: TREK_TURBO_N seguidas a buen ritmo (y bien hondas) lo encienden; una floja lo apaga
  if (kc * ki >= 1.05) { TREK.tg = (TREK.tg || 0) + 1; if (!TREK.turbo && TREK.tg >= TREK_TURBO_N) trekTurbo(true); else if (!TREK.turbo && TREK.tg >= 2) hapticBoth(0.15 + 0.08 * TREK.tg, 40); }
  else { TREK.tg = 0; if (TREK.turbo) trekTurbo(false, 'Fin del turbo: más ritmo'); }
  TREK.idle = 0;
  const K = trekK(); TREK.want = clamp(1.1 * kc * ki * (opts.perfect ? 1.1 : 1), 0.5, TREK_VMAX) * K * (TREK.turbo ? TREK_TURBO_V : 1); TREK.push = clamp(gap * 1.3, 1.6, 3); // (más deprisa que antes: es una prueba física, no un paseo)
  if (kc * ki > 1.45) cheer('¡A TOPE!', '#8fdc5a', 0.9); else if (opts.perfect) cheer('¡PERFECTA!', '#3cf0c6', 1.0); else if (ki < 0.75) say('Baja más: irás más deprisa', '#ffd166', 1.0); else say('¡Bien!', '#ffffff', 0.7, false);
  if (opts.perfect) SND.perfect();
}
const _tkh = new V3();

/* ---------- Turbo por racha ---------- */
// Seis repeticiones seguidas a buen ritmo (cada una en menos de unos 2,3 s y, con las piernas, tan honda como pide el
// ejercicio) encienden el turbo: un 20 % más deprisa, los puntos de cada repetición al doble y estelas de viento que pasan
// a tu lado. Lo apagan una repetición floja, 3 s sin ninguna o chocar con un tronco o una rama; en las paradas espera
const TREK_TURBO_N = 6, TREK_TURBO_V = 1.2;
function trekTurbo(on, why) {
  if (!!TREK.turbo === on) return; TREK.turbo = on; boardDirty = true;
  if (on) { cheer('¡TURBO! Puntos ×2', '#c8ff3a', 1.8); SND.combo(); hapticBoth(0.8, 200); }
  else { TREK.tg = 0; if (why && state === 'play') cheer(why, '#a49fc8', 1.2); }
}
// las estelas: varillas finas de luz que corren hacia atrás a tu alrededor (líneas no: en las gafas, de un píxel, ni se veían)
const TREK_WIND = (() => {
  const N = 44, m = new THREE.InstancedMesh(new THREE.BoxGeometry(0.018, 0.018, 1), new THREE.MeshBasicMaterial({ color: 0xe4ffa8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }), N), seed = [];
  for (let i = 0; i < N; i++) seed.push({ x: (Math.random() < 0.5 ? 1 : -1) * rand(0.7, 3.2), y: rand(0.15, 2.6), z: rand(-14, 4), l: rand(0.8, 2.2), k: rand(0.7, 1.3) });
  m.frustumCulled = false; m.visible = false; m.userData.noInk = true; m.userData.seed = seed; arena.add(m); return m;
})();
const _twm = new THREE.Matrix4();
function trekWindStep(dt) {
  const M = TREK_WIND.material, want = trekOn() && TREK.turbo && state === 'play' ? 0.7 : 0; M.opacity += (want - M.opacity) * Math.min(1, dt * 3); TREK_WIND.visible = M.opacity > 0.01; if (!TREK_WIND.visible) return;
  const S = TREK_WIND.userData.seed, v = Math.max(1, TREK.v) * 3.2;
  S.forEach((s, i) => { s.z += v * s.k * dt; if (s.z > 4) { s.z = rand(-16, -10); s.y = rand(0.15, 2.6); } _twm.makeScale(1, 1, s.l).setPosition(HL.x + s.x, s.y, HL.z + s.z - s.l / 2); TREK_WIND.setMatrixAt(i, _twm); });
  TREK_WIND.instanceMatrix.needsUpdate = true;
}

/* ---------- Paradas: el cofre con cadenas y la roca del derrumbe ---------- */
// Ante el cofre o la roca te paras; lo que te mueve ahora es otro movimiento, contado por la cabeza:
//  · salto: subir jumpHeight sobre tu altura de pie y volver
//  · sentadilla: bajar lo que pide la sentadilla (85 %) y volver arriba
//  · zancada (embestir): bajar al menos 12 cm con la cabeza 15 cm más adelante, y volver
// Las cadenas se rompen eslabón a eslabón; la roca, a cada embestida, se aparta un poco hasta rodar fuera. Si en 40 s no
// sale, lo rodeas (sin premio)
// El salto cuenta al despegar (así el paso a la piedra o al pilar siguiente va a la vez que tu salto); el siguiente, al volver
// a tocar el suelo
const TMV = { st: 'up', z0: 0, x0: 0 };
function trekMoveStep() {
  const up = HL.y - calibRef, down = calibRef - HL.y, k = TREK.halt.move;
  if (TMV.st === 'up') { if (Math.abs(down) < 0.05) TMV.z0 += (HL.z - TMV.z0) * 0.1; // (la postura de partida, de pie)
    if (k === 'jump' && up > settings.jumpHeight / 100) { TMV.st = 'air'; return true; }
    if (k === 'squat' ? down > dv('squatDepth') / 100 * 0.85 : k === 'lunge' && down > 0.12 && HL.z < TMV.z0 - 0.15) TMV.st = 'hit'; return false; }
  if (k === 'jump' ? up < 0.04 : down < 0.07) { const ok = TMV.st === 'hit'; TMV.st = 'up'; return ok; }
  return false;
}
function trekHaltSay(o, first) {
  if (o.kind === 'bandit') { say(first ? `¡Bandidos! Esquiva sus golpes y pégales` : '¡Esquiva y pega!', '#ff8a3d', first ? 2.4 : 1.2); return; }
  const [one, many] = TREK_MOVE[o.move], left = o.need - (o.got || 0), n = `${left} ${left === 1 ? one : many}`;
  say(o.kind === 'chest' ? `¡Rompe las cadenas: ${n}!` : o.kind === 'stream' ? `${first ? 'Cruza el arroyo: ' : ''}¡salta a la piedra de la ${o.sides[o.got] < 0 ? 'izquierda' : 'derecha'}!` : o.kind === 'chasm' ? (first ? `¡Desfiladero! Salta de roca en roca: ${n}` : `¡Salta! Quedan ${left}`) : `¡Embiste la roca: ${n}!`, '#ffd166', first ? 2.4 : 1.4);
}
// en el desfiladero, cuánto aguanta cada pilar contigo encima antes de hundirse (menos en cada tramo y con el rango)
const trekCrumbleT = () => Math.max(2.6, 5.5 - 0.3 * waveIdx - 0.15 * rankIdx());
// un paso adelante en el arroyo o el desfiladero: la plataforma se desliza hasta la piedra o el pilar siguiente; en el
// desfiladero, el pilar que dejas se hunde
function trekHop(o, ok) {
  o.got++; TREK.glide += o.step; TREK.hop = { t: 0, dur: o.step / 1.8 }; o.pt = 0; const wp = o.mesh.localToWorld(_tkh.set(0, 0.2, o.stop - o.got * o.step));
  if (o.stones[o.got]) o.glow.position.copy(o.stones[o.got]); else o.glow.visible = false;
  if (o.kind === 'stream') { SND.whoosh(wp, 'arc'); fx.sparks(wp.clone(), 18, [0.6, 0.85, 1], 1.6, 0.03); }
  else { const p = o.pillars[o.got - 2]; if (p && !p.userData.sink) trekSink(p); if (ok) SND.whoosh(wp, 'arc'); }
}
// La sensación de saltar: mientras vas de una piedra (o un pilar) a la siguiente, el mundo baja y vuelve a subir (hasta
// 22 cm), como si el salto te elevara; la plataforma bajo tus pies se queda contigo
function trekHopStep(dt) {
  const H = TREK.hop; let y = 0;
  if (H) { H.t += dt; const k = H.t / H.dur; if (k >= 1) TREK.hop = null; else y = -0.22 * Math.sin(Math.PI * k); }
  TREK.group.position.y = y; NAT.group.position.y = y; TREK_DECK.position.y = -y;
}
function trekSink(p) { p.userData.sink = 0.01; const wp = p.parent ? p.parent.localToWorld(p.position.clone()) : p.position.clone(); wp.y = 0.2; fx.smoke(wp, 0.7, 0.4, 2); SND.explosion(wp, false); }
function trekHaltStep(dt, t) {
  const o = TREK.halt; if (!o) return;
  if (state !== 'play') { if (state === 'rest' || state === 'end') trekHaltEnd(o, false); return; }
  o.haltT += dt; const wp = o.mesh.localToWorld(_tkh.set(0, 0.6, 0));
  if (o.kind === 'bandit') { trekBandFight(o, dt, t); return; }
  if (o.len) { // el arroyo y el desfiladero: cada movimiento, un paso
    if (trekMoveStep()) { score += 60; boardDirty = true; hapticBoth(0.5, 60); trekHop(o, true); if (o.got >= o.need) trekHaltEnd(o, true); else trekHaltSay(o); return; }
    if (o.kind === 'chasm' && o.got >= 1) { // en un pilar: tiembla y, si tardas, se hunde contigo (una vida, solo la primera vez) y te lleva al siguiente
      const p = o.pillars[o.got - 1], T = trekCrumbleT(); o.pt = (o.pt || 0) + dt;
      if (p && o.pt > T * 0.55) { p.position.x = (p.userData.x0 === undefined ? (p.userData.x0 = p.position.x) : p.userData.x0) + Math.sin(t * 45) * 0.025 * (o.pt / T); if ((o.cr = (o.cr || 0) - dt) <= 0) { o.cr = 0.35; hapticBoth(0.3, 40); if (o.pt > T * 0.75) say('¡Se desmorona! ¡Salta!', '#ff8a3d', 0.8); } }
      if (o.pt > T) { if (!o.fell) { o.fell = true; hurtPlayer({ silent: true }); say('¡Se hundió la roca! −1 vida', '#ff3b5c', 1.8); } else { combo = 0; say('¡Se hundió! Salta antes', '#ff8a3d', 1.4); }
        if (p) trekSink(p); trekHop(o, false); if (o.got >= o.need) trekHaltEnd(o, true); }
    }
    if (o.haltT > 40 && o.got === 0 && TREK.halt === o) { say(o.kind === 'stream' ? 'Vadeas el arroyo' : 'Rodeas el desfiladero', '#a49fc8', 1.6); trekHaltEnd(o, false); }
    return;
  }
  if (trekMoveStep()) {
    o.got++; score += 60; boardDirty = true; hapticBoth(0.5, 60);
    if (o.kind === 'chest') { const cut = Math.ceil(o.links.length * o.got / o.need); o.links.forEach((l, i) => { if (i < cut && l.visible) { l.visible = false; } }); SND.metalHit(wp, true); fx.sparks(wp.clone(), 24, [1, 0.85, 0.5], 2.2, 0.03); }
    else { o.box.position.z -= 0.22; o.box.rotation.x -= 0.25; SND.metalHit(wp, false); fx.smoke(new V3(wp.x, 0.2, wp.z), 0.6, 0.5, 2); }
    if (o.got >= o.need) trekHaltEnd(o, true); else trekHaltSay(o);
  }
  if (o.haltT > 40 && TREK.halt === o) { say(o.kind === 'chest' ? 'Dejas el cofre atrás' : 'Rodeas la roca', '#a49fc8', 1.6); trekHaltEnd(o, false); }
}
function trekHaltEnd(o, won) {
  TREK.halt = null; o.done = true; o.judged = true; o.side = o.side || 1;
  if (o.exit) { TREK.glide = Math.max(0, o.exit - TREK.dist); if (o.glow) o.glow.visible = false; } // (al otro lado, también si se acaba el tramo a medias)
  if (o.kind === 'bandit') { o.warn.material.opacity = 0; for (const b of o.bandits) if (b.st !== 'down' && b.st !== 'gone') { b.st = 'leave'; b.t = 0; trekBandPlay(b, 'Walk_Loop'); } } // (los que quedan se van)
  if (!won) return;
  if (o.kind === 'bandit') { TREK.ducked++; score += 300 * o.bandits.length; cheer('¡Camino libre!', '#3cf0c6', 1.6); SND.victory(); boardDirty = true; return; }
  if (o.kind === 'stream') { TREK.ducked++; score += 300; cheer('¡Arroyo cruzado!', '#3cf0c6', 1.4); boardDirty = true; return; }
  if (o.kind === 'chasm') { if (!o.fell) TREK.ducked++; score += o.fell ? 100 : 400; cheer(o.fell ? 'Desfiladero cruzado' : '¡Desfiladero cruzado sin caer!', '#3cf0c6', 1.6); boardDirty = true; return; }
  if (o.kind === 'chest') { // dentro, una llave (con tres, el tesoro del tramo) y una gema para tu colección
    while (o.box.children.length) o.box.remove(o.box.children[0]); trekPart(o.box, 'Chest_Gold', 0.9); o.links.forEach(l => l.visible = false);
    TREK.keys++; TREK.got++; score += 400; const gems = (store(TREK_GEMS) || 0) + 1; store(TREK_GEMS, gems); SND.victory(); cheer(`¡Cofre abierto! Llave ${TREK.keys}/3 · gema ${gems}`, '#ffd166', 2.2);
    if (TREK.keys >= 3) { TREK.keys = 0; score += 1500; trophy('¡TESORO DEL TRAMO!', 'Tres llaves: +1500 puntos'); }
  } else { TREK.ducked++; score += 300; SND.explosion(o.mesh.localToWorld(_tkh.set(0, 0.5, 0)), false); cheer('¡Roca apartada!', '#3cf0c6', 1.4); }
  boardDirty = true;
}
const TREK_GEMS = 'reparena3-gems';

/* ---------- Bandidos que cortan el paso ---------- */
// El explorador con capucha (Modular Character Outfits, de Quaternius), con dos ropas y las animaciones de anims.glb (su
// esqueleto es el mismo). Te paras ante ellos y salen de uno en uno: se plantan delante de ti y te lanzan un golpe a la
// cabeza. Un gancho (de lado) se esquiva agachándote; un directo (de frente), apartándote a un lado. Cada uno lanza 3
// golpes seguidos (4 desde el tercer tramo): si se los esquivas todos, cae agotado; el que no esquivas te da (una vida) y
// tiene que volver a intentarlo. Sin puñetazos: con el retraso de las manos en las gafas, no daba tiempo a pegarles. Más
// bandidos y menos aviso en cada tramo y con el rango. Si en 75 s no acabas, se van (sin premio)
const TREK_BAND = { scene: null, clips: {}, loading: false, failed: false, bare: false, mats: null };
const TREK_BAND_CLIPS = ['Idle_Loop', 'Walk_Loop', 'Dance_Loop', 'Punch_Jab', 'Punch_Cross', 'Melee_Hook', 'Hit_Chest', 'Hit_Head', 'Death01'];
function trekBandLoad() {
  if (TREK_BAND.scene || TREK_BAND.loading || TREK_BAND.failed) return;
  if (!THREE.GLTFLoader || !THREE.SkeletonUtils || typeof document === 'undefined') { TREK_BAND.failed = true; return; }
  if (!BEAST.U) { if (BEAST.failed) TREK_BAND.failed = true; return; } // (las animaciones, con las de los monstruos)
  TREK_BAND.loading = true; const L = new THREE.GLTFLoader();
  L.load('models/bandidos/bandido.glb', g => L.load('models/bandidos/cabeza.glb', h => {
    const T = new THREE.TextureLoader(), tex = n => { const m = T.load(`models/tex/bandidos/${n}.jpg`); m.flipY = false; m.encoding = THREE.sRGBEncoding; return m; };
    const skin = std({ map: tex('piel'), roughness: 0.8, metalness: 0, skinning: true }); TREK_BAND.mats = [0, 1].map(i => ({ MI_Ranger: std({ map: tex(i ? 'ranger2' : 'ranger1'), roughness: 0.85, metalness: 0, skinning: true }), MI_Regular_Male: skin })); // (r128: con esqueleto, skinning)
    const has = new Set(); g.scene.traverse(o => { has.add(o.name); if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; } });
    const mp = g.scene.getObjectByName('pelvis').position.z;
    for (const n of TREK_BAND_CLIPS) { const c = BEAST.U.animations.find(a => a.name === n); if (c) TREK_BAND.clips[n] = beastRetarget(c, BEAST.ualPelvis, mp, has); }
    trekBandHead(g.scene, h.scene, skin); g.scene.traverse(o => { if (o.isMesh) o.userData.noInk = true; }); // (sin contorno: de lejos lo emborronaba)
    TREK_BAND.scene = g.scene; TREK_BAND.loading = false;
  }, undefined, fail), undefined, fail);
  function fail(e) { TREK_BAND.failed = true; TREK_BAND.loading = false; console.log('No se pudo cargar el bandido:', e && e.message); }
}
// La ropa del pack va encima del cuerpo base y no trae la cabeza: se la ponemos del personaje base (Superhero_Male, del
// mismo esqueleto): la cara y el cuello de su cuerpo (los triángulos que mueven la cabeza y el cuello), los ojos y las
// cejas, unidos a los huesos del bandido
function trekBandHead(body, src, skin) {
  let bones = null; body.traverse(o => { if (o.isSkinnedMesh && !bones) bones = o.skeleton.bones; }); if (!bones) return;
  const byName = {}; bones.forEach(b => byName[b.name] = b); src.updateMatrixWorld(true);
  const parts = []; src.traverse(o => { if (o.isSkinnedMesh) parts.push(o); });
  for (const m of parts) {
    const sk = m.skeleton, own = sk.bones.map(b => byName[b.name]); if (own.some(b => !b)) continue;
    let geo = m.geometry, mat;
    if (/Eye/i.test(m.material.name)) mat = std({ color: /Eyes/i.test(m.material.name) ? 0x2a1c14 : 0x3a2a1e, roughness: 0.6, metalness: 0, skinning: true });
    else { // del cuerpo, solo cabeza y cuello
      const keep = new Set(); sk.bones.forEach((b, i) => { if (b.name === 'neck_01') keep.add(i); }); const hd = sk.bones.find(b => b.name === 'Head'); if (hd) hd.traverse(b => { const i = sk.bones.indexOf(b); if (i >= 0) keep.add(i); });
      const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, I = ['getX', 'getY', 'getZ', 'getW'], top = v => { let w = 0; for (const f of I) if (keep.has(si[f](v))) w += sw[f](v); return w > 0.5; };
      const idx = geo.index, out = []; for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2); if (top(a) && top(b) && top(c)) out.push(a, b, c); }
      geo = geo.clone(); geo.setIndex(out); mat = skin;
    }
    const n = new THREE.SkinnedMesh(geo, mat); n.position.copy(m.position); n.quaternion.copy(m.quaternion); n.scale.copy(m.scale); n.frustumCulled = false;
    body.add(n); n.updateMatrixWorld(true); n.bind(new THREE.Skeleton(own, sk.boneInverses.map(x => x.clone())), m.bindMatrix.clone());
  }
}
function trekBandMesh(g, b) {
  if (!TREK_BAND.scene) return; const m = THREE.SkeletonUtils.clone(TREK_BAND.scene), M = TREK_BAND.mats[b.skin];
  m.traverse(o => { if (o.isMesh) o.material = M[o.material.name] || o.material; });
  m.position.set(b.x, 0, b.z); g.add(m); b.mesh = m; b.mix = new THREE.AnimationMixer(m); b.acts = {}; trekBandPlay(b, 'Dance_Loop');
}
function trekBandPlay(b, n, once) {
  if (!b.mix || !TREK_BAND.clips[n]) return 0; const a = b.acts[n] || (b.acts[n] = b.mix.clipAction(TREK_BAND.clips[n]));
  if (b.cur === a && !once) return a.getClip().duration;
  a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = !!once; a.timeScale = 1; a.play(); if (b.cur && b.cur !== a) b.cur.crossFadeTo(a, 0.15, false); b.cur = a; return a.getClip().duration;
}
// un punto de la arena (x, z), en las coordenadas de la parada (que puede estar girada por la curva)
const _tkl = { x: 0, z: 0 };
function trekLoc(o, x, z) { const p = o.mesh.position, a = -o.mesh.rotation.y, dx = x - p.x, dz = z - p.z; _tkl.x = dx * Math.cos(a) + dz * Math.sin(a); _tkl.z = -dx * Math.sin(a) + dz * Math.cos(a); return _tkl; }
// el sitio del combate: a 1,1 m delante de tu cabeza (el gancho se agacha: más cerca, quedaba bajo la vista) (en el grupo de la parada)
const _tbw = new V3(), _tbv = new V3(), _tbh = new V3();
function trekBandFight(o, dt, t) {
  if (state !== 'play') { if (state === 'rest' || state === 'end') trekHaltEnd(o, false); return; }
  o.haltT += dt; const B = o.bandits.find(b => b.st !== 'down' && b.st !== 'gone'); if (!B) { trekHaltEnd(o, true); return; }
  if (o.haltT > 75) { say('Los bandidos se van', '#a49fc8', 1.6); trekHaltEnd(o, false); return; }
  const L = trekLoc(o, HL.x, HL.z), fz = L.z - 1.1, D = trekBandDiff(); B.t += dt; // (tu cabeza, en las coordenadas de la parada)
  if (B.st === 'wait') { B.st = 'come'; B.t = 0; trekBandPlay(B, 'Walk_Loop'); }
  if (B.st === 'come') { const dx = L.x - B.x, dz = fz - B.z, d = Math.hypot(dx, dz), v = Math.min(d, dt * 1.3); if (d > 0.02) { B.x += dx / d * v; B.z += dz / d * v; } if (d < 0.05) { B.st = 'guard'; B.t = 0; B.gap = rand(0.7, 1.3); trekBandPlay(B, 'Idle_Loop'); } }
  else if (B.st === 'guard' && B.t > B.gap) { // prepara el golpe: un gancho (agáchate) o un directo (apártate)
    B.st = 'wind'; B.t = 0; B.atk = Math.random() < 0.5 ? 'hook' : 'jab'; B.x0 = HL.x; B.win = D.wind; B.played = false;
    say(B.atk === 'hook' ? '¡GANCHO! ¡Agáchate!' : '¡DIRECTO! ¡Apártate!', '#ff3b5c', B.win + 0.3); SND.hiss(o.mesh.localToWorld(_tbw.set(B.x, 1.5, B.z)), 0.8); }
  else if (B.st === 'wind') {
    // el golpe, llevado a mano: recoge el brazo despacio (WU s) y lo lanza también despacio (ST s), igual el gancho que el
    // directo (a su velocidad, el directo se veía en un tercio de segundo: no daba tiempo a reaccionar)
    const clip = B.atk === 'hook' ? 'Melee_Hook' : 'Punch_Jab', P = BEAST_PUNCH[clip] || [0.2, 0.3], t0 = B.win - D.wu - D.st;
    if (!B.played && B.t >= t0) { B.played = true; trekBandPlay(B, clip, true); if (B.cur) B.cur.paused = true; }
    if (B.played && B.cur && B.cur.paused) { const k = B.t - t0; B.cur.time = k < D.wu ? P[0] * smooth(clamp(k / D.wu, 0, 1)) : lerp(P[0], P[1], clamp((k - D.wu) / D.st, 0, 1)); }
    if (B.t >= B.win) { // el golpe llega: ¿lo has esquivado?
      const ok = B.atk === 'hook' ? calibRef - HL.y > 0.2 : Math.abs(HL.x - B.x0) > 0.2, p = arena.localToWorld(_tbw.set(B.x0, calibRef - 0.1, HL.z)); SND.whoosh(p, 'arc');
      if (ok) { B.hp--; score += 100; boardDirty = true; hapticBoth(0.3, 40); o.dodges = (o.dodges || 0) + 1; // (esquivado: le queda un golpe menos)
        if (B.hp <= 0) { B.st = 'down'; B.t = 0; trekBandPlay(B, 'Death01', true); cheer('¡Bandido agotado!', '#3cf0c6', 1.2); say('¡Agotado! Cae al suelo', '#3cf0c6', 1.2); SND.explosion(o.mesh.localToWorld(_tbh.set(B.x, 0.5, B.z)), false); }
        else { B.st = 'stun'; B.t = 0; B.stun = D.stun; trekBandPlay(B, 'Hit_Head', true); say(`¡Esquivado! Le quedan ${B.hp}`, '#ffd166', 0.9); } }
      else { B.st = 'guard'; B.t = 0; B.gap = rand(1.2, 1.8); trekBandPlay(B, 'Idle_Loop'); hurtPlayer({ silent: true }); comicHit(head.p.clone()); say(B.atk === 'hook' ? '¡Te ha dado! Agáchate antes' : '¡Te ha dado! Apártate a un lado', '#ff3b5c', 1.6); o.hits = (o.hits || 0) + 1; }
    }
  } else if (B.st === 'stun' && B.t > B.stun) { B.st = 'guard'; B.t = 0; B.gap = rand(0.8, 1.2); trekBandPlay(B, 'Idle_Loop'); } // (tras esquivarle, se tambalea un momento y vuelve a la carga)
  // el aviso rojo mientras prepara el golpe; dorado mientras se tambalea
  o.warn.position.set(B.x, 1.45, B.z); o.warn.material.color.setHex(B.st === 'wind' ? 0xff3b5c : 0xffd166); o.warn.material.opacity = B.st === 'wind' ? 0.35 + 0.35 * Math.sin(t * 18) : B.st === 'stun' ? 0.45 : 0;
}
// menos aviso en cada tramo y con el rango, poco a poco
const trekBandDiff = () => ({ wind: Math.max(1.6, 2.1 - 0.05 * waveIdx - 0.03 * rankIdx()), stun: 0.7, wu: 0.75, st: 0.45 }); // (wu y st: lo que dura, siempre igual, el brazo atrás y el golpe)
// Cada fotograma: dónde está cada uno, de cara a ti, su animación; los derribados se hunden y desaparecen, y los que se
// van, se apartan del camino
function trekBandAnim(o, dt, t) {
  if (TREK_BAND.scene && o.bandits[0] && !o.bandits[0].mesh) o.bandits.forEach(b => trekBandMesh(o.mesh, b));
  const L = trekLoc(o, HL.x, HL.z);
  for (const b of o.bandits) {
    if (b.st === 'down' && o.bandits.find(c => c.st !== 'down' && c.st !== 'gone') !== b && (b.t += dt) > 1.6) { b.y = (b.y || 0) - dt * 0.5; if (b.y < -0.6) b.st = 'gone'; } // (tras caer, se hunde en la hierba)
    if (b.st === 'leave') { b.t += dt; b.x += (b.x < 0 ? -1 : 1) * dt * 1.2; if (b.t > 4) b.st = 'gone'; }
    if (!b.mesh) continue;
    b.mesh.visible = b.st !== 'gone'; b.mesh.position.set(b.x, b.y || 0, b.z);
    b.mesh.rotation.y = b.st === 'leave' ? (b.x < 0 ? Math.PI / 2 : -Math.PI / 2) : Math.atan2(L.x - b.x, L.z - b.z) + Math.PI; // (de cara a ti: el modelo mira hacia −z)
    b.mix.update(dt * (b.st === 'stun' ? 0.6 : 1));
  }
}

/* ---------- Lobos que te persiguen ---------- */
// Salen del bosque por detrás y corren junto al camino: si vas más despacio que ellos, se acercan (los ves llegar a tu lado
// y los oyes) y, si te alcanzan, muerden (una vida). Si vas más deprisa, se quedan atrás y abandonan. Más rápidos en cada
// tramo y con el rango, poco a poco. Mientras estás parado ante un cofre o una roca, esperan
const TREK_WOLF = { scene: null, clips: [], loading: false, failed: false };
function trekWolfLoad() {
  if (TREK_WOLF.scene || TREK_WOLF.loading || TREK_WOLF.failed) return;
  if (!THREE.GLTFLoader || !THREE.SkeletonUtils || typeof document === 'undefined') { TREK_WOLF.failed = true; return; }
  TREK_WOLF.loading = true;
  new THREE.GLTFLoader().load('models/animales/lobo.glb', g => { TREK_WOLF.scene = g.scene; TREK_WOLF.clips = g.animations; TREK_WOLF.loading = false; }, undefined, e => { TREK_WOLF.failed = true; TREK_WOLF.loading = false; console.log('No se pudo cargar el lobo:', e && e.message); });
}
const trekWolfV = () => Math.min(1.75, 0.97 + 0.095 * waveIdx + 0.04 * rankIdx()) * trekK(); // (en m/s: hay que ir más deprisa que ellos; a tu velocidad de avance)
// la velocidad de avance elegida (Ajustes → Modo Travesía)
const trekK = () => (settings.trekSpeed || 100) / 100;
function trekChaseStart() {
  const n = waveIdx >= 2 ? 2 : 1, C = { gap: 7, v: trekWolfV(), wolves: [], t: 0, growl: 0 };
  for (let i = 0; i < n; i++) {
    C.wolves.push({ side: n === 2 ? (i ? 1 : -1) : (Math.random() < 0.5 ? -1 : 1), ph: Math.random() * 3 });
  }
  TREK.chase = C; trekWolfMeshes(C); say('¡LOBOS! Acelera', '#ff8a3d', 2); SND.roar(arena.localToWorld(_tkh.set(0, 0.6, HL.z + 6)), 0.7);
}
// (sus figuras, en cuanto el modelo esté cargado)
function trekWolfMeshes(C) {
  if (!TREK_WOLF.scene) return;
  for (const w of C.wolves) {
    if (!w.mesh) { w.mesh = THREE.SkeletonUtils.clone(TREK_WOLF.scene); w.mesh.scale.setScalar(0.33); w.mesh.rotation.y = Math.PI; TREK.group.add(w.mesh); w.mix = new THREE.AnimationMixer(w.mesh); const c = TREK_WOLF.clips.find(a => a.name === 'Gallop'); if (c) { w.act = w.mix.clipAction(c); w.act.play(); } }
  }
}
function trekChaseEnd(msg, col) { const C = TREK.chase; if (!C) return; C.wolves.forEach(w => { if (w.mesh) TREK.group.remove(w.mesh); }); TREK.chase = null; TREK.nextChase = TREK.dist + rand(45, 70); if (msg) cheer(msg, col, 1.6); boardDirty = true; }
function trekChaseStep(dt, t) {
  if (state === 'play' && !TREK.chase && !TREK.halt && TREK.dist >= TREK.nextChase) { trekWolfLoad(); trekChaseStart(); }
  const C = TREK.chase; if (!C) return; if (TREK_WOLF.scene && !C.wolves[0].mesh) trekWolfMeshes(C);
  if (state === 'rest' || state === 'end') { trekChaseEnd(); return; }
  if (state === 'play' && !TREK.halt) { C.t += dt; C.gap += (TREK.v - C.v) * dt; if (C.bit) C.gap += dt * 2; } // (tras morder, se quedan atrás)
  for (const w of C.wolves) {
    const z = HL.z + Math.max(-0.3, C.gap * 0.75 - 0.8), x = w.side * (1.5 + Math.max(0, C.gap - 2) * 0.15);
    if (w.mesh) { w.mesh.position.set(x, 0, z + Math.sin(t * 2 + w.ph) * 0.15); if (w.act) w.act.timeScale = TREK.halt ? 0.3 : 0.7 + C.v * 0.5; w.mix.update(dt); }
  }
  if (C.gap < 3 && (C.growl -= dt) <= 0) { C.growl = 1.6; SND.hiss(arena.localToWorld(_tkh.set(C.wolves[0].side * 1.5, 0.6, HL.z + 0.5))); hapticBoth(0.25, 40); }
  if (!C.bit && C.gap <= 0.4) { C.bit = true; hurtPlayer({ silent: true }); say('¡Te ha mordido un lobo! Acelera', '#ff3b5c', 1.8); boardDirty = true; }
  if (C.gap >= 14) { if (!C.bit) score += 250; trekChaseEnd(C.bit ? 'Los lobos se quedan atrás' : '¡Has dejado atrás a los lobos!', '#3cf0c6'); }
  else if (C.t > 45) trekChaseEnd('Los lobos se cansan', '#a49fc8');
}
function trekStep(dt, t) {
  const sc = arcScenic(), on = (trekOn() || sc) && NAT.ready && !arMode && ['ready', 'play', 'rest', 'paused', 'end', 'calib', 'lobby'].includes(state);
  TREK.group.visible = on; if (typeof natPlants !== 'undefined') natPlants.visible = !trekOn() && !sc;
  trekPath.visible = TREK_DECK.visible = trekOn();
  if (!trekOn()) { panoStep(dt); if (sc) arcScenicStep(t); return; } aldLoad(); trekBandLoad(); // (la aldea y los bandidos, desde que eliges la Travesía)
  TREK.push = (TREK.push || 0) - dt; TREK.minY = Math.min(TREK.minY === undefined ? 9 : TREK.minY, HL.y); // (lo más bajo de la cabeza desde la repetición anterior)
  if (state === 'play' && TREK.push > 0) TREK.v += Math.sign(TREK.want - TREK.v) * Math.min(Math.abs(TREK.want - TREK.v), dt * 0.7); // (acelera y frena suave: sin tirones)
  else if (state !== 'paused') TREK.v = Math.max(0, TREK.v - dt * (state === 'play' ? 0.45 : 0.9)); // (sin repeticiones, se para; fuera del tramo, antes)
  if (TREK.halt) { TREK.v = 0; TREK.push = 0; } // (parado ante el cofre o la roca)
  if (state === 'play' && !TREK.halt && (TREK.idle = (TREK.idle || 0) + dt) > 3) trekTurbo(false, 'Fin del turbo: no pares'); // (3 s sin repeticiones)
  if (state !== 'play' && state !== 'paused') trekTurbo(false); trekWindStep(dt);
  let step = state === 'paused' ? 0 : TREK.v * dt;
  if (TREK.glide > 0 && state !== 'paused') { const g = Math.min(TREK.glide, dt * 1.8); TREK.glide -= g; step += g; } // (el paso a la piedra o el pilar siguiente)
  TREK.dist += step;
  natGround.material.map.offset.y += step / 3.5; // (el suelo corre bajo tus pies)
  trekFrame(); trekRibbon(); trekLayout(); trekLight(dt); trekHopStep(dt);
  TREK_WT.value = t; TREK_SUN.value.copy(keyLight.position).sub(keyLight.target.position).normalize(); // (el agua se mueve; los destellos, donde está el sol)
  // los retos: salen a 40 m y se juzgan al pasar por ti
  if (state === 'play' && TREK.next && TREK.next - TREK.dist < 40) trekSpawn();
  for (const o of TREK.obs) {
    const z = o.zl = (o.fixed ? 0 : HL.z) - (o.at - TREK.dist); // (su distancia, como si el sendero fuera recto: lo que cuenta para saltar o agacharse)
    o.mesh.rotation.y = trekBend(o.at, o.dx || 0, _tkq); o.mesh.position.set(_tkq.x, 0, _tkq.z + (o.fixed ? 0 : HL.z)); o.mesh.updateMatrixWorld(true);
    if (o.bandits) trekBandAnim(o, dt, t);
    if (o.pillars) for (const p of o.pillars) { const u = p.userData; if (u.sink) { u.sink += dt * 4; p.position.y -= u.sink * dt; p.rotation.z += dt * 0.25; if (p.position.y < -14) p.visible = false; } } // (los que se hunden, al fondo)
    if (o.glow) o.glow.material.opacity = o.open ? Math.max(0, o.glow.material.opacity - dt) : 0.4 + 0.25 * Math.sin(t * 5);
    if (o.lid && o.open) o.lid.rotation.x = Math.max(-1.9, o.lid.rotation.x - dt * 6);
    if (o.judged || state !== 'play') continue;
    if (o.kind === 'log') { // saltarlo: mientras pasa bajo ti cuenta lo más alto que llegaste
      if (z - HL.z > -4 && z - HL.z < -3.9 + step) say('¡Salta!', '#ffd166', 1.2);
      if (Math.abs(z - HL.z) < 0.45) o.maxUp = Math.max(o.maxUp, head.p.y - calibRef);
      if (z >= HL.z + 0.45) { o.judged = true; if (o.maxUp < settings.jumpHeight / 100) { TREK.v *= 0.2; combo = 0; TREK.hits++; trekTurbo(false); SND.metalHit(arena.localToWorld(_tkh.set(0, 0.2, z)), false); hapticBoth(0.8, 120); say('¡Salta el tronco!', '#ff8a3d', 1.6); } else { TREK.ducked++; score += 150; SND.whoosh(arena.localToWorld(_tkh.set(0, 0.2, z)), 'arc'); cheer('¡Saltado!', '#3cf0c6', 0.9); } boardDirty = true; }
    } else if (o.kind === 'branch') {
      if (z - HL.z > -4 && z - HL.z < -3.9 + step) say('¡Agáchate!', '#ffd166', 1.2);
      if (z >= HL.z - 0.1) { o.judged = true; if (HL.y + HEAD_TOP > o.y) { TREK.v = 0; combo = 0; TREK.hits++; trekTurbo(false); SND.metalHit(arena.localToWorld(_tkh.set(0, o.y, z)), false); hapticBoth(0.8, 120); say('¡Agáchate bajo las ramas!', '#ff8a3d', 1.6); } else { TREK.ducked++; score += 120; SND.whoosh(arena.localToWorld(_tkh.set(0, o.y, z)), 'arc'); cheer('¡Esquivada!', '#3cf0c6', 0.9); } boardDirty = true; }
    } else if (!o.done && o.at - TREK.dist <= (o.stop || 1.7) && TREK.halt !== o) { // (el cofre, la roca, el arroyo o el desfiladero, delante: te paras)
      TREK.halt = o; o.got = 0; o.haltT = 0; TREK.v = 0; TREK.glide = 0; TREK.dist = o.at - (o.stop || 1.7); TMV.st = 'up'; TMV.x0 = HL.x; TMV.z0 = HL.z; trekHaltSay(o, true);
      if (o.len && TREK.chase) trekChaseEnd(o.kind === 'stream' ? 'Los lobos no cruzan el agua' : 'Los lobos se quedan al borde', '#3cf0c6'); // (no te siguen)
    }
  }
  trekHaltStep(dt, t); trekChaseStep(dt, t);
  for (const o of TREK.obs) { if (!o.done || !o.box) continue; o.out = Math.min(1, (o.out || 0) + dt * 1.2); o.dx = o.side * 2.4 * smooth(o.out); if (o.kind === 'rock') o.box.rotation.z = -o.side * o.out * 2; } // (abierto o apartado, se hace a un lado)
  TREK.obs = TREK.obs.filter(o => { const keep = (o.zl === undefined ? -99 : o.zl) - (o.len || 0) < HL.z + 6; if (!keep) trekDrop(o); return keep; });
  // el hueco del desfiladero que se ve (si hay uno), en las coordenadas del propio desfiladero
  const ch = TREK.obs.find(o => o.kind === 'chasm'); if (ch) { TREK_HOLE.value.set(-17, 17, -ch.len, 0); TREK_HOLE_M.value.copy(ch.mesh.matrixWorld).invert(); } else TREK_HOLE.value.set(1, -1, 0, 0);
}
function trekDrop(o) { TREK.group.remove(o.mesh); o.mesh.traverse(m => { if (m.isSprite) m.material.dispose(); if (m.userData && m.userData.own) m.geometry.dispose(); if (m.userData && m.userData.ownMat) m.material.dispose(); }); }
/* ---------- El fondo: una foto panorámica de verdad, si está ---------- */
// Si en models/fondos/ hay una foto panorámica (equirrectangular, 2:1) para el tramo —bosque.jpg, aldea.jpg, lago.jpg,
// atardecer.jpg—, se ve de fondo en lugar del cielo dibujado: montañas y cielo de verdad, con los árboles y lo demás en
// cómic delante. La niebla toma el color de su horizonte, para que lo de cerca se funda con ella. Gira con las curvas del
// sendero (las montañas no se mueven). Al cambiar de tramo, una se funde con la otra. Si no hay foto, el cielo de siempre
const TREK_PANO = { tex: {}, fog: {}, lum: {}, miss: {}, cur: null, a: null, b: null };
// Las fotos (Poly Haven, CC0) y la columna de cada una que queda de frente al empezar (u: lo mejor de la foto, delante).
// En los demás modos se elige una en «Fondo realista»; la Travesía usa la de cada tramo. Solo paisajes abiertos: el bosque
// de cómic (o, en Arcos, el paisaje de la Travesía) delante y la foto al fondo (b: el tramo de la Travesía que le va). Las
// de bosque por dentro, ciudad y playa se quitaron: con los árboles y las casas pegados, se veían planos, de cartón
const PANOS = {
  aldea: { u: 0.45, label: 'Prado con los Alpes', b: 1 }, bosque: { u: 0.82, label: 'Pradera y montaña', b: 0 }, montana: { u: 0.55, label: 'Montaña y valle', b: 0 }, cumbre: { u: 0.62, label: 'Cumbre sobre el mar', b: 0 },
  lago: { u: 0.25, label: 'Colinas con nubes', b: 2 }, atardecer: { u: 0.6, label: 'Colinas al atardecer', b: 3 }, ocaso: { u: 0.59, label: 'Ocaso junto al lago', b: 2 } };
// Arcos con un paisaje abierto: avanzas por él (el de la Travesía, sin sus retos), sin compuertas
const arcScenic = () => settings.mode === 'arcs' && !!PANOS[settings.pano] && !arMode && natureOn();
// la foto de ahora: en la Travesía, la del tramo; en Arcos (en el bosque), la elegida; si no, ninguna
const panoWant = () => trekOn() ? TREK_BIOMES[TREK.biome].pano : PANOS[settings.pano] && typeof natureOn === 'function' && natureOn() ? settings.pano : null;
// La foto en la tarjeta gráfica: cada punto del cielo toma el color de su dirección en la foto (equirrectangular). Sin
// mipmaps (la foto se ve siempre a su tamaño o más grande: así no sale la costura)
const PANO_VS = `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const PANO_FS = `uniform sampler2D map; uniform float opacity, uYaw; varying vec3 vW;
  void main() {
    vec3 dir = normalize(vW - cameraPosition);
    float c = cos(-uYaw), s = sin(-uYaw); vec3 l = vec3(dir.x * c + dir.z * s, dir.y, -dir.x * s + dir.z * c);
    vec2 uv = vec2(fract(atan(l.z, l.x) / 6.2831853), 1.0 - acos(clamp(l.y, -1.0, 1.0)) / 3.1415927);
    gl_FragColor = vec4(texture2D(map, uv).rgb, opacity);
  }`;
function trekPanoMesh() {
  const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: null }, opacity: { value: 0 }, uYaw: { value: 0 } }, vertexShader: PANO_VS, fragmentShader: PANO_FS, side: THREE.BackSide, transparent: true, depthWrite: false });
  const m = new THREE.Mesh(new THREE.SphereGeometry(130, 32, 16), mat);
  Object.defineProperty(mat, 'map', { get: () => mat.uniforms.map.value, set: v => { mat.uniforms.map.value = v; } }); // (como un material normal: .map y .opacity)
  Object.defineProperty(mat, 'opacity', { get: () => mat.uniforms.opacity.value, set: v => { mat.uniforms.opacity.value = v; } });
  m.renderOrder = -9; m.frustumCulled = false; m.userData.noInk = true; NAT.group.add(m); return m;
}
function trekPanoLoad(n) {
  const P = TREK_PANO; if (P.tex[n] || P.miss[n] || typeof document === 'undefined' || !THREE.TextureLoader) return;
  P.tex[n] = 'loading';
  new THREE.TextureLoader().load(`models/fondos/${n}.jpg`, t => {
    t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; P.tex[n] = t;
    try { const c = mkCanvas(64), x = c.getContext('2d'); x.drawImage(t.image, 0, 0, 64, 64); const all = x.getImageData(0, 0, 64, 64).data; let L = 0; for (let i = 0; i < all.length; i += 4) L += (all[i] * 0.3 + all[i + 1] * 0.59 + all[i + 2] * 0.11) / 255; P.lum[n] = L / (all.length / 4); const d = x.getImageData(0, 30, 64, 3).data; let r = 0, g = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; } const k = d.length / 4; P.fog[n] = new THREE.Color(r / k / 255, g / k / 255, b / k / 255); } catch (e) { P.fog[n] = null; } // (el color del horizonte, para la niebla)
  }, undefined, () => { P.miss[n] = true; delete P.tex[n]; });
}
function trekPanoStep(dt) {
  const P = TREK_PANO, n = panoWant(); if (n) trekPanoLoad(n);
  if (!P.a) { if (!n) return null; P.a = trekPanoMesh(); P.b = trekPanoMesh(); }
  const t = n && P.tex[n], ready = !!t && t !== 'loading';
  if (ready && P.cur !== n) { const old = P.a; P.a = P.b; P.b = old; P.a.material.map = t; P.a.material.opacity = 0; P.a.material.needsUpdate = true; P.cur = n; P.a.userData.yaw = TAU * ((PANOS[n] ? PANOS[n].u : 0.75) - 0.75); }
  if (!n) P.cur = null; // (la nueva, delante, empieza transparente; panoU: la columna de la foto que queda de frente al empezar)
  P.a.material.opacity = ready ? Math.min(1, P.a.material.opacity + dt * 0.5) : Math.max(0, P.a.material.opacity - dt);
  if (P.a.material.opacity >= 1 && P.b.material.map) { // (la de antes, ya tapada: fuera de la memoria de vídeo; cada foto ocupa unos 40 MB)
    const old = P.b.material.map; if (old !== P.a.material.map) { old.dispose(); for (const k in P.tex) if (P.tex[k] === old) delete P.tex[k]; }
    P.b.material.map = null; P.b.material.needsUpdate = true; }
  P.b.material.opacity = P.a.material.opacity >= 1 ? 0 : P.b.material.opacity; P.a.renderOrder = -8; P.b.renderOrder = -9;
  const on = !!n || P.a.material.opacity > 0.001;
  for (const m of [P.a, P.b]) { m.visible = on && m.material.opacity > 0.001 && !!m.material.map; m.position.copy(natSky.position); const U = m.material.uniforms; U.uYaw.value = (trekOn() ? TF.th : 0) + (m.userData.yaw || 0); }
  natSky.visible = !(n && P.a.visible && P.a.material.opacity >= 1);
  return ready ? P.fog[n] : null;
}
// En los demás modos, con «Fondo realista» (Opciones → Entorno): la foto detrás, la niebla del color de su horizonte y la
// luz según lo clara que es. Sin foto, todo como antes
function panoStep(dt) {
  const P = TREK_PANO; if (!P.a && !panoWant()) return; const pf = trekPanoStep(dt), f = scene.fog;
  if (pf && f && natureOn()) { if (!f.base) f.base = f.color.clone(); if (!P.fog0) P.fog0 = f.base.clone(); f.base.lerp(pf, Math.min(1, dt * 0.6)); renderer.setClearColor(f.base, 1); }
  else if (!pf && P.fog0 && f && f.base) { f.base.copy(P.fog0); P.fog0 = null; } // (sin foto, vuelve su niebla)
  if (pf) { if (!P.l0) P.l0 = [hemi.intensity, keyLight.intensity]; const k = clamp(0.3 + (P.lum[P.cur] || 0.5) * 1.3, 0.45, 1.05); hemi.intensity += (P.l0[0] * k - hemi.intensity) * Math.min(1, dt * 2); keyLight.intensity += (P.l0[1] * k - keyLight.intensity) * Math.min(1, dt * 2); }
  else if (P.l0) { hemi.intensity = P.l0[0]; keyLight.intensity = P.l0[1]; P.l0 = null; }
}
// Arcos por un paisaje abierto: el de la Travesía (sin sus retos ni su sendero), que pasa a tu lado a la velocidad de los
// arcos (los metros de la ronda), recto bajo la pista
function arcScenicStep(t) {
  const B = PANOS[settings.pano].b || 0; if (TREK.biome !== B) { TREK.biome = B; TREK.slots = []; }
  if (TREK.obs.length) { TREK.obs.forEach(trekDrop); TREK.obs = []; }
  const d = typeof ARX !== 'undefined' ? ARX.dist || 0 : 0, step = d - (TREK.arcD === undefined ? d : TREK.arcD); TREK.arcD = d;
  if (step < 0 || step > 5) TREK.slots = []; else natGround.material.map.offset.y += step / 3.5; // (una ronda nueva: el paisaje, desde el principio)
  TREK.dist = d; trekFrame(); trekLayout(); TREK_WT.value = t;
}
// La luz y la niebla del paisaje de ahora, poco a poco (la niebla, en su color de base: la tormenta de los Arcos la tiñe encima)
const _tkc = new THREE.Color();
function trekLight(dt) {
  if (!natureOn()) return;
  const B = TREK_BIOMES[TREK.biome], k = Math.min(1, dt * 0.6), f = scene.fog, pf = trekPanoStep(dt);
  if (f) { if (!f.base) f.base = f.color.clone(); f.base.lerp(pf || _tkc.setHex(B.fog), k); f.density += (B.dens - f.density) * k; renderer.setClearColor(f.base, 1); }
  hemi.color.lerp(_tkc.setHex(B.hemi), k); hemi.intensity += (B.hemiI - hemi.intensity) * k;
  keyLight.color.lerp(_tkc.setHex(B.key), k); keyLight.intensity += (B.keyI - keyLight.intensity) * k;
  TREK_DUSK.value += (B.dusk - TREK_DUSK.value) * k;
}
// Al empezar una ronda: desde el principio del sendero, en el bosque
function trekReset() {
  trekWolfLoad(); trekBandLoad(); aldLoad(); if (typeof islandLoad === 'function') islandLoad(); // (el lobo y el cofre de la isla, que se cargan antes de hacer falta)
  TREK.obs.forEach(trekDrop); trekChaseEnd(); TREK_HOLE.value.set(1, -1, 0, 0); Object.assign(TREK, { glide: 0, halt: null, keys: 0, nextChase: 30, v: 0, want: 0, push: 0, lastRep: 0, minY: 9, kc: 1, ki: 1, turbo: false, tg: 0, idle: 0, dist: 0, biome: 0, obs: [], next: 0, got: 0, ducked: 0, hits: 0 });
  TREK.slots = []; TREK_DUSK.value = 0; TREK.hop = null; NAT.group.position.y = 0; TREK.group.position.y = 0;
  natGround.material.map.offset.y = 0; TREK_PATH_TEX.offset.y = 0;
}
settingHooks.push(k => {
  if (k === 'mode' || k === '*') { if (!trekOn()) { natGround.material.map.offset.y = 0; TREK_DUSK.value = 0; NAT.group.position.y = 0; natSky.visible = true; trekPath.visible = TREK_DECK.visible = false; } }
  if ((k === 'mode' || k === 'look' || k === '*') && trekOn() && settings.look !== 'comic') setSetting('look', 'comic'); // (la Travesía, siempre en cómic)
});
