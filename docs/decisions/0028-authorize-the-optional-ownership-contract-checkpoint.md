---
id: ADR-0028
type: adr
status: accepted
owner: architecture
approved_by: product-owner
accepted_at: 2026-09-14
summary: Freezes the optional ownership boundary and C0 contract while keeping implementation and consumer activation pending.
related:
  - ADR-0003
  - ADR-0023
  - ADR-0026
---

# ADR-0028: Authorize the optional ownership contract checkpoint

## Context

The owner explicitly requested the GM C0 decision/docs/schema checkpoint of the
approved SDK and owned lifetime plan on 2026-09-14. This decision records that
bounded authorization. K1 runtime implementation is a separate task. Existing
Core and Assembly contracts do not admit a resource lifetime package implicitly.
Two observed Agent Runtime (AR) paths below are candidates for the required
production scopes; path count proves neither eligibility nor repeated semantics.

## Decision

Authorize the optional public identity `@get-modular/ownership` at
`packages/ownership`, conditional on substantive K1 implementation and admission.
This adds one narrowly scoped exception to ADR-0003 topology and the existing
system boundary: local ownership bookkeeping, without operational authority.
It changes neither Core composition semantics nor Assembly construction.
Preserve all previously accepted ADRs and authority bytes. No supersession of
Host authority, lifecycle requirements or historical evidence is implied.

Core and Assembly must not import ownership. Ownership must not import Core,
Assembly, Extension Foundation (XF), Agent Runtime, Node builtins, IO, development
foundations, DI containers or product types. It has no runtime dependencies,
ambient registry, clock, timer, random source, background driver, callbacks,
dynamic plugins or durable state. It neither invokes acquisition/cleanup nor
proves authorization, readiness, external acceptance or recovery.

### One owner and one contract

The architecture owner owns this decision and the
[public TypeScript pseudo-contract](../../architecture/contracts/ownership/public-contract.d.ts).
That declaration file is the sole callable contract at C0; it is documentation
evidence, not an installable declaration package. The table below owns transition
semantics. The [checkpoint record](../../architecture/contracts/ownership/checkpoint.json)
contains observations and pending delivery status under its
[closed schema](../../architecture/contracts/ownership/checkpoint.schema.json).
The checkpoint's `contractRevision` identifies this freeze. Its contract and
decision digests bind the callable surface and transition semantics. Downstream
records bind repository, checkpoint path, revision and SHA-256 of the complete
checkpoint bytes, plus the externally recorded commit/patch identity. Permitted
consumers are listed in the checkpoint. The synced canonical plan at
`.codex-inputs/sdk-and-owned-lifetime-implementation-plan.md` was reconciled at
SHA-256 `e025978dcf3cfac12b7795fa3aafc96f06838620e124df4cc091ebee45352864`.
Its ownership scope, settlement rules, eligibility gate and delivery order bind
this checkpoint; the retained input is not a repository runtime dependency.
The checkpoint never contains
its own digest or final commit, avoiding self-reference.
These are not runtime wire formats, SDK report schemas or a generic state machine.

At K1, one ordinary ownership feature owns the private transitions and identity
membership. Do not split reserve/settle into graph nodes, a reducer framework or
an event bus. Consumers retain resource values, cleanup functions, raw errors,
policy and dependencies in owner-local records keyed by a ticket; they must not
maintain a second independently editable lifecycle ledger. One ticket represents
one cleanup obligation, potentially more than one object. Borrowed resources
create no owned ticket. Canonical CMS guidance remains owned by
[the Consumer Module Standard](../architecture/common-assembly.md#consumer-module-standard);
consumer profiles own only concrete local adoption and evidence.

### State and transition table

Admission (`open` or `sealed`) is separate from the seven ticket states. Every
method is synchronous; no method calls consumer code. All refused operations
leave state unchanged. A foreign identity takes precedence over state checks;
for a valid ticket, terminal/invalid state precedes admission checks. Cleanup
claims are opaque, scope-authenticated identities minted by the library, never
consumer counters or authorization credentials.

| Before | Operation or observation | After/result |
| --- | --- | --- |
| Open admission | `reserve()` before invoking acquire | New `pending` ticket |
| Sealed admission | `reserve()` | `sealed` refusal; caller must not acquire |
| Pending ticket, either admission state | `fulfill(ticket)` | `owned`, once |
| Pending ticket, either admission state | `reject(ticket)` with proven empty result | `rejected-empty`, once |
| Owned, open | `transfer(ticket)` | `transferred`, terminal for donor |
| Owned, sealed | `transfer(ticket)` | `sealed` refusal; donor retains obligation |
| Owned | `beginCleanup(ticket)` | `cleanup-in-flight`, fresh claim |
| Cleanup in flight | Another `beginCleanup` | `already-in-flight`, no new claim |
| Cleanup in flight | Observer cancellation/deadline | No transition; raw action remains single flight |
| Cleanup in flight, current claim | `settleCleanup(claim, "released")` | `released`; attempt terminal |
| Cleanup in flight, current claim | Settle `retry-safe` | `cleanup-incomplete`; attempt terminal, retry permitted |
| Cleanup in flight, current claim | Settle `unresolved` | `cleanup-incomplete`; same claim permits refinement |
| Incomplete, unresolved | `beginCleanup` | `unresolved` refusal |
| Incomplete, unresolved, current claim | Settle `released` or `retry-safe` after owner readback | Released or incomplete with retry permission |
| Incomplete, unresolved, current claim | Settle `unresolved` again | Inert success, still incomplete |
| Incomplete, retry-safe | `beginCleanup` | New in-flight claim; old claim permanently stale |
| Incomplete, retry-safe | Further settlement without new attempt | `invalid-state` refusal |
| Released/transferred/rejected-empty | New settlement, cleanup or transfer | `invalid-state` refusal |
| Any scope | `seal()` including repeated call | Sealed, idempotent; existing tickets remain usable |
| Unknown/copied/other-scope ticket or claim | Any operation using it | `foreign-ticket` or `foreign-claim` refusal |
| Superseded attempt claim | Settlement | `stale-claim` refusal, current attempt unchanged |

`settleCleanup` follows actual raw action settlement, never observer timeout.
Only the effect owner can establish released or retry-safe. The table distinguishes
terminal attempt outcomes from unresolved observation and same-claim refinement. Rejecting
an acquisition means **rejected-empty only**: allocation never started or the
factory proved complete unwind. Exception and abort alone are not that proof.

Reserve before acquisition. Save each independently releasable partial resource
and fulfill its ticket immediately, before the next await or possible throw;
then propagate the original factory error. An aggregate ticket cannot hide
partial effects. When the factory returns no handle and effects are unknown,
the factory/effect owner retains the obligation and the outer ticket stays
pending until readback. Do not reject to empty a snapshot or repeat acquisition.
Abort between reserve and acquire may reject only if acquire never started.
Fulfill after seal is allowed and must lead to owner cleanup, not publication.

Snapshot is a fresh deeply immutable inert view of admission and counts for all
seven states. Counts describe currently retained obligations, not a lifetime
history: terminal entries may be compacted; their counts are not cumulative.
It contains no tickets, claims, resources, callbacks, grants or raw errors.
Terminal identity remains effective while a caller retains its ticket; IDs are
never reused. Pending records require a strong consumer owner. A Promise closure
or inert diagnostic alone does not establish recovery after failed cleanup.

### Local cooperative handoff

`transfer` accepts only a ticket and guarantees one-time donor relinquishment.
It proves no recipient custody and accepts no receiver callback or destination.
AR validates the non-thenable carrier, exact identity, disposer and fallible hooks
and cancellation before commit, while the donor remains the sole active cleanup
owner. At commit the prepared carrier must already hold its self-contained
disposer; no later receiver activation step is permitted. If that custody cannot
be established at commit, the donor must refuse transfer. It then
commits, clears its local marker and returns the prepared carrier synchronously,
without await, logging, getters, allocation or consumer callbacks.
Failure before commit leaves the donor obligation; cancellation after commit
does not restore it. Failed transfer cannot publish the receiver. Receiver
identity, carrier validation, disposer custody and unobserved return handling
are AR integration policy and qualification obligations, not library guarantees.

### Conditional admission and delivery owners

| Delivery | Required evidence and rejecting checks | Owner |
| --- | --- | --- |
| C0 | Closed checkpoint schema, declarations typecheck, forbidden contract forms, unchanged current package rejection; no runtime implementation | GM architecture |
| K1 source/package | Substantive feature, exact manifest/version and lock graph; captured accepted-decision authentication; exact `packages/ownership` root; no nested manifest or install scripts | GM architecture/tooling |
| K1 source edges | Add actual `packageRoots` and non-overlapping governed production/development boundaries to Foundation v3, retain `rootPackage: true`; reject Core/Assembly-to-ownership and ownership-to-any-external edges including type imports and Node | GM architecture/tooling |
| K1 API/packed | Root-only ESM carrier and intentional exports; source/declaration dependency independence; positive and rejecting supported TypeScript/resolver fixtures; independent expected traces on installed exact archive; no test kit in runtime root | GM ownership feature |
| A1 adoption | Both AR production paths use common bookkeeping and remove replaced ledger; failure, partial acquisition, late settlement, seal, retry/refinement, stale claim, receiver identity and no double cleanup checks | AR Embedded Runtime |
| G1 SDK activation | After S3, activate the SDK gate for existing Core/Assembly before K1; K1 includes complete first-surface admission | GM architecture/tooling |

C0 deliberately leaves the existing executable package allowlist and production
source policy unchanged: materializing ownership now must still fail admission. K1
must atomically extend those policies with its implementation, actual roots,
API checks and independent rejecting fixtures, never pending-root exclusions.
The C0 declaration evidence belongs to the existing repository development
boundary; it does not admit a production root.
Public API release baselines remain release-owned. Proposed ownership version
and archive identity must be fixed in K1 before publication; no ownership archive
or registry version currently exists in this checkpoint.

Delivery order is **S3 → G1 activation for existing Core/Assembly → K1 package
with first-surface admission**. Ownership CMS guidance and consumer profile
changes remain **pending** until their K1/A1/G1 checks exist. K1 owns the single
CMS ownership change; G1 owns SDK evidence. Keep current CMS bytes, active pins
and the simple `AsyncDisposableStack` example unchanged at C0. Publication
requires exact version/archive identity, admission and owner approval; consumer
activation also requires final published integrity and consumer checks.

### Exact observations and prerequisites

GM integration base and remote main observed on 2026-09-14 are both
`ac49bb3374946330ec820591f8195a22d2c90900`. Workspace Core and Assembly are each
`0.2.0`; root is private `0.0.0`. Tooling pins are Engineering Foundation `1.2.0`
and Docs Protocol `0.6.0`. Lock and full CMS byte hashes are in the checkpoint.
CMS authority is ADR-0026 at `docs/architecture/common-assembly.md`, anchor
`consumer-module-standard`. FMS identity remains Git blob
`d0bfff2033faf544fe65268c1dcdfd524d093015`, SHA-256
`851653f96643cf0466b67ab22963661976b00de44840fa3144a48a8c054f95fa`.

The checkpoint retains AR source revision
`be96f01ea54ec7d2ec0156774e3dfb75fac46803`, active consumer profile byte hash,
active CMS pin and candidate path hashes read from that exact Git revision. Its contained-turn profile remains pending. The current full CMS differs
from AR's retained pin by the accepted passive-adoption reciprocal reference;
this does not activate ownership guidance or replace historical evidence.

The two candidate AR source paths and their exact byte hashes are retained in
the checkpoint; they are not proof of two materially distinct eligible scopes. Paths below are relative to AR's `packages/apps/embedded-runtime/src/`.

| Production use site | Existing owner and completion | Unresolved prerequisite for K1/A1 |
| --- | --- | --- |
| `composition/default-agent-runtime-host.ts`, `createRuntimeSetupAttempt` | Local `ownedHost` captured by the Assembly completion hook; validated exact returned root; synchronous clear/return; catch awaits `host.dispose()` and preserves creation error | Catch clears `ownedHost` before cleanup; failed cleanup returns an error without a demonstrated recovery holder. AR must name an existing strong holder, action driver and retry/readback entrypoint before losing the attempt. No new early construction timeout |
| `features/ordinary-session-runtime/composition/ordinary-agent-runtime-host.ts` | Closure retains journal, lazy provider, security/provider-access owners and cleanup list; successful disposal removes entries; Host and feature dispose observe one aliased OrdinaryFeature owner/action/flight; shared cleanup waits for both observations; pool is borrowed | Cleanup stops at first error and resets the observer promise. AR must prove raw flight/retry safety and resource prerequisite map; creation failure with remaining debt and no returned Host has no demonstrated existing recovery entrypoint here |

Plain synchronous clear/return of `ownedHost` is not a second eligible scope
without an additional demonstrated ownership invariant. The raw Host delegates
to the same OrdinaryFeature owner observed by `feature.dispose()`; two observer
paths must not create two tickets, actions or retry drivers for that obligation.

K1 and A1 are blocked until AR C0 proves two materially distinct eligible
production scopes and resolves the recovery-owner gaps above. Eligibility needs
actual owned acquisition and cleanup, an existing strong holder through failure,
a raw action driver and a reachable retry/readback entrypoint. Each scope must demonstrably need reserve-before-acquire, late settlement,
handoff or retained incomplete cleanup with shared semantics from this contract.
Only operations actually repeated across eligible scopes justify the common API;
remove unneeded operations before K1. Similar wrappers or two paths alone do
not qualify. AR owns that proof; no second eligible site is invented here.
A new registry, detached catch handler or inert error cannot fill these gaps.
Preserve same-instance provider/process coupling, lazy authorization, original
creation error causes and the existing `unfinished` operation ledger, which has
a different owner. The AR worker owns the complete acquisition/cleanup map and
A2 wait-policy decision; the plan's proposed 30,000 ms budget is not an existing
GM contract or a substitute for AR acceptance.

The updated EF base observation is `eadd117f98e8b93318426ab9d77d5890aab2e15e`; XF remains
`6379c8d3be3b9946f9ef1dc168cb8272dd726078`. Those are planning identities, not
fresh remote verification or adopted package pins. Their C0 decisions, SDK report
schema/CI authority and publication identities belong to the other workers.
No cross-repository implementation or conformance is claimed here.

## Consequences

- Architecture knowledge has one owner while execution and recovery remain local.
- C0 checks validate contracts and rejecting admission, never simulated runtime.
- K1/A1/G1 retain substantive source, archive and consumer proof obligations.

## Rejected alternatives

- Put bookkeeping inside Core/Assembly or XF: couples unrelated authorities.
- A generic graph, durable registry or dynamic plugin manager: exceeds local scope.
- Transfer through callbacks: introduces a fallible external effect at commit.
- An empty runtime package or fabricated passing implementation: proves nothing.
- Change accepted ADRs or activate CMS profiles before code: misstates authority.
