# Фото цеха: как сделан набор

**Статус: сделано 24.08.2026.** Четыре кадра в блоке «Собственное производство»
сгенерированы ИИ и стоят на сайте. Здесь — метод и промпты, чтобы досоздать
пятый кадр в той же стилистике или переснять любой из четырёх.

## Откуда задача

Андрей (13.08.2026): «Фото цеха желательно заменить на более современный».
Своих фотографий нет и взять неоткуда — стояли снимки на телефон: бетонные
стены, доски навалом, потёртый пол. Иван разрешил нарисовать через ИИ.

**Про риск, который приняли осознанно.** Кадры показывают цех целиком —
станки, верстак, второго столяра в расфокусе. Это заявление о производстве, а
не нейтральное макро материалов. Решение принимал Иван. Если когда-нибудь
понадобится снизить риск, безопасный путь — заменить общие планы на макро и
детали (кромка, срез термоясеня, стружка), они дают то же ощущение аккуратной
работы, ничего не утверждая о размере цеха.

## Метод, который дал единый стиль

Четыре промпта одним заходом дают четыре разных мира. Работает связка:

1. **Якорный кадр генерится первым, текстом, без картинки.** Якорь — сборка
   полка (промпт 1 ниже). Крутить, пока не устроит свет.
2. **Готовый якорь прикрепляется картинкой** к каждому из остальных промптов,
   первой строкой:
   `Match the lighting, color grading, lens and mood of the reference image exactly.`
3. **STYLE-блок повторяется дословно** в конце каждого промпта.

```
Style: documentary product photography inside a working joinery shop. Soft diffused daylight from a large window on the left, no direct sunbeams, no hard shadows. Warm muted palette, natural wood tones, slightly desaturated. Shot on 50mm lens at f/2.8, shallow depth of field, workshop background softly blurred but readable. Realistic photograph, not a 3D render, no HDR look. No people's faces, no text, no logos, no brand names, no watermarks. Horizontal 7:5 composition.
```

## Сюжеты (STYLE-блок добавляется к каждому)

**`production-3` — сборка полка. ЯКОРЬ, генерить первым**
> Detail shot of a craftsman assembling a sauna bench frame from bent, curved
> wooden lamellas. The curved lamellas have softly rounded edges and are joined
> with hidden fasteners — no screw heads, no bolts, no hardware visible anywhere
> on the wood. A hand plane and brass clamps rest on the workbench, a few wood
> shavings scattered around. Focus on the curve of the lamellas.
>
> The curved piece is the front edge of a sauna bench; behind it on the bench
> stands a partly assembled two-tier sauna bench with horizontal slats.

**`production-1` — фрезеровка на ЧПУ**
> A CNC router with a straight spiral router bit — not a drill bit — plunged
> into a wide light hardwood panel and cutting a clean straight groove. The
> finished groove is clearly visible in the wood behind the bit, wood chips and
> dust spraying out of the cut. Close but not extreme macro — the panel and part
> of the machine gantry are visible, so the shot reads as a real workshop and
> not a stock close-up.

**`production-2` — ламели после раскроя**
> Freshly cut abachi and lime wood lamellas for sauna benches, stacked in a neat
> fan on a worn wooden workbench in a joinery shop. Visible wood grain, clean
> chamfered edges. Hand tools out of focus in the background.

**`production-boards` — обжиг**
> Close-up of two charred and wire-brushed ash and oak boards for a sauna bench,
> lying diagonally on a clean workbench and filling most of the frame. The wood
> is ring-porous hardwood with tight straight grain and open pores — not pine,
> no wide soft growth rings, no rustic exterior siding look. After charring the
> boards were brushed smooth: deep dark brown-black surface with fine grain
> relief and a soft satin sheen, edges crisp and planed. One untreated light oak
> board lies next to them for contrast. A brass wire brush rests beside them.
> The workbench is clean, only a light dusting of soot, no scattered charcoal
> debris.

## Грабли, на которые наступили

- **ЧПУ:** с первого раза генератор ставит спиральное сверло вместо фрезы и не
  заглубляет его в доску — реза нет. Лечится явным «straight spiral router bit
  — not a drill bit — plunged into the panel» и требованием видимого паза
  позади инструмента.
- **Обжиг:** по умолчанию выходит обожжённая сосна с широкими мягкими кольцами,
  то есть фасадная доска в стиле Shou Sugi Ban, а не материал для парной.
  Лечится указанием «ring-porous hardwood, tight straight grain, not pine».
- **Первый якорь** дал гнутую деталь, похожую на спинку стула — красиво, но
  читалось как мебельная мастерская. Добавка про двухъярусный полок с
  горизонтальными ламелями в фоне решила вопрос.
- Мелочи вроде чужого подбородка на краю кадра снимаются кадрированием при
  пережатии, перегенерировать из-за них не нужно.

## Как ставить на сайт

1. Файлы кладутся в `assets/img/production/` под теми же именами — вёрстку
   править не нужно.
2. Пережимаются в WebP 1400×1000 (7:5, с запасом под ретину):
   `cwebp -q 82 -crop 6 0 2420 1728 -resize 1400 1000 in.jpeg -o out.webp`
   (исходники Nano Banana приходят 2432×1728, кроп убирает лишние 12 px по
   ширине; смещать рамку по вертикали — если надо срезать что-то с края).
3. Подписи под фото и `alt` живут в `index.html`, секция `#production`. Они
   привязаны к сюжетам — при замене кадра проверить, что подпись всё ещё
   описывает то, что на картинке.
4. Прогнать `node docs/smoke-test.mjs`.
