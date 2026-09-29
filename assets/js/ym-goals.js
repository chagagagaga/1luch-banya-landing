/* ============================================================================
   ПЕРВЫЙ ЛУЧ — счётчик Яндекс.Метрики и цели
   ----------------------------------------------------------------------------
   Номер счётчика берётся из pricing.js → LUCH.company.yandexMetrikaId.
   Пока он 0 — счётчик не подключается, цели молча пропускаются.

   Цели, которые нужно завести в Метрике (тип «JavaScript-событие»):
     lead_submitted   — заявка отправлена (главная цель Директа)
     calc_started     — человек тронул калькулятор
     calc_cta_click   — нажал «В мессенджер» / «По телефону»
     phone_click      — клик по номеру телефона
     messenger_click  — клик по WhatsApp / Telegram
     video_play       — запустил видео объекта
     scroll_75        — долистал до 75% страницы
   ========================================================================== */
(function () {
  'use strict';

  var ID = (window.LUCH && LUCH.company && LUCH.company.yandexMetrikaId) || 0;

  /* ---- Загрузка счётчика ------------------------------------------------- */
  // На локальном сервере счётчик не поднимаем: прогоны тестов иначе
  // ложатся в статистику визитами, а цели — конверсиями.
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if (ID && !LOCAL) {
    // Очередь ym создаётся сразу (цели и init не теряются), а сам tag.js
    // (~95 КБ и 1–2 с работы процессора на телефоне) грузим после загрузки
    // страницы: первый экран больше не ждёт Метрику (29.09.2026, скорость).
    window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
    window.ym.l = 1 * new Date();
    var loadTag = function () {
      if (loadTag.done) return; loadTag.done = 1;
      var k = document.createElement('script'); k.async = 1; k.src = 'https://mc.yandex.ru/metrika/tag.js';
      document.head.appendChild(k);
    };
    var later = function () { (window.requestIdleCallback || function (f) { setTimeout(f, 1200); })(loadTag, { timeout: 2500 }); };
    if (document.readyState === 'complete') later(); else window.addEventListener('load', later);
    ['pointerdown', 'keydown', 'scroll'].forEach(function (ev) { window.addEventListener(ev, loadTag, { once: true, passive: true }); });

    window.ym(ID, 'init', {
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
      webvisor: true,
      ecommerce: 'dataLayer',
    });

    var ns = document.createElement('noscript');
    ns.innerHTML = '<div><img src="https://mc.yandex.ru/watch/' + ID +
      '" style="position:absolute;left:-9999px" alt=""></div>';
    document.body.appendChild(ns);
  }

  function reach(goal, params) {
    if (window.dataLayer) window.dataLayer.push(Object.assign({ event: goal }, params || {}));
    if (!ID || typeof window.ym !== 'function') return;
    try { window.ym(ID, 'reachGoal', goal, params || {}); } catch (e) {}
  }
  window.LuchGoal = reach;

  /* ---- Клики ------------------------------------------------------------- */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t.closest) return;

    var tel = t.closest('a[href^="tel:"]');
    if (tel) reach('phone_click', { place: tel.closest('.mobilebar') ? 'mobilebar' : 'page' });

    // Общая цель и своя на каждый канал — под неё в счётчике заведены
    // messenger_telegram / whatsapp / max. MAX ловим по кнопке: адрес
    // у него свой, а пока и вовсе пустой.
    var msg = t.closest('a[href*="wa.me"], a[href*="t.me"], a[href*="max.ru"], [data-max-link]');
    if (msg) {
      var h = msg.getAttribute('href') || '';
      var kind = /wa\.me/.test(h) ? 'whatsapp' : /t\.me/.test(h) ? 'telegram' : 'max';
      reach('messenger_click', { messenger: kind });
      reach('messenger_' + kind);
    }

    var cta = t.closest('[data-cta]');
    if (cta) reach('calc_cta_click', { channel: cta.dataset.cta });
  }, { passive: true });

  /* ---- Первое взаимодействие с калькулятором ----------------------------- */
  (function calcStart() {
    var box = document.querySelector('[data-calc]');
    if (!box) return;
    var done = false;
    function once() {
      if (done) return;
      done = true;
      reach('calc_started');
      box.removeEventListener('input', once);
      box.removeEventListener('click', once);
    }
    box.addEventListener('input', once, { passive: true });
    box.addEventListener('click', once, { passive: true });
  })();

  /* ---- Глубина скролла --------------------------------------------------- */
  (function depth() {
    var hit = false;
    window.addEventListener('scroll', function () {
      if (hit) return;
      var h = document.documentElement.scrollHeight - window.innerHeight;
      if (h > 0 && window.scrollY / h >= 0.75) { hit = true; reach('scroll_75'); }
    }, { passive: true });
  })();
})();
