
/* =================== SESIÓN DE ENTRENAMIENTO: BLOQUES ENCADENADOS =================== */
// Una sesión es una lista de bloques {mode, ex, n} (en Combate, también foes: robots, voladores o mezcla): n repeticiones (en colgado, segundos). Cada bloque se juega
// como una partida repartida en oleadas de unas 10 repeticiones; entre bloques hay descanso y al final, un resumen.
// Mientras dura, la sesión cambia modo, ejercicio y oleadas sin tocar los ajustes guardados.
const SES_KEY = 'reparena3-session';
const SES = { blocks: [], rest: 60, active: false, idx: 0, orig: null, waves: null, results: [], wait: 0, stop: false };
const SES_KEYS = ['mode', 'exercise', 'waves', 'repsWave', 'repsInc', 'hangTime', 'hangInc', 'foesGate', 'foesHatch', 'foesFly', 'aim'];
const blockOk = exOk;
const validBlock = b => b && MODE_NAMES[b.mode] && EX_NAMES[b.ex] && blockOk(b.mode, b.ex) && isFinite(b.n) && b.n >= 1;
(function loadSession() {
  const s = store(SES_KEY) || {};
  // los bloques de Asalto y Enjambre pasan a Combate con sus enemigos y su puntería
  const mig = b => b && LEGACY_MODES[b.mode] ? { ...b, mode: 'combat', ...LEGACY_MODES[b.mode] } : b;
  if (Array.isArray(s.blocks)) SES.blocks = s.blocks.map(mig).filter(validBlock).slice(0, 20).map(b => ({ mode: b.mode, ex: b.ex, n: clamp(Math.round(b.n), 1, 500), ...blockExtra(b) }));
  if (isFinite(s.rest)) SES.rest = clamp(Math.round(s.rest), 0, 600);
})();
// En Combate el bloque guarda sus enemigos (y, si venía de Enjambre o Asalto, su puntería)
// (foes: por tierra, voladores o mezcla, sobre los enemigos elegidos en Ajustes → Enemigos; por defecto, lo que haya ahí)
const foeCat = v => FOE_CATS.some(o => o[0] === v) ? v : null;
const foeCatNow = () => { const g = foeList('foesGate').length || foeList('foesHatch').length, f = foeList('foesFly').length; return g && f ? 'mix' : f ? 'flyers' : 'robots'; };
function blockExtra(b) { if (b.mode !== 'combat') return {}; const o = { foes: foeCat(b.foes) || foeCatNow() }; if (b.aim) o.aim = clampSetting(FIELD.aim, b.aim); return o; }
// Lo que el bloque cambia en los ajustes mientras se juega
function blockSettings(b) { const { foes: c, ...o } = blockExtra(b); return c ? Object.assign(o, foeCatPatch(c)) : o; }
function saveSession() { store(SES_KEY, { blocks: SES.blocks, rest: SES.rest }); }
const blockUnit = b => b.ex === 'hang' ? 's' : 'reps';
function blockLabel(b) { const c = b.foes && FOE_CATS.find(o => o[0] === b.foes); return `${b.n} ${b.ex === 'hang' ? 's de colgado' : EX_NAMES[b.ex].toLowerCase()} · ${MODE_NAMES[b.mode]}${c ? ` (${c[1].toLowerCase()})` : ''}`; }
// Reparte n en oleadas de unas `per` repeticiones, con el total exacto
function splitWaves(n, per) { const w = Math.max(1, Math.round(n / per)), base = Math.floor(n / w), out = []; for (let i = 0; i < w; i++) out.push(base + (i < n - base * w ? 1 : 0)); return out; }
function sessionMinutes() {
  let t = SES.rest * Math.max(0, SES.blocks.length - 1);
  for (const b of SES.blocks) { const w = splitWaves(b.n, b.ex === 'hang' ? 25 : 10); t += (b.ex === 'hang' ? b.n : b.n * (b.mode === 'arcs' ? 60 / settings.arcRate : repTimeOf(b.ex, b.mode))) + settings.rest * (w.length - 1); }
  return Math.max(1, Math.round(t / 60));
}

/* ---------- Durante el juego ---------- */
function applyBlock(i) {
  const b = SES.blocks[i]; SES.idx = i;
  SES.waves = splitWaves(b.n, b.ex === 'hang' ? 25 : 10);
  Object.assign(settings, { mode: b.mode, exercise: b.ex, waves: SES.waves.length, repsWave: clamp(SES.waves[0], 3, 150), repsInc: 0, hangTime: clamp(SES.waves[0], 5, 300), hangInc: 0 }, blockSettings(b));
  onSettingChanged('mode'); onSettingChanged('exercise');
}
function startSession() {
  if (!SES.blocks.length) return;
  // los bloques de barras necesitan su aparato colocado
  if (!preview) for (const b of SES.blocks) if (b.mode === 'bars' && !EQ.xr[b.ex === 'row' ? 'dip' : 'door'].set) {
    setSetting('mode', 'bars'); setSetting('exercise', b.ex); startPlace(lobbyMenu, `Para la sesión, coloca ${eqName().the}`); return;
  }
  SES.orig = {}; SES_KEYS.forEach(k => { SES.orig[k] = settings[k]; });
  Object.assign(SES, { active: true, results: [], stop: false });
  applyBlock(0); beginRun();
}
// Se llama al terminar la partida de un bloque (en lugar del menú de fin)
function sessionBlockDone(win, manual) {
  const b = SES.blocks[SES.idx];
  SES.results.push({ b, reps: b.ex === 'hang' ? Math.round(stats.hold) : stats.reps, perfect: stats.perfect, kills: stats.kills, time: stats.time, kcal: runStatsKcal(), score, win, manual });
  if (SES.stop || SES.idx + 1 >= SES.blocks.length) { finishSession(); return; }
  state = 'between'; SES.wait = SES.rest; center.mesh.visible = true; drawCenter(); boardDirty = true;
  betweenMenu();
}
function betweenMenu() {
  const r = SES.results[SES.results.length - 1], nb = SES.blocks[SES.idx + 1];
  const m = openMenu([
    { t: 'title', text: `BLOQUE ${SES.idx + 1}/${SES.blocks.length} ${r.win ? 'SUPERADO' : 'TERMINADO'}` },
    { t: 'text', text: `${blockLabel(r.b)}: ${r.reps} ${blockUnit(r.b)} · ${r.perfect} perfectas · ${r.score} puntos` },
    { t: 'text', text: `Siguiente: ${blockLabel(nb)}`, color: '#ffd166' },
    { t: 'btns', items: [{ label: 'Empezar ya', style: 'primary', onPress: () => nextBlock(false) }, { label: 'Repetir bloque', onPress: () => { SES.results.pop(); nextBlock(true); } }], h: 0.08 },
    { t: 'btns', items: [{ label: 'Terminar sesión', style: 'danger', onPress: finishSession }] }
  ]);
  m.rebuild = betweenMenu;
}
function sessionStep(dt) { // descanso entre bloques
  SES.wait -= dt; if (SES.wait <= 0) nextBlock(false);
}
function nextBlock(repeat) { hideMenu(); center.mesh.visible = false; applyBlock(repeat ? SES.idx : SES.idx + 1); beginRun(); }
function finishSession() {
  const R = SES.results, all = R.length === SES.blocks.length && !SES.stop;
  endSession(); hideMenu(); center.mesh.visible = false; state = 'end'; boardDirty = true;
  const tot = R.reduce((a, r) => ({ reps: a.reps + (r.b.ex === 'hang' ? 0 : r.reps), secs: a.secs + (r.b.ex === 'hang' ? r.reps : 0), time: a.time + r.time, kcal: a.kcal + r.kcal, score: a.score + r.score }), { reps: 0, secs: 0, time: 0, kcal: 0, score: 0 });
  const lines = R.slice(0, 6).map((r, i) => `${i + 1}. ${blockLabel(r.b)}: ${r.reps} ${blockUnit(r.b)}${r.win ? '' : ' (sin acabar)'}`);
  if (R.length > 6) lines.push(`… y ${R.length - 6} bloques más`);
  lines.push(`Total: ${tot.reps} repeticiones${tot.secs ? ` y ${tot.secs} s colgado` : ''} · ${Math.floor(tot.time / 60)}:${String(Math.round(tot.time % 60)).padStart(2, '0')} · ≈ ${Math.round(tot.kcal)} kcal · ${tot.score} puntos`);
  if (progressLine()) lines.push(progressLine());
  if (all) SND.victory();
  endMenu(all ? 'SESIÓN COMPLETADA' : 'SESIÓN TERMINADA', lines);
}
// Devuelve los ajustes como estaban antes de la sesión
function endSession() {
  if (!SES.active) return;
  SES.active = false; SES.waves = null; Object.assign(settings, SES.orig); SES.orig = null;
  saveSettings(); onSettingChanged('mode'); onSettingChanged('exercise');
}
function sessionRows() {
  if (!SES.blocks.length || SES.active) return [];
  const txt = SES.blocks.map(b => `${b.n} ${b.ex === 'hang' ? 's colgado' : EX_NAMES[b.ex].toLowerCase()}`).join(' → ');
  return [{ t: 'text', text: `Sesión: ${txt}`, color: '#ffd166' }, { t: 'btns', items: [{ label: `EMPEZAR SESIÓN (${SES.blocks.length} ${SES.blocks.length === 1 ? 'bloque' : 'bloques'}, ~${sessionMinutes()} min)`, style: 'primary', onPress: startSession }] }];
}

/* ---------- Editor de la página ---------- */
const SES_EXAMPLE = [{ mode: 'arcs', ex: 'squat', n: 40 }, { mode: 'combat', ex: 'plank1', n: 30, foes: 'robots' }, { mode: 'combat', ex: 'pushup', n: 30, foes: 'robots' }];
function sesOpts(list, sel) { return list.map(([v, l]) => `<option value="${v}"${v === sel ? ' selected' : ''}>${l}</option>`).join(''); }
function renderSession() {
  const host = $('#sesList'); if (!host) return;
  host.innerHTML = SES.blocks.length ? SES.blocks.map((b, i) => `<div class="sesrow" data-i="${i}"><span class="sesn">${i + 1}</span>
    <select data-f="mode" aria-label="Modo del bloque ${i + 1}">${sesOpts(Object.entries(MODE_NAMES), b.mode)}</select>
    <select data-f="ex" aria-label="Ejercicio del bloque ${i + 1}">${sesOpts(Object.entries(EX_NAMES).filter(([x]) => blockOk(b.mode, x)), b.ex)}</select>
    ${b.mode === 'combat' ? `<select data-f="foes" aria-label="Enemigos del bloque ${i + 1}">${sesOpts(FOE_CATS, b.foes)}</select>` : ''}
    <input type="number" data-f="n" min="1" max="500" step="1" value="${b.n}" aria-label="Cantidad del bloque ${i + 1}"><span class="unit">${blockUnit(b)}</span>
    <button class="btn small" data-a="up"${i ? '' : ' disabled'} aria-label="Subir el bloque ${i + 1}">Subir</button><button class="btn small" data-a="del" aria-label="Quitar el bloque ${i + 1}">Quitar</button></div>`).join('')
    : '<p class="hint">Todavía no hay bloques. Añade uno o carga el ejemplo.</p>';
  const rest = $('#sesRest'); if (rest && document.activeElement !== rest) rest.value = SES.rest;
  const sum = $('#sesSummary');
  if (sum) sum.innerHTML = SES.blocks.length ? `${SES.blocks.length} ${SES.blocks.length === 1 ? 'bloque' : 'bloques'}, unos <strong>${sessionMinutes()} min</strong> con descansos. En el juego, pulsa EMPEZAR SESIÓN en el menú.` : '';
}
function sesInitPage() {
  const host = $('#sesList');
  host.addEventListener('change', ev => {
    const row = ev.target.closest && ev.target.closest('.sesrow'); if (!row) return;
    const b = SES.blocks[+row.dataset.i], f = ev.target.dataset.f; if (!b) return;
    if (f === 'mode') { b.mode = ev.target.value; if (!blockOk(b.mode, b.ex)) b.ex = Object.keys(EX_NAMES).find(x => blockOk(b.mode, x)); delete b.foes; delete b.aim; Object.assign(b, blockExtra(b)); }
    else if (f === 'foes') b.foes = foeCat(ev.target.value) || 'robots';
    else if (f === 'ex') { const wasHang = b.ex === 'hang'; b.ex = ev.target.value; if (wasHang !== (b.ex === 'hang')) b.n = b.ex === 'hang' ? 30 : 20; }
    else if (f === 'n') b.n = clamp(Math.round(+ev.target.value) || 1, 1, 500);
    saveSession(); renderSession();
  });
  host.addEventListener('click', ev => {
    const btn = ev.target.closest && ev.target.closest('button[data-a]'); if (!btn) return;
    const i = +btn.closest('.sesrow').dataset.i;
    if (btn.dataset.a === 'del') SES.blocks.splice(i, 1); else if (i > 0) SES.blocks.splice(i - 1, 0, SES.blocks.splice(i, 1)[0]);
    saveSession(); renderSession();
  });
  $('#btnSesAdd').addEventListener('click', () => { if (SES.blocks.length >= 20) return; const ex = blockOk(settings.mode, settings.exercise) ? settings.exercise : 'squat'; const b = { mode: blockOk(settings.mode, ex) ? settings.mode : 'combat', ex, n: ex === 'hang' ? 30 : 20 }; SES.blocks.push({ ...b, ...blockExtra(b) }); saveSession(); renderSession(); });
  $('#btnSesExample').addEventListener('click', () => { SES.blocks = SES_EXAMPLE.map(b => ({ ...b })); saveSession(); renderSession(); });
  $('#btnSesClear').addEventListener('click', () => { SES.blocks = []; saveSession(); renderSession(); });
  $('#sesRest').addEventListener('change', ev => { SES.rest = clamp(Math.round(+ev.target.value) || 0, 0, 600); saveSession(); renderSession(); });
  renderSession();
}
