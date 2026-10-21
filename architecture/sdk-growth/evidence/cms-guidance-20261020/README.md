# SDK growth CMS guidance review inputs

These complete snapshots are non-authoritative evidence for the adjacent
`consumer-module-standard.json` review. The canonical standard remains
`docs/architecture/common-assembly.md#consumer-module-standard` in
`agent-teams-ai/get-modular` at each recorded exact commit. Resolve links in
snapshots at that upstream revision, not inside this evidence directory.

`common-assembly.txt` is the full document at
`300e7e1c459c08f5e271627e4ca7d2486bdf5e1f`; `previous-common-assembly.txt` retains
the previous reviewed document at `24d6557a1b04b01a3a73c64b1d9a9afd83d89c8f`.
`common-assembly.diff` is their complete unified delta: 18 hunks, 48 removed
lines and 988 added lines. The review JSON pins both identities and the exact
delta hash. `previous-review.json` preserves the previous review bytes,
including the original `669a750d` pin and earlier accepted-current delta.
All upstream bytes were retrieved through `gh api` at exact commits; current
`main` was observed as `300e7e1c459c08f5e271627e4ca7d2486bdf5e1f` on 2026-10-20.

The full documents and delta were reviewed. The delta changes the composition
contract: resources and per-run scopes, declared inputs and instance templates,
contract descriptors, module entries and static groups, profile completion,
provider/root oracles, FMS v1.1 guidance and observation ownership/testing rules.
It cannot truthfully retain the previous classification as only optional
dynamic Host guidance or claim that the composition contract did not change.

This review covers the SDK growth development-tooling slice only. Its verifier
uses Foundation's public SDK authority API; it has no Assembly factory, module
entry, template, store or subscription to migrate. Fixed tooling dependencies
remain static imports. This is neither a product Host adoption nor proof that
all library or consumer composition code conforms. Package implementation and
consumer adoption evidence remain with their existing owners and accepted
records; accepted ADRs and historical authority bytes are unchanged.

The original P0 feasibility record remains bound to its original source commit
and CMS document hash. The checker authenticates those historical bytes
separately from the current guidance input. It rejects relabeling P0 as current
qualification. SDK growth stays `pending`, activation `hold`, with the same four
outstanding proof requirements: independent external authority transport,
trusted PR base/exact candidate binding, authenticated released-artifact source
binding, and released observations with custody receipts. A reviewed current
standard supplies none of those proofs; no source/runtime migration is required
inside this tooling slice and no activation is claimed.

The existing `sdk-growth:check` verifies current and previous document bytes,
Git blob identities, prior review bytes, exact delta, review classification and
pending/hold scope. Its tests reject stale current pins, substituted retained
inputs, erased outstanding work and fabricated adoption. The Bun delivery owns
manager-specific command wiring; this evidence does not replace its install,
CI, runtime or release checks.
