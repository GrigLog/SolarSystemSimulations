// Система Птолемея: «Альмагест» (кн. III–XIII) + расстояния из «Гипотез о планетах».
// Источники параметров: Toomer, Ptolemy's Almagest (1984); Pedersen, A Survey of the Almagest;
// Бронштэн, «Клавдий Птолемей» (табл. 4 «Гипотез»).
import { sex } from '../time.js';
import { D, u2, sph, tiltFrame, truePrecession, norm360 } from '../astro.js';
import { GuideList, SUN_DIST } from './common.js';

// Эпоха «Альмагеста»: 1 тота 1-го года Набонассара (26.02.−746), полдень Александрии (UT ≈ 10ʰ).
const EPOCH = 1448637.917;
const R = 60; // радиус деферента в «частях»

// Средние суточные движения (Альмагест IX.3, IV.4), градусы в сутки.
const SUN_N = sex('0;59,8,17,13,12,31');
const SUN_0 = sex('330;45');
const SUN_E = sex('2;30');
const SUN_A = sex('65;30');        // апогей Солнца, тропически неподвижен (кн. III)
const SUN_DIST_ER = 1210;          // среднее расстояние Солнца, радиусы Земли (кн. V)

const MOON = {
  lon0: sex('41;22'), nLon: sex('13;10,34,58,33,30,30'),
  el0: sex('70;37'), nEl: sex('12;11,26,41,20,17,59'),
  an0: sex('268;49'), nAn: sex('13;3,53,56,17,51,59'),
  lat0: sex('354;15'), nLat: sex('13;13,45,39,48,56,37'),
  R: sex('49;41'), e: sex('10;19'), r: sex('5;15'), incl: 5,
  maxER: sex('64;10'), // наибольшее расстояние Луны (кн. V.13)
};

// Планеты: эксцентриситет e (центр деферента), эквант на 2e; радиус эпицикла r; апогей A0 на эпоху.
// i1 — наклон деферента, i2 — наклон эпицикла (кн. XIII); nl — северный предел относительно апогея.
// PH — внешний радиус сферы планеты в «Гипотезах о планетах» (радиусы Земли).
const PLANETS = {
  saturn: { e: sex('3;25'), r: sex('6;30'), A0: sex('224;10'), lon0: sex('296;43'), nLon: sex('0;2,0,33,31,28,51'),
            an0: sex('34;2'), nAn: sex('0;57,7,43,41,43,40'), outer: true, i1: 2.5, i2: 4.5, nl: -50, PH: 19865 },
  jupiter: { e: sex('2;45'), r: sex('11;30'), A0: sex('152;9'), lon0: sex('184;41'), nLon: sex('0;4,59,14,26,46,31'),
            an0: sex('146;4'), nAn: sex('0;54,9,2,46,26,0'), outer: true, i1: 1.5, i2: 2.5, nl: 20, PH: 14187 },
  mars:   { e: sex('6;0'), r: sex('39;30'), A0: sex('106;40'), lon0: sex('3;32'), nLon: sex('0;31,26,36,53,51,33'),
            an0: sex('327;13'), nAn: sex('0;27,41,40,19,20,58'), outer: true, i1: 1.0, i2: 2.25, nl: 0, PH: 8820 },
  // Внутренние: центр эпицикла идёт со средним Солнцем. i0 — колебание деферента,
  // inc — наклон (ἔγκλισις) диаметра апогей–перигей эпицикла, sl — «косина» (λόξωσις).
  venus:  { e: sex('1;15'), r: sex('43;10'), A0: sex('46;10'), an0: sex('71;7'), nAn: sex('0;36,59,25,53,11,28'),
            i0: sex('0;10'), inc: sex('2;30'), sl: sex('3;30'), sigma: 1, PH: 1079 },
  mercury: { e: sex('3;0'), r: sex('22;30'), A0: sex('181;10'), an0: sex('21;55'), nAn: sex('3;6,24,6,59,35,50'),
            i0: sex('0;45'), inc: sex('6;15'), sl: sex('7;0'), sigma: -1, PH: 166, crank: true },
};

const K = SUN_DIST / SUN_DIST_ER; // радиусы Земли → единицы отображения
const STAR_ER = 20000;            // сфера неподвижных звёзд («Гипотезы»)

// Центр деферента C и эквант Q в системе «x → апогей» (Земля в начале координат).
function centers(p, kappa) {
  if (p.crank) {
    // Меркурий: эквант на e от Земли; центр деферента вращается по кругу радиуса e
    // вокруг точки на 2e, навстречу движению центра эпицикла (кривошип).
    const F = [2 * p.e, 0];
    const c = u2(-kappa);
    return { Q: [p.e, 0], C: [F[0] + p.e * c[0], F[1] + p.e * c[1]], F };
  }
  return { Q: [2 * p.e, 0], C: [p.e, 0] };
}

// Центр эпицикла K: на деференте (центр C, радиус R), под углом κ, видимым из экванта Q.
function epicycleCenter(Q, C, kappa) {
  const u = u2(kappa);
  const d = [Q[0] - C[0], Q[1] - C[1]];
  const du = d[0] * u[0] + d[1] * u[1];
  const rho = -du + Math.sqrt(du * du - (d[0] * d[0] + d[1] * d[1]) + R * R);
  return [Q[0] + rho * u[0], Q[1] + rho * u[1]];
}

// Масштаб планеты: наибольшее расстояние = внешнему радиусу её сферы в «Гипотезах».
for (const p of Object.values(PLANETS)) {
  let maxD = 0;
  for (let k = 0; k < 360; k += 0.5) {
    const { Q, C } = centers(p, k);
    const Kc = epicycleCenter(Q, C, k);
    maxD = Math.max(maxD, Math.hypot(Kc[0], Kc[1]) + p.r);
  }
  p.scale = p.PH / maxD; // радиусов Земли на «часть»
}

function planet(key, p, t, sunMean, g) {
  const A = p.A0 + t / 36500;                 // апогеи движутся со звёздами: 1° за 100 лет
  const lon = p.outer ? p.lon0 + p.nLon * t : sunMean;
  const alpha = p.an0 + p.nAn * t;            // аномалия от среднего апогея эпицикла
  const kappa = lon - A;                      // средний эксцентрический аргумент (из экванта)
  const { Q, C, F } = centers(p, kappa);
  const Kc = epicycleCenter(Q, C, kappa);

  let tf, er, et;
  const rotA = (x, y) => { const c = Math.cos(A * D), s = Math.sin(A * D); return [x * c - y * s, x * s + y * c]; };
  if (p.outer) {
    // Деферент наклонён на i1, северный предел — в A + nl.
    tf = tiltFrame(A + p.nl - 90, p.i1);
    const M = (v) => tf.map(...rotA(v[0], v[1]));
    const ur = M(u2(kappa)), ut = M(u2(kappa + 90));
    // Диаметр апогей–перигей эпицикла отклонён на i2·cos ω; перигей — в ту же сторону, что и деферент.
    const j = p.i2 * Math.cos((kappa - p.nl) * D);
    const cj = Math.cos(j * D), sj = Math.sin(j * D);
    er = [ur[0] * cj - tf.n[0] * sj, ur[1] * cj - tf.n[1] * sj, ur[2] * cj - tf.n[2] * sj];
    et = ut;
    tf.M = M;
  } else {
    // Деферент «качается»: отклонение σ·i0·cos κ вокруг линии, перпендикулярной апсидам,
    // так что центр эпицикла всегда к северу (Венера) или к югу (Меркурий) на i0·cos²κ.
    tf = tiltFrame(A - 90, p.sigma * p.i0 * Math.cos(kappa * D));
    const M = (v) => tf.map(...rotA(v[0], v[1]));
    const ur = M(u2(kappa)), ut = M(u2(kappa + 90));
    const j1 = p.sigma * p.inc * Math.sin(kappa * D);
    const j2 = p.sigma * p.sl * Math.cos(kappa * D);
    const c1 = Math.cos(j1 * D), s1 = Math.sin(j1 * D), c2 = Math.cos(j2 * D), s2 = Math.sin(j2 * D);
    er = [ur[0] * c1 + tf.n[0] * s1, ur[1] * c1 + tf.n[1] * s1, ur[2] * c1 + tf.n[2] * s1];
    et = [ut[0] * c2 + tf.n[0] * s2, ut[1] * c2 + tf.n[1] * s2, ut[2] * c2 + tf.n[2] * s2];
    tf.M = M;
  }
  const M = tf.M;
  const K3 = M(Kc);
  const ca = Math.cos(alpha * D), sa = Math.sin(alpha * D);
  const P = [K3[0] + p.r * (ca * er[0] + sa * et[0]), K3[1] + p.r * (ca * er[1] + sa * et[1]), K3[2] + p.r * (ca * er[2] + sa * et[2])];

  if (g) {
    const s = g.sub(p.scale * K, [0, 0, 0]);
    const C3 = M(C), Q3 = M(Q);
    s.circle(key, 'orbit', C3, M([1, 0]), M([0, 1]), R);
    s.circle(key, 'epicycle', K3, er, et, p.r);
    s.point(key, 'point', C3, 'центр');
    s.point(key, 'point', Q3, 'эквант');
    s.line(key, 'line', M([C[0] - R, 0]), M([C[0] + R, 0])); // линия апсид
    s.line(key, 'line', Q3, K3);                              // луч равномерного движения из экванта
    s.line(key, 'line', K3, P);
    if (F) {
      const F3 = M(F);
      s.circle(key, 'epicycle', F3, M([1, 0]), M([0, 1]), p.e); // кривошип Меркурия
      s.point(key, 'point', F3);
    }
  }
  return [P[0] * p.scale * K, P[1] * p.scale * K, P[2] * p.scale * K];
}

function moon(t, sunMean, g, moonScale) {
  const m = MOON;
  const lon = m.lon0 + m.nLon * t;
  const eta = m.el0 + m.nEl * t;              // средняя элонгация
  const alpha = m.an0 + m.nAn * t;
  const omega = m.lat0 + m.nLat * t;          // аргумент широты, от северного предела (кн. IV)
  const node = lon - omega - 90;              // восходящий узел (движется попятно)
  // Центр деферента вращается вокруг Земли на расстоянии e, к долготе λ̄ − 2η.
  const c = u2(lon - 2 * eta), C = [m.e * c[0], m.e * c[1]];
  const u = u2(lon);
  const cu = C[0] * u[0] + C[1] * u[1];
  const rho = cu + Math.sqrt(cu * cu - m.e * m.e + m.R * m.R);
  const Kc = [rho * u[0], rho * u[1]];
  // Точка просневсиса N — напротив центра деферента; средний апогей эпицикла на прямой N→K.
  const N = [-C[0], -C[1]];
  const psi = Math.atan2(Kc[1] - N[1], Kc[0] - N[0]) / D;
  const w = u2(psi - alpha);                  // по эпициклу Луна идёт «против знаков»
  const P2 = [Kc[0] + m.r * w[0], Kc[1] + m.r * w[1]];
  const tf = tiltFrame(node, m.incl);
  const s = (m.maxER / (m.R + m.e + m.r)) * K * moonScale;
  if (g) {
    const gm = g.sub(s, [0, 0, 0]);
    gm.circle('moon', 'orbit', tf.map(...C), tf.ex, tf.ey, m.R);
    gm.circle('moon', 'orbit', [0, 0, 0], tf.ex, tf.ey, m.e);
    gm.circle('moon', 'epicycle', tf.map(...Kc), tf.ex, tf.ey, m.r);
    gm.point('moon', 'point', tf.map(...C), 'центр');
    gm.point('moon', 'point', tf.map(...N), 'просневсис');
    gm.line('moon', 'line', tf.map(...N), tf.map(...Kc));
  }
  const P = tf.map(...P2);
  return [P[0] * s, P[1] * s, P[2] * s];
}

export const ptolemy = {
  id: 'ptolemy',
  name: 'Птолемей',
  subtitle: '«Альмагест», ок. 150 г.',
  geocentric: true,
  diurnalHeavens: true,
  observer: 'alexandria',
  starRadius: STAR_ER * K,
  info: `<b>Птолемей («Альмагест», «Гипотезы о планетах»).</b> Эпоха — 1 тота 1-го года Набонассара (−746).
Средние движения и радиксы — из кн. IV и IX. Солнце: эксцентр e = 2;30, апогей 65;30, год 365;14,48 сут.
Планеты: эксцентр + <i>эквант</i> на двойном расстоянии + эпицикл. Меркурий — кривошипный механизм,
Луна — вращающийся деферент и точка просневсиса. Широты — по кн. XIII. Прецессия 1° за 100 лет:
со временем звёзды и апогеи «отстают» от истинных. Расстояния — по вложенным сферам «Гипотез»
(Луна 33–64, Солнце 1160–1260, Сатурн до 19 865 радиусов Земли; звёзды — 20 000).`,

  compute(jd, opts = {}) {
    const t = jd - EPOCH;
    const year = 2000 + (jd - 2451545) / 365.25;
    const g = opts.guides ? new GuideList() : null;
    const sunMean = SUN_0 + SUN_N * t;
    const pos = { earth: [0, 0, 0] };

    // Солнце: простой эксцентр.
    const cs = u2(SUN_A), C = [SUN_E * cs[0], SUN_E * cs[1], 0];
    const us = u2(sunMean);
    const ks = (SUN_DIST_ER / R) * K;
    pos.sun = [(C[0] + R * us[0]) * ks, (C[1] + R * us[1]) * ks, 0];
    if (g) {
      const s = g.sub(ks, [0, 0, 0]);
      s.circle('sun', 'orbit', C, [1, 0, 0], [0, 1, 0], R);
      s.point('sun', 'point', C, 'центр');
      s.line('sun', 'line', [C[0] - R * cs[0], C[1] - R * cs[1], 0], [C[0] + R * cs[0], C[1] + R * cs[1], 0]);
    }
    for (const [key, p] of Object.entries(PLANETS)) pos[key] = planet(key, p, t, sunMean, g);
    pos.moon = moon(t, sunMean, g, opts.moonScale ?? 1);

    return {
      pos,
      guides: g ? g.items : [],
      eps: sex('23;51,20'),
      meanSun: norm360(sunMean),
      precShift: truePrecession(137) + 0.01 * (year - 137), // звёзды верны в эпоху каталога
      starCenter: [0, 0, 0],
    };
  },
};
