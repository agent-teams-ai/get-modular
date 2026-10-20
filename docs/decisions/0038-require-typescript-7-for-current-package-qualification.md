---
id: ADR-0038
type: adr
status: accepted
owner: architecture/tooling
approved_by: product-owner
accepted_at: 2026-10-18
summary: Carry the authorized TypeScript 7.0.2 floor into current qualification without rewriting accepted historical evidence.
related:
  - ADR-0024
  - ADR-0030
  - ADR-0034
  - ADR-0036
  - ADR-0037
---

# ADR-0038: Require TypeScript 7 for current package qualification

## Context

The owner explicitly selected TypeScript 7.0.2 or newer for the observation
implementation and its end-to-end qualification. The workspace build compiler
already uses 7.0.2, but the minimum alias, current type consumers, finite source
readers and codemods still selected older compilers. Current support documents
promised 5.8.3. ADR-0030's admission-evidence paragraph and ADR-0034's compiler
sentence record that older minimum.

TypeScript 7 exposes its native compiler and AST APIs differently. Relabeling an
old parser or deleting its semantic checks does not satisfy the new floor.
ADR-0024 separately preserves the exact historical M2 lock witness and strict
derivation of its retained subject. Historical evidence is not a current
compiler support promise.

## Decision

1. Current Get Modular builds, declaration consumers, compiler-backed readers,
   codemods and new observation evidence use exact stable compiler pins at least
   7.0.2. The initial current and minimum aliases both resolve to 7.0.2. Resolve
   their manifests before launching either and run each distinct version once
   per required resolution mode. Keep `skipLibCheck: false`. A future distinct
   minimum/current pair still runs both; removing duplicate invocations does not
   remove any positive, negative, provenance or resolution case.
2. This supersedes only the compiler minimum in ADR-0030's admission evidence
   and ADR-0034's qualification paragraph. All other admission, API, lifecycle,
   ownership, archive and publication requirements of those decisions remain.
   Current finite readers use the exact native TypeScript 7 AST and checker
   through a closed virtual filesystem, preserving symbol and declaration
   identity, diagnostics and rejection controls. Codemods retain their exact
   output, manual-review findings, trivia and idempotence checks.
3. The current M1 schedule contains 87 commands and the combined current M2
   schedule 272: ten duplicate commands for the former distinct minimum are
   removed. The 77 non-compiler M1 cases and 185 raw M2 cases stay intact. Sealed
   97/282 historical records, accepted ADRs, API baselines and the historical
   lock witness remain unchanged. The opt-in `m1-retained-session.mjs` runner
   keeps its historical source/tool identities. Do not run its old subject as
   new qualification under the current exclusive compiler floor.
4. The current observation type port deliberately corrects the two unsafe
   watch-only assignments in archived p8. They are independently checked TS2322
   negatives; same-record positive controls still pass. The archive and its
   historical affirmative result remain intact. Consumers still depend on the
   whole `ReadonlyStore<Slice>`, with declared future values, optional dynamic
   keys, distributed union snapshots and an invariant writer. This is the
   bounded qualification correction anticipated by the reviewed implementation
   plan, not a general observation API expansion.
5. Raising the supported consumer floor is a pre-1.0 support break. Prepare it
   as Core/Assembly 0.6.0, resources 0.2.0 and conformance 0.4.0 through minor
   Changesets with migration notes. Core and Assembly remain an exact pair,
   and admission authenticates this decision for 0.6.0. Observation's first
   minor is 0.1.0 and its resources peer names the actual 0.2 minor; its own
   initial minor Changeset covers ADR-0034's required resources-minor
   coordination. The private lifecycle candidate retains its admitted 0.1.0.
6. No below-floor exception is granted to dependent tooling. The installed
   Foundation 1.7.4 API compatibility paths invoke TypeScript 5.9.3 through
   API Extractor and its observer; the latest stable upstream packages still
   do. A separately owned upstream compiler migration and an explicit
   extractor-provenance upgrade must resolve that dependency. Until then, the
   affected complete gates and release eligibility remain blocked under this
   floor. Individually executed checks report only their actual scope.
   Do not override dependencies, relabel extractor identities, rewrite sealed
   baselines or remove gates to create a green aggregate.
7. This decision permits preparing and testing exact unpublished release
   candidates. It does not claim G1, a completed aggregate, production consumer
   adoption or npm publication. The existing owner-controlled publication and
   merge requirements remain.

## Consequences

- New package and consumer evidence has one honest compiler floor. Native
  symbol checks preserve the semantic protections of the earlier readers.
- Consumers on earlier TypeScript versions must upgrade before adopting this
  release. No command or runtime migration is otherwise introduced by the
  compiler support change.
- Frozen evidence remains verifiable as its original subject. It is neither
  refreshed nor described as a TypeScript 7 run.
- The [implementation plan](../../research/module-communication-2026-10/implementation-plan.md#23-typescript-702-minimum-authorized-policy-and-concrete-migration)
  maps the current compiler owners. The [dependency investigation](../../research/module-communication-2026-10/typescript-toolchain-blocker.md)
  records the unresolved third-party call chains and exact upstream owner route.

## Rejected alternatives

- Running 5.8.3 or 5.9.3 under an observation-only floor exception: contradicts
  the owner's exclusive minimum.
- AST-free string checks, a generic legacy API emulation or suppressing native
  diagnostics: weakens semantic identity and rejection evidence.
- Refreshing released API snapshots or changing old M2 hashes to match current
  tooling: changes the qualified subject and bypasses provenance.
- Publishing the new floor as a patch: hides a removed consumer support promise.
