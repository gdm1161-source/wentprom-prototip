/* ВЕНТПРОМ · общий каркас: шапка, мега-меню, поиск, состояние пользователя.
   Ванильный ES-модуль, без зависимостей. Подключать так:
     <script type="module">import {mountShell} from './assets/shell.js';
       mountShell({page:'catalog'});</script>                              */

import { COMPANY, GROUPS, SUBGROUPS, SERIES, seriesById, normMark } from './data.js';

/* ═══ 1. Состояние пользователя ═══════════════════════════════
   Ключевое архитектурное решение: состояние существует ДО
   регистрации. Аноним подбирает и сравнивает, всё живёт локально
   под client_id; регистрация только поднимает это в облако.       */

const KEY = 'wp.state.v1';
const blank = () => ({
  clientId: 'a-' + Math.random().toString(36).slice(2, 10),
  user: null,                 // {name, org, email} после «входа»
  selections: [],             // сохранённые подборы
  projects: [],               // объекты
  favorites: [],              // избранное
  compare: [],                // до 4 позиций
  viewed: [],                 // лента просмотров
  quotes: [],                 // запросы КП
  calcs: []                   // сохранённые расчёты калькуляторов
});

function load(){
  try{
    const raw = JSON.parse(localStorage.getItem(KEY));
    return raw && raw.clientId ? { ...blank(), ...raw } : blank();
  }catch{ return blank(); }
}

export const store = {
  data: load(),
  save(){
    try{ localStorage.setItem(KEY, JSON.stringify(this.data)); }catch{}
    window.dispatchEvent(new CustomEvent('wp:state', { detail:this.data }));
  },
  /* — обязательство и последовательность: каждый микро-шаг фиксируется — */
  addSelection(sel){
    this.data.selections.unshift({ id:'s' + Date.now(), at:new Date().toISOString(), ...sel });
    this.data.selections = this.data.selections.slice(0, 200);
    this.save(); return this.data.selections[0];
  },
  removeSelection(id){
    this.data.selections = this.data.selections.filter(s => s.id !== id); this.save();
  },
  toggleCompare(item){
    const i = this.data.compare.findIndex(c => c.id === item.id);
    if(i >= 0) this.data.compare.splice(i, 1);
    else{ if(this.data.compare.length >= 4) this.data.compare.shift(); this.data.compare.push(item); }
    this.save(); return i < 0;
  },
  inCompare(id){ return this.data.compare.some(c => c.id === id); },
  toggleFavorite(item){
    const i = this.data.favorites.findIndex(f => f.id === item.id);
    if(i >= 0) this.data.favorites.splice(i, 1); else this.data.favorites.unshift(item);
    this.save(); return i < 0;
  },
  isFavorite(id){ return this.data.favorites.some(f => f.id === id); },
  view(item){
    this.data.viewed = this.data.viewed.filter(v => v.id !== item.id);
    this.data.viewed.unshift({ ...item, at:Date.now() });
    this.data.viewed = this.data.viewed.slice(0, 40); this.save();
  },
  addCalc(rec){
    this.data.calcs.unshift({ id:'c' + Date.now(), at:new Date().toISOString(), ...rec });
    this.data.calcs = this.data.calcs.slice(0, 100); this.save();
  },
  addProject(name){
    const p = { id:'p' + Date.now(), name, at:new Date().toISOString(), items:[] };
    this.data.projects.unshift(p); this.save(); return p;
  },
  addQuote(q){
    this.data.quotes.unshift({ id:'КП-' + String(1000 + this.data.quotes.length + 1),
      at:new Date().toISOString(), status:'Отправлен', ...q });
    this.save(); return this.data.quotes[0];
  },
  signIn(user){ this.data.user = user; this.save(); },   // локальный вход, без сервера
  signOut(){ this.data.user = null; this.save(); },
  reset(){ this.data = blank(); this.save(); }
};

/* ═══ 2. Утилиты ══════════════════════════════════════════════ */

export const fmt = {
  n(v, d = 0){ return Number(v).toLocaleString('ru-RU',
    { minimumFractionDigits:d, maximumFractionDigits:d }); },
  q(v){ return v >= 10000 ? fmt.n(Math.round(v / 100) / 10, 1) + ' тыс.' : fmt.n(v); },
  date(iso){ return new Date(iso).toLocaleDateString('ru-RU',
    { day:'2-digit', month:'2-digit', year:'numeric' }); },
  money(v){ return fmt.n(v) + ' ₽'; }
};

export const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for(const [k, v] of Object.entries(attrs)){
    if(k === 'class') n.className = v;
    else if(k === 'html') n.innerHTML = v;
    else if(k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if(v !== false && v != null) n.setAttribute(k, v);
  }
  kids.flat().forEach(k => n.append(k?.nodeType ? k : document.createTextNode(k)));
  return n;
};

export const $  = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/** Появление блоков при прокрутке. Уважает prefers-reduced-motion. */
export function reveal(root = document){
  if(matchMedia('(prefers-reduced-motion:reduce)').matches){
    $$('.rise', root).forEach(n => n.classList.add('in')); return;
  }
  const io = new IntersectionObserver(es => es.forEach(e => {
    if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); }
  }), { rootMargin:'0px 0px -8% 0px', threshold:.05 });
  $$('.rise', root).forEach((n, i) => { n.style.transitionDelay = (i % 6) * 45 + 'ms'; io.observe(n); });
}

/* ═══ 3. Разметка каркаса ═════════════════════════════════════ */

const NAVLINKS = [
  { href:'catalog.html',  label:'Каталог',     mega:true },
  { href:'podbor.html',   label:'Подбор Q–P'  },
  { href:'calc.html',     label:'Калькуляторы' },
  { href:'flow.html',     label:'Визуализация' },
  { href:'about.html',    label:'Завод' }
];

function utilBar(){
  return `<div class="util"><div class="wrap">
    <span>${COMPANY.legal} · Ростов-на-Дону</span>
    <a href="about.html#dostavka">Доставка по 19 регионам</a>
    <a href="about.html#doc">Сертификаты и ТУ</a>
    <span class="sp"></span>
    <span>${COMPANY.hours}</span>
    <a class="tel" href="tel:88005501008">${COMPANY.phones[0]}</a>
  </div></div>`;
}

function header(page){
  const nav = NAVLINKS.map(l => l.mega
    ? `<button type="button" data-mega aria-expanded="false" aria-controls="mega">${l.label}
         <svg class="chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
           <path d="M1 3.5 5 7l4-3.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>`
    : `<a href="${l.href}"${page === l.href.replace('.html','') ? ' aria-current="page"' : ''}>${l.label}</a>`
  ).join('');

  return `<header class="head"><div class="wrap">
    <a class="logo" href="index.html">
      <b>Вентпром</b><i></i><small>Ростов-на-Дону</small>
    </a>
    <nav class="nav">${nav}</nav>
    <div class="sp"></div>
    <div class="search">
      <svg class="ico" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/>
        <path d="M11 11l4 4" stroke="currentColor" stroke-width="1.6"/></svg>
      <input type="search" id="q" placeholder="Марка, № или задача: вр80-75, 8000 м³/ч"
             autocomplete="off" aria-label="Поиск по каталогу" aria-expanded="false">
      <kbd>/</kbd>
      <div class="sugg" id="sugg" hidden role="listbox"></div>
    </div>
    <a class="btn btn-sm btn-ghost" href="cabinet.html" id="cabBtn" style="height:40px">
      <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="5.5" r="2.8" fill="none" stroke="currentColor" stroke-width="1.5"/>
        <path d="M2.6 14c.7-3 2.8-4.4 5.4-4.4S12.7 11 13.4 14" fill="none"
              stroke="currentColor" stroke-width="1.5"/></svg>
      <span id="cabLbl">Кабинет</span><span class="chip chip-sig" id="cabCnt" hidden></span></a>
    <a class="btn btn-sm btn-pri" href="podbor.html" style="height:40px">Подобрать</a>
    <button class="burger" type="button" data-mega aria-label="Каталог">
      <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true">
        <path d="M0 1h18M0 7h18M0 13h18" stroke="currentColor" stroke-width="1.8"/></svg>
    </button>
    <div class="mega" id="mega" hidden></div>
  </div></header>`;
}

function megaHTML(){
  const rail = GROUPS.map((g, i) =>
    `<button role="tab" data-g="${g.slug}" aria-selected="${i === 0}">
       ${g.name}<span class="cnt">${g.n}</span></button>`).join('');
  return `<div class="mega-in">
    <div class="mega-rail" role="tablist" aria-label="Разделы каталога">${rail}</div>
    <div class="mega-cols" id="megaCols"></div>
    <aside class="mega-promo">
      <h4>Не знаете марку?</h4>
      <p>Введите расход и потери давления — покажем серии, чья рабочая
         область накрывает вашу точку, с КПД именно в ней.</p>
      <a class="btn btn-blue btn-sm" href="podbor.html">Подбор по Q и P</a>
      <hr class="hr" style="margin:16px 0">
      <h4>Инженеру бесплатно</h4>
      <p>Аэродинамический расчёт сети, подбор сечений, спецификация
         и опросный лист — без регистрации.</p>
      <a class="btn btn-sm" href="calc.html">Открыть калькуляторы</a>
    </aside></div>`;
}

function megaCols(slug){
  const subs = SUBGROUPS[slug];
  if(subs){
    return subs.map(sub => `<div class="mega-col"><h4>${sub.name}</h4><ul>${
      sub.series.map(id => { const s = seriesById(id); return s
        ? `<li><a href="series.html?s=${s.id}">${s.mark}<span class="muted"> · ${s.nSizes} тип.</span></a></li>` : ''; }).join('')
    }</ul></div>`).join('');
  }
  const g = GROUPS.find(x => x.slug === slug);
  return `<div class="mega-col"><h4>${g.name}</h4>
    <ul><li><a href="catalog.html?g=${g.slug}">Все позиции раздела <span class="muted">· ${g.n}</span></a></li></ul>
    <p class="muted" style="font-size:13px;margin-top:12px">
      Номенклатура раздела переносится с боевого сайта: ${g.n} позиций.</p></div>`;
}

function footer(){
  const col = (h, items) => `<div><h4>${h}</h4><ul>${items.map(i => `<li>${i}</li>`).join('')}</ul></div>`;
  return `<footer class="foot"><div class="wrap">
    <div class="foot-cols">
      <div>
        <a class="logo" href="index.html" style="margin-bottom:16px">
          <b style="color:#fff">Вентпром</b><i></i><small style="color:#7A8CA1">Ростов-на-Дону</small></a>
        <p style="font-size:13.5px;max-width:34ch">Промышленные вентиляторы, вентиляционные
           установки и оборудование противопожарной вентиляции. Поставка по Югу России
           и ЦФО с 19 региональных представительств.</p>
        <p class="num" style="font-size:16px;color:#fff">${COMPANY.phones[0]}</p>
        <p style="font-size:13px">${COMPANY.hours} · <a href="mailto:${COMPANY.mails[0]}">${COMPANY.mails[0]}</a></p>
      </div>
      ${col('Каталог', GROUPS.slice(0, 6).map(g => `<a href="catalog.html?g=${g.slug}">${g.name}</a>`))}
      ${col('Инженеру', [
        '<a href="podbor.html">Подбор по Q и P</a>',
        '<a href="calc.html">Аэродинамический расчёт</a>',
        '<a href="calc.html#velocity">Скорость и сечение</a>',
        '<a href="calc.html#power">Мощность и КПД</a>',
        '<a href="flow.html">Визуализация потока</a>',
        '<a href="about.html#bim">BIM-модели Revit</a>'])}
      ${col('Кабинет', [
        '<a href="cabinet.html">Мои подборы</a>',
        '<a href="cabinet.html#projects">Объекты</a>',
        '<a href="cabinet.html#quotes">Запросы КП</a>',
        '<a href="cabinet.html#docs">Документы</a>',
        '<a href="cabinet.html#viewed">Просмотренное</a>'])}
      ${col('Завод', [
        '<a href="about.html">О предприятии</a>',
        '<a href="about.html#doc">Сертификаты, ТУ, ГОСТ</a>',
        '<a href="about.html#objects">Объекты</a>',
        '<a href="about.html#dostavka">Доставка</a>',
        '<a href="about.html#contacts">Контакты</a>'])}
    </div>
    <div class="foot-bot">
      <span>${COMPANY.legal} · ИНН ${COMPANY.inn} · ОГРН ${COMPANY.ogrn}</span>
      <span>СМК ${COMPANY.qms}</span>
      <span class="sp"></span>
      <span>Прототип нового сайта. Часть данных демонстрационная.</span>
    </div></div></footer>`;
}

/* ═══ 4. Поиск, терпимый к обозначениям ═══════════════════════ */

const INDEX = [
  ...SERIES.map(s => ({ t:s.mark, s:`${s.kind} · ${s.sizes} · ${s.nSizes} тип.`,
                        u:`series.html?s=${s.id}`, k:normMark(s.mark + s.id), grp:'Серии' })),
  ...GROUPS.map(g => ({ t:g.name, s:`${g.n} позиций`, u:`catalog.html?g=${g.slug}`,
                        k:normMark(g.name), grp:'Разделы' })),
  { t:'Подбор по расходу и давлению', s:'Введите Q и P', u:'podbor.html', k:'подборqp', grp:'Инструменты' },
  { t:'Аэродинамический расчёт сети', s:'Потери давления по участкам', u:'calc.html#aero', k:'аэродинамикарасчётсети', grp:'Инструменты' },
  { t:'Скорость и сечение воздуховода', s:'Круглое и прямоугольное', u:'calc.html#velocity', k:'скоростьсечениевоздуховод', grp:'Инструменты' },
  { t:'Мощность на валу и подбор двигателя', s:'По Q, P и КПД', u:'calc.html#power', k:'мощностьдвигатель', grp:'Инструменты' },
  { t:'Законы пропорциональности', s:'Пересчёт на другие обороты', u:'calc.html#affinity', k:'пропорциональностьобороты', grp:'Инструменты' },
  { t:'Визуализация движения воздуха', s:'Профиль скорости в воздуховоде', u:'flow.html', k:'визуализацияпоток', grp:'Инструменты' }
];

function searchIt(qs){
  const q = normMark(qs);
  if(q.length < 2) return [];
  const num = qs.match(/(\d[\d\s]{2,})/);          // «8000 м³/ч» → подбор
  const out = INDEX
    .map(r => ({ r, i:r.k.indexOf(q) }))
    .filter(x => x.i >= 0)
    .sort((a, b) => a.i - b.i || a.r.t.length - b.r.t.length)
    .slice(0, 8).map(x => x.r);
  if(num && out.length < 8){
    const v = num[1].replace(/\s/g, '');
    out.unshift({ t:`Подобрать на ${fmt.n(v)} м³/ч`, s:'Открыть подбор по Q и P',
                  u:`podbor.html?q=${v}`, grp:'Инструменты' });
  }
  return out;
}

/* ═══ 5. Монтаж ═══════════════════════════════════════════════ */

export function mountShell({ page = '' } = {}){
  document.body.insertAdjacentHTML('afterbegin', utilBar() + header(page));
  document.body.insertAdjacentHTML('beforeend', footer());

  /* — мега-меню — */
  const mega = $('#mega');
  mega.innerHTML = megaHTML();
  const cols = $('#megaCols');
  const paint = slug => {
    cols.innerHTML = megaCols(slug);
    $$('.mega-rail button').forEach(b => b.setAttribute('aria-selected', b.dataset.g === slug));
  };
  paint(GROUPS[0].slug);
  $$('.mega-rail button').forEach(b => {
    const go = () => paint(b.dataset.g);
    b.addEventListener('mouseenter', go); b.addEventListener('focus', go); b.addEventListener('click', go);
  });

  let megaOpen = false, closeT;
  const setMega = on => {
    megaOpen = on; mega.hidden = false; mega.classList.toggle('open', on);
    $$('[data-mega]').forEach(b => b.setAttribute('aria-expanded', String(on)));
    if(!on) clearTimeout(closeT), closeT = setTimeout(() => { if(!megaOpen) mega.hidden = true; }, 300);
  };
  $$('[data-mega]').forEach(b => {
    b.addEventListener('click', e => { e.preventDefault(); setMega(!megaOpen); });
    b.addEventListener('mouseenter', () => { if(innerWidth > 1024) setMega(true); });
  });
  $('.head').addEventListener('mouseleave', () => { if(innerWidth > 1024) setMega(false); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && megaOpen) setMega(false); });
  document.addEventListener('click', e => {
    if(megaOpen && !e.target.closest('.mega') && !e.target.closest('[data-mega]')) setMega(false);
  });

  /* — поиск — */
  const inp = $('#q'), sugg = $('#sugg');
  let cur = -1;
  const close = () => { sugg.hidden = true; inp.setAttribute('aria-expanded', 'false'); cur = -1; };
  const draw = rows => {
    if(!rows.length) return close();
    let html = '', grp = '';
    rows.forEach((r, i) => {
      if(r.grp !== grp){ grp = r.grp; html += `<b>${grp}</b>`; }
      html += `<a href="${r.u}" role="option" data-i="${i}">${r.t}<span>${r.s}</span></a>`;
    });
    sugg.innerHTML = html; sugg.hidden = false; inp.setAttribute('aria-expanded', 'true');
  };
  inp.addEventListener('input', () => draw(searchIt(inp.value)));
  inp.addEventListener('focus', () => { if(inp.value) draw(searchIt(inp.value)); });
  inp.addEventListener('blur', () => setTimeout(close, 160));
  inp.addEventListener('keydown', e => {
    const opts = $$('a', sugg);
    if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      e.preventDefault(); if(!opts.length) return;
      cur = (cur + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
      opts.forEach((o, i) => o.classList.toggle('on', i === cur));
      opts[cur].scrollIntoView({ block:'nearest' });
    }
    if(e.key === 'Enter' && cur >= 0){ e.preventDefault(); location.href = opts[cur].href; }
    if(e.key === 'Escape') close();
  });
  document.addEventListener('keydown', e => {
    if(e.key === '/' && document.activeElement !== inp &&
       !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)){ e.preventDefault(); inp.focus(); }
  });

  /* — счётчик кабинета — */
  const sync = () => {
    const d = store.data;
    const n = d.selections.length + d.compare.length + d.quotes.length + d.calcs.length;
    const cnt = $('#cabCnt');
    cnt.hidden = !n; cnt.textContent = n;
    $('#cabLbl').textContent = d.user ? d.user.name.split(' ')[0] : 'Кабинет';
  };
  sync(); window.addEventListener('wp:state', sync);

  reveal();
  return { store, setMega };
}

/* ═══ 6. Всплывающее подтверждение действия ═══════════════════
   Принцип последовательности работает, только если микро-шаг
   виден: сохранил — сразу получил подтверждение и следующий шаг. */

let toastBox;
export function toast(text, action){
  if(!toastBox){
    toastBox = el('div', { class:'toasts' });
    toastBox.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);' +
      'z-index:200;display:grid;gap:8px;justify-items:center;pointer-events:none';
    document.body.append(toastBox);
  }
  const t = el('div', { class:'card', style:
    'pointer-events:auto;display:flex;align-items:center;gap:16px;padding:12px 16px;' +
    'box-shadow:var(--float);font-size:14px;opacity:0;transform:translateY(10px);' +
    'transition:opacity .28s var(--ease),transform .28s var(--ease)' },
    el('span', {}, text));
  if(action) t.append(el('a', { class:'btn btn-sm btn-blue', href:action.href }, action.label));
  toastBox.append(t);
  requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'none'; });
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(10px)';
                     setTimeout(() => t.remove(), 320); }, action ? 5200 : 2800);
}
