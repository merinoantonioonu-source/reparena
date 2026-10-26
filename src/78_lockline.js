/* =================== DIANA: CONTORNO DE NEÓN =================== */
// En lugar del aro, al enemigo al que apuntas le sale un contorno rojo de neón algo separado de su silueta, que sigue su
// forma en cada momento (si levanta un brazo o se agacha, la línea va con él) y brilla con un pulso lento mientras lo
// apuntas (algo más vivo con el disparo cargado). En los pequeños de las trampillas, más fino. Es una copia del enemigo dibujada por detrás y ensanchada en pantalla, como el
// contorno de tinta del cómic: primero se marca en el stencil el hueco alrededor de toda la figura (sin pintar nada) y
// el resplandor y la línea solo se pintan fuera de él, así que queda solo la silueta de fuera, sin líneas por dentro.
// Solo se dibuja en el que apuntas (unas pocas pasadas más de un solo enemigo)
// Capas: [tipo, ancho en pantalla, color, opacidad], en el orden en que se pintan (el resplandor, debajo de la línea)
const LKL = {
  layers: [['mask', 0.012], ['band', 0.036, 0xff1a1a, 0.2], ['band', 0.026, 0xff1a1a, 0.42], ['band', 0.0175, 0xff3a2e, 1]],
  mats: {}, has: new Set(), on: new Map(), k: 1
};
const LKL_BIT = 2; // (el bit 1 del stencil es la boca del remolino del bosque)
function lklMat(i, skin, thin) {
  const key = i + (skin ? 's' : 'n') + (thin ? 't' : ''); if (LKL.mats[key]) return LKL.mats[key];
  const [mode, w0, col, op] = LKL.layers[i], w = w0 * (thin ? 0.5 : 1); // (fino: la mitad de ancho, hueco incluido)
  const m = new THREE.MeshBasicMaterial({ color: col || 0, side: THREE.BackSide, skinning: skin, transparent: true, opacity: op || 1, depthWrite: false, toneMapped: false, fog: false });
  Object.assign(m, { stencilWrite: true, stencilRef: LKL_BIT, stencilFuncMask: LKL_BIT });
  if (mode === 'mask') Object.assign(m, { colorWrite: false, depthTest: false, stencilWriteMask: LKL_BIT, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp });
  else Object.assign(m, { stencilWriteMask: 0, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.KeepStencilOp });
  m.userData.base = op || 1; const uW = { value: w };
  m.onBeforeCompile = sh => {
    sh.uniforms.uLkW = uW;
    sh.vertexShader = 'attribute vec3 aOutN;\nuniform float uLkW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
	vec3 lN = aOutN;
	#ifdef USE_SKINNING
		lN = ( bindMatrixInverse * ( skinWeight.x * boneMatX + skinWeight.y * boneMatY + skinWeight.z * boneMatZ + skinWeight.w * boneMatW ) * bindMatrix * vec4( lN, 0.0 ) ).xyz;
	#endif
	vec2 lD = ( projectionMatrix * vec4( normalize( normalMatrix * lN ), 0.0 ) ).xy;
	gl_Position.xy += normalize( lD + vec2( 1e-5 ) ) * uLkW * gl_Position.w;`);
  };
  m.customProgramCacheKey = () => 'lockline' + (skin ? 's' : 'n'); // (el ancho va en un uniforme: un programa para todos)
  return (LKL.mats[key] = m);
}
// Le pone las capas del contorno a todo lo que forma la figura (ocultas hasta que se le apunte); devuelve la lista
function lklAttach(root, thin) {
  const meshes = [], out = [];
  root.traverse(o => { if ((o.isMesh || o.isSkinnedMesh) && !o.isInstancedMesh && !o.userData.isOutline && !o.userData.isLockLine && o.geometry && o.material && !Array.isArray(o.material) && !o.material.transparent) meshes.push(o); });
  LKL.layers.forEach((L, i) => {
    for (const mesh of meshes) {
      if (!outN(mesh.geometry)) continue;
      const mat = lklMat(i, !!mesh.isSkinnedMesh, thin); let o;
      if (mesh.isSkinnedMesh) { o = new THREE.SkinnedMesh(mesh.geometry, mat); o.bind(mesh.skeleton, mesh.bindMatrix); o.bindMode = mesh.bindMode; } else o = new THREE.Mesh(mesh.geometry, mat);
      o.userData.isLockLine = true; o.frustumCulled = false; o.renderOrder = 40 + i; o.raycast = () => {}; o.castShadow = o.receiveShadow = false; o.visible = false;
      mesh.add(o); out.push(o);
    }
  });
  return out;
}
// Desde updateAim: este enemigo está apuntado (hot: con el disparo cargado)
function lockShow(e, hot) { if (e && e.alive && e.root) LKL.on.set(e, LKL.on.get(e) || !!hot); }
// Al final de updateAim: enseña el contorno de los apuntados, con su parpadeo, y lo quita a los demás
function lockStep(t) {
  let hot = false;
  for (const [e, h] of LKL.on) { if (!e.lkl) { e.lkl = lklAttach(e.root, e.type === 'spider' || isTiny()); LKL.has.add(e); } hot = hot || h; } // (los de las trampillas, finos)
  for (const e of LKL.has) {
    const show = LKL.on.has(e) && e.alive;
    if (e.lkl.length && e.lkl[0].visible !== show) for (const o of e.lkl) o.visible = show;
    if (!e.alive && !show) LKL.has.delete(e);
  }
  // brillo que sube y baja despacio (un pulso cada 1,4 s; con carga, cada 0,9 s y algo más vivo)
  const want = (hot ? 0.6 : 0.4) + (hot ? 0.4 : 0.6) * (0.5 + 0.5 * Math.sin(t * TAU / (hot ? 0.9 : 1.4))), dt = clamp(t - (LKL.t || t), 0, 0.1); LKL.t = t;
  LKL.k += (want - LKL.k) * Math.min(1, dt * 5); // (al cargar o disparar no salta: se funde)
  for (const k in LKL.mats) { const m = LKL.mats[k]; if (m.colorWrite !== false) m.opacity = m.userData.base * LKL.k; }
  LKL.on.clear();
}
