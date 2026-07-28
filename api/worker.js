/**
 * ============================================================================
 * ПЕРВЫЙ ЛУЧ — приёмник заявок (Cloudflare Worker)
 * ----------------------------------------------------------------------------
 * Принимает POST /lead с лендинга, проверяет данные и рассылает заявку:
 *   1. в Telegram — мгновенно, менеджеру или в группу отдела продаж;
 *   2. на e-mail — дублем через Resend (опционально);
 *   3. в CRM     — вебхуком, если задан CRM_WEBHOOK (опционально).
 *
 * Токены живут в секретах Worker и в браузер не попадают.
 * Инструкция по деплою — в api/README.md
 * ==========================================================================*/

const ALLOWED_ORIGINS = [
  'https://chagagagaga.github.io',   // GitHub Pages — текущий адрес лендинга
  'https://banya.1-luch.ru',         // будущий свой домен
  'https://1-luch.ru',
  'https://www.1-luch.ru',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
];

/* ---- Хелперы -------------------------------------------------------------- */

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) },
  });
}

function digits(s) { return String(s || '').replace(/\D/g, ''); }

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const MODE_LABEL = { stove: 'Только печь', finish: 'Отделка под ключ', both: 'Печь + отделка' };
const TIMING_LABEL = { now: 'Уже сейчас', '1-3m': 'В ближайшие 1–3 мес.', later: 'Позже, присматривается' };
const CHANNEL_LABEL = { whatsapp: 'WhatsApp', telegram: 'Telegram', call: 'Звонок' };

/* ---- Сборка сообщения ----------------------------------------------------- */

function buildMessage(lead) {
  const a = lead.attribution || {};
  const first = a.first_touch || {};
  const last = a.last_touch || {};
  const q = lead.quiz || null;

  const marks = Object.entries(last.marks || {})
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');

  const rows = [];
  rows.push('<b>🔥 Новая заявка — баня</b>');
  rows.push('');
  rows.push(`<b>Имя:</b> ${escapeHtml(lead.name)}`);
  rows.push(`<b>Телефон:</b> <a href="tel:+${digits(lead.phone)}">${escapeHtml(lead.phone)}</a>`);
  if (lead.channel) rows.push(`<b>Связаться через:</b> ${CHANNEL_LABEL[lead.channel] || lead.channel}`);
  if (lead.timing) rows.push(`<b>Сроки:</b> ${TIMING_LABEL[lead.timing] || lead.timing}`);
  if (lead.comment) rows.push(`<b>Комментарий:</b> ${escapeHtml(lead.comment)}`);

  if (q) {
    rows.push('');
    rows.push('<b>— Конфигурация —</b>');
    rows.push(`Сценарий: ${MODE_LABEL[q.mode] || q.mode}`);
    if (q.area_m2) rows.push(`Площадь парной: ${q.area_m2} м²`);
    if (q.volume_m3) rows.push(`Объём парной: ${q.volume_m3} м³`);
    if (q.package) rows.push(`Пакет отделки: ${q.package}`);
    if (q.steam_type) rows.push(`Тип парной: ${q.steam_type}`);
    if (q.stove) rows.push(`Подобрана печь: ${escapeHtml(q.stove)} (${(q.stove_price || 0).toLocaleString('ru-RU')} ₽)`);
    if (q.finish_options && q.finish_options.length) rows.push(`Допы отделки: ${q.finish_options.join(', ')}`);
    if (q.stove_options && q.stove_options.length) rows.push(`Обвязка печи: ${q.stove_options.join(', ')}`);
    rows.push(`<b>Расчёт: ${(q.estimate_min || 0).toLocaleString('ru-RU')} – ${(q.estimate_max || 0).toLocaleString('ru-RU')} ₽</b>`);
    if (q.bundle_saving) rows.push(`Выгода комплекта: ${q.bundle_saving.toLocaleString('ru-RU')} ₽`);
  }

  rows.push('');
  rows.push('<b>— Источник —</b>');
  rows.push(`Блок на странице: ${escapeHtml(lead.source || '—')}`);
  rows.push(`Метки последнего визита: ${escapeHtml(marks || 'прямой заход')}`);
  if (first.marks && Object.keys(first.marks).length && JSON.stringify(first.marks) !== JSON.stringify(last.marks)) {
    rows.push(`Первый визит: ${escapeHtml(Object.entries(first.marks).map(([k, v]) => `${k}=${v}`).join(', '))}`);
  }
  if (a.referrer) rows.push(`Реферер: ${escapeHtml(a.referrer)}`);
  if (a.visits) rows.push(`Визитов до заявки: ${a.visits}`);
  if (a.ym_uid) rows.push(`ym_uid: <code>${escapeHtml(a.ym_uid)}</code>`);
  rows.push(`Страница: ${escapeHtml(a.page_url || lead.page || '')}`);

  return rows.join('\n');
}

/* ---- Каналы доставки ------------------------------------------------------ */

async function sendTelegram(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return 'skipped: no telegram config';
  const chats = String(env.TELEGRAM_CHAT_ID).split(',').map((s) => s.trim()).filter(Boolean);
  const results = [];
  for (const chat of chats) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chat,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });
      results.push(r.ok ? 'ok' : `http ${r.status}`);
    } catch (e) {
      results.push('error');
    }
  }
  return results.join(',');
}

async function sendEmail(env, subject, html) {
  if (!env.RESEND_API_KEY || !env.MAIL_TO) return 'skipped: no email config';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM || 'Заявки с сайта <onboarding@resend.dev>',
        to: String(env.MAIL_TO).split(',').map((s) => s.trim()),
        subject,
        html,
      }),
    });
    return r.ok ? 'ok' : `http ${r.status}`;
  } catch (e) {
    return 'error';
  }
}

async function sendCrm(env, lead) {
  if (!env.CRM_WEBHOOK) return 'skipped: no crm config';
  try {
    const r = await fetch(env.CRM_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead),
    });
    return r.ok ? 'ok' : `http ${r.status}`;
  } catch (e) {
    return 'error';
  }
}

/* ---- Обработчик ----------------------------------------------------------- */

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (url.pathname === '/health') {
      return json({ ok: true, service: 'luch-lead' }, 200, origin);
    }
    if (request.method !== 'POST') {
      return json({ ok: false, error: 'method_not_allowed' }, 405, origin);
    }

    let lead;
    try {
      lead = await request.json();
    } catch (e) {
      return json({ ok: false, error: 'bad_json' }, 400, origin);
    }

    /* --- Валидация и антиспам --- */
    const name = String(lead.name || '').trim();
    const phone = digits(lead.phone);

    if (name.length < 2 || name.length > 80) {
      return json({ ok: false, error: 'bad_name' }, 422, origin);
    }
    if (phone.length !== 11) {
      return json({ ok: false, error: 'bad_phone' }, 422, origin);
    }
    // ссылки в имени или комментарии — типичный спам-бот
    if (/https?:\/\/|www\.|\[url/i.test(name + ' ' + (lead.comment || ''))) {
      return json({ ok: true, spam: true }, 200, origin);
    }

    lead.name = name;
    lead.phone = '+' + phone;
    lead.receivedAt = new Date().toISOString();
    lead.ip = request.headers.get('CF-Connecting-IP') || '';
    lead.country = request.cf ? request.cf.country : '';

    /* --- Рассылка --- */
    const text = buildMessage(lead);
    const html = text.replace(/\n/g, '<br>');
    const subject = `Заявка с лендинга: ${lead.name}, ${lead.phone}`;

    const [tg, mail, crm] = await Promise.all([
      sendTelegram(env, text),
      sendEmail(env, subject, html),
      sendCrm(env, lead),
    ]);

    // Ответ всегда 200, если хотя бы один канал сработал — лид не должен теряться
    const delivered = [tg, mail, crm].some((r) => String(r).startsWith('ok'));
    return json({ ok: delivered, telegram: tg, email: mail, crm }, delivered ? 200 : 502, origin);
  },
};
