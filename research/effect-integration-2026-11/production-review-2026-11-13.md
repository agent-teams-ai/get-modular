# Production review: preparation, graph ownership and industry evidence

Status: implementation and focused acceptance complete; repository gates and
exact-source delivery are tracked in [PR #240](https://github.com/agent-teams-ai/get-modular/pull/240).
Base: `144cbde065c00afbf98905b79a1db12234572857`.
The [upfront plan](production-review-plan-2026-11-13.md) owns the bounded delivery;
the [packaged guide](../../packages/effect/docs/practices.md) owns usage rules.
Earlier reports and frozen evidence are unchanged.

## Reproduced preparation defect

The shared [metadata collector](../../packages/assembly/src/features/construction/prepare-program.ts)
bounded the module tree, then appended borrowed inputs without checking the
combined selected-entry count. A strict TypeScript 7.0.2 scratch reproduction on
the base source observed both consequences:

| Inventory | Before correction | Required outcome |
| --- | --- | --- |
| 4,096 module entries plus one input | One Core invocation with 4,097 declarations; `assembly.prepare.core-rejected` | `assembly.prepare.limit` before Core |
| 4,095 providers, one ambiguous consumer and two inputs | `assembly.prepare.unresolved-binding` with 4,097 candidates; authoring formatter refuses the oversized carrier | `assembly.prepare.limit` before profile completion |
| 4,094 providers, one root and one input, with one enclosing group | Preparation succeeds | Preserve success: 4,096 selected entries and 4,096 module-tree nodes are separate valid budgets |

The correction belongs in Assembly's existing collector, before proportional
collection and profile derivation. Borrowed inputs count as selected entries,
not as nodes in the module-group tree. The existing
[profile-boundary tests](../../packages/assembly/tests/profile-completion-bounds.test.ts)
own the exact-limit, overflow and compiler-call assertions. The public error
vocabulary, Core semantics and valid-input API remain unchanged.

## Native lowering and additional qualification

The review found no reproduced native resource leak or E/R typing defect. The
selected refactor gives each private service key and Layer one node record and
resolves each step's distinct providers during inert lowering. Native provision
and dependency projection then consume that same selection. This reduces
coordinated mutable structures and repeated discovery without a new abstraction
or execution owner. The [lowering source](../../packages/effect/src/features/construction/lower.ts)
remains in the existing construction feature.

Three public-boundary scenarios extend the previous tests:

- A mixed inventory with 4,096 module entries and one borrowed input is rejected
  by both public preparation APIs with `assembly.prepare.limit`, empty diagnostics
  and zero factory calls. This binds the shared-owner correction to the installed
  archive check; it does not duplicate the detailed internal compiler-spy matrix.
- A repeated-diamond DAG uses a real shared FileHandle. Factory identity, exact
  acquisition/release counts, dependency liveness during asynchronous cleanup and
  physical close are independent oracles. This does not measure native traversal
  complexity, peak memory, throughput or a product's startup SLO.
- A factory acquires a real file and then returns an accessor-bearing product.
  The accessor must not execute, no roots may be published, and completion must
  wait while the physical close is held behind a barrier. A malformed product
  remains a defect; cleanup is still owned by the native construction Scope.

The existing installed-archive suite repeats native scenarios through public
package roots. Strict typing and a passing workspace import alone do not establish
that archive result. Focused qualification passed: **27/27** native/admission
tests, including **23** scenarios repeated through installed archives, with no
failures, cancellations or skips. Strict source, NodeNext/Bundler public types,
test tooling and the complete Assembly typecheck passed. The archive check also
ran ordinary Core/Assembly without Effect installed. Full repository gates,
exact-head CI and merge evidence remain tracked in the PR.

The maintained Assembly tests also ran against the base build before the source
correction. All four new rejecting child tests failed with the old outcomes above;
Node reported six failed tests including their two parent containers. The six
preexisting cases passed. After the two-line guard and a normal Assembly build,
the focused profile-boundary, wiring and bounds run passed **21/21**, with no
failures, cancellations or skips. The exact mixed boundary passed on both subjects.

## New industry cases

These are primary-source observations, not executions of the external projects.
We inspected the merged patches and their tests, checked the relevant mechanisms
in Effect source `289a53f7b1fc40049219c6e69022db2fb859c356` (manifest **4.1.4**), and
checked their presence in the installed **4.1.4** package. Source and installed
package coordinates are separate observations, not a claim of byte-identical trees.
No dependency upgrade or application feature follows from these studies.

### Composed Layer identity: Effect #9634

[Merged fix](https://github.com/Effect-TS/effect/commit/c7072e46356a19615625ae0fa569b1c3a79d50be),
source manifest 4.0.5. Leaf memoization did not prevent repeatedly traversing
composed parents. The fix changes `mergeAll` and `provideWith` to memoize the
composed Layer. Its regression uses a non-memoized `fromBuild` probe to count
parent traversal, including deliberate `Layer.fresh` behavior.

The useful lesson is to test graph topology and the work actually at risk.
GM's leaf counts do not replace that upstream oracle. Our repeated-diamond case
therefore claims identity and ownership evidence only. Sharing the composed parent
also shares its interior; refreshing only an interior dependency does not create
a fresh parent. The correction is already present in the selected peer.

### Service identity and composite keys: Effect #9267

[Merged fix and regression](https://github.com/Effect-TS/effect/commit/8fbb39eb92577915831f19a83b51be376e844613),
source manifest 4.0.5. Atom HTTP/RPC mutation keys omitted the owning service,
allowing unrelated endpoints with identical names to share registry state.
The fix includes service identity and encodes key components as a tuple. Tests
check request destination, payload and returned value, including ambiguous
delimiter spellings.

Stable hydration identities cannot simply become random. Query keys remain an
explicit caller responsibility. This does not demonstrate a defect in GM's
closed private contexts: its native Layer identities and exposed root keys have
different roles. We reviewed the module-local counter hypothesis and found no
supported cross-copy leak; no speculative global registry or UUID change is added.

### Memo-map ownership: Effect #7082

[Merged fix and regression](https://github.com/Effect-TS/effect/commit/9591f00993f882de494033ddc4a1324f054f075a),
source manifest 4.0.0-beta.104. A process-wide Atom runtime map shared services
and reactive invalidation across separate request registries. The default became
registry-owned; explicitly supplied concrete maps still intentionally share.
Tests distinguish per-registry acquisition/disposal, intentional sharing and
cross-registry mutation isolation.

Separate Scopes alone do not establish isolated state. The existing GM recipes
already distinguish fresh mapper identities, shared borrowed services and private
Layers. Adopt that ownership question at a consumer's real request/cache boundary;
do not add Atom or a request runtime to the generic constructor.

### Overlapping disposal: Effect #9334

[Merged correction](https://github.com/Effect-TS/effect/commit/f0ccbb6917be5c08364b0b8adbd0c4c19e7f2de1)
and the [qualified implementation](https://github.com/Effect-TS/effect/blob/289a53f7b1fc40049219c6e69022db2fb859c356/packages/effect/src/ManagedRuntime.ts#L403-L427)
distinguish waiting for completion from replaying failure. Ordinary overlapping
ManagedRuntime disposal callers now wait; reentrant participants avoid waiting
on themselves. The completion Deferred still receives a successful void Exit in
`ensuring`, so it does not reproduce the initiating caller's cleanup failure.
Scope-close semantics are a separate contract.

The previous first-result retention guidance remains useful for a facade promising
one close outcome. It must not be justified by claiming that current ordinary
concurrent callers always return early. No disposal wrapper is added to GM.

### Installed dependency graph: OpenCode #45016

[Merged manifest correction](https://github.com/anomalyco/opencode/commit/578f8d637a8008f7d86d9b3003088b4fbd26888f)
and [reported reproduction](https://github.com/anomalyco/opencode/pull/45016) concern
the historical Effect 4.0.0-rc.111 catalog. A clean packed Workerd SDK consumer
failed its health check when an undeclared shared platform runtime resolved
differently from the build workspace. One direct dependency on the already pinned
shared runtime corrected that artifact path.

The reported packed check passed, while three unrelated local callback-port
assertions remained disclosed failures. These are upstream reports, not our
executions. The reusable lesson is to test real installed artifacts and declare
actual runtime dependencies; it does not justify pinning every transitive package
or adding a platform dependency to GM.

## Critical choices and verification boundaries

The source studies support a small shared-owner correction, a local data-model
refactor and targeted E2E. They do not justify another scheduler, cache, lifecycle
state machine or service locator. Each owner retains one responsibility: GM
selects bindings, Assembly captures and validates them, Effect executes native
resources, and the application owns operational policy.

Preparation envelope regression is a correctness fix. The node-map change is a
maintainability refactor. New resource tests close evidence gaps, not proof that
the previous mapper leaked. Keep those conclusions separate from source review,
successful execution, publication and production application admission.

After the focused checks, complete the existing changed/fast/full gates, review
the frozen diff, merge through normal protection and inspect the resulting main
checks. The PR owns live CI observations; this dated report does not continuously
certify a moving branch.

## Engineering assessment

For a large TypeScript application with concurrent I/O, resourceful services,
typed failure handling and cancellation, Effect's usefulness is **9/10**. The
extra difficulty of reproducing comparable guarantees without it is **8/10**.
These are engineering judgments for that workload, not measured multipliers or
claims that every large application needs Effect. Small, mostly synchronous
applications may not justify the learning and abstraction cost.

The strongest benefit is the common execution model across acquisition, work,
errors, interruption and cleanup. The studied failures also show its limit:
Effect cannot choose service identity, domain boundaries, safe retries, capacity
or durable recovery for an application. Its native operations must still be
connected to the correct owners. The GM adapter stays small by preserving those
native mechanisms and keeping selection and inert validation in their existing
neutral owner.
