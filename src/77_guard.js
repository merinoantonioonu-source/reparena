/* =================== DEFENSA: ESCUDO, GUARDIA, ESQUIVA =================== */
// Contra los golpes de los enemigos (solo en Combate y sin espadas, que tienen sus bloqueos):
// · Escudo por técnica: las repeticiones perfectas y las rachas llenan una barra; llena, para sola el siguiente golpe y
//   aparta al enemigo (vale con cualquier ejercicio, sin gestos).
// · Con gestos (Defensa completa), solo en los ejercicios de pie con las manos libres (sentadillas, zancadas, sentadilla
//   con salto): el puño cerrado delante del pecho saca un escudo en el antebrazo (con los mandos, el botón de agarre).
//   Con pesas o con las manos apoyadas no hay gestos: el propio ejercicio los hacía sin querer (en el curl con barra,
//   las manos juntas delante del pecho subían la guardia en cada repetición).
//   La guardia gasta energía mientras la mantienes con un enemigo encima y al parar un golpe; las repeticiones la recargan. Subida durante la
//   preparación del golpe es una parada (el enemigo rebota y queda aturdido); mantenida desde mucho antes, solo bloquea.
const GDIFF = {
  easy: { perf: 0.34, rep: 0.1, streak: 0.15, enP: 0.3, en: 0.2, drain: 0.05, block: 0.15, parry: 0.1, win: 1.6, stun: 2.2 },
  normal: { perf: 0.25, rep: 0.07, streak: 0.1, enP: 0.25, en: 0.15, drain: 0.1, block: 0.25, parry: 0.15, win: 1.1, stun: 1.8 },
  hard: { perf: 0.17, rep: 0.05, streak: 0.08, enP: 0.2, en: 0.1, drain: 0.16, block: 0.35, parry: 0.2, win: 0.75, stun: 1.4 }
};
const GUARD = { charge: 0, en: 1, broke: false, up: null, side: null, pos: new V3(), upT: 0, flash: 0, drawn: '', ready: false, tip: false };
const gDiff = () => GDIFF[settings.guardDiff] || GDIFF.normal;
const guardOn = () => isCombat() && !!settings.guard && settings.guard !== 'off';
// Los gestos, solo de pie y con las manos libres
const guardHandsFree = () => handsFree() || settings.exercise === 'jsquat';
const gestureOn = () => guardOn() && settings.guard === 'full' && !swordActive() && guardHandsFree();
function guardReset() { Object.assign(GUARD, { charge: 0, en: 1, broke: false, up: null, side: null, upT: 0, flash: 0, drawn: '', ready: false, tip: false }); }

/* ---------- Lo que se ve ---------- */
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
const GV = { shield: { left: guardShield(), right: guardShield() }, warn: [], q: new THREE.Quaternion(), qOk: false };
GV.ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.012, 6, 48), new THREE.MeshBasicMaterial({ color: 0x3cf0c6, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }));
GV.ring.visible = false; GV.ring.renderOrder = 21; scene.add(GV.ring);
function guardHide() { GV.shield.left.visible = GV.shield.right.visible = GV.ring.visible = false; for (const w of GV.warn) w.visible = false; }
const guardLow = () => isFloor() && head.p.y < 1.0; // tumbado o en plancha, mirando al suelo
// en el suelo bajo tu cabeza (algo por delante: ahí están las manos)
const guardFloorAt = out => out.set(head.p.x, 0.012, head.p.z).addScaledVector(_gdF.copy(fwdH()), 0.12);

/* ---------- Detectar la guardia ---------- */
const _gdF = new V3(), _gdP = new V3(), _gdQ = new V3();
// delante de la cara o del pecho: entre 8 y 60 cm por delante de la cabeza, sin irse mucho a un lado, entre lo y hi de altura
function gFront(p, lo, hi) { const dx = p.x - head.p.x, dz = p.z - head.p.z, al = dx * _gdF.x + dz * _gdF.z, dy = p.y - head.p.y; return al > 0.08 && al < 0.6 && Math.abs(dx * _gdF.z - dz * _gdF.x) < 0.35 && dy > lo && dy < hi; }
// puño cerrado: las puntas de los dedos cerca de la muñeca
function gFist(h) { if (!h.isHand) return false; let n = 0, s = 0; for (const j of [9, 14, 19, 24]) { const J = h.J[j]; if (J && J.ok) { s += J.p.distanceTo(h.wrist); n++; } } return n >= 3 && s / n < 0.1; }
const gGrip = h => !h.isHand && h.pad && h.pad.buttons && h.pad.buttons[1] && h.pad.buttons[1].pressed;
// Busca la guardia de ahora: { kind, side, pos }; kind: 'grip' (mandos) o 'fist'
function guardDetect() {
  _gdF.copy(fwdH());
  for (const s of ['left', 'right']) { const h = hands[s]; if (h.ok && gGrip(h)) return { kind: 'grip', side: s, pos: h.wrist }; }
  for (const s of ['left', 'right']) { const h = hands[s]; if (h.ok && gFist(h) && gFront(h.wrist, -0.7, 0.12)) return { kind: 'fist', side: s, pos: _gdP.copy(h.wrist) }; }
  return null;
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
  braceStep(dt, t);
  if (!guardOn() || !['play', 'rest'].includes(state)) { guardHide(); GUARD.up = null; return; }
  const G = GUARD, D = gDiff();
  G.flash = Math.max(0, G.flash - dt * 4);
  // la guardia: gasta energía mientras la mantienes; sin energía cae y no vuelve hasta recargar un poco
  const g = gestureOn() && !G.broke ? guardDetect() : null;
  if (g) {
    if (G.up !== g.kind || G.side !== g.side) G.upT = 0; else G.upT += dt;
    G.up = g.kind; G.side = g.side; G.pos.copy(g.pos);
    if (enemies.some(guardNear)) G.en = Math.max(0, G.en - D.drain * dt); // (sin nadie cerca, mantenerla no gasta)
    if (G.en <= 0) { G.broke = true; guardBreakFx(); say('¡Sin energía! Las repeticiones la recargan', '#ff8a3d', 1.6); G.up = null; G.side = null; }
  } else { G.up = null; G.side = null; G.upT = 0; }
  // el escudo en el antebrazo (blanco un instante al parar un golpe)
  guardHide(); const low = guardLow();
  if (G.up) {
    const m = GV.shield[G.side || 'right'];
    m.visible = true; guardShieldPose(m, G, dt); m.scale.setScalar((1 + G.flash * 0.2) * smooth(Math.min(1, G.upT / 0.12 + 0.3)));
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
}
// Dónde va el escudo: delante del antebrazo, entre él y el enemigo que ataca (o, si no, hacia delante), con su eje largo a
// lo largo del antebrazo (sin saber hacia dónde va el brazo, de pie); se gira con suavidad
const _shX = new V3(), _shY = new V3(), _shZ = new V3(), _shM = new THREE.Matrix4(), _shQ = new THREE.Quaternion(), _shE = new V3();
function guardShieldPose(m, G, dt) {
  // hacia dónde mirar: al que está preparando el golpe más cerca (si no, al más cercano; si no, al frente)
  let best = null, bd = 1e9;
  for (const e of enemies) { if (!e.alive) continue; const k = guardThreat(e), c = e.center(_shE), d = c.distanceTo(head.p) - (k >= 0 ? 10 : 0); if (d < bd) { bd = d; best = c.clone(); } }
  if (best) { _shZ.subVectors(best, G.pos); _shZ.y *= 0.5; if (_shZ.lengthSq() < 1e-4) _shZ.copy(_gdF); _shZ.normalize(); } else _shZ.copy(_gdF);
  // el antebrazo: de la muñeca hacia el codo (el +Z de la muñeca, en las manos y en los mandos)
  const h = G.side ? hands[G.side] : null, arm = _shY.set(0, 0, 0);
  if (h && h.ok) arm.set(0, 0, 1).applyQuaternion(h.wristQ);
  arm.addScaledVector(_shZ, -arm.dot(_shZ)); // (en el plano del escudo)
  if (arm.lengthSq() < 0.09) arm.set(0, 1, 0).addScaledVector(_shZ, -_shZ.y); // (si no, de pie)
  arm.normalize(); _shX.crossVectors(arm, _shZ).normalize(); arm.crossVectors(_shZ, _shX);
  _shQ.setFromRotationMatrix(_shM.makeBasis(_shX, arm, _shZ));
  if (!GV.qOk) { GV.q.copy(_shQ); GV.qOk = true; } else GV.q.slerp(_shQ, Math.min(1, dt * 14));
  m.quaternion.copy(GV.q);
  // sitio: el centro del antebrazo y, desde ahí, unos centímetros hacia el enemigo
  m.position.copy(G.pos);
  if (h && h.ok) m.position.copy(h.wrist).addScaledVector(_shE.set(0, 0, 1).applyQuaternion(h.wristQ), 0.11);
  m.position.addScaledVector(_shZ, 0.09);
}

// Cómo defenderse en este ejercicio (sale la primera vez que un enemigo prepara un golpe)
function guardTip() {
  if (!gestureOn()) return G_TIPTECH;
  if (['left', 'right'].some(s => hands[s].ok && !hands[s].isHand && hands[s].pad)) return '¡Te va a golpear! Aprieta el botón de agarre: escudo';
  return '¡Te va a golpear! Cierra el puño delante del pecho: escudo';
}
const G_TIPTECH = '¡Te va a golpear! Las repeticiones perfectas llenan el escudo';

/* ---------- Al llegar un golpe ---------- */
// Desde hurtPlayer: ¿lo para la guardia, una esquiva o el escudo? Si lo para, el golpe no hace daño
function guardAbsorb(src) {
  if (!guardOn() || !src || !(src.rock || src.type === 'robot' || src.type === 'spider' || src.type === 'flyer') || !['play', 'rest'].includes(state)) return false;
  const G = GUARD, D = gDiff();
  // con gesto: subida durante la preparación, parada (rebota y queda aturdido); mantenida desde antes, bloqueo
  if (G.up) {
    const parry = G.upT <= D.win, sh = GV.shield[G.side || 'right'], p = sh.visible ? sh.position.clone() : G.pos.clone(); // (el destello, en el escudo)
    G.en = Math.max(0, G.en - (parry ? D.parry : D.block)); if (G.en <= 0) G.broke = true;
    guardHitFx(p, parry, G.side); guardRepel(src, parry ? 0.6 : 0.3, parry ? D.stun : 0);
    if (parry) stats.parries = (stats.parries || 0) + 1; else stats.blocks = (stats.blocks || 0) + 1;
    say(parry ? '¡PARADA! Contraataca' : '¡Bloqueado!', parry ? '#3cf0c6' : '#ffffff', 1.1);
    return true;
  }
  // el escudo por técnica: para el golpe solo y aparta al enemigo
  if (G.charge >= 1) {
    G.charge = 0; G.ready = false; const p = guardPoint(src, new V3());
    guardHitFx(p, true, null); guardRepel(src, 0.5, 1.0); stats.shields = (stats.shields || 0) + 1; braceBreakFx();
    cheer('¡ESCUDO! Lo has repelido', '#3cf0c6', 1.2);
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
/* ---------- Golpe: un puñetazo (o con la pesa o el mando que lleves) aparta al que tienes cerca ---------- */
// En Combate, de pie o sentado (en el suelo, las manos están apoyadas) y sin espadas (que cortan): la mano que va deprisa
// hacia un enemigo (más de PUNCH_V respecto a la cabeza: al agacharte baja todo el cuerpo y eso no cuenta) y llega a su
// cuerpo lo echa hacia atrás y lo deja un momento aturdido (y, si estaba atacando, le corta el golpe). No hace daño: las oleadas piden las mismas repeticiones. Cada
// mano, un golpe cada PUNCH_CD; cada enemigo, uno cada PUNCH_E
const PUNCH_V = 1.8, PUNCH_CD = 0.45, PUNCH_E = 0.6, PUNCH_R = 0.3;
const PUNCH = { left: { last: new V3(), hl: new V3(), ok: false, cd: 0 }, right: { last: new V3(), hl: new V3(), ok: false, cd: 0 }, n: 0, t: 0 };
const punchOn = () => isCombat() && !!settings.punch && !isFloor() && settings.exercise !== 'inchworm' && !swordActive();
const _puV = new V3(), _puH = new V3(), _puC = new V3(), _puD = new V3();
function punchStep(dt) {
  if (!punchOn() || !['play', 'rest', 'ready'].includes(state) || !(dt > 0)) { PUNCH.left.ok = PUNCH.right.ok = false; return; }
  PUNCH.t += dt;
  for (const s of ['left', 'right']) {
    const h = hands[s], P = PUNCH[s]; P.cd -= dt;
    if (!h.ok) { P.ok = false; continue; }
    if (!P.ok) { P.last.copy(h.wrist); P.hl.copy(head.p); P.ok = true; continue; }
    _puV.subVectors(h.wrist, P.last).sub(_puH.subVectors(head.p, P.hl)).divideScalar(dt); P.last.copy(h.wrist); P.hl.copy(head.p);
    const sp = _puV.length(); if (sp < PUNCH_V || P.cd > 0) continue;
    for (const e of enemies) {
      if (!e.alive || e.state === 'emerge' || (e.punchT && PUNCH.t < e.punchT)) continue;
      e.center(_puC); const r = (e.radius || 0.35) * (e.type === 'flyer' ? 1.3 : 1) + PUNCH_R, d = _puD.subVectors(_puC, h.wrist), dl = d.length();
      if (dl > r || (dl > 0.05 && d.dot(_puV) / (dl * sp) < 0.3)) continue; // (la mano llega a su cuerpo, y va hacia él)
      P.cd = PUNCH_CD; e.punchT = PUNCH.t + PUNCH_E; PUNCH.n++;
      // si estaba preparando o soltando su golpe, se lo cortas (no te da)
      if (e.type === 'robot' && (e.state === 'windup' || e.state === 'strike')) { if (e.zone) blockCancel(e); e.zone = null; e.state = 'walk'; e.st = 0; e.vel.set(0, 0, 0); }
      const k = clamp(sp / 4, 0.6, 1.4); guardRepel(e, 0.55 * k, 0.5);
      const hit = h.wrist.clone().lerp(_puC, 0.5);
      fx.sparks(hit, 14, [1, 0.85, 0.5], 2.5, 0.035); fx.glow(hit, [1, 0.9, 0.7], 0.35, 0.08); comicHit(hit);
      if (e.type === 'robot' && !(e.K && e.K.beast3d)) SND.metalHit(hit, false); else SND.squish(hit);
      haptic(s, 0.9, 60); score += 25; boardDirty = true; if (PUNCH.n <= 2) say('¡Golpe!', '#ffd166', 0.6, false);
      break;
    }
  }
}
function guardHitFx(p, parry, side) {
  SND.swordBlock(p, false); fx.sparks(p, parry ? 30 : 16, [1, 0.85, 0.4], 3, 0.04); fx.glow(p, [1, 1, 1], parry ? 0.8 : 0.5, 0.12); comicHit(p);
  if (side) { haptic(side, 1, 80); haptic(side === 'left' ? 'right' : 'left', 0.35, 40); } else hapticBoth(parry ? 0.7 : 0.4, 60);
  GUARD.flash = 1; score += parry ? 150 : 50; boardDirty = true;
}
function guardBreakFx() {
  const p = GUARD.pos.clone();
  fx.sparks(p, 10, [0.25, 0.95, 0.8], 1.6, 0.03); SND.pop(p, false);
}

/* ---------- Con cada repetición ---------- */
// Carga el escudo por técnica (las perfectas, mucho; las rachas, un extra) y recarga la energía de la guardia
function guardOnRep(opts) {
  if (!guardOn()) return;
  const G = GUARD, D = gDiff(), was = G.charge;
  G.charge = Math.min(1, G.charge + (opts.perfect ? D.perf : D.rep) + (combo > 0 && combo % 5 === 0 ? D.streak : 0));
  if (G.charge >= 1 && was < 1) { G.ready = true; SND.power(3); cheer('¡ESCUDO LISTO!', '#3cf0c6', 1.4); }
  G.en = Math.min(1, G.en + (opts.perfect ? D.enP : D.en)); if (G.broke && G.en >= 0.3) G.broke = false;
}

/* ---------- El brazalete: el escudo por técnica, en tu antebrazo ---------- */
// En vez de una barra en el marcador: una banda de luz alrededor del antebrazo (el izquierdo; si no se ve, el derecho), en
// tantos tramos como perfectas pide el escudo, que se llena con cada repetición. Llena, se pone blanca y late (y el
// anillo gira a tu alrededor); al parar un golpe se rompe en chispas y vuelve a empezar
const BRACE = (() => {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    uniforms: { uK: { value: 0 }, uN: { value: 4 }, uFull: { value: 0 }, uT: { value: 0 } },
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uK; uniform float uN; uniform float uFull; uniform float uT; varying vec2 vU;
      void main(){
        float seg = fract(vU.x * uN), gap = step(0.07, seg) * step(seg, 0.93), on = step(vU.x, uK); // (alrededor del brazo, uv.x de 0 a 1)
        float edge = smoothstep(0.0, 0.3, vU.y) * smoothstep(1.0, 0.7, vU.y);
        vec3 lit = mix(vec3(0.24, 0.94, 0.78), vec3(1.0), uFull * (0.45 + 0.35 * sin(uT * 7.0)));
        gl_FragColor = vec4(mix(vec3(0.16, 0.22, 0.32), lit, on), mix(0.3, 0.95, on) * (0.5 + 0.5 * edge) * gap);
      }`
  });
  const g = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.039, 0.045, 40, 1, true), m); g.visible = false; g.renderOrder = 21; scene.add(g);
  return { g, u: m.uniforms, k: 0 };
})();
const _brA = new V3(), _brY = new V3(0, 1, 0);
function braceStep(dt, t) {
  const h = hands.left.ok ? hands.left : hands.right.ok ? hands.right : null;
  if (!h || !guardOn() || !['play', 'rest'].includes(state)) { BRACE.g.visible = false; return; }
  const G = GUARD, u = BRACE.u; BRACE.k += (G.charge - BRACE.k) * Math.min(1, dt * 8); // (se llena con suavidad)
  _brA.set(0, 0, 1).applyQuaternion(h.wristQ); // hacia el codo (el +Z de la muñeca, en las manos y en los mandos)
  BRACE.g.position.copy(h.wrist).addScaledVector(_brA, 0.075); BRACE.g.quaternion.setFromUnitVectors(_brY, _brA);
  BRACE.g.scale.setScalar(G.charge >= 1 ? 1 + 0.06 * Math.sin(t * 7) : 1);
  u.uK.value = BRACE.k; u.uN.value = Math.max(2, Math.round(1 / gDiff().perf)); u.uFull.value = G.charge >= 1 ? 1 : 0; u.uT.value = t; BRACE.g.visible = true;
}
function braceBreakFx() { if (!BRACE.g.visible) return; fx.sparks(BRACE.g.position, 22, [0.4, 1, 0.9], 1.8, 0.025); BRACE.k = 0; }
