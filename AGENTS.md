# Agent navigation

Read these sources before changing this repository:

1. [System boundary](docs/architecture/system-boundary.md)
2. [Current implementation contract](docs/architecture/current-contract.md)
3. [MVP implementation roadmap](docs/architecture/mvp-implementation-roadmap.md)
4. [Self-composition implementation guide](docs/architecture/self-composition-implementation-guide.md)
5. [Feature Module Standard profile](docs/architecture/feature-module-standard.md)
6. [Accepted decisions](docs/decisions/README.md)
7. [Open decisions](docs/open-decisions/README.md)
8. [Normative requirements](docs/requirements/module-system-v1.md)
9. [Provenance map](docs/provenance/source-map.yaml)

For implementation tasks, follow the [agent execution route](docs/architecture/mvp-implementation-roadmap.md#agent-execution-route) and phase reading map before editing.
For admission, graph or diagnostic work, also read the [compiler engineer handbook](docs/qualification/compiler-engineer-handbook.md) and its linked complete examples.
Task ownership and the milestone callable surface are explicit; the full roadmap does not authorize implementing every phase.
For consumer composition work, read the [Consumer module standard](docs/architecture/common-assembly.md#consumer-module-standard).

Use `pnpm check:changed` while editing, `pnpm check:fast` before handoff, and
`pnpm check` as the complete gate, including the installed
`architecture.source-dependencies` schema v3 gate (`rootPackage: true` and
`packageRoots` for Core/Assembly) and `pnpm release-owned-files:check`.

When `package.public-api-compatibility` or `pnpm release-owned-files:check`
fails, fix the source. Do not shrink yaml entrypoints, retarget
`releasedBaselinePath`, or edit `architecture/public-api/` on a feature PR.
First adoption may create `architecture/public-api/core.json` and
`architecture/public-api/assembly.json` (`A`). Later baseline writes are only
`agent-teams-foundation public-api-promote-release` on trusted
`changeset-release/main` in this repository.

Do not enable `package.public-api-compatibility` while Foundation 1.2.0 API
Extractor fail-closes on `ae-forgotten-export` for named aliases in the
ADR-0009 closed root set (and Assembly `ValueOf` / `ValidDeclaration`).
Elevating those names onto `"."` would expand the public root beyond ADR-0009
and fail packed-root declaration closure. Inlining them inflates `Diagnostic`
past the 10000-character baseline signature cap. Do not recapture current
source as 0.1.0 to hide that.

When that gate reports a boundary violation, fix the source rather than
shrinking governed roots or adding a baseline:

- forbidden domain/tooling dependency -> consumer-owned port and adapter;
- deep import -> the declared public entrypoint for that boundary;
- new root or package -> owner, `packageRoots`/`rootPackage`, and a
  non-overlapping boundary, never an exclusion;
- `includeRootPackage` in YAML is invalid; public v3 uses `rootPackage: true`;
- generated `dist-*` trees are governed development output, not a reason to
  drop package scope;
- qualification helpers stay in `tests/qualification` (root) or
  `packages/core/tests/qualification-support` (Core-local test copies), not a
  third production or Host composition package. ADR-0009 still forbids those
  generation-suffixed evidence names in published/implementation source.
- CI greening by narrowing scope or pending a root silently is forbidden.

<!-- agent-teams-docs:route/v1 begin -->
Use [.agents/skills/docs-authoring/SKILL.md](.agents/skills/docs-authoring/SKILL.md) for documentation.
<!-- agent-teams-docs:route/v1 end -->

Documentation is governed by the Agent Teams Docs Protocol. Create ADR and
open-decision records through `pnpm docs:new`; qualification records are
hand-written and validated by `docs:check` and `governance:check`. Do not edit
accepted decisions retroactively.

Production code must remain independent from Engineering Foundation, Docs
Protocol, Extension Foundation, DI containers, product types, and plugin
runtime types. These dependencies are allowed only in development tooling or
product-owned adapters outside this repository.

Get Modular compiles composition semantics. It does not own artifact trust,
authorization, executable discovery, desired state, readiness, generations,
routing, drain, recovery, or retirement.
