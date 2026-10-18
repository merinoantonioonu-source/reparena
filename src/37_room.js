
/* =================== HABITACIÓN (realidad mixta) =================== */
// En realidad mixta las Quest 3 saben dónde están tus paredes y tus muebles (lo que escaneaste en la configuración
// del espacio; en WebXR, plane-detection y mesh-detection). Con eso:
//  · las compuertas se abren en tus paredes, donde el camino hasta ti está libre de muebles y de otras paredes;
//  · el marcador se cuelga en una pared, y las trampillas de las arañas salen en suelo libre;
//  · los robots no eligen su puesto de ataque dentro de un mueble;
//  · las paredes y los muebles tapan lo que pasa por detrás (con un hueco en cada compuerta, por el que se ve el túnel).
// Sin escaneo, en VR o con el ajuste apagado, todo sigue como siempre.
const ROOM = { walls: [], furn: [], feats: [], ceilY: 0, sig: '', refs: new WeakSet(), plan: null, applied: false, at: null, wait: 0, occl: new THREE.Group(), wallOcc: new THREE.Group() };
ROOM.occl.add(ROOM.wallOcc); ROOM.occl.visible = false; scene.add(ROOM.occl);
const roomOn = () => arMode && !!settings.room && ROOM.walls.length > 0 && !forestOn();
const roomPlan = () => roomOn() && ROOM.applied ? ROOM.plan : null;
// solo escribe profundidad: lo virtual que queda detrás de una pared o un mueble real no se ve
const occMat = new THREE.MeshBasicMaterial({ colorWrite: false });
const _ro = new V3(), _rn2 = new V3(), _rq4 = new Q4(), _roM = new THREE.Matrix4(), _r1 = new V3(1, 1, 1);
const roomLabel = o => String(o.semanticLabel || '').toLowerCase().replace(/[\s-]+/g, '_');
const WALL_FEATS = ['door_frame', 'door', 'window_frame', 'window', 'wall_art', 'screen'];
const NOT_FURN = ['global_mesh', 'floor', 'ceiling', 'wall', 'invisible_wall_face', 'inner_wall_face', ...WALL_FEATS];
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

/* ---------- Leer el escaneo (cada fotograma, pero solo se rehace si algo cambió) ---------- */
function roomFrame(frame, ref) {
  const planes = frame.detectedPlanes, meshes = frame.detectedMeshes; if (!planes && !meshes) return;
  // al recentrar, las poses cambian: se vuelve a leer todo
  if (!ROOM.refs.has(ref)) { ROOM.refs.add(ref); if (ref.addEventListener) ref.addEventListener('reset', () => { ROOM.sig = ''; }); }
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
      if (L === 'wall' || (!L && s1 - s0 > 1.2 && y1 - y0 > 1.8)) walls.push(w); else if (WALL_FEATS.includes(L)) feats.push(w);
      return;
    }
    // horizontal y ni suelo ni techo: la tapa de un mueble apoyado en el suelo (mesa, sofá, cama...)
    if (y0 > 0.05 && y0 < 2.2 && !NOT_FURN.includes(L)) furn.push({ poly: hull2(pts), y0: 0, y1, label: L });
  });
  if (meshes) meshes.forEach(me => {
    const L = roomLabel(me); if (NOT_FURN.includes(L) || !me.vertices || me.vertices.length < 9) return;
    const M = poseMatrix(frame, me.meshSpace, ref); if (!M) return;
    const v = me.vertices, pts = []; let y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i + 2 < v.length; i += 3) { const q = new V3(v[i], v[i + 1], v[i + 2]).applyMatrix4(M); pts.push(q); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    if (y1 < 0.05 || y0 > 2.2) return; // lo que cuelga del techo no estorba
    furn.push({ poly: hull2(pts), y0: Math.max(0, y0), y1, label: L, mesh: { v: Float32Array.from(v), idx: me.indices ? Array.from(me.indices) : null, M: M.clone() } });
  });
  Object.assign(ROOM, { walls, furn, feats, ceilY: ceil, applied: false, plan: null });
  buildFurnOccluders();
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
  return { walls: ROOM.walls.map(wall), feats: ROOM.feats.map(wall), furn: ROOM.furn.map(f => f.poly.map(([x, z]) => { const p = toL(_ro.set(x, 0, z)); return [p.x, p.z]; })) };
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
function wallSpots(R, half, depth, minD, maxD, maxAng, path) {
  const out = [];
  R.walls.forEach((W, wi) => {
    if (W.len < 2 * half + 0.1) return;
    const ux = (W.b.x - W.a.x) / W.len, uz = (W.b.z - W.a.z) / W.len, n = W.n;
    for (let t = half + 0.05; t <= W.len - half - 0.05 + 1e-6; t += 0.2) {
      const px = W.a.x + ux * t, pz = W.a.z + uz * t, x = px + n.x * depth, z = pz + n.z * depth, d = Math.hypot(x, z);
      if (d < minD || d > maxD) continue;
      const face = -(n.x * x + n.z * z) / d, ang = Math.atan2(x, -z); if (face < 0.4 || Math.abs(ang) > maxAng) continue;
      if (R.feats.some(F => ptSeg(px, pz, F.a.x, F.a.z, F.b.x, F.b.z) < half && Math.abs(F.n.x * n.x + F.n.z * n.z) > 0.8)) continue; // ni puertas ni ventanas
      // las esquinas de lo que se cuelga, despejadas de muebles
      let ok = true; for (const s of [-1, 1]) for (const f of [0.05, depth * 2 + 0.3]) { const cx = px + ux * s * half + n.x * f, cz = pz + uz * s * half + n.z * f; if (R.furn.some(P => P.length >= 3 && segPoly(cx, cz, cx, cz, P) < 0.05)) ok = false; }
      if (!ok || (path && !roomClear(R, x + n.x * path, z + n.z * path, x * 0.7 / d, z * 0.7 / d, 0.35, wi))) continue;
      out.push({ x, z, px, pz, rot: Math.atan2(n.x, n.z), ang, d, wi, t, score: Math.cos(ang) * 2 + face - Math.abs(d - 3.2) * 0.25 });
    }
  });
  return out;
}
// Dónde van las compuertas (hasta tres: centro, izquierda y derecha), el marcador y lo lejos que está la pared de delante
function makeRoomPlan() {
  const R = roomLocal(); if (!R.walls.length) return null;
  const H = Math.min(ROOM.ceilY > 1.6 ? ROOM.ceilY : 9, Math.max(...ROOM.walls.map(w => w.y1)));
  const gs = clamp((H - 0.1) / 4.4, 0.4, 0.72), half = 1.85 * gs; // la compuerta, con su baliza, cabe bajo el techo
  const C = wallSpots(R, half, 0.45 * gs, 1.7, 7.5, 1.3, 0.9 * gs);
  let front = Infinity; for (const w of R.walls) { const den = w.b.x - w.a.x; if (Math.abs(den) < 1e-9) continue; const t = -w.a.x / den; if (t < 0 || t > 1) continue; const z = w.a.z + (w.b.z - w.a.z) * t; if (z < 0) front = Math.min(front, -z); }
  const plan = { gs, half, gates: [null, null, null], board: null, front, R };
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
function occMesh(g) { const m = new THREE.Mesh(g, occMat); m.renderOrder = -2; m.frustumCulled = false; return m; }
function buildFurnOccluders() {
  clearOccl(ROOM.occl);
  for (const f of ROOM.furn) {
    let g;
    if (f.mesh && f.mesh.idx && f.mesh.idx.length >= 3) { g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(Array.from(f.mesh.v), 3)); g.setIndex(f.mesh.idx); g.applyMatrix4(f.mesh.M); }
    else if (f.poly.length >= 3) g = prismGeo(f.poly, f.y0, f.y1);
    if (g) ROOM.occl.add(occMesh(g));
  }
}
// Cada pared, un poco por detrás de su superficie, partida en trozos alrededor de los huecos de las compuertas
function buildWallOccluders(plan) {
  for (const c of [...ROOM.wallOcc.children]) { ROOM.wallOcc.remove(c); c.geometry.dispose(); }
  if (!plan) return;
  ROOM.walls.forEach((w, wi) => {
    const len = w.a.distanceTo(w.b); if (len < 0.05) return;
    const u = _ro.subVectors(w.b, w.a).divideScalar(len).clone(), top = Math.max(w.y1, ROOM.ceilY || 0, 2.2), off = w.n.clone().multiplyScalar(-0.02);
    const holes = plan.gates.filter(g => g && g.wi === wi).map(g => [g.t - 1.25 * plan.gs, g.t + 1.25 * plan.gs, 3.1 * plan.gs]).sort((a, b) => a[0] - b[0]);
    const quad = (s0, s1, y0, y1) => {
      if (s1 - s0 < 0.01 || y1 - y0 < 0.01) return;
      const p = (s, y) => { const v = w.a.clone().addScaledVector(u, s).add(off); v.y = y; return v; }, A = p(s0, y0), B = p(s1, y0), Cq = p(s1, y1), D = p(s0, y1);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([A.x, A.y, A.z, B.x, B.y, B.z, Cq.x, Cq.y, Cq.z, D.x, D.y, D.z], 3)); g.setIndex([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]);
      ROOM.wallOcc.add(occMesh(g));
    };
    let s = 0; for (const [h0, h1, hh] of holes) { quad(s, h0, 0, top); quad(h0, h1, hh, top); s = h1; }
    quad(s, len, 0, top);
  });
}

/* ---------- Cada fotograma: recolocar fuera de la partida si se movió la arena o llegó el escaneo ---------- */
function roomStep(dt) {
  const on = roomOn(); ROOM.occl.visible = on;
  if (!on) { if (ROOM.applied) { ROOM.applied = false; ROOM.plan = null; layoutArena(); } return; }
  if (ROOM.applied && ['play', 'rest', 'paused'].includes(state)) return; // a mitad de partida no se mueven (pero sí se ponen al pasar a realidad mixta)
  ROOM.wait -= dt; if (ROOM.wait > 0) return;
  const a = arena.position, at = ROOM.at, moved = !at || Math.hypot(a.x - at.x, a.z - at.z) > 0.05 || Math.abs(wrapAng(arena.rotation.y - at.yaw)) > 0.03;
  if (!moved && ROOM.applied) return;
  ROOM.wait = 0.5; ROOM.at = { x: a.x, z: a.z, yaw: arena.rotation.y };
  ROOM.plan = makeRoomPlan(); ROOM.applied = true; layoutArena(); buildWallOccluders(ROOM.plan && ROOM.plan.gates.some(Boolean) ? ROOM.plan : null);
}
settingHooks.push(k => { if (k === 'room' || k === '*') { ROOM.applied = false; ROOM.plan = null; ROOM.at = null; ROOM.wait = 0; buildWallOccluders(null); layoutArena(); } });

/* ---------- En el menú: cómo va el escaneo y botón para escanear (si las gafas lo permiten) ---------- */
function roomRows(back) {
  if (!xrActive || preview || !arMode) return [];
  const s = renderer.xr.getSession(), P = roomPlan(), n = P ? P.gates.filter(Boolean).length : 0;
  const txt = !settings.room ? 'Habitación: sin adaptar (Ajustes → Sistema)' : !ROOM.walls.length ? 'Habitación: sin escanear. Escanéala para que las compuertas salgan de tus paredes' : `Habitación: ${ROOM.walls.length} ${ROOM.walls.length === 1 ? 'pared' : 'paredes'}, ${ROOM.furn.length} ${ROOM.furn.length === 1 ? 'mueble' : 'muebles'} · ${n ? `${n} ${n === 1 ? 'compuerta' : 'compuertas'} en tus paredes` : 'no caben compuertas en tus paredes: deja más espacio delante'}`;
  const rows = [{ t: 'text', text: txt, color: settings.room && ROOM.walls.length && n ? '#3cf0c6' : '#ffd166' }];
  if (settings.room && s && s.initiateRoomCapture) rows.push({ t: 'btns', items: [{ label: ROOM.walls.length ? 'Volver a escanear la habitación' : 'Escanear la habitación', onPress: () => { s.initiateRoomCapture().catch(() => {}).then(() => { ROOM.sig = ''; back(); }); } }] });
  return rows;
}
