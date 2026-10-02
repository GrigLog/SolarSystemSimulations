// Панель одной модели: 3D-вид системы + вид неба с поверхности выбранного тела.
import * as THREE from 'three';
import { BODIES, BODY_INFO, OBSERVERS } from '../models/common.js';
import { D, sub, unit, len, celestialPole, eclToHorizon } from '../astro.js';
import { starGeometry, pointMaterial, graticule, unitCircle } from './stars.js';
import { GuideRenderer } from './guides.js';

const TRAIL_N = 4000;
const SKY_R = 99;
// Эклиптика (x→γ, y, z→полюс) → three.js (x, y — вверх, z — к зрителю): (x, z, −y).
const ECL_TO_THREE = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);

function earthTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#1d4f91'; g.fillRect(0, 0, 512, 256);
  // Условные «материки», чтобы было видно вращение.
  g.fillStyle = '#3d7a3a';
  const blobs = [[90, 80, 60, 40], [130, 170, 35, 55], [270, 70, 80, 35], [300, 140, 40, 50], [400, 90, 70, 45], [430, 190, 35, 22]];
  for (const [x, y, rx, ry] of blobs) { g.beginPath(); g.ellipse(x, y, rx, ry, 0.3, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#e8eef5'; g.fillRect(0, 0, 512, 14); g.fillRect(0, 242, 512, 14);
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
  for (let x = 0; x < 512; x += 512 / 12) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  for (let y = 256 / 6; y < 256; y += 256 / 6) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  g.strokeStyle = '#ff4d4d'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, 128); g.lineTo(512, 128); g.stroke();      // экватор
  g.beginPath(); g.moveTo(256, 0); g.lineTo(256, 256); g.stroke();      // нулевой меридиан
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,230,150,0.9)');
  gr.addColorStop(0.25, 'rgba(255,200,80,0.35)');
  gr.addColorStop(1, 'rgba(255,180,50,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

class Trail {
  constructor(parent, color, opacity) {
    this.buf = new Float32Array(TRAIL_N * 3);
    this.n = 0;
    this.geom = new THREE.BufferGeometry();
    this.geom.setAttribute('position', new THREE.BufferAttribute(this.buf, 3));
    this.line = new THREE.Line(this.geom, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    this.line.frustumCulled = false;
    parent.add(this.line);
  }
  push(v) {
    if (this.n >= TRAIL_N) { this.buf.copyWithin(0, (TRAIL_N / 2) * 3); this.n = TRAIL_N / 2; }
    this.buf[this.n * 3] = v[0]; this.buf[this.n * 3 + 1] = v[1]; this.buf[this.n * 3 + 2] = v[2];
    this.n++;
    this.geom.setDrawRange(0, this.n);
    this.geom.attributes.position.needsUpdate = true;
  }
  clear() { this.n = 0; this.geom.setDrawRange(0, 0); }
}

export class Panel {
  constructor(model) {
    this.model = model;
    this.cam = { az: 30, el: 35, dist: 70 };
    this.look = { az: 180, alt: 30, fov: 90 };
    this.res = null;
    this.build3d();
    this.buildSky();
  }

  build3d() {
    const m = this.model;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    this.ecl = new THREE.Group();
    this.ecl.matrixAutoUpdate = false;
    this.ecl.matrix.copy(ECL_TO_THREE);
    this.scene.add(this.ecl);
    this.heavens = new THREE.Group();
    this.ecl.add(this.heavens);

    // Звёздная сфера: оболочка, сетка эклиптических координат, звёзды.
    this.starSphere = new THREE.Group();
    this.starSphere.scale.setScalar(m.starRadius);
    this.starRot = new THREE.Group();
    this.starSphere.add(this.starRot);
    this.starPoints = new THREE.Points(starGeometry(), pointMaterial(1, { additive: true }));
    this.starPoints.frustumCulled = false;
    this.starRot.add(this.starPoints);
    this.shell = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32),
      new THREE.MeshBasicMaterial({ color: 0x2a4a8a, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }));
    this.shell.rotation.x = Math.PI / 2;
    this.starSphere.add(this.shell);
    this.grat = new THREE.LineSegments(graticule(), new THREE.LineBasicMaterial({ color: 0x5577aa, transparent: true, opacity: 0.18, depthWrite: false }));
    this.starSphere.add(this.grat);
    this.eclCircle = new THREE.LineLoop(unitCircle(256), new THREE.LineBasicMaterial({ color: 0xd9b84a, transparent: true, opacity: 0.6 }));
    this.starSphere.add(this.eclCircle);
    this.heavens.add(this.starSphere);
    // Небесный экватор (не вращается с прецессией: система отсчёта — тропическая).
    this.equator = new THREE.LineLoop(unitCircle(256), new THREE.LineBasicMaterial({ color: 0x55c0ff, transparent: true, opacity: 0.55 }));
    this.equatorAxis = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -1.08), new THREE.Vector3(0, 0, 1.08)]),
      new THREE.LineBasicMaterial({ color: 0x55c0ff, transparent: true, opacity: 0.35 }));
    this.equatorGroup = new THREE.Group();
    this.equatorGroup.add(this.equator, this.equatorAxis);
    this.equatorGroup.scale.setScalar(m.starRadius);
    this.heavens.add(this.equatorGroup);

    // Плоскость эклиптики.
    this.grid = new THREE.PolarGridHelper(1, 12, 10, 96, 0x6a6a40, 0x3a3a2a);
    this.grid.rotation.x = Math.PI / 2;
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.35;
    this.grid.material.depthWrite = false;
    this.heavens.add(this.grid);
    this.gridRadius = 0;

    // Тела.
    this.light = new THREE.PointLight(0xffffff, 2.6, 0, 0);
    this.heavens.add(this.light);
    this.meshes = {};
    const sphere = new THREE.SphereGeometry(1, 40, 20);
    for (const b of BODIES) {
      const info = BODY_INFO[b];
      let mesh;
      if (b === 'sun') {
        mesh = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: info.color }));
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
        glow.scale.setScalar(3.2);
        mesh.add(glow);
      } else if (b === 'earth') {
        mesh = new THREE.Group();
        this.earthBall = new THREE.Mesh(sphere, new THREE.MeshLambertMaterial({ map: earthTexture(), emissive: 0x0a1a33 }));
        this.earthSpin = new THREE.Group();
        this.earthSpin.add(this.earthBall);
        const axis = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -1.7, 0), new THREE.Vector3(0, 1.7, 0)]),
          new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
        this.earthTilt = new THREE.Group();
        this.earthTilt.add(this.earthSpin, axis);
        mesh.add(this.earthTilt);
      } else {
        const c = new THREE.Color(info.color);
        mesh = new THREE.Mesh(sphere, new THREE.MeshLambertMaterial({ color: c, emissive: c.clone().multiplyScalar(0.12) }));
      }
      this.heavens.add(mesh);
      this.meshes[b] = mesh;
    }

    this.guides = new GuideRenderer(this.heavens);
    this.trailGroup = new THREE.Group();
    this.heavens.add(this.trailGroup);
    this.trails = {};
    for (const b of BODIES) this.trails[b] = new Trail(this.trailGroup, BODY_INFO[b].color, 0.75);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000);
  }

  buildSky() {
    this.skyScene = new THREE.Scene();
    this.skyRoot = new THREE.Group();
    this.skyRoot.matrixAutoUpdate = false;
    this.skyScene.add(this.skyRoot);
    this.skyStarRot = new THREE.Group();
    this.skyStarRot.scale.setScalar(100);
    const stars = new THREE.Points(starGeometry(), pointMaterial(1.25, { additive: true }));
    stars.frustumCulled = false;
    this.skyStarRot.add(stars);
    this.skyRoot.add(this.skyStarRot);

    this.skyEcl = new THREE.LineLoop(unitCircle(256), new THREE.LineBasicMaterial({ color: 0xd9b84a, transparent: true, opacity: 0.55 }));
    this.skyEcl.scale.setScalar(99.6);
    this.skyEq = new THREE.LineLoop(unitCircle(256), new THREE.LineBasicMaterial({ color: 0x55c0ff, transparent: true, opacity: 0.5 }));
    this.skyEq.scale.setScalar(99.6);
    this.skyRoot.add(this.skyEcl, this.skyEq);

    const n = BODIES.length;
    this.skyGeom = new THREE.BufferGeometry();
    this.skyPos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3), size = new Float32Array(n);
    BODIES.forEach((b, i) => {
      const c = new THREE.Color(BODY_INFO[b].color);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = b === 'sun' ? 26 : b === 'moon' ? 20 : b === 'earth' ? 11 : 6 + BODY_INFO[b].size * 3;
    });
    this.skyGeom.setAttribute('position', new THREE.BufferAttribute(this.skyPos, 3));
    this.skyGeom.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.skyGeom.setAttribute('size', new THREE.BufferAttribute(size, 1));
    this.skySize = size;
    this.skyBodies = new THREE.Points(this.skyGeom, pointMaterial(1));
    this.skyBodies.frustumCulled = false;
    this.skyBodies.renderOrder = 2;
    this.skyRoot.add(this.skyBodies);

    this.skyTrailGroup = new THREE.Group();
    this.skyRoot.add(this.skyTrailGroup);
    this.skyTrails = {};
    for (const b of BODIES) if (b !== 'moon') this.skyTrails[b] = new Trail(this.skyTrailGroup, BODY_INFO[b].color, 0.8);

    // Земля под ногами и линия горизонта (в горизонтальной системе, не вращаются).
    this.ground = new THREE.Mesh(new THREE.SphereGeometry(50, 64, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x0c1208, side: THREE.BackSide, transparent: true, opacity: 0.95 }));
    this.ground.renderOrder = 3;
    this.horizon = new THREE.LineLoop(unitCircle(256), new THREE.LineBasicMaterial({ color: 0x8fae6a }));
    this.horizon.rotation.x = Math.PI / 2;
    this.horizon.scale.setScalar(49.5);
    this.horizon.renderOrder = 4;
    this.skyScene.add(this.ground, this.horizon);
    this.skyCamera = new THREE.PerspectiveCamera(90, 1, 0.1, 1000);
  }

  clearTrails() {
    for (const t of Object.values(this.trails)) t.clear();
    for (const t of Object.values(this.skyTrails)) t.clear();
  }

  // Звёздное время Гринвича: среднее Солнце модели + часовой угол (полдень при JD .0).
  sidereal(jd, res) { return res.meanSun + 360 * (jd - Math.floor(jd)); }

  observerOf(st) {
    const key = st.observer === 'auto' ? this.model.observer : st.observer;
    return OBSERVERS[key];
  }

  // Добавить точку следа (вызывается на каждом шаге модели).
  sampleTrails(res, st) {
    const p = res.pos, c = p[st.center];
    for (const b of BODIES) if (b !== st.center) this.trails[b].push(sub(p[b], c));
    const o = p[st.center];
    for (const b of Object.keys(this.skyTrails)) {
      if (b === st.center) continue;
      const d = unit(sub(p[b], o));
      this.skyTrails[b].push([d[0] * 98.8, d[1] * 98.8, d[2] * 98.8]);
    }
  }

  update(jd, res, st) {
    this.res = res;
    const m = this.model;
    const pos = res.pos;
    const theta = st.diurnal ? this.sidereal(jd, res) : 0;
    const pole = celestialPole(res.eps);
    const poleV = v3(pole);

    // Суточное вращение: у геоцентриков вращается вся небесная машина, у гелиоцентриков — Земля.
    if (m.diurnalHeavens && st.diurnal) this.heavens.quaternion.setFromAxisAngle(poleV, -theta * D);
    else this.heavens.quaternion.identity();

    this.starSphere.position.set(...res.starCenter);
    this.starRot.rotation.z = res.precShift * D;
    this.starSphere.visible = st.show.stars;
    this.equatorGroup.position.set(...res.starCenter);
    this.equatorGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), poleV);
    this.equatorGroup.visible = st.show.equator;

    if (!this.gridRadius) {
      let r = 0;
      for (const b of BODIES) r = Math.max(r, len(sub(pos[b], m.geocentric ? pos.earth : [0, 0, 0])));
      this.gridRadius = r * 1.08;
      this.grid.scale.setScalar(this.gridRadius);
    }
    this.grid.position.set(...(m.geocentric ? pos.earth : [0, 0, 0]));
    this.grid.visible = st.show.grid;

    for (const b of BODIES) {
      this.meshes[b].position.set(...pos[b]);
      this.meshes[b].visible = st.visible[b];
      this.trails[b].line.visible = st.visible[b];
      if (this.skyTrails[b]) this.skyTrails[b].line.visible = st.visible[b];
    }
    this.starPoints.visible = st.starsOn;
    this.skyStarRot.visible = st.starsOn;
    this.light.position.set(...pos.sun);
    this.earthTilt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), poleV);
    this.earthSpin.rotation.y = theta * D;

    this.guides.update(res.guides, st.show, st.visible);
    this.guides.group.visible = true;
    this.trailGroup.position.set(...pos[st.center]);
    this.trailGroup.visible = st.show.trails;

    // Небо.
    const obsKey = st.center;
    const o = pos[obsKey];
    BODIES.forEach((b, i) => {
      if (b === obsKey || !st.visible[b]) { this.skyPos.set([0, 0, 0], i * 3); this.skySize[i] = 0; return; }
      const d = unit(sub(pos[b], o));
      this.skyPos.set([d[0] * SKY_R, d[1] * SKY_R, d[2] * SKY_R], i * 3);
      this.skySize[i] = b === 'sun' ? 26 : b === 'moon' ? 20 : b === 'earth' ? 11 : 6 + BODY_INFO[b].size * 3;
    });
    this.skyGeom.attributes.position.needsUpdate = true;
    this.skyGeom.attributes.size.needsUpdate = true;
    this.skyStarRot.rotation.z = res.precShift * D;
    this.skyEq.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), poleV);
    this.skyEcl.visible = this.skyEq.visible = st.sky.lines;
    this.skyTrailGroup.visible = st.sky.trails;

    const M = new THREE.Matrix4();
    if (obsKey === 'earth') {
      const obs = this.observerOf(st);
      const R = eclToHorizon(res.eps, theta + obs.lon, obs.lat);
      M.set(R[0][0], R[0][1], R[0][2], 0, R[1][0], R[1][1], R[1][2], 0, R[2][0], R[2][1], R[2][2], 0, 0, 0, 0, 1);
      this.ground.visible = st.sky.ground;
      this.horizon.visible = true;
      const ds = unit(sub(pos.sun, o));
      this.sunAlt = (R[1][0] * ds[0] + R[1][1] * ds[1] + R[1][2] * ds[2]) * SKY_R;
    } else {
      M.copy(ECL_TO_THREE);
      this.ground.visible = this.horizon.visible = false;
      this.sunAlt = -1;
    }
    this.skyRoot.matrix.copy(M);
    this.skyRoot.matrixWorldNeedsUpdate = true;
  }

  render3d(renderer, rect, cam, st, ctx, pr) {
    const pos = this.res.pos;
    this.scene.updateMatrixWorld();
    const target = v3(pos[st.center]).applyMatrix4(this.heavens.matrixWorld);
    const ce = Math.cos(cam.el * D);
    const off = new THREE.Vector3(ce * Math.sin(cam.az * D), Math.sin(cam.el * D), ce * Math.cos(cam.az * D)).multiplyScalar(cam.dist);
    this.camera.position.copy(target).add(off);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(target);
    this.camera.aspect = rect.w / rect.h;
    this.camera.near = cam.dist * 0.005;
    this.camera.far = cam.dist * 20 + 4000;
    this.camera.updateProjectionMatrix();

    const k = 0.011 * st.bodySize * cam.dist;
    for (const b of BODIES) this.meshes[b].scale.setScalar(k * BODY_INFO[b].size);
    this.starPoints.material.uniforms.uScale.value = pr * st.starSize;
    this.shell.visible = st.show.stars;

    renderer.setViewport(rect.x, rect.gy, rect.w, rect.h);
    renderer.setScissor(rect.x, rect.gy, rect.w, rect.h);
    renderer.setClearColor(st.starsOn ? 0x05070d : 0x000000);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    if (st.show.labels) {
      ctx.font = '12px system-ui, sans-serif';
      const f = (rect.h / 2) / Math.tan((this.camera.fov / 2) * D);
      for (const b of BODIES) {
        if (!st.visible[b]) continue;
        const p = v3(pos[b]).applyMatrix4(this.heavens.matrixWorld);
        const px = (k * BODY_INFO[b].size / Math.max(1e-6, this.camera.position.distanceTo(p))) * f;
        this.label(ctx, rect, this.camera, p, BODY_INFO[b].name, BODY_INFO[b].color, Math.max(7, px * 0.8 + 3));
      }
      if (st.show.point) {
        ctx.font = '10px system-ui, sans-serif';
        for (const it of this.guides.labeled) {
          const p = v3(it.p).applyMatrix4(this.heavens.matrixWorld);
          this.label(ctx, rect, this.camera, p, it.label, 'rgba(200,210,230,0.55)', 5);
        }
      }
    }
  }

  renderSky(renderer, rect, look, st, ctx, pr) {
    const c = this.skyCamera;
    c.fov = look.fov;
    c.aspect = rect.w / rect.h;
    c.updateProjectionMatrix();
    const ca = Math.cos(look.alt * D);
    const dir = new THREE.Vector3(ca * Math.sin(look.az * D), Math.sin(look.alt * D), -ca * Math.cos(look.az * D));
    c.position.set(0, 0, 0);
    c.up.set(0, 1, 0);
    c.lookAt(dir);
    this.skyBodies.material.uniforms.uScale.value = pr;
    this.skyStarRot.children[0].material.uniforms.uScale.value = pr * st.starSize * 1.2;

    // Днём небо слегка светлеет (звёзды при этом оставлены видимыми).
    const day = Math.max(0, Math.min(1, (this.sunAlt / SKY_R + 0.1) / 0.3));
    renderer.setViewport(rect.x, rect.gy, rect.w, rect.h);
    renderer.setScissor(rect.x, rect.gy, rect.w, rect.h);
    renderer.setClearColor(new THREE.Color(st.starsOn ? 0x03050a : 0x000000).lerp(new THREE.Color(0x1c3558), st.sky.daylight ? day : 0));
    renderer.clear();
    this.skyScene.updateMatrixWorld();
    renderer.render(this.skyScene, c);

    ctx.font = '12px system-ui, sans-serif';
    const p = new THREE.Vector3();
    BODIES.forEach((b, i) => {
      if (b === st.center || !st.visible[b]) return;
      p.set(this.skyPos[i * 3], this.skyPos[i * 3 + 1], this.skyPos[i * 3 + 2]).applyMatrix4(this.skyRoot.matrixWorld);
      if (this.ground.visible && p.y < -0.5) return;
      this.label(ctx, rect, c, p, BODY_INFO[b].name, BODY_INFO[b].color, b === 'sun' || b === 'moon' ? 14 : 8);
    });
    if (st.center === 'earth') {
      ctx.font = 'bold 13px system-ui, sans-serif';
      for (const [name, az] of [['С', 0], ['В', 90], ['Ю', 180], ['З', 270]])
        this.label(ctx, rect, c, new THREE.Vector3(Math.sin(az * D) * 49, 0, -Math.cos(az * D) * 49), name, '#b8d08f', -14, true);
      ctx.font = '10px system-ui, sans-serif';
      this.label(ctx, rect, c, new THREE.Vector3(0, 49, 0), 'зенит', 'rgba(184,208,143,0.7)', 4);
    }
  }

  // Подпись точки p (мировые координаты) во вьюпорте rect.
  label(ctx, rect, camera, p, text, color, dx, center = false) {
    const q = p.clone().project(camera);
    if (q.z > 1 || q.z < -1 || Math.abs(q.x) > 1.05 || Math.abs(q.y) > 1.05) return;
    const x = rect.x + (q.x + 1) / 2 * rect.w, y = rect.y + (1 - q.y) / 2 * rect.h;
    ctx.fillStyle = color;
    if (center) { ctx.textAlign = 'center'; ctx.fillText(text, x, y - dx); ctx.textAlign = 'left'; }
    else ctx.fillText(text, x + dx, y - dx * 0.6);
  }
}
