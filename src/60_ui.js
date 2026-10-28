
/* =================== ESTADO DEL JUGADOR =================== */
const head = { p: new V3(0, 1.6, 0), q: new Q4(), prev: new V3(), speed: 0 };
const mkJ = () => ({ p: new V3(), q: new Q4(), r: 0.008, ok: false, s: new V3() }); // s: la posición suavizada, para pintarla
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
// Galones del rango, como piezas de metal con relieve (no líneas): del recluta al sargento, cheurones (uno, dos, tres; el
// sargento con su arco debajo), plateados hasta el soldado y dorados desde el cabo; el teniente y el capitán, estrellas
// talladas; el general, tres estrellas doradas dentro de una corona de laurel. col: el color del canto (contraste con el fondo)
const RANK_METAL = [['#e7b98a', '#8a5a2e'], ['#eef1f6', '#7d8494'], ['#ffe39a', '#a8741c'], ['#ffe39a', '#a8741c'], ['#ffe39a', '#a8741c'], ['#ffe39a', '#a8741c'], ['#fff2b8', '#b8801a']];
function rankMetal(c, i, S) { const [a, b] = RANK_METAL[clamp(i, 0, 6)], g = c.createLinearGradient(0, -S * 0.5, 0, S * 0.5); g.addColorStop(0, a); g.addColorStop(0.55, b); g.addColorStop(1, a); return g; }
function drawRank(c, i, x, y, S, col) {
  c.save(); c.translate(x, y); c.lineJoin = 'round'; const metal = rankMetal(c, i, S), edge = col || 'rgba(20,12,26,0.9)';
  const shape = path => { path(); c.fillStyle = metal; c.fill(); c.lineWidth = Math.max(1.5, S * 0.035); c.strokeStyle = edge; c.stroke();
    c.save(); c.translate(0, -S * 0.018); c.lineWidth = Math.max(1, S * 0.018); c.strokeStyle = 'rgba(255,255,255,0.55)'; path(); c.stroke(); c.restore(); }; // (un bisel de luz arriba: relieve)
  const chev = dy => shape(() => { const w = S * 0.46, t = S * 0.13, h = S * 0.19; c.beginPath(); c.moveTo(-w, dy + h); c.lineTo(0, dy - h + 0.001); c.lineTo(w, dy + h); c.lineTo(w, dy + h + t); c.lineTo(0, dy - h + t); c.lineTo(-w, dy + h + t); c.closePath(); });
  const star = (sx, sy, r) => shape(() => { c.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rad = k % 2 ? r * 0.46 : r; c.lineTo(sx + Math.cos(a) * rad, sy + Math.sin(a) * rad); } c.closePath(); });
  if (i <= 3) { const n = Math.min(3, i + 1), up = i === 3 ? S * 0.12 : 0; for (let k = 0; k < n; k++) chev((k - (n - 1) / 2) * S * 0.27 - up - S * 0.05);
    if (i === 3) shape(() => { c.beginPath(); c.arc(0, -S * 0.36, S * 0.66, 0.27 * Math.PI, 0.73 * Math.PI); c.arc(0, -S * 0.36, S * 0.54, 0.71 * Math.PI, 0.29 * Math.PI, true); c.closePath(); }); }
  else { const n = i - 3; if (n === 3) { // la corona de laurel del general
      for (const s of [-1, 1]) for (let k = 0; k < 6; k++) { const a = Math.PI / 2 + s * (0.5 + k * 0.38), lx = Math.cos(a) * S * 0.52, ly = Math.sin(a) * S * 0.44 - S * 0.02;
        shape(() => { c.beginPath(); c.ellipse(lx, ly, S * 0.09, S * 0.042, a + s * Math.PI / 2.2, 0, TAU); }); } }
    for (let k = 0; k < n; k++) star((k - (n - 1) / 2) * S * (n === 3 ? 0.3 : 0.46), n === 3 ? -S * 0.04 : 0, S * (n === 3 ? 0.17 : 0.25)); }
  c.restore();
}
// El rango en el marcador: un escudo de campo oscuro con el canto de su metal y sus galones dentro
function drawRankShield(c, i, x, y, S) {
  c.save(); c.translate(x, y); const w = S * 0.5, path = () => { c.beginPath(); c.moveTo(-w, -S * 0.5); c.lineTo(w, -S * 0.5); c.lineTo(w, S * 0.08); c.quadraticCurveTo(w, S * 0.38, 0, S * 0.55); c.quadraticCurveTo(-w, S * 0.38, -w, S * 0.08); c.closePath(); };
  path(); const f = c.createLinearGradient(0, -S * 0.5, 0, S * 0.55); f.addColorStop(0, '#2a2150'); f.addColorStop(1, '#120c24'); c.fillStyle = f; c.fill();
  c.lineWidth = S * 0.07; c.strokeStyle = rankMetal(c, i, S); c.stroke(); c.lineWidth = S * 0.015; c.strokeStyle = 'rgba(0,0,0,0.6)'; c.stroke();
  c.restore(); drawRank(c, i, x, y + S * 0.02, S * 0.74);
}
// La medalla del resumen: oro, plata o bronce, colgada de su cinta, con el canto en relieve y una estrella en medio
function drawMedal(c, kind, x, y, R) {
  const M = { oro: ['#fff0a8', '#d9a520', '#8a5a0e'], plata: ['#ffffff', '#c3c9d4', '#6d7484'], bronce: ['#f4c79a', '#c07a3e', '#6e3f18'] }[kind]; if (!M) return;
  c.save(); c.translate(x, y);
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * R * 0.15, -R * 0.75); c.lineTo(s * R * 0.75, -R * 1.9); c.lineTo(s * R * 0.25, -R * 1.9); c.lineTo(-s * R * 0.25, -R * 0.75); c.closePath(); c.fillStyle = s < 0 ? '#3cf0c6' : '#ff4fa3'; c.fill(); } // la cinta
  const g = c.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R); g.addColorStop(0, M[0]); g.addColorStop(0.6, M[1]); g.addColorStop(1, M[2]);
  c.shadowColor = M[1]; c.shadowBlur = R * 0.5; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fillStyle = g; c.fill(); c.shadowBlur = 0;
  c.lineWidth = R * 0.08; c.strokeStyle = M[2]; c.beginPath(); c.arc(0, 0, R * 0.8, 0, TAU); c.stroke();
  c.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rad = k % 2 ? R * 0.22 : R * 0.5; c.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } c.closePath();
  const sg = c.createLinearGradient(0, -R * 0.5, 0, R * 0.5); sg.addColorStop(0, M[0]); sg.addColorStop(1, M[2]); c.fillStyle = sg; c.fill(); c.lineWidth = R * 0.03; c.strokeStyle = M[2]; c.stroke();
  c.restore();
}
class Btn {
  constructor(label, w, h, onPress, o = {}) {
    this.kind = 'btn'; this.w = w; this.h = h; this.label = label; this.onPress = onPress; this.style = o.style || 'normal'; this.font = o.font; this.accent = o.accent; this.icon = o.icon; this.badge = o.badge;
    this.p = makePanel(w, h, Math.round(clamp(4200 * w, 256, 2048)), { depthTest: o.depthTest }); // (unos 4 píxeles por milímetro: letras nítidas)
    this.mesh = this.p.mesh; this.hover = false; this.cool = 0; this.baseZ = 0; this.prevZ = {}; this.draw();
  }
  setLabel(l, style) { if (l !== this.label || (style && style !== this.style)) { const rec = style && style !== this.style; this.label = l; if (style) this.style = style; this.draw(); if (rec && this.setHover) this.setHover(this.hover, true); } }
  draw() {
    const c = this.p.ctx, W = this.p.W, H = this.p.H, s = STY[this.style] || STY.normal;
    if (this.cap) { // tecla de verdad (buildKeys): el cuerpo es la tecla; aquí solo lo que va impreso encima
      const tc = keyc(this.style)[1]; c.clearRect(0, 0, W, H); c.fillStyle = tc; c.textAlign = 'center'; c.textBaseline = 'middle';
      if (this.accent && this.style === 'normal') { rr(c, H * 0.1, H * 0.24, Math.max(6, H * 0.07), H * 0.52, Math.max(3, H * 0.035)); c.fillStyle = this.accent; c.fill(); c.fillStyle = tc; }
      if (this.icon) { drawIcon(c, this.icon, W / 2, H / 2, H * 0.5, tc); this.p.tex.needsUpdate = true; return; }
      if (this.badge !== undefined) drawRank(c, this.badge, this.label ? H * 0.62 : W / 2, H / 2, this.label ? H * 0.62 : Math.min(W, H) * 0.72, tc); // (sin texto: el galón solo, en medio)
      const ax = this.badge !== undefined ? H * 0.42 : this.accent && this.style === 'normal' ? H * 0.16 : 0;
      fitFont(c, this.label, W - H * 0.3 - ax * 2, Math.round(H * (this.font || 0.44)), '700 %px ' + FB); c.fillText(this.label, W / 2 + ax, H / 2 + 2); this.p.tex.needsUpdate = true; return;
    }
    c.clearRect(0, 0, W, H); rr(c, 4, 4, W - 8, H - 8, Math.min(H * 0.28, 28));
    c.fillStyle = this.hover ? (this.down ? '#e0b44e' : '#ffd166') : s[0]; c.fill();
    // relieve: arriba con luz y abajo en sombra (en relieve); hundido, al revés
    { const g = c.createLinearGradient(0, 4, 0, H - 4), a = this.down ? 'rgba(0,0,0,0.32)' : 'rgba(255,255,255,0.2)', b = this.down ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.34)';
      g.addColorStop(0, a); g.addColorStop(0.18, 'rgba(0,0,0,0)'); g.addColorStop(0.8, 'rgba(0,0,0,0)'); g.addColorStop(1, b); c.fillStyle = g; c.fill(); }
    const acc = this.accent && this.style === 'normal' && !this.hover;
    if ((s[2] || acc) && !this.hover) { c.lineWidth = Math.max(3, H * 0.04); c.strokeStyle = acc ? this.accent : s[2]; c.stroke(); }
    if (acc) { rr(c, H * 0.12, H * 0.22, Math.max(6, H * 0.07), H * 0.56, Math.max(3, H * 0.035)); c.fillStyle = this.accent; c.fill(); }
    c.fillStyle = this.hover ? '#1a0716' : s[1]; c.textAlign = 'center'; c.textBaseline = 'middle';
    if (this.icon) { drawIcon(c, this.icon, W / 2, H / 2, H * 0.5, this.hover ? '#1a0716' : s[1]); this.p.tex.needsUpdate = true; return; } // botones con icono (los de la música)
    if (this.badge !== undefined) drawRank(c, this.badge, this.label ? H * 0.62 : W / 2, H / 2, this.label ? H * 0.62 : Math.min(W, H) * 0.72, this.hover ? '#1a0716' : s[1]); // galones a la izquierda
    const ax = this.badge !== undefined ? H * 0.42 : this.accent && this.style === 'normal' ? H * 0.18 : 0; // (el texto se aparta de la raya de color o de los galones)
    fitFont(c, this.label, W - H * 0.4 - ax * 2, Math.round(H * (this.font || 0.44)), (this.style === 'value' ? '700 %px ' : '700 %px ') + FB);
    c.fillText(this.label, W / 2 + ax, H / 2 + 2); this.p.tex.needsUpdate = true;
  }
}
class Slider {
  constructor(f, w, h, onDrag) {
    this.kind = 'slider'; this.f = f; this.w = w; this.h = h; this.onDrag = onDrag; this.value = settings[f.key]; this.pad = 0.012;
    this.p = makePanel(w, h, Math.round(clamp(4200 * w, 256, 2048))); this.mesh = this.p.mesh; this.hover = false; this.baseZ = 0; this.prevZ = {}; this.pending = false; this.draw();
  }
  frac() { return (this.value - this.f.min) / (this.f.max - this.f.min); }
  draw() {
    const c = this.p.ctx, W = this.p.W, H = this.p.H, pad = this.pad / this.w * W, y = H / 2, x0 = pad, x1 = W - pad, x = x0 + (x1 - x0) * this.frac();
    c.clearRect(0, 0, W, H);
    rr(c, x0 - H * 0.12, y - H * 0.12, x1 - x0 + H * 0.24, H * 0.24, H * 0.12); c.fillStyle = '#120e26'; c.fill(); c.lineWidth = 3; c.strokeStyle = this.knob ? 'rgba(255,255,255,0.14)' : '#30284f'; c.stroke(); // (ranura hundida: el filo de abajo con luz)
    rr(c, x0 - H * 0.12, y - H * 0.12, Math.max(H * 0.24, x - x0 + H * 0.12), H * 0.24, H * 0.12); c.fillStyle = '#ff4fa3'; c.fill();
    c.fillStyle = 'rgba(238,234,255,0.35)'; for (let i = 0; i <= 10; i++) { const tx = x0 + (x1 - x0) * i / 10; c.fillRect(tx - 1, y + H * 0.2, 2, H * 0.1); }
    if (this.knob) { c.save(); c.filter = 'blur(5px)'; c.fillStyle = 'rgba(0,0,0,0.7)'; c.beginPath(); c.ellipse(x + H * 0.08, y + H * 0.12, H * 0.32, H * 0.3, 0, 0, TAU); c.fill(); c.restore(); } // la sombra de la bolita en la ranura
    if (this.knob) { this.knob.position.x = -this.w / 2 + this.pad + (this.w - 2 * this.pad) * this.frac(); this.knob.material.color.setHex(this.hover ? 0xffd166 : 0xffffff); } // la bolita de verdad, que se arrastra
    else { c.beginPath(); c.arc(x, y, H * 0.3, 0, TAU); c.fillStyle = this.hover ? '#ffd166' : '#eeeaff'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#1a0716'; c.stroke(); }
    this.p.tex.needsUpdate = true;
  }
  set(v) { if (v !== this.value) { this.value = v; this.draw(); } }
  drag(u) {
    const f = this.f, v = clampSetting(f, f.min + u * (f.max - f.min));
    if (v !== this.value) { this.value = v; this.draw(); this.pending = true; SND.tick(); if (this.onDrag) this.onDrag(v, false); }
  }
  commit() { if (this.pending) { this.pending = false; if (this.onDrag) this.onDrag(this.value, true); } }
}
/* ---------- Teclas de verdad ---------- */
// Los botones de los menús son teclas como las de un teclado: base redondeada, laterales que se estrechan hacia arriba y
// canto biselado, con la luz ya pintada (arriba claras, los laterales más oscuros y el de abajo aún más) sobre una bandeja
// oscura con grosor. Todas las de un menú van en una sola malla (un solo dibujo); al pulsar una se mueven sus vértices y,
// con el dedo encima, se aclara (sin volver a pintar su etiqueta)
const KEY_H = 0.012, KEY_RO = 51; // alto de las teclas, en metros reales; su orden de dibujo (tras OUT.black)
const KEYC = { normal: [0x5a6375, '#f2f4ff'], primary: [0xff9f1c, '#1e1305'], selected: [0xffb52e, '#1e1305'], value: [0x262b3a, '#ffd166'], tab: [0x434b5c, '#c9cde0'],
  danger: [0x8c3242, '#ffe0e6'], key: [0x5a6375, '#ffffff'], ghost: [0x363c4b, '#a9adc4'], slider: [0x2b3040, ''], tray: [0x1b1e26, ''] };
// con el estilo cómic: teclas de colores claros con la letra oscura, sobre una bandeja violeta (y con contorno de tinta)
const KEYC_C = { normal: [0x8fc7ff, '#1b1222'], primary: [0xff8a3d, '#1b1222'], selected: [0xffd23f, '#1b1222'], value: [0xfff2d6, '#c2410c'], tab: [0xc9b8ff, '#1b1222'],
  danger: [0xff6b7f, '#1b1222'], key: [0x8fc7ff, '#1b1222'], ghost: [0xd9d2e9, '#5a4f73'], slider: [0xfff2d6, ''], tray: [0x3a2d5c, ''] };
const keyc = style => { const P = comicOn() ? KEYC_C : KEYC; return P[style] || P.normal; };
// la luz con la que se pintan las teclas (en el plano del menú: x a la derecha, y arriba, z hacia ti): de arriba a la izquierda
const KEY_L = new V3(-0.42, 0.62, 0.66).normalize(), KEY_HV = KEY_L.clone().add(new V3(0, 0, 1)).normalize();
// anillo de un rectángulo redondeado (centro cx, cy; medio ancho a, medio alto b; radio r) a la altura z, en sentido antihorario
function keyRing(P, cx, cy, a, b, r, z) {
  const n = 3;
  for (const [sx, sy, a0] of [[1, 1, 0], [-1, 1, 0.5], [-1, -1, 1], [1, -1, 1.5]]) for (let i = 0; i <= n; i++) { const t = (a0 + i / n * 0.5) * Math.PI; P.push(cx + sx * (a - r) + Math.cos(t) * r, cy + sy * (b - r) + Math.sin(t) * r, z); }
}
// normales de cada vértice (media de las caras que lo tocan, pesada por su área)
function vNormals(P, I) {
  const N = new Float32Array(P.length);
  for (let k = 0; k < I.length; k += 3) {
    const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3, ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const o of [a, b, c]) { N[o] += nx; N[o + 1] += ny; N[o + 2] += nz; }
  }
  for (let o = 0; o < N.length; o += 3) { const l = Math.hypot(N[o], N[o + 1], N[o + 2]) || 1; N[o] /= l; N[o + 1] /= l; N[o + 2] /= l; }
  return N;
}
// un color con su luz: difusa desde KEY_L, un brillo donde la superficie refleja hacia ti y oscurecido abajo (ao)
function shadeInto(C, i, col, N, ao, spec = 0.32) {
  const o = i * 3, d = Math.max(0, N[o] * KEY_L.x + N[o + 1] * KEY_L.y + N[o + 2] * KEY_L.z), h = Math.max(0, N[o] * KEY_HV.x + N[o + 1] * KEY_HV.y + N[o + 2] * KEY_HV.z);
  if (comicOn() && spec < 0.45) { // cómic: dos tonos, la sombra violácea (la bolita de los deslizadores sigue como siempre)
    const lit = d > 0.35, f = (lit ? 1 : 0.8) * (0.6 + 0.4 * ao);
    C[o] = Math.min(1, col.r * f * (lit ? 1 : 0.88)); C[o + 1] = Math.min(1, col.g * f * (lit ? 1 : 0.84)); C[o + 2] = Math.min(1, col.b * f); return;
  }
  const f = (0.34 + 0.78 * d) * ao, sp = spec * Math.pow(h, 28);
  C[o] = Math.min(1, col.r * f + sp); C[o + 1] = Math.min(1, col.g * f + sp); C[o + 2] = Math.min(1, col.b * f + sp);
}
const KRING = 16, _kc = new THREE.Color(), _kc2 = new THREE.Color();
// la bolita de los deslizadores: un cilindro bajo con la cara de arriba abombada y el canto redondeado, con su luz pintada
const knobGeo = (() => {
  const prof = [[1, 0], [1, 0.5], [0.97, 0.72], [0.88, 0.86], [0.7, 0.95], [0.42, 1.0], [0, 1.03]], n = 24, P = [], I = [];
  prof.forEach(([r, z]) => { for (let i = 0; i < n; i++) { const a = i / n * TAU; P.push(Math.cos(a) * r, Math.sin(a) * r, z - 0.5); } });
  for (let k = 0; k + 1 < prof.length; k++) for (let i = 0; i < n; i++) { const A = k * n + i, B = k * n + (i + 1) % n; I.push(A, B, B + n, A, B + n, A + n); }
  const N = vNormals(P, I), C = new Float32Array(P.length), col = new THREE.Color(0xf2f4ff); if (col.convertSRGBToLinear) col.convertSRGBToLinear();
  for (let i = 0; i < P.length / 3; i++) shadeInto(C, i, col, N, i < n ? 0.6 : 1, 0.5);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3)); g.setIndex(I); return g;
})();
// list: botones y deslizadores ya colocados; tray: { w, h, d } la bandeja bajo todo
function buildKeys(group, list, kh, tray) {
  const P = [], I = [], R = [], IO = []; // IO: los triángulos con contorno (sin la cara de arriba)
  const shapeOf = (cx, cy, w, h, z0, top, colHex, flat) => {
    const start = P.length / 3, a = w / 2, b = h / 2, t = Math.min(0.007, Math.min(w, h) * 0.14), r0 = Math.min(a, b) * 0.34, H = top - z0, ao = [];
    // de abajo arriba: la base, el lateral (que se estrecha), el hombro redondeado y el canto; la bandeja, recta
    const rings = flat ? [[0, z0, 1], [0, top, 1]] : [[0, z0, 0.55], [t * 0.15, z0 + H * 0.45, 0.85], [t * 0.5, z0 + H * 0.8, 1], [t * 0.82, z0 + H * 0.95, 1], [t, top, 1]];
    rings.forEach(([ins, z, o]) => { keyRing(P, cx, cy, a - ins, b - ins, Math.max(0.002, r0 - ins * 0.5), z); for (let i = 0; i < KRING; i++) ao.push(o); });
    for (let k = 0; k + 1 < rings.length; k++) for (let i = 0; i < KRING; i++) { const A = start + k * KRING + i, B = start + k * KRING + (i + 1) % KRING; I.push(A, B, B + KRING, A, B + KRING, A + KRING); IO.push(A, B, B + KRING, A, B + KRING, A + KRING); }
    if (!flat) { // la cara de arriba, algo cóncava (como las teclas de verdad): su borde, un anillo más adentro algo más hondo y el centro
      const c0 = P.length / 3, dish = H * 0.1;
      keyRing(P, cx, cy, a - t, b - t, Math.max(0.002, r0 - t * 0.5), top); keyRing(P, cx, cy, (a - t) * 0.72, (b - t) * 0.6, Math.max(0.002, (r0 - t * 0.5) * 0.7), top - dish * 0.75); P.push(cx, cy, top - dish);
      for (let i = 0; i < KRING * 2 + 1; i++) ao.push(1);
      for (let i = 0; i < KRING; i++) { const A = c0 + i, B = c0 + (i + 1) % KRING; I.push(A, B, B + KRING, A, B + KRING, A + KRING); I.push(c0 + KRING * 2, c0 + KRING + i, c0 + KRING + (i + 1) % KRING); }
    }
    return { start, count: P.length / 3 - start, ao, col: colHex, cx, cy };
  };
  if (tray) R.push({ w: null, ...shapeOf(0, 0, tray.w, tray.h, -tray.d, -0.0008, keyc('tray')[0], true) });
  for (const w of list) R.push({ w, ...shapeOf(w.mesh.position.x, w.mesh.position.y, w.w, w.h, 0, kh, keyc(w.kind === 'slider' ? 'slider' : w.style)[0], false) });
  const N = vNormals(P, I), C = new Float32Array(P.length);
  for (const rg of R) { rg.N = N; keyColors(rg, C, rg.col, false); }
  const g = new THREE.BufferGeometry(), pos = new THREE.BufferAttribute(new Float32Array(P), 3), col = new THREE.BufferAttribute(C, 3);
  if (pos.setUsage) { pos.setUsage(THREE.DynamicDrawUsage); col.setUsage(THREE.DynamicDrawUsage); }
  g.setAttribute('position', pos); g.setAttribute('color', col); g.setIndex(I);
  // (se pintan después de la esfera negra del final de la ronda, OUT.black, que tapa todo lo opaco: si no, en el resumen las
  // teclas salían negras y no se leía lo que ponían)
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })); mesh.frustumCulled = false; mesh.renderOrder = KEY_RO; mesh.userData.own = 'all'; group.add(mesh);
  if (comicOn()) { // contorno de tinta de las teclas y la bandeja (comparte las posiciones: al hundir una tecla, su contorno la sigue)
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); outN(g);
    // (solo los laterales: la cara de arriba es cóncava y, vista en ángulo, su contorno asomaba por ella como grietas)
    const go = new THREE.BufferGeometry(); go.setAttribute('position', pos); go.setAttribute('normal', g.attributes.normal); go.setAttribute('aOutN', g.attributes.aOutN); go.setIndex(IO);
    const o = new THREE.Mesh(go, outlMat(false)); o.renderOrder = KEY_RO; o.userData.isOutline = true; o.userData.own = 'geo'; o.frustumCulled = false; o.raycast = () => {}; mesh.add(o);
  }
  const base = new Float32Array(P), K = { mesh, pos, col, base };
  const touch = (attr, rg) => { attr.needsUpdate = true; if (attr.updateRange) { const lo = attr.updateRange.count < 0 ? Infinity : attr.updateRange.offset; const a0 = Math.min(lo, rg.start * 3), a1 = Math.max(attr.updateRange.count < 0 ? -1 : attr.updateRange.offset + attr.updateRange.count, (rg.start + rg.count) * 3); attr.updateRange.offset = a0; attr.updateRange.count = a1 - a0; } };
  mesh.onAfterRender = () => { for (const a of [pos, col]) if (a.updateRange) a.updateRange.count = -1; };
  for (const rg of R) {
    const w = rg.w; if (!w) continue;
    w.cap = true; w.draw();
    w.mesh.position.z = kh + 0.0006; w.baseZ = w.mesh.position.z; w.maxPush = kh * 0.8;
    if (w.kind === 'slider') { // la bolita: se arrastra por la ranura
      const m = new THREE.Mesh(knobGeo, new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff, toneMapped: false })), r = w.h * 0.3;
      m.scale.set(r, r, kh * 0.9); m.position.z = kh * 0.45; m.renderOrder = KEY_RO; m.userData.own = 'mat'; w.mesh.add(m); w.knob = m; w.draw(); continue;
    }
    // al hundirla, además de bajar, se encoge un poco y se oscurece (de frente, el descenso solo apenas se veía); al pulsar, destella
    w.setPush = p => {
      const k = clamp(p / w.maxPush, 0, 1), s = 1 - 0.09 * k, a = pos.array;
      for (let i = rg.start; i < rg.start + rg.count; i++) { a[i * 3] = rg.cx + (base[i * 3] - rg.cx) * s; a[i * 3 + 1] = rg.cy + (base[i * 3 + 1] - rg.cy) * s; a[i * 3 + 2] = base[i * 3 + 2] - p; }
      w.mesh.position.z = w.baseZ - p; w.mesh.scale.set(s, s, 1); touch(pos, rg);
      if (Math.abs(k - (rg.press || 0)) > 0.04 || (k === 0) !== !rg.press) { rg.press = k; w.recolor(); }
    };
    w.recolor = () => { keyColors(rg, col.array, rg.col, w.hover); touch(col, rg); };
    w.setHover = (h, restyle) => { if (restyle) rg.col = keyc(w.style)[0]; w.recolor(); };
    w.flash = () => { w.flashT = 0.22; };
    w.flashStep = dt => { w.flashT = Math.max(0, w.flashT - dt); rg.flash = w.flashT / 0.22; w.recolor(); };
  }
  return K;
}
// los colores de una tecla con su luz (ver shadeInto); con el dedo encima, más clara
function keyColors(rg, C, hex, hover) {
  _kc.setHex(hex); if (hover) _kc.lerp(_kc2.setHex(0xffffff), 0.28);
  if (rg.press) _kc.multiplyScalar(1 - 0.35 * rg.press); // hundida, más oscura
  if (rg.flash) _kc.lerp(_kc2.setHex(0xffffff), 0.7 * rg.flash); // y el destello al pulsar
  if (_kc.convertSRGBToLinear) _kc.convertSRGBToLinear(); // (los colores de los vértices van en lineal: si no, salen lavados)
  for (let i = 0; i < rg.count; i++) shadeInto(C, rg.start + i, _kc, rg.N, rg.ao[i], rg.w === null ? 0.1 : 0.32);
}

const fingers = [];
const _wl = new V3(), _pkL = new V3(), _pkV = new V3(), _pkQ = new Q4(), _pkS = new V3(), _pkP = new V3();
// Pulsar con el dedo como un botón de verdad (el índice; medidas en metros reales, también en el menú de muñeca, que va
// a escala):
//  · el dedo tiene que llegar por delante: el botón que tiene delante (hasta POKE_HOVER) se ilumina y es el único que ese
//    dedo puede pulsar; entrar de lado o por detrás no pulsa nada
//  · al tocarlo, la cara del botón se hunde con el dedo (hasta POKE_TRAVEL) y pulsa al hundirse POKE_DEPTH, yendo hacia
//    dentro (un barrido de lado no cuenta)
//  · mientras está hundido, ese botón no cambia aunque el dedo resbale sobre los vecinos (si se sale más de POKE_SLIDE,
//    se anula); para volver a pulsar hay que sacar el dedo por delante (POKE_OUT), y entre dos pulsaciones pasa POKE_GAP
//  · tras pulsar (o al abrirse un menú), ese dedo no pulsa en el menú nuevo hasta retirarse (POKE_BACK por delante o fuera)
const POKE = { st: {}, need: { left: false, right: false }, until: 0 };
const POKE_HOVER = 0.06, POKE_DEPTH = 0.007, POKE_TRAVEL = 0.012, POKE_OUT = 0.008, POKE_SLIDE = 0.015, POKE_GAP = 0.25, POKE_BACK = 0.02;
function pokeSt(key, side) { const K = POKE.st[key] || (POKE.st[key] = {}); return K[side] || (K[side] = { cand: null, n: 0, push: false, done: false, prev: new V3(), v: new V3(), has: false }); }
const pokeU = (w, l) => clamp((l.x + w.w / 2 - w.pad) / (w.w - 2 * w.pad), 0, 1);
function pokeWidgets(list, dt, ready = true, isMenu = false) {
  const now = performance.now() / 1000, key = isMenu ? 'menu' : 'aux', vis = list.filter(w => w.mesh.visible);
  const push = new Map(), hov = new Set(), drags = new Map(); let press = null;
  for (const w of vis) w.cool = Math.max(0, (w.cool || 0) - dt);
  for (const side of ['left', 'right']) {
    const f = fingers.find(x => x.side === side), S = pokeSt(key, side);
    if (!f) { Object.assign(S, { cand: null, push: false, done: false, has: false }); continue; }
    if (S.has && dt > 0) S.v.subVectors(f.p, S.prev).divideScalar(dt); else S.v.set(0, 0, 0);
    S.prev.copy(f.p); S.has = true;
    // dónde está el dedo respecto a cada botón (z: delante de su superficie en reposo, en metros)
    let best = null, cur = null, behind = false;
    for (const w of vis) {
      if (w.only && w.only !== side) continue;
      w.mesh.updateMatrixWorld(); const e = w.mesh.matrixWorld.elements, sc = Math.hypot(e[0], e[1], e[2]) || 1;
      const l = w.mesh.worldToLocal(_pkL.copy(f.p)), z = (l.z - (w.baseZ - w.mesh.position.z)) * sc;
      const d = Math.max(Math.abs(l.x) / (w.w / 2), Math.abs(l.y) / (w.h / 2)), R = { w, l: l.clone(), z, d, sc };
      if (d < 1 && z > 0 && z < POKE_HOVER && (!best || d < best.d - 0.05 || (d < best.d + 0.05 && z < best.z))) best = R;
      if (d < 1.1 && z <= POKE_BACK && z > -0.15) behind = true;
      if (w === S.cand) cur = R;
    }
    if (isMenu && POKE.need[side]) { // menú recién abierto: hasta que el dedo se retire, no hace nada
      let near = behind;
      if (!near && menu && menu.group) { menu.group.updateMatrixWorld(); const l = menu.group.worldToLocal(_wl.copy(f.p)); if (Math.abs(l.x) < MW / 2 + 0.4 && Math.abs(l.y) < menu.H / 2 + 0.4 && l.z < POKE_BACK && l.z > -0.2) near = true; }
      if (!near) POKE.need[side] = false;
      Object.assign(S, { cand: null, push: false, done: false }); continue;
    }
    if (S.push) {
      const w = S.cand, slide = cur && (Math.abs(cur.l.x) > w.w / 2 + POKE_SLIDE / cur.sc || Math.abs(cur.l.y) > w.h / 2 + POKE_SLIDE / cur.sc);
      if (!cur || slide) { Object.assign(S, { cand: null, push: false, done: false }); continue; } // se fue de lado: anulado
      if (cur.z > POKE_OUT) { S.push = false; S.done = false; } // fuera, por delante: lista para otra
      else {
        const depth = Math.max(0, -cur.z);
        if (w.kind === 'slider') drags.set(w, pokeU(w, cur.l));
        else {
          push.set(w, Math.max(push.get(w) || 0, Math.min(depth, POKE_TRAVEL) / cur.sc));
          if (!S.done && depth >= POKE_DEPTH && S.n >= 2) {
            // hacia dentro y no de lado: la velocidad, en los ejes del botón
            w.mesh.matrixWorld.decompose(_pkP, _pkQ, _pkS); _pkV.copy(S.v).applyQuaternion(_pkQ.invert());
            const lat = Math.hypot(_pkV.x, _pkV.y), into = -_pkV.z;
            S.done = true;
            if (!(lat > 0.35 && lat > 1.5 * Math.max(0, into)) && !press) press = { w, side };
          }
        }
        hov.add(w); continue;
      }
    }
    // delante de un botón: ese es el candidato; si toca su superficie viniendo de delante, empieza a hundirlo
    if (cur && cur.z <= 0 && cur.d < 1 && !S.push) { S.push = true; S.done = false; hov.add(S.cand); if (S.cand.kind === 'slider') drags.set(S.cand, pokeU(S.cand, cur.l)); continue; }
    if (best) { if (best.w !== S.cand) { S.cand = best.w; S.n = 0; } S.n++; hov.add(best.w); }
    else S.cand = null;
  }
  for (const w of vis) {
    if (w.flashT > 0) w.flashStep(dt);
    const hover = hov.has(w); if (hover !== w.hover) { w.hover = hover; if (w.setHover) w.setHover(hover); else w.draw(); }
    if (w.kind === 'slider') { if (drags.has(w) && ready) w.drag(drags.get(w)); else w.commit(); }
    else {
      const p = Math.min(push.get(w) || 0, w.maxPush !== undefined ? w.maxPush : Infinity), dn = p > 0;
      if (w.setPush) { if (p !== (w.pushed || 0)) { w.pushed = p; w.setPush(p); } } // la tecla entera se hunde
      else { w.mesh.position.z = w.baseZ - p; if (dn !== !!w.down) { w.down = dn; w.draw(); } }
    }
  }
  if (!press || !ready || press.w.cool > 0 || now < POKE.until) return false;
  POKE.until = now + POKE_GAP; press.w.cool = 0.3; if (isMenu) POKE.need[press.side] = true;
  SND.click(); haptic(press.side, 0.15, 15); if (press.w.flash) press.w.flash(); press.w.onPress(); return true;
}

/* =================== MENÚ: PANEL DE LA MUÑECA IZQUIERDA (O ATRIL) =================== */
// En las Quest el menú sale de la muñeca izquierda con su botón MENÚ, se queda quieto delante de ti y se pulsa con el índice derecho.
// Con el ajuste «Atril», o en el ordenador, queda fijo delante de ti.
let menu = null, menuAnchor = null;
const wristMenuOn = () => xrActive && !preview && settings.menuWhere === 'wrist';
const MW = 0.9, PAD = 0.022, GAP = 0.01, LABW = 0.28; // (90 cm de ancho: cabe a la distancia del brazo sin girar la cabeza)
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
// Libera lo que se hizo para un menú: los paneles dibujados y, marcado con userData.own, lo de sus teclas en 3D ('all': la
// geometría y el material; 'geo': solo la geometría, como el contorno, de material compartido; 'mat': solo el material, como
// la bolita de los deslizadores, de geometría compartida)
function disposeTree(o) {
  o.traverse(n => {
    const own = n.userData.own; if (own && own !== 'mat') n.geometry.dispose(); if (own === 'all' || own === 'mat') n.material.dispose();
    if (n.material && n.material.map && n.material.map.isCanvasTexture && !(n.material.userData && n.material.userData.keep)) { n.material.map.dispose(); n.material.dispose(); if (n.geometry) n.geometry.dispose(); }
  });
}
// Al cerrar un menú se recuerda su sitio un momento: si enseguida se abre otro (de un menú a otro), sale en el mismo sitio
let lastAnchor = null, lastAnchorT = -9;
function hideMenu(keepAnchor) {
  if (menu) { scene.remove(menu.group); disposeTree(menu.group); menu = null; }
  if (!keepAnchor) { if (menuAnchor) { lastAnchor = menuAnchor; lastAnchorT = performance.now() / 1000; } menuAnchor = null; stand.visible = false; }
}
// las columnas del menú principal: margen dentro de su caja, alto del título y ancho de la etiqueta de sus campos
const COLP = 0.012, COLT = 0.03, COL_LW = 0.165;
const subH = r => { const f = r.t === 'field' && FIELD[r.key]; return r.h || (f && f.grid ? Math.ceil(f.opts.length / f.grid) * (GRID_H + GAP) - GAP : ROWH[r.t]) || 0.06; };
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
  rows = rows.slice();
  // con un menú abierto, el siguiente sale en el mismo sitio (también el que trajiste con «Traer menú»);
  // si no hay ninguno, delante de ti
  const wasClosed = !!(menu && menuAnchor && menu.closed), reuse = menu && menuAnchor, recent = !reuse && !opts.anchor && lastAnchor && performance.now() / 1000 - lastAnchorT < 2;
  hideMenu(true);
  if (recent) menuAnchor = lastAnchor;
  else if (!reuse) menuAnchor = opts.anchor || placeAnchor(0.75 * (opts.dist || settings.menuDist) / 100);
  POKE.need.left = POKE.need.right = true; // en el menú nuevo, el dedo que acaba de pulsar tiene que retirarse antes de pulsar otra vez
  // en las gafas, todo menú lleva «✕ Cerrar» arriba a la derecha (salvo mientras colocas algo: ahí el botón de la muñeca cancela)
  const closable = xrActive && !preview && !opts.noClose && !(RPL.on || PLACE.on || PLACE.wait);
  if (closable && (!rows.length || rows[0].t !== 'title')) rows = [{ t: 'title', text: '' }, ...rows];
  // las selecciones con muchas opciones (Enemigos) van en rejilla: f.grid por fila
  rows.forEach(r => { const f = r.t === 'field' && FIELD[r.key]; if (f && f.grid && !r.h) r.h = Math.ceil(f.opts.length / f.grid) * (GRID_H + GAP) - GAP; });
  rows.forEach(r => { if (r.t === 'cols' && !r.h) r.h = Math.max(...r.cols.map(col => (r.titles ? COLT : 0) + col.reduce((a, sr) => a + subH(sr), 0) + GAP * Math.max(0, col.length - 1))) + COLP * 2; });
  const wrapPx = (MW - PAD * 2 - 0.02) * 1024 / MW, lines = rows.map(r => r.t === 'text' && !r.h ? wrapLines(r.text, wrapPx) : null);
  const heights = rows.map((r, i) => r.h || (lines[i] && lines[i].length > 1 ? ROWH.text + (lines[i].length - 1) * TXT_LH : ROWH[r.t]) || 0.06);
  const H = PAD * 2 + heights.reduce((a, b) => a + b, 0) + GAP * (rows.length - 1);
  const group = new THREE.Group(); group.rotation.order = 'YXZ';
  const bg = makePanel(MW, H, 1024, { hd: 1.75 }); bg.mesh.renderOrder = RO.menu; group.add(bg.mesh); // (lienzo de 1792 px: letras nítidas)
  const c = bg.ctx, sc = bg.W / MW;
  // la bandeja de las teclas: gris muy oscuro, con un filo del color de la sección
  if (comicOn()) { // en cómic: violeta con una trama de puntos (como el papel de los cómics), borde de tinta y un filo del color de la sección
    rr(c, 4, 4, bg.W - 8, bg.H - 8, 34); c.fillStyle = '#3a2d5c'; c.fill(); c.save(); c.clip(); c.fillStyle = 'rgba(255,255,255,0.07)';
    for (let y = 8, r = 0; y < bg.H; y += 14, r++) for (let x = (r % 2) * 7 + 8; x < bg.W; x += 14) { c.beginPath(); c.arc(x, y, 2.6, 0, TAU); c.fill(); }
    c.restore(); c.lineWidth = 12; c.strokeStyle = '#140c1a'; c.stroke(); rr(c, 14, 14, bg.W - 28, bg.H - 28, 26); c.lineWidth = 4; c.strokeStyle = opts.border || opts.accent || '#ff4fa3'; c.stroke();
  } else { rr(c, 4, 4, bg.W - 8, bg.H - 8, 34); { const gr = c.createLinearGradient(0, 0, 0, bg.H); gr.addColorStop(0, '#262a34'); gr.addColorStop(1, '#1a1d25'); c.fillStyle = gr; } c.fill(); c.lineWidth = 5; c.strokeStyle = opts.border || opts.accent || '#ff4fa3'; c.stroke(); }
  const widgets = [], fieldRows = [];
  let y = H / 2 - PAD;
  const X0 = -MW / 2 + PAD, CW = MW - PAD * 2;
  // cada botón y deslizador es una tecla (buildKeys, al final) con una sombra suave en la bandeja
  const addW = (w, cx, cy) => {
    w.mesh.position.set(cx, cy, 0.003); w.baseZ = 0.003; w.mesh.renderOrder = RO.widget; group.add(w.mesh); widgets.push(w);
    // sombra difuminada hacia abajo a la derecha (la luz viene de arriba a la izquierda)
    const px = (cx - w.w / 2 + MW / 2) * sc, py = (H / 2 - cy - w.h / 2) * sc;
    c.save(); c.shadowColor = 'rgba(0,0,0,0.75)'; c.shadowBlur = 16; c.shadowOffsetX = 6; c.shadowOffsetY = 9; rr(c, px + 2, py + 2, w.w * sc - 4, w.h * sc - 4, Math.min(w.h * sc * 0.32, 30)); c.fillStyle = '#1d2029'; c.fill(); c.restore();
    return w;
  };
  // x0, cw: dónde empieza la fila y su ancho (todo el menú o una de sus columnas); lw: el ancho de la etiqueta
  const label = (text, cy, color = '#eeeaff', off = 0, x0 = X0, lw = LABW) => { c.fillStyle = color; c.textAlign = 'left'; c.textBaseline = 'middle'; fitFont(c, text, (lw - 0.01 - off) * sc, 34, '500 %px ' + FB); c.fillText(text, (x0 + off - (-MW / 2)) * sc, (H / 2 - cy) * sc); };
  const layRow = (r, h, cy, i, X0, CW, LW) => {
    if (r.t === 'title') {
      c.fillStyle = r.color || opts.accent || '#ffd166'; c.textAlign = 'center'; c.textBaseline = 'middle'; fitFont(c, r.text, (CW - 0.02 - (closable && !i ? CLOSE_W * 2 : 0)) * sc, 60, '%px ' + FD); c.fillText(r.text, (X0 + CW / 2 + MW / 2) * sc, (H / 2 - cy) * sc + 4);
      if (closable && !i) addW(new Btn('✕ Cerrar', CLOSE_W, Math.min(h, 0.052), menuClose, { style: 'ghost', font: 0.42 }), X0 + CW - CLOSE_W / 2, cy);
    }
    else if (r.t === 'text') {
      c.fillStyle = r.color || '#d8d3f5'; c.textAlign = 'center'; c.textBaseline = 'middle';
      if (lines[i] && lines[i].length > 1) { c.font = TXT_FONT; lines[i].forEach((l, k) => c.fillText(l, (X0 + CW / 2 + MW / 2) * sc, (H / 2 - cy + (k - (lines[i].length - 1) / 2) * TXT_LH) * sc)); }
      else { fitFont(c, r.text, (CW - 0.02) * sc, 30, '500 %px ' + FB); c.fillText(r.text, (X0 + CW / 2 + MW / 2) * sc, (H / 2 - cy) * sc); }
    }
    else if (r.t === 'canvas') { r.draw(c, (X0 + MW / 2) * sc, (H / 2 - cy - h / 2) * sc, CW * sc, h * sc); if (r.mount) r.mount(group, X0, cy, CW, h); } // dibujo libre (el resumen de la ronda)
    else if (r.t === 'btns' || r.t === 'tabs') {
      const n = r.items.length, tot = r.items.reduce((a, it) => a + (it.flex || 1), 0), avail = CW - GAP * (n - 1); let x = X0;
      r.items.forEach(it => { const w = avail * (it.flex || 1) / tot; addW(new Btn(it.label, w, h, it.onPress, { style: it.style || (r.t === 'tabs' ? (it.on ? 'selected' : 'tab') : 'normal'), font: r.t === 'tabs' ? 0.4 : undefined, accent: it.accent, icon: it.icon, badge: it.badge }), x + w / 2, cy); x += w + GAP; });
    } else if (r.t === 'choice') {
      label(r.label, cy, undefined, 0, X0, LW); const n = r.opts.length, avail = CW - LW - GAP * (n - 1); let x = X0 + LW; const w = avail / n;
      r.opts.forEach(([v, lab, dis]) => { addW(new Btn(lab, w, h, () => { if (!dis) r.onPick(v); }, { style: dis ? 'ghost' : (v === r.value ? 'selected' : 'normal'), font: 0.38 }), x + w / 2, cy); x += w + GAP; });
    } else if (r.t === 'field') {
      const f = FIELD[r.key], so = 0;
      label(f.short || f.label, f.grid ? cy + h / 2 - GRID_H / 2 : cy, undefined, so, X0, LW);
      if (f.type === 'num') {
        // en una columna (estrecha) no cabe el deslizador: − valor +
        const narrow = CW < 0.5, bw = narrow ? 0.052 : 0.054, vw = narrow ? CW - LW - bw * 2 - GAP * 2 : 0.13, sw = CW - LW - bw * 2 - vw - GAP * 3; let x = X0 + LW;
        const row = { f };
        const commit = v => { setSetting(f.key, v); refreshRow(row); };
        row.minus = addW(new Btn('−', bw, h, () => commit(settings[f.key] - f.step), { font: 0.6 }), x + bw / 2, cy); x += bw + GAP;
        if (narrow) { row.value = addW(new Btn(fmtVal(f), vw, h, () => openKeypad(f, row), { style: 'value', font: 0.42 }), x + vw / 2, cy); x += vw + GAP; } // (− valor +)
        else { row.slider = addW(new Slider(f, sw, h, (v, done) => { row.value.setLabel(fmtVal(f, v)); if (done) commit(v); }), x + sw / 2, cy); x += sw + GAP; }
        row.plus = addW(new Btn('+', bw, h, () => commit(settings[f.key] + f.step), { font: 0.6 }), x + bw / 2, cy); x += bw + GAP;
        if (!narrow) row.value = addW(new Btn(fmtVal(f), vw, h, () => openKeypad(f, row), { style: 'value', font: 0.36 }), x + vw / 2, cy);
        fieldRows.push(row);
      } else if (f.type === 'multi') { // varios a la vez (al menos uno, salvo los que pueden quedarse vacíos); con f.grid, en rejilla
        const n = f.opts.length, cols = f.grid || n, w = (CW - LW - GAP * (cols - 1)) / cols, bh = f.grid ? GRID_H : h, row = { f, btns: [] };
        const on = () => String(settings[f.key]).split(',');
        f.opts.forEach(([v, lab], i) => { const c = i % cols, rr_ = Math.floor(i / cols), x = X0 + LW + c * (w + GAP), y = f.grid ? cy + h / 2 - bh / 2 - rr_ * (bh + GAP) : cy;
          row.btns.push(addW(new Btn(lab, w, bh, () => {
          const cur = on(), next = cur.includes(v) ? cur.filter(k => k !== v) : [...cur, v]; if (!next.length && !f.empty) return;
          setSetting(f.key, next.join(',')); row.btns.forEach((b, j) => b.setLabel(b.label, on().includes(f.opts[j][0]) ? 'selected' : 'normal')); if (r.after) r.after();
        }, { style: on().includes(v) ? 'selected' : 'normal', font: f.grid ? 0.4 : 0.34 }), x + w / 2, y)); });
      } else {
        // una opción entre varias; con f.grid, en rejilla (y, con f.badges, cada una con sus galones: los rangos)
        const opts = f.type === 'toggle' ? [[1, 'Sí'], [0, 'No']] : f.opts, n = opts.length, cols = f.grid || n, w = (CW - LW - GAP * (cols - 1)) / cols, bh = f.grid ? GRID_H : h;
        const row = { f, btns: [] };
        opts.forEach(([v, lab], i) => { const x = X0 + LW + (i % cols) * (w + GAP), yy = f.grid ? cy + h / 2 - bh / 2 - Math.floor(i / cols) * (bh + GAP) : cy;
          row.btns.push(addW(new Btn(lab, w, bh, () => { setSetting(f.key, v); row.btns.forEach((b, j) => b.setLabel(b.label, opts[j][0] === settings[f.key] ? 'selected' : 'normal')); if (opts.length && r.after) r.after(); }, { style: settings[f.key] === v ? 'selected' : 'normal', font: f.grid ? 0.4 : 0.38, badge: f.badges ? i : undefined }), x + w / 2, yy)); });
      }
    }
  };
  rows.forEach((r, i) => {
    const h = heights[i], cy = y - h / 2;
    // dos columnas (el menú principal): cada una, en su caja con su título, con sus filas a la mitad de ancho
    if (r.t === 'cols') {
      const n = r.cols.length, cw = (CW - GAP * 2 * (n - 1)) / n;
      r.cols.forEach((col, k) => {
        const x0 = X0 + k * (cw + GAP * 2), px = (x0 + MW / 2) * sc, top = (H / 2 - (cy + h / 2)) * sc;
        rr(c, px, top, cw * sc, h * sc, 22); c.fillStyle = 'rgba(255,255,255,0.035)'; c.fill(); c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.08)'; c.stroke();
        let yy = cy + h / 2 - COLP;
        if (r.titles && r.titles[k]) { c.fillStyle = '#a49fc8'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.font = '600 24px ' + FB; c.fillText(r.titles[k].toUpperCase(), px + 0.014 * sc, (H / 2 - (yy - COLT / 2)) * sc); yy -= COLT; }
        col.forEach(sr => { const sh = subH(sr); layRow(sr, sh, yy - sh / 2, -1, x0 + COLP, cw - COLP * 2, COL_LW); yy -= sh + GAP; });
      });
    } else layRow(r, h, cy, i, X0, CW, LABW);
    y -= h + GAP;
  });
  bg.tex.needsUpdate = true;
  const wrist = wristMenuOn(), ksc = wrist ? wristScale() : 1;
  buildKeys(group, widgets.filter(w => w.kind === 'btn' || w.kind === 'slider'), KEY_H / ksc, { w: MW, h: H, d: 0.014 / ksc });
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
  menu = { group, widgets, fieldRows, rows, H, wrist, age: reuse ? 0.4 : 0, keypad: null, music: rows.some(r => r.music) ? spNowText() : null, closed: false };
  if (wasClosed && !wrist) { menu.closed = true; group.visible = false; stand.visible = false; } // cerrado sigue cerrado (lo trae el botón de la muñeca)
  return menu;
}
// «✕ Cerrar»: el menú se recoge en la muñeca (o, en el atril, desaparece) y vuelve con el botón MENÚ de la muñeca
const CLOSE_W = 0.15;
function menuClose() {
  if (!menu) return; closeKeypad(); SND.tick();
  if (menu.wrist) WM.on = false;
  else { menu.closed = true; menu.group.visible = false; stand.visible = false; }
}
function refreshRow(row) { const f = row.f; if (row.slider) row.slider.set(settings[f.key]); row.value.setLabel(fmtVal(f)); }

/* ---------- Teclado numérico ---------- */
// (opt: para escribir algo que no es un ajuste, como el código de otro dispositivo: { code, maxLen, onOK(texto) })
function openKeypad(f, row, opt = null) {
  if (!menu) return; closeKeypad();
  const KW = 0.32, kw = 0.086, kh = 0.06, g = 0.01, dispH = 0.09;
  const KH = PAD * 2 + dispH + 5 * kh + 5 * g;
  const ksc = menu.wrist ? wristScale() : 1, kkh = KEY_H / ksc, kd = 0.01 / ksc;
  const grp = new THREE.Group(); grp.position.set(0, 0, kkh + kd + 0.004 / ksc); menu.group.add(grp); // (por encima de las teclas del menú)
  const bg = makePanel(KW, KH, 640, { hd: 1.75 }); bg.mesh.renderOrder = RO.keypad; grp.add(bg.mesh);
  const kp = { f, row, str: '', fresh: true, grp, bg, widgets: [], KW, KH, dispH, opt };
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', opt ? ' ' : ',', '0', '⌫'];
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
  buildKeys(grp, kp.widgets, kkh, { w: KW, h: KH, d: kd });
  menu.keypad = kp; drawKeypad();
}
function drawKeypad() {
  const kp = menu && menu.keypad; if (!kp) return;
  const c = kp.bg.ctx, W = kp.bg.W, H = kp.bg.H, s = W / kp.KW, f = kp.f;
  c.clearRect(0, 0, W, H); rr(c, 4, 4, W - 8, H - 8, 26); c.fillStyle = 'rgba(10,7,22,0.98)'; c.fill(); c.lineWidth = 5; c.strokeStyle = '#ffd166'; c.stroke();
  c.textAlign = 'left'; c.textBaseline = 'top'; c.fillStyle = '#a49fc8'; fitFont(c, f.short || f.label, W - 40, 24, '500 %px ' + FB); c.fillText(f.short || f.label, 22, 18);
  const shown = kp.opt ? (kp.str ? kp.str.replace(/^(\d{4})(\d+)$/, '$1 $2') : '— — — —') : kp.fresh ? fmtNum(settings[f.key], f) : (kp.str || '0');
  rr(c, 18, 50, W - 36, kp.dispH * s - 30, 12); c.fillStyle = '#1d1738'; c.fill();
  c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillStyle = kp.fresh ? '#7d77a8' : '#ffffff'; c.font = `700 40px ${FB}`; c.fillText(shown + (f.unit ? ' ' + f.unit : ''), W - 34, 50 + (kp.dispH * s - 30) / 2);
  if (!kp.opt) { c.textAlign = 'left'; c.fillStyle = '#7d77a8'; c.font = `500 20px ${FB}`; c.fillText(`${fmtNum(f.min, f)}–${fmtNum(f.max, f)}`, 30, 50 + (kp.dispH * s - 30) / 2); }
  kp.bg.tex.needsUpdate = true;
}
function keypadKey(k) {
  const kp = menu && menu.keypad; if (!kp) return;
  if (kp.fresh) { kp.str = ''; kp.fresh = false; }
  if (kp.opt) { if (k === '⌫') kp.str = kp.str.slice(0, -1); else if (/\d/.test(k) && kp.str.length < (kp.opt.maxLen || 8)) kp.str += k; drawKeypad(); return; }
  if (k === '⌫') kp.str = kp.str.slice(0, -1);
  else if (k === ',') { if (decimals(kp.f) > 0 && !kp.str.includes(',')) kp.str = (kp.str || '0') + ','; }
  else if (kp.str.replace(',', '').length < 5) kp.str = (kp.str === '0' ? '' : kp.str) + k;
  drawKeypad();
}
function keypadOK() {
  const kp = menu && menu.keypad; if (!kp) return;
  if (kp.opt) { const str = kp.str; closeKeypad(); if (str) kp.opt.onOK(str); return; }
  if (!kp.fresh && kp.str !== '') { setSetting(kp.f.key, kp.str); refreshRow(kp.row); }
  closeKeypad();
}
function closeKeypad() {
  const kp = menu && menu.keypad; if (!kp) return;
  menu.group.remove(kp.grp); disposeTree(kp.grp); menu.keypad = null;
}
function activeWidgets() { if (!menu || menu.closed) return []; return menu.keypad ? menu.keypad.widgets : menu.widgets; }

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
  if (h.btnMenu && !watch.btnPrev) onWatch(); watch.btnPrev = h.btnMenu; // (se cierra con «✕ Cerrar», como con las manos)
  const guns = pistolOn() && GAME_STATES.includes(state) && !h.isHand; // con las pistolas en la mano el botón estorbaría
  const wristUp = menu && menu.wrist && WM.on && !wristFar(); // con el panel abierto delante, el botón sobra
  if (wristLook(h) && !wristUp && !guns) {
    show = true;
    if (h.isHand) { _wu.set(0, 1, 0).applyQuaternion(h.wristQ); watch.mesh.position.copy(h.wrist).addScaledVector(_wu, Math.sign(_wu.dot(_wh)) * 0.045).add(_wo.set(0, 0, 0.035).applyQuaternion(h.wristQ)); }
    else watch.mesh.position.copy(h.wrist).add(_wo.set(0, 0.08, 0));
  }
  const lab = PLACE.on ? 'CANCELAR' : PLACE.wait ? 'AJUSTAR' : menu && menu.wrist ? (WM.on ? 'TRAER MENÚ' : 'MENÚ') : menu && !menu.closed && (state === 'lobby' || state === 'end') ? 'TRAER MENÚ' : 'MENÚ';
  watch.setLabel(lab);
  watch.mesh.visible = show; watch.armT = show ? (watch.armT || 0) + dt : 0;
  if (show) { watch.mesh.lookAt(head.p); watch.baseZ = watch.mesh.position.z; pokeWidgets([watch], dt, watch.armT > 0.35); watch.mesh.position.z = watch.baseZ; }
  else if (watch.hover) { watch.hover = false; watch.draw(); }
}
// Panel de la muñeca: se abre con el botón MENÚ de la muñeca (o solo, cuando sale un menú nuevo: el principal al entrar,
// el resumen de la ronda…) creciendo desde la muñeca hasta quedarse quieto delante de ti, a wristDist de los ojos y de cara a
// ti, para pulsarlo con calma con el índice derecho: ya no sigue a la mano. Solo se cierra con su botón «✕ Cerrar» (ningún
// gesto de la mano lo cierra) y vuelve con el botón MENÚ. Si te alejas o te giras y lo pierdes de vista, el botón lo trae delante.
const WMS = 0.46; // escala del panel a 45 cm de los ojos: 0,76 m de ancho en el atril → 35 cm
// escala a la distancia elegida: más lejos, más grande, para que se lea igual
const wristScale = () => WMS * clamp(settings.wristDist / 45, 0.8, 1.7);
const WM = { e: 0, on: false, init: false, top: new V3(), q: new Q4(), from: new V3() };
const wristHint = glowSprite(0xff4fa3, 0.05, 0.8); wristHint.visible = false; scene.add(wristHint);
const _wm4 = new THREE.Matrix4(), _wmt = new V3(), _wmq = new Q4(), _wml = new V3(), _wmu = new V3();
// Abrir (o traer delante) el panel: sale otra vez desde la muñeca
function wristOpen() { WM.on = true; WM.e = 0; WM.init = false; }
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
  const hw = h.isHand ? h.J[0].s : h.wrist; // la muñeca suavizada: el menú no tiembla con ella
  if (!WM.init) { if (h.ok) WM.from.copy(hw); else WM.from.copy(head.p).addScaledVector(fwdH(), 0.3).add(_wmu.set(0, -0.35, 0)); wristTarget(H, S); }
  else if (h.ok && !WM.on) WM.from.copy(hw); // al cerrarse, vuelve a la muñeca
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
function updateWristMenu(dt) {
  if (!menu || !menu.wrist) { WM.e = 0; WM.init = false; wristHint.visible = false; return; }
  WM.e = clamp(WM.e + (WM.on ? dt / 0.22 : -dt / 0.22), 0, 1);
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
  if (menu && menu.wrist && menu.perks) { wristOpen(); SND.tick(); return; } // en el descanso, las cartas recogidas vuelven (79_perks)
  if (GAME_STATES.includes(state)) openPause();
  else if (menu && menu.wrist) { wristOpen(); SND.tick(); } // el menú recogido (o perdido de vista) sale delante
  else if (menu) { menu.closed = false; menu.group.visible = true; menuAnchor = placeAnchor(0.45); SND.tick(); const rebuild = menu.rebuild; if (rebuild) rebuild(); }
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
// adónde miras al girar o al subir y bajar la vista, pero nunca se ladean con la cabeza: el texto, siempre derecho.
// Tumbado o en plancha (mirando al suelo o al techo) salen en el suelo bajo tu cara o en el techo, de cara a tus ojos, con
// la parte de arriba del texto hacia tu cabeza: hacia donde apuntaba lo alto de tu cabeza al tumbarte (LIE.up, en
// horizontal), que ya no cambia aunque la ladees; una vez empezada la partida, además, fijos (FIXV)
const _vq = new Q4(), _ve = new THREE.Euler(0, 0, 0, 'YXZ'), LIE = { on: false, up: new V3() }, _lyX = new V3(), _lyY = new V3(), _lyZ = new V3(), _lyM = new THREE.Matrix4();
function viewQ() {
  const f = fwd();
  if ((isFloor() || isSupine() || settings.exercise === 'row') && Math.abs(f.y) > 0.6) {
    if (!LIE.on) { LIE.on = true; LIE.up.set(0, 1, 0).applyQuaternion(head.q); LIE.up.y = 0; if (LIE.up.lengthSq() < 1e-4) LIE.up.set(0, 0, -1); LIE.up.normalize(); }
    _lyZ.copy(f).negate(); _lyY.copy(LIE.up).addScaledVector(_lyZ, -LIE.up.dot(_lyZ)).normalize(); _lyX.crossVectors(_lyY, _lyZ);
    return _vq.setFromRotationMatrix(_lyM.makeBasis(_lyX, _lyY, _lyZ));
  }
  if (LIE.on && Math.abs(f.y) < 0.45) LIE.on = false; // (de pie o sentado otra vez: la próxima vez que te tumbes, se vuelve a tomar)
  _ve.setFromQuaternion(head.q, 'YXZ'); _ve.z = 0; return _vq.setFromEuler(_ve);
}
function viewLocal(off, out) { return out.copy(off).applyQuaternion(viewQ()).add(head.p); }
// Una vez colocado y empezada la partida (cuenta atrás, oleadas, descansos y pausa), los avisos salen siempre en el mismo
// sitio: delante de donde mirabas al empezar (FIXV), y ya no siguen a la cabeza. Antes (calibrarse, colocarse, cambiar
// de bloque) sí siguen a la vista
const FIXV = { on: false, p: new V3(), q: new Q4() }, _fxf = new V3();
function fixvStep() {
  const fixed = ['ready', 'play', 'rest', 'paused'].includes(state) && (xrActive || preview);
  if (fixed && !FIXV.on) { FIXV.on = true; FIXV.p.copy(head.p); FIXV.q.copy(viewQ()); }
  else if (!fixed) FIXV.on = false;
}
const hudQ = () => FIXV.on ? FIXV.q : viewQ();
const hudFwd = () => FIXV.on ? _fxf.set(0, 0, -1).applyQuaternion(FIXV.q) : fwd();
function hudLocal(off, out) { return FIXV.on ? out.copy(off).applyQuaternion(FIXV.q).add(FIXV.p) : viewLocal(off, out); }
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
  const free = i => { hudLocal(_hl.set(slots[i][0], slots[i][1], P.z), _ocDummy.position); _ocDummy.quaternion.copy(hudQ()); return !n || !panelHides(_ocDummy, P.w, P.h, true, n); };
  let pick = slots[P.slot] && free(P.slot) ? P.slot : -1;
  for (let i = 0; pick < 0 && i < slots.length; i++) if (free(i)) pick = i;
  if (pick >= 0) P.slot = pick; else P.slot = Math.min(P.slot, slots.length - 1);
  P.off.lerp(_hl.set(slots[P.slot][0], slots[P.slot][1], P.z), 1 - Math.exp(-dt * 10));
  P.fade += ((pick >= 0 ? 1 : 0.15) - P.fade) * Math.min(1, dt * 8);
  return hudLocal(P.off, new V3());
}
// Los avisos no siguen la mirada (así no hay quien los lea): salen delante de ti y se quedan quietos en el mundo. Solo se
// recolocan, deslizándose, si dejan de verse un rato (miras más de LAZY.ang a otro lado o te mueves LAZY.move) o si
// tapan algo que viene hacia ti
const LAZY = { ang: 50 * Math.PI / 180, t: 0.8, move: 0.6 }, _lz = new V3();
const mkLazy = () => ({ init: false, at: new V3(), q: new Q4(), home: new V3(), away: 0, go: false, vis: 1 });
function lazyAt(L, want, wantQ, dt, ang = LAZY.ang) {
  if (!L.init) { Object.assign(L, { init: true, away: 0, go: false, vis: 1 }); L.at.copy(want); L.q.copy(wantQ); L.home.copy(head.p); return L; }
  if (FIXV.on) { const k = 1 - Math.exp(-dt * 7); L.at.lerp(want, k); L.q.slerp(wantQ, k); L.go = false; return L; } // en partida, su sitio fijo (solo cambia de hueco si tapa algo)
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
const _wf = new V3(), _wfh = new V3(), _we = new THREE.Euler(0, 0, 0, 'YXZ');
function updateWarn(dt) {
  const m = WARN.p.mesh; if (!m.visible) return;
  WARN.t -= dt; if (WARN.t <= 0 || !GAME_STATES.includes(state) && state !== 'paused') { m.visible = false; WARN.text = ''; return; }
  const f = hudFwd(), hp = FIXV.on ? FIXV.p : head.p; let s;
  if (f.y > 0.35) { // mirando arriba: por encima de la cara, de cara a ti
    _wf.copy(hp).addScaledVector(f, 1.0); s = 0.75; WARN.q.copy(hudQ());
  } else { // en el suelo, delante: más lejos cuanto más alta la cabeza, tumbado y legible desde donde estás
    const h = FIXV.on ? _wfh.set(f.x, 0, f.z).normalize() : fwdH(), d = clamp(hp.y * 1.1, 0.5, 2.1); _wf.copy(hp).addScaledVector(h, d); _wf.y = 0.02;
    s = clamp(d * 0.85, 0.42, 1.7); _we.set(-Math.PI / 2, Math.atan2(-h.x, -h.z), 0); WARN.q.setFromEuler(_we);
  }
  if (!WARN.init) { LZ.warn.init = false; WARN.init = true; WARN.s = s; } // cada aviso nuevo sale delante; luego se queda quieto
  const L = lazyAt(LZ.warn, _wf, WARN.q, dt, 65 * Math.PI / 180); if (L.go) WARN.s += (s - WARN.s) * Math.min(1, dt * 7);
  m.position.copy(L.at); m.quaternion.copy(L.q); m.scale.setScalar(WARN.s);
  m.material.opacity = Math.min(1, WARN.t / 0.5, (WARN_SECS - WARN.t) / 0.15 + 0.2);
}
function updateViewPanels(dt) {
  fixvStep(); updateWarn(dt);
  const n = GAME_STATES.includes(state) ? collectThreats() : 0;
  if (center.mesh.visible) {
    const C = HUD.center, slots = menu && !menu.wrist ? [[0, 0.3]] : C.slots; // con el atril abierto, por encima para no taparlo
    const L = lazyAt(LZ.center, hudSlot(C, slots, n, dt), hudQ(), dt);
    center.mesh.position.copy(L.at); center.mesh.quaternion.copy(L.q); center.mesh.material.opacity = C.fade * lazyClear(L, center.mesh, 0.5, 0.2, n, dt);
  } else LZ.center.init = false;
  if (toastP.mesh.visible) {
    toastT -= dt; if (toastT <= 0) toastP.mesh.visible = false;
    const L = lazyAt(LZ.toast, hudSlot(HUD.toast, HUD.toast.slots, n, dt), hudQ(), dt);
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
    const nx = sesNext(), nb = nx && SES.blocks[nx.i];
    c.textAlign = 'left'; c.fillStyle = '#3cf0c6'; c.font = `50px ${FD}`; c.fillText('DESCANSO', 44, 68);
    c.textAlign = 'right'; c.fillStyle = '#ffffff'; c.font = `110px ${FD}`; c.fillText(String(Math.max(0, Math.ceil(SES.wait))), W - 50, 150);
    c.textAlign = 'left'; c.fillStyle = '#eeeaff'; c.font = `500 36px ${FB}`; c.fillText(nx ? `Bloque ${nx.i + 1} de ${SES.blocks.length}${SES.rounds > 1 ? ` · vuelta ${nx.r + 1}/${SES.rounds}` : ''}:` : '', 44, 150);
    if (nb) { c.fillStyle = '#ffd166'; fitFont(c, blockLabel(nb), W - 300, 40, '500 %px ' + FB); c.fillText(blockLabel(nb), 44, 210); }
    centerBar(c, W, H, SES.rest ? 1 - SES.wait / SES.rest : 1);
  } else if (state === 'calib') {
    c.fillStyle = '#3cf0c6'; c.font = `50px ${FD}`; c.textAlign = 'left'; c.fillText('CALIBRACIÓN', 44, 68);
    const L = { inchworm: ['De pie, mirando al frente, con sitio', 'delante para la plancha. Quieto 2 s.'], twist: ['Sujeta la barra flexible delante del', 'pecho, con las dos manos a la vista. 2 s.'], squat: ['De pie, mirando al frente, pies a la', 'anchura de los hombros. Quieto 2 s.'], pushup: ['Ponte en plancha: brazos estirados,', 'cuerpo recto. Quieto 2 s.'], plank1: ['Ponte en plancha sobre las dos manos,', 'cuerpo recto. Quieto 2 s.'], superman: ['Túmbate boca abajo con los brazos', 'estirados hacia delante. Quieto 2 s.'], curl: ['De pie, con las mancuernas y los', 'brazos estirados abajo. Quieto 2 s.'], jump: ['De pie, mirando al frente, con', 'espacio para saltar. Quieto 2 s.'], lunge: ['De pie, pies juntos, con espacio', 'delante para dar el paso. Quieto 2 s.'], dips: ['En el borde de la silla, manos en el', 'asiento, brazos estirados. Quieto 2 s.'], press: ['De pie, mancuernas a la altura', 'de los hombros. Quieto 2 s.'], curl2: ['De pie, la barra (o la kettlebell) con las', 'dos manos y los brazos abajo. Quieto 2 s.'], press2: ['De pie, la barra (o la kettlebell) a la', 'altura de los hombros. Quieto 2 s.'], thruster: ['De pie, las pesas en los hombros', 'con las dos manos. Quieto 2 s.'], frontsq: ['De pie, las pesas en las manos', 'con los brazos abajo. Quieto 2 s.'], jsquat: ['De pie, mirando al frente, con', 'espacio para saltar. Quieto 2 s.'], swing: ['De pie, la kettlebell con las dos', 'manos y los brazos abajo. Quieto 2 s.'], chop: ['De pie, la kettlebell o el disco con', 'las dos manos ante el pecho. Quieto 2 s.'], dlrow: ['De pie, las pesas en las manos', 'con los brazos abajo. Quieto 2 s.'], splank: ['De lado sobre el antebrazo,', 'cuerpo recto, cadera arriba. Quieto 2 s.'], abs: ['Túmbate boca arriba, rodillas', 'dobladas, pies al frente. Quieto 2 s.'] }[settings.exercise === 'combo' ? { stand: 'squat', floor: 'pushup', abs: 'abs' }[settings.comboBase] : settings.exercise === 'slam' ? 'squat' : settings.exercise] || ['Colócate en la postura inicial', 'y quédate quieto 2 s.'];
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
  if (comicOn()) { // en cómic: violeta con trama de puntos, borde grueso de tinta y un filo blanco por dentro
    c.fillStyle = '#3a2d5c'; c.fillRect(0, 0, W, H); c.fillStyle = 'rgba(255,255,255,0.08)';
    for (let y = 10, r = 0; y < H; y += 16, r++) for (let x = (r % 2) * 8 + 10; x < W; x += 16) { c.beginPath(); c.arc(x, y, 3, 0, TAU); c.fill(); }
    rr(c, 8, 8, W - 16, H - 16, 26); c.lineWidth = 14; c.strokeStyle = '#140c1a'; c.stroke(); rr(c, 20, 20, W - 40, H - 40, 18); c.lineWidth = 4; c.strokeStyle = '#fff4e0'; c.stroke();
    return;
  }
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
function glowText(c, t, x, y, col, blur) { c.save(); if (comicOn()) { c.lineJoin = 'round'; c.lineWidth = 10; c.strokeStyle = '#140c1a'; c.strokeText(t, x, y); } else { c.shadowColor = col; c.shadowBlur = blur; } c.fillStyle = col; c.fillText(t, x, y); c.restore(); } // (en cómic, con contorno de tinta en vez de brillo)
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
// El rosco: el fondo, el relleno (con su punta dorada si vas por delante de tu récord) y la muesca blanca de tu récord
function boardRing(c, x, y, R, lw, k, c0, c1, notch, ahead) {
  c.save(); c.lineCap = 'round'; c.lineWidth = lw; c.strokeStyle = comicOn() ? 'rgba(20,12,26,0.55)' : 'rgba(255,255,255,0.10)'; c.beginPath(); c.arc(x, y, R, 0, TAU); c.stroke();
  if (k > 0) { const g = c.createLinearGradient(x - R, y - R, x + R, y + R); g.addColorStop(0, c0); g.addColorStop(1, c1); if (!comicOn()) { c.shadowColor = c0; c.shadowBlur = 14; } c.strokeStyle = g; c.beginPath(); c.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, k)); c.stroke();
    if (ahead) { const a = -Math.PI / 2 + TAU * Math.min(1, k); c.shadowColor = BC.gold; c.shadowBlur = 20; c.fillStyle = BC.gold; c.beginPath(); c.arc(x + Math.cos(a) * R, y + Math.sin(a) * R, lw * 0.62, 0, TAU); c.fill(); } }
  c.restore();
  if (notch !== undefined) { const a = -Math.PI / 2 + TAU * notch, r0 = R - lw * 0.85, r1 = R + lw * 0.85; c.save(); c.strokeStyle = '#ffffff'; c.lineWidth = 6; c.beginPath(); c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); c.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); c.stroke(); c.restore(); }
}
// La racha en 10 tramos; cada vuelta completa, otro color (dorado, rosa, blanco)
function boardSegs(c, x, y, R, lw, n, lap) {
  const col = [BC.gold, BC.pink, '#ffffff'][clamp(lap, 0, 2)], gap = 0.07; c.save(); c.lineWidth = lw; c.lineCap = 'butt';
  for (let i = 0; i < 10; i++) { const a0 = -Math.PI / 2 + TAU * i / 10 + gap, a1 = -Math.PI / 2 + TAU * (i + 1) / 10 - gap; const on = i < n; c.strokeStyle = on ? col : comicOn() ? 'rgba(20,12,26,0.5)' : 'rgba(255,255,255,0.10)'; c.shadowBlur = on && !comicOn() ? 12 : 0; c.shadowColor = col; c.beginPath(); c.arc(x, y, R, a0, a1); c.stroke(); }
  c.restore();
}
// El relámpago: el borde se vuelve una mecha dorada que se consume (k: lo que queda), con la chispa en la punta
function boardFuse(c, W, H, k) {
  const m = 8, w = W - 2 * m, h = H - 2 * m, per = 2 * (w + h), s = per * clamp(k, 0, 1); c.save();
  c.lineWidth = 10; c.strokeStyle = 'rgba(255,209,102,0.18)'; rr(c, m, m, w, h, 26); c.stroke();
  c.setLineDash([s, per]); c.strokeStyle = BC.gold; if (!comicOn()) { c.shadowColor = BC.gold; c.shadowBlur = 18; } rr(c, m, m, w, h, 26); c.stroke(); c.setLineDash([]);
  let px, py; if (s < w) { px = m + s; py = m; } else if (s < w + h) { px = m + w; py = m + s - w; } else if (s < 2 * w + h) { px = m + w - (s - w - h); py = m + h; } else { px = m; py = m + h - (s - 2 * w - h); }
  c.shadowColor = '#ffffff'; c.shadowBlur = 22; c.fillStyle = '#ffffff'; c.beginPath(); c.arc(px, py, 9, 0, TAU); c.fill(); c.restore();
}
// Una frase grande a la derecha; si no cabe a buen tamaño, en dos líneas (nunca por debajo de 48 px)
function boardSay(c, t, col, x, y, maxW, size) {
  c.textAlign = 'right'; c.textBaseline = 'middle'; const fs = fitFont(c, t, maxW, size, '%px ' + FD);
  if (fs >= 56 || t.indexOf(' ') < 0) { glowText(c, t, x, y, col, 12); return; }
  const sp = [...t.matchAll(/ /g)].map(m => m.index), mid = t.length / 2, cut = sp.reduce((a, b) => Math.abs(b - mid) < Math.abs(a - mid) ? b : a);
  const l1 = t.slice(0, cut), l2 = t.slice(cut + 1), f2 = Math.min(fitFont(c, l1, maxW, Math.min(size, 72), '%px ' + FD), fitFont(c, l2, maxW, Math.min(size, 72), '%px ' + FD));
  c.font = `${f2}px ${FD}`; glowText(c, l1, x, y - f2 * 0.58, col, 12); glowText(c, l2, x, y + f2 * 0.58, col, 12);
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
  const N = nWaves(), hang = settings.exercise === 'hang', RX = W - 44, live = ['play', 'rest', 'ready'].includes(state);
  if (RUSH.on) boardFuse(c, W, H, RUSH.dur > 0 ? RUSH.left / RUSH.dur : 0); // el relámpago: el borde es una mecha que se consume
  // arriba: la oleada en puntos (y el bloque de la sesión), los puntos y las vidas
  let x = 44; c.textAlign = 'left';
  if (SES.active) { const t = `B${SES.idx + 1}/${SES.blocks.length}`; c.font = `48px ${FD}`; c.fillStyle = BC.teal; c.fillText(t, 32, 56); x = 32 + c.measureText(t).width + 30; }
  if (N > 0 && N <= 10) for (let i = 0; i < N; i++) { const cx = x + i * 40, wi = Math.min(waveIdx, N - 1), done = i < wi || (i === wi && state === 'rest'); c.beginPath(); c.arc(cx, 54, 13, 0, TAU); if (done) { c.fillStyle = BC.teal; c.fill(); } else if (i === wi) { c.lineWidth = 5; c.strokeStyle = BC.teal; c.stroke(); c.beginPath(); c.arc(cx, 54, 6, 0, TAU); c.fillStyle = BC.teal; c.fill(); } else { c.fillStyle = 'rgba(255,255,255,0.12)'; c.fill(); } }
  else { const t = N ? `${Math.min(waveIdx + 1, N)}/${N}` : String(waveIdx + 1); c.font = `48px ${FD}`; c.fillStyle = BC.teal; c.fillText('◉ ' + t, x - 12, 56); }
  c.textAlign = 'center'; c.font = `60px ${FD}`; const sc = String(score); glowText(c, sc, W / 2 + 40, 56, RUSH.on ? '#ffffff' : BC.gold, 16);
  if (RUSH.on) { c.textAlign = 'left'; const sw = c.measureText(sc).width; c.font = `48px ${FD}`; glowText(c, '×2', W / 2 + 40 + sw / 2 + 22, 56, BC.gold, 14); }
  c.textAlign = 'right';
  if (!nLives()) { c.font = `52px ${FD}`; c.fillStyle = BC.teal; c.fillText('∞', RX + 4, 56); }
  else if (nLives() <= 8) { let s = ''; for (let i = 0; i < nLives(); i++) s += i < lives ? '♥' : '♡'; fitFont(c, s, 280, 56, '%px ' + FB); glowText(c, s, RX + 4, 56, BC.pink, 10); }
  else { c.font = `52px ${FD}`; c.fillStyle = BC.pink; c.fillText(`♥ ${lives}`, RX + 4, 56); }
  // izquierda: el rosco doble. Fuera, la oleada (con la muesca de tu mejor ronda); dentro, la racha en 10 tramos; en
  // medio, tus repeticiones (en colgado, los segundos)
  const ox = 196, oy = 272, big = String(hang ? Math.floor(state === 'play' ? BAR.hold : stats.hold) : stats.reps);
  let wk = hang ? (state === 'play' ? BAR.hold / Math.max(1, BAR.need) : state === 'rest' ? 1 : 0) : waveTarget ? waveDone / waveTarget : 0;
  if (state === 'rest' && settings.rest > 0) wk = clamp(stateT / settings.rest, 0, 1); // (en el descanso, la cuenta atrás)
  else if (state === 'between') wk = SES.rest > 0 ? clamp(1 - SES.wait / SES.rest, 0, 1) : 1;
  const gh = state === 'play' && !hang ? ghostAt() : null, gold = RUSH.on;
  let notch, ahead = false;
  if (gh) { const k = (gh.g - (stats.reps - waveDone)) / Math.max(1, waveTarget); ahead = gh.beat || stats.reps >= gh.g; if (k > 0) notch = Math.min(0.995, k); }
  boardRing(c, ox, oy, 140, 26, wk, gold ? BC.gold : BC.teal, gold ? '#fff3c4' : '#7af7ff', notch, ahead && wk > 0);
  if (!hang) { const lap = combo > 0 && combo % 10 === 0 ? combo / 10 - 1 : Math.floor(combo / 10); boardSegs(c, ox, oy, 104, 18, combo > 0 && combo % 10 === 0 ? 10 : combo % 10, lap); }
  c.textAlign = 'center'; fitFont(c, big, 160, 120, '%px ' + FD); glowText(c, big, ox, oy + 8, '#ffffff', 16);
  // derecha: un solo hueco para lo que pasa ahora (no se pisan: va lo más importante)
  const say1 = (t, col, size = 84, y = 250) => boardSay(c, t, col, RX, y, 560, size);
  if (state === 'rest') {
    if (stateT >= settings.rest && perkWaits()) say1('ELIGE MEJORA', BC.gold, 72, 150); else say1(`DESCANSO ${Math.max(0, Math.ceil(settings.rest - stateT))}`, BC.teal, 72, 150);
    const nx = hang ? `Siguiente: ${hangSecs(waveIdx + 1)} s` : `Siguiente: ${waveReps(waveIdx + 1)}`, up = RAMP.note ? (RAMP.up ? ' · ▲ un poco más' : ' · igual') : '';
    const D = boardDay(), goal = settings.goalMin, g2 = ghostAt(), gt = g2 && g2.best ? (g2.beat ? `¡Récord! +${g2.n - g2.best}` : `Récord: vas ${g2.n - g2.g >= 0 ? '+' : '−'}${Math.abs(g2.n - g2.g)}`) : D.best ? `Tu mejor día: ${D.best}` : '';
    const line = (t, col, y) => { if (!t) return; c.fillStyle = col; fitFont(c, t, 560, 48, '600 %px ' + FB); c.fillText(t, RX, y); };
    line(nx + up, RAMP.up ? BC.gold : BC.ink, 214); line(`Hoy: ${Math.floor(D.time / 60)} de ${goal} min${D.time >= goal * 60 ? ' ✓' : ''}`, BC.ink, 272); line(gt, g2 && g2.n >= g2.g ? BC.teal : '#ff8a3d', 330);
  } else if (state === 'mount') say1(settings.exercise === 'row' ? 'A LAS PARALELAS' : 'A LA BARRA', BC.teal, 64);
  else if (state === 'calib') say1('CALIBRANDO', BC.teal, 72);
  else if (state === 'ready') say1(String(Math.max(1, Math.ceil(3 - stateT))), BC.gold, 160, 260);
  else if (state === 'paused') say1('PAUSA', BC.gold, 96);
  else if (state === 'between') say1(`DESCANSO ${Math.max(0, Math.ceil(SES.wait))}`, BC.teal, 72);
  else if (msg.t > 0) { c.globalAlpha = Math.min(1, msg.t * 2); say1(msg.text, msg.color, 84); c.globalAlpha = 1; }
  else if (RUSH.on) say1('⚡ ×2', BC.gold, 120, 260);
  else if (settings.mode === 'arcs' && (nextArcDrop || nextArcJump || nextArcPlank || nextArcMace)) say1(nextArcMace ? '¡MAZA!' : nextArcPlank ? '¡PLANCHA!' : nextArcJump ? '¡SALTA!' : nextArcTilt ? (nextArcTilt > 0 ? 'DERECHA →' : '← IZQUIERDA') : `BAJA ${Math.round(nextArcDrop * 100)} CM`, '#ff8a6a', 76, 200);
  // Arcos: los metros recorridos (con la fiebre) y la carrera contra el fantasma de tu mejor ronda
  if (settings.mode === 'arcs' && live && state !== 'rest') {
    const gd = arxGhostDiff(), t1 = `${Math.round(ARX.dist)} m${ARX.fever ? ' · FIEBRE' : ''}${gd !== null ? ` · fantasma ${gd >= 0 ? '+' : '−'}${Math.abs(gd)}` : ''}`; c.textAlign = 'right'; // (en una línea: abajo va el rango)
    c.fillStyle = ARX.fever ? '#ff4fa3' : gd !== null && gd < 0 ? '#ff8a3d' : BC.ink; fitFont(c, t1, 560, 48, '600 %px ' + FB); c.fillText(t1, RX, 330);
  }
  // abajo a la derecha, el rango: su escudo con los galones y el nombre
  { const nm = rankName().toUpperCase(), i = rankIdx(); c.textAlign = 'right'; c.textBaseline = 'middle'; fitFont(c, nm, 300, 50, '%px ' + FD); const tw = c.measureText(nm).width;
    glowText(c, nm, RX, 404, RANK_METAL[i][0], 8); drawRankShield(c, i, RX - tw - 50, 400, 76); }
  board.tex.needsUpdate = true;
}
