/* ═══════════════════════════════════════════════════════════════════════
   ВЕНТПРОМ 2026 · assets/vent2026-nav.js

   Достраивает шапку, которую уже собрал VP.init() (assets/vp.js), — сама
   шапка не трогается ни строкой, скрипт только вешает выпадающие меню на
   существующие ссылки навигации и раскладывает значки категорий.
   Список разделов и подразделов берётся из VPCAT — того же модуля данных,
   что рисует сетку каталога, поэтому меню не может разойтись с сайтом.

   Меню «Каталог» построено двухпанельным, как на atlassian.com: слева
   рейка из 13 разделов, справа — подразделы того, на который наведён
   курсор. Один разворот показывает всю глубину каталога, не уводя со
   страницы; наведение переключает правую панель без единого клика.

   Три задачи:
   1. «Каталог» → двухпанельное мега-меню по наведению.
   2. «Подбор / Калькуляторы / Опросный лист» → один список «Инженеру».
   3. Красный значок с огнём ровно одной категории — противопожарной.
   ═══════════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const hoverable = matchMedia('(hover: hover)');

  const FLAME = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M12 2c1 3-2 4-2 7a4 4 0 0 0 8 0c0-1-.5-2-1-2.5.7 2-.6 3-1.6 2
      C14.6 7.7 16 6 15 4c1.5 1 4 4 4 7.5A7 7 0 0 1 12 22a7 7 0 0 1-7-7.5
      C5 10 8 8.5 8 6c0 1.2.7 2 1.5 2C10.3 8 9.7 5.5 12 2Z"
      fill="currentColor"/></svg>`;

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const plural = (n, a, b, c) => {
    const m = n % 100, k = n % 10;
    return n + ' ' + (m >= 11 && m <= 14 ? c : k === 1 ? a : k >= 2 && k <= 4 ? b : c);
  };
  const nsku = n => plural(n, 'типоразмер', 'типоразмера', 'типоразмеров');

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  /* ═══ 1. Двухпанельное меню «Каталог» ════════════════════════════════ */
  function buildMega(catLink) {
    const C = window.VPCAT;
    const ICON = (window.VP && window.VP.ICON) || {};
    const CN = C.counts();

    const wrap = document.createElement('div');
    wrap.className = 'v26-drop v26-drop--mega';
    catLink.replaceWith(wrap);
    wrap.appendChild(catLink);
    catLink.setAttribute('aria-haspopup', 'true');
    catLink.setAttribute('aria-expanded', 'false');

    /* Левая рейка: все разделы. Раздел без заводских таблиц не
       притворяется полным — он приглушён и говорит об этом прямо,
       ровно как плитка в самом каталоге. */
    const rail = C.RAZDEL.map((r, i) => {
      const c = CN.razdel[r.id];
      const empty = c.stub || !c.sku;
      return `<button class="v26-rail-item" type="button" role="tab"
          data-r="${esc(r.id)}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}"
          ${empty ? 'data-empty="1"' : ''}${r.id === 'ppv' ? ' data-fire="1"' : ''}>
        <span class="nm">${esc(r.short)}</span>
        <span class="cn">${empty ? 'уточняется' : nsku(c.sku)}</span>
      </button>`;
    }).join('');

    /* Правая панель: подразделы выбранного раздела. Строим все панели
       сразу — их 13, это дёшево, зато переключение мгновенное и не
       зависит от сети. */
    const panels = C.RAZDEL.map((r, i) => {
      const c = CN.razdel[r.id];
      const empty = c.stub || !c.sku;
      const subs = C.SUB.filter(s => s.razdel === r.id);
      const ic = ICON[r.ic] || (r.id === 'ppv' ? FLAME : '');

      const items = subs.map(s => {
        const sc = CN.sub[s.id];
        const sEmpty = !sc || !sc.sku;
        const href = empty
          ? `razdel.html?r=${encodeURIComponent(r.id)}`
          : `razdel.html?r=${encodeURIComponent(r.id)}&s=${encodeURIComponent(s.id)}`;
        return `<a class="v26-sub" href="${href}"${sEmpty ? ' data-empty="1"' : ''}>
          <b>${esc(s.short)}</b>
          <span>${sEmpty ? 'номенклатура уточняется' : nsku(sc.sku)}</span>
        </a>`;
      }).join('');

      return `<div class="v26-panel" role="tabpanel" data-r="${esc(r.id)}"
          ${i === 0 ? '' : 'hidden'} aria-label="${esc(r.name)}">
        <div class="v26-panel-head">
          <span class="ic"${r.id === 'ppv' ? ' data-fire="1"' : ''}>${ic}</span>
          <div>
            <b>${esc(r.name)}</b>
            <span>${empty
              ? 'Заводских таблиц по разделу пока нет'
              : `${plural(subs.length, 'подраздел', 'подраздела', 'подразделов')} · ${nsku(c.sku)}`}</span>
          </div>
        </div>
        <div class="v26-subs">${items}</div>
        <div class="v26-panel-foot">
          <a href="razdel.html?r=${encodeURIComponent(r.id)}">Открыть раздел целиком →</a>
        </div>
      </div>`;
    }).join('');

    /* .v26-mega несёт только отступ-мост до панели: без него курсор,
       идущий от ссылки вниз, пересекает пустоту, выходит из .v26-drop
       и меню захлопывается прямо под рукой. Видимый зазор остаётся,
       но он внутри элемента и потому проходим. */
    const mega = document.createElement('div');
    mega.className = 'v26-mega';
    mega.innerHTML = `<div class="v26-mega-in">
      <div class="v26-rail" role="tablist" aria-label="Разделы каталога">${rail}</div>
      <div class="v26-panels">${panels}</div>
    </div>`;
    wrap.appendChild(mega);

    /* Наведение на раздел слева меняет правую панель. Клик по разделу
       уводит в него — рейка остаётся навигацией, а не только фильтром. */
    const rails = [...mega.querySelectorAll('.v26-rail-item')];
    const pans = [...mega.querySelectorAll('.v26-panel')];
    const show = id => {
      for (const b of rails) {
        const on = b.dataset.r === id;
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
      }
      for (const p of pans) p.hidden = p.dataset.r !== id;
    };
    for (const b of rails) {
      b.addEventListener('mouseenter', () => show(b.dataset.r));
      b.addEventListener('focus', () => show(b.dataset.r));
      b.addEventListener('click', () => {
        location.href = 'razdel.html?r=' + encodeURIComponent(b.dataset.r);
      });
      /* Стрелки вверх/вниз ходят по рейке — это заявленный role="tablist" */
      b.addEventListener('keydown', e => {
        const i = rails.indexOf(b);
        let j = -1;
        if (e.key === 'ArrowDown') j = (i + 1) % rails.length;
        if (e.key === 'ArrowUp') j = (i - 1 + rails.length) % rails.length;
        if (j < 0) return;
        e.preventDefault();
        rails[j].focus();
        show(rails[j].dataset.r);
      });
    }
    return wrap;
  }

  /* ═══ 2. Групповой список «Инженеру» ════════════════════════════════ */
  function buildEngineerDrop(nav) {
    const hrefs = ['podbor.html', 'calc.html', 'podbor.html#survey'];
    const links = hrefs.map(h => nav.querySelector(`.nav > a[href="${h}"]`)).filter(Boolean);
    if (links.length < 2 || nav.querySelector('.v26-drop--eng')) return null;

    const wrap = document.createElement('div');
    wrap.className = 'v26-drop v26-drop--eng';
    const trigger = document.createElement('a');
    trigger.href = links[0].getAttribute('href');
    trigger.textContent = 'Инженеру';
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    links[0].replaceWith(wrap);
    wrap.appendChild(trigger);

    const simple = document.createElement('div');
    simple.className = 'v26-simple';
    simple.innerHTML = `<div class="v26-simple-in">${links.map(a => a.outerHTML).join('')}</div>`;
    wrap.appendChild(simple);
    for (const a of links.slice(1)) a.remove();
    return wrap;
  }

  /* ═══ Открытие/закрытие с задержкой ══════════════════════════════════
     Мгновенное закрытие по mouseleave делает меню нервным: чуть срезал
     угол — панель исчезла. Держим её ещё 220 мс, за это время курсор
     успевает вернуться. */
  function wire(nav) {
    const drops = [...nav.querySelectorAll('.v26-drop')];
    let timer = 0;

    const setOpen = (d, on) => {
      d.dataset.open = on ? '1' : '0';
      d.querySelector(':scope > a').setAttribute('aria-expanded', String(on));
    };
    const closeAll = except => {
      for (const d of drops) if (d !== except) setOpen(d, false);
    };
    const open = d => {
      clearTimeout(timer);
      closeAll(d);
      setOpen(d, true);
    };
    const closeSoon = d => {
      clearTimeout(timer);
      timer = setTimeout(() => setOpen(d, false), 220);
    };

    for (const d of drops) {
      const trigger = d.querySelector(':scope > a');
      d.addEventListener('mouseenter', () => { if (hoverable.matches) open(d); });
      d.addEventListener('mouseleave', () => { if (hoverable.matches) closeSoon(d); });
      trigger.addEventListener('focus', () => open(d));
      /* Без мыши (тач, клавиатура) первый тап раскрывает, второй уводит
         по ссылке — иначе на телефоне меню недостижимо. */
      trigger.addEventListener('click', e => {
        if (hoverable.matches) return;
        if (d.dataset.open !== '1') { e.preventDefault(); open(d); }
      });
      d.addEventListener('focusout', e => {
        if (!d.contains(e.relatedTarget)) closeSoon(d);
      });
    }

    document.addEventListener('click', e => {
      if (!e.target.closest('.v26-drop')) closeAll(null);
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      const open = drops.find(d => d.dataset.open === '1');
      if (!open) return;
      setOpen(open, false);
      open.querySelector(':scope > a').focus();
    });
  }

  function buildHeaderMenus() {
    const nav = document.querySelector('.nav');
    if (!nav) return false;                 // шапка ещё не смонтирована
    if (!window.VPCAT) return true;         // на этой странице данных каталога нет
    if (nav.dataset.v26 === '1') return true;

    const catLink = nav.querySelector('a[href^="catalog.html"]');
    if (catLink && !catLink.closest('.v26-drop')) buildMega(catLink);
    buildEngineerDrop(nav);
    wire(nav);
    nav.dataset.v26 = '1';
    return true;
  }

  /* ═══ 3. Значок противопожарной категории на плитках ════════════════ */
  function badgeTiles() {
    const sel = 'a.tile[href$="r=ppv"], a.tile[href*="r=ppv&"], button.tile[data-r="ppv"]';
    for (const t of document.querySelectorAll(sel)) {
      if (t.dataset.fire === '1') continue;
      t.dataset.fire = '1';
      const b = document.createElement('span');
      b.className = 'v26-badge';
      b.innerHTML = `${FLAME}<span>Противопожарное</span>`;
      t.appendChild(b);
    }
  }

  /* ═══ Появление сетки плиток при первой отрисовке ═══════════════════ */
  function revealTiles() {
    if (reduced.matches) return;
    for (const grid of document.querySelectorAll('.tiles')) {
      if (grid.dataset.revealDone === '1' || !grid.children.length) continue;
      grid.dataset.revealDone = '1';
      grid.dataset.reveal = '1';
      [...grid.children].forEach((el, i) => el.style.setProperty('--i', i));
    }
  }

  /* Шапку и сетку строит инлайновый скрипт страницы синхронно; этот файл
     подключён последним, так что обычно всё уже на месте. Подстраховка
     повторами через кадр останавливается, как только всё найдено. */
  function boot() {
    let tries = 0;
    const tick = () => {
      const done = buildHeaderMenus();
      badgeTiles();
      revealTiles();
      if ((!done || !document.querySelector('.tile')) && ++tries < 40) {
        requestAnimationFrame(tick);
      }
    };
    tick();
  }

  ready(boot);
})();
