---
id: ADR-0037
type: adr
status: accepted
owner: architecture
approved_by: product-owner
accepted_at: 2026-10-16
summary: The binding oracle pins providers and roots instead of completed rows, and checkWiring takes the declarations to prove provided capabilities and slot cardinality.
related:
  - ADR-0006
  - ADR-0026
  - ADR-0033
  - ADR-0035
---

# ADR-0037: Pin providers, not completed rows, in the binding oracle

## Context

Under ADR-0035 a completed row is fixed by its slot's capability and the single bound provider, so writing it restates
the declaration. At hundreds of modules the row table grows by about two rows per module, changes with every slot and is
maintained by copying output, the main risk ADR-0035 names.

The compiled plan cannot replace the declarations in this check. It lists roots, selections and bindings with a
capability id, but it carries neither the capabilities a selected module provides nor the cardinality of a slot. A
check that reads only the plan cannot tell a `required` row from an `optional` or `many` one, and cannot see a provided
capability that nobody binds.

## Decision

- The independent oracle states wiring decisions: for each capability a selected module provides, the implementation or
  implementations providing it; the root implementations; inputs pinned like providers; and every row completion does not
  produce (`optional`, `many`, explicit rows) exactly as written. Equal duplicates across oracle parts are allowed.
- `checkWiring(composition, oracles, { declarations })` in `@get-modular/conformance` takes the completed composition,
  the oracle parts and the declarations list that the test already passes to `compileComposition` and
  `checkNamespaces`. The list is required. It compares the plan with the union of the oracles and reports every
  difference in one `conformance.wiring.mismatch` error:
  - selections equal the pinned providers plus the roots, and plan roots equal the oracle roots;
  - the declarations cover the plan selections exactly, by `implementationId`;
  - every capability a selected declaration provides is pinned to that implementation;
  - every listed row equals its plan row, provider order included;
  - an unlisted row is accepted only when its slot, looked up in the consumer's declaration, is `required` and the row
    binds the single pinned provider of its capability; unlisted `optional` and `many` rows, and every row of a
    capability with several pinned providers, are differences;
  - a plan row uses the slot and the capability of its consumer's declaration;
  - a conflict between oracle parts fails.
- A feature may keep its own oracle part. The oracle is never derived from the profile, the plan or the implementation.
  Oracle parts are test code. `describeWiring` exists for debugging only and takes the composition alone.
- Error style: a mismatch throws a `ConformanceError` with code `conformance.wiring.mismatch` whose `details.differences`
  lists every difference; malformed declarations are `conformance.argument.invalid`.
- `checkModuleLayout(records)` ships in the same package as a pure function over records the consumer collects, with
  the code `conformance.layout.violation`. It checks the Get Modular layout rules of the Consumer Module Standard. The
  CMS oxlint preset is not part of this decision.

### Precedence

Supersedes the ADR-0035 consequence "The independent binding oracle is the only hand-written statement of wiring and
compares every row of the prepared plan", and the row sentence of the Consumer Module Standard testing rule 6. It does
not change Core, Assembly, the plan or the plan digest.

## Consequences

- Provider replacement, an added or removed module, a changed root, a provided capability that is not pinned, a slot
  moved to another capability and every explicit, optional or many row fail the oracle.
- Accepted weakening: a new `required` slot bound to its single pinned provider needs no oracle change; review it as a
  declaration change.
- The oracle needs the declarations the test already has for `compileComposition` and `checkNamespaces`; it adds no new
  input to a root test.
- The agent-runtime and TEST oracles are rewritten from row tables to pins.

## Rejected alternatives

- Full rows per feature: the same size, and it changes with every slot.
- A golden file refreshed from output: it copies what it should check.
- Cross-feature rows only: replacement inside a feature goes unseen.
- A plan schema version 2 that carries slot cardinality and provided capabilities: it changes every plan digest and
  every golden output for the sake of one checker.
- `SuccessfulComposition` carrying declarations: it couples the core compile result to a conformance need.
- A plan-only `checkWiring(composition, oracles)`: it cannot prove that an unlisted row is `required` or that every
  provided capability is pinned, so it would silently weaken the oracle.
