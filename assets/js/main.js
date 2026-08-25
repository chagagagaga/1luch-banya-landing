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

    // Кнопку-ссылку показываем, только когда контакт реально задан в pricing.js.
    // Кнопка, ведущая в никуда, стоит дороже отсутствующей: человек кликает,
    // попадает на ошибку и уходит уже с испорченным впечатлением.
    function wire(sel, url) {
      $$(sel).forEach(function (a) {
        if (url) { a.href = url; a.hidden = false; a.removeAttribute('aria-hidden'); }
        else { a.hidden = true; a.setAttribute('aria-hidden', 'true'); a.removeAttribute('href'); }
      });
    }
    wire('[data-wa-link]',  c.whatsapp ? 'https://wa.me/' + c.whatsapp + '?text=' + waText : '');
    wire('[data-tg-link]',  c.telegram ? 'https://t.me/' + c.telegram : '');
    wire('[data-max-link]', c.maxUrl || '');

    // Пока ни один мессенджер не подключён — блок вопросов не должен обещать
    // того, чего на странице нет. Подставляем телефон и переписываем подводку.
    if (!c.whatsapp && !c.telegram && !c.maxUrl) {
      $$('[data-msg-fallback]').forEach(function (a) { a.hidden = false; });
      var lead = $('[data-faq-lead]');
      if (lead) lead.innerHTML = 'Если вопроса нет в списке — позвоните, ответим сразу. '
        + '<span class="nb">' + esc(c.worktime) + '.</span>';
    }
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
    // Диапазон стоимости готовой парной под ключ — прайс, а не ставка за метр.
    function band(p, type) { return (p.projectPrice || {})[type] || null; }
    function bandText(b) {
      if (!b) return '';
      return b.max ? fmt(b.min) + ' – ' + fmt(b.max) + ' ₽' : 'от ' + fmt(b.min) + ' ₽';
    }

    box.innerHTML = P.packages.map(function (p) {
      // Цена зависит от типа парной: русская баня дороже финской сауны.
      // У авторского пакета верхней границы нет — считается по проекту.
      var fin = band(p, 'finnish');
      var rus = band(p, 'russian');
      var ham = band(p, 'hammam');
      var open = p.pricePerM2 ? null : true;   // авторский: цена «от», дальше по проекту
      var from = fin ? fin.min : 0;
      return '' +
      '<article class="pkg' + (p.popular ? ' pkg--popular' : '') + '" data-pkg-card="' + p.id + '">' +
        (p.popular ? '<span class="pkg__badge">Выбирают чаще всего</span>' : '') +
        '<header class="pkg__head">' +
          '<h3 class="pkg__name">' + esc(p.name) + '</h3>' +
          '<p class="pkg__tagline">' + esc(p.tagline) + '</p>' +
        '</header>' +
        '<div class="pkg__price">' +
          '<b>от ' + fmt(from) + ' ₽</b>' +
          '<span>' + (open ? 'дальше по проекту' : 'за парную под ключ') + '</span>' +
        '</div>' +
        '<p class="pkg__example">Финская сауна ' + bandText(fin) + ', русская парная ' + bandText(rus) +
          (ham ? ', хамам ' + bandText(ham) : '') +
          (open ? '. Верхнюю границу называем после замера' : '') + '</p>' +
        '<p class="pkg__wood"><span>Материал</span>' + esc(p.wood) + '</p>' +
        '<ul class="pkg__list">' +
          p.includes.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') +
        '</ul>' +
        (p.notIncluded && p.notIncluded.length
          ? '<p class="pkg__not">Не входит: ' + p.notIncluded.map(esc).join(', ') + '</p>' : '') +
        '<button type="button" class="btn ' + (p.popular ? 'btn--primary' : 'btn--ghost') + ' btn--block" ' +
          'data-open-pkg="' + p.id + '">' + (open ? 'Обсудить проект' : 'Рассчитать в этом пакете') + '</button>' +
      '</article>';
    }).join('');

    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-open-pkg]');
      if (!b || !window.LuchCalc) return;
      window.LuchCalc.state.pkg = b.dataset.openPkg;
      window.LuchCalc.open('full');
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
          (s.img ? '<img src="' + esc(s.img) + '" alt="' + esc(s.name) + '" loading="lazy" decoding="async" width="400" height="400">' : '') +
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
          '<button type="button" class="btn btn--primary btn--sm" data-stove-cta="' + esc(s.id) + '">Узнать точную стоимость</button>' +
        '</footer>' +
      '</article>';
    }

    var VISIBLE = 6;
    var expanded = false;
    var moreBtn = $('[data-stoves-more]');

    function draw() {
      var list = P.stoves.filter(match);
      var shown = expanded ? list : list.slice(0, VISIBLE);
      grid.innerHTML = shown.map(card).join('');
      if (empty) empty.hidden = list.length > 0;
      if (moreBtn) {
        var rest = list.length - shown.length;
        moreBtn.hidden = rest <= 0;
        moreBtn.textContent = 'Показать ещё ' + rest + (rest === 1 ? ' печь' : (rest < 5 ? ' печи' : ' печей'));
      }
    }

    if (moreBtn) moreBtn.addEventListener('click', function () { expanded = true; draw(); });

    function wire(sel, key, attr) {
      var box = $(sel);
      if (!box) return;
      box.addEventListener('click', function (e) {
        var b = e.target.closest('.chip');
        if (!b) return;
        $$('.chip', box).forEach(function (x) { x.classList.remove('is-on'); });
        b.classList.add('is-on');
        f[key] = b.dataset[attr];
        expanded = false;
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
      if (!s) return;
      window.LuchCalc.openStove(s, 'stove-card');
    });

    draw();
  })();

  /* ═══ Портфолио + лайтбокс ═════════════════════════════════════════════ */
  (function works() {
    var box = $('[data-works]');
    if (!box) return;
    var VISIBLE = 6;

    function photos(w) {
      // pics задаёт, какие именно кадры показывать: часть файлов объекта
      // в галерею не идёт — экстерьеры, санузлы, пустые стены.
      var nums = w.pics;
      if (!nums) { nums = []; for (var i = 1; i <= w.photos; i++) nums.push(i); }
      return nums.map(function (n) { return 'assets/img/works/' + w.id + '-' + n + '.webp'; });
    }

    box.innerHTML = P.works.map(function (w, idx) {
      var ph = photos(w);
      return '' +
      '<article class="work' + (idx >= VISIBLE ? ' is-hidden' : '') + '" data-work="' + esc(w.id) + '">' +
        '<button type="button" class="work__btn" data-open-work="' + idx + '" aria-label="Открыть галерею: ' + esc(w.title) + '">' +
          '<img src="' + esc(ph[0]) + '" alt="' + esc(w.title) + ', ' + esc(w.place) + '" loading="lazy" decoding="async" width="600" height="450">' +
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
          '<img src="assets/img/ui/' + esc(v.img) + '.webp" alt="' + esc(v.title) + '" loading="lazy" decoding="async" width="480" height="270">' +
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
      var mid = (P.company && P.company.yandexMetrikaId) || 0;
      if (mid && typeof window.ym === 'function') { try { window.ym(mid, 'reachGoal', 'video_play', { id: id }); } catch (err) {} }

      // Встроенный плеер YouTube в России не проигрывается — окно оставалось
      // чёрным. Пока ролики не перезальют на VK Видео или Rutube, открываем
      // в новой вкладке: клик работает, а не «ничего не происходит».
      window.open('https://www.youtube.com/watch?v=' + encodeURIComponent(id), '_blank', 'noopener');
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
          '<img src="' + esc(r.photo) + '" alt="" loading="lazy" decoding="async" width="48" height="48">' +
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
    // Длинная простыня вопросов режет конверсию: сразу показываем шесть,
    // которые снимают деньги, сроки и риски. Остальные — по кнопке.
    var VISIBLE = 6;
    box.innerHTML = P.faq.map(function (item, i) {
      return '' +
      '<details class="qa' + (i >= VISIBLE ? ' qa--extra' : '') + '"' +
        (i === 0 ? ' open' : '') + (i >= VISIBLE ? ' hidden' : '') + '>' +
        '<summary><span>' + esc(item.q) + '</span><i aria-hidden="true"></i></summary>' +
        '<div class="qa__body"><p>' + esc(item.a) + '</p></div>' +
      '</details>';
    }).join('');

    if (P.faq.length > VISIBLE) {
      var more = document.createElement('button');
      more.type = 'button';
      more.className = 'btn btn--ghost btn--block faq__more';
      var rest = P.faq.length - VISIBLE;
      var tail = rest % 10, tens = rest % 100;
      var word = (tail === 1 && tens !== 11) ? 'вопрос'
               : (tail >= 2 && tail <= 4 && (tens < 12 || tens > 14)) ? 'вопроса'
               : 'вопросов';
      more.textContent = 'Ещё ' + rest + ' ' + word;
      more.addEventListener('click', function () {
        $$('.qa--extra', box).forEach(function (d) { d.hidden = false; });
        more.remove();
      });
      box.appendChild(more);
    }

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

  /* ═══ Типографика: неразрывные пробелы ════════════════════════════════
     Русский текст на узком экране постоянно роняет предлог или союз на
     следующую строку — «и», «в», «по» повисают в конце. Проходим по тексту
     один раз после отрисовки и приклеиваем короткие слова к следующему.
     Работает и для того, что собрано из pricing.js, поэтому вызываем в конце.
     ═════════════════════════════════════════════════════════════════════ */
  (function typography() {
    // Предлоги, союзы и частицы, которые нельзя оставлять в конце строки
    var SHORT = /(^|[\s(«"])([А-Яа-яЁё]{1,2}|из|под|над|при|про|без|для|как|что|это|уже|или|его|её|их)\s+/g;
    // Число и единица измерения тоже должны жить на одной строке
    var UNITS = /(\d)\s+(₽|м²|м³|мм|см|м|кг|шт|дней|дня|день|мес|лет|года|год|тыс|млн|°C|%)/g;

    function fix(text) {
      return text.replace(SHORT, '$1$2\u00A0').replace(UNITS, '$1\u00A0$2');
    }

    var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, CODE: 1, PRE: 1 };

    function walk(node) {
      for (var n = node.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) {
          var t = fix(n.nodeValue);
          if (t !== n.nodeValue) n.nodeValue = t;
        } else if (n.nodeType === 1 && !SKIP[n.tagName]) {
          walk(n);
        }
      }
    }

    ['.section__title', '.section__lead', '.hero__title', '.hero__sub', '.hero__badge',
     '.why__card li', '.pkg__tagline', '.pkg__example', '.packages__note', '.stove__about',
     '.step__body', '.gcard', '.bundle__list li', '.production__copy', '.production__gallery figcaption',
     '.cta-mid__copy', '.qa__body', '.review blockquote', '.contacts__lead', '.calc__hint',
     '.pw', '.pricewhy__base', '.why__bundle li', '.why__cta span',
     '.calc__sub', '.calc__result-note', '.trustbar__proof p', '.offer__list li'
    ].forEach(function (sel) { $$(sel).forEach(walk); });
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
