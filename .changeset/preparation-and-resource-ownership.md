---
"@get-modular/core": patch
"@get-modular/assembly": patch
"@get-modular/resources": patch
"@get-modular/observation": patch
---

Keep Assembly's returned composition consistent with the immutable instructions
it executes, include inferred bindings in the existing preparation limits, and
reuse frozen provider candidates across repeated unresolved slots.

Close deep resource trees without call-stack overflow while preserving cleanup
order, reentrant abort notification, debt, escalation and retry. Successfully
detached children stop retaining their parent resource graph.

Validate deep Observation data iteratively while preserving graph identity,
cycles, descriptor checks and validation before freezing. Public APIs and
dependency boundaries remain unchanged.

Advance Core with Assembly to preserve their exact version pair. Core's runtime
semantics are unchanged; release admission and publication remain separate.
