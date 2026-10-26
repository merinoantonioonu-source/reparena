/* =================== DEFENSA: ESCUDO, GUARDIA, ESQUIVA =================== */
// Contra los golpes de los enemigos (solo en Combate y sin espadas, que tienen sus bloqueos):
// · Escudo por técnica: las repeticiones perfectas y las rachas llenan una barra; llena, para sola el siguiente golpe y
//   aparta al enemigo (vale con cualquier ejercicio, sin gestos).
// · Con gestos (Defensa completa), según lo que tengas en las manos:
//   - manos libres (sentadillas, zancadas): el puño cerrado delante del pecho saca un escudo en el antebrazo;
//   - pesas: las dos manos juntas delante de la cara o el pecho; en el curl, aguantar arriba; en el press, los brazos
//     arriba paran a los voladores; en el swing, la kettlebell aparta a los que tienes delante;
//   - manos ocupadas (flexiones, planchas, superman, fondos): apartar la cabeza de golpe esquiva, una repetición
//     perfecta o profunda suelta una onda que aparta a los de cerca y aguantar bien la postura levanta una burbuja;
//   - con los mandos: el botón de agarre, en cualquier ejercicio.
//   La guardia gasta energía mientras la mantienes con un enemigo encima y al parar un golpe; las repeticiones la recargan. Subida durante la
//   preparación del golpe es una parada (el enemigo rebota y queda aturdido); mantenida desde mucho antes, solo bloquea.
const GDIFF = {
  easy: { perf: 0.34, rep: 0.1, streak: 0.15, enP: 0.3, en: 0.2, drain: 0.05, block: 0.15, parry: 0.1, win: 1.6, stun: 2.2, dodge: 0.1 },
  normal: { perf: 0.25, rep: 0.07, streak: 0.1, enP: 0.25, en: 0.15, drain: 0.1, block: 0.25, parry: 0.15, win: 1.1, stun: 1.8, dodge: 0.14 },
  hard: { perf: 0.17, rep: 0.05, streak: 0.08, enP: 0.2, en: 0.1, drain: 0.16, block: 0.35, parry: 0.2, win: 0.75, stun: 1.4, dodge: 0.18 }
};
const GUARD = { charge: 0, en: 1, broke: false, up: null, side: null, pos: new V3(), upT: 0, still: 0, need: 1, hist: [], histT: 0, waveCD: 0, flash: 0, drawn: '', ready: false, tip: false, tipB: false };
const gDiff = () => GDIFF[settings.guardDiff] || GDIFF.normal;
const guardOn = () => isCombat() && !!settings.guard && settings.guard !== 'off';
const gestureOn = () => guardOn() && settings.guard === 'full' && !swordActive();
// Qué se tiene en las manos: libres, pesas u ocupadas (apoyadas en el suelo o en el banco)
const guardFam = () => handsFree() || settings.exercise === 'jsquat' ? 'fist' : holdsWeights() ? 'weights' : 'busy';
function guardReset() { Object.assign(GUARD, { charge: 0, en: 1, broke: false, up: null, side: null, upT: 0, still: 0, histT: 0, waveCD: 0, flash: 0, drawn: '', ready: false, tip: false, tipB: false }); GUARD.hist.length = 0; }

/* ---------- Lo que se ve ---------- */
const G_TEAL = new THREE.Color(0x3cf0c6), G_LOW = new THREE.Color(0xff8a3d), G_WHITE = new THREE.Color(0xffffff);
// El escudo: un trozo de esfera (abombado hacia el enemigo, los bordes curvándose hacia ti) con una rejilla de hexágonos
// de energía roja: las celdas brillan más en sus bordes, el contorno del escudo se enciende y alguna celda titila. El eje
// largo (y) va a lo largo del antebrazo. Con poca energía se apaga y parpadea; al parar un golpe, destello blanco
const SH_R = 0.3, SH_A = 0.55, SH_B = 0.78; // radio de la esfera; medio ancho y medio largo (en radianes)
const shieldGeo = (() => { const g = new THREE.SphereGeometry(SH_R, 28, 32, Math.PI / 2 - SH_A, SH_A * 2, Math.PI / 2 - SH_B, SH_B * 2); g.translate(0, 0, -SH_R); return g; })();
function guardShield() {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    uniforms: { uCol: { value: new THREE.Color(0xe8140a) }, uHot: { value: new THREE.Color(0xff6a3a) }, uA: { value: 1 }, uFlash: { value: 0 }, uT: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position + vec3(0.0, 0.0, ' + SH_R.toFixed(3) + '); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uCol; uniform vec3 uHot; uniform float uA; uniform float uFlash; uniform float uT; varying vec3 vP;
      float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
      void main(){
        float ax = atan(vP.x, vP.z), ay = asin(clamp(vP.y / ${SH_R.toFixed(3)}, -1.0, 1.0));
        vec2 e = vec2(ax / ${SH_A.toFixed(3)}, ay / ${SH_B.toFixed(3)}); float r = length(e);
        if (r > 1.0) discard; // (el contorno, ovalado)
        // rejilla de hexágonos sobre la superficie (en metros a lo largo de ella; celdas de unos 4 cm)
        vec2 p = vec2(ax, ay) * ${SH_R.toFixed(3)} / 0.024; const vec2 S = vec2(1.0, 1.7320508);
        vec2 a = mod(p, S) - S * 0.5, b = mod(p - S * 0.5, S) - S * 0.5, h = dot(a, a) < dot(b, b) ? a : b, id = p - h;
        vec2 ah = abs(h); float d = max(dot(ah, vec2(0.5, 0.8660254)), ah.x); // 0 en el centro de la celda, 0.5 en su borde
        float edge = smoothstep(0.36, 0.48, d), line = smoothstep(0.43, 0.49, d);
        float tw = 0.75 + 0.25 * sin(uT * 3.0 + hash(id) * 6.2832); // (cada celda titila a su ritmo)
        float rim = smoothstep(0.78, 0.98, r), body = 0.08 + 0.34 * edge * tw + 0.58 * line * tw;
        vec3 c = mix(uCol, uHot, line * 0.45 + rim * 0.4); c = mix(c, vec3(1.0), uFlash);
        float al = (body + rim * 0.75) * (1.0 - smoothstep(0.96, 1.0, r) * 0.6);
        gl_FragColor = vec4(c, clamp(al * uA + uFlash * 0.4, 0.0, 1.0));
      }`
  });
  const g = new THREE.Mesh(shieldGeo, m); g.renderOrder = 21; g.visible = false; g.userData.u = m.uniforms; scene.add(g); return g;
}
const GV = { shield: { left: guardShield(), right: guardShield() }, big: guardShield(), warn: [], waves: [], q: new THREE.Quaternion(), qOk: false };
GV.bubble = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), new THREE.MeshBasicMaterial({ color: 0x3cf0c6, wireframe: true, transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false }));
GV.ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.012, 6, 48), new THREE.MeshBasicMaterial({ color: 0x3cf0c6, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }));
// En el suelo (flexiones, planchas, superman), mirando abajo, la burbuja alrededor de la cabeza apenas se veía: allí es una
// cúpula sobre ti y, en el suelo, un aro que se va llenando mientras aguantas quieto (lleno: burbuja puesta)
GV.dome = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), new THREE.MeshBasicMaterial({ color: 0x3cf0c6, wireframe: true, transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false }));
GV.pad = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.57, 72, 1), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uP: { value: 0 }, uCol: { value: new THREE.Color(0x3cf0c6) }, uA: { value: 0.5 } },
  vertexShader: 'varying vec2 vQ; void main(){ vQ = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform float uP; uniform vec3 uCol; uniform float uA; varying vec2 vQ;
    void main(){ float a = fract(atan(vQ.x, vQ.y) / 6.28318 + 1.0); float on = step(a, uP); gl_FragColor = vec4(uCol, uA * mix(0.22, 1.0, on)); }`
}));
GV.pad.rotation.x = -Math.PI / 2;
for (const m of [GV.bubble, GV.ring, GV.dome, GV.pad]) { m.visible = false; m.renderOrder = 21; scene.add(m); }
function guardHide() { GV.shield.left.visible = GV.shield.right.visible = GV.big.visible = GV.bubble.visible = GV.ring.visible = GV.dome.visible = GV.pad.visible = false; for (const w of GV.warn) w.visible = false; }
const guardLow = () => isFloor() && head.p.y < 1.0; // tumbado o en plancha, mirando al suelo
// el centro de la cúpula, en el suelo bajo tu cabeza (algo por delante: ahí están las manos)
const guardFloorAt = out => out.set(head.p.x, 0.012, head.p.z).addScaledVector(_gdF.copy(fwdH()), 0.12);

/* ---------- Detectar la guardia ---------- */
const _gdF = new V3(), _gdP = new V3(), _gdQ = new V3();
// delante de la cara o del pecho: entre 8 y 60 cm por delante de la cabeza, sin irse mucho a un lado, entre lo y hi de altura
function gFront(p, lo, hi) { const dx = p.x - head.p.x, dz = p.z - head.p.z, al = dx * _gdF.x + dz * _gdF.z, dy = p.y - head.p.y; return al > 0.08 && al < 0.6 && Math.abs(dx * _gdF.z - dz * _gdF.x) < 0.35 && dy > lo && dy < hi; }
// puño cerrado: las puntas de los dedos cerca de la muñeca
function gFist(h) { if (!h.isHand) return false; let n = 0, s = 0; for (const j of [9, 14, 19, 24]) { const J = h.J[j]; if (J && J.ok) { s += J.p.distanceTo(h.wrist); n++; } } return n >= 3 && s / n < 0.1; }
const gGrip = h => !h.isHand && h.pad && h.pad.buttons && h.pad.buttons[1] && h.pad.buttons[1].pressed;
// Busca la guardia de ahora: { kind, side, pos }; kind: 'grip', 'fist', 'guard' (manos juntas), 'curl', 'up' (brazos
// arriba: solo para voladores) o 'bubble'
function guardDetect(dt) {
  _gdF.copy(fwdH());
  for (const s of ['left', 'right']) { const h = hands[s]; if (h.ok && gGrip(h)) return { kind: 'grip', side: s, pos: h.wrist }; }
  const fam = guardFam(), L = hands.left, R = hands.right, ex = settings.exercise;
  if (fam === 'fist') {
    for (const s of ['left', 'right']) { const h = hands[s]; if (h.ok && gFist(h) && gFront(h.wrist, -0.7, 0.12)) return { kind: 'fist', side: s, pos: _gdP.copy(h.wrist) }; }
    return null;
  }
  if (fam === 'weights') {
    if (L.ok && R.ok && L.wrist.distanceTo(R.wrist) < 0.3) { _gdP.lerpVectors(L.wrist, R.wrist, 0.5); if (gFront(_gdP, -0.65, 0.15)) return { kind: 'guard', side: null, pos: _gdP }; }
    if (ex === 'curl' || ex === 'curl2') for (const s of ['left', 'right']) if (DET.curl[s].state === 'hold' && hands[s].ok) return { kind: 'curl', side: s, pos: hands[s].wrist };
    if (ex === 'press' || ex === 'press2' || ex === 'thruster') {
      const up = s => (hands[s].ok && hands[s].wrist.y > head.p.y + 0.1) || (ex !== 'thruster' && !hands[s].ok && DET.pr[s].state === 'top');
      if (up('left') || up('right')) return { kind: 'up', side: null, pos: _gdP.copy(head.p).add(_gdQ.set(0, 0.32, 0)) };
    }
    return null;
  }
  // manos ocupadas: aguantar bien la postura levanta la burbuja (en el superman, arriba; en la plancha lateral, la
  // cadera arriba; en el resto, quieto en tu postura)
  const away = isSeated() ? head.p.y > 1.5 : head.p.y > 1.0;
  const hold = ex === 'superman' ? DET.su.state === 'up' : ex === 'splank' ? DET.sp.state === 'hold' && !DET.sp.awayT && state === 'play' : !away && head.speed < 0.06;
  GUARD.still = hold ? GUARD.still + dt : 0; GUARD.need = ex === 'superman' || ex === 'splank' ? 0.4 : 1.0;
  return GUARD.still > GUARD.need ? { kind: 'bubble', side: null, pos: head.p } : null;
}

/* ---------- Cada fotograma ---------- */
// Cuánto le falta a un enemigo para golpear: de 0 (empieza a prepararlo) a 1 (el golpe), o -1 si no está atacando
function guardThreat(e) {
  if (!e.alive) return -1;
  if (e.type === 'robot') return e.K.thrower ? -1 : e.state === 'windup' ? clamp(e.st / (e.zone ? 1.25 : 0.75), 0, 1) : e.state === 'strike' ? 1 : -1;
  if (e.type === 'spider') return e.mode === 'rear' ? clamp(e.st / 0.55, 0, 1) : e.mode === 'lunge' ? 1 : -1;
  if (e.type === 'flyer') return e.windT > 0 ? clamp(e.windT / 0.7, 0, 1) : -1;
  return -1;
}
// ¿Está encima? (el que anda, a menos de 3,5 m; la araña, más cerca que lejos; el volador, a punto de picar)
function guardNear(e) {
  if (!e.alive) return false;
  if (e.type === 'robot') return e.out && Math.hypot(e.pos.x - HL.x, e.pos.z - HL.z) < 3.5;
  if (e.type === 'spider') return e.close > 0.5;
  return e.type === 'flyer' && e.base.distanceTo(HL) < (isTiny() ? 0.6 : 1.6);
}
function guardWarnSpr(i) {
  if (!GV.warn[i]) { const s = glowSprite(0xff8a3d, 1, 0); s.renderOrder = 20; scene.add(s); GV.warn[i] = s; }
  return GV.warn[i];
}
function guardStep(dt, t) {
  if (!guardOn() || !['play', 'rest'].includes(state)) { guardHide(); GUARD.up = null; return; }
  const G = GUARD, D = gDiff();
  G.waveCD = Math.max(0, G.waveCD - dt); G.flash = Math.max(0, G.flash - dt * 4);
  // la cabeza de los últimos instantes (para la esquiva)
  G.histT -= dt; if (G.histT <= 0) { G.histT = 0.05; G.hist.push({ t, x: head.p.x, y: head.p.y, z: head.p.z }); if (G.hist.length > 16) G.hist.shift(); }
  // la guardia: gasta energía mientras la mantienes; sin energía cae y no vuelve hasta recargar un poco
  const g = gestureOn() && !G.broke ? guardDetect(dt) : null;
  if (g) {
    if (G.up !== g.kind || G.side !== g.side) G.upT = 0; else G.upT += dt;
    G.up = g.kind; G.side = g.side; G.pos.copy(g.pos);
    if (enemies.some(guardNear)) G.en = Math.max(0, G.en - D.drain * dt); // (sin nadie cerca, mantenerla no gasta)
    if (G.en <= 0) { G.broke = true; guardBreakFx(); say('¡Sin energía! Las repeticiones la recargan', '#ff8a3d', 1.6); G.up = null; G.side = null; }
  } else {
    if (G.up === 'bubble') guardBreakFx(); // la burbuja estalla al perder la postura
    G.up = null; G.side = null; G.upT = 0;
  }
  // el escudo o la burbuja, del color de la energía que queda (y blanco un instante al parar un golpe)
  guardHide(); const col = _gdC.copy(G_LOW).lerp(G_TEAL, clamp(G.en * 2, 0, 1)).lerp(G_WHITE, G.flash);
  const low = guardLow(), busy = gestureOn() && guardFam() === 'busy';
  if (busy && low && !G.broke) { // el aro del suelo: cuánto falta para la burbuja (o, puesta, lleno y latiendo)
    guardFloorAt(GV.pad.position); GV.pad.visible = true; const u = GV.pad.material.uniforms;
    u.uP.value = G.up === 'bubble' ? 1 : clamp(G.still / G.need, 0, 1); u.uCol.value.copy(col); u.uA.value = G.up === 'bubble' ? 0.75 + 0.2 * Math.sin(t * 4) : 0.55;
  }
  if (G.up === 'bubble' && low) {
    GV.dome.visible = true; guardFloorAt(GV.dome.position); GV.dome.rotation.y = t * 0.3; GV.dome.scale.set(1, 0.85, 1).multiplyScalar(1 + G.flash * 0.15);
    GV.dome.material.color.copy(col); GV.dome.material.opacity = 0.55 + G.flash * 0.45;
    if (!G.tipB) { G.tipB = true; say('¡Burbuja! Te protege mientras aguantes la postura', '#3cf0c6', 2.0); }
  } else if (G.up === 'bubble') {
    if (!G.tipB) { G.tipB = true; say('¡Burbuja! Te protege mientras aguantes la postura', '#3cf0c6', 2.0); }
    GV.bubble.visible = true; GV.bubble.position.copy(head.p); GV.bubble.rotation.y = t * 0.4; GV.bubble.scale.setScalar(1 + G.flash * 0.25 + Math.sin(t * 5) * 0.015);
    GV.bubble.material.color.copy(col); GV.bubble.material.opacity = 0.22 + G.flash * 0.5;
  } else if (G.up) {
    const big = G.up === 'guard' || G.up === 'up', m = big ? GV.big : GV.shield[G.side || 'right'];
    m.visible = true; guardShieldPose(m, G, dt); m.scale.setScalar((big ? 1.35 : G.up === 'curl' ? 0.85 : 1) * (1 + G.flash * 0.2) * smooth(Math.min(1, G.upT / 0.12 + 0.3)));
    const u = m.userData.u, lowE = clamp(G.en * 2.5, 0, 1); u.uT.value = t; u.uFlash.value = G.flash;
    u.uA.value = (0.35 + 0.65 * lowE) * (lowE < 1 && Math.sin(t * 25) > 0.3 ? 0.55 : 1); // (con poca energía, más tenue y parpadeando)
  } else GV.qOk = false;
  // el escudo por técnica cargado: un anillo que gira a tu alrededor
  if (G.charge >= 1) {
    GV.ring.visible = true; GV.ring.rotation.set(Math.PI / 2 + Math.sin(t * 1.3) * 0.12, 0, t * 2);
    if (low) { guardFloorAt(GV.ring.position); GV.ring.position.y = 0.1; GV.ring.scale.setScalar(1.5); } // (en el suelo, a la vista: alrededor de las manos)
    else { GV.ring.position.copy(head.p); GV.ring.position.y -= head.p.y < 1.0 ? 0.08 : 0.32; GV.ring.scale.setScalar(1); }
    GV.ring.material.opacity = 0.4 + 0.2 * Math.sin(t * 6);
  }
  // aviso de golpe: el enemigo tiembla y brilla mientras lo prepara, cada vez más rojo
  let n = 0;
  for (const e of enemies) {
    const k = guardThreat(e); if (k < 0 || n >= 6) continue;
    if (!G.tip) { G.tip = true; const tip = guardTip(); if (tip) say(tip, '#3cf0c6', 2.6); }
    const sz = e.type === 'robot' ? 0.9 * e.sc : e.type === 'spider' ? 0.22 * e.s : 0.45 * Math.max(0.4, e.scale), amp = (e.type === 'robot' ? 0.015 * e.sc : e.type === 'spider' ? 0.004 * e.s : 0.01) * (0.4 + k);
    e.root.position.x += Math.sin(t * 71 + n) * amp; e.root.position.z += Math.cos(t * 63 + n) * amp;
    const w = guardWarnSpr(n++); e.center(w.position); w.visible = true;
    w.material.color.setRGB(1, 0.75 - 0.6 * k, 0.2 - 0.15 * k); w.material.opacity = 0.3 + 0.45 * k;
    const s = sz * (0.8 + 0.25 * Math.sin(t * (18 + 20 * k))); w.scale.set(s, s, 1);
  }
  updateGuardWaves(dt);
  // en el marcador, cuando cambia lo bastante
  const q = `${Math.round(G.charge * 20)}|${Math.round(G.en * 20)}|${G.broke}`; if (q !== G.drawn) { G.drawn = q; boardDirty = true; }
}
const _gdC = new THREE.Color();
// Dónde va el escudo: delante del antebrazo, entre él y el enemigo que ataca (o, si no, hacia delante), con su eje largo a
// lo largo del antebrazo (con las manos juntas o sin saber hacia dónde va el brazo, de pie); se gira con suavidad
const _shX = new V3(), _shY = new V3(), _shZ = new V3(), _shM = new THREE.Matrix4(), _shQ = new THREE.Quaternion(), _shE = new V3();
function guardShieldPose(m, G, dt) {
  // hacia dónde mirar: al que está preparando el golpe más cerca (si no, al más cercano; si no, al frente)
  let best = null, bd = 1e9;
  for (const e of enemies) { if (!e.alive) continue; const k = guardThreat(e), c = e.center(_shE), d = c.distanceTo(head.p) - (k >= 0 ? 10 : 0); if (d < bd) { bd = d; best = c.clone(); } }
  if (G.up === 'up') _shZ.set(0, 1, 0); else if (best) { _shZ.subVectors(best, G.pos); _shZ.y *= 0.5; if (_shZ.lengthSq() < 1e-4) _shZ.copy(_gdF); _shZ.normalize(); } else _shZ.copy(_gdF);
  // el antebrazo: de la muñeca hacia el codo (el +Z de la muñeca, en las manos y en los mandos)
  const h = G.side ? hands[G.side] : null, arm = _shY.set(0, 0, 0);
  if (h && h.ok && G.up !== 'guard') arm.set(0, 0, 1).applyQuaternion(h.wristQ);
  arm.addScaledVector(_shZ, -arm.dot(_shZ)); // (en el plano del escudo)
  if (arm.lengthSq() < 0.09) { arm.set(0, 1, 0).addScaledVector(_shZ, -_shZ.y); if (G.up === 'up') arm.copy(_gdF); } // (si no, de pie)
  arm.normalize(); _shX.crossVectors(arm, _shZ).normalize(); arm.crossVectors(_shZ, _shX);
  _shQ.setFromRotationMatrix(_shM.makeBasis(_shX, arm, _shZ));
  if (!GV.qOk) { GV.q.copy(_shQ); GV.qOk = true; } else GV.q.slerp(_shQ, Math.min(1, dt * 14));
  m.quaternion.copy(GV.q);
  // sitio: el centro del antebrazo y, desde ahí, unos centímetros hacia el enemigo
  m.position.copy(G.pos);
  if (h && h.ok && G.up !== 'guard' && G.up !== 'up') m.position.copy(h.wrist).addScaledVector(_shE.set(0, 0, 1).applyQuaternion(h.wristQ), 0.11);
  m.position.addScaledVector(_shZ, G.up === 'up' ? 0 : 0.09);
}

// Cómo defenderse en este ejercicio (sale la primera vez que un enemigo prepara un golpe)
function guardTip() {
  if (!gestureOn()) return G_TIPTECH;
  if (['left', 'right'].some(s => hands[s].ok && !hands[s].isHand && hands[s].pad)) return '¡Te va a golpear! Aprieta el botón de agarre: escudo';
  const f = guardFam();
  if (f === 'fist') return '¡Te va a golpear! Cierra el puño delante del pecho: escudo';
  if (f === 'weights') return '¡Te va a golpear! Junta las manos delante de la cara: guardia';
  return '¡Te va a golpear! Quédate quieto en la postura: burbuja · o aparta la cabeza';
}
const G_TIPTECH = '¡Te va a golpear! Las repeticiones perfectas llenan el escudo';

/* ---------- Al llegar un golpe ---------- */
// Desde hurtPlayer: ¿lo para la guardia, una esquiva o el escudo? Si lo para, el golpe no hace daño
function guardAbsorb(src) {
  if (!guardOn() || !src || !(src.rock || src.type === 'robot' || src.type === 'spider' || src.type === 'flyer') || !['play', 'rest'].includes(state)) return false;
  const G = GUARD, D = gDiff();
  // con gesto: subida durante la preparación, parada (rebota y queda aturdido); mantenida desde antes, bloqueo. Los
  // brazos arriba del press solo paran a los que vienen volando
  if (G.up && (G.up !== 'up' || src.type === 'flyer' || src.rock)) {
    const parry = G.upT <= D.win, sh = G.up === 'guard' || G.up === 'up' ? GV.big : GV.shield[G.side || 'right'], p = G.up === 'bubble' ? guardPoint(src, new V3()) : sh.visible ? sh.position.clone() : G.pos.clone(); // (el destello, en el escudo)
    G.en = Math.max(0, G.en - (parry ? D.parry : D.block)); if (G.en <= 0) G.broke = true;
    guardHitFx(p, parry, G.side); guardRepel(src, parry ? 0.6 : 0.3, parry ? D.stun : 0);
    if (parry) stats.parries = (stats.parries || 0) + 1; else stats.blocks = (stats.blocks || 0) + 1;
    say(parry ? '¡PARADA! Contraataca' : G.up === 'bubble' ? '¡La burbuja aguanta!' : '¡Bloqueado!', parry ? '#3cf0c6' : '#ffffff', 1.1);
    return true;
  }
  // esquiva: con las manos ocupadas, apartar la cabeza de golpe justo antes
  if (gestureOn() && guardFam() === 'busy' && guardDodged(src, D)) {
    stats.dodges = (stats.dodges || 0) + 1; SND.whoosh(head.p); say('¡Esquivada!', '#3cf0c6', 1.0); score += 50; boardDirty = true;
    return true;
  }
  // el escudo por técnica: para el golpe solo y aparta al enemigo
  if (G.charge >= 1) {
    G.charge = 0; G.ready = false; const p = guardPoint(src, new V3());
    guardHitFx(p, true, null); guardRepel(src, 0.5, 1.0); stats.shields = (stats.shields || 0) + 1;
    say('¡ESCUDO! Lo has repelido', '#3cf0c6', 1.2);
    return true;
  }
  return false;
}
// Dónde se para el golpe: entre tu cabeza y el enemigo, a la altura del pecho
function guardPoint(src, out) {
  if (!src.center) return out.copy(head.p).addScaledVector(fwd(), 0.35);
  const c = src.center(_gdQ), d = _gdP.subVectors(c, head.p); d.y = 0; const l = d.length() || 1;
  return out.copy(head.p).addScaledVector(d, 0.38 / l).add(_gdQ.set(0, isFloor() ? -0.05 : -0.2, 0));
}
// Rebote: lo aparta (dist, en metros a su escala) y, en una parada, lo deja aturdido «stun» segundos
function guardRepel(e, dist, stun) {
  if (!e || !e.alive) return;
  if (e.type === 'robot') { e.shove(dist * (e.K.boss ? 0.4 : 1)); if (stun) { e.stunT = Math.max(e.stunT || 0, stun * (e.K.boss ? 0.6 : 1)); e.stagger = 1; } }
  else if (e.type === 'spider') { e.bounce = dist * 0.35; e.parryT = stun; }
  else if (e.type === 'flyer') { e.shove(dist * (isTiny() ? 0.42 : 1)); e.parryT = stun; }
}
function guardDodged(src, D) {
  const H = GUARD.hist; if (H.length < 3 || !src.center) return false;
  const now = H[H.length - 1]; let old = null; for (const h of H) if (now.t - h.t <= 0.55) { old = h; break; }
  if (!old || old === now) return false;
  const c = src.center(_gdQ), dx = c.x - head.p.x, dz = c.z - head.p.z, l = Math.hypot(dx, dz) || 1;
  const mx = head.p.x - old.x, mz = head.p.z - old.z, lat = Math.abs((mx * dz - mz * dx) / l), down = old.y - head.p.y;
  return lat > D.dodge || (src.type === 'flyer' && down > D.dodge * 1.2); // a los voladores, también agachando la cabeza
}
function guardHitFx(p, parry, side) {
  SND.swordBlock(p, false); fx.sparks(p, parry ? 30 : 16, [1, 0.85, 0.4], 3, 0.04); fx.glow(p, [1, 1, 1], parry ? 0.8 : 0.5, 0.12); comicHit(p);
  if (side) { haptic(side, 1, 80); haptic(side === 'left' ? 'right' : 'left', 0.35, 40); } else hapticBoth(parry ? 0.7 : 0.4, 60);
  GUARD.flash = 1; score += parry ? 150 : 50; boardDirty = true;
}
function guardBreakFx() {
  const p = GUARD.up === 'bubble' ? head.p.clone().addScaledVector(fwd(), 0.3) : GUARD.pos.clone();
  fx.sparks(p, 10, [0.25, 0.95, 0.8], 1.6, 0.03); SND.pop(p, false);
}

/* ---------- Con cada repetición ---------- */
// Carga el escudo por técnica (las perfectas, mucho; las rachas, un extra) y recarga la energía de la guardia; con las
// manos ocupadas, la perfecta o profunda suelta la onda; en el swing, la kettlebell aparta a los que tienes delante
function guardOnRep(opts) {
  if (!guardOn()) return;
  const G = GUARD, D = gDiff(), was = G.charge;
  G.charge = Math.min(1, G.charge + (opts.perfect ? D.perf : D.rep) + (combo > 0 && combo % 5 === 0 ? D.streak : 0));
  if (G.charge >= 1 && was < 1) { G.ready = true; SND.power(3); say('¡ESCUDO LISTO! Parará el siguiente golpe', '#3cf0c6', 1.4); }
  G.en = Math.min(1, G.en + (opts.perfect ? D.enP : D.en)); if (G.broke && G.en >= 0.3) G.broke = false;
  if (!gestureOn()) return;
  if (settings.exercise === 'swing') guardWave(true);
  else if (guardFam() === 'busy' && (opts.perfect || (opts.pow || 1) >= 2)) guardWave(false);
}
// Onda expansiva: aparta a los que están cerca (y les quita el golpe que preparaban); front: solo los de delante
function guardWave(front) {
  if (GUARD.waveCD > 0) return;
  _gdF.copy(fwdH()); let any = false;
  for (const e of enemies) {
    if (!e.alive) continue;
    const c = e.center(_gdQ), dx = c.x - head.p.x, dz = c.z - head.p.z, d = Math.hypot(dx, dz) || 1e-3;
    const R = e.type === 'robot' ? 1.8 * Math.max(1, e.sc) : e.type === 'spider' ? 0.75 : isTiny() ? 0.6 : 1.4;
    if (d > R || (front && (dx * _gdF.x + dz * _gdF.z) / d < 0.3)) continue;
    any = true;
    if (e.type === 'robot') e.shove(0.55 * (e.K.boss ? 0.4 : 1));
    else if (e.type === 'spider') { e.shove(0.15); if (e.mode === 'rear' && !e.boss) { e.mode = 'run'; e.st = 0; e.run = false; e.runT = 0.5; } }
    else if (e.type === 'flyer') { e.shove(0.6 * (isTiny() ? 0.42 : 1)); if (e.windT > 0 && e.windT < 0.45) { e.windT = 0; e.retreat = Math.max(e.retreat, 0.6); } }
  }
  if (!any) return;
  GUARD.waveCD = 1.2; stats.waves = (stats.waves || 0) + 1; SND.whoosh(head.p);
  let w = GV.waves.find(o => !o.m.visible);
  if (!w) { const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: 0x3cf0c6, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })); m.rotation.x = -Math.PI / 2; m.renderOrder = 20; scene.add(m); w = { m, t: 0 }; GV.waves.push(w); }
  w.t = 0; w.m.visible = true; w.m.position.set(head.p.x, Math.max(0.03, head.p.y - (isFloor() || head.p.y < 1.0 ? 0.25 : 1.1)), head.p.z); w.m.scale.setScalar(0.2);
  say(front ? '¡Apartados!' : '¡Onda expansiva!', '#3cf0c6', 0.9, false);
}
function updateGuardWaves(dt) {
  for (const w of GV.waves) if (w.m.visible) { w.t += dt; const k = w.t / 0.4; w.m.scale.setScalar(0.2 + k * 1.6); w.m.material.opacity = 0.6 * (1 - k); if (k >= 1) w.m.visible = false; }
}

/* ---------- En el marcador ---------- */
function guardBoard(c, RX) {
  if (!guardOn() || !['play', 'rest', 'ready'].includes(state)) return;
  const G = GUARD, two = gestureOn(), w = two ? 160 : 330, y = 322;
  c.textAlign = 'left'; c.font = `500 20px ${FB}`;
  const x1 = RX - (two ? 2 * w + 30 : w);
  c.fillStyle = G.charge >= 1 ? BC.teal : BC.lil; c.fillText(G.charge >= 1 ? 'ESCUDO LISTO' : 'ESCUDO', x1, y - 16);
  boardBar(c, x1, y, w, 12, G.charge, BC.teal, '#7af7ff');
  if (two) { const x2 = RX - w; c.fillStyle = G.broke ? '#ff8a3d' : BC.lil; c.fillText(G.broke ? 'SIN ENERGÍA' : 'GUARDIA', x2, y - 16); boardBar(c, x2, y, w, 12, G.en, G.broke ? '#ff8a3d' : BC.gold, '#ffe9a8'); }
}
