
/* =================== FAVORITOS, PERFILES Y RESTABLECER =================== */
// Para que el menú no obligue a buscar: los ajustes que más tocas, marcados con ★ en sus submenús, salen en el menú
// principal; los perfiles guardan todos los ajustes (modo y ejercicio incluidos) con un nombre y se cargan de un toque;
// y cada pestaña (o grupo de la página) se puede devolver a como venía sin tocar el resto
const FAV_KEY = 'reparena3-favs', PROF_KEY = 'reparena3-profiles', UI_KEY = 'reparena3-ui', FAV_MAX = 6, PROF_MAX = 8;
const PREFS = { favs: (store(FAV_KEY) || []).filter(k => FIELD[k]), resetArm: '', delArm: -1 };
const isFav = k => PREFS.favs.includes(k);
function favToggle(k) {
  if (isFav(k)) PREFS.favs = PREFS.favs.filter(x => x !== k);
  else if (PREFS.favs.length >= FAV_MAX) { say(`Como mucho ${FAV_MAX} favoritos: quita alguno`, '#ffd166', 2); return false; }
  else PREFS.favs.push(k);
  store(FAV_KEY, PREFS.favs); return true;
}
// los favoritos que valen para lo elegido y que el menú principal no enseña ya
function favRows(shown, after) {
  const ks = PREFS.favs.filter(k => fieldVisible(FIELD[k]) && !shown.has(k));
  return ks.length ? [{ t: 'text', text: '★ Tus favoritos', color: '#ffd166' }, ...ks.map(k => ({ t: 'field', key: k, after: FIELD[k].relayout ? after : undefined }))] : [];
}
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
  const m = openMenu(rows); m.rebuild = again;
}

// En la página
function renderProfiles() {
  const host = $('#profList'); if (!host) return;
  const L = profiles();
  host.innerHTML = L.length ? L.map((p, i) => `<div class="profrow"><div><b>${escHTML(p.name)}</b><span>${profLine(p)}</span></div>
    <button class="btn small alt" data-p="load" data-i="${i}">Cargar</button><button class="btn small" data-p="del" data-i="${i}">Borrar</button></div>`).join('')
    : '<p class="note">Aún no hay perfiles guardados.</p>';
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
