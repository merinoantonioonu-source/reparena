/* =================== ESTILO CÓMIC (prueba) =================== */
// Entorno ▸ «Estilo visual: Cómic (prueba)». La estética de dibujo animado de juegos de VR como Retronika o Broken Edge:
//  · contornos negros alrededor de cada figura (enemigos, compuertas, manos, la fortaleza): una copia de su forma algo
//    más gruesa, de la que solo se ven las caras de atrás, con el mismo grosor en pantalla esté cerca o lejos
//  · sombreado plano con un solo corte duro entre luz y sombra; la sombra es de color (fría, violácea), no negra; un
//    brillo duro a manchas y, en la sombra, un rayado a lápiz (fijo en el mundo: no baila al mover la cabeza)
//  · colores claros y vivos: las superficies que tenían texturas de relieve quedan lisas, del tono pastel de su color
//  · sin sombras en tiempo real ni texturas de relieve, rugosidad o brillo: también es más ligero para la gráfica
//  · en la fortaleza: cielo luminoso con nubes de dibujo (blancas, con el borde entintado), neblina clara y el suelo
//    color arena con grietas dibujadas a tinta
// Cada material sigue siendo el mismo, con otro sombreador: así valen igual los destellos al recibir un golpe, los
// fundidos y los colores que cambia el juego; al quitarlo, todo vuelve a ser como antes
const COMIC = { mats: new Set(), st: new WeakMap(), ol: new WeakMap(), uL: { value: new V3(-0.45, 0.8, 0.4).normalize() }, uK: { value: 1.08 },
  uShadow: { value: new THREE.Color(0.6, 0.56, 0.86) }, sweepT: 0, saved: null };
const comicOn = () => settings.look === 'comic';
const comicArenaOn = () => comicOn() && !arMode && !forestOn() && sceneryPick() === 'arena';
const COMIC_OUT = 'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;';
const COMIC_LIGHT = `
	vec3 cL = normalize( ( viewMatrix * vec4( uComicL, 0.0 ) ).xyz );
	float cD = dot( normal, cL ), cLit = smoothstep( 0.0, 0.035, cD );
	vec3 cBase = diffuseColor.rgb; float cLum = dot( cBase, vec3( 0.299, 0.587, 0.114 ) ); cBase = max( mix( vec3( cLum ), cBase, 1.3 ), 0.0 );
	vec3 cCol = mix( cBase * uComicShadow, cBase, cLit );
	float cSp = smoothstep( 0.9, 0.93, dot( reflect( - cL, normal ), normalize( vViewPosition ) ) ) * cLit; cCol += vec3( 0.3 ) * cSp;
	#if __VERSION__ >= 300
		vec3 cW = transpose( mat3( viewMatrix ) ) * ( - vViewPosition ) + cameraPosition;
		float cH = abs( fract( dot( cW, vec3( 0.9, 0.55, -0.7 ) ) * 26.0 ) - 0.5 );
		cCol *= 1.0 - ( 1.0 - smoothstep( 0.1, 0.2, cH ) ) * ( 1.0 - cLit ) * 0.3 * smoothstep( 7.0, 3.0, length( vViewPosition ) ); // (solo de cerca: a lo lejos hacía aguas)
	#endif
	vec3 outgoingLight = cCol * uComicK + totalEmissiveRadiance * 1.4;`;
function comicShader(sh) {
  if (!sh.fragmentShader.includes(COMIC_OUT)) return; // (otro sombreador: se queda como estaba)
  Object.assign(sh.uniforms, { uComicL: COMIC.uL, uComicK: COMIC.uK, uComicShadow: COMIC.uShadow });
  let f = sh.fragmentShader;
  for (const inc of ['lights_physical_fragment', 'lights_fragment_begin', 'lights_fragment_maps', 'lights_fragment_end', 'aomap_fragment']) f = f.replace(`#include <${inc}>`, '');
  sh.fragmentShader = 'uniform vec3 uComicL;\nuniform float uComicK;\nuniform vec3 uComicShadow;\n' + f.replace(COMIC_OUT, COMIC_LIGHT);
}
// Prepara un material (una vez): su sombreador, con el cómic si toca. La clave del programa distingue las dos versiones
// (y conserva la del sombreador propio que ya tuviera: el viento del bosque). El estado va aparte (COMIC.st), no en
// userData: three.js lo copia como texto al clonar un material, y ahí no caben las texturas guardadas
const COMIC_MAPS = ['normalMap', 'roughnessMap', 'metalnessMap', 'envMap', 'aoMap'];
function comicPatch(m) {
  if (!m || !m.isMeshStandardMaterial) return;
  let S = COMIC.st.get(m); if (S && m.onBeforeCompile === S.wrap) return;
  const prev = m.onBeforeCompile || (() => {}), base = THREE.Material && THREE.Material.prototype.customProgramCacheKey;
  const own = m.customProgramCacheKey && m.customProgramCacheKey !== base && (!S || m.customProgramCacheKey !== S.key), prevKey = own ? m.customProgramCacheKey.bind(m) : () => prev.toString();
  if (!S) { S = { on: false, saved: null }; COMIC.st.set(m, S); COMIC.mats.add(m); if (m.addEventListener) m.addEventListener('dispose', () => COMIC.mats.delete(m)); }
  S.wrap = function (sh, r) { prev.call(this, sh, r); if (S.on) comicShader(sh); };
  S.key = function () { return prevKey() + (S.on ? '|comic' : ''); };
  m.onBeforeCompile = S.wrap; m.customProgramCacheKey = S.key;
  comicSet(m, comicOn());
}
// En cómic, fuera las texturas de relieve, rugosidad, brillo y reflejos; en las superficies que las tenían, también la de
// color: quedan lisas, del tono pastel de su color medio (que si no, quedaba el blanco del material). Sin él, vuelven
function comicSet(m, on) {
  const S = COMIC.st.get(m); if (!S || S.on === on) return;
  S.on = on;
  if (on) {
    const sv = S.saved = {}, detailed = !!(m.normalMap || m.roughnessMap);
    if (detailed && m.map) { const a = texAvg(m.map); if (a) { sv.color = m.color.getHex(); m.color.multiply(pastel(a)); } }
    for (const k of [...COMIC_MAPS, ...(detailed ? ['map'] : [])]) { sv[k] = m[k]; m[k] = null; }
  } else if (S.saved) { const sv = S.saved; if (sv.color !== undefined) { m.color.setHex(sv.color); delete sv.color; } Object.assign(m, sv); S.saved = null; }
  m.needsUpdate = true;
}
// el mismo tono, más claro y algo más vivo (los colores de dibujo animado)
const _hsl = {};
function pastel(c) {
  const o = c.clone(); if (!o.getHSL) return o.multiplyScalar(1.4);
  o.getHSL(_hsl); return o.setHSL(_hsl.h, Math.min(0.75, Math.max(_hsl.s, 0.28) * 1.1), _hsl.l + (0.5 - _hsl.l) * 0.7);
}
// color medio de una textura (en lineal), una vez por textura
const _texAvg = new Map(); let _avgCtx = null;
function texAvg(t) {
  if (_texAvg.has(t.uuid)) return _texAvg.get(t.uuid);
  let c = null;
  try {
    const img = t.image; if (img && img.width) {
      if (!_avgCtx) _avgCtx = mkCanvas(4).getContext('2d'); _avgCtx.clearRect(0, 0, 4, 4); _avgCtx.drawImage(img, 0, 0, 4, 4);
      const d = _avgCtx.getImageData(0, 0, 4, 4).data; let r = 0, g = 0, b = 0; for (let i = 0; i < 64; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      c = new THREE.Color(r / 16 / 255, g / 16 / 255, b / 16 / 255); if (c.convertSRGBToLinear) c.convertSRGBToLinear();
    }
  } catch (e) { c = null; }
  _texAvg.set(t.uuid, c); return c;
}

/* ---------- Contornos de tinta ---------- */
// Una copia de la malla con sus caras de atrás, empujada hacia fuera en la pantalla: asoma como un borde negro alrededor de
// la figura. Las normales de las esquinas se promedian (aOutN) para que el borde no se abra en los cantos de las cajas
const OUTL = { w: { value: 0.006 }, mats: {} };
function outlMat(skin) {
  const k = skin ? 's' : 'n'; if (OUTL.mats[k]) return OUTL.mats[k];
  const m = new THREE.MeshBasicMaterial({ color: 0x1b1222, side: THREE.BackSide, skinning: skin, toneMapped: false });
  if (m.color.convertSRGBToLinear) m.color.convertSRGBToLinear(); // (tinta de verdad: el color del material va en lineal; si no, salía gris violáceo)
  m.onBeforeCompile = sh => {
    sh.uniforms.uOutW = OUTL.w;
    sh.vertexShader = 'attribute vec3 aOutN;\nuniform float uOutW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
	vec3 oN = aOutN;
	#ifdef USE_SKINNING
		oN = ( bindMatrixInverse * ( skinWeight.x * boneMatX + skinWeight.y * boneMatY + skinWeight.z * boneMatZ + skinWeight.w * boneMatW ) * bindMatrix * vec4( oN, 0.0 ) ).xyz;
	#endif
	#ifdef USE_INSTANCING
		oN = mat3( instanceMatrix ) * oN;
	#endif
	vec2 oD = ( projectionMatrix * vec4( normalize( normalMatrix * oN ), 0.0 ) ).xy;
	gl_Position.xy += normalize( oD + vec2( 1e-5 ) ) * uOutW * gl_Position.w;`);
  };
  m.customProgramCacheKey = () => 'comic-outline';
  return (OUTL.mats[k] = m);
}
function outN(g) {
  if (g.attributes.aOutN) return true;
  const p = g.attributes.position, n = g.attributes.normal; if (!p || !n) return false;
  const cnt = p.count, acc = new Map(), keys = new Array(cnt), out = new Float32Array(cnt * 3);
  for (let i = 0; i < cnt; i++) {
    const k = keys[i] = Math.round(p.getX(i) * 1e4) + ',' + Math.round(p.getY(i) * 1e4) + ',' + Math.round(p.getZ(i) * 1e4);
    const a = acc.get(k) || [0, 0, 0]; a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i); acc.set(k, a);
  }
  for (let i = 0; i < cnt; i++) { const a = acc.get(keys[i]), l = Math.hypot(a[0], a[1], a[2]) || 1; out[i * 3] = a[0] / l; out[i * 3 + 1] = a[1] / l; out[i * 3 + 2] = a[2] / l; }
  g.setAttribute('aOutN', new THREE.BufferAttribute(out, 3)); return true;
}
function outlAdd(mesh) {
  if (COMIC.ol.has(mesh) || mesh.userData.isOutline || !(mesh.isMesh || mesh.isSkinnedMesh)) return;
  const mt = mesh.material; COMIC.ol.set(mesh, null);
  if (!mt || Array.isArray(mt) || !mt.isMeshStandardMaterial || mt.transparent || mt.side !== THREE.FrontSide || !mesh.geometry) return;
  if (mesh.isInstancedMesh && mesh.count > 64) return; // (la vegetación: miles de copias)
  if (!outN(mesh.geometry)) return;
  let o;
  if (mesh.isSkinnedMesh) { o = new THREE.SkinnedMesh(mesh.geometry, outlMat(true)); o.bind(mesh.skeleton, mesh.bindMatrix); o.bindMode = mesh.bindMode; }
  else if (mesh.isInstancedMesh) { o = new THREE.InstancedMesh(mesh.geometry, outlMat(false), mesh.instanceMatrix.count); o.instanceMatrix = mesh.instanceMatrix; o.onBeforeRender = () => { o.count = mesh.count; }; }
  else o = new THREE.Mesh(mesh.geometry, outlMat(false));
  o.userData.isOutline = true; o.frustumCulled = mesh.frustumCulled; o.renderOrder = mesh.renderOrder; o.raycast = () => {}; o.visible = comicOn();
  mesh.add(o); COMIC.ol.set(mesh, o);
}
function comicScan(root) {
  const on = comicOn(), meshes = [];
  root.traverse(o => { const ms = o.material; if (ms) (Array.isArray(ms) ? ms : [ms]).forEach(comicPatch); if (o.userData.isOutline) o.visible = on; else if (on && (o.isMesh || o.isSkinnedMesh)) meshes.push(o); });
  meshes.forEach(outlAdd); // (después de recorrer: añadir hijos mientras se recorre no es buena idea)
}
// lo que se añade a la escena o a la arena (enemigos, efectos…) se prepara al momento, antes de que se compile
for (const g of [scene, arena]) { const add = g.add; g.add = function (...o) { const r = add.apply(this, o); for (const x of o) if (x && x.traverse && !(x.userData && x.userData.isOutline)) comicScan(x); return r; }; }

/* ---------- La fortaleza en cómic ---------- */
function comicEnvBuild() {
  if (COMIC.sky) return;
  // cielo de dibujo: melocotón en el horizonte y azul claro arriba, con nubes blancas de borde entintado y la panza lavanda
  COMIC.sky = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false, uniforms: { uT: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uT; varying vec3 vP;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x), f.y); }
      float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<4;i++){ v+=a*vnoise(p); p*=2.03; a*=0.5; } return v; }
      void main(){
        vec3 d = normalize(vP); float h = d.y;
        vec3 c = mix(vec3(1.0,0.85,0.72), vec3(0.62,0.8,1.0), smoothstep(-0.02, 0.4, h)); c = mix(c, vec3(0.45,0.66,0.98), smoothstep(0.4, 0.95, h));
        vec2 uv = d.xz / (max(h, 0.0) + 0.25) * 0.9 + vec2(uT * 0.008, uT * 0.003);
        float n = fbm(uv), mh = smoothstep(0.03, 0.12, h);
        float cl = smoothstep(0.545, 0.555, n), ink = smoothstep(0.52, 0.53, n) - cl;
        vec3 cloud = mix(vec3(0.82,0.78,0.97), vec3(1.0), smoothstep(0.57, 0.64, fbm(uv + vec2(0.04, 0.06))));
        c = mix(c, cloud, cl * mh); c = mix(c, vec3(0.2,0.13,0.25), ink * mh * 0.85);
        gl_FragColor = vec4(c, 1.0);
      }`
  });
  // suelo color arena con grietas a tinta (ramas que se abren) y manchas algo más claras
  const S = 1024, cv = mkCanvas(S), x = cv.getContext('2d'), R = rng(11);
  x.fillStyle = '#ecc9a4'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(255,240,220,${0.25 + R() * 0.25})`; x.beginPath(); x.ellipse(R() * S, R() * S, 30 + R() * 90, 20 + R() * 60, R() * 3, 0, TAU); x.fill(); }
  x.strokeStyle = '#3a2430'; x.lineCap = 'round'; x.lineJoin = 'round';
  const crack = (px, py, a, len, w) => { x.lineWidth = w; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < len; k++) { a += (R() - 0.5) * 0.9; px += Math.cos(a) * 14; py += Math.sin(a) * 14; x.lineTo(px, py); if (R() < 0.12 && w > 1.2) { x.stroke(); crack(px, py, a + (R() < 0.5 ? 1 : -1) * (0.6 + R() * 0.6), len * 0.5 | 0, w * 0.6); x.lineWidth = w; x.beginPath(); x.moveTo(px, py); } } x.stroke(); };
  for (let i = 0; i < 14; i++) crack(R() * S, R() * S, R() * TAU, 8 + (R() * 10 | 0), 2.6 + R() * 1.6);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(7, 7); t.encoding = THREE.sRGBEncoding; t.anisotropy = MAX_ANISO;
  COMIC.floor = new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
  COMIC.ground = new THREE.MeshBasicMaterial({ color: 0xd9b996, toneMapped: false });
}
// Encima de lo que pone applyEnvMode: en la fortaleza con cómic, su cielo, su suelo y su luz
function applyComic() {
  const on = comicArenaOn();
  if (on) {
    comicEnvBuild();
    if (!COMIC.saved) COMIC.saved = { sky: sky.material, floor: envFloor.material, ground: outerGround.material };
    sky.material = COMIC.sky; envFloor.material = COMIC.floor; outerGround.material = COMIC.ground;
    scene.fog = new THREE.FogExp2(0xf6dfe4, 0.011); renderer.setClearColor(0xf6dfe4, 1);
  } else if (COMIC.saved) { sky.material = COMIC.saved.sky; envFloor.material = COMIC.saved.floor; outerGround.material = COMIC.saved.ground; COMIC.saved = null; }
  searchlights.forEach(s => { s.grp.visible = !on; }); if (envLights.mesh) envLights.mesh.parent.visible = !on; // (los focos y las luces rojas de la noche de tormenta)
}
function applyLook() {
  // sin el «tono de cine» (comprime los colores): los del dibujo, tal cual
  renderer.toneMapping = comicOn() ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  comicScan(scene); const on = comicOn(); COMIC.mats.forEach(m => comicSet(m, on));
  applyShadows(); applyEnvMode();
  WARM.done.clear(); warmQueue(); // los enemigos, otra vez poco a poco, con el sombreador nuevo
}
settingHooks.push(k => { if (k === 'look') applyLook(); });
function updateComic(dt, t) {
  COMIC.sweepT -= dt; if (COMIC.sweepT <= 0) { COMIC.sweepT = 1.5; comicScan(scene); } // (por si algo cambió de material sin pasar por add)
  if (COMIC.sky && sky.material === COMIC.sky) COMIC.sky.uniforms.uT.value = t;
}
if (comicOn()) renderer.toneMapping = THREE.NoToneMapping;
comicScan(scene);
