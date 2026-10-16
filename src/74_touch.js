
/* =================== MODO TOQUES: AROS PARA LA CABEZA Y GEMAS PARA LAS MANOS =================== */
// Aquí no se dispara: vienen hacia ti aros que ondulan como burbujas (mete la cabeza por el hueco) y gemas
// con una mano dibujada (tócalas con cualquier mano). Llegan a la altura que obliga a hacer el movimiento:
// abajo en la sentadilla o la flexión, arriba en el salto, en el arco del abdominal (o girados, en los
// oblicuos). Cada uno espera un momento delante de ti; si no lo tocas, pasa de largo y te golpea.
// Con un ritmo (BPM) llegan justo en el pulso.
let touches = [];
const TCH = { ref: 1.6, clock: 0, nextArrive: 0, seq: 0, taps: [], beat0: 0 };
const TCH_COL = { head: 0x3cf0c6, hand: 0xff9a3c };
const perfNow = () => performance.now() / 1000;
const tchPeriod = () => settings.bpm > 0 ? 60 / settings.bpm : 0;
// Movimientos de cada ejercicio: los de la cabeza (aros) y los de las manos (gemas)
const TCH_MOVES = { squat: [['squat'], ['punch']], lunge: [['lunge'], ['punch']], jump: [['jump'], ['reach']], abs: [['crunch', 'twist'], ['knee']], pushup: [['push'], ['tap']] };
const HAND_MOVES = ['punch', 'reach', 'tap', 'knee'];
const comboMoves = () => String(settings[{ stand: 'comboStand', floor: 'comboFloor', abs: 'comboAbs' }[settings.comboBase]] || '').split(',').filter(Boolean);

/* ---------- Aspecto ---------- */
const ringHaloTex = texFrom((() => { const c = mkCanvas(256), x = c.getContext('2d'), g = x.createRadialGradient(128, 128, 60, 128, 128, 128); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.45, 'rgba(255,255,255,0.55)'); g.addColorStop(0.62, 'rgba(255,255,255,0.15)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256); return c; })());
// Silueta de cabeza dentro del aro y mano dibujada en la gema: la forma dice con qué se toca
const headIconTex = texFrom((() => { const c = mkCanvas(128), x = c.getContext('2d'); x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.arc(64, 50, 24, 0, TAU); x.fill(); x.beginPath(); x.moveTo(22, 120); x.quadraticCurveTo(26, 82, 64, 80); x.quadraticCurveTo(102, 82, 106, 120); x.closePath(); x.fill(); return c; })());
const handIconTex = texFrom((() => {
  const c = mkCanvas(128), x = c.getContext('2d'); x.fillStyle = '#fff';
  rr(x, 34, 58, 60, 52, 18); x.fill(); // palma
  [[36, 22, 46], [52, 12, 52], [68, 14, 50], [84, 24, 42]].forEach(([fx_, fy, fh]) => { rr(x, fx_, fy, 13, fh, 6.5); x.fill(); });
  x.save(); x.translate(36, 84); x.rotate(-0.9); rr(x, -6, -36, 13, 36, 6.5); x.fill(); x.restore(); // pulgar
  return c;
})());
const gemGeo = new THREE.OctahedronGeometry(1, 0);
const _tq = new Q4(), _tz = new V3(0, 0, 1), _tv = new V3(), _tw = new V3();
// Aro con el borde grueso que ondula: un toro cuyos vértices se mueven cada fotograma
function makeWobbleRing() {
  const geo = new THREE.TorusGeometry(1, 0.2, 8, 40), pos = geo.attributes.position;
  const base = Float32Array.from(pos.array), ang = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) ang[i] = Math.atan2(base[i * 3 + 1], base[i * 3]);
  return { geo, base, ang };
}
function wobbleRing(R, t, amp, pulse) {
  const p = R.geo.attributes.position.array, b = R.base;
  for (let i = 0; i < R.ang.length; i++) {
    const a = R.ang[i], cx = Math.cos(a), cy = Math.sin(a);
    const rr_ = 1 + pulse * 0.08 + amp * (0.07 * Math.sin(3 * a + t * 2.3) + 0.045 * Math.sin(5 * a - t * 3.1));
    const th = 1 + amp * 0.35 * Math.sin(4 * a - t * 2.7);
    const ox = b[i * 3] - cx, oy = b[i * 3 + 1] - cy, oz = b[i * 3 + 2];
    p[i * 3] = cx * rr_ + ox * th; p[i * 3 + 1] = cy * rr_ + oy * th; p[i * 3 + 2] = oz * th;
  }
  R.geo.attributes.position.needsUpdate = true;
}

/* ---------- Dónde aparece cada movimiento (coordenadas de la arena: tú en el origen, mirando a -Z) ---------- */
function moveSpec(move) {
  const r = settings.tchRing / 100, S = TCH.ref, D = arMode ? 4 : 6.5, side = Math.random() < 0.5 ? -1 : 1;
  const sd = settings.squatDepth / 100, pd = settings.pushDepth / 100, jh = settings.jumpHeight / 100;
  const o = { move, part: HAND_MOVES.includes(move) ? 'hand' : 'head', n: new V3(0, 0, 1), r, hold: 0 };
  const rin = r * 0.75; // la cabeza está dentro si su centro cae a menos de esto del centro del aro
  if (move === 'lunge') { const ld = settings.lungeDepth / 100, lo = rin + 0.05; o.pos = new V3(rand(-0.06, 0.06), S - rand(Math.max(lo, ld * 0.55), Math.max(lo + 0.03, ld)), -0.3); } // un paso por delante
  else if (move === 'squat') { const lo = rin + 0.05; o.pos = new V3(rand(-0.08, 0.08), S - rand(Math.max(lo, sd * 0.55), Math.max(lo + 0.03, sd)), -0.05); }
  else if (move === 'jump') o.pos = new V3(rand(-0.06, 0.06), S + jh + rin, -0.08);
  else if (move === 'punch') o.pos = new V3(side * rand(0.15, 0.3), S - 0.3 + rand(-0.05, 0.05), -0.45);
  else if (move === 'reach') o.pos = new V3(side * rand(0.2, 0.35), S + 0.5 + jh, -0.2);
  else if (move === 'push' || move === 'plank') {
    o.r = clamp(r * 0.65, 0.07, 0.13); const ri = o.r * 0.75;
    o.pos = move === 'push' ? new V3(0, S - rand(Math.max(ri + 0.03, pd * 0.6), Math.max(ri + 0.05, pd)), -0.06) : new V3(0, S, -0.06);
    if (move === 'plank') { o.r *= 1.15; o.hold = settings.plankHold; }
  } else if (move === 'tap') o.pos = new V3(side * rand(0.25, 0.35), Math.max(0.12, S - 0.15), -0.2);
  else { // boca arriba: la cabeza gira alrededor de la cadera (a R por debajo, hacia los pies)
    const R = clamp(standHeadY() * 0.34, 0.45, 0.65), hip = new V3(0, S, -R);
    if (move === 'knee') o.pos = new V3(side * rand(0, 0.15), S + 0.3 + rand(0, 0.1), -R - 0.3);
    else {
      const th = rand(settings.abMin, Math.max(settings.abMin, settings.abMax)) * Math.PI / 180;
      const ph = move === 'twist' ? side * rand(0.5, 1) * settings.abTwist * Math.PI / 180 : 0;
      o.pos = hip.clone().add(new V3(R * Math.sin(th) * Math.sin(ph), R * Math.sin(th) * Math.cos(ph), R * Math.cos(th)));
      o.n.set(Math.cos(th) * Math.sin(ph), Math.cos(th) * Math.cos(ph), -Math.sin(th)).normalize().negate(); // de cara a ti
    }
  }
  const far = isFloor() ? 3.5 : D;
  o.from = isSupine() ? new V3(o.pos.x * 1.5, o.pos.y + 0.6, -3.5) : new V3(o.pos.x * 1.6, isFloor() ? Math.max(0.12, o.pos.y) : o.pos.y, -far);
  return o;
}

/* ---------- Objetivo ---------- */
class TouchTarget {
  constructor(move, arriveAt) {
    Object.assign(this, moveSpec(move));
    Object.assign(this, { alive: true, judged: false, mode: 'approach', spawnT: TCH.clock, arriveAt, win: settings.tchWindow, held: 0, outT: 0, popT: 0, ph: rand(0, TAU) });
    const col = TCH_COL[this.part];
    this.root = new THREE.Group(); this.root.position.copy(this.from); arena.add(this.root);
    if (this.part === 'head') {
      this.R = makeWobbleRing();
      this.mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, toneMapped: false });
      this.ring = new THREE.Mesh(this.R.geo, this.mat); this.ring.scale.setScalar(this.r * 1.25); this.root.add(this.ring);
      this.haloMat = new THREE.MeshBasicMaterial({ map: ringHaloTex, color: col, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
      this.halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.haloMat); this.halo.scale.setScalar(this.r * 3.6); this.root.add(this.halo);
      this.iconMat = new THREE.MeshBasicMaterial({ map: headIconTex, color: col, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
      const icon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.iconMat); icon.scale.setScalar(this.r * 1.1); this.root.add(icon);
      this.root.quaternion.setFromUnitVectors(_tz, this.n);
    } else {
      this.mat = std({ color: col, emissive: col, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.3, flatShading: true });
      this.gem = new THREE.Mesh(gemGeo, this.mat); this.gem.scale.set(0.05, 0.075, 0.05); this.root.add(this.gem);
      this.glow = glowSprite(col, 0.28, 0.7); this.root.add(this.glow);
      this.icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: handIconTex, color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false })); this.icon.scale.set(0.07, 0.07, 1); this.icon.position.y = 0.11; this.root.add(this.icon);
    }
  }
  center(out) { return this.root.getWorldPosition(out); }
  // ¿Está tocando? Cabeza: su centro dentro del hueco del aro; mano: la punta del índice (o la muñeca) en la gema
  touching() {
    if (this.part === 'head') {
      _tv.subVectors(HL, this.root.position); _tw.set(0, 0, 1).applyQuaternion(this.root.quaternion);
      const dp = _tv.dot(_tw); _tv.addScaledVector(_tw, -dp);
      this.rad = _tv.length() / (this.r * 0.75);
      return Math.abs(dp) < 0.15 && this.rad < 1;
    }
    for (const s of ['left', 'right']) {
      const h = hands[s]; if (!h.ok) continue;
      arena.worldToLocal(_tv.copy(h.tipOk ? h.tip : h.wrist));
      if (_tv.distanceTo(this.root.position) < 0.11) return true;
    }
    return false;
  }
  update(dt, t) {
    const c = TCH.clock, play = state === 'play' || state === 'rest';
    if (this.mode === 'approach') {
      const k = clamp((c - this.spawnT) / Math.max(0.1, this.arriveAt - this.spawnT), 0, 1), e = 1 - Math.pow(1 - k, 3);
      this.root.position.lerpVectors(this.from, this.pos, e);
      // también vale tocarlo mientras viaja, si atinas
      if (play && this.touching()) { if (this.hold) { this.mode = 'hold'; SND.charge(); } else this.hit(); }
      else if (k >= 1) { this.mode = 'wait'; if (tchPeriod()) SND.tick(); }
    } else if (this.mode === 'wait') {
      this.root.position.copy(this.pos);
      if (play && this.touching()) { if (this.hold) { this.mode = 'hold'; SND.charge(); } else this.hit(); }
      else if (c > this.arriveAt + this.win) this.miss();
    } else if (this.mode === 'hold') { // plancha: aguanta la cabeza dentro
      if (this.touching()) { this.outT = 0; this.held += dt; } else this.outT += dt;
      if (this.held >= this.hold) this.hit();
      else if (this.outT > 0.6) this.miss();
      else if (Math.floor(this.held) !== Math.floor(this.held - dt)) { const left = Math.ceil(this.hold - this.held); say(`Aguanta ${left}`, '#ffd166', 0.6, true); SND.beep(1 + (this.hold - left) * 0.1); }
    } else if (this.mode === 'pass') {
      // fallado: se aleja un poco hacia ti, se encoge y se apaga (no te atraviesa la cara)
      this.popT += dt; this.root.position.addScaledVector(this.dir, dt * 0.8); this.root.position.y -= dt * 0.3;
      const f = 1 - this.popT / 0.5; this.root.scale.setScalar(Math.max(0.05, 0.3 + 0.7 * f));
      this.mat.opacity = Math.max(0, f) * 0.9; if (this.haloMat) this.haloMat.opacity = Math.max(0, f) * 0.5;
      if (f <= 0) { this.dispose(); return; }
    }
    // ondula; con ritmo, late en cada pulso
    const P = tchPeriod(), ph_ = P ? ((((perfNow() - TCH.beat0) / P) % 1) + 1) % 1 : 1, pulse = P ? Math.exp(-ph_ * 6) : 0;
    if (this.R) {
      const near = this.mode === 'wait' || this.mode === 'hold';
      wobbleRing(this.R, t + this.ph, near ? 1.4 : 1, pulse);
      if (this.mode === 'hold') { const k = this.held / this.hold; this.mat.color.setRGB(0.24 + 0.76 * k, 0.94 + 0.06 * k, 0.78 + 0.22 * k); }
      this.haloMat.opacity = this.mode === 'pass' ? this.haloMat.opacity : (near ? 0.85 : 0.55) + pulse * 0.3;
    } else if (this.gem) {
      this.gem.rotation.y += dt * 2.2; this.gem.rotation.x = Math.sin(t * 1.3 + this.ph) * 0.3;
      const s = 1 + pulse * 0.25 + (this.mode === 'wait' ? 0.12 * Math.sin(t * 9) : 0); this.gem.scale.set(0.05 * s, 0.075 * s, 0.05 * s);
    }
  }
  hit() {
    if (this.judged) return; this.judged = true;
    const c = this.center(new V3()), col = TCH_COL[this.part], rgb = [((col >> 16) & 255) / 255, ((col >> 8) & 255) / 255, (col & 255) / 255];
    const P = tchPeriod(), dt_ = Math.abs(TCH.clock - this.arriveAt);
    const perfect = this.hold ? this.outT === 0 : P ? dt_ < 0.15 : this.part === 'head' ? this.rad < 0.5 : dt_ < 0.3;
    registerRep(perfect, false); stats.kills++;
    say(perfect ? '¡PERFECTO!' : this.hold ? '¡Aguantado!' : '¡Bien!', perfect ? '#3cf0c6' : '#ffffff', 0.8, !perfect);
    if (perfect) SND.perfect();
    SND.pop(c, !!this.hold); fx.droplets(c, this.part === 'head' ? 26 : 16, rgb, 1.6, 0.03); fx.sparks(c, 10, rgb, 1.5, 0.025); fx.glow(c, rgb, 0.35, 0.15);
    this.dispose();
  }
  miss() {
    if (this.judged) return; this.judged = true; this.mode = 'pass'; this.popT = 0;
    this.dir = this.pos.clone().sub(this.from).normalize(); this.mat.color.setHex(0xff3b5c); if (this.haloMat) this.haloMat.color.setHex(0xff3b5c);
    fx.sparks(this.center(new V3()), 8, [1, 0.25, 0.3], 1, 0.02);
    if (state === 'play' || state === 'rest') { hurtPlayer({ silent: true }); say(this.hold ? '¡Has salido del aro!' : this.part === 'head' ? '¡Mete la cabeza en el aro!' : '¡Toca la gema!', '#ff3b5c', 1.1); }
  }
  dispose() {
    this.alive = false; arena.remove(this.root);
    if (this.R) { this.R.geo.dispose(); this.haloMat.dispose(); this.iconMat.dispose(); this.halo.geometry.dispose(); }
    this.mat.dispose(); if (this.icon) this.icon.material.dispose(); if (this.glow) this.glow.material.dispose();
  }
}

/* ---------- Oleadas y llegada ---------- */
function buildTouchWave(i) {
  const n = waveReps(i), list = [];
  if (settings.exercise === 'combo') {
    const mv = comboMoves();
    for (let k = 0; k < n; k++) list.push({ move: settings.comboOrder === 'seq' ? mv[(TCH.seq++) % mv.length] : pick(mv), hp: 1 });
  } else {
    const [head, hand] = TCH_MOVES[settings.exercise] || TCH_MOVES.squat;
    for (let k = 0; k < n; k++) list.push({ move: Math.random() * 100 < settings.tchHands ? pick(hand) : pick(head), hp: 1 });
  }
  return list;
}
// Con ritmo, el instante (en el reloj del juego) del primer pulso a partir de c
function snapBeat(c) {
  const P = tchPeriod(); if (!P) return c;
  const off = perfNow() - TCH.clock, at = c + off, k = Math.ceil((at - TCH.beat0) / P - 1e-6);
  return TCH.beat0 + k * P - off;
}
function tchGapFor(move) {
  const P = tchPeriod(), base = settings.tchGap + (move === 'plank' ? settings.plankHold : 0);
  return P ? Math.max(1, Math.round(base / P)) * P : base;
}
function touchStartWave() { TCH.nextArrive = snapBeat(TCH.clock + settings.tchArrive + 0.6); }
function touchStep(dt, t) {
  if (state !== 'paused') TCH.clock += dt;
  if (state === 'play' && spawnQueue.length && TCH.clock >= TCH.nextArrive - settings.tchArrive) {
    const spec = spawnQueue.shift(); touches.push(new TouchTarget(spec.move, Math.max(TCH.nextArrive, TCH.clock + 0.3)));
    TCH.nextArrive = Math.max(TCH.nextArrive, TCH.clock) + tchGapFor(spec.move); boardDirty = true;
  }
  if (state !== 'paused') { for (const x of touches) if (x.alive) x.update(dt, t); touches = touches.filter(x => x.alive); }
}
const touchLeft = () => touches.some(x => x.alive && !x.judged);
function touchClear() { touches.forEach(x => x.alive && x.dispose()); touches = []; }
// En el ordenador: hacia dónde llevar la cabeza (Espacio) o la mano (G) para tocar el siguiente objetivo
function touchAssist(part) {
  let best = null;
  for (const x of touches) if (x.alive && !x.judged && x.part === part && (x.mode !== 'approach' || TCH.clock > x.arriveAt - 0.6) && (!best || x.arriveAt < best.arriveAt)) best = x;
  return best ? arena.localToWorld(best.pos.clone()) : null;
}

/* ---------- Ritmo: tocando al compás o preguntando a Spotify ---------- */
function tapTempo() {
  const now = perfNow(); TCH.taps = TCH.taps.filter(x => now - x < 3.5); TCH.taps.push(now); SND.tick();
  if (TCH.taps.length >= 4) {
    const d = []; for (let i = 1; i < TCH.taps.length; i++) d.push(TCH.taps[i] - TCH.taps[i - 1]);
    d.sort((a, b) => a - b); const med = d[d.length >> 1];
    if (med > 0.25 && med < 1.6) { setSetting('bpm', Math.round(60 / med)); TCH.beat0 = now; return true; }
  }
  return false;
}
async function spotifyTempo() {
  try {
    const r = await spTempo(); if (!r) return 'Spotify no da el ritmo a las apps nuevas: márcalo tocando al compás';
    setSetting('bpm', Math.round(r.bpm)); if (r.beat0 != null) TCH.beat0 = r.beat0;
    return `Ritmo de la canción: ${Math.round(r.bpm)} BPM` + (r.beat0 == null ? ' (toca al compás para encajar el pulso)' : '');
  } catch (e) { return spErrText(e); }
}
function tempoRows(back) {
  const P = settings.bpm;
  const rows = [{ t: 'text', text: P ? `Ritmo: ${P} BPM · los objetivos llegan en el pulso` : 'Ritmo libre · toca «Al compás» 4 veces siguiendo la música', color: '#ffd166' }];
  const items = [{ label: TCH.taps.length && perfNow() - TCH.taps[TCH.taps.length - 1] < 3.5 ? `Al compás (${TCH.taps.length})` : 'Al compás', onPress: () => { tapTempo(); back(); } }];
  if (spConnected()) items.push({ label: 'Ritmo de Spotify', onPress: () => { spotifyTempo().then(m => { say(m, '#ffd166', 3); back(); }); } });
  if (P) items.push({ label: 'Sin ritmo', onPress: () => { setSetting('bpm', 0); back(); } });
  rows.push({ t: 'btns', items });
  return rows;
}
