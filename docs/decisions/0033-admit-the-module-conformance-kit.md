---
id: ADR-0033
type: adr
status: accepted
owner: architecture
approved_by: product-owner
accepted_at: 2026-10-03
summary: Admits @get-modular/conformance as public 0.x development tooling for module authors and contract owners, with Get Modular peers only.
related:
  - ADR-0003
  - ADR-0005
  - ADR-0006
  - ADR-0007
  - ADR-0009
  - ADR-0012
  - ADR-0026
  - ADR-0030
  - ADR-0031
  - ADR-0032
---

# ADR-0033: Admit the module conformance kit

## Context

ADR-0003 reserved the identity `@get-modular/conformance` as development-only
tooling for fixtures, executable vectors, packed-consumer checks and adapter
qualification that may depend on Core. ADR-0006 repeats that clause, and
ADR-0005 and ADR-0007 planned Get Modular's own V1 vectors and packed-subject
execution there. The package was never created, and that qualification lives
in `tests/qualification`.

Module packages and contract packages now exist or are being written
(ADR-0030, ADR-0031, ADR-0032). Each author of such a package builds the same
test scaffolding by hand: running a module in isolation with a fresh scope,
smoke-checking a composition root, running one contract suite against several
implementations, and checking that a test leaves no runtime handles open. The
concern is the same in every package; the helpers drift apart.

The Consumer Module Standard (ADR-0026) asks module authors to test against
an independent oracle and to keep module code behind declared capabilities. It
gives them no shared tool for that.

A conformance package must call Core, Assembly and resources by name, so the
ADR-0003 wording "may depend on Core" is too narrow, and a runtime dependency
would let a consumer install a second copy of those packages next to the one
the module uses.

## Decision

### Package admission

Admit `@get-modular/conformance` at `packages/conformance`, the identity
ADR-0003 reserved, as a public package from 0.1.0. Versions come from
Changesets in a release pull request, as for resources (ADR-0030).

- Its scope is development tooling for module authors and contract owners. Production
  code does not import it.
- It exposes one root-only ESM export (ADR-0012) and one current unversioned
  API (ADR-0009). It has no subpath export. Its engines equal the supported Node
  range of the other packages.

### Contract

The root exports `isolate`, `smoke`, `contractSuite`, `runContractSuite` and
`guardHandles`, with the types and the error class that belong to them. The
package README and its rejecting tests own the exact invariants.

- Callers pass their own test function. The package imports no test runner
  and no Node built-in module; Node-only facilities are reached structurally, not imported.
- The package never qualifies Core or Assembly.
- The package never computes an expected value by calling the implementation
  under test (ADR-0006). The contract owner supplies the expected data.

### Dependencies

Core, Assembly and resources are peer dependencies, and they are the only
dependencies. Each peer is declared with the workspace caret range, so a
packed archive names exactly one 0.x minor of each. There is no other runtime
dependency.

Peers resolve to the consumer's own copy of each package. A runtime
dependency could install a second copy of resources, and a second copy breaks
the `scoped()` brand check (ADR-0030). Every minor release of a peer is
accompanied by a minor release of conformance.

This refines the conformance clauses of ADR-0003 and ADR-0006 and takes
precedence over them where they differ. Conformance depends on Core, Assembly
and resources as peers, not only on Core, and it stays development tooling.
Core and Assembly do not import it.

It also keeps Get Modular's own qualification out of this package. The
fixtures, executable vectors, packed-consumer checks and adapter qualification
of ADR-0003, the V1 vectors that ADR-0005 placed here, the independent vectors
and runners of ADR-0006 and the fixtures and packed-subject execution that
ADR-0007 planned here stay in `tests/qualification`; this decision takes
precedence over those passages. ADR-0012 let this package carry its own
manifest shape; it now uses the same single-root ESM carrier as Core.

### Leaf admission

Admission extends the existing leaf-package checks instead of copying them.
Leaf admission gains declared peer edges for public rows:

- the manifest declares exactly the peers of its row, each with the workspace
  caret range;
- the package imports its peers by root name only, never by subpath;
- the lock importer lists the same peers.

Core and Assembly still import no leaf. A leaf imports another leaf only as a
declared peer. Rows without peers keep their existing rules. The
admission entry arrives in the same change as the package root and its
implementation. No entry, stub or pending root precedes them; until then the
existing checks keep rejecting `packages/conformance`.

### Publication and versioning

Uploads follow the release rules that ADR-0030 applies to resources.
Pre-1.0 breaking changes ship as minor releases with a CHANGELOG entry and a migration note, without
compatibility aliases (ADR-0009). Version 1.0.0 needs a separate decision.
While G1 is on hold, the package is not enrolled in
`package.public-api-compatibility` or G1 SDK growth.

### Non-goals

Test beds or override containers, automatic or Proxy fakes, `expectBindings`
or any oracle derived from a profile, release-order assertions, and snapshot
or journal assertions.

## Consequences

- Module and contract authors share one set of test helpers instead of
  rebuilding them in every package.
- Get Modular's own qualification stays independent of the package that
  module authors use, so a defect in a helper cannot hide a defect in Core or
  Assembly.
- A consumer must install one copy of each peer. Peer ranges surface version
  conflicts at install time instead of installing a second copy.
- A peer minor release forces a conformance minor release, which adds release
  maintenance for every minor release of Core, Assembly or resources.
- Leaf admission becomes slightly more complex: public rows may declare peers,
  so the checks must tell declared peer edges from forbidden ones.
- A new public package adds release and admission maintenance.

## Rejected alternatives

- A separate `@get-modular/testing` next to conformance: two packages would
  serve one concern and split its API and its release cadence.
- `expectBindings`: it derives the expected result from a profile, which
  conflicts with the independent binding oracle that the Consumer Module
  Standard requires.
- Runtime dependencies instead of peers: a consumer could end up with a second
  copy of resources, which breaks the `scoped()` brand.
