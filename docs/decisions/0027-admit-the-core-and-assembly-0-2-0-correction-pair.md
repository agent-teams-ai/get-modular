---
id: ADR-0027
type: adr
status: accepted
approved_by: product-owner-delegated-orchestrator
accepted_at: 2026-09-13
owner: architecture
summary: Admits the next exact package pair and intentional helper types while preserving historical evidence and separate publication authority.
---

# ADR-0027: Admit the Core and Assembly 0.2.0 correction pair

## Context

The retained published 0.1.0 declarations differ from the stored 0.1.0 API
baselines for both packages. The [GM-02 erratum](../qualification/gm02-api-erratum.md)
retains the bounded comparisons and their limits. ADR-0025 admits only the first
0.1.0 pair; ordinary versioning cannot silently extend that authority.

## Decision

Extend ADR-0025 admission to exactly Core 0.2.0 with Assembly 0.2.0. Preserve the
complete accepted ADR-0023/0025 bytes and registry identities, historical private
0.1.0 shape, first-release witnesses and independent M2 lock custody. This is a
successor admission, not a replacement of historical evidence.

The public source dependency remains `workspace:*`; the packed Assembly
dependency is exactly `@get-modular/core: 0.2.0`. Reject mixed pairs, other
versions, altered authority and dependency expansion. Authenticate this accepted
decision and registry entry through the existing captured reader before admitting
the new pair. A proposed decision supplies no authority.

Keep `IsUnion` and `ValidDeclaration` intentional public Assembly type aliases.
`IsUnion<T>` identifies union alternatives; `ValidDeclaration<C, D>` preserves
literal declaration and capability validation at `bindFactory`. Consumers may
import these aliases through the public root. Existing positive and rejecting
compiler/resolver fixtures remain their finite acceptance evidence.

Use pinned Changesets CLI 3.0.2 and its built-in local Git changelog for the
ordinary minor Changeset of both packages. Versioning requires no GitHub token
or network access. `pnpm release:version` performs versioning only in a
disposable trusted release workspace; it does not publish or promote baselines.
Registry discovery on 2026-09-13 returned only 0.1.0 for both packages. Refresh
inventory before versioning; an intervening release requires a new exact decision.

After versioning, rebuild declarations and promote the new baseline through the
existing public CLI only on trusted same-repository `changeset-release/main`.
Preserve the erratum; never overwrite published 0.1.0 or relabel audit fingerprints
as production breaking approvals. Audit `releaseEligible: false` is non-authorizing.

Qualify the exact intended new pair with packed runtime, closed-root and supported
compiler/resolver checks, full exact-source CI and independent review. ADR-0019
upload, reconciliation and tag ordering still apply. Publication needs separate
authorization, and uncertain effects must be reconciled before another write.

## Consequences

- The next baseline describes its own release, not repaired historical provenance.
- Admission and version intent do not claim publication or consumer adoption.
- Consumer package/content pins require their own reviewed migration.

## Rejected alternatives

- Change accepted ADR bytes or silently permit all versions: destroys bounded authority.
- Hide working helper types or add another comparator: unsupported by the evidence.
