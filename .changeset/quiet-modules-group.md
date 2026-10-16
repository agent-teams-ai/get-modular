---
"@get-modular/assembly": minor
---

Replace bound handles with immutable module entries and static groups: `implement`, `input`, `group`, `entriesOf` and `prepare({ modules })` author modules once, keep feature shape in types, flatten in depth-first order and fail closed on duplicate module identities.

Migration (0.4 -> 0.5)

- Better: a module is a declaration and one entry beside it, a feature is one static group, and a root lists features without losing the capability-map check.
- Codemod: `pnpm --dir <get-modular> codemod 0.4-0.5 <repo> --write`
- By hand: move code into the feature layout; replace a `scoped` name other than `D.implementationId` (module scope names and debt paths would change); replace a declaration or factory picked by a conditional; resolve an unresolved receiver; move handles stored outside a `prepare` call (`bindRuntimeSetup` returns `{ factories }`); update exhaustive maps over `BindingErrorCode` and `PreparationErrorCode` to add `assembly.bind.invalid-group` and `assembly.prepare.duplicate-module`; handle duplicates that failed with `assembly.prepare.handles` or `assembly.prepare.input-handles` now fail with `assembly.prepare.duplicate-module`, so update code that matched them; `KnownCapabilities<C, F, N>` now takes the `modules` list as its second parameter (entries and groups), not a factory tuple.
- Check: typecheck, then the composition smoke tests.

Authoring surface changed: yes
