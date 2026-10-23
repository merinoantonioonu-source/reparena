
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
// Cada parte del menú tiene su color: el botón que lleva a ella (borde y una raya a la izquierda) y el marco y el título de su
// submenú, para saber de un vistazo dónde estás
const MC = { ex: '#3cf0c6', foes: '#ff8a3d', arms: '#ff4fa3', sound: '#a68bff', scene: '#7ee081', set: '#ffd166', prof: '#5ab8ff', body: '#5ab8ff' };
// Iconos dibujados (no dependen de que la letra tenga esos símbolos): reproducir, pausa, anterior, siguiente y volumen
function drawIcon(c, k, x, y, S, col) {
  c.save(); c.translate(x, y); c.fillStyle = col; c.strokeStyle = col; c.lineWidth = S * 0.12; c.lineCap = 'round'; c.lineJoin = 'round';
  const tri = (x0, dir, w, h) => { c.beginPath(); c.moveTo(x0, -h); c.lineTo(x0 + dir * w, 0); c.lineTo(x0, h); c.closePath(); c.fill(); };
  const bar = (x0, w, h) => { c.fillRect(x0, -h, w, h * 2); };
  if (k === 'play') tri(-S * 0.32, 1, S * 0.72, S * 0.45);
  else if (k === 'pause') { bar(-S * 0.34, S * 0.24, S * 0.42); bar(S * 0.1, S * 0.24, S * 0.42); }
  else if (k === 'next' || k === 'prev') { const d = k === 'next' ? 1 : -1; c.scale(d, 1); tri(-S * 0.42, 1, S * 0.42, S * 0.38); tri(-S * 0.02, 1, S * 0.42, S * 0.38); bar(S * 0.4, S * 0.12, S * 0.38); }
  else if (k === 'voldown' || k === 'volup') {
    c.beginPath(); c.moveTo(-S * 0.62, -S * 0.17); c.lineTo(-S * 0.42, -S * 0.17); c.lineTo(-S * 0.12, -S * 0.42); c.lineTo(-S * 0.12, S * 0.42); c.lineTo(-S * 0.42, S * 0.17); c.lineTo(-S * 0.62, S * 0.17); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(S * 0.12, 0); c.lineTo(S * 0.56, 0); if (k === 'volup') { c.moveTo(S * 0.34, -S * 0.22); c.lineTo(S * 0.34, S * 0.22); } c.stroke();
  }
  c.restore();
}
// Galones del rango: del recluta al sargento, galones (uno, dos, tres; el sargento con su arco debajo); el teniente, el capitán y
// el general, estrellas (una, dos y tres, las del general doradas)
function drawRank(c, i, x, y, S, col) {
  c.save(); c.translate(x, y); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = S * 0.14; c.lineJoin = 'round'; c.lineCap = 'round';
  const chev = dy => { c.beginPath(); c.moveTo(-S * 0.44, dy + S * 0.17); c.lineTo(0, dy - S * 0.17); c.lineTo(S * 0.44, dy + S * 0.17); c.stroke(); };
  const star = (sx, r) => { c.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rad = k % 2 ? r * 0.45 : r; c.lineTo(sx + Math.cos(a) * rad, Math.sin(a) * rad); } c.closePath(); c.fill(); };
  if (i <= 3) { const n = Math.min(3, i + 1), up = i === 3 ? S * 0.14 : 0; for (let k = 0; k < n; k++) chev((k - (n - 1) / 2) * S * 0.3 - up); if (i === 3) { c.beginPath(); c.arc(0, -S * 0.32, S * 0.6, 0.28 * Math.PI, 0.72 * Math.PI); c.stroke(); } }
  else { const n = i - 3; if (n === 3) c.fillStyle = '#ffd166'; for (let k = 0; k < n; k++) star((k - (n - 1) / 2) * S * 0.46, S * 0.24); }
  c.restore();
}
class Btn {
  constructor(label, w, h, onPress, o = {}) {
    this.kind = 'btn'; this.w = w; this.h = h; this.label = label; this.onPress = onPress; this.style = o.style || 'normal'; this.font = o.font; this.accent = o.accent; this.icon = o.icon; this.badge = o.badge;
    this.p = makePanel(w, h, Math.round(clamp(2200 * w, 192, 1024)), { depthTest: o.depthTest });
    this.mesh = this.p.mesh; this.hover = false; this.cool = 0; this.baseZ = 0; this.prevZ = {}; this.draw();
  }
  setLabel(l, style) { if (l !== this.label || (style && style !== this.style)) { this.label = l; if (style) this.style = style; this.draw(); } }
  draw() {
    const c = this.p.ctx, W = this.p.W, H = this.p.H, s = STY[this.style] || STY.normal;
    c.clearRect(0, 0, W, H); rr(c, 4, 4, W - 8, H - 8, Math.min(H * 0.28, 28));
    c.fillStyle = this.hover ? '#ffd166' : s[0]; c.fill();
    const acc = this.accent && this.style === 'normal' && !this.hover;
    if ((s[2] || acc) && !this.hover) { c.lineWidth = Math.max(3, H * 0.04); c.strokeStyle = acc ? this.accent : s[2]; c.stroke(); }
    if (acc) { rr(c, H * 0.12, H * 0.22, Math.max(6, H * 0.07), H * 0.56, Math.max(3, H * 0.035)); c.fillStyle = this.accent; c.fill(); }
    c.fillStyle = this.hover ? '#1a0716' : s[1]; c.textAlign = 'center'; c.textBaseline = 'middle';
    if (this.icon) { drawIcon(c, this.icon, W / 2, H / 2, H * 0.5, this.hover ? '#1a0716' : s[1]); this.p.tex.needsUpdate = true; return; } // botones con icono (los de la música)
    if (this.badge !== undefined) drawRank(c, this.badge, H * 0.62, H / 2, H * 0.62, this.hover ? '#1a0716' : s[1]); // galones a la izquierda
    const ax = this.badge !== undefined ? H * 0.42 : this.accent && this.style === 'normal' ? H * 0.18 : 0; // (el texto se aparta de la raya de color o de los galones)
    fitFont(c, this.label, W - H * 0.4 - ax * 2, Math.round(H * (this.font || 0.44)), (this.style === 'value' ? '700 %px ' : '700 %px ') + FB);
    c.fillText(this.label, W / 2 + ax, H / 2 + 2); this.p.tex.needsUpdate = true;
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
// Para que no se pulsen botones sin querer: tras una pulsación, ese dedo no pulsa nada más hasta que se aleja un poco
// (POKE_MOVE) del sitio donde pulsó, y entre dos pulsaciones pasa un momento. En cada fotograma cuenta como mucho una
// pulsación, la del botón en cuyo centro está más metido el dedo (con el dedo entre dos botones no se pulsan los dos).
// Tras pulsar (o al abrirse un menú), ese dedo no vuelve a pulsar ni a arrastrar hasta que se retira un poco del menú
// (POKE_BACK por delante de los botones o fuera de ellos): así la misma pulsación no toca el menú que se abre
const POKE = { lock: { left: null, right: null }, need: { left: false, right: false }, until: 0 }, POKE_MOVE = 0.04, POKE_GAP = 0.45, POKE_BACK = 0.02;
function pokeWidgets(list, dt, ready = true, isMenu = false) {
  const now = performance.now() / 1000;
  for (const f of fingers) { const L = POKE.lock[f.side]; if (L && f.p.distanceTo(L) > POKE_MOVE) POKE.lock[f.side] = null; }
  let best = null, bestD = Infinity; const near = { left: false, right: false };
  for (const w of list) {
    if (!w.mesh.visible) continue;
    w.cool = Math.max(0, (w.cool || 0) - dt);
    let hover = false, touching = false, drag = null;
    for (const f of fingers) {
      if (w.only && w.only !== f.side) continue;
      const l = w.mesh.worldToLocal(_wl.copy(f.p));
      const inX = Math.abs(l.x) < w.w / 2 + 0.006, inY = Math.abs(l.y) < w.h / 2 + 0.006, prev = w.prevZ[f.side], held = isMenu && POKE.need[f.side];
      if (Math.abs(l.x) < w.w / 2 + 0.03 && Math.abs(l.y) < w.h / 2 + 0.03 && l.z < POKE_BACK && l.z > -0.15) near[f.side] = true;
      if (inX && inY && l.z < 0.07 && l.z > -0.05) hover = true;
      if (w.kind === 'slider') {
        if (!held && Math.abs(l.x) < w.w / 2 + 0.03 && Math.abs(l.y) < w.h / 2 + 0.02 && l.z < 0.02 && l.z > -0.07) { drag = clamp((l.x + w.w / 2 - w.pad) / (w.w - 2 * w.pad), 0, 1); touching = true; }
      } else if (inX && inY && l.z < 0.012 && l.z > -0.07) {
        touching = true;
        // pulsa al cruzar la superficie desde delante, con el dedo ya dentro del botón (no en su borde)
        const d = Math.max(Math.abs(l.x) / (w.w / 2), Math.abs(l.y) / (w.h / 2));
        if (!held && prev !== undefined && prev >= 0.012 && d < 0.97 && !POKE.lock[f.side] && d < bestD) { bestD = d; best = { w, f }; }
      }
      w.prevZ[f.side] = l.z;
    }
    if (hover !== w.hover) { w.hover = hover; w.draw(); }
    w.mesh.position.z = w.baseZ - (touching ? 0.004 : 0);
    if (w.kind === 'slider') { if (drag !== null && ready) w.drag(drag); else w.commit(); }
  }
  if (isMenu) for (const f of fingers) {
    // retirado (más de POKE_BACK por delante del menú, o lejos de él): ya puede volver a pulsar
    if (!near[f.side] && menu && menu.group) { const l = menu.group.worldToLocal(_wl.copy(f.p)); if (Math.abs(l.x) < MW / 2 + 0.4 && Math.abs(l.y) < menu.H / 2 + 0.4 && l.z < POKE_BACK && l.z > -0.2) near[f.side] = true; }
    if (!near[f.side]) POKE.need[f.side] = false;
  }
  if (!best || !ready || best.w.cool > 0 || now < POKE.until) return false;
  POKE.lock[best.f.side] = best.f.p.clone(); POKE.until = now + POKE_GAP; best.w.cool = 0.35; if (isMenu) POKE.need[best.f.side] = true;
  SND.click(); haptic(best.f.side, 0.15, 15); best.w.onPress(); return true;
}

/* =================== MENÚ: PANEL DE LA MUÑECA IZQUIERDA (O ATRIL) =================== */
// En las Quest el menú sale de la muñeca izquierda con su botón MENÚ, se queda quieto delante de ti y se pulsa con el índice derecho.
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
// Dónde sale un menú nuevo: el punto es el centro de su borde de arriba (el menú cuelga de ahí, inclinado hacia ti), a
// la altura del pecho y a tu alcance; así, por alto que sea el menú, lo de arriba no se aleja ni se sube
function placeAnchor(dist) {
  const f = fwdH(), pos = head.p.clone().addScaledVector(f, dist); pos.y = preview ? Math.max(0.5, head.p.y - 0.02) : standHeadY() - 0.18;
  return { pos, yaw: yawOf(head.q) };
}
function disposeTree(o) { o.traverse(n => { if (n.material && n.material.map && n.material.map.isCanvasTexture && !(n.material.userData && n.material.userData.keep)) { n.material.map.dispose(); n.material.dispose(); if (n.geometry) n.geometry.dispose(); } }); }
// Al cerrar un menú se recuerda su sitio un momento: si enseguida se abre otro (de un menú a otro), sale en el mismo sitio
let lastAnchor = null, lastAnchorT = -9;
function hideMenu(keepAnchor) {
  if (menu) { scene.remove(menu.group); disposeTree(menu.group); menu = null; }
  if (!keepAnchor) { if (menuAnchor) { lastAnchor = menuAnchor; lastAnchorT = performance.now() / 1000; } menuAnchor = null; stand.visible = false; }
}
const GRID_H = 0.046, ROWH = { title: 0.075, text: 0.034, btns: 0.07, field: 0.062, choice: 0.062, tabs: 0.056, space: 0.012 };
// Los textos largos se parten en líneas (a un tamaño que se lee) en vez de encogerse hasta no leerse
const TXT_FONT = '500 27px ' + FB, TXT_LH = 0.03; let _wrapCtx = null;
function wrapLines(text, maxPx) {
  if (!_wrapCtx) _wrapCtx = mkCanvas(8).getContext('2d'); const c = _wrapCtx; c.font = TXT_FONT;
  if (c.measureText(text).width <= maxPx) return [text];
  const lines = []; let cur = '';
  for (const w of String(text).split(' ')) { const t = cur ? cur + ' ' + w : w; if (cur && c.measureText(t).width > maxPx) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines;
}
function openMenu(rows, opts = {}) {
  // con un menú abierto, el siguiente sale en el mismo sitio (también el que trajiste con «Traer menú»);
  // si no hay ninguno, delante de ti
  const reuse = menu && menuAnchor, recent = !reuse && !opts.anchor && lastAnchor && performance.now() / 1000 - lastAnchorT < 2;
  hideMenu(true);
  if (recent) menuAnchor = lastAnchor;
  else if (!reuse) menuAnchor = opts.anchor || placeAnchor(0.75 * (opts.dist || settings.menuDist) / 100);
  POKE.need.left = POKE.need.right = true; // en el menú nuevo, el dedo que acaba de pulsar tiene que retirarse antes de pulsar otra vez
  // las selecciones con muchas opciones (Enemigos) van en rejilla: f.grid por fila
  rows.forEach(r => { const f = r.t === 'field' && FIELD[r.key]; if (f && f.grid && !r.h) r.h = Math.ceil(f.opts.length / f.grid) * (GRID_H + GAP) - GAP; });
  const wrapPx = (MW - PAD * 2 - 0.02) * 1024 / MW, lines = rows.map(r => r.t === 'text' && !r.h ? wrapLines(r.text, wrapPx) : null);
  const heights = rows.map((r, i) => r.h || (lines[i] && lines[i].length > 1 ? ROWH.text + (lines[i].length - 1) * TXT_LH : ROWH[r.t]) || 0.06);
  const H = PAD * 2 + heights.reduce((a, b) => a + b, 0) + GAP * (rows.length - 1);
  const group = new THREE.Group(); group.rotation.order = 'YXZ';
  const bg = makePanel(MW, H, 1024); bg.mesh.renderOrder = RO.menu; group.add(bg.mesh);
  const c = bg.ctx, sc = bg.W / MW;
  rr(c, 4, 4, bg.W - 8, bg.H - 8, 34); c.fillStyle = 'rgba(14,10,28,0.95)'; c.fill(); c.lineWidth = 5; c.strokeStyle = opts.border || opts.accent || '#ff4fa3'; c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.03)'; for (let y = 0; y < bg.H; y += 6) c.fillRect(6, y, bg.W - 12, 2);
  const widgets = [], fieldRows = [];
  let y = H / 2 - PAD;
  const X0 = -MW / 2 + PAD, CW = MW - PAD * 2;
  const addW = (w, cx, cy) => { w.mesh.position.set(cx, cy, 0.003); w.baseZ = 0.003; w.mesh.renderOrder = RO.widget; group.add(w.mesh); widgets.push(w); return w; };
  const label = (text, cy, color = '#eeeaff', off = 0) => { c.fillStyle = color; c.textAlign = 'left'; c.textBaseline = 'middle'; fitFont(c, text, (LABW - 0.01 - off) * sc, 34, '500 %px ' + FB); c.fillText(text, (X0 + off - (-MW / 2)) * sc, (H / 2 - cy) * sc); };
  rows.forEach((r, i) => {
    const h = heights[i], cy = y - h / 2;
    if (r.t === 'title') { c.fillStyle = r.color || opts.accent || '#ffd166'; c.textAlign = 'center'; c.textBaseline = 'middle'; fitFont(c, r.text, (CW - 0.02) * sc, 60, '%px ' + FD); c.fillText(r.text, bg.W / 2, (H / 2 - cy) * sc + 4); }
    else if (r.t === 'text') {
      c.fillStyle = r.color || '#d8d3f5'; c.textAlign = 'center'; c.textBaseline = 'middle';
      if (lines[i] && lines[i].length > 1) { c.font = TXT_FONT; lines[i].forEach((l, k) => c.fillText(l, bg.W / 2, (H / 2 - cy + (k - (lines[i].length - 1) / 2) * TXT_LH) * sc)); }
      else { fitFont(c, r.text, (CW - 0.02) * sc, 30, '500 %px ' + FB); c.fillText(r.text, bg.W / 2, (H / 2 - cy) * sc); }
    }
    else if (r.t === 'canvas') { r.draw(c, (X0 + MW / 2) * sc, (H / 2 - cy - h / 2) * sc, CW * sc, h * sc); if (r.mount) r.mount(group, X0, cy, CW, h); } // dibujo libre (el resumen de la ronda)
    else if (r.t === 'btns' || r.t === 'tabs') {
      const n = r.items.length, tot = r.items.reduce((a, it) => a + (it.flex || 1), 0), avail = CW - GAP * (n - 1); let x = X0;
      r.items.forEach(it => { const w = avail * (it.flex || 1) / tot; addW(new Btn(it.label, w, h, it.onPress, { style: it.style || (r.t === 'tabs' ? (it.on ? 'selected' : 'tab') : 'normal'), font: r.t === 'tabs' ? 0.4 : undefined, accent: it.accent, icon: it.icon, badge: it.badge }), x + w / 2, cy); x += w + GAP; });
    } else if (r.t === 'choice') {
      label(r.label, cy); const n = r.opts.length, avail = CW - LABW - GAP * (n - 1); let x = X0 + LABW; const w = avail / n;
      r.opts.forEach(([v, lab, dis]) => { addW(new Btn(lab, w, h, () => { if (!dis) r.onPick(v); }, { style: dis ? 'ghost' : (v === r.value ? 'selected' : 'normal'), font: 0.38 }), x + w / 2, cy); x += w + GAP; });
    } else if (r.t === 'field') {
      const f = FIELD[r.key], so = r.star ? 0.044 : 0;
      if (r.star) { const on = () => isFav(f.key), b = addW(new Btn(on() ? '★' : '☆', 0.036, h * 0.7, () => { if (favToggle(f.key)) b.setLabel(on() ? '★' : '☆', on() ? 'value' : 'ghost'); }, { style: on() ? 'value' : 'ghost', font: 0.62 }), X0 + 0.018, cy); } // ★: al menú principal
      label(f.short || f.label, f.grid ? cy + h / 2 - GRID_H / 2 : cy, undefined, so);
      if (f.type === 'num') {
        const bw = 0.054, vw = 0.13, sw = CW - LABW - bw * 2 - vw - GAP * 3; let x = X0 + LABW;
        const row = { f };
        const commit = v => { setSetting(f.key, v); refreshRow(row); };
        row.minus = addW(new Btn('−', bw, h, () => commit(settings[f.key] - f.step), { font: 0.6 }), x + bw / 2, cy); x += bw + GAP;
        row.slider = addW(new Slider(f, sw, h, (v, done) => { row.value.setLabel(fmtVal(f, v)); if (done) commit(v); }), x + sw / 2, cy); x += sw + GAP;
        row.plus = addW(new Btn('+', bw, h, () => commit(settings[f.key] + f.step), { font: 0.6 }), x + bw / 2, cy); x += bw + GAP;
        row.value = addW(new Btn(fmtVal(f), vw, h, () => openKeypad(f, row), { style: 'value', font: 0.36 }), x + vw / 2, cy);
        fieldRows.push(row);
      } else if (f.type === 'multi') { // varios a la vez (al menos uno, salvo los que pueden quedarse vacíos); con f.grid, en rejilla
        const n = f.opts.length, cols = f.grid || n, w = (CW - LABW - GAP * (cols - 1)) / cols, bh = f.grid ? GRID_H : h, row = { f, btns: [] };
        const on = () => String(settings[f.key]).split(',');
        f.opts.forEach(([v, lab], i) => { const c = i % cols, rr_ = Math.floor(i / cols), x = X0 + LABW + c * (w + GAP), y = f.grid ? cy + h / 2 - bh / 2 - rr_ * (bh + GAP) : cy;
          row.btns.push(addW(new Btn(lab, w, bh, () => {
          const cur = on(), next = cur.includes(v) ? cur.filter(k => k !== v) : [...cur, v]; if (!next.length && !f.empty) return;
          setSetting(f.key, next.join(',')); row.btns.forEach((b, j) => b.setLabel(b.label, on().includes(f.opts[j][0]) ? 'selected' : 'normal')); if (r.after) r.after();
        }, { style: on().includes(v) ? 'selected' : 'normal', font: f.grid ? 0.4 : 0.34 }), x + w / 2, y)); });
      } else {
        // una opción entre varias; con f.grid, en rejilla (y, con f.badges, cada una con sus galones: los rangos)
        const opts = f.type === 'toggle' ? [[1, 'Sí'], [0, 'No']] : f.opts, n = opts.length, cols = f.grid || n, w = (CW - LABW - GAP * (cols - 1)) / cols, bh = f.grid ? GRID_H : h;
        const row = { f, btns: [] };
        opts.forEach(([v, lab], i) => { const x = X0 + LABW + (i % cols) * (w + GAP), yy = f.grid ? cy + h / 2 - bh / 2 - Math.floor(i / cols) * (bh + GAP) : cy;
          row.btns.push(addW(new Btn(lab, w, bh, () => { setSetting(f.key, v); row.btns.forEach((b, j) => b.setLabel(b.label, opts[j][0] === settings[f.key] ? 'selected' : 'normal')); if (opts.length && r.after) r.after(); }, { style: settings[f.key] === v ? 'selected' : 'normal', font: f.grid ? 0.4 : 0.38, badge: f.badges ? i : undefined }), x + w / 2, yy)); });
      }
    }
    y -= h + GAP;
  });
  bg.tex.needsUpdate = true;
  const wrist = wristMenuOn();
  scene.add(group);
  if (wrist) { // en la muñeca: la postura la pone updateWristMenu; solo lo pulsa la mano derecha
    if (!reuse && !recent) wristOpen(); // un menú nuevo sale solo delante de ti; el siguiente de uno abierto, en su sitio
    widgets.forEach(w => { w.only = 'right'; });
    stand.visible = false; wristPose(group, H);
  } else {
    group.rotation.set(-0.38, menuAnchor.yaw, 0); const hz = H / 2 * Math.sin(0.38); // cuelga de su borde de arriba: el centro, más abajo y algo más cerca de ti
    group.position.set(menuAnchor.pos.x + hz * Math.sin(menuAnchor.yaw), menuAnchor.pos.y - H / 2 * Math.cos(0.38), menuAnchor.pos.z + hz * Math.cos(menuAnchor.yaw));
    stand.visible = settings.menuWhere === 'stand';
    if (stand.visible) { // atril
      const n = new V3(0, 0, -1).applyAxisAngle(_up, menuAnchor.yaw);
      stand.position.set(group.position.x + n.x * 0.06, 0, group.position.z + n.z * 0.06);
      const postH = Math.max(0.1, group.position.y - H / 2 * Math.cos(0.38) - 0.02);
      stand.post.scale.y = postH; stand.post.position.y = postH / 2; stand.strip.scale.y = postH * 0.85; stand.strip.position.set(0, postH / 2, 0.034);
      stand.strip.position.applyAxisAngle(_up, menuAnchor.yaw);
    }
  }
  menu = { group, widgets, fieldRows, rows, H, wrist, age: reuse ? 0.4 : 0, keypad: null, music: rows.some(r => r.music) ? spNowText() : null };
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
  if (h.btnMenu && !watch.btnPrev) { if (menu && menu.wrist && WM.on && !wristFar()) { WM.on = false; SND.tick(); } else onWatch(); } watch.btnPrev = h.btnMenu; // (y lo recoge)
  const guns = pistolOn() && GAME_STATES.includes(state) && !h.isHand; // con las pistolas en la mano el botón estorbaría
  const wristUp = menu && menu.wrist && WM.on && !wristFar(); // con el panel abierto delante, el botón sobra
  if (wristLook(h) && !wristUp && !guns) {
    show = true;
    if (h.isHand) { _wu.set(0, 1, 0).applyQuaternion(h.wristQ); watch.mesh.position.copy(h.wrist).addScaledVector(_wu, Math.sign(_wu.dot(_wh)) * 0.045).add(_wo.set(0, 0, 0.035).applyQuaternion(h.wristQ)); }
    else watch.mesh.position.copy(h.wrist).add(_wo.set(0, 0.08, 0));
  }
  const lab = PLACE.on ? 'CANCELAR' : PLACE.wait ? 'AJUSTAR' : menu && menu.wrist ? (WM.on ? 'TRAER MENÚ' : 'MENÚ') : state === 'lobby' || state === 'end' ? 'TRAER MENÚ' : 'MENÚ';
  watch.setLabel(lab);
  watch.mesh.visible = show; watch.armT = show ? (watch.armT || 0) + dt : 0;
  if (show) { watch.mesh.lookAt(head.p); watch.baseZ = watch.mesh.position.z; pokeWidgets([watch], dt, watch.armT > 0.35); watch.mesh.position.z = watch.baseZ; }
  else if (watch.hover) { watch.hover = false; watch.draw(); }
}
// Panel de la muñeca: se abre con el botón MENÚ de la muñeca (o solo, cuando sale un menú nuevo: el principal al entrar,
// el resumen de la ronda…) creciendo desde la muñeca hasta quedarse quieto delante de ti, a wristDist de los ojos y de cara a
// ti, para pulsarlo con calma con el índice derecho: ya no sigue a la mano. Se cierra con la palma hacia abajo o el puño
// cerrado (y vuelve con el botón MENÚ). Si te alejas o te giras y lo pierdes de vista, el botón lo trae delante otra vez.
const WMS = 0.46; // escala del panel a 45 cm de los ojos: 0,76 m de ancho en el atril → 35 cm
// escala a la distancia elegida: más lejos, más grande, para que se lea igual
const wristScale = () => WMS * clamp(settings.wristDist / 45, 0.8, 1.7);
const WM = { e: 0, on: false, shutT: 0, shut: false, armed: false, init: false, top: new V3(), q: new Q4(), from: new V3() };
const wristHint = glowSprite(0xff4fa3, 0.05, 0.8); wristHint.visible = false; scene.add(wristHint);
const _wm4 = new THREE.Matrix4(), _wmt = new V3(), _wmq = new Q4(), _wml = new V3(), _wmu = new V3();
// Abrir (o traer delante) el panel: sale otra vez desde la muñeca
function wristOpen() { WM.on = true; WM.e = 0; WM.init = false; WM.armed = false; WM.shutT = 0; }
settingHooks.push(k => { if (k === 'wristDist' || k === '*') WM.init = false; }); // otra distancia: se recoloca
// Dónde se queda: hacia donde miras (en horizontal; mirando arriba o abajo, hacia la mano izquierda), con el borde de arriba
// algo por debajo de los ojos, inclinado hacia ellos y siempre derecho (no se ladea aunque ladees la cabeza)
function wristTarget(H, S) {
  const f = fwd(); let dir = fwdH();
  if (Math.abs(f.y) > 0.7 && hands.left.ok) { _wml.copy(hands.left.wrist).sub(head.p); _wml.y = 0; if (_wml.lengthSq() > 0.01) dir = _wml.normalize().clone(); }
  // el centro, a wristDist en horizontal y con el borde de arriba algo por debajo de los ojos (sin bajar del suelo)
  _wmt.copy(head.p).addScaledVector(dir, settings.wristDist / 100); _wmt.y = Math.max(head.p.y - 0.06, H * S + 0.08) - H * S / 2;
  _wm4.lookAt(head.p, _wmt, _up); _wm4.decompose(_wml, _wmq, _wmu);
  WM.q.copy(_wmq); WM.top.copy(_wmt).addScaledVector(_wml.set(0, 1, 0).applyQuaternion(_wmq), H * S / 2); WM.init = true;
}
// dt = 0: colocarlo de golpe (al rehacer el menú: el borde de arriba se queda donde estaba)
function wristPose(group, H, dt = 0) {
  const h = hands.left, S = wristScale(), e = 1 - Math.pow(1 - WM.e, 3), s = S * e;
  if (!WM.init) { if (h.ok) WM.from.copy(h.wrist); else WM.from.copy(head.p).addScaledVector(fwdH(), 0.3).add(_wmu.set(0, -0.35, 0)); wristTarget(H, S); }
  else if (h.ok && !WM.on) WM.from.copy(h.wrist); // al cerrarse, vuelve a la muñeca
  // el centro cuelga del borde de arriba: así, al pasar a un submenú más alto o más bajo, lo de arriba no se mueve
  _wmt.set(0, 1, 0).applyQuaternion(WM.q); _wml.copy(WM.top).addScaledVector(_wmt, -H * S / 2);
  group.position.lerpVectors(WM.from, _wml, e);
  group.quaternion.copy(WM.q); group.scale.setScalar(Math.max(0.001, s)); group.visible = WM.e > 0.01;
}
// ¿Está abierto pero no lo ves (te giraste o te fuiste)? Entonces el botón MENÚ lo trae delante
function wristFar() {
  if (!menu || !menu.wrist || !WM.on) return false;
  menu.group.getWorldPosition(_wml); const d = _wml.sub(head.p), len = d.length();
  return len > 1.3 || d.angleTo(fwd()) > 55 * Math.PI / 180;
}
// Mano izquierda: normal hacia el lado de la palma, sacada de los nudillos (null si las articulaciones no cuadran)
const _pa = new V3(), _pb = new V3(), _pc = new V3(), _pd = new V3();
function leftPalm(out) {
  const h = hands.left, J = h.J; if (!h.ok || !h.isHand || !J[0].ok || !J[6].ok || !J[11].ok || !J[21].ok) return null;
  _pa.subVectors(J[6].p, J[0].p); _pb.subVectors(J[21].p, J[0].p); _pc.subVectors(J[11].p, J[0].p).normalize(); _pd.subVectors(J[6].p, J[21].p);
  if (_pd.length() < 0.03 || Math.abs(_pd.normalize().dot(_pc)) > 0.5) return null; // los nudillos, de través respecto a la mano
  return out.crossVectors(_pb, _pa).normalize(); // en la izquierda, (meñique × índice) sale por la palma
}
// Puño cerrado: al menos tres dedos con la punta más cerca de la muñeca que su nudillo
function leftFist() {
  const h = hands.left, J = h.J; if (!h.ok || !h.isHand || !J[0].ok) return false; let n = 0;
  for (const b of [5, 10, 15, 20]) { const k = J[b + 1], t = J[b + 4]; if (k.ok && t.ok && t.p.distanceTo(J[0].p) < k.p.distanceTo(J[0].p) * 1.05) n++; }
  return n >= 3;
}
const _wpn = new V3();
function updateWristMenu(dt) {
  // palma hacia abajo o puño cerrado: se cierra en el acto (si se abrió con la mano así, primero hay que abrirla)
  const pn = leftPalm(_wpn), shut = (!!pn && pn.y < -0.7) || leftFist();
  WM.shutT = shut ? WM.shutT + dt : 0; WM.shut = WM.shutT > 0.05; if (!shut) WM.armed = true;
  if (!menu || !menu.wrist) { WM.e = 0; WM.init = false; wristHint.visible = false; return; }
  if (WM.on && WM.shut && WM.armed) { WM.on = false; SND.tick(); }
  WM.e = clamp(WM.e + (WM.on ? dt / 0.22 : -dt / (WM.shut ? 0.07 : 0.22)), 0, 1);
  wristPose(menu.group, menu.H, dt);
  // aviso: un punto que late en la muñeca mientras hay un menú recogido
  const h = hands.left; wristHint.visible = h.ok && WM.e < 0.05;
  if (wristHint.visible) { wristHint.position.copy(h.wrist).add(_wo.set(0, 0.04, 0)); const p = 0.04 + 0.015 * Math.sin(performance.now() / 160); wristHint.scale.set(p, p, 1); }
}
const wristReady = () => !menu || !menu.wrist || WM.e > 0.95;
function onWatch() {
  if (RPL.on) { endRoomPlace(false); return; }
  if (PLACE.on) { cancelPlace(); return; }
  if (PLACE.wait) { PLACE.wait = false; center.mesh.visible = false; adjustMenu(PLACE.back); return; }
  if (GAME_STATES.includes(state)) openPause();
  else if (menu && menu.wrist) { wristOpen(); SND.tick(); } // el menú recogido (o perdido de vista) sale delante
  else if (menu) { menuAnchor = placeAnchor(0.45); const rebuild = menu.rebuild; if (rebuild) rebuild(); }
}

/* =================== PANELES DE VISTA =================== */
// Los avisos, grandes para leerlos bien: el del centro (0,5 × 0,2 m de lienzo) se ve a 1,5 veces su tamaño
const CENTER_SC = 1.5, center = makePanel(0.5, 0.2, 1024, { depthTest: false }); center.mesh.scale.setScalar(CENTER_SC); scene.add(center.mesh); center.mesh.visible = false;
const toastP = makePanel(0.62, 0.1, 1024, { depthTest: false }); scene.add(toastP.mesh); toastP.mesh.visible = false;
let toastT = 0;
function showToast(text, color, dur) {
  if (!GAME_STATES.includes(state) || !settings.toasts) return;
  const c = toastP.ctx, W = toastP.W, H = toastP.H; c.clearRect(0, 0, W, H);
  rr(c, 4, 4, W - 8, H - 8, H / 2 - 4); c.fillStyle = 'rgba(14,10,28,0.72)'; c.fill();
  c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle'; fitFont(c, text, W - 70, 104, '%px ' + FD); c.fillText(text, W / 2, H / 2 + 4);
  toastP.tex.needsUpdate = true; toastT = dur; toastP.mesh.visible = true;
}
const hurtMat = new THREE.MeshBasicMaterial({ map: texFrom((() => { const c = mkCanvas(128), x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 18, 64, 64, 64); g.addColorStop(0, 'rgba(255,0,30,0)'); g.addColorStop(1, 'rgba(255,0,30,1)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return c; })()), transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
const hurtPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), hurtMat); hurtPlane.renderOrder = 40; scene.add(hurtPlane); hurtPlane.visible = false;
let hurtT = 0;
const _hl = new V3();
function headLocal(off, out) { return out.copy(off).applyQuaternion(head.q).add(head.p); }
// Los avisos de la vista (los del centro, PERFECTA, las indicaciones para colocarse, la caricatura del ejercicio) siguen
// adónde miras al girar o al subir y bajar la vista, pero nunca se ladean con la cabeza: el texto, siempre derecho. Solo
// tumbado o en plancha (mirando al suelo o al techo) siguen, de momento, a la cabeza entera
const _vq = new Q4(), _ve = new THREE.Euler(0, 0, 0, 'YXZ');
function viewQ() {
  if ((isFloor() || isSupine() || settings.exercise === 'row') && Math.abs(fwd().y) > 0.6) return _vq.copy(head.q);
  _ve.setFromQuaternion(head.q, 'YXZ'); _ve.z = 0; return _vq.setFromEuler(_ve);
}
function viewLocal(off, out) { return out.copy(off).applyQuaternion(viewQ()).add(head.p); }
/* ---------- Ningún panel tapa lo que viene hacia ti ---------- */
// Lo que tiene que verse siempre: los objetivos (Toques y Barras) y los enemigos, con su centro y su radio en el mundo
const _ocP = [], _ocR = [], _ocH = new V3(), _ocT = new V3(), _ocDummy = new THREE.Object3D();
function collectThreats() {
  let n = 0; const put = (o, r) => { o.center(_ocP[n] || (_ocP[n] = new V3())); _ocR[n++] = r; };
  for (const x of touches) if (x.alive && !x.judged) put(x, x.part === 'head' ? x.r * 1.7 : 0.16);
  for (const e of enemies) if (e.alive && e.state !== 'emerge' && e.mode !== 'emerge') put(e, e.type === 'robot' ? 0.9 * e.sc : Math.max(0.1, e.radius * 1.5)); // los que aún salen de la pared o del suelo no se ven: no cuentan
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
// (dónde salen; luego se quedan quietos en el mundo: ver lazyAt)
const HUD = { toast: { slots: [[0, -0.4], [0, 0.4], [-0.5, -0.24], [0.5, -0.24]], z: -1.2, w: 0.62, h: 0.1, slot: 0, off: new V3(0, -0.4, -1.2), fade: 1 },
  center: { slots: [[0, -0.08], [0, 0.42], [0, -0.5]], z: -1.1, w: 0.5 * CENTER_SC, h: 0.2 * CENTER_SC, slot: 0, off: new V3(0, -0.08, -1.1), fade: 1 }, board: 1 };
function hudSlot(P, slots, n, dt) {
  const free = i => { viewLocal(_hl.set(slots[i][0], slots[i][1], P.z), _ocDummy.position); _ocDummy.quaternion.copy(viewQ()); return !n || !panelHides(_ocDummy, P.w, P.h, true, n); };
  let pick = slots[P.slot] && free(P.slot) ? P.slot : -1;
  for (let i = 0; pick < 0 && i < slots.length; i++) if (free(i)) pick = i;
  if (pick >= 0) P.slot = pick; else P.slot = Math.min(P.slot, slots.length - 1);
  P.off.lerp(_hl.set(slots[P.slot][0], slots[P.slot][1], P.z), 1 - Math.exp(-dt * 10));
  P.fade += ((pick >= 0 ? 1 : 0.15) - P.fade) * Math.min(1, dt * 8);
  return viewLocal(P.off, new V3());
}
// Los avisos no siguen la mirada (así no hay quien los lea): salen delante de ti y se quedan quietos en el mundo. Solo se
// recolocan, deslizándose, si dejan de verse un rato (miras más de LAZY.ang a otro lado o te mueves LAZY.move) o si
// tapan algo que viene hacia ti
const LAZY = { ang: 50 * Math.PI / 180, t: 0.8, move: 0.6 }, _lz = new V3();
const mkLazy = () => ({ init: false, at: new V3(), q: new Q4(), home: new V3(), away: 0, go: false, vis: 1 });
function lazyAt(L, want, wantQ, dt, ang = LAZY.ang) {
  if (!L.init) { Object.assign(L, { init: true, away: 0, go: false, vis: 1 }); L.at.copy(want); L.q.copy(wantQ); L.home.copy(head.p); return L; }
  const off = head.p.distanceTo(L.home) > LAZY.move || _lz.subVectors(L.at, head.p).angleTo(fwd()) > ang;
  L.away = off ? L.away + dt : 0; if (L.away > LAZY.t) L.go = true;
  if (L.go) { const k = 1 - Math.exp(-dt * 7); L.at.lerp(want, k); L.q.slerp(wantQ, k); if (L.at.distanceTo(want) < 0.03) { L.go = false; L.away = 0; L.home.copy(head.p); } }
  return L;
}
const LZ = { center: mkLazy(), toast: mkLazy(), warn: mkLazy() };
// Un aviso quieto que tapa lo que viene se aclara enseguida y se va a un hueco libre
function lazyClear(L, mesh, w, h, n, dt) {
  const hides = n > 0 && panelHides(mesh, w, h, true, n); if (hides) L.go = true;
  L.vis += ((hides ? 0.15 : 1) - L.vis) * Math.min(1, dt * 12); return L.vis;
}
/* ---------- Avisos grandes impresos en el suelo ---------- */
// Lo que estás haciendo mal (a medias, suelta la cadera, te soltaste…) se escribe en grande en el suelo, delante,
// durante 4 s; si miras hacia arriba (remo, abdominales), por encima de la cara. Los últimos quedan en la pausa.
const WARN_SECS = 4;
const WARN = { t: 0, log: [], text: '', p: makePanel(1.6, 0.42, 1024, { depthTest: false }), at: new V3(), q: new Q4(), init: false };
WARN.p.mesh.visible = false; WARN.p.mesh.renderOrder = 32; scene.add(WARN.p.mesh);
function warnFloor(text, color = '#ff8a3d') {
  if (WARN.log[WARN.log.length - 1] !== text) { WARN.log.push(text); if (WARN.log.length > 8) WARN.log.shift(); }
  if (text === WARN.text && WARN.t > 1) { WARN.t = WARN_SECS; return; }
  const c = WARN.p.ctx, W = WARN.p.W, H = WARN.p.H; c.clearRect(0, 0, W, H);
  rr(c, 8, 8, W - 16, H - 16, 40); c.fillStyle = 'rgba(14,8,10,0.82)'; c.fill(); c.lineWidth = 10; c.strokeStyle = color; c.stroke();
  // en una o dos líneas, lo más grande que quepa
  c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle';
  const words = text.split(' '); let lines = [text];
  c.font = `110px ${FD}`;
  if (c.measureText(text).width > W - 90 && words.length > 1) { let best = 1; for (let i = 1; i < words.length; i++) if (Math.abs(words.slice(0, i).join(' ').length - text.length / 2) < Math.abs(words.slice(0, best).join(' ').length - text.length / 2)) best = i; lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')]; }
  const fs = Math.min(lines.length > 1 ? 92 : 120, ...lines.map(l => { c.font = `100px ${FD}`; return Math.floor(100 * (W - 90) / Math.max(1, c.measureText(l).width)); }));
  c.font = `${fs}px ${FD}`; lines.forEach((l, i) => c.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * fs * 1.05 + 6));
  WARN.p.tex.needsUpdate = true; WARN.text = text; WARN.t = WARN_SECS; WARN.init = false; WARN.p.mesh.visible = true;
}
const _wf = new V3(), _we = new THREE.Euler(0, 0, 0, 'YXZ');
function updateWarn(dt) {
  const m = WARN.p.mesh; if (!m.visible) return;
  WARN.t -= dt; if (WARN.t <= 0 || !GAME_STATES.includes(state) && state !== 'paused') { m.visible = false; WARN.text = ''; return; }
  const f = fwd(); let s;
  if (f.y > 0.35) { // mirando arriba: por encima de la cara, de cara a ti
    _wf.copy(head.p).addScaledVector(f, 1.0); s = 0.75; WARN.q.copy(viewQ());
  } else { // en el suelo, delante: más lejos cuanto más alta la cabeza, tumbado y legible desde donde estás
    const h = fwdH(), d = clamp(head.p.y * 1.1, 0.5, 2.1); _wf.copy(head.p).addScaledVector(h, d); _wf.y = 0.02;
    s = clamp(d * 0.85, 0.42, 1.7); _we.set(-Math.PI / 2, Math.atan2(-h.x, -h.z), 0); WARN.q.setFromEuler(_we);
  }
  if (!WARN.init) { LZ.warn.init = false; WARN.init = true; WARN.s = s; } // cada aviso nuevo sale delante; luego se queda quieto
  const L = lazyAt(LZ.warn, _wf, WARN.q, dt, 65 * Math.PI / 180); if (L.go) WARN.s += (s - WARN.s) * Math.min(1, dt * 7);
  m.position.copy(L.at); m.quaternion.copy(L.q); m.scale.setScalar(WARN.s);
  m.material.opacity = Math.min(1, WARN.t / 0.5, (WARN_SECS - WARN.t) / 0.15 + 0.2);
}
function updateViewPanels(dt) {
  updateWarn(dt);
  const n = GAME_STATES.includes(state) ? collectThreats() : 0;
  if (center.mesh.visible) {
    const C = HUD.center, slots = menu && !menu.wrist ? [[0, 0.3]] : C.slots; // con el atril abierto, por encima para no taparlo
    const L = lazyAt(LZ.center, hudSlot(C, slots, n, dt), viewQ(), dt);
    center.mesh.position.copy(L.at); center.mesh.quaternion.copy(L.q); center.mesh.material.opacity = C.fade * lazyClear(L, center.mesh, 0.5, 0.2, n, dt);
  } else LZ.center.init = false;
  if (toastP.mesh.visible) {
    toastT -= dt; if (toastT <= 0) toastP.mesh.visible = false;
    const L = lazyAt(LZ.toast, hudSlot(HUD.toast, HUD.toast.slots, n, dt), viewQ(), dt);
    toastP.mesh.position.copy(L.at); toastP.mesh.quaternion.copy(L.q); toastP.mesh.material.opacity = Math.min(1, toastT * 3) * HUD.toast.fade * lazyClear(L, toastP.mesh, toastP.w, toastP.h, n, dt);
  } else LZ.toast.init = false;
  // el marcador está fijo y siempre se ve (opaco): no se aclara aunque algo pase por detrás
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
    const L = { inchworm: ['De pie, mirando al frente, con sitio', 'delante para la plancha. Quieto 2 s.'], twist: ['Sujeta la barra flexible delante del', 'pecho, con las dos manos a la vista. 2 s.'], squat: ['De pie, mirando al frente, pies a la', 'anchura de los hombros. Quieto 2 s.'], pushup: ['Ponte en plancha: brazos estirados,', 'cuerpo recto. Quieto 2 s.'], plank1: ['Ponte en plancha sobre las dos manos,', 'cuerpo recto. Quieto 2 s.'], superman: ['Túmbate boca abajo con los brazos', 'estirados hacia delante. Quieto 2 s.'], curl: ['De pie, con las mancuernas y los', 'brazos estirados abajo. Quieto 2 s.'], jump: ['De pie, mirando al frente, con', 'espacio para saltar. Quieto 2 s.'], lunge: ['De pie, pies juntos, con espacio', 'delante para dar el paso. Quieto 2 s.'], dips: ['En el borde de la silla, manos en el', 'asiento, brazos estirados. Quieto 2 s.'], press: ['De pie, mancuernas a la altura', 'de los hombros. Quieto 2 s.'], curl2: ['De pie, la barra (o la kettlebell) con las', 'dos manos y los brazos abajo. Quieto 2 s.'], press2: ['De pie, la barra (o la kettlebell) a la', 'altura de los hombros. Quieto 2 s.'], thruster: ['De pie, las pesas en los hombros', 'con las dos manos. Quieto 2 s.'], frontsq: ['De pie, las pesas en las manos', 'con los brazos abajo. Quieto 2 s.'], jsquat: ['De pie, mirando al frente, con', 'espacio para saltar. Quieto 2 s.'], swing: ['De pie, la kettlebell con las dos', 'manos y los brazos abajo. Quieto 2 s.'], chop: ['De pie, la kettlebell o el disco con', 'las dos manos ante el pecho. Quieto 2 s.'], dlrow: ['De pie, las pesas en las manos', 'con los brazos abajo. Quieto 2 s.'], plankrow: ['En plancha sobre las mancuernas,', 'cuerpo recto. Quieto 2 s.'], splank: ['De lado sobre el antebrazo,', 'cuerpo recto, cadera arriba. Quieto 2 s.'], abs: ['Túmbate boca arriba, rodillas', 'dobladas, pies al frente. Quieto 2 s.'] }[settings.exercise === 'combo' ? { stand: 'squat', floor: 'pushup', abs: 'abs' }[settings.comboBase] : settings.exercise] || ['Colócate en la postura inicial', 'y quédate quieto 2 s.'];
    c.fillStyle = '#eeeaff'; c.font = `500 40px ${FB}`; L.forEach((l, i) => c.fillText(l, 44, 148 + i * 52));
    c.fillStyle = '#2f2853'; rr(c, 44, H - 66, W - 88, 22, 11); c.fill();
    c.fillStyle = '#3cf0c6'; rr(c, 44, H - 66, Math.max(22, (W - 88) * Math.min(1, calibT / 2)), 22, 11); c.fill();
    if ((holdsWeights() && settings.exercise !== 'dlrow') || oneArm() || settings.exercise === 'superman' || (aimManual() && settings.aim === 'hands' && handsFree()) || pistolOn()) {
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
// Marcador: arriba la oleada, los puntos y las vidas; a la izquierda tus repeticiones con la barra de la oleada; a la
// derecha los avisos y la carga; debajo combo y precisión; y abajo lo de hoy: los minutos frente a tu meta diaria y
// cuánto te falta para superar tu récord de un día con este ejercicio
const BC = { teal: '#3cf0c6', pink: '#ff4fa3', gold: '#ffd166', lil: '#a49fc8', ink: '#eeeaff' };
// el fondo (degradados, brillos y marco) no cambia: se pinta una vez y se copia (el marcador se redibuja cada segundo)
let boardBg = null;
function boardFrame(c, W, H) {
  if (!boardBg) { boardBg = mkCanvas(W, H); boardFrameDraw(boardBg.getContext('2d'), W, H); }
  c.drawImage(boardBg, 0, 0);
}
function boardFrameDraw(c, W, H) {
  const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#1b1338'); g.addColorStop(0.55, '#0d0a20'); g.addColorStop(1, '#190b27'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  for (const [x, y, r, col] of [[0.18, 0.45, 0.45, '60,240,198'], [0.88, 0.15, 0.4, '255,79,163']]) {
    const q = c.createRadialGradient(W * x, H * y, 8, W * x, H * y, W * r); q.addColorStop(0, `rgba(${col},0.13)`); q.addColorStop(1, `rgba(${col},0)`); c.fillStyle = q; c.fillRect(0, 0, W, H);
  }
  c.fillStyle = 'rgba(255,255,255,0.022)'; for (let y = 0; y < H; y += 6) c.fillRect(0, y, W, 2);
  const e = c.createLinearGradient(0, 0, W, 0); e.addColorStop(0, BC.teal); e.addColorStop(1, BC.pink);
  c.strokeStyle = e; c.lineWidth = 4; rr(c, 8, 8, W - 16, H - 16, 26); c.stroke();
  c.lineWidth = 8; c.lineCap = 'round'; const L = 46, m = 8; // esquinas más gruesas
  for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
    c.strokeStyle = sx > 0 ? BC.teal : BC.pink; c.beginPath(); c.moveTo(x, y + sy * (L + 26)); c.lineTo(x, y + sy * 26); c.arcTo(x, y, x + sx * 26, y, 26); c.lineTo(x + sx * (L + 26), y); c.stroke();
  }
  c.lineCap = 'butt';
}
function boardPill(c, x, y, w, h, fill, stroke) { rr(c, x, y, w, h, h / 2); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = 2; c.stroke(); } }
function boardBar(c, x, y, w, h, k, c0, c1) {
  rr(c, x, y, w, h, h / 2); c.fillStyle = 'rgba(255,255,255,0.09)'; c.fill();
  if (!(k > 0)) return;
  const g = c.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, c0); g.addColorStop(1, c1);
  rr(c, x, y, Math.max(h, w * Math.min(1, k)), h, h / 2); c.fillStyle = g; c.fill();
}
function glowText(c, t, x, y, col, blur) { c.save(); c.shadowColor = col; c.shadowBlur = blur; c.fillStyle = col; c.fillText(t, x, y); c.restore(); }
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
// Abajo, lo de hoy en dos barras con pocas palabras: minutos frente a tu meta y tu récord de un día con este ejercicio
function boardDay2(c, W, y) {
  const D = boardDay(), hang = settings.exercise === 'hang', goal = settings.goalMin * 60, w = (W - 64 - 40) / 2, met = D.time >= goal;
  const item = (x, label, lcol, val, vcol, k, c0, c1) => {
    c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillStyle = lcol; c.font = `26px ${FD}`; c.fillText(label, x, y);
    c.textAlign = 'right'; c.fillStyle = vcol; fitFont(c, val, w - c.measureText(label).width - 20, 34, '600 %px ' + FB); c.fillText(val, x + w, y);
    boardBar(c, x, y + 30, w, 14, k, c0, c1);
  };
  item(32, 'HOY', met ? BC.gold : BC.teal, met ? `${Math.floor(D.time / 60)} min ✓` : `${Math.floor(D.time / 60)} / ${settings.goalMin} min`, met ? BC.gold : BC.ink, D.time / goal, BC.teal, met ? BC.gold : BC.pink);
  const x2 = 32 + w + 40, u = hang ? ' s' : '';
  if (!D.best) item(x2, 'RÉCORD', BC.pink, D.n ? `${D.n}${u} · el primero` : '—', BC.ink, D.n ? 1 : 0, BC.pink, BC.gold);
  else if (D.n > D.best) item(x2, '¡RÉCORD!', BC.gold, `${D.n}${u} (+${D.n - D.best})`, BC.gold, 1, BC.pink, BC.gold);
  else item(x2, 'RÉCORD', BC.pink, `${D.n} / ${D.best}${u}`, BC.ink, D.n / (D.best + 1), BC.pink, BC.gold);
}
function drawBoard() {
  const c = board.ctx, W = board.W, H = board.H;
  c.clearRect(0, 0, W, H); boardFrame(c, W, H);
  c.textBaseline = 'middle';
  if (!['calib', 'ready', 'mount', 'play', 'rest', 'paused', 'end', 'between'].includes(state)) {
    c.textAlign = 'center'; c.font = `90px ${FD}`; glowText(c, 'REPARENA', W / 2, 90, BC.pink, 22);
    const t = `${MODE_NAMES[settings.mode]} · ${EX_NAMES[settings.exercise]}`; c.fillStyle = BC.ink; fitFont(c, t, W - 120, 40, '500 %px ' + FB); c.fillText(t, W / 2, 172);
    c.fillStyle = BC.lil; const tip = wristMenuOn() ? 'El menú: pulsa MENÚ en tu muñeca izquierda' : 'Pulsa EMPEZAR en el menú'; fitFont(c, tip, W - 120, 30, '500 %px ' + FB); c.fillText(tip, W / 2, 236);
    boardDay2(c, W, 352);
    board.tex.needsUpdate = true; return;
  }
  const N = settings.waves, hang = settings.exercise === 'hang';
  // arriba: oleada, puntos y vidas
  const rk = Math.round(rampK() * 100), wv = (SES.active ? `B${SES.idx + 1}/${SES.blocks.length} · ` : '') + (N ? `OLEADA ${Math.min(waveIdx + 1, N)}/${N}` : `OLEADA ${waveIdx + 1}`) + (rk && state !== 'rest' ? ` ▲${rk}%` : '');
  c.textAlign = 'left'; fitFont(c, wv, 340, 30, '%px ' + FD); const ww = c.measureText(wv).width + 44;
  boardPill(c, 32, 24, ww, 54, 'rgba(60,240,198,0.12)', 'rgba(60,240,198,0.55)'); c.fillStyle = BC.teal; c.fillText(wv, 54, 52);
  c.textAlign = 'center'; c.font = `54px ${FD}`; glowText(c, String(score), W / 2 + 60, 52, BC.gold, 16);
  c.textAlign = 'right';
  if (!settings.lives) { c.font = `34px ${FD}`; c.fillStyle = BC.teal; c.fillText('∞', W - 44, 52); }
  else if (settings.lives <= 8) { let s = ''; for (let i = 0; i < settings.lives; i++) s += i < lives ? '♥' : '♡'; fitFont(c, s, 280, 48, '%px ' + FB); glowText(c, s, W - 40, 52, BC.pink, 10); }
  else { c.font = `36px ${FD}`; c.fillStyle = BC.pink; c.fillText(`♥ ${lives}`, W - 40, 52); }
  // izquierda: el número grande (y el combo, si va bien) y la barra de la oleada
  const big = String(hang ? Math.floor(state === 'play' ? BAR.hold : stats.hold) : stats.reps);
  c.textAlign = 'left'; c.font = `170px ${FD}`; glowText(c, big, 40, 186, '#ffffff', 18);
  if (combo >= 3 && !hang) { const bw = c.measureText(big).width; c.font = `44px ${FD}`; c.fillStyle = BC.gold; c.fillText(`×${combo}`, 60 + bw, 230); }
  c.fillStyle = BC.lil; c.font = `26px ${FD}`; c.fillText(hang ? 'SEGUNDOS' : 'REPS', 46, 292);
  const wk = state !== 'play' ? 0 : hang ? BAR.hold / Math.max(1, BAR.need) : waveTarget ? waveDone / waveTarget : 0;
  boardBar(c, 196, 284, 300, 16, wk, BC.teal, '#7af7ff');
  // derecha: lo que pasa ahora (una frase grande) y la carga
  c.textAlign = 'right'; const RX = W - 40, big2 = (t, col, size = 70, y = 160) => { fitFont(c, t, 470, size, '%px ' + FD); glowText(c, t, RX, y, col, 12); };
  if (state === 'rest') {
    big2(`DESCANSO ${Math.ceil(settings.rest - stateT)}`, BC.teal, 58, 140);
    const nx = hang ? `Siguiente: ${hangSecs(waveIdx + 1)} s` : `Siguiente: ${waveReps(waveIdx + 1)} reps`, up = RAMP.note ? (RAMP.up ? ` · ▲ +${Math.round(rampK() * 100)} %` : ' · = igual') : '';
    c.fillStyle = RAMP.up ? BC.gold : BC.ink; fitFont(c, nx + up, 470, 32, '500 %px ' + FB); c.fillText(nx + up, RX, 214);
  } else if (state === 'mount') big2(settings.exercise === 'row' ? 'A LAS PARALELAS' : 'A LA BARRA', BC.teal, 50);
  else if (state === 'calib') big2('CALIBRANDO', BC.teal, 54);
  else if (state === 'ready') big2(String(Math.max(1, Math.ceil(3 - stateT))), BC.gold, 120, 170);
  else if (state === 'paused') big2('PAUSA', BC.gold, 80);
  else if (state === 'between') big2(`DESCANSO ${Math.max(0, Math.ceil(SES.wait))}`, BC.teal, 58);
  else if (msg.t > 0) { c.globalAlpha = Math.min(1, msg.t * 2); fitFont(c, msg.text, 470, 66, '%px ' + FD); c.fillStyle = msg.color; c.fillText(msg.text, RX, 150); c.globalAlpha = 1; }
  else if (settings.mode === 'arcs' && (nextArcDrop || nextArcJump)) big2(nextArcJump ? '¡SALTA!' : nextArcTilt ? (nextArcTilt > 0 ? 'DERECHA →' : '← IZQUIERDA') : `BAJA ${Math.round(nextArcDrop * 100)} CM`, '#ff8a6a', 60);
  let ch = null; const live = ['play', 'ready'].includes(state);
  if (isCombat() && swordActive() && live) { const n = SWD.perf.length; ch = [n ? `⚔ ${n}` : '⚔ 0', n ? BC.teal : '#ff8a3d']; }
  else if (throwAim() && live) { const n = throwCount(); ch = [`✋ ${n}`, n ? BC.teal : BC.lil]; }
  else if (pistolOn() && live) ch = [`▮ ${GUN.ammo}`, GUN.ammo ? BC.teal : '#ff8a3d'];
  else if (charged && live) ch = [chargePow > 1 ? `● ×${chargePow}` : '●', '#' + POW_COL[chargePow - 1].toString(16).padStart(6, '0')];
  if (ch) { c.font = `40px ${FD}`; const w = c.measureText(ch[0]).width + 44; boardPill(c, RX - w + 8, 230, w, 60, 'rgba(255,255,255,0.06)', ch[1]); c.fillStyle = ch[1]; c.fillText(ch[0], RX - 14, 261); }
  // abajo: lo de hoy
  boardDay2(c, W, 356);
  board.tex.needsUpdate = true;
}
