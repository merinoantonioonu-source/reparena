
/* =================== MODO BARRAS: REMO INVERTIDO, DOMINADAS Y COLGADO =================== */
// La repetición se mide por la altura del visor y cuenta al subir. Cada una revienta con la cabeza el objetivo
// que espera en el punto más alto del recorrido. Bajo la barra de dominadas hay un charco con tentáculos: si te sueltas, caes.
const BAR = { phase: 'place', t: 0, still: 0, ref: 1, hangRef: 1, refXZ: new V3(), drift: new V3(), front: new V3(), det: 'down', max: 0, t0: 0, hold: 0, letGo: 0, contact: false, need: 0, nextWave: 0, resume: false, started: false, mountXZ: new V3(), board: null };
const barReq = () => (settings.exercise === 'row' ? settings.rowRange : settings.pullRange) / 100;
const _bl = new V3(), _bq = new V3(), _bw = new V3(), _ba = new V3();
function barReset() { Object.assign(BAR, { failed: false, phase: 'place', t: 0, still: 0, det: 'down', letGo: 0, hold: 0, need: 0, nextWave: 0, resume: false, started: false, board: null }); BAR.drift.set(0, 0, 0); }
// ¿Está la cabeza donde tiene que estar para usar el aparato?
function barNear() {
  const l = eqLocal(eqPose(), head.p, _bl), y = head.p.y;
  if (settings.exercise === 'row' && dipOne()) return Math.abs(l.x) < 1.0 && Math.abs(l.z) < settings.dipLen / 200 + 0.35 && y < settings.dipH / 100 + 0.05;
  if (settings.exercise === 'row') return Math.abs(l.x) < settings.dipGap / 200 + 0.35 && Math.abs(l.z) < settings.dipLen / 200 + 0.9 && y < settings.dipH / 100 + 0.05;
  return Math.abs(l.x) < settings.doorW / 200 + 0.2 && Math.abs(l.z) < 0.6 && y < settings.doorH / 100 - 0.12;
}

// ¿Se ven las manos claramente por debajo de la barra? Agarrado, las muñecas están a su altura (o fuera de la
// vista, por encima de la cabeza); al soltarte bajan y entran en la vista. Devuelve cuántas se ven abajo y cuántas se ven.
function handsLow() {
  const y = eqTopY() - 0.35; let low = 0, ok = 0;
  for (const s of ['left', 'right']) { const h = hands[s]; if (h.ok) { ok++; if (h.wrist.y < y) low++; } }
  return { low, ok };
}
// ¿Alguna mano a la vista agarrada a la barra (a su altura)?
const handsOnBar = () => ['left', 'right'].some(s => hands[s].ok && Math.abs(hands[s].wrist.y - eqTopY()) < 0.2);
const handsOff = () => { const h = handsLow(); return h.low >= 2 || (h.low === 1 && h.ok === 1); };

/* ---------- Colgarse: colocarse, cuenta atrás y quedarse quieto ---------- */
function barToMount(next, resume = false) {
  state = 'mount'; stateT = 0; BAR.phase = 'place'; BAR.still = 0; BAR.t = 0; BAR.resume = resume; if (!resume) BAR.nextWave = next;
  center.mesh.visible = true; drawCenter(); boardDirty = true;
}
function barMountStep(dt) {
  const near = barNear() && !handsOff(), still = head.speed < 0.08; // de pie bajo la barra con las manos abajo no estás colgado
  if (BAR.phase === 'place') { BAR.still = near && still ? BAR.still + dt : Math.max(0, BAR.still - dt * 2); if (BAR.still >= 0.8) { BAR.phase = 'count'; BAR.t = 0; SND.charge(); } }
  else if (BAR.phase === 'count') { const before = BAR.t; BAR.t += dt; if (!near) { BAR.phase = 'place'; BAR.still = 0; } else if (BAR.t >= 3) { BAR.phase = 'settle'; BAR.t = 0; BAR.still = 0; } else if (Math.floor(before) !== Math.floor(BAR.t)) SND.beep(); }
  else { BAR.t += dt; BAR.still = still ? BAR.still + dt : 0; if (BAR.still >= 0.35 || BAR.t > 2.5) barMounted(); }
}
function barMounted() {
  if (!BAR.started) { arenaFromHead(); arena.updateMatrixWorld(); }
  HL.copy(head.p); arena.worldToLocal(HL);
  BAR.ref = BAR.hangRef = head.p.y; BAR.refXZ.set(HL.x, 0, HL.z); BAR.mountXZ.set(head.p.x, 0, head.p.z); BAR.det = 'down';
  // en la barra de puerta el objetivo espera un poco por delante de la cara, hacia la barra, para que se vea al mirarla
  BAR.front.set(0, 0, 0);
  if (eqKind() === 'door') {
    const e = eqPose(), lz = eqLocal(e, head.p, _bl).z; eqAxes(e, null, _ba);
    const s = Math.abs(lz) > 0.04 ? -Math.sign(lz) : Math.sign(_ba.dot(fwdH()) || 1);
    BAR.front.copy(_ba).multiplyScalar(s).applyAxisAngle(_up, -arena.rotation.y).multiplyScalar(Math.min(0.22, Math.max(0.12, Math.abs(lz))));
  }
  center.mesh.visible = false; SND.charge();
  if (settings.exercise === 'row') placeRowBoard(true);
  if (BAR.resume) { BAR.resume = false; state = 'play'; stateT = 0; cheer('¡Sigue!', '#3cf0c6', 1.2); }
  else startWave(BAR.nextWave);
  BAR.started = true;
}
// En el remo miras al techo: el marcador se coloca encima de tu cara, mirándote, un poco hacia la coronilla: las
// pompas llegan desde los pies y nunca pasan por detrás de él
const _rbm = new THREE.Matrix4(), _rbx = new V3(), _rby = new V3(), _rbz = new V3(), _rbs = new V3(), _rbq = new Q4();
function placeRowBoard(fromHead) {
  const rig = boardRig.children[0]; if (!rig) return;
  if (fromHead || !BAR.board) {
    _rby.set(0, 1, 0).applyQuaternion(head.q);
    const P = head.p.clone().addScaledVector(fwd(), 1.2).addScaledVector(_rby, 0.7); P.y = Math.max(P.y, head.p.y + 0.5);
    _rbz.subVectors(head.p, P).normalize();
    _rbx.crossVectors(_rby, _rbz); if (_rbx.lengthSq() < 1e-6) _rbx.set(1, 0, 0); _rbx.normalize(); _rby.crossVectors(_rbz, _rbx);
    _rbm.makeBasis(_rbx, _rby, _rbz); _rbm.decompose(_rbs, _rbq, new V3());
    BAR.board = { p: P, q: _rbq.clone() };
  }
  arena.updateMatrixWorld();
  rig.position.copy(arena.worldToLocal(BAR.board.p.clone()));
  rig.quaternion.copy(new Q4().setFromAxisAngle(_up, arena.rotation.y).invert().multiply(BAR.board.q));
}

/* ---------- Detector: cuenta al subir; caída si bajas de tu posición colgado ---------- */
function barFall() {
  stats.falls++;
  if (vortexOn()) { vortexEngulf(); return; } // el remolino te engulle: la oleada termina
  const at = new V3(head.p.x, 0.03, head.p.z), door = eqKind() === 'door';
  if (door) poolGrab(at); else { SND.partial(); fx.glow(at, [1, 0.5, 0.3], 0.5, 0.2); }
  hurtPlayer({ silent: true }); if (state === 'end') return;
  cheer(door ? '¡AL CHARCO!' : '¡TE SOLTASTE!', door ? '#3cff8a' : '#ff8a3d', 1.8);
  if (BAR.lastFall) warnFloor(`${door ? '¡AL CHARCO!' : '¡TE SOLTASTE!'} (${BAR.lastFall})`, '#ff8a3d');
  barToMount(0, true);
}
function barDetect(t, dt) {
  if (state !== 'play') return;
  const y = head.p.y, margin = settings.fallMargin / 100;
  // la posición colgado solo se reajusta quieto abajo: bajar despacio también cuenta como caída
  if (BAR.det === 'down' && head.speed < 0.05) BAR.hangRef += (BAR.ref - BAR.hangRef) * Math.min(1, dt * 0.3);
  // soltarse: las manos a la vista por debajo de la barra (al caer de pie la cabeza no siempre baja)
  const off = handsLow(); BAR.letGo = off.low >= 2 || (off.low === 1 && off.ok === 1) ? BAR.letGo + dt : 0;
  // En el remo, tumbado boca arriba, la altura de la cabeza cambia con solo relajar el cuello o estirar del todo
  // los brazos: si las manos siguen a la vista en las paralelas, bajar no es soltarse (se toma esa altura como
  // nueva posición de abajo). Sí lo es tener la cabeza en el suelo.
  let low = y < BAR.hangRef - margin;
  if (low && settings.exercise === 'row' && handsOnBar() && y > 0.22) { low = false; BAR.hangRef = BAR.ref = Math.min(BAR.ref, y); }
  if (settings.exercise === 'row' && y < 0.18) low = true;
  if (low || BAR.letGo > (off.low >= 2 ? 0.25 : 0.6) || Math.hypot(head.p.x - BAR.mountXZ.x, head.p.z - BAR.mountXZ.z) > 0.75) {
    BAR.lastFall = low ? (settings.exercise === 'row' ? 'la cabeza llegó al suelo' : `la cabeza bajó más de ${settings.fallMargin} cm`) : BAR.letGo ? 'tus manos se vieron por debajo de la barra' : 'te alejaste del aparato';
    BAR.letGo = 0; barFall(); return;
  }
  if (settings.exercise === 'hang') {
    const before = BAR.hold; BAR.hold += dt; stats.hold += dt;
    if (Math.floor(BAR.hold) > Math.floor(before)) {
      score += 10; combo++; stats.bestCombo = Math.max(stats.bestCombo, combo); boardDirty = true;
      const s = Math.floor(BAR.hold), left = Math.ceil(BAR.need - BAR.hold);
      if (left > 0 && left <= 3) SND.beep(1 + (3 - left) * 0.25);
      else if (left > 0 && s % 10 === 0) { cheer(`¡${s} s!`, '#3cf0c6', 1.0); SND.combo(); }
    }
    return;
  }
  const req = barReq(), pt = settings.perfectTime;
  // referencia abajo (brazos estirados): baja enseguida y sube muy despacio
  if (y < BAR.ref) BAR.ref += (y - BAR.ref) * Math.min(1, dt * 6); else if (BAR.det !== 'top') BAR.ref += (y - BAR.ref) * Math.min(1, dt * 0.05);
  if (BAR.det === 'down') {
    if (y < BAR.ref + 0.04) BAR.refXZ.lerp(_bl.set(HL.x, 0, HL.z), Math.min(1, dt * 3));
    if (y > BAR.ref + Math.min(0.1, req * 0.4)) { BAR.det = 'rising'; BAR.max = y; BAR.t0 = t; }
  } else if (BAR.det === 'rising') {
    BAR.max = Math.max(BAR.max, y);
    if (y - BAR.ref >= req) {
      const dur = t - BAR.t0; BAR.det = 'top';
      // aprende hacia dónde se desplaza la cabeza al subir (en el remo, hacia los pies)
      BAR.drift.lerp(_bl.set(HL.x - BAR.refXZ.x, 0, HL.z - BAR.refXZ.z), BAR.drift.lengthSq() ? 0.5 : 1);
      barRep({ perfect: dur >= pt * 0.5 && dur < 6, fast: pt > 0 && dur < pt * 0.25 });
    } else if (y < BAR.ref + 0.05) { if (BAR.max - BAR.ref > req * 0.55) onPartial('¡Más arriba!'); BAR.det = 'down'; }
  } else if (y < Math.max(BAR.ref + 0.06, BAR.max - req * 0.7)) BAR.det = 'down'; // rearma al bajar casi todo el recorrido
  if (BAR.det === 'down') BAR.contact = false;
}
function barRep(opts) {
  if (state !== 'play' || settings.exercise === 'hang' || BAR.contact) return; // ya contó al reventarlo con la cabeza
  registerRep(opts.perfect, false);
  if (combo % 10 !== 0) { if (opts.perfect) cheer('¡PERFECTA!', '#3cf0c6', 1.0); else if (opts.fast) say('Más controlado', '#ffffff', 1.0); else say('¡Bien!', '#ffffff', 0.7, false); }
  if (opts.perfect) SND.perfect();
  let tg = frontTarget();
  if (!tg && spawnQueue.length) { spawnFromQueue(); spawnTimer = barGap(); tg = frontTarget(); } // ninguna repetición se pierde
  if (!tg) return;
  // si todavía no ha llegado, la onda del cabezazo lo alcanza igual
  const c = tg.center(new V3()), h = head.p.clone().add(_ba.set(0, 0.08, 0));
  if (c.distanceTo(h) > 0.35) for (let i = 0; i <= 10; i++) fx.trail(h.clone().lerp(c, i / 10), [0.3, 1, 0.85], 0.06, 0.3);
  tg.onHit(opts.perfect ? 2 : 1, opts.perfect); if (!tg.alive) onKilled(tg);
}

/* ---------- Objetivos que se revientan con la cabeza ---------- */
const TGT = { bubble: { r: 0.1 }, bigbubble: { r: 0.17, boss: true }, wasp: { rig: 'stinger', scale: 1.0, r: 0.11, wasp: true }, queen: { rig: 'stinger', scale: 1.8, r: 0.19, wasp: true, boss: true }, drone: { rig: 'drone', scale: 0.65, r: 0.13 }, hornet: { rig: 'stinger', scale: 0.8, r: 0.09, wasp: true }, carrier: { rig: 'carrier', scale: 1.3, r: 0.28, boss: true } };
const bubbleGeo = new THREE.SphereGeometry(1, 28, 18);
// Pompa de jabón: película irisada cuyo color cambia con el ángulo y se arremolina, más opaca en el borde,
// con brillos de reflejo; así se ve bien también sobre el fondo de la realidad mixta
const BUBBLE_VS = `varying vec3 vN; varying vec3 vV; varying vec3 vO;
void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vO = normal; gl_Position = projectionMatrix * mv; }`;
const BUBBLE_FS = `uniform float uTime; uniform float uPh; uniform float uOpacity;
varying vec3 vN; varying vec3 vV; varying vec3 vO;
void main() {
  vec3 n = normalize(vN), v = normalize(vV);
  float fr = pow(1.0 - abs(dot(n, v)), 1.5);
  float swirl = sin(vO.y * 6.0 + uTime * 1.3 + uPh) * 0.25 + sin(vO.x * 5.0 - uTime * 0.9 + uPh * 2.0) * 0.2;
  float h = fr * 1.7 + swirl + uTime * 0.08 + uPh;
  vec3 film = 0.55 + 0.45 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67)));
  vec3 r = reflect(-v, n);
  float spec = pow(max(dot(r, normalize(vec3(-0.4, 0.8, 0.45))), 0.0), 60.0) * 1.8 + pow(max(dot(r, normalize(vec3(0.6, 0.2, 0.75))), 0.0), 22.0) * 0.45;
  vec3 col = film * (0.5 + 1.4 * fr) + vec3(spec);
  gl_FragColor = vec4(col, clamp(0.25 + 0.72 * fr + spec, 0.0, 1.0) * uOpacity);
}`;
// (escribe su profundidad: las Quest recolocan cada imagen al último movimiento de la cabeza según la profundidad, y sin
// ella la pompa se recolocaba como si estuviera al fondo: de cerca, y con la cabeza moviéndose al remar, iba a saltos)
const bubbleMat = () => new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uPh: { value: rand(0, 6) }, uOpacity: { value: 1 } }, vertexShader: BUBBLE_VS, fragmentShader: BUBBLE_FS, transparent: true, depthWrite: true });
// Gotas de colores al reventar
const BUBBLE_SPLASH = [[1, 0.45, 0.85], [0.45, 0.85, 1], [1, 0.95, 0.45], [0.55, 1, 0.6]];
// línea que baja del objetivo hacia tu cara: indica dónde está aunque quede por encima de la vista
const guideGeo = G.cylRaw(0.003, 0.003, 0.4, 6); guideGeo.translate(0, -0.2, 0);
const guideMat = new THREE.MeshBasicMaterial({ color: 0x3cf0c6, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
const eyeWhite = std({ color: 0xf2eee6, roughness: 0.25 }), eyeIris = new THREE.MeshBasicMaterial({ color: 0xff3020, toneMapped: false }), eyePupil = new THREE.MeshBasicMaterial({ color: 0x050303 });
// Entre un objetivo y el siguiente, lo que dura una repetición (±15 %): nunca llegan dos a la vez, y llegan espaciados
// de forma pareja sin ser un metrónomo (todos tardan lo mismo en llegar desde que salen)
const barGap = () => repTimeOf(settings.exercise, 'bars') * rand(0.85, 1.15);
const frontTarget = () => enemies.find(e => e.type === 'target' && e.alive && (e.mode === 'approach' || e.mode === 'wait'));
// Punto más alto previsto de la cabeza (coordenadas de la arena) y hueco de espera del siguiente
// En el remo: un cuarto de la altura de la barra por debajo de ella y pasado su borde hacia tu cabeza (con una paralela,
// al otro lado de la barra; con dos, más allá de su extremo), que es donde llega la cabeza al subir
const _bt = new V3();
function barTopPoint(out) {
  if (settings.exercise === 'row') {
    const e = eqPose(), L = settings.dipLen / 200, l = eqLocal(e, _bt.copy(BAR.mountXZ), _bt), y = Math.max(BAR.ref + barReq() + 0.04, settings.dipH / 100 * 0.75 + 0.05); // (un poco más arriba que antes: hay que subir más)
    if (dipOne()) eqWorld(e, (Math.sign(l.x) || 1) * 0.12, y, clamp(l.z, -L, L), out); else eqWorld(e, l.x, y, (Math.sign(l.z) || 1) * (L + 0.1), out);
    return arena.worldToLocal(out);
  }
  out.set(BAR.refXZ.x + BAR.drift.x + BAR.front.x, BAR.ref + barReq() + 0.04, BAR.refXZ.z + BAR.drift.z + BAR.front.z);
  if (settings.exercise !== 'row') out.y = Math.min(out.y, settings.doorH / 100 - 0.06);
  return out;
}
// Hacia los lados del cuerpo (coordenadas de la arena, en horizontal): a lo largo de la barra de dominadas; en el remo,
// de una paralela a la otra (con una sola, a lo largo de ella: estás tumbado cruzado debajo)
function barLat(out) {
  const e = eqPose(); if (eqKind() === 'dip' && dipOne()) eqAxes(e, null, out); else eqAxes(e, out);
  return out.applyAxisAngle(_up, -arena.rotation.y);
}
// Por los lados: cada objetivo se para apartado barOffset cm hacia su lado (y el que espera detrás, más allá de ese lado)
const barSidesOn = () => settings.barMix > 0 && settings.exercise !== 'hang';
// ¿Este llega por un lado? Se reparten por igual (los del centro, entre medias) y los de los lados alternan izquierda y derecha
function barNextSide() {
  if (!barSidesOn()) return 0;
  BAR.acc = (BAR.acc === undefined ? 0.5 : BAR.acc) + settings.barMix / 100; if (BAR.acc < 1 - 1e-6) return 0;
  BAR.acc -= 1; return (BAR.side = -(BAR.side || 1));
}
function barSlot(idx, out, side = 0) {
  barTopPoint(out);
  if (barSidesOn() && side) { out.addScaledVector(barLat(_bq), side * (settings.barOffset / 100 + 0.42 * idx)); if (idx) out.y += 0.06; return out; }
  if (!idx) return out;
  const e = eqPose(), w = arena.localToWorld(_bw.copy(out));
  if (eqKind() === 'door') eqAxes(e, _ba); else { _ba.set(w.x - e.x, 0, w.z - e.z); if (_ba.lengthSq() < 1e-4) eqAxes(e, null, _ba); _ba.normalize(); }
  w.addScaledVector(_ba, 0.42 * idx); w.y += 0.06;
  return out.copy(arena.worldToLocal(w));
}
// Hacia dónde está «delante» para los que llegan (en el mundo, desde su sitio w): en la barra, hacia donde miras (o la
// normal de la puerta, si se parece); en el remo, hacia los pies
const _bf = new V3();
function barFront(w, dir) {
  const e = eqPose();
  if (eqKind() === 'door') { dir.copy(fwdH()); eqAxes(e, null, _bf); if (_bf.dot(dir) < 0) _bf.negate(); if (_bf.dot(dir) > 0.5) dir.copy(_bf); }
  else { dir.set(e.x - w.x, 0, e.z - w.z); if (dir.lengthSq() < 1e-4) eqAxes(e, null, dir); dir.normalize(); }
  return dir;
}
class HeadTarget {
  constructor(spec) {
    const K = TGT[spec.kind]; this.K = K; this.type = 'target'; this.kind = spec.kind; this.bubble = !K.rig;
    Object.assign(this, { hp: spec.hp, maxHp: spec.hp, pending: 0, alive: true, mode: 'approach', t: 0, waitT: 0, radius: K.r, slot: new V3(), pos: new V3(), from: new V3(), flick: 0, ph: rand(0, TAU) });
    // avispa: amagos de picar (se lanza hacia tu cara y se retira) y el abdomen que se dobla para clavar el aguijón
    Object.assign(this, { feint: 0, feintT: rand(1.2, 2.2), feintOn: false, curl: 0, ch: 0, off: new V3() });
    if (this.bubble) {
      this.root = new THREE.Group();
      this.mat = bubbleMat();
      this.shell = new THREE.Mesh(bubbleGeo, this.mat); this.shell.scale.setScalar(K.r); this.shell.renderOrder = 2; this.root.add(this.shell); // (después de su brillo de dentro, que si no taparía)
      this.core = glowSprite(0xffffff, K.r * (K.boss ? 1.0 : 1.3), 0.25); this.root.add(this.core);
      if (K.boss) { // un ojo atrapado dentro que te sigue
        this.eye = new THREE.Group(); this.root.add(this.eye);
        const ball = new THREE.Mesh(bubbleGeo, eyeWhite); ball.scale.setScalar(0.055); this.eye.add(ball);
        const iris = new THREE.Mesh(bubbleGeo, eyeIris); iris.scale.set(0.028, 0.028, 0.012); iris.position.z = 0.047; this.eye.add(iris);
        const pupil = new THREE.Mesh(bubbleGeo, eyePupil); pupil.scale.set(0.012, 0.016, 0.006); pupil.position.z = 0.058; this.eye.add(pupil);
      }
    } else {
      this.inst = RIGS[K.rig].instance(K.wasp ? MAT_STINGER : MAT_DRONE); this.root = this.inst.root; this.B = this.inst.bones;
      this.root.scale.setScalar(K.scale);
    }
    if (K.boss) { this.bar = makeHpBar(this.root, this.bubble ? K.r + 0.05 : 0.2, this.bubble ? 0.24 : 0.3); setHpBar(this.bar, 1); }
    if (eqKind() === 'door') { this.guide = new THREE.Mesh(guideGeo, guideMat); this.guide.scale.setScalar(1 / (K.scale || 1)); this.guide.position.y = -(K.r + 0.02) / (K.scale || 1); this.root.add(this.guide); }
    arena.add(this.root);
    this.side = barNextSide(); // por un lado (izquierda y derecha, por turnos: los dos brazos por igual) o al centro
    barSlot(this.slotIndex(), this.slot, this.side);
    if (this.side) { // por los lados: llega en diagonal, desde delante y desde su lado (algo por encima), y se para apartado
      // del centro; así se le ve venir sin girar mucho la cabeza (de lado del todo, en el remo había que mirar a un costado)
      const F = barFront(arena.localToWorld(barTopPoint(_bw)), _bq), L = barLat(_ba).applyAxisAngle(_up, arena.rotation.y); // (delante, desde el centro; barLat da el eje en el arena)
      const w = arena.localToWorld(_bw.copy(this.slot)); w.addScaledVector(F, 1.9).addScaledVector(L, this.side * 1.5); w.y += eqKind() === 'door' ? rand(0.15, 0.35) : rand(0.5, 0.8);
      this.pos.copy(arena.worldToLocal(w));
      if (!this.bubble) { this.buzz = buzzLoop(spec.kind, arena.localToWorld(_bw.copy(this.pos))); if (K.wasp) SND.hiss(arena.localToWorld(_bw.copy(this.pos)), K.boss ? 0.6 : 0.9, 'wasp'); }
    } else if (this.bubble) { // llega flotando desde delante: en la barra, desde donde miras; en el remo, desde los pies y desde arriba
      const w = arena.localToWorld(_bw.copy(this.slot)), dir = barFront(w, _ba);
      w.addScaledVector(dir, 3.2).add(_bq.set(rand(-0.5, 0.5) * -dir.z, eqKind() === 'door' ? rand(0.1, 0.4) : rand(0.6, 1.0), rand(-0.5, 0.5) * dir.x));
      this.pos.copy(arena.worldToLocal(w));
    } else { // sale de una compuerta y vuela recto
      const g = pick(liveGates()), r = g.g.rotation.y; g.openT = Math.min(10, 1.2 + dv('barArrive'));
      this.pos.set(g.x - 0.6 * Math.sin(r), 1.5 * g.scale, g.z - 0.6 * Math.cos(r));
      this.buzz = buzzLoop(spec.kind, arena.localToWorld(_bw.copy(this.pos)));
      if (K.wasp) SND.hiss(arena.localToWorld(_bw.copy(this.pos)), K.boss ? 0.6 : 0.9, 'wasp');
    }
    this.speed = Math.max(0.2, this.pos.distanceTo(this.slot) / dv('barArrive'));
    this.root.position.copy(this.pos);
  }
  center(out) { if (this.deadAt) return out.copy(this.deadAt); this.root.getWorldPosition(out); return out; } // (reventado: donde estaba; ver Flyer.center)
  slotIndex() { let i = 0; for (const o of enemies) { if (o === this) break; if (o.type === 'target' && o.alive && (o.mode === 'approach' || o.mode === 'wait')) i++; } return i; }
  update(dt, t) {
    this.t += dt; const play = state === 'play', idx = this.slotIndex();
    if (this.mode === 'approach' || this.mode === 'wait') barSlot(idx, this.slot, this.side);
    // si la cabeza lo alcanza mientras subes, revienta aunque no haya llegado a su sitio y esa subida cuenta como
    // repetición. Solo subiendo: colgado o bajando, un roce no regala nada
    if (play && this.alive && (this.mode === 'approach' || this.mode === 'wait') && !BAR.contact && BAR.det === 'rising' && arena.localToWorld(_bw.copy(this.pos)).distanceTo(head.p) < this.radius + 0.09) {
      // cuenta como la repetición de esta subida (si era el último, la oleada acaba ya y la subida no llegaría a contar)
      BAR.contact = true; registerRep(false, false); if (combo % 10 !== 0) say('¡Bien!', '#ffffff', 0.7, false);
      this.onHit(1, false); if (!this.alive) { onKilled(this); return; } // el jefe necesita varios cabezazos
    }
    if (this.mode === 'approach') {
      if (play || state === 'mount') {
        const to = tmpA.subVectors(this.slot, this.pos), d = to.length();
        if (d < 0.03) { this.mode = 'wait'; this.waitT = 0; } else this.pos.addScaledVector(to.divideScalar(d), Math.min(d, this.speed * dt));
      }
    } else if (this.mode === 'wait') {
      this.pos.lerp(this.slot, 1 - Math.exp(-dt * 6));
      if (!idx && play && settings.barWait > 0) { this.waitT += dt; if (this.waitT > settings.barWait) this.timeout(); }
    } else if (this.mode === 'attack' && this.K.wasp) { // carga (se echa atrás doblada) y se lanza a picarte en la cara
      const W = 0.45, aim = _ba.copy(HL).add(_bw.set(0, -0.05, 0)), back = _bq.subVectors(aim, this.from).normalize().multiplyScalar(-0.12);
      if (this.t < W) { const k = smooth(this.t / W); this.ch = k; this.curl = Math.max(this.curl, 0.85); this.pos.copy(this.from).addScaledVector(back, k); }
      else {
        const k = Math.min(1, (this.t - W) / 0.3); this.ch = 1; this.curl = 1; this.pos.copy(this.from).add(back).lerp(aim, smooth(k));
        if (k >= 1) { const c = this.center(new V3()); hurtPlayer(this); say('¡Te ha picado!', '#ff3b5c', 1.2); SND.hiss(c, 0.5, 'wasp'); fx.ichor(c, 6, 0.6); fx.glow(c, [0.4, 1, 0.3], 0.25, 0.15); this.mode = 'flee'; this.t = 0; this.from.copy(this.pos); }
      }
    } else if (this.mode === 'flee') {
      const k = Math.min(1, this.t / 1.2); this.curl = Math.max(0, 1 - this.t * 2); this.ch = Math.max(0, 1 - this.t * 3);
      this.pos.copy(this.from).add(_bq.set(Math.sin(this.ph) * 1.5 * k, 1.2 * k, -2.2 * k)); this.root.scale.setScalar(this.K.scale * (1 - k * 0.7));
      if (k >= 1) { this.alive = false; this.dispose(); return; }
    } else if (this.mode === 'attack') {
      const k = Math.min(1, this.t / 0.3); this.pos.lerpVectors(this.from, HL, k);
      if (k >= 1) {
        const c = this.center(new V3());
        fx.explosion(c, 0.3, false); SND.explosion(c, false);
        hurtPlayer(this); this.alive = false; this.dispose(); return;
      }
    } else if (this.mode === 'leave') {
      const k = Math.min(1, this.t / 1.1); this.pos.y += dt * 0.5; this.mat.uniforms.uOpacity.value = 1 - k; this.core.material.opacity = 0.25 * (1 - k);
      if (k >= 1) { SND.pop(this.center(new V3()), false); this.alive = false; this.dispose(); return; }
    }
    // aspecto
    const wait = this.mode === 'wait';
    this.root.position.copy(this.pos); if (wait) this.root.position.y += Math.sin(t * 2.4 + this.ph) * 0.012;
    if (this.flick > 0) this.flick = Math.max(0, this.flick - dt);
    if (this.bubble) {
      const w = Math.sin(t * 7 + this.ph) * 0.06, r = this.K.r * (1 - this.flick * 0.8);
      this.shell.scale.set(r * (1 + w), r * (1 - w), r * (1 + w * 0.5));
      this.mat.uniforms.uTime.value = t;
      if (this.eye) this.eye.lookAt(head.p);
    } else if (this.K.wasp) this.animWasp(dt, t, idx, play);
    else {
      const look = arena.worldToLocal(tmpB.copy(head.p)); this.root.lookAt(arena.localToWorld(tmpB.set(look.x, this.pos.y + (look.y - this.pos.y) * 0.3, look.z)));
      const B = this.B;
      for (let i = 0; i < 6; i++) { const r = B['r' + i]; if (r) r.rotation.y += dt * (55 + i * 3); }
      if (this.inst.meshes.glow) this.inst.meshes.glow.visible = this.flick <= 0 || Math.random() < 0.5;
      if (this.buzz) this.buzz.set(this.center(tmpB));
    }
    if (this.bar) this.bar.g.lookAt(head.p);
    if (this.guide) { this.guide.visible = (this.mode === 'wait' || this.mode === 'approach') && !idx; if (this.root.quaternion) this.guide.quaternion.copy(this.root.quaternion).invert(); }
  }
  // Avispa: vuela nivelada, como un insecto, girada hacia ti; su cara te mira sin parar y el abdomen va doblado por
  // debajo con el aguijón apuntando a tu cara mientras se acerca. En su sitio amaga picarte: se lanza hacia ti y se
  // retira, más a menudo cuanto más esperas. El cabezazo cuenta en su sitio, no en el amago.
  animWasp(dt, t, idx, play) {
    const B = this.B, wait = this.mode === 'wait', toH = _bq.subVectors(HL, this.pos), dist = toH.length();
    // amago: carga (se echa un poco atrás con el aguijón y la cabeza cargados), se lanza hacia ti y vuelve
    if (wait && play && !idx) {
      this.feintT -= dt * (1 + Math.min(2, this.waitT / 4));
      if (!this.feintOn && this.feintT <= 0 && BAR.det !== 'rising' && dist > 0.4) { this.feintOn = true; this.feint = 0; if (Math.random() < 0.6) SND.hiss(this.center(_bw), this.K.boss ? 0.6 : 0.9, 'wasp'); }
      if (this.feintOn) {
        const was = this.feint; this.feint += dt / 1.0;
        if (was < 0.45 && this.feint >= 0.45) SND.whoosh(this.center(_bw));
        if (this.feint >= 1 || BAR.det === 'rising') { this.feintOn = false; this.feint = 0; this.feintT = rand(1.2, 2.6); }
      }
    } else { this.feintOn = false; this.feint = 0; }
    const p = this.feint, F = this.feintOn;
    const lunge = !F ? 0 : p < 0.45 ? -smooth(p / 0.45) * 0.3 : p < 0.6 ? -0.3 + 1.3 * smooth((p - 0.45) / 0.15) : p < 0.75 ? 1 : 1 - smooth((p - 0.75) / 0.25);
    if (this.mode !== 'attack' && this.mode !== 'flee') this.ch += ((F ? (p < 0.75 ? Math.min(1, p / 0.4) : 1 - smooth((p - 0.75) / 0.25)) : 0) - this.ch) * Math.min(1, dt * 12);
    const ch = this.ch, reach = Math.max(0, dist - 0.3) * 0.75;
    const zig = this.mode === 'approach' ? 0.12 : 0.025 * (1 - ch);
    this.off.set(Math.sin(t * 3.1 + this.ph) * zig, Math.sin(t * 4.3 + this.ph * 2) * zig * 0.6, Math.sin(t * 2.3 + this.ph) * zig * 0.5);
    if (dist > 1e-3) this.off.addScaledVector(toH, (lunge > 0 ? lunge * reach : lunge * 0.3) / dist);
    this.root.position.add(this.off);
    if (this.mode === 'approach' || this.mode === 'wait') this.curl += ((F ? 1 : 0.85 + 0.08 * Math.sin(t * 2 + this.ph)) - this.curl) * Math.min(1, dt * 8);
    // el cuerpo, casi horizontal y girado hacia ti (solo se inclina un poco); la cabeza y el aguijón te apuntan
    const rp = this.root.position, lx = HL.x - rp.x, ly = HL.y - rp.y, lz = HL.z - rp.z, hd = Math.hypot(lx, lz), pitch = Math.atan2(ly, Math.max(1e-3, hd));
    this.root.rotation.set(0, 0, 0); this.root.rotation.order = 'YXZ'; this.root.rotation.y = Math.atan2(lx, lz); this.root.rotation.x = -clamp(pitch, -0.35, 0.35);
    flapStinger(B, this.t);
    B.body.rotation.z = Math.sin(t * 3.1 + this.ph) * 0.2 * (1 - ch); B.body.position.y = Math.sin(t * 9 + this.ph) * 0.004;
    poseStinger(B, this.root, t, this.ph, this.curl, ch);
    B.head.rotation.y = Math.sin(t * 1.9 + this.ph) * 0.08 * (1 - ch); B.head.rotation.z = Math.sin(t * 2.7) * 0.08 * (1 - ch);
    if (this.inst.meshes.glow) this.inst.meshes.glow.visible = this.flick <= 0 || Math.random() < 0.5;
    if (this.buzz) this.buzz.set(this.center(tmpB));
  }
  onHit(dmg, perfect) {
    this.hp -= dmg; this.flick = 0.3; if (this.bar) setHpBar(this.bar, this.hp / this.maxHp);
    if (this.hp <= 0) { this.pop(); return; }
    const c = this.center(new V3());
    if (this.bubble) { SND.pop(c, false); fx.droplets(c, 8, [0.45, 1, 0.85], 1, 0.025); } else { SND.metalHit(c, false); fx.sparks(c, 8, [1, 0.6, 0.2], 2, 0.03); }
  }
  pop() {
    this.alive = false; const c = this.center(new V3()), big = !!this.K.boss; this.deadAt = c.clone();
    if (this.bubble) { // revienta salpicando gotas irisadas y un destello de película
      SND.pop(c, big); for (const col of BUBBLE_SPLASH) fx.droplets(c, big ? 14 : 8, col, big ? 2.4 : 1.9, big ? 0.04 : 0.032);
      fx.glow(c, [1, 1, 1], big ? 0.5 : 0.3, 0.1); // (solo revienta: sin chispas ni estrellas de cómic)
    }
    else if (this.K.wasp) { fx.ichor(c, big ? 30 : 20, big ? 1.8 : 1.3); fx.glow(c, [0.6, 1, 0.3], big ? 0.5 : 0.3, 0.12); SND.squish(c); rigDebris(this.inst, c, big ? 2.4 : 1.7, 0, { main: M.robotStaticWasp }); }
    else { fx.explosion(c, big ? 0.7 : 0.35, big); SND.explosion(c, big); rigDebris(this.inst, c, big ? 2.4 : 1.6, 0.5, { main: M.carbonStatic }); }
    this.dispose();
  }
  // No llegaste a tiempo: vuelve a la cola de la oleada; el bicho te pica y la pompa se escapa
  timeout() {
    spawnQueue.push({ kind: this.kind, hp: this.hp }); this.hp = 0; combo = 0; this.t = 0; boardDirty = true;
    if (this.bubble) { this.mode = 'leave'; say('Se escapó', '#ff8a3d', 1.0); SND.miss(); }
    else { this.mode = 'attack'; this.from.copy(this.pos); SND.whoosh(this.center(tmpB)); if (this.K.wasp) SND.hiss(this.center(tmpB), 0.7, 'wasp'); }
  }
  dispose() {
    arena.remove(this.root);
    if (this.inst) this.inst.skel.dispose();
    if (this.mat) { this.mat.dispose(); this.core.material.dispose(); }
    if (this.buzz) { this.buzz.stop(); this.buzz = null; }
  }
}
function buildBarWave(i) {
  if (settings.exercise === 'hang') return [];
  let total = waveReps(i); const list = [], bugs = settings.barTarget === 'bugs';
  let boss = null;
  if (isBossWave(i)) { const b = Math.min(total, Math.min(5, Math.max(3, Math.round(total * 0.2)))); boss = { kind: bugs ? 'queen' : 'bigbubble', hp: b }; total -= b; }
  for (let k = 0; total > 0; k++, total--) list.push({ kind: bugs ? 'wasp' : 'bubble', hp: 1 });
  if (boss) list.push(boss);
  return list;
}

/* =================== COLOCAR LOS APARATOS =================== */
// Modo colocación: el atril se oculta, vas al aparato y lo agarras con las dos manos por encima de la cabeza.
// Si las manos se quedan quietas PLACE_HOLD segundos, la media de esas posiciones es el aparato.
// Después aparece el atril con los ajustes finos (altura, ancho, mover, girar).
const PLACE_HOLD = 5;
const PLACE = { on: false, t: 0, kind: 'door', back: null, seen: false, up: false, ok: false, lostT: 0, n: 0, sumL: new V3(), sumR: new V3(), wait: false, waitT: 0, note: '' };
const _pl1 = new V3(), _pl2 = new V3(), _pl3 = new V3(), _pl4 = new V3();
// Punto de agarre: entre la base del dedo corazón y el nudillo (o el mando)
function gripPoint(side, out) {
  const h = hands[side]; if (!h.ok) return null;
  if (h.isHand) { const a = h.J[10], b = h.J[11]; return a.ok && b.ok ? out.lerpVectors(a.p, b.p, 0.75) : null; }
  return out.copy(h.wrist);
}
// Línea luminosa entre las manos: lo que se está midiendo
const placeLineMat = new THREE.MeshBasicMaterial({ color: 0x3cf0c6, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
const placeLine = new THREE.Mesh(G.cylRaw(0.012, 0.012, 1, 8), placeLineMat); placeLine.visible = false; placeLine.renderOrder = 24; scene.add(placeLine);
function placeReset() { PLACE.t = 0; PLACE.n = 0; PLACE.sumL.set(0, 0, 0); PLACE.sumR.set(0, 0, 0); }
function startPlace(back, note) {
  const k = eqKind(); hideMenu();
  if (EQ.edit !== k) { EQ.edit = k; eqPose(k).anchor = null; } // al terminar se crea un ancla nueva
  Object.assign(PLACE, { on: true, kind: k, back, lostT: 0, wait: false, seen: false, up: false, ok: false, note: note || '' }); placeReset();
  center.mesh.visible = true; drawCenter(); SND.click();
}
function cancelPlace() {
  if (!PLACE.on && !PLACE.wait) return;
  PLACE.on = PLACE.wait = false; placeLine.visible = false; center.mesh.visible = false; SND.click();
  const back = PLACE.back; placeDone(); if (back) back();
}
function updatePlace(dt) {
  if (PLACE.wait) { // ya está colocado: el atril aparece cuando estés de pie
    PLACE.waitT += dt;
    if (PLACE.waitT > 1.2 && head.p.y > 1.1 && head.speed < 0.6) { PLACE.wait = false; center.mesh.visible = false; adjustMenu(PLACE.back); }
    return;
  }
  if (!PLACE.on) { placeLine.visible = false; return; }
  const L = gripPoint('left', _pl1), R = gripPoint('right', _pl2), hy = head.p.y;
  PLACE.seen = !!(L && R);
  PLACE.up = PLACE.seen && L.y > hy + 0.12 && R.y > hy + 0.12;
  const d = PLACE.seen ? Math.hypot(R.x - L.x, R.z - L.z) : 0;
  PLACE.ok = PLACE.up && d > 0.22 && d < (PLACE.kind === 'door' ? 1.5 : 1.1) && Math.abs(R.y - L.y) < 0.15;
  if (PLACE.seen) {
    const mid = _pl3.addVectors(L, R).multiplyScalar(0.5), dir = _pl4.subVectors(R, L), len = Math.max(0.01, dir.length());
    placeLine.visible = true; placeLine.position.copy(mid); placeLine.quaternion.setFromUnitVectors(_up, dir.divideScalar(len)); placeLine.scale.set(1, len, 1);
    placeLineMat.color.setHex(PLACE.ok ? 0x3cf0c6 : 0xff8a3d);
  } else placeLine.visible = false;
  if (PLACE.ok) {
    PLACE.lostT = 0;
    // si las manos se mueven más de 5 cm de su posición media, la cuenta empieza de nuevo
    if (PLACE.n && _pl4.addVectors(PLACE.sumL, PLACE.sumR).multiplyScalar(0.5 / PLACE.n).distanceTo(_pl3) > 0.05) placeReset();
    PLACE.sumL.add(L); PLACE.sumR.add(R); PLACE.n++;
    const before = PLACE.t; PLACE.t += dt;
    if (Math.floor(before) !== Math.floor(PLACE.t)) SND.beep(1 + Math.floor(PLACE.t) * 0.12);
    if (PLACE.t >= PLACE_HOLD) placeConfirm();
  } else { PLACE.lostT += dt; if (PLACE.lostT > 0.5) placeReset(); } // se perdonan cortes breves del seguimiento
}
function placeConfirm() {
  const k = PLACE.kind, L = PLACE.sumL.divideScalar(PLACE.n), R = PLACE.sumR.divideScalar(PLACE.n);
  placeFromHands(k, L, R);
  PLACE.on = false; PLACE.wait = true; PLACE.waitT = 0; placeLine.visible = false; SND.charge(); SND.perfect();
  drawCenter();
}
function placeFromHands(k, L, R) {
  const e = eqPose(k), dx = R.x - L.x, dz = R.z - L.z, mid = _pl3.addVectors(L, R).multiplyScalar(0.5);
  // barra de puerta y paralela única: las manos van a lo largo de la barra; con dos paralelas, una en cada barra
  const one = k === 'dip' && dipOne();
  e.x = mid.x; e.z = mid.z; e.yaw = one ? Math.atan2(dx, dz) : Math.atan2(-dz, dx);
  if (k === 'door') setSetting('doorH', Math.round((mid.y + 0.015) * 100));
  else { setSetting('dipH', Math.round((mid.y + 0.015) * 100)); if (!one) setSetting('dipGap', Math.round(Math.hypot(dx, dz) * 100)); }
  equipChanged(k);
  PLACE.note = k === 'door' ? `Barra colocada a ${settings.doorH} cm de altura` : one ? `Paralela colocada a ${settings.dipH} cm de altura` : `Paralelas colocadas: ${settings.dipH} cm de alto, ${settings.dipGap} cm entre ellas`;
}
function placeInFront(k) { const e = eqPose(k), f = fwdH(), d = k === 'door' ? 0.25 : 0.55; e.x = head.p.x + f.x * d; e.z = head.p.z + f.z * d; e.yaw = yawOf(head.q); equipChanged(k); }
function nudgeEquip(k, side, ahead, rot) { const e = eqPose(k), f = fwdH(); e.x += -f.z * side + f.x * ahead; e.z += f.x * side + f.z * ahead; e.yaw += rot; equipChanged(k); PLACE.note = ''; }
// Ajustes finos, una vez colocado con las manos
function adjustMenu(back) {
  const k = eqKind(), door = k === 'door', e = eqPose(k), deg = Math.PI / 180;
  if (EQ.edit !== k) { EQ.edit = k; e.anchor = null; }
  const nm = eqName(k), what = `${nm.the} ${nm.pl ? 'virtuales coincidan' : 'virtual coincida'}`;
  const note = PLACE.note ? `${PLACE.note}. Ajusta hasta que ${what} con la real.` : e.set ? `Ajusta hasta que ${what} con la real` : `Aún no ${nm.pl ? 'están colocadas' : 'está colocada'}: pulsa Colocar con las manos`;
  const rows = [
    { t: 'title', text: 'AJUSTAR ' + nm.name.toUpperCase() },
    { t: 'text', text: note, color: PLACE.note ? '#3cf0c6' : e.set ? '#d8d3f5' : '#ffd166' },
    ...(door ? [] : [{ t: 'field', key: 'dipBars', after: () => adjustMenu(back) }]),
    { t: 'field', key: door ? 'doorH' : 'dipH' },
    door ? { t: 'field', key: 'doorW' } : dipOne() ? { t: 'field', key: 'dipLen' } : { t: 'field', key: 'dipGap' }
  ];
  if (!door && !dipOne()) rows.push({ t: 'field', key: 'dipLen' });
  rows.push({ t: 'btns', items: [['Izquierda', -0.01, 0], ['Derecha', 0.01, 0], ['Acercar', 0, -0.01], ['Alejar', 0, 0.01]].map(([label, sx, fz]) => ({ label, onPress: () => nudgeEquip(k, sx, fz, 0) })) });
  rows.push({ t: 'btns', items: [{ label: 'Girar izquierda', onPress: () => nudgeEquip(k, 0, 0, deg) }, { label: 'Girar derecha', onPress: () => nudgeEquip(k, 0, 0, -deg) }, { label: 'Delante de mí', onPress: () => { placeInFront(k); PLACE.note = ''; adjustMenu(back); } }] });
  rows.push({ t: 'text', text: 'Cada pulsación mueve 1 cm o gira 1°', color: '#a49fc8' });
  rows.push({ t: 'btns', items: [{ label: 'Colocar con las manos', onPress: () => startPlace(back) }, { label: 'Listo', style: 'primary', onPress: () => { placeDone(); back(); } }] });
  const m = openMenu(rows, { border: '#3cf0c6' }); m.rebuild = () => adjustMenu(back);
}
function placeDone() {
  const k = EQ.edit; PLACE.on = PLACE.wait = false; PLACE.note = ''; placeLine.visible = false;
  if (!k) return; EQ.edit = null; if (eqPose(k).set) { equipChanged(k); equipCommit(k); }
}
