
/* =================== ESTADO DE PARTIDA =================== */
const GAME_STATES = ['calib', 'ready', 'mount', 'play', 'rest'];
let state = 'idle', preview = false, xrActive = false;
let enemies = [], arcs = [], projs = [], spawnQueue = [], spawnTimer = 0, spawnInterval = 3, waveIdx = 0, waveTarget = 0, waveDone = 0;
let lives = 3, score = 0, combo = 0, stateT = 0, calibT = 0, pinchT = 0, pausedFrom = 'play';
const newStats = () => ({ reps: 0, perfect: 0, partial: 0, kills: 0, bestCombo: 0, time: 0, work: 0, shots: 0, hits: 0, taken: 0, falls: 0, hold: 0, spawned: 0 });
let stats = newStats();
let msg = { text: '', color: '#fff', t: 0 };
let charged = false, chargePow = 1, nextArcDrop = 0, nextArcTilt = 0, nextArcJump = false, calibRef = 1.6, runSaved = false;
// Carga de las flexiones: cuanto más aguantas abajo, más fuerte el disparo
const POW_STEP = 0.8, POW_COL = [0x3cf0c6, 0xffd166, 0xff8a2a, 0xff3cf0], POW_DMG = [0, 1, 2, 4];
const HL = new V3(); // cabeza del jugador en coordenadas de la arena
const tmpA = new V3(), tmpB = new V3(), tmpC = new V3();
const wrapAng = a => Math.atan2(Math.sin(a), Math.cos(a));
// Avisos de corrección (naranja o rojo): además, grandes en el suelo durante 4 s y apuntados para la pausa
const WARN_COLS = ['#ff8a3d', '#ff3b5c', '#ff4a6a'];
function say(text, color = '#ffffff', dur = 1.4, toast = true) {
  msg = { text, color, t: dur }; boardDirty = true; if (toast) showToast(text, color, dur);
  if (WARN_COLS.includes(color) && GAME_STATES.includes(state)) warnFloor(text, color);
}

/* ---------- Barra de vida flotante ---------- */
const barBgMat = new THREE.MeshBasicMaterial({ color: 0x120d1c, transparent: true, opacity: 0.85, depthWrite: false });
const barFgMat = new THREE.MeshBasicMaterial({ color: 0xff3b5c, toneMapped: false });
const unitPlane = new THREE.PlaneGeometry(1, 1);
function makeHpBar(parent, y, w) {
  const g = new THREE.Group(); g.position.y = y; parent.add(g);
  const bg = new THREE.Mesh(unitPlane, barBgMat); bg.scale.set(w, w * 0.09, 1); g.add(bg);
  const fg = new THREE.Mesh(unitPlane, barFgMat); fg.scale.set(w * 0.96, w * 0.06, 1); fg.position.z = 0.002; g.add(fg);
  g.visible = false; return { g, fg, w };
}
function setHpBar(bar, r) { bar.g.visible = true; bar.fg.scale.x = bar.w * 0.96 * Math.max(0, r); bar.fg.position.x = -bar.w * 0.48 * (1 - Math.max(0, r)); }
function rigDebris(inst, center, power, smokeChance, mats) {
  inst.root.updateMatrixWorld(true);
  for (const b of inst.rig.bones) {
    const o = inst.list[b.idx];
    for (const ch in mats) {
      const geo = b.parts[ch]; if (!geo || !geo.isBufferGeometry) continue;
      const m = new THREE.Mesh(geo, mats[ch]); m.castShadow = true; o.matrixWorld.decompose(m.position, m.quaternion, m.scale);
      const dir = m.position.clone().sub(center); dir.y = Math.abs(dir.y) + 0.4; dir.normalize();
      addDebris(m, dir.multiplyScalar(rand(0.5, 1.2) * power), new V3(rand(-7, 7), rand(-7, 7), rand(-7, 7)), rand(2.4, 3.8), Math.random() < smokeChance);
    }
  }
}

/* =================== ROBOTS (de pie) =================== */
const ROBOT_KIND = {
  scout: { rig: 'scout', scale: 1.0, speedF: 1.0, heavy: false, stop: 1.25, stride: 1.8, head: 1.85 },
  heavy: { rig: 'heavy', scale: 1.0, speedF: 0.85, heavy: true, stop: 1.4, stride: 0.85, head: 1.75 },
  titan: { rig: 'titan', scale: 1.55, speedF: 0.7, heavy: true, stop: 1.9, stride: 0.9, head: 1.75, boss: true },
  lizard: { rig: 'lizard', scale: 1.05, speedF: 1.1, heavy: false, stop: 1.15, stride: 1.2, head: 1.1, beast: true }, // hombre-cocodrilo
  neon: { rig: 'neon', scale: 1.0, speedF: 1.05, heavy: false, stop: 1.2, stride: 1.4, head: 1.75, neon: true }, // humanoide de neón (estilo Pistol Whip)
  neonboss: { rig: 'neon', scale: 1.55, speedF: 0.75, heavy: true, stop: 1.8, stride: 1.4, head: 1.75, neon: true, boss: true },
  crocboss: { rig: 'lizard', scale: 1.6, speedF: 0.75, heavy: true, stop: 1.8, stride: 1.2, head: 1.1, beast: true, boss: true } // y su jefe, enorme
};
// Puestos de ataque: cada robot tiene el suyo en un arco delante de ti, separado de los demás para que nunca se
// estorben. Si la primera fila está llena, esperan en una segunda (o tercera) y avanzan cuando queda un hueco.
const ROW_GAP = 1.1, SLOT_ARC = 1.3;
// Con espada hay que esperarlos a tu alcance: vienen directos (como mucho SWORD_WALK s), sin pararse a amenazar
// Partes sólidas de las compuertas, como círculos en el suelo de la arena: los pilares del marco y los bloques de los lados
function gateSolids() {
  const out = [];
  for (const g of gates) {
    if (!g.on || !g.g.visible) continue; const r = g.g.rotation.y, c = Math.cos(r), s = Math.sin(r), sc = g.scale;
    const put = (lx, lz, rad) => out.push({ x: g.x + (lx * c + lz * s) * sc, z: g.z + (-lx * s + lz * c) * sc, r: rad * sc });
    for (const sd of [-1, 1]) { put(sd * 1.5, 0, 0.5); if (g.side.visible) put(sd * 2.2, -0.3, 1.05); }
  }
  return out;
}
// Ritmo (BPM) en Combate: periodo del pulso y si acaba de sonar uno (cuenta desde el pulso marcado al compás o por Spotify)
const beatP = () => isCombat() && settings.bpm > 0 ? 60 / settings.bpm : 0;
// El pulso va con el reloj del juego, enganchado al reloj real al empezar y al volver de la pausa (el compás marcado lo da el reloj real)
const BEAT = { last: -1, hit: false, t: 0, off: null };
const beatNow = () => { const P = beatP(); return P ? (BEAT.t + (BEAT.off || 0) - TCH.beat0) / P : 0; }; // pulsos desde la referencia (con decimales)
function beatStep(dt) {
  BEAT.t += dt; if (BEAT.off === null) BEAT.off = perfNow() - BEAT.t;
  const P = beatP(); if (!P) { BEAT.hit = false; return; } const k = Math.floor(beatNow()); BEAT.hit = k !== BEAT.last && BEAT.last >= 0; BEAT.last = k;
}
const SWORD_WALK = 3.5, swordWalk = () => swordSet() && !bareHands(), walkT = () => swordWalk() ? Math.min(dv('walkTime'), SWORD_WALK) : dv('walkTime');
// Con espadas se acercan hasta tenerte al alcance de la hoja
const robotStop = K => swordSet() ? (K.boss ? 1.45 : K.heavy ? 1.05 : 0.95) : K.stop;
function robotSlot(r) {
  const others = enemies.filter(o => o !== r && o.alive && o.type === 'robot' && o.slotOk);
  const want = Math.atan2(r.pos.x, -r.pos.z); // hacia dónde le pilla de camino
  let best = null, bestC = Infinity;
  // en tu habitación, ni en un mueble ni detrás de una pared; si así no queda ningún puesto (escaneo raro), sin mirarla
  for (const room of [true, false]) for (let row = 0; row < 3 && !best; row++) {
    const R = robotStop(r.K) + row * ROW_GAP;
    for (let a = -SLOT_ARC; a <= SLOT_ARC + 1e-6; a += 0.1) {
      _rs.set(Math.sin(a) * R, 0, -Math.cos(a) * R);
      if (others.some(o => o.slot.distanceTo(_rs) < r.radius + o.radius + 0.65)) continue; // también entre filas: al retroceder tras golpear no choca con los de atrás
      if (room && roomBlocked(_rs.x, _rs.z, r.radius)) continue;
      const c = Math.abs(a - want) + Math.abs(a) * 0.3 + Math.random() * 0.12;
      if (c < bestC) { bestC = c; best = { a, row, p: _rs.clone() }; }
    }
  }
  if (!best) best = { a: want, row: 3, p: new V3(Math.sin(want), 0, -Math.cos(want)).multiplyScalar(robotStop(r.K) + 3 * ROW_GAP) };
  r.slot.copy(best.p); r.row = best.row; r.slotOk = true;
}
const _rs = new V3(), _rd = new V3(), _rv = new V3(), _rp = new V3();
class Robot {
  constructor(spec, gate) {
    const K = ROBOT_KIND[spec.kind]; this.K = K; this.type = 'robot'; this.kind = spec.kind;
    this.rig = RIGS[K.rig]; this.inst = this.rig.instance(K.beast ? MAT_LIZARD : K.neon ? neonMats() : MAT_ROBOT); this.root = this.inst.root; this.B = this.inst.bones;
    // cabe por el hueco de su compuerta (en realidad mixta, con el techo de tu habitación, las compuertas son más bajas)
    this.sc = K.scale * Math.min(1, 3.0 * gate.scale / (1.95 * K.scale)); this.root.scale.setScalar(this.sc); arena.add(this.root);
    const gr = gate.g.rotation.y, back = 1.3 * gate.scale; this.pos = new V3(gate.x - Math.sin(gr) * back, 0, gate.z - Math.cos(gr) * back); // sale de dentro del túnel
    // primero sale recto por el hueco hasta delante de la compuerta (sin cruzar el marco ni los bloques de los lados) y
    // luego va a su puesto; la compuerta no se cierra mientras no haya salido
    this.gate = gate; this.out = false; this.exit = new V3(gate.x + Math.sin(gr) * 1.7 * gate.scale, 0, gate.z + Math.cos(gr) * 1.7 * gate.scale);
    Object.assign(this, { state: 'emerge', st: 0, phase: rand(0, TAU), hp: spec.hp, maxHp: spec.hp, pending: 0, alive: true, radius: 0.4 * this.sc, hitT: 0, twitchT: rand(2, 5), twitch: 0, twitchYaw: 0, jaw: 0, arm: 0, smokeT: 0, lastCos: [1, 1], gunSpin: 0, flickT: 0, knockFrom: new V3(), knockTo: new V3() });
    Object.assign(this, { slot: new V3(), slotOk: false, row: 0, vel: new V3(), spd: 0, run: 0, twist: 0, taunt: 0, tauntT: rand(3, 6), taunts: 0, stagger: 0, slotT: 0, stuckT: 0, charged: false, lunge: 0, breath: rand(0, TAU) });
    robotSlot(this);
    // ritmo: acecha andando y, en los últimos metros, carga corriendo; en total tarda lo que pide «Tiempo llegada»
    const W = walkT(), D = this.pos.distanceTo(this.slot), T = Math.max(2, W / K.speedF - (W >= 10 ? 1.2 : 0));
    this.chargeD = Math.min(3.2, D * 0.4); this.vRun = clamp(2.2 * D / T, 1.0, 3.2) * (K.heavy ? 0.85 : 1);
    this.vWalk = Math.max(0.05, (D - this.chargeD) / Math.max(T * 0.4, T - this.chargeD / this.vRun));
    if (this.vWalk > this.vRun) this.vRun = this.vWalk * 1.3;
    this.speed = this.vWalk;
    this.yaw = Math.atan2(this.slot.x - this.pos.x, this.slot.z - this.pos.z);
    this.bar = makeHpBar(this.root, 2.25, 0.7); if (K.boss) setHpBar(this.bar, 1);
    gate.openT = Math.min(12, 1.3 + 1.6 / Math.max(0.05, this.speed)); this.animate(0, 0, 0); this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
  }
  center(out) { this.B.chest.getWorldPosition(out); return out; }
  roar(pos, s) { SND.roar(pos, s); }
  // spd: lo que de verdad avanza (m/s). Quieto respira y se mueve inquieto; andando balancea cadera, hombros y brazos
  // en contra de las piernas; corriendo se inclina, alarga la zancada y bombea los brazos
  animate(dt, t, spd) {
    const B = this.B, K = this.K, isR = this.rig.kind === 'ripper', L = this.rig.legL;
    if (spd === true) spd = this.vWalk; // pose de prueba
    const amp = clamp(spd / Math.max(0.2, this.vWalk * 0.7), 0, 1), run = this.run;
    this.phase += TAU * clamp(spd / (K.stride * this.sc * (1 + run * 0.35)), 0, 2.8) * dt;
    if (beatP() && amp > 0.3) this.phase += wrapAng(Math.PI * beatNow() + (this.beatOff || 0) - this.phase) * Math.min(1, dt * 6); // con ritmo: un paso en cada pulso
    const p = this.phase, drops = [], la = 1 + run * 0.55;
    [['L', 0], ['R', Math.PI]].forEach(([sd, off], i) => {
      const q = p + off, c = Math.cos(q);
      let a1, a2, a3;
      // el muslo va hacia delante (ángulo negativo) mientras cos(q) > 0, que es cuando la rodilla se dobla: la pierna avanza
      // en el aire y luego, estirada, empuja hacia atrás apoyada (antes el signo estaba al revés y parecían andar hacia atrás)
      if (isR) { a1 = -0.55 - 0.42 * la * Math.sin(q) * amp; a2 = 1.2 + 0.45 * la * Math.max(0, c) * amp; a3 = -(a1 + a2) + 0.1 * Math.sin(q + 0.4) * amp; }
      else { a1 = -0.36 * la * Math.sin(q) * amp - run * 0.12; a2 = 0.08 + (0.62 + run * 0.35) * Math.max(0, c) * amp + run * 0.1; a3 = -(a1 + a2); }
      B['th' + sd].rotation.x = a1; B['kn' + sd].rotation.x = a2; B['an' + sd].rotation.x = a3;
      drops.push(L[0] * Math.cos(a1) + L[1] * Math.cos(a1 + a2) + L[2] * Math.cos(a1 + a2 + a3));
      if (amp > 0.3 && this.lastCos[i] > 0 && c <= 0) { const fp = B['an' + sd].getWorldPosition(new V3()); fp.y = 0.02; SND.step(fp, K.heavy); fx.dust(fp, K.heavy ? 5 : 3, 0.25 * this.sc * (1 + run)); if (Math.random() < 0.3) SND.servo(fp); }
      this.lastCos[i] = c;
    });
    // cadera: sube y baja con los pasos, gira y cae hacia la pierna que se levanta
    B.hips.position.y = Math.max(drops[0], drops[1]) - this.rig.hipOff + 0.015 + run * 0.02 * Math.abs(Math.sin(p));
    B.hips.rotation.y = 0.14 * Math.sin(p) * amp; B.hips.rotation.z = 0.05 * Math.cos(p) * amp;
    // tronco: inclinado hacia ti, más al correr; los hombros giran al revés que la cadera; respira cuando está quieto
    const breathe = (1 - amp) * Math.sin(t * 2.1 + this.breath) * 0.035, idleSway = (1 - amp) * Math.sin(t * 0.9 + this.breath) * 0.05;
    const lean = (isR ? 0.35 : 0.3) + run * 0.3 + this.lunge * 0.35;
    B.spine.rotation.x = lean + breathe + Math.sin(p * 2) * 0.04 * amp - this.hitT * 1.2 - this.stagger * 0.5 - this.taunt * 0.65 + (this.state === 'windup' ? -0.25 : this.state === 'strike' ? 0.45 : 0);
    B.spine.rotation.y = -0.18 * Math.sin(p) * amp + this.twist + idleSway;
    B.spine.rotation.z = Math.sin(p) * 0.06 * amp + this.stagger * 0.15 * Math.sin(t * 23);
    // brazos: braceo contrario a las piernas; al correr, bombean doblados; en la amenaza, abiertos y en alto
    const arm = this.arm, raise = Math.max(0, arm), strike = Math.max(0, -arm), sw = (0.32 + run * 0.45) * amp, tn = this.taunt;
    if (isR) {
      for (const [sd, off, sx] of [['L', 0, 1], ['R', Math.PI, -1]]) { // cada brazo, adelante con la pierna contraria
        const swing = -0.3 - run * 0.25 + sw * Math.sin(p + off) + Math.sin(t * 1.7 + off) * 0.05 * (1 - amp);
        B['sh' + sd].rotation.x = lerp(lerp(swing, -1.0, tn), -2.7, raise) * (1 - strike) + strike * -0.5;
        B['sh' + sd].rotation.z = sx * (0.18 + raise * 0.25 + tn * 1.0);
        B['el' + sd].rotation.x = lerp(lerp(-0.8 - run * 0.5 + 0.2 * Math.sin(p + off) * amp, -0.3, tn), -0.5, raise) * (1 - strike) + strike * -0.15;
        B['ha' + sd].rotation.x = -0.25 + Math.sin(t * 3 + off) * 0.08 + tn * Math.sin(t * 14 + off) * 0.25; // garras que se abren y cierran
      }
    } else {
      B.shL.rotation.x = lerp(lerp(-0.35 - run * 0.2 + sw * Math.sin(p), -1.2, tn), -2.5, raise) * (1 - strike) + strike * -0.6; B.shL.rotation.z = 0.2 + tn * 0.9;
      B.elL.rotation.x = lerp(-0.5 - run * 0.4, -0.3, Math.max(raise, tn)); B.clawL.rotation.x = -0.2 + raise * 0.4 - strike * 0.3 + tn * Math.sin(t * 12) * 0.3;
      B.shR.rotation.x = -1.15 + Math.sin(p) * 0.08 * amp - tn * 0.4; B.shR.rotation.z = -0.15 - tn * 0.5; B.elR.rotation.x = -0.35;
      this.gunSpin += dt * (this.state === 'windup' || this.state === 'strike' || tn > 0.5 ? 30 : 4 + run * 10); B.gunR.rotation.y = this.gunSpin;
    }
    // la cabeza sigue al jugador (con espasmos); en la amenaza, echada atrás rugiendo
    const toP = tmpA.subVectors(HL, this.pos), ly = wrapAng(Math.atan2(toP.x, toP.z) - this.yaw - B.spine.rotation.y), dist = Math.hypot(toP.x, toP.z);
    const pitch = Math.atan2(HL.y - K.head * this.sc, Math.max(0.3, dist));
    B.head.rotation.y = clamp(ly, -1.1, 1.1) + this.twitchYaw + tn * Math.sin(t * 9) * 0.25;
    B.head.rotation.x = -pitch - (isR ? 0.1 : 0.3) + this.twitch * 0.4 - tn * 0.5 + lean * 0.5;
    B.jaw.rotation.x = Math.max(this.jaw, tn) * (isR ? 0.55 : 0.35);
  }
  update(dt, t) {
    const K = this.K; this.st += dt; this.hitT = Math.max(0, this.hitT - dt * 4); this.stagger = Math.max(0, this.stagger - dt * 3);
    // aturdido tras un bloqueo: tiembla, echa chispas y no ataca; tu contraataque hace el doble
    if (this.stunT > 0) { this.stunT -= dt; this.stagger = Math.max(this.stagger, 0.5); this.stunFx = (this.stunFx || 0) - dt; if (this.stunFx <= 0) { this.stunFx = 0.25; if (this.K.beast) fx.ichor(this.B.head.getWorldPosition(tmpB), 4, 0.8); else fx.electric(this.B.head.getWorldPosition(tmpB), 6); } }
    // espasmos inquietantes
    this.twitchT -= dt;
    if (this.twitchT <= 0) { this.twitchT = rand(2.5, 6); this.twitch = 1; this.twitchYaw = rand(-0.9, 0.9); }
    if (this.twitch > 0) { this.twitch = Math.max(0, this.twitch - dt * 7); if (this.twitch === 0) this.twitchYaw = 0; }
    if (this.flickT > 0) { this.flickT -= dt; const on = Math.random() < 0.5; if (this.inst.meshes.glow) this.inst.meshes.glow.visible = on; if (this.inst.meshes.halo) this.inst.meshes.halo.visible = on; if (this.flickT <= 0) { if (this.inst.meshes.glow) this.inst.meshes.glow.visible = true; if (this.inst.meshes.halo) this.inst.meshes.halo.visible = true; } }
    const active = state === 'play' || state === 'rest', last = _rp.copy(this.pos);
    const toPl = Math.hypot(HL.x - this.pos.x, HL.z - this.pos.z), faceP = Math.atan2(HL.x - this.pos.x, HL.z - this.pos.z);
    let faceTo = null, wantV = 0;
    switch (this.state) {
      case 'emerge':
        if (this.st > 0.9) { this.state = 'walk'; this.st = 0; if (K.heavy || Math.random() < 0.5) { this.jaw = 1; this.roar(this.center(tmpB), K.boss ? 0.7 : K.heavy ? 0.85 : 1.15); } }
        break;
      case 'taunt': // se planta, abre los brazos y te ruge
        this.taunt = Math.min(1, this.taunt + dt * 5); faceTo = faceP;
        if (this.st > 1.1) { this.state = 'walk'; this.st = 0; }
        break;
      case 'walk': {
        if (!active) break;
        // cada poco busca un puesto mejor (al morir otro, los de atrás avanzan)
        this.slotT -= dt; if (this.slotT <= 0) { this.slotT = 0.6; if (this.row > 0 || this.stuckT > 1) { this.slotOk = false; robotSlot(this); this.stuckT = 0; } }
        if (!this.out) { this.gate.openT = Math.max(this.gate.openT, 0.8); if (Math.hypot(this.exit.x - this.pos.x, this.exit.z - this.pos.z) < 0.35) this.out = true; }
        const to = _rd.subVectors(this.out ? this.slot : this.exit, this.pos); to.y = 0; const d = this.out ? to.length() : to.length() + this.exit.distanceTo(this.slot);
        if (d < 0.12) {
          faceTo = faceP;
          if (this.row === 0 && state === 'play' && !(this.stunT > 0) && (!beatP() || BEAT.hit)) { this.state = 'windup'; this.st = 0; this.zone = null; if (blockOn()) blockStart(this); if (K.neon) SND.neonWarn(this.center(tmpB)); else if (!K.beast) SND.servo(this.center(tmpB)); this.roar(this.center(tmpB), K.boss ? 0.65 : K.beast ? 0.8 : 1.0); }
          break; // esperando su turno en la fila de atrás: quieto, mirándote
        }
        to.normalize();
        // amenaza a media distancia (una vez por avance, si hay tiempo)
        if (!this.taunts && walkT() >= 10 && toPl > 3 && toPl < 7) { this.tauntT -= dt; if (this.tauntT <= 0) { this.taunts++; this.state = 'taunt'; this.st = 0; this.roar(this.center(tmpB), K.boss ? 0.6 : K.heavy ? 0.8 : 1.1); break; } }
        // carga: los últimos metros, corriendo y rugiendo
        if (!this.charged && d < this.chargeD + 0.3) { this.charged = true; this.jaw = 1; this.roar(this.center(tmpB), K.boss ? 0.7 : 1.2); }
        wantV = (this.charged ? this.vRun : this.vWalk) * clamp(d / 0.7, 0.3, 1);
        // esquiva: se aparta de los robots que tiene cerca y rodea al que se le cruza por delante (nunca va hacia él)
        const steer = _rv.copy(to);
        // las compuertas son sólidas: rodea sus pilares y los bloques de los lados (al salir del túnel va recto por el hueco)
        if (this.out) for (const c of gateSolids()) { const dx = this.pos.x - c.x, dz = this.pos.z - c.z, dd = Math.hypot(dx, dz) || 1e-3, min = c.r + this.radius; if (dd < min + 0.6) { const k = Math.pow((min + 0.6 - dd) / 0.6, 2) * 2.2; steer.x += dx / dd * k; steer.z += dz / dd * k; } }
        for (const o of enemies) {
          if (!this.out) break; // dentro del túnel no se aparta: sale recto
          if (o === this || !o.alive || o.type !== 'robot') continue;
          const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, dd = Math.hypot(dx, dz) || 1e-3, min = this.radius + o.radius + 0.3;
          if (dd < min + 0.9) { const k = Math.pow((min + 0.9 - dd) / 0.9, 2) * 1.6; steer.x += dx / dd * k; steer.z += dz / dd * k; }
          const ahead = -(dx * to.x + dz * to.z), lat = dx * to.z - dz * to.x; // el otro, delante y a un lado de mi camino
          if (ahead > 0 && ahead < 1.8 && Math.abs(lat) < min) { const sgn = lat === 0 ? (this.slot.x > o.slot.x ? 1 : -1) : Math.sign(lat), k = (1 - Math.abs(lat) / min) * 1.4; steer.x += to.z * sgn * k; steer.z -= to.x * sgn * k; }
        }
        steer.y = 0; const sl = steer.length(); if (sl > 1e-4) steer.divideScalar(sl);
        if (steer.dot(to) < -0.2) steer.addScaledVector(to, 0.8).normalize(); // nunca da media vuelta por esquivar
        _rs.copy(steer).multiplyScalar(wantV); this.vel.lerp(_rs, Math.min(1, dt * 4)); // con inercia: arranca y frena como un cuerpo pesado
        this.pos.addScaledVector(this.vel, dt);
        faceTo = Math.atan2(this.vel.x, this.vel.z);
        // atascado: casi no avanza aunque quiere
        this.stuckT = this.vel.length() < wantV * 0.25 ? this.stuckT + dt : 0;
        break;
      }
      case 'windup': {
        // con bloqueos, el golpe tarda más en llegar: da tiempo a poner la espada en la marca (y a agacharse)
        const wind = this.zone ? 1.25 : 0.75;
        faceTo = faceP; this.arm = Math.min(1, this.st / (wind * 0.8)); this.jaw = 1; this.twist = lerp(this.twist, 0.5, Math.min(1, dt * 8));
        if (this.zone) blockStep(this, t);
        if (this.st > wind) { this.state = 'strike'; this.st = 0; this.knockFrom.copy(this.pos); }
        break;
      }
      case 'strike': { // zancada hacia ti con el golpe
        faceTo = faceP; this.arm = -Math.min(1, this.st / 0.15); this.twist = lerp(this.twist, -0.45, Math.min(1, dt * 18)); this.lunge = Math.min(1, this.st / 0.15);
        const back = tmpA.subVectors(this.pos, HL); back.y = 0; back.normalize();
        this.pos.copy(this.knockFrom).addScaledVector(back, -(swordSet() ? 0.15 : K.beast ? 0.5 : 0.35) * smooth(this.lunge)); // el cocodrilo se lanza más: a morderte la cara
        if (this.zone) blockStep(this, t);
        if (this.st > 0.18) {
          const parried = this.zone && blockResolve(this); this.zone = null;
          this.state = 'knock'; this.st = 0; if (parried) { this.stunT = 1.8; this.stagger = 1; } else hurtPlayer(this);
          // retrocede tras el golpe, pero sin meterse en los que esperan detrás
          let kd = 1.4; for (const o of enemies) if (o !== this && o.alive && o.type === 'robot') { const ox = o.pos.x - this.pos.x, oz = o.pos.z - this.pos.z, al = ox * back.x + oz * back.z, lat = Math.abs(ox * back.z - oz * back.x), min = this.radius + o.radius + 0.05; if (al > 0 && lat < min) kd = Math.min(kd, Math.max(0, al - Math.sqrt(min * min - lat * lat))); }
          if (parried) kd = Math.min(kd, 0.6); // parado: retrocede poco y queda a tu alcance
          this.knockFrom.copy(this.pos); this.knockTo.copy(this.pos).addScaledVector(back, kd);
          if (K.beast) { SND.chomp(this.B.head.getWorldPosition(tmpB)); fx.dust(tmpB.set(this.pos.x, 0.02, this.pos.z), 4, 0.3); } else if (K.neon) { const p = this.B.haR.localToWorld(tmpB.set(0, -0.1, 0.45)); SND.zap(p); shardBurst(p, 6, [this.pal.glow, 0xffffff], 2.5); } else { fx.electric(this.center(tmpB), 18); SND.metalHit(this.center(tmpB), true); }
        }
        break;
      }
      case 'knock': {
        const k = smooth(Math.min(1, this.st / 0.7)); this.pos.lerpVectors(this.knockFrom, this.knockTo, k); this.arm = lerp(-1, 0, k); this.hitT = Math.max(this.hitT, (1 - k) * 0.6);
        this.lunge = 1 - k; faceTo = faceP;
        if (this.st > 0.9) { this.state = 'walk'; this.st = 0; this.charged = false; this.chargeD = 1.6; this.vel.set(0, 0, 0); }
        break;
      }
    }
    if (this.state !== 'windup' && this.state !== 'strike' && this.state !== 'knock') { this.arm *= Math.max(0, 1 - dt * 5); this.twist *= Math.max(0, 1 - dt * 4); this.lunge *= Math.max(0, 1 - dt * 4); }
    if (this.state !== 'taunt') this.taunt = Math.max(0, this.taunt - dt * 3);
    if (this.state !== 'walk') this.vel.multiplyScalar(Math.max(0, 1 - dt * 8));
    this.jaw = Math.max(0, this.jaw - dt * 0.9);
    // al recibir un disparo, retrocede a trompicones
    if (this.stagger > 0) { const back = tmpA.subVectors(this.pos, HL); back.y = 0; back.normalize(); this.pos.addScaledVector(back, this.stagger * 0.5 * dt); }
    // nunca se solapan: si se tocan, se separan los dos por igual
    for (const o of enemies) if (o !== this && o.alive && o.type === 'robot') {
      let dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, dd = Math.hypot(dx, dz); const min = this.radius + o.radius;
      if (dd >= min) continue; if (dd < 1e-4) { dx = rand(-1, 1); dz = rand(-1, 1); dd = Math.hypot(dx, dz); }
      const k = (min - Math.min(dd, min)) * 0.5 / dd; this.pos.x += dx * k; this.pos.z += dz * k; o.pos.x -= dx * k; o.pos.z -= dz * k;
    }
    // de cara hacia donde va y, al acercarse, cada vez más hacia ti
    const near = smooth(clamp((3.2 - toPl) / 2, 0, 1));
    if (faceTo !== null) { const tgt = this.state === 'walk' ? faceTo + wrapAng(faceP - faceTo) * near * 0.85 : faceTo; this.yaw += wrapAng(tgt - this.yaw) * Math.min(1, dt * (this.state === 'walk' ? 5 : 8)); }
    this.spd = Math.hypot(this.pos.x - last.x, this.pos.z - last.z) / Math.max(dt, 1e-3);
    if (this.state === 'strike' || this.state === 'knock') this.spd = 0; // la zancada y el retroceso no son pasos
    const runK = this.spd > this.vWalk * 1.15 ? clamp((this.spd - this.vWalk) / Math.max(0.1, this.vRun - this.vWalk), 0, 1) : 0;
    this.run += (runK - this.run) * Math.min(1, dt * 4);
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
    this.animate(dt, t, this.spd);
    if (this.rig.kind !== 'ripper' && !K.beast && !K.neon) { this.smokeT -= dt; if (this.smokeT <= 0) { this.smokeT = 0.3; for (const s of [-1, 1]) fx.smoke(this.B.chest.localToWorld(tmpB.set(s * 0.15, 0.8, -0.26)), 0.12 * K.scale, 0.7, 1.6, 0.12); } }
    if (this.bar.g.visible) this.bar.g.lookAt(head.p);
  }
  onHit(dmg, perfect, point) {
    this.hp -= dmg; this.hitT = 0.3; this.flickT = 0.25; this.stagger = Math.min(1, this.stagger + 0.6); this.twitch = 1; setHpBar(this.bar, this.hp / this.maxHp);
    fx.sparks(point, 12, [1, 0.55, 0.15], 3, 0.05); fx.glow(point, [1, 0.6, 0.3], 0.5, 0.1); SND.metalHit(point, this.K.heavy);
    if (this.hp <= 0) this.kill();
  }
  kill() {
    this.alive = false; const c = this.center(new V3()), big = !!this.K.boss;
    fx.explosion(c, big ? 1.8 : 1.0, big); SND.explosion(c, big);
    rigDebris(this.inst, c, big ? 5 : 3.6, 0.35, { main: M.steel, paint: M.paint });
    this.dispose();
  }
  dispose() { arena.remove(this.root); this.inst.skel.dispose(); if (this.zoneSpr) { scene.remove(this.zoneSpr); this.zoneSpr.material.dispose(); } }
}

/* =================== HOMBRE-COCODRILO =================== */
// Va encorvado a cuatro patas, apoyando los nudillos (trote: cada mano con la pierna contraria), con la cabeza levantada
// mirándote y la cola meciéndose. Al amenazar se alza un poco, abre los brazos y ruge con las fauces abiertas meneando la
// cabeza; al atacar se yergue con los brazos muy abiertos y se lanza con la boca abierta a morderte la cara.
// Usa el comportamiento de los robots (puestos, compuertas, bloqueos con espada); cambian el cuerpo, la animación y los efectos.
// Brazos y piernas con cinemática inversa en el plano de avance: los pies y las manos pisan el suelo
const _lz = { y: 0, z: 0 };
const pitchYZ = (y, z, a) => { const c = Math.cos(a), s = Math.sin(a); _lz.y = y * c - z * s; _lz.z = y * s + z * c; return _lz; };
// dos huesos (que en reposo apuntan hacia abajo) desde J hasta T; Pp, la inclinación del padre; bend +1: la articulación hacia delante
function ik2(Jy, Jz, Ty, Tz, L1, L2, Pp, bend) {
  let dy = Ty - Jy, dz = Tz - Jz, D = Math.hypot(dy, dz); D = clamp(D, Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
  const pd = Math.atan2(-dz, -dy), a = Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1)), p1 = pd - bend * a;
  const ky = Jy - Math.cos(p1) * L1, kz = Jz - Math.sin(p1) * L1, p2 = Math.atan2(-(Tz - kz), -(Ty - ky));
  return [p1 - Pp, p2 - p1, p2];
}
// zancada: 60 % apoyado (el pie va hacia atrás) y 40 % en el aire (vuelve adelante, levantado)
function gaitFoot(q, S, lift) { const u = ((q / TAU) % 1 + 1) % 1; return u < 0.6 ? [S * (0.5 - u / 0.6), 0, u] : [S * (-0.5 + (u - 0.6) / 0.4), lift * Math.sin(Math.PI * (u - 0.6) / 0.4), u]; }
class Lizard extends Robot {
  constructor(spec, gate) { super(spec, gate); this.bar.g.position.y = 1.75; this.lastU = [0, 0]; this.sway = rand(0, TAU); this.bite = 0; }
  center(out) { return this.B.chest.localToWorld(out.set(0, 0.12, 0.08)); }
  roar(pos, s) { SND.crocRoar(pos, s); }
  animate(dt, t, spd) {
    const B = this.B, tn = this.taunt || 0, run = this.run || 0, st = this.state; this.lastU = this.lastU || [0, 0]; this.sway = this.sway || 0; this.bite = this.bite || 0; // (la primera vez, desde el constructor de Robot)
    if (spd === true) spd = this.vWalk;
    const amp = clamp(spd / Math.max(0.2, (this.vWalk || 0.5) * 0.7), 0, 1), S = 0.5 * (1 + run * 0.5);
    this.phase += TAU * 0.6 * clamp(spd / (S * this.sc), 0, 4) * dt;
    if (beatP() && amp > 0.3) this.phase += wrapAng(Math.PI * beatNow() + (this.beatOff || 0) - this.phase) * Math.min(1, dt * 6);
    const p = this.phase;
    // cuánto se yergue: al amenazar, a medias; al preparar el ataque, del todo; al morder se echa hacia delante
    const windup = st === 'windup' ? smooth(clamp(this.st / 0.6, 0, 1)) : 0, strike = st === 'strike' ? (this.lunge || 0) : 0, knock = st === 'knock' ? 1 - smooth(clamp(this.st / 0.7, 0, 1)) : 0;
    const up = Math.max(tn * 0.55, windup, strike * 0.6, knock * 0.5), lean = strike * 0.7 + knock * 0.3;
    const bob = amp * 0.025 * Math.cos(p * 2), breathe = (1 - amp) * Math.sin(t * 1.8 + (this.breath || 0)) * 0.03;
    const hy = lerp(0.6, 0.84, up) - run * 0.04 + bob;
    const Ph = lerp(0.55, 0.08, up) + run * 0.08 + lean * 0.35 - (this.hitT || 0) * 0.8 - (this.stagger || 0) * 0.3, Ps = lerp(0.3, 0.02, up) + breathe + lean * 0.25, Pc = lerp(0.25, -0.05, up) + lean * 0.15;
    B.hips.position.y = hy; B.hips.rotation.set(Ph, 0.1 * Math.sin(p) * amp, 0.04 * Math.cos(p) * amp);
    B.spine.rotation.set(Ps, -0.12 * Math.sin(p) * amp + (this.twist || 0) * 0.5, (this.stagger || 0) * 0.15 * Math.sin(t * 23));
    B.chest.rotation.set(Pc, -0.08 * Math.sin(p) * amp, 0.05 * Math.sin(p) * amp);
    // piernas: los pies en el suelo (o en el aire al avanzar), rodillas hacia delante
    const legs = [];
    for (const [sd, sx, off, i] of [['L', 1, 0, 0], ['R', -1, Math.PI, 1]]) {
      const hj = pitchYZ(-0.04, 0, Ph), Jy = hy + hj.y, Jz = hj.z;
      const [fz, fy, u] = gaitFoot(p + off, S * amp, 0.12 * amp), Tz = fz - 0.02 + up * 0.04, Ty = 0.075 + fy;
      const [a1, a2, w2] = ik2(Jy, Jz, Ty, Tz, LIZ.th, LIZ.kn, Ph, 1);
      B['th' + sd].rotation.set(a1, 0, sx * 0.08); B['kn' + sd].rotation.x = a2; B['an' + sd].rotation.x = -w2;
      if (amp > 0.3 && this.lastU[i] > 0.9 && u < 0.1) { const fp = B['an' + sd].getWorldPosition(new V3()); fp.y = 0.02; SND.step(fp, true); fx.dust(fp, 3, 0.25 * this.sc * (1 + run)); }
      this.lastU[i] = u; legs.push(u);
    }
    // brazos: andando, los nudillos al suelo con la pierna contraria; erguido, abiertos de par en par; al morder, abrazan
    const Pch = Ph + Ps + Pc;
    for (const [sd, sx, off] of [['L', 1, Math.PI], ['R', -1, 0]]) {
      const sp = pitchYZ(0.27, 0, Pc), s2 = pitchYZ(0.32 + sp.y, sp.z, Ps), s3 = pitchYZ(0.08 + s2.y, s2.z, Ph);
      const Jy = hy + s3.y, Jz = s3.z, [fz, fy] = gaitFoot(p + off, S * amp, 0.16 * amp);
      const [a1, a2, w2] = ik2(Jy, Jz, 0.16 + fy, Jz + 0.12 + fz, LIZ.sh, LIZ.el, Pch, -1);
      const wide = Math.max(windup, tn * 0.8), hug = strike, claw = Math.sin(t * 13 + off) * 0.25 * Math.max(tn, windup);
      const ox = lerp(lerp(a1, -1.05 - Pch * 0.4, wide), -1.3, hug), oz = sx * lerp(lerp(0.18, 1.0, wide), 0.5, hug);
      B['sh' + sd].rotation.set(ox, 0, oz); B['el' + sd].rotation.x = lerp(lerp(a2, -0.75, wide), -0.95, hug);
      B['ha' + sd].rotation.x = lerp(lerp(-w2 - Pch * 0 + 0.25, -0.3 + claw, wide), -0.6, hug);
    }
    // cuello y cabeza: levantados para mirarte; al rugir, la cabeza se menea y las fauces se abren del todo
    const toP = tmpA.subVectors(HL, this.pos), ly = wrapAng(Math.atan2(toP.x, toP.z) - this.yaw), dist = Math.hypot(toP.x, toP.z);
    const headH = (hy + 0.9 * Math.cos(Pch * 0.8)) * this.sc, pitch = Math.atan2(HL.y - headH, Math.max(0.3, dist));
    this.bite = Math.max(this.bite * Math.max(0, 1 - dt * 6), st === 'windup' || st === 'strike' ? 1 : 0);
    const jaw = Math.max(this.jaw || 0, tn, this.bite) * (st === 'knock' ? 1 - smooth(clamp(this.st / 0.12, 0, 1)) : 1); // al morder, cierra de golpe
    B.neck.rotation.set(-Pch * 0.45, clamp(ly, -0.9, 0.9) * 0.4, 0);
    B.head.rotation.set(-Pch * 0.55 - pitch - jaw * 0.25 + (this.twitch || 0) * 0.2, clamp(ly, -0.9, 0.9) * 0.5 + (this.twitchYaw || 0) * 0.5 + tn * Math.sin(t * 5) * 0.3, tn * Math.sin(t * 7.5) * 0.28 + Math.sin(t * 1.3 + this.sway) * 0.04);
    B.jaw.rotation.x = jaw * 0.72 + (1 - jaw) * Math.max(0, Math.sin(t * 0.7 + this.sway)) * 0.06;
    // cola: casi horizontal, con una onda que sigue los pasos y un meneo lento
    for (let i = 0; i < 5; i++) B['t' + i].rotation.set(i ? 0.06 : -Ph - Ps * 0.3 - 0.12, Math.sin(p - i * 0.7) * 0.18 * amp + Math.sin(t * 1.4 + this.sway - i * 0.6) * 0.1 * (1 - amp * 0.5) + tn * Math.sin(t * 6 - i) * 0.15, 0);
  }
  onHit(dmg, perfect, point) {
    this.hp -= dmg; this.hitT = 0.3; this.stagger = Math.min(1, this.stagger + 0.6); this.twitch = 1; this.jaw = 1; setHpBar(this.bar, this.hp / this.maxHp);
    fx.ichor(point, 14, 1.4); fx.glow(point, [1, 0.6, 0.3], 0.35, 0.08); SND.squish(point);
    if (this.hp <= 0) this.kill(); else if (Math.random() < 0.35) this.roar(this.center(tmpB), 1.1);
  }
  kill() {
    this.alive = false; const c = this.center(new V3());
    fx.ichor(c, 40, 2.4); fx.smoke(c, 0.4, 0.4, 1.6, 0.2); fx.glow(c, [1, 0.7, 0.3], 0.8, 0.12); SND.crocRoar(c, 0.8); SND.squish(c);
    rigDebris(this.inst, c, 2.6, 0, { main: M.scaleStatic, flesh: M.fleshStatic });
    this.dispose();
  }
}

/* =================== HUMANOIDES DE NEÓN (estilo Pistol Whip) =================== */
// Maniquíes facetados sin cara, cada uno con su combinación de colores: cuerpo claro u oscuro y franjas de luz que laten
// con el ritmo (o, sin ritmo, dos veces por segundo) y cambian levemente de tono. Se materializan de los pies a la cabeza
// al salir, andan con un balanceo marcado y cabecean al compás; amenazan apuntándote con la porra; al preparar el golpe la
// levantan y su luz parpadea deprisa (es el aviso), y al recibir un disparo destellan en blanco. Al morir estallan en esquirlas.
// cuerpo, luz y el segundo tono hacia el que deriva la luz
// cuerpo, paneles de armadura, luz y el segundo tono hacia el que deriva la luz
const NEON_PAL = [
  { body: 0x23262f, panel: 0xf0f2f6, glow: 0xff2d6f, glow2: 0xff7a2d }, { body: 0x11131a, panel: 0x1f5fff, glow: 0x24e8ff, glow2: 0x6b8bff },
  { body: 0xe9edf5, panel: 0x2a2e3a, glow: 0xff2d6f, glow2: 0xc04dff }, { body: 0x14161c, panel: 0x7a24d6, glow: 0xc04dff, glow2: 0xff3df2 },
  { body: 0xdfe4ec, panel: 0x1d8f55, glow: 0x6dff3c, glow2: 0x1effc8 }, { body: 0x1b1e2a, panel: 0xd9a03a, glow: 0xffb21e, glow2: 0xff4d8a }
];
const NEON_BOSS = { body: 0x16110a, panel: 0xc9a85a, glow: 0xff5a1f, glow2: 0xffd21e };
const neonMats = () => ({ main: std({ vertexColors: true, skinning: true, flatShading: true, roughness: 0.42, metalness: 0.18 }), paint: std({ vertexColors: true, skinning: true, flatShading: true, roughness: 0.25, metalness: 0.45 }), glow: new THREE.MeshBasicMaterial({ vertexColors: true, skinning: true, toneMapped: false }) });
const _nc = new THREE.Color(), _nc2 = new THREE.Color(), _nw = new THREE.Color(1, 1, 1);
class Neon extends Robot {
  constructor(spec, gate) {
    super(spec, gate); this.bar.g.position.y = 2.05; this.pal = this.K.boss ? NEON_BOSS : pick(NEON_PAL); this.flash = 0; this.hue = rand(0, TAU);
    this.mat = { body: this.inst.meshes.main.material, paint: this.inst.meshes.paint.material, glow: this.inst.meshes.glow.material }; this.mat.body.color.setHex(this.pal.body); this.mat.paint.color.setHex(this.pal.panel);
    if (!this.mat.body.emissive || typeof this.mat.body.emissive.copy !== 'function') this.mat.body.emissive = new THREE.Color(0);
  }
  roar(pos) { SND.neonWarn(pos); }
  animate(dt, t, spd) {
    const B = this.B, tn = this.taunt || 0, run = this.run || 0, st = this.state; this.lastU = this.lastU || [0, 0];
    if (spd === true) spd = this.vWalk;
    const amp = clamp(spd / Math.max(0.2, (this.vWalk || 0.5) * 0.7), 0, 1), S = 0.62 * (1 + run * 0.5);
    this.phase += TAU * 0.6 * clamp(spd / (S * this.sc), 0, 4) * dt;
    if (beatP() && amp > 0.3) this.phase += wrapAng(Math.PI * beatNow() + (this.beatOff || 0) - this.phase) * Math.min(1, dt * 6);
    const p = this.phase, bp = beatP(), ph = bp ? beatNow() : t * 2 + (this.hue || 0), fr = ph - Math.floor(ph), pulse = Math.exp(-fr * 5);
    // materializarse: crece de los pies a la cabeza, encendido
    const mat = st === 'emerge' ? smooth(clamp(this.st / 0.8, 0, 1)) : 1;
    this.root.scale.set(this.sc, this.sc * (0.03 + 0.97 * mat), this.sc);
    const windup = st === 'windup' ? smooth(clamp(this.st / 0.5, 0, 1)) : 0, strike = st === 'strike' ? (this.lunge || 0) : 0, knock = st === 'knock' ? 1 - smooth(clamp(this.st / 0.7, 0, 1)) : 0;
    // cuerpo: erguido, con un rebote al compás y balanceo de cadera
    const groove = (1 - amp) * pulse * 0.025, hy = NEO.hipY - 0.05 - run * 0.05 + amp * 0.025 * Math.cos(p * 2) - groove - strike * 0.08;
    const Ph = 0.06 + run * 0.18 + strike * 0.35 - windup * 0.12 - (this.hitT || 0) * 0.9 - (this.stagger || 0) * 0.35 - knock * 0.2;
    B.hips.position.y = hy; B.hips.rotation.set(Ph, 0.16 * Math.sin(p) * amp, 0.07 * Math.cos(p) * amp + (1 - amp) * Math.sin(t * 1.3 + this.hue) * 0.04);
    B.spine.rotation.set(0.04 + groove * 2, -0.22 * Math.sin(p) * amp + (this.twist || 0) - windup * 0.4 + strike * 0.5, (this.stagger || 0) * 0.2 * Math.sin(t * 23));
    B.chest.rotation.set(0.03, -0.1 * Math.sin(p) * amp, -0.05 * Math.cos(p) * amp);
    // piernas: los pies pisan el suelo (rodillas al frente)
    for (const [sd, sx, off, i] of [['L', 1, 0, 0], ['R', -1, Math.PI, 1]]) {
      const hj = pitchYZ(-0.05, 0, Ph), [fz, fy, u] = gaitFoot(p + off, S * amp, 0.13 * amp);
      const [a1, a2, w2] = ik2(hy + hj.y, hj.z, 0.055 + fy, fz + 0.02 + strike * (i ? 0.35 : -0.1), NEO.th, NEO.kn, Ph, 1);
      B['th' + sd].rotation.set(a1, 0, sx * 0.05); B['kn' + sd].rotation.x = a2; B['an' + sd].rotation.x = -w2;
      if (amp > 0.3 && this.lastU[i] > 0.9 && u < 0.1) { const fp = B['an' + sd].getWorldPosition(new V3()); fp.y = 0.02; SND.step(fp, false); }
      this.lastU[i] = u;
    }
    // brazos: braceo andando; amenaza: te apunta con la porra y te hace señas; golpe: la porra arriba y tajo hacia abajo
    const sw = (0.45 + run * 0.4) * amp;
    let lx = -0.1 + sw * Math.sin(p), lz = 0.14, le = -0.25 - run * 0.7, rx = -0.1 - sw * Math.sin(p), rz = -0.14, re = -0.35 - run * 0.7;
    lx = lerp(lx, -1.2, tn); le = lerp(le, -1.3 + Math.sin(t * 9) * 0.5, tn); rx = lerp(rx, -1.55, tn); re = lerp(re, 0, tn); rz = lerp(rz, -0.05, tn);
    lx = lerp(lx, -0.9, Math.max(windup, strike)); le = lerp(le, -1.2, Math.max(windup, strike)); lz = lerp(lz, 0.35, windup);
    rx = lerp(lerp(rx, -2.7, windup), -0.5, strike); rz = lerp(lerp(rz, -0.35, windup), -0.15, strike); re = lerp(lerp(re, -1.1, windup), -0.2, strike);
    B.shL.rotation.set(lx, 0, lz); B.elL.rotation.x = le; B.shR.rotation.set(rx, 0, rz); B.elR.rotation.x = re;
    B.haL.rotation.x = -0.15; B.haR.rotation.x = lerp(lerp(0.1, 1.45, tn), 0.6, windup) - strike * 0.3; // al amenazar, la muñeca dobla la porra hacia ti
    // cabeza: te mira y cabecea al compás; en la amenaza, la ladea
    const toP = tmpA.subVectors(HL, this.pos), ly = wrapAng(Math.atan2(toP.x, toP.z) - this.yaw), dist = Math.hypot(toP.x, toP.z);
    const pitch = Math.atan2(HL.y - this.K.head * this.sc, Math.max(0.3, dist));
    B.neck.rotation.set(-Ph * 0.5, clamp(ly, -1, 1) * 0.35, 0);
    B.head.rotation.set(-pitch - Ph * 0.4 + pulse * 0.12 * (1 - amp * 0.5) + (this.twitch || 0) * 0.25, clamp(ly, -1, 1) * 0.6 + (this.twitchYaw || 0) * 0.6, tn * 0.35 + Math.sin(t * 0.8 + this.hue) * 0.05);
    // luces: laten con el compás, cambian un poco de tono, parpadean deprisa al avisar del golpe y destellan en blanco al recibir
    if (!this.pal) return;
    this.flash = Math.max(0, (this.flash || 0) - dt * 6);
    const warn = windup > 0 || strike > 0 ? 0.55 + 0.45 * Math.sign(Math.sin(t * 38)) : 0;
    const glowK = Math.max(0.5 + 0.5 * pulse, warn, 1 - mat * 0.5);
    _nc.setHex(this.pal.glow).lerp(_nc2.setHex(this.pal.glow2), 0.5 + 0.5 * Math.sin(t * 0.9 + this.hue)); // el tono deriva despacio
    const gk = 0.55 + 0.75 * glowK, ek = 0.06 + 0.1 * pulse + (1 - mat) * 0.8;
    this.mat.glow.color.setRGB(_nc.r * gk, _nc.g * gk, _nc.b * gk).lerp(_nw, Math.max(this.flash, warn * 0.25, (1 - mat) * 0.5));
    this.mat.body.emissive.setRGB(_nc.r * ek, _nc.g * ek, _nc.b * ek).lerp(_nw, this.flash * 0.8);
  }
  onHit(dmg, perfect, point) {
    this.hp -= dmg; this.hitT = 0.3; this.flash = 1; this.stagger = Math.min(1, this.stagger + 0.6); this.twitch = 1; setHpBar(this.bar, this.hp / this.maxHp);
    shardBurst(point, 8, [this.pal.glow, this.pal.panel, 0xffffff], 2.2); fx.glow(point, [1, 1, 1], 0.4, 0.08); SND.zap(point);
    if (this.hp <= 0) this.kill();
  }
  kill() {
    this.alive = false; const c = this.center(new V3()), big = !!this.K.boss; this.root.updateMatrixWorld(true);
    const pts = this.inst.list.map(b => b.getWorldPosition(new V3()));
    shardBurst(c, big ? 80 : 56, [this.pal.glow, this.pal.panel, this.pal.body, this.pal.glow, 0xffffff], big ? 4.5 : 3.2, pts);
    fx.glow(c, [1, 1, 1], big ? 1.6 : 1.0, 0.14); flashLight.position.copy(c); flashLight.intensity = big ? 7 : 4; flashLight.color.setHex(this.pal.glow);
    SND.shatter(c); if (big) SND.explosion(c, true);
    this.dispose();
  }
  dispose() { super.dispose(); for (const k in this.mat) this.mat[k].dispose(); }
}

/* =================== ARAÑAS (flexiones) =================== */
const SPIDER_KIND = { scout: { s: 1.0 }, heavy: { s: 1.4 }, lizard: { s: 1.2 }, neon: { s: 1.0 }, neonboss: { s: 2.4, boss: true }, titan: { s: 2.4, boss: true }, crocboss: { s: 2.4, boss: true } };
const _ikD = new V3(), _ikU = new V3(), _ikP = new V3(), _knee = new V3(), _foot = new V3(), _hip = new V3();
function ikKnee(H, F, L1, L2, ox, oz, out) {
  _ikD.subVectors(F, H); let d = _ikD.length(); if (d < 1e-5) { _ikD.set(0, -1, 0); d = 1e-5; } _ikD.divideScalar(d);
  d = clamp(d, Math.abs(L1 - L2) + 1e-4, L1 + L2 - 1e-4);
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  _ikU.set(ox * 0.4, 1, oz * 0.4).normalize(); _ikP.copy(_ikU).addScaledVector(_ikD, -_ikU.dot(_ikD)).normalize();
  return out.copy(H).addScaledVector(_ikD, a).addScaledVector(_ikP, h);
}
class Spider {
  constructor(spec, hatch) {
    const K = SPIDER_KIND[spec.kind]; this.type = 'spider'; this.kind = spec.kind; this.s = K.s; this.boss = !!K.boss;
    this.glowMat = M.glowSkin.clone(); // ojos propios: cada araña se enciende según su rabia
    this.inst = RIGS.spider.instance({ main: M.chitinSkin, pat: M.abdomenSkin, gloss: M.glossSkin, glow: this.glowMat }); this.root = this.inst.root; this.B = this.inst.bones;
    this.eyeGlow = glowSprite(0xff2208, 0.05, 0); this.eyeGlow.position.set(0, 0.015, 0.05); this.B.body.add(this.eyeGlow);
    this.root.scale.setScalar(this.s); arena.add(this.root);
    this.pos = new V3(hatch.x, -0.07 * this.s, hatch.z); hatch.openT = 2.2;
    this.home = new V3(hatch.x, 0, hatch.z);
    this.target = oneArm() ? new V3(Math.sign(hatch.x) * rand(0.3, 0.4), 0, rand(-0.3, 0)) : new V3((hatch.x < 0 ? -1 : 1) * rand(0.06, 0.22), 0, -(0.4 + 0.04 * this.s)); // en la plancha atacan por el costado
    this.avg = Math.max(0.01, this.pos.distanceTo(this.target) / dv('walkTime'));
    this.yaw = Math.atan2(this.target.x - this.pos.x, this.target.z - this.pos.z);
    Object.assign(this, { mode: 'emerge', st: 0, run: false, runT: 0, vel: new V3(), hp: spec.hp, maxHp: spec.hp, pending: 0, alive: true, radius: 0.075 * this.s, fade: 1, rear: 0, skitT: 0, lungeFrom: new V3(), lungeTo: new V3(), pitch: 0, roll: 0 });
    Object.assign(this, { threatT: rand(1.2, 2.5), close: 0, rage: 0, hopFrom: new V3(), hopTo: new V3(), hopped: false, startD: Math.max(0.1, this.pos.distanceTo(this.target)) });
    this.legs = SPIDER_LEGS.map(d => ({ d, foot: new V3(), from: new V3(), to: new V3(), t: 1, dur: 0.08, hipW: new V3() }));
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw; this.root.updateMatrixWorld(true);
    this.legs.forEach(L => { this.idealFoot(L, _foot); L.foot.copy(_foot); });
    this.bar = makeHpBar(this.root, 0.17, 0.14); if (this.boss) setHpBar(this.bar, 1);
    SND.hiss(this.center(tmpA), this.s);
  }
  center(out) { this.B.body.getWorldPosition(out); return out; }
  idealFoot(L, out) {
    const d = L.d, s = this.s, reach = (d.L * 1.1) * 0.7 * s, cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    L.hipW.copy(d.hip); this.B.body.localToWorld(L.hipW); arena.worldToLocal(L.hipW);
    const lx = d.s * Math.sin(d.ang) * reach, lz = Math.cos(d.ang) * reach;
    return out.set(L.hipW.x + lx * cy + lz * sy + this.vel.x * 0.07, 0, L.hipW.z - lx * sy + lz * cy + this.vel.z * 0.07);
  }
  update(dt, t) {
    this.st += dt; const s = this.s, active = state === 'play' || state === 'rest';
    this.vel.set(0, 0, 0);
    let moveTo = null, speed = 0;
    switch (this.mode) {
      case 'emerge':
        this.pos.y = Math.min(0, this.pos.y + dt * 0.14 * s);
        if (this.st > 0.7) { this.mode = 'run'; this.st = 0; this.pos.y = 0; }
        break;
      case 'run':
        if (!active) break;
        this.runT -= dt;
        if (this.runT <= 0) { this.run = !this.run; this.runT = this.run ? rand(0.3, 0.9) : rand(0.15, 0.8); if (this.run && Math.random() < 0.4) SND.skitter(this.center(tmpA), s); }
        if (this.run) { moveTo = this.target; speed = this.avg / 0.55 * rand(0.9, 1.2); }
        if (this.pos.distanceTo(this.target) < 0.02 && state === 'play') { this.mode = 'rear'; this.st = 0; SND.hiss(this.center(tmpA), s); break; }
        // amenaza mientras se acerca: más a menudo cuanto más cerca está
        this.threatT -= dt * (1 + this.close * 2.5);
        if (this.threatT <= 0 && !this.run && state === 'play' && this.pos.distanceTo(this.target) > 0.05) { this.mode = 'threat'; this.st = 0; this.hopped = false; SND.hiss(this.center(tmpA), s * 0.9); }
        break;
      case 'threat': { // se alza enseñando los colmillos, da un amago hacia ti y vuelve a correr
        const k = this.st;
        this.rear = k < 0.35 ? k / 0.35 * 0.85 : k < 0.6 ? 0.9 : Math.max(0, 0.9 - (k - 0.6) / 0.35 * 0.9);
        this.yaw += wrapAng(Math.atan2(HL.x - this.pos.x, HL.z - this.pos.z) - this.yaw) * Math.min(1, dt * 10);
        if (k >= 0.35 && !this.hopped) { this.hopped = true; this.hopFrom.copy(this.pos); const to = tmpA.subVectors(this.target, this.pos); to.y = 0; const d = to.length(); this.hopTo.copy(this.pos).addScaledVector(to.normalize(), Math.min(0.06 * s, Math.max(0, d - 0.03))); SND.skitter(this.center(tmpB), s); }
        if (this.hopped && k < 0.6) { const h = (k - 0.35) / 0.25; this.pos.lerpVectors(this.hopFrom, this.hopTo, smooth(h)); this.pos.y = Math.sin(h * Math.PI) * 0.03 * s; }
        if (k >= 0.6) this.pos.y = 0;
        if (k > 0.95) { this.mode = 'run'; this.st = 0; this.run = false; this.runT = rand(0.15, 0.45); this.threatT = rand(1.3, 3.2); }
        break;
      }
      case 'rear':
        this.rear = Math.min(1, this.st / 0.45); this.yaw += wrapAng(Math.atan2(HL.x - this.pos.x, HL.z - this.pos.z) - this.yaw) * Math.min(1, dt * 8);
        if (this.st > 0.55) { this.mode = 'lunge'; this.st = 0; this.lungeFrom.copy(this.pos); this.lungeTo.set(lerp(this.pos.x, HL.x, 0.75), 0, lerp(this.pos.z, HL.z, 0.75)); SND.whoosh(this.center(tmpA)); }
        break;
      case 'lunge': {
        const k = Math.min(1, this.st / 0.22); this.pos.lerpVectors(this.lungeFrom, this.lungeTo, k); this.pos.y = Math.sin(k * Math.PI) * 0.12 + k * Math.max(0, HL.y - 0.25) * 0.7;
        if (k >= 1) { hurtPlayer(this); SND.hiss(this.center(tmpA), s * 0.8); this.mode = 'recoil'; this.st = 0; this.lungeFrom.copy(this.pos); const back = tmpA.subVectors(this.target, HL); back.y = 0; back.normalize(); this.lungeTo.copy(this.target).addScaledVector(back, 0.28); }
        break;
      }
      case 'recoil': {
        const k = Math.min(1, this.st / 0.35); this.pos.lerpVectors(this.lungeFrom, this.lungeTo, smooth(k)); this.pos.y = this.lungeFrom.y * (1 - k) + Math.sin(k * Math.PI) * 0.05; this.rear = 1 - k;
        if (k >= 1) { this.pos.y = 0; this.mode = 'run'; this.st = 0; this.run = false; this.runT = rand(0.4, 1.0); }
        break;
      }
      case 'dying':
        this.fade = this.st < 1.4 ? 1 : Math.max(0, 1 - (this.st - 1.4) / 0.5);
        this.root.scale.setScalar(s * Math.max(0.001, this.fade));
        if (this.st > 1.9) { this.dispose(); this.gone = true; return; }
        break;
    }
    if (moveTo) {
      const to = tmpA.subVectors(moveTo, this.pos); to.y = 0; const d = to.length();
      if (d > 0.005) { to.normalize(); const lat = Math.sin(t * 9 + this.s * 7) * 0.35; const dir = tmpB.set(to.x + to.z * lat, 0, to.z - to.x * lat).normalize(); const step = Math.min(d, speed * dt); this.pos.addScaledVector(dir, step); this.vel.copy(dir).multiplyScalar(speed); this.yaw += wrapAng(Math.atan2(dir.x, dir.z) - this.yaw) * Math.min(1, dt * 10); }
    }
    for (const o of enemies) if (o !== this && o.alive && o.type === 'spider') { const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, dd = dx * dx + dz * dz, min = (this.radius + o.radius) * 1.1; if (dd < min * min && dd > 1e-6) { const k = (min - Math.sqrt(dd)) * 0.5 / Math.sqrt(dd); this.pos.x += dx * k; this.pos.z += dz * k; } }
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
    // cuerpo: respiración, colmillos, pedipalpos
    const B = this.B, moving = this.vel.lengthSq() > 0;
    this.pitch += ((-this.rear * 0.7) - this.pitch) * Math.min(1, dt * 10);
    B.body.rotation.x = this.pitch + (moving ? Math.sin(t * 30) * 0.03 : 0);
    B.body.position.y = (this.mode === 'dying' ? lerp(0.055, 0.02, Math.min(1, this.st * 2)) : 0.055 + this.rear * 0.03) + (moving ? Math.abs(Math.sin(t * 24)) * 0.004 : 0);
    B.abd.rotation.x = Math.sin(t * 2.2) * 0.06 + this.rear * 0.5; B.abd.scale.setScalar(1 + Math.sin(t * 2.2) * 0.025);
    // cara agresiva: ojos que se encienden al acercarse y al amenazar, colmillos que castañetean
    this.close = clamp(1 - this.pos.distanceTo(this.target) / this.startD, 0, 1);
    const angry = this.mode === 'rear' || this.mode === 'lunge' || this.mode === 'threat';
    this.rage += ((angry ? 1 : this.close * 0.6) - this.rage) * Math.min(1, dt * 6);
    if (this.mode !== 'dying') { const g = 1 + this.rage * 2.2 + (angry ? Math.sin(t * 30) * 0.4 : 0); this.glowMat.color.setRGB(g, g * 0.7, g * 0.7); this.eyeGlow.material.opacity = this.rage * (0.55 + Math.sin(t * 17) * 0.2); }
    else { this.glowMat.color.setRGB(0.3, 0.2, 0.2); this.eyeGlow.material.opacity = 0; }
    const fang = angry ? 0.6 + Math.sin(t * 25) * 0.3 : this.close > 0.45 ? 0.3 + Math.sin(t * 18) * 0.18 : Math.max(0, Math.sin(t * 1.7)) * 0.25;
    B.fangL.rotation.x = -fang; B.fangR.rotation.x = -fang; B.fangL.rotation.z = fang * 0.3; B.fangR.rotation.z = -fang * 0.3;
    B.palpL.rotation.x = Math.sin(t * 7.1) * 0.3 - this.rear * 0.8; B.palpR.rotation.x = Math.sin(t * 6.3 + 1) * 0.3 - this.rear * 0.8;
    if (this.mode === 'dying') { B.body.rotation.z = Math.min(1, this.st * 2) * 0.4; }
    this.root.updateMatrixWorld(true);
    this.updateLegs(dt);
    if (this.bar.g.visible) this.bar.g.lookAt(head.p);
  }
  updateLegs(dt) {
    const stepping = [0, 0]; for (const L of this.legs) if (L.t < 1) stepping[L.d.group]++;
    const air = this.mode === 'lunge' || (this.mode === 'recoil' && this.pos.y > 0.01) || this.mode === 'emerge' && this.st < 0.3;
    for (const L of this.legs) {
      const ideal = this.idealFoot(L, _foot), s = this.s;
      if (this.mode === 'dying') {
        const c = this.root.position, k = Math.min(1, this.st * 2.5);
        L.foot.lerp(tmpC.set(lerp(L.hipW.x, c.x, 0.55), 0.035 * s * k, lerp(L.hipW.z, c.z, 0.55)), Math.min(1, dt * 10)); L.t = 1; continue;
      }
      if (air || (this.rear > 0.3 && L.d.i < 2)) {
        const lift = air ? 0.03 * s : 0.06 * s * this.rear;
        L.foot.lerp(tmpC.set(ideal.x + (ideal.x - L.hipW.x) * 0.15, L.hipW.y + lift * (L.d.i < 2 ? 1.2 : -0.4), ideal.z + (ideal.z - L.hipW.z) * 0.15), Math.min(1, dt * 14)); L.t = 1; continue;
      }
      if (L.t >= 1) {
        if (L.foot.y > 0.001) L.foot.y = Math.max(0, L.foot.y - dt * 0.5);
        const dist = Math.hypot(L.foot.x - ideal.x, L.foot.z - ideal.z), reach = L.d.L * 0.77 * s;
        if (dist > 0.32 * reach && stepping[1 - L.d.group] === 0) { L.from.copy(L.foot); L.to.copy(ideal).addScaledVector(this.vel, 0.04); L.to.y = 0; L.t = 0; L.dur = rand(0.055, 0.09); stepping[L.d.group]++; }
      }
      if (L.t < 1) { L.t = Math.min(1, L.t + dt / L.dur); const k = smooth(L.t); L.foot.lerpVectors(L.from, L.to, k); L.foot.y = Math.sin(Math.PI * k) * 0.022 * s; if (L.t >= 1) L.foot.y = 0; }
    }
  }
  drawLegs() {
    const s = this.s * this.fade, c = this.root.position;
    for (const L of this.legs) {
      const d = L.d, L1 = d.L * 0.45 * this.s, L2 = d.L * 0.72 * this.s;
      const ox = L.hipW.x - c.x, oz = L.hipW.z - c.z, ol = Math.hypot(ox, oz) || 1;
      ikKnee(L.hipW, L.foot, L1, L2, ox / ol, oz / ol, _knee);
      if (SPLEGS.n >= 200) return;
      legInstance(SPLEGS.fem, SPLEGS.n, L.hipW, _knee, s); legInstance(SPLEGS.tib, SPLEGS.n, _knee, L.foot, s); SPLEGS.n++;
    }
  }
  onHit(dmg, perfect, point) {
    this.hp -= dmg; setHpBar(this.bar, this.hp / this.maxHp);
    fx.ichor(point, 8, this.s); SND.squish(point);
    this.rear = 0; if (this.mode === 'run') { this.run = false; this.runT = 0.25; }
    if (this.hp <= 0) this.kill();
  }
  kill() {
    this.alive = false; this.mode = 'dying'; this.st = 0; this.bar.g.visible = false;
    const c = this.center(new V3()); fx.ichor(c, 22, this.s * 1.3); fx.glow(c, [0.6, 0.8, 0.2], 0.25 * this.s, 0.12); SND.squish(c); if (this.boss) { fx.explosion(c, 0.5, false); SND.explosion(c, false); }
  }
  dispose() { arena.remove(this.root); this.inst.skel.dispose(); this.glowMat.dispose(); this.eyeGlow.material.dispose(); }
}

/* =================== BICHOS VOLADORES =================== */
const FLYER_KIND = {
  drone: { rig: 'drone', speed: 1.0, erratic: 1.0, scale: 1.0, kamikaze: true },
  hornet: { rig: 'stinger', speed: 1.45, erratic: 1.6, scale: 1.5 },
  bomber: { rig: 'bomber', speed: 0.75, erratic: 0.6, scale: 1.25, kamikaze: true },
  carrier: { rig: 'carrier', speed: 0.5, erratic: 0.35, scale: 2.1, kamikaze: true, boss: true }
};
const MAT_DRONE = { main: M.carbonSkin, glow: M.glowSkin, halo: M.haloSkin, rotor: M.rotorSkin };
// Tumbado (superman, plancha lateral) los voladores vienen bajos, a la altura de la cabeza
const lowFly = () => settings.exercise === 'superman' || settings.exercise === 'splank';
const lowFlyY = () => clamp(settings.exercise === 'splank' ? DET.sp.ref + 0.03 : DET.su.ref + settings.supRange / 100 + 0.08, 0.3, 0.8);
class Flyer {
  constructor(spec) {
    const K = FLYER_KIND[spec.kind], push = isTiny(), low = lowFly(); this.K = K; this.type = 'flyer'; this.kind = spec.kind;
    this.inst = RIGS[K.rig].instance(spec.kind === 'hornet' ? MAT_STINGER : MAT_DRONE); this.root = this.inst.root; this.B = this.inst.bones;
    this.scale = K.scale * (push ? 0.42 : 1); this.root.scale.setScalar(this.scale); arena.add(this.root);
    let start;
    if (push) { const h = pick(liveHatches()); h.openT = 1.6; start = new V3(h.x, 0.05, h.z); }
    const sp = dv('flySpeed') / 3.6 * (push ? 0.27 : 1);
    if (!push) { const g = pick(liveGates()), r = g.g.rotation.y; g.openT = Math.min(10, 1.2 + 1.2 / Math.max(0.05, sp * K.speed)); start = new V3(g.x - 0.6 * Math.sin(r), (low ? 0.6 : 1.5) * g.scale, g.z - 0.6 * Math.cos(r)); }
    Object.assign(this, { base: start.clone(), pos: start.clone(), last: start.clone(), dart: new V3(), dartT: new V3(0, push ? 0.25 : rand(1.8, 3.6), 0), nextDart: 1.2, speed: sp * K.speed * rand(0.85, 1.15), erratic: K.erratic * settings.erratic / 100, w1: rand(0.6, 1.6), w2: rand(0.8, 1.8), ph1: rand(0, TAU), ph2: rand(0, TAU), t: 0, retreat: 0, hp: spec.hp, maxHp: spec.hp, pending: 0, alive: true, radius: 0.24 * this.scale * (spec.kind === 'hornet' ? 0.78 : 1), bank: 0, flickT: 0, windT: 0 });
    this.bar = makeHpBar(this.root, spec.kind === 'hornet' ? 0.1 : 0.17, spec.kind === 'hornet' ? 0.16 : 0.3); if (K.boss) setHpBar(this.bar, 1);
    this.buzz = buzzLoop(spec.kind, arena.localToWorld(start.clone()));
    this.root.position.copy(start);
  }
  center(out) { this.root.getWorldPosition(out); return out; }
  update(dt, t) {
    this.t += dt; const push = isTiny(), low = lowFly(), active = state === 'play' || state === 'rest';
    if (active) {
      // en el superman y la plancha lateral vuelan bajo, a la altura de tu cabeza (nunca por encima de 0,8 m)
      const tgt = tmpA.set(0, low ? lowFlyY() : Math.max(push ? 0.2 : 1.0, HL.y - (push ? 0.05 : 0.12)), 0);
      tgt.x = HL.x * 0.6; tgt.z = HL.z * 0.6;
      const to = tmpB.subVectors(tgt, this.base), d = to.length(), reach = push ? 0.32 : 0.85;
      if (this.retreat > 0) { this.retreat -= dt; this.base.addScaledVector(to.normalize(), -this.speed * 1.6 * dt); }
      else if (d > reach) this.base.addScaledVector(to.normalize(), Math.min(d, this.speed * dt));
      else if (state === 'play') {
        if (this.K.kamikaze) { hurtPlayer(this); const c = this.center(new V3()); fx.explosion(c, 0.45 * (push ? 0.5 : 1), false); SND.explosion(c, false); spawnQueue.push({ kind: this.kind, hp: this.hp }); this.alive = false; this.dispose(); return; }
        if (!this.windT) { this.windT = 1e-3; SND.hiss(this.center(tmpC), 0.8); } // el avispón carga antes de picar (y te da un momento para dispararle)
      }
      if (this.windT > 0 && state !== 'play') this.windT = 0;
      if (this.windT > 0) { // carga 0.45 s echándose atrás, se lanza 0.25 s y pica
        const was = this.windT; this.windT += dt; if (was < 0.45 && this.windT >= 0.45) SND.whoosh(this.center(tmpC));
        if (this.windT >= 0.7) { hurtPlayer(this); this.retreat = 2.5; this.windT = 0; }
      }
      if (this.t > this.nextDart && !this.windT && (!beatP() || BEAT.hit)) {
        const A = clamp(d * (push ? 0.25 : 0.2), push ? 0.06 : 0.4, push ? 0.35 : 2.4) * this.erratic;
        this.dartT.set(rand(-1, 1) * A, rand(-0.4, 0.6) * A * (low ? 0.2 : 0.7), rand(-0.5, 0.5) * A * 0.4);
        this.nextDart = this.t + rand(0.8, 3.0) / Math.sqrt(Math.max(0.2, this.erratic));
      }
    }
    this.dart.lerp(this.dartT, 1 - Math.exp(-dt * 2.2 * Math.max(0.3, this.erratic)));
    const dir = tmpB.set(-this.base.x, 0, -this.base.z); if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1); dir.normalize();
    const right = tmpC.set(dir.z, 0, -dir.x), wob = (push ? 0.04 : 0.25) * this.erratic;
    this.last.copy(this.pos);
    this.pos.copy(this.base).addScaledVector(right, this.dart.x + Math.sin(this.t * this.w1 + this.ph1) * wob).addScaledVector(dir, this.dart.z);
    this.pos.y += this.dart.y + Math.sin(this.t * this.w2 * 1.7 + this.ph2) * wob * 0.6;
    this.pos.y = Math.max(push ? 0.06 : low ? 0.2 : 0.45, this.pos.y); if (low) this.pos.y = Math.min(this.pos.y, 1.0);
    if (this.windT > 0) { // echarse atrás y lanzarse hacia tu cara
      const to = tmpA.subVectors(HL, this.pos), d = to.length(), w = this.windT, s = push ? 0.42 : 1;
      const k = w < 0.45 ? -0.1 * s * smooth(w / 0.45) : -0.1 * s + (Math.max(0, d - 0.12 * s) + 0.1 * s) * smooth(Math.min(1, (w - 0.45) / 0.25));
      if (d > 1e-3) this.pos.addScaledVector(to, k / d);
    }
    this.root.position.copy(this.pos);
    const look = arena.worldToLocal(tmpA.copy(head.p)); this.root.lookAt(arena.localToWorld(tmpA.set(look.x, this.pos.y + (look.y - this.pos.y) * 0.3, look.z)));
    const lat = ((this.pos.x - this.last.x) * right.x + (this.pos.z - this.last.z) * right.z) / Math.max(dt, 1e-3);
    this.bank += (clamp(-lat * 0.25, -0.7, 0.7) - this.bank) * Math.min(1, dt * 5);
    const B = this.B; B.body.rotation.z = this.bank; B.body.position.y = Math.sin(this.t * 3) * 0.01;
    if (this.kind === 'hornet') {
      const ch = this.windT > 0 ? (this.windT < 0.45 ? smooth(this.windT / 0.45) : 1) : Math.max(0, (this.retreat - 2.2) / 0.3);
      flapStinger(B, this.t); B.body.rotation.z = this.bank * (1 - ch);
      poseStinger(B, this.root, this.t, this.ph1, 0.5 + 0.5 * ch + Math.sin(this.t * 4) * 0.05, ch);
      B.head.rotation.y = Math.sin(this.t * 1.3) * 0.2 * (1 - ch);
    } else {
      for (let i = 0; i < 6; i++) { const r = B['r' + i]; if (r) r.rotation.y += dt * (55 + i * 3); }
      if (B.cam) B.cam.rotation.x = Math.sin(this.t * 0.7) * 0.2;
    }
    if (this.flickT > 0) { this.flickT -= dt; const m = this.inst.meshes.glow; if (m) m.visible = this.flickT <= 0 || Math.random() < 0.5; }
    if (this.buzz) this.buzz.set(this.center(tmpA));
    if (this.bar.g.visible) this.bar.g.lookAt(head.p);
  }
  onHit(dmg, perfect, point) {
    this.hp -= dmg; this.flickT = 0.2; setHpBar(this.bar, this.hp / this.maxHp);
    fx.sparks(point, 8, [1, 0.6, 0.2], 2, 0.03 * Math.max(0.5, this.scale)); SND.metalHit(point, false);
    this.dartT.multiplyScalar(-1);
    if (this.hp <= 0) this.kill();
  }
  kill() {
    this.alive = false; const c = this.center(new V3()), big = !!this.K.boss, s = isTiny() ? 0.45 : 1;
    if (this.kind === 'hornet') { fx.ichor(c, 18, 1.5 * s); fx.glow(c, [1, 0.8, 0.3], 0.4 * s, 0.1); SND.squish(c); }
    else { fx.explosion(c, (big ? 1.4 : 0.55) * s, big); SND.explosion(c, big); }
    rigDebris(this.inst, c, (big ? 3 : 2) * s, this.kind === 'hornet' ? 0 : 0.5, this.kind === 'hornet' ? { main: M.robotStaticWasp } : { main: M.carbonStatic });
    this.dispose();
  }
  dispose() { arena.remove(this.root); this.inst.skel.dispose(); if (this.buzz) { this.buzz.stop(); this.buzz = null; } }
}
M.carbonStatic = std({ map: SURF.carbon.map, normalMap: SURF.carbon.normal, roughnessMap: SURF.carbon.orm, metalnessMap: SURF.carbon.orm, metalness: 1, roughness: 1, vertexColors: true });
M.robotStaticWasp = std({ vertexColors: true, normalMap: SURF.chitin.normal, roughness: 0.42, metalness: 0.05, side: THREE.DoubleSide });

/* =================== ARCOS (sentadillas) =================== */
const HEAD_TOP = 0.10;
// tilt (radianes, + = el lado derecho más alto): la bajada normal vale con la cabeza apartada arcShift hacia el
// lado alto; en el centro hay que bajar más, y en el lado bajo, más aún
// Salto: la cabeza sube deprisa. fastT es el tiempo desde la última subida rápida (más de 0,6 m/s hacia arriba);
// ponerse de puntillas despacio no cuenta
const JUMP = { vy: 0, lastY: 0, fastT: 9 };
function jumpTrack(dt) {
  if (dt <= 0) return; const v = (head.p.y - JUMP.lastY) / dt; JUMP.lastY = head.p.y;
  JUMP.vy = JUMP.vy * 0.5 + v * 0.5; JUMP.fastT = JUMP.vy > 0.6 ? 0 : JUMP.fastT + dt;
}
class Arc {
  // jump: valla baja que llega a ras de suelo y hay que saltar
  constructor(drop, offset = 0, second = false, tilt = 0, jump = false) {
    const H = arMode ? 2.25 : 2.55;
    this.drop = drop; this.tilt = tilt; this.jump = jump; this.maxUp = -1; this.fast = false;
    this.barY = jump ? clamp(settings.jumpHeight / 100 + 0.08, 0.12, 0.45) : Math.max(0.4, calibRef + HEAD_TOP - drop - Math.tan(Math.abs(tilt)) * settings.arcShift / 100);
    this.o = makeArcObj(this.barY, H, tilt, jump); this.z = -arenaDepth() + 0.9 - offset; this.o.grp.position.set(0, 0, this.z); arena.add(this.o.grp);
    Object.assign(this, { speed: dv('arcSpeed') / 3.6, judged: false, hit: false, checked: false, minClear: 1, second, alive: true, t: 0, zapT: 0, warnT: 0 });
    this.hum = humLoop(arena.localToWorld(new V3(0, this.barY, this.z)));
    if (!second) gates[1].openT = 1.6;
    zapLines(this.o.lines);
  }
  barAt(x) { return this.barY + Math.tan(this.tilt) * clamp(x, -1, 1); } // altura de la barra sobre tu cabeza
  update(dt, t) {
    this.t += dt; this.z += this.speed * dt; this.o.grp.position.z = this.z;
    const appear = Math.min(1, this.t / 0.4); this.o.grp.scale.set(appear, 1, 1);
    this.zapT -= dt; if (this.zapT <= 0) { this.zapT = 0.045; zapLines(this.o.lines); }
    if (this.o.saws) for (const sw of this.o.saws) sw.rotation.z -= dt * 22; // las sierras giran
    const hz = HL.z, inLane = Math.abs(HL.x) < 1.0, up = head.p.y - calibRef, need = settings.jumpHeight / 100;
    const danger = !this.judged && this.z < hz && this.z > hz - 2.4 && (this.jump ? up < need : HL.y + HEAD_TOP > this.barAt(HL.x) - 0.02);
    const flick = 0.75 + Math.random() * 0.25;
    this.o.glowMat.opacity = (danger ? 1 : 0.7) * flick; this.o.curtainMat.opacity = danger ? 0.32 + 0.15 * Math.sin(t * 30) : 0.18;
    this.o.coreMat.color.setHex(danger ? 0xffffff : 0xffb0a0);
    if (danger && inLane) { this.warnT -= dt; if (this.warnT <= 0) { const d = hz - this.z; this.warnT = clamp(d * 0.18, 0.08, 0.4); SND.beep(1 + (2.4 - d) * 0.25); } }
    if (this.hum) this.hum.set(arena.localToWorld(tmpA.set(clamp(HL.x, -0.95, 0.95), this.barAt(HL.x), this.z)));
    // valla: mientras pasa por debajo de ti (con algo de margen, el salto dura poco) cuenta lo más alto que llegaste
    if (this.jump) { if (!this.judged && Math.abs(this.z - hz) < 0.4 && inLane) { this.checked = true; this.maxUp = Math.max(this.maxUp, up); if (JUMP.fastT < 0.6) this.fast = true; } }
    else if (!this.judged && Math.abs(this.z - hz) < 0.15 && inLane) { this.checked = true; const top = HL.y + HEAD_TOP, b = this.barAt(HL.x); if (top > b) this.hit = true; this.minClear = Math.min(this.minClear, b - top); }
    if (!this.judged && this.z > hz + 0.15) { this.judged = true; this.resolve(); }
    if (this.z > hz + 3.5) { this.dispose(); this.alive = false; }
  }
  resolve() {
    if (!(state === 'play' || state === 'rest')) return;
    const hp = arena.localToWorld(tmpA.set(HL.x, this.barAt(HL.x), HL.z - 0.1));
    if (!this.checked) { say('Quédate en el carril', '#ff8a3d', 1.2); return; }
    if (this.jump) {
      const need = settings.jumpHeight / 100;
      if (this.maxUp < need || !this.fast) { fx.electric(hp, 24); SND.zap(hp); hurtPlayer(this); say(this.maxUp >= need ? '¡Salta, no te estires!' : '¡Salta!', '#ff3b5c', 1.3); return; }
      const perfect = this.maxUp >= need + 0.06; SND.whoosh(hp); registerRep(perfect, false);
      say(perfect ? '¡PERFECTA!' : '¡Saltado!', perfect ? '#3cf0c6' : '#ffffff', 0.9, perfect); if (perfect) SND.perfect();
      return;
    }
    if (this.hit) { fx.electric(hp, 24); SND.zap(hp); hurtPlayer(this); say(this.tilt ? `¡Apártate a la ${this.tilt > 0 ? 'derecha' : 'izquierda'}!` : '¡Agáchate más!', '#ff3b5c', 1.3); return; }
    const perfect = this.minClear >= 0.06;
    SND.whoosh(hp);
    if (this.second) { score += 150 * (1 + combo * 0.1) | 0; say('¡Aguantado!', '#3cf0c6', 1.0); boardDirty = true; return; }
    registerRep(perfect, false);
    say(perfect ? '¡PERFECTA!' : '¡Esquivado!', perfect ? '#3cf0c6' : '#ffffff', 0.9, perfect);
    if (perfect) SND.perfect();
  }
  dispose() { arena.remove(this.o.grp); [this.o.coreMat, this.o.glowMat, this.o.curtainMat].forEach(m => m.dispose()); this.o.curtain.geometry.dispose(); this.o.lines.forEach(l => l.geometry.dispose()); if (this.hum) { this.hum.stop(); this.hum = null; } }
}

/* =================== DISPAROS =================== */
function glowSprite(color, size, opacity = 0.8) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.halo, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); s.scale.set(size, size, 1); return s; }
const chargeOrb = glowSprite(0x3cf0c6, 0.18, 0.9); chargeOrb.visible = false; scene.add(chargeOrb);
// side: solo los enemigos de ese lado (plancha con un brazo: cada brazo dispara a su lado)
function pickNearest(side) {
  const ok = e => !side || (side === 'left' ? e.root.position.x < 0.05 : e.root.position.x > -0.05);
  let best = null, bd = 1e9;
  for (const e of enemies) if (e.alive && e.hp - e.pending > 0 && ok(e)) { const d = e.root.position.distanceToSquared(HL); if (d < bd) { bd = d; best = e; } }
  if (!best) for (const e of enemies) if (e.alive && ok(e)) { best = e; break; }
  return best;
}
function findLock(o, d) {
  let best = null, bs = 1e9; const cone = settings.assist * Math.PI / 180;
  for (const e of enemies) {
    if (!e.alive) continue;
    const v = e.center(tmpA).sub(o), dist = v.length(); if (dist < 0.05) continue;
    const sc = v.angleTo(d) - Math.atan(e.radius * 1.3 / dist);
    if (sc < cone && sc < bs) { bs = sc; best = e; }
  }
  return best;
}
// Puntería automática: el rayo sale de la mano (o del orbe de carga) hacia el enemigo más cercano
function fireOrb(origin, dmg, perfect, pow = 1, side) {
  const e = pickNearest(side), L = boltLevel(perfect, pow), col = boltRGB(L), tiny = isTiny();
  const to = e ? e.center(new V3()) : side ? arena.localToWorld(new V3(side === 'left' ? -3 : 3, 0.2, 0)) : origin.clone().addScaledVector(fwdH(), 5);
  if (e) e.pending += dmg;
  const dist = origin.distanceTo(to), lt = boltStart(origin, to, L, tiny ? 0.4 : 1, !e);
  projs.push({ lt, from: origin.clone(), to, e, dmg, perfect, pow, t: 0, dur: 0.09 + dist * 0.032, kind: 'orb', col });
  SND.bolt(origin, L); if (pow > 1) SND.power(pow, origin); fx.muzzle(origin, col);
}
// Apuntando tú: el rayo sale hacia donde apuntas y se engancha al enemigo fijado
function fireBolt(origin, dir, lockFrom, dmg, perfect, forced) {
  const e = forced || findLock(lockFrom || origin, dir), L = boltLevel(perfect), col = boltRGB(L);
  const to = e ? e.center(new V3()) : origin.clone().addScaledVector(dir, 9);
  if (e) e.pending += dmg; stats.shots++;
  const lt = boltStart(origin, to, L, isTiny() ? 0.5 : 1, !e);
  projs.push({ lt, from: origin.clone(), to, e, dmg, perfect, t: 0, dur: Math.max(0.09, origin.distanceTo(to) / 30), kind: 'bolt', col });
  SND.bolt(origin, L); fx.muzzle(origin, col);
}
function updateProjectiles(dt) {
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i]; p.t += dt;
    if (p.e && p.e.alive) p.e.center(p.to);
    const k = Math.min(1, p.t / p.dur);
    // el líder del rayo avanza hacia el blanco (que puede moverse)
    p.lt.to.copy(p.to); p.lt.k = Math.max(p.lt.k, k);
    if (k < 1) { const h = p.lt.pointAt(k, tmpA); fx.glow(h, p.col.map(c => 0.6 + c * 0.4), (0.13 + 0.03 * p.lt.L) * p.lt.scale, 0.05); fx.glow(h, p.col, 0.3 * p.lt.scale, 0.04); } // cabeza casi blanca con halo del color
    if (k >= 1) {
      boltArrive(p.lt); projs.splice(i, 1);
      if (p.e && p.e.alive) {
        p.e.pending = Math.max(0, p.e.pending - p.dmg);
        if (p.kind === 'bolt') stats.hits++;
        const target = p.e; target.onHit(p.dmg, p.perfect, p.to.clone()); if (!target.alive) onKilled(target);
        if (p.kind === 'orb' && p.pow >= 3) { // disparo muy cargado: estalla y alcanza a los de alrededor
          const R = isTiny() ? 0.32 : 1.4; fx.electric(p.to, 22); fx.glow(p.to, p.col, isTiny() ? 0.35 : 1, 0.15); SND.zap(p.to);
          for (const o of enemies) if (o.alive && o !== target && o.center(tmpA).distanceTo(p.to) < R) { o.onHit(p.pow - 2, false, tmpA.clone()); if (!o.alive) onKilled(o); }
        }
        if (p.kind === 'bolt' && p.perfect) {
          const R = isTiny() ? 0.45 : 1.6; fx.electric(p.to, 16);
          for (const o of enemies) if (o.alive && o !== target && o.type === 'flyer' && o.center(tmpA).distanceTo(p.to) < R) { o.onHit(1, true, tmpA.clone()); if (!o.alive) onKilled(o); }
        }
      } else if (p.e) { p.e.pending = Math.max(0, p.e.pending - p.dmg); fx.sparks(p.to, 5, [1, 0.8, 0.4], 1.5, 0.03); }
      else { fx.sparks(p.to, 4, [0.6, 1, 1], 1, 0.03); if (p.kind === 'bolt') { combo = 0; SND.miss(); say('Fallo', '#a49fc8', 0.6, false); } }
    }
  }
}
function onKilled(e) {
  stats.kills++;
  const pts = { titan: 1500, carrier: 1500, queen: 1500, bigbubble: 1000, wasp: 300, heavy: 500, bomber: 400, hornet: 350, scout: 300, drone: 250, bubble: 200 }[e.kind] || 300;
  score += pts; popup(`+${pts}`, '#ffffff', e.center(new V3()).add(new V3(0, 0.2, 0)));
  if (e.K && e.K.boss || e.boss) say('¡JEFE DESTRUIDO!', '#ffd166', 2.2);
  boardDirty = true;
}

/* =================== REPETICIONES =================== */
function registerRep(perfect, fire = true, side) {
  stats.reps++; waveDone++; if (perfect) stats.perfect++;
  combo++; stats.bestCombo = Math.max(stats.bestCombo, combo);
  score += Math.round(50 * (perfect ? 2 : 1) * (1 + combo * 0.1));
  if (combo > 0 && combo % 10 === 0) { say(`COMBO ×${combo}`, '#ffd166', 1.5); SND.combo(); }
  boardDirty = true;
}
function onRep(opts, side) {
  if (!['play', 'rest', 'ready'].includes(state) || settings.mode === 'arcs' || isBars()) return;
  registerRep(opts.perfect, true, side);
  if (!(combo % 10 === 0)) { if (opts.perfect) say('¡PERFECTA!', '#3cf0c6', 1.0); else if (opts.fast) say('Más controlado', '#ffffff', 1.0); else say('¡Bien!', '#ffffff', 0.7, false); }
  if (opts.perfect) SND.perfect();
  const pow = opts.pow || 1, dmg = (opts.perfect ? 2 : 1) + POW_DMG[pow - 1];
  if (pow > 1) say(`¡DISPARO ×${pow}!`, '#' + POW_COL[pow - 1].toString(16).padStart(6, '0'), 1.1);
  // espadas: la sentadilla carga la hoja (y, con una espada y las pistolas, también el bláster de la otra mano)
  if (isCombat() && swordActive()) { swordCharge(opts.perfect); if (pistolOn() && settings.sword === 'one') gunLoad(opts.perfect); charged = false; chargePow = 1; chargeOrb.visible = false; return; }
  if (pistolOn() && !throwAim()) { gunLoad(opts.perfect); charged = false; chargePow = 1; chargeOrb.visible = false; return; }
  if (autoAim()) { // dispara solo al más cercano (en la plancha con un brazo, a los de su lado)
    const sup = settings.exercise === 'superman', origin = sup ? (hands.left.ok && hands.right.ok ? hands.left.wrist.clone().lerp(hands.right.wrist, 0.5) : head.p.clone().addScaledVector(fwdH(), 0.3)) : side && hands[side].ok ? hands[side].wrist.clone() : chargeOrb.position.clone();
    if (side) gloves[side].pulse = 1;
    fireOrb(origin, dmg, opts.perfect, pow, oneArm() ? side : undefined);
  } else if (!throwCharge(dmg, opts.perfect)) { // apuntando con las manos: carga las manos y se lanza con el gesto
    if (throwAim()) { fireOrb(head.p.clone().add(tmpA.set(0, -0.25, 0)).addScaledVector(fwdH(), 0.3), dmg, opts.perfect, pow); charged = false; chargePow = 1; chargeOrb.visible = false; return; } // sin manos a la vista: al más cercano
    for (const s of aimSources()) {
      let o = s.o.clone();
      if (s.key === 'gaze') o = side && hands[side].ok ? hands[side].wrist.clone() : head.p.clone().add(tmpA.set(0, -0.15, 0)).addScaledVector(fwdH(), 0.2);
      else gloves[s.key].pulse = 1;
      fireBolt(o, s.d.clone(), s.key === 'gaze' ? head.p.clone() : null, dmg, opts.perfect);
    }
  }
  charged = false; chargePow = 1; chargeOrb.visible = false;
}
function onPartial(text) {
  if (!['play', 'rest', 'ready'].includes(state)) return;
  stats.partial++; combo = 0; say(text, '#ff8a3d', 1.2); SND.partial(); charged = false; chargePow = 1; chargeOrb.visible = false;
}
// Sube un nivel de carga mientras aguantas abajo
function onPower(pow) {
  if (!charged || !['play', 'rest', 'ready'].includes(state)) return;
  chargePow = pow; chargeOrb.material.color.setHex(POW_COL[pow - 1]); SND.power(pow);
  say(`CARGA ×${pow}`, '#' + POW_COL[pow - 1].toString(16).padStart(6, '0'), 0.9); boardDirty = true;
}
function onCharge() {
  if (!['play', 'rest', 'ready'].includes(state) || settings.mode === 'arcs' || isBars()) return;
  charged = true; chargePow = 1; chargeOrb.material.color.setHex(POW_COL[0]); chargeOrb.visible = autoAim(); SND.charge(); boardDirty = true;
}
const DET = {
  sq: { state: 'up', ref: 0, min: 0, t0: 0, charged: false, stillT: 0 },
  pu: { state: 'up', ref: 0, min: 0, t0: 0, charged: false, stillT: 0, awayT: 0 },
  curl: { left: { state: 'down', bottom: -0.78, max: 0, t0: 0, lost: 0 }, right: { state: 'down', bottom: -0.78, max: 0, t0: 0, lost: 0 } },
  su: { state: 'down', ref: 0.2, t0: 0, awayT: 0, sec: 0, warnT: 0, peak: 0, lift: 0, armT: 0, stillT: 0, lo: 0.2 },
  lu: { state: 'up', ref: 0, min: 0, t0: 0, charged: false, stillT: 0, leg: 0 },
  di: { state: 'up', ref: 0, min: 0, t0: 0, charged: false, stillT: 0, awayT: 0 },
  pr: { left: { state: 'down', bottom: -0.15, max: 0, t0: 0, lost: 0 }, right: { state: 'down', bottom: -0.15, max: 0, t0: 0, lost: 0 } },
  pair: { side: null, t: 0, perfect: false, fast: false },
  tw: { last: null, acc: 0, lo: 0, hi: 0, dir: 0, n: 0, t0: 0, lostT: 0, warnT: 0, ext: 0 },
  th: { pending: null, hold: null, t0: 0, armed: false, ref: 0, quiet: 0, seen: { left: false, right: false }, last: { left: -1, right: -1 }, low: { left: 9, right: 9 }, lostT: { left: 0, right: 0 } },
  ch: { state: 'idle', side: 0, t0: 0, top: 0 },
  dl: { armed: false, t0: 0, o: null, was: false, rowing: false, warnT: -9, low: { left: 9, right: 9 }, up: { left: 0, right: 0 }, lost: { left: 9, right: 9 } },
  sp: { ref: 0.45, state: 'hold', t0: 0, sec: 0, awayT: 0, dev: 0, warnT: 0 },
  iw: { pair: 0, phase: 'stand' }, iwp: { state: 'up', ref: 0, min: 0, t0: 0, charged: false, stillT: 0 },
  pl: { ref: 0.5, awayT: 0, left: { state: 'down', floor: 0.1, t0: 0, lost: 0, fired: false, dev: 0 }, right: { state: 'down', floor: 0.1, t0: 0, lost: 0, fired: false, dev: 0 } }
};
function vertDetector(d, y, t, dt, cfg) {
  const still = head.speed < 0.06;
  if (d.state === 'up') {
    // la referencia de arriba sube enseguida y baja despacio: se ajusta a tu postura real
    // (calibrar a cuatro patas, o mirar al suelo en la flexión, deja la cabeza más baja que al calibrar)
    d.ref += (y - d.ref) * Math.min(1, dt * (y > d.ref ? 1.5 : 0.25));
    // tras una repetición, la siguiente bajada se mide desde lo más alto que llegaste después (si la repetición se confirmó
    // con la cabeza aún subiendo, no se toma ese final de la subida por otra bajada)
    d.peak = Math.max(d.peak == null ? y : d.peak, y);
    if (y < d.ref - cfg.start && y < d.peak - cfg.start * 0.6) { d.state = 'down'; d.min = y; d.t0 = t; d.charged = false; d.stillT = 0; d.holdT = 0; d.pow = 1; }
  } else {
    if (y < d.min) d.min = y;
    const drop = d.ref - d.min;
    if (!d.charged && drop >= cfg.req) { d.charged = true; onCharge(); }
    // carga: cada POW_STEP segundos abajo (cerca del fondo) sube un nivel, hasta 4
    if (cfg.power && d.charged && y < d.ref - cfg.req * 0.8) { d.holdT += dt; const p = 1 + Math.min(3, Math.floor(d.holdT / POW_STEP)); if (p > d.pow) { d.pow = p; onPower(p); } }
    d.stillT = still ? d.stillT + dt : 0;
    // vuelve arriba al recuperar la mayor parte del recorrido, aunque no llegues a la referencia
    const upAt = Math.min(d.ref - cfg.back, d.min + Math.max(cfg.req * 0.9, drop * 0.6));
    // ya arriba y quieto, pero por debajo de la referencia: la referencia era alta y se corrige
    const stuck = d.charged && d.stillT > 0.8 && y - d.min >= cfg.req * 0.7;
    if (y > upAt || stuck) {
      const dur = t - d.t0;
      if (d.charged) { const o = { perfect: dur >= cfg.perfectDur && dur < 12 && drop >= cfg.req + 0.03, fast: cfg.perfectDur > 0 && dur < cfg.perfectDur * 0.5, pow: cfg.power ? d.pow : 1 }; if (cfg.defer) cfg.defer(o); else onRep(o); }
      else if (drop > cfg.partial) onPartial(cfg.partialMsg);
      if (stuck) d.ref = y;
      d.state = 'up'; d.peak = y;
    } else if (!d.charged && d.stillT > 3) { d.ref = y + cfg.back * 0.5; d.state = 'up'; d.stillT = 0; }
  }
}
// Superman: ¿hay alguna mano claramente recogida junto a la cabeza? La dirección del cuerpo sale de la propia
// cabeza (hacia dónde apuntan la cara y la coronilla), no del escenario: así da igual hacia dónde te tumbes.
// Sin manos a la vista (el seguimiento falla mucho tumbado) se da por bueno.
function armsBack() {
  if (settings.supArms === 'no') return false;
  const d = fwd().add(new V3(0, 1, 0).applyQuaternion(head.q)); d.y = 0;
  if (d.lengthSq() < 1e-4) return false; d.normalize();
  for (const s of ['left', 'right']) { const h = hands[s]; if (h.ok && (h.wrist.x - head.p.x) * d.x + (h.wrist.z - head.p.z) * d.z < 0.15) return true; }
  return false;
}
// Un brazo de curl o de press: devuelve { top, perfect, fast } al completar la subida, { msg } si se quedó a medias
// y nada mientras tanto. En el press, por encima de la cabeza las manos suelen salirse de la vista de las cámaras:
// si se pierde una mano que ya subía bien, cuenta igual
function armStep(kind, side, t, dt) {
  const press = kind === 'press', h = hands[side], d = (press ? DET.pr : DET.curl)[side], pt = settings.perfectTime;
  const range = (press ? settings.pressRange : settings.curlRange) / 100;
  if (!h.ok) {
    d.lost += dt;
    if (press) {
      if (d.state === 'rising' && d.lost > 0.15 && d.max - d.bottom >= range * 0.6) { d.state = 'top'; return { top: true, perfect: false, fast: false }; }
      if (d.lost > 1.5 && d.state !== 'rising') d.state = 'down';
    } else if (d.lost > 0.5) d.state = 'down';
    return null;
  }
  d.lost = 0;
  const r = h.wrist.y - head.p.y;
  d.bottom += (r - d.bottom) * (r < d.bottom ? 0.5 : press ? 0.0015 : 0.0012); // lo más bajo del recorrido
  if (d.state === 'down') { if (r > d.bottom + Math.min(press ? 0.1 : 0.12, range * (press ? 0.35 : 0.45))) { d.state = 'rising'; d.max = r; d.t0 = t; if (press) onCharge(); } }
  else if (d.state === 'rising') {
    d.max = Math.max(d.max, r);
    if (r - d.bottom >= range) { const dur = t - d.t0; d.state = 'top'; return { top: true, perfect: dur >= pt * 0.5 && dur < 5 && r - d.bottom >= range + 0.03, fast: pt > 0 && dur < pt * 0.25 }; }
    if (r < d.bottom + (press ? 0.06 : 0.07)) { d.state = 'down'; if (d.max - d.bottom > range * 0.55) return { msg: press ? 'Estira el brazo del todo arriba' : 'Sube hasta el hombro' }; }
  } else if (r < d.bottom + 0.08) d.state = 'down';
  return null;
}
// Los dos brazos a la vez (barra o kettlebell): cada uno con su paso, y la repetición cuenta cuando los dos llegan
// casi a la vez. Si una mano no se ve (la barra la tapa), basta con la otra
const PAIR_WIN = 0.6;
function pairStep(kind, t, dt) {
  const P = DET.pair;
  for (const side of ['left', 'right']) {
    const ev = armStep(kind, side, t, dt); if (!ev) continue;
    if (ev.msg) { if (!P.side) onPartial(ev.msg); continue; }
    if (P.side && P.side !== side && t - P.t <= PAIR_WIN) { onCharge(); onRep({ perfect: P.perfect && ev.perfect, fast: P.fast || ev.fast }); P.side = null; }
    else Object.assign(P, { side, t, perfect: ev.perfect, fast: ev.fast });
  }
  if (P.side) {
    const other = P.side === 'left' ? 'right' : 'left', lost = hands[other].ok ? 0 : (kind === 'press' ? DET.pr : DET.curl)[other].lost;
    if (lost > 0.3) { onCharge(); onRep({ perfect: false, fast: P.fast }); P.side = null; } // la otra mano no se ve: vale con una
    else if (t - P.t > PAIR_WIN) { onPartial('Sube las dos manos a la vez'); P.side = null; }
  }
}
// Ejercicios en dos tiempos: la bajada (sentadilla, cadera atrás en el swing o peso muerto) carga como siempre y, al volver
// arriba, un gesto de los brazos (o un salto) dispara en CH_WIN segundos. El gesto se va mirando desde que carga (en el
// swing los brazos suben a la vez que la cadera), pero solo dispara ya de pie. Por encima de la cabeza o pegadas al
// cuerpo las cámaras pueden perder las manos: si se pierde una que ya iba bien, cuenta
//  · thruster: las dos manos por encima de la cabeza (thrUp cm sobre los ojos)
//  · frontsq: brazos estirados al frente, a la altura de los hombros
//  · swing: la kettlebell al frente, a la altura del pecho (con una mano a la vista basta: la agarran las dos)
//  · jsquat: la cabeza sube jsqJump cm sobre tu altura de pie, deprisa (un salto, no ponerse de puntillas)
const CHAIN = {
  thruster: { depth: () => dv('squatDepth'), both: true, ok: r => r >= settings.thrUp / 100, lostOk: r => r > -0.02, miss: '¡Sube las pesas por encima de la cabeza!' },
  frontsq: { depth: () => dv('squatDepth'), both: true, ok: (r, f) => r >= -0.28 && f >= 0.32, lostOk: r => r > -0.4, miss: '¡Brazos estirados al frente, a la altura de los hombros!' },
  swing: { depth: () => settings.swingDrop, ok: (r, f) => r >= -0.48 && f >= 0.25, lostOk: r => r > -0.58, low: '¡Lleva más la cadera atrás!', miss: '¡Lanza la kettlebell al frente, a la altura del pecho!' },
  jsquat: { depth: () => dv('squatDepth'), jump: true, miss: '¡Salta al subir!' }
};
const CH_WIN = 2.5, _chw = new V3();
function chainStep(kind, t, dt) {
  const T = DET.th, K = CHAIN[kind], S = DET.sq, req = K.depth() / 100;
  if (K.jump) jumpTrack(dt);
  if (t < T.quiet) return; // recién aterrizado: la caída del salto no es otra sentadilla
  T.hold = null;
  if (!T.pending) vertDetector(S, head.p.y, t, dt, { start: Math.min(0.08, req * 0.5), req, back: 0.05, partial: req * 0.4, perfectDur: settings.perfectTime, partialMsg: K.low || '¡Baja más!', defer: o => { T.hold = o; } });
  if (S.state === 'down' && S.charged && !T.armed && !T.pending) { T.armed = true; T.ref = S.ref; for (const s of ['left', 'right']) { T.seen[s] = false; T.low[s] = 9; T.lostT[s] = 0; } }
  if (T.hold) { T.pending = T.hold; T.t0 = t; T.armed = false; }
  if (!T.pending && !T.armed) return;
  if (K.jump) { if (head.p.y - T.ref >= settings.jsqJump / 100 && JUMP.fastT < 0.3) T.seen.left = T.seen.right = true; }
  else for (const s of ['left', 'right']) {
    const h = hands[s], rr = settings.rowLift / 100;
    if (h.ok) {
      const r = h.wrist.y - head.p.y;
      if (K.row) { T.low[s] = Math.min(T.low[s], r); if (r - T.low[s] >= rr) T.seen[s] = true; }
      else { arena.worldToLocal(_chw.copy(h.wrist)); if (K.ok(r, HL.z - _chw.z)) T.seen[s] = true; } // f: cuánto está por delante de los ojos
      T.last[s] = r; T.lostT[s] = 0;
    } else { T.lostT[s] += dt; if (T.lostT[s] > 0.15 && (K.row ? T.last[s] - T.low[s] >= rr * 0.6 : K.lostOk(T.last[s]))) T.seen[s] = true; }
  }
  if (!T.pending) return;
  const L = T.seen.left, R = T.seen.right, one = !K.both || T.lostT.left > 0.3 || T.lostT.right > 0.3;
  if ((L && R) || ((L || R) && one)) { onRep(T.pending); T.pending = null; if (K.jump) { T.quiet = t + 0.6; S.ref = T.ref; S.state = 'up'; } }
  else if (t - T.t0 > CH_WIN) { onPartial(K.miss); T.pending = null; }
}
// Peso muerto con remo: bajar el peso (la cabeza baja dlDepth) carga; el remo dispara en el momento en que se hace,
// de pie o aún inclinado: tirar de los codos atrás sube la muñeca rowLift respecto a la cabeza desde donde colgaba.
// «Donde colgaba» es lo más bajo de los últimos instantes (sube despacio), así vale en cualquier postura. Sin remo en
// DL_WIN s se avisa; un remo sin peso muerto antes, también
const DL_WIN = 6;
function dlrowStep(t, dt) {
  const D = DET.dl, S = DET.sq, req = settings.dlDepth / 100, rr = settings.rowLift / 100;
  vertDetector(S, head.p.y, t, dt, { start: Math.min(0.08, req * 0.5), req, back: 0.05, partial: req * 0.4, perfectDur: settings.perfectTime, partialMsg: '¡Baja más el peso!', defer: o => { D.o = o; } });
  const ch = S.state === 'down' && S.charged; if (ch && !D.was) { if (D.armed) onPartial('¡Tira de los codos hacia atrás!'); D.armed = true; D.t0 = t; D.o = null; } D.was = ch; // otro peso muerto sin remo: aviso
  for (const s of ['left', 'right']) {
    const h = hands[s];
    if (h.ok) { const r = h.wrist.y - head.p.y; D.low[s] = Math.min(r, D.low[s] + dt * 0.12); D.up[s] = r - D.low[s]; D.lost[s] = 0; }
    else D.lost[s] += dt;
  }
  if (D.armed && t - D.t0 > DL_WIN) { D.armed = false; onPartial('¡Tira de los codos hacia atrás!'); }
  const rowed = ['left', 'right'].some(s => D.lost[s] === 0 ? D.up[s] >= rr : D.lost[s] < 0.5 && D.up[s] >= rr * 0.6); // si se pierde la mano subiendo, cuenta
  if (!rowed) { D.rowing = false; return; }
  if (D.rowing) return; D.rowing = true; // cada remo, una vez
  if (D.armed) { onRep(D.o || { perfect: S.ref - S.min >= req + 0.03, fast: false }); D.armed = false; D.o = null; }
  else if (state === 'play' && t - D.warnT > 3) { D.warnT = t; onPartial('Primero baja el peso (peso muerto)'); }
}
// Leñador: las manos juntas (con la kettlebell o el disco) bajan junto a una cadera y suben en diagonal por encima del
// hombro contrario. Abajo a un lado carga; arriba al otro lado dispara (en CHOP_WIN s). Alturas respecto a tu altura de pie
const CHOP_WIN = 2.5, _chp = new V3();
function chopStep(t, dt) {
  const C = DET.ch; let n = 0; _chp.set(0, 0, 0);
  for (const s of ['left', 'right']) if (hands[s].ok) { _chp.add(arena.worldToLocal(_chw.copy(hands[s].wrist))); n++; }
  if (!n) { if (C.state === 'loaded' && t - C.t0 > CHOP_WIN) C.state = 'idle'; return; }
  _chp.divideScalar(n);
  const x = _chp.x - HL.x, y = _chp.y, side = Math.sign(x), low = y < calibRef * 0.64 && Math.abs(x) > 0.1, high = y > calibRef * 0.9;
  if (low && (C.state === 'idle' || side !== C.side)) { if (C.state === 'idle') onCharge(); Object.assign(C, { state: 'loaded', side, t0: t, top: y }); return; }
  if (C.state !== 'loaded') return;
  if (low) { C.t0 = t; return; } // sigue abajo: el tiempo cuenta desde que empieza a subir
  C.top = Math.max(C.top, y);
  if (high && x * C.side < -0.08) { const dur = t - C.t0; onRep({ perfect: dur >= settings.perfectTime * 0.4 && Math.abs(x) > 0.18, fast: settings.perfectTime > 0 && dur < settings.perfectTime * 0.2 }); C.state = 'idle'; }
  else if (high && x * C.side > 0.05) { onPartial('En diagonal: hasta el hombro contrario'); C.state = 'idle'; } // subió por el mismo lado
  else if (t - C.t0 > CHOP_WIN) { if (C.top > calibRef * 0.78) onPartial('¡Más arriba, por encima del hombro!'); C.state = 'idle'; }
}
// Barra flexible de antebrazos: las manos, agarradas a los extremos, giran alrededor del eje de la barra (la línea
// entre las muñecas) en sentidos contrarios. Se mide el ángulo de cada mano alrededor de ese eje con la dirección
// muñeca → nudillos y se usa la diferencia entre las dos: así da igual que el cuerpo o la barra entera se muevan.
// Un giro (escurrir hacia un lado, ~2 × twistDeg de diferencia) carga; el siguiente, hacia el otro, dispara.
const _tw0 = new V3(), _tw1 = new V3(), _tw2 = new V3(), _tw3 = new V3();
function twistHandAngle(h, ax, r1, r2) {
  const K = h.J[10].ok ? h.J[10].p : h.J[11].ok ? h.J[11].p : null; // nudillo del dedo corazón (o la falange)
  if (K) _tw3.subVectors(K, h.wrist); else _tw3.set(0, 0, -1).applyQuaternion(h.wristQ);
  _tw3.addScaledVector(ax, -_tw3.dot(ax)); if (_tw3.lengthSq() < 1e-6) return null;
  return Math.atan2(_tw3.dot(r2), _tw3.dot(r1));
}
function twistAngle() {
  const L = hands.left, R = hands.right; if (!L.ok || !R.ok) return null;
  const ax = _tw0.subVectors(R.wrist, L.wrist), len = ax.length(); if (len < 0.12 || len > 0.95) return null; ax.divideScalar(len);
  const r1 = _tw1.set(0, 1, 0).addScaledVector(ax, -ax.y); if (r1.lengthSq() < 0.05) r1.set(0, 0, 1).addScaledVector(ax, -ax.z); r1.normalize();
  const r2 = _tw2.crossVectors(ax, r1);
  const a = twistHandAngle(L, ax, r1, r2), b = twistHandAngle(R, ax, r1, r2);
  return a == null || b == null ? null : wrapAng(b - a);
}
function twistStep(t, dt) {
  const T = DET.tw, req = 2 * settings.twistDeg * Math.PI / 180 * 0.85, phi = twistAngle();
  T.warnT -= dt; if (T.t0 < 0) T.t0 = t;
  if (phi == null) { T.lostT += dt; if (T.lostT > 1.2 && state === 'play' && T.warnT <= 0) { say('Mira la barra: no veo tus dos manos', '#ff8a3d', 1.2); T.warnT = 4; } T.last = null; return; }
  T.lostT = 0;
  if (T.last == null) { T.last = phi; T.lo = T.hi = T.acc; return; } // al recuperar las manos no se cuenta el salto
  T.acc += wrapAng(phi - T.last); T.last = phi;
  if (T.acc < T.lo) { T.lo = T.acc; T.ext = -1; } if (T.acc > T.hi) { T.hi = T.acc; T.ext = 1; } // último extremo alcanzado
  // giro completo hacia el lado que toca (el primero, hacia cualquiera)
  let done = 0;
  if (T.dir <= 0 && T.acc - T.lo >= req) done = 1; else if (T.dir >= 0 && T.hi - T.acc >= req) done = -1;
  if (done) {
    const span = done > 0 ? T.acc - T.lo : T.hi - T.acc, dur = t - T.t0;
    T.dir = done; T.lo = T.hi = T.acc; T.t0 = t; T.n++;
    if (T.n % 2) { onCharge(); say('¡Cargado! Ahora al revés', '#3cf0c6', 0.8, false); SND.charge(); }
    else onRep({ perfect: span >= req / 0.85 * 1.05 && dur >= settings.perfectTime * 0.4, fast: settings.perfectTime > 0 && dur < settings.perfectTime * 0.2 });
    return;
  }
  // se dio la vuelta antes de completar el giro que tocaba: avisa si se quedó corto
  const sweep = T.hi - T.lo, back = T.ext > 0 ? T.hi - T.acc : T.acc - T.lo; // cuánto ha vuelto desde el último extremo
  // (el primer medio giro, desde las manos rectas hasta un extremo, no cuenta como corto)
  if (back > 0.5 && sweep > req * 0.45 && sweep < req) {
    if (T.n || T.first) { if (T.warnT <= 0) { onPartial(`Gira más las muñecas (unos ${settings.twistDeg}° cada una)`); T.warnT = 2.5; } }
    T.first = true; T.lo = T.hi = T.acc;
  }
}
/* =================== FLEXIONES INCHWORM =================== */
// Seis huellas de manos en el suelo, tres por mano (izquierda azul, derecha naranja): las dos primeras, junto a los pies;
// las dos últimas, en posición de flexión; las dos del medio cambian de sitio en cada repetición. De pie, te doblas y
// caminas con las manos tocando las huellas en orden (cada mano, las suyas); en las últimas, la flexión carga y al subir
// dispara a las arañas; luego vuelves caminando y te pones de pie, y las huellas del medio se recolocan.
// La arena tiene su origen donde queda tu cabeza en la plancha (ahí está la batalla diminuta); tú empiezas IW_OFF() detrás
const iwReachM = () => settings.iwReach > 0 ? Math.max(0.8, settings.iwReach / 100) : clamp(calibRef * 0.8, 1.0, 1.6);
const IW_OFF = () => settings.exercise === 'inchworm' ? iwReachM() + 0.12 : 0;
const IW = { group: new THREE.Group(), prints: [], mats: [] };
IW.group.visible = false; arena.add(IW.group);
for (let i = 0; i < 6; i++) {
  const side = i % 2 ? 'right' : 'left', n = (i >> 1) + 1, c = mkCanvas(128), x = c.getContext('2d');
  x.save(); x.translate(64, 70); if (side === 'left') x.scale(-1, 1); // la izquierda, en espejo
  x.fillStyle = '#ffffff'; x.beginPath(); x.ellipse(0, 12, 26, 32, 0, 0, TAU); x.fill(); // palma
  for (const [fx, fy, fr, fl] of [[-30, -6, 0.9, 16], [-16, -42, 0.15, 22], [0, -48, 0, 24], [15, -44, -0.1, 22], [28, -32, -0.25, 17]]) { x.save(); x.translate(fx, fy); x.rotate(fr); x.beginPath(); x.ellipse(0, 0, 7, fl, 0, 0, TAU); x.fill(); x.restore(); }
  x.restore(); x.fillStyle = '#10101a'; x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(n), 64, 84);
  const mat = new THREE.MeshBasicMaterial({ map: texFrom(c), color: side === 'left' ? 0x4aa8ff : 0xff9a3c, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), mat); m.rotation.x = -Math.PI / 2; m.position.y = 0.006; m.renderOrder = 3; IW.group.add(m); IW.mats.push(mat);
  IW.prints.push({ side, pair: n - 1, x: 0, z: 0, done: false, m });
}
// Las seis huellas, en la arena: las primeras y las últimas siempre igual; las del medio, a una distancia y un lado distintos cada vez
function iwLayout() {
  const S = IW_OFF(), z0 = S - 0.35, z2 = 0.12, zm = lerp(z0, z2, rand(0.38, 0.62));
  const mz = () => clamp(zm + rand(-0.13, 0.13), z2 + 0.27, z0 - 0.27); // nunca pegadas a las primeras ni a las últimas
  const pos = [[-0.17, z0], [0.17, z0], [-rand(0.11, 0.27), mz()], [rand(0.11, 0.27), mz()], [-0.2, z2], [0.2, z2]];
  IW.prints.forEach((p, i) => { [p.x, p.z] = pos[i]; p.done = false; p.m.position.set(p.x, 0.006, p.z); });
  Object.assign(DET.iw, { pair: 0, phase: 'stand' });
}
const _iww = new V3();
function iwStep(t, dt) {
  const W = DET.iw, standing = head.p.y > calibRef - 0.22;
  if (W.phase === 'stand' && !standing) W.phase = 'walk';
  if ((W.phase === 'stand' || W.phase === 'walk') && W.pair < 3) { // la siguiente pareja de huellas: cada mano, la suya
    for (const p of IW.prints) {
      if (p.pair !== W.pair || p.done) continue; const h = hands[p.side]; if (!h.ok) continue;
      arena.worldToLocal(_iww.copy(h.wrist)); if (_iww.y < 0.22 && Math.hypot(_iww.x - p.x, _iww.z - (p.z + 0.06)) < 0.22) { p.done = true; SND.tick(); haptic(p.side, 0.3, 25); }
    }
    if (IW.prints.filter(p => p.pair === W.pair).every(p => p.done)) { W.pair++; if (W.pair === 3) { W.phase = 'plank'; DET.iwp.state = 'up'; DET.iwp.ref = head.p.y; } }
  }
  if (W.phase === 'plank') {
    const req = dv('pushDepth') / 100, before = stats.reps;
    vertDetector(DET.iwp, head.p.y, t, dt, { start: Math.min(0.05, req * 0.5), req, back: 0.035, partial: req * 0.5, perfectDur: settings.perfectTime, partialMsg: '¡Más abajo en la flexión!' });
    if (stats.reps > before) W.phase = 'back'; // disparó: ahora, de vuelta y de pie
    else if (standing) { onPartial('Haz la flexión en las dos últimas huellas'); iwLayout(); }
  } else if (W.phase === 'walk' && standing) { if (W.pair > 0) onPartial('Camina con las manos hasta las dos últimas huellas'); iwLayout(); }
  else if (W.phase === 'back' && standing) iwLayout(); // de pie otra vez: nuevas huellas
}
function iwVisual(t) {
  const on = settings.exercise === 'inchworm' && ['ready', 'play', 'rest', 'paused'].includes(state); IW.group.visible = on; if (!on) return;
  const W = DET.iw, pulse = 0.7 + 0.3 * Math.sin(t * 8);
  for (const p of IW.prints) {
    const next = (W.phase === 'stand' || W.phase === 'walk') && p.pair === W.pair && !p.done, fin = W.phase === 'plank' && p.pair === 2;
    p.m.material.opacity = next ? pulse : fin ? 0.95 : p.done ? 0.35 : W.phase === 'back' ? 0.25 : 0.55;
    p.m.scale.setScalar(next ? 1.12 : 1);
  }
}
function runDetectors(t, dt) {
  if (isBars()) { barDetect(t, dt); return; }
  if (settings.mode === 'arcs' || settings.mode === 'touch') return;
  const pt = settings.perfectTime;
  if (settings.exercise === 'squat') {
    const req = dv('squatDepth') / 100;
    vertDetector(DET.sq, head.p.y, t, dt, { start: Math.min(0.08, req * 0.5), req, back: 0.05, partial: req * 0.4, perfectDur: pt, partialMsg: '¡Baja más!' });
  } else if (settings.exercise === 'lunge') {
    // zancada: como la sentadilla, con su propia bajada; después de cada una toca la otra pierna
    const d = DET.lu, req = dv('lungeDepth') / 100, before = stats.reps;
    vertDetector(d, head.p.y, t, dt, { start: Math.min(0.08, req * 0.5), req, back: 0.05, partial: req * 0.4, perfectDur: pt, partialMsg: '¡Baja más la rodilla de atrás!' });
    if (stats.reps > before) { d.leg ^= 1; showToast(`Ahora con la pierna ${d.leg ? 'izquierda' : 'derecha'} delante`, '#a49fc8', 1.4); }
  } else if (settings.exercise === 'dips') {
    // fondos en silla: la cabeza baja al doblar los codos y sube al estirarlos
    const d = DET.di, req = dv('dipDepth') / 100;
    if (head.p.y > d.ref + 0.4) { d.awayT += dt; if (d.awayT > 1.5 && state === 'play' && msg.t <= 0) say('Vuelve a la silla', '#ff8a3d', 1.2); d.state = 'up'; return; }
    d.awayT = 0;
    vertDetector(d, head.p.y, t, dt, { start: Math.min(0.05, req * 0.5), req, back: 0.035, partial: req * 0.5, perfectDur: pt, partialMsg: '¡Baja hasta los 90° de codo!' });
  } else if (settings.exercise === 'press' || settings.exercise === 'curl') {
    // cada brazo por su cuenta: dispara al llegar arriba (press) o al hombro (curl)
    for (const side of ['left', 'right']) { const ev = armStep(settings.exercise, side, t, dt); if (ev && ev.top) onRep(ev, side); else if (ev && ev.msg) onPartial(ev.msg); }
  } else if (settings.exercise === 'twist') {
    twistStep(t, dt);
  } else if (settings.exercise === 'press2' || settings.exercise === 'curl2') {
    // con barra o kettlebell: los dos brazos suben juntos y la repetición es una
    pairStep(settings.exercise === 'press2' ? 'press' : 'curl', t, dt);
  } else if (CHAIN[settings.exercise]) {
    // en dos tiempos (sentadilla con press o con elevación, swing, peso muerto con remo, sentadilla con salto): bajar carga y el gesto al subir dispara
    chainStep(settings.exercise, t, dt);
  } else if (settings.exercise === 'chop') {
    chopStep(t, dt);
  } else if (settings.exercise === 'dlrow') {
    dlrowStep(t, dt);
  } else if (settings.exercise === 'splank') {
    // plancha lateral: aguantar con la cadera arriba; cada splHold segundos seguidos, un disparo.
    // Si la cabeza baja splDrop desde tu postura, la cadera ha caído y el tiempo vuelve a empezar
    const P = DET.sp, y = head.p.y, drop = settings.splDrop / 100, hold = settings.splHold;
    // el tiempo solo corre durante la oleada; en el descanso cambias de lado y se toma la nueva postura
    if (state !== 'play') { P.t0 = t; P.sec = 0; P.dev = 0; P.state = 'hold'; if (y < 1.0) P.ref += (y - P.ref) * Math.min(1, dt * 1.5); return; }
    if (y > P.ref + 0.4) { P.awayT += dt; if (P.awayT > 1.5 && state === 'play' && msg.t <= 0) say('Ponte en plancha lateral', '#ff8a3d', 1.2); P.t0 = t; P.sec = 0; return; }
    P.awayT = 0; P.warnT -= dt;
    if (P.state === 'hold') {
      if (Math.abs(y - P.ref) < drop * 0.5) P.ref += (y - P.ref) * Math.min(1, dt * 0.15);
      P.dev = Math.max(P.dev, Math.abs(y - P.ref));
      if (y < P.ref - drop) { P.state = 'low'; if (t - P.t0 > 0.8) onPartial('¡Sube la cadera!'); }
      else {
        const held = t - P.t0;
        if (held >= hold) { onCharge(); onRep({ perfect: P.dev < drop * 0.4, fast: false }); P.t0 = t; P.sec = 0; P.dev = 0; }
        else if (Math.floor(held) > P.sec) { P.sec = Math.floor(held); const left = Math.ceil(hold - held); if (left > 0) { SND.beep(1 + P.sec * 0.12); say(`Aguanta ${left}`, '#ffd166', 0.6, true); } }
      }
    } else if (y > P.ref - drop * 0.5) { P.state = 'hold'; P.t0 = t; P.sec = 0; P.dev = 0; }
  } else if (settings.exercise === 'superman') {
    // superman: tumbado boca abajo; subir el tronco con los brazos estirados y aguantar supHold segundos dispara.
    // S.ref es la altura de la cabeza tumbado: baja enseguida y sube despacio cuando no estás arriba, así se
    // corrige sola si al calibrar la cabeza estaba más alta o más baja que al hacer el ejercicio.
    const S = DET.su, y = head.p.y, req = settings.supRange / 100, hold = settings.supHold;
    if (y > S.ref + 0.6) { S.awayT += dt; if (S.awayT > 1.5 && state === 'play' && msg.t <= 0) say('Túmbate boca abajo', '#ff8a3d', 1.2); S.state = 'down'; S.peak = y; return; }
    S.awayT = 0; S.warnT -= dt;
    // quieto y sin subir el tronco: esa es tu altura tumbado
    S.stillT = head.speed < 0.05 ? S.stillT + dt : 0;
    if (S.state !== 'up') S.ref += (y - S.ref) * Math.min(1, dt * (y < S.ref ? 3 : y < S.ref + req * 0.5 ? 0.6 : S.state === 'down' && S.stillT > 1.2 ? 1.5 : 0));
    S.lo = Math.min(S.lo + (y - S.lo) * Math.min(1, dt * 0.5), y); // lo más bajo de los últimos segundos
    S.lift = Math.max(0, y - S.ref);
    if (S.state === 'down') {
      S.peak = Math.max(S.peak, y);
      // hay que subir de verdad: no basta con una referencia que se quedó baja
      if (y > S.ref + req && y - S.lo > req * 0.6) { S.state = 'up'; S.t0 = t; S.sec = 0; S.armT = 0; S.peak = y; onCharge(); }
      else if (y < S.ref + req * 0.3) {
        // subió pero no lo bastante: dile cuánto le faltó
        const got = S.peak - S.ref;
        if (got > req * 0.5 && state === 'play') { say(`Sube un poco más: ${Math.round(got * 100)} de ${Math.round(req * 100)} cm`, '#ff8a3d', 1.6); SND.partial(); }
        S.peak = y;
      }
    } else if (S.state === 'up') {
      const held = t - S.t0; S.peak = Math.max(S.peak, y);
      if (y < S.ref + req * 0.6) { onPartial(`¡Aguanta ${fmtNum(hold)} s arriba!`); S.state = 'down'; S.peak = y; }
      else {
        // manos recogidas durante un rato: el tiempo se para (un fallo suelto del seguimiento no cuenta)
        S.armT = armsBack() ? S.armT + dt : 0;
        if (S.armT > 0.4) { S.t0 += dt; if (S.warnT <= 0) { say('Estira los brazos', '#ff8a3d', 1.0); S.warnT = 1.5; } }
        else if (held >= hold) { onRep({ perfect: S.peak - S.ref >= req + 0.04, fast: false }); S.state = 'top'; }
        else if (Math.floor(held) > S.sec) { S.sec = Math.floor(held); SND.beep(1 + S.sec * 0.15); const left = Math.ceil(hold - held); if (left > 0) say(`Aguanta ${left}`, '#ffd166', 0.6, true); }
      }
    } else {
      // tras disparar hay que volver a bajar: hasta tu altura tumbado o, si la referencia se quedó baja,
      // al menos lo que pide la elevación desde lo más alto (y entonces la referencia se corrige)
      if (y < S.ref + Math.max(0.03, req * 0.4)) { S.state = 'down'; S.peak = y; }
      else if (y < S.peak - req) { S.state = 'down'; S.peak = y; S.ref = Math.max(S.ref, y - req * 0.3); }
    }
  } else if (oneArm()) {
    // plancha con un brazo: la cabeza se mantiene a su altura de plancha; levantar un brazo dispara a su lado.
    // En el remo en plancha, la mancuerna tiene que subir el recorrido del remo
    const P = DET.pl, y = head.p.y, LIFT = settings.exercise === 'plankrow' ? settings.rowLift / 100 : 0.18;
    if (y > P.ref + 0.35) { P.awayT += dt; if (P.awayT > 1.5 && state === 'play' && msg.t <= 0) say('Vuelve a la plancha', '#ff8a3d', 1.2); return; }
    P.awayT = 0; if (Math.abs(y - P.ref) < 0.1) P.ref += (y - P.ref) * Math.min(1, dt * 0.15);
    // ¿está esa mano levantada del suelo? (con las dos arriba no hay plancha y no se dispara)
    const lifted = s => hands[s].ok && hands[s].wrist.y > P[s].floor + LIFT;
    for (const side of ['left', 'right']) {
      const h = hands[side], d = P[side], other = side === 'left' ? 'right' : 'left';
      if (!h.ok) { d.lost += dt; if (d.lost > 0.6) { d.state = 'down'; d.fired = false; } continue; }
      d.lost = 0;
      const r = h.wrist.y;
      if (d.state === 'down') {
        d.floor += (r - d.floor) * Math.min(1, r < d.floor ? 0.5 : dt * 0.3); // altura de la muñeca apoyada
        if (r > d.floor + LIFT && !lifted(other)) { d.state = 'up'; d.t0 = t; d.fired = false; d.dev = 0; }
      } else {
        d.dev = Math.max(d.dev, Math.abs(y - P.ref));
        if (r < d.floor + LIFT * 0.5) d.state = 'down';
        else if (lifted(other)) d.fired = true; // las dos manos arriba: esta subida ya no dispara
        else if (!d.fired && t - d.t0 > 0.35) { d.fired = true; onCharge(); onRep({ perfect: d.dev < 0.05 && pt > 0, fast: false }, side); }
      }
    }
  } else if (settings.exercise === 'inchworm') {
    iwStep(t, dt);
  } else if (settings.exercise === 'pushup') {
    const d = DET.pu, req = dv('pushDepth') / 100;
    if (head.p.y > d.ref + 0.35) { d.awayT += dt; if (d.awayT > 1.5 && state === 'play' && msg.t <= 0) say('Vuelve a la plancha', '#ff8a3d', 1.2); d.state = 'up'; return; }
    d.awayT = 0;
    vertDetector(d, head.p.y, t, dt, { start: Math.min(0.05, req * 0.5), req, back: 0.035, partial: req * 0.5, perfectDur: pt, partialMsg: '¡Más abajo!', power: true });
  }
}

/* =================== APUNTADO (puntería manual y pistolas) =================== */
const laserGeo = new THREE.BoxGeometry(0.003, 0.003, 1); laserGeo.translate(0, 0, -0.5);
const lasers = {}, locks = {};
const ringTex = texFrom((() => { const c = mkCanvas(128), x = c.getContext('2d'); x.strokeStyle = '#fff'; x.lineWidth = 6; x.beginPath(); x.arc(64, 64, 52, 0, TAU); x.stroke(); x.lineWidth = 5; for (let a = 0; a < 4; a++) { const r = a * Math.PI / 2; x.beginPath(); x.moveTo(64 + Math.cos(r) * 38, 64 + Math.sin(r) * 38); x.lineTo(64 + Math.cos(r) * 62, 64 + Math.sin(r) * 62); x.stroke(); } return c; })());
['left', 'right', 'gaze'].forEach(k => {
  if (k !== 'gaze') { const l = new THREE.Mesh(laserGeo, new THREE.MeshBasicMaterial({ color: 0x5ff5ff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); l.visible = false; scene.add(l); lasers[k] = l; }
  const r = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: 0xffffff, transparent: true, depthTest: false, depthWrite: false, toneMapped: false })); r.renderOrder = 26; r.visible = false; scene.add(r); locks[k] = r;
});
const gazeDot = glowSprite(0xffffff, 0.02, 0.5); gazeDot.visible = false; scene.add(gazeDot);
function aimSources() {
  const out = [];
  if (pistolOn()) { for (const s of ['left', 'right']) if (hands[s].rayOk) out.push({ key: s, o: gunMuzzle(s), d: hands[s].rayD }); if (!out.length) out.push({ key: 'gaze', o: head.p, d: fwd() }); return out; }
  if (!aimManual()) return out;
  if (handsFree() && settings.aim === 'hands') for (const s of ['left', 'right']) if (hands[s].rayOk) out.push({ key: s, o: hands[s].rayO, d: hands[s].rayD });
  if (!out.length) out.push({ key: 'gaze', o: head.p, d: fwd() });
  return out;
}
/* =================== LANZAR EL RAYO CON LA MANO =================== */
// Apuntando con las manos (o con las pistolas sin mandos, con las manos desnudas), cada repetición carga un rayo en cada
// mano (como mucho uno por mano: no se acumulan; se ve un orbe en la muñeca cargada) y cada mano lanza el suyo con un
// gesto: una sacudida de la mano hacia un enemigo (puede salir de donde sea, también de la cadera, y en plena sentadilla):
// acelera deprisa y frena de golpe. Si la sacudida no apunta a ningún enemigo, o no hay sacudida, la carga se queda en la
// mano. En las gafas, sin manos a la vista la repetición carga igual (el rayo espera a que vuelvan a verse); solo en el
// ordenador dispara sola. El gesto se mide respecto a la cabeza; si las gafas pierden la mano en plena sacudida hacia un
// enemigo, el rayo sale igual
const throwAim = () => isCombat() && handsFree() && ((aimManual() && settings.aim === 'hands') || (pistolOn() && bareHands()));
const THROW_V = 1.2, THROW_D = 0.12, THROW_NEAR = 0.22, THROW_BACK = -0.5, THROW_WIDE = 50, THROW_STOP = 0.55; // frena de golpe: por debajo del 55 % del pico
const mkThrow = () => ({ c: null, armed: false, have: false, lost: 0, fwd: 0, peak: 0, prev: new V3(), v: new V3(), from: new V3(), last: new V3(), pdir: new V3() });
const HTH = { left: mkThrow(), right: mkThrow(), idle: 0, taught: false, orbs: {} };
for (const s of ['left', 'right']) { const o = glowSprite(BOLT_COL[0], 0.07, 0.95); o.visible = false; o.renderOrder = 8; scene.add(o); HTH.orbs[s] = o; }
const _thr = new V3(), _thv = new V3(), _thf = new V3();
const throwCount = () => (HTH.left.c ? 1 : 0) + (HTH.right.c ? 1 : 0);
function throwReset() { for (const s of ['left', 'right']) Object.assign(HTH[s], { c: null, armed: false, have: false, lost: 0, fwd: 0, peak: 0 }); HTH.idle = 0; HTH.taught = false; }
// La repetición carga las dos manos (en las gafas, aunque no se vea ninguna); en el ordenador sin manos devuelve false y dispara sola
function throwCharge(dmg, perfect) {
  if (!throwAim() || (!xrActive && !(hands.left.ok || hands.right.ok))) return false;
  for (const s of ['left', 'right']) { const T = HTH[s]; T.c = { dmg, perfect: perfect || !!(T.c && T.c.perfect) }; }
  if (!HTH.taught) { HTH.taught = true; say('Mano atrás y lánzala hacia el enemigo', '#3cf0c6', 2.2); }
  HTH.idle = 0; boardDirty = true; return true;
}
// El blanco: el más cercano a la dirección del lanzamiento, hasta THROW_WIDE grados
function throwTarget(o, d) {
  let best = null, bs = THROW_WIDE * Math.PI / 180;
  for (const e of enemies) {
    if (!e.alive) continue; const v = e.center(tmpA).sub(o), dist = v.length(); if (dist < 0.05) continue;
    const a = v.angleTo(d) - Math.atan(e.radius * 1.3 / dist);
    if (a < bs) { bs = a; best = e; }
  }
  return best;
}
function throwFire(s, o, d, tg) {
  const T = HTH[s], c = T.c; T.armed = false; T.peak = 0; if (!c) return;
  T.c = null; fireBolt(o, d, null, c.dmg, c.perfect, tg);
  gloves[s].pulse = 1; haptic(s, 0.7, 45); HTH.idle = 0; boardDirty = true;
}
function throwStep(dt, t) {
  const on = throwAim() && ['play', 'rest', 'ready'].includes(state);
  _thf.set(0, 0, -1).applyAxisAngle(_up, arena.rotation.y); // hacia dónde mira el cuerpo
  for (const s of ['left', 'right']) {
    const T = HTH[s], h = hands[s], orb = HTH.orbs[s];
    orb.visible = on && h.ok && !!T.c;
    if (orb.visible) { const sc = 0.075 * (1 + 0.15 * Math.sin(t * 18)); orb.position.copy(h.wrist).addScaledVector(_thf, 0.05); orb.scale.set(sc, sc, 1); orb.material.color.setHex(BOLT_COL[T.c.perfect ? 1 : 0]); }
    if (!on) { T.have = false; T.armed = false; continue; }
    if (!h.ok) { // perdida en plena sacudida hacia un enemigo: sale el rayo en esa dirección
      T.lost += dt;
      if (T.have && T.armed && T.peak > THROW_V && T.lost < 0.2) { const tg = throwTarget(T.last, T.pdir); if (tg) throwFire(s, T.last.clone(), T.pdir.clone(), tg); else { T.armed = false; T.peak = 0; } }
      if (T.lost > 0.3) { T.have = false; T.armed = false; T.peak = 0; }
      continue;
    }
    T.lost = 0; _thr.subVectors(h.wrist, head.p); T.last.copy(h.wrist);
    if (!T.have) { T.prev.copy(_thr); T.v.set(0, 0, 0); T.have = true; continue; }
    _thv.subVectors(_thr, T.prev).divideScalar(Math.max(dt, 1e-3)); T.v.lerp(_thv, 0.6); T.prev.copy(_thr);
    const reach = _thr.x * _thf.x + _thr.z * _thf.z, sp = T.v.length(); T.fwd = T.v.dot(_thf);
    if (T.armed && T.peak > THROW_V && sp < T.peak * THROW_STOP) { // frenó de golpe: si la sacudida iba hacia un enemigo, sale el rayo
      const tg = _thr.distanceTo(T.from) > THROW_D && throwTarget(h.wrist, T.pdir);
      if (tg) throwFire(s, h.wrist.clone(), T.pdir.clone(), tg); else { T.armed = false; T.peak = 0; } // hacia ningún enemigo: la carga sigue en la mano
    } else if (T.armed && sp > THROW_V && T.fwd > 0.3 * sp) { if (sp > T.peak) { T.peak = sp; T.pdir.copy(T.v).normalize(); } } // acelerando: el pico marca la dirección
    // mano junto al cuerpo (también colgando junto a la cadera) o echándose atrás, sin estar en plena sacudida: lista
    if (!T.peak && (reach < THROW_NEAR || T.fwd < THROW_BACK) && (sp < THROW_V || T.fwd < 0)) { T.armed = true; T.from.copy(_thr); }
  }
  // cargado y sin lanzar: cada pocos segundos, recuérdalo
  if (on && throwCount() && state === 'play') { HTH.idle += dt; if (HTH.idle > 4) { HTH.idle = 0; say('¡Lanza el rayo! Mano atrás y adelante', '#ffd166', 1.4); } } else HTH.idle = 0;
}
function updateAim(t) {
  // lanzando con la mano no hay láser (el gesto apunta); con espada tampoco ni diana: se corta de cerca
  const show = (aimManual() || pistolOn()) && ['ready', 'play', 'rest'].includes(state) && !(throwAim() && (hands.left.ok || hands.right.ok)) && !(swordActive() && !pistolOn());
  const srcs = show ? aimSources().filter(s => !swordIn(s.key)) : [], used = new Set(srcs.map(s => s.key));
  lasers.left.visible = lasers.right.visible = false;
  for (const k of ['left', 'right', 'gaze']) if (!used.has(k)) locks[k].visible = false;
  gazeDot.visible = false;
  for (const s of srcs) {
    const e = findLock(s.o, s.d), ring = locks[s.key], hot = pistolOn() ? GUN.ammo > 0 : charged;
    if (s.key !== 'gaze') {
      const l = lasers[s.key]; l.visible = true; l.position.copy(s.o); l.quaternion.copy(hands[s.key].rayQ);
      l.scale.z = e ? e.center(tmpA).distanceTo(s.o) : 6; l.material.opacity = hot ? 0.6 : 0.3; l.material.color.setHex(pistolOn() && !hot ? 0xff6a3d : hot ? 0x3cf0c6 : 0x5ff5ff);
    } else { gazeDot.visible = true; gazeDot.position.copy(head.p).addScaledVector(s.d, 3); }
    if (e) { ring.visible = true; e.center(ring.position); const sc = e.radius * 3.2; ring.scale.set(sc, sc, 1); ring.material.color.setHex(hot ? 0x3cf0c6 : 0xffffff); ring.material.rotation = t * 1.5; }
    else ring.visible = false;
  }
}

/* =================== PISTOLAS =================== */
// Cada sentadilla mete munición (una por mano contra voladores); el gatillo dispara un rayo donde apuntas.
// Con mandos se ve un bláster en cada mano con sus celdas de energía; con las manos, se dispara pellizcando.
const GUN = { ammo: 0, perf: [], emptyT: 0 };
const gunCap = () => twoShots() ? 2 : 1; // una por pistola: cada repetición las recarga, no se acumulan
function gunReset() { GUN.ammo = 0; GUN.perf.length = 0; }
function gunLoad(perfect) {
  const n = twoShots() ? 2 : 1;
  for (let i = 0; i < n; i++) { GUN.perf.push(perfect); if (GUN.perf.length > gunCap()) GUN.perf.shift(); }
  GUN.ammo = GUN.perf.length; SND.charge(); boardDirty = true;
  for (const s of ['left', 'right']) if (BLASTERS[s].visible) { haptic(s, 0.25, 30); setTimeout(() => haptic(s, 0.25, 30), 110); } // recarga: doble toque
  for (const s of ['left', 'right']) if (BLASTERS[s].visible) fx.glow(gunMuzzle(s), boltRGB(perfect ? 1 : 0), 0.08, 0.15);
}
// Boca del cañón: con mando, la del bláster (que se agarra por la empuñadura y apunta como el rayo del mando)
const GUN_MUZZLE = new V3(0, 0.095, -0.44);
function gunMuzzle(side, out = new V3()) { const h = hands[side]; return h.isHand ? out.copy(h.rayO).addScaledVector(h.rayD, 0.04) : out.copy(GUN_MUZZLE).applyQuaternion(h.rayQ).add(h.wrist); }
function gunFire(src) {
  if (!['play', 'rest', 'ready'].includes(state)) return;
  if (src.key !== 'gaze') haptic(src.key, GUN.ammo ? 0.75 : 0.1, GUN.ammo ? 50 : 15); // retroceso del disparo (o el clic del gatillo vacío)
  if (!GUN.ammo) { SND.partial(); if (GUN.emptyT <= 0) { say('Sin munición: ¡haz una sentadilla!', '#ff8a3d', 1.1); GUN.emptyT = 2; } return; }
  const perfect = GUN.perf.shift(); GUN.ammo = GUN.perf.length; boardDirty = true;
  if (src.key !== 'gaze') { gloves[src.key].pulse = 1; BLASTERS[src.key].kick = 1; }
  fireBolt(src.key === 'gaze' ? head.p.clone().add(tmpA.set(0, -0.15, 0)).addScaledVector(fwdH(), 0.2) : src.o.clone(), src.d.clone(), src.key === 'gaze' ? head.p.clone() : null, perfect ? 2 : 1, perfect);
}
// Modelo del bláster: el origen es donde la mano agarra el mando; la empuñadura gruesa envuelve el mango del
// mando y el cuerpo tapa su cabeza, así que en realidad mixta casi no se ve el mando. Apunta por -Z.
const blasterGlow = new THREE.MeshBasicMaterial({ color: 0x3cf0c6, toneMapped: false });
function makeBlaster() {
  const k = new Kit();
  k.add('steel', G.box(0.054, 0.16, 0.072, 0.2), C.dark, 0, -0.03, 0.01, -0.28, 0, 0);   // empuñadura (tapa el mango)
  k.add('steel', G.box(0.06, 0.02, 0.08, 0.2), C.gun, 0, -0.105, 0.035, -0.28, 0, 0);     // pie de la empuñadura
  k.add('steel', G.box(0.074, 0.09, 0.27, 0.2), C.gun, 0, 0.085, -0.06);                  // cuerpo (tapa la cabeza del mando)
  k.add('steel', G.box(0.064, 0.075, 0.05, 0.2), C.dark, 0, 0.08, 0.1);                    // culata
  k.add('steel', G.box(0.014, 0.012, 0.075, 0.2), C.steel, 0, 0.02, -0.08);                // guardamonte
  k.add('steel', G.box(0.012, 0.03, 0.012, 0.2), C.steel, 0, 0.005, -0.045, 0.3, 0, 0);    // gatillo
  k.add('steel', G.cyl(0.025, 0.025, 0.2, 14, 0.2), C.steel, 0, 0.095, -0.29, Math.PI / 2, 0, 0);  // cañón
  k.add('steel', G.cyl(0.033, 0.03, 0.05, 14, 0.2), C.dark, 0, 0.095, -0.41, Math.PI / 2, 0, 0);   // bocacha
  k.add('steel', G.box(0.016, 0.022, 0.15, 0.2), C.steel, 0, 0.14, -0.1);                  // mira
  for (const s of [-1, 1]) k.add('steel', G.box(0.01, 0.05, 0.16, 0.2), C.steel, s * 0.04, 0.085, -0.08); // aletas
  const g = k.build({ steel: gloveMat }, { cast: true });
  g.cells = [0, 1, 2].map(i => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.014, 0.024), blasterGlow.clone()); m.position.set(0, 0.134, 0.075 - i * 0.03); g.add(m); return m; });
  for (const z of [-0.23, -0.29, -0.35]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.004, 4, 18), blasterGlow); r.position.set(0, 0.095, z); g.add(r); }
  for (const s of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.012, 0.2), blasterGlow); st.position.set(s * 0.0465, 0.085, -0.07); g.add(st); }
  const tip = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, 4, 18), blasterGlow); tip.position.set(0, 0.095, -0.437); g.add(tip);
  g.visible = false; g.kick = 0; scene.add(g); return g;
}
const BLASTERS = { left: makeBlaster(), right: makeBlaster() };
function updatePistol(dt) {
  GUN.emptyT -= dt;
  const on = pistolOn() && GAME_STATES.includes(state);
  const per = twoShots() ? 2 : 1, lit = Math.min(3, Math.ceil(GUN.ammo / per));
  for (const s of ['left', 'right']) {
    const h = hands[s], b = BLASTERS[s];
    b.visible = on && h.ok && !h.isHand && h.rayOk && !swordIn(s); // la mano de la espada no lleva bláster
    if (b.visible) {
      b.kick = Math.max(0, b.kick - dt * 8);
      b.position.copy(h.wrist).addScaledVector(h.rayD, b.kick * 0.025); b.quaternion.copy(h.rayQ); b.rotateX(b.kick * 0.22); // retroceso: la boca sube
      b.cells.forEach((c, i) => { c.material.color.setHex(i < lit ? (GUN.perf[Math.min(GUN.perf.length - 1, i * per)] ? 0xffd166 : 0x3cf0c6) : 0x2a2440); });
    }
    // gatillo (o pellizco) al apretar
    const press = h.trig && !h.trigPrev; h.trigPrev = h.trig;
    if (on && press && h.rayOk && !h.isHand && !swordIn(s)) gunFire({ key: s, o: gunMuzzle(s), d: h.rayD }); // con las manos desnudas no se pellizca: se lanza
  }
  if (on && preview) { const t = !!PV.keys.KeyT; if (t && !GUN.prevT) gunFire({ key: 'gaze', o: head.p, d: fwd() }); GUN.prevT = t; } // en el ordenador: T dispara con la mirada
}

/* =================== OLEADAS =================== */
function isBossWave(i) { return settings.waves ? i === settings.waves - 1 : (i + 1) % 5 === 0; }
function buildWave(i) {
  if (isBars()) return buildBarWave(i);
  if (settings.mode === 'touch') return buildTouchWave(i);
  let total = waveReps(i);
  const mode = settings.mode, list = [];
  if (mode === 'arcs') {
    const lo = Math.min(settings.arcMin, settings.arcMax) / 100, hi = Math.max(settings.arcMin, settings.arcMax) / 100;
    for (let n = 0; n < total; n++) {
      const tilt = Math.random() * 100 < settings.arcTilt ? (Math.random() < 0.5 ? -1 : 1) * rand(0.6, 1) * settings.arcTiltMax * Math.PI / 180 : 0;
      if (Math.random() * 100 < settings.arcJump) { list.push({ kind: 'jump', drop: 0, tilt: 0, hp: 1 }); continue; } // valla baja
      list.push({ kind: Math.random() * 100 < settings.arcDouble ? 'double' : 'single', drop: rand(lo, hi), tilt, hp: 1 });
    }
    return list;
  }
  if (twoShots()) total *= 2;
  let boss = null;
  const F = foes();
  if (isBossWave(i)) { const b = Math.max(4, Math.round(total * 0.3)); boss = { kind: F === 'robots' || (F === 'mix' && Math.floor(i / 5) % 2 === 0) ? (isTiny() ? 'titan' : settings.crocs >= 100 ? 'crocboss' : settings.neons >= 100 ? 'neonboss' : 'titan') : 'carrier', hp: b }; total -= b; }
  let k = 0, gnd = 0;
  while (total > 0) {
    let kind, hp;
    if (F === 'robots' || (F === 'mix' && k % 2 === 0)) {
      // hombres-cocodrilo y humanoides de neón: repartidos entre los de tierra según sus porcentajes (el cocodrilo, primero)
      const cr = isTiny() ? 0 : settings.crocs / 100, nr = isTiny() ? 0 : Math.min(settings.neons / 100, 1 - cr); gnd++;
      const turn = (r, a) => Math.floor(gnd * r + a) > Math.floor((gnd - 1) * r + a);
      if (turn(cr, 0.5)) { kind = 'lizard'; hp = 2 + Math.floor(i / 3); }
      else if (turn(nr, 0.25)) { kind = 'neon'; hp = 2 + Math.floor(i / 4); }
      else { kind = k % 3 === 2 ? 'heavy' : 'scout'; hp = kind === 'heavy' ? 3 + Math.floor(i / 3) : 2 + Math.floor(i / 4); }
    }
    else { kind = k % 3 === 1 ? 'hornet' : (i >= 2 && k % 5 === 4) ? 'bomber' : 'drone'; hp = kind === 'bomber' ? 2 : 1; } // avispas desde la primera oleada, una de cada tres
    hp = Math.min(hp, total); list.push({ kind, hp }); total -= hp; k++;
  }
  if (boss) list.push(boss);
  return list;
}
// Robots: una compuerta con la salida despejada (dos no aparecen uno encima de otro)
function freeGate() {
  const clear = g => !enemies.some(e => e.alive && e.type === 'robot' && Math.hypot(e.pos.x - g.x, e.pos.z - g.z) < 2.2 * g.scale);
  const ok = liveGates().filter(clear); return ok.length ? pick(ok) : null;
}
// Plancha con un brazo: una trampilla del lado pedido (las arañas salen alternando izquierda y derecha)
function sideHatch(left) { const l = liveHatches(), side = l.filter(h => (h.x < 0) === left); return pick(side.length ? side : l); }
function spawnFromQueue() {
  const spec = spawnQueue.shift(); if (!spec) return;
  if (settings.mode === 'arcs') {
    const a = new Arc(spec.drop, 0, false, spec.tilt || 0, spec.kind === 'jump'); arcs.push(a);
    if (spec.kind === 'double') arcs.push(new Arc(spec.drop, 1.0, true, spec.tilt || 0));
    return;
  }
  let e;
  if (isBars()) e = new HeadTarget(spec);
  else if (ROBOT_KIND[spec.kind] && isTiny()) e = new Spider(spec, oneArm() ? sideHatch(stats.spawned++ % 2 === 0) : pick(liveHatches()));
  else if (ROBOT_KIND[spec.kind]) { const g = ROBOT_KIND[spec.kind].boss ? (gates[1].on ? gates[1] : liveGates()[0]) : freeGate(); if (!g) { spawnQueue.unshift(spec); return; } e = ROBOT_KIND[spec.kind].beast ? new Lizard(spec, g) : ROBOT_KIND[spec.kind].neon ? new Neon(spec, g) : new Robot(spec, g); } // todas ocupadas: sale en cuanto se despeje una
  else e = new Flyer(spec);
  enemies.push(e);
}
// Hueco hasta el siguiente arco (en múltiplos del intervalo medio): regular, o irregular sin patrón que se
// pueda aprender: a veces dos casi seguidos, a veces un respiro largo; la media sigue siendo 1
function arcGap() {
  if (settings.arcTiming === 'regular') return 1;
  const r = Math.random();
  return r < 0.22 ? rand(0.4, 0.6) : r < 0.78 ? rand(0.75, 1.25) : rand(1.35, 1.85);
}
function updateNextArc() {
  let best = null; for (const a of arcs) if (!a.judged && !a.second && (!best || a.z > best.z)) best = a;
  const nx = best || spawnQueue[0], d = nx ? nx.drop : 0, tl = nx ? Math.sign(nx.tilt || 0) : 0, j = !!nx && (nx.jump || nx.kind === 'jump');
  if (Math.abs(d - nextArcDrop) > 0.005 || tl !== nextArcTilt || j !== nextArcJump) { nextArcDrop = d; nextArcTilt = tl; nextArcJump = j; boardDirty = true; }
}

/* =================== FLUJO =================== */
function resetWorld() {
  enemies.forEach(e => { if (e.alive || e.mode === 'dying') e.dispose(); }); enemies = [];
  arcs.forEach(a => a.alive && a.dispose()); arcs = []; touchClear();
  projs = []; boltsClear();
  clearFX(); swordReset(); spawnQueue = []; chargeOrb.visible = false; charged = false; chargePow = 1; nextArcDrop = 0; nextArcTilt = 0; nextArcJump = false;
  if (SPLEGS.fem) { SPLEGS.fem.count = 0; SPLEGS.tib.count = 0; }
  gates.forEach(g => g.openT = 0); hatches.forEach(h => h.openT = 0);
  AUD.loops.forEach(l => l.stop());
}
function speedKey() { return isBars() ? (settings.exercise === 'hang' ? 'hangTime' : 'barArrive') : { combat: foesHas('robots') ? 'walkTime' : 'flySpeed', arcs: 'arcSpeed', touch: 'tchArrive' }[settings.mode]; }
function summaryText() {
  const n = settings.waves ? `${settings.waves} oleadas` : 'oleadas sin fin';
  const first = settings.exercise === 'hang' ? `${hangSecs(0)} s colgado la primera (+${settings.hangInc})` : `${waveReps(0)} reps la primera (+${settings.repsInc})`;
  return `${n} · ${first} · vidas ${settings.lives || '∞'} · descanso ${settings.rest} s`;
}
// Los ejercicios, de cuatro en cuatro por fila (de tres si son muchos, para que se lean): los del modo o, por zona del cuerpo, todos (el modo se ajusta solo)
function exerciseRows(back) {
  const pick = v => { setSetting('exercise', v); back(); }, rows = [];
  const add = (label, list) => { const per = list.length > 12 ? 3 : 4; list.forEach((x, i) => { if (i % per === 0) rows.push({ t: 'choice', label: i ? '' : label, value: settings.exercise, opts: [], onPick: pick }); rows[rows.length - 1].opts.push([x, EX_SHORT[x]]); }); };
  if (settings.exSort === 'body') for (const [name, list] of BODY_ZONES) add(name, list.filter(x => EX_NAMES[x]));
  else add('Ejercicio', MODE_EX[settings.mode]);
  return rows;
}
function lobbyMenu() {
  endSession();
  state = 'lobby'; resetWorld(); center.mesh.visible = false; boardDirty = true; if (preview) previewBarPose(false);
  const bars = isBars(), hang = settings.exercise === 'hang', k = eqKind(), placed = eqPose(k).set;
  const n = eqName(k), start = () => { if (bars && !placed) startPlace(lobbyMenu, `Antes de empezar, coloca ${n.the}`); else beginRun(); };
  const rows = [
    { t: 'title', text: 'REPARENA' },
    { t: 'text', text: summaryText() },
    ...(progressLine() ? [{ t: 'text', text: progressLine(), color: '#3cf0c6' }] : []),
    { t: 'btns', items: [{ label: 'EMPEZAR', style: 'primary', onPress: start }], h: 0.08 },
    ...sessionRows(),
    { t: 'choice', label: 'Modo', value: settings.mode, opts: Object.entries(MODE_NAMES), onPick: v => { setSetting('mode', v); lobbyMenu(); } },
    { t: 'btns', items: [{ label: `Ejercicio: ${EX_NAMES[settings.exercise]}  ▸`, onPress: () => exerciseMenu(lobbyMenu) }] },
    ...(isCombat() ? [{ t: 'field', key: 'foes', after: () => lobbyMenu() }, ...(fieldVisible(FIELD.aim) ? [{ t: 'field', key: 'aim', after: () => lobbyMenu() }] : [])] : []),
    { t: 'field', key: speedKey() },
    ...(foesHas('robots') && foesHas('flyers') ? [{ t: 'field', key: 'flySpeed' }] : []),
    settings.mode === 'arcs' ? { t: 'field', key: 'arcMax' } : bars && hang ? { t: 'field', key: 'hangInc' } : { t: 'field', key: 'repsWave' },
    ...(bars && hang ? [{ t: 'field', key: 'hangPit' }] : [])
  ];
  if (bars && !hang) rows.push({ t: 'field', key: 'barTarget' });
  // espadas (Combate contra robots con sentadillas o zancadas, Toques de pie)
  if (fieldVisible(FIELD.sword)) { rows.push({ t: 'field', key: 'sword', after: () => lobbyMenu() }); if (swordSet()) rows.push({ t: 'field', key: 'swordKind' }); }
  if (settings.mode === 'touch') {
    if (settings.exercise === 'combo') rows.push({ t: 'field', key: 'comboBase', after: () => lobbyMenu() }, { t: 'field', key: { stand: 'comboStand', floor: 'comboFloor', abs: 'comboAbs' }[settings.comboBase] }, { t: 'field', key: 'comboOrder' });
    else rows.push({ t: 'field', key: 'tchHands' });
    rows.push(...tempoRows(() => lobbyMenu()));
  }
  if (bars) rows.push({ t: 'btns', items: [{ label: `Colocar ${n.name}`, style: placed ? 'normal' : 'primary', onPress: () => startPlace(lobbyMenu) }, ...(placed ? [{ label: 'Ajustar', onPress: () => { PLACE.note = ''; adjustMenu(lobbyMenu); } }] : [])] });
  // lo menos usado, en submenús: así el menú principal cabe al alcance de la mano
  const sub = [];
  if (spConnected() || settings.mode === 'touch' || isCombat()) sub.push({ label: spConnected() ? 'Música  ▸' : 'Ritmo  ▸', onPress: () => musicMenu(lobbyMenu) }); // música (Spotify) y ritmo
  const rr = roomRows(lobbyMenu), roomBad = rr.some(r => r.t === 'text' && r.color === '#ffd166'); // la habitación no vale o falta colocarla
  if (viewRows(lobbyMenu).length || rr.length) sub.push({ label: 'Sala y vista  ▸', style: roomBad ? 'primary' : undefined, onPress: () => roomMenu(lobbyMenu) });
  if (roomBad) rows.push({ t: 'text', text: 'La habitación no está lista: mira «Sala y vista»', color: '#ffd166' });
  sub.push({ label: 'Más ajustes  ▸', onPress: () => settingsMenu(lobbyMenu) }, { label: 'Salir', style: 'danger', onPress: exitAll });
  rows.push({ t: 'btns', items: sub });
  if (bars) rows.push({ t: 'text', text: !placed ? `Primero coloca ${n.the}: pulsa Colocar` : `Comprueba que ${n.the} ${n.pl ? 'virtuales coinciden' : 'virtual coincide'} con la real; si no, pulsa Colocar`, color: !placed ? '#ffd166' : '#a49fc8' });
  const m = openMenu(rows);
  m.rebuild = () => lobbyMenu(); demoAttach(m); // al lado, la caricatura del ejercicio elegido
}
// Submenús del principal: elegir ejercicio, música, y sala y vista (realidad mixta); «Volver» deja el principal en el mismo sitio
function exerciseMenu(back) {
  const rows = [{ t: 'title', text: 'EJERCICIO' }, ...exerciseRows(back), { t: 'btns', items: [{ label: 'Volver', onPress: back }] }];
  const m = openMenu(rows); m.rebuild = () => exerciseMenu(back); demoAttach(m);
}
function musicMenu(back) {
  const again = () => musicMenu(back), beat = settings.mode === 'touch' || isCombat(); // el ritmo: al compás o el de Spotify (Toques y Combate)
  const rows = [{ t: 'title', text: 'MÚSICA' }, ...musicRows(), ...(beat ? tempoRows(again) : []), { t: 'btns', items: [{ label: 'Volver', onPress: back }] }];
  const m = openMenu(rows); m.rebuild = again;
}
function roomMenu(back) {
  const again = () => roomMenu(back), rows = [{ t: 'title', text: 'SALA Y VISTA' }, ...viewRows(again), ...roomRows(again), { t: 'btns', items: [{ label: 'Volver', onPress: back }] }];
  const m = openMenu(rows); m.rebuild = again;
}
let settingsTab = 'partida';
function settingsMenu(back, tab = settingsTab) {
  const groups = Object.keys(GROUP_NAMES).filter(g => SCHEMA.some(f => f.g === g && fieldVisible(f)));
  if (!groups.includes(tab)) tab = groups[0]; settingsTab = tab;
  const rows = [{ t: 'title', text: 'AJUSTES' }, { t: 'tabs', items: groups.map(g => ({ label: GROUP_NAMES[g], on: g === tab, onPress: () => settingsMenu(back, g) })) }];
  SCHEMA.filter(f => f.g === tab && fieldVisible(f)).forEach(f => rows.push({ t: 'field', key: f.key, after: f.relayout ? () => settingsMenu(back, tab) : undefined }));
  rows.push({ t: 'text', text: 'Toca el número para escribirlo · desliza o usa − y +', color: '#a49fc8' });
  rows.push({ t: 'btns', items: [{ label: 'Volver', style: 'primary', onPress: () => back() }] });
  const m = openMenu(rows); m.rebuild = () => settingsMenu(back, tab);
}
function openPause() {
  if (!GAME_STATES.includes(state)) return;
  pausedFrom = state; state = 'paused'; center.mesh.visible = false; toastP.mesh.visible = false; watch.mesh.visible = false; SND.click(); boardDirty = true;
  AUD.loops.forEach(l => { if (l.out) l.out.gain.setTargetAtTime(0.0001, AUD.C.currentTime, 0.1); });
  pauseMenu();
}
function resumeGame() {
  BEAT.off = null; // el pulso se vuelve a enganchar a la música
  hideMenu(); state = pausedFrom; center.mesh.visible = ['calib', 'ready', 'mount'].includes(state); boardDirty = true;
  AUD.loops.forEach(l => { if (l.out && !l.dead) l.out.gain.setTargetAtTime(0.2, AUD.C.currentTime, 0.1); });
}
function pauseMenu() {
  const bars = isBars();
  const recal = () => {
    hideMenu();
    if (!bars) { state = 'calib'; calibT = 0; center.mesh.visible = true; }
    else if (pausedFrom === 'play') barToMount(0, true); // vuelve a la oleada en curso
    else if (pausedFrom === 'rest') barToMount(waveIdx + 1);
    else barToMount(BAR.nextWave, BAR.resume);
  };
  const m = openMenu([
    { t: 'title', text: 'PAUSA' },
    { t: 'text', text: settings.exercise === 'hang' ? `${Math.round(stats.hold)} s colgado · ${stats.falls} caídas · ${score} puntos` : `${stats.reps} repeticiones · ${stats.kills} ${bars ? 'reventados' : 'enemigos'} · ${score} puntos` },
    { t: 'btns', items: [{ label: 'Continuar', style: 'primary', onPress: resumeGame }], h: 0.08 },
    ...(WARN.log.length ? [{ t: 'text', text: 'Últimos avisos: ' + WARN.log.slice(-3).reverse().join(' · '), color: '#ff8a3d' }] : []),
    ...musicRows(), ...viewRows(() => pauseMenu()),
    { t: 'btns', items: [{ label: bars ? 'Volver a colgarme' : 'Recalibrar', onPress: recal }, ...(bars ? [{ label: `Ajustar ${eqName().name}`, onPress: () => { PLACE.note = ''; adjustMenu(() => pauseMenu()); } }] : []), { label: 'Ajustes', onPress: () => settingsMenu(() => pauseMenu()) }] },
    ...(SES.active ? [{ t: 'btns', items: [{ label: 'Terminar bloque', onPress: () => { hideMenu(); endRun(false, true); } }, { label: 'Terminar sesión', style: 'danger', onPress: () => { hideMenu(); SES.stop = true; endRun(false, true); } }] }] : []),
    { t: 'btns', items: [{ label: SES.active ? 'Saltar al menú' : 'Terminar ronda', onPress: () => { hideMenu(); if (SES.active) { saveRun(false); lobbyMenu(); } else endRun(false, true); } }, { label: 'Menú principal', onPress: () => { saveRun(false); lobbyMenu(); } }, { label: 'Salir del juego', style: 'danger', onPress: () => { saveRun(false); exitAll(); } }] }
  ], { border: '#ffd166' });
  m.rebuild = () => pauseMenu();
}
function beginRun() {
  audioInit(); resetWorld(); hideMenu(); lastAnchor = null; applyEnvMode(); runSaved = false; // al acabar, el resumen sale delante de donde estés
  waveIdx = 0; lives = settings.lives || 0; score = 0; combo = 0; calibT = 0; waveDone = 0; waveTarget = 0;
  stats = newStats(); gunReset(); swordReset(); throwReset(); BEAT.off = null; BEAT.last = -1;
  if (swordSet()) say('Espadas: despeja el espacio a tu alrededor y ponte la correa de los mandos', '#ffd166', 3.5);
  DET.sq.state = DET.pu.state = DET.lu.state = DET.di.state = 'up'; DET.curl.left.state = DET.curl.right.state = DET.pr.left.state = DET.pr.right.state = 'down'; DET.pl.left.state = DET.pl.right.state = 'down'; DET.su.state = 'down'; Object.assign(DET.th, { pending: null, armed: false, quiet: 0 }); DET.ch.state = 'idle'; Object.assign(DET.dl, { armed: false, was: false, rowing: false, o: null }); Object.assign(DET.tw, { last: null, acc: 0, lo: 0, hi: 0, dir: 0, n: 0, t0: -1, lostT: 0, first: false, ext: 0 });
  stateT = 0; boardDirty = true;
  if (isBars()) { if (preview) previewBarPose(true); barReset(); barToMount(0); }
  else if (preview) { pvPose(); arenaFromHead(); PV.home = camera.position.clone(); TCH.ref = head.p.y; DET.sq.ref = DET.pu.ref = DET.pl.ref = DET.su.ref = DET.lu.ref = DET.di.ref = DET.sp.ref = head.p.y; calibRef = settings.exercise === 'pushup' ? 1.6 : head.p.y; state = 'ready'; }
  else state = 'calib';
  center.mesh.visible = true; drawCenter();
  if (settings.exercise === 'inchworm') { if (preview) arenaFromHead(); iwLayout(); }
}
// Hacia dónde mira el cuerpo, también en el suelo: mirando abajo (plancha, flexiones, superman) la parte de
// arriba de la cabeza apunta hacia delante; tumbado boca arriba, hacia atrás
const _bu = new V3();
function bodyYaw() {
  const f = fwd(); if (Math.abs(f.y) < 0.7) return yawOf(head.q);
  _bu.set(0, 1, 0).applyQuaternion(head.q); if (f.y > 0) _bu.negate(); _bu.y = 0;
  return _bu.lengthSq() > 0.04 ? Math.atan2(-_bu.x, -_bu.z) : lastStandYaw;
}
// (en las flexiones inchworm, el origen va IW_OFF() por delante: donde quedará la cabeza en la plancha)
function arenaFromHead() { const y = bodyYaw(), o = IW_OFF(); arena.position.set(head.p.x - Math.sin(y) * o, 0, head.p.z - Math.cos(y) * o); arena.rotation.y = y; }
// Mientras calibras, el entorno y los enemigos se van colocando a tu alrededor; al calibrar se fijan
function arenaFollow(dt) {
  const k = Math.min(1, dt * 4);
  const o = IW_OFF(), y = arena.rotation.y;
  arena.position.x += (head.p.x - Math.sin(y) * o - arena.position.x) * k; arena.position.z += (head.p.z - Math.cos(y) * o - arena.position.z) * k;
  arena.rotation.y += wrapAng(bodyYaw() - arena.rotation.y) * k;
}
function calibrate() {
  arenaFromHead();
  const y = head.p.y; DET.sq.ref = DET.pu.ref = DET.lu.ref = DET.di.ref = y; if (!isFloor() && !isSeated() && y > 1.1) { calibRef = y; lastStandY = y; }
  if (settings.exercise === 'inchworm') { arenaFromHead(); iwLayout(); } // la plancha, según tu altura
  Object.assign(DET.tw, { last: null, acc: 0, lo: 0, hi: 0, dir: 0, n: 0, t0: -1, lostT: 0, first: false, ext: 0 });
  for (const s of ['left', 'right']) if (hands[s].ok) { DET.curl[s].bottom = DET.pr[s].bottom = hands[s].wrist.y - y; DET.pl[s].floor = hands[s].wrist.y; }
  DET.sp.ref = y;
  DET.pl.ref = y; DET.su.ref = DET.su.lo = y; TCH.ref = y;
  state = 'ready'; stateT = 0; SND.charge(); boardDirty = true;
}
function startWave(i) {
  waveIdx = i; spawnQueue = buildWave(i); waveTarget = waveReps(i); waveDone = 0;
  if (isBars()) { BAR.hold = 0; BAR.need = settings.exercise === 'hang' ? hangSecs(i) : 0; spawnInterval = 0.9; }
  else if (settings.mode === 'arcs') spawnInterval = 60 / dv('arcRate');
  else if (settings.mode === 'touch') touchStartWave();
  else {
    const avgHp = spawnQueue.reduce((a, e) => a + e.hp, 0) / Math.max(1, spawnQueue.length);
    const auto = foes() === 'flyers' ? repTime() * (twoShots() ? 0.55 : 0.95) : clamp(avgHp * repTime() * 0.85, 1.0, 15);
    spawnInterval = settings.spawnGap > 0 ? settings.spawnGap : swordWalk() ? Math.min(auto, 3) : auto; // con espada, uno detrás de otro
  }
  spawnTimer = 0.6; state = 'play'; stateT = 0; const rk = rampK(); say(rk ? `OLEADA ${i + 1} · +${Math.round(rk * 100)} % DIFICULTAD` : `OLEADA ${i + 1}`, '#ffd166', 1.6); center.mesh.visible = false; SND.horn();
}
function hurtPlayer(src) {
  hapticBoth(0.9, 120);
  combo = 0; stats.taken++; hurtT = 0.55; SND.hurt();
  if (settings.lives) { lives--; boardDirty = true; if (lives <= 0) { endRun(false); return; } }
  if (!(src instanceof Arc) && !(src && src.silent)) say(settings.lives ? '¡Te han golpeado!' : '¡Golpe!', '#ff3b5c', 1.3);
}
function saveRun(win) {
  const reps = settings.exercise === 'hang' ? Math.round(stats.hold) : stats.reps; // en colgado se guardan segundos
  if (runSaved || !reps) return; runSaved = true;
  const h = store(HIST_KEY) || [];
  h.push({ ex: settings.exercise, mode: settings.mode, reps, perfect: stats.perfect, kills: stats.kills, win, time: Math.round(stats.time), work: Math.round(stats.work), kcal: Math.round(runStatsKcal() * 10) / 10, date: Date.now() });
  store(HIST_KEY, h.slice(-400));
}
// Calorías de esta ronda (estimadas) y la línea de progreso: lo de hoy y la racha de días
const runStatsKcal = () => kcalOf(settings.exercise, stats.work, stats.time - stats.work);
function progressLine(P = progress()) {
  return P.today.runs ? `Hoy: ${fmtDur(P.today.time)} · ≈ ${Math.round(P.today.kcal)} kcal · racha ${daysTxt(P.streak)}` : P.streak ? `Racha: ${daysTxt(P.streak)} (entrena hoy para seguirla)` : '';
}
function endRun(win, manual) {
  const h = store(HIST_KEY) || [], prevBest = h.filter(r => r.ex === settings.exercise).reduce((a, r) => Math.max(a, r.reps), 0), P0 = progress(h);
  saveRun(win);
  const P = progress(), streakUp = P.streak > P0.streak && P.streak > 1;
  state = 'end'; center.mesh.visible = false; chargeOrb.visible = false; spawnQueue = []; boardDirty = true;
  AUD.loops.forEach(l => l.stop());
  const mm = Math.floor(stats.time / 60), ss = String(Math.round(stats.time % 60)).padStart(2, '0');
  const hang = settings.exercise === 'hang', got = hang ? Math.round(stats.hold) : stats.reps;
  const lines = [
    hang ? `Colgado ${got} s · ${stats.falls} caídas · racha máx. ${stats.bestCombo} s` : `${EX_NAMES[settings.exercise]}: ${stats.reps} reps · ${stats.perfect} perfectas · ${stats.partial} a medias`,
    isBars() ? (hang ? `Oleadas superadas: ${waveIdx + (win ? 1 : 0)}` : `${stats.kills} reventados con la cabeza · ${stats.falls} caídas · combo máx. ×${stats.bestCombo}`) : isCombat() && stats.shots ? `Precisión ${Math.round(100 * stats.hits / stats.shots)}% · ${stats.kills} derribados · combo ×${stats.bestCombo}` : settings.mode === 'arcs' ? `Golpes recibidos: ${stats.taken} · combo máx. ×${stats.bestCombo}` : settings.mode === 'touch' ? `${stats.reps} tocados · ${stats.taken} fallos · combo máx. ×${stats.bestCombo}` : `${stats.kills} enemigos destruidos · combo máx. ×${stats.bestCombo}`,
    `Tiempo ${mm}:${ss} · ≈ ${Math.round(runStatsKcal())} kcal · ${score} puntos`,
    streakUp ? `¡${P.streak} días seguidos entrenando!${P.streak >= P.best ? ' Tu mejor racha' : ''}` : progressLine(P),
    got > prevBest && prevBest > 0 ? (hang ? '¡Nuevo récord de tiempo colgado!' : '¡Nuevo récord de repeticiones!') : (win ? 'Zona despejada.' : manual ? 'Ronda terminada.' : 'Descansa y vuelve a por ellos.')
  ];
  if (win) SND.victory(); else if (!manual) SND.defeat();
  if (SES.active) { sessionBlockDone(win, manual); return; } // sesión: pasa al siguiente bloque
  endMenu(win ? '¡VICTORIA!' : manual ? 'RESUMEN' : 'DERROTA', lines.filter(Boolean));
}
function endMenu(title, lines) {
  const rows = [{ t: 'title', text: title, color: title === 'DERROTA' ? '#ff4a6a' : '#ffd166' }, ...lines.map(l => ({ t: 'text', text: l })),
    { t: 'btns', items: [{ label: 'Otra ronda', style: 'primary', onPress: () => beginRun() }, { label: 'Menú principal', onPress: () => lobbyMenu() }, { label: 'Salir del juego', style: 'danger', onPress: exitAll }] }];
  const m = openMenu(rows); m.rebuild = () => endMenu(title, lines);
}
function exitAll() {
  endSession(); hideMenu(); resetWorld(); center.mesh.visible = false; toastP.mesh.visible = false; state = 'idle';
  const s = renderer.xr.getSession(); if (s) s.end().catch(() => {});
  if (preview) stopPreview();
  ambientStop(); renderHistory(); syncForm();
}

/* =================== LÓGICA POR FOTOGRAMA =================== */
function gameStep(dt, t) {
  if (msg.t > 0) { msg.t -= dt; if (msg.t <= 0) boardDirty = true; }
  stateT += dt;
  if (GAME_STATES.includes(state) && !holdsWeights() && !isBars() && hands.left.pinch && hands.right.pinch) { pinchT += dt; if (pinchT > 1) { pinchT = 0; openPause(); } } else pinchT = 0;
  if (state === 'calib') {
    arenaFollow(dt);
    const ok = settings.exercise === 'twist' ? head.p.y > 0.55 && hands.left.ok && hands.right.ok : isSeated() ? head.p.y > 0.55 && head.p.y < 1.5 : !isFloor() ? head.p.y > 1.1 : isSupine() ? head.p.y < 0.6 && head.p.y > 0.03 : (head.p.y < 1.0 && head.p.y > (settings.exercise === 'superman' ? 0.04 : 0.15));
    if (ok && head.speed < 0.07) calibT += dt; else calibT = Math.max(0, calibT - dt * 2);
    if (calibT >= 2) calibrate();
  } else if (state === 'ready') { if (stateT >= 3) startWave(0); }
  else if (state === 'between') sessionStep(dt);
  else if (state === 'mount') barMountStep(dt);
  if (['ready', 'play', 'rest'].includes(state)) { if (state !== 'ready') stats.time += dt; if (state === 'play') stats.work += dt; runDetectors(t, dt); }
  iwVisual(t);
  if (settings.mode === 'touch') touchStep(dt, t);
  if (state === 'play') {
    spawnTimer -= dt;
    const alive = settings.mode === 'arcs' ? 0 : enemies.filter(e => e.alive).length;
    beatStep(dt); // con ritmo, los enemigos salen en el pulso
    if (spawnTimer <= 0 && spawnQueue.length && settings.mode !== 'touch' && alive < (isBars() ? 2 : dv('maxAlive')) && (!beatP() || BEAT.hit)) { spawnFromQueue(); spawnTimer = spawnInterval * (settings.mode === 'arcs' ? arcGap() : rand(0.8, 1.2)); boardDirty = true; }
    const anyLeft = settings.mode === 'arcs' ? arcs.some(a => a.alive && !a.judged) : settings.mode === 'touch' ? touchLeft() : enemies.some(e => e.alive);
    if (settings.exercise === 'hang' ? BAR.hold >= BAR.need || BAR.failed : !spawnQueue.length && !anyLeft && !projs.length) {
      // remolino: si te engulló, la oleada termina sin superarla y hay que volver a colgarse
      if (BAR.failed) { const last = settings.waves && waveIdx >= settings.waves - 1; BAR.failed = false; if (last) endRun(false); else if (settings.rest > 0) { state = 'rest'; stateT = 0; say('Oleada perdida. Descansa', '#ff8a3d', 2); } else barToMount(waveIdx + 1); }
      else if (settings.waves && waveIdx >= settings.waves - 1) endRun(true);
      else if (settings.rest > 0) { state = 'rest'; stateT = 0; SND.victory(); say(isBars() ? '¡Oleada superada! Bájate y descansa' : settings.exercise === 'splank' ? '¡Oleada superada! Cambia de lado' : '¡Oleada superada!', '#3cf0c6', 2); }
      else startWave(waveIdx + 1);
    }
  } else if (state === 'rest') {
    if (Math.floor(stateT) !== Math.floor(stateT - dt)) boardDirty = true;
    if (stateT >= settings.rest) { if (isBars()) barToMount(waveIdx + 1); else startWave(waveIdx + 1); }
  }
  if (state !== 'paused') {
    for (const e of enemies) if (e.alive || e.mode === 'dying') e.update(dt, t);
    enemies = enemies.filter(e => (e.alive || (e.mode === 'dying' && !e.gone)));
    for (const a of arcs) if (a.alive) a.update(dt, t);
    arcs = arcs.filter(a => a.alive);
    updateProjectiles(dt);
    updateGates(dt, t);
  }
  if (SPLEGS.fem) {
    SPLEGS.n = 0; for (const e of enemies) if (e.type === 'spider') e.drawLegs();
    SPLEGS.fem.count = SPLEGS.tib.count = SPLEGS.n; if (SPLEGS.n) { SPLEGS.fem.instanceMatrix.needsUpdate = true; SPLEGS.tib.instanceMatrix.needsUpdate = true; }
  }
  if (settings.mode === 'arcs') { updateNextArc(); jumpTrack(dt); }
  const f = fwdH();
  if (isFloor() && head.p.y < 1) chargeOrb.position.copy(head.p).addScaledVector(f, 0.28).add(tmpA.set(0, -0.2, 0));
  else chargeOrb.position.copy(head.p).addScaledVector(f, 0.42).add(tmpA.set(0, -0.36, 0));
  if (chargeOrb.visible) { const s = 0.15 + (chargePow - 1) * 0.07 + Math.sin(t * (10 + chargePow * 4)) * 0.03; chargeOrb.scale.set(s, s, 1); }
}
