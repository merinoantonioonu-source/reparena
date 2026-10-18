
/* =================== REMOLINO (Barras · Colgado) =================== */
// Otra cosa que puede haber debajo cuando estás colgado: un remolino oscuro que gira y quiere engullirte. Se abre
// al colgarte y se va cerrando a medida que aguantas, hasta cerrarse justo al cumplir el tiempo de la oleada. Si te
// sueltas antes, te engulle y la oleada termina.
const vortexOn = () => isBars() && settings.exercise === 'hang' && settings.hangPit === 'vortex';
const VX = { R: 0, R0: 1.15, engulfT: 0, open: false, buzzT: 0, loop: null, motes: [] };
const VORTEX_FS = `uniform float uTime; uniform float uOpen; uniform float uSpin; varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
  float a = atan(p.y, p.x), lr = log(max(r, 0.02));
  float arms = 0.5 + 0.5 * sin(a * 3.0 + lr * 6.0 + uTime * uSpin);
  float streak = 0.5 + 0.5 * sin(a * 11.0 - lr * 14.0 + uTime * uSpin * 1.6);
  vec3 swirl = mix(vec3(0.04, 0.02, 0.1), vec3(0.33, 0.14, 0.58), arms) + vec3(0.25, 0.65, 0.95) * pow(streak, 6.0) * 0.55;
  vec3 col = mix(vec3(0.0), swirl, pow(smoothstep(0.0, 1.0, r), 1.3)); // el centro, negro y sin fondo
  float rim = smoothstep(0.8, 0.96, r) * (1.0 - smoothstep(0.96, 1.0, r));
  col += vec3(0.55, 0.82, 1.0) * rim * (0.75 + 0.35 * sin(a * 6.0 - uTime * 5.0));
  gl_FragColor = vec4(col, (1.0 - smoothstep(0.97, 1.0, r)) * uOpen);
}`;
const vortexMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uOpen: { value: 1 }, uSpin: { value: 3 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: VORTEX_FS, transparent: true, depthWrite: false });
const vortex = new THREE.Group(); vortex.visible = false; scene.add(vortex);
const vortexDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 96), vortexMat); vortexDisc.rotation.x = -Math.PI / 2; vortexDisc.position.y = 0.006; vortexDisc.renderOrder = 1; vortex.add(vortexDisc);
// hojas y destellos que giran cada vez más deprisa hacia el centro y se hunden
const leafTex = texFrom((() => { const c = mkCanvas(64), x = c.getContext('2d'); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(32, 4); x.quadraticCurveTo(58, 30, 32, 60); x.quadraticCurveTo(6, 30, 32, 4); x.fill(); return c; })());
for (let i = 0; i < 46; i++) {
  const leaf = i % 3 !== 0, m = new THREE.SpriteMaterial(leaf ? { map: leafTex, color: pick([0x3a2a14, 0x2c3a18, 0x4a3218]), transparent: true, depthWrite: false } : { map: TX.halo, color: 0x9fd4ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const s = new THREE.Sprite(m); s.scale.setScalar(leaf ? 0.05 : 0.035); vortex.add(s);
  VX.motes.push({ s, a: rand(0, TAU), f: rand(0.1, 1), h: rand(0.05, 0.35), leaf });
}
// Oscurece la vista al engullirte
const engulfMat = new THREE.MeshBasicMaterial({ map: texFrom((() => { const c = mkCanvas(128), x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 10, 64, 64, 64); g.addColorStop(0, 'rgba(10,0,25,0.6)'); g.addColorStop(1, 'rgba(10,0,25,1)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return c; })()), transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
const engulfPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.4), engulfMat); engulfPlane.renderOrder = 41; engulfPlane.visible = false; scene.add(engulfPlane);

// Te soltaste: el remolino te traga, pierdes una vida y la oleada termina
function vortexEngulf() {
  const at = new V3(head.p.x, 0.05, head.p.z);
  VX.engulfT = 1.4; SND.engulf(at); hapticBoth(1, 350);
  for (let i = 0; i < 30; i++) fx.trail(at.clone().add(new V3(rand(-0.5, 0.5), rand(0, 1.4), rand(-0.5, 0.5))), [0.5, 0.3, 0.9], 0.08, 0.6);
  hurtPlayer({ silent: true }); if (state === 'end') return;
  say('¡TE ENGULLÓ EL REMOLINO!', '#b48cff', 2); BAR.failed = true;
}
function updateVortex(dt, t) {
  const on = vortexOn() && state !== 'idle' && eqKind() === 'door';
  // abierto del todo mientras te cuelgas; colgado, se cierra con el tiempo que aguantas; cerrado al descansar
  const target = !on ? 0 : state === 'mount' ? 1 : state === 'play' ? clamp(1 - BAR.hold / Math.max(1, BAR.need), 0, 1) : 0;
  const was = VX.R; VX.R += (target - VX.R) * Math.min(1, dt * (state === 'play' ? 8 : 2.5));
  if (on && was > 0.04 && VX.R <= 0.04 && state !== 'mount') { const c = new V3(vortex.position.x, 0.05, vortex.position.z); SND.vortexClose(c); fx.glow(c, [0.6, 0.8, 1], 0.6, 0.2); hapticBoth(0.5, 80); }
  vortex.visible = on && VX.R > 0.01;
  if (VX.engulfT > 0) { VX.engulfT -= dt; const k = 1 - VX.engulfT / 1.4; engulfMat.opacity = Math.sin(Math.PI * clamp(k, 0, 1)) * 0.9; engulfPlane.visible = true; headLocal(_hl.set(0, 0, -0.25), engulfPlane.position); engulfPlane.quaternion.copy(head.q); }
  else engulfPlane.visible = false;
  if (!vortex.visible) { if (VX.loop) { VX.loop.stop(); VX.loop = null; } return; }
  const e = eqPose('door'), R = VX.R0 * VX.R; vortex.position.set(e.x, 0, e.z); vortex.rotation.y = e.yaw;
  vortexDisc.scale.set(R, R, 1);
  vortexMat.uniforms.uTime.value = t; vortexMat.uniforms.uSpin.value = 3 + (1 - VX.R) * 4 + (VX.engulfT > 0 ? 8 : 0); vortexMat.uniforms.uOpen.value = Math.min(1, VX.R * 4);
  for (const m of VX.motes) {
    m.a += dt * (0.8 + 1.6 / Math.max(0.15, m.f)); m.f -= dt * (0.18 + (VX.engulfT > 0 ? 0.6 : 0));
    if (m.f <= 0.05) { m.f = 1; m.a = rand(0, TAU); m.h = rand(0.05, 0.35); }
    m.s.position.set(Math.cos(m.a) * m.f * R, m.h * m.f + 0.02, Math.sin(m.a) * m.f * R); m.s.material.opacity = Math.min(1, m.f * 3) * (m.leaf ? 0.9 : 0.8);
    m.s.material.rotation = m.a * 2;
  }
  // succión que se apaga al cerrarse, y los mandos vibran suavemente mientras está abierto
  if (!VX.loop && AUD.C) VX.loop = suctionLoop(vortex.position);
  if (VX.loop) VX.loop.set(vortex.position, VX.R);
  VX.buzzT -= dt; if (state === 'play' && VX.buzzT <= 0) { VX.buzzT = 0.6; hapticBoth(0.04 + 0.12 * VX.R, 40); }
}
