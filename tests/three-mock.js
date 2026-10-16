// Minimal functional THREE subset for headless logic testing (real math, no rendering)
'use strict';
class Vector2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } set(x, y) { this.x = x; this.y = y; return this; } }
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  setScalar(s) { this.x = this.y = this.z = s; return this; }
  get isVector3() { return true; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
  addVectors(a, b) { this.x = a.x + b.x; this.y = a.y + b.y; this.z = a.z + b.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  divideScalar(s) { return this.multiplyScalar(1 / s); }
  length() { return Math.hypot(this.x, this.y, this.z); }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  normalize() { const l = this.length() || 1; return this.divideScalar(l); }
  negate() { this.x = -this.x; this.y = -this.y; this.z = -this.z; return this; }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  distanceToSquared(v) { const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z; return dx * dx + dy * dy + dz * dz; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  cross(v) { return this.crossVectors(this.clone(), v); }
  crossVectors(a, b) { const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x; return this.set(x, y, z); }
  lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
  lerpVectors(a, b, t) { return this.copy(a).lerp(b, t); }
  angleTo(v) { const d = Math.sqrt(this.lengthSq() * v.lengthSq()); if (!d) return Math.PI / 2; return Math.acos(Math.max(-1, Math.min(1, this.dot(v) / d))); }
  applyQuaternion(q) { const x = this.x, y = this.y, z = this.z, qx = q.x, qy = q.y, qz = q.z, qw = q.w; const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z; this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy; this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz; this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx; return this; }
  applyAxisAngle(axis, a) { return this.applyQuaternion(new Quaternion().setFromAxisAngle(axis, a)); }
  applyMatrix4(m) { const e = m.elements, x = this.x, y = this.y, z = this.z, w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15] || 1); this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w; this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w; this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w; return this; }
  transformDirection(m) { const e = m.elements, x = this.x, y = this.y, z = this.z; this.x = e[0] * x + e[4] * y + e[8] * z; this.y = e[1] * x + e[5] * y + e[9] * z; this.z = e[2] * x + e[6] * y + e[10] * z; return this.normalize(); }
  setFromMatrixPosition(m) { const e = m.elements; return this.set(e[12], e[13], e[14]); }
}
class Euler {
  constructor(x = 0, y = 0, z = 0, order = 'XYZ') { this._x = x; this._y = y; this._z = z; this._order = order; this._cb = () => {}; }
  get x() { return this._x; } set x(v) { this._x = v; this._cb(); }
  get y() { return this._y; } set y(v) { this._y = v; this._cb(); }
  get z() { return this._z; } set z(v) { this._z = v; this._cb(); }
  get order() { return this._order; } set order(v) { this._order = v; this._cb(); }
  set(x, y, z, o) { this._x = x; this._y = y; this._z = z; if (o) this._order = o; this._cb(); return this; }
  copy(e) { this._x = e._x; this._y = e._y; this._z = e._z; this._order = e._order; this._cb(); return this; }
  clone() { return new Euler(this._x, this._y, this._z, this._order); }
  setFromQuaternion(q) { // approximate (XYZ/YXZ) — good enough for tests
    const m = new Matrix4().makeRotationFromQuaternion(q).elements, m11 = m[0], m12 = m[4], m13 = m[8], m22 = m[5], m23 = m[9], m32 = m[6], m33 = m[10], m21 = m[1], m31 = m[2];
    if (this._order === 'YXZ') { this._x = Math.asin(-Math.max(-1, Math.min(1, m23))); this._y = Math.atan2(m13, m33); this._z = Math.atan2(m21, m22); }
    else { this._y = Math.asin(Math.max(-1, Math.min(1, m13))); this._x = Math.atan2(-m23, m33); this._z = Math.atan2(-m12, m11); }
    return this;
  }
}
class Quaternion {
  constructor(x = 0, y = 0, z = 0, w = 1) { this._x = x; this._y = y; this._z = z; this._w = w; this._cb = () => {}; }
  get x() { return this._x; } set x(v) { this._x = v; this._cb(); }
  get y() { return this._y; } set y(v) { this._y = v; this._cb(); }
  get z() { return this._z; } set z(v) { this._z = v; this._cb(); }
  get w() { return this._w; } set w(v) { this._w = v; this._cb(); }
  set(x, y, z, w) { this._x = x; this._y = y; this._z = z; this._w = w; this._cb(); return this; }
  copy(q) { return this.set(q.x, q.y, q.z, q.w); }
  clone() { return new Quaternion(this._x, this._y, this._z, this._w); }
  setFromAxisAngle(a, ang) { const s = Math.sin(ang / 2); return this.set(a.x * s, a.y * s, a.z * s, Math.cos(ang / 2)); }
  setFromEuler(e, update) {
    const c1 = Math.cos(e._x / 2), c2 = Math.cos(e._y / 2), c3 = Math.cos(e._z / 2), s1 = Math.sin(e._x / 2), s2 = Math.sin(e._y / 2), s3 = Math.sin(e._z / 2);
    let x, y, z, w;
    if (e._order === 'YXZ') { x = s1 * c2 * c3 + c1 * s2 * s3; y = c1 * s2 * c3 - s1 * c2 * s3; z = c1 * c2 * s3 - s1 * s2 * c3; w = c1 * c2 * c3 + s1 * s2 * s3; }
    else { x = s1 * c2 * c3 + c1 * s2 * s3; y = c1 * s2 * c3 - s1 * c2 * s3; z = c1 * c2 * s3 + s1 * s2 * c3; w = c1 * c2 * c3 - s1 * s2 * s3; }
    this._x = x; this._y = y; this._z = z; this._w = w; if (update !== false) this._cb(); return this;
  }
  setFromUnitVectors(a, b) { let r = a.dot(b) + 1; let x, y, z, w; if (r < 1e-6) { r = 0; if (Math.abs(a.x) > Math.abs(a.z)) { x = -a.y; y = a.x; z = 0; w = r; } else { x = 0; y = -a.z; z = a.y; w = r; } } else { x = a.y * b.z - a.z * b.y; y = a.z * b.x - a.x * b.z; z = a.x * b.y - a.y * b.x; w = r; } const l = Math.hypot(x, y, z, w); return this.set(x / l, y / l, z / l, w / l); }
  multiply(q) { return this.multiplyQuaternions(this, q); }
  premultiply(q) { return this.multiplyQuaternions(q, this); }
  multiplyQuaternions(a, b) { const qax = a._x, qay = a._y, qaz = a._z, qaw = a._w, qbx = b._x, qby = b._y, qbz = b._z, qbw = b._w; return this.set(qax * qbw + qaw * qbx + qay * qbz - qaz * qby, qay * qbw + qaw * qby + qaz * qbx - qax * qbz, qaz * qbw + qaw * qbz + qax * qby - qay * qbx, qaw * qbw - qax * qbx - qay * qby - qaz * qbz); }
  slerp(q, t) { // nlerp approximation
    let d = this._x * q._x + this._y * q._y + this._z * q._z + this._w * q._w, s = d < 0 ? -1 : 1;
    const x = this._x + (q._x * s - this._x) * t, y = this._y + (q._y * s - this._y) * t, z = this._z + (q._z * s - this._z) * t, w = this._w + (q._w * s - this._w) * t, l = Math.hypot(x, y, z, w) || 1; return this.set(x / l, y / l, z / l, w / l);
  }
  invert() { return this.set(-this._x, -this._y, -this._z, this._w); }
}
class Matrix4 {
  constructor() { this.elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
  identity() { this.elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; return this; }
  copy(m) { this.elements = m.elements.slice(); return this; }
  clone() { return new Matrix4().copy(this); }
  fromArray(a, o = 0) { for (let i = 0; i < 16; i++) this.elements[i] = a[i + o]; return this; }
  makeScale(x, y, z) { this.identity(); this.elements[0] = x; this.elements[5] = y; this.elements[10] = z; return this; }
  makeRotationFromQuaternion(q) { return this.compose(new Vector3(), q, new Vector3(1, 1, 1)); }
  makeBasis(x, y, z) { this.identity(); const te = this.elements; te[0] = x.x; te[1] = x.y; te[2] = x.z; te[4] = y.x; te[5] = y.y; te[6] = y.z; te[8] = z.x; te[9] = z.y; te[10] = z.z; return this; }
  compose(p, q, s) {
    const te = this.elements, x = q.x, y = q.y, z = q.z, w = q.w, x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2, sx = s.x, sy = s.y, sz = s.z;
    te[0] = (1 - (yy + zz)) * sx; te[1] = (xy + wz) * sx; te[2] = (xz - wy) * sx; te[3] = 0; te[4] = (xy - wz) * sy; te[5] = (1 - (xx + zz)) * sy; te[6] = (yz + wx) * sy; te[7] = 0; te[8] = (xz + wy) * sz; te[9] = (yz - wx) * sz; te[10] = (1 - (xx + yy)) * sz; te[11] = 0; te[12] = p.x; te[13] = p.y; te[14] = p.z; te[15] = 1; return this;
  }
  decompose(p, q, s) {
    const te = this.elements; let sx = Math.hypot(te[0], te[1], te[2]); const sy = Math.hypot(te[4], te[5], te[6]), sz = Math.hypot(te[8], te[9], te[10]);
    p.x = te[12]; p.y = te[13]; p.z = te[14];
    const m11 = te[0] / sx, m12 = te[4] / sy, m13 = te[8] / sz, m21 = te[1] / sx, m22 = te[5] / sy, m23 = te[9] / sz, m31 = te[2] / sx, m32 = te[6] / sy, m33 = te[10] / sz, tr = m11 + m22 + m33;
    let x, y, z, w;
    if (tr > 0) { const S = 0.5 / Math.sqrt(tr + 1); w = 0.25 / S; x = (m32 - m23) * S; y = (m13 - m31) * S; z = (m21 - m12) * S; }
    else if (m11 > m22 && m11 > m33) { const S = 2 * Math.sqrt(1 + m11 - m22 - m33); w = (m32 - m23) / S; x = 0.25 * S; y = (m12 + m21) / S; z = (m13 + m31) / S; }
    else if (m22 > m33) { const S = 2 * Math.sqrt(1 + m22 - m11 - m33); w = (m13 - m31) / S; x = (m12 + m21) / S; y = 0.25 * S; z = (m23 + m32) / S; }
    else { const S = 2 * Math.sqrt(1 + m33 - m11 - m22); w = (m21 - m12) / S; x = (m13 + m31) / S; y = (m23 + m32) / S; z = 0.25 * S; }
    q.set(x, y, z, w); s.x = sx; s.y = sy; s.z = sz; return this;
  }
  multiplyMatrices(a, b) {
    const ae = a.elements, be = b.elements, te = new Array(16);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { let v = 0; for (let k = 0; k < 4; k++) v += ae[k * 4 + r] * be[c * 4 + k]; te[c * 4 + r] = v; }
    this.elements = te; return this;
  }
  multiply(m) { return this.multiplyMatrices(this, m); }
  premultiply(m) { return this.multiplyMatrices(m, this); }
  invert() {
    const m = this.elements, inv = new Array(16);
    inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
    inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
    inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
    inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
    inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
    inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
    inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
    inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
    inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
    inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
    inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
    inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
    inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
    inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
    inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
    inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
    let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12]; if (!det) { this.identity(); return this; } det = 1 / det;
    this.elements = inv.map(v => v * det); return this;
  }
  lookAt(eye, target, up) { // rotation part only
    const z = new Vector3().subVectors(eye, target); if (z.lengthSq() === 0) z.z = 1; z.normalize();
    let x = new Vector3().crossVectors(up, z); if (x.lengthSq() === 0) { z.z += 0.0001; z.normalize(); x.crossVectors(up, z); } x.normalize(); const y = new Vector3().crossVectors(z, x);
    const te = this.elements; te[0] = x.x; te[4] = y.x; te[8] = z.x; te[1] = x.y; te[5] = y.y; te[9] = z.y; te[2] = x.z; te[6] = y.z; te[10] = z.z; return this;
  }
}
class Color {
  constructor(r = 1, g, b) { if (g === undefined) this.setHex(typeof r === 'number' ? r : 0xffffff); else { this.r = r; this.g = g; this.b = b; } }
  setHex(h) { h = Math.floor(h); this.r = (h >> 16 & 255) / 255; this.g = (h >> 8 & 255) / 255; this.b = (h & 255) / 255; return this; }
  setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
  setScalar(s) { this.r = this.g = this.b = s; return this; }
  copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
  clone() { return new Color(this.r, this.g, this.b); }
  lerp(c, t) { this.r += (c.r - this.r) * t; this.g += (c.g - this.g) * t; this.b += (c.b - this.b) * t; return this; }
}
let _id = 0;
class Object3D {
  constructor() {
    this.id = ++_id; this.name = ''; this.parent = null; this.children = []; this.up = new Vector3(0, 1, 0);
    this.position = new Vector3(); this.rotation = new Euler(); this.quaternion = new Quaternion(); this.scale = new Vector3(1, 1, 1);
    this.rotation._cb = () => this.quaternion.setFromEuler(this.rotation, false);
    this.quaternion._cb = () => this.rotation.setFromQuaternion(this.quaternion);
    this.matrix = new Matrix4(); this.matrixWorld = new Matrix4(); this.visible = true; this.castShadow = false; this.receiveShadow = false; this.renderOrder = 0; this.frustumCulled = true; this.userData = {};
  }
  add(...objs) { for (const o of objs) { if (o.parent) o.parent.remove(o); o.parent = this; this.children.push(o); } return this; }
  remove(o) { const i = this.children.indexOf(o); if (i >= 0) { this.children.splice(i, 1); o.parent = null; } return this; }
  attach(o) { this.updateMatrixWorld(true); const inv = this.matrixWorld.clone().invert(); o.updateMatrixWorld(true); const m = new Matrix4().multiplyMatrices(inv, o.matrixWorld); if (o.parent) o.parent.remove(o); m.decompose(o.position, o.quaternion, o.scale); this.add(o); return this; }
  traverse(fn) { fn(this); for (const c of this.children.slice()) c.traverse(fn); }
  updateMatrix() { this.matrix.compose(this.position, this.quaternion, this.scale); }
  updateMatrixWorld(force) { this.updateMatrix(); if (this.parent) this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix); else this.matrixWorld.copy(this.matrix); for (const c of this.children) c.updateMatrixWorld(force); }
  updateWorldMatrix(parents, children) { if (parents && this.parent) this.parent.updateWorldMatrix(true, false); this.updateMatrix(); if (this.parent) this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix); else this.matrixWorld.copy(this.matrix); if (children) for (const c of this.children) c.updateWorldMatrix(false, true); }
  localToWorld(v) { this.updateWorldMatrix(true, false); return v.applyMatrix4(this.matrixWorld); }
  worldToLocal(v) { this.updateWorldMatrix(true, false); return v.applyMatrix4(this.matrixWorld.clone().invert()); }
  getWorldPosition(t) { this.updateWorldMatrix(true, false); return t.setFromMatrixPosition(this.matrixWorld); }
  getWorldDirection(t) { this.updateWorldMatrix(true, false); const e = this.matrixWorld.elements; return t.set(e[8], e[9], e[10]).normalize(); }
  lookAt(x, y, z) { const target = x.isVector3 || x instanceof Vector3 ? x : new Vector3(x, y, z); this.updateWorldMatrix(true, false); const pos = new Vector3().setFromMatrixPosition(this.matrixWorld); const m = new Matrix4(); if (this.isCamera) m.lookAt(pos, target, this.up); else m.lookAt(target, pos, this.up); const q = new Quaternion(); m.decompose(new Vector3(), q, new Vector3()); this.quaternion.copy(q); }
  rotateY(a) { this.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), a)); return this; }
  rotateZ(a) { this.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), a)); return this; }
  rotateX(a) { this.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), a)); return this; }
  clone(recursive = true) { const o = new this.constructor(this.geometry, this.material); o.position.copy(this.position); o.quaternion.copy(this.quaternion); o.scale.copy(this.scale); o.visible = this.visible; o.castShadow = this.castShadow; if (recursive) for (const c of this.children) o.add(c.clone()); return o; }
}
class Group extends Object3D {}
class Scene extends Object3D { constructor() { super(); this.fog = null; this.environment = null; this.background = null; } }
class Bone extends Object3D { constructor() { super(); this.isBone = true; } }
class Mesh extends Object3D { constructor(geometry = new BufferGeometry(), material = new Material()) { super(); this.geometry = geometry; this.material = material; this.isMesh = true; } }
class SkinnedMesh extends Mesh { constructor(g, m) { super(g, m); this.isSkinnedMesh = true; this.bindMatrix = new Matrix4(); this.bindMatrixInverse = new Matrix4(); } bind(skel, m) { if (!m) throw new Error('bind without matrix'); this.skeleton = skel; this.bindMatrix.copy(m); this.bindMatrixInverse.copy(m).invert(); if (!this.material.skinning) throw new Error('skinned mesh material without skinning:true'); } }
class Skeleton { constructor(bones = [], inv = []) { this.bones = bones; this.boneInverses = inv; if (inv.length && inv.length !== bones.length) throw new Error('skeleton inverse mismatch'); } dispose() {} }
class InstancedMesh extends Mesh { constructor(g, m, n) { super(g, m); this.count = n; this.instanceMatrix = new InstancedBufferAttribute(new Float32Array(n * 16), 16); } setMatrixAt(i, m) { if (i >= this.instanceMatrix.count) throw new Error('instance index out of range ' + i); for (let k = 0; k < 16; k++) this.instanceMatrix.array[i * 16 + k] = m.elements[k]; } }
class Sprite extends Object3D { constructor(m) { super(); this.material = m || new SpriteMaterial(); this.geometry = new BufferGeometry(); } }
class Line extends Object3D { constructor(g, m) { super(); this.geometry = g; this.material = m; } }
class LineSegments extends Line {}
class Points extends Object3D { constructor(g, m) { super(); this.geometry = g; this.material = m; } }
class Camera extends Object3D { constructor() { super(); this.isCamera = true; this.projectionMatrix = new Matrix4(); } }
class PerspectiveCamera extends Camera { constructor(fov, aspect, near, far) { super(); Object.assign(this, { fov, aspect, near, far }); } updateProjectionMatrix() {} }
class OrthographicCamera extends Camera { constructor() { super(); this.left = -1; this.right = 1; this.top = 1; this.bottom = -1; } updateProjectionMatrix() {} }
class Light extends Object3D { constructor(color, intensity = 1) { super(); this.color = new Color(color); this.intensity = intensity; } }
class DirectionalLight extends Light { constructor(c, i) { super(c, i); this.target = new Object3D(); this.shadow = { mapSize: new Vector2(), camera: new OrthographicCamera(), bias: 0, normalBias: 0 }; } }
class PointLight extends Light { constructor(c, i, d, decay) { super(c, i); this.distance = d; this.decay = decay; } }
class HemisphereLight extends Light { constructor(a, b, i) { super(a, i); this.groundColor = new Color(b); } }
class Fog { constructor(c, n, f) { this.color = new Color(c); } }
class FogExp2 { constructor(c, d) { this.color = new Color(c); this.density = d; } }
// ---------- geometry ----------
class BufferAttribute {
  constructor(array, itemSize, normalized = false) { this.array = array; this.itemSize = itemSize; this.normalized = normalized; this.needsUpdate = false; if (!(array && array.length !== undefined)) throw new Error('bad attribute array'); }
  get count() { return this.array.length / this.itemSize; }
  getX(i) { return this.array[i * this.itemSize]; } getY(i) { return this.array[i * this.itemSize + 1]; } getZ(i) { return this.array[i * this.itemSize + 2]; }
  setXY(i, x, y) { this.array[i * this.itemSize] = x; this.array[i * this.itemSize + 1] = y; return this; }
  setXYZ(i, x, y, z) { this.array[i * this.itemSize] = x; this.array[i * this.itemSize + 1] = y; this.array[i * this.itemSize + 2] = z; return this; }
  setUsage() { return this; }
  clone() { return new this.constructor(this.array.slice(), this.itemSize, this.normalized); }
}
class Float32BufferAttribute extends BufferAttribute { constructor(a, s, n) { super(a instanceof Float32Array ? a : new Float32Array(a), s, n); } }
class Uint16BufferAttribute extends BufferAttribute { constructor(a, s, n) { super(a instanceof Uint16Array ? a : new Uint16Array(a), s, n); } }
class InstancedBufferAttribute extends BufferAttribute {}
class BufferGeometry {
  constructor() { this.attributes = {}; this.index = null; this.isBufferGeometry = true; this.groups = []; }
  setDrawRange(start, count) { this.drawRange = { start, count }; }
  setAttribute(n, a) { if (!(a instanceof BufferAttribute)) throw new Error('setAttribute needs BufferAttribute: ' + n); this.attributes[n] = a; return this; }
  getAttribute(n) { return this.attributes[n]; }
  setIndex(i) { this.index = Array.isArray(i) ? new BufferAttribute(new Uint16Array(i), 1) : i; return this; }
  applyMatrix4(m) {
    const p = this.attributes.position; if (p) for (let i = 0; i < p.count; i++) { const v = new Vector3(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(m); p.setXYZ(i, v.x, v.y, v.z); }
    const n = this.attributes.normal; if (n) { const nm = m.clone(); nm.elements[12] = nm.elements[13] = nm.elements[14] = 0; for (let i = 0; i < n.count; i++) { const v = new Vector3(n.getX(i), n.getY(i), n.getZ(i)).applyMatrix4(nm).normalize(); n.setXYZ(i, v.x, v.y, v.z); } }
    return this;
  }
  _rotQ(q) { return this.applyMatrix4(new Matrix4().makeRotationFromQuaternion(q)); } // Three r128 no expone applyQuaternion en geometrías
  translate(x, y, z) { const m = new Matrix4(); m.elements[12] = x; m.elements[13] = y; m.elements[14] = z; return this.applyMatrix4(m); }
  rotateX(a) { return this._rotQ(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), a)); }
  rotateY(a) { return this._rotQ(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), a)); }
  rotateZ(a) { return this._rotQ(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), a)); }
  scale(x, y, z) { return this.applyMatrix4(new Matrix4().makeScale(x, y, z)); }
  clone() { const g = new BufferGeometry(); for (const k in this.attributes) g.attributes[k] = this.attributes[k].clone(); g.index = this.index ? this.index.clone() : null; return g; }
  toNonIndexed() {
    if (!this.index) { console.warn('toNonIndexed on non-indexed'); return this; }
    const g = new BufferGeometry(), idx = this.index.array;
    for (const k in this.attributes) { const a = this.attributes[k], s = a.itemSize, arr = new a.array.constructor(idx.length * s); for (let i = 0; i < idx.length; i++) for (let j = 0; j < s; j++) arr[i * s + j] = a.array[idx[i] * s + j]; g.attributes[k] = new BufferAttribute(arr, s, a.normalized); }
    return g;
  }
  computeVertexNormals() { const p = this.attributes.position, n = new Float32Array(p.count * 3); for (let i = 0; i + 2 < p.count; i += 3) { const a = new Vector3(p.getX(i), p.getY(i), p.getZ(i)), b = new Vector3(p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)), c = new Vector3(p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); const f = new Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize(); for (let k = 0; k < 3; k++) { n[(i + k) * 3] = f.x; n[(i + k) * 3 + 1] = f.y; n[(i + k) * 3 + 2] = f.z; } } this.setAttribute('normal', new Float32BufferAttribute(n, 3)); }
  computeBoundingSphere() { this.boundingSphere = { radius: 1 }; }
  dispose() { this.disposed = true; }
}

function mk(pos, nor, uv, idx) { const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3)); g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3)); g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2)); g.setIndex(idx); return g; }
function adopt(self, g) { self.attributes = g.attributes; self.index = g.index; }
class BoxGeometry extends BufferGeometry { constructor(width = 1, height = 1, depth = 1) { super();
  const pos = [], nor = [], uv = [], idx = []; let n = 0;
  function plane(u, v, w, udir, vdir, W, H, D) { const vec = { x: 0, y: 0, z: 0 };
    for (let iy = 0; iy < 2; iy++) for (let ix = 0; ix < 2; ix++) { const x = ix * W - W / 2, y = iy * H - H / 2; vec[u] = x * udir; vec[v] = y * vdir; vec[w] = D / 2; pos.push(vec.x, vec.y, vec.z); const nn = { x: 0, y: 0, z: 0 }; nn[w] = D > 0 ? 1 : -1; nor.push(nn.x, nn.y, nn.z); uv.push(ix, 1 - iy); }
    const a = n, b = n + 2, c = n + 3, d = n + 1; idx.push(a, b, d, b, c, d); n += 4; }
  plane('z', 'y', 'x', -1, -1, depth, height, width); plane('z', 'y', 'x', 1, -1, depth, height, -width); plane('x', 'z', 'y', 1, 1, width, depth, height); plane('x', 'z', 'y', 1, -1, width, depth, -height); plane('x', 'y', 'z', 1, -1, width, height, depth); plane('x', 'y', 'z', -1, -1, width, height, -depth);
  adopt(this, mk(pos, nor, uv, idx)); } }
class CylinderGeometry extends BufferGeometry { constructor(rt = 1, rb = 1, h = 1, rs = 8, hs = 1, open = false) { super();
  const pos = [], nor = [], uv = [], idx = [], grid = []; let n = 0; const slope = (rb - rt) / h;
  for (let y = 0; y <= hs; y++) { const row = [], v = y / hs, r = v * (rb - rt) + rt; for (let x = 0; x <= rs; x++) { const u = x / rs, th = u * Math.PI * 2, st = Math.sin(th), ct = Math.cos(th); pos.push(r * st, -v * h + h / 2, r * ct); const l = Math.hypot(st, slope, ct); nor.push(st / l, slope / l, ct / l); uv.push(u, 1 - v); row.push(n++); } grid.push(row); }
  for (let x = 0; x < rs; x++) for (let y = 0; y < hs; y++) { const a = grid[y][x], b = grid[y + 1][x], c = grid[y + 1][x + 1], d = grid[y][x + 1]; idx.push(a, b, d, b, c, d); }
  if (!open) for (const top of [true, false]) { const r = top ? rt : rb; if (r <= 0) continue; const sign = top ? 1 : -1, c0 = n; pos.push(0, h / 2 * sign, 0); nor.push(0, sign, 0); uv.push(0.5, 0.5); n++;
    for (let x = 0; x <= rs; x++) { const th = x / rs * Math.PI * 2; pos.push(r * Math.sin(th), h / 2 * sign, r * Math.cos(th)); nor.push(0, sign, 0); uv.push(Math.cos(th) * 0.5 + 0.5, Math.sin(th) * 0.5 * sign + 0.5); n++; }
    for (let x = 0; x < rs; x++) { const a = c0 + 1 + x, b = c0 + 2 + x; if (top) idx.push(b, a, c0); else idx.push(a, b, c0); } }
  adopt(this, mk(pos, nor, uv, idx)); } }
class ConeGeometry extends CylinderGeometry { constructor(r = 1, h = 1, seg = 8, hs = 1, open = false) { super(0, r, h, seg, hs, open); } }
class SphereGeometry extends BufferGeometry { constructor(r = 1, ws = 8, hs = 6, ps = 0, pl = Math.PI * 2, ts = 0, tl = Math.PI) { super();
  const pos = [], nor = [], uv = [], idx = [], grid = []; let n = 0; const te = Math.min(ts + tl, Math.PI);
  for (let iy = 0; iy <= hs; iy++) { const row = [], v = iy / hs; for (let ix = 0; ix <= ws; ix++) { const u = ix / ws, x = -r * Math.cos(ps + u * pl) * Math.sin(ts + v * tl), y = r * Math.cos(ts + v * tl), z = r * Math.sin(ps + u * pl) * Math.sin(ts + v * tl); pos.push(x, y, z); const l = Math.hypot(x, y, z) || 1; nor.push(x / l, y / l, z / l); uv.push(u, 1 - v); row.push(n++); } grid.push(row); }
  for (let iy = 0; iy < hs; iy++) for (let ix = 0; ix < ws; ix++) { const a = grid[iy][ix + 1], b = grid[iy][ix], c = grid[iy + 1][ix], d = grid[iy + 1][ix + 1]; if (iy !== 0 || ts > 0) idx.push(a, b, d); if (iy !== hs - 1 || te < Math.PI) idx.push(b, c, d); }
  adopt(this, mk(pos, nor, uv, idx)); } }
class OctahedronGeometry extends BufferGeometry { constructor(r = 1) { super();
  const v = [[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]], f = [[0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2], [1, 2, 5], [1, 5, 3], [1, 3, 4], [1, 4, 2]], pos = [];
  f.forEach(t => t.forEach(i => pos.push(...v[i]))); this.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3)); } }
class TorusGeometry extends BufferGeometry { constructor(R = 1, r = 0.4, rs = 8, ts = 6, arc = Math.PI * 2) { super();
  const pos = [], nor = [], uv = [], idx = [];
  for (let j = 0; j <= rs; j++) for (let i = 0; i <= ts; i++) { const u = i / ts * arc, v = j / rs * Math.PI * 2, x = (R + r * Math.cos(v)) * Math.cos(u), y = (R + r * Math.cos(v)) * Math.sin(u), z = r * Math.sin(v); pos.push(x, y, z); const cx = R * Math.cos(u), cy = R * Math.sin(u), nx = x - cx, ny = y - cy, nz = z, l = Math.hypot(nx, ny, nz) || 1; nor.push(nx / l, ny / l, nz / l); uv.push(i / ts, j / rs); }
  for (let j = 1; j <= rs; j++) for (let i = 1; i <= ts; i++) { const a = (ts + 1) * j + i - 1, b = (ts + 1) * (j - 1) + i - 1, c = (ts + 1) * (j - 1) + i, d = (ts + 1) * j + i; idx.push(a, b, d, b, c, d); }
  adopt(this, mk(pos, nor, uv, idx)); } }
class PlaneGeometry extends BufferGeometry { constructor(w = 1, h = 1) { super(); adopt(this, mk([-w / 2, h / 2, 0, w / 2, h / 2, 0, -w / 2, -h / 2, 0, w / 2, -h / 2, 0], [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], [0, 1, 1, 1, 0, 0, 1, 0], [0, 2, 1, 2, 3, 1])); } }
class CircleGeometry extends BufferGeometry { constructor(r = 1, seg = 8) { super(); const pos = [0, 0, 0], nor = [0, 0, 1], uv = [0.5, 0.5], idx = []; for (let i = 0; i <= seg; i++) { const t = i / seg * Math.PI * 2; pos.push(r * Math.cos(t), r * Math.sin(t), 0); nor.push(0, 0, 1); uv.push(0, 0); } for (let i = 1; i <= seg; i++) idx.push(i, i + 1, 0); adopt(this, mk(pos, nor, uv, idx)); } }
class RingGeometry extends BufferGeometry { constructor(ri = 0.5, ro = 1, seg = 8) { super(); const pos = [], nor = [], uv = [], idx = []; for (let j = 0; j <= 1; j++) for (let i = 0; i <= seg; i++) { const t = i / seg * Math.PI * 2, r = j ? ro : ri; pos.push(r * Math.cos(t), r * Math.sin(t), 0); nor.push(0, 0, 1); uv.push(0, 0); } for (let i = 0; i < seg; i++) { const a = i, b = i + 1, c = seg + 2 + i, d = seg + 1 + i; idx.push(a, b, d, b, c, d); } adopt(this, mk(pos, nor, uv, idx)); } }
class TubeGeometry extends BufferGeometry { constructor(curve, seg = 8, r = 0.1, rs = 4) { super(); const P = curve.points, pts = [];
  for (let i = 0; i <= seg; i++) { const t = i / seg * (P.length - 1), k = Math.min(P.length - 2, Math.floor(t)), f = t - k; pts.push(P[k].clone().lerp(P[k + 1], f)); }
  const pos = [], nor = [], uv = [], idx = [];
  pts.forEach((p, i) => { const tg = (pts[Math.min(i + 1, seg)].clone().sub(pts[Math.max(0, i - 1)])).normalize(); let nn = new Vector3(0, 1, 0); if (Math.abs(tg.y) > 0.9) nn.set(1, 0, 0); const b = new Vector3().crossVectors(tg, nn).normalize(); nn = new Vector3().crossVectors(b, tg); for (let j = 0; j <= rs; j++) { const v = j / rs * Math.PI * 2, d = nn.clone().multiplyScalar(Math.cos(v)).addScaledVector(b, Math.sin(v)); pos.push(p.x + d.x * r, p.y + d.y * r, p.z + d.z * r); nor.push(d.x, d.y, d.z); uv.push(i / seg, j / rs); } });
  for (let i = 1; i <= seg; i++) for (let j = 1; j <= rs; j++) { const a = (rs + 1) * (i - 1) + (j - 1), b = (rs + 1) * i + (j - 1), c = (rs + 1) * i + j, d = (rs + 1) * (i - 1) + j; idx.push(a, b, d, b, c, d); }
  adopt(this, mk(pos, nor, uv, idx)); } }
class InstancedBufferGeometry extends BufferGeometry { constructor() { super(); this.instanceCount = Infinity; } }
class CatmullRomCurve3 { constructor(points) { this.points = points; } }
// ---------- materials & textures ----------
class Material {
  constructor(p = {}) { this.opacity = 1; this.transparent = false; this.visible = true; this.needsUpdate = false; this.side = 0; this.color = new Color(0xffffff); this.setValues(p); }
  setValues(p) { for (const k in p) { if (p[k] === undefined) throw new Error('undefined material param ' + k); if (k === 'color') this.color = p.color instanceof Color ? p.color.clone() : new Color(p.color); else this[k] = p[k]; } }
  clone() { const m = new this.constructor(); for (const k in this) if (k !== 'uuid') m[k] = this[k]; m.color = this.color.clone(); return m; }
  dispose() { this.disposed = true; }
}
class MeshStandardMaterial extends Material {}
class MeshBasicMaterial extends Material {}
class ShaderMaterial extends Material { constructor(p) { super(p); if (!this.vertexShader || !this.fragmentShader) throw new Error('shader missing'); } }
class SpriteMaterial extends Material { constructor(p) { super(p); this.rotation = this.rotation || 0; } }
class LineBasicMaterial extends Material {}
class PointsMaterial extends Material {}
class ShadowMaterial extends Material {}
class Texture { constructor(img) { this.image = img; this.repeat = new Vector2(1, 1); this.offset = new Vector2(); this.wrapS = this.wrapT = 0; this.needsUpdate = false; this.isTexture = true; } dispose() { this.disposed = true; } clone() { return new Texture(this.image); } }
class CanvasTexture extends Texture { constructor(c) { super(c); this.isCanvasTexture = true; if (!c || !c.getContext) throw new Error('CanvasTexture needs canvas'); } }
class PMREMGenerator { constructor() {} fromScene() { return { texture: new Texture() }; } dispose() {} }
class Plane { setFromNormalAndCoplanarPoint(n, p) { this.n = n.clone(); this.c = -p.dot(n); return this; } }
class Ray { constructor() { this.origin = new Vector3(); this.direction = new Vector3(0, 0, -1); } intersectPlane(pl, t) { const d = pl.n.dot(this.direction); if (Math.abs(d) < 1e-6) return null; const s = -(this.origin.dot(pl.n) + pl.c) / d; if (s < 0) return null; return t.copy(this.origin).addScaledVector(this.direction, s); } }
class Raycaster { constructor() { this.ray = new Ray(); } setFromCamera(c, cam) { cam.updateMatrixWorld(); this.ray.origin.setFromMatrixPosition(cam.matrixWorld); this.ray.direction.set(c.x * 0.6, c.y * 0.45, -1).applyQuaternion(cam.quaternion).normalize(); } intersectObjects(list) {
  // planes approximated by their bounding square (PlaneGeometry 1x1 scaled by parameters unknown): use userData size from widget meshes (w,h stored on geometry)
  const hits = [];
  for (const o of list) { if (!o.visible) continue; const w = o.userData.w, h = o.userData.h; if (!w) continue; o.updateWorldMatrix(true, false); const n = o.getWorldDirection(new Vector3()), p = o.getWorldPosition(new Vector3()); const pl = new Plane().setFromNormalAndCoplanarPoint(n, p); const pt = this.ray.intersectPlane(pl, new Vector3()); if (!pt) continue; const l = o.worldToLocal(pt.clone()); if (Math.abs(l.x) <= w / 2 && Math.abs(l.y) <= h / 2) hits.push({ object: o, point: pt, distance: pt.distanceTo(this.ray.origin) }); }
  return hits.sort((a, b) => a.distance - b.distance);
} }
class WebGLRenderer {
  constructor() { this.domElement = global.document.createElement('canvas'); this.shadowMap = { enabled: false, type: 0 }; this.capabilities = { getMaxAnisotropy: () => 16 }; this.toneMappingExposure = 1;
    const self = this; this.xr = { enabled: false, _session: null, setReferenceSpaceType() {}, setFoveation() {}, getSession() { return this._session; }, async setSession(s) { this._session = s; s._renderer = self; }, getReferenceSpace() { return this._session ? {} : null; } };
    this.renders = 0; }
  setPixelRatio() {} setSize() {} setClearColor() {}
  setAnimationLoop(cb) { this.loop = cb; }
  render(scene, cam) { this.renders++; scene.updateMatrixWorld(true); }
}
module.exports = {
  Vector2, Vector3, Euler, Quaternion, Matrix4, Color, Object3D, Group, Scene, Bone, Mesh, SkinnedMesh, Skeleton, InstancedMesh, Sprite, Line, LineSegments, Points,
  PerspectiveCamera, DirectionalLight, PointLight, HemisphereLight, Fog, FogExp2, BufferAttribute, Float32BufferAttribute, Uint16BufferAttribute, InstancedBufferAttribute,
  BufferGeometry, BoxGeometry, CylinderGeometry, ConeGeometry, SphereGeometry, OctahedronGeometry, TorusGeometry, TubeGeometry, PlaneGeometry, CircleGeometry, RingGeometry, InstancedBufferGeometry, CatmullRomCurve3,
  MeshStandardMaterial, MeshBasicMaterial, ShaderMaterial, SpriteMaterial, LineBasicMaterial, PointsMaterial, ShadowMaterial, CanvasTexture, Texture, PMREMGenerator, Plane, Raycaster, WebGLRenderer,
  sRGBEncoding: 3001, ACESFilmicToneMapping: 4, PCFSoftShadowMap: 2, BackSide: 1, DoubleSide: 2, FrontSide: 0, AdditiveBlending: 2, NormalBlending: 1, RepeatWrapping: 1000, ClampToEdgeWrapping: 1001, DynamicDrawUsage: 35048,
  MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) }
};
