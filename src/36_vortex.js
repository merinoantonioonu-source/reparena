
/* =================== REMOLINO (Barras · Colgado) =================== */
// Otra cosa que puede haber debajo cuando estás colgado: un remolino que gira y quiere engullirte. Se abre
// al colgarte y se va cerrando a medida que aguantas, hasta cerrarse justo al cumplir el tiempo de la oleada. Si te
// sueltas antes, te engulle y la oleada termina.
// Es un embudo de verdad que se hunde bajo el suelo del bosque: un disco invisible marca la boca en el stencil y el
// suelo no se pinta ahí, así que en VR se ve el hueco con profundidad. Estrías magenta difuminadas que giran en
// espiral, más claras cuanto más hondo, hasta un núcleo blanco que brilla.
const vortexOn = () => isBars() && settings.exercise === 'hang' && settings.hangPit === 'vortex';
const VX = { R: 0, R0: 1.15, engulfT: 0, open: false, buzzT: 0, loop: null, motes: [] };
const VX_RMIN = 0.07, VX_D = 1.3;
// perfil del embudo (radio 1 en la boca): baja como un cono y se precipita en la garganta
const funY = r => -VX_D * ((1 - r) * 0.35 + 0.65 * (1 / Math.max(r, VX_RMIN) - 1) / (1 / VX_RMIN - 1));
// estrías en espiral logarítmica (a: ángulo, z: profundidad del túnel) que giran y fluyen hacia dentro
const SWIRL_GLSL = `
float vxHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); } // (sin seno: estable en las Quest)
float vxNoise(vec2 p, float P) { // ruido suave que da la vuelta entera en P celdas (sin costura en el ángulo)
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); float i1 = mod(i.x + 1.0, P); i.x = mod(i.x, P);
  return mix(mix(vxHash(i), vxHash(vec2(i1, i.y)), f.x), mix(vxHash(vec2(i.x, i.y + 1.0)), vxHash(vec2(i1, i.y + 1.0)), f.x), f.y);
}
vec3 swirl(float a, float z, float t, float spin, float flow) {
  float s = a + z * 2.2 - t * spin, u = s / 6.2831853, w = z * 8.0 - t * flow;
  // estrías largas a lo largo del giro y finas de través, como barridas por el movimiento
  float n = 0.5 * vxNoise(vec2(u * 5.0, w), 5.0) + 0.3 * vxNoise(vec2(u * 9.0, w * 2.1 + 3.0), 9.0) + 0.2 * vxNoise(vec2(u * 16.0, w * 4.3 + 7.0), 16.0);
  float b = n * 0.8 + (0.5 + 0.5 * sin(2.0 * s)) * 0.2;
  vec3 c = mix(vec3(0.2, 0.03, 0.11), vec3(0.62, 0.09, 0.33), smoothstep(0.25, 0.75, b));
  return c + vec3(0.9, 0.5, 0.7) * pow(smoothstep(0.55, 0.95, n), 2.0) * 0.8;
}`;
const vortexMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uSpin: { value: 1.6 }, uFlow: { value: 1.5 } }, side: THREE.DoubleSide,
  vertexShader: 'varying vec2 vUv; varying float vR; void main(){ vUv = uv; vR = length(position.xz); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform float uTime; uniform float uSpin; uniform float uFlow; varying vec2 vUv; varying float vR;${SWIRL_GLSL}
void main() {
  float d = vUv.y;
  vec3 c = swirl(vUv.x * 6.2831853, -log(max(vR, 0.02)), uTime, uSpin, uFlow);
  c *= 0.75 + 0.55 * smoothstep(0.0, 0.9, d);                  // más luz cuanto más hondo
  c += vec3(0.95, 0.35, 0.65) * pow(d, 3.0) * 0.4;
  c = mix(c, vec3(1.0, 0.9, 0.96), smoothstep(0.72, 1.0, d) * 0.95); // el núcleo, blanco
  c *= mix(0.35, 1.0, smoothstep(0.0, 0.1, d));                // la boca se funde con el suelo
  gl_FragColor = vec4(c, 1.0);
}` });
function funnelGeo(seg = 72, rings = 28) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= rings; j++) {
    const v = j / rings, r = 1 + (VX_RMIN - 1) * Math.pow(v, 0.6), y = funY(r);
    for (let i = 0; i <= seg; i++) { const a = i / seg * TAU; pos.push(Math.cos(a) * r, y, Math.sin(a) * r); uv.push(i / seg, v); }
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const A = j * (seg + 1) + i, B = A + seg + 1; idx.push(A, B, A + 1, B, B + 1, A + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
const vortex = new THREE.Group(); vortex.visible = false; scene.add(vortex);
const vxBody = new THREE.Group(); vortex.add(vxBody); // todo lo que encoge con el remolino (también en hondura)
// la boca: no pinta nada, solo marca el stencil para que el suelo del bosque deje ver el embudo
const vxMask = new THREE.Mesh(new THREE.CircleGeometry(1, 72), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp }));
vxMask.rotation.x = -Math.PI / 2; vxMask.renderOrder = -5; vxBody.add(vxMask);
Object.assign(forestGround.material, { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc });
vxBody.add(new THREE.Mesh(funnelGeo(), vortexMat));
const vxCore = new THREE.Mesh(new THREE.CircleGeometry(VX_RMIN, 24), new THREE.MeshBasicMaterial({ color: 0xfff0f8, toneMapped: false })); vxCore.rotation.x = -Math.PI / 2; vxCore.position.y = funY(VX_RMIN); vxBody.add(vxCore);
const vxHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.halo, color: 0xffa8d8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
vxHalo.scale.setScalar(0.7); vxHalo.position.y = funY(VX_RMIN) + 0.08; vxBody.add(vxHalo);
// su resplandor rosa ilumina desde abajo el árbol, la rama y tus manos (en el bosque: está centrado en la barra)
const vxLight = new THREE.PointLight(0xff4aa8, 0, 3.5, 2); vxLight.position.set(0, 0.3, 0); forest.add(vxLight);
// hojas y destellos que giran cada vez más deprisa y se deslizan embudo abajo
const leafTex = texFrom((() => { const c = mkCanvas(64), x = c.getContext('2d'); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(32, 4); x.quadraticCurveTo(58, 30, 32, 60); x.quadraticCurveTo(6, 30, 32, 4); x.fill(); return c; })());
for (let i = 0; i < 46; i++) {
  const leaf = i % 3 !== 0, m = new THREE.SpriteMaterial(leaf ? { map: leafTex, color: pick([0x3a2a14, 0x2c3a18, 0x4a3218]), transparent: true, depthWrite: false } : { map: TX.halo, color: 0xff8ac8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const s = new THREE.Sprite(m); s.scale.setScalar(leaf ? 0.05 : 0.035); vortex.add(s);
  VX.motes.push({ s, a: rand(0, TAU), f: rand(0.1, 1), h: rand(0.03, 0.3), leaf });
}
// Al engullirte ves el túnel girando a tu alrededor
const engulfMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uAmt: { value: 0 } }, transparent: true, depthTest: false, depthWrite: false,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform float uTime; uniform float uAmt; varying vec2 vUv;${SWIRL_GLSL}
void main() {
  vec2 p = (vUv - 0.5) * vec2(1.8, 1.4) / 0.7; float r = length(p);
  vec3 c = swirl(atan(p.y, p.x), -log(max(r, 0.02)) * 1.3, uTime, 6.0, 4.0) * (0.7 + 0.6 * exp(-r * 3.0));
  c = mix(c, vec3(1.0, 0.9, 0.96), exp(-r * r * 30.0));
  gl_FragColor = vec4(c, uAmt);
}` });
const engulfPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.4), engulfMat); engulfPlane.renderOrder = 41; engulfPlane.visible = false; scene.add(engulfPlane);

// Te soltaste: el remolino te traga, pierdes una vida y la oleada termina
function vortexEngulf() {
  const at = new V3(head.p.x, 0.05, head.p.z);
  VX.engulfT = 1.4; SND.engulf(at); hapticBoth(1, 350);
  for (let i = 0; i < 30; i++) fx.trail(at.clone().add(new V3(rand(-0.5, 0.5), rand(0, 1.4), rand(-0.5, 0.5))), [0.9, 0.3, 0.6], 0.08, 0.6);
  hurtPlayer({ silent: true }); if (state === 'end') return;
  say('¡TE ENGULLÓ EL REMOLINO!', '#ff6ab4', 2); BAR.failed = true;
}
function updateVortex(dt, t) {
  const on = vortexOn() && state !== 'idle' && eqKind() === 'door';
  // abierto del todo mientras te cuelgas; colgado, se cierra con el tiempo que aguantas; cerrado al descansar
  const target = !on ? 0 : state === 'mount' ? 1 : state === 'play' ? clamp(1 - BAR.hold / Math.max(1, BAR.need), 0, 1) : 0;
  const was = VX.R; VX.R += (target - VX.R) * Math.min(1, dt * (state === 'play' ? 8 : 2.5));
  if (on && was > 0.04 && VX.R <= 0.04 && state !== 'mount') { const c = new V3(vortex.position.x, 0.05, vortex.position.z); SND.vortexClose(c); fx.glow(c, [1, 0.5, 0.8], 0.6, 0.2); hapticBoth(0.5, 80); }
  vortex.visible = on && VX.R > 0.01;
  vxLight.intensity = vortex.visible ? 1.6 * Math.min(1, VX.R * 2) : 0;
  if (VX.engulfT > 0) { VX.engulfT -= dt; const k = 1 - VX.engulfT / 1.4; engulfMat.uniforms.uAmt.value = Math.sin(Math.PI * clamp(k, 0, 1)) * 0.92; engulfMat.uniforms.uTime.value = t % 600; engulfPlane.visible = true; headLocal(_hl.set(0, 0, -0.25), engulfPlane.position); engulfPlane.quaternion.copy(head.q); }
  else engulfPlane.visible = false;
  if (!vortex.visible) { if (VX.loop) { VX.loop.stop(); VX.loop = null; } return; }
  const e = eqPose('door'), R = VX.R0 * VX.R; vortex.position.set(e.x, 0, e.z); vortex.rotation.y = e.yaw;
  vxBody.scale.setScalar(R);
  vortexMat.uniforms.uTime.value = t % 600; vortexMat.uniforms.uSpin.value = 1.6 + (1 - VX.R) * 2 + (VX.engulfT > 0 ? 4 : 0); vortexMat.uniforms.uFlow.value = 1.5 + (1 - VX.R);
  vxHalo.material.opacity = 0.6 + 0.25 * Math.sin(t * 3.1);
  for (const m of VX.motes) {
    m.a += dt * (0.8 + 1.6 / Math.max(0.15, m.f)); m.f -= dt * (0.18 + (VX.engulfT > 0 ? 0.6 : 0));
    if (m.f <= VX_RMIN) { m.f = 1; m.a = rand(0, TAU); m.h = rand(0.03, 0.3); }
    m.s.position.set(Math.cos(m.a) * m.f * R, funY(m.f) * R + m.h * m.f + 0.02, Math.sin(m.a) * m.f * R); m.s.material.opacity = Math.min(1, (m.f - VX_RMIN) * 4) * (m.leaf ? 0.9 : 0.8);
    m.s.material.rotation = m.a * 2;
  }
  // succión que se apaga al cerrarse, y los mandos vibran suavemente mientras está abierto
  if (!VX.loop && AUD.C) VX.loop = suctionLoop(vortex.position);
  if (VX.loop) VX.loop.set(vortex.position, VX.R);
  VX.buzzT -= dt; if (state === 'play' && VX.buzzT <= 0) { VX.buzzT = 0.6; hapticBoth(0.04 + 0.12 * VX.R, 40); }
}
