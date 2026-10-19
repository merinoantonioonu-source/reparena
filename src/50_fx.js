
/* =================== PARTÍCULAS (instanciadas: 1 llamada de dibujo por sistema) =================== */
const P_VS = `attribute vec3 iPos; attribute vec4 iCol; attribute vec3 iMisc; varying vec2 vUv; varying vec4 vCol;
void main(){
  float s = sin(iMisc.y), c = cos(iMisc.y);
  vec2 q = vec2(position.x*c - position.y*s, position.x*s + position.y*c) * iMisc.x;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0); mv.xy += q;
  gl_Position = projectionMatrix * mv;
  float tx = mod(iMisc.z, 2.0), ty = floor(iMisc.z / 2.0);
  vUv = vec2((position.x + 0.5 + tx) * 0.5, (position.y + 0.5 + (1.0 - ty)) * 0.5);
  vCol = iCol;
}`;
const P_FS = `uniform sampler2D map; varying vec2 vUv; varying vec4 vCol;
void main(){ vec4 t = texture2D(map, vUv); gl_FragColor = vec4(vCol.rgb * t.rgb, vCol.a * t.a); }`;
class PSys {
  constructor(max, blending, order) {
    this.max = max; this.p = [];
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    [this.aPos, this.aCol, this.aMisc].forEach(a => { if (a.setUsage) a.setUsage(THREE.DynamicDrawUsage); });
    g.setAttribute('iPos', this.aPos); g.setAttribute('iCol', this.aCol); g.setAttribute('iMisc', this.aMisc);
    g.instanceCount = 0; this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: { map: { value: TX.atlas } }, vertexShader: P_VS, fragmentShader: P_FS, transparent: true, depthWrite: false, blending }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = order; scene.add(this.mesh);
  }
  add(o) {
    if (this.p.length >= this.max) this.p.splice(0, 1);
    o.t = 0; o.rot = o.rot === undefined ? Math.random() * TAU : o.rot; o.rotV = o.rotV || 0; o.fin = o.fin === undefined ? 0.05 : o.fin;
    o.c1 = o.c1 || o.c0; o.s1 = o.s1 === undefined ? o.s0 : o.s1; o.g = o.g || 0; o.drag = o.drag || 0; o.a = o.a === undefined ? 1 : o.a;
    this.p.push(o); return o;
  }
  update(dt) {
    const P = this.aPos.array, Cc = this.aCol.array, Mi = this.aMisc.array; let n = 0;
    for (let i = 0; i < this.p.length; i++) {
      const o = this.p[i]; o.t += dt / o.life;
      if (o.t >= 1) { this.p[i] = this.p[this.p.length - 1]; this.p.pop(); i--; continue; }
      o.v.y -= o.g * dt; if (o.drag) o.v.multiplyScalar(Math.max(0, 1 - o.drag * dt));
      o.pos.addScaledVector(o.v, dt); if (o.floor && o.pos.y < 0.02) { o.pos.y = 0.02; o.v.y *= -0.3; o.v.x *= 0.6; o.v.z *= 0.6; }
      o.rot += o.rotV * dt;
      const t = o.t, env = t < o.fin ? t / o.fin : 1 - (t - o.fin) / (1 - o.fin);
      P[n * 3] = o.pos.x; P[n * 3 + 1] = o.pos.y; P[n * 3 + 2] = o.pos.z;
      Cc[n * 4] = lerp(o.c0[0], o.c1[0], t); Cc[n * 4 + 1] = lerp(o.c0[1], o.c1[1], t); Cc[n * 4 + 2] = lerp(o.c0[2], o.c1[2], t); Cc[n * 4 + 3] = o.a * env;
      Mi[n * 3] = lerp(o.s0, o.s1, Math.sqrt(t)); Mi[n * 3 + 1] = o.rot; Mi[n * 3 + 2] = o.tile;
      n++;
    }
    this.geo.instanceCount = n;
    if (n) { this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aMisc.needsUpdate = true; }
  }
  clear() { this.p.length = 0; this.geo.instanceCount = 0; }
}
const PNORM = new PSys(500, THREE.NormalBlending, 4);
const PADD = new PSys(900, THREE.AdditiveBlending, 6);
const rv = (s = 1) => new V3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2 * s);
const rUp = (up = 0.6) => new V3(Math.random() - 0.5, Math.random() * up + 0.15, Math.random() - 0.5).normalize();

/* ---------- Anillos de onda expansiva y quemaduras ---------- */
const rings = [], scorches = [];
const ringGeo = new THREE.RingGeometry(0.8, 1, 48);
const scorchGeo = new THREE.PlaneGeometry(1, 1);
function shockRing(pos, size, color) {
  let r = rings.find(x => !x.active);
  if (!r) { if (rings.length >= 6) return; r = { mesh: new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide })) }; r.mesh.rotation.x = -Math.PI / 2; scene.add(r.mesh); rings.push(r); }
  r.active = true; r.t = 0; r.size = size; r.mesh.material.color.setHex(color); r.mesh.position.set(pos.x, Math.max(0.03, pos.y < 0.6 ? pos.y : 0.03), pos.z); r.mesh.visible = true;
}
function scorch(pos, size) {
  if (pos.y > 0.8) return;
  let s = scorches.find(x => !x.active);
  if (!s) { if (scorches.length >= 10) s = scorches.reduce((a, b) => a.t > b.t ? a : b); else { s = { mesh: new THREE.Mesh(scorchGeo, new THREE.MeshBasicMaterial({ map: TX.scorch, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })) }; s.mesh.rotation.x = -Math.PI / 2; scene.add(s.mesh); scorches.push(s); } }
  s.active = true; s.t = 0; s.mesh.position.set(pos.x, 0.004, pos.z); s.mesh.scale.setScalar(size); s.mesh.rotation.z = Math.random() * TAU; s.mesh.visible = true;
}

/* ---------- Restos que caen con física sencilla ---------- */
const debris = [];
function addDebris(obj, v, w, life, smoke) { scene.add(obj); debris.push({ obj, v, w, life, max: life, smoke, smokeT: 0 }); }
function updateDebris(dt) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i]; d.life -= dt;
    d.v.y -= 9.8 * dt; d.obj.position.addScaledVector(d.v, dt);
    d.obj.rotation.x += d.w.x * dt; d.obj.rotation.y += d.w.y * dt; d.obj.rotation.z += d.w.z * dt;
    const floorY = 0.04 * d.obj.scale.x;
    if (d.obj.position.y < floorY && d.life > 0.8) { d.obj.position.y = floorY; d.v.y = Math.abs(d.v.y) * 0.25; d.v.x *= 0.5; d.v.z *= 0.5; d.w.multiplyScalar(0.5); if (Math.abs(d.v.y) < 0.4) d.v.y = 0; }
    if (d.smoke && d.life > d.max * 0.3) { d.smokeT -= dt; if (d.smokeT <= 0) { d.smokeT = 0.07; fx.smoke(d.obj.position.clone(), 0.18, 0.4, 1.2); if (Math.random() < 0.4) fx.flame(d.obj.position.clone(), 0.12); } }
    if (d.life < 0.8) { d.obj.position.y -= dt * 0.25; }
    if (d.life <= 0) { scene.remove(d.obj); debris.splice(i, 1); }
  }
}

/* ---------- Gotas de agua en 3D (las amebas de los Toques al reventar) ---------- */
// Esferas instanciadas que reflejan el entorno; se estiran en la dirección en que vuelan y, al llegar al suelo, salpican
const WDROP = { max: 240, list: [] };
WDROP.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), std({ color: 0x5fd8c8, emissive: 0x06302a, roughness: 0.03, metalness: 0.35, transparent: true, opacity: 0.6, envMapIntensity: 3, depthWrite: false }), WDROP.max);
WDROP.mesh.frustumCulled = false; WDROP.mesh.count = 0; if (WDROP.mesh.instanceMatrix.setUsage) WDROP.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(WDROP.mesh);
const _wdq = new Q4(), _wdd = new V3(), _wds = new V3(), _wdm = new THREE.Matrix4();
function waterDrop(pos, v, size, life = rand(0.9, 1.5)) { if (WDROP.list.length >= WDROP.max) WDROP.list.shift(); WDROP.list.push({ p: pos.clone(), v, s: size, life, t: 0 }); }
function updateWater(dt) {
  const L = WDROP.list; let n = 0;
  for (let i = 0; i < L.length; i++) {
    const d = L[i]; d.t += dt; d.v.y -= 9.8 * dt; d.v.multiplyScalar(Math.max(0, 1 - 0.5 * dt)); d.p.addScaledVector(d.v, dt);
    if (d.p.y < 0.01 || d.t >= d.life) {
      if (d.p.y < 0.01) { d.p.y = 0.015; fx.droplets(d.p, 2, [0.7, 1, 0.95], 0.5, d.s * 0.8); }
      L[i] = L[L.length - 1]; L.pop(); i--; continue;
    }
    const sp = d.v.length(), k = 1 + Math.min(1.6, sp * 0.2), f = Math.min(1, (d.life - d.t) / 0.2);
    _wdq.setFromUnitVectors(_up, sp > 1e-3 ? _wdd.copy(d.v).divideScalar(sp) : _up);
    _wdm.compose(d.p, _wdq, _wds.set(d.s * f / Math.sqrt(k), d.s * f * k, d.s * f / Math.sqrt(k))); WDROP.mesh.setMatrixAt(n++, _wdm);
  }
  WDROP.mesh.count = n; if (n) WDROP.mesh.instanceMatrix.needsUpdate = true;
}

/* ---------- Números flotantes ---------- */
const popups = [];
function popup(text, color, pos) {
  const c = mkCanvas(384, 128), x = c.getContext('2d');
  x.font = `76px ${FD}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 12; x.strokeStyle = 'rgba(10,8,20,.85)'; x.strokeText(text, 192, 68); x.fillStyle = color; x.fillText(text, 192, 68);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, toneMapped: false })); s.renderOrder = 25;
  const d = Math.max(0.5, pos.distanceTo(head.p)), k = Math.min(0.9, 0.07 * d); s.scale.set(k * 3, k, 1); s.position.copy(pos);
  scene.add(s); popups.push({ s, v: 0.25 * Math.min(4, d), life: 0.9 });
  if (popups.length > 12) killPopup(0);
}
function killPopup(i) { const p = popups[i]; scene.remove(p.s); p.s.material.map.dispose(); p.s.material.dispose(); popups.splice(i, 1); }

/* ---------- API de efectos ---------- */
const fx = {
  glow(pos, color, size, life = 0.15, a = 1) { PADD.add({ pos: pos.clone(), v: new V3(), life, c0: color, s0: size, s1: size * 1.4, tile: 0, a, fin: 0.01 }); },
  flame(pos, s = 0.2) { PADD.add({ pos: pos.clone().add(rv(s * 0.3)), v: new V3(rand(-0.1, 0.1), rand(0.5, 1.0), rand(-0.1, 0.1)), life: rand(0.35, 0.6), c0: [1, 0.78, 0.4], c1: [0.7, 0.12, 0.02], s0: s * rand(0.7, 1.2), s1: s * 0.25, tile: 2, rotV: rand(-2, 2), fin: 0.1 }); },
  fire(pos, s) { fx.flame(pos, s); },
  smoke(pos, size, rise = 0.5, life = 2.5, dark = 0.16) { PNORM.add({ pos: pos.clone(), v: new V3(rand(-0.15, 0.15), rise * rand(0.7, 1.2), rand(-0.15, 0.15)), life: life * rand(0.8, 1.2), c0: [dark, dark * 0.92, dark * 0.88], c1: [dark * 0.55, dark * 0.5, dark * 0.5], a: 0.6, s0: size, s1: size * 3, tile: 1, rotV: rand(-0.4, 0.4), fin: 0.15, drag: 0.3 }); },
  bigSmoke(pos) { PNORM.add({ pos: pos.clone().add(rv(1.5)), v: new V3(rand(0.2, 0.6), rand(1.2, 2.2), rand(-0.3, 0.3)), life: rand(10, 16), c0: [0.12, 0.09, 0.08], c1: [0.06, 0.05, 0.05], a: 0.5, s0: 5, s1: 18, tile: 1, rotV: rand(-0.1, 0.1), fin: 0.1 }); },
  steam(pos, side) { PNORM.add({ pos: pos.clone(), v: new V3(side * rand(0.8, 1.8), rand(0.2, 0.8), rand(0.1, 0.6)), life: rand(1.0, 1.6), c0: [0.75, 0.76, 0.8], c1: [0.5, 0.5, 0.55], a: 0.4, s0: 0.25, s1: 1.4, tile: 1, rotV: rand(-1, 1), fin: 0.1, drag: 1.5 }); },
  sparks(pos, n, color = [1, 0.6, 0.2], speed = 3, size = 0.05) { for (let i = 0; i < n; i++) PADD.add({ pos: pos.clone(), v: rUp(1.2).multiplyScalar(speed * rand(0.3, 1.2)), life: rand(0.3, 0.9), c0: [1, 0.95, 0.8], c1: color, s0: size * rand(0.6, 1.2), s1: size * 0.3, tile: 3, g: 6, floor: true, fin: 0.01 }); },
  dust(pos, n, size = 0.25) { for (let i = 0; i < n; i++) PNORM.add({ pos: pos.clone().add(new V3(rand(-0.1, 0.1), 0.03, rand(-0.1, 0.1))), v: new V3(rand(-0.6, 0.6), rand(0.05, 0.3), rand(-0.6, 0.6)), life: rand(0.8, 1.5), c0: [0.32, 0.29, 0.26], c1: [0.2, 0.19, 0.18], a: 0.35, s0: size * 0.5, s1: size * 1.6, tile: 1, drag: 2.5, fin: 0.1 }); },
  droplets(pos, n, color = [0.4, 1, 0.85], speed = 1.5, size = 0.03) { for (let i = 0; i < n; i++) PNORM.add({ pos: pos.clone(), v: rUp(1.4).multiplyScalar(speed * rand(0.3, 1.1)), life: rand(0.5, 1.0), c0: color, c1: [color[0] * 0.5, color[1] * 0.5, color[2] * 0.5], a: 0.85, s0: size * rand(0.6, 1.2), s1: size * 0.5, tile: 0, g: 6, floor: true, fin: 0.01 }); },
  ichor(pos, n, s = 1) { for (let i = 0; i < n; i++) PNORM.add({ pos: pos.clone(), v: rUp(1).multiplyScalar(rand(0.3, 1.2) * s), life: rand(0.5, 1.0), c0: [0.32, 0.36, 0.06], c1: [0.12, 0.14, 0.02], a: 0.9, s0: 0.02 * s, s1: 0.035 * s, tile: 0, g: 5, floor: true, fin: 0.01 }); },
  // Un aro de agua que revienta: el agua sale despedida hacia fuera desde todo el borde, con gotas grandes, rocío y un destello
  waterBurst(pos, n, rad, color) {
    const u = _wdd.set(0, 1, 0); if (Math.abs(n.dot(u)) > 0.9) u.set(1, 0, 0); u.addScaledVector(n, -u.dot(n)).normalize();
    const w = new V3().crossVectors(n, u), r = new V3(), pale = [lerp(color[0], 1, 0.5), lerp(color[1], 1, 0.5), lerp(color[2], 1, 0.5)];
    for (let i = 0; i < 44; i++) {
      const a = i / 44 * TAU + rand(-0.06, 0.06); r.copy(u).multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a));
      const p = pos.clone().addScaledVector(r, rad * rand(0.85, 1.1)).addScaledVector(n, rand(-0.02, 0.02));
      waterDrop(p, r.clone().multiplyScalar(rand(0.7, 2.1)).addScaledVector(n, rand(-0.5, 0.9)).add(new V3(0, rand(0.3, 1.3), 0)), rand(0.006, i % 4 ? 0.013 : 0.024));
    }
    for (let i = 0; i < 26; i++) { const a = rand(0, TAU); r.copy(u).multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a)); PNORM.add({ pos: pos.clone().addScaledVector(r, rad), v: r.clone().multiplyScalar(rand(0.6, 2.4)).add(new V3(0, rand(0, 1.2), 0)), life: rand(0.35, 0.8), c0: pale, c1: [0.6, 0.9, 1], a: 0.8, s0: rand(0.01, 0.025), s1: 0.006, tile: 0, g: 6, floor: true, fin: 0.01 }); }
    for (let i = 0; i < 8; i++) PNORM.add({ pos: pos.clone().add(rv(rad * 0.6)), v: rv(0.25), life: rand(0.5, 0.9), c0: [0.85, 0.95, 1], c1: [0.7, 0.85, 0.9], a: 0.25, s0: rad * 0.6, s1: rad * 1.8, tile: 1, drag: 2, fin: 0.05 }); // rocío
    fx.glow(pos, pale, rad * 3, 0.12);
  },
  trail(pos, color, size, life = 0.25) { PADD.add({ pos: pos.clone(), v: rv(0.05), life, c0: color, c1: [color[0] * 0.3, color[1] * 0.3, color[2] * 0.3], s0: size, s1: size * 0.2, tile: 0, fin: 0.01 }); },
  muzzle(pos, color) { fx.glow(pos, color, 0.25, 0.1); fx.sparks(pos, 6, color, 1.5, 0.025); },
  electric(pos, n = 14) { for (let i = 0; i < n; i++) PADD.add({ pos: pos.clone(), v: rv(1).multiplyScalar(rand(1, 3)), life: rand(0.1, 0.35), c0: [0.9, 0.9, 1], c1: [1, 0.25, 0.15], s0: 0.04, s1: 0.01, tile: 3, fin: 0.01 }); fx.glow(pos, [1, 0.4, 0.3], 0.5, 0.12); },
  explosion(pos, size = 1, big = false) {
    fx.glow(pos, [1, 0.85, 0.6], 2.2 * size, 0.14);
    for (let i = 0; i < (big ? 26 : 14); i++) PADD.add({ pos: pos.clone().add(rv(0.15 * size)), v: rv(1).multiplyScalar(2.2 * size), life: rand(0.45, 0.95), c0: [1, 0.85, 0.45], c1: [0.55, 0.08, 0.01], s0: 0.35 * size, s1: 1.25 * size, tile: 2, rotV: rand(-3, 3), drag: 3, fin: 0.04 });
    for (let i = 0; i < (big ? 22 : 12); i++) PNORM.add({ pos: pos.clone().add(rv(0.25 * size)), v: rv(1).multiplyScalar(1.2 * size).add(new V3(0, 0.5 * size, 0)), life: rand(1.8, 3.2), c0: [0.13, 0.11, 0.1], c1: [0.07, 0.065, 0.06], a: 0.75, s0: 0.5 * size, s1: 2.3 * size, tile: 1, rotV: rand(-0.6, 0.6), drag: 1.6, fin: 0.12 });
    fx.sparks(pos, big ? 46 : 26, [1, 0.45, 0.1], 6 * Math.sqrt(size), 0.06 * Math.sqrt(size));
    shockRing(pos, 3.5 * size, 0xff8a3a); scorch(pos, 1.6 * size);
    flashLight.color.setHex(0xffa050); flashLight.position.copy(pos); flashLight.intensity = big ? 9 : 5; flashLight.distance = 10 * size + 4;
  }
};
// Esquirlas de neón (humanoides que estallan): triángulos que salen disparados girando, frenan y se apagan
const SHARDS = { pool: [], live: [] };
(() => {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.6, 0, -0.5, -0.4, 0.1, 0.55, -0.35, -0.1], 3)); g.computeVertexNormals();
  for (let i = 0; i < 220; i++) { const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, toneMapped: false, depthWrite: false })); m.visible = false; scene.add(m); SHARDS.pool.push(m); }
})();
// n esquirlas desde pos (o repartidas por pts), con los colores de cols (hex) y la velocidad dada
function shardBurst(pos, n, cols, speed = 3, pts = null) {
  for (let i = 0; i < n; i++) {
    const m = SHARDS.pool.pop() || (SHARDS.live.length ? SHARDS.live.shift().m : null); if (!m) return;
    m.position.copy(pts ? pts[i % pts.length] : pos).add(new V3(rand(-0.06, 0.06), rand(-0.06, 0.06), rand(-0.06, 0.06)));
    m.rotation.set(rand(0, TAU), rand(0, TAU), rand(0, TAU)); const s = rand(0.04, 0.12); m.scale.set(s, s, s);
    m.material.color.setHex(cols[i % cols.length]); m.material.opacity = 1; m.visible = true;
    const v = rUp(0.6).multiplyScalar(speed * rand(0.4, 1.2)); if (pts) { tmpA.subVectors(m.position, pos); tmpA.y = 0; v.add(tmpA.normalize().multiplyScalar(speed * 0.5)); } // desde el centro hacia fuera
    SHARDS.live.push({ m, v, w: new V3(rand(-14, 14), rand(-14, 14), rand(-14, 14)), life: rand(0.7, 1.3), max: 1, s });
  }
}
function updateShards(dt) {
  for (let i = SHARDS.live.length - 1; i >= 0; i--) {
    const d = SHARDS.live[i]; d.life -= dt; d.v.multiplyScalar(Math.max(0, 1 - dt * 2.2)); d.v.y -= 2.5 * dt;
    d.m.position.addScaledVector(d.v, dt); d.m.rotation.x += d.w.x * dt; d.m.rotation.y += d.w.y * dt; d.m.rotation.z += d.w.z * dt;
    const k = clamp(d.life / 0.5, 0, 1); d.m.material.opacity = k; d.m.scale.setScalar(d.s * (0.4 + 0.6 * k));
    if (d.life <= 0) { d.m.visible = false; SHARDS.pool.push(d.m); SHARDS.live.splice(i, 1); }
  }
}
function updateFX(dt) {
  PNORM.update(dt); PADD.update(dt); updateDebris(dt); updateWater(dt); updateShards(dt);
  flashLight.intensity = Math.max(0, flashLight.intensity - dt * 22);
  for (const r of rings) if (r.active) { r.t += dt / 0.45; const s = 0.2 + r.size * smooth(Math.min(1, r.t)); r.mesh.scale.set(s, s, s); r.mesh.material.opacity = Math.max(0, 1 - r.t) * 0.8; if (r.t >= 1) { r.active = false; r.mesh.visible = false; } }
  for (const s of scorches) if (s.active) { s.t += dt; s.mesh.material.opacity = Math.min(1, Math.max(0, (12 - s.t) / 4)) * 0.9; if (s.t > 12) { s.active = false; s.mesh.visible = false; } }
  for (let i = popups.length - 1; i >= 0; i--) { const p = popups[i]; p.life -= dt; p.s.position.y += p.v * dt; p.s.material.opacity = Math.min(1, p.life * 2.5); if (p.life <= 0) killPopup(i); }
}
function clearFX() {
  PNORM.clear(); PADD.clear(); WDROP.list.length = 0; WDROP.mesh.count = 0;
  while (debris.length) { scene.remove(debris.pop().obj); }
  while (SHARDS.live.length) { const d = SHARDS.live.pop(); d.m.visible = false; SHARDS.pool.push(d.m); }
  while (popups.length) killPopup(popups.length - 1);
  rings.forEach(r => { r.active = false; r.mesh.visible = false; });
}
