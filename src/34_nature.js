
/* =================== BOSQUE DE DÍA (entorno «Bosque», en VR) =================== */
// Un claro del bosque a pleno día, con los modelos del Stylized Nature MegaKit (Quaternius, CC0): árboles, pinos, algún
// árbol seco, arbustos, rocas, hierba, flores, helechos y setas. Rodea la arena sin tapar las compuertas ni el camino de
// los enemigos. Cada modelo se dibuja con instancias (una pieza por modelo y material), para que vaya fluido en las Quest.
// models/nature.glb (los modelos juntos, simplificados) y models/tex/nature (sus texturas, reducidas). Se carga la primera
// vez que hace falta; mientras tanto (o si no se puede cargar), sigue la fortaleza
const NAT = { group: new THREE.Group(), ready: false, loading: false, failed: false, parts: {}, solids: [], foot: {}, pick: pick(['arena', 'nature', 'island']), built: '', birdT: 3 };
NAT.group.visible = false; arena.add(NAT.group);
// material del modelo → [textura, con transparencia (hojas, flores), por las dos caras]
const NAT_TEX = { Bark_NormalTree: ['bark_tree.jpg'], Bark_DeadTree: ['bark_dead.jpg'], Leaves_NormalTree: ['leaves_tree.png', true], Leaves_Pine: ['leaves_pine.png', true], Leaves_TwistedTree: ['leaves_bush.png', true],
  Leaves: ['leaves.png', true], Flowers: ['flowers.png', true], Grass: ['grass.png', false, true], Mushrooms: ['mushrooms.jpg'], Rocks: ['rocks.jpg'] };
// El entorno que toca: el elegido o, con «Alternar», uno distinto en cada partida
const sceneryPick = () => settings.scenery === 'mix' ? NAT.pick : settings.scenery;
function natureOn() { return !arMode && !forestOn() && sceneryPick() === 'nature' && NAT.ready; }
// Atributos comprimidos (enteros normalizados) → números con decimales, para poder colocar cada pieza en su sitio
function natFloat(a) {
  if (!a || (!a.normalized && a.array instanceof Float32Array && !a.isInterleavedBufferAttribute)) return a;
  const n = a.count, k = a.itemSize, f = new Float32Array(n * k), get = ['getX', 'getY', 'getZ', 'getW'];
  const div = a.normalized ? ({ Int8Array: 127, Uint8Array: 255, Int16Array: 32767, Uint16Array: 65535 }[(a.array || a.data.array).constructor.name] || 1) : 1;
  for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) f[i * k + j] = Math.max(-1, a[get[j]](i) / div);
  return new THREE.BufferAttribute(f, k);
}
// Viento: árboles, arbustos, hierba y flores se mecen en la tarjeta gráfica, más arriba que abajo (el pie no se mueve),
// con rachas suaves, cada planta a su ritmo según dónde está, y las hojas tiemblan. [balanceo, exponente de la altura, temblor]
const NAT_WIND = { Bark_NormalTree: [0.012, 1.4, 0], Bark_DeadTree: [0.008, 1.4, 0], Leaves_NormalTree: [0.012, 1.4, 0.025], Leaves_Pine: [0.01, 1.4, 0.015],
  Leaves_TwistedTree: [0.05, 1.2, 0.02], Leaves: [0.06, 1.2, 0.02], Flowers: [0.2, 1.0, 0.01], Grass: [0.2, 1.0, 0] };
const natWindT = { value: 0 };
function natWind(mat, [amp, expo, flut]) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { windT: natWindT, windAmp: { value: amp }, windExp: { value: expo }, windFlut: { value: flut } });
    sh.vertexShader = 'uniform float windT, windAmp, windExp, windFlut;\n' + sh.vertexShader.replace('#include <project_vertex>', `
      vec4 mvPosition = vec4(transformed, 1.0);
      vec3 wBase = vec3(0.0);
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition; wBase = instanceMatrix[3].xyz;
      #endif
      float wH = max(mvPosition.y - wBase.y, 0.0), wPh = windT * 1.3 + dot(wBase.xz, vec2(0.31, 0.23));
      float wGust = 0.65 + 0.35 * sin(windT * 0.23) * sin(windT * 0.41 + 1.3);
      float wSw = (sin(wPh) * 0.7 + sin(wPh * 2.27 + 1.7) * 0.3) * wGust * windAmp * pow(wH, windExp);
      mvPosition.xz += vec2(0.8, 0.6) * (wSw + windAmp * pow(wH, windExp) * 0.6 * wGust);
      mvPosition.xyz += normalize(vec3(1.0, 0.6, 0.8)) * sin(windT * 9.0 + dot(mvPosition.xyz, vec3(3.1, 2.3, 2.9))) * windFlut * min(wH, 2.0) * wGust;
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;`);
  };
}
function natureLoad() {
  if (NAT.ready || NAT.loading || NAT.failed) return;
  if (!THREE.GLTFLoader || typeof document === 'undefined') { NAT.failed = true; return; }
  NAT.loading = true; const T = new THREE.TextureLoader(), mats = {};
  for (const [n, [f, alpha, both]] of Object.entries(NAT_TEX)) {
    const t = T.load('models/tex/nature/' + f); t.encoding = THREE.sRGBEncoding; t.flipY = false;
    mats[n] = new THREE.MeshStandardMaterial({ map: t, roughness: 1, metalness: 0, alphaTest: alpha ? 0.5 : 0, side: alpha || both ? THREE.DoubleSide : THREE.FrontSide });
    mats[n].name = n; if (NAT_WIND[n]) natWind(mats[n], NAT_WIND[n]);
  }
  new THREE.GLTFLoader().load('models/nature.glb', g => {
    g.scene.updateMatrixWorld(true);
    for (const node of g.scene.children) {
      const parts = [];
      node.traverse(o => {
        if (!o.isMesh) return; const geo = new THREE.BufferGeometry();
        for (const a of ['position', 'normal', 'uv']) if (o.geometry.attributes[a]) geo.setAttribute(a, natFloat(o.geometry.attributes[a]));
        if (o.geometry.index) geo.setIndex(o.geometry.index);
        geo.applyMatrix4(o.matrixWorld); // en metros y con +Y hacia arriba
        parts.push({ geo, mat: mats[o.material.name] || o.material });
      });
      NAT.parts[node.name] = parts;
    }
    NAT.ready = true; NAT.loading = false; NAT.built = ''; applyEnvMode();
  }, undefined, e => { NAT.failed = true; NAT.loading = false; console.log('No se pudo cargar el bosque:', e && e.message); });
}
// Cielo de día: azul arriba, claro en el horizonte, nubes blandas que pasan despacio y el resplandor del sol
const natSkyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { time: { value: 0 } },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform float time; varying vec3 vP;
    float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); } // (sin seno: en las Quest, sin(números grandes) pierde precisión y el ruido salía en bloques rectos)
    float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x), f.y); }
    float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<4;i++){ v+=a*vnoise(p); p*=2.03; a*=0.5; } return v; }
    void main(){
      vec3 d = normalize(vP); float h = d.y;
      vec3 c = mix(vec3(0.78,0.88,0.93), vec3(0.32,0.58,0.88), smoothstep(-0.02, 0.6, h));
      vec2 uv = d.xz / (max(h, 0.0) + 0.25) * 1.2 + vec2(time*0.006, time*0.002);
      float cl = smoothstep(0.45, 0.8, fbm(uv)) * smoothstep(0.0, 0.15, h);
      c = mix(c, vec3(1.0), cl * 0.75);
      vec3 sun = normalize(vec3(-0.5, 0.62, 0.6)); float s = max(dot(d, sun), 0.0);
      c += vec3(1.0,0.92,0.75) * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.18);
      gl_FragColor = vec4(c, 1.0);
    }`
});
const natSky = new THREE.Mesh(new THREE.SphereGeometry(140, 32, 16), natSkyMat); natSky.renderOrder = -10; NAT.group.add(natSky);
// Suelo de hierba: verdes que se mezclan a manchas, con algo de tierra
const natGround = (() => {
  const c = mkCanvas(256), x = c.getContext('2d'), R = rng(11);
  x.fillStyle = '#5f8f3a'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) { const r = 6 + R() * 26, X = R() * 256, Y = R() * 256, k = R(); x.fillStyle = k < 0.45 ? 'rgba(78,124,44,0.35)' : k < 0.85 ? 'rgba(120,160,64,0.3)' : 'rgba(120,96,58,0.22)'; for (const [dx, dy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) { x.beginPath(); x.arc(X + dx, Y + dy, r, 0, TAU); x.fill(); } }
  for (let i = 0; i < 4000; i++) { x.fillStyle = R() < 0.5 ? 'rgba(40,80,24,0.5)' : 'rgba(150,190,80,0.4)'; x.fillRect(R() * 256, R() * 256, 1, 2 + R() * 3); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 40); t.encoding = THREE.sRGBEncoding; t.anisotropy = MAX_ANISO;
  const m = new THREE.Mesh(new THREE.CircleGeometry(70, 64), new THREE.MeshStandardMaterial({ map: t, roughness: 1, metalness: 0 }));
  m.rotation.x = -Math.PI / 2; m.position.y = -0.005; m.receiveShadow = true; NAT.group.add(m); return m;
})();
const natPlants = new THREE.Group(); NAT.group.add(natPlants);
// (los modelos del pack vienen a una escala exagerada para lo pequeño: la hierba mide casi 2 m; aquí, a su tamaño)
// Coloca los modelos alrededor (en la arena: tú en el centro, mirando hacia −Z, las compuertas delante). Lo grande (árboles,
// arbustos, rocas) nunca delante entre las compuertas y tú, ni cerca de ti; la hierba y las flores, por todas partes menos
// donde pisas. Siempre igual para una misma distancia de las compuertas
const pick3 = (R, l) => l[Math.floor(R() * l.length)];
// Lo que ocupa un modelo a ras de suelo (hasta 0,8 m de alto; en los árboles, solo el tronco), en metros a escala 1
function natFoot(n) {
  if (NAT.foot[n] !== undefined) return NAT.foot[n];
  let m = 0; const tree = /Tree|Pine/.test(n);
  for (const p of NAT.parts[n] || []) {
    if (tree && !/Bark/.test(p.mat.name || '')) continue; const a = p.geo.attributes.position;
    for (let i = 0; i < a.count; i++) if (a.getY(i) < 0.8) m = Math.max(m, Math.hypot(a.getX(i), a.getZ(i)));
  }
  return (NAT.foot[n] = m * 0.85 || 0.4);
}
function natureBuild() {
  if (!NAT.ready) return;
  const D = arenaDepth(), key = D.toFixed(2); if (NAT.built === key) return; NAT.built = key;
  while (natPlants.children.length) natPlants.remove(natPlants.children[0]);
  const R = rng(23), put = {}, trees = [];
  const front = (x, z, extra) => Math.abs(Math.atan2(x, -z)) < 0.8 && Math.hypot(x, z) < D + extra; // el abanico de las compuertas
  const nearGate = (x, z, r) => gates.some(g => g.on && Math.hypot(g.x - x, g.z - z) < r);
  const add = (n, x, z, s, y = R() * TAU) => { if (NAT.parts[n]) (put[n] = put[n] || []).push(new THREE.Matrix4().compose(new V3(x, 0, z), new Q4().setFromAxisAngle(_up, y), new V3(s, s, s))); };
  // lo que no se puede atravesar (troncos, rocas y arbustos) cerca de donde andan los enemigos: un círculo con lo que
  // ocupa a ras de suelo
  NAT.solids = []; const solid = (n, x, z, s) => { if (Math.hypot(x, z) < D + 4 && NAT.parts[n]) NAT.solids.push({ x, z, r: natFoot(n) * s }); };
  const scatter = (count, rMin, rMax, ok, fn) => { for (let i = 0, tries = 0; i < count && tries < count * 30; tries++) { const a = R() * TAU, r = Math.sqrt(rMin * rMin + R() * (rMax * rMax - rMin * rMin)), x = Math.sin(a) * r, z = -Math.cos(a) * r; if (!ok(x, z, r)) continue; fn(x, z, r); i++; } };
  const big = (x, z, r) => r > 5.5 && !front(x, z, 5) && !nearGate(x, z, 4) && !trees.some(t => Math.hypot(t.x - x, t.z - z) < t.r);
  // árboles: los normales más cerca, los pinos más lejos, algún árbol seco
  scatter(24, 7, 34, big, (x, z, r) => { const k = R(), n = r > 20 && k < 0.7 ? pick3(R, ['Pine_2', 'Pine_4', 'Pine_5']) : k < 0.08 ? pick3(R, ['DeadTree_1', 'DeadTree_2']) : pick3(R, ['CommonTree_3', 'CommonTree_4', 'CommonTree_5']); const s = 0.8 + R() * 0.55; add(n, x, z, s); solid(n, x, z, s); trees.push({ x, z, r: 3.2 }); });
  // y un fondo de bosque detrás de las compuertas (más allá de donde salen los enemigos)
  scatter(9, D + 6, D + 20, (x, z, r) => !nearGate(x, z, 5) && Math.abs(Math.atan2(x, -z)) < 0.9 && !trees.some(t => Math.hypot(t.x - x, t.z - z) < t.r), (x, z) => { add(pick3(R, ['Pine_2', 'Pine_4', 'Pine_5', 'CommonTree_3', 'CommonTree_4']), x, z, 0.9 + R() * 0.5); trees.push({ x, z, r: 3.2 }); });
  scatter(16, 5.5, 14, big, (x, z) => { const n = R() < 0.6 ? 'Bush_Common' : 'Bush_Common_Flowers', s = 0.45 + R() * 0.3; add(n, x, z, s); solid(n, x, z, s); trees.push({ x, z, r: 1.6 }); });
  scatter(12, 5.5, 20, big, (x, z) => { const n = `Rock_Medium_${1 + Math.floor(R() * 3)}`, s = 0.3 + R() * 0.45; add(n, x, z, s); solid(n, x, z, s); trees.push({ x, z, r: 1.5 }); });
  // setas al pie de los árboles cercanos
  trees.slice(0, 18).forEach(t => { if (R() < 0.55) add('Mushroom_Common', t.x + (R() - 0.5) * 1.8, t.z + (R() - 0.5) * 1.8, 0.3 + R() * 0.25); });
  // hierba, flores, helechos y tréboles: por todas partes menos donde pisas y delante de las compuertas
  const small = (x, z, r) => r > 1.7 && !nearGate(x, z, 2.2);
  scatter(170, 1.7, 15, small, (x, z) => add(['Grass_Common_Short', 'Grass_Common_Short', 'Grass_Common_Tall', 'Grass_Wispy_Short', 'Grass_Wispy_Tall'][Math.floor(R() * 5)], x, z, 0.2 + R() * 0.15));
  scatter(45, 2.2, 14, small, (x, z) => add('Flower_3_Group', x, z, 0.22 + R() * 0.12));
  scatter(45, 3, 16, (x, z, r) => small(x, z, r) && !front(x, z, 1), (x, z) => add(['Fern_1', 'Plant_1_Big', 'Plant_7_Big', 'Clover_1'][Math.floor(R() * 4)], x, z, 0.3 + R() * 0.2));
  for (const n in put) for (const p of NAT.parts[n]) {
    const m = new THREE.InstancedMesh(p.geo, p.mat, put[n].length); put[n].forEach((M4, i) => m.setMatrixAt(i, M4));
    m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; natPlants.add(m);
  }
}
// Al entrar en el bosque o salir de él: qué se ve, la luz de día, la niebla clara y el sonido
function applyNature() {
  const want = !arMode && !forestOn() && sceneryPick() === 'nature';
  if (want && !NAT.ready) natureLoad();
  const on = natureOn(); NAT.group.visible = on; natGateStyle(on);
  if (!on) return;
  natureBuild(); env.visible = false;
  scene.fog = new THREE.FogExp2(0xc4dcea, 0.014); renderer.setClearColor(0xc4dcea, 1);
  hemi.color.setHex(0xd6ecff); hemi.groundColor.setHex(0x4d6e30); hemi.intensity = 0.95;
  keyLight.color.setHex(0xfff0d2); keyLight.intensity = 1.5; rimLight.color.setHex(0xa8d4ff); rimLight.intensity = 0.3; renderer.toneMappingExposure = 1.0;
  applyVolume(); ambientRefresh();
}
layoutHooks.push(() => { if (NAT.group.visible) natureBuild(); });

/* ---------- Compuertas de piedra y madera ---------- */
// Las compuertas metálicas desentonan en el bosque: aquí cada una es la entrada de una cueva al pie de un montículo de
// hierba, con pilares de sillares, dintel de dovelas, puertas de tablones con herrajes que se abren hacia dentro y un
// pasadizo negro. Se hacen la primera vez que
// hacen falta y se cambian por las de siempre al volver a la fortaleza
let natGateTpl = null;
function natGateBuild() {
  SURF.stone = surface(256, 256, 97, S => {
    fillAll(S, '#8d897f', 128, 0.95, 0);
    const { a, h, rnd } = S;
    mottle(S, 160, 46, 0.16, 0.08); speckle(S, 9000, 0.22, 0.12, 0.25, 1.4);
    for (let i = 0; i < 14; i++) { // grietas
      let x = rnd() * 256, y = rnd() * 256; a.strokeStyle = 'rgba(30,26,22,0.55)'; h.strokeStyle = '#000'; a.lineWidth = 1.2; h.lineWidth = 2.2; a.beginPath(); h.beginPath(); a.moveTo(x, y); h.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 30; y += (rnd() - 0.5) * 30; a.lineTo(x, y); h.lineTo(x, y); }
      a.stroke(); h.stroke();
    }
    for (let i = 0; i < 26; i++) { const x = rnd() * 256, y = rnd() * 256, r = 4 + rnd() * 14, c = rnd() < 0.6 ? 'rgba(130,150,60,0.5)' : 'rgba(200,190,120,0.4)'; wrapDraw(256, x, y, r, (X, Y) => blob(a, X, Y, r, c)); } // líquenes
  }, 2.6);
  SURF.planks = surface(256, 640, 101, S => {
    fillAll(S, '#7a5434', 128, 0.85, 0);
    const { a, h, r, rnd } = S, pw = 256 / 5;
    for (let i = 0; i < 5; i++) {
      const x0 = i * pw;
      a.fillStyle = rnd() < 0.5 ? `rgba(40,24,12,${0.08 + rnd() * 0.12})` : `rgba(255,220,170,${0.05 + rnd() * 0.08})`; a.fillRect(x0, 0, pw, 640);
      for (let k = 0; k < 24; k++) { const x = x0 + 4 + rnd() * (pw - 8); a.strokeStyle = `rgba(50,30,15,${0.15 + rnd() * 0.25})`; a.lineWidth = 0.6 + rnd() * 1.2; a.beginPath(); a.moveTo(x, 0); for (let y = 40; y <= 640; y += 40) a.lineTo(x + Math.sin(y * 0.02 + k) * 2.5, y); a.stroke(); } // vetas
      for (let k = 0; k < 2; k++) { const y = rnd() * 640, x = x0 + pw * (0.3 + rnd() * 0.4); a.fillStyle = 'rgba(45,26,12,0.7)'; a.beginPath(); a.ellipse(x, y, 3 + rnd() * 3, 6 + rnd() * 6, 0, 0, TAU); a.fill(); } // nudos
      a.fillStyle = 'rgba(20,12,6,0.9)'; a.fillRect(x0, 0, 3, 640); h.fillStyle = '#000'; h.fillRect(x0, 0, 4, 640); // juntas
    }
    for (const y of [110, 500]) { // herrajes con remaches
      a.fillStyle = '#2b2a2c'; a.fillRect(0, y, 256, 34); h.fillStyle = '#fff'; h.fillRect(0, y, 256, 34); r.fillStyle = 'rgb(0,140,220)'; r.fillRect(0, y, 256, 34);
      a.fillStyle = 'rgba(160,80,30,0.35)'; for (let k = 0; k < 40; k++) a.fillRect(rnd() * 256, y + rnd() * 34, 2, 2);
      for (let x = 16; x < 256; x += 48) { a.fillStyle = '#5a585c'; a.beginPath(); a.arc(x, y + 17, 5, 0, TAU); a.fill(); }
    }
    speckle(S, 3000, 0.12, 0.05, 0.15, 1.2);
  }, 2.2);
  M.stone = std({ map: SURF.stone.map, normalMap: SURF.stone.normal, roughnessMap: SURF.stone.orm, metalness: 0, roughness: 1, vertexColors: true });
  M.planks = std({ map: SURF.planks.map, normalMap: SURF.planks.normal, roughnessMap: SURF.planks.orm, metalnessMap: SURF.planks.orm, metalness: 1, roughness: 1 });
  const grass = natGround.material.map.clone(); grass.repeat.set(0.6, 0.6); grass.needsUpdate = true; // (las UV del montículo ya van en metros)
  const k = new Kit(), R = rng(31), STONES = [col(0.66, 0.64, 0.58), col(0.56, 0.55, 0.5), col(0.72, 0.7, 0.63), col(0.5, 0.48, 0.44)], st = () => STONES[R() * STONES.length | 0];
  const MOSS = col(0.3, 0.46, 0.16), DARK = col(0.2, 0.18, 0.16);
  // pilares de sillares, algo irregulares
  for (const s of [-1, 1]) {
    for (let y = 0; y < 3.05;) { const hh = Math.min(3.05 - y, 0.36 + R() * 0.16), w = 0.86 + R() * 0.06; k.add('stone', G.box(w, hh, 1.06 + R() * 0.08), st(), s * (1.25 + w / 2) + (R() - 0.5) * 0.03, y + hh / 2, 0, 0, (R() - 0.5) * 0.06, (R() - 0.5) * 0.02); y += hh; }
    k.add('stone', G.box(0.9, 3.3, 1.3), st(), s * 1.72, 1.65, -1.15); // el pasadizo: muros de piedra hasta el montículo
  }
  // dintel de dovelas en abanico (arco plano), con la clave más alta y clara; encima, la cornisa con musgo. Baja,
  // para que el marcador siga viéndose encima de la compuerta del centro
  for (let i = 0; i < 9; i++) { const x = (i - 4) * 0.48, key = i === 4; k.add('stone', G.box(0.47, key ? 0.74 : 0.62, key ? 1.12 : 1.04), key ? col(0.8, 0.78, 0.72) : st(), x, key ? 3.39 : 3.36, key ? 0.04 : 0, 0, 0, -Math.atan2(x, 2.8)); }
  for (const s of [-1, 1]) k.add('stone', G.box(0.5, 0.62, 1.0), st(), s * 1.92, 3.36, 0);
  for (let x = -2.2; x < 2.15;) { const w = Math.min(2.2 - x, 0.7 + R() * 0.5); k.add('stone', G.box(w, 0.3, 1.18), st(), x + w / 2, 3.82, 0.02, 0, 0, (R() - 0.5) * 0.02); x += w; }
  for (let i = 0; i < 9; i++) k.add('moss', G.sph(0.26 + R() * 0.22, 9, 6), MOSS, (R() - 0.5) * 4.1, 3.98, (R() - 0.5) * 0.8, 0, R() * 3, 0, 1, 0.3, 1);
  for (let i = 0; i < 4; i++) { const s = R() < 0.5 ? -1 : 1; k.add('moss', G.sph(0.18 + R() * 0.1, 9, 6), MOSS, s * (1.5 + R() * 0.5), 3.7, 0.5, 0.4, 0, 0, 1, 0.7, 0.35); } // musgo que cae de la cornisa
  // el pasadizo por dentro, negro (como el de las compuertas metálicas)
  k.add('void', G.box(2.5, 3.1, 0.12), DARK, 0, 1.55, -1.75);
  for (const s of [-1, 1]) k.add('void', G.box(0.12, 3.1, 1.8), DARK, s * 1.31, 1.55, -0.85);
  k.add('void', G.box(2.6, 0.12, 1.8), DARK, 0, 3.08, -0.85); k.add('void', G.box(2.6, 0.02, 1.8), DARK, 0, 0.012, -0.85);
  // montículo de hierba detrás: la cueva se mete en él
  k.add('mound', G.sph(1, 20, 10, TS, 0, TAU, 0, Math.PI / 2), col(1, 1, 1), 0, 0, -5.6, 0, 0, 0, 4.4, 5.4, 3.9);
  const mats = { stone: M.stone, moss: M.leaf, void: M_VOID, mound: std({ map: grass, roughness: 1, metalness: 0, vertexColors: true }) };
  const g = k.build(mats, { cast: true, receive: true }); gateDark(g, 2.5, 3.0); return g;
}
function natGateStyle(on) {
  if (on && !natGateTpl) natGateTpl = natGateBuild();
  if (!natGateTpl) return;
  for (const g of gates) {
    if (on && !g.natG) { g.natG = natGateTpl.clone(); g.g.add(g.natG); }
    g.nat = on; if (g.natG) g.natG.visible = on;
    g.frame.visible = g.ramp.visible = !on; g.side.children.forEach(m => m.visible = !on);
    g.doorL.material = g.doorR.material = on ? M.planks : M.door;
  }
  gateLight.color.setHex(on ? 0xff8a30 : 0xff3a10);
}
settingHooks.push(k => { if (k === 'scenery') envSwitch(); else if (k === '*') applyEnvMode(); }); // (en las gafas, a oscuras: 64_intro)
// Con «Alternar», cada partida en un sitio distinto
function sceneryNewRun() { if (settings.scenery !== 'mix') return; NAT.pick = { arena: 'nature', nature: 'island' }[NAT.pick] || 'arena'; applyEnvMode(); } // fortaleza → bosque → isla
// Cada fotograma: el cielo se mueve y, de vez en cuando, canta un pájaro entre los árboles
function updateNature(dt, t) {
  if (!NAT.group.visible) return;
  natSkyMat.uniforms.time.value = t; natWindT.value = t; arena.worldToLocal(natSky.position.copy(head.p)); natSky.position.y = 0; // el cielo, siempre centrado en ti
  NAT.birdT -= dt; if (NAT.birdT <= 0) { NAT.birdT = rand(2.5, 7); const a = rand(0, TAU), r = rand(8, 18); SND.bird(arena.localToWorld(new V3(Math.sin(a) * r, rand(3, 7), -Math.cos(a) * r))); }
}
