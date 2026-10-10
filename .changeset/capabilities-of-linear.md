---
"@get-modular/assembly": minor
---

`CapabilitiesOf` maps each contract once (ADR-0035): type-check cost of large capability maps drops from quadratic to about linear (500 handles under one map: 1,383,390 to 542,552 instantiations on TypeScript 7, 1,560,108 to 715,445 on 5.8.3). Results for concrete contract unions are unchanged.

Migration:

- Better: a 1,000-module root checks in about 2 s instead of about 5 s on TypeScript 7, and the cost no longer grows with the square of the module count.
- Codemod: none. The only affected pattern is generic and too varied to rewrite mechanically.
- By hand: indexing `CapabilitiesOf<T>[T["id"]]` with a generic `T` now fails with TS2536. Replace `CapabilitiesOf<T>[T["id"]]["value"]` with `T extends Contract<string, infer V, number> ? V : never`.
- Check: run your TypeScript build; concrete maps need no change.

Authoring surface changed: no
