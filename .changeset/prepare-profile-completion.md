---
"@get-modular/assembly": minor
---

`prepare` accepts `profileId` (and optional `bindings`) instead of a compiled `composition` and completes the profile from the bound handles (ADR-0035). A `required` slot without a row takes its only other provider; any other slot without a row fails with the new code `assembly.prepare.unresolved-binding`, listing every such slot with its candidates before any factory runs. A prepared result also carries `composition`.

Migration:

- Better: adding a module to a composition root is one `bindFactory` line, and the profile follows the module list.
- Codemod: none. `prepare({ composition })` keeps working.
- By hand: optional. Exhaustive maps over `PreparationErrorCode` add one member, and custom `Assembly` implementations accept the new input form and return `composition`. Production roots move to `profileId` when they adopt 0.4.0 per ADR-0035: replace `compileComposition` and the written profile with `profileId`, keep rows only for `optional`, `many` and several-candidate slots, and compare every row of `composition.plan.bindings` against a hand-written table.
- Check: run your TypeScript build and your composition root's smoke and binding-oracle tests.

Authoring surface changed: no
