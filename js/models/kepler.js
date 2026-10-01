// Система Кеплера: Astronomia nova (1609), Epitome (1618–1621), «Рудольфинские таблицы» (1627).
// Элементы a, e, i — Рудольфинские; Белый Ю. А., «Иоганн Кеплер».
import { jdFromCalendar } from '../time.js';
import { D, solveKepler, planeBasis, inPlane, sph, add, truePrecession, norm360,
         lunarMeanArgs, modernOfDate } from '../astro.js';
import { GuideList, SUN_DIST } from './common.js';

const EPOCH = jdFromCalendar(1627, 1, 1, 0);
const Y0 = 1627;
const PREC = 51 / 3600;
const SUN_ER = 3469;   // расстояние Солнца у Кеплера, радиусы Земли (Epitome)
const MOON_ER = 59;    // среднее расстояние Луны
const MOON_E = 0.04362;

// a — большая полуось (орбита Земли = 1), e — эксцентриситет, incl — наклон к эклиптике.
const PLANETS = {
  mercury: { a: 0.38806, e: 0.21000, incl: 6 + 54 / 60, P: 87.969 },
  venus:   { a: 0.72414, e: 0.00692, incl: 3 + 22 / 60, P: 224.701 },
  earth:   { a: 1.00000, e: 0.01800, incl: 0, P: 365.2564 },
  mars:    { a: 1.52350, e: 0.09265, incl: 1 + 50.5 / 60, P: 686.980 },
  jupiter: { a: 5.20000, e: 0.04822, incl: 1 + 19 / 60, P: 4332.59 },
  saturn:  { a: 9.51000, e: 0.05700, incl: 2 + 32 / 60, P: 10759.2 },
};
// Реконструкция: средние долготы, перигелии и узлы на 1627 г.
for (const [k, p] of Object.entries(PLANETS)) {
  const m = modernOfDate(k, EPOCH);
  p.L0 = m.L; p.peri = m.peri; p.node = m.node;
  p.b = p.a * Math.sqrt(1 - p.e * p.e);
}

const K = SUN_DIST;

export const kepler = {
  id: 'kepler',
  name: 'Кеплер',
  subtitle: '«Рудольфинские таблицы», 1627',
  geocentric: false,
  diurnalHeavens: false,
  observer: 'prague',
  starRadius: 18 * SUN_DIST,
  info: `<b>Кеплер («Новая астрономия» 1609, «Рудольфинские таблицы» 1627).</b> Планеты движутся по
эллипсам, Солнце — в фокусе (I закон); скорость — по закону площадей (II закон, уравнение Кеплера
M = E − e·sin E); периоды и полуоси связаны III законом. Эксцентриситеты: Меркурий 0,210, Венера 0,0069,
Земля 0,018, Марс 0,0926, Юпитер 0,048, Сатурн 0,057. Расстояние Солнца 3469 радиусов Земли.
Луна — эллипс (e = 0,0436) с эвекцией, вариацией и годичным уравнением.
<i>Реконструкция:</i> средние долготы, перигелии и узлы на 1627 г. Звёздная сфера у Кеплера огромна —
её радиус на экране условный.`,

  compute(jd, opts = {}) {
    const t = jd - EPOCH;
    const year = 2000 + (jd - 2451545) / 365.25;
    const sh = PREC * (year - Y0);
    const g = opts.guides ? new GuideList(K) : null;
    const pos = { sun: [0, 0, 0] };
    let earthL = 0;

    for (const [key, p] of Object.entries(PLANETS)) {
      const L = p.L0 + (360 / p.P) * t + sh;
      const peri = p.peri + sh, node = p.node + sh;
      if (key === 'earth') earthL = L;
      const M = norm360(L - peri) * D;
      const E = solveKepler(M, p.e);
      const bas = planeBasis(node, p.incl, peri);
      const v = inPlane(bas, p.a * (Math.cos(E) - p.e), p.b * Math.sin(E));
      pos[key] = [v[0] * K, v[1] * K, v[2] * K];
      if (g) {
        const ae = p.a * p.e;
        g.ellipse(key, 'orbit', inPlane(bas, -ae, 0), bas.e1, bas.e2, p.a, p.b);
        g.point(key, 'point', inPlane(bas, -2 * ae, 0), 'пустой фокус');
        g.line(key, 'line', inPlane(bas, p.a - ae, 0), inPlane(bas, -p.a - ae, 0)); // линия апсид
        g.line(key, 'line', [0, 0, 0], v);                                          // радиус-вектор
        if (p.incl > 0) {
          const n = sph(node);
          g.line(key, 'line', [-n[0] * p.a, -n[1] * p.a, 0], [n[0] * p.a, n[1] * p.a, 0]); // линия узлов
        }
      }
    }

    // Луна Кеплера: эллипс + эвекция, вариация, годичное уравнение; широта — по Тихо.
    const m = lunarMeanArgs(jd);
    const s = Math.sin, Mp = m.Mp * D, Dd = m.D * D;
    // e = 0,0436 даёт уравнение центра 5° в сизигиях; эвекция Кеплера — переменный эксцентриситет,
    // её амплитуда 1;16 добавляется в квадратурах (Птолемеевы 7;40) и вычитается в сизигиях.
    const ev = 1.274;
    const lon = m.L + (2 * MOON_E / D) * s(Mp) + (1.25 * MOON_E * MOON_E / D) * s(2 * Mp)
      + ev * (s(Mp) + s(2 * Dd - Mp)) + 0.658 * s(2 * Dd) - 0.186 * s(m.M * D);
    const dist = MOON_ER * (1 - MOON_E * Math.cos(Mp) - 0.0095 * Math.cos(2 * Dd - Mp));
    const nodeMean = norm360(m.L - m.F);
    const twoSN = 2 * (m.Ls - nodeMean) * D;
    const node = nodeMean - (1 + 46 / 60) * s(twoSN);
    const incl = 5 + 7.5 / 60 + (9.5 / 60) * Math.cos(twoSN);
    const sc = (SUN_DIST / SUN_ER) * (opts.moonScale ?? 1);
    const um = [Math.cos((lon - node) * D), Math.sin((lon - node) * D)];
    // Точка орбиты на угловом расстоянии (λ − Ω) от узла: базис плоскости от узла.
    const bm = planeBasis(node, incl, node);
    const mv = inPlane(bm, um[0] * dist * sc, um[1] * dist * sc);
    pos.moon = add(pos.earth, mv);
    if (g) {
      const gm = g.sub(sc, pos.earth);
      const a = MOON_ER, b = a * Math.sqrt(1 - MOON_E * MOON_E);
      const peri = m.L - m.Mp; // перигей Луны
      const be = planeBasis(node, incl, peri);
      gm.ellipse('moon', 'orbit', inPlane(be, -a * MOON_E, 0), be.e1, be.e2, a, b);
    }

    return {
      pos,
      guides: g ? g.items : [],
      eps: 23.5,
      meanSun: norm360(earthL + 180),
      precShift: truePrecession(Y0) + sh,
      starCenter: [0, 0, 0],
    };
  },
};
