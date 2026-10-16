# Changelog

## 0.3.0

### Minor Changes

- 2f33631: Run `smoke` on module entries and static groups, including factories injected into modules in nested groups; use `isolate(entry, ...)`, and fail `conformance.smoke.failed` when `compose` resolves with a preparation that the supplied api did not return (return it unchanged). Resolve exactly one copy of `@get-modular/assembly`.
  
  Migration (0.2 -> 0.3)
  
  - Better: smoke rebuilds the submitted tree through Assembly's public entry and group constructors, and isolate derives dependencies, instance and capabilities from the entry.
  - Codemod: `pnpm --dir <get-modular> codemod 0.4-0.5 <repo> --write`
  - By hand: migrate `isolate` calls whose declaration, factory or adapter is selected conditionally, and ensure the test package resolves one copy of `@get-modular/assembly` and raise `@get-modular/conformance` to `^0.3.0` in the same change that raises core and assembly to `^0.5.0`.
  - Check: typecheck, then the composition smoke tests.
  
  Authoring surface changed: yes
- ca879f7: Check every object-valued capability that `smoke` or `isolate` constructs for callable members on its prototype chain, and report all non-port capabilities with `conformance.ports.prototype-member`.
  
  Fix `checkModuleLayout` ownership: groups own feature modules, and a root owns only the Host-level modules it lists as its own entries. A root import made to name a module in `roots` does not count when a group already owns the module, so it no longer reports `group-count`; a feature module imported only by a root is an `orphan-module`, and two roots importing one Host-level module without a group give `group-count`. This corrects behavior from the same unreleased 0.3.0 line, so it needs no migration.
  
  Migration (0.2 -> 0.3)
  
  - Better: modules hand out port objects, so members survive destructuring and no `this` leaks.
  - Codemod: none - choosing the members of a port for a class is a semantic decision.
  - By hand: wrap every capability that `smoke` or `isolate` reports in a port object; add `conformance.ports.prototype-member` to exhaustive maps over `ConformanceErrorCode`.
  - Check: typecheck, then the composition smoke tests.
  
  Authoring surface changed: yes
- ab41023: Add `checkWiring(composition, oracles, { declarations })` and `describeWiring` for hand-written provider
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

### Patch Changes

- Updated dependencies [2f33631]
- Updated dependencies [2f33631]
  - @get-modular/core@0.5.0
  - @get-modular/assembly@0.5.0

## 0.2.0

### Minor Changes

- d817bf7: Add `checkNamespaces({ namespace, declarations })`: one synchronous call checks the namespace rules of the Consumer Module Standard for a product. `moduleId` and `implementationId` lie in the namespace at a segment boundary, and `owner.authority` equals the first segment of `moduleId`. It collects every violation and throws `conformance.namespaces.violation` with `details.violations`.
  
  Migration:
  
  - Better: one call checks the namespace rules instead of a hand-written loop.
  - Codemod: none - one new union member of `ConformanceErrorCode`.
  - By hand: exhaustive maps over `ConformanceErrorCode` add `conformance.namespaces.violation`.
  
  Authoring surface changed: no

### Patch Changes

- d171008: `ContractValue` reads the value type from the contract descriptor instead of indexing `CapabilitiesOf`. The resulting type is unchanged.
  
  Authoring surface changed: no
- d9f6277: Upgrade `@get-modular/conformance` to 0.2.0 together with `@get-modular/core` and `@get-modular/assembly` 0.4.0: conformance 0.2.0 declares them as `^0.4.0` peers (`@get-modular/resources` stays `^0.1.0`), and conformance 0.1.0 fails against Assembly 0.4.0 (its peer ranges end at `^0.3.0`, and its `ContractValue` indexes `CapabilitiesOf<T>`, which fails with TS2536 under `skipLibCheck: false`).
  
  Migration:
  
  - Better: one upgrade step keeps the test kit and the packages it checks in agreement.
  - Codemod: none. This is a version note.
  - By hand: raise `@get-modular/conformance` to `^0.2.0` in the same change that raises `@get-modular/core` and `@get-modular/assembly` to `^0.4.0`.
  - Check: typecheck, then the composition smoke tests.
  
  Authoring surface changed: no
- Updated dependencies [d171008]
- Updated dependencies
- Updated dependencies
- Updated dependencies [2a83057]
  - @get-modular/assembly@0.4.0
  - @get-modular/core@0.4.0

## 0.1.0

### Minor Changes

- a01a129: Add `@get-modular/conformance` (ADR-0033): test harness and contract suites for modules and composition roots.
  
  - `isolate(api, { declaration, factory, dependencies })` builds one module through a real Assembly run, with
    each dependency as an input module and the module scope of production.
  - `smoke({ api, compose })` runs a composition root once, then again with a failure and an abort injected at every
    module, and requires each attempt to close complete.
  - `contractSuite(contract, cases)` and `runContractSuite(suite, subject, test)` check one contract against any
    implementation, one fresh scope per case; a suite for another revision throws before registering tests.
  - `guardHandles()` compares active handle types before and after a test.
  - Errors carry stable `conformance.<area>.<reason>` codes. Core, Assembly and resources are peer dependencies.
  
  Authoring surface changed: yes

### Patch Changes

- Updated dependencies [3c28a02]
- Updated dependencies [345bad1]
- Updated dependencies [fcb3a32]
- Updated dependencies [fcb3a32]
  - @get-modular/resources@0.1.0
  - @get-modular/assembly@0.3.0
  - @get-modular/core@0.3.0
