---
id: GUIDE-CONSUMER-QUICKSTART
type: architecture
status: active
owner: architecture
summary: Consumer construction and a Host-owned admission and lifecycle recipe for optional executable modules.
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
npm install @get-modular/core@0.3.0 @get-modular/assembly@0.3.0
```

Add `@get-modular/resources@0.1.0` when modules own resources that need cleanup,
and `@get-modular/conformance@0.1.0` as a development dependency for module and
composition tests.

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

const preparation = await api.prepare({ composition, factories, roots, inputs });
if (preparation.status === "failed") {
  // No factory has run. Inspect error.code and preparation.diagnostics.
  throw preparation.error;
}

const outcome = await preparation.prepared.run({ signal, scope, inputs });
```

Write declarations with `defineContract` and `declareModule`; `scope` and `inputs`
are optional unless the Host uses resources or declares inputs. The
[Consumer Module Standard](../architecture/common-assembly.md#module-packages-and-contracts)
describes the authoring rules.

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

Identify errors of every Get Modular package by `code`, never by class or
message; see the last bullet of
[Module packages and contracts](../architecture/common-assembly.md#module-packages-and-contracts).

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

The basic example registers its known configuration owner in an
`AsyncDisposableStack` before construction handoff. It awaits construction and
root use inside the protected lifetime, then closes the scope exactly once.
Its one-shot result contains a message and implementation IDs, never graph roots,
created products or raw returned products. Opaque failure causes remain untouched.
A Host that returns usable roots must also transfer their lifetime to the caller.

The example's `status` describes work. A separate `cleanupFailure: { cause }`
preserves cleanup failure alongside any primary failure, including
`throw undefined`; CLI success requires successful work and no cleanup failure.
An async acquisition provider must clean up allocations it never successfully
hands back: registration after `await acquire()` cannot recover an unreturned resource.

Modules that acquire their own resources register cleanup through the optional
resources package. The Host passes one scope per run and decides when to close
it; see [Module resource scopes](../architecture/common-assembly.md#module-resource-scopes)
for the rules and a Host template.

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

## Host recipe for optional executable modules

Use this recipe only when the product actually selects executable modules or
keeps constructed roots alive. A fixed, passive composition can use the smaller
one-shot Host above. The [synthetic TEST Host](https://github.com/agent-teams-ai/modularity-host-test/tree/fa11296f0c69d80216dec0c44d9742368a913a9d)
exercises this recipe against exact Core/Assembly package pairs; it is an example
of product-owned code, not another Get Modular package or a production Host.

1. **Define the scope.** Record the production root, composition owner, accepted
   local decision, exact standard and package pins, and real verification commands
   in a [consumer profile](../templates/consumer-module-profile.md). Classify new
   composition boundaries through the existing source inventory. Keep feature
   helpers that are fixed inside one owner out of the graph.
2. **Admit the entire selection before loading candidate code.** Build an inert
   snapshot from a Host-trusted candidate inventory, namespace assignments,
   capability grants and selection. Reject duplicates, unknown IDs and every
   unauthorized binding across the whole selected set. Core accepting a graph
   does not grant a module permission to receive a capability. Treat request
   metadata and `owner.authority` strings as claims, not trusted principals.
3. **Compile and prepare exact wiring.** Project the admitted snapshot to one
   complete Core profile; call public `compileComposition`; map every selected
   implementation ID to exactly one Host-owned lazy loader and factory handle;
   then call public Assembly `prepare`. Refuse any selected implementation ID
   without exactly one loader before invoking a candidate loader. Import code
   only inside the admitted factory path. Check Host authority immediately
   before invoking its loader, then again after an async import and before
   calling the candidate factory.
4. **Retain one lifetime owner.** Create the product Host and a scope for the
   attempt before `prepared.run({ signal, scope })` and publish its construction flight synchronously
   before invoking that run. Reserve ownership before an asynchronous acquire;
   register each acquired resource with that same owner as soon as it exists.
   If acquisition fails after an unreturned allocation, the provider must clean
   it up or hand the obligation to an already reachable owner. Preserve the raw
   Assembly `created`/`returned` handoff without disposing borrowed capabilities.
5. **Fence effects and close once.** Keep issued capabilities bound to that Host
   lifetime. Check authority again immediately before each effect after an
   `await`, including through saved handles and extracted methods. On close,
   stop admitting work, retain the single close flight before notifying abort
   listeners, drain tracked construction and operations, and invoke each owned
   disposer once. An observer deadline may return `pending`; it must not turn
   unfinished cleanup into `closed`. Keep cleanup debt reachable for readback
   and an explicit retry owner.
6. **Prove the product boundary.** Add a positive constructed graph and
   rejecting cases for a bad final grant, a valid Core graph without Host receive
   permission, wrong loader mapping, import after revocation, late acquisition,
   post-`await` effects, saved handles, concurrent close and failed disposal.
   Check the consumer's real adapters and recovery holder in a disposable TEST
   project. Link these checks to the profile's blocking commands; a green library
   suite or this synthetic stand alone does not qualify the product.

The TEST stand has [admission code](https://github.com/agent-teams-ai/modularity-host-test/blob/fa11296f0c69d80216dec0c44d9742368a913a9d/src/admission/run.ts),
[one concrete Host owner](https://github.com/agent-teams-ai/modularity-host-test/blob/fa11296f0c69d80216dec0c44d9742368a913a9d/src/host/lifetime.ts)
and [evidence limits](https://github.com/agent-teams-ai/modularity-host-test/blob/fa11296f0c69d80216dec0c44d9742368a913a9d/docs/implementation-plan.md#claim-ledger).
Its in-memory effects do not prove external process termination, physical
cancellation, crash recovery, arbitrary-code isolation or Agent Runtime adoption.

## Adopt the Consumer Module Standard

For a production boundary, copy the [consumer profile template](../templates/consumer-module-profile.md),
pin the exact reviewed standard revision, and connect its real commands to the
consumer's fast and full gates. Installing the packages alone is not an adoption
claim. The canonical requirements are in the
[Consumer Module Standard](../architecture/common-assembly.md#consumer-module-standard).
