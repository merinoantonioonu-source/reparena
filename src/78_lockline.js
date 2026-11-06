/* =================== DIANA: EL ENEMIGO APUNTADO =================== */
// Al enemigo al que apuntas le salen líneas de enfoque del manga: un anillo de rayas cortas a su alrededor, que se ajusta
// a su postura (si levanta los brazos o se agacha), gira despacio y corre hacia fuera, como las líneas de velocidad. Son
// tiras planas de cara a ti: las dianas pegadas a la silueta (con stencil y copias de la figura) dejaban en las gafas
// planos de basura blancos y azules pegados a la vista, y se quitaron. Solo se dibuja en el que apuntas
const LKL = { has: new Set(), on: new Set(), t: 0 };
// El marco del enemigo, visto desde ti: sale de sus huesos (si está animado) y de las esquinas de sus piezas rígidas visibles
function lklPts(e) {
  if (e.lkP) return e.lkP; const P = e.lkP = { bones: [], rigid: [] };
  e.root.traverse(o => {
    if (o.isBone) { if (!/ik|pole|target|ctrl|root/i.test(o.name || '')) P.bones.push(o); return; }
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.userData.isLockLine || o.userData.isOutline || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
    const g = o.geometry; if (!g.lkBox) { const p = g.attributes.position, lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < p.count; i++) { const a = [p.getX(i), p.getY(i), p.getZ(i)]; for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a[k]); hi[k] = Math.max(hi[k], a[k]); } } g.lkBox = [lo, hi]; }
    P.rigid.push(o);
  });
  return P;
}
const _lkc = new V3(), _lkv = new V3(), _lkr = new V3();
const lklSeen = (o, root) => { for (let x = o; x && x !== root; x = x.parent) if (!x.visible) return false; return true; };
// el marco del enemigo visto desde ti (suavizado): coloca g en su centro, de cara a ti, y devuelve medio ancho y medio alto
function lklFrame(e, g, dt) {
  const U = g.userData, P = lklPts(e), c = e.center(_lkc); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  _lkr.set(head.p.z - c.z, 0, c.x - head.p.x).normalize(); // (la derecha, vista desde ti)
  const add = v => { const x = (v.x - c.x) * _lkr.x + (v.z - c.z) * _lkr.z, y = v.y - c.y; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  for (const b of P.bones) add(b.getWorldPosition(_lkv));
  for (const o of P.rigid) { if (!lklSeen(o, e.root)) continue; const [lo, hi] = o.geometry.lkBox; for (let k = 0; k < 8; k++) add(o.localToWorld(_lkv.set(k & 1 ? hi[0] : lo[0], k & 2 ? hi[1] : lo[1], k & 4 ? hi[2] : lo[2]))); }
  if (x0 > x1) { x0 = -0.3; x1 = 0.3; y0 = -0.5; y1 = 0.5; }
  const H = y1 - y0, mx = P.bones.length ? 0.12 + 0.18 * H : 0.06, my = P.bones.length ? 0.1 + 0.1 * H : 0.06; x0 -= mx; x1 += mx; y0 -= my; y1 += my; // (los huesos van por dentro: la cabeza y las manos sobresalen)
  if (U.t < 0) { U.t = 0; U.r = [x0, x1, y0, y1]; } U.t += dt; const t = U.t, R = U.r, a = Math.min(1, dt * 10);
  [x0, x1, y0, y1].forEach((v, i) => { R[i] += (v - R[i]) * a; });
  g.position.copy(c).addScaledVector(_lkr, (R[0] + R[1]) / 2); g.position.y += (R[2] + R[3]) / 2; g.lookAt(head.p.x, g.position.y, head.p.z);
  return { hw: (R[1] - R[0]) / 2, hh: (R[3] - R[2]) / 2, t };
}
/* ---------- Líneas de enfoque: rayas cortas alrededor del enemigo que giran y corren hacia fuera ---------- */
// Cada raya sale del borde de su marco (una elipse algo mayor que su figura), corre hacia fuera mientras crece y mengua, y
// vuelve a empezar; todas giran despacio. Una tira plana roja de puntas finas, de cara a ti (sin stencil ni copias)
const LKL_RAYS = 26;
function lklRayTex() {
  if (LKL.ray) return LKL.ray;
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 16; const c = cv.getContext('2d');
  c.fillStyle = '#ff3a2e'; c.beginPath(); c.moveTo(0, 6); c.lineTo(120, 0); c.quadraticCurveTo(128, 8, 120, 16); c.lineTo(0, 10); c.closePath(); c.fill(); // (en punta por dentro, gruesa por fuera)
  c.fillStyle = '#ffd0c4'; c.beginPath(); c.moveTo(20, 7.5); c.lineTo(112, 5); c.quadraticCurveTo(117, 8, 112, 11); c.lineTo(20, 8.5); c.closePath(); c.fill(); // (con el centro claro: se ve sobre cualquier fondo)
  return (LKL.ray = new THREE.CanvasTexture(cv));
}
function lklRays(e) {
  const g = new THREE.Group(); LKL.rayMat = LKL.rayMat || new THREE.MeshBasicMaterial({ map: lklRayTex(), transparent: true, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide });
  LKL.rayGeo = LKL.rayGeo || new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0); // (desde su punta de dentro)
  for (let i = 0; i < LKL_RAYS; i++) { const q = new THREE.Mesh(LKL.rayGeo, LKL.rayMat); q.renderOrder = 45; q.raycast = () => {}; q.userData = { a: (i + Math.random() * 0.5) / LKL_RAYS * TAU, ph: Math.random(), sp: 0.7 + Math.random() * 0.6, isLockLine: true }; g.add(q); }
  g.visible = false; g.userData.isLockLine = true; g.userData.t = -1; scene.add(g); return g;
}
function lklRayStep(e, g, dt) {
  // más grandes y gruesas que antes (en los voladores pequeños, avispones y drones, apenas se veían): un marco de al menos
  // 32 cm, rayas de 12 a 30 cm, y ondulan: el anillo gira y respira, y cada raya cabecea y va y viene a su ritmo
  const F = lklFrame(e, g, dt), hw = Math.max(0.32, F.hw), hh = Math.max(0.32, F.hh), t = F.t, L = clamp(Math.min(hw, hh) * 0.6, 0.12, 0.3), W = Math.max(0.035, L * 0.4), spin = t * 0.6, br = 1 + 0.06 * Math.sin(t * 3.2);
  for (const q of g.children) {
    const U = q.userData, k = (t * 0.9 * U.sp + U.ph) % 1, a = U.a + spin + 0.16 * Math.sin(t * 2.6 + U.a * 3), ca = Math.cos(a), sa = Math.sin(a), out = br * (1.0 + 0.4 * k) + 0.05 * Math.sin(t * 5 + U.a * 5), len = L * Math.sin(Math.PI * k) + 0.001;
    q.position.set(ca * hw * out, sa * hh * out, 0); q.rotation.z = Math.atan2(sa * hh, ca * hw) + 0.22 * Math.sin(t * 6 + U.ph * TAU); q.scale.set(len, W * (0.8 + 0.4 * Math.sin(Math.PI * k)), 1);
  }
}
// Desde updateAim: este enemigo está apuntado
function lockShow(e) { if (e && e.alive && e.root) LKL.on.add(e); }
// Al final de updateAim: enseña la diana de los apuntados y la quita a los demás
function lockStep(t) {
  const dt = clamp(t - (LKL.t || t), 0, 0.1); LKL.t = t;
  for (const e of LKL.on) { if (!e.lkl) e.lkl = [lklRays(e)]; LKL.has.add(e); }
  for (const e of LKL.has) {
    const on = LKL.on.has(e) && e.alive && !!e.root.parent, g = e.lkl[0];
    if (g.visible !== on) g.visible = on;
    if (on) lklRayStep(e, g, dt); else g.userData.t = -1;
    if (!on && (!e.alive || !e.root.parent)) { scene.remove(g); e.lkl = null; LKL.has.delete(e); }
  }
  LKL.on.clear();
}
