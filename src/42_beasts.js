
/* =================== MONSTRUOS DE ARCHIVO (glTF): Imp y Puglin =================== */
// models/imp.glb y models/puglin.glb (Bestiary · Dungeon Monsters Kit, de Quaternius) traen el cuerpo y el esqueleto;
// models/anims.glb, las animaciones de la Universal Animation Library (Quaternius, CC0), hechas para ese mismo esqueleto.
// Las texturas, reducidas, están en models/tex (tres colores por monstruo). Se cargan al abrir la página y, mientras no
// estén (o si no se pueden cargar), en su lugar salen humanoides de neón.
const BEAST = { ready: false, failed: false, loading: false, kinds: {} };
// h: altura del modelo (m); walk/jog/run: a qué velocidad (m/s, a escala 1) avanza cada animación de andar
const BEAST_DEF = { imp: { h: 1.68, walk: 1.25, jog: 2.9, run: 4.6 }, puglin: { h: 0.93, walk: 0.8, jog: 1.9, run: 3.0 } };
const BEAST_CLIPS = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Punch_Cross', 'Punch_Jab', 'Sword_Attack', 'Hit_Chest', 'Hit_Head', 'Death01', 'Dance_Loop', 'Spell_Simple_Shoot'];
// Una animación de la biblioteca → para un monstruo: las rotaciones de sus huesos (menos root, que el juego mueve) y el
// balanceo de la pelvis, a la escala de su altura de cadera. Las pistas de huesos que el monstruo no tiene (meñiques, punta
// del pie) se quitan: si no, Three.js las aplica al modelo entero y le cambia la orientación
function beastRetarget(clip, ualPelvis, monPelvis, has) {
  const tracks = [], k = monPelvis / ualPelvis;
  for (const t of clip.tracks) {
    const [node, prop] = t.name.split('.'); if (node === 'root' || !has.has(node)) continue;
    if (prop === 'quaternion') tracks.push(t);
    else if (prop === 'position' && node === 'pelvis') { const c = t.clone(); for (let i = 0; i < c.values.length; i++) c.values[i] *= k; tracks.push(c); }
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
function loadBeasts() {
  if (BEAST.loading || BEAST.ready) return;
  if (!THREE.GLTFLoader || !THREE.SkeletonUtils || typeof document === 'undefined') { BEAST.failed = true; return; }
  BEAST.loading = true;
  const L = new THREE.GLTFLoader(), T = new THREE.TextureLoader();
  const get = f => new Promise((res, rej) => L.load(`models/${f}.glb`, res, undefined, rej));
  const tex = (f, srgb) => { const t = T.load(`models/tex/${f}.jpg`); t.flipY = false; if (srgb) t.encoding = THREE.sRGBEncoding; return t; };
  Promise.all([get('anims'), ...Object.keys(BEAST_DEF).map(get)]).then(([U, ...models]) => {
    const up = U.scene.getObjectByName('pelvis').position.z;
    Object.keys(BEAST_DEF).forEach((k, i) => {
      const scene = models[i].scene, mp = scene.getObjectByName('pelvis').position.z, clips = {}, has = new Set();
      scene.traverse(o => has.add(o.name));
      for (const n of BEAST_CLIPS) { const c = U.animations.find(a => a.name === n); if (c) clips[n] = beastRetarget(c, up, mp, has); }
      const orm = tex(k + '_orm');
      BEAST.kinds[k] = { scene, clips, maps: [1, 2, 3].map(v => tex(`${k}_color${v}`, true)), normal: tex(k + '_normal'), orm, emissive: tex(k + '_emissive', true) };
    });
    BEAST.ready = true;
  }).catch(e => { BEAST.failed = true; console.log('No se pudieron cargar los monstruos:', e && e.message); });
}
// Hace de «rig» para el constructor de los robots: cada ejemplar es una copia del modelo con su propio esqueleto y material
function beastRig(kind) {
  return { kind: 'beast', instance() {
    const B = BEAST.kinds[kind], model = THREE.SkeletonUtils.clone(B.scene), v = Math.floor(Math.random() * 3);
    const mat = new THREE.MeshStandardMaterial({ map: B.maps[v], normalMap: B.normal, roughnessMap: B.orm, metalnessMap: B.orm, emissiveMap: B.emissive, emissive: 0xffffff, emissiveIntensity: 1, roughness: 1, metalness: 1, skinning: true });
    model.traverse(m => { if (m.isMesh) { m.material = mat; m.castShadow = true; m.frustumCulled = false; } });
    const root = new THREE.Group(); root.add(model); model.rotation.y = Math.PI; // con las animaciones, el modelo mira hacia −Z: se gira para que mire hacia donde va
    const bones = { chest: model.getObjectByName('spine_03'), head: model.getObjectByName('Head'), handR: model.getObjectByName('hand_r') };
    return { root, model, mat, bones, meshes: {}, list: [], skel: { dispose() {} }, variant: v };
  } };
}
loadBeasts();
