# Retained CMS source review evidence

This directory is non-authoritative review evidence. The canonical standard is
`docs/architecture/common-assembly.md#consumer-module-standard` at exact source
commit `0c2ea846f11532b216520e0e84e19ea1abf58342`.

`common-assembly.txt` is its complete byte-exact guide. `common-assembly.diff`
is Git's raw `a7d8db4` to source-checkpoint delta: seven ADR-0039 Observation
cleanup lines. This changes the lifecycle contract while leaving SDK fixed
development tooling's adoption pending, without Assembly or Observation.
`previous-review.json` retains the entire previous SDK review without rewriting
its command-only classification.

`growth-previous-common-assembly.txt` retains the full guide at `7131d0d`;
`growth-common-assembly.diff` is its raw delta to the same checkpoint: five Bun
repository command substitutions. `growth-previous-source.ts.txt` preserves the
upstream `eadd9d3` source authority that used that review. All dated growth reports
and prior CMS directories remain unchanged. The selected flat TEST profile does
not select Observation or expand production adoption. Current qualification is
pending; SDK activation remains HOLD with its original four blockers.

The existing SDK checker authenticates every retained snapshot, raw delta and
previous review, including the older P0/300e/Bun chains. Snapshots are not a second
normative standard, a released-artifact binding or qualification evidence.
