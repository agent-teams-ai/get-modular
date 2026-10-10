# Changelog

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
- Updated dependencies [d171008]
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
