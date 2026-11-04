---
"@get-modular/core": patch
"@get-modular/assembly": patch
---

Capture preparation root aliases before awaiting Core so changes to the caller's
root map cannot replace, swap or remove roots in an existing preparation.
Preserve entry identities, both preparation modes and existing validation order.

Advance Core with Assembly to preserve their exact version pair. Core's runtime
semantics are unchanged; release admission and publication remain separate.
