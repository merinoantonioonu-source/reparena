
/* =================== MODO TOQUES: AMEBAS DE AGUA PARA LA CABEZA Y DIAMANTES PARA LAS MANOS =================== */
// Aquí no se dispara: vienen hacia ti amebas de agua con forma de aro que ondulan (mete la cabeza por el hueco) y
// diamantes con la mano que los toca dibujada (izquierda azul, derecha naranja). Llegan a la altura que obliga a hacer
// el movimiento: abajo en la sentadilla o la flexión, arriba en el salto, en el arco del abdominal (o girados, en los
// oblicuos). Cada uno espera un momento delante de ti; si no lo tocas, pasa de largo y te golpea.
// Entre un toque y el siguiente hay que volver a la postura de partida: tras reventar una ameba con un abdominal, la
// siguiente no cuenta hasta que la cabeza haya vuelto al suelo; tras un diamante, esa mano tiene que volver atrás.
// Con un ritmo (BPM) llegan justo en el pulso.
let touches = [];
const mkArm = () => ({ armed: true, move: '', hitP: new V3(), lostT: 0, prev: [], cur: [], n: 0, had: false });
const TCH = { ref: 1.6, clock: 0, nextArrive: 0, seq: 0, taps: [], beat0: 0, headArm: { armed: true, hitY: 0, d: 0 }, arm: { left: mkArm(), right: mkArm() }, hintT: 0, prevHL: new V3(), hadHL: false };
const TCH_COL = { head: 0x3cf0c6, left: 0x4aa8ff, right: 0xff9a3c };
const HAND_NAME = { left: 'izquierda', right: 'derecha' };
const perfNow = () => performance.now() / 1000;
const tchPeriod = () => settings.bpm > 0 ? 60 / settings.bpm : 0;
// Movimientos de cada ejercicio: los de la cabeza (amebas) y los de las manos (diamantes)
const TCH_MOVES = { squat: [['squat'], ['punch']], lunge: [['lunge'], ['punch']], jump: [['jump'], ['reach']], abs: [['crunch', 'twist'], ['knee']], pushup: [['push'], []] }; // en flexiones solo amebas: las manos están apoyadas
const HAND_MOVES = ['punch', 'reach', 'tap', 'knee'];
// Con espadas, los diamantes pasan a ser bloques que se cortan; cada uno llega donde obliga a moverse:
// bajo (sentadilla), adelantado (zancada), a un lado (inclinarse) o muy alto (saltar)
const CUT_MOVES = ['cutLow', 'cutFwd', 'cutSide', 'cutHigh'];
const SWORD_CUTS = { squat: ['cutLow', 'cutSide'], lunge: ['cutFwd', 'cutLow', 'cutSide'], jump: ['cutHigh', 'cutSide'] };
const CUT_POSE = { cutLow: '¡Agáchate para cortarlo!', cutFwd: '¡Da un paso adelante!', cutSide: '¡Inclínate hacia ese lado!', cutHigh: '¡Salta para cortarlo!' };
const arrowTex = texFrom((() => { const c = mkCanvas(128), x = c.getContext('2d'); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(112, 64); x.lineTo(62, 18); x.lineTo(62, 46); x.lineTo(16, 46); x.lineTo(16, 82); x.lineTo(62, 82); x.lineTo(62, 110); x.closePath(); x.fill(); return c; })());
const cutGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18), cutHalfGeo = new THREE.BoxGeometry(0.09, 0.18, 0.18), cutShellGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
const cutHalfMat = std({ color: 0x23202c, metalness: 0.8, roughness: 0.35, envMapIntensity: 1.2 });
const comboMoves = () => String(settings[{ stand: 'comboStand', floor: 'comboFloor', abs: 'comboAbs' }[settings.comboBase]] || '').split(',').filter(Boolean);
const GEM_R = 0.15; // radio de toque del diamante (más el grosor de los dedos)

/* ---------- Aspecto ---------- */
const ringHaloTex = texFrom((() => { const c = mkCanvas(256), x = c.getContext('2d'), g = x.createRadialGradient(128, 128, 60, 128, 128, 128); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.45, 'rgba(255,255,255,0.55)'); g.addColorStop(0.62, 'rgba(255,255,255,0.15)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256); return c; })());
// Silueta de cabeza dentro de la ameba y mano dibujada sobre el diamante: la forma dice con qué se toca
const headIconTex = texFrom((() => { const c = mkCanvas(128), x = c.getContext('2d'); x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.arc(64, 50, 24, 0, TAU); x.fill(); x.beginPath(); x.moveTo(22, 120); x.quadraticCurveTo(26, 82, 64, 80); x.quadraticCurveTo(102, 82, 106, 120); x.closePath(); x.fill(); return c; })());
// Mano vista por el dorso (como la ves al tocar), del color de esa mano: la derecha con el pulgar a la izquierda;
// la izquierda, al revés. Con la inicial (D o I) bien grande en la palma
function handIcon(side) {
  const c = mkCanvas(128), x = c.getContext('2d'), col = '#' + TCH_COL[side].toString(16).padStart(6, '0');
  const shape = () => {
    x.save(); if (side === 'left') { x.translate(128, 0); x.scale(-1, 1); }
    rr(x, 30, 56, 66, 58, 20); x.fill(); x.stroke(); // palma
    [[34, 20, 50], [51, 9, 58], [68, 11, 56], [85, 22, 46]].forEach(([fx_, fy, fh]) => { rr(x, fx_, fy, 14, fh, 7); x.fill(); x.stroke(); });
    x.save(); x.translate(34, 86); x.rotate(-0.9); rr(x, -7, -38, 14, 38, 7); x.fill(); x.stroke(); x.restore(); // pulgar
    x.restore();
  };
  x.lineWidth = 8; x.strokeStyle = 'rgba(10,8,20,0.85)'; x.fillStyle = 'rgba(10,8,20,0.85)'; shape(); // contorno oscuro: se lee sobre cualquier fondo
  x.lineWidth = 0.01; x.strokeStyle = col; x.fillStyle = col; shape();
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `56px ${FD}`; x.lineWidth = 7; x.strokeStyle = 'rgba(10,8,20,0.9)';
  x.strokeText(side === 'left' ? 'I' : 'D', 63, 88); x.fillStyle = '#fff'; x.fillText(side === 'left' ? 'I' : 'D', 63, 88);
  return texFrom(c);
}
const handIconTex = { left: handIcon('left'), right: handIcon('right') };
const gemGeo = new THREE.OctahedronGeometry(1, 0);
const _tq = new Q4(), _tz = new V3(0, 0, 1), _tv = new V3(), _tw = new V3(), _tu = new V3(), _ta = new V3(), _tb = new V3();
// Ameba: un aro de agua cuyo borde ondula como un líquido (en la GPU): ondas que recorren el perímetro, el grosor
// que se hincha y se estrecha, y el aro que se alabea. Se sombrea como agua: brillos, borde que refleja y cáusticas.
const amebaGeo = new THREE.TorusGeometry(1, 0.2, 18, 72);
const WATER_VS = `uniform float uTime; uniform float uAmp; uniform float uPulse; uniform float uBurst;
varying vec3 vN; varying vec3 vV; varying vec2 vUV;
vec3 ringPos(float u, float v) {
  float t = uTime;
  float R = 1.0 + uPulse * 0.08 + uBurst * 0.7 + uAmp * (0.06 * sin(3.0 * u + 1.7 * t) + 0.04 * sin(5.0 * u - 2.3 * t) + 0.02 * sin(9.0 * u + 3.3 * t));
  float r = 0.2 * (1.0 - uBurst * 0.8) * (1.0 + uAmp * (0.32 * sin(4.0 * u - 2.1 * t) + 0.16 * sin(7.0 * u + 2.9 * t + v * 2.0) + 0.06 * sin(13.0 * u + 5.0 * v - 6.0 * t)));
  float z = uAmp * (0.09 * sin(2.0 * u + 1.3 * t) + 0.04 * sin(6.0 * u - 2.6 * t));
  vec2 c = vec2(cos(u), sin(u));
  return vec3(c * (R + r * cos(v)), z + r * sin(v));
}
void main() {
  float u = atan(position.y, position.x), v = atan(position.z, length(position.xy) - 1.0);
  vec3 p = ringPos(u, v);
  vec3 n = normalize(cross(ringPos(u + 0.01, v) - p, ringPos(u, v + 0.01) - p));
  if (dot(n, vec3(vec2(cos(u), sin(u)) * cos(v), sin(v))) < 0.0) n = -n;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * n); vV = normalize(-mv.xyz); vUV = vec2(u, v);
  gl_Position = projectionMatrix * mv;
}`;
const WATER_FS = `uniform float uTime; uniform float uOpacity; uniform vec3 uColor;
varying vec3 vN; varying vec3 vV; varying vec2 vUV;
void main() {
  vec3 n = normalize(vN), v = normalize(vV);
  float ndv = abs(dot(n, v)), fr = pow(1.0 - ndv, 2.0);
  vec3 r = reflect(-v, n);
  float spec = pow(max(dot(r, normalize(vec3(-0.35, 0.85, 0.4))), 0.0), 90.0) * 2.4 + pow(max(dot(r, normalize(vec3(0.55, 0.25, 0.8))), 0.0), 20.0) * 0.45;
  float ca = sin(vUV.x * 9.0 + uTime * 2.2 + sin(vUV.y * 3.0 + uTime) * 1.5) * sin(vUV.x * 5.0 - uTime * 1.6 + vUV.y * 2.0);
  vec3 deep = uColor * 0.28, shallow = mix(uColor, vec3(1.0), 0.3);
  vec3 col = mix(deep, shallow, 0.35 + 0.65 * ndv) + uColor * smoothstep(0.5, 1.0, ca) * 0.5;
  col = mix(col, vec3(0.85, 0.96, 1.0), fr * 0.55) + vec3(spec);
  gl_FragColor = vec4(col, clamp(0.4 + 0.5 * fr + spec, 0.0, 1.0) * uOpacity);
}`;
const waterRingMat = col => new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uAmp: { value: 1 }, uPulse: { value: 0 }, uBurst: { value: 0 }, uOpacity: { value: 1 }, uColor: { value: new THREE.Color(col) } }, vertexShader: WATER_VS, fragmentShader: WATER_FS, transparent: true, depthWrite: false });

/* ---------- Dónde aparece cada movimiento (coordenadas de la arena: tú en el origen, mirando a -Z) ---------- */
function moveSpec(move) {
  const r = settings.tchRing / 100, S = TCH.ref, D = arMode ? 4 : 6.5, side = Math.random() < 0.5 ? -1 : 1;
  const sd = settings.squatDepth / 100, pd = settings.pushDepth / 100, jh = settings.jumpHeight / 100;
  const o = { move, part: CUT_MOVES.includes(move) ? 'cut' : HAND_MOVES.includes(move) ? 'hand' : 'head', hand: side < 0 ? 'left' : 'right', n: new V3(0, 0, 1), r, hold: 0 };
  const rin = r * 0.75; // la cabeza está dentro si su centro cae a menos de esto del centro de la ameba
  if (move === 'lunge') { const ld = settings.lungeDepth / 100, lo = rin + 0.05; o.pos = new V3(rand(-0.06, 0.06), S - rand(Math.max(lo, ld * 0.55), Math.max(lo + 0.03, ld)), -0.3); } // un paso por delante
  else if (move === 'squat') { const lo = rin + 0.05; o.pos = new V3(rand(-0.08, 0.08), S - rand(Math.max(lo, sd * 0.55), Math.max(lo + 0.03, sd)), -0.05); }
  else if (move === 'jump') o.pos = new V3(rand(-0.06, 0.06), S + jh + rin, -0.08);
  else if (move === 'punch') o.pos = new V3(side * rand(0.15, 0.3), S - 0.3 + rand(-0.05, 0.05), -0.45);
  else if (move === 'reach') o.pos = new V3(side * rand(0.2, 0.35), S + 0.5 + jh, -0.2);
  else if (move === 'push' || move === 'plank') {
    o.r = clamp(r * 0.65, 0.07, 0.13); const ri = o.r * 0.75;
    // en la flexión, a veces algo desplazada hacia un hombro: obliga a cargar el peso en ese brazo
    const px = move === 'push' && Math.random() < 0.6 ? side * rand(0.07, 0.14) : 0;
    o.pos = move === 'push' ? new V3(px, S - rand(Math.max(ri + 0.03, pd * 0.6), Math.max(ri + 0.05, pd)), -0.06) : new V3(0, S, -0.06);
    if (move === 'plank') { o.r *= 1.15; o.hold = settings.plankHold; }
  } else if (move === 'tap') o.pos = new V3(side * rand(0.25, 0.35), Math.max(0.12, S - 0.15), -0.2);
  else if (move === 'cutLow') o.pos = new V3(side * rand(0.1, 0.3), S - sd - 0.3, -0.55);
  else if (move === 'cutFwd') o.pos = new V3(side * rand(0, 0.2), S - 0.4, -1.05);
  else if (move === 'cutSide') o.pos = new V3(side * 0.8, S - 0.35, -0.35);
  else if (move === 'cutHigh') o.pos = new V3(side * rand(0, 0.2), S + 0.45 + jh, -0.55);
  else { // boca arriba: la cabeza gira alrededor de la cadera (a R por debajo, hacia los pies)
    const R = clamp(standHeadY() * 0.34, 0.45, 0.65), hip = new V3(0, S, -R);
    if (move === 'knee') o.pos = new V3(side * rand(0.04, 0.15), S + 0.3 + rand(0, 0.1), -R - 0.3);
    else {
      const th = rand(settings.abMin, Math.max(settings.abMin, settings.abMax)) * Math.PI / 180;
      const ph = move === 'twist' ? side * rand(0.5, 1) * settings.abTwist * Math.PI / 180 : 0;
      o.pos = hip.clone().add(new V3(R * Math.sin(th) * Math.sin(ph), R * Math.sin(th) * Math.cos(ph), R * Math.cos(th)));
      o.n.set(Math.cos(th) * Math.sin(ph), Math.cos(th) * Math.cos(ph), -Math.sin(th)).normalize().negate(); // de cara a ti
    }
  }
  if (o.part === 'cut') { // la flecha: hacia dónde hay que cortar (en el plano del bloque, que te mira)
    const dirs = { cutLow: [-90, -90, 0, 180, -45, -135], cutFwd: [-90, 0, 180], cutSide: [-90, 90, side > 0 ? 0 : 180], cutHigh: [-90, 90, -45, -135] }[move];
    o.ang = pick(dirs) * Math.PI / 180; o.yaw = Math.atan2(-o.pos.x, -o.pos.z);
    const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
    o.normal = new V3(s, 0, c); o.cutDir = new V3(c * Math.cos(o.ang), Math.sin(o.ang), -s * Math.cos(o.ang));
    if (settings.sword !== 'two') o.hand = settings.swordHand;
  }
  const far = isFloor() ? 3.5 : D;
  o.from = isSupine() ? new V3(o.pos.x * 1.5, o.pos.y + 0.6, -3.5) : new V3(o.pos.x * 1.6, isFloor() ? Math.max(0.12, o.pos.y) : o.pos.y, -far);
  return o;
}

/* ---------- Volver a la postura de partida entre toques ---------- */
// Puntos de cada mano que pueden tocar (puntas, nudillos y muñeca; con mando, el mando), en coordenadas de la arena.
// Se guardan los del fotograma anterior para comprobar todo el recorrido: un puñetazo rápido no atraviesa el diamante sin tocarlo.
const TOUCH_J = [0, 4, 6, 9, 11, 14, 16, 19, 21, 24];
function sampleHands(dt) {
  for (const s of ['left', 'right']) {
    const h = hands[s], A = TCH.arm[s];
    [A.prev, A.cur] = [A.cur, A.prev]; const had = A.had; A.had = false;
    if (!h.ok) { A.n = 0; A.lostT += dt; if (A.lostT > 0.3) A.armed = true; continue; } // fuera de la vista: ha vuelto
    A.lostT = 0; let n = 0;
    const put = p => { const v = A.cur[n] || (A.cur[n] = new V3()); arena.worldToLocal(v.copy(p)); n++; };
    if (h.isHand) { for (const j of TOUCH_J) if (h.J[j].ok) put(h.J[j].p); if (!n) put(h.wrist); } else { put(h.wrist); if (h.tipOk) put(h.tip); }
    if (!had || A.n !== n) for (let i = 0; i < n; i++) (A.prev[i] || (A.prev[i] = new V3())).copy(A.cur[i]);
    A.n = n; A.had = true;
    if (!A.armed) {
      // la muñeca vuelve hacia el cuerpo o baja desde donde tocó (con márgenes holgados: basta con retirar la mano)
      const w = A.cur[0], P = A.hitP, closer = A.hitD - Math.hypot(w.x - HL.x, w.y - HL.y, w.z - HL.z) > 0.1;
      const back = A.move === 'punch' ? closer || w.z - P.z > 0.1 || w.y < P.y - 0.2 : A.move === 'reach' ? closer || w.y < HL.y || w.y < P.y - 0.3 : A.move === 'tap' ? w.y < 0.2 || w.y < P.y - 0.1 : A.move === 'knee' ? closer || w.y < P.y - 0.12 || w.y < TCH.ref + 0.12 : true;
      if (back) A.armed = true;
    }
  }
  const H = TCH.headArm;
  if (!H.armed) { // la cabeza vuelve cerca de su altura de partida (o deshace buena parte del movimiento)
    const d = Math.abs(H.d), thr = clamp(d * 0.4, 0.05, 0.12);
    if (Math.abs(HL.y - TCH.ref) < thr || (HL.y - H.hitY) * -Math.sign(H.d || -1) > d * 0.6) { H.armed = true; }
  }
  // la altura de partida se ajusta despacio a tu postura real cuando estás quieto en ella (cansado, de pie se baja un poco)
  TCH.stillT = head.speed < 0.05 ? (TCH.stillT || 0) + dt : 0;
  if (H.armed && TCH.stillT > 0.8 && Math.abs(HL.y - TCH.ref) < 0.12 && !touches.some(x => x.mode === 'hold')) TCH.ref += (HL.y - TCH.ref) * Math.min(1, dt * 0.4);
}
// Distancia mínima al origen del segmento a→b
function segDist(a, b) { _tu.subVectors(b, a); const L2 = _tu.lengthSq(), k = L2 > 1e-9 ? clamp(-a.dot(_tu) / L2, 0, 1) : 0; return _ta.copy(a).addScaledVector(_tu, k).length(); }
function touchHint(text) { if (TCH.hintT > 0) return; TCH.hintT = 1.6; say(text, '#ffd166', 1.1); }

/* ---------- Objetivo ---------- */
class TouchTarget {
  constructor(move, arriveAt) {
    if (CUT_MOVES.includes(move) && !swordActive()) move = 'punch'; // sin mandos no hay espada: diamante
    Object.assign(this, moveSpec(move));
    Object.assign(this, { alive: true, judged: false, mode: 'approach', spawnT: TCH.clock, arriveAt, win: settings.tchWindow, held: 0, outT: 0, popT: 0, ph: rand(0, TAU), prevPos: this.from.clone() });
    const col = this.part === 'head' ? TCH_COL.head : TCH_COL[this.hand];
    this.root = new THREE.Group(); this.root.position.copy(this.from); arena.add(this.root);
    if (this.part === 'head') {
      this.mat = waterRingMat(col);
      this.ring = new THREE.Mesh(amebaGeo, this.mat); this.ring.scale.setScalar(this.r * 1.25); this.root.add(this.ring);
      this.haloMat = new THREE.MeshBasicMaterial({ map: ringHaloTex, color: col, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
      this.halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.haloMat); this.halo.scale.setScalar(this.r * 3.6); this.root.add(this.halo);
      this.iconMat = new THREE.MeshBasicMaterial({ map: headIconTex, color: col, transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
      const icon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.iconMat); icon.scale.setScalar(this.r * 1.1); this.root.add(icon);
      this.root.quaternion.setFromUnitVectors(_tz, this.n);
    } else if (this.part === 'cut') { // bloque metálico con aristas que brillan y una flecha: corta en su dirección
      this.mat = std({ color: 0x23202c, metalness: 0.8, roughness: 0.35, envMapIntensity: 1.2 });
      this.box = new THREE.Mesh(cutGeo, this.mat); this.box.castShadow = true; this.root.add(this.box);
      this.shellMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      this.root.add(new THREE.Mesh(cutShellGeo, this.shellMat));
      this.arrowMat = new THREE.MeshBasicMaterial({ map: arrowTex, color: col, transparent: true, depthWrite: false, toneMapped: false });
      const ar = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.15), this.arrowMat); ar.position.z = 0.092; ar.rotation.z = this.ang; this.root.add(ar);
      this.root.rotation.y = this.yaw;
    } else {
      this.mat = std({ color: col, emissive: col, emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.4, flatShading: true, toneMapped: false });
      this.gem = new THREE.Mesh(gemGeo, this.mat); this.gem.scale.set(0.085, 0.125, 0.085); this.root.add(this.gem);
      this.glow = glowSprite(col, 0.45, 0.7); this.root.add(this.glow);
      this.icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: handIconTex[this.hand], color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false })); this.icon.scale.set(0.13, 0.13, 1); this.icon.position.y = 0.22; this.root.add(this.icon);
    }
  }
  center(out) { return this.root.getWorldPosition(out); }
  // ¿Está tocando? Cabeza: su centro dentro del hueco de la ameba (también si la cruza entre dos fotogramas);
  // mano: la que pide el diamante, con cualquier dedo, nudillo o la muñeca, en todo su recorrido desde el fotograma anterior
  touching() {
    if (this.part === 'cut') { // la espada lo atraviesa deprisa y en la dirección de la flecha, en la postura que pide
      const side = swordCutTest(this); if (!side) return false;
      const S = TCH.ref, sd = settings.squatDepth / 100, jh = settings.jumpHeight / 100;
      const ok = { cutLow: HL.y < S - sd * 0.6, cutFwd: HL.z < -0.12, cutSide: HL.x * Math.sign(this.pos.x) > 0.1, cutHigh: HL.y > S + jh * 0.5 }[this.move];
      if (!ok) { touchHint(CUT_POSE[this.move]); haptic(side, 0.2, 20); return false; }
      this.by = side; return true;
    }
    if (this.part === 'head') {
      _tw.set(0, 0, 1).applyQuaternion(this.root.quaternion); const lim = this.r; // todo el hueco que se ve
      _tv.subVectors(HL, this.root.position); const dp = _tv.dot(_tw); _tv.addScaledVector(_tw, -dp); this.rad = _tv.length() / lim;
      if (Math.abs(dp) < 0.2 && this.rad < 1) return true;
      if (!TCH.hadHL) return false;
      _tb.subVectors(TCH.prevHL, this.prevPos); const dq = _tb.dot(_tw);
      if (dp * dq >= 0) return false; // no ha cruzado el plano
      _tb.lerp(_ta.subVectors(HL, this.root.position), dq / (dq - dp)); _tb.addScaledVector(_tw, -_tb.dot(_tw));
      this.rad = _tb.length() / lim; return this.rad < 1;
    }
    for (const s of ['left', 'right']) {
      const A = TCH.arm[s];
      for (let i = 0; i < A.n; i++) {
        if (segDist(_tv.subVectors(A.prev[i], this.prevPos), _tw.subVectors(A.cur[i], this.root.position)) >= GEM_R) continue;
        if (s !== this.hand) { touchHint(`¡Con la mano ${HAND_NAME[this.hand]}!`); break; }
        if (!A.armed) { touchHint('Vuelve a la posición de partida'); return false; }
        this.by = s; return true;
      }
    }
    return false;
  }
  // tocar solo vale si la parte que toca ha vuelto a su postura tras el toque anterior
  ready() {
    if (this.part === 'hand') return true; // touching() ya lo comprueba
    if (TCH.headArm.armed || this.hold) return true;
    touchHint('Vuelve a la posición de partida'); return false;
  }
  update(dt, t) {
    const c = TCH.clock, play = state === 'play' || state === 'rest';
    if (this.mode === 'approach') {
      const k = clamp((c - this.spawnT) / Math.max(0.1, this.arriveAt - this.spawnT), 0, 1), e = 1 - Math.pow(1 - k, 3);
      this.root.position.lerpVectors(this.from, this.pos, e);
      // también vale tocarlo mientras viaja, si atinas
      if (play && this.touching() && this.ready()) { if (this.hold) { this.mode = 'hold'; SND.charge(); } else this.hit(); }
      else if (k >= 1) { this.mode = 'wait'; if (tchPeriod()) SND.tick(); }
    } else if (this.mode === 'wait') {
      this.root.position.copy(this.pos);
      if (play && this.touching() && this.ready()) { if (this.hold) { this.mode = 'hold'; SND.charge(); } else this.hit(); }
      else if (c > this.arriveAt + this.win) this.miss();
    } else if (this.mode === 'hold') { // plancha: aguanta la cabeza dentro
      if (this.touching()) { this.outT = 0; this.held += dt; } else this.outT += dt;
      if (this.held >= this.hold) this.hit();
      else if (this.outT > 0.6) this.miss();
      else if (Math.floor(this.held) !== Math.floor(this.held - dt)) { const left = Math.ceil(this.hold - this.held); say(`Aguanta ${left}`, '#ffd166', 0.6, true); SND.beep(1 + (this.hold - left) * 0.1); }
    } else if (this.mode === 'burst') { // la ameba se rompe: el agua se abre hacia fuera y se deshace
      this.popT += dt; const k = Math.min(1, this.popT / 0.22);
      this.mat.uniforms.uBurst.value = k; this.mat.uniforms.uOpacity.value = 1 - k; this.haloMat.opacity = 0.4 * (1 - k); this.iconMat.opacity = 0;
      if (k >= 1) { this.dispose(); return; }
    } else if (this.mode === 'pass') {
      // fallado: se aleja un poco hacia ti, se encoge y se apaga (no te atraviesa la cara)
      this.popT += dt; this.root.position.addScaledVector(this.dir, dt * 0.8); this.root.position.y -= dt * 0.3;
      const f = 1 - this.popT / 0.5; this.root.scale.setScalar(Math.max(0.05, 0.3 + 0.7 * f));
      if (this.ring) { this.mat.uniforms.uOpacity.value = Math.max(0, f); this.haloMat.opacity = Math.max(0, f) * 0.35; } else this.mat.opacity = Math.max(0, f) * 0.9;
      if (f <= 0) { this.dispose(); return; }
    }
    this.prevPos.copy(this.root.position);
    // ondula como el agua; con ritmo, late en cada pulso
    const P = tchPeriod(), ph_ = P ? ((((perfNow() - TCH.beat0) / P) % 1) + 1) % 1 : 1, pulse = P ? Math.exp(-ph_ * 6) : 0;
    if (this.ring) {
      const near = this.mode === 'wait' || this.mode === 'hold', U = this.mat.uniforms;
      U.uTime.value = t + this.ph; U.uAmp.value += ((near ? 1.4 : 1) - U.uAmp.value) * Math.min(1, dt * 4); U.uPulse.value = pulse;
      if (this.mode === 'hold') { const k = this.held / this.hold; U.uColor.value.setRGB(0.24 + 0.76 * k, 0.94 + 0.06 * k, 0.78 + 0.22 * k); }
      if (this.mode !== 'pass' && this.mode !== 'burst') this.haloMat.opacity = (near ? 0.5 : 0.32) + pulse * 0.25;
    } else if (this.box) {
      const w = this.mode === 'wait' ? 0.06 * Math.sin(t * 9) : 0; this.box.scale.setScalar(1 + pulse * 0.15 + w);
      if (this.mode !== 'pass') this.shellMat.opacity = 0.14 + pulse * 0.25 + (this.mode === 'wait' ? 0.1 : 0);
    } else if (this.gem) {
      this.gem.rotation.y += dt * 2.2; this.gem.rotation.x = Math.sin(t * 1.3 + this.ph) * 0.3;
      const s = 1 + pulse * 0.25 + (this.mode === 'wait' ? 0.12 * Math.sin(t * 9) : 0); this.gem.scale.set(0.085 * s, 0.125 * s, 0.085 * s);
    }
  }
  hit() {
    if (this.judged) return; this.judged = true;
    const c = this.center(new V3()), col = this.part === 'head' ? TCH_COL.head : TCH_COL[this.hand], rgb = [((col >> 16) & 255) / 255, ((col >> 8) & 255) / 255, (col & 255) / 255];
    const P = tchPeriod(), dt_ = Math.abs(TCH.clock - this.arriveAt);
    const perfect = this.hold ? this.outT === 0 : P ? dt_ < 0.15 : this.part === 'head' ? this.rad < 0.4 : dt_ < 0.3;
    registerRep(perfect, false); stats.kills++;
    say(perfect ? '¡PERFECTO!' : this.hold ? '¡Aguantado!' : '¡Bien!', perfect ? '#3cf0c6' : '#ffffff', 0.8, !perfect);
    if (perfect) SND.perfect();
    if (this.part === 'head') {
      // hay que volver a la postura de partida antes de la siguiente ameba
      Object.assign(TCH.headArm, { armed: false, hitY: HL.y, d: this.pos.y - TCH.ref });
      SND.waterPop(c, !!this.hold);
      fx.waterBurst(c, _tw.set(0, 0, 1).applyQuaternion(this.root.quaternion).transformDirection(arena.matrixWorld), this.r * 1.25, rgb);
      this.mode = 'burst'; this.popT = 0; return;
    }
    if (this.part === 'cut') { this.split(c, rgb); return; }
    haptic(this.by || this.hand, 0.5, 50);
    const A = TCH.arm[this.by || this.hand]; A.armed = false; A.move = this.move; A.hitP.copy(A.cur[0] || this.pos); A.hitD = A.hitP.distanceTo(HL);
    SND.pop(c, false); fx.droplets(c, 16, rgb, 1.6, 0.03); fx.sparks(c, 12, rgb, 1.6, 0.025); fx.glow(c, rgb, 0.4, 0.15);
    this.dispose();
  }
  // cortado: se parte en dos mitades por la línea del tajo, que salen despedidas
  split(c, rgb) {
    const laser = settings.swordKind === 'laser', q = new Q4();
    this.root.updateMatrixWorld(true); this.root.matrixWorld.decompose(_ta, q, _tb);
    const zq = new Q4().setFromAxisAngle(_tz, this.ang + Math.PI / 2), hq = q.clone().multiply(zq);
    const perp = new V3(1, 0, 0).applyQuaternion(hq), dir = new V3(0, 1, 0).applyQuaternion(hq);
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(cutHalfGeo, cutHalfMat); m.castShadow = true; m.quaternion.copy(hq); m.position.copy(c).addScaledVector(perp, s * 0.05);
      addDebris(m, perp.clone().multiplyScalar(s * rand(1, 1.6)).addScaledVector(dir, -0.6).add(new V3(0, 0.8, 0)), new V3(rand(-6, 6), rand(-6, 6), rand(-6, 6)), 1.6, false);
    }
    haptic(this.by, 0.7, 60); SND.swordSlice(c, laser);
    fx.sparks(c, 18, laser ? rgb : [1, 0.8, 0.5], 2.2, 0.03); fx.glow(c, rgb, 0.45, 0.12);
    this.dispose();
  }
  miss() {
    if (this.judged) return; this.judged = true; this.mode = 'pass'; this.popT = 0;
    this.dir = this.pos.clone().sub(this.from).normalize(); if (this.ring) this.mat.uniforms.uColor.value.setHex(0xff3b5c); else this.mat.color.setHex(0xff3b5c); if (this.haloMat) this.haloMat.color.setHex(0xff3b5c);
    fx.sparks(this.center(new V3()), 8, [1, 0.25, 0.3], 1, 0.02);
    if (state === 'play' || state === 'rest') { hurtPlayer({ silent: true }); say(this.hold ? '¡Has salido de la ameba!' : this.part === 'head' ? '¡Mete la cabeza en la ameba!' : this.part === 'cut' ? '¡Corta el bloque con la espada!' : `¡Toca el diamante con la ${HAND_NAME[this.hand]}!`, '#ff3b5c', 1.1); }
  }
  dispose() {
    this.alive = false; arena.remove(this.root);
    if (this.ring) { this.haloMat.dispose(); this.iconMat.dispose(); this.halo.geometry.dispose(); }
    this.mat.dispose(); if (this.icon) this.icon.material.dispose(); if (this.glow) this.glow.material.dispose(); if (this.box) { this.shellMat.dispose(); this.arrowMat.dispose(); }
  }
}

/* ---------- Oleadas y llegada ---------- */
function buildTouchWave(i) {
  const n = waveReps(i), list = [];
  if (settings.exercise === 'combo') {
    const mv = comboMoves();
    for (let k = 0; k < n; k++) { let m = settings.comboOrder === 'seq' ? mv[(TCH.seq++) % mv.length] : pick(mv); if (swordSet() && (m === 'punch' || m === 'reach')) m = pick(CUT_MOVES); list.push({ move: m, hp: 1 }); }
  } else {
    const [head, hand] = TCH_MOVES[settings.exercise] || TCH_MOVES.squat;
    const hm = swordSet() && SWORD_CUTS[settings.exercise] ? SWORD_CUTS[settings.exercise] : hand;
    for (let k = 0; k < n; k++) list.push({ move: hm.length && Math.random() * 100 < settings.tchHands ? pick(hm) : pick(head), hp: 1 });
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
function touchStartWave() { TCH.nextArrive = snapBeat(TCH.clock + settings.tchArrive + 0.6); touchRearm(); }
function touchRearm() { TCH.headArm.armed = true; TCH.hadHL = false; for (const s of ['left', 'right']) Object.assign(TCH.arm[s], { armed: true, had: false, n: 0 }); }
function touchStep(dt, t) {
  if (state !== 'paused') TCH.clock += dt;
  if (state === 'play' && spawnQueue.length && TCH.clock >= TCH.nextArrive - settings.tchArrive) {
    const spec = spawnQueue.shift(); touches.push(new TouchTarget(spec.move, Math.max(TCH.nextArrive, TCH.clock + 0.3)));
    TCH.nextArrive = Math.max(TCH.nextArrive, TCH.clock) + tchGapFor(spec.move); boardDirty = true;
  }
  if (state === 'paused') return;
  TCH.hintT -= dt; sampleHands(dt);
  for (const x of touches) if (x.alive) x.update(dt, t);
  touches = touches.filter(x => x.alive);
  TCH.prevHL.copy(HL); TCH.hadHL = true;
}
const touchLeft = () => touches.some(x => x.alive && !x.judged);
function touchClear() { touches.forEach(x => x.alive && x.dispose()); touches = []; touchRearm(); }
// En el ordenador: el siguiente objetivo al que llevar la cabeza (Espacio) o la mano (G). Si esa parte aún no ha
// vuelto a su postura tras el toque anterior, ninguno: así vuelve primero a casa
function touchAssist(part) {
  let best = null;
  for (const x of touches) if (x.alive && !x.judged && x.part === part && (x.mode !== 'approach' || TCH.clock > x.arriveAt - 0.6) && (!best || x.arriveAt < best.arriveAt)) best = x;
  if (!best || (part === 'head' ? !TCH.headArm.armed && !best.hold : !TCH.arm[best.hand].armed)) return null;
  return best;
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
