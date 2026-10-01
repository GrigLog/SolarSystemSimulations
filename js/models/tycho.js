// Система Тихо Браге (гео-гелиоцентрическая): De mundi aetherei recentioribus phaenomenis (1588),
// Astronomiae instauratae progymnasmata (1602); планетная теория доведена Лонгомонтаном
// (Astronomia Danica, 1622) в духе эпициклетов Коперника. Белый Ю. А., «Тихо Браге».
import { jdFromCalendar } from '../time.js';
import { D, u2, add, tiltFrame, truePrecession, norm360, lunarMeanArgs, modernOfDate } from '../astro.js';
import { GuideList, SUN_DIST } from './common.js';
import { epicycletPlanet, doubleEpicycleMoon } from './circles.js';

const EPOCH = jdFromCalendar(1590, 1, 1, 0);
const Y0 = 1590;
const PREC = 51 / 3600;                       // прецессия, °/год
const YEAR_TROP = 365 + (5 * 3600 + 48 * 60 + 45) / 86400; // 365 д 5 ч 48 мин 45 с
const SUN_E = 0.03584;                        // эксцентриситет солнечной орбиты (простой эксцентр)
const SUN_APOGEE = 95.5;                      // 5;30 Рака
const SUN_ER = 1150;                          // расстояние Солнца, радиусы Земли
const STAR_ER = 14000;                        // сфера неподвижных звёзд
const MOON_ER = 56;                           // среднее расстояние Луны (между 52 и 60)

// Расстояния — по Копернику (в долях расстояния Солнца); наклоны — по наблюдениям Тихо.
const PLANETS = {
  saturn:  { R: 9.1743, P: 10759.2, incl: 2 + 32 / 60 },
  jupiter: { R: 5.2192, P: 4332.3, incl: 1 + 19 / 60 },
  mars:    { R: 1.5198, P: 686.96, incl: 1 + 50 / 60 },
  venus:   { R: 0.7193, P: 224.70, incl: 3 + 22 / 60 },
  mercury: { R: 0.3763, P: 87.97, incl: 6 + 54 / 60 },
};
// Реконструкция: радиксы, апсиды и узлы на 1590 г.; эксцентриситеты эквантов 2e делятся
// на эксцентр и эпициклет в отношении 3 : 1, как у Коперника.
for (const [k, p] of Object.entries(PLANETS)) {
  const m = modernOfDate(k, EPOCH);
  p.L0 = m.L; p.A = m.peri + 180; p.node = m.node;
  p.d = 1.5 * m.e * p.R; p.r = 0.5 * m.e * p.R;
}
const SUN_L0 = modernOfDate('earth', EPOCH).L + 180;

const K = SUN_DIST;

export const tycho = {
  id: 'tycho',
  name: 'Тихо Браге',
  subtitle: 'гео-гелиоцентрическая система, 1588',
  geocentric: true,
  diurnalHeavens: true,
  observer: 'uraniborg',
  starRadius: (STAR_ER / SUN_ER) * SUN_DIST,
  info: `<b>Тихо Браге (1588; таблицы — Лонгомонтан, 1622).</b> Земля неподвижна в центре; вокруг неё
обращаются Луна и Солнце, а пять планет — вокруг Солнца. Орбита Марса пересекает орбиту Солнца:
твёрдых сфер нет. Солнце: эксцентр e = 0,03584, апогей 5;30 Рака, год 365 д 5 ч 48 мин 45 с,
расстояние 1150 радиусов Земли. Звёздная сфера — 14 000 радиусов Земли и вращается вокруг Земли за сутки.
Луна: двойной эпицикл (уравнение центра 4;58), <i>вариация</i> 40,5′ (открытие Тихо), наклон колеблется
от 4;58 до 5;17, узлы колеблются на ±1;46. Прецессия 51″/год, наклон эклиптики 23;31,30.
<i>Реконструкция:</i> средние долготы, апсиды и узлы планет на 1590 г.; эпициклеты по схеме Коперника.`,

  compute(jd, opts = {}) {
    const t = jd - EPOCH;
    const year = 2000 + (jd - 2451545) / 365.25;
    const sh = PREC * (year - Y0);
    const g = opts.guides ? new GuideList(K) : null;
    const pos = { earth: [0, 0, 0] };

    // Солнце на эксцентре вокруг Земли.
    const sunL = SUN_L0 + (360 / YEAR_TROP) * t;
    const A = SUN_APOGEE + sh;
    const ua = u2(A), us = u2(sunL);
    const C = [SUN_E * ua[0], SUN_E * ua[1], 0];
    const S = [C[0] + us[0], C[1] + us[1], 0];
    pos.sun = [S[0] * K, S[1] * K, 0];
    if (g) {
      g.circle('sun', 'orbit', C, [1, 0, 0], [0, 1, 0], 1);
      g.point('sun', 'point', C, 'центр');
      g.line('sun', 'line', [C[0] - ua[0], C[1] - ua[1], 0], [C[0] + ua[0], C[1] + ua[1], 0]);
    }

    // Планеты — вокруг Солнца (конструкции переносятся вместе с ним).
    const gs = g ? g.sub(K, pos.sun) : null;
    for (const [key, p] of Object.entries(PLANETS)) {
      const L = p.L0 + (360 / p.P) * t + sh;
      const v = epicycletPlanet(key, p, L, p.A + sh, p.node + sh, p.incl, gs);
      pos[key] = add(pos.sun, [v[0] * K, v[1] * K, v[2] * K]);
    }

    // Луна Тихо.
    const m = lunarMeanArgs(jd);
    const nodeMean = norm360(m.L - m.F);
    const twoSN = 2 * (m.Ls - nodeMean) * D;
    const node = nodeMean - (1 + 46 / 60) * Math.sin(twoSN);       // либрация узлов
    const incl = 5 + 7.5 / 60 + (9.5 / 60) * Math.cos(twoSN);     // 4;58 … 5;17
    const tf = tiltFrame(node, incl);
    const s = (SUN_DIST / SUN_ER) * (opts.moonScale ?? 1);
    const gm = g ? g.sub(s, [0, 0, 0]) : null;
    const P = doubleEpicycleMoon(m.L, m.Mp + 180, m.D, MOON_ER, 0.1083 * MOON_ER, 0.0217 * MOON_ER, tf, gm);
    // Вариация: 40,5′·sin 2η — поворот вокруг Земли в плоскости орбиты.
    const vr = (40.5 / 60) * Math.sin(2 * m.D * D) * D;
    const cv = Math.cos(vr), sv = Math.sin(vr);
    pos.moon = tf.map((P[0] * cv - P[1] * sv) * s, (P[0] * sv + P[1] * cv) * s);

    return {
      pos,
      guides: g ? g.items : [],
      eps: 23 + 31.5 / 60,
      meanSun: norm360(sunL),
      precShift: truePrecession(Y0) + sh,
      starCenter: [0, 0, 0],
    };
  },
};
