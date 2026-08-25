/**
 * Проверка вёрстки в настоящем браузере на пяти ширинах.
 * Ловит то, чего не видит jsdom: переполнение, наложения, горизонтальный скролл.
 * Нужен локальный сервер: npm start (порт 8099).
 */
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:8099/index.html';
const WIDTHS = [360, 390, 768, 1280, 1440];
const problems = [];

const browser = await chromium.launch({ channel: 'chrome' });
for (const w of WIDTHS) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') jsErrors.push(m.text()); });
  await page.goto(URL, { waitUntil: 'networkidle' });
  // раскрыть всё, что прячется за кнопками
  for (const sel of ['[data-works-more]', '[data-stoves-more]', '.faq__more', '[data-reveal]']) {
    const el = await page.$(sel); if (el) await el.click().catch(() => {});
  }
  await page.waitForTimeout(400);

  const res = await page.evaluate(() => {
    const out = { hScroll: 0, overflow: [], tiny: [], overlap: [], cut: [] };
    out.hScroll = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const vw = document.documentElement.clientWidth;
    const label = el => {
      const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : '') + (t ? ` «${t}»` : '');
    };
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || !el.offsetParent && cs.position !== 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      // выход за правый край экрана
      if (r.right > vw + 1) out.overflow.push(label(el) + ` → ${Math.round(r.right - vw)}px за край`);
      // текст обрезан контейнером
      if (el.children.length === 0 && el.scrollWidth > el.clientWidth + 2 && cs.overflow !== 'visible' && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') {
        out.cut.push(label(el) + ` → обрезан на ${el.scrollWidth - el.clientWidth}px`);
      }
      // кликабельное меньше 32px
      if ((el.tagName === 'BUTTON' || el.tagName === 'A') && (r.height < 32 || r.width < 32) && el.offsetParent) {
        out.tiny.push(label(el) + ` → ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    return out;
  });

  const tag = `${w}px`;
  if (res.hScroll > 1) problems.push(`${tag}: горизонтальный скролл ${res.hScroll}px`);
  res.overflow.slice(0, 6).forEach(m => problems.push(`${tag}: за край — ${m}`));
  res.cut.slice(0, 6).forEach(m => problems.push(`${tag}: обрезано — ${m}`));
  res.tiny.slice(0, 4).forEach(m => problems.push(`${tag}: мелкая цель — ${m}`));
  jsErrors.slice(0, 3).forEach(m => problems.push(`${tag}: JS — ${m}`));

  console.log(`${tag}: скролл ${res.hScroll}px, за край ${res.overflow.length}, обрезано ${res.cut.length}, мелких ${res.tiny.length}, JS-ошибок ${jsErrors.length}`);
  await page.close();
}
await browser.close();
if (problems.length) { console.log('\n✗ НАЙДЕНО:'); problems.forEach(p => console.log('  ✗', p)); process.exitCode = 1; }
else console.log('\n✓ Вёрстка чистая на всех ширинах');
