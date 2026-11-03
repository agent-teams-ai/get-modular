---
id: QUAL-FOUNDATIONAL-RUNTIME-REFACTOR-2026-11
type: qualification
status: reviewed
owner: architecture
summary: Evidence, bounded implementation plan and review record for preparation and resource ownership defects.
related:
  - ADR-0023
  - ADR-0030
  - ADR-0034
  - ADR-0035
  - ADR-0039
  - ARCH-CURRENT-CONTRACT
  - ARCH-COMMON-ASSEMBLY
---

# Foundational runtime refactor, November 2026

## Scope and evidence status

The owner requested an autonomous technical-debt audit and justified refactoring
on 2026-11-04. The reviewed starting point is
`20c3ce8c5bb839a16fbe8dc258d6d96fd5206787`. This document records the concrete
findings, implementation boundaries, verification and independent reviews. It
does not accept a new API, change an accepted decision, qualify a release or
claim production adoption.

The initial inventory found 10,235 lines in 120 production TypeScript files
across the six packages. Core already has cohesive admission, semantics,
diagnostics and output owners. Its graph algorithms are iterative, its roots
are small, and its public contract has substantial independent evidence.
An exploratory 5,000-case object/raw comparison found no mismatch. That probe
executed current source under Node type stripping; it is neither a compiler
check nor the repository's required gate.

The permitted 15,000-25,000-line change budget is not a minimum. Rewriting sound
Core code or adding ceremonial layers would increase risk without addressing
the demonstrated defects. The selected work consists of six defects within
three existing semantic owners.

## Confirmed findings

| Priority | Finding | Baseline evidence | Owning implementation |
| --- | --- | --- | --- |
| High | Prepared composition retains caller aliases | Mutating a supplied composition during preparation changes the returned composition while execution still uses the captured plan. The returned plan can name an implementation that never runs. | Assembly `prepare.ts` |
| High | Completed rows bypass local aggregate admission | 65,536 explicit rows plus one inferred row produces 65,537 rows; 262,144 explicit provider occurrences plus one inferred row produces 262,145. | Assembly `derive-profile.ts` |
| High | Recursive close can strand a reserved flight | A valid 5,000-child chain throws `RangeError`, leaves the leaf signal live and performs no leaf cleanup. A second close joins the stranded flight. | Resources `scope.ts` |
| Medium | Closed children retain parent lifetimes | Keeping a successfully closed child retains the parent's otherwise unreachable resources. A controlled GC probe retained 20 of 20 payloads, compared with zero in controls; dropping the children released them. | Resources `scope.ts` |
| Medium | Repeated candidate allocation grows with slots times providers | 1,024 providers and 2,048 unresolved slots produce 2,048 different candidate arrays containing 2,097,152 references. An exploratory run took about 2.9 seconds; this is illustrative, not a performance guarantee. | Assembly `derive-profile.ts` |
| Medium | Recursive value validation rejects valid deep data | A 10,000-level ordinary Observation value graph throws `RangeError` without a stable error code; the corresponding 1,000-level graph succeeds. | Observation `values.ts` |

The initial probes used current source in a disposable Node process. Delivery
requires compiled public-entry regressions and the relevant installed-package
checks. Preserve these baseline observations separately from final results.

## Existing authority and concurrent work

- [ADR-0023](../decisions/0023-add-a-thin-host-owned-assembly-component-above-core.md)
  and the [Assembly contract](../architecture/common-assembly.md#preparation-and-resource-envelope)
  own synchronous capture, allocation ceilings, immutable instructions and
  sequential construction. Core remains the semantic validator.
- [ADR-0035](../decisions/0035-complete-composition-profiles-in-prepare-and-make-capabilitiesof-linear.md)
  requires capability-ID candidates at any revision. Core diagnoses revision
  mismatch. Every unresolved slot and its complete candidates remain visible.
- [ADR-0030](../decisions/0030-admit-the-module-resource-scope-package.md)
  owns resource registration, synchronous subtree closure, ordered cleanup,
  truthful debt, caller-local abandonment and explicit Host authority.
- [ADR-0034](../decisions/0034-admit-the-module-change-observation-package.md)
  owns plain data, identity-preserving ownership transfer and validation before
  freezing. [ADR-0039](../decisions/0039-retain-observation-load-drain-until-its-run-settles.md)
  remains unchanged.
- Open PR [#213](https://github.com/agent-teams-ai/get-modular/pull/213) owns the
  external subscription recipe and its consumer checks. PRs
  [#210](https://github.com/agent-teams-ai/get-modular/pull/210),
  [#221](https://github.com/agent-teams-ai/get-modular/pull/221) and
  [#222](https://github.com/agent-teams-ai/get-modular/pull/222) own installation
  documentation, the identity-workflow pin and communication research. This
  change does not absorb or rewrite them.

The current Consumer Module Standard matches the retained reviewed revision
`b2fec1fa15fe3998f51449d7df249f302645973f`: Git blob
`df4eff7235ac781ec574903c6b2aec13bcd7bfaa`, SHA-256
`3c5814ebf1ab1bd17688e49955aa0baa2ee91dd3a369adcea4d38aaccd53ba86`.
These fixes implement its existing invariants; they do not introduce a new
composition boundary or silently migrate the pin. The reviewed guidance delta
is empty.

## Implementation plan

### 1. Capture one owned prepared composition

Keep input reflection and all pre-await snapshots at the existing preparation
boundary. Recompile the supplied profile through the existing Core port and
compare the complete plan and envelope as today. Return the validated owned
composition instead of casting and returning the caller's original object.
Execution and the reported composition must describe the same plan and digest.

Preserve failure precedence, zero factory calls during preparation, exact
selection/root/input coverage, getter rejection and opaque product values.
Changes belong to `packages/assembly/src/features/construction/prepare.ts`.
No alternate compiler, serialization clone or public preparation mode is added.

### 2. Admit the completed profile before compiling

Count explicit bindings and their provider occurrences with the existing local
limits. Analyze missing slots and include inferred rows in those same counters
before materializing the completed profile. Keep the existing unresolved-slot
failure precedence; when completion is possible, overflow returns the existing
`assembly.prepare.limit` result without invoking Core or any factory. Explicit
empty rows, duplicate rows and provider order remain untouched so Core can
report semantic failures.

The boundary is structural admission, not graph validation. Do not introduce
new limits, truncate diagnostics or select a different provider on overflow.

### 3. Index candidates once per preparation

Build one preparation-local capability-ID index with implementation IDs
deduplicated and sorted once. Reuse a frozen full candidate array for a consumer
that is not a provider; cache the self-excluding frozen array for repeated slots
of a provider. Avoid repeated scans and sorts of the same set for every slot.

Keep the complete unresolved rows, their order, group paths and candidates.
One provider at the wrong revision still reaches Core; multiple revisions of
one capability remain multiple candidates. Duplicate provides on one entry
count as one candidate, while Core still owns duplicate-declaration diagnostics.
There is no cross-preparation cache or mutable global index.

The all-candidates public diagnostic contract can still require quadratic
output in adversarial all-provider graphs. This change removes repeated work;
it does not claim a new absolute memory bound or alter that contract.

### 4. Make resource-tree operations independent of call-stack depth

Replace recursive subtree request, acquisition-abort, close notification and
escalation traversals with explicit private traversal state. Preserve live
child iteration and its order. Seal the entire subtree before the first user
abort listener runs. The shared notification barrier must stay active until
all pending native listeners have returned, including reentrant closes.

Break the synchronous child-flight startup recursion through the existing
tree-local pending-start queue and its drain guard. This remains an internal
implementation of one close flight, not a scheduler API or a new authority.
Independent roots retain their existing behavior. Sequential parents continue
to await the child flight; concurrent scopes retain independent peer release.

Replace recursive debt flattening with explicit cursors preserving the exact
failed, active, pending-setup and reverse-live ordering. Preserve opaque causes,
frozen report snapshots, escalation reasons, retry semantics and caller-local
abandonment. Do not catch stack overflow and report success, skip cleanup or add
a depth cap. Existing reentrancy tests remain unchanged and mandatory.

After a child is completely released and detached, clear its private parent and
entry links. A failed or pending child retains ancestry for retry, escalation
and parent debt. Public paths remain stable plain data. Do not clear user
listeners, alter Host lifetime policy or claim physical resource release.

All runtime changes stay in the existing Resources scope owner. A separate
scope engine, new package, generic traversal service or lifecycle kernel
integration is unnecessary.

### 5. Validate Observation graphs iteratively

Replace recursive plain-value validation with a depth-first cursor stack.
Preserve the first-error order, descriptor-only reads, proxy rejection,
prototype rules, cycles, repeated references and the known-frozen-node cache.
Validate the complete graph before freezing any newly admitted value.

Keep caller objects and graph identity; do not clone or serialize. A failed
patch must leave the previous revision and every new object unchanged. Existing
watch delivery, latest-load cancellation and cleanup behavior are outside this
slice. The implementation belongs to `features/store/values.ts`.

## Verification plan

New maintained tests use `.ts`, the repository's strict compiler projects and
TypeScript 7.0.2. Existing runtime, public API, source-dependency, release-owned
file and immutable-evidence gates stay active.

| Boundary | Required evidence |
| --- | --- |
| Prepared composition | Mutate a cooperative supplied plan immediately after `prepare`; assert returned immutable composition and actual created journal agree. Keep tampering, getter and zero-call failures. |
| Completed admission | Exercise exact limits and plus-one explicit-plus-inferred totals; verify overflow precedes the compiler port and factory calls. |
| Candidate reuse | Compare complete independently expected unresolved rows under permutations; cover self exclusion, duplicate provides, wrong revisions, optional absence and ordered many. Use deterministic retained-array counts, not a timing threshold. |
| Deep cleanup | Release a real registered leaf resource through a deep child chain; prove synchronous subtree sealing and ancestor dependency order. |
| Debt and cancellation | Deep pending cleanup with abandonment and escalation; preserve exact debt path and opaque cause; failed cleanup retries once and a parent never reports completion early. |
| Detached lifetime | A controlled subprocess GC probe compares retained closed children with controls and verifies failed children still preserve required ownership. |
| Deep state | Public `createStore` and `set` accept a deep ordinary graph, retain aliases/cycles and freeze admitted nodes; deep invalid data produces a coded error without partial freezing or revision changes. |
| Distribution | Existing packed-root consumers for changed packages, Assembly integration and type resolution, source boundaries and public API compatibility. |

Run the relevant focused checks during implementation, then the documented
`check:changed`, `check:fast` and complete `check` route. Use the existing
OS/runtime CI lanes for platform evidence; a Linux local pass does not qualify
Windows or macOS. Provision exact pinned tools and keep the isolated Node
rollback installation separate from the default Bun installation.

Review the source with several independent critics after integration. One
round targets ownership and behavior; another targets regressions, tests,
packaging and unnecessary abstraction. Fix every confirmed finding and repeat
review where the fix changes the reviewed behavior. A clean review is an agent
assessment, not a GitHub approval or proof that no defect exists.

## Delivery and exclusions

Commit this plan first, then deliver cohesive implementation commits and push
each immediately to the working PR. The integrator owns root scripts, strict
test registration, source profiles, documentation, changeset and Git history.
Workers own disjoint runtime slices and report any required shared changes.

Do not rewrite Core or Conformance, change public exports, add dependencies or
feature flags, introduce an event bus, qualify browser execution, activate the
private lifecycle candidate, migrate product consumers or publish packages.
Do not edit accepted ADR bytes, `architecture/public-api/`, retained evidence,
CI protection or required checks. Package-local qualification helpers retain
their existing resolution/custody boundaries; similar syntax alone is not a
reason to unify them.

## Review and execution record

- Initial independent audits: Core, Assembly/Conformance and
  Resources/Observation/Lifecycle, using Astra with maximum reasoning effort.
- Initial plan critique: preserve capability-ID-only completion, atomic
  validation-before-freeze, synchronous subtree sealing and the abort-listener
  barrier. No evidence justified a production Core rewrite.
- Implementation covers all six selected defects in four existing source files.
  Compiled baseline controls reject the new Assembly ownership, overflow and
  candidate-sharing evidence; the 5,000-level Resources cases fail and all 24
  retained closed children keep their parent payloads alive; all three deep
  Observation cases fail. These controls ran against the unchanged built base.
- Focused implementation evidence: 43 Assembly cases pass with strict source
  and tooling checks; complete Resources checks pass with 39 local/integration
  cases; Observation build, typecheck and 31 focused cases pass. Resources and
  Observation installed-archive consumers pass, including their new deep cases.
  The Assembly installed consumer passes with the public ownership regression.
- Packed qualification exposed an additional verification defect: inherited
  `NODE_TEST_CONTEXT` made nested Node test commands skip their files while
  returning success. A disposable failing control demonstrated the false pass.
  The existing Assembly and Resources helpers now clear this variable for test
  invocations. The new packed suites assert executed/pass counts and zero
  failures, cancellations, skips or todos. Observation already sanitized the
  environment and now has the same explicit receipt for its new suite.
- Local edits to existing JavaScript harnesses and profile tables remain small;
  a full harness migration would broaden this runtime repair. All new maintained
  tests and helpers are TypeScript in existing strict projects and normal gates.
- Two independent cross-review rounds found no remaining runtime defect. Review
  improvements removed the temporary borrowed composition cast, compared all
  2,048 expected diagnostic rows, strengthened packed receipts, removed a stale
  test registration/copy and included Core's coordinated patch metadata. Core's
  runtime is unchanged; the exact Core/Assembly version pair must remain intact.
- CI integration review found two additional registration errors: a package-local
  Assembly test used a package-name self import that the existing source policy
  could not resolve, and two legacy admission assertions still expected the old
  test-file lists. The test now uses its owner's existing public build entry;
  the exact assertions include the new suites. No policy boundary was widened.
- Concurrent peer cleanups have no relative-start-order guarantee. The internal
  queue preserves synchronous sealing, the abort-listener barrier, sequential
  child waiting and ordinary first-cleanup startup; no claim is made about every
  incidental nested callback ordering.
- Repository-wide gates, final source revision and exact-head CI results remain
  pending integration. The first plan-only GitHub check confirms that the old
  pinned identity verifier rejects the plugin's owner-name alias despite the
  current central policy. PR #221 owns that separate immutable-pin migration;
  this delivery does not change identity enforcement or claim a passing check.
