/* ═══════════════════════════════════════════════════════════════════════
   ВЕНТПРОМ · общее поведение всех страниц прототипа.
   Ванильный JS, без библиотек. Подключается после data.js.
   ═══════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

const D = root.VPDATA;
const $  = (s, c) => (c || document).querySelector(s);
const $$ = (s, c) => [...(c || document).querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

/* ═══ 1. Иконография. Единая обводка, авторские SVG ═══════════════════ */
const S = (d, w) => `<svg width="${w || 26}" height="${(w || 26) * 24 / 28}" viewBox="0 0 28 24"
  fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
  stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

const ICON = {
  radial: S(`<path d="M12.4 5.2a6 6 0 1 1-5.9 7.6"/><path d="M6.5 12.8A6.6 6.6 0 0 1 12.4 5.2"/>
             <path d="M12.4 5.2V2.6h5v2.6"/><path d="M11.3 2.6h6.8"/>
             <path d="M6.5 12.8H3.2l-1.4 2v2.6l1.4 2h3.3"/>
             <path d="M18.6 11.5h4.6v5.4h-4.6"/><path d="M23.2 12.9h2.4v2.6h-2.4"/>
             <path d="M3.6 19.4h20.4"/><path d="M6.6 19.4v2M21 19.4v2"/>`),
  heavy:  S(`<path d="M13.6 5.6a6.2 6.2 0 1 1-6.1 7.8"/><path d="M7.5 13.4a6.8 6.8 0 0 1 6.1-7.8"/>
             <path d="M13.6 5.6V2.8h5.2v2.8"/><path d="M7.5 13.4H3.8"/>
             <path d="M19.4 11.2h5v6h-5"/><path d="M2.6 20h22.8"/><path d="M6 20v1.8M21.6 20v1.8"/>`),
  ahu:    S(`<path d="M2.6 6h22.8v12H2.6z"/><path d="M10.2 6v12M17.8 6v12"/>
             <path d="M5.2 9.4h2.4M5.2 12h2.4M5.2 14.6h2.4"/><circle cx="14" cy="12" r="2.6"/>
             <path d="M20.4 9.6h4.6M20.4 14.4h4.6"/>`),
  duct:   S(`<path d="M7 6.4h14v11.2H7z"/><ellipse cx="7" cy="12" rx="2.4" ry="5.6"/>
             <path d="M21 6.4a2.4 5.6 0 0 1 0 11.2"/><path d="M4 6.4v11.2M24 6.4v11.2"/>
             <path d="M12.6 9.4 15.4 12l-2.8 2.6"/>`),
  damper: S(`<path d="M5.4 5.6h17.2v12.8H5.4z"/><path d="M2.6 5.6v12.8M25.4 5.6v12.8"/>
             <path d="M7.6 15.8 20.4 8.2"/><circle cx="14" cy="12" r="1.4"/>
             <path d="M14 5.6v1.4M14 17v1.4"/>`),
  panel:  S(`<path d="M5.6 3.4h16.8v17.2H5.6z"/><path d="M22.4 6.6h1.8v11h-1.8"/>
             <circle cx="10" cy="7.6" r="1.2"/><circle cx="14" cy="7.6" r="1.2"/><circle cx="18" cy="7.6" r="1.2"/>
             <path d="M9 11.6h10M9 14.2h10M9 16.8h6"/>`),
  heat:   S(`<path d="M4.6 6.4h18.8v11.2H4.6z"/>
             <path d="M8.4 6.4v11.2M12.2 6.4v11.2M16 6.4v11.2M19.8 6.4v11.2"/>
             <path d="M2.4 9h2.2M2.4 15h2.2M23.4 9h2.2M23.4 15h2.2"/>`),
  draft:  S(`<path d="M14.2 4.8a6.8 6.8 0 1 1-6.7 8.6"/><path d="M7.5 13.4A7.4 7.4 0 0 1 14.2 4.8"/>
             <path d="M14.2 4.8V2h5.6v2.8"/><path d="M7.5 13.4H2.4v-4l5.1-1.6"/>
             <path d="M20.4 10.6h5.2v7h-5.2"/><path d="M2 20.4h24"/>`),
  grille: S(`<path d="M4.4 5.6h19.2v12.8H4.4z"/><path d="M7 8.4h14M7 12h14M7 15.6h14"/>
             <path d="M6.8 5.6v12.8M21.2 5.6v12.8"/>`),
  filter: S(`<path d="M4.6 5.6h18.8v12.8H4.6z"/>
             <path d="m8 18.4 2.6-12.8M12.4 18.4 15 5.6M16.8 18.4 19.4 5.6"/><path d="M4.6 12h18.8"/>`),
  fix:    S(`<path d="M9.4 3.6v16.8"/><path d="M6.6 6h5.6M6.6 9h5.6M6.6 12h5.6M6.6 15h5.6M6.6 18h5.6"/>
             <path d="M16.4 8.6a4 4 0 1 0 4 4"/><path d="M20.4 12.6h-4v-4"/>
             <path d="M22.6 6.4h2.8v11.2h-2.8"/>`),
  calc:   S(`<path d="M6.4 2.6h15.2v18.8H6.4z"/><path d="M9 5.4h10v3.4H9z"/>
             <path d="M9.6 12h1.4M13.3 12h1.4M17 12h1.4M9.6 15.2h1.4M13.3 15.2h1.4M17 15.2h1.4
                      M9.6 18.4h1.4M13.3 18.4h1.4M17 18.4h1.4"/>`),
  doc:    S(`<path d="M6.4 2.6h10l5.2 5.2v13.6H6.4z"/><path d="M16.4 2.6v5.2h5.2"/>
             <path d="M9.6 12.4h9M9.6 15.6h9M9.6 18.4h5"/>`),
  user:   S(`<circle cx="14" cy="8.4" r="4.2"/><path d="M5.6 21.4c0-4.6 3.8-7 8.4-7s8.4 2.4 8.4 7"/>`),
  eye:    S(`<path d="M2.6 12S6.8 5.6 14 5.6 25.4 12 25.4 12 21.2 18.4 14 18.4 2.6 12 2.6 12Z"/>
             <circle cx="14" cy="12" r="2.8"/>`),
  list:   S(`<path d="M4.6 6h18.8M4.6 12h18.8M4.6 18h11.4"/>`),
  close:  S(`<path d="M6.6 6.6 21.4 17.4M21.4 6.6 6.6 17.4"/>`, 16),
  arrow:  S(`<path d="M4.6 12h18.8"/><path d="m17.4 6.6 6 5.4-6 5.4"/>`),
  check:  S(`<path d="m5.6 12.6 5.2 5.2L22.4 6.2"/>`),
  /* Сравнение: два столбца разной высоты на общей базовой линии.
     Читается как сопоставление величин, а не как «график» вообще. */
  cmp:    S(`<path d="M4.4 20.4h19.2"/><path d="M8 20.4V10.2h4.4v10.2"/>
             <path d="M15.6 20.4V5.2H20v15.2"/>`),
};

/* ═══ 2. Крупные силуэты агрегатов ═══════════════════════════════════
   Радиальный рисуется агрегатом ЦЕЛИКОМ: улитка, всасывающий конфузор,
   нагнетательный патрубок с фланцем, колесо, вал, двигатель, станина.
   Рисовать его «рабочим колесом» — ошибка матчасти. */
const V = d => `<svg viewBox="0 0 150 96" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="silh">${d}</svg>`;

const VOLUTE = `
  <path d="M66 20a26 26 0 1 1-25.4 32.4"/><path d="M40.6 52.4A28.6 28.6 0 0 1 66 20"/>
  <path d="M66 20V7h22v13"/><path d="M62 7h30"/>
  <path d="M40.6 52.4H21l-7 8v10l7 8h19.6"/><path d="M14 60.4h-6M14 70.4h-6"/>
  <path d="M69 33a13 13 0 1 0 13 13"/><path d="M75 46l-6-6M75 46l6-6M75 46v9"/>`;

const BIG = {
  scroll1: V(`${VOLUTE}<path d="M88 57h9"/>
    <path d="M97 46h26v22H97"/><path d="M123 52h9v10h-9"/>
    <path d="M12 80h122"/><path d="M26 80v9M112 80v9"/>`),
  scroll5: V(`${VOLUTE}
    <circle cx="90" cy="49" r="8"/><circle cx="115" cy="67" r="5.5"/>
    <path d="M84.6 55 110.6 71.8M95.4 43 119.4 62.2"/>
    <path d="M104 74h30v14h-30z"/><path d="M12 88h126"/><path d="M26 80v8"/><path d="M40.6 80h60"/>`),
  scrollmp: V(`
    <path d="M70 16a30 30 0 1 1-28 36"/><path d="M42 52A32 32 0 0 1 70 16"/>
    <path d="M70 16V5h26v11"/><path d="M65 5h36"/><path d="M42 52H26l-6 7v8l6 7h16"/>
    <path d="M73 32a15 15 0 1 0 15 15"/><path d="M79 47l-6-6M79 47l6-6M79 47v10"/>
    <path d="M92 58h8"/><path d="M100 44h30v26h-30z"/><path d="M130 51h8v12h-8"/>
    <path d="M14 82h124"/><path d="M30 82v8M116 82v8"/>`),
  axial: V(`
    <circle cx="75" cy="46" r="34"/><circle cx="75" cy="46" r="9"/>
    <path d="M75 12c12 10 12 22 0 25M109 46c-10 12-22 12-25 0M75 80c-12-10-12-22 0-25M41 46c10-12 22-12 25 0"/>
    <path d="M20 18v56M130 18v56"/><path d="M20 18h12M20 74h12M118 18h12M118 74h12"/>
    <path d="M12 84h126"/><path d="M40 80v4M110 80v4"/>`),
  roof: V(`
    <path d="M26 42 75 14l49 28"/><path d="M75 14v22"/><path d="M50 42h50"/>
    <path d="M44 52h62v22H44z"/><path d="M30 74h90"/><path d="M18 82h114"/>
    <path d="M44 57h-12M44 63h-12M44 69h-12M106 57h12M106 63h12M106 69h12"/>
    <path d="M64 36a12 12 0 1 0 12 12"/><path d="M76 48l-7-7M76 48l7-7"/>`),
  roofs: V(`
    <path d="M32 34 75 6l43 28"/><path d="M75 6v20"/><path d="M52 34h46"/>
    <path d="M46 44h58v24H46z"/><ellipse cx="75" cy="76" rx="44" ry="7"/>
    <path d="M16 86h118"/><path d="M46 50h-14M46 58h-14M104 50h14M104 58h14"/>
    <path d="M64 30a12 12 0 1 0 12 12"/><path d="M76 42l-7-7M76 42l7-7"/>`),
  ductext: V(`
    <path d="M22 34h106v42H22z"/><path d="M14 30v50M136 30v50"/>
    <path d="M14 30h12M14 80h12M124 30h12M124 80h12"/>
    <circle cx="75" cy="55" r="15"/><circle cx="75" cy="55" r="4"/>
    <path d="M75 40c7 6 7 13 0 15M90 55c-6 7-13 7-15 0M75 70c-7-6-7-13 0-15M60 55c6-7 13-7 15 0"/>
    <path d="M75 34V18"/><path d="M56 6h38v12H56z"/><path d="M94 9h8v6h-8"/><path d="M40 88h70"/>`),
};

/* ═══ 3. Состояние пользователя ══════════════════════════════════════
   Живёт ДО регистрации. Регистрация не начинает работу заново —
   она поднимает уже накопленное в кабинет и связывает с аккаунтом. */
const KEY = 'vp.anon.v2';
const store = {
  clientId:null, pick:[], viewed:[], projects:[], calcs:[], kp:[],
  load() {
    try { const raw = localStorage.getItem(KEY); if (raw) Object.assign(this, JSON.parse(raw)); }
    catch (e) { /* приватный режим — работаем в памяти */ }
    if (!this.clientId) this.clientId = 'A-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    return this;
  },
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        clientId:this.clientId, pick:this.pick, viewed:this.viewed.slice(0, 40),
        projects:this.projects, calcs:this.calcs.slice(0, 30),
        /* Заявки на КП: пока backend не подключён, они живут здесь и
           показываются в кабинете — иначе кнопка «Запросить КП» отправляет
           заявку в никуда, а пользователю сказано, что она сохранена. */
        kp:this.kp.slice(0, 30),
      }));
    } catch (e) { /* квота или приватный режим */ }
    root.dispatchEvent(new CustomEvent('vp:store'));
  },
  togglePick(id) {
    const i = this.pick.indexOf(id);
    if (i >= 0) this.pick.splice(i, 1); else this.pick.push(id);
    this.save();
  },
  see(id) {
    const i = this.viewed.indexOf(id);
    if (i >= 0) this.viewed.splice(i, 1);
    this.viewed.unshift(id);
    this.save();
  },
  addCalc(rec) { this.calcs.unshift(rec); this.save(); },
}.load();

/* ═══ 4. Шапка: единая для всех страниц ══════════════════════════════ */
const NAV = [
  {href:'index.html',   t:'Главная'},
  {href:'catalog.html', t:'Каталог'},
  {href:'podbor.html',  t:'Подбор'},
  {href:'calc.html',    t:'Калькуляторы'},
  {href:'podbor.html#survey',  t:'Опросный лист'},
  {href:'about.html',   t:'Завод'},
];

function mountHeader(current) {
  const host = $('#vp-head');
  if (!host) return;
  host.innerHTML = `
    <div class="util"><div class="wrap">
      <span>Промышленные вентиляторы и вентиляционные установки</span>
      <a class="tel" href="tel:+78005501008">8 800 550 10 08</a>
      <span class="sp"></span>
      <a href="podbor.html#survey">Опросный лист</a>
      <a href="about.html#docs">Документация</a>
      <a href="cabinet.html">Войти в кабинет</a>
    </div></div>
    <header class="head"><div class="wrap">
      <a class="logo" href="index.html"><b>Вентпром</b><i>завод</i></a>
      <nav class="nav" aria-label="Разделы сайта">
        ${NAV.map(n => {
          /* Сравниваем только путь: пункт «Опросный лист» ведёт на
             podbor.html#survey и при сравнении строк целиком никогда бы
             не получил отметку текущего раздела */
          const path = n.href.split('#')[0];
          const cur  = String(current || '').split('#')[0];
          return `<a href="${n.href}"${path === cur ? ' aria-current="page"' : ''}>${n.t}</a>`;
        }).join('')}
      </nav>
      <div class="head-acts">
        <button class="hbtn" id="vpViewed" type="button" aria-expanded="false" aria-controls="vpViewedPanel">
          ${ICON.eye}<span class="vh">Просмотренное</span><i class="cnt num" id="vpCViewed" data-zero="1">0</i>
        </button>
        <a class="hbtn" href="cabinet.html#pick">
          ${ICON.list}<span>Подбор</span><i class="cnt num" id="vpCPick" data-zero="1">0</i>
        </a>
        <div class="panel" id="vpViewedPanel" hidden>
          <h3>Просмотренная номенклатура
            <button type="button" id="vpViewedClose" aria-label="Закрыть">${ICON.close}</button></h3>
          <ol id="vpViewedList"></ol>
          <p class="foot" id="vpViewedFoot"></p>
        </div>
      </div>
    </div></header>`;

  $('#vpViewed').addEventListener('click', () => toggleViewed());
  $('#vpViewedClose').addEventListener('click', () => { toggleViewed(false); $('#vpViewed').focus(); });
  $('#vpViewedPanel').addEventListener('click', e => {
    const b = e.target.closest('[data-href]');
    if (b) location.href = b.dataset.href;
  });
  document.addEventListener('click', e => {
    const p = $('#vpViewedPanel');
    if (p && !p.hidden && !e.target.closest('#vpViewedPanel') && !e.target.closest('#vpViewed'))
      toggleViewed(false);
  });
  document.addEventListener('keydown', e => {
    const p = $('#vpViewedPanel');
    if (e.key === 'Escape' && p && !p.hidden) { toggleViewed(false); $('#vpViewed').focus(); }
  });
  root.addEventListener('vp:store', paintCounts);
  paintCounts();
}

function toggleViewed(force) {
  const p = $('#vpViewedPanel'), b = $('#vpViewed');
  if (!p) return;
  const open = force != null ? force : p.hidden;
  p.hidden = !open;
  b.setAttribute('aria-expanded', String(open));
}

/* Разрешение идентификатора позиции.
   В прототипе сосуществуют два модуля данных: старый VPDATA (восемь серий,
   идентификаторы p1, p2, …) и полный каталог VPCAT (45 серий, vp1, vp2, …).
   Лента просмотренного и подбор общие для всех страниц, поэтому позицию
   надо уметь найти в обоих — иначе всё, отмеченное в новом каталоге, молча
   пропадает из шапки. Сначала спрашиваем полный каталог, потом старый. */
function resolve(id) {
  const C = root.VPCAT;
  if (C) {
    const r = C.sku(id);
    if (r) return {row:r, src:C, href:'product.html?p=' + encodeURIComponent(r.id)};
  }
  if (D) {
    const r = D.NUM.find(x => x.id === id);
    if (!r) return null;
    /* Позиция из старого модуля почти всегда есть и в полном каталоге —
       это та же серия и тот же типоразмер, только другой идентификатор.
       Переводим её на каталожную карточку, иначе «подбор» и «серия»
       разъезжаются: подбор кладёт в запрос p-идентификаторы, а страница
       серии их уже не знает. */
    if (C) {
      const same = C.SKU.find(x => x.mk === r.mk && String(x.size) === String(r.size));
      if (same) return {row:same, src:C, href:'product.html?p=' + encodeURIComponent(same.id)};
    }
    /* Соответствия нет — ведём на страницу серии с якорем на типоразмер. */
    return {row:r, src:D, href:'series.html?s=' + encodeURIComponent(r.mk) + '#' + r.id};
  }
  return null;
}

function paintCounts() {
  const cp = $('#vpCPick'), cv = $('#vpCViewed');
  if (cp) { cp.textContent = store.pick.length;   cp.dataset.zero = store.pick.length ? '0' : '1'; }
  if (cv) { cv.textContent = store.viewed.length; cv.dataset.zero = store.viewed.length ? '0' : '1'; }
  const list = store.viewed.map(resolve).filter(Boolean).slice(0, 14);
  const ol = $('#vpViewedList');
  if (!ol) return;
  ol.innerHTML = list.length
    ? list.map(({row:r, src, href}) => `<li><button type="button" data-href="${href}">
        <span class="mk">${r.mk} ${src.szl(r)}</span>
        <span class="gr">${r.q ? src.fmt(r.q) + ' м³/ч' : '—'}</span></button></li>`).join('')
    : `<li><p class="foot" style="border:0;margin:0">Пока пусто. Лента заполняется,
        когда вы открываете типоразмеры или ставите их в подбор.</p></li>`;
  const f = $('#vpViewedFoot');
  if (f) f.textContent = list.length ? 'Хранится локально, переносится в кабинет при входе.' : '';
}

/* ═══ 5. Подвал ══════════════════════════════════════════════════════ */
/* Ссылки каталога строятся из дерева, а не вписаны руками. Раньше здесь
   стояли четыре разные подписи, ведущие на одну и ту же catalog.html:
   читатель жал «Воздуховоды», а попадал в общий каталог. Берём разделы,
   в которых реально есть номенклатура, — они и полезны читателю. */
function catLinks() {
  const C = root.VPCAT;
  if (!C) return '';
  return C.RAZDEL
    .filter(r => !r.stub)
    .slice(0, 4)
    .map(r => `<a href="razdel.html?r=${encodeURIComponent(r.id)}">${r.name}</a>`)
    .join('\n          ');
}

function mountFooter() {
  const host = $('#vp-foot');
  if (!host) return;
  host.innerHTML = `
    <footer><div class="wrap">
      <div class="cols">
        <div><h4>Каталог</h4>${catLinks()}
          <a href="catalog.html">Все разделы каталога</a></div>
        <div><h4>Инженеру</h4>
          <a href="podbor.html">Подбор по Q и P</a>
          <a href="calc.html">Инженерные калькуляторы</a>
          <a href="podbor.html#survey">Опросный лист</a>
          <a href="about.html#docs">Паспорта и сертификаты</a></div>
        <div><h4>Кабинет</h4>
          <a href="cabinet.html">Мои подборы</a>
          <a href="cabinet.html#projects">Объекты</a>
          <a href="cabinet.html#orders">Запросы и заказы</a>
          <a href="cabinet.html#viewed">Просмотренное</a></div>
        <div><h4>Завод</h4>
          <a href="about.html">Производство</a>
          <a href="about.html#quality">Контроль качества</a>
          <a href="about.html#docs">Документы</a>
          <a href="about.html#contacts">Контакты</a></div>
      </div>
      <p class="legal">Прототип нового сайта. Марки серий, диапазоны и индексы
        исполнений сняты с сайта завода; строки внутри диапазонов получены
        интерполяцией и служат только для проверки интерфейса — <b>подбирать по
        ним оборудование нельзя</b>. Цен, сроков изготовления, гарантий и номеров
        сертификатов здесь нет вовсе: завод их не публикует, а выдумывать их
        мы не стали.</p>
    </div></footer>`;
}

/* ═══ 6. Визуализация движения воздуха по воздуховоду ═════════════════
   Canvas 2D: линии тока в канале с сужением. Скорость растёт там, где
   сечение меньше — это и есть уравнение неразрывности, показанное
   глазом. Пауза вне экрана и в фоновой вкладке. */
function airflow(canvas, opts) {
  if (!canvas) return;
  const o = Object.assign({lines:26, speed:1, color:'#1B4C86'}, opts || {});
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, raf = 0, running = false, t = 0;
  const parts = [];

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* Профиль канала: половина высоты просвета в точке x (0..1) */
  const halfAt = x => {
    const wide = H * 0.34, narrow = H * 0.17;
    if (x < 0.34) return wide;
    if (x > 0.66) return narrow;
    const k = (x - 0.34) / 0.32;
    return wide + (narrow - wide) * (0.5 - Math.cos(k * Math.PI) / 2);
  };

  function seed() {
    parts.length = 0;
    for (let i = 0; i < o.lines; i++) {
      parts.push({x:Math.random(), lane:(i / (o.lines - 1)) * 2 - 1, len:0.05 + Math.random() * 0.07});
    }
  }

  /* Выносной размер поперёк канала с подписью — то, ради чего размерные
     линии и придуманы. Кадр обязан объяснять физику и без движения. */
  function callout(x, label, vRel) {
    const cy = H / 2, h = halfAt(x), px = x * W;
    ctx.strokeStyle = '#1B4C86'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px, cy - h); ctx.lineTo(px, cy + h); ctx.stroke();
    for (const s of [-1, 1]) {                        /* стрелки размера */
      ctx.beginPath();
      ctx.moveTo(px - 4, cy + s * (h - 6));
      ctx.lineTo(px, cy + s * h);
      ctx.lineTo(px + 4, cy + s * (h - 6));
      ctx.stroke();
    }
    ctx.font = '600 11px "PT Mono","Consolas",monospace';
    ctx.fillStyle = '#1B4C86'; ctx.textAlign = 'center';
    ctx.fillText(label, px, cy - h - 9);              /* Ø над каналом */
    ctx.fillStyle = '#131A1E';
    ctx.fillText(vRel, px, cy + h + 17);              /* скорость под каналом */
  }

  function draw() {
    raf = 0;
    ctx.clearRect(0, 0, W, H);
    const cy = H / 2;

    /* стенки канала */
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#8B948F';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      for (let i = 0; i <= 100; i++) {
        const x = i / 100, y = cy + s * halfAt(x);
        i ? ctx.lineTo(x * W, y) : ctx.moveTo(x * W, y);
      }
      ctx.stroke();
    }
    /* ось */
    ctx.setLineDash([7, 4, 2, 4]); ctx.lineWidth = 1; ctx.strokeStyle = '#C9CFCB';
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();
    ctx.setLineDash([]);

    /* Линии тока. Длина штриха пропорциональна местной скорости: в горле
       штрихи вдвое длиннее и гуще — это и есть видимое доказательство того,
       что при том же расходе скорость выросла. */
    const wide = halfAt(0), narrow = halfAt(1);
    for (const p of parts) {
      const k = wide / halfAt(p.x);          /* во сколько раз быстрее сечения 1—1 */
      p.x += 0.0016 * o.speed * k;
      if (p.x > 1.10) { p.x = -0.12; p.lane = Math.random() * 2 - 1; }
      const len = p.len * (0.7 + k * 0.75);  /* штрих растягивается со скоростью */
      const grad = ctx.createLinearGradient((p.x - len) * W, 0, p.x * W, 0);
      grad.addColorStop(0, 'rgba(27,76,134,0)');
      grad.addColorStop(1, o.color);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.4 + k * 0.5;
      ctx.beginPath();
      for (let i = 0; i <= 16; i++) {
        const x = p.x - len + (len * i / 16);
        if (x < 0 || x > 1) continue;
        const y = cy + p.lane * halfAt(x) * 0.86;
        i ? ctx.lineTo(x * W, y) : ctx.moveTo(x * W, y);
      }
      ctx.stroke();
    }

    /* Выносные размеры в обоих сечениях: диаметр и во сколько раз скорость */
    const ratio = (wide / narrow);
    callout(0.16, 'Ø 1,0', 'v = 1,0');
    callout(0.86, 'Ø ' + (narrow / wide).toFixed(2).replace('.', ','),
                  'v = ' + ratio.toFixed(1).replace('.', ',') + '×');
    t++;
    if (running) raf = requestAnimationFrame(draw);
  }

  function start() { if (!running && !reduced.matches) { running = true; raf = requestAnimationFrame(draw); } }
  function stop()  { running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  resize(); seed(); draw();
  addEventListener('resize', () => { resize(); seed(); if (!running) draw(); }, {passive:true});
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  new IntersectionObserver(es => es[0].isIntersecting ? start() : stop(), {threshold:0.15}).observe(canvas);
  return {start, stop};
}

/* ═══ 7. Размерные линии: прочерчиваются при появлении ════════════════ */
function revealDims() {
  const items = $$('.dim .line');
  if (!items.length) return;
  if (reduced.matches) { items.forEach(l => l.style.transform = 'scaleX(1)'); return; }
  items.forEach(l => { l.style.transform = 'scaleX(0)'; l.style.transition = 'transform .7s var(--ease)'; });
  new IntersectionObserver((es, io) => {
    for (const e of es) if (e.isIntersecting) { e.target.style.transform = 'scaleX(1)'; io.unobserve(e.target); }
  }, {threshold:0.4}).observe ? items.forEach(l => {
    const io = new IntersectionObserver((es, obs) => {
      for (const e of es) if (e.isIntersecting) { e.target.style.transform = 'scaleX(1)'; obs.unobserve(e.target); }
    }, {threshold:0.4});
    io.observe(l);
  }) : null;
}

/* ═══ 8. Общий запуск ════════════════════════════════════════════════ */
/* Иконка вкладки. Без неё браузер на каждой странице просит /favicon.ico
   и получает 404. Рисуем встроенным SVG: улитка радиального вентилятора
   приборным синим — узнаётся в ряду вкладок. */
function mountIcon() {
  if ($('link[rel="icon"]')) return;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    '<rect width="32" height="32" fill="%23FBFCFA"/>' +
    '<g fill="none" stroke="%231B4C86" stroke-width="2.2" stroke-linecap="round">' +
    '<path d="M20 16a6 6 0 0 0-5.5-6A7.5 7.5 0 0 0 7 16a9 9 0 0 0 7.5 8.8A10.5 10.5 0 0 0 25 16V5"/>' +
    '<path d="M20 16V5"/></g>' +
    '<circle cx="14.5" cy="16" r="2.4" fill="%23D9540B"/></svg>';
  const l = document.createElement('link');
  l.rel = 'icon';
  l.type = 'image/svg+xml';
  l.href = 'data:image/svg+xml,' + svg.replace(/#/g, '%23').replace(/"/g, "'");
  document.head.appendChild(l);
}

function init(currentPage) {
  mountIcon();
  mountHeader(currentPage);
  mountFooter();
  revealDims();
}

root.VP = {$, $$, ICON, BIG, store, init, airflow, reduced, revealDims, paintCounts,
           toggleViewed, resolve};
})(window);
