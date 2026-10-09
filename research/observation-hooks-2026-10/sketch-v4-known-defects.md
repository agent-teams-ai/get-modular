# Sketch v4: known defects for the implementation delivery

The executable sketch v4 (`raw/evidence/code-sketch/hooks-sketch-v4/`) is frozen
evidence and is not fixed in place. A pull request review on 2026-10-02 reported
the defects below; each was confirmed by reading the sketch code, not by a new
test. The implementation delivery must cover them with rejecting tests.

| Area | Defect | Expected fix |
| --- | --- | --- |
| Hub start (`hub.ts`) | If the scope closes while a participant's subscription is being set up, the scope keeps and runs the unsubscribe cleanup, but the hub throws before recording the started derivation in its drain record. Close then finishes without draining that derivation. | Record the started lane in the drain record inside the setup callback, before the scope can observe it. |
| Delivery (`keyed-source.ts`) | A delivery batch checks `sealed` once; if a callback seals the source, the rest of the batch is still delivered. | Recheck `sealed` before each registration's delivery. |
| Value ownership (`keyed-source.ts`) | Accessor properties pass the plain-data check, and their getters keep running after `Object.freeze`, so a value can change without a commit. Accessors on the patch or initial record itself are read twice (`Object.entries`, then spread), so the stored value can be a second, unfrozen result. | Reject accessor descriptors as `observation.values.not-plain` at every level, and merge only the values captured during validation. |
| Projections (`keyed-source.ts`) | A key named `__proto__` is assigned through the inherited setter, so the projection loses that value. | Define projection properties explicitly (or use null-prototype records) and test the key. |
| Revisions (`latest-derivation.ts`) | `offer` accepts `NaN`, which disables the stale-revision check afterwards; `Infinity` blocks all later offers. | Accept only non-negative safe integers. |
| Cancellation isolation (`latest-derivation.ts`, v2-v4) | `controller.abort()` is wrapped in `invokeIsolated`, but Node reports an exception thrown by an `abort` listener on a native `AbortSignal` as an uncaught exception instead of throwing from `abort()`. A throwing listener registered inside `derive` bypasses `reportError` and, by default, terminates the process. | Either state in the contract that abort listeners are outside callback isolation, or deliver cancellation through a mechanism that isolates listener failures; add a rejecting test. |
| Key types (`contract.ts`) | `Key<V>` is `keyof V & string`, so an optional property (`?:`) type-checks for `read` and `observe` although only keys present in the initial record exist; v4 rejects such keys only at run time (`observation.keys.unknown`). | Make the value type require every key (`T \| undefined`, never `?:`) at the type level, with a negative type fixture. |
| Stale-result check (`main.ts`, v1-v4) | The A->B->A checks assert only the final state after the newest run settles, so they also pass when a stale result publishes first (reproduced by forcing `isCurrent` to `true`: publications `USD, EUR, USD`). The stale-drop guarantee rests on code reading. | Record every publication, or hold the newest run while releasing the stale one, and assert that the stale result never publishes. |

## Drift against the resources package on main

Checked against main after the 0.3.0 train landed (2026-10-08; not yet
released). The sketch was built against a stand-in for `@get-modular/resources`;
the package on main (ADR-0030, ADR-0031) differs in ways the implementation must
follow:

| Sketch v4 | On main | Consequence |
| --- | --- | --- |
| Cleanup context `{ signal }` (`hub.ts`, `HubResources`, `features/price-table/index.ts`) | `CleanupContext` is `{ escalate }` | Cleanups must read `escalate`; the structural port as written is not satisfied by `Resources`. It is also declared with method syntax, which checks parameters bivariantly and hid a `name?` versus `name` mismatch. A declared peer dependency on the package (as `@get-modular/conformance` does) avoids a second copy of these types. |
| Scope-closed check compares `code === "scope-closed"` | Code is `resources.scope.closed` | Compare the delivered code; keep the dev test against the real package that the design already requires. |
| `scoped(parent, name, factory)` | `scoped(name, factory)`; the run scope comes from `run({ signal, scope })` | Host wiring in the TEST experiment follows the Consumer Module Standard examples. |

## Resources stand-in

Two further reports concern the `@get-modular/resources` stand-in used by the
sketch, not this package: close waits for pending setups without honouring
`abandon`, and each released entry keeps its `abandon` listener. The
resources stream, which owns those semantics, confirmed on 2026-10-02 that its
design handles both.

## Other review comments

Review comments on v1-v3 code that v4 no longer has were closed after checking
the v4 code. Corrections to the preserved reports and the TEST fixtures are in
[errata.md](errata.md); preserved evidence is not edited.
