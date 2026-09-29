/* ============================================================================
   ПЕРВЫЙ ЛУЧ — атрибуция лида
   ----------------------------------------------------------------------------
   Запоминает первый и последний источник визита, склейку с Яндекс.Метрикой
   и Директом. Работает без cookie-баннера: только localStorage первой стороны.

   СКВОЗНАЯ АНАЛИТИКА (задача Дениса, 31.08.2026). Чтобы CRM могла вернуть
   в Метрику офлайн-конверсию по этой заявке, в ней обязаны приехать три вещи:
     · ym_client_id — ClientID Метрики, берём официальным getClientID,
       cookie _ym_uid только как запасной вариант;
     · yclid        — метка клика Директа, живёт 90 дней отдельно от utm;
     · lead_uid     — наш сквозной номер заявки: по нему CRM и Метрика
       говорят об одной и той же строке, а дубли не задваиваются.
   Контракт полей одинаковый с посадочными CeramicaDecor — приёмник один.
   ========================================================================== */
(function () {
  'use strict';

  var LS_FIRST = 'luch_attr_first';
  var LS_LAST  = 'luch_attr_last';
  var LS_VISITS = 'luch_visits';
  var LS_CID    = 'luch_ym_cid';    // ClientID Метрики, кэш
  var LS_YCLID  = 'luch_yclid';     // { v: yclid, at: ISO } — держим 90 дней

  // Ключ площадки: по нему CRM раскладывает заявки одного приёмника
  // по посадочным, а Метрика — по счётчикам.
  var SITE_KEY = 'luch-banya';
  var YCLID_TTL_DAYS = 90;

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

  /* ---- ClientID Метрики --------------------------------------------------
     Официальный способ — ym(id, 'getClientID', cb). Он работает только после
     инициализации счётчика, поэтому результат кэшируем: заявку могут отправить
     раньше, чем ответит колбэк. Cookie _ym_uid — запасной вариант на случай,
     когда счётчик ещё не поднялся.
  ------------------------------------------------------------------------- */
  function cookieUid() {
    var m = document.cookie.match(/(?:^|;\s*)_ym_uid=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function cachedCid() {
    try { return localStorage.getItem(LS_CID) || ''; } catch (e) { return ''; }
  }

  (function captureClientId() {
    var id = (window.LUCH && LUCH.company && LUCH.company.yandexMetrikaId) || 0;
    if (!id) return;
    var tries = 0;
    (function ask() {
      if (typeof window.ym === 'function') {
        try {
          window.ym(id, 'getClientID', function (cid) {
            if (cid) { try { localStorage.setItem(LS_CID, String(cid)); } catch (e) {} }
          });
          return;
        } catch (e) {}
      }
      if (++tries < 20) setTimeout(ask, 500);
    })();
  })();

  function ymClientId() { return cachedCid() || cookieUid(); }

  /* ---- yclid ------------------------------------------------------------
     Метка клика Директа. Живёт дольше utm: человек может уйти и вернуться
     напрямую, а конверсию Директу всё равно нужно вернуть на тот клик.
  ------------------------------------------------------------------------- */
  (function keepYclid() {
    var v = current.yclid || '';
    if (v) write(LS_YCLID, { v: v, at: now });
  })();

  function yclid() {
    var box = read(LS_YCLID);
    if (!box || !box.v) return '';
    var age = (Date.now() - new Date(box.at).getTime()) / 86400000;
    return age <= YCLID_TTL_DAYS ? box.v : '';
  }

  /* ---- Сквозной номер заявки --------------------------------------------
     Генерится в момент отправки. CRM кладёт его рядом с лидом, обратная
     выгрузка в Метрику ссылается на него же — так строки не задваиваются.
  ------------------------------------------------------------------------- */
  // Один номер на загрузку страницы, а не на каждый вызов: если отправка
  // сорвалась и человек нажал ещё раз, в CRM приедет тот же номер и она
  // склеит повтор, а не заведёт второй лид.
  var LEAD_UID = (function () {
    var rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
    var d = new Date();
    var stamp = String(d.getFullYear()).slice(2) +
      ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    return 'LB-' + stamp + '-' + rnd;
  })();

  // Последние utm плоским списком: CRM и выгрузка в Метрику ждут именно их,
  // а не вложенный объект.
  function flatUtm() {
    var last = read(LS_LAST) || snapshot;
    var m = (last && last.marks) || {};
    var out = {};
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(function (k) {
      out[k] = m[k] || '';
    });
    return out;
  }

  /* ---- Уход в мессенджер -------------------------------------------------
     Кнопка мессенджера уводит человека с сайта: заявки на сайте не создаётся,
     и накопленная атрибуция до CRM не доезжает — обращение приходит без
     источника. Поэтому на клике делаем две вещи.

     1. В предзаполненный текст дописываем номер заявки. Менеджер видит его
        первым сообщением и находит по нему источник. Работает только
        в WhatsApp: Telegram и MAX предзаполнить личный чат не дают.
     2. Отправляем маячок на приёмник — ClientID, yclid и метки. Он уходит
        через sendBeacon, то есть переживает уход со страницы и ничего
        не задерживает: переход в мессенджер не должен ждать сети.
  ------------------------------------------------------------------------- */
  // Маячок ухода в мессенджер уходит на тот же приёмник, что и заявки.
  var MSG_ENDPOINT = window.LUCH_BEACON || (/(^|\.)(1luch\.ru|banya\.1-luch\.ru)$/.test(location.hostname) ? '/beacon.php' : 'https://cd-lead.chagagagaga.workers.dev/beacon');

  function messengerOf(href) {
    var h = String(href || '');
    if (/(^|\/\/)(wa\.me|api\.whatsapp\.com|whatsapp\.com\/send)/i.test(h)) return 'whatsapp';
    if (/(^|\/\/)(t\.me|telegram\.me)/i.test(h)) return 'telegram';
    if (/(^|\/\/)max\.ru/i.test(h)) return 'max';
    return '';
  }

  // Номер дописываем только там, где мессенджер умеет предзаполнить текст.
  function withOrderNo(href) {
    try {
      var u = new URL(href, location.origin);
      var t = (u.searchParams.get('text') || '').replace(/\s*№ заявки:[\s\S]*$/, '').trim();
      u.searchParams.set('text', (t ? t + '\n\n' : '')
        + '№ заявки: ' + LEAD_UID + '. Пожалуйста, не удаляйте номер.');
      return u.toString();
    } catch (e) { return href; }
  }

  function beacon(kind) {
    if (!MSG_ENDPOINT || !navigator.sendBeacon) return;
    try {
      var p = window.LuchAttribution.getPayload();
      p.event = 'messenger_click';
      p.messenger = kind;
      var body = new URLSearchParams();
      Object.keys(p).forEach(function (k) {
        var v = p[k];
        if (v === undefined || v === null) return;
        body.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      });
      navigator.sendBeacon(MSG_ENDPOINT, body);
    } catch (e) {
      // Упавший маячок не должен мешать человеку уйти в мессенджер.
    }
  }

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var kind = messengerOf(a.getAttribute('href'));
    if (!kind) return;
    if (kind === 'whatsapp') a.setAttribute('href', withOrderNo(a.getAttribute('href')));
    beacon(kind);
  }, true);

  window.LuchAttribution = {
    getPayload: function (extra) {
      var first = read(LS_FIRST) || snapshot;
      var last  = read(LS_LAST)  || snapshot;
      return Object.assign({
        // ── склейка с Метрикой: без этих трёх полей сквозной аналитики нет
        lead_uid: LEAD_UID,
        site_key: SITE_KEY,
        ym_client_id: ymClientId(),
        yclid: yclid(),
        gclid: (last.marks && last.marks.gclid) || '',
        // ── источник плоским списком, как ждёт CRM
        first_touch: first,
        last_touch: last,
        visits: visits,
        page_url: location.href,
        page_path: location.pathname,
        query: location.search || '',
        referrer: referrer,
        // ym_uid оставлен для обратной совместимости со старым приёмником
        ym_uid: ymClientId(),
        screen: window.innerWidth + 'x' + window.innerHeight,
        user_agent: navigator.userAgent,
        language: navigator.language || '',
        tz: (Intl.DateTimeFormat().resolvedOptions().timeZone) || '',
      }, flatUtm(), extra || {});
    },
  };
})();
