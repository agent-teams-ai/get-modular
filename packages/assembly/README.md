# @get-modular/assembly

Private, optional construction support above the public `@get-modular/core` root.
Node.js `>=24.18.0 <25`; ESM; TypeScript consumer floor 5.8.3.

`assemblyFor<C>()` returns `bindFactory` and `prepare`. Describe each Host-owned
capability in `C` using `CapabilityContract<Value, ExactToken>`. Pass a literal
Core declaration to `bindFactory`; its slots determine the callback's dependency
record. The callback receives that record and `{ signal }`, and returns an
ordinary current-realm Promise fulfilling with `{ instance, capabilities }`.

Compile with public Core, then call
`prepare({ composition, factories, roots: { app: appHandle } })`.
A `"prepared"` result exposes `prepared.run({ signal })`; an omitted signal gets
a fresh signal for that attempt. Preparation failures have `status: "failed"`,
a stable `error.code`, an opaque cause, and separate Core `diagnostics`.

Run outcomes have status `"succeeded"`, `"failed"` or `"cancelled"`. Successful
`roots.app` has the instance type inferred from `appHandle`. Every outcome has
an ordered `created` journal. A failed outcome also has `phase`, `code`, `cause`,
`implementationId`, `cancellation` and `returned`. When `returned` is present,
it contains the exact untransferred fulfillment and its implementation ID.

The Host owns authorization, resource ownership and cleanup. Assembly performs
no rollback or disposal. Shared capability references can describe the same
resource several times; Host cleanup must account for that sharing. Cancellation
waits for an in-flight factory to settle. Construction does not establish readiness.

The package freezes its metadata, records, arrays and journals. Instance objects,
capability values, causes and signals remain opaque. Direct thenables, Promise
subclasses and Promises with own properties are unsupported factory carriers.

Build Core first, then run this package's `build`, `typecheck` and `test` commands.
