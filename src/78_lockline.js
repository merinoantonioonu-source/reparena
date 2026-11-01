/* =================== DIANA: EL ENEMIGO APUNTADO =================== */
// Al enemigo al que apuntas le sale una marca que sigue su silueta en cada momento (si levanta un brazo o se agacha, va
// con él). Se elige en Entorno → Diana (settings.lockStyle):
//  - Tinta: línea negra de rotulador pegada a la figura que «hierve» (se redibuja temblando 8 veces por segundo, como el
//    dibujo animado a mano) y un halo amarillo plano desplazado, como la sombra recortada de una viñeta.
//  - Trama de puntos: la trama roja de los cómics impresos, puntos gordos pegados al cuerpo y cada vez más pequeños hacia
//    fuera.
//  - Líneas de enfoque: rayas en estrella del manga que apuntan al enemigo sin tocarlo, de largos distintos, que cambian
//    a saltos.
//  - Corchetes: cuatro esquinas de pincel que lo enmarcan y se cierran sobre él con un rebote al empezar a apuntarle.
//  - Neón: el contorno rojo con un pulso lento de antes.
// No cambian con la carga (la carga ya se ve en la bola de energía), salvo el neón, que late algo más vivo.
// Las de silueta son copias del enemigo dibujadas por detrás y ensanchadas en pantalla, como el contorno de tinta del
// cómic: primero se marca en el stencil el hueco alrededor de toda la figura (sin pintar nada) y las capas solo se pintan
// fuera de él, así que queda la silueta de fuera, sin líneas por dentro. En las de trama y enfoque cada capa también se
// marca al pintarse (aunque sea transparente entre puntos o rayas), así que la siguiente, más ancha, solo pinta más allá:
// los puntos menguan y las rayas se alargan hacia fuera siguiendo la silueta. Los dibujos (puntos, rayas) van en un plano
// por el centro del enemigo y de cara a ti: los dos ojos los ven en el mismo sitio. Solo se dibuja en el que apuntas
// Capas: [tipo, ancho en pantalla, color, opacidad, extra], en el orden en que se pintan. Extra: once (se marca al
// pintarse), off (desplazada en pantalla), boil (tiembla), dot (trama: radio del punto) o ray (enfoque: [umbral, grosor])
const LKL = {
  styles: {
    neon: [['mask', 0.012], ['band', 0.036, 0xff1a1a, 0.2], ['band', 0.026, 0xff1a1a, 0.42], ['band', 0.0175, 0xff3a2e, 1]],
    tinta: [['mask', 0.003], ['band', 0.013, 0x0b0710, 1, { once: 1, boil: 0.7 }], ['band', 0.024, 0xffc21a, 1, { once: 1, off: [0.008, -0.011] }]],
    trama: [['mask', 0.005], ['band', 0.016, 0xff2a1f, 1, { once: 1, dot: 0.5 }], ['band', 0.03, 0xff2a1f, 1, { once: 1, dot: 0.36 }], ['band', 0.046, 0xff2a1f, 1, { once: 1, dot: 0.22 }]],
    enfoque: [['mask', 0.022], ['band', 0.05, 0xff3a2e, 1, { once: 1, ray: [0.15, 0.1] }], ['band', 0.085, 0xff3a2e, 1, { once: 1, ray: [0.45, 0.14] }], ['band', 0.12, 0xff3a2e, 1, { once: 1, ray: [0.75, 0.18] }]]
  },
  mats: {}, has: new Set(), on: new Map(), k: 1, seed: { value: 0 }, box: null
};
const LKL_BIT = 2; // (el bit 1 del stencil es la boca del remolino del bosque)
const lklStyle = () => LKL.styles[settings.lockStyle] || settings.lockStyle === 'corchetes' ? settings.lockStyle : 'tinta';
// El material de una capa. Los de trama y enfoque llevan el centro del enemigo: uno por enemigo (ctr), los demás se comparten
function lklMat(style, i, skin, thin, ctr) {
  const key = style + i + (skin ? 's' : 'n') + (thin ? 't' : ''); if (!ctr && LKL.mats[key]) return LKL.mats[key];
  const [mode, w0, col, op, X = {}] = LKL.styles[style][i], w = w0 * (thin ? 0.5 : 1); // (fino: la mitad de ancho, hueco incluido)
  const m = new THREE.MeshBasicMaterial({ color: col || 0, side: THREE.BackSide, skinning: skin, transparent: true, opacity: op || 1, depthWrite: false, toneMapped: false, fog: false });
  Object.assign(m, { stencilWrite: true, stencilRef: LKL_BIT, stencilFuncMask: LKL_BIT });
  if (mode === 'mask') Object.assign(m, { colorWrite: false, depthTest: false, stencilWriteMask: LKL_BIT, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp });
  else Object.assign(m, { stencilWriteMask: X.once ? LKL_BIT : 0, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: X.once ? THREE.ReplaceStencilOp : THREE.KeepStencilOp });
  m.userData.base = op || 1; m.userData.style = style;
  const U = { uLkW: { value: w }, uLkO: { value: new THREE.Vector2(...(X.off || [0, 0])) }, uLkB: { value: X.boil || 0 }, uLkS: LKL.seed, uLkC: ctr || { value: new V3() },
    uLkP: { value: X.dot ? 1 : X.ray ? 2 : 0 }, uLkQ: { value: new THREE.Vector2(X.dot || (X.ray ? X.ray[0] : 0), X.ray ? X.ray[1] : 0) } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'attribute vec3 aOutN;\nuniform float uLkW, uLkB, uLkS;\nuniform vec2 uLkO;\nvarying vec3 vLkW;\nfloat lkH3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
	vec3 lN = aOutN;
	#ifdef USE_SKINNING
		lN = ( bindMatrixInverse * ( skinWeight.x * boneMatX + skinWeight.y * boneMatY + skinWeight.z * boneMatZ + skinWeight.w * boneMatW ) * bindMatrix * vec4( lN, 0.0 ) ).xyz;
	#endif
	vec2 lD = ( projectionMatrix * vec4( normalize( normalMatrix * lN ), 0.0 ) ).xy;
	float lW = uLkW * ( 1.0 + uLkB * ( lkH3( position * 23.0 + uLkS ) - 0.5 ) );
	vec2 lO = normalize( lD + vec2( 1e-5 ) ) * lW + uLkO;
	vec3 lV = vec3( lO.x * gl_Position.w / projectionMatrix[0][0], lO.y * gl_Position.w / projectionMatrix[1][1], 0.0 );
	vLkW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz + ( vec4( lV, 0.0 ) * viewMatrix ).xyz;
	gl_Position.xy += lO * gl_Position.w;`);
    sh.fragmentShader = `uniform vec3 uLkC;\nuniform float uLkP, uLkS;\nuniform vec2 uLkQ;\nvarying vec3 vLkW;
float lkH1(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float lkPat() {
	if (uLkP < 0.5) return 1.0;
	vec3 n = normalize(cameraPosition - uLkC), r = normalize(cross(vec3(0.0, 1.0, 0.0), n)), u = cross(n, r), d = vLkW - uLkC;
	vec2 q = vec2(dot(d, r), dot(d, u));
	if (uLkP < 1.5) { vec2 g = mat2(0.7071, 0.7071, -0.7071, 0.7071) * q / (0.008 * length(cameraPosition - uLkC)); return 1.0 - smoothstep(uLkQ.x - 0.07, uLkQ.x + 0.05, length(fract(g) - 0.5)); }
	float a = atan(q.y, q.x) * 5.7296, s = floor(a);
	if (lkH1(s + 1.0 + uLkS * 7.0) < uLkQ.x) return 0.0;
	return 1.0 - smoothstep(uLkQ.y * 0.6, uLkQ.y, abs(fract(a) - 0.5));
}\n` + sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n\tgl_FragColor.a *= lkPat();');
  };
  m.customProgramCacheKey = () => 'lockline' + (skin ? 's' : 'n'); // (todo va en uniformes: un programa para todas las capas)
  if (!ctr) LKL.mats[key] = m;
  return m;
}
// Le pone las capas de un estilo a todo lo que forma la figura (ocultas hasta que se le apunte); devuelve la lista
function lklAttach(root, thin, style = 'neon', ctr = null) {
  const meshes = [], out = [];
  root.traverse(o => { if ((o.isMesh || o.isSkinnedMesh) && !o.isInstancedMesh && !o.userData.isOutline && !o.userData.isLockLine && o.geometry && o.material && !Array.isArray(o.material) && !o.material.transparent) meshes.push(o); });
  LKL.styles[style].forEach((L, i) => {
    for (const mesh of meshes) {
      if (!outN(mesh.geometry)) continue;
      const mat = lklMat(style, i, !!mesh.isSkinnedMesh, thin, ctr); let o;
      if (mesh.isSkinnedMesh) { o = new THREE.SkinnedMesh(mesh.geometry, mat); o.bind(mesh.skeleton, mesh.bindMatrix); o.bindMode = mesh.bindMode; } else o = new THREE.Mesh(mesh.geometry, mat);
      o.userData.isLockLine = true; o.frustumCulled = false; o.renderOrder = 40 + i; o.raycast = () => {}; o.castShadow = o.receiveShadow = false; o.visible = false;
      mesh.add(o); out.push(o);
    }
  });
  return out;
}
/* ---------- Corchetes: cuatro esquinas de pincel alrededor del enemigo, en su postura de ahora ---------- */
// La forma sale de sus huesos (si está animado) y de las esquinas de sus piezas rígidas visibles, vistas desde ti: el
// marco se ajusta si levanta los brazos o se agacha (suavizado, sin saltos). Las esquinas, de cara a ti y derechas
function lklPts(e) {
  if (e.lkP) return e.lkP; const P = e.lkP = { bones: [], rigid: [] };
  e.root.traverse(o => {
    if (o.isBone) { if (!/ik|pole|target|ctrl|root/i.test(o.name || '')) P.bones.push(o); return; }
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.userData.isLockLine || o.userData.isOutline || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
    const g = o.geometry; if (!g.lkBox) { const p = g.attributes.position, lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < p.count; i++) { const a = [p.getX(i), p.getY(i), p.getZ(i)]; for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a[k]); hi[k] = Math.max(hi[k], a[k]); } } g.lkBox = [lo, hi]; }
    P.rigid.push(o);
  });
  return P;
}
const _lkc = new V3(), _lkv = new V3(), _lkr = new V3();
const lklSeen = (o, root) => { for (let x = o; x && x !== root; x = x.parent) if (!x.visible) return false; return true; };
function lklBracketStep(e, g, dt) {
  const U = g.userData, P = lklPts(e), c = e.center(_lkc); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  _lkr.set(head.p.z - c.z, 0, c.x - head.p.x).normalize(); // (la derecha, vista desde ti)
  const add = v => { const x = (v.x - c.x) * _lkr.x + (v.z - c.z) * _lkr.z, y = v.y - c.y; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  for (const b of P.bones) add(b.getWorldPosition(_lkv));
  for (const o of P.rigid) { if (!lklSeen(o, e.root)) continue; const [lo, hi] = o.geometry.lkBox; for (let k = 0; k < 8; k++) add(o.localToWorld(_lkv.set(k & 1 ? hi[0] : lo[0], k & 2 ? hi[1] : lo[1], k & 4 ? hi[2] : lo[2]))); }
  if (x0 > x1) { x0 = -0.3; x1 = 0.3; y0 = -0.5; y1 = 0.5; }
  const H = y1 - y0, mx = P.bones.length ? 0.12 + 0.18 * H : 0.06, my = P.bones.length ? 0.1 + 0.1 * H : 0.06; x0 -= mx; x1 += mx; y0 -= my; y1 += my; // (los huesos van por dentro: la cabeza y las manos sobresalen)
  if (U.t < 0) { U.t = 0; U.r = [x0, x1, y0, y1]; } U.t += dt; const t = U.t, R = U.r, a = Math.min(1, dt * 10);
  [x0, x1, y0, y1].forEach((v, i) => { R[i] += (v - R[i]) * a; });
  g.position.copy(c).addScaledVector(_lkr, (R[0] + R[1]) / 2); g.position.y += (R[2] + R[3]) / 2; g.lookAt(head.p.x, g.position.y, head.p.z);
  // al empezar a apuntarle se cierran desde lejos con un rebote; luego respiran muy poco
  const k = (1 + 0.8 * Math.cos(t * 13) * Math.exp(-t * 6.5)) * (1 + 0.02 * Math.sin(t * 4)), hw = (R[1] - R[0]) / 2, hh = (R[3] - R[2]) / 2, s = clamp(Math.min(hw, hh) * 0.6, 0.09, 0.26);
  g.children.forEach((q, i) => { const sx = i === 0 || i === 3 ? -1 : 1, sy = i < 2 ? 1 : -1; q.position.set(sx * (hw * k - s / 2), sy * (hh * k - s / 2), 0); q.scale.set(s, s, 1); });
}
function lklBracketTex() {
  if (LKL.box) return LKL.box;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d');
  // una L de pincel: trazo negro grueso y, encima, el rojo algo más fino (los extremos, en punta, como al levantar el pincel)
  const L = (lw, col) => { c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); c.moveTo(22, 118); c.lineTo(18, 24); c.quadraticCurveTo(18, 16, 26, 17); c.lineTo(118, 22); c.stroke(); };
  L(30, '#0b0710'); L(17, '#ff2a1f');
  c.fillStyle = '#0b0710'; c.beginPath(); c.moveTo(8, 112); c.lineTo(32, 112); c.lineTo(22, 127); c.fill(); c.beginPath(); c.moveTo(112, 8); c.lineTo(112, 34); c.lineTo(127, 22); c.fill();
  return (LKL.box = new THREE.CanvasTexture(cv));
}
function lklBrackets(e) {
  const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ map: lklBracketTex(), transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
  for (let i = 0; i < 4; i++) { const q = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); q.rotation.z = -i * Math.PI / 2; q.renderOrder = 45; q.raycast = () => {}; q.userData.isLockLine = true; g.add(q); }
  g.visible = false; g.userData.isLockLine = true; g.userData.t = -1; scene.add(g); return g;
}
// Desde updateAim: este enemigo está apuntado (hot: con el disparo cargado; solo lo usa el neón)
function lockShow(e, hot) { if (e && e.alive && e.root) LKL.on.set(e, LKL.on.get(e) || !!hot); }
// Al final de updateAim: enseña la diana de los apuntados (en el estilo elegido) y la quita a los demás
function lockStep(t) {
  const st = lklStyle(), dt = clamp(t - (LKL.t || t), 0, 0.1); LKL.t = t; let hot = false;
  LKL.seed.value = Math.floor(t * 8) % 97 * 0.37; // (la tinta tiembla y las rayas cambian a saltos, 8 veces por segundo)
  for (const [e, h] of LKL.on) {
    if (!e.lks) e.lks = {};
    if (!e.lks[st]) {
      const thin = e.type === 'spider' || isTiny(); // (los de las trampillas, finos)
      if (st === 'corchetes') e.lks[st] = [lklBrackets(e)];
      else { const ctr = st === 'trama' || st === 'enfoque' ? (e.lkC = e.lkC || { value: new V3() }) : null; e.lks[st] = lklAttach(e.root, thin, st, ctr); }
    }
    LKL.has.add(e); hot = hot || h;
  }
  for (const e of LKL.has) {
    const on = LKL.on.has(e) && e.alive && !!e.root.parent;
    for (const s in e.lks) {
      const show = on && s === st, L = e.lks[s];
      if (L.length && L[0].visible !== show) for (const o of L) o.visible = show;
      if (s === 'corchetes' && L[0]) { if (show) lklBracketStep(e, L[0], dt); else L[0].userData.t = -1; }
    }
    if (on && e.lkC) e.center(e.lkC.value);
    e.lkl = e.lks[st] || []; // (las piezas del estilo de ahora)
    if (!on && (!e.alive || !e.root.parent)) { if (e.lks.corchetes) { scene.remove(e.lks.corchetes[0]); delete e.lks.corchetes; } LKL.has.delete(e); }
  }
  // neón: brillo que sube y baja despacio (un pulso cada 1,4 s; con carga, cada 0,9 s y algo más vivo)
  const want = (hot ? 0.6 : 0.4) + (hot ? 0.4 : 0.6) * (0.5 + 0.5 * Math.sin(t * TAU / (hot ? 0.9 : 1.4)));
  LKL.k += (want - LKL.k) * Math.min(1, dt * 5); // (al cargar o disparar no salta: se funde)
  for (const k in LKL.mats) { const m = LKL.mats[k]; if (m.colorWrite !== false && m.userData.style === 'neon') m.opacity = m.userData.base * LKL.k; }
  LKL.on.clear();
}
