# Changelog

## 0.1.0

### Minor Changes

- 3c28a02: Add `@get-modular/resources` (ADR-0030): ordered, cooperative cleanup scopes for module instances.
  
  - `createScope({ name, order })` returns `{ resources, control }`. Modules receive only `resources`
    (`setup`, `use`, `child`, `signal`); the holder of `control` closes the scope.
  - `close({ escalate, abandon })` releases in reverse order, records a failed cleanup as a debt and
    continues, and never rejects. A later close retries the failed entries.
  - `scoped(implementationId, factory)` opens one module scope per factory call under the run scope
    that Assembly 0.3.0 passes as `FactoryContext.scope`.
  - Errors carry stable `resources.<area>.<reason>` codes.
  
  Authoring surface changed: yes
