
/* =================== ESTADO DE PARTIDA =================== */
const GAME_STATES = ['calib', 'ready', 'mount', 'play', 'rest'];
let state = 'idle', preview = false, xrActive = false;
let enemies = [], arcs = [], projs = [], spawnQueue = [], spawnTimer = 0, spawnInterval = 3, waveIdx = 0, waveTarget = 0, waveDone = 0;
let lives = 3, score = 0, combo = 0, stateT = 0, calibT = 0, pinchT = 0, pausedFrom = 'play';
const newStats = () => ({ reps: 0, perfect: 0, partial: 0, kills: 0, bestCombo: 0, time: 0, work: 0, shots: 0, hits: 0, taken: 0, falls: 0, hold: 0, spawned: 0, parries: 0, blocks: 0, dodges: 0, shields: 0, waves: 0 });
let stats = newStats();
const RAMP = { lvl: 0, t0: 0, f0: 0, note: '', up: false }; // nivel de la dificultad creciente (ver rampWaveEnd)
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
  imp: { rig: 'imp', scale: 1.0, speedF: 1.0, heavy: false, stop: 1.2, stride: 1.4, head: 1.5, beast3d: 'imp' }, // monstruos de archivo (Quaternius)
  puglin: { rig: 'puglin', scale: 1.15, speedF: 1.25, heavy: false, stop: 1.0, stride: 1.0, head: 0.95, beast3d: 'puglin' },
  impboss: { rig: 'imp', scale: 1.6, speedF: 0.75, heavy: true, stop: 1.8, stride: 1.4, head: 1.5, beast3d: 'imp', boss: true },
  impthrow: { rig: 'imp', scale: 0.95, speedF: 1.0, heavy: false, stop: 4.2, stride: 1.4, head: 1.5, beast3d: 'imp', grp: 'beast', thrower: true }, // el lanzador: un diablillo que se queda lejos y te tira piedras
  zombie: { rig: 'zombie', scale: 1.0, speedF: 0.9, heavy: false, stop: 1.05, stride: 1.0, head: 1.65, beast3d: 'zombie' }, // zombi de Quaternius
  zombieboss: { rig: 'zombie', scale: 1.6, speedF: 0.7, heavy: true, stop: 1.7, stride: 1.0, head: 1.65, beast3d: 'zombie', boss: true },
  // dinosaurios: se paran más lejos (la cabeza les queda muy por delante del cuerpo) y ocupan más sitio
  raptor: { rig: 'raptor', scale: 1.0, speedF: 1.2, heavy: false, stop: 1.45, stride: 1.0, head: 1.2, beast3d: 'raptor', r: 0.5 },
  raptorboss: { rig: 'raptor', scale: 1.7, speedF: 0.8, heavy: true, stop: 2.0, stride: 1.0, head: 1.2, beast3d: 'raptor', r: 0.8, boss: true }
};
// Los zombis nuevos y los monstruitos que andan, cada uno con su jefe (el mismo, más grande y más lento). grp: su clase en
// Ajustes → Cada enemigo
for (const [k, head, grp] of [['zgreen', 1.25, 'zombie'], ['zchubby', 1.5, 'zombie'], ...CUTE_GATE.map(c => [c, 1.0, 'cute']), ...PIRATE_GATE.map(c => [c, c === 'captain' ? 1.7 : 1.4, 'pirate'])]) {
  ROBOT_KIND[k] = { rig: k, scale: 1.0, speedF: grp === 'zombie' ? 0.9 : 1.0, heavy: false, stop: 1.1, stride: 1.0, head, beast3d: k, grp };
  ROBOT_KIND[k + 'boss'] = { ...ROBOT_KIND[k], scale: k === 'captain' ? 1.45 : 1.65, speedF: 0.72, heavy: true, stop: 1.8, boss: true }; // (el capitán ya es alto: que quepa por la compuerta)
}
// Puestos de ataque: cada robot tiene el suyo en un arco delante de ti, separado de los demás para que nunca se
// estorben. Si la primera fila está llena, esperan en una segunda (o tercera) y avanzan cuando queda un hueco.
const ROW_GAP = 1.1, SLOT_ARC = 1.3;
// Con espada hay que esperarlos a tu alcance: vienen directos (como mucho SWORD_WALK s), sin pararse a amenazar
// Partes sólidas de las compuertas, como círculos en el suelo de la arena: los pilares del marco y los bloques de los lados
function gateSolids(doors) {
  const out = [];
  for (const g of gates) {
    if (!g.on || !g.g.visible) continue; const r = g.g.rotation.y, c = Math.cos(r), s = Math.sin(r), sc = g.scale;
    const put = (lx, lz, rad) => out.push({ x: g.x + (lx * c + lz * s) * sc, z: g.z + (-lx * s + lz * c) * sc, r: rad * sc, g });
    if (doors && g.open < 0.35) for (const lx of [-0.95, -0.32, 0.32, 0.95]) put(lx, 0.1, 0.34); // las puertas cerradas, también
    for (const sd of [-1, 1]) { if (g.nat) { put(sd * 1.7, 0, 0.55); continue; } put(sd * 1.5, 0, 0.5); if (g.side.visible) put(sd * 2.2, -0.3, 1.05); } // (en el bosque, los pilares de piedra)
  }
  return out;
}
// Todo lo sólido del suelo (se calcula una vez por fotograma): las compuertas (pilares, bloques y, cerradas, sus puertas)
// y, en el bosque, los troncos, las rocas y los arbustos. Cada uno sabe de qué compuerta es: dentro de su túnel, el que
// sale no choca con los de la suya
const SOLIDS = { list: [], t: -1 };
function envSolids() { return gateSolids(true).concat(natureOn() ? NAT.solids : [], islandOn() ? ISL.solids : []); }
const solidsNow = () => { if (SOLIDS.t !== GAMEF.n) { SOLIDS.t = GAMEF.n; SOLIDS.list = envSolids(); } return SOLIDS.list; };
const GAMEF = { n: 0 };
// Nadie se mete en algo sólido: si un empujón (de otro, de un disparo, del golpe) lo mete, sale por el lado más corto
function solidPush(e) {
  for (const c of solidsNow()) {
    if (!e.out && c.g === e.gate) continue;
    const dx = e.pos.x - c.x, dz = e.pos.z - c.z, d = Math.hypot(dx, dz), min = c.r + e.radius;
    if (d >= min) continue; if (d < 1e-4) { e.pos.x += min; continue; }
    e.pos.x = c.x + dx / d * min; e.pos.z = c.z + dz / d * min;
  }
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
const robotStop = K => K.thrower ? K.stop : swordSet() ? (K.boss ? 1.45 : K.heavy ? 1.05 : 0.95) : K.stop; // (el lanzador, siempre lejos)
// Empujones: lo que se frena cada segundo (al recibir, sale despedido y en unas décimas se para) y cuánto, según
// «Retroceso al recibir impactos»
const SHOVE_K = 7, knockK = () => (settings.knockback >= 0 ? settings.knockback : 100) / 100;
function robotSlot(r) {
  const others = enemies.filter(o => o !== r && o.alive && o.type === 'robot' && o.slotOk);
  const want = Math.atan2(r.pos.x, -r.pos.z); // hacia dónde le pilla de camino
  let best = null, bestC = Infinity;
  // en tu habitación, ni en un mueble ni detrás de una pared; con la habitación llena, antes cerca del puesto de otro (ya se
  // apartan al andar) que en un mueble; si ni así queda ninguno (escaneo raro), sin mirarla
  for (const [room, apart] of [[true, true], ...(roomPlan() ? [[true, false]] : []), [false, true]]) for (let row = 0; row < 3 && !best; row++) {
    const R = robotStop(r.K) + row * ROW_GAP;
    for (let a = -SLOT_ARC; a <= SLOT_ARC + 1e-6; a += 0.1) {
      _rs.set(Math.sin(a) * R, 0, -Math.cos(a) * R);
      if (apart && others.some(o => o.slot.distanceTo(_rs) < r.radius + o.radius + 0.65)) continue; // también entre filas: al retroceder tras golpear no choca con los de atrás
      if (room && roomBlocked(_rs.x, _rs.z, r.radius)) continue;
      const c = Math.abs(a - want) + Math.abs(a) * 0.3 + Math.random() * 0.12;
      if (c < bestC) { bestC = c; best = { a, row, p: _rs.clone() }; }
    }
  }
  if (!best) best = { a: want, row: 3, p: new V3(Math.sin(want), 0, -Math.cos(want)).multiplyScalar(robotStop(r.K) + 3 * ROW_GAP) };
  r.slot.copy(best.p); r.row = best.row; r.slotOk = true;
}
const _rs = new V3(), _rd = new V3(), _rv = new V3(), _rp = new V3();
// Los que tienen piernas solo se desplazan andando: por debajo de esta velocidad (m/s) se quedan quietos, y por encima
// mueven las piernas (también al retroceder, de espaldas)
const V_STEP = 0.1;
const movingOn = e => (e.state === 'walk' && e.vel.lengthSq() > V_STEP * V_STEP) || e.dodge > 0 || e.backing || e.state === 'down';
class Robot {
  constructor(spec, gate) {
    const K = ROBOT_KIND[spec.kind]; this.K = K; this.type = 'robot'; this.kind = spec.kind;
    this.rig = RIGS[K.rig]; this.inst = this.rig.instance(MAT_ROBOT); this.root = this.inst.root; this.B = this.inst.bones;
    // cabe por el hueco de su compuerta (en realidad mixta, con el techo de tu habitación, las compuertas son más bajas)
    this.sc = K.scale * Math.min(1, 3.0 * gate.scale / (1.95 * K.scale)); this.root.scale.setScalar(this.sc); arena.add(this.root);
    const gr = gate.g.rotation.y, back = 1.3 * gate.scale; this.pos = new V3(gate.x - Math.sin(gr) * back, 0, gate.z - Math.cos(gr) * back); // sale de dentro del túnel
    // primero sale recto por el hueco hasta delante de la compuerta (sin cruzar el marco ni los bloques de los lados) y
    // luego va a su puesto; la compuerta no se cierra mientras no haya salido
    this.gate = gate; this.out = false; this.exit = new V3(gate.x + Math.sin(gr) * 1.7 * gate.scale, 0, gate.z + Math.cos(gr) * 1.7 * gate.scale);
    Object.assign(this, { state: 'emerge', st: 0, phase: rand(0, TAU), hp: spec.hp, maxHp: spec.hp, pending: 0, alive: true, radius: (K.r || 0.4) * this.sc, hitT: 0, twitchT: rand(2, 5), twitch: 0, twitchYaw: 0, jaw: 0, arm: 0, smokeT: 0, lastCos: [1, 1], gunSpin: 0, flickT: 0, knockFrom: new V3(), knockTo: new V3() });
    Object.assign(this, { slot: new V3(), slotOk: false, row: 0, vel: new V3(), spd: 0, run: 0, twist: 0, taunt: 0, tauntT: rand(3, 6), taunts: 0, stagger: 0, slotT: 0, stuckT: 0, charged: false, lunge: 0, breath: rand(0, TAU) });
    robotSlot(this);
    // rapidez y forma de moverse de su clase (Ajustes → Cada enemigo): cada uno elige una de las marcadas
    const grp = K.grp || (K.beast3d === 'zombie' ? 'zombie' : K.beast3d === 'raptor' ? 'dino' : K.beast3d ? 'beast' : 'robot');
    this.pace = clamp((dv('pace_' + grp) || 100) / 100, 0.5, 2.5) * (K.boss ? 0.85 : 1); // rapidez de sus gestos (sube con la dificultad creciente)
    const travel = clamp((settings['spd_' + grp] || 100) / 100, 1, 3); // velocidad al desplazarse (1 = la justa para llegar a tiempo)
    this.style = pick(String(settings['move_' + grp] || 'straight').split(','));
    Object.assign(this, { zigPh: rand(0, TAU), burstT: rand(0, 1.8), dodge: 0, dodgeDir: 0, dodgeT: rand(2, 4), lastHp: spec.hp, roll: false, rollStart: false });
    // ritmo: acecha andando y, en los últimos metros, carga corriendo; en total tarda lo que pide «Tiempo llegada»
    const W = walkT(), D = this.pos.distanceTo(this.slot), T = Math.max(2, W / K.speedF - (W >= 10 ? 1.2 : 0));
    // vMove: a la que se desplazan de verdad (sin contar las paradas): «travel» veces la justa para llegar a tiempo andando
    // sin pararse; la carga final, aún más deprisa
    this.chargeD = Math.min(3.2, D * 0.4); this.vRun = clamp(2.2 * D / T, 1.0, 3.2) * (K.heavy ? 0.85 : 1);
    const walkV = () => Math.max(0.05, (D - this.chargeD) / Math.max(T * 0.4, T - this.chargeD / this.vRun));
    this.vWalk = walkV(); this.vRun = Math.max(this.vRun, Math.min(5, this.vWalk * travel * 1.2)); this.vWalk = walkV();
    if (this.vWalk > this.vRun) this.vRun = this.vWalk * 1.3;
    this.vMove = this.vWalk * travel;
    this.speed = this.vWalk;
    this.yaw = Math.atan2(this.slot.x - this.pos.x, this.slot.z - this.pos.z);
    this.bar = makeHpBar(this.root, 2.25, 0.7); if (K.boss) setHpBar(this.bar, 1);
    // con las animaciones de la biblioteca cargadas, se mueven con ellas (el pequeño, de cintura para arriba)
    const mk = { ripper: 'ripper', destroyer: 'destroyer', colossus: 'destroyer' }[this.rig.kind];
    if (mk && BEAST.rigClips && BEAST.rigClips[mk]) Object.assign(this, { clips: BEAST.rigClips[mk], mx: new THREE.AnimationMixer(this.root), acts: {}, cur: null, react: 0, prevSt: '', mxLegs: mk === 'destroyer', stepU: 0, stepClip: '' });
    gate.openT = Math.min(12, 1.3 + 1.6 / Math.max(0.05, this.speed)); this.animate(0, 0, 0); this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
  }
  center(out) { this.B.chest.getWorldPosition(out); return out; }
  backV() { return 0.9 * this.sc; } // retrocediendo de espaldas, a paso tranquilo (m/s)
  roar(pos, s) { SND.roar(pos, s); }
  // spd: lo que de verdad avanza (m/s). Quieto respira y se mueve inquieto; andando balancea cadera, hombros y brazos
  // en contra de las piernas; corriendo se inclina, alarga la zancada y bombea los brazos
  animate(dt, t, spd) {
    const B = this.B, K = this.K, isR = this.rig.kind === 'ripper', L = this.rig.legL;
    if (spd === true) spd = this.vWalk; // pose de prueba
    const sv = spd, dir = spd < 0 ? -1 : 1; spd = Math.abs(spd); // de espaldas: el paso, al revés
    const amp = clamp(spd / Math.max(0.2, this.vWalk * 0.7), 0, 1), run = this.run;
    this.phase += dir * TAU * clamp(spd / (K.stride * this.sc * (1 + run * 0.35)), 0, 2.8) * dt;
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
      if (!this.mxLegs && amp > 0.3 && (dir > 0 ? this.lastCos[i] > 0 && c <= 0 : this.lastCos[i] <= 0 && c > 0)) { const fp = B['an' + sd].getWorldPosition(new V3()); fp.y = 0.02; SND.step(fp, K.heavy); fx.dust(fp, K.heavy ? 5 : 3, 0.25 * this.sc * (1 + run)); if (Math.random() < 0.3) SND.servo(fp); }
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
    if (this.mx) this.animMx(dt, t, sv);
  }
  // Con animaciones: andar, trotar o correr según la velocidad (el pequeño mueve los brazos al paso de sus piernas);
  // amenazar señalándote; el golpe (llevado a mano para que caiga justo al golpear): el pequeño, un zarpazo; el grande,
  // un directo con la garra (el cañón sigue apuntándote); encogerse al recibir
  animMx(dt, t, spd) {
    const B = this.B, K = this.K, st = this.state, isR = !this.mxLegs, atk = this.atk && this.clips[this.atk] ? this.atk : isR ? 'Sword_Attack' : 'Punch_Jab';
    if (st === 'windup' && this.prevSt !== 'windup') { this.restart = true; this.react = 0; }
    this.prevSt = st;
    let want = 'Idle_Loop', ts = 1, once = false, fade = 0.2, atkT = -1, w = 0;
    if (st === 'windup' || st === 'strike' || (st === 'knock' && this.st < 0.5)) {
      const [t0, t1] = BEAST_PUNCH[atk], wind = this.zone ? 1.25 : 0.75;
      w = st === 'windup' ? smooth(clamp(this.st / wind, 0, 1)) : 0;
      atkT = st === 'windup' ? t0 * w : st === 'strike' ? lerp(t0, t1, clamp(this.st / 0.18, 0, 1)) : lerp(t1, t1 + 0.35, clamp(this.st / 0.5, 0, 1));
      want = atk; once = true; fade = st === 'windup' ? 0.3 : 0.1; ts = 0;
    } else if (st === 'down' && this.downAnim) { want = this.st < this.clips.Hit_Knockback.duration ? 'Hit_Knockback' : 'LayToIdle'; once = true; fade = 0.08; }
    else if (this.react > 0) { this.react -= dt; want = this.reactClip; once = true; fade = 0.06; }
    else if (st === 'taunt') want = 'Spell_Simple_Shoot';
    else if (st !== 'emerge' && (st !== 'knock' || this.backing)) { const v = Math.abs(spd) / this.sc, back = spd < 0;
      if (Math.abs(spd) > V_STEP * 0.9) { want = back || v < 2.2 ? 'Walk_Loop' : v < 4 ? 'Jog_Fwd_Loop' : 'Sprint_Loop'; ts = isR ? 0 : clamp(v / (want === 'Walk_Loop' ? 1.4 : want === 'Jog_Fwd_Loop' ? 3.2 : 5.1), 0.5, 1.8) * (back ? -1 : 1); }
      else if (st === 'walk' && this.clips.Sword_Idle) want = 'Sword_Idle'; } // parado esperando: en guardia, no en reposo
    mxPlay(this, want, fade, once, ts, this.restart); this.restart = false;
    const a = this.acts[want], loco = !!a && want !== 'Idle_Loop' && /_Loop$/.test(want);
    if (a && atkT >= 0) a.time = atkT;
    else if (loco && isR) a.time = a.getClip().duration * (((this.phase - Math.PI / 2) / TAU % 1 + 1) % 1); // en las animaciones, el pie izquierdo empieza delante
    this.mx.update(dt);
    // pasos del grande: cuando cada pie, según la animación, apoya
    if (this.mxLegs && loco) {
      const u = a.time / a.getClip().duration, pu = this.stepClip === want ? this.stepU : u;
      for (const [c, sd] of [[0.02, 'L'], [0.52, 'R']]) if (pu <= u ? pu < c && c <= u : c > pu || c <= u) { const fp = B['an' + sd].getWorldPosition(new V3()); fp.y = 0.02; SND.step(fp, K.heavy); fx.dust(fp, K.heavy ? 5 : 3, 0.25 * this.sc * (1 + this.run)); if (Math.random() < 0.3) SND.servo(fp); }
      this.stepU = u; this.stepClip = want;
    }
    // la cabeza, además, se vuelve hacia ti; el pequeño va encorvado; al recibir, se echa atrás
    const toP = tmpA.subVectors(HL, this.pos), ly = clamp(wrapAng(Math.atan2(toP.x, toP.z) - this.yaw), -0.9, 0.9);
    B.head.quaternion.multiply(_nq.setFromAxisAngle(_up, ly * 0.6 + this.twitchYaw * 0.4));
    B.spine.rotation.x += (isR ? 0.25 + this.run * 0.2 : 0) - this.hitT * 0.45 - this.stagger * 0.3;
  }
  update(dt, t) {
    // rapidez de movimientos: sus gestos (salir, amenazar, preparar y dar el golpe, retroceder, reaccionar, girarse, los
    // espasmos y las esquivas) van a su ritmo; preparando un golpe que se para con la espada, como mucho un 30 % más deprisa
    const K = this.K, g = this.state === 'windup' && this.zone ? Math.min(this.pace, 1.3) : this.pace, gd = dt * this.pace;
    this.st += this.state === 'walk' ? dt : dt * g; this.gt = (this.gt || 0) + gd;
    this.hitT = Math.max(0, this.hitT - gd * 4); this.stagger = Math.max(0, this.stagger - gd * 3);
    // aturdido tras un bloqueo: tiembla, echa chispas y no ataca; tu contraataque hace el doble
    if (this.stunT > 0) { this.stunT -= dt; this.stagger = Math.max(this.stagger, 0.5); this.stunFx = (this.stunFx || 0) - dt; if (this.stunFx <= 0) { this.stunFx = 0.25; fx.electric(this.B.head.getWorldPosition(tmpB), 6); } }
    // espasmos inquietantes
    this.twitchT -= gd;
    if (this.twitchT <= 0) { this.twitchT = rand(2.5, 6); this.twitch = 1; this.twitchYaw = rand(-0.9, 0.9); }
    if (this.twitch > 0) { this.twitch = Math.max(0, this.twitch - gd * 7); if (this.twitch === 0) this.twitchYaw = 0; }
    if (this.flickT > 0) { this.flickT -= dt; const on = Math.random() < 0.5; if (this.inst.meshes.glow) this.inst.meshes.glow.visible = on; if (this.inst.meshes.halo) this.inst.meshes.halo.visible = on; if (this.flickT <= 0) { if (this.inst.meshes.glow) this.inst.meshes.glow.visible = true; if (this.inst.meshes.halo) this.inst.meshes.halo.visible = true; } }
    const active = state === 'play' || state === 'rest', last = _rp.copy(this.pos);
    const toPl = Math.hypot(HL.x - this.pos.x, HL.z - this.pos.z), faceP = Math.atan2(HL.x - this.pos.x, HL.z - this.pos.z);
    let faceTo = null, wantV = 0; this.backing = false; // (solo retrocediendo tras el golpe)
    switch (this.state) {
      case 'emerge':
        if (this.st > 0.9) { this.state = 'walk'; this.st = 0; if (K.heavy || Math.random() < 0.5) { this.jaw = 1; this.roar(this.center(tmpB), K.boss ? 0.7 : K.heavy ? 0.85 : 1.15); } }
        break;
      case 'taunt': // se planta, abre los brazos y te ruge
        this.taunt = Math.min(1, this.taunt + gd * 5); faceTo = faceP;
        if (this.st > 1.1) { this.state = 'walk'; this.st = 0; }
        break;
      case 'walk': {
        if (!active) break;
        // cada poco busca un puesto mejor (al morir otro, los de atrás avanzan)
        this.slotT -= dt; if (this.slotT <= 0) { this.slotT = 0.6; if (this.row > 0 || this.stuckT > 1) { this.slotOk = false; robotSlot(this); this.stuckT = 0; } }
        if (!this.out) { this.gate.openT = Math.max(this.gate.openT, 0.8); if (Math.hypot(this.exit.x - this.pos.x, this.exit.z - this.pos.z) < 0.35) this.out = true; }
        const to = _rd.subVectors(this.out ? this.slot : this.exit, this.pos); to.y = 0; const d = this.out ? to.length() : to.length() + this.exit.distanceTo(this.slot);
        if (d < 0.12 || (d < 0.3 && this.out && this.vel.lengthSq() < V_STEP * V_STEP)) { // (ya parado, no se recoloca por unos centímetros)
          faceTo = faceP; this.vel.set(0, 0, 0);
          if (this.row === 0 && state === 'play' && !(this.stunT > 0) && !(this.throwCD > 0) && (!beatP() || BEAT.hit)) { this.state = 'windup'; this.st = 0; this.zone = null; this.atk = pickAttack(this); if (blockOn() && !K.thrower) blockStart(this); if (!K.beast3d) SND.servo(this.center(tmpB)); this.roar(this.center(tmpB), K.boss ? 0.65 : 1.0); }
          break; // esperando su turno en la fila de atrás: quieto, mirándote
        }
        to.normalize();
        // amenaza a media distancia (una vez por avance, si hay tiempo)
        if (!this.taunts && walkT() >= 10 && toPl > 3 && toPl < 7) { this.tauntT -= dt; if (this.tauntT <= 0) { this.taunts++; this.state = 'taunt'; this.st = 0; this.roar(this.center(tmpB), K.boss ? 0.6 : K.heavy ? 0.8 : 1.1); break; } }
        // carga: los últimos metros, corriendo y rugiendo
        if (!this.charged && d < this.chargeD + 0.3) { this.charged = true; this.jaw = 1; this.roar(this.center(tmpB), K.boss ? 0.7 : 1.2); }
        // al salir de la compuerta van ya a su velocidad (recto por el túnel); fuera, a su velocidad pero llegando cuando pide
        // «Tiempo llegada»: lo que les sobra lo gastan de lado a lado (zigzag) o parados en guardia (recto, a rachas y
        // esquivas; recto, con paradas más largas)
        wantV = (this.charged ? this.vRun : this.out ? this.vWalk : this.vMove) * clamp(d / 0.7, 0.3, 1);
        let lat = 0; const extra = this.vMove / this.vWalk, free = this.out && !this.charged && d > 1.0 && extra > 1.05;
        if (free && this.style === 'zigzag') { const L = Math.sqrt(extra * extra - 1), half = clamp(1.1 / (L * wantV + 1e-3), 0.45, 1.6); this.zigPh += dt * Math.PI / half; lat = clamp(Math.sin(this.zigPh) * 2.5, -1, 1) * L * wantV; }
        else if (free) { const C = this.style === 'straight' ? 2.6 : this.style === 'bursts' ? 1.4 : 1.8; this.burstT = (this.burstT + dt) % C; wantV *= this.burstT < C / extra ? extra : 0; }
        // esquiva: se aparta de los robots que tiene cerca y rodea al que se le cruza por delante (nunca va hacia él)
        const steer = _rv.copy(to);
        // las compuertas son sólidas: rodea sus pilares y los bloques de los lados (al salir del túnel va recto por el hueco)
        if (this.out) for (const c of solidsNow()) { const dx = this.pos.x - c.x, dz = this.pos.z - c.z, dd = Math.hypot(dx, dz) || 1e-3, min = c.r + this.radius; if (dd < min + 0.6) { const k = Math.pow((min + 0.6 - dd) / 0.6, 2) * 2.2; steer.x += dx / dd * k; steer.z += dz / dd * k; } }
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
        wantV *= 1 - Math.min(0.85, this.stagger); // al recibir un disparo, se frena
        if (wantV > 0) wantV = Math.max(wantV, V_STEP * 2.5); // nunca a paso de caracol: o anda, o se para
        _rs.copy(steer).multiplyScalar(wantV);
        // un cuerpo no anda de lado: avanza hacia donde mira (con algo de paso lateral) y gira hacia donde quiere ir; si es
        // hacia atrás o muy de lado, casi se para mientras gira. El vaivén del zigzag va aparte (y el cuerpo lo sigue)
        let hdg = null;
        if (this.out && !this.roll && _rs.lengthSq() > 0.01) {
          const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), along = _rs.x * fx + _rs.z * fz;
          _rs.set(fx * Math.max(0, along) + (_rs.x - fx * along) * 0.3, 0, fz * Math.max(0, along) + (_rs.z - fz * along) * 0.3);
        }
        if (lat) { _rs.x += to.z * lat; _rs.z -= to.x * lat; }
        if (this.out && !this.roll && wantV > 0.15) hdg = Math.atan2(steer.x * wantV + to.z * lat, steer.z * wantV - to.x * lat);
        this.vel.lerp(_rs, Math.min(1, dt * (3 + 3 * this.vMove / this.vWalk))); // con inercia: arranca y frena como un cuerpo pesado (más vivo cuanto más rápido)
        if (wantV === 0 && this.vel.lengthSq() < V_STEP * V_STEP) this.vel.set(0, 0, 0); // al frenar, se para del todo (sin deslizarse)
        this.pos.addScaledVector(this.vel, dt);
        // de cara hacia donde va, pero solo si va de verdad: casi parado, una velocidad diminuta no le hace girar sobre sí
        // mismo (de cerca, te mira)
        faceTo = hdg !== null && wantV > 0.15 ? hdg : Math.hypot(this.vel.x, this.vel.z) > 0.2 ? Math.atan2(this.vel.x, this.vel.z) : toPl < 4 ? faceP : null;
        // atascado: casi no avanza aunque quiere
        this.stuckT = this.vel.length() < wantV * 0.25 ? this.stuckT + dt : 0;
        break;
      }
      case 'windup': {
        // con bloqueos, el golpe tarda más en llegar: da tiempo a poner la espada en la marca (y a agacharse)
        const wind = this.zone ? 1.25 : 0.75;
        faceTo = faceP; this.arm = Math.min(1, this.st / (wind * 0.8)); this.jaw = 1; this.twist = lerp(this.twist, 0.5, Math.min(1, gd * 8));
        if (this.zone) blockStep(this, t);
        if (this.st > wind) { this.state = 'strike'; this.st = 0; this.knockFrom.copy(this.pos); }
        break;
      }
      case 'strike': { // zancada hacia ti con el golpe
        faceTo = faceP;
        if (K.thrower) { // el lanzador no se acerca: suelta la piedra y espera a la siguiente
          if (!this.thrownNow) { this.thrownNow = true; throwRock(this); }
          if (this.st > 0.35) { this.state = 'walk'; this.st = 0; this.thrownNow = false; this.throwCD = rand(3.5, 5.5) / Math.sqrt(Math.max(0.7, this.pace)); } // una cada 3–5 s
          break;
        } this.arm = -Math.min(1, this.st / 0.15); this.twist = lerp(this.twist, -0.45, Math.min(1, gd * 18)); this.lunge = Math.min(1, this.st / 0.15);
        const back = tmpA.subVectors(this.pos, HL); back.y = 0; back.normalize(); // (golpea desde su sitio: inclinándose, sin deslizarse hacia ti)
        if (this.zone) blockStep(this, t);
        if (this.st > 0.18) {
          const parried = this.zone && blockResolve(this); this.zone = null;
          this.state = 'knock'; this.st = 0; if (parried) { this.stunT = 1.8; this.stagger = 1; } else hurtPlayer(this);
          // retrocede tras el golpe, pero sin meterse en los que esperan detrás
          let kd = 0.9; for (const o of enemies) if (o !== this && o.alive && o.type === 'robot') { const ox = o.pos.x - this.pos.x, oz = o.pos.z - this.pos.z, al = ox * back.x + oz * back.z, lat = Math.abs(ox * back.z - oz * back.x), min = this.radius + o.radius + 0.05; if (al > 0 && lat < min) kd = Math.min(kd, Math.max(0, al - Math.sqrt(min * min - lat * lat))); }
          if (parried) kd = Math.min(kd, 0.6); // parado: retrocede poco y queda a tu alcance
          this.knockFrom.copy(this.pos); this.knockTo.copy(this.pos).addScaledVector(back, kd);
          if (K.beast3d) { SND.step(this.center(tmpB), true); fx.dust(tmpB.set(this.pos.x, 0.02, this.pos.z), 4, 0.3); } else { fx.electric(this.center(tmpB), 18); SND.metalHit(this.center(tmpB), true); }
        }
        break;
      }
      case 'down': { // derribado por un disparo muy cargado: sale despedido hacia atrás, cae de espaldas y se levanta
        const k = smooth(Math.min(1, this.st / 0.35)); this.pos.lerpVectors(this.knockFrom, this.knockTo, k); faceTo = faceP; this.lunge = 0; this.arm = 0;
        if (this.st > this.downT) { this.state = 'walk'; this.st = 0; this.charged = false; this.chargeD = 1.6; this.vel.set(0, 0, 0); }
        break;
      }
      case 'knock': { // recoge el golpe en su sitio y luego retrocede andando de espaldas, sin dejar de mirarte
        const k = smooth(Math.min(1, this.st / 0.5)); this.arm = lerp(-1, 0, k); this.hitT = Math.max(this.hitT, (1 - k) * 0.6);
        this.lunge = 1 - k; faceTo = faceP;
        if (this.st > 0.5) {
          const to = _rd.subVectors(this.knockTo, this.pos); to.y = 0; const d = to.length();
          if (d > 0.05 && this.st < 4) { this.backing = true; this.vel.copy(to).multiplyScalar(Math.min(this.backV() * Math.sqrt(this.pace), d / Math.max(dt, 1e-3)) / d); this.pos.addScaledVector(this.vel, dt); }
          else { this.state = 'walk'; this.st = 0; this.charged = false; this.chargeD = 1.6; this.vel.set(0, 0, 0); }
        }
        break;
      }
    }
    if (this.pushV && this.pushV.lengthSq() > 1e-6) { // empujado: se desliza hacia atrás y se frena enseguida
      const d = _rd.copy(this.pushV).multiplyScalar(dt); this.pos.add(d); if (this.state === 'knock' || this.state === 'down') { this.knockFrom.add(d); this.knockTo.add(d); }
      this.pushV.multiplyScalar(Math.exp(-dt * SHOVE_K));
      // preparando el golpe, si lo apartan de su puesto, lo deshace: tiene que volver a acercarse
      if (this.state === 'windup' && this.pos.distanceTo(this.slot) > 0.45) { if (this.zone) blockCancel(this); this.zone = null; this.state = 'walk'; this.st = 0; this.vel.set(0, 0, 0); }
    }
    this.dodgeStep(dt, faceP);
    if (this.dodge > 0) faceTo = this.roll ? this.dodgeYaw : faceTo;
    if (this.throwCD > 0) this.throwCD -= dt;
    if (this.state !== 'windup' && this.state !== 'strike' && this.state !== 'knock') { this.arm *= Math.max(0, 1 - gd * 5); this.twist *= Math.max(0, 1 - gd * 4); this.lunge *= Math.max(0, 1 - gd * 4); }
    if (this.state !== 'taunt') this.taunt = Math.max(0, this.taunt - gd * 3);
    if (this.state !== 'walk' && !this.backing) this.vel.multiplyScalar(Math.max(0, 1 - dt * 8));
    this.jaw = Math.max(0, this.jaw - gd * 0.9);
    // al recibir un disparo se tambalea (el tronco, hacia atrás) y se frena, pero no se desliza: sus pies siguen donde estaban
    // nunca se solapan: si se tocan, se aparta el que anda (el que está quieto no se desliza); si andan los dos, a medias
    for (const o of enemies) if (o !== this && o.alive && o.type === 'robot') {
      let dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, dd = Math.hypot(dx, dz); const min = this.radius + o.radius;
      if (dd >= min) continue; if (dd < 1e-4) { dx = rand(-1, 1); dz = rand(-1, 1); dd = Math.hypot(dx, dz); }
      const a = movingOn(this), b = movingOn(o), w = a === b ? 0.5 : a ? 1 : 0, k = (min - Math.min(dd, min)) / dd;
      this.pos.x += dx * k * w; this.pos.z += dz * k * w; o.pos.x -= dx * k * (1 - w); o.pos.z -= dz * k * (1 - w);
    }
    solidPush(this); // y nunca dentro de una puerta cerrada, un pilar, un tronco o una roca
    // de cara hacia donde va y, al acercarse, cada vez más hacia ti
    const near = smooth(clamp((3.2 - toPl) / 2, 0, 1));
    if (faceTo !== null) {
      const walk = this.state === 'walk' && !this.roll, tgt = walk ? faceTo + wrapAng(faceP - faceTo) * near * 0.85 * clamp(1 - Math.hypot(this.vel.x, this.vel.z) / Math.max(0.3, this.vWalk), 0, 1) : faceTo;
      let dy = wrapAng(tgt - this.yaw) * Math.min(1, gd * (this.roll ? 10 : walk ? 6 : 8));
      if (walk) { const lim = gd * 2.6 / (0.6 + (K.r || 0.4)); dy = clamp(dy, -lim, lim); } // gira como un cuerpo con peso: los grandes, más despacio
      this.yaw += dy;
    }
    this.spd = Math.hypot(this.pos.x - last.x, this.pos.z - last.z) / Math.max(dt, 1e-3);
    if (this.state === 'strike' || this.state === 'knock' || this.state === 'down') this.spd = 0; // la zancada y el retroceso no son pasos
    // para la animación: la marcha hacia delante, suavizada (sin los empujones de los que tiene al lado ni el tambaleo), para
    // que los pies no patinen ni el paso tiemble
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw), fwd = this.vel.x * sy + this.vel.z * cy, side = this.vel.x * cy - this.vel.z * sy;
    const locoV = this.backing ? fwd : this.state === 'walk' && !(this.dodge > 0) ? Math.hypot(Math.max(0, fwd), side) : this.spd;
    const a0 = (this.aspd || 0) * (locoV * (this.aspd || 0) < 0 ? 0 : 1); this.aspd = a0 + (locoV - a0) * Math.min(1, dt * (Math.abs(locoV) > Math.abs(a0) ? 12 : 6)); // (arranca enseguida: sin deslizarse al empezar a andar)
    const runK = this.aspd > this.vWalk * 1.15 ? clamp((this.aspd - this.vWalk) / Math.max(0.1, this.vRun - this.vWalk), 0, 1) : 0;
    this.run += (runK - this.run) * Math.min(1, dt * 4);
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
    this.animate(dt, this.gt, this.aspd); // su propio reloj, al ritmo de sus gestos
    if (this.rig.kind !== 'ripper' && !K.beast3d) { this.smokeT -= dt; if (this.smokeT <= 0) { this.smokeT = 0.3; for (const s of [-1, 1]) fx.smoke(this.B.chest.localToWorld(tmpB.set(s * 0.15, 0.8, -0.26)), 0.12 * K.scale, 0.7, 1.6, 0.12); } }
    if (this.bar.g.visible) this.bar.g.lookAt(head.p);
  }
  // Esquivas: se aparta de golpe hacia un lado (los que tienen las animaciones de la biblioteca y el cuerpo entero, con
  // una voltereta); de vez en cuando mientras se acerca y, a veces, al recibir un disparo. Nunca contra otro ni contra
  // una pared ni un pilar
  dodgeStep(dt, faceP) {
    const hit = this.hp < this.lastHp; this.lastHp = this.hp;
    if (this.dodge > 0) {
      const T = this.dodgeDur, k = 1 - this.dodge / T, D = (this.roll ? 1.4 : 0.9) * this.sc, v = D * Math.PI / (2 * T) * Math.sin(Math.PI * clamp(k, 0, 1)); // recorre D metros
      _rd.set(Math.cos(faceP), 0, -Math.sin(faceP)).multiplyScalar(this.dodgeDir * v * dt); // de lado respecto a ti
      const nx = this.pos.x + _rd.x, nz = this.pos.z + _rd.z, r = this.radius;
      const blocked = solidsNow().some(c => (this.out || c.g !== this.gate) && Math.hypot(nx - c.x, nz - c.z) < c.r + r) || enemies.some(o => o !== this && o.alive && o.type === 'robot' && Math.hypot(nx - o.pos.x, nz - o.pos.z) < r + o.radius) || roomBlocked(nx, nz, r) || Math.hypot(nx, nz) > arenaDepth() + 1;
      if (!blocked) { this.pos.x = nx; this.pos.z = nz; } else this.dodge = Math.min(this.dodge, 0.05);
      this.dodge -= dt; if (this.dodge <= 0) { this.dodge = 0; this.roll = false; this.slotT = 0; }
      return;
    }
    if (this.style !== 'dodge' || this.state !== 'walk' || !this.out || this.charged || state !== 'play') return;
    this.dodgeT -= dt;
    if (this.dodgeT <= 0 || (hit && this.hp > 0 && Math.random() < 0.55)) {
      this.dodgeT = rand(2.5, 4.5) / Math.max(0.7, this.pace);
      this.roll = !!(this.mx && this.clips && this.clips.Roll && this.K.beast3d);
      this.dodge = this.dodgeDur = (this.roll ? 0.75 : 0.45) / Math.min(1.8, this.pace); this.rollStart = true;
      this.dodgeDir = Math.random() < 0.5 ? -1 : 1; this.dodgeYaw = faceP + this.dodgeDir * Math.PI / 2; // la voltereta, de cara hacia donde va
    }
  }
  // Un disparo cargado ×3 o ×4 lo derriba (a los jefes no: solo se tambalean)
  knockDown() {
    if (this.state === 'down' || this.K.boss || this.state === 'emerge' || !this.out) return false;
    if (this.zone) { blockCancel(this); this.zone = null; }
    const c = this.clips || {}, anim = c.Hit_Knockback && c.LayToIdle && (this.D ? !this.D.own : this.mxLegs);
    const back = tmpA.subVectors(this.pos, HL); back.y = 0; back.normalize();
    Object.assign(this, { state: 'down', st: 0, atk: null, react: 0, restart: true, downAnim: anim, downT: anim ? c.Hit_Knockback.duration + c.LayToIdle.duration : 1.0 });
    this.knockFrom.copy(this.pos); this.knockTo.copy(this.pos).addScaledVector(back, 1.1 * this.sc);
    this.stagger = 1; say('¡DERRIBADO!', '#ffd166', 0.9); return true;
  }
  // Empujón: lo aleja de ti «dist» metros, deslizándose (se frena en un instante)
  shove(dist) {
    if (!this.out || this.state === 'emerge' || !(dist > 0)) return;
    const b = tmpA.subVectors(this.pos, HL); b.y = 0; const l = b.length() || 1;
    (this.pushV || (this.pushV = new V3())).addScaledVector(b, dist * SHOVE_K / l);
  }
  // Retroceso con cada impacto: más cuanto más fuerte (cargado, perfecto); los pesados, menos; los jefes, muy poco. Si
  // estaba preparando el golpe, se le retrasa
  recoil(perfect, pow) {
    const k = knockK() * (this.K.boss ? 0.3 : this.K.heavy ? 0.6 : 1); if (!k || this.hp <= 0 || this.state === 'down') return;
    this.shove((0.16 + 0.1 * (pow - 1) + (perfect ? 0.06 : 0)) * k);
    if (this.state === 'windup') this.st = Math.max(0, this.st - (this.K.boss ? 0.08 : 0.2) * pow * Math.min(1, k));
  }
  onHit(dmg, perfect, point, pow = 1) {
    if (this.mx) { this.reactClip = Math.random() < 0.5 ? 'Hit_Chest' : 'Hit_Head'; this.react = 0.35 / (this.pace || 1); this.restart = true; }
    if (pow >= 3 && this.hp > dmg) this.knockDown();
    this.hp -= dmg; this.hitT = 0.3; this.flickT = 0.25; this.stagger = Math.min(1, this.stagger + 0.6); this.twitch = 1; setHpBar(this.bar, this.hp / this.maxHp); this.recoil(perfect, pow);
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

const _nq = new Q4();
/* =================== MONSTRUOS DE ARCHIVO (Imp y Puglin) =================== */
// Se comportan como los robots (puestos, compuertas, bloqueos); el cuerpo lo mueven sus animaciones: andar, trotar o
// correr según la velocidad (y al ritmo de lo que avanzan), provocarte (el Imp lanza un hechizo, el Puglin baila), un
// puñetazo que llega justo al golpear, encogerse al recibir y caer al morir; esperando su turno con música, bailan al compás
const BEAST_PUNCH = { Punch_Cross: [0.15, 0.3], Punch_Jab: [0.12, 0.22], Sword_Attack: [0.33, 0.5], Melee_Hook: [0.2, 0.3], Sword_Regular_A: [0.18, 0.26], Sword_Regular_B: [0.18, 0.26], Sword_Regular_C: [0.58, 0.7], OverhandThrow: [0.25, 0.35] };
// Dónde llega cada golpe, para pararlo con la espada: a qué altura y por qué lado (−1: por su derecha, que tú ves a tu
// izquierda; 1: por su izquierda). Medido en las animaciones: los puñetazos, a la cara; el gancho, de lado al cuerpo; el
// tajo A sube desde abajo, el B cruza a media altura y el C cae de arriba (sus primeros giros, un amago)
const ATK_ZONE = { Punch_Cross: ['high', 0], Punch_Jab: ['high', 0], Sword_Attack: ['mid', 0], Melee_Hook: ['mid', -1], Sword_Regular_A: ['low', -1], Sword_Regular_B: ['mid', 1], Sword_Regular_C: ['high', 0] };
// El golpe de cada uno, variado entre los que tiene (los jefes, más a menudo el tajo que cae de arriba)
function pickAttack(e) {
  if (e.K.thrower) return 'OverhandThrow';
  if (e.D && e.D.atk) return e.D.atk[0]; // los que traen sus animaciones: el suyo
  const pool = e.D ? ['Punch_Cross', 'Punch_Jab', 'Melee_Hook', 'Sword_Regular_A', 'Sword_Regular_B', 'Sword_Regular_C', ...(e.K.boss ? ['Sword_Regular_C', 'Sword_Regular_C'] : [])]
    : !e.mx ? [] : e.mxLegs ? ['Punch_Jab'] : ['Sword_Attack', 'Sword_Regular_A', 'Sword_Regular_B', 'Sword_Regular_C']; // el grande golpea con la garra; el pequeño, tajos
  const ok = pool.filter(n => e.clips && e.clips[n]); return ok.length ? pick(ok) : null;
}
// Animaciones de archivo (monstruos y humanoides de neón): la acción de cada animación, y ponerla apagando todas las demás
// (si quedara alguna sonando, se mezclarían las posturas; también las paradas, como el golpe que se lleva a mano)
function mxAct(o, n) { let a = o.acts[n]; if (!a) { const c = o.clips[n]; if (!c) return null; a = o.acts[n] = o.mx.clipAction(c); } return a; }
const MX_GESTURE = new Set(['Idle_Loop', 'Sword_Idle', 'Spell_Simple_Shoot', 'Hit_Chest', 'Hit_Head', 'Hit_Knockback', 'LayToIdle']); // al ritmo de sus gestos (andar va con lo que avanza)
function mxPlay(o, n, fade = 0.2, once = false, ts = 1, restart = false) {
  const a = mxAct(o, n); if (!a) return; a.timeScale = MX_GESTURE.has(n) ? ts * (o.pace || 1) : ts; if (o.cur === n && !restart) return;
  o.cur = n; a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once; a.fadeIn(fade).play();
  for (const k in o.acts) { const b = o.acts[k]; if (b !== a && b.isScheduled()) { b.timeScale = 1; b.fadeOut(fade); } }
}
// Tono del rugido sintetizado de cada monstruo (sin su archivo de sonido): más agudo cuanto más pequeño
const BEAST_PITCH = { skeleton: 1.3, captain: 0.8, sharky: 1.0, mako: 1.1, puglin: 1.9, zombie: 0.75, zgreen: 0.85, zchubby: 0.65, raptor: 1.6, yeti: 1.0, cyclops: 1.15, demon: 1.5, greendemon: 1.5, skull: 1.7, alien: 1.8, alientall: 1.6, bee: 2.4, bat: 2.2, cthulhu: 1.2, dragon: 0.9 };
class Beast extends Robot {
  constructor(spec, gate) {
    super(spec, gate); this.D = BEAST_DEF[this.K.beast3d]; this.bar.g.position.y = this.D.h + 0.25;
    this.mx = new THREE.AnimationMixer(this.inst.model); this.clips = BEAST.kinds[this.K.beast3d].clips; this.acts = {}; this.cur = null; this.react = 0; this.tint = 0; this.prevSt = '';
    // si para llegar a tiempo tendría que andar mucho más despacio que su paso natural (a cámara lenta), acecha: anda a
    // su paso y se para de vez en cuando (llega igual)
    const natural = this.D.walk * this.sc * 0.8; if (this.vWalk < natural * 0.75 && this.style !== 'zigzag') this.vMove = Math.max(this.vMove, natural);
    this.animate(0, 0, 0);
  }
  roar(pos) { SND.roar(pos, BEAST_PITCH[this.K.beast3d] || 1.4, this.K.beast3d); }
  backV() { return this.D.walk * this.sc * 0.85; } // el zombi, un gruñido grave; cada uno con su archivo
  center(out) { this.B.chest.getWorldPosition(out); if (this.D.ctr) out.y += this.D.h * this.D.ctr * this.sc; return out; } // (la diana y los disparos, al cuerpo)
  play(n, fade, once, ts, restart) { mxPlay(this, n, fade, once, ts, restart); }
  animate(dt, t, spd) {
    if (!this.mx) return;
    const K = this.K, D = this.D, st = this.state; if (spd === true) spd = this.vWalk;
    if (st === 'windup' && this.prevSt !== 'windup') { if (!this.atk || !this.clips[this.atk]) this.atk = D.atk ? D.atk[0] : Math.random() < 0.6 ? 'Punch_Cross' : 'Punch_Jab'; this.restart = true; this.react = 0; }
    this.prevSt = st;
    // el puñetazo, llevado a mano: recoge el brazo durante la preparación, lo estira justo en el golpe, lo mantiene un
    // instante mientras retrocede y lo recoge (BEAST_PUNCH: cuándo empieza a salir y cuándo está del todo estirado)
    let punchT = -1;
    if (this.atk && (st === 'windup' || st === 'strike' || (st === 'knock' && this.st < 0.5))) {
      const [t0, t1] = D.atk ? D.atk.slice(1) : BEAST_PUNCH[this.atk], dur = this.clips[this.atk].duration, wind = this.zone ? 1.25 : 0.75;
      punchT = st === 'windup' ? t0 * smooth(clamp(this.st / wind, 0, 1)) : st === 'strike' ? lerp(t0, t1, clamp(this.st / 0.18, 0, 1)) : this.st < 0.15 ? t1 : lerp(t1, dur, clamp((this.st - 0.15) / 0.35, 0, 1));
    }
    let want = 'Idle_Loop', ts = 1, once = false, fade = 0.2;
    const back = spd < 0, v = Math.abs(spd) / this.sc; // a escala del modelo (de espaldas, la animación al revés)
    if (punchT >= 0) { want = this.atk; once = true; fade = 0.1; ts = 0; }
    else if (st === 'down' && this.downAnim) { want = this.st < this.clips.Hit_Knockback.duration ? 'Hit_Knockback' : 'LayToIdle'; once = true; fade = 0.08; } // cae de espaldas y se levanta
    else if (st === 'down') { want = D.hit && this.clips[D.hit] ? D.hit : 'Idle_Loop'; once = true; fade = 0.06; }
    else if (this.roll && this.clips.Roll) { want = 'Roll'; once = true; fade = 0.08; ts = this.clips.Roll.duration / this.dodgeDur; if (this.rollStart) { this.restart = true; this.rollStart = false; } }
    else if (this.react > 0) { this.react -= dt; want = this.reactClip; once = true; fade = 0.06; }
    else if (st === 'taunt') want = D.taunt || (K.beast3d === 'imp' ? 'Spell_Simple_Shoot' : 'Dance_Loop');
    else if (st === 'emerge' || (st === 'knock' && !this.backing)) want = 'Idle_Loop';
    else if (v * this.sc > V_STEP * (/Walk|Jog|Sprint/.test(this.cur || '') ? 0.6 : 0.9)) { // si se desplaza, anda (con margen: no salta de andar a quieto y vuelta)
      const h = this.cur, m1 = (D.walk + D.jog) / 2 * (h === 'Jog_Fwd_Loop' || h === 'Sprint_Loop' ? 0.88 : 1.12), m2 = (D.jog + D.run) / 2 * (h === 'Sprint_Loop' ? 0.88 : 1.12);
      want = back || v < m1 ? 'Walk_Loop' : v < m2 ? 'Jog_Fwd_Loop' : 'Sprint_Loop'; fade = 0.3;
      ts = clamp(v / (want === 'Walk_Loop' ? D.walk : want === 'Jog_Fwd_Loop' ? D.jog : D.run), D.minTs || 0.5, D.maxTs || 1.8) * (back ? -1 : 1); // los pies no patinan
    } else if (beatP()) { want = 'Dance_Loop'; ts = 1 / (2 * beatP()); } // esperando su turno: baila, un paso cada dos pulsos
    else if (st === 'walk' && this.clips.Sword_Idle) want = 'Sword_Idle'; // o, sin música, en guardia
    this.play(want, fade, once, ts, this.restart); this.restart = false;
    if (punchT >= 0) this.acts[this.atk].time = punchT;
    this.mx.update(dt);
    // al recibir: se tiñe de rojo y le brillan más los ojos; tambaleo hacia atrás
    this.tint = Math.max(0, this.tint - dt * 4); const m = this.inst.mat; m.color.setRGB(1, 1 - 0.55 * this.tint, 1 - 0.55 * this.tint); m.emissiveIntensity = 1 + this.tint * 3;
    this.inst.model.rotation.x = -(this.hitT || 0) * 0.6 - (this.stagger || 0) * 0.15;
  }
  onHit(dmg, perfect, point, pow = 1) {
    const down = pow >= 3 && this.hp > dmg && this.knockDown();
    this.hp -= dmg; this.hitT = 0.3; this.stagger = Math.min(1, this.stagger + 0.6); this.tint = 1; setHpBar(this.bar, this.hp / this.maxHp); this.recoil(perfect, pow);
    if (down && this.downAnim) { /* ya cae con su animación */ }
    else if (this.clips.Hit_Chest) { this.reactClip = Math.random() < 0.5 ? 'Hit_Chest' : 'Hit_Head'; this.react = 0.35 / (this.pace || 1); this.restart = true; } // sin esas animaciones (zombi, dinosaurios), solo el tambaleo
    else if (this.D.hit && this.clips[this.D.hit]) { this.reactClip = this.D.hit; this.react = 0.35 / (this.pace || 1); this.restart = true; } // (los que traen la suya)
    fx.sparks(point, 10, [0.9, 0.15, 0.1], 2.2, 0.04); fx.glow(point, [1, 0.5, 0.3], 0.35, 0.08); SND.squish(point);
    if (this.hp <= 0) this.kill(); else if (Math.random() < 0.3) this.roar(this.center(tmpB));
  }
  // al morir cae con su animación (el zombi, que no la tiene, se desploma de espaldas), se hunde en el suelo y desaparece
  kill() {
    if (this.mode === 'dying') return; this.alive = false; this.mode = 'dying'; this.st = 0; this.react = 0; this.bar.g.visible = false; this.tint = 1;
    const c = this.center(new V3()); fx.sparks(c, 18, [0.9, 0.15, 0.1], 2.6, 0.05); SND.roar(c, (BEAST_PITCH[this.K.beast3d] || 1.4) * 0.8, this.K.beast3d); SND.squish(c);
    if (this.clips.Death01) this.play('Death01', 0.1, true, 1, true); else { this.fall = this.inst.model.rotation.x; if (this.acts[this.cur]) this.acts[this.cur].timeScale = 0.3; }
  }
  update(dt, t) {
    if (this.mode !== 'dying') return super.update(dt, t);
    this.st += dt; this.mx.update(dt); this.tint = Math.max(0, this.tint - dt * 2); this.inst.mat.color.setRGB(1, 1 - 0.55 * this.tint, 1 - 0.55 * this.tint);
    if (this.fall !== undefined) { // se desploma de espaldas: cae cada vez más deprisa, rebota un poco y se queda tumbado
      const k = Math.min(1, this.st / 0.75), e = k * k, b = k >= 1 ? Math.sin(Math.min(1, (this.st - 0.75) / 0.25) * Math.PI) * 0.06 : 0;
      this.inst.model.rotation.x = lerp(this.fall, -Math.PI / 2, e) + b; if (this.st > 0.75 && !this.thud) { this.thud = true; SND.step(this.root.position, true); fx.dust(tmpB.set(this.root.position.x, 0.02, this.root.position.z), 6, 0.35); }
    } else this.inst.model.rotation.x *= Math.max(0, 1 - dt * 8); // sin la inclinación del último impacto: queda tumbado en el suelo
    if (this.st > 2.3) this.root.position.y -= dt * 0.45 * this.sc; // se hunde
    if (this.st > 3.8 && !this.gone) { this.gone = true; this.dispose(); }
  }
  dispose() { if (this.disposed) return; this.disposed = true; super.dispose(); this.mx.stopAllAction(); this.inst.mat.dispose(); if (this.inst.mat.still) this.inst.mat.still.dispose(); }
}

/* =================== ARAÑAS (flexiones) =================== */
const SPIDER_KIND = { imp: { s: 1.0 }, puglin: { s: 0.9 }, impboss: { s: 2.4, boss: true }, zombie: { s: 1.0 }, zombieboss: { s: 2.4, boss: true }, raptor: { s: 1.0 }, raptorboss: { s: 2.4, boss: true }, scout: { s: 1.0 }, heavy: { s: 1.4 }, titan: { s: 2.4, boss: true } };
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
    const K = SPIDER_KIND[spec.kind] || HATCH_KIND[spec.kind]; this.type = 'spider'; this.kind = spec.kind; this.s = K.s; this.boss = !!K.boss; this.HK = K;
    this.makeBody();
    this.root.scale.setScalar(this.s); arena.add(this.root);
    this.pos = new V3(hatch.x, -0.07 * this.s, hatch.z); hatch.openT = 2.2;
    this.home = new V3(hatch.x, 0, hatch.z);
    this.target = oneArm() ? new V3(Math.sign(hatch.x) * rand(0.3, 0.4), 0, rand(-0.3, 0)) : new V3((hatch.x < 0 ? -1 : 1) * rand(0.06, 0.22), 0, -(0.4 + 0.04 * this.s)); // en la plancha atacan por el costado
    this.avg = Math.max(0.01, this.pos.distanceTo(this.target) / dv('walkTime'));
    this.yaw = Math.atan2(this.target.x - this.pos.x, this.target.z - this.pos.z);
    Object.assign(this, { mode: 'emerge', st: 0, run: false, runT: 0, vel: new V3(), hp: spec.hp, maxHp: spec.hp, pending: 0, alive: true, radius: 0.075 * this.s, fade: 1, rear: 0, skitT: 0, lungeFrom: new V3(), lungeTo: new V3(), pitch: 0, roll: 0 });
    Object.assign(this, { threatT: rand(1.2, 2.5), close: 0, rage: 0, hopFrom: new V3(), hopTo: new V3(), hopped: false, startD: Math.max(0.1, this.pos.distanceTo(this.target)) });
    this.legs = this.legless ? [] : SPIDER_LEGS.map(d => ({ d, foot: new V3(), from: new V3(), to: new V3(), t: 1, dur: 0.08, hipW: new V3() }));
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw; this.root.updateMatrixWorld(true);
    this.legs.forEach(L => { this.idealFoot(L, _foot); L.foot.copy(_foot); });
    this.bar = makeHpBar(this.root, this.legless ? 0.27 : 0.17, 0.14); if (this.boss) setHpBar(this.bar, 1);
    SND.hiss(this.center(tmpA), this.s, this.voice);
  }
  makeBody() {
    this.glowMat = M.glowSkin.clone(); // ojos propios: cada araña se enciende según su rabia
    this.inst = RIGS.spider.instance({ main: M.chitinSkin, pat: M.abdomenSkin, gloss: M.glossSkin, glow: this.glowMat }); this.root = this.inst.root; this.B = this.inst.bones;
    this.eyeGlow = glowSprite(0xff2208, 0.05, 0); this.eyeGlow.position.set(0, 0.015, 0.05); this.B.body.add(this.eyeGlow);
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
        if (this.stunT > 0) { this.stunT -= dt; this.rear = 0; break; } // aturdida tras una parada: no se mueve ni ataca
        this.runT -= dt;
        if (this.runT <= 0) { this.run = !this.run; this.runT = this.run ? rand(0.3, 0.9) : rand(0.15, 0.8); if (this.run && Math.random() < 0.4) SND.skitter(this.center(tmpA), s); }
        if (this.run) { moveTo = this.target; speed = this.avg / 0.55 * rand(0.9, 1.2); }
        if (this.pos.distanceTo(this.target) < 0.02 && state === 'play') { this.mode = 'rear'; this.st = 0; SND.hiss(this.center(tmpA), s, this.voice); break; }
        // amenaza mientras se acerca: más a menudo cuanto más cerca está
        this.threatT -= dt * (1 + this.close * 2.5);
        if (this.threatT <= 0 && !this.run && state === 'play' && this.pos.distanceTo(this.target) > 0.05) { this.mode = 'threat'; this.st = 0; this.hopped = false; SND.hiss(this.center(tmpA), s * 0.9, this.voice); }
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
        if (this.st > 0.55) { this.mode = 'lunge'; this.st = 0; this.lungeFrom.copy(this.pos); this.lungeTo.set(lerp(this.pos.x, HL.x, 0.75), 0, lerp(this.pos.z, HL.z, 0.75)); SND.whoosh(this.center(tmpA), 'spider'); }
        break;
      case 'lunge': {
        const k = Math.min(1, this.st / 0.22); this.pos.lerpVectors(this.lungeFrom, this.lungeTo, k); this.pos.y = Math.sin(k * Math.PI) * 0.12 + k * Math.max(0, HL.y - 0.25) * 0.7;
        if (k >= 1) { hurtPlayer(this); SND.hiss(this.center(tmpA), s * 0.8, this.voice); this.mode = 'recoil'; this.st = 0; this.lungeFrom.copy(this.pos); const back = tmpA.subVectors(this.target, HL); back.y = 0; back.normalize(); this.lungeTo.copy(this.target).addScaledVector(back, 0.28 + (this.bounce || 0)); this.bounce = 0; }
        break;
      }
      case 'recoil': {
        const k = Math.min(1, this.st / 0.35); this.pos.lerpVectors(this.lungeFrom, this.lungeTo, smooth(k)); this.pos.y = this.lungeFrom.y * (1 - k) + Math.sin(k * Math.PI) * 0.05; this.rear = 1 - k;
        if (k < 1) { this.vel.subVectors(this.lungeTo, this.lungeFrom).multiplyScalar(1 / 0.35); this.vel.y = 0; } // retrocede con las patas (de espaldas)
        if (k >= 1) { this.pos.y = 0; this.mode = 'run'; this.st = 0; this.run = false; this.runT = rand(0.4, 1.0); if (this.parryT) { this.stunT = this.parryT; this.parryT = 0; } }
        break;
      }
      case 'dying':
        this.fade = this.st < 1.4 ? 1 : Math.max(0, 1 - (this.st - 1.4) / 0.5);
        this.root.scale.setScalar(s * Math.max(0.001, this.fade));
        if (this.st > 1.9) { this.dispose(); this.gone = true; return; }
        break;
    }
    if (this.pushV && this.pushV.lengthSq() > 1e-6) { if (this.mode === 'run' || this.mode === 'threat' || this.mode === 'rear') this.pos.addScaledVector(this.pushV, dt); this.pushV.multiplyScalar(Math.exp(-dt * SHOVE_K)); }
    if (moveTo) {
      const to = tmpA.subVectors(moveTo, this.pos); to.y = 0; const d = to.length();
      if (d > 0.005) { to.normalize(); const lat = Math.sin(t * 9 + this.s * 7) * 0.35; const dir = tmpB.set(to.x + to.z * lat, 0, to.z - to.x * lat).normalize(); const step = Math.min(d, speed * dt); this.pos.addScaledVector(dir, step); this.vel.copy(dir).multiplyScalar(speed); this.yaw += wrapAng(Math.atan2(dir.x, dir.z) - this.yaw) * Math.min(1, dt * 10); }
    }
    for (const o of enemies) if (o !== this && o.alive && o.type === 'spider') { const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, dd = dx * dx + dz * dz, min = (this.radius + o.radius) * 1.1; if (dd < min * min && dd > 1e-6) { const k = (min - Math.sqrt(dd)) * 0.5 / Math.sqrt(dd); this.pos.x += dx * k; this.pos.z += dz * k; } }
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
    this.pose(dt, t);
    this.root.updateMatrixWorld(true);
    this.updateLegs(dt);
    if (this.bar.g.visible) this.bar.g.lookAt(head.p);
  }
  // el aspecto: respiración, colmillos, pedipalpos y ojos que se encienden
  pose(dt, t) {
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
  }
  updateLegs(dt) {
    if (!this.legs.length) return;
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
  shove(dist) {
    if (this.mode === 'emerge' || this.mode === 'dying' || !(dist > 0)) return;
    const b = tmpA.subVectors(this.pos, HL); b.y = 0; const l = b.length() || 1;
    (this.pushV || (this.pushV = new V3())).addScaledVector(b, dist * SHOVE_K / l);
  }
  // Retroceso: unos centímetros (a su escala); alzada para atacar, un disparo fuerte o perfecto le quita el ataque y uno
  // flojo se lo retrasa
  recoil(perfect, pow) {
    const k = knockK() * (this.boss ? 0.3 : 1); if (!k || this.hp <= 0) return;
    this.shove((0.05 + 0.03 * (pow - 1) + (perfect ? 0.02 : 0)) * k);
    if (this.mode === 'rear') { if ((pow >= 2 || perfect) && !this.boss) { this.mode = 'run'; this.st = 0; this.run = false; this.runT = 0.5; } else this.st = Math.max(0, this.st - 0.15 * k); }
  }
  onHit(dmg, perfect, point, pow = 1) {
    this.hp -= dmg; setHpBar(this.bar, this.hp / this.maxHp);
    fx.ichor(point, 8, this.s); SND.squish(point);
    this.rear = 0; if (this.mode === 'run') { this.run = false; this.runT = 0.25; }
    this.recoil(perfect, pow);
    if (this.hp <= 0) this.kill();
  }
  kill() {
    this.alive = false; this.mode = 'dying'; this.st = 0; this.bar.g.visible = false;
    const c = this.center(new V3()); fx.ichor(c, 22, this.s * 1.3); fx.glow(c, [0.6, 0.8, 0.2], 0.25 * this.s, 0.12); SND.squish(c); if (this.boss) { fx.explosion(c, 0.5, false); SND.explosion(c, false); }
  }
  dispose() { arena.remove(this.root); this.inst.skel.dispose(); this.glowMat.dispose(); this.eyeGlow.material.dispose(); }
}

/* ---------- Las piedras del lanzador ---------- */
// El lanzador se queda lejos y, cada pocos segundos, te tira una piedra en parábola: llega a donde estaba tu cabeza al
// soltarla. Apártate (¡Esquivada!) o párala con una mano o con la hoja de la espada (¡Parada!); si te da, te golpea
const ROCKS = [], ROCK_HIT = 0.28, ROCK_PARRY = 0.17;
const rockGeo = new THREE.DodecahedronGeometry(0.085, 0), rockMat = std({ color: 0x8c7b66, roughness: 0.92, metalness: 0, flatShading: true });
const _rk = new V3(), _rk2 = new V3(), _rkw = new V3();
function throwRock(e) {
  const from = arena.worldToLocal((e.B.handR || e.B.head || e.root).getWorldPosition(new V3())), to = HL.clone(), d = from.distanceTo(to), T = clamp(d / 4.5, 0.85, 1.4);
  const m = new THREE.Mesh(rockGeo, rockMat); m.castShadow = true; m.position.copy(from); arena.add(m);
  ROCKS.push({ m, from, to, T, t: 0, h: 0.6 * T * T, mode: 'fly', vel: new V3(), spin: new V3(rand(-9, 9), rand(-9, 9), rand(-9, 9)), src: e });
  SND.whoosh(arena.localToWorld(from.clone()), 'throw');
  if (!stats.rocks) say('¡Te lanza piedras! Apártate o párala con la mano', '#ff8a3d', 2.2); stats.rocks = (stats.rocks || 0) + 1;
}
const rockAt = (r, t, out) => { const k = clamp(t / r.T, 0, 1); out.lerpVectors(r.from, r.to, k); out.y += Math.sin(Math.PI * k) * r.h; return out; };
// ¿Una mano (dedos, nudillos o muñeca) o la hoja de una espada toca la piedra? (en coordenadas del mundo)
function rockParry(w) {
  for (const s of ['left', 'right']) {
    if (swordIn(s)) { const S = SWD.s[s]; for (let i = 1; i < BLADE_N; i++) if (S.cur[i].distanceTo(w) < ROCK_PARRY) return { side: s, sword: true }; }
    const h = hands[s]; if (!h.ok) continue;
    if (h.wrist.distanceTo(w) < ROCK_PARRY || (h.tipOk && h.tip.distanceTo(w) < ROCK_PARRY)) return { side: s };
    if (h.isHand) for (const j of [4, 9, 14, 19, 24]) if (h.J[j] && h.J[j].ok && h.J[j].p.distanceTo(w) < ROCK_PARRY) return { side: s };
  }
  return null;
}
function updateRocks(dt) {
  for (let i = ROCKS.length - 1; i >= 0; i--) {
    const r = ROCKS[i]; r.t += dt; r.m.rotation.x += r.spin.x * dt; r.m.rotation.y += r.spin.y * dt; r.m.rotation.z += r.spin.z * dt;
    if (r.mode === 'fly') {
      const prev = _rk2.copy(r.m.position), p = rockAt(r, r.t, _rk); r.m.position.copy(p); r.vel.subVectors(p, prev).divideScalar(Math.max(dt, 1e-3));
      const w = arena.localToWorld(_rkw.copy(p)), par = state === 'play' || state === 'rest' ? rockParry(w) : null;
      if (par) { // parada: sale rebotada hacia donde vino
        r.mode = 'fall'; r.vel.multiplyScalar(-0.45).add(_rk2.set(rand(-1, 1), 2.2, 0)); score += 100; combo++; stats.bestCombo = Math.max(stats.bestCombo, combo); boardDirty = true;
        if (par.sword) SND.swordBlock(w, settings.swordKind === 'laser'); else SND.metalHit(w, false);
        fx.sparks(w, 16, [1, 0.8, 0.5], 2.4, 0.04); haptic(par.side, 0.8, 50); say('¡Parada!', '#3cf0c6', 0.8, false); continue;
      }
      if (r.t >= r.T) { // llega: ¿sigues ahí?
        if (Math.hypot(p.x - HL.x, p.y - HL.y, p.z - HL.z) < ROCK_HIT && state === 'play') { fx.sparks(w, 12, [0.8, 0.7, 0.6], 2, 0.04); SND.metalHit(w, false); say('¡Pedrada!', '#ff3b5c', 1.0, false); hurtPlayer({ silent: true, rock: true }); arena.remove(r.m); ROCKS.splice(i, 1); continue; }
        r.mode = 'fall'; if (state === 'play') { score += 50; combo++; stats.bestCombo = Math.max(stats.bestCombo, combo); boardDirty = true; say('¡Esquivada!', '#3cf0c6', 0.8, false); }
      }
    } else { // parada o esquivada: cae y desaparece
      r.vel.y -= 9.8 * dt; r.m.position.addScaledVector(r.vel, dt);
      if (r.m.position.y < 0.05 || r.t > r.T + 2.5) { arena.remove(r.m); ROCKS.splice(i, 1); }
    }
  }
}
function rocksClear() { for (const r of ROCKS) arena.remove(r.m); ROCKS.length = 0; }

/* ---------- Monstruitos de las trampillas ---------- */
// Cangrejo, seta y calavera (Cute Animated Monsters): salen de las trampillas y se mueven como las arañas (corretean,
// amenazan dando un saltito y saltan a morderte), con su modelo y sus animaciones; unos 20 cm (el jefe, 2,4 veces más)
const HATCH_KIND = { hcrab: { s: 1.0, beast: 'crab' }, hmushroom: { s: 1.0, beast: 'mushroom' }, hskull: { s: 1.0, beast: 'skull' } };
for (const k of Object.keys(HATCH_KIND)) HATCH_KIND[k + 'boss'] = { ...HATCH_KIND[k], s: 2.4, boss: true };
class HatchBeast extends Spider {
  makeBody() {
    const D = BEAST_DEF[this.HK.beast], B = BEAST.kinds[this.HK.beast], model = THREE.SkeletonUtils.clone(B.scene), root = new THREE.Group();
    this.mat = new THREE.MeshStandardMaterial({ map: B.map, roughness: 0.85, metalness: 0, skinning: true, side: THREE.DoubleSide });
    model.traverse(m => { if (m.isMesh) { m.material = this.mat; m.castShadow = true; m.frustumCulled = false; } });
    model.scale.setScalar(0.2 * D.k / D.h); root.add(model); // (D.k es para su tamaño andando, de D.h metros)
    Object.assign(this, { model, root, legless: true, voice: this.HK.beast, inst: { root, skel: { dispose() {} } }, B: { body: model }, mx: new THREE.AnimationMixer(model), clips: B.clips, acts: {}, cur: null, tint: 0 });
  }
  center(out) { return this.root.localToWorld(out.set(0, 0.1, 0)); }
  pose(dt, t) {
    this.close = clamp(1 - this.pos.distanceTo(this.target) / this.startD, 0, 1);
    const m = this.mode, moving = this.vel.lengthSq() > 0;
    const want = m === 'dying' ? 'Death01' : m === 'lunge' ? 'Bite' : m === 'threat' ? 'Dance_Loop' : moving || m === 'emerge' ? 'Walk_Loop' : 'Idle_Loop';
    mxPlay(this, want, 0.1, want === 'Death01' || want === 'Bite', want === 'Walk_Loop' ? (m === 'recoil' ? -1.7 : 1.7) : want === 'Bite' ? 2.2 : 1); this.mx.update(dt);
    this.pitch += ((-this.rear * 0.5) - this.pitch) * Math.min(1, dt * 10); this.model.rotation.x = this.pitch;
    this.tint = Math.max(0, this.tint - dt * 4); this.mat.color.setRGB(1, 1 - 0.55 * this.tint, 1 - 0.55 * this.tint); // al recibir, se tiñe de rojo
  }
  onHit(dmg, perfect, point, pow) { this.tint = 1; super.onHit(dmg, perfect, point, pow); }
  dispose() { arena.remove(this.root); this.mx.stopAllAction(); this.mat.dispose(); }
}

/* =================== BICHOS VOLADORES =================== */
const FLYER_KIND = {
  drone: { rig: 'drone', speed: 1.0, erratic: 1.0, scale: 1.0, kamikaze: true },
  hornet: { rig: 'stinger', speed: 1.45, erratic: 1.6, scale: 1.5 },
  bomber: { rig: 'bomber', speed: 0.75, erratic: 0.6, scale: 1.25, kamikaze: true },
  carrier: { rig: 'carrier', speed: 0.5, erratic: 0.35, scale: 2.1, kamikaze: true, boss: true },
  // monstruitos que vuelan (con su modelo y sus animaciones): pican o muerden como el avispón; el dragón, jefe
  bee: { beast: 'bee', speed: 1.35, erratic: 1.4, scale: 1.0 }, bat: { beast: 'bat', speed: 1.5, erratic: 1.9, scale: 1.0 },
  cthulhu: { beast: 'cthulhu', speed: 0.85, erratic: 0.7, scale: 1.1 }, dragon: { beast: 'dragon', speed: 0.5, erratic: 0.35, scale: 2.0, boss: true }
};
// Un ejemplar de un monstruito volador: una copia del modelo, con su textura, su esqueleto y su mezclador de animaciones
function beastFlyer(kind) {
  const B = BEAST.kinds[kind], D = BEAST_DEF[kind], model = THREE.SkeletonUtils.clone(B.scene), root = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ map: B.map, roughness: 0.85, metalness: 0, skinning: true, side: THREE.DoubleSide });
  model.traverse(m => { if (m.isMesh) { m.material = mat; m.castShadow = true; m.frustumCulled = false; } });
  // (los pies, abajo: el centro del bicho queda donde vuela). El balanceo y el alabeo del vuelo van en un grupo aparte: si
  // movieran el modelo, le quitarían ese desplazamiento y el cuerpo volaría por encima de la diana
  const body = new THREE.Group(); root.add(body);
  model.scale.setScalar(D.k); model.position.y = -D.h * (D.ctr || 0.5); body.add(model);
  return { root, model, mat, bones: { body }, meshes: {}, skel: { dispose() {} }, mx: new THREE.AnimationMixer(model), clips: B.clips, acts: {}, cur: null };
}
const MAT_DRONE = { main: M.carbonSkin, glow: M.glowSkin, halo: M.haloSkin, rotor: M.rotorSkin };
// Tumbado (superman, plancha lateral) los voladores vienen bajos, a la altura de la cabeza
const lowFly = () => settings.exercise === 'superman' || settings.exercise === 'splank';
const lowFlyY = () => clamp(settings.exercise === 'splank' ? DET.sp.ref + 0.03 : DET.su.ref + settings.supRange / 100 + 0.08, 0.3, 0.8);
const SUP_ATK = { next: 0 }; // superman: cuándo puede lanzarse el siguiente volador
class Flyer {
  constructor(spec) {
    const K = FLYER_KIND[spec.kind], push = isTiny(), low = lowFly(); this.K = K; this.type = 'flyer'; this.kind = spec.kind;
    this.inst = K.beast ? beastFlyer(K.beast) : RIGS[K.rig].instance(spec.kind === 'hornet' ? MAT_STINGER : MAT_DRONE); this.root = this.inst.root; this.B = this.inst.bones;
    this.scale = K.scale * (push ? 0.42 : 1); this.root.scale.setScalar(this.scale); arena.add(this.root);
    let start;
    if (push) { const h = pick(liveHatches()); h.openT = 1.6; start = new V3(h.x, 0.05, h.z); }
    const sp = dv('flySpeed') / 3.6 * (push ? 0.27 : 1);
    if (!push) { const g = this.gate = pick(liveGates()), r = g.g.rotation.y; g.openT = Math.min(10, 1.2 + 1.2 / Math.max(0.05, sp * K.speed)); start = new V3(g.x - 0.6 * Math.sin(r), (low ? 0.6 : 1.5) * g.scale, g.z - 0.6 * Math.cos(r)); }
    Object.assign(this, { base: start.clone(), pos: start.clone(), last: start.clone(), dart: new V3(), dartT: new V3(0, push ? 0.25 : rand(1.8, 3.6), 0), nextDart: 1.2, speed: sp * K.speed * rand(0.85, 1.15), erratic: K.erratic * dv('erratic') / 100, w1: rand(0.6, 1.6), w2: rand(0.8, 1.8), ph1: rand(0, TAU), ph2: rand(0, TAU), t: 0, retreat: 0, hp: spec.hp, maxHp: spec.hp, pending: 0, alive: true, radius: 0.24 * this.scale * (spec.kind === 'hornet' ? 0.78 : 1), bank: 0, flickT: 0, windT: 0 });
    this.bar = makeHpBar(this.root, K.beast ? 0.34 : spec.kind === 'hornet' ? 0.1 : 0.17, spec.kind === 'hornet' ? 0.16 : 0.3); if (K.boss) setHpBar(this.bar, 1);
    this.buzz = buzzLoop(spec.kind, arena.localToWorld(start.clone()));
    this.root.position.copy(start);
  }
  // (ya muerto, donde murió: se quita de la escena al momento y, fuera de ella, su posición saldría en coordenadas de la
  // arena, lejos de donde estaba; el estallido y los puntos de onKilled salían desplazados)
  center(out) { if (this.deadAt) return out.copy(this.deadAt); this.root.getWorldPosition(out); return out; }
  update(dt, t) {
    this.t += dt; const push = isTiny(), low = lowFly(), active = state === 'play' || state === 'rest';
    if (active) {
      // en el superman y la plancha lateral vuelan bajo, a la altura de tu cabeza (nunca por encima de 0,8 m)
      const tgt = tmpA.set(0, low ? lowFlyY() : Math.max(push ? 0.2 : 1.0, HL.y - (push ? 0.05 : 0.12)), 0);
      tgt.x = HL.x * 0.6; tgt.z = HL.z * 0.6;
      // en el superman el disparo se carga aguantando arriba: se quedan esperando algo más lejos, a la vista, y solo pican
      // después de dar tiempo a una repetición entera y nunca mientras aguantas arriba
      const sup = settings.exercise === 'superman', to = tmpB.subVectors(tgt, this.base), d = to.length(), reach = push ? 0.32 : sup ? 1.4 : 0.85;
      if (d > reach || this.retreat > 0) this.waitT = 0; else this.waitT = (this.waitT || 0) + dt;
      if (this.retreat > 0) { this.retreat -= dt; this.base.addScaledVector(to.normalize(), -this.speed * 1.6 * dt); }
      else if (d > reach) this.base.addScaledVector(to.normalize(), Math.min(d, this.speed * dt));
      else if (sup && !this.windT && (this.waitT < settings.supHold + 3 || DET.su.state === 'up' || stats.time < SUP_ATK.next)) { /* esperando */ }
      else if (state === 'play') {
        if (this.K.kamikaze) { hurtPlayer(this); const c = this.center(new V3()); fx.explosion(c, 0.45 * (push ? 0.5 : 1), false); SND.explosion(c, false); spawnQueue.push({ kind: this.kind, hp: this.hp }); this.alive = false; this.dispose(); return; }
        if (!this.windT) { this.windT = 1e-3; if (this.K.beast) SND.roar(this.center(tmpC), BEAST_PITCH[this.K.beast] || 1.6, this.K.beast); else SND.hiss(this.center(tmpC), 0.8, 'wasp'); } // el avispón carga antes de picar (y te da un momento para dispararle); los monstruitos, con su voz
      }
      if (sup && this.windT === 1e-3) SUP_ATK.next = stats.time + settings.supHold + 3.5; // y el siguiente, otra repetición después (nunca dos seguidos)
      if (this.windT > 0 && state !== 'play') this.windT = 0;
      if (this.windT > 0) { // carga 0.45 s echándose atrás, se lanza 0.25 s y pica
        const was = this.windT; this.windT += dt; if (was < 0.45 && this.windT >= 0.45) SND.whoosh(this.center(tmpC));
        if (this.windT >= 0.7) { hurtPlayer(this); this.retreat = 2.5 + (this.parryT || 0); this.parryT = 0; this.windT = 0; } // (parado, huye más lejos)
      }
      if (this.t > this.nextDart && !this.windT && (!beatP() || BEAT.hit)) {
        const A = clamp(d * (push ? 0.25 : 0.2), push ? 0.06 : 0.4, push ? 0.35 : 2.4) * this.erratic;
        this.dartT.set(rand(-1, 1) * A, rand(-0.4, 0.6) * A * (low ? 0.2 : 0.7), rand(-0.5, 0.5) * A * 0.4);
        this.nextDart = this.t + rand(0.8, 3.0) / Math.sqrt(Math.max(0.2, this.erratic));
      }
    }
    if (this.pushV && this.pushV.lengthSq() > 1e-6) { this.base.addScaledVector(this.pushV, dt); this.pushV.multiplyScalar(Math.exp(-dt * SHOVE_K)); } // empujado
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
    if (this.gate) gateKeep(this);
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
    } else if (this.inst.mx) { // monstruito: vuela batiendo las alas y, al lanzarse, muerde
      const I = this.inst, bite = this.windT > 0.3; mxPlay(I, bite ? 'Bite' : 'Fly', 0.12, bite, bite ? 1.4 : 1); I.mx.update(dt);
    } else {
      for (let i = 0; i < 6; i++) { const r = B['r' + i]; if (r) r.rotation.y += dt * (55 + i * 3); }
      if (B.cam) B.cam.rotation.x = Math.sin(this.t * 0.7) * 0.2;
    }
    if (this.flickT > 0) { this.flickT -= dt; const m = this.inst.meshes.glow; if (m) m.visible = this.flickT <= 0 || Math.random() < 0.5; }
    if (this.buzz) this.buzz.set(this.center(tmpA));
    if (this.bar.g.visible) this.bar.g.lookAt(head.p);
  }
  shove(dist) {
    if (!(dist > 0)) return;
    const b = tmpA.subVectors(this.base, HL); b.y *= 0.3; const l = b.length() || 1;
    (this.pushV || (this.pushV = new V3())).addScaledVector(b, dist * SHOVE_K / l);
  }
  // Retroceso: sale despedido hacia atrás; si estaba cogiendo impulso para picar, se le quita
  recoil(perfect, pow) {
    const k = knockK() * (this.K.boss ? 0.3 : 1); if (!k || this.hp <= 0) return;
    this.shove((0.25 + 0.12 * (pow - 1) + (perfect ? 0.08 : 0)) * k * (isTiny() ? 0.42 : 1));
    if (this.windT > 0 && this.windT < 0.45 && !this.K.boss) { this.windT = 0; this.retreat = Math.max(this.retreat, 0.5); }
  }
  onHit(dmg, perfect, point, pow = 1) {
    this.hp -= dmg; this.flickT = 0.2; setHpBar(this.bar, this.hp / this.maxHp);
    fx.sparks(point, 8, [1, 0.6, 0.2], 2, 0.03 * Math.max(0.5, this.scale)); SND.metalHit(point, false);
    this.dartT.multiplyScalar(-1); this.recoil(perfect, pow);
    if (this.hp <= 0) this.kill();
  }
  kill() {
    this.alive = false; const c = this.center(new V3()), big = !!this.K.boss, s = isTiny() ? 0.45 : 1; this.deadAt = c.clone();
    if (this.inst.mx) { fx.ichor(c, big ? 30 : 18, (big ? 2.2 : 1.4) * s); fx.glow(c, [1, 0.7, 0.4], (big ? 0.8 : 0.4) * s, 0.12); SND.squish(c); if (big) { fx.explosion(c, 1.2 * s, true); SND.explosion(c, true); } this.dispose(); return; } // (sin chatarra)
    if (this.kind === 'hornet') { fx.ichor(c, 18, 1.5 * s); fx.glow(c, [1, 0.8, 0.3], 0.4 * s, 0.1); SND.squish(c); }
    else { fx.explosion(c, (big ? 1.4 : 0.55) * s, big); SND.explosion(c, big); }
    rigDebris(this.inst, c, (big ? 3 : 2) * s, this.kind === 'hornet' ? 0 : 0.5, this.kind === 'hornet' ? { main: M.robotStaticWasp } : { main: M.carbonStatic });
    this.dispose();
  }
  dispose() { arena.remove(this.root); this.inst.skel.dispose(); if (this.inst.mx) { this.inst.mx.stopAllAction(); this.inst.mat.dispose(); } if (this.buzz) { this.buzz.stop(); this.buzz = null; } }
}
// Los voladores salen por el hueco de la compuerta: dentro del túnel y bajo el dintel no suben por encima del techo ni se
// meten en las paredes; al salir, el límite se abre poco a poco (sin saltos). Ya fuera, no vuelven a meterse por delante
function gateKeep(f) {
  const g = f.gate, r = g.g.rotation.y, c = Math.cos(r), s = Math.sin(r), sc = g.scale || 1, p = f.pos, rad = f.radius / sc;
  const dx = p.x - g.x, dz = p.z - g.z; let x = (dx * c - dz * s) / sc, z = (dx * s + dz * c) / sc, y = p.y / sc;
  if (!f.gateOut) {
    if (z > 3) f.gateOut = true;
    const open = Math.max(0, z - 0.55) * 1.5, top = 2.9 - rad * 1.25 + open, side = Math.max(0, 1.17 - rad + open);
    y = Math.min(y, top); x = clamp(x, -side, side); z = Math.max(z, -1.35 + rad);
  } else if (Math.abs(x) < 2.3 + rad && y < 4.3 && z < 0.55 + rad && z > -1.5) z = 0.55 + rad;
  else return;
  p.set(g.x + (x * c + z * s) * sc, y * sc, g.z + (-x * s + z * c) * sc);
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
  constructor(drop, offset = 0, second = false, tilt = 0, jump = false, spin = 0) {
    const H = arMode ? 2.25 : 2.55;
    this.drop = drop; this.tilt = tilt; this.jump = jump; this.maxUp = -1; this.fast = false;
    this.barY = jump ? clamp(settings.jumpHeight / 100 + 0.08, 0.12, 0.45) : Math.max(0.4, calibRef + HEAD_TOP - drop - Math.tan(Math.abs(tilt)) * settings.arcShift / 100);
    this.o = makeArcObj(this.barY, H, spin ? 0 : tilt, jump); this.z = -arenaDepth() + 0.9 - offset; this.o.grp.position.set(0, 0, this.z); arena.add(this.o.grp);
    Object.assign(this, { speed: arxSpeed(), judged: false, hit: false, checked: false, minClear: 1, second, alive: true, t: 0, zapT: 0, warnT: 0 });
    // la rueda: la barra gira mientras llega y se para inclinada (tilt) justo al pasar por ti; la cortina no la sigue
    if (spin) { Object.assign(this, { spin, tiltEnd: tilt, tReach: Math.max(0.5, (HL.z - this.z) / this.speed), leanX: Math.sign(tilt) * settings.arcShift / 100 }); this.o.curtain.visible = false; const hub = glowSprite(0xff2a14, 0.35, 0.9); this.o.bar.add(hub); }
    this.hum = humLoop(arena.localToWorld(new V3(0, this.barY, this.z)));
    if (!second) gates[1].openT = 1.6;
    zapLines(this.o.lines);
  }
  barAt(x) { return this.barY + Math.tan(this.tilt) * clamp(x, -1, 1); } // altura de la barra sobre tu cabeza
  update(dt, t) {
    this.t += dt; this.z += this.speed * dt; this.o.grp.position.z = this.z;
    if (this.spin) { const tau = Math.max(0, this.tReach - this.t); this.tilt = this.tiltEnd + this.spin * tau * Math.min(1, tau / 1.2); this.o.bar.rotation.z = this.tilt; }
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
      if (this.maxUp < need || !this.fast) { fx.electric(hp, 24); SND.zap(hp); hurtPlayer(this); arxHit(); say(this.maxUp >= need ? '¡Salta, no te estires!' : '¡Salta!', '#ff3b5c', 1.3); return; }
      const perfect = this.maxUp >= need + 0.06; SND.whoosh(hp, 'arc'); registerRep(perfect, false); arxClean();
      say(perfect ? '¡PERFECTA!' : '¡Saltado!', perfect ? '#3cf0c6' : '#ffffff', 0.9, perfect); if (perfect) SND.perfect();
      return;
    }
    if (this.hit) { fx.electric(hp, 24); SND.zap(hp); hurtPlayer(this); arxHit(); say(this.tilt ? `¡Apártate a la ${this.tilt > 0 ? 'derecha' : 'izquierda'}!` : '¡Agáchate más!', '#ff3b5c', 1.3); return; }
    const perfect = this.minClear >= 0.06;
    SND.whoosh(hp, 'arc');
    if (this.second) { score += 150 * (1 + combo * 0.1) | 0; say('¡Aguantado!', '#3cf0c6', 1.0); boardDirty = true; return; }
    registerRep(perfect, false); arxClean();
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
function fireBolt(origin, dir, lockFrom, dmg, perfect, forced, pow = 1) {
  const e = forced || findLock(lockFrom || origin, dir), L = boltLevel(perfect), col = boltRGB(L);
  const to = e ? e.center(new V3()) : origin.clone().addScaledVector(dir, 9);
  if (e) e.pending += dmg; stats.shots++;
  const lt = boltStart(origin, to, L, isTiny() ? 0.5 : 1, !e);
  projs.push({ lt, from: origin.clone(), to, e, dmg, perfect, pow, t: 0, dur: Math.max(0.09, origin.distanceTo(to) / 30), kind: 'bolt', col });
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
        const target = p.e; target.onHit(p.dmg, p.perfect, p.to.clone(), p.pow || 1); comicHit(p.to); if (!target.alive) onKilled(target);
        if (p.kind === 'orb' && p.pow >= 3) { // disparo muy cargado: estalla y alcanza a los de alrededor
          const R = isTiny() ? 0.32 : 1.4; fx.electric(p.to, 22); fx.glow(p.to, p.col, isTiny() ? 0.35 : 1, 0.15); SND.zap(p.to);
          for (const o of enemies) if (o.alive && o !== target && o.center(tmpA).distanceTo(p.to) < R) { o.onHit(p.pow - 2, false, tmpA.clone(), p.pow); if (!o.alive) onKilled(o); } // (la onda también derriba a los que aguantan)
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
  const pts = { titan: 1500, carrier: 1500, dragon: 1500, queen: 1500, bigbubble: 1000, wasp: 300, heavy: 500, bomber: 400, hornet: 350, cthulhu: 400, scout: 300, drone: 250, bubble: 200 }[e.kind] || ((e.K && e.K.boss) || e.boss ? 1500 : 300);
  score += pts; popup(`+${pts}`, '#ffffff', e.center(new V3()).add(new V3(0, 0.2, 0))); comicKill(e.center(new V3()), !!(e.K && e.K.boss || e.boss)); // (en cómic, ¡POW!)
  if (e.K && e.K.boss || e.boss) say('¡JEFE DESTRUIDO!', '#ffd166', 2.2);
  boardDirty = true;
}

/* =================== REPETICIONES =================== */
function registerRep(perfect, fire = true, side) {
  stats.reps++; waveDone++; if (perfect) stats.perfect++;
  combo++; stats.bestCombo = Math.max(stats.bestCombo, combo);
  score += Math.round(50 * (perfect ? 2 : 1) * (1 + combo * 0.1) * (settings.mode === 'arcs' && ARX.fever ? 2 : 1)); // (en fiebre, el doble)
  if (combo > 0 && combo % 10 === 0) { say(`COMBO ×${combo}`, '#ffd166', 1.5); SND.combo(); }
  boardDirty = true;
}
function onRep(opts, side) {
  if (!['play', 'rest', 'ready'].includes(state) || settings.mode === 'arcs' || isBars()) return;
  registerRep(opts.perfect, true, side); guardOnRep(opts);
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
  } else if (!throwCharge(dmg, opts.perfect, pow)) { // apuntando con las manos: carga las manos y se lanza con el gesto
    if (throwAim()) { fireOrb(head.p.clone().add(tmpA.set(0, -0.25, 0)).addScaledVector(fwdH(), 0.3), dmg, opts.perfect, pow); charged = false; chargePow = 1; chargeOrb.visible = false; return; } // sin manos a la vista: al más cercano
    for (const s of aimSources()) {
      let o = s.o.clone();
      if (s.key === 'gaze') o = side && hands[side].ok ? hands[side].wrist.clone() : head.p.clone().add(tmpA.set(0, -0.15, 0)).addScaledVector(fwdH(), 0.2);
      else gloves[s.key].pulse = 1;
      fireBolt(o, s.d.clone(), s.key === 'gaze' ? head.p.clone() : null, dmg, opts.perfect, s.key === 'gaze' ? gazeLock() : null, pow);
    }
  }
  charged = false; chargePow = 1; chargeOrb.visible = false;
}
function onPartial(text) {
  if (!['play', 'rest', 'ready'].includes(state)) return;
  stats.partial++; combo = 0; say(text, '#ff8a3d', 1.2); SND.partial(); charged = false; chargePow = 1; chargeOrb.visible = false;
}
// Sube un nivel de carga mientras aguantas abajo
function onPower(pow, deep) {
  if (!charged || !['play', 'rest', 'ready'].includes(state)) return;
  chargePow = pow; chargeOrb.material.color.setHex(POW_COL[pow - 1]); SND.power(pow);
  if (deep) { SND.perfect(); fx.glow(head.p.clone().addScaledVector(fwd(), 0.5), [1, 0.25, 0.95], 0.5, 0.2); }
  say(deep ? `¡RECARGA PROFUNDA! ×${pow}` : `CARGA ×${pow}`, '#' + POW_COL[pow - 1].toString(16).padStart(6, '0'), deep ? 1.3 : 0.9); boardDirty = true;
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
  pr: { left: { state: 'down', bottom: -0.15, max: 0, t0: 0, lost: 0, vy: 0, lostUp: false }, right: { state: 'down', bottom: -0.15, max: 0, t0: 0, lost: 0, vy: 0, lostUp: false } },
  pair: { side: null, t: 0, perfect: false, fast: false },
  tw: { last: null, acc: 0, lo: 0, hi: 0, dir: 0, n: 0, t0: 0, lostT: 0, warnT: 0, ext: 0 },
  th: { pending: null, hold: null, t0: 0, armed: false, ref: 0, quiet: 0, seen: { left: false, right: false }, last: { left: -1, right: -1 }, low: { left: 9, right: 9 }, lostT: { left: 0, right: 0 } },
  ch: { state: 'idle', side: 0, t0: 0, top: 0 },
  dl: { armed: false, t0: 0, o: null, was: false, rowing: false, warnT: -9, low: { left: 9, right: 9 }, up: { left: 0, right: 0 }, lost: { left: 9, right: 9 } },
  sp: { ref: 0.45, state: 'hold', t0: 0, sec: 0, awayT: 0, dev: 0, warnT: 0 },
  iw: { pair: 0, phase: 'stand' }, iwp: { state: 'up', ref: 0, min: 0, t0: 0, charged: false, stillT: 0 },
  fr: { state: 'down', bottom: -0.85, max: 0, t0: 0, lost: 0, fwd: 0 },
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
    // recarga profunda: bajando mucho más de lo pedido (Ajustes → Ejercicio), la carga máxima al instante
    if (cfg.power && d.charged && d.pow < 4 && deepOn() && drop >= cfg.req + settings.deepDrop / 100) { d.pow = 4; onPower(4, true); }
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
// y nada mientras tanto. En el press, por encima de la cabeza (y con la mancuerna tapándola) las cámaras pierden la mano
// a menudo: si se pierde una mano que ya subía bien (casi a la mitad del recorrido, o deprisa y ya a la altura de la
// cara), cuenta igual; y si vuelve a verse ya arriba, también. Arriba se queda arriba aunque se pierda un rato: al volver
// a verla bajando, la bajada no cuenta como otra subida a medias
function armStep(kind, side, t, dt) {
  const press = kind === 'press', h = hands[side], d = (press ? DET.pr : DET.curl)[side], pt = settings.perfectTime;
  const range = (press ? settings.pressRange : settings.curlRange) / 100;
  if (!h.ok) {
    d.lost += dt;
    if (press) {
      // por encima de la cabeza (o junto a la cara, al empezar a empujar) las cámaras pierden la mano: si se perdió subiendo, cuenta
      if (d.state === 'down' && d.lost > 0.2 && d.vy > 0.3 && d.prevR !== undefined && d.prevR > d.bottom + 0.04) { d.state = 'rising'; d.max = d.prevR; d.t0 = t; onCharge(); }
      if (d.state === 'rising' && d.lost > 0.12 && (d.max - d.bottom >= range * 0.3 || (d.vy > 0.25 && d.max > -0.15))) { d.state = 'top'; return { top: true, perfect: false, fast: false }; }
    } else if (d.state === 'hold' && d.lost > 0.25) { d.state = 'top'; return { top: true, ...d.ev, pow: d.pow }; } // junto a la cara la mano se pierde a menudo: sale con la carga que llevaba
    else if (d.lost > 0.5) d.state = 'down';
    return null;
  }
  const r = h.wrist.y - head.p.y;
  if (press) {
    if (d.lost > 0.12 && d.state === 'rising') d.lostUp = true; // subía y se perdió: al volver a verla basta con el 80 % del recorrido
    if (d.lost > 0) d.vy = 0;
    else if (d.prevR !== undefined && dt > 0) d.vy += ((r - d.prevR) / dt - d.vy) * Math.min(1, dt * 15); // velocidad de subida, suavizada
    d.prevR = r;
  }
  d.lost = 0;
  d.bottom += (r - d.bottom) * (r < d.bottom ? 0.5 : press ? 0.0015 : 0.0012); // lo más bajo del recorrido
  // curl: aguantando la pesa a la altura del hombro (el brazo doblado, haciendo fuerza) el disparo se carga, como abajo en
  // la sentadilla: un nivel cada POW_STEP s, hasta ×4; sale al empezar a bajarla
  if (d.state === 'hold') {
    if (r >= d.bottom + range * 0.75) { d.holdT += dt; const p = 1 + Math.min(3, Math.floor(d.holdT / POW_STEP)); if (p > d.pow) { d.pow = p; onPower(p); } return null; }
    d.state = 'top'; return { top: true, ...d.ev, pow: d.pow };
  }
  if (d.state === 'down') { if (r > d.bottom + Math.min(press ? 0.1 : 0.12, range * (press ? 0.35 : 0.45))) { d.state = 'rising'; d.max = r; d.t0 = t; d.lostUp = false; if (press) onCharge(); } }
  else if (d.state === 'rising') {
    d.max = Math.max(d.max, r);
    if (r - d.bottom >= range * (press && d.lostUp ? 0.8 : 1)) {
      const dur = t - d.t0, ev = { perfect: dur >= pt * 0.5 && dur < 5 && r - d.bottom >= range + 0.03, fast: pt > 0 && dur < pt * 0.25 };
      if (!press) { Object.assign(d, { state: 'hold', holdT: 0, pow: 1, ev }); onCharge(); return null; }
      d.state = 'top'; return { top: true, ...ev };
    }
    if (r < d.bottom + (press ? 0.06 : 0.07)) { d.state = 'down'; if (d.max - d.bottom > range * 0.55) return { msg: press ? 'Estira el brazo del todo arriba' : 'Sube hasta el hombro' }; }
  } else if (r < d.bottom + 0.08) d.state = 'down';
  return null;
}
// Los dos brazos a la vez (barra o kettlebell): cada uno con su paso, y la repetición cuenta cuando los dos llegan
// casi a la vez. Si una mano no se ve (la barra la tapa), basta con la otra. Con la barra las dos suben juntas aunque el
// seguimiento no lo vea igual en las dos (una algo más baja, o que llega un instante después): cuando una completa, vale
// si la otra ya está arriba aguantando o ha subido al menos el 60 % del recorrido; si no, se le espera PAIR_WIN segundos
const PAIR_WIN = 1.0;
function pairNear(kind, side) {
  const d = (kind === 'press' ? DET.pr : DET.curl)[side], range = (kind === 'press' ? settings.pressRange : settings.curlRange) / 100;
  return hands[side].ok && (d.state === 'hold' || (d.state === 'rising' && d.max - d.bottom >= range * 0.6));
}
function pairStep(kind, t, dt) {
  const P = DET.pair, D = kind === 'press' ? DET.pr : DET.curl;
  for (const side of ['left', 'right']) {
    const ev = armStep(kind, side, t, dt); if (!ev) continue;
    if (ev.msg) { if (!P.side) onPartial(ev.msg); continue; }
    const o = side === 'left' ? 'right' : 'left', od = D[o];
    if (P.side && P.side !== side && t - P.t <= PAIR_WIN) { const pow = Math.max(P.pow || 1, ev.pow || 1); onCharge(); onRep({ perfect: P.perfect && ev.perfect, fast: P.fast || ev.fast, pow }); P.side = null; }
    else if (!P.side && pairNear(kind, o)) { // la otra ya va arriba: cuenta ya (y la otra no contará otra vez al bajar)
      const hold = od.state === 'hold', pow = Math.max(ev.pow || 1, hold ? od.pow || 1 : 1);
      od.state = 'top'; onCharge(); onRep({ perfect: ev.perfect && hold && !!(od.ev && od.ev.perfect), fast: ev.fast, pow });
    }
    else Object.assign(P, { side, t, perfect: ev.perfect, fast: ev.fast, pow: ev.pow || 1 });
  }
  if (P.side) {
    const other = P.side === 'left' ? 'right' : 'left', lost = hands[other].ok ? 0 : (kind === 'press' ? DET.pr : DET.curl)[other].lost;
    if (lost > 0.3) { onCharge(); onRep({ perfect: false, fast: P.fast, pow: P.pow }); P.side = null; } // la otra mano no se ve: vale con una
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
  if (!T.pending) vertDetector(S, head.p.y, t, dt, { start: Math.min(0.08, req * 0.5), req, back: 0.05, partial: req * 0.4, perfectDur: settings.perfectTime, partialMsg: K.low || '¡Baja más!', defer: o => { T.hold = o; }, power: isCombat() && !pistolOn() && !swordActive() });
  if (S.state === 'down' && S.charged && !T.armed && !T.pending) { T.armed = true; T.ref = S.ref; for (const s of ['left', 'right']) { T.seen[s] = false; T.lostT[s] = 0; } }
  if (T.hold) { T.pending = T.hold; T.t0 = t; T.armed = false; }
  if (!T.pending && !T.armed) return;
  if (K.jump) { if (head.p.y - T.ref >= settings.jsqJump / 100 && JUMP.fastT < 0.3) T.seen.left = T.seen.right = true; }
  else for (const s of ['left', 'right']) {
    const h = hands[s];
    if (h.ok) {
      const r = h.wrist.y - head.p.y;
      arena.worldToLocal(_chw.copy(h.wrist)); if (K.ok(r, HL.z - _chw.z)) T.seen[s] = true; // f: cuánto está por delante de los ojos
      T.last[s] = r; T.lostT[s] = 0;
    } else { T.lostT[s] += dt; if (T.lostT[s] > 0.15 && K.lostOk(T.last[s])) T.seen[s] = true; }
  }
  if (!T.pending) return;
  const L = T.seen.left, R = T.seen.right, one = !K.both || T.lostT.left > 0.3 || T.lostT.right > 0.3;
  if ((L && R) || ((L || R) && one)) { onRep(T.pending); T.pending = null; if (K.jump) { T.quiet = t + 0.6; S.ref = T.ref; S.state = 'up'; } }
  else if (t - T.t0 > CH_WIN) { onPartial(K.miss); T.pending = null; }
}
// Peso muerto: bajar el peso con la cadera atrás (la cabeza baja dlDepth) carga y ponerse de pie dispara; como en la
// sentadilla, aguantar abajo da más fuerza. Solo con el visor: no hace falta ver las manos (la clave «dlrow» se queda, por
// los ajustes y el historial guardados de cuando llevaba remo)
function deadliftStep(t, dt) {
  const req = settings.dlDepth / 100;
  vertDetector(DET.sq, head.p.y, t, dt, { start: Math.min(0.08, req * 0.5), req, back: 0.05, partial: req * 0.4, perfectDur: settings.perfectTime, partialMsg: '¡Baja más el peso!', power: !pistolOn() && !swordActive() });
}
// Leñador: las manos juntas (con la kettlebell o el disco) bajan junto a una cadera y suben en diagonal por encima del
// hombro contrario. Abajo a un lado carga; arriba al otro lado dispara (en CHOP_WIN s). Alturas respecto a tu altura de pie
const CHOP_WIN = 2.5, _chp = new V3();
// Elevación frontal con una sola pesa (kettlebell, mancuerna, disco o barra) sujeta con las dos manos: las manos, juntas,
// suben desde los muslos con los brazos estirados al frente hasta la altura de los hombros. Se sigue el punto medio de
// las manos que se vean (con una basta: la pesa las tapa a veces) respecto a la cabeza; al empezar a subir carga y
// arriba dispara. Arriba tienen que estar lejos de la cara (brazos estirados): así un curl no cuenta
const _frm = new V3();
function fraiseStep(t, dt) {
  const d = DET.fr, range = settings.fraiseRange / 100; let n = 0; _frm.set(0, 0, 0);
  for (const s of ['left', 'right']) if (hands[s].ok) { _frm.add(hands[s].wrist); n++; }
  if (!n) { d.lost += dt; if (d.lost > 0.6) d.state = 'down'; return; }
  _frm.divideScalar(n); d.lost = 0;
  const r = _frm.y - head.p.y, fwd = Math.hypot(_frm.x - head.p.x, _frm.z - head.p.z);
  d.bottom += (r - d.bottom) * (r < d.bottom ? 0.5 : 0.0012); // lo más bajo del recorrido (se adapta a tu altura)
  if (d.state === 'down') { if (r > d.bottom + Math.min(0.1, range * 0.3)) { Object.assign(d, { state: 'rising', max: r, t0: t, fwd }); onCharge(); } }
  else if (d.state === 'rising') {
    d.max = Math.max(d.max, r); d.fwd = Math.max(d.fwd, fwd);
    if (r - d.bottom >= range) {
      if (d.fwd < 0.36) { onPartial('Brazos estirados: la pesa, al frente'); d.state = 'top'; return; }
      const dur = t - d.t0, pt = settings.perfectTime;
      onRep({ perfect: dur >= pt * 0.5 && dur < 5 && r - d.bottom >= range + 0.03, fast: pt > 0 && dur < pt * 0.25 }); d.state = 'top';
    } else if (r < d.bottom + 0.06) { d.state = 'down'; if (d.max - d.bottom > range * 0.55) onPartial('Sube hasta la altura de los hombros'); }
  } else if (r < d.bottom + Math.min(0.12, range * 0.3)) d.state = 'down'; // hay que bajarla para la siguiente
}
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
    // como en las flexiones, cuanto más aguantas abajo, más carga el disparo (×2, ×3, ×4)
    vertDetector(DET.sq, head.p.y, t, dt, { start: Math.min(0.08, req * 0.5), req, back: 0.05, partial: req * 0.4, perfectDur: pt, partialMsg: '¡Baja más!', power: !pistolOn() && !swordActive() });
  } else if (settings.exercise === 'lunge') {
    // zancada: como la sentadilla, con su propia bajada (y su carga al aguantar abajo); después de cada una toca la otra pierna
    const d = DET.lu, req = dv('lungeDepth') / 100, before = stats.reps;
    vertDetector(d, head.p.y, t, dt, { start: Math.min(0.08, req * 0.5), req, back: 0.05, partial: req * 0.4, perfectDur: pt, partialMsg: '¡Baja más la rodilla de atrás!', power: !pistolOn() && !swordActive() }); // (aguantar abajo también carga)
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
    // en dos tiempos (sentadilla con press o con elevación, swing, sentadilla con salto): bajar carga y el gesto al subir dispara
    chainStep(settings.exercise, t, dt);
  } else if (settings.exercise === 'fraise') {
    fraiseStep(t, dt);
  } else if (settings.exercise === 'chop') {
    chopStep(t, dt);
  } else if (settings.exercise === 'dlrow') {
    deadliftStep(t, dt);
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
// La mano se mide respecto a la cabeza en horizontal y respecto al suelo en altura (subir y bajar en la sentadilla no la
// mueve). Una sacudida es un acelerón por encima de THROW_V; empieza donde la mano iba por última vez por debajo de
// THROW_SLOW y acaba al frenar (por debajo de THROW_STOP del pico) o al recorrer THROW_LONG. THROW_JUMP: más rápido, es un salto del seguimiento
const THROW_V = 0.8, THROW_SLOW = 0.45, THROW_D = 0.1, THROW_LONG = 0.32, THROW_WIDE = 60, THROW_STOP = 0.75, THROW_JUMP = 15;
const mkThrow = () => ({ c: null, burst: false, have: false, lost: 0, peak: 0, cool: 0, hist: [], prev: new V3(), v: new V3(), from: new V3(), last: new V3(), lastR: new V3() });
const HTH = { left: mkThrow(), right: mkThrow(), idle: 0, taught: false, orbs: {} };
for (const s of ['left', 'right']) { const o = glowSprite(BOLT_COL[0], 0.07, 0.95); o.visible = false; o.renderOrder = 8; scene.add(o); HTH.orbs[s] = o; }
const _thr = new V3(), _thv = new V3(), _thf = new V3(), _thd = new V3();
const throwCount = () => (HTH.left.c ? 1 : 0) + (HTH.right.c ? 1 : 0);
function throwReset() { for (const s of ['left', 'right']) Object.assign(HTH[s], { c: null, burst: false, have: false, lost: 0, peak: 0, cool: 0, hist: [] }); HTH.idle = 0; HTH.taught = false; }
// La repetición carga las dos manos (en las gafas, aunque no se vea ninguna); en el ordenador sin manos devuelve false y dispara sola
function throwCharge(dmg, perfect, pow = 1) {
  if (!throwAim() || (!xrActive && !(hands.left.ok || hands.right.ok))) return false;
  for (const s of ['left', 'right']) { const T = HTH[s]; T.c = { dmg: Math.max(dmg, T.c ? T.c.dmg : 0), perfect: perfect || !!(T.c && T.c.perfect), pow: Math.max(pow, T.c ? T.c.pow : 1) }; }
  if (!HTH.taught) { HTH.taught = true; say('Mano atrás y lánzala hacia el enemigo', '#3cf0c6', 2.2); }
  HTH.idle = 0; boardDirty = true; return true;
}
// El blanco: el más cercano a la dirección del lanzamiento, hasta THROW_WIDE grados. Cuenta sobre todo hacia qué lado
// va la mano (en horizontal): la sacudida suele hacer un arco hacia arriba o hacia abajo, y eso no debe cambiar el blanco
const _ttd = new V3(), _ttv = new V3();
function throwTarget(o, d) {
  let best = null, bs = THROW_WIDE * Math.PI / 180; _ttd.set(d.x, d.y * 0.4, d.z);
  for (const e of enemies) {
    if (!e.alive) continue; const v = e.center(tmpA).sub(o), dist = v.length(); if (dist < 0.05) continue;
    const a = _ttv.set(v.x, v.y * 0.4, v.z).angleTo(_ttd) - Math.atan(e.radius * 1.3 / dist);
    if (a < bs) { bs = a; best = e; }
  }
  return best;
}
// Con «al que miras», el gesto dispara y la mirada elige: el enemigo que llevas un momento mirando, si la sacudida va más o
// menos hacia él (hasta THROW_WIDE grados, como cualquier blanco); si no miras a ninguno, el de la dirección de la mano
const throwByGaze = () => settings.throwPick !== 'hand' && !pistolOn();
function throwPickTarget(o, d) {
  const byHand = throwTarget(o, d); if (!byHand || !throwByGaze()) return byHand;
  const g = gazeLock(); if (!g) return byHand;
  const v = g.center(tmpA).sub(o); _ttv.set(v.x, v.y * 0.4, v.z); _ttd.set(d.x, d.y * 0.4, d.z);
  return _ttv.angleTo(_ttd) - Math.atan(g.radius * 1.3 / Math.max(0.05, v.length())) < THROW_WIDE * Math.PI / 180 ? g : byHand;
}
function throwFire(s, o, d, tg) {
  const T = HTH[s], c = T.c; if (!c) return;
  T.c = null; fireBolt(o, d, null, c.dmg, c.perfect, tg, c.pow || 1);
  gloves[s].pulse = 1; haptic(s, 0.7, 45); HTH.idle = 0; boardDirty = true;
}
// Lanza desde o en la dirección del recorrido d de la mano, si recorrió lo bastante y hay un enemigo hacia allí. Llevar
// la mano atrás para coger impulso no es un lanzamiento: la mano tiene que alejarse de ti (o ir hacia delante), nunca
// hacia atrás. Si no sale el rayo, el siguiente acelerón (el lanzamiento de verdad) se mide enseguida
function throwTry(s, o, d) {
  const T = HTH[s], len = d.length(), fw = d.x * _thf.x + d.z * _thf.z;
  const away = Math.hypot(T.lastR.x, T.lastR.z) - Math.hypot(T.from.x, T.from.z);
  // la dirección: la del recorrido entero, pero sobre todo la del último tramo (al soltar), que es la que lleva el rayo
  const t1 = T.hist.length ? T.hist[T.hist.length - 1] : null, t0 = t1 && T.hist.slice().reverse().find(x => t1.t - x.t >= 0.09);
  if (t0 && _thv.subVectors(t1.p, t0.p).length() > 0.04) d.normalize().multiplyScalar(0.4).addScaledVector(_thv.normalize(), 0.6);
  const ok = len > THROW_D && fw > -0.05 * len && (away > 0.03 || fw > 0.5 * len), tg = ok && throwPickTarget(o, d.normalize());
  T.burst = false; T.peak = 0; if (tg) { T.cool = 0.2; throwFire(s, o.clone(), d.clone(), tg); }
  T.hist.splice(0, T.hist.length - 1); // el siguiente acelerón se mide desde aquí, no desde antes de coger impulso
}
function throwStep(dt, t) {
  const on = throwAim() && ['play', 'rest', 'ready'].includes(state);
  _thf.set(0, 0, -1).applyAxisAngle(_up, arena.rotation.y); // hacia dónde mira el cuerpo
  for (const s of ['left', 'right']) {
    const T = HTH[s], h = hands[s], orb = HTH.orbs[s];
    orb.visible = on && h.ok && !!T.c;
    if (orb.visible) { const sc = 0.075 * (1 + 0.2 * (T.c.pow - 1)) * (1 + 0.15 * Math.sin(t * 18)); orb.position.copy(h.wrist).addScaledVector(_thf, 0.05); orb.scale.set(sc, sc, 1); orb.material.color.setHex(T.c.pow > 1 ? POW_COL[T.c.pow - 1] : BOLT_COL[T.c.perfect ? 1 : 0]); } // la carga de la sentadilla aguantada, por su color
    if (!on) { T.have = false; T.burst = false; continue; }
    if (!h.ok) { // perdida en plena sacudida: sale el rayo en la dirección que llevaba la mano, si va hacia un enemigo
      T.lost += dt;
      if (T.have && T.burst && T.lost < 0.25) throwTry(s, T.last, _thd.subVectors(T.lastR, T.from));
      if (T.lost > 0.3) { T.have = false; T.burst = false; T.hist.length = 0; }
      continue;
    }
    T.lost = 0; T.cool = Math.max(0, T.cool - dt);
    _thr.set(h.wrist.x - head.p.x, h.wrist.y, h.wrist.z - head.p.z); T.last.copy(h.wrist); T.lastR.copy(_thr);
    if (!T.have) { T.prev.copy(_thr); T.v.set(0, 0, 0); T.have = true; T.hist.length = 0; continue; }
    _thv.subVectors(_thr, T.prev).divideScalar(Math.max(dt, 1e-3)); T.prev.copy(_thr);
    if (_thv.length() > THROW_JUMP) continue; // salto del seguimiento: se ignora ese fotograma, sin estropear el gesto
    T.v.lerp(_thv, 0.6);
    const sp = T.v.length(); T.hist.push({ p: _thr.clone(), sp, t }); while (T.hist.length && t - T.hist[0].t > 0.5) T.hist.shift();
    if (!T.burst) {
      if (sp > THROW_V && !T.cool) { // empieza un acelerón: se mide desde la última vez que la mano iba despacio
        T.burst = true; T.peak = sp; let st = null, mn = T.hist[0]; // si nunca fue despacio, desde donde fue más despacio (el giro tras coger impulso)
        for (let i = T.hist.length - 1; i >= 0; i--) { if (T.hist[i].sp < THROW_SLOW) { st = T.hist[i]; break; } if (T.hist[i].sp < mn.sp) mn = T.hist[i]; }
        st = st || mn;
        T.from.copy(st.p);
      }
      continue;
    }
    T.peak = Math.max(T.peak, sp);
    // frenó de golpe, o ya recorrió bastante: si la sacudida va hacia un enemigo, sale el rayo; si no, la carga se queda
    if (sp < T.peak * THROW_STOP || _thd.subVectors(_thr, T.from).length() > THROW_LONG) throwTry(s, h.wrist, _thd.subVectors(_thr, T.from));
  }
  // al que miras: se sigue a quién miras y su contorno de neón lo marca (parpadea más deprisa si tienes carga)
  if (on && throwByGaze() && !(swordActive() && !pistolOn())) { // (con espada no hay diana)
    const e = gazeLockStep(t, head.p, fwd()), ring = locks.gaze;
    ring.visible = false; lockShow(e, throwCount() > 0); // (la diana: el contorno de neón, 78_lockline)
  }
  // cargado y sin lanzar: cada pocos segundos, recuérdalo
  if (on && throwCount() && state === 'play') { HTH.idle += dt; if (HTH.idle > 4) { HTH.idle = 0; say('¡Lanza el rayo! Mano atrás y adelante', '#ffd166', 1.4); } } else HTH.idle = 0;
}
// Mirada: no se fija el enemigo que cae en el centro en cada instante (al bajar y subir en la sentadilla la cabeza se
// mueve y la mirada baila), sino al que llevas un momento mirando: cada enemigo suma «atención» mientras cae cerca del
// centro (más cuanto más centrado) y la va perdiendo en menos de medio segundo; el fijado solo cambia cuando otro le
// supera con claridad, y el disparo va a él aunque en ese instante la mirada se haya desviado (se suelta si miras lejos
// de él un par de segundos)
const GZL = { e: null, att: new Map(), t: 0, d: new V3(0, 0, -1) };
function gazeLockStep(t, o, d) {
  const dt = clamp(t - GZL.t, 0, 0.1); GZL.t = t;
  const cone = Math.max(settings.assist, 5) * Math.PI / 180 * 1.6;
  for (const [e, a] of GZL.att) { const na = a * Math.exp(-dt / 0.4); if (!e.alive || na < 1e-3) GZL.att.delete(e); else GZL.att.set(e, na); }
  for (const e of enemies) {
    if (!e.alive) continue; const v = e.center(tmpA).sub(o), dist = v.length(); if (dist < 0.05) continue;
    const ang = v.angleTo(d) - Math.atan(e.radius * 1.3 / dist); if (ang < cone) GZL.att.set(e, (GZL.att.get(e) || 0) + dt * (1 - Math.max(0, ang) / cone));
  }
  let best = null, ba = 0; for (const [e, a] of GZL.att) if (a > ba) { ba = a; best = e; }
  let cur = GZL.e && GZL.e.alive ? GZL.e : null; const ca = cur ? GZL.att.get(cur) || 0 : 0;
  // mirando lejos del fijado (más de 3 conos) durante 2 s, se suelta; mirar al suelo un momento al bajar no lo suelta
  if (cur) { const v = cur.center(tmpA).sub(o); GZL.away = v.angleTo(d) > cone * 3 ? (GZL.away || 0) + dt : 0; if (GZL.away > 2) cur = null; }
  if (!cur) GZL.e = ba > 0.06 ? best : null; else if (best && best !== cur && ba > ca * 1.15 + 0.03) GZL.e = best; else GZL.e = cur;
  GZL.d.lerp(d, Math.min(1, dt * 10)).normalize(); // el punto de la mirada, sin temblores
  return GZL.e;
}
const gazeLock = () => GZL.e && GZL.e.alive ? GZL.e : null;
function updateAim(t) {
  // lanzando con la mano no hay láser (el gesto apunta); con espada tampoco ni diana: se corta de cerca
  const show = (aimManual() || pistolOn()) && ['ready', 'play', 'rest'].includes(state) && !(throwAim() && (hands.left.ok || hands.right.ok)) && !(swordActive() && !pistolOn());
  const srcs = show ? aimSources().filter(s => !swordIn(s.key)) : [], used = new Set(srcs.map(s => s.key));
  lasers.left.visible = lasers.right.visible = false;
  for (const k of ['left', 'right', 'gaze']) if (!used.has(k)) locks[k].visible = false;
  gazeDot.visible = false;
  for (const s of srcs) {
    const e = s.key === 'gaze' ? gazeLockStep(t, s.o, s.d) : findLock(s.o, s.d), ring = locks[s.key], hot = pistolOn() ? GUN.ammo > 0 : charged;
    if (s.key !== 'gaze') {
      const l = lasers[s.key]; l.visible = true; l.position.copy(s.o); l.quaternion.copy(hands[s.key].rayQ);
      l.scale.z = e ? e.center(tmpA).distanceTo(s.o) : 6; l.material.opacity = hot ? 0.6 : 0.3; l.material.color.setHex(pistolOn() && !hot ? 0xff6a3d : hot ? 0x3cf0c6 : 0x5ff5ff);
    } else { gazeDot.visible = true; gazeDot.position.copy(head.p).addScaledVector(GZL.d, 3); }
    ring.visible = false; lockShow(e, hot); // la diana: el contorno de neón del apuntado (78_lockline)
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
  fireBolt(src.key === 'gaze' ? head.p.clone().add(tmpA.set(0, -0.15, 0)).addScaledVector(fwdH(), 0.2) : src.o.clone(), src.d.clone(), src.key === 'gaze' ? head.p.clone() : null, perfect ? 2 : 1, perfect, src.key === 'gaze' ? gazeLock() : null);
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
    if (settings.arcPatterns) return arxPatterns(total);
    const lo = Math.min(dv('arcMin'), dv('arcMax')) / 100, hi = Math.max(dv('arcMin'), dv('arcMax')) / 100;
    for (let n = 0; n < total; n++) {
      if (Math.random() * 100 < settings.arcNew) { list.push({ kind: arxNewKind(), drop: rand(lo, hi), tilt: 0, hp: 1 }); continue; } // láser, paredes o rueda (por turnos)
      if (Math.random() * 100 < settings.arcJump) { list.push({ kind: 'jump', drop: 0, tilt: 0, hp: 1 }); continue; } // valla baja
      const tilt = Math.random() * 100 < settings.arcTilt ? 1 : 0;
      list.push({ kind: Math.random() * 100 < settings.arcDouble ? 'double' : 'single', drop: rand(lo, hi), tilt, hp: 1 });
    }
    // los inclinados, repartidos entre los dos lados en la proporción pedida (exacta, no al azar: si no, en una oleada
    // corta un lado puede salir muchas más veces), y en orden barajado
    const tl = list.filter(s => s.tilt), nR = Math.round(tl.length * settings.arcRight / 100), sides = tl.map((_, k) => k < nR ? 1 : -1);
    for (let k = sides.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [sides[k], sides[j]] = [sides[j], sides[k]]; }
    tl.forEach((s, k) => { s.tilt = sides[k] * rand(0.6, 1) * settings.arcTiltMax * Math.PI / 180; });
    return list;
  }
  if (twoShots()) total *= 2;
  let boss = null;
  const F = foes(), tiny = isTiny();
  // los de tierra (de las compuertas o, en el suelo, de las trampillas) y los voladores: repartidos entre los elegidos (en
  // Ajustes → Enemigos), bien mezclados; los drones, el doble que cada uno de los demás voladores (como antes, uno de cada
  // tres, avispones). Si solo sale una clase de tierra, el jefe es de esa clase
  const G = groundList().length ? groundList() : [tiny ? 'spider' : 'robot'], FL = flyList().filter(k => k !== 'dragon');
  const FK = FL.length ? FL : ['drone', 'hornet'], W = k => k === 'drone' ? 2 : 1;
  const deal = ks => { const acc = {}, sum = ks.reduce((a, k) => a + W(k), 0); ks.forEach(k => acc[k] = Math.random() * 0.5); return () => { let g = ks[0], top = -Infinity; for (const k of ks) { acc[k] += W(k) / sum; if (acc[k] > top) { top = acc[k]; g = k; } } acc[g] -= 1; return g; }; };
  const nextG = deal(G), nextF = deal(FK);
  if (isBossWave(i)) {
    const b = Math.max(4, Math.round(total * 0.3)), ground = F === 'robots' || (F === 'mix' && Math.floor(i / 5) % 2 === 0);
    const gb = k => tiny ? (k === 'spider' ? 'titan' : 'h' + k + 'boss') : { robot: 'titan', imp: 'impboss', puglin: 'impboss', thrower: 'impboss', zombie: 'zombieboss', raptor: 'raptorboss' }[k] || k + 'boss';
    const kind = !ground ? (flyList().includes('dragon') ? 'dragon' : 'carrier') : !tiny && G.includes('captain') ? 'captainboss' : G.length === 1 ? gb(G[0]) : G.includes(tiny ? 'spider' : 'robot') ? 'titan' : gb(pick(G));
    boss = { kind, hp: b }; total -= b;
  }
  let k = 0;
  while (total > 0) {
    let kind, hp;
    if (F === 'robots' || (F === 'mix' && k % 2 === 0)) {
      const g = nextG();
      if (tiny) { if (g === 'spider') { kind = k % 3 === 2 ? 'heavy' : 'scout'; hp = kind === 'heavy' ? 3 + Math.floor(i / 3) : 2 + Math.floor(i / 4); } else { kind = 'h' + g; hp = 1 + Math.floor(i / 4); } }
      else if (g === 'imp' || g === 'puglin') { kind = g; hp = kind === 'puglin' ? 1 + Math.floor(i / 4) : 2 + Math.floor(i / 3); }
      else if (g === 'thrower') { kind = 'impthrow'; hp = 2 + Math.floor(i / 3); }
      else if (g === 'raptor') { kind = 'raptor'; hp = 2 + Math.floor(i / 4); }
      else if (g === 'robot') { kind = k % 3 === 2 ? 'heavy' : 'scout'; hp = kind === 'heavy' ? 3 + Math.floor(i / 3) : 2 + Math.floor(i / 4); }
      else { kind = g; hp = (g === 'zchubby' || g === 'yeti' || g === 'cyclops' || g === 'captain' ? 3 : 2) + Math.floor(i / 3); } // zombis, monstruitos y piratas
    }
    else { const f = nextF(); kind = f === 'drone' && i >= 2 && k % 5 === 4 ? 'bomber' : f; hp = kind === 'bomber' || kind === 'cthulhu' ? 2 : 1; }
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
    if (spec.kind === 'laser' || spec.kind === 'walls') arcs.push(new ArcObs(spec.kind));
    else if (spec.kind === 'wheel') arcs.push(new Arc(spec.drop, 0, false, (Math.random() < 0.5 ? -1 : 1) * rand(0.6, 1) * Math.max(15, settings.arcTiltMax) * Math.PI / 180, false, (Math.random() < 0.5 ? -1 : 1) * rand(2.2, 3.4)));
    else { arcs.push(new Arc(spec.drop, 0, false, spec.tilt || 0, spec.kind === 'jump')); if (spec.kind === 'double') arcs.push(new Arc(spec.drop, 1.0, true, spec.tilt || 0)); }
    ARX.nextGap = spec.gap || 0; // la coreografía marca el hueco hasta el siguiente
    if (Math.random() * 100 < settings.arcOrbs) ARX.orbT = spawnInterval * (spec.gap || 1) * 0.5; // un orbe a medio camino
    return;
  }
  let e;
  if (isBars()) e = new HeadTarget(spec);
  else if ((ROBOT_KIND[spec.kind] || HATCH_KIND[spec.kind]) && isTiny()) {
    const H = HATCH_KIND[spec.kind], hatch = oneArm() ? sideHatch(stats.spawned++ % 2 === 0) : pick(liveHatches());
    if (H && !beastReady(H.beast)) spec.kind = H.boss ? 'titan' : 'scout'; // sin su modelo (cargando o sin conexión), una araña
    e = HATCH_KIND[spec.kind] ? new HatchBeast(spec, hatch) : new Spider(spec, hatch);
  }
  else if (ROBOT_KIND[spec.kind]) {
    if (ROBOT_KIND[spec.kind].beast3d && !beastReady(ROBOT_KIND[spec.kind].beast3d)) spec.kind = ROBOT_KIND[spec.kind].boss ? 'titan' : 'scout'; // sin los modelos (aún cargando o sin conexión), robots
    const g = ROBOT_KIND[spec.kind].boss ? (gates[1].on ? gates[1] : liveGates()[0]) : freeGate(); if (!g) { spawnQueue.unshift(spec); return; } e = ROBOT_KIND[spec.kind].beast3d ? new Beast(spec, g) : new Robot(spec, g); } // todas ocupadas: sale en cuanto se despeje una
  else { const K = FLYER_KIND[spec.kind]; if (K && K.beast && !beastReady(K.beast)) spec.kind = K.boss ? 'carrier' : 'hornet'; e = new Flyer(spec); }
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
  const nx = best || spawnQueue[0], d = nx ? nx.drop : 0, tl = nx ? Math.sign(nx.tiltEnd !== undefined ? nx.tiltEnd : nx.tilt || 0) : 0, j = !!nx && (nx.jump || nx.kind === 'jump');
  if (Math.abs(d - nextArcDrop) > 0.005 || tl !== nextArcTilt || j !== nextArcJump) { nextArcDrop = d; nextArcTilt = tl; nextArcJump = j; boardDirty = true; }
}

/* =================== FLUJO =================== */
function resetWorld() {
  enemies.forEach(e => { if (e.alive || e.mode === 'dying') e.dispose(); }); enemies = [];
  arcs.forEach(a => a.alive && a.dispose()); arcs = []; touchClear(); ARX.orbs.forEach(o => o.alive && o.dispose()); ARX.orbs = []; ARX.orbT = -1;
  projs = []; boltsClear(); rocksClear();
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
// Los ejercicios del modo, de cuatro en cuatro por fila (de tres si son muchos, para que se lean), en lista o por zona del cuerpo
function exerciseRows(back) {
  const pick = v => { setSetting('exercise', v); back(); }, rows = [];
  const add = (label, list) => { const per = list.length > 12 ? 3 : 4; list.forEach((x, i) => { if (i % per === 0) rows.push({ t: 'choice', label: i ? '' : label, value: settings.exercise, opts: [], onPick: pick }); rows[rows.length - 1].opts.push([x, EX_SHORT[x]]); }); };
  if (settings.exSort === 'body') for (const [name, list] of BODY_ZONES) add(name, list.filter(x => EX_NAMES[x] && exOk(settings.mode, x)));
  else add('Ejercicio', MODE_EX[settings.mode]);
  return rows;
}
// Qué enemigos salen, en pocas palabras (para el botón del menú principal)
function foesSummary() {
  const n = (l, src) => l.map(v => src.find(o => o[0] === v)).filter(Boolean).map(o => o[1]);
  if (oneArm()) return 'de las trampillas'; if (settings.exercise === 'superman') return 'voladores';
  const g = n(groundList(), isTiny() ? FOE_HATCH : FOE_GATE), f = n(flyList(), FOE_FLY), all = [...g, ...f];
  return !all.length ? (isTiny() ? 'arañas' : 'robots') : all.length <= 2 ? all.join(' y ') : foeOnly() === 'fly' ? 'solo voladores' : foeOnly() === 'ground' ? 'solo los que andan' : `${all.length} clases`;
}
// Elegir los enemigos: los de las compuertas, los de las trampillas y los voladores (cada uno se marca o se quita)
function foesMenu(back) {
  const rows = [{ t: 'title', text: 'ENEMIGOS' },
    { t: 'field', key: 'foeKind', after: () => foesMenu(back) },
    { t: 'text', text: 'Marca los que quieres. Los de las compuertas salen de pie; los de las trampillas, en flexiones y planchas sobre una mano.' },
    { t: 'field', key: 'foesGate', after: () => foesMenu(back) }, { t: 'field', key: 'foesHatch', after: () => foesMenu(back) }, { t: 'field', key: 'foesFly', after: () => foesMenu(back) },
    { t: 'text', text: animStatus() + (Object.values(BEAST_LOAD).includes('loading') ? ' · cargando los monstruos elegidos…' : '') },
    { t: 'btns', items: [{ label: 'Volver', onPress: back }] }];
  const m = openMenu(rows, { accent: MC.foes }); m.rebuild = () => foesMenu(back);
}
// Rangos: elegir uno pone sus valores (los suyos de serie o los que guardaste en él); si luego retocas algo, se ve
// «retocado» y puedes guardarlo en ese rango o volver a sus valores
const RANK_STORE = 'reparena3-ranks', RANK = { applying: false };
const rankIdx = (r = settings.rank) => Math.max(0, RANKS.findIndex(o => o[0] === r));
const rankName = (r = settings.rank) => RANKS[rankIdx(r)][1];
function rankVals(r = settings.rank) { const i = rankIdx(r), own = (store(RANK_STORE) || {})[r] || {}, o = {}; for (const k in RANK_VALS) o[k] = clampSetting(FIELD[k], own[k] !== undefined ? own[k] : RANK_VALS[k][i]); return o; } // (al paso de cada ajuste)
function applyRank() { RANK.applying = true; const v = rankVals(); for (const k in v) setSetting(k, v[k]); RANK.applying = false; comboPatchAll(v); } // (en todos los modos y ejercicios)
settingHooks.push(k => { if (k === 'rank' && !RANK.applying) applyRank(); });
const rankTouched = () => { const v = rankVals(); return Object.keys(v).some(k => Math.abs(settings[k] - v[k]) > 1e-6); };
function rankSave() { const all = store(RANK_STORE) || {}; all[settings.rank] = Object.fromEntries(Object.keys(RANK_VALS).map(k => [k, settings[k]])); store(RANK_STORE, all); }
function rankReset() { const all = store(RANK_STORE) || {}; delete all[settings.rank]; store(RANK_STORE, all); applyRank(); }
// Lo que el rango cambia en el modo elegido, en pocas palabras
function rankSummary() {
  const v = settings, L = [v.lives ? `${v.lives} ${v.lives === 1 ? 'vida' : 'vidas'}` : 'vidas infinitas'];
  if (isCombat()) L.push(`llegan en ${fmtNum(v.walkTime)} s`, `${v.maxAlive} a la vez`, `vuelo a ${fmtNum(v.flySpeed)} km/h`);
  else if (settings.mode === 'arcs') L.push(`${v.arcRate} arcos/min a ${fmtNum(v.arcSpeed)} km/h`, `espera máx. ${fmtNum(v.arcMaxGap)} s`);
  else if (settings.mode === 'touch') L.push(`llegan en ${fmtNum(v.tchArrive)} s`, `${fmtNum(v.tchWindow)} s para tocar`);
  else L.push(`llegan en ${fmtNum(v.barArrive)} s`, v.barWait ? `${v.barWait} s para reventar` : 'sin límite para reventar');
  L.push(v.ramp ? `+${v.ramp} % por oleada` : 'sin dificultad creciente'); return L.join(' · ');
}
function rankMenu(back) {
  const again = () => rankMenu(back), n = rankName(), cur = settings.rank, touched = rankTouched(), own = !!(store(RANK_STORE) || {})[cur];
  const pickRow = list => ({ t: 'btns', h: 0.066, items: list.map(([k, lab]) => ({ label: lab, badge: rankIdx(k), style: k === cur ? 'selected' : 'normal', onPress: () => { setSetting('rank', k); again(); } })) });
  const rows = [{ t: 'title', text: 'RANGO' }, { t: 'text', text: 'Del recluta (un galón, lo más fácil) al general (tres estrellas): cada rango pone toda la dificultad de una vez.' },
    pickRow(RANKS.slice(0, 4)), pickRow(RANKS.slice(4)),
    { t: 'text', text: `${n}${touched ? ' (retocado)' : own ? ' (tuyo)' : ''}: ${rankSummary()}`, color: '#ffd166' },
    { t: 'btns', items: [{ label: `Guardar mis ajustes en ${n}`, onPress: () => { rankSave(); say(`${n}: guardado con tus ajustes`, '#3cf0c6', 1.4); again(); } }, ...(touched || own ? [{ label: `Volver a ${n} de serie`, onPress: () => { rankReset(); again(); } }] : [])] },
    { t: 'btns', items: [{ label: 'Volver', onPress: back }] }];
  const m = openMenu(rows, { accent: '#ffd166' }); m.rebuild = again;
}
// Con qué atacas: las pistolas, las manos (o la puntería automática o con la mirada) y las espadas, en su submenú
const armsAny = () => SCHEMA.some(f => f.g === 'armas' && fieldVisible(f));
function armsSummary() {
  const sw = swordSet() ? (settings.sword === 'two' ? 'dos espadas' : 'espada') : '';
  if (pistolOn()) return settings.sword === 'one' && sw ? 'espada y bláster' : sw || 'pistolas';
  if (sw || !isCombat()) return sw || 'sin espadas';
  return autoAim() ? 'puntería automática' : settings.aim === 'gaze' ? 'con la mirada' : 'con las manos';
}
function armsMenu(back) {
  const again = () => armsMenu(back);
  const rows = [{ t: 'title', text: 'ARMAS' },
    ...SCHEMA.filter(f => f.g === 'armas' && fieldShown(f)).map(f => ({ t: 'field', key: f.key, star: true, after: f.relayout ? again : undefined })),
    { t: 'btns', items: [{ label: 'Volver', onPress: back }] }];
  const m = openMenu(rows, { accent: MC.arms }); m.rebuild = again;
}
function lobbyMenu() {
  endSession();
  state = 'lobby'; resetWorld(); center.mesh.visible = false; boardDayRefresh(); if (preview) previewBarPose(false);
  const bars = isBars(), hang = settings.exercise === 'hang', k = eqKind(), placed = eqPose(k).set;
  const n = eqName(k), start = () => { if (bars && !placed) startPlace(lobbyMenu, `Antes de empezar, coloca ${n.the}`); else beginRun(); };
  const rows = [
    { t: 'title', text: 'REPARENA' },
    { t: 'text', text: summaryText() },
    ...(progressLine() ? [{ t: 'text', text: progressLine(), color: '#3cf0c6' }] : []),
    { t: 'btns', items: [{ label: 'EMPEZAR', style: 'primary', onPress: start }], h: 0.08 },
    ...sessionRows(),
    { t: 'choice', label: 'Modo', value: settings.mode, opts: Object.entries(MODE_NAMES), onPick: v => { setSetting('mode', v); lobbyMenu(); } },
    { t: 'btns', items: [{ label: `Rango: ${rankName()}${rankTouched() ? ' (retocado)' : ''}  ▸`, badge: rankIdx(), onPress: () => rankMenu(lobbyMenu) }] },
    { t: 'btns', items: [{ label: `Ejercicio: ${EX_NAMES[settings.exercise]}  ▸`, accent: MC.ex, onPress: () => exerciseMenu(lobbyMenu) }] },
    // enemigos y armas, juntos en una fila (el menú queda más corto y al alcance)
    ...(isCombat() || armsAny() ? [{ t: 'btns', items: [
      ...(isCombat() ? [{ label: `Enemigos: ${foesSummary()}  ▸`, accent: MC.foes, onPress: () => foesMenu(lobbyMenu) }] : []),
      ...(armsAny() ? [{ label: `Armas: ${armsSummary()}  ▸`, accent: MC.arms, onPress: () => armsMenu(lobbyMenu) }] : [])] }] : []),
    { t: 'field', key: speedKey() },
    ...(foesHas('robots') && foesHas('flyers') ? [{ t: 'field', key: 'flySpeed' }] : []),
    settings.mode === 'arcs' ? { t: 'field', key: 'arcMax' } : bars && hang ? { t: 'field', key: 'hangInc' } : { t: 'field', key: 'repsWave' },
    ...(bars && hang ? [{ t: 'field', key: 'hangPit' }] : [])
  ];
  if (bars && !hang) rows.push({ t: 'field', key: 'barTarget' });
  if (settings.mode === 'touch') {
    if (settings.exercise === 'combo') rows.push({ t: 'field', key: 'comboBase', after: () => lobbyMenu() }, { t: 'field', key: { stand: 'comboStand', floor: 'comboFloor', abs: 'comboAbs' }[settings.comboBase] }, { t: 'field', key: 'comboOrder' });
    else rows.push({ t: 'field', key: 'tchHands' });
    if (settings.menuLevel !== 'simple') rows.push(...tempoRows(() => lobbyMenu())); // (en el sencillo, el ritmo está en Sonido)
  }
  if (bars) rows.push({ t: 'btns', items: [{ label: `Colocar ${n.name}`, style: placed ? 'normal' : 'primary', onPress: () => startPlace(lobbyMenu) }, ...(placed ? [{ label: 'Ajustar', onPress: () => { PLACE.note = ''; adjustMenu(lobbyMenu); } }] : [])] });
  // lo menos usado, en submenús: así el menú principal cabe al alcance de la mano
  const sub = [];
  // menú sencillo: fuera lo de afinar (sigue en Ajustes con el menú completo, o con ★ aquí)
  if (settings.menuLevel === 'simple') for (let i = rows.length - 1; i >= 0; i--) if (rows[i].t === 'field' && !fieldShown(FIELD[rows[i].key])) rows.splice(i, 1);
  rows.push(...favRows(new Set(rows.filter(r => r.t === 'field').map(r => r.key)), () => lobbyMenu())); // los ★ de los submenús
  // sonido y música (volúmenes, Spotify y ritmo), entorno y vista (escenario, marcador, habitación) y el resto de ajustes
  const rr = roomRows(lobbyMenu), roomBad = rr.some(r => r.t === 'text' && r.color === '#ffd166'); // la habitación no vale o falta colocarla
  if (roomBad) rows.push({ t: 'text', text: 'La habitación no está lista: mira «Entorno»', color: '#ffd166' });
  rows.push(...spMiniRows()); // con Spotify: lo que suena y sus controles (todo lo demás, en Sonido)
  sub.push({ label: 'Sonido  ▸', accent: MC.sound, onPress: () => soundMenu(lobbyMenu) }, { label: 'Entorno  ▸', accent: MC.scene, style: roomBad ? 'primary' : undefined, onPress: () => sceneMenu(lobbyMenu) },
    { label: 'Ajustes  ▸', accent: MC.set, onPress: () => settingsMenu(lobbyMenu) }, { label: 'Salir', style: 'danger', onPress: exitAll });
  rows.push({ t: 'btns', items: sub });
  if (bars) rows.push({ t: 'text', text: !placed ? `Primero coloca ${n.the}: pulsa Colocar` : `Comprueba que ${n.the} ${n.pl ? 'virtuales coinciden' : 'virtual coincide'} con la real; si no, pulsa Colocar`, color: !placed ? '#ffd166' : '#a49fc8' });
  const m = openMenu(rows);
  m.rebuild = () => lobbyMenu(); demoAttach(m); // al lado, la caricatura del ejercicio elegido
}
// Submenús del principal: elegir ejercicio, sonido y música, y entorno y vista; «Volver» deja el principal en el mismo sitio
function exerciseMenu(back) {
  const rows = [{ t: 'title', text: 'EJERCICIO' }, ...exerciseRows(back), { t: 'btns', items: [{ label: 'Volver', onPress: back }] }];
  const m = openMenu(rows, { accent: MC.ex }); m.rebuild = () => exerciseMenu(back); demoAttach(m);
}
// Todo lo que suena: Spotify, el ritmo (al compás o el de Spotify, en Toques y Combate) y los volúmenes
function soundMenu(back) {
  const again = () => soundMenu(back), beat = settings.mode === 'touch' || isCombat();
  const rows = [{ t: 'title', text: 'SONIDO Y MÚSICA' }, ...musicRows(),
    ...(spConnected() ? [] : [{ t: 'text', text: 'Spotify: conéctalo una vez en la página del juego (Sonido y música)', color: '#a49fc8' }]),
    ...(beat ? tempoRows(again) : [{ t: 'text', text: 'El ritmo de la música («Al compás» o el de Spotify) se marca en Toques y en Combate', color: '#a49fc8' }]), { t: 'field', key: 'volume', star: true }, { t: 'field', key: 'ambient', star: true }, { t: 'btns', items: [{ label: 'Volver', onPress: back }] }];
  const m = openMenu(rows, { accent: MC.sound }); m.rebuild = again;
}
// Dónde juegas: escenario, distancia, marcador, efectos y, en realidad mixta, la vista y la habitación (esta, solo fuera de la partida)
function sceneMenu(back, inGame) {
  const again = () => sceneMenu(back, inGame), room = ['roomMode', 'roomOcclude', 'roomShow'];
  const rows = [{ t: 'title', text: 'ENTORNO Y VISTA' }, ...viewRows(again),
    ...SCHEMA.filter(f => f.g === 'entorno' && !room.includes(f.key) && fieldShown(f)).map(f => ({ t: 'field', key: f.key, star: true })),
    ...(inGame ? [] : roomRows(again)), { t: 'btns', items: [{ label: 'Volver', onPress: back }] }];
  const m = openMenu(rows, { accent: MC.scene }); m.rebuild = again;
}
let settingsTab = uiPrefs().tab || 'partida'; // se recuerda la última pestaña
function settingsMenu(back, tab = settingsTab) {
  const groups = Object.keys(GROUP_NAMES).filter(g => !OWN_MENU.includes(g) && SCHEMA.some(f => f.g === g && fieldShown(f)));
  if (!groups.includes(tab)) tab = groups[0]; if (tab !== settingsTab) { settingsTab = tab; uiSave('tab', tab); PREFS.resetArm = ''; }
  const rows = [{ t: 'title', text: 'AJUSTES' }, { t: 'tabs', items: groups.map(g => ({ label: GROUP_TAB[g] || GROUP_NAMES[g], on: g === tab, onPress: () => settingsMenu(back, g) })) }];
  if (tab === 'cada') rows.push({ t: 'text', text: animStatus(), color: BEAST.ready ? '#3cf0c6' : '#ffd166' });
  SCHEMA.filter(f => f.g === tab && fieldShown(f)).forEach(f => rows.push({ t: 'field', key: f.key, star: true, after: f.relayout ? () => settingsMenu(back, tab) : undefined }));
  const simple = settings.menuLevel === 'simple'; // menú sencillo o completo, a un toque
  rows.push({ t: 'btns', items: [{ label: simple ? 'Ver todos los ajustes (menú completo)' : 'Ver solo lo básico (menú sencillo)', onPress: () => { setSetting('menuLevel', simple ? 'full' : 'simple'); settingsMenu(back, tab); } }] });
  rows.push({ t: 'text', text: 'Toca el número para escribirlo · desliza o usa − y + · ★ lo lleva al menú principal', color: '#a49fc8' });
  // restablecer esta pestaña (pulsando dos veces) y los perfiles (fuera de la partida: cambian el modo y el ejercicio)
  const armed = PREFS.resetArm === tab, tn = GROUP_TAB[tab] || GROUP_NAMES[tab], inGame = GAME_STATES.concat('paused').includes(state);
  rows.push({ t: 'btns', items: [
    ...(inGame ? [] : [{ label: 'Perfiles  ▸', accent: MC.prof, onPress: () => profilesMenu(() => settingsMenu(back, tab)) }]),
    { label: armed ? `¿Restablecer ${tn}? Otra vez` : `Restablecer ${tn}`, style: armed ? 'danger' : undefined, onPress: () => { if (armed) { PREFS.resetArm = ''; resetGroup(tab); say(`${GROUP_NAMES[tab]}: como venía`, '#3cf0c6', 1.6); } else PREFS.resetArm = tab; settingsMenu(back, tab); } },
    { label: 'Volver', style: 'primary', onPress: () => { PREFS.resetArm = ''; back(); } }] });
  const m = openMenu(rows, { accent: MC.set }); m.rebuild = () => settingsMenu(back, tab);
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
    ...spMiniRows(), // la música, sin salir de la pausa
    { t: 'btns', items: [{ label: 'Sonido  ▸', accent: MC.sound, onPress: () => soundMenu(() => pauseMenu()) }, { label: 'Entorno  ▸', accent: MC.scene, onPress: () => sceneMenu(() => pauseMenu(), true) }, { label: 'Ajustes  ▸', accent: MC.set, onPress: () => settingsMenu(() => pauseMenu()) }] },
    { t: 'btns', items: [{ label: bars ? 'Volver a colgarme' : 'Recalibrar', accent: MC.body, onPress: recal }, ...(bars ? [{ label: `Ajustar ${eqName().name}`, onPress: () => { PLACE.note = ''; adjustMenu(() => pauseMenu()); } }] : [])] },
    ...(SES.active ? [{ t: 'btns', items: [{ label: 'Terminar bloque', onPress: () => { hideMenu(); endRun(false, true); } }, { label: 'Terminar sesión', style: 'danger', onPress: () => { hideMenu(); SES.stop = true; endRun(false, true); } }] }] : []),
    { t: 'btns', items: [{ label: SES.active ? 'Saltar al menú' : 'Terminar ronda', onPress: () => { hideMenu(); if (SES.active) { saveRun(false); lobbyMenu(); } else endRun(false, true); } }, { label: 'Menú principal', onPress: () => { saveRun(false); lobbyMenu(); } }, { label: 'Salir del juego', style: 'danger', onPress: () => { saveRun(false); exitAll(); } }] }
  ], { border: '#ffd166' });
  m.rebuild = () => pauseMenu();
}
// Antes de cada ronda (mientras calibras) se compilan los sombreadores de todo lo que puede salir: si no, el primer robot,
// el primer monstruo o la primera pompa se compilan en plena partida y la imagen da un tirón en las gafas. Las copias se
// guardan (sin pintarse): así sus programas no se borran y no hay que volver a compilarlos
const WARM = { done: new Set(), keep: [], q: [], rt: null };
// Lo que hay que precompilar: cada clase de enemigo (con sus materiales), las pompas y las amebas. Se hace poco a poco,
// uno por fotograma, desde que entras (en el menú y mientras calibras): todo de golpe al pulsar Empezar dejaba la imagen
// congelada unos segundos en las gafas. Los monstruos que aún se están descargando se añaden cuando llegan
function warmQueue() {
  if (!renderer.compile) return; ensureRigs();
  const add = (key, mk) => { if (!WARM.done.has(key) && !WARM.q.some(x => x.key === key)) WARM.q.push({ key, mk }); };
  for (const k in ROBOT_KIND) { const K = ROBOT_KIND[k], R = RIGS[K.rig]; if (R && R.instance && (!K.beast3d || BEAST.kinds[K.beast3d])) add('r:' + K.rig, () => R.instance(MAT_ROBOT)); }
  for (const k in FLYER_KIND) { const K = FLYER_KIND[k]; if (K.beast) { if (BEAST.kinds[K.beast]) add('f:' + K.beast, () => beastFlyer(K.beast)); } else if (RIGS[K.rig]) add('f:' + k, () => RIGS[K.rig].instance(k === 'hornet' ? MAT_STINGER : MAT_DRONE)); }
  if (RIGS.spider) add('spider', () => RIGS.spider.instance({ main: M.chitinSkin, pat: M.abdomenSkin, gloss: M.glossSkin, glow: M.glowSkin }));
  if (RIGS.scout) add('lockline', () => { const o = RIGS.scout.instance(MAT_ROBOT); for (const m of lklAttach(o.root)) m.visible = true; return o; }); // (el contorno de la diana)
  add('bubble', () => new THREE.Mesh(bubbleGeo, bubbleMat())); add('ameba', () => new THREE.Mesh(amebaGeo, waterRingMat(0x3cf0c6)));
}
// Uno de la cola: compilar sus sombreadores con las luces de la escena y, con sombras, pintar su sombra una vez (lo que
// tiene esqueleto usa otro sombreador para la sombra, que solo se compila al pintarla: un dibujo diminuto, fuera de la vista)
function warmStep() {
  const it = WARM.q.shift(); if (!it) return false; if (WARM.done.has(it.key)) return true;
  try {
    const o = it.mk(); WARM.done.add(it.key); if (!o) return true;
    const g = new THREE.Group(); g.add(o.root || o); g.traverse(n => { n.frustumCulled = false; }); g.position.set(0, -80, 0);
    scene.add(g); renderer.compile(scene, camera); scene.remove(g); WARM.keep.push(g);
    if (renderer.shadowMap.enabled && renderer.setRenderTarget && THREE.WebGLRenderTarget) {
      const rt = WARM.rt || (WARM.rt = new THREE.WebGLRenderTarget(16, 16)), prev = renderer.getRenderTarget(), xr = renderer.xr.enabled;
      g.position.set(0, 0, -2); arena.add(g); renderer.xr.enabled = false; renderer.setRenderTarget(rt); renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera); renderer.setRenderTarget(prev); renderer.xr.enabled = xr; arena.remove(g); g.position.set(0, -80, 0);
    }
  } catch (e) { console.warn('No se pudo precompilar', it.key, e && e.message); }
  return true;
}
// todo lo que quede, de una vez (si empieza la partida antes de acabar la cola)
function warmShaders() { warmQueue(); let n = 0; while (WARM.q.length && n++ < 60) warmStep(); }
function beginRun() {
  audioInit(); resetWorld(); hideMenu(); lastAnchor = null; sceneryNewRun(); applyEnvMode(); runSaved = false; spRoundStart(); // al acabar, el resumen sale delante de donde estés
  waveIdx = 0; lives = settings.lives || 0; score = 0; combo = 0; calibT = 0; waveDone = 0; waveTarget = 0;
  stats = newStats(); SUP_ATK.next = 0; guardReset(); gunReset(); swordReset(); throwReset(); arxReset(); BEAT.off = null; BEAT.last = -1; boardDayRefresh(); Object.assign(RAMP, { lvl: 0, note: '', up: false });
  if (swordSet()) say('Espadas: despeja el espacio a tu alrededor y ponte la correa de los mandos', '#ffd166', 3.5);
  DET.sq.state = DET.pu.state = DET.lu.state = DET.di.state = 'up'; DET.curl.left.state = DET.curl.right.state = DET.pr.left.state = DET.pr.right.state = 'down'; DET.pl.left.state = DET.pl.right.state = 'down'; DET.su.state = 'down'; DET.fr.state = 'down'; Object.assign(DET.th, { pending: null, armed: false, quiet: 0 }); DET.ch.state = 'idle'; Object.assign(DET.dl, { armed: false, was: false, rowing: false, o: null }); Object.assign(DET.tw, { last: null, acc: 0, lo: 0, hi: 0, dir: 0, n: 0, t0: -1, lostT: 0, first: false, ext: 0 });
  stateT = 0; boardDirty = true;
  if (isBars()) { if (preview) previewBarPose(true); barReset(); barToMount(0); }
  else if (preview) { pvPose(); arenaFromHead(); PV.home = camera.position.clone(); TCH.ref = head.p.y; DET.sq.ref = DET.pu.ref = DET.pl.ref = DET.su.ref = DET.lu.ref = DET.di.ref = DET.sp.ref = head.p.y; calibRef = settings.exercise === 'pushup' ? 1.6 : head.p.y; state = 'ready'; }
  else state = 'calib';
  center.mesh.visible = true; drawCenter();
  if (settings.exercise === 'inchworm') { if (preview) arenaFromHead(); iwLayout(); }
  warmQueue(); // (lo que falte se compila poco a poco mientras calibras; nada en plena partida)
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
// De pie, mientras calibras, el entorno se queda quieto (las compuertas no acompañan a la cabeza) y, al calibrar, se
// desliza en poco menos de un segundo hasta quedar delante de ti; en el suelo o sentado, se va colocando a tu alrededor
const ARG = { t: 0, from: null, to: null };
const standingEx = () => !isFloor() && !isSeated() && !isSupine() && !isBars();
function arenaGlideToHead() {
  const from = { x: arena.position.x, z: arena.position.z, y: arena.rotation.y }; arenaFromHead();
  ARG.to = { x: arena.position.x, z: arena.position.z, y: arena.rotation.y }; ARG.from = from; ARG.t = 1e-4;
  arena.position.x = from.x; arena.position.z = from.z; arena.rotation.y = from.y;
}
function arenaGlide(dt) {
  if (!ARG.t) return; ARG.t = Math.min(1, ARG.t + dt / 0.8); const k = smooth(ARG.t), F = ARG.from, T = ARG.to;
  arena.position.x = lerp(F.x, T.x, k); arena.position.z = lerp(F.z, T.z, k); arena.rotation.y = F.y + wrapAng(T.y - F.y) * k;
  if (ARG.t >= 1) ARG.t = 0;
}
function arenaFollow(dt) {
  if (standingEx()) return;
  const k = Math.min(1, dt * 4);
  const o = IW_OFF(), y = arena.rotation.y;
  arena.position.x += (head.p.x - Math.sin(y) * o - arena.position.x) * k; arena.position.z += (head.p.z - Math.cos(y) * o - arena.position.z) * k;
  arena.rotation.y += wrapAng(bodyYaw() - arena.rotation.y) * k;
}
function calibrate() {
  if (standingEx() && !preview) arenaGlideToHead(); else arenaFromHead();
  const y = head.p.y; DET.sq.ref = DET.pu.ref = DET.lu.ref = DET.di.ref = y; if (!isFloor() && !isSeated() && y > 1.1) { calibRef = y; lastStandY = y; }
  if (settings.exercise === 'inchworm') { arenaFromHead(); iwLayout(); } // la plancha, según tu altura
  Object.assign(DET.tw, { last: null, acc: 0, lo: 0, hi: 0, dir: 0, n: 0, t0: -1, lostT: 0, first: false, ext: 0 });
  for (const s of ['left', 'right']) if (hands[s].ok) { DET.curl[s].bottom = DET.pr[s].bottom = hands[s].wrist.y - y; DET.pl[s].floor = hands[s].wrist.y; }
  DET.sp.ref = y;
  DET.pl.ref = y; DET.su.ref = DET.su.lo = y; TCH.ref = y;
  state = 'ready'; stateT = 0; SND.charge(); boardDirty = true;
}
// Dificultad creciente: sube un nivel por cada oleada superada con soltura (pocos golpes, fallos o caídas en ella); si te
// han dado mucho, o la has perdido, la siguiente sigue igual. Se ve al empezar cada oleada, en el marcador y en el resumen
function rampWaveEnd(ok) {
  RAMP.up = false; RAMP.note = ''; if (!(settings.ramp > 0)) return;
  const bad = stats.taken - RAMP.t0 + stats.falls - RAMP.f0, lim = Math.max(2, Math.round(0.2 * (waveTarget || 10)));
  if (ok && bad <= lim) { RAMP.lvl++; RAMP.up = true; RAMP.note = `Próxima oleada: +${Math.round(Math.min(RAMP_CAP, settings.ramp / 100 * RAMP.lvl) * 100)} % de dificultad`; }
  else RAMP.note = ok ? `Te han dado ${bad} veces: la próxima, igual de difícil` : 'La próxima, igual de difícil';
}
function startWave(i) {
  waveIdx = i; spawnQueue = buildWave(i); waveTarget = waveReps(i); waveDone = 0;
  if (isBars()) { BAR.hold = 0; BAR.need = settings.exercise === 'hang' ? hangSecs(i) : 0; spawnInterval = repTimeOf(settings.exercise, 'bars'); }
  else if (settings.mode === 'arcs') spawnInterval = 60 / dv('arcRate');
  else if (settings.mode === 'touch') touchStartWave();
  else {
    const avgHp = spawnQueue.reduce((a, e) => a + e.hp, 0) / Math.max(1, spawnQueue.length);
    const auto = foes() === 'flyers' ? repTime() * (twoShots() ? 0.55 : 0.95) : clamp(avgHp * repTime() * 0.85, 1.0, 15);
    spawnInterval = (settings.spawnGap > 0 ? settings.spawnGap : swordWalk() ? Math.min(auto, 3) : auto) / (1 + rampK() * 0.35); // con espada, uno detrás de otro; con la dificultad creciente, algo más seguidos
  }
  RAMP.t0 = stats.taken; RAMP.f0 = stats.falls; RAMP.note = '';
  if (WARM.q.length) warmShaders(); // (si quedaba algo por compilar, ahora, antes de que lleguen)
  spawnTimer = 0.6; state = 'play'; stateT = 0; const rk = rampK(); say(rk ? `OLEADA ${i + 1} · +${Math.round(rk * 100)} % DIFICULTAD` : `OLEADA ${i + 1}`, '#ffd166', 1.6); center.mesh.visible = false; SND.horn();
}
function hurtPlayer(src) {
  if (guardAbsorb(src)) return; // parado por la guardia, una esquiva o el escudo (77_guard)
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
  store(HIST_KEY, h.slice(-400)); boardDayRefresh();
}
// Calorías de esta ronda (estimadas) y la línea de progreso: lo de hoy y la racha de días
const runStatsKcal = () => kcalOf(settings.exercise, stats.work, stats.time - stats.work);
// Lo de hoy para el marcador: lo ya guardado hoy, tu mejor día con este ejercicio (sin contar hoy) y la racha; la
// ronda en curso se suma en vivo mientras no esté guardada
const DAYB = { time: 0, kcal: 0, ex: 0, best: 0, streak: 0 };
function boardDayRefresh() {
  const h = store(HIST_KEY) || [], now = Date.now(), today = dayKey(now), x = settings.exercise, by = new Map();
  DAYB.time = DAYB.kcal = DAYB.ex = 0;
  for (const r of h) {
    const k = dayKey(r.date);
    if (k === today) { DAYB.time += r.time || 0; DAYB.kcal += runKcal(r); if (r.ex === x) DAYB.ex += r.reps || 0; }
    else if (r.ex === x) by.set(k, (by.get(k) || 0) + (r.reps || 0));
  }
  DAYB.best = Math.max(0, ...by.values()); DAYB.streak = progress(h, now).streak; boardDirty = true;
}
function boardDay() {
  const L = !runSaved && GAME_STATES.concat('paused').includes(state), hang = settings.exercise === 'hang';
  return { time: DAYB.time + (L ? stats.time : 0), kcal: DAYB.kcal + (L ? runStatsKcal() : 0), n: DAYB.ex + (L ? Math.floor(hang ? stats.hold : stats.reps) : 0), best: DAYB.best, streak: Math.max(DAYB.streak, L && stats.time > 0 && !DAYB.time ? DAYB.streak + 1 : 0) };
}
settingHooks.push(k => { if (k === 'exercise' || k === 'mode' || k === '*') boardDayRefresh(); });
function progressLine(P = progress()) {
  return P.today.runs ? `Hoy: ${fmtDur(P.today.time)} · ≈ ${Math.round(P.today.kcal)} kcal · racha ${daysTxt(P.streak)}` : P.streak ? `Racha: ${daysTxt(P.streak)} (entrena hoy para seguirla)` : '';
}
function endRun(win, manual) {
  const h = store(HIST_KEY) || [], prevBest = h.filter(r => r.ex === settings.exercise).reduce((a, r) => Math.max(a, r.reps), 0), P0 = progress(h);
  saveRun(win);
  const P = progress(), streakUp = P.streak > P0.streak && P.streak > 1;
  state = 'end'; center.mesh.visible = false; chargeOrb.visible = false; spawnQueue = []; boardDirty = true;
  AUD.loops.forEach(l => l.stop()); if (!SES.active) spRoundEnd(); // (en una sesión, al acabar el último bloque)
  const mm = Math.floor(stats.time / 60), ss = String(Math.round(stats.time % 60)).padStart(2, '0');
  const hang = settings.exercise === 'hang', got = hang ? Math.round(stats.hold) : stats.reps, bars = isBars();
  const pr = stats.reps ? stats.perfect / stats.reps : 0, acc = isCombat() && stats.shots ? Math.round(100 * stats.hits / stats.shots) : null;
  const AX = settings.mode === 'arcs' ? arxEnd() : null; // (medalla, metros, orbes y fantasma)
  const tiles = AX ? [[stats.perfect, 'perfectas'], [stats.taken, 'golpes'], [`${AX.dist} m`, 'recorridos']] : hang ? [[stats.falls, 'caídas'], [`${stats.bestCombo} s`, 'racha máxima'], [waveIdx + (win ? 1 : 0), 'oleadas superadas']]
    : bars ? [[stats.kills, 'reventados'], [stats.falls, 'caídas'], [`×${stats.bestCombo}`, 'combo máximo']]
    : isCombat() ? [[stats.kills, 'derribados'], [acc === null ? '—' : acc + ' %', 'precisión'], [`×${stats.bestCombo}`, 'combo máximo']]
    : [[stats.perfect, 'perfectas'], [stats.partial, 'a medias'], [`×${stats.bestCombo}`, 'combo máximo']];
  const S = { win, manual, hang, got, unit: hang ? 's colgado' : 'repeticiones', ex: EX_NAMES[settings.exercise] + ' · ' + MODE_NAMES[settings.mode] + ' · ' + rankName() + (rankTouched() ? ' (retocado)' : ''),
    sub: !win && !manual ? `Has caído en la oleada ${waveIdx + 1}${settings.waves ? ` de ${settings.waves}` : ''}` : win ? 'Zona despejada' : 'Ronda terminada',
    pct: hang ? null : Math.round(pr * 100), stars: got ? 1 + (pr >= 0.5 || (hang && stats.falls === 0) ? 1 : 0) + (win && (hang ? stats.falls === 0 : pr >= 0.75) ? 1 : 0) : 0,
    tiles: [...tiles, [`${mm}:${ss}`, 'tiempo'], [`≈ ${Math.round(runStatsKcal())}`, 'kcal'], [score, 'puntos']],
    chips: [got > prevBest && prevBest > 0 ? ['¡Nuevo récord!', '#ffd166'] : null, streakUp ? [`${P.streak} días seguidos${P.streak >= P.best ? ' · tu mejor racha' : ''}`, '#3cf0c6'] : null,
      RAMP.lvl && settings.ramp > 0 ? [`Dificultad +${Math.round(Math.min(RAMP_CAP, settings.ramp / 100 * RAMP.lvl) * 100)} %`, '#ff8a3d'] : null,
      AX && AX.medal ? [`Medalla de ${AX.medal[0]}`, AX.medal[1]] : null, AX && AX.orbs ? [`${AX.orbs} orbes`, '#ffd166'] : null, AX && AX.farther ? ['¡Más lejos que nunca!', '#3cf0c6'] : null].filter(Boolean),
    today: progressLine(P) };
  if (win) SND.victory(); else if (!manual) { SND.defeat(); hapticBoth(1, 450); }
  const go = () => SES.active ? sessionBlockDone(win, manual) : endMenu(win ? '¡VICTORIA!' : manual ? 'RESUMEN' : 'DERROTA', S); // en una sesión, al siguiente bloque
  if (SES.active && (manual || win)) go(); else showOutcome(win, go, manual); // en una sesión, entre bloques ya hay su pantalla de descanso
}
/* ---------- Final de la ronda, con sensación de juego ---------- */
// Al terminar (al perder todas las vidas, al ganar o al terminarla tú) todo funde a negro, del todo y para siempre: el
// negro se queda hasta que eliges qué hacer y solo se ve el resumen (y tus manos, para pulsarlo). Al perder, «DERROTA»
// grande delante de ti y, a los 2,6 s, el resumen; al ganar, «¡VICTORIA!» dorado y el resumen al poco; al terminarla
// tú, el resumen enseguida
const OUT = { t: -1, win: false, manual: false, go: null, done: false };
OUT.veil = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: THREE.BackSide, fog: false }));
OUT.veil.renderOrder = RO.menu - 2; OUT.veil.visible = false; scene.add(OUT.veil);
// Ya en negro, una esfera opaca alrededor de la cabeza que se pinta encima de todo lo opaco y deja su profundidad: lo
// transparente que quede más lejos (halos, partículas, el marcador) no se ve, y el menú y las manos (que se pintan
// después) quedan dentro. Su radio sigue al menú
OUT.black = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), new THREE.MeshBasicMaterial({ color: 0x000000, depthFunc: THREE.AlwaysDepth, side: THREE.BackSide, fog: false }));
OUT.black.renderOrder = 50; OUT.black.frustumCulled = false; OUT.black.visible = false; scene.add(OUT.black);
OUT.title = makePanel(1.3, 0.42, 1024, { depthTest: false }); OUT.title.mesh.renderOrder = RO.menu - 1; OUT.title.mesh.visible = false; scene.add(OUT.title.mesh);
function outcomeDraw(win) {
  const P = OUT.title, c = P.ctx, W = P.W, H = P.H, t = win ? '¡VICTORIA!' : 'DERROTA', col = win ? '#ffd166' : '#ff3b4e';
  c.clearRect(0, 0, W, H); c.textAlign = 'center'; c.textBaseline = 'middle';
  fitFont(c, t, W - 60, 170, '%px ' + FD); c.save(); c.shadowColor = col; c.shadowBlur = 40; c.fillStyle = col; c.fillText(t, W / 2, H * 0.42); c.restore();
  c.fillStyle = '#eeeaff'; fitFont(c, win ? 'Has superado todas las oleadas' : 'Te han quitado todas las vidas', W - 80, 44, '500 %px ' + FB); c.fillText(win ? 'Has superado todas las oleadas' : 'Te han quitado todas las vidas', W / 2, H * 0.84);
  P.tex.needsUpdate = true;
}
function showOutcome(win, go, manual = false) {
  hideMenu(); Object.assign(OUT, { t: 0, win, manual, go, done: false, cleared: false }); if (!manual) outcomeDraw(win);
  toastP.mesh.visible = false; WARN.p.mesh.visible = false; hurtT = 0; // ningún aviso encima del negro
  OUT.veil.visible = true; OUT.veil.material.opacity = 0; OUT.black.visible = false; OUT.title.mesh.material.opacity = 0; OUT.title.mesh.visible = false;
  OUT.title.mesh.position.copy(head.p).addScaledVector(fwdH(), 1.6); OUT.title.mesh.position.y = head.p.y + 0.05; OUT.title.mesh.lookAt(head.p); // delante de ti
}
const OUT_FADE = { win: 0.8, lose: 1.0, manual: 0.35 }, OUT_DELAY = { win: 1.8, lose: 2.6, manual: 0.35 }, _ob = new V3();
function updateOutcome(dt) {
  if (OUT.t < 0) return;
  if (state !== 'end') { outcomeClear(); return; } // otra ronda, el menú principal o el siguiente bloque: se quita
  OUT.t += dt; const t = OUT.t, k = OUT.manual ? 'manual' : OUT.win ? 'win' : 'lose', delay = OUT_DELAY[k];
  const a = smooth(Math.min(1, t / OUT_FADE[k])), black = a >= 1;
  if (black && !OUT.cleared) { OUT.cleared = true; resetWorld(); } // a oscuras ya no queda nada de la partida
  OUT.veil.position.copy(head.p); OUT.veil.material.opacity = a; OUT.veil.visible = !black; OUT.black.visible = black;
  if (black) { let R = 0.9; if (menu && menu.group) R = Math.max(R, menu.group.getWorldPosition(_ob).distanceTo(head.p) + 0.6); OUT.black.position.copy(head.p); OUT.black.scale.setScalar(R); }
  const m = OUT.title.mesh; m.material.opacity = OUT.manual || t < 0.4 ? 0 : t < delay ? Math.min(1, (t - 0.4) / 0.5) : Math.max(0, 1 - (t - delay) / 0.4);
  m.scale.setScalar(1 + 0.1 * Math.max(0, 1 - Math.max(0, t - 0.4) / 0.6)); m.visible = m.material.opacity > 0.01;
  if (!OUT.done && t >= delay) { OUT.done = true; const go = OUT.go; OUT.go = null; if (go) go(); }
}
function outcomeClear() { OUT.t = -1; OUT.cleared = false; OUT.veil.visible = false; OUT.black.visible = false; OUT.title.mesh.visible = false; }
// El resumen: una ficha con el número grande (repeticiones o segundos colgado), las estrellas y el porcentaje de perfectas,
// seis casillas con lo demás y los logros; debajo, los botones. Se queda hasta que pulses uno (sin cuenta atrás)
function summaryDraw(S, c, x, y, w, h) {
  const gold = '#ffd166', teal = '#3cf0c6', pink = '#ff4fa3', ink = '#eeeaff', dim = '#a49fc8';
  c.textBaseline = 'middle'; c.textAlign = 'center';
  c.fillStyle = dim; fitFont(c, S.ex, w - 40, 28, '500 %px ' + FB); c.fillText(S.ex, x + w / 2, y + 22);
  c.fillStyle = S.win ? teal : S.manual ? ink : '#ff8a8a'; fitFont(c, S.sub, w - 40, 30, '600 %px ' + FB); c.fillText(S.sub, x + w / 2, y + 60);
  // el número grande, con su brillo
  const hy = y + 92, hh = h * 0.36; rr(c, x + 10, hy, w - 20, hh, 26); c.fillStyle = 'rgba(255,209,102,0.07)'; c.fill(); c.lineWidth = 3; c.strokeStyle = 'rgba(255,209,102,0.35)'; c.stroke();
  const nx = x + w * 0.3; c.save(); c.shadowColor = gold; c.shadowBlur = 24; c.fillStyle = gold; fitFont(c, String(S.got), w * 0.42, Math.round(hh * 0.62), '%px ' + FD); c.fillText(String(S.got), nx, hy + hh * 0.43); c.restore();
  c.fillStyle = ink; fitFont(c, S.unit, w * 0.42, 30, '500 %px ' + FB); c.fillText(S.unit, nx, hy + hh * 0.82);
  // estrellas y perfectas
  const sx = x + w * 0.72, star = (cx, cy, r, on) => { c.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rad = k % 2 ? r * 0.45 : r; c.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); } c.closePath(); c.fillStyle = on ? gold : 'rgba(255,255,255,0.12)'; c.fill(); };
  for (let k = 0; k < 3; k++) star(sx + (k - 1) * hh * 0.34, hy + hh * 0.33, hh * 0.15, k < S.stars);
  if (S.pct !== null) {
    const bw = w * 0.36, bx = sx - bw / 2, by = hy + hh * 0.66; rr(c, bx, by, bw, 18, 9); c.fillStyle = 'rgba(255,255,255,0.1)'; c.fill();
    if (S.pct > 0) { rr(c, bx, by, Math.max(18, bw * S.pct / 100), 18, 9); c.fillStyle = teal; c.fill(); }
    c.fillStyle = ink; fitFont(c, `${S.pct} % perfectas`, bw, 28, '600 %px ' + FB); c.fillText(`${S.pct} % perfectas`, sx, by + 44);
  } else { c.fillStyle = ink; c.font = '600 28px ' + FB; c.fillText(S.win ? '¡Aguantaste!' : '¡Sigue así!', sx, hy + hh * 0.72); }
  // seis casillas
  const gy = hy + hh + 16, cols = 3, gap = 12, tw = (w - 20 - gap * (cols - 1)) / cols, th = (h - (gy - y) - 70 - gap) / 2, cc = [teal, pink, gold, '#a68bff', '#7ee081', '#5ab8ff'];
  S.tiles.forEach(([v, l], k) => {
    const tx = x + 10 + (k % cols) * (tw + gap), ty = gy + Math.floor(k / cols) * (th + gap);
    rr(c, tx, ty, tw, th, 18); c.fillStyle = 'rgba(255,255,255,0.05)'; c.fill(); rr(c, tx, ty + th * 0.18, 7, th * 0.64, 4); c.fillStyle = cc[k]; c.fill();
    c.fillStyle = ink; fitFont(c, String(v), tw - 40, Math.round(th * 0.42), '700 %px ' + FB); c.fillText(String(v), tx + tw / 2 + 4, ty + th * 0.42);
    c.fillStyle = dim; fitFont(c, l, tw - 30, Math.round(th * 0.27), '500 %px ' + FB); c.fillText(l, tx + tw / 2 + 4, ty + th * 0.78);
  });
  // logros (récord, racha, dificultad) o, si no hay, lo de hoy
  const cy0 = y + h - 32, chips = (S.chips.length ? S.chips : S.today ? [[S.today, dim]] : []).slice(0, 3); // (caben tres)
  c.font = '600 26px ' + FB; const cw = chips.map(([t]) => Math.min(w - 20, c.measureText(t).width + 44)), tot = cw.reduce((a, b) => a + b, 0) + 12 * Math.max(0, chips.length - 1);
  let cx = x + (w - Math.min(w, tot)) / 2;
  chips.forEach(([t, col], k) => { rr(c, cx, cy0 - 22, cw[k], 44, 22); c.fillStyle = 'rgba(255,255,255,0.06)'; c.fill(); c.lineWidth = 3; c.strokeStyle = col; c.stroke(); c.fillStyle = col; fitFont(c, t, cw[k] - 30, 26, '600 %px ' + FB); c.fillText(t, cx + cw[k] / 2, cy0 + 1); cx += cw[k] + 12; });
}
function endMenu(title, S) {
  const rows = [{ t: 'title', text: title, color: title === 'DERROTA' ? '#ff4a6a' : '#ffd166' },
    { t: 'canvas', h: 0.43, text: [S.ex, S.sub, `${S.got} ${S.unit}`, ...S.tiles.map(([v, l]) => `${v} ${l}`), ...S.chips.map(([t]) => t), S.today].filter(Boolean).join(' · '), draw: (c, x, y, w, h) => summaryDraw(S, c, x, y, w, h) },
    ...(S.lines || []).map(l => ({ t: 'text', text: l, color: '#a49fc8' })),
    { t: 'btns', items: [{ label: 'Otra ronda', style: 'primary', onPress: () => beginRun() }, { label: 'Menú principal', onPress: () => lobbyMenu() }, { label: 'Salir del juego', style: 'danger', onPress: exitAll }] }];
  const m = openMenu(rows, { accent: title === 'DERROTA' ? '#ff4a6a' : '#ffd166' }); m.rebuild = () => endMenu(title, S);
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
  arenaGlide(dt);
  if (state === 'calib') {
    arenaFollow(dt);
    const ok = settings.exercise === 'twist' ? head.p.y > 0.55 && hands.left.ok && hands.right.ok : isSeated() ? head.p.y > 0.55 && head.p.y < 1.5 : !isFloor() ? head.p.y > 1.1 : isSupine() ? head.p.y < 0.6 && head.p.y > 0.03 : (head.p.y < 1.0 && head.p.y > (settings.exercise === 'superman' ? 0.04 : 0.15));
    if (ok && head.speed < 0.07) calibT += dt; else calibT = Math.max(0, calibT - dt * 2);
    if (calibT >= 2) calibrate();
  } else if (state === 'ready') { if (stateT >= 3) startWave(0); }
  else if (state === 'between') sessionStep(dt);
  else if (state === 'mount') barMountStep(dt);
  // (el marcador se redibuja cada segundo: lleva el tiempo de hoy)
  if (['ready', 'play', 'rest'].includes(state)) { if (state !== 'ready') { stats.time += dt; if ((stats.time | 0) !== ((stats.time - dt) | 0)) boardDirty = true; } if (state === 'play') stats.work += dt; runDetectors(t, dt); }
  iwVisual(t);
  if (settings.mode === 'touch') touchStep(dt, t);
  if (state === 'play') {
    spawnTimer -= dt;
    const alive = settings.mode === 'arcs' ? 0 : enemies.filter(e => e.alive).length;
    beatStep(dt); // con ritmo, los enemigos salen en el pulso
    if (spawnTimer <= 0 && spawnQueue.length && settings.mode !== 'touch' && alive < (isBars() ? 2 : dv('maxAlive')) && (!beatP() || BEAT.hit)) { spawnFromQueue(); spawnTimer = settings.mode === 'arcs' ? Math.min(spawnInterval * (ARX.nextGap || arcGap()), settings.arcMaxGap) : isBars() ? barGap() : spawnInterval * rand(0.8, 1.2); boardDirty = true; }
    const anyLeft = settings.mode === 'arcs' ? arcs.some(a => a.alive && !a.judged) : settings.mode === 'touch' ? touchLeft() : enemies.some(e => e.alive);
    if (settings.exercise === 'hang' ? BAR.hold >= BAR.need || BAR.failed : !spawnQueue.length && !anyLeft && !projs.length) {
      // remolino: si te engulló, la oleada termina sin superarla y hay que volver a colgarse
      rampWaveEnd(!BAR.failed);
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
    GAMEF.n++; for (const e of enemies) if (e.alive || e.mode === 'dying') e.update(dt, t);
    enemies = enemies.filter(e => (e.alive || (e.mode === 'dying' && !e.gone)));
    for (const a of arcs) if (a.alive) a.update(dt, t);
    arcs = arcs.filter(a => a.alive);
    updateProjectiles(dt); updateRocks(dt);
    updateGates(dt, t); guardStep(dt, t);
  }
  if (SPLEGS.fem) {
    SPLEGS.n = 0; for (const e of enemies) if (e.type === 'spider') e.drawLegs();
    SPLEGS.fem.count = SPLEGS.tib.count = SPLEGS.n; if (SPLEGS.n) { SPLEGS.fem.instanceMatrix.needsUpdate = true; SPLEGS.tib.instanceMatrix.needsUpdate = true; }
  }
  if (settings.mode === 'arcs') { updateNextArc(); jumpTrack(dt); }
  arxStep(dt, t);
  const f = fwdH();
  if (isFloor() && head.p.y < 1) chargeOrb.position.copy(head.p).addScaledVector(f, 0.28).add(tmpA.set(0, -0.2, 0));
  else chargeOrb.position.copy(head.p).addScaledVector(f, 0.42).add(tmpA.set(0, -0.36, 0));
  if (chargeOrb.visible) { const s = 0.15 + (chargePow - 1) * 0.07 + Math.sin(t * (10 + chargePow * 4)) * 0.03; chargeOrb.scale.set(s, s, 1); }
}
