---
"@get-modular/core": patch
"@get-modular/assembly": patch
---

Apply Assembly's existing selected-entry ceiling to ordinary modules and borrowed
inputs together before profile completion or Core invocation. Oversized mixed
inventories now return `assembly.prepare.limit` instead of reaching Core or
producing an oversized unresolved-binding diagnostic. Preserve the separate
module-tree budget and valid inventories at the exact selected-entry limit.

Advance Core with Assembly to preserve their exact release pair; Core behavior
and valid-input APIs are unchanged. The pending coordinated release retains its
existing admission and publication gates.
