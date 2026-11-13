# Retained CMS preparation-envelope review

This directory retains review evidence. The canonical
[Consumer Module Standard](../../../../docs/architecture/common-assembly.md#consumer-module-standard)
is source checkpoint `c25a498e4ac6d959072571e1b2e7cccc95258e23`, Git blob
`3cd861ac20e6ee825c4f54c1ffb325b622f60d08`, full-document SHA-256
`8d07cca2d78dbcf5422a0394425d84ee4833839ae180a5e2133791557e0b735b`.
That checkpoint contains the reviewed clarification; it does not establish a
release, production adoption or completed hosted qualification.

`common-assembly.txt` preserves its complete bytes. `common-assembly.diff` is
the raw Git delta from the previously reviewed native Effect checkpoint
`49f09f5121ea6da544dd98f3c1cf7015e38c66cc`: one hunk, six additions and no removals.
It was captured with `git diff --no-ext-diff --abbrev=7` for those two commits and
`docs/architecture/common-assembly.md`. Its SHA-256 is
`51453afb49f2c2aab94e2b5d3c41e6f1bc6f5ecf244e79ac0b7aae111d25dd54`.

`previous-review.json` freezes the complete prior SDK review, SHA-256
`70826c9ea77b66409abf83de4fef7843f3571c60037a66d420f9927db246cf81`.
`growth-previous-source.ts.txt` preserves the preceding live growth-source
authority, SHA-256
`b850eca94356b196a83b6c6a6b9b3e2e33ed4b3bb4cf8bad345ff4a45500905c`.
Both reviews advance from the same native checkpoint, so they share this retained
document delta. Every previous evidence directory and accepted ADR stays unchanged.

## Reviewed clarification

The existing 4,096 selected-entry ceiling includes module entries and borrowed
input entries together, before metadata collection or profile completion. The
separate module-tree ceiling counts module entries and group nodes. Inputs do
not consume group nodes; grouping can therefore preserve a valid mixed inventory
at both limits. This corrects enforcement of the accepted envelope without a new
composition contract, public error code, ownership rule or valid-input migration.

The shared Assembly collector owns the correction for Promise and native
consumers. The maintained exact-limit and overflow cases in
[profile-completion tests](../../../../packages/assembly/tests/profile-completion-bounds.test.ts)
and [public construction tests](../../../../packages/effect/tests/construction.test.ts)
bind the clarification to its implementation. This evidence directory supplies
no independent production-consumer qualification.

## Retained scope and verification

The current growth source retains the complete descriptor-union authoring
contract and selected flat composition. Its changed authority bytes require
fresh current-source qualification; historical reports do not qualify them.
Native Effect and Observation remain unselected in that growth scope. SDK remains
fixed development tooling, with activation HOLD, pending qualification and the
same four external authority/custody blockers.

The current SDK guard authenticates this document, delta and predecessor review
alongside all native Effect, descriptor, drain, Bun and P0 evidence. Substitution
and missing-file controls cover the newly historical native inputs. The ownership
checkpoint advances only its current CMS assertion; its C0 observations remain
frozen. Run the normal ownership, SDK growth, consumer-growth and documentation
gates on the updated source. No SDK authority or registry publication follows
from a successful guidance review.
