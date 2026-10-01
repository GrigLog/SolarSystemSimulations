// Геометрия и общие астрономические функции. Векторы — массивы [x, y, z]
// в эклиптической системе: x → точка весеннего равноденствия, z → северный полюс эклиптики.

export const D = Math.PI / 180;
export const TAU = Math.PI * 2;

export const norm360 = (a) => ((a % 360) + 360) % 360;
export const u2 = (deg) => [Math.cos(deg * D), Math.sin(deg * D)];

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// Единичный вектор по долготе λ и широте β (градусы).
export function sph(lonDeg, latDeg = 0) {
  const l = lonDeg * D, b = latDeg * D;
  return [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
}

export function lonLat(v) {
  const r = len(v);
  return { lon: norm360(Math.atan2(v[1], v[0]) / D), lat: Math.asin(Math.max(-1, Math.min(1, v[2] / r))) / D, r };
}

// Поворот вектора v вокруг единичной оси k на угол (градусы), формула Родрига.
export function rotate(v, k, deg) {
  const c = Math.cos(deg * D), s = Math.sin(deg * D);
  const kv = cross(k, v), kd = dot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
}

export const rotZ = (v, deg) => {
  const c = Math.cos(deg * D), s = Math.sin(deg * D);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
};

/**
 * Наклонённая плоскость орбиты: базис (e1, e2, n), где e1 — направление долготы lon0
 * в плоскости эклиптики, повёрнутое вместе с плоскостью, n — северная нормаль.
 * Плоскость наклонена на incl вокруг линии узлов с восходящим узлом в долготе node.
 * Точка плоскости с «долготой» θ (отсчитанной по плоскости от lon0): e1 cosθ + e2 sinθ.
 */
export function planeBasis(node, incl, lon0 = 0) {
  const k = sph(node);
  const e1 = rotate(sph(lon0), k, incl);
  const e2 = rotate(sph(lon0 + 90), k, incl);
  const n = rotate([0, 0, 1], k, incl);
  return { e1, e2, n };
}

/**
 * Наклон плоской (2D, в координатах эклиптики x→γ, y→90°) конструкции на угол incl
 * вокруг линии узлов с восходящим узлом в долготе node. Возвращает линейное отображение.
 */
export function tiltFrame(node, incl) {
  const k = sph(node);
  const ex = rotate([1, 0, 0], k, incl), ey = rotate([0, 1, 0], k, incl), n = rotate([0, 0, 1], k, incl);
  const map = (x, y) => [ex[0] * x + ey[0] * y, ex[1] * x + ey[1] * y, ex[2] * x + ey[2] * y];
  return { map, ex, ey, n, dir: (deg) => map(Math.cos(deg * D), Math.sin(deg * D)) };
}

// Точка 2D (x, y) базиса → 3D.
export const inPlane = (b, x, y) => [
  b.e1[0] * x + b.e2[0] * y, b.e1[1] * x + b.e2[1] * y, b.e1[2] * x + b.e2[2] * y,
];

// Уравнение Кеплера M = E − e sin E (M, E в радианах).
export function solveKepler(M, e) {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 30; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}

// Ось мира (северный полюс экватора) в эклиптических координатах при наклоне ε.
export const celestialPole = (epsDeg) => [0, Math.sin(epsDeg * D), Math.cos(epsDeg * D)];

/**
 * Матрица 3×3 (по строкам) из эклиптики даты в горизонтальную систему наблюдателя,
 * выходные оси: (Восток, Зенит, Юг) — это сразу оси three.js (x, y, z) для вида неба.
 * lst — местное звёздное время (градусы), lat — широта.
 */
export function eclToHorizon(epsDeg, lstDeg, latDeg) {
  const ce = Math.cos(epsDeg * D), se = Math.sin(epsDeg * D);
  const cl = Math.cos(lstDeg * D), sl = Math.sin(lstDeg * D);
  const cp = Math.cos(latDeg * D), sp = Math.sin(latDeg * D);
  // экл → экв: [x, y ce − z se, y se + z ce]
  const E = [[1, 0, 0], [0, ce, -se], [0, se, ce]];
  // экв → часовая СК: поворот вокруг z на −LST
  const H = [[cl, sl, 0], [-sl, cl, 0], [0, 0, 1]];
  // часовая → (Восток, Зенит, Юг)
  const Z = [[0, 1, 0], [cp, 0, sp], [sp, 0, -cp]];
  return mat3mul(Z, mat3mul(H, E));
}

export function mat3mul(A, B) {
  const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
    R[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
  return R;
}

export const mat3apply = (M, v) => [
  M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
  M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
  M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
];

// Истинная (современная) общая прецессия по долготе, градусы относительно J2000.
export const truePrecession = (year) => (50.29 / 3600) * (year - 2000);

// Средние аргументы Луны и Солнца (Meeus, гл. 47), градусы; T — юлианские столетия от J2000.
// Используются для радиксов Луны в моделях Коперника, Тихо и Кеплера (их таблицы
// давали положение Луны с точностью порядка десятков минут).
export function lunarMeanArgs(jd) {
  const T = (jd - 2451545.0) / 36525;
  return {
    L: norm360(218.3164477 + 481267.88123421 * T), // средняя долгота Луны
    D: norm360(297.8501921 + 445267.1114034 * T),  // средняя элонгация
    M: norm360(357.5291092 + 35999.0502909 * T),   // средняя аномалия Солнца
    Mp: norm360(134.9633964 + 477198.8675055 * T), // средняя аномалия Луны
    F: norm360(93.2720950 + 483202.0175233 * T),   // аргумент широты
    Ls: norm360(280.46646 + 36000.76983 * T),      // средняя долгота Солнца
  };
}

// Современные средние кеплеровы элементы (JPL, E. M. Standish, «Keplerian Elements for
// Approximate Positions»): a, e, I, L, ϖ, Ω и скорости за столетие; эклиптика J2000.
// В приложении используются только для реконструкции радиксов (средних долгот на эпоху),
// которых у нас нет в исторической форме, и в tools/check.mjs.
export const MODERN_ELEMENTS = {
  mercury: [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593,
            0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  venus:   [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255,
            0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418],
  earth:   [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0,
            0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
  mars:    [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891,
            0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  jupiter: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909,
            -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  saturn:  [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448,
            -0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
};


// Средняя долгота, долгота перигелия и узла на дату — в эклиптике и равноденствии даты.
export function modernOfDate(key, jd) {
  const T = (jd - 2451545) / 36525;
  const q = MODERN_ELEMENTS[key];
  const p = truePrecession(2000 + (jd - 2451545) / 365.25);
  return {
    L: norm360(q[3] + q[9] * T + p),
    peri: norm360(q[4] + q[10] * T + p),
    node: norm360(q[5] + q[11] * T + p),
    a: q[0], e: q[1], incl: q[2],
  };
}
