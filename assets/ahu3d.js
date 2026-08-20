// ── Приточно-вытяжная установка: процедурная 3D-модель, разбираемая на узлы ──
// Мир «Чертёж»: сталь без блеска, синий #1B4C86 на роторных частях, оранжевый
// #D9540B только на индикаторе действия. Собственная геометрия — не CAD-файл
// завода (его нет), поэтому силуэт и пропорции секций схематичны и честны.
//
// Главное требование к читаемости: даже в СОБРАННОМ виде и на статичном кадре
// должно быть видно, что корпус — это связка самостоятельных секций, а внутри
// есть начинка. Отсюда пять приёмов, и все — без единого нового цвета:
//   1) соседние секции обшиты панелью разного тона — STEEL и STEEL_DARK: по
//      корпусу идёт чередование светлая/тёмная, и шесть секций считываются
//      мгновенно, даже на мелком статичном кадре;
//   2) каждая секция обрамлена фланцем цвета FRAME по обоим торцам, и в
//      собранном виде два соседних фланца дают широкую тёмную отбивку стыка;
//   3) в обоих бортах секции — реальный проём дверцы с ручкой, петлями и
//      шильдиком: внутрь видно узел, а навеска говорит «это отдельный шкаф»;
//   4) внутренняя обшивка (FRAME, BackSide) держит нутро тёмным, поэтому узел
//      читается силуэтом и агрегат не просвечивает насквозь;
//   5) кадрирование считается по реальной проекции габарита на текущее
//      соотношение сторон, а собранный агрегат подмасштабируется до того же
//      кадра — модель заполняет сцену, а не висит бруском в пустом поле.
import * as THREE from 'three';

const STEEL      = 0xC7CDD2;
const STEEL_DARK = 0x8E9AA0;
const FRAME      = 0x3B434B;
const BLUE       = 0x1B4C86;
const BLUE_2     = 0x2C6BB4;
const DARK       = 0x1C2126;

const SEC_W = 1.9, SEC_H = 1.7; // ширина/высота корпуса — общие для всех секций
const GAP_REST = 0.10;          // зазор между секциями в собранном виде
const WALL   = 0.024;           // толщина панели
const FLG_D  = 0.062;           // толщина фланца вдоль потока
const FLG_P  = 0.068;           // вылет фланца наружу за плоскость панели
const DOOR_V = 0.24;            // ширина обвязки дверцы по высоте
const FIT    = 0.93;            // доля кадра, которую занимает разобранная модель

// Длины секций вдоль оси потока (Z), порядок = порядок воздуха по установке.
// face — в какую сторону смотрит наружный торец крайней секции.
const SECTIONS = [
  {key:'intake',  len:0.62, label:'Забор воздуха',      note:'жалюзи + заслонка',      face:-1},
  {key:'filter',  len:0.50, label:'Фильтрация',         note:'кассета G4'},
  {key:'recup',   len:0.95, label:'Рекуперация',        note:'роторный теплообменник'},
  {key:'fan',     len:0.95, label:'Вентилятор',         note:'радиальное колесо + мотор'},
  {key:'heat',    len:0.62, label:'Нагрев / охлаждение',note:'оребрённый калорифер'},
  {key:'outlet',  len:0.55, label:'Выброс',             note:'жалюзи',                 face:1},
];

function materials() {
  return {
    // panelA / panelB — обшивка соседних секций. Разница тона (STEEL против
    // STEEL_DARK) — единственный приём, который держится на любом размере кадра
    // и при любом ракурсе: корпус читается как чередование светлых и тёмных
    // шкафов, а не как один крашеный ящик. Оба цвета уже объявлены выше.
    steel : new THREE.MeshStandardMaterial({color:STEEL,      metalness:.55, roughness:.42, flatShading:true}),
    panelB: new THREE.MeshStandardMaterial({color:STEEL_DARK, metalness:.28, roughness:.78, flatShading:true}),
    steelD: new THREE.MeshStandardMaterial({color:STEEL_DARK, metalness:.5,  roughness:.6,  flatShading:true}),
    frame : new THREE.MeshStandardMaterial({color:FRAME,      metalness:.4,  roughness:.65, flatShading:true}),
    blue  : new THREE.MeshStandardMaterial({color:BLUE,       metalness:.7,  roughness:.3}),
    blue2 : new THREE.MeshStandardMaterial({color:BLUE_2,     metalness:.7,  roughness:.32}),
    dark  : new THREE.MeshStandardMaterial({color:DARK,       metalness:.3,  roughness:.7}),
    // внутренняя обшивка: видна только изнутри, поэтому BackSide — один меш
    // закрывает секцию со всех сторон и не мешает смотреть в проём дверцы
    inner : new THREE.MeshStandardMaterial({color:FRAME,      metalness:.15, roughness:.95, side:THREE.BackSide}),
  };
}

// Прямоугольная рамка (наружный контур минус проём), выдавленная по Z.
// Одним мешем строятся и фланец секции, и обвязка дверцы, и обойма фильтра.
function ringMesh(w, h, iw, ih, depth, mat) {
  const s = new THREE.Shape();
  s.moveTo(-w/2, -h/2); s.lineTo(w/2, -h/2); s.lineTo(w/2, h/2); s.lineTo(-w/2, h/2); s.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-iw/2, -ih/2); hole.lineTo(-iw/2, ih/2); hole.lineTo(iw/2, ih/2); hole.lineTo(iw/2, -ih/2); hole.closePath();
  s.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(s, {depth, bevelEnabled:false, curveSegments:1});
  geo.translate(0, 0, -depth/2);
  return new THREE.Mesh(geo, mat);
}

const box = (a, b, c, mat) => new THREE.Mesh(new THREE.BoxGeometry(a, b, c), mat);

// ── Кожух секции ────────────────────────────────────────────────────────────
// Крыша, дно, две торцевые перегородки, внутренняя обшивка, две дверцы с
// проёмом, два фланца, цоколь и навеска (ручки + петли одним InstancedMesh).
function buildShell(len, M, o) {
  const g = new THREE.Group();
  const w = SEC_W, h = SEC_H, pan = o.panel;
  const put = (m, x, y, z) => { m.position.set(x, y, z); g.add(m); return m; };

  put(box(w - 0.06, WALL, len - 0.02, pan),      0,  h/2 - WALL/2, 0);   // крыша
  put(box(w - 0.06, WALL, len - 0.02, M.steelD), 0, -h/2 + WALL/2, 0);   // дно
  // торцевые перегородки: из-за них секция читается замкнутым объёмом, а взгляд
  // не проваливается насквозь через весь агрегат
  put(box(w - 0.06, h - 0.06, WALL, M.steelD), 0, 0, -len/2 + WALL/2);
  put(box(w - 0.06, h - 0.06, WALL, M.steelD), 0, 0,  len/2 - WALL/2);

  // внутренняя обшивка — тёмный короб изнутри
  g.add(new THREE.Mesh(new THREE.BoxGeometry(w - 0.08, h - 0.08, len - 0.08), M.inner));

  // дверцы с проёмом на обоих бортах: агрегат крутится, и с любой стороны
  // должно быть видно начинку, а не глухой лист
  const dz = Math.min(0.17, Math.max(0.10, len * 0.20));
  const dW = len - 0.03, dH = h - 0.02;
  const door = ringMesh(dW, dH, dW - dz * 2, dH - DOOR_V * 2, 0.05, pan);
  door.rotation.y = Math.PI / 2;
  door.position.x = w / 2 - 0.012;
  g.add(door);
  const door2 = door.clone(); door2.position.x = -(w / 2 - 0.012); g.add(door2);

  // фланцы по торцам — тёмная отбивка между соседними секциями
  const fl = ringMesh(w + FLG_P * 2, h + FLG_P * 2, w - 0.10, h - 0.10, FLG_D, M.frame);
  fl.position.z = -len / 2; g.add(fl);
  const fl2 = fl.clone(); fl2.position.z = len / 2; g.add(fl2);

  // рама-цоколь
  put(box(w * 0.94, 0.15, len - 0.02, M.frame), 0, -h/2 - 0.075, 0);

  // навеска обеих дверец: ручка, две петли и шильдик на верхней обвязке —
  // восемь деталей одним draw call. Именно навеска, а не шов, читается как
  // «здесь начинается отдельный шкаф» даже на статичном кадре
  const hw = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.frame, 8);
  const d = new THREE.Object3D();
  let i = 0;
  [1, -1].forEach(sx => {
    d.position.set(sx * (w/2 + 0.035), 0, dW/2 - dz/2);
    d.scale.set(0.06, 0.30, 0.05); d.updateMatrix(); hw.setMatrixAt(i++, d.matrix);
    [0.34, -0.34].forEach(fy => {
      d.position.set(sx * (w/2 + 0.025), fy * h, -dW/2 + dz/2);
      d.scale.set(0.05, 0.11, 0.09); d.updateMatrix(); hw.setMatrixAt(i++, d.matrix);
    });
    // шильдик секции на верхней обвязке дверцы (без надписи: текста на модели
    // нет — придумывать маркировку не наше дело)
    d.position.set(sx * (w/2 + 0.022), h/2 - DOOR_V/2 - 0.02, 0);
    d.scale.set(0.02, 0.10, Math.min(0.34, dW * 0.42)); d.updateMatrix(); hw.setMatrixAt(i++, d.matrix);
  });
  hw.instanceMatrix.needsUpdate = true;
  g.add(hw);

  return g;
}

// Колесо с ободом и спицами: обод + втулка + один InstancedMesh на все спицы.
// Плоскость колеса — XY, ось вращения Z (снаружи группа доворачивается по Y).
function bladedWheel(r, thickness, spokes, M) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.TorusGeometry(r, thickness, 8, 32), M.blue));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r*.15, r*.15, thickness*3.2, 14), M.dark);
  hub.rotation.x = Math.PI/2; g.add(hub);
  const sp = new THREE.InstancedMesh(
    new THREE.BoxGeometry(r*1.9, thickness*.9, thickness*1.4), M.blue2, spokes);
  const d = new THREE.Object3D();
  for (let i = 0; i < spokes; i++) {
    d.rotation.set(0, 0, (i / spokes) * Math.PI);
    d.updateMatrix(); sp.setMatrixAt(i, d.matrix);
  }
  sp.instanceMatrix.needsUpdate = true;
  g.add(sp);
  return g;
}

// ── Крайние секции: забор и выброс ──────────────────────────────────────────
// Наружный торец получает выступающий короб с жалюзи (ломает силуэт ящика),
// внутри — поворотная заслонка, её видно через проём дверцы.
function buildEnds(len, M, o) {
  const g = buildShell(len, M, o);
  const s = o.face || 1;
  const zOut = s * (len/2 + 0.09);

  const hood = ringMesh(SEC_W*0.9, SEC_H*0.88, SEC_W*0.78, SEC_H*0.74, 0.18, M.frame);
  hood.position.z = zOut;
  g.add(hood);

  const d = new THREE.Object3D();
  const bl = new THREE.InstancedMesh(new THREE.BoxGeometry(SEC_W*0.76, 0.032, 0.2), M.steelD, 7);
  for (let i = 0; i < 7; i++) {
    d.position.set(0, -SEC_H*0.29 + i * (SEC_H*0.58/6), zOut);
    d.rotation.set(-0.5 * s, 0, 0);
    d.updateMatrix(); bl.setMatrixAt(i, d.matrix);
  }
  bl.instanceMatrix.needsUpdate = true; g.add(bl);

  const dm = new THREE.InstancedMesh(new THREE.BoxGeometry(SEC_W*0.72, 0.022, 0.26), M.blue2, 5);
  for (let i = 0; i < 5; i++) {
    d.position.set(0, -SEC_H*0.26 + i * (SEC_H*0.52/4), -s * len * 0.10);
    d.rotation.set(0.62, 0, 0);
    d.updateMatrix(); dm.setMatrixAt(i, d.matrix);
  }
  dm.instanceMatrix.needsUpdate = true; g.add(dm);
  return g;
}

// ── Фильтр: обойма + пакет карманов «в гармошку» ────────────────────────────
function buildFilter(len, M, o) {
  const g = buildShell(len, M, o);
  g.add(ringMesh(SEC_W*0.86, SEC_H*0.86, SEC_W*0.72, SEC_H*0.72, 0.07, M.steelD));
  const n = 12;
  const p = new THREE.InstancedMesh(
    new THREE.BoxGeometry(SEC_W*0.70, SEC_H*0.70, 0.014), M.steel, n);
  const d = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    d.position.set(0, 0, (i/(n-1) - .5) * 0.28);
    d.rotation.set(0, (i % 2 ? 1 : -1) * 0.36, 0);
    d.updateMatrix(); p.setMatrixAt(i, d.matrix);
  }
  p.instanceMatrix.needsUpdate = true; g.add(p);
  return g;
}

// ── Рекуператор: роторное колесо в барабане + привод ────────────────────────
function buildRecup(len, M, o) {
  const g = buildShell(len, M, o);
  const R = SEC_H * 0.40;
  const wheel = bladedWheel(R, 0.055, 14, M);
  wheel.rotation.y = Math.PI/2;          // плоскость ротора — поперёк борта
  g.add(wheel);
  g.userData.spin = wheel; g.userData.spinAxis = 'x';

  // барабан вокруг колеса — виден изнутри, поэтому BackSide
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(R*1.15, R*1.15, len*0.62, 24, 1, true),
    new THREE.MeshStandardMaterial({color:STEEL, metalness:.4, roughness:.6, side:THREE.BackSide}));
  drum.rotation.z = Math.PI/2;
  g.add(drum);

  // мотор-редуктор привода ротора под колесом
  const mot = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.28, 12), M.dark);
  mot.rotation.z = Math.PI/2;
  mot.position.set(0, -R - 0.16, 0);
  g.add(mot);
  return g;
}

// ── Вентиляторная секция: улитка поперёк потока, колесо смотрит в дверцу ────
function buildFan(len, M, o) {
  const g = buildShell(len, M, o);
  const R0 = SEC_H*0.28, GROW = 0.24, TURNS = 72, WALL_V = 0.06;
  const sp = (t, off) => {
    const a = t * Math.PI * 1.78, r = R0 + GROW * t + (off || 0);
    return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
  };
  // улитка — лента между двумя спиралями: колесо внутри остаётся видимым
  const band = [];
  for (let i = 0; i <= TURNS; i++) band.push(sp(i / TURNS, 0));
  for (let i = TURNS; i >= 0; i--) band.push(sp(i / TURNS, -WALL_V));
  const caseGeo = new THREE.ExtrudeGeometry(new THREE.Shape(band),
    {depth: SEC_W*0.34, bevelEnabled:false, curveSegments:1});
  caseGeo.translate(0, 0, -SEC_W*0.17);
  const volute = new THREE.Mesh(caseGeo, M.steel);
  volute.rotation.y = Math.PI/2;
  g.add(volute);

  // рабочее колесо — синее, вращается
  const wheel = bladedWheel(R0*0.82, 0.045, 12, M);
  wheel.rotation.y = Math.PI/2;
  g.add(wheel);
  g.userData.spin = wheel; g.userData.spinAxis = 'x'; g.userData.spinFast = true;

  // мотор с рёбрами охлаждения — у дальнего борта, чтобы не закрывать колесо
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(SEC_H*.15, SEC_H*.15, 0.36, 16), M.dark);
  motor.rotation.z = Math.PI/2;
  motor.position.set(-SEC_W*0.26, -SEC_H*0.24, -len*0.18);
  g.add(motor);
  const fins = new THREE.InstancedMesh(new THREE.TorusGeometry(SEC_H*.155, 0.01, 6, 16), M.steelD, 8);
  const d = new THREE.Object3D();
  for (let i = 0; i < 8; i++) {
    d.position.set(-SEC_W*0.26 - 0.15 + i * 0.043, -SEC_H*0.24, -len*0.18);
    d.rotation.set(0, Math.PI/2, 0);
    d.updateMatrix(); fins.setMatrixAt(i, d.matrix);
  }
  fins.instanceMatrix.needsUpdate = true; g.add(fins);

  // щит автоматики на крыше — навесная деталь, ломающая силуэт ящика
  const cab = box(0.46, 0.34, 0.4, M.frame);
  cab.position.set(SEC_W*0.16, SEC_H/2 + 0.17, 0); g.add(cab);
  const cabDoor = box(0.38, 0.26, 0.012, M.dark);
  cabDoor.position.set(SEC_W*0.16, SEC_H/2 + 0.17, 0.206); g.add(cabDoor);
  return g;
}

// ── Калорифер: трубы поперёк потока + пакет рёбер + патрубки на крыше ───────
function buildHeat(len, M, o) {
  const g = buildShell(len, M, o);
  const d = new THREE.Object3D();

  const rows = 4, cols = 4, n = rows * cols;
  const tubes = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.034, 0.034, SEC_W*0.82, 8), M.blue2, n);
  for (let i = 0; i < n; i++) {
    const r = (i / cols) | 0, c = i % cols;
    d.position.set(0, -SEC_H*0.26 + r * (SEC_H*0.52/(rows-1)), -len*0.16 + c * (len*0.32/(cols-1)));
    d.rotation.set(0, 0, Math.PI/2);
    d.updateMatrix(); tubes.setMatrixAt(i, d.matrix);
  }
  tubes.instanceMatrix.needsUpdate = true; g.add(tubes);

  const fn = 14;
  const fins = new THREE.InstancedMesh(
    new THREE.BoxGeometry(SEC_W*0.62, SEC_H*0.66, 0.01), M.steel, fn);
  for (let i = 0; i < fn; i++) {
    d.position.set(0, 0, -len*0.20 + i * (len*0.40/(fn-1)));
    d.rotation.set(0, 0, 0);
    d.updateMatrix(); fins.setMatrixAt(i, d.matrix);
  }
  fins.instanceMatrix.needsUpdate = true; g.add(fins);

  // подводка теплоносителя: коллекторы внутри секции и патрубки над крышей —
  // по ним секция опознаётся и снаружи, и через проём дверцы
  const pipes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 10), M.blue, 4);
  [-0.3, 0.3].forEach((x, i) => {
    d.rotation.set(0, 0, 0);
    d.position.set(x, SEC_H/2 + 0.17, 0);  d.scale.set(1, 0.34, 1);
    d.updateMatrix(); pipes.setMatrixAt(i, d.matrix);
    d.position.set(x, 0, -len*0.3);        d.scale.set(1, SEC_H*0.6, 1);
    d.updateMatrix(); pipes.setMatrixAt(i + 2, d.matrix);
  });
  pipes.instanceMatrix.needsUpdate = true; g.add(pipes);
  const flangePlate = box(0.78, 0.03, 0.24, M.frame);
  flangePlate.position.set(0, SEC_H/2 + 0.02, 0); g.add(flangePlate);
  return g;
}

const BUILDERS = {intake:buildEnds, filter:buildFilter, recup:buildRecup,
                  fan:buildFan, heat:buildHeat, outlet:buildEnds};

export function mountAHU(host, opts = {}) {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true, powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 60);

  // свет держим приглушённым: пересвеченная сталь съедает разницу тонов между
  // светлой и тёмной панелью, а на ней и стоит вся читаемость секций
  scene.add(new THREE.HemisphereLight(0xffffff, 0x30333a, 1.05));
  const key = new THREE.DirectionalLight(0xffffff, 1.3); key.position.set(4, 6, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fb6dd, .7); rim.position.set(-5, 2, -4); scene.add(rim);
  // подсветка почти по оси взгляда: тени не считаются, поэтому этот свет
  // проходит «сквозь» борт и достаётся узлам за проёмом дверцы. Тёмная
  // внутренняя обшивка при этом остаётся тёмной — она повёрнута от источника,
  // и узел читается светлым силуэтом на её фоне
  const fill = new THREE.DirectionalLight(0xffffff, 1.05); fill.position.set(5, -1.2, 2.6); scene.add(fill);

  const rig = new THREE.Group();
  scene.add(rig);

  const M = materials();
  const totalLen = SECTIONS.reduce((s, d) => s + d.len, 0) + GAP_REST * (SECTIONS.length - 1);
  let z = -totalLen / 2;
  const groups = SECTIONS.map((def, i) => {
    const grp = BUILDERS[def.key](def.len, M, {panel: i % 2 ? M.panelB : M.steel, face: def.face});
    const restZ = z + def.len / 2;
    z += def.len + GAP_REST;
    grp.position.z = restZ;
    grp.userData.restZ = restZ;
    grp.userData.def = def;
    rig.add(grp);
    return grp;
  });

  // цель разъезда: секции раздвигаются от центра пропорционально порядковому номеру
  const mid = (groups.length - 1) / 2;
  groups.forEach((g, i) => { g.userData.explodeZ = g.userData.restZ + (i - mid) * 0.62; });

  // ── Кадрирование ──────────────────────────────────────────────────────────
  // Прежняя посадка по описанной сфере для длинного тонкого агрегата даёт
  // огромный запас: модель занимала меньше половины кадра, и секции на ней было
  // просто не разглядеть. Считаем честно — проецируем углы габарита на камеру
  // и подгоняем дистанцию под фактическое соотношение сторон.
  // Проёмы дверец — на бортах (±X): держим камеру сбоку от оси Z, иначе видно
  // только торцы, а не внутренности секций.
  const dir = new THREE.Vector3(0.88, 0.30, 0.46).normalize();
  const YAXIS = new THREE.Vector3(0, 1, 0);
  const YAWS = [-0.17, 0, 0.17];           // размах автоповорота — кадр не должен ползти
  const HX = SEC_W / 2 + FLG_P + 0.06;      // борт + вылет фланца + ручка
  const Y0 = -SEC_H / 2 - 0.16, Y1 = SEC_H / 2 + 0.38; // цоколь снизу, щит/патрубки сверху
  const halfLen = st => Math.max(...groups.map(g =>
    Math.abs(g.userData[st]) + g.userData.def.len / 2)) + 0.20; // +короб жалюзи

  function fitDistance(hz) {
    const corners = [];
    for (const x of [-HX, HX]) for (const y of [Y0, Y1]) for (const z of [-hz, hz])
      corners.push(new THREE.Vector3(x, y, z));
    const v = new THREE.Vector3();
    let d = hz * 3;
    for (let it = 0; it < 8; it++) {          // сходится за 3-4 шага, 8 — с запасом
      camera.position.copy(dir).multiplyScalar(d);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      let m = 0;
      for (const yaw of YAWS) for (const c of corners) {
        v.copy(c).applyAxisAngle(YAXIS, yaw).project(camera);
        m = Math.max(m, Math.abs(v.x), Math.abs(v.y));
      }
      d *= m / FIT;
    }
    return d;
  }

  // Собранный агрегат вдвое короче разобранного: подводим его ровно настолько,
  // чтобы он занял тот же кадр. Отношение дистанций и есть нужный масштаб.
  let dist = 0, scaleRest = 1;
  function fitCamera() {
    const dRest = fitDistance(halfLen('restZ'));
    dist = fitDistance(halfLen('explodeZ'));   // считаем последней — камера остаётся здесь
    scaleRest = dist / dRest;
    camera.position.copy(dir).multiplyScalar(dist);
    camera.lookAt(0, 0, 0);
  }

  let explode = 0, explodeTarget = 0;      // 0 = собрано, 1 = разобрано
  let dragging = false, lastX = 0, yaw = 0, autoSpin = !reduceMotion;
  let running = true;

  host.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; autoSpin = false; });
  addEventListener('pointerup', () => dragging = false);
  addEventListener('pointermove', e => {
    if (!dragging) return;
    yaw += (e.clientX - lastX) * 0.006;
    lastX = e.clientX;
  });

  function resize() {
    const w = host.clientWidth, h = host.clientHeight || w * .62;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fitCamera();               // посадка зависит от соотношения сторон — пересчитываем
  }
  new ResizeObserver(resize).observe(host);
  resize();

  const io = new IntersectionObserver(es => { running = es[0].isIntersecting; }, {threshold:.05});
  io.observe(host);

  function frame() {
    requestAnimationFrame(frame);
    if (!running) return;
    explode += (explodeTarget - explode) * 0.09;
    groups.forEach(g => {
      g.position.z = g.userData.restZ + (g.userData.explodeZ - g.userData.restZ) * explode;
      if (g.userData.spin && !reduceMotion) {
        g.userData.spin.rotation.x += g.userData.spinFast ? 0.11 : 0.018;
      }
    });
    // собранная установка вдвое короче разобранной: подводим её ближе, иначе
    // на кадре остаётся мелкий брусок в пустом поле
    rig.scale.setScalar(scaleRest + (1 - scaleRest) * explode);
    // автоповорот качает модель в пределах ±25°, а не крутит её кругом: борт с
    // проёмами дверец всё время остаётся к зрителю
    if (autoSpin) yaw = Math.sin(performance.now() * 0.00016) * 0.17;
    rig.rotation.y += (yaw - rig.rotation.y) * 0.12;
    renderer.render(scene, camera);
    opts.onFrame && opts.onFrame({groups, explode});
  }
  frame();

  return {
    toggle() { explodeTarget = explodeTarget > .5 ? 0 : 1; return explodeTarget > .5; },
    setExploded(v) { explodeTarget = v ? 1 : 0; },
    groups, camera, renderer,
    destroy() { io.disconnect(); renderer.dispose(); host.removeChild(renderer.domElement); },
  };
}
