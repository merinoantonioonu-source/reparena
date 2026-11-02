
/* =================== RESTABLECER Y PREFERENCIAS DE LA PÁGINA =================== */
// Cada pestaña (o grupo de la página) se puede devolver a como venía sin tocar el resto. (Los perfiles —todos los ajustes
// guardados con un nombre— se quitaron: el rango y lo que recuerda cada modo y ejercicio ya hacen ese papel. Las ★ de
// antes tampoco están: lo que ve el jugador lo decide el desarrollador con el ojo de su tabla, 67_dev)
const UI_KEY = 'reparena3-ui';
const PREFS = { resetArm: '' };
// Restablecer un grupo de ajustes (una pestaña de las gafas o un grupo de la página)
function resetGroup(g) {
  SCHEMA.filter(f => f.g === g).forEach(f => settings[f.key] = f.def);
  saveSettings(); onSettingChanged('*'); syncForm();
}
// La última pestaña de Ajustes, para volver a ella
const uiPrefs = () => store(UI_KEY) || {};
function uiSave(k, v) { store(UI_KEY, Object.assign(uiPrefs(), { [k]: v })); }

const escHTML = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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
