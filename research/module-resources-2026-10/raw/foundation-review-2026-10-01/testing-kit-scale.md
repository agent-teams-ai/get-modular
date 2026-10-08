# Стандартный набор для тестирования модулей: проверка масштабом

Дата: 2026-10-01. Ревизии: get-modular `9c722ce`, agent-runtime `origin/main b0bcb265`,
agent-teams-platform `origin/main a3ce96e`, org `.github origin/main 3fe0f13`, modularity-host-TEST `fcc10b2`.
Опыты: Node v26.9.0, `tsc7` 7.0.2 и TS 5.8.3, только scratchpad.

## 1. Текущее состояние (проверенные факты)

- **Типы для фейков уже есть.** `FactoryDependencies<C, D>` и `FactoryCapabilities<C, D>` экспортированы
  (`packages/assembly/src/features/construction/types.ts:50-67`, `src/index.ts`). Опыт: фейк, типизированный
  `FactoryDependencies<C, typeof decl>`, отклоняется при переименованном методе (TS2353) и пропущенном slot (TS2741),
  а `{} as never` проходит молча.
- **Фабрики часто нельзя протестировать отдельно:** в эталоне они замыкания внутри Host (`packages/assembly/examples/basic-host.mjs:92-113`).
  AR выносит их в интерфейс `OrdinaryRuntimeFactories` (`ordinary-runtime-assembly.ts:53-61`).
- **Шаблон suite уже есть в GM:** `runSemanticSuite(createLifecycleKernel, context)` (`packages/lifecycle-kernel/tests/semantic-suite.mjs:9`)
  прогоняется и на исходниках, и на упакованном tarball (`packed-root.test.mjs:56-62`), но лежит в `tests/` и не публикуется.
- **Имя уже зарезервировано:** ADR-0003 вводит dev-only `@get-modular/conformance` для «fixtures, executable vectors,
  packed-consumer checks, and adapter qualification» (`0003-…md:35-37`) и отвергает «conformance subpath exports» (`:66-67`).
  Пакет «must not calculate expected values by calling the implementation under test» (ADR-0006:174-177).
- **CMS требует независимый oracle связывания** (`common-assembly.md:136`, `:170-171`, `:186-188`). В AR это 402 строки
  ручной эталонной сборки (`tests/helpers/assembly-direct-reference.ts:35-37`) и 836 строк тестов одного корня из 8 capability
  (`runtime-setup-assembly.test.ts`; `runtime-setup-assembly.ts:36-43`), плюс ручные таблицы и мутанты (`ordinary-runtime-assembly.test.ts:13-24`).
- **Дрейф фейков:** в тестах AR 638 строк с `as never` в 157 из 709 файлов, например вся запись зависимостей
  (`contained-turn-provider-access-integration.test.ts:449,545`). Файл `dispatch-consumption-repository.conformance.ts` только
  проверяет типы (33 строки), а PG-тест держит фейк на префиксах SQL: «Scripted SQL boundary, not a PostgreSQL emulator»
  (`postgres-dispatch-contract.test.ts:16`). В Platform фейки — классы `implements Port` (`model-conformance-subject.ts:19,40`):
  типы синхронизированы, поведение не проверяется.
- **Один token на весь граф:** `agent-runtime/setup-v1` для 8 capability (`runtime-setup-assembly.ts:34`) и `agent-runtime/ordinary-v1`
  для 10 (`ordinary-runtime-assembly.ts:7`). Core громко отклоняет несовпадение (`binding.compatibility-mismatch`,
  `diagnostic-types.ts:34`), но только если token подняли. ADR-0009:77-79: token — семантическая идентичность продукта.
- **Утечки никто не ловит:** `getActiveResourcesInfo` не встречается ни в одном репозитории. AR запускает тесты
  последовательно по ручным спискам (`scripts/run-package-tests.mjs:7-11`).
- **Типы под масштабом.** В GM 1000 деклараций без slots и с одной capability (`tests/assembly/type-scale.mjs:2-10`).
  Опыт: N модулей по 3 slots, `C` из N capability. TS 7.0.2: 0,55 с при N=500 и 1,29 с при N=1000. TS 5.8.3: 1,86 с и 4,87 с.
- **Дизайн ресурсов** предлагает «один общий прогон собрать → закрыть → отчёт complete» (`module-resource-scopes-design-2026-10-01.md:296-297`).

## 2. Сценарии роста: где ломается

| Сценарий (3 года) | Сегодня | Наивный kit | Что выдерживает |
|---|---|---|---|
| 500 модулей, 20 команд, 5 репозиториев | oracle растёт линейно (оценка: 402/8 ≈ 50 строк на capability, ~25 тыс. строк на 500) | oracle генерируется из профиля: нарушение EQS:117-120 | ручная таблица только для **неоднозначных** slots (≥2 выбранных провайдера capability), остальное вынуждено Core |
| 6 реализаций, правка контракта ломает 3 | suite только на типах; один token на граф, поднимать дорого | общий suite без связи с token: реализации на старой версии зелёные | suite несёт `token`; runner сверяет его с декларацией; token на каждую capability |
| Фейки разошлись с реальностью | `as never`, SQL-префиксы | автогенерация Proxy-моков из деклараций: принимают всё | фейк владельца проходит тот же suite, что и настоящая реализация |
| Smoke графа идёт 20 минут | Assembly последовательна (`run.ts:105-143`), LIFO тоже (дизайн, инв. 6) | smoke на настоящих адаптерах | замер: compile 500 модулей/~1500 bindings — 45 мс; прототип smoke 500 модулей × 4 прогона — 268 мс. 20 минут дают только реальные адаптеры, их выносим в suites |
| Нестабильные async-тесты очистки | таймауты `{timeout: 5_000}` (`runtime-setup-assembly.test.ts:834,836`) | проверка handles после каждого теста | в библиотеке нет таймеров (инв. 14): escalate/abandon через `AbortController`, дедлайны Host через `MockTimers` (stable с v23.1.0) |
| Утёкшие handles в CI | опыт: ref'нутый сервер — тест зелёный, файл висит до внешнего kill; `--test-timeout` не помогает; `--test-force-exit` даёт rc=0; unref и detached child не видны | — | guard на уровне файла + `--test-force-exit`: ошибка «TCPServerWrap x1» за 0,2 с. Один `setImmediate` дал ложное срабатывание после `await server.close`, два — стабильно (6/6) |
| Сторонний автор плагина без нашего репозитория | suite в `tests/`, импорты `../../dist` | — | suite — опубликованная функция `({test, create})`, без относительных путей |

Чужие ошибки (источники):
- Angular TestBed по умолчанию не уничтожал тестовый модуль: «Angular modules are never destroyed». Исправлено опцией
  `destroyAfterEach`, «Defaults to `true`» с v13 ([dev.to](https://dev.to/playfulprogramming-angular/improving-angular-tests-by-enabling-angular-testing-module-teardown-38kh), [angular.dev](https://angular.dev/api/core/testing/ModuleTeardownOptions)). Наш ответ: `isolate()` возвращает `AsyncDisposable`.
- Spring: кэш контекстов «default maximum size of 32», и «a large number of application contexts… unnecessarily long time»
  ([docs](https://docs.spring.io/spring-framework/reference/testing/testcontext-framework/ctx-management/caching.html)).
  `@MockitoBean`: квалификаторы решают, «if a separate `ApplicationContext` needs to be created» ([docs](https://docs.spring.io/spring-framework/reference/testing/annotations/integration-spring/annotation-mockitobean.html)).
  Наш ответ: нет контейнера с overrides и кэша. Один smoke на корень, `isolate` собирает граф из 1+k узлов за миллисекунды.
- Дрейф моков: «A fake must have its own tests…», «the team that owns the real implementation should write and maintain a fake»
  ([SWE at Google, гл. 13](https://abseil.io/resources/swe-book/html/ch13.html)); [Fowler, ContractTest](https://martinfowler.com/bliki/ContractTest.html).
- Pact не подходит для «public APIs», и его не стоит брать, когда другая сторона «will not also be using Pact» ([docs.pact.io](https://docs.pact.io/getting_started/what_is_pact_good_for)).
  Внутрипроцессным TS-capability хватает типов и общего suite, broker не нужен.
- Прецеденты для третьих сторон: «To prove that your implementation is `abstract-level` compliant, include the abstract test suite»
  ([abstract-level](https://github.com/Level/abstract-level#test-suite)); адаптер `resolved/rejected/deferred` в [promises-aplus-tests](https://github.com/promises-aplus/promises-tests).
  У abstract-level есть ошибка, которую не берём: пропуск тестов через `db.supports`. Опциональную функцию лучше вынести в отдельную capability со своим token.
- Свежий scope на каждый тест: «provide a fresh `Scope` and close it after each test» ([@effect/vitest](https://github.com/Effect-TS/effect/blob/main/packages/vitest/README.md)).

## 3. Три варианта

**A. Только стандарт.** Раздел CMS и примеры в тестах GM, без кода.
LOC src 0 / tests ~120 / docs ~150. Надёжность 5, уверенность 7, сложность 1. Ломается на масштабе: уже сейчас в трёх репозиториях три разных шаблона,
а третьим сторонам нечего импортировать.

**B. Тонкий kit в `@get-modular/conformance` (devDependency).** Прототип `isolate` и `smoke` поверх настоящих Core/Assembly занял 66 строк.
Он отклонил продукт без ключа capability с `assembly.run.invalid-product`, как в production, и нашёл внедрённый долг по пути `attempt/m/n137/…`.
Набросок API проверен `tsc7` и TS 5.8.3:

```ts
// @get-modular/assembly — шов, аддитивно
export type ModuleFactory<C, D extends ModuleDeclaration, I, X = {}> =
  (deps: FactoryDependencies<C, D>, ctx: FactoryContext & X) => Promise<FactoryProduct<I, FactoryCapabilities<C, D>>>;
// @get-modular/conformance
export function isolate<C, const D extends ModuleDeclaration, I>(api: Assembly<C>, declaration: D,
  factory: ModuleFactory<C, D, I, { resources: Resources }>, fakes: FactoryDependencies<C, D>,
): Promise<{ instance: I; capabilities: FactoryCapabilities<C, D> } & AsyncDisposable>; // dispose бросает при долгах
export function smoke(input: { declarations; profile; bind: (api, attempt: Resources) => Handles; roots;
  substitute?: Readonly<Record<string, ModuleDeclaration>>;   // эффектный лист -> фейк владельца
  abortAt?: readonly ("first" | "middle" | "last")[] }): Promise<readonly SmokeRun[]>; // каждый прогон: complete
export type ContractSuite<S> = { capabilityId: string; token: string; cases(test: TestFn, create: () => Promise<S>): void };
export function runContractSuite<S>(suite: ContractSuite<S>,
  o: { test: TestFn; declaration: ModuleDeclaration; create: (r: Resources) => Promise<S> }): void;
export function expectBindings(c: SuccessfulComposition, expected: Record<string, Record<string, readonly string[]>>): void;
export function guardHandles(o?: { allow?: readonly string[] }): void; // Node, на файл, с --test-force-exit
```

`TestFn` — `(name, fn)`, совместим с `node:test` и tape, поэтому kit не привязан к раннеру. `expectBindings` требует ровно неоднозначные slots:
набор slots выводится механически, ответы пишутся руками.
LOC src 250–350 / tests 250–350 / docs 120–180, интеграция в GM (ADR, CMS, packed-root, public-api, owners) ещё +300–600 (оценка по аналогии с §12 дизайна).
Надёжность 8, уверенность 7, сложность 3.

**C. Полный фреймворк:** `createTestGraph().override()`, автомоки из деклараций, записанные контракты с хранилищем проверок,
инъекция сбоя на каждом k (O(n²)), отслеживание handles через `async_hooks`, выбор затронутых тестов по графу, аттестации плагинов.
LOC src 2500–4000 / tests 2000–3000 / docs 500+. Надёжность 4, уверенность 8 (что сейчас это ошибка), сложность 9.
Повторяет ошибки Spring и Pact, а автомоки усиливают дрейф.

## 4. Рекомендация: B, по владельцам

| Что | Владелец | Где |
|---|---|---|
| `isolate`, `smoke`, `runContractSuite`, `expectBindings`, `guardHandles` | GM | `@get-modular/conformance`, dev-only; зависит от core/assembly/resources, не от EF |
| Suite capability X и фейк владельца (фейк проходит тот же suite) | владелец порта | рядом с портом, dev-only entrypoint |
| Smoke на каждый production-корень, таблица подмен, таблица неоднозначных slots | Host-потребитель | его тесты, его быстрый gate |
| Шардинг, манифесты тестов, покрытие | EF | уже есть; новых гейтов нет |
| Conformance для SPI сторонних плагинов | владелец SPI + Extension Foundation | позже (дизайн Q10) |

Правила CMS («Тестирование модулей», 6 пунктов):
1. Фабрика — экспортируемая функция типа `ModuleFactory`.
2. Фейк типизирован `FactoryDependencies`; `as never` на записи зависимостей запрещён.
3. Один smoke на корень, с фейками эффектных листьев.
4. Suite обязателен, только если у capability ≥2 реализаций, включая фейк.
5. Token на каждую capability; при смысловом break меняют suite и token.
6. В тестах scope закрывается через `await using`, без sleep.

Тестов становится меньше: ручные lifecycle-тесты каждого модуля заменяет один smoke.

## 5. Сейчас, потом и шов

**Сейчас, в одной поставке с `@get-modular/resources`:**
- `ModuleFactory` в Assembly;
- `@get-modular/conformance 0.1.0` с `isolate`, `smoke`, `runContractSuite`, `guardHandles`;
- преемник ADR-0003, который расширяет смысл conformance и пишет: «Core — инструмент harness, не oracle»;
- раздел CMS;
- расширить `type-scale` до 1000 модулей со slots.

Проверить на modularity-host-TEST и на AR: ordinary-граф через smoke, in-memory и PG dispatch через один suite.

**После решения владельца:** `expectBindings` вместе с правкой требования CMS о независимом oracle.
Полную эталонную сборку оставить только для миграции существующей ручной проводки.

**Отложить по триггеру:**
- публикацию продуктовых suites — до первого стороннего плагина;
- lint EF на `as never` — до инцидента с дрейфом;
- выбор тестов по графу — пока CI укладывается в бюджет;
- `async_hooks` в guard — пока утечку удаётся локализовать без него;
- флаги `supports` — не делать никогда.

**Швы, которые нужны сейчас:**
- экспортируемые фабрики;
- token на каждую capability;
- сигнатура suite `({test, create})` без относительных импортов;
- тестовый профиль = production-профиль + явная карта подмен;
- сериализуемый `Debt.path`.

## 6. Риски

- Smoke на фейках не доказывает работу production-адаптеров (EQS:174-176). Адаптеры проходят свои suites в интеграционном прогоне.
- Слабый suite пропустит три сломанные реализации. Suite обязан покрывать семантику ошибок (Liskov, EQS:93); это проверяет ревью, механизма нет.
- `guardHandles` чувствителен к фазам event loop (проверено). Только на уровне файла, при process isolation, как диагностика. На Windows и Electron не проверено.
- `complete` значит «cleanup отработал», а не «освобождено физически». Ресурсы, взятые мимо `setup`/`use`, scope не видит.
- Интеграция в GM может стоить больше кода самого kit (у kernel было +680 и +1292 строк, около 45 файлов). Существующие чекеры надо переиспользовать.
- Подмена листьев в профиле может оставить недостижимых провайдеров. Как Core это примет — не проверено.
- Если в smoke попадут настоящие адаптеры, время снова растёт линейно и последовательно.
