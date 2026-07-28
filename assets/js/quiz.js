/* ============================================================================
   ПЕРВЫЙ ЛУЧ — конфигуратор-квиз в первом экране
   ----------------------------------------------------------------------------
   Одна карточка, три сценария (печь / отделка / комплект), живая вилка цены,
   автоподбор модели печи под объём парной и модалка захвата контакта.

   ВАЖНО для дизайна: разметка ниже задаёт классы и data-атрибуты, на которые
   опирается логика. Меняйте оформление (CSS) и порядок блоков свободно,
   но сохраняйте data-* атрибуты — см. docs/DESIGN_BRIEF.md.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.querySelector('[data-calc]');
  if (!root || !window.LUCH) return;

  var P = window.LUCH;
  var R = P.ranges;

  /* ---- Стартовая конфигурация из адреса страницы -------------------------
     Директ приземляет разные кампании на разные вкладки калькулятора:
       ?product=stove   — «Только печь»      (кампании по запросам «печь для бани»)
       ?product=finish  — «Отделка под ключ» (кампании «отделка парной», «баня под ключ»)
       ?product=both    — «Печь + отделка»   (общие и ретаргет)
     Дополнительно можно задать пакет: ?pkg=comfort|premium|author
     Метки чувствительны только к первому слову, регистр не важен.

     Почему по умолчанию «отделка» и пакет «Комфорт», а не комплект и «Премиум»:
     человек с холодного трафика в первые три секунды видит стартовую сумму.
     Комплект в «Премиуме» даёт больше миллиона — это отпугивает тех, кто
     пришёл по запросу про печь. Пусть первое впечатление будет полом цены,
     а не потолком: вкладку «Печь + отделка» с плашкой «выгодно» он увидит рядом.
  ------------------------------------------------------------------------- */
  var QS = new URLSearchParams(location.search || '');

  function paramOneOf(name, allowed, fallback) {
    var raw = (QS.get(name) || '').toLowerCase().trim();
    if (!raw) return fallback;
    var alias = {
      pech: 'stove', pechi: 'stove', 'печь': 'stove', 'печи': 'stove',
      otdelka: 'finish', 'отделка': 'finish', banya: 'finish', 'баня': 'finish',
      all: 'both', komplekt: 'both', 'комплект': 'both',
      author: 'author', avtorskiy: 'author',
    };
    var v = alias[raw] || raw;
    return allowed.indexOf(v) !== -1 ? v : fallback;
  }

  /* ---- Состояние --------------------------------------------------------- */
  var state = {
    mode: paramOneOf('product', ['stove', 'finish', 'both'], 'finish'),
    volume: R.volume.default,     // м³ — для печи
    area: R.area.default,         // м² — для отделки
    fuel: 'wood',
    tier: 'mid',
    steamType: 'russian',
    pkg: paramOneOf('pkg', ['comfort', 'premium', 'author'], 'comfort'),
    stoveOpts: new Set(P.stoveOptions.filter(function (o) { return o.default; }).map(function (o) { return o.id; })),
    finishOpts: new Set(),
    channel: 'whatsapp',
    stove: null,
    total: 0,
    totalMax: 0,
  };

  var MODES = [
    { id: 'stove',  label: 'Только печь',        hint: 'Подбор и монтаж' },
    { id: 'finish', label: 'Отделка под ключ',   hint: 'Парная целиком' },
    { id: 'both',   label: 'Печь + отделка',     hint: 'Выгоднее', best: true },
  ];

  var STEAM_TYPES = [
    { id: 'russian', label: 'Русская баня', hint: '60 °C · влажность 60%' },
    { id: 'finnish', label: 'Финская сауна', hint: '90–110 °C · сухой пар' },
    { id: 'hammam',  label: 'Хамам',         hint: '45 °C · влажность 100%' },
  ];

  var TIERS = [
    { id: 'base',    label: 'Бюджет' },
    { id: 'mid',     label: 'Оптимум' },
    { id: 'premium', label: 'Премиум' },
  ];

  /* ---- Утилиты ----------------------------------------------------------- */
  function fmt(n) { return Math.round(n || 0).toLocaleString('ru-RU').replace(/,/g, ' '); }

  // Вилка цены. Каждая сумма — неразрывный кусок вместе со знаком рубля,
  // перенос возможен только по тире. Так знак ₽ никогда не отрывается от числа
  // и не вылезает за край карточки, даже когда сумма семизначная.
  function rangeHtml() {
    return '<i>' + fmt(state.total) + '</i>&#8202;–&#8202;<i>' + fmt(state.totalMax) + '&nbsp;₽</i>';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function num(v, d) { return (v).toFixed(d).replace('.', ','); }

  // Псевдослучайное, но стабильное в течение дня число «заказали расчёт сегодня»
  function todayOrders() {
    var d = new Date();
    var seed = d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate();
    var hourFactor = Math.max(1, Math.round(d.getHours() / 2));
    return 4 + (seed % 7) + hourFactor;
  }

  /* ---- Подбор печи под объём -------------------------------------------- */
  function pickStove() {
    var list = P.stoves.filter(function (s) {
      return s.fuel === state.fuel && state.volume >= s.vmin - 2 && state.volume <= s.vmax + 2;
    });
    if (!list.length) {
      list = P.stoves.filter(function (s) { return s.fuel === state.fuel; });
    }
    var order = { base: 0, mid: 1, premium: 2 };
    var want = order[state.tier];
    list.sort(function (a, b) {
      var da = Math.abs(order[a.tier] - want), db = Math.abs(order[b.tier] - want);
      if (da !== db) return da - db;
      // при равном классе — тот, чей диапазон точнее накрывает объём
      var ca = Math.abs((a.vmin + a.vmax) / 2 - state.volume);
      var cb = Math.abs((b.vmin + b.vmax) / 2 - state.volume);
      return ca - cb;
    });
    return list[0] || null;
  }

  /* ---- Расчёт ------------------------------------------------------------ */
  function calc() {
    var stovePart = 0, finishPart = 0, gift = 0, discount = 0;
    state.stove = pickStove();

    if (state.mode === 'stove' || state.mode === 'both') {
      stovePart += state.stove ? state.stove.price : 0;
      P.stoveOptions.forEach(function (o) {
        if (state.stoveOpts.has(o.id)) stovePart += o.price;
      });
    }

    if (state.mode === 'finish' || state.mode === 'both') {
      var pkg = P.packages.find(function (p) { return p.id === state.pkg; }) || P.packages[1];
      finishPart += state.area * pkg.pricePerM2;
      // хамам дороже дерева: мокрая зона, плитка, парогенератор
      if (state.steamType === 'hammam') finishPart *= 1.25;
      P.finishOptions.forEach(function (o) {
        if (state.finishOpts.has(o.id)) finishPart += o.price;
      });
    }

    if (state.mode === 'both') {
      // В комплекте монтаж печи и дымоход входят в работы по отделке, поэтому
      // считаем их в смету и тут же дарим: сумма не меняется, но человек видит,
      // от чего именно он освобождён. Иначе строка «в подарок» обещала бы то,
      // чего в расчёте нет — а это первое, на чём ловят на замере.
      P.bundle.giftIds.forEach(function (id) {
        var o = P.stoveOptions.find(function (x) { return x.id === id; });
        if (!o) return;
        if (!state.stoveOpts.has(id)) stovePart += o.price;
        gift += o.price;
      });
      discount = finishPart * (P.bundle.discountPct / 100);
    }

    var total = Math.max(0, stovePart + finishPart - gift - discount);
    state.total = Math.round(total / 1000) * 1000;
    state.totalMax = Math.round((total * 1.22) / 1000) * 1000;
    state.gift = gift;
    state.discount = Math.round(discount);
    return state.total;
  }

  /* ---- Разметка ---------------------------------------------------------- */
  function optionRow(o, checked) {
    return '' +
      '<button type="button" class="calc-opt' + (checked ? ' is-on' : '') + '" data-opt="' + o.id + '">' +
        '<span class="calc-opt__box" aria-hidden="true"></span>' +
        '<span class="calc-opt__body">' +
          '<span class="calc-opt__name">' + esc(o.name) + '</span>' +
          (o.hint ? '<span class="calc-opt__hint">' + esc(o.hint) + '</span>' : '') +
        '</span>' +
        '<span class="calc-opt__price">+' + fmt(o.price) + ' ₽</span>' +
      '</button>';
  }

  function render() {
    calc();

    var showStove  = state.mode === 'stove' || state.mode === 'both';
    var showFinish = state.mode === 'finish' || state.mode === 'both';
    var pkg = P.packages.find(function (p) { return p.id === state.pkg; }) || P.packages[1];

    root.innerHTML = '' +
    '<div class="calc">' +

      '<div class="calc__head">' +
        '<h2 class="calc__title">Рассчитайте вашу баню</h2>' +
        '<p class="calc__sub">Минута — и вы знаете вилку цены. Без звонков и регистраций.</p>' +
      '</div>' +

      // ── Шаг 1: сценарий ──────────────────────────────────────────────
      '<div class="calc__field calc__field--modes">' +
        '<span class="calc__label"><i>1</i> Что нужно сделать?</span>' +
        '<div class="calc-modes" data-modes>' +
          MODES.map(function (m) {
            return '<button type="button" class="calc-mode' + (state.mode === m.id ? ' is-on' : '') + '" data-mode="' + m.id + '">' +
              (m.best ? '<span class="calc-mode__best">выгодно</span>' : '') +
              '<b>' + esc(m.label) + '</b><i>' + esc(m.hint) + '</i></button>';
          }).join('') +
        '</div>' +
      '</div>' +

      // ── Ветка «отделка» ──────────────────────────────────────────────
      (showFinish ? (
        '<div class="calc__field">' +
          '<span class="calc__label"><i>' + (showStove ? '2' : '2') + '</i> Площадь парной' +
            '<b class="calc__value" data-area-val>' + num(state.area, 1) + ' м²</b></span>' +
          '<div class="calc-range">' +
            '<input type="range" min="' + R.area.min + '" max="' + R.area.max + '" step="' + R.area.step + '" value="' + state.area + '" data-area aria-label="Площадь парной в м²">' +
            '<div class="calc-range__scale"><span>' + R.area.min + ' м²</span><span>' + R.area.max + ' м²</span></div>' +
          '</div>' +
        '</div>' +

        '<div class="calc__field">' +
          '<span class="calc__label">Тип парной</span>' +
          '<div class="calc-radio" data-steam>' +
            STEAM_TYPES.map(function (t) {
              return '<button type="button" class="calc-radio__opt' + (state.steamType === t.id ? ' is-on' : '') + '" data-steam-id="' + t.id + '">' +
                '<b>' + esc(t.label) + '</b><i>' + esc(t.hint) + '</i></button>';
            }).join('') +
          '</div>' +
        '</div>' +

        '<div class="calc__field">' +
          '<span class="calc__label">Уровень отделки</span>' +
          '<div class="calc-radio calc-radio--pkg" data-pkg>' +
            P.packages.map(function (p) {
              return '<button type="button" class="calc-radio__opt' + (state.pkg === p.id ? ' is-on' : '') + '" data-pkg-id="' + p.id + '">' +
                (p.popular ? '<span class="calc-mode__best">хит</span>' : '') +
                '<b>' + esc(p.name) + '</b><i>' + esc(p.wood) + '</i></button>';
            }).join('') +
          '</div>' +
          '<p class="calc__hint">' + esc(pkg.tagline) + ' · от ' + fmt(pkg.pricePerM2) + ' ₽/м²</p>' +
        '</div>' +

        '<details class="calc__more"' + (state.finishOpts.size ? ' open' : '') + '>' +
          '<summary>Добавить к парной <span>' + (state.finishOpts.size ? '(' + state.finishOpts.size + ')' : '') + '</span></summary>' +
          '<div class="calc-opts" data-finish-opts>' +
            P.finishOptions.map(function (o) { return optionRow(o, state.finishOpts.has(o.id)); }).join('') +
          '</div>' +
        '</details>'
      ) : '') +

      // ── Ветка «печь» ─────────────────────────────────────────────────
      (showStove ? (
        '<div class="calc__field">' +
          '<span class="calc__label"><i>' + (showFinish ? '3' : '2') + '</i> Объём парной' +
            '<b class="calc__value" data-volume-val>' + state.volume + ' м³</b></span>' +
          '<div class="calc-range">' +
            '<input type="range" min="' + R.volume.min + '" max="' + R.volume.max + '" step="' + R.volume.step + '" value="' + state.volume + '" data-volume aria-label="Объём парной в м³">' +
            '<div class="calc-range__scale"><span>' + R.volume.min + ' м³</span><span>' + R.volume.max + ' м³</span></div>' +
          '</div>' +
          '<p class="calc__hint">Длина × ширина × высота. Есть окно или стеклянная дверь — прибавьте 25%.</p>' +
        '</div>' +

        '<div class="calc__field calc__field--row">' +
          '<div>' +
            '<span class="calc__label">Топливо</span>' +
            '<div class="calc-radio calc-radio--slim" data-fuel>' +
              '<button type="button" class="calc-radio__opt' + (state.fuel === 'wood' ? ' is-on' : '') + '" data-fuel-id="wood"><b>Дрова</b></button>' +
              '<button type="button" class="calc-radio__opt' + (state.fuel === 'electric' ? ' is-on' : '') + '" data-fuel-id="electric"><b>Электро</b></button>' +
            '</div>' +
          '</div>' +
          '<div>' +
            '<span class="calc__label">Класс печи</span>' +
            '<div class="calc-radio calc-radio--slim" data-tier>' +
              TIERS.map(function (t) {
                return '<button type="button" class="calc-radio__opt' + (state.tier === t.id ? ' is-on' : '') + '" data-tier-id="' + t.id + '"><b>' + esc(t.label) + '</b></button>';
              }).join('') +
            '</div>' +
          '</div>' +
        '</div>' +

        (state.stove ? (
          '<div class="calc-pick" data-pick>' +
            '<div class="calc-pick__img">' +
              (state.stove.img ? '<img src="' + esc(state.stove.img) + '" alt="' + esc(state.stove.name) + '" loading="lazy">' : '') +
            '</div>' +
            '<div class="calc-pick__body">' +
              '<span class="calc-pick__label">Подходит вашей парной</span>' +
              '<b class="calc-pick__name">' + esc(state.stove.name) + '</b>' +
              '<span class="calc-pick__meta">' + esc(state.stove.brand) + ' · ' + state.stove.vmin + '–' + state.stove.vmax + ' м³</span>' +
            '</div>' +
            '<div class="calc-pick__price">' + fmt(state.stove.price) + ' ₽</div>' +
          '</div>'
        ) : '') +

        '<details class="calc__more"' + (state.stoveOpts.size ? ' open' : '') + '>' +
          '<summary>Обвязка и монтаж <span>(' + state.stoveOpts.size + ')</span></summary>' +
          '<div class="calc-opts" data-stove-opts>' +
            P.stoveOptions.map(function (o) { return optionRow(o, state.stoveOpts.has(o.id)); }).join('') +
          '</div>' +
        '</details>'
      ) : '') +

      // ── Итог ─────────────────────────────────────────────────────────
      '<div class="calc__result" data-result>' +
        '<div class="calc__result-row">' +
          '<span>Ориентир по вашей конфигурации</span>' +
          '<b data-total>' + rangeHtml() + '</b>' +
        '</div>' +
        (state.mode === 'both' && (state.gift || state.discount) ?
          '<div class="calc__result-gift">' +
            '<span class="calc__gift-icon" aria-hidden="true">★</span>' +
            'Выгода комплекта: ' + fmt(state.gift + state.discount) + ' ₽ — ' +
            esc(P.bundle.label.toLowerCase()) + ' ' + esc(P.bundle.discountLabel) +
          '</div>' : '') +
        '<p class="calc__result-note">Вилка, а не финальная цена: точную смету инженер посчитает после бесплатного замера.</p>' +
      '</div>' +

      // ── CTA ──────────────────────────────────────────────────────────
      '<div class="calc__cta">' +
        '<span class="calc__label calc__label--cta">Куда прислать расчёт и 3D-эскиз?</span>' +
        '<div class="calc-actions">' +
          '<button type="button" class="btn btn--messenger" data-cta="whatsapp">' +
            '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.52 3.48A11.93 11.93 0 0 0 12.04 0C5.45 0 .09 5.36.09 11.95c0 2.11.55 4.17 1.6 5.99L0 24l6.22-1.63a11.94 11.94 0 0 0 5.82 1.49c6.59 0 11.95-5.36 11.95-11.95 0-3.19-1.24-6.19-3.48-8.43ZM12.04 21.79a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-3.69.97.99-3.6-.24-.37a9.91 9.91 0 0 1-1.52-5.25c0-5.48 4.46-9.94 9.94-9.94 2.65 0 5.15 1.04 7.03 2.91a9.87 9.87 0 0 1 2.91 7.03c0 5.49-4.46 9.94-9.94 9.94Z"/></svg>' +
            'В мессенджер</button>' +
          '<button type="button" class="btn btn--phone" data-cta="call">' +
            '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.49 15.36 17 14.6c-.5-.1-1 .04-1.36.4l-2.34 2.32c-3.5-1.78-6.4-4.62-8.18-8.18l2.34-2.36c.36-.36.5-.86.4-1.36L7.1 1.93C6.94 1.19 6.24.66 5.48.66H2.84c-.94 0-1.72.78-1.72 1.72C1.12 14.43 9.7 23 22.06 23c.94 0 1.72-.78 1.72-1.72v-2.66c0-.74-.5-1.42-1.29-1.62Z"/></svg>' +
            'По телефону</button>' +
        '</div>' +
        '<div class="calc__social"><span class="calc__pulse" aria-hidden="true"></span>' +
          'Сегодня заказали расчёт: <b>' + todayOrders() + '</b></div>' +
      '</div>' +

    '</div>';

    bind();
    syncSlider('[data-area]');
    syncSlider('[data-volume]');
  }

  /* ---- Ползунок: заливка до бегунка ------------------------------------- */
  function syncSlider(sel) {
    var el = root.querySelector(sel);
    if (!el) return;
    var min = +el.min, max = +el.max, v = +el.value;
    el.style.setProperty('--fill', (((v - min) / (max - min)) * 100).toFixed(1) + '%');
  }

  /* ---- Обработчики ------------------------------------------------------- */
  function bind() {
    root.querySelectorAll('[data-mode]').forEach(function (b) {
      b.addEventListener('click', function () { state.mode = b.dataset.mode; render(); });
    });

    var area = root.querySelector('[data-area]');
    if (area) area.addEventListener('input', function () {
      state.area = parseFloat(area.value);
      root.querySelector('[data-area-val]').textContent = num(state.area, 1) + ' м²';
      syncSlider('[data-area]');
      updateResult();
    });

    var vol = root.querySelector('[data-volume]');
    if (vol) vol.addEventListener('input', function () {
      state.volume = parseInt(vol.value, 10);
      root.querySelector('[data-volume-val]').textContent = state.volume + ' м³';
      syncSlider('[data-volume]');
      updatePick();
    });

    root.querySelectorAll('[data-steam-id]').forEach(function (b) {
      b.addEventListener('click', function () { state.steamType = b.dataset.steamId; render(); });
    });
    root.querySelectorAll('[data-pkg-id]').forEach(function (b) {
      b.addEventListener('click', function () { state.pkg = b.dataset.pkgId; render(); });
    });
    root.querySelectorAll('[data-fuel-id]').forEach(function (b) {
      b.addEventListener('click', function () { state.fuel = b.dataset.fuelId; render(); });
    });
    root.querySelectorAll('[data-tier-id]').forEach(function (b) {
      b.addEventListener('click', function () { state.tier = b.dataset.tierId; render(); });
    });

    var fo = root.querySelector('[data-finish-opts]');
    if (fo) fo.addEventListener('click', function (e) {
      var b = e.target.closest('[data-opt]'); if (!b) return;
      toggle(state.finishOpts, b.dataset.opt); b.classList.toggle('is-on');
      updateResult();
    });

    var so = root.querySelector('[data-stove-opts]');
    if (so) so.addEventListener('click', function (e) {
      var b = e.target.closest('[data-opt]'); if (!b) return;
      toggle(state.stoveOpts, b.dataset.opt); b.classList.toggle('is-on');
      updateResult();
    });

    root.querySelectorAll('[data-cta]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.channel = b.dataset.cta;
        openModal();
      });
    });
  }

  function toggle(set, id) { if (set.has(id)) set.delete(id); else set.add(id); }

  function updateResult() {
    calc();
    var el = root.querySelector('[data-total]');
    if (el) el.innerHTML = rangeHtml();
  }

  // Пересобирает карточку подобранной печи без полной перерисовки
  function updatePick() {
    calc();
    var pick = root.querySelector('[data-pick]');
    if (pick && state.stove) {
      pick.querySelector('.calc-pick__name').textContent = state.stove.name;
      pick.querySelector('.calc-pick__meta').textContent = state.stove.brand + ' · ' + state.stove.vmin + '–' + state.stove.vmax + ' м³';
      pick.querySelector('.calc-pick__price').textContent = fmt(state.stove.price) + ' ₽';
      var img = pick.querySelector('img');
      if (img && state.stove.img) { img.src = state.stove.img; img.alt = state.stove.name; }
    }
    updateResult();
  }

  /* ---- Сводка конфигурации для менеджера --------------------------------- */
  function summary() {
    var lines = [];
    var modeLabel = (MODES.find(function (m) { return m.id === state.mode; }) || {}).label;
    lines.push('Сценарий: ' + modeLabel);

    if (state.mode !== 'stove') {
      var pkg = P.packages.find(function (p) { return p.id === state.pkg; });
      var st = STEAM_TYPES.find(function (t) { return t.id === state.steamType; });
      lines.push('Парная: ' + num(state.area, 1) + ' м², ' + (st ? st.label : ''));
      lines.push('Пакет отделки: ' + (pkg ? pkg.name + ' (' + fmt(pkg.pricePerM2) + ' ₽/м²)' : ''));
      if (state.finishOpts.size) {
        lines.push('Допы: ' + P.finishOptions.filter(function (o) { return state.finishOpts.has(o.id); })
          .map(function (o) { return o.name; }).join(', '));
      }
    }
    if (state.mode !== 'finish') {
      lines.push('Объём парной: ' + state.volume + ' м³, ' + (state.fuel === 'wood' ? 'дровяная' : 'электрическая'));
      if (state.stove) lines.push('Подобрана печь: ' + state.stove.name + ' — ' + fmt(state.stove.price) + ' ₽');
      if (state.stoveOpts.size) {
        lines.push('Обвязка: ' + P.stoveOptions.filter(function (o) { return state.stoveOpts.has(o.id); })
          .map(function (o) { return o.name; }).join(', '));
      }
    }
    lines.push('Расчёт: ' + fmt(state.total) + ' – ' + fmt(state.totalMax) + ' ₽');
    if (state.mode === 'both') lines.push('Выгода комплекта: ' + fmt(state.gift + state.discount) + ' ₽');
    return lines.join('\n');
  }

  function quizPayload() {
    return {
      mode: state.mode,
      area_m2: state.mode === 'stove' ? null : state.area,
      volume_m3: state.mode === 'finish' ? null : state.volume,
      steam_type: state.steamType,
      package: state.pkg,
      fuel: state.fuel,
      tier: state.tier,
      stove: state.stove ? state.stove.name : '',
      stove_price: state.stove ? state.stove.price : 0,
      finish_options: [].concat(Array.from(state.finishOpts)),
      stove_options: [].concat(Array.from(state.stoveOpts)),
      entry_product: QS.get('product') || '',
      estimate_min: state.total,
      estimate_max: state.totalMax,
      bundle_saving: state.mode === 'both' ? (state.gift + state.discount) : 0,
      summary: summary(),
    };
  }

  /* ---- Модалка ----------------------------------------------------------- */
  var modal = null;

  var TIMINGS = [
    { id: 'now',   label: 'Уже сейчас' },
    { id: '1-3m',  label: 'В ближайшие 1–3 мес.' },
    { id: 'later', label: 'Позже, присматриваюсь' },
  ];

  function buildModal() {
    var wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.setAttribute('hidden', '');
    wrap.innerHTML = '' +
      '<div class="modal__frame" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
        '<button type="button" class="modal__close" data-close aria-label="Закрыть">✕</button>' +
        '<h3 class="modal__title" id="modal-title" data-modal-title>Пришлём расчёт в мессенджер</h3>' +
        '<p class="modal__sub" data-modal-sub>Инженер пришлёт три варианта сметы и 3D-эскиз парной. Ответим в течение 30 минут в рабочее время.</p>' +

        '<div class="modal__summary" data-modal-summary></div>' +

        '<div class="modal__channels" data-channels>' +
          '<button type="button" class="modal__chan" data-chan="whatsapp">WhatsApp</button>' +
          '<button type="button" class="modal__chan" data-chan="telegram">Telegram</button>' +
          (P.company.maxUrl ? '<button type="button" class="modal__chan" data-chan="max">MAX</button>' : '') +
          '<button type="button" class="modal__chan" data-chan="call">Звонок</button>' +
        '</div>' +

        '<form data-form="lead" data-lead-source="calc" novalidate>' +
          '<input type="text" name="website" class="form-honey" tabindex="-1" autocomplete="off" aria-hidden="true">' +
          '<input type="hidden" name="channel" data-channel-input value="whatsapp">' +
          '<input type="hidden" name="timing" data-timing-input value="">' +
          '<label class="field"><span class="field__label">Имя</span>' +
            '<input class="input" type="text" name="name" placeholder="Как к вам обращаться" required minlength="2" autocomplete="name"></label>' +
          '<label class="field"><span class="field__label">Телефон</span>' +
            '<input class="input" type="tel" name="phone" placeholder="+7 (___) ___-__-__" required autocomplete="tel" inputmode="tel"></label>' +
          '<div class="field">' +
            '<span class="field__label">Когда планируете начать?</span>' +
            '<div class="chips chips--timing" data-timings>' +
              TIMINGS.map(function (t) { return '<button type="button" class="chip" data-timing="' + t.id + '">' + esc(t.label) + '</button>'; }).join('') +
            '</div>' +
          '</div>' +
          '<button type="submit" class="btn btn--primary btn--lg btn--block">Получить расчёт</button>' +
          '<p class="policy">Нажимая кнопку, вы соглашаетесь с <a href="policy.html" target="_blank" rel="noopener">политикой обработки персональных данных</a>. Спама не будет.</p>' +
          '<div class="form-status" role="status" aria-live="polite"></div>' +
        '</form>' +
      '</div>';

    document.body.appendChild(wrap);

    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    wrap.querySelector('[data-close]').addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !wrap.hasAttribute('hidden')) close(); });

    wrap.querySelectorAll('[data-chan]').forEach(function (b) {
      b.addEventListener('click', function () { state.channel = b.dataset.chan; syncChannel(); });
    });
    wrap.querySelectorAll('[data-timing]').forEach(function (b) {
      b.addEventListener('click', function () {
        wrap.querySelectorAll('[data-timing]').forEach(function (x) { x.classList.remove('is-on'); });
        b.classList.add('is-on');
        wrap.querySelector('[data-timing-input]').value = b.dataset.timing;
      });
    });

    var form = wrap.querySelector('form');
    window.LuchLead.bindPhone(form.querySelector('input[type="tel"]'));
    form.dataset.leadBound = '1';
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      window.LuchLead.submit(form, { quiz: quizPayload() }, function () { success(wrap); });
    });

    return wrap;
  }

  function success(wrap) {
    wrap.querySelector('.modal__frame').innerHTML =
      '<button type="button" class="modal__close" data-close aria-label="Закрыть">✕</button>' +
      '<div class="modal__success">' +
        '<div class="modal__success-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="m9 16.17-4.17-4.17-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></div>' +
        '<h3>Заявка принята</h3>' +
        '<p>Инженер свяжется в течение 30 минут в рабочее время и пришлёт три варианта сметы с 3D-эскизом. Бесплатно и без обязательств.</p>' +
        '<a href="' + window.LuchLead.thanksUrl + '" class="btn btn--primary btn--lg btn--block">Хорошо</a>' +
      '</div>';
    wrap.querySelector('[data-close]').addEventListener('click', close);
    setTimeout(function () { location.assign(window.LuchLead.thanksUrl); }, 2500);
  }

  function syncChannel() {
    if (!modal) return;
    modal.querySelectorAll('[data-chan]').forEach(function (b) {
      b.classList.toggle('is-on', b.dataset.chan === state.channel);
    });
    modal.querySelector('[data-channel-input]').value = state.channel;
    var call = state.channel === 'call';
    modal.querySelector('[data-modal-title]').textContent = call ? 'Перезвоним с расчётом' : 'Пришлём расчёт в мессенджер';
    modal.querySelector('[data-modal-sub]').textContent = call
      ? 'Инженер позвонит в течение 30 минут в рабочее время и на словах даст вилку по вашей конфигурации.'
      : 'Инженер пришлёт три варианта сметы и 3D-эскиз парной. Ответим в течение 30 минут в рабочее время.';
  }

  function fillSummary() {
    var box = modal.querySelector('[data-modal-summary]');
    if (!box) return;
    calc();
    var rows = summary().split('\n').filter(function (r) { return r.indexOf('Расчёт:') !== 0; });
    box.innerHTML =
      '<div class="modal__summary-price"><span>Ваш расчёт</span><b>' + rangeHtml() + '</b></div>' +
      '<ul>' + rows.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>';
  }

  function openModal() {
    if (!modal) modal = buildModal();
    syncChannel();
    fillSummary();
    modal.removeAttribute('hidden');
    document.body.classList.add('is-locked');
    setTimeout(function () {
      var f = modal.querySelector('input[name="name"]');
      if (f) f.focus({ preventScroll: true });
    }, 60);
  }

  function close() {
    if (modal) modal.setAttribute('hidden', '');
    document.body.classList.remove('is-locked');
  }

  /* ---- Публичный API для кнопок вне калькулятора ------------------------- */
  window.LuchCalc = {
    open: function (mode) {
      if (mode && MODES.some(function (m) { return m.id === mode; })) { state.mode = mode; render(); }
      var el = document.getElementById('calc');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    openModal: function (source) {
      if (!modal) modal = buildModal();
      var form = modal.querySelector('form');
      if (form && source) form.dataset.leadSource = source;
      openModal();
    },
    state: state,
  };

  render();
})();
