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
  if (ID) {
    (function (m, e, t, r, i, k, a) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
      m[i].l = 1 * new Date();
      k = e.createElement(t); a = e.getElementsByTagName(t)[0];
      k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
    })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');

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

    var msg = t.closest('a[href*="wa.me"], a[href*="t.me"]');
    if (msg) reach('messenger_click', { href: msg.getAttribute('href') });

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
