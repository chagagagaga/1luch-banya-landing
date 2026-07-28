/**
 * Проверка лендинга без браузера.
 * Поднимает index.html в памяти, выполняет весь JS и проверяет,
 * что секции отрисовались, а интерактив работает.
 *
 * Запуск:
 *   npm install
 *   node docs/smoke-test.mjs
 *
 * Зачем: после редизайна прогнать и убедиться, что разметку не сломали.
 * Если тест падает — значит потеряны data-атрибуты или контейнеры.
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('JSDOM: ' + e.message));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), {
  runScripts: 'dangerously',
  url: 'http://localhost:8080/?utm_source=yandex&utm_campaign=banya-msk&yclid=test123',
  virtualConsole: vc,
  pretendToBeVisual: true,
});

const { window } = dom;
const d = window.document;

// jsdom не тянет внешние скрипты — подставляем содержимое вручную
for (const s of [...d.querySelectorAll('script[src]')]) {
  const file = path.join(ROOT, s.getAttribute('src').split('?')[0]);
  const el = d.createElement('script');
  try {
    el.textContent = fs.readFileSync(file, 'utf8');
    d.body.appendChild(el);
  } catch (e) {
    errors.push('не выполнился ' + file + ': ' + e.message);
  }
}
d.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));

const q = (sel) => d.querySelectorAll(sel).length;
const click = (sel) => {
  const el = d.querySelector(sel);
  if (!el) { errors.push('нет элемента для клика: ' + sel); return false; }
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  return true;
};

/* ── Рендер ─────────────────────────────────────────────────────────── */
const render = {
  'калькулятор отрисован':   q('[data-calc] .calc'),
  'вкладки сценария (3)':    q('[data-mode]'),
  'ползунки':                q('input[type=range]'),
  'итог расчёта':            q('[data-total]'),
  'пакеты отделки (3)':      q('[data-pkg-card]'),
  'карточки печей':          q('.stove'),
  'объекты портфолио':       q('.work'),
  'видео':                   q('.video'),
  'отзывы':                  q('.review'),
  'этапы':                   q('.step'),
  'вопросы FAQ':             q('details.qa'),
  'формы заявки':            q('form[data-form="lead"]'),
  'honeypot в формах':       q('input[name="website"]'),
  'микроразметка FAQ':       q('script[type="application/ld+json"]'),
};

console.log('— Рендер —');
for (const [k, v] of Object.entries(render)) console.log(`  ${v ? '✓' : '✗'} ${k}: ${v}`);

/* ── Интерактив ─────────────────────────────────────────────────────── */
const total0 = d.querySelector('[data-total]')?.textContent;

click('[data-mode="finish"]');
const finishOnly = !!d.querySelector('[data-area]') && !d.querySelector('[data-volume]');
click('[data-mode="stove"]');
const stoveOnly = !!d.querySelector('[data-volume]') && !d.querySelector('[data-area]');
click('[data-mode="both"]');
const pickShown = q('[data-pick]') > 0;

const vol = d.querySelector('[data-volume]');
const pickBefore = d.querySelector('.calc-pick__name')?.textContent;
if (vol) { vol.value = 34; vol.dispatchEvent(new window.Event('input', { bubbles: true })); }
const pickAfter = d.querySelector('.calc-pick__name')?.textContent;
const totalAfter = d.querySelector('[data-total]')?.textContent;

const stovesBefore = q('.stove');
click('[data-filter-fuel] [data-f="electric"]');
const stovesAfter = q('.stove');
click('[data-filter-fuel] [data-f="all"]');

click('[data-cta="whatsapp"]');
const modal = d.querySelector('.modal');

click('[data-open-work]');
const lb = d.querySelector('.lightbox');

// маска телефона и валидация
const form = d.querySelector('form[data-form="lead"]');
const phone = form?.querySelector('[name=phone]');
if (phone) {
  phone.value = '89161234567';
  phone.dispatchEvent(new window.Event('input', { bubbles: true }));
}
const masked = phone?.value === '+7 (916) 123-45-67';

form.querySelector('[name=name]').value = '';
form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const validates = /обращаться/.test(form.querySelector('.form-status')?.textContent || '');

// в ru-RU разряды разделяются неразрывным пробелом — нормализуем перед сверкой
const startedOnFinish = /390 000/.test((total0 || '').replace(/\s/g, ' '));

const attr = window.LuchAttribution ? window.LuchAttribution.getPayload() : {};
const utmOk = attr?.last_touch?.marks?.utm_source === 'yandex' && attr?.last_touch?.marks?.yclid === 'test123';

const checks = {
  'вкладка «отделка» прячет объём':   finishOnly,
  'в комплекте есть карточка печи':   pickShown,
  'вкладка «печь» прячет площадь':    stoveOnly,
  'объём меняет модель печи':         pickBefore !== pickAfter,
  'объём пересчитывает итог':         total0 !== totalAfter,
  'фильтр «электро» сужает выдачу':   stovesAfter > 0 && stovesAfter < stovesBefore,
  'модалка открывается':              modal && !modal.hasAttribute('hidden'),
  'в модалке есть сводка расчёта':    !!modal?.querySelector('.modal__summary-price'),
  'лайтбокс открывается с фото':      lb && !lb.hasAttribute('hidden') && !!lb.querySelector('img')?.src,
  'маска телефона работает':          masked,
  'валидация ловит пустое имя':       validates,
  'UTM и yclid захватываются':        utmOk,
  'стартует с минимальной вилки':     startedOnFinish,
};

console.log('\n— Интерактив —');
for (const [k, v] of Object.entries(checks)) console.log(`  ${v ? '✓' : '✗'} ${k}`);

console.log(`\n  подбор печи: ${pickBefore} → ${pickAfter}`);
console.log(`  итог: ${total0} → ${totalAfter}`);
console.log(`  печей в выдаче: ${stovesBefore} → ${stovesAfter} (только электро)`);

console.log('\n— Ошибки JS —');
console.log(errors.length ? errors.map((e) => '  ' + e).join('\n') : '  нет');

const failed = Object.entries({ ...render, ...checks }).filter(([, v]) => !v).map(([k]) => k);
if (failed.length || errors.length) {
  console.log('\n✗ ПРОВАЛЕНО: ' + (failed.join(', ') || 'ошибки JS'));
  process.exit(1);
}
console.log('\n✓ Всё на месте');
