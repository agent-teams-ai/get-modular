---
id: PROVENANCE-INDEX
type: index
status: active
owner: architecture
summary: Navigation and authority rules for external Get Modular evidence.
---

# Provenance

[source-map.yaml](source-map.yaml) records immutable evidence used during
bootstrap. A source map preserves provenance; it does not transfer authority.
Only accepted decisions and normative requirements in this repository govern
Get Modular.

`pnpm governance:check` validates exact revisions, safe evidence paths,
accepted-requirement immutability, and bidirectional requirement-to-source
traceability. It intentionally does not promote an external source to local
authority.
