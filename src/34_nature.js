
/* =================== BOSQUE DE DÍA (entorno «Bosque», en VR) =================== */
// Un claro del bosque a pleno día, con los modelos del Stylized Nature MegaKit (Quaternius, CC0): árboles, pinos, algún
// árbol seco, arbustos, rocas, hierba, flores, helechos y setas. Rodea la arena sin tapar las compuertas ni el camino de
// los enemigos. Cada modelo se dibuja con instancias (una pieza por modelo y material), para que vaya fluido en las Quest.
// models/nature.glb (los modelos juntos, simplificados) y models/tex/nature (sus texturas, reducidas). Se carga la primera
// vez que hace falta; mientras tanto (o si no se puede cargar), sigue la fortaleza
const NAT = { group: new THREE.Group(), ready: false, loading: false, failed: false, parts: {}, pick: Math.random() < 0.5 ? 'arena' : 'nature', built: '', birdT: 3 };
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
function natureLoad() {
  if (NAT.ready || NAT.loading || NAT.failed) return;
  if (!THREE.GLTFLoader || typeof document === 'undefined') { NAT.failed = true; return; }
  NAT.loading = true; const T = new THREE.TextureLoader(), mats = {};
  for (const [n, [f, alpha, both]] of Object.entries(NAT_TEX)) {
    const t = T.load('models/tex/nature/' + f); t.encoding = THREE.sRGBEncoding; t.flipY = false;
    mats[n] = new THREE.MeshStandardMaterial({ map: t, roughness: 1, metalness: 0, alphaTest: alpha ? 0.5 : 0, side: alpha || both ? THREE.DoubleSide : THREE.FrontSide });
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
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
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
function natureBuild() {
  if (!NAT.ready) return;
  const D = arenaDepth(), key = D.toFixed(2); if (NAT.built === key) return; NAT.built = key;
  while (natPlants.children.length) natPlants.remove(natPlants.children[0]);
  const R = rng(23), put = {}, trees = [];
  const front = (x, z, extra) => Math.abs(Math.atan2(x, -z)) < 0.8 && Math.hypot(x, z) < D + extra; // el abanico de las compuertas
  const nearGate = (x, z, r) => gates.some(g => g.on && Math.hypot(g.x - x, g.z - z) < r);
  const add = (n, x, z, s, y = R() * TAU) => { if (NAT.parts[n]) (put[n] = put[n] || []).push(new THREE.Matrix4().compose(new V3(x, 0, z), new Q4().setFromAxisAngle(_up, y), new V3(s, s, s))); };
  const scatter = (count, rMin, rMax, ok, fn) => { for (let i = 0, tries = 0; i < count && tries < count * 30; tries++) { const a = R() * TAU, r = Math.sqrt(rMin * rMin + R() * (rMax * rMax - rMin * rMin)), x = Math.sin(a) * r, z = -Math.cos(a) * r; if (!ok(x, z, r)) continue; fn(x, z, r); i++; } };
  const big = (x, z, r) => r > 5.5 && !front(x, z, 5) && !nearGate(x, z, 4) && !trees.some(t => Math.hypot(t.x - x, t.z - z) < t.r);
  // árboles: los normales más cerca, los pinos más lejos, algún árbol seco
  scatter(24, 7, 34, big, (x, z, r) => { const k = R(), n = r > 20 && k < 0.7 ? pick3(R, ['Pine_2', 'Pine_4', 'Pine_5']) : k < 0.08 ? pick3(R, ['DeadTree_1', 'DeadTree_2']) : pick3(R, ['CommonTree_3', 'CommonTree_4', 'CommonTree_5']); add(n, x, z, 0.8 + R() * 0.55); trees.push({ x, z, r: 3.2 }); });
  // y un fondo de bosque detrás de las compuertas (más allá de donde salen los enemigos)
  scatter(9, D + 6, D + 20, (x, z, r) => !nearGate(x, z, 5) && Math.abs(Math.atan2(x, -z)) < 0.9 && !trees.some(t => Math.hypot(t.x - x, t.z - z) < t.r), (x, z) => { add(pick3(R, ['Pine_2', 'Pine_4', 'Pine_5', 'CommonTree_3', 'CommonTree_4']), x, z, 0.9 + R() * 0.5); trees.push({ x, z, r: 3.2 }); });
  scatter(16, 5.5, 14, big, (x, z) => { add(R() < 0.6 ? 'Bush_Common' : 'Bush_Common_Flowers', x, z, 0.45 + R() * 0.3); trees.push({ x, z, r: 1.6 }); });
  scatter(12, 5.5, 20, big, (x, z) => { add(`Rock_Medium_${1 + Math.floor(R() * 3)}`, x, z, 0.3 + R() * 0.45); trees.push({ x, z, r: 1.5 }); });
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
  const on = natureOn(); NAT.group.visible = on;
  if (!on) return;
  natureBuild(); env.visible = false;
  scene.fog = new THREE.FogExp2(0xc4dcea, 0.014); renderer.setClearColor(0xc4dcea, 1);
  hemi.color.setHex(0xd6ecff); hemi.groundColor.setHex(0x4d6e30); hemi.intensity = 0.95;
  keyLight.color.setHex(0xfff0d2); keyLight.intensity = 1.5; rimLight.color.setHex(0xa8d4ff); rimLight.intensity = 0.3; renderer.toneMappingExposure = 1.0;
  applyVolume(); ambientRefresh();
}
layoutHooks.push(() => { if (NAT.group.visible) natureBuild(); });
settingHooks.push(k => { if (k === 'scenery' || k === '*') applyEnvMode(); });
// Con «Alternar», cada partida en un sitio distinto
function sceneryNewRun() { if (settings.scenery !== 'mix') return; NAT.pick = NAT.pick === 'nature' ? 'arena' : 'nature'; applyEnvMode(); }
// Cada fotograma: el cielo se mueve y, de vez en cuando, canta un pájaro entre los árboles
function updateNature(dt, t) {
  if (!NAT.group.visible) return;
  natSkyMat.uniforms.time.value = t; arena.worldToLocal(natSky.position.copy(head.p)); natSky.position.y = 0; // el cielo, siempre centrado en ti
  NAT.birdT -= dt; if (NAT.birdT <= 0) { NAT.birdT = rand(2.5, 7); const a = rand(0, TAU), r = rand(8, 18); SND.bird(arena.localToWorld(new V3(Math.sin(a) * r, rand(3, 7), -Math.cos(a) * r))); }
}
