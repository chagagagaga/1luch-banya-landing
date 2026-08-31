/* ============================================================================
   ПЕРВЫЙ ЛУЧ — конфигуратор-квиз в первом экране
   ----------------------------------------------------------------------------
   Два сценария: «Только печь» и «Парная под ключ». Отделки без печи не бывает —
   печь задаёт объём, вентиляцию, расположение полков и противопожарные отступы,
   поэтому она входит в оба сценария.

   Считаем в квадратных метрах пола при стандартной высоте 2,4 м: заказчик знает
   площадь и почти никогда не знает кубатуру. Объём получаем пересчётом,
   с поправкой на стеклянные элементы.

   ПРАВКИ ВЛАДА 31.08.2026 — что калькулятор теперь НЕ делает:
     · не привязывает к проекту конкретную печь, дымоход и обвязку;
     · не показывает цены допов: наш уровень — диапазон, а не смета;
     · не спрашивает «дрова или электро» и класс печи — это разговор
       с менеджером, а модели живут в каталоге ниже по странице;
     · не берёт +50% за внешнюю стену — вместо этого считаем стеклянные
       элементы: дверь или окно внутри дома +1 м³, на улицу +2 м³.
   Цена парной под ключ пересчитывается по метражу от прайса Влада.

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
    glassIn: 0,                    // стеклянные двери и окна внутри дома: +1 м³ каждое
    glassOut: 0,                   // стекло или стена на улицу: +2 м³ каждое
    fuel: 'wood',
    steamType: 'russian',
    pkg: paramOneOf('pkg', ['comfort', 'premium', 'author'], 'comfort'),
    pinnedStove: null,             // печь, выбранная в каталоге вручную
    // Правка Дениса: при загрузке цена не должна быть самым громким
    // элементом экрана. Показываем её, как только человек тронул
    // конфигуратор, — или по кнопке, если он ничего не трогал.
    priceShown: false,
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
     Площадь × высота 2,4 м, плюс стекло: дверь или окно внутри дома даёт
     +1 м³, стекло или стена на улицу — +2 м³. Кирпичная стена в расчёт
     не идёт. Надбавки «+50% за внешнюю стену» больше нет — правка Влада.
  ------------------------------------------------------------------------- */
  function volume() {
    return Math.round(
      state.area * RULES.ceilingHeight +
      state.glassIn * RULES.glassInside +
      state.glassOut * RULES.glassOutside
    );
  }

  /* ---- Печи, подходящие под объём ----------------------------------------
     Конкретную модель калькулятор больше не называет: в сценарии «только
     печь» показываем диапазон по всем подходящим печам, а модель человек
     выбирает сам в каталоге ниже.
  ------------------------------------------------------------------------- */
  function fitStoves() {
    var vol = volume();
    var list = P.stoves.filter(function (s) { return vol >= s.vmin - 2 && vol <= s.vmax + 2; });
    return list.length ? list : P.stoves.slice();
  }

  function stoveBand() {
    var prices = fitStoves().map(function (s) { return s.price; });
    return { min: Math.min.apply(null, prices), max: Math.max.apply(null, prices) };
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

  /* ---- Расчёт ------------------------------------------------------------
     Парная под ключ: берём диапазон прайса, посчитанный на 6 м², и
     пересчитываем его по метражу. Ни печь, ни дымоход, ни допы отдельными
     строчками в цену не входят — они внутри диапазона (правки Влада).
  ------------------------------------------------------------------------- */
  function calc() {
    state.byProject = false;

    // Хамам делается только в авторском исполнении
    if (state.steamType === 'hammam') state.pkg = 'author';

    if (state.mode === 'stove') {
      // Печь отдельным товаром. Если человек ткнул конкретную модель
      // в каталоге — показываем её, иначе диапазон по подходящим печам.
      state.stove = state.pinnedStove;
      if (state.stove) {
        state.total = Math.round(state.stove.price / 1000) * 1000;
        state.totalMax = Math.round(state.stove.price * 1.18 / 1000) * 1000;
      } else {
        var sb = stoveBand();
        state.total = Math.round(sb.min / 1000) * 1000;
        state.totalMax = Math.round(sb.max / 1000) * 1000;
      }
      return;
    }

    // Парная под ключ: печь к проекту не привязываем.
    state.stove = null;

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

    // Пересчёт по метражу от базовых 6 м², на которые посчитан прайс.
    // Меньше базовой площади цена не опускается: нижняя граница прайса —
    // это порог, ниже которого мы за парную не беремся.
    var k = Math.max(1, state.area / (RULES.baseArea || 6));
    state.total = band ? Math.round(band.min * k / 1000) * 1000 : 0;
    state.totalMax = band && band.max ? Math.round(band.max * k / 1000) * 1000 : 0;
  }

  // Подпись диапазона пакета: «850 000 – 1 500 000 ₽» или «от 2 500 000 ₽».
  function bandLabel(pkg) {
    var band = priceBand(pkg);
    if (!band) return '';
    if (!band.max) return ' · от ' + fmt(band.min) + ' ₽, ' + (pkg.priceNote || 'по проекту');
    return ' · ' + fmt(band.min) + ' – ' + fmt(band.max) + ' ₽ под ключ';
  }

  /* ---- Разметка ---------------------------------------------------------- */
  // Цены у допов больше нет: отметка нужна менеджеру, а не калькулятору.
  function optionRow(o, checked) {
    return '<button type="button" class="calc-opt' + (checked ? ' is-on' : '') + '" data-opt="' + o.id + '">' +
      '<span class="calc-opt__box" aria-hidden="true"></span>' +
      '<span class="calc-opt__body"><span class="calc-opt__name">' + esc(o.name) + '</span>' +
      (o.hint ? '<span class="calc-opt__hint">' + esc(o.hint) + '</span>' : '') + '</span>' +
      '</button>';
  }

  // Счётчик стеклянных элементов: «−  2  +». Спрашиваем про сами двери и
  // окна, а не про квадратные метры стекла, — правка Влада.
  function glassRow(key, name, hint, value) {
    var max = RULES.glassMaxCount || 4;
    return '<div class="calc-opt calc-opt--count' + (value ? ' is-on' : '') + '">' +
      '<span class="calc-opt__body"><span class="calc-opt__name">' + esc(name) + '</span>' +
      '<span class="calc-opt__hint">' + esc(hint) + '</span></span>' +
      '<span class="calc-count">' +
        '<button type="button" class="calc-count__btn" data-glass-step="' + key + '" data-delta="-1"' +
          (value <= 0 ? ' disabled' : '') + ' aria-label="Убрать">−</button>' +
        '<b data-glass-val="' + key + '">' + value + '</b>' +
        '<button type="button" class="calc-count__btn" data-glass-step="' + key + '" data-delta="1"' +
          (value >= max ? ' disabled' : '') + ' aria-label="Добавить">+</button>' +
      '</span></div>';
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
        '<p class="calc__hint">Площадь пола при высоте потолка 2,4 м. Расчётный объём — <b data-vol>' + volume() + ' м³</b>.</p>' +
      '</div>' +

      '<div class="calc__field">' +
        '<span class="calc__label"><i>3</i> Стекло в парной</span>' +
        '<div class="calc-opts">' +
          glassRow('in',  'Стеклянная дверь или окно внутри дома', 'Каждое добавляет 1 м³ к расчётному объёму', state.glassIn) +
          glassRow('out', 'Стекло или стена, выходящие на улицу',  'Каждое добавляет 2 м³ к расчётному объёму', state.glassOut) +
        '</div>' +
        '<p class="calc__hint">Кирпичная стена в расчёт не идёт.</p>' +
      '</div>' +

      (full ? (
        '<div class="calc__field">' +
          '<span class="calc__label"><i>4</i> Тип парной</span>' +
          '<div class="calc-radio" data-steam>' +
            P.steamTypes.map(function (t) {
              return '<button type="button" class="calc-radio__opt' + (state.steamType === t.id ? ' is-on' : '') + '" data-steam-id="' + t.id + '">' +
                '<b>' + esc(t.label) + '</b><i>' + esc(t.hint) + '</i></button>';
            }).join('') +
          '</div>' +
        '</div>' +

        '<div class="calc__field">' +
          '<span class="calc__label"><i>5</i> Уровень отделки</span>' +
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


      /* Печь к проекту не привязываем (правка Влада): карточку конкретной
         модели показываем только в сценарии «только печь» и только если
         человек сам ткнул её в каталоге. Топлива, класса печи и обвязки
         с ценами в конфигураторе больше нет. */
      (!full && state.stove ? (
        '<div class="calc-pick" data-pick>' +
          '<div class="calc-pick__img">' + (state.stove.img ? '<img src="' + esc(state.stove.img) + '" alt="' + esc(state.stove.name) + '" loading="lazy" decoding="async" width="560" height="560">' : '') + '</div>' +
          '<div class="calc-pick__body">' +
            '<span class="calc-pick__label">Выбранная печь</span>' +
            '<b class="calc-pick__name">' + esc(state.stove.name) + '</b>' +
            '<span class="calc-pick__meta">' + esc(state.stove.brand) + ' · ' + state.stove.vmin + '–' + state.stove.vmax + ' м³</span>' +
          '</div>' +
          '<div class="calc-pick__price">' + fmt(state.stove.price) + ' ₽</div>' +
        '</div>'
      ) : '') +

      (!full && !state.stove
        ? '<p class="calc__hint calc__hint--pick">Модель подбирает инженер под ваш объём. Посмотреть печи и выбрать конкретную можно в <a href="#stoves" class="js-scroll">каталоге ниже</a>.</p>'
        : '') +

      '<div class="calc__result' + (state.priceShown ? '' : ' calc__result--hidden') + '" data-result>' +
        (state.priceShown
          ? '<div class="calc__result-row">' +
              '<span>' + (state.byProject ? 'Ваш проект' : 'Ориентир по вашей конфигурации') + '</span>' +
              '<b data-total>' + rangeHtml() + '</b>' +
            '</div>'
          : '<div class="calc__reveal">' +
              '<p>Расчёт готов. Цену показываем сразу, без звонка и заявки.</p>' +
              '<button type="button" class="btn btn--primary btn--block" data-reveal>Показать стоимость</button>' +
            '</div>') +
        (state.priceShown ? '<div class="calc__result-gift">' +
          '<span class="calc__gift-icon" aria-hidden="true">★</span>' + esc(P.promo.title) +
        '</div>' : '') +
        (state.priceShown ? '<p class="calc__result-note">' +
          (state.byProject
            ? 'Авторский проект и хамам считаются индивидуально: состав работ и материалы каждый раз свои, верхней границы нет. Инженер посчитает после замера.'
            : !full
              ? (state.stove
                  ? 'Цена печи без монтажа и дымохода: их считаем после замера — от него зависят длина дымохода, проход кровли и разделка.'
                  : 'В диапазон попали все печи на ваш объём — и дровяные, и электрические, они отличаются по цене в разы. Модель подберёт инженер, или выберите конкретную в каталоге ниже.')
              : 'Диапазон, а не финальная цена: на итог влияют объём парной, материалы и инженерные решения. Точную смету инженер считает после замера.') +
        '</p>' : '') +
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
  }

  function syncSlider(sel) {
    var el = root.querySelector(sel);
    if (!el) return;
    var min = +el.min, max = +el.max;
    el.style.setProperty('--fill', (((+el.value - min) / (max - min)) * 100).toFixed(1) + '%');
  }

  // Первое же действие в конфигураторе показывает цену: прятать её от
  // человека, который уже что-то выбирает, бессмысленно.
  function reveal() {
    if (state.priceShown) return false;
    state.priceShown = true;
    render();
    return true;
  }

  function updateResult() {
    if (reveal()) return;
    calc();
    var el = root.querySelector('[data-total]');
    if (el) el.innerHTML = rangeHtml();
    var v = root.querySelector('[data-vol]');
    if (v) v.textContent = volume() + ' м³';
  }

  function updatePick() { updateResult(); }

  function toggle(set, id) { if (set.has(id)) set.delete(id); else set.add(id); }

  function bind() {
    root.querySelectorAll('[data-mode]').forEach(function (b) {
      b.addEventListener('click', function () { state.mode = b.dataset.mode; state.priceShown = true; render(); });
    });

    var area = root.querySelector('[data-area]');
    if (area) area.addEventListener('input', function () {
      state.area = parseFloat(area.value);
      root.querySelector('[data-area-val]').textContent = num(state.area, 1) + ' м²';
      syncSlider('[data-area]'); updatePick();
    });

    root.querySelectorAll('[data-glass-step]').forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.dataset.glassStep === 'out' ? 'glassOut' : 'glassIn';
        var max = RULES.glassMaxCount || 4;
        state[key] = Math.min(max, Math.max(0, state[key] + (+b.dataset.delta)));
        state.priceShown = true;
        render();
      });
    });

    root.querySelectorAll('[data-steam-id]').forEach(function (b) {
      b.addEventListener('click', function () { state.steamType = b.dataset.steamId; state.priceShown = true; render(); });
    });
    root.querySelectorAll('[data-pkg-id]').forEach(function (b) {
      b.addEventListener('click', function () { if (!b.disabled) { state.pkg = b.dataset.pkgId; state.priceShown = true; render(); } });
    });

    var fo = root.querySelector('[data-finish-opts]');
    if (fo) fo.addEventListener('click', function (e) {
      var b = e.target.closest('[data-opt]'); if (!b) return;
      toggle(state.finishOpts, b.dataset.opt); b.classList.toggle('is-on'); updateResult();
    });

    var rev = root.querySelector('[data-reveal]');
    if (rev) rev.addEventListener('click', function () { state.priceShown = true; render(); });

    root.querySelectorAll('[data-cta]').forEach(function (b) {
      b.addEventListener('click', function () { state.channel = b.dataset.cta; openModal(); });
    });
  }

  /* ---- Сводка конфигурации для менеджера --------------------------------- */
  function summary() {
    var lines = [];
    lines.push('Сценарий: ' + (MODES.filter(function (m) { return m.id === state.mode; })[0] || {}).label);
    lines.push('Парная: ' + num(state.area, 1) + ' м² (высота 2,4 м) — расчётный объём ' + volume() + ' м³');
    if (state.glassIn) lines.push('Стекло внутри дома: ' + state.glassIn + ' шт. (+' + (state.glassIn * RULES.glassInside) + ' м³)');
    if (state.glassOut) lines.push('Стекло или стена на улицу: ' + state.glassOut + ' шт. (+' + (state.glassOut * RULES.glassOutside) + ' м³)');

    if (state.mode === 'full') {
      var st = P.steamTypes.filter(function (t) { return t.id === state.steamType; })[0];
      var pkg = currentPkg();
      lines.push('Тип парной: ' + (st ? st.label : ''));
      lines.push('Пакет: ' + pkg.name + bandLabel(pkg).replace(' · ', ' — '));
      if (state.finishOpts.size) {
        // Цен у допов нет: менеджеру уходит список интересов, не смета.
        lines.push('Интересно дополнительно: ' + P.finishOptions.filter(function (o) { return state.finishOpts.has(o.id); })
          .map(function (o) { return o.name; }).join(', '));
      }
    }
    if (state.stove) lines.push('Выбрана печь в каталоге: ' + state.stove.name + ' — ' + fmt(state.stove.price) + ' ₽');
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
      glass_inside: state.glassIn,
      glass_outside: state.glassOut,
      steam_type: state.steamType,
      package: state.pkg,
      stove: state.stove ? state.stove.name : '',
      stove_price: state.stove ? state.stove.price : 0,
      finish_options: Array.from(state.finishOpts),
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
        '<div class="modal__channels" data-channels>' +
          // Звонок первым: он не требует от человека ничего, кроме номера.
          // Дальше мессенджеры в порядке популярности в России.
          '<button type="button" class="modal__chan" data-chan="call"><b>Звонок</b></button>' +
          '<button type="button" class="modal__chan" data-chan="max"><b>MAX</b></button>' +
          '<button type="button" class="modal__chan" data-chan="telegram"><b>Telegram</b></button>' +
          '<button type="button" class="modal__chan" data-chan="whatsapp"><b>WhatsApp</b></button>' +
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
    // Экран успеха затирает форму. Помечаем модалку отработавшей, чтобы при
    // следующем открытии её собрали заново: иначе человек, отправивший
    // заявку, больше не может открыть форму — ни одна кнопка не срабатывает.
    wrap.dataset.done = '1';
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
    // Модалка после успешной отправки одноразовая: выбрасываем её и собираем
    // чистую, чтобы повторная заявка работала.
    if (modal && modal.dataset.done) { modal.remove(); modal = null; }
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
      if (!el) return;
      // Прокрутка учитывает липкую шапку — иначе верх конфигуратора
      // уезжает под неё и человек видит его середину.
      if (window.LuchScrollTo) window.LuchScrollTo(el);
      else el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    openModal: function (source) {
      if (!modal) modal = buildModal();
      var form = modal.querySelector('form');
      if (form && source) form.dataset.leadSource = source;
      openModal();
    },
    /* Поп-ап со стоимостью конкретной печи прямо из каталога: человек
       не уезжает к калькулятору, цена показывается на месте. */
    openStove: function (stove, source) {
      state.mode = 'stove';
      state.priceShown = true;
      state.pinnedStove = stove;
      state.fuel = stove.fuel;
      var area = ((stove.vmin + stove.vmax) / 2) / RULES.ceilingHeight;
      state.area = Math.min(R.area.max, Math.max(R.area.min, Math.round(area * 2) / 2));
      render();
      this.openModal(source || 'stove-card');
    },
    unpinStove: function () { state.pinnedStove = null; },
    state: state,
  };

  render();
})();
