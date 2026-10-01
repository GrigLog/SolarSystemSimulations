// Звёзды и «точечные» объекты: шейдер круглых точек с размером в пикселях.
import * as THREE from 'three';
import STARS from '../../data/stars.js';
import { sph } from '../astro.js';

// Цвет звезды по показателю B−V (приближение чернотельной шкалы).
export function bvToColor(bv) {
  const t = Math.max(-0.4, Math.min(2.0, bv));
  let r, g, b;
  if (t < 0) { r = 0.62 + 0.38 * (t + 0.4) / 0.4; g = 0.72 + 0.2 * (t + 0.4) / 0.4; b = 1; }
  else if (t < 0.4) { r = 1; g = 0.92 + 0.08 * (1 - t / 0.4); b = 1 - 0.25 * t / 0.4; }
  else if (t < 1.0) { r = 1; g = 0.92 - 0.2 * (t - 0.4) / 0.6; b = 0.75 - 0.35 * (t - 0.4) / 0.6; }
  else { r = 1; g = 0.72 - 0.22 * (t - 1.0); b = 0.4 - 0.2 * (t - 1.0); }
  return [r, g, b];
}

const VERT = `
attribute float size;
attribute vec3 color;
uniform float uScale;
varying vec3 vColor;
void main() {
  vColor = color;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale;
}`;
const FRAG = `
varying vec3 vColor;
uniform float uOpacity;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.15, d);
  gl_FragColor = vec4(vColor, a * uOpacity);
}`;

export function pointMaterial(scale = 1, opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uScale: { value: scale }, uOpacity: { value: 1 } },
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

// Геометрия звёзд на единичной сфере, в эклиптических координатах J2000.
let starGeom = null;
export function starGeometry() {
  if (starGeom) return starGeom;
  const n = STARS.length / 4;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const [lon, lat, mag, bv] = STARS.slice(i * 4, i * 4 + 4);
    const v = sph(lon, lat);
    pos.set(v, i * 3);
    const c = bvToColor(bv);
    const k = Math.min(1, 0.35 + (6.2 - mag) / 5);
    col.set([c[0] * k, c[1] * k, c[2] * k], i * 3);
    size[i] = Math.max(1.3, 1.0 + (6.0 - mag) * 0.95);
  }
  starGeom = new THREE.BufferGeometry();
  starGeom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeom.setAttribute('color', new THREE.BufferAttribute(col, 3));
  starGeom.setAttribute('size', new THREE.BufferAttribute(size, 1));
  return starGeom;
}

// Окружность радиуса 1 в плоскости XY (эклиптические координаты).
export function unitCircle(segments = 128) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(Math.cos(a), Math.sin(a), 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

// Координатная сетка на единичной сфере (эклиптические долготы через 30°, широты через 30°).
export function graticule() {
  const pts = [];
  const seg = 72;
  for (let lon = 0; lon < 360; lon += 30)
    for (let i = 0; i < seg; i++) {
      const a = -90 + (180 * i) / seg, b = -90 + (180 * (i + 1)) / seg;
      pts.push(...sph(lon, a), ...sph(lon, b));
    }
  for (const lat of [-60, -30, 30, 60])
    for (let i = 0; i < seg; i++) pts.push(...sph((360 * i) / seg, lat), ...sph((360 * (i + 1)) / seg, lat));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}
