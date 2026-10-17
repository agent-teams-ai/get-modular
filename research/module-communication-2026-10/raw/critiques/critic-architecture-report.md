# Отчёт критика: архитектура взаимодействия модулей Get Modular

## 0. Вердикт

Механика observation (снимок + ревизия, отложенная коалесцированная доставка, изоляция, «один активный + один ожидающий», seal, неизменяемые plain-данные) добротная, её стоит сохранить. Две вещи в форме API противоречат иерархии, вложенным фичам и plugin-ready: (1) одна продуктовая запись `AppSettings` в типах всех фич; (2) сбор подписчиков через центральный `many`-ряд в root. Оба решения приняты 2026-10-01/08, до вложенных фич (2026-10-11), правил `many` в ADR-0035 (2026-10-10) и dynamic instances (2026-10-02). PR #154 (ADR-0034) и #153 (брифы) открыты (`gh pr view`, 2026-10-15), поэтому сейчас поправить дешевле всего; после merge нужен successor ADR. Отдельный пакет событий не нужен: хватит правила и рецепта.

---

## 1. Классификация взаимодействий

| Вид | Паттерн индустрии | Примитив GM | Оценка |
|---|---|---|---|
| (a) данные/настройки вниз | single source of truth, props down; .NET Options на секцию; Flutter InheritedModel/Riverpod `select` | при конструировании: `required`-слот на `Reader`; изменения: observation; instance: `inputs` (ADR-0031) | есть, но без среза и иерархии (F1, F3) |
| (b) команды вверх / к владельцу | events up / callback props, Flux actions, CQRS command | командный порт владельца, слот у просящего | есть, но не записано правилом (F4) |
| (c) события между далёкими модулями | typed topics (IntelliJ), whiteboard (OSGi), domain events | типизированный порт событий издателя + подписка в scope слушателя | рецепт, без пакета (раздел 3) |
| (d) точки расширения/хуки | Tapable (sync/bail/waterfall/series), Backstage extension points, Fastify encapsulation | контракт владельца + `many`-слот (порядок `profile`) | есть; масштаб упирается в ручные ряды (D5) |
| (e) запросы/сервисы | ports & adapters, DI | `required`/`optional` слот на порт | есть; mediator (`send(query)`) запретить как скрытый service locator (`common-assembly.md:32`) |

VERIFIED первоисточники (main-ветки, получены 2026-10-15):
- Vue: «In most circumstances, using a global event bus for communicating between components is discouraged… it almost invariably proves to be a maintenance headache in the long term»; «Props and events should be your first choice for parent-child communication. Siblings can communicate via their parent» ([vuejs/v3-migration-guide events-api.md](https://github.com/vuejs/v3-migration-guide/blob/main/src/breaking-changes/events-api.md)).
- Vue `defineModel` — сахар: «expands it to… A prop named `modelValue`… An event named `update:modelValue`» ([vuejs/docs v-model.md](https://github.com/vuejs/docs/blob/main/src/guide/components/v-model.md)). Двусторонняя запись — только синтаксис над одним владельцем.
- .NET Options: «Scenarios (classes) that depend on configuration settings depend only on the configuration settings that they use» ([dotnet/docs options.md:12-13](https://github.com/dotnet/docs/blob/main/docs/core/extensions/options.md)).
- Fastify: «the containing _child context_ **does not** have access to the _child plugins_ registered within its _grandchild context_» ([Encapsulation.md](https://github.com/fastify/fastify/blob/main/docs/Reference/Encapsulation.md)) — то же, что правило FMS v1.1 «downward только к прямым детям».
- Backstage: «Extension points for a given plugin are also only accessible to modules that extend that same plugin»; factory-based вариант нужен, чтобы «attribute startup failures to modules» ([05-extension-points.md](https://github.com/backstage/backstage/blob/master/docs/backend-system/architecture/05-extension-points.md)).

---

## 2. Иерархия

**Ответ.** В GM четыре разных дерева/графа: дерево фич, дерево scope, дерево instance и DAG зависимостей. Данные должны течь по **DAG зависимостей** от провайдера к потребителю; просьбы идут обратно по тому же ребру вызовом командного порта владельца. Это и есть Vue-модель «props down / events up» (оба направления по одному объявленному ребру). Core запрещает циклы (`module-system-v1.md:56-57`: «cyclic … references MUST fail»), поэтому граф уведомлений, совпадающий с графом зависимостей, ацикличен по построению.

По трём вариантам из вопроса:
- ребёнок подписан на сырой источник — да, но на **свой срез**, а не на всю запись;
- явное отображение parent→child — да, как **проекция** (без копий и без второго писателя);
- свой источник на уровень — только когда уровень **вычисляет новый смысл** и становится его единственным писателем.

Согласование с правилами рёбер FMS v1.1: ребёнок читает порт родителя (upward use, разрешено); родитель реализует порт среза, которым владеет ребёнок (downward к прямому ребёнку, разрешено); внук получает срез только через ребёнка. Хаб для плоского источника уровня Host иерархии не противоречит (это «store + селекторы»), но как механизм для дерева ломается (F2).

**F1 · P1 · уверенность 8 · VERIFIED + вывод.** Одна продуктовая запись связывает каждую фичу и будущий плагин со всей записью настроек.
- `research/observation-hooks-2026-10/design.md:52-53`: «`settings = participantsFor<AppSettings>()` is created once per product».
- `briefs/OBS-3-standard.md:111-112`: `defineContract<Reader<AppSettings>>()({ id: "acme/settings-reader", revision: 1 })`.
- ADR-0034 `:131-133`: «invariant (`in out`), so a reader, port or participant for one record type is not accepted for another».
- `docs/architecture/common-assembly.md:418-419`: «Raise `revision` with every change of the value type, additive changes included».
- `docs/architecture/common-assembly.md:72-74`: «configurable inter-module relationships must use consumer-owned ports».

Вывод: каждый новый ключ меняет тип значения общего контракта. Внутри репозитория это просто перекомпиляция, а для отдельно опубликованных модульных пакетов и плагинов — ломающий релиз контрактного пакета на каждый новый ключ (`common-assembly.md:428-430`). Фича не может типизироваться своим срезом (инвариантность), поэтому кирпич не переносим, а плагин не знает `AppSettings` Host'а. Это прямо расходится с consumer-owned ports и с .NET Options.

**F2 · P1 · уверенность 8 · VERIFIED + вывод.** «Один хаб на источник» на деле — центральный whiteboard-ряд; он конфликтует с 0.5.0 и не доходит до instance и плагинов.
- Хаб — root, ID участников = `providerImplementationIds` binding'а (`OBS-3-standard.md:86-92`); слот `many({ min: 0, max: 1024 })` (`:145`).
- `many` без ряда не дополняется: `assembly.prepare.unresolved-binding` (ADR-0035 `:38-42`).
- 0.5.0: «rows live in the root's `prepare({ bindings })`… group-level bindings do not exist» (`research/module-dx-2026-10/0.5.0-train.md:2199-2203`); F-4 отложен (`:2404-2405`).
- Подфича приватна (`0.5.0-train.md:471-473`); «Module composition … MUST wire only top-level features» (`fms-nested-features-draft.md:300-302`).
- `many` отдаёт массив значений без ID провайдеров (`packages/assembly/src/features/construction/run.ts:59-60`), поэтому один и тот же список пишется трижды: ряд в `bindings`, замыкание `createSettingsHub(port, participantIds, …)` (`OBS-3-standard.md:140`) и `rows` oracle.
- ADR-0034, OBS-2 и OBS-3 ни разу не упоминают dynamic instances (ADR-0031), хотя «a value may be a port» (`common-assembly.md:332-336`) и «no live graph mutation» (`:316-317`).

Последствия (вывод): участник на глубине 3 называется в root (утечка приватного ID; root правят при каждом новом участнике — та же горячая точка, что SD-1 в `raw/evidence/code-sketch/critic-reports/scale-dx.md:16`). Участник внутри шаблона instance или плагина не может попасть в `many` плана Host'а: нужен свой хаб на шаблон (нигде не описано) или escape hatch.

Ранний критик уже рекомендовал consumer-owned вариант (`critic-reports/arch-solid-dry.md:7`: «Вариант 2 после исправлений - лучший дефолт»), и тот был fail-closed через Core `binding.missing` (`scale-dx.md:11`). ADR отклонил его, потому что «settlement is only self-reported and every module repeats about twenty lines» (ADR-0034 `:274-276`). Обе причины исчезают, если **пакет** сам регистрирует unsubscribe и drain в scope модуля — стандарт уже предписывает этот порядок (`common-assembly.md:186-190`, правила resources 5 и 6).

**F3 · P2 · уверенность 7 · VERIFIED + вывод.** Нет пути «родитель вычисляет — дети следят». «`commit` and `seal` stay with the Host» (ADR-0034 `:86-88`); «Module state change … Ordinary module port» (`design.md:249`); «Order between registrations is deterministic but not part of the contract» (ADR-0034 `:97-98`). Без санкционированного пути родитель будет пересылать значения ребёнку из `apply`: это задача задержки на каждый уровень и glitch, потому что ребёнок, видящий и сырой, и производный смысл, получает их в неопределённом порядке.

**F4 · P2 · уверенность 7 · VERIFIED (отсутствие правила).** Правило OBS-3 (`OBS-3-standard.md:84-100`) молчит, как модуль просит изменить настройку, и не запрещает запись из `apply` в те же ключи, которые модуль наблюдает (петля A→B→A через задачи).

---

## 3. События между далёкими модулями

Глобальная шина — антипаттерн (цитата Vue выше). Сравнение двух GM-нативных вариантов:

| Критерий | Whiteboard (слушатели `provide`, издатель собирает через `many`) | Слушатель зависит от порта издателя и подписывается в своём scope |
|---|---|---|
| Направление ребра | обратно данным: коллектор зависит от всех | по данным: слушатель зависит от издателя |
| Видимость в плане | ряд `many` в root + oracle `rows` | `required`-ряд дополняется сам; видно по capability id в `describeWiring` |
| Вложенные фичи | root называет приватные ID | ребро в пределах видимости FMS; приватное — только через republication |
| Циклы | слушатель не может вызывать издателя; нужен отдельный publish-фасет и коллектор-root | слушатель свободно вызывает команды издателя |
| Instance и плагины | каждый слушатель требует нового плана | instance подписывается на порт из `inputs`, граф Host'а не меняется |
| Атрибуция ошибок | нужен ID провайдера (Assembly не даёт) | по пути scope |
| Индустрия | IntelliJ: «Use declarative registration whenever possible» ([messaging_infrastructure.md:168](https://github.com/JetBrains/intellij-sdk-docs/blob/main/topics/reference_guide/messaging_infrastructure.md)); Backstage | IntelliJ: подключение, привязанное к `Disposable` (`:120-121`), типизированный `Topic` (`:61`) |

**Моё предложение.**
- События внутри репозитория и состояние — правый столбец.
- Whiteboard — только для точек расширения, где важны порядок или перечисление, и для плагинов. Для плагинов ряды генерирует plugin Host из манифестов (F-1), а не человек в root.
- Намерение владельца «модуль зависит от другого, даже если опционально» верное. Но `optional` в GM тоже требует явного ряда в root (ADR-0035 `:38-42`), поэтому `required`, если издатель есть всегда.

Семантика рецепта: доставка в более позднюю задачу; синхронный обработчик с типом `=> undefined`; изоляция на каждого подписчика; FIFO от одного издателя; порядок между подписчиками не входит в контракт. Back-pressure: событие нельзя склеивать, поэтому нужна ограниченная очередь и явная ошибка переполнения. Главное правило: если событие можно склеить, это состояние, и для него есть observation.

Пакет `@get-modular/events` сейчас не нужен: правило в стандарте плюс рецепт. Выносить в код — когда два независимых потребителя запросят неколлапсируемые события, и тогда вторым примитивом того же пакета (общий код изоляции и attach), а не вторым механизмом рядом.

---

## 4. Pluggable architecture

**Что уже есть:** контракты и контрактные пакеты (аналог node-library пакетов Backstage); `many` с порядком `profile`; lifecycle-kernel (поколения, quiesce, retire); dynamic instances с `inputs`; scope-дерево; contract suites.

**Требования к observation и событиям (не дизайн плагинной системы):**
- **R1.** Плагин или instance подписывается на порт Host'а, полученный как input, без пересборки плана Host'а. Сейчас нет (F2).
- **R2.** Плагин объявляет свой тип среза настроек, Host даёт проекцию. Сейчас нет (F1).
- **R3.** Поведение живёт на объектах, которые передаёт Host; плагины импортируют только типы. Сейчас нарушено: «registry of the package copy… a participant from another copy is rejected as foreign» (ADR-0034 `:66-68`, `design.md:432-434`). Отдельно собранный плагин со своей копией пакета получит отказ (вывод). **P2, уверенность 7.**
- **R4.** Отзыв регистраций плагина синхронно на quiesce/retire, раньше drain. `resources.signal` срабатывает только когда scope начинает закрываться (`packages/resources/README.md:65-67`). ASSUMPTION: Host'у понадобится явный detach; с реализацией resources не проверено.
- **R5.** Атрибуция ошибок и долгов по плагину.
- **R6.** Никакого ambient-реестра и опоры на порядок.
- **R7.** Плагину никогда не передаются `commit`, `seal`, `ScopeControl`.

Формулировка «Participants are not a plugin SPI» (ADR-0034 `:190`) прямо спорит с направлением владельца на плагины; смысл абзаца — доверие, поэтому лучше: «Participants are not a trust boundary». **P2, уверенность 7.**

---

## 5. Готовые библиотеки

| Библиотека | Проверенные факты | Вердикт |
|---|---|---|
| RxJS 7.8.2 | 4 497 673 байт unpacked, зависимость `tslib` (`npm view`, 2026-10-15). Готового «один активный + один ожидающий» нет (вывод, не проверено). | нет |
| alien-signals 3.2.1 | 47 145 байт, без зависимостей. `flush()` в стеке записи (`esm/index.mjs:301-309`); исключение эффекта прерывает flush (`:253-269`), ошибка уходит писателю (VERIFIED чтением кода). Нет async-деривации и отмены. | нет |
| @preact/signals-core 1.14.4 | 259 629 байт; по исследованию «errors thrown to the writer (Jotai, Preact)» (`design.md:158-159`). | нет |
| signal-polyfill 0.2.2 | «Do not use this in production» (`design.md:155-156`). | нет |
| mitt 3.0.1 | `emit` = `i.slice().map(function(n){n(e)})` без try/catch (`dist/mitt.mjs`, VERIFIED): первый упавший обработчик останавливает остальных; по умолчанию строковая глобальная шина. | нет |
| EventTarget (Node 26.11.0) | MEASURED: второй слушатель выполнился, ошибка ушла в `uncaughtException` (по умолчанию роняет процесс). | нет |
| Tapable 2.3.3 | `new Function` (`lib/HookCodeFactory.js:19,31,71`); sync-хуки делают `throw` (`:22`). | только словарь видов хуков |

Итог: свой небольшой код. Ядро sketch v4 около 570 строк (`design.md:213-214`), единственный peer — resources (ADR-0034 `:59-62`).

---

## 6. Стандарт: что запретить и что записать

**Антипаттерны, которые стоит явно запретить:**
1. Глобальная шина и строковые топики.
2. Несколько писателей одного значения.
3. Запись из `apply` в ключи, которые модуль сам наблюдает.
4. Двустороннее связывание через общий изменяемый объект (сахар допустим, только если разворачивается в «срез + команда»).
5. Mediator / service locator для запросов.
6. Подписка без владельца-scope.
7. Пересылка (prop drilling) сырых значений через модули, которые их не используют (Vue: «If an interim component doesn't need the props then it might indicate a problem with separation of concerns»).
8. Наблюдение одного смысла по двум путям (сырому и производному).
9. Продуктовая god-запись настроек в типах фич и плагинов.
10. Центральный список подписчиков, который правит каждая команда.
11. Событие вместо состояния (опоздавший подписчик пропускает факт).
12. Async-обработчик в пути уведомления; ожидание подписчиков издателем.
13. Реентрантная синхронная доставка.
14. Опора на порядок независимых слушателей.

**Видение для всех агентов:**
1. У значения один владелец и один писатель.
2. Данные идут по объявленному ребру от провайдера к потребителю; просьбы — вызовом командного порта владельца.
3. Потребитель зависит от своего среза (consumer-owned порт).
4. Родитель отображает данные ребёнку явно: проекцией или своим источником; один путь на один смысл.
5. Состояние — через observation; событие — только для неколлапсируемого.
6. Каждое взаимодействие — типизированный контракт, видимый в плане.
7. Подписка принадлежит scope потребителя; закрытие сначала отписывает, потом выполняет drain.
8. Доставка отложенная и изолированная; обработчик синхронный и возвращает `undefined`.
9. Асинхронная реакция — в latest-only lane с отменой.
10. Порядок не входит в контракт, кроме явного ряда `many`.
11. Точка расширения принадлежит фиче-владельцу и видна её поддереву.
12. Плагин получает только фасеты чтения, наблюдения и команд и только типы пакета.
13. Политика остаётся в Host.

---

## 7. Решения с вариантами (надёжность / уверенность)

**D1. Как модуль подписывается на изменения**
- **A (Recommended), 8/7.** Scope-local attach (Моё предложение): модуль зависит от порта своего среза через `required` и одним вызовом прикрепляет тот же data-only participant в своём `resources`. Lane, unsubscribe и drain регистрирует пакет; хаб, `participantIds` и, возможно, реестр `participantsFor` уходят (заодно закрывает R3). Минусы: Host теряет собранные в одном месте первые результаты для readiness; меняется решение владельца от 2026-10-01; ADR правится до merge.
- **B, 7/5.** Хаб плюс доработка Assembly: completion для `many` или F-4, и ID провайдеров в `many`. Плагинам всё равно нужен новый план.
- **C, 6/8.** Оставить как есть. Уверенность 8 — что работает на плоском TEST; что переживёт вложенные фичи и плагины без break — 4.

**D2. Типы настроек**
- **A (Recommended), 8/7.** Срез на фичу плюс явная проекция (переименование/подмножество ключей, без функций), один источник. Примерно 80-150 LOC (ASSUMPTION).
- **B, 7/6.** Отдельный источник на срез, создаёт Host; нового API нет, но Host знает типы всех подфич.
- **C, 6/8.** Один `AppSettings`, как сейчас.

**D3. Производные значения в иерархии**
- **A (Recommended), 7/6.** Модуль может владеть источником своих производных значений как единственный писатель; меняется только формулировка ADR и стандарта.
- **B, 5/6.** Родитель проталкивает значения в порт ребёнка из `apply`.
- **C, 7/5.** Запретить; дети считают сами из сырого среза.

**D4. События**
- **A (Recommended), 8/7.** Правило плюс рецепт; вынос в код при двух потребителях, вторым примитивом того же пакета.
- **B, 6/5.** Event channel в observation сейчас.
- **C, 4/7.** Отдельный `@get-modular/events` (уверенность 7 — что этот вариант хуже).

**D5. Точки расширения при масштабе**
- **A (Recommended), 7/6.** Пока ничего; при первой нужде — F-4; для плагинов ряды генерировать из манифестов (F-1).
- **B, 7/5.** Новый вид порядка `many` с сортировкой по ID; затрагивает GM-REQ-003 (`module-system-v1.md:35-37`).
- **C, 5/7.** Хелпер в каждом Host (как неявно сейчас в OBS-3) — зоопарк вариантов.

**Вопросы владельцу:**
1. D1: пересматриваем хаб до merge #154? Аргумент — факты, появившиеся после решения 2026-10-01.
2. D2: срезы настроек на фичу вместо `AppSettings`?
3. D3: разрешаем модулю владеть источником своих производных значений?
4. D4: для событий сейчас только правило и рецепт, пакет позже?
5. D5: кто и когда делает F-4 или completion `many`?

---

## 8. Риски и что вне скоупа

**Риски:**
- Повторное открытие решения: задержка observation 0.1.0 примерно на 2-4 дня (ASSUMPTION); правки в основном вычитающие.
- Оверинжиниринг: проекция может разрастись в computed graph, события — в шину. Граница: проекция без функций, никакого bus.
- Недоинжиниринг: публичный 0.1.0 на плоской TEST-топологии (`design.md:350-357`) почти наверняка придётся ломать. **P3, уверенность 6:** добавить в OBS-T одного участника-подфичу и один instance, подписывающийся через input.
- Glitch в diamond-графах без правила «один путь на один смысл».
- Неизменяемость принятого ADR: после merge #154 любые изменения D1-D3 потребуют successor ADR.
- Плагины: две копии пакета и синхронный отзыв регистраций — не проверено.

**Вне скоупа:** сама плагинная система; durable-события и outbox; межпроцессная доставка; health-контракт; протокол readiness; computed graph; interop-адаптеры.

**Не проверено в этой сессии:** whitepaper OSGi «Listeners Considered Harmful»; семантика `switchMap` в RxJS; разница StateFlow и SharedFlow.

## Файлы

- `<workspace>/.worktrees/get-modular-obs-1-adr/docs/decisions/0034-admit-the-module-change-observation-package.md`
- `<workspace>/.worktrees/get-modular-observation-docs/research/observation-hooks-2026-10/briefs/OBS-3-standard.md`
- `<workspace>/.worktrees/gm-main-readonly-20261015/research/observation-hooks-2026-10/design.md`
- `<workspace>/.worktrees/gm-main-readonly-20261015/docs/architecture/common-assembly.md`
- `<workspace>/.worktrees/gm-main-readonly-20261015/docs/decisions/0035-complete-composition-profiles-in-prepare-and-make-capabilitiesof-linear.md`
- `<workspace>/.worktrees/gm-main-readonly-20261015/packages/assembly/src/features/construction/run.ts`
- `<workspace>/.worktrees/gm-pr172-readonly-20261015/research/module-dx-2026-10/0.5.0-train.md`
- `<workspace>/.worktrees/gm-pr172-readonly-20261015/research/module-dx-2026-10/fms-nested-features-draft.md`
