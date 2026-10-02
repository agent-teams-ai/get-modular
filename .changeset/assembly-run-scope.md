---
"@get-modular/assembly": minor
---

Pass a per-run scope and declared inputs to runs (ADR-0031). One prepared assembly now serves many isolated runs.

- `FactoryContext` is `{ signal, scope }`. `scope` is the value passed to `run()`; Assembly never reads it.
- `run({ signal, scope, inputs })`: every option may be omitted or `undefined`.
- `bindInput(declaration)` binds a declaration without slots whose capability record each run supplies.
  `prepare({ composition, factories, roots, inputs })` accepts input handles only in `inputs`.
- New codes: `assembly.prepare.input-handles` and `assembly.run.invalid-inputs` with failed phase `"inputs"`.

Migration: code that constructs `FactoryContext` or `RunOptions` itself or implements `PreparedAssembly` adds
`scope`. Exhaustive maps over `PreparationErrorCode`, `RunErrorCode` or the failed `phase` add the new members.
Factories and ordinary `run()` calls need no change.

Authoring surface changed: yes
