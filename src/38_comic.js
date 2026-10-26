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
// (COMIC_SOFT: los orbes y los diamantes, con un degradado redondeado en vez del corte duro; y a todo, un poco de luz dentro
// de cada tono y un degradado de abajo arriba, para que los planos grandes, como las compuertas, no queden de un solo color)
const COMIC_LIGHT = `
	vec3 cL = normalize( ( viewMatrix * vec4( uComicL, 0.0 ) ).xyz );
	float cD = dot( normal, cL );
	#ifdef COMIC_SOFT
		float cLit = smoothstep( -0.45, 0.75, cD );
	#else
		float cLit = smoothstep( 0.0, 0.035, cD );
	#endif
	vec3 cBase = diffuseColor.rgb; float cLum = dot( cBase, vec3( 0.299, 0.587, 0.114 ) ); cBase = max( mix( vec3( cLum ), cBase, 1.3 ), 0.0 );
	vec3 cCol = mix( cBase * uComicShadow, cBase, cLit ) * ( 0.9 + 0.13 * clamp( cD, 0.0, 1.0 ) );
	float cSp = smoothstep( 0.9, 0.93, dot( reflect( - cL, normal ), normalize( vViewPosition ) ) ) * cLit; cCol += vec3( 0.3 ) * cSp;
	#if __VERSION__ >= 300
		vec3 cW = transpose( mat3( viewMatrix ) ) * ( - vViewPosition ) + cameraPosition;
		cCol *= mix( 0.8, 1.07, smoothstep( -0.2, 3.4, cW.y ) );
		float cH = abs( fract( dot( cW, vec3( 0.9, 0.55, -0.7 ) ) * 26.0 ) - 0.5 );
		cCol *= 1.0 - ( 1.0 - smoothstep( 0.1, 0.2, cH ) ) * ( 1.0 - cLit ) * 0.3 * smoothstep( 7.0, 3.0, length( vViewPosition ) ); // (solo de cerca: a lo lejos hacía aguas)
	#endif
	vec3 outgoingLight = cCol * uComicK + totalEmissiveRadiance * 1.4;`;
function comicShader(sh, soft) {
  if (!sh.fragmentShader.includes(COMIC_OUT)) return; // (otro sombreador: se queda como estaba)
  if (soft) sh.fragmentShader = '#define COMIC_SOFT\n' + sh.fragmentShader;
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
  S.wrap = function (sh, r) { prev.call(this, sh, r); if (S.on) comicShader(sh, !!this.userData.comicSoft); };
  S.key = function () { return prevKey() + (S.on ? (this.userData.comicSoft ? '|comicsoft' : '|comic') : ''); };
  m.onBeforeCompile = S.wrap; m.customProgramCacheKey = S.key;
  comicSet(m, comicOn());
}
// En cómic, fuera las texturas de relieve, rugosidad, brillo y reflejos; en las superficies que las tenían, también la de
// color: quedan lisas, del tono pastel de su color medio (que si no, quedaba el blanco del material). Sin él, vuelven
function comicSet(m, on) {
  const S = COMIC.st.get(m); if (!S || S.on === on) return;
  S.on = on;
  if (on) {
    // (los que tienen esqueleto conservan su textura de color: el diablillo y el Puglin se tiñen al recibir reescribiendo el
    // color en cada fotograma, y sin la textura se quedaban blancos)
    const sv = S.saved = {}, detailed = !!(m.normalMap || m.roughnessMap) && !m.skinning && !m.userData.keepMap;
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
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false, extensions: { derivatives: true }, uniforms: { uT: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uT; varying vec3 vP;
      float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); } // (sin seno: en las Quest, sin(números grandes) pierde precisión y el ruido salía en bloques rectos)
      float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x), f.y); }
      float fbm(vec2 p){ float v=0.0, a=0.6; for(int i=0;i<3;i++){ v+=a*vnoise(p); p*=2.03; a*=0.42; } return v / 0.9564; } // (pocas octavas: formas redondeadas)
      // bultos redondos (celdas: cerca de un punto de cada celda, alto): dan al borde las ondas de una nube de dibujo
      float bumps(vec2 p){ vec2 i=floor(p), f=fract(p); float m=1.0; for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec2 o=vec2(float(x),float(y)); vec2 q=o+vec2(hash(i+o), hash(i+o+17.3))*0.8+0.1; m=min(m, length(q-f)); } return 1.0-m; }
      // (los bultos, solo junto al borde de una nube: sin motas sueltas en el cielo)
      // (hacia el horizonte, donde todo se ve más pequeño, sin bultos: no salen granitos)
      float cloudF(vec2 p, float h){ float f = fbm(p); return f * 0.88 + bumps(p * 5.0) * 0.14 * smoothstep(0.42, 0.58, f) * smoothstep(0.06, 0.3, h); }
      void main(){
        vec3 d = normalize(vP); float h = d.y;
        vec3 c = mix(vec3(1.0,0.85,0.72), vec3(0.62,0.8,1.0), smoothstep(-0.02, 0.4, h)); c = mix(c, vec3(0.45,0.66,0.98), smoothstep(0.4, 0.95, h));
        // las nubes, en una cúpula que apenas se estira hacia el horizonte; allí no se cortan: encogen (el umbral sube), así
        // cada una sigue entera con su borde de tinta y no quedan franjas planas ni cortes rectos
        vec2 uv = d.xz / (max(h, 0.0) + 0.5) * 2.0 + vec2(uT * 0.008, uT * 0.003);
        float n = cloudF(uv, h), thr = 0.63 + 0.22 * (1.0 - smoothstep(0.05, 0.3, h));
        float fw = max(fwidth(n), 1e-4), cl = smoothstep(thr - fw, thr, n), ink = smoothstep(thr - fw * 3.5, thr - fw * 2.5, n) - cl; // (el borde, de grosor fijo en pantalla)
        // por dentro: blanca arriba y con la panza lavanda (la sombra, por el lado de abajo de cada nube; el desplazamiento,
        // sin normalizar: en lo más alto no da saltos)
        vec2 u2 = uv - d.xz * 0.12; float top = smoothstep(thr + 0.0, thr + 0.09, cloudF(u2, h));
        vec3 cloud = mix(vec3(0.82,0.78,0.97), vec3(1.0), top);
        c = mix(c, cloud, cl); c = mix(c, vec3(0.2,0.13,0.25), ink * 0.85);
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
/* ---------- Escenario de cómic (en lugar de la fortaleza) ---------- */
// Un valle de dibujo animado, todo de pocos polígonos y con su contorno: el suelo color arena con grietas a tinta, mesetas
// escalonadas en tonos coral, melocotón y lavanda, ruinas de columnas y arcos color crema, rocas que flotan en el cielo y,
// al fondo, montañas recortadas en lavanda. Cada parte es una sola malla (un dibujo, y otro su contorno)
const ccol = h => { const c = new THREE.Color(h); return c.convertSRGBToLinear ? c.convertSRGBToLinear() : c; };
function comicWorldBuild() {
  if (COMIC.world) return COMIC.world; comicEnvBuild();
  const g = new THREE.Group(), R = rng(23), mat = std({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
  const sk = new THREE.Mesh(new THREE.SphereGeometry(140, 32, 16), COMIC.sky); sk.renderOrder = -10; g.add(sk);
  const fl = new THREE.Mesh(new THREE.CircleGeometry(46, 64), COMIC.floor); fl.rotation.x = -Math.PI / 2; g.add(fl);
  const og = new THREE.Mesh(new THREE.RingGeometry(45.9, 160, 48), COMIC.ground); og.rotation.x = -Math.PI / 2; og.position.y = -0.01; g.add(og);
  const k = new Kit();
  // mesetas: tres o cuatro pisos que se estrechan, cada uno de su color
  const BANDS = [['#f2a3a0', '#f7c79f', '#e98f8f', '#fbe0b8'], ['#c9a0dc', '#e3b7e8', '#b98ad0', '#f1d9f5'], ['#f7b98f', '#fbd3a5', '#ee9a72', '#fde8c8']];
  for (let i = 0; i < 13; i++) {
    const a = i / 13 * TAU + R() * 0.3, r = 30 + R() * 26, x = Math.cos(a) * r, z = Math.sin(a) * r, P = BANDS[i % 3], floors = 3 + (R() < 0.4 ? 1 : 0);
    let y = 0, rad = 4 + R() * 5; const ry = R() * TAU;
    for (let f = 0; f < floors; f++) { const h = 2.5 + R() * 4.5, rt = rad * (0.78 + R() * 0.1); k.add('w', G.cylRaw(rt, rad, h, 7), ccol(P[f % P.length]), x, y + h / 2, z, 0, ry + f * 0.4, 0); y += h; rad = rt * (0.92 - R() * 0.1); }
    k.add('w', G.cylRaw(rad * 0.98, rad, 0.5, 7), ccol(P[3]), x, y + 0.25, z, 0, ry, 0); // la tapa, más clara
  }
  // ruinas: columnas rotas (alguna con su capitel) y un par de arcos
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * TAU + 0.35 + R() * 0.25, r = 13 + R() * 7, x = Math.cos(a) * r, z = Math.sin(a) * r, h = 1.6 + R() * 3.2;
    k.add('w', G.cylRaw(0.42, 0.48, h, 8), ccol('#f3e3c3'), x, h / 2, z, (R() - 0.5) * 0.12, R() * 3, (R() - 0.5) * 0.12);
    if (R() < 0.5) k.add('w', G.box(1.1, 0.35, 1.1), ccol('#e8d2a8'), x, h + 0.17, z, 0, R() * 3, 0);
    k.add('w', G.box(1.2, 0.3, 1.2), ccol('#e0c89c'), x, 0.15, z, 0, R() * 3, 0);
  }
  for (const a of [2.2, 4.1]) { const r = 17, x = Math.cos(a) * r, z = Math.sin(a) * r, t = new V3(-Math.sin(a), 0, Math.cos(a));
    for (const sgn of [-1, 1]) k.add('w', G.cylRaw(0.45, 0.5, 4.2, 8), ccol('#f3e3c3'), x + t.x * sgn * 1.5, 2.1, z + t.z * sgn * 1.5);
    k.add('w', G.box(4.2, 0.6, 1.1), ccol('#e8d2a8'), x, 4.5, z, 0, -a + Math.PI / 2, 0); }
  // rocas que flotan: un cono boca abajo con su meseta encima
  for (let i = 0; i < 5; i++) {
    const a = R() * TAU, r = 38 + R() * 22, x = Math.cos(a) * r, z = Math.sin(a) * r, y = 16 + R() * 12, s = 2.5 + R() * 3, P = BANDS[(i + 1) % 3];
    k.add('w', G.cylRaw(s, s * 0.15, s * 1.6, 6), ccol(P[0]), x, y - s * 0.8, z, 0, R() * 3, 0); k.add('w', G.cylRaw(s * 0.95, s, 0.6, 6), ccol(P[3]), x, y + 0.3, z, 0, R() * 3, 0);
  }
  g.add(k.build({ w: mat }));
  // montañas al fondo: recortadas, lavanda (sin luz ni niebla: un fondo pintado)
  const N = 64, P = [], I = [], L = [], pk = [];
  for (let i = 0; i <= N; i++) pk.push(i === N ? pk[0] : 10 + R() * 12 + (i % 5 === 0 ? R() * 14 : 0));
  for (let i = 0; i <= N; i++) { const a = i / N * TAU, x = Math.cos(a) * 115, z = Math.sin(a) * 115; P.push(x, 0, z, x, pk[i], z); if (i < N) { const b = i * 2; I.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); L.push(x, pk[i], z, Math.cos(a + TAU / N) * 115, pk[i + 1], Math.sin(a + TAU / N) * 115); } }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3)); mg.setIndex(I);
  g.add(new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ color: ccol('#b9a6dd'), fog: false, side: THREE.DoubleSide, toneMapped: false })));
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(L), 3));
  g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x140c1a, fog: false })));
  g.visible = false; scene.add(g); COMIC.world = g; // (al añadirlo, sus piezas reciben el sombreado de cómic y su contorno)
  return g;
}
// Encima de lo que pone applyEnvMode: en la fortaleza con cómic, el valle de dibujo en su lugar
function applyComic() {
  const on = comicArenaOn(); if (on) comicWorldBuild(); if (COMIC.world) COMIC.world.visible = on;
  if (!on) return;
  env.visible = false; scene.fog = new THREE.FogExp2(0xf6dfe4, 0.011); renderer.setClearColor(0xf6dfe4, 1);
}

/* ---------- Efectos de cómic ---------- */
// Al acertar, líneas de impacto; al derribar, un estallido de estrella (sin palabras: para eso está el sonido); y las
// explosiones, en nubes de humo dibujadas (blancas, con contorno) en lugar de fuego y humo
const CFX = { list: [], tex: null };
function cfxTex() {
  if (CFX.tex) return CFX.tex;
  const T = CFX.tex = { stars: [], lines: null, puff: null };
  for (let v = 0; v < 3; v++) { // estrellas de estallido, con sus puntas desiguales (tres variantes)
    const cv = mkCanvas(256), x = cv.getContext('2d'), c = 128, n = 11 + v, R = rng(31 + v);
    const jit = Array.from({ length: n * 2 }, () => 0.8 + R() * 0.25);
    const star = (Ro, ri, fill) => { x.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * TAU, rad = (i % 2 ? ri : Ro) * jit[i]; x.lineTo(c + Math.cos(a) * rad, c + Math.sin(a) * rad); } x.closePath(); x.fillStyle = fill; x.fill(); };
    star(124, 66, '#140c1a'); star(113, 58, '#ffd23f'); star(76, 40, '#ff8a3d'); x.fillStyle = '#fff8e0'; x.beginPath(); x.arc(c, c, 22, 0, TAU); x.fill();
    T.stars.push(texFrom(cv));
  }
  { const cv = mkCanvas(256), x = cv.getContext('2d'), R = rng(5); x.fillStyle = '#140c1a';
    for (let i = 0; i < 22; i++) { const a = i / 22 * TAU + R() * 0.15, r0 = 70 + R() * 25, r1 = 124, w = 0.035 + R() * 0.03; x.beginPath(); x.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0); x.lineTo(128 + Math.cos(a - w) * r1, 128 + Math.sin(a - w) * r1); x.lineTo(128 + Math.cos(a + w) * r1, 128 + Math.sin(a + w) * r1); x.closePath(); x.fill(); }
    T.lines = texFrom(cv); }
  { const cv = mkCanvas(128), x = cv.getContext('2d'); x.fillStyle = '#140c1a'; x.beginPath(); x.arc(64, 64, 60, 0, TAU); x.fill(); x.fillStyle = '#ffffff'; x.beginPath(); x.arc(64, 64, 53, 0, TAU); x.fill();
    x.fillStyle = '#d9cdf0'; x.beginPath(); x.arc(64, 64, 53, 0.15 * Math.PI, 0.85 * Math.PI); x.arc(64, 44, 48, 0.8 * Math.PI, 0.2 * Math.PI, true); x.fill(); T.puff = texFrom(cv); }
  return T;
}
function cfxAdd(tex, pos, size, life, kind, o = {}) {
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: !o.top, toneMapped: false, rotation: o.rot || 0 });
  const s = new THREE.Sprite(m); s.position.copy(pos); s.renderOrder = o.top ? 26 : 9; s.scale.setScalar(0.001); scene.add(s);
  CFX.list.push({ s, t: 0, life, size, kind, v: o.v || null, w: o.w || 1 });
}
function updateCFX(dt) {
  for (let i = CFX.list.length - 1; i >= 0; i--) {
    const f = CFX.list[i]; f.t += dt; const k = f.t / f.life;
    if (k >= 1) { scene.remove(f.s); f.s.material.dispose(); CFX.list.splice(i, 1); continue; }
    let sc = f.size;
    if (f.kind === 'pop') { sc *= k < 0.1 ? 1.25 * smooth(k / 0.1) : k < 0.2 ? 1.25 - 0.25 * (k - 0.1) / 0.1 : 1; f.s.material.opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1; f.s.position.y += dt * 0.12; } // salta, se asienta y se va
    else if (f.kind === 'lines') { sc *= 0.6 + 0.9 * k; f.s.material.opacity = 1 - k * k; }
    else { sc *= 0.35 + 0.9 * smooth(Math.min(1, k * 1.7)); f.s.material.opacity = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1; if (f.v) { f.s.position.addScaledVector(f.v, dt); f.v.multiplyScalar(1 - dt * 2); } }
    f.s.scale.set(sc * f.w, sc, 1);
  }
}
function comicHit(p) { if (comicOn() && CFX.list.length < 40) cfxAdd(cfxTex().lines, p, 0.45, 0.24, 'lines', { rot: rand(0, TAU) }); }
function comicKill(p, big) {
  if (!comicOn()) return; const T = cfxTex();
  cfxAdd(pick(T.stars), p, big ? 0.8 : 0.5, 0.45, 'pop', { rot: rand(0, TAU) });
  cfxAdd(T.lines, p, big ? 1.5 : 0.95, 0.3, 'lines', { rot: rand(0, TAU) });
}
function comicBoom(p, size) { const T = cfxTex(); for (let i = 0; i < 7; i++) cfxAdd(T.puff, p.clone().add(new V3(rand(-1, 1), rand(-0.6, 1), rand(-1, 1)).multiplyScalar(0.25 * size)), (0.35 + Math.random() * 0.3) * size, rand(0.5, 0.9), 'puff', { v: new V3(rand(-1, 1), rand(0.4, 1.4), rand(-1, 1)).multiplyScalar(0.7 * size) }); }

function applyLook() {
  // sin el «tono de cine» (comprime los colores): los del dibujo, tal cual
  renderer.toneMapping = comicOn() ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  comicScan(scene); const on = comicOn(); COMIC.mats.forEach(m => comicSet(m, on));
  applyShadows(); applyEnvMode();
  boardBg = null; boardDirty = true; if (menu && menu.rebuild) menu.rebuild(); // el marcador y el menú, en el estilo nuevo
  WARM.done.clear(); warmQueue(); // los enemigos, otra vez poco a poco, con el sombreador nuevo
}
settingHooks.push(k => { if (k === 'look') applyLook(); });
function updateComic(dt, t) {
  COMIC.sweepT -= dt; if (COMIC.sweepT <= 0) { COMIC.sweepT = 1.5; comicScan(scene); } // (por si algo cambió de material sin pasar por add)
  if (COMIC.sky) COMIC.sky.uniforms.uT.value = t;
  updateCFX(dt);
}
if (comicOn()) renderer.toneMapping = THREE.NoToneMapping;
comicScan(scene);
