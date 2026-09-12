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
does not dispose or roll back resources. A journal entry is not a claim of
independent resource ownership. Closing every disposable instance or capability
can close a borrowed resource or close one resource through several wrappers;
deduplicating object references alone does not establish ownership.

Use the resource's known factory or Host owner to register cleanup when it is
acquired. A capability consumer does not gain cleanup authority by receiving a
reference. Resources not handed back by a rejected factory remain that factory's
or its Host owner's responsibility. Keep the exact `returned` handoff available
to the known owner; do not inspect arbitrary values for a disposal method.

The current basic example scans unique disposable values for its own small
configuration resource and closes its scope before returning. This illustrates
that particular resource arrangement, not a general ownership algorithm. Do not
reuse the returned roots as live services after the example completes. A Host
that returns usable roots must also transfer their lifetime to the caller.

Readiness, retries, permissions, routing, drain, recovery, and long-lived
lifecycle state also remain Host policies. Keep them outside module factories
unless they are part of the feature's own capability contract.

## Composition mistakes to avoid

These examples apply the existing
[Consumer Module Standard](../architecture/common-assembly.md#consumer-module-standard)
and [ownership contract](../architecture/common-assembly.md#outcomes-and-ownership-transfer).
They do not introduce another standard or qualify a new runtime scope.

| Tempting shortcut | Boundary to preserve |
| --- | --- |
| Give every module a context with all services or `resolve(id)` | Pass only that consumer's declared, typed dependency record. Keep selection in the composition adapter. |
| Make every parser, DTO or class a graph node | Keep fixed private helpers in their cohesive feature; model independently assembled relationships. |
| Add a global registry to share handles across package copies | Handles are local authenticated identities. Transfer inert declarations and create handles in the receiving Assembly copy. |
| Pull product types or host internals into a convenient shared SDK | Keep ports consumer-owned and adapters at the product boundary; use public package roots. |
| Select whichever provider registered first or use an instance fallback | Author a complete profile with exact implementation/capability bindings and explicit many ordering. |
| Hide a capability/token mismatch behind `any` or a double cast | Correct the declaration, factory or binding; preserve rejecting type fixtures. |
| Treat a green library suite as consumer adoption | Retain the consumer's own pin, wiring oracle and blocking positive/rejecting checks for its actual scope. |

## Runtime expectations

Assembly constructs a selected graph; it does not provide plugin activation or
hot replacement. When designing a product Host, keep these distinctions explicit:

- A new profile changes future construction, not references already captured by
  consumers. The Host owns rebuilding affected consumers or an explicit invocation
  boundary. A plan digest is not an instance or generation identity.
- A cancellation request or observation deadline is not proof that work stopped.
  Preserve the owner of an in-flight factory and its resources until settlement
  or the Host's actual termination proof. Construction success is not readiness.
- Package installation and module selection do not establish executable trust or
  permissions. Admission and target-local loading belong to the product Host;
  an `owner.authority` string is not an authenticated principal.

See the [system boundary](../architecture/system-boundary.md) and
[capability evolution](../architecture/mvp-implementation-roadmap.md#capability-evolution-and-namespace-admission).
Changing a capability contract requires its explicit migration path; adding a
runtime manager to Core or Assembly does not solve that product responsibility.

## Adopt the Consumer Module Standard

For a production boundary, copy the [consumer profile template](../templates/consumer-module-profile.md),
pin the exact reviewed standard revision, and connect its real commands to the
consumer's fast and full gates. Installing the packages alone is not an adoption
claim. The canonical requirements are in the
[Consumer Module Standard](../architecture/common-assembly.md#consumer-module-standard).
