# Эволюция capability-контрактов: минимально достаточный дизайн

Дата: 2026-10-01. Статус: предложение для foundation review, не ADR. Линза: минимально достаточный.
База: get-modular `9c722ce`, agent-runtime `origin/main` `b0bcb265`.

## 1. Что есть в GM сейчас (проверенные факты)

- В wire-формате у каждой записи `provides`/`slots` есть две идентичности: `capabilityId` и
  `compatibility {family: "exact", familyVersion: 1, token}`
  (`packages/core/src/features/authoring/wire-types.ts:9-29`). Plan повторяет их в `bindings`
  (`wire-types.ts:57-67`, `composition-semantics/semantic-analysis.ts:63-64`), поэтому token входит в digest.
- Совместимость проверяется так: provider ищется по `capabilityId`, затем token сравнивается побайтно
  (`composition-semantics/binding-record.ts:48-60`; ADR-0005:30-44). При расхождении выдаётся `binding.compatibility-mismatch`
  с обоими объектами (`authoring/diagnostic-types.ts:105-115`).
- Provider не может объявить один `capabilityId` дважды (`declaration-census.ts:72-78`), а профиль выбирает
  одну реализацию на `moduleId` (`profile-census.ts:46-51`).
- В Assembly карта `C` ключуется по `capabilityId`, значение `CapabilityContract<Value, Token>` (`assembly/.../types.ts:3-7`).
  `ValidDeclaration` требует, чтобы compatibility совпадала в обе стороны (`types.ts:36-39`), а `prepare` ещё раз сверяет token
  (`prepare.ts:29`).
- Путь миграции уже записан 2026-09-04 в `docs/architecture/mvp-implementation-roadmap.md:898-934`: breaking-изменение
  получает новый `capabilityId` и новый token, provider может объявить оба, удаление идёт после инвентаря Host.
  Поэтому пробел из заметки 2026-09-04 («единственный путь это второй moduleId, не описан») **устарел частично**.
  Путь описан, но только в roadmap, а не в ADR или Standard. Правило, как связаны token и `capabilityId`, так и не появилось.
- ADR-0009:77-79: token принадлежит продукту, Core не требует `/v1`.
- Как это используют на практике. В AR 18 `capabilityId` в двух файлах делят **два общих token**
  (`embedded-runtime/src/composition/runtime-setup-assembly.ts:34-43`, `.../ordinary-runtime-assembly.ts:7-8`), то есть token
  работает как метка области. В TEST Host token равен `capabilityId + "/v1"` (`modularity-host-TEST/src/fixtures/graph.ts:8-14`).
  Тесты GM сами объявляют хелпер `exact()` (`tests/assembly/types.ts:13-15`).
  Вывод: у token нет устоявшегося смысла, и он только добавляет церемонию.
- Эксперименты на опубликованных 0.2.0 (tsc7, Node 26.9, scratchpad):
  (a) два major как разные id `acme/logger/v1` и `acme/logger/v2`. Один provider обслуживает оба, старый и новый consumer
  стоят в одном профиле. Компиляция и `run` дают `succeeded`, typecheck чистый.
  (b) Если оставить тот же `capabilityId`, а поменять token, получается `declaration.duplicate-capability`, и Assembly отвергает
  устаревший token на уровне типов. Это и есть flag day.
  (c) Лишнее поле в `provides` проходит типизацию `defineModule`, но компиляция падает на нём с `schema.unknown-field`.

**Итог:** параллельные major и адаптеры GM поддерживает уже сейчас без кода. Flag day возникает только тогда, когда token
меняют при том же id. Token не даёт ничего, чего не даёт сам `capabilityId`.

## 2. Как это решают другие (кратко)

| Система | Факт (цитата) | Что берём / чего избегаем |
| --- | --- | --- |
| Go | «If an old package and a new package have the same import path, the new package must be backwards compatible with the old package.» Major живёт в пути: `oauth2/v2` ([источник](https://research.swtch.com/vgo-import)) | Берём: та же идентичность означает совместимость, major входит в идентичность |
| Google AIP-185 | Major «encoded at the end of the protobuf package»; «Google APIs **must not** expose minor or patch version numbers» ([источник](https://google.aip.dev/185)) | Берём: minor в контракте не нужен |
| Kubernetes | «can not be removed from that version or have its behavior significantly changed». Объекты обязаны проходить round-trip между версиями ([источник](https://kubernetes.io/docs/reference/using-api/deprecation-policy/)) | Conversion-слой нужен им из-за хранимых объектов, которые читают через несколько версий. У GM хранимых capability-объектов нет, поэтому хватит адаптера-модуля |
| OSGi | Providers импортируют `[2.1,2.2)`, consumers `[2.1,3)` ([источник](https://docs.osgi.org/whitepaper/semantic-versioning/060-importer-policy.html)) | Избегаем: смысл диапазона зависит от роли. Если у контракта есть альтернативные реализации, «minor» ломает providers |
| GraphQL | «avoiding versioning by providing the tools for the continuous evolution» ([источник](https://graphql.org/learn/schema-design/)) | Это работает, потому что клиент сам выбирает поля. TS-интерфейс provider реализует целиком, так что безопасны только опциональные добавления |
| VS Code | `engines.vscode` задаёт один диапазон на весь Host; proposed API «should not be used in published extensions» ([manifest](https://code.visualstudio.com/api/references/extension-manifest), [proposed](https://code.visualstudio.com/api/advanced-topics/using-proposed-api)) | Диапазон на весь Host слишком груб, годится только как предфильтр (так же в `reference/.../lessons-and-antipatterns.md:169-181`) |

## 3. Три варианта

### Вариант 1. Только правило, wire не меняется

Правило такое: token равен `capabilityId`, major входит в `capabilityId`, token никогда не меняется при том же id.
В `ValidDeclaration` добавляется условие `token extends capabilityId`.

- Надёжность 6/10, уверенность 8/10, сложность 2/10.
- LOC: src около 10, tests около 30, docs около 150. Миграция AR около 30 строк.
- Минус: две идентичности остаются, одна из них превращается в мёртвое поле. Церемония повторяется в каждой из сотен деклараций.
  Получается та самая «накопленная legacy», которую запрещает политика организации.

### Вариант 2. Единая идентичность: удалить `compatibility` (**рекомендуется**)

```ts
type ModuleDeclaration = { kind; schemaVersion: 2; moduleId; implementationId; owner;
  provides: readonly { readonly capabilityId: string }[];               // объект оставлен как seam
  slots: readonly { readonly slotId: string; readonly capabilityId: string; readonly cardinality: Cardinality }[] };
type CompositionPlan = { /* ... */ schemaVersion: 2;
  bindings: readonly { consumerImplementationId; slotId; providerImplementationIds; capabilityId }[] };
// Assembly
type CapabilityContract<Value> = { readonly value: Value };            // обёртка остаётся как seam
```

Binding считается валидным, если у provider есть `slot.capabilityId`. Проверка token исчезает.

- Надёжность 9/10, уверенность 8/10, сложность 3/10 (код).
- LOC: src примерно −110/+25 (нетто около −85), tests около 250–400 изменённых строк (в основном удаления),
  docs: ADR около 120, Standard около 70, migration guide около 50.
- Главная цена в governance: нужен successor (schema, catalog, contract, snapshots, ledger), как в ADR-0021.
  `git grep familyVersion` даёт 187 вхождений; объём регенерируемых артефактов **не проверен**.

### Вариант 3. Revision family в духе OSGi-lite

```ts
provides: { capabilityId: "acme/logger/v2"; revision: 3 }
slots:    { slotId; capabilityId: "acme/logger/v2"; minRevision: 2; cardinality }
type CapabilityContract<Value, Revision extends number>   // + новый код binding.revision-too-low
```

- Надёжность 6/10, уверенность 4/10 (что это понадобится в ближайший год), сложность 6/10.
- LOC: src +200–300, tests +400–600, docs +250, плюс новое поколение диагностики.
- В TS-Host, который собирается целиком, структурную совместимость и так проверяет `tsc`. Revision помогает только плагинам,
  которые загружаются в runtime без typecheck, а их пока нет. И у revision та же асимметрия ролей, что в OSGi.

## 4. Рекомендация: вариант 2 плюс нормативные правила

**Правила.** Их место в Consumer Module Standard, раздел «Capability contract evolution», и в ADR.

1. **Идентичность.** `capabilityId` и есть идентичность контракта вместе с major. Он SHOULD заканчиваться на `/v<N>`.
   Core считает id непрозрачным и никогда его не разбирает.
2. **Два класса контрактов.**
   - *Локальный*: все providers и consumers собираются атомарно, в одном build или репозитории. Такой контракт меняется
     на месте, всех участников сразу проверяют `tsc` и тесты, новый id не нужен. Breaking-изменение в MVP стоит одного PR.
   - *Опубликованный*: пересекает границу независимого релиза (другой репозиторий, плагин). Действует правило Go: при том же id
     допустимы только изменения, безопасные для обеих ролей. Это опциональные члены, которые consumer считает возможно
     отсутствующими, и уточнения документации. Всё остальное получает новый id. Сюда же относятся смена семантики ошибок,
     отмены, эффектов и порядка.
3. **Переход.** Есть два способа:
   - provider объявляет оба id; один объект может удовлетворять обоим, если структурно совместим;
   - владелец контракта выпускает адаптер-модуль со слотом `…/v2`, который предоставляет `…/v1`.

   Consumers переводят слоты в своём релизе. Старый id удаляют, когда ни в одном plan Host не осталось
   `bindings[].capabilityId` со старым значением.
4. **TypeScript.** Владелец держит types-only пакет контракта: `const loggerV2 = "acme/logger/v2"` и `interface LoggerV2`.
   Классов и `#private` в типах контракта быть не должно: они номинальны и ломаются при дублировании пакета.
   Host описывает переход так: `{ [loggerV1]: CapabilityContract<LoggerV1>; [loggerV2]: CapabilityContract<LoggerV2> }`.
5. **Deprecation.** Константа id и тип помечаются `/** @deprecated */`. Редакторы зачёркивают такое использование во всех
   репозиториях ([TS 4.0](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-0.html)). Новых полей в wire не нужно.

**Кто чем владеет.**

| GM | Владелец контракта и Host |
| --- | --- |
| Точное совпадение id, валидация binding, plan, типовое отображение в Assembly, правила в Standard | Выбор major, график перехода, адаптеры, сроки deprecation, conformance-тесты поведения, grants на провайдинг id, инвентарь и удаление |

**Изменения в GM** (одна транзакция, minor 0.3.0 для Core и Assembly):

- **ADR (следующий номер).** «capabilityId is the sole contract identity». Заменяет раздел «Exact compatibility only» в ADR-0005,
  положения ADR-0004 о token (:62-69, :164) и пункт ADR-0009:77-79. Переносит roadmap:898-934 в Standard.
  Строку `familyVersion` из `current-contract.md:302` удалить.
- **Core.** Затрагиваются wire types, `document-shape`, `document-snapshot`, `binding-record`, `plan-output`, union диагностик
  и self-composition декларации. `schemaVersion` у декларации и plan становится 2, у профиля остаётся 1. Причина: по эксперименту (c)
  устаревшее поле молча проходит `defineModule`, а литерал `1` упадёт уже на typecheck, и старый JSON получит `schema.unsupported-version`.
- **Диагностика.** Убрать `binding.compatibility-mismatch`, его случай покрывает `binding.capability-missing`. Нужен каталог
  generation 3: 32 кода, из них 31 эмитируемый.
- **Plan и digest.** Все digest один раз изменятся. Запись `gm-plan:v1` не меняется, потому что это версия протокола хеширования.
  Идентичность контракта остаётся в digest через `capabilityId`.
- **Assembly.** `CapabilityContract<Value>`, в `ValidDeclaration` больше нет условия compatibility; `snapshot` и `prepare` упрощаются.
- **Потребители.** AR (два файла), TEST Host и self-composition. В migration guide три шага: удалить `compatibility`, поднять
  `schemaVersion`, по желанию переименовать id в `…/v1`. По `AGENTS.md` в той же поставке обновить Standard, профили потребителей
  и rejecting-тесты.
- **Пакетирование.** Объединить с другими breaking-изменениями wire из этого foundation review в одно поколение. Если такого поколения
  не будет в ближайшие 1–2 месяца, делать отдельно, пока потребителей не больше трёх.

## 5. Что сейчас, что позже, какие seam оставить

**Сейчас, без релиза.** Правила 1–5 в Standard и ADR. Это сразу останавливает практику общих token, и удаление поля потом
станет механическим. Сразу после этого идёт транзакция из раздела 4.

**Безопасно отложить:**

| Что | Триггер, при котором вернуться |
| --- | --- |
| `revision`/`minRevision` (вариант 3) | Первый provider опубликованного контракта, который загружается в runtime без typecheck Host, или реальный инцидент |
| SemVer-диапазоны | Вероятно, никогда: асимметрия OSGi, ADR-0005:124 |
| Conversion-слой | В Core никогда: адаптер является модулем |
| Несколько реализаций одного `moduleId` в профиле | Отдельная тема (экземпляры), для эволюции контрактов не нужна |
| Метаданные deprecation в wire, предупреждения | Когда инструменту инвентаря понадобится что-то сверх `@deprecated` |
| Межрепозиторный инвентарь consumers | Когда опубликованный контракт потребляет больше одного репозитория Host |

**Seam, которые нужны сейчас.** Именно они гарантируют, что отсрочка не потребует переписывания:

- S1. Записи `provides`/`slots` остаются объектами, а не строками. Тогда опциональные поля добавляются аддитивно.
- S2. Закрытая схема, fail-closed на неизвестные поля и `schemaVersion` уже есть.
- S3. Правило на будущее: метаданные совместимости опциональны; отсутствие означает точное совпадение; при отсутствии
  их нет и в plan. Так digest старых plan не меняются.
- S4. Обёртка `CapabilityContract<Value>` сохраняется: второй параметр с default позже не сломает карты Host.
- S5. Core никогда не разбирает `/v<N>` и не выводит родство версий из строк.
- S6. В `bindings` plan остаётся `capabilityId`, это источник для инвентаря.

## 6. Риски

- **Governance.** Самая большая цена: successor-поколение (schema, catalog, contract, snapshots, ledger). Код дешёвый, доказательства нет.
  Снижается объединением с другими изменениями.
- **Шум версий.** Команды могут поднимать id и для локальных контрактов. Против этого работает правило 2.
- **Смена семантики при том же id.** Её не ловит никакая схема версий. Нужны conformance-тесты владельца контракта.
- **Потеря подсказки.** Явного «version mismatch» больше нет, будет `capability-missing`. Host может перечислить id, которые объявил provider.
- **Цена откладывания.** Каждая новая декларация увеличивает объём миграции, а практика общих token распространяется.
- **Заявленный seam ADR-0005.** Удаляется слот `family`, зарезервированный ADR-0005. Если оценка неверна, возврат делается
  опциональным полем (S3) и переписывания не требует.
- **Не проверено:** объём регенерируемых qualification-артефактов. Известно только, что `familyVersion` есть в 94 файлах.
