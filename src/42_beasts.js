
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
    try { BEAST.neonClips = bakeNeonClips(U); } catch (e) { console.log('Animaciones de neón:', e && e.message); }
    BEAST.ready = true;
  }).catch(e => { BEAST.failed = true; console.log('No se pudieron cargar los monstruos:', e && e.message); });
}
/* ---------- Las mismas animaciones, en los humanoides de neón ---------- */
// Su esqueleto es otro (huesos sin giro de reposo, que apuntan hacia abajo), así que no se copian las rotaciones: se
// reproduce cada animación en el esqueleto de la biblioteca y, fotograma a fotograma, cada brazo y cada pierna del
// humanoide se orienta hacia donde apunta el suyo; el tronco, el cuello y la cabeza giran lo mismo que respecto a su
// reposo, y la cadera sube y baja a su escala. Las dos figuras miran hacia +Z con la izquierda en +X
const NEON_BODY = [['hips', 'pelvis'], ['spine', 'spine_01'], ['chest', 'spine_03'], ['neck', 'neck_01'], ['head', 'Head']];
const NEON_LIMB = [['shL', 'upperarm_l', 'lowerarm_l'], ['elL', 'lowerarm_l', 'hand_l'], ['haL', 'hand_l', 'middle_01_l'], ['shR', 'upperarm_r', 'lowerarm_r'], ['elR', 'lowerarm_r', 'hand_r'], ['haR', 'hand_r', 'middle_01_r'],
  ['thL', 'thigh_l', 'calf_l'], ['knL', 'calf_l', 'foot_l'], ['thR', 'thigh_r', 'calf_r'], ['knR', 'calf_r', 'foot_r']];
const NEON_FOOT = [['anL', 'foot_l', 'ball_l'], ['anR', 'foot_r', 'ball_r']]; // el pie: su punta (+Z) hacia la del otro
const NEON_PARENT = { hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', shL: 'chest', elL: 'shL', haL: 'elL', shR: 'chest', elR: 'shR', haR: 'elR', thL: 'hips', knL: 'thL', anL: 'knL', thR: 'hips', knR: 'thR', anR: 'knR' };
function bakeNeonClips(U) {
  const S = U.scene, get = n => S.getObjectByName(n), mx = new THREE.AnimationMixer(S), out = {};
  const pos = n => get(n).getWorldPosition(new V3()), wq = n => get(n).getWorldQuaternion(new Q4());
  S.updateMatrixWorld(true);
  const rest = {}; for (const [, b] of NEON_BODY) rest[b] = wq(b).invert();
  const pel0 = pos('pelvis'), k = NEO.hipY / pel0.y, down = new V3(0, -1, 0), fwdZ = new V3(0, 0, 1), d = new V3(), ax = new V3(), sw = new Q4();
  for (const clip of U.animations) {
    const act = mx.clipAction(clip); act.play();
    const n = Math.max(2, Math.ceil(clip.duration * 30) + 1), times = [], Q = {}, hp = [], prev = {};
    for (let f = 0; f < n; f++) {
      const t = Math.min(clip.duration, f / 30); act.time = t; mx.update(0); S.updateMatrixWorld(true); times.push(t);
      const W = {};
      for (const [nb, b] of NEON_BODY) W[nb] = wq(b).multiply(rest[b]); // giro respecto al reposo
      for (const [nb, a, b] of NEON_LIMB) { const pw = W[NEON_PARENT[nb]]; d.subVectors(pos(b), pos(a)).normalize(); ax.copy(down).applyQuaternion(pw); W[nb] = sw.setFromUnitVectors(ax, d).clone().multiply(pw); }
      for (const [nb, a, b] of NEON_FOOT) { const pw = W[NEON_PARENT[nb]]; d.subVectors(pos(b), pos(a)); d.y = Math.min(d.y, 0.3 * d.length()); d.normalize(); ax.copy(fwdZ).applyQuaternion(pw); W[nb] = sw.setFromUnitVectors(ax, d).clone().multiply(pw); }
      for (const nb in W) {
        const par = NEON_PARENT[nb], l = par ? W[par].clone().invert().multiply(W[nb]) : W[nb].clone();
        if (prev[nb] && prev[nb].dot(l) < 0) { l.x = -l.x; l.y = -l.y; l.z = -l.z; l.w = -l.w; } prev[nb] = l; // sin saltos de signo
        (Q[nb] = Q[nb] || []).push(l.x, l.y, l.z, l.w);
      }
      const pv = pos('pelvis').sub(pel0); hp.push(pv.x * k, NEO.hipY + pv.y * k, pv.z * k);
    }
    act.stop();
    const tracks = Object.keys(Q).map(nb => new THREE.QuaternionKeyframeTrack(nb + '.quaternion', times, Q[nb]));
    tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, hp));
    out[clip.name] = new THREE.AnimationClip(clip.name, clip.duration, tracks);
  }
  mx.stopAllAction(); return out;
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
