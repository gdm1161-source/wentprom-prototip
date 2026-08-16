/* ═══════════════════════════════════════════════════════════════════════
   ВЕНТПРОМ 2026 · assets/vent2026-nav.js

   Достраивает шапку, которую уже собрал VP.init() (assets/vp.js), — сама
   шапка не трогается ни строкой, скрипт только вешает мега-меню на
   существующие ссылки навигации и раскладывает значки категорий по
   сетке разделов. Список категорий и их названия берёт из VPCAT.RAZDEL —
   того же модуля данных, что рисует сетку каталога, поэтому рассинхрона
   между меню и сеткой быть не может: правится один источник.

   Три задачи:
   1. Ссылка «Каталог» в шапке становится мега-меню — все разделы разом,
      с иконкой и счётчиком, вместо одного плоского перехода.
   2. Три соседних пункта («Подбор», «Калькуляторы», «Опросный лист»)
      сворачиваются в один выпадающий список «Инженеру» — по требованию
      «побольше выпадающих меню для удобства».
   3. Ровно одной плитке — «Противопожарная вентиляция» — достаётся
      красный значок с огнём. Красный больше нигде не встречается: он
      держит один сигнал на весь сайт, как на настоящем пожарном щите.
   ═══════════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const FLAME = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2c1 3-2 4-2 7a4 4 0 0 0 8 0c0-1-.5-2-1-2.5.7 2-.6 3-1.6 2
      C14.6 7.7 16 6 15 4c1.5 1 4 4 4 7.5A7 7 0 0 1 12 22a7 7 0 0 1-7-7.5
      C5 10 8 8.5 8 6c0 1.2.7 2 1.5 2C10.3 8 9.7 5.5 12 2Z"
      fill="currentColor"/></svg>`;

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  /* ═══ 1–2. Мега-меню и групповой дропдаун в шапке ════════════════════ */
  function buildHeaderMenus() {
    const nav = document.querySelector('.nav');
    if (!nav) return false; // шапка ещё не смонтирована — подождём
    const C = window.VPCAT;
    const ICON = window.VP && window.VP.ICON;
    if (!C) return true; // шапка есть, но данных каталога на этой странице нет — меню не строим

    const catLink = nav.querySelector('a[href^="catalog.html"]');
    if (catLink && !catLink.closest('.v26-drop')) {
      const wrap = document.createElement('div');
      wrap.className = 'v26-drop';
      catLink.replaceWith(wrap);
      wrap.appendChild(catLink);
      catLink.setAttribute('aria-haspopup', 'true');
      catLink.setAttribute('aria-expanded', 'false');

      const CN = C.counts();
      const plural = (n, a, b, c) => {
        const m = n % 100, k = n % 10;
        return n + ' ' + (m >= 11 && m <= 14 ? c : k === 1 ? a : k >= 2 && k <= 4 ? b : c);
      };
      const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

      const mega = document.createElement('div');
      mega.className = 'v26-mega';
      mega.innerHTML = `
        <div class="v26-mega-grid">${C.RAZDEL.map(r => {
          const c = CN.razdel[r.id];
          const fire = r.id === 'ppv' ? ' data-fire="1"' : '';
          const ic = ICON && ICON[r.ic] ? ICON[r.ic] : (r.id === 'ppv' ? FLAME : '');
          const sub = c && !c.stub && c.sku
            ? plural(c.sku, 'типоразмер', 'типоразмера', 'типоразмеров')
            : 'номенклатура уточняется';
          return `<a class="v26-mega-link" href="razdel.html?r=${encodeURIComponent(r.id)}"${fire}>
            <span class="ic">${ic}</span>
            <span><b>${esc(r.n)}</b><span>${sub}</span></span>
          </a>`;
        }).join('')}</div>
        <div class="v26-mega-foot">
          <span>${plural(C.RAZDEL.length, 'раздел', 'раздела', 'разделов')} завода одним взглядом</span>
          <a href="catalog.html">Открыть каталог целиком →</a>
        </div>`;
      wrap.appendChild(mega);
    }

    /* Группируем «Подбор / Калькуляторы / Опросный лист» в один дропдаун */
    const groupHrefs = ['podbor.html', 'calc.html', 'podbor.html#survey'];
    const groupLinks = groupHrefs
      .map(h => nav.querySelector(`.nav > a[href="${h}"]`))
      .filter(Boolean);
    if (groupLinks.length >= 2 && !nav.querySelector('.v26-drop--eng')) {
      const wrap = document.createElement('div');
      wrap.className = 'v26-drop v26-drop--eng';
      const trigger = document.createElement('a');
      trigger.href = groupLinks[0].getAttribute('href');
      trigger.textContent = 'Инженеру';
      trigger.setAttribute('aria-haspopup', 'true');
      trigger.setAttribute('aria-expanded', 'false');
      groupLinks[0].replaceWith(wrap);
      wrap.appendChild(trigger);

      const simple = document.createElement('div');
      simple.className = 'v26-simple';
      simple.innerHTML = groupLinks.map(a => a.outerHTML).join('');
      wrap.appendChild(simple);
      for (const a of groupLinks.slice(1)) a.remove();
    }

    wireDropdowns(nav);
    return true;
  }

  function wireDropdowns(nav) {
    const drops = nav.querySelectorAll('.v26-drop');
    const closeAll = except => {
      for (const d of drops) {
        if (d === except) continue;
        d.dataset.open = '0';
        d.querySelector('a')?.setAttribute('aria-expanded', 'false');
      }
    };
    for (const d of drops) {
      const trigger = d.querySelector(':scope > a');
      const open = on => {
        d.dataset.open = on ? '1' : '0';
        trigger.setAttribute('aria-expanded', String(on));
        if (on) closeAll(d);
      };
      d.addEventListener('mouseenter', () => open(true));
      d.addEventListener('mouseleave', () => open(false));
      trigger.addEventListener('click', e => {
        // Ссылка остаётся рабочей (переход на её href), меню — только
        // по клавиатуре/тачу, где hover не работает.
        if (matchMedia('(hover: hover)').matches) return;
        e.preventDefault();
        open(d.dataset.open !== '1');
      });
      trigger.addEventListener('focus', () => open(true));
    }
    document.addEventListener('click', e => {
      if (!e.target.closest('.v26-drop')) closeAll(null);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeAll(null);
    });
  }

  /* ═══ 3. Значок «Противопожарное» на плитках раздела/каталога ═══════ */
  function badgeTiles() {
    const tiles = document.querySelectorAll(
      'a.tile[href$="r=ppv"], a.tile[href*="r=ppv&"], button.tile[data-r="ppv"], button.tile--pick[data-s="ppv"]'
    );
    for (const t of tiles) {
      if (t.dataset.fire === '1') continue;
      t.dataset.fire = '1';
      const b = document.createElement('span');
      b.className = 'v26-badge';
      b.innerHTML = `${FLAME}<span>Противопожарное</span>`;
      t.appendChild(b);
    }
  }

  /* ═══ Плавное появление сетки плиток при первой отрисовке ═══════════ */
  function revealTiles() {
    if (reduced.matches) return;
    for (const grid of document.querySelectorAll('.tiles')) {
      if (grid.dataset.revealDone === '1' || !grid.children.length) continue;
      grid.dataset.revealDone = '1';
      grid.dataset.reveal = '1';
      [...grid.children].forEach((el, i) => el.style.setProperty('--i', i));
    }
  }

  /* Сетка и шапка строятся инлайновым скриптом страницы синхронно при
     загрузке; этот файл подключён последним, так что обычно всё уже на
     месте. На случай другого порядка скриптов — подстрахуемся коротким
     набором повторов через кадр, который сам остановится, как только
     увидит нужные узлы. Общий MutationObserver на document.body здесь
     не годится: на razdel.html виртуализированная таблица перестраивает
     tbody на каждый кадр скролла, и наблюдатель дёргал бы badgeTiles()
     на пустом месте — плитка «ppv» на этой странице вообще не рендерится,
     карточка раздела остаётся только в шапке каталога и в мега-меню. */
  function boot() {
    let tries = 0;
    const tick = () => {
      const headerDone = buildHeaderMenus();
      badgeTiles();
      revealTiles();
      tries++;
      if ((!headerDone || !document.querySelector('.tile')) && tries < 40) {
        requestAnimationFrame(tick);
      }
    };
    tick();
  }

  ready(boot);
})();
