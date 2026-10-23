(() => {
'use strict';
const $ = s => document.querySelector(s);
const V3 = THREE.Vector3, Q4 = THREE.Quaternion;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const smooth = t => t * t * (3 - 2 * t);

const EX_NAMES = { squat: 'Sentadillas', lunge: 'Zancadas', pushup: 'Flexiones', inchworm: 'Flexiones inchworm', dips: 'Fondos en silla', curl: 'Curl de bíceps', curl2: 'Curl con barra', twist: 'Antebrazos (barra flexible)', press: 'Press de hombro', press2: 'Press con barra', thruster: 'Sentadilla con press', frontsq: 'Sentadilla con elevación frontal', jsquat: 'Sentadilla con salto', swing: 'Swing con kettlebell', chop: 'Leñador', dlrow: 'Peso muerto', plank1: 'Plancha con un brazo', plankrow: 'Remo en plancha', splank: 'Plancha lateral', superman: 'Superman', row: 'Remo invertido', pullup: 'Dominadas', hang: 'Colgado', jump: 'Saltos', abs: 'Abdominales', combo: 'Combinado', slam: 'Slam' };
const EX_SHORT = { squat: 'Sentadillas', lunge: 'Zancadas', pushup: 'Flexiones', inchworm: 'Inchworm', dips: 'Fondos silla', curl: 'Curl', curl2: 'Curl barra', twist: 'Antebrazos', press: 'Press hombro', press2: 'Press barra', thruster: 'Sent. + press', frontsq: 'Sent. + elev.', jsquat: 'Sent. + salto', swing: 'Swing', chop: 'Leñador', dlrow: 'Peso muerto', plank1: 'Plancha 1 brazo', plankrow: 'Remo plancha', splank: 'Plancha lateral', superman: 'Superman', row: 'Remo invertido', pullup: 'Dominadas', hang: 'Colgado', jump: 'Saltos', abs: 'Abdominales', combo: 'Combinado', slam: 'Slam' };
const MODE_NAMES = { combat: 'Combate', arcs: 'Arcos', bars: 'Barras', touch: 'Toques' };
// Asalto y Enjambre eran dos modos; ahora son Combate con robots o con voladores (para ajustes, sesiones e historial viejos)
const LEGACY_MODES = { walkers: { foes: 'robots', aim: 'auto' }, flyers: { foes: 'flyers', aim: 'hands' } }; // (foes: ver foeCatPatch)
// Enemigos que se pueden elegir, en tres grupos: los que andan y salen de las compuertas, los que salen de las trampillas
// (en las flexiones y las planchas sobre una mano, en el suelo) y los voladores. Cada uno es [clave, nombre]
const FOE_GATE = [['robot', 'Robots'], ['imp', 'Diablillo'], ['puglin', 'Puglin'], ['thrower', 'Lanzador'], ['zombie', 'Zombi'], ['zgreen', 'Zombi verde'], ['zchubby', 'Zombi gordo'], ['raptor', 'Velociraptor'],
  ['skeleton', 'Esqueleto pirata'], ['captain', 'Capitán Barbarroja'], ['sharky', 'Tiburón'], ['mako', 'Tiburón gris'],
  ['demon', 'Demonio'], ['greendemon', 'Demonio verde'], ['cyclops', 'Cíclope'], ['yeti', 'Yeti'], ['skull', 'Calavera'], ['alien', 'Alien'], ['alientall', 'Alien alto']];
const FOE_HATCH = [['spider', 'Arañas'], ['crab', 'Cangrejo'], ['mushroom', 'Seta'], ['skull', 'Calavera']];
const FOE_FLY = [['drone', 'Drones'], ['hornet', 'Avispones'], ['bee', 'Abeja'], ['bat', 'Murciélago'], ['cthulhu', 'Cthulhu'], ['dragon', 'Dragón (jefe)']];
const PIRATE_GATE = ['skeleton', 'captain', 'sharky', 'mako']; // los piratas (Pirate Kit)
const CUTE_GATE = ['demon', 'greendemon', 'cyclops', 'yeti', 'skull', 'alien', 'alientall']; // los monstruitos (Cute Animated Monsters)
// Atajo de antes (y de los bloques de una sesión): solo los de tierra, solo voladores o los dos
const FOE_CATS = [['robots', 'Por tierra'], ['flyers', 'Voladores'], ['mix', 'Mezcla']];
// Los del juego van en «Ajustes» (por pestañas); sonido y entorno tienen su propio submenú; menú y meta son comunes
const GROUP_NAMES = { partida: 'Partida', ejercicio: 'Ejercicio', enemigos: 'Enemigos', armas: 'Armas', cada: 'Cada enemigo', arcos: 'Arcos', toques: 'Toques', barras: 'Barras', sistema: 'Menú y avisos', perfil: 'Tu meta', sonido: 'Sonido y música', entorno: 'Entorno y vista' };
const OWN_MENU = ['sonido', 'entorno']; // grupos con submenú propio (no salen como pestañas de Ajustes)
const GROUP_TAB = { sistema: 'Menú' }; // nombre corto en las pestañas de las gafas
// Qué ejercicios se juegan en cada modo (el primero es el que se elige al cambiar a ese modo)
const MODE_EX = {
  combat: ['squat', 'lunge', 'jsquat', 'pushup', 'inchworm', 'dips', 'curl', 'curl2', 'twist', 'press', 'press2', 'thruster', 'frontsq', 'swing', 'chop', 'dlrow', 'plank1', 'splank', 'superman'], arcs: ['squat'],
  bars: ['row', 'pullup', 'hang'], touch: ['slam', 'jump', 'abs', 'pushup', 'combo'] // (en Toques, sentadillas y zancadas pasan a ser el Slam)
};
// Zonas del cuerpo, para ordenar los ejercicios por lo que trabajan (opcional)
const BODY_ZONES = [
  ['Piernas', ['squat', 'lunge', 'jsquat', 'jump', 'slam']],
  ['Brazos y hombros', ['curl', 'curl2', 'twist', 'press', 'press2', 'dips']],
  ['Pecho', ['pushup', 'inchworm']],
  ['Abdomen y espalda baja', ['abs', 'plank1', 'splank', 'superman', 'chop']],
  ['Espalda y agarre', ['row', 'pullup', 'hang']],
  ['Cuerpo entero', ['thruster', 'frontsq', 'swing', 'dlrow', 'combo']]
];
const exOk = (mode, ex) => !!MODE_EX[mode] && MODE_EX[mode].includes(ex);
const BAR_EX = MODE_EX.bars; // ejercicios del modo Barras: el resto no se usa en él
// Al cambiar de modo, el ejercicio que se queda: el mismo si vale; si estabas en el suelo, flexiones
function exFor(mode, ex) { return exOk(mode, ex) ? ex : ['pushup', 'inchworm', 'plank1', 'plankrow', 'superman', 'abs', 'splank'].includes(ex) && exOk(mode, 'pushup') ? 'pushup' : MODE_EX[mode][0]; }
const modeFor = ex => Object.keys(MODE_EX).find(m => exOk(m, ex));

/* =================== AJUSTES =================== */
// Rangos de dificultad (Ajustes → Partida, o «Rango ▸» del menú principal): cada uno pone de una vez las vidas, lo que
// tardan y cuántos enemigos vienen a la vez, cómo vuelan, la dificultad creciente y el ritmo de los arcos, los toques y los
// objetivos de las barras. El cabo es como venía el juego; los galones (y luego las estrellas) dicen lo difícil que es
const RANKS = [['recluta', 'Recluta'], ['soldado', 'Soldado'], ['cabo', 'Cabo'], ['sargento', 'Sargento'], ['teniente', 'Teniente'], ['capitan', 'Capitán'], ['general', 'General']];
const RANK_VALS = {
  lives: [0, 5, 3, 3, 2, 2, 1], walkTime: [22, 17, 14, 11, 9, 7, 5], maxAlive: [2, 3, 5, 6, 7, 8, 10], flySpeed: [2, 3, 3.5, 4.5, 5.5, 7, 9], erratic: [50, 70, 100, 110, 130, 150, 180],
  ramp: [0, 2, 4, 5, 6, 8, 10], arcSpeed: [4, 5.5, 7, 8.5, 10, 12, 14], arcRate: [8, 10, 12, 15, 18, 22, 26], arcMaxGap: [9, 7, 6, 5, 4, 3.5, 3],
  tchArrive: [4.5, 4, 3, 2.5, 2, 1.5, 1], tchWindow: [2, 1.6, 1.2, 1, 0.9, 0.7, 0.6], tchGap: [3.4, 2.9, 2.4, 2.1, 1.8, 1.5, 1.2], barArrive: [6, 5, 4, 3.5, 3, 2.5, 2], barWait: [0, 16, 12, 10, 8, 6, 4]
};
// Con las piernas (sentadillas, zancadas, peso muerto…): aguantar abajo carga el disparo, y bajar mucho, la recarga profunda
const DEEP_EX = ['squat', 'lunge', 'jsquat', 'thruster', 'frontsq', 'dlrow'];
const SCHEMA = [
  { key: 'rank', g: 'partida', label: 'Rango (dificultad)', short: 'Rango', type: 'choice', grid: 4, badges: true, opts: RANKS, def: 'cabo', relayout: true, hint: 'Pone de una vez la dificultad de todo: vidas, enemigos (cuánto tardan, cuántos a la vez, cómo vuelan), dificultad creciente y el ritmo de arcos, toques y barras. Del recluta (un galón, lo más fácil) al general (tres estrellas). Luego puedes retocar lo que quieras y guardarlo en tu rango.' },
  { key: 'lives', g: 'partida', label: 'Vidas', type: 'num', min: 0, max: 20, step: 1, def: 3, zero: 'Infinitas', hint: '0 = infinitas: los golpes no te eliminan.' },
  { key: 'waves', g: 'partida', label: 'Oleadas', type: 'num', min: 0, max: 50, step: 1, def: 5, zero: 'Sin fin', hint: '0 = oleadas sin fin, con jefe cada 5.' },
  { key: 'repsWave', g: 'partida', noEx: ['hang'], label: 'Repeticiones en la primera oleada', short: 'Reps 1.ª oleada', type: 'num', min: 3, max: 150, step: 1, def: 12, unit: 'reps' },
  { key: 'repsInc', g: 'partida', noEx: ['hang'], label: 'Repeticiones extra en cada oleada', short: 'Reps extra/oleada', type: 'num', min: 0, max: 40, step: 1, def: 3, unit: 'reps' },
  { key: 'hangTime', g: 'partida', label: 'Tiempo colgado en la primera oleada', short: 'Colgado 1.ª oleada', type: 'num', min: 5, max: 300, step: 5, def: 20, unit: 's', ex: ['hang'] },
  { key: 'hangInc', g: 'partida', label: 'Segundos extra colgado en cada oleada', short: 'Segundos extra', type: 'num', min: 0, max: 120, step: 5, def: 5, unit: 's', ex: ['hang'] },
  { key: 'ramp', g: 'partida', label: 'Dificultad creciente', short: 'Dif. creciente', type: 'num', min: 0, max: 15, step: 1, def: 4, unit: '% por oleada', zero: 'No', hint: 'Cada oleada que superas con soltura, la siguiente es algo más difícil: los enemigos (o los arcos, los objetivos…) llegan antes, salen algo más seguidos y algunos más a la vez, sus gestos van más deprisa, hay menos tiempo para tocarlos, y el ejercicio pide algo más de recorrido. Si en una oleada te dan mucho, la siguiente sigue igual. Sube este porcentaje cada vez, hasta un +60 % (el recorrido, como mucho un +24 %). 0 = siempre igual.' },
  { key: 'rest', g: 'partida', label: 'Descanso entre oleadas', short: 'Descanso', type: 'num', min: 0, max: 300, step: 5, def: 20, unit: 's' },

  { key: 'squatDepth', g: 'ejercicio', label: 'Profundidad de la sentadilla', short: 'Prof. sentadilla', type: 'num', min: 8, max: 70, step: 1, def: 26, unit: 'cm', ex: ['squat', 'thruster', 'frontsq', 'jsquat', 'combo'], cond: () => settings.exercise !== 'combo' || settings.comboBase === 'stand', hint: 'Cuánto debe bajar la cabeza para que la repetición cuente.' },
  { key: 'pushDepth', g: 'ejercicio', label: 'Bajada en la flexión', short: 'Bajada flexión', type: 'num', min: 5, max: 35, step: 1, def: 13, unit: 'cm', ex: ['pushup', 'inchworm', 'combo'], cond: () => settings.exercise !== 'combo' || settings.comboBase === 'floor' },
  { key: 'iwReach', g: 'ejercicio', label: 'De los pies a las manos en la plancha (inchworm)', short: 'Plancha', type: 'num', min: 0, max: 200, step: 5, def: 0, unit: 'cm', zero: 'según tu altura', ex: ['inchworm'], hint: 'Dónde salen las dos últimas huellas, las de la flexión, contando desde tus pies. 0 = según tu altura.' },
  { key: 'lungeDepth', g: 'ejercicio', label: 'Bajada en la zancada', short: 'Bajada zancada', type: 'num', min: 10, max: 60, step: 1, def: 28, unit: 'cm', ex: ['lunge', 'combo'], cond: () => settings.exercise !== 'combo' || settings.comboBase === 'stand', hint: 'Cuánto debe bajar la cabeza al flexionar las dos rodillas (la de atrás casi tocando el suelo).' },
  { key: 'dipDepth', g: 'ejercicio', label: 'Bajada en el fondo', short: 'Bajada fondo', type: 'num', min: 6, max: 40, step: 1, def: 15, unit: 'cm', ex: ['dips'], hint: 'Cuánto debe bajar la cabeza al doblar los codos, con las manos en el borde de la silla.' },
  { key: 'pressRange', g: 'ejercicio', label: 'Recorrido del press', short: 'Recorrido press', type: 'num', min: 15, max: 60, step: 1, def: 32, unit: 'cm', ex: ['press', 'press2'], hint: 'Cuánto deben subir las manos desde los hombros. Con mancuernas cada brazo dispara al llegar arriba; con barra, los dos a la vez.' },
  { key: 'thrUp', g: 'ejercicio', label: 'Manos por encima de los ojos en la sentadilla con press', short: 'Manos arriba', type: 'num', min: 5, max: 50, step: 1, def: 20, unit: 'cm', ex: ['thruster'], hint: 'Al volver de la sentadilla, las dos manos (con la kettlebell, la barra o las mancuernas) tienen que subir esto por encima de los ojos para disparar.' },
  { key: 'swingDrop', g: 'ejercicio', label: 'Bajada de la cabeza en el swing', short: 'Bajada swing', type: 'num', min: 6, max: 45, step: 1, def: 15, unit: 'cm', ex: ['swing'], hint: 'Cuánto baja la cabeza al llevar la cadera atrás con la espalda recta: eso carga. Al subir, la kettlebell al frente a la altura del pecho dispara.' },
  { key: 'dlDepth', g: 'ejercicio', label: 'Bajada del peso muerto', short: 'Bajada p. muerto', type: 'num', min: 15, max: 80, step: 1, def: 28, unit: 'cm', ex: ['dlrow'], hint: 'Cuánto baja la cabeza al llevar el peso hacia el suelo (cadera atrás, espalda recta). Eso carga; tirar de los codos hacia atrás (remo) dispara en ese momento, de pie o aún inclinado.' },
  { key: 'jsqJump', g: 'ejercicio', label: 'Altura del salto', short: 'Salto', type: 'num', min: 3, max: 40, step: 1, def: 8, unit: 'cm', ex: ['jsquat'], hint: 'Cuánto sube la cabeza por encima de tu altura de pie al saltar, y deprisa: ponerse de puntillas despacio no vale.' },
  { key: 'splHold', g: 'ejercicio', label: 'Segundos de plancha lateral por disparo', short: 'Segundos', type: 'num', min: 1, max: 15, step: 0.5, def: 3, unit: 's', ex: ['splank'], hint: 'Cada vez que aguantas este tiempo con la cadera arriba, disparas.' },
  { key: 'splDrop', g: 'ejercicio', label: 'Bajada de cadera que corta el aguante', short: 'Tolerancia', type: 'num', min: 4, max: 25, step: 1, def: 9, unit: 'cm', ex: ['splank'], hint: 'Si la cabeza baja esto desde tu postura, la cadera ha caído y el tiempo vuelve a empezar.' },
  { key: 'twistDeg', g: 'ejercicio', label: 'Giro de cada mano (barra flexible)', short: 'Giro muñecas', type: 'num', min: 30, max: 120, step: 5, def: 70, unit: '°', ex: ['twist'], hint: 'Cuánto debe girar cada mano, en sentido contrario a la otra, para que cuente un giro. Un giro carga y el siguiente, al revés, dispara.' },
  { key: 'curlRange', g: 'ejercicio', label: 'Recorrido del curl', short: 'Recorrido curl', type: 'num', min: 10, max: 50, step: 1, def: 27, unit: 'cm', ex: ['curl', 'curl2'], hint: 'Cuánto debe subir la muñeca (con barra, las dos a la vez).' },
  { key: 'rowRange', g: 'ejercicio', label: 'Subida en el remo invertido', short: 'Subida remo', type: 'num', min: 10, max: 70, step: 1, def: 30, unit: 'cm', ex: ['row'], hint: 'Cuánto debe subir la cabeza desde los brazos estirados.' },
  { key: 'pullRange', g: 'ejercicio', label: 'Subida en la dominada', short: 'Subida dominada', type: 'num', min: 10, max: 70, step: 1, def: 35, unit: 'cm', ex: ['pullup'], hint: 'Cuánto debe subir la cabeza desde colgado con los brazos estirados.' },
  { key: 'supRange', g: 'ejercicio', label: 'Elevación del tronco en el superman', short: 'Elevación', type: 'num', min: 4, max: 35, step: 1, def: 8, unit: 'cm', ex: ['superman'], hint: 'Cuánto debe subir la cabeza desde tumbado boca abajo. Si no dispara, bájalo: el juego te dice cuánto subiste.' },
  { key: 'supArms', g: 'ejercicio', label: 'Comprobar los brazos estirados', short: 'Brazos estirados', type: 'choice', opts: [['yes', 'Sí'], ['no', 'No']], def: 'yes', ex: ['superman'], hint: 'Con Sí, el tiempo arriba se para si recoges las manos junto a la cabeza.' },
  { key: 'supHold', g: 'ejercicio', label: 'Segundos arriba para disparar', short: 'Segundos arriba', type: 'num', min: 0.5, max: 10, step: 0.5, def: 2, unit: 's', ex: ['superman'], hint: 'Tienes que mantener el tronco elevado, con los brazos estirados, este tiempo.' },
  { key: 'deepDrop', g: 'ejercicio', label: 'Recarga profunda: bajada extra', short: 'Recarga profunda', type: 'num', min: 0, max: 40, step: 1, def: 15, unit: 'cm', zero: 'No', modes: ['combat'], ex: DEEP_EX, hint: 'Si bajas esto más de lo que pide el ejercicio, el disparo se carga al máximo (×4) al instante, sin tener que aguantar abajo. 0: sin recarga profunda.' },
  { key: 'perfectTime', g: 'ejercicio', noEx: ['hang', 'superman'], cond: () => settings.mode !== 'touch', label: 'Duración mínima de una PERFECTA', short: 'Tiempo PERFECTA', type: 'num', min: 0, max: 6, step: 0.1, def: 1.2, unit: 's', hint: '0 = solo cuenta la profundidad. En curl se exige la mitad.' },

  { key: 'walkTime', g: 'enemigos', label: 'Tiempo que tarda un enemigo en alcanzarte', short: 'Tiempo llegada', type: 'num', min: 3, max: 120, step: 1, def: 14, unit: 's', modes: ['combat'], cond: () => foesHas('robots') },
  { key: 'pace_robot', g: 'cada', label: 'Robots: rapidez de gestos', short: 'Gestos robots', type: 'num', min: 50, max: 250, step: 10, def: 150, unit: '%', modes: ['combat'], cond: () => foeOn('robot'), hint: 'Lo rápidos que son sus gestos: salir de la compuerta, amenazarte, preparar y dar el golpe, retroceder, encajar tus disparos, girarse, los espasmos y las esquivas (al 250 %, un golpe entero dura menos de la mitad). No cambia lo deprisa que se desplazan. Los golpes que se paran con la espada se preparan como mucho un 30 % más deprisa.' },
  { key: 'spd_robot', g: 'cada', label: 'Robots: velocidad al desplazarse', short: 'Velocidad robots', type: 'num', min: 100, max: 300, step: 10, def: 100, unit: '%', modes: ['combat'], cond: () => foeOn('robot'), hint: '100 %: van a la velocidad justa para llegar cuando pide «Tiempo llegada», sin pararse. Más: se desplazan más deprisa (también al salir de la compuerta) pero llegan igual: lo que les sobra lo gastan en zigzags o en paradas en guardia, según su forma de moverse.' },
  { key: 'move_robot', g: 'cada', label: 'Robots: forma de moverse', short: 'Movim. robots', type: 'multi', opts: [['straight', 'Recto'], ['zigzag', 'Zigzag'], ['bursts', 'A rachas'], ['dodge', 'Esquivas']], def: 'zigzag,bursts,dodge', modes: ['combat'], cond: () => foeOn('robot'), hint: 'Cada uno elige una de las marcadas. Recto: va derecho (si va más deprisa de lo justo, se para de vez en cuando). Zigzag: de lado a lado. A rachas: avanza deprisa y se para a amenazarte. Esquivas: se aparta de golpe (los monstruos, con una voltereta) cuando le das o cuando le toca.' },
  { key: 'pace_beast', g: 'cada', label: 'Diablillo y Puglin: rapidez de gestos', short: 'Gestos diablillo', type: 'num', min: 50, max: 250, step: 10, def: 150, unit: '%', modes: ['combat'], cond: () => foeOn('imp', 'puglin', 'thrower'), hint: 'Lo rápidos que son sus gestos: salir de la compuerta, amenazarte, preparar y dar el golpe, retroceder, encajar tus disparos, girarse, los espasmos y las esquivas (al 250 %, un golpe entero dura menos de la mitad). No cambia lo deprisa que se desplazan. Los golpes que se paran con la espada se preparan como mucho un 30 % más deprisa.' },
  { key: 'spd_beast', g: 'cada', label: 'Diablillo y Puglin: velocidad al desplazarse', short: 'Velocidad diablillo', type: 'num', min: 100, max: 300, step: 10, def: 100, unit: '%', modes: ['combat'], cond: () => foeOn('imp', 'puglin', 'thrower'), hint: '100 %: van a la velocidad justa para llegar cuando pide «Tiempo llegada», sin pararse. Más: se desplazan más deprisa (también al salir de la compuerta) pero llegan igual: lo que les sobra lo gastan en zigzags o en paradas en guardia, según su forma de moverse.' },
  { key: 'move_beast', g: 'cada', label: 'Diablillo y Puglin: forma de moverse', short: 'Movim. diablillo', type: 'multi', opts: [['straight', 'Recto'], ['zigzag', 'Zigzag'], ['bursts', 'A rachas'], ['dodge', 'Esquivas']], def: 'zigzag,bursts,dodge', modes: ['combat'], cond: () => foeOn('imp', 'puglin', 'thrower'), hint: 'Cada uno elige una de las marcadas. Recto: va derecho (si va más deprisa de lo justo, se para de vez en cuando). Zigzag: de lado a lado. A rachas: avanza deprisa y se para a amenazarte. Esquivas: se aparta de golpe (los monstruos, con una voltereta) cuando le das o cuando le toca.' },
  { key: 'pace_zombie', g: 'cada', label: 'Zombis: rapidez de gestos', short: 'Gestos zombis', type: 'num', min: 50, max: 250, step: 10, def: 150, unit: '%', modes: ['combat'], cond: () => foeOn('zombie', 'zgreen', 'zchubby'), hint: 'Lo rápidos que son sus gestos: salir de la compuerta, amenazarte, preparar y dar el golpe, retroceder, encajar tus disparos, girarse, los espasmos y las esquivas (al 250 %, un golpe entero dura menos de la mitad). No cambia lo deprisa que se desplazan. Los golpes que se paran con la espada se preparan como mucho un 30 % más deprisa.' },
  { key: 'spd_zombie', g: 'cada', label: 'Zombis: velocidad al desplazarse', short: 'Velocidad zombis', type: 'num', min: 100, max: 300, step: 10, def: 100, unit: '%', modes: ['combat'], cond: () => foeOn('zombie', 'zgreen', 'zchubby'), hint: '100 %: van a la velocidad justa para llegar cuando pide «Tiempo llegada», sin pararse. Más: se desplazan más deprisa (también al salir de la compuerta) pero llegan igual: lo que les sobra lo gastan en zigzags o en paradas en guardia, según su forma de moverse.' },
  { key: 'move_zombie', g: 'cada', label: 'Zombis: forma de moverse', short: 'Movim. zombis', type: 'multi', opts: [['straight', 'Recto'], ['zigzag', 'Zigzag'], ['bursts', 'A rachas'], ['dodge', 'Esquivas']], def: 'straight,zigzag', modes: ['combat'], cond: () => foeOn('zombie', 'zgreen', 'zchubby'), hint: 'Cada uno elige una de las marcadas. Recto: va derecho (si va más deprisa de lo justo, se para de vez en cuando). Zigzag: de lado a lado. A rachas: avanza deprisa y se para a amenazarte. Esquivas: se aparta de golpe (los monstruos, con una voltereta) cuando le das o cuando le toca.' },
  { key: 'pace_dino', g: 'cada', label: 'Velociraptores: rapidez de gestos', short: 'Gestos raptores', type: 'num', min: 50, max: 250, step: 10, def: 150, unit: '%', modes: ['combat'], cond: () => foeOn('raptor'), hint: 'Lo rápidos que son sus gestos: salir de la compuerta, amenazarte, preparar y dar el golpe, retroceder, encajar tus disparos, girarse, los espasmos y las esquivas (al 250 %, un golpe entero dura menos de la mitad). No cambia lo deprisa que se desplazan. Los golpes que se paran con la espada se preparan como mucho un 30 % más deprisa.' },
  { key: 'spd_dino', g: 'cada', label: 'Velociraptores: velocidad al desplazarse', short: 'Velocidad raptores', type: 'num', min: 100, max: 300, step: 10, def: 100, unit: '%', modes: ['combat'], cond: () => foeOn('raptor'), hint: '100 %: van a la velocidad justa para llegar cuando pide «Tiempo llegada», sin pararse. Más: se desplazan más deprisa (también al salir de la compuerta) pero llegan igual: lo que les sobra lo gastan en zigzags o en paradas en guardia, según su forma de moverse.' },
  { key: 'move_dino', g: 'cada', label: 'Velociraptores: forma de moverse', short: 'Movim. raptores', type: 'multi', opts: [['straight', 'Recto'], ['zigzag', 'Zigzag'], ['bursts', 'A rachas'], ['dodge', 'Esquivas']], def: 'straight,zigzag,bursts', modes: ['combat'], cond: () => foeOn('raptor'), hint: 'Cada uno elige una de las marcadas. Recto: va derecho (si va más deprisa de lo justo, se para de vez en cuando). Zigzag: de lado a lado. A rachas: avanza deprisa y se para a amenazarte. Esquivas: se aparta de golpe (los monstruos, con una voltereta) cuando le das o cuando le toca.' },
  { key: 'pace_cute', g: 'cada', label: 'Monstruitos: rapidez de gestos', short: 'Gestos monstruitos', type: 'num', min: 50, max: 250, step: 10, def: 150, unit: '%', modes: ['combat'], cond: () => foeOn(...CUTE_GATE), hint: 'Lo rápidos que son sus gestos: salir de la compuerta, amenazarte, preparar y dar el golpe, retroceder, encajar tus disparos, girarse, los espasmos y las esquivas (al 250 %, un golpe entero dura menos de la mitad). No cambia lo deprisa que se desplazan. Los golpes que se paran con la espada se preparan como mucho un 30 % más deprisa.' },
  { key: 'spd_cute', g: 'cada', label: 'Monstruitos: velocidad al desplazarse', short: 'Velocidad monstruitos', type: 'num', min: 100, max: 300, step: 10, def: 100, unit: '%', modes: ['combat'], cond: () => foeOn(...CUTE_GATE), hint: '100 %: van a la velocidad justa para llegar cuando pide «Tiempo llegada», sin pararse. Más: se desplazan más deprisa (también al salir de la compuerta) pero llegan igual: lo que les sobra lo gastan en zigzags o en paradas en guardia, según su forma de moverse.' },
  { key: 'move_cute', g: 'cada', label: 'Monstruitos: forma de moverse', short: 'Movim. monstruitos', type: 'multi', opts: [['straight', 'Recto'], ['zigzag', 'Zigzag'], ['bursts', 'A rachas'], ['dodge', 'Esquivas']], def: 'straight,zigzag,bursts', modes: ['combat'], cond: () => foeOn(...CUTE_GATE), hint: 'Cada uno elige una de las marcadas. Recto: va derecho (si va más deprisa de lo justo, se para de vez en cuando). Zigzag: de lado a lado. A rachas: avanza deprisa y se para a amenazarte. Esquivas: se aparta de golpe (los monstruos, con una voltereta) cuando le das o cuando le toca.' },
  { key: 'pace_pirate', g: 'cada', label: 'Piratas: rapidez de gestos', short: 'Gestos piratas', type: 'num', min: 50, max: 250, step: 10, def: 150, unit: '%', modes: ['combat'], cond: () => foeOn(...PIRATE_GATE), hint: 'Lo rápidos que son sus gestos: salir de la compuerta, amenazarte, preparar y dar el golpe, retroceder, encajar tus disparos, girarse, los espasmos y las esquivas (al 250 %, un golpe entero dura menos de la mitad). No cambia lo deprisa que se desplazan. Los golpes que se paran con la espada se preparan como mucho un 30 % más deprisa.' },
  { key: 'spd_pirate', g: 'cada', label: 'Piratas: velocidad al desplazarse', short: 'Velocidad piratas', type: 'num', min: 100, max: 300, step: 10, def: 100, unit: '%', modes: ['combat'], cond: () => foeOn(...PIRATE_GATE), hint: '100 %: van a la velocidad justa para llegar cuando pide «Tiempo llegada», sin pararse. Más: se desplazan más deprisa (también al salir de la compuerta) pero llegan igual: lo que les sobra lo gastan en zigzags o en paradas en guardia, según su forma de moverse.' },
  { key: 'move_pirate', g: 'cada', label: 'Piratas: forma de moverse', short: 'Movim. piratas', type: 'multi', opts: [['straight', 'Recto'], ['zigzag', 'Zigzag'], ['bursts', 'A rachas'], ['dodge', 'Esquivas']], def: 'straight,zigzag,bursts', modes: ['combat'], cond: () => foeOn(...PIRATE_GATE), hint: 'Cada uno elige una de las marcadas. Recto: va derecho (si va más deprisa de lo justo, se para de vez en cuando). Zigzag: de lado a lado. A rachas: avanza deprisa y se para a amenazarte. Esquivas: se aparta de golpe (los monstruos, con una voltereta) cuando le das o cuando le toca.' },
  { key: 'flySpeed', g: 'enemigos', label: 'Velocidad de vuelo', short: 'Vel. vuelo', type: 'num', min: 0.5, max: 20, step: 0.5, def: 3.5, unit: 'km/h', modes: ['combat'], cond: () => foesHas('flyers'), hint: 'En flexiones los bichos van a escala, unas 4 veces más lentos.' },
  { key: 'erratic', g: 'enemigos', label: 'Vuelo errático', short: 'Errático', type: 'num', min: 0, max: 200, step: 10, def: 100, unit: '%', modes: ['combat'], cond: () => foesHas('flyers') },
  { key: 'maxAlive', g: 'enemigos', label: 'Enemigos a la vez como máximo', short: 'Máx. a la vez', type: 'num', min: 1, max: 15, step: 1, def: 5, modes: ['combat'], hint: 'Bájalo si el juego va a tirones.' },
  { key: 'spawnGap', g: 'enemigos', label: 'Segundos entre apariciones', short: 'Entre apariciones', type: 'num', min: 0, max: 20, step: 0.5, def: 0, unit: 's', zero: 'Auto', modes: ['combat'] },
  { key: 'tchArrive', g: 'toques', label: 'Tiempo que tardan en llegar', short: 'Llegada', type: 'num', min: 1, max: 8, step: 0.5, def: 3, unit: 's', modes: ['touch'], hint: 'Desde que aparecen al fondo hasta que llegan a ti. Menos = más rápidos.' },
  { key: 'tchWindow', g: 'toques', label: 'Tiempo para tocarlos', short: 'Para tocar', type: 'num', min: 0.4, max: 3, step: 0.1, def: 1.2, unit: 's', modes: ['touch'], hint: 'Lo que esperan quietos delante de ti antes de pasar de largo.' },
  { key: 'tchGap', g: 'toques', label: 'Separación entre objetivos', short: 'Separación', type: 'num', min: 0.8, max: 6, step: 0.1, def: 2.4, unit: 's', modes: ['touch'], hint: 'Con ritmo (BPM), se redondea a pulsos enteros.' },
  { key: 'tchHands', g: 'toques', label: 'Diamantes para las manos', short: 'Diamantes', type: 'num', min: 0, max: 100, step: 10, def: 30, unit: '%', modes: ['touch'], noEx: ['combo', 'pushup'], hint: 'Parte de los objetivos que se tocan con la mano (diamantes: azul la izquierda, naranja la derecha). El resto son amebas para la cabeza.' },
  { key: 'tchPushLo', g: 'toques', label: 'Flexiones: altura mínima de las amebas', short: 'Ameba más baja', type: 'num', min: 0, max: 80, step: 1, def: 0, unit: 'cm', zero: 'según la bajada', modes: ['touch'], ex: ['pushup'], hint: 'Lo más cerca del suelo que puede llegar una ameba (altura de su centro sobre el suelo). 0 = según la «Bajada en la flexión».' },
  { key: 'tchPushHi', g: 'toques', label: 'Flexiones: altura máxima de las amebas', short: 'Ameba más alta', type: 'num', min: 0, max: 80, step: 1, def: 0, unit: 'cm', zero: 'según la bajada', modes: ['touch'], ex: ['pushup'], hint: 'Lo más alto que puede llegar una ameba. Siempre queda algo por debajo de tu cabeza en plancha, para que haya que bajar. 0 = según la «Bajada en la flexión».' },
  { key: 'tchRing', g: 'toques', label: 'Tamaño del hueco de las amebas', short: 'Amebas', type: 'num', min: 8, max: 30, step: 1, def: 15, unit: 'cm', modes: ['touch'], hint: 'Radio del hueco por el que pasa la cabeza (en flexiones, algo menos).' },
  { key: 'jumpHeight', g: 'toques', label: 'Altura del salto', short: 'Salto', type: 'num', min: 3, max: 40, step: 1, def: 10, unit: 'cm', modes: ['touch', 'arcs'], cond: () => settings.mode === 'arcs' ? settings.arcJump > 0 : ['jump', 'combo'].includes(settings.exercise) && (settings.exercise !== 'combo' || settings.comboBase === 'stand'), hint: 'Cuánto tiene que subir la cabeza por encima de tu altura de pie (en Arcos, al pasar la valla).' },
  { key: 'abMin', g: 'toques', label: 'Tronco elevado: mínimo', short: 'Ángulo mín.', type: 'num', min: 10, max: 70, step: 5, def: 25, unit: '°', modes: ['touch'], ex: ['abs', 'combo'], cond: () => settings.exercise !== 'combo' || settings.comboBase === 'abs', hint: 'Ángulo del tronco con el suelo al que llegan los aros más bajos.' },
  { key: 'abMax', g: 'toques', label: 'Tronco elevado: máximo', short: 'Ángulo máx.', type: 'num', min: 20, max: 85, step: 5, def: 55, unit: '°', modes: ['touch'], ex: ['abs', 'combo'], cond: () => settings.exercise !== 'combo' || settings.comboBase === 'abs', hint: '90° sería sentarse del todo.' },
  { key: 'absMoves', g: 'toques', label: 'Movimientos (abdominales)', short: 'Movimientos', type: 'multi', opts: [['crunch', 'Abdominal'], ['twist', 'Oblicuo'], ['side', 'Lateral'], ['knee', 'Rodillas']], def: 'crunch,twist,knee', modes: ['touch'], ex: ['abs'], hint: 'Abdominal: ameba de frente · Oblicuo: ameba girada · Lateral: diamantes que llegan por los lados, a ras de suelo junto a la cadera; con los hombros despegados, inclina el tronco hacia ese lado y tócalo con esa mano (como tocarse los talones) · Rodillas: diamante junto a las rodillas. Solo Lateral: todo son abdominales laterales.' },
  { key: 'abTwist', g: 'toques', label: 'Giro del tronco (oblicuos)', short: 'Giro', type: 'num', min: 0, max: 45, step: 5, def: 25, unit: '°', modes: ['touch'], ex: ['abs', 'combo'], cond: () => settings.exercise !== 'combo' || settings.comboBase === 'abs', hint: 'Cuánto se desvían hacia los lados algunos aros.' },
  { key: 'comboBase', g: 'toques', label: 'Postura del combinado', short: 'Postura', type: 'choice', opts: [['stand', 'De pie'], ['floor', 'Plancha'], ['abs', 'Boca arriba']], def: 'stand', modes: ['touch'], ex: ['combo'], relayout: true, hint: 'Los movimientos del combinado se hacen todos en esta postura.' },
  { key: 'comboStand', g: 'toques', label: 'Movimientos (de pie)', short: 'Movimientos', type: 'multi', opts: [['squat', 'Sentadilla'], ['lunge', 'Zancada'], ['jump', 'Salto'], ['punch', 'Puñetazo'], ['reach', 'Estirarse']], def: 'squat,jump', modes: ['touch'], ex: ['combo'], cond: () => settings.comboBase === 'stand', hint: 'Sentadilla: ameba baja · Zancada: ameba baja un paso por delante · Salto: ameba alta · Puñetazo: diamante delante · Estirarse: diamante arriba.' },
  { key: 'comboFloor', g: 'toques', label: 'Movimientos (plancha)', short: 'Movimientos', type: 'multi', opts: [['push', 'Flexión'], ['plank', 'Plancha'], ['tap', 'Toque']], def: 'push,plank', modes: ['touch'], ex: ['combo'], cond: () => settings.comboBase === 'floor', hint: 'Flexión: ameba baja · Plancha: ameba en la que hay que aguantar · Toque: diamante para una mano.' },
  { key: 'comboAbs', g: 'toques', label: 'Movimientos (boca arriba)', short: 'Movimientos', type: 'multi', opts: [['crunch', 'Abdominal'], ['twist', 'Oblicuo'], ['side', 'Lateral'], ['knee', 'Rodillas']], def: 'crunch,twist,knee', modes: ['touch'], ex: ['combo'], cond: () => settings.comboBase === 'abs', hint: 'Abdominal: ameba de frente · Oblicuo: ameba girada · Lateral: diamante que llega por un lado, junto a la cadera (inclina el tronco hacia ese lado) · Rodillas: diamante junto a las rodillas.' },
  { key: 'comboOrder', g: 'toques', label: 'Orden de los movimientos', short: 'Orden', type: 'choice', opts: [['seq', 'En orden'], ['random', 'Al azar']], def: 'seq', modes: ['touch'], ex: ['combo'] },
  { key: 'plankHold', g: 'toques', label: 'Segundos en las amebas de plancha', short: 'Plancha', type: 'num', min: 2, max: 30, step: 1, def: 5, unit: 's', modes: ['touch'], ex: ['combo'], cond: () => settings.comboBase === 'floor', hint: 'Mantén la cabeza dentro de la ameba este tiempo.' },
  { key: 'pistol', g: 'armas', label: 'Pistolas (sentadillas y zancadas)', short: 'Pistolas', type: 'toggle', def: 0, modes: ['combat'], relayout: true, ex: ['squat', 'lunge'], hint: 'Cada sentadilla carga munición y disparas tú con el gatillo de los mandos (o pellizcando con la mano) donde apuntes.' },
  { key: 'foeKind', g: 'enemigos', label: 'Qué enemigos salen', short: 'Salen', type: 'choice', opts: [['both', 'Los dos'], ['ground', 'Los que andan'], ['fly', 'Los voladores']], def: 'both', modes: ['combat'], cond: () => !oneArm() && settings.exercise !== 'superman', relayout: true, hint: 'De una vez, sin marcarlos uno a uno: solo los que andan (de las compuertas o, en el suelo, de las trampillas), solo los voladores o los dos. Lo que tengas marcado en cada grupo se guarda.' },
  { key: 'foesGate', g: 'enemigos', label: 'De las compuertas (andando)', short: 'Compuertas', type: 'multi', grid: 4, empty: true, opts: FOE_GATE, def: 'robot,imp,puglin,zombie,raptor', modes: ['combat'], cond: () => !isTiny() && !(settings.exercise === 'superman') && settings.foeKind !== 'fly', relayout: true, hint: 'Los que vienen andando desde las compuertas (el lanzador, un diablillo, se queda lejos y te tira piedras: apártate o párala con la mano o la espada). Salen repartidos entre los que marques; sin ninguno (y con algún volador), solo voladores. Si solo marcas uno, el jefe es de esa clase; con el capitán Barbarroja marcado, el jefe es él.' },
  { key: 'foesHatch', g: 'enemigos', label: 'De las trampillas (en el suelo)', short: 'Trampillas', type: 'multi', grid: 4, empty: true, opts: FOE_HATCH, def: 'spider', modes: ['combat'], cond: () => isTiny() && (settings.foeKind !== 'fly' || oneArm()), relayout: true, hint: 'En las flexiones y las planchas sobre una mano, los que salen de las trampillas del suelo, pequeños, y saltan a por ti. Sin ninguno (y con algún volador), solo voladores. La plancha con un brazo siempre trae alguno.' },
  { key: 'foesFly', g: 'enemigos', label: 'Voladores', short: 'Voladores', type: 'multi', grid: 3, empty: true, opts: FOE_FLY, def: 'drone,hornet', modes: ['combat'], cond: () => !oneArm() && (settings.foeKind !== 'ground' || settings.exercise === 'superman'), relayout: true, hint: 'Drones y bombarderos (se estrellan contra ti), avispones, abejas, murciélagos y Cthulhus (te pican o te muerden). El dragón es el jefe de los voladores (si no, la nodriza). Sin ninguno, nadie vuela; en el superman siempre vienen voladores.' },
  { key: 'aim', g: 'armas', cond: () => !pistolOn() && !aimForced(), label: 'Puntería', type: 'choice', opts: [['auto', 'Automática'], ['hands', 'Con las manos'], ['gaze', 'Con la mirada']], def: 'hands', modes: ['combat'], relayout: true, hint: 'Automática: cada repetición dispara sola al enemigo más cercano (y si aguantas abajo, el disparo se carga). Con la mirada, dispara a donde miras. Con las manos, en sentadillas y zancadas, la repetición carga las dos manos y cada una lanza su rayo: llévala atrás, junto al cuerpo, y adelante deprisa hacia el enemigo; el rayo busca al más cercano a esa dirección (en el resto de ejercicios se apunta con la mirada).' },
  { key: 'throwPick', g: 'armas', label: 'Lanzando con las manos, el rayo va', short: 'El rayo va', type: 'choice', opts: [['gaze', 'Al que miras'], ['hand', 'Hacia donde lanzas']], def: 'gaze', modes: ['combat'], cond: () => !pistolOn() && settings.aim === 'hands' && !aimForced(), hint: 'Al que miras (recomendado): mira al enemigo y lanza hacia él; el gesto dispara y la mirada elige a cuál (sale un aro sobre él). Hacia donde lanzas: solo cuenta la dirección de la mano, que las gafas miden con menos precisión; con enemigos juntos puede irse a otro.' },
  { key: 'assist', g: 'armas', label: 'Ayuda de puntería', short: 'Ayuda puntería', type: 'num', min: 0, max: 25, step: 1, def: 9, unit: '°', modes: ['combat'], cond: () => aimManual() },

  // Espadas (con los mandos): en Combate contra robots, cada sentadilla carga la hoja y los robots se derriban a tajos; en Toques,
  // los diamantes pasan a ser bloques que se cortan en la dirección de su flecha
  { key: 'sword', g: 'armas', label: 'Espadas (con los mandos)', short: 'Espadas', type: 'choice', opts: [['off', 'No'], ['one', 'Una'], ['two', 'Dos']], def: 'off', modes: ['combat', 'touch'], ex: ['squat', 'lunge', 'jump', 'slam', 'combo'], cond: () => (settings.exercise !== 'combo' || settings.comboBase === 'stand') && (!isCombat() || foes() === 'robots'), relayout: true, hint: 'Con los mandos en la mano. En Combate (solo contra robots) cada sentadilla carga la hoja y los robots se derriban a tajos; en Toques se cortan bloques en la dirección de su flecha. Despeja bien el espacio a tu alrededor y ponte la correa de los mandos.' },
  { key: 'swordKind', g: 'armas', label: 'Tipo de espada', short: 'Tipo', type: 'choice', opts: [['metal', 'Metálica'], ['laser', 'Láser']], def: 'metal', modes: ['combat', 'touch'], cond: () => swordSet(), hint: 'Metálica: acero que refleja las luces del entorno. Láser: hoja de energía con su zumbido.' },
  { key: 'swordHand', g: 'armas', label: 'Mano de la espada', short: 'Mano', type: 'choice', opts: [['right', 'Derecha'], ['left', 'Izquierda']], def: 'right', modes: ['combat', 'touch'], cond: () => swordSet() && settings.sword === 'one', hint: 'Con una sola espada y las pistolas activadas, en la otra mano llevas el bláster.' },
  { key: 'swordSpeed', g: 'armas', label: 'Velocidad mínima del corte', short: 'Vel. corte', type: 'num', min: 0.5, max: 5, step: 0.1, def: 1.6, unit: 'm/s', modes: ['combat', 'touch'], cond: () => swordSet(), hint: 'Solo cuenta un tajo amplio y rápido: más alto obliga a girar el tronco y extender el brazo.' },
  { key: 'swordBlock', g: 'armas', label: 'Bloquear los golpes de los robots', short: 'Bloqueos', type: 'toggle', def: 1, modes: ['combat'], cond: () => swordSet(), hint: 'El robot avisa a qué altura va a golpear: pon la espada ahí. Los golpes medios y bajos solo se paran agachado. Un bloqueo lo deja aturdido y tu contraataque hace el doble de daño.' },

  { key: 'arcMin', g: 'arcos', label: 'Bajada mínima bajo un arco', short: 'Bajada mínima', type: 'num', min: 5, max: 80, step: 1, def: 18, unit: 'cm', modes: ['arcs'] },
  { key: 'arcMax', g: 'arcos', label: 'Bajada máxima bajo un arco', short: 'Bajada máxima', type: 'num', min: 5, max: 90, step: 1, def: 38, unit: 'cm', modes: ['arcs'], hint: 'Cada arco sale a una altura al azar entre la mínima y la máxima.' },
  { key: 'arcRate', g: 'arcos', label: 'Arcos por minuto', short: 'Arcos/minuto', type: 'num', min: 3, max: 40, step: 1, def: 12, modes: ['arcs'] },
  { key: 'arcMaxGap', g: 'arcos', label: 'Espera máxima entre un arco y el siguiente', short: 'Espera máx.', type: 'num', min: 1.5, max: 20, step: 0.5, def: 6, unit: 's', modes: ['arcs'], hint: 'Por muchos arcos por minuto que pidas o por irregular que sea la aparición, nunca pasa más tiempo que este sin que salga el siguiente.' },
  { key: 'arcSpeed', g: 'arcos', label: 'Velocidad de los arcos', short: 'Vel. arcos', type: 'num', min: 1, max: 25, step: 0.5, def: 7, unit: 'km/h', modes: ['arcs'] },
  { key: 'arcTiming', g: 'arcos', label: 'Aparición de los arcos', short: 'Aparición', type: 'choice', opts: [['irregular', 'Irregular'], ['regular', 'Regular']], def: 'irregular', modes: ['arcs'], hint: 'Irregular: unas veces seguidos y otras con más hueco, sin que puedas cogerle el ritmo (la media no cambia).' },
  { key: 'arcTilt', g: 'arcos', label: 'Arcos con la barra inclinada', short: 'Inclinados', type: 'num', min: 0, max: 100, step: 5, def: 0, unit: '%', modes: ['arcs'], relayout: true, hint: 'La barra baja por un lado: apártate hacia el lado alto flexionando esa pierna y estirando la otra (zancada lateral).' },
  { key: 'arcTiltMax', g: 'arcos', label: 'Inclinación máxima de la barra', short: 'Inclinación', type: 'num', min: 5, max: 35, step: 1, def: 18, unit: '°', modes: ['arcs'], cond: () => settings.arcTilt > 0, hint: 'Cuanto más inclinada, más hay que apartarse hacia el lado alto.' },
  { key: 'arcRight', g: 'arcos', label: 'Inclinados: hacia la derecha', short: 'A la derecha', type: 'num', min: 0, max: 100, step: 10, def: 50, unit: '%', modes: ['arcs'], cond: () => settings.arcTilt > 0, hint: 'De los arcos inclinados, cuántos hay que esquivar apartándose a la derecha (el resto, a la izquierda). Con el 50 %, los dos lados por igual en cada oleada.' },
  { key: 'arcShift', g: 'arcos', label: 'Desplazamiento lateral en los inclinados', short: 'Desplazamiento', type: 'num', min: 15, max: 70, step: 5, def: 40, unit: 'cm', modes: ['arcs'], cond: () => settings.arcTilt > 0, hint: 'Hasta dónde hay que llevar la cabeza hacia el lado alto para pasar con la bajada normal; en el centro hay que bajar más.' },
  { key: 'arcJump', g: 'arcos', label: 'Vallas bajas (saltar)', short: 'Vallas', type: 'num', min: 0, max: 100, step: 5, def: 20, unit: '%', modes: ['arcs'], relayout: true, hint: 'Parte de los obstáculos que llegan a ras de suelo: hay que saltarlos. Cuenta el salto si la cabeza sube deprisa al menos la altura del salto (Ajustes → Toques) por encima de tu altura de pie justo cuando pasa la valla.' },
  { key: 'arcPatterns', g: 'arcos', label: 'Coreografías (en vez de al azar)', short: 'Coreografías', type: 'toggle', def: 1, modes: ['arcs'], hint: 'Llegan en pequeñas secuencias con su ritmo: escalera (cada vez más abajo), ráfaga de tres, zigzag de inclinados, valla y arco bajo… Se aprenden y cogen ritmo.' },
  { key: 'arcNew', g: 'arcos', label: 'Obstáculos nuevos (láser, paredes, rueda)', short: 'Obst. nuevos', type: 'num', min: 0, max: 100, step: 5, def: 25, unit: '%', modes: ['arcs'], hint: 'Un láser que barre la pista y se para cerca del centro (apártate al lado libre), dos paredes que se cierran dejando un hueco a un lado (métete en él) y una barra que gira como una rueda y se para inclinada al llegar.' },
  { key: 'arcOrbs', g: 'arcos', label: 'Orbes para recoger', short: 'Orbes', type: 'num', min: 0, max: 100, step: 10, def: 40, unit: '%', modes: ['arcs'], hint: 'Entre arco y arco llegan orbes dorados: recógelos con la cabeza o con las manos (100 puntos; 200 en fiebre). Si se escapan, no pasa nada.' },
  { key: 'arcFever', g: 'arcos', label: 'Modo fiebre (10 seguidos sin fallo)', short: 'Fiebre', type: 'toggle', def: 1, modes: ['arcs'], hint: 'Tras 10 obstáculos seguidos sin que te den, todo va un 20 % más deprisa, las luces se vuelven de neón rosa y los puntos valen el doble, hasta que te dan.' },
  { key: 'arcMove', g: 'arcos', label: 'Sensación de avance', short: 'Avance', type: 'toggle', def: 1, modes: ['arcs'], hint: 'Rayas en la pista y farolas a los lados que pasan junto a ti a la velocidad de los arcos.' },
  { key: 'arcDouble', g: 'arcos', label: 'Arcos dobles (aguantar abajo)', short: 'Arcos dobles', type: 'num', min: 0, max: 100, step: 5, def: 15, unit: '%', modes: ['arcs'] },

  { key: 'barTarget', g: 'barras', label: 'Qué revientas con la cabeza', short: 'Objetivos', type: 'choice', opts: [['bubbles', 'Pompas'], ['bugs', 'Bichos']], def: 'bubbles', modes: ['bars'], noEx: ['hang'], hint: 'Pompas que llegan flotando desde delante, o avispas monstruo que acuden zumbando hasta donde llegará tu cabeza y amagan con picarte.' },
  { key: 'barArrive', g: 'barras', label: 'Tiempo que tarda un objetivo en llegar', short: 'Tiempo llegada', type: 'num', min: 1, max: 20, step: 0.5, def: 4, unit: 's', modes: ['bars'], noEx: ['hang'] },
  { key: 'barWait', g: 'barras', label: 'Tiempo para reventarlo', short: 'Tiempo reventar', type: 'num', min: 0, max: 60, step: 1, def: 12, unit: 's', zero: 'Sin límite', modes: ['bars'], noEx: ['hang'], hint: 'Si no llegas a tiempo, el bicho te pica (pierdes una vida) o la pompa se escapa.' },
  { key: 'barMix', g: 'barras', label: 'Llegan por los lados (un brazo cada vez)', short: 'Por los lados', type: 'num', min: 0, max: 100, step: 10, def: 0, unit: '%', zero: 'No', modes: ['bars'], ex: ['row', 'pullup'], relayout: true, hint: 'Cuántas pompas y bichos llegan por un lado y se paran algo apartados de tu cabeza, para que en esa repetición trabaje más un brazo; los demás llegan al centro. Se reparten por igual a lo largo de la oleada y los de los lados alternan izquierda y derecha: al final, los dos brazos han trabajado lo mismo. 100 % = todos por los lados.' },
  { key: 'barOffset', g: 'barras', label: 'Cuánto se apartan del centro', short: 'Apartados', type: 'num', min: 5, max: 40, step: 1, def: 15, unit: 'cm', modes: ['bars'], ex: ['row', 'pullup'], cond: () => settings.barMix > 0 },
  { key: 'hangPit', g: 'barras', label: 'Debajo de ti, colgado', short: 'Debajo', type: 'choice', opts: [['pool', 'Charco'], ['vortex', 'Remolino']], def: 'pool', modes: ['bars'], ex: ['hang'], hint: 'Charco con tentáculos, o un remolino que quiere engullirte y se va cerrando hasta cerrarse justo al cumplir el tiempo de la oleada. Si te sueltas antes, te engulle y la oleada termina.' },
  { key: 'fallMargin', g: 'barras', label: 'Bajada que cuenta como caída', short: 'Margen caída', type: 'num', min: 4, max: 40, step: 1, def: 12, unit: 'cm', modes: ['bars'], hint: 'Si la cabeza baja esto por debajo de tu posición colgado, te has soltado. También cuenta ver las manos por debajo de la barra.' },
  { key: 'doorH', g: 'barras', label: 'Altura de la barra de dominadas', short: 'Altura barra', type: 'num', min: 150, max: 260, step: 1, def: 220, unit: 'cm', modes: ['bars'], ex: ['pullup', 'hang'], hint: 'Se ajusta sola al colocarla con las manos.' },
  { key: 'doorW', g: 'barras', label: 'Ancho de la barra de dominadas', short: 'Ancho barra', type: 'num', min: 50, max: 140, step: 1, def: 90, unit: 'cm', modes: ['bars'], ex: ['pullup', 'hang'] },
  { key: 'dipH', g: 'barras', label: 'Altura de las paralelas', short: 'Altura paralelas', type: 'num', min: 50, max: 150, step: 1, def: 95, unit: 'cm', modes: ['bars'], ex: ['row'], hint: 'Se ajusta sola al colocarlas con las manos.' },
  { key: 'dipBars', g: 'barras', label: 'Paralelas que usas', short: 'Paralelas', type: 'choice', opts: [['2', 'Dos'], ['1', 'Una']], def: '2', modes: ['bars'], ex: ['row'], relayout: true, hint: 'Con una sola te tumbas cruzado debajo y la agarras con las dos manos.' },
  { key: 'dipGap', g: 'barras', cond: () => settings.dipBars !== '1', label: 'Separación entre las paralelas', short: 'Separación', type: 'num', min: 30, max: 100, step: 1, def: 58, unit: 'cm', modes: ['bars'], ex: ['row'] },
  { key: 'dipLen', g: 'barras', label: 'Largo de las paralelas', short: 'Largo', type: 'num', min: 30, max: 150, step: 1, def: 70, unit: 'cm', modes: ['bars'], ex: ['row'] },

  { key: 'depth', g: 'entorno', label: 'Distancia de las compuertas', short: 'Dist. compuertas', type: 'num', min: 0, max: 25, step: 0.5, def: 0, unit: 'm', zero: 'Auto', hint: 'Auto: 11 m en VR y 6 m en realidad mixta.' },
  { key: 'menuLevel', g: 'sistema', label: 'Menú', type: 'choice', opts: [['simple', 'Sencillo'], ['full', 'Completo']], def: 'simple', relayout: true, hint: 'Sencillo: en los menús y aquí solo salen los ajustes básicos (y tus favoritos con ★). Completo: todos, también los de afinar.' },
  { key: 'menuWhere', g: 'sistema', label: 'Dónde aparece el menú', short: 'Menú en', type: 'choice', opts: [['wrist', 'Muñeca'], ['stand', 'Atril']], def: 'wrist', hint: 'Muñeca: mira tu muñeca izquierda y pulsa MENÚ; el menú se queda quieto delante de ti hasta que lo cierras con la palma hacia abajo o el puño. Atril: fijo delante de ti, sobre un pie.' },
  { key: 'wristDist', g: 'sistema', label: 'Distancia del menú de muñeca a los ojos', short: 'Dist. muñeca', type: 'num', min: 30, max: 90, step: 5, def: 55, unit: 'cm', cond: () => settings.menuWhere === 'wrist', hint: 'Sale de la muñeca y se queda a esta distancia, delante de ti. Si te cuesta enfocarlo, aléjalo; si no llegas con el dedo, acércalo.' },
  { key: 'menuDist', g: 'sistema', label: 'Distancia del menú al aparecer', short: 'Dist. menú', type: 'num', min: 30, max: 200, step: 5, def: 85, unit: 'cm', cond: () => settings.menuWhere === 'stand', hint: 'Con el atril: el menú se queda fijo y tendrás que acercarte para pulsarlo.' },
  { key: 'board', g: 'entorno', label: 'Marcador', type: 'choice', opts: [['auto', 'Auto'], ['gate', 'Compuertas'], ['column', 'Columna']], def: 'auto', hint: 'Auto: sobre las compuertas en VR, en una columna en realidad mixta.' },
  { key: 'shadows', g: 'entorno', label: 'Sombras', type: 'toggle', def: 1, hint: 'Desactívalas si notas tirones.' },
  { key: 'xrHz', g: 'entorno', label: 'Fotogramas por segundo en las gafas', short: 'Fotogramas', type: 'choice', opts: [['72', '72 (estable)'], ['90', '90'], ['120', '120']], def: '72', hint: 'A 72 la imagen va siempre fluida (como en muchos juegos de las Quest); a 90 o 120 es más suave si las gafas llegan, pero si no llegan da tirones.' },
  { key: 'perfHud', g: 'sistema', label: 'Medidor de fotogramas', short: 'Medidor', type: 'toggle', def: 0, hint: 'Muestra abajo a la izquierda de la vista los fotogramas por segundo y los que se pierden: si ves pérdidas, baja la frecuencia o quita las sombras.' },
  { key: 'scenery', g: 'entorno', label: 'Entorno (en VR)', short: 'Entorno', type: 'choice', opts: [['arena', 'Fortaleza'], ['nature', 'Bosque'], ['island', 'Isla pirata'], ['mix', 'Alternar']], def: 'arena', hint: 'Dónde juegas en VR: la fortaleza industrial de noche, un claro del bosque a pleno día o una playa en una isla pirata, con el mar detrás de ti (Quaternius). Alternar: uno distinto en cada partida. En realidad mixta, tu habitación.' },
  { key: 'goalMin', g: 'perfil', label: 'Meta diaria de entrenamiento', short: 'Meta diaria', type: 'num', min: 5, max: 120, step: 5, def: 20, unit: 'min', hint: 'El anillo de «Hoy», arriba de la página, se llena al llegar a ella.' },
  { key: 'weight', g: 'perfil', label: 'Tu peso (para estimar las calorías)', short: 'Peso', type: 'num', min: 30, max: 200, step: 1, def: 70, unit: 'kg', hint: 'Solo para la estimación de calorías gastadas: con el esfuerzo de cada ejercicio (MET), tu peso y el tiempo de oleada y de descanso. Es una aproximación.' },
  { key: 'exSort', g: 'sistema', label: 'Ejercicios en el menú', short: 'Ejercicios', type: 'choice', opts: [['mode', 'En lista'], ['body', 'Por zona del cuerpo']], def: 'mode', relayout: true, hint: 'Por zona del cuerpo: los ejercicios del modo elegido, agrupados por lo que trabajan. Siempre salen solo los que se pueden hacer en ese modo.' },
  { key: 'roomMode', g: 'entorno', label: 'Escala de habitación (realidad mixta)', short: 'Habitación', type: 'choice', opts: [['scan', 'Según el escaneo'], ['manual', 'Colocada a mano'], ['off', 'No']], def: 'scan', hint: 'Según el escaneo: con las Quest 3 y la habitación escaneada, las compuertas se abren en tus paredes donde el camino hasta ti está libre de muebles, el marcador se cuelga en una pared y las paredes y los muebles tapan lo que pasa detrás. Colocada a mano: tú pones el sitio de juego, las compuertas, las trampillas y el marcador (se recuerda entre sesiones); sirve también si la habitación no cumple los requisitos. No: disposición fija, como en VR.' },
  { key: 'roomOcclude', g: 'entorno', label: 'Que paredes y muebles tapen lo virtual', short: 'Oclusión', type: 'toggle', def: 1, cond: () => settings.roomMode !== 'off', hint: 'En realidad mixta, lo que pasa por detrás de tus paredes y muebles queda tapado. Si algo no se ve cuando debería, apágalo (y mira «Ver lo escaneado»).' },
  { key: 'roomShow', g: 'entorno', label: 'Ver lo escaneado (para comprobarlo)', short: 'Ver escaneo', type: 'toggle', def: 0, cond: () => settings.roomMode !== 'off', hint: 'Pinta las paredes (verde) y los muebles (naranja) tal como los ha leído el juego, para ver si coinciden con los reales.' },
  { key: 'boltLight', g: 'entorno', label: 'Los rayos iluminan', short: 'Luz de rayos', type: 'toggle', def: 1, hint: 'Cada disparo ilumina el entorno y, con sombras, las hace saltar. Quítalo si notas tirones.' },
  { key: 'demo', g: 'sistema', label: 'Caricatura del ejercicio', short: 'Caricatura', type: 'toggle', def: 1, hint: 'Junto al menú y mientras calibras o esperas, un monigote enseña el movimiento correcto y qué pasa al hacerlo.' },
  { key: 'toasts', g: 'sistema', label: 'Avisos breves en la vista', short: 'Avisos en vista', type: 'toggle', def: 1 },
  { key: 'volume', g: 'sonido', label: 'Volumen de efectos', short: 'Volumen', type: 'num', min: 0, max: 100, step: 5, def: 80, unit: '%' },
  { key: 'ambient', g: 'sonido', label: 'Sonido ambiente', short: 'Ambiente', type: 'num', min: 0, max: 100, step: 5, def: 60, unit: '%' },
  { key: 'bpm', g: 'sonido', label: 'Ritmo de la música', short: 'Ritmo', type: 'num', min: 0, max: 200, step: 1, def: 0, unit: 'BPM', zero: 'libre', modes: ['touch', 'combat'], hint: 'Con un ritmo, en Toques los objetivos llegan a ti en el pulso; en Combate los enemigos salen en el pulso, los robots pisan al compás y atacan en el pulso y los voladores hacen sus quiebros en el pulso. Márcalo en el juego tocando al compás (o pídeselo a Spotify).' }
];
const FIELD = {}; SCHEMA.forEach(f => FIELD[f.key] = f);
const settings = { mode: 'combat', exercise: 'squat' };
SCHEMA.forEach(f => settings[f.key] = f.def);
const STORE_KEY = 'reparena3-settings', HIST_KEY = 'reparena3-history';

function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } return null; }
function decimals(f) { return f.step < 1 ? (String(f.step).split('.')[1] || '').length : 0; }
function clampSetting(f, v) {
  if (f.type === 'multi') { const on = String(v || '').split(','), out = f.opts.map(o => o[0]).filter(k => on.includes(k)); return out.length ? out.join(',') : f.empty ? '' : f.def; }
  if (f.type === 'choice') return f.opts.some(o => o[0] === v) ? v : f.def;
  if (f.type === 'toggle') return v ? 1 : 0;
  v = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : +v;
  if (!isFinite(v)) v = f.def;
  v = clamp(v, f.min, f.max);
  v = Math.round((v - f.min) / f.step) * f.step + f.min;
  return +clamp(v, f.min, f.max).toFixed(decimals(f));
}
function fmtNum(v, f) { return (f ? v.toFixed(decimals(f)) : String(Math.round(v * 10) / 10)).replace('.', ','); }
function fmtVal(f, v = settings[f.key]) {
  if (f.type === 'choice') { const o = f.opts.find(o => o[0] === v); return o ? o[1] : String(v); }
  if (f.type === 'toggle') return v ? 'Sí' : 'No';
  if (v === 0 && f.zero) return f.zero;
  return fmtNum(v, f) + (f.unit ? (f.unit === '°' || f.unit === '%' ? f.unit : ' ' + f.unit) : '');
}
(function loadSettings() {
  const s = store(STORE_KEY) || {};
  for (const f of SCHEMA) if (s[f.key] !== undefined) settings[f.key] = clampSetting(f, s[f.key]);
  if (MODE_NAMES[s.mode]) settings.mode = s.mode;
  else if (LEGACY_MODES[s.mode]) { settings.mode = 'combat'; if (s.foes === undefined) { const { foes: c, ...rest } = LEGACY_MODES[s.mode]; Object.assign(settings, rest, s.foesGate === undefined ? foeCatPatch(c) : {}, s.mode === 'flyers' && ['hands', 'gaze'].includes(s.aim) ? { aim: s.aim } : {}); } }
  // antes se elegía «robots, voladores o mezcla» y cuántos de cada clase de los que andan: ahora, cada enemigo
  if (s.foesGate === undefined && s.foes !== undefined) {
    const off = { robotsW: ['robot'], beasts: ['imp', 'puglin'], zombies: ['zombie'], dinos: ['raptor'] }, gate = foeList('foesGate').filter(k => !Object.keys(off).some(w => s[w] === 0 && off[w].includes(k)));
    settings.foesGate = gate.length ? gate.join(',') : FIELD.foesGate.def; Object.assign(settings, foeCatPatch(s.foes));
  }
  if (EX_NAMES[s.exercise]) settings.exercise = s.exercise;
  if (s.roomMode === undefined && s.room === 0) settings.roomMode = 'off'; // antes era un sí/no
  if (s.barMix === undefined && s.barSides) settings.barMix = 50; // antes, todos por los lados o ninguno: ahora se mezclan
  // la puntería por defecto pasó de automática a lanzar con las manos: a quien la tenía en automática (lo de antes) se le cambia una vez
  if (s.aimV !== 2) { if (!s.aim || s.aim === 'auto') settings.aim = 'hands'; } settings.aimV = 2;
  // la dificultad creciente subía un 3 % por oleada y apenas se notaba: a quien la tenía así (lo de antes) se le pasa a 6 % una vez
  if (s.rampV !== 2) { if (s.ramp === undefined || s.ramp === 3) settings.ramp = 6; } settings.rampV = 2;
  // y con el 6 % subía demasiado deprisa: a quien lo tenía así (lo de antes) se le pasa a 4 % una vez
  if (s.rampV !== 3) { if (settings.ramp === 6) settings.ramp = 4; } settings.rampV = 3;
  settings.exercise = exFor(settings.mode, settings.exercise);
})();
// Durante una sesión se guardan los valores de antes, no los del bloque en curso
function saveSettings() { store(STORE_KEY, SES.active ? Object.assign({}, settings, SES.orig) : settings); if (!SES.active) comboSave(); }
// Cada modo con cada ejercicio guarda sus ajustes de juego (la partida, el ejercicio, los enemigos, las armas, los arcos,
// los toques y las barras): al volver a él salen como los dejaste. Lo común (entorno, sonido, menú, tu perfil, el rango y
// las medidas de los aparatos) no cambia. Un modo o ejercicio que aún no has tocado empieza con los ajustes que tenías
const COMBO_KEY = 'reparena3-combos', COMBO_G = new Set(['partida', 'ejercicio', 'enemigos', 'armas', 'cada', 'arcos', 'toques', 'barras']);
const COMBO_SKIP = new Set(['rank', 'doorH', 'doorW', 'dipH', 'dipBars', 'dipGap', 'dipLen']);
let _comboKeys = null;
const comboKeys = () => _comboKeys || (_comboKeys = SCHEMA.filter(f => COMBO_G.has(f.g) && !COMBO_SKIP.has(f.key)).map(f => f.key));
const comboId = () => settings.mode + '|' + settings.exercise;
function comboSave(id = comboId()) { const all = store(COMBO_KEY) || {}; all[id] = Object.fromEntries(comboKeys().map(k => [k, settings[k]])); store(COMBO_KEY, all); }
// Carga los de este modo y ejercicio; devuelve los ajustes que cambian
function comboLoad(id = comboId()) {
  const o = (store(COMBO_KEY) || {})[id], ch = []; if (!o) return ch;
  for (const k of comboKeys()) if (o[k] !== undefined) { const v = clampSetting(FIELD[k], o[k]); if (v !== settings[k]) { settings[k] = v; ch.push(k); } }
  return ch;
}
// Al cambiar de rango, sus valores pasan a todos los modos y ejercicios
function comboPatchAll(vals) { const all = store(COMBO_KEY) || {}; for (const id in all) Object.assign(all[id], vals); store(COMBO_KEY, all); }
function setSetting(key, v) {
  if (key === 'foes') { Object.assign(settings, foeCatPatch(v)); saveSettings(); onSettingChanged('foesGate'); return; } // el atajo de antes: robots, voladores o mezcla
  if (key === 'mode' && LEGACY_MODES[v]) { const { foes: c, ...rest } = LEGACY_MODES[v]; Object.assign(settings, rest, foeCatPatch(c)); v = 'combat'; } // Asalto → robots y automática; Enjambre → voladores y a mano
  const f = FIELD[key], prev = (key === 'mode' || key === 'exercise') && !SES.active ? comboId() : null;
  if (prev) comboSave(prev); // lo que dejas, guardado
  settings[key] = f ? clampSetting(f, v) : v;
  // cada modo tiene sus ejercicios: cambiar uno arrastra al otro si no casan
  if (key === 'mode') settings.exercise = exFor(v, settings.exercise);
  if (key === 'exercise' && !exOk(settings.mode, v)) settings.mode = modeFor(v);
  const ch = prev && comboId() !== prev ? comboLoad() : []; // y lo de este modo y ejercicio, como lo dejaste
  saveSettings();
  onSettingChanged(key); ch.forEach(onSettingChanged);
}
// Menú sencillo: solo lo básico de cada grupo (en Ejercicio, todo menos lo de afinar)
const BASIC = new Set(['rank', 'lives', 'waves', 'repsWave', 'hangTime', 'ramp', 'rest', 'foeKind', 'foesGate', 'foesHatch', 'foesFly', 'aim', 'walkTime', 'flySpeed', 'maxAlive', 'pistol',
  'tchArrive', 'tchHands', 'jumpHeight', 'comboBase', 'comboStand', 'comboFloor', 'comboAbs', 'arcMin', 'arcMax', 'arcRate', 'arcMaxGap', 'arcSpeed', 'arcJump', 'barTarget', 'barArrive', 'hangPit', 'doorH', 'dipH',
  'sword', 'swordKind', 'swordHand', 'menuLevel', 'menuWhere', 'xrHz', 'exSort', 'goalMin', 'weight', 'volume', 'ambient', 'bpm', 'scenery', 'depth', 'board']);
const FINE_EX = ['thrUp', 'splDrop', 'supArms', 'perfectTime'];
const isBasic = f => f.g === 'ejercicio' ? !FINE_EX.includes(f.key) : BASIC.has(f.key);
// Lo que se enseña en los menús y en la página: lo que vale para lo elegido y, con el menú sencillo, lo básico
const fieldShown = f => fieldVisible(f) && (settings.menuLevel !== 'simple' || isBasic(f));
function fieldVisible(f) {
  if (f.modes && !f.modes.includes(settings.mode)) return false;
  if (f.ex && !f.ex.includes(settings.exercise)) return false;
  if (f.noEx && f.noEx.includes(settings.exercise)) return false;
  if (f.cond && !f.cond()) return false;
  return true;
}
// Postura en el suelo (flexiones y plancha): arañas, trampillas, calibración y marcador bajos
// Pistolas: en sentadillas (Combate) las repeticiones cargan munición y el gatillo dispara
// De pie con las manos libres: sentadillas y zancadas (se apunta con las manos y valen las pistolas)
const handsFree = () => settings.exercise === 'squat' || settings.exercise === 'lunge';
// Con pesas en las manos (no se abre la pausa juntando los dedos)
const holdsWeights = () => ['curl', 'curl2', 'twist', 'press', 'press2', 'thruster', 'frontsq', 'swing', 'chop', 'dlrow'].includes(settings.exercise);
// En plancha sobre una mano (plancha con un brazo y remo en plancha): arañas por los dos costados, cada brazo dispara a su lado
const oneArm = () => settings.exercise === 'plank1';
const deepOn = () => settings.deepDrop > 0 && DEEP_EX.includes(settings.exercise) && isCombat();
const pistolOn = () => !!settings.pistol && handsFree() && settings.mode === 'combat';
const isCombat = () => settings.mode === 'combat';
// Enemigos de la partida: la plancha con un brazo trae siempre arañas y el superman, voladores bajos
// Los elegidos de cada grupo (foeList), si alguno de ellos sale en esta partida (foeOn) y, de ahí, el reparto: solo por
// tierra, solo voladores o mezcla
function foeList(k) { return String(settings[k] || '').split(',').filter(Boolean); } // (función: se usa ya al cargar los ajustes)
// «Qué enemigos salen» (foeKind) quita un grupo entero sin tocar lo marcado en él; si el que queda está vacío, los de siempre
const foeOnly = () => oneArm() || settings.exercise === 'superman' ? 'both' : settings.foeKind;
const groundList = () => { const k = isTiny() ? 'foesHatch' : 'foesGate', l = foeList(k); if (foeOnly() === 'fly') return []; return l.length ? l : oneArm() ? ['spider'] : foeOnly() === 'ground' ? FIELD[k].def.split(',') : l; };
const flyList = () => { const l = foeList('foesFly'); if (foeOnly() === 'ground') return []; return l.length ? l : settings.exercise === 'superman' || foeOnly() === 'fly' ? FIELD.foesFly.def.split(',') : l; };
const foes = () => { if (oneArm()) return 'robots'; if (settings.exercise === 'superman') return 'flyers'; const g = groundList().length, f = flyList().length; return g && f ? 'mix' : f ? 'flyers' : 'robots'; };
const foeOn = (...ks) => isCombat() && !isTiny() && foesHas('robots') && ks.some(k => groundList().includes(k));
// El atajo (robots, voladores o mezcla) → los ajustes de cada grupo: deja vacío lo que no sale y, si lo que sí sale está
// vacío, vuelve a lo de siempre
function foeCatPatch(v) {
  const o = {}, keep = k => foeList(k).length ? settings[k] : FIELD[k].def;
  if (v === 'flyers') Object.assign(o, { foesGate: '', foesHatch: '', foesFly: keep('foesFly') });
  else if (v === 'robots') Object.assign(o, { foesGate: keep('foesGate'), foesHatch: keep('foesHatch'), foesFly: '' });
  else if (v === 'mix') Object.assign(o, { foesGate: keep('foesGate'), foesHatch: keep('foesHatch'), foesFly: keep('foesFly') });
  return o;
}
const foesHas = k => isCombat() && (foes() === k || foes() === 'mix');
// Puntería: automática (cada repetición dispara sola al más cercano) o la tuya, con las manos o la mirada. En la plancha
// con un brazo (cada brazo dispara a su lado) y en el superman (tumbado no se apunta) siempre es automática
const aimForced = () => oneArm() || settings.exercise === 'superman' || settings.exercise === 'inchworm' || settings.exercise === 'twist'; // con la barra flexible las dos manos están ocupadas
const autoAim = () => isCombat() && !pistolOn() && (settings.aim === 'auto' || aimForced());
const aimManual = () => isCombat() && !pistolOn() && !autoAim();
// Espadas: en Combate contra robots (sentadillas o zancadas) y en Toques de pie; solo se ven si llevas los mandos
const swordSet = () => settings.sword !== 'off' && (isCombat() ? handsFree() && foes() === 'robots' : settings.mode === 'touch' && (['squat', 'lunge', 'jump', 'slam'].includes(settings.exercise) || (settings.exercise === 'combo' && settings.comboBase === 'stand')));
// Apuntando con las manos (o con las pistolas, contra voladores) cada repetición da dos disparos (uno por mano)
// Cada repetición da un disparo por mano (dos pistolas o dos manos que lanzan); con una espada y el bláster, uno cada uno
const twoShots = () => isCombat() && handsFree() && ((pistolOn() && !swordSet()) || (aimManual() && settings.aim === 'hands'));
// Con las manos desnudas (seguimiento de manos, sin mandos)
// (si las gafas pierden las manos un momento, sigue valiendo lo último que se vio)
const BARE = { v: false };
const bareHands = () => { if (hands.left.ok || hands.right.ok) BARE.v = (hands.left.ok && hands.left.isHand) || (hands.right.ok && hands.right.isHand); return BARE.v; };
const isFloor = () => ['pushup', 'plank1', 'plankrow', 'superman', 'abs', 'splank'].includes(settings.exercise) || (settings.exercise === 'combo' && settings.comboBase !== 'stand');
// Sentado en el borde de una silla (fondos): la cabeza, a media altura
const isSeated = () => settings.exercise === 'dips';
// Tumbado boca arriba (abdominales)
const isSupine = () => settings.exercise === 'abs' || (settings.exercise === 'combo' && settings.comboBase === 'abs');
// Batalla diminuta bajo tu cara (flexiones y plancha); en el superman los bichos vuelan de frente a tamaño normal
const isTiny = () => settings.mode !== 'touch' && (settings.exercise === 'pushup' || settings.exercise === 'inchworm' || oneArm());
const isBars = () => settings.mode === 'bars';
// Se completa en otros módulos: aplica efectos inmediatos (volumen, sombras, distancia…)
const settingHooks = [];
settingHooks.push(k => { if (k === 'goalMin') renderToday(); });
function onSettingChanged(key) { settingHooks.forEach(h => { try { h(key); } catch (e) { console.warn(e); } }); }

/* =================== FORMULARIO WEB =================== */
// La página: las opciones comunes (entorno, menú y tu meta) y el sonido aparte; las del modo y el ejercicio, en su sección; y el orden de los
// ejercicios (por modo o por zona del cuerpo), junto a los ejercicios
function buildForm() {
  const group = g => `
    <div class="group" data-group="${g}"><h3>${GROUP_NAMES[g]} <button type="button" class="reset" data-reset="${g}" title="Devolver este grupo a como venía">Restablecer</button></h3>${g === 'cada' ? '<p class="note" id="animNote"></p>' : ''}<div class="grid">${SCHEMA.filter(f => f.g === g).map(fieldHTML).join('')}</div></div>`;
  const common = $('#commonGroups'), host = $('#settingsGroups'), sortBox = $('#exSortBox');
  const COMMON = ['entorno', 'sistema', 'perfil'];
  common.innerHTML = COMMON.map(group).join('');
  $('#soundGroups').innerHTML = group('sonido').replace(/<h3>.*?<\/h3>/, ''); // (la sección ya se titula así)
  host.innerHTML = Object.keys(GROUP_NAMES).filter(g => !COMMON.includes(g) && g !== 'sonido').map(group).join('');
  const sortField = common.querySelector && common.querySelector('[data-field="exSort"]'); if (sortField && sortBox.appendChild) sortBox.appendChild(sortField);
  for (const h of [host, common, sortBox, $('#soundGroups')]) { h.addEventListener('input', onFormInput); h.addEventListener('change', onFormInput); }
  // menú sencillo o completo, y restablecer un grupo
  const ln = $('#levelNote'); if (ln) ln.addEventListener('click', ev => { const v = ev.target.dataset && ev.target.dataset.level; if (v) { setSetting('menuLevel', v); syncForm(); } });
  for (const h of [host, common]) h.addEventListener('click', ev => { const g = ev.target.dataset && ev.target.dataset.reset; if (g && (typeof confirm !== 'function' || confirm(`¿Devolver «${GROUP_NAMES[g]}» a como venía?`))) resetGroup(g); });
  document.querySelectorAll('input[name=mode],input[name=exercise]').forEach(i => i.addEventListener('change', () => {
    if (i.name === 'mode') setSetting('mode', i.value); else setSetting('exercise', i.value);
    syncForm();
  }));
  $('#btnReset').addEventListener('click', () => { SCHEMA.forEach(f => settings[f.key] = f.def); saveSettings(); onSettingChanged('*'); syncForm(); });
}
function fieldHTML(f) {
  const id = 'f-' + f.key;
  let body = '';
  if (f.type === 'num') {
    body = `<div class="num"><input type="range" id="${id}-r" data-key="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" aria-label="${f.label}">
      <input type="number" id="${id}" data-key="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" inputmode="decimal">
      <span class="unit">${f.unit || ''}</span></div>`;
  } else if (f.type === 'multi') {
    body = `<div class="seg multi" role="group" aria-label="${f.label}">${f.opts.map((o, i) => `<label><input type="checkbox" name="${id}" id="${id}-${i}" data-key="${f.key}" value="${o[0]}">${o[1]}</label>`).join('')}</div>`;
  } else {
    const opts = f.type === 'toggle' ? [[1, 'Sí'], [0, 'No']] : f.opts;
    body = `<div class="seg" role="radiogroup" aria-label="${f.label}">${opts.map((o, i) => `<label><input type="radio" name="${id}" id="${id}-${i}" data-key="${f.key}" value="${o[0]}">${o[1]}</label>`).join('')}</div>`;
  }
  const lab = f.type === 'num' ? `<label for="${id}">${f.label}</label>` : `<span class="lab">${f.label}</span>`;
  return `<div class="field" data-field="${f.key}">${lab}${body}${f.zero ? `<span class="zero" id="${id}-z"></span>` : ''}${f.hint ? `<p class="hint">${f.hint}</p>` : ''}</div>`;
}
function onFormInput(ev) {
  const el = ev.target, key = el.dataset && el.dataset.key; if (!key) return;
  const f = FIELD[key];
  if (f.type === 'num') {
    if (el.type === 'number' && ev.type === 'input' && (el.value === '' || el.value.endsWith('.') || el.value.endsWith(','))) return;
    settings[key] = clampSetting(f, el.value); saveSettings(); onSettingChanged(key);
    const other = el.type === 'range' ? $(`#f-${key}`) : $(`#f-${key}-r`);
    if (other) other.value = settings[key];
    if (ev.type === 'change' && el.type === 'number') el.value = settings[key];
    const z = $(`#f-${key}-z`); if (z) z.textContent = settings[key] === 0 && f.zero ? f.zero : '';
  } else if (f.type === 'multi') {
    const on = [...document.querySelectorAll(`input[name="f-${key}"]:checked`)].map(x => x.value);
    settings[key] = clampSetting(f, on.join(',')); saveSettings(); onSettingChanged(key);
    if (!on.length && !f.empty) syncForm(); // no se puede dejar vacío (salvo los que sí)
    if (f.relayout) syncForm();
  } else {
    const v = f.type === 'toggle' ? +el.value : el.value;
    settings[key] = clampSetting(f, v); saveSettings(); onSettingChanged(key);
    if (f.relayout) syncForm(); // cambia qué otros campos se ven
  }
  updateSummary();
}
function syncForm() {
  const m = $(`#mode-${settings.mode}`); if (m) m.checked = true;
  const e = $(`#ex-${settings.exercise}`); if (e) e.checked = true;
  const byBody = settings.exSort === 'body'; sortExCards(byBody);
  Object.keys(EX_NAMES).forEach(x => { const el = $(`#ex-${x}`); if (el) { const ok = exOk(settings.mode, x); el.disabled = !ok; const card = el.closest && el.closest('.card'); if (card) card.hidden = !ok; } });
  if (byBody && document.querySelectorAll) document.querySelectorAll('.cards .zone').forEach(h => { let n = h.nextElementSibling, any = false; while (n && !n.classList.contains('zone')) { if (!n.hidden) any = true; n = n.nextElementSibling; } h.hidden = !any; }); // zonas sin ejercicios de este modo, fuera
  const ln = $('#levelNote'), simple = settings.menuLevel === 'simple';
  if (ln) ln.innerHTML = `${simple ? 'Menú sencillo: solo lo básico.' : 'Menú completo: todos los ajustes.'} <button type="button" class="btn small" data-level="${simple ? 'full' : 'simple'}">${simple ? 'Ver todos los ajustes' : 'Ver solo lo básico'}</button>`;
  const st = $('#specTitle'); if (st) st.textContent = `4 · Opciones de ${MODE_NAMES[settings.mode]} · ${EX_NAMES[settings.exercise]}`;
  const note = $('#exNote'); note.hidden = !['arcs', 'bars', 'touch'].includes(settings.mode);
  note.textContent = { arcs: 'El modo Arcos es solo para sentadillas.', bars: 'El modo Barras usa la barra de dominadas o las paralelas. Remo, dominadas y colgado solo se juegan en él.', touch: 'En Toques no disparas: tocas con la cabeza las amebas y con la mano que piden los diamantes que vienen hacia ti; entre un toque y otro, vuelve a la postura de partida.' }[settings.mode] || '';
  for (const f of SCHEMA) {
    const wrap = document.querySelector(`[data-field="${f.key}"]`);
    if (wrap) wrap.hidden = !fieldShown(f);
    if (f.type === 'num') {
      const a = $(`#f-${f.key}`), b = $(`#f-${f.key}-r`);
      if (a) a.value = settings[f.key]; if (b) b.value = settings[f.key];
      const z = $(`#f-${f.key}-z`); if (z) z.textContent = settings[f.key] === 0 && f.zero ? f.zero : '';
    } else if (f.type === 'multi') {
      const on = String(settings[f.key]).split(',');
      document.querySelectorAll(`input[name="f-${f.key}"]`).forEach(el => { el.checked = on.includes(el.value); });
    } else {
      const els = document.querySelectorAll(`input[name="f-${f.key}"]`);
      els.forEach(el => { el.checked = String(el.value) === String(settings[f.key]); });
    }
  }
  document.querySelectorAll('.group').forEach(g => { g.hidden = !SCHEMA.some(f => f.g === g.dataset.group && fieldShown(f)); });
  if (typeof animNote === 'function') animNote();
  renderPick(); updateSummary();
}
// Página: tarjetas de ejercicios en su orden de siempre o agrupadas por zona del cuerpo (con un encabezado por zona)
const EXCARDS = { order: null };
function sortExCards(byBody) {
  const first = $('#ex-squat'), host = first && first.closest && first.closest('.cards'); if (!host || !host.querySelectorAll) return;
  if (!EXCARDS.order) EXCARDS.order = [...host.children];
  host.querySelectorAll('.zone').forEach(z => z.remove());
  if (!byBody) { EXCARDS.order.forEach(c => host.appendChild(c)); return; }
  const card = x => { const el = $(`#ex-${x}`); return el && el.closest('.card'); }, used = new Set();
  for (const [name, list] of BODY_ZONES) {
    const h = document.createElement('h3'); h.className = 'zone'; h.textContent = name; host.appendChild(h);
    for (const x of list) { const c = card(x); if (c) { host.appendChild(c); used.add(c); } }
  }
  EXCARDS.order.forEach(c => { if (!used.has(c)) host.appendChild(c); });
}
// Página: en las fichas solo va el nombre y el material; la explicación del ejercicio elegido, en el panel fijo, y la del modo,
// bajo los modos (las dos salen del texto de su tarjeta)
function renderPick() {
  const card = el => el && el.closest && el.closest('.card'), part = (c, sel) => { const n = c && c.querySelector(sel); return n ? n.innerHTML : ''; };
  const mc = card($(`#mode-${settings.mode}`)), ec = card($(`#ex-${settings.exercise}`));
  const cnt = $('#exCount'); if (cnt) cnt.textContent = `${Object.keys(EX_NAMES).filter(x => exOk(settings.mode, x)).length} en ${MODE_NAMES[settings.mode]}`;
  const mi = $('#modeInfo'); if (mi && mc) mi.innerHTML = part(mc, 'small');
  const box = $('#pickBox'); if (box && ec) box.innerHTML = `<span class="label">${MODE_NAMES[settings.mode]} · elegido</span><h3>${EX_NAMES[settings.exercise]}</h3><span class="tag">${part(ec, '.tag')}</span><p>${part(ec, 'small')}</p>`;
}
function repTimeOf(ex, mode = settings.mode) { return mode === 'touch' ? settings.tchGap : { squat: 2.3, pushup: 2.4, inchworm: 8, curl: 1.3, curl2: 2.0, twist: 1.6, press2: 2.0, thruster: 3.4, frontsq: 3.0, jsquat: 2.6, swing: 2.0, chop: 2.4, dlrow: 3.0, plank1: 2.2, plankrow: 2.4, superman: settings.supHold + 2, row: 2.6, pullup: 3.2, hang: 1, jump: 2.2, abs: 2.6, combo: 2.4, lunge: 2.6, dips: 2.4, press: 1.6, splank: settings.splHold + 0.5 }[ex]; }
function repTime() { return repTimeOf(settings.exercise); }
// En una sesión, cada bloque trae su reparto exacto de repeticiones (o segundos) por oleada
const sesWave = i => SES.active && SES.waves ? SES.waves[Math.min(i, SES.waves.length - 1)] : null;
// Dificultad creciente: el valor efectivo de un ajuste en la oleada en curso. Sube un ramp % por cada oleada superada con
// soltura (RAMP.lvl, en el juego), hasta +60 %: llegan antes y hay menos tiempo para tocarlos o reventarlos; y, a la mitad de
// ese ritmo (para que la presión suba poco a poco), más enemigos a la vez, sus gestos y el vuelo errático; más recorrido, a
// un 40 % (hasta +24 %)
const RAMP_CAP = 0.6, RAMP_SLOWER = ['walkTime', 'tchArrive', 'barArrive', 'tchGap', 'tchWindow', 'barWait'], RAMP_DEEPER = ['squatDepth', 'pushDepth', 'lungeDepth', 'dipDepth', 'arcMin', 'arcMax'];
const rampK = () => settings.ramp > 0 && GAME_STATES.concat('paused').includes(state) ? Math.min(RAMP_CAP, settings.ramp / 100 * RAMP.lvl) : 0;
function dv(key) {
  const v = settings[key], k = rampK(); if (!k) return v;
  if (RAMP_DEEPER.includes(key)) { const f = SCHEMA.find(x => x.key === key); return Math.min(f ? f.max : v * 2, v * (1 + k * 0.4)); }
  if (key === 'maxAlive') return Math.round(v * (1 + k * 0.5));
  if (key === 'erratic' || key.startsWith('pace_')) return v * (1 + k * 0.5);
  return RAMP_SLOWER.includes(key) ? v / (1 + k) : v * (1 + k);
}
function waveReps(i) { return sesWave(i) || Math.max(1, Math.round(settings.repsWave + settings.repsInc * i)); }
function hangSecs(i) { return sesWave(i) || settings.hangTime + settings.hangInc * i; }
function updateSummary() {
  const n = settings.waves || 5;
  const hang = settings.exercise === 'hang';
  let total = 0; for (let i = 0; i < n; i++) total += hang ? hangSecs(i) : waveReps(i);
  const restT = settings.rest * Math.max(0, n - 1);
  const workT = hang ? total : total * (settings.mode === 'arcs' ? 60 / settings.arcRate : repTime());
  const mins = Math.round((restT + workT) / 60);
  let speed = '';
  if (isCombat()) speed = [foesHas('robots') ? `Los robots tardan ${settings.walkTime} s en alcanzarte.` : '', foesHas('flyers') ? `Los voladores van a ${fmtNum(settings.flySpeed)} km/h.` : '', autoAim() ? 'Disparo automático.' : 'Apuntas tú.'].filter(Boolean).join(' ');
  else if (settings.mode === 'touch') speed = `Cada objetivo tarda ${fmtNum(settings.tchArrive)} s en llegar y espera ${fmtNum(settings.tchWindow)} s${settings.bpm ? `, al ritmo de ${settings.bpm} BPM` : ''}.`;
  else if (settings.mode === 'bars') speed = hang ? `Si te sueltas, caes al charco.` : `Cada objetivo tarda ${fmtNum(settings.barArrive)} s en llegar a donde subirá tu cabeza.`;
  else speed = `${settings.arcRate} arcos por minuto a ${fmtNum(settings.arcSpeed)} km/h, bajando entre ${Math.min(settings.arcMin, settings.arcMax)} y ${Math.max(settings.arcMin, settings.arcMax)} cm${settings.arcJump ? `; el ${settings.arcJump} % son vallas que hay que saltar (${settings.jumpHeight} cm)` : ''}.`;
  $('#estimate').innerHTML = `${MODE_NAMES[settings.mode]} · ${EX_NAMES[settings.exercise]}: ${settings.waves ? `${settings.waves} oleadas` : 'oleadas sin fin (cuento las 5 primeras)'} suman <strong>${total}</strong> ${hang ? 'segundos colgado' : settings.mode === 'touch' ? 'objetivos' : 'repeticiones'}${settings.exercise === 'curl' || settings.exercise === 'press' ? ' entre los dos brazos' : ''}, unos <strong>${Math.max(1, mins)} min</strong> con descansos. ${speed}`;
}
/* ---------- Progreso: días seguidos, tiempo entrenado y calorías ---------- */
// Esfuerzo de cada ejercicio en MET (veces el gasto en reposo), aproximado del Compendium of Physical Activities; en los descansos, 2
const EX_MET = { slam: 7.5, squat: 5.5, lunge: 5, jsquat: 8, pushup: 6, inchworm: 6.5, dips: 5, curl: 3.5, curl2: 3.5, press: 4, press2: 4, thruster: 7, frontsq: 6, swing: 9.8, chop: 5, dlrow: 6, plank1: 4, plankrow: 5, splank: 3, superman: 3.5, row: 6, pullup: 8, hang: 3.5, jump: 8, abs: 3.8, combo: 6 };
const REST_MET = 2;
// kcal por minuto = MET × 3,5 × kg / 200; work son los segundos de oleada y rest los de descanso
function kcalOf(ex, work, rest, kg = settings.weight) { return ((EX_MET[ex] || 5) * work + REST_MET * Math.max(0, rest)) * 3.5 * kg / 200 / 60; }
// las rondas antiguas no guardaban calorías ni el tiempo de oleada: se estiman con su tiempo total
const runKcal = r => r.kcal != null ? r.kcal : kcalOf(r.ex, (r.time || 0) * 0.75, (r.time || 0) * 0.25);
const DAY_MS = 864e5;
const dayKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const noonOf = ms => { const d = new Date(ms); d.setHours(12, 0, 0, 0); return d.getTime(); }; // a mediodía, el cambio de hora no salta días
function progress(h = store(HIST_KEY) || [], now = Date.now()) {
  const days = new Set(h.map(r => dayKey(r.date))), today = dayKey(now);
  // racha: días seguidos entrenando; sigue viva hasta que acaba el día, así que si hoy aún no has entrenado cuenta desde ayer
  let streak = 0; for (let d = noonOf(now) - (days.has(today) ? 0 : DAY_MS); days.has(dayKey(d)); d -= DAY_MS) streak++;
  let best = 0, run = 0, prev = null;
  for (const k of [...days].sort()) { const t = noonOf(new Date(k + 'T12:00:00').getTime()); run = prev !== null && Math.round((t - prev) / DAY_MS) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = t; }
  const sum = list => ({ time: list.reduce((a, r) => a + (r.time || 0), 0), kcal: list.reduce((a, r) => a + runKcal(r), 0), runs: list.length, days: new Set(list.map(r => dayKey(r.date))).size });
  const weekFrom = noonOf(now) - 6.5 * DAY_MS; // los últimos 7 días, hoy incluido
  return { streak, best, trainedToday: days.has(today), today: sum(h.filter(r => dayKey(r.date) === today)), week: sum(h.filter(r => r.date >= weekFrom)), total: sum(h) };
}
const fmtDur = s => s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round(s % 3600 / 60)} min` : `${Math.round(s / 60)} min`;
const daysTxt = n => `${n} ${n === 1 ? 'día' : 'días'}`;
/* ---------- Hoy: lo primero de la página ---------- */
// Lo de hoy, grande y animado: un anillo que se llena hacia tu meta diaria, cifras que suben hasta su valor, cómo vas
// frente a ayer y a tu mejor día, tu racha y los últimos 7 días en barras. Para que apetezca volver y superarse
const WDAY = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'], MONTH = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function dayStats(h, now = Date.now()) {
  const by = new Map(); for (const r of h) { const k = dayKey(r.date); const d = by.get(k) || { time: 0, kcal: 0, reps: 0, perfect: 0, ex: {} }; d.time += r.time || 0; d.kcal += runKcal(r); d.reps += r.reps || 0; d.perfect += r.perfect || 0; d.ex[r.ex] = (d.ex[r.ex] || 0) + (r.reps || 0); by.set(k, d); }
  const zero = { time: 0, kcal: 0, reps: 0, perfect: 0, ex: {} }, at = k => by.get(k) || zero;
  const week = []; for (let i = 6; i >= 0; i--) { const t = noonOf(now) - i * DAY_MS; week.push({ k: dayKey(t), d: new Date(t), v: at(dayKey(t)) }); }
  let best = zero; for (const [k, v] of by) if (k !== dayKey(now) && v.time > best.time) best = v;
  return { today: at(dayKey(now)), yest: at(dayKey(noonOf(now) - DAY_MS)), best, week };
}
const numTxt = (v, dec) => dec ? fmtNum(v, 0.1) : String(Math.round(v));
function renderToday(h = store(HIST_KEY) || [], now = Date.now()) {
  const host = $('#todayBox'); if (!host) return;
  const D = dayStats(h, now), P = progress(h, now), T = D.today, goal = settings.goalMin * 60, k = Math.min(1, T.time / goal), d = new Date(now);
  const R = 52, C = 2 * Math.PI * R, mins = Math.round(T.time / 60);
  const cmp = (a, b, unit) => !b ? '' : a > b ? `<em class="up">▲ ${Math.round(a - b)} ${unit} más que ayer</em>` : a < b ? `<em class="down">${Math.round(b - a)} ${unit} menos que ayer</em>` : '<em>igual que ayer</em>';
  const tile = (cls, val, dec, lab, extra = '') => `<div class="tile ${cls}"><b data-to="${val}" data-dec="${dec}">${numTxt(val, dec)}</b><span>${lab}</span>${extra}</div>`;
  const maxW = Math.max(goal, ...D.week.map(w => w.v.time)) || 1;
  const exs = Object.entries(T.ex).sort((a, b) => b[1] - a[1]).map(([x, n]) => `<span class="chip">${EX_NAMES[x] || x} · ${n}</span>`).join('');
  const msg = !T.time ? (P.streak ? `Aún no has entrenado hoy: tu racha de ${daysTxt(P.streak)} te espera. ¡A por ella!` : 'Hoy es un buen día para empezar una racha.')
    : k >= 1 ? `¡Meta cumplida! ${D.best.time && T.time > D.best.time ? 'Y es tu mejor día. 🏆' : `Tu mejor día: ${fmtDur(D.best.time)}. ¿Lo superas?`}`
    : `Te ${goal - T.time > 90 ? `faltan ${Math.ceil((goal - T.time) / 60)} min` : 'falta muy poco'} para tu meta de ${settings.goalMin} min.`;
  host.innerHTML = `
    <div class="todayHead"><h2>Hoy</h2><span>${WDAY[d.getDay()]} ${d.getDate()} de ${MONTH[d.getMonth()]}</span></div>
    <div class="todayGrid">
      <div class="ring${k >= 1 ? ' done' : ''}" role="img" aria-label="${mins} de ${settings.goalMin} minutos de tu meta diaria">
        <svg viewBox="0 0 120 120"><defs><linearGradient id="ringG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3cf0c6"/><stop offset="1" stop-color="#ff4fa3"/></linearGradient></defs>
          <circle cx="60" cy="60" r="${R}" class="track"/><circle cx="60" cy="60" r="${R}" class="fill" style="stroke-dasharray:${C};stroke-dashoffset:${C}" data-off="${C * (1 - k)}"/></svg>
        <div class="ringTxt"><b data-to="${mins}" data-dec="0">${mins}</b><span>de ${settings.goalMin} min</span></div>
      </div>
      <div class="tiles">
        ${tile('t-reps', T.reps, 0, 'repeticiones', cmp(T.reps, D.yest.reps, 'reps'))}
        ${tile('t-kcal', Math.round(T.kcal), 0, '≈ kcal', cmp(T.kcal, D.yest.kcal, 'kcal'))}
        ${tile('t-perf', T.perfect, 0, 'perfectas', T.reps ? `<em>${Math.round(100 * T.perfect / T.reps)} % de las reps</em>` : '')}
        ${tile('t-streak', P.streak, 0, P.streak === 1 ? 'día de racha 🔥' : 'días de racha 🔥', `<em>mejor: ${daysTxt(P.best)}</em>`)}
      </div>
    </div>
    ${exs ? `<div class="chips">${exs}</div>` : ''}
    <div class="week" aria-label="Minutos de los últimos 7 días">${D.week.map((w, i) => `<div class="bar${i === 6 ? ' now' : ''}"><div class="col"><small>${w.v.time ? Math.round(w.v.time / 60) : ''}</small><i data-h="${Math.round(100 * w.v.time / maxW)}" style="height:0"></i></div><span>${i === 6 ? 'hoy' : WDAY[w.d.getDay()].slice(0, 2)}</span></div>`).join('')}<div class="goalLine" style="bottom:${22 + Math.round(76 * goal / maxW)}px" title="tu meta"></div></div>
    <p class="todayMsg">${msg}</p>`;
  // y en pequeño, en el panel fijo (lleva al grande)
  const mini = $('#todayMini');
  if (mini) mini.innerHTML = `<a href="#todayBox" aria-label="Hoy: ${mins} de ${settings.goalMin} minutos, ${T.reps} repeticiones, ${P.streak} días de racha. Ver el día"><span class="tmRing" style="--k:${Math.round(k * 100)}%"><i>${mins}</i></span><span class="tmS"><b>${mins} / ${settings.goalMin} min</b><small>hoy</small></span><span class="tmS"><b>${T.reps}</b><small>reps</small></span><span class="tmS"><b>${P.streak} 🔥</b><small>racha</small></span><span class="tmMore">Ver el día ↓</span></a>`;
  animateToday(host);
}
// Las cifras suben desde 0, el anillo se llena y las barras crecen (sin animación si el sistema pide menos movimiento)
function animateToday(host) {
  if (!host.querySelectorAll) return;
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches, raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
  const nums = [...host.querySelectorAll('[data-to]')], ring = host.querySelector && host.querySelector('.fill'), bars = [...host.querySelectorAll('[data-h]')];
  const finish = () => { nums.forEach(n => { n.textContent = numTxt(+n.dataset.to, +n.dataset.dec); }); if (ring) ring.style.strokeDashoffset = ring.dataset.off; bars.forEach(b => { b.style.height = (0.76 * b.dataset.h) + 'px'; }); };
  if (still || !raf) { finish(); return; }
  raf(() => raf(() => { if (ring) ring.style.strokeDashoffset = ring.dataset.off; bars.forEach((b, i) => { b.style.transitionDelay = `${i * 60}ms`; b.style.height = (0.76 * b.dataset.h) + 'px'; }); }));
  const t0 = performance.now(), dur = 1100;
  const step = t => { const u = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - u, 3); nums.forEach(n => { n.textContent = numTxt(+n.dataset.to * e, +n.dataset.dec); }); if (u < 1) raf(step); else finish(); };
  raf(step);
}
function renderHistory() {
  const h = store(HIST_KEY) || [], P = progress(h); renderToday(h);
  const box = (big, small) => `<div class="stat"><b>${big}</b><span>${small}</span></div>`;
  $('#progBox').innerHTML = h.length ? [
    box(daysTxt(P.streak), P.streak ? (P.trainedToday ? 'seguidos entrenando' : 'seguidos: entrena hoy para no perderla') : 'de racha: empieza hoy'),
    box(daysTxt(P.best), 'mejor racha'),
    box(fmtDur(P.week.time), `esta semana · ${daysTxt(P.week.days)} · ≈ ${Math.round(P.week.kcal)} kcal`),
    box(fmtDur(P.total.time), `en total · ${daysTxt(P.total.days)} · ≈ ${Math.round(P.total.kcal)} kcal`)
  ].join('') : '<p class="muted">Aún no hay partidas: tu racha de días, el tiempo entrenado y las calorías aparecerán aquí.</p>';
  $('#histBody').innerHTML = Object.keys(EX_NAMES).map(ex => {
    const s = h.filter(r => r.ex === ex);
    if (!s.length) return '';
    return `<tr><td>${EX_NAMES[ex]}${ex === 'hang' ? ' (segundos)' : ''}</td><td>${s.length}</td><td>${s.reduce((a, r) => a + r.reps, 0)}</td><td>${s.reduce((a, r) => Math.max(a, r.reps), 0) || '–'}</td><td>${s.reduce((a, r) => a + r.perfect, 0)}</td><td>${fmtDur(s.reduce((a, r) => a + (r.time || 0), 0))}</td><td>${Math.round(s.reduce((a, r) => a + runKcal(r), 0))}</td></tr>`;
  }).join('') || '<tr><td colspan="7" class="muted">Sin partidas todavía</td></tr>';
}
