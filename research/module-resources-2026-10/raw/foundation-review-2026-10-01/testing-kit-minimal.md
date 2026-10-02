# Стандартный kit тестирования модулей: минимально достаточный вариант

Дата: 2026-10-01. Статус: предложение, не ADR. Подход: минимально достаточно.
База: get-modular `9c722ce`, agent-runtime (AR) `origin/main` `b0bcb265`, modularity-host-TEST `fcc10b2`,
platform `a3ce96e`, orchestrator `d5c38e7`. Эксперименты в scratchpad: Node v26.9.0, tsc7 7.0.2.

## 1. Текущее состояние

### Что болит сейчас

1. **Фейки копируются между пакетами.** В AR `packages/apps/embedded-runtime/tests/package/support/external/**` лежат
   35 файлов, и у каждого есть оригинал в `packages/contexts/*/tests`. Большинство отличается только импортами, но
   `contained-turn-kernel-fixtures.ts` уже разошёлся с оригиналом: 236 строк против 340. Копии осознанные
   (`f2340571`, `bea095d1`): у пакетов нет тестовой точки входа.
2. **Вторая рукописная копия контракта модуля.** `OrdinaryRuntimeFactories` (`ordinary-runtime-assembly.ts:53-61`) и
   `HostInputs` (`runtime-setup-assembly.ts:198-208`) повторяют slot'ы и типы. Их уже выводят публичные
   `FactoryDependencies`/`FactoryCapabilities` (`assembly/src/features/construction/types.ts:50-69`, экспорт `index.ts:3-9`).
3. **Фабрику нельзя достать из handle.** Она лежит в приватном `WeakMap` (`bind.ts:6,36`), поэтому изолированный тест
   модуля возможен, только если фабрика экспортирована отдельно от `bindFactory`.
4. **Ручные фейки и касты.** «Запрещённые» порты перечисляются по методам (`ordinary-runtime-assembly.test.ts:78-84`).
   В тестах AR 638 `as never` и 118 `as unknown as`. Часть из них — намеренно битые входы; какая доля приходится на
   частичные фейки, не проверено.
5. **Повтор каркаса.** Цикл «упасть на модуле k» написан руками, карта id в нём продублирована
   (`runtime-setup-assembly.test.ts:114-149`). `deferred()` определён в AR 36 раз (27 из них в тестах) и ещё есть в GM
   и TEST. Две копии `fixture.mjs` в GM различаются одной строкой (`tests/assembly/fixture.mjs:3`,
   `packages/assembly/tests/fixture.mjs:3`).
6. **Нет общего способа проверить «после закрытия ничего не утекло».** TEST вручную проверяет
   `(await close).status === 'closed'` 12 раз (`tests/lifecycle/lifecycle.test.mjs`), AR считает вызовы `dispose`
   (`runtime-setup-assembly.test.ts:184-196`). Пакета `@get-modular/resources` ещё нет.

### Что уже работает и должно войти в стандарт

- **Тестовый вход Host.** `createRuntimeSetupAttempt(options, factoriesForAttempt, checkpoints)` с пометкой
  «Owner-local seam; never exported» (`default-agent-runtime-host.ts:25-31`). Отрицательный type-fixture проверяет, что
  публичный вход фабрик не принимает (`runtime-setup-assembly.types.ts:12-13`).
- **Независимый оракул проводки.** Это direct-reference Host (`tests/helpers/assembly-direct-reference.ts:35-37`) и
  один набор сценариев для двух реализаций (`registerPassiveSetupScenarios`, `:230`; вызывается в
  `runtime-setup-assembly.test.ts:12` и `assembly-reference.test.ts:5`). В GM так же устроен `runSemanticSuite(impl, t)`
  (`lifecycle-kernel/tests/semantic-suite.mjs:9`): он гоняется на сборке и на упакованном архиве (`kernel.test.mjs:6`,
  `packed-root.test.mjs:60-62`).
- **Type-тесты.** Фикстуры с `@ts-expect-error` на минимальном и закреплённом компиляторе (`tests/assembly/types.ts`).
- **Фейк как обычная реализация порта.** Пример — `class OrchestrationScopeFake implements OrchestrationScopeAdmissionPort`
  в platform (`model-conformance-subject.ts:40`).

**Что пока спекулятивно.** Orchestrator и platform не используют GM: в `origin/main` 0 упоминаний. Сторонних плагинов в
процессе нет (resources design, Q10). Реальные потребители GM сегодня — AR и TEST.

**Ограничения.**
- ADR-0003 (`:35-37`, `:66-67`): тестовые инструменты живут в отдельном dev-only пакете, subpath в рабочем пакете отклонён.
- ADR-0006 (`:174-177`): ожидаемое значение нельзя вычислять вызовом проверяемой реализации.
- CMS запрещает string lookup, второй путь сборки (`common-assembly.md:86`) и оракул, выведенный из профиля (`:136`).
- Org standard: «do not generate both a decision and its expected answer from the same implementation»
  (`engineering-quality-standard.md:117-120`).

## 2. Индустрия

| Система (факт) | Берём | Не берём |
|---|---|---|
| NestJS: `Test.createTestingModule(...).overrideProvider(X).useValue(v)`, `useMocker` для «missing dependencies», `await app.close()` в `afterAll` ([docs](https://docs.nestjs.com/fundamentals/testing)) | подмену по идентичности в корне композиции и явное закрытие | авто-моки недостающих зависимостей: у нас отсутствующая проводка обязана падать в compile/prepare |
| Angular TestBed: `overrideProvider` после создания модуля молча не применялся, исправлено как BREAKING ([#38717](https://github.com/angular/angular/pull/38717)). `destroyAfterEach` включён по умолчанию ([commit](https://github.com/angular/angular/commit/94ba59bc9db81ae04f20e8147b5133a0d3d45510)); до этого «Application-wide services are never destroyed» ([разбор](https://dev.to/this-is-angular/improving-angular-tests-by-enabling-angular-testing-module-teardown-38kh)) | свежий scope на каждый тест, закрытие по умолчанию, громкую ошибку на неизвестную подмену | глобальный изменяемый test bed |
| Effect: `Layer.mock` (since 3.17.0) — частичная реализация, где недостающие члены «fail with an unimplemented defect» ([Layer.ts](https://github.com/Effect-TS/effect/blob/main/packages/effect/src/Layer.ts)). В [#7793](https://github.com/Effect-TS/effect/issues/7793) (2026-09-03) Proxy-заглушка выдумала `then`, и Promise завис | тестовую реализацию как ещё одну обычную реализацию контракта | Proxy-автофейки |
| Pact: «Contract tests focus on the messages that flow between a consumer and provider» ([docs](https://docs.pact.io/consumer/contract_tests_not_functional_tests)); не подходит для «general purpose mocking» ([docs](https://docs.pact.io/getting_started/what_is_pact_good_for)) | контракт пишет владелец порта (порт объявлен на границе потребителя), и каждая реализация его проходит | broker и pact-файлы: форму сообщений внутри процесса уже проверяет TS |

Прецеденты S4: Gradle test fixtures — «a dependent project tests also needs the test fixtures of the dependency»
([docs](https://docs.gradle.org/current/userguide/java_testing.html)); Fowler: контракт-тест сверяет двойника с
настоящим сервисом ([ContractTest](https://martinfowler.com/bliki/ContractTest.html)). В процессе такой набор быстрый
и идёт в обычный гейт.

**Проверено в scratchpad:**
- Фейк на throwing-Proxy ломает ровно паттерн AR `async () => port` (`ordinary-runtime-assembly.test.ts:93`):
  получаем `rejected: unimplemented: then`. Шаблонная строка и `JSON.stringify` с таким фейком тоже падают.
- `process.getActiveResourcesInfo()` стабилен с v24.0.0
  ([Node](https://nodejs.org/api/process.html#processgetactiveresourcesinfo)), но возвращает только типы ресурсов, без
  владельца. `TCPServerWrap` закрытого сервера виден ещё два оборота `setImmediate` после callback'а `close`. Для гейта
  это шум.
- `node --test` с утёкшим `setInterval` не завершает файл. Это бесплатный грубый детектор утечек, если у CI-job задан
  таймаут.

## 3. Три варианта

### A. Швы, паттерны и один исполняемый пример

```ts
// @get-modular/assembly: единственное изменение кода, только тип
export type ModuleFactory<C, D extends ModuleDeclaration, I, Ctx = FactoryContext> =
  (dependencies: FactoryDependencies<C, D>, context: Ctx) =>
    Promise<FactoryProduct<I, FactoryCapabilities<C, D>>>;

// модуль: фабрика — именованный экспорт, bindFactory использует её же
export const createOrders: ModuleFactory<Caps, typeof ordersDecl, Orders, ModuleContext> =
  async (deps, { resources }) => { /* ... */ };

// изолированный тест: фейки типизированы декларацией, граф не нужен
const scope = createScope({ name: ordersDecl.implementationId });
const deps = { db: memoryDb(), buses: [] } satisfies FactoryDependencies<Caps, typeof ordersDecl>;
await createOrders(deps, { signal: scope.resources.signal, resources: scope.resources });
assert.deepEqual(await scope.control.close(), { complete: true, debts: [] });

// контракт порта: лежит у владельца порта, экспортируется через тестовую точку входа
export async function dbContract(t: TestContext, create: () => Promise<Db>): Promise<void>;

// Host: один внутренний вход попытки, публичный вход подмен не принимает
type AppFactories = { readonly [K in AppImplementationId]: AppModuleFactory<K> };
export async function createAppAttempt(options?: { readonly signal?: AbortSignal },
  overrides?: Partial<AppFactories>): Promise<{ outcome: AssemblyOutcome<Roots>; lifetime: ScopeControl }>;
```

Smoke графа в потребителе занимает около 20 строк:
- собрать граф, закрыть, проверить `complete`;
- для каждого `implementationId` подменить фабрику на падающую и получить `status: "failed"`;
- после `close()` снова проверить `complete` и что порядок закрытия обратен **наблюдаемому** порядку создания. Порядок
  берём из лога, а не из плана, чтобы оракул не выводился из реализации.

**Проверено.** `tsc7` на исходниках Assembly HEAD:
- `ModuleFactory` передаётся в `bindFactory` без кастов и работает через `scoped()` с `{ resources }`;
- отклоняются пропущенный slot, лишний slot, неверная форма порта и фабрика чужой декларации.

В runtime граф из 4 модулей собран на установленной Assembly 0.1.0 с упрощённым stand-in scope (это не реальный
дизайн resources). Все 5 smoke-тестов прошли.

Надёжность 8/10, уверенность 8/10, сложность 2/10. LOC в GM: исходники ~6; тесты ~15 (type-fixture) и ~60 (тест
примера); документация ~100 и пример ~120.

### B. Тонкий dev-only пакет `@get-modular/testing`

```ts
export function moduleHarness<C, D extends ModuleDeclaration, I>(declaration: D,
  factory: ModuleFactory<C, D, I, ModuleContext>): {
  run(deps: FactoryDependencies<C, D>): Promise<{
    product: FactoryProduct<I, FactoryCapabilities<C, D>>; close(): Promise<CloseReport> }>;
};
export function graphSmoke<Id extends string>(input: { implementationIds: readonly Id[];
  attempt: (failAt: Id) => Promise<{ outcome: AssemblyOutcome<unknown>; lifetime: ScopeControl }> },
  test: typeof import("node:test").test): void;
export function probe(): { acquire(resources: Resources, name: string): Promise<string>;
  readonly live: ReadonlySet<string>; readonly log: readonly string[] };
```

Пакет экономит 20–30 строк на каждый корень композиции. Цена:
- ADR (по ADR-0003 новый пакет допускается только за существенное поведение), admission, public-api baseline,
  packed-root и релиз;
- связка версий core, assembly и resources в одном пакете;
- обёртка `moduleHarness` над фабрикой сама становится вторым путём вызова.

Для сравнения: kernel обошёлся в `461bff0` (+680) и `24d6557` (+1 292).

Надёжность 7/10, уверенность 6/10, сложность 5/10. LOC: исходники 150–250, тесты 200–300, документация 80–120,
интеграция 400–700.

### C. Полный kit

Состав: `TestAssembly.create(profile).override(id).useValue(v).useMocker(auto)`, Proxy-фабрика
`fakeFrom<typeof decl>()`, снапшоты плана и журнала, `expectNoActiveHandles()` и реестр контрактов по образцу Pact.

Вредно: вторая сборка рядом с настоящим Host, Proxy ломает `then`, снапшоты повторяют реализацию, детектор хэндлов
шумный, реестр дублирует TS.

Надёжность 4/10, уверенность 7/10 (в том, что вариант вреден), сложность 9/10. LOC: исходники 800–1 500, тесты 800+,
документация 200+.

## 4. Рекомендация: вариант A

**GM:**
- type-alias `ModuleFactory` в Assembly, minor-релиз с changeset;
- 6–8 нормативных строк в CMS (`common-assembly.md`) — это швы S1–S4 из раздела 5;
- раздел «Testing modules» в `consumer-quickstart.md`;
- исполняемый пример в существующем гейте, как сейчас `basic-host.mjs` (`consumer-quickstart.md:23-26`). Assembly не
  импортирует resources, поэтому пример кладём в корневые тесты, а не в `packages/assembly`. Допустимость этого ребра
  нужно проверить по admission-правилам при реализации.
- Ledger-пробник внутри resources остаётся тестовым кодом, а не экспортом. Прошлый план тоже требовал «no internal
  subpaths or runtime test kit».

**Engineering Foundation:** нового кода нет. Опционально можно добавить правило «тестовую точку входа импортируют только
тесты» через существующие `boundaries/entrypoints` source-dependencies v3. Хватает ли их выразительности, не проверено.
Код про модульную систему в EF не кладём.

**Потребитель:**
- внутренний вход попытки с подменами;
- один smoke-файл и один type-fixture на каждый корень;
- контракт-наборы для портов с двумя и более реализациями, где фейк — одна из реализаций;
- фейки живут у владельца порта.

**Проверка:** сначала TEST, затем AR на ordinary-графе из 8 модулей: убрать `OrdinaryRuntimeFactories`, добавить smoke.

**Shared-first разбор.** Вариант B — это и есть узкая переиспользуемая опция: владелец GM, зависимости
testing → core/assembly/resources, около 1 000 LOC вместе с интеграцией. Откладываем: потребителей двое, а выигрыш около
25 строк на корень.

## 5. Что делать сейчас, что отложить

**Швы, которые нужны сейчас.** Цена переделки растёт с числом модулей.

- **S1.** Фабрика модуля — именованный экспорт с типом `ModuleFactory`. Параллельных рукописных записей фабрик нет.
- **S2.** Контекст модуля `{ signal, resources }` фиксируется в ADR resources. Имя scope модуля равно `implementationId`,
  поэтому `Debt.path` сразу указывает на модуль.
- **S3.** На каждый корень один внутренний вход попытки, который возвращает `{ outcome, lifetime }`. Подмены
  типизированы по `implementationId`, неизвестный ключ даёт ошибку (урок Angular). Публичный вход подмен не принимает,
  это проверяет отрицательный type-fixture, как в AR.
- **S4.** Фейк и контракт-набор живут у владельца порта и экспортируются через тестовую точку входа. Копировать фикстуры
  между пакетами нельзя.

**Не строим:**
- Proxy-автофейки и `useMocker`;
- DSL и builder поверх Assembly;
- снапшоты планов и журналов;
- детектор хэндлов по умолчанию;
- Pact-реестр;
- хелпер `deferred`: уже есть `Promise.withResolvers()`;
- хелпер `expectComplete`: `assert.deepEqual(report, { complete: true, debts: [] })` и так показывает пути долгов;
- subpath `./testing` в production-пакетах GM.

**Откладываем до триггера:**
- `@get-modular/testing` — когда три или больше независимых корней скопируют один каркас от 50 строк или появятся внешние
  авторы плагинов.
- Conformance kit для сторонних плагинов — вместе с первым таким плагином (EF ADR-0011, изоляция вне процесса).
- Шардинг smoke — когда он идёт дольше ~60 с.
- Стек регистрации в долгах — по плану resources (раздел 9).
- Общий хелпер мутантов привязок (`ordinary-runtime-assembly.test.ts:20-25`) — когда появится второй потребитель.

## 6. Риски

1. Подмены S3 могут стать производственной лазейкой или вторым путём сборки. Защита: вход внутренний, есть отрицательный
   type-fixture и правило в CMS.
2. `complete` значит «cleanup отработал», а не «ресурс физически освобождён» (resources, Q10). Эталонные адаптеры
   (процесс, сервер) нужно проверять интеграционными тестами в TEST.
3. Фейк может пройти контракт-набор и расходиться там, где набор ничего не проверяет. Поэтому в набор обязательно входят
   ошибки и отмена.
4. Smoke «упасть на k» требует O(n²) вызовов фабрик. Компилировать один раз; на сотнях модулей брать только модули с
   собственными ресурсами или шардировать.
5. Скрытые зависимости, например глобальные singleton'ы, smoke не видит. Их ловят правило 2 resources и ревью.
6. S2 зависит от resources, который ещё не реализован. S1, S3 и S4 можно делать уже сейчас.
7. Убрать 35 копий фикстур в AR — отдельная работа, её объём не оценён.
