# Ресурсы модуля: план реализации, поезд 1 (Core/Assembly 0.3.0 + `@get-modular/resources` 0.1.0)

Дата: 2026-10-01, редакция 3 от 2026-10-02 (после трёх глубоких ревью, ревью гейтов AR и решений
владельца 2026-10-02). Статус: **план поставки**, реализация не начата.
Основания:
- дизайн [`module-resource-scopes-design-2026-10-01.md`](module-resource-scopes-design-2026-10-01.md),
  решения Q1–Q18;
- сводка и решения владельца [`foundation-review-2026-10-01/README.md`](foundation-review-2026-10-01/README.md);
- итоговые разборы динамики `dynamic-modules-final-a.md` и `dynamic-modules-final-b.md`;
- критики `impl-plan-critique-semantics.md`, `impl-plan-critique-integration.md`,
  `impl-plan-critique-coherence.md`;
- глубокие ревью `deep-review-api.md`, `deep-review-scale.md`, `deep-review-implementability.md` и
  ревью гейтов `ar-gates-review.md` (та же папка);
- строки R12–R14 сводки второго раунда критики AR (`opus-critique-round2-20261001/round2-synthesis.md`,
  перепроверены на `origin/main` AR, раздел 10).

Тексты, которые вставляются в репозитории (ADR, Consumer Module Standard, README пакета), даны на
английском, как остальная документация GM. Пояснения вокруг них на русском.

## Изменения после критики

### Редакция 3 (2026-10-02)

Решения владельца 2026-10-02:

- **Builder в поезде 1 (решение 1):** `defineContract`, `declareModule` и `CapabilitiesOf` выходят в Assembly 0.3.0 и порождают текущий wire; решение записывает новый ADR-0032 (раздел 3.3).
- **Владелец builder — Assembly, не Core (1.3):** у Core закрытый список экспортов (ADR-0009) и аудит замыкания M1, а в поезде 1 Core меняет только версию; Assembly уже знает wire и владеет типами capability.
- **Композиция фрагментов (решение 2):** handle инвариантен только по capability, которые использует его декларация; `prepare` требует, чтобы карта знала каждую использованную capability; `ModuleFactory<C, D, I, X>` типизируется картой модуля, а не Host (5.1).
- **Замер типов (решение 2):** на 500 handles фрагменты ~1,0 с (tsc7) и 2,4–2,7 с (TS 5.8.3) против ~0,8 и ~2,85 с у нынешнего способа; на существующей фикстуре GM (1000 тривиальных handles с одной capability) бренд дороже: 2,45 → 3,76 с и 7,1 → 10,2 с; карта как `type` над 500 контрактами даёт 4,4 с и TS2589 на 5.8.3, поэтому большие карты объявляются как `interface` (5.4).
- **Гейты AR (решение 3):** код гейтов не удаляется; C0 и L0 выводятся из триггеров и `check` с комментарием «почему и когда вернуть», добавлены macOS-job и общая проверка пина CMS; AR-0 стоит +120…200/−20…60 строк вместо +500…900 (10.1).
- **Упаковка и ошибки (решение 4):** GM в модульных пакетах только в `peerDependencies` с диапазоном одного 0.x minor, одна копия GM на Host, ошибки различаются по `code` вида `<пакет>.<область>.<причина>`, правило в CMS (1.4, 9.1).

API resources (deep-review-api, проверено прототипом v3):

- **Контекст cleanup — `{ escalate }`** (`CleanupContext`), контекст setup — `{ signal }` (`SetupContext`); `ResourceContext` убран, `if (signal.aborted) return` в cleanup больше не компилируется (H1).
- **Имена обязательны** в `setup`, `use`, `child` и `createScope`; авто-имён `#n` и имени корня `"scope"` нет (H2, impl M5).
- **Опция `ScopeOptions.signal` убрана** (H4); механизм остался приватным для `scoped()`.
- **Ошибки:** `ScopeClosedError` (`resources.scope.closed`), `CloseIncompleteError` (`resources.close.incomplete`, вместо `ScopeCloseError`), `InvalidArgumentError` (`resources.argument.invalid`, `resources.scoped.invalid-run-scope`); у всех публичные конструкторы (M1, impl M6). Схема выровнена с будущим `@get-modular/observation`.
- **`scoped()` вырезает только `scope`** и передаёт остальные поля контекста (M2, тест A5).
- **`?: T | undefined`** во всех необязательных полях опций, включая `RunOptions` Assembly (M3).
- **`Debt` — размеченное объединение, `CloseReport.settled`** отличает снимок abandon от итога (LOW).
- **Явный список экспорта** вместо `export type *` (impl M6).

Assembly и ADR:

- **Модель input handle:** вход только в `inputs`, никогда в `factories` и `roots`; прототип исправлен под ADR-0031, все отказы покрыты тестом A3 (impl C1, см. «не согласен»).
- **ADR-0031:** абзац о GM-REQ-012 (impl M8), явные `undefined` в `RunOptions`, ссылка на ADR-0032.
- **ADR-0030:** пустая строка перед списком «Admission evidence» (impl H1); markdownlint и cspell с конфигом GM на извлечённых текстах трёх ADR дают 0 замечаний (раздел 0).
- **Lint прототипа:** `runAttempt` в лимите complexity 20 (вынесены `admitInputs` и `invokeFactory`), лишнее приведение в `bind.ts` убрано, классы находок impl M1 исправлены (раздел 0).

CMS:

- **Host-шаблон:** `preparation` сужается один раз, дальше `const { prepared } = preparation` (impl H2); компилируется на 7.0.2 и 5.8.3, старый текст даёт TS2339 (проверено).
- **9.2 полный:** все нормы CMS, которые 0.3.0 делает ложными, плюс `packages/assembly/README.md`, `examples/basic-host.mjs` и quickstart (impl H3).
- **Новые правила:** RPC-safe контракты для изолированных плагинов (scale M3); упаковка модулей и коды ошибок; карты как `interface`; внешний scope для зависимостей повтора, например журнала (AR R12); доменная последовательность внутри одного cleanup (R12); варианты тенантов (scale M2).

Релиз (impl H4, H5):

- **Команды:** `pnpm assembly:build` перед `pnpm exec agent-teams-foundation public-api-promote-release --consumer . --json`; в dry-run `GITHUB_EVENT_NAME=pull_request` и `git fetch origin main`; dry-run повторяется перед REL; запись `approvedBreakingChanges` удаляется в REL явно; перед `release:version` сверка registry по ADR-0027.
- **R-1 без цикла:** R-1a (один `pnpm pack`, хеши, запись намерения) → TEST-1, черновая ветка AR, proof на Node 26.10 → ревью владельца → R-1b (загрузка ровно retained `.tgz`, `latest` только после всех пакетов).
- **Черновая ветка AR:** критерии записаны (8.9).

Реализуемость (impl M2–M4, M7):

- **Точные значения допуска:** строки `resources:*`, `CHECK_COMMANDS`, `ROOT_SCRIPT_COMMANDS`, `REQUIRED_TESTS`, entrypoints, builtins (`node:fs/promises`, `node:module`), правила класса `public`, `governance.test.mjs:296`, расширение FMS путём ADR (8.1, 8.4).
- **Проверка T:** `bindLegacy` вместо Assembly 0.2.0 в workspace; `typescript-minimum` в `resources:typecheck`.
- **Литералы GM-3:** добавлены `tests/feature-module-standard-profile.test.mjs:899`, `tests/assembly/packed-consumer.mjs:9`, `tests/node-runtime-compatibility.test.mjs:47`; файлы AT и AS названы.
- **Прототипы** лежат в `plans/foundation-review-2026-10-01/prototypes/` (`impl-plan-v2/`, `impl-plan-v3/` с `SHA256SUMS`); ссылки на scratchpad убраны.

Поезд 2 (scale H1–H3, M1; api C1, M4):

- **Раздел 13 «ADR поезда 2 до кода»:** типы по ревизиям, ревизия slot'а фиксируется при сборке потребителя (новая находка, 13.2), декодер N-1, решение «входы в плане Core не помечаем», судьба `owner.authority`, коды ревизий, наборы тестов по окну ревизий.
- **`checkNamespaces` уходит из Core и поезда 2 в `@get-modular/conformance`:** объект опций, находки в форме `Diagnostic`, коды `conformance.namespace.*`.

AR (ar-gates-review; R12–R14 второго раунда критики AR):

- **Журнал ordinary host во внешнем scope:** закрывается только после `complete` внутреннего scope владельцев; это ответ на разницу «стоп на первой ошибке» и «продолжать» (R12). Доменная последовательность settlement остаётся внутри одного cleanup.
- **Darwin — legacy contained path** (ADR-0016 proposed): вторым scope рекомендую per-grant scope PA на живом ordinary-пути; Darwin — после решения ADR-0016 (вопрос 16.1).
- **Заморозка GM (R13):** `sdk-growth.mjs:151` resources не задевает, пока пакет вне `public-api-compatibility` (ADR-0030); `ownership-checkpoint.test.mjs:148` обобщается в GM-1. Если dry-run найдёт ещё один замороженный assert, его выключают комментарием с пометкой, а не правят.
- **`./host` (R14):** ни один шаг плана не добавляет экспортов `@agent-teams/embedded-runtime`; FMS checker AR и ADR-0017 не затронуты (проверено).
- **AR-1b:** декларации AR переходят на builder отдельным PR после R-1b, до поезда 2.

С чем не согласен (редакция 3, с доказательствами):

- **impl C1 «оставить модель прототипа»** (вход и в `factories`, и в `inputs`): выбрал модель ADR. Один handle в двух местах и «фабрика, которую никогда не вызывают» путают авторов; цена — около 12 строк в `prepare.ts` и правка нормы CMS 216-219, которая переписывается в любом случае. Прототип v3 приведён к ADR (A3).
- **api C1: `compatibleFrom` в `defineContract` уже в поезде 1:** не принял. Core 0.3.0 сравнивает точный token, поле ничего бы не делало. Поезд 2 добавит его необязательным со значением по умолчанию `revision`, дескрипторы не переписываются.
- **Решение 4 про `core.*`:** ожидаемые сбои Core — не брошенные ошибки, а диагностики с замороженными кодами каталога (`binding.compatibility-mismatch` и т.п.). Переименование означало бы новое поколение диагностики и поломку полных карт перевода у каждого Host (ADR-0009). Сейчас Core бросает только внутренние нарушения инвариантов (`new Error("Missing internal …")`), это не контракт. Префикс `core.<область>.<причина>` применяю к будущим брошенным ошибкам контракта Core (вопрос 16.2).
- **scale C1 без проверки неизвестных capability:** добавил явную проверку `KnownCapabilities`. Weak-type проверка TS ловит handle без общих ключей с картой, но пропускает смешанный (проверено в `builder-fixture.ts`).
- **R13 «900–1100 строк разморозки GM»:** при ADR-0030 (resources вне `public-api-compatibility`) `sdk-growth` сравнивает только Core и Assembly, а `ownership-checkpoint` обобщается в GM-1. Цена около +40/−15 строк; оценка критика верна только при зачислении resources в SDK-growth.
- **`foundation-review-2026-10-01/README.md` не правил** (вне разрешённых файлов): его устаревшие формулировки (`run({ owner })`, «одним поколением Core 0.3.0») перекрываются этим планом и дизайном.

### Редакция 2 (2026-10-01)

Семантика `resources`:

- **abandon только для вызывающего** (решение владельца 3, семантика C1): полёт закрытия больше не
  останавливается; ушедший получает снимок отчёта, родитель и терпеливые вызывающие ждут дальше,
  вне порядка ничего не стартует. Q3 уточнён решением Q13.
- **Реестр детей вместо слушателя на каждого ребёнка** (final-a §3.5, final-b §2, семантика A4):
  создание и отцепление ребёнка O(1); добавлен тест на 50 тыс. детей.
- **Отмена run доходит до setup** (семантика H1): `scoped()` связывает сигнал run с setup модуля
  только до завершения фабрики. С фиксом критики (`child({ signal })` в шаблоне Host) не согласен:
  постоянная связь остановила бы получение ресурсов у живого экземпляра, когда закончится
  сигнал запроса (тест A4 в прототипе v2).
- **Модуль не видит scope run** (семантика H2, связность H1): `scoped()` передаёт фабрике ровно
  `{ signal, resources }`; экспортирован тип `ModuleContext`. Непрозрачный токен вместо `Resources`
  не принят: лишнее публичное понятие против дыры, которая требует намеренного приведения типа в
  доверенном коде (раздел 5.3).
- **Поле run называется `scope`, а не `owner`** (решение владельца 1, связность H4): у деклараций
  уже есть `owner { authority, path }`.
- **escalate относится к текущему полёту** (семантика M1, L6): слушатели снимаются при завершении
  полёта, повтор после эскалации снова мягкий.
- **Долги в отдельном списке, отцепленные дети как надгробия с уплотнением** (семантика M2): два
  закрытия 20 тыс. падающих записей 71–119 мс вместо 8,4 с.
- **`use()` после запроса закрытия отказывает и не берёт значение на учёт** (семантика M3): одно
  правило вместо трёх, как `DisposableStack.use` в TC39. Меняет инвариант 4 дизайна; подтверждение
  владельца в разделе 15.
- **escalate проходит через простаивающих детей к самозакрывающимся внукам** (семантика M4);
  для abandon обход дерева больше не нужен.
- **Мелкие правки:** опции `close()` проверяются до изменения состояния (L2); pending-запись
  удаляется в том же callback, что и `push` (L3); правило 3 CMS уточнено (L4); результат синхронного
  `Symbol.dispose` не ждём, как в TC39 (L7).
- **`child({ order: "concurrent" })`** (решение владельца 4) для массового закрытия независимых
  сессий; по умолчанию LIFO по одной.

Тесты:

- **Тест памяти:** подпроцесс с `--expose-gc` и `WeakRef` (семантика H3). Найдено: если родитель не
  остаётся достижимым после GC, проба проходит даже на мутанте. Проверено: v2 даёт 0 живых,
  мутант 2000.
- **Ожидание теста 11 исправлено** (семантика L1): `failed`, код `assembly.run.factory-rejected`,
  поле `cancellation`.
- **Утверждения о прототипе исправлены** (семантика L5): старый прототип давал 17/19.
- **Набор тестов пересобран вокруг рискованных инвариантов.** Для каждого теста названа мутация,
  которую он ловит. Все 16 мутаций прототипа v2 пойманы.
- **Добавлены обязательные тесты:** «один prepared, два параллельных run» и «параллельные run не
  смешивают входы».

Интеграция и релиз:

- **`docs/architecture/system-boundary.md` не правится** (интеграция C1): файл закреплён по байтам.
  Разделение «механизм у GM, власть у Host» записано в ADR-0030 и CMS.
- **Ссылки на ADR исправлены** (интеграция H3):
  - GM ADR-0006 убран из `related`, EF ADR-0006 упоминается по имени;
  - утверждение «EF ADR-0011 наследует 0006» снято: поиск по ADR-0011 его не находит.
- **Изменение Assembly вынесено в отдельный ADR-0031** (связность C2). ADR-0030 и ADR-0031
  принимаются одним docs-PR.
- **Core поднимается до 0.3.0 вместе с Assembly** (решение владельца 2): так требует правило точной
  пары (`assembly-admission.mjs:90`). В допуске появилась ветка 0.3.0, тест `:559-562` переписан.
- **Тест `ownership-checkpoint` сверяет замороженные данные из git:**
  - версии пакетов из коммита base;
  - байты ADR-0028 из коммита C0;
  - префикс реестра ADR.
  Иначе `precheck` упадёт (интеграция C3.2).
- **Гейт EF v1 для публичного API** (интеграция C3.3): changeset `minor` для Core и Assembly и
  запись `approvedBreakingChanges` со ссылкой на ADR-0031.
- **Релизы идут через changesets и release-PR, как 0.2.0** (решение владельца 2, интеграция C3.4).
  Новые пакеты стартуют с `0.0.0` и minor-changeset, ручные версии убраны.
- **`sdk-growth`** (решение А):
  - версия baseline сверяется с манифестом вместо литерала `"0.2.0"`;
  - пин CMS сверяется с замороженными байтами через `git show`.
- **Допуск leaf-пакетов обобщается узко** (интеграция M3). Каталога `examples/` нет (интеграция M2):
  рецепты адаптеров переехали в README, проверка группы процессов в TEST (только POSIX).
- **`AGENTS.md` GM не трогаем** (интеграция M4).
- **Первая публикация нового имени** (интеграция M5): после загрузки читаем фактические dist-tags,
  trusted publishing и provenance не заявляем.
- **AR:**
  - добавлен AR-0 для гейтов;
  - объём AR примерно удвоен (интеграция H1);
  - противоречие «обновление AR обязательно / не входит» снято.
- **TEST:** исправлены runner, `.gitignore` и изоляция (интеграция H2).
- **Node:** прототип прогнан на Node 24.18.0 и 26.9.0 (интеграция M1); Node 26.10+ локально
  недоступен.
- **CMS:** одна ревизия на поезд и одна миграция пинов у потребителей (связность M5).

Дизайн приведён в соответствие точечными правками:
- API: `ScopeOptions`, `ModuleContext`, `scoped`, пример модуля;
- инварианты 4, 6, 10, 11;
- раздел 4 (обёртка и код Host);
- правило автора 10;
- сноска в разделе 11;
- Q11–Q13 в разделе 13;
- раздел 14 (`system-boundary.md` не правится).

Остальные разделы дизайна не переписывались.

С чем не согласен (с доказательствами):

- **«Убрать Assembly из поставки» (интеграция C2):** отменено решением владельца 2, поезд 1
  включает Assembly 0.3.0.
- **`implementationId` в контексте и `scoped(factory)` (связность M2):** не принято. Владелец
  закрепил `scoped(name, factory)` и закрытый `FactoryContext`. `Debt.path` остаётся массивом,
  склеивать его можно только для показа.
- **Фикс семантики C1 через счётчик ждущих** (полёт останавливается, когда ушёл последний ждущий):
  заменён более сильным правилом владельца «никогда не останавливается».
- **Связность M3/M4 (`checkNamespaces`, кто объявляет `compatibleFrom`):** это поезд 2, вне этого
  плана.
- **Связность H3 (трек hooks):** вне двух редактируемых файлов, записано как follow-up.

---

## 0. Исходные данные и что проверено

| Объект | Идентичность | Замечание |
|---|---|---|
| get-modular | `9c722ceff4ede307d06d7a4b63fdebe615f54c53` | в рабочей копии **незакоммиченная** правка `AGENTS.md`. Ветки реализации только от `origin/main` в отдельном worktree; чужую правку не трогать |
| CMS (`docs/architecture/common-assembly.md`) | SHA-256 `33b41d5b…1e1fbd` | пин текущих байтов: `tests/ownership-checkpoint.test.mjs:130-132`, `architecture/checks/sdk-growth.mjs:23` (+ `architecture/sdk-growth/evidence/*.json`) |
| `docs/architecture/system-boundary.md` | SHA-256 `794e2950…57cedb8` | закреплён в `architecture/authority/accepted-authorities.json`; digest реестра зашит в `governance.mjs:72-73` и якорем в принятом ADR-0007. **Не правим** |
| Правило точной пары | `assembly-admission.mjs:90`, тест `tests/assembly-admission.test.mjs:559-562` | версия Core обязана совпадать с Assembly; сейчас тест отвергает и `["0.3.0","0.3.0"]` |
| Литералы `0.2.0` | `production-artifacts.mjs:247-249`, `sdk-growth.mjs:181`, `tests/assembly-admission.test.mjs:119,228,434,544-562`, `tests/feature-module-standard-profile.test.mjs:893-894,899` | меняются в GM-3a |
| Экспорт Core | ADR-0009 (закрытый список значений и типов), аудит M1 `packages/core/tests/qualification-support/support/m1-javascript-closure.mjs:49` | новый экспорт Core требует ADR-преемника и новой evidence; поэтому builder не в Core (1.3) |
| Экспорт значений Assembly | `tests/assembly/packed-consumer.mjs:9`, `tests/node-runtime-compatibility.test.mjs:47` | сейчас ровно `AssemblyBindingError`, `assemblyFor`; GM-3b добавляет `declareModule`, `defineContract` |
| Гейт публичного API EF | `architecture/foundation/public-api-compatibility.yaml` | `approvedBreakingChanges: []` у Core и Assembly; resources не зачисляется (ADR-0030) |
| Заморозка SDK-growth GM | `sdk-growth.mjs:42-60` (`PACKAGES`, `RELEASES`), `:151` (`v1 package scope`), `:181` (`0.2.0`) | resources не задевает, пока он вне `public-api-compatibility`; `:181` правится в GM-3a |
| Checkpoint ADR-0028 | base `ac49bb3` (Core и Assembly `0.2.0`, ADR-0028 ещё нет); коммит C0 `610e595`, байты ADR-0028 `6edd5c84…` | `checkpoint.schema.json` фиксирует `packages` как `const`; `architecture/contracts/**` release-owned; `:148` (`packageRoots`) обобщается в GM-1 |
| agent-runtime | `origin/main` = `b0bcb265d1466da3272078f9dfdb7c6784624283` | Core/Assembly `0.1.0`; пин CMS `9c722ce`/`33b41d5`; обязательные проверки `main`: `check`, `docs-protocol / docs-protocol-check`, `postgres-durability` (прочитано через `gh api …/rules/branches/main`) |
| modularity-host-TEST | `fcc10b2501420aacf9f904e976a4d230d3f02e68` | пин CMS `33b41d5…` |
| npm | `@get-modular/resources` → `E404` (2026-10-01); `@get-modular/core@0.2.0` `sha512-npn2dAR5…`, `@get-modular/assembly@0.2.0` `sha512-xZTgfMUz…` | registry-байты 0.2.0 лежат в прототипе v3 (`vendor/`) |
| Extension Foundation | `8907b6d` | ADR-0006, строки 100–102: «Only product-built and fully trusted code may run in-process… Third-party code requires a runtime the host can terminate.» |

### Прототипы

Оба прототипа лежат в `plans/foundation-review-2026-10-01/prototypes/` (долговременное место):

- **`impl-plan-v2/`** — редакция 2, без изменений: 20/20 тестов, 16 мутаций.
- **`impl-plan-v3/`** — эта редакция. Запуск: `./setup.sh` (распаковывает `vendor/*.tgz` и собирает `asm/`
  компилятором GM), затем команды ниже. `SHA256SUMS` фиксирует байты исходников.
  - `res/` — resources v3, ~600 строк вместе с типами и ошибками (стиль с фигурными скобками под lint GM);
  - `asm/` — кандидат Assembly 0.3.0: scope и входы (модель ADR-0031), builder, capability-scoped
    handles, `ModuleFactory`. Разница с `packages/assembly/src` на `9c722ce`: +245/−71 в шести файлах и
    новый `contract.ts` (49 строк);
  - `vendor/` — registry-архивы Core и Assembly 0.2.0 (SHA-256 `dd4cb159…` и `86b26f86…`);
  - тесты `semantics.test.ts` (R1–R16), `assembly.test.ts` (A1–A6), `gc-probe.ts`, `scale.ts`;
  - типы `types-fixture.ts`, `builder-fixture.ts`, `host-template.ts`; `check-expect-errors.py` снимает
    каждую `@ts-expect-error` и проверяет ошибку на охраняемой строке;
  - `mutate.py` (19 мутаций), `type-scale/` (`generate.mjs`, `measure.sh`), `docs/` (извлечённые ADR и
    результаты markdownlint и cspell).

Проверено 2026-10-02:

| Проверка | Результат |
|---|---|
| `node --test semantics.test.ts assembly.test.ts` | 22/22 на Node 26.9.0 и 24.18.0 |
| `node --expose-gc gc-probe.ts ./res/index.ts` | `alive: 0` на обеих версиях Node |
| `python3 mutate.py` | 19 из 19 мутаций пойманы (Node 26.9.0), список в 7.4 |
| `tsc7 -p tsconfig.types.json`; то же через `typescript-minimum` 5.8.3 | 0 ошибок на 7.0.2 и 5.8.3 |
| `python3 check-expect-errors.py` | 27 директив × 2 компилятора: каждая даёт ошибку на охраняемой строке по задуманной причине |
| `tsconfig.host.json` (шаблон CMS) | компилируется на 7.0.2 и 5.8.3; текст редакции 2 даёт TS2339 |
| нынешние `tests/assembly/types.ts`, `types-positive.ts`, `mixed-graph.ts` GM против кандидата v3 (копия в scratchpad, `paths` на `asm/dist`) | 0 ошибок на 7.0.2 и 5.8.3: все 17 `@ts-expect-error` по-прежнему срабатывают; отказы «Host mappings are invariant» и «different exact identities» — по задуманной причине (контракт используемой capability) |
| `node scale.ts ./res/index.ts` | 50 тыс. детей: создание 107 мс, закрытие 187 мс; два закрытия 20 тыс. падающих записей 99 мс; `concurrent` 50 тыс. 307 мс (как v2) |
| `type-scale/measure.sh 500` и `1000` | таблица в 5.4 |
| `oxlint` с пресетами GM (`type-aware`, `maintainability`) | классы находок impl M1 исправлены, complexity в лимите. Остались 16 находок, которые tsgolint даёт вне репозитория: он не видит `Disposable` и `toReversed` и не применяет `noUncheckedIndexedAccess`. Перепроверить `pnpm lint:typed` в GM-4 |
| markdownlint-cli2 и cspell с конфигами GM на текстах ADR-0030/0031/0032 | 0 замечаний (`docs/`) |

**Не проверено локально:**
- Node 26.10+: есть только 26.9.0, а он вне `SUPPORTED_NODE_RANGE`. Покрывает job
  `node-26-compatibility` в CI и hosted worker для R-1a;
- Windows;
- `pnpm lint:typed` внутри GM.

Локальный `pnpm check` GM требует Node 24 (`TOOLING_NODE_RANGE = ">=24.18.0 <25"`).

---

## 1. Решение и разделение ответственности

### 1.1 Поезд 1 (этот план)

1. **Core 0.3.0**: меняется только номер версии (правило точной пары ADR-0027, `assembly-admission.mjs:90`).
2. **Assembly 0.3.0**:
   - ADR-0031: `run({ signal, scope, inputs })` и `bindInput`. Prepare один раз, run много раз, у
     каждого run свой scope и объявленные входы. `FactoryContext` закрыт: `{ signal, scope }`;
   - ADR-0032: builder (`defineContract`, `declareModule`, `CapabilitiesOf`), handles, инвариантные
     только по используемым capability, и `ModuleFactory`.
3. **`@get-modular/resources` 0.1.0** (ADR-0030): дерево scope'ов и `scoped(name, factory)`.
4. **`@get-modular/conformance` 0.1.0**: отдельный план и ADR-0033 (уточняет направление
   зависимостей ADR-0003); `isolate`, `smoke`, `runContractSuite`, `guardHandles`; позже minor с
   `checkNamespaces`. Если не готов, выходит следующим minor.
5. **Одна ревизия CMS на поезд** и одна миграция пинов у TEST и AR.

**Поезд 2** (Core/Assembly 0.4.0): раздел 13. `resources` поезд 2 не затрагивает.

### 1.2 Почему builder сейчас

Сегодня каждая декларация руками пишет `kind`, `schemaVersion` и `compatibility` в каждом `provides` и
slot, а Host руками пишет карту `C` (в AR `runtime-setup-assembly.ts` 16 литералов `compatibility` и
8 строк карты на 7 модулей с одним token). Поезд 2 меняет wire. Если авторы перейдут на builder в
поезде 1, поезд 2 меняет только тело `contract.ts` в Assembly, а Core 0.4 читает схему N-1:
сотни деклараций не переписываются.

### 1.3 Кто владеет builder

| Вариант | Надёжность | Уверенность |
|---|---|---|
| **(Рекомендую) Assembly**, файл `features/construction/contract.ts`. Assembly уже знает текущий wire (`snapshot.ts` сверяет `family`/`familyVersion`) и владеет `CapabilityContract` и картой `C`; `CapabilitiesOf` и `ModuleFactory` всё равно живут здесь. Новых runtime-зависимостей нет ни у Core, ни у Assembly. Core остаётся инертным компилятором и в поезде 1 меняет только версию. Минус: два способа написать декларацию (`defineModule` в Core для wire-уровня и тестов, `declareModule` в Assembly для авторов) — CMS требует второй для модульных пакетов | 8/10 | 8/10 |
| Core рядом с `defineModule`. Знание wire в одном пакете с декодером N-1, но закрытый список экспортов ADR-0009 и аудит M1 (`m1-javascript-closure.mjs:49`, `javascript-closure.test.mjs:23`) требуют ADR-преемника и новой evidence на каждое изменение хелпера; Core перестаёт быть «только версия» | 6/10 | 7/10 |
| Отдельный пакет `@get-modular/authoring`. Чистая граница, но ещё один участник точной пары версий и ещё один допуск | 5/10 | 7/10 |

### 1.4 Модульные пакеты, копии и коды ошибок (решение 4)

- **Зависимости.** Модульный пакет указывает пакеты GM только в `peerDependencies` с диапазоном одного
  0.x minor: `"@get-modular/core": "^0.3.0"`, `"@get-modular/assembly": "^0.3.0"`,
  `"@get-modular/resources": "^0.1.0"` (для 0.x `^` покрывает ровно один minor). Для своих тестов —
  точные версии в `devDependencies`. Расширять диапазон (`>=0.3.0 <0.5.0`) можно, только если changeset
  нового minor GM говорит `Authoring surface changed: no` (строка в тексте каждого changeset GM).
- **Одна копия.** Host устанавливает по одной копии каждого пакета GM. Peer-зависимости разрешаются в
  копию Host; конфликт диапазонов падает при установке, а не во время работы. Вторая копия ломает бренд
  `scoped()`, метаданные handles Assembly и сравнение классов.
- **Ошибки по `code`.** Никогда не `instanceof` и не текст сообщения. Схема `<пакет>.<область>.<причина>`:
  Assembly `assembly.bind.*`, `assembly.prepare.*`, `assembly.run.*` (уже так); resources
  `resources.scope.closed`, `resources.close.incomplete`, `resources.argument.invalid`,
  `resources.scoped.invalid-run-scope`; conformance `conformance.<область>.<причина>`. Ожидаемые сбои
  Core — диагностики с замороженными кодами каталога (`binding.*`, `schema.*`, …) в
  `Diagnostic.code`; будущая брошенная ошибка Core получит `core.<область>.<причина>` (вопрос 16.2).
- **Матрица каналов** (`reportError`, `CloseReport`, исходы run, события observation) согласуется с
  будущим `@get-modular/observation` отдельно; в этот поезд не входит.

### 1.5 Кто за что отвечает (Q5)

| Сторона | Отвечает за | Не делает |
|---|---|---|
| Модуль | **как** освободить свои ресурсы: `setup`/`cleanup`, `use`, `child`; cleanup бросает ошибку, только если ресурс ещё может удерживаться | не закрывает свой scope и одолженное, не видит родителя и scope run |
| Host | **когда**: момент закрытия, дедлайн (ref'нутый таймер), escalate, abandon, повтор, health, изоляция недоверенного кода, передача `control`, внешние scope для зависимостей повтора | не пишет cleanup чужих модулей |
| Get Modular | **механизм**: LIFO, ожидание начатых setup, single-flight, продолжение после ошибки, сигналы по дереву, `CloseReport`, опция `order`; builder авторов | без таймеров, глобалов, AsyncLocalStorage, ретраев, kill/worker, политики |

### 1.6 Решения владельца, которые план исполняет

| Решение | Суть |
|---|---|
| Q1 | продолжать после ошибки cleanup |
| Q2 | повторный `close()` после завершения повторяет `failed` |
| Q3, уточнён Q13 | abandon касается только вызывающего; закрытие идёт дальше по порядку |
| Q4 | сразу пакет GM |
| Q5 | модель ответственности выше |
| Q6 | публикация на npm с 0.1.0 |
| Q7 | ADR-0030 принят: допуск пакета, замена направления C0/K1 из ADR-0028, механизм у GM, власть у Host |
| Q8 | версии 0.x; breaking change выходит minor-релизом с гайдом миграции |
| Q9 | health-контракт отложен |
| Q10 | недоверенный код только через изоляцию у Host; правило пишем сейчас |
| Q11 | динамика через экземпляры: Assembly 0.3.0 `scope` + `inputs` + `bindInput`, `child({ order: "concurrent" })` |
| Q12 | два поезда релизов, выпуск через changesets и release-PR |
| Q13 | abandon только для вызывающего |
| Q14 | `use()` после начала закрытия бросает, значение остаётся у автора (ответ 15.1 от 2026-10-02) |
| Q15 | builder в поезде 1; поезд 2 меняет только его внутренности, Core читает схему N-1 |
| Q16 | handles типизируются только используемыми capability; `ModuleFactory` без глобального `C`; замер на ~500 handles |
| Q17 | гейты AR не удалять: выключать из триггеров и `check` с комментарием, аддитивные замены допустимы |
| Q18 | peer-зависимости с диапазоном одного 0.x minor, одна копия GM, ошибки по префиксному `code`, правило в CMS |
| А | пин CMS в `sdk-growth` сверяется с замороженными байтами через `git show` |
| Б | дренаж работы остаётся шагом Host до закрытия scope |
| В | async `dispose` в Darwin принят |
| Г | решён через Q11 |

### 1.7 Недоверенный код (Q10)

Scope даёт кооперативную очистку доверенного кода в одном процессе. `complete: true` значит «все
зарегистрированные cleanup вернулись без ошибки», а не «ресурс физически освобождён». Сторонний код
через `scoped()` не собирается (EF ADR-0006). Что пакет обязан не запрещать:
1. изолированный плагин занимает одну запись `setup`/`cleanup` в scope Host. Рецепт в README
   убивает **группу** процессов по `escalate`, проверка в TEST (раздел 11);
2. `Debt.path` и `Debt.state` сериализуемы, `cause` непрозрачен;
3. `Resources` не входит ни в какой SPI плагинов; контракты, которые могут стать SPI плагина,
   RPC-safe (правило CMS);
4. в пакете нет kill/worker и PluginManager. `worker.terminate()`, `node:vm` и permission model не
   считаются границей безопасности.

### 1.8 Shared-first оценка (workspace `AGENTS.md`)

- **Владелец и зависимости.** Владелец — GM architecture. Потребители → `resources` → ничего.
  Assembly не импортирует `resources` и наоборот; связка структурная, через `scoped()`. Builder живёт в
  Assembly, Core не меняется.
- **Цена и что она даёт.** Два новых публичных контракта (`resources`, run-контракт Assembly) и
  поверхность авторов (builder) против 4–6 расходящихся самописных стеков в AR, пересборки графа на
  каждый экземпляр и ручного wire в каждой декларации каждого поколения.
- **Объём:** раздел 12.

---

## 2. ADR-0030 (принят владельцем, текст исправлен по критике)

### 2.1 Создание

ADR-0030, ADR-0031 и ADR-0032 создаются в одном docs-PR (GM-2) и ссылаются друг на друга.

```sh
pnpm docs:new --type adr --id ADR-0030 \
  --title "Admit the module resource scope package" --owner architecture \
  --summary "Admits @get-modular/resources as an optional public cleanup-scope mechanism, supersedes the ADR-0028 ownership direction and keeps cleanup authority with the Host." \
  --dry-run
# проверить путь и digest плана, затем --apply --expect sha256:<digest>; то же для ADR-0031 и ADR-0032
```

`docs:new` создаёт файл со `status: proposed`. В том же PR, до merge:
- заменить тело на текст ниже;
- выставить `status: accepted`;
- добавить `approved_by`, `accepted_at`, `supersedes` (только ADR-0030), `related`.

EF требует двусторонней supersession (правило `supersedes-mismatch`), поэтому ADR-0028 получает
`superseded_by` в том же PR.

### 2.2 Текст

```markdown
---
id: ADR-0030
type: adr
status: accepted
owner: architecture
approved_by: product-owner
accepted_at: 2026-10-01
summary: Admits @get-modular/resources as an optional public cleanup-scope mechanism, supersedes the ADR-0028 ownership direction and keeps cleanup authority with the Host.
supersedes:
  - ADR-0028
related:
  - ADR-0003
  - ADR-0009
  - ADR-0012
  - ADR-0019
  - ADR-0023
  - ADR-0026
  - ADR-0029
  - ADR-0031
  - ADR-0032
---

# ADR-0030: Admit the module resource scope package

## Context

Modules constructed through Assembly acquire connections, subscriptions,
processes, servers and files. Get Modular gives them no shared way to release
what they acquired, so every Host writes its own cleanup stack. Agent Runtime
alone has several with different failure policies: one stops at the first
cleanup error, another continues and never retries, a creation-recovery chain
composes closures by hand, and a disposal facade can start a second cleanup
flight before the first settles. The concern is the same; the semantics differ
by accident.

ADR-0028 reserved `@get-modular/ownership` for a synchronous, callback-free
ticket contract gated on S3 -> G1 -> K1. The owner closed S3 as not delivered
on 2026-09-25 and K1 never started. A callback-free contract cannot be awaited,
nested or ordered, so every Host would still poll, order and retry by itself.

Mature systems split this concern by knowledge: a module knows how to release
its own resources; a host or supervisor decides when, how long to wait and
whether to retry (OTP supervisors, Kubernetes grace periods, .NET and Nest
containers, Effect and TC39 scopes). Get Modular serves different Hosts, so it
fits the library scope model rather than a framework that owns shutdown.

## Decision

### Package admission

Admit one optional runtime package, `@get-modular/resources` at
`packages/resources`, as an additive exception to the ADR-0003 topology, like
ADR-0023 and ADR-0029. The package owns substantive behavior: ordered,
cooperative release of resources registered by trusted module code.

- It has zero runtime dependencies and imports neither Core, Assembly, the
  lifecycle kernel, Node built-ins nor product or tooling packages. Core,
  Assembly and the lifecycle kernel do not import it.
- It exposes one root-only ESM export (ADR-0012) and one current unversioned
  API (ADR-0009). Its engines equal the supported Node range of the other
  packages.
- It owns no timers, clocks, AsyncLocalStorage, retries or process control,
  and it starts no work that a close request did not ask for. `Resources` is a
  registration facet, not a resolver; factories still receive only their
  closed dependency record.

### Contract

The root exports the values `createScope`, `scoped`, `ScopeClosedError`,
`CloseIncompleteError` and `InvalidArgumentError`, and the types `Scope`,
`Resources`, `ScopeControl`, `ScopeOptions`, `CloseOptions`, `CloseReport`,
`Debt`, `SetupSpec`, `SetupContext`, `CleanupContext`, `ModuleContext` and
`ResourcesErrorCode`. The package README and its rejecting tests own the exact
invariants. In summary:

- Two facets. `Resources` registers (`setup`, `use`, `child`, `signal`);
  `ScopeControl` closes (`close`, `Symbol.asyncDispose`). A module receives only
  `Resources`. Closing authority is a reference held by the creator.
- Every scope and every entry has an explicit, non-empty name, so a debt path
  never depends on registration order.
- Registration starts when `setup` is called. A value takes its release slot
  when its setup fulfils; a child takes its slot when it is created. After a
  close is requested nothing new is accepted: `setup` rejects without calling
  its callback, `use` throws and leaves the value with the caller, `child`
  throws.
- `setup` receives `{ signal }`, which stops acquisition. `cleanup` receives
  `{ escalate }`, which asks it to release faster; it never permits skipping
  the release.
- A close request reaches the whole subtree synchronously. Release waits for
  started setups, then runs one cleanup at a time in reverse order, or all
  entries together in a scope created with `order: "concurrent"` for
  independent peers. A failed cleanup is recorded as debt with its original
  cause, and release continues.
- Each scope has one close flight. Repeated `close()` calls join it; a call
  after it completed with debts retries the failed entries.
- `escalate` asks the cleanups of the current close flight of the subtree to
  release faster, including descendants that are closing on their own.
  `abandon` only ends the waiting of the caller that passed it: that caller
  receives the current report, the flight continues in order, and every other
  waiter, including the parent, keeps waiting. Nothing starts out of order and
  nothing is reported as released before its cleanup returned.
- `CloseReport` is `{ complete, settled, debts }`. `complete` means every
  registered cleanup callback returned without throwing; it is not proof of
  physical release. `settled` is false only in the snapshot that an abandoning
  caller receives while the close still runs. `Debt.path` and `Debt.state` are
  plain data; `cause` stays opaque and exists only on failed debts.
- Every error the package throws or rejects with carries a stable `code` of
  the form `resources.<area>.<reason>`. Consumers compare codes, never classes.
- No scope option lets a signal stop acquisition while the scope stays open: a
  scope ends only through `close()` of its control.
- `scoped(name, factory)` opens one child scope per factory call,
  synchronously, under the run scope that Assembly delivers as
  `FactoryContext.scope` (ADR-0031). It fails with
  `resources.scoped.invalid-run-scope` before the factory body when the run
  scope is not the `Resources` of a scope from the same package copy. The
  factory receives every other field of the Assembly context together with
  `resources`; the run scope is never forwarded. Run cancellation aborts the
  module's setups until its factory settles; the module's lifetime is not tied
  to the run signal afterwards.
- Children never subscribe to their parent's signals; attaching and detaching
  a child costs amortized constant time.

### Mechanism and authority

Get Modular provides the mechanism. A module writes how to release its own
resources. The Host decides when a scope closes, how long to wait, when to
escalate or abandon, whether to retry and how to report health. Assembly still
performs no disposal or rollback.

`docs/architecture/system-boundary.md` stays unchanged; its accepted bytes are
pinned by the authority ledger. Its statements remain true. Get Modular
decides no product lifecycle and holds no cleanup authority. This package only
runs the cleanups that trusted module code registered, and only when the
holder of a scope's control closes it. This decision and the Consumer Module
Standard record that split.

### Trust

A scope is cooperative cleanup of trusted in-process code. The package cannot
revoke escaped handles or force a callback to settle. Third-party or untrusted
code is never assembled through `scoped()`. As Extension Foundation ADR-0006
requires, such code runs in a runtime the Host can terminate. That runtime is
one `setup`/`cleanup` entry in a Host scope; the README process recipe
terminates the whole process group on escalation. `Resources` is not part of
any plugin SPI. The package adds no kill, worker or plugin-manager facility;
`worker.terminate()`, `node:vm` and the Node permission model are not security
boundaries.

### Supersession

This decision supersedes ADR-0028 in full. Its C0 pseudo-contract, checkpoint
and schema stay frozen as historical evidence. The conditional
`@get-modular/ownership` identity, the K1 package and the S3 -> G1 -> K1 order
are withdrawn, and `packages/ownership` stays rejected. Get Modular has one
cleanup contract.

ADR-0029 remains in force. Kernel custody leases and resource scopes are
complementary: a dynamic Host retains kernel custody before it creates a child
scope and releases it only after the child's report is complete. The scope is
the only cleanup mechanism; kernel custody stays admission bookkeeping.

### Publication and versioning

The package is public from 0.1.0. Versions come from Changesets in a release
pull request and uploads follow the bounded release operator of ADR-0019, as
for Core and Assembly; no unattended publisher is created. Pre-1.0 breaking
changes ship as minor releases with a CHANGELOG entry and a migration note,
without compatibility aliases (ADR-0009). Version 1.0.0 needs a separate
decision. While G1 is on hold, the package is not enrolled in
`package.public-api-compatibility` or G1 SDK growth. Module packages declare
Get Modular packages as peer dependencies, so a Host loads one copy of this
package; the Consumer Module Standard states the packaging rules.

### Admission evidence

Admission extends the existing leaf-package checks instead of copying them:

- exact identity, root and public manifest shape;
- zero dependencies, root-only exports, no install scripts;
- no forbidden imports, including type-only edges;
- governed development output;
- non-no-op build, typecheck, test and pack commands in the fast and full gates;
- Foundation v3 `packageRoots` and the FMS layout.

Rejecting tests cover the invariants above and a subprocess memory probe for
detached children. Typed fixtures cover TypeScript 7.0.2 and 5.8.3 with
NodeNext and Bundler resolution. A packed-root test installs the exact archive,
and the Node 26 job installs it on the supported Node 26 line.

### Non-goals

Release order derived from the composition graph, reference counting or shared
ownership, early per-entry release or `move`, durable crash recovery, hot
replacement, retry policies, a dependency-loss health contract, lifecycle
hooks, plugin managers, process or worker control and development-mode
registration stacks.

## Consequences

- Hosts share one ordered cleanup mechanism. Partial construction is released
  in reverse order without changes to Core.
- Debts are reported with stable paths instead of being logged and lost.
- Cleanup remains a promise of trusted code; untrusted code still needs Host
  isolation.
- A Host deadline never reorders release. A cleanup that never settles blocks
  the rest of its scope and the remaining entries of its ancestors until the
  process exits; process exit releases descriptors and sockets, not child
  processes or temporary files.
- Release continues past a failed entry, so an entry that a failed cleanup
  needs again on retry belongs to an outer scope that the Host closes only
  after the inner report is complete.
- A cleanup that must not run twice guards itself, because a Host may retry.
- A value passed to `use()` after close started stays with the caller, who
  must release it; asynchronous acquisition belongs in `setup`.
- Dependencies hidden outside declared slots can still break the order; the
  Consumer Module Standard and review address that, not the library.
- A new public package adds release and admission maintenance.

## Rejected alternatives

- Keep cleanup Host-only: every consumer keeps a diverging stack with its own
  failure policy, which is the observed state.
- Framework-managed shutdown in the style of NestJS or Spring: conflicts with
  Hosts that own their process lifecycle.
- Continue ADR-0028 ownership tickets: callback-free bookkeeping cannot order,
  await or nest cleanup.
- Put scopes into Core or Assembly: Core stays an inert compiler and Assembly
  stays a construction leaf without disposal.
- Capture the parent scope when factories are bound: one prepared assembly
  run twice puts both runs under the first scope, and closing one run releases
  the other's resources.
- Look up the parent scope through a map keyed by the run signal: an ambient
  registry that depends on signal identity.
- Let `abandon` stop the shared close: a waiting parent then releases entries
  below a child whose cleanup still runs (compare Effect #8484 and #8512).
- Release a value passed to `use()` after close started: it either runs
  concurrently with the active cleanup or escapes the parent's report.
- A scope option `signal` that stops acquisition without closing: callers read
  it as cancellation and leak until an explicit close.
- Optional names with generated labels: debt paths would change with unrelated
  edits, and Hosts alert on those paths.
- One context type with `signal` for setup and cleanup: a cleanup written as
  `if (signal.aborted) return` would report a held resource as released.
```

### 2.3 Сопутствующие правки в GM-2

1. `docs/decisions/0028-…md`: во frontmatter только `status: superseded` и
   `superseded_by: [ADR-0030]`. EF допускает у принятого ADR правку только этих полей (правило
   `accepted-decision-mutated`). Отпечаток EF их не учитывает (`architecture-decision.js:19-25`).
2. `docs/decisions/README.md`: ADR-0030, ADR-0031 и ADR-0032 перечислить в «Accepted decisions»,
   ADR-0028 перенести в «Superseded decisions» (сейчас там «None.»).
3. `architecture/decisions/accepted-decisions.json`: три записи через
   `pnpm exec agent-teams-foundation architecture-decisions-promote-baseline --consumer . --json`
   (синтаксис проверен в `cli-arguments.js:76`).
4. `tests/ownership-checkpoint.test.mjs`:
   - **`:34`:** ожидается `status === "superseded"` и `superseded_by` deepEqual `["ADR-0030"]`.
   - **`:41-53`:** вместо точного хвоста «после base ровно ADR-0028, ADR-0029» проверяется, что
     префикс base не изменился, а записи ADR-0028/0029 присутствуют байт-в-байт. Будущий ADR тогда
     не требует правки теста.
   - **`:103`:** `decisionDigest` сравнивается с
     `git show 610e595fe1f2e893d01ee44ceecd6349b5a3c8ce:<decisionPath>` (`6edd5c84…`, проверено),
     а не с рабочей копией: смена статуса меняет байты файла.
   - **`:133-135`:** `checkpoint.evidence.packages` сравнивается с версиями из
     `git show <evidence.base>:packages/<name>/package.json` (в `ac49bb3` обе `0.2.0`, проверено).
   - Цикл «байты ADR из base не изменились» не трогаем: ADR-0028 в base `ac49bb3` нет (проверено).
   - `architecture/contracts/ownership/**` не трогаем: это release-owned история.
5. `architecture/checks/leaf-packages.mjs`: запись `resources` с `fileDigest` и `immutableDigest`
   ADR-0030, корень пакета пока отсутствует (как L0 у ADR-0029).
6. `system-boundary.md` **не меняется.** GM-REQ-012 не нарушается (абзац в ADR-0031).

---

## 3. ADR Assembly 0.3.0: ADR-0031 и ADR-0032

### 3.1 Текст ADR-0031

```markdown
---
id: ADR-0031
type: adr
status: accepted
owner: architecture
approved_by: product-owner
accepted_at: 2026-10-01
summary: Admits the Core and Assembly 0.3.0 pair in which every run receives an opaque scope and declared inputs, so one prepared assembly serves many isolated instances.
related:
  - ADR-0009
  - ADR-0023
  - ADR-0026
  - ADR-0027
  - ADR-0029
  - ADR-0030
  - ADR-0032
---

# ADR-0031: Pass a per-run scope and declared inputs to Assembly runs

## Context

Assembly 0.2.0 factories receive `{ signal }`, and repeated or concurrent runs
of one prepared assembly are isolated attempts. Two needs are not met.

1. A wrapper that opens cleanup scopes for factories must know under which
   parent scope the current run lives. Capturing that parent when factories are
   bound puts every run under the first one: closing session 1 releases session
   2, and a third run fails because its scope is closing (reproduced).
2. Per-instance data and parent ports can only reach factories through
   closures captured at bind time, so concurrent runs of one prepared assembly
   see each other's data (reproduced). Hosts therefore compile, bind and prepare
   per instance; prepare measured 14 to 78 times the cost of a run.

On 2026-10-01 the owner chose instances over live graph mutation.

## Decision

- Admit the public pair Core 0.3.0 and Assembly 0.3.0 under the exact-pair rule
  of ADR-0027. Core changes only its version.
- `FactoryContext` is closed: `{ signal, scope }`. `scope` is the value passed
  to `run()`. Assembly never reads, awaits, freezes or disposes it; when absent
  it is `undefined`. Assembly does not import `@get-modular/resources`; its
  `scoped()` wrapper reads `scope` and never forwards it to a module.
- `run({ signal, scope, inputs })`; every option may be omitted or passed as
  `undefined`. `bindInput(declaration)` binds a declaration without slots whose
  capability record each run supplies instead of a factory.
- `prepare({ composition, factories, roots, inputs })`. Input handles appear
  only in `inputs`, each under exactly one alias; factory handles appear only
  in `factories`. Together they cover every selection exactly once. An input
  handle is never a root. Violations are `assembly.prepare.inputs`; an
  uncovered selection stays `assembly.prepare.handles`.
- A run passes `inputs[alias]` as a plain data record with exactly the
  declaration's capability ids. Assembly checks every input before the first
  factory: a violation is `assembly.run.invalid-inputs` in phase `inputs`, with
  no factory called and no accessor invoked. Inputs are borrowed and never
  appear in `created`. Core sees an input as an ordinary selected module without
  slots, so parent ports passed as inputs are bound and checked like any other
  provider.
- No live graph mutation, rebind, hot replacement or code unloading. Replacing
  an instance means running a new one, switching the Host's pointer and closing
  the old one.
- The field is named `scope` because declarations already carry
  `owner: { authority, path }`, a navigation label without authority.
- This keeps GM-REQ-012. A factory still receives only its closed dependency
  record; `scope` is a per-run value that Assembly delivers but never reads,
  only `scoped()` reads it, and it removes `scope` before a module sees its
  context. No factory receives a resolver, a container or a registry.
- The change is additive for factories and breaking for code that constructs
  `FactoryContext` or `RunOptions` itself or implements `PreparedAssembly`. It
  ships as a minor release with a migration note.

## Consequences

- One prepared assembly serves many isolated runs; the per-instance cost is a
  run.
- Input lifetime is not checked by types. An input must outlive every instance
  that received it; the Consumer Module Standard states the rule.
- An input shaped as a registry with `get(key)` recreates a service locator; the
  Consumer Module Standard forbids such bundle inputs.
- A run without `scope` fails only in wrapped factories, at run time, before
  their bodies run.
- Core plans do not mark inputs; Assembly bindings are the only place that
  knows them.

## Rejected alternatives

- An opaque `context: X` for every factory: invisible dependencies that grow
  into a service bag.
- Input handles listed both in `factories` and in `inputs`: one handle in two
  places, and a factory entry that is never called.
- The field name `owner`: it collides with the declaration field.
- `implementationId` in the context to name scopes automatically: it widens the
  closed context; names stay explicit in `scoped(name, factory)`.
- Prepare per instance as the only path: 14 to 78 times the cost of a run and
  closure races.
- A live graph with `replace(module)`: lifecycle policy would move into Get
  Modular, against the system boundary and ADR-0029.
```

### 3.2 Почему `scope`

| Вариант имени | Надёжность | Уверенность |
|---|---|---|
| **(Рекомендую) `scope`.** Совпадает со словарём `resources` (`Scope`, `createScope`). Поля `scope` нет ни в декларациях, ни в API; в CMS слово встречается только в общем смысле («Host scope», «adoption scope»), и новый раздел CMS это разводит. Внутренний `unique symbol scope` в `types.ts` Assembly в редакции 3 переименован в `uses` вместе с новым брендом | 8/10 | 8/10 |
| `owner`. Конфликтует с `owner { authority, path }` деклараций | 6/10 | 9/10 |
| `parentScope`. Точнее по смыслу, но длиннее | 7/10 | 7/10 |

### 3.3 Текст ADR-0032

```markdown
---
id: ADR-0032
type: adr
status: accepted
owner: architecture
approved_by: product-owner
accepted_at: 2026-10-02
summary: Gives Assembly 0.3.0 an authoring builder that emits the current wire generation and makes each handle depend only on the capabilities its declaration uses.
related:
  - ADR-0009
  - ADR-0023
  - ADR-0026
  - ADR-0031
---

# ADR-0032: Give Assembly an authoring builder and capability-scoped handles

## Context

Module authors write the wire format by hand. Every declaration spells `kind`,
`schemaVersion` and a `compatibility` record in each provided capability and
slot, and every Host writes its capability map by hand. Agent Runtime has 16
such records and 8 map rows for 7 modules, with one token for eight contracts.
The next wire generation would rewrite every declaration and every map in
every repository.

A handle is invariant over the whole capability map of the Assembly instance
that bound it. A team cannot bind its modules with its own contracts and hand
the handles to a Host whose map is larger, so features import the Host's map
and composition cannot be split between teams or repositories. Modules that
export a factory for their own tests copy the expanded factory type.

## Decision

- Assembly owns the authoring builder. Core keeps its exhaustive export set and
  stays an inert compiler. Assembly already reads the current wire generation
  and owns the capability map types. Neither package gains a runtime
  dependency.
- `defineContract<Value>()({ id, revision })` creates one descriptor per
  capability, owned by the contract owner. `provide()` and
  `slot(slotId, cardinality)` produce declaration entries. In the current wire
  generation a revision is encoded as the exact token `<id>/r<revision>`, so
  any revision mismatch fails in Core as an incompatible binding.
- `declareModule(spec)` supplies `kind` and `schemaVersion`. It refuses a spec
  that carries either field, and its type accepts only entries produced by a
  descriptor. The next wire generation changes the bodies of these functions,
  not the declarations that call them.
- `CapabilitiesOf<typeof A | typeof B>` derives a capability map from
  descriptors. It serves a module, a team fragment or a Host.
- A handle is invariant only in the capabilities its declaration uses.
  `prepare` accepts a handle bound under any map when each capability it uses
  has the identical value and compatibility type in the preparing map, and it
  requires every capability used by any factory or input handle to be part of
  that map.
- `ModuleFactory<C, D, Instance, Context>` names the factory type of a module
  package, where `C` is the module's own contract map.

### Precedence

This decision supersedes ADR-0009 only in its sentence that declaration
authors or product-owned generation tooling supply the current
`schemaVersion` literal: `declareModule` supplies it for module authors. Core's
four authoring helpers keep their pass-through semantics and Core's export set
is unchanged. Compatibility tokens stay product-owned identities: the contract
owner chooses the id and the revision, and the builder only spells them.

## Consequences

- Declarations and maps do not change when the wire generation changes; the
  next generation ships a new builder body and a Core decoder for the previous
  schema.
- Teams and repositories bind fragments independently; the Host prepares them
  with a map derived from the contracts they use.
- Two ways to write a declaration exist: Core's `defineModule` for wire-level
  tooling and tests, and `declareModule` for module packages. The Consumer
  Module Standard requires the second.
- A capability map over hundreds of contracts is named as an interface; a type
  alias over them multiplies type-check time.
- Compatibility windows between revisions arrive with the next wire
  generation; until then a revision mismatch is always rejected.

## Rejected alternatives

- The builder in Core: every helper change would need a successor to the
  exhaustive export set of ADR-0009 and new packed declaration evidence, and
  Core would stop being version-only in this release.
- A separate authoring package: one more member of the exact version pair and
  one more admission for a few functions.
- Fragments generic over the Host map: TypeScript defers the declaration check
  and the dependency record collapses (reproduced).
- Relying on structural checks for unknown capabilities: a handle that uses one
  known and one unknown capability passes them (reproduced).
- A `compatibleFrom` field before Core can enforce it: a field without effect
  misleads contract owners.
```

### 3.4 Зачем три ADR, а не два

ADR-0031 допускает пару 0.3.0 (её аутентифицирует ветка 0.3.0 в `assembly-admission.mjs`), ADR-0032
решает поверхность авторов. Поезд 2 заменит ADR-0032 (тело builder, окна ревизий), не трогая
ADR-0031. Частичная замена ADR-0009 делается прозой «Precedence», как сам ADR-0009 частично заменяет
ADR-0004/0006/0007; поэтому `supersedes` во frontmatter ADR-0032 нет и ADR-0009 не меняет статус.

---

## 4. Пакет `@get-modular/resources`

### 4.1 Каталог (FMS-профиль и шаблон lifecycle-kernel `24d6557`)

```text
packages/resources/
  package.json   README.md   CHANGELOG.md (пишет changesets)   LICENSE (Apache-2.0, копия)
  tsconfig.json  tsconfig.types.json  tsconfig.types.bundler.json
  src/
    index.ts                      курируемый root-экспорт (явный список)
    composition/root.ts           шов: createScope, scoped
    features/scope/
      types.ts                    публичные типы (контракт)
      errors.ts                   ScopeClosedError, CloseIncompleteError, InvalidArgumentError (контракт)
      scope.ts                    ScopeNode, createScope, scoped
  tests/
    semantic-suite.mjs            R1–R16 против любого объекта API
    scope.test.mjs                suite на ../dist + S1 + запуск G1
    gc-probe.mjs                  G1, запускается подпроцессом с --expose-gc
    assembly-scope.test.mjs       A1–A6 на настоящих Core и Assembly
    types.ts                      T (NodeNext и Bundler)
    packed-root.test.mjs          pack → install → suite + типы
```

`scoped` живёт в `scope.ts`: ему нужен доступ к приватным полям узла. Каталога `examples/` нет:
допуск отвергает всё вне `src/` и `tests/` (`lifecycle-candidate-admission.mjs:159-161`), а
`production-artifacts.mjs:84` считает любой `.mjs` артефактом. Рецепты адаптеров (группа процессов,
`http.Server`, `Writable`) живут в README.

### 4.2 Публичный API (root-only, ESM)

Значения: `createScope`, `scoped`, `ScopeClosedError`, `CloseIncompleteError`, `InvalidArgumentError`.
Типы: `Scope`, `Resources`, `ScopeControl`, `ScopeOptions`, `CloseOptions`, `CloseReport`, `Debt`,
`SetupSpec`, `SetupContext`, `CleanupContext`, `ModuleContext`, `ResourcesErrorCode`.
`src/index.ts` перечисляет их явно (без `export type *`), как kernel.

```ts
export type ResourcesErrorCode =
  | "resources.scope.closed" | "resources.close.incomplete"
  | "resources.argument.invalid" | "resources.scoped.invalid-run-scope";
export type CloseOptions = {
  readonly escalate?: AbortSignal | undefined; // "release faster" for the current close of the subtree
  readonly abandon?: AbortSignal | undefined;  // "this caller stops waiting"; never means released
};
export type Debt =
  | { readonly path: readonly string[]; readonly state: "failed"; readonly cause: unknown }
  | { readonly path: readonly string[]; readonly state: "pending" | "not-run" };
export type CloseReport = { readonly complete: boolean; readonly settled: boolean; readonly debts: readonly Debt[] };
export type SetupContext = { readonly signal: AbortSignal };     // stop acquiring
export type CleanupContext = { readonly escalate: AbortSignal }; // release faster; never "skip"
export type SetupSpec<T> = {
  readonly name: string;
  readonly setup: (context: SetupContext) => T | PromiseLike<T>;
  readonly cleanup: (value: T, context: CleanupContext) => void | PromiseLike<void>;
};
export type ScopeOptions = { readonly name: string; readonly order?: "reverse" | "concurrent" | undefined };
export interface Resources {
  readonly signal: AbortSignal;
  setup<T>(spec: SetupSpec<T>): Promise<T>;
  use<T extends AsyncDisposable | Disposable>(value: T, name: string): T;
  child(options: ScopeOptions): Scope;
}
export interface ScopeControl extends AsyncDisposable {
  close(options?: CloseOptions): Promise<CloseReport>; // never rejects; invalid options throw synchronously
}
export type Scope = { readonly resources: Resources; readonly control: ScopeControl };
export type ModuleContext = { readonly signal: AbortSignal; readonly resources: Resources };
export declare function createScope(options: ScopeOptions): Scope;
export declare function scoped<Deps, R, X extends { readonly signal: AbortSignal; readonly scope: unknown }>(
  name: string,
  factory: (deps: Deps, context: Omit<X, "scope"> & { readonly resources: Resources }) => R,
): (deps: Deps, context: X) => R;
export declare class ScopeClosedError extends Error {
  readonly code: "resources.scope.closed"; readonly path: readonly string[];
  constructor(path: readonly string[]);
}
export declare class CloseIncompleteError extends AggregateError {
  readonly code: "resources.close.incomplete"; readonly report: CloseReport;
  constructor(report: CloseReport);
}
export declare class InvalidArgumentError extends TypeError {
  readonly code: "resources.argument.invalid" | "resources.scoped.invalid-run-scope";
  constructor(code: "resources.argument.invalid" | "resources.scoped.invalid-run-scope", message: string);
}
```

Отличия от дизайна v1 и редакции 2:
- `scoped` выводит контекст `X` из `bindFactory` и вырезает только `scope`: новое поле
  `FactoryContext` дойдёт до модулей без релиза resources (проверено `bindFuture` в
  `types-fixture.ts`). С Assembly 0.2.0 вызов не компилируется (проверено и на реальном 0.2.0, и на
  `bindLegacy`).
- `child(options)` и `createScope(options)` требуют `name`; у scope нет опции `signal`.
- Правило ADR-0009 соблюдается: идентификаторов на `V` с цифрой нет.

### 4.3 `package.json`

```json
{
  "name": "@get-modular/resources",
  "version": "0.0.0",
  "description": "Ordered cooperative cleanup scopes for module instances; the Host decides when to close.",
  "publishConfig": { "access": "public", "registry": "https://registry.npmjs.org/" },
  "repository": { "type": "git", "url": "git+https://github.com/agent-teams-ai/get-modular.git", "directory": "packages/resources" },
  "license": "Apache-2.0",
  "type": "module",
  "sideEffects": false,
  "engines": { "node": ">=24.18.0 <25 || >=26.10.0 <27" },
  "exports": { ".": { "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }, "default": "./dist/index.js" } },
  "files": ["dist", "LICENSE", "README.md", "CHANGELOG.md"],
  "scripts": {
    "build": "node ../../architecture/tooling/build-leaf-package.mjs resources",
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.types.json && tsc -p tsconfig.types.bundler.json",
    "test": "node --test tests/*.test.mjs",
    "check": "pnpm build && pnpm typecheck && pnpm test"
  }
}
```

**Версия.** `0.0.0` в feature-PR плюс `.changeset/add-resources-package.md` с
`"@get-modular/resources": minor`. Release-PR (`pnpm release:version`) выставит `0.1.0` и CHANGELOG.
Ручная `0.1.0` вместе с changeset дала бы 0.2.0.

**Остальные поля.** `engines` проверяется против `SUPPORTED_NODE_RANGE` (`node-version.mjs:4`);
нет `private` и зависимостей; `Promise.try`, `Symbol.asyncDispose`, `AggregateError`,
`Array.prototype.toReversed` есть в Node 24.18+ и 26.10+.

### 4.4 tsconfig и требования к потребителю

- **`tsconfig.json`:** extends `../../tsconfig.base.json`; `rootDir: src`, `outDir: dist`;
  `lib: ["ES2024", "ESNext.Disposable", "ESNext.Promise", "DOM"]`; `files: ["src/index.ts"]`;
  `isolatedDeclarations` требует явных типов возврата (прототип проходит). Спецификаторы импортов
  `.js` (прототип использует `.ts`, при переносе заменить).
- **`tsconfig.types.json` / `.bundler.json`:** `noEmit`, NodeNext или Bundler, `files: ["tests/types.ts"]`.

| `lib` потребителя | `types` | TS 7.0.2 и 5.8.3 |
|---|---|---|
| `ES2024` | `[]` | нет `AbortSignal`, `AsyncDisposable`, `Disposable` |
| `ES2024, DOM` | `[]` | нет `AsyncDisposable`, `Disposable` |
| `ES2024, ESNext.Disposable` | `[]` | нет `AbortSignal` |
| `ES2024, ESNext.Disposable, DOM` | `[]` | OK |
| `ES2024` | `["node"]` (@types/node 24.19) | OK |

README обязан это сказать. AR и TEST используют `@types/node`.

### 4.5 README пакета (содержание)

- **Пример модуля и шаблон Host** (как в разделе 9).
- **Требования к `lib`** (4.4), одна копия пакета на Host, peer-зависимость в модульных пакетах.
- **Коды ошибок** и правило «сравнивать `code`».
- **Два сигнала:** `setup` получает `{ signal }` (прекрати получать), `cleanup` получает
  `{ escalate }` (освобождай быстрее). Отмену сборки передавать в `run({ signal })`.
- **`abandon` и `escalate`.** abandon не означает released, `settled: false` у снимка; escalate
  относится к текущему полёту.
- **Наблюдаемые детали:** неверный spec, опции или имя бросают `InvalidArgumentError` синхронно
  (это ошибка программы, не исход); `close()` никогда не отклоняется; синхронный throw фабрики внутри
  `scoped()` снимает слушатель сигнала run.
- **Рецепты адаптеров:**
  - процесс: `detached: true`, SIGTERM группе, по `escalate` SIGKILL группе, добить оставшихся
    после выхода лидера; только POSIX;
  - `http.Server`: `close()`, по `escalate` `closeAllConnections()`;
  - `Writable`: `end()` и ожидание `finish`.

---

## 5. Assembly 0.3.0: scope, inputs, builder, capability-scoped handles

### 5.1 API

```ts
// ---- run contract (ADR-0031) ----
export type FactoryContext = { readonly signal: AbortSignal; readonly scope: unknown }; // closed
export type RunOptions<N = {}> = {
  readonly signal?: AbortSignal | undefined; readonly scope?: unknown; readonly inputs?: RunInputs<N> | undefined;
};
export type PreparedAssembly<R, N = {}> = { readonly run: (...options: {} extends N
  ? [options?: RunOptions<N>] : [options: RunOptions<N> & { readonly inputs: RunInputs<N> }]) => Promise<AssemblyOutcome<R>> };
export type AssemblyPrepareInput<C, F extends readonly AnyFactoryHandle<C>[], R extends RootHandles<C>, N extends InputHandles<C> = {}> = {
  readonly composition: SuccessfulComposition;
  readonly factories: F & KnownCapabilities<C, F, N>;
  readonly roots: R;
  readonly inputs?: N | undefined;
};
// Assembly<C>
bindFactory<const D extends ModuleDeclaration, I>(d: D & ValidDeclaration<C, NoInfer<D>>, f: …): FactoryHandle<C, D, I>;
bindInput<const D extends ModuleDeclaration & { readonly slots: readonly [] }>(d: D & ValidDeclaration<C, NoInfer<D>>): InputHandle<C, D>;
prepare<const F extends readonly AnyFactoryHandle<C>[], const R extends RootHandles<C>, const N extends InputHandles<C> = {}>(
  input: AssemblyPrepareInput<C, F, R, N>): Promise<AssemblyPreparationResult<R, N>>;
// codes: "assembly.prepare.inputs"; "assembly.run.invalid-inputs" (phase "inputs"); bindInput with slots -> "assembly.bind.invalid-declaration"

// ---- capability-scoped handles (ADR-0032) ----
declare const uses: unique symbol; declare const input: unique symbol;
type UsedCapability<D> = D["provides"][number]["capabilityId"] | D["slots"][number]["capabilityId"];
export type FactoryHandle<C, D extends ModuleDeclaration = ModuleDeclaration, I = unknown> = {
  readonly [uses]: { readonly [K in UsedCapability<D> & keyof C]: (capability: C[K]) => C[K] };
  readonly [detail]: { readonly declaration: D; readonly instance: I };
};
export type AnyFactoryHandle<C> = {           // what a map C accepts as a factory or root
  readonly [uses]: { readonly [K in keyof C]?: (capability: C[K]) => C[K] };
  readonly [detail]: { readonly declaration: ModuleDeclaration; readonly instance: unknown };
  readonly [input]?: never;                   // an input handle is never a factory or a root
};
export type KnownCapabilities<C, F, N> = /* unknown, or { "capabilities missing from the preparing map": <ids> } */;
export type ModuleFactory<C, D extends ModuleDeclaration, I, X = FactoryContext> =
  (dependencies: FactoryDependencies<C, D>, context: X) => Promise<FactoryProduct<I, FactoryCapabilities<C, D>>>;

// ---- authoring builder (ADR-0032) ----
export declare function defineContract<V>(): <const Id extends string, const Rev extends number>(
  spec: { readonly id: Id; readonly revision: Rev }) => Contract<Id, V, Rev>;
export type Contract<Id extends string, V, Rev extends number> = {
  readonly id: Id; readonly revision: Rev;
  readonly provide: () => ProvidedEntry<Id, Rev>;
  readonly slot: <const S extends string, const K extends Cardinality>(slotId: S, cardinality: K) => SlotEntry<Id, Rev, S, K>;
};
export declare function declareModule<const T extends DeclarationSpec>(spec: T): Declared<T>;
export type CapabilitiesOf<T extends AnyContract> = {
  readonly [Id in T["id"]]: T extends { readonly id: Id; readonly revision: infer Rev extends number; readonly [contractValue]?: infer V }
    ? CapabilityContract<V, `${Id}/r${Rev}`> : never;
};
```

Как устроено:
- **Вход** — декларация без slots; значение — запись capability с ключами `provides`. Ключи
  проверяются до первой фабрики как точные own data keys, getter не вызывается. Вход не попадает в
  `created`: он одолжен.
- **Модель prepare:** factory handles только в `factories`, input handles только в `inputs`; вместе
  покрывают selections ровно один раз. Вход в `factories`, вход как root, не-вход в `inputs`, один
  вход под двумя алиасами → `assembly.prepare.inputs`; непокрытая selection → `assembly.prepare.handles`.
  Типы отвергают вход в `factories` и `roots` заранее (`[input]?: never`).
- **Бренд по используемым capability.** Handle команды, связанный своей картой, принимается Host'ом,
  если каждая общая capability имеет тот же контракт (стареющая ревизия отвергается: «`acme/db/r3` is
  not assignable to `acme/db/r2`»). `KnownCapabilities` отвергает handle, использующий capability,
  которой нет в карте, с читаемым сообщением `Property '"capabilities missing from the preparing
  map"' is missing`.
- **Builder:** `provide()`/`slot()` возвращают замороженные записи с типовым (не runtime) брендом
  `[contractEntry]`, поэтому литерал `compatibility` в `declareModule` не компилируется. Token —
  `<id>/r<revision>` (грамматика portable id Core: сегменты с буквы, `r3` подходит).
  `defineContract` проверяет непустой `id` и положительную целую `revision`, остальное проверяет Core.
  Ошибки builder — `AssemblyBindingError` с `assembly.bind.invalid-declaration` (новых кодов нет).

### 5.2 Реализация (прототип `impl-plan-v3/asm`, разница с `9c722ce`)

| Файл | Изменение |
|---|---|
| `types.ts` (+118/−17) | типы 5.1; символ `scope` переименован в `uses`; бренд через именованный алиас `CapabilityBrand` (handles с одинаковым набором capability делят одну инстанциацию) |
| `contract.ts` (новый, 49) | `defineContract`, `declareModule`; единственное место, где записан wire-генератор |
| `bind.ts` (+24/−6) | `bindInputFor()`; реализация `bindFactory` с широкой сигнатурой и `as never` (публичная сигнатура — тип `Assembly<C>`) |
| `prepare.ts` (+35/−17) | `collectMetadata(factories, inputHandles)`, `bindInputs`, запрет входа как root |
| `run.ts` (+54/−20) | `context = Object.freeze({ signal, scope: options?.scope })`; `admitInputs()` до первой фабрики; `invokeFactory()` вынесен ради complexity ≤ 20 |
| `factory.ts`, `index.ts` | `prepare` с `F`; экспорт значений `declareModule`, `defineContract`; явный список типов |

Разбиение на PR: GM-3a (scope и входы) и GM-3b (builder и handles), раздел 8.

### 5.3 Почему `scope` в контексте — это `Resources`, а не токен

| Вариант | Надёжность | Уверенность |
|---|---|---|
| **(Рекомендую)** Host передаёт `attempt.resources`. Assembly типизирует поле как `unknown`, `scoped()` проверяет бренд по приватному `WeakMap` пакета и вырезает поле из контекста модуля. Типичная ошибка «передать `Scope` вместо `scope.resources`» даёт `resources.scoped.invalid-run-scope` (тест A2) | 8/10 | 8/10 |
| Непрозрачный токен `scope.handle` без методов. Новое публичное понятие и новое поле у `Scope` | 8/10 | 7/10 |
| Типизированный generic `Assembly<C, S>`. Generic протекает во все типы Assembly | 7/10 | 6/10 |

### 5.4 Цена проверки типов (решение 2)

Генератор `impl-plan-v3/type-scale/generate.mjs`: N модулей, у каждого свой контракт и до двух
slot'ов на более ранние; 20 команд. Формы:
- **fragments** — каждая команда связывает свои модули своей картой (`interface TeamCaps extends
  CapabilitiesOf<…> {}`), Host вызывает `prepare` на всех N handles;
- **global** — те же декларации builder, все handles связывает Host своей картой;
- **literal** — опубликованный Assembly 0.2.0, ручной wire и ручная карта (нынешний способ).

Запуск: `type-scale/measure.sh 500` и `1000` (`--extendedDiagnostics`, Apple Silicon; для 500 —
диапазон двух прогонов, разброс между прогонами до 20%).

| Форма | N | tsc7 7.0.2, Check time | TS 5.8.3, Check time | Instantiations (tsc7) |
|---|---|---|---|---|
| fragments | 500 | 0,97–1,02 с | 2,37–2,72 с | 1,77 млн |
| global, карта `interface` | 500 | 0,94–0,95 с | 2,81–2,84 с | 1,30 млн |
| global, карта `type` | 500 | 4,4 с | 8,0 с и **TS2589** | 16,8 млн |
| literal (0.2.0) | 500 | 0,77–0,81 с | 2,84–2,87 с | 0,38 млн |
| fragments | 1000 | 3,10 с | 8,38 с (1,0 ГБ памяти) | 5,30 млн |
| global, карта `interface` | 1000 | 3,13 с | 9,40 с | 4,10 млн |
| literal (0.2.0) | 1000 | 2,99 с | 9,26 с | 0,77 млн |

Отдельно — существующая фикстура GM `largeLiteralSource()` (`tests/assembly/type-scale.mjs`: 1000
handles без slots, все с одной capability), минимум трёх (tsc7) и двух (5.8.3) прогонов:

| Assembly | tsc7 7.0.2 | TS 5.8.3 |
|---|---|---|
| 0.2.0 (бренд по всей карте) | 2,45 с | 7,07 с |
| кандидат v3, бренд-алиас `CapabilityBrand` | 3,76 с | 10,23 с |
| кандидат v3, бренд без алиаса (первый вариант) | 4,74 с | 12,9 с |

Выводы:
- На реалистичной форме (slots, разные контракты) фрагменты и builder стоят почти столько же, сколько
  нынешний ручной способ: +0–25% на tsc7, в пределах шума на 5.8.3.
- В вырожденной форме, где проверка handles — почти вся работа, бренд по используемым capability
  стоит +45–55%. Алиас сократил разрыв с ×1,9 до ×1,5; дальше удешевлять — в GM-3b по профилю
  (`--generateTrace`), если фикстура станет узким местом CI.
- Карта-`type` над сотнями контрактов патологична: каждое `C[K]` заново раскрывает объединение. Правило
  CMS: карты, выведенные из многих контрактов, объявлять как `interface … extends CapabilitiesOf<…> {}`.
- Рост сверхлинейный во всех формах, включая нынешний (×3–3,8 при ×2 модулей). Это не регрессия, но
  предел: на 1000+ модулей корень композиции стоит делить на подсистемы с отдельными `prepare`
  (вложенные run). Записано в риски.

В GM-3b это становится фикстурой: `tests/assembly/type-scale.mjs` получает `fragmentSource(500)`, и
packed-root проверяет её обоими компиляторами без TS2589 (время пишется в `t.diagnostic`, без порога:
пороги времени на раннерах флапают).

---

## 6. Реализация `resources` по инвариантам

### 6.1 Структуры

```ts
type Entry = { name; release?: (ctx: CleanupContext) => unknown; child?: ScopeNode; where: "live" | "active" | "failed" | "gone"; cause };
type Flight = { escalate: AbortController; done: Promise<CloseReport>; finish; unlink: (() => void)[] };
class ScopeNode {
  path; #parent?; #entry?; #order: "reverse" | "concurrent";
  #setupAbort: AbortController;   // resources.signal: "stop acquiring"
  #children: Set<ScopeNode>;      // registry: request/abort/escalate walk it; children never subscribe to the parent
  #live: Entry[]; #tombstones;    // LIFO; detached children leave tombstones, compacted when > 32 and > half
  #failed: Entry[];               // attempted and failed, in attempt order
  #active: Set<Entry>;            // running cleanups (1 for "reverse")
  #pending: Set<PendingSetup>;    // started setups
  #requested; #detached; #flight?;
}
```

Внешнего сигнала у scope больше нет; единственный внешний слушатель — сигнал run внутри `scoped()`,
пока фабрика не завершилась.

### 6.2 Алгоритм

```text
close(options):
  checkCloseOptions → InvalidArgumentError before any state change           (L2)
  request()                                       // sync, whole subtree through #children
  started = !flight; flight ??= open()            // nothing to release → detach, COMPLETE (settled)
  options.escalate → follow(signal → escalateTree); unlink at settle        (M1)
  if started: run(flight)                         // after linking: the first cleanup already sees escalate
  no abandon → flight.done
  abandon aborted → snapshot report (settled: false)
  otherwise → first of (flight.done, abandon → snapshot)                    (Q13: per caller)

join(parentEscalate):                             // the parent's flight; same as close without abandon
  flight ??= open(); if parentEscalate.aborted: escalateTree; return flight.done

open():
  failed → back on top of live in attempt order   // every new flight retries what is unreleased (Q2)
  nothing live and nothing pending → detach, no flight
  new Flight; inherit escalation from the nearest escalated ancestor flight

run(flight):
  loop: pending → await all settled; continue
        reverse:    e = pop() (skips tombstones); none → break; await invoke(e)
        concurrent: batch = pop all; none → break; await all invoke(batch)
  settle(flight)

invoke(e):
  e.where = active
  child → r = await child.join(flight.escalate.signal)   // the parent waits for its child, whoever else abandons
          r incomplete and e still active → failed (debts stay inside the child)
  else  → await e.release({ escalate: flight.escalate.signal }); e.where = gone
  catch cause → failed(e, cause)                          // continue (Q1)

settle: unlink caller escalate; flight = undefined; report(settled: true); complete → detach; finish(report)
detach: parent.#children.delete; parent.forget(entry) → tombstone + compaction
request(): requested = true; setupAbort.abort(ScopeClosedError); every child.request()
abortSetups(reason): setupAbort.abort(reason); every child.abortSetups(reason)
escalateTree(reason): flight?.escalate.abort(reason); every child.escalateTree(reason)   // idle children too (M4)
report: failed (attempt order) → active (pending) → pending setups → live top-down (not-run); children in place
```

### 6.3 `setup`, `use`, `child`, `scoped`

```text
setup(spec): bad spec or name → InvalidArgumentError, synchronously; requested → reject ScopeClosedError, callback not called
  capture setup/cleanup once; pending.add BEFORE the callback; await Promise.try(setup, { signal: setupAbort.signal })
  fulfil → pending.delete and live.push in the same turn (L3); requested → pre-handled ScopeClosedError to the author
  reject → pending.delete; the author sees the real error as is
use(value, name): read Symbol.asyncDispose ?? Symbol.dispose once (`then` never; sync dispose result ignored, L7); name required
  requested → throw ScopeClosedError, no custody: the caller keeps value       (M3)
child(options): validate (name required); requested → throw; new node joins #children and takes its LIFO slot
scoped(name, factory) → (deps, context):
  parent = brand(context.scope) else InvalidArgumentError resources.scoped.invalid-run-scope before the body
  module = parent.child({ name }) synchronously (slot = construction order)
  unlink = follow(context.signal → module.abortSetups)    // run cancellation reaches setups (H1)
  { scope, ...forwarded } = context                       // only the run scope is removed (api M2)
  try result = factory(deps, freeze({ ...forwarded, resources: module.resources }))
  catch → unlink(); rethrow                                // synchronous throw of the factory (impl M5)
  native Promise → void Promise.prototype.then.call(result, unlink, unlink); otherwise unlink()
```

### 6.4 Инварианты

| # | Как обеспечено |
|---|---|
| 1 | `Resources` и `ScopeControl` — разные замороженные объекты; `scoped()` отдаёт модулю контекст без `scope`; type fixture |
| 2 | `pending.add` до `Promise.try`; отклонённый setup записи не оставляет |
| 3 | `push` при fulfil; `child()` занимает место при создании |
| 4 | после запроса закрытия новое не принимается: `setup` отклоняет без вызова callback, `use` бросает без custody, `child` бросает |
| 5 | цикл ждёт `pending` до LIFO; поздний fulfil ложится наверх; автор получает pre-handled `ScopeClosedError` |
| 6 | `reverse`: один `invoke` за раз; `concurrent` только по явной опции scope |
| 7 | `try/catch` на каждую запись, `failed` с исходной `cause`, цикл идёт дальше |
| 8 | `#flight` публикуется до первого cleanup; `close`, `asyncDispose` и родитель получают `flight.done`; новый полёт повторяет `failed` |
| 9 | `setup` получает `{ signal: #setupAbort.signal }`, `cleanup` — `{ escalate: flight.escalate.signal }`; запрос закрытия escalate не трогает |
| 10 | escalate обходит `#children`, включая простаивающих, и наследуется новыми полётами поддерева; abandon по дереву не идёт |
| 11 | abandon касается только своего вызова: снимок (`settled: false`), полёт продолжается по порядку |
| 12 | released-записи уходят; отцепление удаляет ребёнка из `#children` и оставляет надгробие с уплотнением; долг ребёнка остаётся записью родителя |
| 13 | `asyncDispose` = `close()`; при `complete === false` бросает `CloseIncompleteError(report)` без `SuppressedError` |
| 14 | нет импортов (`builtins: []`), таймеров и глобалов; единственное модульное состояние — приватный `WeakMap` бренда |
| 15 | подключение и отцепление ребёнка O(1): ни одного слушателя на сигналах родителя |
| 16 | у каждой записи и scope есть непустое имя; путь долга не зависит от порядка регистрации |
| 17 | каждая ошибка пакета несёт `code` из `ResourcesErrorCode` |

### 6.5 Граничные случаи

- **Сигнал run в `scoped()`.** Связан с setup модуля только до завершения фабрики (тест A4).
  Слушателей на сигнале run не больше, чем модулей, которые конструируются прямо сейчас.
- **Параллельные setup** разрешены, порядок LIFO определяется порядком fulfil.
- **Ребёнок, созданный до fulfil setup родителя, переживёт это значение.** Правило CMS 4: ребёнку
  отдают только значения, чей setup уже завершился.
- **Thenable.** Результат `setup` ассимилируется, поэтому `execa` оборачивают в `{ proc }`. `use()`
  метод `then` не читает.
- **Re-entrancy.** `close()` из cleanup своего scope возвращает тот же Promise; если cleanup его ждёт,
  получается deadlock (правило CMS 12). `use()`/`child()` из cleanup бросают, `setup()` отклоняется.
- **Порядок долгов:** failed в порядке попыток, затем идущие, затем pending setup, затем не начатые
  сверху вниз; дети раскрываются на своём месте.
- **`close()` никогда не отклоняется.** Неверные опции — синхронный `InvalidArgumentError` до изменения
  состояния.
- **Неверный spec `setup()`** бросает синхронно, а не отклоняет Promise: это ошибка программы;
  отклонение зарезервировано за исходами (закрытый scope, ошибка самого setup).
- **Пустой ребёнок** при `close()` сразу возвращает `COMPLETE` и отцепляется.
- **Pure-модули.** Обёртка `scoped()` для них — пустой ребёнок: объект и один `AbortController`.
- **Две копии пакета у одного Host.** `scoped()` отказывает по бренду (`resources.scoped.invalid-run-scope`);
  peer-зависимости (1.4) делают это ошибкой установки, а не работы.
- **Зависимость повтора.** Если cleanup при повторе снова нужен провайдер (журнал, в который пишут при
  освобождении), Host держит провайдера во внешнем scope и закрывает его только после `complete`
  внутреннего: Q1 продолжает освобождение после ошибки, и провайдер того же scope к повтору уже закрыт.

---

## 7. Тесты

Правило: тестируем только рискованные инварианты. Для каждого теста указана регрессия (мутация
прототипа v3), которую он ловит. Семантическая suite запускается дважды: на `../dist` и на
установленном архиве.

### 7.1 `resources`: семантика (R), масштаб (S), память (G)

| # | Подготовка | Утверждение | Ловит |
|---|---|---|---|
| R1 | внутри callback `outer` вызывается `await resources.setup(inner)` | журнал `["outer","inner"]` | место в LIFO в момент вызова |
| R2 | `use` a, b (синхронный throw `boom` один раз), c (async); затем второй `close()` | первый: журнал `["c","a"]`, `debts` deepEqual `[{path:["m","b"],state:"failed",cause:boom}]`; второй: `complete`, b вызван ровно 2 раза | `stop-on-first-failure`, `retry-skips-failed` |
| R3 | запись на gate; одновременно `close()` и `asyncDispose()` | после `setImmediate` ни один не завершён; cleanup вызван 1 раз | второй `disposeAsync` TC39 резолвится раньше |
| R4 | cleanup синхронно зовёт `control.close()` | вернувшийся Promise `===` внешнему; cleanup вызван 1 раз | рекурсия, двойной полёт |
| R5 | setup на gate; `close()`; gate открыт; автор без `await` | журнал `["clean:v"]`, `complete`, автор отклонён с `code === "resources.scope.closed"`, `unhandledRejection` пуст; подпроцесс: настоящий throw setup без `await` завершает процесс с кодом 1 | потеря позднего значения, pre-handle всех ошибок оптом |
| R6 | состояния: отцеплен, идёт полёт, закрыт с долгом | во всех трёх: `setup({ name })` отклоняется (`resources.scope.closed`), callback не вызван; `use(x, "late")` бросает и x **не** освобождён; `child({ name })` бросает | `use-takes-custody-when-closed` |
| R7 | cleanup пишет `escalate.aborted` до и после gate; `close({escalate})`, abort посреди; cleanup падает; повторный `close()` | `[false, true, false]` | `sticky-escalate`, `cleanup-gets-setup-signal` |
| R8 | a; b на gate; терпеливый `close()` и `close({abandon})`, abort | снимок `[["m/b","pending"],["m/a","not-run"]]`, `settled === false`; до gate журнал `["b:start"]`; терпеливый получает `complete`, `settled === true`; журнал `[b:start,b:end,a]`; максимум одновременных = 1 | `abandon-finishes-shared-flight`, `abandon-snapshot-claims-settled` |
| R9 | родитель: `conn`, затем ребёнок `session` с медленным `drain`; `session.close({abandon})` и `parent.close()`, abort | после abort журнал `["drain:start"]`; итог `[drain:start, drain:end, conn]`, родитель `complete` | родитель уходит дальше при abandon ребёнка |
| R10 | root: ребёнок c (простаивает) → внук g (закрывается сам, cleanup `slow` на gate); у root запись `top` выше c на своём gate; root `close({escalate, abandon})`, abort обоих | снимок сразу: `[["r/top","pending"],["r/c/g/slow","pending"],["r/c/g/early","not-run"]]`; cleanup g видит `[false, true]` | `escalate-skips-idle-children`, `cleanup-gets-setup-signal` |
| R11 | 2000 детей с записью закрываются сами; затем ребёнок `bad` | `getEventListeners(parent.resources.signal) === 0`; отчёт родителя `[["p/bad/y","failed"]]` | `listener-per-child`, потеря долга ребёнка |
| R12 | запись всегда падает; 200 `close({escalate: hostSignal})` | после серии на `hostSignal` 0 слушателей | `escalate-links-kept` |
| R13 | `asyncDispose` при долге | бросает `CloseIncompleteError`, `code === "resources.close.incomplete"`, `report.debts[0].cause === x`, `errors[0] === x` | `await using`, проглатывающий долг |
| R14 | `order: "concurrent"`, 5 детей с записью `work` на одном gate, s3 падает; escalate посреди | максимум одновременных = 5; долги `[["sessions/s3/work","failed"]]`; все 5 видят escalate | `concurrent-ignored` |
| R15 | `close({ escalate: <не сигнал> })`; `use(x)` без имени; `setup` без имени; `child({})`; `createScope({ name: "" })` | каждый вызов бросает `TypeError` с `code === "resources.argument.invalid"`; `resources.signal.aborted === false`; scope дальше работает | `validate-after-request` |
| R16 | setup резолвится, abort через 0–5 микротасков | в снимке не больше одного долга на ресурс | `pending-removed-late` |
| S1 | 50 тыс. живых детей одного scope: создание, затем закрытие по одному; отдельно два `close()` над 2 тыс. и 20 тыс. падающих записей | 0 слушателей на сигнале родителя; последняя тысяча созданий не дороже первой более чем в 4 раза (квадратичный стек даёт десятки раз); закрытие 20 тыс. не дороже 15× закрытия 2 тыс. Пороги относительные, чтобы не флапать на Windows (impl LOW) | квадратичный стек, слушатель на ребёнка |
| G1 | подпроцесс `node --expose-gc gc-probe.mjs`: 2000 детей закрываются сами, `WeakRef` на их `resources`, три цикла `gc()`; **после GC родитель закрывается** | живых ≤ 20 | `no-detach-from-parent` |

### 7.2 `resources` + настоящие Core и Assembly (A), типы (T), упаковка (P)

| # | Утверждение | Ловит |
|---|---|---|
| A1 | цепочка из 5 модулей, все обёрнуты `scoped(implementationId, …)`, третья фабрика бросает после регистрации. Результат `failed`, `assembly.run.factory-rejected`; `attempt.close()` даёт журнал `["m3","m2","m1"]` и `complete` | scope открыт после `await`, закрытие в порядке создания |
| A2 | **один prepared, два параллельных run** со своими scope, фабрики перемежаются через `setImmediate`. Закрытие run 1 освобождает ровно `["1:m2","1:m1"]`; run 2 не задет; третий run `succeeded`. Run со `scope` = `undefined`, `{}`, `{ child(){} }`, функцией или самим `Scope` (вместо `.resources`) даёт `failed`, причина — `TypeError` с `code === "resources.scoped.invalid-run-scope"`, 0 вызовов setup | `scoped-captures-first-scope`, утиная проверка бренда |
| A3 | **параллельные run не смешивают входы:** 64 run одного prepared с `inputs: { session: { "session/id": "s<i>" } }`; `created` содержит только `s/store`. Плюс отказы prepare: вход в `factories`, вход как root, вход под двумя алиасами, не-вход в `inputs` → `assembly.prepare.inputs`; вход без алиаса → `assembly.prepare.handles` | `scoped-captures-first-scope`, общий буфер входов, вход в `created` |
| A4 | шаблон Host `attempt = host.child({ name: "attempt" })`; зависший setup; abort сигнала run. `run()` завершается за < 500 мс: `failed`, `assembly.run.factory-rejected`, `cancellation.reason === reason`. Ключи контекста модуля ровно `["resources","signal"]`. После успешного run abort сигнала run не трогает `resources.signal` модуля | `scoped-ignores-run-signal`, `scoped-links-run-signal-forever`, `scoped-passes-run-scope` |
| A5 | обёрнутая фабрика, вызванная с `{ signal, scope, extra }`, видит ровно `["extra","resources","signal"]` | `scoped-drops-context-fields`, `scoped-passes-run-scope` |
| A6 | builder: `declareModule` выдаёт ровно текущий wire (token `acme/db/r3`), `{ ...decl }` с `kind` отвергается кодом `assembly.bind.invalid-declaration`; handle команды и handle Host из разных `assemblyFor` проходят `prepare` и `run` с настоящим Core 0.2.0; slot из ревизии 2 против провайдера ревизии 3 Core отвергает `binding.compatibility-mismatch` | wire-генератор, общий реестр handles между экземплярами `assemblyFor` |
| T | `types.ts` в `typecheck` (7.0.2) и `typescript-minimum` 5.8.3 в `resources:typecheck`, NodeNext и Bundler. Положительное: `deps.db` типизирован, cleanup получает литерал `5`, `{ escalate }`, `CloseOptions` с `AbortSignal \| undefined`, полный `switch` по `ResourcesErrorCode`, будущее поле контекста доходит до модуля. `@ts-expect-error`: `context.scope`, `resources.close`, `resources.control`, несуществующий slot, `bindLegacy(scoped("m", …))`, `ScopeControl` в `Resources`, `order: "parallel"`, `createScope({})`, `child({})`, `child({ name, signal })`, `setup` без имени, `use` без имени, cleanup со `string` для `number`, `{ signal }` в cleanup, `use({ close(){} }, "x")` | расширение `Resources`, потеря вывода, мост с Assembly без `scope` |
| P | `pnpm pack` один раз; распаковать во временный consumer. Манифест: `exports` только `"."`, нет `private`, точный `publishConfig`, `engines` = `SUPPORTED_NODE_RANGE`, нет зависимостей. Файлы архива только `dist/**`, `README.md`, `LICENSE`, `CHANGELOG.md`, `package.json`. Suite из установленного корня; deep import → `ERR_PACKAGE_PATH_NOT_EXPORTED`; типы × 2 компилятора × 2 resolution с `lib` из 4.4 | неверная форма публикации |

Node 26: в `tests/node-runtime-compatibility.test.mjs` добавить `"resources"` в `packageNames`, экспорты
и сценарий «setup → close → complete»; в `ci.yml` (job `node-26-compatibility`) — `pnpm resources:build`
и pack.

### 7.3 Assembly 0.3.0 (GM-3a и GM-3b)

| # | Где | Утверждение |
|---|---|---|
| AS1 | `tests/assembly/runtime.test.mjs` | два параллельных run одного prepared с разными `scope`: каждая фабрика получает свой объект (identity), Proxy-ловушки на `scope` срабатывают 0 раз; без `scope` в контексте `undefined` |
| AS2 | `tests/assembly/inputs.test.mjs` (новый) | 64 перемежающихся run с разными входами: каждый root видит только свой session id |
| AS3 | там же | нет входа, лишний ключ, getter, не-объект → `failed`, фаза `inputs`, `assembly.run.invalid-inputs`, 0 вызовов фабрик и 0 вызовов getter |
| AS4 | там же | вход не попадает в `created`; `bindInput` со slots бросает `assembly.bind.invalid-declaration` |
| AS5 | `tests/assembly/preparation.test.mjs` | Core без входного модуля отвергает под-план (`binding.unknown-provider`), со входным компилирует |
| AS6 | там же | вход в `factories`, вход как root, вход под двумя алиасами, не-вход в `inputs` → `assembly.prepare.inputs`; вход без алиаса → `assembly.prepare.handles`; 0 вызовов фабрик |
| AS7 | `tests/assembly/builder.test.mjs` (новый, GM-3b) | как A6, без resources: wire-генератор, отказ `kind`, handles двух `assemblyFor` в одном `prepare`, отказ Core на чужой ревизии |
| AT-R | `tests/assembly/types.ts`, `types-positive.ts` (их гоняет `testAssemblyTypes`: 5.8.3 и 7.0.2 × NodeNext и Bundler) | `keyof FactoryContext` = `"signal" \| "scope"`; `ctx.context` — ошибка; run без обязательных `inputs`, без ключа, с неверным типом, с лишним ключом не компилируется; `bindInput(decl со slots)` не компилируется; `run({ signal: maybe })` с `AbortSignal \| undefined` компилируется |
| AT-B | там же (GM-3b) | по `builder-fixture.ts`: handle команды со своей картой принимается Host; устаревшая ревизия отвергается; handle с неизвестной capability (только неизвестной и смешанный) отвергается; вход в `factories` и в `roots` отвергается; ручной литерал `compatibility` и `kind` в `declareModule` отвергаются; чужая ревизия в slot отвергается `ValidDeclaration`; значение capability против типа контракта. Существующие отказы «Host mappings are invariant» и «different exact identities» остаются в силе (проверено: они касаются используемой capability) |
| TS | `tests/assembly/type-scale.mjs`, `packed-root.test.mjs` | фикстура `fragmentSource(500)` с картами-`interface` компилируется обоими компиляторами без TS2589 |

### 7.4 Мутации, проверенные на прототипе v3

| Мутация | Ловит |
|---|---|
| `abandon-finishes-shared-flight` | R8, R9, R10 |
| `escalate-skips-idle-children` | R10 |
| `listener-per-child` | R11, G1 |
| `no-detach-from-parent` | G1 |
| `escalate-links-kept` | R12 |
| `sticky-escalate` | R7 |
| `use-takes-custody-when-closed` | R6 |
| `concurrent-ignored` | R14 |
| `validate-after-request` | R15 |
| `pending-removed-late` | R16 |
| `scoped-captures-first-scope` | A2, A3, A4, A5, A6 |
| `scoped-ignores-run-signal` | A4 |
| `scoped-links-run-signal-forever` | A4 |
| `scoped-passes-run-scope` | A4, A5 |
| `scoped-drops-context-fields` | A5 |
| `retry-skips-failed` | R2, R7, R11 |
| `stop-on-first-failure` | R2 |
| `cleanup-gets-setup-signal` | R7, R10 |
| `abandon-snapshot-claims-settled` | R8 |

Скрипт: `impl-plan-v3/mutate.py`. Все 19 мутаций пойманы. Строки скрипта после переноса в GM не
совпадут, поэтому критерий GM-4: «16+3 мутации перепрогнаны на финальном коде, результат в PR».

**Не пишем:** тесты на каждый метод; проверки исходного текста; тесты адаптеров в GM; повтор одних и
тех же инвариантов в TEST и AR.

---

## 8. GM: PR за PR, `pnpm check` зелёный на каждом шаге

### 8.1 GM-1 `refactor(architecture): table-driven leaf package admission`

Сейчас kernel захардкожен в девяти местах; `lifecycle-candidate-admission.mjs:150` (`acceptedRoots`)
отвергнет любой новый корень. Поведение не меняется.

**Таблица** `architecture/checks/leaf-packages.mjs`:

```js
export const LEAF_PACKAGES = Object.freeze([
  Object.freeze({
    id: "lifecycle-kernel", name: "@get-modular/lifecycle-kernel", root: "packages/lifecycle-kernel",
    publication: "private-candidate", version: /^0\.1\.0$/u,
    decision: { id: "ADR-0029", path: "docs/decisions/0029-admit-an-optional-lifecycle-kernel-candidate.md",
      fileDigest: "<как сейчас>", immutableDigest: "<как сейчас>" },
    extension: { id: "lifecycle-generation-and-lease", authority: "docs/decisions/0029-admit-an-optional-lifecycle-kernel-candidate.md" },
    requiredTests: ["packages/lifecycle-kernel/tests/kernel.test.mjs", "packages/lifecycle-kernel/tests/packed-root.test.mjs"],
    commands: { /* пять строк CHECK_COMMANDS kernel, build → build-leaf-package.mjs lifecycle-kernel */ },
    gate: "lifecycle:check",
  }),
  // GM-2 добавляет запись resources (8.2), GM-4 делает её обязательной при наличии корня (8.4)
]);
```

Полей «на будущее» нет; класс peer-зависимостей добавит план conformance.

**Чекеры читают таблицу:**
- `lifecycle-candidate-admission.mjs` → `leaf-package-admission.mjs` (`REQUIRED_TESTS`, `CHECK_COMMANDS`, `acceptedRoots` из таблицы);
- `architecture/tooling/build-lifecycle-kernel.mjs` → `build-leaf-package.mjs <id>`; скрипт
  `lifecycle:build` = `node architecture/tooling/build-leaf-package.mjs lifecycle-kernel`;
- `assembly-admission.mjs`: importers и root dev-рёбра;
- `production-artifacts.mjs`: `leafManifestViolations` по `publication`, цикл исключения `dist`,
  `prohibitedFields`/`carrierShapeViolations`/`exportMapViolations`/`moduleTypeViolation` для всех
  записей таблицы (сейчас только по имени для core и kernel, `:186-201, 503-507`);
- `feature-module-standard-profile.mjs`: скрипты, `ROOT_SCRIPT_COMMANDS`, layout, `adoption.extensions`;
- `governance.mjs`; `source-dependencies.yaml`: переименованные entrypoints;
- `tests/governance.test.mjs:296`: цикл `engines` по `packages/core`, `packages/assembly` и всем корням
  `LEAF_PACKAGES` (без импорта `architecture/` в тест пакета).

**Тесты параметризуются** `for (const leaf of LEAF_PACKAGES)`; все отвергающие тесты kernel
сохраняются: `leaf-package-admission`, `assembly-admission`, `feature-module-standard-profile`,
`private-core-start`, `generated-production-source` (копировать все `decision.path`),
`ownership-checkpoint` (`:148`: `packageRoots` = core, assembly и существующие корни таблицы вместо
`lifecyclePresent`).

| Вариант | Надёжность | Уверенность |
|---|---|---|
| **(Рекомендую)** узкая таблица | 8/10 | 8/10 |
| дописать resources рядом с kernel в девяти местах | 7/10 | 9/10 |
| отдельный чекер по образцу 231 строки | 6/10 | 8/10 |

### 8.2 GM-2 `docs(architecture): accept ADR-0030, ADR-0031 and ADR-0032`

- разделы 2.1–2.3, 3.1, 3.3;
- запись `resources` в `LEAF_PACKAGES`: решение аутентифицировано, корня нет;
- `fileDigest` трёх ADR считать после финального текста;
- перед PR: markdownlint и cspell на трёх ADR (в прототипе — 0 замечаний).

Гейты: `pnpm docs:protocol:check`, `pnpm foundation:check` (`governance.architecture-decisions`,
двусторонняя supersession), `pnpm ownership:checkpoint:test`, `pnpm check`.

### 8.3 GM-3a `feat(assembly): per-run scope and declared inputs` (ADR-0031)

- **Исходники:** `types.ts` (run-часть 5.1), `bind.ts`, `prepare.ts`, `run.ts`, `factory.ts`,
  `index.ts` по прототипу v3; критерии: `pnpm lint:typed` зелёный, complexity `runAttempt` ≤ 20.
- **Тесты:** AS1–AS6, AT-R (7.3).
- **Допуск пары 0.3.0:**
  - `assembly-admission.mjs`: ветка `manifest.version === "0.3.0"` аутентифицирует байты и запись
    реестра ADR-0031, как ADR-0027 для 0.2.0;
  - `tests/assembly-admission.test.mjs:559-562`: `["0.3.0","0.3.0"]` переходит в принятые, в
    отвергнутые добавляются `["0.4.0","0.4.0"]`, `["0.3.0","0.2.0"]`, `["0.2.0","0.3.0"]`; литералы
    `:119,228,434,544,549` пересмотреть;
  - `production-artifacts.mjs:247-249`: публичная `0.3.0` допустима, текст ошибки
    «historical 0.1.0 or public 0.2.0/0.3.0 admission»;
  - `tests/feature-module-standard-profile.test.mjs:893-894` и **`:899`** (случай `{ version: "0.3.0" }`
    и регэксп текста `production-artifacts.mjs:249`).
- **`sdk-growth.mjs:181`:** `baseline.packageVersion !== "0.2.0"` → сравнение с версией манифеста.
- **Changeset** `.changeset/assembly-run-scope.md`: `"@get-modular/core": minor`,
  `"@get-modular/assembly": minor`. Текст: для Core «version aligned with Assembly under the exact-pair
  rule; no API change»; для Assembly — что добавлено; **Migration:** код, который сам собирает
  `FactoryContext`/`RunOptions` или реализует `PreparedAssembly`, добавляет `scope`; строка
  `Authoring surface changed: yes`.
- **EF v1:** изменённые `FactoryContext`/`RunOptions`/`PreparedAssembly`/`AssemblyPrepareInput`
  классифицируются как `breaking` (`evaluate-public-api-compatibility.js:155-160`). В
  `architecture/foundation/public-api-compatibility.yaml` у Assembly записи
  `approvedBreakingChanges: [{ fingerprint: <из диагностики foundation:check>, decisionId: ADR-0031 }]`.
  Для Core изменений API нет.
- **Release dry-run №1 (обязателен перед merge).** Одноразовый worktree от ветки PR, не пушится:

  ```sh
  pnpm install --frozen-lockfile
  npm view @get-modular/core versions --json; npm view @get-modular/assembly versions --json   # ADR-0027: сверка registry до версионирования
  pnpm release:version
  pnpm assembly:build
  pnpm exec agent-teams-foundation public-api-promote-release --consumer . --json
  git add -A && git commit -m "chore(release): dry run"
  git fetch origin main
  export GITHUB_EVENT_NAME=pull_request GITHUB_BASE_REF=main GITHUB_HEAD_REF=changeset-release/main \
    GITHUB_REPOSITORY=agent-teams-ai/get-modular FOUNDATION_PR_HEAD_REPOSITORY=agent-teams-ai/get-modular
  pnpm release-owned-files:check   # без GITHUB_EVENT_NAME=pull_request проверка молча ничего не делает
  pnpm check
  ```

  Ловит то, что упало бы только в release-PR: литералы версий, packed-тесты `sdk-growth`, допуск 0.3.0.
  Если падает замороженный assert `sdk-growth` (кроме `:181`), его выключают комментарием с
  пометкой «G1 on hold; вернуть при возобновлении G1», а не переписывают evidence (правило владельца,
  R13).

### 8.4 GM-3b `feat(assembly): authoring builder and capability-scoped handles` (ADR-0032)

- **Исходники:** `contract.ts` (новый), типы handles и builder в `types.ts`, `factory.ts`, `index.ts`
  (экспорт значений `declareModule`, `defineContract`; явный список типов 5.1). Всё внутри фичи
  `construction` (ADR-0023: одна фича), entrypoints `types.ts` и `factory.ts` не меняются.
- **Тесты:** AS7, AT-B, TS (7.3).
- **Литералы экспорта:** `tests/assembly/packed-consumer.mjs:9` и
  `tests/node-runtime-compatibility.test.mjs:47` → `["AssemblyBindingError", "assemblyFor",
  "declareModule", "defineContract"]`.
- **Примеры и README:** `packages/assembly/examples/basic-host.mjs` на builder; правки
  `packages/assembly/README.md` из 9.2.
- **Changeset** `.changeset/assembly-authoring-builder.md`: `"@get-modular/assembly": minor` (тот же
  релиз 0.3.0), `Authoring surface changed: yes`, миграция: `declareModule` + дескрипторы, карты через
  `CapabilitiesOf` (как `interface` для больших карт).
- **EF v1:** `FactoryHandle`, `AnyFactoryHandle`, `RootHandles`, `Assembly` → `breaking`;
  `approvedBreakingChanges` с `decisionId: ADR-0032`.
- **Release dry-run №2** теми же командами.

### 8.5 GM-4 `feat(resources): add @get-modular/resources`

- **Пакет:** `packages/resources/**` (раздел 4) с версией `0.0.0` и changeset
  `"@get-modular/resources": minor` (`Authoring surface changed: yes`).
- **Lock:** `pnpm-lock.yaml` (`packages/resources: {}`), root devDependency
  `@get-modular/resources: workspace:*`.
- **Скрипты корня** (строки сравниваются побайтно с `CHECK_COMMANDS` записи таблицы):

  ```json
  "resources:build": "node architecture/tooling/build-leaf-package.mjs resources",
  "resources:typecheck": "node node_modules/typescript/bin/tsc -p packages/resources/tsconfig.json --noEmit && node node_modules/typescript/bin/tsc -p packages/resources/tsconfig.types.json --noEmit && node node_modules/typescript/bin/tsc -p packages/resources/tsconfig.types.bundler.json --noEmit && node node_modules/typescript-minimum/bin/tsc -p packages/resources/tsconfig.types.json --noEmit && node node_modules/typescript-minimum/bin/tsc -p packages/resources/tsconfig.types.bundler.json --noEmit",
  "resources:test": "node --test packages/resources/tests/scope.test.mjs packages/resources/tests/assembly-scope.test.mjs",
  "resources:pack": "node --test packages/resources/tests/packed-root.test.mjs",
  "resources:check": "pnpm resources:build && pnpm resources:typecheck && pnpm resources:test && pnpm resources:pack"
  ```

- **`check` и `check:fast`:** `pnpm resources:check` сразу после `pnpm lifecycle:check` (после
  `pnpm assembly:build`: A1–A6 требуют собранного Assembly). `ROOT_SCRIPT_COMMANDS`
  (`feature-module-standard-profile.mjs:91-130`) получает `"resources:check"` после
  `"lifecycle:check"` в обоих списках.
- **`REQUIRED_TESTS` записи:** `packages/resources/tests/scope.test.mjs`,
  `packages/resources/tests/assembly-scope.test.mjs`, `packages/resources/tests/packed-root.test.mjs`.
- **Класс `public` в `production-artifacts.mjs`:** нет `private`; `publishConfig` ровно
  `{ access: "public", registry: "https://registry.npmjs.org/" }`; `repository` ровно
  `{ type: "git", url: "git+https://github.com/agent-teams-ai/get-modular.git", directory: <root> }`;
  `type: "module"`; `files` ровно `["dist", "LICENSE", "README.md", "CHANGELOG.md"]`; экспорт только
  `"."`; нет `dependencies`; версия по правилу записи (`^0\.\d+\.\d+$`). `ACCEPTED_PACKAGE_NAMES` +
  `@get-modular/resources`.
- **`source-dependencies.yaml`:** `packageRoots`, `governedRoots` (`src`, `tests`); границы
  `resources-contract` (`types.ts`, `errors.ts`) → `resources-implementation` (`scope.ts`) →
  `resources-composition` (`composition/root.ts`) → `resources-public-entrypoint` (`src/index.ts`,
  `packageExports: ["."]`), без пакетов и builtins; `resources-development` (`dependencyMode:
  development`), entrypoints `tests/scope.test.mjs`, `tests/assembly-scope.test.mjs`,
  `tests/packed-root.test.mjs`, `tests/semantic-suite.mjs`, `tests/gc-probe.mjs`, `tests/types.ts`;
  пакеты `@get-modular/core`, `@get-modular/assembly`, `@get-modular/resources`; builtins
  `node:assert/strict`, `node:child_process`, `node:events`, `node:fs/promises`, `node:module`,
  `node:os`, `node:path`, `node:test`, `node:url` (как шаблон kernel `:404-412` плюс `node:events`);
  `repository.development`.
- **Профили и покрытие:** `feature-module-standard-profile.json` — модуль в `abstractLayout.modules`,
  `adoption.extensions` += `{ "id": "module-resource-scopes", "authority":
  "docs/decisions/0030-admit-the-module-resource-scope-package.md" }`; `quality-source-coverage.yaml`,
  `suppression-governance.yaml`.
- **Критерии:** `pnpm lint:typed` зелёный; 19 мутаций перепрогнаны на финальном коде, результат в PR.
- **Документация:** `docs/architecture/feature-module-standard.md` (Local extensions, Enforcement),
  корневой `README.md` (Packages).
- **Node 26:** `node-runtime-compatibility` и `ci.yml` (7.2). **`.cspell.json`:** только реально
  отмеченные слова.

### 8.6 GM-5 conformance (необязателен для поезда 1)

Отдельный план и ADR-0033, уточняющий ADR-0003 (conformance зависит от core, assembly и resources
через `peerDependencies`). Вход:
- `smoke` делает prepare один раз и run с новым scope на каждый k;
- `runContractSuite` ключуется по `capabilityId`; набор по окну ревизий появится в поезде 2;
- `isolate` типизируется картой модуля (`ModuleFactory`), а не картой Host;
- класс peer-зависимостей в `LEAF_PACKAGES`;
- следующий minor: `checkNamespaces({ declarations, policy })` → находки в форме `Diagnostic`
  (`code`, `path`, `coordinate`) с кодами `conformance.namespace.*`, отдельный тип (не расширяет
  `DiagnosticCode`), около 80 строк. Это хелпер CI; гранты проверяет Host своим кодом.

### 8.7 GM-6 `docs(architecture): consumer standard for the 0.3.0 train`

- **CMS:** раздел 9.1 (два подраздела), правки 9.2, раздел «Dynamic instances» (9.3) после отдельного
  ревью текста, conformance, если GM-5 успел. Шаблон Host компилируется тестом (как
  `impl-plan-v3/host-template.ts`, обоими компиляторами).
- **Quickstart:** `docs/guides/consumer-quickstart.md` на builder и `run({ signal, scope })`.
- **Пины CMS:** `tests/ownership-checkpoint.test.mjs:130-132` — новый SHA-256; `sdk-growth.mjs` — P0
  остаётся замороженной на `24d6557`, проверяются байты `git show <acceptedCurrent.commit>:docs/architecture/common-assembly.md`
  против `CMS_SHA256` (решение А).
- **`AGENTS.md` GM не трогаем.**

### 8.8 REL `chore(release): prepare Core/Assembly 0.3.0 and resources 0.1.0`

Ветка `changeset-release/main`, по образцу `a10f33a` (#112). Перед ней — release dry-run №3 на
финальном `main` теми же командами (переход resources `0.0.0` → `0.1.0`, `CHANGELOG.md`, правило
версии leaf, packed-тесты).

```sh
npm view @get-modular/core versions --json; npm view @get-modular/assembly versions --json; npm view @get-modular/resources versions --json   # ожидается E404
pnpm release:version                       # 0.3.0 / 0.3.0 / 0.1.0 и CHANGELOG
pnpm assembly:build
pnpm exec agent-teams-foundation public-api-promote-release --consumer . --json
# удалить обе записи approvedBreakingChanges: EF 1.5.1 не сообщает о неиспользованных (analyze-public-api-compatibility.js:22-24)
git commit … && pnpm check                  # после коммита
```

Release-owned файлы (`architecture/public-api/`) меняются только на этой ветке.

### 8.9 R-1 публикация: R-1a, проверки, R-1b

**R-1a (подготовка, без загрузки).**
- Точный merged SHA REL и дерево; один `pnpm pack` каждого пакета на Node 24.18; SHA-256 и SHA-512;
  архивы сохраняются (retained) рядом с записью намерения
  `plans/get-modular-0.3.0-train-release-intent-<дата>.md` (по образцу
  `get-modular-0.2.0-release-intent-2026-09-29.md`).

**Проверки на retained-архивах R-1a** (параллельно):
- **TEST-1** (раздел 11) — один раз для тройки архивов.
- **Черновая ветка AR** на `file:`-архивах, не мёржится. Должны пройти: `pnpm typecheck`;
  `pnpm --filter @agent-teams/embedded-runtime test` с новыми тестами 10.6;
  `packages/apps/embedded-runtime/tests/package/assembly-packed-consumer.test.ts` на архивах.
  Гейты C0, L0 и пина CMS исключены (AR-0 может быть ещё не смёржен). Проблемы API правятся в GM
  до R-1b новым REL.
- **Node 26.10+:** disposable consumer на hosted worker (локально только 26.9.0), как в 0.2.0.

**Ревью владельца** результатов.

**R-1b (загрузка).** Порядок Core 0.3.0 → Assembly 0.3.0 → resources 0.1.0 (→ conformance):
- `npm whoami` и подтверждение через основной профиль Brave (workspace `AGENTS.md`);
- загрузка ровно retained-файла: `npm publish ./get-modular-<name>-<v>.tgz --tag candidate-0-3-0 --access public`
  (не из каталога: npm не переписывает `workspace:*`);
- read-back: `npm view @get-modular/<name>@<v> dist.integrity` равен записанному SHA-512, скачанный
  архив `cmp` с retained;
- после **всех** загрузок: consumer proof на скачанных байтах (Node 24.x и 26.10+), затем
  `npm dist-tag add @get-modular/<name>@<v> latest` для каждого пакета. `latest` раньше времени дал бы
  Core 0.3.0 при Assembly 0.2.0 и вторую копию Core (как в 0.2.0: «latest pending until the pair is
  complete»);
- новое имя: после первой загрузки прочитать фактические dist-tags (registry может сам поставить
  `latest`; resources загружается последним, поэтому это безвредно);
- публикация вручную: trusted publishing для первой версии нового имени невозможен, provenance не
  заявляем;
- неопределённый результат: только чтение и сверка, без повторной загрузки.

### 8.10 Гейты GM

Во время работы `pnpm check:changed`, перед передачей `pnpm check:fast`, финально `pnpm check`
(`precheck` = `ownership:checkpoint:test`). Адресные: `governance:test`, `lifecycle:check`,
`resources:check`, `architecture:feature-module-profile:test`, `sdk-growth:check`,
`docs:protocol:check`, `lint:typed`.

`pnpm check` запускать **после коммита**: интеграционные тесты клонируют HEAD, custody сравнивает с
индексом. Нужен Node 24.x (не ниже 24.18).

---

## 9. Consumer Module Standard (одна ревизия на поезд)

### 9.1 Новые разделы `common-assembly.md`

Место: после «Optional dynamic Host lifecycle candidate». Frontmatter `related` + ADR-0030,
ADR-0031, ADR-0032.

```markdown
### Module resource scopes

[ADR-0030](../decisions/0030-admit-the-module-resource-scope-package.md) admits
the optional `@get-modular/resources` package. It is a cleanup mechanism: a
module registers how to release what it acquired, and the Host decides when a
scope closes, how long to wait, when to escalate or abandon, whether to retry
and how to report health. Core and Assembly do not import it. Pure and
borrow-only modules need nothing.

A scope is cooperative cleanup of trusted in-process code. `complete: true`
means every registered cleanup callback returned without throwing; it is not
proof of physical release. Never assemble third-party or untrusted code through
`scoped()`; such code runs in a runtime the Host can terminate, registered as
one `setup`/`cleanup` entry in a Host scope. `Resources` is not part of any
plugin SPI. `Debt.path` is an array; join it only for display.

Module authors:

1. Acquire through `resources.setup`, or pass a value already in hand to
   `resources.use`. Acquire asynchronously only inside `setup`: after a close is
   requested `use()` throws and the value stays with you. Never close a
   dependency received through a slot; it is borrowed.
2. Name every entry and child scope. Names form the debt paths that Hosts
   alert on.
3. Everything a cleanup needs is a declared slot or the module's own resource.
   Hidden dependencies break the order; independent modules are ordered by
   implementation ID, not by intent.
4. Give a child scope only ports whose setup completed before the child was
   created. Never pass `Resources` of an ancestor or any `ScopeControl` down.
5. When subscribing to a provider, register the returned disposer in your own
   scope.
6. Running work is not a resource. Register dependencies, then the drain set,
   then the subscription, so release runs unsubscribe, drain, close; or make
   each operation a `child()`.
7. A domain shutdown protocol, such as retire, settle and delete in a fixed
   order, stays inside one cleanup. A scope orders independent entries; it
   does not replace an authority sequence.
8. A cleanup throws only when its resource may still be held. Its `escalate`
   signal asks for a faster release; it never permits skipping one.
9. `use()` releases bluntly: `Writable` is destroyed, `ChildProcess` only
   receives SIGTERM, `http.Server` waits for active requests. Use the README
   recipes that react to the escalation signal.
10. Wrap a thenable resource: `setup: () => ({ proc: execa(...) })`.
11. Domain and application code never sees `Resources`; only the composition or
    adapter layer of the module does. Only `scoped()` reads `FactoryContext.scope`;
    never cast it.
12. Never await `close()` of your own or an ancestor scope inside a cleanup.
13. A cleanup that must not run twice guards itself; the Host may retry.

Host template (policy belongs to the Host, not to the library):

    import { assemblyFor, declareModule, defineContract, type CapabilitiesOf, type ModuleFactory } from "@get-modular/assembly";
    import { required } from "@get-modular/core";
    import { scoped, type CloseReport, type ModuleContext, type Resources, type ScopeControl } from "@get-modular/resources";

    // Contract owners publish one descriptor per capability.
    export const Db = defineContract<DbPort>()({ id: "acme/db", revision: 1 });
    export const Orders = defineContract<OrdersPort>()({ id: "acme/orders", revision: 1 });

    // A module package: no wire literals, typed only by the contracts it uses.
    export const ordersDeclaration = declareModule({
      moduleId: "acme/orders", implementationId: "acme/orders/default",
      owner: { authority: "acme", path: ["orders"] },
      provides: [Orders.provide()], slots: [Db.slot("db", required())],
    });
    export const createOrders: ModuleFactory<
      CapabilitiesOf<typeof Db | typeof Orders>, typeof ordersDeclaration, Connection, ModuleContext
    > = async (deps, { resources }) => {
      const conn = await resources.setup({
        name: "conn",
        setup: ({ signal }) => connect(url, { signal }),
        cleanup: (c) => c.close(),
      });
      return { instance: conn, capabilities: { "acme/orders": createOrdersPort(deps.db, conn) } };
    };

    // The Host: policy belongs here, not in the library.
    export async function closeWithin(
      control: ScopeControl, graceMs: number, abandonMs: number,
    ): Promise<CloseReport> {
      const escalate = new AbortController();
      const abandon = new AbortController();
      // Referenced timers keep the process alive until the Host has a report.
      // Abandon ends only this wait: the scope keeps releasing in order.
      const toEscalate = setTimeout(() => { escalate.abort(); }, graceMs);
      const toAbandon = setTimeout(() => { abandon.abort(); }, graceMs + abandonMs);
      try {
        return await control.close({ escalate: escalate.signal, abandon: abandon.signal });
      } finally {
        clearTimeout(toEscalate);
        clearTimeout(toAbandon);
      }
    }

    const api = assemblyFor<CapabilitiesOf<typeof Db | typeof Orders>>();
    const database = api.bindFactory(declareModule({
      moduleId: "acme/db", implementationId: "acme/db/pg",
      owner: { authority: "acme", path: ["db"] }, provides: [Db.provide()], slots: [],
    }), async () => ({ instance: undefined, capabilities: { "acme/db": { query: () => 0 } } }));
    const orders = api.bindFactory(ordersDeclaration, scoped(ordersDeclaration.implementationId, createOrders));
    // Bind and prepare once; every run gets its own scope.
    const preparation = await api.prepare({ composition, factories: [database, orders], roots: { orders } });
    if (preparation.status === "failed") { throw new ConstructionFailed(preparation); }
    const { prepared } = preparation;

    export async function construct(host: Resources, signal: AbortSignal) {
      const attempt = host.child({ name: "attempt" });
      const outcome = await prepared.run({ signal, scope: attempt.resources });
      if (outcome.status !== "succeeded") { // run() has settled: no factory is running
        throw new ConstructionFailed(outcome, await closeWithin(attempt.control, 5_000, 5_000));
      }
      return { roots: outcome.roots, lifetime: attempt.control }; // transfer ownership with control
    }

Host rules:

- Wrap owning factories with `scoped(implementationId, factory)` and pass one
  scope per run: `run({ signal, scope: attempt.resources })`, never the `Scope`
  itself. Never capture a scope when binding factories. Close the attempt only
  after `run()` settles. Load exactly one copy of `@get-modular/resources` per
  Host.
- Pass construction cancellation to `run({ signal })`. `scoped()` stops a
  module's setups when it aborts, until the factory settles.
- Keep singletons shared across attempts in the Host scope.
- Use one deadline at the root: escalate first, then abandon, with referenced
  timers. Abandon never means released; the snapshot has `settled: false`,
  debts stay in the scope, and a later `close()` after the flight completed is
  an explicit retry.
- Release continues past a failed entry. When a cleanup may need a provider
  again on retry, such as an observation journal that owners write while they
  release, keep that provider in an outer scope and close the outer scope only
  after the inner report is complete.
- Use `child({ order: "concurrent" })` only for a scope whose entries are
  independent peers, such as sessions, turns or instances; everything else
  stays in reverse order.
- Drain or stop running work before closing the scope that holds its
  resources; deciding that work has stopped is Host policy.
- Transfer ownership by transferring `control`.
- A dynamic Host that uses the lifecycle kernel (candidate, ADR-0029) retains
  custody before `child()` and releases it only after the child's report is
  complete.

Out of scope: release order derived from the graph, reference-counted sharing,
durable recovery, dependency-loss health contracts, lifecycle hooks, plugin
managers and process or worker control.

### Module packages and contracts

[ADR-0032](../decisions/0032-give-assembly-an-authoring-builder-and-capability-scoped-handles.md)
gives Assembly the authoring builder.

- A contract owner publishes one descriptor per capability with
  `defineContract<Value>()({ id, revision })` and raises `revision` with every
  change of the value type.
- Declarations use `declareModule` with `Contract.provide()` and
  `Contract.slot(slotId, cardinality)`. Never write `kind`, `schemaVersion` or
  a `compatibility` literal by hand; the builder emits the current wire
  generation.
- A module package exports its declaration and either an unbound factory typed
  `ModuleFactory<CapabilitiesOf<its contracts>, typeof declaration, Instance, ModuleContext>`
  or handles bound with its own map. It never imports the Host's capability map.
- Name a map derived from many contracts as an interface:
  `interface HostCapabilities extends CapabilitiesOf<typeof A | typeof B> {}`.
  A type alias over hundreds of contracts multiplies check time and reaches
  TS2589 on TypeScript 5.8.3.
- A Host prepares with a map that contains every capability any handle uses,
  with the identical contract.
- Module packages list Get Modular packages only in `peerDependencies`, with a
  range of one 0.x minor such as `^0.3.0`. A Host installs one copy of each Get
  Modular package. Widen a range only when the release notes of the newer minor
  say that the authoring surface did not change.
- Identify errors by `code`, never by class or message:
  `assembly.<area>.<reason>`, `resources.<area>.<reason>` and
  `conformance.<area>.<reason>`. Core diagnostics carry their catalog codes in
  `Diagnostic.code`.
- A contract that may become the API of an isolated plugin is RPC-safe:
  asynchronous methods, plain data arguments and results, no callbacks and no
  object identity.
```

В файле стандарта код Host-шаблона оформляется fenced-блоком `ts`, выше он дан с отступом, чтобы не
ломать вложенный markdown плана. Плейсхолдеры (`DbPort`, `OrdersPort`, `Connection`, `connect`,
`createOrdersPort`, `url`, `composition`, `ConstructionFailed`) объявлены в тесте компиляции, как в
`impl-plan-v3/host-template.ts`. Путь ADR-0032 в ссылке — по фактическому slug, который создаст
`docs:new`.

### 9.2 Нормы CMS и README, которые 0.3.0 делает ложными (было → стало)

Строки по `common-assembly.md` на `9c722ce` (395 строк).

| Строки | Было | Стало |
|---|---|---|
| 7-12 | `related`: ADR-0023, ADR-0026, ADR-0029, … | + ADR-0030, ADR-0031, ADR-0032 |
| 20-21 | «Host supplies already selected and authorized factory functions and its capability types.» | «Host supplies already selected and authorized factory functions; capability types come from contract descriptors (ADR-0032).» |
| 24 | «One construction feature owns handles, preparation and sequential execution.» | «One construction feature owns handles, preparation, sequential execution and the authoring builder.» (запрет disposal остаётся: он про Assembly) |
| 46-47 | «Host owns permissions, resources, readiness and lifecycle.» | «Host owns permissions, readiness, lifecycle decisions and cleanup authority; modules register their own cleanup through the optional resources package.» |
| 88 | «Keep IDs and compatibility tokens in one local typed source.» | «Keep capability IDs and revisions in contract descriptors owned by the contract owner (ADR-0032); declarations reference descriptors and never spell compatibility.» |
| 120-122 | «…can demonstrate these races but cannot meet ADR-0028's two production ownership scopes or G1 public qualification.» (перенос строки после «cannot») | «…can demonstrate these races but cannot establish production adoption or G1 public qualification.» |
| 129-136 | таблица Use / Reject / Evidence | + строки: «Module resources through `setup`/`use` \| Host-written cleanup lists \| `packages/resources/tests/assembly-scope.test.mjs`»; «One scope per run through `scoped()` \| Parent scope captured at bind time \| same file, two concurrent runs»; «Declared run inputs \| Closures captured at bind time \| `tests/assembly/inputs.test.mjs`»; «Descriptors and `declareModule` \| Hand-written compatibility literals \| `tests/assembly/types.ts`» |
| 177-188 | «Executable examples»: только тесты Assembly | + тесты resources, рецепты README resources, `tests/assembly/builder.test.mjs`; каталога `examples/` у resources нет |
| 194-196 | «The consumer retains standard revision `669a750d` with complete-document byte SHA-256 `e6cd8d…`.» (устарело: AR пинит `9c722ce`/`33b41d5`) | «The consumer records its current standard pin in its own profile.» |
| 204-205 | «`assemblyFor<C>()` selects Host-owned capability value and exact compatibility identities at type level.» | «`assemblyFor<C>()` selects capability value and compatibility identities at type level; `C` is a Host map or a module's own map, usually derived with `CapabilitiesOf`.» |
| 216-219 | «`prepare({ composition, factories, roots })` … Handles must be unique and cover every selection exactly once.» | «`prepare({ composition, factories, roots, inputs })` accepts a successful Core result, the exact selected factory handles, an alias-to-root-handle mapping and an alias-to-input-handle mapping. Factory and input handles together are unique and cover every selection exactly once; an input handle appears only in `inputs` and is never a root.» |
| 221 | «`C` is invariant across handles.» | «A handle is invariant in the capabilities its declaration uses: preparation accepts it only when each of them has the identical value and compatibility type in the preparing map, and every capability any handle uses is part of that map.» |
| 226 | «Factories receive only their closed dependency record and `{ signal }`.» | «…and `{ signal, scope }`. `scope` is the value passed to `run()`; Assembly delivers it unchanged and never inspects, awaits, freezes or disposes it.» |
| 235 | «…capture the successful result, handle list and root map.» | «…handle list, root map and input map.» |
| 240 | «The local carrier ceiling for supported Core 0.1 is:» | «The local carrier ceiling for the supported Core pair is:» |
| 244-245 | «Root aliases are bounded to 128 UTF-8 bytes and 1024 entries.» | «Root and input aliases are each bounded to 128 UTF-8 bytes and 1024 entries.» |
| 266-267 | «`prepared.run({ signal })` is async… Exactly one invocation per selected implementation per attempt.» | «`prepared.run({ signal, scope, inputs })` is async… Every input is checked before the first factory. Exactly one invocation per selected non-input implementation per attempt; an input value is borrowed for the attempt.» |
| 293-297 | «failed with phase, stable code, …» | + «Phase `inputs` reports invalid run inputs before any factory call. Inputs never appear in created.» |
| 306-307 | «…belong to that factory or its Host-owned resource owner. Host defines cleanup policy.» | + «The optional resources package gives that owner an ordered mechanism; Assembly still performs no disposal.» |
| 364-367 | DoD: отказы типов | + «builder-generated declarations, fragment handles bound under different maps, rejection of unknown capabilities, and a 500-handle fragment fixture» |

`packages/assembly/README.md` (уходит в npm-архив; правится в GM-3b):

| Строки | Было | Стало |
|---|---|---|
| 11-15 | «`assemblyFor<C>()` returns `bindFactory` and `prepare`. Describe each Host-owned capability in `C` using `CapabilityContract<Value, ExactToken>`. Pass a literal Core declaration … receives that record and `{ signal }`» | «returns `bindFactory`, `bindInput` and `prepare`. Derive `C` with `CapabilitiesOf` from contract descriptors (`defineContract`) and write declarations with `declareModule`. The callback receives its dependency record and `{ signal, scope }`» |
| 23-26 | «`prepare({ composition, factories, roots: { app: appHandle } })`… exposes `prepared.run({ signal })`» | «`prepare({ composition, factories, roots, inputs })`… exposes `prepared.run({ signal, scope, inputs })`» |
| 55-57 | «Assembly 0.1.0 is published with exactly Core 0.1.0.» | «Each Assembly release is published with exactly the Core release of the same version.» |

Плюс `packages/assembly/examples/basic-host.mjs` (builder вместо `defineModule` и ручного
`compatibility`) и `docs/guides/consumer-quickstart.md`.

### 9.3 Раздел «Dynamic instances» (по `dynamic-modules-final-a` §3 и `-b` §4)

Около 80–100 строк нормативного текста; черновик проходит отдельное ревью до GM-6. Содержание:
- **Модель:** экземпляр = run подготовленного шаблона под своим scope со своими входами; замена =
  новый экземпляр, переключение указателя, закрытие старого; живой мутации нет.
- **Против мешка сервисов:** контекст фабрики `{ signal, scope }` закрыт; входы — узкие порты, а не
  реестр `get(key)`; больше ~8 входов — повод для ревью границы.
- **Входы и время жизни:** вход живёт не меньше экземпляра; roots не выходят за владельца, кроме как
  через фасад; фабрики ничего не захватывают на экземпляр.
- **Варианты тенантов (scale M2):** стабильная базовая заготовка; варианты — во вложенных шаблонах со
  входами или в runtime-реестре, выданном портом; ключ кэша Host = digest + идентичность набора
  фабрик (digest фабрики не покрывает); hub hooks — по одному на шаблон.
- **Рецепт замены с kernel** (кандидат): `activate`, смена route и `quiesce` в одном такте, дренаж
  по дедлайну Host, `retire`, close, `release(custody)` только при `complete`.

### 9.4 Миграция пинов потребителей (правило `AGENTS.md`)

До реализации пины AR (`9c722ce`/`33b41d5`) и TEST (`33b41d5`, sourceCommit `24d6557`) равны
upstream. После merge GM-6 оба пина устаревают. До TEST-1 и AR-1 это записано как незавершённая
работа, adoption поезда остаётся pending. Миграция одна на поезд (10.2 и 11); в AR она идёт через
общую проверку пина из AR-0.

---

## 10. Agent Runtime

Все пути ниже — на `origin/main` `b0bcb265`. Ветки только от свежего `origin/main`: локальный checkout
отстаёт.

### 10.1 AR-0: гейты без удаления кода (решение владельца 3)

Правило: код гейта не удаляется. Если гейт тормозит или блокирует миграцию, его выводят из триггеров
или из `check` и оставляют рядом короткий комментарий: почему выключен и при каком условии
возвращается. Аддитивные замены разрешены. Факты — `ar-gates-review.md`; перепроверены: обязательные
проверки `main` (`check`, `docs-protocol / docs-protocol-check`, `postgres-durability`, через
`gh api`), триггеры `ar-c0.yml` и `adoption-receipt-linux.yml`, шаг fetch в `ci.yml:50-78`, места пина
CMS, AST-проверка `ordinary-composition-evidence.mjs:61-81`.

| Шаг | Что делаем | Что остаётся в репозитории | Когда вернуть |
|---|---|---|---|
| AR-0a C0 | `.github/workflows/ar-c0.yml`: `on:` → только `workflow_dispatch:` плюс комментарий | `validate-ar-c0*.mjs`, тест, `architecture/c0/**` без изменений | только новым решением AR, которое снова делает C0 активным контрактом; проверка не обязательная, ruleset не меняется |
| AR-0b L0 | из `check` и `check:fast` (`package.json:13,15`) убрать `pnpm architecture:runtime-setup-l0-evidence &&`; сам скрипт остаётся и запускается вручную. Комментарий — в шапке `scripts/architecture/runtime-setup-l0-evidence.mjs` и в `docs/architecture/get-modular-adoption.md` (JSON комментариев не допускает). `adoption-receipt-linux.yml`: список веток push → `workflow_dispatch:` с комментарием. `ci.yml`: шаг «Fetch exact retained evidence commits» закомментировать с той же пометкой (он нужен только L0 и C0: проверено поиском по `scripts/`) | все скрипты и отчёты L0 v1/v2 | если macOS-job пропустит Darwin-регрессию, которую поймала бы квитанция, или если появится дешёвый способ снимать квитанции без коммита 4,9 МБ |
| AR-0b+ | новый job `embedded-runtime-macos` в `ci.yml`: `runs-on: macos-15`, `pnpm install --frozen-lockfile`, `pnpm --filter @agent-teams/embedded-runtime check` на `pull_request` и push в `main` (у пакета есть `check`, проверено; нужна ли перед ним сборка зависимостей `pnpm --filter "@agent-teams/embedded-runtime..." build`, покажет первый прогон — не проверено) | — | — (аддитивно; обязательность — вопрос 16.4) |
| AR-0c пин CMS | новый `scripts/architecture/check-cms-pin.mjs` (+ тест): `sha256(evidence) == profile.standard.sha256`, `review.after == profile.standard`, `sha256(delta) == review.delta`, пины двух профилей совпадают. Вызов из `architecture:consumer-modules`. Вызовы `validateStandardMigration` в `check-consumer-module-standard.mjs` и `check-sdk-growth-profile.mjs:112-129` закомментировать с пометкой вместе с их импортами (иначе lint AR отметит неиспользуемое); `EXPECTED_PROFILE.authority.consumerModuleStandard` (`check-consumer-module-standard.mjs:35-36`) читать из профиля, уже проверенного общей проверкой | `consumer-module-standard-pin.mjs` и константы цепочки | если понадобится доказывать всю историю пинов, а не текущий шаг (историю хранит git) |

Остальная заморозка SDK-growth AR снимается отдельно (её разрешено заменить); AR-1 она, по
ar-gates-review, не блокирует (не проверено). Если заблокирует — тот же приём: выключить конкретный
assert комментарием.

Оценка AR-0: +120…200/−20…60 строк (включая закомментированные строки как изменённые; macOS-job
около 25 строк, общая проверка пина с тестом около 100). Раньше: +500…900. Это оценка, не замер.

Риск: пропадает закоммиченное доказательство прогона на Darwin; логи CI хранятся 90 дней.

### 10.2 AR-1: версии, пакет, ordinary host

**Получение пакета.** До R-1b — черновая ветка (8.9). После R-1b:
- catalog `0.3.0`/`0.3.0`/`0.1.0`, lock; `@get-modular/resources` в `dependencies`
  `packages/apps/embedded-runtime/package.json` (экспорты пакета не меняются: FMS checker AR
  разрешает только `.` и `./composition`, `scripts/architecture/feature-module-profile.mjs:59`, и
  ADR-0017; ни один шаг плана не добавляет `./host`, R14);
- архивы в `architecture/get-modular/evidence/`;
- `consumer-profile.json` `packages` и enum в `consumer-profile.schema.json:137`;
- точная пара → точная тройка в `scripts/architecture/check-get-modular-adoption.mjs:31` и его тесте;
- жёсткие `0.1.0` (`packages/apps/embedded-runtime/tests/package/assembly-packed-consumer.test.ts:48,93,129,278,287`,
  `check-get-modular-adoption.test.mjs:38`) читают версии из `consumer-profile.json` `packages` (единый
  источник; ar-gates-review §5);
- шаг пина CMS — через общую проверку AR-0c;
- локальный ADR AR через `pnpm docs:new`: «Adopt Get Modular 0.3.0 train for ordinary-session cleanup».

**AST-проверка владельца.** `verifyOrdinaryHostOwnership` (`scripts/architecture/ordinary-composition-evidence.mjs:61-81`)
требует передачи `ordinaryOwner` и после миграции падает. Её вызов комментируется с пометкой
«заменена тестом порядка dispose 10.6; вернуть, если тест удалят»; функция остаётся.
`verifyOrdinaryGraph` остаётся включённой до AR-1b.

**Без входов.** AR-1 не переходит на prepare-once с `inputs`: compile/bind/prepare на попытку
остаётся (выигрыш ~2 мс CPU на Host).

### 10.3 Что исправляется (найденные дефекты)

| Место (`packages/apps/embedded-runtime/src/…`) | Сейчас | После |
|---|---|---|
| `features/ordinary-session-runtime/composition/ordinary-agent-runtime-host.ts:60` | обратный обход `cleanups` с `break` на первой ошибке | продолжение после ошибки (Q1) внутри scope владельцев; журнал во внешнем scope; долг с путём; повтор явным закрытием |
| `features/darwin-contained-turn-deployment/adapters/darwin-contained-turn-deployment.ts:88-93` | продолжает после ошибки и не повторяет: в одном пакете две политики | одна семантика scope (если AR-2 = Darwin) |
| `composition/agent-runtime-host-disposal.ts:331-358` | Host без ordinary-owner навсегда кэширует отказ; для ordinary сброс позволяет второй `#finishDisposal`, пока первый идёт | один полёт, пока идёт; новый только после завершения |
| `composition/agent-runtime-host-creation-error.ts:105-112,147-158` | восстановление ручной цепочкой замыканий | `recover()` = повторное закрытие одного дерева |

### 10.4 Порядок, журнал и миграция ordinary host

Реальный Core дал `dependencyOrder`:

```text
ordinary/artifacts, ordinary/provider, ordinary/process, ordinary/security,
ordinary/provider-access, ordinary/store, ordinary/workspace, ordinary/turn,
agent-runtime/runtime-host
```

С `scoped()` освобождение идёт так: runtime-host → turn → provider-access owner → security owner →
codex, и только потом журнал. Тот же относительный порядок, что у сегодняшнего `cleanups`, где журнал
зарегистрирован первым (`:56`) и закрывается последним.

**Стоп или продолжение (R12).** Сегодня первая ошибка останавливает cleanup, и журнал остаётся открытым
до повтора. resources продолжает (Q1). PA при dispose гасит auth capture, а capture пишет наблюдения
через `record` в журнал (`features/ordinary-session-runtime/adapters/ordinary-owner-acl.ts:21`,
`packages/contexts/provider-access/src/features/contained-turn-access/adapters/outbound/ordinary-codex-auth-capture.ts:30-37`).
Если бы журнал лежал в том же scope, при сбое PA он закрылся бы следом, и повтор PA упирался бы в
закрытый журнал навсегда. Поэтому журнал — во внешнем scope, владельцы — во внутреннем, и Host
закрывает внешний только после `complete` внутреннего (ответ Б: политика у Host). Между владельцами
продолжение после ошибки безопасно: dispose PA не вызывает security и codex (проверено по
`ordinary-provider-access-owner.ts:178-187`).

**Доменная последовательность.** Settlement в engine и `retire` grant в PA — последовательности
authority, а не LIFO. Они остаются внутри одного cleanup своего модуля (`turn`: `setup: () =>
createOrdinaryTurnFeature(…)`, `cleanup: f => f.dispose()`), правило CMS 7.

```ts
// features/ordinary-session-runtime/composition/ordinary-agent-runtime-host.ts (эскиз)
const host = createScope({ name: "ordinary-host" });
host.resources.use({ [Symbol.dispose]: () => journal.close() }, "journal");     // внешний scope: только журнал
const owners = host.resources.child({ name: "owners" });                        // всё, что пишет в журнал при освобождении
const closeHost = async (): Promise<CloseReport> => {
  const inner = await owners.control.close();                                   // повтор = снова этот вызов
  return inner.complete ? host.control.close() : inner;                         // журнал жив, пока долг владельцев не погашен
};
try {
  const runtime = await construct(options.signal, {
    scope: owners.resources,                                                    // уходит в prepared.run({ signal, scope })
    factories: {
      async security(resources) {
        const owner = await resources.setup({ name: "security-owner",
          setup: () => createOrdinarySecurityOwner({ /* как сейчас */ }), cleanup: o => o.dispose() });
        await owner.migrate();                                                  // сбой migrate оставляет owner на учёте
        return { port: bindOrdinarySecurityOwner(owner), registerSecrets: (id, t) => owner.registerSecrets(id, t) };
      },
      async providerAccess(registerSecrets, resources) { /* тот же шаблон, "provider-access-owner" */ },
      async provider(resources) {
        const codex = createOrdinaryCodexAdapter({ /* как сейчас */ });
        resources.use({ [Symbol.dispose]: () => codex.dispose() }, "codex");
        return codex;
      },
    },
  });
  return withLifetime(runtime, closeHost);                                      // dispose: дренаж Host, затем closeHost
} catch (error) {
  const report = await closeHost();
  if (report.complete) throw error;
  throw asCreationError(error).withCleanupFailure(new CloseIncompleteError(report), async () => {
    const retry = await closeHost();
    if (!retry.complete) throw new CloseIncompleteError(retry);
  });
}
```

По файлам:
- **`features/ordinary-session-runtime/composition/ordinary-runtime-assembly.ts`:** владеющие
  `bindFactory` (security, provider-access, provider, turn) обёрнуты в
  `scoped(decl.implementationId, …)`, pure-фабрики не трогаем; `turn` регистрирует feature одной
  записью.
- **`composition/default-agent-runtime-host.ts`:** `prepared.run({ signal, scope })` (сейчас `:62`);
  сырой Host — запись `runtime-host`; захват `ownedHost` (`:54,69,79-87`) и ручной
  `withCleanupFailure` уходят.
- **`composition/agent-runtime-host-creation-error.ts`:** `recover = () => running ??=
  closeOrThrow().finally(() => { running = undefined; })` — повторный `recover()` во время полёта
  возвращает тот же Promise.
- **`composition/agent-runtime-host-disposal.ts`:** `disposeOrdinaryOwner` убирается; `dispose()`
  остаётся дренажом работы с правилом «один полёт, пока идёт»; если дренаж не доказал завершение
  (`termination_unproven`), Host **не начинает** закрытие scope (решение Б).
- **Коды ошибок AR** сохраняются проекцией: `AggregateError(причины failed, "<код>", { cause })`;
  коды resources сравниваются по `code`.

### 10.5 AR-1b: декларации AR на builder (после R-1b, до поезда 2)

- Дескриптор на каждый контракт (`defineContract`), отдельные id/revision вместо одного token на
  восемь контрактов; декларации через `declareModule`; карты `RuntimeSetupCapabilities` и ordinary —
  `interface … extends CapabilitiesOf<…> {}`; фича больше не импортирует карту Host
  (`ordinary-runtime-assembly.ts:4` → карта своих контрактов или `ModuleFactory`), цикл «фича → корень
  композиции» уходит.
- `verifyOrdinaryGraph` читает литералы деклараций (`ordinary-composition-evidence.mjs:22-60`:
  идентификатор `compatibility` и token `agent-runtime/ordinary-v1`, `:38,43-46,51`). Эти проверки комментируются с пометкой и заменяются
  runtime-тестом: настоящий Core компилирует ordinary-граф, ожидаемые bindings сравниваются с
  независимым списком.
- Оценка +250…400/−200…300.

### 10.6 AR-2: второй реальный scope

Darwin deployment — путь contained-turn: в AR он классифицирован как legacy (`legacyBoundaries` в
`architecture/consumer-module-standard/contained-turn-profile.json`), ADR-0016 в статусе `proposed`
(«pending its legacy scope», ADR-0090). Доказывать на нём «два материально разных scope» слабо: код
может уйти раньше, чем окупится миграция.

**Рекомендую per-grant scope в PA на живом ordinary-пути** (вопрос 16.1):
- `packages/contexts/provider-access/src/features/contained-turn-access/composition/ordinary-provider-access-owner.ts`
  держит `grants: Set` (до 64 одновременно) и в `dispose()` вручную делает `Promise.allSettled` по
  `grant.retire()` (`:178-187`).
- Замена: `grantScopes = createScope({ name: "pa-grants", order: "concurrent" })`; на каждый grant
  `child({ name: "grant:<grantId>" })` с одной записью `{ [Symbol.asyncDispose]: () => grant.retire() }`;
  после retire и settle — `close()` ребёнка; `dispose()` закрывает `grantScopes` и проецирует долг в
  `ORDINARY_PA_UNAVAILABLE`.
- Внутри `retire` доменная последовательность (закрыть broker, стереть секреты, `store.retire`) не
  меняется.
- Чем отличается от scope Host: время жизни операции, а не Host; дети создаются и закрываются во время
  работы; `order: "concurrent"`; владелец — контекст PA, а не приложение.
- Цена: +200…400/−40…80 и новое ребро `@agent-teams/provider-access` → `@get-modular/resources` в
  слое composition (профили зависимостей). Если ребро упрётся в заморозку SDK-growth AR — выключить
  конкретный assert комментарием, как в 10.1.

Darwin остаётся вариантом после решения AR по ADR-0016 (эскиз из редакции 2 действителен: child на
сессию в `sessions` с `order: "concurrent"`, async `dispose` по решению В).

### 10.7 Тесты AR (каждый ловит конкретную регрессию)

- порядок dispose `[runtime-host, turn, provider-access-owner, security-owner, codex, journal]`;
- PA-owner бросает: security и codex освобождены, журнал **открыт**, повторный `closeHost()` повторяет
  только PA и закрывает журнал (регрессия «журнал в том же scope»);
- два одновременных `dispose()` и третий во время дедлайна не запускают второй дренаж;
- AR-2 (PA): 64 grant закрываются одновременно, сбой retire одного grant виден долгом
  `pa-grants/grant:<id>/retire`, остальные освобождены.

Гейты: `pnpm check:changed`, `pnpm check:fast`, `pnpm check` (adoption, consumer-modules с общей
проверкой пина, typecheck, test, `product:check`), job `embedded-runtime-macos`.

---

## 11. TEST (`modularity-host-TEST`): TEST-1 на архивах R-1a

Содержание (`tests/train-030/*.mjs`; `.mjs`, а не `.ts`: `tsconfig.json` включает `tests/**/*.ts`):

1. **Установка из retained-архивов R-1a** (Core 0.3.0, Assembly 0.3.0, resources 0.1.0) во временный
   consumer вне репозитория. Сейчас `TMPDIR` раннера лежит внутри репо (`run.mjs:12,66`), и
   недостающая зависимость молча нашлась бы в Core 0.1.
2. **Один prepared-шаблон, 1 000 сессий** со своими `scope` и `inputs`, декларации через builder:
   закрытие сессии k освобождает только её записи; сбой на модуле k закрывает k..1; журнал пишется в
   файл независимо от библиотеки.
3. **Host-шаблон `closeWithin` в подпроцессе:** зависший cleanup, escalate, затем abandon. Процесс
   печатает отчёт (`settled: false`) и выходит с кодом 1, а не тихо с 0 раньше дедлайна.
4. **Рецепт группы процессов из README (только POSIX):** лидер и внук, SIGTERM группе, по escalate
   SIGKILL; независимая проверка `process.kill(-pgid, 0)` → `ESRCH`.

Исправления раннера: свой диапазон индексов (`trainStartIndex`) и сопоставление файла в
`run.mjs:265-284`; ветка `checkPins()` для тройки 0.3.0 (`run.mjs:100-117`); строки
`!third_party/archives/train-0.3/*.tgz` в `.gitignore`; байты архивов из записи намерения R-1a.

Пин CMS: дельта `24d6557..<merge GM-6>` в `docs/train-030-01.md`, новые байты в
`third_party/standards/`, `pins.json`.

Гейты: `pnpm typecheck`, `pnpm test`, `pnpm evidence`. `lifetime.ts` (1 035 строк) не переписывается.

---

## 12. Последовательность и объём

| # | Шаг | Содержание | LOC (+/−) | Зависит от |
|---|---|---|---|---|
| 1 | GM-1 | обобщение допуска leaf-пакетов | +300 / −250 | — |
| 2 | GM-2 | ADR-0030/0031/0032, supersession ADR-0028, реестр, тест ownership, запись resources | +480 / −25 | GM-1 |
| 3 | GM-3a | Assembly: scope, inputs, `bindInput`; допуск 0.3.0; changeset; approval; `sdk-growth:181`; dry-run №1 | +550 / −80 | GM-2 |
| 4 | GM-3b | Assembly: builder, capability-scoped handles, `ModuleFactory`; examples, README; фикстура 500 handles; dry-run №2 | +500 / −70 | GM-3a |
| 5 | GM-4 | resources (src ~600, тесты ~800, README ~170, wiring ~130) | +1 700 / −20 | GM-3b |
| 6 | GM-5 | conformance, отдельный план и ADR-0033; позже `checkNamespaces` (+80) | +600…900 | GM-4 |
| 7 | GM-6 | CMS: ресурсы, модульные пакеты, Dynamic instances, таблица 9.2; quickstart; пины | +380 / −60 | GM-4 |
| 8 | REL | dry-run №3, release-PR changesets и promote baseline | генерируется | GM-6 |
| 9 | R-1a | pack, хеши, запись намерения | запись ~150 | REL |
| 10 | TEST-1 | тесты поезда на архивах R-1a, runner, пины | +480 | R-1a |
| 11 | AR draft | черновая ветка AR на архивах R-1a (не мёржится) | — | R-1a |
| 12 | R-1b | загрузка Core → Assembly → resources, `latest` после всех | — | TEST-1, AR draft, Node 26.10, ревью владельца |
| 13 | AR-0 | гейты без удаления: C0/L0 выключены, macOS-job, общая проверка пина | +120…200 / −20…60 | — |
| 14 | AR-1 | 0.3.0/0.3.0/0.1.0, resources, ordinary host с внешним scope журнала, AST owner выключен, версии из профиля, пин CMS | +1 000…1 600 / −300…500 | R-1b, AR-0 |
| 15 | AR-1b | декларации AR на builder | +250…400 / −200…300 | AR-1 |
| 16 | AR-2 | второй scope: per-grant PA (рекомендую) или Darwin после ADR-0016 | +200…400 / −40…80 | AR-1, вопрос 16.1 |

GM-1 и AR-0 можно начинать сразу; GM-5 идёт параллельно основной линии.

**Итого без conformance, архивов и копий LICENSE/стандарта:**

| Часть | Строк (+) |
|---|---|
| GM | ~3 900 |
| TEST | ~480 |
| AR | ~1 600–2 600 |
| **Всего** | **~6 000–7 000** |

Почему иначе, чем в редакции 2 (5 800–7 300): GM вырос на builder и фрагменты (+~500) и честный
размер resources (~600 строк кода в стиле lint GM вместо ~400); AR подешевел на AR-0 (−~500) и на
отсутствие L0-квитанций в AR-1. Ориентир: lifecycle-kernel стоил около 1 970 строк в GM.

---

## 13. Поезд 2: ADR до кода

Поезд 2 (Core/Assembly 0.4.0) — единственное оплаченное поколение wire: ADR-0021 потребовал 941 рецепт
и ledger на 30 артефактов, а новый код диагностики ломает полные карты перевода у Host (ADR-0009).
Поэтому ADR поезда 2 пишется до кода и закрывает всё известное одним поколением.

### 13.1 Что решает ADR поезда 2

| Тема | Решение по умолчанию (рекомендация) | Надёжность | Уверенность |
|---|---|---|---|
| Ревизии в wire | `compatibility { revision, compatibleFrom }` вместо token; привязка разрешена при `compatibleFrom <= slot.revision <= provider.revision` (решение владельца 1 от 2026-10-01); `compatibleFrom` — необязательное поле дескриптора, по умолчанию `revision` | 8/10 | 7/10 |
| Типы по ревизиям | дескриптор — линия ревизий (`defineContract<{ 2: V2; 3: V3 }>()`); `FactoryDependencies` берёт тип по ревизии slot'а; `FactoryCapabilities` требует значение, удовлетворяющее всем ревизиям окна; `ValidDeclaration` сравнивает id и тип значения, диапазон проверяет Core (иначе совместимый slot старой ревизии не скомпилируется, scale H1, проверено `deep-scale/e4`) | 7/10 | 6/10 |
| Адаптер | модуль со slot X@новая и provides X@старая разрешён (Core уже принимает, `deep-scale/e3`) и описан в CMS — единственное окно миграции без `/v2` | 7/10 | 7/10 |
| Декодер N-1 | Core 0.4 принимает декларации `schemaVersion: 1` один minor и переводит их во внутреннюю модель; план всегда в новой схеме | 7/10 | 6/10 |
| Пометка входов в плане Core | **никогда**, пока не появится потребитель: входы — привязки Assembly, Core видит модуль без slots. Альтернативы: флаг в selection профиля (7/6), отдельный `kind` декларации (6/6) | 8/10 | 7/10 |
| `owner.authority` | остаётся навигационной меткой; правило «равно корню пространства имён `moduleId`» проверяет `checkNamespaces` в conformance, не Core | 7/10 | 6/10 |
| Коды ревизий | прежний `binding.compatibility-mismatch` с новыми `details` (карты перевода Host не ломаются); альтернатива — новые коды (6/7) | 8/10 | 7/10 |
| Ревизия входа | равна ревизии slot'а родителя, который передаёт порт | 7/10 | 6/10 |
| Тесты | `runContractSuite` гоняет набор каждой ревизии окна (conformance) | 8/10 | 7/10 |

`checkNamespaces` в поезд 2 не входит: он уходит в conformance (8.6) и от wire не зависит.

### 13.2 Ревизия slot'а должна фиксироваться при сборке потребителя (новая находка)

`Db.slot("db", …)` берёт ревизию из объекта дескриптора во время работы (`impl-plan-v3/asm/src/features/construction/contract.ts`,
так же в `deep-api/contract.ts`). Если пакет контракта у Host один, slot потребителя, собранного под
ревизию 2, во время работы заявит ревизию Host (3). Проверка окна Core тогда всегда проходит, и защита
от несовместимого плагина без общей TS-проверки исчезает. В поезде 1 это не мешает: token сравнивается
точно, а все модули одного Host собираются вместе. Но ADR поезда 2 обязан выбрать способ (вопрос 16.3):
- пакет контракта — обычная зависимость модульного пакета (несколько копий допустимы: Core сравнивает
  строки id), а подъём `compatibleFrom` — новый minor пакета контракта на 0.x, чтобы npm не склеил копии;
- явная ревизия в вызове: `Db.slot("db", required(), { builtAgainst: 2 })`, тип сверяет литерал с
  известными ревизиями;
- генерация деклараций при сборке пакета (codegen).

### 13.3 Порядок

ADR поезда 2 → прототип типов по ревизиям и декодера N-1 → PR Core/Assembly → release dry-run →
публикация. Сотни деклараций не переписываются, если авторы перешли на builder в поезде 1 (AR-1b для AR).

---

## 14. Риски

- **Публикация необратима.** Смягчение: три release dry-run (GM-3a, GM-3b, перед REL), TEST-1 и
  черновая ветка AR на тех же архивах до загрузки; на 0.x правка API выходит minor-релизом.
- **Builder без потребителей на момент релиза.** Его проверяют только TEST-1 и AR-1b после R-1b.
  Ошибка формы API — minor-релиз 0.4 вместе с поездом 2.
- **Сверхлинейная проверка типов.** На 1000 handles ~3 с (tsc7) и ~8–9 с (5.8.3) во всех формах,
  включая нынешний способ; карта-`type` над сотнями контрактов — 4,4 с и TS2589 на 500; в вырожденной
  фикстуре GM бренд по используемым capability дороже на 45–55%. Защищают правило CMS про
  `interface`, деление корня композиции на подсистемы и профилирование в GM-3b.
- **Частичная замена ADR-0009 прозой.** ADR-0009 не меняет статус; читатель должен найти «Precedence»
  ADR-0032. Записано в `related` и в CMS.
- **resources вне гейта публичного API EF**, пока G1 на паузе: ломающее изменение resources не
  поймает `foundation:check`. Защищают changeset `minor` и ревью; зачисление — после снятия заморозки
  SDK-growth.
- **`inputs` выходит раньше production-потребителя** с высокой частотой экземпляров. Проверка только в
  TEST (1 000 сессий); AR переходит позже.
- **Время жизни входа типами не проверяется.** Защищают правило CMS и паттерн «экземпляры в scope
  владельца».
- **Фабрика без обёртки может привести `ctx.scope` к `Resources`.** Защищают правило CMS и ревью.
- **Зависший cleanup** блокирует остаток своего scope и предков до выхода процесса.
- **Q2-повтор** опасен для cleanup, которые нельзя вызывать дважды (правило 13); провайдер, нужный
  повтору, должен жить во внешнем scope (правило Host).
- **`use()` после начала закрытия отдаёт значение обратно автору** (Q14).
- **Две копии пакета у одного Host** дают отказ `scoped()` по бренду; peer-зависимости переносят отказ
  на установку.
- **Каскад правки CMS** (ownership-тест, `sdk-growth`, пины двух потребителей) сведён к одной ревизии.
- **Незакоммиченная правка `AGENTS.md` в рабочей копии GM.** Работать только в отдельном worktree.
- **Рецепт группы процессов есть только для POSIX.**
- **AR без закоммиченных квитанций Darwin** после AR-0; macOS-job необязательна, пока владелец не
  включит её в ruleset (вопрос 16.4).
- **Второй scope AR** зависит от вопроса 16.1; без него ADR-0030 доказан одним production-scope и TEST.
- **Не проверено:** поведение registry с `latest` при первой загрузке нового имени; Node 26.10+
  локально; `pnpm lint:typed` внутри GM на коде прототипа; fingerprint EF v1 (только на ветке).

## 15. Не входит в поставку

- health-контракт потери зависимости (Q9);
- изоляция и супервизия недоверенных плагинов (Q10, только правило);
- порядок освобождения из графа; refcount; dev-стеки регистрации;
- переход AR на prepare-once с `inputs`;
- хук конца сессии Darwin;
- поезд 2 (раздел 13 — только его ADR-рамка);
- `checkNamespaces` (conformance, следующий minor);
- матрица каналов ошибок с `@get-modular/observation`;
- переписывание `lifetime.ts` в TEST;
- правка `system-boundary.md`.

---

## 16. Оставшиеся вопросы владельцу

**Ответы владельца (2026-10-02, после редакции 3):** 16.1 — второй реальный scope AR: per-grant scope
в PA на живом ordinary-пути (AR-2); 16.2 — каталог диагностик Core не трогаем, `core.<область>.<причина>`
только для будущих брошенных ошибок Core; 16.3 — ревизия, под которую собран потребитель, фиксируется
версией пакета контракта (обычная зависимость модульного пакета, подъём `compatibleFrom` = новый minor
пакета контракта), детали — в ADR поезда 2; 16.4 — macOS-job AR становится обязательной после недели
зелёных прогонов на `main`.

Закрыто ответами 2026-10-02: 15.1 (`use()` после закрытия — Q14), 15.2 (гейты AR — решение 3,
раздел 10.1), 15.3 (поезд 1 после TEST-1 и черновой ветки AR; Darwin после ADR-0016 — уточняется
вопросом 16.1).

**16.1. Второй реальный scope в AR.** Darwin оказался legacy contained path (ADR-0016 proposed).

| Вариант | Надёжность | Уверенность |
|---|---|---|
| **(Рекомендую)** per-grant scope в PA на живом ordinary-пути (AR-2, 10.6): динамические дети, `order: "concurrent"`, доменный `retire` внутри одной записи | 7/10 | 7/10 |
| Darwin после решения AR по ADR-0016, как в редакции 2 | 6/10 | 7/10 |
| пока только ordinary host и TEST; второй scope — с первым динамическим потребителем (сессии через `inputs`) | 6/10 | 8/10 |

**16.2. Коды Core.** Решение 4 называет `core.*`, но ожидаемые сбои Core — диагностики с замороженными
кодами каталога, а брошенные ошибки Core сегодня — только внутренние нарушения инвариантов.

| Вариант | Надёжность | Уверенность |
|---|---|---|
| **(Рекомендую)** диагностики Core сохраняют коды каталога; `core.<область>.<причина>` — только для будущих брошенных ошибок Core; CMS это говорит прямо | 9/10 | 8/10 |
| переименовать коды каталога в `core.*` в поезде 2 (новое поколение диагностики, поломка полных карт перевода у всех Host) | 6/10 | 7/10 |
| поле-алиас с префиксом рядом со старым кодом | 5/10 | 6/10 (ADR-0009 запрещает алиасы) |

**16.3. Как поезд 2 фиксирует ревизию slot'а при сборке потребителя** (13.2). Решать в ADR поезда 2, но
выбор влияет на правила пакетов контрактов уже сейчас.

| Вариант | Надёжность | Уверенность |
|---|---|---|
| **(Рекомендую)** пакет контракта — обычная зависимость модульного пакета (несколько копий допустимы), подъём `compatibleFrom` — новый minor пакета контракта | 7/10 | 6/10 |
| явная ревизия сборки в `slot(…, { builtAgainst })`, проверка литерала типами | 7/10 | 6/10 |
| генерация деклараций при сборке пакета | 6/10 | 5/10 |

**16.4. Делать ли macOS-job AR обязательной проверкой `main`.**

| Вариант | Надёжность | Уверенность |
|---|---|---|
| **(Рекомендую)** да, после недели зелёных прогонов на `main` (ruleset меняет владелец AR) | 8/10 | 7/10 |
| сразу обязательной вместе с AR-0 | 7/10 | 7/10 (флап macOS-раннера блокирует merge) |
| оставить необязательной | 6/10 | 8/10 (Darwin-регрессия проходит в `main`) |
