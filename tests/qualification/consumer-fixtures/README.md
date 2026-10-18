# Consumer fixtures

These fixtures implement the bounded
[module fixture plan](../../../docs/qualification/module-fixture-plan.md).
The [scenario catalog](../../../docs/qualification/module-fixture-scenarios.md)
owns the required outcomes; the
[handoff](../../../docs/qualification/module-fixture-handoff.md)
owns verification routes and the limits of each claim.

## Profiles and current scope

| Profile | Purpose | Current delivery |
| --- | --- | --- |
| `semantic` | A useful session and runner, real resource ownership, and independent consumer expectations | P0–P2: C-01 through C-05, L-01 through L-10 and one complete A construction smoke |
| `growth` | Actual generated TypeScript feature trees with inherited capability maps and independent arithmetic and wiring expectations | Separate P5 delivery; large-tree measurements are optional and bounded |

The profiles share only driver materialization. This is test-owned composition:
Get Modular does not gain a Host, readiness API, work scheduler or recovery policy.
Recovery, source facts, workload and author exercises remain separate plan
slices. Source qualification is currently incomplete.

## Semantic ownership and behavior

`semantic/src/composition/semantic.root.ts` is the only supported root recipe.
It statically composes the runner A and session groups, exposes the session root,
and names the `identity` and `journal` inputs. Inputs are outside the groups.
One prepared object is reused for the same factory set; every run owns its scope,
identity, journal and startup promise.

The session feature owns the public session, runner, identity and journal
contracts in `src/features/session/contracts/session.ts`. Its application uses
its own narrow ports. The runner consumes the session capability map through a
type import and declares its own narrow release-journal port. Composition makes
the structural assignments. Application code has no Get Modular imports.

The session request is `{ id, payload, signal }`; the runner also receives the
per-run `scope`. Session trims the payload, invokes the selected runner, and
preserves its exact returned string in both the result and terminal record.
Runner A returns `${scope}:A:${payload}`. Test-only B returns the corresponding
B result. `!fail` rejects with `fixture.runner.failed`; cancellation before an
effect rejects with `fixture.operation.cancelled` and records no ordinary effect.

`semantic/tests/support/journal.ts` owns a real file journal. Its records carry
`{ kind, scope, id, value }`, distinguishing acquisition, effect, terminal and
release. The runner acquires a real file handle through `resources.setup` inside
`scoped`. Cleanup closes that handle and appends its release while the borrowed
journal is still usable. Tests probe the actual handle before and after close.

`semantic/tests/support/attempt-owner.ts` is the single retained attempt owner.
It retains startup and readiness, publishes ingress in one synchronous commit,
and tracks accepted operations through terminal recording in a single ledger.
`requestStop()` synchronously closes ingress and cancels construction and work;
`stop()` waits for their settlement, closes the run scope, then closes the
borrowed journal only after a complete report. An incomplete report retains the
journal and the same owner's retry authority. Observers may abandon an already
active resource close without replacing the owner's flight or settled report.
The bounded snapshot exposes identity and phase, with no factory attribution.

## Scenario entrypoints

| Scenarios | Consumer source | Existing repository owner |
| --- | --- | --- |
| C-01, C-02, C-03, C-04a, full A smoke | `semantic/tests/module/semantic.test.ts` | [Assembly fixture test](../../assembly/consumer-fixtures.test.mjs) |
| C-04b | `semantic/tests/negative/empty-runner.ts` and its separate negative project | Same Assembly fixture test; exactly TS2741 under each supported compiler |
| C-05 | `semantic/tests/module/packed-entry.ts` | [Conformance packed test](../../../packages/conformance/tests/packed-root.test.mjs) |
| L-01–L-10 | `semantic/tests/module/lifetime.test.ts` | Same Assembly fixture test and current runtime emit |

The owner contract suite lives in `semantic/tests/features/session/testing.ts`.
It runs the same three success, error and cancellation cases against a typed
fake and the actual A/B entries through `isolate`. Handwritten feature provider
pins live beside that suite; the root test owns its root pin. B appears only in
tests as the compatible wrong-provider mutation. The opaque `runner-result-7`
case independently detects a session that discards the runner's result.

Lifetime uses explicit barriers for late factory return, readiness, publication,
effect permission and release. The tests distinguish partial acquisition cleanup,
same-owner retry after a discarded report, cancellation-driven settlement and
capacity-one refusal before runner entry. Native file probes establish physical
release. The one early-journal-close counterexample first proves retry debt, then
restores only its test writer to finish cleanup through the retained owner.

## Run and interpret the evidence

Use the repository's pinned Node and pnpm. When package outputs are absent or
stale, prepare them with `pnpm assembly:build`, `pnpm resources:build` and
`pnpm conformance:build`. Then run:

```sh
node --test tests/assembly/consumer-fixtures.test.mjs
pnpm conformance:pack
```

The Assembly driver copies ready public package manifests and complete outputs
into a disposable consumer, compiles the real semantic files with minimum/current
TypeScript in NodeNext/Bundler modes, then emits and runs the scenarios once with
current TypeScript. Its separate negative project contains the single invalid
assignment. The packed hook reuses its four existing extracted archives and runs
one connected operation and close. It retains the original declaration checks
with no Node ambient types.

Reports distinguish `runtime`, `packed`, `source` and `measurement`. A successful
Assembly run reports runtime success, delegates packed evidence to the existing
packed owner, keeps source incomplete, and selects no measurement. Source-tree
hashes are recorded as `sourceTree`, separately from the source-coverage status.
Package output hashes, compiler versions, Node declarations and lockfile identity
identify the tested input. The packed report records archive hashes and all four
resolved package entries inside the extracted consumer. Neither route claims a
registry release, source-standard completion or large-tree performance.

Both test entries are included by the existing repository gates. Use the focused
scenario while editing, `pnpm check:changed` for the coherent diff, and retain
matching fast/full gate results before delivery as specified in the handoff.
