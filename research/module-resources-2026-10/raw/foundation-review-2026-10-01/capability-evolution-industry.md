# Эволюция capability-контрактов: индустриальный синтез

Дата: 2026-10-01. База: get-modular `9c722ce`, agent-runtime `origin/main` `b0bcb265`. Статус: предложение,
не ADR.

## 1. Текущее состояние GM (проверенные факты)

- Есть одно семейство совместимости. И provider, и slot несут одинаковую
  `{family:"exact", familyVersion:1, token}` (`packages/core/src/features/authoring/wire-types.ts:9-29`). Схема
  допускает только эти литералы (`input-admission/document-shape.ts:52-54`). Проверка сравнивает только равенство
  `token` (`composition-semantics/binding-record.ts:56-59`). Расширение возможно лишь через новое семейство
  по ADR (ADR-0005:28-44).
- В декларации может быть один entry на `capabilityId` (`declaration-census.ts:72-78`). В профиле — одна
  реализация на `moduleId` (`profile-census.ts:47-51`).
- В каждый binding плана записывается требование slot (`semantic-analysis.ts:64`, `plan-output/factory.ts:16-26`),
  поэтому оно входит в digest. В деталях `binding.compatibility-mismatch` захардкожены литералы exact/1
  (`authoring/diagnostic-types.ts:105-115`).
- Assembly: `CapabilityContract<Value, Token>` (`packages/assembly/src/features/construction/types.ts:3-6`), точное
  сравнение на уровне типов (`types.ts:33-39`). Runtime-снапшот отвергает всё, кроме exact (`snapshot.ts:64-68`).
- Рецепт миграции описан 2026-09-04 (`docs/architecture/mvp-implementation-roadmap.md:898-943`). При breaking-изменении
  заводится новый `capabilityId` с новым token, provider может отдавать оба. Namespace-гранты выдаёт Host. Пункт
  заметки 2026-09-04 «путь только через второй moduleId, не описан» **устарел**. Остальное подтверждается:
  любое, даже аддитивное, изменение в пределах одного id требует flag day.
- Потребители. В agent-runtime один token `agent-runtime/setup-v1` покрывает 8 capabilities
  (`runtime-setup-assembly.ts:34-44`), а `agent-runtime/ordinary-v1` — 16 (`ordinary-runtime-assembly.ts:7-8`).
  В modularity-host-TEST token совпадает с id плюс `/v1` (`src/fixtures/graph.ts:8-13`). Значит, token на практике
  означает либо «версию группы», либо дубль id. С TS-типом значения его ничто не связывает.
- Wire-форма `familyVersion` встречается в 94 файлах вне `dist*`.

**Вывод.** Внутри одной TS-программы совместимость реально проверяет TS-тип. Token нужен только между раздельно
собранными артефактами (репозитории, плагины), но именно там он не отличает «добавили метод» от «сломали контракт».

## 2. Сравнение с индустрией

| Система | Правило | Документированная цена или ошибка | Что берём |
| --- | --- | --- | --- |
| OSGi semver | Consumer `[2.1,3)`, provider `[2.1,2.2)`: «floor of the version used for compilation and the ceiling of the next minor part» ([importer](https://docs.osgi.org/whitepaper/semantic-versioning/060-importer-policy.html), [versions](https://docs.osgi.org/whitepaper/semantic-versioning/040-semantic-versions.html)) | Диапазоны требуют резолвера | Асимметрия provider/consumer; нижняя граница = версия, с которой компилировали |
| Go modules | «If an old package and a new package have the same import path, the new package must be backwards compatible» ([vgo-import](https://research.swtch.com/vgo-import)); MVS: «a list of minimum versions» ([vgo-mvs](https://research.swtch.com/vgo-mvs)) | При диапазонах с конфликтами «The version selection problem is NP-complete» ([version-sat](https://research.swtch.com/version-sat)) | Major-линия = идентичность, внутри неё только минимум |
| npm peerDependencies | Semver-диапазоны пакетов; начиная с npm v7 peers ставятся автоматически ([docs](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#peerdependencies)) | «conflicting requirement may cause an error» | Диапазон пакета отвечает за дистрибуцию, а не за контракт (уже записано в ADR-0004:164-165) |
| Rust/Cargo | «Major: adding a non-defaulted trait item … will break any implementors» ([semver](https://doc.rust-lang.org/cargo/reference/semver.html)) | Несовместимые версии живут рядом, и «types … considered different … even if they have the same name» ([resolver](https://doc.rust-lang.org/cargo/reference/resolver.html)); нужен [semver-trick](https://github.com/dtolnay/semver-trick) | Добавление в интерфейс ломает реализаторов; номинальные типы из двух копий несовместимы |
| JPMS | «It is not necessary to support more than one version of a module within a single configuration» ([reqs](https://openjdk.org/projects/jigsaw/spec/reqs/)) | Выбор версий отдан build-инструментам | Компоновщик проверяет, а не выбирает |
| Webpack Module Federation | Для singleton выбирается highest; без `strictVersion` выдаётся warning, со `strictVersion` — runtime error ([docs](https://webpack.js.org/plugins/module-federation-plugin/)) | Несовместимость всплывает в runtime и мягко | Проверка до первого factory, fail closed |
| Kubernetes | Rule #1: «API elements may only be removed by incrementing the version of the API group»; одновременно served несколько версий, conversion через webhook ([policy](https://kubernetes.io/docs/reference/using-api/deprecation-policy/), [CRD](https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definition-versioning/)) | Конвертеры и storage version требуют своей инфраструктуры | Линии сосуществуют; инвентарь использования (`apiserver_requested_deprecated_apis`); у нас конвертер — обычный модуль |
| Protobuf / AIP-185 | Major указывается в пакете; «must not expose minor or patch version numbers» ([AIP-185](https://google.aip.dev/185)); «Don't re-use a tag number» ([dos-donts](https://protobuf.dev/programming-guides/dos-donts/)) | — | Major в id; удалённые id и ревизии не переиспользуются |
| GraphQL | «strong opinion on avoiding versioning» ([schema design](https://graphql.org/learn/schema-design/)); `@deprecated` | Добавление значения enum: «may break existing clients» — Dangerous ([inspector](https://github.com/graphql-hive/graphql-inspector/blob/master/packages/core/src/diff/changes/enum.ts)) | Новый вариант в union результата ломает consumer |
| VS Code | Один host-wide `engines.vscode` ([manifest](https://code.visualstudio.com/api/references/extension-manifest)); proposed API «should not be used in published extensions» ([proposed](https://code.visualstudio.com/api/advanced-topics/using-proposed-api)) | Общий диапазон хоста слишком груб (тот же урок, что OpenClaw `pluginApi`, `reference/get-modular-openclaw-20260912/research/lessons-and-antipatterns.md:169-181`) | Нестабильный контракт получает отдельный id, а не ревизию |
| Backstage | `createApiRef({ id: 'plugin.example.work' })` и паттерн `plugin.<plugin-id>.*` «to make ownership explicit» ([utility APIs](https://backstage.io/docs/frontend-system/utility-apis/creating)); deprecation держится минимум один mainline release ([policy](https://backstage.io/docs/overview/versioning-policy)) | — | Префикс id обозначает владельца; срок deprecation — политика Host |

Эксперимент на tsc 7.0.2 (scratchpad `capevo`). Интерфейс ревизии 2 из одной копии контракта присваивается
интерфейсу ревизии 1 из другой копии. Класс с `#secret` из двух копий не совместим: ошибка TS2322; то же
описано в [TS#26559](https://github.com/microsoft/TypeScript/issues/26559). Проверки «revision provider = R» и
«minimum ≤ R» на типах выражаются короткими условными типами.

## 3. Три варианта

### A. Оставить exact, ввести дисциплину и типизированную ссылку

Wire не меняется. Любое изменение, в том числе аддитивное, заводит новый `capabilityId`, а token делается
равным id. Добавляется helper `capability<V>()(id)`, связывающий id, token и тип.

- Минусы: каждое добавление метода — это новая линия, provider перечисляет все старые id. Легаси копится,
  а это прямо противоречит цели владельца.
- Надёжность 7, уверенность 7, сложность 2. LOC: src ~50, tests ~60, docs ~150. Core не меняется.

### B. Линия плюс минимальная ревизия (рекомендую)

```ts
// Core wire, schemaVersion: 2. capabilityId обозначает major-линию и не парсится.
type ProvidedCompatibility = { family: "revision"; familyVersion: 1; revision: number };
type SlotCompatibility     = { family: "revision"; familyVersion: 1; minimum: number };
// Совместимо ⇔ capabilityId совпадает и provider.revision >= slot.minimum (верхних границ нет).
// plan.bindings[i].compatibility = требование slot; детали mismatch: { minimum, revision }.

// Assembly
type CapabilityContract<V, R extends number> = { readonly value: V; readonly revision: R };
// ValidDeclaration: provides.revision === R и slots.minimum === R
// (сейчас строго — «floor = версия компиляции», как в OSGi и Go; ослабить потом можно без break).
```

- Аддитивное изменение — `revision+1`. Старые consumer'ы работают с новыми provider'ами. Consumer, которому
  нужен новый член, поднимает minimum. Если профиль держит старого provider'а, Core выдаёт mismatch до
  первого factory.
- Breaking-изменение — новый `capabilityId` (рекомендуемая конвенция `…/v2`). Provider либо отдаёт обе
  линии, либо ставится **обычный модуль-адаптер** (slot на v2, provides v1). Отдельный механизм конвертации не нужен.
- Надёжность 9, уверенность 8, сложность 3. LOC: src Core ~60-90 изменённых строк плюс Assembly ~20-30;
  tests ~150-250 новых/изменённых плюс механическое обновление фикстур примерно в 75 файлах; docs ~300.
  Объём successor-векторов квалификации — **не проверено**.

### C. Semver-диапазоны, side-by-side и конвертеры в GM

`version:"1.4.0"`, `range:"^1.2"`, исполняемые `converters`, автоматический выбор «highest satisfying».

- Минусы: нарушает явный профиль и запрет callbacks (ADR-0005, GM-REQ-008), появляется NP-полный выбор,
  проблемы как в MF и Cargo.
- Надёжность 4, уверенность 8 (в том, что вариант неверен), сложность 9. LOC: src 800-1500, tests 1500+, docs 400+.

Подрешение для B: оставить конверт `family`/`familyVersion` — надёжность 8, уверенность 7; сделать поля
плоскими — надёжность 7, уверенность 6. Рекомендую оставить: он уже есть во всех путях и служит задокументированным
seam для будущих семейств.

## 4. Рекомендация: B. Что конкретно меняется

1. **ADR** (следующий свободный номер) «Capability lines and minimum revisions». Он заменяет раздел ADR-0005
   «Exact compatibility only» и уточняет wire из ADR-0004. Явно сохраняются: никаких диапазонов, callbacks и
   package-ranges; адаптеры — обычные модули; один поддерживаемый вариант без параллельного exact.
2. **Core**: семейство `revision` в схеме и снапшоте; сравнение `<` вместо `!==`; `schemaVersion: 2`, чтобы старые
   документы падали с `schema.unsupported-version`; детали `binding.compatibility-mismatch`. **Код диагностики
   прежний**, поэтому новое «поколение» каталога не нужно. Digest всех планов меняется один раз. Префикс
   `gm-plan:v1` можно оставить, потому что `schemaVersion` входит в хешируемый план (`plan-output/factory.ts:36-44`).
3. **Assembly**: `CapabilityContract<V, R>`, проверки в `ValidDeclaration` и в `snapshot.ts`.
4. **Consumer Module Standard**, раздел «Capability contract evolution»:
   - таблица правил:
     - добавить член, который используют consumer'ы → `revision+1`;
     - удалить или переименовать член, изменить тип или семантику, добавить вариант в результат или ошибку →
       новая линия;
     - изменения только внутри реализации → без изменений;
   - не переиспользовать удалённые id и ревизии;
   - у каждой линии один владелец, его namespace в префиксе id;
   - токены на группу capabilities запрещены;
   - значения контрактов только структурные: без `#private`-классов и `unique symbol` на границе между пакетами;
   - deprecation: `/** @deprecated */` на типе ([no-deprecated](https://typescript-eslint.io/rules/no-deprecated/))
     плюс инвентарь Host по `plan.bindings[].capabilityId` — аналог метрики Kubernetes.
5. **Миграция в той же поставке**:
   - agent-runtime: заменить два групповых token на 24 per-capability `revision: 1`;
   - modularity-host-TEST: добавить отклоняющие и положительные кейсы — provider r2 при minimum 1/2, provider r1
     при minimum 2, breaking через модуль-адаптер, старый exact-документ;
   - changelog и migration guide в minor 0.x.

**Владение.** GM владеет wire-семейством, сравнением, диагностикой, записью в плане, векторами, типами и правилами
стандарта. Host владеет списком deprecated id и сроками, инвентарём и удалением, грантами namespace и capability,
staged rollout и откатом через профили, поведенческой conformance, миграцией состояния и admission-фильтрами
плагинов. EF уже умеет ловить изменения поверхности пакета-контракта (`public-api-compatibility`,
`engineering-foundation/docs/architecture/public-api-compatibility.md`).

## 5. Что сейчас, что потом, какие seam оставить

**Сейчас** — пункты 1-5. Единственная действительно дорогая часть — wire, потому что она затрагивает каждую
декларацию, каждый план и все векторы. Поэтому её надо закрыть до роста числа модулей.

**Можно безопасно отложить** (всё аддитивно):
- helper `defineCapability<V>()(id, revision)` с `provide()` и `slot()` — когда появится первый пакет-контракт
  между репозиториями;
- ослабление TS-проверки до `minimum < R`;
- метаданные и предупреждения deprecation в GM — сначала инвентарь Host;
- собственный checker «бампнули ли ревизию» в GM — сначала EF на пакетах-контрактах;
- выбор двух версий одного `moduleId` и типизация handle'ов из раздельных сборок (Phase 7).

**Seam, которые фиксируются сейчас:**
1. Асимметричные формы provider и slot (`revision` и `minimum`).
2. Конверт `family`/`familyVersion`.
3. Непрозрачный `capabilityId`: линии не парсятся, конвенции имён могут меняться без компилятора.
4. Требование записано в каждом binding плана.
5. Injection в Assembly по `capabilityId`, поэтому две линии сосуществуют без изменений.

## 6. Риски

1. **Цена квалификации.** v1-артефакты неизменяемы. Нужно решить, какой объём successor-векторов достаточен,
   иначе повторится «дорогое поколение». Предлагаю записать v1 как историческую линию, как уже сделано для меток V1
   (`current-contract.md:289-303`). Решение за владельцем.
2. **Ревизию не подняли при изменении типа.** Для раздельных сборок это тихий дрейф, так же как с token сегодня.
   Полностью не устраняется; снижается через EF-проверку пакетов-контрактов и review.
3. **Минимум занижен вручную.** Consumer может вызвать член новее заявленного минимума и упасть в runtime со
   старым provider'ом. Строгий TS по умолчанию это закрывает; ручное ослабление должно сопровождаться тестом.
4. **Ревизия доказывает заявленный контракт, а не поведение** (урок P5 OpenClaw). Нужны conformance-кейсы
   владельца.
5. **Разрастание линий и адаптеров**, то есть накопление легаси. Каждому адаптеру нужен владелец и условие
   удаления; gate — инвентарь Host.
6. **Одноразовая смена всех digest и breaking type для `Diagnostic`.** Допустимо в 0.x, но все потребители
   перевыпускают планы.
