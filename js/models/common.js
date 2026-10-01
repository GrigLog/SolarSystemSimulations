// Общие определения для моделей.
import { add, mul } from '../astro.js';

export const BODIES = ['sun', 'moon', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn'];

export const BODY_INFO = {
  sun:     { name: 'Солнце',   color: '#ffcf40', size: 1.25 },
  moon:    { name: 'Луна',     color: '#cfd3dc', size: 0.6 },
  mercury: { name: 'Меркурий', color: '#b9a58a', size: 0.7 },
  venus:   { name: 'Венера',   color: '#f5e6b8', size: 0.9 },
  earth:   { name: 'Земля',    color: '#3f86ff', size: 1.0 },
  mars:    { name: 'Марс',     color: '#ff5a36', size: 0.85 },
  jupiter: { name: 'Юпитер',   color: '#e6a96b', size: 1.3 },
  saturn:  { name: 'Сатурн',   color: '#d9c27a', size: 1.2 },
};

// Общий масштаб отображения: среднее расстояние Земля–Солнце = SUN_DIST единиц.
export const SUN_DIST = 10;

export const OBSERVERS = {
  alexandria: { name: 'Александрия', lat: 31.20, lon: 29.92 },
  frombork:   { name: 'Фромборк',    lat: 54.36, lon: 19.68 },
  uraniborg:  { name: 'Ураниборг (о. Вен)', lat: 55.91, lon: 12.70 },
  prague:     { name: 'Прага',       lat: 50.09, lon: 14.42 },
  moscow:     { name: 'Москва',      lat: 55.75, lon: 37.62 },
};

/**
 * Сборщик «конструкций» (деференты, эпициклы, экванты…). Все координаты задаются в
 * единицах модели и приводятся к единицам отображения: origin + v·scale.
 * kind: 'orbit' — деферент/эксцентр/эллипс; 'epicycle' — эпициклы и эпициклеты;
 *       'point' — экванты, центры, фокусы; 'line' — вспомогательные линии.
 */
export class GuideList {
  constructor(scale = 1, origin = [0, 0, 0], items = []) {
    this.scale = scale; this.origin = origin; this.items = items;
  }
  P(v) { return add(this.origin, mul(v, this.scale)); }
  sub(scale, origin) { return new GuideList(scale, origin, this.items); }
  circle(body, kind, c, e1, e2, r) {
    this.items.push({ t: 'ellipse', body, kind, c: this.P(c), e1, e2, a: r * this.scale, b: r * this.scale });
  }
  ellipse(body, kind, c, e1, e2, a, b) {
    this.items.push({ t: 'ellipse', body, kind, c: this.P(c), e1, e2, a: a * this.scale, b: b * this.scale });
  }
  point(body, kind, p, label) { this.items.push({ t: 'point', body, kind, p: this.P(p), label }); }
  line(body, kind, a, b) { this.items.push({ t: 'line', body, kind, a: this.P(a), b: this.P(b) }); }
}
