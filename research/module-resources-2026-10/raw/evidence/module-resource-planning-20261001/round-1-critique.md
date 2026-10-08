# Round 1 critique: scope, admission and single ownership

**Verdict:** The direction is coherent, but the plan is not implementation-ready. Package admission, failure cleanup and recovery custody remain architectural choices rather than specifications.

**Input plan SHA-256:** `90ddd653e155b9731277e56ddc0e8e2cc6417c1ac0f137b27bc3468c71c7e0d2`

**Requested review profile:** `gpt-6.1-sol`, MAX, default tier, no fast. This records the request, not independent backend attestation.

Reviewed the four mandatory inputs, supplied current GM authority at `9c722ceff4ede307d06d7a4b63fdebe615f54c53`, organization quality standard, and explicit TEST consumer records at `fcc10b2501420aacf9f904e976a4d230d3f02e68`. Retained authority hashes match their manifests. No files were written; no Git, builds, tests, installs or runtime/provider/agent flows ran.

## Scoped findings

### 1. Blocker — “Shared-first boundary”; delivery step 1: package and ledger are unresolved

“Separately admitted optional runtime facade” leaves the fixer choosing topology and potentially duplicating ownership semantics.

**Proposed correction:** Recommend a pending successor using the already reserved **`@get-modular/ownership`**, root **`packages/ownership`**, with one private obligation ledger per module instance. Proposed candidate version: `0.1.0-resource-candidate.1`; root-only ESM export, `createResourceOwner`, plus its types. Its author facet exposes only `resources.setup({ setup, cleanup })`; Host-only controls close and observe the retained owner. No public generic attempt manager.

Runtime dependencies remain zero. Core, Assembly and lifecycle-kernel neither import this package nor become prerequisites. Only outer consumer composition imports its public root; consumer-owned ports keep library types out of domain/application code. Bind the instance context through the existing factory closure, without changing Assembly’s factory injection contract.

The successor must explicitly authorize the bounded callback execution and candidate source admission that ADR-0028 currently forbids. This is a proposal, not existing authority.

**Acceptance:** One implemented root, one authoritative transition ledger, no mirrored Host disposal state, no additional composition node, and rejecting source/declaration/packed-root fixtures for forbidden edges.

### 2. Blocker — “Existing decisions”; delivery steps 1 and 4: candidate admission needs an explicit exception

ADR-0028 requires **S3 → G1 activation for existing Core/Assembly → K1** and materially distinct eligible production ownership scopes. ADR-0029’s pre-G1 exception admits the synchronous lifecycle kernel; it does not admit callback execution or ownership tickets.

**Proposed correction:** The successor must enumerate its candidate-only exceptions to ADR-0028’s callback prohibition and prohibition on materialization before K1. Preserve accepted ADR and C0 bytes. Keep **G1 on hold and K1 pending**; the supplied evidence does not establish S3 completion.

TEST success cannot establish trusted release authority, exact released-artifact binding, production recovery behavior, or two eligible production scopes.

**Acceptance:** Admission, TEST conformance, K1 eligibility, publication and production adoption have separate claims and evidence. Canonical current guidance and the affected TEST profile change together after admission. The retained TEST standard already has the same complete-document hash as current GM; do not invent an existing stale-pin defect.

### 3. High — “Small API”; required state behavior: failed setup has no usable cleanup argument

The example’s `cleanup(subscription)` cannot recover a subscription when setup rejects before returning it. Registering that callback early alone does not solve this.

**Proposed correction:** Specify a failure-aware cleanup input: `SetupOutcome<T>` is either `{ kind: "ready", value: T }` or `{ kind: "failed", cause: unknown }`. Store cleanup before invoking setup. Cleanup reports observed release or unresolved responsibility; fulfilled `void` is sufficient only where the selected adapter’s contract establishes release.

For partial async setup, use a synchronously prepared adapter-owned cleanup cell. A concrete bounded variant registers a subscription, retains its unsubscribe action, then awaits an initialization handshake. Handshake rejection leaves that same cell reachable through failure cleanup. Avoid requiring a second resource technology merely to imitate K1 eligibility.

**Acceptance:** An independently emitted event after failed construction detects a leaked subscription; cleanup can release it despite no returned success handle. Unknown rejected setup is never declared effect-free. Arbitrary callbacks receive no blanket unwind guarantee.

### 4. High — required state behavior; “Shared-first boundary”: custody is named but recovery remains unreachable

“The outer owner has a cleanup/recovery surface” does not identify what survives rejection or who drives recovery.

**Proposed correction:** The TEST Host prepares and retains an attempt record before invoking the factory. That record contains the instance resource owner, original construction cause, raw actions and the selected adapter’s recovery function. Failed construction does not remove it. A private, callable `recoverAttempt` operates on that original record; it does not reacquire resources.

The module scope owns each obligation. Host custody retains and invokes that owner. Assembly journal entries and returned instance cleanup must reference the same owner/action, without independently invoking physical cleanup.

**Acceptance:** After construction rejects, invoke the reachable recovery entrypoint and observe actual cleanup/readback. Concurrent Host and instance cleanup requests share one physical action. A timeout or unresolved rejection retains custody; release evidence alone permits removal.

### 5. High — “Parent, child and dependency lifetimes”: supported relationships are too broad

Sibling/external sharing, returned streams and transferable lifetimes exceed the promised nested slice.

**Proposed correction:** Bound this delivery to one parent, two children, one mediated borrowed dependency and no escaping lifetime. Register each child’s retention before its factory starts. Retention ends only after its actual work and required cleanup settle. Start independent child cleanup once; parent cleanup remains blocked by any child needing that prerequisite.

Reject unsupported overlapping/cyclic cleanup relationships. Do not infer ordering from Core’s construction graph or capability references.

**Acceptance:** Child failure before factory return, pending child setup, child cleanup failure and observer deadline cannot release the parent prematurely. Independent safe sibling cleanup still progresses. Neither child possesses parent cleanup authority.

### 6. High — nested TEST paragraph: ordinary admission and cleanup access need separate contracts

“Separate private shutdown path where needed” leaves an implementer able to close the very port required for cleanup.

**Proposed correction:** Ordinary admission closes atomically with synchronous active-use registration. Existing admitted work retains its dependency until actual settlement. Child cleanup receives a private closure restricted to the concrete shutdown operation; it cannot reopen ordinary calls.

Dependency unavailability remains a separate adapter health signal. It fences subsequent supported effects after awaits and does not authorize replay or automatic tree destruction. Private cleanup access does not make a physically lost dependency available.

**Acceptance:** New ordinary calls fail after closing; required child cleanup still works while its prerequisite remains available. Dependency loss prevents the next mediated effect.

### 7. High — “Focused acceptance evidence”: commands remain placeholders

“Use exact pinned project typecheck” is not a verification specification.

**Proposed correction:** Name the existing commands and their intended coverage:

- **GM:** `pnpm check:changed`, `pnpm check:fast`, final `pnpm check`.
- **TEST:** `pnpm typecheck`, `pnpm test`, `pnpm evidence`.

Extend their actual inclusion/runner chains for the admitted resource slice. Existing `ownership:checkpoint:test` proves C0 checkpoint constraints; `lifecycle:check` proves the pure kernel. Neither proves the paired helper.

The TEST evidence driver must replay exact candidate archive bytes and record source, archive hash/SRI, compiler/Node versions and complete standard bytes. Do not mix the retained Core/Assembly archive installations.

**Acceptance:** Removing a required scenario, excluding its type fixture, or replacing its runner with a no-op makes the relevant gate fail. Independent failure fixtures cover wrong cleanup authority and forbidden imports. Script names alone establish no coverage.

### 8. Medium — delivery step 5; estimates: optional work obscures acceptance

**Proposed correction:** Remove step 5 from this delivery and place stream transfer, overlapping lifetimes and production adoption in explicit exclusions. Remove generic retry/readback machinery unless the selected adapter needs it. Keep lifecycle-hook research entirely separate. Label source LOC as candidate library/adapter work, not qualified production delivery.

**Acceptance:** Completion requires only admitted surface, subscription/partial async setup, nested ownership evidence and synchronized TEST guidance—not future managers, dynamic adoption or G1/K1 closure.

## Actual unresolved choice: package/admission placement

Scores are design judgment; complexity 10 means greater burden. LOC estimates are approximate **candidate source / tests / docs**, not qualification evidence.

| Alternative | Confidence / reliability / complexity | Approximate LOC |
| --- | --- | --- |
| **Recommended:** one candidate `@get-modular/ownership` root with bounded callbacks and one private ledger; explicit successor exceptions | 8 / 8 / 3 | 300–500 / 500–800 / 150–250 |
| Separate `@get-modular/resources` facade over a pure candidate ownership ledger; explicitly admit both roots | 8 / 9 / 6 | 400–650 / 650–950 / 250–350 |
| Resource facade only after ordinary K1 qualification | 9 / 9 / 7 | 100–200 / 250–450 / 100–200, **plus unmet K1 work** |

The first minimizes roots and prevents competing ledgers. The second preserves package-level bookkeeping purity at additional boundary cost. The third delays the requested TEST slice behind unrelated prerequisites. No alternative is accepted here.

No finding warrants reopening the historical AR cleanup gaps: source corrections identify merged PR185 as superseding them. That correction does not qualify this universal API.

**Remaining source gap:** Before specifying evidence-driver coverage, relay [`scripts/evidence/run.mjs`](https://github.com/agent-teams-ai/modularity-host-test/blob/fcc10b2501420aacf9f904e976a4d230d3f02e68/scripts/evidence/run.mjs): which installations, fixtures and archive bindings does it actually execute? Its source was not supplied.
