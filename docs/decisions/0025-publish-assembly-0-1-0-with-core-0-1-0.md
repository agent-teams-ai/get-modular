---
id: ADR-0025
type: adr
status: accepted
owner: architecture
approved_by: product-owner-delegated-orchestrator
accepted_at: 2026-09-08
related:
  - ADR-0023
  - ADR-0024
  - ADR-0019
  - ARCH-COMMON-ASSEMBLY
summary: Admits the first public Assembly package with authenticated publication authority and retained-byte release checks.
---

# ADR-0025: Publish Assembly 0.1.0 with Core 0.1.0

## Context

ADR-0023 admits the optional construction component; its initial implementation
requires a private package. ADR-0024 separately admits current workspace edges
and preserves the historical M2 lock witness. Consumer adoption needs a public
package identity.
The owner delegates acceptance and the bounded first publication prerequisite.

## Decision

Extend the private package admission retained by ADR-0023 and ADR-0024 to
the first public `@get-modular/assembly@0.1.0`.
The canonical public manifest omits `private`, declares npm public access at
`https://registry.npmjs.org/`, and identifies the existing repository and
`packages/assembly` directory. The sole source dependency remains Core at
`workspace:*`; the packed dependency must be exactly `@get-modular/core: 0.1.0`.
No API, engine, export, lifecycle or dependency expansion is authorized.

Retain the original private manifest shape for historical evidence. Public
admission additionally authenticates this complete accepted decision and its
registry identity through the same captured input reader as ADR-0023. Shape
validation alone is not publication authority. Preserve ADR-0024 current
workspace/importer checks and independent root tooling dependency policy; do not
restore authentication of the entire current lock against historical bytes.
Its authenticated historical witness reader remains separate from current
Assembly admission. The legacy direct historical reader retains its strict
reconstruction and authenticates this extension when given a public manifest.
Accepted decisions, the witness and retained M2 evidence remain byte-identical.
This extends only the private package shape, without replacing ADR-0024 custody
semantics; future package versions require their own admission change.

Apply ADR-0019 upload-admission, completion and tag ordering, including its
supported separately authorized owner bootstrap. This creates no unattended
publisher or general release framework. The bounded release operator must:

1. Record source SHA, toolchain, verified publisher authority, exact version,
   provisional and intended tags, and their previous targets. Pass applicable
   package and type checks. Pack Assembly once, retain its physical inventory,
   SHA-256 and SHA-512 integrity, and verify the exact public packed manifest.
2. Install that retained archive with downloaded published Core 0.1.0 bytes in
   a disposable consumer. Authenticate Core against its registry and release
   identities; local Core packing is not registry compatibility evidence. Run
   closed-root, synthetic construction and both supported compiler checks.
3. Persist upload intent and rehash before the single authorized provisional
   upload. Reconcile metadata and downloaded bytes against the retained archive;
   run final consumer proof on downloaded bytes before publication completion.
4. Persist promotion intent, promote the intended tag only after completion,
   and reconcile previous/new targets. Unknown outcomes stop new writes; use
   bounded read retries and retain observations. Never automatically repack or
   repeat an uncertain upload. Follow ADR-0019 for explicit recovery and rollback.

Publication means availability of this tested pre-1.0 package only. It grants
no readiness, lifecycle, whole-runtime, self-composition, conformance or
release-eligibility claim, and does not establish consumer adoption.

## Consequences

- Consumers can use an exact public Assembly/Core pair after release completion.
- Historical private evidence stays admitted without new publication authority.
- Registry authority and downloaded-byte checks remain release prerequisites;
  source tests and this decision do not claim that publication has occurred.

## Rejected alternatives

- Remove the private flag without authenticated authority: bypasses admission.
- Repack Core or change the lock: changes evidence outside this bounded scope.
- Build a universal release platform: unnecessary for the supported bootstrap.
