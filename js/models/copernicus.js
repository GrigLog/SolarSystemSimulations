// Система Коперника: De revolutionibus orbium coelestium (1543).
// Параметры — по кн. III–VI в изложении Swerdlow & Neugebauer, «Mathematical Astronomy in
// Copernicus's De Revolutionibus» (1984); Белый Ю. А., «Николай Коперник».
import { jdFromCalendar } from '../time.js';
import { D, u2, add, tiltFrame, truePrecession, norm360, lunarMeanArgs, modernOfDate } from '../astro.js';
import { GuideList, SUN_DIST } from './common.js';
import { epicycletPlanet, doubleEpicycleMoon } from './circles.js';

const EPOCH = jdFromCalendar(1525, 1, 1, 0); // эпоха реконструкции радиксов (наблюдения Коперника 1512–1529)
const Y0 = 1525;
const SIDEREAL_ARIES = 26.4; // долгота γ Овна (начала сидерического отсчёта Коперника) в 1525 г.

// Прецессия: средняя 50,2″/год + неравномерность («трепидация», кн. III):
// период аномалии 1717 лет, амплитуда ±70′; наибольшая скорость — около 880 г. (аль-Баттани).
const trep = (y) => (70 / 60) * Math.sin(((y - 880) / 1717) * 360 * D);
const shift = (y) => (50.2 / 3600) * (y - Y0) + trep(y) - trep(Y0); // от эпохи
// Наклон эклиптики колеблется между 23;28 и 23;52 с периодом 3434 года (III.10), минимум — в XVI в.
const obliquity = (y) => 23.6667 - 0.2 * Math.cos(((y - Y0) / 3434) * 360 * D);

const E_EARTH = 0.0323;           // эксцентриситет земной орбиты (III.16, для 1515 г.)
const SUN_APOGEE = 96 + 40 / 60;  // апогей Солнца: 6;40 Рака (1515 г.)
const YEAR_SID = 365 + 6 / 24 + 9 / 1440 + 40 / 86400; // звёздный год 365 д 6 ч 9 мин 40 с
const SUN_ER = 1142;              // расстояние Солнца в радиусах Земли (IV.19)

// R — радиус орбиты (орбита Земли = 1), d — эксцентриситет деферента, r — эпициклет (r = d/3).
// A — апсида (сидерическая долгота Коперника + γ Овна). Наклон колеблется от imin до imax:
// наибольший, когда Земля между Солнцем и планетой (кн. VI). node — восходящий узел.
const PLANETS = {
  saturn:  { R: 9.1743, d: 0.0854 * 9.1743, r: 0.0285 * 9.1743, A: 240 + 21 / 60 + SIDEREAL_ARIES, P: 10759.2,
             imin: 2 + 16 / 60, imax: 2 + 44 / 60, node: 112.4 },
  jupiter: { R: 5.2192, d: 0.0687 * 5.2192, r: 0.0229 * 5.2192, A: 159 + SIDEREAL_ARIES, P: 4332.3,
             imin: 1 + 18 / 60, imax: 1 + 42 / 60, node: 110.4 },
  mars:    { R: 1.5198, d: 0.1460 * 1.5198, r: 0.0500 * 1.5198, A: 119 + 40 / 60 + SIDEREAL_ARIES, P: 686.96,
             imin: 0 + 9 / 60, imax: 1 + 51 / 60, node: 44.9 },
  venus:   { R: 0.7193, d: 0.0104, r: 0.0035, A: 48 + 20 / 60 + SIDEREAL_ARIES, P: 224.70,
             imin: 2.5, imax: 3 + 29 / 60, node: 72.4, inner: true },
  // Меркурий: радиус орбиты «дышит» (пара Туси, V.25) от 0,3573 до 0,3953.
  mercury: { R: 0.3763, d: 0.0736, r: 0.0211, A: 211 + 30 / 60 + SIDEREAL_ARIES, P: 87.97,
             imin: 6.25, imax: 7.0, node: 42.6, inner: true, libr: 0.019 },
};
// Радиксы (средние гелиоцентрические долготы на эпоху) — реконструкция.
for (const [k, p] of Object.entries(PLANETS)) p.L0 = modernOfDate(k, EPOCH).L;
const EARTH_L0 = modernOfDate('earth', EPOCH).L;

const K = SUN_DIST; // орбита Земли = 1 → единицы отображения
const MOON_ER = 60 + 18 / 60; // среднее расстояние Луны в сизигиях, радиусы Земли (IV.17)

export const copernicus = {
  id: 'copernicus',
  name: 'Коперник',
  subtitle: '«О вращениях небесных сфер», 1543',
  geocentric: false,
  diurnalHeavens: false,
  observer: 'frombork',
  starRadius: 18 * SUN_DIST,
  info: `<b>Коперник (De revolutionibus, 1543).</b> Центр системы — центр земной орбиты; Солнце смещено
от него на 0,0323 (апогей 6;40 Рака). Планеты — эксцентр + эпициклет (d : r = 3 : 1) вместо экванта,
все движения равномерные. Расстояния: Меркурий 0,376, Венера 0,719, Марс 1,520, Юпитер 5,219, Сатурн 9,174.
Наклоны орбит «колеблются» (кн. VI). Луна — двойной эпицикл, 60;18 радиусов Земли; Солнце — 1142.
Прецессия 50,2″/год с трепидацией ±70′; наклон эклиптики меняется от 23;28 до 23;52.
<i>Реконструкция:</i> средние долготы на 1525 г., узлы Венеры и Меркурия, эксцентриситет Венеры.
Сфера звёзд «неизмеримо» далека — её радиус на экране условный.`,

  compute(jd, opts = {}) {
    const t = jd - EPOCH;
    const year = 2000 + (jd - 2451545) / 365.25;
    const sh = shift(year);
    const g = opts.guides ? new GuideList(K) : null;
    const pos = {};

    // Земля обращается вокруг центра своей орбиты M (= начало координат).
    const earthL = EARTH_L0 + (360 / YEAR_SID) * t + sh;
    const ue = u2(earthL);
    pos.earth = [ue[0] * K, ue[1] * K, 0];
    const A = SUN_APOGEE + sh;
    const ua = u2(A);
    pos.sun = [E_EARTH * ua[0] * K, E_EARTH * ua[1] * K, 0];
    if (g) {
      g.circle('earth', 'orbit', [0, 0, 0], [1, 0, 0], [0, 1, 0], 1);
      g.point('earth', 'point', [0, 0, 0], 'центр орбиты Земли');
      g.line('earth', 'line', [-ua[0], -ua[1], 0], [ua[0], ua[1], 0]);
    }

    for (const [key, p] of Object.entries(PLANETS)) {
      const L = p.L0 + (360 / p.P) * t + sh;
      // Колебание наклона: максимум при соединении Земли с планетой (противостояние / нижнее соединение).
      const phase = Math.cos((L - earthL) * D);
      const incl = p.imin + (p.imax - p.imin) * (1 + phase) / 2;
      if (p.libr) p.Rnow = p.R - p.libr * Math.cos(2 * (earthL - p.A - sh) * D);
      const v = epicycletPlanet(key, p, L, p.A + sh, p.node + sh, incl, g);
      pos[key] = [v[0] * K, v[1] * K, v[2] * K];
    }

    // Луна (средние аргументы — реконструкция по современным, в пределах точности таблиц).
    const m = lunarMeanArgs(jd);
    const moonScale = opts.moonScale ?? 1;
    const s = (SUN_DIST / SUN_ER) * moonScale;
    const tf = tiltFrame(norm360(m.L - m.F), 5);
    const gm = g ? g.sub(s, pos.earth) : null;
    // Аномалия Коперника отсчитывается от апогея эпицикла, современная M′ — от перигея.
    const P = doubleEpicycleMoon(m.L, m.Mp + 180, m.D, MOON_ER, 0.1097 * MOON_ER, 0.0237 * MOON_ER, tf, gm);
    pos.moon = add(pos.earth, tf.map(P[0] * s, P[1] * s));

    return {
      pos,
      guides: g ? g.items : [],
      eps: obliquity(year),
      meanSun: norm360(earthL + 180),
      precShift: truePrecession(Y0) + sh,
      starCenter: [0, 0, 0],
    };
  },
};
