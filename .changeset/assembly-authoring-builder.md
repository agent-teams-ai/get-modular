---
"@get-modular/assembly": minor
---

Add the authoring builder (ADR-0032).

- `defineContract<Value>()({ id, revision })` creates one descriptor per capability. `revision` is an integer
  from 1 to 2147483647. `provide()` and `slot(slotId, cardinality)` produce declaration entries in the current
  wire generation, where a revision is the exact token `<id>/r<revision>`.
- `declareModule(spec)` supplies `kind` and `schemaVersion` and refuses a spec that carries either field.
  Its type accepts only entries produced by a descriptor, so declarations never spell `compatibility`.
- `CapabilitiesOf<typeof A | typeof B>` derives a capability map from descriptors. Name a map over many
  descriptors as `interface Map extends CapabilitiesOf<...> {}`.

Migration: existing declarations written with Core's helpers and hand-written `CapabilityContract` maps keep
working in 0.3.0.

Authoring surface changed: yes
