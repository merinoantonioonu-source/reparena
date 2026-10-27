
/* =================== SESIÓN DE ENTRENAMIENTO: BLOQUES ENCADENADOS =================== */
// Una sesión es una lista de bloques {mode, ex, n} (en Combate, también foes: robots, voladores o mezcla): n repeticiones (en colgado, segundos). Cada bloque se juega
// como una partida repartida en oleadas de unas 10 repeticiones; entre bloques hay descanso y al final, un resumen. Se puede
// dar varias vueltas (rounds): al acabar el último bloque, tras el descanso, vuelve al primero.
// Mientras dura, la sesión cambia modo, ejercicio y oleadas sin tocar los ajustes guardados.
const SES_KEY = 'reparena3-session';
const SES = { blocks: [], rest: 60, rounds: 1, round: 0, rankOpen: -1, active: false, idx: 0, orig: null, waves: null, results: [], wait: 0, stop: false, musicOpen: -1, setOpen: -1, exOpen: -1, mList: '', mErr: '', name: '' };
const MUSIC_MAX = 50, ROUNDS_MAX = 20; // (canciones por bloque y vueltas a la sesión, como mucho)
// Ajustes que puede tener cada bloque (su perfil o los suyos propios, con el engranaje): los del juego, sin el modo, el
// ejercicio ni las oleadas, que los pone el bloque. El sonido, el entorno y el menú no cambian de un bloque a otro
const BLOCK_GROUPS = ['partida', 'ejercicio', 'enemigos', 'armas', 'cada', 'arcos', 'toques', 'barras'];
const blockKeyOk = k => FIELD[k] && BLOCK_GROUPS.includes(FIELD[k].g) && !['mode', 'exercise', 'waves', 'repsWave', 'repsInc', 'hangTime', 'hangInc', 'rest', 'rank'].includes(k); // (el rango va aparte: cambia muchos a la vez)
const rankOk = r => RANKS.some(o => o[0] === r);
const SESS_KEY = 'reparena3-sessions', SESS_MAX = 12; // sesiones guardadas con nombre
const SES_KEYS = ['mode', 'exercise', 'waves', 'repsWave', 'repsInc', 'hangTime', 'hangInc', 'foesGate', 'foesHatch', 'foesFly', 'aim'];
const blockOk = exOk;
const validBlock = b => b && MODE_NAMES[b.mode] && EX_NAMES[b.ex] && blockOk(b.mode, b.ex) && isFinite(b.n) && b.n >= 1;
// Un bloque como se guarda: lo suyo y, si los tiene, su música, su perfil y sus ajustes propios
function sesClean(list) { return (list || []).filter(validBlock).slice(0, 20).map(b => ({ mode: b.mode, ex: b.ex, n: clamp(Math.round(b.n), 1, 500), ...blockExtra(b), ...blockMusic(b), ...blockOwn(b) })); }
function blockOwn(b) {
  const o = {}; if (b && typeof b.prof === 'string' && b.prof.trim()) o.prof = b.prof.trim().slice(0, 40);
  if (b && rankOk(b.rank)) o.rank = b.rank; // (su rango: puedes ser bueno en un ejercicio y no en otro)
  if (b && b.set && typeof b.set === 'object') { const st = {}; for (const k in b.set) if (blockKeyOk(k)) st[k] = clampSetting(FIELD[k], b.set[k]); if (Object.keys(st).length) o.set = st; }
  return o;
}
// Lo que pone el perfil del bloque (sus ajustes del juego; el modo y el ejercicio, los del bloque)
function blockProfPatch(b) {
  const p = b.prof && profiles().find(x => x.name === b.prof), o = {}; if (!p) return o;
  for (const k in p.s) if (blockKeyOk(k)) o[k] = clampSetting(FIELD[k], p.s[k]);
  return o;
}
// La música del bloque: canciones de Spotify (de una o varias listas) que suenan en orden y en bucle mientras dura
function blockMusic(b) {
  const m = Array.isArray(b && b.music) ? b.music.filter(t => t && typeof t.uri === 'string' && t.uri.startsWith('spotify:track:')).slice(0, MUSIC_MAX).map(t => ({ uri: t.uri, name: String(t.name || '').slice(0, 120), by: String(t.by || '').slice(0, 120) })) : [];
  return m.length ? { music: m } : {};
}
// En Combate el bloque guarda sus enemigos (y, si venía de Enjambre o Asalto, su puntería)
// (foes: por tierra, voladores o mezcla, sobre los enemigos elegidos en Ajustes → Enemigos; por defecto, lo que haya ahí)
const foeCat = v => FOE_CATS.some(o => o[0] === v) ? v : null;
const foeCatNow = () => { const k = settings.foeKind, g = k !== 'fly' && (foeList('foesGate').length || foeList('foesHatch').length), f = k !== 'ground' && foeList('foesFly').length; return g && f ? 'mix' : f ? 'flyers' : 'robots'; };
function blockExtra(b) { if (b.mode !== 'combat') return {}; const o = { foes: foeCat(b.foes) || foeCatNow() }; if (b.aim) o.aim = clampSetting(FIELD.aim, b.aim); return o; }
// Lo que el bloque cambia en los ajustes mientras se juega
function blockSettings(b) { const { foes: c, ...o } = blockExtra(b); return c ? Object.assign(o, foeCatPatch(c)) : o; }
function saveSession() { store(SES_KEY, { blocks: SES.blocks, rest: SES.rest, rounds: SES.rounds }); }
const roundsOf = v => clamp(Math.round(+v) || 1, 1, ROUNDS_MAX);
// El bloque que viene después del de ahora: el siguiente o, acabada la vuelta, el primero de la siguiente (null: se acabó)
function sesNext() { return SES.idx + 1 < SES.blocks.length ? { i: SES.idx + 1, r: SES.round } : SES.round + 1 < SES.rounds ? { i: 0, r: SES.round + 1 } : null; }
const roundTxt = (r = SES.round) => SES.rounds > 1 ? ` · vuelta ${r + 1}/${SES.rounds}` : '';
const blockUnit = b => b.ex === 'hang' ? 's' : 'reps';
function blockLabel(b) { const c = b.foes && FOE_CATS.find(o => o[0] === b.foes), n = b.set ? Object.keys(b.set).length : 0; return `${b.n} ${b.ex === 'hang' ? 's de colgado' : EX_NAMES[b.ex].toLowerCase()} · ${MODE_NAMES[b.mode]}${c ? ` (${c[1].toLowerCase()})` : ''}${b.rank ? ` · ${rankName(b.rank).toLowerCase()}` : ''}${b.prof ? ` · perfil «${b.prof}»` : ''}${n ? ` · ${n} ${n === 1 ? 'ajuste propio' : 'ajustes propios'}` : ''}`; }
// Reparte n en oleadas de unas `per` repeticiones, con el total exacto
function splitWaves(n, per) { const w = Math.max(1, Math.round(n / per)), base = Math.floor(n / w), out = []; for (let i = 0; i < w; i++) out.push(base + (i < n - base * w ? 1 : 0)); return out; }
function sessionMinutes() {
  let t = 0; // (una vuelta; luego, todas, con los descansos entre bloques y entre vueltas)
  for (const b of SES.blocks) { const w = splitWaves(b.n, b.ex === 'hang' ? 25 : 10); t += (b.ex === 'hang' ? b.n : b.n * (b.mode === 'arcs' ? 60 / settings.arcRate : repTimeOf(b.ex, b.mode))) + settings.rest * (w.length - 1); }
  t = t * SES.rounds + SES.rest * Math.max(0, SES.blocks.length * SES.rounds - 1);
  return Math.max(1, Math.round(t / 60));
}

// (se lee después de definir lo que usa: con la lectura arriba del todo, un bloque de Combate guardado rompía la carga)
(function loadSession() {
  const s = store(SES_KEY) || {};
  // los bloques de Asalto y Enjambre pasan a Combate con sus enemigos y su puntería
  const mig = b => b && LEGACY_MODES[b.mode] ? { ...b, mode: 'combat', ...LEGACY_MODES[b.mode] } : b;
  if (Array.isArray(s.blocks)) SES.blocks = sesClean(s.blocks.map(mig));
  if (isFinite(s.rest)) SES.rest = clamp(Math.round(s.rest), 0, 600);
  if (s.rounds) SES.rounds = roundsOf(s.rounds);
})();

/* ---------- Durante el juego ---------- */
function applyBlock(i) {
  const b = SES.blocks[i]; SES.idx = i;
  if (SES.orig) Object.assign(settings, SES.orig); // (lo que cambió el bloque anterior —su perfil, sus ajustes—, como estaba)
  SES.waves = splitWaves(b.n, b.ex === 'hang' ? 25 : 10);
  // su perfil, su rango, luego lo del bloque y, por encima, sus ajustes propios; lo que se toca se apunta para devolverlo al acabar
  const patch = Object.assign(blockProfPatch(b), b.rank ? { ...rankVals(b.rank), rank: b.rank } : {}, { mode: b.mode, exercise: b.ex, waves: SES.waves.length, repsWave: clamp(SES.waves[0], 3, 150), repsInc: 0, hangTime: clamp(SES.waves[0], 5, 300), hangInc: 0 }, blockSettings(b), b.set || {});
  if (SES.orig) for (const k in patch) if (!(k in SES.orig)) SES.orig[k] = settings[k];
  Object.assign(settings, patch);
  onSettingChanged('mode'); onSettingChanged('exercise');
  if (typeof spBlockMusic === 'function') spBlockMusic(b); // (su música, si la tiene)
}
function startSession() {
  if (!SES.blocks.length) return;
  // los bloques de barras necesitan su aparato colocado
  if (!preview) for (const b of SES.blocks) if (b.mode === 'bars' && !EQ.xr[b.ex === 'row' ? 'dip' : 'door'].set) {
    setSetting('mode', 'bars'); setSetting('exercise', b.ex); startPlace(lobbyMenu, `Para la sesión, coloca ${eqName().the}`); return;
  }
  SES.orig = {}; SES_KEYS.forEach(k => { SES.orig[k] = settings[k]; });
  Object.assign(SES, { active: true, results: [], stop: false, round: 0 });
  applyBlock(0); beginRun();
}
// Se llama al terminar la partida de un bloque (en lugar del menú de fin)
function sessionBlockDone(win, manual) {
  const b = SES.blocks[SES.idx];
  SES.results.push({ b, round: SES.round, reps: b.ex === 'hang' ? Math.round(stats.hold) : stats.reps, perfect: stats.perfect, kills: stats.kills, time: stats.time, kcal: runStatsKcal(), score, win, manual });
  if (SES.stop || !sesNext()) { finishSession(); return; }
  state = 'between'; SES.wait = SES.rest; center.mesh.visible = true; drawCenter(); boardDirty = true;
  betweenMenu();
}
function betweenMenu() {
  const r = SES.results[SES.results.length - 1], nx = sesNext(), nb = SES.blocks[nx.i];
  const m = openMenu([
    { t: 'title', text: `BLOQUE ${SES.idx + 1}/${SES.blocks.length} ${r.win ? 'SUPERADO' : 'TERMINADO'}${SES.rounds > 1 ? ` · VUELTA ${SES.round + 1}/${SES.rounds}` : ''}` },
    { t: 'text', text: `${blockLabel(r.b)}: ${r.reps} ${blockUnit(r.b)} · ${r.perfect} perfectas · ${r.score} puntos` },
    { t: 'text', text: `Siguiente${nx.r !== SES.round ? ` (empieza la vuelta ${nx.r + 1}/${SES.rounds})` : ''}: ${blockLabel(nb)}`, color: '#ffd166' },
    { t: 'btns', items: [{ label: 'Empezar ya', style: 'primary', onPress: () => nextBlock(false) }, { label: 'Repetir bloque', onPress: () => { SES.results.pop(); nextBlock(true); } }], h: 0.08 },
    { t: 'btns', items: [{ label: 'Terminar sesión', style: 'danger', onPress: finishSession }] }
  ]);
  m.rebuild = betweenMenu;
}
function sessionStep(dt) { // descanso entre bloques
  SES.wait -= dt; if (SES.wait <= 0) nextBlock(false);
}
function nextBlock(repeat) {
  hideMenu(); center.mesh.visible = false;
  if (repeat) applyBlock(SES.idx); else { const nx = sesNext(); if (!nx) { finishSession(); return; } SES.round = nx.r; applyBlock(nx.i); }
  beginRun();
}
function finishSession() {
  const R = SES.results, total = SES.blocks.length * SES.rounds, all = R.length === total && !SES.stop, rounds = SES.rounds;
  endSession(); hideMenu(); center.mesh.visible = false; state = 'end'; boardDirty = true; spRoundEnd();
  const tot = R.reduce((a, r) => ({ reps: a.reps + (r.b.ex === 'hang' ? 0 : r.reps), secs: a.secs + (r.b.ex === 'hang' ? r.reps : 0), time: a.time + r.time, kcal: a.kcal + r.kcal, score: a.score + r.score }), { reps: 0, secs: 0, time: 0, kcal: 0, score: 0 });
  const lines = R.slice(0, 6).map((r, i) => `${i + 1}. ${blockLabel(r.b)}${rounds > 1 ? ` (vuelta ${r.round + 1})` : ''}: ${r.reps} ${blockUnit(r.b)}${r.win ? '' : ' (sin acabar)'}`);
  if (R.length > 6) lines.push(`… y ${R.length - 6} bloques más`);
  if (all) SND.victory();
  // la misma ficha que al acabar una ronda, con el total de la sesión (y la lista de bloques debajo)
  const perf = R.reduce((a, r) => a + (r.perfect || 0), 0), won = R.filter(r => r.win).length, pr = tot.reps ? perf / tot.reps : 0;
  const S = { win: all, manual: !all, hang: !tot.reps && tot.secs > 0, got: tot.reps || tot.secs, unit: tot.reps ? 'repeticiones en la sesión' : 's colgado en la sesión', ex: `Sesión · ${SES.blocks.length} bloques${rounds > 1 ? ` × ${rounds} vueltas` : ''}`,
    sub: all ? (rounds > 1 ? `Las ${rounds} vueltas hechas` : 'Todos los bloques hechos') : `${R.length} de ${total} bloques`, pct: tot.reps ? Math.round(pr * 100) : null, stars: R.length ? 1 + (pr >= 0.5 ? 1 : 0) + (all && won === R.length ? 1 : 0) : 0,
    tiles: [[`${won}/${total}`, 'bloques superados'], [perf, 'perfectas'], [tot.secs ? `${tot.secs} s` : '—', 'colgado'], [`${Math.floor(tot.time / 60)}:${String(Math.round(tot.time % 60)).padStart(2, '0')}`, 'tiempo'], [`≈ ${Math.round(tot.kcal)}`, 'kcal'], [tot.score, 'puntos']],
    chips: [], today: progressLine(), lines };
  endMenu(all ? 'SESIÓN COMPLETADA' : 'SESIÓN TERMINADA', S);
}
// Devuelve los ajustes como estaban antes de la sesión
function endSession() {
  if (!SES.active) return;
  SES.active = false; SES.waves = null; Object.assign(settings, SES.orig); SES.orig = null;
  saveSettings(); onSettingChanged('mode'); onSettingChanged('exercise');
}
// Sesiones guardadas con nombre (en la página y en el juego; pasan también por el código a otro dispositivo)
const savedSessions = () => (store(SESS_KEY) || []).filter(x => x && x.name && Array.isArray(x.blocks));
function sessSave(name) {
  name = String(name || '').trim().slice(0, 40); if (!name || !SES.blocks.length) return false;
  const L = savedSessions(), i = L.findIndex(x => x.name.toLowerCase() === name.toLowerCase()), x = { name, date: Date.now(), rest: SES.rest, rounds: SES.rounds, blocks: JSON.parse(JSON.stringify(SES.blocks)) };
  if (i >= 0) L[i] = x; else { if (L.length >= SESS_MAX) return false; L.push(x); }
  store(SESS_KEY, L); SES.name = name; return true;
}
function sessLoad(i) { const x = savedSessions()[i]; if (!x) return false; SES.blocks = sesClean(x.blocks); if (isFinite(x.rest)) SES.rest = clamp(Math.round(x.rest), 0, 600); SES.rounds = roundsOf(x.rounds); SES.name = x.name; saveSession(); return true; }
function sessDelete(i) { const L = savedSessions(); L.splice(i, 1); store(SESS_KEY, L); }
function sessionsMenu(back) {
  const L = savedSessions(), rows = [{ t: 'title', text: 'SESIONES GUARDADAS' }, { t: 'text', text: L.length ? 'Elige una: sus bloques pasan a ser la sesión de ahora' : 'Aún no hay sesiones guardadas: en la página, arma una y pulsa Guardar sesión', color: '#a49fc8' }];
  L.forEach((x, i) => rows.push({ t: 'btns', items: [{ label: `${x.name} (${x.blocks.length} ${x.blocks.length === 1 ? 'bloque' : 'bloques'}${x.rounds > 1 ? ` × ${x.rounds} vueltas` : ''})`, onPress: () => { if (sessLoad(i)) { say(`Sesión «${x.name}» lista: pulsa EMPEZAR SESIÓN`, '#3cf0c6', 2); back(); } } }] }));
  rows.push({ t: 'btns', items: [{ label: 'Volver', onPress: back }] });
  const m = openMenu(rows, { accent: MC.prof }); m.rebuild = () => sessionsMenu(back);
}
function sessionRows() {
  if (SES.active) return [];
  const saved = savedSessions().length ? [{ t: 'btns', items: [{ label: `Sesiones guardadas (${savedSessions().length})  ▸`, accent: MC.prof, onPress: () => { const b = menu && menu.rebuild; sessionsMenu(b || lobbyMenu); } }] }] : [];
  if (!SES.blocks.length) return saved;
  const txt = SES.blocks.map(b => `${b.n} ${b.ex === 'hang' ? 's colgado' : EX_NAMES[b.ex].toLowerCase()}`).join(' → ');
  return [{ t: 'text', text: `Sesión: ${txt}${SES.rounds > 1 ? ` (× ${SES.rounds} vueltas)` : ''}`, color: '#ffd166' }, { t: 'btns', items: [{ label: `EMPEZAR SESIÓN (${SES.blocks.length} ${SES.blocks.length === 1 ? 'bloque' : 'bloques'}${SES.rounds > 1 ? ` × ${SES.rounds}` : ''}, ~${sessionMinutes()} min)`, style: 'primary', onPress: startSession }] }, ...saved];
}

/* ---------- Editor de la página ---------- */
// Ajustes propios del bloque (⚙): los del juego que valen para su modo y su ejercicio. Cada uno enseña el valor con que
// se jugará (el suyo propio, si no el de su perfil, si no el de tus ajustes); los propios llevan un punto y ↺ para quitarlos
function blockFields(b) {
  const keep = { mode: settings.mode, exercise: settings.exercise }; settings.mode = b.mode; settings.exercise = b.ex;
  try { return SCHEMA.filter(f => blockKeyOk(f.key) && fieldVisible(f) && f.type !== 'text'); } finally { Object.assign(settings, keep); }
}
function blockValue(b, k) {
  if (b.set && b.set[k] !== undefined) return b.set[k];
  if (b.rank) { const rv = rankVals(b.rank); if (rv[k] !== undefined) return rv[k]; } // (su rango, por encima de su perfil)
  const pp = blockProfPatch(b); return pp[k] !== undefined ? pp[k] : settings[k];
}
function sesSetHTML(b, i) {
  const F = blockFields(b), groups = BLOCK_GROUPS.filter(g => F.some(f => f.g === g));
  let h = `<div class="sesset" data-i="${i}"><p class="note">Ajustes de este bloque (${escS(EX_NAMES[b.ex])} · ${escS(MODE_NAMES[b.mode])}): lo que cambies aquí vale solo para él, por encima de ${b.prof ? `su perfil «${escS(b.prof)}»` : 'tus ajustes'}. • = propio de este bloque.</p>`;
  for (const g of groups) {
    h += `<details class="bgroup"${g === 'partida' || g === 'ejercicio' ? ' open' : ''}><summary>${escS(GROUP_NAMES[g])}</summary><div class="bfields">`;
    for (const f of F.filter(x => x.g === g)) {
      const v = blockValue(b, f.key), own = b.set && b.set[f.key] !== undefined, id = `b${i}-${f.key}`;
      let ctl = '';
      if (f.type === 'num') ctl = `<input type="number" id="${id}" data-bk="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" value="${v}"><span class="unit">${escS(f.unit || '')}</span>`;
      else if (f.type === 'multi') { const on = new Set(String(v).split(',')); ctl = `<span class="bmulti">${f.opts.map(o => `<label><input type="checkbox" data-bk="${f.key}" value="${o[0]}"${on.has(o[0]) ? ' checked' : ''}>${escS(o[1])}</label>`).join('')}</span>`; }
      else { const opts = f.type === 'toggle' ? [[1, 'Sí'], [0, 'No']] : f.opts; ctl = `<select id="${id}" data-bk="${f.key}">${opts.map(o => `<option value="${o[0]}"${String(o[0]) === String(v) ? ' selected' : ''}>${escS(o[1])}</option>`).join('')}</select>`; }
      h += `<div class="bfield${own ? ' own' : ''}"><label for="${id}">${own ? '• ' : ''}${escS(f.short || f.label)}</label>${ctl}${own ? `<button type="button" class="btn tiny" data-a="bk-rm" data-k="${f.key}" title="Quitar: como su perfil o tus ajustes">↺</button>` : ''}</div>`;
    }
    h += '</div></details>';
  }
  return h + `<div class="actions">${b.set ? '<button type="button" class="btn small" data-a="bk-clear">Quitar todos sus ajustes propios</button>' : ''}<button type="button" class="btn small alt" data-a="bk-close">Listo</button></div></div>`;
}
function sesSetChange(el) {
  const b = SES.blocks[SES.setOpen], k = el.dataset && el.dataset.bk; if (!b || !k) return;
  const f = FIELD[k]; let v;
  if (f.type === 'multi') v = [...el.closest('.bmulti').querySelectorAll('input:checked')].map(x => x.value).join(',');
  else v = el.value;
  v = clampSetting(f, v); b.set = Object.assign(b.set || {}, { [k]: v }); saveSession(); renderSession();
}
function sesSetClick(btn) {
  const b = SES.blocks[SES.setOpen]; if (!b) return;
  if (btn.dataset.a === 'bk-rm' && b.set) { delete b.set[btn.dataset.k]; if (!Object.keys(b.set).length) delete b.set; }
  else if (btn.dataset.a === 'bk-clear') delete b.set;
  else if (btn.dataset.a === 'bk-close') SES.setOpen = -1;
  saveSession(); renderSession();
}
// Sesiones guardadas, en la página
function renderSessions() {
  const host = $('#sessSaved'); if (!host) return;
  const L = savedSessions();
  host.innerHTML = L.length ? L.map((x, i) => `<div class="profrow"><div><b>${escS(x.name)}</b><span>${x.blocks.length} ${x.blocks.length === 1 ? 'bloque' : 'bloques'}: ${escS(x.blocks.slice(0, 4).map(b => `${b.n} ${(EX_SHORT[b.ex] || EX_NAMES[b.ex] || b.ex).toLowerCase()}`).join(' → '))}${x.blocks.length > 4 ? '…' : ''}</span></div>
    <button class="btn small alt" data-s="load" data-i="${i}">Cargar</button><button class="btn small" data-s="del" data-i="${i}">Borrar</button></div>`).join('') : '<p class="note">Aún no hay sesiones guardadas.</p>';
  const inp = $('#sessName'); if (inp && document.activeElement !== inp && SES.name && !inp.value) inp.value = SES.name;
}
// Música del bloque: eliges una de tus listas, marcas canciones (puedes cambiar de lista y seguir añadiendo) y quedan
// en el bloque, en ese orden; arriba, las elegidas (✕ para quitarlas)
const escS = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function sesMusicHTML(b, i) {
  const sel = b.music || [], on = new Set(sel.map(t => t.uri));
  let h = `<div class="sesmusic" data-i="${i}"><p class="note">Canciones del bloque ${i + 1}: suenan en este orden, en bucle, mientras dura el bloque (de una o de varias listas; hasta ${MUSIC_MAX}).</p>`;
  h += sel.length ? `<div class="chips">${sel.map((t, k) => `<span class="chip">${k + 1}. ${escS(t.name)}<button class="btn tiny" data-a="mrm" data-k="${k}" aria-label="Quitar ${escS(t.name)}">✕</button></span>`).join('')}<button class="btn small" data-a="mclear">Quitar todas</button></div>` : '<p class="hint">Aún sin canciones: suena lo que estuviera sonando.</p>';
  if (!spConnected()) return h + '<p class="hint">Conecta Spotify (arriba, en Música) para elegir canciones.</p></div>';
  if (!SP.mine) return h + `<p class="status">${escS(SES.mErr || 'Cargando tus listas…')}</p></div>`;
  // tus listas (y las que te gustan), como botones de las líneas que haga falta; al abrir una, solo sus canciones
  const L = spPickable();
  if (!SES.mList) h += `<div class="lpick" role="listbox" aria-label="Elige una lista de Spotify">${L.map(l => `<button type="button" class="lp" data-a="mlist" data-id="${l.id}" role="option">${escS(l.name)} ▸</button>`).join('')}</div>`;
  else {
    const l = L.find(x => x.id === SES.mList) || { name: '' }, T = SP.trk && SP.trk[SES.mList];
    h += `<div class="spin"><button type="button" class="btn small" data-a="mback">← Tus listas</button><b>${escS(l.name)}</b></div>`;
    if (!T) h += `<p class="status">${escS(SES.mErr || 'Cargando sus canciones…')}</p>`;
    else { const F = spFavs(); h += T.length ? `<div class="tracks">${spFavFirst(T).map(t => `<div class="sptrk">${spFavBtn(t.uri, F)}<label><input type="checkbox" data-m="trk" data-uri="${escS(t.uri)}"${on.has(t.uri) ? ' checked' : ''}><span>${escS(t.name)}<small> — ${escS(t.by)}</small></span></label></div>`).join('')}</div>` : '<p class="hint">Aquí no hay canciones que se puedan poner.</p>'; } // (tus favoritas, primero)
  }
  return h + '</div>';
}
function sesMusicLoad() {
  if (!spConnected()) return;
  if (!SP.mine) spMyLists().then(l => { SP.mine = l; SES.mErr = ''; renderSession(); }).catch(e => { SES.mErr = 'No se pudieron cargar tus listas: ' + spErrText(e); renderSession(); });
  else if (SES.mList && !(SP.trk && SP.trk[SES.mList])) spListTracks(SES.mList).then(() => { SES.mErr = ''; renderSession(); }).catch(e => { SES.mErr = /NOT_YOURS|LIBRARY/.test(e.message) ? spErrText(e) : 'No se pudieron cargar sus canciones: ' + spErrText(e); renderSession(); });
}
function sesMusicChange(el) {
  const b = SES.blocks[SES.musicOpen]; if (!b) return;
  if (el.dataset.m === 'trk') {
    const T = (SP.trk && SP.trk[SES.mList]) || [], t = T.find(x => x.uri === el.dataset.uri); if (!t) return;
    const sel = b.music || []; b.music = el.checked ? (sel.some(x => x.uri === t.uri) || sel.length >= MUSIC_MAX ? sel : sel.concat({ ...t })) : sel.filter(x => x.uri !== t.uri);
    if (!b.music.length) delete b.music; saveSession(); renderSession();
  }
}
function sesMusicClick(btn) {
  const b = SES.blocks[SES.musicOpen]; if (!b) return;
  if (btn.dataset.a === 'mlist') { SES.mList = btn.dataset.id; SES.mErr = ''; renderSession(); sesMusicLoad(); return; }
  if (btn.dataset.a === 'mback') { SES.mList = ''; SES.mErr = ''; renderSession(); return; }
  if (btn.dataset.a === 'fav') { spFavToggle(btn.dataset.fav); renderSession(); spListsPage(); return; }
  if (btn.dataset.a === 'mrm') { b.music.splice(+btn.dataset.k, 1); if (!b.music.length) delete b.music; }
  else if (btn.dataset.a === 'mclear') delete b.music;
  saveSession(); renderSession();
}
const SES_EXAMPLE = [{ mode: 'arcs', ex: 'squat', n: 40 }, { mode: 'combat', ex: 'plank1', n: 30, foes: 'robots' }, { mode: 'combat', ex: 'pushup', n: 30, foes: 'robots' }];
function sesOpts(list, sel) { return list.map(([v, l]) => `<option value="${v}"${v === sel ? ' selected' : ''}>${l}</option>`).join(''); }
// Iconos de los botones de cada bloque (dibujados: se ven igual en cualquier navegador)
const SES_ICON = {
  grip: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></g></svg>',
  dup: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 15V6a1 1 0 0 1 1-1h9" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  del: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12M10 7V5h4v2M8 7l1 12h6l1-12" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  set: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8 3.5-2.1-.6-.5-1.3 1-1.9-1.6-1.6-1.9 1-1.3-.5L13 4h-2l-.6 2.1-1.3.5-1.9-1-1.6 1.6 1 1.9-.5 1.3L4 11v2l2.1.6.5 1.3-1 1.9 1.6 1.6 1.9-1 1.3.5.6 2.1h2l.6-2.1 1.3-.5 1.9 1 1.6-1.6-1-1.9.5-1.3L20 13z" fill="currentColor"/></svg>',
  music: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17V6l10-2v11" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="7" cy="17" r="2.5" fill="currentColor"/><circle cx="17" cy="15" r="2.5" fill="currentColor"/></svg>',
  rank: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10l7-4 7 4M5 16l7-4 7 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/></svg>'
};
// Los galones de cada rango, como en el juego (drawRank): del recluta al sargento, galones; luego, estrellas
function rankSvg(i) {
  const S = 20, c = 12, w = S * 0.14, chev = dy => `<path d="M${c - S * 0.44} ${c + dy + S * 0.17}L${c} ${c + dy - S * 0.17}L${c + S * 0.44} ${c + dy + S * 0.17}"/>`;
  let g = '';
  if (i <= 3) {
    const n = Math.min(3, i + 1), up = i === 3 ? S * 0.14 : 0; for (let k = 0; k < n; k++) g += chev((k - (n - 1) / 2) * S * 0.3 - up);
    if (i === 3) { const r = S * 0.6, cy = c - S * 0.32, a0 = 0.28 * Math.PI, a1 = 0.72 * Math.PI; g += `<path d="M${c + r * Math.cos(a0)} ${cy + r * Math.sin(a0)}A${r} ${r} 0 0 1 ${c + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}"/>`; }
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${g}</g></svg>`;
  }
  const n = i - 3, R = S * 0.24 * [1.7, 1.25, 1][n - 1], star = sx => { let d = ''; for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rad = (k % 2 ? 0.45 : 1) * R; d += `${k ? 'L' : 'M'}${(c + sx + Math.cos(a) * rad).toFixed(2)} ${(c + Math.sin(a) * rad).toFixed(2)}`; } return `<path d="${d}Z"/>`; };
  for (let k = 0; k < n; k++) g += star((k - (n - 1) / 2) * S * (n === 2 ? 0.52 : 0.46)); // (las pocas, más grandes: se ven igual de bien)
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="${n === 3 ? '#ffd166' : 'currentColor'}">${g}</g></svg>`;
}
const sesIB = (a, i, label, icon, extra = '', on = false, badge = '') => `<button type="button" class="ib${on ? ' on' : ''}" data-a="${a}" aria-label="${label} ${i + 1}" title="${label}"${extra}>${icon}${badge ? `<span class="badge">${badge}</span>` : ''}</button>`;
// Cada bloque, en una sola fila: modo, ejercicio (un botón que abre la lista debajo; nombres de hasta dos líneas), enemigos,
// cantidad, perfil y los iconos: rango, ajustes propios, música, duplicar y quitar. Se cambian de sitio arrastrándolos por el asa
// de la izquierda (con el número)
function renderSession() {
  const host = $('#sesList'); if (!host) return;
  host.innerHTML = SES.blocks.length ? SES.blocks.map((b, i) => `<div class="sesrow" data-i="${i}"><button type="button" class="sesgrip" aria-label="Bloque ${i + 1}: arrástralo para cambiarlo de sitio (o flechas arriba y abajo)" title="Arrastra para cambiar de sitio">${SES_ICON.grip}<span class="sesn">${i + 1}</span></button>
    <select data-f="mode" aria-label="Modo del bloque ${i + 1}">${sesOpts(Object.entries(MODE_NAMES), b.mode)}</select>
    <button type="button" class="expick${SES.exOpen === i ? ' on' : ''}" data-a="ex" aria-label="Ejercicio del bloque ${i + 1}" aria-expanded="${SES.exOpen === i}" title="${escS(EX_NAMES[b.ex])}"><span>${escS(EX_NAMES[b.ex])}</span></button>
    ${b.mode === 'combat' ? `<select data-f="foes" aria-label="Enemigos del bloque ${i + 1}">${sesOpts(FOE_CATS, b.foes)}</select>` : ''}
    <span class="sesn2"><input type="number" data-f="n" min="1" max="500" step="1" value="${b.n}" aria-label="Cantidad del bloque ${i + 1}"><span class="unit">${blockUnit(b)}</span></span>
    <select data-f="prof" class="prof" aria-label="Perfil del bloque ${i + 1}" title="Perfil del bloque"><option value="">Sin perfil</option>${profiles().map(p => `<option value="${escS(p.name)}"${p.name === b.prof ? ' selected' : ''}>${escS(p.name)}</option>`).join('')}${b.prof && !profiles().some(p => p.name === b.prof) ? `<option value="${escS(b.prof)}" selected>${escS(b.prof)} (no está)</option>` : ''}</select>
    <span class="ibs">${sesIB('rank', i, b.rank ? `Rango ${rankName(b.rank)} en el bloque` : 'Rango del bloque (el tuyo)', b.rank ? rankSvg(rankIdx(b.rank)) : SES_ICON.rank, '', !!b.rank || SES.rankOpen === i)}${sesIB('set', i, 'Ajustes propios del bloque', SES_ICON.set, '', !!b.set || SES.setOpen === i, b.set ? Object.keys(b.set).length : '')}${sesIB('music', i, 'Música del bloque', SES_ICON.music, '', !!(b.music || []).length || SES.musicOpen === i, (b.music || []).length || '')}${sesIB('dup', i, 'Duplicar el bloque', SES_ICON.dup, SES.blocks.length >= 20 ? ' disabled' : '')}${sesIB('del', i, 'Quitar el bloque', SES_ICON.del)}</span></div>${SES.exOpen === i ? sesExHTML(b, i) : ''}${SES.rankOpen === i ? sesRankHTML(b, i) : ''}${SES.setOpen === i ? sesSetHTML(b, i) : ''}${SES.musicOpen === i ? sesMusicHTML(b, i) : ''}`).join('')
    : '<p class="hint">Todavía no hay bloques. Añade uno o carga el ejemplo.</p>';
  const rest = $('#sesRest'); if (rest && document.activeElement !== rest) rest.value = SES.rest;
  const rounds = $('#sesRounds'); if (rounds && document.activeElement !== rounds) rounds.value = SES.rounds;
  const sum = $('#sesSummary');
  if (sum) sum.innerHTML = SES.blocks.length ? `${SES.blocks.length} ${SES.blocks.length === 1 ? 'bloque' : 'bloques'}${SES.rounds > 1 ? ` × ${SES.rounds} vueltas` : ''}, unos <strong>${sessionMinutes()} min</strong> con descansos. En el juego, pulsa EMPEZAR SESIÓN en el menú.` : '';
}
// (la lista de ejercicios del bloque, debajo de su fila: cada nombre en las líneas que haga falta)
// El rango del bloque: el tuyo (el de Ajustes) o uno para él solo, con sus galones
function sesRankHTML(b, i) {
  return `<div class="sesrank lpick" data-i="${i}" role="listbox" aria-label="Rango del bloque ${i + 1}"><button type="button" class="lp${b.rank ? '' : ' on'}" data-a="rkset" data-r="" role="option" aria-selected="${!b.rank}">El tuyo (${escS(rankName())})</button>${RANKS.map(([r, n], k) => `<button type="button" class="lp rk${r === b.rank ? ' on' : ''}" data-a="rkset" data-r="${r}" role="option" aria-selected="${r === b.rank}">${rankSvg(k)}${escS(n)}</button>`).join('')}</div>`;
}
function sesExHTML(b, i) {
  return `<div class="sesex lpick" data-i="${i}" role="listbox" aria-label="Ejercicio del bloque ${i + 1}">${Object.keys(EX_NAMES).filter(x => blockOk(b.mode, x)).map(x => `<button type="button" class="lp${x === b.ex ? ' on' : ''}" data-a="exset" data-x="${x}" role="option" aria-selected="${x === b.ex}">${escS(EX_NAMES[x])}</button>`).join('')}</div>`;
}
// Duplicar un bloque: la copia, justo debajo, con todo (perfil, ajustes propios y canciones), lista para editarla
function sesDup(i) {
  if (SES.blocks.length >= 20 || !SES.blocks[i]) return false;
  SES.blocks.splice(i + 1, 0, JSON.parse(JSON.stringify(SES.blocks[i]))); SES.exOpen = SES.rankOpen = SES.setOpen = SES.musicOpen = -1; saveSession(); renderSession(); return true;
}
// Cambiar un bloque de sitio (al soltarlo tras arrastrarlo, o con las flechas)
function sesMove(from, to) {
  to = clamp(to, 0, SES.blocks.length - 1); if (from === to || !SES.blocks[from]) return false;
  SES.blocks.splice(to, 0, SES.blocks.splice(from, 1)[0]); SES.exOpen = SES.rankOpen = SES.setOpen = SES.musicOpen = -1; saveSession(); renderSession(); return true;
}
// Arrastrar por el asa (ratón, dedo o lápiz): la fila sigue al puntero y una línea marca dónde caerá; al soltar, se mueve allí
function sesDragInit(host) {
  let D = null;
  const clear = () => { if (!D) return; D.row.classList.remove('drag'); D.row.style.transform = ''; for (const r of D.rows) r.classList.remove('dropb', 'dropa'); clearInterval(D.scroll); D = null; };
  const gap = y => D.mids.filter(m => m < y + scrollY).length; // (el hueco entre filas donde cae, por la mitad de cada una al empezar)
  const mark = () => {
    const k = gap(D.y), last = D.rows.length - 1; D.k = k;
    D.rows.forEach((r, j) => { r.classList.toggle('dropb', j === k && k !== D.from && k !== D.from + 1); r.classList.toggle('dropa', j === last && k === last + 1 && D.from !== last); });
    D.row.style.transform = `translateY(${D.y - D.y0 + scrollY - D.sy}px)`;
  };
  host.addEventListener('pointerdown', ev => {
    const g = ev.target.closest && ev.target.closest('.sesgrip'); if (!g || ev.button > 0 || SES.blocks.length < 2) return;
    ev.preventDefault(); clear();
    const row = g.closest('.sesrow'), rows = [...host.querySelectorAll('.sesrow')];
    D = { row, rows, from: rows.indexOf(row), k: -1, y0: ev.clientY, y: ev.clientY, sy: scrollY, id: ev.pointerId, mids: rows.map(r => { const R = r.getBoundingClientRect(); return R.top + R.height / 2 + scrollY; }) };
    try { g.setPointerCapture(ev.pointerId); } catch (e) {}
    row.classList.add('drag');
    // cerca del borde de la ventana, la página se desplaza sola (para llevarlo lejos en una sesión larga)
    D.scroll = setInterval(() => { if (!D) return; const e = 50, v = D.y < e ? -12 : D.y > innerHeight - e ? 12 : 0; if (v) { scrollBy(0, v); mark(); } }, 30);
  });
  host.addEventListener('pointermove', ev => { if (D && ev.pointerId === D.id) { D.y = ev.clientY; mark(); } });
  host.addEventListener('pointerup', ev => {
    if (!D || ev.pointerId !== D.id) return;
    const { from, k } = D; clear();
    if (k >= 0) sesMove(from, k > from ? k - 1 : k);
  });
  host.addEventListener('pointercancel', clear);
  host.addEventListener('keydown', ev => {
    const g = ev.target.closest && ev.target.closest('.sesgrip'); if (!g || (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown')) return;
    ev.preventDefault(); const i = +g.closest('.sesrow').dataset.i, to = i + (ev.key === 'ArrowUp' ? -1 : 1);
    if (sesMove(i, to)) { const n = host.querySelector(`.sesrow[data-i="${to}"] .sesgrip`); if (n) n.focus(); }
  });
}
function sesSetEx(b, x) { const wasHang = b.ex === 'hang'; b.ex = x; if (wasHang !== (b.ex === 'hang')) b.n = b.ex === 'hang' ? 30 : 20; }
function sesInitPage() {
  const host = $('#sesList');
  sesDragInit(host);
  host.addEventListener('change', ev => {
    if (ev.target.closest && ev.target.closest('.sesmusic')) { sesMusicChange(ev.target); return; }
    if (ev.target.closest && ev.target.closest('.sesset')) { sesSetChange(ev.target); return; }
    const row = ev.target.closest && ev.target.closest('.sesrow'); if (!row) return;
    const b = SES.blocks[+row.dataset.i], f = ev.target.dataset.f; if (!b) return;
    if (f === 'mode') { b.mode = ev.target.value; if (!blockOk(b.mode, b.ex)) b.ex = Object.keys(EX_NAMES).find(x => blockOk(b.mode, x)); delete b.foes; delete b.aim; Object.assign(b, blockExtra(b)); }
    else if (f === 'foes') b.foes = foeCat(ev.target.value) || 'robots';
    else if (f === 'ex') sesSetEx(b, ev.target.value);
    else if (f === 'n') b.n = clamp(Math.round(+ev.target.value) || 1, 1, 500);
    else if (f === 'prof') { if (ev.target.value) b.prof = ev.target.value; else delete b.prof; }
    saveSession(); renderSession();
  });
  host.addEventListener('click', ev => {
    const btn = ev.target.closest && ev.target.closest('button[data-a]'); if (!btn) return;
    if (btn.closest('.sesmusic')) { sesMusicClick(btn); return; }
    if (btn.closest('.sesset')) { sesSetClick(btn); return; }
    if (btn.closest('.sesrank')) { const b = SES.blocks[+btn.closest('.sesrank').dataset.i]; if (b) { if (rankOk(btn.dataset.r)) b.rank = btn.dataset.r; else delete b.rank; SES.rankOpen = -1; saveSession(); renderSession(); } return; }
    if (btn.closest('.sesex')) { const b = SES.blocks[+btn.closest('.sesex').dataset.i]; if (b && btn.dataset.x) { sesSetEx(b, btn.dataset.x); SES.exOpen = -1; saveSession(); renderSession(); } return; }
    const i = +btn.closest('.sesrow').dataset.i;
    if (btn.dataset.a === 'ex') { SES.exOpen = SES.exOpen === i ? -1 : i; renderSession(); return; }
    if (btn.dataset.a === 'rank') { SES.rankOpen = SES.rankOpen === i ? -1 : i; renderSession(); return; }
    if (btn.dataset.a === 'dup') { sesDup(i); return; }
    if (btn.dataset.a === 'music') { SES.musicOpen = SES.musicOpen === i ? -1 : i; renderSession(); if (SES.musicOpen === i) sesMusicLoad(); return; }
    if (btn.dataset.a === 'set') { SES.setOpen = SES.setOpen === i ? -1 : i; renderSession(); return; }
    if (btn.dataset.a !== 'del') return;
    SES.blocks.splice(i, 1);
    SES.exOpen = SES.rankOpen = SES.setOpen = SES.musicOpen = -1; // (los paneles abiertos irían a otro bloque)
    saveSession(); renderSession();
  });
  $('#btnSesAdd').addEventListener('click', () => { if (SES.blocks.length >= 20) return; const ex = blockOk(settings.mode, settings.exercise) ? settings.exercise : 'squat'; const b = { mode: blockOk(settings.mode, ex) ? settings.mode : 'combat', ex, n: ex === 'hang' ? 30 : 20 }; SES.blocks.push({ ...b, ...blockExtra(b) }); saveSession(); renderSession(); });
  $('#btnSesExample').addEventListener('click', () => { SES.blocks = SES_EXAMPLE.map(b => ({ ...b })); saveSession(); renderSession(); });
  $('#btnSesClear').addEventListener('click', () => { SES.blocks = []; saveSession(); renderSession(); });
  $('#sesRest').addEventListener('change', ev => { SES.rest = clamp(Math.round(+ev.target.value) || 0, 0, 600); saveSession(); renderSession(); });
  $('#sesRounds').addEventListener('change', ev => { SES.rounds = roundsOf(ev.target.value); saveSession(); renderSession(); });
  const ss = $('#btnSessSave'), sh = $('#sessSaved'), st = $('#sessStatus');
  if (ss) ss.addEventListener('click', () => { const n = $('#sessName').value; const ok = sessSave(n); st.textContent = ok ? `Guardada como «${n.trim()}».` : !SES.blocks.length ? 'Añade algún bloque antes de guardar.' : !n.trim() ? 'Escribe un nombre.' : `Como mucho ${SESS_MAX} sesiones: borra alguna.`; renderSessions(); });
  if (sh) sh.addEventListener('click', ev => { const b = ev.target.closest && ev.target.closest('button[data-s]'); if (!b) return; const i = +b.dataset.i, x = savedSessions()[i]; if (!x) return;
    if (b.dataset.s === 'load') { sessLoad(i); $('#sessName').value = x.name; st.textContent = `Cargada «${x.name}».`; renderSession(); }
    else if (typeof confirm !== 'function' || confirm(`¿Borrar la sesión «${x.name}»?`)) { sessDelete(i); st.textContent = `Borrada «${x.name}».`; }
    renderSessions(); });
  renderSession(); renderSessions();
}
