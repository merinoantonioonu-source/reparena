
/* =================== RAYOS: LOS DISPAROS SON DESCARGAS ELÉCTRICAS =================== */
// Cada disparo es un rayo quebrado que avanza hasta el blanco (el «líder») y, al llegar, destella y
// parpadea unas décimas con ramas que cambian, echando chispas. Ilumina el entorno con una luz puntual y,
// durante el destello, la luz principal (la que proyecta sombras) se desplaza hacia el rayo, así que las
// sombras saltan. Color, grosor, ramas y luz crecen con la intensidad del disparo.
const BOLT_COL = [0x9fd8ff, 0x3cf0c6, 0xffd166, 0xff8a2a, 0xff3cf0]; // normal, perfecto, carga ×2, ×3, ×4
const boltLevel = (perfect, pow = 1) => Math.max(perfect ? 1 : 0, pow > 1 ? pow : 0);
const boltRGB = L => { const c = new THREE.Color(BOLT_COL[L]); return [c.r, c.g, c.b]; };
const boltTex = texFrom((() => { const c = mkCanvas(64, 8), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 64, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.3, 'rgba(255,255,255,0.35)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(0.7, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 8); return c; })());
const boltMatL = new THREE.MeshBasicMaterial({ map: boltTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
const boltLight = new THREE.PointLight(0x9fd8ff, 0, 5, 2); scene.add(boltLight);
const LT_SEG = 220, LT_FLICK = 0.045;
const _za = new V3(), _zb = new V3(), _zc = new V3(), _zd = new V3(), _zu = new V3(), _zv = new V3();
// Línea quebrada de a a b: cada tramo se parte por la mitad y el punto medio se desplaza hacia un lado
function jag(a, b, levels, rough, out = []) {
  let pts = [a.clone(), b.clone()];
  for (let l = 0; l < levels; l++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1], len = p.distanceTo(q);
      _zd.subVectors(q, p).normalize(); _zu.set(0, 1, 0); if (Math.abs(_zd.y) > 0.9) _zu.set(1, 0, 0);
      _zu.cross(_zd).normalize(); _zv.crossVectors(_zd, _zu);
      const m = p.clone().lerp(q, 0.5).addScaledVector(_zu, rand(-1, 1) * len * rough).addScaledVector(_zv, rand(-1, 1) * len * rough);
      next.push(m, q);
    }
    pts = next;
  }
  out.push(...pts); return out;
}
class Lightning {
  constructor() {
    const g = new THREE.BufferGeometry(), n = LT_SEG * 6;
    this.P = new Float32Array(n * 3); this.C = new Float32Array(n * 3); const U = new Float32Array(n * 2);
    const quad = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]; for (let i = 0; i < LT_SEG; i++) U.set(quad, i * 12);
    g.setAttribute('position', new THREE.BufferAttribute(this.P, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.C, 3)); g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    this.g = g; this.mesh = new THREE.Mesh(g, boltMatL); this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.renderOrder = 6; scene.add(this.mesh);
    this.busy = false; this.from = new V3(); this.to = new V3(); this.paths = []; this.n = 0;
  }
  start(from, to, L, scale, miss) {
    Object.assign(this, { busy: true, L, scale, miss, k: 0, age: 0, fade: -1, flickT: 0, bright: 0.8, col: boltRGB(L) });
    this.from.copy(from); this.to.copy(to); this.FADE = 0.26 + 0.05 * L; this.restrike = L >= 2 ? rand(0.08, 0.14) : -1;
    this.gen(); this.mesh.visible = true;
  }
  // Rayo principal y ramas; se rehace en cada parpadeo
  gen() {
    const len = this.from.distanceTo(this.to), lv = len > 3 ? 6 : len > 0.8 ? 5 : 4;
    const main = jag(this.from, this.to, lv, 0.2), paths = [{ pts: main, w: 1, a: 1, at: 0 }];
    const nb = Math.round((1 + this.L * 0.8 + rand(0, 1.5)) * Math.min(1, 0.4 + len / 2));
    for (let i = 0; i < nb; i++) {
      const j = Math.floor(rand(0.15, 0.8) * (main.length - 1)), s = main[j];
      _zd.subVectors(main[Math.min(main.length - 1, j + 2)], s).normalize().add(rv(0.9)).normalize();
      const e = s.clone().addScaledVector(_zd, len * rand(0.1, 0.28));
      const b = jag(s, e, 3, 0.25); paths.push({ pts: b, w: 0.5, a: 0.7, at: j / (main.length - 1) });
      if (this.L >= 3 && Math.random() < 0.5) { const j2 = Math.floor(b.length / 2), s2 = b[j2]; _zd.subVectors(b[b.length - 1], s2).normalize().add(rv(1)).normalize(); paths.push({ pts: jag(s2, s2.clone().addScaledVector(_zd, len * rand(0.05, 0.14)), 2, 0.3), w: 0.3, a: 0.5, at: paths[paths.length - 1].at }); }
    }
    this.paths = paths;
  }
  // Punto del rayo principal a una fracción t del recorrido
  pointAt(t, out) { const m = this.paths[0].pts, f = clamp(t, 0, 1) * (m.length - 1), i = Math.min(m.length - 2, Math.floor(f)); return out.copy(m[i]).lerp(m[i + 1], f - i); }
  update(dt) {
    this.age += dt;
    if (this.fade >= 0) {
      this.fade += dt; if (this.fade >= this.FADE) { this.end(); return; }
      this.flickT -= dt;
      if (this.flickT <= 0) { this.flickT = LT_FLICK; this.gen(); if (Math.random() < 0.5) fx.sparks(this.pointAt(Math.random(), _zc), 1 + (this.L >> 1), this.col, 1.2, 0.02 * this.scale); }
      if (this.restrike > 0 && this.fade > this.restrike) { this.restrike = -1; this.fade = Math.min(this.fade, 0.04); SND.zap(this.to); } // segundo latigazo
      const f = this.fade / this.FADE; this.bright = Math.pow(1 - f, 1.4) * rand(0.55, 1) * (this.fade < 0.05 ? 1.6 : 1);
    } else { this.bright = rand(0.6, 0.9); this.flickT -= dt; if (this.flickT <= 0) { this.flickT = LT_FLICK; this.gen(); } }
    this.build();
  }
  arrive() { this.k = 1; this.fade = 0; this.flickT = 0; }
  build() {
    const P = this.P, C = this.C, cam = head.p, k = this.k, s = this.scale, L = this.L;
    const wCore = (0.006 + 0.0035 * L) * s, wGlow = wCore * (7 + L), col = this.col, b = this.bright;
    let n = 0;
    const seg = (a, c, w, r, g, bl) => {
      if (n >= LT_SEG) return;
      _zd.subVectors(c, a); _za.addVectors(a, c).multiplyScalar(0.5); _zb.subVectors(cam, _za);
      _zu.crossVectors(_zd, _zb); if (_zu.lengthSq() < 1e-10) return; _zu.normalize().multiplyScalar(w / 2);
      const o = n * 18;
      P[o] = a.x - _zu.x; P[o + 1] = a.y - _zu.y; P[o + 2] = a.z - _zu.z; P[o + 3] = a.x + _zu.x; P[o + 4] = a.y + _zu.y; P[o + 5] = a.z + _zu.z;
      P[o + 6] = c.x + _zu.x; P[o + 7] = c.y + _zu.y; P[o + 8] = c.z + _zu.z; P[o + 9] = a.x - _zu.x; P[o + 10] = a.y - _zu.y; P[o + 11] = a.z - _zu.z;
      P[o + 12] = c.x + _zu.x; P[o + 13] = c.y + _zu.y; P[o + 14] = c.z + _zu.z; P[o + 15] = c.x - _zu.x; P[o + 16] = c.y - _zu.y; P[o + 17] = c.z - _zu.z;
      for (let i = 0; i < 6; i++) { C[o + i * 3] = r; C[o + i * 3 + 1] = g; C[o + i * 3 + 2] = bl; }
      n++;
    };
    for (const pass of [0, 1]) { // halo ancho y tenue, y núcleo casi blanco
      for (const p of this.paths) {
        if (p.at > k) continue;
        const pts = p.pts, last = pts.length - 1, a = p.a * b, w = (pass ? wCore : wGlow) * p.w;
        const r = pass ? (0.55 + col[0] * 0.45) * a : col[0] * a * 0.3, g = pass ? (0.55 + col[1] * 0.45) * a : col[1] * a * 0.3, bl = pass ? (0.55 + col[2] * 0.45) * a : col[2] * a * 0.3;
        for (let i = 0; i < last; i++) {
          if (p === this.paths[0]) { const t0 = i / last, t1 = (i + 1) / last; if (t0 >= k) break; if (t1 > k) { _zc.copy(pts[i]).lerp(pts[i + 1], (k - t0) / (t1 - t0)); seg(pts[i], _zc, w, r, g, bl); break; } }
          seg(pts[i], pts[i + 1], w, r, g, bl);
        }
      }
    }
    this.n = n; this.g.setDrawRange(0, n * 6);
    this.g.attributes.position.needsUpdate = true; this.g.attributes.color.needsUpdate = true;
  }
  end() { this.busy = false; this.mesh.visible = false; this.g.setDrawRange(0, 0); }
}
const BOLTS = [];
function boltStart(from, to, L, scale = 1, miss = false) {
  let b = BOLTS.find(x => !x.busy);
  if (!b) { if (BOLTS.length < 12) { b = new Lightning(); BOLTS.push(b); } else b = BOLTS.reduce((o, x) => x.age > o.age ? x : o); }
  b.start(from, to, L, scale, miss); return b;
}
// Al llegar al blanco: destello, chispas y luz
function boltArrive(b) {
  b.arrive();
  const s = b.scale, L = b.L, c = b.col;
  if (!b.miss) { SND.boltHit(b.to, L); fx.sparks(b.to, 6 + L * 5, c, 2 + L * 0.4, 0.035 * s); fx.glow(b.to, c, (0.3 + 0.12 * L) * s, 0.2); if (L >= 2) fx.electric(b.to, 6 + L * 3); }
  else fx.glow(b.to, c, 0.15 * s, 0.12);
}
function boltsClear() { BOLTS.forEach(b => b.end()); boltLight.intensity = 0; KB.w = 0; keyFlash(); }
// La luz principal se va hacia el rayo durante el destello: las sombras saltan
const KB = { w: 0, saved: false, pos: new V3(), col: new THREE.Color(), I: 1, at: new V3(), c: new THREE.Color(), last: new V3(), lastI: 0 };
function keyFlash() {
  // si el escenario se recolocó entretanto, esa es la nueva posición de reposo
  if (KB.saved && (keyLight.position.distanceToSquared(KB.last) > 1e-8 || keyLight.intensity !== KB.lastI)) KB.saved = false;
  if (KB.w <= 0) { if (KB.saved) { keyLight.position.copy(KB.pos); keyLight.color.copy(KB.col); keyLight.intensity = KB.I; KB.saved = false; } return; }
  if (!KB.saved) { KB.pos.copy(keyLight.position); KB.col.copy(keyLight.color); KB.I = keyLight.intensity; KB.saved = true; }
  const tg = keyLight.target.position, d = KB.pos.distanceTo(tg);
  _za.copy(KB.at); arena.worldToLocal(_za); _za.y += 1.2; _za.sub(tg).normalize().multiplyScalar(d).add(tg);
  keyLight.position.lerpVectors(KB.pos, _za, Math.min(0.9, KB.w));
  keyLight.color.copy(KB.col).lerp(KB.c, KB.w * 0.6); keyLight.intensity = KB.I * (1 + KB.w * 0.9);
  KB.last.copy(keyLight.position); KB.lastI = keyLight.intensity;
}
function updateBolts(dt) {
  let best = null, bw = 0;
  for (const b of BOLTS) if (b.busy) { b.update(dt); const w = b.busy ? b.bright * (1 + b.L * 0.5) * b.scale : 0; if (w > bw) { bw = w; best = b; } }
  if (best) {
    best.pointAt(best.fade >= 0 ? 0.75 : best.k, boltLight.position); boltLight.color.setRGB(best.col[0], best.col[1], best.col[2]);
    boltLight.intensity = (settings.boltLight ? 1 : 0) * bw * 2.6; boltLight.distance = (3 + best.L) * best.scale + 1;
  } else boltLight.intensity = 0;
  // sombras: solo con los destellos (rayo ya llegado), si las sombras están activas
  const fw = settings.boltLight && settings.shadows && best && best.fade >= 0 ? Math.min(1, bw * 0.45) : 0;
  if (fw > KB.w) { KB.w = fw; best.pointAt(0.6, KB.at); KB.c.setRGB(best.col[0], best.col[1], best.col[2]); } else KB.w = Math.max(0, KB.w - dt * 5);
  keyFlash();
}
