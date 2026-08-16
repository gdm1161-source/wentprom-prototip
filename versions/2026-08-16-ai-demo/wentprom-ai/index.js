/* =========================================================================
   Вентпром — AI-консультант. Загрузчик, разметка, окно чата, публичное API.
   Ничего не знает о вёрстке сайта: создаёт собственный слой поверх страницы
   и общается с остальным кодом только через WentpromAI.* и CustomEvent.
   ========================================================================= */

(function (global, document) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var LAYER_ID = 'wentprom-ai-animation-layer';

  /* Путь к папке модуля — чтобы ассеты и styles.css находились сами,
     где бы модуль ни лежал (/local/, /bitrix/templates/…, CDN). */
  var BASE = (function () {
    var s = document.currentScript;
    if (s && s.src) return s.src.replace(/[^/]*$/, '');
    var all = document.getElementsByTagName('script');
    for (var i = all.length - 1; i >= 0; i--) {
      if (all[i].src && /wentprom-ai[^/]*\/index\.js/.test(all[i].src)) return all[i].src.replace(/[^/]*$/, '');
    }
    return '/wentprom-ai/';
  })();

  var DEFAULTS = {
    fanImage: null,
    engineerImage: null,
    name: 'Николай',
    role: 'Консультант Вентпром',
    greeting: 'День добрый, чем могу помочь?',
    placeholder: 'Опишите задачу или введите вопрос…',
    quickReplies: [],
    fallbackReply: 'Спасибо! Передал вопрос инженеру — ответим в ближайшее время.',
    transport: null,
    introDuration: 3000,
    introTrigger: 'auto',
    introDelay: 900,
    showIntroOnce: true,
    introMemory: 'session',
    storageKey: 'wentprom_ai_intro_seen',
    openChatAfterIntro: false,
    bubbleDelay: 400,
    bubbleAutoHide: 12000,
    replayAfterMs: 0,
    trailEnabled: true,
    trailSegments: 18,
    trailFadeOut: 900,
    particles: 12,
    mobileAnimation: true,
    mobileBreakpoint: 600,
    idleAnimation: true,
    cursorReaction: true,
    desktopPath: [{ x: -0.12, y: 0.26 }, { x: 0.22, y: 0.13 }, { x: 0.52, y: 0.40 }, { x: 0.74, y: 0.19 }, { x: 0.92, y: 0.54 }],
    mobilePath: [{ x: -0.28, y: 0.20 }, { x: 0.38, y: 0.32 }, { x: 0.82, y: 0.16 }],
    curviness: 1.3,
    motionPath: null,
    zIndex: 99990,
    sound: false,
    gsapUrl: 'vendor/gsap.min.js',
    motionPathUrl: 'vendor/MotionPathPlugin.min.js',
    hideOn: 'body.compensate-for-scrollbar, body.modal-open',
    autoStyles: true,
    autoInit: true,
    debug: false,
  };

  /* ------------------------------------------------------------- утилиты */

  function assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
    }
    return target;
  }

  function h(tag, props, children) {
    var node = document.createElement(tag);
    for (var k in props) {
      if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
      if (k === 'class') node.className = props[k];
      else if (k === 'text') node.textContent = props[k];
      else if (k === 'html') node.innerHTML = props[k];
      else node.setAttribute(k, props[k]);
    }
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function svg(tag, attrs, children) {
    var node = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) node.setAttribute(k, attrs[k]);
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function emit(name, detail) {
    try {
      document.dispatchEvent(new CustomEvent(name, { detail: detail || {}, bubbles: true }));
    } catch (e) { /* старые браузеры — событие не критично */ }
  }

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = function () { resolve(true); };
      s.onerror = function () { reject(new Error('Не загрузился ' + url)); };
      document.head.appendChild(s);
    });
  }

  function preload(src) {
    return new Promise(function (resolve) {
      if (!src) return resolve(false);
      var img = new Image();
      img.onload = function () { resolve(true); };
      img.onerror = function () { resolve(false); };
      img.src = src;
    });
  }

  /* ------------------------------------------------------------ хранилище */

  function store(cfg) {
    var mode = cfg.introMemory;
    if (mode === 'none') return null;
    try {
      var s = mode === 'local' ? global.localStorage : global.sessionStorage;
      s.setItem('__wpai_test', '1');
      s.removeItem('__wpai_test');
      return s;
    } catch (e) {
      return null; // приватный режим Safari, отключённые куки — просто без памяти
    }
  }

  /* =====================================================================
     Модуль
     ===================================================================== */

  var instance = null;

  function Wentprom() {
    this.config = assign({}, DEFAULTS, global.WENTPROM_AI_CONFIG || {});
    this.ready = false;
    this.open_ = false;
    this.seeded = false;
    this.busy = false;
    this.anim = null;
    this.refs = {};
    this.timers = [];
  }

  Wentprom.prototype.log = function () {
    if (!this.config.debug || !global.console) return;
    console.log.apply(console, ['[WentpromAI]'].concat([].slice.call(arguments)));
  };

  Wentprom.prototype.later = function (fn, ms) {
    var id = global.setTimeout(fn, ms);
    this.timers.push(id);
    return id;
  };

  Wentprom.prototype.clearTimers = function () {
    this.timers.forEach(global.clearTimeout);
    this.timers = [];
  };

  /* ------------------------------------------------------------- стили */

  Wentprom.prototype.injectStyles = function () {
    if (!this.config.autoStyles) return;
    if (document.querySelector('link[data-wentprom-ai-styles]')) return;
    var links = document.getElementsByTagName('link');
    for (var i = 0; i < links.length; i++) {
      if (/wentprom-ai[^/]*\/styles\.css/.test(links[i].href || '')) return;
    }
    var link = h('link', { rel: 'stylesheet', href: BASE + 'styles.css' });
    link.setAttribute('data-wentprom-ai-styles', '1');
    document.head.appendChild(link);
  };

  /* -------------------------------------------------------------- GSAP */

  Wentprom.prototype.ensureGsap = function () {
    var cfg = this.config;
    if (global.gsap) return Promise.resolve(true);

    return loadScript(cfg.gsapUrl)
      .then(function () { return loadScript(cfg.motionPathUrl).catch(function () { return false; }); })
      .then(function () {
        if (global.gsap && global.MotionPathPlugin) global.gsap.registerPlugin(global.MotionPathPlugin);
        return !!global.gsap;
      })
      .catch(function () { return false; });
  };

  /* ------------------------------------------------------------ разметка */

  Wentprom.prototype.build = function () {
    var cfg = this.config;
    var r = this.refs;

    var fanSrc = cfg.fanImage || BASE + 'assets/fan.webp';
    var engineerSrc = cfg.engineerImage || BASE + 'assets/engineer.webp';
    this.assets = { fan: fanSrc, engineer: engineerSrc };

    /* --- слой эффектов --- */
    var gradient = svg('linearGradient', {
      id: 'wentprom-ai-trail-grad', gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: 100, y2: 100,
    }, [
      svg('stop', { offset: '0%', 'stop-color': '#d8f0ff', 'stop-opacity': '0.8' }),
      svg('stop', { offset: '35%', 'stop-color': '#a9dcff', 'stop-opacity': '0.34' }),
      svg('stop', { offset: '100%', 'stop-color': '#a9dcff', 'stop-opacity': '0' }),
    ]);

    // Три полосы разной ширины: узкое ядро потока и два мягких «крыла».
    var lanes = [
      svg('path', { stroke: 'url(#wentprom-ai-trail-grad)', 'stroke-width': 5, 'stroke-opacity': 0.95 }),
      svg('path', { stroke: 'url(#wentprom-ai-trail-grad)', 'stroke-width': 13, 'stroke-opacity': 0.6 }),
      svg('path', { stroke: 'url(#wentprom-ai-trail-grad)', 'stroke-width': 24, 'stroke-opacity': 0.4 }),
    ];

    var trails = svg('g', { class: 'wentprom-ai-trails' }, lanes.slice().reverse());

    var particlePool = [];
    for (var i = 0; i < Math.max(0, cfg.particles); i++) {
      particlePool.push(svg('ellipse', { rx: 3.2, ry: 1.5, cx: 0, cy: 0 }));
    }
    var particles = svg('g', { class: 'wentprom-ai-particles' }, particlePool);

    var burstRings = [
      svg('circle', { r: 34, cx: 0, cy: 0 }),
      svg('circle', { r: 46, cx: 0, cy: 0, 'stroke-width': 1.2 }),
      svg('ellipse', { rx: 58, ry: 14, cx: 0, cy: 26, 'stroke-width': 1.4 }),
    ];
    var burst = svg('g', { class: 'wentprom-ai-burst' }, burstRings);

    var vortex = svg('g', { class: 'wentprom-ai-vortex' }, [
      svg('path', { d: 'M -44 0 A 44 44 0 0 1 12 -42' }),
      svg('path', { d: 'M 44 6 A 44 44 0 0 1 -14 44', 'stroke-width': 1.8 }),
      svg('path', { d: 'M -28 -26 A 38 38 0 0 1 30 -22', 'stroke-width': 1.4, opacity: 0.7 }),
    ]);

    var fx = svg('svg', { class: 'wentprom-ai-fx', 'aria-hidden': 'true', focusable: 'false' }, [
      svg('defs', {}, [gradient]), trails, particles, burst, vortex,
    ]);

    /* --- вентилятор --- */
    var fanImg = h('img', { src: fanSrc, alt: '', 'aria-hidden': 'true', decoding: 'async' });
    var fanBank = h('div', { class: 'wentprom-ai-fan-bank' }, [fanImg]);
    var fanTilt = h('div', { class: 'wentprom-ai-fan-tilt' }, [fanBank]);
    var fan = h('div', { class: 'wentprom-ai-fan', 'aria-hidden': 'true' }, [fanTilt]);

    /* --- персонаж --- */
    var engineerImg = h('img', {
      src: engineerSrc, alt: cfg.name + ' — консультант Вентпром', decoding: 'async',
    });
    var characterInner = h('span', { class: 'wentprom-ai-character-inner' }, [engineerImg]);
    var character = h('button', {
      type: 'button',
      class: 'wentprom-ai-character',
      'aria-label': 'Открыть чат с консультантом',
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
    }, [characterInner]);

    engineerImg.onerror = function () { character.setAttribute('data-fallback', '1'); };

    /* --- реплика --- */
    var bubbleClose = h('button', { type: 'button', class: 'wentprom-ai-bubble-close', 'aria-label': 'Скрыть подсказку', html: '&times;' });
    var bubble = h('div', { class: 'wentprom-ai-bubble', role: 'status' }, [
      bubbleClose,
      h('div', { class: 'wentprom-ai-bubble-name', text: cfg.name }),
      h('div', { class: 'wentprom-ai-bubble-text', text: cfg.greeting }),
    ]);

    /* --- окно чата --- */
    var avatarImg = h('img', { src: engineerSrc, alt: '', 'aria-hidden': 'true', decoding: 'async' });
    var panelClose = h('button', { type: 'button', class: 'wentprom-ai-panel-close', 'aria-label': 'Закрыть чат', html: '&times;' });
    var logEl = h('div', { class: 'wentprom-ai-log', role: 'log', 'aria-live': 'polite' });
    var quick = h('div', { class: 'wentprom-ai-quick' });
    var input = h('textarea', { class: 'wentprom-ai-input', rows: '1', placeholder: cfg.placeholder, 'aria-label': 'Сообщение консультанту' });
    var send = h('button', { type: 'button', class: 'wentprom-ai-send', 'aria-label': 'Отправить' });
    send.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.3 20.7 22 12 2.3 3.3 2.3 10l14 2-14 2z"/></svg>';

    var panel = h('div', {
      class: 'wentprom-ai-panel', role: 'dialog', 'aria-label': cfg.role, 'aria-modal': 'false',
    }, [
      h('div', { class: 'wentprom-ai-panel-head' }, [
        h('div', { class: 'wentprom-ai-panel-avatar' }, [avatarImg]),
        h('div', { class: 'wentprom-ai-panel-title' }, [
          h('div', { class: 'wentprom-ai-panel-name', text: cfg.name }),
          h('div', { class: 'wentprom-ai-panel-status', text: 'на связи' }),
        ]),
        panelClose,
      ]),
      logEl,
      quick,
      h('div', { class: 'wentprom-ai-form' }, [input, send]),
    ]);

    var dock = h('div', { class: 'wentprom-ai-dock' }, [panel, bubble, character]);

    var root = h('div', { class: 'wentprom-ai-root', id: LAYER_ID, 'data-wpai-state': 'boot' }, [fx, fan, dock]);
    if (cfg.zIndex) root.style.zIndex = String(cfg.zIndex);

    document.body.appendChild(root);

    assign(r, {
      root: root, fx: fx, trails: trails, trailLanes: lanes, trailGradient: gradient,
      particles: particles, particlePool: particlePool,
      burst: burst, burstRings: burstRings, vortex: vortex,
      fan: fan, fanTilt: fanTilt, fanBank: fanBank,
      dock: dock, character: character, characterInner: characterInner,
      bubble: bubble, bubbleClose: bubbleClose,
      panel: panel, panelClose: panelClose, log: logEl, quick: quick, input: input, send: send,
    });
  };

  /* ------------------------------------------------------------ события */

  Wentprom.prototype.wire = function () {
    var self = this;
    var r = this.refs;

    r.character.addEventListener('click', function () { self.toggle(); });
    r.bubble.addEventListener('click', function (e) {
      if (e.target === r.bubbleClose) return;
      self.open();
    });
    r.bubbleClose.addEventListener('click', function (e) {
      e.stopPropagation();
      if (self.anim) self.anim.hideBubble();
    });
    r.panelClose.addEventListener('click', function () { self.close(); });
    r.send.addEventListener('click', function () { self.submit(); });

    r.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        self.submit();
      }
    });

    // авто-рост поля ввода без скачков вёрстки
    r.input.addEventListener('input', function () {
      r.input.style.height = 'auto';
      r.input.style.height = Math.min(96, r.input.scrollHeight) + 'px';
    });

    this.onKey = function (e) {
      if (e.key === 'Escape' && self.open_) self.close();
    };
    document.addEventListener('keydown', this.onKey);
  };

  /* --------------------------------------------------------------- чат */

  Wentprom.prototype.message = function (from, text) {
    var msg = h('div', { class: 'wentprom-ai-msg', 'data-from': from, text: text });
    this.refs.log.appendChild(msg);
    this.refs.log.scrollTop = this.refs.log.scrollHeight;
    return msg;
  };

  Wentprom.prototype.typing = function (on) {
    var r = this.refs;
    if (on) {
      if (this.typingEl) return;
      this.typingEl = h('div', { class: 'wentprom-ai-typing' }, [h('i'), h('i'), h('i')]);
      r.log.appendChild(this.typingEl);
      r.log.scrollTop = r.log.scrollHeight;
    } else if (this.typingEl) {
      this.typingEl.parentNode && this.typingEl.parentNode.removeChild(this.typingEl);
      this.typingEl = null;
    }
  };

  Wentprom.prototype.seed = function () {
    if (this.seeded) return;
    this.seeded = true;
    var self = this;
    var cfg = this.config;

    this.message('bot', cfg.greeting);

    (cfg.quickReplies || []).forEach(function (label) {
      var b = h('button', { type: 'button', text: label });
      b.addEventListener('click', function () {
        self.refs.quick.innerHTML = '';
        self.submit(label);
      });
      self.refs.quick.appendChild(b);
    });
  };

  Wentprom.prototype.submit = function (forced) {
    var self = this;
    var cfg = this.config;
    var text = (forced != null ? forced : this.refs.input.value).trim();
    if (!text || this.busy) return;

    if (forced == null) {
      this.refs.input.value = '';
      this.refs.input.style.height = 'auto';
    }
    this.message('user', text);
    this.busy = true;
    this.typing(true);

    var answer;
    try {
      answer = typeof cfg.transport === 'function'
        ? Promise.resolve(cfg.transport(text, { config: cfg, api: global.WentpromAI }))
        : new Promise(function (res) { self.later(function () { res(cfg.fallbackReply); }, 700); });
    } catch (e) {
      answer = Promise.resolve(cfg.fallbackReply);
    }

    answer
      .catch(function () { return cfg.fallbackReply; })
      .then(function (reply) {
        self.typing(false);
        self.busy = false;
        self.message('bot', String(reply == null ? cfg.fallbackReply : reply));
      });
  };

  /* ------------------------------------------------------- открыть/закрыть */

  Wentprom.prototype.open = function () {
    if (this.open_ || !this.refs.root) return;
    this.open_ = true;
    this.seed();
    this.refs.root.setAttribute('data-wpai-open', '1');
    this.refs.character.setAttribute('aria-expanded', 'true');
    if (this.anim) this.anim.hideBubble();

    var panel = this.refs.panel;
    if (global.gsap && !(this.anim && this.anim.reducedMotion())) {
      global.gsap.fromTo(panel,
        { opacity: 0, y: 14, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.32, ease: 'back.out(1.4)' });
    } else {
      panel.style.opacity = '1';
    }

    var input = this.refs.input;
    this.later(function () { try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); } }, 260);
    emit('wentprom:ai-open', {});
  };

  Wentprom.prototype.close = function () {
    if (!this.open_) return;
    this.open_ = false;
    var r = this.refs;
    r.character.setAttribute('aria-expanded', 'false');

    var finish = function () { r.root.removeAttribute('data-wpai-open'); };
    if (global.gsap && !(this.anim && this.anim.reducedMotion())) {
      global.gsap.to(r.panel, { opacity: 0, y: 10, scale: 0.97, duration: 0.2, ease: 'power2.in', onComplete: finish });
    } else {
      finish();
    }

    try { r.character.focus({ preventScroll: true }); } catch (e) { /* не критично */ }
    emit('wentprom:ai-close', {});
  };

  Wentprom.prototype.toggle = function () {
    this.open_ ? this.close() : this.open();
  };

  /* -------------------------------------------------------------- интро */

  Wentprom.prototype.seen = function () {
    var s = store(this.config);
    if (!s) return false;
    var v = s.getItem(this.config.storageKey);
    if (!v) return false;
    if (this.config.replayAfterMs > 0) {
      var ts = parseInt(v, 10);
      if (!isNaN(ts) && Date.now() - ts > this.config.replayAfterMs) return false;
    }
    return true;
  };

  Wentprom.prototype.markSeen = function () {
    var s = store(this.config);
    if (s) { try { s.setItem(this.config.storageKey, String(Date.now())); } catch (e) { /* нет места — не страшно */ } }
  };

  Wentprom.prototype.afterIntro = function () {
    var self = this;
    var cfg = this.config;
    this.markSeen();
    if (this.anim) this.anim.enableCursorReaction();
    emit('wentprom:ai-intro-complete', {});

    this.later(function () {
      if (self.open_) return;
      if (self.anim) self.anim.showBubble();
      if (cfg.bubbleAutoHide > 0) {
        self.later(function () { if (!self.open_ && self.anim) self.anim.hideBubble(); }, cfg.bubbleAutoHide);
      }
    }, cfg.bubbleDelay);

    if (cfg.openChatAfterIntro) this.later(function () { self.open(); }, cfg.bubbleDelay + 250);
  };

  Wentprom.prototype.playIntro = function (opts) {
    var self = this;
    opts = opts || {};
    if (!this.anim) return;
    if (!global.gsap) { this.anim.showInstant(); this.afterIntro(); return; }
    if (this.open_) this.close();
    this.anim.playIntro(function () { self.afterIntro(); });
  };

  /* Полёт не должен стартовать в фоновой вкладке — пользователь его не увидит. */
  Wentprom.prototype.whenVisible = function (fn) {
    if (document.visibilityState !== 'hidden') return fn();
    var once = function () {
      if (document.visibilityState === 'hidden') return;
      document.removeEventListener('visibilitychange', once);
      fn();
    };
    document.addEventListener('visibilitychange', once);
  };

  Wentprom.prototype.start = function () {
    var self = this;
    var cfg = this.config;
    var skip = (cfg.showIntroOnce && this.seen()) || cfg.introTrigger === 'click';

    if (skip) {
      this.anim.showInstant();
      this.anim.enableCursorReaction();
      this.refs.root.setAttribute('data-wpai-state', 'ready');
      return;
    }

    this.whenVisible(function () {
      self.later(function () { self.playIntro(); }, cfg.introDelay);
    });
  };

  /* Пока на сайте открыта модалка (форма обратного звонка, фильтр, карта),
     персонаж не должен висеть поверх неё. Слушаем только класс на body —
     это дешевле любого опроса и не мешает работе сайта. */
  Wentprom.prototype.watchOverlays = function () {
    var self = this;
    var sel = this.config.hideOn;
    if (!sel || !global.MutationObserver) return;

    var apply = function () {
      var hit;
      try { hit = !!document.querySelector(sel); } catch (e) { return; }
      if (hit) self.refs.root.setAttribute('data-wpai-hidden', '1');
      else self.refs.root.removeAttribute('data-wpai-hidden');
    };

    this.overlayObserver = new MutationObserver(apply);
    this.overlayObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    apply();
  };

  /* --------------------------------------------------------- аварийный вид */

  Wentprom.prototype.staticMode = function (reason) {
    this.log('статичный режим:', reason);
    if (!this.refs.root) return;
    this.refs.root.setAttribute('data-wpai-state', 'ready');
    this.refs.character.style.opacity = '1';
    this.refs.characterInner.style.opacity = '1';
    this.refs.fan.style.display = 'none';
  };

  /* -------------------------------------------------------------- init */

  Wentprom.prototype.init = function (overrides) {
    var self = this;
    if (this.ready) return this;
    assign(this.config, global.WENTPROM_AI_CONFIG || {}, overrides || {});
    this.ready = true;

    try {
      this.injectStyles();
      this.build();
      this.wire();
      this.watchOverlays();
    } catch (e) {
      // Разметка не собралась — сайт продолжает работать без консультанта (ТЗ п.45)
      if (global.console) console.error('[WentpromAI] init failed', e);
      return this;
    }

    Promise.all([
      preload(this.assets.fan),
      preload(this.assets.engineer),
      this.ensureGsap(),
    ]).then(function (res) {
      var imagesOk = res[0] && res[1];
      var hasGsap = res[2];
      if (!hasGsap) { self.staticMode('GSAP недоступен'); return; }
      try {
        self.anim = global.WentpromAIAnimation.create(self.refs, self.config);
        // Гонять невидимый вентилятор через экран смысла нет —
        // без ассетов сразу показываем резервную кнопку (ТЗ п.45).
        if (!imagesOk) { self.staticMode('изображения не загрузились'); return; }
        self.start();
      } catch (e) {
        if (global.console) console.error('[WentpromAI] animation failed', e);
        self.staticMode('ошибка сцены');
      }
    }).catch(function (e) {
      self.staticMode(e && e.message);
    });

    return this;
  };

  Wentprom.prototype.reset = function () {
    var s = store(this.config);
    if (s) { try { s.removeItem(this.config.storageKey); } catch (e) { /* ignore */ } }
    this.clearTimers();
    if (this.open_) this.close();
    this.refs.log.innerHTML = '';
    this.refs.quick.innerHTML = '';
    this.seeded = false;
    if (this.anim) { this.anim.hideBubble(); this.anim.stopIdle(); }
  };

  Wentprom.prototype.destroy = function () {
    this.clearTimers();
    if (this.anim) this.anim.destroy();
    if (this.overlayObserver) { this.overlayObserver.disconnect(); this.overlayObserver = null; }
    document.removeEventListener('keydown', this.onKey);
    if (this.refs.root && this.refs.root.parentNode) this.refs.root.parentNode.removeChild(this.refs.root);
    this.ready = false;
    this.refs = {};
  };

  /* ------------------------------------------------------- публичный фасад */

  var api = {
    init: function (overrides) {
      if (!instance) instance = new Wentprom();
      return instance.init(overrides);
    },
    open: function () { instance && instance.open(); },
    close: function () { instance && instance.close(); },
    toggle: function () { instance && instance.toggle(); },
    playIntro: function (opts) {
      if (!instance) return;
      instance.clearTimers();
      instance.playIntro(opts || { force: true });
    },
    reset: function () {
      if (!instance) return;
      instance.reset();
      instance.playIntro({ force: true });
    },
    destroy: function () { if (instance) { instance.destroy(); instance = null; } },
    say: function (text) { instance && instance.message('bot', String(text)); },
    get config() { return instance ? instance.config : null; },
    get instance() { return instance; },
    version: '1.0.0',
  };

  global.WentpromAI = api;

  /* Автостарт после готовности DOM. Отключается WENTPROM_AI_CONFIG.autoInit = false */
  function boot() {
    var cfg = assign({}, DEFAULTS, global.WENTPROM_AI_CONFIG || {});
    if (cfg.autoInit === false) return;
    api.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window, document);
