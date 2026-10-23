/* =================== ARCOS: COREOGRAFÍAS, FIEBRE, ORBES, AVANCE, OBSTÁCULOS NUEVOS Y METAS =================== */
// Para que los Arcos no aburran: en vez de salir al azar, llegan en pequeñas coreografías con su ritmo (escalera, ráfaga,
// zigzag, valla y arco…); con 10 seguidos sin fallo entra el modo fiebre (más deprisa, luces de neón y puntos ×2) hasta
// que te dan; entre arco y arco llegan orbes para recoger con la cabeza o las manos; el suelo y unas luces pasan a tu lado
// (sensación de avance); hay obstáculos nuevos (un láser que barre, dos paredes que se cierran y una rueda que gira) y
// metas: los metros recorridos, la carrera contra el fantasma de tu mejor ronda y una medalla al acabar.
const ARX = { streak: 0, fever: false, dist: 0, orbs: [], orbT: -1, got: 0, tl: [], tlT: 0, best: null, nextGap: 0 };
const ARX_GHOST = 'reparena3-arcghost';
// los obstáculos nuevos, por turnos (empezando por uno al azar): así salen los tres
const ARX_NEW = ['laser', 'walls', 'wheel']; let arxNewN = Math.floor(Math.random() * 3);
const arxNewKind = () => ARX_NEW[(arxNewN++) % 3];
const arxMul = () => ARX.fever ? 1.2 : 1; // la fiebre acelera lo que llega
const arxSpeed = () => dv('arcSpeed') / 3.6 * arxMul();
function arxReset() {
  ARX.orbs.forEach(o => o.dispose()); Object.assign(ARX, { streak: 0, fever: false, dist: 0, orbs: [], orbT: -1, got: 0, tl: [], tlT: 0, nextGap: 0, best: store(ARX_GHOST) });
  arxFeverLook(false);
}
// Bien pasado (sin que te dé): suma a la racha; con 10 seguidos, fiebre
function arxClean() {
  ARX.streak++;
  if (settings.arcFever && !ARX.fever && ARX.streak >= 10) { ARX.fever = true; arxFeverLook(true); say('¡MODO FIEBRE! Puntos ×2', '#ff4fa3', 1.8); SND.combo(); }
}
function arxHit() { if (ARX.fever) say('Fin de la fiebre', '#a49fc8', 1.2); ARX.streak = 0; ARX.fever = false; arxFeverLook(false); }

/* ---------- Coreografías ---------- */
// Cada pieza es una lista de obstáculos con su hueco hasta el siguiente (en veces el intervalo medio); se eligen según los
// porcentajes de Ajustes → Arcos (vallas, inclinados, dobles, obstáculos nuevos) y se encadenan hasta completar la oleada
function arxPatterns(total) {
  const lo = Math.min(dv('arcMin'), dv('arcMax')) / 100, hi = Math.max(dv('arcMin'), dv('arcMax')) / 100, mid = (lo + hi) / 2;
  const tiltA = () => rand(0.6, 1) * settings.arcTiltMax * Math.PI / 180, S = (drop, gap, extra = {}) => ({ kind: 'single', drop, tilt: 0, hp: 1, gap, ...extra });
  const pieces = [
    [1, () => [S(lo, 0.8), S(mid, 0.8), S(hi, 1.3)]], // escalera: cada vez más abajo
    [1, () => [S(hi, 0.8), S(mid, 0.8), S(lo, 1.3)]], // y al revés
    [0.8, () => { const d = rand(lo, hi); return [S(d, 0.55), S(d, 0.55), S(d, 1.4)]; }], // ráfaga: tres seguidos
    [0.6, () => [S(rand(lo, hi), 1.5)]], // un respiro
    [settings.arcTilt / 25, () => { const s = Math.random() < 0.5 ? 1 : -1; return [S(rand(lo, hi), 0.9, { tilt: s * tiltA() }), S(rand(lo, hi), 0.9, { tilt: -s * tiltA() }), S(rand(lo, hi), 1.3, { tilt: s * tiltA() })]; }], // zigzag
    [settings.arcJump / 25, () => [{ kind: 'jump', drop: 0, tilt: 0, hp: 1, gap: 0.7 }, S(hi, 1.3)]], // valla y, enseguida, un arco bajo
    [settings.arcDouble / 20, () => [S(rand(lo, hi), 1.4, { kind: 'double' })]],
    [settings.arcNew / 20, () => [{ kind: arxNewKind(), drop: rand(lo, hi), tilt: 0, hp: 1, gap: 1.3 }]]
  ].filter(p => p[0] > 0), sum = pieces.reduce((a, p) => a + p[0], 0), list = [];
  while (list.length < total) { let r = Math.random() * sum, P = pieces[0]; for (const p of pieces) if ((r -= p[0]) <= 0) { P = p; break; } list.push(...P[1]()); }
  const out = list.slice(0, total);
  // con los obstáculos nuevos activados, en cada oleada larga salen al menos los tres (en vez de arcos sueltos)
  if (settings.arcNew > 0 && total >= 9) for (let need = 3 - out.filter(o => ARX_NEW.includes(o.kind)).length, i = 0; need > 0 && i < 40; i++) {
    const k = Math.floor(Math.random() * out.length); if (out[k].kind === 'single' && !out[k].tilt) { out[k] = { kind: arxNewKind(), drop: out[k].drop, tilt: 0, hp: 1, gap: 1.3 }; need--; }
  }
  return out;
}

/* ---------- Obstáculos nuevos: láser que barre y paredes que se cierran ---------- */
// Llegan por la pista como los arcos y se mueven mientras llegan, hasta quedarse quietos justo al pasar por ti: el láser,
// cerca del centro (apártate al lado libre); las paredes, con el hueco a un lado (métete en él)
const LASER_MAT = new THREE.MeshBasicMaterial({ color: 0xffd0d0, toneMapped: false });
const wallMat = () => new THREE.MeshBasicMaterial({ map: TX.scan, color: 0xff2a40, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
class ArcObs {
  constructor(kind) {
    const D = arenaDepth(); Object.assign(this, { kind, alive: true, judged: false, second: false, checked: false, hit: false, jump: false, t: 0, warnT: 0, z: -D + 0.9, speed: arxSpeed() });
    this.tReach = Math.max(0.5, (HL.z - this.z) / this.speed); this.grp = new THREE.Group(); this.grp.position.z = this.z; arena.add(this.grp);
    if (kind === 'laser') {
      this.end = rand(-0.2, 0.2); this.amp = rand(0.6, 0.85); this.ph = rand(0, TAU); const safe = this.end > 0 ? -1 : 1;
      this.leanX = this.end + safe * 0.5; this.tilt = safe * 0.01; this.drop = 0.01; // el lado libre (para el marcador y la vista previa)
      this.mat = new THREE.MeshBasicMaterial({ map: TX.beam, color: 0xff2a14, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
      this.beam = new THREE.Group(); this.grp.add(this.beam);
      const core = new THREE.Mesh(G.cylRaw(0.012, 0.012, 2.5, 6), LASER_MAT); core.position.y = 1.25; this.beam.add(core);
      for (let i = 0; i < 2; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 2.5), this.mat); p.position.y = 1.25; p.rotation.y = i * Math.PI / 2; this.beam.add(p); }
      for (const y of [0.03, 2.5]) { const e = new THREE.Mesh(G.box(0.12, 0.06, 0.12), M.steel); tint(e.geometry, C.gun); e.position.y = y; this.beam.add(e); }
    } else {
      this.gx = (Math.random() < 0.5 ? -1 : 1) * rand(0.28, 0.45); this.gap = 0.62; this.leanX = this.gx; this.tilt = Math.sign(this.gx) * 0.01; this.drop = 0.01;
      this.walls = [-1, 1].map(s => { const g = new THREE.Group(), m = wallMat(), pl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.3), m); pl.position.set(s * 0.7, 1.15, 0); g.add(pl);
        const edge = new THREE.Mesh(G.box(0.05, 2.3, 0.05), LASER_MAT); edge.position.set(0, 1.15, 0); g.add(edge); g.userData.m = m; this.grp.add(g); return g; });
    }
    this.hum = humLoop(arena.localToWorld(new V3(0, 1.2, this.z)));
  }
  // lo que queda para que llegue: se mueve mucho al principio y se asienta en su sitio al pasar por ti
  settle() { const tau = Math.max(0, this.tReach - this.t); return tau * Math.min(1, tau / 1.2); }
  x() { return this.end + this.amp * Math.sin(this.ph + this.settle() * 2.2); }
  update(dt, t) {
    this.t += dt; this.z += this.speed * dt; this.grp.position.z = this.z;
    const hz = HL.z, inLane = Math.abs(HL.x) < 1.0, s = this.settle();
    if (this.kind === 'laser') this.beam.position.x = this.x();
    else { const half = this.gap / 2 + Math.min(0.9, s * 0.35); this.walls[0].position.x = this.gx - half; this.walls[1].position.x = this.gx + half; }
    const bad = this.kind === 'laser' ? Math.abs(HL.x - this.beam.position.x) < 0.28 : Math.abs(HL.x - this.gx) > this.gap / 2 - 0.06;
    const danger = !this.judged && this.z < hz && this.z > hz - 2.4 && bad;
    if (this.mat) this.mat.opacity = danger ? 1 : 0.7; else this.walls.forEach(w => { w.userData.m.opacity = danger ? 0.75 + 0.2 * Math.sin(t * 30) : 0.45; });
    if (danger && inLane) { this.warnT -= dt; if (this.warnT <= 0) { const d = hz - this.z; this.warnT = clamp(d * 0.18, 0.08, 0.4); SND.beep(1 + (2.4 - d) * 0.25); } }
    if (this.hum) this.hum.set(arena.localToWorld(tmpA.set(this.kind === 'laser' ? this.beam.position.x : this.gx, 1.2, this.z)));
    if (!this.judged && Math.abs(this.z - hz) < 0.15 && inLane) { this.checked = true; if (bad) this.hit = true; }
    if (!this.judged && this.z > hz + 0.15) { this.judged = true; this.resolve(); }
    if (this.z > hz + 3.5) { this.dispose(); this.alive = false; }
  }
  resolve() {
    if (!(state === 'play' || state === 'rest')) return;
    const hp = arena.localToWorld(tmpA.set(HL.x, HL.y, HL.z - 0.1));
    if (!this.checked) { say('Quédate en el carril', '#ff8a3d', 1.2); return; }
    if (this.hit) { fx.electric(hp, 24); SND.zap(hp); hurtPlayer({ silent: true }); arxHit(); say(this.kind === 'laser' ? `¡Apártate del láser, a la ${this.leanX > this.end ? 'derecha' : 'izquierda'}!` : '¡Métete en el hueco!', '#ff3b5c', 1.3); return; }
    SND.whoosh(hp, 'arc'); registerRep(true, false); arxClean(); say(this.kind === 'laser' ? '¡Esquivado!' : '¡Por el hueco!', '#3cf0c6', 0.9, true); SND.perfect();
  }
  dispose() {
    arena.remove(this.grp); if (this.mat) this.mat.dispose(); if (this.walls) this.walls.forEach(w => w.userData.m.dispose());
    this.grp.traverse(o => { if (o.geometry && o.geometry.type === 'PlaneGeometry') o.geometry.dispose(); }); if (this.hum) { this.hum.stop(); this.hum = null; }
  }
}

/* ---------- Orbes para recoger ---------- */
// Orbe: un cristal dorado que gira y late, con dos aros que se cruzan, un halo, chispitas que lo rondan y una estela
const orbGeo = new THREE.IcosahedronGeometry(0.075, 0), orbRingGeo = new THREE.TorusGeometry(0.135, 0.007, 6, 36);
const orbMat = std({ color: 0xfff0b8, emissive: 0xffb02a, emissiveIntensity: 0.95, metalness: 0.35, roughness: 0.06, flatShading: true, toneMapped: false });
const orbRingMat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const orbRing2Mat = orbRingMat.clone(); orbRing2Mat.color.setHex(0x7ff7e0);
function orbFeverLook(on) { orbMat.emissive.setHex(on ? 0xff3c9a : 0xffb02a); orbRingMat.color.setHex(on ? 0xff7fc4 : 0xffd166); }
class ArcOrb {
  constructor() {
    const D = arenaDepth(); this.pos = new V3(rand(-0.6, 0.6), clamp(calibRef + rand(-0.55, 0.08), 0.5, 2.1), -D + 0.9); this.speed = arxSpeed(); this.alive = true;
    this.grp = new THREE.Group(); this.gem = new THREE.Mesh(orbGeo, orbMat); this.grp.add(this.gem);
    this.ring = new THREE.Mesh(orbRingGeo, orbRingMat); this.ring2 = new THREE.Mesh(orbRingGeo, orbRing2Mat); this.ring2.scale.setScalar(0.82); this.grp.add(this.ring, this.ring2);
    this.glow = glowSprite(ARX.fever ? 0xff4fa3 : 0xffd166, 0.5, 0.85); this.grp.add(this.glow);
    this.motes = [0, 1, 2].map(() => { const m = glowSprite(0xffffff, 0.07, 1); this.grp.add(m); return m; });
    this.trailT = 0; this.ph = rand(0, TAU); this.grp.position.copy(this.pos); arena.add(this.grp);
  }
  update(dt, t) {
    this.pos.z += this.speed * dt; this.grp.position.copy(this.pos); this.grp.position.y += Math.sin(t * 3 + this.pos.x * 7) * 0.02;
    const tt = t + this.ph, beat = 1 + 0.14 * Math.pow(0.5 + 0.5 * Math.sin(tt * 6), 3);
    this.gem.rotation.set(tt * 1.3, tt * 2.1, 0); this.gem.scale.setScalar(beat); this.ring.rotation.set(tt * 2, tt * 3, 0); this.ring2.rotation.set(-tt * 2.6, 0, tt * 1.7);
    this.glow.material.opacity = 0.65 + 0.3 * Math.sin(tt * 9) * Math.sin(tt * 3.7); this.glow.scale.setScalar(0.5 * beat);
    this.motes.forEach((m, i) => { const a = tt * 3.2 + i * TAU / 3; m.position.set(Math.cos(a) * 0.17, Math.sin(a * 1.3) * 0.08, Math.sin(a) * 0.17); m.material.opacity = 0.6 + 0.4 * Math.sin(tt * 11 + i); });
    this.trailT -= dt; if (this.trailT <= 0) { this.trailT = 0.04; fx.trail(this.grp.getWorldPosition(_ao2), ARX.fever ? [1, 0.4, 0.75] : [1, 0.82, 0.35], 0.06, 0.45); } // estela de brillo
    // se recoge con la cabeza o con cualquier mano
    _ao.copy(HL); _ao.y -= 0.05; let got = this.grp.position.distanceTo(_ao) < 0.24;
    for (const s of ['left', 'right']) if (!got && hands[s].ok) { arena.worldToLocal(_ao.copy(hands[s].wrist)); if (_ao.distanceTo(this.grp.position) < 0.17) got = true; }
    if (got && state === 'play') {
      const c = this.grp.getWorldPosition(new V3()), pts = 100 * (ARX.fever ? 2 : 1); score += pts; ARX.got++; boardDirty = true;
      // al cogerlo: destello, un estallido de chispas doradas y turquesa, estrellitas que suben y campanitas de cristal
      SND.orb(c); fx.glow(c, [1, 0.95, 0.75], 1.0, 0.2); fx.glow(c, ARX.fever ? [1, 0.3, 0.7] : [1, 0.75, 0.25], 0.6, 0.4, 0.7);
      fx.sparks(c, 36, ARX.fever ? [1, 0.35, 0.75] : [1, 0.8, 0.3], 2.8, 0.035); fx.sparks(c, 18, [0.45, 1, 0.9], 2.1, 0.03);
      for (let i = 0; i < 14; i++) PADD.add({ pos: c.clone().add(rv(0.06)), v: rv(0.7).add(new V3(0, rand(0.5, 1.2), 0)), life: rand(0.7, 1.2), c0: [1, 1, 1], c1: [1, 0.85, 0.4], s0: rand(0.04, 0.07), s1: 0.008, tile: 3, drag: 1.5, fin: 0.01 });
      hapticBoth(0.3, 40);
      say(`+${pts} · ¡ORBE!`, '#ffd166', 0.9, false); this.dispose(); return;
    }
    if (this.pos.z > HL.z + 1.5) this.dispose();
  }
  dispose() { this.alive = false; arena.remove(this.grp); this.glow.material.dispose(); this.motes.forEach(m => m.material.dispose()); }
}
const _ao = new V3(), _ao2 = new V3();

/* ---------- Sensación de avance: rayas en la pista y farolas que pasan a tu lado ---------- */
const ARX_DECO = new THREE.Group(); ARX_DECO.visible = false; arena.add(ARX_DECO);
const dashMat = new THREE.MeshBasicMaterial({ color: 0x3cf0c6, toneMapped: false, transparent: true, opacity: 0.7 }), postTopMat = new THREE.MeshBasicMaterial({ color: 0x3cf0c6, toneMapped: false });
const ARX_DASH = [], ARX_POST = [], DASH_GAP = 1.4, POST_GAP = 4;
for (let i = 0; i < 14; i++) for (const s of [-1, 1]) { const m = new THREE.Mesh(G.box(0.05, 0.008, 0.55), dashMat); m.position.set(s * 0.95, 0.01, 0); ARX_DECO.add(m); ARX_DASH.push(m); }
for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {
  const g = new THREE.Group(), p = new THREE.Mesh(G.cyl(0.025, 0.035, 1.7, 8), M.steel); tint(p.geometry, C.gun); p.position.y = 0.85; g.add(p);
  const top = new THREE.Mesh(G.box(0.16, 0.05, 0.08), postTopMat); top.position.set(-s * 0.05, 1.7, 0); g.add(top); g.position.set(s * 1.55, 0, 0); ARX_DECO.add(g); ARX_POST.push(g);
}
let arxScroll = 0;
function arxFeverLook(on) { const c = on ? 0xff4fa3 : 0x3cf0c6; dashMat.color.setHex(c); postTopMat.color.setHex(c); orbFeverLook(on); }
function arxDeco(dt, t) {
  const on = settings.mode === 'arcs' && !!settings.arcMove && !isFloor() && ['ready', 'play', 'rest'].includes(state); ARX_DECO.visible = on; if (!on) return;
  if (state === 'play') arxScroll += arxSpeed() * dt;
  const D = arenaDepth(), z0 = -D + 0.5, span = D + 3;
  ARX_DASH.forEach((m, i) => { m.position.z = z0 + ((Math.floor(i / 2) * DASH_GAP + arxScroll) % span); });
  ARX_POST.forEach((g, i) => { g.position.z = z0 + ((Math.floor(i / 2) * POST_GAP + arxScroll) % span); });
  if (ARX.fever) { const k = 0.6 + 0.4 * Math.sin(t * 10); dashMat.opacity = k; }
  else dashMat.opacity = 0.7;
}

/* ---------- Cada fotograma, metas y fantasma ---------- */
function arxStep(dt, t) {
  arxDeco(dt, t);
  if (settings.mode !== 'arcs') return;
  if (ARX.orbT > 0 && state === 'play') { ARX.orbT -= dt; if (ARX.orbT <= 0) ARX.orbs.push(new ArcOrb()); }
  for (const o of ARX.orbs) if (o.alive) o.update(dt, t); ARX.orbs = ARX.orbs.filter(o => o.alive);
  if (state !== 'play') return;
  ARX.dist += arxSpeed() * dt; ARX.tlT += dt;
  if (ARX.tlT >= 2) { ARX.tlT -= 2; ARX.tl.push(score); if ((ARX.tl.length & 3) === 0) boardDirty = true; }
}
// El fantasma: tus puntos de entonces en tu mejor ronda (cada 2 s) frente a los de ahora
function arxGhostDiff() {
  const B = ARX.best; if (!B || !B.tl || !B.tl.length) return null;
  const i = Math.min(B.tl.length - 1, ARX.tl.length), g = i < 0 ? 0 : B.tl[i] || 0; return score - g;
}
// Al acabar: medalla por los que pasaste sin que te dieran y, si fue tu mejor ronda, se guarda como fantasma
function arxEnd() {
  const n = stats.reps + stats.taken, k = n ? stats.reps / n : 0, medal = !n ? null : k >= 0.95 ? ['oro', '#ffd166'] : k >= 0.8 ? ['plata', '#d8dce6'] : k >= 0.6 ? ['bronce', '#e0975a'] : null;
  const prev = ARX.best, rec = !prev || score > (prev.score || 0), farther = !prev || ARX.dist > (prev.dist || 0);
  if (rec && stats.reps) store(ARX_GHOST, { score, dist: Math.round(ARX.dist), tl: ARX.tl.concat(score).slice(0, 600) });
  return { medal, dist: Math.round(ARX.dist), orbs: ARX.got, rec: rec && !!prev && stats.reps > 0, farther: farther && !!prev && ARX.dist > 0 };
}
