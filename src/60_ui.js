
/* =================== ESTADO DEL JUGADOR =================== */
const head = { p: new V3(0, 1.6, 0), q: new Q4(), prev: new V3(), speed: 0 };
const mkJ = () => ({ p: new V3(), q: new Q4(), r: 0.008, ok: false });
const mkHand = () => ({ ok: false, isHand: false, trig: false, trigPrev: false, wrist: new V3(), wristQ: new Q4(), tip: new V3(), tipOk: false, pinch: false, J: HJ.map(mkJ), rayOk: false, rayO: new V3(), rayD: new V3(0, 0, -1), rayQ: new Q4() });
const hands = { left: mkHand(), right: mkHand() };
let lastStandY = 1.6;
function fwd(q = head.q) { return new V3(0, 0, -1).applyQuaternion(q); }
function fwdH(q = head.q) { const f = fwd(q); f.y = 0; if (f.lengthSq() < 1e-4) f.set(0, 0, -1); return f.normalize(); }
function yawOf(q) { const f = fwd(q); return Math.atan2(-f.x, -f.z); }
function standHeadY() { return clamp(lastStandY || 1.6, 1.2, 2.05); }

/* =================== WIDGETS QUE SE PULSAN CON EL DEDO =================== */
const STY = {
  normal: ['#211a3f', '#eeeaff', '#3cf0c6'], primary: ['#ff4fa3', '#1a0716', null], selected: ['#3cf0c6', '#0d0a1c', null],
  value: ['#120e26', '#ffd166', '#ffd166'], tab: ['#1a1530', '#a49fc8', '#30284f'], danger: ['#3a1020', '#ffb0c0', '#ff4a6a'], key: ['#2a2250', '#ffffff', '#4a3f80'], ghost: ['#1a1530', '#a49fc8', '#30284f']
};
class Btn {
  constructor(label, w, h, onPress, o = {}) {
    this.kind = 'btn'; this.w = w; this.h = h; this.label = label; this.onPress = onPress; this.style = o.style || 'normal'; this.font = o.font;
    this.p = makePanel(w, h, Math.round(clamp(2200 * w, 192, 1024)), { depthTest: o.depthTest });
    this.mesh = this.p.mesh; this.hover = false; this.cool = 0; this.baseZ = 0; this.prevZ = {}; this.draw();
  }
  setLabel(l, style) { if (l !== this.label || (style && style !== this.style)) { this.label = l; if (style) this.style = style; this.draw(); } }
  draw() {
    const c = this.p.ctx, W = this.p.W, H = this.p.H, s = STY[this.style] || STY.normal;
    c.clearRect(0, 0, W, H); rr(c, 4, 4, W - 8, H - 8, Math.min(H * 0.28, 28));
    c.fillStyle = this.hover ? '#ffd166' : s[0]; c.fill();
    if (s[2] && !this.hover) { c.lineWidth = Math.max(3, H * 0.04); c.strokeStyle = s[2]; c.stroke(); }
    c.fillStyle = this.hover ? '#1a0716' : s[1]; c.textAlign = 'center'; c.textBaseline = 'middle';
    fitFont(c, this.label, W - H * 0.4, Math.round(H * (this.font || 0.44)), (this.style === 'value' ? '700 %px ' : '700 %px ') + FB);
    c.fillText(this.label, W / 2, H / 2 + 2); this.p.tex.needsUpdate = true;
  }
}
class Slider {
  constructor(f, w, h, onDrag) {
    this.kind = 'slider'; this.f = f; this.w = w; this.h = h; this.onDrag = onDrag; this.value = settings[f.key]; this.pad = 0.012;
    this.p = makePanel(w, h, Math.round(clamp(2200 * w, 256, 1024))); this.mesh = this.p.mesh; this.hover = false; this.baseZ = 0; this.prevZ = {}; this.pending = false; this.draw();
  }
  frac() { return (this.value - this.f.min) / (this.f.max - this.f.min); }
  draw() {
    const c = this.p.ctx, W = this.p.W, H = this.p.H, pad = this.pad / this.w * W, y = H / 2, x0 = pad, x1 = W - pad, x = x0 + (x1 - x0) * this.frac();
    c.clearRect(0, 0, W, H);
    rr(c, x0 - H * 0.12, y - H * 0.12, x1 - x0 + H * 0.24, H * 0.24, H * 0.12); c.fillStyle = '#120e26'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#30284f'; c.stroke();
    rr(c, x0 - H * 0.12, y - H * 0.12, Math.max(H * 0.24, x - x0 + H * 0.12), H * 0.24, H * 0.12); c.fillStyle = '#ff4fa3'; c.fill();
    c.fillStyle = 'rgba(238,234,255,0.35)'; for (let i = 0; i <= 10; i++) { const tx = x0 + (x1 - x0) * i / 10; c.fillRect(tx - 1, y + H * 0.2, 2, H * 0.1); }
    c.beginPath(); c.arc(x, y, H * 0.3, 0, TAU); c.fillStyle = this.hover ? '#ffd166' : '#eeeaff'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#1a0716'; c.stroke();
    this.p.tex.needsUpdate = true;
  }
  set(v) { if (v !== this.value) { this.value = v; this.draw(); } }
  drag(u) {
    const f = this.f, v = clampSetting(f, f.min + u * (f.max - f.min));
    if (v !== this.value) { this.value = v; this.draw(); this.pending = true; SND.tick(); if (this.onDrag) this.onDrag(v, false); }
  }
  commit() { if (this.pending) { this.pending = false; if (this.onDrag) this.onDrag(this.value, true); } }
}
const fingers = [];
const _wl = new V3();
function pokeWidgets(list, dt, ready = true) {
  for (const w of list) {
    if (!w.mesh.visible) continue;
    w.cool = Math.max(0, (w.cool || 0) - dt);
    let hover = false, press = false, touching = false, drag = null;
    for (const f of fingers) {
      if (w.only && w.only !== f.side) continue;
      const l = w.mesh.worldToLocal(_wl.copy(f.p));
      const inX = Math.abs(l.x) < w.w / 2 + 0.006, inY = Math.abs(l.y) < w.h / 2 + 0.006, prev = w.prevZ[f.side];
      if (inX && inY && l.z < 0.07 && l.z > -0.05) hover = true;
      if (w.kind === 'slider') {
        if (Math.abs(l.x) < w.w / 2 + 0.03 && Math.abs(l.y) < w.h / 2 + 0.02 && l.z < 0.02 && l.z > -0.07) { drag = clamp((l.x + w.w / 2 - w.pad) / (w.w - 2 * w.pad), 0, 1); touching = true; }
      } else {
        if (inX && inY && l.z < 0.012 && l.z > -0.07) { touching = true; if (prev !== undefined && prev >= 0.012) press = true; }
      }
      w.prevZ[f.side] = l.z;
    }
    if (hover !== w.hover) { w.hover = hover; w.draw(); }
    w.mesh.position.z = w.baseZ - (touching ? 0.004 : 0);
    if (w.kind === 'slider') { if (drag !== null && ready) w.drag(drag); else w.commit(); continue; }
    if (press && ready && w.cool <= 0) { w.cool = 0.35; SND.click(); w.onPress(); return true; }
  }
  return false;
}

/* =================== MENÚ: PANEL DE LA MUÑECA IZQUIERDA (O ATRIL) =================== */
// En las Quest el menú sale de la muñeca izquierda al girarla hacia la cara y se pulsa con el índice derecho.
// Con el ajuste «Atril», o en el ordenador, queda fijo delante de ti.
let menu = null, menuAnchor = null;
const wristMenuOn = () => xrActive && !preview && settings.menuWhere === 'wrist';
const MW = 0.76, PAD = 0.022, GAP = 0.01, LABW = 0.24;
// Capas del atril: son paneles semitransparentes casi pegados y, sin un orden fijo, el fondo
// tapaba botones según desde dónde se mirara. Se dibujan siempre fondo → botones → teclado → teclas.
const RO = { menu: 20, widget: 21, keypad: 22, key: 23 };
const stand = (() => {
  const g = new THREE.Group(), k = new Kit();
  k.add('steel', G.cyl(0.2, 0.24, 0.04, 24), C.dark, 0, 0.02, 0); k.add('glow', G.tor(0.21, 0.006, 4, 32), C.teal, 0, 0.042, 0, Math.PI / 2, 0, 0);
  g.add(k.build({ steel: M.steel, glow: M.glow }, { cast: true, receive: true }));
  const post = new THREE.Mesh(G.cyl(0.03, 0.035, 1, 12), M.steel); tint(post.geometry, C.gun); post.castShadow = true; g.add(post); g.post = post;
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 1, 0.012), M.glow); tint(strip.geometry, C.teal); g.add(strip); g.strip = strip;
  g.visible = false; scene.add(g); return g;
})();
function placeAnchor(dist) {
  const f = fwdH(), pos = head.p.clone().addScaledVector(f, dist); pos.y = preview ? Math.max(0.3, head.p.y - 0.3) : standHeadY() - 0.42;
  return { pos, yaw: yawOf(head.q) };
}
function disposeTree(o) { o.traverse(n => { if (n.material && n.material.map && n.material.map.isCanvasTexture) { n.material.map.dispose(); n.material.dispose(); if (n.geometry) n.geometry.dispose(); } }); }
function hideMenu(keepAnchor) {
  if (menu) { scene.remove(menu.group); disposeTree(menu.group); menu = null; }
  if (!keepAnchor) { menuAnchor = null; stand.visible = false; }
}
const ROWH = { title: 0.075, text: 0.034, btns: 0.07, field: 0.062, choice: 0.062, tabs: 0.056, space: 0.012 };
function openMenu(rows, opts = {}) {
  // con un menú abierto, el siguiente sale en el mismo sitio (también el que trajiste con «Traer menú»);
  // si no hay ninguno, delante de ti
  const reuse = menu && menuAnchor;
  hideMenu(true);
  if (!reuse) menuAnchor = opts.anchor || placeAnchor((opts.dist || settings.menuDist) / 100);
  const heights = rows.map(r => r.h || ROWH[r.t] || 0.06);
  const H = PAD * 2 + heights.reduce((a, b) => a + b, 0) + GAP * (rows.length - 1);
  const group = new THREE.Group(); group.rotation.order = 'YXZ';
  const bg = makePanel(MW, H, 1024); bg.mesh.renderOrder = RO.menu; group.add(bg.mesh);
  const c = bg.ctx, sc = bg.W / MW;
  rr(c, 4, 4, bg.W - 8, bg.H - 8, 34); c.fillStyle = 'rgba(14,10,28,0.95)'; c.fill(); c.lineWidth = 5; c.strokeStyle = opts.border || '#ff4fa3'; c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.03)'; for (let y = 0; y < bg.H; y += 6) c.fillRect(6, y, bg.W - 12, 2);
  const widgets = [], fieldRows = [];
  let y = H / 2 - PAD;
  const X0 = -MW / 2 + PAD, CW = MW - PAD * 2;
  const addW = (w, cx, cy) => { w.mesh.position.set(cx, cy, 0.003); w.baseZ = 0.003; w.mesh.renderOrder = RO.widget; group.add(w.mesh); widgets.push(w); return w; };
  const label = (text, cy, color = '#eeeaff') => { c.fillStyle = color; c.textAlign = 'left'; c.textBaseline = 'middle'; fitFont(c, text, (LABW - 0.01) * sc, 34, '500 %px ' + FB); c.fillText(text, (X0 - (-MW / 2)) * sc, (H / 2 - cy) * sc); };
  rows.forEach((r, i) => {
    const h = heights[i], cy = y - h / 2;
    if (r.t === 'title') { c.fillStyle = r.color || '#ffd166'; c.textAlign = 'center'; c.textBaseline = 'middle'; fitFont(c, r.text, (CW - 0.02) * sc, 60, '%px ' + FD); c.fillText(r.text, bg.W / 2, (H / 2 - cy) * sc + 4); }
    else if (r.t === 'text') { c.fillStyle = r.color || '#d8d3f5'; c.textAlign = 'center'; c.textBaseline = 'middle'; fitFont(c, r.text, (CW - 0.02) * sc, 30, '500 %px ' + FB); c.fillText(r.text, bg.W / 2, (H / 2 - cy) * sc); }
    else if (r.t === 'btns' || r.t === 'tabs') {
      const n = r.items.length, tot = r.items.reduce((a, it) => a + (it.flex || 1), 0), avail = CW - GAP * (n - 1); let x = X0;
      r.items.forEach(it => { const w = avail * (it.flex || 1) / tot; addW(new Btn(it.label, w, h, it.onPress, { style: it.style || (r.t === 'tabs' ? (it.on ? 'selected' : 'tab') : 'normal'), font: r.t === 'tabs' ? 0.4 : undefined }), x + w / 2, cy); x += w + GAP; });
    } else if (r.t === 'choice') {
      label(r.label, cy); const n = r.opts.length, avail = CW - LABW - GAP * (n - 1); let x = X0 + LABW; const w = avail / n;
      r.opts.forEach(([v, lab, dis]) => { addW(new Btn(lab, w, h, () => { if (!dis) r.onPick(v); }, { style: dis ? 'ghost' : (v === r.value ? 'selected' : 'normal'), font: 0.38 }), x + w / 2, cy); x += w + GAP; });
    } else if (r.t === 'field') {
      const f = FIELD[r.key]; label(f.short || f.label, cy);
      if (f.type === 'num') {
        const bw = 0.054, vw = 0.13, sw = CW - LABW - bw * 2 - vw - GAP * 3; let x = X0 + LABW;
        const row = { f };
        const commit = v => { setSetting(f.key, v); refreshRow(row); };
        row.minus = addW(new Btn('−', bw, h, () => commit(settings[f.key] - f.step), { font: 0.6 }), x + bw / 2, cy); x += bw + GAP;
        row.slider = addW(new Slider(f, sw, h, (v, done) => { row.value.setLabel(fmtVal(f, v)); if (done) commit(v); }), x + sw / 2, cy); x += sw + GAP;
        row.plus = addW(new Btn('+', bw, h, () => commit(settings[f.key] + f.step), { font: 0.6 }), x + bw / 2, cy); x += bw + GAP;
        row.value = addW(new Btn(fmtVal(f), vw, h, () => openKeypad(f, row), { style: 'value', font: 0.36 }), x + vw / 2, cy);
        fieldRows.push(row);
      } else if (f.type === 'multi') { // varios a la vez (al menos uno)
        const n = f.opts.length, w = (CW - LABW - GAP * (n - 1)) / n, row = { f, btns: [] }; let x = X0 + LABW;
        const on = () => String(settings[f.key]).split(',');
        f.opts.forEach(([v, lab]) => { row.btns.push(addW(new Btn(lab, w, h, () => {
          const cur = on(), next = cur.includes(v) ? cur.filter(k => k !== v) : [...cur, v]; if (!next.length) return;
          setSetting(f.key, next.join(',')); row.btns.forEach((b, j) => b.setLabel(b.label, on().includes(f.opts[j][0]) ? 'selected' : 'normal')); if (r.after) r.after();
        }, { style: on().includes(v) ? 'selected' : 'normal', font: 0.34 }), x + w / 2, cy)); x += w + GAP; });
      } else {
        const opts = f.type === 'toggle' ? [[1, 'Sí'], [0, 'No']] : f.opts, n = opts.length, avail = CW - LABW - GAP * (n - 1), w = avail / n; let x = X0 + LABW;
        const row = { f, btns: [] };
        opts.forEach(([v, lab]) => { row.btns.push(addW(new Btn(lab, w, h, () => { setSetting(f.key, v); row.btns.forEach((b, j) => b.setLabel(b.label, opts[j][0] === settings[f.key] ? 'selected' : 'normal')); if (opts.length && r.after) r.after(); }, { style: settings[f.key] === v ? 'selected' : 'normal', font: 0.38 }), x + w / 2, cy)); x += w + GAP; });
      }
    }
    y -= h + GAP;
  });
  bg.tex.needsUpdate = true;
  const wrist = wristMenuOn();
  scene.add(group);
  if (wrist) { // en la muñeca: la postura la pone updateWristMenu; solo lo pulsa la mano derecha
    widgets.forEach(w => { w.only = 'right'; });
    stand.visible = false; wristPose(group, H);
  } else {
    group.position.copy(menuAnchor.pos); group.rotation.set(-0.38, menuAnchor.yaw, 0);
    stand.visible = settings.menuWhere === 'stand';
    if (stand.visible) { // atril
      const n = new V3(0, 0, -1).applyAxisAngle(_up, menuAnchor.yaw);
      stand.position.set(menuAnchor.pos.x + n.x * 0.06, 0, menuAnchor.pos.z + n.z * 0.06);
      const postH = Math.max(0.1, menuAnchor.pos.y - H / 2 * Math.cos(0.38) - 0.02);
      stand.post.scale.y = postH; stand.post.position.y = postH / 2; stand.strip.scale.y = postH * 0.85; stand.strip.position.set(0, postH / 2, 0.034);
      stand.strip.position.applyAxisAngle(_up, menuAnchor.yaw);
    }
  }
  menu = { group, widgets, fieldRows, H, wrist, age: reuse ? 0.4 : 0, keypad: null, music: rows.some(r => r.music) ? spNowText() : null };
  return menu;
}
function refreshRow(row) { const f = row.f; row.slider.set(settings[f.key]); row.value.setLabel(fmtVal(f)); }

/* ---------- Teclado numérico ---------- */
function openKeypad(f, row) {
  if (!menu) return; closeKeypad();
  const KW = 0.32, kw = 0.086, kh = 0.06, g = 0.01, dispH = 0.09;
  const KH = PAD * 2 + dispH + 5 * kh + 5 * g;
  const grp = new THREE.Group(); grp.position.set(0, 0, 0.03); menu.group.add(grp);
  const bg = makePanel(KW, KH, 640); bg.mesh.renderOrder = RO.keypad; grp.add(bg.mesh);
  const kp = { f, row, str: '', fresh: true, grp, bg, widgets: [], KW, KH, dispH };
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', ',', '0', '⌫'];
  let y0 = KH / 2 - PAD - dispH - g;
  keys.forEach((k, i) => {
    const col = i % 3, rowI = Math.floor(i / 3), x = (col - 1) * (kw + g), y = y0 - kh / 2 - rowI * (kh + g);
    const b = new Btn(k, kw, kh, () => keypadKey(k), { style: 'key', font: 0.55 }); if (menu.wrist) b.only = 'right'; b.mesh.position.set(x, y, 0.003); b.baseZ = 0.003; b.mesh.renderOrder = RO.key; grp.add(b.mesh); kp.widgets.push(b);
  });
  const yb = y0 - kh / 2 - 4 * (kh + g), bw = (KW - PAD * 2 - g) / 2;
  const cancel = new Btn('Cancelar', bw, kh, () => closeKeypad(), { style: 'danger', font: 0.38 }), ok = new Btn('OK', bw, kh, () => keypadOK(), { style: 'primary', font: 0.45 });
  cancel.mesh.position.set(-(bw + g) / 2, yb, 0.003); ok.mesh.position.set((bw + g) / 2, yb, 0.003); cancel.baseZ = ok.baseZ = 0.003;
  if (menu.wrist) cancel.only = ok.only = 'right';
  cancel.mesh.renderOrder = ok.mesh.renderOrder = RO.key; grp.add(cancel.mesh, ok.mesh); kp.widgets.push(cancel, ok);
  menu.keypad = kp; drawKeypad();
}
function drawKeypad() {
  const kp = menu && menu.keypad; if (!kp) return;
  const c = kp.bg.ctx, W = kp.bg.W, H = kp.bg.H, s = W / kp.KW, f = kp.f;
  c.clearRect(0, 0, W, H); rr(c, 4, 4, W - 8, H - 8, 26); c.fillStyle = 'rgba(10,7,22,0.98)'; c.fill(); c.lineWidth = 5; c.strokeStyle = '#ffd166'; c.stroke();
  c.textAlign = 'left'; c.textBaseline = 'top'; c.fillStyle = '#a49fc8'; fitFont(c, f.short || f.label, W - 40, 24, '500 %px ' + FB); c.fillText(f.short || f.label, 22, 18);
  const shown = kp.fresh ? fmtNum(settings[f.key], f) : (kp.str || '0');
  rr(c, 18, 50, W - 36, kp.dispH * s - 30, 12); c.fillStyle = '#1d1738'; c.fill();
  c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillStyle = kp.fresh ? '#7d77a8' : '#ffffff'; c.font = `700 40px ${FB}`; c.fillText(shown + (f.unit ? ' ' + f.unit : ''), W - 34, 50 + (kp.dispH * s - 30) / 2);
  c.textAlign = 'left'; c.fillStyle = '#7d77a8'; c.font = `500 20px ${FB}`; c.fillText(`${fmtNum(f.min, f)}–${fmtNum(f.max, f)}`, 30, 50 + (kp.dispH * s - 30) / 2);
  kp.bg.tex.needsUpdate = true;
}
function keypadKey(k) {
  const kp = menu && menu.keypad; if (!kp) return;
  if (kp.fresh) { kp.str = ''; kp.fresh = false; }
  if (k === '⌫') kp.str = kp.str.slice(0, -1);
  else if (k === ',') { if (decimals(kp.f) > 0 && !kp.str.includes(',')) kp.str = (kp.str || '0') + ','; }
  else if (kp.str.replace(',', '').length < 5) kp.str = (kp.str === '0' ? '' : kp.str) + k;
  drawKeypad();
}
function keypadOK() {
  const kp = menu && menu.keypad; if (!kp) return;
  if (!kp.fresh && kp.str !== '') { setSetting(kp.f.key, kp.str); refreshRow(kp.row); }
  closeKeypad();
}
function closeKeypad() {
  const kp = menu && menu.keypad; if (!kp) return;
  menu.group.remove(kp.grp); disposeTree(kp.grp); menu.keypad = null;
}
function activeWidgets() { if (!menu) return []; return menu.keypad ? menu.keypad.widgets : menu.widgets; }

/* ---------- Botón de muñeca ---------- */
const watch = new Btn('MENÚ', 0.09, 0.042, () => onWatch(), { depthTest: false, style: 'primary', font: 0.5 });
watch.only = 'right'; scene.add(watch.mesh); watch.mesh.visible = false;
const _wu = new V3(), _wh = new V3(), _wo = new V3();
// ¿Miras la muñeca izquierda? (dorso o palma hacia la cara; con mando, el mando levantado delante)
function wristLook(h = hands.left, lim = 0.72) {
  if (!h.ok || state === 'idle') return false;
  const d = h.wrist.distanceTo(head.p);
  if (!h.isHand) return d < 0.65 && h.wrist.y < head.p.y - 0.1;
  _wu.set(0, 1, 0).applyQuaternion(h.wristQ); _wh.copy(head.p).sub(h.wrist).normalize();
  return Math.abs(_wu.dot(_wh)) > lim && d < 0.7;
}
function updateWatch(dt) {
  const h = hands.left;
  let show = false;
  // con mandos, X/Y del mando izquierdo hacen de botón de menú
  if (h.btnMenu && !watch.btnPrev) onWatch(); watch.btnPrev = h.btnMenu;
  const guns = pistolOn() && GAME_STATES.includes(state) && !h.isHand; // con las pistolas en la mano el botón estorbaría
  if (wristLook(h) && !(menu && menu.wrist) && !guns) { // con el menú en la muñeca, el propio panel hace de botón
    show = true;
    if (h.isHand) { _wu.set(0, 1, 0).applyQuaternion(h.wristQ); watch.mesh.position.copy(h.wrist).addScaledVector(_wu, Math.sign(_wu.dot(_wh)) * 0.045).add(_wo.set(0, 0, 0.035).applyQuaternion(h.wristQ)); }
    else watch.mesh.position.copy(h.wrist).add(_wo.set(0, 0.08, 0));
  }
  const lab = PLACE.on ? 'CANCELAR' : PLACE.wait ? 'AJUSTAR' : state === 'lobby' || state === 'end' ? 'TRAER MENÚ' : 'MENÚ';
  watch.setLabel(lab);
  watch.mesh.visible = show; watch.armT = show ? (watch.armT || 0) + dt : 0;
  if (show) { watch.mesh.lookAt(head.p); watch.baseZ = watch.mesh.position.z; pokeWidgets([watch], dt, watch.armT > 0.35); watch.mesh.position.z = watch.baseZ; }
  else if (watch.hover) { watch.hover = false; watch.draw(); }
}
// Panel de la muñeca: sale al mirarla (crece desde la muñeca), se queda quieto mientras acercas el dedo
// derecho para pulsar y se recoge al bajar el brazo.
const WMS = 0.46; // escala del panel a 45 cm de los ojos: 0,76 m de ancho en el atril → 35 cm
// escala a la distancia elegida: más lejos, más grande, para que se lea igual
const wristScale = () => WMS * clamp(settings.wristDist / 45, 0.8, 1.7);
const WM = { e: 0, on: false, gestT: 0, lostT: 0, near: false, init: false, pos: new V3(), q: new Q4(), from: new V3() };
const wristHint = glowSprite(0xff4fa3, 0.05, 0.8); wristHint.visible = false; scene.add(wristHint);
const _wm4 = new THREE.Matrix4(), _wmt = new V3(), _wmq = new Q4(), _wml = new V3();
function wristPose(group, H, k = 1) {
  const h = hands.left, S = wristScale(), e = 1 - Math.pow(1 - WM.e, 3), s = S * e;
  if (h.ok && !WM.near) {
    // sale de la muñeca y se aleja en la misma dirección hasta wristDist de los ojos, con el borde de abajo
    // a la altura de la muñeca y de cara a ti (demasiado cerca obliga a bizquear)
    _wh.copy(h.wrist).sub(head.p); _wh.y = 0; if (_wh.lengthSq() < 1e-4) _wh.copy(fwdH()); _wh.normalize();
    _wmt.copy(head.p).addScaledVector(_wh, Math.max(settings.wristDist / 100, Math.hypot(h.wrist.x - head.p.x, h.wrist.z - head.p.z)));
    _wmt.y = h.wrist.y + 0.03 + H * S / 2;
    _wm4.lookAt(head.p, _wmt, _up); _wm4.decompose(_wml, _wmq, _wh);
    if (!WM.init) { WM.pos.copy(_wmt); WM.q.copy(_wmq); WM.init = true; } else { WM.pos.lerp(_wmt, k); WM.q.slerp(_wmq, k); }
    WM.from.copy(h.wrist);
  }
  // al salir, viaja desde la muñeca hasta su sitio mientras crece
  group.position.lerpVectors(WM.from, WM.pos, e);
  group.quaternion.copy(WM.q); group.scale.setScalar(Math.max(0.001, s)); group.visible = WM.e > 0.01;
}
function updateWristMenu(dt) {
  const look = wristLook(hands.left, 0.6);
  // ¿está el índice derecho delante del panel? Entonces no se mueve ni se esconde
  WM.near = false;
  if (menu && menu.wrist && WM.e > 0.5 && hands.right.tipOk) { const l = menu.group.worldToLocal(_wml.copy(hands.right.tip)); WM.near = Math.abs(l.x) < MW / 2 + 0.15 && Math.abs(l.y) < menu.H / 2 + 0.15 && l.z < 0.3 && l.z > -0.15; }
  WM.gestT = look ? WM.gestT + dt : 0; WM.lostT = look || WM.near ? 0 : WM.lostT + dt;
  if (!WM.on && WM.gestT > 0.12) { WM.on = true; if (menu && menu.wrist) SND.tick(); }
  if (WM.on && WM.lostT > 0.5) WM.on = false;
  if (!menu || !menu.wrist) { WM.e = 0; WM.init = false; wristHint.visible = false; return; }
  WM.e = clamp(WM.e + (WM.on ? dt : -dt) / 0.22, 0, 1);
  wristPose(menu.group, menu.H, 1 - Math.exp(-dt * 14));
  // aviso: un punto que late en la muñeca mientras hay un menú recogido
  const h = hands.left; wristHint.visible = h.ok && WM.e < 0.05;
  if (wristHint.visible) { wristHint.position.copy(h.wrist).add(_wo.set(0, 0.04, 0)); const p = 0.04 + 0.015 * Math.sin(performance.now() / 160); wristHint.scale.set(p, p, 1); }
}
const wristReady = () => !menu || !menu.wrist || WM.e > 0.95;
function onWatch() {
  if (PLACE.on) { cancelPlace(); return; }
  if (PLACE.wait) { PLACE.wait = false; center.mesh.visible = false; adjustMenu(PLACE.back); return; }
  if (GAME_STATES.includes(state)) openPause();
  else if (menu) { menuAnchor = placeAnchor(0.45); const rebuild = menu.rebuild; if (rebuild) rebuild(); }
}

/* =================== PANELES DE VISTA =================== */
const center = makePanel(0.5, 0.2, 1024, { depthTest: false }); scene.add(center.mesh); center.mesh.visible = false;
const toastP = makePanel(0.34, 0.06, 768, { depthTest: false }); scene.add(toastP.mesh); toastP.mesh.visible = false;
let toastT = 0;
function showToast(text, color, dur) {
  if (!GAME_STATES.includes(state) || !settings.toasts) return;
  const c = toastP.ctx, W = toastP.W, H = toastP.H; c.clearRect(0, 0, W, H);
  rr(c, 4, 4, W - 8, H - 8, H / 2 - 4); c.fillStyle = 'rgba(14,10,28,0.72)'; c.fill();
  c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle'; fitFont(c, text, W - 60, 72, '%px ' + FD); c.fillText(text, W / 2, H / 2 + 3);
  toastP.tex.needsUpdate = true; toastT = dur; toastP.mesh.visible = true;
}
const hurtMat = new THREE.MeshBasicMaterial({ map: texFrom((() => { const c = mkCanvas(128), x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 18, 64, 64, 64); g.addColorStop(0, 'rgba(255,0,30,0)'); g.addColorStop(1, 'rgba(255,0,30,1)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return c; })()), transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
const hurtPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), hurtMat); hurtPlane.renderOrder = 40; scene.add(hurtPlane); hurtPlane.visible = false;
let hurtT = 0;
const _hl = new V3();
function headLocal(off, out) { return out.copy(off).applyQuaternion(head.q).add(head.p); }
/* ---------- Ningún panel tapa lo que viene hacia ti ---------- */
// Lo que tiene que verse siempre: los objetivos (Toques y Barras) y los enemigos, con su centro y su radio en el mundo
const _ocP = [], _ocR = [], _ocH = new V3(), _ocT = new V3(), _ocDummy = new THREE.Object3D();
function collectThreats() {
  let n = 0; const put = (o, r) => { o.center(_ocP[n] || (_ocP[n] = new V3())); _ocR[n++] = r; };
  for (const x of touches) if (x.alive && !x.judged) put(x, x.part === 'head' ? x.r * 1.7 : 0.16);
  for (const e of enemies) if (e.alive) put(e, e.type === 'robot' ? 0.9 * e.K.scale : Math.max(0.1, e.radius * 1.5));
  return n;
}
// ¿Tapa este panel (w × h en su plano) alguno de esos n? Un panel normal solo tapa lo que queda detrás de él; uno sin
// prueba de profundidad (los avisos de la vista) se dibuja encima de todo lo que cae dentro de su silueta
function panelHides(obj, w, h, always, n) {
  obj.updateMatrixWorld(); const e = obj.matrixWorld.elements, sc = Math.hypot(e[0], e[1], e[2]) || 1;
  obj.worldToLocal(_ocH.copy(head.p)); if (_ocH.z <= 0.01) return false; // por detrás no se ve
  for (let i = 0; i < n; i++) {
    obj.worldToLocal(_ocT.copy(_ocP[i])); if (_ocT.z >= _ocH.z) continue; // la mirada hacia él no cruza el panel
    const s = _ocH.z / (_ocH.z - _ocT.z); if (!always && s > 1) continue; // está más cerca que el panel: se ve delante
    const m = _ocR[i] / sc * s, px = _ocH.x + (_ocT.x - _ocH.x) * s, py = _ocH.y + (_ocT.y - _ocH.y) * s;
    if (Math.abs(px) < w / 2 + m && Math.abs(py) < h / 2 + m) return true;
  }
  return false;
}
// Avisos pegados a la vista: si en su sitio tapan algo, se van a otro hueco (arriba o a un lado); si no hay ninguno libre, se aclaran
const HUD = { toast: { slots: [[0, -0.36], [0, 0.34], [-0.42, -0.22], [0.42, -0.22]], z: -1.1, w: 0.34, h: 0.06, slot: 0, off: new V3(0, -0.36, -1.1), fade: 1 },
  center: { slots: [[0, -0.08], [0, 0.34], [0, -0.42]], z: -1.0, w: 0.5, h: 0.2, slot: 0, off: new V3(0, -0.08, -1.0), fade: 1 }, board: 1 };
function hudSlot(P, slots, n, dt) {
  const free = i => { headLocal(_hl.set(slots[i][0], slots[i][1], P.z), _ocDummy.position); _ocDummy.quaternion.copy(head.q); return !n || !panelHides(_ocDummy, P.w, P.h, true, n); };
  let pick = slots[P.slot] && free(P.slot) ? P.slot : -1;
  for (let i = 0; pick < 0 && i < slots.length; i++) if (free(i)) pick = i;
  if (pick >= 0) P.slot = pick; else P.slot = Math.min(P.slot, slots.length - 1);
  P.off.lerp(_hl.set(slots[P.slot][0], slots[P.slot][1], P.z), 1 - Math.exp(-dt * 10));
  P.fade += ((pick >= 0 ? 1 : 0.15) - P.fade) * Math.min(1, dt * 8);
  return headLocal(P.off, new V3());
}
function updateViewPanels(dt) {
  const k = 1 - Math.exp(-dt * 4), n = GAME_STATES.includes(state) ? collectThreats() : 0;
  if (center.mesh.visible) {
    const C = HUD.center, slots = menu && !menu.wrist ? [[0, 0.2]] : C.slots; // con el atril abierto, por encima para no taparlo
    const tgt = hudSlot(C, slots, n, dt);
    if (!center.mesh.userData.init) { center.mesh.position.copy(tgt); center.mesh.quaternion.copy(head.q); center.mesh.userData.init = true; }
    center.mesh.position.lerp(tgt, k); center.mesh.quaternion.slerp(head.q, k); center.mesh.material.opacity = C.fade;
  } else center.mesh.userData.init = false;
  if (toastP.mesh.visible) {
    toastT -= dt; if (toastT <= 0) toastP.mesh.visible = false;
    toastP.mesh.position.copy(hudSlot(HUD.toast, HUD.toast.slots, n, dt)); toastP.mesh.quaternion.copy(head.q); toastP.mesh.material.opacity = Math.min(1, toastT * 3) * HUD.toast.fade;
  }
  // el marcador está fijo: si algo de lo que viene queda detrás de él, se vuelve casi transparente hasta que pasa
  const hide = n > 0 && board.mesh.parent && panelHides(board.mesh, 1.06, 0.5, false, n);
  HUD.board += ((hide ? 0.12 : 1) - HUD.board) * Math.min(1, dt * 8);
  board.mesh.material.opacity = HUD.board; boardFrameMat.opacity = HUD.board; boardFrameMat.depthWrite = HUD.board > 0.98;
  if (hurtT > 0) { hurtT -= dt; hurtMat.opacity = Math.max(0, hurtT) * 1.3; headLocal(_hl.set(0, 0, -0.3), hurtPlane.position); hurtPlane.quaternion.copy(head.q); hurtPlane.visible = true; }
  else hurtPlane.visible = false;
}
function centerBar(c, W, H, frac, color = '#3cf0c6') { c.fillStyle = '#2f2853'; rr(c, 44, H - 66, W - 88, 22, 11); c.fill(); c.fillStyle = color; rr(c, 44, H - 66, Math.max(22, (W - 88) * clamp(frac, 0, 1)), 22, 11); c.fill(); }
function drawCenter() {
  const c = center.ctx, W = center.W, H = center.H; c.clearRect(0, 0, W, H);
  rr(c, 6, 6, W - 12, H - 12, 30); c.fillStyle = 'rgba(14,10,28,0.86)'; c.fill(); c.lineWidth = 4; c.strokeStyle = 'rgba(60,240,198,.6)'; c.stroke();
  c.textBaseline = 'middle';
  if (PLACE.on || PLACE.wait) {
    const door = PLACE.kind === 'door';
    c.fillStyle = '#3cf0c6'; c.font = `50px ${FD}`; c.textAlign = 'left';
    if (PLACE.wait) {
      const nm = eqName(PLACE.kind); c.fillText(`¡${nm.name.toUpperCase()} ${nm.pl ? 'COLOCADAS' : 'COLOCADA'}!`, 44, 68);
      c.fillStyle = '#eeeaff'; c.font = `500 36px ${FB}`; [PLACE.note, door ? 'Suéltate: ahora aparecen los ajustes finos.' : 'Ponte de pie: aparecen los ajustes finos.'].forEach((l, i) => { fitFont(c, l, W - 88, 36, '500 %px ' + FB); c.fillText(l, 44, 148 + i * 52); });
      centerBar(c, W, H, 1);
    } else {
      c.fillText('COLOCAR ' + eqName(PLACE.kind).name.toUpperCase(), 44, 68);
      const L = door ? ['Agárrala con las dos manos por', `encima de la cabeza. Quieto ${PLACE_HOLD} s.`] : dipOne() ? ['Túmbate cruzado debajo y agárrala con', `las dos manos, brazos estirados. Quieto ${PLACE_HOLD} s.`] : ['Túmbate debajo y agárralas con los', `brazos estirados. Quieto ${PLACE_HOLD} s.`];
      c.fillStyle = '#eeeaff'; c.font = `500 40px ${FB}`; L.forEach((l, i) => c.fillText(l, 44, 148 + i * 52));
      const st = !PLACE.seen ? ['No veo tus manos: míralas', '#ff8a3d'] : !PLACE.up ? ['Sube las manos por encima de la cabeza', '#ff8a3d'] : !PLACE.ok ? ['Separa más las manos', '#ff8a3d'] : ['Bien: no te muevas', '#3cf0c6'];
      c.font = `500 34px ${FB}`; c.fillStyle = st[1]; c.fillText(st[0], 44, 258);
      c.font = `500 26px ${FB}`; c.fillStyle = PLACE.note ? '#ffd166' : '#a49fc8'; c.fillText(PLACE.note || 'Cancelar: botón de la muñeca izquierda', 44, 304);
      if (PLACE.t > 0) { c.textAlign = 'right'; c.fillStyle = '#ffffff'; c.font = `110px ${FD}`; c.fillText(String(Math.max(1, Math.ceil(PLACE_HOLD - PLACE.t))), W - 50, 150); }
      centerBar(c, W, H, PLACE.t / PLACE_HOLD);
    }
  } else if (state === 'mount') {
    const row = settings.exercise === 'row';
    if (BAR.phase === 'place') {
      c.fillStyle = BAR.resume ? '#3cff8a' : '#3cf0c6'; c.font = `50px ${FD}`; c.textAlign = 'left'; c.fillText(BAR.resume ? (row ? '¡A LAS PARALELAS!' : '¡A LA BARRA!') : row ? 'PARALELAS' : 'BARRA', 44, 68);
      const L = row ? [`Túmbate bajo ${eqName().the}, ${dipOne() ? 'agárrala' : 'agárralas'}`, 'y estira los brazos. Quieto 1 s.'] : ['Ponte bajo la barra, o cuélgate', 'ya de ella. Quieto 1 s.'];
      c.fillStyle = '#eeeaff'; c.font = `500 40px ${FB}`; L.forEach((l, i) => c.fillText(l, 44, 148 + i * 52));
      const near = barNear(); c.font = `32px ${FB}`; c.fillStyle = near ? '#3cf0c6' : '#ff8a3d'; c.textAlign = 'right'; c.fillText(near ? 'en posición' : 'lejos de ' + eqName().the, W - 44, 68);
      centerBar(c, W, H, BAR.still / 0.8);
    } else {
      c.textAlign = 'center'; c.fillStyle = '#ffd166'; c.font = `56px ${FD}`; c.fillText(row ? '¡AGÁRRATE!' : '¡CUÉLGATE!', W / 2, 80);
      c.fillStyle = '#ffffff'; c.font = `${BAR.phase === 'count' ? 120 : 80}px ${FD}`; c.fillText(BAR.phase === 'count' ? String(Math.max(1, Math.ceil(3 - BAR.t))) : 'QUIETO', W / 2, 230);
    }
  } else if (state === 'between') {
    const nb = SES.blocks[SES.idx + 1];
    c.textAlign = 'left'; c.fillStyle = '#3cf0c6'; c.font = `50px ${FD}`; c.fillText('DESCANSO', 44, 68);
    c.textAlign = 'right'; c.fillStyle = '#ffffff'; c.font = `110px ${FD}`; c.fillText(String(Math.max(0, Math.ceil(SES.wait))), W - 50, 150);
    c.textAlign = 'left'; c.fillStyle = '#eeeaff'; c.font = `500 36px ${FB}`; c.fillText(`Bloque ${SES.idx + 2} de ${SES.blocks.length}:`, 44, 150);
    if (nb) { c.fillStyle = '#ffd166'; fitFont(c, blockLabel(nb), W - 300, 40, '500 %px ' + FB); c.fillText(blockLabel(nb), 44, 210); }
    centerBar(c, W, H, SES.rest ? 1 - SES.wait / SES.rest : 1);
  } else if (state === 'calib') {
    c.fillStyle = '#3cf0c6'; c.font = `50px ${FD}`; c.textAlign = 'left'; c.fillText('CALIBRACIÓN', 44, 68);
    const L = { squat: ['De pie, mirando al frente, pies a la', 'anchura de los hombros. Quieto 2 s.'], pushup: ['Ponte en plancha: brazos estirados,', 'cuerpo recto. Quieto 2 s.'], plank1: ['Ponte en plancha sobre las dos manos,', 'cuerpo recto. Quieto 2 s.'], superman: ['Túmbate boca abajo con los brazos', 'estirados hacia delante. Quieto 2 s.'], curl: ['De pie, con las mancuernas y los', 'brazos estirados abajo. Quieto 2 s.'], jump: ['De pie, mirando al frente, con', 'espacio para saltar. Quieto 2 s.'], lunge: ['De pie, pies juntos, con espacio', 'delante para dar el paso. Quieto 2 s.'], dips: ['En el borde de la silla, manos en el', 'asiento, brazos estirados. Quieto 2 s.'], press: ['De pie, mancuernas a la altura', 'de los hombros. Quieto 2 s.'], splank: ['De lado sobre el antebrazo,', 'cuerpo recto, cadera arriba. Quieto 2 s.'], abs: ['Túmbate boca arriba, rodillas', 'dobladas, pies al frente. Quieto 2 s.'] }[settings.exercise === 'combo' ? { stand: 'squat', floor: 'pushup', abs: 'abs' }[settings.comboBase] : settings.exercise];
    c.fillStyle = '#eeeaff'; c.font = `500 40px ${FB}`; L.forEach((l, i) => c.fillText(l, 44, 148 + i * 52));
    c.fillStyle = '#2f2853'; rr(c, 44, H - 66, W - 88, 22, 11); c.fill();
    c.fillStyle = '#3cf0c6'; rr(c, 44, H - 66, Math.max(22, (W - 88) * Math.min(1, calibT / 2)), 22, 11); c.fill();
    if (settings.exercise === 'curl' || settings.exercise === 'press' || settings.exercise === 'plank1' || settings.exercise === 'superman' || (settings.mode === 'flyers' && settings.aim === 'hands' && settings.exercise === 'squat') || pistolOn()) {
      const ok = hands.left.ok || hands.right.ok; c.font = `32px ${FB}`; c.fillStyle = ok ? '#3cf0c6' : '#ff8a3d'; c.textAlign = 'right'; c.fillText(ok ? 'manos detectadas' : 'no veo tus manos', W - 44, 68);
    }
  } else {
    c.textAlign = 'center'; c.fillStyle = '#ffd166'; c.font = `56px ${FD}`; c.fillText('¡PREPÁRATE!', W / 2, 80);
    c.fillStyle = '#ffffff'; c.font = `120px ${FD}`; c.fillText(String(Math.max(1, Math.ceil(3 - stateT))), W / 2, 230);
  }
  center.tex.needsUpdate = true;
}

/* =================== MARCADOR =================== */
function repsLeft() {
  if (settings.exercise === 'hang') return Math.max(0, Math.ceil(BAR.need - BAR.hold));
  if (settings.mode === 'arcs') return spawnQueue.length + arcs.filter(a => !a.judged && !a.second).length;
  if (settings.mode === 'touch') return spawnQueue.length + touches.filter(x => x.alive && !x.judged).length;
  let hp = spawnQueue.reduce((a, e) => a + e.hp, 0); for (const e of enemies) if (e.alive) hp += Math.max(0, e.hp - e.pending);
  return Math.ceil(hp / (twoShots() ? 2 : 1));
}
function drawBoard() {
  const c = board.ctx, W = board.W, H = board.H;
  c.clearRect(0, 0, W, H);
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#140f28'); g.addColorStop(1, '#0a0817'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.fillStyle = 'rgba(255,255,255,0.025)'; for (let y = 0; y < H; y += 6) c.fillRect(0, y, W, 2);
  c.strokeStyle = '#3cf0c6'; c.lineWidth = 6; c.strokeRect(3, 3, W - 6, H - 6);
  c.textBaseline = 'middle';
  if (!['calib', 'ready', 'mount', 'play', 'rest', 'paused', 'end', 'between'].includes(state)) {
    c.textAlign = 'center'; c.fillStyle = '#ff4fa3'; c.font = `96px ${FD}`; c.fillText('REPARENA', W / 2, 150);
    c.fillStyle = '#eeeaff'; c.font = `500 40px ${FB}`; c.fillText(`${MODE_NAMES[settings.mode]} · ${EX_NAMES[settings.exercise]}`, W / 2, 250);
    c.fillStyle = '#a49fc8'; c.font = `500 32px ${FB}`; c.fillText(wristMenuOn() ? 'Gira la muñeca izquierda hacia ti: ahí está el menú' : 'Acércate al menú y pulsa EMPEZAR', W / 2, 320);
    board.tex.needsUpdate = true; return;
  }
  const N = settings.waves;
  const wv = N ? `OLEADA ${Math.min(waveIdx + 1, N)}/${N}` : `OLEADA ${waveIdx + 1}`;
  c.textAlign = 'left'; c.font = `40px ${FD}`; c.fillStyle = '#a49fc8'; fitFont(c, SES.active ? `BLOQUE ${SES.idx + 1}/${SES.blocks.length} · ${wv}` : wv, 330, 40, '%px ' + FD); c.fillText(SES.active ? `BLOQUE ${SES.idx + 1}/${SES.blocks.length} · ${wv}` : wv, 36, 52);
  c.textAlign = 'center'; c.fillStyle = '#ffd166'; c.fillText(String(score).padStart(6, '0'), W / 2, 52);
  c.textAlign = 'right';
  if (!settings.lives) { c.fillStyle = '#3cf0c6'; c.fillText('VIDAS ∞', W - 36, 52); }
  else if (settings.lives <= 8) { c.font = `50px ${FB}`; let s = ''; for (let i = 0; i < settings.lives; i++) s += i < lives ? '♥' : '♡'; c.fillStyle = '#ff4fa3'; fitFont(c, s, 360, 50, '%px ' + FB); c.fillText(s, W - 36, 52); }
  else { c.fillStyle = '#ff4fa3'; c.fillText(`♥ ${lives}/${settings.lives}`, W - 36, 52); }
  c.fillStyle = 'rgba(60,240,198,.25)'; c.fillRect(30, 88, W - 60, 3);
  const hang = settings.exercise === 'hang', bars = isBars();
  c.textAlign = 'left'; c.fillStyle = '#ffffff'; c.font = `170px ${FD}`; c.fillText(String(hang ? Math.floor(state === 'play' ? BAR.hold : stats.hold) : stats.reps), 36, 210);
  c.fillStyle = '#a49fc8'; const sub = hang ? (state === 'play' ? `SEGUNDOS COLGADO · FALTAN ${repsLeft()} S` : 'SEGUNDOS COLGADO EN TOTAL') : state === 'play' ? `REPETICIONES · FALTAN ~${repsLeft()} EN ESTA OLEADA` : 'REPETICIONES'; fitFont(c, sub, W - 90, 30, '%px ' + FD); c.fillText(sub, 42, 312);
  c.textAlign = 'right';
  if (state === 'rest') {
    c.fillStyle = '#3cf0c6'; c.font = `58px ${FD}`; c.fillText(`DESCANSO ${Math.ceil(settings.rest - stateT)}`, W - 36, 160);
    c.fillStyle = '#eeeaff'; c.font = `500 34px ${FB}`; c.fillText(hang ? `Siguiente oleada: ${hangSecs(waveIdx + 1)} s colgado` : `Siguiente oleada: ${waveReps(waveIdx + 1)} repeticiones`, W - 36, 226);
  } else if (state === 'mount') { c.fillStyle = '#3cf0c6'; c.font = `52px ${FD}`; c.fillText(settings.exercise === 'row' ? 'A LAS PARALELAS' : 'A LA BARRA', W - 36, 170); }
  else if (state === 'calib') { c.fillStyle = '#3cf0c6'; c.font = `52px ${FD}`; c.fillText('CALIBRANDO', W - 36, 170); }
  else if (state === 'ready') { c.fillStyle = '#ffd166'; c.font = `110px ${FD}`; c.fillText(String(Math.max(1, Math.ceil(3 - stateT))), W - 60, 190); }
  else if (state === 'paused') { c.fillStyle = '#ffd166'; c.font = `80px ${FD}`; c.fillText('PAUSA', W - 36, 180); }
  else if (state === 'between') { c.fillStyle = '#3cf0c6'; c.font = `58px ${FD}`; c.fillText(`DESCANSO ${Math.max(0, Math.ceil(SES.wait))}`, W - 36, 160); }
  else if (msg.t > 0) { c.globalAlpha = Math.min(1, msg.t * 2); c.fillStyle = msg.color; fitFont(c, msg.text, 560, 72, '%px ' + FD); c.fillText(msg.text, W - 36, 180); c.globalAlpha = 1; }
  else if (settings.mode === 'arcs' && nextArcDrop) { c.fillStyle = '#ff8a6a'; c.font = `46px ${FD}`; c.fillText(nextArcTilt ? `PRÓXIMO: INCLINADO, VE A LA ${nextArcTilt > 0 ? 'DERECHA →' : '← IZQUIERDA'}` : `PRÓXIMO: BAJA ${Math.round(nextArcDrop * 100)} CM`, W - 36, 180); }
  if (pistolOn() && ['play', 'rest', 'ready'].includes(state)) { c.fillStyle = GUN.ammo ? '#3cf0c6' : '#ff8a3d'; c.font = `38px ${FD}`; c.textAlign = 'right'; c.fillText(GUN.ammo ? `▮ MUNICIÓN ${GUN.ammo}` : '▯ SIN MUNICIÓN', W - 36, 262); }
  else if (charged) { c.fillStyle = '#' + POW_COL[chargePow - 1].toString(16).padStart(6, '0'); c.font = `38px ${FD}`; c.textAlign = 'right'; c.fillText(chargePow > 1 ? `● CARGA ×${chargePow}` : '● CARGADO', W - 36, 262); }
  c.fillStyle = 'rgba(60,240,198,.25)'; c.fillRect(30, H - 92, W - 60, 3);
  c.font = `500 34px ${FB}`; c.textAlign = 'left'; c.fillStyle = combo >= 5 ? '#ffd166' : '#eeeaff'; c.fillText(settings.exercise === 'hang' ? `Racha ${combo} s` : `Combo ×${combo}`, 36, H - 48);
  c.textAlign = 'center'; c.fillStyle = '#eeeaff';
  const mid = bars ? `Caídas ${stats.falls}` : settings.mode === 'flyers' ? `Precisión ${stats.shots ? Math.round(100 * stats.hits / stats.shots) : 0}%` : settings.mode === 'arcs' || settings.mode === 'touch' ? `${settings.mode === 'touch' ? 'Fallos' : 'Golpes recibidos'} ${stats.taken}` : `Perfectas ${stats.perfect}`;
  c.fillText(mid, W / 2, H - 48);
  c.textAlign = 'right';
  c.fillText(hang ? `Mejor racha ${stats.bestCombo} s` : settings.mode === 'arcs' ? `Arcos ${arcs.length + spawnQueue.length}` : settings.mode === 'touch' ? `Objetivos ${touches.filter(x => x.alive && !x.judged).length + spawnQueue.length}` : `${bars ? 'Objetivos' : 'Enemigos'} ${enemies.filter(e => e.alive).length + spawnQueue.length}`, W - 36, H - 48);
  board.tex.needsUpdate = true;
}
