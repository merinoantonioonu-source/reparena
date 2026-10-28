
/* =================== MONSTRUOS DE ARCHIVO (glTF): Imp, Puglin y el zombi =================== */
// models/imp.glb y models/puglin.glb (Bestiary · Dungeon Monsters Kit, de Quaternius) traen el cuerpo y el esqueleto;
// models/anims.glb, las animaciones de la Universal Animation Library (Quaternius, CC0), hechas para ese mismo esqueleto.
// Las texturas, reducidas, están en models/tex (tres colores por monstruo). Se cargan al abrir la página y, mientras no
// estén (o si no se pueden cargar), en su lugar salen robots. El zombi (models/zombie.glb, Quaternius, CC0) trae sus propias
// animaciones (andar, correr, reposo y morder) y una paleta de colores (models/tex/zombie.png) en vez de texturas.
const BEAST = { ready: false, failed: false, loading: false, kinds: {} };
// h: altura del modelo (m); walk/jog/run: a qué velocidad (m/s, a escala 1) avanza cada animación de andar
// own: con sus propias animaciones (alias: nombre de la biblioteca → el suyo), a escala k; atk: la animación del ataque y
// cuándo empieza (s) y cuándo llega (s); bones: sus huesos del pecho, la cabeza y la mano derecha
const BEAST_DEF = { imp: { h: 1.68, walk: 1.25, jog: 2.9, run: 4.6 }, puglin: { h: 0.93, walk: 0.8, jog: 1.9, run: 3.0 },
  zombie: { h: 1.8, walk: 0.35, jog: 1.5, run: 2.4, maxTs: 2.6, own: true, k: 0.27, prefix: 'Zombie|Zombie',
    alias: { Idle_Loop: 'Idle', Walk_Loop: 'Walk', Jog_Fwd_Loop: 'Run', Sprint_Loop: 'Run', Bite: 'Bite', Dance_Loop: 'Idle' }, atk: ['Bite', 1.0, 2.5], taunt: 'Idle_Loop',
    bones: { chest: 'Spine2', head: 'Head', handR: 'RightHand' } },
  // dinosaurios (Dinosaur Animated Pack, Quaternius, CC0): con sus colores (sin textura) y sus animaciones; a una escala que
  // cabe por las compuertas (el velociraptor, 1,4 m). trim: la animación acaba antes de lo que dura el clip
  raptor: { h: 1.4, walk: 1.3, jog: 2.8, run: 4.3, minTs: 0.6, own: true, keepMats: true, k: 0.3, prefix: 'Armature|Velociraptor_', trim: { Walk: 1.21 },
    alias: { Idle_Loop: 'Idle', Walk_Loop: 'Walk', Jog_Fwd_Loop: 'Run', Sprint_Loop: 'Run', Attack: 'Attack', Death01: 'Death', Dance_Loop: 'Idle' }, atk: ['Attack', 0.21, 0.42], taunt: 'Idle_Loop',
    bones: { chest: 'Torso', head: 'Head', handR: 'Head' } } };
// Los que se cargan solo si se eligen (Ajustes → Enemigos), cada uno por su cuenta: los zombis verde y gordo (Ultimate
// Platformer Pack) y los monstruitos (Cute Animated Monsters), de Quaternius (CC0), con sus animaciones y su textura dentro
// del .glb (ownTex). file: el archivo en models/; k: su escala (para que mida h metros)
const ZOMBIE2 = { own: true, ownTex: true, lazy: true, walk: 0.6, jog: 1.6, run: 2.4, maxTs: 2.2, prefix: '', taunt: 'Dance_Loop', hit: 'Hit',
  alias: { Idle_Loop: 'Idle', Walk_Loop: 'Walk', Jog_Fwd_Loop: 'Run', Sprint_Loop: 'Run', Punch: 'Punch', Death01: 'Death', Hit: 'HitReact', Dance_Loop: 'Idle_Attack' }, atk: ['Punch', 0.25, 0.45],
  bones: { chest: 'Torso', head: 'Head', handR: 'LowerArmR' } }; // (el cargador quita los puntos de los nombres: LowerArm.R → LowerArmR)
Object.assign(BEAST_DEF, { zgreen: { ...ZOMBIE2, file: 'zombie_basic', h: 1.36, k: 1 }, zchubby: { ...ZOMBIE2, file: 'zombie_chubby', h: 1.64, k: 1 } });
// Los piratas (Pirate Kit, de Quaternius, CC0): el esqueleto, el capitán Barbarroja (con su loro) y los tiburones Sharky y
// Mako, con su arma en la mano; dan un tajo a media altura (zone: por dónde llega, para pararlo con la espada)
const PIRATE = { ...ZOMBIE2, walk: 0.7, jog: 1.7, run: 2.6, taunt: 'Dance_Loop', alias: { Idle_Loop: 'Idle', Walk_Loop: 'Walk', Jog_Fwd_Loop: 'Run', Sprint_Loop: 'Run', Sword: 'Sword', Death01: 'Death', Hit: 'HitReact', Dance_Loop: 'Wave' },
  atk: ['Sword', 0.15, 0.32], zone: ['mid', 1] };
Object.assign(BEAST_DEF, { skeleton: { ...PIRATE, file: 'piratas/esqueleto', h: 1.5, k: 1 }, captain: { ...PIRATE, file: 'piratas/capitan', h: 1.85, k: 1, zone: ['mid', -1] },
  sharky: { ...PIRATE, file: 'piratas/sharky', h: 1.56, k: 1 }, mako: { ...PIRATE, file: 'piratas/mako', h: 1.59, k: 1 } });
// Los monstruitos andan dando saltitos (sus animaciones son en el sitio: más deprisa cuanto más corren) y muerden lanzándose
const CUTE = { own: true, ownTex: true, lazy: true, walk: 0.7, jog: 1.4, run: 2.2, minTs: 0.7, maxTs: 2.4, prefix: '', taunt: 'Dance_Loop', hit: 'Hit',
  alias: { Idle_Loop: 'Idle', Walk_Loop: 'Walk', Jog_Fwd_Loop: 'Walk', Sprint_Loop: 'Walk', Bite: 'Bite_Front', Death01: 'Death', Hit: 'HitRecieve', Dance_Loop: 'Jump', Fly: 'Flying' }, atk: ['Bite', 0.12, 0.28],
  bones: { chest: 'Body', head: 'Head', handR: 'Head' }, ctr: 0.5 }; // (su hueso Body está a ras de suelo: el centro, a media altura)
// [archivo, alto del modelo, metros que mide al andar]; los de las trampillas y los voladores, a su tamaño en su clase
[['demon', 1.62, 1.15], ['greendemon', 1.62, 1.15], ['cyclops', 1.67, 1.25], ['yeti', 1.67, 1.3], ['skull', 1.55, 1.0], ['alien', 2.06, 1.2], ['alientall', 2.11, 1.35],
  ['crab', 1.57, 0.18], ['mushroom', 2.07, 0.2], ['bee', 1.9, 0.5], ['bat', 1.75, 0.45], ['cthulhu', 1.56, 0.55], ['dragon', 1.65, 0.5]].forEach(([k, nat, h]) => {
  BEAST_DEF[k] = { ...CUTE, file: 'monstruitos/' + ({ alientall: 'alien_tall', dragon: 'yellowdragon' }[k] || k), h, k: h / nat };
});
const BEAST_CLIPS = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Punch_Cross', 'Punch_Jab', 'Sword_Attack', 'Hit_Chest', 'Hit_Head', 'Death01', 'Dance_Loop', 'Spell_Simple_Shoot', 'Roll', 'Sword_Idle',
  // de la Universal Animation Library 2 (mismo esqueleto): derribado y levantarse, gancho, tres tajos y lanzar
  'Hit_Knockback', 'LayToIdle', 'Melee_Hook', 'Sword_Regular_A', 'Sword_Regular_B', 'Sword_Regular_C', 'OverhandThrow'];
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
// Si las animaciones de Quaternius están cargadas (se ve en Ajustes → Cada enemigo)
function animStatus() {
  if (BEAST.ready) return `Animaciones de Quaternius: cargadas ✓ (${Object.keys(BEAST.rigClips || {}).length ? 'robots, ' : ''}Imp, Puglin, zombi y velociraptor)`;
  if (BEAST.failed) return 'Animaciones de Quaternius: no se han podido cargar (se mueven con su animación hecha a mano)';
  return 'Animaciones de Quaternius: cargando…';
}
function animNote() { const n = typeof document !== 'undefined' && document.getElementById && document.getElementById('animNote'); if (n) n.textContent = animStatus(); }
function loadBeasts() {
  if (BEAST.loading || BEAST.ready) return;
  if (!THREE.GLTFLoader || !THREE.SkeletonUtils || typeof document === 'undefined') { BEAST.failed = true; return; }
  BEAST.loading = true;
  const L = new THREE.GLTFLoader(), T = new THREE.TextureLoader();
  const get = f => new Promise((res, rej) => L.load(`models/${f}.glb`, res, undefined, rej));
  const tex = (f, srgb) => { const t = T.load(`models/tex/${f}.jpg`); t.flipY = false; if (srgb) t.encoding = THREE.sRGBEncoding; return t; };
  const core = Object.keys(BEAST_DEF).filter(k => !BEAST_DEF[k].lazy);
  Promise.all([get('anims'), ...core.map(get)]).then(([U, ...models]) => {
    const up = U.scene.getObjectByName('pelvis').position.z;
    core.forEach((k, i) => {
      const D = BEAST_DEF[k];
      if (D.own) { // sus propias animaciones, con los nombres de la biblioteca; sus colores, de una paleta pequeña (sin suavizar)
        const clips = ownClips(D, models[i].animations);
        let map = null; if (!D.keepMats) { map = T.load(`models/tex/${k}.png`); map.flipY = false; map.encoding = THREE.sRGBEncoding; map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestFilter; map.generateMipmaps = false; }
        BEAST.kinds[k] = { scene: models[i].scene, clips, map }; return;
      }
      const scene = models[i].scene, mp = scene.getObjectByName('pelvis').position.z, clips = {}, has = new Set();
      scene.traverse(o => has.add(o.name));
      for (const n of BEAST_CLIPS) { const c = U.animations.find(a => a.name === n); if (c) clips[n] = beastRetarget(c, up, mp, has); }
      const orm = tex(k + '_orm');
      BEAST.kinds[k] = { scene, clips, maps: [1, 2, 3].map(v => tex(`${k}_color${v}`, true)), normal: tex(k + '_normal'), orm, emissive: tex(k + '_emissive', true) };
    });
    BEAST.rigClips = {};
    for (const r in RIG_MAPS) try { BEAST.rigClips[r] = bakeRigClips(U, RIG_MAPS[r]); } catch (e) { console.log('Animaciones de ' + r + ':', e && e.message); }
    BEAST.ready = true; animNote(); foesPreload();
  }).catch(e => { BEAST.failed = true; animNote(); console.log('No se pudieron cargar los monstruos:', e && e.message); });
}
// Sus propias animaciones, con los nombres de la biblioteca (alias)
function ownClips(D, anims) {
  const clips = {}; for (const a in D.alias) { let c = anims.find(x => x.name === D.prefix + D.alias[a]); if (!c) continue; if (D.trim && D.trim[D.alias[a]]) { c = c.clone(); c.duration = D.trim[D.alias[a]]; } clips[a] = c; }
  return clips;
}
// Un monstruo de los que se cargan al elegirlos: cada uno por su cuenta (si uno falla, los demás siguen; en su lugar salen
// robots, arañas o drones)
const BEAST_LOAD = {};
function beastLoad(k) {
  const D = BEAST_DEF[k]; if (!D || !D.lazy || BEAST.kinds[k] || BEAST_LOAD[k]) return;
  if (!THREE.GLTFLoader || !THREE.SkeletonUtils || typeof document === 'undefined') { BEAST_LOAD[k] = 'failed'; return; }
  BEAST_LOAD[k] = 'loading';
  new THREE.GLTFLoader().load(`models/${D.file}.glb`, g => {
    let map = null; g.scene.traverse(m => { if (m.isMesh && !map && m.material && m.material.map) map = m.material.map; });
    BEAST.kinds[k] = { scene: g.scene, clips: ownClips(D, g.animations), map }; BEAST_LOAD[k] = 'ready';
  }, undefined, e => { BEAST_LOAD[k] = 'failed'; console.log('No se pudo cargar ' + k + ':', e && e.message); });
}
const beastReady = k => !!BEAST.kinds[k] && (BEAST_DEF[k].lazy || BEAST.ready);
// Los elegidos en Ajustes → Enemigos, que se vayan cargando ya
const FOE_BEAST = { hcrab: 'crab', hmushroom: 'mushroom', hskull: 'skull', crab: 'crab', mushroom: 'mushroom' };
function foesPreload() {
  const ks = new Set([...foeList('foesGate'), ...foeList('foesHatch'), ...foeList('foesFly')].map(k => FOE_BEAST[k] || k));
  ks.forEach(k => { if (BEAST_DEF[k] && BEAST_DEF[k].lazy) beastLoad(k); });
}
settingHooks.push(k => { if (['foesGate', 'foesHatch', 'foesFly', '*'].includes(k)) foesPreload(); });
/* ---------- Las mismas animaciones, en los robots ---------- */
// Sus esqueletos son otros (huesos sin giro de reposo, que apuntan hacia abajo), así que no se copian las rotaciones: se
// reproduce cada animación en el esqueleto de la biblioteca y, fotograma a fotograma, cada brazo y cada pierna del
// humanoide se orienta hacia donde apunta el suyo; el tronco, el cuello y la cabeza giran lo mismo que respecto a su
// reposo, y la cadera sube y baja a su escala. Las dos figuras miran hacia +Z con la izquierda en +X.
// Mapas: body, [hueso del rig, de la biblioteca]; limb, [rig, desde, hasta] (el hueso apunta de uno a otro); foot, igual
// pero con la punta (+Z) hacia delante; parent, el padre de cada hueso del rig (null: el giro es respecto al rig entero)
const UAL_BODY = [['hips', 'pelvis'], ['spine', 'spine_01'], ['chest', 'spine_03'], ['neck', 'neck_01'], ['head', 'Head']];
const UAL_LIMB = [['shL', 'upperarm_l', 'lowerarm_l'], ['elL', 'lowerarm_l', 'hand_l'], ['haL', 'hand_l', 'middle_01_l'], ['shR', 'upperarm_r', 'lowerarm_r'], ['elR', 'lowerarm_r', 'hand_r'], ['haR', 'hand_r', 'middle_01_r'],
  ['thL', 'thigh_l', 'calf_l'], ['knL', 'calf_l', 'foot_l'], ['thR', 'thigh_r', 'calf_r'], ['knR', 'calf_r', 'foot_r']];
const UAL_FOOT = [['anL', 'foot_l', 'ball_l'], ['anR', 'foot_r', 'ball_r']];
const UAL_PARENT = { hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', shL: 'chest', elL: 'shL', haL: 'elL', shR: 'chest', elR: 'shR', haR: 'elR', thL: 'hips', knL: 'thL', anL: 'knL', thR: 'hips', knR: 'thR', anR: 'knR' };
const RIG_MAPS = {
  // el robot pequeño: solo de cintura para arriba (sus piernas, de ave, siguen con su animación y la cadera es suya)
  ripper: { body: UAL_BODY.slice(1), limb: UAL_LIMB.slice(0, 6), foot: [], parent: { ...UAL_PARENT, spine: null } },
  // el grande y el coloso: entero menos el brazo del cañón, que sigue apuntándote; no tienen cuello
  destroyer: { body: [['hips', 'pelvis'], ['spine', 'spine_01'], ['chest', 'spine_03'], ['head', 'Head']], limb: [['shL', 'upperarm_l', 'lowerarm_l'], ['elL', 'lowerarm_l', 'hand_l'], ['clawL', 'hand_l', 'middle_01_l'], ...UAL_LIMB.slice(6)],
    foot: UAL_FOOT, parent: { ...UAL_PARENT, head: 'chest', clawL: 'elL' }, hip0: () => 1.06, leg: 0.92 }
};
function bakeRigClips(U, M) {
  const S = U.scene, get = n => S.getObjectByName(n), mx = new THREE.AnimationMixer(S), out = {};
  const pos = n => get(n).getWorldPosition(new V3()), wq = n => get(n).getWorldQuaternion(new Q4());
  S.updateMatrixWorld(true);
  const rest = {}; for (const [, b] of M.body) rest[b] = wq(b).invert();
  const pel0 = pos('pelvis'), hip0 = M.hip0 && M.hip0(), k = M.leg ? M.leg / (pos('thigh_l').distanceTo(pos('calf_l')) + pos('calf_l').distanceTo(pos('foot_l'))) : hip0 / pel0.y;
  const down = new V3(0, -1, 0), fwdZ = new V3(0, 0, 1), d = new V3(), ax = new V3(), sw = new Q4(), I = new Q4();
  for (const clip of U.animations) {
    const act = mx.clipAction(clip); act.play();
    const n = Math.max(2, Math.ceil(clip.duration * 30) + 1), times = [], Q = {}, hp = [];
    for (let f = 0; f < n; f++) {
      const t = Math.min(clip.duration, f / 30); act.time = t; mx.update(0); S.updateMatrixWorld(true); times.push(t);
      const W = {}, par = nb => M.parent[nb] ? W[M.parent[nb]] : I;
      for (const [nb, b] of M.body) W[nb] = wq(b).multiply(rest[b]); // giro respecto al reposo
      for (const [nb, a, b] of M.limb) { const pw = par(nb); d.subVectors(pos(b), pos(a)).normalize(); ax.copy(down).applyQuaternion(pw); W[nb] = sw.setFromUnitVectors(ax, d).clone().multiply(pw); }
      for (const [nb, a, b] of M.foot) { const pw = par(nb); d.subVectors(pos(b), pos(a)); d.y = Math.min(d.y, 0.3 * d.length()); d.normalize(); ax.copy(fwdZ).applyQuaternion(pw); W[nb] = sw.setFromUnitVectors(ax, d).clone().multiply(pw); }
      for (const nb in W) {
        const l = par(nb).clone().invert().multiply(W[nb]);
        if (l.w < 0) { l.x = -l.x; l.y = -l.y; l.z = -l.z; l.w = -l.w; } // siempre con w ≥ 0: las mezclas entre animaciones no se tuercen (la interpolación ya va por el camino corto)
        (Q[nb] = Q[nb] || []).push(l.x, l.y, l.z, l.w);
      }
      if (hip0) { const pv = pos('pelvis').sub(pel0); hp.push(pv.x * k, hip0 + pv.y * k, pv.z * k); }
    }
    act.stop();
    const tracks = Object.keys(Q).map(nb => new THREE.QuaternionKeyframeTrack(nb + '.quaternion', times, Q[nb]));
    if (hip0) tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, hp));
    out[clip.name] = new THREE.AnimationClip(clip.name, clip.duration, tracks);
  }
  mx.stopAllAction(); return out;
}
// Cada copia de un modelo animado lleva sus esqueletos y cada esqueleto, su textura de huesos en la tarjeta gráfica: al
// retirar al enemigo se liberan (si no, se acumulaban unas siete por ronda)
const skelFree = model => ({ dispose() { const s = new Set(); model.traverse(m => { if (m.isSkinnedMesh && m.skeleton) s.add(m.skeleton); }); s.forEach(k => k.dispose && k.dispose()); } });
// Hace de «rig» para el constructor de los robots: cada ejemplar es una copia del modelo con su propio esqueleto y material
function beastRig(kind) {
  return { kind: 'beast', instance() {
    const B = BEAST.kinds[kind], D = BEAST_DEF[kind], model = THREE.SkeletonUtils.clone(B.scene), v = Math.floor(Math.random() * 3);
    let mat;
    if (D.keepMats) { // sus propios colores, uno por pieza: copias para poder teñirlas de rojo al recibir
      const mats = [], base = [];
      model.traverse(m => { if (!m.isMesh) return; const one = x => { const c = new THREE.MeshStandardMaterial({ color: x.color, roughness: 0.8, metalness: 0, skinning: true, flatShading: true }); mats.push(c); base.push(x.color.clone()); return c; }; m.material = Array.isArray(m.material) ? m.material.map(one) : one(m.material); m.castShadow = true; m.frustumCulled = false; });
      const tc = new THREE.Color(); mat = { color: { setRGB: (r, g, b) => mats.forEach((m, i) => m.color.copy(base[i]).multiply(tc.setRGB(r, g, b))) }, emissiveIntensity: 1, dispose: () => mats.forEach(m => m.dispose()) };
    } else {
      mat = D.own ? new THREE.MeshStandardMaterial({ map: B.map, emissive: 0x000000, roughness: 0.85, metalness: 0, skinning: true, side: D.ownTex ? THREE.DoubleSide : THREE.FrontSide })
        : new THREE.MeshStandardMaterial({ map: B.maps[v], normalMap: B.normal, roughnessMap: B.orm, metalnessMap: B.orm, emissiveMap: B.emissive, emissive: 0xffffff, emissiveIntensity: 1, roughness: 1, metalness: 1, skinning: true });
      const still = mat.clone(); still.skinning = false; still.userData.keepMap = true; mat.still = still; // las armas no tienen piel: van pegadas a un hueso de la mano
      model.traverse(m => { if (m.isMesh) { m.material = m.isSkinnedMesh || !D.own ? mat : still; m.castShadow = true; m.frustumCulled = false; if (kind === 'imp') m.userData.noFaceInk = true; } }); // (el diablillo y el lanzador: la cara, sin tinta de cómic)
    }
    const root = new THREE.Group(); root.add(model);
    if (D.own) model.scale.setScalar(D.k); // el zombi y los dinosaurios ya miran hacia +Z
    else model.rotation.y = Math.PI; // con las animaciones de la biblioteca, el modelo mira hacia −Z: se gira para que mire hacia donde va
    const bn = D.bones || { chest: 'spine_03', head: 'Head', handR: 'hand_r' }, bones = { chest: model.getObjectByName(bn.chest), head: model.getObjectByName(bn.head), handR: model.getObjectByName(bn.handR) };
    return { root, model, mat, bones, meshes: {}, list: [], skel: skelFree(model), variant: v };
  } };
}
loadBeasts();
