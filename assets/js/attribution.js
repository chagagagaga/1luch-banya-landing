/* ============================================================================
   ПЕРВЫЙ ЛУЧ — атрибуция лида
   ----------------------------------------------------------------------------
   Запоминает первый и последний источник визита, склейку с Яндекс.Метрикой
   и Директом. Работает без cookie-баннера: только localStorage первой стороны.
   ========================================================================== */
(function () {
  'use strict';

  var LS_FIRST = 'luch_attr_first';
  var LS_LAST  = 'luch_attr_last';
  var LS_VISITS = 'luch_visits';

  var UTM_KEYS = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term',
                  'utm_referrer','yclid','gclid','ymclid','fbclid','roistat','rb_clickid'];

  function params() {
    var p = new URLSearchParams(location.search || '');
    var out = {};
    UTM_KEYS.forEach(function (k) { if (p.get(k)) out[k] = p.get(k); });
    // Директ подставляет метки динамически — ловим любые utm_*
    p.forEach(function (v, k) { if (/^utm_/i.test(k)) out[k] = v; });
    return out;
  }

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  var now = new Date().toISOString();
  var current = params();
  var hasMarks = Object.keys(current).length > 0;
  var referrer = document.referrer || '';

  var snapshot = {
    marks: current,
    referrer: referrer,
    landing: location.pathname + location.search,
    at: now,
  };

  // Первый источник фиксируем один раз и больше не трогаем
  if (!read(LS_FIRST)) write(LS_FIRST, snapshot);

  // Последний источник обновляем, если пришли метки или внешний реферер
  var externalRef = referrer && referrer.indexOf(location.hostname) === -1;
  if (hasMarks || externalRef || !read(LS_LAST)) write(LS_LAST, snapshot);

  var visits = (read(LS_VISITS) || 0) + 1;
  write(LS_VISITS, visits);

  // ID пользователя Яндекс.Метрики — для склейки лида с визитом
  function ymClientId() {
    var m = document.cookie.match(/(?:^|;\s*)_ym_uid=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  window.LuchAttribution = {
    getPayload: function (extra) {
      var first = read(LS_FIRST) || snapshot;
      var last  = read(LS_LAST)  || snapshot;
      return Object.assign({
        first_touch: first,
        last_touch: last,
        visits: visits,
        page_url: location.href,
        page_path: location.pathname,
        query: location.search || '',
        referrer: referrer,
        ym_uid: ymClientId(),
        screen: window.innerWidth + 'x' + window.innerHeight,
        user_agent: navigator.userAgent,
        language: navigator.language || '',
        tz: (Intl.DateTimeFormat().resolvedOptions().timeZone) || '',
      }, extra || {});
    },
  };
})();
