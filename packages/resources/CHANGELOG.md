# Changelog

## 0.2.0

### Minor Changes

- 3e59595: Require TypeScript 7.0.2 or newer for declaration consumers and current package
  qualification (ADR-0038). Current native compiler readers and codemods retain
  their semantic checks and original fixtures. Distinct minimum/current compilers
  are checked once in each required resolution mode with `skipLibCheck: false`.
  
  Core and Assembly remain an exact version pair. This is a consumer support
  change; it adds no runtime API behavior.
  
  Authoring surface changed: yes
  
  ## Migration (0.5 -> 0.6): Core and Assembly
  
  - Better: one explicit supported compiler floor across packages and examples.
  - Codemod: none - compiler installation is owned by the consumer's toolchain.
  - By hand: update the consumer's exact TypeScript pin to 7.0.2 or newer and use
    Core and Assembly 0.6 together; keep their versions paired.
  - Check: compile the consumer's actual NodeNext and Bundler projects with
    `skipLibCheck: false` and run its existing composition and ownership tests.
  
  ## Migration (0.1 -> 0.2): resources
  
  - Better: the same explicit compiler floor as the composition packages.
  - Codemod: none - compiler installation belongs to the consumer toolchain.
  - By hand: pin TypeScript 7.0.2 or newer and resources 0.2; install observation
    0.1 alongside it when adopting subscriptions. The initial observation minor
    declares the matching resources peer range.
  - Check: typecheck the consumer with `skipLibCheck: false`, then run its
    composition smoke tests and scope ownership tests.
  
  ## Migration (0.3 -> 0.4): conformance
  
  - Better: qualification uses the same supported compiler floor as the tested
    contracts and composition packages.
  - Codemod: none - compiler installation belongs to the consumer toolchain.
  - By hand: pin TypeScript 7.0.2 or newer and conformance 0.4 with Core/Assembly
    0.6 and resources 0.2. Existing contract and wiring calls keep their shape.
  - Check: typecheck the consumer with `skipLibCheck: false`, then run its
    contract, wiring and composition smoke tests.

### Patch Changes

- 3e59595: Document that `Resources.signal` also aborts when the run that constructs the module is cancelled before its factory
  settles, and that subscriptions bound to the signal detach then. No API or behavior change.
  
  Authoring surface changed: no

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
