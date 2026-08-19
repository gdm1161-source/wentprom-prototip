// ── Приточно-вытяжная установка: процедурная 3D-модель, разбираемая на узлы ──
// Мир «Чертёж»: сталь без блеска, синий #1B4C86 на роторных частях, оранжевый
// #D9540B только на индикаторе действия. Собственная геометрия — не CAD-файл
// завода (его нет), поэтому силуэт и пропорции секций схематичны и честны.
import * as THREE from 'three';

const STEEL      = 0xC7CDD2;
const STEEL_DARK = 0x8E9AA0;
const FRAME      = 0x3B434B;
const BLUE       = 0x1B4C86;
const BLUE_2     = 0x2C6BB4;

const SEC_W = 1.9, SEC_H = 1.7; // ширина/высота корпуса — общие для всех секций
const GAP_REST = 0.03;          // зазор между секциями в собранном виде

// Длины секций вдоль оси потока (Z), порядок = порядок воздуха по установке
const SECTIONS = [
  {key:'intake',  len:0.62, label:'Забор воздуха',      note:'жалюзи + заслонка'},
  {key:'filter',  len:0.50, label:'Фильтрация',         note:'кассета G4'},
  {key:'recup',   len:0.95, label:'Рекуперация',        note:'роторный теплообменник'},
  {key:'fan',     len:0.95, label:'Вентилятор',         note:'радиальное колесо + мотор'},
  {key:'heat',    len:0.62, label:'Нагрев / охлаждение',note:'оребрённый калорифер'},
  {key:'outlet',  len:0.55, label:'Выброс',             note:'жалюзи'},
];

function materials() {
  return {
    steel : new THREE.MeshStandardMaterial({color:STEEL,      metalness:.55, roughness:.5}),
    steelD: new THREE.MeshStandardMaterial({color:STEEL_DARK,  metalness:.5,  roughness:.6}),
    frame : new THREE.MeshStandardMaterial({color:FRAME,       metalness:.4,  roughness:.65}),
    blue  : new THREE.MeshStandardMaterial({color:BLUE,        metalness:.7,  roughness:.3}),
    blue2 : new THREE.MeshStandardMaterial({color:BLUE_2,      metalness:.7,  roughness:.32}),
    dark  : new THREE.MeshStandardMaterial({color:0x1C2126,    metalness:.3,  roughness:.7}),
  };
}

// Прямоугольный кожух секции из пяти отдельных панелей — передняя грань (+z)
// не строится, её место занимает смотровой проём, как открытая дверца
// агрегата на фотографиях.
function buildShellPanels(w, h, len, M) {
  const g = new THREE.Group();
  const t = 0.02;
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  add(new THREE.BoxGeometry(w, t, len), M.steel,  0,  h/2, 0);      // верх
  add(new THREE.BoxGeometry(w, t, len), M.steelD, 0, -h/2, 0);      // низ
  add(new THREE.BoxGeometry(t, h, len), M.steel, -w/2, 0, 0);       // левая стенка
  add(new THREE.BoxGeometry(t, h, len), M.steel,  w/2, 0, 0);       // правая стенка
  add(new THREE.BoxGeometry(w, h, t),   M.steelD, 0, 0, -len/2);    // задняя (по ходу воздуха)
  // передняя грань (+z) намеренно не строится — смотровой проём внутрь секции
  // рама-цоколь
  const railH = 0.14;
  add(new THREE.BoxGeometry(w * .92, railH, len), M.frame, 0, -h/2 - railH/2, 0);
  return g;
}

function wheelWithSpokes(r, thickness, spokes, M) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.TorusGeometry(r, thickness, 8, 40), M.blue));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r*.14, r*.14, thickness*1.6, 16), M.dark);
  hub.rotation.x = Math.PI/2; g.add(hub);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const sp = new THREE.Mesh(new THREE.BoxGeometry(r*1.86, thickness*.5, thickness*.5), M.blue2);
    sp.rotation.z = a; g.add(sp);
  }
  return g;
}

function buildIntake(len, M) {
  const g = buildShellPanels(SEC_W, SEC_H, len, M);
  // козырёк-жалюзи наклонные
  const blades = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(SEC_W*.86, 0.03, 0.22), M.steelD);
    b.position.set(0, -SEC_H*.32 + i*0.12, len/2 - 0.06);
    b.rotation.x = -0.5;
    blades.add(b);
  }
  g.add(blades);
  return g;
}
const buildOutlet = buildIntake;

function buildFilter(len, M) {
  const g = buildShellPanels(SEC_W, SEC_H, len, M);
  const cass = new THREE.Group();
  const n = 10;
  for (let i = 0; i < n; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(SEC_W*.82, SEC_H*.78, 0.012), M.dark);
    p.position.z = -len*.15 + (i/(n-1) - .5) * 0.24;
    p.rotation.y = 0.42;
    cass.add(p);
  }
  g.add(cass);
  return g;
}

function buildRecup(len, M) {
  const g = buildShellPanels(SEC_W, SEC_H, len, M);
  const wheel = wheelWithSpokes(SEC_H*.42, 0.05, 10, M);
  wheel.rotation.y = Math.PI/2;
  wheel.position.set(0, 0, 0);
  g.add(wheel);
  g.userData.spin = wheel; g.userData.spinAxis = 'x';
  // корпус-барабан вокруг колеса
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(SEC_H*.48, SEC_H*.48, len*.7, 24, 1, true),
    M.steelD);
  drum.rotation.z = Math.PI/2;
  drum.material = new THREE.MeshStandardMaterial({color:STEEL_DARK, metalness:.4, roughness:.6,
    side:THREE.BackSide});
  g.add(drum);
  return g;
}

function buildFan(len, M) {
  const g = buildShellPanels(SEC_W, SEC_H, len, M);
  // улитка — упрощённая спираль из вытянутых сегментов по нарастающему радиусу
  const volute = new THREE.Group();
  const R0 = SEC_H*.16, GROW = 0.16, TURNS = 300;
  const pts = [];
  for (let i = 0; i <= TURNS; i++) {
    const t = i / TURNS, ang = t * Math.PI * 1.7;
    const r = R0 + GROW * t;
    pts.push(new THREE.Vector2(Math.cos(ang) * r, Math.sin(ang) * r));
  }
  const shape = new THREE.Shape(pts);
  const caseGeo = new THREE.ExtrudeGeometry(shape, {depth: len*.55, bevelEnabled:false, curveSegments:48});
  caseGeo.center();
  const caseMesh = new THREE.Mesh(caseGeo, M.steel);
  caseMesh.rotation.x = -Math.PI/2;
  volute.add(caseMesh);
  g.add(volute);

  // рабочее колесо — синее, вращается
  const wheel = wheelWithSpokes(SEC_H*.3, 0.045, 12, M);
  wheel.rotation.y = Math.PI/2;
  wheel.position.z = len*.02;
  g.add(wheel);
  g.userData.spin = wheel; g.userData.spinAxis = 'x'; g.userData.spinFast = true;

  // мотор
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(SEC_H*.16, SEC_H*.16, len*.42, 20), M.dark);
  motor.rotation.z = Math.PI/2;
  motor.position.set(SEC_W*.28, SEC_H*.08, -len*.12);
  g.add(motor);
  for (let i = 0; i < 10; i++) { // рёбра охлаждения мотора
    const fin = new THREE.Mesh(new THREE.TorusGeometry(SEC_H*.165, 0.008, 6, 20), M.steelD);
    fin.rotation.y = Math.PI/2;
    fin.position.set(SEC_W*.28, SEC_H*.08, -len*.12 - len*.18 + i*(len*.36/9));
    g.add(fin);
  }
  return g;
}

function buildHeat(len, M) {
  const g = buildShellPanels(SEC_W, SEC_H, len, M);
  const coil = new THREE.Group();
  const rows = 5, cols = 4;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, SEC_H*.72, 10), M.blue2);
      tube.rotation.x = Math.PI/2;
      tube.position.set(-SEC_W*.3 + c*(SEC_W*.6/(cols-1)), 0, -len*.2 + r*(len*.4/(rows-1)));
      coil.add(tube);
    }
  }
  for (let i = 0; i < 14; i++) { // рёбра
    const fin = new THREE.Mesh(new THREE.BoxGeometry(SEC_W*.7, SEC_H*.82, 0.01), M.steelD);
    fin.position.z = -len*.24 + i*(len*.48/13);
    coil.add(fin);
  }
  g.add(coil);
  return g;
}

const BUILDERS = {intake:buildIntake, filter:buildFilter, recup:buildRecup,
                  fan:buildFan, heat:buildHeat, outlet:buildOutlet};

export function mountAHU(host, opts = {}) {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true, powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 60);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x30333a, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(4, 6, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fb6dd, .9); rim.position.set(-5, 2, -4); scene.add(rim);

  const rig = new THREE.Group();
  scene.add(rig);

  const M = materials();
  const totalLen = SECTIONS.reduce((s, d) => s + d.len, 0) + GAP_REST * (SECTIONS.length - 1);
  let z = -totalLen / 2;
  const groups = SECTIONS.map(def => {
    const grp = BUILDERS[def.key](def.len, M);
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

  // Кадрируем по разобранному состоянию — оно длиннее собранного, а не наоборот
  const halfLenExploded = Math.max(...groups.map(g => Math.abs(g.userData.explodeZ) + g.userData.def.len / 2));
  const boundRadius = Math.sqrt(halfLenExploded**2 + (SEC_W/2)**2 + (SEC_H/2)**2);
  const dist = boundRadius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.28;
  // Смотровой проём у каждой секции — на +Z: держим камеру ближе к оси Z,
  // иначе видно только закрытые борта короба, а не внутренности секций
  const dir = new THREE.Vector3(0.26, 0.30, 0.92).normalize();
  camera.position.copy(dir.multiplyScalar(dist));
  camera.lookAt(0, 0, 0);

  let explode = 0, explodeTarget = 0;      // 0 = собрано, 1 = разобрано
  let dragging = false, lastX = 0, yaw = 0.32, autoSpin = !reduceMotion;
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
    if (autoSpin) yaw += 0.0022;
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
