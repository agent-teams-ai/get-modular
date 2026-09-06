---
id: ADR-0022
type: adr
status: accepted
owner: architecture
summary: Preserves independent schema diagnostics in two resource-boundary outcomes without changing frozen generation-two evidence.
approved_by: product-owner-delegated-orchestrator
accepted_at: 2026-09-07
related:
  - ADR-0020
  - ADR-0021
  - ARCH-MVP-IMPLEMENTATION-ROADMAP
---

# ADR-0022: Correct two in-envelope M2 resource outcomes

## Context

The two generation-two resource recipes `od006.resources.v1/bindings/over`
and `od006.resources.v1/providersPerManySlot/over` exceed schema array bounds
while remaining inside the JSON occurrence, aggregate string and depth
resource envelope. Their frozen expected results omit an independently
eligible `schema.invalid-value` candidate. ADR-0020 preserves complete eligible
diagnostics for malformed inputs inside that envelope. Repeated binding-record
precedence does not suppress schema diagnostics for a schema-invalid profile.

## Decision

On 2026-09-07 the product owner explicitly delegated this choice to the
orchestrator. Accept the additive correction, without suppressing runtime
schema diagnostics. This narrowly supersedes ADR-0021's complete expected
outcome obligations for exactly these two case IDs. All other ADR-0021 rules
and numerical resource limits remain unchanged.

The complete replacement outcomes are in
[outcomes.json](../../architecture/qualification/m2-resource-outcomes/outcomes.json).
Each result contains the original limit diagnostic, preceded by one
`schema.invalid-value`, phase `schema`, empty coordinate, reason
`invalid-format`. Its path identifies the same array as the limit diagnostic:
`profile.bindings`, or `profile.bindings[0].providerImplementationIds`.
Both failures contain no plan or digest. Existing diagnostic ordering applies.

The outcomes file SHA-256 is `9e4dc13ff0711c1026e827dfd0f0b4c9e8257478be7de412efea5c16b521d650`.
The original six resource recipes, all frozen expectations, original ADRs,
generation-two ledger, retained archive and historical observations stay
byte-identical. Their original failures are not relabelled as passing this
successor. No existing case is removed or treated as an allowed mismatch.

The private
[resource outcome adapter](../../tests/qualification/support/m2-resource-outcomes.mjs)
reads the unchanged six recipes and replaces only the two complete expected
results from this pinned supplement. Its output is the resource category for
new M2 ordinary-entry replay. Other categories retain their original expected
results; the original 941-case evidence remains a historical fixture capture.
There is no compiler import, candidate-derived expectation or runtime policy
switch in the adapter. Admission remains the sole owner of runtime admission
rules; no new production abstraction is needed.

## Consequences

- New M2 replay retains the original case IDs and inputs, all six resource
  results, and this supplement identity alongside the original source identity.
- Object and raw ordinary entries must both satisfy the successor obligations.
  A local object check alone does not complete M2.4, packed qualification or M3.
- The [Core regression](../../packages/core/tests/qualification/m2-resource-outcomes.test.mjs)
  checks all six full results, unchanged input recipes and the exact additive
  correction. It also requires the original two expectations to remain different.
- Run `pnpm core:build`, then
  `node --test packages/core/tests/qualification/m2-resource-outcomes.test.mjs`;
  complete the normal full gate and independent review before delivery.

## Rejected alternatives

- Suppress the schema candidate: contradicts in-envelope coverage and hides
  an independently established failure.
- Rewrite the accepted fixture source or omit failing cases: destroys the
  historical identity or weakens complete-result qualification.
