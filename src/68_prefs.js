
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

/* ---------- El índice de la página ---------- */
// A la izquierda, los apartados de la página y, debajo del que se ve, sus subapartados (los títulos h3 a la vista, como los
// grupos de ajustes que valen para lo elegido); a la derecha, solo ese apartado. En el móvil, una barra fija arriba que se
// despliega. Se acuerda del último apartado visto
const NAV = { cur: '', open: false, sig: '', t: 0 };
const navSecs = () => { const m = $('.main'); if (!m || !m.querySelectorAll) return []; try { return [...m.querySelectorAll(':scope > section')].filter(s => s.id && !s.hidden); } catch (e) { return []; } };
const navText = el => { let t = ''; for (const n of el.childNodes || []) { if (n.nodeType === 3) t += n.textContent; else if (n.nodeType === 1 && n.tagName !== 'BUTTON' && !(n.classList && (n.classList.contains('count') || n.classList.contains('qm')))) t += n.textContent; } return t.replace(/\s+/g, ' ').trim(); };
const navName = s => s.dataset.toc || navText(s.querySelector('h2') || s);
// En el móvil, cada apartado es una ficha con su icono y su color (en el ordenador no se ven)
const NAV_ICO = { todayBox: ['☀️', '#ffd166'], secHist: ['📈', '#3cf0c6'], secMode: ['🎮', '#ff4fa3'], secEx: ['🏋️', '#7ee2ff'], secCommon: ['⚙️', '#b8a7ff'], secMusic: ['🎵', '#8fdc5a'],
  secSpec: ['🎛️', '#ff8a3d'], devSection: ['🛠️', '#a49fc8'], secSession: ['📋', '#ffd166'], secHow: ['🥽', '#7ee2ff'] };
const navIco = s => NAV_ICO[s.id] || ['🔊', '#a49fc8'];
function navSubs(sec) {
  const out = [];
  sec.querySelectorAll('h3').forEach((h, i) => {
    for (let e = h; e && e !== sec; e = e.parentElement) if (e.hidden) return;
    const t = navText(h); if (!t) return; if (!h.id) h.id = sec.id + '-' + i; out.push({ id: h.id, t });
  });
  return out;
}
function tocRender(force) {
  const nav = $('#toc'), secs = navSecs(); if (!nav || !secs.length) return;
  if (!secs.some(s => s.id === NAV.cur)) { const last = uiPrefs().pageSec; NAV.cur = secs.some(s => s.id === last) ? last : secs[0].id; }
  const cur = secs.find(s => s.id === NAV.cur), subs = navSubs(cur), i = secs.indexOf(cur);
  const sig = secs.map(navName).join('|') + '#' + cur.id + '#' + subs.map(x => x.id + x.t).join('|') + NAV.open;
  secs.forEach(s => s.classList.toggle('on', s === cur)); document.body.dataset.sec = cur.id;
  if (sig === NAV.sig && !force) return; NAV.sig = sig;
  nav.innerHTML = `<button type="button" class="tocBar" data-nav="toggle" aria-expanded="${NAV.open}" aria-controls="tocList"><span class="tocIco" aria-hidden="true">${navIco(cur)[0]}</span><span class="tocNow">${escHTML(navName(cur))}</span><span class="tocHint">${NAV.open ? '✕ Cerrar' : '☰ Apartados'}</span></button>
    <ol class="tocList" id="tocList">${secs.map(s => `<li class="${s === cur ? 'on' : ''}" style="--ac:${navIco(s)[1]}"><a href="#${s.id}" data-nav="${s.id}"${s === cur ? ' aria-current="true"' : ''}><span class="tocI" aria-hidden="true">${navIco(s)[0]}</span><span class="tocT">${escHTML(navName(s))}</span></a>${s === cur && subs.length ? `<ol>${subs.map(x => `<li><a href="#${x.id}" data-nav="${s.id}" data-sub="${x.id}">${escHTML(x.t)}</a></li>`).join('')}</ol>` : ''}</li>`).join('')}</ol>`;
  nav.classList.toggle('open', NAV.open);
  const pg = $('#secPager'), prev = secs[i - 1], next = secs[i + 1]; // (abajo, el anterior y el siguiente: para seguir sin volver al índice)
  if (pg) pg.innerHTML = `${prev ? `<button type="button" class="btn small" data-nav="${prev.id}">◂ ${escHTML(navName(prev))}</button>` : ''}${next ? `<button type="button" class="btn small alt next" data-nav="${next.id}">${escHTML(navName(next))} ▸</button>` : ''}`;
}
function navGo(id, sub) {
  NAV.cur = id; NAV.open = false; uiSave('pageSec', id); tocRender(true); if (typeof document.getElementById !== 'function') return;
  const el = sub && document.getElementById(sub), sec = document.getElementById(id), go = el || sec;
  if (go && go.scrollIntoView) go.scrollIntoView({ block: 'start' });
  if (el && el.classList) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  if (sub && typeof document.querySelectorAll === 'function') document.querySelectorAll('.tocList ol a').forEach(a => a.classList.toggle('on', a.dataset.sub === sub));
  if (typeof appEnter === 'function') appEnter(id, sub); // (en el móvil, el apartado es una pantalla de la app: 63_app)
}
// un enlace a algo de la página (#…): abre su apartado y va allí
function navToHash(hash) {
  const el = hash && hash.length > 1 && document.getElementById(decodeURIComponent(hash.slice(1))); if (!el) return false;
  let sec = el; while (sec && !(sec.tagName === 'SECTION' && sec.parentElement && sec.parentElement.classList.contains('main'))) sec = sec.parentElement;
  if (!sec || !sec.id) return false; navGo(sec.id, el !== sec ? el.id : null); return true;
}
function pageNav() {
  const nav = $('#toc'); if (!nav || !nav.addEventListener) return;
  const onNav = ev => {
    const a = ev.target && ev.target.closest ? ev.target.closest('[data-nav]') : null;
    if (!a) { if (NAV.open && ev.target === nav) { NAV.open = false; tocRender(true); } return; } ev.preventDefault(); // (en el móvil, tocar fuera del panel, en lo oscurecido, lo cierra)
    if (a.dataset.nav === 'toggle') { NAV.open = !NAV.open; tocRender(true); return; }
    navGo(a.dataset.nav, a.dataset.sub || null);
  };
  nav.addEventListener('click', onNav); const pg = $('#secPager'); if (pg && pg.addEventListener) pg.addEventListener('click', onNav);
  if (typeof document.addEventListener === 'function') document.addEventListener('click', ev => { // los demás enlaces #… de la página (p. ej. el resumen de hoy)
    const a = ev.target && ev.target.closest ? ev.target.closest('a[href^="#"]') : null; if (!a || nav.contains(a)) return;
    if (navToHash(a.getAttribute('href'))) ev.preventDefault();
  });
  if (typeof document.addEventListener === 'function') document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && NAV.open) { NAV.open = false; tocRender(true); } });
  if (typeof addEventListener === 'function') addEventListener('hashchange', () => navToHash(location.hash));
  // lo que cambia (los grupos de ajustes que valen, la tabla del desarrollador…): el índice, al día
  const later = () => { clearTimeout(NAV.t); NAV.t = setTimeout(() => tocRender(), 120); };
  if (typeof MutationObserver === 'function' && $('.main')) new MutationObserver(later).observe($('.main'), { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
  settingHooks.push(later);
  tocRender(true); if (typeof location !== 'undefined' && location.hash) navToHash(location.hash);
}
