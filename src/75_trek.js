/* =================== TRAVESÍA =================== */
// Recorres un sendero del bosque a fuerza de repeticiones: cada una te da impulso (las perfectas, más) y, si paras, te
// paras. Vas de pie sobre una plataforma de madera quieta bajo los pies (lo fijo alrededor evita el mareo), que avanza
// despacio y siempre en línea recta (como mucho TREK_VMAX). Cada oleada es un tramo con su paisaje: bosque, pradera del
// lago y pinar al atardecer; el paisaje nuevo va llegando por delante. Por el camino, retos de otro movimiento (troncos,
// ramas bajas, cofres con cadenas, el derrumbe, el arroyo y el desfiladero) y lobos que te persiguen.
// El paisaje son trozos de 24 m (TREK_CH) con los modelos del Stylized Nature MegaKit (los del bosque, 34_nature) en
// instancias; cuando uno queda detrás, pasa al frente con el paisaje del tramo que toca. El suelo y el sendero no se
// mueven: corre su textura
const TREK_VMAX = 1.5, TREK_CH = 24, TREK_N = 4, TREK_PATH = 96;
const TREK = { group: new THREE.Group(), nextChase: 30, keys: 0, halt: null, chase: null, v: 0, dist: 0, biome: 0, slots: [], cache: {}, obs: [], next: 0, got: 0, ducked: 0, hits: 0, light: null };
TREK.group.visible = false; arena.add(TREK.group);
const trekOn = () => settings.mode === 'trek';
const TREK_BIOMES = [
  { name: 'Bosque', fog: 0xc4dcea, dens: 0.014, hemi: 0xd6ecff, hemiI: 0.95, key: 0xfff0d2, keyI: 1.5, dusk: 0,
    trees: ['CommonTree_3', 'CommonTree_4', 'CommonTree_5', 'CommonTree_4', 'Pine_2'], nTree: 9, bush: 5, rock: 3, flower: 10, water: false },
  { name: 'Aldea', fog: 0xd6e6ee, dens: 0.011, hemi: 0xe8f0ff, hemiI: 1.0, key: 0xfff2dc, keyI: 1.55, dusk: 0,
    trees: ['CommonTree_4', 'CommonTree_3', 'Bush_Common_Flowers'], nTree: 3, bush: 4, rock: 1, flower: 18, water: false, village: true },
  { name: 'Pradera del lago', fog: 0xd2e8f2, dens: 0.009, hemi: 0xe2f2ff, hemiI: 1.0, key: 0xfff6e0, keyI: 1.6, dusk: 0,
    trees: ['CommonTree_4', 'Bush_Common_Flowers', 'CommonTree_3'], nTree: 4, bush: 6, rock: 4, flower: 20, water: true },
  { name: 'Pinar al atardecer', fog: 0xe3a27c, dens: 0.016, hemi: 0xffc9a0, hemiI: 0.8, key: 0xffa860, keyI: 1.25, dusk: 1,
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
}, 1, TREK_PATH / 4);
const trekPath = new THREE.Mesh(new THREE.PlaneGeometry(3, TREK_PATH), new THREE.MeshStandardMaterial({ map: TREK_PATH_TEX, roughness: 1, metalness: 0 }));
trekPath.rotation.x = -Math.PI / 2; trekPath.position.set(0, 0.004, -TREK_PATH / 2 + 6); trekPath.receiveShadow = true; TREK.group.add(trekPath);
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
  const scatter = (n, x0, x1, fn) => { for (let i = 0, k = 0; i < n && k < n * 20; k++) { const s = R() < 0.5 ? -1 : 1; if (B.water && s > 0 && x0 > 2.6) continue; const x = s * (x0 + R() * (x1 - x0)), z = -R() * TREK_CH; if (fn(x, z) !== false) i++; } };
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
const TREK_WATER = new THREE.MeshStandardMaterial({ color: 0x4f9ccf, roughness: 0.12, metalness: 0.25, transparent: true, opacity: 0.88 });
// las piezas de dibujo, una por modelo y material, con sitio para todos los trozos; y un lago por hueco (se ve en los de agua)
function trekInst() {
  if (TREK.inst) return TREK.inst; const cap = {};
  for (let b = 0; b < TREK_BIOMES.length; b++) for (let i = 0; i < TREK_N; i++) { const c = {}; trekChunk(b, i).forEach(([n]) => c[n] = (c[n] || 0) + 1); for (const n in c) cap[n] = Math.max(cap[n] || 0, c[n]); }
  TREK.inst = {}; TREK.lakes = [];
  for (const n in cap) TREK.inst[n] = NAT.parts[n].map(p => { const m = new THREE.InstancedMesh(p.geo, p.mat, cap[n] * TREK_N); m.count = 0; m.frustumCulled = false; if (m.instanceMatrix.setUsage) m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); TREK.group.add(m); return m; });
  for (let i = 0; i < TREK_N; i++) { const w = new THREE.Mesh(new THREE.PlaneGeometry(40, TREK_CH), TREK_WATER); w.rotation.x = -Math.PI / 2; w.visible = false; TREK.group.add(w); TREK.lakes.push(w); }
  return TREK.inst;
}
// Cada hueco del frente lleva su trozo: el del tramo en el que entra al pasar al frente (así el paisaje nuevo llega de lejos)
const _tkm = new THREE.Matrix4();
function trekLayout() {
  if (!NAT.ready || !(ALD.ready || ALD.failed)) return; const I = trekInst(); // (con la aldea ya montada: sus casas van en las mismas piezas de dibujo)
  const span = TREK_CH * TREK_N, off = ((TREK.dist % span) + span) % span, n = {};
  for (const k in I) n[k] = 0;
  // (en el arroyo y el desfiladero no crece nada: ni árboles en el agua ni hierba flotando sobre el vacío)
  const cut = TREK.obs.filter(o => o.len).map(o => { const z = -(o.at - TREK.dist); return [z + 2, z - o.len - 2]; });
  for (let i = 0; i < TREK_N; i++) {
    let z = -i * TREK_CH + off; if (z > TREK_CH) z -= span; // (de TREK_CH por detrás a casi span por delante)
    const S = TREK.slots[i] || (TREK.slots[i] = { b: -1, z: 99 });
    if (S.b < 0 || z < S.z - TREK_CH * 0.5) S.b = TREK.biome; // (acaba de pasar al frente: con el paisaje de ahora)
    S.z = z;
    for (const [k, M] of trekChunk(S.b, i)) { const zz = M.elements[14] + z; if (cut.length && Math.abs(M.elements[12]) < 17 && cut.some(c => zz < c[0] && zz > c[1])) continue;
      _tkm.copy(M); _tkm.elements[14] = zz; for (const m of I[k]) m.setMatrixAt(n[k], _tkm); n[k]++; }
    const w = TREK.lakes[i]; w.visible = TREK_BIOMES[S.b].water; w.position.set(3.2 + 20, 0.02, z - TREK_CH / 2);
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
// (el arroyo se cruza con zancadas laterales y el desfiladero, saltando: ni el uno con zancadas ni el otro con la sentadilla con salto)
const trekKinds = () => { const ex = settings.exercise; return ex === 'lunge' ? ['log', 'chest', 'chasm'] : trekLegs() ? ['log', 'chest', 'stream', 'rock', 'chasm'] : ex === 'jsquat' ? ['chest', 'rock', 'stream'] : ['branch', 'chest', 'stream', 'rock', 'chasm']; };
// el movimiento que rompe las cadenas del cofre: saltos (si avanzas con las piernas), zancadas (con la sentadilla con salto) o sentadillas (con curl)
const trekChainMove = () => trekLegs() ? 'jump' : settings.exercise === 'jsquat' ? 'lunge' : 'squat';
const TREK_MOVE = { jump: ['salto', 'saltos'], lunge: ['zancada', 'zancadas'], squat: ['sentadilla', 'sentadillas'], side: ['zancada lateral', 'zancadas laterales'] };
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
    const w = new THREE.Mesh(new THREE.PlaneGeometry(34, o.len), TREK_WATER); w.rotation.x = -Math.PI / 2; w.position.set(0, 0.03, -o.len / 2); w.userData.own = true; g.add(w);
    const R = rng(o.seed), L = [];
    o.stones = []; for (let k = 1; k <= o.need; k++) { const n = `Rock_Medium_${1 + k % 3}`, b = trekRockBox(n), sx = rand(0.7, 0.85) / b.w, sy = 0.3 / b.h, x = o.sides[k - 1] * 0.42, z = o.stop - k * o.step; L.push([n, trekM(x, 0.13 - (b.y0 + b.h) * sy, z, R() * TAU, sx, sy, sx)]); o.stones.push(new V3(x, 0.16, z)); }
    trekBanks(L, R, 0, o.len);
    trekMerge(g, L); o.glow = glowSprite(0x8ff0ff, 0.9, 0.45); o.glow.position.copy(o.stones[0]); g.add(o.glow);
  } else if (o.kind === 'chasm') { // el desfiladero: un tajo hondo en el suelo y pilares de roca; cada salto, al siguiente
    const D = 12, box = new THREE.BoxGeometry(34, D, o.len, 1, 6, 1); box.translate(0, -D / 2, -o.len / 2);
    const P = box.attributes.position, col = new Float32Array(P.count * 3); for (let i = 0; i < P.count; i++) { const k = 0.95 * Math.exp(P.getY(i) * 0.28); col[i * 3] = k; col[i * 3 + 1] = k * 0.92; col[i * 3 + 2] = k * 0.85; } // (más oscuro cuanto más hondo)
    box.setAttribute('color', new THREE.BufferAttribute(col, 3)); const pit = new THREE.Mesh(box, trekPitMat()); pit.userData.own = true; g.add(pit);
    const R = rng(o.seed), L = []; trekRims(L, R, 0); trekRims(L, R, -o.len); trekMerge(g, L);
    o.pillars = []; o.stones = []; for (let k = 1; k < o.need; k++) { const p = new THREE.Group(), x = (R() - 0.5) * 0.3, z = o.stop - k * o.step; p.position.set(x, 0, z); p.rotation.y = R() * TAU; for (const q of trekPillar()) p.add(new THREE.Mesh(q.geo, q.mat)); g.add(p); o.pillars.push(p); o.stones.push(new V3(x, 0.3, z)); }
    o.stones.push(new V3(0, 0.3, -o.len - 0.4)); o.glow = glowSprite(0xffd166, 0.9, 0.45); o.glow.position.copy(o.stones[0]); g.add(o.glow);
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
function trekBanks(L, R, z0, len) {
  for (const z of [z0, z0 - len]) for (const sd of [-1, 1]) for (let x = 1.2 + R() * 0.4; x < 9; x += 0.9 + R() * 1.2) {
    const n = `Rock_Medium_${1 + Math.floor(R() * 3)}`, b = trekRockBox(n), s = (0.35 + R() * 0.4) / b.w; L.push([n, trekM(sd * x, -b.y0 * s - 0.05, z + (R() - 0.5) * 0.5, R() * TAU, s)]);
    if (R() < 0.7) L.push([R() < 0.6 ? 'Grass_Wispy_Tall' : 'Grass_Common_Tall', trekM(sd * (x + 0.4), 0, z + (z === z0 ? 0.5 : -0.5) + (R() - 0.5) * 0.4, R() * TAU, 0.3 + R() * 0.2)]);
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
for (const m of [natGround.material, trekPath.material, TREK_WATER]) trekHoleMat(m);
// El tramo: cuántas repeticiones pide (lo pone la partida); los retos salen a ratos, uno de cada tipo por turnos
function trekWave(i) {
  TREK.biome = i % TREK_BIOMES.length; if (i) cheer(`Tramo ${i + 1}: ${TREK_BIOMES[TREK.biome].name}`, '#8fdc5a', 2.4);
  TREK.next = TREK.dist + 9; return [];
}
function trekSpawn() {
  const K = trekKinds(), kind = K[(TREK.nObs = (TREK.nObs || 0) + 1) % K.length], /* (por turnos) */ top = calibRef + HEAD_TOP;
  const o = { kind, at: TREK.next, judged: false, side: Math.random() < 0.5 ? -1 : 1, y: top - rand(0.22, 0.34), maxUp: -1 };
  if (kind === 'chest' && !(typeof ISL !== 'undefined' && ISL.ready)) { if (typeof islandLoad === 'function') islandLoad(); o.kind = 'log'; if (!trekKinds().includes('log')) o.kind = 'rock'; } // (el cofre, cuando la isla esté cargada)
  const N = Math.min(8, 4 + waveIdx); if (o.kind === 'chest') Object.assign(o, { move: trekChainMove(), need: N }); if (o.kind === 'rock') Object.assign(o, { move: 'lunge', need: Math.min(7, 3 + Math.ceil(waveIdx / 2)) });
  // el arroyo y el desfiladero se quedan quietos bajo la plataforma (no siguen a la cabeza) y te paras al borde, a 0,9 m;
  // cada movimiento te lleva un paso (step) adelante; exit es dónde acabas, ya en la otra orilla
  if (o.kind === 'stream') { const n = Math.min(8, 4 + waveIdx); Object.assign(o, { move: 'side', need: n, step: 1.1, sides: Array.from({ length: n }, (_, k) => k % 2 ? 1 : -1), len: n * 1.1 - 0.9 + 0.6, exit: o.at - 0.9 + (n + 1) * 1.1 }); }
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
  TREK.want = clamp(0.8 * kc * ki * (opts.perfect ? 1.1 : 1), 0.3, TREK_VMAX); TREK.push = clamp(gap * 1.3, 1.6, 3);
  if (kc * ki > 1.45) cheer('¡A TOPE!', '#8fdc5a', 0.9); else if (opts.perfect) cheer('¡PERFECTA!', '#3cf0c6', 1.0); else if (ki < 0.75) say('Baja más: irás más deprisa', '#ffd166', 1.0); else say('¡Bien!', '#ffffff', 0.7, false);
  if (opts.perfect) SND.perfect();
}
const _tkh = new V3();

/* ---------- Paradas: el cofre con cadenas y la roca del derrumbe ---------- */
// Ante el cofre o la roca te paras; lo que te mueve ahora es otro movimiento, contado por la cabeza:
//  · salto: subir jumpHeight sobre tu altura de pie y volver
//  · sentadilla: bajar lo que pide la sentadilla (85 %) y volver arriba
//  · zancada (embestir): bajar al menos 12 cm con la cabeza 15 cm más adelante, y volver
// Las cadenas se rompen eslabón a eslabón; la roca, a cada embestida, se aparta un poco hasta rodar fuera. Si en 40 s no
// sale, lo rodeas (sin premio)
//  · zancada lateral (el arroyo): bajar al menos 10 cm con la cabeza 22 cm hacia el lado de la piedra siguiente, y volver al centro
const TMV = { st: 'up', z0: 0, x0: 0 };
function trekMoveStep() {
  const up = HL.y - calibRef, down = calibRef - HL.y, o = TREK.halt, k = o.move, dx = HL.x - TMV.x0;
  if (TMV.st === 'up') { if (Math.abs(down) < 0.05) { TMV.z0 += (HL.z - TMV.z0) * 0.1; if (Math.abs(dx) < 0.1) TMV.x0 += dx * 0.05; } // (la postura de partida, de pie)
    if (k === 'side') { if (down > 0.1 && Math.abs(dx) > 0.22) TMV.st = dx * o.sides[o.got] > 0 ? 'hit' : 'wrong'; return false; }
    if (k === 'jump' ? up > settings.jumpHeight / 100 : k === 'squat' ? down > dv('squatDepth') / 100 * 0.85 : down > 0.12 && HL.z < TMV.z0 - 0.15) TMV.st = 'hit'; return false; }
  if (k === 'side' ? down < 0.06 && Math.abs(dx) < 0.15 : k === 'jump' ? up < 0.04 : down < 0.07) { const ok = TMV.st === 'hit'; TMV.st = 'up'; if (!ok) say(`¡Al otro lado: a la ${o.sides[o.got] < 0 ? 'izquierda' : 'derecha'}!`, '#ff8a3d', 1.4); return ok; }
  return false;
}
function trekHaltSay(o, first) {
  const [one, many] = TREK_MOVE[o.move], left = o.need - (o.got || 0), n = `${left} ${left === 1 ? one : many}`;
  say(o.kind === 'chest' ? `¡Rompe las cadenas: ${n}!` : o.kind === 'stream' ? `${first ? 'Cruza el arroyo: ' : ''}¡zancada lateral a la ${o.sides[o.got] < 0 ? 'izquierda' : 'derecha'}!` : o.kind === 'chasm' ? (first ? `¡Desfiladero! Salta de roca en roca: ${n}` : `¡Salta! Quedan ${left}`) : `¡Embiste la roca: ${n}!`, '#ffd166', first ? 2.4 : 1.4);
}
// en el desfiladero, cuánto aguanta cada pilar contigo encima antes de hundirse (menos en cada tramo y con el rango)
const trekCrumbleT = () => Math.max(2.6, 5.5 - 0.3 * waveIdx - 0.15 * rankIdx());
// un paso adelante en el arroyo o el desfiladero: la plataforma se desliza hasta la piedra o el pilar siguiente; en el
// desfiladero, el pilar que dejas se hunde
function trekHop(o, ok) {
  o.got++; TREK.glide += o.step; o.pt = 0; const wp = arena.localToWorld(_tkh.set(0, 0.2, o.mesh.position.z + o.stop - o.got * o.step));
  if (o.stones[o.got]) o.glow.position.copy(o.stones[o.got]); else o.glow.visible = false;
  if (o.kind === 'stream') { SND.whoosh(wp, 'arc'); fx.sparks(wp.clone(), 18, [0.6, 0.85, 1], 1.6, 0.03); }
  else { const p = o.pillars[o.got - 2]; if (p && !p.userData.sink) trekSink(p); if (ok) SND.whoosh(wp, 'arc'); }
}
function trekSink(p) { p.userData.sink = 0.01; const wp = p.parent ? p.parent.localToWorld(p.position.clone()) : p.position.clone(); wp.y = 0.2; fx.smoke(wp, 0.7, 0.4, 2); SND.explosion(wp, false); }
function trekHaltStep(dt, t) {
  const o = TREK.halt; if (!o) return;
  if (state !== 'play') { if (state === 'rest' || state === 'end') trekHaltEnd(o, false); return; }
  o.haltT += dt; const wp = arena.localToWorld(_tkh.set(o.mesh.position.x, 0.6, o.mesh.position.z));
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
  if (!won) return;
  if (o.kind === 'stream') { TREK.ducked++; score += 300; cheer('¡Arroyo cruzado!', '#3cf0c6', 1.4); boardDirty = true; return; }
  if (o.kind === 'chasm') { if (!o.fell) TREK.ducked++; score += o.fell ? 100 : 400; cheer(o.fell ? 'Desfiladero cruzado' : '¡Desfiladero cruzado sin caer!', '#3cf0c6', 1.6); boardDirty = true; return; }
  if (o.kind === 'chest') { // dentro, una llave (con tres, el tesoro del tramo) y una gema para tu colección
    while (o.box.children.length) o.box.remove(o.box.children[0]); trekPart(o.box, 'Chest_Gold', 0.9); o.links.forEach(l => l.visible = false);
    TREK.keys++; TREK.got++; score += 400; const gems = (store(TREK_GEMS) || 0) + 1; store(TREK_GEMS, gems); SND.victory(); cheer(`¡Cofre abierto! Llave ${TREK.keys}/3 · gema ${gems}`, '#ffd166', 2.2);
    if (TREK.keys >= 3) { TREK.keys = 0; score += 1500; trophy('¡TESORO DEL TRAMO!', 'Tres llaves: +1500 puntos'); }
  } else { TREK.ducked++; score += 300; SND.explosion(arena.localToWorld(_tkh.set(0, 0.5, o.mesh.position.z)), false); cheer('¡Roca apartada!', '#3cf0c6', 1.4); }
  boardDirty = true;
}
const TREK_GEMS = 'reparena3-gems';

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
const trekWolfV = () => Math.min(1.3, 0.72 + 0.07 * waveIdx + 0.03 * rankIdx()); // (en m/s: hay que ir más deprisa que ellos)
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
  const on = trekOn() && NAT.ready && !arMode && ['ready', 'play', 'rest', 'paused', 'end', 'calib', 'lobby'].includes(state);
  TREK.group.visible = on; if (typeof natPlants !== 'undefined') natPlants.visible = !trekOn();
  if (!trekOn()) return; aldLoad(); // (la aldea, desde que eliges la Travesía)
  TREK.push = (TREK.push || 0) - dt; TREK.minY = Math.min(TREK.minY === undefined ? 9 : TREK.minY, HL.y); // (lo más bajo de la cabeza desde la repetición anterior)
  if (state === 'play' && TREK.push > 0) TREK.v += Math.sign(TREK.want - TREK.v) * Math.min(Math.abs(TREK.want - TREK.v), dt * 0.7); // (acelera y frena suave: sin tirones)
  else if (state !== 'paused') TREK.v = Math.max(0, TREK.v - dt * (state === 'play' ? 0.45 : 0.9)); // (sin repeticiones, se para; fuera del tramo, antes)
  if (TREK.halt) { TREK.v = 0; TREK.push = 0; } // (parado ante el cofre o la roca)
  let step = state === 'paused' ? 0 : TREK.v * dt;
  if (TREK.glide > 0 && state !== 'paused') { const g = Math.min(TREK.glide, dt * 1.8); TREK.glide -= g; step += g; } // (el paso a la piedra o el pilar siguiente)
  TREK.dist += step;
  natGround.material.map.offset.y += step / 3.5; TREK_PATH_TEX.offset.y += step / 4; // (el suelo corre bajo tus pies)
  trekLayout(); trekLight(dt);
  // los retos: salen a 40 m y se juzgan al pasar por ti
  if (state === 'play' && TREK.next && TREK.next - TREK.dist < 40) trekSpawn();
  for (const o of TREK.obs) {
    const z = (o.fixed ? 0 : HL.z) - (o.at - TREK.dist); o.mesh.position.z = z;
    if (o.pillars) for (const p of o.pillars) { const u = p.userData; if (u.sink) { u.sink += dt * 4; p.position.y -= u.sink * dt; p.rotation.z += dt * 0.25; if (p.position.y < -14) p.visible = false; } } // (los que se hunden, al fondo)
    if (o.glow) o.glow.material.opacity = o.open ? Math.max(0, o.glow.material.opacity - dt) : 0.4 + 0.25 * Math.sin(t * 5);
    if (o.lid && o.open) o.lid.rotation.x = Math.max(-1.9, o.lid.rotation.x - dt * 6);
    if (o.judged || state !== 'play') continue;
    if (o.kind === 'log') { // saltarlo: mientras pasa bajo ti cuenta lo más alto que llegaste
      if (z - HL.z > -4 && z - HL.z < -3.9 + step) say('¡Salta!', '#ffd166', 1.2);
      if (Math.abs(z - HL.z) < 0.45) o.maxUp = Math.max(o.maxUp, head.p.y - calibRef);
      if (z >= HL.z + 0.45) { o.judged = true; if (o.maxUp < settings.jumpHeight / 100) { TREK.v *= 0.2; combo = 0; TREK.hits++; SND.metalHit(arena.localToWorld(_tkh.set(0, 0.2, z)), false); hapticBoth(0.8, 120); say('¡Salta el tronco!', '#ff8a3d', 1.6); } else { TREK.ducked++; score += 150; SND.whoosh(arena.localToWorld(_tkh.set(0, 0.2, z)), 'arc'); cheer('¡Saltado!', '#3cf0c6', 0.9); } boardDirty = true; }
    } else if (o.kind === 'branch') {
      if (z - HL.z > -4 && z - HL.z < -3.9 + step) say('¡Agáchate!', '#ffd166', 1.2);
      if (z >= HL.z - 0.1) { o.judged = true; if (HL.y + HEAD_TOP > o.y) { TREK.v = 0; combo = 0; TREK.hits++; SND.metalHit(arena.localToWorld(_tkh.set(0, o.y, z)), false); hapticBoth(0.8, 120); say('¡Agáchate bajo las ramas!', '#ff8a3d', 1.6); } else { TREK.ducked++; score += 120; SND.whoosh(arena.localToWorld(_tkh.set(0, o.y, z)), 'arc'); cheer('¡Esquivada!', '#3cf0c6', 0.9); } boardDirty = true; }
    } else if (!o.done && o.at - TREK.dist <= (o.stop || 1.7) && TREK.halt !== o) { // (el cofre, la roca, el arroyo o el desfiladero, delante: te paras)
      TREK.halt = o; o.got = 0; o.haltT = 0; TREK.v = 0; TREK.dist = o.at - (o.stop || 1.7); TMV.st = 'up'; TMV.x0 = HL.x; TMV.z0 = HL.z; trekHaltSay(o, true);
      if (o.len && TREK.chase) trekChaseEnd(o.kind === 'stream' ? 'Los lobos no cruzan el agua' : 'Los lobos se quedan al borde', '#3cf0c6'); // (no te siguen)
    }
  }
  trekHaltStep(dt, t); trekChaseStep(dt, t);
  for (const o of TREK.obs) { if (!o.done || !o.box) continue; o.out = Math.min(1, (o.out || 0) + dt * 1.2); o.mesh.position.x = o.side * 2.4 * smooth(o.out); if (o.kind === 'rock') o.box.rotation.z = -o.side * o.out * 2; } // (abierto o apartado, se hace a un lado)
  TREK.obs = TREK.obs.filter(o => { const keep = o.mesh.position.z - (o.len || 0) < HL.z + 6; if (!keep) trekDrop(o); return keep; });
  // el hueco del desfiladero que se ve (si hay uno), en las coordenadas de la arena
  const ch = TREK.obs.find(o => o.kind === 'chasm'); if (ch) { const z = ch.mesh.position.z; TREK_HOLE.value.set(-17, 17, z - ch.len, z); TREK_HOLE_M.value.copy(arena.matrixWorld).invert(); } else TREK_HOLE.value.set(1, -1, 0, 0);
}
function trekDrop(o) { TREK.group.remove(o.mesh); o.mesh.traverse(m => { if (m.isSprite) m.material.dispose(); if (m.userData && m.userData.own) m.geometry.dispose(); }); }
// La luz y la niebla del paisaje de ahora, poco a poco (la niebla, en su color de base: la tormenta de los Arcos la tiñe encima)
const _tkc = new THREE.Color();
function trekLight(dt) {
  if (!natureOn()) return;
  const B = TREK_BIOMES[TREK.biome], k = Math.min(1, dt * 0.6), f = scene.fog;
  if (f) { if (!f.base) f.base = f.color.clone(); f.base.lerp(_tkc.setHex(B.fog), k); f.density += (B.dens - f.density) * k; renderer.setClearColor(f.base, 1); }
  hemi.color.lerp(_tkc.setHex(B.hemi), k); hemi.intensity += (B.hemiI - hemi.intensity) * k;
  keyLight.color.lerp(_tkc.setHex(B.key), k); keyLight.intensity += (B.keyI - keyLight.intensity) * k;
  TREK_DUSK.value += (B.dusk - TREK_DUSK.value) * k;
}
// Al empezar una ronda: desde el principio del sendero, en el bosque
function trekReset() {
  trekWolfLoad(); aldLoad(); if (typeof islandLoad === 'function') islandLoad(); // (el lobo y el cofre de la isla, que se cargan antes de hacer falta)
  TREK.obs.forEach(trekDrop); trekChaseEnd(); TREK_HOLE.value.set(1, -1, 0, 0); Object.assign(TREK, { glide: 0, halt: null, keys: 0, nextChase: 30, v: 0, want: 0, push: 0, lastRep: 0, minY: 9, kc: 1, ki: 1, dist: 0, biome: 0, obs: [], next: 0, got: 0, ducked: 0, hits: 0 });
  TREK.slots = []; TREK_DUSK.value = 0;
  natGround.material.map.offset.y = 0; TREK_PATH_TEX.offset.y = 0;
}
settingHooks.push(k => {
  if (k === 'mode' || k === '*') { if (!trekOn()) { natGround.material.map.offset.y = 0; TREK_DUSK.value = 0; } }
  if ((k === 'mode' || k === 'look' || k === '*') && trekOn() && settings.look !== 'comic') setSetting('look', 'comic'); // (la Travesía, siempre en cómic)
});
