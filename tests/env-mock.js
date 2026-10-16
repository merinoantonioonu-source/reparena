// DOM, canvas 2D, Web Audio and WebXR mocks
'use strict';
function ctx2d(canvas) {
  const noop = () => {};
  const grad = () => ({ addColorStop(o, c) { if (typeof c !== 'string') throw new Error('bad color stop'); if (o < 0 || o > 1 || isNaN(o)) throw new Error('bad gradient offset ' + o); } });
  return new Proxy({
    canvas, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '10px sans', textAlign: 'left', textBaseline: 'alphabetic', globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillRect: noop, clearRect: noop, strokeRect: noop, beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc(x, y, r) { if (r < 0) throw new Error('negative radius ' + r); }, arcTo(x1, y1, x2, y2, r) { if (r < 0) throw new Error('negative arcTo radius'); }, ellipse(x, y, rx, ry) { if (rx < 0 || ry < 0) throw new Error('negative ellipse'); },
    bezierCurveTo: noop, quadraticCurveTo: noop, rect: noop, fill: noop, stroke: noop, clip: noop, save: noop, restore: noop, translate: noop, rotate: noop, scale: noop,
    fillText(t) { if (t === undefined || (typeof t === 'number' && isNaN(t))) throw new Error('fillText undefined'); if (String(t).includes('undefined') || String(t).includes('NaN')) throw new Error('fillText bad text: ' + t); },
    strokeText: noop, measureText(t) { const m = /(\d+)px/.exec(this.font); return { width: String(t).length * (m ? +m[1] : 10) * 0.55 }; },
    createRadialGradient(x0, y0, r0, x1, y1, r1) { if (r0 < 0 || r1 < 0) throw new Error('negative gradient radius'); return grad(); }, createLinearGradient: grad,
    getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4).fill(128), width: w, height: h }; }, createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; }, putImageData: noop
  }, { get(t, k) { if (!(k in t)) throw new Error('ctx2d missing ' + String(k)); return t[k]; }, set(t, k, v) { t[k] = v; return true; } });
}
function element(tag) {
  const el = {
    tagName: tag, style: {}, dataset: {}, hidden: false, disabled: false, checked: false, value: '', textContent: '', innerHTML: '', children: [], listeners: {},
    addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }, removeEventListener() {},
    prepend() {}, appendChild() {}, getBoundingClientRect() { return { left: 0, top: 0, width: 1200, height: 800 }; },
    width: 300, height: 150
  };
  if (tag === 'canvas') { let c = null; el.getContext = () => (c = c || ctx2d(el)); }
  return el;
}
const elements = {};
const document = {
  querySelector(sel) { return elements[sel] = elements[sel] || element('div'); },
  querySelectorAll() { return []; },
  createElement: element,
  fonts: { ready: Promise.resolve() }
};
// ---------- Web Audio ----------
function param(v = 0) { return { value: v, setValueAtTime(x, t) { if (!isFinite(x) || !isFinite(t)) throw new Error('bad setValueAtTime'); this.value = x; return this; }, exponentialRampToValueAtTime(x, t) { if (!(x > 0) || !isFinite(t)) throw new Error('bad exp ramp value ' + x); return this; }, linearRampToValueAtTime(x, t) { if (!isFinite(x) || !isFinite(t)) throw new Error('bad lin ramp'); return this; }, setTargetAtTime(x, t, c) { if (!isFinite(x)) throw new Error('bad target'); return this; } }; }
let audioNodes = 0;
function node(extra = {}) { audioNodes++; return Object.assign({ connect(d) { if (!d) throw new Error('connect to undefined'); return d; }, disconnect() {} }, extra); }
class AudioContext {
  constructor() { this.sampleRate = 44100; this.currentTime = 0; this.state = 'running'; this.destination = node(); this.listener = { positionX: param(), positionY: param(), positionZ: param(), forwardX: param(), forwardY: param(), forwardZ: param(), upX: param(), upY: param(), upZ: param() }; }
  resume() { return Promise.resolve(); }
  createGain() { return node({ gain: param(1) }); }
  createOscillator() { let started = false; return node({ type: 'sine', frequency: param(440), detune: param(0), start(t) { if (started) throw new Error('osc started twice'); started = true; }, stop(t) { if (t !== undefined && !isFinite(t)) throw new Error('bad stop'); } }); }
  createBufferSource() { let started = false; return node({ buffer: null, loop: false, playbackRate: param(1), start(t, off) { if (started) throw new Error('src started twice'); if (!this.buffer) throw new Error('no buffer'); started = true; }, stop() {} }); }
  createBiquadFilter() { return node({ type: 'lowpass', frequency: param(350), Q: param(1), gain: param(0) }); }
  createPanner() { return node({ panningModel: 'equalpower', distanceModel: 'inverse', refDistance: 1, maxDistance: 1000, rolloffFactor: 1, positionX: param(), positionY: param(), positionZ: param() }); }
  createConvolver() { return node({ buffer: null }); }
  createDynamicsCompressor() { return node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }); }
  createWaveShaper() { return node({ curve: null, oversample: 'none' }); }
  createBuffer(ch, n, sr) { if (!(n > 0)) throw new Error('bad buffer length'); const data = Array.from({ length: ch }, () => new Float32Array(n)); return { numberOfChannels: ch, length: n, sampleRate: sr, getChannelData: i => data[i] }; }
}
// ---------- WebXR ----------
function makeXR() {
  const xr = {
    isSessionSupported: async () => true,
    async requestSession(mode, opts) { return (xr.last = new XRSessionMock(mode, opts)); }
  };
  return xr;
}
// Anclas persistentes como las de Meta Quest Browser: el "mundo" guarda las anclas por su identificador
const anchorStore = new Map(); let anchorSeq = 0;
// Suelo del guardián (bounded-floor): dónde está su origen en local-floor
const bounded = { on: false, pose: { position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } };
class XRRigidTransform { constructor(position, orientation) { this.position = Object.assign({ x: 0, y: 0, z: 0 }, position); this.orientation = Object.assign({ x: 0, y: 0, z: 0, w: 1 }, orientation); } }
function makeAnchor(pose) { const a = { anchorSpace: { anchorPose: pose }, deleted: false, delete() { this.deleted = true; }, async requestPersistentHandle() { const h = 'anchor-' + (++anchorSeq); anchorStore.set(h, pose); return h; } }; return a; }
class XRSessionMock {
  constructor(mode, opts) { this.mode = mode; this.opts = opts; this.inputSources = []; this.listeners = {}; this.restored = []; }
  addEventListener(e, f) { (this.listeners[e] = this.listeners[e] || []).push(f); }
  async end() { (this.listeners.end || []).forEach(f => f()); }
  async requestReferenceSpace(type) { if (type === 'bounded-floor' && bounded.on) return { bounded: true }; throw new Error('not supported'); }
  async restorePersistentAnchor(h) { this.restored.push(h); if (!anchorStore.has(h)) throw new Error('not found'); return makeAnchor(anchorStore.get(h)); }
  async deletePersistentAnchor(h) { anchorStore.delete(h); }
}
module.exports = { document, element, AudioContext, makeXR, XRSessionMock, XRRigidTransform, makeAnchor, anchorStore, bounded, elements, stats: () => ({ audioNodes }) };
