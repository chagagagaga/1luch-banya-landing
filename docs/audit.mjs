/**
 * Финальный аудит лендинга: рендер, интерактив, ссылки, картинки, тексты.
 * Запуск: node docs/audit.mjs
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'fs'; import path from 'path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const errs = [], warn = [], ok = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errs.push('JSDOM: ' + e.message));
vc.on('error', (...a) => errs.push('console.error: ' + a.join(' ')));

const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'),
  { runScripts: 'dangerously', url: 'http://localhost:8080/?utm_source=yandex&yclid=t1', virtualConsole: vc, pretendToBeVisual: true });
const { window } = dom, d = window.document;
for (const s of [...d.querySelectorAll('script[src]')]) {
  const f = path.join(ROOT, s.getAttribute('src').split('?')[0]);
  const el = d.createElement('script');
  try { el.textContent = fs.readFileSync(f, 'utf8'); } catch { errs.push('нет файла ' + f); continue }
  s.replaceWith(el);
}
d.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
await new Promise(r => setTimeout(r, 120));
const click = s => d.querySelector(s)?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const t = (c, msg) => (c ? ok : errs).push(msg);

// ── структура ───────────────────────────────────────────────────────────
const secs = [...d.querySelectorAll('main > section')];
t(secs.length >= 14, `секций: ${secs.length}`);
const anchors = [...d.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href')).filter(h => h !== '#');
const broken = anchors.filter(h => { try { return !d.querySelector(h) } catch { return true } });
t(!broken.length, 'битые якоря: ' + (broken.join(', ') || 'нет'));

// ── раскрыть всё скрытое ────────────────────────────────────────────────
click('[data-works-more]'); click('[data-stoves-more]'); click('.faq__more');
click('[data-reveal]');

// ── картинки ────────────────────────────────────────────────────────────
const imgs = [...d.querySelectorAll('img[src]')];
const miss = imgs.map(i => i.getAttribute('src')).filter(s => !s.startsWith('http') && !fs.existsSync(path.join(ROOT, s)));
t(!miss.length, 'битые картинки: ' + (miss.join(', ') || 'нет'));
const noAlt = imgs.filter(i => i.getAttribute('alt') === null);
t(!noAlt.length, 'без alt: ' + (noAlt.length || 'нет'));
const noDim = imgs.filter(i => !i.getAttribute('width') || !i.getAttribute('height'));
t(!noDim.length, 'без width/height: ' + (noDim.map(i=>i.getAttribute('src')).join(', ') || 'нет'));

// ── калькулятор ─────────────────────────────────────────────────────────
t(!!d.querySelector('[data-total]'), 'цена раскрывается');
const area = d.querySelector('[data-area]');
const before = d.querySelector('[data-total]')?.textContent;
area.value = 14; area.dispatchEvent(new window.Event('input', { bubbles: true }));
t(before !== d.querySelector('[data-total]')?.textContent, 'площадь меняет цену');
click('[data-mode="stove"]'); t(!d.querySelector('[data-pkg]'), 'режим «печь» прячет пакеты');
click('[data-mode="full"]'); t(!!d.querySelector('[data-pkg]'), 'режим «под ключ» показывает пакеты');
click('[data-steam-id="hammam"]');
t(/от\s/.test(d.querySelector('[data-total]')?.textContent || ''), 'хамам — цена «от»');
click('[data-steam-id="russian"]');

// ── печи ────────────────────────────────────────────────────────────────
const stoves = d.querySelectorAll('.stove');
t(stoves.length > 6, `печей после «показать ещё»: ${stoves.length}`);
const cta = d.querySelector('[data-stove-cta]');
t(cta?.textContent === 'Узнать точную стоимость', 'кнопка печи: ' + cta?.textContent);
cta.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const modal = d.querySelector('.modal');
t(modal && !modal.hasAttribute('hidden'), 'поп-ап печи открывается');
t(!modal.querySelector('.modal__summary'), 'в поп-апе нет блока «Ваш расчёт»');
t(!!modal.querySelector('input[name="name"]') && !!modal.querySelector('input[name="phone"]'), 'в форме есть имя и телефон');
t(!!modal.querySelector('[data-timings]'), 'в форме есть «когда планируете начать»');
t(modal.querySelector('button[type="submit"]')?.textContent === 'Получить расчёт', 'кнопка формы');
click('[data-close]');

// ── портфолио и лайтбокс ────────────────────────────────────────────────
t(d.querySelectorAll('.work').length >= 20, `объектов: ${d.querySelectorAll('.work').length}`);
click('[data-open-work]');
const lb = d.querySelector('.lightbox');
t(lb && !lb.hasAttribute('hidden'), 'лайтбокс открывается');
t(!!lb.querySelector('img')?.src, 'в лайтбоксе есть фото');
click('.lightbox__nav--next');
t(/2\/\d/.test(lb.querySelector('figcaption')?.textContent || ''), 'листание работает');
click('.lightbox__close');

// ── формы и цели ────────────────────────────────────────────────────────
t(d.querySelectorAll('form[data-form="lead"]').length === 2, `форм: ${d.querySelectorAll('form[data-form="lead"]').length} (страница + модалка)`);
t(!!d.querySelector('input[name="website"]'), 'honeypot на месте');
t(!!d.querySelector('script[type="application/ld+json"]'), 'микроразметка FAQ');

// ── тексты: противоречия и заглушки ─────────────────────────────────────
const text = d.body.textContent.replace(/\s+/g, ' ');
// «Бесплатно» допустимо только про смету: выезд платный, и обещать
// бесплатный выезд нельзя — партнёры это правило зафиксировали.
const banned = ['Заказать</button>', 'банный набор', 'Здесь будет', 'бесплатный выезд', 'выезд бесплат'];
banned.forEach(w => { if (text.toLowerCase().includes(w.toLowerCase())) warn.push('в тексте встречается «' + w + '»'); });
const years = text.match(/(\d+) лет на рынке/);
if (years && +years[1] !== 2026 - 2013) errs.push('цифра лет не сходится с «с 2013»');

// ── вывод ───────────────────────────────────────────────────────────────
console.log('\n✓ ПРОВЕРЕНО');
ok.forEach(m => console.log('  ✓', m));
if (warn.length) { console.log('\n⚠ ВНИМАНИЕ'); warn.forEach(m => console.log('  ⚠', m)); }
if (errs.length) { console.log('\n✗ ОШИБКИ'); errs.forEach(m => console.log('  ✗', m)); process.exitCode = 1; }
else console.log('\n✓ Ошибок нет');
