// Точка входа: общее время, раскладка панелей, управление.
import * as THREE from 'three';
import { MODELS } from './models/index.js';
import { Panel } from './render/panel.js';
import { formatJd, parseDate, isoFromJd } from './time.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gl'), overlay = $('overlay'), view = $('view');
const ctx = overlay.getContext('2d');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setScissorTest(true);
renderer.autoClear = false;

const nowJd = () => Date.now() / 86400000 + 2440587.5;

const state = {
  jd: parseDate('1610-01-07 18:00'),
  playing: true,
  dir: 1,
  step: 1,
  stepsPerSec: 20,
  acc: 0,
  center: 'earth',
  sync: true,
  cam: { az: 30, el: 35, dist: 70 },
  look: { az: 180, alt: 30, fov: 90 },
  enabled: { ptolemy: true, copernicus: true, tycho: true, kepler: true },
  show: { orbit: true, epicycle: true, point: true, line: false, trails: true, stars: true, grid: true, equator: false, labels: true },
  diurnal: false,
  bodySize: 1.2,
  starSize: 1,
  moonScale: 1,
  observer: 'auto',
  sky: { on: false, ground: true, lines: true, trails: true, daylight: false },
};

const panels = MODELS.map((m) => new Panel(m));
let layout = [];

// ——— Время ———
const speedFromSlider = (v) => 0.5 * Math.pow(480, v / 100); // 0,5 … 240 шагов в секунду
function updateSpeedLabel() {
  const days = state.stepsPerSec * state.step;
  const txt = days >= 1 ? `${days.toFixed(days < 10 ? 1 : 0)} сут/с` : `${(days * 24).toFixed(1)} ч/с`;
  $('speedLabel').textContent = `${state.stepsPerSec.toFixed(state.stepsPerSec < 10 ? 1 : 0)} шаг/с ≈ ${txt}`;
}

function computeAll(jd, guides) {
  const opts = { guides, moonScale: state.moonScale };
  return panels.map((p) => (state.enabled[p.model.id] ? p.model.compute(jd, opts) : null));
}

function advance(nSteps) {
  if (!nSteps) return;
  const dt = state.step * state.dir;
  // Промежуточные точки следов: не более 12 на кадр.
  const stride = Math.max(1, Math.ceil(nSteps / 12));
  for (let i = stride; i <= nSteps; i += stride) {
    const jd = state.jd + dt * i;
    const res = computeAll(jd, false);
    panels.forEach((p, k) => res[k] && p.sampleTrails(res[k], state));
  }
  state.jd += dt * nSteps;
}

function jump(jd) {
  if (!isFinite(jd)) return;
  state.jd = jd;
  state.acc = 0;
  clearTrails();
}
const clearTrails = () => panels.forEach((p) => p.clearTrails());

// ——— Раскладка ———
function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  const pr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  overlay.width = Math.round(w * pr);
  overlay.height = Math.round(h * pr);
  ctx.setTransform(pr, 0, 0, pr, 0, 0);
}

function computeLayout() {
  const w = view.clientWidth, h = view.clientHeight;
  const active = panels.filter((p) => state.enabled[p.model.id]);
  const n = Math.max(1, active.length);
  const topH = state.sky.on ? Math.round(h * 0.58) : h;
  layout = active.map((p, i) => {
    const x0 = Math.round((i * w) / n), x1 = Math.round(((i + 1) * w) / n);
    const orbit = { x: x0, y: 0, w: x1 - x0, h: topH };
    orbit.gy = h - orbit.y - orbit.h;
    const sky = state.sky.on ? { x: x0, y: topH, w: x1 - x0, h: h - topH } : null;
    if (sky) sky.gy = 0;
    return { panel: p, orbit, sky };
  });
}

// ——— Кадр ———
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (state.playing) {
    state.acc += dt * state.stepsPerSec;
    const n = Math.floor(state.acc);
    state.acc -= n;
    advance(n);
  }
  $('date').textContent = formatJd(state.jd);

  computeLayout();
  const w = view.clientWidth, h = view.clientHeight;
  const pr = renderer.getPixelRatio();
  renderer.setScissor(0, 0, w, h);
  renderer.setClearColor(0x05070d);
  renderer.clear();
  ctx.clearRect(0, 0, w, h);
  const wantGuides = state.show.orbit || state.show.epicycle || state.show.point || state.show.line;

  for (const L of layout) {
    const p = L.panel;
    ctx.save();
    ctx.beginPath();
    ctx.rect(L.orbit.x, 0, L.orbit.w, h);
    ctx.clip();
    const res = p.model.compute(state.jd, { guides: wantGuides, moonScale: state.moonScale });
    p.update(state.jd, res, state);
    p.render3d(renderer, L.orbit, state.sync ? state.cam : p.cam, state, ctx, pr);
    if (L.sky) p.renderSky(renderer, L.sky, state.sync ? state.look : p.look, state, ctx, pr);
    drawFrame(L);
    ctx.restore();
  }
  requestAnimationFrame(frame);
}

function drawFrame(L) {
  const { orbit, sky, panel } = L;
  ctx.strokeStyle = '#243049';
  ctx.lineWidth = 1;
  ctx.strokeRect(orbit.x + 0.5, orbit.y + 0.5, orbit.w - 1, orbit.h - 1);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e3b552';
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.fillText(panel.model.name, orbit.x + 10, orbit.y + 20);
  ctx.fillStyle = '#8a96ad';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(panel.model.subtitle, orbit.x + 10, orbit.y + 35);
  if (sky) {
    ctx.strokeRect(sky.x + 0.5, sky.y + 0.5, sky.w - 1, sky.h - 1);
    ctx.fillStyle = '#b8c4da';
    ctx.font = '11px system-ui, sans-serif';
    const obs = panel.observerOf(state);
    const where = state.center === 'earth' ? `Небо: ${obs.name}, φ = ${obs.lat.toFixed(1)}°` : 'Небо из центра Солнца (эклиптика горизонтально)';
    ctx.fillText(where, sky.x + 10, sky.y + 16);
  }
}

// ——— Ввод мышью ———
let drag = null;
function hit(x, y) {
  for (const L of layout) {
    for (const kind of ['orbit', 'sky']) {
      const r = L[kind];
      if (r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return { L, kind, r };
    }
  }
  return null;
}
const camOf = (L) => (state.sync ? state.cam : L.panel.cam);
const lookOf = (L) => (state.sync ? state.look : L.panel.look);
const pt = (e) => { const b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };

canvas.addEventListener('pointerdown', (e) => {
  const [x, y] = pt(e);
  const h = hit(x, y);
  if (!h) return;
  drag = { ...h, x, y };
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const [x, y] = pt(e);
  const dx = x - drag.x, dy = y - drag.y;
  drag.x = x; drag.y = y;
  if (drag.kind === 'orbit') {
    const c = camOf(drag.L);
    c.az -= dx * 0.4;
    c.el = Math.max(-89.5, Math.min(89.5, c.el + dy * 0.4));
  } else {
    const l = lookOf(drag.L);
    const k = l.fov / drag.r.h;
    l.az = (l.az + dx * k + 360) % 360;
    l.alt = Math.max(-89.5, Math.min(89.5, l.alt + dy * k));
  }
});
const endDrag = () => { drag = null; canvas.classList.remove('dragging'); };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const [x, y] = pt(e);
  const h = hit(x, y);
  if (!h) return;
  const f = Math.exp(e.deltaY * 0.0012);
  if (h.kind === 'orbit') {
    const c = camOf(h.L);
    c.dist = Math.max(0.05, Math.min(4000, c.dist * f));
  } else {
    const l = lookOf(h.L);
    l.fov = Math.max(5, Math.min(150, l.fov * f));
  }
}, { passive: false });
canvas.addEventListener('dblclick', (e) => {
  const [x, y] = pt(e);
  const h = hit(x, y);
  if (!h) return;
  if (h.kind === 'orbit') Object.assign(camOf(h.L), { az: 30, el: 35, dist: 70 });
  else Object.assign(lookOf(h.L), { az: 180, alt: 30, fov: 90 });
});

// ——— Панель управления ———
function bind() {
  document.querySelectorAll('[data-model]').forEach((el) => {
    el.addEventListener('change', () => {
      state.enabled[el.dataset.model] = el.checked;
      if (!Object.values(state.enabled).some(Boolean)) { el.checked = true; state.enabled[el.dataset.model] = true; }
      clearTrails();
      renderInfos();
    });
  });
  document.querySelectorAll('[data-show]').forEach((el) => {
    el.checked = state.show[el.dataset.show];
    el.addEventListener('change', () => { state.show[el.dataset.show] = el.checked; });
  });
  $('dateGo').onclick = () => jump(parseDate($('dateInput').value));
  $('dateInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') jump(parseDate($('dateInput').value)); });
  $('preset').onchange = (e) => {
    const v = e.target.value;
    if (!v) return;
    jump(v === 'now' ? nowJd() : parseDate(v));
    $('dateInput').value = isoFromJd(state.jd);
    e.target.value = '';
  };
  const playBtn = $('play');
  const syncPlay = () => { playBtn.textContent = state.playing ? '⏸' : '▶'; };
  playBtn.onclick = () => { state.playing = !state.playing; syncPlay(); };
  $('stepFwd').onclick = () => { state.playing = false; syncPlay(); const d = state.dir; state.dir = 1; advance(1); state.dir = d; };
  $('stepBack').onclick = () => { state.playing = false; syncPlay(); const d = state.dir; state.dir = -1; advance(1); state.dir = d; };
  $('reverse').onclick = () => { state.dir *= -1; $('reverse').classList.toggle('on', state.dir < 0); };
  $('step').onchange = (e) => { state.step = parseFloat(e.target.value); updateSpeedLabel(); };
  $('speed').oninput = (e) => { state.stepsPerSec = speedFromSlider(+e.target.value); updateSpeedLabel(); };
  state.stepsPerSec = speedFromSlider(+$('speed').value);
  updateSpeedLabel();

  document.querySelectorAll('input[name=center]').forEach((el) => {
    el.addEventListener('change', () => { state.center = el.value; clearTrails(); });
  });
  const allCams = () => [state.cam, ...panels.map((p) => p.cam)];
  $('viewTop').onclick = () => allCams().forEach((c) => { c.el = 89.5; });
  $('viewSide').onclick = () => allCams().forEach((c) => { c.el = 0.5; });
  $('viewReset').onclick = () => allCams().forEach((c) => Object.assign(c, { az: 30, el: 35, dist: 70 }));
  $('syncCam').onchange = (e) => {
    state.sync = e.target.checked;
    if (!state.sync) panels.forEach((p) => { Object.assign(p.cam, state.cam); Object.assign(p.look, state.look); });
  };
  $('diurnal').checked = state.diurnal;
  $('diurnal').onchange = (e) => { state.diurnal = e.target.checked; };
  $('clearTrails').onclick = clearTrails;
  $('bodySize').oninput = (e) => { state.bodySize = +e.target.value; };
  $('starSize').oninput = (e) => { state.starSize = +e.target.value; };
  const moonLbl = () => { $('moonLabel').textContent = `×${state.moonScale}`; };
  $('moonScale').oninput = (e) => { state.moonScale = +e.target.value; moonLbl(); clearTrails(); };
  moonLbl();

  $('skyOn').onchange = (e) => { state.sky.on = e.target.checked; };
  $('observer').onchange = (e) => { state.observer = e.target.value; };
  $('skyGround').onchange = (e) => { state.sky.ground = e.target.checked; };
  $('skyLines').onchange = (e) => { state.sky.lines = e.target.checked; };
  $('skyTrails').onchange = (e) => { state.sky.trails = e.target.checked; };
  $('skyDay').onchange = (e) => { state.sky.daylight = e.target.checked; };

  $('collapse').onclick = () => { document.body.classList.add('collapsed'); resize(); };
  $('expand').onclick = () => { document.body.classList.remove('collapsed'); resize(); };
  $('dateInput').value = isoFromJd(state.jd);
}

function renderInfos() {
  $('infos').innerHTML = MODELS.filter((m) => state.enabled[m.id])
    .map((m) => `<details><summary>${m.name}</summary><p>${m.info}</p></details>`).join('');
}

window.sim = { state, panels, jump, clearTrails, renderer, ctx }; // для отладки из консоли
bind();
renderInfos();
resize();
new ResizeObserver(resize).observe(view);
requestAnimationFrame(frame);
