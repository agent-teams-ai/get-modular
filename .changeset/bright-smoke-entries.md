---
"@get-modular/conformance": minor
---

Run `smoke` on module entries and static groups, including factories injected into modules in nested groups; use `isolate(entry, ...)`, and fail `conformance.smoke.failed` when `compose` resolves with a preparation that the supplied api did not return (return it unchanged). Resolve exactly one copy of `@get-modular/assembly`.

Migration (0.2 -> 0.3)

- Better: smoke rebuilds the submitted tree through Assembly's public entry and group constructors, and isolate derives dependencies, instance and capabilities from the entry.
- Codemod: `pnpm --dir <get-modular> codemod 0.4-0.5 <repo> --write`
- By hand: migrate `isolate` calls whose declaration, factory or adapter is selected conditionally, and ensure the test package resolves one copy of `@get-modular/assembly` and raise `@get-modular/conformance` to `^0.3.0` in the same change that raises core and assembly to `^0.5.0`.
- Check: typecheck, then the composition smoke tests.

Authoring surface changed: yes
