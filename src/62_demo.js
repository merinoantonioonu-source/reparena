
/* =================== CARICATURA DEL EJERCICIO: CÓMO SE HACE Y QUÉ PASA AL HACERLO =================== */
// Un monigote visto de lado repite el movimiento correcto; al completar la repetición sale el rayo (o revientas
// la pompa, o pasas la cabeza por el aro…) y cae el robot o el volador que toque, todo esquemático. Se ve en la
// página bajo los ejercicios y, dentro del juego, junto al menú y mientras calibras o esperas.
// Coordenadas: metros, x hacia delante (el monigote mira a la derecha), y hacia arriba, suelo en y = 0.
const DL = { torso: 0.52, thigh: 0.44, shin: 0.44, up: 0.3, fore: 0.28, head: 0.1 };
const dg = a => a * Math.PI / 180;
const dirDown = (a, o = [0, 0]) => [Math.sin(dg(a)), -Math.cos(dg(a))]; // ángulo desde «hacia abajo», + hacia delante
// Dos segmentos que llegan a un punto (rodilla o codo hacia el lado b = ±1)
function ik(S, T, a, b, bend) {
  let dx = T[0] - S[0], dy = T[1] - S[1], d = Math.hypot(dx, dy); const dm = Math.min(d, a + b - 1e-4);
  if (d < 1e-6) { dx = 0; dy = -1; d = 1; }
  const phi = Math.atan2(dy, dx), al = Math.acos(clamp((a * a + dm * dm - b * b) / (2 * a * dm), -1, 1));
  const m = [S[0] + a * Math.cos(phi + bend * al), S[1] + a * Math.sin(phi + bend * al)];
  const e = [S[0] + dx / d * dm, S[1] + dy / d * dm];
  return [m, e];
}
function limb(S, spec, a, b) {
  if (spec.to) return ik(S, spec.to, a, b, spec.b || 1);
  const d1 = dirDown(spec.ang[0]), m = [S[0] + d1[0] * a, S[1] + d1[1] * a], d2 = dirDown(spec.ang[1]);
  return [m, [m[0] + d2[0] * b, m[1] + d2[1] * b]];
}
// Postura → articulaciones
function demoJoints(P) {
  const hip = P.hip, t = dg(P.torso || 0), td = [Math.sin(t), Math.cos(t)];
  const neck = [hip[0] + td[0] * DL.torso, hip[1] + td[1] * DL.torso], sh = [hip[0] + td[0] * DL.torso * 0.9, hip[1] + td[1] * DL.torso * 0.9];
  const ht = t + dg(P.head || 0), head = [neck[0] + Math.sin(ht) * (DL.head + 0.05), neck[1] + Math.cos(ht) * (DL.head + 0.05)];
  const J = { hip, neck, sh, head };
  for (const [k, def] of [['legF', { ang: [0, 0] }], ['legB', { ang: [0, 0] }]]) { const [kn, an] = limb(hip, P[k] || def, DL.thigh, DL.shin); J[k] = [kn, an]; }
  for (const [k, def] of [['armF', { ang: [0, 0] }], ['armB', { ang: [0, 0] }]]) { const [el, wr] = limb(sh, P[k] || def, DL.up, DL.fore); J[k] = [el, wr]; }
  return J;
}
// Mezcla de dos posturas (mismos campos)
function lerpPose(A, B, k) {
  if (typeof A === 'number') return A + (B - A) * k;
  if (Array.isArray(A)) return A.map((v, i) => lerpPose(v, B[i], k));
  if (A && typeof A === 'object') { const o = {}; for (const key in A) o[key] = key in B ? lerpPose(A[key], B[key], k) : A[key]; return o; }
  return k < 0.5 ? A : B;
}
// Posturas de base
const STAND = { hip: [0, 0.92], torso: 0, legF: { to: [0.02, 0.04], b: 1 }, legB: { to: [-0.04, 0.04], b: 1 }, armF: { ang: [4, 4] }, armB: { ang: [-4, -4] } };
const SQUAT = { hip: [-0.22, 0.53], torso: 38, legF: { to: [0.02, 0.04], b: 1 }, legB: { to: [-0.04, 0.04], b: 1 }, armF: { ang: [82, 86] }, armB: { ang: [78, 82] } };
const ST_ARMS = (f, b = f) => ({ armF: { ang: f }, armB: { ang: b } });
const P_ = (base, over) => Object.assign({}, base, over);
const PLANK_UP = { hip: [-0.36, 0.43], torso: 72, head: 14, legF: { to: [-1.2, 0.03], b: 1 }, legB: { to: [-1.22, 0.03], b: 1 }, armF: { to: [0.1, 0.02], b: -1 }, armB: { to: [0.07, 0.02], b: -1 } };
const PLANK_DN = P_(PLANK_UP, { hip: [-0.36, 0.24], torso: 84 });
const HINGE = { hip: [-0.16, 0.84], torso: 68, legF: { to: [0.02, 0.04], b: 1 }, legB: { to: [-0.04, 0.04], b: 1 }, armF: { ang: [2, 2] }, armB: { ang: [-2, -2] } };
// Cada ejercicio: claves [fase 0..1, postura], instante de la repetición (fire), postura «de esfuerzo» (low:
// donde llega la cabeza en Toques y Barras), origen del rayo, objetos y descripción
const DEMO = {
  squat: { P: 2.6, keys: [[0, STAND], [0.38, SQUAT], [0.55, SQUAT], [0.9, STAND], [1, STAND]], fire: 0.84, low: 0.45, desc: 'Pies a la anchura de los hombros: baja la cadera hacia atrás hasta casi sentarte y sube. Al subir, disparas.' },
  lunge: { P: 2.8, keys: [[0, STAND], [0.4, { hip: [-0.02, 0.5], torso: 4, legF: { to: [0.42, 0.04], b: 1 }, legB: { to: [-0.44, 0.06], b: 1 }, armF: { ang: [6, 6] }, armB: { ang: [-6, -6] } }], [0.55, { hip: [-0.02, 0.5], torso: 4, legF: { to: [0.42, 0.04], b: 1 }, legB: { to: [-0.44, 0.06], b: 1 }, armF: { ang: [6, 6] }, armB: { ang: [-6, -6] } }], [0.9, STAND], [1, STAND]], fire: 0.84, low: 0.48, desc: 'Da un paso al frente y baja hasta que la rodilla de atrás casi toque el suelo; vuelve y alterna la pierna.' },
  jsquat: { P: 2.8, high: 2.45, keys: [[0, STAND], [0.35, SQUAT], [0.5, SQUAT], [0.62, P_(STAND, { hip: [0, 1.14], legF: { to: [0.02, 0.24], b: 1 }, legB: { to: [-0.05, 0.22], b: 1 }, ...ST_ARMS([165, 170], [160, 168]) })], [0.75, STAND], [1, STAND]], fire: 0.62, low: 0.62, desc: 'Baja en sentadilla y sube con un salto explosivo, brazos arriba. Aterriza suave con las rodillas flexionadas.' },
  pushup: { P: 2.6, keys: [[0, PLANK_UP], [0.4, PLANK_DN], [0.55, PLANK_DN], [0.9, PLANK_UP], [1, PLANK_UP]], fire: 0.84, low: 0.47, tiny: true, desc: 'Cuerpo recto de la cabeza a los talones: baja el pecho hasta casi el suelo y empuja. Disparas al subir.' },
  dips: { P: 2.6, chair: true, keys: [[0, { hip: [0.1, 0.5], torso: -14, legF: { to: [0.82, 0.04], b: 1 }, legB: { to: [0.78, 0.04], b: 1 }, armF: { to: [-0.12, 0.47], b: -1 }, armB: { to: [-0.14, 0.47], b: -1 } }], [0.4, { hip: [0.08, 0.22], torso: -18, legF: { to: [0.82, 0.04], b: 1 }, legB: { to: [0.78, 0.04], b: 1 }, armF: { to: [-0.12, 0.47], b: -1 }, armB: { to: [-0.14, 0.47], b: -1 } }], [0.55, { hip: [0.08, 0.22], torso: -18, legF: { to: [0.82, 0.04], b: 1 }, legB: { to: [0.78, 0.04], b: 1 }, armF: { to: [-0.12, 0.47], b: -1 }, armB: { to: [-0.14, 0.47], b: -1 } }], [0.9, { hip: [0.1, 0.5], torso: -14, legF: { to: [0.82, 0.04], b: 1 }, legB: { to: [0.78, 0.04], b: 1 }, armF: { to: [-0.12, 0.47], b: -1 }, armB: { to: [-0.14, 0.47], b: -1 } }], [1, { hip: [0.1, 0.5], torso: -14, legF: { to: [0.82, 0.04], b: 1 }, legB: { to: [0.78, 0.04], b: 1 }, armF: { to: [-0.12, 0.47], b: -1 }, armB: { to: [-0.14, 0.47], b: -1 } }]], fire: 0.84, low: 0.47, desc: 'Manos en el borde de una silla estable, culo fuera: baja doblando los codos hasta unos 90° y estíralos.' },
  curl: { P: 3.0, dumb: true, keys: [[0, STAND], [0.22, P_(STAND, { armF: { ang: [4, 150] } })], [0.45, STAND], [0.67, P_(STAND, { armB: { ang: [-4, 148] } })], [0.9, STAND], [1, STAND]], fire: [0.2, 0.65], src: ['armF', 'armB'], desc: 'Codos pegados al cuerpo: sube la mancuerna hasta el hombro y bájala despacio. Cada brazo dispara al llegar arriba.' },
  curl2: { P: 2.4, bar: true, keys: [[0, STAND], [0.4, P_(STAND, { ...ST_ARMS([6, 150], [2, 146]) })], [0.55, P_(STAND, { ...ST_ARMS([6, 150], [2, 146]) })], [0.9, STAND], [1, STAND]], fire: 0.42, desc: 'Barra con las dos manos y los codos quietos: súbela hasta los hombros y bájala controlando.' },
  press: { P: 2.6, high: 2.35, dumb: true, keys: [[0, P_(STAND, ST_ARMS([28, 172], [24, 170]))], [0.4, P_(STAND, ST_ARMS([172, 176], [168, 174]))], [0.55, P_(STAND, ST_ARMS([172, 176], [168, 174]))], [0.9, P_(STAND, ST_ARMS([28, 172], [24, 170]))], [1, P_(STAND, ST_ARMS([28, 172], [24, 170]))]], fire: 0.4, src: 'armF', desc: 'Mancuernas a la altura de los hombros: súbelas hasta estirar los brazos por encima de la cabeza.' },
  press2: { P: 2.6, high: 2.35, bar: true, keys: [[0, P_(STAND, ST_ARMS([28, 172], [24, 170]))], [0.4, P_(STAND, ST_ARMS([172, 176], [168, 174]))], [0.55, P_(STAND, ST_ARMS([172, 176], [168, 174]))], [0.9, P_(STAND, ST_ARMS([28, 172], [24, 170]))], [1, P_(STAND, ST_ARMS([28, 172], [24, 170]))]], fire: 0.4, src: 'armF', desc: 'Barra apoyada delante de los hombros: empújala hacia arriba hasta bloquear los codos.' },
  fraise: { P: 2.6, kb: true, keys: [[0, P_(STAND, ST_ARMS([-6, -6], [-8, -8]))], [0.42, P_(STAND, ST_ARMS([90, 90], [88, 88]))], [0.55, P_(STAND, ST_ARMS([90, 90], [88, 88]))], [0.92, P_(STAND, ST_ARMS([-6, -6], [-8, -8]))], [1, P_(STAND, ST_ARMS([-6, -6], [-8, -8]))]], fire: 0.44, src: 'armF', desc: 'Una pesa con las dos manos: súbela al frente, brazos estirados, hasta los hombros. Arriba disparas.' },
  thruster: { P: 3.0, high: 2.35, bar: true, keys: [[0, P_(STAND, ST_ARMS([28, 172], [24, 170]))], [0.35, P_(SQUAT, ST_ARMS([40, 175], [36, 172]))], [0.48, P_(SQUAT, ST_ARMS([40, 175], [36, 172]))], [0.75, P_(STAND, ST_ARMS([172, 176], [168, 174]))], [0.9, P_(STAND, ST_ARMS([28, 172], [24, 170]))], [1, P_(STAND, ST_ARMS([28, 172], [24, 170]))]], fire: 0.74, src: 'armF', low: 0.42, desc: 'Barra en los hombros: baja en sentadilla y, al subir, aprovecha el impulso para empujarla por encima de la cabeza.' },
  frontsq: { P: 3.0, dumb: true, keys: [[0, STAND], [0.38, SQUAT], [0.5, SQUAT], [0.8, P_(STAND, ST_ARMS([90, 92], [86, 88]))], [0.92, STAND], [1, STAND]], fire: 0.8, src: 'armF', low: 0.44, desc: 'Baja en sentadilla y, al subir, eleva las mancuernas al frente con los brazos estirados hasta la altura de los hombros.' },
  swing: { P: 2.2, kb: true, keys: [[0, P_(HINGE, { armF: { ang: [-28, -28] }, armB: { ang: [-30, -30] } })], [0.45, P_(STAND, ST_ARMS([92, 92], [90, 90]))], [0.6, P_(STAND, ST_ARMS([88, 88], [86, 86]))], [1, P_(HINGE, { armF: { ang: [-28, -28] }, armB: { ang: [-30, -30] } })]], fire: 0.47, src: 'armF', desc: 'Pesa entre las piernas con la espalda recta: empuja la cadera adelante y deja que suba hasta el pecho.' },
  chop: { P: 2.6, high: 2.3, ball: true, keys: [[0, P_(STAND, ST_ARMS([150, 160], [146, 156]))], [0.4, P_(SQUAT, { hip: [-0.14, 0.66], torso: 34, ...ST_ARMS([40, 30], [36, 26]) })], [0.55, P_(SQUAT, { hip: [-0.14, 0.66], torso: 34, ...ST_ARMS([40, 30], [36, 26]) })], [1, P_(STAND, ST_ARMS([150, 160], [146, 156]))]], fire: 0.42, src: 'armF', desc: 'Con la pesa arriba a un lado, bájala en diagonal hasta la rodilla contraria girando el tronco, como un leñador.' },
  dlrow: { P: 3.0, bar: true, keys: [[0, STAND], [0.35, HINGE], [0.5, HINGE], [0.85, STAND], [1, STAND]], fire: 0.84, low: 0.42, desc: 'Baja la barra pegada a las piernas, con la cadera atrás y la espalda recta, y ponte de pie. Al subir, disparas; aguantar abajo da más fuerza.' },
  plank1: { P: 2.6, keys: [[0, PLANK_UP], [0.3, P_(PLANK_UP, { armF: { ang: [100, 100] } })], [0.55, P_(PLANK_UP, { armF: { ang: [100, 100] } })], [0.8, PLANK_UP], [1, PLANK_UP]], fire: 0.35, src: 'armF', tiny: true, spider: true, desc: 'En plancha sobre las dos manos, cuerpo recto: levanta un brazo al frente para disparar a las arañas de ese lado.' },
  splank: { P: 3.2, keys: [[0, { hip: [-0.36, 0.18], torso: 76, head: -6, legF: { to: [-1.23, 0.04], b: 1 }, legB: { to: [-1.25, 0.06], b: 1 }, armF: { ang: [5, 90] }, armB: { ang: [178, 180] } }], [0.5, { hip: [-0.36, 0.2], torso: 76, head: -6, legF: { to: [-1.23, 0.04], b: 1 }, legB: { to: [-1.25, 0.06], b: 1 }, armF: { ang: [5, 90] }, armB: { ang: [178, 180] } }], [1, { hip: [-0.36, 0.18], torso: 76, head: -6, legF: { to: [-1.23, 0.04], b: 1 }, legB: { to: [-1.25, 0.06], b: 1 }, armF: { ang: [5, 90] }, armB: { ang: [178, 180] } }]], fire: 0.9, src: 'armB', low: 0.5, desc: 'De lado sobre el antebrazo, cadera arriba y cuerpo recto: cada pocos segundos aguantados, un disparo.' },
  superman: { P: 3.2, keys: [[0, { hip: [-0.3, 0.12], torso: 90, head: 0, legF: { to: [-1.18, 0.05], b: 1 }, legB: { to: [-1.2, 0.05], b: 1 }, armF: { ang: [92, 92] }, armB: { ang: [92, 92] } }], [0.3, { hip: [-0.3, 0.13], torso: 72, head: -10, legF: { to: [-1.16, 0.16], b: 1 }, legB: { to: [-1.18, 0.16], b: 1 }, armF: { ang: [120, 122] }, armB: { ang: [118, 120] } }], [0.75, { hip: [-0.3, 0.13], torso: 72, head: -10, legF: { to: [-1.16, 0.16], b: 1 }, legB: { to: [-1.18, 0.16], b: 1 }, armF: { ang: [120, 122] }, armB: { ang: [118, 120] } }], [1, { hip: [-0.3, 0.12], torso: 90, head: 0, legF: { to: [-1.18, 0.05], b: 1 }, legB: { to: [-1.2, 0.05], b: 1 }, armF: { ang: [92, 92] }, armB: { ang: [92, 92] } }]], fire: 0.72, low: 0.5, lowFly: true, desc: 'Boca abajo con los brazos estirados: sube el tronco (y las piernas) y aguanta arriba los segundos que pidas.' },
  row: { P: 2.8, dip: 0.95, dipX: 0.11, keys: [[0, { hip: [-0.346, 0.253], torso: 76, head: 40, legF: { to: [-1.2, 0.04], b: 1 }, legB: { to: [-1.22, 0.04], b: 1 }, armF: { to: [0.11, 0.95], b: -1 }, armB: { to: [0.09, 0.95], b: -1 } }], [0.42, { hip: [-0.46, 0.517], torso: 57, head: 40, legF: { to: [-1.2, 0.04], b: 1 }, legB: { to: [-1.22, 0.04], b: 1 }, armF: { to: [0.11, 0.95], b: -1 }, armB: { to: [0.09, 0.95], b: -1 } }], [0.55, { hip: [-0.46, 0.517], torso: 57, head: 40, legF: { to: [-1.2, 0.04], b: 1 }, legB: { to: [-1.22, 0.04], b: 1 }, armF: { to: [0.11, 0.95], b: -1 }, armB: { to: [0.09, 0.95], b: -1 } }], [1, { hip: [-0.346, 0.253], torso: 76, head: 40, legF: { to: [-1.2, 0.04], b: 1 }, legB: { to: [-1.22, 0.04], b: 1 }, armF: { to: [0.11, 0.95], b: -1 }, armB: { to: [0.09, 0.95], b: -1 } }]], fire: 0.45, low: 0.48, desc: 'Colgado bajo las paralelas, cuerpo recto y talones en el suelo: tira hasta acercar el pecho a la barra.' },
  pullup: { P: 2.8, door: 2.15, keys: [[0, { hip: [-0.02, 1.08], torso: -4, legF: { to: [-0.1, 0.32], b: 1 }, legB: { to: [-0.16, 0.35], b: 1 }, armF: { to: [0.08, 2.15], b: -1 }, armB: { to: [0.04, 2.15], b: -1 } }], [0.42, { hip: [-0.02, 1.48], torso: -4, legF: { to: [-0.1, 0.72], b: 1 }, legB: { to: [-0.16, 0.75], b: 1 }, armF: { to: [0.08, 2.15], b: -1 }, armB: { to: [0.04, 2.15], b: -1 } }], [0.55, { hip: [-0.02, 1.48], torso: -4, legF: { to: [-0.1, 0.72], b: 1 }, legB: { to: [-0.16, 0.75], b: 1 }, armF: { to: [0.08, 2.15], b: -1 }, armB: { to: [0.04, 2.15], b: -1 } }], [1, { hip: [-0.02, 1.08], torso: -4, legF: { to: [-0.1, 0.32], b: 1 }, legB: { to: [-0.16, 0.35], b: 1 }, armF: { to: [0.08, 2.15], b: -1 }, armB: { to: [0.04, 2.15], b: -1 } }]], fire: 0.45, low: 0.48, desc: 'Colgado con los brazos estirados: sube hasta pasar la barbilla por encima de la barra y baja controlando.' },
  hang: { P: 3.0, door: 2.15, keys: [[0, { hip: [-0.02, 1.08], torso: -3, legF: { to: [-0.1, 0.32], b: 1 }, legB: { to: [-0.16, 0.35], b: 1 }, armF: { to: [0.08, 2.15], b: -1 }, armB: { to: [0.04, 2.15], b: -1 } }], [0.5, { hip: [0.03, 1.07], torso: 2, legF: { to: [-0.05, 0.31], b: 1 }, legB: { to: [-0.11, 0.34], b: 1 }, armF: { to: [0.08, 2.15], b: -1 }, armB: { to: [0.04, 2.15], b: -1 } }], [1, { hip: [-0.02, 1.08], torso: -3, legF: { to: [-0.1, 0.32], b: 1 }, legB: { to: [-0.16, 0.35], b: 1 }, armF: { to: [0.08, 2.15], b: -1 }, armB: { to: [0.04, 2.15], b: -1 } }]], fire: -1, desc: 'Cuélgate con los brazos estirados y aguanta los segundos de cada oleada. Si te sueltas, caes al charco.' },
  slam: { P: 3.2, high: 2.35, keys: [[0, STAND], [0.18, SQUAT], [0.3, SQUAT], [0.45, STAND], [0.62, { hip: [-0.02, 0.5], torso: 4, legF: { to: [0.42, 0.04], b: 1 }, legB: { to: [-0.44, 0.06], b: 1 }, armF: { ang: [6, 6] }, armB: { ang: [-6, -6] } }], [0.76, STAND], [0.86, P_(STAND, { hip: [0, 1.12], ...ST_ARMS([165, 170], [160, 168]) })], [1, STAND]], fire: 0.3, low: 0.24, desc: 'De pie, muévete de verdad: agáchate hasta el suelo a por los diamantes, da un paso lateral (o al frente) bajando la rodilla para meter la cabeza en las amebas de los lados y salta a por las de arriba. Vuelve al centro entre una y otra.' },
  jump: { P: 2.4, high: 2.5, keys: [[0, STAND], [0.3, P_(SQUAT, { hip: [-0.12, 0.72], torso: 20 })], [0.5, P_(STAND, { hip: [0, 1.16], legF: { to: [0.02, 0.26], b: 1 }, legB: { to: [-0.05, 0.24], b: 1 }, ...ST_ARMS([30, 30], [26, 26]) })], [0.68, STAND], [1, STAND]], fire: 0.5, low: 0.5, desc: 'Flexiona un poco y salta para meter la cabeza en el aro que espera por encima; toca las gemas con la mano.' },
  abs: { P: 2.8, keys: [[0, { hip: [0, 0.12], torso: -86, head: 0, legF: { to: [0.46, 0.04], b: 1 }, legB: { to: [0.44, 0.04], b: 1 }, armF: { to: [0.24, 0.13], b: 1 }, armB: { to: [0.22, 0.13], b: 1 } }], [0.4, { hip: [0, 0.12], torso: -38, head: 12, legF: { to: [0.46, 0.04], b: 1 }, legB: { to: [0.44, 0.04], b: 1 }, armF: { to: [0.28, 0.5], b: 1 }, armB: { to: [0.26, 0.48], b: 1 } }], [0.55, { hip: [0, 0.12], torso: -38, head: 12, legF: { to: [0.46, 0.04], b: 1 }, legB: { to: [0.44, 0.04], b: 1 }, armF: { to: [0.28, 0.5], b: 1 }, armB: { to: [0.26, 0.48], b: 1 } }], [1, { hip: [0, 0.12], torso: -86, head: 0, legF: { to: [0.46, 0.04], b: 1 }, legB: { to: [0.44, 0.04], b: 1 }, armF: { to: [0.24, 0.13], b: 1 }, armB: { to: [0.22, 0.13], b: 1 } }]], fire: 0.45, low: 0.45, desc: 'Boca arriba con las rodillas dobladas: sube el tronco para meter la cabeza en el aro (de frente o girado).' }
};
// Flexión inchworm: de pie, te doblas, caminas con las manos por las huellas hasta la plancha, flexión (dispara) y vuelta
const IW_ST = P_(STAND, { hip: [-1.2, 0.92], legF: { to: [-1.18, 0.04], b: 1 }, legB: { to: [-1.24, 0.04], b: 1 } });
const IW_LEGS = { legF: { to: [-1.18, 0.04], b: 1 }, legB: { to: [-1.24, 0.04], b: 1 } };
const IW_FOLD = { hip: [-1.3, 0.86], torso: 160, head: -20, ...IW_LEGS, armF: { to: [-0.98, 0.03], b: -1 }, armB: { to: [-1.0, 0.03], b: -1 } };
const IW_W1 = { hip: [-1.15, 0.75], torso: 125, head: -10, ...IW_LEGS, armF: { to: [-0.55, 0.03], b: -1 }, armB: { to: [-0.62, 0.03], b: -1 } };
const IW_W2 = { hip: [-0.85, 0.6], torso: 100, head: 0, ...IW_LEGS, armF: { to: [-0.2, 0.03], b: -1 }, armB: { to: [-0.3, 0.03], b: -1 } };
DEMO.inchworm = { P: 7, tiny: true, prints: [-1.0, -0.58, 0.08], keys: [[0, IW_ST], [0.08, IW_ST], [0.18, IW_FOLD], [0.27, IW_W1], [0.35, IW_W2], [0.43, PLANK_UP], [0.5, PLANK_DN], [0.55, PLANK_DN], [0.63, PLANK_UP], [0.71, IW_W2], [0.79, IW_W1], [0.87, IW_FOLD], [0.96, IW_ST], [1, IW_ST]], fire: 0.62, low: 0.53, desc: 'De pie, dóblate y camina con las manos por las tres parejas de huellas (las del medio cambian); en las últimas, flexión: disparas al subir. Vuelve andando y ponte de pie.' };
// Antebrazos con la barra flexible: primer plano de frente (de lado no se ve el giro). Cada mano gira unos 90° en
// sentido contrario a la otra, como al escurrir una toalla: el primer giro carga y el siguiente, al revés, dispara
DEMO.twist = { P: 2.6, custom: 'twist', keys: [[0, STAND], [1, STAND]], fire: 0.9, src: 'bar', desc: 'Gira las muñecas en sentidos contrarios, como al escurrir una toalla, y luego al revés: un giro carga y el siguiente dispara.' };
const TW_A = dg(45), TW_Z = 1.45; // giro de cada mano desde el centro (90° de un extremo al otro)
function twistAt(u) { return u < 0.4 ? lerp(-TW_A, TW_A, smooth(u / 0.4)) : u < 0.5 ? TW_A : u < 0.9 ? lerp(TW_A, -TW_A, smooth((u - 0.5) / 0.4)) : -TW_A; }
function demoTwist(c, X, Y, s, u, lw) {
  c.save(); c.translate(X(0), Y(0.75)); c.scale(TW_Z, TW_Z); c.translate(-X(0), -Y(0.75)); // primer plano, más grande
  const a = twistAt(u), da = twistAt(Math.min(1, u + 0.02)) - a, by = 1.12, hx = 0.44;
  // antebrazos desde abajo hasta los puños
  c.strokeStyle = DC.ink; c.lineWidth = lw * 2.2; c.beginPath(); c.moveTo(X(-0.8), Y(0.3)); c.lineTo(X(-hx), Y(by - 0.04)); c.moveTo(X(0.8), Y(0.3)); c.lineTo(X(hx), Y(by - 0.04)); c.stroke();
  // la barra, con las estrías inclinadas según lo retorcida que esté
  c.fillStyle = '#3ddc97'; rr(c, X(-hx), Y(by + 0.07), (2 * hx) * s, 0.14 * s, 0.07 * s); c.fill();
  c.strokeStyle = '#1f8f60'; c.lineWidth = 2; rr(c, X(-hx), Y(by + 0.07), (2 * hx) * s, 0.14 * s, 0.07 * s); c.stroke();
  const tw = a / TW_A * 0.06; c.strokeStyle = 'rgba(15,90,60,.75)'; c.lineWidth = 3;
  for (let i = 1; i < 10; i++) { const x = -hx + (2 * hx) * i / 10; c.beginPath(); c.moveTo(X(x - tw), Y(by - 0.06)); c.lineTo(X(x + tw), Y(by + 0.06)); c.stroke(); }
  // brillo de la carga entre el primer y el segundo giro
  if (u >= 0.4 && u < 0.9) { c.save(); c.shadowColor = DC.teal; c.shadowBlur = 22; c.fillStyle = 'rgba(60,240,198,.85)'; c.beginPath(); c.arc(X(0.05), Y(by), s * (0.05 + 0.01 * Math.sin(u * 60)), 0, TAU); c.fill(); c.restore(); }
  // puños: los nudillos suben en uno y bajan en el otro
  for (const sg of [-1, 1]) {
    const x = sg * hx, k = Math.sin(sg * a);
    c.fillStyle = '#e6dcff'; rr(c, X(x) - s * 0.075, Y(by + 0.1), s * 0.15, s * 0.2, s * 0.05); c.fill();
    c.fillStyle = '#8e86c0'; for (let n = 0; n < 4; n++) { c.beginPath(); c.arc(X(x - sg * 0.04 + sg * n * 0.0), Y(by + 0.02 + k * 0.06 - n * 0.035 + 0.05), s * 0.018, 0, TAU); c.fill(); }
    // flecha curva: hacia dónde gira cada mano ahora mismo (sentidos contrarios)
    if (Math.abs(da) > 1e-3) {
      const dir = Math.sign(da) * sg, cx = X(x), cy = Y(by), R = s * 0.17;
      c.strokeStyle = DC.gold; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, R, dir > 0 ? Math.PI * 1.15 : Math.PI * 1.85, dir > 0 ? Math.PI * 1.85 : Math.PI * 1.15, dir < 0); c.stroke();
      const end = dir > 0 ? Math.PI * 1.85 : Math.PI * 1.15, ex_ = cx + Math.cos(end) * R, ey = cy + Math.sin(end) * R;
      c.fillStyle = DC.gold; c.beginPath(); c.arc(ex_, ey, 4, 0, TAU); c.fill();
    }
  }
  c.fillStyle = DC.gold; c.font = `700 ${Math.round(s * 0.11)}px ${FB}`; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.fillText(u < 0.4 ? 'giro 1…' : u < 0.5 ? '¡cargado!' : u < 0.9 ? 'giro 2, al revés…' : '¡disparo!', X(0), Y(by - 0.25));
  c.restore();
}
DEMO.combo = { P: 4.8, high: 2.5, keys: [[0, STAND], [0.18, SQUAT], [0.28, SQUAT], [0.45, STAND], [0.6, P_(SQUAT, { hip: [-0.12, 0.72], torso: 20 })], [0.72, P_(STAND, { hip: [0, 1.16], legF: { to: [0.02, 0.26], b: 1 }, legB: { to: [-0.05, 0.24], b: 1 }, ...ST_ARMS([30, 30], [26, 26]) })], [0.86, STAND], [1, STAND]], fire: [0.24, 0.72], low: [0.24, 0.72], desc: 'Tú eliges la postura y los movimientos: por ejemplo, un aro bajo (sentadilla) y luego uno alto (salto).' };
// Postura del ejercicio en la fase u (0..1), suavizada entre claves
function demoPose(D, u) {
  const K = D.keys; let i = 0; while (i < K.length - 2 && u > K[i + 1][0]) i++;
  const [u0, A] = K[i], [u1, B] = K[i + 1], k = u1 > u0 ? smooth(clamp((u - u0) / (u1 - u0), 0, 1)) : 0;
  return lerpPose(A, B, k);
}

// Lo que hace una PERFECTA y el extra propio del ejercicio (o del modo), en una línea cada uno
const DEMO_RANGE = { squat: 'baja hasta casi sentarte', lunge: 'la rodilla de atrás casi al suelo', jsquat: 'sentadilla a fondo y salto', pushup: 'el pecho casi al suelo', inchworm: 'el pecho casi al suelo en la flexión', dips: 'baja hasta los codos en ángulo recto',
  curl: 'sube hasta el hombro y baja del todo', curl2: 'sube hasta el hombro y baja del todo', press: 'brazos estirados del todo arriba', press2: 'brazos estirados del todo arriba', fraise: 'hasta la altura de los hombros', thruster: 'sentadilla a fondo y brazos estirados',
  frontsq: 'sentadilla a fondo', swing: 'cadera bien atrás', chop: 'de arriba abajo, cruzando el cuerpo', dlrow: 'cadera atrás y espalda recta', plank1: 'cuerpo recto, sin girar la cadera', splank: 'cadera bien arriba', superman: 'brazos y piernas a la vez arriba',
  row: 'el pecho hasta la barra', pullup: 'la barbilla por encima de la barra', abs: 'sube los hombros del suelo', slam: 'a fondo y con fuerza', jump: 'salto con todo el cuerpo', combo: 'cada movimiento completo' };
function demoTips(ex, mode) {
  const pt = typeof settings !== 'undefined' && settings.perfectTime > 0 && !['hang', 'superman'].includes(ex) ? ` y sin prisa (${String(settings.perfectTime).replace('.', ',')} s)` : '';
  const perfect = ex === 'hang' ? 'Perfecta: quieto y colgado, sin balancearte.' : `Perfecta: ${DEMO_RANGE[ex] || 'recorrido completo'}${mode === 'touch' ? '' : pt}.`;
  let extra = '';
  if (mode === 'combat') extra = ex === 'inchworm' ? 'Extra: al volver, una onda aleja a los bichos.' : ex === 'superman' ? 'Extra: aguanta arriba y la bola de energía crece.'
    : (typeof DEEP_EX !== 'undefined' && DEEP_EX.includes(ex)) || ex === 'pushup' ? 'Extra: aguanta abajo y el disparo carga ×2, ×3, ×4.' : typeof settings !== 'undefined' && settings.perks ? 'Extra: entre oleadas eliges una mejora.' : '';
  else if (mode === 'arcs') extra = 'Extra: 10 seguidos sin fallo, fiebre (puntos ×2).';
  else if (mode === 'bars') extra = ex === 'hang' ? 'Extra: aguanta para cerrar el remolino.' : 'Extra: revienta pompas para más puntos.';
  else if (mode === 'touch') extra = 'Extra: vuelve a la postura entre toque y toque.';
  return { perfect, extra };
}

/* ---------- Dibujo ---------- */
const DC = { ink: '#eeeaff', back: '#8e86c0', teal: '#3cf0c6', pink: '#ff4fa3', gold: '#ffd166', red: '#ff3b5c', bg0: '#16112c', bg1: '#0b0818', floor: '#2f2853' };
function demoInfo(ex, mode) {
  const D = DEMO[ex] || DEMO.squat;
  const foesKind = mode === 'combat' ? (D.lowFly ? 'flyers' : D.spider ? 'spider' : typeof foes === 'function' ? foes() : 'robots') : null;
  let what;
  if (mode === 'arcs') what = 'Agáchate a tiempo para que el arco pase por encima de la cabeza.';
  else if (mode === 'bars') what = ex === 'hang' ? '' : 'Cada subida revienta con la cabeza la pompa que espera arriba.';
  else if (mode === 'touch') what = 'Mete la cabeza por el hueco del aro cuando llegue.';
  else {
    const sw = typeof swordSet === 'function' && swordSet(), pist = typeof pistolOn === 'function' && pistolOn();
    const foe = foesKind === 'flyers' ? 'al volador' : foesKind === 'spider' ? 'a la araña' : foesKind === 'mix' ? 'al enemigo' : D.tiny ? 'a la araña' : 'al robot';
    what = sw ? `Con la espada, corta ${foe} con un tajo amplio al subir.` : pist ? `Cada repetición carga la pistola: dispara ${foe} con el gatillo.` : `Cada repetición lanza un rayo ${foe} más cercano.`;
  }
  return { D, foesKind, what, tips: demoTips(ex, mode) };
}
function demoDraw(c, W, H, ex, mode, t) {
  const { D, foesKind, what } = demoInfo(ex, mode);
  const P = D.P, cyc = Math.floor(t / P), u = (t % P) / P;
  const fires = Array.isArray(D.fire) ? D.fire : [D.fire], lows = Array.isArray(D.low) ? D.low : D.low != null ? [D.low] : fires;
  const srcs = Array.isArray(D.src) ? D.src : fires.map(() => D.src || 'chest');
  c.save(); c.clearRect(0, 0, W, H);
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, DC.bg0); g.addColorStop(1, DC.bg1); c.fillStyle = g; rr(c, 0, 0, W, H, Math.round(H * 0.06)); c.fill();
  c.lineWidth = Math.max(2, H * 0.008); c.strokeStyle = 'rgba(60,240,198,.55)'; rr(c, 2, 2, W - 4, H - 4, Math.round(H * 0.06)); c.stroke();
  // escena arriba, texto abajo
  const capH = H * 0.32, sH = H - capH, high = D.door || (mode === 'bars' && ex === 'row') ? 2.5 : D.high || 2.05, s = sH / high, fy = sH * 0.94;
  const X = x => W * (D.keys[0][1].hip[0] < -0.3 ? 0.42 : 0.3) + x * s, Y = y => fy - y * s;
  c.strokeStyle = DC.floor; c.lineWidth = 3; c.beginPath(); c.moveTo(W * 0.04, fy); c.lineTo(W * 0.96, fy); c.stroke();
  const pose = demoPose(D, u), J = demoJoints(pose), lw = Math.max(3, s * 0.045);
  if (D.prints) D.prints.forEach((x, i) => { // huellas en el suelo, una pareja por sitio: se iluminan las que ya tocaste
    const lit = u >= [0.18, 0.27, 0.35][i] - 0.02 && u < [0.9, 0.82, 0.74][i]; c.fillStyle = lit ? 'rgba(255,154,60,.95)' : 'rgba(74,168,255,.6)';
    c.beginPath(); c.ellipse(X(x), fy + 2, s * 0.07, s * 0.022, 0, 0, TAU); c.fill();
  });
  // aparatos
  c.lineCap = 'round'; c.lineJoin = 'round';
  if (D.chair) { c.strokeStyle = '#6d6699'; c.lineWidth = lw * 0.8; c.beginPath(); c.moveTo(X(-0.11), Y(0.45)); c.lineTo(X(-0.55), Y(0.45)); c.moveTo(X(-0.14), Y(0.45)); c.lineTo(X(-0.14), Y(0)); c.moveTo(X(-0.52), Y(0.45)); c.lineTo(X(-0.52), Y(0)); c.moveTo(X(-0.55), Y(0.45)); c.lineTo(X(-0.57), Y(0.9)); c.stroke(); }
  if (D.dip) { const bx = D.dipX || 0.05; c.fillStyle = '#6d6699'; c.beginPath(); c.arc(X(bx), Y(D.dip), lw * 0.9, 0, TAU); c.fill(); c.strokeStyle = '#6d6699'; c.lineWidth = lw * 0.6; c.beginPath(); c.moveTo(X(bx), Y(D.dip)); c.lineTo(X(bx), Y(0)); c.stroke(); }
  if (D.door) { c.strokeStyle = '#6d6699'; c.lineWidth = lw * 0.8; c.beginPath(); c.moveTo(X(-0.45), Y(D.door)); c.lineTo(X(0.55), Y(D.door)); c.stroke(); if (ex === 'hang') { c.strokeStyle = 'rgba(60,255,138,.5)'; c.lineWidth = 3; c.beginPath(); for (let i = 0; i <= 30; i++) { const x = -0.5 + i / 30, y = 0.03 + 0.02 * Math.sin(i * 1.3 + t * 3); i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y)); } c.stroke(); } }
  // monigote: lo de atrás, más apagado
  const seg = (pts, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(X(pts[0][0]), Y(pts[0][1])); for (let i = 1; i < pts.length; i++) c.lineTo(X(pts[i][0]), Y(pts[i][1])); c.stroke(); };
  const foot = (kn, an, col) => { const dx = an[0] - kn[0], dy = an[1] - kn[1], l = Math.hypot(dx, dy) || 1; seg([an, [an[0] - dy / l * 0.1, an[1] + dx / l * 0.1]], col, lw * 0.85); }; // la punta, hacia delante
  if (D.custom === 'twist') demoTwist(c, X, Y, s, u, lw);
  else {
    seg([J.hip, ...J.legB], DC.back, lw); foot(...J.legB, DC.back); seg([J.sh, ...J.armB], DC.back, lw * 0.85);
    seg([J.hip, J.neck], DC.ink, lw * 1.25);
    c.fillStyle = DC.ink; c.beginPath(); c.arc(X(J.head[0]), Y(J.head[1]), DL.head * s, 0, TAU); c.fill();
    seg([J.hip, ...J.legF], DC.ink, lw); foot(...J.legF, DC.ink); seg([J.sh, ...J.armF], DC.ink, lw * 0.9);
  }
  // pesas en las manos
  const wF = J.armF[1], wB = J.armB[1];
  if (D.custom) { /* el primer plano ya lleva su aparato */ } else {
  if (D.dumb) for (const w of [wB, wF]) { c.fillStyle = DC.gold; c.fillRect(X(w[0]) - s * 0.05, Y(w[1]) - s * 0.03, s * 0.1, s * 0.06); }
  if (D.bar) { c.fillStyle = '#c9c4e8'; c.beginPath(); c.arc(X(wF[0]), Y(wF[1]), s * 0.11, 0, TAU); c.fill(); c.fillStyle = DC.bg1; c.beginPath(); c.arc(X(wF[0]), Y(wF[1]), s * 0.03, 0, TAU); c.fill(); }
  if (D.kb) { c.fillStyle = DC.gold; c.beginPath(); const dx = wF[0] - J.sh[0], dy = wF[1] - J.sh[1], l = Math.hypot(dx, dy) || 1; c.arc(X(wF[0] + dx / l * 0.08), Y(wF[1] + dy / l * 0.08), s * 0.075, 0, TAU); c.fill(); }
  if (mode === 'combat' && typeof swordSet === 'function' && swordSet() && !D.tiny) { // la espada, siguiendo el antebrazo
    const e = J.armF[0], dx = wF[0] - e[0], dy = wF[1] - e[1], l = Math.hypot(dx, dy) || 1;
    c.strokeStyle = settings.swordKind === 'laser' ? DC.teal : '#d8dcff'; c.lineWidth = lw * 0.7; c.beginPath(); c.moveTo(X(wF[0]), Y(wF[1])); c.lineTo(X(wF[0] + dx / l * 0.6), Y(wF[1] + dy / l * 0.6)); c.stroke();
  }
  if (D.ball) { c.fillStyle = DC.gold; c.beginPath(); c.arc(X(wF[0]), Y(wF[1]), s * 0.08, 0, TAU); c.fill(); }
  }
  // objetivo: dónde está, cuándo cae
  const fi = fires.findIndex(f => f >= 0 && u >= f && u < f + 0.22), lastFire = fires.filter(f => f >= 0 && f <= u).pop();
  const tgtPose = i => demoJoints(demoPose(D, lows[Math.min(i, lows.length - 1)]));
  // en Toques y Barras el objetivo se alcanza en la postura de esfuerzo (abajo en la sentadilla, arriba en la dominada)
  const ev = mode === 'touch' || mode === 'bars' ? lows : fires, ei = ev.findIndex(f => f >= 0 && u >= f && u < f + 0.22);
  if (mode === 'touch' || mode === 'bars') {
    const i = ev.findIndex(f => u < f + 0.22); if (i >= 0 && ev[i] >= 0) {
      const h = tgtPose(i).head, k = clamp((u - (i ? ev[i - 1] + 0.22 : 0)) / Math.max(0.05, ev[i] - (i ? ev[i - 1] + 0.22 : 0)), 0, 1), popped = u >= ev[i];
      const x = mode === 'bars' ? h[0] + 0.05 : lerp(1.9, h[0], smooth(k)), y = mode === 'bars' ? h[1] + 0.06 : h[1];
      if (!popped) { c.lineWidth = mode === 'touch' ? s * 0.04 : 2; c.strokeStyle = mode === 'touch' ? DC.teal : '#b8a7ff'; c.beginPath(); c.arc(X(x), Y(y), s * (mode === 'touch' ? 0.17 : 0.11), 0, TAU); c.stroke(); if (mode === 'bars') { c.fillStyle = 'rgba(160,200,255,.18)'; c.fill(); } }
      else { const p = (u - ev[i]) / 0.22; c.fillStyle = mode === 'touch' ? DC.teal : '#cfc2ff'; for (let n = 0; n < 10; n++) { const a = n * TAU / 10; c.beginPath(); c.arc(X(x + Math.cos(a) * p * 0.35), Y(y + Math.sin(a) * p * 0.35), s * 0.02 * (1 - p), 0, TAU); c.fill(); } }
    }
  } else if (mode === 'arcs') {
    // el arco llega de frente (visto de lado, la barra es un punto) y pasa sobre la cabeza cuando estás abajo
    const hx = demoJoints(demoPose(D, lows[0])).head[0], k = ((u - (lows[0] + 0.03) + 0.64) % 1 + 1) % 1, bx = hx + 2.3 - k * 3.6, by = demoJoints(demoPose(D, lows[0])).head[1] + 0.15;
    c.fillStyle = 'rgba(255,40,20,.16)'; c.fillRect(X(bx) - s * 0.03, Y(2.0), s * 0.06, Y(by) - Y(2.0));
    c.shadowColor = DC.red; c.shadowBlur = 16; c.fillStyle = '#ffb0a0'; c.beginPath(); c.arc(X(bx), Y(by), s * 0.045, 0, TAU); c.fill();
    c.strokeStyle = DC.red; c.lineWidth = 3; c.beginPath(); c.arc(X(bx), Y(by), s * 0.07, 0, TAU); c.stroke(); c.shadowBlur = 0;
  } else if (mode === 'combat') {
    // un enemigo entra por la derecha y cae con la repetición
    const fl = foesKind === 'flyers' || (foesKind === 'mix' && cyc % 2 === 1), sp = D.tiny || foesKind === 'spider';
    const prev = fires.filter(f => f >= 0 && f <= u).length, nxt = fires.find(f => f > u);
    const startU = prev ? fires[prev - 1] + 0.22 : 0, endU = nxt != null ? nxt : 1 + (fires[0] >= 0 ? fires[0] : 0);
    const k = clamp((u - startU) / Math.max(0.05, endU - startU), 0, 1), ex_ = sp ? 0.85 : fl ? 1.25 : 1.55;
    const ePos = [lerp(2.6, ex_, k), sp ? 0.05 : fl ? (D.lowFly ? 0.55 : 1.45) : 0];
    if (fi < 0) drawFoe(c, X, Y, s, ePos, fl ? 'flyer' : sp ? 'spider' : 'robot', t);
    if (fi >= 0) { // rayo y explosión
      const p = (u - fires[fi]) / 0.22, kp = [lerp(2.6, ex_, 1), ePos[1]], src = srcs[fi] || 'chest';
      const o = src === 'bar' ? [0.05 * TW_Z, 0.75 + (1.12 - 0.75) * TW_Z] : src === 'chest' ? [J.neck[0] + 0.18, J.neck[1] - 0.18] : (src === 'armB' ? J.armB[1] : J.armF[1]);
      const tgt = [kp[0], kp[1] + (fl ? 0 : sp ? 0.04 : 0.45)];
      if (typeof swordSet === 'function' && swordSet() && !fl && !sp) { c.strokeStyle = '#d8dcff'; c.lineWidth = s * 0.04; c.beginPath(); c.arc(X(o[0]), Y(o[1]), s * 0.55, -1.2, 0.9); c.stroke(); }
      else if (p < 0.6) demoBolt(c, X(o[0]), Y(o[1]), X(tgt[0]), Y(tgt[1]), cyc * 7 + fi);
      c.fillStyle = DC.gold; for (let n = 0; n < 12; n++) { const a = n * TAU / 12 + cyc, r = p * 0.4; c.globalAlpha = 1 - p; c.beginPath(); c.arc(X(tgt[0] + Math.cos(a) * r), Y(tgt[1] + Math.sin(a) * r), s * 0.03, 0, TAU); c.fill(); }
      c.globalAlpha = 1;
    }
  }
  // en Toques y Barras, el destello del acierto
  if ((mode === 'touch' || mode === 'bars') && ei >= 0) { const h = tgtPose(ei).head; c.strokeStyle = DC.gold; c.lineWidth = 3; c.globalAlpha = 1 - (u - ev[ei]) / 0.22; c.beginPath(); c.arc(X(h[0]), Y(h[1]), s * 0.25, 0, TAU); c.stroke(); c.globalAlpha = 1; }
  if (ex === 'hang') { c.fillStyle = DC.gold; c.font = `700 ${Math.round(sH * 0.12)}px ${FD}`; c.textAlign = 'right'; c.textBaseline = 'top'; c.fillText(`${Math.floor(t % 30)} s`, W * 0.94, sH * 0.06); }
  // texto
  c.textAlign = 'left'; c.textBaseline = 'top';
  const tx = W * 0.05, tw = W * 0.9; let ty = sH + capH * 0.02;
  c.fillStyle = DC.teal; c.font = `${Math.round(capH * 0.22)}px ${FD}`; fitFont(c, `${EX_NAMES[ex] || ex}${MODE_NAMES[mode] ? ' · ' + MODE_NAMES[mode] : ''}`, tw, Math.round(capH * 0.22), '%px ' + FD); c.fillText(`${EX_NAMES[ex] || ex}${MODE_NAMES[mode] ? ' · ' + MODE_NAMES[mode] : ''}`, tx, ty);
  ty += capH * 0.27;
  const fs = Math.round(capH * 0.145); c.font = `500 ${fs}px ${FB}`; c.fillStyle = DC.ink;
  const desc = mode === 'combat' ? D.desc : D.desc.split(/(?<=\.) /).filter(x => !/dispar/i.test(x)).join(' ').replace(/[:,] [^.:,]*dispar[^.]*\./i, '.');
  // lo que se hace (su primera frase), cómo sale PERFECTA y el extra del ejercicio: breve, una línea cada cosa
  const T = demoTips(ex, mode), first = mode !== 'combat' && what ? what : desc.split(/(?<=\.) /)[0];
  for (const [txt, col, n] of [[first, DC.ink, T.extra ? 1 : 2], [T.perfect, DC.teal, 1], [T.extra, DC.gold, 1]]) {
    if (!txt) continue; c.fillStyle = col; const L = demoWrap(c, txt, tw); L.slice(0, n).forEach((line, k) => { if (k === n - 1 && L.length > n) line = line.replace(/\s*\S*$/, '…'); c.fillText(line, tx, ty); ty += fs * 1.16; });
  }
  c.restore();
}
function demoWrap(c, text, w) { const out = []; let line = ''; for (const word of text.split(' ')) { const tr = line ? line + ' ' + word : word; if (c.measureText(tr).width > w && line) { out.push(line); line = word; } else line = tr; } if (line) out.push(line); return out; }
// Rayo quebrado con brillo
function demoBolt(c, x0, y0, x1, y1, seed) {
  let r = seed * 9301 + 49297; const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280 - 0.5; };
  const n = 9, pts = []; for (let i = 0; i <= n; i++) { const k = i / n, j = i && i < n ? 1 : 0; pts.push([x0 + (x1 - x0) * k + rnd() * 26 * j, y0 + (y1 - y0) * k + rnd() * 26 * j]); }
  c.save(); c.shadowColor = DC.teal; c.shadowBlur = 16;
  for (const [col, w] of [['rgba(60,240,198,.5)', 9], ['#e8fffa', 3]]) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke(); }
  c.restore();
}
function drawFoe(c, X, Y, s, p, kind, t) {
  c.save();
  if (kind === 'robot') { // robot cuadrado que camina
    const x = p[0], st = Math.sin(t * 8) * 0.06;
    c.strokeStyle = '#9aa0b0'; c.lineWidth = s * 0.05; c.beginPath(); c.moveTo(X(x - 0.06), Y(0.45)); c.lineTo(X(x - 0.06 + st), Y(0)); c.moveTo(X(x + 0.06), Y(0.45)); c.lineTo(X(x + 0.06 - st), Y(0)); c.stroke();
    c.fillStyle = '#5b5f72'; c.fillRect(X(x - 0.17), Y(0.95), s * 0.34, s * 0.5); c.fillStyle = '#7d8296'; c.fillRect(X(x - 0.12), Y(1.13), s * 0.24, s * 0.18);
    c.fillStyle = DC.red; c.shadowColor = DC.red; c.shadowBlur = 10; c.beginPath(); c.arc(X(x - 0.06), Y(1.05), s * 0.03, 0, TAU); c.fill();
  } else if (kind === 'flyer') { // dron con rotores
    const x = p[0], y = p[1] + Math.sin(t * 3) * 0.05;
    c.fillStyle = '#5b5f72'; c.beginPath(); c.ellipse(X(x), Y(y), s * 0.14, s * 0.07, 0, 0, TAU); c.fill();
    c.strokeStyle = '#c9c4e8'; c.lineWidth = 2; for (const dx of [-0.16, 0.16]) { c.beginPath(); c.ellipse(X(x + dx), Y(y + 0.07), s * (0.08 + 0.02 * Math.sin(t * 40)), s * 0.015, 0, 0, TAU); c.stroke(); }
    c.fillStyle = DC.red; c.shadowColor = DC.red; c.shadowBlur = 10; c.beginPath(); c.arc(X(x - 0.08), Y(y), s * 0.025, 0, TAU); c.fill();
  } else { // araña
    const x = p[0];
    c.strokeStyle = '#7d8296'; c.lineWidth = 2; for (let i = 0; i < 4; i++) { const a = 0.4 + i * 0.25 + Math.sin(t * 10 + i) * 0.08; c.beginPath(); c.moveTo(X(x), Y(0.08)); c.lineTo(X(x - Math.cos(a) * 0.16), Y(0.12)); c.lineTo(X(x - Math.cos(a) * 0.22), Y(0)); c.moveTo(X(x), Y(0.08)); c.lineTo(X(x + Math.cos(a) * 0.16), Y(0.12)); c.lineTo(X(x + Math.cos(a) * 0.22), Y(0)); c.stroke(); }
    c.fillStyle = '#4a4e60'; c.beginPath(); c.ellipse(X(x), Y(0.09), s * 0.09, s * 0.06, 0, 0, TAU); c.fill();
    c.fillStyle = DC.red; c.shadowColor = DC.red; c.shadowBlur = 8; c.beginPath(); c.arc(X(x - 0.05), Y(0.1), s * 0.018, 0, TAU); c.fill();
  }
  c.restore();
}

/* ---------- En el juego: junto al menú y mientras esperas ---------- */
const DEMO_W = 0.5, DEMO_H = 0.3;
const DEMOP = (() => { const p = makePanel(DEMO_W, DEMO_H, 640); (p.mesh.material.userData = p.mesh.material.userData || {}).keep = true; return p; })();
const DEMOV = { t: 0, drawT: 0, ex: '', mode: '', meshes: new Set(), head: null };
// Panel que sigue a la cabeza mientras calibras, cuentas atrás, te cuelgas o descansas entre bloques
const DEMO_HS = 1.15, _dmR = new V3(); // (el de la espera, algo más grande: se lee mejor con las gafas)
DEMOV.head = new THREE.Mesh(DEMOP.mesh.geometry, DEMOP.mesh.material); DEMOV.head.visible = false; DEMOV.head.renderOrder = 29; DEMOV.head.scale.setScalar(DEMO_HS); scene.add(DEMOV.head);
// Copia del panel colgada de un menú (a su derecha); se va con el menú al cerrarlo
function demoAttach(m, ex = settings.exercise, mode = settings.mode) {
  if (!settings.demo || !m || !m.group) return;
  const mesh = new THREE.Mesh(DEMOP.mesh.geometry, DEMOP.mesh.material); mesh.renderOrder = RO.widget;
  mesh.scale.setScalar(1.45); // más grande que el menú para que el texto se lea con las gafas
  mesh.position.set(MW / 2 + DEMO_W * mesh.scale.x / 2 + 0.02, (m.H || 0.6) / 2 - DEMO_H * mesh.scale.x / 2, 0); m.group.add(mesh);
  DEMOV.ex = ex; DEMOV.mode = mode; DEMOV.drawT = 0;
}
function demoWaitEx() { const nx = state === 'between' && sesNext(); if (nx) { const b = SES.blocks[nx.i]; return [b.ex, b.mode]; } return [settings.exercise, settings.mode]; }
function updateDemo(dt) {
  DEMOV.t += dt;
  const wait = !!settings.demo && ['calib', 'ready', 'mount', 'between'].includes(state) && !(menu && !menu.wrist) && INTRO.t < 0; // (tras la carátula del duelo)
  let any = wait;
  if (menu && menu.group) menu.group.traverse(o => { if (o.material === DEMOP.mesh.material) any = true; });
  DEMOV.head.visible = wait;
  if (wait) {
    const [ex, mode] = demoWaitEx(); DEMOV.ex = ex; DEMOV.mode = mode;
    // a la derecha del panel del centro (el que dice qué viene: calibración, ¡prepárate!, descanso…), a su altura y girado
    // como él; antes iba por encima y quedaba casi fuera de la vista. Sin ese panel, delante
    let tgt, q;
    if (center.mesh.visible) { q = center.mesh.quaternion; tgt = _dmR.set(1, 0, 0).applyQuaternion(q).multiplyScalar(0.25 * CENTER_SC + DEMO_W * DEMO_HS / 2 + 0.04).add(center.mesh.position); }
    else { q = hudQ(); tgt = hudLocal(_hl.set(0, 0, -1.05), _dmR); }
    if (!DEMOV.head.userData.init) { DEMOV.head.position.copy(tgt); DEMOV.head.quaternion.copy(q); DEMOV.head.userData.init = true; }
    const k = 1 - Math.exp(-dt * 6); DEMOV.head.position.lerp(tgt, k); DEMOV.head.quaternion.slerp(q, k);
  } else DEMOV.head.userData.init = false;
  if (!any) return;
  DEMOV.drawT -= dt; if (DEMOV.drawT > 0) return; DEMOV.drawT = 1 / 12; // basta para que se vea fluido y no pesa en las gafas (cada dibujo se vuelve a subir a la tarjeta)
  demoDraw(DEMOP.ctx, DEMOP.W, DEMOP.H, DEMOV.ex || settings.exercise, DEMOV.mode || settings.mode, DEMOV.t); DEMOP.tex.needsUpdate = true;
}

/* ---------- En la página: bajo los ejercicios ---------- */
function demoPage() {
  const cv = $('#demoCv'); if (!cv || !cv.getContext) return;
  const c = cv.getContext('2d'); let t0 = 0;
  const loop = ts => {
    if (!xrActive && !preview && !document.hidden) { const r = cv.getBoundingClientRect ? cv.getBoundingClientRect() : { top: 0, bottom: 1 }; if (r.bottom > 0 && r.top < (window.innerHeight || 1e4)) demoDraw(c, cv.width, cv.height, settings.exercise, settings.mode, (ts - t0) / 1000); }
    requestAnimationFrame(loop);
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(ts => { t0 = ts; loop(ts); });
}
