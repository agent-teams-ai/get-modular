# Module resource scopes and foundation review (2026-10)

> Moved from the workspace `plans/` folder on 2026-10-02. This is a research and
> planning archive, not an accepted decision. The governed decisions are planned
> as ADR-0030 (resources package), ADR-0031 (Assembly per-run scope and inputs)
> and ADR-0032 (contract builder), created through `pnpm docs:new` in the second
> delivery step (GM-2, after the GM-1 leaf-package admission refactor).

The originals are written in Russian and are kept under [`raw/`](raw/) with
their bytes preserved, except for the path replacements listed below. This page is the
English summary.

## Status

- Design accepted by the owner (decisions Q1-Q18 in the design document).
- Implementation plan at revision 3, reviewed by independent critics and
  verified on a prototype (22 tests, 19 mutations, type fixtures on
  TypeScript 7.0.2 and 5.8.3, Node 24.18 and 26.9; Node 26.10 or later not
  yet exercised).
- Nothing is implemented in this repository yet.

## Owner decisions in short

- **Responsibility split.** A module writes how to release its own resources,
  the Host decides when (deadlines, escalation, abandon, retry, health), and
  Get Modular provides only the mechanism (a scope). Third-party code is not
  trusted to clean up: isolation and forced reclamation stay with the Host.
- **Resources API.** Scope tree with separate author and control facets,
  sequential LIFO with the position assigned at fulfil, single-flight close,
  continue after a failed cleanup with a debt report, retry on a repeated
  close, `escalate` and per-caller `abandon`, `child()` for nesting and early
  release, opt-in concurrent close for many sibling sessions, `use()` for
  standard disposables.
- **Dynamic modules.** No live graph mutation. Assembly 0.3.0 prepares once and
  runs many: `run({ signal, scope, inputs })` with `bindInput`; replacement is a
  new instance plus a pointer swap at the owner.
- **Release trains.** Train 1: Core/Assembly 0.3.0 (Assembly scope, inputs,
  builder, fragment typing; Core version only) and `@get-modular/resources`
  0.1.0; a thin `@get-modular/conformance` may join train 1 or the next minor.
  Train 2: Core/Assembly 0.4.0 with the contract evolution wire format; the
  namespace helper `checkNamespaces` ships in conformance.
- **Contract evolution.** One monotonic line per contract, no versioned ids:
  provider `revision` and `compatibleFrom`; the consumer's revision is fixed by
  the version of the contract package.
- **Authoring.** `defineContract` and `declareModule` so authors never write
  the wire format by hand; module handles are typed only by the capabilities
  they use, so teams can ship modules independently.
- **Namespaces.** Identifier rules in the Consumer Module Standard, a pure
  helper in conformance, and grants checked by the Host; no new Core
  diagnostics.
- **Packaging and errors.** Module packages use peer dependencies on one 0.x
  minor; one Get Modular copy per Host; errors carry stable
  `<package>.<area>.<reason>` codes; Core diagnostic codes stay unchanged.
- **Versioning policy.** Packages stay on 0.x during the MVP stage; a breaking
  change ships as a minor release with a changelog entry and a migration guide.

## Contents of `raw/`

| Path | What it is |
| --- | --- |
| [module-resource-scopes-design-2026-10-01.md](raw/module-resource-scopes-design-2026-10-01.md) | Accepted design, invariants and owner decisions |
| [module-resource-scopes-implementation-plan-2026-10-01.md](raw/module-resource-scopes-implementation-plan-2026-10-01.md) | Implementation plan, revision 3: ADR texts, package layout, algorithm, tests, PR sequence |
| [foundation-review-2026-10-01/](raw/foundation-review-2026-10-01/README.md) | Foundation review: contract evolution, namespaces, dynamic modules, testing kit, plan critiques, AR gates review |
| [foundation-review-2026-10-01/prototypes/](raw/foundation-review-2026-10-01/prototypes/) | Final prototype sources (revision 3) stored as `.txt`, plus dynamic-module measurements |
| [shared-module-resource-contract-2026-10-01.review.md](raw/shared-module-resource-contract-2026-10-01.review.md) | Review of the earlier plan |
| [shared-module-resource-contract-2026-10-01.md](raw/shared-module-resource-contract-2026-10-01.md) | Earlier plan, superseded on 2026-10-01 |
| [module-resource-lifetime-research-2026-09-30.md](raw/module-resource-lifetime-research-2026-09-30.md) | Earlier comparative research |
| [evidence/](raw/evidence/) | Inputs and reports of the earlier planning flows |

## Path replacements and exclusions

- Source code files inside `raw/` carry an extra `.txt` suffix so repository
  checks do not treat them as production artifacts.
- A few long flat file names under `raw/evidence/` are shortened for the
  Windows path limit; references inside the originals keep the old
  names; the mapping is in
  [renamed-files.json](raw/evidence/module-resource-planning-20261001/renamed-files.json).
- Local paths are replaced with `<workspace>`, `<scratchpad>`, `<home>` and
  `<codex-visualizations>`; worker infrastructure details are replaced with
  `<worker-host>`, `<worker-jobs>`, `<worker-state>` and `<worker-id>`. Hashes
  recorded inside the evidence refer to the original bytes.
- Third-party source files and crawled web pages used as inputs are not
  committed because they carry no bundled licenses. Their paths, sizes and
  SHA-256 digests are listed in
  [excluded-third-party.json](raw/evidence/excluded-third-party.json).
- Earlier prototype directories and package tarballs are not included; the
  final prototype supersedes them, and the tarballs are reproducible with
  `npm pack @get-modular/core@0.2.0` and `npm pack @get-modular/assembly@0.2.0`.
- Links inside the originals may not resolve here: they can point to other
  workspace documents, to code files that now carry the `.txt` suffix, to
  renamed files (see the mapping above) or to excluded third-party files. The
  lifecycle hooks research will live in `research/observation-hooks-2026-10/`
  after pull request #127 is merged.
