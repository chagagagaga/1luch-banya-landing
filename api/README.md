# Приём заявок — Cloudflare Worker

Заявки с лендинга уходят одним POST-запросом на Worker, а он уже раскидывает их
в Telegram, на почту и, если нужно, в CRM. Токены живут в секретах Cloudflare
и в браузер не попадают.

Полная настройка — 15 минут.

---

## Шаг 1. Телеграм-бот

1. Напишите [@BotFather](https://t.me/BotFather) → `/newbot` → придумайте имя и логин.
2. Скопируйте токен вида `7712345678:AAF...`.
3. Создайте группу «Заявки — баня», добавьте туда бота и менеджеров.
4. Узнайте `chat_id` группы: добавьте в неё [@getmyid_bot](https://t.me/getmyid_bot)
   либо откройте `https://api.telegram.org/bot<ТОКЕН>/getUpdates` после любого
   сообщения в группе и найдите `"chat":{"id":-100...}`.
   Для группы id отрицательный — так и записывайте, вместе с минусом.

> Если пишете в личку менеджеру, а не в группу — менеджер должен сначала
> сам нажать «Старт» боту, иначе Telegram не пропустит сообщение.

---

## Шаг 2. Деплой Worker

```bash
npm install -g wrangler          # если ещё не стоит
cd api
wrangler login                   # откроется браузер, авторизуйтесь в Cloudflare

wrangler secret put TELEGRAM_BOT_TOKEN     # вставьте токен бота
wrangler secret put TELEGRAM_CHAT_ID       # вставьте chat_id (можно несколько через запятую)

wrangler deploy
```

После деплоя в консоли появится адрес вида
`https://luch-lead.<ваш-аккаунт>.workers.dev`.

Проверьте, что живой:

```bash
curl https://luch-lead.<ваш-аккаунт>.workers.dev/health
# {"ok":true,"service":"luch-lead"}
```

---

## Шаг 3. Подключить лендинг

В файле `assets/js/lead.js` замените адрес в строке:

```js
var ENDPOINT = window.LUCH_ENDPOINT || 'https://luch-lead.workers.dev/lead';
```

на свой:

```js
var ENDPOINT = window.LUCH_ENDPOINT || 'https://luch-lead.ВАШ-АККАУНТ.workers.dev/lead';
```

И в `api/worker.js` в списке `ALLOWED_ORIGINS` укажите домен, где будет жить
лендинг (например `https://banya.1-luch.ru`), после чего повторите `wrangler deploy`.

---

## Шаг 4 (опционально). Дубль на почту

Через [Resend](https://resend.com) — бесплатно до 3000 писем в месяц.

```bash
wrangler secret put RESEND_API_KEY    # ключ из личного кабинета Resend
wrangler secret put MAIL_TO           # info@1-luch.ru,manager@1-luch.ru
wrangler secret put MAIL_FROM         # Заявки с сайта <lead@1-luch.ru>
wrangler deploy
```

Домен отправителя нужно подтвердить в Resend (DNS-записи). Пока он не подтверждён,
можно оставить `MAIL_FROM` пустым — письма пойдут с адреса-песочницы `onboarding@resend.dev`.

---

## Шаг 5 (опционально). CRM

```bash
wrangler secret put CRM_WEBHOOK       # URL входящего вебхука amoCRM / Битрикс24
wrangler deploy
```

Worker отправит в вебхук весь объект заявки целиком, включая конфигурацию
калькулятора и атрибуцию.

---

## Что приходит в Telegram

```
🔥 Новая заявка — баня

Имя: Андрей
Телефон: +79161234567
Связаться через: WhatsApp
Сроки: В ближайшие 1–3 мес.

— Конфигурация —
Сценарий: Печь + отделка
Площадь парной: 7 м²
Объём парной: 18 м³
Пакет отделки: premium
Тип парной: russian
Подобрана печь: Ялта 25/2025 (110 000 ₽)
Допы отделки: salt, light
Обвязка печи: chimney, mount
Расчёт: 934 000 – 1 139 000 ₽
Выгода комплекта: 148 500 ₽

— Источник —
Блок на странице: calc
Метки последнего визита: utm_source=yandex, utm_campaign=banya-msk, yclid=...
Реферер: https://yandex.ru/
Визитов до заявки: 2
ym_uid: 1721...
Страница: https://banya.1-luch.ru/?utm_source=yandex
```

---

## Локальная проверка

```bash
cd api
wrangler dev            # поднимет worker на http://localhost:8787
```

В другом терминале — из корня проекта:

```bash
python3 -m http.server 8080
```

Откройте `http://localhost:8080`, в консоли браузера выполните
`window.LUCH_ENDPOINT = 'http://localhost:8787/lead'` и перезагрузите
страницу — формы пойдут в локальный Worker.

> Без этого при открытии через `file://` или `localhost` отправка эмулируется:
> форма покажет успех, но никуда не отправит. Так удобно проверять вёрстку.

---

## Защита от спама

Уже встроено:

- **honeypot** — скрытое поле `website`, боты его заполняют, люди нет;
- **валидация на сервере** — имя от 2 символов, телефон ровно 11 цифр;
- **фильтр ссылок** — заявки со ссылками в имени или комментарии тихо отбрасываются;
- **CORS** — запросы принимаются только с доменов из `ALLOWED_ORIGINS`.

Если спам всё-таки пойдёт — добавьте Cloudflare Turnstile: он бесплатный
и не требует от пользователя кликать по картинкам.
