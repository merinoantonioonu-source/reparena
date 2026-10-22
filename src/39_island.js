/* =================== ISLA PIRATA (entorno «Isla pirata», en VR) =================== */
// Una playa de arena en una isla con los modelos del Pirate Kit (Quaternius, CC0): palmeras, rocas, acantilados detrás de
// las compuertas (que son cuevas, como en el bosque), casas de madera, un aserradero, huesos gigantes y calaveras, barriles,
// cofres y un cañón, y detrás de ti el mar con un muelle y dos barcos fondeados. Como el bosque, rodea la arena sin tapar las
// compuertas ni el camino de los enemigos, y cada modelo se dibuja con instancias. models/island.glb (los modelos juntos,
// los grandes simplificados, con su textura una vez). Se carga la primera vez que hace falta; mientras, sigue la fortaleza
const ISL = { group: new THREE.Group(), ready: false, loading: false, failed: false, parts: {}, solids: [], foot: {}, built: '', gullT: 4 };
ISL.group.visible = false; arena.add(ISL.group);
function islandOn() { return !arMode && !forestOn() && sceneryPick() === 'island' && ISL.ready; }
function islandLoad() {
  if (ISL.ready || ISL.loading || ISL.failed) return;
  if (!THREE.GLTFLoader || typeof document === 'undefined') { ISL.failed = true; return; }
  ISL.loading = true;
  new THREE.GLTFLoader().load('models/island.glb', g => {
    g.scene.updateMatrixWorld(true); const mats = {};
    for (const node of g.scene.children) {
      const parts = [];
      node.traverse(o => {
        if (!o.isMesh) return; const geo = new THREE.BufferGeometry();
        for (const a of ['position', 'normal', 'uv', 'color']) if (o.geometry.attributes[a]) geo.setAttribute(a, natFloat(o.geometry.attributes[a]));
        if (o.geometry.index) geo.setIndex(o.geometry.index);
        geo.applyMatrix4(o.matrixWorld);
        const src = o.material, key = src.name || src.uuid;
        if (!mats[key]) { // mate, como pintado (sin brillos de metal); las ventanas, algo más claras
          mats[key] = new THREE.MeshStandardMaterial({ map: src.map || null, color: src.color, roughness: 0.95, metalness: 0, vertexColors: !!o.geometry.attributes.color });
          if (mats[key].map) mats[key].map.encoding = THREE.sRGBEncoding; mats[key].name = key;
        }
        parts.push({ geo, mat: mats[key] });
      });
      ISL.parts[node.name] = parts;
    }
    ISL.ready = true; ISL.loading = false; ISL.built = ''; applyEnvMode();
  }, undefined, e => { ISL.failed = true; ISL.loading = false; console.log('No se pudo cargar la isla:', e && e.message); });
}
// El cielo es el del bosque de día; aquí, con su misma luz
const islSky = new THREE.Mesh(new THREE.SphereGeometry(140, 32, 16), natSkyMat); islSky.renderOrder = -10; ISL.group.add(islSky);
// Arena: tonos dorados a manchas, con conchas, piedrecitas y la marca más oscura de la arena mojada hacia la orilla
const islSand = (() => {
  const c = mkCanvas(256), x = c.getContext('2d'), R = rng(41);
  x.fillStyle = '#d8c08a'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 220; i++) { const r = 6 + R() * 24, X = R() * 256, Y = R() * 256, k = R(); x.fillStyle = k < 0.5 ? 'rgba(200,170,110,0.35)' : k < 0.85 ? 'rgba(240,220,170,0.3)' : 'rgba(170,140,90,0.25)'; for (const [dx, dy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) { x.beginPath(); x.arc(X + dx, Y + dy, r, 0, TAU); x.fill(); } }
  for (let i = 0; i < 5000; i++) { x.fillStyle = R() < 0.5 ? 'rgba(150,120,80,0.45)' : 'rgba(255,245,210,0.5)'; x.fillRect(R() * 256, R() * 256, 1, 1); }
  for (let i = 0; i < 40; i++) { x.fillStyle = R() < 0.5 ? 'rgba(250,240,230,0.8)' : 'rgba(120,110,100,0.6)'; x.beginPath(); x.ellipse(R() * 256, R() * 256, 1.5 + R() * 2, 1 + R() * 1.5, R() * 3, 0, TAU); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(26, 26); t.encoding = THREE.sRGBEncoding; t.anisotropy = MAX_ANISO;
  const m = new THREE.Mesh(new THREE.CircleGeometry(30, 72), new THREE.MeshStandardMaterial({ map: t, roughness: 1, metalness: 0 }));
  m.rotation.x = -Math.PI / 2; m.position.y = -0.005; m.receiveShadow = true; ISL.group.add(m); return m;
})();
// El mar: del turquesa de la orilla al azul profundo, con olas que se mueven, brillos del sol y espuma en la orilla. La isla
// es un óvalo: el mar queda sobre todo detrás de ti y a los lados (delante están los acantilados)
const ISL_SHORE = 24;
const islSeaMat = new THREE.ShaderMaterial({
  fog: false, uniforms: { time: { value: 0 }, shore: { value: ISL_SHORE } }, // (sin la niebla: se funde él mismo con el horizonte)
  vertexShader: `uniform float time; varying vec2 vXZ; varying float vR;
    void main(){ vec3 p = position; vXZ = (modelMatrix * vec4(p, 1.0)).xz; vR = length(p.xy);
      p.z += (sin(vXZ.x * 0.35 + time * 1.1) + sin(vXZ.y * 0.27 - time * 0.8)) * 0.06 * smoothstep(20.0, 40.0, vR);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: `uniform float time, shore; varying vec2 vXZ; varying float vR;
    void main(){
      float w = sin(vXZ.x * 1.3 + time * 1.7) * sin(vXZ.y * 1.1 - time * 1.3) + sin((vXZ.x + vXZ.y) * 2.7 + time * 2.3) * 0.4;
      vec3 c = mix(vec3(0.22, 0.78, 0.76), vec3(0.04, 0.27, 0.48), smoothstep(shore, shore + 22.0, vR));
      c += vec3(0.9, 0.95, 1.0) * smoothstep(1.1, 1.35, w) * 0.35; // brillos
      float foam = smoothstep(shore + 1.4, shore, vR) * (0.55 + 0.45 * sin(time * 1.2 + vR * 2.0)); // espuma que va y viene
      c = mix(c, vec3(0.95, 0.97, 0.95), clamp(foam, 0.0, 1.0) * 0.8);
      c = mix(c, vec3(0.75, 0.87, 0.92), smoothstep(45.0, 130.0, vR)); // a lo lejos, del color del horizonte
      gl_FragColor = vec4(c, 1.0);
    }`
});
const islSea = new THREE.Mesh(new THREE.RingGeometry(ISL_SHORE - 1.5, 140, 96, 8), islSeaMat); islSea.rotation.x = -Math.PI / 2; islSea.position.y = 0.01; ISL.group.add(islSea);
const islPlants = new THREE.Group(); ISL.group.add(islPlants);
// Lo que ocupa un modelo a ras de suelo (hasta 0,8 m), en metros a escala 1; en las palmeras, solo el tronco
function islFoot(n) {
  if (ISL.foot[n] !== undefined) return ISL.foot[n];
  let m = 0; const palm = /Palm/.test(n);
  for (const p of ISL.parts[n] || []) { const a = p.geo.attributes.position; for (let i = 0; i < a.count; i++) if (a.getY(i) < (palm ? 0.5 : 0.8)) m = Math.max(m, Math.hypot(a.getX(i), a.getZ(i))); }
  return (ISL.foot[n] = (palm ? Math.min(m, 0.45) : m * 0.85) || 0.4);
}
// Hasta dónde llega un modelo en horizontal (lo que ocupa entero, desde su centro), en metros a escala 1
function islRad(n) {
  const k = 'r:' + n; if (ISL.foot[k] !== undefined) return ISL.foot[k];
  let m = 0; for (const p of ISL.parts[n] || []) { const a = p.geo.attributes.position; for (let i = 0; i < a.count; i++) m = Math.max(m, Math.hypot(a.getX(i), a.getZ(i))); }
  return (ISL.foot[k] = m || 1);
}
// Coloca los modelos (en la arena: tú en el centro, mirando hacia −Z, las compuertas delante). Delante, detrás de las
// compuertas, los acantilados; a los lados, las palmeras, las rocas, las casas y lo demás; detrás de ti, la orilla, el
// muelle y los barcos. Siempre igual para una misma distancia de las compuertas
function islandBuild() {
  if (!ISL.ready) return;
  const D = arenaDepth(), key = D.toFixed(2); if (ISL.built === key) return; ISL.built = key;
  while (islPlants.children.length) islPlants.remove(islPlants.children[0]);
  const R = rng(57), put = {}, taken = [];
  const front = (x, z, extra) => Math.abs(Math.atan2(x, -z)) < 0.8 && Math.hypot(x, z) < D + extra;
  const nearGate = (x, z, r) => gates.some(g => g.on && Math.hypot(g.x - x, g.z - z) < r);
  const free = (x, z, r) => !taken.some(t => Math.hypot(t.x - x, t.z - z) < t.r + r);
  const add = (n, x, z, s, y = R() * TAU, r = 0, h = 0) => { if (!ISL.parts[n]) return; (put[n] = put[n] || []).push(new THREE.Matrix4().compose(new V3(x, h, z), new Q4().setFromAxisAngle(_up, y), new V3(s, s, s))); if (r) taken.push({ x, z, r }); };
  ISL.solids = []; const solid = (n, x, z, s) => { if (Math.hypot(x, z) < D + 4 && ISL.parts[n]) ISL.solids.push({ x, z, r: islFoot(n) * s }); };
  const scatter = (count, rMin, rMax, ok, fn) => { for (let i = 0, tries = 0; i < count && tries < count * 40; tries++) { const a = R() * TAU, r = Math.sqrt(rMin * rMin + R() * (rMax * rMax - rMin * rMin)), x = Math.sin(a) * r, z = -Math.cos(a) * r; if (!ok(x, z, r)) continue; fn(x, z, r); i++; } };
  const land = (x, z, r) => r < ISL_SHORE - 1.5; // en la arena, no en el agua
  // a un lado (fuera del abanico de las compuertas y lejos de ti), con todo lo que ocupa (pad) dentro de la arena y sin pisar nada
  const side = (x, z, r, pad) => r + pad < ISL_SHORE - 0.5 && r - pad > 5 && !front(x, z, 5 + pad) && !nearGate(x, z, 4 + pad) && free(x, z, pad);
  const face = (x, z) => Math.atan2(-x, -z); // de cara a ti
  // acantilados: una pared de roca detrás de las compuertas, de lado a lado, y algún peñasco más a los lados
  // (cada uno, por detrás de las compuertas con todo lo que ocupa: su borde de delante, a unos 4 m detrás de ellas)
  for (let i = 0; i < 7; i++) { const n = pick3(R, ['Cliff2', 'Cliff3', 'Cliff4']), sc = 1.6 + R() * 0.5, a = -0.95 + i * 0.32 + (R() - 0.5) * 0.1, r = D + 4 + islRad(n) * sc; add(n, Math.sin(a) * r, -Math.cos(a) * r, sc, R() * TAU); }
  for (const s of [-1, 1]) { const sc = 2, r = D + 3 + islRad('Cliff1') * sc, a = s * 1.35; add('Cliff1', Math.sin(a) * r, -Math.cos(a) * r, sc, R() * TAU, islRad('Cliff1') * sc); }
  // las casas, el aserradero y un huerto de barriles, a los lados y algo por detrás de las compuertas, de cara a la playa
  const houses = [['House1', -14, 2], ['House3', 14, -2], ['House2', -12, 9], ['Sawmill', 11, 6]];
  for (const [n, x, z] of houses) { const pad = islRad(n); if (side(x, z, Math.hypot(x, z), pad)) add(n, x, z, 1, face(x, z) + (R() - 0.5) * 0.3, pad); }
  // huesos gigantes y calaveras: a un lado, medio enterrados
  if (side(-7, 14, 15.7, islRad('LargeBones'))) add('LargeBones', -7, 14, 1, R() * TAU, islRad('LargeBones'));
  if (side(9, 13, 15.8, islRad('Skulls') * 0.8)) add('Skulls', 9, 13, 0.8, face(9, 13), islRad('Skulls') * 0.8);
  // palmeras: muchas, por los lados y detrás de ti, hasta la orilla
  scatter(26, 6, ISL_SHORE - 2, (x, z, r) => side(x, z, r, 1.8), (x, z) => { const n = pick3(R, ['PalmTree_1', 'PalmTree_2', 'PalmTree_3']), s = 1.6 + R() * 0.6; add(n, x, z, s, R() * TAU, 1.6); solid(n, x, z, s); });
  // rocas, barriles, cofres, un cañón mirando al mar, un ancla, cubos, botellas, calaveras y balas de cañón
  scatter(14, 6, ISL_SHORE - 2, (x, z, r) => side(x, z, r, 1), (x, z) => { const n = `Rock_${1 + Math.floor(R() * 5)}`, s = 0.8 + R() * 1.6; add(n, x, z, s, R() * TAU, 1); solid(n, x, z, s); });
  scatter(10, 6, 16, (x, z, r) => side(x, z, r, 0.8), (x, z) => { const n = pick3(R, ['Barrel', 'Barrel', 'Bucket', 'Chest_Closed', 'Chest_Gold']); add(n, x, z, 0.9, R() * TAU, 0.8); solid(n, x, z, 0.9); });
  scatter(12, 5.5, 16, (x, z, r) => side(x, z, r, 0.4), (x, z) => add(pick3(R, ['Skull', 'Bottle_1', 'CannonBall', 'CannonBall', 'Bomb']), x, z, 0.7 + R() * 0.3, R() * TAU, 0.4));
  for (const s of [-1, 1]) { const x = s * 7.5, z = 7; if (side(x, z, Math.hypot(x, z), 1.5)) { add('Cannon', x, z, 1, Math.atan2(x * 0.3, 1), 1.5); solid('Cannon', x, z, 1); } }
  if (side(4, 12, 12.6, 1.5)) add('Anchor', 4, 12, 1.2, R() * TAU, 1.2);
  // el muelle: desde la orilla, detrás de ti, mar adentro, con sus postes; al final, el barco pequeño; mar adentro, el grande
  // (las tablas del muelle, a 1 m sobre la base de sus postes: se hunden para quedar a ras de la arena y sobre el agua)
  const dx = 3.5; for (let i = 0; i < 7; i++) { const z = ISL_SHORE - 3 + i * 2.6; add(i === 4 ? 'Dock_Broken' : 'Dock', dx, z, 1, 0, 0, -0.75); }
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) add('Dock_Pole', dx + s * 1.2, ISL_SHORE - 2 + i * 4.3, 1, 0, 0, -0.75);
  add('ShipSmall', dx + 5, ISL_SHORE + 13, 1.1, Math.PI * 0.55);
  add('ShipLarge', -18, ISL_SHORE + 26, 1.3, Math.PI * 0.35);
  add('ShipLarge', 34, 30, 1.0, -Math.PI * 0.2);
  for (const n in put) for (const p of ISL.parts[n]) {
    const m = new THREE.InstancedMesh(p.geo, p.mat, put[n].length); put[n].forEach((M4, i) => m.setMatrixAt(i, M4));
    m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; m.castShadow = !/Ship|Cliff/.test(n); m.receiveShadow = true; islPlants.add(m);
  }
}
// Al entrar en la isla o salir de ella: qué se ve, la luz del trópico (sol cálido, rebote de la arena), la neblina del mar
// y el sonido. Las compuertas, como en el bosque, son cuevas de piedra
function applyIsland() {
  const want = !arMode && !forestOn() && sceneryPick() === 'island';
  if (want && !ISL.ready) islandLoad();
  const on = islandOn(); ISL.group.visible = on;
  if (!on) return;
  natGateStyle(true); islandBuild(); env.visible = false;
  scene.fog = new THREE.FogExp2(0xbfe2ee, 0.009); renderer.setClearColor(0xbfe2ee, 1);
  hemi.color.setHex(0xe2f4ff); hemi.groundColor.setHex(0xc4a873); hemi.intensity = 1.0;
  keyLight.color.setHex(0xfff0d0); keyLight.intensity = 1.6; rimLight.color.setHex(0xa8dcff); rimLight.intensity = 0.3; renderer.toneMappingExposure = 1.0;
  applyVolume(); ambientRefresh();
}
layoutHooks.push(() => { if (ISL.group.visible) islandBuild(); });
// Cada fotograma: el cielo y el mar se mueven y, de vez en cuando, una gaviota grita sobre el mar
function updateIsland(dt, t) {
  if (!ISL.group.visible) return;
  natSkyMat.uniforms.time.value = t; islSeaMat.uniforms.time.value = t;
  arena.worldToLocal(islSky.position.copy(head.p)); islSky.position.y = 0;
  ISL.gullT -= dt; if (ISL.gullT <= 0) { ISL.gullT = rand(3, 9); const a = rand(Math.PI * 0.5, Math.PI * 1.5), r = rand(12, 30); SND.gull(arena.localToWorld(new V3(Math.sin(a) * r, rand(5, 12), -Math.cos(a) * r))); }
}
