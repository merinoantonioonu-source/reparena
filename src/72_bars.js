
/* =================== MODO BARRAS: REMO INVERTIDO, DOMINADAS Y COLGADO =================== */
// La repetición se mide por la altura del visor y cuenta al subir. Cada una revienta con la cabeza el objetivo
// que espera en el punto más alto del recorrido. Bajo la barra de dominadas hay un charco con tentáculos: si te sueltas, caes.
const BAR = { phase: 'place', t: 0, still: 0, ref: 1, hangRef: 1, refXZ: new V3(), drift: new V3(), front: new V3(), det: 'down', max: 0, t0: 0, hold: 0, letGo: 0, need: 0, nextWave: 0, resume: false, started: false, mountXZ: new V3(), board: null };
const barReq = () => (settings.exercise === 'row' ? settings.rowRange : settings.pullRange) / 100;
const _bl = new V3(), _bq = new V3(), _bw = new V3(), _ba = new V3();
function barReset() { Object.assign(BAR, { phase: 'place', t: 0, still: 0, det: 'down', letGo: 0, hold: 0, need: 0, nextWave: 0, resume: false, started: false, board: null }); BAR.drift.set(0, 0, 0); }
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
  if (BAR.resume) { BAR.resume = false; state = 'play'; stateT = 0; say('¡Sigue!', '#3cf0c6', 1.2); }
  else startWave(BAR.nextWave);
  BAR.started = true;
}
// En el remo miras al techo: el marcador se coloca encima de tu cara, mirándote
const _rbm = new THREE.Matrix4(), _rbx = new V3(), _rby = new V3(), _rbz = new V3(), _rbs = new V3(), _rbq = new Q4();
function placeRowBoard(fromHead) {
  const rig = boardRig.children[0]; if (!rig) return;
  if (fromHead || !BAR.board) {
    _rby.set(0, 1, 0).applyQuaternion(head.q);
    const P = head.p.clone().addScaledVector(fwd(), 1.25).addScaledVector(_rby, -0.6); P.y = Math.max(P.y, head.p.y + 0.5);
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
  const at = new V3(head.p.x, 0.03, head.p.z), door = eqKind() === 'door';
  if (door) poolGrab(at); else { SND.partial(); fx.glow(at, [1, 0.5, 0.3], 0.5, 0.2); }
  hurtPlayer({ silent: true }); if (state === 'end') return;
  say(door ? '¡AL CHARCO!' : '¡TE SOLTASTE!', door ? '#3cff8a' : '#ff8a3d', 1.8);
  barToMount(0, true);
}
function barDetect(t, dt) {
  if (state !== 'play') return;
  const y = head.p.y, margin = settings.fallMargin / 100;
  // la posición colgado solo se reajusta quieto abajo: bajar despacio también cuenta como caída
  if (BAR.det === 'down' && head.speed < 0.05) BAR.hangRef += (BAR.ref - BAR.hangRef) * Math.min(1, dt * 0.3);
  // soltarse: las manos a la vista por debajo de la barra (al caer de pie la cabeza no siempre baja)
  const off = handsLow(); BAR.letGo = off.low >= 2 || (off.low === 1 && off.ok === 1) ? BAR.letGo + dt : 0;
  if (y < BAR.hangRef - margin || BAR.letGo > (off.low >= 2 ? 0.25 : 0.6) || Math.hypot(head.p.x - BAR.mountXZ.x, head.p.z - BAR.mountXZ.z) > 0.75) { BAR.letGo = 0; barFall(); return; }
  if (settings.exercise === 'hang') {
    const before = BAR.hold; BAR.hold += dt; stats.hold += dt;
    if (Math.floor(BAR.hold) > Math.floor(before)) {
      score += 10; combo++; stats.bestCombo = Math.max(stats.bestCombo, combo); boardDirty = true;
      const s = Math.floor(BAR.hold), left = Math.ceil(BAR.need - BAR.hold);
      if (left > 0 && left <= 3) SND.beep(1 + (3 - left) * 0.25);
      else if (left > 0 && s % 10 === 0) { say(`¡${s} s!`, '#3cf0c6', 1.0); SND.combo(); }
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
}
function barRep(opts) {
  if (state !== 'play' || settings.exercise === 'hang') return;
  registerRep(opts.perfect, false);
  if (combo % 10 !== 0) { if (opts.perfect) say('¡PERFECTA!', '#3cf0c6', 1.0); else if (opts.fast) say('Más controlado', '#ffffff', 1.0); else say('¡Bien!', '#ffffff', 0.7, false); }
  if (opts.perfect) SND.perfect();
  let tg = frontTarget();
  if (!tg && spawnQueue.length) { spawnFromQueue(); spawnTimer = spawnInterval; tg = frontTarget(); } // ninguna repetición se pierde
  if (!tg) return;
  // si todavía no ha llegado, la onda del cabezazo lo alcanza igual
  const c = tg.center(new V3()), h = head.p.clone().add(_ba.set(0, 0.08, 0));
  if (c.distanceTo(h) > 0.35) for (let i = 0; i <= 10; i++) fx.trail(h.clone().lerp(c, i / 10), [0.3, 1, 0.85], 0.06, 0.3);
  tg.onHit(opts.perfect ? 2 : 1, opts.perfect); if (!tg.alive) onKilled(tg);
}

/* ---------- Objetivos que se revientan con la cabeza ---------- */
const TGT = { bubble: { r: 0.085 }, bigbubble: { r: 0.15, boss: true }, drone: { rig: 'drone', scale: 0.65, r: 0.13 }, hornet: { rig: 'hornet', scale: 1.7, r: 0.09 }, carrier: { rig: 'carrier', scale: 1.3, r: 0.28, boss: true } };
const bubbleGeo = new THREE.SphereGeometry(1, 28, 18);
// línea que baja del objetivo hacia tu cara: indica dónde está aunque quede por encima de la vista
const guideGeo = G.cylRaw(0.003, 0.003, 0.4, 6); guideGeo.translate(0, -0.2, 0);
const guideMat = new THREE.MeshBasicMaterial({ color: 0x3cf0c6, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
const eyeWhite = std({ color: 0xf2eee6, roughness: 0.25 }), eyeIris = new THREE.MeshBasicMaterial({ color: 0xff3020, toneMapped: false }), eyePupil = new THREE.MeshBasicMaterial({ color: 0x050303 });
const frontTarget = () => enemies.find(e => e.type === 'target' && e.alive && (e.mode === 'approach' || e.mode === 'wait'));
// Punto más alto previsto de la cabeza (coordenadas de la arena) y hueco de espera del siguiente
function barTopPoint(out) {
  out.set(BAR.refXZ.x + BAR.drift.x + BAR.front.x, BAR.ref + barReq() + 0.04, BAR.refXZ.z + BAR.drift.z + BAR.front.z);
  if (settings.exercise !== 'row') out.y = Math.min(out.y, settings.doorH / 100 - 0.06);
  return out;
}
function barSlot(idx, out) {
  barTopPoint(out); if (!idx) return out;
  const e = eqPose(), w = arena.localToWorld(_bw.copy(out));
  if (eqKind() === 'door') eqAxes(e, _ba); else { _ba.set(w.x - e.x, 0, w.z - e.z); if (_ba.lengthSq() < 1e-4) eqAxes(e, null, _ba); _ba.normalize(); }
  w.addScaledVector(_ba, 0.42 * idx); w.y += 0.06;
  return out.copy(arena.worldToLocal(w));
}
class HeadTarget {
  constructor(spec) {
    const K = TGT[spec.kind]; this.K = K; this.type = 'target'; this.kind = spec.kind; this.bubble = !K.rig;
    Object.assign(this, { hp: spec.hp, maxHp: spec.hp, pending: 0, alive: true, mode: 'approach', t: 0, waitT: 0, radius: K.r, slot: new V3(), pos: new V3(), from: new V3(), flick: 0, ph: rand(0, TAU) });
    if (this.bubble) {
      this.root = new THREE.Group();
      this.mat = std({ color: 0x9fffe8, transparent: true, opacity: 0.32, roughness: 0.04, metalness: 0.2, envMapIntensity: 2.5, depthWrite: false });
      this.shell = new THREE.Mesh(bubbleGeo, this.mat); this.shell.scale.setScalar(K.r); this.root.add(this.shell);
      this.core = glowSprite(0x3cf0c6, K.r * (K.boss ? 1.0 : 1.5), 0.7); this.root.add(this.core);
      if (K.boss) { // un ojo atrapado dentro que te sigue
        this.eye = new THREE.Group(); this.root.add(this.eye);
        const ball = new THREE.Mesh(bubbleGeo, eyeWhite); ball.scale.setScalar(0.055); this.eye.add(ball);
        const iris = new THREE.Mesh(bubbleGeo, eyeIris); iris.scale.set(0.028, 0.028, 0.012); iris.position.z = 0.047; this.eye.add(iris);
        const pupil = new THREE.Mesh(bubbleGeo, eyePupil); pupil.scale.set(0.012, 0.016, 0.006); pupil.position.z = 0.058; this.eye.add(pupil);
      }
    } else {
      this.inst = RIGS[K.rig].instance(spec.kind === 'hornet' ? MAT_WASP : MAT_DRONE); this.root = this.inst.root; this.B = this.inst.bones;
      this.root.scale.setScalar(K.scale);
    }
    if (K.boss) { this.bar = makeHpBar(this.root, this.bubble ? K.r + 0.05 : 0.2, this.bubble ? 0.24 : 0.3); setHpBar(this.bar, 1); }
    if (eqKind() === 'door') { this.guide = new THREE.Mesh(guideGeo, guideMat); this.guide.scale.setScalar(1 / (K.scale || 1)); this.guide.position.y = -(K.r + 0.02) / (K.scale || 1); this.root.add(this.guide); }
    arena.add(this.root);
    barSlot(this.slotIndex(), this.slot);
    if (this.bubble) { // llega flotando desde delante: en la barra, desde donde miras; en el remo, desde los pies y desde arriba
      const e = eqPose(), w = arena.localToWorld(_bw.copy(this.slot)), dir = _ba;
      if (eqKind() === 'door') { dir.copy(fwdH()); eqAxes(e, null, _bq); if (_bq.dot(dir) < 0) _bq.negate(); if (_bq.dot(dir) > 0.5) dir.copy(_bq); }
      else { dir.set(e.x - w.x, 0, e.z - w.z); if (dir.lengthSq() < 1e-4) eqAxes(e, null, dir); dir.normalize(); }
      w.addScaledVector(dir, 3.2).add(_bq.set(rand(-0.5, 0.5) * -dir.z, eqKind() === 'door' ? rand(0.1, 0.4) : rand(0.6, 1.0), rand(-0.5, 0.5) * dir.x));
      this.pos.copy(arena.worldToLocal(w));
    } else { // sale de una compuerta y vuela recto
      const g = pick(gates), r = g.g.rotation.y; g.openT = Math.min(10, 1.2 + settings.barArrive);
      this.pos.set(g.x - 0.6 * Math.sin(r), 1.5 * g.scale, g.z - 0.6 * Math.cos(r));
      this.buzz = buzzLoop(spec.kind, arena.localToWorld(_bw.copy(this.pos)));
    }
    this.speed = Math.max(0.2, this.pos.distanceTo(this.slot) / settings.barArrive);
    this.root.position.copy(this.pos);
  }
  center(out) { this.root.getWorldPosition(out); return out; }
  slotIndex() { let i = 0; for (const o of enemies) { if (o === this) break; if (o.type === 'target' && o.alive && (o.mode === 'approach' || o.mode === 'wait')) i++; } return i; }
  update(dt, t) {
    this.t += dt; const play = state === 'play', idx = this.slotIndex();
    if (this.mode === 'approach' || this.mode === 'wait') barSlot(idx, this.slot);
    if (this.mode === 'approach') {
      if (play || state === 'mount') {
        const to = tmpA.subVectors(this.slot, this.pos), d = to.length();
        if (d < 0.03) { this.mode = 'wait'; this.waitT = 0; } else this.pos.addScaledVector(to.divideScalar(d), Math.min(d, this.speed * dt));
      }
    } else if (this.mode === 'wait') {
      this.pos.lerp(this.slot, 1 - Math.exp(-dt * 6));
      if (!idx && play && settings.barWait > 0) { this.waitT += dt; if (this.waitT > settings.barWait) this.timeout(); }
    } else if (this.mode === 'attack') {
      const k = Math.min(1, this.t / 0.3); this.pos.lerpVectors(this.from, HL, k);
      if (k >= 1) {
        const c = this.center(new V3());
        if (this.kind === 'hornet') { fx.ichor(c, 10, 1); SND.hiss(c, 0.7); } else { fx.explosion(c, 0.3, false); SND.explosion(c, false); }
        hurtPlayer(this); this.alive = false; this.dispose(); return;
      }
    } else if (this.mode === 'leave') {
      const k = Math.min(1, this.t / 1.1); this.pos.y += dt * 0.5; this.mat.opacity = 0.32 * (1 - k); this.core.material.opacity = 0.7 * (1 - k);
      if (k >= 1) { SND.pop(this.center(new V3()), false); this.alive = false; this.dispose(); return; }
    }
    // aspecto
    const wait = this.mode === 'wait';
    this.root.position.copy(this.pos); if (wait) this.root.position.y += Math.sin(t * 2.4 + this.ph) * 0.012;
    if (this.flick > 0) this.flick = Math.max(0, this.flick - dt);
    if (this.bubble) {
      const w = Math.sin(t * 7 + this.ph) * 0.06, r = this.K.r * (1 - this.flick * 0.8);
      this.shell.scale.set(r * (1 + w), r * (1 - w), r * (1 + w * 0.5));
      const h = t * 0.4 + this.ph; this.mat.color.setRGB(0.6 + 0.4 * Math.sin(h), 0.8 + 0.2 * Math.sin(h + 2.1), 0.75 + 0.25 * Math.sin(h + 4.2));
      if (this.eye) this.eye.lookAt(head.p);
    } else {
      const look = arena.worldToLocal(tmpB.copy(head.p)); this.root.lookAt(arena.localToWorld(tmpB.set(look.x, this.pos.y + (look.y - this.pos.y) * 0.3, look.z)));
      const B = this.B;
      if (this.kind === 'hornet') { const f = Math.sin(this.t * 2 * Math.PI * 22) * 0.9, f2 = Math.sin(this.t * 2 * Math.PI * 22 + 0.6) * 0.8; B.wL1.rotation.z = f; B.wR1.rotation.z = -f; B.wL2.rotation.z = f2; B.wR2.rotation.z = -f2; B.abd.rotation.x = 0.25 + Math.sin(this.t * 4) * 0.12; }
      else { for (let i = 0; i < 6; i++) { const r = B['r' + i]; if (r) r.rotation.y += dt * (55 + i * 3); } }
      if (this.inst.meshes.glow) this.inst.meshes.glow.visible = this.flick <= 0 || Math.random() < 0.5;
      if (this.buzz) this.buzz.set(this.center(tmpB));
    }
    if (this.bar) this.bar.g.lookAt(head.p);
    if (this.guide) { this.guide.visible = (this.mode === 'wait' || this.mode === 'approach') && !idx; if (this.root.quaternion) this.guide.quaternion.copy(this.root.quaternion).invert(); }
  }
  onHit(dmg, perfect) {
    this.hp -= dmg; this.flick = 0.3; if (this.bar) setHpBar(this.bar, this.hp / this.maxHp);
    if (this.hp <= 0) { this.pop(); return; }
    const c = this.center(new V3());
    if (this.bubble) { SND.pop(c, false); fx.droplets(c, 8, [0.45, 1, 0.85], 1, 0.025); } else { SND.metalHit(c, false); fx.sparks(c, 8, [1, 0.6, 0.2], 2, 0.03); }
  }
  pop() {
    this.alive = false; const c = this.center(new V3()), big = !!this.K.boss;
    if (this.bubble) { SND.pop(c, big); fx.droplets(c, big ? 40 : 22, [0.45, 1, 0.85], big ? 2.2 : 1.6, big ? 0.04 : 0.03); fx.glow(c, [0.4, 1, 0.9], big ? 0.8 : 0.45, 0.15); fx.sparks(c, 10, [0.5, 1, 0.9], 1.2, 0.02); }
    else if (this.kind === 'hornet') { fx.ichor(c, 18, 1.2); fx.glow(c, [1, 0.8, 0.3], 0.3, 0.1); SND.squish(c); rigDebris(this.inst, c, 1.6, 0, { main: M.robotStaticWasp }); }
    else { fx.explosion(c, big ? 0.7 : 0.35, big); SND.explosion(c, big); rigDebris(this.inst, c, big ? 2.4 : 1.6, 0.5, { main: M.carbonStatic }); }
    this.dispose();
  }
  // No llegaste a tiempo: vuelve a la cola de la oleada; el bicho te pica y la pompa se escapa
  timeout() {
    spawnQueue.push({ kind: this.kind, hp: this.hp }); this.hp = 0; combo = 0; this.t = 0; boardDirty = true;
    if (this.bubble) { this.mode = 'leave'; say('Se escapó', '#ff8a3d', 1.0); SND.miss(); }
    else { this.mode = 'attack'; this.from.copy(this.pos); SND.whoosh(this.center(tmpB)); }
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
  if (isBossWave(i)) { const b = Math.min(total, Math.min(5, Math.max(3, Math.round(total * 0.2)))); boss = { kind: bugs ? 'carrier' : 'bigbubble', hp: b }; total -= b; }
  for (let k = 0; total > 0; k++, total--) list.push({ kind: bugs ? (i >= 1 && k % 3 === 2 ? 'hornet' : 'drone') : 'bubble', hp: 1 });
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
    if (PLACE.waitT > 1.2 && head.p.y > 1.1 && head.speed < 0.6) { PLACE.wait = false; center.mesh.visible = false; adjustMenu(PLACE.back, true); }
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
function adjustMenu(back, reanchor) {
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
  const m = openMenu(rows, { border: '#3cf0c6', reanchor }); m.rebuild = () => adjustMenu(back);
}
function placeDone() {
  const k = EQ.edit; PLACE.on = PLACE.wait = false; PLACE.note = ''; placeLine.visible = false;
  if (!k) return; EQ.edit = null; if (eqPose(k).set) { equipChanged(k); equipCommit(k); }
}
