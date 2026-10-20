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
| `semantic` | A useful session and runner, real resource ownership, and independent consumer expectations | P0–P2 and P6: C-01 through C-05, L-01 through L-10, W-01 through W-03 and one complete A construction smoke |
| `record-only` / `restart-pending` | A bounded persistent fixture with one worker writer and a live supervisor retaining real effect processes | P3: R-01 through R-10 under both schedules |
| `growth` | Actual generated TypeScript feature trees with inherited capability maps and independent arithmetic and wiring expectations | P5 G-01 at eight features in ordinary `assembly:test`; larger measurements remain optional and bounded |

The profiles share driver materialization. This is test-owned composition:
Get Modular does not gain a Host, readiness API, work scheduler or recovery policy.
P6 adds the W-01 through W-03 bounded workload on these same semantic owners.
Source facts and author exercises remain separate plan slices.

P4's [installed source route](source/README.md) runs 26 selected flat observations
through the exact registry development pins for Foundation and FMS and public
Get Modular conformance. The same Assembly test first executes 16 complementary
Foundation policy observations using its checked-in source profile. Both routes
mutate actual files, require the expected diagnostics and check the restored
tree. Only the complete selected source run reports `source: passed`.
The production FMS v1 authority and governed roots remain unchanged; the fixture
uses the catalog's existing selected composition-contract reference. Historical research
reports keep their original `source: incomplete` status and artifact identities.

P5's small G-01 entry runs one current TypeScript/NodeNext compilation and the
actual generated tree's literal arithmetic, independent provider/input/root pins,
wrong-provider mutation and complete smoke. The retained N=100 pass and N=500
cold-compile timeout belong to earlier driver identities, before the supervision
correction; they do not measure the current driver. The retained supported-toolchain
series reached its unchanged 180-second cap at the accepted inherited-map N=500
subject and did not create N=1000. A subsequent exact upstream compiler candidate
completed all eight N=500 stages with the same source inputs. That exact upstream
candidate supplied no complete N=1000 measurement: local memory exhaustion and
two remote runner shutdowns retained their recorded limits. A separate
[private compiler-owner patch experiment](growth/README.md#private-compiler-owner-result-2026-10-20)
completed the unchanged N=100, N=500 and N=1000 series on 2026-10-20, including
all eight stages and complete smoke. This qualifies those private-candidate
measurements. The supported TypeScript 7.0.2 pin is unchanged, and its growth
delivery blocker remains open pending a maintained compiler remedy and adoption.
See the [growth fixture](growth/README.md) for the explicit optional diagnostic
route, exact identities and the remaining compiler-owner handoff.

The [P7 authoring record](authoring/README.md) retains the selected H-01 through
H-03 exercise results, one three-file author patch and bounded diagnoses from
the historical P1/P2 inputs. It adds no recurring test entry or supported root.
Its single selected author runtime invocation and actual held-startup cleanup
are recorded separately from its historical source coverage, which remains
incomplete in that authoring record.
The current H-03 controller regression separately exercises held startup and
physical cleanup, then requires natural child-process exit while the parent's
stdin writer remains open. The controller closes its accepted one-shot input
with `destroy()`; pausing that input alone does not qualify transport completion.
This regression does not repeat the fresh diagnosis or change the historical
authoring record.

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
| R-01–R-10 | `recovery/tests/recovery.test.ts` | [Assembly restart test](../../assembly/consumer-restart.test.mjs); one current compiler emit |
| G-01 | Generated eight-feature tree and `growth/run.mjs` | [Assembly growth test](../../assembly/consumer-growth.test.mjs); current compiler/NodeNext, independent oracles and one full smoke |
| W-01–W-03 | `semantic/tests/module/workload.test.ts` | Same Assembly fixture test and current runtime emit |
| H-03 controller transport | `semantic/tests/support/held-startup-controller.ts` and `authoring/transport.ts` | Same Assembly fixture test; actual cancellation/cleanup and natural exit with the parent writer held open |
| Selected A-01–A-08 source predicates | `source/installed.ts`, `source/records.mjs` and `source/scenarios.mjs` | Same Assembly fixture test; 26 actual observations through installed public Foundation, FMS and CMS |
| Complementary A-01–A-04 and A-06 policy predicates | `source/policy.ts` and `source/source-dependencies.yaml` | Same source test; 16 installed public Foundation CLI observations against actual files |

The four maintained runtime helpers belong to `tests/tsconfig.consumer-fixtures.json`.
The existing `assembly:typecheck` checks them after public package outputs are prepared,
using the same strict options as the repository's native tooling project.

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

Workload reuses one preparation with distinct journals, scopes, signals and
controls per run. W-01 stops held left work through its private cancellation
signal, then performs fresh right work after physical left cleanup. W-02 submits
64 requests across 16 instances through a test-owned global admission schedule
with a limit of 16 and no queue; all admission outcomes precede release. The
observed distribution is two accepted operations on one instance, one on each of
fourteen, and none on the last. The
observed runner entries and active-work counts detect an unintended capacity-one
limit per instance.
W-03 cancels one singleton, completes the other fifteen operations, then retries
one named cleanup failure through the same owner after discarding its first
report. Final complete entry lists preserve duplicates for comparison with the
accepted IDs. Native probes witness 16 physical releases in 17 cleanup attempts.
No watchers, product throughput target or Runtime reliability claim is selected.

## Recovery ownership and limits

The recovery fixture composes the same semantic session with an IPC runner. The
live test supervisor directly owns worker and effect child handles. It grants a
new writer only after observing the old worker's exit; a separate one-use launch
permission is consumed before spawning an effect. Cancellation and storage freeze
revoke outstanding permission. Restored records never grant process authority.

The finite operation owner serializes transitions around one bounded JSON
snapshot: temporary write, sync, close, then rename over the canonical file.
Acknowledgement follows replacement. A failed or ambiguous storage operation
freezes ordinary transitions and launch until canonical reconciliation, while
local cancellation and exit observation remain available. The closed schema
reserves terminal growth within 32 records and 64 KiB, with 1792-byte records
and a 4096-byte envelope budget.

Live execution has a fixed finite result catalog: new operations require scope
`recovery` and an input that trims to `hello`. Unsupported inputs reject with
`fixture.operation.unsupported-input` before reservation or canonical replacement.
The same limit applies before dispatching restored pending work. Storage-only
schema and capacity cases retain the full bounded string domain. An unrepresentable
child result remains an owned protocol failure through cooperative stop and
observed exit; reconciliation records no fabricated terminal result.

Both profiles use the same loss schedules. `restart-pending` starts confirmed
pending work once before any resubmission; `record-only` leaves it pending in
that schedule. Claimed work with an unknown start is quarantined. A surviving
effect remains under the live supervisor's custody after worker loss, and its
capacity slot is released only after observed exit. Cleanup debt and its real
file remain retryable through that owner.

These checks cover process restart on a live machine. They do not select Runtime
recovery policy, qualify supervisor death, discover orphan processes, establish
power-loss durability or introduce an HA store.

## Run and interpret the evidence

Use the repository's pinned Node and pnpm. When package outputs are absent or
stale, prepare them with `pnpm assembly:build`, `pnpm resources:build` and
`pnpm conformance:build`. Then run:

```sh
node --test tests/assembly/consumer-fixtures.test.mjs
node --test tests/assembly/consumer-restart.test.mjs
node --test tests/assembly/consumer-growth.test.mjs
pnpm conformance:pack
```

The Assembly driver copies ready public package manifests and complete outputs
into a disposable consumer, compiles the real semantic files with minimum/current
TypeScript in NodeNext/Bundler modes, then emits and runs the scenarios once with
current TypeScript. Its separate negative project contains the single invalid
assignment. The packed hook reuses its four existing extracted archives and runs
one connected operation and close. It retains the original declaration checks
with no Node ambient types.

The restart entry materializes `semantic` and `recovery` as siblings with the same
public package copies, emits once with current TypeScript in NodeNext mode, and
runs the real worker/effect scenarios. Its configuration-only changes route to
the existing complete fast scan, alongside the three semantic projects.

Reports distinguish `runtime`, `packed`, `source` and `measurement`. A successful
runtime entry reports runtime success, delegates packed evidence to the existing
packed owner and source evidence to the separate installed-source test, and
selects no measurement. The source test reports the selected flat result with
`adoption: unchanged` and `nested: not-selected`. Source-tree
hashes are recorded as `sourceTree`, separately from the source-coverage status.
Package output hashes, compiler versions, Node declarations and lockfile identity
identify the tested input. The packed report records archive hashes and all four
resolved package entries inside the extracted consumer. Neither route claims a
registry release, whole-repository source-standard completion or large-tree
performance.

These test entries are included by the existing repository gates. Use the focused
scenario while editing, `pnpm check:changed` for the coherent diff, and retain
matching fast/full gate results before delivery as specified in the handoff.
