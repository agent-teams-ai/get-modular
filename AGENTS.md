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

Use `pnpm check:changed` while editing, `pnpm check:fast` before handoff, and
`pnpm check` as the complete gate.

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
