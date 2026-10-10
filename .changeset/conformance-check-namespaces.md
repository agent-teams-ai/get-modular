---
"@get-modular/conformance": minor
---

Add `checkNamespaces({ namespace, declarations })`: one synchronous call checks the namespace rules of the Consumer Module Standard for a product. `moduleId` and `implementationId` lie in the namespace at a segment boundary, and `owner.authority` equals the first segment of `moduleId`. It collects every violation and throws `conformance.namespaces.violation` with `details.violations`.

Migration:

- Better: one call checks the namespace rules instead of a hand-written loop.
- Codemod: none - one new union member of `ConformanceErrorCode`.
- By hand: exhaustive maps over `ConformanceErrorCode` add `conformance.namespaces.violation`.

Authoring surface changed: no
