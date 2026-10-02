// Отрисовка «конструкций» моделей: окружности/эллипсы, точки, отрезки.
// Все координаты — эклиптические (группа-родитель сама переводит их в систему three.js).
import * as THREE from 'three';
import { BODY_INFO } from '../models/common.js';
import { unitCircle } from './stars.js';
import { cross, unit } from '../astro.js';

const OPACITY = { orbit: 0.8, epicycle: 0.65, line: 0.4, point: 1 };

export class GuideRenderer {
  constructor(parent) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.circleGeom = unitCircle(160);
    this.loops = [];
    this.materials = new Map();

    this.lineGeom = new THREE.BufferGeometry();
    this.lineCap = 4096;
    this.linePos = new Float32Array(this.lineCap * 3);
    this.lineCol = new Float32Array(this.lineCap * 3);
    this.lineGeom.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3));
    this.lineGeom.setAttribute('color', new THREE.BufferAttribute(this.lineCol, 3));
    this.lines = new THREE.LineSegments(this.lineGeom, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: OPACITY.line, depthWrite: false }));
    this.lines.frustumCulled = false;
    this.group.add(this.lines);

    this.pointGeom = new THREE.BufferGeometry();
    this.pointCap = 512;
    this.pointPos = new Float32Array(this.pointCap * 3);
    this.pointCol = new Float32Array(this.pointCap * 3);
    this.pointGeom.setAttribute('position', new THREE.BufferAttribute(this.pointPos, 3));
    this.pointGeom.setAttribute('color', new THREE.BufferAttribute(this.pointCol, 3));
    this.points = new THREE.Points(this.pointGeom, new THREE.PointsMaterial({
      size: 5, sizeAttenuation: false, vertexColors: true, map: dotTexture(), alphaTest: 0.3, transparent: true }));
    this.points.frustumCulled = false;
    this.group.add(this.points);
    this.labeled = []; // точки с подписями (для оверлея)
  }

  material(body, kind) {
    const key = body + kind;
    if (!this.materials.has(key)) {
      this.materials.set(key, new THREE.LineBasicMaterial({
        color: BODY_INFO[body]?.color ?? '#ffffff', transparent: true, opacity: OPACITY[kind], depthWrite: false }));
    }
    return this.materials.get(key);
  }

  update(items, show, visible = {}) {
    let nLoop = 0, nl = 0, np = 0;
    this.labeled.length = 0;
    const col = new THREE.Color();
    const m = new THREE.Matrix4();
    for (const it of items) {
      if (!show[it.kind] || visible[it.body] === false) continue;
      if (it.t === 'ellipse') {
        let loop = this.loops[nLoop];
        if (!loop) {
          loop = new THREE.LineLoop(this.circleGeom, this.material(it.body, it.kind));
          loop.matrixAutoUpdate = false;
          loop.frustumCulled = false;
          this.group.add(loop);
          this.loops.push(loop);
        }
        loop.material = this.material(it.body, it.kind);
        const n = unit(cross(it.e1, it.e2));
        m.set(
          it.e1[0] * it.a, it.e2[0] * it.b, n[0], it.c[0],
          it.e1[1] * it.a, it.e2[1] * it.b, n[1], it.c[1],
          it.e1[2] * it.a, it.e2[2] * it.b, n[2], it.c[2],
          0, 0, 0, 1);
        loop.matrix.copy(m);
        loop.matrixWorldNeedsUpdate = true;
        loop.visible = true;
        nLoop++;
      } else if (it.t === 'line' && nl < this.lineCap - 2) {
        col.set(BODY_INFO[it.body]?.color ?? '#fff');
        this.linePos.set(it.a, nl * 3); this.linePos.set(it.b, nl * 3 + 3);
        this.lineCol.set([col.r, col.g, col.b, col.r, col.g, col.b], nl * 3);
        nl += 2;
      } else if (it.t === 'point' && np < this.pointCap) {
        col.set(BODY_INFO[it.body]?.color ?? '#fff');
        this.pointPos.set(it.p, np * 3);
        this.pointCol.set([col.r, col.g, col.b], np * 3);
        np++;
        if (it.label) this.labeled.push(it);
      }
    }
    for (let i = nLoop; i < this.loops.length; i++) this.loops[i].visible = false;
    this.lineGeom.setDrawRange(0, nl);
    this.lineGeom.attributes.position.needsUpdate = true;
    this.lineGeom.attributes.color.needsUpdate = true;
    this.pointGeom.setDrawRange(0, np);
    this.pointGeom.attributes.position.needsUpdate = true;
    this.pointGeom.attributes.color.needsUpdate = true;
  }
}

let dot = null;
export function dotTexture() {
  if (dot) return dot;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(16, 16, 14, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#000';
  g.beginPath(); g.arc(16, 16, 6, 0, Math.PI * 2); g.fill();
  dot = new THREE.CanvasTexture(c);
  return dot;
}
