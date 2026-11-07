/* =================== LUCIÉRNAGAS =================== */
// Puntitos de luz que flotan alrededor, para dar vida al entorno (en VR, en todos los entornos; se quitan en Entorno →
// «Luciérnagas»). Todo en la tarjeta gráfica: cada una es un punto con su núcleo y un halo suave, y su vuelo sale de
// su semilla: ondas lentas en las tres direcciones, de frecuencias que no casan (nunca repite el dibujo), con un tiempo
// propio que a ratos corre y a ratos casi se para (se cierne como un insecto y luego se va), pero que nunca va hacia
// atrás, y un poco de subir y bajar. Antes ese tiempo, a ratos, retrocedía (desandaban lo andado de golpe) y llevaban un
// temblor de «alas» de 3 a 4 por segundo, el mismo para todas: daba una sacudida que no venía a cuento. Se encienden y
// apagan despacio, cada una a su ritmo. Nunca a menos de 80 cm de tu cabeza. Cuando avanzas (la Travesía y los Arcos por
// el paisaje) se quedan atrás, como el paisaje.
// Con música (Spotify sonando con su ritmo, o el «Ritmo de la música» puesto a mano), bailan a su compás: vuelan algo más
// deprisa cuanto más rápida es la canción, su vaivén llega a un extremo en cada pulso (la mitad hacia un lado y la otra
// mitad hacia el otro, en columpio: arriba en los extremos) y destellan en cada pulso, más en el primero de cada cuatro,
// como las luciérnagas que se sincronizan. Al empezar o parar la música, el baile entra y sale despacio, sin saltos.
// De día, doradas y pálidas (como polen al sol); de noche, verdes amarillentas
const MOTE_N = 90, MOTE_SPAN = 15;
const MOTES = (() => {
  const g = new THREE.BufferGeometry(), base = new Float32Array(MOTE_N * 3), seed = new Float32Array(MOTE_N * 4), R = rng(91);
  for (let i = 0; i < MOTE_N; i++) {
    const a = R() * TAU, d = 1.3 + Math.pow(R(), 0.8) * 12; // (más cerca que lejos, pero no encima)
    base.set([Math.sin(a) * d, 0.25 + Math.pow(R(), 1.3) * 3, -Math.cos(a) * d], i * 3); seed.set([R(), R(), R(), R()], i * 4);
  }
  g.setAttribute('position', new THREE.BufferAttribute(base, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFly: { value: 0 }, uBeat: { value: 0 }, uDance: { value: 0 }, uSwing: { value: 0 }, uScroll: { value: 0 }, uSpan: { value: MOTE_SPAN }, uHead: { value: new THREE.Vector3(0, 1.6, 0) }, uVH: { value: 1000 }, uColor: { value: new THREE.Color(0xfff2b8) }, uGain: { value: 1 } },
    vertexShader: `attribute vec4 aSeed; uniform float uTime, uFly, uBeat, uDance, uSwing, uScroll, uSpan, uVH; uniform vec3 uHead; varying float vA;
      void main() {
        float t = uTime, F = uFly; vec3 ph = aSeed.wzy * 6.2832;
        // su tiempo propio: a ratos corre y a ratos casi se para (de 0,2 a 1,8 veces su paso), pero nunca va hacia atrás
        float wa = 0.19 + 0.14 * aSeed.y, wb = 0.47 + 0.2 * aSeed.w;
        float tw = (0.32 + 0.22 * aSeed.x) * (F - 0.4 * cos(F * wa + ph.z) / wa - 0.4 * cos(F * wb + ph.x) / wb);
        vec3 f = vec3(0.71 + 0.33 * aSeed.x, 0.53 + 0.31 * aSeed.y, 0.89 + 0.29 * aSeed.z);
        vec3 off = vec3(sin(tw * f.x + ph.x) * 1.1, sin(tw * f.y * 0.8 + ph.z) * 0.42 + sin(tw * 3.13 + ph.x) * 0.09, cos(tw * f.z + ph.y) * 1.1);
        // el vaivén: el suyo, libre, o con música, al compás: en cada pulso, en un extremo (con canciones rápidas, cada dos; la
        // mitad, al revés que la otra mitad) y en columpio (un poco más arriba en los extremos, abajo al pasar por el medio)
        vec3 sw = vec3(sin(tw * 2.37 * f.y + ph.y), 0.0, sin(tw * 2.71 * f.x + ph.z)) * 0.32;
        float bw = cos(3.14159 * (uSwing + step(0.5, aSeed.z))); vec2 dir = vec2(cos(ph.x), sin(ph.x));
        off += mix(sw, vec3(dir.x * bw * 0.22, (bw * bw - 0.5) * 0.05, dir.y * bw * 0.22), uDance);
        vec3 p = position + off;
        p.z = mod(p.z + uScroll + uSpan, 2.0 * uSpan) - uSpan; // (al avanzar, se quedan atrás y vuelven a salir delante)
        vec3 dh = p - uHead; float dl = length(dh); if (dl < 0.8) p = uHead + dh / max(dl, 0.001) * 0.8; // (lejos de tu cara)
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        float b = 0.5 + 0.5 * sin(t * (0.5 + 0.9 * aSeed.y) + aSeed.x * 6.2832), tw2 = 0.35 + 0.65 * pow(b, 3.0); // (se encienden y apagan despacio; a ratos, un destello)
        float fb = fract(uBeat), acc = step(fract(uBeat * 0.25), 0.25), pulse = exp(-fb * 5.0) * (0.55 + 0.55 * acc) * (0.6 + 0.4 * aSeed.w); // (con música, un destello en cada pulso; más en el primero de cada cuatro)
        tw2 = mix(tw2, 0.3 + 0.45 * tw2 + pulse, uDance);
        vA = tw2 * smoothstep(16.0, 7.0, -mv.z) * smoothstep(0.35, 0.9, -mv.z) * smoothstep(uSpan, uSpan - 3.0, abs(p.z));
        gl_PointSize = clamp(0.1 * (0.75 + 0.5 * aSeed.w) * projectionMatrix[1][1] * uVH * 0.5 / -mv.z, 1.5, 48.0); // (unos 10 cm con el halo; el punto, un par de centímetros)
      }`,
    fragmentShader: `uniform vec3 uColor; uniform float uGain; varying float vA;
      void main() { vec2 q = gl_PointCoord * 2.0 - 1.0; float d2 = dot(q, q); if (d2 > 1.0) discard;
        float core = exp(-d2 * 14.0), halo = exp(-d2 * 3.5) * 0.4, a = min(1.0, (core * 1.4 + halo) * vA * uGain);
        gl_FragColor = vec4(mix(uColor, vec3(1.0), core * 0.6), a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.visible = false; pts.userData.noInk = true; arena.add(pts); return pts;
})();
const _moteNight = new THREE.Color(0xc8ff6a), _moteDay = new THREE.Color(0xffe58a);
// El baile: un reloj en pulsos que va enganchándose a la música poco a poco (sin saltos al cambiar de canción o de ritmo)
// (ph: en pulsos; sw: el del vaivén, en extremos, que con canciones rápidas va a medio tiempo) y el reloj del vuelo, que
// corre más deprisa cuanto más rápida es la canción (de 0,8 a 1,4 veces; 110 BPM, lo normal)
const MOTEB = { fly: 0, ph: 0, sw: 0, rate: 0, k: 0 };
const moteBpm = () => settings.bpm > 0 && (spPlaying() || !SP.songOn) ? settings.bpm : 0; // (el de Spotify, solo si suena)
function motesBeat(dt, now = perfNow()) {
  const B = MOTEB, bpm = moteBpm(), want = bpm / 60;
  B.k += ((bpm ? 1 : 0) - B.k) * Math.min(1, dt * 0.7); // (el baile entra y sale en unos 3 s)
  const lock = (c, per) => { c += dt * (B.rate || 2) / per; if (!bpm) return c; let err = (now - TCH.beat0) * want / per - c; err -= Math.round(err); return c + err * Math.min(1, dt * 1.2); }; // (lo que va adelantado o atrasado, dentro de medio pulso, se corrige poco a poco)
  if (bpm) B.rate = B.rate > 0 ? B.rate + (want - B.rate) * Math.min(1, dt * 1.5) : want;
  B.ph = lock(B.ph, 1); B.sw = lock(B.sw, (B.rate || 2) * 60 > 135 ? 2 : 1);
  B.ph = ((B.ph % 4) + 4) % 4; B.sw = ((B.sw % 4) + 4) % 4; // (todo lo que baila se repite cada cuatro: así el número no crece)
  B.fly += dt * (1 + B.k * (clamp((B.rate || 2) * 60 / 110, 0.8, 1.4) - 1));
}
function motesStep(dt, t) {
  const on = !!settings.motes && !arMode && state !== 'idle' && (preview || xrActive); MOTES.visible = on; if (!on) return;
  const U = MOTES.material.uniforms, night = forestOn() || (!natureOn() && !(typeof islandOn === 'function' && islandOn()) && !comicOn());
  motesBeat(dt); U.uTime.value = t; U.uFly.value = MOTEB.fly; U.uBeat.value = MOTEB.ph; U.uDance.value = MOTEB.k; U.uSwing.value = MOTEB.sw; U.uHead.value.copy(HL);
  U.uScroll.value = settings.mode === 'trek' ? TREK.dist : (typeof arcScenic === 'function' && arcScenic() && typeof ARX !== 'undefined') ? ARX.dist || 0 : 0;
  U.uColor.value.copy(night ? _moteNight : _moteDay); U.uGain.value = night ? 1.1 : 1.5;
  // el alto de la imagen de cada ojo (en las gafas) o de la ventana: para que midan lo mismo en todas partes
  const xs = renderer.xr && renderer.xr.isPresenting && renderer.xr.getSession(), L = xs && xs.renderState && xs.renderState.baseLayer;
  U.uVH.value = L && L.framebufferHeight ? L.framebufferHeight : innerHeight * (renderer.getPixelRatio ? renderer.getPixelRatio() : 1);
}
