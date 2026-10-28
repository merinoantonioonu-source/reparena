/* =================== SUPERMAN: LA BOLA DE ENERGÍA =================== */
// Aguantando arriba en el superman, entre las manos se forma una bola roja de energía que se va cargando: un núcleo
// esférico sólido, de plasma que hierve y late, y a su alrededor una capa de rayos (venas eléctricas sobre la esfera, que
// cambian a saltos) que crece con el tiempo aguantado; desde la mitad de la carga sale una segunda capa más grande y
// filamentos finos que se escapan hacia fuera. Al disparar estalla y sale el rayo; si bajas antes, se deshace en chispas.
// k: lo cargada que está (0 al subir, 1 al cumplir los segundos pedidos)
const SORB_NOISE = `
  float sh3(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); } // (sin seno: en las Quest no pierde precisión)
  float sn3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(sh3(i), sh3(i + vec3(1,0,0)), f.x), mix(sh3(i + vec3(0,1,0)), sh3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(sh3(i + vec3(0,0,1)), sh3(i + vec3(1,0,1)), f.x), mix(sh3(i + vec3(0,1,1)), sh3(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float sfbm(vec3 p){ float v = 0.0, a = 0.55; for (int i = 0; i < 4; i++) { v += a * sn3(p); p = p * 2.07 + 11.3; a *= 0.5; } return v; }`;
// el núcleo: plasma rojo que hierve (la superficie se abomba y se mueve), más vivo y claro cuanto más cargado, con el
// borde encendido
const sorbCoreMat = new THREE.ShaderMaterial({
  uniforms: { uT: { value: 0 }, uK: { value: 0 } }, toneMapped: false,
  vertexShader: `uniform float uT; uniform float uK; varying vec3 vN; varying vec3 vP; varying vec3 vV;` + SORB_NOISE + `
    void main(){ vec3 p = position; float b = sn3(p * 3.2 + vec3(0.0, uT * 1.7, uT * 1.1)); p *= 1.0 + (0.025 + 0.035 * uK) * (b - 0.5) * 2.0;
      vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(p, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform float uT; uniform float uK; varying vec3 vN; varying vec3 vP; varying vec3 vV;` + SORB_NOISE + `
    void main(){
      // plasma: rojo profundo que se mueve, con vetas incandescentes (crestas del ruido) que corren por dentro
      float n = sfbm(vP * 2.4 + vec3(uT * 0.8, -uT * 1.2, uT * 0.5));
      float v = 1.0 - abs(sfbm(vP * 4.2 - vec3(uT * 1.9, uT * 0.4, uT * 1.3)) * 2.0 - 1.0);
      float vein = pow(v, 7.0 - 3.0 * uK) * (0.5 + 0.7 * uK);
      vec3 c = mix(vec3(0.38, 0.0, 0.02), vec3(0.95, 0.04, 0.05), smoothstep(0.25, 0.75, n));
      c = mix(c, vec3(1.0, 0.32, 0.34), clamp(vein, 0.0, 1.0));
      float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.5);
      c += vec3(1.0, 0.12, 0.16) * fr * (0.6 + 0.9 * uK);
      gl_FragColor = vec4(c * (0.9 + 0.45 * uK), 1.0);
    }`
});
// las capas de rayos: venas finas (ruido de crestas) sobre la esfera que cambian a saltos, como chispazos
const sorbBoltMat = seed => new THREE.ShaderMaterial({
  uniforms: { uT: { value: 0 }, uK: { value: 0 }, uA: { value: 0 }, uSeed: { value: seed } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
  fragmentShader: `uniform float uT; uniform float uK; uniform float uA; uniform float uSeed; varying vec3 vP; varying vec3 vN; varying vec3 vV;` + SORB_NOISE + `
    float ridge(vec3 p){ return 1.0 - abs(sn3(p) * 2.0 - 1.0); }
    void main(){
      float j = floor(uT * 17.0); vec3 o = vec3(j * 1.37, j * 2.11, j * 0.73) + uSeed; // (a saltos: el rayo se rehace)
      vec3 d = normalize(vP) * 2.2;
      float r = ridge(d * 1.6 + o) * 0.65 + ridge(d * 3.4 + o * 1.7) * 0.35;
      r = clamp(r, 0.0, 1.0);
      float line = pow(r, 30.0 - 8.0 * uK), glow = pow(r, 7.0) * 0.35; // (el rayo, fino y casi blanco; su resplandor, rojo)
      float fr = 1.0 - abs(dot(normalize(vN), normalize(vV))); // (más en el borde: se ve como una corona)
      float a = (line + glow) * (0.4 + 0.9 * fr) * uA;
      vec3 c = vec3(1.0, 0.1, 0.25) * glow + vec3(1.0, 0.8, 0.9) * line;
      gl_FragColor = vec4(c * (0.4 + 0.9 * fr) * uA, a);
    }`
});
const SORB = { g: new THREE.Group(), on: false, k: 0, vis: 0, burst: 0, fizz: 0, t: 0, arcT: 0, pos: new V3(), init: false };
SORB.core = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), sorbCoreMat);
SORB.shell = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), sorbBoltMat(0));
SORB.shell2 = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), sorbBoltMat(57.3));
SORB.halo = glowSprite(0xff2040, 1, 0.7);
// filamentos que se escapan de la bola (líneas quebradas que se rehacen a cada chispazo)
SORB.arcGeo = new THREE.BufferGeometry(); SORB.arcPos = new Float32Array(8 * 24 * 3); SORB.arcGeo.setAttribute('position', new THREE.BufferAttribute(SORB.arcPos, 3));
SORB.arcs = new THREE.LineSegments(SORB.arcGeo, new THREE.LineBasicMaterial({ color: 0xff6a8a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
SORB.arcs.frustumCulled = false;
for (const m of [SORB.halo, SORB.core, SORB.shell, SORB.shell2, SORB.arcs]) { m.renderOrder = 7; SORB.g.add(m); }
SORB.g.visible = false; scene.add(SORB.g);
// Donde va: entre las manos estiradas (si se ven), si no, delante de la cabeza y algo más abajo
function sorbAt(out) {
  const L = hands.left, R = hands.right;
  if (L.ok && R.ok && L.wrist.distanceTo(R.wrist) < 0.9) return out.copy(L.wrist).lerp(R.wrist, 0.5).add(_sorbU.set(0, 0.04, 0));
  return out.copy(head.p).addScaledVector(fwdH(), 0.5).add(_sorbU.set(0, -0.1, 0));
}
const _sorbU = new V3(), _sorbA = new V3(), _sorbB = new V3();
// Cada fotograma: k es la carga (o -1 si no se está aguantando arriba)
function sorbStep(dt, k) {
  const want = k >= 0; SORB.t += dt;
  if (want) { SORB.k += (k - SORB.k) * Math.min(1, dt * 10); SORB.vis = Math.min(1, SORB.vis + dt * 6); }
  else if (SORB.vis > 0 && !SORB.burst && !SORB.fizz && SORB.on) sorbFizzle();
  SORB.on = want;
  if (SORB.burst > 0) { SORB.burst -= dt; SORB.vis = Math.max(0, SORB.burst / 0.18); }
  else if (SORB.fizz > 0) { SORB.fizz -= dt; SORB.vis = Math.max(0, SORB.fizz / 0.3); }
  else if (!want) SORB.vis = Math.max(0, SORB.vis - dt * 5);
  if (SORB.vis <= 0) { SORB.g.visible = false; SORB.init = false; return; }
  SORB.g.visible = true;
  sorbAt(_sorbA); if (!SORB.init) { SORB.pos.copy(_sorbA); SORB.init = true; } else SORB.pos.lerp(_sorbA, Math.min(1, dt * 12));
  SORB.g.position.copy(SORB.pos);
  const K = SORB.k, v = SORB.vis, beat = 1 + 0.06 * Math.sin(SORB.t * (8 + 10 * K)), boom = SORB.burst > 0 ? 1 + (0.18 - SORB.burst) * 9 : 1;
  const rc = (0.032 + 0.04 * K) * beat * v * boom;
  SORB.core.scale.setScalar(rc);
  SORB.shell.scale.setScalar(rc * (1.25 + 0.75 * K)); SORB.shell2.scale.setScalar(rc * (1.9 + 1.2 * K)); // (la capa de rayos crece con la carga)
  SORB.halo.scale.set(rc * (5 + 4 * K), rc * (5 + 4 * K), 1); SORB.halo.material.opacity = (0.35 + 0.45 * K) * v;
  sorbCoreMat.uniforms.uT.value = SORB.t; sorbCoreMat.uniforms.uK.value = K;
  const s1 = SORB.shell.material.uniforms, s2 = SORB.shell2.material.uniforms;
  s1.uT.value = s2.uT.value = SORB.t; s1.uK.value = s2.uK.value = K;
  s1.uA.value = (0.6 + 1.2 * K) * v; s2.uA.value = smooth(clamp((K - 0.35) / 0.65, 0, 1)) * 0.9 * v;
  // filamentos: más y más largos cuanto más cargada; se rehacen a saltos
  SORB.arcT -= dt;
  if (SORB.arcT <= 0) {
    SORB.arcT = 0.05; const P = SORB.arcPos, nA = Math.round(2 + 6 * K); let n = 0;
    for (let a = 0; a < 8; a++) {
      if (a >= nA) { for (let i = 0; i < 24 * 3; i++) P[a * 72 + i] = 0; continue; }
      _sorbA.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
      _sorbB.copy(_sorbA).multiplyScalar(1.6 + 1.6 * K).add(_sorbU.set(rand(-0.6, 0.6), rand(-0.6, 0.6), rand(-0.6, 0.6)));
      const pts = jag(_sorbA, _sorbB, 3, 0.22); n = a * 72;
      for (let i = 0; i < 12 && i < pts.length - 1; i++) { const p = pts[i], q = pts[i + 1]; P.set([p.x, p.y, p.z, q.x, q.y, q.z], n + i * 6); }
    }
    SORB.arcGeo.attributes.position.needsUpdate = true;
  }
  SORB.arcs.scale.setScalar(rc); SORB.arcs.material.opacity = (0.35 + 0.6 * K) * v * rand(0.6, 1);
}
// Al disparar: estalla (destello, chispas) y de ahí sale el rayo
function sorbFire() {
  if (!SORB.g.visible) return null;
  const p = SORB.pos.clone(); SORB.burst = 0.18; SORB.on = false;
  fx.glow(p, [1, 0.2, 0.3], 0.35 + 0.25 * SORB.k, 0.18); fx.sparks(p, 18 + Math.round(16 * SORB.k), [1, 0.35, 0.5], 2.4, 0.03);
  return p;
}
// Si bajas antes de tiempo: se deshace en chispas
function sorbFizzle() { SORB.fizz = 0.3; fx.sparks(SORB.pos.clone(), 10, [1, 0.25, 0.35], 1.2, 0.02); }
function sorbReset() { SORB.on = false; SORB.k = 0; SORB.vis = 0; SORB.burst = 0; SORB.fizz = 0; SORB.init = false; SORB.g.visible = false; }
