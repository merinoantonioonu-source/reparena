
/* =================== ESPADAS (con los mandos) =================== */
// Una o dos espadas, metálica o láser. En Combate contra robots cada sentadilla carga la hoja y los robots se derriban a tajos:
// solo cuenta un tajo rápido (la velocidad mínima se ajusta) y sin carga la hoja rebota en el blindaje. Si el robot
// avisa de un golpe, se para poniendo la espada donde marca (los medios y bajos, agachado) y queda aturdido: el
// contraataque hace el doble. En Toques se cortan bloques en la dirección de su flecha. Los mandos vibran con cada
// contacto, golpe, bloqueo, disparo y recarga.
const SWD = { perf: [], beatT: 0, clashT: 0, hintT: 0, s: {} };
const SWORD_COL = { left: 0x4aa8ff, right: 0xff7a2a };
const swordSides = () => !swordSet() ? [] : settings.sword === 'two' ? ['left', 'right'] : [settings.swordHand];
const swordCap = () => settings.sword === 'two' ? 4 : 3;
// La espada de esa mano está en uso: ajuste activo, en partida y con el mando (con las manos no hay espada)
const swordIn = side => swordSides().includes(side) && hands[side].ok && !hands[side].isHand && GAME_STATES.includes(state);
const swordActive = () => ['left', 'right'].some(swordIn);
const swordLen = () => settings.swordKind === 'laser' ? 0.95 : 0.85;

/* ---------- Vibración de los mandos ---------- */
function haptic(side, v, ms) {
  const h = hands[side]; if (!h || h.isHand || !h.pad) return;
  const p = h.pad, a = p.hapticActuators && p.hapticActuators[0];
  try {
    if (a && a.pulse) a.pulse(clamp(v, 0, 1), ms);
    else if (p.vibrationActuator && p.vibrationActuator.playEffect) p.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: clamp(v, 0, 1), weakMagnitude: clamp(v, 0, 1) });
  } catch (e) {}
}
const hapticBoth = (v, ms) => { haptic('left', v, ms); haptic('right', v, ms); };

/* ---------- Modelos ---------- */
// El origen es el agarre del mando y la hoja sale por −Z (como un objeto que se sostiene en el puño)
const M_BLADE = std({ color: 0xdfe4ea, metalness: 1, roughness: 0.14, envMapIntensity: 1.8 });
const M_GUARD = std({ color: 0xb08a3c, metalness: 1, roughness: 0.3, envMapIntensity: 1.4 });
const M_GRIP = std({ color: 0x2a1a12, metalness: 0, roughness: 0.85 });
const M_HILT = std({ color: 0x9aa0aa, metalness: 1, roughness: 0.25, envMapIntensity: 1.4 });
function makeSword(side) {
  const col = SWORD_COL[side], g = new THREE.Group(), S = { side, g, prev: [], cur: [], had: false, speed: 0, vel: new V3(), tipPrev: new V3(), swishT: 0, hitCool: new Map(), hum: null, glow: 0 };
  // metálica: hoja de acero con nervio central, guarda dorada, empuñadura de cuero y pomo; filo que brilla cargada
  const L = 0.85, met = new THREE.Group(); g.add(met); S.metal = met;
  const blade = new THREE.Mesh(mergeGeos([xform(G.box(0.044, 0.005, L - 0.09), 0, 0, -0.1 - (L - 0.09) / 2), xform(G.box(0.01, 0.009, L - 0.12), 0, 0, -0.1 - (L - 0.12) / 2), xform(new THREE.ConeGeometry(0.022, 0.09, 4), 0, 0, -0.1 - L + 0.045, -Math.PI / 2, Math.PI / 4, 0, 1, 1, 0.16)]), M_BLADE);
  blade.castShadow = true; met.add(blade);
  const guard = new THREE.Mesh(mergeGeos([xform(G.box(0.2, 0.022, 0.03), 0, 0, -0.088), xform(G.sph(0.016, 10, 8), 0.1, 0, -0.088), xform(G.sph(0.016, 10, 8), -0.1, 0, -0.088), xform(G.sph(0.022, 12, 10), 0, 0, 0.1)]), M_GUARD); guard.castShadow = true; met.add(guard);
  const grip = new THREE.Mesh(xform(G.cyl(0.019, 0.021, 0.17, 12), 0, 0, 0.003, Math.PI / 2, 0, 0), M_GRIP); grip.castShadow = true; met.add(grip);
  S.edgeMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(G.box(0.007, 0.009, L - 0.1), S.edgeMat); e.position.set(s * 0.021, 0, -0.1 - (L - 0.1) / 2); met.add(e); }
  // láser: empuñadura metálica con anillos y un haz de energía del color de esa mano, que ilumina lo que tiene cerca
  const LL = 0.95, las = new THREE.Group(); g.add(las); S.laser = las;
  const hilt = new THREE.Mesh(mergeGeos([xform(G.cyl(0.02, 0.022, 0.24, 14), 0, 0, -0.01, Math.PI / 2, 0, 0), ...[-0.08, -0.03, 0.02, 0.07].map(z => xform(G.tor(0.022, 0.003, 4, 16), 0, 0, z)), xform(G.cyl(0.026, 0.022, 0.03, 14), 0, 0, -0.125, Math.PI / 2, 0, 0)]), M_HILT); hilt.castShadow = true; las.add(hilt);
  S.coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  S.beamMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  S.haloMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  for (const [r, m] of [[0.007, S.coreMat], [0.02, S.beamMat], [0.042, S.haloMat]]) { const b = new THREE.Mesh(xform(G.cylRaw(r, r, LL, 12), 0, 0, -0.14 - LL / 2, Math.PI / 2, 0, 0), m); las.add(b); }
  S.light = new THREE.PointLight(col, 0, 2.4, 2); S.light.position.set(0, 0, -0.14 - LL / 2); las.add(S.light);
  g.visible = false; scene.add(g);
  return S;
}
SWD.s.left = makeSword('left'); SWD.s.right = makeSword('right');
// Puntos de la hoja (de la guarda a la punta) en el mundo
const _wv1 = new V3(), _wv2 = new V3(), _sr = new V3();
function bladePoint(S, k, out) { const L = swordLen(), z = settings.swordKind === 'laser' ? -0.14 - L * k : -0.1 - L * k; return S.g.localToWorld(out.set(0, 0, z)); }
const BLADE_N = 6;

/* ---------- Carga (Combate): cada sentadilla carga una vez la hoja ---------- */
function swordCharge(perfect) {
  SWD.perf.push(perfect); while (SWD.perf.length > swordCap()) SWD.perf.shift();
  for (const s of swordSides()) if (swordIn(s)) { haptic(s, 0.3, 30); fx.glow(bladePoint(SWD.s[s], 0.5, new V3()), [0.4, 1, 0.9], 0.2, 0.15); }
  SND.charge(); boardDirty = true;
}
const swordCharged = () => settings.mode === 'touch' || SWD.perf.length > 0;
function swordReset() { SWD.perf.length = 0; for (const s of ['left', 'right']) { const S = SWD.s[s]; S.had = false; S.hitCool.clear(); if (S.hum) { S.hum.stop(); S.hum = null; } S.g.visible = false; } }

/* ---------- Cada fotograma ---------- */
function updateSwords(dt, t) {
  SWD.clashT -= dt; SWD.hintT -= dt;
  const laser = settings.swordKind === 'laser';
  for (const side of ['left', 'right']) {
    const S = SWD.s[side], on = swordIn(side), h = hands[side];
    S.g.visible = on; S.metal.visible = !laser; S.laser.visible = laser;
    if (!on) { S.had = false; S.speed = 0; if (S.hum) { S.hum.stop(); S.hum = null; } continue; }
    S.g.position.copy(h.wrist); S.g.quaternion.copy(h.wristQ); S.g.updateMatrixWorld(true);
    [S.prev, S.cur] = [S.cur, S.prev];
    for (let i = 0; i < BLADE_N; i++) bladePoint(S, i / (BLADE_N - 1), S.cur[i] || (S.cur[i] = new V3()));
    if (!S.had) for (let i = 0; i < BLADE_N; i++) (S.prev[i] || (S.prev[i] = new V3())).copy(S.cur[i]);
    const tip = S.cur[BLADE_N - 1];
    S.vel.subVectors(tip, S.had ? S.prev[BLADE_N - 1] : tip).divideScalar(Math.max(dt, 1e-3));
    S.speed = S.speed * 0.4 + S.vel.length() * 0.6; S.had = true;
    // silbido (o zumbido que sube) al cortar el aire
    S.swishT -= dt;
    if (S.speed > settings.swordSpeed * 0.8 && S.swishT <= 0) { S.swishT = 0.3; SND.swordSwish(tip, laser, S.speed); }
    if (laser && !S.hum && AUD.C) S.hum = saberLoop(tip);
    if (S.hum) S.hum.set(tip, S.speed);
    // carga: el filo brilla (o el haz se aviva) y el mando late suavemente
    const ch = swordCharged(), glow = ch ? 0.7 + 0.3 * Math.sin(t * 6) : 0;
    S.glow += (glow - S.glow) * Math.min(1, dt * 8);
    S.edgeMat.opacity = S.glow;
    S.beamMat.opacity = 0.22 + S.glow * 0.5; S.haloMat.opacity = 0.08 + S.glow * 0.14; S.light.intensity = laser ? 0.35 + S.glow * 0.6 : 0;
    for (const [e, c] of S.hitCool) if (t - c > 0.6) S.hitCool.delete(e);
  }
  if (isCombat() && swordActive() && SWD.perf.length && ['play', 'rest'].includes(state)) { SWD.beatT -= dt; if (SWD.beatT <= 0) { SWD.beatT = 0.9; for (const s of swordSides()) if (swordIn(s)) haptic(s, 0.08, 20); } }
  if (swordIn('left') && swordIn('right')) swordClash(t);
  if (isCombat() && ['play', 'rest'].includes(state)) for (const side of ['left', 'right']) if (swordIn(side)) swordVsRobots(SWD.s[side], t);
}
// Distancia entre los segmentos a-b y c-d (y el punto más cercano en el primero)
const _d1 = new V3(), _d2 = new V3(), _r0 = new V3();
function segSeg(a, b, c, d, outP) {
  _d1.subVectors(b, a); _d2.subVectors(d, c); _r0.subVectors(a, c);
  const A = _d1.dot(_d1), E = _d2.dot(_d2), F = _d2.dot(_r0); let s = 0, u = 0;
  if (A < 1e-9 && E < 1e-9) { if (outP) outP.copy(a); return _r0.length(); }
  if (A < 1e-9) u = clamp(F / E, 0, 1);
  else { const C = _d1.dot(_r0); if (E < 1e-9) s = clamp(-C / A, 0, 1); else { const B = _d1.dot(_d2), den = A * E - B * B; s = den > 1e-9 ? clamp((B * F - C * E) / den, 0, 1) : 0; u = (B * s + F) / E; if (u < 0) { u = 0; s = clamp(-C / A, 0, 1); } else if (u > 1) { u = 1; s = clamp((B - C) / A, 0, 1); } } }
  const p = _wv1.copy(a).addScaledVector(_d1, s), q = _wv2.copy(c).addScaledVector(_d2, u); if (outP) outP.copy(p); return p.distanceTo(q);
}
// Las dos hojas se cruzan deprisa: choque
function swordClash(t) {
  const A = SWD.s.left, B = SWD.s.right; if (SWD.clashT > 0) return;
  const rel = _sr.subVectors(A.vel, B.vel).length(); if (rel < 1) return;
  const p = new V3(); if (segSeg(A.cur[0], A.cur[BLADE_N - 1], B.cur[0], B.cur[BLADE_N - 1], p) > 0.03) return;
  SWD.clashT = 0.25; const laser = settings.swordKind === 'laser';
  SND.swordClang(p, laser, rel); fx.sparks(p, laser ? 16 : 22, laser ? [0.6, 0.9, 1] : [1, 0.75, 0.35], 2.5, 0.03); hapticBoth(0.8, 50);
}

/* ---------- Combate: tajos contra los robots ---------- */
// El robot es una cápsula vertical; cada punto de la hoja barre desde el fotograma anterior
const _ca = new V3(), _cb = new V3(), _hp = new V3();
function swordVsRobots(S, t) {
  const laser = settings.swordKind === 'laser';
  for (const e of enemies) {
    if (!e.alive || e.type !== 'robot' || e.state === 'emerge') continue;
    const sc = e.sc, rad = 0.33 * sc;
    arena.localToWorld(_ca.set(e.pos.x, 0.25 * sc, e.pos.z)); arena.localToWorld(_cb.set(e.pos.x, 1.95 * sc, e.pos.z));
    let hit = false;
    for (let i = 1; i < BLADE_N && !hit; i++) if (segSeg(S.prev[i], S.cur[i], _ca, _cb, _hp) < rad) hit = true;
    if (!hit) continue;
    const last = S.hitCool.get(e); if (last !== undefined && t - last < 0.45) continue; // un tajo, un golpe
    S.hitCool.set(e, t);
    const p = _hp.clone();
    if (S.speed < settings.swordSpeed) { // roce lento: vibra un poco, no hace daño
      haptic(S.side, 0.25, 20); fx.sparks(p, 3, [1, 0.8, 0.5], 0.8, 0.02); SND.swordClang(p, laser, 0.6);
      if (SWD.hintT <= 0) { SWD.hintT = 2.5; say('¡Más rápido! Un tajo amplio', '#ff8a3d', 1); }
      continue;
    }
    if (e.stunT > 0) { // contraataque: daño doble, no gasta carga
      const perfect = SWD.perf.length ? SWD.perf.shift() : true, dmg = (perfect ? 2 : 1) * 2;
      swordStrike(S, e, p, dmg, true); continue;
    }
    if (!SWD.perf.length) { // sin carga rebota
      haptic(S.side, 0.6, 40); fx.sparks(p, 10, [1, 0.7, 0.3], 2, 0.03); SND.swordClang(p, laser, S.speed);
      if (SWD.hintT <= 0) { SWD.hintT = 2.5; say('Sin carga: ¡haz una sentadilla!', '#ff8a3d', 1.1); }
      continue;
    }
    const perfect = SWD.perf.shift(); boardDirty = true;
    swordStrike(S, e, p, perfect ? 2 : 1, false);
  }
}
function swordStrike(S, e, p, dmg, counter) {
  const laser = settings.swordKind === 'laser';
  haptic(S.side, clamp(0.45 + S.speed * 0.1, 0.45, 1), 80);
  SND.swordHit(p, laser); fx.sparks(p, 22, laser ? boltRGB(1) : [1, 0.7, 0.3], 3, 0.04); fx.glow(p, laser ? [0.5, 0.9, 1] : [1, 0.85, 0.6], 0.5, 0.1);
  if (laser) fx.electric(p, 10);
  stats.hits++; stats.shots++;
  if (counter) say('¡CONTRAATAQUE!', '#ffd166', 0.9);
  e.onHit(dmg, true, p); if (!e.alive) onKilled(e);
}

/* ---------- Combate: bloquear el golpe del robot ---------- */
// Al preparar el golpe el robot marca a qué altura irá: alto (cabeza), medio (pecho) o bajo (cadera). Se para con la
// hoja en esa marca; los medios y bajos, además, agachado (sentadilla o zancada)
const BLOCK_Z = { high: { dy: -0.02, crouch: 0, col: 0xffd166, txt: 'ALTO' }, mid: { dy: -0.42, crouch: 0.5, col: 0xff8a3d, txt: 'MEDIO: ¡agáchate!' }, low: { dy: -0.7, crouch: 0.85, col: 0xff3b5c, txt: 'BAJO: ¡agáchate más!' } };
const blockOn = () => isCombat() && swordActive() && !!settings.swordBlock;
const blockTex = texFrom((() => { const c = mkCanvas(128), x = c.getContext('2d'); x.strokeStyle = '#fff'; x.lineWidth = 10; x.beginPath(); x.arc(64, 64, 48, 0, TAU); x.stroke(); x.lineWidth = 6; x.beginPath(); x.moveTo(24, 64); x.lineTo(104, 64); x.stroke(); return c; })());
function blockStart(r) {
  r.zone = pick(['high', 'mid', 'mid', 'low']); r.blocked = false;
  if (!r.zoneSpr) { r.zoneSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: blockTex, transparent: true, depthWrite: false, toneMapped: false })); r.zoneSpr.renderOrder = 22; scene.add(r.zoneSpr); }
  r.zoneSpr.material.color.setHex(BLOCK_Z[r.zone].col); r.zoneSpr.visible = true;
  say('Golpe ' + BLOCK_Z[r.zone].txt, '#' + BLOCK_Z[r.zone].col.toString(16).padStart(6, '0'), 1.0);
}
// Dónde para el golpe: entre tú y el robot, a la altura marcada (respecto a tu altura de pie)
function blockPoint(r, out) {
  const dx = r.pos.x - HL.x, dz = r.pos.z - HL.z, d = Math.hypot(dx, dz) || 1;
  return arena.localToWorld(out.set(HL.x + dx / d * 0.5, calibRef + BLOCK_Z[r.zone].dy, HL.z + dz / d * 0.5));
}
// Durante la preparación y el golpe: ¿hay una hoja en la marca y la postura es la pedida?
function blockStep(r, t) {
  const p = blockPoint(r, _hp), Z = BLOCK_Z[r.zone], s = 0.38 + 0.08 * Math.sin(t * 14);
  r.zoneSpr.position.copy(p); r.zoneSpr.scale.set(s, s, 1);
  const low = !Z.crouch || head.p.y < calibRef - Z.crouch * settings.squatDepth / 100; // el alto se para de pie
  if (r.blocked) return;
  for (const side of ['left', 'right']) {
    if (!swordIn(side)) continue; const S = SWD.s[side];
    let near = false; for (let i = 1; i < BLADE_N; i++) if (S.cur[i].distanceTo(p) < 0.25) near = true;
    if (!near) continue;
    if (!low) { if (SWD.hintT <= 0) { SWD.hintT = 1.2; say('¡Agáchate para parar el golpe!', '#ff8a3d', 0.9); } continue; }
    r.blocked = side; return;
  }
}
// Al llegar el golpe: parado (el robot queda aturdido) o no (te da)
function blockResolve(r) {
  if (r.zoneSpr) r.zoneSpr.visible = false;
  if (!r.blocked) return false;
  const p = blockPoint(r, new V3()), laser = settings.swordKind === 'laser';
  SND.swordBlock(p, laser); fx.sparks(p, 30, laser ? [0.6, 0.9, 1] : [1, 0.75, 0.35], 3, 0.04); fx.glow(p, [1, 0.9, 0.7], 0.6, 0.12);
  haptic(r.blocked, 1, 80); haptic(r.blocked === 'left' ? 'right' : 'left', 0.4, 40);
  score += 100; combo++; stats.bestCombo = Math.max(stats.bestCombo, combo); boardDirty = true;
  say('¡BLOQUEADO! Contraataca', '#3cf0c6', 1.2);
  return true;
}
function blockCancel(r) { if (r.zoneSpr) r.zoneSpr.visible = false; }

/* ---------- Toques: cortes con la espada ---------- */
// ¿Corta alguna hoja este bloque? Tiene que atravesarlo deprisa y en la dirección de la flecha (en su plano)
function swordCutTest(x) {
  let tried = false;
  for (const side of ['left', 'right']) {
    if (!swordIn(side) || (x.hand && settings.sword === 'two' && side !== x.hand)) continue;
    const S = SWD.s[side]; let hit = false;
    for (let i = 1; i < BLADE_N && !hit; i++) { arena.worldToLocal(_ca.copy(S.prev[i])).sub(x.prevPos); arena.worldToLocal(_cb.copy(S.cur[i])).sub(x.root.position); if (segDist(_ca, _cb) < 0.14) hit = true; }
    if (!hit) continue; tried = true;
    if (S.speed < settings.swordSpeed * 0.8) { haptic(side, 0.2, 15); continue; }
    // dirección del tajo en coordenadas de la arena, proyectada en el plano del bloque
    _sr.copy(S.vel).applyAxisAngle(_up, -arena.rotation.y); const n = x.normal, full = _sr.length(); _sr.addScaledVector(n, -_sr.dot(n)); // sin normalizar: es una velocidad
    // lo que cuenta es el tajo de lado a lado del bloque (deprisa y casi todo en su plano), no la estocada hacia él
    if (_sr.length() < settings.swordSpeed * 0.6 || _sr.length() < full * 0.7) { haptic(side, 0.2, 15); continue; }
    if (_sr.normalize().dot(x.cutDir) < 0.4) { touchHint('Corta en la dirección de la flecha'); continue; }
    return side;
  }
  if (tried) return null;
  return null;
}
