
/* =================== AUDIO (síntesis + sonido 3D) =================== */
const AUD = { C: null, loops: new Set() };
function makeNoiseBuf(C, sec, brown) {
  const n = Math.floor(C.sampleRate * sec), b = C.createBuffer(1, n, C.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return b;
}
function makeIR(C, dur, decay) {
  const n = Math.floor(C.sampleRate * dur), b = C.createBuffer(2, n, C.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < n; i++) {
      const t = i / n, early = i < C.sampleRate * 0.08 && Math.random() < 0.004 ? 0.8 : 0;
      d[i] = ((Math.random() * 2 - 1) * Math.pow(1 - t, decay) + early * (Math.random() < 0.5 ? -1 : 1)) * Math.min(1, i / (C.sampleRate * 0.006));
    }
  }
  return b;
}
function makeCurve(k) { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); } return c; }
function audioInit() {
  if (AUD.C) { if (AUD.C.state === 'suspended') AUD.C.resume(); return AUD.C; }
  let C; try { C = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
  AUD.C = C;
  const comp = C.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.25; comp.connect(C.destination);
  AUD.master = C.createGain(); AUD.master.connect(comp);
  AUD.sfx = C.createGain(); AUD.sfx.connect(AUD.master);
  AUD.amb = C.createGain(); AUD.amb.connect(AUD.master);
  AUD.rev = C.createConvolver(); AUD.rev.buffer = makeIR(C, 3.2, 2.4);
  AUD.revOut = C.createGain(); AUD.revOut.gain.value = 0.55; AUD.rev.connect(AUD.revOut); AUD.revOut.connect(AUD.sfx);
  AUD.noise = makeNoiseBuf(C, 3, false);
  AUD.brown = makeNoiseBuf(C, 3, true);
  AUD.curve = makeCurve(12); AUD.curveHard = makeCurve(60);
  applyVolume(); loadSamples();
  return C;
}
/* ---------- Sonidos propios: archivos en la carpeta sounds/ del repositorio ---------- */
// Si existe sounds/<nombre>.mp3 (o .ogg, .wav), suena ese archivo; si no, el sonido sintetizado.
const SAMPLE_NAMES = ['rayo', 'rayo-cargado', 'impacto', 'tentaculos', 'caida-foso', 'pompa'];
AUD.samples = {};
async function loadSamples() {
  if (typeof fetch !== 'function' || AUD.loading) return; AUD.loading = true;
  for (const n of SAMPLE_NAMES) for (const ext of ['mp3', 'ogg', 'wav']) {
    try {
      const r = await fetch(`sounds/${n}.${ext}`); if (!r.ok) continue;
      AUD.samples[n] = await AUD.C.decodeAudioData(await r.arrayBuffer()); break;
    } catch (e) { break; } // sin red o sin servidor (p. ej. abriendo el archivo a pelo): solo sintetizados
  }
}
function playSample(name, pos, { gain = 1, rate = 1, rev = 0.3, ref = 1.5 } = {}) {
  const b = AUD.samples && AUD.samples[name]; if (!b || !sndOK()) return false;
  const s = AUD.C.createBufferSource(); s.buffer = b; s.playbackRate.value = rate * rand(0.94, 1.06);
  s.connect(sout(pos, { rev, gain, ref })); s.start(); return true;
}
function applyVolume() {
  if (!AUD.C) return;
  AUD.sfx.gain.value = settings.volume / 100;
  AUD.amb.gain.value = (settings.ambient / 100) * (arMode && !forestOn() ? 0.35 : 1);
}
settingHooks.push(k => { if (k === 'volume' || k === 'ambient' || k === '*') applyVolume(); });
const sndOK = () => AUD.C && AUD.C.state === 'running' && settings.volume > 0;
function setPos(p, v) { if (p.positionX) { p.positionX.value = v.x; p.positionY.value = v.y; p.positionZ.value = v.z; } else p.setPosition(v.x, v.y, v.z); }
function panner(pos, ref = 1.5, roll = 1) {
  const p = AUD.C.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.maxDistance = 90; p.rolloffFactor = roll;
  setPos(p, pos); return p;
}
// Salida de un efecto: con posición 3D (HRTF) y envío a reverberación
function sout(pos, { rev = 0.25, gain = 1, ref = 1.5, roll = 1 } = {}) {
  const C = AUD.C, g = C.createGain(); g.gain.value = gain;
  let tail = g;
  if (pos) { const p = panner(pos, ref, roll); g.connect(p); tail = p; }
  tail.connect(AUD.sfx);
  if (rev > 0) { const s = C.createGain(); s.gain.value = rev; tail.connect(s); s.connect(AUD.rev); }
  return g;
}
function envGain(T, a, peak, d, dest) {
  const g = AUD.C.createGain();
  g.gain.setValueAtTime(0.0001, T); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), T + a); g.gain.exponentialRampToValueAtTime(0.0001, T + a + d);
  g.connect(dest); return g;
}
function tone(dest, { type = 'sine', f = 440, to = 0, t = 0, a = 0.004, d = 0.3, gain = 0.2, detune = 0 } = {}) {
  const C = AUD.C, T = C.currentTime + t, o = C.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f, T); if (to) o.frequency.exponentialRampToValueAtTime(to, T + a + d);
  o.detune.value = detune; o.connect(envGain(T, a, gain, d, dest)); o.start(T); o.stop(T + a + d + 0.05);
  return o;
}
function noise(dest, { t = 0, a = 0.002, d = 0.3, gain = 0.3, type = 'lowpass', f = 1000, to = 0, q = 0.8, brown = false, rate = 1 } = {}) {
  const C = AUD.C, T = C.currentTime + t, s = C.createBufferSource();
  s.buffer = brown ? AUD.brown : AUD.noise; s.loop = true; s.playbackRate.value = rate;
  const fl = C.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, T); if (to) fl.frequency.exponentialRampToValueAtTime(to, T + a + d); fl.Q.value = q;
  s.connect(fl); fl.connect(envGain(T, a, gain, d, dest)); s.start(T, Math.random() * 2.5); s.stop(T + a + d + 0.05);
  return fl;
}
function shaper(dest, hard) { const w = AUD.C.createWaveShaper(); w.curve = hard ? AUD.curveHard : AUD.curve; w.oversample = '2x'; w.connect(dest); return w; }

const SND = {
  click() { if (!sndOK()) return; const o = sout(null, { rev: 0.05, gain: 0.5 }); tone(o, { type: 'square', f: 1800, d: 0.025, gain: 0.08 }); noise(o, { type: 'highpass', f: 4000, d: 0.02, gain: 0.08 }); },
  tick() { if (!sndOK()) return; const o = sout(null, { rev: 0, gain: 0.3 }); tone(o, { type: 'triangle', f: 2400, d: 0.015, gain: 0.05 }); },
  charge() { if (!sndOK()) return; const o = sout(null, { rev: 0.1, gain: 0.6 }); tone(o, { f: 300, to: 900, d: 0.22, gain: 0.08, type: 'sawtooth' }); tone(o, { f: 600, to: 1800, d: 0.2, gain: 0.04 }); },
  perfect() { if (!sndOK()) return; const o = sout(null, { rev: 0.4, gain: 0.6 }); [1318, 1976, 2637, 3951].forEach((f, i) => tone(o, { f, d: 0.6 - i * 0.1, gain: 0.07 - i * 0.012, t: i * 0.03 })); },
  power(pow, pos) { if (!sndOK()) return; const o = sout(pos || null, { rev: 0.3, gain: 0.7 }); const f = 330 * Math.pow(1.26, pow); tone(o, { type: 'sawtooth', f, to: f * 2, d: 0.18 + pow * 0.04, gain: 0.07 }); tone(o, { f: f * 2, to: f * 3, t: 0.04, d: 0.2, gain: 0.05 }); noise(o, { type: 'bandpass', f: 1800 + pow * 600, q: 3, d: 0.15, gain: 0.08 }); },
  partial() { if (!sndOK()) return; const o = sout(null, { rev: 0.1, gain: 0.6 }); tone(o, { type: 'triangle', f: 260, to: 150, d: 0.25, gain: 0.12 }); },
  miss() { if (!sndOK()) return; const o = sout(null, { rev: 0.1, gain: 0.4 }); tone(o, { type: 'triangle', f: 420, to: 260, d: 0.12, gain: 0.06 }); },
  combo() { if (!sndOK()) return; const o = sout(null, { rev: 0.3, gain: 0.6 }); [523, 659, 784, 1046].forEach((f, i) => tone(o, { type: 'triangle', f, d: 0.18, gain: 0.08, t: i * 0.06 })); },
  beep(p = 1) { if (!sndOK()) return; const o = sout(null, { rev: 0.05, gain: 0.5 }); tone(o, { type: 'square', f: 880 * p, d: 0.06, gain: 0.06 }); },
  horn() {
    if (!sndOK()) return; const o = sout(null, { rev: 0.7, gain: 0.7 });
    for (let k = 0; k < 2; k++) [233, 277, 349].forEach(f => { const lp = AUD.C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.connect(o); tone(lp, { type: 'sawtooth', f, t: k * 0.9, a: 0.12, d: 0.65, gain: 0.08 }); });
  },
  victory() { if (!sndOK()) return; const o = sout(null, { rev: 0.6, gain: 0.7 }); [[392, 0], [523, 0.15], [659, 0.3], [784, 0.45], [1046, 0.6]].forEach(([f, t]) => { tone(o, { type: 'triangle', f, t, d: 0.9, gain: 0.08 }); tone(o, { type: 'sine', f: f * 2, t, d: 0.6, gain: 0.03 }); }); },
  defeat() { if (!sndOK()) return; const o = sout(null, { rev: 0.7, gain: 0.7 }); [220, 196, 165, 110].forEach((f, i) => tone(o, { type: 'sawtooth', f, t: i * 0.35, d: 0.6, gain: 0.06 })); },
  hurt() {
    if (!sndOK()) return; const o = sout(null, { rev: 0.3, gain: 0.9 });
    tone(shaper(o), { f: 90, to: 40, d: 0.4, gain: 0.7 }); noise(o, { brown: true, f: 600, to: 100, d: 0.4, gain: 0.7 });
    tone(o, { f: 4200, t: 0.05, a: 0.05, d: 1.4, gain: 0.025 }); // pitido en los oídos
  },
  explosion(pos, big) {
    if (!sndOK()) return; const o = sout(pos, { rev: 0.7, gain: big ? 1.3 : 1, ref: 3 });
    tone(shaper(o), { f: big ? 90 : 120, to: 26, d: big ? 1.0 : 0.6, gain: 0.95, a: 0.003 });
    noise(o, { brown: true, f: 2600, to: 120, d: big ? 2.4 : 1.4, gain: 1.0 });
    noise(o, { type: 'bandpass', f: 1100, q: 0.6, d: 0.3, gain: 0.7 });
    const n = big ? 40 : 22;
    for (let i = 0; i < n; i++) noise(o, { t: 0.02 + Math.random() * (big ? 1.4 : 0.8), type: 'highpass', f: 1500 + Math.random() * 3500, d: 0.01 + Math.random() * 0.03, gain: 0.06 + Math.random() * 0.2 });
    for (let i = 0; i < 6; i++) tone(o, { t: 0.35 + Math.random() * 1.3, type: 'triangle', f: 1800 + Math.random() * 4000, d: 0.09, gain: 0.025 });
  },
  metalHit(pos, heavy) {
    if (!sndOK()) return; const o = sout(pos, { rev: 0.4, gain: heavy ? 0.9 : 0.7, ref: 2 });
    noise(o, { type: 'bandpass', f: 2600, q: 2, d: 0.08, gain: 0.5 });
    [437, 1123, 1876, 2943, 4210].forEach((f, i) => tone(o, { f: f * rand(0.92, 1.08), d: 0.25 + i * 0.07, gain: 0.07 - i * 0.01, type: i % 2 ? 'triangle' : 'sine' }));
    tone(o, { f: 140, to: 60, d: 0.15, gain: 0.4 });
  },
  plasma(pos) {
    if (!sndOK()) return; const o = sout(pos, { rev: 0.3, gain: 0.8 });
    noise(o, { type: 'bandpass', f: 400, to: 3800, q: 1.4, d: 0.32, gain: 0.5 });
    tone(o, { f: 160, to: 55, d: 0.3, gain: 0.5 }); tone(o, { type: 'sawtooth', f: 900, to: 200, d: 0.25, gain: 0.05 });
  },
  laser(pos) {
    if (!sndOK()) return; const C = AUD.C, T = C.currentTime, o = sout(pos, { rev: 0.25, gain: 0.7 });
    const car = C.createOscillator(), mod = C.createOscillator(), mg = C.createGain();
    car.type = 'square'; car.frequency.setValueAtTime(2200, T); car.frequency.exponentialRampToValueAtTime(260, T + 0.2);
    mod.frequency.value = 95; mg.gain.value = 400; mod.connect(mg).connect(car.frequency);
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3500; car.connect(lp); lp.connect(envGain(T, 0.003, 0.09, 0.2, o));
    car.start(T); mod.start(T); car.stop(T + 0.25); mod.stop(T + 0.25);
    noise(o, { type: 'highpass', f: 5000, d: 0.04, gain: 0.15 });
  },
  door(pos) {
    if (!sndOK()) return; const o = sout(pos, { rev: 0.6, gain: 0.9, ref: 3 });
    noise(o, { brown: true, f: 300, d: 0.2, gain: 0.7 }); tone(o, { f: 60, to: 40, d: 0.25, gain: 0.5 });
    noise(o, { type: 'highpass', f: 2600, to: 900, t: 0.05, a: 0.03, d: 1.0, gain: 0.25 });
    tone(o, { type: 'sawtooth', f: 46, t: 0.1, a: 0.1, d: 0.9, gain: 0.07 });
    noise(o, { brown: true, t: 1.1, f: 400, d: 0.25, gain: 0.5 }); [180, 410, 960].forEach(f => tone(o, { t: 1.1, f, d: 0.3, gain: 0.04, type: 'triangle' }));
    for (let k = 0; k < 3; k++) tone(o, { type: 'square', f: 740, t: k * 0.35, d: 0.12, gain: 0.03 });
  },
  step(pos, heavy) {
    if (!sndOK()) return; const o = sout(pos, { rev: 0.35, gain: heavy ? 1.0 : 0.65, ref: 2 });
    tone(o, { f: heavy ? 70 : 95, to: 36, d: 0.2, gain: 0.7 }); noise(o, { brown: true, f: 600, to: 120, d: 0.16, gain: 0.6 });
    [173, 411, 897, 1530].forEach((f, i) => tone(o, { f: f * rand(0.9, 1.1), d: 0.1 + i * 0.04, gain: 0.04, type: 'triangle' }));
    noise(o, { t: 0.04, type: 'highpass', f: 3200, d: 0.1, gain: 0.04 });
  },
  servo(pos) {
    if (!sndOK()) return; const C = AUD.C, T = C.currentTime, o = sout(pos, { rev: 0.2, gain: 0.5 });
    const os = C.createOscillator(); os.type = 'sawtooth'; const f0 = rand(320, 420);
    os.frequency.setValueAtTime(f0, T); os.frequency.linearRampToValueAtTime(f0 * 1.6, T + 0.15); os.frequency.linearRampToValueAtTime(f0 * 1.1, T + 0.35);
    const lp = C.createBiquadFilter(); lp.type = 'bandpass'; lp.frequency.value = 1400; lp.Q.value = 1.5; os.connect(lp); lp.connect(envGain(T, 0.03, 0.05, 0.35, o)); os.start(T); os.stop(T + 0.42);
  },
  roar(pos, s = 1) {
    if (!sndOK()) return; const C = AUD.C, T = C.currentTime, o = sout(pos, { rev: 0.55, gain: 1.0, ref: 3 });
    const sh = shaper(o, true), bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.2;
    bp.frequency.setValueAtTime(320, T); bp.frequency.linearRampToValueAtTime(1000, T + 0.5); bp.frequency.linearRampToValueAtTime(260, T + 1.7); bp.connect(sh);
    const am = C.createGain(); am.gain.value = 0.6; am.connect(bp);
    const lfo = C.createOscillator(), lg = C.createGain(); lfo.frequency.value = 31; lg.gain.value = 0.45; lfo.connect(lg).connect(am.gain); lfo.start(T); lfo.stop(T + 1.9);
    [55, 58.4, 110.7, 83].forEach(f => { const os = C.createOscillator(); os.type = 'sawtooth'; os.frequency.setValueAtTime(f * s * 1.5, T); os.frequency.linearRampToValueAtTime(f * s, T + 0.4); os.frequency.linearRampToValueAtTime(f * s * 0.62, T + 1.8); os.connect(envGain(T, 0.15, 0.22, 1.55, am)); os.start(T); os.stop(T + 1.9); });
    noise(o, { type: 'bandpass', f: 1900, q: 1.3, a: 0.12, d: 1.4, gain: 0.22 });
  },
  hiss(pos, s = 1) {
    if (!sndOK()) return; const o = sout(pos, { rev: 0.25, gain: 0.8, ref: 0.6 });
    noise(o, { type: 'highpass', f: 3200 / s, a: 0.12, d: 0.7, gain: 0.35 }); noise(o, { type: 'bandpass', f: 6500 / Math.sqrt(s), q: 2, a: 0.1, d: 0.6, gain: 0.25 });
    for (let i = 0; i < 6; i++) noise(o, { t: 0.05 + i * rand(0.03, 0.07), type: 'highpass', f: 3000, d: 0.006, gain: 0.25 });
  },
  skitter(pos, s = 1) {
    if (!sndOK()) return; const o = sout(pos, { rev: 0.1, gain: 0.7, ref: 0.5 });
    const n = 5 + Math.floor(Math.random() * 7); let t = 0;
    for (let i = 0; i < n; i++) { t += rand(0.015, 0.04); noise(o, { t, type: 'highpass', f: 3500 / Math.sqrt(s), d: 0.005, gain: rand(0.08, 0.2) }); }
  },
  squish(pos) { if (!sndOK()) return; const o = sout(pos, { rev: 0.2, gain: 0.8, ref: 0.6 }); noise(o, { brown: true, f: 1200, to: 200, d: 0.3, gain: 0.7 }); noise(o, { type: 'bandpass', f: 700, to: 300, q: 4, d: 0.25, gain: 0.4 }); SND.hiss(pos, 1.3); },
  // Rayo: chasquido seco, crepitar eléctrico, zumbido de la descarga y, si es fuerte, retumbo de trueno
  bolt(pos, L = 0) {
    if (!sndOK()) return;
    if (playSample(L >= 2 ? 'rayo-cargado' : 'rayo', pos, { gain: 0.8 + L * 0.12, rate: 1.08 - L * 0.06 }) || (L >= 2 && playSample('rayo', pos, { gain: 1, rate: 0.85 }))) return;
    const o = sout(pos, { rev: 0.35 + L * 0.08, gain: 0.85 + L * 0.1, ref: 2 }), hard = shaper(o, true);
    noise(hard, { type: 'highpass', f: 700, a: 0.0005, d: 0.035, gain: 0.9 });          // chasquido
    noise(o, { type: 'bandpass', f: 3200, q: 0.7, a: 0.001, d: 0.12, gain: 0.5 });
    for (let i = 0; i < 16 + L * 6; i++) noise(o, { t: Math.pow(Math.random(), 1.6) * (0.25 + L * 0.08), type: 'highpass', f: rand(1800, 5000), d: rand(0.004, 0.02), gain: rand(0.15, 0.45) }); // crepitar
    tone(hard, { type: 'sawtooth', f: 62, to: 38, a: 0.002, d: 0.22 + L * 0.06, gain: 0.22 });  // zumbido
    tone(o, { type: 'square', f: rand(110, 130), a: 0.002, d: 0.12, gain: 0.05 });
    noise(o, { brown: true, type: 'lowpass', f: 900, to: 90, t: 0.02, a: 0.01, d: 0.5 + L * 0.35, gain: 0.35 + L * 0.12 }); // retumbo
  },
  // Al llegar al blanco
  boltHit(pos, L = 0) {
    if (!sndOK()) return;
    if (playSample('impacto', pos, { gain: 0.7 + L * 0.1 })) return;
    const o = sout(pos, { rev: 0.3, gain: 0.6 + L * 0.12, ref: 2 });
    noise(shaper(o, true), { type: 'highpass', f: 1200, d: 0.03, gain: 0.6 });
    for (let i = 0; i < 6 + L * 3; i++) noise(o, { t: Math.random() * 0.15, type: 'highpass', f: rand(2500, 6000), d: rand(0.004, 0.012), gain: 0.25 });
  },
  // Tentáculos: chapoteo viscoso, gruñido gutural y chillido que sube
  tentacle(pos, s = 1) {
    if (!sndOK()) return;
    if (playSample('tentaculos', pos, { gain: 1, rate: rand(0.85, 1.1), ref: 1.2 })) return;
    const C = AUD.C, T = C.currentTime, o = sout(pos, { rev: 0.45, gain: 1, ref: 1.2 });
    const bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3; bp.frequency.setValueAtTime(380, T); bp.connect(o);
    const lfo = C.createOscillator(), lg = C.createGain(); lfo.frequency.value = rand(7, 11); lg.gain.value = 260; lfo.connect(lg).connect(bp.frequency); lfo.start(T); lfo.stop(T + 1.2);
    const src = C.createBufferSource(); src.buffer = AUD.brown; src.loop = true; src.connect(envGain(T, 0.05, 0.9, 1.0, bp)); src.start(T, Math.random() * 2); src.stop(T + 1.15); // chapoteo
    const growl = shaper(o, true), am = C.createGain(); am.gain.value = 0.5; am.connect(growl);
    const trem = C.createOscillator(), tg = C.createGain(); trem.frequency.value = 23; tg.gain.value = 0.45; trem.connect(tg).connect(am.gain); trem.start(T); trem.stop(T + 1.4);
    [48, 51.5, 72].forEach(f => { const os = C.createOscillator(); os.type = 'sawtooth'; os.frequency.setValueAtTime(f * s, T); os.frequency.linearRampToValueAtTime(f * s * 0.7, T + 1.3); os.connect(envGain(T, 0.12, 0.2, 1.15, am)); os.start(T); os.stop(T + 1.4); }); // gruñido
    noise(o, { type: 'bandpass', f: 1800, to: 5200, q: 6, t: 0.25, a: 0.15, d: 0.6, gain: 0.18 }); // chillido
    tone(o, { type: 'sawtooth', f: 900 * s, to: 2600 * s, t: 0.3, a: 0.2, d: 0.5, gain: 0.03 });
    for (let i = 0; i < 8; i++) noise(o, { t: rand(0, 0.9), brown: true, f: rand(500, 1400), d: rand(0.04, 0.1), gain: 0.35 }); // gotas
  },
  // Caer al foso: zambullida y un coro de tentáculos que se excitan
  horror(pos) {
    if (!sndOK()) return;
    SND.splash(pos);
    if (playSample('caida-foso', pos, { gain: 1.1, ref: 1.2 })) return;
    for (let i = 0; i < 4; i++) setTimeout(() => SND.tentacle(pos.clone().add(new V3(rand(-0.8, 0.8), 0, rand(-0.8, 0.8))), rand(0.75, 1.25)), 120 + i * rand(150, 320));
    const o = sout(pos, { rev: 0.7, gain: 0.9, ref: 2 });
    noise(o, { type: 'bandpass', f: 600, to: 3800, q: 8, t: 0.4, a: 0.4, d: 1.4, gain: 0.25 }); // aullido
    tone(shaper(o, true), { type: 'sawtooth', f: 36, to: 28, t: 0.1, a: 0.3, d: 2.0, gain: 0.25 });
  },
  zap(pos) {
    if (!sndOK()) return; const o = sout(pos, { rev: 0.3, gain: 0.9 });
    tone(shaper(o, true), { type: 'sawtooth', f: 50, d: 0.45, gain: 0.5 });
    for (let i = 0; i < 14; i++) noise(o, { t: Math.random() * 0.4, type: 'highpass', f: 2000, d: 0.01 + Math.random() * 0.03, gain: 0.3 });
  },
  pop(pos, big) { if (!sndOK() || playSample('pompa', pos, { gain: big ? 1 : 0.8, rate: big ? 0.8 : 1 })) return; const o = sout(pos, { rev: 0.25, gain: big ? 1 : 0.8, ref: 0.8 }); tone(o, { f: big ? 380 : 650, to: big ? 1300 : 2500, a: 0.002, d: 0.06, gain: 0.35 }); noise(o, { type: 'highpass', f: 2500, d: 0.03, gain: 0.35 }); noise(o, { type: 'bandpass', f: 1200, q: 2, t: 0.02, d: 0.12, gain: 0.15 }); if (big) tone(o, { type: 'triangle', f: 220, to: 90, t: 0.02, d: 0.3, gain: 0.2 }); },
  // ameba de agua que revienta: chapoteo corto, gorgoteo y gotas que caen
  waterPop(pos, big) {
    if (!sndOK()) return; const o = sout(pos, { rev: 0.3, gain: big ? 1 : 0.85, ref: 0.8 });
    noise(o, { type: 'bandpass', f: 1400, to: 500, q: 1.2, d: 0.18, gain: 0.55 }); noise(o, { brown: true, f: 900, to: 180, d: 0.25, gain: 0.5 });
    tone(o, { f: big ? 300 : 420, to: big ? 900 : 1300, a: 0.002, d: 0.08, gain: 0.22 }); tone(o, { f: 180, to: 520, t: 0.03, d: 0.1, gain: 0.12 });
    for (let i = 0; i < 7; i++) tone(o, { t: 0.12 + Math.random() * 0.45, f: rand(700, 1500), to: rand(1600, 3200), d: 0.035, gain: 0.04 });
  },
  splash(pos) {
    if (!sndOK()) return; const o = sout(pos, { rev: 0.5, gain: 1, ref: 1.2 });
    noise(o, { brown: true, f: 1800, to: 200, d: 0.7, gain: 0.9 }); noise(o, { type: 'bandpass', f: 900, to: 400, q: 1.5, d: 0.5, gain: 0.5 }); tone(shaper(o), { f: 70, to: 35, d: 0.5, gain: 0.5 });
    for (let i = 0; i < 10; i++) tone(o, { t: 0.08 + Math.random() * 0.6, f: rand(500, 1400), to: rand(1500, 3000), d: 0.05, gain: 0.05 });
  },
  whoosh(pos) { if (!sndOK()) return; const o = sout(pos, { rev: 0.2, gain: 0.8, ref: 0.8 }); noise(o, { type: 'bandpass', f: 500, to: 2500, q: 1.2, a: 0.12, d: 0.35, gain: 0.4 }); },
  thunder(dist = 1) {
    if (!sndOK()) return; const o = sout(null, { rev: 0.9, gain: 0.9 });
    noise(o, { brown: true, t: 0.3 * dist, f: 500, to: 50, a: 0.05, d: 3.8, gain: 0.9 });
    for (let i = 0; i < 10; i++) noise(o, { t: 0.3 * dist + Math.random() * 0.5, type: 'bandpass', f: 600, q: 0.7, d: 0.15, gain: 0.25 });
  },
  // espadas: silbido del tajo (más agudo y fuerte cuanto más rápido), choque, impacto, bloqueo y corte
  swordSwish(pos, laser, v) {
    if (!sndOK()) return; const o = sout(pos, { rev: 0.15, gain: clamp(0.35 + v * 0.12, 0.35, 1), ref: 0.8 });
    if (laser) { tone(o, { type: 'sawtooth', f: 110, to: 70 + v * 25, a: 0.02, d: 0.28, gain: 0.12 }); noise(o, { type: 'bandpass', f: 900, to: 400, q: 2, a: 0.03, d: 0.25, gain: 0.15 }); }
    else noise(o, { type: 'bandpass', f: 1200 + v * 300, to: 600, q: 1.6, a: 0.04, d: 0.22, gain: 0.45 });
  },
  swordClang(pos, laser, v = 1) {
    if (!sndOK()) return; const o = sout(pos, { rev: 0.45, gain: clamp(0.3 + v * 0.15, 0.3, 1), ref: 0.8 });
    if (laser) { tone(shaper(o, true), { type: 'sawtooth', f: 160, to: 90, d: 0.18, gain: 0.25 }); for (let i = 0; i < 8; i++) noise(o, { t: Math.random() * 0.15, type: 'highpass', f: 3000, d: 0.015, gain: 0.25 }); return; }
    [1870, 2630, 3410, 4980].forEach((f, i) => tone(o, { type: 'triangle', f: f * rand(0.97, 1.03), d: 0.5 - i * 0.08, gain: 0.07 })); noise(o, { type: 'highpass', f: 2500, d: 0.03, gain: 0.35 });
  },
  swordHit(pos, laser) {
    if (!sndOK()) return; const o = sout(pos, { rev: 0.4, gain: 1, ref: 1 });
    if (laser) { tone(shaper(o, true), { type: 'sawtooth', f: 220, to: 60, d: 0.3, gain: 0.35 }); noise(o, { type: 'bandpass', f: 1800, to: 300, q: 1.5, d: 0.3, gain: 0.4 }); for (let i = 0; i < 10; i++) noise(o, { t: Math.random() * 0.25, type: 'highpass', f: 2500, d: 0.02, gain: 0.3 }); return; }
    noise(o, { brown: true, f: 1400, to: 200, d: 0.25, gain: 0.7 }); [980, 1520, 2340].forEach((f, i) => tone(o, { type: 'triangle', f, d: 0.35 - i * 0.07, gain: 0.08 })); noise(o, { type: 'highpass', f: 3500, d: 0.06, gain: 0.3 });
  },
  swordBlock(pos, laser) {
    if (!sndOK()) return; const o = sout(pos, { rev: 0.6, gain: 1, ref: 1 });
    tone(shaper(o, true), { type: 'square', f: laser ? 140 : 90, to: 45, d: 0.35, gain: 0.3 }); noise(o, { brown: true, f: 900, to: 150, d: 0.3, gain: 0.6 });
    if (laser) for (let i = 0; i < 12; i++) noise(o, { t: Math.random() * 0.3, type: 'highpass', f: 3000, d: 0.02, gain: 0.3 });
    else [1240, 1980, 2890, 4100].forEach((f, i) => tone(o, { type: 'triangle', f, d: 0.8 - i * 0.12, gain: 0.08 }));
  },
  swordSlice(pos, laser) {
    if (!sndOK()) return; const o = sout(pos, { rev: 0.3, gain: 0.9, ref: 0.8 });
    noise(o, { type: 'bandpass', f: laser ? 1500 : 2600, to: laser ? 300 : 800, q: 1.4, d: 0.18, gain: 0.55 }); tone(o, { type: laser ? 'sawtooth' : 'triangle', f: laser ? 300 : 700, to: laser ? 80 : 200, d: 0.2, gain: 0.15 });
  },
  // remolino: te traga (zumbido que cae a un rugido) y se cierra de golpe
  engulf(pos) {
    if (!sndOK()) return; const o = sout(pos, { rev: 0.9, gain: 1, ref: 1.5 });
    noise(o, { brown: true, f: 1600, to: 60, a: 0.05, d: 1.4, gain: 1 }); tone(shaper(o, true), { type: 'sawtooth', f: 160, to: 30, d: 1.3, gain: 0.35 }); noise(o, { type: 'bandpass', f: 2400, to: 200, q: 1.2, d: 1.0, gain: 0.4 });
  },
  vortexClose(pos) { if (!sndOK()) return; const o = sout(pos, { rev: 0.7, gain: 0.9, ref: 1.5 }); tone(shaper(o), { f: 90, to: 35, d: 0.5, gain: 0.5 }); noise(o, { brown: true, f: 700, to: 100, d: 0.4, gain: 0.6 }); tone(o, { type: 'triangle', f: 660, to: 990, t: 0.05, d: 0.4, gain: 0.05 }); },
  // bosque: un búho que ulula a lo lejos y una rama que cruje
  owl(pos) { if (!sndOK()) return; const o = sout(pos, { rev: 1.1, gain: 0.55, ref: 6 }), f = rand(330, 390); [0, 0.55, 0.8].forEach((t, i) => tone(o, { type: 'sine', f: f * (i === 1 ? 1.06 : 1), to: f * 0.88, t, a: 0.05, d: i ? 0.35 : 0.5, gain: 0.09 })); },
  creak(pos) { if (!sndOK()) return; const o = sout(pos, { rev: 0.8, gain: 0.5, ref: 3 }); const n = 6 + Math.floor(Math.random() * 6); for (let i = 0; i < n; i++) tone(o, { type: 'sawtooth', f: rand(140, 220), to: rand(110, 180), t: i * 0.05, d: 0.06, gain: 0.04 }); noise(o, { type: 'bandpass', f: 700, q: 3, d: 0.4, gain: 0.08 }); },
  clankFar(pos) { if (!sndOK()) return; const o = sout(pos, { rev: 1.2, gain: 0.5, ref: 6 }); [210, 470, 1040, 1730].forEach((f, i) => tone(o, { f: f * rand(0.9, 1.1), d: 0.6 + i * 0.2, gain: 0.05, type: 'triangle' })); noise(o, { brown: true, f: 500, d: 0.3, gain: 0.3 }); }
};

/* ---------- Sonidos continuos (zumbidos, arcos) ---------- */
class Loop {
  constructor(pos, gain, build) {
    const C = AUD.C; this.nodes = []; this.dead = false;
    this.out = C.createGain(); this.out.gain.value = 0.0001;
    this.p = panner(pos, 1.0, 1.2); this.out.connect(this.p); this.p.connect(AUD.sfx);
    const s = C.createGain(); s.gain.value = 0.15; this.p.connect(s); s.connect(AUD.rev);
    this.out.gain.setTargetAtTime(gain, C.currentTime, 0.15);
    build(this, C); this.nodes.forEach(n => n.start && n.start());
    AUD.loops.add(this);
  }
  osc(type, f) { const o = AUD.C.createOscillator(); o.type = type; o.frequency.value = f; this.nodes.push(o); return o; }
  src(brown) { const s = AUD.C.createBufferSource(); s.buffer = brown ? AUD.brown : AUD.noise; s.loop = true; this.nodes.push(s); return s; }
  set(pos) { if (!this.dead) setPos(this.p, pos); }
  stop() {
    if (this.dead) return; this.dead = true; AUD.loops.delete(this);
    const T = AUD.C.currentTime; this.out.gain.setTargetAtTime(0.0001, T, 0.08);
    this.nodes.forEach(n => { try { n.stop && n.stop(T + 0.5); } catch (e) {} });
  }
}
function buzzLoop(kind, pos) {
  if (!sndOK()) return null;
  const f0 = { drone: rand(120, 150), hornet: rand(190, 240), wasp: rand(160, 200), queen: rand(95, 115), bomber: rand(85, 100), carrier: rand(60, 70) }[kind] || 130;
  const insect = kind === 'hornet' || kind === 'wasp' || kind === 'queen';
  return new Loop(pos, kind === 'carrier' || kind === 'queen' ? 0.35 : kind === 'wasp' ? 0.24 : 0.18, (L, C) => {
    const bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f0 * 3; bp.Q.value = 0.9; bp.connect(L.out);
    const trem = C.createGain(); trem.gain.value = 0.7; trem.connect(bp);
    const a = L.osc('sawtooth', f0), b = L.osc('sawtooth', f0 * 1.013); a.connect(trem); b.connect(trem);
    const lfo = L.osc('sine', insect ? 23 : f0 / 9), lg = C.createGain(); lg.gain.value = 0.3; lfo.connect(lg).connect(trem.gain);
    if (insect) { const v = L.osc('sine', kind === 'hornet' ? 5.5 : 7.5), vg = C.createGain(); vg.gain.value = 9; v.connect(vg); vg.connect(a.frequency); vg.connect(b.frequency); }
    else { const w = L.osc('triangle', f0 * 7.1), wg = C.createGain(); wg.gain.value = 0.05; w.connect(wg).connect(L.out); }
    L.freqs = [a, b];
  });
}
// Zumbido de la espada láser: grave y continuo; al moverla sube de tono y de volumen
function saberLoop(pos) {
  if (!sndOK()) return null;
  const L = new Loop(pos, 0.12, (L, C) => {
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.connect(L.out);
    const a = L.osc('sawtooth', 88), b = L.osc('sawtooth', 89.3), g = C.createGain(); g.gain.value = 0.5; a.connect(g); b.connect(g); g.connect(lp);
    const c = L.osc('sine', 176), cg = C.createGain(); cg.gain.value = 0.3; c.connect(cg).connect(lp);
    L.oscs = [a, b, c]; L.lp = lp;
  });
  const set = L.set.bind(L);
  L.set = (p, v = 0) => { set(p); if (L.dead) return; const k = clamp(v / 4, 0, 1), T = AUD.C.currentTime; L.oscs.forEach((o, i) => o.frequency.setTargetAtTime((i === 2 ? 176 : 88 + i * 1.3) * (1 + k * 0.6), T, 0.03)); L.lp.frequency.setTargetAtTime(600 + k * 1800, T, 0.03); L.out.gain.setTargetAtTime(0.12 + k * 0.25, T, 0.03); };
  return L;
}
// Succión del remolino: viento grave que gira; k (0-1) es lo abierto que está
function suctionLoop(pos) {
  if (!sndOK()) return null;
  const L = new Loop(pos, 0.3, (L, C) => {
    const n = L.src(true), bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 260; bp.Q.value = 0.7; n.connect(bp); bp.connect(L.out);
    const lfo = L.osc('sine', 0.6), lg = C.createGain(); lg.gain.value = 120; lfo.connect(lg).connect(bp.frequency);
    const d = L.osc('sine', 42), dg = C.createGain(); dg.gain.value = 0.5; d.connect(dg).connect(L.out); L.lfo = lfo;
  });
  const set = L.set.bind(L);
  L.set = (p, k = 1) => { set(p); if (L.dead) return; const T = AUD.C.currentTime; L.out.gain.setTargetAtTime(0.05 + 0.35 * k, T, 0.1); L.lfo.frequency.setTargetAtTime(0.6 + (1 - k) * 2, T, 0.2); };
  return L;
}
function humLoop(pos) {
  if (!sndOK()) return null;
  return new Loop(pos, 0.3, (L, C) => {
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(L.out);
    L.osc('sawtooth', 55).connect(lp); const sq = L.osc('square', 110), sg = C.createGain(); sg.gain.value = 0.25; sq.connect(sg).connect(lp);
    const n = L.src(false), bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.8;
    const cr = C.createGain(); cr.gain.value = 0; n.connect(bp); bp.connect(cr); cr.connect(L.out);
    const l1 = L.osc('square', 13), l2 = L.osc('square', 7.3), lg = C.createGain(); lg.gain.value = 0.18; l1.connect(lg); l2.connect(lg); lg.connect(cr.gain);
  });
}
/* ---------- Ambiente ---------- */
const AMB = { nodes: null, nextClank: 5, nextThunder: 15, kind: '' };
function ambientStart() {
  if (!AUD.C || AMB.nodes) return;
  const C = AUD.C, nodes = [], T = C.currentTime;
  const out = C.createGain(); out.gain.value = 0.0001; out.gain.setTargetAtTime(1, T, 1.5); out.connect(AUD.amb);
  AMB.kind = forestOn() ? 'forest' : 'arena';
  if (AMB.kind === 'forest') { // viento entre las hojas, grillos y un zumbido grave e inquietante
    const w = C.createBufferSource(); w.buffer = AUD.noise; w.loop = true; const wf = C.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 520; wf.Q.value = 0.5;
    const wg = C.createGain(); wg.gain.value = 0.2; w.connect(wf).connect(wg).connect(out); nodes.push(w);
    const l1 = C.createOscillator(); l1.frequency.value = 0.08; const lg1 = C.createGain(); lg1.gain.value = 300; l1.connect(lg1).connect(wf.frequency); nodes.push(l1);
    const l2 = C.createOscillator(); l2.frequency.value = 0.13; const lg2 = C.createGain(); lg2.gain.value = 0.12; l2.connect(lg2).connect(wg.gain); nodes.push(l2);
    for (const [f, rate, g] of [[4300, 13, 0.012], [5100, 17.5, 0.008]]) {
      const c = C.createOscillator(); c.frequency.value = f; const cg = C.createGain(); cg.gain.value = 0; c.connect(cg).connect(out);
      const p = C.createOscillator(); p.type = 'square'; p.frequency.value = rate; const pg = C.createGain(); pg.gain.value = g; p.connect(pg).connect(cg.gain);
      const sl = C.createOscillator(); sl.frequency.value = 0.21; const sg = C.createGain(); sg.gain.value = g; sl.connect(sg).connect(cg.gain); nodes.push(c, p, sl);
    }
    const d = C.createOscillator(); d.type = 'triangle'; d.frequency.value = 55; const dg = C.createGain(); dg.gain.value = 0.035; const dl = C.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 160; d.connect(dl).connect(dg).connect(out); nodes.push(d);
    nodes.forEach(n => n.start()); AMB.nodes = { nodes, out }; return;
  }
  const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 130; lp.connect(out);
  [41.2, 41.7, 61.9].forEach((f, i) => { const o = C.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const g = C.createGain(); g.gain.value = i === 2 ? 0.05 : 0.13; o.connect(g).connect(lp); nodes.push(o); });
  const w = C.createBufferSource(); w.buffer = AUD.noise; w.loop = true; const wf = C.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 380; wf.Q.value = 0.6;
  const wg = C.createGain(); wg.gain.value = 0.16; w.connect(wf).connect(wg).connect(out); nodes.push(w);
  const lfo = C.createOscillator(); lfo.frequency.value = 0.06; const lg = C.createGain(); lg.gain.value = 220; lfo.connect(lg).connect(wf.frequency); nodes.push(lfo);
  const lfo2 = C.createOscillator(); lfo2.frequency.value = 0.11; const lg2 = C.createGain(); lg2.gain.value = 0.08; lfo2.connect(lg2).connect(wg.gain); nodes.push(lfo2);
  const hum = C.createOscillator(); hum.frequency.value = 98; const hg = C.createGain(); hg.gain.value = 0.02; hum.connect(hg).connect(out); nodes.push(hum);
  nodes.forEach(n => n.start());
  AMB.nodes = { nodes, out };
}
// Al entrar o salir del bosque cambia el ambiente
function ambientRefresh() { if (AMB.nodes && AMB.kind !== (forestOn() ? 'forest' : 'arena')) { ambientStop(); ambientStart(); } }
function ambientStop() {
  if (!AMB.nodes) return; const T = AUD.C.currentTime;
  AMB.nodes.out.gain.setTargetAtTime(0.0001, T, 0.3); AMB.nodes.nodes.forEach(n => n.stop(T + 1.5)); AMB.nodes = null;
}
const _lf = new V3(), _lu = new V3();
function updateListener(pos, q) {
  if (!AUD.C) return; const L = AUD.C.listener;
  _lf.set(0, 0, -1).applyQuaternion(q); _lu.set(0, 1, 0).applyQuaternion(q);
  if (L.positionX) {
    L.positionX.value = pos.x; L.positionY.value = pos.y; L.positionZ.value = pos.z;
    L.forwardX.value = _lf.x; L.forwardY.value = _lf.y; L.forwardZ.value = _lf.z; L.upX.value = _lu.x; L.upY.value = _lu.y; L.upZ.value = _lu.z;
  } else { L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(_lf.x, _lf.y, _lf.z, _lu.x, _lu.y, _lu.z); }
}
