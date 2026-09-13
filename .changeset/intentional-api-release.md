---
"@get-modular/core": minor
"@get-modular/assembly": minor
---

Establish a new versioned API evidence point for Core and Assembly while retaining
the historical 0.1.0 baseline erratum. Preserve Assembly's intentional public
IsUnion and ValidDeclaration type aliases and their existing inference behavior.
The historical baseline did not describe all released 0.1.0 declarations; the
new baseline describes only the new release and does not rewrite that history.
