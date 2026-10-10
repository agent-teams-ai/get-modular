---
"@get-modular/assembly": patch
---

`CapabilitiesOf` maps each contract once: type-check cost of large capability maps drops from quadratic to about linear (500 handles under one map: 1.38M to 0.54M instantiations on TypeScript 7). No source change is needed.

Authoring surface changed: no
