---
id: QUAL-GROWTH-RELEASE-READINESS
type: qualification
status: reviewed
owner: architecture
summary: Reconciles growth, namespace, migration, governance-cost, and first-publication concerns before Core implementation.
related:
  - ADR-0003
  - ADR-0004
  - ADR-0005
  - ADR-0009
  - ADR-0012
  - ADR-0017
  - ARCH-MVP-IMPLEMENTATION-ROADMAP
  - ARCH-SYSTEM-BOUNDARY
---

# Growth and first-publication readiness review

## Scope

This review reconciles an external architecture critique against repository
main `064bc1ae6816c7cf0797474264d5aa9979b1a15a`. It preserves useful warnings
without promoting raw reviewer output into authority. Accepted ADRs and
executable qualification remain authoritative.

The review does not implement Core, accept a proposed ADR, define plugin
authorization, or claim release readiness. A 2026-09-04 follow-up records the
subsequently established npm namespace control without treating it as package
or release evidence.

## Findings and disposition

| Concern | Disposition | Required action |
| --- | --- | --- |
| Exact capability compatibility forces every migration to be a flag day | Partially confirmed. Exact matching is intentional, but the transition choreography was missing. A provider can expose old and new distinct capability IDs, and profiles can migrate consumers incrementally. | Keep exact matching. Document dual-capability and separate-module migration before a second consumer relies on it. |
| One implementation per selected module prevents overlapping capability generations | Not generally confirmed. A declaration can provide multiple distinct capability IDs; only duplicate provision of one capability ID is rejected. A separate module is needed only when old and new implementations cannot coexist safely. | Do not add ranges or multi-select semantics to Core. Use explicit identities and complete profiles. |
| `owner.authority` permits silent namespace squatting | Confirmed at the ecosystem boundary, not as a Core defect. The value is navigation metadata, not authentication. Core must remain policy-neutral. | Product or Extension admission binds an independently verified admission principal to module/implementation namespaces and separately authorizes capability provision before Core receives a declaration. Publisher, artifact, installation and declared-owner identities remain distinct. |
| Diagnostic generation governance is comparable in size to the compiler | Confirmed as a delivery-cost warning, not a correctness failure. Much of the size is immutable evidence and adversarial fixtures rather than runtime code. | Do not start diagnostic generation 2 on the M1 critical path. Resolve OD-005 and OD-006 together only when raw input is the next useful checkpoint; generate derived artifacts from one accepted source where custody permits. |
| npm namespace ownership is proven by package `E404` | Rejected. `E404` proves neither availability nor control. During the original review, local npm credentials were unauthorized. On 2026-09-04, an authenticated npm session created the free public `get-modular` organization and its members settings listed `ilyazelenko` as owner with 2FA enabled. | Namespace control is established. The first package pull request must still configure and prove its protected publisher, retained archive and registry read-back; no package or release claim follows from organization creation. |
| Release mechanics are absent | Partially confirmed. ADR-0009 owns changelog migration; ADR-0012 owns carrier, archive and pack-once custody; ADR-0017 owns limitations. Their operational handoff was incomplete. | Use the closed first-publication checklist added to the MVP roadmap and make it executable in the first real package pull request. |
| Current CI permissions make npm provenance impossible | Rejected. Least-privilege CI should retain `contents: read`. OIDC belongs only to a separate protected GitHub-hosted publish job with `id-token: write`. | Add the release workflow together with the first real package, after namespace and trusted-publisher bootstrap are known. |
| Implementation plans and critic results exist only in session scratchpads | Rejected for normative planning. The roadmap, decision packet, compiler handbook and qualification reports are tracked. Raw worker envelopes need not become repository authority. | Preserve only reconciled findings that can affect implementation or reversal criteria. |
| The owner start record is a cryptographic approval | Rejected. The record deliberately does not authenticate the human author. It bounds source admission and remains subject to protected review and release authorization. | Keep identity authentication and registry promotion in repository and release controls; do not add signature semantics to Core. |

## Minimal delivery consequence

The review changes no semantic Core contract. The implementation order remains:

1. Build the M1 object-entry semantic slice and direct packed subject.
2. Use the established namespace control to materialize the package-local
   release checklist and protected publisher.
3. Publish only the retained `0.1.0` archive that passes the ADR-0012 Node and
   TypeScript cases, explicitly as `not-claimed`.
4. Keep raw carriers, duplicate-record semantics, conformance claims and
   generated self-composition out of that archive until their own gates close.

## References

- [npm scoped public package guidance](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)
- [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)
- [npm package archive rules](https://docs.npmjs.com/files/package.json/)
