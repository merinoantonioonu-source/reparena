/* =================== TU CARRERA: NIVEL, MISIONES DEL DÍA, CAMPAÑA Y TU SEMANA =================== */
// Para que apetezca volver y superarse:
//  · cada repetición da experiencia (las perfectas, el doble; ganar la ronda, 20 más) y al subir de nivel cambia tu título
//    y desbloqueas colores de las manos y del rayo normal (solo se ven: nunca dan más cargas ni más daño)
//  · cada día, tres misiones (una de volumen, una de calidad y una de variedad), +40 XP cada una y, con las tres, el cofre
//    del día (+100 XP y un color antes de tiempo)
//  · una campaña por modo y ejercicio: 35 niveles en 7 regiones (una por rango, de recluta a general; el quinto nivel de
//    cada una, con jefe), de 1 a 3 estrellas; ganar abre el siguiente
//  · en el resumen de cada ronda, la experiencia ganada, tu semana y tu mejor ronda con ese ejercicio
// Todo se guarda en CAREER_KEY (la experiencia, lo desbloqueado en cofres, los colores puestos, las misiones de hoy y la campaña)
const CAREER_KEY = 'reparena3-career', PROG_COL = '#c8f560';
const CR = (() => { const s = store(CAREER_KEY) || {}, obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {}; return { xp: Math.max(0, +s.xp || 0), seeded: !!s.seeded, own: Array.isArray(s.own) ? s.own : [], equip: obj(s.equip), mis: s.mis && Array.isArray(s.mis.list) ? s.mis : null, camp: obj(s.camp), gain: null }; })();
const LOOKC = {}; // (el color puesto de cada cosa, ya resuelto: se mira en cada fotograma)
function crSave() { const { gain, ...o } = CR; store(CAREER_KEY, o); for (const k in LOOKC) delete LOOKC[k]; }
// la experiencia de una ronda guardada; la primera vez, la de todo tu historial (no empiezas de cero)
const runXP = r => (r.ex === 'hang' ? Math.round((r.reps || 0) / 2) : (r.reps || 0) + (r.perfect || 0)) + (r.win ? 20 : 0);
(function crSeed() { if (CR.seeded) return; CR.xp += (store(HIST_KEY) || []).reduce((a, r) => a + runXP(r), 0); CR.seeded = true; crSave(); })();

/* ---------- Nivel y título ---------- */
const lvlNeed = n => 100 + 20 * (n - 1); // de un nivel al siguiente: cada vez un poco más
function lvlOf(xp = CR.xp) { let n = 1, r = xp; while (r >= lvlNeed(n) && n < 99) { r -= lvlNeed(n); n++; } return { n, into: r, need: lvlNeed(n) }; }
const TITLES = [[1, 'Novato'], [3, 'Aprendiz'], [6, 'Luchador'], [10, 'Guerrero'], [15, 'Gladiador'], [20, 'Campeón'], [30, 'Héroe'], [40, 'Titán'], [50, 'Leyenda']];
const titleOf = n => TITLES.filter(t => n >= t[0]).pop()[1];
// Los colores que se desbloquean: [clave, nombre, nivel, color]. El rayo normal (el perfecto y los cargados no cambian:
// su color dice lo que valen)
const LOOKS = {
  hands: { name: 'Manos', opts: [['teal', 'Turquesa', 1, 0x3cf0c6], ['pink', 'Rosa', 4, 0xff4fa3], ['gold', 'Oro', 8, 0xffd166], ['lime', 'Ácido', 12, 0x9dff3c], ['violet', 'Violeta', 16, 0xa68bff], ['white', 'Blanco', 22, 0xffffff]] },
  bolt: { name: 'Rayo', opts: [['blue', 'Azul', 1, 0x4aa8ff], ['white', 'Plasma', 5, 0xe8f4ff], ['lime', 'Ácido', 10, 0x8dff5a], ['violet', 'Violeta', 18, 0xb070ff]] }
};
const lookOwn = (k, v) => { const o = LOOKS[k].opts.find(x => x[0] === v); return !!o && (lvlOf().n >= o[2] || CR.own.includes(k + ':' + v)); };
const lookOpt = k => { const v = CR.equip[k], o = LOOKS[k].opts; return (lookOwn(k, v) && o.find(x => x[0] === v)) || o[0]; };
const lookHex = k => LOOKC[k] !== undefined ? LOOKC[k] : (LOOKC[k] = lookOpt(k)[3]);
function lookSet(k, v) { if (!lookOwn(k, v)) return; CR.equip[k] = v; crSave(); }
const unlocksAt = n => n > 1 ? Object.values(LOOKS).flatMap(L => L.opts.filter(o => o[2] === n).map(o => `${L.name}: ${o[1]}`)) : [];
const lockedLooks = () => Object.entries(LOOKS).flatMap(([k, L]) => L.opts.filter(o => !lookOwn(k, o[0])).map(o => ({ id: k + ':' + o[0], label: `${L.name}: ${o[1]}` })));
// el siguiente color que se desbloquea (para el menú)
function nextUnlock() { const n = lvlOf().n; let best = null; for (const L of Object.values(LOOKS)) for (const o of L.opts) if (o[2] > n && (!best || o[2] < best.n)) best = { n: o[2], label: `${L.name}: ${o[1]}` }; return best; }

/* ---------- Misiones del día ---------- */
// t: su tipo; n: lo que piden (según tu nivel); got: lo que llevas. Se eligen con el día como semilla y lo que ya
// hiciste hoy antes de que salieran cuenta
const MIS = {
  reps: { kind: 'vol', n: L => 50 + 10 * Math.min(L, 10), txt: m => `Haz ${m.n} repeticiones` },
  mins: { kind: 'vol', n: () => Math.max(5, settings.goalMin), txt: m => `Entrena ${m.n} minutos` },
  perfect: { kind: 'q', n: L => 20 + 4 * Math.min(L, 10), txt: m => `Consigue ${m.n} perfectas` },
  combo: { kind: 'q', n: L => L < 5 ? 8 : L < 15 ? 12 : 16, txt: m => `Llega a un combo de ×${m.n}` },
  clean: { kind: 'q', n: () => 1, txt: () => 'Gana una ronda sin que te golpeen' },
  mode: { kind: 'var', n: () => 1, txt: m => `Juega una ronda en ${MODE_NAMES[m.arg] || m.arg}` },
  ex: { kind: 'var', n: () => 1, txt: m => `Haz una ronda de ${(EX_NAMES[m.arg] || m.arg).toLowerCase()}` },
  star: { kind: 'var', n: () => 1, txt: () => 'Gana una estrella nueva en la campaña' }
};
const MIS_XP = 40, CHEST_XP = 100, STAR_XP = 15, WIN_XP = 20;
function seeded(str) { let h = 2166136261; for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => { h = (h + 0x6D2B79F5) | 0; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function misAdd(list, o) {
  for (const m of list) {
    if (m.t === 'reps') m.got += o.reps || 0; else if (m.t === 'mins') m.got += o.mins || 0; else if (m.t === 'perfect') m.got += o.perfect || 0;
    else if (m.t === 'combo') m.got = Math.max(m.got, o.combo || 0); else if (m.t === 'clean') { if (o.win && !o.taken) m.got = 1; }
    else if (m.t === 'mode') { if (o.mode === m.arg) m.got = 1; } else if (m.t === 'ex') { if (o.ex === m.arg) m.got = 1; } else if (m.t === 'star') m.got += o.stars || 0;
  }
}
function misToday(now = Date.now()) {
  const day = dayKey(now); if (CR.mis && CR.mis.day === day) return CR.mis;
  const R = seeded('reparena' + day), pickR = a => a[Math.floor(R() * a.length) % a.length], L = lvlOf().n, h = store(HIST_KEY) || [];
  // variedad: el modo que menos has jugado esta semana, o un ejercicio que ya conoces y llevas días sin hacer
  const week = h.filter(r => r.date > now - 7 * DAY_MS), modes = ['combat', 'arcs', 'touch', ...(h.some(r => r.mode === 'bars') ? ['bars'] : [])].sort((a, b) => week.filter(r => r.mode === a).length - week.filter(r => r.mode === b).length);
  const recent = new Set(h.filter(r => r.date > now - 3 * DAY_MS).map(r => r.ex)), exs = [...new Set(h.map(r => r.ex))].filter(x => EX_NAMES[x] && !recent.has(x) && Object.keys(MODE_NAMES).some(m => exOk(m, x)));
  let t3 = pickR(['mode', 'ex', 'star']); if (t3 === 'ex' && !exs.length) t3 = 'mode';
  const list = [pickR(['reps', 'reps', 'mins']), pickR(['perfect', 'combo', 'clean']), t3].map(t => ({ t, n: MIS[t].n(L), got: 0, done: false, ...(t === 'mode' ? { arg: pickR(modes.slice(0, 2)) } : t === 'ex' ? { arg: pickR(exs) } : {}) }));
  for (const r of h.filter(r => dayKey(r.date) === day)) misAdd(list, { reps: r.ex === 'hang' ? 0 : r.reps, perfect: r.perfect, mins: (r.time || 0) / 60, mode: r.mode, ex: r.ex, win: r.win, taken: 1 });
  let xp = 0; list.forEach(m => { if (m.got >= m.n) { m.done = true; xp += MIS_XP; } }); CR.xp += xp; // (lo cumplido antes de salir, también)
  CR.mis = { day, list, chest: false }; crSave(); return CR.mis;
}
const misLeft = () => misToday().list.filter(m => !m.done).length;

/* ---------- Al acabar cada ronda ---------- */
// o: lo de la ronda (repeticiones, perfectas, minutos, combo, si ganaste y los golpes recibidos). Lo ganado se va
// juntando en CR.gain hasta que lo enseña el resumen (en una sesión, el de la sesión entera)
function careerRun(o) {
  const G = CR.gain || (CR.gain = { xp0: CR.xp, xp: 0, notes: [] });
  let xp = (o.hang ? Math.round(o.reps / 2) : o.reps + o.perfect) + (o.win ? WIN_XP : 0);
  if (CAMP.run) { const c = campResult(o); G.camp = c; xp += STAR_XP * c.newStars; o.stars = c.newStars; if (c.newStars) G.notes.push([`Campaña: ${c.newStars === 1 ? 'una estrella nueva' : `${c.newStars} estrellas nuevas`}`, '#ffd166']); }
  const M = misToday(), was = M.list.map(m => m.done); misAdd(M.list, o);
  M.list.forEach((m, i) => { if (!was[i] && m.got >= m.n) { m.done = true; xp += MIS_XP; G.notes.push([`Misión cumplida: ${MIS[m.t].txt(m)}`, '#3cf0c6']); } });
  if (!M.chest && M.list.every(m => m.done)) {
    M.chest = true; xp += CHEST_XP; const lk = lockedLooks(), p = lk.length ? lk[Math.floor(Math.random() * lk.length)] : null; if (p) CR.own.push(p.id);
    G.notes.push([`¡Cofre del día! +${CHEST_XP} XP${p ? ` y ${p.label}` : ''}`, '#ffd166']);
  }
  const l0 = lvlOf().n; CR.xp += xp; G.xp += xp; const l1 = lvlOf().n;
  for (let n = l0 + 1; n <= l1; n++) { G.notes.push([`¡Nivel ${n}!${titleOf(n) !== titleOf(n - 1) ? ` Ahora eres ${titleOf(n)}` : ''}`, '#ffd166']); unlocksAt(n).forEach(u => G.notes.push([`Desbloqueado: ${u}`, '#ff4fa3'])); }
  crSave();
}
function careerTake() { const G = CR.gain; CR.gain = null; return G; }

/* ---------- La campaña ---------- */
// Una por modo y ejercicio. Cada región es un rango y un entorno; sus 5 niveles van de 3 a 5 oleadas y el quinto acaba
// con el jefe. Mientras se juega, los ajustes del nivel van por encima de los tuyos (CAMP.orig: se devuelven al acabar y
// no se guardan); el entorno de la región se queda hasta volver al menú
const CAMP_REG = [['Campo de entrenamiento', 'arena'], ['Bosque del eco', 'nature'], ['Isla del capitán', 'island'], ['Fortaleza de hierro', 'arena'], ['Bosque sombrío', 'nature'], ['Isla de los tiburones', 'island'], ['Ciudadela del general', 'arena']];
const CAMP_N = CAMP_REG.length * 5, CAMP_WAVES = [3, 3, 4, 4, 5];
const campId = () => settings.mode + ':' + settings.exercise;
const campOf = (id = campId()) => CR.camp[id] || { at: 1, stars: {} };
const campLv = lv => { const r = Math.floor((lv - 1) / 5), k = (lv - 1) % 5; return { r, k, rank: RANKS[r][0], name: CAMP_REG[r][0], env: CAMP_REG[r][1], waves: CAMP_WAVES[k], boss: k === 4 }; };
const campStars = (id = campId()) => Object.values(campOf(id).stars).reduce((a, b) => a + b, 0);
function campStart(lv) {
  campEnd(); const L = campLv(lv), patch = { ...rankVals(L.rank), rank: L.rank, waves: L.waves, toFail: 0 };
  CAMP.orig = {}; for (const k in patch) CAMP.orig[k] = settings[k]; Object.assign(settings, patch);
  CAMP.run = { id: campId(), lv };
  if (CAMP.env !== L.env) { CAMP.env = L.env; envSwitch(); }
  beginRun();
}
// los ajustes, como estaban (el entorno de la región sigue hasta volver al menú: campEnvBack)
function campEnd() { if (CAMP.orig) { Object.assign(settings, CAMP.orig); CAMP.orig = null; } CAMP.run = null; }
function campEnvBack() { if (CAMP.env && !CAMP.run) { CAMP.env = null; envSwitch(); } }
// estrellas: ganar, una; con la mitad de perfectas, dos; con tres cuartos y sin que te golpeen, tres (colgado: sin caídas)
function campResult(o) {
  const R = CAMP.run, C = CR.camp[R.id] || (CR.camp[R.id] = { at: 1, stars: {} }), pr = o.reps ? o.perfect / o.reps : 0;
  const stars = !o.win ? 0 : o.hang ? 1 + (o.falls ? 0 : 1) + (o.taken ? 0 : 1) : 1 + (pr >= 0.5 ? 1 : 0) + (pr >= 0.75 && !o.taken ? 1 : 0), prev = C.stars[R.lv] || 0;
  if (stars > prev) C.stars[R.lv] = stars;
  if (o.win && R.lv >= C.at && R.lv < CAMP_N) C.at = R.lv + 1;
  return { lv: R.lv, stars, prev, newStars: Math.max(0, stars - prev), next: o.win && R.lv < CAMP_N ? R.lv + 1 : null };
}

/* ---------- Dibujos (menú y resumen) ---------- */
function drawStar(c, x, y, r, on) {
  c.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, q = k % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } c.closePath();
  c.fillStyle = on ? '#ffd166' : 'rgba(255,255,255,0.12)'; c.fill(); if (on) { c.lineWidth = Math.max(1, r * 0.12); c.strokeStyle = '#8a5a0e'; c.stroke(); }
}
// la insignia del nivel: un hexágono dorado con el número
function drawLvlBadge(c, cx, cy, R, n) {
  c.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); } c.closePath();
  const g = c.createLinearGradient(cx, cy - R, cx, cy + R); g.addColorStop(0, '#fff0a8'); g.addColorStop(0.55, '#ffc94a'); g.addColorStop(1, '#b97a12'); c.fillStyle = g; c.fill();
  c.lineWidth = Math.max(2, R * 0.08); c.strokeStyle = '#6e4508'; c.stroke();
  c.fillStyle = '#2a1600'; c.textAlign = 'center'; c.textBaseline = 'middle'; fitFont(c, String(n), R * 1.3, Math.round(R * 1.05), '%px ' + FD); c.fillText(String(n), cx, cy + R * 0.06);
}
// el nivel, el título y la barra de experiencia (con lo ganado en esta ronda, en dorado)
function drawXP(c, x, y, w, h, G) {
  const L = lvlOf(), R = Math.min(h * 0.4, w * 0.13), cx = x + R + 6, cy = y + h / 2; drawLvlBadge(c, cx, cy, R, L.n);
  const bx = cx + R + 14, bw = x + w - bx - 6, by = y + h * 0.47, bh = Math.max(8, h * 0.15);
  c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = '#eeeaff'; fitFont(c, `Nivel ${L.n} · ${titleOf(L.n)}`, bw, Math.round(h * 0.24), '700 %px ' + FB); c.fillText(`Nivel ${L.n} · ${titleOf(L.n)}`, bx, y + h * 0.22);
  rr(c, bx, by, bw, bh, bh / 2); c.fillStyle = 'rgba(255,255,255,0.1)'; c.fill();
  const k = L.into / L.need, up = G && lvlOf(G.xp0).n < L.n, k0 = G && !up ? Math.max(0, (L.into - G.xp) / L.need) : up ? 0 : k;
  if (k0 > 0.001) { rr(c, bx, by, Math.max(bh, bw * k0), bh, bh / 2); c.fillStyle = PROG_COL; c.fill(); }
  if (k - k0 > 0.001) { rr(c, bx + bw * k0, by, Math.max(bh, bw * (k - k0)), bh, bh / 2); c.fillStyle = '#ffd166'; c.fill(); }
  const t = `${L.into} / ${L.need} XP`, t2 = G && G.xp ? `+${G.xp} XP` : (() => { const u = nextUnlock(); return u ? `Nivel ${u.n}: ${u.label}` : ''; })();
  c.fillStyle = '#a49fc8'; fitFont(c, t, bw * 0.5, Math.round(h * 0.19), '600 %px ' + FB); c.fillText(t, bx, y + h * 0.8);
  if (t2) { c.textAlign = 'right'; c.fillStyle = G && G.xp ? '#ffd166' : '#a49fc8'; fitFont(c, t2, bw * 0.5, Math.round(h * 0.19), '700 %px ' + FB); c.fillText(t2, bx + bw, y + h * 0.8); }
}
// los últimos 7 días: minutos de cada uno en barras (hoy, en turquesa) y la raya de tu meta
function drawWeek(c, x, y, w, h) {
  const D = dayStats(store(HIST_KEY) || []), goal = settings.goalMin, mx = Math.max(goal, ...D.week.map(d => d.v.time / 60)) || 1, n = 7, gap = w * 0.025, bw = (w - gap * (n - 1)) / n, top = y + h * 0.32, base = y + h * 0.8;
  c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = '#a49fc8'; fitFont(c, 'Tu semana (minutos)', w, Math.round(h * 0.13), '600 %px ' + FB); c.fillText('Tu semana (minutos)', x, y + h * 0.08);
  D.week.forEach((d, i) => {
    const m = d.v.time / 60, bh = Math.max(m > 0 ? 3 : 0, (base - top) * m / mx), bx = x + i * (bw + gap), today = i === n - 1;
    rr(c, bx, top, bw, base - top, Math.min(8, bw / 3)); c.fillStyle = 'rgba(255,255,255,0.05)'; c.fill();
    if (bh) { rr(c, bx, base - bh, bw, bh, Math.min(8, bw / 3, bh / 2)); c.fillStyle = today ? '#3cf0c6' : '#5ab8ff'; c.fill(); }
    c.textAlign = 'center'; c.fillStyle = '#eeeaff'; if (m >= 1) { fitFont(c, String(Math.round(m)), bw, Math.round(h * 0.12), '700 %px ' + FB); c.fillText(String(Math.round(m)), bx + bw / 2, base - bh - h * 0.07); }
    c.fillStyle = today ? '#3cf0c6' : '#a49fc8'; const lab = today ? 'hoy' : WDAY[d.d.getDay()].slice(0, 2); fitFont(c, lab, bw + gap, Math.round(h * 0.12), '600 %px ' + FB); c.fillText(lab, bx + bw / 2, base + h * 0.1);
  });
  const gy = base - (base - top) * goal / mx; c.setLineDash([8, 6]); c.lineWidth = 2; c.strokeStyle = '#ff4fa3'; c.beginPath(); c.moveTo(x, gy); c.lineTo(x + w, gy); c.stroke(); c.setLineDash([]);
}
// una llama (la racha) y un cofre (abierto o cerrado), dibujados
function drawFlame(c, x, y, s) {
  const g = c.createLinearGradient(x, y - s, x, y + s); g.addColorStop(0, '#ffd166'); g.addColorStop(1, '#ff4a2a'); c.fillStyle = g;
  c.beginPath(); c.moveTo(x, y - s); c.bezierCurveTo(x + s * 0.9, y - s * 0.2, x + s * 0.7, y + s, x, y + s); c.bezierCurveTo(x - s * 0.7, y + s, x - s * 0.9, y - s * 0.1, x - s * 0.2, y - s * 0.45); c.bezierCurveTo(x - s * 0.1, y - s * 0.2, x + s * 0.1, y - s * 0.6, x, y - s); c.fill();
}
function drawChest(c, x, y, s, open) {
  c.fillStyle = '#7a4318'; rr(c, x - s, y - s * 0.2, s * 2, s * 1.1, s * 0.12); c.fill(); c.fillStyle = '#ffd166'; c.fillRect(x - s * 0.55, y - s * 0.2, s * 0.18, s * 1.1); c.fillRect(x + s * 0.37, y - s * 0.2, s * 0.18, s * 1.1);
  if (open) { c.fillStyle = '#1a0d04'; c.fillRect(x - s * 0.9, y - s * 0.3, s * 1.8, s * 0.2); c.fillStyle = '#ffd166'; c.beginPath(); c.arc(x, y - s * 0.3, s * 0.55, Math.PI, 0); c.fill(); c.fillStyle = '#9a5622'; rr(c, x - s, y - s * 1.25, s * 2, s * 0.45, s * 0.12); c.fill(); }
  else { c.fillStyle = '#9a5622'; rr(c, x - s, y - s * 0.75, s * 2, s * 0.6, s * 0.25); c.fill(); c.fillStyle = '#ffd166'; c.fillRect(x - s * 0.12, y - s * 0.35, s * 0.24, s * 0.3); }
}
// las tres misiones con su progreso, el cofre del día y la racha
function drawMissions(c, x, y, w, h) {
  const M = misToday(), P = progress(), rh = h * 0.24;
  M.list.forEach((m, i) => {
    const ry = y + i * rh, cy = ry + rh * 0.45, r = rh * 0.26, done = m.done;
    c.beginPath(); c.arc(x + r + 4, cy, r, 0, TAU); c.fillStyle = done ? '#3cf0c6' : 'rgba(255,255,255,0.08)'; c.fill();
    if (done) { c.strokeStyle = '#06261f'; c.lineWidth = r * 0.3; c.lineCap = 'round'; c.beginPath(); c.moveTo(x + 4 + r * 0.5, cy); c.lineTo(x + 4 + r * 0.9, cy + r * 0.4); c.lineTo(x + 4 + r * 1.5, cy - r * 0.45); c.stroke(); }
    const tx = x + r * 2 + 16, tw = w - (tx - x), txt = MIS[m.t].txt(m), got = Math.min(m.n, m.t === 'mins' ? Math.floor(m.got) : m.got);
    c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = done ? '#3cf0c6' : '#eeeaff'; fitFont(c, txt, tw * 0.76, Math.round(rh * 0.4), '600 %px ' + FB); c.fillText(txt, tx, cy - rh * 0.14);
    const by = cy + rh * 0.2, bh = Math.max(6, rh * 0.13); rr(c, tx, by, tw * 0.72, bh, bh / 2); c.fillStyle = 'rgba(255,255,255,0.1)'; c.fill();
    if (got > 0) { rr(c, tx, by, Math.max(bh, tw * 0.72 * got / m.n), bh, bh / 2); c.fillStyle = done ? '#3cf0c6' : PROG_COL; c.fill(); }
    c.textAlign = 'right'; c.fillStyle = '#a49fc8'; fitFont(c, done ? `+${MIS_XP} XP` : `${got} / ${m.n}`, tw * 0.22, Math.round(rh * 0.34), '700 %px ' + FB); c.fillText(done ? `+${MIS_XP} XP` : `${got} / ${m.n}`, x + w, cy);
  });
  const fy = y + h * 0.84, s = h * 0.075;
  drawChest(c, x + s + 4, fy + s * 0.2, s, M.chest); c.textAlign = 'left'; c.fillStyle = M.chest ? '#ffd166' : '#a49fc8';
  const ct = M.chest ? '¡Cofre del día abierto!' : 'Cofre del día: cumple las tres'; fitFont(c, ct, w * 0.44, Math.round(h * 0.085), '600 %px ' + FB); c.fillText(ct, x + s * 2 + 14, fy);
  drawFlame(c, x + w * 0.6, fy, s * 0.9); c.fillStyle = '#ffb36b'; const st = `Racha: ${daysTxt(P.streak)} · mejor ${daysTxt(P.best)}`; fitFont(c, st, w * 0.36, Math.round(h * 0.085), '600 %px ' + FB); c.fillText(st, x + w * 0.6 + s + 8, fy);
}
// el mapa de una región de la campaña: un camino con sus cinco niveles (el del jefe, más grande y con corona), sus
// estrellas, el siguiente por jugar en turquesa y el elegido rodeado
function drawCampMap(c, x, y, w, h, reg, sel) {
  const C = campOf(), env = CAMP_REG[reg][1], bg = { arena: ['#3a2f2a', '#1c1a22'], nature: ['#28503a', '#13241c'], island: ['#2a6f86', '#d9b979'] }[env];
  const g = c.createLinearGradient(x, y, x, y + h); g.addColorStop(0, bg[0]); g.addColorStop(1, bg[1]); rr(c, x, y, w, h, 18); c.fillStyle = g; c.fill();
  c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = '#ffffff'; const tt = `${reg + 1}. ${CAMP_REG[reg][0]} · ${RANKS[reg][1]}`; fitFont(c, tt, w * 0.7, Math.round(h * 0.11), '700 %px ' + FB); c.fillText(tt, x + 16, y + h * 0.12);
  c.textAlign = 'right'; c.fillStyle = '#ffd166'; const st = `${campStars()} / ${CAMP_N * 3} estrellas`; fitFont(c, st, w * 0.28, Math.round(h * 0.09), '700 %px ' + FB); c.fillText(st, x + w - 16, y + h * 0.12);
  const pts = [0, 1, 2, 3, 4].map(i => [x + w * (0.1 + i * 0.2), y + h * (i % 2 ? 0.45 : 0.6)]);
  c.lineWidth = Math.max(4, h * 0.04); c.strokeStyle = 'rgba(255,255,255,0.35)'; c.setLineDash([12, 10]); c.beginPath(); pts.forEach(([px, py], i) => i ? c.lineTo(px, py) : c.moveTo(px, py)); c.stroke(); c.setLineDash([]);
  pts.forEach(([px, py], i) => {
    const lv = reg * 5 + i + 1, boss = i === 4, R = h * (boss ? 0.15 : 0.12), open = lv <= C.at, st = C.stars[lv] || 0, next = lv === C.at;
    if (lv === sel) { c.beginPath(); c.arc(px, py, R * 1.35, 0, TAU); c.lineWidth = Math.max(3, R * 0.15); c.strokeStyle = '#ffffff'; c.stroke(); }
    c.beginPath(); c.arc(px, py, R, 0, TAU); c.fillStyle = !open ? 'rgba(0,0,0,0.55)' : next ? '#3cf0c6' : st ? '#ffd166' : '#eeeaff'; c.fill(); c.lineWidth = Math.max(2, R * 0.1); c.strokeStyle = 'rgba(0,0,0,0.5)'; c.stroke();
    c.textAlign = 'center'; c.fillStyle = open ? '#1a1030' : 'rgba(255,255,255,0.4)'; fitFont(c, String(lv), R * 1.4, Math.round(R * 0.95), '%px ' + FD); c.fillText(String(lv), px, py + R * 0.05);
    if (boss) { c.fillStyle = open ? '#ff4a6a' : 'rgba(255,74,106,0.4)'; c.beginPath(); c.moveTo(px - R * 0.7, py - R * 0.95); c.lineTo(px - R * 0.7, py - R * 1.45); c.lineTo(px - R * 0.35, py - R * 1.15); c.lineTo(px, py - R * 1.55); c.lineTo(px + R * 0.35, py - R * 1.15); c.lineTo(px + R * 0.7, py - R * 1.45); c.lineTo(px + R * 0.7, py - R * 0.95); c.closePath(); c.fill(); } // la corona del jefe
    for (let k = 0; k < 3; k++) drawStar(c, px + (k - 1) * R * 0.75, py + R * 1.45, R * 0.32, k < st);
  });
}
// tu mejor ronda con este ejercicio en este modo (sin contar la que acabas de jugar)
function bestRunOf(h, ex = settings.exercise, mode = settings.mode) { return h.filter(r => r.ex === ex && r.mode === mode).reduce((b, r) => !b || r.reps > b.reps ? r : b, null); }

/* ---------- La parte Progreso del menú principal ---------- */
const PROG = { tab: uiPrefs().prog || 'lvl', lv: 0, reg: -1 };
function progRows(again) {
  const tabs = [['lvl', 'Nivel'], ['mis', 'Misiones'], ['camp', 'Campaña'], ['week', 'Semana']], rows = [];
  rows.push({ t: 'tabs', items: tabs.map(([k, l]) => ({ label: k === 'mis' && misLeft() ? `${l} (${misLeft()})` : l, on: k === PROG.tab, onPress: () => { PROG.tab = k; uiSave('prog', k); again(); } })) });
  if (PROG.tab === 'lvl') {
    const L = lvlOf(); rows.push({ t: 'canvas', h: 0.1, text: `Nivel ${L.n} · ${titleOf(L.n)} · ${L.into} / ${L.need} XP`, draw: (c, x, y, w, h) => drawXP(c, x, y, w, h, null) });
    for (const k in LOOKS) { const O = LOOKS[k].opts, per = Math.ceil(O.length / Math.ceil(O.length / 3)); for (let i = 0; i < O.length; i += per) rows.push({ t: 'choice', label: i ? '' : LOOKS[k].name, value: lookOpt(k)[0], opts: O.slice(i, i + per).map(o => [o[0], lookOwn(k, o[0]) ? o[1] : `Nivel ${o[2]}`, !lookOwn(k, o[0])]), onPick: v => { lookSet(k, v); again(); } }); } // (de tres en tres como mucho: si no, no se leen)
    rows.push({ t: 'text', text: 'Cada repetición da experiencia (las perfectas, el doble). Los colores solo se ven', color: '#a49fc8' });
  } else if (PROG.tab === 'mis') {
    rows.push({ t: 'canvas', h: 0.24, text: misToday().list.map(m => MIS[m.t].txt(m) + (m.done ? ' ✓' : '')).join(' · '), draw: drawMissions });
    rows.push({ t: 'text', text: `Tres nuevas cada día: +${MIS_XP} XP cada una; con las tres, el cofre (+${CHEST_XP} XP y un color)`, color: '#a49fc8' });
  } else if (PROG.tab === 'camp') {
    const C = campOf(), sel = clamp(PROG.lv || C.at, 1, CAMP_N), reg = PROG.reg >= 0 ? PROG.reg : Math.floor((sel - 1) / 5);
    rows.push({ t: 'canvas', h: 0.2, text: `Campaña de ${EX_NAMES[settings.exercise]} en ${MODE_NAMES[settings.mode]} · ${CAMP_REG[reg][0]}`, draw: (c, x, y, w, h) => drawCampMap(c, x, y, w, h, reg, sel) });
    rows.push({ t: 'btns', items: [0, 1, 2, 3, 4].map(i => { const lv = reg * 5 + i + 1, open = lv <= C.at; return { label: i === 4 ? `${lv} Jefe` : String(lv), style: !open ? 'ghost' : lv === sel ? 'selected' : 'normal', onPress: () => { if (!open) return; PROG.lv = lv; PROG.reg = reg; again(); } }; }) });
    rows.push({ t: 'btns', items: [{ label: '◀ Región', style: reg > 0 ? 'normal' : 'ghost', onPress: () => { if (reg > 0) { PROG.reg = reg - 1; again(); } } }, { label: `Jugar nivel ${sel}`, style: 'primary', flex: 2, onPress: () => campStart(sel) }, { label: 'Región ▶', style: reg < CAMP_REG.length - 1 ? 'normal' : 'ghost', onPress: () => { if (reg < CAMP_REG.length - 1) { PROG.reg = reg + 1; again(); } } }] });
    const L = campLv(sel); rows.push({ t: 'text', text: `Nivel ${sel}: ${RANKS[L.r][1].toLowerCase()}, ${L.waves} oleadas${L.boss && isCombat() ? ', con jefe' : ''} · ${EX_SHORT[settings.exercise] || EX_NAMES[settings.exercise]} en ${MODE_NAMES[settings.mode]}`, color: '#a49fc8' });
  } else {
    rows.push({ t: 'canvas', h: 0.17, text: 'Tu semana', draw: drawWeek });
    const b = bestRunOf(store(HIST_KEY) || []); rows.push({ t: 'text', text: b ? `Tu mejor ronda de ${(EX_SHORT[settings.exercise] || EX_NAMES[settings.exercise]).toLowerCase()} en ${MODE_NAMES[settings.mode]}: ${b.reps} ${b.ex === 'hang' ? 's' : 'reps'}${b.reps && b.ex !== 'hang' ? ` · ${Math.round(100 * (b.perfect || 0) / b.reps)} % perfectas` : ''}` : 'Aún no tienes ninguna ronda de este ejercicio en este modo', color: '#a49fc8' });
  }
  return rows;
}
// para la línea de arriba del menú principal
function careerLine() { const L = lvlOf(), n = misLeft(); return `Nivel ${L.n} · ${titleOf(L.n)}${n ? ` · ${n} ${n === 1 ? 'misión' : 'misiones'} para hoy` : ' · misiones de hoy cumplidas'}`; }
// y para la página: el nivel y las misiones de hoy, en el panel de Hoy
function careerHTML() {
  const L = lvlOf(), M = misToday(), esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  return `<div class="career"><div class="lvl"><b>${L.n}</b><span>Nivel ${L.n} · ${titleOf(L.n)}<i style="--k:${Math.round(100 * L.into / L.need)}%"></i><small>${L.into} / ${L.need} XP</small></span></div>
    <ul class="mis">${M.list.map(m => `<li class="${m.done ? 'done' : ''}"><span>${esc(MIS[m.t].txt(m))}</span><em>${m.done ? '✓' : `${Math.min(m.n, Math.floor(m.got))} / ${m.n}`}</em></li>`).join('')}</ul>
    <p class="chest">${M.chest ? 'Cofre del día abierto' : 'Cumple las tres misiones y se abre el cofre del día'}</p></div>`;
}
