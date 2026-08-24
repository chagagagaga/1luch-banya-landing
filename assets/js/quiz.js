/* ============================================================================
   ПЕРВЫЙ ЛУЧ — конфигуратор-квиз в первом экране
   ----------------------------------------------------------------------------
   Два сценария: «Только печь» и «Парная под ключ». Отделки без печи не бывает —
   печь задаёт объём, вентиляцию, расположение полков и противопожарные отступы,
   поэтому она входит в оба сценария.

   Считаем в квадратных метрах пола при стандартной высоте 2,4 м: заказчик знает
   площадь и почти никогда не знает кубатуру. Объём для подбора печи получаем
   пересчётом, с поправками на стекло и холодные стены.

   ВАЖНО для дизайна: логика цепляется за data-* атрибуты — см. docs/DESIGN_BRIEF.md.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.querySelector('[data-calc]');
  if (!root || !window.LUCH) return;

  var P = window.LUCH;
  var R = P.ranges;
  var RULES = P.calcRules;

  /* ---- Стартовая конфигурация из адреса страницы -------------------------
     Кампании Директа приземляются на нужный сценарий:
       ?product=stove — «Только печь»
       ?product=full  — «Парная под ключ»
     Дополнительно: ?pkg=comfort|premium|author
  ------------------------------------------------------------------------- */
  var QS = new URLSearchParams(location.search || '');

  function paramOneOf(name, allowed, fallback) {
    var raw = (QS.get(name) || '').toLowerCase().trim();
    if (!raw) return fallback;
    var alias = {
      pech: 'stove', 'печь': 'stove', pechi: 'stove',
      otdelka: 'full', 'отделка': 'full', banya: 'full', 'баня': 'full', both: 'full',
      avtorskiy: 'author', 'авторский': 'author',
    };
    var v = alias[raw] || raw;
    return allowed.indexOf(v) !== -1 ? v : fallback;
  }

  /* ---- Состояние --------------------------------------------------------- */
  var state = {
    mode: paramOneOf('product', ['stove', 'full'], 'full'),
    area: R.area.default,          // м² пола парной
    glass: 0,                      // м² стекла — каждый метр добавляет 1 м³
    coldWall: false,               // улица или неутеплённая стена: +50%
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
    byProject: false,
  };

  var MODES = [
    { id: 'stove', label: 'Только печь', hint: 'Подбор и монтаж' },
    { id: 'full',  label: 'Парная под ключ', hint: 'Отделка вместе с печью', best: true },
  ];

  var TIERS = [
    { id: 'base',    label: 'Бюджет' },
    { id: 'mid',     label: 'Оптимум' },
    { id: 'premium', label: 'Премиум' },
  ];

  /* ---- Утилиты ----------------------------------------------------------- */
  function fmt(n) { return Math.round(n || 0).toLocaleString('ru-RU').replace(/,/g, ' '); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function num(v, d) { return (v).toFixed(d).replace('.', ','); }

  // Диапазон цены. Каждая сумма — неразрывный кусок вместе со знаком рубля,
  // перенос возможен только по тире.
  function rangeHtml() {
    // Авторский проект и хамам: верхней границы нет, называем точку входа.
    if (state.byProject) {
      return state.total ? '<i>от ' + fmt(state.total) + '&nbsp;₽</i>' : '<i>Цена по проекту</i>';
    }
    return '<i>' + fmt(state.total) + '</i>&#8201;–&#8201;<i>' + fmt(state.totalMax) + '&nbsp;₽</i>';
  }

  function todayOrders() {
    var d = new Date();
    return 4 + ((d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) % 7) + Math.max(1, Math.round(d.getHours() / 2));
  }

  /* ---- Расчётный объём парной -------------------------------------------
     Площадь × высота 2,4 м, плюс кубометр на каждый квадрат стекла,
     плюс 50% если стена выходит на улицу или не утеплена.
     Кирпичная стена в расчёт не идёт.
  ------------------------------------------------------------------------- */
  function volume() {
    var v = state.area * RULES.ceilingHeight + state.glass * RULES.glassPerM2;
    if (state.coldWall) v *= (1 + RULES.coldWallSurcharge);
    return Math.round(v);
  }

  /* ---- Подбор печи под объём -------------------------------------------- */
  function pickStove() {
    var vol = volume();
    var list = P.stoves.filter(function (s) {
      return s.fuel === state.fuel && vol >= s.vmin - 2 && vol <= s.vmax + 2;
    });
    if (!list.length) list = P.stoves.filter(function (s) { return s.fuel === state.fuel; });
    var order = { base: 0, mid: 1, premium: 2 };
    var want = order[state.tier];
    list.sort(function (a, b) {
      var da = Math.abs(order[a.tier] - want), db = Math.abs(order[b.tier] - want);
      if (da !== db) return da - db;
      return Math.abs((a.vmin + a.vmax) / 2 - vol) - Math.abs((b.vmin + b.vmax) / 2 - vol);
    });
    return list[0] || null;
  }

  function currentPkg() {
    return P.packages.filter(function (p) { return p.id === state.pkg; })[0] || P.packages[0];
  }

  /* ---- Диапазон прайса под выбранный тип парной --------------------------
     Прайс Влада — главная цифра. Расчёт по метрам только двигает цену внутри
     диапазона: ниже нижней границы калькулятор уйти не может.
  ------------------------------------------------------------------------- */
  function priceBand(pkg) {
    var b = pkg && pkg.projectPrice;
    if (!b) return null;
    return b[state.steamType] || b.russian || null;
  }

  /* ---- Расчёт ------------------------------------------------------------ */
  function calc() {
    state.stove = pickStove();
    state.byProject = false;

    // Хамам делается только в авторском исполнении
    if (state.steamType === 'hammam') state.pkg = 'author';

    var stovePart = state.stove ? state.stove.price : 0;
    P.stoveOptions.forEach(function (o) { if (state.stoveOpts.has(o.id)) stovePart += o.price; });

    if (state.mode === 'stove') {
      state.total = Math.round(stovePart / 1000) * 1000;
      state.totalMax = Math.round(stovePart * 1.18 / 1000) * 1000;
      return;
    }

    var pkg = currentPkg();
    var band = priceBand(pkg);

    // Авторский проект и хамам не тарифицируются за метр — считаем
    // индивидуально, но точку входа называем сразу.
    if (!pkg.pricePerM2) {
      state.byProject = true;
      state.total = band ? band.min : 0;
      state.totalMax = 0;
      return;
    }

    var rate = state.steamType === 'finnish' ? 'finnish' : 'russian';
    var finishPart = state.area * pkg.pricePerM2[rate];
    P.finishOptions.forEach(function (o) { if (state.finishOpts.has(o.id)) finishPart += o.price; });

    // Печь входит в отделку во всех пакетах
    var total = finishPart + stovePart;
    // Держим цену внутри прайса: не ниже нижней границы и не уже верхней.
    var low = band ? Math.max(total, band.min) : total;
    var high = total * 1.22;
    if (band && band.max) high = Math.max(high, band.max);
    state.total = Math.round(low / 1000) * 1000;
    state.totalMax = Math.round(high / 1000) * 1000;
  }

  // Подпись диапазона пакета: «850 000 – 1 500 000 ₽» или «от 2 500 000 ₽».
  function bandLabel(pkg) {
    var band = priceBand(pkg);
    if (!band) return '';
    if (!band.max) return ' · от ' + fmt(band.min) + ' ₽, ' + (pkg.priceNote || 'по проекту');
    return ' · ' + fmt(band.min) + ' – ' + fmt(band.max) + ' ₽ под ключ';
  }

  /* ---- Разметка ---------------------------------------------------------- */
  function optionRow(o, checked) {
    return '<button type="button" class="calc-opt' + (checked ? ' is-on' : '') + '" data-opt="' + o.id + '">' +
      '<span class="calc-opt__box" aria-hidden="true"></span>' +
      '<span class="calc-opt__body"><span class="calc-opt__name">' + esc(o.name) + '</span>' +
      (o.hint ? '<span class="calc-opt__hint">' + esc(o.hint) + '</span>' : '') + '</span>' +
      '<span class="calc-opt__price">+' + fmt(o.price) + ' ₽</span></button>';
  }

  function render() {
    calc();
    var full = state.mode === 'full';
    var pkg = currentPkg();

    root.innerHTML = '' +
    '<div class="calc">' +

      '<div class="calc__head">' +
        '<h2 class="calc__title">Рассчитайте вашу баню</h2>' +
        '<p class="calc__sub">Минута — и вы знаете диапазон цены. Без звонков и регистраций.</p>' +
      '</div>' +

      '<div class="calc__field calc__field--modes">' +
        '<span class="calc__label"><i>1</i> Что нужно сделать?</span>' +
        '<div class="calc-modes" data-modes>' +
          MODES.map(function (m) {
            return '<button type="button" class="calc-mode' + (state.mode === m.id ? ' is-on' : '') + '" data-mode="' + m.id + '">' +
              (m.best ? '<span class="calc-mode__best">чаще всего</span>' : '') +
              '<b>' + esc(m.label) + '</b><i>' + esc(m.hint) + '</i></button>';
          }).join('') +
        '</div>' +
        '<p class="calc__hint">Отделки без печи не бывает: печь задаёт объём, вентиляцию и расположение полков. Поэтому она входит в оба варианта.</p>' +
      '</div>' +

      '<div class="calc__field">' +
        '<span class="calc__label"><i>2</i> Площадь парной' +
          '<b class="calc__value" data-area-val>' + num(state.area, 1) + ' м²</b></span>' +
        '<div class="calc-range">' +
          '<input type="range" min="' + R.area.min + '" max="' + R.area.max + '" step="' + R.area.step + '" value="' + state.area + '" data-area aria-label="Площадь парной в м²">' +
          '<div class="calc-range__scale"><span>' + R.area.min + ' м²</span><span>' + R.area.max + ' м²</span></div>' +
        '</div>' +
        '<p class="calc__hint">Площадь пола при высоте потолка 2,4 м. Расчётный объём для печи — <b data-vol>' + volume() + ' м³</b>.</p>' +
      '</div>' +

      '<details class="calc__more"' + (state.glass || state.coldWall ? ' open' : '') + '>' +
        '<summary>Уточнить объём <span>' + (state.glass || state.coldWall ? '(учтено)' : '') + '</span></summary>' +
        '<div class="calc__field" style="margin-top:.8rem">' +
          '<span class="calc__label">Площадь стекла' +
            '<b class="calc__value" data-glass-val>' + num(state.glass, 1) + ' м²</b></span>' +
          '<div class="calc-range">' +
            '<input type="range" min="0" max="6" step="0.5" value="' + state.glass + '" data-glass aria-label="Площадь стекла в м²">' +
            '<div class="calc-range__scale"><span>нет</span><span>6 м²</span></div>' +
          '</div>' +
          '<p class="calc__hint">Каждый квадратный метр стекла считаем как дополнительный кубометр парной.</p>' +
        '</div>' +
        '<div class="calc-opts">' +
          '<button type="button" class="calc-opt' + (state.coldWall ? ' is-on' : '') + '" data-cold>' +
            '<span class="calc-opt__box" aria-hidden="true"></span>' +
            '<span class="calc-opt__body"><span class="calc-opt__name">Стена на улицу или без утепления</span>' +
            '<span class="calc-opt__hint">Добавляем 50% к расчётному объёму. Кирпичная стена в расчёт не идёт</span></span>' +
          '</button>' +
        '</div>' +
      '</details>' +

      (full ? (
        '<div class="calc__field">' +
          '<span class="calc__label"><i>3</i> Тип парной</span>' +
          '<div class="calc-radio" data-steam>' +
            P.steamTypes.map(function (t) {
              return '<button type="button" class="calc-radio__opt' + (state.steamType === t.id ? ' is-on' : '') + '" data-steam-id="' + t.id + '">' +
                '<b>' + esc(t.label) + '</b><i>' + esc(t.hint) + '</i></button>';
            }).join('') +
          '</div>' +
        '</div>' +

        '<div class="calc__field">' +
          '<span class="calc__label"><i>4</i> Уровень отделки</span>' +
          '<div class="calc-radio calc-radio--pkg" data-pkg>' +
            P.packages.map(function (p) {
              var locked = state.steamType === 'hammam' && p.id !== 'author';
              return '<button type="button" class="calc-radio__opt' + (state.pkg === p.id ? ' is-on' : '') + '"' +
                (locked ? ' disabled style="opacity:.4"' : '') + ' data-pkg-id="' + p.id + '">' +
                (p.popular ? '<span class="calc-mode__best">хит</span>' : '') +
                '<b>' + esc(p.name) + '</b><i>' + esc(p.wood) + '</i></button>';
            }).join('') +
          '</div>' +
          '<p class="calc__hint">' + esc(pkg.tagline) + esc(bandLabel(pkg)) + '</p>' +
        '</div>' +

        '<details class="calc__more"' + (state.finishOpts.size ? ' open' : '') + '>' +
          '<summary>Добавить к парной <span>' + (state.finishOpts.size ? '(' + state.finishOpts.size + ')' : '') + '</span></summary>' +
          '<div class="calc-opts" data-finish-opts>' +
            P.finishOptions.map(function (o) { return optionRow(o, state.finishOpts.has(o.id)); }).join('') +
          '</div>' +
        '</details>'
      ) : '') +

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
          '<div class="calc-pick__img">' + (state.stove.img ? '<img src="' + esc(state.stove.img) + '" alt="' + esc(state.stove.name) + '" loading="lazy">' : '') + '</div>' +
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
      '</details>' +

      '<div class="calc__result" data-result>' +
        '<div class="calc__result-row">' +
          '<span>' + (state.byProject ? 'Ваш проект' : 'Ориентир по вашей конфигурации') + '</span>' +
          '<b data-total>' + rangeHtml() + '</b>' +
        '</div>' +
        '<div class="calc__result-gift">' +
          '<span class="calc__gift-icon" aria-hidden="true">★</span>' + esc(P.promo.title) +
        '</div>' +
        '<p class="calc__result-note">' +
          (state.byProject
            ? 'Авторский проект и хамам считаются индивидуально: состав работ и материалы каждый раз свои, верхней границы нет. Инженер посчитает после замера.'
            : 'Диапазон, а не финальная цена: на итог влияют объём парной, выбранная печь и инженерные решения. Точную смету инженер посчитает после замера.') +
        '</p>' +
      '</div>' +

      '<div class="calc__cta">' +
        '<span class="calc__label calc__label--cta">Куда прислать расчёт?</span>' +
        '<div class="calc-actions">' +
          '<button type="button" class="btn btn--messenger" data-cta="whatsapp">В мессенджер</button>' +
          '<button type="button" class="btn btn--phone" data-cta="call">По телефону</button>' +
        '</div>' +
        '<div class="calc__social"><span class="calc__pulse" aria-hidden="true"></span>Сегодня заказали расчёт: <b>' + todayOrders() + '</b></div>' +
      '</div>' +

    '</div>';

    bind();
    syncSlider('[data-area]');
    syncSlider('[data-glass]');
  }

  function syncSlider(sel) {
    var el = root.querySelector(sel);
    if (!el) return;
    var min = +el.min, max = +el.max;
    el.style.setProperty('--fill', (((+el.value - min) / (max - min)) * 100).toFixed(1) + '%');
  }

  function updateResult() {
    calc();
    var el = root.querySelector('[data-total]');
    if (el) el.innerHTML = rangeHtml();
    var v = root.querySelector('[data-vol]');
    if (v) v.textContent = volume() + ' м³';
  }

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

  function toggle(set, id) { if (set.has(id)) set.delete(id); else set.add(id); }

  function bind() {
    root.querySelectorAll('[data-mode]').forEach(function (b) {
      b.addEventListener('click', function () { state.mode = b.dataset.mode; render(); });
    });

    var area = root.querySelector('[data-area]');
    if (area) area.addEventListener('input', function () {
      state.area = parseFloat(area.value);
      root.querySelector('[data-area-val]').textContent = num(state.area, 1) + ' м²';
      syncSlider('[data-area]'); updatePick();
    });

    var glass = root.querySelector('[data-glass]');
    if (glass) glass.addEventListener('input', function () {
      state.glass = parseFloat(glass.value);
      root.querySelector('[data-glass-val]').textContent = num(state.glass, 1) + ' м²';
      syncSlider('[data-glass]'); updatePick();
    });

    var cold = root.querySelector('[data-cold]');
    if (cold) cold.addEventListener('click', function () {
      state.coldWall = !state.coldWall;
      cold.classList.toggle('is-on', state.coldWall);
      updatePick();
    });

    root.querySelectorAll('[data-steam-id]').forEach(function (b) {
      b.addEventListener('click', function () { state.steamType = b.dataset.steamId; render(); });
    });
    root.querySelectorAll('[data-pkg-id]').forEach(function (b) {
      b.addEventListener('click', function () { if (!b.disabled) { state.pkg = b.dataset.pkgId; render(); } });
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
      toggle(state.finishOpts, b.dataset.opt); b.classList.toggle('is-on'); updateResult();
    });

    var so = root.querySelector('[data-stove-opts]');
    if (so) so.addEventListener('click', function (e) {
      var b = e.target.closest('[data-opt]'); if (!b) return;
      toggle(state.stoveOpts, b.dataset.opt); b.classList.toggle('is-on'); updateResult();
    });

    root.querySelectorAll('[data-cta]').forEach(function (b) {
      b.addEventListener('click', function () { state.channel = b.dataset.cta; openModal(); });
    });
  }

  /* ---- Сводка конфигурации для менеджера --------------------------------- */
  function summary() {
    var lines = [];
    lines.push('Сценарий: ' + (MODES.filter(function (m) { return m.id === state.mode; })[0] || {}).label);
    lines.push('Парная: ' + num(state.area, 1) + ' м² (высота 2,4 м) — расчётный объём ' + volume() + ' м³');
    if (state.glass) lines.push('Стекло: ' + num(state.glass, 1) + ' м²');
    if (state.coldWall) lines.push('Холодная или неутеплённая стена: +50% к объёму');

    if (state.mode === 'full') {
      var st = P.steamTypes.filter(function (t) { return t.id === state.steamType; })[0];
      var pkg = currentPkg();
      lines.push('Тип парной: ' + (st ? st.label : ''));
      lines.push('Пакет: ' + pkg.name + bandLabel(pkg).replace(' · ', ' — '));
      if (state.finishOpts.size) {
        lines.push('Допы: ' + P.finishOptions.filter(function (o) { return state.finishOpts.has(o.id); })
          .map(function (o) { return o.name; }).join(', '));
      }
    }
    lines.push('Топливо: ' + (state.fuel === 'wood' ? 'дрова' : 'электро'));
    if (state.stove) lines.push('Подобрана печь: ' + state.stove.name + ' — ' + fmt(state.stove.price) + ' ₽');
    if (state.stoveOpts.size) {
      lines.push('Обвязка: ' + P.stoveOptions.filter(function (o) { return state.stoveOpts.has(o.id); })
        .map(function (o) { return o.name; }).join(', '));
    }
    lines.push(state.byProject
      ? 'Расчёт: от ' + fmt(state.total) + ' ₽, дальше по проекту'
      : 'Расчёт: ' + fmt(state.total) + ' – ' + fmt(state.totalMax) + ' ₽');
    return lines.join('\n');
  }

  function quizPayload() {
    return {
      mode: state.mode,
      area_m2: state.area,
      volume_m3: volume(),
      glass_m2: state.glass,
      cold_wall: state.coldWall,
      steam_type: state.steamType,
      package: state.pkg,
      fuel: state.fuel,
      tier: state.tier,
      stove: state.stove ? state.stove.name : '',
      stove_price: state.stove ? state.stove.price : 0,
      finish_options: Array.from(state.finishOpts),
      stove_options: Array.from(state.stoveOpts),
      by_project: state.byProject,
      entry_product: QS.get('product') || '',
      estimate_min: state.total,
      estimate_max: state.totalMax,
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
    wrap.innerHTML =
      '<div class="modal__frame" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
        '<button type="button" class="modal__close" data-close aria-label="Закрыть">✕</button>' +
        '<h3 class="modal__title" id="modal-title" data-modal-title></h3>' +
        '<p class="modal__sub" data-modal-sub></p>' +
        '<div class="modal__summary" data-modal-summary></div>' +
        '<div class="modal__channels" data-channels>' +
          '<button type="button" class="modal__chan" data-chan="whatsapp"><b>WhatsApp</b></button>' +
          '<button type="button" class="modal__chan" data-chan="telegram"><b>Telegram</b></button>' +
          '<button type="button" class="modal__chan" data-chan="max"><b>MAX</b></button>' +
          '<button type="button" class="modal__chan" data-chan="call"><b>Звонок</b></button>' +
        '</div>' +
        '<form data-form="lead" data-lead-source="calc" novalidate>' +
          '<input type="text" name="website" class="form-honey" tabindex="-1" autocomplete="off" aria-hidden="true">' +
          '<input type="hidden" name="channel" data-channel-input value="whatsapp">' +
          '<input type="hidden" name="timing" data-timing-input value="">' +
          '<label class="field"><span class="field__label">Имя</span>' +
            '<input class="input" type="text" name="name" placeholder="Как к вам обращаться" required minlength="2" autocomplete="name"></label>' +
          '<label class="field"><span class="field__label">Телефон</span>' +
            '<input class="input" type="tel" name="phone" placeholder="+7 (___) ___-__-__" required autocomplete="tel" inputmode="tel"></label>' +
          '<div class="field"><span class="field__label">Когда планируете начать?</span>' +
            '<div class="chips chips--timing" data-timings>' +
              TIMINGS.map(function (t) { return '<button type="button" class="chip" data-timing="' + t.id + '">' + esc(t.label) + '</button>'; }).join('') +
            '</div></div>' +
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
      '<div class="quiz-success">' +
        '<div class="quiz-success__icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="m9 16.17-4.17-4.17-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></div>' +
        '<h3 class="quiz-success__title">Заявка принята</h3>' +
        '<p class="quiz-success__text">Инженер свяжется в течение 30 минут в рабочее время и посчитает смету по вашей конфигурации.</p>' +
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
      ? 'Инженер позвонит в течение 30 минут в рабочее время и на словах даст диапазон по вашей конфигурации.'
      : 'Инженер пришлёт смету по вашей конфигурации. Ответим в течение 30 минут в рабочее время.';
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

  /* ---- Публичный API ----------------------------------------------------- */
  window.LuchCalc = {
    open: function (mode) {
      if (mode === 'both' || mode === 'finish') mode = 'full';
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
