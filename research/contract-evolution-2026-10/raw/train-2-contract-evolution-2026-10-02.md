# Поезд 2: эволюция контрактов (Core/Assembly 0.4.0) — ADR, цена, швы, риски

Дата: 2026-10-02. Статус: архитектурный план, код в репозиториях не менялся. База: get-modular `origin/main`
`0023106` (ADR-0030/0031/0032 приняты, GM-3 ещё не реализован). Чтение шло через одноразовый клон
во временном каталоге; рабочая копия GM не тронута.

Входы: wire-типы и проверка совместимости Core, каталог и процесс поколений диагностики (ADR-0004…0007,
0021, 0022, ledger'ы, снапшоты), ADR-0009, ADR-0031/0032, ревью `capability-evolution-{industry,minimal,scale}`,
`deep-review-{api,scale}`, сводка `README.md`, план GM-3, раздел 13 принятого плана реализации ресурсов.

## 0. Что учтено и что я проверил сам

### 0.1 Решения владельца

- Одна монотонная линия на контракт, без `/v2` в id. Провайдер объявляет `revision` и `compatibleFrom`.
  Ревизия потребителя задаётся версией пакета контракта, который модульный пакет держит обычной
  зависимостью. Подъём `compatibleFrom` выходит новым minor пакета контракта. Привязка разрешена, если
  `compatibleFrom <= consumer.revision <= provider.revision`. Старый `compatibility {family, familyVersion, token}`
  удаляется. Ломающее изменение делается на месте, с гайдом миграции.
- Типы по ревизиям обязательны. Авторы не пишут wire руками: в поезде 2 меняются только внутренности builder.
- Core читает схему N-1. Коды каталога диагностики не переименовываются. `checkNamespaces` живёт в
  conformance. Ломающие изменения в 0.x выходят как minor.
- **Новое, 2026-10-02:** поезд 2 начинается сразу после поезда 1 и миграции AR. Сторонние плагины
  собираются отдельно, общей проверки TypeScript при сборке Host у них нет, поэтому
  настоящей защитой должна быть runtime-проверка Core с понятной диагностикой. У AR нет реальных развёрнутых
  данных, его миграция может быть чистым разрывом.

### 0.2 Проверки (временный каталог)

| # | Что | Результат |
|---|---|---|
| V1 | клон `0023106` = `origin/main` | совпадает; 9c722ce — его предок |
| V2 | проверка совместимости сегодня | `binding-record.ts:56`: только `capability.compatibility.token !== slot.compatibility.token`; `family`/`familyVersion` — константы схемы |
| V3 | TS-эскиз типов поезда 2 (`sketch/types.ts`, `use.ts`) | tsc 7.0.2 и TS 5.8.3, NodeNext и Bundler, `exactOptionalPropertyTypes` true и false: 0 ошибок. 8 `@ts-expect-error` × 2 компилятора срабатывают ровно на охраняемой строке, посторонних ошибок нет (`expect.mjs` снимает директивы по одной) |
| V4 | совместимость d.ts, выпущенных под поезд 1 | d.ts в арности GM-3b (`Contract<Id,V,Rev>`, `ProvidedEntry<Id,Rev>`, `SlotEntry<Id,Rev,S,K>`, `Declared<T>`) под типами поезда 2 разрешается заново. Host с окном 3..4 связывает и готовит оба модуля, на обоих компиляторах (`prebuilt.d.ts`, `host-prebuilt.ts`). Declaration emit обоих компиляторов сохраняет имена алиасов |
| V5 | runtime builder и подъём N-1 (Node 26.9, strip types) | builder выдаёт wire v2. Отвергает ревизии `0`, `1.5`, `2^31`, а также `compatibleFrom > revision`. `liftPreviousToken`: `acme/db/r3` даёт 3, а `r03`, `/v1` и `agent-runtime/setup-v1` подъём не проходят |
| V6 | инвентаризация `familyVersion` | 107 файлов и 215 вхождений на `0023106`. Из них 15 — архив ревью в `research/` (PR #130), 92 — вне `research/`. Классификация в разделе 2.1 |
| V7 | корпус generation two (локальные копии Core) | 818 полных исходов, все `ok: false`; 49 содержат `binding.compatibility-mismatch`. Token'ы: `example/service/v1`/`v2` (5 419 записей), `example/link`, равный id (28 737), `a/k` (12) |
| V8 | тесты Core, которые затронет поезд 2 | 54 файла: 31 читает неизменяемые векторы, 34 содержат wire-литералы (11 пересекаются) |
| V9 | ожидаемые планы в исторических корпусах | 23 плана (2 canonical, 15 normalization, 6 examples) и 4 закреплённых литерала digest в тестах. В корпусе gen-2 успешных исходов нет |
| V10 | AR `origin/main` `a196056f` | 10 строк wire-литералов в 4 файлах; 18 capability на двух общих token |

**Не проверено.** Скорость проверки типов с ключами по ревизиям на 500 и 1000 handles. Чувствительность
байтовых и ресурсных граничных кейсов к перезаписи token (см. 2.3, п. 4). Реальное число падающих тестов Core:
его я считал статически, а не прогоном. На диске `/System/Volumes/Data` свободно **233 МБ**. `pnpm install` в
клоне означал бы риск заполнить диск и уронить чужие процессы, поэтому полный прогон я не запускал.

### 0.3 Главные выводы

1. **Типы по ревизиям — плоские ключи `id@revision`.** Механика бренда GM-3b (`CapabilityBrand`,
   `KnownCapabilities`, `AnyFactoryHandle`, `prepare`) остаётся без изменений. Меняются только вывод ключей
   (`UsedCapability`, `CapabilitiesOf`) и три поисковых типа. Окна миграции и адаптер компилируются; мутация
   опубликованной ревизии ловится. Проверено (V3).
2. **`defineContract<V, Earlier = {}>()({ id, revision, compatibleFrom? })` аддитивен над поездом 1.**
   Дескрипторы и d.ts, выпущенные под 0.3.0, компилируются без правок (V4). Форма из раздела 13.1 плана,
   `defineContract<{ 2: V2; 3: V3 }>()`, меняла бы смысл первого параметра и ломала бы каждый дескриптор.
3. **Новых кодов диагностики нет.** Каталог остаётся прежним: 33 кода, 32 эмитируемых. Меняются только
   `details` у `binding.compatibility-mismatch`: появляются `reason` и номера ревизий. Этого хватает, чтобы
   Host плагинов сказал, какую сторону обновлять.
4. **N-1 — строгий подъём кодировки builder `<capabilityId>/r<N>`.** Тот же путь служит мостом для исторических
   корпусов квалификации. Главная экономия: неизменяемые артефакты не трогаем, ретеншн-захват не повторяем.
5. **Поправка к правилу упаковки.** Новым minor пакета контракта должен выходить не только подъём
   `compatibleFrom`, но и **каждый подъём `revision`**. Иначе дедупликация менеджера пакетов молча выдаст
   плагину ревизию, под которую его не собирали (раздел 4, Р3).
6. **Цена поколения при «дельта-преемнике»:** около 1,0–1,15 тыс. строк ручной логики и 1,3–1,8 тыс. строк
   тестов. Фикстуры в основном скопированы или шаблонные. Срок — 10–14 дней последовательно или 6–8
   календарных дней в три линии. Полная регенерация в духе ADR-0021 стоила бы 3–4 недели.
7. **В поезде 1 не хватает пяти швов** (раздел 3). Самые важные: верхняя граница ревизии в `defineContract`,
   правило зависимости пакета контракта в CMS и ключ `runContractSuite` по дескриптору.

---

## 1. Черновик ADR (для `pnpm docs:new`, статус proposed)

Команда (номер выдаст `docs:new`; ADR-0033 зарезервирован планом GM-5 за conformance):

```sh
pnpm exec docs-protocol new --consumer . --profile architecture/foundation/docs-protocol.yaml \
  --type adr --title "Replace exact compatibility tokens with revision windows" --owner architecture \
  --summary "Replaces exact compatibility tokens with per-capability revision windows in one wire generation for Core and Assembly 0.4.0, reads the previous declaration schema for one generation and keeps every diagnostic code." \
  --dry-run   # затем --apply --expect sha256:<digest из dry-run>
```

Тело ниже вставляется в созданный файл. Front matter создаёт `docs:new`, поэтому `id` и путь не выдумываются.
Поле `related` — ADR-0004, ADR-0005, ADR-0009, ADR-0021, ADR-0026, ADR-0027, ADR-0031, ADR-0032, GM-REQ-V1.

````markdown
# ADR-NNNN: Replace exact compatibility tokens with revision windows

## Context

Core 0.3.0 accepts one compatibility family. Every provided capability and
every slot carries `{ family: "exact", familyVersion: 1, token }`, and a
provider is compatible only when the two tokens are byte-equal. The token has
no settled meaning: Agent Runtime shares one token across 8 and across 10
contracts, test Hosts repeat the capability id with `/v1`. Any change to a
contract under one id, additive or not, is a flag day for every consumer, and
an additive change without a new token is invisible to Core.

ADR-0032 routed authoring through contract descriptors, so declarations no
longer spell the wire. On 2026-10-01 and 2026-10-02 the owner decided:

- one monotonic line per contract and no versioned capability ids;
- a provider declares `revision` and `compatibleFrom`, the oldest consumer
  revision it still supports; a consumer's revision is fixed by the version of
  the contract package it depends on;
- binding is allowed iff `compatibleFrom <= consumer revision <= provider
  revision`; a breaking change raises both numbers in place and ships a
  migration guide;
- Core reads the previous declaration schema so consumers are not forced into
  a flag day; catalog codes are not renamed;
- third-party plugins are built separately.
  No shared TypeScript check exists when such a plugin is assembled, so the
  Core check is the guard and its diagnostic must say which side to update.

A wire generation is expensive: ADR-0021 bound 941 recipes and a 30-artifact
ledger. This decision therefore closes every known wire question in one
generation and qualifies it as a delta over the immutable generation-two
corpus.

## Decision

### Wire generation

Module declarations and composition plans move to `schemaVersion: 2`.
Composition profiles do not change and stay at `schemaVersion: 1`.

```text
ModuleDeclaration (2)  provides[]: { capabilityId, revision, compatibleFrom }
                       slots[]:    { slotId, capabilityId, revision, cardinality }
CompositionPlan (2)    bindings[]: { consumerImplementationId, slotId,
                                     providerImplementationIds, capabilityId, revision }
CompositionProfile (1) unchanged
```

- `revision` and `compatibleFrom` are integers from 1 to 2147483647. Raw JSON
  uses the existing exact safe-integer admission. Type and range failures are
  `schema.invalid-value` with the existing reasons.
- `compatibleFrom > revision` is `schema.invalid-value`, reason
  `invalid-format`, at the provided entry, as for `many.min > many.max`.
- Records stay closed. A `compatibility` member in schema 2 is
  `schema.unknown-field`. Core never parses capability ids.

### Compatibility rule

A provider entry with the slot's `capabilityId` is compatible iff
`provider.compatibleFrom <= slot.revision <= provider.revision`. Lookup by
capability id, `binding.capability-missing`, explicit bindings and the absence
of provider selection are unchanged. There are no ranges, no "highest
satisfying" choice, no conversion and no warnings.

### Diagnostics

The catalog keeps its 33 codes, 32 emittable codes, ranks, phases,
prerequisites, ordering and bounded collector. `DiagnosticCode` is unchanged.
Only the details of `binding.compatibility-mismatch` change:

```ts
{
  readonly capabilityId: string;
  readonly reason: "consumer-too-old" | "provider-too-old";
  readonly consumerRevision: number;       // the slot revision
  readonly providerRevision: number;
  readonly providerCompatibleFrom: number;
}
```

`consumer-too-old` means `consumerRevision < providerCompatibleFrom`.
`provider-too-old` means `consumerRevision > providerRevision`. Exactly one
holds for an incompatible pair. Row-local deduplication keeps its rule: the
slot fixes the consumer revision and a resolved provider fixes its window. No
new code is needed. An unsupported schema version stays
`schema.unsupported-version`.

### Previous declaration schema

- Core admits module declarations with `schemaVersion: 1`, in the accepted
  generation-two shape, besides `2`, through the object and raw entries. Any
  other declaration version is `schema.unsupported-version`.
- A schema 1 entry is admitted only when its token is exactly
  `<capabilityId>/r<N>`, the builder encoding of ADR-0032, where N is a
  canonical decimal in the revision range. The rule applies after the token and
  the capability id pass their own checks. Any other token is
  `schema.invalid-value`, reason `invalid-format`, at the token path.
- An admitted provider entry becomes `revision = compatibleFrom = N`. An
  admitted slot entry becomes `revision = N`. After admission no rule
  distinguishes the two schemas.
- Resource accounting, paths and diagnostics refer to the document as
  supplied.
- Core reads the current and the previous declaration schema. The generation
  that introduces declaration schema 3 removes schema 1.
- Assembly's runtime binding admits the same two declaration schemas and checks
  only their shape; Core decides. Assembly's types, its builder and its plan
  reading use only the current schema.
- This is the persisted-data migration requirement ADR-0009 asks for. It is an
  admission decoder into the one current model, not a second compiler or a
  second public API.

### Plan and digest

- A plan binding records the consumer revision. Provider revisions are checked
  and not recorded, as provider tokens were never recorded.
- Every plan and every digest changes once with this generation. The digest
  protocol, its envelope with `protocolVersion: 1`, RFC 8785, SHA-256 and the
  `gm-plan:v1:sha-256:` spelling are unchanged; `schemaVersion` inside the
  hashed plan separates the generations.
- One graph yields one plan and one digest, whether its declarations arrive in
  schema 1 or in schema 2 with single-revision windows.
- Core never reads plans. Assembly accepts only plan schema 2. A Host that kept a
  digest as evidence compiles again and records the new digest once.

### Assembly builder and types

- `defineContract<Value, Earlier = {}>()({ id, revision, compatibleFrom })`.
  `compatibleFrom` is optional and defaults to `revision`. At run time
  `1 <= compatibleFrom <= revision <= 2147483647`, otherwise
  `assembly.bind.invalid-declaration`. `Earlier` holds the value types of the
  earlier revisions in the window; `compatibleFrom` must name `revision` or a
  key of `Earlier`. The 0.3.0 call form is unchanged and means a window of one
  revision.
- `provide()` emits `{ capabilityId, revision, compatibleFrom }`; `slot()` emits
  `{ slotId, capabilityId, revision, cardinality }`; `declareModule` supplies
  `schemaVersion: 2`. The revision a slot declares is the revision of the
  descriptor copy its module package loads.
- A capability map has one key per capability revision, `` `${id}@${revision}` ``.
  The key exists only in types; `@` is outside the identifier grammar.
  `CapabilitiesOf` derives a key for the current revision and for each key of
  `Earlier`. `CapabilityContract<Value>` loses its token parameter.
- `FactoryDependencies` gives a slot the value type of its revision.
  `FactoryCapabilities` requires a provided value that satisfies every revision
  in the provider's window, their intersection. `ValidDeclaration` requires every
  key a declaration uses to be in the map. `UsedCapability` returns those keys.
- The handle brand, `KnownCapabilities`, `AnyFactoryHandle` and `prepare` of
  ADR-0032 do not change. A handle is invariant only in the capability
  revisions it uses, so modules built against different contract package
  versions meet in one Host when their shared revisions have identical types.
- A contract package may keep exporting a descriptor of an earlier revision
  with the same id. An adapter module slots the new revision and provides the
  earlier one; Core accepts it as an ordinary module.

Verified sketch, abridged (the union guards of ADR-0032 are unchanged and omitted):

```ts
export type RevisionKey<Id extends string, R extends number> = `${Id}@${R}`;
export type ProvidedEntry<Id extends string, Rev extends number, From extends number = Rev,
  Window extends number = Rev> = { readonly capabilityId: Id; readonly revision: Rev;
  readonly compatibleFrom: From; readonly [contractEntry]: { readonly window: Window } };
export type SlotEntry<Id extends string, Rev extends number, S extends string, K extends Cardinality> = {
  readonly slotId: S; readonly capabilityId: Id; readonly revision: Rev; readonly cardinality: K;
  readonly [contractEntry]: { readonly window: Rev } };
export type Contract<Id extends string, V, Rev extends number, From extends number = Rev,
  Earlier extends { readonly [revision: number]: unknown } = {}> = {
  readonly id: Id; readonly revision: Rev; readonly compatibleFrom: From;
  readonly provide: () => ProvidedEntry<Id, Rev, From, Rev | (keyof Earlier & number)>;
  readonly slot: <const S extends string, const K extends Cardinality>(slotId: S, cardinality: K)
    => SlotEntry<Id, Rev, S, K>;
  readonly [contractValues]?: Earlier & { readonly [R in Rev]: V } };
export type CapabilitiesOf<T extends AnyContract> =
  { readonly [Key in KeysOf<T>]: CapabilityContract<ValueForKey<T, Key>> };   // id@revision
export type UsedCapability<D extends ModuleDeclaration> =
  EntryKeys<D["provides"][number]> | EntryKeys<D["slots"][number]>;          // every window revision
export type FactoryCapabilities<C, D extends ModuleDeclaration> = {
  readonly [P in D["provides"][number] as P["capabilityId"]]: UnionToIntersection<ValueAt<C, EntryKeys<P>>> };
export type FactoryDependencies<C, D extends ModuleDeclaration> = {
  readonly [S in D["slots"][number] as S["slotId"]]: S["cardinality"]["kind"] extends "many"
    ? readonly ValueAt<C, EntryKeys<S>>[]
    : S["cardinality"]["kind"] extends "optional" ? ValueAt<C, EntryKeys<S>> | undefined
    : ValueAt<C, EntryKeys<S>> };
export declare function defineContract<V, Earlier extends { readonly [revision: number]: unknown } = {}>():
  <const Id extends string, const Rev extends number, const From extends number = Rev>(spec: {
    readonly id: Id; readonly revision: Rev;
    readonly compatibleFrom?: From & ([From] extends [Rev | keyof Earlier] ? unknown
      : { readonly "compatibleFrom needs a value type in Earlier": From }) }) => Contract<Id, V, Rev, From, Earlier>;
```

### Contract packages and evolution (Consumer Module Standard)

- One descriptor per capability, owned and published by the contract owner.
  Maps come only from `CapabilitiesOf`; nobody writes wire records, maps or
  `CapabilityContract` by hand or indexes a map by capability id.
- A module package lists its contract packages in `dependencies`, never in
  `peerDependencies`, and never re-exports another package's descriptor. Every
  change of `revision` or `compatibleFrom` publishes a new 0.x minor of the
  contract package, so a package manager never shares one copy between modules
  built against different revisions. A bundled plugin carries its own copy.
- Contract value types are structural: no `#private` members, no
  `unique symbol` brands, no classes. Members use property-function syntax,
  enforced by `@typescript-eslint/method-signature-style: property`, because
  method syntax is bivariant and hides breaking changes.
- Additive member: `revision + 1`, `compatibleFrom` unchanged; providers
  implement every revision in their window, which the types enforce.
- Removal, rename or type change: add the replacement first and keep the old
  member while `compatibleFrom` admits consumers that use it, then raise
  `compatibleFrom`. A change in place sets `compatibleFrom = revision` and
  ships a migration guide; old consumers receive `consumer-too-old`.
- Across an in-place break an adapter module bridges consumers, using the
  retained earlier-revision descriptor. Each adapter has an owner and a removal
  condition.
- Deprecate with `@deprecated`. A Host inventories `plan.bindings[]`
  `(capabilityId, revision)` and raises `compatibleFrom` only when no plan binds
  a lower revision. Upgrade providers before consumers; the other order fails
  closed with `provider-too-old`.
- An input declaration uses the same descriptor copy as the parent slot that
  supplies its value.

### Closed with this generation

- Core plans never mark inputs. Assembly bindings remain the only place that
  knows them (ADR-0031). Reopening needs a consumer and a new generation.
- `owner.authority` stays a navigation label. Namespace rules belong to
  `checkNamespaces` in `@get-modular/conformance`, not to Core.
- No ranges, provider selection, conversion, deprecation metadata on the wire
  or warnings in Core.

### Qualification

- Accepted v1 and generation-two artifacts stay byte-identical and remain the
  authority for the schema 1 contract; `contracts:test` keeps checking them.
- `architecture/qualification/revision-windows/` adds `schema.json` (complete
  successor schema: declaration 2, previous declaration 1 with its encoding
  rule, plan 2, profile 1 and the diagnostic union), `contract.json` (the
  generation-two diagnostic contract with only the
  `binding.compatibility-mismatch` details variant replaced), `transform.mjs`
  and `cases.json`. `architecture/authority/revision-window-ledger.json` pins
  them and reuses the generation-two catalog and resource profile by digest. `architecture/checks/revision-windows.mjs` authenticates
  the ledger and validates the cases; its negative tests run in
  `contracts:test`.
- `transform.mjs` is a closed pure function over historical cases. It rewrites
  each schema 1 token into the builder encoding for its capability and keeps
  `schemaVersion: 1`, so historical inputs replay through the previous-schema
  path. It rewrites mismatch details and turns expected plans into schema 2,
  deriving their digests with the independent `json-canonicalize` oracle and
  SHA-256. Cases whose subject is a valid token at a boundary are retired by id,
  with a reason, and replaced by schema 2 cases.
- Core replays every historical category through the transform, with object
  and raw entries and with production and direct subjects. It also checks lift
  equivalence: the same corpus declared mechanically in schema 2 yields equal
  plans and digests and equal diagnostics up to field paths.
- `cases.json` covers both window bounds and both reasons, mixed reasons on a
  many slot, deduplication, field rules of schema 2, previous-schema admission
  and rejection, mixed-schema graphs, an adapter graph, plan 2 canonical and
  digest vectors and declaration schema 3.
- No retained execution capture. The expected results are the pinned
  generation-two outcomes through the pinned transform plus the authored cases,
  a deterministic and reproducible derivation.

### Release

Core and Assembly 0.4.0 form the exact pair of ADR-0027; Assembly admission
authenticates the 0.4.0 pair by this decision's bytes. Both packages ship a
minor changeset, an approved public API break and the migration guide.
`@get-modular/resources` and the lifecycle kernel are unaffected. Core's export
set of ADR-0009 is unchanged.

### Precedence

- Supersedes ADR-0005 "Exact compatibility only" in full, including separately
  named compatibility families.
- Supersedes ADR-0004 where provided capabilities carry exact compatibility
  data, a provider needs the exact required token and the identity grammar
  covers compatibility tokens. Plan bindings record the consumer revision.
- Supersedes ADR-0009 only in its sentence on product-owned compatibility
  tokens and in "one current literal value" for module declarations. This
  decision is the successor its second-value rule requires. Its exhaustive
  export set, its naming rule and its ban on parallel APIs stand.
- Supersedes ADR-0032 in the token encoding of revisions, its rejection of
  `compatibleFrom`, "identical value and compatibility type" (now: identical
  value type per used revision) and hand-written `CapabilityContract<Value,
  Token>` maps.
- Confirms ADR-0031: plans do not mark inputs.
- GM-REQ-V1 and the accepted v1 and generation-two artifacts keep recording the
  schema 1 contract and are not rewritten. For 0.4.0 this decision takes
  precedence over the Consumer Module Standard until its revision for this
  release.

## Consequences

- An additive contract change reaches old consumers without a flag day;
  providers serve a window and the types make them implement every revision in
  it.
- A separately built plugin is checked at compile time by Core, before any
  factory runs. The diagnostic names the capability, both revisions and the
  side to update.
- Declarations and Hosts that follow ADR-0032 do not change. Code that reads
  `binding.compatibility-mismatch` details, writes maps by hand or names
  `CapabilityContract<Value, Token>` changes once.
- Every plan digest changes once. Hosts that keep digests re-record them.
- Declarations written by the 0.3.0 builder stay readable for one generation;
  hand-written schema 1 tokens fail closed with a located diagnostic.
- A revision is a claim, not a proof. Host admission and the contract owner's
  conformance suite for each revision in a window remain the behavioral guard.
- A module package that takes its contract package as a peer, or a contract
  owner who ships a revision as a patch, can make a slot claim a revision it was
  not built against. The standard forbids both; Core cannot detect them.
- Contract packages accumulate earlier-revision types while windows are open.

## Rejected alternatives

- Versioned capability ids such as `/v2`: parallel lines and duplicated
  providers accumulate; rejected by the owner.
- Keeping the `family`/`familyVersion` envelope as a seam: `schemaVersion`
  already versions the record; removed by the owner.
- Removing compatibility and keeping only the id: no runtime guard for
  separately built plugins.
- Semantic version ranges, provider selection or conversion in Core: selection
  under ranges is NP-complete, choices become hidden and callbacks break
  determinism.
- New diagnostic codes for revision failures: they break every Host's total
  translation map; the existing code with richer details suffices.
- Lifting every schema 1 token, as revision 1 or by parsing `/vN`: it either
  erases distinctions or makes Core parse product conventions.
- Recording provider revisions in plans: no consumer and more digest churn.
- A nested revision record per capability in maps: it would rewrite the handle
  brand of ADR-0032; flat keys reuse it unchanged.
- `defineContract<{ 2: V2; 3: V3 }>()`: it changes the meaning of the first type
  parameter and breaks every 0.3.0 descriptor.
- An explicit `builtAgainst` revision per slot or generated declarations: more
  author burden; the dependency rule above is the owner's choice.
- A full successor capture like ADR-0021: weeks of work and megabytes of
  evidence for a deterministic derivation.
- Reading the previous schema for one minor release: it ties removal to the
  calendar instead of to the next generation.
````

---

## 2. Цена квалификации и генерации диагностики

### 2.1 Инвентаризация `familyVersion` (на `0023106`)

Ревью оценивало 94 файла на `9c722ce`. Сейчас их 107 (215 вхождений): PR #130 добавил 15 архивных копий в
`research/`, они не меняются. Остальные 92 файла:

| Группа | Файлов | Пример | Природа | Что делаем в поезде 2 |
|---|---|---|---|---|
| Неизменяемые артефакты, закреплённые ledger'ами (gen-2, v1, implementation-clarifications) и реестром решений | 20 | `contracts/v1/composition.schema.json`, `qualification/v1/{normalization-vectors,diagnostic-snapshots,decoder-vectors,qualification-case-manifest}.json`, `generation-two/{schema,snapshots,candidate}.json`, `implementation-clarifications/cases.json`, `checks/implementation-clarifications.mjs`, 8 файлов `tests/qualification/m2-candidate/*`, `tests/qualification/support/resource-profile-v2.mjs`, ADR-0005 | вручную в прошлом, закреплены digest'ами | **0 правок.** Остаются авторитетом схемы 1. Core читает их через `transform.mjs` |
| Корневые исторические копии и чекеры (ledger их не закрепляет, но они квалифицируют исторические исходники) | 11 | `tests/qualification/support/*` ×8, `v1-diagnostics-protocol.mjs`, `compiler-engineer/examples.json`, `tests/v1-contract.test.mjs` | вручную | 0 правок. `examples.json` читается тестами Core через transform |
| Release-owned baseline | 2 | `architecture/public-api/{core,assembly}.json` | **генерируются** `public-api-promote-release` в REL | не править на feature PR |
| Production Core | 12 | `wire-types.ts`, `diagnostic-types.ts`, `document-shape.ts`, `document-snapshot.ts`, `plan-output/factory.ts`, 6 × `features/*/declaration.ts` (самосборка), `self-composition/emit.ts` | вручную. `src/composition/generated/stage1.ts` генерируется при сборке и не отслеживается | правка |
| Production Assembly и пример | 3 | `snapshot.ts`, `types.ts`, `examples/basic-host.mjs` (после B4 — builder) | вручную | правка (+ `contract.ts`, `prepare.ts`) |
| Тесты Core | 34 | 13 `features/*`, `package/declarations-closure`, `public/m2-ordered-many`, 14 `qualification-support/*` (локальные копии, не закреплены), 5 `qualification/*` | вручную, часть — генераторы кейсов | правка литералов через один хелпер |
| Тесты Assembly и пакетные | 8 | `tests/assembly/*` ×6, `packages/assembly/tests/fixture.mjs`, `tests/node-runtime-compatibility.test.mjs` | вручную | правка |
| Документы | 2 | `current-contract.md` (таблица меток), `self-composition-implementation-guide.md` | вручную | правка |

Затронуты и файлы без `familyVersion`. Тестов Core, читающих неизменяемые векторы (`canonical-vectors`,
`resource-boundary-vectors`, снапшоты gen-2, `object-resource-coverage/cases`, `m2-resource-outcomes`), всего 31,
из них 20 без литералов; они переходят на transform. Ещё: `binding-record.ts`, `semantic-analysis.ts`,
`prepare.ts`, гейты (`assembly-admission.mjs`, `production-artifacts.mjs` и их тесты), одобрения в
`public-api-compatibility.yaml`, CMS с пинами (`ownership-checkpoint.test.mjs`, `CMS_SHA256` в `sdk-growth.mjs`),
README/CHANGELOG обоих пакетов, quickstart. Каталог `contracts/v1/diagnostic-catalog.json` и
`generation-two/catalog.json` не меняются.

### 2.2 Что генерируется, что пишется руками

- **Генерируется:** `architecture/public-api/*.json` (promote в REL), `CHANGELOG.md` (changesets),
  `stage1.ts` и `dist*` (сборка), digest'ы ожидаемых планов (transform через независимый `json-canonicalize`).
- **Копии с правкой:**
  - `revision-windows/schema.json` — копия gen-2 `schema.json` (~380 строк), реальный diff около 80 строк:
    `providedCapability`, `dependencySlot`, `planBinding`, `moduleDeclaration` 2 и 1, детали mismatch.
  - `revision-windows/contract.json` — копия gen-2 `contract.json` (30 КБ). Меняются `contractVersion` 2 → 3 и
    один элемент `variants`: у `binding.compatibility-mismatch` поле `details.required` с
    `expectedCompatibility`/`actualCompatibility` становится пятью новыми полями, и появляются `reasonValues`.
    Diff около 5 строк, пререквизиты и протоколы без изменений.
  - Каталог и профиль ресурсов gen-2 не копируются, их переиспользуем по digest.
- **Руками:** вся логика, `transform.mjs`, `cases.json` (40–60 полных кейсов), ledger, чекер, тесты, документы.

### 2.3 Как минимизировать (рекомендую всё вместе)

1. **Одно поколение на всё известное.** Ревизии, удаление token, схема 2 декларации и плана, декодер N-1,
   детали mismatch. Решения «никогда» записываются без изменения wire: пометка входов, `owner.authority`,
   deprecation-метаданные. `checkNamespaces` остаётся вне Core. Профиль не меняется, поэтому векторы профилей
   не трогаем.
2. **Каталог не меняется.** Нет нового поколения диагностики, карты перевода Host не ломаются (ADR-0009).
3. **Неизменяемые артефакты не трогаем.** Единственный мост — закреплённый `transform.mjs`, как адаптер
   ADR-0022: тот читает неизменённые рецепты и заменяет только оговорённые ожидания. Тесты Core импортируют
   transform, а не правят ожидания по одному кейсу.
4. **Путь N-1 служит и мостом квалификации.** Transform оставляет `schemaVersion: 1` и только переписывает
   token в `<id>/r<N>`. Поэтому почти все ожидаемые диагностики (пути, коды, ресурсный учёт) остаются
   байт-в-байт. Меняются только 49+8 деталей mismatch, 23+4 плана с digest и граничные пробы, где валидный token
   сам является предметом теста. `example/service/vN` → `example/service/rN` длину сохраняет; `example/link` →
   `example/link/r1` добавляет 3 байта. Затронет ли это граничные кейсы по `aggregateStringBytes`, **не
   проверено**. Если затронет, шаблон в локальной копии генератора (не закреплена) правится до материализации,
   около +50…150 строк.
5. **Без ретеншн-захвата.** Ожидания — это закреплённые исходы gen-2, пропущенные через закреплённый transform.
   Никакого нового архива на 3 МБ.
6. **Дифференциальная эквивалентность вместо ручных ожиданий v2.** Тот же корпус, механически объявленный в
   схеме 2, обязан дать те же планы и digest'ы и те же диагностики с точностью до путей полей. Так 900+ кейсов
   покрывают путь v2 без ручной работы.
7. **Первый коммит поезда 2 — рефакторинг тестов Core без изменения поведения.** Хелперы
   `provided(id, rev, from)` и `slot(...)` в одном файле `qualification-support/support/wire.mjs`. Следующее
   поколение тогда меняет один хелпер.
8. **Самый первый шаг (½ дня):** прототип правки Core на ветке и прогон `pnpm core:test`, чтобы получить
   реальную инвентаризацию падений. Только после неё оценка замораживается. Сделать его я не смог из-за места
   на диске (0.2).

### 2.4 Строки и время по PR

| PR | Содержание | Ручная логика | Тесты и фикстуры | Документы | Дни |
|---|---|---|---|---|---|
| T2-0 | ADR (`docs:new`), принятие владельцем | — | — | ~280 | 0,5 + владелец |
| T2-1a | `schema.json`, `contract.json`, `transform.mjs`, ledger, чекер; скрипты `contracts:*` | +450 (transform ~250, чекер ~150, ledger ~50) | schema ~380 (diff ~80), contract — копия (diff ~5), тесты чекера ~200 | ~30 | 1,5–2 |
| T2-1b | `cases.json` (40–60 кейсов), векторы plan 2 и digest | — | +1 200…1 800 JSON (шаблонно) | — | 1–1,5 |
| T2-2 | Core: wire, две схемы и подъём, правило окна, детали, план, самосборка | +260/−110 | хелпер ~80, маршрутизация через transform ~120, литералы ~±300, новые ~350, эквивалентность ~80 | README и changeset ~70 | 3–4 |
| T2-3 | Assembly: builder, ключи по ревизиям, snapshot N-1, `prepare`; type-scale с окнами; замер §6 GM-3 | +170/−90 | +320/−120 | README ~40 | 2–2,5 |
| T2-4 | гейты пары 0.4.0 и одобрения, CMS и пины, current-contract, гид, quickstart, migration guide; репетиция релиза | +100/−20 | +80 | ~350 | 1,5–2 |
| REL | release-PR, promote baseline | генерируется | — | — | 0,5 |
| AR-3 | AR на пару 0.4.0, ожидания runtime-теста ordinary-графа | +30…100 | — | — | 0,5 |

**Итог.** Ручная логика ≈ 1 000–1 150 строк, тесты ≈ 1 300–1 800, фикстуры ≈ 1 600–2 200 (в основном копия и
шаблоны), документы ≈ 700–800. Срок 10–14 дней последовательно. В три линии (T2-2 Core, T2-3 Assembly,
T2-1b кейсы после того, как заморожены ADR и `schema.json`) — 6–8 календарных дней. Погрешность ±40%, потому
что инвентаризация статическая (п. 8 выше).

| Вариант квалификации | Надёжность | Уверенность | Цена |
|---|---|---|---|
| **(Рекомендую) дельта-преемник:** transform + новые кейсы, без ретеншн-захвата | 8/10 | 7/10 | см. выше |
| полное поколение как ADR-0021: перезахват 941+ рецептов, новый архив и mutation evidence | 8/10 | 6/10 | +6…10 тыс. строк, 3–4 недели (оценка по масштабу gen-2; подготовка gen-2 стоила +948 и +1 030 строк — данные `deep-review-scale`, сам не проверял) |
| без преемника: править тесты, исторические векторы перестают исполняться | 3/10 | 8/10 | 4–5 дней, но нарушает ADR-0009 (ledger-преемник) и рвёт цепочку квалификации ADR-0021 |

---

## 3. Швы, которые поезд 1 должен оставить сейчас

Сверено с планом GM-3 (GM-3b B1–B4), разделами 8.6, 9.1, 10.5 и 13 принятого плана.

| # | Шов | Статус в поезде 1 | Действие | Важность |
|---|---|---|---|---|
| S1 | wire пишет только `contract.ts` | ✓ B1 | — | — |
| S2 | хвостовые позиции параметров свободны: `Contract<Id,V,Rev>`, `ProvidedEntry<Id,Rev>`, `SlotEntry<Id,Rev,S,K>`, `Declared<T>`, `defineContract<V>()` | ✓ по форме, правилом не записано | в 0.3.x не добавлять хвостовых type-параметров и позиционных аргументов: поезд 2 дописывает `From, Earlier` с умолчаниями (V4) | средняя |
| S3 | **верхняя граница ревизии** | ✗ GM-3 проверяет только `isSafeInteger && >= 1` | `revision <= 2147483647` в `defineContract` и кейс в AS7. Иначе дескриптор 0.3.0 с большой ревизией станет неподнимаемым в N-1 | средняя, 1 строка |
| S4 | `ContractCompatibility` не публичен | ✗ входит в +19 экспортов GM-3b | встроить форму в `ProvidedEntry`/`SlotEntry`, чтобы поезд 2 не удалял публичный тип | низкая |
| S5 | CMS: карты только через `CapabilitiesOf`; не индексировать карту по id; не именовать `CapabilityContract<V, Token>`; `UsedCapability` — внутренность бренда | ✗ в 9.1 есть только «name a map as an interface»; README B4 обещает, что рукописные карты «remain valid» | в GM-6 сделать это правилом, в README B4 уточнить «in 0.3.0» | средняя |
| S6 | **CMS: пакет контракта — обычная `dependencies`, не peer; каждый подъём `revision` и `compatibleFrom` — новый 0.x minor; структурные типы; `method-signature-style: property`** | ✗ нет в 9.1. Там правило peer только для пакетов GM | добавить в GM-6. Без этого у отдельно собранного плагина ревизия slot'а может молча стать чужой (Р3) | **высокая** |
| S7 | `runContractSuite` ключуется дескриптором | ✗ 8.6: «ключуется по `capabilityId`» | API `runContractSuite({ contract: Db, … })`: поезд 2 проходит окно по дескриптору без смены сигнатуры | средняя |
| S8 | AR-1b: 18 capability на дескрипторах, без общих token, карты через `CapabilitiesOf`, тесты и `verifyOrdinaryGraph` без wire-литералов | ✓ 10.5 (+250…400) | проверить, что тесты и скрипты AR тоже без литералов. Чистый разрыв разрешён владельцем | средняя |
| S9 | таблица пар в `assembly-admission.mjs` | ✓ GM-3 A2 | поезд 2 добавляет строку 0.4.0 | — |
| S10 | бренд и `KnownCapabilities` работают по ключам | ✓ GM-3b — на этом стоят плоские ключи | имена сохранить | — |
| S11 | фикстуры `tests/assembly/*` без wire-литералов, где литерал не предмет теста | частично (B4 — только пример) | по желанию в GM-3b, иначе ~40 строк в поезде 2 | низкая |
| S12 | имена без суффикса `V<цифра>` (governance) | n/a | для реализаторов поезда 2: `previousDeclarationShape`, не `declarationV1` | — |

Отдельно: правило CMS «Widen a range only when … authoring surface did not change» верно. Но модульные пакеты
с peer-зависимостью `^0.3.0` при 0.4.0 перевыпускаются. Пока это только first-party (AR), так что приемлемо.

---

## 4. Риски и открытые вопросы

### Риски

| # | Риск | Смягчение |
|---|---|---|
| Р1 | время проверки типов с ключами по ревизиям не измерено (ключей больше в среднем на ширину окна, плюс пересечение для провайдеров) | в T2-3 повторить процедуру §6 GM-3 с окнами 1–3; стоп-правила 6.4 GM-3 без изменений |
| Р2 | ревизия — заявление; плагин может солгать о реализованном окне | admission Host, `runContractSuite` по каждой ревизии окна; Core этого не докажет |
| Р3 | peer-зависимость на пакет контракта или ревизия, выпущенная patch'ем: slot молча заявляет чужую ревизию. Направление «принять старого потребителя у провайдера, который его уже не поддерживает» — fail-open | правило S6; позже — дешёвая проверка `package.json` в conformance. Для бандлов плагинов риск ниже: копия зашита при сборке |
| Р4 | бивариантность method-синтаксиса TS прячет ломающие изменения внутри ревизии | lint `method-signature-style: property` в CMS |
| Р5 | скрытые замороженные assert'ы (`sdk-growth`, пины CMS) | репетиция релиза в T2-4; правило R13: выключать комментарием, evidence не переписывать |
| Р6 | ошибка в transform прячет регрессию (он мост для всех исторических кейсов) | transform закреплён, имеет свои отрицательные тесты, плюс независимая дифференциальная эквивалентность v1/v2 |
| Р7 | CI macOS: новые кейсы, эквивалентность, type-scale с окнами | замер после T2-2/T2-3; стоп при job > 90% таймаута (правило GM-3) |
| Р8 | практическая ценность N-1 в 0.4.0 мала: AR рвёт чисто, плагинов ещё нет. Цена — около 15% поезда | механизм всё равно нужен к схеме 3, когда плагины под схемой 2 уже будут. Решение владельца не пересматриваю |

### Открытые вопросы (только реальные)

1. **Детали `binding.compatibility-mismatch`.**
   - **(Рекомендую)** `capabilityId`, `reason` и три номера — надёжность 8/10, уверенность 8/10. Host плагинов
     пишет сообщение без арифметики и без поиска по декларациям.
   - Только три номера — 7/10, 8/10. Меньше полей, сторону Host вычисляет сам.
   - Сохранить ключи `expectedCompatibility`/`actualCompatibility` с новыми полями внутри — 6/10, 7/10.
     Меньше правок в чужом коде, но «expected/actual» для окна вводит в заблуждение.
2. **Срок жизни схемы 1.**
   - **(Рекомендую)** удалить в поколении, которое вводит схему 3 — 8/10, 7/10.
   - Удалить в 0.5.0 независимо от поколений — 6/10, 7/10. Плагины под 0.4 сломаются без нового wire.
   - Два minor — 6/10, 6/10.
3. **Обобщить правило владельца «подъём `compatibleFrom` = новый minor» на каждый подъём `revision`.**
   - **(Рекомендую)** да — 8/10, 8/10. Доказательство дедупликации в Р3.
   - Явный `builtAgainst` в каждом `slot()` — 8/10, 6/10. Устойчив к менеджеру пакетов, но это литерал на каждый
     slot.
   - Codegen деклараций — 6/10, 5/10.
4. **Форма квалификации.** Дельта-преемник (рекомендую, 8/10, 7/10) или полное поколение (8/10, 6/10, 3–4
   недели). Таблица в 2.4.
5. **Assembly 0.4.0 принимает декларации схемы 1 во время работы.**
   - **(Рекомендую)** да, только проверка формы — 7/10, 7/10. Иначе Host плагинов на Assembly не получит N-1.
   - Только Core — 6/10, 7/10. Дешевле, но N-1 тогда работает лишь для `compileCompositionJson`.

---

## Приложение A. Эскиз и как его перепроверить

Каталог: not retained; see `raw/sketch/` for the re-verified sketch.

- `types.ts` — Core wire v2 (локально), правило `compatible`, типы Assembly, тела `defineContract`/`declareModule`,
  `liftPreviousToken`. SHA-256 (первые 16): `bb5c4e5824a9916c`.
- `use.ts` — копии пакета контракта A (r3) и B (r5, окно 3..5, удалён `legacyPing`); потребитель r3 со своей
  картой; провайдер окна; Host; узкий Host без r3; мутированная r3; адаптер через ломающий r6; охрана
  дескриптора и `declareModule`; runtime-проверки. `1e4fb3d7aeb113ab`.
- `prebuilt.d.ts` и `host-prebuilt.ts` — d.ts в арности поезда 1 против типов поезда 2.
- `expect.mjs` — снимает каждую `@ts-expect-error` и требует ошибку только на охраняемой строке (7.0.2 и 5.8.3).
- `rt.mjs` — runtime builder и подъём (Node 26.9, strip types).

```sh
# tsc: TypeScript 7.0.2 `tsc`
cd <sketch>; TS58=<get-modular>/node_modules/typescript-minimum/bin/tsc
for c in tsconfig.json tsconfig.loose.json tsconfig.prebuilt.json; do tsc -p $c && node $TS58 -p $c; done
node expect.mjs     # { directives: 8, failures: 0 }
node rt.mjs
```

Причины отказов, сверенные по тексту ошибок: «`"capabilities missing from the preparing map": "acme/db@3"`» у
узкого Host; «`Types of property 'query' are incompatible`» у мутированной r3; «`Property 'legacyPing' is
missing … in type 'DbR3'`» у провайдера окна без старого члена; «`Property 'begin' does not exist on type
'DbR3'`» у потребителя r3.

## Поправка владельца (2026-10-02, поздно)

Плагины продумываются позже вместе с владельцем. Runtime-проверка `compatibleFrom <= revision <= provider.revision` остаётся (она нужна и для независимо выпускаемых пакетов наших модулей), но отдельные требования под сторонние плагины в ADR поезда 2 не вводятся.
