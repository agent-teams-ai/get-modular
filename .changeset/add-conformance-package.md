---
"@get-modular/conformance": minor
---

Add `@get-modular/conformance` (ADR-0033): test harness and contract suites for modules and composition roots.

- `isolate(api, { declaration, factory, dependencies })` builds one module through a real Assembly run, with
  each dependency as an input module and the module scope of production.
- `smoke({ api, compose })` runs a composition root once, then again with a failure and an abort injected at every
  module, and requires each attempt to close complete.
- `contractSuite(contract, cases)` and `runContractSuite(suite, subject, test)` check one contract against any
  implementation, one fresh scope per case; a suite for another revision throws before registering tests.
- `guardHandles()` compares active handle types before and after a test.
- Errors carry stable `conformance.<area>.<reason>` codes. Core, Assembly and resources are peer dependencies.

Authoring surface changed: yes
