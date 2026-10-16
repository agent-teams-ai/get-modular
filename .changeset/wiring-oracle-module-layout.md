---
"@get-modular/conformance": minor
---

Add `checkWiring(composition, oracles, { declarations })` and `describeWiring` for hand-written provider
oracles, and
`checkModuleLayout` for the Get Modular module layout rules and the
modules-per-feature metric. Both checks collect every difference or violation
before throwing one structured error.

Migration (0.2 -> 0.3)

Better: consumer tests can state provider decisions once and check source
layout without a separate parser.

Codemod: none - pure addition.

Authoring surface changed: no.

By hand: add the new `ConformanceErrorCode` values
  `conformance.wiring.mismatch` and `conformance.layout.violation` to exhaustive
  error-code maps when they must cover every code.

Check: typecheck, then the composition smoke tests.
