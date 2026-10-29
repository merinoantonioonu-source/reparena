/* =================== LA BOLA DE ENERGÍA: LA CARGA DEL DISPARO =================== */
// En todos los ejercicios que lanzan rayos (no con pistolas ni espadas, ni en los modos sin disparos), la carga se ve en
// una bola roja de energía que flota delante de ti, a un metro del pecho y a su altura (por debajo de la vista: nunca la
// tapa), con un vaivén leve. Un núcleo esférico sólido, de plasma que hierve y late, y a su alrededor una capa de rayos
// (venas eléctricas sobre la esfera, que cambian a saltos) que crece con la carga; desde la mitad, una segunda capa más
// grande y filamentos que se escapan; encima, «×2», «×3», «×4». Al llegar al máximo suelta un destello explosivo a su
// alrededor (fogonazo, onda de luz y chispas). Al disparar estalla y de ella salen los rayos; si se pierde la carga, se
// deshace en chispas. k: lo cargada que está (0 al empezar a cargar, 1 al máximo: ×4, o en el superman, el tiempo pedido)
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
const SORB = { g: new THREE.Group(), on: false, k: 0, vis: 0, burst: 0, fizz: 0, t: 0, arcT: 0, pos: new V3(), init: false, yaw: 0, pow: 0, mx: -1 };
SORB.core = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), sorbCoreMat);
SORB.shell = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), sorbBoltMat(0));
SORB.shell2 = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), sorbBoltMat(57.3));
SORB.halo = glowSprite(0xff2040, 1, 0.7);
// filamentos que se escapan de la bola (líneas quebradas que se rehacen a cada chispazo)
SORB.arcGeo = new THREE.BufferGeometry(); SORB.arcPos = new Float32Array(8 * 24 * 3); SORB.arcGeo.setAttribute('position', new THREE.BufferAttribute(SORB.arcPos, 3));
SORB.arcs = new THREE.LineSegments(SORB.arcGeo, new THREE.LineBasicMaterial({ color: 0xff6a8a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
SORB.arcs.frustumCulled = false;
// el número de la carga (×2, ×3, ×4), encima
SORB.numC = mkCanvas(128, 64); SORB.numT = texFrom(SORB.numC);
SORB.num = new THREE.Sprite(new THREE.SpriteMaterial({ map: SORB.numT, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
SORB.num.visible = false;
// el destello del máximo: un fogonazo que se abre, una onda de luz esférica que se expande y se apaga
SORB.flash = glowSprite(0xffd0e0, 1, 0);
SORB.wave = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.ShaderMaterial({
  uniforms: { uA: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'uniform float uA; varying vec3 vN; varying vec3 vV; void main(){ float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0); vec3 c = mix(vec3(1.0, 0.15, 0.3), vec3(1.0, 0.85, 0.9), fr * fr); gl_FragColor = vec4(c * fr * uA, fr * uA); }'
}));
SORB.flash.visible = SORB.wave.visible = false;
for (const m of [SORB.halo, SORB.core, SORB.shell, SORB.shell2, SORB.arcs, SORB.num, SORB.flash, SORB.wave]) { m.renderOrder = 7; SORB.g.add(m); }
SORB.num.renderOrder = 8; SORB.g.visible = false; scene.add(SORB.g);
// Donde va: a un metro del pecho, a su altura (por debajo de los ojos: no tapa la vista), hacia donde miras de cuerpo (se
// gira despacio: no da latigazos al mover la cabeza) y con un vaivén leve. Tumbado o en plancha, el pecho va casi a ras de
// la cabeza
function sorbAt(out, dt) {
  const f = fwdH(), want = Math.atan2(f.x, f.z), low = head.p.y < 1.0;
  SORB.yaw = SORB.init ? SORB.yaw + wrapAng(want - SORB.yaw) * Math.min(1, dt * 2.5) : want;
  const cy = low ? Math.max(0.22, head.p.y - 0.12) : head.p.y - 0.32; // (el pecho)
  return out.set(head.p.x + Math.sin(SORB.yaw) * 1.0, cy + 0.012 * Math.sin(SORB.t * 1.7), head.p.z + Math.cos(SORB.yaw) * 1.0);
}
const _sorbU = new V3(), _sorbA = new V3(), _sorbB = new V3();
// ¿Se ve la bola? Cuando lo que se carga son rayos: en Combate, sin pistolas que se lleven la carga y sin espadas
const sorbFor = () => isCombat() && !swordActive() && !pistolOn();
// La carga de ahora, de 0 a 1 (o -1: nada cargado): en el superman, el tiempo aguantado arriba; en el resto, el nivel
// (×1 al empezar a cargar, ×4 al máximo)
const SORB_LVL = [0.18, 0.46, 0.72, 1];
function sorbCharge() {
  if (!sorbFor() || !GAME_STATES.includes(state)) return -1;
  if (settings.exercise === 'superman') return DET.su.state === 'up' ? DET.su.k || 0 : -1;
  return charged ? SORB_LVL[clamp(chargePow, 1, 4) - 1] : -1;
}
// el número de la carga, dibujado solo cuando cambia
function sorbNum(pow) {
  if (pow === SORB.pow) return; SORB.pow = pow; SORB.num.visible = pow >= 2; if (pow < 2) return;
  const c = SORB.numC.getContext('2d'), col = '#' + POW_COL[pow - 1].toString(16).padStart(6, '0');
  c.clearRect(0, 0, 128, 64); c.font = `56px ${FD}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = 8; c.strokeStyle = 'rgba(16,6,12,0.85)'; c.strokeText('×' + pow, 64, 34); c.fillStyle = col; c.fillText('×' + pow, 64, 34); SORB.numT.needsUpdate = true;
}
// Cada fotograma: k es la carga (o -1 si no hay)
function sorbStep(dt, k = sorbCharge()) {
  const want = k >= 0; SORB.t += dt;
  if (want) { SORB.k += (k - SORB.k) * Math.min(1, dt * 8); SORB.vis = Math.min(1, SORB.vis + dt * 6); }
  else if (SORB.vis > 0 && !SORB.burst && !SORB.fizz && SORB.on) sorbFizzle();
  SORB.on = want;
  if (SORB.burst > 0) { SORB.burst -= dt; SORB.vis = Math.max(0, SORB.burst / 0.18); }
  else if (SORB.fizz > 0) { SORB.fizz -= dt; SORB.vis = Math.max(0, SORB.fizz / 0.3); }
  else if (!want) SORB.vis = Math.max(0, SORB.vis - dt * 5);
  sorbMaxStep(dt);
  if (SORB.vis <= 0 && SORB.mx < 0) { SORB.g.visible = false; SORB.init = false; SORB.pow = 0; SORB.num.visible = false; return; }
  SORB.g.visible = true;
  sorbAt(_sorbA, dt); if (!SORB.init) { SORB.pos.copy(_sorbA); SORB.init = true; } else SORB.pos.lerp(_sorbA, Math.min(1, dt * 8));
  SORB.g.position.copy(SORB.pos);
  const K = SORB.k, v = SORB.vis, beat = 1 + 0.06 * Math.sin(SORB.t * (8 + 10 * K)), boom = SORB.burst > 0 ? 1 + (0.18 - SORB.burst) * 9 : 1;
  const rc = (0.045 + 0.05 * K) * beat * v * boom; // (a un metro: algo más grande que entre las manos)
  SORB.core.scale.setScalar(rc);
  SORB.shell.scale.setScalar(rc * (1.25 + 0.75 * K)); SORB.shell2.scale.setScalar(rc * (1.9 + 1.2 * K)); // (la capa de rayos crece con la carga)
  SORB.halo.scale.set(rc * (5 + 4 * K), rc * (5 + 4 * K), 1); SORB.halo.material.opacity = (0.35 + 0.45 * K) * v;
  sorbCoreMat.uniforms.uT.value = SORB.t; sorbCoreMat.uniforms.uK.value = K;
  const s1 = SORB.shell.material.uniforms, s2 = SORB.shell2.material.uniforms;
  s1.uT.value = s2.uT.value = SORB.t; s1.uK.value = s2.uK.value = K;
  s1.uA.value = (0.6 + 1.2 * K) * v; s2.uA.value = smooth(clamp((K - 0.35) / 0.65, 0, 1)) * 0.9 * v;
  // el número, justo encima de la bola
  sorbNum(SORB.on && settings.exercise !== 'superman' ? clamp(chargePow, 1, 4) : 0);
  if (SORB.num.visible) { SORB.num.position.set(0, rc * 1.1 + 0.035, 0); SORB.num.scale.set(0.12, 0.06, 1); SORB.num.material.opacity = v; }
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
// Carga al máximo: el destello explosivo (fogonazo, onda de luz esférica que se expande, chispas en todas direcciones)
function sorbMax() {
  if (!SORB.g.visible) return;
  SORB.mx = 0; SORB.flash.visible = SORB.wave.visible = true;
  const p = SORB.pos.clone(); fx.sparks(p, 70, [1, 0.3, 0.45], 3.6, 0.035); fx.electric(p, 24); fx.glow(p, [1, 0.6, 0.7], 1.3, 0.25); fx.glow(p, [1, 1, 1], 0.5, 0.1);
  SND.zap(p); hapticBoth(0.8, 120);
}
function sorbMaxStep(dt) {
  if (SORB.mx < 0) return;
  SORB.mx += dt; const k = SORB.mx / 0.55;
  if (k >= 1) { SORB.mx = -1; SORB.flash.visible = SORB.wave.visible = false; return; }
  const f = Math.max(0, 1 - SORB.mx / 0.22); const fs = 0.4 + 2.2 * smooth(Math.min(1, SORB.mx / 0.22)); SORB.flash.scale.set(fs, fs, 1); SORB.flash.material.opacity = f;
  SORB.wave.scale.setScalar(0.08 + 1.1 * smooth(k)); SORB.wave.material.uniforms.uA.value = 1.6 * (1 - k) * (1 - k);
}
// Al disparar: estalla (destello, chispas) y de ahí salen los rayos; devuelve dónde estaba (o null si no se ve)
function sorbFire() {
  if (!SORB.g.visible || SORB.vis <= 0) return null;
  const p = SORB.pos.clone(); SORB.burst = 0.18; SORB.on = false;
  fx.glow(p, [1, 0.2, 0.3], 0.35 + 0.25 * SORB.k, 0.18); fx.sparks(p, 18 + Math.round(16 * SORB.k), [1, 0.35, 0.5], 2.4, 0.03);
  return p;
}
// Si se pierde la carga: se deshace en chispas
function sorbFizzle() { SORB.fizz = 0.3; fx.sparks(SORB.pos.clone(), 10, [1, 0.25, 0.35], 1.2, 0.02); }
function sorbReset() { SORB.on = false; SORB.k = 0; SORB.vis = 0; SORB.burst = 0; SORB.fizz = 0; SORB.init = false; SORB.mx = -1; SORB.pow = 0; SORB.g.visible = SORB.num.visible = SORB.flash.visible = SORB.wave.visible = false; }
