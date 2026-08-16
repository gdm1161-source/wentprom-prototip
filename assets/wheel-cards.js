/* ═══════════════════════════════════════════════════════════════════════
   ВЕНТПРОМ · assets/wheel-cards.js — фан-раскладка плиток подразделов.

   Ничего не знает о данных и не трогает существующую логику razdel.html:
   она уже построила #subs .tile к моменту, когда подключён этот файл
   (script стоит последним, после основного модуля страницы), и клики по
   плиткам обрабатывает сама страница — здесь только внешний вид.

   Приём: каждой плитке достаётся небольшой угол поворота и вертикальный
   сдвиг через CSS-переменные --rot/--lift/--delay, а раскачивает их
   keyframe-анимация в assets/atlassian-theme.css (#subs.wheel .tile).
   Наведение и фокус сами гасят анимацию и выпрямляют плитку — это уже
   в CSS, здесь только расстановка исходных углов.
   ═══════════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  function fan(subs) {
    if (!subs || subs.dataset.wheelDone === '1') return;
    const tiles = subs.querySelectorAll('.tile');
    if (!tiles.length) return;

    subs.classList.add('wheel');
    subs.dataset.wheelDone = '1';

    /* Углы по мягкой синусоиде: край наклонён сильнее, середина ряда почти
       прямая — так плитки читаются как раскрытый веер, а не как хаос. */
    const AMP = 5.5;      /* максимальный наклон, градусы */
    const LIFT = 7;       /* максимальный вертикальный сдвиг арки, px */

    tiles.forEach((t, i) => {
      const n = tiles.length;
      const k = n > 1 ? i / (n - 1) : 0.5;         /* 0…1 вдоль ряда */
      const wave = Math.sin(k * Math.PI);           /* дуга: 0 по краям, 1 в центре */
      const side = i % 2 === 0 ? 1 : -1;             /* чередование направления наклона */
      const rot = (side * AMP * (0.45 + 0.55 * (1 - wave))).toFixed(2);
      const lift = (-LIFT * wave).toFixed(2);
      t.style.setProperty('--rot', rot + 'deg');
      t.style.setProperty('--lift', lift + 'px');
      t.style.setProperty('--delay', (i * 0.22).toFixed(2) + 's');
    });
  }

  const subs = document.getElementById('subs');
  if (!subs) return;

  /* Плитки строит инлайновый скрипт страницы синхронно при загрузке — этот
     файл подключён последним, поэтому обычно они уже на месте. На случай,
     если порядок скриптов когда-нибудь поменяют, подстрахуемся
     наблюдателем: он сам отключится, как только увидит хотя бы одну плитку. */
  if (subs.querySelector('.tile')) {
    fan(subs);
  } else {
    const mo = new MutationObserver(() => {
      if (subs.querySelector('.tile')) { fan(subs); mo.disconnect(); }
    });
    mo.observe(subs, {childList: true});
  }
})();
