// Система Тихо Браге в виде прото-тихонической схемы 17.02.1578 (пометки в экземпляре книги
// Коперника, найденные О. Гингеричем; Белый Ю. А., «Тихо Браге», с. 152–153).
// Солнечные параметры, расстояния и наклоны — Тихо (1588–1602).
import { jdFromCalendar } from '../time.js';
import { u2, add, mul, tiltFrame, truePrecession, norm360, lunarMeanArgs, modernOfDate } from '../astro.js';
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
const MOON_ER = 52;                           // расстояние Луны, радиусы Земли (Белый, с. 153)

// Расстояния — по Копернику (в долях расстояния Солнца); наклоны — по наблюдениям Тихо.
const PLANETS = {
  saturn:  { R: 9.1743, P: 10759.2, incl: 2 + 32 / 60, outer: true },
  jupiter: { R: 5.2192, P: 4332.3, incl: 1 + 19 / 60, outer: true },
  mars:    { R: 1.5198, P: 686.96, incl: 1 + 50 / 60, outer: true },
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

/**
 * Вокруг Солнца обращаются только Меркурий и Венера. Марс, Юпитер и Сатурн идут по деферентам
 * вокруг Земли, а их эпициклы равны орбите Солнца, и радиус эпицикла всегда параллелен направлению
 * Земля → Солнце. Земля, Солнце, центр эпицикла и планета образуют параллелограмм.
 */
function compute(jd, opts) {
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
    g.line('sun', 'line', [0, 0, 0], S);
  }

  const gs = g ? g.sub(K, pos.sun) : null;   // конструкции вокруг Солнца
  const ge = g ? g.sub(K, [0, 0, 0]) : null; // конструкции вокруг Земли
  for (const [key, p] of Object.entries(PLANETS)) {
    const L = p.L0 + (360 / p.P) * t + sh;
    if (p.outer) {
      // Деферент вокруг Земли (эксцентр + эпициклет для собственного неравенства планеты);
      // V — центр эпицикла. Эпицикл — копия орбиты Солнца, перенесённая в V.
      const V = epicycletPlanet(key, p, L, p.A + sh, p.node + sh, p.incl, ge);
      const P = add(V, S);
      pos[key] = mul(P, K);
      if (g) {
        g.circle(key, 'epicycle', add(V, C), [1, 0, 0], [0, 1, 0], 1);
        g.line(key, 'line', V, P); // радиус эпицикла ∥ Земля → Солнце
        g.line(key, 'line', S, P); // Солнце → планета: четвёртая сторона параллелограмма
      }
    } else {
      // Меркурий и Венера — вокруг Солнца (конструкции переносятся вместе с ним).
      const v = epicycletPlanet(key, p, L, p.A + sh, p.node + sh, p.incl, gs);
      pos[key] = add(pos.sun, mul(v, K));
    }
  }

  // Луна — по Копернику: вариацию и колебания наклона и узлов Тихо откроет позже.
  const m = lunarMeanArgs(jd);
  const s = (SUN_DIST / SUN_ER) * (opts.moonScale ?? 1);
  const gm = g ? g.sub(s, [0, 0, 0]) : null;
  const tf = tiltFrame(norm360(m.L - m.F), 5);
  const P = doubleEpicycleMoon(m.L, m.Mp + 180, m.D, MOON_ER, 0.1097 * MOON_ER, 0.0237 * MOON_ER, tf, gm);
  pos.moon = tf.map(P[0] * s, P[1] * s);

  return {
    pos,
    guides: g ? g.items : [],
    eps: 23 + 31.5 / 60,
    meanSun: norm360(sunL),
    precShift: truePrecession(Y0) + sh,
    starCenter: [0, 0, 0],
  };
}

export const tycho = {
  id: 'tycho',
  name: 'Тихо Браге',
  subtitle: 'прото-тихоническая схема, 17.02.1578',
  geocentric: true,
  diurnalHeavens: true,
  observer: 'uraniborg',
  starRadius: (STAR_ER / SUN_ER) * SUN_DIST,
  info: `<b>Тихо Браге: прото-тихоническая схема (17 февраля 1578 г.)</b> — по пометкам в экземпляре книги
Коперника, найденным О. Гингеричем (позже он сам сомневался в почерке). Земля неподвижна в центре, вокруг неё
обращаются Луна и Солнце; вокруг Солнца — только Меркурий и Венера. Марс, Юпитер и Сатурн идут по деферентам
с центром в Земле, а их эпициклы равны орбите Солнца; радиус эпицикла всегда параллелен направлению
Земля → Солнце. Земля, Солнце, центр эпицикла и планета образуют <i>параллелограмм</i> (включите «Линии
построения»); проведя сторону Солнце → планета, Тихо получит систему 1588 г. Солнце: эксцентр e = 0,03584,
апогей 5;30 Рака, год 365 д 5 ч 48 мин 45 с, 1150 радиусов Земли; Луна — около 52, по теории Коперника.
Звёздная сфера — 14 000 радиусов Земли, вращается вокруг Земли за сутки. Прецессия 51″/год, наклон эклиптики 23;31,30.
<i>Реконструкция:</i> средние долготы, апсиды и узлы на 1590 г.; эксцентры и эпициклеты деферентов.`,
  compute(jd, opts = {}) { return compute(jd, opts); },
};
