---
"@get-modular/assembly": minor
"@get-modular/core": minor
"@get-modular/conformance": minor
---

Add `formatFailure` for bounded startup diagnostics from Core and Assembly failures. Authoring context is opt-in and escaped; opaque causes and runtime values remain private.

Keep the exact Core/Assembly release pair and advance Conformance for the new
peer minor profile; Core composition behavior is unchanged.

Migration (Core/Assembly 0.6 -> 0.7; Conformance 0.4 -> 0.5)

Better: one qualified peer profile includes bounded startup diagnostics.

Codemod: none - public call shapes remain unchanged; this is a coordinated peer upgrade.

By hand: install the exact Core/Assembly pair and matching Conformance minor,
with one physical Resources identity. Existing structured diagnostics remain available.

Check: typecheck, then composition smoke and packed public-package consumers.
