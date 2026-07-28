/* ============================================================================
   ПЕРВЫЙ ЛУЧ — единая отправка заявок
   ----------------------------------------------------------------------------
   Один модуль обслуживает и модалку калькулятора, и встроенные формы.
   Куда уходит заявка — задаётся в LUCH_ENDPOINT (см. ниже и api/README.md).
   ========================================================================== */
(function () {
  'use strict';

  /* ---- Адрес приёмника заявок -------------------------------------------
     По умолчанию — Cloudflare Worker. После деплоя вставьте сюда свой URL
     вида https://luch-lead.<ваш-аккаунт>.workers.dev
     Локально (file://) отправка эмулируется, форма покажет успех.
  ----------------------------------------------------------------------- */
  var ENDPOINT = window.LUCH_ENDPOINT || 'https://luch-lead.workers.dev/lead';
  var THANKS_URL = 'spasibo.html';

  var isLocal = location.protocol === 'file:' ||
                /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

  /* ---- Маска телефона ---------------------------------------------------- */
  function maskPhone(el) {
    var d = el.value.replace(/\D/g, '').slice(0, 11);
    if (d[0] === '8') d = '7' + d.slice(1);
    if (d && d[0] !== '7') d = '7' + d;
    d = d.slice(0, 11);
    var out = '+7';
    if (d.length > 1) out += ' (' + d.slice(1, 4);
    if (d.length >= 4) out += ') ' + d.slice(4, 7);
    if (d.length >= 7) out += '-' + d.slice(7, 9);
    if (d.length >= 9) out += '-' + d.slice(9, 11);
    el.value = d.length ? out : '';
  }

  function bindPhone(el) {
    if (!el || el.dataset.phoneBound) return;
    el.dataset.phoneBound = '1';
    el.addEventListener('input', function () { maskPhone(el); });
    el.addEventListener('focus', function () { if (!el.value) el.value = '+7 '; });
    el.addEventListener('blur', function () { if (el.value.replace(/\D/g, '').length < 2) el.value = ''; });
  }

  function validPhone(value) {
    return value.replace(/\D/g, '').length === 11;
  }

  /* ---- Сбор и отправка --------------------------------------------------- */
  function buildPayload(form, extra) {
    var fd = {};
    new FormData(form).forEach(function (v, k) { fd[k] = typeof v === 'string' ? v.trim() : v; });
    delete fd.website; // honeypot не отправляем

    return Object.assign({
      name: fd.name || '',
      phone: fd.phone || '',
      comment: fd.comment || '',
      channel: fd.channel || 'call',
      timing: fd.timing || '',
      source: form.dataset.leadSource || document.body.dataset.quizSource || 'form',
      page: location.pathname,
      sentAt: new Date().toISOString(),
      attribution: window.LuchAttribution ? window.LuchAttribution.getPayload() : {},
    }, extra || {});
  }

  function setStatus(form, text, type) {
    var box = form.querySelector('.form-status');
    if (!box) return;
    box.className = 'form-status' + (type ? ' form-status--' + type : '');
    box.textContent = text || '';
  }

  function reachGoal(payload) {
    if (window.dataLayer) window.dataLayer.push({ event: 'lead_submitted', lead_source: payload.source });
    var id = (window.LUCH && LUCH.company && LUCH.company.yandexMetrikaId) || 0;
    if (id && typeof window.ym === 'function') {
      try { window.ym(id, 'reachGoal', 'lead_submitted', { source: payload.source }); } catch (e) {}
    }
  }

  /**
   * Отправляет заявку.
   * @param {HTMLFormElement} form
   * @param {object} extra  — дополнительные поля (например расчёт калькулятора)
   * @param {function} onSuccess — вызывается вместо редиректа, если передана
   */
  function submit(form, extra, onSuccess) {
    if (form.dataset.sending === '1') return;

    // honeypot: бот заполнил скрытое поле — молча выходим
    var honey = form.querySelector('[name="website"]');
    if (honey && honey.value) return;

    var nameEl = form.querySelector('[name="name"]');
    var phoneEl = form.querySelector('[name="phone"]');

    if (nameEl && nameEl.value.trim().length < 2) {
      nameEl.focus(); setStatus(form, 'Напишите, как к вам обращаться', 'error'); return;
    }
    if (phoneEl && !validPhone(phoneEl.value)) {
      phoneEl.focus(); setStatus(form, 'Проверьте номер телефона — нужно 11 цифр', 'error'); return;
    }

    var payload = buildPayload(form, extra);
    var btn = form.querySelector('[type="submit"]');
    var btnText = btn ? btn.textContent : '';

    form.dataset.sending = '1';
    if (btn) { btn.disabled = true; btn.textContent = 'Отправляем…'; }
    setStatus(form, '');

    var request = isLocal
      ? new Promise(function (r) { setTimeout(function () { r({ ok: true }); }, 500); })
      : fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

    request
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        reachGoal(payload);
        form.dataset.sending = '';
        if (typeof onSuccess === 'function') { onSuccess(payload); return; }
        form.reset();
        setStatus(form, 'Заявка принята. Перезвоним в течение 30 минут.', 'ok');
        setTimeout(function () { location.assign(THANKS_URL); }, 900);
      })
      .catch(function () {
        form.dataset.sending = '';
        if (btn) { btn.disabled = false; btn.textContent = btnText; }
        setStatus(form, 'Не удалось отправить. Позвоните: +7 (495) 141-18-88', 'error');
      });
  }

  /* ---- Автопривязка обычных форм на странице ----------------------------- */
  function bindForm(form) {
    if (form.dataset.leadBound) return;
    form.dataset.leadBound = '1';
    bindPhone(form.querySelector('input[type="tel"]'));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      submit(form);
    });
  }

  function init() {
    document.querySelectorAll('form[data-form="lead"]').forEach(bindForm);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.LuchLead = {
    submit: submit,
    bindForm: bindForm,
    bindPhone: bindPhone,
    validPhone: validPhone,
    setStatus: setStatus,
    endpoint: ENDPOINT,
    thanksUrl: THANKS_URL,
  };
})();
