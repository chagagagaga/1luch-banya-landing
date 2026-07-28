/* ============================================================================
   ПЕРВЫЙ ЛУЧ — рендер секций и интерактив
   ----------------------------------------------------------------------------
   Всё содержимое собирается из assets/js/pricing.js, чтобы цены и тексты
   правились в одном месте. Оформление — целиком в assets/css/styles.css.
   ========================================================================== */
(function () {
  'use strict';

  var P = window.LUCH;
  if (!P) return;

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function fmt(n) { return Math.round(n || 0).toLocaleString('ru-RU').replace(/,/g, ' '); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  /* ═══ Ссылки на мессенджеры и телефон ══════════════════════════════════ */
  (function contacts() {
    var c = P.company;
    var waText = encodeURIComponent('Здравствуйте! Пишу с сайта, хочу рассчитать парную / подобрать печь.');
    $$('[data-wa-link]').forEach(function (a) { a.href = 'https://wa.me/' + c.whatsapp + '?text=' + waText; });
    $$('[data-tg-link]').forEach(function (a) { a.href = 'https://t.me/' + c.telegram; });
    $$('[data-phone-link]').forEach(function (a) {
      a.href = c.phoneHref;
      if (a.textContent.trim().indexOf('+7') === 0) a.textContent = c.phone;
    });
    var y = $('[data-year]'); if (y) y.textContent = new Date().getFullYear();
  })();

  /* ═══ Пакеты отделки ═══════════════════════════════════════════════════ */
  (function packages() {
    var box = $('[data-packages]');
    if (!box) return;
    box.innerHTML = P.packages.map(function (p) {
      var forSix = p.pricePerM2 * 6;
      return '' +
      '<article class="pkg' + (p.popular ? ' pkg--popular' : '') + '" data-pkg-card="' + p.id + '">' +
        (p.popular ? '<span class="pkg__badge">Выбирают чаще всего</span>' : '') +
        '<header class="pkg__head">' +
          '<h3 class="pkg__name">' + esc(p.name) + '</h3>' +
          '<p class="pkg__tagline">' + esc(p.tagline) + '</p>' +
        '</header>' +
        '<div class="pkg__price">' +
          '<b>от ' + fmt(p.pricePerM2) + ' ₽</b><span>за м² парной</span>' +
        '</div>' +
        '<p class="pkg__example">Парная 6 м² — <b>от ' + fmt(forSix) + ' ₽</b></p>' +
        '<p class="pkg__wood"><span>Материал</span>' + esc(p.wood) + '</p>' +
        '<ul class="pkg__list">' +
          p.includes.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') +
        '</ul>' +
        (p.notIncluded && p.notIncluded.length
          ? '<p class="pkg__not">Не входит: ' + p.notIncluded.map(esc).join(', ') + '</p>' : '') +
        '<button type="button" class="btn ' + (p.popular ? 'btn--primary' : 'btn--ghost') + ' btn--block" ' +
          'data-open-pkg="' + p.id + '">Рассчитать в этом пакете</button>' +
      '</article>';
    }).join('');

    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-open-pkg]');
      if (!b || !window.LuchCalc) return;
      window.LuchCalc.state.pkg = b.dataset.openPkg;
      window.LuchCalc.open('finish');
    });
  })();

  /* ═══ Печи: карточки + фильтры ═════════════════════════════════════════ */
  (function stoves() {
    var grid = $('[data-stove-grid]');
    if (!grid) return;
    var empty = $('[data-stove-empty]');
    var f = { v: 'all', f: 'all', t: 'all' };

    var TIER_LABEL = { base: 'Бюджет', mid: 'Оптимум', premium: 'Премиум' };

    function match(s) {
      if (f.f !== 'all' && s.fuel !== f.f) return false;
      if (f.t !== 'all' && s.tier !== f.t) return false;
      if (f.v !== 'all') {
        var bands = { '16': [0, 16], '25': [16, 25], '35': [25, 35], '50': [35, 999] };
        var b = bands[f.v];
        // печь подходит, если её диапазон пересекается с выбранным
        if (s.vmax < b[0] || s.vmin > b[1]) return false;
      }
      return true;
    }

    function card(s) {
      return '' +
      '<article class="stove" data-stove="' + esc(s.id) + '">' +
        '<div class="stove__media">' +
          (s.img ? '<img src="' + esc(s.img) + '" alt="' + esc(s.name) + '" loading="lazy" width="400" height="400">' : '') +
          '<span class="stove__tier stove__tier--' + s.tier + '">' + TIER_LABEL[s.tier] + '</span>' +
        '</div>' +
        '<div class="stove__body">' +
          '<span class="stove__brand">' + esc(s.brand) + ' · ' + esc(s.line) + '</span>' +
          '<h3 class="stove__name">' + esc(s.name) + '</h3>' +
          '<p class="stove__about">' + esc(s.about) + '</p>' +
          '<ul class="stove__tags">' + s.tags.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
          '<div class="stove__specs">' +
            '<span><b>' + s.vmin + '–' + s.vmax + ' м³</b>объём парной</span>' +
            '<span><b>' + (s.fuel === 'wood' ? 'Дрова' : 'Электро') + '</b>топливо</span>' +
          '</div>' +
        '</div>' +
        '<footer class="stove__foot">' +
          '<div class="stove__price"><span>Цена</span><b>от ' + fmt(s.price) + ' ₽</b></div>' +
          '<button type="button" class="btn btn--primary btn--sm" data-stove-cta="' + esc(s.id) + '">Заказать</button>' +
        '</footer>' +
      '</article>';
    }

    function draw() {
      var list = P.stoves.filter(match);
      grid.innerHTML = list.map(card).join('');
      if (empty) empty.hidden = list.length > 0;
    }

    function wire(sel, key, attr) {
      var box = $(sel);
      if (!box) return;
      box.addEventListener('click', function (e) {
        var b = e.target.closest('.chip');
        if (!b) return;
        $$('.chip', box).forEach(function (x) { x.classList.remove('is-on'); });
        b.classList.add('is-on');
        f[key] = b.dataset[attr];
        draw();
      });
    }
    wire('[data-filter-volume]', 'v', 'v');
    wire('[data-filter-fuel]',   'f', 'f');
    wire('[data-filter-tier]',   't', 't');

    grid.addEventListener('click', function (e) {
      var b = e.target.closest('[data-stove-cta]');
      if (!b || !window.LuchCalc) return;
      var s = P.stoves.find(function (x) { return x.id === b.dataset.stoveCta; });
      if (s) {
        window.LuchCalc.state.fuel = s.fuel;
        window.LuchCalc.state.tier = s.tier;
        window.LuchCalc.state.volume = Math.min(P.ranges.volume.max, Math.round((s.vmin + s.vmax) / 2));
      }
      window.LuchCalc.open('stove');
    });

    draw();
  })();

  /* ═══ Портфолио + лайтбокс ═════════════════════════════════════════════ */
  (function works() {
    var box = $('[data-works]');
    if (!box) return;
    var VISIBLE = 6;

    function photos(w) {
      var out = [];
      for (var i = 1; i <= w.photos; i++) out.push('assets/img/works/' + w.id + '-' + i + '.webp');
      return out;
    }

    box.innerHTML = P.works.map(function (w, idx) {
      var ph = photos(w);
      return '' +
      '<article class="work' + (idx >= VISIBLE ? ' is-hidden' : '') + '" data-work="' + esc(w.id) + '">' +
        '<button type="button" class="work__btn" data-open-work="' + idx + '" aria-label="Открыть галерею: ' + esc(w.title) + '">' +
          '<img src="' + esc(ph[0]) + '" alt="' + esc(w.title) + ', ' + esc(w.place) + '" loading="lazy" width="600" height="450">' +
          '<span class="work__count">' + ph.length + ' фото</span>' +
        '</button>' +
        '<div class="work__meta">' +
          '<h3>' + esc(w.title) + '</h3>' +
          '<p>' + esc(w.place) + ' · ' + esc(w.area) + ' · пакет «' + esc(w.pkg) + '»</p>' +
        '</div>' +
      '</article>';
    }).join('');

    var moreBtn = $('[data-works-more]');
    if (moreBtn) moreBtn.addEventListener('click', function () {
      $$('.work.is-hidden', box).forEach(function (el) { el.classList.remove('is-hidden'); });
      moreBtn.remove();
    });

    /* --- лайтбокс --- */
    var lb = null, cur = { work: 0, photo: 0 };

    function build() {
      var el = document.createElement('div');
      el.className = 'lightbox';
      el.setAttribute('hidden', '');
      el.innerHTML =
        '<button type="button" class="lightbox__close" data-lb-close aria-label="Закрыть">✕</button>' +
        '<button type="button" class="lightbox__nav lightbox__nav--prev" data-lb-prev aria-label="Предыдущее фото">‹</button>' +
        '<figure class="lightbox__frame">' +
          '<img data-lb-img alt="">' +
          '<figcaption data-lb-cap></figcaption>' +
        '</figure>' +
        '<button type="button" class="lightbox__nav lightbox__nav--next" data-lb-next aria-label="Следующее фото">›</button>' +
        '<div class="lightbox__cta"><button type="button" class="btn btn--primary" data-open-lead data-lead-source="lightbox">Хочу такую же</button></div>';
      document.body.appendChild(el);
      el.addEventListener('click', function (e) { if (e.target === el) closeLb(); });
      $('[data-lb-close]', el).addEventListener('click', closeLb);
      $('[data-lb-prev]', el).addEventListener('click', function () { step(-1); });
      $('[data-lb-next]', el).addEventListener('click', function () { step(1); });
      document.addEventListener('keydown', function (e) {
        if (el.hasAttribute('hidden')) return;
        if (e.key === 'Escape') closeLb();
        if (e.key === 'ArrowLeft') step(-1);
        if (e.key === 'ArrowRight') step(1);
      });
      // свайп на мобильных
      var x0 = null;
      el.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
      el.addEventListener('touchend', function (e) {
        if (x0 === null) return;
        var dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
        x0 = null;
      }, { passive: true });
      return el;
    }

    function show() {
      var w = P.works[cur.work];
      var ph = photos(w);
      cur.photo = (cur.photo + ph.length) % ph.length;
      $('[data-lb-img]', lb).src = ph[cur.photo];
      $('[data-lb-img]', lb).alt = w.title + ', фото ' + (cur.photo + 1);
      $('[data-lb-cap]', lb).textContent = w.title + ' · ' + w.place + ' · ' + w.area +
        ' · пакет «' + w.pkg + '» · ' + (cur.photo + 1) + '/' + ph.length;
    }
    function step(d) { cur.photo += d; show(); }
    function closeLb() { if (lb) lb.setAttribute('hidden', ''); document.body.classList.remove('is-locked'); }

    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-open-work]');
      if (!b) return;
      if (!lb) lb = build();
      cur.work = +b.dataset.openWork; cur.photo = 0;
      show();
      lb.removeAttribute('hidden');
      document.body.classList.add('is-locked');
    });
  })();

  /* ═══ Видео (фасад: iframe грузится по клику) ══════════════════════════ */
  (function videos() {
    var box = $('[data-videos]');
    if (!box) return;
    var LIST = [
      { id: '9k19_uwx4W0', img: 'darino',           title: 'КП Дарьино, Одинцовский район' },
      { id: 'kSI90FKQ7os', img: 'edem-p',           title: 'КП Новорижский Эдем, Истринский р-н' },
      { id: 'XUy19pSGoUM', img: 'novoriz-4',        title: 'КП Новорижский, Истринский р-н' },
      { id: 'vAsAUU8I2VI', img: 'olimp-3',          title: 'КП Олимп, Ступинский район' },
      { id: 'LU2O69HXQwA', img: 'kp-barsky_lug4',   title: 'КП Барский Луг, Подольск' },
      { id: 'eGM55vqIjSE', img: 'konakovo',         title: 'КП Конаково Ривер Клаб, Тверская обл.' },
      { id: 'FEiXMslOQvw', img: 'happiness-1',      title: 'КП Счастье, Истринский р-н' },
      { id: 'zYoGoIN6gsQ', img: 'spartak-1',        title: 'КП Спартак, Жуковский район' },
      { id: 'Z4BzE4LQT88', img: 'ruzza',            title: 'КП «Рузза», Волоколамский р-н' },
    ];

    box.innerHTML = LIST.map(function (v) {
      return '' +
      '<article class="video" data-video="' + esc(v.id) + '">' +
        '<button type="button" class="video__btn" aria-label="Смотреть: ' + esc(v.title) + '">' +
          '<img src="assets/img/ui/' + esc(v.img) + '.webp" alt="' + esc(v.title) + '" loading="lazy" width="480" height="270">' +
          '<span class="video__play" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>' +
        '</button>' +
        '<p class="video__title">' + esc(v.title) + '</p>' +
      '</article>';
    }).join('');

    box.addEventListener('click', function (e) {
      var b = e.target.closest('.video__btn');
      if (!b) return;
      var art = b.closest('[data-video]');
      var id = art.dataset.video;
      var frame = document.createElement('div');
      frame.className = 'video__frame';
      frame.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) +
        '?autoplay=1&rel=0" title="Видео объекта" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>';
      b.replaceWith(frame);
      var mid = (P.company && P.company.yandexMetrikaId) || 0;
      if (mid && typeof window.ym === 'function') { try { window.ym(mid, 'reachGoal', 'video_play', { id: id }); } catch (err) {} }
    });
  })();

  /* ═══ Отзывы ═══════════════════════════════════════════════════════════ */
  (function reviews() {
    var box = $('[data-reviews]');
    if (!box) return;
    box.innerHTML = P.reviews.map(function (r) {
      return '' +
      '<figure class="review">' +
        '<blockquote>' + esc(r.text) + '</blockquote>' +
        '<figcaption>' +
          '<img src="' + esc(r.photo) + '" alt="" loading="lazy" width="48" height="48">' +
          '<span><b>' + esc(r.name) + '</b><i>' + esc(r.place) + '</i></span>' +
        '</figcaption>' +
      '</figure>';
    }).join('');
  })();

  /* ═══ Этапы ════════════════════════════════════════════════════════════ */
  (function steps() {
    var box = $('[data-steps]');
    if (!box) return;
    box.innerHTML = P.steps.map(function (s) {
      return '' +
      '<li class="step">' +
        '<span class="step__n">' + s.n + '</span>' +
        '<div class="step__body">' +
          '<h3>' + esc(s.title) + '</h3>' +
          '<p>' + esc(s.text) + '</p>' +
        '</div>' +
        '<span class="step__day">' + esc(s.day) + '</span>' +
      '</li>';
    }).join('');
  })();

  /* ═══ FAQ ══════════════════════════════════════════════════════════════ */
  (function faq() {
    var box = $('[data-faq]');
    if (!box) return;
    box.innerHTML = P.faq.map(function (item, i) {
      return '' +
      '<details class="qa"' + (i === 0 ? ' open' : '') + '>' +
        '<summary><span>' + esc(item.q) + '</span><i aria-hidden="true"></i></summary>' +
        '<div class="qa__body"><p>' + esc(item.a) + '</p></div>' +
      '</details>';
    }).join('');

    // аккордеон: открыт только один
    box.addEventListener('toggle', function (e) {
      var d = e.target;
      if (d.tagName !== 'DETAILS' || !d.open) return;
      $$('details.qa', box).forEach(function (o) { if (o !== d) o.open = false; });
    }, true);

    // микроразметка FAQ для поиска
    var ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: P.faq.map(function (f) {
        return { '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } };
      }),
    });
    document.head.appendChild(ld);
  })();

  /* ═══ Шапка, меню, плавный скролл ══════════════════════════════════════ */
  (function chrome() {
    var header = $('[data-header]');
    var burger = $('[data-burger]');
    var nav = $('[data-nav]');

    function onScroll() {
      if (header) header.classList.toggle('is-stuck', window.scrollY > 24);
      var bar = $('[data-mobilebar]');
      if (bar) bar.classList.toggle('is-visible', window.scrollY > 600);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    if (burger && nav) {
      burger.addEventListener('click', function () {
        var open = nav.classList.toggle('is-open');
        burger.classList.toggle('is-open', open);
        burger.setAttribute('aria-expanded', String(open));
        document.body.classList.toggle('is-locked', open);
      });
      nav.addEventListener('click', function (e) {
        if (e.target.tagName === 'A') {
          nav.classList.remove('is-open');
          burger.classList.remove('is-open');
          burger.setAttribute('aria-expanded', 'false');
          document.body.classList.remove('is-locked');
        }
      });
    }

    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href');
      if (id === '#' || id.length < 2) return;
      var t = document.querySelector(id);
      if (!t) return;
      e.preventDefault();
      t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', id);
    });
  })();

  /* ═══ Кнопки, открывающие модалку и калькулятор ════════════════════════ */
  document.addEventListener('click', function (e) {
    var lead = e.target.closest('[data-open-lead]');
    if (lead && window.LuchCalc) {
      window.LuchCalc.openModal(lead.dataset.leadSource || 'cta');
      return;
    }
    var tab = e.target.closest('[data-open-calc-tab]');
    if (tab && window.LuchCalc) {
      window.LuchCalc.open(tab.dataset.openCalcTab);
    }
  });

  /* ═══ Exit-intent: одна попытка за сессию ══════════════════════════════ */
  (function exitIntent() {
    if (sessionStorage.getItem('luch_exit_shown')) return;
    var fired = false;

    function fire() {
      if (fired || !window.LuchCalc) return;
      if (document.querySelector('.modal:not([hidden])')) return;
      fired = true;
      sessionStorage.setItem('luch_exit_shown', '1');
      window.LuchCalc.openModal('exit-intent');
    }

    // десктоп — увод курсора за верхнюю кромку
    document.addEventListener('mouseout', function (e) {
      if (!e.relatedTarget && e.clientY <= 0) fire();
    });
    // мобильные — резкий скролл вверх после того, как человек уже листал
    var lastY = 0, seenDepth = false;
    window.addEventListener('scroll', function () {
      var y = window.scrollY;
      if (y > 1500) seenDepth = true;
      if (seenDepth && lastY - y > 220 && y < 400) fire();
      lastY = y;
    }, { passive: true });
  })();
})();
