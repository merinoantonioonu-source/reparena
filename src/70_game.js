
/* =================== ESTADO DE PARTIDA =================== */
const GAME_STATES = ['calib', 'ready', 'mount', 'play', 'rest'];
let state = 'idle', preview = false, xrActive = false;
let enemies = [], arcs = [], projs = [], spawnQueue = [], spawnTimer = 0, spawnInterval = 3, waveIdx = 0, waveTarget = 0, waveDone = 0;
let lives = 3, score = 0, combo = 0, stateT = 0, calibT = 0, pinchT = 0, pausedFrom = 'play';
const newStats = () => ({ reps: 0, perfect: 0, partial: 0, kills: 0, bestCombo: 0, time: 0, shots: 0, hits: 0, taken: 0, falls: 0, hold: 0, spawned: 0 });
let stats = newStats();
let msg = { text: '', color: '#fff', t: 0 };
let charged = false, chargePow = 1, nextArcDrop = 0, calibRef = 1.6, runSaved = false;
// Carga de las flexiones: cuanto más aguantas abajo, más fuerte el disparo
const POW_STEP = 0.8, POW_COL = [0x3cf0c6, 0xffd166, 0xff8a2a, 0xff3cf0], POW_DMG = [0, 1, 2, 4];
const HL = new V3(); // cabeza del jugador en coordenadas de la arena
const tmpA = new V3(), tmpB = new V3(), tmpC = new V3();
const wrapAng = a => Math.atan2(Math.sin(a), Math.cos(a));
function say(text, color = '#ffffff', dur = 1.4, toast = true) { msg = { text, color, t: dur }; boardDirty = true; if (toast) showToast(text, color, dur); }

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
  scout: { rig: 'scout', scale: 1.0, speedF: 1.0, heavy: false, stop: 1.25, stride: 0.8, head: 1.85 },
  heavy: { rig: 'heavy', scale: 1.0, speedF: 0.85, heavy: true, stop: 1.4, stride: 0.85, head: 1.75 },
  titan: { rig: 'titan', scale: 1.55, speedF: 0.7, heavy: true, stop: 1.9, stride: 0.9, head: 1.75, boss: true }
};
class Robot {
  constructor(spec, gate) {
    const K = ROBOT_KIND[spec.kind]; this.K = K; this.type = 'robot'; this.kind = spec.kind;
    this.rig = RIGS[K.rig]; this.inst = this.rig.instance(MAT_ROBOT); this.root = this.inst.root; this.B = this.inst.bones;
    this.root.scale.setScalar(K.scale); arena.add(this.root);
    const gr = gate.g.rotation.y; this.pos = new V3(gate.x - Math.sin(gr) * 1.0, 0, gate.z - Math.cos(gr) * 1.0);
    this.target = new V3(rand(-0.9, 0.9), 0, -(K.stop + rand(0, 0.35)));
    this.speed = this.pos.distanceTo(this.target) / settings.walkTime * K.speedF;
    this.yaw = Math.atan2(this.target.x - this.pos.x, this.target.z - this.pos.z);
    Object.assign(this, { state: 'emerge', st: 0, phase: rand(0, TAU), hp: spec.hp, maxHp: spec.hp, pending: 0, alive: true, radius: 0.4 * K.scale, hitT: 0, twitchT: rand(2, 5), twitch: 0, twitchYaw: 0, jaw: 0, arm: 0, smokeT: 0, lastCos: [1, 1], gunSpin: 0, flickT: 0, knockFrom: new V3(), knockTo: new V3() });
    this.bar = makeHpBar(this.root, 2.25, 0.7); if (K.boss) setHpBar(this.bar, 1);
    gate.openT = Math.min(12, 1.3 + 1.6 / Math.max(0.05, this.speed)); this.animate(0, 0, false); this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
  }
  center(out) { this.B.chest.getWorldPosition(out); return out; }
  animate(dt, t, walking) {
    const B = this.B, K = this.K, isR = this.rig.kind === 'ripper', L = this.rig.legL;
    if (walking) this.phase += TAU * clamp(this.speed / (K.stride * K.scale), 0.45, 2.4) * dt;
    const p = this.phase, amp = walking ? 1 : 0.0, drops = [];
    [['L', 0], ['R', Math.PI]].forEach(([sd, off], i) => {
      const q = p + off, c = Math.cos(q);
      let a1, a2, a3;
      if (isR) { a1 = -0.55 + 0.42 * Math.sin(q) * amp; a2 = 1.2 + 0.45 * Math.max(0, c) * amp; a3 = -(a1 + a2) + 0.1 * Math.sin(q + 0.4) * amp; }
      else { a1 = -0.36 * Math.sin(q) * amp; a2 = 0.08 + 0.62 * Math.max(0, c) * amp; a3 = -(a1 + a2); }
      B['th' + sd].rotation.x = a1; B['kn' + sd].rotation.x = a2; B['an' + sd].rotation.x = a3;
      drops.push(L[0] * Math.cos(a1) + L[1] * Math.cos(a1 + a2) + L[2] * Math.cos(a1 + a2 + a3));
      if (walking && this.lastCos[i] > 0 && c <= 0) { const fp = B['an' + sd].getWorldPosition(new V3()); fp.y = 0.02; SND.step(fp, K.heavy); fx.dust(fp, K.heavy ? 5 : 3, 0.25 * K.scale); if (Math.random() < 0.3) SND.servo(fp); }
      this.lastCos[i] = c;
    });
    B.hips.position.y = Math.max(drops[0], drops[1]) - this.rig.hipOff + 0.015;
    const lean = isR ? 0.35 : 0.3;
    B.spine.rotation.x = lean + Math.sin(p * 2) * 0.04 * amp - this.hitT * 1.2 + (this.state === 'windup' ? -0.15 : this.state === 'strike' ? 0.35 : 0);
    B.spine.rotation.z = Math.sin(p) * 0.06 * amp;
    // brazos
    const arm = this.arm; // 0 normal, 1 levantados (preparando golpe), -1 golpe
    const raise = Math.max(0, arm), strike = Math.max(0, -arm);
    if (isR) {
      for (const [sd, off, sx] of [['L', Math.PI, 1], ['R', 0, -1]]) {
        B['sh' + sd].rotation.x = lerp(-0.3 + 0.32 * Math.sin(p + off) * amp, -2.7, raise) * (1 - strike) + strike * -0.5;
        B['sh' + sd].rotation.z = sx * (0.18 + raise * 0.25);
        B['el' + sd].rotation.x = lerp(-0.8 + 0.2 * Math.sin(p + off) * amp, -0.5, raise) * (1 - strike) + strike * -0.15;
        B['ha' + sd].rotation.x = -0.25 + Math.sin(t * 3 + off) * 0.08;
      }
    } else {
      B.shL.rotation.x = lerp(-0.35 + 0.28 * Math.sin(p + Math.PI) * amp, -2.5, raise) * (1 - strike) + strike * -0.6; B.shL.rotation.z = 0.2;
      B.elL.rotation.x = lerp(-0.5, -0.3, raise); B.clawL.rotation.x = -0.2 + raise * 0.4 - strike * 0.3;
      B.shR.rotation.x = -1.15 + Math.sin(p) * 0.08 * amp; B.shR.rotation.z = -0.15; B.elR.rotation.x = -0.35;
      this.gunSpin += dt * (this.state === 'windup' || this.state === 'strike' ? 30 : 4); B.gunR.rotation.y = this.gunSpin;
    }
    // la cabeza sigue al jugador (con espasmos)
    const toP = tmpA.subVectors(HL, this.pos), ly = wrapAng(Math.atan2(toP.x, toP.z) - this.yaw), dist = Math.hypot(toP.x, toP.z);
    const pitch = Math.atan2(HL.y - K.head * K.scale, Math.max(0.3, dist));
    B.head.rotation.y = clamp(ly, -1.1, 1.1) + this.twitchYaw;
    B.head.rotation.x = -pitch - (isR ? 0.1 : 0.3) + this.twitch * 0.4;
    B.jaw.rotation.x = this.jaw * (isR ? 0.55 : 0.35);
  }
  update(dt, t) {
    const K = this.K; this.st += dt; this.hitT = Math.max(0, this.hitT - dt * 4);
    let walking = false;
    // espasmos inquietantes
    this.twitchT -= dt;
    if (this.twitchT <= 0) { this.twitchT = rand(2.5, 6); this.twitch = 1; this.twitchYaw = rand(-0.9, 0.9); }
    if (this.twitch > 0) { this.twitch = Math.max(0, this.twitch - dt * 7); if (this.twitch === 0) this.twitchYaw = 0; }
    if (this.flickT > 0) { this.flickT -= dt; const on = Math.random() < 0.5; if (this.inst.meshes.glow) this.inst.meshes.glow.visible = on; if (this.inst.meshes.halo) this.inst.meshes.halo.visible = on; if (this.flickT <= 0) { if (this.inst.meshes.glow) this.inst.meshes.glow.visible = true; if (this.inst.meshes.halo) this.inst.meshes.halo.visible = true; } }
    const active = state === 'play' || state === 'rest';
    switch (this.state) {
      case 'emerge':
        if (this.st > 0.9) { this.state = 'walk'; this.st = 0; if (K.heavy || Math.random() < 0.5) { this.jaw = 1; SND.roar(this.center(tmpB), K.boss ? 0.7 : K.heavy ? 0.85 : 1.15); } }
        break;
      case 'walk': {
        if (!active) break;
        const to = tmpA.subVectors(this.target, this.pos); to.y = 0; const d = to.length();
        if (d > 0.04) {
          to.normalize(); this.pos.addScaledVector(to, Math.min(d, this.speed * dt)); walking = true;
          this.yaw += wrapAng(Math.atan2(to.x, to.z) - this.yaw) * Math.min(1, dt * 5);
        } else if (state === 'play') { this.state = 'windup'; this.st = 0; SND.servo(this.center(tmpB)); SND.roar(this.center(tmpB), K.boss ? 0.65 : 1.0); }
        break;
      }
      case 'windup': {
        this.yaw += wrapAng(Math.atan2(HL.x - this.pos.x, HL.z - this.pos.z) - this.yaw) * Math.min(1, dt * 6);
        this.arm = Math.min(1, this.st / 0.6); this.jaw = 1;
        if (this.st > 0.75) { this.state = 'strike'; this.st = 0; }
        break;
      }
      case 'strike':
        this.arm = -Math.min(1, this.st / 0.15);
        if (this.st > 0.18) {
          this.state = 'knock'; this.st = 0; hurtPlayer(this);
          const back = tmpA.subVectors(this.pos, HL); back.y = 0; back.normalize();
          this.knockFrom.copy(this.pos); this.knockTo.copy(this.pos).addScaledVector(back, 1.8);
          fx.electric(this.center(tmpB), 18); SND.metalHit(this.center(tmpB), true);
        }
        break;
      case 'knock': {
        const k = smooth(Math.min(1, this.st / 0.7)); this.pos.lerpVectors(this.knockFrom, this.knockTo, k); this.arm = lerp(-1, 0, k); this.hitT = Math.max(this.hitT, (1 - k) * 0.6);
        if (this.st > 0.9) { this.state = 'walk'; this.st = 0; }
        break;
      }
    }
    if (this.state !== 'windup' && this.state !== 'strike' && this.state !== 'knock') this.arm *= Math.max(0, 1 - dt * 5);
    this.jaw = Math.max(0, this.jaw - dt * 0.9);
    // separación entre robots
    for (const o of enemies) if (o !== this && o.alive && o.type === 'robot') { const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, dd = dx * dx + dz * dz, min = this.radius + o.radius; if (dd < min * min && dd > 1e-5) { const k = (min - Math.sqrt(dd)) * 0.5 / Math.sqrt(dd); this.pos.x += dx * k; this.pos.z += dz * k * 0.3; } }
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
    this.animate(dt, t, walking);
    if (this.rig.kind !== 'ripper') { this.smokeT -= dt; if (this.smokeT <= 0) { this.smokeT = 0.3; for (const s of [-1, 1]) fx.smoke(this.B.chest.localToWorld(tmpB.set(s * 0.15, 0.8, -0.26)), 0.12 * K.scale, 0.7, 1.6, 0.12); } }
    if (this.bar.g.visible) this.bar.g.lookAt(head.p);
  }
  onHit(dmg, perfect, point) {
    this.hp -= dmg; this.hitT = 0.3; this.flickT = 0.25; setHpBar(this.bar, this.hp / this.maxHp);
    fx.sparks(point, 12, [1, 0.55, 0.15], 3, 0.05); fx.glow(point, [1, 0.6, 0.3], 0.5, 0.1); SND.metalHit(point, this.K.heavy);
    if (this.hp <= 0) this.kill();
  }
  kill() {
    this.alive = false; const c = this.center(new V3()), big = !!this.K.boss;
    fx.explosion(c, big ? 1.8 : 1.0, big); SND.explosion(c, big);
    rigDebris(this.inst, c, big ? 5 : 3.6, 0.35, { main: M.steel, paint: M.paint });
    this.dispose();
  }
  dispose() { arena.remove(this.root); this.inst.skel.dispose(); }
}

/* =================== ARAÑAS (flexiones) =================== */
const SPIDER_KIND = { scout: { s: 1.0 }, heavy: { s: 1.4 }, titan: { s: 2.4, boss: true } };
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
    this.target = settings.exercise === 'plank1' ? new V3(Math.sign(hatch.x) * rand(0.3, 0.4), 0, rand(-0.3, 0)) : new V3((hatch.x < 0 ? -1 : 1) * rand(0.06, 0.22), 0, -(0.4 + 0.04 * this.s)); // en la plancha atacan por el costado
    this.avg = Math.max(0.01, this.pos.distanceTo(this.target) / settings.walkTime);
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
  hornet: { rig: 'hornet', speed: 1.45, erratic: 1.6, scale: 2.6 },
  bomber: { rig: 'bomber', speed: 0.75, erratic: 0.6, scale: 1.25, kamikaze: true },
  carrier: { rig: 'carrier', speed: 0.5, erratic: 0.35, scale: 2.1, kamikaze: true, boss: true }
};
const MAT_DRONE = { main: M.carbonSkin, glow: M.glowSkin, halo: M.haloSkin, rotor: M.rotorSkin };
const MAT_WASP = { main: M.waspSkin, gloss: M.glossSkin, wing: M.wingSkin };
class Flyer {
  constructor(spec) {
    const K = FLYER_KIND[spec.kind], push = isFloor(); this.K = K; this.type = 'flyer'; this.kind = spec.kind;
    this.inst = RIGS[K.rig].instance(spec.kind === 'hornet' ? MAT_WASP : MAT_DRONE); this.root = this.inst.root; this.B = this.inst.bones;
    this.scale = K.scale * (push ? 0.42 : 1); this.root.scale.setScalar(this.scale); arena.add(this.root);
    let start;
    if (push) { const h = pick(hatches); h.openT = 1.6; start = new V3(h.x, 0.05, h.z); }
    const sp = settings.flySpeed / 3.6 * (push ? 0.15 : 1);
    if (!push) { const g = pick(gates), r = g.g.rotation.y; g.openT = Math.min(10, 1.2 + 1.2 / Math.max(0.05, sp * K.speed)); start = new V3(g.x - 0.6 * Math.sin(r), 1.5 * g.scale, g.z - 0.6 * Math.cos(r)); }
    Object.assign(this, { base: start.clone(), pos: start.clone(), last: start.clone(), dart: new V3(), dartT: new V3(0, push ? 0.25 : rand(1.8, 3.6), 0), nextDart: 1.2, speed: sp * K.speed * rand(0.85, 1.15), erratic: K.erratic * settings.erratic / 100, w1: rand(0.6, 1.6), w2: rand(0.8, 1.8), ph1: rand(0, TAU), ph2: rand(0, TAU), t: 0, retreat: 0, hp: spec.hp, maxHp: spec.hp, pending: 0, alive: true, radius: 0.24 * this.scale * (spec.kind === 'hornet' ? 0.45 : 1), bank: 0, flickT: 0 });
    this.bar = makeHpBar(this.root, spec.kind === 'hornet' ? 0.06 : 0.17, spec.kind === 'hornet' ? 0.1 : 0.3); if (K.boss) setHpBar(this.bar, 1);
    this.buzz = buzzLoop(spec.kind, arena.localToWorld(start.clone()));
    this.root.position.copy(start);
  }
  center(out) { this.root.getWorldPosition(out); return out; }
  update(dt, t) {
    this.t += dt; const push = isFloor(), active = state === 'play' || state === 'rest';
    if (active) {
      const tgt = tmpA.set(0, Math.max(push ? 0.2 : 1.0, HL.y - (push ? 0.05 : 0.12)), 0);
      tgt.x = HL.x * 0.6; tgt.z = HL.z * 0.6;
      const to = tmpB.subVectors(tgt, this.base), d = to.length(), reach = push ? 0.32 : 0.85;
      if (this.retreat > 0) { this.retreat -= dt; this.base.addScaledVector(to.normalize(), -this.speed * 1.6 * dt); }
      else if (d > reach) this.base.addScaledVector(to.normalize(), Math.min(d, this.speed * dt));
      else if (state === 'play') {
        if (this.K.kamikaze) { hurtPlayer(this); const c = this.center(new V3()); fx.explosion(c, 0.45 * (push ? 0.5 : 1), false); SND.explosion(c, false); spawnQueue.push({ kind: this.kind, hp: this.hp }); this.alive = false; this.dispose(); return; }
        hurtPlayer(this); this.retreat = 2.5; SND.hiss(this.center(tmpC), 0.6);
      }
      if (this.t > this.nextDart) {
        const A = clamp(d * (push ? 0.25 : 0.2), push ? 0.06 : 0.4, push ? 0.35 : 2.4) * this.erratic;
        this.dartT.set(rand(-1, 1) * A, rand(-0.4, 0.6) * A * 0.7, rand(-0.5, 0.5) * A * 0.4);
        this.nextDart = this.t + rand(0.8, 3.0) / Math.sqrt(Math.max(0.2, this.erratic));
      }
    }
    this.dart.lerp(this.dartT, 1 - Math.exp(-dt * 2.2 * Math.max(0.3, this.erratic)));
    const dir = tmpB.set(-this.base.x, 0, -this.base.z); if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1); dir.normalize();
    const right = tmpC.set(dir.z, 0, -dir.x), wob = (push ? 0.04 : 0.25) * this.erratic;
    this.last.copy(this.pos);
    this.pos.copy(this.base).addScaledVector(right, this.dart.x + Math.sin(this.t * this.w1 + this.ph1) * wob).addScaledVector(dir, this.dart.z);
    this.pos.y += this.dart.y + Math.sin(this.t * this.w2 * 1.7 + this.ph2) * wob * 0.6;
    this.pos.y = Math.max(push ? 0.06 : 0.45, this.pos.y);
    this.root.position.copy(this.pos);
    const look = arena.worldToLocal(tmpA.copy(head.p)); this.root.lookAt(arena.localToWorld(tmpA.set(look.x, this.pos.y + (look.y - this.pos.y) * 0.3, look.z)));
    const lat = ((this.pos.x - this.last.x) * right.x + (this.pos.z - this.last.z) * right.z) / Math.max(dt, 1e-3);
    this.bank += (clamp(-lat * 0.25, -0.7, 0.7) - this.bank) * Math.min(1, dt * 5);
    const B = this.B; B.body.rotation.z = this.bank; B.body.position.y = Math.sin(this.t * 3) * 0.01;
    if (this.kind === 'hornet') {
      const f = Math.sin(this.t * 2 * Math.PI * 22) * 0.9, f2 = Math.sin(this.t * 2 * Math.PI * 22 + 0.6) * 0.8;
      B.wL1.rotation.z = f; B.wR1.rotation.z = -f; B.wL2.rotation.z = f2; B.wR2.rotation.z = -f2;
      B.abd.rotation.x = 0.25 + Math.sin(this.t * 4) * 0.12 + (this.retreat > 2 ? 0.6 : 0); B.head.rotation.y = Math.sin(this.t * 1.3) * 0.25;
      B.mandL.rotation.y = Math.sin(this.t * 14) * 0.3; B.mandR.rotation.y = -Math.sin(this.t * 14) * 0.3;
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
    this.alive = false; const c = this.center(new V3()), big = !!this.K.boss, s = isFloor() ? 0.45 : 1;
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
class Arc {
  constructor(drop, offset = 0, second = false) {
    const H = arMode ? 2.25 : 2.55;
    this.drop = drop; this.barY = Math.max(0.4, calibRef + HEAD_TOP - drop);
    this.o = makeArcObj(this.barY, H); this.z = -arenaDepth() + 0.9 - offset; this.o.grp.position.set(0, 0, this.z); arena.add(this.o.grp);
    Object.assign(this, { speed: settings.arcSpeed / 3.6, judged: false, hit: false, checked: false, minClear: 1, second, alive: true, t: 0, zapT: 0, warnT: 0 });
    this.hum = humLoop(arena.localToWorld(new V3(0, this.barY, this.z)));
    if (!second) gates[1].openT = 1.6;
    zapLines(this.o.lines);
  }
  update(dt, t) {
    this.t += dt; this.z += this.speed * dt; this.o.grp.position.z = this.z;
    const appear = Math.min(1, this.t / 0.4); this.o.grp.scale.set(appear, 1, 1);
    this.zapT -= dt; if (this.zapT <= 0) { this.zapT = 0.045; zapLines(this.o.lines); }
    const hz = HL.z, inLane = Math.abs(HL.x) < 1.0, danger = !this.judged && this.z < hz && this.z > hz - 2.4 && HL.y + HEAD_TOP > this.barY - 0.02;
    const flick = 0.75 + Math.random() * 0.25;
    this.o.glowMat.opacity = (danger ? 1 : 0.7) * flick; this.o.curtainMat.opacity = danger ? 0.32 + 0.15 * Math.sin(t * 30) : 0.18;
    this.o.coreMat.color.setHex(danger ? 0xffffff : 0xffb0a0);
    if (danger && inLane) { this.warnT -= dt; if (this.warnT <= 0) { const d = hz - this.z; this.warnT = clamp(d * 0.18, 0.08, 0.4); SND.beep(1 + (2.4 - d) * 0.25); } }
    if (this.hum) this.hum.set(arena.localToWorld(tmpA.set(clamp(HL.x, -0.95, 0.95), this.barY, this.z)));
    if (!this.judged && Math.abs(this.z - hz) < 0.15 && inLane) { this.checked = true; const top = HL.y + HEAD_TOP; if (top > this.barY) this.hit = true; this.minClear = Math.min(this.minClear, this.barY - top); }
    if (!this.judged && this.z > hz + 0.15) { this.judged = true; this.resolve(); }
    if (this.z > hz + 3.5) { this.dispose(); this.alive = false; }
  }
  resolve() {
    if (!(state === 'play' || state === 'rest')) return;
    const hp = arena.localToWorld(tmpA.set(HL.x, this.barY, HL.z - 0.1));
    if (!this.checked) { say('Quédate en el carril', '#ff8a3d', 1.2); return; }
    if (this.hit) { fx.electric(hp, 24); SND.zap(hp); hurtPlayer(this); say('¡Agáchate más!', '#ff3b5c', 1.3); return; }
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
const orbGeo = new THREE.SphereGeometry(0.05, 14, 10), boltGeo = new THREE.BoxGeometry(0.014, 0.014, 0.46);
const orbMat = new THREE.MeshBasicMaterial({ color: 0xfff4d0, toneMapped: false });
const boltMat = new THREE.MeshBasicMaterial({ color: 0xa8fcff, toneMapped: false }), boltPerfMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, toneMapped: false });
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
    if (!e.alive || e.type !== 'flyer') continue;
    const v = e.center(tmpA).sub(o), dist = v.length(); if (dist < 0.05) continue;
    const sc = v.angleTo(d) - Math.atan(e.radius * 1.3 / dist);
    if (sc < cone && sc < bs) { bs = sc; best = e; }
  }
  return best;
}
function fireOrb(origin, dmg, perfect, pow = 1, side) {
  const e = pickNearest(side);
  const m = new THREE.Mesh(orbGeo, orbMat); m.add(glowSprite(pow > 1 ? POW_COL[pow - 1] : perfect ? 0x3cf0c6 : 0xff8a2a, (perfect ? 0.55 : 0.4) * (1 + (pow - 1) * 0.45)));
  m.scale.setScalar(1 + (pow - 1) * 0.4); m.position.copy(origin); scene.add(m);
  const to = e ? e.center(new V3()) : side ? arena.localToWorld(new V3(side === 'left' ? -3 : 3, 0.2, 0)) : origin.clone().addScaledVector(fwdH(), 5);
  if (e) e.pending += dmg;
  const dist = origin.distanceTo(to);
  const pc = new THREE.Color(POW_COL[pow - 1]), col = pow > 1 ? [pc.r, pc.g, pc.b] : perfect ? [0.25, 1, 0.8] : [1, 0.5, 0.15];
  projs.push({ m, from: origin.clone(), to, e, dmg, perfect, pow, t: 0, dur: 0.22 + dist * 0.035, arc: Math.min(0.7, dist * 0.07), kind: 'orb', col });
  SND.plasma(origin); if (pow > 1) SND.power(pow, origin); fx.muzzle(origin, col);
}
function fireBolt(origin, dir, lockFrom, dmg, perfect) {
  const e = findLock(lockFrom || origin, dir);
  const m = new THREE.Mesh(boltGeo, perfect ? boltPerfMat : boltMat); m.add(glowSprite(perfect ? 0xffd166 : 0x5ff5ff, 0.2, 0.8));
  m.position.copy(origin); scene.add(m);
  const to = e ? e.center(new V3()) : origin.clone().addScaledVector(dir, 30);
  if (e) e.pending += dmg; stats.shots++;
  projs.push({ m, from: origin.clone(), to, e, dmg, perfect, t: 0, dur: Math.max(0.08, origin.distanceTo(to) / 34), arc: 0, kind: 'bolt', col: perfect ? [1, 0.85, 0.4] : [0.4, 1, 1] });
  SND.laser(origin); fx.muzzle(origin, perfect ? [1, 0.85, 0.4] : [0.4, 1, 1]);
}
function updateProjectiles(dt) {
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i]; p.t += dt;
    if (p.e && p.e.alive) p.e.center(p.to);
    const k = Math.min(1, p.t / p.dur);
    tmpA.copy(p.m.position);
    p.m.position.lerpVectors(p.from, p.to, k); p.m.position.y += Math.sin(k * Math.PI) * p.arc;
    if (p.kind === 'bolt') p.m.lookAt(tmpB.copy(p.m.position).multiplyScalar(2).sub(tmpA));
    fx.trail(p.m.position, p.col, p.kind === 'orb' ? 0.12 * (1 + ((p.pow || 1) - 1) * 0.5) : 0.06, 0.2);
    if (k >= 1) {
      scene.remove(p.m); p.m.children.forEach(c => c.material && c.material.dispose()); projs.splice(i, 1);
      if (p.e && p.e.alive) {
        p.e.pending = Math.max(0, p.e.pending - p.dmg);
        if (p.kind === 'bolt') stats.hits++;
        const target = p.e; target.onHit(p.dmg, p.perfect, p.to.clone()); if (!target.alive) onKilled(target);
        if (p.kind === 'orb' && p.pow >= 3) { // disparo muy cargado: estalla y alcanza a los de alrededor
          const R = isFloor() ? 0.32 : 1.4; fx.electric(p.to, 22); fx.glow(p.to, p.col, isFloor() ? 0.35 : 1, 0.15); SND.zap(p.to);
          for (const o of enemies) if (o.alive && o !== target && o.center(tmpA).distanceTo(p.to) < R) { o.onHit(p.pow - 2, false, tmpA.clone()); if (!o.alive) onKilled(o); }
        }
        if (p.kind === 'bolt' && p.perfect) {
          const R = isFloor() ? 0.45 : 1.6; fx.electric(p.to, 16);
          for (const o of enemies) if (o.alive && o !== target && o.type === 'flyer' && o.center(tmpA).distanceTo(p.to) < R) { o.onHit(1, true, tmpA.clone()); if (!o.alive) onKilled(o); }
        }
      } else if (p.e) { p.e.pending = Math.max(0, p.e.pending - p.dmg); fx.sparks(p.to, 5, [1, 0.8, 0.4], 1.5, 0.03); }
      else { fx.sparks(p.to, 4, [0.6, 1, 1], 1, 0.03); if (p.kind === 'bolt') { combo = 0; SND.miss(); say('Fallo', '#a49fc8', 0.6, false); } }
    }
  }
}
function onKilled(e) {
  stats.kills++;
  const pts = { titan: 1500, carrier: 1500, bigbubble: 1000, heavy: 500, bomber: 400, hornet: 350, scout: 300, drone: 250, bubble: 200 }[e.kind] || 300;
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
  if (settings.mode === 'walkers') {
    const origin = side && hands[side].ok ? hands[side].wrist.clone() : chargeOrb.position.clone();
    if (side) gloves[side].pulse = 1;
    fireOrb(origin, dmg, opts.perfect, pow, settings.exercise === 'plank1' ? side : undefined);
  } else {
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
  charged = true; chargePow = 1; chargeOrb.material.color.setHex(POW_COL[0]); chargeOrb.visible = settings.mode === 'walkers'; SND.charge(); boardDirty = true;
}
const DET = {
  sq: { state: 'up', ref: 0, min: 0, t0: 0, charged: false, stillT: 0 },
  pu: { state: 'up', ref: 0, min: 0, t0: 0, charged: false, stillT: 0, awayT: 0 },
  curl: { left: { state: 'down', bottom: -0.78, max: 0, t0: 0, lost: 0 }, right: { state: 'down', bottom: -0.78, max: 0, t0: 0, lost: 0 } },
  pl: { ref: 0.5, awayT: 0, left: { state: 'down', floor: 0.1, t0: 0, lost: 0, fired: false, dev: 0 }, right: { state: 'down', floor: 0.1, t0: 0, lost: 0, fired: false, dev: 0 } }
};
function vertDetector(d, y, t, dt, cfg) {
  const still = head.speed < 0.06;
  if (d.state === 'up') {
    // la referencia de arriba sube enseguida y baja despacio: se ajusta a tu postura real
    // (calibrar a cuatro patas, o mirar al suelo en la flexión, deja la cabeza más baja que al calibrar)
    d.ref += (y - d.ref) * Math.min(1, dt * (y > d.ref ? 1.5 : 0.25));
    if (y < d.ref - cfg.start) { d.state = 'down'; d.min = y; d.t0 = t; d.charged = false; d.stillT = 0; d.holdT = 0; d.pow = 1; }
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
      if (d.charged) onRep({ perfect: dur >= cfg.perfectDur && dur < 12 && drop >= cfg.req + 0.03, fast: cfg.perfectDur > 0 && dur < cfg.perfectDur * 0.5, pow: cfg.power ? d.pow : 1 });
      else if (drop > cfg.partial) onPartial(cfg.partialMsg);
      if (stuck) d.ref = y;
      d.state = 'up';
    } else if (!d.charged && d.stillT > 3) { d.ref = y + cfg.back * 0.5; d.state = 'up'; d.stillT = 0; }
  }
}
function runDetectors(t, dt) {
  if (isBars()) { barDetect(t, dt); return; }
  if (settings.mode === 'arcs') return;
  const pt = settings.perfectTime;
  if (settings.exercise === 'squat') {
    const req = settings.squatDepth / 100;
    vertDetector(DET.sq, head.p.y, t, dt, { start: Math.min(0.08, req * 0.5), req, back: 0.05, partial: req * 0.4, perfectDur: pt, partialMsg: '¡Baja más!' });
  } else if (settings.exercise === 'plank1') {
    // plancha con un brazo: la cabeza se mantiene a su altura de plancha; levantar un brazo dispara a su lado
    const P = DET.pl, y = head.p.y, LIFT = 0.18;
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
  } else if (settings.exercise === 'pushup') {
    const d = DET.pu, req = settings.pushDepth / 100;
    if (head.p.y > d.ref + 0.35) { d.awayT += dt; if (d.awayT > 1.5 && state === 'play' && msg.t <= 0) say('Vuelve a la plancha', '#ff8a3d', 1.2); d.state = 'up'; return; }
    d.awayT = 0;
    vertDetector(d, head.p.y, t, dt, { start: Math.min(0.05, req * 0.5), req, back: 0.035, partial: req * 0.5, perfectDur: pt, partialMsg: '¡Más abajo!', power: true });
  } else {
    const range = settings.curlRange / 100;
    for (const side of ['left', 'right']) {
      const h = hands[side], d = DET.curl[side];
      if (!h.ok) { d.lost += dt; if (d.lost > 0.5) d.state = 'down'; continue; }
      d.lost = 0;
      const r = h.wrist.y - head.p.y;
      d.bottom += (r - d.bottom) * (r < d.bottom ? 0.5 : 0.0012);
      if (d.state === 'down') { if (r > d.bottom + Math.min(0.12, range * 0.45)) { d.state = 'rising'; d.max = r; d.t0 = t; } }
      else if (d.state === 'rising') {
        d.max = Math.max(d.max, r);
        if (r - d.bottom >= range) { const dur = t - d.t0; d.state = 'top'; onRep({ perfect: dur >= pt * 0.5 && dur < 5 && r - d.bottom >= range + 0.03, fast: pt > 0 && dur < pt * 0.25 }, side); }
        else if (r < d.bottom + 0.07) { if (d.max - d.bottom > range * 0.55) onPartial('Sube hasta el hombro'); d.state = 'down'; }
      } else if (d.state === 'top') { if (r < d.bottom + 0.08) d.state = 'down'; }
    }
  }
}

/* =================== APUNTADO (Enjambre) =================== */
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
  if (settings.mode !== 'flyers') return out;
  if (settings.exercise === 'squat' && settings.aim === 'hands') for (const s of ['left', 'right']) if (hands[s].rayOk) out.push({ key: s, o: hands[s].rayO, d: hands[s].rayD });
  if (!out.length) out.push({ key: 'gaze', o: head.p, d: fwd() });
  return out;
}
function updateAim(t) {
  const show = settings.mode === 'flyers' && ['ready', 'play', 'rest'].includes(state);
  const srcs = show ? aimSources() : [], used = new Set(srcs.map(s => s.key));
  lasers.left.visible = lasers.right.visible = false;
  for (const k of ['left', 'right', 'gaze']) if (!used.has(k)) locks[k].visible = false;
  gazeDot.visible = false;
  for (const s of srcs) {
    const e = findLock(s.o, s.d), ring = locks[s.key];
    if (s.key !== 'gaze') {
      const l = lasers[s.key]; l.visible = true; l.position.copy(s.o); l.quaternion.copy(hands[s.key].rayQ);
      l.scale.z = e ? e.center(tmpA).distanceTo(s.o) : 6; l.material.opacity = charged ? 0.6 : 0.3; l.material.color.setHex(charged ? 0x3cf0c6 : 0x5ff5ff);
    } else { gazeDot.visible = true; gazeDot.position.copy(head.p).addScaledVector(s.d, 3); }
    if (e) { ring.visible = true; e.center(ring.position); const sc = e.radius * 3.2; ring.scale.set(sc, sc, 1); ring.material.color.setHex(charged ? 0x3cf0c6 : 0xffffff); ring.material.rotation = t * 1.5; }
    else ring.visible = false;
  }
}

/* =================== OLEADAS =================== */
function isBossWave(i) { return settings.waves ? i === settings.waves - 1 : (i + 1) % 5 === 0; }
function buildWave(i) {
  if (isBars()) return buildBarWave(i);
  let total = waveReps(i);
  const mode = settings.mode, list = [];
  if (mode === 'arcs') {
    const lo = Math.min(settings.arcMin, settings.arcMax) / 100, hi = Math.max(settings.arcMin, settings.arcMax) / 100;
    for (let n = 0; n < total; n++) list.push({ kind: Math.random() * 100 < settings.arcDouble ? 'double' : 'single', drop: rand(lo, hi), hp: 1 });
    return list;
  }
  if (mode === 'flyers' && settings.exercise === 'squat' && settings.aim === 'hands') total *= 2;
  let boss = null;
  if (isBossWave(i)) { const b = Math.max(4, Math.round(total * 0.3)); boss = { kind: mode === 'walkers' ? 'titan' : 'carrier', hp: b }; total -= b; }
  let k = 0;
  while (total > 0) {
    let kind, hp;
    if (mode === 'walkers') { kind = k % 3 === 2 ? 'heavy' : 'scout'; hp = kind === 'heavy' ? 3 + Math.floor(i / 3) : 2 + Math.floor(i / 4); }
    else { kind = (i >= 1 && k % 4 === 3) ? 'hornet' : (i >= 2 && k % 5 === 4) ? 'bomber' : 'drone'; hp = kind === 'bomber' ? 2 : 1; }
    hp = Math.min(hp, total); list.push({ kind, hp }); total -= hp; k++;
  }
  if (boss) list.push(boss);
  return list;
}
function spawnFromQueue() {
  const spec = spawnQueue.shift(); if (!spec) return;
  if (settings.mode === 'arcs') {
    const a = new Arc(spec.drop, 0, false); arcs.push(a);
    if (spec.kind === 'double') arcs.push(new Arc(spec.drop, 1.0, true));
    return;
  }
  let e;
  if (isBars()) e = new HeadTarget(spec);
  else if (settings.mode === 'walkers') e = isFloor() ? new Spider(spec, settings.exercise === 'plank1' ? pick(hatches.filter(h => (h.x < 0) === (stats.spawned++ % 2 === 0))) : pick(hatches)) : new Robot(spec, spec.kind === 'titan' ? gates[1] : pick(gates));
  else e = new Flyer(spec);
  enemies.push(e);
}
function updateNextArc() {
  let best = null; for (const a of arcs) if (!a.judged && !a.second && (!best || a.z > best.z)) best = a;
  const d = best ? best.drop : (spawnQueue[0] && spawnQueue[0].drop) || 0;
  if (Math.abs(d - nextArcDrop) > 0.005) { nextArcDrop = d; boardDirty = true; }
}

/* =================== FLUJO =================== */
function resetWorld() {
  enemies.forEach(e => { if (e.alive || e.mode === 'dying') e.dispose(); }); enemies = [];
  arcs.forEach(a => a.alive && a.dispose()); arcs = [];
  projs.forEach(p => scene.remove(p.m)); projs = [];
  clearFX(); spawnQueue = []; chargeOrb.visible = false; charged = false; chargePow = 1; nextArcDrop = 0;
  if (SPLEGS.fem) { SPLEGS.fem.count = 0; SPLEGS.tib.count = 0; }
  gates.forEach(g => g.openT = 0); hatches.forEach(h => h.openT = 0);
  AUD.loops.forEach(l => l.stop());
}
function speedKey() { return isBars() ? (settings.exercise === 'hang' ? 'hangTime' : 'barArrive') : { walkers: 'walkTime', flyers: 'flySpeed', arcs: 'arcSpeed' }[settings.mode]; }
function summaryText() {
  const n = settings.waves ? `${settings.waves} oleadas` : 'oleadas sin fin';
  const first = settings.exercise === 'hang' ? `${hangSecs(0)} s colgado la primera (+${settings.hangInc})` : `${waveReps(0)} reps la primera (+${settings.repsInc})`;
  return `${n} · ${first} · vidas ${settings.lives || '∞'} · descanso ${settings.rest} s`;
}
function lobbyMenu(reanchor) {
  state = 'lobby'; resetWorld(); center.mesh.visible = false; boardDirty = true; if (preview) previewBarPose(false);
  const bars = isBars(), hang = settings.exercise === 'hang', k = eqKind(), placed = eqPose(k).set;
  const n = eqName(k), start = () => { if (bars && !placed) startPlace(lobbyMenu, `Antes de empezar, coloca ${n.the}`); else beginRun(); };
  const rows = [
    { t: 'title', text: 'REPARENA' },
    { t: 'text', text: summaryText() },
    { t: 'btns', items: [{ label: 'EMPEZAR', style: 'primary', onPress: start }], h: 0.08 },
    { t: 'choice', label: 'Modo', value: settings.mode, opts: [['walkers', 'Asalto'], ['flyers', 'Enjambre'], ['arcs', 'Arcos'], ['bars', 'Barras']], onPick: v => { setSetting('mode', v); lobbyMenu(); } },
    { t: 'choice', label: 'Ejercicio', value: settings.exercise, opts: bars ? [['row', 'Remo invertido'], ['pullup', 'Dominadas'], ['hang', 'Colgado']] : [['squat', 'Sentadillas'], ['pushup', 'Flexiones', settings.mode === 'arcs'], ['curl', 'Curl', settings.mode === 'arcs'], ['plank1', 'Plancha 1 brazo', settings.mode !== 'walkers']], onPick: v => { setSetting('exercise', v); lobbyMenu(); } },
    { t: 'field', key: speedKey() },
    settings.mode === 'arcs' ? { t: 'field', key: 'arcMax' } : bars && hang ? { t: 'field', key: 'hangInc' } : { t: 'field', key: 'repsWave' }
  ];
  if (bars && !hang) rows.push({ t: 'field', key: 'barTarget' });
  if (bars) rows.push({ t: 'btns', items: [{ label: `Colocar ${n.name}`, style: placed ? 'normal' : 'primary', onPress: () => startPlace(lobbyMenu) }, ...(placed ? [{ label: 'Ajustar', onPress: () => { PLACE.note = ''; adjustMenu(lobbyMenu); } }] : [])] });
  rows.push(...musicRows());
  rows.push({ t: 'btns', items: [{ label: 'Más ajustes', onPress: () => settingsMenu(lobbyMenu) }, { label: 'Salir del juego', style: 'danger', onPress: exitAll }] });
  const hint = !bars ? 'En partida: mira tu muñeca izquierda para abrir el menú' : !placed ? `Primero coloca ${n.the}: pulsa Colocar` : `Comprueba que ${n.the} ${n.pl ? 'virtuales coinciden' : 'virtual coincide'} con la real; si no, pulsa Colocar`;
  rows.push({ t: 'text', text: hint, color: bars && !placed ? '#ffd166' : '#a49fc8' });
  const m = openMenu(rows, { reanchor });
  m.rebuild = () => lobbyMenu();
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
  pauseMenu(true);
}
function resumeGame() {
  hideMenu(); state = pausedFrom; center.mesh.visible = ['calib', 'ready', 'mount'].includes(state); boardDirty = true;
  AUD.loops.forEach(l => { if (l.out && !l.dead) l.out.gain.setTargetAtTime(0.2, AUD.C.currentTime, 0.1); });
}
function pauseMenu(reanchor) {
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
    ...musicRows(),
    { t: 'btns', items: [{ label: bars ? 'Volver a colgarme' : 'Recalibrar', onPress: recal }, ...(bars ? [{ label: `Ajustar ${eqName().name}`, onPress: () => { PLACE.note = ''; adjustMenu(() => pauseMenu()); } }] : []), { label: 'Ajustes', onPress: () => settingsMenu(() => pauseMenu()) }] },
    { t: 'btns', items: [{ label: 'Terminar ronda', onPress: () => { hideMenu(); endRun(false, true); } }, { label: 'Menú principal', onPress: () => { saveRun(false); lobbyMenu(true); } }, { label: 'Salir del juego', style: 'danger', onPress: () => { saveRun(false); exitAll(); } }] }
  ], { reanchor, border: '#ffd166' });
  m.rebuild = () => pauseMenu();
}
function beginRun() {
  audioInit(); resetWorld(); hideMenu(); applyEnvMode(); runSaved = false;
  waveIdx = 0; lives = settings.lives || 0; score = 0; combo = 0; calibT = 0; waveDone = 0; waveTarget = 0;
  stats = newStats();
  DET.sq.state = DET.pu.state = 'up'; DET.curl.left.state = DET.curl.right.state = 'down'; DET.pl.left.state = DET.pl.right.state = 'down';
  stateT = 0; boardDirty = true;
  if (isBars()) { if (preview) previewBarPose(true); barReset(); barToMount(0); }
  else if (preview) { arenaFromHead(); DET.sq.ref = DET.pu.ref = DET.pl.ref = head.p.y; calibRef = settings.exercise === 'pushup' ? 1.6 : head.p.y; state = 'ready'; }
  else state = 'calib';
  center.mesh.visible = true; drawCenter();
}
// Hacia dónde mira el cuerpo, también en el suelo: mirando abajo (plancha, flexiones, superman) la parte de
// arriba de la cabeza apunta hacia delante; tumbado boca arriba, hacia atrás
const _bu = new V3();
function bodyYaw() {
  const f = fwd(); if (Math.abs(f.y) < 0.7) return yawOf(head.q);
  _bu.set(0, 1, 0).applyQuaternion(head.q); if (f.y > 0) _bu.negate(); _bu.y = 0;
  return _bu.lengthSq() > 0.04 ? Math.atan2(-_bu.x, -_bu.z) : lastStandYaw;
}
function arenaFromHead() { arena.position.set(head.p.x, 0, head.p.z); arena.rotation.y = bodyYaw(); }
// Mientras calibras, el entorno y los enemigos se van colocando a tu alrededor; al calibrar se fijan
function arenaFollow(dt) {
  const k = Math.min(1, dt * 4);
  arena.position.x += (head.p.x - arena.position.x) * k; arena.position.z += (head.p.z - arena.position.z) * k;
  arena.rotation.y += wrapAng(bodyYaw() - arena.rotation.y) * k;
}
function calibrate() {
  arenaFromHead();
  const y = head.p.y; DET.sq.ref = y; DET.pu.ref = y; if (!isFloor()) { calibRef = y; lastStandY = y; }
  for (const s of ['left', 'right']) if (hands[s].ok) { DET.curl[s].bottom = hands[s].wrist.y - y; DET.pl[s].floor = hands[s].wrist.y; }
  DET.pl.ref = y;
  state = 'ready'; stateT = 0; SND.charge(); boardDirty = true;
}
function startWave(i) {
  waveIdx = i; spawnQueue = buildWave(i); waveTarget = waveReps(i); waveDone = 0;
  if (isBars()) { BAR.hold = 0; BAR.need = settings.exercise === 'hang' ? hangSecs(i) : 0; spawnInterval = 0.9; }
  else if (settings.mode === 'arcs') spawnInterval = 60 / settings.arcRate;
  else {
    const avgHp = spawnQueue.reduce((a, e) => a + e.hp, 0) / Math.max(1, spawnQueue.length);
    const auto = settings.mode === 'flyers' ? repTime() * (settings.exercise === 'squat' && settings.aim === 'hands' ? 0.55 : 0.95) : clamp(avgHp * repTime() * 0.85, 1.0, 15);
    spawnInterval = settings.spawnGap > 0 ? settings.spawnGap : auto;
  }
  spawnTimer = 0.6; state = 'play'; stateT = 0; say(`OLEADA ${i + 1}`, '#ffd166', 1.6); center.mesh.visible = false; SND.horn();
}
function hurtPlayer(src) {
  combo = 0; stats.taken++; hurtT = 0.55; SND.hurt();
  if (settings.lives) { lives--; boardDirty = true; if (lives <= 0) { endRun(false); return; } }
  if (!(src instanceof Arc) && !(src && src.silent)) say(settings.lives ? '¡Te han golpeado!' : '¡Golpe!', '#ff3b5c', 1.3);
}
function saveRun(win) {
  const reps = settings.exercise === 'hang' ? Math.round(stats.hold) : stats.reps; // en colgado se guardan segundos
  if (runSaved || !reps) return; runSaved = true;
  const h = store(HIST_KEY) || [];
  h.push({ ex: settings.exercise, mode: settings.mode, reps, perfect: stats.perfect, kills: stats.kills, win, time: Math.round(stats.time), date: Date.now() });
  store(HIST_KEY, h.slice(-400));
}
function endRun(win, manual) {
  const h = store(HIST_KEY) || [], prevBest = h.filter(r => r.ex === settings.exercise).reduce((a, r) => Math.max(a, r.reps), 0);
  saveRun(win);
  state = 'end'; center.mesh.visible = false; chargeOrb.visible = false; spawnQueue = []; boardDirty = true;
  AUD.loops.forEach(l => l.stop());
  const mm = Math.floor(stats.time / 60), ss = String(Math.round(stats.time % 60)).padStart(2, '0');
  const hang = settings.exercise === 'hang', got = hang ? Math.round(stats.hold) : stats.reps;
  const lines = [
    hang ? `Colgado ${got} s · ${stats.falls} caídas al charco · racha máx. ${stats.bestCombo} s` : `${EX_NAMES[settings.exercise]}: ${stats.reps} reps · ${stats.perfect} perfectas · ${stats.partial} a medias`,
    isBars() ? (hang ? `Oleadas superadas: ${waveIdx + (win ? 1 : 0)}` : `${stats.kills} reventados con la cabeza · ${stats.falls} caídas · combo máx. ×${stats.bestCombo}`) : settings.mode === 'flyers' ? `Precisión ${stats.shots ? Math.round(100 * stats.hits / stats.shots) : 0}% · ${stats.kills} derribados · combo ×${stats.bestCombo}` : settings.mode === 'arcs' ? `Golpes recibidos: ${stats.taken} · combo máx. ×${stats.bestCombo}` : `${stats.kills} enemigos destruidos · combo máx. ×${stats.bestCombo}`,
    `Tiempo ${mm}:${ss} · ${score} puntos`,
    got > prevBest && prevBest > 0 ? (hang ? '¡Nuevo récord de tiempo colgado!' : '¡Nuevo récord de repeticiones!') : (win ? 'Zona despejada.' : manual ? 'Ronda terminada.' : 'Descansa y vuelve a por ellos.')
  ];
  if (win) SND.victory(); else if (!manual) SND.defeat();
  endMenu(win ? '¡VICTORIA!' : manual ? 'RESUMEN' : 'DERROTA', lines);
}
function endMenu(title, lines) {
  const rows = [{ t: 'title', text: title, color: title === 'DERROTA' ? '#ff4a6a' : '#ffd166' }, ...lines.map(l => ({ t: 'text', text: l })),
    { t: 'btns', items: [{ label: 'Otra ronda', style: 'primary', onPress: () => beginRun() }, { label: 'Menú principal', onPress: () => lobbyMenu() }, { label: 'Salir del juego', style: 'danger', onPress: exitAll }] }];
  const m = openMenu(rows, { reanchor: true }); m.rebuild = () => endMenu(title, lines);
}
function exitAll() {
  hideMenu(); resetWorld(); center.mesh.visible = false; toastP.mesh.visible = false; state = 'idle';
  const s = renderer.xr.getSession(); if (s) s.end().catch(() => {});
  if (preview) stopPreview();
  ambientStop(); renderHistory(); syncForm();
}

/* =================== LÓGICA POR FOTOGRAMA =================== */
function gameStep(dt, t) {
  if (msg.t > 0) { msg.t -= dt; if (msg.t <= 0) boardDirty = true; }
  stateT += dt;
  if (GAME_STATES.includes(state) && settings.exercise !== 'curl' && !isBars() && hands.left.pinch && hands.right.pinch) { pinchT += dt; if (pinchT > 1) { pinchT = 0; openPause(); } } else pinchT = 0;
  if (state === 'calib') {
    arenaFollow(dt);
    const ok = !isFloor() ? head.p.y > 1.1 : (head.p.y < 1.0 && head.p.y > 0.15);
    if (ok && head.speed < 0.07) calibT += dt; else calibT = Math.max(0, calibT - dt * 2);
    if (calibT >= 2) calibrate();
  } else if (state === 'ready') { if (stateT >= 3) startWave(0); }
  else if (state === 'mount') barMountStep(dt);
  if (['ready', 'play', 'rest'].includes(state)) { if (state !== 'ready') stats.time += dt; runDetectors(t, dt); }
  if (state === 'play') {
    spawnTimer -= dt;
    const alive = settings.mode === 'arcs' ? 0 : enemies.filter(e => e.alive).length;
    if (spawnTimer <= 0 && spawnQueue.length && alive < (isBars() ? 2 : settings.maxAlive)) { spawnFromQueue(); spawnTimer = spawnInterval * (settings.mode === 'arcs' ? 1 : rand(0.8, 1.2)); boardDirty = true; }
    const anyLeft = settings.mode === 'arcs' ? arcs.some(a => a.alive && !a.judged) : enemies.some(e => e.alive);
    if (settings.exercise === 'hang' ? BAR.hold >= BAR.need : !spawnQueue.length && !anyLeft && !projs.length) {
      if (settings.waves && waveIdx >= settings.waves - 1) endRun(true);
      else if (settings.rest > 0) { state = 'rest'; stateT = 0; SND.victory(); say(isBars() ? '¡Oleada superada! Bájate y descansa' : '¡Oleada superada!', '#3cf0c6', 2); }
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
  if (settings.mode === 'arcs') updateNextArc();
  const f = fwdH();
  if (isFloor() && head.p.y < 1) chargeOrb.position.copy(head.p).addScaledVector(f, 0.28).add(tmpA.set(0, -0.2, 0));
  else chargeOrb.position.copy(head.p).addScaledVector(f, 0.42).add(tmpA.set(0, -0.36, 0));
  if (chargeOrb.visible) { const s = 0.15 + (chargePow - 1) * 0.07 + Math.sin(t * (10 + chargePow * 4)) * 0.03; chargeOrb.scale.set(s, s, 1); }
}
