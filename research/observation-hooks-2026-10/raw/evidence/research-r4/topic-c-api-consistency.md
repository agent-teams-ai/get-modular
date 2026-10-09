# Research round 4, topic C: public API, package consistency, evolution

Independent researcher, xhigh, read-only (2026-10-01). Returned in the agent's final
message (its rules forbid writing report files); saved verbatim in substance by
root. Probes: scratchpad `topic-c/obs/probe/` (TS 7.0.2 and 5.8.3, Node 26.9).

## Verdict

The candidate is broadly compatible with GM but must not be published as is:
three measured defects (type safety by record type lost under TS 7, undeclared
keys silently dropped, duplicate IDs make `close()` report `complete: true`) and
four API-shape decisions that are expensive to change later. The main risk for
parallel agents: shared GM files are pinned by hashes and exact lists.

## Findings

1. P1 (9/10, verified): TS 7.0.2 accepts `Participant<Flags>` -> `Participant<Other>`
   and `ObservationPort<Flags>` -> `ObservationPort<Other>`; 5.8.3 rejects. Cause:
   `Readonly<Pick<V, S[number]>>` inside a generic method; `in out V` restores the
   error on both compilers (`contract.ts:27,53,81`).
2. P1 (9/10, verified): silent data loss. `keyed-source.ts:28` fixes keys from
   `Object.keys(initial)`; for `{ a: number; b?: string }`, `commit({ b: "x" })`
   returned 0 and dropped the value; a joint commit wrote `b` without a revision.
   Precedent: zustand #1723 ("`set` type is too lax").
3. P1 (8/10, verified): the visitor protocol is public (`ParticipantVisitor`,
   `SyncParticipant`, `DerivedParticipant`, `Participant.open`); a third
   participant kind becomes breaking.
4. P1 (8/10, verified): `import type { Resources }` in `hub.ts:7` becomes a real
   dependency in published d.ts; GM pins internal deps exactly and
   `tests/ownership-checkpoint.test.mjs:117-118` requires no new importer.
   OpenFeature #1227 / #963 show peer-range breakage.
5. P1 (9/10, verified): parallel GM deliveries collide on pinned files: CMS hash
   in `architecture/checks/sdk-growth.mjs:23` and `tests/ownership-checkpoint.test.mjs:131`,
   exact `packageRoots` in `ownership-checkpoint.test.mjs:148-151` and
   `source-dependencies.yaml:5-8`, fixed `PACKAGES`/`RELEASES` in `sdk-growth.mjs:42-60`.
6. P2 (10/10): `startHub` lacks a return type -> TS9007 under GM's `isolatedDeclarations`.
7. P2 (8/10): errors are plain `Error` strings; `hub.ts:117` wraps and hides
   `ScopeClosedError.code`. Assembly uses `AssemblyBindingError { code }` with
   `assembly.bind.*`; resources uses `scope-closed` (a third scheme).
8. P2 (9/10): a throwing `reportError` crashes Node (`callback-isolation.ts:16`
   rethrows asynchronously), contradicting the research fail condition; message
   says "settings" in a generic package.
9. P2 (9/10): duplicate `participantIds` overwrite drain cells; measured
   `{"complete":true,"debts":[]}` with a hung derive.
10. P2 (8/10): `derivedParticipant` does not infer `V`; precedent zustand
    `create<T>()(...)` currying.
11. P2 (8/10): TEST diagnostics `stats`/`listenerCount` are in the public API.
12. P2 (7/10): drain cleanup ignores the escalate signal.
13. P3: `since?: number` fails `exactOptionalPropertyTypes` with `number | undefined`;
    `SourceId` is constructible; `setTimeout` vs resources invariant 14 needs an
    ADR rationale; `Report` type used publicly but not exported.

## API changes (was -> becomes)

| Was | Becomes |
| --- | --- |
| `ObservationPort<V>`, `Reader`, `Participant` | `<in out V extends Values>` + `@ts-expect-error` fixtures on 5.8.3 and 7.0.2 |
| keys from `Object.keys(initial)` | unknown key in `commit`/`read`/`observe` -> `ObservationError` (`observation.keys.unknown`); records declare every key (`T \| undefined`, not `?:`) |
| public `ParticipantVisitor`, `Participant.open` | opaque branded `Participant<V>`; visitor internal |
| `syncParticipant` / `derivedParticipant<V,S,T>` | `const settings = participantsFor<AppSettings>()`; `settings.sync({ initial, apply })`, `settings.derived({ keys, derive, apply, fail })` (precedent `assemblyFor<C>()`) |
| `import type { Resources }` | local structural `HubResources` (only `setup`) + GM dev test that `Resources` satisfies it |
| `startHub(...)` untyped | `Promise<Hub>`; rejects duplicate IDs |
| `Error("observation.…")` | `ObservationError extends Error { readonly code }`; rethrow `ScopeClosedError` unwrapped |
| `latestDerivation({ commit(revision, result), fail(revision, cause), report })` | `createLatestDerivation({ derive, isCurrent, apply(result, { revision }), fail(cause, { revision }), reportError })` + `[Symbol.asyncDispose]` |
| `Observation { unsubscribe, isAttached }` | add `[Symbol.dispose]` (unsubscribe, throw if still attached); escape hatch = `resources.use(...)` |
| `stats`, `listenerCount` | remove from API |
| `since?: number` | `since?: number \| undefined` |
| `export class SourceId` | `export type { SourceId }` |

Keep `createKeyedSource` and `startHub` names. TS 5.8.3 minimum is fine
(`const` type params 5.0, `in out` 4.7, `NoInfer` 5.4); keep `object` records.

## Conflicts with `@get-modular/resources`

| Overlap | Resolution |
| --- | --- |
| `Resources` type in the hub | structural port, zero deps |
| lane `close/drain` vs `child()/use()` | lane stays plain, no `child()` per run; lane is `asyncDispose`; hub drain honours escalate |
| `reportError` vs `CloseReport` | not duplicates: runtime callback errors vs teardown debts vs `outcomes()` readiness input; document the channel matrix in CMS |
| error codes `scope-closed` vs `assembly.bind.*` | one scheme `<pkg>.<area>.<reason>` decided once for both new packages |
| four `signal`s | Assembly `ctx.signal`, `resources.signal`, cleanup escalate, `derive(…, signal)`; document in CMS; never pass `resources.signal` to derive |
| `/` inside `Debt.path` segments | keep arrays; join only for display |

## Lessons from mature libraries

TanStack Store 0.9.0 (`new Store()` -> `createStore()`, removed `new Effect()`),
nanostores 0.5-1.0 (renames, removed `action()`, "Fixed queued listeners after they
are unsubscribed", type fixes for `Record`), zustand v5 (TS minimum, stricter
types, `test-old-typescript.yml`), @preact/signals-core (1.14.4 "a later write could
re-mint that same version number"; 1.5.1 removed backward-incompatible type
export), OpenFeature server-sdk (peer range issues), TanStack Query #7641
(`exactOptionalPropertyTypes`). Inference: hide what users could implement;
keep revisions monotonic; test types on minimum and current compilers.

## What GM needs for publication

ADR via `pnpm docs:new` reconciling `system-boundary.md:15,67,69` and GM
`AGENTS.md:65-66`; Foundation `source-dependencies.yaml` package roots and
boundaries, `public-api-compatibility.yaml` entry, a baseline rule for new
packages; pinned lists in `sdk-growth.mjs` and `ownership-checkpoint.test.mjs`;
package manifest like the kernel (engines, `sideEffects:false`, exports), `lib`
with `DOM`, three tsconfigs, packed-root test, changeset; CMS section; generalize
the admission checker instead of copying it.

## Top 5

1. Sequential integration: resources first, then observation; one integrator owns
   the pinned shared files, or one joint ADR/CMS change. 🎯9 🛡️9
2. Zero deps: structural `HubResources` + GM dev compatibility test. 🎯8 🛡️8
3. Opaque `Participant` + `participantsFor<V>()`; hide visitor, spec types and probes. 🎯8 🛡️8
4. Types and data: `in out V`, reject unknown keys, negative fixtures on 5.8.3 and 7.0.2. 🎯9 🛡️9
5. Errors: `ObservationError` with `code`, rethrow `ScopeClosedError`, reject duplicate
   IDs, drain honours escalate; define `reportError` as synchronous no-throw. 🎯8 🛡️8

## Do not (overengineering)

Injectable scheduler/clock; conformance kit for third-party ports; a `/testing`
subpath; peerDependency on resources; dual CJS+ESM build; stability levels;
`signal`/`equals`/batching options on `observe`; `child()` per run; a shared
errors package for all GM packages; compatibility shims during 0.x.
