---
id: ADR-0015
type: adr
status: accepted
owner: architecture
summary: Narrows open-decision blocking to publication surfaces and runtime-conformance claims so private Core source may proceed.
approved_by: product-owner
accepted_at: 2026-09-02
related:
  - ADR-0003
  - ADR-0007
  - OD-004
  - OD-005
  - OD-006
  - ARCH-FEATURE-MODULE-STANDARD
---

# ADR-0015: Block publication surfaces and runtime claims while decisions stay open

## Context

ADR-0003 selected the package identity and topology while three product
decisions were still open. Its deferral sentence reads: "Until then, package
creation and local packed-consumer evidence may proceed only after the
remaining implementation blockers are resolved, but registry publication
remains prohibited." The open-decision index repeated that reading as "Every
active open decision in this repository is an implementation blocker."

Accepted ADR-0007 states the opposite for implementation work: "A package may
be implemented while the repository profile remains `not-claimed`, but it
cannot claim V1 conformance or be published as conforming until every
applicable vector executes against the packed artifact on the supported runtime
matrix." The MVP implementation roadmap and the current-contract guide likewise
promise that private implementation work is not blocked while proposed
decisions remain open.

The three currently active decisions, OD-004, OD-005, and OD-006, are resolved
only by proposed ADR-0012, ADR-0013, and ADR-0014. ADR-0012 requires a packed
subject before acceptance, and ADR-0013 and ADR-0014 require their case
inventories to execute against a compiler subject before their semantics may
enter a production compiler. Reading open decisions as blockers of every
production source file therefore created a cycle: the subject needed to close
or operationalize a decision could only come from source that the decision
forbade. The only escape would have been to write the compiler first as a test
fixture and then again under `packages/`, which the roadmap and ADR-0008 both
reject.

This identifier is repository-local. The "ADR-0015" cited by ADR-0001 and the
bootstrap review belongs to the Extension Foundation repository and is a
different decision.

Before this decision was accepted, the quoted ADR-0003 sentence remained the
textual authority even though the executable gate already admitted private
package identities; acceptance aligns the accepted text with the gate rather
than changing the gate.

The executable governance gate in `architecture/checks/governance.mjs` and
`architecture/checks/production-artifacts.mjs` already distinguishes private
source from publication-capable artifacts. This decision records that
distinction as authority so that accepted text, navigation, and the gate say
the same thing.

## Decision

While any open decision remains active:

- The gate blocks every publication surface. A publication surface is a
  `packages/*/package.json` manifest that is not `private: true`, that declares
  a name outside the identities accepted by ADR-0003, or that declares any of
  `bin`, `browser`, `exports`, `files`, `main`, `module`, `publishConfig`,
  `types`, `typesVersions`, or `typings`. Root-manifest publication fields and
  any production source outside a private accepted package remain blocked.
- The gate blocks registry publication and every `runtime-conformant`
  qualification claim.
- The gate admits private source below `packages/` inside a package identity
  accepted by ADR-0003, currently `@get-modular/core` and
  `@get-modular/conformance`, when the manifest is `private: true` and declares
  no publication field. Such source may reach `source-admitted` and
  `structural-conformant` custody through the Feature Module Standard profile
  without claiming unresolved runtime semantics.
- The traceability catalog continues to enumerate the active open-decision set
  under its historical `implementationBlockers` key; the key name is lineage
  only and the gate rejects any mismatch with the governed catalog.

Private source admitted under this decision must not implement semantics that
an active open decision still owns. OD-004, OD-005, and OD-006 remain active
and continue to block the public package surface, both carrier adapters, raw
decoding exposure, and duplicate binding-record behavior exactly as the current
contract describes.

### Architecture and start condition

Private source admitted under this decision MUST follow the adopted
organization Feature Module Standard v1: the local profile in
`docs/architecture/feature-module-standard.md` and the canonical document
`agent-teams-ai/.github/docs/architecture/feature-module-standard/v1.md`,
whose blob `d0bfff20` and content digest are pinned in
`architecture/feature-module-standard-profile.json` and whose observed
revision `eef92e7` is recorded in `docs/provenance/source-map.yaml`. Feature-owned slices under
`packages/core/src/features/*`, owner-local ports and factories, and the
private composition root are the structural authority for that source.

Accepting this decision does not start implementation. The first production
source lands only after the product owner records an explicit start decision
in the repository, in the roadmap bootstrap sequence or in a decision record,
so that the condition is visible to governed documents rather than only to
pull-request review; until then the admitted package identities stay empty and
the gate merely permits them.

### Precedence

This decision supersedes ADR-0003 only for its single deferral
sentence quoted in the context above. ADR-0003's package identities, topology,
namespace verification, and publication prohibition remain unchanged. This
decision does not accept ADR-0009, ADR-0012, ADR-0013, or ADR-0014, does not
resolve any open decision, and does not weaken the accepted contract,
qualification ledgers, or conformance requirements of ADR-0007.

## Consequences

- Private Core implementation can start under `packages/core` without
  publishing anything, and the evidence that closes OD-004, OD-005, and OD-006
  can come from that one subject instead of a second copy.
- Accepted text, the open-decision index, the roadmap, and the executable gate
  agree on what an open decision blocks.
- The gate no longer proves by construction that no source exists; review must
  confirm that admitted private source stays outside the semantics owned by an
  active open decision.
- Publication and conformance claims remain mechanically impossible until the
  active decisions are resolved.

## Rejected alternatives

- Keep the compiler as a fixture under `tests/` until all three decisions are
  accepted. This writes the compiler twice and violates the roadmap rule that
  research fixtures and production-like code never share an unmarked directory.
- Accept ADR-0012, ADR-0013, and ADR-0014 before any source exists. Their
  acceptance evidence requires an executable subject, so this ordering cannot
  terminate.
- Block only `packages/*/package.json` while admitting arbitrary source
  elsewhere. Production source outside an accepted package identity has no
  custody path and would bypass the Feature Module Standard profile.
