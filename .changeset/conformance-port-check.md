---
"@get-modular/conformance": minor
---

Check every object-valued capability that `smoke` or `isolate` constructs for callable members on its prototype chain, and report all non-port capabilities with `conformance.ports.prototype-member`.

Migration (0.2 -> 0.3)

- Better: modules hand out port objects, so members survive destructuring and no `this` leaks.
- Codemod: none - choosing the members of a port for a class is a semantic decision.
- By hand: wrap every capability that `smoke` or `isolate` reports in a port object; add `conformance.ports.prototype-member` to exhaustive maps over `ConformanceErrorCode`.
- Check: typecheck, then the composition smoke tests.

Authoring surface changed: yes
