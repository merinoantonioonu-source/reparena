
/* =================== ENTRADA XR =================== */
let lastStandYaw = 0;
const _jm = new THREE.Matrix4(), _js = new V3();
let poseBuf = new Float32Array(25 * 16), radBuf = new Float32Array(25);
const jointCache = new WeakMap();
function readXR(frame, t = 0) {
  const ref = renderer.xr.getReferenceSpace(); if (!ref) return;
  const pose = frame.getViewerPose(ref);
  if (pose) { const p = pose.transform.position, o = pose.transform.orientation; head.p.set(p.x, p.y, p.z); head.q.set(o.x, o.y, o.z, o.w); }
  for (const s of ['left', 'right']) { const h = hands[s]; h.ok = h.tipOk = h.pinch = h.rayOk = h.trig = h.btnMenu = false; h.J.forEach(j => j.ok = false); }
  for (const src of frame.session.inputSources) {
    const h = hands[src.handedness]; if (!h) continue;
    if (src.targetRaySpace) { const rp = frame.getPose(src.targetRaySpace, ref); if (rp) { const o = rp.transform.orientation; h.rayOk = true; h.rayO.copy(rp.transform.position); h.rayQ.set(o.x, o.y, o.z, o.w); h.rayD.set(0, 0, -1).applyQuaternion(h.rayQ); } }
    if (src.hand) {
      h.isHand = true;
      let spaces = jointCache.get(src.hand); if (!spaces) { spaces = HJ.map(n => src.hand.get(n)); jointCache.set(src.hand, spaces); }
      let filled = false;
      if (frame.fillPoses && spaces.every(Boolean)) {
        try { filled = frame.fillPoses(spaces, ref, poseBuf); if (filled && frame.fillJointRadii) frame.fillJointRadii(spaces, radBuf); } catch (e) { filled = false; }
        if (filled) for (let i = 0; i < 25; i++) { const J = h.J[i]; _jm.fromArray(poseBuf, i * 16); _jm.decompose(J.p, J.q, _js); J.r = radBuf[i] || 0.008; J.ok = true; }
      }
      if (!filled) spaces.forEach((sp, i) => { const jp = sp && frame.getJointPose(sp, ref), J = h.J[i]; if (jp) { const p = jp.transform.position, o = jp.transform.orientation; J.p.set(p.x, p.y, p.z); J.q.set(o.x, o.y, o.z, o.w); J.r = jp.radius || 0.008; J.ok = true; } });
      const W = h.J[0], T = h.J[9], Th = h.J[4];
      if (W.ok) { h.ok = true; h.wrist.copy(W.p); h.wristQ.copy(W.q); }
      if (T.ok) { h.tipOk = true; h.tip.copy(T.p); }
      h.pinch = T.ok && Th.ok && T.p.distanceTo(Th.p) < 0.02; h.trig = h.pinch; // con las manos, pellizcar es el gatillo
    } else if (src.gripSpace) {
      h.isHand = false; h.pad = src.gamepad || null; const B = (src.gamepad && src.gamepad.buttons) || [], bt = B[0]; h.trig = !!(bt && bt.pressed); h.btnMenu = !!((B[4] && B[4].pressed) || (B[5] && B[5].pressed)); // X/Y (o A/B)
      const gp = frame.getPose(src.gripSpace, ref);
      if (gp) { const p = gp.transform.position, o = gp.transform.orientation; h.ok = true; h.wrist.set(p.x, p.y, p.z); h.wristQ.set(o.x, o.y, o.z, o.w); h.tip.copy(h.wrist).add(_js.set(0, -0.01, -0.075).applyQuaternion(h.wristQ)); h.tipOk = true; }
    }
  }
  anchorsFrame(frame, ref); roomFrame(frame, ref, t);
}

/* =================== PRUEBA EN EL ORDENADOR =================== */
const PV = { keys: {}, crouch: false, fall: false, handsUp: false, baseY: 1.6, y: 1.6, drag: null, widget: null, down: null, bar: false, home: null, press: -0.15, twist: 0, curl: 0, thrUp: 0, wasCrouch: false };
// Postura de partida en el ordenador según el ejercicio: de pie, en plancha, boca abajo o boca arriba
const pvBaseY = () => settings.exercise === 'superman' ? 0.22 : isSupine() ? 0.2 : isSeated() ? 1.0 : isFloor() ? 0.45 : 1.6;
const pvPitch = () => settings.exercise === 'superman' ? -0.35 : settings.exercise === 'splank' ? -0.1 : isSupine() ? 1.1 : isFloor() ? -0.7 : -0.12;
function pvPose() { PV.baseY = PV.y = pvBaseY(); camera.position.y = PV.y; camera.rotation.set(pvPitch(), 0, 0); camera.updateMatrixWorld(); head.p.copy(camera.position); head.q.copy(camera.quaternion); head.prev.copy(head.p); }
const _pvw = new V3();
// Flexión inchworm simulada: mientras Espacio está pulsado (o PV.iwAuto) avanza una repetición de ~7,5 s: te doblas, caminas con
// las manos por las tres parejas de huellas, flexión, vuelves andando y te pones de pie. PV.iwSkip: se salta la pareja del medio
const IWS = [[0, 1.6, -1], [0.9, 0.95, 0], [1.7, 0.7, 1], [2.6, 0.45, 2], [3.3, -1, 2], [3.9, -1, 2], [4.6, 0.45, 2], [5.3, 0.7, 1], [6.0, 0.95, 0], [7.0, 1.6, -1], [7.6, 1.6, -1]];
function iwSim(dt) {
  if (PV.crouch || PV.iwAuto) PV.iwT = ((PV.iwT || 0) + dt) % 7.6;
  const u = PV.iwT || 0, i = IWS.findIndex((k, j) => j + 1 < IWS.length && u < IWS[j + 1][0]), a = IWS[i], b = IWS[i + 1], k = smooth(clamp((u - a[0]) / (b[0] - a[0]) * 1.6, 0, 1));
  const low = 0.45 - dv('pushDepth') / 100 - 0.06, hy = v => v < 0 ? low : v, y = lerp(hy(a[1]), hy(b[1]), k);
  const S = IW_OFF(), zf = v => v < 0 ? S : v === 0 ? S - 0.3 : v === 1 ? S * 0.45 : 0, z = lerp(zf(a[2]), zf(b[2]), k);
  camera.position.copy(arena.localToWorld(_pvw.set(0, y, z))); PV.y = camera.position.y;
  if (PV.crouch || PV.iwAuto) camera.rotation.x = lerp(-0.12, -0.75, clamp((1.6 - y) / 1.1, 0, 1)); // mirando al suelo al bajar
  const out = {};
  for (const s of ['left', 'right']) {
    const at = v => { if (v < 0) return new V3(s === 'left' ? -0.22 : 0.22, Math.max(0.75, y - 0.75), S); const pr = IW.prints.find(p => p.side === s && p.pair === (PV.iwSkip && v === 1 ? 0 : v)); return new V3(pr.x, 0.05, pr.z + 0.06); };
    const w = at(a[2]).lerp(at(b[2]), k); if (a[2] >= 0 && b[2] >= 0 && a[2] !== b[2]) w.y += 0.5 * Math.min(1, 2.5 * Math.sin(Math.PI * k)); // la mano va levantada entre huella y huella y solo baja al llegar
    out[s] = arena.localToWorld(w);
  }
  return out;
}
function previewInput(dt) {
  const ex = settings.exercise;
  const dropAmt = ex === 'splank' ? settings.splDrop / 100 + 0.06 : isFloor() ? 0.19 : settings.mode === 'arcs' ? Math.max(settings.arcMin, settings.arcMax) / 100 + 0.08 : ex === 'lunge' ? dv('lungeDepth') / 100 + 0.1 : ex === 'dips' ? dv('dipDepth') / 100 + 0.06 : ex === 'swing' ? settings.swingDrop / 100 + 0.08 : ex === 'dlrow' ? settings.dlDepth / 100 + 0.08 : dv('squatDepth') / 100 + 0.12;
  let target = PV.crouch && !['curl', 'curl2', 'press', 'press2', 'chop'].includes(ex) ? PV.baseY - dropAmt : PV.baseY;
  // barras: Espacio sube (remo o dominada), F te suelta
  if (settings.exercise === 'superman') target = PV.crouch ? PV.baseY + settings.supRange / 100 + 0.05 : PV.baseY; // Espacio: subir el tronco
  if (PV.bar) target = PV.fall ? PV.baseY - 0.35 : PV.crouch && settings.exercise !== 'hang' ? PV.baseY + barReq() + 0.06 : PV.baseY;
  // Arcos inclinados: al agacharte con Espacio, la cabeza se aparta hacia el lado alto (zancada lateral)
  if (settings.mode === 'arcs' && GAME_STATES.includes(state)) {
    let nx = null; for (const a of arcs) if (!a.judged && !a.second && (!nx || a.z > nx.z)) nx = a;
    const lx = PV.crouch && !PV.noLean && nx && nx.tilt ? Math.sign(nx.tilt) * settings.arcShift / 100 : 0, w = arena.localToWorld(_pvw.set(lx, 0, HL.z));
    camera.position.x += clamp(w.x - camera.position.x, -1.2 * dt, 1.2 * dt); camera.position.z += clamp(w.z - camera.position.z, -1.2 * dt, 1.2 * dt);
    // vallas: si lo próximo es una valla no se agacha, y salta cuando la tiene debajo (PV.noJump: no salta)
    if (nx && nx.jump) { const d = HL.z - nx.z; target = PV.crouch && !PV.noJump && d < 0.55 && d > -0.45 ? PV.baseY + settings.jumpHeight / 100 + 0.08 : PV.baseY; PV.jumping = target > PV.baseY; }
    else PV.jumping = false;
  }
  // Toques: Espacio lleva la cabeza a la ameba que toca y la devuelve después
  if (settings.mode === 'touch' && GAME_STATES.includes(state) && PV.home) {
    const tg = PV.crouch && touchAssist('head'), want = tg ? arena.localToWorld(tg.pos.clone()) : PV.home; _pvw.subVectors(want, camera.position); const d = _pvw.length();
    if (d > 1e-4) camera.position.addScaledVector(_pvw, Math.min(1, 1.4 * dt / d));
    target = PV.y = camera.position.y;
  }
  // sentadilla con salto: al soltar Espacio, sube de golpe por encima de tu altura de pie (PV.noJump: no salta)
  if (ex === 'jsquat' && GAME_STATES.includes(state)) { PV.jumping = !PV.crouch && PV.thrUp > 0.55 && !PV.noJump; if (PV.jumping) target = PV.baseY + settings.jsqJump / 100 + 0.06; }
  const vmax = PV.jumping ? (PV.slowJump ? 0.4 : 2.5) : 0.75; PV.y += clamp(target - PV.y, -vmax * dt, vmax * dt);
  PV.press += clamp((PV.crouch ? 0.24 : -0.15) - PV.press, -1.2 * dt, 1.2 * dt);
  PV.curl += clamp((PV.crouch ? 0.42 : 0) - PV.curl, -1.4 * dt, 1.4 * dt);
  // sentadilla con press: al volver de la sentadilla, las manos suben por encima de la cabeza un momento
  if (PV.wasCrouch && !PV.crouch) PV.thrUp = 0.9; PV.wasCrouch = PV.crouch; PV.thrUp = Math.max(0, PV.thrUp - dt);
  const sp = 1.6 * dt, yaw = camera.rotation.y, f = new V3(-Math.sin(yaw), 0, -Math.cos(yaw)), r = new V3(-f.z, 0, f.x);
  if (PV.keys.KeyW) camera.position.addScaledVector(f, sp); if (PV.keys.KeyS) camera.position.addScaledVector(f, -sp);
  if (PV.keys.KeyD) camera.position.addScaledVector(r, sp); if (PV.keys.KeyA) camera.position.addScaledVector(r, -sp);
  camera.position.y = PV.y;
  const iw = ex === 'inchworm' && GAME_STATES.includes(state) && state !== 'calib' ? iwSim(dt) : null; // inchworm: Espacio hace la repetición entera
  camera.updateMatrixWorld();
  head.p.copy(camera.position); head.q.copy(camera.quaternion);
  for (const s of ['left', 'right']) { const h = hands[s]; h.ok = h.tipOk = h.pinch = h.rayOk = false; }
  if (iw) for (const s of ['left', 'right']) { const h = hands[s]; h.ok = true; h.isHand = true; h.wristQ.copy(camera.quaternion); h.wrist.copy(iw[s]); }
  // H: las dos manos agarradas por encima de la cabeza (para colocar aparatos)
  // superman: los brazos estirados por delante de la cabeza
  if (settings.exercise === 'superman' && GAME_STATES.includes(state)) for (const [s, sg] of [['left', -1], ['right', 1]]) { const h = hands[s]; h.ok = true; h.isHand = false; h.wristQ.copy(camera.quaternion); h.wrist.copy(camera.position).addScaledVector(r, sg * 0.2).addScaledVector(f, PV.keys.KeyR ? 0.1 : 0.55); }
  // barra flexible: las manos sujetan la barra delante del pecho; al pulsar Espacio escurres hacia un lado y al
  // soltarlo, hacia el otro (cada mano gira en sentido contrario a la otra alrededor de la barra)
  if (settings.exercise === 'twist' && GAME_STATES.includes(state)) {
    // cada mano recorre algo más de twistDeg de un extremo al otro
    const want = (PV.crouch ? 1 : -1) * (settings.twistDeg / 2 + 8) * (PV.twistScale || 1) * Math.PI / 180; PV.twist += clamp(want - PV.twist, -5 * dt, 5 * dt);
    for (const [s, sg] of [['left', -1], ['right', 1]]) {
      const h = hands[s], a = sg * PV.twist; h.ok = true; h.isHand = true; h.wristQ.copy(camera.quaternion);
      h.wrist.copy(camera.position).addScaledVector(r, sg * 0.2).addScaledVector(f, 0.38); h.wrist.y -= 0.42;
      // nudillos: hacia delante, girados alrededor de la barra (eje izquierda-derecha)
      _pvw.copy(f).multiplyScalar(Math.cos(a) * 0.08); _pvw.y = Math.sin(a) * 0.08; h.J[10].p.copy(h.wrist).add(_pvw); h.J[10].ok = true;
    }
  }
  // press de hombro: las mancuernas a la altura de los hombros; Espacio las sube por encima de la cabeza
  // curl con barra: las dos manos a la altura de la cadera; Espacio las sube juntas hasta los hombros
  if (settings.exercise === 'curl2' && GAME_STATES.includes(state)) for (const [s, sg] of [['left', -1], ['right', 1]]) { const h = hands[s]; h.ok = true; h.isHand = false; h.wristQ.copy(camera.quaternion); h.wrist.copy(camera.position).addScaledVector(r, sg * 0.2).addScaledVector(f, 0.15); h.wrist.y += -0.72 + PV.curl; }
  // sentadilla con press: las pesas en los hombros; al subir de la sentadilla, por encima de la cabeza
  if (settings.exercise === 'thruster' && GAME_STATES.includes(state)) for (const [s, sg] of [['left', -1], ['right', 1]]) { const h = hands[s]; h.ok = true; h.isHand = false; h.wristQ.copy(camera.quaternion); h.wrist.copy(camera.position).addScaledVector(r, sg * 0.15).addScaledVector(f, 0.12); h.wrist.y += PV.thrUp > 0 && !PV.noArms ? 0.32 : -0.25; }
  // swing, sentadilla con elevación y peso muerto con remo: abajo, las pesas cuelgan; al subir, al frente o tirando de los codos (PV.noArms: no)
  if (['swing', 'frontsq', 'dlrow'].includes(ex) && GAME_STATES.includes(state)) for (const [s, sg] of [['left', -1], ['right', 1]]) {
    const h = hands[s], up = PV.thrUp > 0 && !PV.noArms; h.ok = true; h.isHand = false; h.wristQ.copy(camera.quaternion);
    h.wrist.copy(camera.position).addScaledVector(r, sg * (ex === 'swing' ? 0.05 : 0.2)).addScaledVector(f, up && ex !== 'dlrow' ? (ex === 'swing' ? 0.4 : 0.55) : 0.08);
    h.wrist.y += !up ? -0.75 : ex === 'swing' ? -0.36 : ex === 'frontsq' ? -0.18 : -0.45;
  }
  // leñador: Espacio baja las manos junto a la cadera derecha; al soltarlo suben por encima del hombro izquierdo (PV.chopSame: del mismo lado)
  if (ex === 'chop' && GAME_STATES.includes(state)) for (const s of ['left', 'right']) {
    const h = hands[s], up = PV.thrUp > 0; h.ok = true; h.isHand = false; h.wristQ.copy(camera.quaternion);
    h.wrist.copy(camera.position).addScaledVector(f, 0.3).addScaledVector(r, PV.crouch ? 0.28 : up ? (PV.chopSame ? 0.28 : -0.28) : 0); h.wrist.y = PV.crouch ? calibRef * 0.5 : up ? camera.position.y + 0.05 : camera.position.y - 0.4;
  }
  // (PV.lostAbove: como en las gafas, la mano se pierde de vista al pasar esa altura sobre los ojos)
  if ((settings.exercise === 'press' || settings.exercise === 'press2') && GAME_STATES.includes(state)) for (const [s, sg] of [['left', -1], ['right', 1]]) { const h = hands[s]; h.ok = !(PV.lostAbove != null && PV.press > PV.lostAbove); h.isHand = false; h.wristQ.copy(camera.quaternion); h.wrist.copy(camera.position).addScaledVector(r, sg * 0.22); h.wrist.y += PV.press; }
  // plancha con un brazo: las dos manos apoyadas junto a la cabeza; Q y E levantan la izquierda y la derecha
  if (oneArm() && GAME_STATES.includes(state)) for (const [s, sg, key] of [['left', -1, 'KeyQ'], ['right', 1, 'KeyE']]) {
    const h = hands[s], up = PV.keys[key]; h.ok = true; h.isHand = false; h.wristQ.copy(camera.quaternion);
    h.wrist.copy(camera.position).addScaledVector(r, sg * (up ? 0.45 : 0.22)).addScaledVector(f, up ? 0.15 : 0.05); h.wrist.y = up ? camera.position.y : 0.08;
  }
  if (PV.handAt) { const h = hands[PV.handSide || 'right']; h.ok = h.tipOk = true; h.isHand = false; h.wrist.copy(PV.handAt); h.tip.copy(PV.handAt); } // pruebas: mano en un punto
  // Toques: G lleva al diamante la mano que pide (si ya volvió de su toque anterior)
  if (settings.mode === 'touch' && PV.keys.KeyG && GAME_STATES.includes(state)) { const g = touchAssist('hand'); if (g) { const h = hands[g.hand], w = arena.localToWorld(g.pos.clone()); h.ok = h.tipOk = true; h.isHand = false; h.wrist.copy(w); h.tip.copy(w); } }
  // barras: agarrado, las manos quedan fuera de la vista; al soltarte (F) bajan y se ven
  if (PV.bar && PV.fall) for (const [s, sg] of [['left', -1], ['right', 1]]) { const h = hands[s]; h.ok = true; h.isHand = false; h.wrist.copy(camera.position).addScaledVector(r, sg * 0.25); h.wrist.y -= 0.5; h.wristQ.copy(camera.quaternion); }
  if (PV.handsUp) for (const [s, sg] of [['left', -1], ['right', 1]]) { const h = hands[s]; h.ok = true; h.isHand = false; h.wrist.copy(camera.position).addScaledVector(r, sg * 0.3).addScaledVector(f, 0.12); h.wrist.y += 0.5; h.wristQ.copy(camera.quaternion); }
}
// En el ordenador, el modo Barras te pone colgado de la barra o tumbado bajo las paralelas
function previewBarPose(on) {
  if (on === PV.bar) return; PV.bar = on;
  const row = settings.exercise === 'row', e = eqPose();
  PV.baseY = !on ? pvBaseY() : row ? Math.max(0.2, settings.dipH / 100 - 0.5) : settings.doorH / 100 - 0.62; PV.y = PV.baseY;
  // tumbado con la cabeza junto al agarre (con una paralela, cruzado: la cabeza pasa la barra), o colgado justo detrás de la barra
  const one = row && dipOne();
  if (on) eqWorld(e, one ? 0.3 : 0, PV.baseY, one ? 0 : row ? 0.3 : 0.2, camera.position); else camera.position.set(0, PV.baseY, 0);
  camera.rotation.set(!on ? pvPitch() : row ? 1.2 : 0.5, on ? e.yaw + (one ? Math.PI / 2 : 0) : 0, 0);
  head.p.copy(camera.position); head.prev.copy(head.p);
}
function startPreview() {
  audioInit(); ensureRigs();
  Object.assign(EQ.pv.door, { x: 0, z: -1.6, yaw: 0, set: true }); Object.assign(EQ.pv.dip, { x: 0, z: -1.9, yaw: 0, set: true }); PV.bar = PV.crouch = PV.fall = false;
  preview = true; arMode = false; $('#stage').hidden = false; $('#cross').hidden = !aimManual();
  const sup = settings.exercise === 'superman';
  PV.baseY = pvBaseY(); PV.y = PV.baseY; lastStandY = 1.6; lastStandYaw = 0;
  camera.position.set(0, PV.baseY, 0); camera.rotation.set(pvPitch(), 0, 0);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
  head.p.copy(camera.position); head.q.copy(camera.quaternion);
  arena.position.set(0, 0, 0); arena.rotation.set(0, 0, 0);
  applyEnvMode(); applyShadows(); ambientStart();
  state = 'lobby'; lobbyMenu();
}
function stopPreview() { preview = false; EQ.edit = null; PLACE.on = PLACE.wait = false; PV.handsUp = false; $('#stage').hidden = true; hideMenu(); resetWorld(); center.mesh.visible = false; toastP.mesh.visible = false; state = 'idle'; ambientStop(); renderHistory(); syncForm(); }
$('#btnPreview').addEventListener('click', startPreview);
$('#btnExitPreview').addEventListener('click', () => { saveRun(false); exitAll(); });
addEventListener('keydown', e => {
  if (!preview) return;
  if (menu && menu.keypad) {
    if (/^Digit\d$|^Numpad\d$/.test(e.code)) keypadKey(e.key); else if (e.key === ',' || e.key === '.') keypadKey(','); else if (e.code === 'Backspace') keypadKey('⌫'); else if (e.code === 'Enter' || e.code === 'NumpadEnter') keypadOK(); else if (e.code === 'Escape') closeKeypad();
    e.preventDefault(); return;
  }
  PV.keys[e.code] = true;
  if (e.code === 'Escape') { if (PLACE.on || PLACE.wait || RPL.on) onWatch(); else if (GAME_STATES.includes(state)) openPause(); else if (state === 'paused') resumeGame(); }
  if (e.code === 'KeyH') PV.handsUp = true;
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) { if (settings.exercise === 'curl') { onCharge(); const side = Math.random() < 0.5 ? 'left' : 'right'; setTimeout(() => onRep({ perfect: false }, side), 90); } else PV.crouch = true; } }
  if (e.code === 'KeyF') PV.fall = true;
  if (e.code === 'KeyP') { if (settings.mode === 'arcs') return; if (isBars()) { barRep({ perfect: true }); return; } onCharge(); onRep({ perfect: true }); }
  if (e.code === 'KeyX') onPartial({ squat: '¡Baja más!', pushup: '¡Más abajo!', curl: 'Sube hasta el hombro', row: '¡Más arriba!', pullup: '¡Más arriba!', hang: '¡Aguanta!' }[settings.exercise]);
});
addEventListener('keyup', e => { PV.keys[e.code] = false; if (e.code === 'Space') PV.crouch = false; if (e.code === 'KeyF') PV.fall = false; if (e.code === 'KeyH') PV.handsUp = false; });
const cv = renderer.domElement, ray = new THREE.Raycaster(), _plane = new THREE.Plane(), _pt = new V3(), _nrm = new V3();
function rayFrom(e) { const r = cv.getBoundingClientRect(); ray.setFromCamera({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, camera); }
function hitWidget(e) { if (!menu) return null; rayFrom(e); const list = activeWidgets(), hit = ray.intersectObjects(list.map(w => w.mesh))[0]; return hit ? { w: list.find(w => w.mesh === hit.object), point: hit.point } : null; }
function sliderU(w) { w.mesh.getWorldDirection(_nrm); w.mesh.getWorldPosition(_pt); _plane.setFromNormalAndCoplanarPoint(_nrm, _pt); const p = ray.ray.intersectPlane(_plane, new V3()); if (!p) return null; const l = w.mesh.worldToLocal(p); return clamp((l.x + w.w / 2 - w.pad) / (w.w - 2 * w.pad), 0, 1); }
cv.addEventListener('pointerdown', e => {
  const h = hitWidget(e);
  if (h) { PV.widget = h.w; if (h.w.kind === 'slider') { const u = sliderU(h.w); if (u !== null) h.w.drag(u); } return; }
  PV.drag = { x: e.clientX, y: e.clientY };
});
cv.addEventListener('pointermove', e => {
  if (!preview) return;
  if (PV.widget && PV.widget.kind === 'slider') { rayFrom(e); const u = sliderU(PV.widget); if (u !== null) PV.widget.drag(u); return; }
  if (PV.drag) { const dx = e.clientX - PV.drag.x, dy = e.clientY - PV.drag.y; camera.rotation.y -= dx * 0.004; camera.rotation.x = clamp(camera.rotation.x - dy * 0.004, -1.45, 1.2); PV.drag.x = e.clientX; PV.drag.y = e.clientY; return; }
  const h = hitWidget(e); const list = activeWidgets();
  list.forEach(w => { const hv = !!h && h.w === w; if (w.hover !== hv) { w.hover = hv; w.draw(); } });
});
cv.addEventListener('pointerup', e => {
  const w = PV.widget; PV.widget = null; PV.drag = null;
  if (!w) return;
  if (w.kind === 'slider') { w.commit(); return; }
  const h = hitWidget(e);
  if (h && h.w === w) { SND.click(); w.onPress(); $('#cross').hidden = !aimManual(); }
});

/* =================== BUCLE PRINCIPAL =================== */
let lastT = 0, boardT = 0, centerT = 0;
const AMBX = { clank: 6 };
renderer.setAnimationLoop((time, frame) => {
  const t = time / 1000, dt = Math.min(0.05, Math.max(0, t - lastT)); lastT = t;
  if (!xrActive && !preview) return;
  if (frame) readXR(frame, t); else previewInput(dt);
  head.speed = head.speed * 0.85 + (dt > 0 ? head.p.distanceTo(head.prev) / dt : 0) * 0.15; head.prev.copy(head.p);
  if (head.p.y > 1.1) { lastStandYaw = yawOf(head.q); if (!GAME_STATES.includes(state) && head.speed < 0.3) lastStandY += (head.p.y - lastStandY) * Math.min(1, dt * 0.8); }
  arena.updateMatrixWorld(); HL.copy(head.p); arena.worldToLocal(HL);
  updateListener(head.p, head.q);
  fingers.length = 0; for (const s of ['left', 'right']) if (hands[s].tipOk) fingers.push({ side: s, p: hands[s].tip });
  gameStep(dt, t);
  updateFX(dt); updateBolts(dt);
  updateGloves(dt);
  updateAim(t); throwStep(dt, t); updatePistol(dt); updateSwords(dt, t);
  updateWatch(dt); updateWristMenu(dt); updateOutcome(dt);
  updatePlace(dt); updateEquip(dt, t); roomStep(dt); updateRoomPlace(dt); updatePool(dt, t); updateVortex(dt, t); updateForest(dt, t); updateNature(dt, t); updateIsland(dt, t); spTick(dt);
  if (menu) { menu.age += dt; pokeWidgets(activeWidgets(), dt, menu.age > 0.5 && wristReady(), true); }
  updateViewPanels(dt); updateDemo(dt);
  updateEnv(dt, t);
  if (!arMode && !forestOn() && !ISL.group.visible && AUD.C) { AMBX.clank -= dt; if (AMBX.clank <= 0) { AMBX.clank = rand(5, 13); const a = rand(0, TAU); SND.clankFar(new V3(Math.cos(a) * 25, rand(2, 8), Math.sin(a) * 25)); } }
  centerT += dt; if (center.mesh.visible && centerT > 0.1) { centerT = 0; drawCenter(); }
  boardT += dt; if (boardDirty && boardT > 0.12) { drawBoard(); boardDirty = false; boardT = 0; }
  renderer.render(scene, camera);
});

/* =================== ENTRAR EN XR =================== */
let rigsBuilt = false;
function ensureRigs() { if (!rigsBuilt) { rigsBuilt = true; buildRigs(); } }
// La VR también va en una sesión de realidad mixta cuando las gafas la admiten: con el entorno opaco tapando la
// habitación es VR, y así se puede pasar de una a otra dentro del juego sin salir (setView)
const XRSUP = { ar: false, vr: false };
let xrAR = false;
function setView(v) {
  if (!xrAR || (v === 'mr') === arMode) return;
  arMode = v === 'mr'; applyEnvMode(); applyShadows(); boardDirty = true;
  say(arMode ? 'Realidad mixta' : 'Realidad virtual', '#3cf0c6', 1.2);
}
// Fila de los menús para cambiar de vista (solo si la sesión lo permite)
function viewRows(back) {
  if (!xrActive || preview || !xrAR) return [];
  return [{ t: 'choice', label: 'Vista', value: arMode ? 'mr' : 'vr', opts: [['mr', 'Realidad mixta'], ['vr', 'Realidad virtual']], onPick: v => { setView(v); back(); } }];
}
async function startXR(ar) {
  audioInit(); ensureRigs(); spPlayerUnlock(); // con el gesto de entrar, el reproductor de Spotify ya puede sonar
  try {
    const useAR = ar || XRSUP.ar;
    const session = await navigator.xr.requestSession(useAR ? 'immersive-ar' : 'immersive-vr', { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking', 'anchors', 'bounded-floor', ...(settings.roomMode !== 'off' ? ['plane-detection', 'mesh-detection'] : [])] }); // el escaneo, solo si se va a usar
    xrAR = useAR; arMode = ar && useAR; applyEnvMode(); applyShadows();
    await renderer.xr.setSession(session);
    xrActive = true; state = 'lobby'; anchorsInit(session); roomSessionStart(session);
    session.addEventListener('end', () => { endSession(); xrActive = false; anchorsEnd(); PLACE.on = PLACE.wait = false; EQ.edit = null; hideMenu(); resetWorld(); center.mesh.visible = false; toastP.mesh.visible = false; watch.mesh.visible = false; state = 'idle'; ambientStop(); renderHistory(); syncForm(); });
    // el gatillo del mando abre la pausa, salvo con las pistolas: entonces dispara (y la pausa va con X/Y)
    session.addEventListener('selectstart', e => { if (!e.inputSource.hand && GAME_STATES.includes(state) && !pistolOn() && !swordSet()) openPause(); });
    ambientStart();
    setTimeout(() => { arenaFromHead(); lastStandY = head.p.y > 1.1 ? head.p.y : 1.6; lobbyMenu(); }, 600);
  } catch (err) {
    $('#xrStatus').textContent = 'No se pudo iniciar la sesión: ' + (err && err.message ? err.message : err);
  }
}
$('#btnAR').addEventListener('click', () => startXR(true));
$('#btnVR').addEventListener('click', () => startXR(false));
async function checkXR() {
  const st = $('#xrStatus');
  if (!navigator.xr) {
    $('#btnAR').disabled = $('#btnVR').disabled = true;
    st.textContent = location.protocol !== 'https:' && location.hostname !== 'localhost' ? 'WebXR necesita que la página se sirva por HTTPS.' : 'Este navegador no tiene WebXR. Ábrelo en las Quest 3; aquí puedes usar la prueba en el ordenador.';
    return;
  }
  const [arOk, vrOk] = await Promise.all([navigator.xr.isSessionSupported('immersive-ar').catch(() => false), navigator.xr.isSessionSupported('immersive-vr').catch(() => false)]);
  XRSUP.ar = !!arOk; XRSUP.vr = !!vrOk;
  $('#btnAR').disabled = !arOk; $('#btnVR').disabled = !vrOk && !arOk;
  if (!arOk && !vrOk) st.textContent = 'Este dispositivo no admite sesiones inmersivas. Usa la prueba en el ordenador o abre la página en las Quest 3.';
}
settingHooks.push(k => { if (['mode', 'exercise', 'aim', 'foesGate', 'foesHatch', 'foesFly', 'pistol', '*'].includes(k) && preview) $('#cross').hidden = !aimManual(); });

/* =================== ARRANQUE =================== */
buildForm(); syncForm(); renderHistory(); checkXR(); layoutArena(); spInitPage(); sesInitPage(); profInitPage(); demoPage();
setTimeout(ensureRigs, 60);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { boardDirty = true; });
})();
