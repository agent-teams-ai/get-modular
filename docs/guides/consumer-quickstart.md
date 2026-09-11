---
id: GUIDE-CONSUMER-QUICKSTART
type: architecture
status: active
owner: architecture
summary: Minimal path from module declarations to a constructed Host with diagnostics, cancellation, and cleanup.
related:
  - ARCH-COMMON-ASSEMBLY
  - ARCH-CURRENT-CONTRACT
  - ADR-0023
---

# Consumer quickstart

Use Core to validate composition data and create a deterministic plan. Add
Assembly when the Host also needs to construct already selected and authorized
factories.

```sh
npm install @get-modular/core@0.1.0 @get-modular/assembly@0.1.0
```

The complete [basic Host example](../../packages/assembly/examples/basic-host.mjs)
defines a configuration provider, a greeting feature, and an application root.
Its test runs in the repository's Assembly gate, so the example cannot silently
drift from the public API.

The essential flow is:

```js
const composition = await compileComposition({ declarations, profile });
if (!composition.ok) {
  // Translate stable diagnostic codes at the Host boundary.
  throw new Error(composition.diagnostics.map(({ code }) => code).join(", "));
}

const preparation = await api.prepare({ composition, factories, roots });
if (preparation.status === "failed") {
  // No factory has run. Inspect error.code and preparation.diagnostics.
  throw preparation.error;
}

const outcome = await preparation.prepared.run({ signal });
```

## Errors

Keep the three failure layers separate:

1. Core returns `ok: false` for invalid declarations, selections, bindings, or
   graph semantics. Translate the stable diagnostic `code`; do not parse text.
2. Assembly preparation returns `status: "failed"` for incomplete, mismatched,
   or malformed factory wiring. Preparation completes before product effects.
3. Execution returns `status: "failed"` when a factory throws or returns an
   invalid product. Use `phase`, `implementationId`, `cause`, `created`, and
   `returned` to apply the Host's recovery policy.

Unexpected infrastructure failures may reject the async call. Do not convert
them into domain diagnostics owned by Core.

## Cancellation

Pass one `AbortSignal` per construction attempt. Assembly forwards it to every
factory and stops before starting another factory after cancellation. An
in-flight factory must settle before Assembly returns the final outcome, so each
factory should observe the signal and stop its own work promptly.

```js
const controller = new AbortController();
const outcome = await prepared.run({ signal: controller.signal });
```

Repeated or concurrent `run` calls are isolated attempts. Do not reuse an
aborted controller for a later attempt.

## Host-owned cleanup

Assembly records every successfully created product in `outcome.created`; it
does not dispose or roll back resources. The Host chooses cleanup order and
must deduplicate shared objects that appear as both an instance and a
capability. The example registers unique disposable values in an
`AsyncDisposableStack` and disposes them in reverse construction order.

Readiness, retries, permissions, routing, drain, recovery, and long-lived
lifecycle state also remain Host policies. Keep them outside module factories
unless they are part of the feature's own capability contract.

## Adopt the Consumer Module Standard

For a production boundary, copy the [consumer profile template](../templates/consumer-module-profile.md),
pin the exact reviewed standard revision, and connect its real commands to the
consumer's fast and full gates. Installing the packages alone is not an adoption
claim. The canonical requirements are in the
[Consumer Module Standard](../architecture/common-assembly.md#consumer-module-standard).
