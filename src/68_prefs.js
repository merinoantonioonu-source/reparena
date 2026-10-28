
/* =================== PERFILES Y RESTABLECER =================== */
// Los perfiles guardan todos los ajustes (modo y ejercicio incluidos) con un nombre y se cargan de un toque; y cada
// pestaña (o grupo de la página) se puede devolver a como venía sin tocar el resto. (Las ★ de antes ya no están: lo que
// ve el jugador lo decide el desarrollador con el ojo de su tabla, 67_dev)
const PROF_KEY = 'reparena3-profiles', UI_KEY = 'reparena3-ui', PROF_MAX = 8;
const PREFS = { resetArm: '', delArm: -1 };
// Restablecer un grupo de ajustes (una pestaña de las gafas o un grupo de la página)
function resetGroup(g) {
  SCHEMA.filter(f => f.g === g).forEach(f => settings[f.key] = f.def);
  saveSettings(); onSettingChanged('*'); syncForm();
}
// La última pestaña de Ajustes, para volver a ella
const uiPrefs = () => store(UI_KEY) || {};
function uiSave(k, v) { store(UI_KEY, Object.assign(uiPrefs(), { [k]: v })); }

/* ---------- Perfiles ---------- */
const profiles = () => (store(PROF_KEY) || []).filter(p => p && p.name && p.s);
function profSnapshot() { const s = { mode: settings.mode, exercise: settings.exercise }; SCHEMA.forEach(f => s[f.key] = settings[f.key]); return s; }
const profAuto = () => `${MODE_NAMES[settings.mode]} · ${EX_SHORT[settings.exercise]}`;
function profSave(name) {
  name = String(name || '').trim().slice(0, 40) || profAuto();
  const L = profiles(), i = L.findIndex(p => p.name.toLowerCase() === name.toLowerCase()), p = { name, date: Date.now(), s: profSnapshot() };
  if (i >= 0) L[i] = p; else { if (L.length >= PROF_MAX) return ''; L.push(p); }
  store(PROF_KEY, L); renderProfiles(); return name;
}
function profLoad(i) {
  const p = profiles()[i]; if (!p) return false;
  for (const f of SCHEMA) if (p.s[f.key] !== undefined) settings[f.key] = clampSetting(f, p.s[f.key]);
  if (p.s.foesGate === undefined && p.s.foes) Object.assign(settings, foeCatPatch(p.s.foes)); // perfiles de antes: robots, voladores o mezcla
  if (MODE_NAMES[p.s.mode]) settings.mode = p.s.mode;
  if (EX_NAMES[p.s.exercise]) settings.exercise = p.s.exercise;
  settings.exercise = exFor(settings.mode, settings.exercise);
  saveSettings(); onSettingChanged('*'); syncForm(); return true;
}
function profDelete(i) { const L = profiles(); L.splice(i, 1); store(PROF_KEY, L); renderProfiles(); }
const profLine = p => `${MODE_NAMES[p.s.mode] || ''} · ${EX_NAMES[p.s.exercise] || ''}`;

// En las gafas (desde Ajustes): cargar, borrar (pulsando dos veces) y guardar lo actual con un nombre automático; en la
// página se les pone el nombre que quieras
function profilesMenu(back) {
  const again = () => profilesMenu(back), L = profiles();
  const rows = [{ t: 'title', text: 'PERFILES' }, { t: 'text', text: L.length ? 'Carga uno y se ponen todos sus ajustes, con su modo y su ejercicio' : 'Aún no tienes perfiles: guarda tus ajustes de ahora (en la página puedes ponerles nombre)', color: '#a49fc8' }];
  L.forEach((p, i) => rows.push({ t: 'btns', items: [
    { label: `${p.name}`, flex: 3, onPress: () => { if (profLoad(i)) { say(`Perfil «${p.name}» cargado`, '#3cf0c6', 1.8); SND.click(); back(); } } },
    { label: PREFS.delArm === i ? '¿Borrar?' : 'Borrar', flex: 1, style: 'danger', onPress: () => { if (PREFS.delArm === i) { PREFS.delArm = -1; profDelete(i); } else PREFS.delArm = i; again(); } }] }));
  rows.push({ t: 'btns', items: [
    ...(L.length < PROF_MAX ? [{ label: `Guardar: ${profAuto()}`, flex: 2, style: 'primary', onPress: () => { const n = profSave(); say(`Guardado como «${n}»`, '#3cf0c6', 1.8); again(); } }] : []),
    { label: 'Volver', onPress: () => { PREFS.delArm = -1; back(); } }] });
  rows.splice(rows.length - 1, 0, { t: 'btns', items: [{ label: 'A otro dispositivo (código)  ▸', accent: MC.prof, onPress: () => { PREFS.delArm = -1; xferMenu(again); } }] });
  const m = openMenu(rows, { accent: MC.prof }); m.rebuild = again;
}

// En la página
function renderProfiles() {
  const host = $('#profList'); if (!host) return;
  const L = profiles();
  host.innerHTML = L.length ? L.map((p, i) => `<div class="profrow"><div><b>${escHTML(p.name)}</b><span>${profLine(p)}</span></div>
    <button class="btn small alt" data-p="load" data-i="${i}">Cargar</button><button class="btn small" data-p="del" data-i="${i}">Borrar</button></div>`).join('')
    : '<p class="note">Aún no hay perfiles guardados.</p>';
  if (typeof renderSession === 'function') renderSession(); // (los bloques pueden elegir perfil: su lista, al día)
}
const escHTML = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function profInitPage() {
  const host = $('#profList'), btn = $('#btnProfSave'), inp = $('#profName'); if (!host) return;
  btn.addEventListener('click', () => { const n = profSave(inp.value); const st = $('#profStatus'); if (st) st.textContent = n ? `Guardado como «${n}».` : `Como mucho ${PROF_MAX} perfiles: borra alguno.`; inp.value = ''; });
  host.addEventListener('click', ev => {
    const b = ev.target.closest && ev.target.closest('button[data-p]'); if (!b) return;
    const i = +b.dataset.i, st = $('#profStatus');
    if (b.dataset.p === 'load') { const p = profiles()[i]; if (profLoad(i) && st) st.textContent = `Perfil «${p.name}» cargado: ${profLine(p)}.`; }
    else if (typeof confirm !== 'function' || confirm('¿Borrar este perfil?')) profDelete(i);
  });
  renderProfiles();
}

// En la página: cada sección se pliega y despliega pulsando su título (y se acuerda de cómo la dejaste)
function pageSections() {
  const main = $('.main'); if (!main || !main.addEventListener) return;
  const ui = store(UI_KEY) || {}, shut = new Set(ui.shut || ['how', 'soundsBox']); // (al principio, plegadas solo las largas: cómo se juega y los sonidos)
  const keyOf = sec => sec.id || (sec.className || '').split(' ').filter(c => c && c !== 'collapsed')[0] || '';
  const all = () => { try { return [...main.querySelectorAll(':scope > section')]; } catch (e) { return []; } };
  for (const sec of all()) if (shut.has(keyOf(sec))) sec.classList.add('collapsed');
  main.addEventListener('click', ev => {
    const h = ev.target.closest && ev.target.closest('h2'); if (!h) return;
    const sec = h.closest('section'); if (!sec || sec.parentElement !== main) return;
    if (h.parentElement !== sec && !/exHead|todayHead/.test(h.parentElement.className)) return;
    sec.classList.toggle('collapsed');
    const u = store(UI_KEY) || {}; u.shut = all().filter(x => x.classList.contains('collapsed')).map(keyOf).filter(Boolean); store(UI_KEY, u);
  });
}
