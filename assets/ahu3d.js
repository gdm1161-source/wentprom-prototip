// ── Приточно-вытяжная установка: процедурная 3D-модель, разбираемая на узлы ──
// Мир «Чертёж»: сталь без блеска, синий #1B4C86 на роторных частях, оранжевый
// #D9540B только на индикаторе действия (кнопка — вне этого файла). Собственная
// геометрия — не CAD-файл завода (его нет), пропорции выверены по карточке
// bimlib.pro AIRNED-R10 (8475×1877×2103 мм ≈ 4,03:1:0,89 длина:высота:ширина),
// силуэт — ряд секций встык на общей раме со видимыми вертикальными стыками.
//
// Ось потока — мировая X (длина ложится на экран горизонтально), высота — Y,
// ширина/глубина — Z. Камера смотрит почти вдоль -Z с небольшим наклоном,
// поэтому «лицевая» стенка каждой секции (+Z) несёт отличительный узел —
// смотровое окно рекуператора/вентилятора, дверца фильтра и калорифера — а
// торцевые жалюзи забора/выброса стоят на дальних торцах (±X).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const STEEL      = 0xCFD5D9;
const STEEL_DARK = 0x848E94;
const FRAME      = 0x2C333A;
const BLUE       = 0x1B4C86;
const BLUE_2     = 0x2C6BB4;
const DARK       = 0x1C2126;

const SEC_H = 1.7;                 // высота корпуса — общая для всех секций
const SEC_W = 1.52;                // ширина/глубина — 1,7 · (1877/2103)
const GAP_REST = 0.05;             // зазор между секциями в собранном виде

// Длины секций вдоль оси потока (X), порядок = порядок воздуха по установке.
// Доли от полной длины подобраны инженерно: вентилятор и рекуператор —
// самые крупные секции, заслонки забора/выброса — самые короткие.
const SECTIONS = [
  {key:'intake', len:0.60, label:'Забор воздуха',       note:'жалюзи + заслонка'},
  {key:'filter', len:0.73, label:'Фильтрация',          note:'кассета G4'},
  {key:'recup',  len:1.78, label:'Рекуперация',         note:'роторный теплообменник'},
  {key:'fan',    len:1.78, label:'Вентилятор',          note:'радиальное колесо + мотор'},
  {key:'heat',   len:1.06, label:'Нагрев / охлаждение', note:'оребрённый калорифер'},
  {key:'outlet', len:0.66, label:'Выброс',              note:'жалюзи'},
];

function materials() {
  return {
    steel : new THREE.MeshStandardMaterial({color:STEEL,      metalness:.72, roughness:.3}),
    steelD: new THREE.MeshStandardMaterial({color:STEEL_DARK, metalness:.62, roughness:.42}),
    frame : new THREE.MeshStandardMaterial({color:FRAME,      metalness:.4,  roughness:.55}),
    blue  : new THREE.MeshStandardMaterial({color:BLUE,       metalness:.78, roughness:.24}),
    blue2 : new THREE.MeshStandardMaterial({color:BLUE_2,     metalness:.78, roughness:.26}),
    dark  : new THREE.MeshStandardMaterial({color:DARK,       metalness:.3,  roughness:.65}),
  };
}

// Закрытый кожух секции: 6 панелей + цоколь-рама. holeZ>0 — на лицевой стенке
// (+Z) вырезано круглое смотровое окно (рекуператор/вентилятор) вместо
// сплошной панели.
function buildShellPanels(len, h, w, M, {holeZ = 0} = {}) {
  const g = new THREE.Group();
  const t = 0.02;
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  add(new THREE.BoxGeometry(len, t, w), M.steel,  0,  h/2, 0);   // верх
  add(new THREE.BoxGeometry(len, t, w), M.steelD, 0, -h/2, 0);   // низ
  add(new THREE.BoxGeometry(len, h, t), M.steel,  0, 0, -w/2);   // тыльная стенка (-Z)

  if (holeZ > 0) {
    const shape = new THREE.Shape([
      new THREE.Vector2(-len/2, -h/2), new THREE.Vector2(len/2, -h/2),
      new THREE.Vector2(len/2,  h/2), new THREE.Vector2(-len/2,  h/2),
    ]);
    const hole = new THREE.Path();
    hole.absarc(0, 0, holeZ, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, {depth: t, bevelEnabled: false, curveSegments: 48});
    geo.translate(0, 0, w/2 - t/2);
    g.add(new THREE.Mesh(geo, M.steel));
  } else {
    add(new THREE.BoxGeometry(len, h, t), M.steel, 0, 0, w/2);  // лицевая стенка (+Z)
  }

  add(new THREE.BoxGeometry(t, h, w), M.steelD, -len/2, 0, 0);  // торец против потока
  add(new THREE.BoxGeometry(t, h, w), M.steelD,  len/2, 0, 0);  // торец по потоку

  const railH = 0.12;
  add(new THREE.BoxGeometry(len * .96, railH, w * .9), M.frame, 0, -h/2 - railH/2, 0);
  return g;
}

// Узкие выступающие рёбра-стыки на обеих боковых стенках у обоих торцов
// секции — визуальный маркёр модульности, как на карточке bimlib.
function addSeams(grp, len, h, w, M) {
  const ribT = 0.075, ribD = 0.08;
  for (const x of [-len/2, len/2]) {
    for (const zSide of [-1, 1]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(ribT, h * 1.07, ribD), M.frame);
      rib.position.set(x, 0, zSide * (w/2 + ribD/2 - 0.012));
      grp.add(rib);
    }
  }
}

// Ротор/крыльчатка: тор + спицы, лежит в плоскости XY (нормаль — Z), поэтому
// без доворота видна прямо в лицевое смотровое окно секции.
function wheelWithSpokes(r, thickness, spokes, M) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.TorusGeometry(r, thickness, 8, 40), M.blue));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * .16, r * .16, thickness * 1.8, 16), M.dark);
  hub.rotation.x = Math.PI / 2; g.add(hub);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const sp = new THREE.Mesh(new THREE.BoxGeometry(r * 1.86, thickness * .5, thickness * .5), M.blue2);
    sp.rotation.z = a;
    g.add(sp);
  }
  return g;
}

// Наклонные жалюзи на дальнем торце секции (side = -1 забор, +1 выброс).
function louverBlades(len, h, w, M, side) {
  const g = new THREE.Group();
  const n = 6;
  for (let i = 0; i < n; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, w * .82), M.steelD);
    b.position.set(side * (len/2 + 0.03), -h * .34 + i * (h * .6 / (n - 1)), 0);
    b.rotation.z = side * .5;
    g.add(b);
  }
  return g;
}

function buildIntake(len, h, w, M) {
  const g = buildShellPanels(len, h, w, M);
  g.add(louverBlades(len, h, w, M, -1));
  addSeams(g, len, h, w, M);
  return g;
}
function buildOutlet(len, h, w, M) {
  const g = buildShellPanels(len, h, w, M);
  g.add(louverBlades(len, h, w, M, 1));
  addSeams(g, len, h, w, M);
  return g;
}

function buildFilter(len, h, w, M) {
  const g = buildShellPanels(len, h, w, M);
  const door = new THREE.Mesh(new THREE.BoxGeometry(len * .62, h * .66, 0.012), M.steelD);
  door.position.set(0, 0, w/2 + 0.008);
  g.add(door);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.15, 0.03), M.dark);
  handle.position.set(len * .2, 0, w/2 + 0.02);
  g.add(handle);
  addSeams(g, len, h, w, M);
  return g;
}

function buildRecup(len, h, w, M) {
  const holeR = h * .42;
  const g = buildShellPanels(len, h, w, M, {holeZ: holeR});
  const wheel = wheelWithSpokes(holeR * .92, 0.05, 10, M);
  wheel.position.set(0, 0, w/2 - 0.05);
  g.add(wheel);
  g.userData.spin = wheel; g.userData.spinAxis = 'z';
  addSeams(g, len, h, w, M);
  return g;
}

function buildFan(len, h, w, M) {
  const holeR = h * .34;
  const g = buildShellPanels(len, h, w, M, {holeZ: holeR});
  const wheel = wheelWithSpokes(holeR * .9, 0.045, 12, M);
  wheel.position.set(-len * .08, 0, w/2 - 0.05);
  g.add(wheel);
  g.userData.spin = wheel; g.userData.spinAxis = 'z'; g.userData.spinFast = true;

  // мотор снаружи, на боковой (+Z) стенке — как на реальных секциях
  // вентилятора, где привод выведен наружу корпуса
  const motorR = h * .16, motorLen = len * .38;
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(motorR, motorR, motorLen, 20), M.dark);
  motor.rotation.x = Math.PI / 2;
  motor.position.set(len * .22, h * .05, w/2 + motorLen/2 + 0.02);
  g.add(motor);
  for (let i = 0; i < 8; i++) {
    const fin = new THREE.Mesh(new THREE.TorusGeometry(motorR * 1.12, 0.008, 6, 20), M.steelD);
    fin.position.set(len * .22, h * .05, w/2 + 0.03 + i * (motorLen * .8 / 7));
    g.add(fin);
  }
  addSeams(g, len, h, w, M);
  return g;
}

function buildHeat(len, h, w, M) {
  const g = buildShellPanels(len, h, w, M);
  const door = new THREE.Mesh(new THREE.BoxGeometry(len * .7, h * .7, 0.012), M.steelD);
  door.position.set(0, 0, w/2 + 0.008);
  g.add(door);
  for (let i = 0; i < 6; i++) {
    const groove = new THREE.Mesh(new THREE.BoxGeometry(len * .62, 0.02, 0.02), M.dark);
    groove.position.set(0, -h * .28 + i * (h * .56 / 5), w/2 + 0.016);
    g.add(groove);
  }
  addSeams(g, len, h, w, M);
  return g;
}

const BUILDERS = {intake:buildIntake, filter:buildFilter, recup:buildRecup,
                  fan:buildFan, heat:buildHeat, outlet:buildOutlet};

// Мягкая контактная тень под рамой — самый дешёвый вариант: полупрозрачный
// спрайт с радиальным градиентом на canvas, без shadow map.
function makeShadowTexture() {
  const size = 256;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  grad.addColorStop(0,   'rgba(18,24,28,.55)');
  grad.addColorStop(.6,  'rgba(18,24,28,.26)');
  grad.addColorStop(1,   'rgba(18,24,28,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function mountAHU(host, opts = {}) {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1.6, .1, 60);

  // PBR-освещение: PMREM-окружение из RoomEnvironment вместо HDRI-файла —
  // даёт мягкие блики/отражения на металле без загрузки внешних текстур.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.045).texture;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x33363c, 1.05));
  const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(4.5, 6, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fb6dd, 1.0); rim.position.set(-5, 2.4, -4.5); scene.add(rim);

  const rig = new THREE.Group();
  scene.add(rig);

  const M = materials();

  // ── сборка секций вдоль X, собранное положение ──────────────────────────
  const totalLen = SECTIONS.reduce((s, d) => s + d.len, 0) + GAP_REST * (SECTIONS.length - 1);
  let x = -totalLen / 2;
  const groups = SECTIONS.map(def => {
    const grp = BUILDERS[def.key](def.len, SEC_H, SEC_W, M);
    const restX = x + def.len / 2;
    x += def.len + GAP_REST;
    grp.position.x = restX;
    grp.userData.restX = restX;
    grp.userData.def = def;
    rig.add(grp);
    return grp;
  });

  // ── целевые позиции разъезда: реальный зазор между КАЖДОЙ парой секций,
  //    а не единый шаг по индексу — иначе крупные секции (рекуператор,
  //    вентилятор) наедут друг на друга при разборке ─────────────────────
  const EXPLODE_GAP = 0.42;
  {
    let ex = 0;
    const raw = [];
    groups.forEach(g => {
      ex += g.userData.def.len / 2;
      raw.push(ex);
      ex += g.userData.def.len / 2 + EXPLODE_GAP;
    });
    const firstMin = raw[0] - groups[0].userData.def.len / 2;
    const lastMax  = raw[raw.length - 1] + groups[groups.length - 1].userData.def.len / 2;
    const center = (firstMin + lastMax) / 2;
    groups.forEach((g, i) => { g.userData.explodeX = raw[i] - center; });
    var explodedHalfLen = (lastMax - firstMin) / 2;
  }

  // ── кадрирование камеры: по разобранному состоянию (оно длиннее) с
  //    отдельным расчётом вертикального и горизонтального захвата, т.к.
  //    установка сильно вытянута — важнее горизонтальный fit ─────────────
  const ASPECT = 1.6; // соответствует aspect-ratio:16/10 у .ahu3d-stage
  camera.aspect = ASPECT;
  camera.updateProjectionMatrix();
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * ASPECT);
  const halfH = SEC_H / 2 + 0.16;
  const halfL = explodedHalfLen;
  const dist = Math.max(halfH / Math.tan(vFov / 2), halfL / Math.tan(hFov / 2)) * 1.3;

  // Камера смотрит преимущественно вдоль -Z (длина установки ложится
  // горизонтально на экран), с небольшим наклоном сверху и небольшим
  // разворотом по X — так виден и фасад (+Z, окна/дверцы узлов), и один
  // из торцов с жалюзи (как на изометрии bimlib).
  const dir = new THREE.Vector3(0.38, 0.20, 0.90).normalize();
  camera.position.copy(dir.multiplyScalar(dist));
  camera.lookAt(0, 0, 0);

  // ── контактная тень ──────────────────────────────────────────────────
  const shadowGeo = new THREE.PlaneGeometry(1, 1);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({
    map: makeShadowTexture(), transparent: true, depthWrite: false, toneMapped: false, opacity: .8,
  }));
  shadow.position.y = -SEC_H / 2 - 0.13;
  scene.add(shadow);

  let explode = 0, explodeTarget = 0, manualExplode = null, manualAnchorY = 0;
  let dragging = false, lastX = 0, yawDrag = 0, yawScroll = 0, autoSpin = !reduceMotion;
  let running = true;

  host.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; autoSpin = false; });
  addEventListener('pointerup', () => dragging = false);
  addEventListener('pointermove', e => {
    if (!dragging) return;
    yawDrag += (e.clientX - lastX) * 0.006;
    lastX = e.clientX;
  });

  function resize() {
    const w = host.clientWidth, h = host.clientHeight || w / ASPECT;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  const io = new IntersectionObserver(es => { running = es[0].isIntersecting; }, {threshold: .05});
  io.observe(host);

  // ── привязка к скроллу: секция #ustanovka как трек прогресса 0 → 1 ─────
  const scrollSection = host.closest('section') || host;
  function scrollProgress() {
    const rect = scrollSection.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    return Math.min(1, Math.max(0, (vh - rect.top) / (vh + rect.height)));
  }
  function smooth01(t) { return t * t * (3 - 2 * t); }
  function mapExplode(p) {
    const a = 0.32, b = 0.88;
    if (p <= a) return 0;
    if (p >= b) return 1;
    return smooth01((p - a) / (b - a));
  }
  const ARC = THREE.MathUtils.degToRad(17); // мягкая дуга орбиты камеры

  let onScroll = null;
  if (!reduceMotion) {
    // Осознанный скролл страницы возвращает управление разборкой скроллу —
    // кнопка лишь временно перекрывает цель до следующего скролла. Порог в
    // пикселях защищает от ложного сброса: клик по кнопке сам может на
    // 1–2px сдвинуть скролл (браузер подводит фокус в видимую область).
    onScroll = () => {
      if (manualExplode !== null && Math.abs(window.scrollY - manualAnchorY) > 24) {
        manualExplode = null;
      }
    };
    addEventListener('scroll', onScroll, {passive: true});
  }

  function frame() {
    requestAnimationFrame(frame);
    if (!running) return;

    if (!reduceMotion) {
      const p = scrollProgress();
      if (manualExplode === null) explodeTarget = mapExplode(p);
      yawScroll = Math.sin((p - 0.5) * Math.PI) * ARC;
      if (p > 0.015) autoSpin = false; // как только пошла прокрутка — гасим авто-вращение простоя
    }

    explode += (explodeTarget - explode) * 0.09;
    groups.forEach(g => {
      g.position.x = g.userData.restX + (g.userData.explodeX - g.userData.restX) * explode;
      if (g.userData.spin && !reduceMotion) {
        g.userData.spin.rotation[g.userData.spinAxis] += g.userData.spinFast ? 0.11 : 0.018;
      }
    });

    if (autoSpin) yawDrag += 0.0018;
    const yawWanted = yawDrag + yawScroll;
    rig.rotation.y += (yawWanted - rig.rotation.y) * 0.12;

    const lenNow = THREE.MathUtils.lerp(totalLen, explodedHalfLen * 2, explode);
    shadow.scale.set(lenNow * 1.06, 1, SEC_W * 2.5);

    renderer.render(scene, camera);
    opts.onFrame && opts.onFrame({groups, explode});
  }
  frame();

  return {
    toggle() {
      manualExplode = explodeTarget > .5 ? 0 : 1;
      explodeTarget = manualExplode;
      manualAnchorY = window.scrollY;
      return manualExplode > .5;
    },
    setExploded(v) {
      manualExplode = v ? 1 : 0;
      explodeTarget = manualExplode;
      manualAnchorY = window.scrollY;
    },
    groups, camera, renderer,
    destroy() {
      io.disconnect(); ro.disconnect();
      if (onScroll) removeEventListener('scroll', onScroll);
      renderer.dispose();
      host.removeChild(renderer.domElement);
    },
  };
}
