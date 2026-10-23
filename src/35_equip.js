
/* =================== APARATOS: BARRA DE DOMINADAS Y PARALELAS =================== */
// Las poses van en el espacio de referencia de la sesión (local-floor) o en el mundo de la prueba en el ordenador.
// La barra de puerta va a lo largo de su eje X local; las paralelas, a lo largo de su eje Z local.
// Son muebles fijos: tienen que quedarse en su sitio de la habitación aunque el origen de la sesión cambie (otra
// sesión, recentrar, calibrar en otro sitio). Para eso se guardan de tres maneras, de más a menos precisa:
// 1) anclas persistentes de WebXR (las Quest las recuerdan); 2) la pose respecto al suelo del guardián
// (bounded-floor), que no se mueve entre sesiones; 3) la pose en local-floor, que se corrige al recentrar.
const EQUIP_KEY = 'reparena3-equip';
const mkPose = (z) => ({ x: 0, z, yaw: 0, set: false, handle: null, anchor: null, b: null, synced: false });
// bref: espacio bounded-floor; b2l: dónde está su origen en local-floor (x, z, yaw), al día en cada fotograma
// spot: el sitio de juego de la habitación colocada a mano (realidad mixta); lo demás se guarda respecto a él
const EQ_KINDS = ['door', 'dip', 'spot'];
const EQ = { xr: { door: mkPose(-0.2), dip: mkPose(-0.45), spot: mkPose(0) }, pv: { door: mkPose(-0.2), dip: mkPose(-0.45), spot: mkPose(0) }, edit: null, pending: [], bref: null, b2l: null, ref: null };
(function loadEquip() {
  const s = store(EQUIP_KEY) || {};
  for (const k of EQ_KINDS) {
    const e = s[k]; if (!e || ![e.x, e.z, e.yaw].every(isFinite)) continue;
    Object.assign(EQ.xr[k], { x: e.x, z: e.z, yaw: e.yaw, set: !!e.set, handle: typeof e.handle === 'string' ? e.handle : null, b: e.b && [e.b.x, e.b.z, e.b.yaw].every(isFinite) ? { x: e.b.x, z: e.b.z, yaw: e.b.yaw } : null });
  }
})();
function saveEquip() { const o = {}; for (const k of EQ_KINDS) { const e = EQ.xr[k]; o[k] = { x: e.x, z: e.z, yaw: e.yaw, set: e.set, handle: e.handle, b: e.b }; } store(EQUIP_KEY, o); }
// Pose respecto al suelo del guardián ↔ pose en local-floor
function eqToBounded(e) { const T = EQ.b2l; if (!T) return; const dx = e.x - T.x, dz = e.z - T.z, c = Math.cos(T.yaw), s = Math.sin(T.yaw); e.b = { x: dx * c - dz * s, z: dx * s + dz * c, yaw: e.yaw - T.yaw }; }
function eqFromBounded(e) { const T = EQ.b2l, b = e.b, c = Math.cos(T.yaw), s = Math.sin(T.yaw); eqTrack(e, T.x + b.x * c + b.z * s, T.z - b.x * s + b.z * c, b.yaw + T.yaw); }
// La pose que da el seguimiento (el ancla o el guardián) tiembla unos milímetros de un fotograma a otro, sobre todo al mover
// la cabeza: aplicada tal cual, la barra y todo lo que cuelga de ella (el bosque entero, con sus sombras) se mueven y
// destellan. El temblor se ignora; una deriva lenta se sigue poco a poco, y un salto de verdad (se recolocó), de golpe
function eqTrack(e, x, z, yaw) {
  const dd = Math.hypot(x - e.x, z - e.z), da = Math.abs(wrapAng(yaw - e.yaw));
  if (!e.fix || dd > 0.03 || da > 0.025) { e.x = x; e.z = z; e.yaw = yaw; e.fix = true; }
  else if (dd > 0.004 || da > 0.004) { e.x += (x - e.x) * 0.05; e.z += (z - e.z) * 0.05; e.yaw += wrapAng(yaw - e.yaw) * 0.05; }
}
const eqKind = () => settings.exercise === 'row' ? 'dip' : 'door';
const eqPose = (k = eqKind()) => (preview ? EQ.pv : EQ.xr)[k];
const dipOne = () => settings.dipBars === '1'; // una sola paralela: te tumbas cruzado debajo de ella
// Nombre del aparato para los textos
function eqName(k = eqKind()) { return k === 'door' ? { the: 'la barra', name: 'barra', pl: false } : dipOne() ? { the: 'la paralela', name: 'paralela', pl: false } : { the: 'las paralelas', name: 'paralelas', pl: true }; }
// Ejes horizontales del aparato: a lo largo de la barra (X local) y perpendicular (Z local)
function eqAxes(e, ax, az) { const c = Math.cos(e.yaw), s = Math.sin(e.yaw); if (ax) ax.set(c, 0, -s); if (az) az.set(s, 0, c); }
// Coordenadas locales (horizontales) de un punto del mundo respecto al aparato
const _eqa = new V3(), _eqb = new V3();
function eqLocal(e, p, out) { eqAxes(e, _eqa, _eqb); const dx = p.x - e.x, dz = p.z - e.z; return out.set(dx * _eqa.x + dz * _eqa.z, p.y, dx * _eqb.x + dz * _eqb.z); }
function eqWorld(e, lx, y, lz, out) { eqAxes(e, _eqa, _eqb); return out.set(e.x + _eqa.x * lx + _eqb.x * lz, y, e.z + _eqa.z * lx + _eqb.z * lz); }
function eqTopY(k = eqKind()) { return k === 'dip' ? settings.dipH / 100 : settings.doorH / 100; }

/* ---------- Modelos: completos en VR, contorno luminoso en realidad mixta ---------- */
const eqGroup = new THREE.Group(); eqGroup.visible = false; scene.add(eqGroup);
const EQV = { door: { grp: new THREE.Group() }, dip: { grp: new THREE.Group() } };
eqGroup.add(EQV.door.grp, EQV.dip.grp);
const eqLineMat = new THREE.MeshBasicMaterial({ color: 0x3cf0c6, toneMapped: false });
const eqBeamMat = new THREE.MeshBasicMaterial({ map: TX.beam, color: 0x3cf0c6, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
// Barra luminosa entre dos puntos locales (contorno para realidad mixta)
function glowBar(grp, a, b) {
  const d = b.clone().sub(a), len = d.length(), mid = a.clone().add(b).multiplyScalar(0.5), q = new Q4().setFromUnitVectors(_up, d.clone().normalize());
  const core = new THREE.Mesh(G.cylRaw(0.006, 0.006, len, 6), eqLineMat); core.position.copy(mid); core.quaternion.copy(q); grp.add(core);
  for (let i = 0; i < 2; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.07, len), eqBeamMat); p.position.copy(mid); p.quaternion.copy(q); p.rotateY(i * Math.PI / 2); grp.add(p); }
}
function clearGroup(g) { while (g.children.length) { const c = g.children.pop(); c.traverse(n => { if (n.geometry) n.geometry.dispose(); }); } }
function buildEquipVis() {
  for (const k of ['door', 'dip']) { const v = EQV[k]; clearGroup(v.grp); v.vr = new THREE.Group(); v.mr = new THREE.Group(); v.grp.add(v.vr, v.mr); }
  // Barra de puerta: marco, muro a los lados y la barra cromada
  const H = settings.doorH / 100, W = settings.doorW / 100, top = H + 0.12, wallH = Math.max(2.6, top + 0.35), jx = W / 2 + 0.06;
  let k = new Kit();
  k.add('steel', G.cyl(0.016, 0.016, W, 14), C.chrome, 0, H, 0, 0, 0, Math.PI / 2);
  for (const s of [-1, 1]) {
    k.add('steel', G.box(0.06, 0.1, 0.1), C.gun, s * (W / 2 - 0.02), H, 0);
    k.add('paint', G.box(0.1, top, 0.16), C.bone, s * jx, top / 2, 0); // jambas del marco
    k.add('concrete', G.box(1.3, wallH, 0.14, 1.2), C.concrete, s * (jx + 0.05 + 0.65), wallH / 2, 0);
    k.add('steel', G.box(0.07, 0.05, 0.05), C.dark, s * (W / 2 - 0.02), H + 0.06, -0.05);
  }
  k.add('paint', G.box(W + 0.32, 0.1, 0.16), C.bone, 0, top + 0.05, 0);
  k.add('concrete', G.box(W + 0.32, wallH - top - 0.1, 0.14, 1.2), C.concrete, 0, (wallH + top + 0.1) / 2, 0);
  EQV.door.vr.add(k.build({ steel: M.steel, paint: M.paint, concrete: M.concrete }, { cast: true, receive: true }));
  glowBar(EQV.door.mr, new V3(-W / 2, H, 0), new V3(W / 2, H, 0));
  for (const s of [-1, 1]) glowBar(EQV.door.mr, new V3(s * W / 2, H - 0.12, 0), new V3(s * W / 2, H + 0.04, 0));
  // Paralelas: una o dos barras con postes y patas
  const dH = settings.dipH / 100, gap = settings.dipGap / 100, L = settings.dipLen / 100, xs = dipOne() ? [0] : [-gap / 2, gap / 2];
  k = new Kit();
  for (const x of xs) {
    k.add('steel', G.cyl(0.02, 0.02, L, 14), C.chrome, x, dH, 0, Math.PI / 2, 0, 0);
    k.add('rubber', G.cyl(0.025, 0.025, Math.min(0.32, L * 0.5), 14), C.white, x, dH, 0, Math.PI / 2, 0, 0);
    for (const e of [-1, 1]) {
      k.add('steel', G.box(0.045, dH - 0.02, 0.045), C.dark, x, (dH - 0.02) / 2, e * (L / 2 - 0.05));
      k.add('steel', G.box(0.07, 0.03, 0.07), C.gun, x, dH - 0.01, e * (L / 2 - 0.05));
    }
    k.add('steel', G.box(0.08, 0.04, L + 0.3), C.gun, x, 0.02, 0);
    k.add('paint', G.box(0.085, 0.045, 0.12), C.hazard, x, 0.022, (L + 0.3) / 2 - 0.06);
  }
  EQV.dip.vr.add(k.build({ steel: M.steel, rubber: M.rubber, paint: M.paint }, { cast: true, receive: true }));
  for (const x of xs) { glowBar(EQV.dip.mr, new V3(x, dH, -L / 2), new V3(x, dH, L / 2)); for (const e of [-1, 1]) glowBar(EQV.dip.mr, new V3(x, dH - 0.12, e * L / 2), new V3(x, dH, e * L / 2)); }
  layoutPool();
}
settingHooks.push(k => { if (['doorH', 'doorW', 'dipH', 'dipGap', 'dipLen', 'dipBars', '*'].includes(k)) buildEquipVis(); });
function updateEquip(dt, t) {
  const show = isBars() && state !== 'idle';
  eqGroup.visible = show; if (!show) return;
  for (const k of ['door', 'dip']) {
    const v = EQV[k], e = eqPose(k), on = k === eqKind();
    v.grp.visible = on; if (!on) continue;
    v.grp.position.set(e.x, 0, e.z); v.grp.rotation.set(0, e.yaw, 0);
    v.vr.visible = !arMode && !(k === 'door' && forestOn()); v.mr.visible = (arMode && !(k === 'door' && forestOn())) || EQ.edit === k; // en el bosque, la barra es la rama de un árbol
  }
  eqBeamMat.opacity = EQ.edit ? 0.55 + 0.4 * Math.sin(t * 8) : 0.75;
}

/* ---------- Anclas persistentes (Quest) y suelo del guardián ---------- */
function anchorsInit(session) {
  EQ.bref = EQ.b2l = EQ.ref = null;
  if (session.requestReferenceSpace) session.requestReferenceSpace('bounded-floor').then(r => { EQ.bref = r; }).catch(() => {});
  for (const k of EQ_KINDS) { const e = EQ.xr[k]; e.anchor = null; e.synced = false; e.fix = false; if (e.handle) restoreAnchor(session, e, 0); }
}
// Al empezar la sesión las Quest pueden no haber reconocido aún la habitación: se reintenta antes de dar el ancla por perdida
function restoreAnchor(session, e, tries) {
  if (!session.restorePersistentAnchor) return;
  const h = e.handle;
  session.restorePersistentAnchor(h).then(a => { if (e.handle === h && !EQ.edit) e.anchor = a; }).catch(() => {
    if (e.handle !== h || !xrActive) return;
    if (tries < 3) setTimeout(() => restoreAnchor(session, e, tries + 1), 1500 * (tries + 1));
    else if (e.b) { e.handle = null; saveEquip(); } // queda la pose respecto al guardián
  });
}
function anchorsEnd() { for (const k of EQ_KINDS) EQ.xr[k].anchor = null; EQ.pending.length = 0; EQ.bref = EQ.b2l = EQ.ref = null; }
// Recentrar mueve el origen de local-floor: lo que no tiene ancla ni guardián se lleva al mismo sitio de la habitación
const _rq = new Q4(), _rm = new THREE.Matrix4(), _rv3 = new V3();
function onRefReset(ev) {
  const T = ev && ev.transform; if (!T) return;
  _rm.compose(_rv3.set(T.position.x, T.position.y, T.position.z), _rq.set(T.orientation.x, T.orientation.y, T.orientation.z, T.orientation.w), new V3(1, 1, 1)).invert();
  const dyaw = -yawOf(_rq);
  for (const k of EQ_KINDS) {
    const e = EQ.xr[k]; if (e.anchor || (e.b && EQ.bref)) continue;
    _rv3.set(e.x, 0, e.z).applyMatrix4(_rm); e.x = _rv3.x; e.z = _rv3.z; e.yaw += dyaw;
  }
  saveEquip();
}
// Se llama dentro del bucle XR: crea las anclas pendientes y sigue las que existen
function anchorsFrame(frame, ref) {
  if (ref !== EQ.ref) { EQ.ref = ref; if (ref.addEventListener) ref.addEventListener('reset', onRefReset); }
  if (EQ.bref) { const bp = frame.getPose(EQ.bref, ref); if (bp) { const p = bp.transform.position, o = bp.transform.orientation; EQ.b2l = { x: p.x, z: p.z, yaw: yawOf(_eqq.set(o.x, o.y, o.z, o.w)) }; } }
  while (EQ.pending.length) {
    const k = EQ.pending.shift(), e = EQ.xr[k], session = frame.session;
    if (!frame.createAnchor || typeof XRRigidTransform === 'undefined') break;
    const q = new Q4().setFromAxisAngle(_up, e.yaw);
    let p; try { p = frame.createAnchor(new XRRigidTransform({ x: e.x, y: 0, z: e.z }, { x: q.x, y: q.y, z: q.z, w: q.w }), ref); } catch (err) { p = null; }
    if (p) p.then(a => {
      const old = e.handle; e.anchor = a; e.handle = null;
      if (old && session.deletePersistentAnchor) session.deletePersistentAnchor(old).catch(() => {});
      if (a.requestPersistentHandle) a.requestPersistentHandle().then(h => { e.handle = h; saveEquip(); }).catch(() => {});
    }).catch(() => {});
  }
  for (const k of EQ_KINDS) {
    const e = EQ.xr[k]; if (!e.set || EQ.edit === k) continue;
    const pose = e.anchor && e.anchor.anchorSpace && frame.getPose(e.anchor.anchorSpace, ref);
    if (pose) {
      const p = pose.transform.position, o = pose.transform.orientation;
      eqTrack(e, p.x, p.z, yawOf(_eqq.set(o.x, o.y, o.z, o.w)));
      if (!e.synced && EQ.b2l) { e.synced = true; eqToBounded(e); saveEquip(); } // el ancla manda: el guardián se pone al día
    } else if (e.b && EQ.b2l) eqFromBounded(e);
    else if (!e.b && EQ.b2l && e.handle === null && e.synced === false) { e.synced = true; eqToBounded(e); saveEquip(); } // poses antiguas: desde ahora, también respecto al guardián
  }
}
const _eqq = new Q4();
function equipChanged(k) { const e = eqPose(k); e.set = true; if (!preview) { eqToBounded(e); e.synced = true; saveEquip(); } }
// Al terminar de colocarlo: ancla nueva en el próximo fotograma XR
function equipCommit(k) { if (!preview && !EQ.pending.includes(k)) EQ.pending.push(k); }

/* =================== CHARCO CON MONSTRUOS =================== */
const pool = new THREE.Group(); pool.visible = false; scene.add(pool);
const poolTex = texFrom((() => {
  const c = mkCanvas(256), x = c.getContext('2d'), R = rng(31), g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.62, 'rgba(2,8,6,1)'); g.addColorStop(0.88, 'rgba(8,34,22,0.97)'); g.addColorStop(0.96, 'rgba(30,110,70,0.55)'); g.addColorStop(1, 'rgba(30,110,70,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) { const a = R() * TAU, r = 30 + R() * 80; x.strokeStyle = `rgba(60,200,130,${0.05 + R() * 0.1})`; x.lineWidth = 1 + R() * 2; x.beginPath(); x.arc(128, 128, r, a, a + 0.3 + R() * 0.8); x.stroke(); }
  return c;
})());
poolTex.wrapS = poolTex.wrapT = THREE.ClampToEdgeWrapping;
// El agua del charco: ondas que salen de donde asoma cada tentáculo, suaves mientras se mecen y fuertes cuando se lanzan
// o barren (y un rizado leve de fondo); desplazan el dibujo del charco y le sacan brillos
const POOL_FS = `uniform sampler2D map; uniform float uTime; uniform vec4 uSrc[5]; varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0; float w = 0.0; vec2 g = vec2(0.0);
  for (int i = 0; i < 5; i++) { vec2 d = p - uSrc[i].xy; float r = length(d) + 1e-4, s = uSrc[i].z;
    float k = sin(r * 34.0 - uTime * (6.0 + 6.0 * uSrc[i].w) + float(i) * 1.7) * exp(-r * 2.6) * s; w += k; g += d / r * k; }
  w += 0.12 * sin(p.x * 9.0 + uTime * 1.3) * sin(p.y * 8.0 - uTime * 1.1);
  vec4 c = texture2D(map, vUv + g * 0.02);
  vec3 col = c.rgb + vec3(0.1, 0.7, 0.42) * max(0.0, w) * 0.45 * (1.0 - length(p) * 0.35) + vec3(0.6, 1.0, 0.8) * pow(max(0.0, w), 2.0) * 0.3;
  gl_FragColor = vec4(col, c.a);
}`;
const poolSrc = [0, 1, 2, 3, 4].map(() => new THREE.Vector4(0, 0, 0, 0));
const poolWater = new THREE.ShaderMaterial({ uniforms: { map: { value: poolTex }, uTime: { value: 0 }, uSrc: { value: poolSrc } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: POOL_FS, transparent: true, depthWrite: false });
const poolDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), poolWater);
poolDisc.rotation.x = -Math.PI / 2; poolDisc.position.y = 0.004; poolDisc.renderOrder = 1; pool.add(poolDisc);
const poolRimMat = new THREE.MeshBasicMaterial({ color: 0x2cff9a, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
const poolRim = new THREE.Mesh(new THREE.RingGeometry(0.96, 1.0, 64), poolRimMat); poolRim.rotation.x = -Math.PI / 2; poolRim.position.y = 0.006; pool.add(poolRim);
const POOL = { rx: 0.8, rz: 0.8, tents: [], eyes: [], lungeT: 5, grabT: 0, bubbleT: 0, excite: 0, ph: 0 };
const eyeMat = new THREE.SpriteMaterial({ map: TX.halo, color: 0xffe14a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
for (let i = 0; i < 4; i++) { const pair = new THREE.Group(); for (const s of [-1, 1]) { const e = new THREE.Sprite(eyeMat); e.scale.set(0.05, 0.035, 1); e.position.set(s * 0.035, 0.012, 0); pair.add(e); } pool.add(pair); POOL.eyes.push({ g: pair, a: i * 1.7 + 0.4, r: 0.25 + (i % 2) * 0.3, t: rand(0, 4) }); }
// Tamaño y sitio: bajo la barra (círculo) o bajo las paralelas y el cuerpo tumbado (elipse)
function layoutPool() {
  if (eqKind() === 'dip' && dipOne()) { POOL.rx = 0.95; POOL.rz = settings.dipLen / 200 + 0.35; } // cuerpo cruzado bajo la barra
  else if (eqKind() === 'dip') { POOL.rx = settings.dipGap / 200 + 0.35; POOL.rz = settings.dipLen / 200 + 0.85; }
  else { POOL.rx = POOL.rz = 0.8; }
  pool.scale.set(1, 1, 1); poolDisc.scale.set(POOL.rx, POOL.rz, 1); poolRim.scale.set(POOL.rx, POOL.rz, 1);
  POOL.tents.forEach((T, i) => { const a = T.a; T.root.position.set(Math.cos(a) * POOL.rx * 0.92, 0, Math.sin(a) * POOL.rz * 0.92); T.root.rotation.y = Math.atan2(-Math.cos(a) * POOL.rx, -Math.sin(a) * POOL.rz); });
}
settingHooks.push(k => { if (k === 'exercise' || k === 'mode') layoutPool(); });
// Tentáculo animado (del Pirate Kit): mide unos 15,5 de alto y ataca hacia +Z. Si no carga (o en las pruebas), los hechos a mano
const TENT = { st: '', scene: null, clips: {}, hits: 0 }, TENT_K = 0.062;
function tentLoad() {
  if (TENT.st) return;
  if (!THREE.GLTFLoader || !THREE.SkeletonUtils || typeof document === 'undefined') { TENT.st = 'failed'; return; }
  TENT.st = 'loading';
  new THREE.GLTFLoader().load('models/tentaculo.glb', g => {
    for (const c of g.animations) TENT.clips[c.name.replace('Tentacle_', '')] = c;
    g.scene.traverse(m => { if (m.isMesh) { m.frustumCulled = false; if (m.material) m.material.roughness = 0.4; } }); // se doblan mucho fuera de su caja; húmedos
    TENT.scene = g.scene; TENT.st = 'ready';
  }, undefined, e => { TENT.st = 'failed'; console.log('No se pudo cargar el tentáculo:', e && e.message); });
}
function ensureTentacles() {
  if (POOL.tents.length) return;
  tentLoad(); if (TENT.st === 'loading') return; // enseguida salen los animados
  for (let i = 0; i < 5; i++) {
    const T = { a: (i + 0.3) / 5 * TAU, ph: rand(0, TAU), lunge: 0, lungeV: 0, s: rand(0.8, 1.15) };
    if (TENT.st === 'ready') {
      const root = THREE.SkeletonUtils.clone(TENT.scene), mixer = new THREE.AnimationMixer(root), idle = mixer.clipAction(TENT.clips.Idle);
      Object.assign(T, { mdl: true, root, mixer, idle, hit: null, hitT: 0, hitDur: 0, k: 0, ts: rand(0.8, 1.2) });
      idle.time = rand(0, TENT.clips.Idle.duration); idle.play();
    } else {
      const inst = RIGS.tentacle && RIGS.tentacle.instance({ main: M.tentacleSkin, glow: M.glowSkin }); if (!inst) return;
      Object.assign(T, { inst, root: inst.root, B: inst.list });
    }
    pool.add(T.root); POOL.tents.push(T);
  }
  layoutPool();
}
// El animado se lanza: Poke (pinchazo), Attack (latigazo) o Attack2 (barrido, al caer)
function tentHit(T, n, ts = 1) {
  if (T.hit) T.hit.stop();
  const A = T.mixer.clipAction(TENT.clips[n]); A.reset(); A.setLoop(THREE.LoopOnce, 1); A.clampWhenFinished = true; A.timeScale = ts; A.fadeIn(0.12).play();
  T.idle.fadeOut(0.12); T.hit = A; T.hitT = 0; T.hitDur = TENT.clips[n].duration; TENT.hits++;
}
function tentUpdate(T, dt, feet, ex) {
  if (T.hit) { T.hitT += dt * T.hit.timeScale; if (T.hitT >= T.hitDur - 0.15) { T.hit.fadeOut(0.2); T.idle.enabled = true; T.idle.fadeIn(0.2).play(); T.hit = null; } }
  T.k += ((T.hit ? 1 : 0) - T.k) * Math.min(1, dt * 8); const k = smooth(T.k);
  T.idle.timeScale = T.ts * (1 + 2.2 * ex);
  // al lanzarse, hacia tus pies y lo bastante largo para llegar (la punta avanza unas 8 veces la escala)
  const P = T.root.position, dx = feet.x - P.x, dz = feet.z - P.z, rest = Math.atan2(-P.x, -P.z), base = TENT_K * T.s;
  T.root.rotation.y = rest + wrapAng(Math.atan2(dx, dz) - rest) * k;
  T.root.scale.setScalar(lerp(base, clamp(Math.hypot(dx, dz) / 8, base, base * 1.6), k));
  T.mixer.update(dt);
}
const _pt2 = new V3();
// Algo que pasa en el charco: un tentáculo se lanza a por tus pies, o todos te agarran si caes
function poolLunge() {
  const T = pick(POOL.tents); if (!T || T.lungeV !== 0 || T.hit) return;
  if (T.mdl) tentHit(T, pick(['Poke', 'Attack'])); else T.lungeV = 1;
  SND.tentacle(T.root.getWorldPosition(_pt2), rand(0.85, 1.15));
}
function poolGrab(at) {
  POOL.grabT = 1.6; POOL.excite = 6; SND.horror(at); // al caer se excitan: se agitan más rápido un buen rato
  fx.droplets(at, 40, [0.25, 0.9, 0.5], 2.6, 0.04); fx.glow(at, [0.3, 1, 0.6], 0.8, 0.2);
  POOL.tents.forEach(T => { if (T.mdl) tentHit(T, 'Attack2', rand(1, 1.3)); else T.lungeV = 1; });
}
function updatePool(dt, t) {
  const show = isBars() && eqKind() === 'door' && state !== 'idle' && !vortexOn(); // el charco solo bajo la barra de dominadas (o el remolino, colgado)
  pool.visible = show; if (!show) return;
  ensureTentacles();
  const e = eqPose();
  pool.position.set(e.x, 0, e.z); pool.rotation.y = e.yaw;
  poolRimMat.opacity = 0.35 + 0.2 * Math.sin(t * 2.3) + POOL.grabT * 0.3;
  const active = state === 'play';
  // excitación tras una caída: se agitan más rápido y más fuerte, y embisten más a menudo
  POOL.excite = Math.max(0, POOL.excite - dt); const ex = Math.min(1, POOL.excite / 3);
  POOL.ph += dt * (1 + 2.8 * ex);
  if (active || ex > 0) { POOL.lungeT -= dt * (1 + 3 * ex); if (POOL.lungeT <= 0) { POOL.lungeT = settings.exercise === 'hang' ? rand(2.5, 6) : rand(5, 11); poolLunge(); } }
  if (POOL.grabT > 0) POOL.grabT = Math.max(0, POOL.grabT - dt);
  // burbujas que revientan en la superficie
  POOL.bubbleT -= dt;
  if (POOL.bubbleT <= 0) { POOL.bubbleT = rand(0.15, 0.5); const a = rand(0, TAU), r = Math.sqrt(Math.random()) * 0.85; const p = pool.localToWorld(_pt2.set(Math.cos(a) * r * POOL.rx, 0.02, Math.sin(a) * r * POOL.rz)); fx.glow(p, [0.2, 0.8, 0.45], rand(0.04, 0.1), 0.35, 0.6); if (Math.random() < 0.3) fx.droplets(p, 3, [0.2, 0.7, 0.4], 0.5, 0.015); }
  for (const E of POOL.eyes) { E.t -= dt; const open = E.t > 0.15 || E.t < 0; if (E.t <= 0) E.t = rand(2, 6); E.g.visible = open; E.a += dt * 0.12; E.g.position.set(Math.cos(E.a) * E.r * POOL.rx, 0, Math.sin(E.a) * E.r * POOL.rz); }
  // el agua se mueve con ellos: cada tentáculo hace ondas desde donde asoma (más fuertes al lanzarse o al barrer)
  poolWater.uniforms.uTime.value = t;
  poolSrc.forEach((v, i) => { const T = POOL.tents[i]; if (!T) { v.z = 0; return; } const k = T.mdl ? T.k : Math.max(T.lunge, POOL.grabT > 0 ? Math.min(1, POOL.grabT) : 0);
    v.set(T.root.position.x / POOL.rx, -T.root.position.z / POOL.rz, 0.25 + 1.1 * k + 0.5 * ex, k + ex); });
  // tentáculos: ondulación, embestida hacia los pies y agarrón
  const feet = eqLocal(e, head.p, _pt2);
  for (const T of POOL.tents) {
    if (T.mdl) { tentUpdate(T, dt, feet, ex); continue; }
    if (T.lungeV) { T.lunge += dt * 3.2 * T.lungeV; if (T.lunge >= 1) { T.lunge = 1; T.lungeV = -0.5; } else if (T.lunge <= 0) { T.lunge = 0; T.lungeV = 0; } }
    const k = smooth(Math.max(T.lunge, POOL.grabT > 0 ? Math.min(1, POOL.grabT) : 0)), n = T.B.length;
    const dx = feet.x - T.root.position.x, dz = feet.z - T.root.position.z, reach = Math.hypot(dx, dz);
    const rest = Math.atan2(-T.root.position.x, -T.root.position.z); T.root.rotation.y = rest + wrapAng(Math.atan2(dx, dz) - rest) * k;
    T.root.scale.setScalar(T.s * (1 + k * 0.35));
    for (let i = 0; i < n; i++) {
      const b = T.B[i], amp = (0.12 + i * 0.05) * (1 + 0.9 * ex), P = POOL.ph, w = Math.sin(P * 1.6 + T.ph - i * 0.55);
      b.rotation.x = lerp((i === 0 ? 0.35 : 0.1) + amp * w, i === 0 ? Math.atan2(reach, 0.5) : 0.06 + 0.12 * w, k);
      b.rotation.z = amp * 0.6 * Math.sin(P * 1.25 + T.ph * 1.7 - i * 0.5) * (1 - k * 0.6) + ex * 0.08 * Math.sin(P * 9 + i);
    }
  }
}
buildEquipVis();
