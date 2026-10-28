/* =================== ARCOS: COREOGRAFÍAS, FIEBRE, ORBES, AVANCE, OBSTÁCULOS NUEVOS Y METAS =================== */
// Para que los Arcos no aburran: en vez de salir al azar, llegan en pequeñas coreografías con su ritmo (escalera, ráfaga,
// zigzag, valla y arco…); con 10 seguidos sin fallo entra el modo fiebre (más deprisa, luces de neón y puntos ×2) hasta
// que te dan; entre arco y arco llegan orbes para recoger con la cabeza o las manos; el suelo y unas luces pasan a tu lado
// (sensación de avance); hay obstáculos nuevos (un láser que barre, dos paredes que se cierran y una rueda que gira) y
// metas: los metros recorridos, la carrera contra el fantasma de tu mejor ronda y una medalla al acabar.
const ARX = { streak: 0, fever: false, feverN: 0, dist: 0, orbs: [], orbT: -1, got: 0, tl: [], tlT: 0, best: null, nextGap: 0 };
const ARX_GHOST = 'reparena3-arcghost';
// los obstáculos nuevos, por turnos (empezando por uno al azar): así salen los tres
const ARX_NEW = ['laser', 'walls', 'wheel']; let arxNewN = Math.floor(Math.random() * 3);
const arxNewKind = () => ARX_NEW[(arxNewN++) % 3];
// la fiebre acelera lo que llega: la primera, un 20 %; cada una de las siguientes de la ronda, «Fiebre +» más (hasta el doble)
const arxMul = () => ARX.fever ? Math.min(2, 1.2 + (settings.arcFeverUp >= 0 ? settings.arcFeverUp : 10) / 100 * (ARX.feverN - 1)) : 1;
const arxSpeed = () => dv('arcSpeed') / 3.6 * arxMul();
function arxReset() {
  ARX.orbs.forEach(o => o.dispose()); Object.assign(ARX, { streak: 0, fever: false, feverN: 0, dist: 0, orbs: [], orbT: -1, got: 0, tl: [], tlT: 0, nextGap: 0, best: store(ARX_GHOST) });
  arxFeverLook(false);
}
// Bien pasado (sin que te dé): suma a la racha; con 10 seguidos, fiebre
function arxClean() {
  ARX.streak++;
  if (settings.arcFever && !ARX.fever && ARX.streak >= 10) { ARX.fever = true; ARX.feverN++; arxFeverLook(true); cheer(ARX.feverN > 1 ? `¡FIEBRE ${ARX.feverN}! Más deprisa · ×2` : '¡MODO FIEBRE! Puntos ×2', '#ff4fa3', 1.8); SND.combo(); }
}
function arxHit() { if (ARX.fever) cheer('Fin de la fiebre', '#a49fc8', 1.2); ARX.streak = 0; ARX.fever = false; arxFeverLook(false); }

/* ---------- Al compás de la música ---------- */
// Con ritmo (el de cada canción de Spotify o uno marcado) y «Arcos al compás»: cada obstáculo sale cuando, a su velocidad,
// llegará a ti justo en un pulso; el hueco hasta el siguiente se cuenta en pulsos (en compases de dos si es largo) y la
// barra late con el pulso. arxBeatTick va en cada fotograma: dice si acaba de pasar el pulso de llegada del siguiente
function arxBeatTick() {
  const P = arxBeatP(); if (!P) { ARX.bk = -1; return true; }
  const spec = spawnQueue[0], sp = spec && spec.kind === 'plank' ? Math.max(0.3, settings.arcPlankSpeed / 3.6) * arxMul() : arxSpeed();
  const k = Math.floor(beatNow() + (HL.z + arenaDepth() - 0.9) / Math.max(0.3, sp) / P), hit = ARX.bk >= 0 && k !== ARX.bk; ARX.bk = k; return hit;
}
function arxBeatGap(sec) {
  const P = arxBeatP(); if (!P) return sec;
  let n = Math.max(1, Math.round(sec / P)); if (n >= 4) n = Math.round(n / 2) * 2; return (n - 0.5) * P; // (medio pulso antes: espera al de llegada)
}
const arxBeatGlow = () => { const P = arxBeatP(); if (!P) return 1; const f = ((beatNow() % 1) + 1) % 1; return 0.7 + 0.6 * Math.pow(1 - f, 3); };

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
    [settings.arcNew / 20, () => [{ kind: arxNewKind(), drop: rand(lo, hi), tilt: 0, hp: 1, gap: 1.3 }]],
    [settings.arcMace / 25, () => [{ kind: 'mace', drop: 0, tilt: 0, hp: 1, gap: 1.4 }]], // la maza
    [settings.arcPlank / 25, () => [{ kind: 'plank', drop: 0, tilt: 0, hp: 1, gap: 2.4 }]] // al suelo, en plancha (y tiempo para levantarte)
  ].filter(p => p[0] > 0), sum = pieces.reduce((a, p) => a + p[0], 0), list = [];
  while (list.length < total) { let r = Math.random() * sum, P = pieces[0]; for (const p of pieces) if ((r -= p[0]) <= 0) { P = p; break; } list.push(...P[1]()); }
  const out = arxPlankRoom(list.slice(0, total));
  // con los obstáculos nuevos activados, en cada oleada larga salen al menos los tres (en vez de arcos sueltos)
  if (settings.arcNew > 0 && total >= 9) for (let need = 3 - out.filter(o => ARX_NEW.includes(o.kind)).length, i = 0; need > 0 && i < 40; i++) {
    const k = Math.floor(Math.random() * out.length); if (out[k].kind === 'single' && !out[k].tilt) { out[k] = { kind: arxNewKind(), drop: out[k].drop, tilt: 0, hp: 1, gap: 1.3 }; need--; }
  }
  return out;
}

// Antes de un arco de plancha, tiempo para bajar al suelo (el anterior deja un hueco largo)
function arxPlankRoom(list) { list.forEach((o, i) => { if (o.kind === 'plank' && i > 0) list[i - 1].gap = Math.max(list[i - 1].gap || 1, 1.8); }); return list; }

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
    } else if (kind === 'mace') {
      // la maza: una bola de pinchos colgada de una cadena que se balancea de lado a lado; en lo más bajo pasa a la altura
      // de tu cabeza. No se para: hay que mirar su ritmo y apartarse al lado por el que no pasa (o agacharse a tiempo: unos 35 cm)
      // la bola pasa «Bajada de la maza» por debajo de lo alto de tu cabeza: en lo más bajo de su vaivén o, las que giran en
      // círculo (un péndulo cónico, hacia los lados y hacia ti y hacia atrás), siempre a esa altura
      const L = 2.0, H = calibRef + HEAD_TOP - (settings.arcMaceDrop >= 0 ? settings.arcMaceDrop : 20) / 100, round = Math.random() * 100 < settings.arcMaceRound, A = round ? rand(0.32, 0.42) : rand(0.42, 0.55);
      Object.assign(this, { L, H, round, A, piv: round ? H + L * Math.cos(A) : H + L, w: TAU / (round ? rand(1.8, 2.4) : rand(1.5, 2.1)), ph: rand(0, TAU), drop: 0.01, tilt: 0.01, leanX: 0, bx: 0, by: 0, bz: 0, lastS: 0, reach: round ? L * Math.sin(A) : 0 });
      const beam = new THREE.Mesh(G.box(2.4, 0.12, 0.14), M.steel); tint(beam.geometry, C.gun); beam.position.y = this.piv + 0.06; this.grp.add(beam);
      for (const s of [-1, 1]) { const post = new THREE.Mesh(G.cyl(0.05, 0.06, this.piv + 0.12, 10), M.steel); tint(post.geometry, C.gun); post.position.set(s * 1.2, (this.piv + 0.12) / 2, 0); this.grp.add(post); }
      this.arm = new THREE.Group(); this.arm.position.y = this.piv; this.grp.add(this.arm);
      for (let i = 0; i < 9; i++) { const l = new THREE.Mesh(MACE.link, M.steel); l.position.y = -(i + 0.5) * (L - 0.15) / 9; l.rotation.y = i % 2 ? Math.PI / 2 : 0; this.arm.add(l); } // (eslabones, cruzados)
      const ball = new THREE.Group(); ball.position.y = -L; this.arm.add(ball); ball.add(new THREE.Mesh(MACE.ball, MACE.ballMat)); ball.add(new THREE.Mesh(MACE.spikes, MACE.spikeMat));
      this.glow = glowSprite(0xff2a14, 0.75, 0.25); ball.add(this.glow); this.ball = ball;
    } else {
      // algunas llegan inclinadas: el hueco va en diagonal (a la altura de tu cabeza, más a un lado) y hay que ladearse
      this.gx = (Math.random() < 0.5 ? -1 : 1) * rand(0.28, 0.45); this.gap = 0.62; this.drop = 0.01;
      this.ang = Math.random() * 100 < settings.arcWallTilt ? -Math.sign(this.gx) * rand(0.1, 0.22) : 0; // (inclinadas hacia su lado: más hueco abajo de ese lado)
      this.leanX = this.gapX(calibRef); this.tilt = Math.sign(this.leanX) * 0.01;
      this.walls = [-1, 1].map(s => { const g = new THREE.Group(), m = wallMat(), pl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.3), m); pl.position.set(s * 0.7, 1.15, 0); g.add(pl);
        const edge = new THREE.Mesh(G.box(0.05, 2.3, 0.05), LASER_MAT); edge.position.set(0, 1.15, 0); g.add(edge); g.userData.m = m; g.rotation.z = this.ang; this.grp.add(g); return g; });
    }
    this.hum = humLoop(arena.localToWorld(new V3(0, 1.2, this.z)));
  }
  // lo que queda para que llegue: se mueve mucho al principio y se asienta en su sitio al pasar por ti
  settle() { const tau = Math.max(0, this.tReach - this.t); return tau * Math.min(1, tau / 1.2); }
  gapX(y) { return this.gx - Math.tan(this.ang || 0) * y; } // (el centro del hueco a esa altura)
  x() { return this.end + this.amp * Math.sin(this.ph + this.settle() * 2.2); }
  update(dt, t) {
    this.t += dt; this.z += this.speed * dt; this.grp.position.z = this.z;
    const hz = HL.z, inLane = Math.abs(HL.x) < 1.0, s = this.settle();
    if (this.kind === 'laser') this.beam.position.x = this.x();
    else if (this.walls) { const half = this.gap / 2 + Math.min(0.9, s * 0.35); this.walls[0].position.x = this.gx - half; this.walls[1].position.x = this.gx + half; if (this.ang) this.leanX = this.gapX(HL.y); } // (inclinadas: el hueco, a la altura a la que llevas la cabeza)
    if (this.kind === 'mace') this.swing(t);
    const bad = this.kind === 'laser' ? Math.abs(HL.x - this.beam.position.x) < 0.28 : this.kind === 'mace' ? this.maceHits() : Math.abs(HL.x - this.gapX(HL.y)) > this.gap / 2 - 0.06;
    const danger = !this.judged && this.z < hz && this.z > hz - 2.4 && bad;
    if (this.kind === 'mace') this.glow.material.opacity = danger ? 0.75 + 0.2 * Math.sin(t * 30) : 0.25;
    else if (this.mat) this.mat.opacity = danger ? 1 : 0.7; else this.walls.forEach(w => { w.userData.m.opacity = danger ? 0.75 + 0.2 * Math.sin(t * 30) : 0.45; });
    if (danger && inLane) { this.warnT -= dt; if (this.warnT <= 0) { const d = hz - this.z; this.warnT = clamp(d * 0.18, 0.08, 0.4); SND.beep(1 + (2.4 - d) * 0.25); } }
    if (this.hum) this.hum.set(arena.localToWorld(tmpA.set(this.kind === 'laser' ? this.beam.position.x : this.kind === 'mace' ? this.bx : this.gapX(1.2), 1.2, this.z)));
    const reach = this.reach || 0; // (la maza que gira pasa por delante y por detrás de su viga)
    if (!this.judged && Math.abs(this.z - hz) < 0.15 + reach && inLane) { this.checked = true; if (bad) this.hit = true; }
    if (!this.judged && this.z > hz + 0.15 + reach) { this.judged = true; this.resolve(); }
    if (this.z > hz + 3.5) { this.dispose(); this.alive = false; }
  }
  // la maza: el ángulo de la cadena y dónde está la bola (en el sitio de la pista); al pasar por lo más bajo cerca de ti, silba
  swing(t) {
    const ph = this.w * this.t + this.ph;
    if (this.round) { const r = this.L * Math.sin(this.A); this.bx = r * Math.sin(ph); this.bz = r * Math.cos(ph); this.by = this.H; }
    else { const a = this.A * Math.sin(ph); this.bx = this.L * Math.sin(a); this.by = this.piv - this.L * Math.cos(a); this.bz = 0; }
    this.arm.quaternion.setFromUnitVectors(_mcD.set(0, -1, 0), _mcB.set(this.bx, this.by - this.piv, this.bz).normalize()); this.ball.rotation.x = this.t * 0.7;
    const s = Math.sign(this.bx); if (s !== this.lastS && this.lastS && Math.abs(this.z - HL.z) < 3) SND.whoosh(arena.localToWorld(tmpA.set(this.bx, this.by, this.z + this.bz)), 'arc'); this.lastS = s;
  }
  maceHits() { return Math.abs(this.z + this.bz - HL.z) < 0.2 && Math.hypot(HL.x - this.bx, HL.y - this.by) < MACE.r + 0.14; } // (la bola, con sus pinchos, y tu cabeza)
  resolve() {
    if (!(state === 'play' || state === 'rest')) return;
    const hp = arena.localToWorld(tmpA.set(HL.x, HL.y, HL.z - 0.1));
    if (!this.checked) { say('Quédate en el carril', '#ff8a3d', 1.2); return; }
    if (this.hit) { fx.electric(hp, 24); if (this.kind === 'mace') SND.metalHit(hp, true); else SND.zap(hp); hurtPlayer({ silent: true }); arxHit(); say(this.kind === 'laser' ? `¡Apártate del láser, a la ${this.leanX > this.end ? 'derecha' : 'izquierda'}!` : this.kind === 'mace' ? '¡Esquiva la maza: apártate o agáchate!' : this.ang ? '¡Ladéate para entrar en el hueco!' : '¡Métete en el hueco!', '#ff3b5c', 1.3); return; }
    SND.whoosh(hp, 'arc'); registerRep(true, false); arxClean(); say(this.kind === 'laser' ? '¡Esquivado!' : this.kind === 'mace' ? '¡Maza esquivada!' : '¡Por el hueco!', '#3cf0c6', 0.9, false); SND.perfect();
  }
  dispose() {
    arena.remove(this.grp); if (this.mat) this.mat.dispose(); if (this.walls) this.walls.forEach(w => w.userData.m.dispose()); if (this.glow) this.glow.material.dispose();
    this.grp.traverse(o => { if (o.geometry && o.geometry.type === 'PlaneGeometry') o.geometry.dispose(); }); if (this.hum) { this.hum.stop(); this.hum = null; }
  }
}

// La maza, compartida por todas: bola de acero oscuro con 12 pinchos y eslabones de cadena
const _mcD = new V3(), _mcB = new V3();
const MACE = (() => {
  const r = 0.16, ball = new THREE.IcosahedronGeometry(r, 1), spk = [], ico = new THREE.IcosahedronGeometry(1, 0), P = ico.attributes.position, seen = [];
  for (let i = 0; i < P.count; i++) { const v = new V3(P.getX(i), P.getY(i), P.getZ(i)).normalize(); if (seen.some(o => o.distanceTo(v) < 0.01)) continue; seen.push(v);
    const c = new THREE.ConeGeometry(0.04, 0.13, 7); c.translate(0, r + 0.05, 0); c.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new Q4().setFromUnitVectors(new V3(0, 1, 0), v))); /* (r128: las geometrías no tienen applyQuaternion) */ spk.push(ensureAttrs(c.toNonIndexed())); }
  return { r: r + 0.1, ball, spikes: mergeGeos(spk), link: new THREE.TorusGeometry(0.035, 0.011, 6, 12), ballMat: std({ color: 0x2a2c33, metalness: 0.9, roughness: 0.35, flatShading: true }), spikeMat: std({ color: 0xb8bcc6, metalness: 1, roughness: 0.25 }) };
})();

/* ---------- Orbes para recoger ---------- */
// Orbe: un cristal dorado que gira y late, con dos aros que se cruzan, un halo, chispitas que lo rondan y una estela
// (un cristal tallado: muchas caras planas con luz propia moderada, para que la luz y los brillos marquen su relieve; y
// un núcleo encendido dentro)
const orbGeo = new THREE.OctahedronGeometry(0.085, 1), orbCoreGeo = new THREE.IcosahedronGeometry(0.035, 0), orbRingGeo = new THREE.TorusGeometry(0.135, 0.007, 6, 36);
const orbMat = std({ color: 0xffe9a0, emissive: 0xff9a10, emissiveIntensity: 0.4, metalness: 0.75, roughness: 0.12, flatShading: true, toneMapped: false });
const orbCoreMat = new THREE.MeshBasicMaterial({ color: 0xfff6d8, toneMapped: false });
orbMat.userData.comicSoft = true; // (en cómic, sombreado redondeado)
const orbRingMat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const orbRing2Mat = orbRingMat.clone(); orbRing2Mat.color.setHex(0x7ff7e0);
function orbFeverLook(on) { orbMat.emissive.setHex(on ? 0xff3c9a : 0xffb02a); orbRingMat.color.setHex(on ? 0xff7fc4 : 0xffd166); }
class ArcOrb {
  constructor() {
    // la altura: unos por encima de la cabeza (estirar el brazo o saltar), otros muy abajo (agacharse a fondo o bajar la mano
    // casi al suelo) y el resto, a la altura de la cara
    const D = arenaDepth(), r = Math.random() * 100, band = r < settings.arcOrbHigh ? 'high' : r < settings.arcOrbHigh + settings.arcOrbLow ? 'low' : 'mid'; this.band = band;
    const Y = () => band === 'high' ? clamp(calibRef + rand(0.15, 0.4), 1.5, 2.3) : band === 'low' ? clamp(calibRef - rand(0.75, 1.05), 0.3, 0.95) : clamp(calibRef + rand(-0.55, 0.08), 0.5, 2.1);
    this.pos = new V3(rand(-0.6, 0.6), Y(), -D + 0.9); this.speed = arxSpeed(); this.alive = true;
    this.grp = new THREE.Group(); this.gem = new THREE.Mesh(orbGeo, orbMat); this.gem.scale.y = 1.25; this.grp.add(this.gem); this.gem.add(new THREE.Mesh(orbCoreGeo, orbCoreMat));
    // vuelo: dos vaivenes de frecuencias que no encajan, en horizontal y en vertical, que crecen al acercarse: no se puede prever
    this.fl = [rand(1.2, 1.9), rand(2.6, 3.5), rand(1.0, 1.6), rand(2.2, 3.1)].map(f => ({ f, p: rand(0, TAU) })); this.amp = 1;
    // y cruza en diagonal hacia el otro lado de la pista (y a otra altura), por una curva que no es la misma cada vez
    this.z0 = this.pos.z; this.x1 = -Math.sign(this.pos.x || 1) * rand(0.2, 0.7); this.y1 = band === 'mid' ? clamp(calibRef + rand(-0.6, 0.1), 0.5, 2.0) - this.pos.y : rand(-0.12, 0.12); this.ease = Math.floor(rand(0, 3));
    this.ring = new THREE.Mesh(orbRingGeo, orbRingMat); this.ring2 = new THREE.Mesh(orbRingGeo, orbRing2Mat); this.ring2.scale.setScalar(0.82); this.grp.add(this.ring, this.ring2);
    this.glow = glowSprite(ARX.fever ? 0xff4fa3 : 0xffd166, 0.5, 0.85); this.grp.add(this.glow);
    this.motes = [0, 1, 2].map(() => { const m = glowSprite(0xffffff, 0.07, 1); this.grp.add(m); return m; });
    this.trailT = 0; this.ph = rand(0, TAU); this.grp.position.copy(this.pos); arena.add(this.grp);
  }
  update(dt, t) {
    this.pos.z += this.speed * dt; const D = arenaDepth(), sw = this.amp * clamp(settings.arcOrbSwing / 100, 0, 1), k = sw * clamp((this.pos.z + D) / Math.max(1, D), 0.3, 1), F = this.fl;
    const p = clamp((this.pos.z - this.z0) / Math.max(0.5, HL.z - this.z0), 0, 1), e = this.ease === 0 ? p * p : this.ease === 1 ? 1 - (1 - p) * (1 - p) : smooth(p);
    this.grp.position.set(clamp(this.pos.x + sw * (this.x1 - this.pos.x) * e + k * (0.3 * Math.sin(F[0].f * t + F[0].p) + 0.12 * Math.sin(F[1].f * t + F[1].p)), -0.9, 0.9), clamp(this.pos.y + sw * this.y1 * e + k * (0.15 * Math.sin(F[2].f * t + F[2].p) + 0.06 * Math.sin(F[3].f * t + F[3].p)), 0.28, 2.35), this.pos.z);
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

/* ---------- Sensación de avance: una rejilla de neón en la pista y arcos de luz a los lados que pasan junto a ti ---------- */
// La pista: líneas de luz (de lado a lado cada metro y tres a lo largo) que corren hacia ti a la velocidad de los arcos y se
// apagan a lo lejos. A los lados, en vez de farolas, arcos de luz finos que suben desde el suelo y se inclinan un poco hacia
// dentro (sin entrar en la pista). Todo con el color de la racha: turquesa, dorado (5 seguidos) y rosa en fiebre; la arena
// también se tiñe un poco (una luz de ambiente de ese color)
const ARX_DECO = new THREE.Group(); ARX_DECO.visible = false; arena.add(ARX_DECO);
const gridMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  uniforms: { uCol: { value: new THREE.Color(0x3cf0c6) }, uScroll: { value: 0 }, uLen: { value: 12 }, uK: { value: 0.8 } },
  vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform vec3 uCol; uniform float uScroll; uniform float uLen; uniform float uK; varying vec2 vU;
    void main(){
      float z = vU.y * uLen - uScroll, x = (vU.x - 0.5) * 2.2;
      float across = smoothstep(0.455, 0.49, abs(fract(z) - 0.5)); // (cerca de cada metro)
      float along = max(1.0 - smoothstep(0.0, 0.02, abs(abs(x) - 0.55)), 1.0 - smoothstep(0.0, 0.015, abs(x))) * 0.7;
      float edge = 1.0 - smoothstep(0.0, 0.03, abs(abs(x) - 1.08));
      float far = 1.0 - smoothstep(0.5, 1.0, vU.y); // (a lo lejos se apaga; cerca de ti, del todo)
      gl_FragColor = vec4(uCol * (max(max(across, along), edge) * uK * far), 1.0);
    }`
});
const ARX_GRID = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1), gridMat); ARX_GRID.rotation.x = -Math.PI / 2; ARX_GRID.position.y = 0.009; ARX_DECO.add(ARX_GRID);
const archMat = new THREE.MeshBasicMaterial({ color: 0x3cf0c6, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const archGeo = new THREE.TorusGeometry(1, 0.02, 5, 20, Math.PI / 2);
const ARX_POST = [], POST_GAP = 3.2;
for (let i = 0; i < 8; i++) for (const s of [-1, 1]) {
  const g = new THREE.Group(), a = new THREE.Mesh(archGeo, archMat); a.scale.set(0.45, 2.6, 1); a.position.x = 1.1; g.add(a); // (de x 1,55 en el suelo a 1,1 arriba, a 2,6 m)
  const tip = glowSprite(0x3cf0c6, 0.22, 0.8); tip.position.set(1.1, 2.6, 0); g.add(tip); g.userData.tip = tip;
  g.scale.x = s; ARX_DECO.add(g); ARX_POST.push(g);
}
const ARX_TINT = new THREE.HemisphereLight(0x3cf0c6, 0x000000, 0); scene.add(ARX_TINT); // (siempre en la escena, a 0 fuera de los Arcos: así no se recompilan los materiales)
const _tintC = new THREE.Color(0x3cf0c6), _tintT = new THREE.Color();
let arxScroll = 0;
function arxFeverLook(on) { orbFeverLook(on); }
function arxDeco(dt, t) {
  const on = settings.mode === 'arcs' && !isFloor() && ['ready', 'play', 'rest'].includes(state), mv = on && !!settings.arcMove; ARX_DECO.visible = mv;
  // el color de la racha, con suavidad
  _tintT.setHex(ARX.fever ? 0xff4fa3 : ARX.streak >= 5 ? 0xffd166 : 0x3cf0c6); _tintC.lerp(_tintT, Math.min(1, dt * 3));
  ARX_TINT.color.copy(_tintC); ARX_TINT.intensity += ((on ? (arMode ? 0.12 : 0.28) : 0) - ARX_TINT.intensity) * Math.min(1, dt * 3);
  if (!mv) return;
  if (state === 'play') arxScroll += arxSpeed() * dt;
  const D = arenaDepth(), z0 = -D + 0.5, span = D + 3, len = D + 1.5, pulse = ARX.fever ? 0.75 + 0.25 * Math.sin(t * 10) : 0.8;
  ARX_GRID.scale.y = len; ARX_GRID.position.z = -D + len / 2 + 0.4; Object.assign(gridMat.uniforms.uLen, { value: len }); gridMat.uniforms.uScroll.value = -arxScroll; gridMat.uniforms.uCol.value.copy(_tintC); gridMat.uniforms.uK.value = pulse;
  archMat.color.copy(_tintC); archMat.opacity = 0.35 + 0.25 * pulse;
  ARX_POST.forEach((g, i) => { g.position.z = z0 + ((Math.floor(i / 2) * POST_GAP + arxScroll) % span); g.userData.tip.material.color.copy(_tintC); });
}

/* ---------- Cada fotograma, metas y fantasma ---------- */
function arxStep(dt, t) {
  arxDeco(dt, t);
  if (settings.mode !== 'arcs') return;
  if (ARX.orbT > 0 && state === 'play' && WIN.t < 0) { ARX.orbT -= dt; /* (con el panel entre oleadas delante, nada) */ if (ARX.orbT <= 0) ARX.orbs.push(new ArcOrb()); }
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
