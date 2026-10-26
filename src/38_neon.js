/* =================== ESTILO NEÓN (prueba) =================== */
// Entorno ▸ «Estilo visual: Neón (prueba)». Una estética estilizada, como la de los juegos de VR que no buscan ser
// realistas, y más ligera para la gráfica de las gafas:
//  · los materiales «realistas» (luz física: relieve, rugosidad y brillo metálico, varias luces y sombras, en cada punto
//    de la pantalla) pasan a un sombreado plano en dos tonos con un filo luminoso, sin texturas de relieve y sin sombras
//    en tiempo real
//  · en la fortaleza, el escenario se cambia por una arena de neón: suelo de rejilla luminosa, cielo en degradado con un
//    sol retro, montañas de alambre en el horizonte y postes de luz
// Cada material sigue siendo el mismo, con otro sombreador: así valen igual los destellos al recibir un golpe, los
// fundidos y los colores que cambia el juego; al quitarlo, vuelve a ser el de antes
const NEON = { mats: new Set(), uL: { value: new V3(-0.45, 0.8, 0.4).normalize() }, uRim: { value: new THREE.Color(0x4fe8ff) }, uK: { value: 1.15 }, sweepT: 0, env: null };
const neonOn = () => settings.look === 'neon';
const neonArenaOn = () => neonOn() && !arMode && !forestOn() && sceneryPick() === 'arena';
// el color: el de la textura o el del material, algo más saturado; la luz, en dos tonos (sombra y luz, con el corte
// suave); el filo, donde la superficie se pone de canto respecto a ti; y lo que brilla, más
const NEON_LIGHT = `
	vec3 neonL = normalize( ( viewMatrix * vec4( uNeonL, 0.0 ) ).xyz );
	float neonD = dot( normal, neonL );
	float neonTone = mix( 0.52, 1.0, smoothstep( 0.04, 0.14, neonD ) ) * mix( 0.84, 1.0, smoothstep( 0.55, 0.65, neonD ) );
	vec3 neonBase = diffuseColor.rgb; float neonLum = dot( neonBase, vec3( 0.299, 0.587, 0.114 ) ); neonBase = max( mix( vec3( neonLum ), neonBase, 1.35 ), 0.0 );
	float neonRim = pow( 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 ), 3.0 );
	vec3 outgoingLight = neonBase * neonTone * uNeonK + uNeonRim * neonRim * 0.6 + totalEmissiveRadiance * 1.6;`;
const NEON_OUT = 'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;';
function neonShader(sh) {
  if (!sh.fragmentShader.includes(NEON_OUT)) return; // (otro sombreador: se queda como estaba)
  Object.assign(sh.uniforms, { uNeonL: NEON.uL, uNeonRim: NEON.uRim, uNeonK: NEON.uK });
  let f = sh.fragmentShader;
  for (const inc of ['lights_physical_fragment', 'lights_fragment_begin', 'lights_fragment_maps', 'lights_fragment_end', 'aomap_fragment']) f = f.replace(`#include <${inc}>`, '');
  sh.fragmentShader = 'uniform vec3 uNeonL;\nuniform vec3 uNeonRim;\nuniform float uNeonK;\n' + f.replace(NEON_OUT, NEON_LIGHT);
}
// Prepara un material (una vez): su sombreador, con el neón si toca. La clave del programa distingue las dos versiones
// (y conserva la del sombreador propio que ya tuviera: el viento del bosque). El estado va aparte (NEON.st), no en
// userData: three.js lo copia como texto al clonar un material, y ahí no caben las texturas guardadas
const NEON_MAPS = ['normalMap', 'roughnessMap', 'metalnessMap', 'envMap', 'aoMap'];
NEON.st = new WeakMap();
function neonPatch(m) {
  if (!m || !m.isMeshStandardMaterial) return;
  let S = NEON.st.get(m); if (S && m.onBeforeCompile === S.wrap) return;
  const prev = m.onBeforeCompile || (() => {}), base = THREE.Material && THREE.Material.prototype.customProgramCacheKey;
  const own = m.customProgramCacheKey && m.customProgramCacheKey !== base && (!S || m.customProgramCacheKey !== S.key), prevKey = own ? m.customProgramCacheKey.bind(m) : () => prev.toString();
  if (!S) { S = { on: false, saved: null }; NEON.st.set(m, S); NEON.mats.add(m); if (m.addEventListener) m.addEventListener('dispose', () => NEON.mats.delete(m)); }
  S.wrap = function (sh, r) { prev.call(this, sh, r); if (S.on) neonShader(sh); };
  S.key = function () { return prevKey() + (S.on ? '|neon' : ''); };
  m.onBeforeCompile = S.wrap; m.customProgramCacheKey = S.key;
  neonSet(m, neonOn());
}
// Con neón, fuera las texturas de relieve, rugosidad, brillo y reflejos (y, en las superficies que las tenían, también
// la de color: quedan lisas, de su color medio, algo más oscuro, que si no quedaba el blanco del material); sin él, vuelven
function neonSet(m, on) {
  const S = NEON.st.get(m); if (!S || S.on === on) return;
  S.on = on;
  if (on) {
    const sv = S.saved = {}, detailed = !!(m.normalMap || m.roughnessMap);
    if (detailed && m.map) { const a = texAvg(m.map); if (a) { sv.color = m.color.getHex(); m.color.multiply(a).multiplyScalar(0.75); } }
    for (const k of [...NEON_MAPS, ...(detailed ? ['map'] : [])]) { sv[k] = m[k]; m[k] = null; }
  } else if (S.saved) { const sv = S.saved; if (sv.color !== undefined) { m.color.setHex(sv.color); delete sv.color; } Object.assign(m, sv); S.saved = null; }
  m.needsUpdate = true;
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
function neonScan(root) { root.traverse(o => { const ms = o.material; if (ms) (Array.isArray(ms) ? ms : [ms]).forEach(neonPatch); }); }
// lo que se añade a la escena o a la arena (enemigos, efectos…) se prepara al momento, antes de que se compile
for (const g of [scene, arena]) { const add = g.add; g.add = function (...o) { const r = add.apply(this, o); for (const x of o) if (x && x.traverse) neonScan(x); return r; }; }

/* ---------- La arena de neón ---------- */
function neonEnvBuild() {
  if (NEON.env) return NEON.env;
  const g = new THREE.Group(); g.visible = false; scene.add(g); NEON.env = g;
  // cielo: violeta oscuro arriba, magenta y rosa en el horizonte, estrellas y un sol retro a rayas detrás de las compuertas
  NEON.sky = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false, uniforms: { uSun: { value: new V3(0, 0.1, -1).normalize() }, uT: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uSun; uniform float uT; varying vec3 vP;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      void main(){
        vec3 d = normalize(vP); float h = d.y;
        vec3 c = mix(vec3(0.42,0.04,0.36), vec3(0.08,0.015,0.2), smoothstep(0.0, 0.32, h)); c = mix(c, vec3(0.012,0.0,0.04), smoothstep(0.32, 0.9, h));
        c += vec3(1.0,0.3,0.55) * exp(-abs(h) * 20.0) * 0.55;
        vec2 sp = floor(d.xz / (h + 0.35) * 260.0); float st = step(0.9965, hash(sp)) * smoothstep(0.15, 0.5, h) * (0.6 + 0.4 * sin(uT * 2.0 + hash(sp + 3.0) * 30.0)); c += vec3(st);
        vec3 su = normalize(vec3(0.0,1.0,0.0) - uSun * uSun.y), sx = normalize(cross(su, uSun)); vec3 o = d - uSun;
        vec2 q = vec2(dot(o, sx), dot(o, su)) / 0.17; float r = length(q);
        if (r < 1.0) {
          float band = q.y < 0.25 ? step(0.45 + (0.25 - q.y) * 0.32, fract((q.y + uT * 0.05) * 5.0)) : 1.0;
          c = mix(c, mix(vec3(1.0,0.2,0.55), vec3(1.0,0.86,0.25), smoothstep(-0.9, 0.8, q.y)) * 1.15, band * smoothstep(1.0, 0.97, r));
        }
        c += mix(vec3(1.0,0.25,0.5), vec3(1.0,0.7,0.3), 0.5) * exp(-max(r - 1.0, 0.0) * 3.5) * 0.25;
        gl_FragColor = vec4(c, 1.0);
      }`
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(140, 32, 16), NEON.sky); sky.renderOrder = -10; g.add(sky);
  // suelo: rejilla luminosa (cada metro, y más marcada cada cinco) que se apaga a lo lejos en un resplandor magenta
  NEON.floor = new THREE.ShaderMaterial({
    fog: false, toneMapped: false, extensions: { derivatives: true }, uniforms: { uCam: { value: new V3() }, uT: { value: 0 } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform vec3 uCam; uniform float uT; varying vec3 vW;
      float grid(vec2 p){ vec2 g = abs(fract(p - 0.5) - 0.5) / max(fwidth(p), vec2(1e-4)); return 1.0 - min(min(g.x, g.y), 1.0); }
      void main(){
        float dist = length(vW.xz - uCam.xz), fade = exp(-dist * 0.045);
        float l1 = grid(vW.xz), l5 = grid(vW.xz / 5.0);
        vec3 c = vec3(0.025,0.0,0.06) + vec3(0.25,0.95,1.0) * l1 * 0.45 * fade + vec3(1.0,0.25,0.75) * l5 * (0.35 + 0.5 * fade) * (0.85 + 0.15 * sin(uT * 2.0));
        c = mix(c, vec3(0.32,0.05,0.3), smoothstep(25.0, 110.0, dist));
        gl_FragColor = vec4(c, 1.0);
      }`
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), NEON.floor); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.003; g.add(floor);
  // montañas en el horizonte: siluetas oscuras con las aristas de alambre magenta
  const R = rng(7), N = 96, P = [], I = [], L = [], peak = [];
  for (let i = 0; i <= N; i++) { const a = i / N * TAU, hh = i % N === 0 ? 8 : 5 + R() * 9 + (i % 7 === 0 ? R() * 14 : 0); peak.push(i === N ? peak[0] : hh); }
  for (let i = 0; i <= N; i++) { const a = i / N * TAU, x = Math.cos(a) * 100, z = Math.sin(a) * 100; P.push(x, 0, z, x, peak[i], z); if (i < N) { const b = i * 2; I.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); L.push(x, peak[i], z, Math.cos(a + TAU / N) * 100, peak[i + 1], Math.sin(a + TAU / N) * 100); if (i % 3 === 0) L.push(x, peak[i], z, Math.cos(a + TAU / N * 1.5) * 100, 0, Math.sin(a + TAU / N * 1.5) * 100); } }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3)); mg.setIndex(I);
  g.add(new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ color: 0x0d0420, fog: false, side: THREE.DoubleSide })));
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(L), 3));
  g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xff3fb0, fog: false, toneMapped: false })));
  // postes de luz alrededor, cian y magenta alternos (todos en una malla)
  const parts = [];
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * TAU + 0.1, b = new THREE.BoxGeometry(0.1, 5, 0.1); b.translate(Math.cos(a) * 17, 2.5, Math.sin(a) * 17);
    const c = new THREE.Color(i % 2 ? 0xff3fb0 : 0x3cf0ff), cols = []; for (let k = 0; k < b.attributes.position.count; k++) cols.push(c.r, c.g, c.b);
    b.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); parts.push(b.index ? b.toNonIndexed() : b);
  }
  let n = 0; parts.forEach(p => n += p.attributes.position.count);
  const pp = new Float32Array(n * 3), pc = new Float32Array(n * 3); let o = 0; parts.forEach(p => { pp.set(p.attributes.position.array, o); pc.set(p.attributes.color.array, o); o += p.attributes.position.array.length; });
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); pg.setAttribute('color', new THREE.BufferAttribute(pc, 3));
  g.add(new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
  return g;
}
// Encima de lo que pone applyEnvMode: en la fortaleza con neón, la arena de neón en lugar de la muralla
function applyNeon() {
  const on = neonArenaOn(); if (on) neonEnvBuild(); if (NEON.env) NEON.env.visible = on;
  if (!on) return;
  env.visible = false; scene.fog = new THREE.FogExp2(0x2a0a40, 0.02); renderer.setClearColor(0x05010d, 1); renderer.toneMappingExposure = 1.0;
}
function applyLook() {
  neonScan(scene); const on = neonOn(); NEON.mats.forEach(m => neonSet(m, on));
  applyShadows(); applyEnvMode();
  WARM.done.clear(); warmQueue(); // los enemigos, otra vez poco a poco, con el sombreador nuevo
}
settingHooks.push(k => { if (k === 'look') applyLook(); });
const _nsd = new V3(), _neq = new Q4();
function updateNeon(dt, t) {
  NEON.sweepT -= dt; if (NEON.sweepT <= 0) { NEON.sweepT = 1.5; neonScan(scene); } // (por si algo cambió de material sin pasar por add)
  if (!NEON.env || !NEON.env.visible) return;
  NEON.sky.uniforms.uT.value = t; NEON.floor.uniforms.uT.value = t; NEON.floor.uniforms.uCam.value.copy(head.p);
  _neq.copy(arena.quaternion); NEON.sky.uniforms.uSun.value.copy(_nsd.set(0, 0.1, -1).applyQuaternion(_neq).normalize()); // el sol, detrás de las compuertas (la arena cuelga de la escena: su giro es el del mundo)
}
neonScan(scene);
