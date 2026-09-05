---
id: ADR-0019
type: adr
status: proposed
owner: architecture
summary: Clarifies retained-archive upload prerequisites, registry reconciliation and publication completion without changing conformance authority.
related:
  - ADR-0012
  - ADR-0017
  - ARCH-MVP-IMPLEMENTATION-ROADMAP
---

# ADR-0019: Separate upload admission from publication completion

## Context

ADR-0012's final evidence bullet places registry read-back before publication
eligibility. A first upload cannot produce read-back evidence before it exists.
The roadmap already separates pre-upload admission from post-upload completion;
this narrow successor makes that ordering explicit without rewriting accepted
history. A lost upload response also does not prove that the version is absent.

## Decision

This proposal requires acceptance before it changes publication policy. It does
not block private M1 correction or packed-subject preparation, authorize an
upload, accept ADR-0011 custody, expand M2/M3 scope or grant conformance.

If accepted, supersede only ADR-0012's phrase "publish-time rehash and registry
read-back before publication eligibility" with these ordered obligations:

1. **Upload admission:** the applicable Node/TypeScript/package gates, verified
   namespace and publisher authority, and pre-upload rehash all pass for one
   retained archive. No read-back is required before the first upload.
2. **Publication completion:** registry tarball bytes equal that retained archive
   and a final consumer check using the downloaded bytes passes. Metadata,
   an upload response or a matching version alone cannot establish completion.
3. **Tag promotion:** the release owner promotes the intended distribution tag
   only after completion. Record previous and new tag targets and reconcile
   the observed registry state. Conformance and release-eligibility claims keep
   their own accepted gates.

The first real automated publisher uses one protected workflow and a
release-specific provisional tag. Build, qualification and retained-archive
creation remain credential-free. Its single authorized upload, reconciliation
and promotion operate on the same recorded package/version/archive identity.
The release owner selects the provisional and intended tags in the release
record before execution; the workflow never guesses them from a branch name.
Create that workflow with its real package consumer, not as empty infrastructure.

For an unknown upload or promotion outcome, the runbook is:

1. Stop new uploads and promotions for the same version. Retain the attempt
   result, archive identity and last observed registry state.
2. Read package/version metadata and download any existing tarball. If bytes
   match, continue the missing consumer check or tag reconciliation. A mismatch
   is an explicit release failure requiring owner remediation.
3. Use bounded retries for read operations after transient errors, retaining
   their observations. If absence or tag state remains uncertain, stop that
   release attempt. Do not infer absence from a lost response or transient 404.
4. Retry an upload only after the release owner confirms it is absent and
   authorizes that next attempt with the same retained bytes. Never repack,
   bump the version or repeat full qualification automatically to conceal an
   uncertain result. A tag rollback restores its recorded previous target;
   it does not delete or rewrite a published version.

Acceptance checks use a disposable registry or deterministic registry fixture:
lost upload response with matching bytes; conflicting bytes; delayed read-back;
consumer failure; lost promotion response; and idempotent reconciliation of an
already correct tag. Assert that no extra upload, promotion, repack or version
change occurs while the outcome is uncertain. A real upload remains a separate
owner-authorized action.

## Consequences

- First publication has an executable ordering and retains mandatory byte
  identity and consumer evidence.
- A failed read-back leaves publication incomplete even if registry upload
  succeeded; the report preserves that distinction.
- Recovery reruns the smallest unproved operation while uncertainty prevents
  duplicate side effects. No generic custody platform is introduced.

## Rejected alternatives

- Require read-back before upload: circular for a first version.
- Automatically retry uncertain uploads or repack: risks duplicate effects or
  qualification of different bytes.
- Couple this clarification to all proposed release custody: unnecessary for
  ADR-0017's bounded `not-claimed` publication checkpoint.
