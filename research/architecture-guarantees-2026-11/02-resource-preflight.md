# 02. Validate declared resource requirements before construction

**Status:** proposed implementation plan; this planning change implements no API.
**Baseline:** Get Modular `5fb83478dd7b95216be92c4d3077eddf2774eef8`.
**Priority:** next production slice after the existing subscription correction.

## Problem and exact guarantee

`RunOptions.scope` is currently optional and opaque. `scoped` authenticates it
only when its particular factory is invoked. In the previously executed source
probe, a plain provider ran before a later scoped consumer rejected a missing
scope. That probe is not a packed-package or TypeScript qualification result.
The existing behavior is explicitly documented in ADR-0031.

For entries that declare the admitted `scoped` adapter, reject a missing,
foreign-copy or already closing/closed run scope **before any selected factory
is invoked**. Make the required scope visible in the prepared assembly type.
This is a new execution guarantee, not a change to Core graph validation.

## Ownership and scope

- Assembly owns authentic entry metadata, aggregation and execution ordering.
- Resources alone owns scope identity and state validation through its existing
  private `WeakMap` and close-request flag. Validation creates no child scope,
  listener, acquisition, cleanup, timer or asynchronous work.
- Host owns its scope, cancellation policy, cleanup and successful root handoff.
- Core plans, digest encoding, exact compatibility and dependency ordering stay
  unchanged. No package gains a runtime dependency on another scope owner.
- No general context provider, service bag, adapter registry, runner framework,
  lease runtime, plugin lifecycle, parallel construction or rollback engine.

## Selected small design

1. Extend the existing callable adapter with one immutable own data property,
   proposed name `validateRunScope`. Resources supplies a synchronous function
   accepting an opaque value and returning that same authenticated `Resources`
   facade, or throwing its existing invalid-scope/closed-scope error. Its return
   type carries the required scope type; Assembly neither interprets the scope
   nor awaits the result. The public structural adapter contract stays narrow;
   CMS continues to admit only `scoped`.
2. At `implement`, validate/capture the declaration, then read and capture the
   validator once using an own data descriptor **before invoking the adapter**;
   reject an accessor, missing validator on an adapter, non-callable validator
   or invalid adapted factory with `assembly.bind.invalid-factory`. Only after
   metadata admission invoke the adapter and validate its returned factory.
   The bad-metadata fixture must assert zero adapter-callback calls. Retain the
   callback with the existing private entry metadata; never trust a property
   later read from a consumer-supplied entry. Resources publishes the validator
   on `scoped`; no shared global registry, symbol registry or Assembly import.
3. Carry this metadata through existing `Program.steps`. Before construction,
   walk the selected steps in dependency order and call each declared validator.
   Do not run validators at `prepare`, cache successful validation between runs,
   or derive it only from roots. Repeated checks of the same validator are cheap;
   no deduplication subsystem is necessary.
4. Propagate the required scope type through `ModuleEntry`, `EntriesOf`, nested
   groups, `AssemblyPreparationResult`, `PreparedAssembly` and `RunOptions`.
   A pure assembly still permits `run()`. A known resource assembly requires
   `scope: Resources`, in addition to any declared inputs. Use the existing
   group's entry union; do not add a second recursive group traversal type.
5. Widening must not silently produce a no-scope prepared assembly: reject a
   requirement-erasing assignment or conservatively require an explicit scope
   when entry information is unknown. Keep capability-map invariance separate
   from this requirement. Never infer purity merely from a missing type detail.
6. The qualified Assembly form remains `implement(declaration, factory, scoped)`.
   Migrate existing integration fixtures using `implement(declaration,
   scoped(name, factory))`. A directly identifiable prewrapped factory must be
   rejected with a clear canonical rewrite, rather than quietly treated as pure;
   a small non-executable marker on the wrapper may support this guard. Keep
   standalone `scoped(name, factory)` useful outside Assembly. Hidden arbitrary
   closures, explicit casts and undeclared resource use cannot acquire an
   automatic requirement guarantee; do not claim otherwise.
7. Preserve these requirements through the existing Conformance smoke rebuild.
   Its current `implement(declaration, wrap(entry.factory))` loses adapter metadata.
   Use one narrow Assembly-owned operation, proposed `wrapEntry(entry, wrapFactory)`,
   which authenticates an existing module entry, wraps its already adapted factory
   once, and preserves its captured declaration, private validator and invariant
   capability/requirement types. Reject forged entries and non-callable results.
   This operation grants no new context, disposal right or dependency lookup.
   Conformance uses it instead of reconstructing an entry from public fields;
   it neither reads private metadata nor applies `scoped` again. Keep its current
   carrier-preserving wrapper and entry-copy cache. No generic interception API,
   hook registry or extra lifecycle layer is introduced.

Confirm inference, the marker and this narrow wrapping operation in one strict
TS 7.0.2+ fixture before
expanding the implementation. This checks the proposed surface, not permission
to introduce an alternate adapter framework. Keep callable metadata read-only;
a mutable callback or post-bind replacement must not change a prepared program.

## Failure and cancellation contract

Preserve existing precedence: initial abort returns cancelled; then admit all
declared inputs; then validate context; then retain the existing abort check
before each factory and the success commit. Invalid inputs therefore retain
their existing precedence over an invalid resource scope.

A rejecting validator returns a failed outcome with proposed phase `context`
and code `assembly.run.invalid-context`. Preserve its original opaque cause,
the first rejecting implementation ID in dependency order, `created: []`,
`returned: undefined` and the existing observed-cancellation field. Validate
that success returns the supplied scope by identity, without inspecting it or
assimilating thenables; an invalid validator result is a context failure.

Preflight is not a lifetime reservation. A scope closed by an earlier factory
must still fail when a later `scoped` factory opens its child; preserve the
already created journal and current factory error semantics in that case.
Each run validates its own scope, including repeated and concurrent runs.
No failure closes a borrowed scope, disposes journal values or starts a retry.
The existing Host attempt/run/close/handoff recipe remains the ownership path.

## Implementation sequence and files

1. Add a successor decision through the installed documentation workflow for
   the affected ADR-0030/0031/0036 clauses: adapter metadata, conditional run
   requirements and the new outcome phase. Preserve all accepted ADR bytes.
   Update current CMS and module-authoring guidance in the same delivery.
2. Implement the Resources validation seam and callable metadata in
   `packages/resources/src/features/scope/{scope,types}.ts`; keep curated
   root exports and zero dependencies. Share identity/open-state checks with
   `openModule`, but retain its check at the actual child creation boundary.
3. Change `packages/assembly/src/features/construction/{types,entry,ports,
   prepare-program,run}.ts` and the relevant public type exports. The existing
   authenticated collection and two public prepare routes retain their limits.
   Update Conformance `features/harness/smoke.ts` and its types in the same slice:
   the public `compose` callback carries the requirement parameter; loose harness
   views must not silently treat a requirement-bearing prepared value as pure.
   Audit `isolate` and other public type consumers for this generic change only.
4. Add one public-package integration test in
   `tests/assembly/run-context-preflight.test.ts`, include it in
   `tests/tsconfig.assembly-tooling.json`, and extend the existing
   `tests/resources/assembly-types.ts` NodeNext/Bundler fixtures. Update exact
   expected codes in affected old fixtures; preserve their original assertions.
5. Extend the existing semantic consumer and packed-entry proof with the small
   missing-scope case. Reuse the Conformance packed consumer, which already
   installs Core, Assembly and Resources archives; add no archive runner.
6. Update affected CMS adoption pins by reviewed delta, package peer pairing,
   examples and migration guidance; run the existing required gates.

## Independent acceptance matrix

| Case | Required observation |
| --- | --- |
| Pure provider before scoped consumer; scope missing, `Scope` instead of its facet, forged facade, another package copy, closing or closed facet | Context failure; zero factory/acquisition calls; empty journal; scope remains Host-owned |
| Invalid inputs and invalid scope together | Existing input failure, no factory or validator work |
| Initially aborted run with invalid inputs/scope | Cancelled, no factory or validator work |
| Valid scope; scoped non-root inside nested group | Normal success, exact declared dependency values and one module child per call |
| Mixed authentic Resources package copies in selected entries | Reject before any factory even if an earlier validator accepts |
| Two concurrent runs; reuse after closing one scope | Independent outcomes; closed one rejected before calls, live one unaffected |
| Scope closes after preflight during an earlier factory | Later per-use refusal, original created/returned ownership preserved |
| Pure assembly and input-only dependencies | Existing optional-scope behavior and input borrowing preserved |
| Typed resource entry/group/annotated prepared value | Missing/undefined/wrong scope rejected where known; widening cannot restore optional run |
| Invalid adapter data/accessor and detectable prewrapped form | Bind-time refusal, no accidental callback/getter execution |
| Authentic entry through smoke wrapping | The same preflight and required-scope type survive; one resource adaptation/child, unchanged carrier semantics; forged copies reject |
| Packed NodeNext/Bundler consumer and changed-copy Resources control | Same public behavior/types; no deep imports or workspace-only identity |

Expected counters and outcomes are handwritten; do not generate their oracle
from the implementation. Missing-scope and duplicate-copy negative cases must
fail if preflight is removed. No wall-clock benchmark or unrelated test expansion.

## Consumer and verification route

The concrete consumer is Agent Runtime's already adopted passive/ordinary
composition, observed at `f990acc26e1b8071ae22d0b87a2ddd3672be8e2e`.
Its `architecture/get-modular/consumer-profile.json` pins CMS
`b70ba39304ac71964175c42a77309406a7c30ca2`, Core/Assembly 0.6.0 and Resources
0.2.0. Its ordinary owner tree and retained outer journal already exist.
At implementation time review that exact pin's delta to the selected successor,
qualify the new archives in an isolated copy of that existing composition and
run its current scoped construction/cleanup tests. Record new source/archive
identities. Do not migrate unrelated contained-turn or dynamic/plugin scopes.
Consumer qualification and adoption of this proposal remain pending.
The isolated copy is preliminary compatibility evidence. Completion also requires
the bounded patch in the actual consumer, its adopted source head, reviewed CMS
and package/archive identities, and consumer-owned required checks/results. Reuse
that one ordinary-owner delivery for plan 06; do not create a second adoption.

After the repository's frozen installation and compiler floor guard:
`bun run assembly:build`, `bun run resources:build`,
`bun run assembly:typecheck`, `bun run resources:typecheck`,
`bun run assembly:test`, `bun run resources:test`, `bun run resources:pack`
and `bun run conformance:check` exercise the relevant existing routes.
Use `bun run check:changed` during edits, `bun run check:fast` before handoff
and `bun run check` as the required final gate. The full gate still owns all
repository-wide checks. Source type stripping is not typecheck evidence.

## Migration, acceptance and stop boundary

This is a deliberate breaking contract, shipped through the current coordinated
0.x release rules. Determine exact next versions from the implementation base;
preserve the Core/Assembly pair and affected peer ranges. Add the mandated
`Migration (0.N -> 0.N+1)` block, including a same-PR codemod for recognizable
prewrapped calls and affected mechanical type annotations. Report wrappers with
nonmatching names, custom adapters and semantic scope ownership under `fix by
hand`; never invent or auto-close a scope. No compatibility alias or feature flag.
Do not edit released public-API baselines or weaken gates to admit the break.

Done means the complete public-package/type/consumer matrix passes on the exact
implementation head, and current guidance/pins reflect the changed contract.
If the design needs resource acquisition or lifecycle allocation during preflight,
a new cleanup authority,
scope-object introspection in Assembly or a general requirements registry,
reduce the design before continuing. Likewise stop if smoke preservation needs
a general instrumentation framework instead of the one authentic-entry wrapper.
A successful preflight never promises that
the Host will keep the scope open or that opaque capabilities cannot escape.
Ordinary diagnostic objects and existing per-run bookkeeping are permitted;
this is not a zero-heap-allocation requirement.

**Estimated incremental code:** 350–700 production/integration lines and
550–1,000 test/fixture lines, including the existing smoke integration;
codemod and consumer migration effort depend on the
actual affected call sites and are recorded separately. **Confidence 8/10,
achievable reliability within this guarantee 9/10, complexity 7/10.** These are
engineering judgments, not measured availability or completed qualification.

## Source anchors

- [Current Assembly entry and execution](../../packages/assembly/src/features/construction/run.ts)
- [Current adapter and run types](../../packages/assembly/src/features/construction/types.ts)
- [Resources private identity and child creation](../../packages/resources/src/features/scope/scope.ts)
- [Accepted per-run scope contract](../../docs/decisions/0031-pass-a-per-run-scope-and-declared-inputs-to-assembly-runs.md)
- [Current Host ownership rules](../../docs/architecture/common-assembly.md#module-resource-scopes)
- [Pinned Agent Runtime adoption](https://github.com/agent-teams-ai/agent-runtime/blob/f990acc26e1b8071ae22d0b87a2ddd3672be8e2e/docs/architecture/get-modular-adoption.md)
