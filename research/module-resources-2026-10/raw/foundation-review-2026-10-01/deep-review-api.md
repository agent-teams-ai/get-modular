# Глубокое ревью публичного API: устойчивость к будущим изменениям

Дата: 2026-10-02. Линза: формы, которые сотни модулей пишут руками и которые потом пришлось бы ломать.
Прочитано: план ресурсов (ред. 2) и дизайн, `README.md` и ревью поезда 2 в этой папке, критики плана,
get-modular `9c722ce` (Core/Assembly `index.ts`, `wire-types.ts`, `types.ts`, ADR-0009), прототипы
`impl-plan-v2`, `dyn-final-a/b`, AR `runtime-setup-assembly.ts`. Уже исправленное (abandon, `scope` вместо
`owner`, `ModuleContext`, O(1)-дети, `use()` после close) не повторяю.

Проверки: `scratchpad/deep-api/`, `tsc7` 7.0.2 и TS 5.8.3 (`typescript-minimum` GM), строгий профиль
EF (`exactOptionalPropertyTypes: true`), Node 26.9.0. Каждая `@ts-expect-error` проверена снятием директивы.

**Срок.** Правки поезда 1 нужно внести до GM-2: ADR-0030 перечисляет имена `SetupSpec`,
`ResourceContext`, `ScopeCloseError`, а его байты пинятся. И до R-1: версию на npm нельзя перезалить.

## CRITICAL

### C1. Поезд 2: авторы вручную пишут wire-формат, каждое поколение правит каждую декларацию

**Сейчас.** `defineModule` только передаёт объект дальше, и ADR-0009 это закрепляет. Поэтому каждая
декларация сама пишет `kind`, `schemaVersion: 1` и `compatibility { family, familyVersion, token }` в каждом
`provides` и `slots`. Кроме того, Host вручную пишет карту `C` с записями `CapabilityContract<V, Token>`.
В AR `runtime-setup-assembly.ts` это 16 литералов `compatibility` и 8 строк карты на 7 модулей с одним
token на все. Поезд 2 меняет wire: `revision`/`compatibleFrom`, token убирается, `schemaVersion: 2`.

**Почему больно.** Поезд 2 переписывает руками каждую строку `provides`/`slots` и каждую запись карты
`C`, и так в каждом следующем поколении. Codemod тут не поможет. Литералы найти легко (якорь
`kind: "get-modular.module-declaration"`), но ревизию из token не вывести: в AR один token покрывает
8 контрактов. Плагины с собственным wire сломаются все разом (flag day).

**Предлагаю (поезд 2, то же wire-поколение).**
- Дескриптор контракта: один на capability, держит его владелец контракта.
  `defineContract<V>()({ id, revision, compatibleFrom })` с методами `provide()` и
  `slot(slotId, cardinality)`. Это заодно снимает вопрос M4 критики связности: `compatibleFrom` живёт у
  владельца контракта, а не у провайдера.
- `declareModule(...)` сам заполняет `kind` и `schemaVersion`. Нужен ADR-преемник правила ADR-0009 о
  хелперах.
- `CapabilitiesOf<typeof A | typeof B>` в Assembly выводит карту `C` из дескрипторов.
- `ValidDeclaration` сравнивает только id и тип значения. Диапазон ревизий проверяет Core во время
  выполнения. Иначе слот на старой совместимой ревизии не пройдёт проверку TS, хотя Core его примет.
- Правило CMS: литерал `compatibility` вручную не писать.

Проверено: `deep-api/contract.ts`, около 45 строк. Прототип выдаёт сегодняшний wire v1, работает с
опубликованным Core 0.2.0 и кандидатом Assembly 0.3.0, полный путь compile → prepare → run →
close даёт `complete`. Вывод `deps` сохраняется, несуществующий slot и чужая ревизия отклоняются, типы
проходят на обоих компиляторах. Поезд 2 меняет только тело `defineContract`.

**Цена отсрочки:** все декларации и карты `C` вручную, в каждом поколении.
Надёжность 8, уверенность 7.

## HIGH

### H1. В cleanup поле `signal` означает эскалацию (план 4.2 `ResourceContext`)

**Сейчас.** Один тип `{ signal }` у `setup` («прекрати получать») и у `cleanup` («освобождай
быстрее»). Смыслы противоположные. Перенесённый из setup шаблон `if (signal.aborted) return` в cleanup
вернёт `void`, и запись посчитается освобождённой, хотя ресурс ещё удерживается. В .NET тот же
вопрос: токен `StopAsync` «Indicates that the shutdown process should no longer be graceful»
([MS Learn](https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.hosting.ihostedservice.stopasync)).
Исследование хуков уже просило один раз определить «четыре сигнала», в плане этого нет.

**Предлагаю:** `SetupContext { signal }` и `CleanupContext { escalate }`, то же имя, что у
`CloseOptions.escalate`.

**Цена отсрочки:** правка каждого cleanup с деструктуризацией. Вынесенные из литерала cleanup
codemod не найдёт. Надёжность 8, уверенность 7.

### H2. Имена записей необязательны (`setup.name?`, `use(value, name?)`, `child({ name? })`)

**Почему больно.** Безымянная запись получает `#n` по порядку регистрации. Путь долга меняется от
любой правки модуля, а `Debt.path` объявлен публичным контрактом (по нему пишут алерты и списки
допустимых долгов). Сделать поле необязательным потом можно без поломок, сделать обязательным —
поломка каждого вызова.

**Предлагаю:** `name` обязателен в `setup`, `use`, `child`, `createScope`. Все примеры дизайна, CMS и
эскизы AR и так дают имена, цена около нуля. Ошибка TS читаемая: «Property 'name' is missing».
Надёжность 8, уверенность 7.

### H3. Нет `ModuleFactory` (план 5.1), хотя `README.md` обещал его в 0.3.0

**Почему больно.** Модуль, который экспортирует фабрику для своих тестов (`isolate`), копирует
развёрнутый тип `(deps: FactoryDependencies<C, D>, ctx: ModuleContext) => Promise<FactoryProduct<I,
FactoryCapabilities<C, D>>>`. Сотни копий: любая эволюция контекста или продукта ломает каждую по
отдельности, и codemod не за что зацепить. Ошибки и так печатают литерал декларации целиком: проверено,
для прямого `bindFactory` и внутри `scoped()` одинаково. Именованный тип остаётся единственной точкой
эволюции.

**Предлагаю:** `ModuleFactory<C, D, I, X = FactoryContext>` в Assembly; модуль пишет
`ModuleFactory<Caps, typeof decl, I, ModuleContext>`. Проверено (`exp3`).
Надёжность 8, уверенность 8.

### H4. `ScopeOptions.signal` нарушает соглашение об AbortSignal

**Сейчас.** Abort этого сигнала только запрещает новые получения, scope не закрывается. Обычный смысл
опции `signal` другой: DOM требует «rejecting any unsettled promise with the AbortSignal's abort reason»
([DOM](https://dom.spec.whatwg.org/#abortcontroller-api-integration)). План сам запрещает передавать сюда
сигнал запроса (CMS, README) и ни одного потребителя у опции нет. Самая вероятная ошибка Host —
`child({ signal: request.signal })` в расчёте на очистку. Итог — тихая утечка до явного close.

**Предлагаю:** убрать опцию из 0.1.0, механизм остаётся приватным для `scoped()`. Если дренажу Host
понадобится «прекратить получение», добавить отдельное поле с честным именем (`stopAcquiring`) —
это аддитивно. Надёжность 7, уверенность 7.

## MEDIUM

### M1. Модель ошибок: имена, коды, ошибка неверного вызова

- `ScopeClosedError` и `ScopeCloseError` отличаются одной буквой, при автодополнении проверка
  `instanceof` молча ошибается.
- Код `scope-closed` без префикса пакета, хотя у Assembly схема `assembly.bind.*`. Схему
  `<pkg>.<area>.<reason>` просило и исследование хуков.
- У `ScopeCloseError` кода нет.
- Неверный `run({ scope })` даёт голый `TypeError`. Типичный случай — `scope: attempt` вместо
  `attempt.resources`, второй — две копии пакета. Host различит его только по тексту сообщения, а Node
  прямо советует: «Use `error.code` to identify an error instead»
  ([Node](https://nodejs.org/api/errors.html)).

**Предлагаю:** `resources.scope-closed`; `CloseIncompleteError` с кодом `resources.close-incomplete`;
`InvalidRunScopeError extends TypeError` с кодом `resources.invalid-run-scope` и подсказкой «pass
`scope.resources`». В CMS сравнивать `code`, а не `instanceof`. Надёжность 8, уверенность 7.

### M2. `scoped()` закрывает контекст сам, поэтому resources выпускается синхронно с Assembly

**Сейчас.** Обёртка отдаёт ровно `{ signal, resources }`. Любое будущее поле `FactoryContext` не дойдёт
до обёрнутых модулей без релиза resources, а версионной связи между пакетами нет: зависимостей ноль.

**Предлагаю:** обёртка вырезает только `scope`:
`scoped<Deps, R, X extends { signal; scope }>(name, f: (deps, ctx: Omit<X, "scope"> & { resources }) => R)`.
Закрытость контекста обеспечивает одно место — `FactoryContext` (ADR-0031), тест A4 для 0.3.0 не
меняется. Проверено (`exp6`): вывод `deps` сохраняется, `ctx.scope` отклоняется, новое поле проходит.
Надёжность 7, уверенность 6.

### M3. `exactOptionalPropertyTypes` в базовом пресете EF

`close({ escalate: opts.escalate })`, `createScope({ name })` и `run({ signal })` с `T | undefined`
дают TS2379 на обоих компиляторах (`exp1`). Это касается и уже опубликованного `RunOptions`, поэтому Host
вынужден писать условные spread.

**Предлагаю:** все поля входных опций объявлять как `?: T | undefined`. Расширение входного типа ничего
не ломает, но правка дешёвая и полезна каждой обёртке Host. Надёжность 9, уверенность 9.

### M4. Форма `checkNamespaces` (поезд 2)

**Предлагаю:** `checkNamespaces({ declarations, policy })` с объектом опций вместо позиционных
аргументов, чтобы потом добавить `grants` или `profile` без поломки. Находки в той же оболочке, что
`Diagnostic` (`code`, `path` из `{ kind, value }`, `coordinate`), с кодами `namespace.*`. Тип отдельный:
`DiagnosticCode` не расширять, иначе ломаются полные карты перевода у Host (ADR-0009).
Надёжность 7, уверенность 6.

## LOW

- `Debt` как размеченное объединение: `cause` есть только у `failed`. Позже это сломало бы чтение без
  сужения типа.
- `CloseReport.settled`: снимок после abandon сейчас отличим от итогового отчёта только по наличию
  `pending`.
- `Scope` тоже `AsyncDisposable`: в `await using` нельзя деструктурировать, и тестам приходится писать
  `await using c = scope.control`.
- CJS-сборку не выпускать никогда: бренд на `WeakMap` и `instanceof` ломаются на двух экземплярах
  модуля. CJS-потребитель обходится `require(esm)` (статус стабильности в Node 24.18 не проверен).
- Признак результата уже назван тремя способами: `ok` в Core, `status` в Assembly, `complete` в
  resources. Четвёртый не вводить, новые API используют `status`.

## Что правильно и трогать не надо

- Объекты опций в `setup`, `child`, `close`, `run`. TanStack v5 пришёл к этому через breaking
  change: «now we only support the object format»
  ([TanStack](https://tanstack.com/query/latest/docs/framework/react/guides/migrating-to-v5)).
- Две фасетки `Resources` и `ScopeControl`.
- AbortSignal для `escalate` и `abandon`.
- Закрытые объединения кодов с полными картами (ADR-0009).
- `Debt.path` как массив.
- Generic-обёртки над `PreparedAssembly<R, N>` компилируются без приведений (`exp5`).

Уроки, которые учтены выше: TanStack переименовал `cacheTime`, потому что «Almost everyone gets
`cacheTime` wrong». Zod 4 убрал параметры, «hastily added years ago»
([Zod](https://zod.dev/v4/changelog)). Имена, которые вводят в заблуждение, дешевле исправить до
первого релиза.

## API to freeze now

Проверено `tsc7` и TS 5.8.3 (`deep-api/freeze.d.ts`, `freeze-use.ts`).

```ts
// @get-modular/resources 0.1.0
export type SetupContext = { readonly signal: AbortSignal };      // "stop acquiring"
export type CleanupContext = { readonly escalate: AbortSignal };  // "release faster"; never "skip"
export type SetupSpec<T> = {
  readonly name: string;
  readonly setup: (context: SetupContext) => T | PromiseLike<T>;
  readonly cleanup: (value: T, context: CleanupContext) => void | PromiseLike<void>;
};
export type ScopeOptions = { readonly name: string; readonly order?: "reverse" | "concurrent" | undefined };
export type CloseOptions = { readonly escalate?: AbortSignal | undefined; readonly abandon?: AbortSignal | undefined };
export type Debt =
  | { readonly path: readonly string[]; readonly state: "failed"; readonly cause: unknown }
  | { readonly path: readonly string[]; readonly state: "pending" | "not-run" };
export type CloseReport = { readonly complete: boolean; readonly settled: boolean; readonly debts: readonly Debt[] };
export interface Resources {
  readonly signal: AbortSignal;
  setup<T>(spec: SetupSpec<T>): Promise<T>;
  use<T extends AsyncDisposable | Disposable>(value: T, name: string): T;
  child(options: ScopeOptions): Scope;
}
export interface ScopeControl extends AsyncDisposable { close(options?: CloseOptions): Promise<CloseReport> }
export type Scope = { readonly resources: Resources; readonly control: ScopeControl };
export type ModuleContext = { readonly signal: AbortSignal; readonly resources: Resources };
export declare function createScope(options: ScopeOptions): Scope;
export declare function scoped<Deps, R, X extends { readonly signal: AbortSignal; readonly scope: unknown }>(
  name: string,
  factory: (deps: Deps, context: Omit<X, "scope"> & { readonly resources: Resources }) => R,
): (deps: Deps, context: X) => R;
export declare class ScopeClosedError extends Error { readonly code: "resources.scope-closed"; readonly path: readonly string[] }
export declare class CloseIncompleteError extends AggregateError { readonly code: "resources.close-incomplete"; readonly report: CloseReport }
export declare class InvalidRunScopeError extends TypeError { readonly code: "resources.invalid-run-scope" }

// @get-modular/assembly 0.3.0: additions to plan section 5.1
export type ModuleFactory<C, D extends ModuleDeclaration, I, X = FactoryContext> =
  (dependencies: FactoryDependencies<C, D>, context: X) => Promise<FactoryProduct<I, FactoryCapabilities<C, D>>>;
export type RunOptions<N = {}> = {
  readonly signal?: AbortSignal | undefined; readonly scope?: unknown; readonly inputs?: RunInputs<N> | undefined;
};

// Train 2 (Core/Assembly 0.4.0): authors never write wire compatibility
export declare function defineContract<V>(): <const Id extends string, const Rev extends number>(
  spec: { readonly id: Id; readonly revision: Rev; readonly compatibleFrom: number }) => Contract<Id, V, Rev>;
export type Contract<Id extends string, V, Rev extends number> = {
  readonly id: Id; readonly revision: Rev; readonly compatibleFrom: number;
  provide(): ProvidedEntry<Id, Rev>;                                   // wire shape private to the generation
  slot<const S extends string, const K extends Cardinality>(slotId: S, cardinality: K): SlotEntry<Id, Rev, S, K>;
};
export declare function declareModule<const T extends Omit<ModuleDeclaration, "kind" | "schemaVersion">>(spec: T): ModuleDeclarationOf<T>;
export type CapabilitiesOf<T extends Contract<string, unknown, number>> = { readonly [K in T as K["id"]]: CapabilityContractOf<K> };
export declare function checkNamespaces(input: { readonly declarations: readonly ModuleDeclaration[]; readonly policy: NamespacePolicy }): readonly NamespaceFinding[];
```

Типы `ProvidedEntry`, `SlotEntry`, `ModuleDeclarationOf`, `CapabilityContractOf`, `NamespacePolicy` и
`NamespaceFinding` определяет ADR поезда 2. Форма `NamespacePolicy` здесь не проверена.
