
/* =================== RENDER =================== */
let arMode = false;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 300); // (cerca de 5 cm: con 2 cm, de lejos la profundidad no distinguía superficies muy juntas y destellaban)
camera.position.set(0, 1.6, 0); camera.rotation.order = 'YXZ';
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = !!settings.shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
if (renderer.xr.setFoveation) renderer.xr.setFoveation(0.6);
$('#stage').prepend(renderer.domElement);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
const MAX_ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4);

/* ---------- Utilidades de lienzo ---------- */
function mkCanvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function texFrom(canvas, { srgb = true, repeat = null } = {}) {
  const t = new THREE.CanvasTexture(canvas); if (srgb) t.encoding = THREE.sRGBEncoding;
  t.anisotropy = MAX_ANISO; t.wrapS = t.wrapT = THREE.RepeatWrapping; if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}
function heightToNormal(H, strength) {
  const w = H.width, h = H.height, src = H.getContext('2d').getImageData(0, 0, w, h).data;
  const out = mkCanvas(w, h), octx = out.getContext('2d'), img = octx.createImageData(w, h), d = img.data;
  const at = (x, y) => src[((((y + h) % h) * w) + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    let nx = -dx, ny = dy, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  octx.putImageData(img, 0, 0); return out;
}
// Dibuja una forma repetida en los bordes para que la textura sea continua
function wrapDraw(size, x, y, rad, fn) {
  for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
    const X = x + dx, Y = y + dy; if (X + rad < 0 || X - rad > size || Y + rad < 0 || Y - rad > size) continue; fn(X, Y);
  }
}
function blob(ctx, x, y, r, col) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, col.replace(/[\d.]+\)$/, '0)')); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
function surface(w, h, seed, paint, normalStrength) {
  const A = mkCanvas(w, h), H = mkCanvas(w, h), R = mkCanvas(w, h);
  const S = { a: A.getContext('2d'), h: H.getContext('2d'), r: R.getContext('2d'), w, H: h, rnd: rng(seed) };
  paint(S);
  return { map: texFrom(A), normal: texFrom(heightToNormal(H, normalStrength), { srgb: false }), orm: texFrom(R, { srgb: false }), canvas: A };
}
function fillAll(S, albedo, height, rough, metal) {
  S.a.fillStyle = albedo; S.a.fillRect(0, 0, S.w, S.H);
  S.h.fillStyle = `rgb(${height},${height},${height})`; S.h.fillRect(0, 0, S.w, S.H);
  S.r.fillStyle = `rgb(0,${rough * 255 | 0},${metal * 255 | 0})`; S.r.fillRect(0, 0, S.w, S.H);
}
function speckle(S, n, aDark, aLight, hAmt, sz = 1.5) {
  const { a, h, rnd, w } = S;
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * S.H, dark = rnd() < 0.5;
    a.fillStyle = dark ? `rgba(0,0,0,${aDark})` : `rgba(255,255,255,${aLight})`; a.fillRect(x, y, sz, sz);
    h.fillStyle = dark ? `rgba(0,0,0,${hAmt})` : `rgba(255,255,255,${hAmt})`; h.fillRect(x, y, sz, sz);
  }
}
function scratches(S, n, len, alpha) {
  const { a, h, r, rnd } = S;
  for (let i = 0; i < n; i++) {
    const x = rnd() * S.w, y = rnd() * S.H, ang = rnd() < 0.6 ? rnd() * 0.6 - 0.3 + 0.8 : rnd() * TAU, l = len * (0.3 + rnd());
    const x2 = x + Math.cos(ang) * l, y2 = y + Math.sin(ang) * l;
    a.strokeStyle = `rgba(230,230,235,${alpha})`; a.lineWidth = 0.8; a.beginPath(); a.moveTo(x, y); a.lineTo(x2, y2); a.stroke();
    h.strokeStyle = 'rgba(0,0,0,0.35)'; h.lineWidth = 1; h.beginPath(); h.moveTo(x, y); h.lineTo(x2, y2); h.stroke();
    r.strokeStyle = 'rgba(0,50,255,0.5)'; r.lineWidth = 1; r.beginPath(); r.moveTo(x, y); r.lineTo(x2, y2); r.stroke();
  }
}
function panelLine(S, x1, y1, x2, y2) {
  const { a, h, r } = S;
  a.strokeStyle = 'rgba(0,0,0,0.55)'; a.lineWidth = 2; a.beginPath(); a.moveTo(x1, y1); a.lineTo(x2, y2); a.stroke();
  h.strokeStyle = '#000'; h.lineWidth = 3; h.beginPath(); h.moveTo(x1, y1); h.lineTo(x2, y2); h.stroke();
  r.strokeStyle = 'rgba(0,200,120,0.6)'; r.lineWidth = 3; r.beginPath(); r.moveTo(x1, y1); r.lineTo(x2, y2); r.stroke();
}
function rivet(S, x, y, rad) {
  const { a, h, r } = S;
  wrapDraw(S.w, x, y, rad + 2, (X, Y) => {
    a.fillStyle = 'rgba(0,0,0,0.45)'; a.beginPath(); a.arc(X + 0.8, Y + 1, rad + 0.8, 0, TAU); a.fill();
    a.fillStyle = 'rgba(200,205,212,0.55)'; a.beginPath(); a.arc(X, Y, rad, 0, TAU); a.fill();
    const g = h.createRadialGradient(X, Y, 0, X, Y, rad); g.addColorStop(0, '#fff'); g.addColorStop(1, '#808080'); h.fillStyle = g; h.beginPath(); h.arc(X, Y, rad, 0, TAU); h.fill();
    r.fillStyle = 'rgba(0,70,255,0.8)'; r.beginPath(); r.arc(X, Y, rad, 0, TAU); r.fill();
  });
}
function rust(S, n, maxR, streaks) {
  const { a, h, r, rnd } = S;
  for (let i = 0; i < n; i++) {
    const x = rnd() * S.w, y = rnd() * S.H, rad = maxR * (0.3 + rnd());
    wrapDraw(S.w, x, y, rad, (X, Y) => { blob(a, X, Y, rad, 'rgba(105,52,22,0.55)'); blob(r, X, Y, rad, 'rgba(0,235,50,0.7)'); });
    for (let k = 0; k < 30; k++) { const px = x + (rnd() - 0.5) * rad, py = y + (rnd() - 0.5) * rad; h.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},0.25)`; h.fillRect(px, py, 2, 2); a.fillStyle = 'rgba(70,30,10,0.35)'; a.fillRect(px, py, 2, 2); }
  }
  for (let i = 0; i < streaks; i++) {
    const x = rnd() * S.w, y = rnd() * S.H, len = 30 + rnd() * 140, wd = 1 + rnd() * 4;
    const g = a.createLinearGradient(x, y, x, y + len); g.addColorStop(0, 'rgba(110,50,18,0.4)'); g.addColorStop(1, 'rgba(110,50,18,0)');
    a.fillStyle = g; a.fillRect(x, y, wd, len);
    const g2 = r.createLinearGradient(x, y, x, y + len); g2.addColorStop(0, 'rgba(0,220,60,0.5)'); g2.addColorStop(1, 'rgba(0,220,60,0)'); r.fillStyle = g2; r.fillRect(x, y, wd, len);
  }
}
function mottle(S, n, maxR, dark, light) {
  const { a, rnd } = S;
  for (let i = 0; i < n; i++) { const x = rnd() * S.w, y = rnd() * S.H, rad = maxR * (0.2 + rnd()); wrapDraw(S.w, x, y, rad, (X, Y) => blob(a, X, Y, rad, rnd() < 0.55 ? `rgba(0,0,0,${dark})` : `rgba(255,255,255,${light})`)); }
}

/* ---------- Superficies PBR procedurales ---------- */
const SURF = {};
SURF.steel = surface(512, 512, 11, S => {
  fillAll(S, '#a9adb5', 128, 0.42, 0.95);
  mottle(S, 220, 70, 0.08, 0.05);
  speckle(S, 7000, 0.07, 0.05, 0.12);
  const lines = [0, 160, 256, 384];
  for (const y of lines) { panelLine(S, 0, y, 512, y); panelLine(S, 0, y + 512, 512, y + 512); }
  for (const x of [0, 128, 320]) { panelLine(S, x, 0, x, 512); panelLine(S, x + 512, 0, x + 512, 512); }
  for (const y of lines) for (let x = 8; x < 512; x += 32) rivet(S, x, y + 9, 3.2);
  scratches(S, 220, 50, 0.16);
  rust(S, 16, 46, 60);
  for (const y of lines) { const g = S.a.createLinearGradient(0, y - 30, 0, y); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(10,8,6,0.35)'); S.a.fillStyle = g; S.a.fillRect(0, y - 30, 512, 30); }
}, 2.2);
SURF.paint = surface(512, 512, 23, S => {
  fillAll(S, '#c8c4bd', 140, 0.6, 0.0);
  mottle(S, 160, 60, 0.09, 0.05);
  speckle(S, 5000, 0.08, 0.04, 0.1);
  // pintura desconchada: zonas de metal desnudo
  const { a, h, r, rnd } = S;
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 512, y = rnd() * 512, rad = 3 + rnd() * 16, rr = [];
    for (let k = 0; k < 9; k++) rr.push(rad * (0.5 + rnd() * 0.8));
    wrapDraw(512, x, y, rad * 2, (X, Y) => {
      a.fillStyle = 'rgba(70,72,76,0.95)'; h.fillStyle = 'rgba(60,60,60,1)'; r.fillStyle = 'rgba(0,90,240,1)';
      for (const c of [a, h, r]) { c.beginPath(); for (let k = 0; k < 9; k++) { const ang = k / 9 * TAU; k ? c.lineTo(X + Math.cos(ang) * rr[k], Y + Math.sin(ang) * rr[k]) : c.moveTo(X + Math.cos(ang) * rr[k], Y + Math.sin(ang) * rr[k]); } c.closePath(); c.fill(); }
    });
  }
  for (const y of [0, 256]) { panelLine(S, 0, y, 512, y); panelLine(S, 0, y + 512, 512, y + 512); }
  for (const x of [0, 256]) { panelLine(S, x, 0, x, 512); panelLine(S, x + 512, 0, x + 512, 512); }
  for (const y of [0, 256]) for (let x = 12; x < 512; x += 40) rivet(S, x, y + 10, 3.4);
  scratches(S, 160, 40, 0.25);
  rust(S, 10, 34, 50);
}, 2.0);
SURF.floor = surface(512, 512, 37, S => {
  fillAll(S, '#5b5f66', 128, 0.55, 0.85);
  const { a, h, r, rnd } = S;
  for (let row = 0; row < 16; row++) for (let col = 0; col < 16; col++) {
    const x = col * 32 + (row % 2 ? 16 : 0), y = row * 32 + 8, ang = (row + col) % 2 ? 0.78 : -0.78;
    for (const [c, fill] of [[a, 'rgba(190,195,205,0.22)'], [h, 'rgba(255,255,255,0.75)'], [r, 'rgba(0,70,240,0.6)']]) {
      c.save(); c.translate(x, y); c.rotate(ang); c.fillStyle = fill; c.beginPath(); c.ellipse(0, 0, 9, 2.4, 0, 0, TAU); c.fill(); c.restore();
    }
  }
  mottle(S, 120, 90, 0.18, 0.04);
  speckle(S, 6000, 0.1, 0.05, 0.1);
  panelLine(S, 0, 0, 512, 0); panelLine(S, 0, 512, 512, 512); panelLine(S, 0, 0, 0, 512); panelLine(S, 512, 0, 512, 512);
  for (let k = 12; k < 512; k += 64) { rivet(S, k, 8, 4); rivet(S, 8, k, 4); }
  rust(S, 10, 50, 20);
  for (let i = 0; i < 6; i++) { // charcos que reflejan
    const x = rnd() * 512, y = rnd() * 512, rx = 30 + rnd() * 70, ry = 20 + rnd() * 40;
    wrapDraw(512, x, y, rx, (X, Y) => {
      a.fillStyle = 'rgba(10,10,14,0.45)'; a.beginPath(); a.ellipse(X, Y, rx, ry, rnd(), 0, TAU); a.fill();
      h.fillStyle = 'rgba(128,128,128,0.8)'; h.beginPath(); h.ellipse(X, Y, rx, ry, 0, 0, TAU); h.fill();
      r.fillStyle = 'rgba(0,10,0,0.95)'; r.beginPath(); r.ellipse(X, Y, rx, ry, 0, 0, TAU); r.fill();
    });
  }
}, 2.5);
SURF.concrete = surface(512, 512, 41, S => {
  fillAll(S, '#77726b', 128, 0.93, 0.0);
  mottle(S, 260, 60, 0.1, 0.06);
  speckle(S, 14000, 0.12, 0.08, 0.2, 1.2);
  const { a, h, rnd } = S;
  for (const y of [0, 256]) { panelLine(S, 0, y, 512, y); panelLine(S, 0, y + 512, 512, y + 512); }
  for (const x of [0, 256]) { panelLine(S, x, 0, x, 512); panelLine(S, x + 512, 0, x + 512, 512); }
  for (let y = 64; y < 512; y += 128) for (let x = 64; x < 512; x += 128) { a.fillStyle = 'rgba(20,18,16,0.7)'; a.beginPath(); a.arc(x, y, 5, 0, TAU); a.fill(); h.fillStyle = '#000'; h.beginPath(); h.arc(x, y, 5, 0, TAU); h.fill(); }
  for (let i = 0; i < 70; i++) { const x = rnd() * 512, y = rnd() * 400, len = 40 + rnd() * 200, g = a.createLinearGradient(x, y, x, y + len); g.addColorStop(0, 'rgba(25,18,12,0.35)'); g.addColorStop(1, 'rgba(25,18,12,0)'); a.fillStyle = g; a.fillRect(x, y, 2 + rnd() * 8, len); }
  for (let i = 0; i < 9; i++) { let x = rnd() * 512, y = rnd() * 512; a.strokeStyle = 'rgba(15,12,10,0.7)'; h.strokeStyle = '#000'; a.lineWidth = 1.2; h.lineWidth = 2; a.beginPath(); h.beginPath(); a.moveTo(x, y); h.moveTo(x, y); for (let k = 0; k < 14; k++) { x += (rnd() - 0.5) * 30; y += rnd() * 18; a.lineTo(x, y); h.lineTo(x, y); } a.stroke(); h.stroke(); }
}, 2.0);
SURF.door = surface(256, 640, 53, S => {
  fillAll(S, '#8f949c', 128, 0.45, 0.9);
  const { a, h, r, rnd } = S;
  mottle(S, 120, 50, 0.1, 0.05); speckle(S, 5000, 0.08, 0.05, 0.12);
  // marco interior y nervios
  for (const y of [40, 200, 360, 520]) { h.fillStyle = 'rgba(255,255,255,0.6)'; h.fillRect(14, y, 228, 18); a.fillStyle = 'rgba(255,255,255,0.08)'; a.fillRect(14, y, 228, 18); a.fillStyle = 'rgba(0,0,0,0.35)'; a.fillRect(14, y + 18, 228, 4); for (let x = 24; x < 240; x += 26) rivet(S, x, y + 9, 3); }
  panelLine(S, 10, 10, 246, 10); panelLine(S, 10, 630, 246, 630); panelLine(S, 10, 10, 10, 630); panelLine(S, 246, 10, 246, 630);
  // franja de peligro
  a.save(); a.beginPath(); a.rect(0, 420, 256, 70); a.clip();
  for (let i = -6; i < 12; i++) { a.fillStyle = i % 2 ? '#e0a51c' : '#16131a'; a.beginPath(); a.moveTo(i * 36, 490); a.lineTo(i * 36 + 36, 490); a.lineTo(i * 36 + 106, 420); a.lineTo(i * 36 + 70, 420); a.fill(); }
  a.restore(); r.fillStyle = 'rgba(0,160,30,1)'; r.fillRect(0, 420, 256, 70);
  a.fillStyle = 'rgba(230,225,215,0.75)'; a.font = 'bold 90px Impact, sans-serif'; a.textAlign = 'center'; a.fillText('07', 128, 330);
  scratches(S, 120, 40, 0.22);
  // zarpazos
  for (let set = 0; set < 2; set++) {
    const x0 = 40 + rnd() * 120, y0 = 80 + set * 260 + rnd() * 60, ang = 0.9 + rnd() * 0.5, len = 120 + rnd() * 80;
    for (let k = 0; k < 4; k++) {
      const ox = x0 + k * 16, oy = y0 + k * 6;
      a.strokeStyle = 'rgba(20,16,14,0.9)'; a.lineWidth = 5; h.strokeStyle = '#000'; h.lineWidth = 6; r.strokeStyle = 'rgba(0,30,255,1)'; r.lineWidth = 7;
      for (const c of [r, h, a]) { c.beginPath(); c.moveTo(ox, oy); for (let s = 1; s <= 8; s++) c.lineTo(ox + Math.cos(ang) * len * s / 8 + (rnd() - 0.5) * 4, oy + Math.sin(ang) * len * s / 8); c.stroke(); }
      a.strokeStyle = 'rgba(235,235,240,0.6)'; a.lineWidth = 1.2; a.beginPath(); a.moveTo(ox - 3, oy); a.lineTo(ox - 3 + Math.cos(ang) * len, oy + Math.sin(ang) * len); a.stroke();
    }
  }
  rust(S, 8, 30, 40);
}, 2.4);
SURF.chitin = surface(256, 256, 61, S => {
  fillAll(S, '#2a221d', 128, 0.42, 0.0);
  mottle(S, 120, 30, 0.25, 0.06);
  speckle(S, 9000, 0.2, 0.08, 0.5, 1.4);
  const { h, rnd } = S;
  for (let i = 0; i < 600; i++) { const x = rnd() * 256, y = rnd() * 256; h.strokeStyle = 'rgba(255,255,255,0.35)'; h.lineWidth = 0.8; h.beginPath(); h.moveTo(x, y); h.lineTo(x + (rnd() - 0.5) * 3, y + 4 + rnd() * 4); h.stroke(); }
}, 3.0);
SURF.carbon = surface(256, 256, 71, S => {
  fillAll(S, '#5a5d63', 128, 0.32, 0.25);
  const { a, h, r } = S;
  for (let y = 0; y < 256; y += 8) for (let x = 0; x < 256; x += 8) {
    const o = ((x + y) / 8) % 2, g = a.createLinearGradient(x, y, x + (o ? 8 : 0), y + (o ? 0 : 8));
    g.addColorStop(0, 'rgba(255,255,255,0.0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.13)'); g.addColorStop(1, 'rgba(0,0,0,0.15)');
    a.fillStyle = g; a.fillRect(x, y, 8, 8); h.fillStyle = o ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'; h.fillRect(x, y, 8, 8);
  }
  scratches(S, 40, 30, 0.1); speckle(S, 2000, 0.1, 0.04, 0.08);
}, 1.4);

/* ---------- Texturas pequeñas ---------- */
const TX = {};
TX.halo = texFrom((() => { const c = mkCanvas(128), x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.65)'); g.addColorStop(0.5, 'rgba(255,255,255,0.15)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return c; })());
TX.atlas = (() => { // 0 brillo · 1 humo · 2 fuego · 3 chispa
  const c = mkCanvas(256), x = c.getContext('2d'), R = rng(5);
  let g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  for (const [ox, soft] of [[128, 0.12], [0, 0.22]]) {
    const oy = ox ? 0 : 128;
    for (let i = 0; i < 40; i++) { const px = ox + 64 + (R() - 0.5) * 60, py = oy + 64 + (R() - 0.5) * 60, rr = 12 + R() * 26; const gg = x.createRadialGradient(px, py, 0, px, py, rr); gg.addColorStop(0, `rgba(255,255,255,${soft + R() * soft})`); gg.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gg; x.beginPath(); x.arc(px, py, rr, 0, TAU); x.fill(); }
    x.globalCompositeOperation = 'destination-in'; const m = x.createRadialGradient(ox + 64, oy + 64, 10, ox + 64, oy + 64, 63); m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = m; x.fillRect(ox, oy, 128, 128); x.globalCompositeOperation = 'source-over';
  }
  g = x.createRadialGradient(192, 192, 0, 192, 192, 30); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(128, 128, 128, 128);
  const t = texFrom(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
})();
TX.rotor = new THREE.CanvasTexture((() => { const c = mkCanvas(256), x = c.getContext('2d'); x.translate(128, 128); for (let b = 0; b < 2; b++) { x.rotate(Math.PI); const g = x.createRadialGradient(0, 0, 10, 0, 0, 126); g.addColorStop(0, 'rgba(40,40,44,0.9)'); g.addColorStop(1, 'rgba(40,40,44,0.35)'); x.fillStyle = g; x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, 126, -0.5, 0.5); x.fill(); } x.strokeStyle = 'rgba(200,200,210,0.35)'; x.lineWidth = 3; x.beginPath(); x.arc(0, 0, 124, 0, TAU); x.stroke(); return c; })());
TX.beam = texFrom((() => { const c = mkCanvas(64, 64), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.42, 'rgba(255,255,255,0.35)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(0.58, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return c; })());
TX.cone = texFrom((() => { const c = mkCanvas(32, 128), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.85, 'rgba(255,255,255,0.1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 32, 128); return c; })());
TX.scan = texFrom((() => { const c = mkCanvas(16, 256), x = c.getContext('2d'); for (let y = 0; y < 256; y += 8) { x.fillStyle = 'rgba(255,255,255,0.9)'; x.fillRect(0, y, 16, 2); x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(0, y + 2, 16, 3); } return c; })());
TX.scorch = texFrom((() => { const c = mkCanvas(128), x = c.getContext('2d'), R = rng(9); for (let i = 0; i < 40; i++) { const px = 64 + (R() - 0.5) * 50, py = 64 + (R() - 0.5) * 50, rr = 10 + R() * 30, g = x.createRadialGradient(px, py, 0, px, py, rr); g.addColorStop(0, 'rgba(8,6,5,0.5)'); g.addColorStop(1, 'rgba(8,6,5,0)'); x.fillStyle = g; x.beginPath(); x.arc(px, py, rr, 0, TAU); x.fill(); } return c; })());
TX.abdomen = (() => { // patrón dorsal de la araña (galones y manchas)
  const c = mkCanvas(512, 256), x = c.getContext('2d'), R = rng(77);
  x.fillStyle = '#1a1411'; x.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 400; i++) { x.fillStyle = R() < 0.5 ? 'rgba(80,55,35,0.25)' : 'rgba(0,0,0,0.3)'; x.beginPath(); x.arc(R() * 512, R() * 256, 2 + R() * 8, 0, TAU); x.fill(); }
  for (let k = 0; k < 7; k++) {
    const y = 14 + k * 17, wdt = 70 - k * 7;
    x.strokeStyle = `rgba(150,105,60,${0.75 - k * 0.07})`; x.lineWidth = 5;
    x.beginPath(); x.moveTo(384 - wdt, y + 10); x.lineTo(384, y); x.lineTo(384 + wdt, y + 10); x.stroke();
    x.fillStyle = 'rgba(170,40,25,0.8)'; x.beginPath(); x.arc(384 - wdt * 0.55, y + 12, 4, 0, TAU); x.arc(384 + wdt * 0.55, y + 12, 4, 0, TAU); x.fill();
  }
  x.fillStyle = 'rgba(140,95,55,0.5)'; x.fillRect(120, 0, 16, 60);
  return texFrom(c);
})();
TX.hazard = texFrom((() => { const c = mkCanvas(128, 32), x = c.getContext('2d'); x.fillStyle = '#e0a51c'; x.fillRect(0, 0, 128, 32); x.fillStyle = '#141116'; for (let i = -2; i < 6; i++) { x.beginPath(); x.moveTo(i * 32, 32); x.lineTo(i * 32 + 16, 32); x.lineTo(i * 32 + 48, 0); x.lineTo(i * 32 + 32, 0); x.fill(); } return c; })());

/* ---------- Mapa de entorno (reflejos del metal) ---------- */
(function envMap() {
  const s = new THREE.Scene(), g = new THREE.SphereGeometry(10, 32, 16), cols = [];
  const top = new THREE.Color(0x4a5268), bot = new THREE.Color(0x150f12), c = new THREE.Color();
  for (let i = 0; i < g.attributes.position.count; i++) { const y = g.attributes.position.getY(i) / 10; c.copy(bot).lerp(top, clamp(y * 0.7 + 0.45, 0, 1)); cols.push(c.r, c.g, c.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  s.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const panel = (col, x, y, z, w, h) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m); };
  panel(0xffffff, 0, 8, 2, 7, 4); panel(0xff3b2a, -8, 2, -3, 3, 5); panel(0xffb070, 8, 3, -4, 3, 3); panel(0x8fb8ff, 3, 5, 8, 4, 3); panel(0xff2a20, 0, 1, -9, 6, 1.5);
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(s, 0.04).texture; pm.dispose();
})();

/* ---------- Colores y materiales ---------- */
const col = (r, g, b) => new THREE.Color(r, g, b);
const C = {
  white: col(1, 1, 1), steel: col(0.75, 0.76, 0.8), dark: col(0.3, 0.3, 0.33), black: col(0.07, 0.07, 0.08), chrome: col(1, 1, 1),
  bone: col(0.82, 0.78, 0.7), redPaint: col(0.55, 0.11, 0.07), crimson: col(0.35, 0.04, 0.05), olive: col(0.32, 0.34, 0.25), hazard: col(0.9, 0.62, 0.1), gun: col(0.4, 0.42, 0.46),
  red: col(1, 0.12, 0.06), redHalo: col(1, 0.18, 0.08), orange: col(1, 0.45, 0.1), teal: col(0.25, 1, 0.82), blue: col(0.2, 0.5, 1), green: col(0.2, 1, 0.3), amber: col(1, 0.7, 0.2),
  chitin: col(0.55, 0.45, 0.4), hair: col(0.3, 0.22, 0.16), chel: col(0.45, 0.2, 0.14), fang: col(0.05, 0.04, 0.04), legDark: col(0.42, 0.33, 0.28), legRing: col(0.9, 0.62, 0.38),
  waspY: col(0.95, 0.68, 0.08), waspK: col(0.07, 0.055, 0.04), waspO: col(0.75, 0.35, 0.08), eyeWasp: col(0.25, 0.06, 0.04), carbon: col(1, 1, 1), concrete: col(1, 1, 1)
};
const std = o => new THREE.MeshStandardMaterial(o);
function steelMat(extra) { return std(Object.assign({ map: SURF.steel.map, normalMap: SURF.steel.normal, roughnessMap: SURF.steel.orm, metalnessMap: SURF.steel.orm, metalness: 1, roughness: 1, vertexColors: true }, extra)); }
const M = {
  robot: steelMat({ skinning: true }),
  robotPaint: std({ map: SURF.paint.map, normalMap: SURF.paint.normal, roughnessMap: SURF.paint.orm, metalnessMap: SURF.paint.orm, metalness: 1, roughness: 1, vertexColors: true, skinning: true }),
  steel: steelMat({}),
  paint: std({ map: SURF.paint.map, normalMap: SURF.paint.normal, roughnessMap: SURF.paint.orm, metalnessMap: SURF.paint.orm, metalness: 1, roughness: 1, vertexColors: true }),
  glowSkin: new THREE.MeshBasicMaterial({ vertexColors: true, skinning: true, toneMapped: false }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  haloSkin: new THREE.MeshBasicMaterial({ map: TX.halo, vertexColors: true, skinning: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }),
  halo: new THREE.MeshBasicMaterial({ map: TX.halo, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }),
  chitinSkin: std({ map: SURF.chitin.map, normalMap: SURF.chitin.normal, roughnessMap: SURF.chitin.orm, metalness: 0, roughness: 1, vertexColors: true, skinning: true, side: THREE.DoubleSide }),
  abdomenSkin: std({ map: TX.abdomen, normalMap: SURF.chitin.normal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.45, metalness: 0, skinning: true }),
  glossSkin: std({ vertexColors: true, roughness: 0.05, metalness: 0.2, skinning: true }),
  waspSkin: std({ vertexColors: true, normalMap: SURF.chitin.normal, roughness: 0.42, metalness: 0.05, skinning: true, side: THREE.DoubleSide }),
  leg: std({ map: SURF.chitin.map, normalMap: SURF.chitin.normal, vertexColors: true, roughness: 0.5, metalness: 0, side: THREE.DoubleSide }),
  carbonSkin: std({ map: SURF.carbon.map, normalMap: SURF.carbon.normal, roughnessMap: SURF.carbon.orm, metalnessMap: SURF.carbon.orm, metalness: 1, roughness: 1, vertexColors: true, skinning: true }),
  rotorSkin: new THREE.MeshBasicMaterial({ map: TX.rotor, transparent: true, depthWrite: false, side: THREE.DoubleSide, skinning: true, opacity: 0.75 }),
  floor: std({ map: SURF.floor.map, normalMap: SURF.floor.normal, roughnessMap: SURF.floor.orm, metalnessMap: SURF.floor.orm, metalness: 1, roughness: 1 }),
  concrete: std({ map: SURF.concrete.map, normalMap: SURF.concrete.normal, roughnessMap: SURF.concrete.orm, metalness: 0, roughness: 1, vertexColors: true }),
  door: std({ map: SURF.door.map, normalMap: SURF.door.normal, roughnessMap: SURF.door.orm, metalnessMap: SURF.door.orm, metalness: 1, roughness: 1 }),
  hazard: std({ map: TX.hazard, roughness: 0.6, metalness: 0.2 }),
  rubber: std({ color: 0x141416, roughness: 0.85, metalness: 0 }),
  addGlow: new THREE.MeshBasicMaterial({ color: 0xffffff, map: TX.beam, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }),
  shadowCatcher: new THREE.ShadowMaterial({ opacity: 0.45 })
};
// Las texturas de detalle se repiten según el tamaño real (G.* reescala las UV)
[SURF.steel, SURF.paint, SURF.chitin, SURF.carbon, SURF.concrete].forEach(s => { [s.map, s.normal, s.orm].forEach(t => t.repeat.set(1, 1)); });
SURF.floor.map.repeat.set(40, 40); SURF.floor.normal.repeat.set(40, 40); SURF.floor.orm.repeat.set(40, 40);
[SURF.door.map, SURF.door.normal, SURF.door.orm].forEach(t => { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; });

/* ---------- Geometría ---------- */
const _m4 = new THREE.Matrix4(), _q4 = new Q4(), _eu = new THREE.Euler(), _sv = new V3(), _pv = new V3();
function xform(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) { _m4.compose(_pv.set(x, y, z), _q4.setFromEuler(_eu.set(rx, ry, rz)), _sv.set(sx, sy, sz)); g.applyMatrix4(_m4); return g; }
function tint(g, c) { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
function scaleUV(g, su, sv) { const uv = g.attributes.uv; if (!uv) return g; const ou = Math.random(), ov = Math.random(); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su + ou, uv.getY(i) * sv + ov); return g; }
const TS = 0.45; // metros por repetición de textura
const G = {
  box(w, h, d, ts = TS) {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]], ou = Math.random(), ov = Math.random();
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / ts + ou, uv.getY(k) * dims[f][1] / ts + ov); }
    return g;
  },
  cyl(rt, rb, h, seg = 12, ts = TS, open = false) { return scaleUV(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), TAU * Math.max(rt, rb) / ts, h / ts); },
  cylRaw(rt, rb, h, seg = 12) { return new THREE.CylinderGeometry(rt, rb, h, seg); },
  cone(r, h, seg = 8) { return scaleUV(new THREE.ConeGeometry(r, h, seg), TAU * r / TS, h / TS); },
  sph(r, ws = 14, hs = 10, ts = TS, a = 0, b = TAU, c = 0, d = Math.PI) { return scaleUV(new THREE.SphereGeometry(r, ws, hs, a, b, c, d), TAU * r / ts, Math.PI * r / ts); },
  tor(R, r, rs = 6, ts = 16, arc = TAU) { return scaleUV(new THREE.TorusGeometry(R, r, rs, ts, arc), R * arc / TS, TAU * r / TS); },
  tube(pts, r, seg = 12, rs = 6) { return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, rs, false); },
  plane(w, h) { return new THREE.PlaneGeometry(w, h); },
  halo(s) { const a = new THREE.PlaneGeometry(s, s), b = new THREE.PlaneGeometry(s, s); b.rotateY(Math.PI / 2); const c = new THREE.PlaneGeometry(s, s); c.rotateX(Math.PI / 2); return mergeGeos([a.toNonIndexed(), b.toNonIndexed(), c.toNonIndexed()]); }
};
// Pelos/púas finas sobre un elipsoide (arañas, avispas)
function spikes(cx, cy, cz, rx, ry, rz, n, len, w, opts = {}) {
  const pos = [], R = Math.random;
  for (let i = 0; i < n; i++) {
    let u = new V3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1); if (u.lengthSq() > 1 || u.lengthSq() < 0.01) { i--; continue; } u.normalize();
    if (opts.upper && u.y < -0.2) { i--; continue; }
    const p = new V3(cx + u.x * rx, cy + u.y * ry, cz + u.z * rz), nrm = new V3(u.x / rx, u.y / ry, u.z / rz).normalize();
    const t = new V3().crossVectors(nrm, Math.abs(nrm.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0)).normalize().multiplyScalar(w / 2);
    const dir = nrm.clone().multiplyScalar(0.75).add(new V3(0, 0, opts.back || -0.35)).add(new V3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(0.4)).normalize().multiplyScalar(len * (0.5 + R()));
    const a = p.clone().sub(t), b = p.clone().add(t), c = p.clone().add(dir);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); g.computeVertexNormals(); return g;
}
// Cilindro entre dos puntos (para patas articuladas estáticas)
const _up = new V3(0, 1, 0);
function limbBetween(a, b, r0, r1, seg = 6) {
  const d = b.clone().sub(a), len = d.length(), g = G.cyl(r1, r0, len, seg);
  g.translate(0, len / 2, 0); _q4.setFromUnitVectors(_up, d.normalize()); g.applyMatrix4(_m4.makeRotationFromQuaternion(_q4)); g.translate(a.x, a.y, a.z); return g; // r128 no tiene BufferGeometry.applyQuaternion
}
function ensureAttrs(g) {
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}
function mergeGeos(list) {
  list = list.map(g => ensureAttrs(g.index ? g.toNonIndexed() : g));
  const names = Object.keys(list[0].attributes); let n = 0; list.forEach(g => n += g.attributes.position.count);
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const a0 = list[0].attributes[name], size = a0.itemSize, Arr = a0.array.constructor, arr = new Arr(n * size); let o = 0;
    for (const g of list) { const a = g.attributes[name]; if (a && a.itemSize === size) arr.set(a.array, o); o += g.attributes.position.count * size; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size, a0.normalized));
  }
  out.computeBoundingSphere(); return out;
}
function prep(geo, c, x, y, z, rx, ry, rz, sx, sy, sz) {
  const g = ensureAttrs(geo.index ? geo.toNonIndexed() : geo.clone());
  xform(g, x, y, z, rx, ry, rz, sx === undefined ? 1 : sx, sy === undefined ? (sx === undefined ? 1 : sx) : sy, sz === undefined ? (sx === undefined ? 1 : sx) : sz);
  return tint(g, c || C.white);
}
// Kit: piezas estáticas fusionadas por material (pocas llamadas de dibujo)
class Kit {
  constructor() { this.ch = {}; }
  add(ch, geo, c, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx, sy, sz) { (this.ch[ch] = this.ch[ch] || []).push(prep(geo, c, x, y, z, rx, ry, rz, sx, sy, sz)); return this; }
  build(mats, { cast = false, receive = false } = {}) {
    const grp = new THREE.Group();
    for (const ch in this.ch) { const m = new THREE.Mesh(mergeGeos(this.ch[ch]), mats[ch]); m.castShadow = cast && ch !== 'halo' && ch !== 'glow'; m.receiveShadow = receive; grp.add(m); }
    return grp;
  }
}
// Rig: modelo articulado con huesos rígidos → 1 malla con skinning por material
class Rig {
  constructor() { this.bones = []; this.by = {}; }
  bone(name, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const b = { name, parent: parent ? this.by[parent] : null, pos: new V3(x, y, z), rot: new THREE.Euler(rx, ry, rz), parts: {}, idx: this.bones.length };
    this.bones.push(b); this.by[name] = b; return this;
  }
  add(bone, ch, geo, c, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx, sy, sz) {
    const b = this.by[bone]; (b.parts[ch] = b.parts[ch] || []).push(prep(geo, c, x, y, z, rx, ry, rz, sx, sy, sz)); return this;
  }
  build() {
    for (const b of this.bones) {
      b.local = new THREE.Matrix4().compose(b.pos, new Q4().setFromEuler(b.rot), new V3(1, 1, 1));
      b.model = b.parent ? new THREE.Matrix4().multiplyMatrices(b.parent.model, b.local) : b.local.clone();
      b.inv = b.model.clone().invert();
    }
    const chans = {};
    for (const b of this.bones) for (const ch in b.parts) {
      const local = mergeGeos(b.parts[ch]); b.parts[ch] = local;
      const g = local.clone().applyMatrix4(b.model), n = g.attributes.position.count;
      const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4); for (let i = 0; i < n; i++) { si[i * 4] = b.idx; sw[i * 4] = 1; }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      (chans[ch] = chans[ch] || []).push(g);
    }
    this.chans = {}; for (const ch in chans) this.chans[ch] = mergeGeos(chans[ch]);
    return this;
  }
  instance(mats, cast = true) {
    const root = new THREE.Group();
    const bones = this.bones.map(b => { const o = new THREE.Bone(); o.name = b.name; o.position.copy(b.pos); o.rotation.copy(b.rot); return o; });
    this.bones.forEach((b, i) => { if (b.parent) bones[b.parent.idx].add(bones[i]); });
    const skel = new THREE.Skeleton(bones, this.bones.map(b => b.inv.clone()));
    const meshes = {}; let first = null;
    for (const ch in this.chans) {
      if (!mats[ch]) continue;
      const m = new THREE.SkinnedMesh(this.chans[ch], mats[ch]); m.frustumCulled = false;
      if (!first) { first = m; this.bones.forEach((b, i) => { if (!b.parent) m.add(bones[i]); }); }
      m.bind(skel, new THREE.Matrix4());
      m.castShadow = cast && !['halo', 'glow', 'rotor', 'wing'].includes(ch);
      root.add(m); meshes[ch] = m;
    }
    const B = {}; bones.forEach(o => B[o.name] = o);
    return { root, meshes, bones: B, list: bones, rig: this, skel };
  }
}

/* ---------- Luces ---------- */
const hemi = new THREE.HemisphereLight(0x8d98b8, 0x2a1814, 0.5); scene.add(hemi);
const flashLight = new THREE.PointLight(0xffa050, 0, 14, 2); scene.add(flashLight);
