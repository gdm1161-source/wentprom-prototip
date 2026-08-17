/* ═══════════════════════════════════════════════════════════════════════
   ВЕНТПРОМ 2026 · assets/vent2026-wheel.js

   Превращает плоский список разделов каталога на главной в карусель:
   тринадцать карточек по окружности, медленное движение по кругу,
   остановка под курсором и по фокусу с клавиатуры.

   Разметку не выдумывает: берёт те же VPDATA.GROUPS, что рисовали список
   до него, и те же силуэты, что стоят в каталоге. Если данных или места
   для колеса нет — молча не вмешивается, и на странице остаётся то, что
   там было.

   Радиус считается, а не подбирается: при n карточках шириной w сумма
   их «долей» окружности не должна перекрываться, откуда
       R = (w/2 + зазор) / tan(π / n).
   При жёстко вписанном радиусе тринадцать карточек налезали бы друг на
   друга, а при пяти — стояли бы неоправданно далеко.
   ═══════════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const CARD_W = 182;   // ширина карточки, синхронно с --wh-w в CSS
  const GAP = 26;       // просвет между соседними карточками по дуге
  const TILT = 3.2;     // максимальный собственный наклон карточки, градусы

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const plural = (n, a, b, c) => {
    const m = n % 100, k = n % 10;
    return n + ' ' + (m >= 11 && m <= 14 ? c : k === 1 ? a : k >= 2 && k <= 4 ? b : c);
  };

  /* Силуэт берётся защитно, той же цепочкой, что в каталоге: собственный
     крупный силуэт → крупный силуэт системы → иконка, растянутая под
     размер медальона. Файл силуэтов собирается отдельно и может не
     доехать — страница обязана открыться и без него. */
  function silh(keys) {
    const VP = window.VP || {};
    for (const k of keys) if (window.VPSILH && window.VPSILH[k]) return window.VPSILH[k];
    for (const k of keys) if (VP.BIG && VP.BIG[k]) return VP.BIG[k];
    for (const k of keys) if (VP.ICON && VP.ICON[k]) {
      return VP.ICON[k].replace(/width="[\d.]+" height="[\d.]+"/, 'width="64" height="56"');
    }
    return '';
  }

  /* Форма изделия по разделу — та же таблица соответствий, что в каталоге,
     чтобы плитка на главной и плитка в каталоге узнавались как одна вещь. */
  const SILH = {
    obshch:['radial', 'scroll1'], vent:['heavy', 'scroll5'], pvu:['ahu'],
    kkr:['ductk', 'ductround'], kpr:['ductext', 'ductk'], ppv:['fire', 'damper'],
    avt:['panel'], tep:['heat'], det:['draft'], vzd:['duct'],
    vrp:['grille'], flt:['filter'], krp:['fix'],
  };

  function build() {
    const host = document.getElementById('groups');
    if (!host || host.dataset.wheel === '1') return true;
    const D = window.VPDATA;
    if (!D || !D.GROUPS || !D.GROUPS.length) return false;

    /* Сколько позиций у раздела реально есть в полном каталоге. VPDATA
       несёт счётчик действующего сайта, VPCAT — заводские таблицы; где
       таблиц нет, честно говорим «уточняется», а не показываем ноль. */
    const C = window.VPCAT;
    const CN = C ? C.counts() : null;

    const n = D.GROUPS.length;
    const R = Math.round((CARD_W / 2 + GAP) / Math.tan(Math.PI / n));
    const step = 360 / n;

    const cards = D.GROUPS.map((g, i) => {
      const c = CN && CN.razdel[g.id];
      const empty = c ? (c.stub || !c.sku) : false;
      /* Наклон чередуется и слегка гуляет по ряду: одинаковый угол у всех
         читался бы как перекошенная вёрстка, а не как живое колесо. */
      const tilt = (i % 2 ? -1 : 1) * (TILT * (0.55 + 0.45 * Math.sin(i * 1.7)));
      const cnt = c && !empty
        ? plural(c.sku, 'типоразмер', 'типоразмера', 'типоразмеров')
        : plural(g.cnt, 'позиция', 'позиции', 'позиций');

      return `<a class="v26-card" href="razdel.html?r=${encodeURIComponent(g.id)}"
          style="--a:${(i * step).toFixed(2)}deg; --tilt:${tilt.toFixed(2)}deg"
          ${empty ? 'data-empty="1"' : ''}${g.id === 'ppv' ? ' data-fire="1"' : ''}
          title="${esc(g.n)}">
        <span class="well">${silh(SILH[g.id] || [g.ic])}</span>
        <span class="nm">${g.s}</span>
        <span class="cn">${cnt}</span>
      </a>`;
    }).join('');

    host.classList.add('v26-wheel');
    host.style.setProperty('--wh-r', R + 'px');
    host.style.setProperty('--wh-w', CARD_W + 'px');
    host.innerHTML = `<div class="v26-ring">${cards}</div>`;
    host.dataset.wheel = '1';

    /* Подсказка ставится рядом с колесом, а не внутрь него: внутри она
       ехала бы вместе с кольцом. */
    if (!document.querySelector('.v26-wheel-hint')) {
      const hint = document.createElement('p');
      hint.className = 'v26-wheel-hint';
      hint.innerHTML = '<b>Наведите курсор</b> — вращение остановится, ' +
                       'карточка откроет свой раздел каталога.';
      host.insertAdjacentElement('afterend', hint);
    }
    return true;
  }

  function boot() {
    let tries = 0;
    const tick = () => { if (!build() && ++tries < 60) requestAnimationFrame(tick); };
    tick();
  }

  if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
