# Ресурсы модуля: дерево scope'ов (дизайн v1)

Дата: 2026-10-01. Статус: **дизайн принят владельцем по Q1–Q10 (раздел 13), уточнён решениями
Q11–Q13 после критики плана реализации и Q14–Q18 от 2026-10-02 (API по глубоким ревью, builder,
фрагменты, гейты AR, упаковка)**. ADR-0030, ADR-0031, ADR-0032 и порядок поставки — в
`module-resource-scopes-implementation-plan-2026-10-01.md` (редакция 3).
Заменяет направление `shared-module-resource-contract-2026-10-01.md` (тот план остаётся историей;
его критика в `shared-module-resource-contract-2026-10-01.review.md`).

Основа: четыре независимых исследования (JS/TS-фреймворки; JVM/.NET/OTP/structured concurrency;
реальные ресурсы в agent-runtime и интеграция с Assembly; adversarial-критика), эксперименты на
Node v26.9.0 и `tsc7`, выборочная проверка ссылок на issues через `gh`.

---

## 1. Цель и три правила

Модуль — единица сборки. Каждый экземпляр модуля объявляет **свои** ресурсы и чистит их, когда они
не нужны. Ребёнок не управляет родителем; родитель передаёт ребёнку узкие порты. Никто не управляет
чужим состоянием. Масштаб — сотни модулей и глубокие деревья. Без лишнего кода.

1. **Кто создал, тот и закрывает.** Модуль чистит только то, что сам создал через `setup`/`use`.
   Полученное через зависимости только одалживается и никогда не закрывается.
2. **Право закрыть — это ссылка, а не договорённость.** У scope две стороны: `resources` (объявлять)
   и `control` (закрывать). Модуль получает только `resources`. `control` держит создатель: родитель
   или Host. Нет ссылки — нет власти (как `Scope.Closeable` в Effect 4 и ребёнок, «не знающий» о
   supervisor в OTP).
3. **Ребёнок получает порты, а не родителя.** Связь ребёнок → родитель только через порты, которые
   родитель сам выдал (событие, health). Ребёнок сообщает, решает родитель.

**Сразу библиотекой, универсально; breaking changes допустимы** (решение владельца 2026-10-01,
записано в workspace `AGENTS.md`, раздел «Library-first modularity at the early stage»). Мы на раннем
этапе: общий контракт сразу делается пакетом GM и унифицируется по библиотекам, потому что выносить
и рефакторить потом дороже, чем адаптироваться к breaking change. Следствия:

- думать заранее, как контракт будет развиваться и масштабироваться; проверять на TEST-проектах и
  на реальном потребителе (AR) в той же поставке — как проверку, а не как инкубатор;
- breaking changes не критичны: честная версия (pre-1.0 minor), changelog и миграционная заметка,
  потребители адаптируются; совместимых прослоек ради избежания breaking change не держим;
- никакой продуктовой политики в пакете: дедлайны, health, retry-решения — у Host каждого потребителя;
- ноль runtime-зависимостей, ESM, `engines` = поддерживаемый диапазон Node всех пакетов GM;
- правила для авторов модулей — в Consumer Module Standard, чтобы все потребители делали одинаково;
- коды ошибок (`resources.scope.closed` и др., схема `<пакет>.<область>.<причина>`) и форма
  `CloseReport` — публичный контракт: менять можно, но явно; потребители сравнивают `code`, а не класс.

---

## 2. API v1

Форма зафиксирована редакцией 3 плана реализации (решение Q14 и правки API 2026-10-02) и проверена прототипом
`foundation-review-2026-10-01/prototypes/impl-plan-v3/` на TS 7.0.2 и 5.8.3.

```ts
export type CloseOptions = {
  /** Abort = «освобождай быстрее» для текущего закрытия поддерева: cleanups видят ctx.escalate aborted. */
  readonly escalate?: AbortSignal | undefined;
  /** Abort = «этот вызывающий перестаёт ждать»: его close() сразу возвращает снимок отчёта (settled: false),
   *  закрытие продолжается по порядку для остальных (Q13). Никогда не означает released. */
  readonly abandon?: AbortSignal | undefined;
};
export type ScopeOptions = {
  readonly name: string;                                  // обязательно: имя — часть пути долга
  readonly order?: "reverse" | "concurrent" | undefined;  // по умолчанию "reverse"; "concurrent" — для независимых пиров (Q11)
};                                                        // опции signal нет: scope заканчивается только close()

export type Debt =                                        // путь: ["attempt", "orders", "session:42", "subscription"]
  | { readonly path: readonly string[]; readonly state: "failed"; readonly cause: unknown }  // исходная ошибка
  | { readonly path: readonly string[]; readonly state: "pending" | "not-run" };
export type CloseReport = { readonly complete: boolean; readonly settled: boolean; readonly debts: readonly Debt[] };

export type SetupContext = { readonly signal: AbortSignal };      // «прекрати получать»
export type CleanupContext = { readonly escalate: AbortSignal };  // «освобождай быстрее»; никогда «пропусти»
export interface Resources {
  /** Aborted, когда scope (или предок) начал закрываться. */
  readonly signal: AbortSignal;
  setup<T>(spec: {
    readonly name: string;
    readonly setup: (ctx: SetupContext) => T | PromiseLike<T>;
    readonly cleanup: (value: T, ctx: CleanupContext) => void | PromiseLike<void>;
  }): Promise<T>;
  use<T extends AsyncDisposable | Disposable>(value: T, name: string): T;  // после запроса close бросает, значение остаётся у автора
  child(options: ScopeOptions): Scope;
}

export interface ScopeControl extends AsyncDisposable {
  close(options?: CloseOptions): Promise<CloseReport>;   // никогда не отклоняется
}
export type Scope = { readonly resources: Resources; readonly control: ScopeControl };
export type ModuleContext = { readonly signal: AbortSignal; readonly resources: Resources };

export declare function createScope(options: ScopeOptions): Scope;
export declare function scoped<Deps, R, X extends { readonly signal: AbortSignal; readonly scope: unknown }>(  // раздел 4
  name: string,
  factory: (deps: Deps, context: Omit<X, "scope"> & { readonly resources: Resources }) => R,
): (deps: Deps, context: X) => R;
// Коды: resources.scope.closed, resources.close.incomplete, resources.argument.invalid, resources.scoped.invalid-run-scope
export declare class ScopeClosedError extends Error { readonly code: "resources.scope.closed"; readonly path: readonly string[] }
export declare class CloseIncompleteError extends AggregateError { readonly code: "resources.close.incomplete"; readonly report: CloseReport }
export declare class InvalidArgumentError extends TypeError {
  readonly code: "resources.argument.invalid" | "resources.scoped.invalid-run-scope";
}
```

Типичный модуль (декларация через builder Assembly 0.3.0, ADR-0032):

```ts
export const ordersDeclaration = declareModule({
  moduleId: "acme/orders", implementationId: "acme/orders/default", owner: { authority: "acme", path: ["orders"] },
  provides: [Orders.provide()], slots: [Db.slot("db", required()), Bus.slot("bus", required())],
});
export const createOrders: ModuleFactory<
  CapabilitiesOf<typeof Db | typeof Bus | typeof Orders>, typeof ordersDeclaration, Connection, ModuleContext
> = async (deps, { resources }) => {
  const conn = await resources.setup({
    name: "conn",
    setup: ({ signal }) => connect(url, { signal }),
    cleanup: (c) => c.close(),
  });
  await resources.setup({
    name: "subscription",
    setup: () => conn.subscribe("order.created", onCreated),
    cleanup: (s) => s.unsubscribe(),          // LIFO: отписка раньше conn.close()
  });
  resources.use(new LruCache(), "cache");        // значение уже в руках, с Symbol.dispose — одной строкой
  await resources.setup({                        // асинхронное получение — только через setup (инвариант 4)
    name: "file", setup: () => open(cachePath), cleanup: (f) => f.close(),
  });
  return { instance: conn, capabilities: { "acme/orders": { list: (q: Query) => deps.db.query(q) } } }; // db одолжен
};
```

Временные ресурсы и вложенные модули — через `child()`:

```ts
const session = resources.child({ name: `session:${id}` });       // control остаётся у родителя
const s = await createSession({ query: deps.db.query }, session.resources);
sessions.set(id, { s, end: () => session.control.close() });     // закрыть, когда не нужно
```

---

## 3. Семантика (инварианты)

1. **Закрывает только создатель.** Через `Resources` нельзя закрыть ни свой scope, ни чужой.
2. **Custody с момента вызова.** Запись о `setup` заводится синхронно при вызове, до первого `await`
   внутри setup. Отклонённый setup не оставляет записи (setup атомарен; многошаговое получение
   делится на несколько `setup` или уходит в `child()`).
3. **Место в LIFO — в момент fulfil.** Если setup подписки внутри себя создаёт соединение, соединение
   завершится раньше и окажется глубже в стеке; закроется после подписки (проверено экспериментом:
   при выдаче места в момент вызова порядок ломается). `child()` занимает место в момент создания.
4. **Запрос close синхронно по всему поддереву:** `resources.signal` aborted; `setup()` больше не
   вызывает callback и отклоняется `ScopeClosedError`; `child()` бросает `ScopeClosedError`;
   `use(x)` бросает `ScopeClosedError` и `x` на учёт не берёт: значение остаётся у автора, как в
   TC39 `DisposableStack.use` (одно правило вместо трёх разных поведений; подтверждено владельцем
   2026-10-02, Q14).
5. **Сначала ждём начатые setup, потом LIFO.** Значение setup, завершившегося после запроса close,
   автору не отдаётся (он получает `ScopeClosedError`), а кладётся на вершину стека и чистится первым.
   Только эта поздняя `ScopeClosedError` заранее помечена обработанной, чтобы не уронить процесс;
   настоящие ошибки setup без `await` по-прежнему видны.
6. **Строго последовательный LIFO.** Следующая запись стартует после завершения предыдущей.
   Единственное исключение — явная опция scope `order: "concurrent"` для независимых пиров
   (сессии, ходы, экземпляры, Q11); порядок из графа не выводится.
7. **Ошибка не останавливает очистку.** Throw/reject (включая синхронный) записывается как
   `failed` с исходной причиной, очистка идёт дальше. Шаги, которые строго зависят друг от друга
   (убить процесс, потом удалить его каталог), пишутся внутри одного cleanup.
8. **Single-flight.** Состояние и Promise публикуются до первого пользовательского callback.
   Повторный `close()`, `[Symbol.asyncDispose]` и закрытие ребёнка родителем присоединяются к одному
   полёту. Повторный `close()` после завершения с долгами заново пытается `failed`/`not-run` записи
   (явное действие Host, см. решение Q2).
9. **Два разных сигнала.** `setup` получает `{ signal }` = `resources.signal` («прекрати получать»).
   `cleanup` получает `{ escalate }` («поторопись»), который **не** срабатывает просто от начала
   закрытия — иначе cleanup отменил бы сам себя (урок Trio про level-triggered cancellation). Разные
   имена полей не дают перенести `if (signal.aborted) return` из setup в cleanup (правки API
   2026-10-02).
10. **Escalate — событие всего поддерева.** Каждый вызов `close` может добавить свой сигнал
    эскалации текущего закрытия; он доходит до всех потомков, включая тех, кто закрывается сам, и
    тех, кто ещё ждёт своей очереди. Abandon по дереву не распространяется (инвариант 11).
11. **abandon касается только своего вызывающего; таймаут никогда не означает released (Q13).**
    Вызывающий, чей `abandon` сработал, сразу получает снимок отчёта: идущие действия — `pending`,
    не начатые — `not-run`. Закрытие продолжается в фоне строго по порядку. Остальные ждущие,
    включая родителя, ждут дальше, поэтому родитель не освобождает ничего ниже ребёнка, пока cleanup
    ребёнка идёт. Вне порядка ничего не стартует. Повторный `close()` во время закрытия
    присоединяется к нему; после завершения с долгами повторяет `failed` (Q2).
12. **Ребёнок отцепляется после полного закрытия.** Released-записи удаляются (closure отпускается
    для GC). Хранятся только живые записи и долги. Долг ребёнка остаётся видимой записью родителя.
13. **`[Symbol.asyncDispose]`** вызывает `close()` и бросает `CloseIncompleteError` с `report`, если
    `complete === false` — `await using` не проглотит долг молча. Без цепочек `SuppressedError`.
14. **Никаких таймеров, глобалов и AsyncLocalStorage в библиотеке.** `use()` никогда не вызывает
    `then`. Дедлайны — политика Host (ref'нутый `setTimeout`, иначе процесс может тихо выйти с кодом 0).

---

## 4. Иерархия и порядок между модулями

Assembly вызывает фабрики **последовательно** в `dependencyOrder`
(`get-modular/packages/assembly/src/features/construction/run.ts:105-113`,
`common-assembly.md:266`). Если на входе в каждую фабрику синхронно создать дочерний scope
внутри scope текущего run, то LIFO этого scope **сам** совпадает с обратным порядком
зависимостей: потребители закрываются раньше провайдеров, общий pool — после всех своих 40
потребителей. Ни `created`, ни `bindings` читать не нужно.

Core не меняется. Assembly 0.3.0 только передаёт в контекст фабрики непрозрачное поле `scope`:
значение, отданное в `run({ signal, scope })` (Q11, ADR-0031). Assembly его не читает и не
освобождает. Захватывать родителя при связывании нельзя: одна prepared-сборка, запущенная дважды,
повесила бы обе сессии на первую, и закрытие сессии 1 закрыло бы ресурсы сессии 2 (дефект найден
ревью динамики).

Обёртка живёт в `@get-modular/resources` и **не импортирует ни Core, ни Assembly**: это обычная
generic-функция высшего порядка. Проверено `tsc7` 7.0.2 и TS 5.8.3 на кандидате Assembly 0.3.0
(scratchpad `impl-plan-v2`, 2026-10-01):
- `deps` выводятся из `bindFactory`;
- `context.scope` внутри модуля и несуществующий slot отклоняются;
- с Assembly 0.2.0 вызов не компилируется.

```ts
// @get-modular/resources: на каждый вызов фабрики
export function scoped<Deps, R, X extends { readonly signal: AbortSignal; readonly scope: unknown }>(
  name: string,
  factory: (deps: Deps, context: Omit<X, "scope"> & { readonly resources: Resources }) => R,
): (deps: Deps, context: X) => R;
//  1. родитель = context.scope текущего run; не Resources этой копии пакета →
//     InvalidArgumentError resources.scoped.invalid-run-scope до тела фабрики;
//  2. parent.child({ name }) синхронно, до первого await: место в LIFO = порядок конструирования;
//  3. отмена run (context.signal) обрывает setup модуля, пока фабрика не завершилась;
//  4. фабрика получает все поля контекста Assembly, кроме scope, плюс resources.

// потребитель: связать и подготовить один раз
const orders = api.bindFactory(ordersDecl, scoped(ordersDecl.implementationId,
  async (deps, { resources }) => { /* deps типизированы как обычно */ }));
const { prepared } = await api.prepare({ composition, factories: [orders /* , … */], roots });

// Host, на каждую попытку или экземпляр:
const attempt = host.resources.child({ name: "attempt" });
const outcome = await prepared.run({ signal, scope: attempt.resources }); // ждёт in-flight фабрику
if (outcome.status !== "succeeded") {
  const report = await attempt.control.close({ escalate, abandon });
  throw new ConstructionFailed(outcome, report);
}
return { roots: outcome.roots, lifetime: attempt.control };  // передача владения = передача control
```

- **Сбой на модуле 37 из 100:** закрываются частичный scope 37 и модули 36..1 в обратном порядке.
  `attempt.close()` вызывается только после завершения `run()`, иначе фабрика 37 обратится к уже
  закрытому модулю 36.
- **Одна prepared-сборка — много run:** у каждого run свой `scope`. Закрытие одного экземпляра не
  трогает другие, повторный run после закрытия работает. Данные и порты родителя на экземпляр
  приходят объявленными входами `run({ inputs })` (Q11).
- **Вложенный run внутри модуля:** его scope — это `resources.child()` внешнего модуля.
- **Singleton'ы между попытками** живут в scope Host, а не в attempt-scope.
- **Отмена сборки:** сигнал передаётся в `run({ signal })`. `scoped()` связывает его с setup
  модуля до завершения фабрики, поэтому зависший `setup` в фабрике 37 получает abort и Assembly не
  ждёт её вечно. Сигнал сборки не передают в `createScope`/`child`: иначе поздний abort остановил
  бы получение ресурсов у живого экземпляра.
- **Много независимых экземпляров** (сессии одного тенанта) держат в scope с
  `order: "concurrent"`: при закрытии они освобождаются одновременно, каждый внутри в LIFO.
- **lifecycle-kernel** стоит рядом, а не под этим: в dynamic Host `retainCustody` перед `child()`,
  `release(custody)` только при `complete` отчёте ребёнка.

---

## 5. Правила для авторов модулей

Нормативный текст — разделы CMS «Module resource scopes» и «Module packages and contracts» (план
реализации, 9.1). Кратко:

1. Получать ресурсы только через `setup`/`use`; ничего из `deps` не закрывать. Асинхронное получение —
   только в `setup`: после запроса close `use()` бросает, значение остаётся у автора (Q14).
2. Давать имя каждой записи и каждому дочернему scope: имена образуют пути долгов, по которым Host
   пишет алерты (правки API 2026-10-02).
3. Всё, что нужно cleanup'у, должно быть объявленным slot или собственным ресурсом. Скрытые
   зависимости (глобальный singleton, захват capability в обход slot) ломают порядок, а порядок
   независимых модулей определяется лексикографическим tie-break `implementationId` (ADR-0006).
4. Ребёнку передавать ресурсы только при создании; ребёнок пользуется записями родителя, созданными
   до него.
5. Регистрация «вверх» (подписка на bus провайдера) возвращает disposer, и регистрирующий кладёт его
   в **свой** scope.
6. Выполняющаяся работа — не ресурс. Порядок регистрации: зависимости → drain-набор → подписка;
   LIFO тогда даёт unsubscribe → drain → close. Или операция = `child()`.
7. Доменная последовательность освобождения (retire → settle → delete и т.п.) пишется внутри одного
   cleanup: scope упорядочивает независимые записи, а не заменяет протокол authority.
8. Cleanup бросает ошибку, только если его ресурс может быть ещё удержан. Потеряна зависимость и
   ресурс поэтому уже мёртв — нормальное завершение. `escalate` просит освобождать быстрее и никогда
   не разрешает пропустить освобождение.
9. `use()` освобождает грубо. Проверено: `Writable[Symbol.asyncDispose]` делает destroy (0 из 32 МБ на
   диске), `ChildProcess[Symbol.dispose]` только шлёт SIGTERM (процесс жив), `http.Server` с активным
   запросом висит. Для них нужны `setup`/`cleanup`-адаптеры: процесс (exit + SIGKILL по escalate),
   сервер (`closeAllConnections` по escalate), writable (`end` + finish).
10. Thenable-ресурс (`execa()` — одновременно процесс и Promise) оборачивать: `setup: () => ({ proc })`,
    иначе setup дождётся выхода процесса.
11. Domain/application-код не видит `Resources`. Его видят composition/adapter-слой модуля;
    application получает узкие порты. `FactoryContext.scope` читает только `scoped()`.
12. Внутри cleanup не ждать `close()` своего scope или предка (deadlock; `abandon` освобождает
    только вызывающего, сам scope остаётся в закрытии, Q13).
13. Cleanup, который нельзя вызывать дважды, сам помнит своё состояние: Host может повторить (Q2).
14. Декларации — через `declareModule` и дескрипторы контрактов (`defineContract`), без ручных
    `kind`, `schemaVersion` и `compatibility`; фабрика модуля типизируется `ModuleFactory` с картой
    своих контрактов, а не картой Host (Q15, Q16).
15. Модульный пакет указывает пакеты GM только в `peerDependencies` с диапазоном одного 0.x minor;
    ошибки различаются по `code`, а не по классу (Q18).
16. Контракт, который может стать API изолированного плагина, RPC-safe: асинхронные методы, plain data,
    без callbacks и идентичности объектов.

Правило для Host (не для автора модуля): если cleanup при повторе снова нужен провайдер (например,
журнал наблюдений), провайдер живёт во внешнем scope, который Host закрывает только после `complete`
внутреннего: освобождение продолжается после ошибки (Q1), и провайдер того же scope к повтору уже
закрыт.

---

## 6. Что берём у лучших

| Идея | Откуда | Источник |
|---|---|---|
| Право закрыть отделено от права пользоваться | Effect 4 rc.118 `Scope.Closeable` | https://github.com/Effect-TS/effect/releases/tag/effect%404.0.0-rc.118 |
| Ребёнок — одна запись в родителе, отцепляется при закрытии | Effect `Scope.fork` | https://github.com/Effect-TS/effect/blob/b5a2d4c1d62c9620a68d72b7f20248c69ef7663b/packages/effect/src/Scope.ts |
| Ребёнок ничего не знает о родителе | Erlang/OTP | https://www.erlang.org/doc/system/sup_princ.html |
| LIFO и продолжение после ошибки | JLS try-with-resources | https://docs.oracle.com/javase/specs/jls/se25/html/jls-14.html#jls-14.20.3 |
| Регистрация cleanup до первой приостановки | Effect #8390 | (релиз rc.118 выше) |
| Сбой сборки закрывает уже созданное в обратном порядке | OTP supervisor; Nest #17966 | https://www.erlang.org/doc/apps/stdlib/supervisor.html , https://github.com/nestjs/nest/pull/17966 |
| Добавление в закрытый scope: освободить и бросить | IntelliJ `Disposer`, .NET DI | https://github.com/JetBrains/intellij-community/blob/bc3487548ccaba36486be2d88f8fd379a1d36258/platform/util/src/com/intellij/openapi/util/Disposer.java#L159-L173 |
| Один бюджет времени на корне | Kubernetes grace period | https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination |
| Отдельная эскалация (SIGTERM → SIGKILL, `forceCloseConnections`) | OTP `shutdown`/`brutal_kill`, NestJS | https://www.erlang.org/doc/apps/stdlib/supervisor.html |
| Lifecycle только по opt-in, pure-модули ничего не пишут | Dagger #455, Guice | https://github.com/google/dagger/issues/455 |
| Совместимость со стандартом на границах (`use`, `asyncDispose`) | TC39 ERM, Node ≥ 24.2 | https://github.com/tc39/proposal-explicit-resource-management |

## 7. Чьи ошибки не повторяем

| Ошибка | Где была | Наш ответ |
|---|---|---|
| Очистка обрывается на первой ошибке | NestJS #17039 (исправлено в v12), .NET DI до 10 включительно (#86426 → #123342, .NET 11), Angular `R3Injector.destroy` | инвариант 7 + тест |
| Неверный порядок между модулями | NestJS #14118, исправление в v12 помечено breaking | порядок из структуры (раздел 4) |
| После неудачного init ничего не освобождается | NestJS #17966 (влит 2026-10-01) | attempt-scope закрывает частичную сборку |
| Флаг «закрыт» до работы; повторный close ничего не ждёт | TC39 `AsyncDisposableStack` (второй `disposeAsync` резолвится раньше первого — проверено), Effect #8484, awilix | single-flight (инвариант 8) |
| Добавление в закрытый store: warn и утечка | VS Code `DisposableStore` | инвариант 4 |
| Ошибки только в логах | Spring, NestJS | долг в `CloseReport` |
| Ожидание без предела | Spring async destroy, .NET `StopAsync` | `abandon` + дедлайн Host |
| После дедлайна порядок ломается | OpenClaw (бюджет исчерпан → остальные стартуют без ожидания, вывод из кода) | после `abandon` ничего вне порядка не стартует |
| Поздний результат теряется при отмене | Kotlin `coroutineScope` | инвариант 5 |
| Контейнер угадывает, что закрыть | Spring auto `close`/`shutdown` | только явные `setup`/`use` |
| Долгоживущий scope копит записи | .NET transient disposables, tsyringe | инвариант 12 |
| Вложенный `SuppressedError` как отчёт | TC39 ERM | плоский `debts[]` |
| Неявная мемоизация общих ресурсов | Effect v3 → v4 смена семантики Layer | один владелец, без refcount в v1 |
| Параллельный порядок «угадываем» по графу | TC39 ERM #246 (DAG-disposal, открыт с 2024) | v1 строго последовательный |

## 8. Что сознательно НЕ делаем в v1

| Вырезано | Почему |
|---|---|
| Параллельное закрытие по `bindings` | ломает скрытые зависимости; выигрыш не измерен (3 owning-фабрики из ~14 в AR) |
| `unwind` | ничем не лучше try/catch внутри setup + деления на несколько `setup` |
| `CleanupResult`, readback, 7 состояний | лишний ритуал; `void` = released, throw = failed |
| Глобальный shutdown gate, приватные read-closure, nested FileHandle-протокол | порядок из структуры делает их ненужными |
| `release()` у каждой записи, `move()` | раннее освобождение = `child()`; передача владения = передача `control` |
| refcount/мемоизация общих ресурсов | у общего ресурса один владелец — провайдер |
| Дерево observability, snapshot API | в v1 хватает `CloseReport` с путями |
| Восстановление после краха процесса, hot replace, retry-политики | другая задача (в AR это HC с WAL) |
| Lifecycle hooks / reactive runtime | отдельное исследование, сюда не смешивается |

---

## 9. Масштаб на сотни модулей

- **Стоимость для простых модулей — ноль.** Pure и borrow-only модули не пишут ничего.
- **Одна строка для стандартных ресурсов** (`use`), пара `setup`/`cleanup` для остальных.
- **Scope создаёт обёртка Host**, а не каждый модуль вручную.
- **Время:** последовательный обход 300 модулей — миллисекунды плюс сумма медленных cleanup;
  её ограничивает один дедлайн на корне (`escalate`, затем `abandon`). Параллельность — только по
  замерам и только явно на уровне scope.
- **Память:** O(живые записи + долги).
- **Видимость:** каждый долг с путём (`attempt/orders/session:42/subscription`). Следующий шаг после
  v1 — стек регистрации в dev-режиме (как IntelliJ и VS Code).
- **Проверка всех модулей сразу:** один общий прогон «собрать → закрыть → отчёт complete» по графу
  вместо ручных тестов на каждый модуль.

## 10. Честные риски

- **Скрытые зависимости** (не через slot/порты) ломают порядок. Лечится правилом 2 и ревью, а не
  библиотекой.
- **Утёкший handle нельзя отозвать** — предел JS.
- **После `abandon` не начатые записи остаются неосвобождёнными.** При выходе процесса ОС закрывает
  fd и сокеты, но дочерние процессы и временные файлы могут остаться (решение Q3).
- **Повторная попытка cleanup** (Q2) опасна для cleanup, которые нельзя вызывать дважды
  (например `fs.close(fd)` с переиспользованным номером fd). Такие cleanup должны сами помнить
  своё состояние.
- **Мы не «лучше Effect» вообще.** У Effect типизированные ошибки, модель прерываний и граф Layer,
  но для этого нужен весь Effect runtime. Здесь маленький примитив, который закрывает ошибки,
  найденные у NestJS, Spring, .NET, VS Code и TC39. Претензия «лучше» доказывается только тестами
  на реальном коде.

## 11. Тесты (только рискованные инварианты)

Тесты 6, 8 и 10 уточнены решениями Q11–Q13. Действующий набор с точными утверждениями и
проверенными мутациями — в плане реализации, раздел 7.

1. Место в LIFO в момент fulfil: вложенный setup закрывается в правильном порядке.
2. Throw в одном cleanup не пропускает остальные; причина в отчёте (регрессия Nest #17039).
3. `close()` и `[Symbol.asyncDispose]` параллельно — один полёт; второй не резолвится раньше.
4. `close()` из cleanup того же scope не уходит в рекурсию (stack overflow в наивной реализации).
5. Close ждёт начатый setup; позднее значение чистится; автор получает `ScopeClosedError`;
   unhandled rejection нет.
6. Закрытый scope: setup не вызывается; `use(x)` освобождает x; `child()` бросает.
7. Cleanup-сигнал не aborted от одного начала закрытия, aborted от `escalate`.
8. `abandon`: резолв с `pending`/`not-run`, ничего не помечено released, ничего не стартовало вне
   порядка; следующий `close()` продолжает.
9. Ребёнок отцепляется при `complete`; ребёнок с долгом остаётся видим в отчёте родителя.
10. Родитель передаёт `escalate`/`abandon` ребёнку, который уже закрывается сам.
11. Обёртка Assembly: сбой на модуле k из n → частичный k и k-1..1 закрыты в обратном порядке.
12. Type-fixture: фабрика получает только `Resources` (нет `close`); cleanup получает `T`.

## 12. Объём

| Часть | LOC |
|---|---|
| Примитив scope | 200–300 |
| Обёртка Assembly | 30–40 |
| Тесты (12 выше) | 300–450 |
| Документация и 3 эталонных адаптера | 80–150 |
| **Итого, сам пакет** | **~650–950** |
| Интеграция в GM (ADR, CMS, Foundation, build, packed-root, правки чекпоинтов) | +400–700 |
| **Итого с GM** | **~1 050–1 650** |

Ориентир интеграции — как добавляли lifecycle-kernel: `461bff0` (+680, admission) и `24d6557`
(+1 292, пакет), всего около 45 файлов. Из них отдельный admission-чекер на 231 строку + 201 строку
тестов повторять не нужно: переиспользовать или обобщить существующий, а не копировать.

План-предшественник оценивал 1 150–1 800, реалистично 3 500–6 000 — при том что иерархии в
библиотеке там не было.

## 13. Решения владельца (приняты 2026-10-01 и 2026-10-02)

- **Q1 — продолжать.** Ошибка cleanup записывается как долг, очистка идёт дальше (инвариант 7).
- **Q2 — да.** Повторный `close()` после завершения с долгами заново пытается `failed`/`not-run`
  записи. Автоматических повторов нет.
- **Q3 — не запускать вне порядка.** После `abandon` ничего не стартует вне порядка
  (инвариант 11). Уточнено Q13: abandon касается только вызывающего, а не начатые записи
  освобождаются по порядку, когда завершится идущий cleanup, без нового `close()`.
- **Q4 — сразу пакет в GM.**
- **Q5 — модель ответственности зафиксирована:** модуль пишет **как** освободить свои ресурсы,
  Host решает **когда** (дедлайны, эскалация, abandon, повторная попытка, health), GM даёт
  **механизм** scope. Обоснование и ограничение для недоверенных плагинов — раздел 14.
  Подробный план реализации: `module-resource-scopes-implementation-plan-2026-10-01.md`.
- **Q6 — публикация на npm сразу:** первый релиз `0.1.0` вместе с обычным потоком релизов GM.
- **Q7 — ADR принят владельцем** на основе этого дизайна (допуск пакета, замена направления C0
  `ownership`/K1 из ADR-0028, разделение: механизм в GM, власть у Host). Разделение записывается в
  ADR-0030 и CMS; `system-boundary.md` закреплён по байтам и не правится (раздел 14).
- **Q8 — версии:** обязательств совместимости нет ни в одном репозитории; пакеты на 0.x, breaking
  change — minor-релиз с гайдом миграции, мажор на каждый break не поднимаем; потребители
  обновляются сами (общее правило: org Engineering Quality Standard, PR agent-teams-ai/.github#328).
- **Q9 — общий health-контракт потери зависимости:** отложен как редкий случай.
- **Q10 — изоляция недоверенных плагинов: реализацию откладываем, правило пишем сейчас.** Сегодня
  ни один наш Host не грузит сторонний JS в свой процесс. Extension Foundation ADR-0006
  уже требует: «Only product-built and fully trusted code may run in-process… Third-party code
  requires a runtime the host can terminate». Когда появится первый сторонний плагин с кодом,
  supervisor и политику держит product Host (AR переиспользует host-custody), Extension Foundation
  даёт узкий контракт исхода и conformance-тесты. В `@get-modular/resources` уже сейчас учесть:
  (1) в ADR и Consumer Module Standard: scope — кооперативная очистка доверенного кода, `complete` =
  «cleanup отработал», сторонний код через `scoped()` не собирается; (2) изолированный плагин — одна
  запись `setup`/`cleanup` в scope Host, эталонный адаптер процесса убивает **группу** процессов по
  `escalate`; (3) `Debt.path`/`Debt.state` сериализуемы, `Resources` не входит в будущий SPI плагинов.
  Не добавлять kill/worker в пакет, не строить PluginManager, не считать `worker.terminate`, `node:vm`
  или permission model границей безопасности. Цитата проверена в EF ADR-0006 (строки 100–102); в
  тексте EF ADR-0011 ссылки на неё нет, поэтому ссылаемся только на ADR-0006.

Q11–Q13 приняты позже в тот же день, после финальных исследований динамики и критики плана
реализации:

- **Q11 — динамика: экземпляры вместо мутации графа.**
  - Assembly 0.3.0 добавляет `run({ signal, scope, inputs })` и `bindInput`. Заготовка готовится
    один раз, у каждого run свой scope и свои объявленные входы; входы несут и порты родителя.
  - `FactoryContext` закрыт: `{ signal, scope }`, мешка сервисов нет. Поле названо `scope`, а не
    `owner`: у деклараций уже есть `owner { authority, path }`. Assembly от `resources` не
    зависит, тип поля `unknown`.
  - Core и lifecycle-kernel не меняются, живой мутации графа нет.
  - `scoped(name, factory)` берёт родителя из `scope` текущего run и не передаёт его модулю.
  - Опция `child({ order: "concurrent" })` нужна для массового закрытия независимых сессий; по
    умолчанию LIFO по одной.
  - Решение записывает ADR-0031.
- **Q12 — два поезда релизов.**
  - Поезд 1: Core/Assembly 0.3.0. У Core меняется только номер версии, потому что Core и Assembly
    выпускаются точной парой. В поезд входят `@get-modular/resources` 0.1.0 и тонкий
    `@get-modular/conformance` 0.1.0; conformance может уйти в следующий minor.
  - Поезд 2: Core/Assembly 0.4.0, ревизии контрактов (`revision` + `compatibleFrom`, без token и
    без `/v2`) и `checkNamespaces`.
  - Публикация на npm через changesets и release-PR, как у 0.2.0.
- **Q13 — abandon только для вызывающего.**
  - Тот, кто передал `abandon`, сразу получает текущий отчёт.
  - Закрытие продолжается по порядку в фоне, остальные ждущие, включая родителя, ждут дальше.
  - Вне порядка ничего не стартует.
  - Q1 (продолжать после ошибки) и Q2 (повтор при повторном `close()`) остаются.

Q14–Q18 приняты 2026-10-02 (ответы на вопросы плана реализации, глубокие ревью и ревью гейтов AR;
исполнение — редакция 3 плана):

- **Q14 — `use()` после начала закрытия.** Бросает `ScopeClosedError` (`resources.scope.closed`),
  значение на учёт не берётся и остаётся у автора, как `DisposableStack.use` в TC39 (инвариант 4).
  Заменяет строку «Добавление в закрытый scope: освободить и бросить» в таблице раздела 6 и
  формулировку теста 6 в разделе 11 («`use(x)` освобождает x»): действует правило Q14.
- **Q15 — builder в поезде 1.** Assembly 0.3.0 (ADR-0032) получает `defineContract` (дескриптор
  у владельца контракта), `declareModule` (авторы не пишут wire-литералы) и `CapabilitiesOf`; builder
  порождает текущий wire. Поезд 2 меняет только внутренности builder, Core читает схему N-1, сотни
  деклараций не переписываются. Владелец builder — Assembly: у Core закрытый список экспортов
  (ADR-0009), и в поезде 1 Core меняет только версию.
- **Q16 — композиция фрагментов в Assembly 0.3.0.** Handle типизируется только используемыми
  capability, а не всей картой Host: команды и репозитории пишут модули независимо, Host их собирает.
  `ModuleFactory` возвращается без глобального `C`. Замер на 500 handles: как нынешний ручной способ,
  если большие карты объявлены как `interface`.
- **Q17 — гейты AR не удалять.** Мешающий гейт выводится из триггеров или `check` с комментарием
  «почему и когда вернуть», код остаётся; аддитивные замены (macOS-job для embedded-runtime, одна
  общая проверка пина CMS) разрешены. То же правило — для замороженных assert'ов в GM.
- **Q18 — упаковка и ошибки до публикации.** Модульные пакеты зависят от пакетов GM только через
  `peerDependencies` с диапазоном одного 0.x minor; у Host одна копия GM; ошибки различаются по
  стабильному префиксному `code` (`resources.*`, `assembly.*`; диагностики Core сохраняют коды
  каталога), никогда по `instanceof`; правило в CMS.

Технические правки API до первой публикации (глубокие ревью 2026-10-02, без отдельного решения
владельца): `cleanup` получает `{ escalate }`, `setup` — `{ signal }`; имена обязательны в `setup`,
`use`, `child`, `createScope`; опции `signal` у scope нет; ошибки `ScopeClosedError`,
`CloseIncompleteError`, `InvalidArgumentError` с кодами `resources.<область>.<причина>`; `scoped()`
вырезает только `scope`; необязательные поля опций допускают `undefined`; `Debt` — размеченное
объединение, `CloseReport.settled` отличает снимок abandon от итога.

## 14. Путь поставки в GM (следствие Q4)

**Место в get-modular.** Это часть одной модульной системы, разбитой на пакеты одного монорепо и
одного бренда:

| Пакет | Отвечает за | Зависит от |
|---|---|---|
| `@get-modular/core` | описание модулей и компиляция композиции (граф, `dependencyOrder`, `bindings`) | — |
| `@get-modular/assembly` | создание экземпляров по плану, последовательно; с 0.3.0 `run({ signal, scope, inputs })` и `bindInput` (Q11) | core (точная пара версий) |
| `@get-modular/resources` (новый) | ресурсы экземпляра: scope, LIFO, close, отчёт о долгах | — |
| `@get-modular/conformance` (поезд 1 или следующий minor) | dev-only кит авторов модулей: `isolate`, `smoke`, `runContractSuite`, `guardHandles` | peer: core, assembly, resources (отдельный ADR уточняет ADR-0003) |
| `@get-modular/lifecycle-kernel` (кандидат) | generation/lease для dynamic plugin Host | — |

Пакеты не импортируют друг друга сверх таблицы. Связка resources ↔ assembly — это `scoped()` из
раздела 4: Assembly передаёт непрозрачный `scope`, resources его читает, импорта нет. Пакет
опциональный: pure-модулям и простым Host он не нужен (принцип ADR-0003: отдельный пакет только за
реальное поведение).

**Граница системы: `docs/architecture/system-boundary.md` не правим, разделение пишем в ADR-0030
и CMS.**
- **Почему не правим.** Байты документа закреплены в
  `architecture/authority/accepted-authorities.json`. Digest реестра зашит в `governance.mjs` и
  якорем в принятом ADR-0007, так что правка требовала бы отдельного решения о перепривязке
  реестра. ADR-0023 и ADR-0029 тоже допускали пакеты, не трогая его.
- **Что документ говорит сейчас.** GM «does not … execute product lifecycle», cleanup принадлежит
  product Host, и «No Get Modular API may become a service locator or a second lifecycle
  authority».
- **Почему это остаётся верным.** Пакет даёт только **механизм**: выполнить зарегистрированные
  cleanup в правильном порядке, когда держатель `control` попросил. **Власть** остаётся у Host:
  когда закрывать, дедлайны, эскалация, abandon, повтор, health.
- **Где записано разделение:** раздел «Mechanism and authority» в ADR-0030 и раздел CMS «Module
  resource scopes».

**Почему именно так (индустрия).** Зрелые системы делят ответственность по знанию: модуль знает,
**как** освободить свои ресурсы, а хост или контейнер — **когда** и **в каком порядке**:

| Система | Как (пишет модуль) | Когда и порядок (решает хост) |
|---|---|---|
| Spring / NestJS / .NET DI / Angular | `@PreDestroy`, `onModuleDestroy`, `Dispose`, `DestroyRef` | контейнер: порядок по зависимостям, таймауты фаз |
| Erlang/OTP | `terminate/2` процесса | supervisor: обратный порядок, `shutdown`-таймаут, `brutal_kill` |
| Kubernetes | обработчик SIGTERM в приложении | kubelet: grace period, затем SIGKILL |
| Effect / TC39 / VS Code / IntelliJ | регистрация в scope тем, кто получил ресурс | владелец scope закрывает его |
| Guice / Dagger | механизма нет | каждый пишет свой вручную |

GM — библиотека для разных хостов (CLI, Electron, сервер), поэтому ей подходит модель
Effect/TC39 (механизм scope), а не модель Spring/Nest (фреймворк сам владеет остановкой процесса).
Нынешняя граница правильно не пускает в GM политику, но запрет общего механизма привёл к сценарию
Guice/Dagger: в AR 4–6 самописных стеков с разной политикой ошибок.

**Ограничение:** cleanup модуля — это обещание его собственного кода. Для доверенных модулей в одном
процессе этого достаточно. Для недоверенных или сторонних плагинов Host обязан уметь забрать ресурсы
без участия модуля (изоляция в процессе или worker, kill — как SIGKILL в k8s или `brutal_kill` в OTP).
Это остаётся на уровне Host (AR host-custody, lifecycle-kernel), а не в этом пакете.

1. **Имя.** Рекомендую `@get-modular/resources` (`packages/resources`): совпадает с API
   `module.resources` и не конфликтует с ADR-0028. Альтернатива — переиспользовать
   `@get-modular/ownership`, но тогда ADR-0028 надо явно заменить целиком.
2. **Новые ADR (до исходников).** Принимаются одним docs-PR.
   - **ADR-0030** допускает этот callback/Promise-контракт как опциональный публичный пакет. Он
     явно фиксирует, что C0 `OwnershipScope` из ADR-0028 и K1 больше не развиваются и этот пакет
     их заменяет, без второго параллельного контракта. ADR-0028 получает `superseded_by`. Принятые
     ADR не переписываются, только заменяются новым. Пакет отвязан от S3 → G1 → K1 (S3 закрыт
     решением 2026-09-25).
   - **ADR-0031** допускает пару Core/Assembly 0.3.0 с `scope` и `inputs` (Q11).
   - **GM ADR-0006** (нормализация компилятора) не связан с EF ADR-0006, поэтому в `related` его не
     ставим.
3. **Consumer Module Standard** (`docs/architecture/common-assembly.md`). Добавить раздел про
   ресурсы модуля и обёртку Assembly. Обновить профили потребителей и пины
   (`modularity-host-TEST/third_party/standards`, AR `architecture/get-modular/consumer-profile.json`)
   по правилу AGENTS.md: сравнить пин с upstream, зафиксировать дельту.
4. **Чекпоинты.** Обновить в той же поставке, иначе `pnpm check` (precheck) упадёт:
   - `tests/ownership-checkpoint.test.mjs` пинит хеш CMS (`:130`), статус и байты ADR-0028, хвост
     реестра ADR, lock importers и `packageRoots`. Сравнение переводится на замороженные данные из
     git.
   - Пару 0.3.0 проверяют `assembly-admission.mjs:90`, `production-artifacts.mjs` и
     `sdk-growth.mjs:181`.
5. **Пакет.** Публичный с первого релиза (Q6).
   - Версия `0.0.0` плюс minor-changeset, `0.1.0` выставляет release-PR (Q12).
   - `engines` = `SUPPORTED_NODE_RANGE` (`>=24.18.0 <25 || >=26.10.0 <27`,
     `architecture/checks/node-version.mjs:4`).
   - Ноль runtime-зависимостей; Core/Assembly его не импортируют.
6. **Гейты.**
   - Существующие Foundation-проверки (`packageRoots`, границы, packed-root) через обобщённый
     допуск leaf-пакетов, без копии чекера kernel.
   - Тесты рискованных инвариантов из плана реализации (раздел 7): подпроцесс памяти, тест на
     50 тыс. детей, интеграция с настоящими Core и Assembly.
   - Без replay/hash-матриц из плана-предшественника.
7. **Первый реальный потребитель.** AR: заменить хотя бы ordinary host и Darwin deployment
   (два материально разных scope) на этот пакет. Это проверка, что контракт годится, а не TEST-демо.

Перед реализацией: сравнить пин CMS у потребителей с текущим upstream (AGENTS.md, Consumer Module
Standard maintenance).
