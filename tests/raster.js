// Tiny software rasterizer for sanity-checking model shapes (flat shading, z-buffer) → PNG
'use strict';
const zlib = require('zlib');
const THREE = require('./three-mock.js');
const V3 = THREE.Vector3;
function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function collect(root, opts = {}) {
  const tris = []; root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.visible) return; let p = o; while (p) { if (!p.visible) return; p = p.parent; }
    if (!o.geometry || !o.material || !(o.isMesh)) return;
    const m = o.material; if (m.blending === 2 && !opts.additive) return; if (m.opacity === 0) return;
    const g = o.geometry, pos = g.attributes.position; if (!pos) return;
    const colA = g.attributes.color && m.vertexColors ? g.attributes.color : null, mc = m.color || { r: 1, g: 1, b: 1 };
    const basic = m.constructor.name === 'MeshBasicMaterial';
    const idx = g.index ? g.index.array : null, count = idx ? idx.length : pos.count;
    let xforms;
    if (o.isSkinnedMesh) {
      const sk = o.skeleton, si = g.attributes.skinIndex, mats = sk.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, sk.boneInverses[i]));
      xforms = i => mats[si.array[i * 4]];
    } else if (o.isInstancedMesh || o.instanceMatrix) {
      const list = []; for (let k = 0; k < o.count; k++) list.push(new THREE.Matrix4().multiplyMatrices(o.matrixWorld, new THREE.Matrix4().fromArray(o.instanceMatrix.array, k * 16)));
      for (const M of list) push(() => M); return;
    } else xforms = () => o.matrixWorld;
    push(xforms);
    function push(xf) {
      for (let t = 0; t + 2 < count; t += 3) {
        const vs = [], cs = [];
        for (let k = 0; k < 3; k++) { const i = idx ? idx[t + k] : t + k; vs.push(new V3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(xf(i))); cs.push(colA ? [colA.getX(i), colA.getY(i), colA.getZ(i)] : [1, 1, 1]); }
        const c = [0, 1, 2].map(j => (cs[0][j] + cs[1][j] + cs[2][j]) / 3 * [mc.r, mc.g, mc.b][j]);
        tris.push({ v: m.side === 1 ? [vs[0], vs[2], vs[1]] : vs, c, basic, double: m.side === 2 || m.transparent });
      }
    }
  });
  return tris;
}
function render(tris, { eye, target, fov = 40, w = 480, h = 480, bg = [24, 22, 34], light = new V3(-0.4, 0.8, 0.5).normalize() }) {
  const rgb = Buffer.alloc(w * h * 3), zb = new Float32Array(w * h).fill(Infinity);
  for (let i = 0; i < w * h; i++) { rgb[i * 3] = bg[0]; rgb[i * 3 + 1] = bg[1]; rgb[i * 3 + 2] = bg[2]; }
  const fwd = target.clone().sub(eye).normalize(), right = new V3().crossVectors(fwd, new V3(0, 1, 0)).normalize(), up = new V3().crossVectors(right, fwd), f = 1 / Math.tan(fov * Math.PI / 360);
  const proj = v => { const d = v.clone().sub(eye), z = d.dot(fwd); if (z < 0.01) return null; return [w / 2 + (d.dot(right) / z) * f * w / 2, h / 2 - (d.dot(up) / z) * f * w / 2, z]; };
  for (const t of tris) {
    const n = new V3().crossVectors(t.v[1].clone().sub(t.v[0]), t.v[2].clone().sub(t.v[0])); if (n.lengthSq() === 0) continue; n.normalize();
    const toEye = eye.clone().sub(t.v[0]); let facing = n.dot(toEye) > 0; if (!facing && !t.double) continue; if (!facing) n.multiplyScalar(-1);
    const shade = t.basic ? 1 : 0.22 + 0.78 * Math.max(0, n.dot(light));
    const col = t.c.map(x => Math.min(255, Math.pow(Math.max(0, x * shade), 1 / 2.2) * 255));
    const P = t.v.map(proj); if (P.some(p => !p)) continue;
    const minX = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))), maxX = Math.min(w - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
    const minY = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))), maxY = Math.min(h - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
    const area = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]); if (Math.abs(area) < 1e-9) continue;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((P[1][0] - px) * (P[2][1] - py) - (P[2][0] - px) * (P[1][1] - py)) / area, w1 = ((P[2][0] - px) * (P[0][1] - py) - (P[0][0] - px) * (P[2][1] - py)) / area, w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * P[0][2] + w1 * P[1][2] + w2 * P[2][2], k = y * w + x; if (z >= zb[k]) continue; zb[k] = z;
      rgb[k * 3] = col[0]; rgb[k * 3 + 1] = col[1]; rgb[k * 3 + 2] = col[2];
    }
  }
  return { w, h, rgb };
}
function grid(images, cols) { // compose images side by side
  const w = images[0].w, h = images[0].h, rows = Math.ceil(images.length / cols), out = Buffer.alloc(w * cols * h * rows * 3);
  images.forEach((im, i) => { const ox = (i % cols) * w, oy = Math.floor(i / cols) * h; for (let y = 0; y < h; y++) im.rgb.copy(out, ((oy + y) * w * cols + ox) * 3, y * w * 3, (y + 1) * w * 3); });
  return png(w * cols, h * rows, out);
}
module.exports = { collect, render, grid, png };
