
/* =================== ENTRADA XR =================== */
let lastStandYaw = 0;
const _jm = new THREE.Matrix4(), _js = new V3();
let poseBuf = new Float32Array(25 * 16), radBuf = new Float32Array(25);
const jointCache = new WeakMap();
function readXR(frame) {
  const ref = renderer.xr.getReferenceSpace(); if (!ref) return;
  const pose = frame.getViewerPose(ref);
  if (pose) { const p = pose.transform.position, o = pose.transform.orientation; head.p.set(p.x, p.y, p.z); head.q.set(o.x, o.y, o.z, o.w); }
  for (const s of ['left', 'right']) { const h = hands[s]; h.ok = h.tipOk = h.pinch = h.rayOk = false; h.J.forEach(j => j.ok = false); }
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
      h.pinch = T.ok && Th.ok && T.p.distanceTo(Th.p) < 0.02;
    } else if (src.gripSpace) {
      h.isHand = false;
      const gp = frame.getPose(src.gripSpace, ref);
      if (gp) { const p = gp.transform.position, o = gp.transform.orientation; h.ok = true; h.wrist.set(p.x, p.y, p.z); h.wristQ.set(o.x, o.y, o.z, o.w); h.tip.copy(h.wrist).add(_js.set(0, -0.01, -0.075).applyQuaternion(h.wristQ)); h.tipOk = true; }
    }
  }
  anchorsFrame(frame, ref);
}

/* =================== PRUEBA EN EL ORDENADOR =================== */
const PV = { keys: {}, crouch: false, fall: false, handsUp: false, baseY: 1.6, y: 1.6, drag: null, widget: null, down: null, bar: false };
function previewInput(dt) {
  const dropAmt = isFloor() ? 0.19 : settings.mode === 'arcs' ? Math.max(settings.arcMin, settings.arcMax) / 100 + 0.08 : settings.squatDepth / 100 + 0.12;
  let target = PV.crouch && settings.exercise !== 'curl' ? PV.baseY - dropAmt : PV.baseY;
  // barras: Espacio sube (remo o dominada), F te suelta
  if (settings.exercise === 'superman') target = PV.crouch ? PV.baseY + settings.supRange / 100 + 0.05 : PV.baseY; // Espacio: subir el tronco
  if (PV.bar) target = PV.fall ? PV.baseY - 0.35 : PV.crouch && settings.exercise !== 'hang' ? PV.baseY + barReq() + 0.06 : PV.baseY;
  PV.y += clamp(target - PV.y, -0.75 * dt, 0.75 * dt);
  const sp = 1.6 * dt, yaw = camera.rotation.y, f = new V3(-Math.sin(yaw), 0, -Math.cos(yaw)), r = new V3(-f.z, 0, f.x);
  if (PV.keys.KeyW) camera.position.addScaledVector(f, sp); if (PV.keys.KeyS) camera.position.addScaledVector(f, -sp);
  if (PV.keys.KeyD) camera.position.addScaledVector(r, sp); if (PV.keys.KeyA) camera.position.addScaledVector(r, -sp);
  camera.position.y = PV.y; camera.updateMatrixWorld();
  head.p.copy(camera.position); head.q.copy(camera.quaternion);
  for (const s of ['left', 'right']) { const h = hands[s]; h.ok = h.tipOk = h.pinch = h.rayOk = false; }
  // H: las dos manos agarradas por encima de la cabeza (para colocar aparatos)
  // superman: los brazos estirados por delante de la cabeza
  if (settings.exercise === 'superman' && GAME_STATES.includes(state)) for (const [s, sg] of [['left', -1], ['right', 1]]) { const h = hands[s]; h.ok = true; h.isHand = false; h.wristQ.copy(camera.quaternion); h.wrist.copy(camera.position).addScaledVector(r, sg * 0.2).addScaledVector(f, PV.keys.KeyR ? 0.1 : 0.55); }
  // plancha con un brazo: las dos manos apoyadas junto a la cabeza; Q y E levantan la izquierda y la derecha
  if (settings.exercise === 'plank1' && GAME_STATES.includes(state)) for (const [s, sg, key] of [['left', -1, 'KeyQ'], ['right', 1, 'KeyE']]) {
    const h = hands[s], up = PV.keys[key]; h.ok = true; h.isHand = false; h.wristQ.copy(camera.quaternion);
    h.wrist.copy(camera.position).addScaledVector(r, sg * (up ? 0.45 : 0.22)).addScaledVector(f, up ? 0.15 : 0.05); h.wrist.y = up ? camera.position.y : 0.08;
  }
  if (PV.handsUp) for (const [s, sg] of [['left', -1], ['right', 1]]) { const h = hands[s]; h.ok = true; h.isHand = false; h.wrist.copy(camera.position).addScaledVector(r, sg * 0.3).addScaledVector(f, 0.12); h.wrist.y += 0.5; h.wristQ.copy(camera.quaternion); }
}
// En el ordenador, el modo Barras te pone colgado de la barra o tumbado bajo las paralelas
function previewBarPose(on) {
  if (on === PV.bar) return; PV.bar = on;
  const row = settings.exercise === 'row', e = eqPose();
  PV.baseY = !on ? (settings.exercise === 'superman' ? 0.22 : isFloor() ? 0.45 : 1.6) : row ? Math.max(0.2, settings.dipH / 100 - 0.5) : settings.doorH / 100 - 0.62; PV.y = PV.baseY;
  // tumbado con la cabeza junto al agarre (con una paralela, cruzado: la cabeza pasa la barra), o colgado justo detrás de la barra
  const one = row && dipOne();
  if (on) eqWorld(e, one ? 0.3 : 0, PV.baseY, one ? 0 : row ? 0.3 : 0.2, camera.position); else camera.position.set(0, PV.baseY, 0);
  camera.rotation.set(!on ? (isFloor() ? -0.7 : -0.12) : row ? 1.2 : 0.5, on ? e.yaw + (one ? Math.PI / 2 : 0) : 0, 0);
  head.p.copy(camera.position); head.prev.copy(head.p);
}
function startPreview() {
  audioInit(); ensureRigs();
  Object.assign(EQ.pv.door, { x: 0, z: -1.6, yaw: 0, set: true }); Object.assign(EQ.pv.dip, { x: 0, z: -1.9, yaw: 0, set: true }); PV.bar = PV.crouch = PV.fall = false;
  preview = true; arMode = false; $('#stage').hidden = false; $('#cross').hidden = settings.mode !== 'flyers';
  const sup = settings.exercise === 'superman';
  PV.baseY = sup ? 0.22 : isFloor() ? 0.45 : 1.6; PV.y = PV.baseY; lastStandY = 1.6; lastStandYaw = 0;
  camera.position.set(0, PV.baseY, 0); camera.rotation.set(sup ? -0.35 : isFloor() ? -0.7 : -0.12, 0, 0);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
  head.p.copy(camera.position); head.q.copy(camera.quaternion);
  arena.position.set(0, 0, 0); arena.rotation.set(0, 0, 0);
  applyEnvMode(); applyShadows(); ambientStart();
  state = 'lobby'; lobbyMenu(true);
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
  if (e.code === 'Escape') { if (PLACE.on || PLACE.wait) onWatch(); else if (GAME_STATES.includes(state)) openPause(); else if (state === 'paused') resumeGame(); }
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
  if (h && h.w === w) { SND.click(); w.onPress(); $('#cross').hidden = settings.mode !== 'flyers'; }
});

/* =================== BUCLE PRINCIPAL =================== */
let lastT = 0, boardT = 0, centerT = 0;
const AMBX = { clank: 6 };
renderer.setAnimationLoop((time, frame) => {
  const t = time / 1000, dt = Math.min(0.05, Math.max(0, t - lastT)); lastT = t;
  if (!xrActive && !preview) return;
  if (frame) readXR(frame); else previewInput(dt);
  head.speed = head.speed * 0.85 + (dt > 0 ? head.p.distanceTo(head.prev) / dt : 0) * 0.15; head.prev.copy(head.p);
  if (head.p.y > 1.1) { lastStandYaw = yawOf(head.q); if (!GAME_STATES.includes(state) && head.speed < 0.3) lastStandY += (head.p.y - lastStandY) * Math.min(1, dt * 0.8); }
  arena.updateMatrixWorld(); HL.copy(head.p); arena.worldToLocal(HL);
  updateListener(head.p, head.q);
  fingers.length = 0; for (const s of ['left', 'right']) if (hands[s].tipOk) fingers.push({ side: s, p: hands[s].tip });
  gameStep(dt, t);
  updateFX(dt);
  updateGloves(dt);
  updateAim(t);
  updateWatch(dt);
  updatePlace(dt); updateEquip(dt, t); updatePool(dt, t); spTick(dt);
  if (menu) { menu.age += dt; pokeWidgets(activeWidgets(), dt, menu.age > 0.5); }
  updateViewPanels(dt);
  updateEnv(dt, t);
  if (!arMode && AUD.C) { AMBX.clank -= dt; if (AMBX.clank <= 0) { AMBX.clank = rand(5, 13); const a = rand(0, TAU); SND.clankFar(new V3(Math.cos(a) * 25, rand(2, 8), Math.sin(a) * 25)); } }
  centerT += dt; if (center.mesh.visible && centerT > 0.1) { centerT = 0; drawCenter(); }
  boardT += dt; if (boardDirty && boardT > 0.12) { drawBoard(); boardDirty = false; boardT = 0; }
  renderer.render(scene, camera);
});

/* =================== ENTRAR EN XR =================== */
let rigsBuilt = false;
function ensureRigs() { if (!rigsBuilt) { rigsBuilt = true; buildRigs(); } }
async function startXR(ar) {
  audioInit(); ensureRigs();
  try {
    const session = await navigator.xr.requestSession(ar ? 'immersive-ar' : 'immersive-vr', { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking', 'anchors'] });
    arMode = ar; applyEnvMode(); applyShadows();
    await renderer.xr.setSession(session);
    xrActive = true; state = 'lobby'; anchorsInit(session);
    session.addEventListener('end', () => { xrActive = false; anchorsEnd(); PLACE.on = PLACE.wait = false; EQ.edit = null; hideMenu(); resetWorld(); center.mesh.visible = false; toastP.mesh.visible = false; watch.mesh.visible = false; state = 'idle'; ambientStop(); renderHistory(); syncForm(); });
    session.addEventListener('selectstart', e => { if (!e.inputSource.hand && GAME_STATES.includes(state)) openPause(); });
    ambientStart();
    setTimeout(() => { arenaFromHead(); lastStandY = head.p.y > 1.1 ? head.p.y : 1.6; lobbyMenu(true); }, 600);
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
  $('#btnAR').disabled = !arOk; $('#btnVR').disabled = !vrOk;
  if (!arOk && !vrOk) st.textContent = 'Este dispositivo no admite sesiones inmersivas. Usa la prueba en el ordenador o abre la página en las Quest 3.';
}
settingHooks.push(k => { if (k === 'mode' && preview) $('#cross').hidden = settings.mode !== 'flyers'; });

/* =================== ARRANQUE =================== */
buildForm(); syncForm(); renderHistory(); checkXR(); layoutArena(); spInitPage();
setTimeout(ensureRigs, 60);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { boardDirty = true; });
})();
