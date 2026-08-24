# Фото цеха: чем заменить

**Задача от партнёров (13.08.2026):** «Фото цеха желательно заменить на более
современный». Андрей: других фотографий нет и взять неоткуда. Иван дал добро
рисовать изображения ИИ.

**Что стоит сейчас:** `assets/img/production/production-1…3.webp` — реальные
снимки цеха: ЧПУ-станок в помещении со стенами из бетонных блоков, доски
навалом, потёртый пол. Снято на телефон, выглядит как гараж.

## Рекомендация: не рисовать «красивый цех»

Сгенерировать интерьер несуществующего производства и подписать его «наш цех» —
это заявление о компании, которое не выдержит первой же поездки клиента на
объект. Средний чек здесь от 850 000 ₽, клиенты приезжают смотреть.

Безопасный путь, который решает ту же задачу («выглядит современно»): вместо
общих планов помещения — **макро и детали**. Дерево, ламели, кромка, срез
термоясеня, стружка, скруглённый угол полка. Такие кадры ничего не утверждают
о размере и состоянии производства, но дают ощущение аккуратной работы —
а это и есть то, что блок должен продавать.

Если партнёры всё же хотят общие планы цеха — это их решение и их риск, но
тогда стоит убрать из подписей слово «наш» и оставить нейтральное «столярная
мастерская».

## Промпты для генерации (4 кадра, формат 700×500, WebP)

Стиль общий для всех: естественный дневной свет, приглушённая тёплая палитра
дерева, никаких людей и логотипов, реалистичная фотография, не 3D-рендер,
неглубокая резкость.

1. **`production-1.webp`** — замена кадра с ЧПУ
   > Macro photograph of a CNC router bit cutting a groove in a light hardwood
   > panel, fine wood dust in the air, shallow depth of field, natural daylight,
   > warm neutral tones, no people, no logos, realistic photo, 700×500.

2. **`production-2.webp`** — раскрой
   > Close-up of freshly cut abachi and lime wood lamellas stacked in a neat
   > fan on a workbench, soft daylight from the side, visible wood grain and
   > clean edges, warm palette, no people, realistic photo, 700×500.

3. **`production-3.webp`** — сборка
   > Detail shot of a sauna bench frame being assembled: rounded lamella edges,
   > hidden fasteners, a hand plane and clamps resting nearby, soft daylight,
   > warm wood tones, no people in frame, realistic photo, 700×500.

4. **`production-boards.webp`** — обжиг (сюжет из правки №24: «дуб и термоясень обжигают»)
   > Macro photograph of charred and brushed thermo-ash boards, dark burnt
   > texture with visible grain relief, next to an untreated oak board for
   > contrast, soft daylight, moody warm tones, no people, realistic photo,
   > 700×500.

## После генерации

1. Сложить в `assets/img/production/` под теми же именами — вёрстку править не
   нужно.
2. Пережать в WebP, ширина 700 px, качество ~80: `cwebp -q 80 -resize 700 0`.
3. Проверить `alt` в `index.html:401–404` — подписи должны совпадать с тем, что
   на кадре. Сейчас там «ЧПУ-станок», «раскрой», «сборка», «ламели для полков».
4. Прогнать `node docs/smoke-test.mjs`.
