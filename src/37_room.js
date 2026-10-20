
/* =================== HABITACIÓN (realidad mixta) =================== */
// En realidad mixta las Quest 3 saben dónde están tus paredes y tus muebles (lo que escaneaste en la configuración
// del espacio; en WebXR, plane-detection y mesh-detection). Con eso:
//  · las compuertas se abren en tus paredes, donde el camino hasta ti está libre de muebles y de otras paredes;
//  · el marcador se cuelga en una pared, y las trampillas de las arañas salen en suelo libre;
//  · los robots no eligen su puesto de ataque dentro de un mueble;
//  · las paredes y los muebles tapan lo que pasa por detrás (con un hueco en cada compuerta, por el que se ve el túnel).
// Si la habitación no cumple los requisitos (o lo prefieres), «Colocada a mano»: pones tú el sitio de juego, las
// compuertas, las trampillas y el marcador, y se recuerda entre sesiones. En VR o con el ajuste en No, todo como siempre.
const ROOM = { walls: [], furn: [], feats: [], uw: [], uf: [], ceilY: 0, sig: '', fp: '', read: false, pollT: -1e9, refs: new WeakSet(), plan: null, applied: false, at: null, wait: 0, occl: new THREE.Group(), wallOcc: new THREE.Group() };
ROOM.occl.add(ROOM.wallOcc); ROOM.occl.visible = false; scene.add(ROOM.occl);
const roomMode = () => arMode && !forestOn() ? settings.roomMode : 'off';
const roomOn = () => { const m = roomMode(); return m === 'scan' ? ROOM.walls.length > 0 : m === 'manual' ? manualReady() : false; };
const roomPlan = () => roomOn() && ROOM.applied ? ROOM.plan : null;
// solo escribe profundidad: lo virtual que queda detrás de una pared o un mueble real no se ve
const occMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
// «Ver lo escaneado»: paredes en verde y muebles en naranja, tal como los ha leído el juego (para comprobar que coinciden)
const scanWallMat = new THREE.MeshBasicMaterial({ color: 0x3cf0c6, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
const scanFurnMat = new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
const occlMatFor = kind => settings.roomShow ? (kind === 'wall' ? scanWallMat : scanFurnMat) : occMat;
const _ro = new V3(), _rn2 = new V3(), _rq4 = new Q4(), _roM = new THREE.Matrix4(), _r1 = new V3(1, 1, 1);
const roomLabel = o => String(o.semanticLabel || '').toLowerCase().replace(/[\s-]+/g, '_');
// las Quest llaman a las paredes «wall» o «wall face»; las invisibles (para cerrar un hueco) no son reales
const WALL_LABELS = ['wall', 'wall_face'];
const WALL_FEATS = ['door_frame', 'door', 'window_frame', 'window', 'wall_art', 'screen'];
const NOT_FURN = ['global_mesh', 'floor', 'ceiling', ...WALL_LABELS, 'invisible_wall_face', 'inner_wall_face', ...WALL_FEATS];
// Un mueble de verdad no ocupa media habitación: lo que es más grande (la malla de la habitación mal etiquetada, por
// ejemplo) no se toma por mueble
function furnOk(poly) {
  if (poly.length < 3) return false;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, area = 0;
  poly.forEach(([x, z], i) => { const [nx, nz] = poly[(i + 1) % poly.length]; area += x * nz - nx * z; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); });
  return Math.abs(area) / 2 <= 4.5 && Math.max(x1 - x0, z1 - z0) <= 3.2;
}
function poseMatrix(frame, space, ref) {
  const p = space && frame.getPose(space, ref); if (!p) return null;
  const t = p.transform; return _roM.compose(_ro.set(t.position.x, t.position.y, t.position.z), _rq4.set(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w), _r1);
}
// Casco convexo (x, z): la huella de un mueble
function hull2(pts) {
  const p = pts.map(q => [q.x, q.z]).sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/* ---------- Leer el escaneo ---------- */
// Tiene que costar casi nada: las Quest pueden ir actualizando el escaneo sin parar (la malla de la habitación se
// refina), y releerlo en cada fotograma daba tirones también en VR. Así que solo se lee cuando sirve (realidad mixta con
// la escala de habitación, fuera del bosque y fuera de la partida, salvo la primera vez), como mucho una vez por
// segundo, sin copiar vértices; y si el resultado no cambia de verdad (al centímetro), no se toca nada más.
// featOff: la sesión empezó con la escala de habitación en No y no pidió el escaneo (hay que volver a entrar)
function roomSessionStart(session) { const f = session && session.enabledFeatures; Object.assign(ROOM, { sig: '', fp: '', read: false, pollT: -1e9, featOff: !!f && !f.includes('plane-detection') && !f.includes('mesh-detection') }); }
const roomWants = () => arMode && settings.roomMode !== 'off' && !forestOn() && (!ROOM.read || !['play', 'rest', 'paused'].includes(state));
function roomFrame(frame, ref, t) {
  // al recentrar, las poses cambian: se vuelve a leer todo (al empezar otra sesión, también: roomSessionStart)
  if (!ROOM.refs.has(ref)) { ROOM.refs.add(ref); if (ref.addEventListener) ref.addEventListener('reset', () => { ROOM.sig = ''; ROOM.fp = ''; ROOM.pollT = -1e9; }); }
  if (!roomWants() || t - ROOM.pollT < 1) return;
  const planes = frame.detectedPlanes, meshes = frame.detectedMeshes; if (!planes && !meshes) { ROOM.diag = { none: true }; return; }
  ROOM.pollT = t;
  { const L = new Set(); if (planes) planes.forEach(p => L.add(roomLabel(p) || 'sin etiqueta')); ROOM.diag = { planes: planes ? planes.size : 0, meshes: meshes ? meshes.size : 0, labels: [...L].slice(0, 6) }; } // lo que entrega el visor (para el diagnóstico)
  let sig = '';
  if (planes) planes.forEach(p => { sig += (p.lastChangedTime || 0) + ','; });
  sig += '|'; if (meshes) meshes.forEach(m => { sig += (m.lastChangedTime || 0) + ','; });
  if (sig === ROOM.sig) return; ROOM.sig = sig;
  const walls = [], furn = [], feats = []; let ceil = 0;
  if (planes) planes.forEach(pl => {
    const M = poseMatrix(frame, pl.planeSpace, ref); if (!M || !pl.polygon || pl.polygon.length < 3) return;
    const L = roomLabel(pl), pts = Array.from(pl.polygon, q => new V3(q.x, q.y, q.z).applyMatrix4(M));
    let y0 = Infinity, y1 = -Infinity; for (const q of pts) { y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    if (L === 'ceiling') { ceil = Math.max(ceil, y0); return; }
    if (L === 'floor') return;
    const n = _rn2.set(0, 1, 0).transformDirection(M); // la normal del plano es su eje Y
    if (pl.orientation === 'vertical' || Math.abs(n.y) < 0.5) {
      const nh = new V3(n.x, 0, n.z); if (nh.lengthSq() < 1e-6) return; nh.normalize();
      const u = new V3(-nh.z, 0, nh.x), o = new V3().setFromMatrixPosition(M); let s0 = Infinity, s1 = -Infinity;
      for (const q of pts) { const s = (q.x - o.x) * u.x + (q.z - o.z) * u.z; s0 = Math.min(s0, s); s1 = Math.max(s1, s); }
      const w = { a: new V3(o.x + u.x * s0, 0, o.z + u.z * s0), b: new V3(o.x + u.x * s1, 0, o.z + u.z * s1), n: nh, y0: Math.max(0, y0), y1, label: L };
      if (WALL_LABELS.includes(L) || (!L && s1 - s0 > 1.2 && y1 - y0 > 1.8)) walls.push(w); else if (WALL_FEATS.includes(L)) feats.push(w);
      return;
    }
    // horizontal y ni suelo ni techo: la tapa de un mueble apoyado en el suelo (mesa, sofá, cama...)
    if (y0 > 0.05 && y0 < 2.2 && !NOT_FURN.includes(L)) { const poly = hull2(pts); if (furnOk(poly)) furn.push({ poly, y0: 0, y1, label: L }); }
  });
  if (meshes) meshes.forEach(me => {
    const L = roomLabel(me); if (!L || NOT_FURN.includes(L) || !me.vertices || me.vertices.length < 9) return; // sin etiqueta puede ser cualquier cosa
    const M = poseMatrix(frame, me.meshSpace, ref); if (!M) return;
    // la caja del mueble en su propio espacio, en una pasada y sin crear nada; luego sus 8 esquinas en el mundo
    const v = me.vertices, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i + 2 < v.length; i += 3) for (let k = 0; k < 3; k++) { const c = v[i + k]; if (c < lo[k]) lo[k] = c; if (c > hi[k]) hi[k] = c; }
    const pts = []; let y0 = Infinity, y1 = -Infinity;
    for (let c = 0; c < 8; c++) { const q = new V3(c & 1 ? hi[0] : lo[0], c & 2 ? hi[1] : lo[1], c & 4 ? hi[2] : lo[2]).applyMatrix4(M); pts.push(q); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    if (y1 < 0.05 || y0 > 2.2) return; // lo que cuelga del techo no estorba
    const poly = hull2(pts); if (furnOk(poly)) furn.push({ poly, y0: Math.max(0, y0), y1, label: L });
  });
  ROOM.read = true;
  // ¿cambió algo de verdad? (al centímetro)
  const r = x => Math.round(x * 100), fp = [walls.map(w => [w.a.x, w.a.z, w.b.x, w.b.z, w.y1].map(r).join(',')).join(';'), feats.map(w => [w.a.x, w.a.z, w.b.x, w.b.z].map(r).join(',')).join(';'), furn.map(f => f.poly.map(([x, z]) => r(x) + ',' + r(z)).join(' ') + '^' + r(f.y1)).join(';'), r(ceil)].join('|');
  if (fp === ROOM.fp) return; ROOM.fp = fp;
  Object.assign(ROOM, { walls, furn, feats, ceilY: ceil, applied: false, plan: null }); // roomStep lo recoloca y rehace los oclusores
}

/* ---------- Geometría en el suelo, en coordenadas de la arena (tú en el origen, mirando a -Z) ---------- */
const toL = p => { const v = arena.worldToLocal(_ro.copy(p)); return { x: v.x, z: v.z }; };
const dirL = n => { const a = arena.worldToLocal(_ro.set(0, 0, 0)), ax = a.x, az = a.z, b = arena.worldToLocal(_ro.copy(n)); return { x: b.x - ax, z: b.z - az }; };
function segCross(ax, az, bx, bz, cx, cz, dx, dz) {
  const r = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx); if (Math.abs(r) < 1e-9) return false;
  const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / r, u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / r;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
function ptSeg(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz, t = l ? clamp(((px - ax) * dx + (pz - az) * dz) / l, 0, 1) : 0; return Math.hypot(px - ax - dx * t, pz - az - dz * t); }
function inPoly(px, pz, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > pz) !== (P[j][1] > pz) && px < (P[j][0] - P[i][0]) * (pz - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; }
// distancia de un tramo a un polígono (0 si lo cruza o empieza dentro)
function segPoly(ax, az, bx, bz, P) {
  if (inPoly(ax, az, P) || inPoly(bx, bz, P)) return 0;
  let d = Infinity;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    if (segCross(ax, az, bx, bz, P[j][0], P[j][1], P[i][0], P[i][1])) return 0;
    d = Math.min(d, ptSeg(P[i][0], P[i][1], ax, az, bx, bz), ptSeg(ax, az, P[j][0], P[j][1], P[i][0], P[i][1]), ptSeg(bx, bz, P[j][0], P[j][1], P[i][0], P[i][1]));
  }
  return d;
}
// La habitación vista desde la arena: paredes, huecos de puertas y ventanas y huellas de muebles, en 2D
function roomLocal() {
  arena.updateMatrixWorld();
  const wall = w => { const a = toL(w.a), b = toL(w.b), n = dirL(w.n); return { a, b, n, len: Math.hypot(b.x - a.x, b.z - a.z), w }; };
  return { walls: ROOM.uw.map(wall), feats: ROOM.feats.map(wall), furn: ROOM.uf.map(f => f.poly.map(([x, z]) => { const p = toL(_ro.set(x, 0, z)); return [p.x, p.z]; })) };
}
// ¿Se puede ir en línea recta de A a B sin pasar por un mueble (con margen) ni atravesar una pared?
function roomClear(R, ax, az, bx, bz, margin, skipWall = -1) {
  for (const P of R.furn) if (P.length >= 3 && segPoly(ax, az, bx, bz, P) < margin) return false;
  for (let i = 0; i < R.walls.length; i++) if (i !== skipWall) { const w = R.walls[i]; if (segCross(ax, az, bx, bz, w.a.x, w.a.z, w.b.x, w.b.z)) return false; }
  return true;
}
// Un punto del suelo donde se puede estar: dentro de la habitación (sin cruzar paredes desde ti), lejos de los muebles
// y de las paredes
function roomFree(R, x, z, margin) {
  if (!roomClear(R, 0, 0, x, z, 0)) return false;
  for (const P of R.furn) if (P.length >= 3 && segPoly(x, z, x, z, P) < margin) return false;
  for (const w of R.walls) if (ptSeg(x, z, w.a.x, w.a.z, w.b.x, w.b.z) < margin) return false;
  return true;
}
// Puestos a lo largo de las paredes: los que miran hacia ti, a la distancia y el ángulo pedidos, con el camino libre
function wallSpots(R, half, depth, minD, maxD, maxAng, path, why = {}) {
  const out = []; why.stage = why.stage || 0; const reach = k => { if (k > why.stage) why.stage = k; };
  R.walls.forEach((W, wi) => {
    if (W.len < 2 * half + 0.1) return; reach(1);
    const ux = (W.b.x - W.a.x) / W.len, uz = (W.b.z - W.a.z) / W.len, n = W.n;
    for (let t = half + 0.05; t <= W.len - half - 0.05 + 1e-6; t += 0.2) {
      const px = W.a.x + ux * t, pz = W.a.z + uz * t, x = px + n.x * depth, z = pz + n.z * depth, d = Math.hypot(x, z);
      if (d < minD || d > maxD) continue; reach(2);
      const face = -(n.x * x + n.z * z) / d, ang = Math.atan2(x, -z); if (face < 0.4 || Math.abs(ang) > maxAng) continue; reach(3);
      if (R.feats.some(F => ptSeg(px, pz, F.a.x, F.a.z, F.b.x, F.b.z) < half && Math.abs(F.n.x * n.x + F.n.z * n.z) > 0.8)) continue; // ni puertas ni ventanas
      // las esquinas de lo que se cuelga, despejadas de muebles
      let ok = true; for (const s of [-1, 1]) for (const f of [0.05, depth * 2 + 0.3]) { const cx = px + ux * s * half + n.x * f, cz = pz + uz * s * half + n.z * f; if (R.furn.some(P => P.length >= 3 && segPoly(cx, cz, cx, cz, P) < 0.05)) ok = false; }
      if (!ok) continue; reach(4);
      if (path && !roomClear(R, x + n.x * path, z + n.z * path, x * 0.7 / d, z * 0.7 / d, 0.35, wi)) continue; reach(5);
      out.push({ x, z, px, pz, rot: Math.atan2(n.x, n.z), ang, d, wi, t, score: Math.cos(ang) * 2 + face - Math.abs(d - 3.2) * 0.25 });
    }
  });
  return out;
}
// Dónde van las compuertas (hasta tres: centro, izquierda y derecha), el marcador y lo lejos que está la pared de delante
function scanPlan() {
  const R = roomLocal(); if (!R.walls.length) return null;
  const H = Math.min(ROOM.ceilY > 1.6 ? ROOM.ceilY : 9, Math.max(...ROOM.walls.map(w => w.y1)));
  const gs = clamp((H - 0.1) / 4.4, 0.4, 0.72), half = 1.85 * gs; // la compuerta, con su baliza, cabe bajo el techo
  const why = {}, C = wallSpots(R, half, 0.45 * gs, 1.7, 7.5, 1.3, 0.9 * gs, why);
  let front = Infinity; for (const w of R.walls) { const den = w.b.x - w.a.x; if (Math.abs(den) < 1e-9) continue; const t = -w.a.x / den; if (t < 0 || t > 1) continue; const z = w.a.z + (w.b.z - w.a.z) * t; if (z < 0) front = Math.min(front, -z); }
  const plan = { gs, half, gates: [null, null, null], board: null, front, R };
  // si no cabe ninguna compuerta, por qué (lo más lejos que llegó la búsqueda)
  if (!C.length) plan.why = ['las paredes escaneadas son demasiado estrechas para una compuerta', 'no hay ninguna pared a 1,7–7,5 m de donde estás', 'no hay ninguna pared delante de ti (mira hacia una pared libre)', 'delante de las paredes hay muebles, puertas o ventanas', 'los muebles tapan el camino entre las paredes y tú'][why.stage] || 'no cabe ninguna compuerta';
  if (C.length) {
    const sep = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) >= 2 * half + 0.25;
    const best = list => list.reduce((m, c) => (!m || c.score > m.score ? c : m), null);
    const mid = best(C); plan.gates[1] = mid;
    plan.gates[0] = best(C.filter(c => c.ang < mid.ang - 0.25 && sep(c, mid)));
    plan.gates[2] = best(C.filter(c => c.ang > mid.ang + 0.25 && sep(c, mid) && (!plan.gates[0] || sep(c, plan.gates[0]))));
  }
  // el marcador, colgado en una pared a un lado, lejos de las compuertas
  const used = plan.gates.filter(Boolean), B = wallSpots(R, 0.65, 0.03, 1.4, 5.5, 1.2, 0).filter(c => Math.abs(c.ang) > 0.2 && used.every(g => Math.hypot(c.x - g.x, c.z - g.z) > half + 0.9));
  plan.board = B.reduce((m, c) => { const s = -Math.abs(Math.abs(c.ang) - 0.55) - Math.abs(c.d - 2.6) * 0.3; return !m || s > m.s ? Object.assign(c, { s }) : m; }, null);
  return plan;
}
// Trampilla en suelo libre: la de siempre si cabe; si no, la más parecida que esté despejada, con camino hasta ti y
// separada de las otras trampillas
function roomHatch(plan, x, z, taken = []) {
  const R = plan.R, a0 = Math.atan2(x, -z), d0 = Math.hypot(x, z);
  for (const dd of [0, -0.3, -0.6, 0.3]) for (const da of [0, 0.15, -0.15, 0.3, -0.3, 0.5, -0.5, 0.8, -0.8]) {
    const d = d0 + dd, a = a0 + da, px = Math.sin(a) * d, pz = -Math.cos(a) * d;
    if (d > 1.2 && roomFree(R, px, pz, 0.3) && roomClear(R, px, pz, 0, -0.3, 0.12) && taken.every(([tx, tz]) => Math.hypot(px - tx, pz - tz) > 0.6)) return [px, pz];
  }
  return [x, z];
}
// Puesto de ataque de un robot: ni dentro de un mueble ni detrás de una pared
function roomBlocked(x, z, r) { const P = roomPlan(); return !!P && !roomFree(P.R, x, z, r + 0.15); }

/* ---------- Oclusión: muebles (fijos) y paredes (con un hueco en cada compuerta) ---------- */
function clearOccl(g) { for (const c of [...g.children]) { if (c === ROOM.wallOcc) continue; g.remove(c); if (c.geometry) c.geometry.dispose(); } }
function prismGeo(poly, y0, y1) { // muro de la huella del mueble, de y0 a y1, con su tapa
  const pos = [], idx = [], n = poly.length;
  poly.forEach(([x, z]) => pos.push(x, y0, z, x, y1, z));
  for (let i = 0; i < n; i++) { const j = (i + 1) % n, a = i * 2, b = j * 2; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  for (let i = 1; i + 1 < n; i++) idx.push(1, i * 2 + 1, (i + 1) * 2 + 1);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
}
function occMesh(g, kind) { const m = new THREE.Mesh(g, occlMatFor(kind)); m.userData.kind = kind; m.renderOrder = -2; m.frustumCulled = false; return m; }
// Lo que se usa de verdad: ni paredes ni muebles donde estás tú (un escaneo mal leído no puede taparte todo ni dejar a
// los robots sin sitio). Se calcula al recolocar, con la arena (tú) donde esté
function roomFilter() {
  const ux = arena.position.x, uz = arena.position.z;
  ROOM.uw = ROOM.walls.filter(w => ptSeg(ux, uz, w.a.x, w.a.z, w.b.x, w.b.z) > 0.35);
  ROOM.uf = ROOM.furn.filter(f => segPoly(ux, uz, ux, uz, f.poly) > 0.35);
}
function buildFurnOccluders() {
  clearOccl(ROOM.occl);
  for (const f of ROOM.uf) {
    let g;
    if (f.poly.length >= 3) g = prismGeo(f.poly, f.y0, f.y1);
    if (g) ROOM.occl.add(occMesh(g, 'furn'));
  }
}
// Cada pared, un poco por detrás de su superficie, partida en trozos alrededor de los huecos de las compuertas
function buildWallOccluders(plan) {
  for (const c of [...ROOM.wallOcc.children]) { ROOM.wallOcc.remove(c); c.geometry.dispose(); }
  if (!plan) return;
  // cada compuerta abre hueco en la pared que tiene detrás (también las colocadas a mano, si están pegadas a una)
  arena.updateMatrixWorld();
  const gw = plan.gates.filter(Boolean).map(g => { const y = g.rot + arena.rotation.y; return { p: arena.localToWorld(new V3(g.x, 0, g.z)), f: new V3(Math.sin(y), 0, Math.cos(y)) }; });
  ROOM.uw.forEach(w => {
    const len = w.a.distanceTo(w.b); if (len < 0.05) return;
    const u = _ro.subVectors(w.b, w.a).divideScalar(len).clone(), top = Math.max(w.y1, ROOM.ceilY || 0, 2.2), off = w.n.clone().multiplyScalar(-0.02);
    const holes = gw.filter(g => g.f.dot(w.n) > 0.7).map(g => {
      const t = (g.p.x - w.a.x) * u.x + (g.p.z - w.a.z) * u.z, dn = (g.p.x - w.a.x) * w.n.x + (g.p.z - w.a.z) * w.n.z;
      return dn > -0.1 && dn < 0.9 && t > -0.5 && t < len + 0.5 ? [t - 1.25 * plan.gs, t + 1.25 * plan.gs, 3.1 * plan.gs] : null;
    }).filter(Boolean).sort((a, b) => a[0] - b[0]);
    const quad = (s0, s1, y0, y1) => {
      if (s1 - s0 < 0.01 || y1 - y0 < 0.01) return;
      const p = (s, y) => { const v = w.a.clone().addScaledVector(u, s).add(off); v.y = y; return v; }, A = p(s0, y0), B = p(s1, y0), Cq = p(s1, y1), D = p(s0, y1);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([A.x, A.y, A.z, B.x, B.y, B.z, Cq.x, Cq.y, Cq.z, D.x, D.y, D.z], 3)); g.setIndex([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]);
      ROOM.wallOcc.add(occMesh(g, 'wall'));
    };
    let s = 0; for (const [h0, h1, hh] of holes) { quad(s, h0, 0, top); quad(h0, h1, hh, top); s = h1; }
    quad(s, len, 0, top);
  });
}

/* ---------- Colocada a mano: lo que pones tú, guardado respecto al sitio de juego ---------- */
// El sitio de juego (dónde te pones y hacia dónde miras) es un aparato más (EQ 'spot': ancla persistente, suelo del
// guardián y local-floor); compuertas, trampillas y marcador se guardan respecto a él, así siguen en su sitio de la
// habitación entre sesiones aunque cambie el origen.
const RSET_KEY = 'reparena3-roomset';
const RSET = { gs: 0.6, gates: [], hatches: [], board: null };
(function loadRoomSet() {
  const s = store(RSET_KEY) || {}, ok = o => o && [o.x, o.z].every(isFinite);
  if (isFinite(s.gs)) RSET.gs = clamp(s.gs, 0.4, 1);
  if (Array.isArray(s.gates)) RSET.gates = s.gates.filter(ok).slice(0, 3).map(o => ({ x: o.x, z: o.z, yaw: +o.yaw || 0 }));
  if (Array.isArray(s.hatches)) RSET.hatches = s.hatches.filter(ok).slice(0, 4).map(o => ({ x: o.x, z: o.z }));
  if (ok(s.board)) RSET.board = { x: s.board.x, z: s.board.z, yaw: +s.board.yaw || 0, wall: !!s.board.wall };
})();
const saveRoomSet = () => store(RSET_KEY, RSET);
const manualReady = () => eqPose('spot').set && (RSET.gates.length + RSET.hatches.length > 0 || !!RSET.board);
function manualPlan() {
  const S = eqPose('spot'); arena.updateMatrixWorld();
  const toArena = o => { const l = arena.worldToLocal(eqWorld(S, o.x, 0, o.z, new V3())); return { x: l.x, z: l.z, rot: (o.yaw || 0) + S.yaw - arena.rotation.y, ang: Math.atan2(l.x, -l.z) }; };
  const G = RSET.gates.map(toArena), gates = [null, null, null];
  if (G.length) { // la más de frente, en el centro (la del jefe); las demás, a su lado
    const mid = G.reduce((m, g) => (!m || Math.abs(g.ang) < Math.abs(m.ang) ? g : m), null); gates[1] = mid;
    for (const g of G) if (g !== mid) { const k = g.ang < mid.ang ? 0 : 2; gates[gates[k] ? 2 - k : k] = g; }
  }
  const R = ROOM.walls.length ? roomLocal() : { walls: [], feats: [], furn: [] };
  const front = gates[1] ? Math.max(2.5, Math.hypot(gates[1].x, gates[1].z)) : Infinity;
  return { manual: true, gs: RSET.gs, half: 1.85 * RSET.gs, gates, R, front, hatches: RSET.hatches.map(toArena), board: RSET.board ? Object.assign(toArena(RSET.board), { wall: RSET.board.wall }) : null };
}
function makeRoomPlan() { return roomMode() === 'manual' ? manualPlan() : scanPlan(); }

/* ---------- Colocar a mano, en las gafas ---------- */
// Pasos: sitio de juego → compuertas → trampillas → marcador. Lo que colocas sale donde miras al suelo (o donde apunta
// tu mano); «Colocar aquí» o pellizcar lo deja. Con la habitación escaneada, compuertas y marcador se pegan a la pared.
// Las trampillas y el marcador también se pueden poner solos.
const RPL = { on: false, step: 'spot', spot: null, gates: [], hatches: [], board: null, gs: 0.6, aim: new V3(), aimOk: false, pinch: { left: false, right: false }, back: null, drag: null, sel: null };
const rplGood = new THREE.MeshBasicMaterial({ color: 0x3cf0c6, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
const rplBad = new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
const rplDim = new THREE.MeshBasicMaterial({ color: 0x3cf0c6, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false });
function ghostOf(kind, mat) {
  const g = new THREE.Group(), box = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); };
  if (kind === 'gate') { for (const s of [-1, 1]) box(0.12, 3.4, 0.12, s * 1.5, 1.7, 0); box(3.2, 0.12, 0.12, 0, 3.4, 0); box(0.08, 0.02, 1.2, 0, 0.02, 0.6); box(0.5, 0.02, 0.08, 0, 0.02, 1.1); }
  else if (kind === 'hatch') { const r = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 24), mat); r.rotation.x = Math.PI / 2; r.position.y = 0.02; g.add(r); }
  else if (kind === 'board') { for (const s of [-1, 1]) { box(1.1, 0.03, 0.03, 0, 1.75 + s * 0.245, 0); box(0.03, 0.52, 0.03, s * 0.55, 1.75, 0); } }
  else { const r = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.03, 6, 32), mat); r.rotation.x = Math.PI / 2; r.position.y = 0.02; g.add(r); box(0.06, 0.02, 0.5, 0, 0.02, -0.55); box(0.3, 0.02, 0.06, 0, 0.02, -0.78); } // sitio de juego, con su flecha hacia delante
  return g;
}
const rplGroup = new THREE.Group(); rplGroup.visible = false; scene.add(rplGroup);
const rplGhost = {}; for (const k of ['gate', 'hatch', 'board', 'spot']) { rplGhost[k] = ghostOf(k, rplGood); rplGhost[k].visible = false; rplGroup.add(rplGhost[k]); }
const rplPlaced = new THREE.Group(); rplGroup.add(rplPlaced);
// En el menú principal (colocada a mano): el sitio de juego marcado en el suelo
const spotMark = ghostOf('spot', rplDim); spotMark.visible = false; scene.add(spotMark);
const setMat = (g, m) => g.traverse(o => { if (o.material) o.material = m; });
// Pegar a la pared escaneada más cercana que mire hacia el sitio de juego
function snapWall(p, depth) {
  let best = null, bd = 0.7;
  for (const w of ROOM.walls) {
    const ux = w.b.x - w.a.x, uz = w.b.z - w.a.z, L = Math.hypot(ux, uz); if (L < 0.1) continue;
    const t = clamp(((p.x - w.a.x) * ux + (p.z - w.a.z) * uz) / (L * L), 0, 1), cx = w.a.x + ux * t, cz = w.a.z + uz * t, d = Math.hypot(p.x - cx, p.z - cz);
    if (d < bd && w.n.x * (RPL.spot.x - cx) + w.n.z * (RPL.spot.z - cz) > 0) { bd = d; best = { x: cx + w.n.x * depth, z: cz + w.n.z * depth, yaw: Math.atan2(w.n.x, w.n.z) }; }
  }
  return best;
}
function rplPose(kind) {
  const p = RPL.aim, S = RPL.spot, toS = Math.atan2(S.x - p.x, S.z - p.z);
  const snap = kind === 'gate' ? snapWall(p, 0.45 * RPL.gs) : kind === 'board' ? snapWall(p, 0.03) : null;
  const pose = snap ? { x: snap.x, z: snap.z, yaw: snap.yaw, wall: true } : { x: p.x, z: p.z, yaw: toS, wall: false };
  const dp = Math.hypot(pose.x - S.x, pose.z - S.z); // ya pegado a la pared, si toca
  pose.ok = RPL.aimOk && (kind === 'gate' ? dp >= 0.8 && dp <= 8 : kind === 'hatch' ? dp >= 0.9 && dp <= 3.5 : dp >= 0.8 && dp <= 7);
  return pose;
}
function rplShowPlaced() {
  while (rplPlaced.children.length) rplPlaced.remove(rplPlaced.children[0]);
  const add = (k, o, sc = 1) => { const g = ghostOf(k, rplDim); g.position.set(o.x, 0, o.z); g.rotation.y = o.yaw || 0; g.scale.setScalar(sc); rplPlaced.add(g); };
  if (RPL.spot) add('spot', RPL.spot);
  RPL.gates.forEach(o => add('gate', o, RPL.gs)); RPL.hatches.forEach(o => add('hatch', o)); if (RPL.board) add('board', RPL.board);
}
// adjust: empieza con lo que ya hay (lo colocado a mano o, si no, lo que salió del escaneo) para solo arrastrar lo que esté mal
function startRoomPlace(back, adjust = false) {
  Object.assign(RPL, { on: true, step: 'spot', spot: null, gates: [], hatches: [], board: null, gs: ROOM.ceilY > 1.6 ? clamp((ROOM.ceilY - 0.1) / 4.4, 0.4, 0.72) : RSET.gs, back, aimOk: false, drag: null, sel: null });
  const S = eqPose('spot');
  if (adjust && S.set && (RSET.gates.length || RSET.hatches.length || RSET.board)) { // lo guardado, en el mundo
    const W = o => { const w = eqWorld(S, o.x, 0, o.z, new V3()); return { x: w.x, z: w.z, yaw: (o.yaw || 0) + S.yaw }; };
    Object.assign(RPL, { step: 'gates', spot: { x: S.x, z: S.z, yaw: S.yaw }, gs: RSET.gs, gates: RSET.gates.map(W), hatches: RSET.hatches.map(W), board: RSET.board ? Object.assign(W(RSET.board), { wall: RSET.board.wall }) : null });
  } else if (adjust && ROOM.plan && ROOM.plan.gates.some(Boolean)) { // lo del escaneo: compuertas, trampillas y marcador tal como están
    arena.updateMatrixWorld(); const ay = arena.rotation.y, W = (x, z, rot) => { const w = arena.localToWorld(new V3(x, 0, z)); return { x: w.x, z: w.z, yaw: (rot || 0) + ay }; };
    Object.assign(RPL, { step: 'gates', spot: { x: arena.position.x, z: arena.position.z, yaw: ay }, gs: ROOM.plan.gs,
      gates: ROOM.plan.gates.filter(Boolean).map(g => Object.assign(W(g.x, g.z, g.rot), { wall: true })), hatches: hatches.filter(h => h.on).map(h => W(h.x, h.z, 0)),
      board: ROOM.plan.board ? Object.assign(W(ROOM.plan.board.x, ROOM.plan.board.z, ROOM.plan.board.rot), { wall: ROOM.plan.board.wall !== false }) : null });
  }
  rplGroup.visible = true; rplShowPlaced(); SND.click(); roomPlaceMenu();
}
// Arrastrar: lo colocado más cercano a donde apuntas (si está a menos de 0,7 m)
function rplNearest(p) {
  let best = null, bd = 0.7;
  const tryOne = (list, i, kind) => { const o = i === null ? RPL.board : list[i], d = Math.hypot(o.x - p.x, o.z - p.z); if (d < bd) { bd = d; best = { list, i, kind }; } };
  RPL.gates.forEach((o, i) => tryOne(RPL.gates, i, 'gate')); RPL.hatches.forEach((o, i) => tryOne(RPL.hatches, i, 'hatch')); if (RPL.board) tryOne(null, null, 'board');
  return best;
}
const rplGet = r => r.i === null ? RPL.board : r.list[r.i];
function rplSet(r, pose) { if (r.i === null) RPL.board = pose; else r.list[r.i] = pose; }
function rplTurn(da) { const r = RPL.sel; if (!r) { SND.partial(); return; } const o = rplGet(r); o.yaw = (o.yaw || 0) + da; o.wall = false; rplShowPlaced(); SND.tick(); }
function endRoomPlace(save) {
  if (save && RPL.spot) {
    const S = eqPose('spot'); Object.assign(S, { x: RPL.spot.x, z: RPL.spot.z, yaw: RPL.spot.yaw }); S.anchor = null; equipChanged('spot'); equipCommit('spot');
    const L = o => { const l = eqLocal(S, new V3(o.x, 0, o.z), new V3()); return { x: l.x, z: l.z, yaw: (o.yaw || 0) - S.yaw }; };
    Object.assign(RSET, { gs: RPL.gs, gates: RPL.gates.map(L), hatches: RPL.hatches.map(o => { const l = L(o); return { x: l.x, z: l.z }; }), board: RPL.board ? Object.assign(L(RPL.board), { wall: RPL.board.wall }) : null });
    saveRoomSet(); settings.roomMode = 'manual'; saveSettings(); onSettingChanged('roomMode');
    say('Habitación colocada', '#3cf0c6', 1.4); SND.perfect();
  }
  RPL.on = false; rplGroup.visible = false; for (const k in rplGhost) rplGhost[k].visible = false;
  const back = RPL.back; RPL.back = null; if (back) back();
}
function rplPlace() {
  const S = RPL.step;
  if (S === 'spot') { RPL.spot = { x: head.p.x, z: head.p.z, yaw: bodyYaw() }; RPL.step = 'gates'; }
  else {
    const kind = S === 'gates' ? 'gate' : S === 'hatches' ? 'hatch' : 'board', pose = rplPose(kind); if (!pose.ok) { SND.partial(); return; }
    if (kind === 'gate') { RPL.gates.push(pose); if (RPL.gates.length >= 3) RPL.step = 'hatches'; }
    else if (kind === 'hatch') { RPL.hatches.push(pose); if (RPL.hatches.length >= 4) RPL.step = 'board'; }
    else { RPL.board = pose; endRoomPlace(true); return; }
  }
  SND.click(); rplShowPlaced(); roomPlaceMenu();
}
// Asistente en cuatro pasos, con el paso en curso arriba; en el mundo, la silueta de lo que colocas y un cartel encima
// que dice qué hacer (o por qué ahí no se puede)
const RPL_STEPS = ['spot', 'gates', 'hatches', 'board'], RPL_NAMES = { spot: 'Tu sitio', gates: 'Compuertas', hatches: 'Trampillas', board: 'Marcador' };
function rplNext() { const i = RPL_STEPS.indexOf(RPL.step); if (i >= RPL_STEPS.length - 1) { endRoomPlace(true); return; } RPL.step = RPL_STEPS[i + 1]; SND.click(); roomPlaceMenu(); }
// Las trampillas, solas: alrededor de tu sitio, como en la arena (por delante y a los lados)
function rplAutoHatches() {
  const S = RPL.spot, c = Math.cos(S.yaw), s = Math.sin(S.yaw);
  RPL.hatches = hatchPos.map(([x, z]) => ({ x: S.x + x * c + z * s, z: S.z - x * s + z * c, yaw: 0 }));
  rplShowPlaced(); SND.click(); rplNext();
}
// El marcador, solo: delante de la compuerta más centrada, mirándote
function rplAutoBoard() {
  const S = RPL.spot, f = { x: -Math.sin(S.yaw), z: -Math.cos(S.yaw) };
  let g = null, bd = -2; for (const o of RPL.gates) { const dx = o.x - S.x, dz = o.z - S.z, d = Math.hypot(dx, dz) || 1, a = (dx * f.x + dz * f.z) / d; if (a > bd) { bd = a; g = o; } }
  const p = g ? { x: g.x + (S.x - g.x) * 0.15, z: g.z + (S.z - g.z) * 0.15 } : { x: S.x + f.x * 3, z: S.z + f.z * 3 };
  RPL.board = { x: p.x, z: p.z, yaw: Math.atan2(S.x - p.x, S.z - p.z), wall: false, ok: true }; rplShowPlaced(); endRoomPlace(true);
}
function roomPlaceMenu() {
  const S = RPL.step, k = RPL_STEPS.indexOf(S), n = { gates: RPL.gates.length, hatches: RPL.hatches.length };
  const prog = RPL_STEPS.map((x, i) => (i < k ? '✓ ' : i === k ? '● ' : '○ ') + RPL_NAMES[x]).join('   ');
  const rows = [{ t: 'title', text: `COLOCAR A MANO · PASO ${k + 1} DE 4` }, { t: 'text', text: prog, color: '#3cf0c6' }];
  const aim = 'Mira al suelo donde la quieras (o apunta con la mano): verás su silueta verde y un cartel. Pellizca o pulsa «Colocar aquí».';
  if (S === 'spot') rows.push({ t: 'text', text: 'Así decides dónde está todo en tu habitación. Primero, ponte donde vas a hacer el ejercicio, mirando hacia donde quieres que salgan los enemigos, y pulsa «Aquí juego».' },
    { t: 'btns', items: [{ label: 'Aquí juego', style: 'primary', onPress: rplPlace }], h: 0.08 });
  else if (S === 'gates') rows.push({ t: 'text', text: `Compuertas, por donde salen los enemigos: pon de 1 a 3 (llevas ${n.gates}). ${aim}${ROOM.walls.length ? ' Cerca de una pared, se pega a ella.' : ''}` },
    { t: 'btns', items: [{ label: 'Colocar aquí', style: 'primary', onPress: rplPlace }, { label: 'Deshacer', onPress: () => { RPL.gates.pop(); rplShowPlaced(); roomPlaceMenu(); } }, { label: 'Más pequeña', onPress: () => { RPL.gs = clamp(RPL.gs - 0.04, 0.4, 1); rplShowPlaced(); } }, { label: 'Más grande', onPress: () => { RPL.gs = clamp(RPL.gs + 0.04, 0.4, 1); rplShowPlaced(); } }], h: 0.08 },
    { t: 'btns', items: [{ label: n.gates ? 'Siguiente: trampillas →' : 'Pon al menos una compuerta', style: n.gates ? 'primary' : undefined, onPress: () => { if (n.gates) rplNext(); else SND.partial(); } }] });
  else if (S === 'hatches') rows.push({ t: 'text', text: `Trampillas, de donde salen las arañas en flexiones y planchas (llevas ${n.hatches} de 4). Lo fácil: «Ponerlas solas», alrededor de tu sitio. O colócalas tú a 1–3,5 m, en suelo libre.` },
    { t: 'btns', items: [{ label: 'Ponerlas solas', style: 'primary', onPress: rplAutoHatches }, { label: 'Colocar aquí', onPress: rplPlace }, { label: 'Deshacer', onPress: () => { RPL.hatches.pop(); rplShowPlaced(); roomPlaceMenu(); } }], h: 0.08 },
    { t: 'btns', items: [{ label: 'Siguiente: marcador →', style: n.hatches ? 'primary' : undefined, onPress: rplNext }] });
  else rows.push({ t: 'text', text: `Marcador, el panel con tu puntuación. Lo fácil: «Junto a las compuertas». O colócalo tú donde quieras verlo.${ROOM.walls.length ? ' Cerca de una pared, se cuelga en ella.' : ''}` },
    { t: 'btns', items: [{ label: 'Junto a las compuertas', style: 'primary', onPress: rplAutoBoard }, { label: 'Colocar aquí', onPress: rplPlace }, { label: 'Sin marcador propio', onPress: () => endRoomPlace(true) }], h: 0.08 });
  if (S !== 'spot') rows.push({ t: 'text', text: 'Para mover algo ya puesto: apúntale, pellizca (o aprieta el gatillo) y arrástralo; suéltalo donde vaya.' + (RPL.sel ? ' Con lo último que moviste:' : ''), color: '#a49fc8' },
    { t: 'btns', items: [...(RPL.sel ? [{ label: '⟲ Girar', onPress: () => rplTurn(Math.PI / 12) }, { label: 'Girar ⟳', onPress: () => rplTurn(-Math.PI / 12) }] : []), { label: 'Guardar', style: 'primary', onPress: () => endRoomPlace(true) }, { label: 'Cancelar', style: 'danger', onPress: () => endRoomPlace(false) }] });
  else rows.push({ t: 'btns', items: [{ label: 'Cancelar', style: 'danger', onPress: () => endRoomPlace(false) }] });
  openMenu(rows);
}
// El cartel sobre la silueta: qué es y si se puede dejar ahí (y, si no, por qué)
const RPL_LAB = { p: makePanel(1.3, 0.3, 768, { depthTest: false }), text: '' }; RPL_LAB.p.mesh.renderOrder = 33; RPL_LAB.p.mesh.visible = false; rplGroup.add(RPL_LAB.p.mesh);
function rplLabel(text, ok, x, y, z) {
  const P = RPL_LAB.p, m = P.mesh; m.visible = !!text && !RPL.atMenu; if (!m.visible) return; // mirando al menú, no lo tapa
  if (text !== RPL_LAB.text) {
    const c = P.ctx, W = P.W, H = P.H, col = ok ? '#3cf0c6' : '#ff8a3d'; c.clearRect(0, 0, W, H);
    rr(c, 6, 6, W - 12, H - 12, 34); c.fillStyle = 'rgba(8,10,20,0.85)'; c.fill(); c.lineWidth = 8; c.strokeStyle = col; c.stroke();
    c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle'; let fs = 64; c.font = `${fs}px ${FD}`;
    while (fs > 26 && c.measureText(text).width > W - 60) { fs -= 4; c.font = `${fs}px ${FD}`; }
    c.fillText(text, W / 2, H / 2 + 4); P.tex.needsUpdate = true; RPL_LAB.text = text;
  }
  m.position.set(x, y, z); m.lookAt(head.p.x, y, head.p.z);
}
function rplWhy(kind, pose) {
  if (!RPL.aimOk) return 'Mira al suelo donde la quieras';
  const dp = Math.hypot(pose.x - RPL.spot.x, pose.z - RPL.spot.z), [lo, hi] = kind === 'gate' ? [0.8, 8] : kind === 'hatch' ? [0.9, 3.5] : [0.8, 7];
  return dp < lo ? `Muy cerca de tu sitio: a más de ${fmtNum(lo)} m` : dp > hi ? `Muy lejos: a menos de ${fmtNum(hi)} m` : '';
}
const _rpd = new V3();
function updateRoomPlace(dt) {
  // fuera de la colocación: el sitio de juego marcado en el suelo, para ponerse en él antes de empezar
  const S = eqPose('spot');
  spotMark.visible = !RPL.on && roomMode() === 'manual' && S.set && ['lobby', 'calib', 'ready'].includes(state);
  if (spotMark.visible) { spotMark.position.set(S.x, 0, S.z); spotMark.rotation.y = S.yaw; }
  if (!RPL.on) return;
  // dónde se apunta: la mano que apunta al suelo o, si no, la mirada; mirando al menú o tocándolo, se queda quieto
  let o = null, d = null;
  const atMenu = menu && menu.group && fwd().angleTo(_rpd.copy(menu.group.getWorldPosition(new V3())).sub(head.p)) < 0.35; RPL.atMenu = !!atMenu;
  for (const s of ['right', 'left']) { const h = hands[s]; if (h.rayOk && h.rayD.y < -0.15 && !(h.tipOk && menu && menu.group && h.tip.distanceTo(menu.group.getWorldPosition(_rpd)) < 0.3)) { o = h.rayO; d = h.rayD; break; } }
  if (!o && !atMenu) { const f = fwd(); if (f.y < -0.08) { o = head.p; d = f; } }
  if (o) { const t = -o.y / d.y; if (t > 0 && t < 12) { RPL.aim.set(o.x + d.x * t, 0, o.z + d.z * t); RPL.aimOk = true; } }
  // pellizcar (o el gatillo): sobre algo ya puesto, lo agarra y lo arrastra mientras sigas pellizcando; en otro sitio, coloca
  for (const s of ['left', 'right']) {
    const p = hands[s].pinch || hands[s].trig;
    if (p && !RPL.pinch[s] && RPL.step !== 'spot' && RPL.aimOk) { const r = rplNearest(RPL.aim); if (r) { RPL.drag = Object.assign(r, { side: s }); RPL.sel = r; SND.tick(); } else rplPlace(); }
    if (!p && RPL.pinch[s] && RPL.drag && RPL.drag.side === s) { RPL.drag = null; rplShowPlaced(); SND.click(); roomPlaceMenu(); } // ya se puede girar
    RPL.pinch[s] = p;
  }
  if (!RPL.on) return;
  if (RPL.drag && RPL.aimOk) { const r = RPL.drag, o = rplGet(r), pose = rplPose(r.kind); pose.yaw = pose.wall ? pose.yaw : (o.wall ? pose.yaw : o.yaw); rplSet(r, pose); rplShowPlaced(); for (const k in rplGhost) rplGhost[k].visible = false; rplLabel('Suelta para dejarla aquí', true, pose.x, 1.2, pose.z); return; }
  const kind = { gates: 'gate', hatches: 'hatch', board: 'board' }[RPL.step];
  for (const k in rplGhost) rplGhost[k].visible = false;
  if (RPL.step === 'spot') { const g = rplGhost.spot, y = bodyYaw(); g.visible = true; g.position.set(head.p.x, 0, head.p.z); g.rotation.y = y; rplLabel('Tu sitio · la flecha, hacia los enemigos', true, head.p.x - Math.sin(y) * 1.4, 0.9, head.p.z - Math.cos(y) * 1.4); return; }
  const g = rplGhost[kind], pose = rplPose(kind); g.visible = RPL.aimOk; g.position.set(pose.x, 0, pose.z); g.rotation.y = pose.yaw; g.scale.setScalar(kind === 'gate' ? RPL.gs : 1); setMat(g, pose.ok ? rplGood : rplBad);
  const why = rplWhy(kind, pose), name = kind === 'gate' ? `Compuerta ${RPL.gates.length + 1}` : kind === 'hatch' ? `Trampilla ${RPL.hatches.length + 1}` : 'Marcador';
  const ly = kind === 'gate' ? 3.4 * RPL.gs + 0.35 : kind === 'board' ? 2.25 : 0.55, at = RPL.aimOk ? pose : { x: head.p.x + fwdH().x * 2.2, z: head.p.z + fwdH().z * 2.2 };
  rplLabel(pose.ok ? `${name}: pellizca aquí` : why || 'Aquí no', pose.ok, at.x, RPL.aimOk ? ly : 0.5, at.z);
}

/* ---------- Cada fotograma: recolocar fuera de la partida si se movió la arena o cambió la habitación ---------- */
function roomStep(dt) {
  const on = roomOn(); ROOM.occl.visible = on && (!!settings.roomOcclude || !!settings.roomShow);
  if (!on) { if (ROOM.applied) { ROOM.applied = false; ROOM.plan = null; buildWallOccluders(null); layoutArena(); } return; }
  if (ROOM.applied && ['play', 'rest', 'paused'].includes(state)) return; // a mitad de partida no se mueven (pero sí se ponen al pasar a realidad mixta)
  ROOM.wait -= dt; if (ROOM.wait > 0) return;
  const a = arena.position, at = ROOM.at, moved = !at || Math.hypot(a.x - at.x, a.z - at.z) > 0.05 || Math.abs(wrapAng(arena.rotation.y - at.yaw)) > 0.03;
  if (!moved && ROOM.applied) return;
  ROOM.wait = 0.5; ROOM.at = { x: a.x, z: a.z, yaw: arena.rotation.y };
  // las paredes tapan siempre lo que queda detrás (si no cabe ninguna compuerta, las de siempre quedan detrás de la pared)
  roomFilter(); ROOM.plan = makeRoomPlan(); ROOM.applied = true; layoutArena(); buildFurnOccluders(); buildWallOccluders(ROOM.plan);
}
settingHooks.push(k => { if (k === 'roomShow' || k === '*') ROOM.occl.traverse(o => { if (o.isMesh) o.material = occlMatFor(o.userData.kind); }); });
settingHooks.push(k => { if (k === 'roomMode' || k === '*') { ROOM.applied = false; ROOM.plan = null; ROOM.at = null; ROOM.wait = 0; buildWallOccluders(null); layoutArena(); } });

/* ---------- En el menú principal: escala de habitación, si cumple los requisitos, colocar a mano y escanear ---------- */
function roomRows(back) {
  if (!xrActive || preview || !arMode) return [];
  const s = renderer.xr.getSession(), m = settings.roomMode, P = roomPlan(), n = P ? P.gates.filter(Boolean).length : 0;
  const rows = [{ t: 'field', key: 'roomMode', after: back }, ...(m !== 'off' ? [{ t: 'field', key: 'roomShow' }, { t: 'field', key: 'roomOcclude' }] : [])];
  const place = (label, style) => ({ label, style, onPress: () => startRoomPlace(back) }), adjust = label => ({ label, style: 'primary', onPress: () => startRoomPlace(back, true) });
  let txt, ok = false; const btns = [];
  if (m === 'off') txt = 'Disposición fija: las compuertas no se adaptan a tu habitación';
  else if (m === 'manual') {
    if (manualReady()) { ok = true; txt = `Colocada a mano: ${RSET.gates.length} ${RSET.gates.length === 1 ? 'compuerta' : 'compuertas'}, ${RSET.hatches.length} ${RSET.hatches.length === 1 ? 'trampilla' : 'trampillas'}${RSET.board ? ' y el marcador' : ''}. Ponte en el círculo del suelo para jugar`; btns.push(place('Recolocar')); }
    else { txt = 'Aún no has colocado nada: pon el sitio de juego, las compuertas, las trampillas y el marcador'; btns.push(place('Colocar a mano', 'primary')); }
  } else if (ROOM.featOff && !ROOM.walls.length) { txt = 'Para usar el escaneo, sal y vuelve a entrar en realidad mixta (al entrar estaba en «No»). O colócala a mano'; btns.push(place('Colocar a mano')); }
  else if (!ROOM.walls.length) { txt = 'Habitación sin escanear: escanéala para que las compuertas salgan de tus paredes, o colócala a mano'; btns.push(place('Colocar a mano')); }
  else if (!n) { txt = `La habitación no cumple los requisitos: ${P && P.why ? P.why : 'no cabe ninguna compuerta'}. Hace falta una pared libre de al menos ${fmtNum(2 * 1.85 * (P ? P.gs : 0.55) + 0.1)} m de ancho a 1,7–7,5 m delante de ti, con el camino despejado. Puedes colocarla a mano`; btns.push(place('Colocar a mano', 'primary')); }
  else { ok = true; txt = `Habitación: ${ROOM.walls.length} ${ROOM.walls.length === 1 ? 'pared' : 'paredes'}, ${ROOM.furn.length} ${ROOM.furn.length === 1 ? 'mueble' : 'muebles'} · ${n} ${n === 1 ? 'compuerta' : 'compuertas'} en tus paredes`; }
  if (m === 'manual' && manualReady()) btns.unshift(adjust('Ajustar (arrastrar)'));
  else if (m === 'scan' && ROOM.plan && ROOM.plan.gates.some(Boolean)) btns.unshift(adjust('Ajustar a mano'));
  // diagnóstico: lo que entrega el visor, para saber por qué el escaneo no coloca las compuertas
  const D = ROOM.diag; if (m !== 'off') rows.push({ t: 'text', text: !D ? 'Escaneo: aún sin datos del visor' : D.none ? 'Escaneo: el visor no entrega planos (¿sin permiso de «datos del espacio»? sal y vuelve a entrar y acéptalo)' : `Escaneo: ${D.planes} planos, ${D.meshes} mallas · ${D.labels.join(', ') || 'sin etiquetas'}`, color: '#a49fc8' });
  rows.push({ t: 'text', text: txt, color: ok ? '#3cf0c6' : m === 'off' ? '#a49fc8' : '#ffd166' });
  if (m === 'scan' && s && s.initiateRoomCapture) btns.push({ label: ROOM.walls.length ? 'Volver a escanear' : 'Escanear la habitación', onPress: () => { s.initiateRoomCapture().catch(() => {}).then(() => { ROOM.sig = ''; back(); }); } });
  if (btns.length) rows.push({ t: 'btns', items: btns });
  return rows;
}
