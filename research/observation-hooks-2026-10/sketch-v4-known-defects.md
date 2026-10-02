# Sketch v4: known defects for the implementation delivery

The executable sketch v4 (`raw/evidence/code-sketch/hooks-sketch-v4/`) is frozen
evidence and is not fixed in place. A pull request review on 2026-10-02 reported
the defects below; each was confirmed by reading the sketch code, not by a new
test. The implementation delivery must cover them with rejecting tests.

| Area | Defect | Expected fix |
| --- | --- | --- |
| Hub start (`hub.ts`) | If the scope closes while a participant's subscription is being set up, the scope keeps and runs the unsubscribe cleanup, but the hub throws before recording the started derivation in its drain record. Close then finishes without draining that derivation. | Record the started lane in the drain record inside the setup callback, before the scope can observe it. |
| Delivery (`keyed-source.ts`) | A delivery batch checks `sealed` once; if a callback seals the source, the rest of the batch is still delivered. | Recheck `sealed` before each registration's delivery. |
| Value ownership (`keyed-source.ts`) | Accessor properties pass the plain-data check, and their getters keep running after `Object.freeze`, so a value can change without a commit. | Reject accessor descriptors as `observation.values.not-plain`. |
| Projections (`keyed-source.ts`) | A key named `__proto__` is assigned through the inherited setter, so the projection loses that value. | Define projection properties explicitly (or use null-prototype records) and test the key. |
| Revisions (`latest-derivation.ts`) | `offer` accepts `NaN`, which disables the stale-revision check afterwards; `Infinity` blocks all later offers. | Accept only non-negative safe integers. |

Two further reports concern the `@get-modular/resources` stand-in used by the
sketch, not this package: close waits for pending setups without honouring
`abandon`, and each released entry keeps its `abandon` listener. They were
passed to the resources stream, whose package owns those semantics.

Other review comments on the archive targeted the superseded sketches v1-v3
(fixed in v4) or asked to change preserved reports; preserved evidence is not
edited.
