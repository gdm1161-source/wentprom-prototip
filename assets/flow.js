/* ВЕНТПРОМ · assets/flow.js
   ═══════════════════════════════════════════════════════════════════════════
   Визуализация движения воздуха в воздуховоде. 2D-канвас, ванильный ES-модуль,
   ноль зависимостей, ни одного собственного цвета — палитра читается из
   CSS-переменных документа.

   ЧЕСТНО О МОДЕЛИ.
   Это НЕ численное моделирование и не CFD. Поле скорости строится из
   одномерного инженерного расчёта и подписано на холсте:
     • профиль по сечению — степенной закон турбулентного течения
       u(r) = u_max·(1 − r/R)^(1/n), n = f(Re) ≈ 7 при развитом режиме,
       u_max/u_ср = (n+1)(2n+1)/(2n²) ≈ 1,22 при n = 7;
     • сохранение расхода при изменении сечения: u₂ = u₁·F₁/F₂;
     • внезапное расширение — Борда — Карно: Δp = ρ(u₁ − u₂)²/2;
     • местные сопротивления — табличные ζ (Идельчик), трение — Дарси —
       Вейсбах с λ по Альтшулю.
   Двумерное поле получается из этого одномерного профиля через функцию тока
   ψ, поэтому расход сохраняется точно, а линии тока замкнуты на стенках.
   Разрез трактуется как «плоский эквивалент с сохранением площади»: местная
   ширина в третьем измерении w = F/H. Вторичные (трёхмерные) вихри — парный
   вихрь Дина в отводе, закрутка за заслонкой — в разрезе не видны.

   ПОДКЛЮЧЕНИЕ:
     import { mountFlow, ELEMENTS, stateOf, elementLoss } from './assets/flow.js';
     const flow = mountFlow(canvas, { L:6000, D:500, element:'bend' });
     flow.set({ element:'expansion' });   flow.destroy();
   ═══════════════════════════════════════════════════════════════════════════ */

/* ═══ 0. Утилиты ═══════════════════════════════════════════════════════════ */

const clamp  = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp   = (a, b, t) => a + (b - a) * t;
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
/** Оконная функция 0 → 1 → 0 на отрезке [x0,x1]: окно зоны отрыва. */
const bump   = (x, x0, x1) => (x <= x0 || x >= x1 ? 0 : Math.sin(Math.PI * (x - x0) / (x1 - x0)));
const nf = (v, d = 1) => Number.isFinite(v)
  ? Number(v).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d })
  : '—';

/** Линейная интерполяция по таблице [[x,y],…] с плато на краях. */
function tab(t, x){
  if(x <= t[0][0]) return t[0][1];
  const last = t.length - 1;
  if(x >= t[last][0]) return t[last][1];
  for(let i = 0; i < last; i++){
    if(x <= t[i + 1][0]){
      const k = (x - t[i][0]) / (t[i + 1][0] - t[i][0]);
      return lerp(t[i][1], t[i + 1][1], k);
    }
  }
  return t[last][1];
}
/** То же, но интерполяция логарифмическая по y — для ζ заслонки (рост на 3 порядка). */
function tabLog(t, x){
  if(x <= t[0][0]) return t[0][1];
  const last = t.length - 1;
  if(x >= t[last][0]) return t[last][1];
  for(let i = 0; i < last; i++){
    if(x <= t[i + 1][0]){
      const k = (x - t[i][0]) / (t[i + 1][0] - t[i][0]);
      return Math.exp(lerp(Math.log(t[i][1]), Math.log(t[i + 1][1]), k));
    }
  }
  return t[last][1];
}

/* ═══ 1. Среда ═════════════════════════════════════════════════════════════ */

export const AIR = {
  rho : 1.2,        // кг/м³ — плотность воздуха при 20 °C и 101,3 кПа
  nu  : 15.06e-6,   // м²/с  — кинематическая вязкость там же
  kAbs: 0.15e-3     // м     — эквивалентная шероховатость оцинкованного воздуховода
};

/* Табличные коэффициенты. Источник — справочник Идельчика, ходовые значения. */
const N_TAB    = [[4e3, 6], [2.3e4, 6.6], [1.1e5, 7], [1.1e6, 8.8], [3.2e6, 10]];
const BEND_Z   = [[0.5, 1.18], [0.75, 0.44], [1, 0.21], [1.25, 0.18],
                  [1.5, 0.16], [2, 0.14], [3, 0.13]];          // гладкий отвод 90°, круглый
const CONF_K   = [[10, 0.05], [20, 0.06], [30, 0.08], [45, 0.12],
                  [60, 0.18], [90, 0.30]];                     // конический конфузор, по углу
const DAMPER_Z = [[0, 0.20], [10, 0.52], [20, 1.54], [30, 3.91], [40, 10.8],
                  [45, 18.7], [50, 32.6], [60, 118], [70, 751]]; // круглая заслонка, по углу

/* ═══ 2. Одномерная физика. Чистые функции — их зовёт и страница ══════════ */

/** Геометрия сечения. D, a, b — в мм. */
export function sectionOf(o = {}){
  if(o.shape === 'rect'){
    const a = Math.max(0.05, (o.a || 600) / 1000);   // ширина, м
    const b = Math.max(0.05, (o.b || 400) / 1000);   // высота, м (её и рисуем)
    return { round: false, F: a * b, Dh: 2 * a * b / (a + b), H: b, depth: a,
             label: `${Math.round(a * 1000)}×${Math.round(b * 1000)} мм` };
  }
  const D = Math.max(0.05, (o.D || 500) / 1000);
  /* Эквивалентная ширина w = F/H: плоский эквивалент круглого сечения. */
  return { round: true, F: Math.PI * D * D / 4, Dh: D, H: D, depth: Math.PI * D / 4,
           label: `Ø ${Math.round(D * 1000)} мм` };
}

/** Показатель степенного закона: n растёт с числом Рейнольдса. */
export function nOf(Re){
  if(Re <= 0) return 7;
  const x = Math.log10(Math.max(1, Re));
  const t = N_TAB.map(([r, n]) => [Math.log10(r), n]);
  return tab(t, x);
}
/**
 * u_max/u_ср для степенного профиля.
 * Круглое сечение — осесимметричное осреднение по площади:
 *   u_ср = (2/R²)∫u·r dr → u_max/u_ср = (n+1)(2n+1)/(2n²). При n = 7 это 1,224.
 * Прямоугольное — профиль работает по обеим сторонам: ((n+1)/n)².
 */
export const coreRatio = (n, round = true) =>
  round ? (n + 1) * (2 * n + 1) / (2 * n * n) : Math.pow((n + 1) / n, 2);

/**
 * Показатель для ПЛОСКОГО эквивалента разреза.
 * Картинка — плоский срез, а его среднее по высоте равно n/(n+1) от u_max,
 * то есть отношение вышло бы 1,14 вместо 1,22. Чтобы эпюра на экране давала
 * то же u_max/u_ср, что и осесимметричный расчёт, подбираем n так, чтобы
 * (nп+1)/nп = u_max/u_ср.
 */
export const planeN = kMax => clamp(1 / Math.max(0.02, kMax - 1), 1.5, 40);

/** Коэффициент трения. Ламинарный — 64/Re, турбулентный — формула Альтшуля. */
export function lambdaOf(Re, Dh){
  if(Re < 2300) return Re > 1 ? 64 / Re : 0.05;
  return 0.11 * Math.pow(AIR.kAbs / Dh + 68 / Re, 0.25);
}

/** Динамическое давление ρu²/2, Па. */
export const pDyn = u => AIR.rho * u * u / 2;

/** Базовое состояние потока: скорость, Re, n, λ. L — м³/ч. */
export function stateOf({ L = 6000, section } = {}){
  const sec = section || sectionOf({});
  const Q   = Math.max(0, L) / 3600;                 // м³/с
  const u0  = sec.F > 0 ? Q / sec.F : 0;             // средняя скорость в сечении
  const Re  = u0 * sec.Dh / AIR.nu;
  const n    = nOf(Re);
  const kMax = coreRatio(n, sec.round);
  return { L, Q, sec, u0, Re, n, kMax, np: planeN(kMax),
           lambda: lambdaOf(Re, sec.Dh), pd: pDyn(u0) };
}

/* Каталог элементов трассы. Страница строит по нему переключатель и ползунок. */
export const ELEMENTS = [
  { key:'straight', name:'Прямой участок', tag:'профиль и пристенная зона',
    param:{ key:'len', label:'Длина участка', unit:'калибров', min:3, max:14, step:0.5, def:7, dec:1 } },
  { key:'bend', name:'Отвод 90°', tag:'снос ядра, вихрь у внутренней стенки',
    param:{ key:'rd', label:'Радиус отвода R/D', unit:'', min:0.5, max:3, step:0.25, def:1.5, dec:2 } },
  { key:'expansion', name:'Внезапное расширение', tag:'отрыв, Борда — Карно',
    param:{ key:'ratio', label:'Расширение D₂/D₁', unit:'', min:1.2, max:3, step:0.1, def:1.8, dec:1 } },
  { key:'confuser', name:'Конфузор', tag:'выравнивание и разгон',
    param:{ key:'angle', label:'Угол конуса α', unit:'°', min:10, max:90, step:5, def:30, dec:0 } },
  { key:'tee', name:'Тройник на ответвление', tag:'деление расхода',
    param:{ key:'split', label:'Доля в ответвление', unit:'от Q', min:0.1, max:0.7, step:0.05, def:0.35, dec:2 } },
  { key:'damper', name:'Дроссель-клапан', tag:'сжатие струи, срыв за заслонкой',
    param:{ key:'theta', label:'Угол заслонки θ', unit:'°', min:0, max:70, step:5, def:40, dec:0 } },
  { key:'grille', name:'Решётка на выходе', tag:'живое сечение и затопленная струя',
    param:{ key:'free', label:'Живое сечение f', unit:'', min:0.3, max:0.9, step:0.05, def:0.6, dec:2 } },
  { key:'fanInlet', name:'Вход в вентилятор', tag:'неравномерность перед колесом',
    param:{ key:'straightD', label:'Прямой участок перед колесом', unit:'калибров',
            min:0, max:3, step:0.25, def:0, dec:2 } }
];

export const elementByKey = k => ELEMENTS.find(e => e.key === k) || ELEMENTS[0];

/** Фиксированные пропорции элементов, общие для расчёта и для картинки. */
const GEO = { confOut: 0.6, teeBranch: 0.6, fanThroat: 0.84, jetSpread: 0.44 };

/**
 * Потеря давления на элементе.
 * Возвращает ζ, Δp (Па), к какой скорости отнесено, формулу и разбор слагаемых.
 * Ни одно число не выдумано «для красоты»: либо формула, либо таблица, либо
 * явно помеченная оценка.
 */
export function elementLoss(key, p, st){
  const { sec, u0, lambda, Q } = st;
  const q0 = pDyn(u0);
  const F1 = sec.F;
  const areaK = m => (sec.round ? m * m : m);        // во сколько раз растёт F при H×m

  switch(key){

    case 'straight': {
      /* Дарси — Вейсбах: Δp = λ·(l/dэ)·ρu²/2. */
      const l = p.len * sec.H;
      const zeta = lambda * l / sec.Dh;
      return { zeta, dp: zeta * q0, ref: 'u в воздуховоде',
        formula: 'Δp = λ·(l/dэ)·ρu²/2',
        note: `λ = ${nf(lambda, 4)} по Альтшулю, l = ${nf(l, 2)} м, dэ = ${nf(sec.Dh, 3)} м`,
        parts: [['λ', nf(lambda, 4)], ['l/dэ', nf(l / sec.Dh, 1)]] };
    }

    case 'bend': {
      /* ζ по таблице для гладкого отвода 90° плюс трение по дуге l/d = (π/2)(R/D). */
      const zb = tab(BEND_Z, p.rd);
      const zf = lambda * (Math.PI / 2) * p.rd;
      const zeta = zb + zf;
      return { zeta, dp: zeta * q0, ref: 'u в воздуховоде',
        formula: 'ζ = ζотв(R/D) + λ·(π/2)·(R/D)',
        note: 'ζотв — табличное значение для гладкого отвода 90°',
        parts: [['ζ отвода', nf(zb, 2)], ['трение по дуге', nf(zf, 3)]] };
    }

    case 'expansion': {
      /* Борда — Карно: потеря равна скоростному напору потерянной скорости. */
      const F2 = F1 * areaK(p.ratio);
      const u2 = Q / F2;
      const dp = AIR.rho * Math.pow(u0 - u2, 2) / 2;
      const zeta = Math.pow(1 - F1 / F2, 2);
      return { zeta, dp, ref: 'u до расширения', u2,
        formula: 'Δp = ρ(u₁ − u₂)²/2 · ζ = (1 − F₁/F₂)²',
        note: `F₁/F₂ = ${nf(F1 / F2, 2)}, u₂ = ${nf(u2, 2)} м/с`,
        parts: [['u₁', nf(u0, 2) + ' м/с'], ['u₂', nf(u2, 2) + ' м/с']] };
    }

    case 'confuser': {
      /* Конфузор почти не даёт отрыва: ζ мал и отнесён к скорости за сужением. */
      const F2 = F1 * areaK(GEO.confOut);
      const u2 = Q / F2;
      const k = tab(CONF_K, p.angle);
      const zeta = k * (1 - F2 / F1);
      const dp = zeta * pDyn(u2);
      return { zeta, dp, ref: 'u за конфузором', u2,
        formula: 'ζ = k(α)·(1 − F₂/F₁), Δp = ζ·ρu₂²/2',
        note: `k(${nf(p.angle, 0)}°) = ${nf(k, 2)} — таблица; u₂ = ${nf(u2, 2)} м/с`,
        parts: [['k(α)', nf(k, 2)], ['u₂', nf(u2, 2) + ' м/с']] };
    }

    case 'tee': {
      /* Деление расхода. Сечения обоих участков не меняются, меняются скорости. */
      const Fb = F1 * areaK(GEO.teeBranch);
      const ub = Q * p.split / Fb;
      const up = u0 * (1 - p.split);
      const zBranch = 1 + 0.3 * Math.pow(ub / Math.max(0.01, u0), 2);   // к скорости ответвления
      const zPass   = 0.4 * Math.pow(p.split, 2);                        // к скорости в сети
      const dpB = zBranch * pDyn(ub);
      const dpP = zPass * q0;
      return { zeta: zBranch, dp: dpB, ref: 'u в ответвлении', u2: ub, alt: { zeta: zPass, dp: dpP },
        formula: 'ζотв = 1 + 0,3·(uотв/uс)² · ζпрох = 0,4·(Qотв/Qс)²',
        note: 'аппроксимация табличных данных для тройника на 90°; точный расчёт — ' +
              'по таблицам для конкретной геометрии врезки',
        parts: [['u ответвления', nf(ub, 2) + ' м/с'], ['u прохода', nf(up, 2) + ' м/с'],
                ['ζ прохода', nf(zPass, 3)], ['Δp прохода', nf(dpP, 1) + ' Па']] };
    }

    case 'damper': {
      /* Круглая поворотная заслонка: ζ растёт на три порядка от 0° до 70°. */
      const zeta = tabLog(DAMPER_Z, p.theta);
      return { zeta, dp: zeta * q0, ref: 'u в воздуховоде',
        formula: 'Δp = ζ(θ)·ρu²/2',
        note: 'ζ(θ) — таблица для круглой поворотной заслонки; шум растёт быстрее потерь',
        parts: [['θ', nf(p.theta, 0) + '°'], ['свободный зазор',
                nf(100 * Math.max(0.04, 1 - Math.sin(p.theta * Math.PI / 180)), 0) + ' %']] };
    }

    case 'grille': {
      /* Решётка на выбросе: потеря на сжатии в живом сечении плюс выходная энергия. */
      const zeta = 1.5 / (p.free * p.free);
      const uFree = u0 / p.free;
      return { zeta, dp: zeta * q0, ref: 'u в воздуховоде', u2: uFree,
        formula: 'ζ ≈ 1,5/f², f — живое сечение решётки',
        note: `скорость в живом сечении ${nf(uFree, 2)} м/с — по ней нормируется шум`,
        parts: [['f', nf(p.free, 2)], ['u в живом сечении', nf(uFree, 2) + ' м/с']] };
    }

    case 'fanInlet': {
      /* Отвод + прямой участок + всасывающий конфузор перед колесом.
         Надбавка на неравномерность (system effect) — ОЦЕНКА, не таблица:
         затухает по экспоненте с длиной прямого участка.                     */
      const zb   = tab(BEND_Z, 1.5);
      const zf   = lambda * (Math.PI / 2) * 1.5 + lambda * p.straightD;
      const zc   = 0.05;                                   // всасывающий конфузор
      const zse  = 0.85 * Math.exp(-p.straightD / 1.1);    // ОЦЕНКА неравномерности
      const zeta = zb + zf + zc + zse;
      return { zeta, dp: zeta * q0, ref: 'u в воздуховоде', zse,
        formula: 'ζ = ζотв + λ·l/d + ζконф + ζнеравн',
        note: 'ζнеравн = 0,85·e^(−l/1,1D) — ОЦЕНКА надбавки на неравномерность потока ' +
              'на входе в колесо, а не табличная величина',
        parts: [['ζ отвода', nf(zb, 2)], ['трение', nf(zf, 3)],
                ['конфузор', nf(zc, 2)], ['неравномерность (оценка)', nf(zse, 2)]] };
    }
  }
  return { zeta: 0, dp: 0, ref: 'u', formula: '—', note: '', parts: [] };
}

/* ═══ 3. Палитра из CSS-переменных документа ══════════════════════════════ */

function parseColor(str){
  if(!str) return null;
  const s = String(str).trim();
  let m = /^#([0-9a-f]{3,8})$/i.exec(s);
  if(m){
    const h = m[1];
    if(h.length === 3 || h.length === 4)
      return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16),
              h.length === 4 ? parseInt(h[3] + h[3], 16) / 255 : 1];
    if(h.length === 6 || h.length === 8)
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16),
              h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if(m){
    const v = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    if(v.length >= 3) return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1];
  }
  return null;
}

/** Читает токены документа. Своих цветов модуль не объявляет: запасной
    вариант — тоже цвет документа (цвет текста body). */
function readPalette(node){
  const cs   = getComputedStyle(node);
  const rs   = getComputedStyle(document.documentElement);
  const base = parseColor(cs.color) || parseColor(getComputedStyle(document.body).color) || [0, 0, 0, 1];
  const get  = name => parseColor((rs.getPropertyValue(name) || '').trim()) ||
                       parseColor((cs.getPropertyValue(name) || '').trim()) || base;
  const rgb  = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const P = {
    paper: get('--paper'), sheet: get('--sheet'), sheet2: get('--sheet-2'),
    rule: get('--rule'), ruleSoft: get('--rule-soft'), ruleHard: get('--rule-hard'),
    gridInk: get('--grid-ink'),
    ink: get('--ink'), ink2: get('--ink-2'), ink3: get('--ink-3'), ink4: get('--ink-4'),
    blue: get('--blue'), blueInk: get('--blue-ink'), blueLit: get('--blue-lit'),
    blueWash: get('--blue-wash'), blueEdge: get('--blue-edge'),
    sig: get('--sig'), sigInk: get('--sig-ink'), sigWash: get('--sig-wash'),
    fUi: (rs.getPropertyValue('--f-ui') || '').trim() || 'sans-serif',
    fNum: (rs.getPropertyValue('--f-num') || '').trim() || 'monospace',
    fPlate: (rs.getPropertyValue('--f-plate') || '').trim() || 'sans-serif'
  };
  /* Собственная прозрачность токена сохраняется: --grid-ink задан с альфой,
     и миллиметровка обязана остаться волосяной. */
  P.c = (k, a) => {
    const v = P[k] || base;
    const av = (v[3] == null ? 1 : v[3]) * (a == null ? 1 : a);
    return av >= 1 ? rgb(v)
      : `rgba(${v[0] | 0},${v[1] | 0},${v[2] | 0},${av.toFixed(3)})`;
  };
  return P;
}

/* ═══ 4. Трасса: осевая линия, сечение, метрика ═══════════════════════════ */

const NY   = 44;      // узлов поперёк сечения
const IDXN = 512;     // размер таблицы «длина дуги → номер узла»

function track(){ return { x: [], y: [], h: [] }; }

function pushLine(T, x0, y0, x1, y1, h0, h1, ds){
  const len = Math.hypot(x1 - x0, y1 - y0);
  const m   = Math.max(1, Math.round(len / Math.max(1e-6, ds)));
  for(let k = (T.x.length ? 1 : 0); k <= m; k++){
    const t = k / m;
    T.x.push(x0 + (x1 - x0) * t); T.y.push(y0 + (y1 - y0) * t); T.h.push(h0 + (h1 - h0) * t);
  }
}
function pushArc(T, cx, cy, r, a0, a1, h, ds){
  const m = Math.max(3, Math.round(Math.abs(a1 - a0) * r / Math.max(1e-6, ds)));
  for(let k = (T.x.length ? 1 : 0); k <= m; k++){
    const a = a0 + (a1 - a0) * (k / m);
    T.x.push(cx + r * Math.cos(a)); T.y.push(cy + r * Math.sin(a)); T.h.push(h);
  }
}

/** Достраивает касательные, нормали, длину дуги и таблицу поиска по s. */
function finish(T){
  const n = T.n = T.x.length;
  T.s = new Float64Array(n); T.tx = new Float64Array(n); T.ty = new Float64Array(n);
  for(let i = 1; i < n; i++)
    T.s[i] = T.s[i - 1] + Math.hypot(T.x[i] - T.x[i - 1], T.y[i] - T.y[i - 1]);
  for(let i = 0; i < n; i++){
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    const dx = T.x[b] - T.x[a], dy = T.y[b] - T.y[a];
    const L = Math.hypot(dx, dy) || 1;
    T.tx[i] = dx / L; T.ty[i] = dy / L;                 // нормаль: n = (ty, −tx)
  }
  T.len = T.s[n - 1] || 1e-6;
  T.idx = new Int32Array(IDXN);
  let j = 0;
  for(let k = 0; k < IDXN; k++){
    const s = T.len * k / (IDXN - 1);
    while(j < n - 2 && T.s[j + 1] < s) j++;
    T.idx[k] = j;
  }
  return T;
}

/** Дробный номер узла по длине дуги. */
function nodeAt(T, s){
  s = clamp(s, 0, T.len);
  let i = T.idx[clamp(Math.floor(s / T.len * (IDXN - 1)), 0, IDXN - 1)];
  while(i < T.n - 2 && T.s[i + 1] < s) i++;
  while(i > 0 && T.s[i] > s) i--;
  const d = T.s[i + 1] - T.s[i];
  return i + (d > 1e-9 ? (s - T.s[i]) / d : 0);
}

/** Точка разреза в мировых координатах: осевая + нормаль·(η − 0,5)·H. */
function wpt(T, si, eta, out){
  const i = clamp(Math.floor(si), 0, T.n - 1), f = clamp(si - i, 0, 1);
  const j = Math.min(T.n - 1, i + 1);
  const cx = lerp(T.x[i], T.x[j], f), cy = lerp(T.y[i], T.y[j], f);
  const tx = lerp(T.tx[i], T.tx[j], f), ty = lerp(T.ty[i], T.ty[j], f);
  const h  = lerp(T.h[i], T.h[j], f);
  const k  = (eta - 0.5) * h;
  out[0] = cx + ty * k; out[1] = cy - tx * k;
  out[2] = tx; out[3] = ty; out[4] = h;
  return out;
}

/* ═══ 5. Профили скорости ═════════════════════════════════════════════════ */

/**
 * Степенной закон турбулентного течения u/u_max = (1 − r/R)^(1/n).
 * e — смещение ядра: 0 — по оси, +1 — к стенке η = 1, −1 — к стенке η = 0.
 * У обеих стенок скорость обращается в ноль (условие прилипания).
 */
function powerProfile(eta, n, e = 0){
  const c = 0.5 + 0.5 * clamp(e, -0.92, 0.92);
  const q = eta >= c ? (eta - c) / Math.max(1e-6, 1 - c)
                     : (c - eta) / Math.max(1e-6, c);
  return Math.pow(Math.max(0, 1 - clamp(q, 0, 1)), 1 / Math.max(1.5, n));
}
/**
 * Отрыв у внутренней стенки отвода. Нарастает во второй половине дуги —
 * там, где поток уже не успевает за поворотом, — и затухает примерно за
 * полтора калибра после выхода из отвода. s0, s1 — начало и конец дуги.
 */
function sepAfterBend(s, s0, s1, len){
  if(s <= s0) return 0;
  const t = clamp((s - s0) / Math.max(1e-6, s1 - s0), 0, 1);
  return smooth((t - 0.45) / 0.45) * Math.exp(-Math.max(0, s - s1) / Math.max(1e-6, len));
}

/**
 * Окно пузыря отрыва у стенки, ширина w в долях сечения.
 * Внутри пузыря почти единица, на его границе резко спадает: у пузыря есть
 * граница — слой смешения, — а не плавный градиент до самой оси.
 */
const wallLow  = (eta, w) => 1 - smooth((eta - 0.55 * w) / (0.55 * w));
const wallHigh = (eta, w) => wallLow(1 - eta, w);

/* ═══ 6. Построение элементов трассы ══════════════════════════════════════ */

/**
 * Каждый элемент отдаёт список путей. Путь = осевая линия + высота сечения +
 * форм-функция профиля + доля расхода. Мировые координаты — метры.
 */
function buildElement(key, p, st){
  const D  = st.sec.H;             // высота сечения — единица длины картинки
  const n  = st.np;                // показатель плоского эквивалента (см. planeN)
  const ds = D / 15;               // шаг разбиения осевой
  const paths = [], annos = [];
  const push = (T, opts) => { paths.push(Object.assign({ T, qf: () => 1, dashed: false }, opts)); };

  switch(key){

    /* — 1. Прямой участок: развитый профиль по всей длине — */
    case 'straight': {
      const T = track(); pushLine(T, 0, 0, p.len * D, 0, D, D, ds); finish(T);
      push(T, { shape: (i, e) => powerProfile(e, n, 0) });
      annos.push({ t: 'dim', x1: 0, y1: -D * 0.72, x2: p.len * D, y2: -D * 0.72,
                   text: `l = ${nf(p.len, 1)} D` });
      annos.push({ t: 'note', x: p.len * D * 0.62, y: D * 0.42, dx: D * 0.5, dy: D * 0.85,
                   text: 'пристенная зона: u < 0,75·u_max' });
      break;
    }

    /* — 2. Отвод 90°: ядро сносит к внешней стенке, у внутренней — отрыв — */
    case 'bend': {
      const Rc = p.rd * D, xin = 2.6 * D, out = 3 * D;
      const T = track();
      pushLine(T, 0, 0, xin, 0, D, D, ds);
      pushArc(T, xin, Rc, Rc, -Math.PI / 2, 0, D, ds);
      pushLine(T, xin + Rc, Rc, xin + Rc, Rc + out, D, D, ds);
      finish(T);
      const s0 = xin, s1 = xin + Rc * Math.PI / 2;   // начало и конец дуги
      /* Пузырь отрыва у внутренней стенки (η = 0). Внутри пузыря прямого течения
         почти нет — он вытесняет поток, поэтому маска входит и в shape, и в back. */
      /* Чем круче отвод, тем длиннее пузырь: от ~0,6 D при R/D = 3 до ~2,1 D при R/D = 0,5. */
      const sepL = D * clamp(2.4 - 0.6 * p.rd, 0.6, 2.2);
      const sepW = (i, e) => sepAfterBend(T.s[i], s0, s1, sepL) * wallLow(e, 0.32);
      push(T, {
        shape: (i, e) => {
          const s = T.s[i];
          if(s <= s0) return powerProfile(e, n, 0);
          const t     = clamp((s - s0) / (s1 - s0), 0, 1);
          const decay = Math.exp(-Math.max(0, (s - s1) / D) / 5);  // выравнивание ~5 калибров
          /* На входе в дугу потенциальный вихрь (u ~ 1/r) ускоряет поток у внутренней
             стенки, к выходу вторичное течение сносит ядро к внешней (η = 1).      */
          const core = (-0.30 * bump(t, 0, 0.6) + 0.50 * smooth((t - 0.30) / 0.70)) * decay;
          return powerProfile(e, n, core) * (1 - 0.92 * sepW(i, e));
        },
        back: (i, e) => 0.26 * sepW(i, e)
      });
      annos.push({ t: 'note', x: xin + Rc * 0.28, y: Rc * 0.30, dx: -D * 1.2, dy: D * 1.1,
                   text: 'внутренняя стенка: разгон, затем отрыв' });
      annos.push({ t: 'note', x: xin + Rc * 0.95, y: Rc * 0.55, dx: D * 1.2, dy: -D * 0.4,
                   text: 'ядро потока у внешней стенки' });
      annos.push({ t: 'note', x: xin + Rc, y: Rc + out * 0.8, dx: D * 1.3, dy: 0,
                   text: 'парный вихрь Дина — трёхмерный, в разрезе не виден' });
      annos.push({ t: 'dim', x1: xin, y1: -D * 0.72, x2: xin + Rc, y2: -D * 0.72,
                   text: `R = ${nf(p.rd, 2)} D` });
      break;
    }

    /* — 3. Внезапное расширение: струя, отрыв, восстановление профиля — */
    case 'expansion': {
      const m = p.ratio, D2 = m * D, xs = 2.6 * D, xe = xs + 5 * D;
      const T = track();
      pushLine(T, 0, 0, xs, 0, D, D, ds);
      pushLine(T, xs, 0, xs + ds * 0.8, 0, D, D2, ds * 0.8);      // ступень
      pushLine(T, xs + ds * 0.8, 0, xe, 0, D2, D2, ds);
      finish(T);
      const hStep = (D2 - D) / 2;
      const Lr = 8 * hStep;                       // длина рециркуляции ≈ 8 высот ступени
      push(T, { shape: (i, e) => {
        const s = T.s[i];
        if(s <= xs) return powerProfile(e, n, 0);
        const xi = s - xs, H = T.h[i];
        /* Слой смешения растёт линейно: полуширина струи D/2 + 0,09·ξ. */
        const yj = Math.min(H / 2, D / 2 + 0.09 * xi);
        const ej = yj / H;
        const d  = Math.abs(e - 0.5);
        const u  = d <= ej ? Math.pow(Math.max(0, 1 - d / ej), 1 / (n * 1.6)) : 0;
        return lerp(u, powerProfile(e, n, 0), smooth((xi - 0.8 * Lr) / (1.7 * Lr)));
      },
      /* Угловые вихри между струёй и стенкой: живут примерно до x = Lr. */
      back: (i, e) => {
        const xi = T.s[i] - xs;
        if(xi <= 0) return 0;
        const H = T.h[i], ej = Math.min(0.5, (D / 2 + 0.09 * xi) / H);
        if(Math.abs(e - 0.5) <= ej) return 0;
        return 0.22 * smooth(xi / (0.4 * Lr)) * (1 - smooth((xi - 0.65 * Lr) / (0.6 * Lr)));
      } });
      annos.push({ t: 'note', x: xs + Lr * 0.45, y: -(D2 / 2 - hStep * 0.45),
                   dx: -D * 0.8, dy: -D * 0.9, text: `зона отрыва ≈ ${nf(Lr / D, 1)} D` });
      annos.push({ t: 'note', x: Math.min(xe - 0.5 * D, xs + Lr * 1.9), y: 0,
                   dx: D * 0.2, dy: D2 * 0.75, text: 'профиль восстановился' });
      annos.push({ t: 'dim', x1: xs, y1: -D2 / 2 - D * 1.15, x2: xe, y2: -D2 / 2 - D * 1.15,
                   text: 'потеря по Борда — Карно' });
      break;
    }

    /* — 4. Конфузор: разгон и выравнивание профиля, отрыва практически нет — */
    case 'confuser': {
      const c = GEO.confOut, D2 = c * D;
      const Lc = (D - D2) / 2 / Math.tan(p.angle * Math.PI / 360);
      const x0 = 2 * D, x1 = x0 + Lc, x2 = x1 + 3.6 * D;
      const T = track();
      pushLine(T, 0, 0, x0, 0, D, D, ds);
      pushLine(T, x0, 0, x1, 0, D, D2, Math.min(ds, Math.max(Lc / 6, ds * 0.35)));
      pushLine(T, x1, 0, x2, 0, D2, D2, ds);
      finish(T);
      push(T, { shape: (i, e) => {
        const s = T.s[i];
        /* Ускорение «поджимает» профиль: показатель n растёт, эпюра становится
           более наполненной; ниже по потоку профиль медленно возвращается.   */
        const grow  = smooth((s - x0) / Math.max(ds, Lc));
        const relax = Math.exp(-Math.max(0, s - x1) / (6 * D2));
        return powerProfile(e, n * (1 + 1.1 * grow * relax), 0);
      } });
      annos.push({ t: 'dim', x1: x0, y1: -D * 0.72, x2: x1, y2: -D * 0.72,
                   text: `α = ${nf(p.angle, 0)}°` });
      annos.push({ t: 'note', x: x1 + D * 0.6, y: 0, dx: D * 0.4, dy: D * 1.0,
                   text: 'профиль наполненный, отрыва нет' });
      break;
    }

    /* — 5. Тройник: деление расхода, отрыв на кромке врезки — */
    case 'tee': {
      const Lm = 7 * D, xj = 3.6 * D, Db = GEO.teeBranch * D, Lb = 3.2 * D;
      const M = track(); pushLine(M, 0, 0, Lm, 0, D, D, ds); finish(M);
      const B = track(); pushLine(B, xj, D / 2, xj, D / 2 + Lb, Db, Db, ds); finish(B);
      const sw = 0.35 * D;                          // ширина перехода расхода
      /* Отрыв на кромке врезки в магистрали и на верховой кромке ответвления. */
      const mSep = (i, e) => bump(M.s[i], xj, xj + 2.2 * D) * p.split * 2 * wallLow(e, 0.28);
      const bSep = (i, e) => Math.exp(-(B.s[i] / Db) / 1.8) * wallLow(e, 0.34);
      push(M, {
        qf: i => 1 - p.split * smooth((M.s[i] - xj + sw) / (2 * sw)),
        shape: (i, e) => {
          const s = M.s[i];
          const core = 0.18 * smooth((s - xj) / (2 * D)) * Math.exp(-Math.max(0, s - xj - 2 * D) / (5 * D));
          return powerProfile(e, n, core) * (1 - 0.92 * mSep(i, e));
        },
        back: (i, e) => 0.26 * mSep(i, e)
      });
      push(B, {
        qf: () => p.split,
        /* Поток входит в ответвление с поворотом на 90°: срыв на верховой кромке
           (η = 0), ядро прижато к низовой стенке (η = 1).                     */
        shape: (i, e) => powerProfile(e, n, 0.55 * Math.exp(-(B.s[i] / Db) / 2.5)) *
                         (1 - 0.92 * bSep(i, e)),
        back: (i, e) => 0.28 * bSep(i, e)
      });
      annos.push({ t: 'note', x: xj - Db * 0.5, y: D / 2 + Db * 0.7, dx: -D * 1.4, dy: D * 0.6,
                   text: 'срыв на кромке врезки' });
      annos.push({ t: 'note', x: Lm * 0.88, y: 0, dx: 0, dy: -D * 1.1,
                   text: `в проходе остаётся ${nf(100 * (1 - p.split), 0)} % расхода` });
      break;
    }

    /* — 6. Дроссель-клапан: две струи в зазорах, срыв за заслонкой — */
    case 'damper': {
      const Lm = 7 * D, xp = 3 * D, th = p.theta * Math.PI / 180;
      const g = Math.max(0.04, (1 - Math.sin(th)) / 2);   // относительный зазор с каждой стороны
      const T = track(); pushLine(T, 0, 0, Lm, 0, D, D, ds); finish(T);
      /* k — сила стеснения: нарастает на подходе, спадает по мере слияния струй. */
      const kOf = s => smooth((s - (xp - 0.9 * D)) / (0.9 * D)) * (1 - smooth((s - xp) / (4 * D)));
      push(T, {
        shape: (i, e) => {
          const k = kOf(T.s[i]), gg = lerp(0.5, g, k);
          const jl = e < gg     ? Math.pow(Math.max(0, 1 - Math.abs(2 * e / gg - 1)), 1 / n) : 0;
          const jh = e > 1 - gg ? Math.pow(Math.max(0, 1 - Math.abs(2 * (1 - e) / gg - 1)), 1 / n) : 0;
          /* Наклон заслонки делит расход между зазорами неравномерно: грубо 58/42. */
          return lerp(powerProfile(e, n, 0), 0.58 * jl + 0.42 * jh, k);
        },
        /* Срывной след за заслонкой — между струями. */
        back: (i, e) => {
          const s = T.s[i]; if(s < xp - 0.2 * D) return 0;
          const k = kOf(s), gg = lerp(0.5, g, k);
          if(e <= gg || e >= 1 - gg) return 0;
          return 0.26 * k * Math.sin(Math.PI * (e - gg) / Math.max(1e-3, 1 - 2 * gg));
        }
      });
      annos.push({ t: 'plate', x: xp, y: 0, len: D, ang: th });
      annos.push({ t: 'note', x: xp + D * 0.9, y: 0, dx: D * 0.3, dy: -D * 1.05,
                   text: 'срывной след: здесь рождается шум' });
      annos.push({ t: 'note', x: xp, y: -D * 0.5, dx: -D * 1.3, dy: -D * 0.7,
                   text: `θ = ${nf(p.theta, 0)}°` });
      break;
    }

    /* — 7. Решётка: сжатие в живом сечении и затопленная струя — */
    case 'grille': {
      const f = p.free, xg = 3.6 * D, x2 = xg + 0.14 * D;
      const T = track();
      pushLine(T, 0, 0, xg, 0, D, D, ds);
      pushLine(T, xg, 0, x2, 0, D, f * D, 0.14 * D);
      finish(T);
      const J = track();
      pushLine(J, x2, 0, x2 + 3.4 * D, 0, f * D, f * D + GEO.jetSpread * 3.4 * D, ds);
      finish(J);
      push(T, { shape: (i, e) => {
        const s = T.s[i];
        const grow = smooth((s - (xg - 0.5 * D)) / (0.7 * D));
        return powerProfile(e, n * (1 + 1.2 * grow), 0);
      } });
      push(J, { dashed: true, shape: (i, e) => {
        const xi = J.s[i] / D;
        return powerProfile(e, n * (1 + 1.2 * Math.exp(-xi / 1.5)), 0);
      } });
      annos.push({ t: 'grille', x: xg, y: 0, h: D, free: f });
      annos.push({ t: 'note', x: x2 + D * 1.6, y: 0, dx: 0, dy: -D * 1.5,
                   text: 'граница затопленной струи — не стенка' });
      break;
    }

    /* — 8. Вход в вентилятор: отвод, прямой участок, конфузор, колесо — */
    case 'fanInlet': {
      const Ls = p.straightD * D, R = 1.5 * D;
      const T = track();
      pushLine(T, 0, 0, 0, 2 * D, D, D, ds);
      pushArc(T, R, 2 * D, R, Math.PI, Math.PI / 2, D, ds);
      const yb = 2 * D + R;
      pushLine(T, R, yb, R + Ls, yb, D, D, ds);
      pushLine(T, R + Ls, yb, R + Ls + 0.7 * D, yb, D, GEO.fanThroat * D, ds * 0.7);
      pushLine(T, R + Ls + 0.7 * D, yb, R + Ls + 1.05 * D, yb,
               GEO.fanThroat * D, GEO.fanThroat * D, ds * 0.7);
      finish(T);
      const s0 = 2 * D, s1 = s0 + R * Math.PI / 2, sCone = s1 + Ls;
      /* Внутренняя стенка здесь η = 1 — поворот зеркален отводу из пункта 2. */
      const sepW = (i, e) => sepAfterBend(T.s[i], s0, s1, 1.5 * D) * wallHigh(e, 0.32);
      push(T, {
        shape: (i, e) => {
          const s = T.s[i];
          if(s <= s0) return powerProfile(e, n, 0);
          const t     = clamp((s - s0) / (s1 - s0), 0, 1);
          const decay = Math.exp(-Math.max(0, (s - s1) / D) / 4.5);
          const core = (0.30 * bump(t, 0, 0.6) - 0.50 * smooth((t - 0.30) / 0.70)) * decay;
          const flat = 1 + 1.0 * smooth((s - sCone) / (0.7 * D)); // конфузор наполняет эпюру
          return powerProfile(e, n * flat, core) * (1 - 0.92 * sepW(i, e));
        },
        back: (i, e) => 0.26 * sepW(i, e)
      });
      annos.push({ t: 'wheel', x: R + Ls + 1.05 * D, y: yb, h: GEO.fanThroat * D });
      annos.push({ t: 'dim', x1: R, y1: yb + D * 0.9, x2: R + Ls, y2: yb + D * 0.9,
                   text: Ls > 1e-6 ? `прямой участок ${nf(p.straightD, 2)} D` : 'прямого участка нет' });
      annos.push({ t: 'note', x: R + Ls + 0.9 * D, y: yb - D * 0.42, dx: D * 0.1, dy: -D * 1.1,
                   text: 'плоскость колеса' });
      break;
    }
  }
  return { paths, annos, D };
}

/* ═══ 7. Поле скорости из функции тока ════════════════════════════════════ */

/**
 * Для каждого сечения профиль нормируется так, чтобы расход равнялся Q(s).
 * Это и есть закон сохранения расхода u₂ = u₁·F₁/F₂ — он выполняется точно,
 * в том числе при наличии возвратного течения (учитывается чистый расход).
 * Функция тока ψ = ∫u·w dy; поперечная скорость v = −(1/w)·∂ψ/∂s.
 */
function buildField(path, Qtot, areaOf){
  const T = path.T, N = T.n;
  const U = new Float32Array(N * NY), V = new Float32Array(N * NY);
  const PSI = new Float64Array(N * NY);
  const F = new Float64Array(N), W = new Float64Array(N), dH = new Float64Array(N);
  const raw = new Float64Array(NY), bk = new Float64Array(NY), dEta = 1 / (NY - 1);
  let uAbsMax = 0;

  for(let i = 0; i < N; i++){
    const h = Math.max(1e-6, T.h[i]);
    F[i] = Math.max(1e-9, areaOf(h));
    W[i] = F[i] / h;
    const uMean = Qtot * path.qf(i) / F[i];
    /* Прямое течение: форм-функция неотрицательна, её среднее приводится к u_ср. */
    let acc = 0;
    for(let j = 0; j < NY; j++) raw[j] = Math.max(0, path.shape(i, j * dEta));
    for(let j = 0; j < NY - 1; j++) acc += (raw[j] + raw[j + 1]) * 0.5 * dEta;
    const sc = acc > 1e-9 ? uMean / acc : 0;
    /* Возвратное течение задаётся ОТДЕЛЬНО и в долях u_ср, поэтому не может
       съесть чистый расход и вызвать нефизичный всплеск скорости.
       Прямой поток при этом усиливается ровно настолько, чтобы расход сошёлся. */
    let bacc = 0, gain = 1;
    if(path.back){
      for(let j = 0; j < NY; j++) bk[j] = clamp(path.back(i, j * dEta), 0, 0.6) * uMean;
      for(let j = 0; j < NY - 1; j++) bacc += (bk[j] + bk[j + 1]) * 0.5 * dEta;
      gain = uMean > 1e-9 ? 1 + bacc / uMean : 1;
    }
    let psi = 0;
    for(let j = 0; j < NY; j++){
      const u = raw[j] * sc * gain - (path.back ? bk[j] : 0);
      U[i * NY + j] = u;
      if(j > 0) psi += (U[i * NY + j - 1] + u) * 0.5 * dEta * F[i];
      PSI[i * NY + j] = psi;
      const a = Math.abs(u); if(a > uAbsMax) uAbsMax = a;
    }
  }
  for(let i = 0; i < N; i++){
    const a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1);
    const dsl = (T.s[b] - T.s[a]) || 1e-6;
    dH[i] = (T.h[b] - T.h[a]) / dsl;
    for(let j = 0; j < NY; j++){
      const dPsi = (PSI[b * NY + j] - PSI[a * NY + j]) / dsl;
      const v = -dPsi / W[i] + U[i * NY + j] * (j * dEta - 0.5) * dH[i];
      V[i * NY + j] = clamp(v, -0.8 * uAbsMax, 0.8 * uAbsMax);   // гасим всплеск на ступени
    }
  }
  path.U = U; path.V = V; path.PSI = PSI; path.F = F; path.W = W; path.dH = dH;
  path.uAbsMax = uAbsMax; path.Q = Qtot;
  return path;
}

/** Билинейная выборка поля: si — дробный номер узла, eta ∈ [0,1]. */
function sample(path, si, eta, out){
  const T = path.T;
  const i = clamp(Math.floor(si), 0, T.n - 1), fi = clamp(si - i, 0, 1);
  const i2 = Math.min(T.n - 1, i + 1);
  const y = clamp(eta, 0, 1) * (NY - 1);
  const j = clamp(Math.floor(y), 0, NY - 1), fj = clamp(y - j, 0, 1);
  const j2 = Math.min(NY - 1, j + 1);
  const g = (A) => lerp(lerp(A[i * NY + j], A[i * NY + j2], fj),
                        lerp(A[i2 * NY + j], A[i2 * NY + j2], fj), fi);
  out[0] = g(path.U); out[1] = g(path.V);
  out[2] = lerp(T.h[i], T.h[i2], fi);
  out[3] = lerp(path.dH[i], path.dH[i2], fi);
  return out;
}

/** η, при котором функция тока равна заданному уровню (для линий тока и посева). */
function etaAtPsi(path, i, level){
  const base = i * NY;
  for(let j = 0; j < NY - 1; j++){
    const a = path.PSI[base + j], b = path.PSI[base + j + 1];
    if((level >= a && level <= b) || (level <= a && level >= b)){
      const d = b - a;
      return (j + (Math.abs(d) > 1e-12 ? (level - a) / d : 0)) / (NY - 1);
    }
  }
  return level > path.PSI[base + NY - 1] ? 1 : 0;
}

/* ═══ 8. Монтаж ═══════════════════════════════════════════════════════════ */

const DEF = {
  L: 6000, shape: 'round', D: 500, a: 600, b: 400,
  element: 'bend',
  params: { len: 7, rd: 1.5, ratio: 1.8, angle: 30, split: 0.35,
            theta: 40, free: 0.6, straightD: 0 },
  layers: { particles: true, streamlines: false, vectors: false, field: true, profile: true },
  density: 1, timeScale: 0.25, probe: 0.55,
  interactive: true, still: false, compact: false,
  inset: { top: 0, right: 0, bottom: 0, left: 0 },
  onRead: null, liveRegion: null, title: 'Поле скорости'
};

const STUB = { set(){}, pause(){}, resume(){}, destroy(){}, read: () => null };

/**
 * mountFlow(canvas, opts) → { set, pause, resume, destroy, read }
 * Модуль не падает на холсте нулевого размера: он просто ждёт первого ресайза.
 */
export function mountFlow(canvas, opts = {}){
  if(!canvas || typeof canvas.getContext !== 'function') return STUB;
  const ctx = canvas.getContext('2d');
  if(!ctx) return STUB;

  const bg = document.createElement('canvas');
  const bx = bg.getContext('2d');

  let o = mergeOpts(DEF, opts);
  let pal = readPalette(canvas);
  let W = 0, H = 0, dpr = 1;
  let model = null, view = null, readout = null;
  let parts = [], want = 0, live = 0;
  let raf = 0, running = false, paused = false, dead = false;
  let onScreen = true, pageVisible = !document.hidden;
  let needBuild = true, needStatic = true, queued = false;
  let prevT = 0, ema = 16, tick = 0;

  const reduce = matchMedia('(prefers-reduced-motion:reduce)');
  const still  = () => o.still || reduce.matches;

  /* — текстовая альтернатива — */
  let liveEl = o.liveRegion || null, ownLive = false;
  if(!liveEl){
    liveEl = document.createElement('p');
    liveEl.setAttribute('aria-live', 'polite');
    liveEl.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;' +
      'overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0';
    canvas.insertAdjacentElement('afterend', liveEl);
    ownLive = true;
  }
  canvas.setAttribute('role', 'img');
  if(o.interactive && !canvas.hasAttribute('tabindex')) canvas.setAttribute('tabindex', '0');

  function mergeOpts(base, add){
    const r = Object.assign({}, base, add);
    r.params = Object.assign({}, base.params, add.params);
    r.layers = Object.assign({}, base.layers, add.layers);
    r.inset  = Object.assign({}, base.inset,  add.inset);
    return r;
  }

  /* ── 8.1 Размер холста ── */
  function resize(){
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    const w = Math.max(0, Math.round(r.width)), h = Math.max(0, Math.round(r.height));
    if(w === W && h === H) return false;
    W = w; H = h;
    if(W < 2 || H < 2) return false;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    bg.width = canvas.width; bg.height = canvas.height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  /* ── 8.2 Сборка модели ── */
  function build(){
    if(W < 2 || H < 2) return;
    const sec = sectionOf(o);
    const st  = stateOf({ L: o.L, section: sec });
    const el  = elementByKey(o.element);
    const p   = Object.assign({}, o.params);
    const geo = buildElement(el.key, p, st);
    const areaOf = sec.round ? h => Math.PI * h * h / 4 : h => sec.depth * h;

    let uAbsMax = 0;
    geo.paths.forEach(path => { buildField(path, st.Q, areaOf); uAbsMax = Math.max(uAbsMax, path.uAbsMax); });
    /* Верх шкалы округляем до «круглого» значения, но не грубее четверти
       порядка — иначе картинка теряет контраст. */
    const step = Math.pow(10, Math.floor(Math.log10(Math.max(0.5, uAbsMax)))) / 4;
    const uScale = Math.max(step, Math.ceil(uAbsMax / step) * step) || 1;

    const loss = elementLoss(el.key, p, st);
    model = { sec, st, el, p, geo, uScale, loss, paths: geo.paths };
    fit();
    computeRead();
    needStatic = true;
    seed(true);
  }

  /* ── 8.3 Вписывание мира в холст ── */
  function fit(){
    if(!model) return;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const pt = [0, 0, 0, 0, 0];
    model.paths.forEach(path => {
      const T = path.T;
      for(let i = 0; i < T.n; i++){
        for(const e of [0, 1]){
          wpt(T, i, e, pt);
          if(pt[0] < x0) x0 = pt[0]; if(pt[0] > x1) x1 = pt[0];
          if(pt[1] < y0) y0 = pt[1]; if(pt[1] > y1) y1 = pt[1];
        }
      }
    });
    /* Выноски и размерные линии тоже входят в кадр — иначе подписи срезает,
       а вокруг картинки остаются пустые поля. */
    model.geo.annos.forEach(an => {
      /* У выноски за концом полки идёт текст — закладываем на него запас. */
      const xs = an.t === 'dim' ? [an.x1, an.x2] : [an.x, an.x + (an.dx || 0) * 2.2];
      const ys = an.t === 'dim' ? [an.y1, an.y2] : [an.y, an.y + (an.dy || 0)];
      xs.forEach(v => { if(v < x0) x0 = v; if(v > x1) x1 = v; });
      ys.forEach(v => { if(v < y0) y0 = v; if(v > y1) y1 = v; });
    });
    const marg = model.geo.D * 0.5;                  // поле вокруг кадра
    x0 -= marg; x1 += marg; y0 -= marg; y1 += marg;
    const padTop = o.compact ? 12 : 30, padBot = o.compact ? 12 : 40;
    /* Отступ под панель управления снимается, если холст стал узким: на
       мобильной раскладке панель уходит под холст и место резервировать нечего. */
    const insL = (o.inset.left || 0) > W * 0.45 ? 0 : (o.inset.left || 0);
    const ax = insL + 10, ay = (o.inset.top || 0) + padTop;
    const aw = Math.max(20, W - ax - (o.inset.right || 0) - 10);
    const ah = Math.max(20, H - ay - (o.inset.bottom || 0) - padBot);
    const k = Math.min(aw / Math.max(1e-6, x1 - x0), ah / Math.max(1e-6, y1 - y0));
    view = { k, ox: ax + (aw - (x1 - x0) * k) / 2 - x0 * k,
                oy: ay + (ah - (y1 - y0) * k) / 2 - y0 * k,
             ax, ay, aw, ah };
  }
  const SX = wx => view.ox + wx * view.k;
  const SY = wy => view.oy + wy * view.k;

  /* ── 8.4 Показания зонда ── */
  function computeRead(){
    if(!model) return;
    const path = model.paths[0], T = path.T;
    const ip = clamp(Math.round(clamp(o.probe, 0, 1) * (T.n - 1)), 0, T.n - 1);
    let uMax = -1e9, uMin = 1e9;
    for(let j = 0; j < NY; j++){
      const u = path.U[ip * NY + j];
      if(u > uMax) uMax = u; if(u < uMin) uMin = u;
    }
    const F = path.F[ip], Q = path.Q * path.qf(ip);
    const uAvg = F > 0 ? Q / F : 0;
    const h = T.h[ip];
    const Dh = model.sec.round ? h : 2 * model.sec.depth * h / (model.sec.depth + h);
    const Re = uAvg * Dh / AIR.nu;
    /* Неравномерность в конечном сечении: для входа в вентилятор это и есть
       главное число — насколько неровно поток приходит на колесо. */
    const ie = T.n - 1;
    let eMax = -1e9, eMin = 1e9;
    for(let j = 0; j < NY; j++){
      const u = path.U[ie * NY + j];
      if(u > eMax) eMax = u; if(u < eMin) eMin = u;
    }
    const eAvg = path.F[ie] > 0 ? path.Q * path.qf(ie) / path.F[ie] : 0;
    const { st, el, p, loss } = model;
    readout = {
      exit: { uAvg: eAvg, uMax: eMax, uMin: eMin, ratio: eAvg > 0.01 ? eMax / eAvg : 0 },
      element: el.key, elementName: el.name, param: el.param,
      paramValue: p[el.param.key],
      L: o.L, section: model.sec.label, F: model.sec.F, Dh: model.sec.Dh,
      u0: st.u0, Re0: st.Re, n: st.n, pd0: st.pd,
      probe: { ip, x: T.x[ip], uAvg, uMax, uMin, Re, pd: pDyn(uAvg), Dh, h },
      loss, uScale: model.uScale,
      reverse: uMin < -0.02
    };
    readout.text = describe(readout);
    canvas.setAttribute('aria-label', readout.text);
    if(typeof o.onRead === 'function') o.onRead(readout);
  }

  function describe(r){
    const L = r.loss;
    const lab = r.param.label.charAt(0).toLowerCase() + r.param.label.slice(1);
    return `${r.elementName}, ${lab} ${nf(r.paramValue, r.param.dec)}` +
      `${r.param.unit ? ' ' + r.param.unit : ''}. Расход ${nf(r.L, 0)} кубометров в час, сечение ` +
      `${r.section}. Средняя скорость в воздуховоде ${nf(r.u0, 2)} метра в секунду. ` +
      `В выбранном сечении: средняя ${nf(r.probe.uAvg, 2)}, максимальная ${nf(r.probe.uMax, 2)}` +
      `${r.reverse ? `, минимальная ${nf(r.probe.uMin, 2)} — возвратное течение` : ''} метра в секунду. ` +
      `Число Рейнольдса ${nf(r.probe.Re / 1000, 0)} тысяч, показатель профиля n = ${nf(r.n, 1)}. ` +
      `Динамическое давление ${nf(r.probe.pd, 0)} паскаль. ` +
      `Потеря на элементе ${nf(L.dp, 1)} паскаль, дзета ${nf(L.zeta, 3)} по ${L.ref}. ` +
      `Расчёт одномерный, инженерный, это не численное моделирование.`;
  }

  /* ── 8.5 Частицы ── */
  function targetCount(){
    if(still() || !o.layers.particles) return 0;
    const area = W * H;
    const base = clamp(Math.round(area / 2600), 50, 720);
    return Math.round(base * clamp(o.density, 0.1, 2));
  }
  function spawn(pt){
    const path = model.paths[0];
    const level = Math.random() * path.PSI[NY - 1];
    pt.tr = 0;
    pt.s = Math.random() * 0.02 * path.T.len;
    pt.eta = clamp(etaAtPsi(path, 0, level), 0.01, 0.99);
    pt.life = 0.5 + Math.random() * 7;
    pt.px = NaN;
    return pt;
  }
  function seed(reset){
    want = targetCount();
    if(reset) parts.length = 0;
    if(!model) return;
    live = clamp(live || want, 0, want);
    while(parts.length < want) parts.push(spawn({}));
    if(parts.length > want) parts.length = want;
    if(reset) parts.forEach(pt => { pt.s = Math.random() * model.paths[0].T.len; pt.px = NaN; });
  }

  const sm = [0, 0, 0, 0];
  function advect(dt){
    const branch = model.paths[1];
    const teeS = model.el.key === 'tee' ? 3.6 * model.geo.D : Infinity;
    for(let k = 0; k < live && k < parts.length; k++){
      const pt = parts[k];
      const path = model.paths[pt.tr] || model.paths[0];
      const si = nodeAt(path.T, pt.s);
      sample(path, si, pt.eta, sm);
      const u = sm[0], v = sm[1], h = Math.max(1e-6, sm[2]), dh = sm[3];
      const s0 = pt.s;
      pt.s += u * dt;
      pt.eta = clamp(pt.eta + (v - (pt.eta - 0.5) * dh * u) / h * dt, 0.004, 0.996);
      pt.life -= dt;
      /* Тройник: доля частиц, равная доле расхода, уходит в ответвление. */
      if(branch && pt.tr === 0 && s0 < teeS && pt.s >= teeS && Math.random() < o.params.split){
        pt.tr = 1; pt.s = 0.01 * branch.T.len;
        pt.eta = clamp(etaAtPsi(branch, 0, Math.random() * branch.PSI[NY - 1]), 0.02, 0.98);
        pt.px = NaN;
      }
      if(pt.s > path.T.len || pt.s < -0.02 * path.T.len || pt.life < 0) spawn(pt);
      /* Решётка: из воздуховода частица переходит в струю. */
      else if(model.el.key === 'grille' && pt.tr === 0 && pt.s >= path.T.len - 1e-6 && model.paths[1]){
        pt.tr = 1; pt.s = 0; pt.px = NaN;
      }
    }
  }

  /* ── 8.6 Статический слой ── */
  function wallPts(path, eta){
    const T = path.T, out = [], pt = [0, 0, 0, 0, 0];
    for(let i = 0; i < T.n; i++){ wpt(T, i, eta, pt); out.push(SX(pt[0]), SY(pt[1])); }
    return out;
  }
  function poly(c, a){ c.beginPath(); c.moveTo(a[0], a[1]); for(let i = 2; i < a.length; i += 2) c.lineTo(a[i], a[i + 1]); }

  function drawStatic(){
    if(!model || !view || W < 2 || H < 2) return;
    const c = bx;
    c.clearRect(0, 0, W, H);
    /* — бумага и миллиметровка — */
    c.fillStyle = pal.c('sheet'); c.fillRect(0, 0, W, H);
    c.lineWidth = 1; c.strokeStyle = pal.c('gridInk');
    c.beginPath();                                   // мелкая клетка
    for(let x = 0; x <= W; x += 14){ c.moveTo(x + .5, 0); c.lineTo(x + .5, H); }
    for(let y = 0; y <= H; y += 14){ c.moveTo(0, y + .5); c.lineTo(W, y + .5); }
    c.stroke();
    c.beginPath();                                   // крупная, поверх мелкой
    for(let x = 0; x <= W; x += 70){ c.moveTo(x + .5, 0); c.lineTo(x + .5, H); }
    for(let y = 0; y <= H; y += 70){ c.moveTo(0, y + .5); c.lineTo(W, y + .5); }
    c.stroke();

    model.paths.forEach(path => drawField(c, path));
    model.paths.forEach(path => drawWalls(c, path));
    if(o.layers.streamlines || still()) model.paths.forEach(path => drawStream(c, path));
    if(o.layers.vectors) model.paths.forEach(path => drawVectors(c, path));
    drawAnnos(c);
    drawLegend(c);
    drawStamp(c);
    needStatic = false;
  }

  function fieldColor(u){
    const s = model.uScale;
    if(u >= 0) return pal.c('blue', 0.05 + 0.55 * Math.pow(clamp(u / s, 0, 1), 0.85));
    /* Возвратное течение всегда на порядок медленнее основного — у него своя
       шкала, иначе зона отрыва оказалась бы невидимой. */
    return pal.c('sig', 0.18 + 0.40 * clamp(-u / (0.2 * s), 0, 1));
  }
  function drawField(c, path){
    const T = path.T, N = T.n;
    /* Сетка заливки — компромисс: мельче ячейка, ровнее граница зоны отрыва,
       но статический слой пересобирается на каждое движение ползунка. */
    const si = Math.max(1, Math.round(N / 110)), sj = 1;
    const A = [0, 0, 0, 0, 0], B = [0, 0, 0, 0, 0], C = [0, 0, 0, 0, 0], Dp = [0, 0, 0, 0, 0];
    const show = o.layers.field;
    for(let i = 0; i + si < N; i += si){
      for(let j = 0; j + sj < NY; j += sj){
        const u = (path.U[i * NY + j] + path.U[(i + si) * NY + j] +
                   path.U[i * NY + j + sj] + path.U[(i + si) * NY + j + sj]) / 4;
        if(!show && u >= 0) continue;              // зона возврата видна всегда
        const e0 = j / (NY - 1), e1 = (j + sj) / (NY - 1);
        wpt(T, i, e0, A); wpt(T, i + si, e0, B); wpt(T, i + si, e1, C); wpt(T, i, e1, Dp);
        c.fillStyle = fieldColor(u);
        c.beginPath();
        c.moveTo(SX(A[0]), SY(A[1])); c.lineTo(SX(B[0]), SY(B[1]));
        c.lineTo(SX(C[0]), SY(C[1])); c.lineTo(SX(Dp[0]), SY(Dp[1]));
        c.closePath(); c.fill();
      }
    }
  }

  function drawWalls(c, path){
    const lo = wallPts(path, 0), hi = wallPts(path, 1);
    if(path.dashed){
      c.save(); c.setLineDash([6, 5]); c.lineWidth = 1.2; c.strokeStyle = pal.c('blueEdge');
      poly(c, lo); c.stroke(); poly(c, hi); c.stroke(); c.restore();
      return;
    }
    /* Стенка — двойная линия: внутренняя кромка канала и наружная кромка
       конструкции, между ними штриховка изоляции под 45° к стенке.
       Наружная линия смещается вдоль нормали n = (ty, −tx): к η = 1 в плюс,
       к η = 0 в минус.                                                       */
    const off = 6, T = path.T, pt = [0, 0, 0, 0, 0];
    [[lo, 1], [hi, -1]].forEach(([w, sign]) => {
      const eta = sign < 0 ? 1 : 0;                       // lo → η = 0, hi → η = 1
      const dir = sign < 0 ? 1 : -1;                      // куда наружу
      const out = [], tan = [];
      for(let i = 0; i < T.n; i++){
        wpt(T, i, eta, pt);
        out.push(SX(pt[0]) + pt[3] * off * dir, SY(pt[1]) - pt[2] * off * dir);
        tan.push(pt[2], pt[3]);
      }
      c.lineWidth = 1.8; c.strokeStyle = pal.c('ink3');    poly(c, w);   c.stroke();
      c.lineWidth = 1;   c.strokeStyle = pal.c('ruleHard'); poly(c, out); c.stroke();
      c.strokeStyle = pal.c('ink4', 0.55);
      c.beginPath();
      for(let i = 0; i < w.length; i += 10){
        c.moveTo(w[i], w[i + 1]);
        c.lineTo(out[i] + tan[i] * off, out[i + 1] + tan[i + 1] * off);
      }
      c.stroke();
    });
  }

  function drawStream(c, path){
    const T = path.T, levels = 11;
    c.lineWidth = 1; c.strokeStyle = pal.c('blueInk', 0.42);
    const pt = [0, 0, 0, 0, 0];
    for(let k = 1; k < levels; k++){
      const frac = k / levels;
      c.beginPath();
      let started = false;
      for(let i = 0; i < T.n; i++){
        const eta = etaAtPsi(path, i, frac * path.PSI[i * NY + NY - 1]);
        wpt(T, i, eta, pt);
        const X = SX(pt[0]), Y = SY(pt[1]);
        if(!started){ c.moveTo(X, Y); started = true; } else c.lineTo(X, Y);
      }
      c.stroke();
    }
  }

  function drawVectors(c, path){
    const T = path.T, si = Math.max(3, Math.round(T.n / 26)), sj = 6;
    const pt = [0, 0, 0, 0, 0], sv = [0, 0, 0, 0];
    const L = 16;
    for(let i = Math.round(si / 2); i < T.n; i += si){
      for(let j = 3; j < NY - 2; j += sj){
        const eta = j / (NY - 1);
        wpt(T, i, eta, pt); sample(path, i, eta, sv);
        const vx = sv[0] * pt[2] + sv[1] * pt[3];      // вдоль касательной + по нормали
        const vy = sv[0] * pt[3] - sv[1] * pt[2];
        const m = Math.hypot(vx, vy); if(m < 1e-4) continue;
        const len = L * clamp(m / model.uScale, 0.08, 1);
        const X = SX(pt[0]), Y = SY(pt[1]), ux = vx / m, uy = vy / m;
        c.strokeStyle = sv[0] < 0 ? pal.c('sigInk', 0.8) : pal.c('ink3', 0.75);
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(X - ux * len / 2, Y - uy * len / 2);
        c.lineTo(X + ux * len / 2, Y + uy * len / 2);
        c.lineTo(X + ux * len / 2 - ux * 4 + uy * 2.6, Y + uy * len / 2 - uy * 4 - ux * 2.6);
        c.moveTo(X + ux * len / 2, Y + uy * len / 2);
        c.lineTo(X + ux * len / 2 - ux * 4 - uy * 2.6, Y + uy * len / 2 - uy * 4 + ux * 2.6);
        c.stroke();
      }
    }
  }

  function drawAnnos(c){
    const D = model.geo.D;
    c.font = `500 11px ${pal.fUi}`;
    model.geo.annos.forEach(a => {
      if(a.t === 'note'){
        const X = SX(a.x), Y = SY(a.y), X2 = SX(a.x + a.dx), Y2 = SY(a.y + a.dy);
        c.strokeStyle = pal.c('ink4'); c.lineWidth = 1;
        c.beginPath(); c.moveTo(X, Y); c.lineTo(X2, Y2); c.stroke();
        c.beginPath(); c.arc(X, Y, 2, 0, Math.PI * 2); c.fillStyle = pal.c('ink3'); c.fill();
        const right = X2 >= X;
        c.textAlign = right ? 'left' : 'right';
        c.textBaseline = Y2 < Y ? 'bottom' : 'top';
        const tx = X2 + (right ? 4 : -4), ty = Y2 + (Y2 < Y ? -3 : 3);
        const w = c.measureText(a.text).width;
        c.fillStyle = pal.c('sheet', 0.85);
        c.fillRect(right ? tx - 2 : tx - w - 2, ty - (Y2 < Y ? 13 : 1), w + 4, 14);
        c.fillStyle = pal.c('ink2'); c.fillText(a.text, tx, ty);
      }
      if(a.t === 'dim'){
        const X1 = SX(a.x1), Y1 = SY(a.y1), X2 = SX(a.x2), Y2 = SY(a.y2);
        c.strokeStyle = pal.c('blue', 0.75); c.lineWidth = 1;
        c.beginPath(); c.moveTo(X1, Y1); c.lineTo(X2, Y2);
        c.moveTo(X1, Y1 - 4); c.lineTo(X1, Y1 + 4);
        c.moveTo(X2, Y2 - 4); c.lineTo(X2, Y2 + 4); c.stroke();
        c.textAlign = 'center'; c.textBaseline = 'bottom';
        c.font = `500 11px ${pal.fNum}`;
        const mx = (X1 + X2) / 2, my = (Y1 + Y2) / 2 - 4;
        const w = c.measureText(a.text).width;
        c.fillStyle = pal.c('sheet', 0.9); c.fillRect(mx - w / 2 - 3, my - 12, w + 6, 13);
        c.fillStyle = pal.c('blueInk'); c.fillText(a.text, mx, my);
        c.font = `500 11px ${pal.fUi}`;
      }
      if(a.t === 'plate'){
        const hx = Math.cos(a.ang) * a.len / 2, hy = Math.sin(a.ang) * a.len / 2;
        c.strokeStyle = pal.c('ink'); c.lineWidth = 4; c.lineCap = 'round';
        c.beginPath(); c.moveTo(SX(a.x - hx), SY(a.y - hy)); c.lineTo(SX(a.x + hx), SY(a.y + hy));
        c.stroke(); c.lineCap = 'butt';
        c.fillStyle = pal.c('sheet'); c.strokeStyle = pal.c('ink'); c.lineWidth = 1.4;
        c.beginPath(); c.arc(SX(a.x), SY(a.y), 3.5, 0, Math.PI * 2); c.fill(); c.stroke();
      }
      if(a.t === 'grille'){
        const nBars = 7, gap = a.h / nBars;
        c.strokeStyle = pal.c('ink2'); c.lineWidth = 3;
        for(let i = 0; i < nBars; i++){
          const y = -a.h / 2 + gap * (i + 0.5);
          const bh = gap * (1 - a.free) * 0.9;
          c.beginPath(); c.moveTo(SX(a.x), SY(y - bh / 2)); c.lineTo(SX(a.x), SY(y + bh / 2)); c.stroke();
        }
      }
      if(a.t === 'wheel'){
        const X = SX(a.x), Y = SY(a.y), r = a.h * view.k * 0.62;
        c.strokeStyle = pal.c('ink2'); c.lineWidth = 1.6;
        c.beginPath(); c.arc(X, Y, r, 0, Math.PI * 2); c.stroke();
        c.lineWidth = 1;
        for(let i = 0; i < 10; i++){
          const g = i / 10 * Math.PI * 2;
          c.beginPath();
          c.moveTo(X + Math.cos(g) * r * 0.35, Y + Math.sin(g) * r * 0.35);
          c.lineTo(X + Math.cos(g + 0.5) * r * 0.95, Y + Math.sin(g + 0.5) * r * 0.95);
          c.stroke();
        }
        c.fillStyle = pal.c('ink3');
        c.beginPath(); c.arc(X, Y, r * 0.16, 0, Math.PI * 2); c.fill();
      }
    });
  }

  /* Шкала цвета с подписанными значениями — цвет никогда не единственный носитель. */
  function drawLegend(c){
    if(o.compact) return;
    const w = Math.min(180, Math.max(90, view.aw * 0.32)), h = 9, steps = 26;
    const x = view.ax + 10, y = 22;
    /* подложка, чтобы шкала читалась поверх миллиметровки */
    c.fillStyle = pal.c('sheet', 0.9);
    c.fillRect(x - 10, y - 15, w + 108, h + 30);
    for(let i = 0; i < steps; i++){
      c.fillStyle = fieldColor(model.uScale * (i + 0.5) / steps);
      c.fillRect(x + w * i / steps, y, w / steps + 0.6, h);
    }
    c.strokeStyle = pal.c('rule'); c.lineWidth = 1; c.strokeRect(x + .5, y + .5, w, h);
    c.font = `500 10px ${pal.fNum}`; c.fillStyle = pal.c('ink3'); c.textBaseline = 'top';
    c.textAlign = 'left';   c.fillText('0', x, y + h + 3);
    c.textAlign = 'center'; c.fillText(nf(model.uScale / 2, 1), x + w / 2, y + h + 3);
    c.textAlign = 'right';  c.fillText(nf(model.uScale, 1) + ' м/с', x + w, y + h + 3);
    /* образец возвратного течения */
    const rx = x + w + 14;
    c.fillStyle = fieldColor(-model.uScale); c.fillRect(rx, y, 15, h);
    c.strokeStyle = pal.c('rule'); c.strokeRect(rx + .5, y + .5, 15, h);
    c.textAlign = 'left'; c.font = `500 10px ${pal.fUi}`; c.fillStyle = pal.c('sigInk');
    c.fillText('возврат', rx + 19, y + h + 3);
    c.fillStyle = pal.c('ink3');
    c.fillText('поле скорости, м/с', x, y - 12);
  }

  /* Штамп чертежа. Здесь и только здесь написано, что это за модель. */
  function drawStamp(c){
    const lines = o.compact
      ? ['ОДНОМЕРНАЯ МОДЕЛЬ · НЕ CFD']
      : [`${model.el.name.toUpperCase()} · ${model.sec.label} · ${nf(o.L, 0)} м³/ч`,
         'ОДНОМЕРНАЯ ИНЖЕНЕРНАЯ МОДЕЛЬ · НЕ ЧИСЛЕННОЕ МОДЕЛИРОВАНИЕ, НЕ CFD',
         'профиль (1−r/R)^(1/n) · сохранение расхода · ζ по таблицам'];
    c.font = `700 9.5px ${pal.fPlate}`;
    let w = 0; lines.forEach(t => { w = Math.max(w, c.measureText(t).width); });
    const pad = 7, lh = 12, bw = w + pad * 2, bh = lines.length * lh + pad * 2 - 3;
    const x = W - bw - 8, y = H - bh - 8;
    c.fillStyle = pal.c('sheet', 0.92); c.fillRect(x, y, bw, bh);
    c.strokeStyle = pal.c('ruleHard'); c.lineWidth = 1; c.strokeRect(x + .5, y + .5, bw, bh);
    c.textAlign = 'left'; c.textBaseline = 'top';
    lines.forEach((t, i) => {
      c.fillStyle = i === (o.compact ? 0 : 1) ? pal.c('sigInk') : pal.c('ink3');
      c.fillText(t, x + pad, y + pad + i * lh);
    });
  }

  /* ── 8.7 Динамический слой ── */
  function drawDynamic(){
    if(!model || !view || W < 2 || H < 2) return;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bg, 0, 0, W, H);
    if(!still() && o.layers.particles) drawParticles();
    if(o.layers.profile) drawProbe();
  }

  function drawParticles(){
    const fwd = [], rev = [];
    const pt = [0, 0, 0, 0, 0], sv = [0, 0, 0, 0];
    for(let k = 0; k < live && k < parts.length; k++){
      const p = parts[k], path = model.paths[p.tr] || model.paths[0];
      const si = nodeAt(path.T, p.s);
      wpt(path.T, si, p.eta, pt);
      sample(path, si, p.eta, sv);
      const X = SX(pt[0]), Y = SY(pt[1]);
      const vx = (sv[0] * pt[2] + sv[1] * pt[3]) * view.k;
      const vy = (sv[0] * pt[3] - sv[1] * pt[2]) * view.k;
      /* Длина штриха пропорциональна местной скорости — «экспозиция» трассера.
         Снизу ограничена, чтобы медленная частица у стенки осталась видимой,
         сверху — чтобы быстрая не превращалась в линию через весь кадр.      */
      let dx = vx * o.timeScale * 0.024, dy = vy * o.timeScale * 0.024;
      const m = Math.hypot(dx, dy) || 1;
      if(m < 1.5)  { const s = 1.5 / m; dx *= s; dy *= s; }
      else if(m > 14){ const s = 14 / m; dx *= s; dy *= s; }
      (sv[0] < 0 ? rev : fwd).push(X - dx, Y - dy, X, Y);
    }
    const stroke = (arr, style) => {
      if(!arr.length) return;
      ctx.strokeStyle = style; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
      ctx.beginPath();
      for(let i = 0; i < arr.length; i += 4){
        ctx.moveTo(arr[i], arr[i + 1]); ctx.lineTo(arr[i + 2], arr[i + 3]);
      }
      ctx.stroke(); ctx.lineCap = 'butt';
    };
    stroke(fwd, pal.c('ink', 0.62));
    stroke(rev, pal.c('sigInk', 0.85));
  }

  /* Линейка-зонд и эпюра u(r) в выбранном сечении. */
  function drawProbe(){
    const path = model.paths[0], T = path.T, ip = readout.probe.ip;
    const pt = [0, 0, 0, 0, 0], a = [0, 0, 0, 0, 0], b = [0, 0, 0, 0, 0];
    wpt(T, ip, 0, a); wpt(T, ip, 1, b);
    ctx.save();
    ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2; ctx.strokeStyle = pal.c('blue');
    ctx.beginPath(); ctx.moveTo(SX(a[0]), SY(a[1])); ctx.lineTo(SX(b[0]), SY(b[1])); ctx.stroke();
    ctx.restore();
    /* эпюра: скорость откладывается вдоль касательной */
    const h = T.h[ip], scale = 1.25 * h / Math.max(1e-6, model.uScale);
    ctx.beginPath();
    for(let j = 0; j < NY; j++){
      const eta = j / (NY - 1);
      wpt(T, ip, eta, pt);
      const u = path.U[ip * NY + j];
      const X = SX(pt[0] + pt[2] * u * scale), Y = SY(pt[1] + pt[3] * u * scale);
      if(j === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.lineTo(SX(b[0]), SY(b[1])); ctx.lineTo(SX(a[0]), SY(a[1])); ctx.closePath();
    ctx.fillStyle = pal.c('blue', 0.14); ctx.fill();
    ctx.strokeStyle = pal.c('blueInk'); ctx.lineWidth = 1.5; ctx.stroke();
    /* линия u_ср */
    const uA = readout.probe.uAvg;
    wpt(T, ip, 0, a); wpt(T, ip, 1, b);
    ctx.save(); ctx.setLineDash([2, 3]); ctx.strokeStyle = pal.c('ink4'); ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(SX(a[0] + a[2] * uA * scale), SY(a[1] + a[3] * uA * scale));
    ctx.lineTo(SX(b[0] + b[2] * uA * scale), SY(b[1] + b[3] * uA * scale));
    ctx.stroke(); ctx.restore();
    if(!o.compact){
      wpt(T, ip, 1, pt);
      const txt = `u ср ${nf(uA, 2)} · u max ${nf(readout.probe.uMax, 2)} м/с`;
      ctx.font = `500 10.5px ${pal.fNum}`;
      const tw = ctx.measureText(txt).width;
      /* подписи держим внутри холста, иначе на узком экране их срежет */
      const tx = clamp(SX(pt[0]), view.ax + tw / 2 + 4, W - tw / 2 - 8);
      const ty = Math.max(46, SY(pt[1]) - 12);
      ctx.fillStyle = pal.c('sheet', 0.92);
      ctx.fillRect(tx - tw / 2 - 4, ty - 13, tw + 8, 15);
      ctx.fillStyle = pal.c('blueInk');
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(txt, tx, ty);
    }
  }

  /* ── 8.8 Цикл ── */
  function frame(now){
    raf = 0;
    if(dead) return;
    if(!prevT) prevT = now;
    const real = Math.min((now - prevT) / 1000, 0.05);
    prevT = now;
    ema = ema * 0.9 + (real * 1000) * 0.1;
    /* Адаптация числа частиц: кадр дольше 20 мс — снижаем. */
    if(++tick % 24 === 0){
      if(ema > 20) live = Math.max(40, Math.round(live * 0.86));
      else if(ema < 13 && live < want) live = Math.min(want, Math.round(live * 1.08) + 4);
      checkSize();
    }
    if(!paused) advect(real * o.timeScale);
    drawDynamic();
    if(running) raf = requestAnimationFrame(frame);
  }

  function shouldRun(){
    return !dead && !still() && onScreen && pageVisible && !paused &&
           o.layers.particles && W > 2 && H > 2;
  }
  function sync(){
    if(shouldRun()){
      if(!running){ running = true; prevT = 0; raf = requestAnimationFrame(frame); }
    }else if(running){
      running = false;
      if(raf) cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  /* Пересборка склеивается в один кадр: быстрое переключение элементов
     не плодит ни лишних расчётов, ни лишних анимационных циклов. */
  function invalidate(rebuild){
    if(rebuild) needBuild = true;
    needStatic = true;
    if(queued || dead) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if(dead) return;
      if(W < 2 || H < 2) resize();
      if(W < 2 || H < 2) return;
      if(needBuild){ build(); needBuild = false; }
      else { fit(); computeRead(); seed(false); }
      drawStatic();
      drawDynamic();
      sync();
      if(liveEl && readout) liveEl.textContent = readout.text;
    });
  }

  /* ── 8.9 Ввод ── */
  function probeFromPointer(ev){
    if(!model || !view) return;
    const r = canvas.getBoundingClientRect();
    const wx = (ev.clientX - r.left - view.ox) / view.k;
    const wy = (ev.clientY - r.top - view.oy) / view.k;
    const T = model.paths[0].T;
    let best = 0, bd = Infinity;
    for(let i = 0; i < T.n; i++){
      const d = (T.x[i] - wx) ** 2 + (T.y[i] - wy) ** 2;
      if(d < bd){ bd = d; best = i; }
    }
    o.probe = best / (T.n - 1);
    computeRead();
    if(liveEl) liveEl.textContent = readout.text;
    if(!running) drawDynamic();
  }
  let dragging = false;
  const onDown = ev => { if(!o.interactive) return; dragging = true; canvas.focus?.(); probeFromPointer(ev); };
  const onMove = ev => { if(dragging) probeFromPointer(ev); };
  const onUp   = () => { dragging = false; };
  const onKey  = ev => {
    if(!o.interactive || !model) return;
    const T = model.paths[0].T, stepK = (ev.shiftKey ? 6 : 1) / (T.n - 1);
    if(ev.key === 'ArrowLeft' || ev.key === 'ArrowRight'){
      ev.preventDefault();
      o.probe = clamp(o.probe + (ev.key === 'ArrowRight' ? stepK : -stepK), 0, 1);
      computeRead(); if(liveEl) liveEl.textContent = readout.text;
      if(!running) drawDynamic();
    }
    if(ev.key === ' ' || ev.key === 'Spacebar'){
      ev.preventDefault(); paused ? api.resume() : api.pause();
    }
  };
  if(o.interactive){
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    canvas.addEventListener('keydown', onKey);
    canvas.style.touchAction = 'pan-y';
  }

  /* Размер холста отслеживаем тремя путями: ResizeObserver, событие resize и
     сверка в самом кадре. По отдельности каждый механизм может пропустить
     изменение (например, окно меняется до первой раскладки), вместе — нет. */
  function checkSize(){ if(resize()) invalidate(false); }
  const ro = new ResizeObserver(checkSize);
  ro.observe(canvas);
  if(canvas.parentNode) ro.observe(canvas.parentNode);
  window.addEventListener('resize', checkSize, { passive: true });
  const io = new IntersectionObserver(es => { onScreen = es[0].isIntersecting; sync(); }, { threshold: 0.02 });
  io.observe(canvas);
  const onVis = () => { pageVisible = !document.hidden; prevT = 0; sync(); };
  document.addEventListener('visibilitychange', onVis);
  const onScheme = () => { pal = readPalette(canvas); invalidate(false); };
  const mm = matchMedia('(prefers-color-scheme:dark)');
  mm.addEventListener?.('change', onScheme);
  const onReduce = () => invalidate(false);
  reduce.addEventListener?.('change', onReduce);

  /* ── 8.10 Публичный интерфейс ── */
  const api = {
    set(next = {}){
      const heavy = ['L', 'shape', 'D', 'a', 'b', 'element', 'params', 'density'];
      const rebuild = heavy.some(k => k in next);
      o = mergeOpts(o, next);
      invalidate(rebuild);
      return api;
    },
    pause(){ paused = true; sync(); return api; },
    resume(){ paused = false; prevT = 0; sync(); return api; },
    read(){ return readout; },
    get paused(){ return paused; },
    destroy(){
      if(dead) return;
      dead = true; running = false;
      if(raf) cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      window.removeEventListener('resize', checkSize);
      document.removeEventListener('visibilitychange', onVis);
      mm.removeEventListener?.('change', onScheme);
      reduce.removeEventListener?.('change', onReduce);
      if(o.interactive){
        canvas.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('keydown', onKey);
      }
      if(ownLive && liveEl?.parentNode) liveEl.remove();
      parts.length = 0; model = null;
    }
  };

  resize();
  invalidate(true);
  return api;
}
