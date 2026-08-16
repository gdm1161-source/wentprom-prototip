/* =========================================================================
   Вентпром — AI-консультант. Сцена «вентилятор прилетел и стал инженером».
   Зависимости: GSAP core + MotionPathPlugin (оба опциональны — при их
   отсутствии index.js покажет персонажа статично).
   Экспортирует window.WentpromAIAnimation.
   ========================================================================= */

(function (global) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  /* Эталонная раскадровка в секундах. Реальная длительность приводится
     к config.introDuration через timeScale — пропорции сохраняются. */
  var BEAT = {
    appear: 0.00,
    launch: 0.15,
    flight: 2.00, // длительность самого полёта
    land: 2.15,
    burst: 2.30,
    vortex: 2.45,
    dissolve: 2.50,
    reveal: 2.62,
    settle: 3.05,
    total: 3.30,
  };

  function reducedMotion() {
    return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function el(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) node.setAttribute(k, attrs[k]);
    return node;
  }

  /* Гладкая полилиния через середины отрезков: даёт мягкую дугу шлейфа
     без изломов на каждой точке истории. */
  function smoothPath(points, count) {
    var n = Math.min(count, points.length);
    if (n < 2) return '';
    var d = 'M' + points[0].x.toFixed(1) + ' ' + points[0].y.toFixed(1);
    for (var i = 1; i < n - 1; i++) {
      var mx = (points[i].x + points[i + 1].x) / 2;
      var my = (points[i].y + points[i + 1].y) / 2;
      d += 'Q' + points[i].x.toFixed(1) + ' ' + points[i].y.toFixed(1) + ' ' + mx.toFixed(1) + ' ' + my.toFixed(1);
    }
    var last = points[n - 1];
    d += 'L' + last.x.toFixed(1) + ' ' + last.y.toFixed(1);
    return d;
  }

  function create(refs, cfg) {
    var gsap = global.gsap;
    var scene = null;         // активный timeline интро
    var idleTween = null;
    var trailTicker = null;
    var quickX = null, quickY = null;
    var onMove = null;
    var destroyed = false;

    /* ------------------------------------------------------------ утилиты */

    function isMobile() {
      return global.innerWidth <= (cfg.mobileBreakpoint || 600);
    }

    /* Точка посадки — фактический центр персонажа, а не «магические» px.
       Поэтому вентилятор садится ровно туда, откуда встанет инженер. */
    function landingPoint() {
      var r = refs.character.getBoundingClientRect();
      if (!r.width || !r.height) {
        return { x: global.innerWidth * 0.9, y: global.innerHeight * 0.86 };
      }
      return { x: r.left + r.width / 2, y: r.top + r.height * 0.52 };
    }

    function buildPoints() {
      var vw = global.innerWidth;
      var vh = global.innerHeight;
      var rel = isMobile() ? cfg.mobilePath : cfg.desktopPath;
      var pts = rel.map(function (p) { return { x: p.x * vw, y: p.y * vh }; });
      pts.push(landingPoint());
      return pts;
    }

    /* ----------------------------------------------------- воздушный шлейф */

    var history = [];

    /* Один тикер на кадр: крен по направлению движения + перерисовка шлейфа.
       rAF от GSAP, никаких setInterval (ТЗ п.27). */
    function startFlightTicker() {
      // повторный playIntro не должен оставить второй тикер на кадре
      if (trailTicker) { gsap.ticker.remove(trailTicker); trailTicker = null; }
      history.length = 0;
      var maxLen = Math.max(6, cfg.trailSegments || 18);
      var lanes = refs.trailLanes;
      var grad = refs.trailGradient;
      var withTrail = !!(cfg.trailEnabled && refs.trails);
      var prev = null;
      var bank = 0;

      if (withTrail) gsap.set(refs.trails, { opacity: 1 });

      trailTicker = function () {
        var x = gsap.getProperty(refs.fan, 'x');
        var y = gsap.getProperty(refs.fan, 'y');
        var s = gsap.getProperty(refs.fan, 'scaleX') || 1;

        // крен зависит от направления движения (ТЗ п.6), но остаётся сдержанным
        if (prev) {
          var target = Math.max(-9, Math.min(9, (y - prev.y) * 0.45 + (x - prev.x) * 0.05));
          bank += (target - bank) * 0.18;
          refs.fanBank.style.transform = 'rotate(' + bank.toFixed(2) + 'deg)';
        }
        prev = { x: x, y: y };

        if (!withTrail) return;

        history.unshift({ x: x, y: y, s: s });
        if (history.length > maxLen) history.pop();
        if (history.length < 2) return;

        // три «полосы» разной длины и толщины дают естественное сужение
        lanes[0].setAttribute('d', smoothPath(history, history.length));
        lanes[1].setAttribute('d', smoothPath(history, Math.ceil(history.length * 0.6)));
        lanes[2].setAttribute('d', smoothPath(history, Math.ceil(history.length * 0.32)));
        lanes[0].setAttribute('stroke-width', (5 * s).toFixed(1));
        lanes[1].setAttribute('stroke-width', (13 * s).toFixed(1));
        lanes[2].setAttribute('stroke-width', (24 * s).toFixed(1));

        // градиент вдоль «голова → хвост» гасит шлейф к концу
        var tail = history[history.length - 1];
        grad.setAttribute('x1', x.toFixed(1));
        grad.setAttribute('y1', y.toFixed(1));
        grad.setAttribute('x2', tail.x.toFixed(1));
        grad.setAttribute('y2', tail.y.toFixed(1));
      };
      gsap.ticker.add(trailTicker);
    }

    function stopTrail(fadeMs) {
      if (trailTicker) {
        gsap.ticker.remove(trailTicker);
        trailTicker = null;
      }
      if (!refs.trails) return;
      // ТЗ п.8: след живёт ещё ~секунду и полностью исчезает
      gsap.to(refs.trails, {
        opacity: 0,
        duration: (fadeMs || cfg.trailFadeOut || 900) / 1000,
        ease: 'power2.out',
        onComplete: function () {
          refs.trailLanes.forEach(function (p) { p.removeAttribute('d'); });
          history.length = 0;
        },
      });
    }

    /* ------------------------------------------------------------ частицы */

    function emitParticles(tl, at, points) {
      var pool = refs.particlePool;
      if (!pool || !pool.length) return;
      var count = Math.min(pool.length, cfg.particles || 12);
      var span = BEAT.flight * 0.75;

      for (var i = 0; i < count; i++) {
        var p = pool[i];
        var t = 0.2 + (i / count) * 0.7;                 // где на пути родиться
        var anchor = points[Math.min(points.length - 2, Math.floor(t * (points.length - 1)))];
        var jitterX = (i % 2 ? 1 : -1) * (12 + (i * 7) % 40);
        var jitterY = (i % 3 ? -1 : 1) * (8 + (i * 11) % 34);
        var startAt = at + span * (i / count);

        tl.fromTo(p,
          { x: anchor.x + jitterX * 0.3, y: anchor.y + jitterY * 0.3, opacity: 0, scale: 0.5 },
          {
            x: anchor.x + jitterX, y: anchor.y + jitterY,
            opacity: 0.45, scale: 1.15, duration: 0.22, ease: 'power1.out',
          }, startAt);
        tl.to(p, { opacity: 0, scale: 1.6, duration: 0.55, ease: 'power2.out' }, startAt + 0.22);
      }
    }

    /* --------------------------------------------------- посадка и вихрь */

    function placeFx(land) {
      gsap.set(refs.burst, { x: land.x, y: land.y });
      gsap.set(refs.vortex, { x: land.x, y: land.y });
    }

    /* ------------------------------------------------------------- сцена */

    function buildTimeline(onDone) {
      var points = buildPoints();
      var land = points[points.length - 1];
      var mobile = isMobile();
      placeFx(land);

      var tl = gsap.timeline({
        onComplete: function () {
          scene = null;
          startIdle();
          if (onDone) onDone();
        },
      });

      /* --- 0.00 появление вдалеке ---
         xPercent/yPercent −50: точка пути = центр вентилятора, иначе он
         сядет углом в угол экрана и уедет за границу вьюпорта. */
      gsap.set(refs.fan, {
        xPercent: -50, yPercent: -50,
        x: points[0].x, y: points[0].y,
        scale: 0.35, opacity: 0, filter: 'blur(2px)',
      });
      gsap.set(refs.fanTilt, { rotation: -15 });
      gsap.set(refs.fanBank, { rotation: 0 });

      tl.to(refs.fan, { opacity: 1, duration: 0.25, ease: 'power1.out' }, BEAT.appear + 0.1);

      /* --- 0.15 → 2.15 полёт по кривой --- */
      var flightAt = BEAT.launch;
      var flightDur = BEAT.flight;

      if (global.MotionPathPlugin) {
        tl.to(refs.fan, {
          motionPath: { path: points, curviness: cfg.curviness || 1.3, autoRotate: false },
          duration: flightDur,
          ease: 'power2.inOut',
        }, flightAt);
      } else {
        // MotionPathPlugin не загрузился — летим по ломаной, сцена не ломается
        tl.to(refs.fan, {
          keyframes: points.slice(1).map(function (p) { return { x: p.x, y: p.y }; }),
          duration: flightDur,
          ease: 'power2.inOut',
        }, flightAt);
      }

      // ощущение приближения (ТЗ п.5)
      tl.to(refs.fan, {
        keyframes: { scale: [0.35, 0.65, 0.9, 1.05, 0.95, 1], easeEach: 'power1.inOut' },
        duration: flightDur,
      }, flightAt);

      // тяжёлое промышленное покачивание, а не пропеллер (ТЗ п.6)
      tl.to(refs.fanTilt, {
        keyframes: { rotation: [-15, 8, -5, 3, 0], easeEach: 'power1.inOut' },
        duration: flightDur,
      }, flightAt);

      // намёк на motion blur только на разгоне (ТЗ п.39)
      tl.to(refs.fan, { filter: 'blur(0.5px)', duration: flightDur * 0.45, ease: 'none' }, flightAt);
      tl.to(refs.fan, { filter: 'blur(0px)', duration: flightDur * 0.3, ease: 'none' }, flightAt + flightDur * 0.6);

      if (cfg.particles) emitParticles(tl, flightAt + 0.25, points);

      /* --- 2.15 посадка: масса и пружина (ТЗ п.9) --- */
      tl.to(refs.fan, {
        keyframes: { scale: [1.06, 0.94, 1.02, 1], easeEach: 'power2.out' },
        duration: 0.34,
      }, BEAT.land);

      tl.to(refs.fan, {
        keyframes: { y: [land.y + 12, land.y - 4, land.y + 2, land.y], easeEach: 'power2.out' },
        duration: 0.34,
      }, BEAT.land);

      tl.to(refs.fanTilt, { rotation: 0, duration: 0.3, ease: 'power2.out' }, BEAT.land);

      /* --- 2.30 воздушная волна (ТЗ п.36) --- */
      tl.set(refs.burst, { opacity: 1 }, BEAT.burst);
      refs.burstRings.forEach(function (ring, i) {
        tl.fromTo(ring,
          { scale: 0.4, opacity: 0.35 },
          { scale: 1.2 + i * 0.25, opacity: 0, duration: 0.3 + i * 0.1, ease: 'power2.out' },
          BEAT.burst + i * 0.06);
      });

      /* --- 2.45 вихрь вокруг вентилятора (ТЗ п.12, фаза 2) --- */
      tl.fromTo(refs.vortex,
        { opacity: 0, scale: 0.62, rotation: -40 },
        { opacity: 0.4, scale: 1.05, rotation: 60, duration: 0.26, ease: 'power2.out' },
        BEAT.vortex);
      tl.to(refs.vortex, { opacity: 0, scale: 1.35, rotation: 130, duration: 0.34, ease: 'power2.in' },
        BEAT.vortex + 0.26);

      /* --- 2.50 вентилятор растворяется в потоке (ТЗ п.13) --- */
      tl.to(refs.fan, { scale: 1.08, duration: 0.16, ease: 'power2.out' }, BEAT.dissolve - 0.1);
      tl.to(refs.fan, { filter: 'blur(7px)', scale: 1.22, duration: 0.38, ease: 'power2.in' }, BEAT.dissolve);
      tl.to(refs.fan, { opacity: 0, duration: 0.3, ease: 'power2.in' }, BEAT.dissolve + 0.08);

      /* --- 2.62 инженер появляется из воздушного потока ---
         Кнопка держится в opacity 0 до самого reveal, иначе бейдж «AI»
         (её дочерний элемент) светится в углу ещё во время полёта. */
      gsap.set(refs.character, { opacity: 0 });
      gsap.set(refs.characterInner, { opacity: 0, scale: 0.85, y: 15, filter: 'blur(4px)' });

      tl.set(refs.character, { opacity: 1 }, BEAT.reveal);
      tl.to(refs.characterInner, { opacity: 1, filter: 'blur(0px)', duration: 0.3, ease: 'power2.out' }, BEAT.reveal);
      tl.to(refs.characterInner, { scale: 1, duration: 0.5, ease: 'back.out(1.6)' }, BEAT.reveal + 0.04);
      tl.to(refs.characterInner, { y: 0, duration: 0.5, ease: 'back.out(2.2)' }, BEAT.reveal + 0.08);

      /* --- 3.05 «встал и выпрямился»: короткое движение корпуса --- */
      tl.to(refs.characterInner, {
        keyframes: { rotation: [-1.6, 0.9, 0], easeEach: 'sine.inOut' },
        duration: 0.5,
      }, BEAT.settle);

      tl.to({}, { duration: 0.05 }, BEAT.total);

      // шлейф гаснет уже после посадки, а не мгновенно
      tl.call(function () { stopTrail(); }, null, BEAT.land + 0.12);

      // Приводим эталонную раскадровку к нужной длительности.
      // На телефоне сцена и короче по пути, и быстрее: 1.5–2.2 с (ТЗ п.22).
      var targetSec = (cfg.introDuration || 3000) / 1000;
      if (mobile) targetSec = Math.max(1.5, Math.min(2.2, targetSec * 0.65));
      tl.timeScale(BEAT.total / targetSec);

      return tl;
    }

    /* ------------------------------------------------------- публичное API */

    function playIntro(onDone) {
      if (destroyed) return;
      stopIdle();
      if (scene) { scene.kill(); scene = null; }

      if (reducedMotion() || (isMobile() && cfg.mobileAnimation === false)) {
        showInstant();
        if (onDone) onDone();
        return;
      }

      refs.root.setAttribute('data-wpai-state', 'intro');
      gsap.set(refs.character, { opacity: 0 });
      gsap.set(refs.bubble, { opacity: 0 });

      scene = buildTimeline(function () {
        refs.root.setAttribute('data-wpai-state', 'ready');
        if (onDone) onDone();
      });
      startFlightTicker();
    }

    /* Мгновенный показ: reduced-motion, повторные страницы, режим без GSAP. */
    function showInstant() {
      if (destroyed) return;
      refs.root.setAttribute('data-wpai-state', 'ready');
      if (!gsap) {
        refs.character.style.opacity = '1';
        refs.characterInner.style.opacity = '1';
        return;
      }
      gsap.set(refs.fan, { opacity: 0 });
      gsap.set(refs.character, { opacity: 1 });
      gsap.fromTo(refs.characterInner,
        { opacity: 0, scale: 0.94, y: 8 },
        { opacity: 1, scale: 1, y: 0, duration: reducedMotion() ? 0.2 : 0.45, ease: 'power2.out' });
      startIdle();
    }

    function showBubble() {
      if (destroyed || !refs.bubble || !gsap) return;
      gsap.fromTo(refs.bubble,
        { opacity: 0, scale: 0.9, y: 8 },
        { opacity: 1, scale: 1, y: 0, duration: reducedMotion() ? 0.2 : 0.4, ease: 'back.out(1.7)' });
    }

    function hideBubble() {
      if (!refs.bubble || !gsap) return;
      gsap.to(refs.bubble, { opacity: 0, scale: 0.92, duration: 0.22, ease: 'power2.in' });
    }

    /* Дыхание персонажа — почти незаметное (ТЗ п.16). */
    function startIdle() {
      if (destroyed || !cfg.idleAnimation || reducedMotion() || !gsap) return;
      stopIdle();
      idleTween = gsap.timeline({ repeat: -1, yoyo: true, defaults: { ease: 'sine.inOut' } })
        .to(refs.characterInner, { y: -2, scale: 1.01, duration: 2.6 });
    }

    function stopIdle() {
      if (idleTween) { idleTween.kill(); idleTween = null; }
      if (gsap && refs.characterInner) gsap.set(refs.characterInner, { y: 0, scale: 1 });
    }

    /* Доворот к курсору на 2–4 px — без «слежки» и прыжков (ТЗ п.17). */
    function enableCursorReaction() {
      if (destroyed || !cfg.cursorReaction || reducedMotion() || !gsap) return;
      if (onMove) return;
      if (global.matchMedia && !global.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

      quickX = gsap.quickTo(refs.character, 'x', { duration: 0.5, ease: 'power2.out' });
      quickY = gsap.quickTo(refs.character, 'y', { duration: 0.5, ease: 'power2.out' });

      onMove = function (e) {
        var r = refs.character.getBoundingClientRect();
        var cx = r.left + r.width / 2;
        var cy = r.top + r.height / 2;
        var dx = e.clientX - cx;
        var dy = e.clientY - cy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var reach = 280;
        if (dist > reach) { quickX(0); quickY(0); return; }
        var k = (1 - dist / reach) * 4; // максимум 4 px
        quickX((dx / (dist || 1)) * k);
        quickY((dy / (dist || 1)) * k);
      };
      global.addEventListener('mousemove', onMove, { passive: true });
    }

    function destroy() {
      destroyed = true;
      if (scene) { scene.kill(); scene = null; }
      stopIdle();
      if (trailTicker && gsap) { gsap.ticker.remove(trailTicker); trailTicker = null; }
      if (onMove) { global.removeEventListener('mousemove', onMove); onMove = null; }
    }

    return {
      playIntro: playIntro,
      showInstant: showInstant,
      showBubble: showBubble,
      hideBubble: hideBubble,
      startIdle: startIdle,
      stopIdle: stopIdle,
      enableCursorReaction: enableCursorReaction,
      destroy: destroy,
      reducedMotion: reducedMotion,
      isRunning: function () { return !!scene; },
    };
  }

  global.WentpromAIAnimation = {
    create: create,
    reducedMotion: reducedMotion,
    BEAT: BEAT,
    svg: el,
  };
})(window);
