---
id: OD-007
type: open-decision
status: open
owner: architecture
summary: Defines how modules opt into configuration change notifications without migrating non-participating modules, as a public Get Modular package.
related:
  - ADR-0015
  - ADR-0017
  - ADR-0026
  - ADR-0030
  - ADR-0033
  - ADR-0029
  - ARCH-COMMON-ASSEMBLY
  - ARCH-SYSTEM-BOUNDARY
---

# OD-007: Module change observation package

## Decision required

Admit (or reject) an optional public package, working name
`@get-modular/observation`, that gives every module one standard way to get
settings and to learn about their changes, so that a future hook reaches only the
modules that need it and never forces a migration of the others.

The owner direction recorded on 2026-10-01 already fixes the shape to evaluate:

1. **Owner:** a Get Modular package, designed library-first; public `0.x` from
   its first release in the normal GM release flow.
2. **Default:** one hub per event family with opaque, data-only participants
   (`participantsFor<V>().sync({ initial, apply })` or
   `.derived({ keys, derive, apply, fail })`); a module-owned subscription stays
   an escape hatch.
3. **Modules stay factories, not classes:** participation is one `provides`
   entry whose value is data; there are no lifecycle methods, base classes or
   reflective hook discovery. Passive modules write nothing.
4. **First proof on TEST:** Agent Runtime has no fitting consumer today; this is
   an explicit owner exception to the workspace rule requiring a real consumer in
   the same delivery.

The full design, evidence and remaining limits are in the
[research archive](../../research/observation-hooks-2026-10/README.md).

## Constraints

- Core and Assembly do not import the package. It uses the resource scopes of
  `@get-modular/resources` (ADR-0030). The admitting ADR chooses between a
  declared peer dependency, the pattern ADR-0033 uses for
  `@get-modular/conformance`, and a structural port. The research sketch's
  structural port does not match the delivered package (cleanup receives
  `{ escalate }`, not `{ signal }`); the
  [known defects](../../research/observation-hooks-2026-10/sketch-v4-known-defects.md)
  list this drift.
- Mechanism only: deadlines, escalation, readiness decisions, health, sealing
  and commit policy stay with the product Host. No universal manager, service
  bag, global scheduler, reactive engine, source status or health contract,
  interop adapters or per-subscriber equality in `0.x`.
- Values are immutable plain data with a declared key set; delivery is deferred,
  coalescing, at most once per commit per registration, never awaited; a
  revision is a commit number, not proof of a value change.
- The admitting ADR must reconcile `system-boundary.md` ("does not … execute
  product lifecycle", no "second lifecycle authority") and the Consumer Module
  Standard's "explicit demonstrated need" rule, separating mechanism from
  Host authority as ADR-0030 does for resources.
- Publication: the admitting ADR adds the package's row to the leaf package
  table (`architecture/checks/leaf-packages.mjs`). ADR-0030 and ADR-0033 are
  the precedent for the owner's "public `0.x` from the first release": public
  from the first Changesets release through the bounded release operator, and,
  while G1 is on hold (`architecture/sdk-growth/status.json`), not enrolled in
  `package.public-api-compatibility` or G1 SDK growth.
- The 0.3.0 train delivered what this package builds on: the resources
  package, the leaf package table and the shared error-code scheme
  `<pkg>.<area>.<reason>` in the Consumer Module Standard. The admitting
  delivery adds the `observation.*` codes and the configuration rule to that
  standard.

## Blocking effect

Owner classification under ADR-0017, confirmed on 2026-10-08: OD-007 is
**not a publication blocker** and is therefore absent from
`publicationBlockers`. Core, Assembly and every other publishable surface are
unaffected, because the new package cannot ship without its own admitting ADR
anyway. As an active open decision it does, under
ADR-0015, block any `runtime-conformant` qualification claim until it is
resolved. No such claim exists or is planned today; if one becomes ready first,
resolve or withdraw OD-007 before promoting it.

## Options

Scores are design judgments out of 10 (complexity: higher is more complex);
LOC is roughly ×2 uncertain.

| Option | Confidence | Reliability | Complexity | LOC (production / tests / docs) |
| --- | ---: | ---: | ---: | --- |
| **A. Public GM package: keyed source + hub per event family + opaque data-only participants + escape hatch** (owner direction) | 8 | 8 | 5 | 500–650 / 700–1,000 / 150–250, plus GM integration 400–700 |
| B. The same mechanism inside one product Host, no package | 6 | 7 | 4 | ~500 / 400–600 / 100 |
| C. Module-owned subscriptions everywhere, no hub | 5 | 7 | 4 | ~250 plus 20–28 per module; settlement only self-reported |

## Acceptance criteria

- An accepted ADR admits the exact public API and the leaf package row before
  package source, reconciles the system boundary and records the owner
  exceptions above.
- The bounded TEST experiment in the research archive passes on the supported
  Node range with negative type fixtures on the minimum and pinned TypeScript
  compilers; any failure returns the design to review.
- The Consumer Module Standard gains the configuration rule and examples in the
  same delivery; affected consumer pins and profiles migrate in that delivery.

## Resolution

Open. When resolved, set `status: resolved`, add `resolved_by: ADR-NNNN`, and
retain the deciding ADR in `related`.
