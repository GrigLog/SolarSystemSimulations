// Общие «круговые» механизмы Коперника и Тихо Браге.
import { D, u2, tiltFrame } from '../astro.js';

/**
 * Планета на эксцентре с эпициклетом (De revolutionibus V.4):
 * центр деферента смещён от центра системы на d в сторону апсиды A, центр эпициклета
 * равномерно идёт по деференту радиуса R, планета — по эпициклету радиуса r с двойной
 * угловой скоростью и стоит в его ближайшей к центру точке, когда центр в апогее.
 * Это равномерная замена экванта Птолемея: d + r = 2e, d : r = 3 : 1.
 * Возвращает 3D-вектор относительно центра системы (в тех же единицах).
 */
export function epicycletPlanet(key, p, meanLon, A, node, incl, g) {
  const alpha = meanLon - A;
  const tf = tiltFrame(node, incl);
  const ca = Math.cos(A * D), sa = Math.sin(A * D);
  const M = (x, y) => tf.map(x * ca - y * sa, x * sa + y * ca);
  const R = p.Rnow ?? p.R;
  const u = u2(alpha), w = u2(2 * alpha);
  const E = [p.d + R * u[0], R * u[1]];          // центр эпициклета
  const P = [E[0] - p.r * w[0], E[1] - p.r * w[1]];
  if (g) {
    const C3 = M(p.d, 0), E3 = M(E[0], E[1]);
    g.circle(key, 'orbit', C3, M(1, 0), M(0, 1), R);
    g.circle(key, 'epicycle', E3, M(1, 0), M(0, 1), p.r);
    g.point(key, 'point', C3, 'центр');
    g.line(key, 'line', M(p.d - R, 0), M(p.d + R, 0));
    g.line(key, 'line', C3, E3);
    g.line(key, 'line', E3, M(P[0], P[1]));
  }
  return M(P[0], P[1]);
}

/**
 * Луна Коперника (IV.3): центр первого эпицикла идёт по кругу вокруг Земли,
 * центр второго — по первому эпициклу (аномалия, «против знаков»), Луна — по второму
 * с двойной элонгацией, ближе всего к центру первого в сизигиях.
 * Это убирает двукратное «раздувание» Луны у Птолемея. Все углы — в градусах.
 */
export function doubleEpicycleMoon(L, anom, elong, rho, r1, r2, tf, g) {
  const a = u2(L), b = u2(L - anom), c = u2(L - anom + 2 * elong);
  const K1 = [rho * a[0], rho * a[1]];
  const K2 = [K1[0] + r1 * b[0], K1[1] + r1 * b[1]];
  const P = [K2[0] - r2 * c[0], K2[1] - r2 * c[1]];
  if (g) {
    g.circle('moon', 'orbit', [0, 0, 0], tf.ex, tf.ey, rho);
    g.circle('moon', 'epicycle', tf.map(...K1), tf.ex, tf.ey, r1);
    g.circle('moon', 'epicycle', tf.map(...K2), tf.ex, tf.ey, r2);
    g.line('moon', 'line', tf.map(...K1), tf.map(...K2));
    g.line('moon', 'line', tf.map(...K2), tf.map(...P));
  }
  return P;
}
