/* =================== PARA QUE NO ABURRA: MEJORAS, RÉCORD, SORPRESAS Y MÚSICA =================== */
// Cuatro cosas que cambian cada ronda sin pedir menos ejercicio (ninguna da más cargas ni más daño: las oleadas siguen
// necesitando las mismas repeticiones):
// - Mejoras entre oleadas (Combate): en el descanso eliges 1 de 3 cartas, que duran el resto de la ronda.
// - Carrera contra tu récord: tus repeticiones de ahora frente a las de tu mejor ronda de ese ejercicio en el mismo momento.
// - Sorpresas (Combate): de vez en cuando, un enemigo dorado (×3 puntos), un relámpago (20 s de llegadas seguidas y puntos
//   ×2) o, en el descanso, un cofre que se abre saltando.
// - La música manda (Combate con ritmo): el relámpago empieza en una frase de la canción (cada 32 pulsos), con cuenta atrás
//   al compás; una canción nueva trae uno, y la luz de la compuerta late con el pulso.

const PERKS = {
  shield: { name: 'Escudo', col: '#5ab8ff', desc: 'Para el primer golpe de cada oleada' },
  frost: { name: 'Escarcha', col: '#9fe8ff', desc: 'Cada perfecta deja más lentos 3 s a los que están cerca del impacto' },
  wave: { name: 'Onda', col: '#a68bff', desc: 'Cada perfecta empuja hacia atrás a los que están cerca del impacto' },
  life: { name: 'Corazón', col: '#ff4fa3', desc: 'Cada 10 perfectas recuperas una vida (si te falta alguna)', ok: () => nLives() > 0 },
  gold: { name: 'Doble o nada', col: '#ffd166', desc: 'Las perfectas valen el doble de puntos' },
  combo: { name: 'Combo de hierro', col: '#ff8a3d', desc: 'El primer golpe de cada oleada no te rompe el combo' },
  calm: { name: 'Calma', col: '#7ee081', desc: 'Los enemigos se mueven un 15 % más despacio' }
};
const PK = { has: new Set(), offer: null, offerT: -1, shield: 0, comboSave: 0, perfN: 0 };
const perksOn = () => !!settings.perks && isCombat();
const surpriseOn = () => !!settings.surprises && isCombat();
const perkHas = k => PK.has.has(k);

/* ---------- Mejoras entre oleadas ---------- */
// Al superar una oleada (con descanso por delante), las cartas salen a los pocos segundos (después del «¡Oleada superada!»)
function perkWaveCleared() {
  if (perksOn() && !SES.active && perkPool().length) PK.offerT = 1.2;
  chestMaybe();
}
const perkPool = () => Object.keys(PERKS).filter(k => !PK.has.has(k) && (!PERKS[k].ok || PERKS[k].ok()));
function perkMenu() {
  if (!PK.offer) return;
  const rows = [{ t: 'title', text: 'ELIGE UNA MEJORA', color: '#ffd166' }, { t: 'text', text: 'Dura lo que queda de ronda. La oleada siguiente espera a que elijas', color: '#a49fc8' }];
  for (const k of PK.offer) rows.push({ t: 'btns', items: [{ label: PERKS[k].name, accent: PERKS[k].col, onPress: () => perkTake(k) }], h: 0.075 }, { t: 'text', text: PERKS[k].desc });
  const m = openMenu(rows, { accent: '#ffd166' }); m.perks = true; m.rebuild = perkMenu;
}
function perkTake(k, random) {
  PK.has.add(k); PK.offer = null; if (menu && menu.perks) hideMenu();
  if (state === 'rest' && !random) stateT = Math.min(stateT, Math.max(0, settings.rest - 3)); // (elegida tarde: 3 s para prepararte)
  if (k === 'shield') PK.shield = 1; if (k === 'combo') PK.comboSave = 1;
  cheer(`${random ? 'Te toca' : 'Mejora'}: ${PERKS[k].name}`, PERKS[k].col, 1.8); SND.combo(); boardDirty = true;
}
// Con cartas por elegir, la oleada siguiente no empieza (no hay que elegir con prisas)
const perkWaits = () => state === 'rest' && perksOn() && (!!PK.offer || PK.offerT > 0);
// Se acaba el descanso (o se corta): la que no elegiste, al azar; el cofre se va
function perkRestEnd() {
  PK.offerT = -1;
  if (PK.offer) perkTake(pick(PK.offer), true);
  if (menu && menu.perks) hideMenu();
  chestClear();
}
// En cada oleada nueva vuelven el escudo y el combo de hierro, y se decide si habrá relámpago
function perkWaveStart(i) {
  if (perkHas('shield')) PK.shield = 1; if (perkHas('combo')) PK.comboSave = 1;
  GOLD.n = 0; rushPlan(i);
}
const perkPtsK = perfect => (perfect && perkHas('gold') ? 2 : 1) * (RUSH.on ? 2 : 1);
function perkOnRep(perfect) {
  if (!perfect || !perkHas('life') || !nLives()) return;
  if (++PK.perfN % 10 === 0 && lives < nLives()) { lives++; cheer('+1 VIDA', '#ff4fa3', 1.4); SND.combo(); boardDirty = true; }
}
// El golpe que para el escudo (después de la guardia, que es cosa tuya)
function perkAbsorb() {
  if (PK.shield <= 0) return false;
  PK.shield--; cheer('¡ESCUDO!', '#5ab8ff', 1.1); SND.zap(head.p); hapticBoth(0.5, 80);
  fx.glow(head.p.clone().addScaledVector(fwd(), 0.4), [0.35, 0.7, 1], 0.6, 0.25); return true;
}
const perkKeepCombo = () => { if (PK.comboSave > 0 && combo >= 3) { PK.comboSave--; cheer('Combo a salvo', '#ff8a3d', 1); return true; } return false; };
// Al llegar un disparo perfecto: escarcha y onda alrededor del impacto
function perkOnHit(target, p) {
  if (!p.perfect || !(perkHas('frost') || perkHas('wave'))) return;
  const R = isTiny() ? 0.5 : 2.2;
  for (const o of enemies) if (o.alive && o.center(tmpA).distanceTo(p.to) < R) {
    if (perkHas('frost')) { o.frostT = 3; fx.sparks(tmpA, 8, [0.6, 0.9, 1], 1.2, 0.03); }
    if (perkHas('wave') && o !== target && o.shove) o.shove(isTiny() ? 0.08 : 0.3);
  }
  if (perkHas('wave')) fx.glow(p.to, [0.65, 0.55, 1], isTiny() ? 0.4 : 1.4, 0.2);
}
// Lo que se frena un enemigo: escarcha y calma (el reloj de su paso, sus animaciones y sus ataques)
const perkSlow = e => (e.frostT > 0 ? 0.45 : 1) * (perkHas('calm') ? 0.85 : 1);
function perkRows() { return PK.has.size ? [{ t: 'text', text: 'Mejoras: ' + [...PK.has].map(k => PERKS[k].name).join(' · '), color: '#ffd166' }] : []; }

/* ---------- Carrera contra tu récord ---------- */
// Se guarda la mejor ronda de cada modo y ejercicio con sus repeticiones cada 2 s (en colgado, los segundos); los Arcos
// tienen la suya, por puntos y metros (71_arcs)
const GHOST_KEY = 'reparena3-ghosts';
const GH = { key: '', best: null, tl: [], tT: 0, beat: false };
const ghostOn = () => !!settings.ghost && settings.mode !== 'arcs' && !SES.active;
const ghostNow = () => settings.exercise === 'hang' ? Math.floor(stats.hold) : stats.reps;
function ghostReset() {
  Object.assign(GH, { key: `${settings.mode}:${settings.exercise}`, best: null, tl: [], tT: 0, beat: false });
  if (!ghostOn()) return;
  const all = store(GHOST_KEY) || {}; GH.best = all[GH.key] || null;
  if (!GH.best) { // sin carrera guardada, al menos tu mejor ronda del historial
    const n = (store(HIST_KEY) || []).filter(r => r.ex === settings.exercise && r.mode === settings.mode).reduce((a, r) => Math.max(a, r.reps || 0), 0);
    if (n) GH.best = { n, tl: null };
  }
}
function ghostStep(dt) {
  if (!ghostOn() || !['play', 'rest'].includes(state)) return;
  GH.tT += dt; if (GH.tT >= 2) { GH.tT -= 2; GH.tl.push(ghostNow()); if (GH.tl.length % 2 === 0) boardDirty = true; }
  const B = GH.best, n = ghostNow();
  if (B && B.n > 0 && !GH.beat && n > B.n) { GH.beat = true; cheer('¡NUEVO RÉCORD!', '#ffd166', 2.2); SND.combo(); hapticBoth(0.6, 120); fx.sparks(head.p.clone().addScaledVector(fwd(), 1.2), 40, [1, 0.82, 0.3], 3, 0.05); boardDirty = true; }
}
// Para el marcador: dónde ibas en tu mejor ronda en este momento (g), lo que llevas ahora (n) y tu récord (best)
function ghostAt() {
  const B = GH.best; if (!ghostOn() || !B || !B.n || !B.tl || !B.tl.length) return null;
  return { g: B.tl[Math.min(B.tl.length - 1, GH.tl.length)] || 0, n: ghostNow(), best: B.n, beat: GH.beat };
}
// Cuántas llevas de más (o de menos) que tu récord en este momento
function ghostText() {
  const B = GH.best; if (!ghostOn() || !B || !B.n) return null; const n = ghostNow();
  if (GH.beat) return [`¡RÉCORD! +${n - B.n}`, '#ffd166'];
  if (!B.tl || !B.tl.length) return [`RÉCORD ${B.n} · FALTAN ${B.n - n + 1}`, '#a49fc8']; // (para superarlo, una más)
  const g = B.tl[Math.min(B.tl.length - 1, GH.tl.length)] || 0, d = n - g;
  return [`RÉCORD ${d >= 0 ? '+' : '−'}${Math.abs(d)}`, d >= 0 ? '#3cf0c6' : '#ff8a3d'];
}
function ghostEnd() {
  if (!ghostOn()) return; const n = ghostNow(), B = GH.best;
  if (n > 0 && (!B || n > B.n)) { const all = store(GHOST_KEY) || {}; all[GH.key] = { n, tl: GH.tl.concat(n).slice(0, 900) }; store(GHOST_KEY, all); }
}

/* ---------- Sorpresas: el enemigo dorado ---------- */
const GOLD = { n: 0, list: [] };
function perkSpawned(e) {
  if (!surpriseOn() || GOLD.n || e.boss || (e.K && e.K.boss) || Math.random() > 0.08) return;
  GOLD.n++; e.golden = true;
  // un halo dorado que se ve también por delante del cuerpo (y a pleno día)
  const s = glowSprite(0xffc23a, isTiny() ? 0.45 : 1.7, 0.55); s.material.depthTest = false; s.renderOrder = 5; scene.add(s); GOLD.list.push({ e, s });
}
const perkKillK = e => (e.golden ? 3 : 1) * (RUSH.on ? 2 : 1);
function perkOnKill(e) {
  if (!e.golden) return; const c = e.center(new V3());
  cheer('¡DORADO! ×3', '#ffd166', 1.6); SND.combo(); fx.sparks(c, 50, [1, 0.82, 0.3], 3.5, 0.05); fx.glow(c, [1, 0.8, 0.3], isTiny() ? 0.5 : 2, 0.3);
}
function goldStep(dt, t) {
  for (const g of GOLD.list) {
    if (g.e.alive) { g.e.center(g.s.position); const k = (isTiny() ? 0.45 : 1.7) * (1 + 0.15 * Math.sin(t * 6)); g.s.scale.set(k, k, 1); if (Math.random() < dt * 18) fx.sparks(g.s.position, 2, [1, 0.85, 0.35], 1.2, isTiny() ? 0.02 : 0.045); }
    else { scene.remove(g.s); g.s.material.dispose(); g.gone = true; }
  }
  GOLD.list = GOLD.list.filter(g => !g.gone);
}

/* ---------- Sorpresas: el relámpago (y la música que manda) ---------- */
// 20 s (o una frase de la canción, 32 pulsos) en los que llegan seguidos (el doble de deprisa, hasta el máximo a la vez) y
// todo vale el doble. Desde la segunda oleada, en una de cada tres más o menos, nunca con el jefe
const RUSH = { on: false, left: 0, dur: 0, planT: -1, at: -1, end: -1, cd: 0, song: null };
const musicLead = () => !!settings.musicLead && beatP() > 0;
function rushPlan(i) {
  RUSH.planT = -1; RUSH.at = -1;
  if (surpriseOn() && i >= 1 && !isBossWave(i) && Math.random() < 0.35) RUSH.planT = rand(4, 10);
}
const perkSpawnK = () => RUSH.on ? 2 : 1;
function rushStart(sec) {
  RUSH.on = true; RUSH.left = RUSH.dur = sec; RUSH.at = -1; cheer('¡RELÁMPAGO! Puntos ×2', '#ffd166', 1.8); SND.horn(); ENV.flash = 1; boardDirty = true;
}
function rushStop(quiet) { if (RUSH.on && !quiet) cheer('Fin del relámpago', '#a49fc8', 1.1); RUSH.on = false; RUSH.left = 0; RUSH.end = -1; RUSH.at = -1; boardDirty = true; }
function rushStep(dt) {
  if (state !== 'play') { if (RUSH.on || RUSH.at >= 0) rushStop(true); return; }
  // una canción nueva de Spotify trae relámpago en su primera frase
  const id = spConnected() && SP.st && SP.st.item ? SP.st.item.id : null;
  if (id && RUSH.song && id !== RUSH.song && musicLead() && surpriseOn() && !RUSH.on && RUSH.at < 0 && !isBossWave(waveIdx)) { RUSH.planT = 0.01; cheer('¡Canción nueva!', '#a68bff', 1.4); }
  if (id) RUSH.song = id;
  if (RUSH.planT > 0 && !RUSH.on) {
    RUSH.planT -= dt;
    if (RUSH.planT <= 0) { RUSH.planT = -1; if (musicLead()) { RUSH.at = Math.ceil((beatNow() + 4) / 32) * 32; RUSH.cd = 0; } else rushStart(20); } // con ritmo, en la próxima frase (al menos 4 pulsos)
  }
  if (RUSH.at >= 0 && !RUSH.on) { // cuenta atrás al compás: 3, 2, 1 en los tres pulsos de antes
    const b = beatNow(), left = Math.ceil(RUSH.at - b);
    if (left <= 3 && left >= 1 && left !== RUSH.cd) { RUSH.cd = left; say(String(left), '#ffd166', 0.5, false); SND.tick(); }
    if (b >= RUSH.at) { RUSH.end = RUSH.at + 32; rushStart((RUSH.end - b) * beatP()); }
  }
  if (RUSH.on) { RUSH.left -= dt; if (((RUSH.left * 4) | 0) !== (((RUSH.left + dt) * 4) | 0)) boardDirty = true; /* (la mecha del marcador, 4 veces por segundo) */ if (RUSH.left <= 0) rushStop(); }
}
// La luz de la compuerta late con el pulso de la música (más fuerte en el relámpago)
const BEATL = { k: 0 };
function beatLightStep(dt) {
  if (state === 'play' && musicLead() && BEAT.hit) BEATL.k = RUSH.on ? 1 : 0.55;
  else if (RUSH.on && !musicLead() && Math.random() < dt * 2) BEATL.k = 0.8; // sin ritmo, el relámpago parpadea
  BEATL.k = Math.max(0, BEATL.k - dt * 5); ENV.beat = BEATL.k;
}

/* ---------- Sorpresas: el cofre que se abre saltando ---------- */
// En algunos descansos (de pie, en Combate) sale un cofre en el suelo, delante y a un lado: un salto lo abre y da una
// mejora más (si quedan), una vida o puntos
const CHEST = (() => {
  const g = new THREE.Group(), k = new Kit(), wood = col(0.11, 0.05, 0.02), band = col(0.85, 0.5, 0.06); // (colores lineales: se ven bastante más claros)
  k.add('m', G.box(0.5, 0.26, 0.34), wood, 0, 0.13, 0);
  for (const x of [-0.17, 0.17]) k.add('m', G.box(0.04, 0.27, 0.35), band, x, 0.135, 0);
  g.add(k.build({ m: std({ vertexColors: true, roughness: 0.6, metalness: 0.3 }) }, { cast: true }));
  const lid = new THREE.Group(); lid.position.set(0, 0.26, -0.17); g.add(lid);
  const kl = new Kit(); kl.add('m', G.box(0.5, 0.1, 0.34), wood, 0, 0.05, 0.17); kl.add('m', G.box(0.08, 0.08, 0.03), band, 0, 0.0, 0.345);
  for (const x of [-0.17, 0.17]) kl.add('m', G.box(0.04, 0.11, 0.35), band, x, 0.05, 0.17);
  lid.add(kl.build({ m: std({ vertexColors: true, roughness: 0.6, metalness: 0.3 }) }, { cast: true }));
  const glow = glowSprite(0xffd166, 0.9, 0.5); glow.position.y = 0.3; g.add(glow);
  g.visible = false; arena.add(g);
  return { g, lid, glow, on: false, open: 0, opened: false, t: 0, vy: 0, lastY: 0 };
})();
const chestWaits = () => CHEST.on && !CHEST.opened && state === 'rest';
const chestCan = () => surpriseOn() && !isFloor() && !isSeated() && !isSupine() && !isBars() && settings.exercise !== 'inchworm';
function chestMaybe() {
  if (!chestCan() || Math.random() > 0.35) return;
  Object.assign(CHEST, { on: true, open: 0, opened: false, t: 0, vy: 0, lastY: head.p.y });
  CHEST.g.position.set(0.7, 0, -1.3); CHEST.g.rotation.y = -0.5; CHEST.g.scale.setScalar(0.01); CHEST.lid.rotation.x = 0; CHEST.g.visible = true;
}
function chestClear() { CHEST.on = false; CHEST.g.visible = false; }
function chestStep(dt, t) {
  if (!CHEST.on) return;
  if (state !== 'rest') { chestClear(); return; }
  CHEST.t += dt; CHEST.g.scale.setScalar(Math.min(1, CHEST.t * 3));
  if (CHEST.t >= 2.6 && CHEST.t - dt < 2.6 && !CHEST.opened) say('¡Un cofre! Salta para abrirlo', '#ffd166', 3); // (después de la mejora)
  CHEST.glow.material.opacity = CHEST.opened ? Math.max(0, 0.9 - CHEST.open) : 0.35 + 0.2 * Math.sin(t * 5);
  // un salto: la cabeza sube deprisa por encima de tu altura de pie
  const vy = dt > 0 ? (head.p.y - CHEST.lastY) / dt : 0; CHEST.vy += (vy - CHEST.vy) * Math.min(1, dt * 20); CHEST.lastY = head.p.y;
  if (!CHEST.opened && CHEST.t > 1 && CHEST.vy > 0.6 && head.p.y > standHeadY() + 0.06) chestOpen();
  if (CHEST.opened) { CHEST.open = Math.min(1, CHEST.open + dt * 2.5); CHEST.lid.rotation.x = -1.9 * (1 - Math.pow(1 - CHEST.open, 3)); }
}
function chestOpen() {
  CHEST.opened = true; const c = CHEST.g.getWorldPosition(new V3()).add(new V3(0, 0.35, 0));
  fx.sparks(c, 60, [1, 0.82, 0.3], 3, 0.05); fx.glow(c, [1, 0.85, 0.4], 1.2, 0.3); SND.victory(); hapticBoth(0.6, 150);
  const pool = perksOn() ? perkPool().filter(k => !(PK.offer || []).includes(k)) : [];
  if (pool.length) { const k = pick(pool); PK.has.add(k); if (k === 'shield') PK.shield = 1; if (k === 'combo') PK.comboSave = 1; cheer(`¡Cofre! Mejora extra: ${PERKS[k].name}`, PERKS[k].col, 2.4); }
  else if (nLives() && lives < nLives()) { lives++; cheer('¡Cofre! +1 vida', '#ff4fa3', 2.2); }
  else { score += 300; cheer('¡Cofre! +300 puntos', '#ffd166', 2.2); }
  boardDirty = true;
}

/* ---------- Cada ronda y cada fotograma ---------- */
function perkReset() {
  PK.has.clear(); Object.assign(PK, { offer: null, offerT: -1, shield: 0, comboSave: 0, perfN: 0 });
  rushStop(true); RUSH.planT = -1; RUSH.song = spConnected() && SP.st && SP.st.item ? SP.st.item.id : null;
  perkClear(); ghostReset();
}
function perkClear() { for (const g of GOLD.list) { scene.remove(g.s); g.s.material.dispose(); } GOLD.list = []; GOLD.n = 0; chestClear(); }
function perkStep(dt, t) {
  if (state === 'paused') return;
  for (const e of enemies) if (e.frostT > 0) { e.frostT -= dt; if (Math.random() < dt * 6) fx.glow(e.center(tmpA), [0.6, 0.9, 1], isTiny() ? 0.12 : 0.4, 0.2); }
  if (PK.offerT > 0 && state === 'rest') { PK.offerT -= dt; if (PK.offerT <= 0) { const pool = perkPool(); if (pool.length) { PK.offer = pool.sort(() => Math.random() - 0.5).slice(0, 3); perkMenu(); } } }
  // si se cierra o se va el panel de las cartas sin elegir, vuelve a salir al rato (la oleada siguiente lo espera)
  if (PK.offer && state === 'rest') { if (menu && menu.perks && !menu.closed) PK.reT = 0; else if ((PK.reT = (PK.reT || 0) + dt) > 2) { PK.reT = 0; perkMenu(); if (stateT >= settings.rest) say('Elige una mejora para seguir', '#ffd166', 1.6); } }
  ghostStep(dt); goldStep(dt, t); rushStep(dt); beatLightStep(dt); chestStep(dt, t);
}
