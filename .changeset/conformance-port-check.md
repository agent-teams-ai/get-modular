---
"@get-modular/conformance": minor
---

Check every object-valued capability that `smoke` or `isolate` constructs for callable members on its prototype chain, and report all non-port capabilities with `conformance.ports.prototype-member`.

Fix `checkModuleLayout`: only `*.group.*` files own modules. A `*.root.*` file may import a module to name it in `roots` (and group files) without owning it, so a root and a group importing the same module no longer report `group-count`; a module imported only by a root is an `orphan-module`. This corrects behaviour from the same unreleased 0.3.0 line, so it needs no migration.

Migration (0.2 -> 0.3)

- Better: modules hand out port objects, so members survive destructuring and no `this` leaks.
- Codemod: none - choosing the members of a port for a class is a semantic decision.
- By hand: wrap every capability that `smoke` or `isolate` reports in a port object; add `conformance.ports.prototype-member` to exhaustive maps over `ConformanceErrorCode`.
- Check: typecheck, then the composition smoke tests.

Authoring surface changed: yes
