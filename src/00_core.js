(() => {
'use strict';
const $ = s => document.querySelector(s);
const V3 = THREE.Vector3, Q4 = THREE.Quaternion;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const smooth = t => t * t * (3 - 2 * t);

const EX_NAMES = { squat: 'Sentadillas', pushup: 'Flexiones', curl: 'Curl de bíceps' };
const MODE_NAMES = { walkers: 'Asalto', flyers: 'Enjambre', arcs: 'Arcos' };
const GROUP_NAMES = { partida: 'Partida', ejercicio: 'Ejercicio', enemigos: 'Enemigos', arcos: 'Arcos', sistema: 'Sistema' };

/* =================== AJUSTES =================== */
const SCHEMA = [
  { key: 'lives', g: 'partida', label: 'Vidas', type: 'num', min: 0, max: 20, step: 1, def: 3, zero: 'Infinitas', hint: '0 = infinitas: los golpes no te eliminan.' },
  { key: 'waves', g: 'partida', label: 'Oleadas', type: 'num', min: 0, max: 50, step: 1, def: 5, zero: 'Sin fin', hint: '0 = oleadas sin fin, con jefe cada 5.' },
  { key: 'repsWave', g: 'partida', label: 'Repeticiones en la primera oleada', short: 'Reps 1.ª oleada', type: 'num', min: 3, max: 150, step: 1, def: 12, unit: 'reps' },
  { key: 'repsInc', g: 'partida', label: 'Repeticiones extra en cada oleada', short: 'Reps extra/oleada', type: 'num', min: 0, max: 40, step: 1, def: 3, unit: 'reps' },
  { key: 'rest', g: 'partida', label: 'Descanso entre oleadas', short: 'Descanso', type: 'num', min: 0, max: 300, step: 5, def: 20, unit: 's' },

  { key: 'squatDepth', g: 'ejercicio', label: 'Profundidad de la sentadilla', short: 'Prof. sentadilla', type: 'num', min: 8, max: 70, step: 1, def: 26, unit: 'cm', ex: ['squat'], hint: 'Cuánto debe bajar la cabeza para que la repetición cuente.' },
  { key: 'pushDepth', g: 'ejercicio', label: 'Bajada en la flexión', short: 'Bajada flexión', type: 'num', min: 5, max: 35, step: 1, def: 13, unit: 'cm', ex: ['pushup'] },
  { key: 'curlRange', g: 'ejercicio', label: 'Recorrido del curl', short: 'Recorrido curl', type: 'num', min: 10, max: 50, step: 1, def: 27, unit: 'cm', ex: ['curl'], hint: 'Cuánto debe subir la muñeca.' },
  { key: 'perfectTime', g: 'ejercicio', label: 'Duración mínima de una PERFECTA', short: 'Tiempo PERFECTA', type: 'num', min: 0, max: 6, step: 0.1, def: 1.2, unit: 's', hint: '0 = solo cuenta la profundidad. En curl se exige la mitad.' },

  { key: 'walkTime', g: 'enemigos', label: 'Tiempo que tarda un enemigo en alcanzarte', short: 'Tiempo llegada', type: 'num', min: 3, max: 120, step: 1, def: 14, unit: 's', modes: ['walkers'] },
  { key: 'flySpeed', g: 'enemigos', label: 'Velocidad de vuelo', short: 'Vel. vuelo', type: 'num', min: 0.5, max: 20, step: 0.5, def: 3.5, unit: 'km/h', modes: ['flyers'], hint: 'En flexiones los bichos van a escala, unas 7 veces más lentos.' },
  { key: 'erratic', g: 'enemigos', label: 'Vuelo errático', short: 'Errático', type: 'num', min: 0, max: 200, step: 10, def: 100, unit: '%', modes: ['flyers'] },
  { key: 'maxAlive', g: 'enemigos', label: 'Enemigos a la vez como máximo', short: 'Máx. a la vez', type: 'num', min: 1, max: 15, step: 1, def: 5, modes: ['walkers', 'flyers'], hint: 'Bájalo si el juego va a tirones.' },
  { key: 'spawnGap', g: 'enemigos', label: 'Segundos entre apariciones', short: 'Entre apariciones', type: 'num', min: 0, max: 20, step: 0.5, def: 0, unit: 's', zero: 'Auto', modes: ['walkers', 'flyers'] },
  { key: 'aim', g: 'enemigos', label: 'Apuntar con (sentadillas)', short: 'Apuntar con', type: 'choice', opts: [['hands', 'Manos'], ['gaze', 'Mirada']], def: 'hands', modes: ['flyers'], hint: 'En flexiones y curl se apunta con la mirada.' },
  { key: 'assist', g: 'enemigos', label: 'Ayuda de puntería', short: 'Ayuda puntería', type: 'num', min: 0, max: 25, step: 1, def: 9, unit: '°', modes: ['flyers'] },

  { key: 'arcMin', g: 'arcos', label: 'Bajada mínima bajo un arco', short: 'Bajada mínima', type: 'num', min: 5, max: 80, step: 1, def: 18, unit: 'cm', modes: ['arcs'] },
  { key: 'arcMax', g: 'arcos', label: 'Bajada máxima bajo un arco', short: 'Bajada máxima', type: 'num', min: 5, max: 90, step: 1, def: 38, unit: 'cm', modes: ['arcs'], hint: 'Cada arco sale a una altura al azar entre la mínima y la máxima.' },
  { key: 'arcRate', g: 'arcos', label: 'Arcos por minuto', short: 'Arcos/minuto', type: 'num', min: 3, max: 40, step: 1, def: 12, modes: ['arcs'] },
  { key: 'arcSpeed', g: 'arcos', label: 'Velocidad de los arcos', short: 'Vel. arcos', type: 'num', min: 1, max: 25, step: 0.5, def: 7, unit: 'km/h', modes: ['arcs'] },
  { key: 'arcDouble', g: 'arcos', label: 'Arcos dobles (aguantar abajo)', short: 'Arcos dobles', type: 'num', min: 0, max: 100, step: 5, def: 15, unit: '%', modes: ['arcs'] },

  { key: 'depth', g: 'sistema', label: 'Distancia de las compuertas', short: 'Dist. compuertas', type: 'num', min: 0, max: 25, step: 0.5, def: 0, unit: 'm', zero: 'Auto', hint: 'Auto: 11 m en VR y 6 m en realidad mixta.' },
  { key: 'menuDist', g: 'sistema', label: 'Distancia del menú al aparecer', short: 'Dist. menú', type: 'num', min: 30, max: 200, step: 5, def: 85, unit: 'cm', hint: 'El menú se queda fijo: tendrás que acercarte para pulsarlo.' },
  { key: 'board', g: 'sistema', label: 'Marcador', type: 'choice', opts: [['auto', 'Auto'], ['gate', 'Compuertas'], ['column', 'Columna']], def: 'auto', hint: 'Auto: sobre las compuertas en VR, en una columna en realidad mixta.' },
  { key: 'shadows', g: 'sistema', label: 'Sombras', type: 'toggle', def: 1, hint: 'Desactívalas si notas tirones.' },
  { key: 'toasts', g: 'sistema', label: 'Avisos breves en la vista', short: 'Avisos en vista', type: 'toggle', def: 1 },
  { key: 'volume', g: 'sistema', label: 'Volumen de efectos', short: 'Volumen', type: 'num', min: 0, max: 100, step: 5, def: 80, unit: '%' },
  { key: 'ambient', g: 'sistema', label: 'Sonido ambiente', short: 'Ambiente', type: 'num', min: 0, max: 100, step: 5, def: 60, unit: '%' }
];
const FIELD = {}; SCHEMA.forEach(f => FIELD[f.key] = f);
const settings = { mode: 'walkers', exercise: 'squat' };
SCHEMA.forEach(f => settings[f.key] = f.def);
const STORE_KEY = 'reparena3-settings', HIST_KEY = 'reparena3-history';

function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } return null; }
function decimals(f) { return f.step < 1 ? (String(f.step).split('.')[1] || '').length : 0; }
function clampSetting(f, v) {
  if (f.type === 'choice') return f.opts.some(o => o[0] === v) ? v : f.def;
  if (f.type === 'toggle') return v ? 1 : 0;
  v = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : +v;
  if (!isFinite(v)) v = f.def;
  v = clamp(v, f.min, f.max);
  v = Math.round((v - f.min) / f.step) * f.step + f.min;
  return +clamp(v, f.min, f.max).toFixed(decimals(f));
}
function fmtNum(v, f) { return (f ? v.toFixed(decimals(f)) : String(Math.round(v * 10) / 10)).replace('.', ','); }
function fmtVal(f, v = settings[f.key]) {
  if (f.type === 'choice') { const o = f.opts.find(o => o[0] === v); return o ? o[1] : String(v); }
  if (f.type === 'toggle') return v ? 'Sí' : 'No';
  if (v === 0 && f.zero) return f.zero;
  return fmtNum(v, f) + (f.unit ? (f.unit === '°' || f.unit === '%' ? f.unit : ' ' + f.unit) : '');
}
(function loadSettings() {
  const s = store(STORE_KEY) || {};
  for (const f of SCHEMA) if (s[f.key] !== undefined) settings[f.key] = clampSetting(f, s[f.key]);
  if (MODE_NAMES[s.mode]) settings.mode = s.mode;
  if (EX_NAMES[s.exercise]) settings.exercise = s.exercise;
  if (settings.mode === 'arcs') settings.exercise = 'squat';
})();
function saveSettings() { store(STORE_KEY, settings); }
function setSetting(key, v) {
  const f = FIELD[key];
  settings[key] = f ? clampSetting(f, v) : v;
  if (key === 'mode' && v === 'arcs') settings.exercise = 'squat';
  if (key === 'exercise' && v !== 'squat' && settings.mode === 'arcs') settings.mode = 'walkers';
  saveSettings();
  onSettingChanged(key);
}
function fieldVisible(f) {
  if (f.modes && !f.modes.includes(settings.mode)) return false;
  if (f.ex && !f.ex.includes(settings.exercise)) return false;
  return true;
}
const isPush = () => settings.exercise === 'pushup';
// Se completa en otros módulos: aplica efectos inmediatos (volumen, sombras, distancia…)
const settingHooks = [];
function onSettingChanged(key) { settingHooks.forEach(h => { try { h(key); } catch (e) { console.warn(e); } }); }

/* =================== FORMULARIO WEB =================== */
function buildForm() {
  const host = $('#settingsGroups');
  host.innerHTML = Object.keys(GROUP_NAMES).map(g => `
    <div class="group" data-group="${g}"><h3>${GROUP_NAMES[g]}</h3><div class="grid">${SCHEMA.filter(f => f.g === g).map(fieldHTML).join('')}</div></div>`).join('');
  host.addEventListener('input', onFormInput);
  host.addEventListener('change', onFormInput);
  document.querySelectorAll('input[name=mode],input[name=exercise]').forEach(i => i.addEventListener('change', () => {
    if (i.name === 'mode') setSetting('mode', i.value); else setSetting('exercise', i.value);
    syncForm();
  }));
  $('#btnReset').addEventListener('click', () => { SCHEMA.forEach(f => settings[f.key] = f.def); saveSettings(); onSettingChanged('*'); syncForm(); });
}
function fieldHTML(f) {
  const id = 'f-' + f.key;
  let body = '';
  if (f.type === 'num') {
    body = `<div class="num"><input type="range" id="${id}-r" data-key="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" aria-label="${f.label}">
      <input type="number" id="${id}" data-key="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" inputmode="decimal">
      <span class="unit">${f.unit || ''}</span></div>`;
  } else {
    const opts = f.type === 'toggle' ? [[1, 'Sí'], [0, 'No']] : f.opts;
    body = `<div class="seg" role="radiogroup" aria-label="${f.label}">${opts.map((o, i) => `<label><input type="radio" name="${id}" id="${id}-${i}" data-key="${f.key}" value="${o[0]}">${o[1]}</label>`).join('')}</div>`;
  }
  const lab = f.type === 'num' ? `<label for="${id}">${f.label}</label>` : `<span class="lab">${f.label}</span>`;
  return `<div class="field" data-field="${f.key}">${lab}${body}${f.zero ? `<span class="zero" id="${id}-z"></span>` : ''}${f.hint ? `<p class="hint">${f.hint}</p>` : ''}</div>`;
}
function onFormInput(ev) {
  const el = ev.target, key = el.dataset && el.dataset.key; if (!key) return;
  const f = FIELD[key];
  if (f.type === 'num') {
    if (el.type === 'number' && ev.type === 'input' && (el.value === '' || el.value.endsWith('.') || el.value.endsWith(','))) return;
    settings[key] = clampSetting(f, el.value); saveSettings(); onSettingChanged(key);
    const other = el.type === 'range' ? $(`#f-${key}`) : $(`#f-${key}-r`);
    if (other) other.value = settings[key];
    if (ev.type === 'change' && el.type === 'number') el.value = settings[key];
    const z = $(`#f-${key}-z`); if (z) z.textContent = settings[key] === 0 && f.zero ? f.zero : '';
  } else {
    const v = f.type === 'toggle' ? +el.value : el.value;
    settings[key] = clampSetting(f, v); saveSettings(); onSettingChanged(key);
  }
  updateSummary();
}
function syncForm() {
  const m = $(`#mode-${settings.mode}`); if (m) m.checked = true;
  const e = $(`#ex-${settings.exercise}`); if (e) e.checked = true;
  ['pushup', 'curl'].forEach(x => { const el = $(`#ex-${x}`); if (el) el.disabled = settings.mode === 'arcs'; });
  $('#exNote').hidden = settings.mode !== 'arcs';
  for (const f of SCHEMA) {
    const wrap = document.querySelector(`[data-field="${f.key}"]`);
    if (wrap) wrap.hidden = !fieldVisible(f);
    if (f.type === 'num') {
      const a = $(`#f-${f.key}`), b = $(`#f-${f.key}-r`);
      if (a) a.value = settings[f.key]; if (b) b.value = settings[f.key];
      const z = $(`#f-${f.key}-z`); if (z) z.textContent = settings[f.key] === 0 && f.zero ? f.zero : '';
    } else {
      const els = document.querySelectorAll(`input[name="f-${f.key}"]`);
      els.forEach(el => { el.checked = String(el.value) === String(settings[f.key]); });
    }
  }
  document.querySelectorAll('.group').forEach(g => { g.hidden = !SCHEMA.some(f => f.g === g.dataset.group && fieldVisible(f)); });
  updateSummary();
}
function repTime() { return { squat: 2.3, pushup: 2.4, curl: 1.3 }[settings.exercise]; }
function waveReps(i) { return Math.max(1, Math.round(settings.repsWave + settings.repsInc * i)); }
function updateSummary() {
  const n = settings.waves || 5;
  let total = 0; for (let i = 0; i < n; i++) total += waveReps(i);
  const restT = settings.rest * Math.max(0, n - 1);
  const workT = total * (settings.mode === 'arcs' ? 60 / settings.arcRate : repTime());
  const mins = Math.round((restT + workT) / 60);
  let speed = '';
  if (settings.mode === 'walkers') speed = `Los enemigos tardan ${settings.walkTime} s en alcanzarte.`;
  else if (settings.mode === 'flyers') speed = `Vuelan a ${fmtNum(settings.flySpeed)} km/h.`;
  else speed = `${settings.arcRate} arcos por minuto a ${fmtNum(settings.arcSpeed)} km/h, bajando entre ${Math.min(settings.arcMin, settings.arcMax)} y ${Math.max(settings.arcMin, settings.arcMax)} cm.`;
  $('#estimate').innerHTML = `${MODE_NAMES[settings.mode]} · ${EX_NAMES[settings.exercise]}: ${settings.waves ? `${settings.waves} oleadas` : 'oleadas sin fin (cuento las 5 primeras)'} suman <strong>${total}</strong> repeticiones${settings.exercise === 'curl' ? ' entre los dos brazos' : ''}, unos <strong>${Math.max(1, mins)} min</strong> con descansos. ${speed}`;
}
function renderHistory() {
  const h = store(HIST_KEY) || [];
  $('#histBody').innerHTML = Object.keys(EX_NAMES).map(ex => {
    const s = h.filter(r => r.ex === ex);
    return `<tr><td>${EX_NAMES[ex]}</td><td>${s.length}</td><td>${s.reduce((a, r) => a + r.reps, 0)}</td><td>${s.reduce((a, r) => Math.max(a, r.reps), 0) || '–'}</td><td>${s.reduce((a, r) => a + r.perfect, 0)}</td></tr>`;
  }).join('');
}
