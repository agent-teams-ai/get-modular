---
id: ADR-0017
type: adr
status: accepted
owner: architecture
summary: Blocks the package publication surface only through the publicationBlockers subset of open decisions, now empty, so a not-claimed pre-1.0 Core publishes while OD-005 and OD-006 gate only their semantics and claims.
approved_by: product-owner
accepted_at: 2026-09-04
related:
  - ADR-0003
  - ADR-0006
  - ADR-0007
  - ADR-0008
  - ADR-0009
  - ADR-0012
  - ADR-0013
  - ADR-0014
  - ADR-0015
  - OD-004
  - OD-005
  - OD-006
  - ARCH-CURRENT-CONTRACT
  - ARCH-FEATURE-MODULE-STANDARD
  - ARCH-MVP-IMPLEMENTATION-ROADMAP
  - ARCH-SELF-COMPOSITION-GUIDE
---

# ADR-0017: Publish pre-1.0 releases while raw-carrier and duplicate-record decisions stay open

## Context

Accepted ADR-0015 narrowed open-decision blocking so that private Core source
may proceed, but it kept every publication surface blocked "While any open
decision remains active". At that time three decisions were open: the package
carrier (OD-004), raw-input carrier semantics (OD-005), and duplicate
binding-record diagnostics (OD-006). Accepted ADR-0012 now resolves OD-004, so
the package carrier, export map and resolution surface are decided.

The remaining two decisions own behavior that a published pre-1.0 package can
simply not expose. OD-005 owns the raw-byte entry point and the carrier
refinements that ADR-0013 proposes for both entry points, such as cross-realm
records, descriptor rules, detached, resizable and shared storage, and wrapper
admission. The object entry point itself and its plain-value admission are
fixed by accepted ADR-0006 and ADR-0007; a package that exports only that
entry point under those accepted rules and documents the refinements as
outside its admitted domain exposes nothing OD-005 owns. OD-006 owns the
diagnostic for repeated binding records; a package that keeps such inputs
outside its admitted domain and documents that limitation exposes nothing
OD-006 owns either. Accepted ADR-0007 forbids publishing a package as
conforming before the runtime matrix executes, and it also makes runtime
coverage a publication gate in its own right. This decision narrows that
publication gate for pre-1.0 `not-claimed` archives and leaves it intact for
every conformance claim; the precedence section records the exact passages.

Waiting for OD-005 and OD-006 before any publication would keep the first
consumers from installing the package for weeks without protecting any accepted
semantics. The product owner decided that the first Core checkpoint publishes.

## Decision

- The package publication surface, meaning the publication fields of
  `packages/*/package.json`, `private: false`, and registry publication, is
  blocked only by the open decisions listed under `publicationBlockers` in
  `docs/traceability/module-system-v1.yaml`. That list is a subset of the
  active open decisions. After ADR-0012 it is empty, and the governance gate
  admits the export map accepted by ADR-0012 in `packages/core/package.json`
  while still rejecting a manifest that carries a prohibited carrier field or
  lifecycle script, sits below a package root, or names an identity outside
  ADR-0003.
- OD-005 and OD-006 keep gating what they own. While OD-005 is open, the raw
  entry point `compileCompositionJson` and the raw-carrier adapter stay out of
  the public barrel and out of every claim; the object entry point
  `compileComposition` publishes under the plain-value admission rules that
  accepted ADR-0006 and ADR-0007 already fix, and every carrier refinement
  that OD-005 still owns is documented as outside the admitted input domain
  and is neither exposed nor claimed. While OD-006 is open, repeated binding
  records at one `(implementationId, slotId)` stay outside the admitted input
  domain and the package documents that limitation.
- The ADR-0003 publication preconditions are unchanged and precede the first
  publication: verified control of the `@get-modular` npm namespace, an
  acyclic package graph, no conformance tooling in the core tarball or
  declaration surface, and a documented migration from the initial `0.x`
  topology.
- Every `runtime-conformant` claim remains blocked while any open decision is
  active, exactly as ADR-0015 states. A published pre-1.0 archive is
  `not-claimed`; its README and `CHANGELOG.md` carry a limitations section
  that names every behavior gated by an open decision.
- The governance gate reads `publicationBlockers` from the traceability
  catalog, verifies that it is a subset of the active open-decision set, blocks
  publication surfaces only while that subset is non-empty, and keeps blocking
  runtime claims while any open decision is active.
- The product-owner start record required by ADR-0015 remains a precondition
  for the first production source. Its recorded scope names what the owner
  authorized; a record whose excluded list still names publication or public
  exports does not authorize the first publication under this decision and is
  reissued before that publication.
- A pre-1.0 archive published before the self-composition checkpoint ships the
  handwritten direct composition root. Its changelog entry states
  "direct assembly, not self-composed", it cannot become
  `self-composed-qualified` or `release-eligible`, and the first archive built
  from generated stage1 wiring records that transition in the changelog.

### Precedence

This decision supersedes ADR-0015 only for four passages, and only in so far
as they apply to publication surfaces and registry publication while an open
decision that is not a publication blocker remains active: its sentence "The
gate blocks every publication surface"; its sentence "The gate blocks registry
publication and every `runtime-conformant` qualification claim"; the sentence
"OD-004, OD-005, and OD-006 remain active and continue to block the public
package surface, both carrier adapters, raw decoding exposure, and duplicate
binding-record behavior exactly as the current contract describes", for the
words "the public package surface" and for the trusted-object adapter under
the accepted ADR-0006 and ADR-0007 admission rules; and the consequence
"Publication and conformance claims remain mechanically impossible until the
active decisions are resolved", for publication.

It supersedes two further ADR-0015 passages, and only in so far as they
condition source admission on the manifest carrying no publication field:

- "Root-manifest publication fields and any production source outside a private
  accepted package remain blocked.", for the publication fields of an accepted
  package identity while no publication blocker is active; production source
  outside an accepted package identity stays blocked;
- "The gate admits private source below `packages/` inside a package identity
  accepted by ADR-0003, currently `@get-modular/core` and
  `@get-modular/conformance`, when the manifest is `private: true` and declares
  no publication field.", for the `private: true` condition and the
  publication-field condition only; the package identities, the location below
  `packages/` and the custody states are unchanged.

Runtime-claim blocking, the accepted package identities, the
publication-field list, raw decoding exposure and duplicate binding-record
behavior are unchanged. The ADR-0015 sentence "ADR-0003's package identities,
topology, namespace verification, and publication prohibition remain
unchanged" also stands: the ADR-0003 prohibition is conditioned on the
preconditions listed above, which this decision keeps. This decision does not
resolve OD-005 or OD-006 and does not accept ADR-0013 or ADR-0014.

This decision also supersedes ADR-0007, only for pre-1.0 `not-claimed`
archives published before the self-composition checkpoint, for two passages:

- "Runtime coverage is a publication and conformance gate, not a claim made by
  the current static evidence.", for the publication half of that gate; runtime
  coverage remains the conformance gate in full;
- "The first package can now be built under an honest `not-claimed` state,
  while publication remains fail-closed on cross-runtime conformance.", for the
  publication of such an archive, which is fail-closed on the Node and
  TypeScript packed cases of ADR-0012 instead.

The browser, worker and Electron cases of ADR-0007 remain the gate for every
`runtime-conformant` claim, and the accepted vectors, diagnostics and
qualification ledgers of ADR-0007 are unchanged.

This decision also supersedes ADR-0008, only for pre-1.0 `not-claimed`
archives published before the self-composition checkpoint, for these passages:

- "a handwritten production composition is not an interim release target. The
  first distributed core requires the implementation evidence below.";
- "A is an explicit implementation checkpoint only, not a releasable fallback
  or a renamed success for C. If C proves unjustified or infeasible, pause the
  release and return to the owner with evidence instead of silently shipping
  A.", for such archives only; the reversal rule itself is unchanged;
- "Bootstrap tooling, generator, own profile, development factory lookup
  tables, and conformance dependencies stay out of the runtime tarball and
  public declarations", in so far as the handwritten direct root counts as
  bootstrap tooling; the own profile, the emitter, the allowlist and every
  development table still stay out of the tarball;
- "Only the generated stage1 subject is eligible for the release artifact.
  Qualification packaging does not add a stage0 public export or make
  bootstrap code distributable.";
- "Before the first production release, stage0 is qualification-only and no
  handwritten core assembly is distributed";
- "The stage0 seed is qualification machinery and is not a second release
  owner.";
- "Add the minimal direct stage0 root in the same delivery; do not introduce a
  temporary production composition.";
- "Only the intended static stage1 assembly and its reachable runtime
  dependencies enter the eventual core artifact.", for the direct root of such
  archives only; every other exclusion in that paragraph is unchanged;
- "This is checkpoint A for feedback, but it cannot become the release artifact
  or a stable public architecture.", for such archives only, which are
  `not-claimed` and neither `release-eligible` nor a stable public
  architecture;
- "Before the first core release, add the finite private emitter and generated
  stage1 assembly for those same implementations.", only in so far as a pre-1.0
  `not-claimed` publication is not the first core release; the emitter and the
  generated stage1 assembly precede that release unchanged;
- "The canonical builder packs stage1 once. Qualification and publication use
  those exact archive bytes", for the pack-once rule applying to the direct
  root of such archives; the no-repack rule itself is unchanged and ADR-0012
  restates it;
- "do not ship A as the production core", only in so far as a `not-claimed`
  pre-1.0 archive is not the production core;
- the delivery rule "Release only stage1 after all evidence below is
  recorded".

Under this decision a temporary production composition is permitted only as
the direct root of such archives and must be replaced by generated stage1
wiring at the self-composition checkpoint. Every other ADR-0008 requirement is
unchanged: the self-composition path, its evidence, the reversal rule, the
privileged kernel, and the rule that `self-composed-qualified` and every
release custody claim require generated stage1 wiring.

## Consequences

- Consumers can install the first `0.x` package as soon as it passes the Node
  and TypeScript packed cases of ADR-0012, without waiting for the raw-carrier
  and duplicate-record decisions.
- Every published pre-1.0 archive is explicitly `not-claimed` and lists its
  gated behaviors, so no consumer can mistake absence of the raw entry point
  for support of it.
- Resolving OD-005 or OD-006 later adds behavior to a published package under
  the changelog rule of ADR-0009 instead of unblocking publication.
- The governance gate gains one small input, the `publicationBlockers` list,
  and keeps failing closed when that list disagrees with the open-decision
  catalog.
- A future open decision does not block publication unless it is added to
  `publicationBlockers`. That default is deliberate: the owner decides per
  decision whether it owns behavior a published archive can expose. Recording a
  new open decision therefore includes deciding whether it is a publication
  blocker, and the traceability catalog requires the key to be present.

## Rejected alternatives

- Keep the package private until OD-005 and OD-006 are accepted. It delays the
  first consumers by the full diagnostic generation 2 transaction without
  protecting any accepted semantics, because the gated behaviors are absent
  from the package either way.
- Resolve OD-005 and OD-006 first by accepting ADR-0013 and ADR-0014 on their
  current evidence. Their successor artifacts do not exist yet, and accepting
  them early would make immutable decisions out of unexecuted text.
- Publish with the raw entry point present but undocumented. That exposes
  semantics an open decision owns and contradicts ADR-0015.
- Wait for generated stage1 wiring before any publication, as ADR-0008
  originally required. It ties the first consumers to the emitter and witness
  work of M3, which adds nothing to the semantics they consume.
