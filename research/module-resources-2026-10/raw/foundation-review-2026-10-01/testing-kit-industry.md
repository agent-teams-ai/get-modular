# Стандартный набор для тестирования модулей: синтез индустрии

Дата: 2026-10-01. Статус: предложение для ревью основы. Это не ADR и не разрешение на реализацию.
Опирается на `plans/module-resource-scopes-design-2026-10-01.md` (далее «дизайн scope»). Проверки
проводились в scratchpad: tsc7 и Node v26.9.0 на опубликованных `@get-modular/core` и
`@get-modular/assembly` 0.2.0. Прототип вместе с замерами занимает около 280 строк, в репозитории
ничего не менялось.

## 1. Текущее состояние (факты)

**GM (HEAD 9c722ce)**
- Фабрика спрятана за аутентифицированным handle (`packages/assembly/src/features/construction/bind.ts:6,30-36`).
  `run.ts:105-143` строит только граф целиком. Поэтому изолированный тест модуля сводится к прямому
  вызову обычной функции-фабрики.
- Тип зависимостей уже выводится из декларации: `FactoryDependencies<C, D>` (`types.ts:55-67`,
  экспорт в `src/index.ts:3-10`). Проверено tsc7: у отдельной фабрики `deps: FactoryDependencies<Caps, typeof decl>`,
  фейк неверной формы и пропущенный required-slot компилятор отклоняет.
- Типовые тесты пишутся через `@ts-expect-error` (`tests/assembly/types.ts:39-60`) и гоняются на
  минимальном и сборочном компиляторе (`tests/assembly/types.test.mjs:5-8`).
- Паттерн conformance-набора уже есть: `runSemanticSuite(createLifecycleKernel, context)`
  (`packages/lifecycle-kernel/tests/semantic-suite.mjs:9`). Он прогоняется по исходникам (`kernel.test.mjs:3`)
  и по упакованному архиву (`packed-root.test.mjs:56`).
- `deferred()` написан заново в GM (`tests/assembly/fixture.mjs:35-39`), AR и modularity-host-TEST
  (`tests/lifecycle/fixture.mjs:6-10`), хотя есть `Promise.withResolvers()`.
- Ограничения:
  - ADR-0003 резервирует dev-only `@get-modular/conformance` (`:35-37`), отклоняет conformance-subpath
    (`:66-67`) и требует от нового пакета существенного поведения (`:42-43`).
  - Qualification-хелперы GM остаются в `tests/qualification` (`AGENTS.md:44-47`).
  - CMS отклоняет «oracle derived from profile» и требует от потребителя независимый эталон связей
    (`common-assembly.md:136,187-188`).
  - Org EQS: «do not generate both a decision and its expected answer from the same implementation»
    (`.github` `docs/engineering-quality-standard.md:117-120`).
- Дизайн scope: `[Symbol.asyncDispose]` бросает `ScopeCloseError` при `complete === false` (`:148-149`).
  Там же обещан «общий прогон собрать → закрыть → отчёт complete» (`:296-297`) и тест «сбой на k из n» (`:328`).

**Потребители**
- AR (origin/main b0bcb265):
  - фабрики собраны в запись `createRuntimeSetupFactories` (`runtime-setup-assembly.ts:139-147`);
  - `bindRuntimeSetup` создаёт `assemblyFor` внутри себя (`:157-159`);
  - тест вручную перебирает 7 модулей по схеме «сбой на k → вызван ровно префикс `dependencyOrder`»
    (`tests/package/runtime-setup-assembly.test.ts:114-149`);
  - независимый эталон связей лежит в `tests/helpers/assembly-direct-reference.ts:35-37`;
  - заглушки `unavailable` бросают при вызове (`capability-bundle-contract.test.ts:10-12`).
- modularity-host-TEST (fcc10b2): фикстура вручную делает compile → bind → prepare
  (`tests/lifecycle/fixture.mjs:12-55`).
- Orchestrator (Awilix, без GM): «Tests construct modules directly with fakes»
  (`composition-and-dependency-injection.md:179`). Platform требует для SPI «fake-provider suite; every
  adapter runs it» (`08-contract-conformance-ownership.md:19`).
- EF: «never import this package from production runtime code» (`AGENTS.md:8`). От GM не зависит.

Итог: типы для фейков есть, а порядок, закрытие и перебор сбоев каждый пишет сам.

## 2. Индустрия

| Система | Что берём | Задокументированная цена или ошибка |
|---|---|---|
| NestJS `Test.createTestingModule().overrideProvider().compile()` ([docs](https://docs.nestjs.com/fundamentals/testing)) | Подмена провайдера до построения реального графа | `useMocker`: «define a mock factory to apply to all of your missing dependencies», то есть авто-моки; `REQUEST`/`INQUIRER` «cannot be auto-mocked» |
| Angular TestBed ([API](https://angular.dev/api/core/testing/ModuleTeardownOptions), [#42566](https://github.com/angular/angular/pull/42566)) | Модуль уничтожается после каждого теста, по умолчанию с 13.0.0 | Раньше это «preventing the `ngOnDestroy` hooks on providers from running». Override после inject даёт «Cannot override provider when the test module has already been instantiated» (`test_bed.ts`) |
| Spring slices и `@MockitoBean` ([caching](https://docs.spring.io/spring-framework/reference/testing/testcontext-framework/ctx-management/caching.html)) | Slices: «load only the parts of the configuration» | Bean overrides входят в ключ кэша контекстов (максимум 32): «large number of application contexts … unnecessarily long time». `@MockBean` устарел в Boot 3.4 |
| .NET `WebApplicationFactory` ([docs](https://learn.microsoft.com/en-us/aspnet/core/test/integration-tests?view=aspnetcore-10.0)) | Тест строит настоящую композицию (`Program`) и заменяет сервисы через `ConfigureTestServices` | «ConfigureServices callback is executed after the app's Program.cs code»: регистрацию приходится удалять и делать заново |
| Effect ([layers](https://effect.website/docs/requirements-management/layers/), [vitest](https://github.com/Effect-TS/effect/blob/main/packages/vitest/README.md)) | `Layer.succeed`, соглашение Live/Test, `TestClock`. В 4.0 «it.effect and it.live provide a fresh Scope and close it after each test» | Layer мемоизируется по ссылке, поэтому возможно неявное разделение состояния |
| Backstage ([backend testing](https://backstage.io/docs/backend-system/building-plugins-and-modules/testing)) | `startTestBackend` с mock services. «All mock services provide a factory function». `ServiceFactoryTester` тестирует одну фабрику | Локально тесты «only run against SQLite» |
| Pact ([fit](https://docs.pact.io/getting_started/what_is_pact_good_for)) | Ожидания потребителя проверяются у провайдера | Не подходит для «public APIs» и для «Functional testing of the provider». Нужен broker и can-i-deploy |
| OSGi Pax Exam ([overview](https://ops4j1.jira.com/wiki/spaces/PAXEXAM4/overview)) | In-container: «builds on-the-fly bundles … injects them into the container» | Выбор между стартом контейнера на каждый тест и «no isolation» (PerSuite) |
| VS Code и IntelliJ ([utils.ts](https://github.com/microsoft/vscode/blob/main/src/vs/base/test/common/utils.ts), [Disposer](https://plugins.jetbrains.com/docs/intellij/disposers.html)) | `ensureNoDisposablesAreLeakedInTestSuite()` роняет тест: «undisposed disposables». ESLint-правило требует этот вызов в каждом suite | `@vscode/test-electron` запускает настоящий Extension Development Host, это медленно. IntelliJ проверяет утечки только на уровне всего приложения |
| Kubernetes envtest ([book](https://book.kubebuilder.io/reference/envtest.html)) | Настоящие etcd и apiserver «without kubelet, controller-manager» | «no built-in controllers run … does not delete objects, even if you set up an OwnerReference» |
| Testing Library и SWE at Google ([principles](https://testing-library.com/docs/guiding-principles), [ch.13](https://abseil.io/resources/swe-book/html/ch13.html)) | «The more your tests resemble the way your software is used…». «A fake must have its own tests … contract tests» | Interaction testing: «overuse can easily result in brittle tests» |

Из этого следуют пять правил для GM:
1. Тест собирает граф тем же composition root, что и production. Подмены передаются явными
   параметрами до построения (уроки WAF и Angular).
2. Каждый тест владеет своим scope и всегда закрывает его. Долг при закрытии означает провал теста
   (Angular 13, Effect, VS Code).
3. Фейк поставляет владелец capability. Фейк проходит тот же набор, что и реальная реализация
   (Google, Backstage, Platform).
4. Нет авто-моков, тестового контейнера и кэша графов (Nest, Pax Exam, Spring).
5. Пределы проверки называются явно (envtest). Smoke не доказывает правильность связей.

## 3. Три варианта

### A. Только стандарт: раздел CMS «Testing modules», без кода
В разделе только рецепты: экспортируемая фабрика, `await using scope = createScope()`, ручной перебор k,
набор capability как функция `(create, test)`.
**Надёжность 5/10, уверенность 8/10, сложность 1/10.** LOC: src 0, tests 0, docs 120–200. У каждого
потребителя появится 100–200 строк своих хелперов. Это ровно сценарий «4–6 самописных стеков»
(дизайн scope `:419-420`), и он противоречит library-first (workspace `AGENTS.md:47`).

### B. Тонкий dev-only пакет `@get-modular/testing` (рекомендую)
```ts
// зависит от @get-modular/assembly и @get-modular/resources; обратных импортов нет
export function strictFake<T extends object>(name: string, members?: Partial<T>): T;
export function hookAssembly<C>(api: Assembly<C>, before: (implementationId: string) => void): Assembly<C>;
export type SweepStep = { readonly inject: "none" | "throw" | "abort"; readonly at?: string;
  readonly outcome: "succeeded" | "failed" | "cancelled"; readonly report: CloseReport };
export function sweepComposition<C, R extends RootHandles<C>>(
  compose: (api: Assembly<C>, attempt: Resources) => Promise<PreparedAssembly<R>>,
  options?: { readonly inject?: readonly ("throw" | "abort")[]; readonly at?: "each" | readonly string[];
              readonly afterClose?: (step: SweepStep) => void | Promise<void> },
): Promise<readonly SweepStep[]>;          // отклоняется SweepFailure со всеми плохими шагами
export type CaseContext = { readonly resources: Resources; readonly signal: AbortSignal };
export function defineCapabilitySuite<V>(capabilityId: string,
  cases: Readonly<Record<string, (subject: V, ctx: CaseContext) => void | Promise<void>>>): CapabilitySuite<V>;
export function runCapabilitySuite<V>(suite: CapabilitySuite<V>,
  subject: { readonly name: string; readonly create: (ctx: CaseContext) => V | Promise<V> },
  test: (name: string, fn: () => Promise<void>) => unknown): void;
```
- **`strictFake`.** Незаданный член бросает `db.query is not configured`. `then`, символы и `toJSON`
  дают `undefined`: фейк не становится thenable или disposable (проверено). Записи вызовов нет,
  для неё есть `mock.fn` из `node:test`.
- **`hookAssembly`.** Синхронный хук перед каждой фабрикой. Promise фабрики возвращается нетронутым,
  правила носителя (`common-assembly.md:279-289`) не ослабляются. На 0.2.0 работает без кастов.
- **`sweepComposition`.** Прогон 0 успешный, хук записывает фактический порядок (не из профиля).
  Дальше для каждого k: `throw` даёт `failed`, `abort` даёт `cancelled` с поздним fulfil k в journal.
  На каждый шаг свежий attempt-scope, `close()` и требование `complete`. Прототип прошёл 2×4 шага на
  0.2.0. При `at: []` остаётся graph smoke.
- **Наборы capability.** Свежий scope на кейс. Ошибка кейса первична, затем отчёт обязан быть complete.
  Раннер передаётся параметром, как в `runSemanticSuite`.
- **Тест одного модуля без хелпера:** `await using scope = createScope()` и прямой вызов фабрики.
  `asyncDispose` уже роняет тест при долге.
- **Синхронизация фейков:**
  - форму проверяет компилятор: фейк типизирован `Caps[K]["value"]`, а у `CapabilityContract<V, Token>` один источник;
  - поведение проверяет тот же набор capability;
  - ломающая смена контракта означает новый token, и Core отклоняет старые bindings.

**Надёжность 8/10, уверенность 7/10, сложность 3/10.** LOC:
- src 180–250;
- tests 150–250, только рискованное: перебор, поздний fulfil после abort, первичность ошибки кейса, не-thenable фейк;
- docs 120–180;
- интеграция в GM (ADR, Foundation `packageRoots`, packed-root, чекпоинты): ещё 250–450.

### C. Полный TestBed
```ts
createTestComposition<C>({ declarations, profile, factories,
  overrides?: { [implementationId: string]: unknown }, autoFake?: true, cache?: true })
  : Promise<{ roots; get<K extends keyof C>(id: K): C[K]["value"]; close(): Promise<CloseReport> }>;
```
Плюс авто-фейки для незакрытых slot'ов, реестр контрактов, запись CDC и кэш графов.
**Надёжность 5/10, уверенность 4/10, сложность 8/10.** LOC: src 1500–2500, tests 1000–2000,
docs 400–600. Минусы:
- `get()` по ID становится service locator (`system-boundary.md:69`);
- авто-фейки повторяют `useMocker` из Nest;
- кэш повторяет цену Spring;
- рядом с Assembly появляется второй путь сборки.

## 4. Рекомендация: вариант B

| Часть | Где живёт |
|---|---|
| `strictFake`, `hookAssembly`, `sweepComposition`, раннер наборов | `packages/testing` (`@get-modular/testing`), dev-only, 0.x, тот же поезд релизов, что у resources |
| Наборы capability, проверенные in-memory фейки, независимый эталон связей, TEST-профили | Владелец capability или потребитель (продуктовые контракты, `system-boundary.md:60-67`) |
| Запрет импорта testing из production roots, контроль публичного API | Существующие `architecture.source-dependencies` (allowlist dev-границы) и `public-api-compatibility`. Только конфигурация, новых EF-capability не нужно |
| Типовые тесты | `@ts-expect-error` в typecheck потребителя. CMS уже требует typed rejection (`common-assembly.md:169-170`). Отдельного кода нет |
| Векторы спецификации GM | Остаются в `tests/qualification` |

Что меняется в GM:
1. **Новый ADR.** Допускает `@get-modular/testing` и явно решает судьбу резерва `conformance` из ADR-0003.
   Моё предложение: резерв остаётся за векторами спецификации для альтернативных реализаций GM,
   а `testing` получают инструменты авторов модулей. Решает владелец.
2. **Раздел CMS «Testing modules».** В нём пять правил и соглашения:
   - фабрика экспортируется функцией;
   - composition root имеет вид `(api: Assembly<C>, attempt: Resources)`;
   - подмены передаются параметрами фабрик.
3. **Пакет и его обвязка.** Создать `packages/testing`, добавить Foundation-границы, packed-root тест,
   обновить `tests/ownership-checkpoint.test.mjs`.
4. **Core, Assembly и Resources не меняются.**

CI потребителя:
- **fast**: модульные тесты, наборы против фейков, smoke каждого production-профиля;
- **full**: наборы против реальных адаптеров в одноразовых TEST-ресурсах, полный `sweepComposition`, packed-consumer.

Первый реальный потребитель — AR. Цикл `runtime-setup-assembly.test.ts:114-149` заменяется на
`sweepComposition`, и добавляется один набор capability с фейком.

## 5. Сейчас, потом и шов

**Сейчас.** Пакет делается после фиксации API resources и в той же поставке. Вместе с ним раздел CMS,
а AR и modularity-host-TEST служат проверкой.

**Можно отложить без риска** (каждый пункт только по замеренной потребности):
- **CDC между репозиториями и broker.** До тех пор потребитель добавляет кейс в набор владельца capability.
- **Диф хэндлов процесса** через `process.getActiveResourcesInfo()` (Stable с v24.0.0/v22.16.0). На
  Node 26.9 проверено: он видит Timeout, TCP, ProcessWrap/PipeWrap, но не видит открытый `FileHandle`,
  `Worker` и unref-таймеры. Если добавлять, то опцией в `afterClose`, а не гейтом.
- **Lint «у каждого профиля есть smoke»** (по образцу правила VS Code). Только если smoke начнут забывать.
- **Остальное:** генерация фейков, TestBed, параллельный перебор, property-фаззинг графов,
  conformance сторонних плагинов (Extension Foundation ADR-0011), перенос мульти-TS раннера
  `architecture/tooling/test-assembly-types.mjs` в EF (когда понадобится второму репозиторию).

**Шов, который нужно оставить сейчас:**
1. Фабрика модуля экспортируется функцией с `FactoryDependencies<C, D>` и контекстом `{ signal, resources }`.
2. Composition root получает `Assembly<C>` и attempt-`Resources` параметрами. Это точка подмены без registry.
3. Набор capability — функция от `(create, test)`, фейк лежит рядом с контрактом. Позже этот же набор
   станет требованием к сторонним плагинам.
4. `Debt.path` стабилен и сериализуем (дизайн scope, Q10). На нём строятся проверки отчётов.

## 6. Риски

- **Smoke и перебор не доказывают правильность связей.** Ожидания нельзя выводить из профиля
  (CMS `:136`, EQS `:117-120`). По-прежнему нужен независимый эталон, как AR direct-reference.
- **`complete` ещё не значит «нет утечек».** Незарегистрированный ресурс модель не видит, а диф
  хэндлов покрывает его лишь частично.
- **Перебор стоит O(N²).** Замер на no-op фабриках, Node 26.9: 100 модулей — 0,74 с, 300 — 7,2 с;
  время уходит в повторный `prepare` (он заново компилирует план). 1000 модулей не проверено
  (экстраполяция ~80 с). Смягчение: выборка `at`, полный перебор только в full. Per-run контекст в
  `run()` позволил бы переиспользовать `prepare`, но Assembly менять только по замеру.
- **`strictFake` подталкивает к мокингу.** Правило CMS: предпочитать проверенный фейк владельца.
  API записи вызовов не будет.
- **Перехват держится на соглашении «api передаётся параметром».** AR создаёт `assemblyFor` внутри
  (`:159`), поэтому ему нужен небольшой breaking-рефакторинг.
- **Пакет зависит от ещё не реализованного API resources.** Если API изменится, кит правится в том же PR.
- **Свалка «utils».** В пакет только то, что опирается на семантику GM; `Promise.withResolvers`,
  mock timers `node:test` и `await using` не оборачиваются.
- **Имя конфликтует с резервом `conformance`.** Нужно явное решение владельца в ADR.
