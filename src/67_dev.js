/* =================== MODO DESARROLLADOR: LA TABLA DE DIFICULTAD =================== */
// El desarrollador decide, para cada modo y ejercicio y para cada uno de los 7 rangos, los valores que marcan la
// dificultad (la tabla D) y qué ajustes ve el jugador en su menú (el ojo). Las canciones de cada ejercicio son del jugador
// (abajo, al final).
// Lo que no toca sigue como venía: los valores del rango (RANK_VALS) o los de fábrica del ajuste. Lo que el jugador cambia
// en su menú también va aquí, al rango y ejercicio de ahora (70_game): así se queda como el valor de ese rango. «Exportar» da la
// tabla entera; pegada en DEV_FACTORY queda como valores de fábrica para todos.
// El modo desarrollador está escondido: cinco toques seguidos en el título de la página o en «Acerca de» (Ajustes →
// Menú y avisos, en las gafas), o la página con ?dev=1
const DEV_KEY = 'reparena3-dev', DEV_ON_KEY = 'reparena3-devon', EXS_KEY = 'reparena3-exsongs', EXS_MAX = 50;
// { 'modo|ejercicio': { v: { ajuste: [7 valores o null] }, eye: [ajustes] }, songs: { ejercicio: [{ uri, name, by }] } } (las
// canciones, solo en lo de fábrica: las que el desarrollador deja de serie)
const DEV_FACTORY = {};
const DEV = { on: false, t: {}, taps: [] };
(() => {
  const t = store(DEV_KEY); DEV.t = t && typeof t === 'object' && !Array.isArray(t) ? t : {}; let on = !!store(DEV_ON_KEY);
  try { const q = new URLSearchParams(location.search || ''); if (q.has('dev')) { on = q.get('dev') !== '0'; store(DEV_ON_KEY, on); } } catch (e) { /* sin parámetros */ }
  DEV.on = on;
})();
const devSave = () => store(DEV_KEY, DEV.t);
// El menú completo (todos los ajustes) es solo del desarrollador; el jugador ve el suyo (lo marcado con el ojo)
const menuFull = () => DEV.on && settings.menuLevel === 'full';
function devToggle(v = !DEV.on) {
  DEV.on = !!v; store(DEV_ON_KEY, DEV.on); if (!DEV.on && settings.menuLevel === 'full') setSetting('menuLevel', 'simple');
  if (typeof say === 'function') say(DEV.on ? 'Modo desarrollador: activado' : 'Modo desarrollador: desactivado', '#ffd166', 2);
  if (typeof syncForm === 'function') syncForm(); devPage();
}
// cinco toques en menos de 3 s (en el título de la página o en «Acerca de» en las gafas) lo encienden o apagan
function devTap() { const now = performance.now(); DEV.taps = DEV.taps.filter(t => now - t < 3000).concat(now); if (DEV.taps.length >= 5) { DEV.taps = []; devToggle(); return true; } return false; }

// Las filas: lo que marca la dificultad de este modo y ejercicio (números, interruptores y unas pocas opciones). Fuera,
// lo que es elegir (qué enemigos, qué armas, cómo apuntar…) y lo de tu cuerpo y tus aparatos, que no es dificultad
const DEV_NOT = new Set(['rank', 'toFail', 'foeKind', 'sword', 'swordKind', 'swordHand', 'padHands', 'pistol', 'aim', 'throwPick', 'comboBase', 'comboOrder', 'hangPit', 'supArms', 'dipBars', 'guard', 'barOffset', 'fallMargin']);
const DEV_CHOICE_OK = new Set(['guardDiff', 'arcTiming', 'barTarget']);
let _devCombo = null;
const devComboSet = () => _devCombo || (_devCombo = new Set(comboKeys()));
const devRowOk = f => !!f && f.g !== 'ejercicio' && devComboSet().has(f.key) && !DEV_NOT.has(f.key) && (f.type === 'num' || f.type === 'toggle' || DEV_CHOICE_OK.has(f.key));
// (sin mirar las condiciones de cada ajuste: la tabla enseña todo lo que vale para el modo y el ejercicio)
const fieldFits = f => (!f.modes || f.modes.includes(settings.mode)) && (!f.ex || f.ex.includes(settings.exercise)) && !(f.noEx && f.noEx.includes(settings.exercise));
const devRows = () => SCHEMA.filter(f => devRowOk(f) && fieldFits(f)).map(f => f.key);

const devEntry = (id = comboId()) => DEV.t[id] || {}, devFact = (id = comboId()) => DEV_FACTORY[id] || {};
const devArr = (o, key) => (o.v || {})[key];
// lo que el desarrollador puso en esa casilla (o null: la de serie)
function devCell(key, i, id = comboId()) {
  for (const a of [devArr(devEntry(id), key), devArr(devFact(id), key)]) if (a && a[i] !== undefined && a[i] !== null) return a[i];
  return null;
}
const devBase = (key, i) => RANK_VALS[key] ? RANK_VALS[key][i] : FIELD[key].def;
const devVal = (key, i, id) => { const v = devCell(key, i, id); return clampSetting(FIELD[key], v === null ? devBase(key, i) : v); };
// las filas que manda el rango: las de siempre (RANK_VALS) y las que el desarrollador ha tocado en este modo y ejercicio
const devCtl = (id = comboId()) => [...new Set([...Object.keys(devEntry(id).v || {}), ...Object.keys(devFact(id).v || {})])].filter(k => FIELD[k] && devRowOk(FIELD[k]));
function devSet(key, i, v, id = comboId()) {
  const e = DEV.t[id] = DEV.t[id] || {}; e.v = e.v || {}; const a = e.v[key] = e.v[key] || Array(RANKS.length).fill(null);
  a[i] = v === null || v === '' ? null : clampSetting(FIELD[key], v);
  if (a.every(x => x === null)) delete e.v[key]; devSave();
  // en el rango de ahora, el valor nuevo se nota ya
  if (id === comboId() && i === rankIdx()) { RANK.applying = true; try { setSetting(key, devVal(key, i)); } finally { RANK.applying = false; } }
}
// el ojo: lo que ve el jugador en su menú. Sin marcar nada, la velocidad, cuánto se pide y el descanso (lo de siempre)
function devEyeDef() {
  const hang = settings.exercise === 'hang', k = [speedKey(), settings.mode === 'arcs' ? 'arcMax' : isBars() && hang ? 'hangInc' : 'repsWave'];
  if (isBars() && !hang) k.push('barTarget'); if (settings.mode === 'touch' && fieldVisible(FIELD.tchHands)) k.push('tchHands'); if (isCombat() && foesHas('robots') && foesHas('flyers')) k.push('flySpeed');
  return k.concat('rest').filter(x => FIELD[x]);
}
const devEye = (id = comboId()) => devEntry(id).eye || devFact(id).eye || devEyeDef();
function devEyeToggle(key, id = comboId()) {
  const cur = devEye(id).slice(), j = cur.indexOf(key); if (j >= 0) cur.splice(j, 1); else cur.push(key);
  const e = DEV.t[id] = DEV.t[id] || {}; e.eye = cur; devSave();
}
// copiar la tabla (valores y ojo) de este ejercicio a otro del mismo modo; volver a los de fábrica
function devCopy(toId, id = comboId()) { const e = devEntry(id); DEV.t[toId] = JSON.parse(JSON.stringify({ v: e.v || devFact(id).v || {}, eye: devEye(id) })); devSave(); }
function devFactory(id = comboId()) { delete DEV.t[id]; devSave(); applyRank(); }
// exportar: la tabla entera (lo de fábrica más lo tuyo), lista para pegar en DEV_FACTORY o en otro dispositivo
function devExport() {
  const out = JSON.parse(JSON.stringify(DEV_FACTORY));
  if (DEV.t.foes) out.foes = { ...(DEV_FACTORY.foes || {}), ...DEV.t.foes };
  for (const id in DEV.t) { if (id === 'foes') continue; const e = DEV.t[id], o = out[id] = out[id] || {}; if (e.v) o.v = { ...(o.v || {}), ...e.v }; if (e.eye) o.eye = e.eye.slice(); }
  const songs = { ...(DEV_FACTORY.songs || {}), ...EXS.t }; if (Object.keys(songs).length) out.songs = songs; // (las tuyas, de serie para todos)
  return JSON.stringify(out);
}
function devImport(text) {
  let o; try { o = JSON.parse(text); } catch (e) { return 'Eso no es una tabla (JSON) válida'; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return 'Eso no es una tabla válida';
  const t = {}; let n = 0;
  for (const id in o) {
    if (id === 'foes') { if (o.foes && typeof o.foes === 'object') { t.foes = {}; for (const k in o.foes) if (devFoes().some(x => x[0] === k) && o.foes[k]) t.foes[k] = devFoeClean(o.foes[k]); } continue; }
    if (id === 'songs') { if (o.songs && typeof o.songs === 'object') for (const x in o.songs) if (EX_NAMES[x]) exSongsSet(o.songs[x], x); continue; }
    const [m, x] = id.split('|'); if (!MODE_NAMES[m] || !EX_NAMES[x] || !o[id] || typeof o[id] !== 'object') continue;
    const e = {}, v = o[id].v || {};
    for (const k in v) if (FIELD[k] && devRowOk(FIELD[k]) && Array.isArray(v[k])) { (e.v = e.v || {})[k] = RANKS.map((_, i) => v[k][i] === null || v[k][i] === undefined ? null : clampSetting(FIELD[k], v[k][i])); n++; }
    if (Array.isArray(o[id].eye)) e.eye = o[id].eye.filter(k => FIELD[k]);
    t[id] = e;
  }
  DEV.t = t; devSave(); applyRank(); return `Tabla cargada (${n} filas)`;
}

/* ---------- Cada enemigo: resistencia, fuerza y dureza ---------- */
// La resistencia es cuántos disparos aguanta en la primera oleada (luego sube como siempre, oleada a oleada); la fuerza,
// cuántas vidas quita cada golpe; la dureza, en qué tramo de la escalera de enemigos entra (1, los primeros; 4, los
// últimos). La lista sale de las de los enemigos (FOE_GATE, FOE_HATCH, FOE_FLY): uno nuevo entra solo, con 2 disparos
// (1 si vuela o sale de una trampilla). Las oleadas piden las mismas repeticiones: más resistentes, salen menos
const DEV_FOE_HP = { 'g:robot_h': 3, 'g:puglin': 1, 'g:zchubby': 3, 'g:yeti': 3, 'g:cyclops': 3, 'g:captain': 3, 'h:spider': 2, 'h:spider_h': 3, 'f:bomber': 2, 'f:cthulhu': 2 };
function devFoes() {
  const L = [];
  for (const [k, n] of FOE_GATE) { L.push(['g:' + k, k === 'robot' ? 'Robot explorador' : n, k]); if (k === 'robot') L.push(['g:robot_h', 'Robot pesado', null]); }
  for (const [k, n] of FOE_HATCH) { L.push(['h:' + k, n + ' (trampilla)', k]); if (k === 'spider') L.push(['h:spider_h', 'Araña pesada (trampilla)', null]); }
  for (const [k, n] of FOE_FLY) if (k !== 'dragon') { L.push(['f:' + k, n, k]); if (k === 'drone') L.push(['f:bomber', 'Bombardero', null]); }
  return L;
}
const devFoeDefHp = key => DEV_FOE_HP[key] || (key.startsWith('g:') ? 2 : 1);
const devFoeClean = o => ({ ...(o.hp ? { hp: clamp(Math.round(+o.hp) || 1, 1, 12) } : {}), ...(o.str ? { str: clamp(Math.round(+o.str) || 1, 1, 5) } : {}), ...(o.tier ? { tier: clamp(Math.round(+o.tier) || 2, 1, 4) } : {}) });
function devFoe(key) { const o = { ...((DEV_FACTORY.foes || {})[key] || {}), ...((DEV.t.foes || {})[key] || {}) }; return { hp: o.hp || devFoeDefHp(key), str: o.str || 1, tier: o.tier || 0 }; }
function devFoeSet(key, f, v) { const F = DEV.t.foes = DEV.t.foes || {}, o = { ...(F[key] || {}), [f]: v === '' ? undefined : +v }; F[key] = devFoeClean(o); if (!Object.keys(F[key]).length) delete F[key]; devSave(); }
// la dureza de la escalera: la del desarrollador o la de serie (FOE_TIER)
const foeTier = k => devFoe('g:' + k).tier || devFoe('h:' + k).tier || devFoe('f:' + k).tier || FOE_TIER[k] || 2;
function devFoesHTML() {
  const L = devFoes(), td = (key, f, v, mn, mx, own) => `<td class="dvc${own ? ' own' : ''}"><input type="number" data-fk="${key}" data-f="${f}" min="${mn}" max="${mx}" step="1" value="${v}" inputmode="numeric"></td>`;
  let h = '<h3>Enemigos: resistencia, fuerza y dureza</h3><p class="note">Para todos los modos y rangos. <b>Resistencia</b>: disparos que aguanta en la primera oleada (luego sube como siempre). <b>Fuerza</b>: vidas que quita cada golpe. <b>Dureza</b>: en qué tramo de la escalera entra (1, desde el principio; 4, al final). Los jefes, como siempre.</p>';
  h += '<div class="dvwrap"><table class="dvtab dvfoes"><thead><tr><th>Enemigo</th><th>Resistencia</th><th>Fuerza</th><th>Dureza</th></tr></thead><tbody>';
  const own = (DEV.t.foes || {});
  for (const [key, name, base] of L) { const v = devFoe(key), o = own[key] || {}; h += `<tr><th scope="row">${escD(name)}</th>${td(key, 'hp', v.hp, 1, 12, o.hp)}${td(key, 'str', v.str, 1, 5, o.str)}${base ? td(key, 'tier', v.tier || FOE_TIER[base] || 2, 1, 4, o.tier) : '<td>—</td>'}</tr>`; }
  return h + '</tbody></table></div>';
}

/* ---------- Canciones de cada ejercicio (del jugador) ---------- */
// Cada ejercicio puede llevar sus canciones (se eligen en la página, en Sonido y música): al empezar una ronda de ese
// ejercicio (en cualquier modo, fuera de las sesiones, que llevan las suyas) suenan al azar; sin ninguna, lo de siempre.
// Las que deja de serie el desarrollador (al exportar su tabla) valen mientras no elijas las tuyas
const EXS = { t: {}, list: '', err: '' };
(() => { const t = store(EXS_KEY); EXS.t = t && typeof t === 'object' && !Array.isArray(t) ? t : {}; })();
const exSongsClean = l => Array.isArray(l) ? l.filter(t => t && typeof t.uri === 'string' && t.uri.startsWith('spotify:track:')).slice(0, EXS_MAX).map(t => ({ uri: t.uri, name: String(t.name || '').slice(0, 120), by: String(t.by || '').slice(0, 120) })) : [];
const exSongs = (x = settings.exercise) => exSongsClean(EXS.t[x] || (DEV_FACTORY.songs || {})[x] || []);
function exSongsSet(list, x = settings.exercise) { const l = exSongsClean(list); if (l.length) EXS.t[x] = l; else delete EXS.t[x]; store(EXS_KEY, EXS.t); }
function exSongsStart() {
  if (SES.active || typeof spBlockMusic !== 'function') return false;
  const l = exSongs(); if (!l.length || !spConnected()) return false;
  if (SP.want === 'block' && SP.exSongs === settings.exercise && spPlaying()) return true; // (ya suenan las de este ejercicio)
  const sh = l.slice(); for (let k = sh.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [sh[k], sh[j]] = [sh[j], sh[k]]; }
  SP.exSongs = settings.exercise; return spBlockMusic({ music: sh });
}
const escD = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function exSongsHTML() {
  const x = settings.exercise, sel = exSongs(x), on = new Set(sel.map(t => t.uri)), mine = !!EXS.t[x];
  let h = `<p class="note">Canciones de <b>${escD(EX_NAMES[x])}</b> (el ejercicio elegido arriba): suenan al azar al empezar una ronda de este ejercicio, en cualquier modo (las sesiones llevan las suyas). Sin ninguna, suena lo de siempre.${sel.length && !mine ? ' Ahora, las que vienen de serie.' : ''}</p>`;
  h += sel.length ? `<div class="chips">${sel.map((t, k) => `<span class="chip">${escD(t.name)}<button class="btn tiny" data-a="srm" data-k="${k}" aria-label="Quitar ${escD(t.name)}">✕</button></span>`).join('')}<button class="btn small" data-a="sclear">Quitar todas</button></div>` : '';
  if (!spConnected()) return h + '<p class="hint">Conecta Spotify (arriba) para elegirlas.</p>';
  if (!SP.mine) return h + `<div class="actions"><button type="button" class="btn small" data-a="sload">Elegir canciones</button></div><p class="status">${escD(EXS.err)}</p>`;
  const L = spPickable();
  if (!EXS.list) h += `<div class="lpick">${L.map(l => `<button type="button" class="lp" data-a="slist" data-id="${l.id}">${escD(l.name)} ▸</button>`).join('')}</div>`;
  else {
    const l = L.find(z => z.id === EXS.list) || { name: '' }, T = SP.trk && SP.trk[EXS.list];
    h += `<div class="spin"><button type="button" class="btn small" data-a="sback">← Tus listas</button><b>${escD(l.name)}</b></div>`;
    h += !T ? `<p class="status">${escD(EXS.err || 'Cargando sus canciones…')}</p>` : `<div class="tracks">${T.map(t => `<div class="sptrk"><label><input type="checkbox" data-s="trk" data-uri="${escD(t.uri)}"${on.has(t.uri) ? ' checked' : ''}><span>${escD(t.name)}<small> — ${escD(t.by)}</small></span></label></div>`).join('')}</div>`;
  }
  return h;
}
function exSongsPage() { const box = typeof document !== 'undefined' && $('#exSongs'); if (box) box.innerHTML = exSongsHTML(); }
function exSongsInitPage() {
  const box = $('#exSongs'); if (!box) return;
  box.addEventListener('change', ev => {
    const el = ev.target, d = el.dataset || {}; if (d.s !== 'trk') return;
    const T = (SP.trk && SP.trk[EXS.list]) || [], tr = T.find(z => z.uri === d.uri); if (!tr) return;
    const sel = exSongs(); exSongsSet(el.checked ? (sel.some(z => z.uri === tr.uri) ? sel : sel.concat(tr)) : sel.filter(z => z.uri !== tr.uri)); exSongsPage();
  });
  box.addEventListener('click', ev => {
    const b = ev.target.closest ? ev.target.closest('button') : ev.target, d = (b && b.dataset) || {};
    if (d.a === 'sload') spMyLists().then(l => { SP.mine = l; EXS.err = ''; exSongsPage(); }).catch(e => { EXS.err = 'No se pudieron cargar tus listas: ' + spErrText(e); exSongsPage(); });
    else if (d.a === 'slist') { EXS.list = d.id; EXS.err = ''; exSongsPage(); if (!(SP.trk && SP.trk[d.id])) spListTracks(d.id).then(() => exSongsPage()).catch(e => { EXS.err = spErrText(e); exSongsPage(); }); }
    else if (d.a === 'sback') { EXS.list = ''; exSongsPage(); }
    else if (d.a === 'srm') { const l = exSongs(); l.splice(+d.k, 1); exSongsSet(l); exSongsPage(); }
    else if (d.a === 'sclear') { exSongsSet([]); exSongsPage(); }
  });
  exSongsPage();
}

/* ---------- La tabla en la página (solo en modo desarrollador) ---------- */
const devFmt = (f, v) => f.type === 'toggle' ? (v ? 'Sí' : 'No') : f.type === 'choice' ? ((f.opts.find(o => String(o[0]) === String(v)) || [v, v])[1]) : f.zero && v === 0 ? f.zero : String(v);
function devCellHTML(f, i) {
  const own = devCell(f.key, i) !== null, v = devVal(f.key, i), cls = `dvc${own ? ' own' : ''}${i === rankIdx() ? ' now' : ''}`, a = `data-k="${f.key}" data-i="${i}" aria-label="${escD(f.label)}, ${RANKS[i][1]}"`;
  if (f.type === 'num') return `<td class="${cls}"><input type="number" ${a} min="${f.min}" max="${f.max}" step="${f.step}" value="${v}" inputmode="decimal"></td>`;
  const opts = f.type === 'toggle' ? [[1, 'Sí'], [0, 'No']] : f.opts;
  return `<td class="${cls}"><select ${a}>${opts.map(o => `<option value="${o[0]}"${String(o[0]) === String(v) ? ' selected' : ''}>${escD(o[1])}</option>`).join('')}</select></td>`;
}
function devTableHTML() {
  const eye = new Set(devEye()), rows = devRows().map(k => FIELD[k]);
  const same = Object.keys(EX_NAMES).filter(x => x !== settings.exercise && exOk(settings.mode, x));
  let h = `<p class="note">Tabla de <b>${escD(MODE_NAMES[settings.mode])} · ${escD(EX_NAMES[settings.exercise])}</b> (cambia el modo y el ejercicio arriba). En dorado, lo que has puesto tú; el resto, lo de serie. La columna del rango de ahora va marcada. El <b>ojo</b> decide lo que ve el jugador en su menú.</p>`;
  h += `<div class="dvwrap"><table class="dvtab"><thead><tr><th>Ajuste</th>${RANKS.map((r, i) => `<th>${drawRankSVG(i)}<span>${escD(r[1])}</span></th>`).join('')}<th>Jugador</th><th></th></tr></thead><tbody>`;
  for (const f of rows) {
    const on = eye.has(f.key), ctl = devRowOn(f.key);
    h += `<tr class="${ctl ? 'ctl' : ''}"><th scope="row" title="${escD(f.hint || '')}">${escD(f.label)}${f.unit ? ` <small>(${escD(f.unit)})</small>` : ''}</th>${RANKS.map((_, i) => devCellHTML(f, i)).join('')}`
      + `<td><button type="button" class="dveye${on ? ' on' : ''}" data-a="eye" data-k="${f.key}" aria-pressed="${on}" aria-label="Lo ve el jugador: ${escD(f.label)}">${on ? '👁' : '—'}</button></td>`
      + `<td>${ctl && !RANK_VALS[f.key] ? `<button type="button" class="btn tiny" data-a="row0" data-k="${f.key}" title="Quitar lo tuyo de esta fila">✕</button>` : ''}</td></tr>`;
  }
  h += '</tbody></table></div>';
  h += `<div class="dvbar"><label>Copiar a <select id="dvCopyTo">${same.map(x => `<option value="${x}">${escD(EX_NAMES[x])}</option>`).join('')}</select></label><button type="button" class="btn small" data-a="copy"${same.length ? '' : ' disabled'}>Copiar</button>`
    + `<button type="button" class="btn small" data-a="factory">Valores de fábrica</button><button type="button" class="btn small" data-a="export">Exportar</button><button type="button" class="btn small" data-a="import">Importar</button><button type="button" class="btn small" data-a="off">Salir del modo desarrollador</button></div>`
    + `<textarea id="dvText" rows="3" placeholder="Aquí sale la tabla al exportar; pega aquí una para importarla" aria-label="Tabla exportada"></textarea><p class="status" id="dvStatus"></p>`;
  return h + devFoesHTML() + '<p class="hint">Las canciones de cada ejercicio se eligen en «Sonido y música»; al exportar, van con la tabla (de serie para todos).</p>';
}
const devRowOn = key => !!RANK_VALS[key] || devCtl().includes(key);
// un escudo pequeño con el galón (el mismo dibujo que en las gafas)
function drawRankSVG(i) { try { const c = mkCanvas(64), x = c.getContext('2d'); drawRankShield(x, i, 32, 30, 54); return `<img src="${c.toDataURL ? c.toDataURL() : ''}" alt="" width="28" height="28">`; } catch (e) { return ''; } }
function devPage() {
  const sec = typeof document !== 'undefined' && $('#devSection'); if (!sec) return;
  sec.hidden = !DEV.on; const box = $('#devTable'); if (!box || !DEV.on) return;
  box.innerHTML = devTableHTML();
}
function devInitPage() {
  const t = $('#pageTitle'); if (t) t.addEventListener('click', () => devTap());
  const box = $('#devTable'); if (!box) return;
  box.addEventListener('change', ev => {
    const el = ev.target, d = el.dataset || {};
    if (d.k !== undefined && d.i !== undefined) { devSet(d.k, +d.i, el.value); devPage(); }
    else if (d.fk) { devFoeSet(d.fk, d.f, el.value); devPage(); }
  });
  box.addEventListener('click', ev => {
    const b = ev.target.closest ? ev.target.closest('button') : ev.target, d = (b && b.dataset) || {}, st = $('#dvStatus'), ta = $('#dvText');
    if (d.a === 'eye') { devEyeToggle(d.k); devPage(); if (typeof syncForm === 'function') syncForm(); }
    else if (d.a === 'row0') { const e = DEV.t[comboId()]; if (e && e.v) { delete e.v[d.k]; devSave(); } devPage(); }
    else if (d.a === 'copy') { const to = $('#dvCopyTo'); if (to && to.value) { devCopy(settings.mode + '|' + to.value); if (st) st.textContent = `Copiada a ${EX_NAMES[to.value]}`; } }
    else if (d.a === 'factory') { if (typeof confirm !== 'function' || confirm('¿Quitar lo tuyo de esta tabla y volver a los valores de fábrica?')) { devFactory(); devPage(); } }
    else if (d.a === 'export') { if (ta) { ta.value = devExport(); if (ta.select) ta.select(); } try { navigator.clipboard.writeText(devExport()); if (st) st.textContent = 'Copiada: pégamela en el chat y la dejo como valores de fábrica'; } catch (e) { if (st) st.textContent = 'Copia el texto de abajo'; } }
    else if (d.a === 'import') { const r = devImport(ta ? ta.value : ''); devPage(); exSongsPage(); const s2 = $('#dvStatus'); if (s2) s2.textContent = r; }
    else if (d.a === 'off') devToggle(false);
  });
  devPage();
}
