// ── Радиальный (центробежный) вентилятор: процедурная 3D-модель с разрезом ──
// Мир «Чертёж»: сталь без блеска, синий #1B4C86 на роторных частях, оранжевый
// на 3D-геометрии не используется — сигнальный цвет живёт только на HTML-кнопках
// управления. Собственная геометрия — не CAD-файл завода (его нет), поэтому
// силуэт и пропорции колеса/улитки схематичны и честны, как и у соседней
// модели агрегата (assets/ahu3d.js).
//
// ЕДИНАЯ СИСТЕМА КООРДИНАТ (важно, вся геометрия ниже её держится):
//   ось Z  — ось вращения колеса. Колесо, обечайки улитки, конфузор, вал и
//            двигатель нанизаны на неё, поэтому колесо лежит ВНУТРИ улитки.
//   плоскость XY — плоскость спирали улитки: язык (начало спирали) в точке
//            (R0, 0), спираль раскручивается против часовой на 360°, её конец
//            приходит в (R0+GROW, 0). Разрыв между этими двумя точками и есть
//            устье нагнетания, на него по касательной (вверх, +Y) насажен
//            нагнетательный патрубок.
//   -Y     — низ: опорная рама и постамент двигателя.
import * as THREE from 'three';

const STEEL      = 0xC7CDD2;
const STEEL_DARK = 0x8E9AA0;
const FRAME      = 0x3B434B;
const BLUE       = 0x1B4C86;
const BLUE_2     = 0x2C6BB4;
const DARK       = 0x1C2126;

const BLADES  = 12;              // то же число, что и у колеса секции fan в ahu3d.js
const HUB_R   = 0.62;            // радиус ступицы (посадка лопаток)
const IMP_R   = 1.00;            // наружный радиус рабочего колеса
const R0      = 1.14;            // радиус улитки у языка = IMP_R + радиальный зазор
const GROW    = 0.86;            // прирост радиуса улитки за полный оборот спирали
const WALL    = 0.11;            // толщина стенки улитки
const WIDTH   = 0.66;            // ширина канала улитки по оси Z
const INLET_R = 0.66;            // радиус входного отверстия в передней обечайке
const OUT_H   = 0.80;            // вылет нагнетательного патрубка от устья
const TAU     = Math.PI * 2;

function materials() {
  return {
    steel : new THREE.MeshStandardMaterial({color:STEEL,      metalness:.55, roughness:.5,  flatShading:true}),
    steelD: new THREE.MeshStandardMaterial({color:STEEL_DARK,  metalness:.5,  roughness:.6,  flatShading:true}),
    frame : new THREE.MeshStandardMaterial({color:FRAME,       metalness:.4,  roughness:.65, flatShading:true}),
    blue  : new THREE.MeshStandardMaterial({color:BLUE,        metalness:.7,  roughness:.3,  flatShading:true}),
    blue2 : new THREE.MeshStandardMaterial({color:BLUE_2,      metalness:.7,  roughness:.32, flatShading:true}),
    dark  : new THREE.MeshStandardMaterial({color:DARK,        metalness:.3,  roughness:.7,  flatShading:true}),
    // двусторонние материалы листовых деталей: обечайки улитки и обод колеса —
    // тонкие листы, их видно и изнутри, особенно в разрезе
    shell : new THREE.MeshStandardMaterial({color:STEEL,      metalness:.55, roughness:.5,  flatShading:true, side:THREE.DoubleSide}),
    shellD: new THREE.MeshStandardMaterial({color:STEEL_DARK,  metalness:.5,  roughness:.6,  flatShading:true, side:THREE.DoubleSide}),
    blueS : new THREE.MeshStandardMaterial({color:BLUE,        metalness:.7,  roughness:.3,  flatShading:true, side:THREE.DoubleSide}),
  };
}

// точка спирали Архимеда: t ∈ [0,1] — доля полного оборота, off — смещение по радиусу
function spiral(t, off = 0) {
  const a = t * TAU;
  const r = R0 + GROW * t + off;
  return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
}

// ── Рабочее колесо (impeller): задний диск + втулка вала + обод + 12 лопаток ──
// Ось колеса — Z, как и у всей остальной геометрии. Лопатки — один InstancedMesh
// (один draw call на все 12), назад загнутые: каждая посажена под углом к радиусу.
function buildImpeller(M) {
  const g = new THREE.Group();
  const half = WIDTH / 2 - 0.06;   // колесо чуть уже канала улитки

  // задний диск колеса (back plate)
  const back = new THREE.Mesh(new THREE.CylinderGeometry(IMP_R, IMP_R, 0.05, 32), M.blue);
  back.rotation.x = Math.PI / 2;
  back.position.z = -half;
  g.add(back);

  // втулка под вал
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(HUB_R * .26, HUB_R * .26, 0.30, 16), M.dark);
  hub.rotation.x = Math.PI / 2;
  hub.position.z = -half + 0.12;
  g.add(hub);

  // передний обод (shroud) — именно КОЛЬЦО, а не диск: через него колесо
  // засасывает воздух, диск закрыл бы вход
  const shroud = new THREE.Mesh(new THREE.RingGeometry(INLET_R * .96, IMP_R, 32, 1), M.blueS);
  shroud.position.z = half;
  g.add(shroud);

  // профиль одной лопатки — плоская выдавленная пластина (backward-curved: узкий
  // наклонный прямоугольник, изгиб задаётся посадочным углом, не формой контура)
  const rIn  = HUB_R * .90;                 // корень лопатки
  const bladeLen = IMP_R - rIn;             // вылет до наружного диаметра колеса
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0, -0.10);
  bladeShape.lineTo(bladeLen, -0.07);
  bladeShape.lineTo(bladeLen, 0.07);
  bladeShape.lineTo(0, 0.10);
  bladeShape.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {depth: half * 2 - 0.07, bevelEnabled:false, curveSegments:1});
  bladeGeo.center();

  const bladeMesh = new THREE.InstancedMesh(bladeGeo, M.blue2, BLADES);
  const dummy = new THREE.Object3D();
  const backSweep = -0.62; // угол наклона к радиусу — backward-curved (угол выхода < 90°)
  const rMid = rIn + bladeLen / 2;
  for (let i = 0; i < BLADES; i++) {
    const a = (i / BLADES) * TAU;
    dummy.position.set(Math.cos(a) * rMid, Math.sin(a) * rMid, 0);
    dummy.rotation.set(0, 0, a + backSweep);
    dummy.updateMatrix();
    bladeMesh.setMatrixAt(i, dummy.matrix);
  }
  bladeMesh.instanceMatrix.needsUpdate = true;
  g.add(bladeMesh);

  return g;
}

// ── Корпус-улитка (volute) ──
// Три листовые детали в ОДНОЙ плоскости с колесом: спиральная царга (обечайка)
// толщиной WALL, задняя стенка и передняя стенка с входным отверстием.
// Возвращает массив мешей — каждый попадает под плоскость разреза.
function buildVolute(M) {
  const N = 128;
  const parts = [];

  // 1. спиральная царга: замкнутая лента между спиралью r(t) и r(t)-WALL
  const band = [];
  for (let i = 0; i <= N; i++) band.push(spiral(i / N));
  for (let i = N; i >= 0; i--) band.push(spiral(i / N, -WALL));
  const wallGeo = new THREE.ExtrudeGeometry(new THREE.Shape(band),
    {depth: WIDTH, bevelEnabled:false, curveSegments:1});
  const wall = new THREE.Mesh(wallGeo, M.shell);
  wall.position.z = -WIDTH / 2;
  parts.push(wall);

  // 2. контур боковой стенки — та же спираль, замкнутая по устью нагнетания
  const disc = [];
  for (let i = 0; i <= N; i++) disc.push(spiral(i / N));

  // задняя стенка — сплошная (её закрывает задний диск колеса)
  const backShape = new THREE.Shape(disc);
  const backGeo = new THREE.ExtrudeGeometry(backShape, {depth: 0.04, bevelEnabled:false, curveSegments:1});
  const backPlate = new THREE.Mesh(backGeo, M.shellD);
  backPlate.position.z = -WIDTH / 2 - 0.04;
  parts.push(backPlate);

  // передняя стенка — с круглым входным отверстием под конфузор
  const frontShape = new THREE.Shape(disc);
  const hole = new THREE.Path();
  hole.absarc(0, 0, INLET_R, 0, TAU, true);
  frontShape.holes.push(hole);
  const frontGeo = new THREE.ExtrudeGeometry(frontShape, {depth: 0.04, bevelEnabled:false, curveSegments:48});
  const frontPlate = new THREE.Mesh(frontGeo, M.shell);
  frontPlate.position.z = WIDTH / 2;
  parts.push(frontPlate);

  return parts;
}

// ── Нагнетательный патрубок: короб из четырёх листов, насаженный на устье
// спирали по касательной (поток уходит вверх, +Y). Ширина коробки ровно равна
// раскрытию спирали: от языка (x = R0) до конца спирали (x = R0+GROW).
function buildOutlet(M) {
  const parts = [];
  const x0 = R0, x1 = R0 + GROW;
  const cx = (x0 + x1) / 2, w = x1 - x0;
  const t = 0.05;

  const sideX = new THREE.BoxGeometry(t, OUT_H, WIDTH);
  [x0 + t / 2, x1 - t / 2].forEach(x => {
    const m = new THREE.Mesh(sideX, M.shell);
    m.position.set(x, OUT_H / 2, 0);
    parts.push(m);
  });
  const sideZ = new THREE.BoxGeometry(w, OUT_H, t);
  [-WIDTH / 2 + t / 2, WIDTH / 2 - t / 2].forEach(z => {
    const m = new THREE.Mesh(sideZ, M.shell);
    m.position.set(cx, OUT_H / 2, z);
    parts.push(m);
  });
  // фланец выхода — рамка по периметру устья
  const fl = 0.07;
  const flX = new THREE.BoxGeometry(0.06, 0.07, WIDTH + fl * 2);
  [x0 - 0.01, x1 + 0.01].forEach(x => {
    const m = new THREE.Mesh(flX, M.shellD);
    m.position.set(x, OUT_H - 0.035, 0);
    parts.push(m);
  });
  const flZ = new THREE.BoxGeometry(w + 0.1, 0.07, 0.06);
  [-WIDTH / 2 - fl / 2, WIDTH / 2 + fl / 2].forEach(z => {
    const m = new THREE.Mesh(flZ, M.shellD);
    m.position.set(cx, OUT_H - 0.035, z);
    parts.push(m);
  });
  return parts;
}

export function mountFan(host, opts = {}) {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true, powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.localClippingEnabled = true;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 60);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x30333a, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(4, 6, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fb6dd, .9); rim.position.set(-5, 2, -4); scene.add(rim);

  const rig = new THREE.Group();
  scene.add(rig);

  const M = materials();

  // ось вращения колеса совпадает с осью входного патрубка и вала двигателя —
  // все они разделяют локальную ось Z группы fan
  const fan = new THREE.Group();
  rig.add(fan);

  const impeller = buildImpeller(M);
  fan.add(impeller);

  // корпус-улитка вокруг колеса, соосно и в одной с ним плоскости
  const shell = [];
  buildVolute(M).forEach(m => { shell.push(m); fan.add(m); });
  buildOutlet(M).forEach(m => { shell.push(m); fan.add(m); });

  // всасывающий конфузор (вход): раструб на входном отверстии передней стенки,
  // открыт с обоих торцов, сужается внутрь к ободу колеса
  const intake = new THREE.Mesh(
    new THREE.CylinderGeometry(INLET_R * 1.28, INLET_R * 1.02, 0.32, 32, 1, true),
    M.shellD);
  intake.rotation.x = Math.PI / 2;              // ось цилиндра → ось Z, radiusTop смотрит в +Z
  intake.position.z = WIDTH / 2 + 0.20;
  fan.add(intake);
  shell.push(intake);

  // губа входного раструба — по ней конфузор читается как ВХОД, а не как
  // случайный цилиндр: тонкое кольцо по наружной кромке
  // материал shellD, а не steelD: губа обязана попадать под плоскость разреза
  // вместе с конфузором, иначе в разрезе над срезом висит целое кольцо
  const lip = new THREE.Mesh(new THREE.TorusGeometry(INLET_R * 1.28, 0.028, 8, 40), M.shellD);
  lip.position.z = WIDTH / 2 + 0.36;
  fan.add(lip);
  shell.push(lip);

  // ── привод: вал и двигатель соосны колесу, с обратной от входа стороны (-Z) ──
  const MOT_R = 0.36, MOT_L = 0.72;
  const motorZ = -(WIDTH / 2 + 0.10 + MOT_L / 2 + 0.18);

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.9, 12), M.steelD);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = (motorZ + MOT_L / 2 - WIDTH / 2) / 2 - 0.05;
  fan.add(shaft);

  // корпус подшипникового узла: короткая стальная обойма от задней стенки улитки
  // до торца двигателя. Без неё вал пересекает открытый воздух и привод читается
  // отдельной деталью; с ней двигатель ПРИСТЫКОВАН к корпусу по оси колеса.
  const zBackPlate = -(WIDTH / 2 + 0.08);          // наружная плоскость задней стенки
  const zMotorFace = motorZ + MOT_L / 2;           // торец двигателя со стороны колеса
  const houseL = zBackPlate - zMotorFace;
  const house = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, houseL, 16), M.steelD);
  house.rotation.x = Math.PI / 2;
  house.position.z = (zBackPlate + zMotorFace) / 2;
  fan.add(house);

  const motor = new THREE.Mesh(new THREE.CylinderGeometry(MOT_R, MOT_R, MOT_L, 24), M.dark);
  motor.rotation.x = Math.PI / 2;
  motor.position.z = motorZ;
  fan.add(motor);

  // клеммная коробка сверху двигателя
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.3), M.dark);
  box.position.set(0, MOT_R + 0.06, motorZ);
  fan.add(box);

  // рёбра охлаждения — один InstancedMesh (один draw call на все рёбра),
  // кольца нанизаны на ту же ось Z, что и корпус двигателя
  const FINS = 9;
  const finGeo = new THREE.TorusGeometry(MOT_R + 0.015, 0.018, 6, 24);
  const finMesh = new THREE.InstancedMesh(finGeo, M.steelD, FINS);
  const finDummy = new THREE.Object3D();
  for (let i = 0; i < FINS; i++) {
    finDummy.position.set(0, 0, motorZ - MOT_L / 2 + 0.09 + i * ((MOT_L - 0.18) / (FINS - 1)));
    finDummy.rotation.set(0, 0, 0);
    finDummy.updateMatrix();
    finMesh.setMatrixAt(i, finDummy.matrix);
  }
  finMesh.instanceMatrix.needsUpdate = true;
  fan.add(finMesh);

  // ── опорная рама: улитка и двигатель стоят на общей станине ──
  const yBottom = -(R0 + GROW * .75);            // низшая точка спирали (t = 0.75)
  const yRail   = yBottom - 0.20;                // верх продольных балок рамы
  const zFront  = WIDTH / 2 + 0.20;
  const zBack   = motorZ - MOT_L / 2 - 0.20;
  const railLen = zFront - zBack;
  const railZ   = (zFront + zBack) / 2;

  const railGeo = new THREE.BoxGeometry(0.13, 0.12, railLen);
  [-0.78, 0.78].forEach(x => {
    const r = new THREE.Mesh(railGeo, M.frame);
    r.position.set(x, yRail - 0.06, railZ);
    fan.add(r);
  });
  const crossGeo = new THREE.BoxGeometry(1.69, 0.12, 0.13);
  [zFront - 0.07, zBack + 0.07].forEach(z => {
    const c = new THREE.Mesh(crossGeo, M.frame);
    c.position.set(0, yRail - 0.06, z);
    fan.add(c);
  });

  // седло под улиткой: плита от рамы до нижней образующей корпуса
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.22, WIDTH + 0.12), M.frame);
  saddle.position.set(0, yBottom - 0.09, 0);
  fan.add(saddle);

  // постамент двигателя: от рамы до его нижней образующей
  const pedH = (-MOT_R) - yRail;
  const ped = new THREE.Mesh(new THREE.BoxGeometry(0.52, pedH, 0.46), M.frame);
  ped.position.set(0, yRail + pedH / 2, motorZ);
  fan.add(ped);
  // лапы двигателя: плита по верху постамента, на неё сел корпус двигателя
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.07, MOT_L * .78), M.frame);
  foot.position.set(0, -MOT_R + 0.02, motorZ);
  fan.add(foot);

  // ── Центрируем модель в начале координат: rig вращается вокруг оси Y,
  // а 3d.html орбитирует камеру вокруг (0,0,0) — модель обязана стоять там.
  fan.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(fan);
  const centre = bbox.getCenter(new THREE.Vector3());
  fan.position.set(-centre.x, -centre.y, -centre.z);
  fan.updateMatrixWorld(true);
  // Опорные точки для кадрирования: углы габаритных коробок всех деталей.
  // Описанная сфера отбросила бы камеру заметно дальше, чем нужно, — а по
  // точкам кадр считается точно и остаётся честным при любом повороте.
  const fitPts = [];
  fan.traverse(o => {
    if (!o.isMesh) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    for (let i = 0; i < 8; i++) {
      fitPts.push(new THREE.Vector3(
        (i & 1) ? bb.max.x : bb.min.x,
        (i & 2) ? bb.max.y : bb.min.y,
        (i & 4) ? bb.max.z : bb.min.z).applyMatrix4(o.matrixWorld));
    }
  });

  // Разрез (cutaway): плоскость сечения проходит через ось вращения колеса и
  // срезает верх корпуса — открывается вид на колесо ВНУТРИ улитки. Плоскость
  // задана в локальных осях модели и каждый кадр переносится в мировые,
  // поэтому разрез не «плывёт» при повороте. Геометрия не пересобирается.
  // Плоскости назначаются материалам только в toggleSection()/setSection(),
  // а не здесь: до первого клика по кнопке модель должна быть целой.
  const localPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.06);
  const cutPlane = new THREE.Plane();
  let sectioned = false;

  let dragging = false, lastX = 0, yaw = 0.32, autoSpin = !reduceMotion;
  let running = true;

  host.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; autoSpin = false; });
  addEventListener('pointerup', () => dragging = false);
  addEventListener('pointermove', e => {
    if (!dragging) return;
    yaw += (e.clientX - lastX) * 0.006;
    lastX = e.clientX;
  });

  // Кадрирование: модель должна целиком помещаться в кадр при ЛЮБОМ повороте
  // вокруг Y и при любом соотношении сторон — на телефоне контейнер всего
  // ~356×222 css-пикселей. Для каждой опорной точки решаем, с какого удаления
  // она попадает в конус камеры, и берём максимум по кругу поворотов.
  const dir = new THREE.Vector3(0.62, 0.40, 1.0).normalize();
  const camRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
  const camUp = new THREE.Vector3().crossVectors(dir, camRight).normalize();
  const YAWS = 36;
  const _p = new THREE.Vector3();
  function fit() {
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const tanH = tanV * camera.aspect;
    let dist = 1;
    for (let s = 0; s < YAWS; s++) {
      const a = s / YAWS * TAU, ca = Math.cos(a), sa = Math.sin(a);
      for (const q of fitPts) {
        _p.set(q.x * ca + q.z * sa, q.y, q.z * ca - q.x * sa);
        const need = Math.max(Math.abs(_p.dot(camRight)) / tanH, Math.abs(_p.dot(camUp)) / tanV)
          + _p.dot(dir);
        if (need > dist) dist = need;
      }
    }
    camera.position.copy(dir).multiplyScalar(dist * 1.04);
    camera.lookAt(0, 0, 0);
  }

  function resize() {
    const w = host.clientWidth, h = host.clientHeight || w * .62;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fit();
  }
  new ResizeObserver(resize).observe(host);
  resize();

  const io = new IntersectionObserver(es => { running = es[0].isIntersecting; }, {threshold:.05});
  io.observe(host);

  function frame() {
    requestAnimationFrame(frame);
    if (!running) return;
    if (!reduceMotion) impeller.rotation.z += 0.028;
    if (autoSpin) yaw += 0.0022;
    rig.rotation.y += (yaw - rig.rotation.y) * 0.12;
    if (sectioned) {
      fan.updateWorldMatrix(true, false);
      cutPlane.copy(localPlane).applyMatrix4(fan.matrixWorld);
    }
    renderer.render(scene, camera);
    opts.onFrame && opts.onFrame({fan, sectioned});
  }
  frame();

  function applySection() {
    const planes = sectioned ? [cutPlane] : [];
    M.shell.clippingPlanes  = planes;
    M.shellD.clippingPlanes = planes;
    // из колеса режется только передний обод — лист, который иначе закрывал бы
    // лопатки; задний диск и сами лопатки остаются целыми, как на разрезах в
    // каталогах: ротор не рассекают, его показывают внутри вскрытого корпуса
    M.blueS.clippingPlanes  = planes;
  }

  return {
    toggleSection() {
      sectioned = !sectioned;
      applySection();
      return sectioned;
    },
    setSection(v) {
      sectioned = !!v;
      applySection();
    },
    camera, renderer,
    destroy() { io.disconnect(); renderer.dispose(); host.removeChild(renderer.domElement); },
  };
}
