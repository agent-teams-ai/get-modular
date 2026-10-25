# SDK growth Bun command guidance review inputs

These are non-authoritative evidence inputs for the adjacent current
`consumer-module-standard.json` review. The canonical full document is
`docs/architecture/common-assembly.md#consumer-module-standard` in Get Modular.
Resolve snapshot links at their exact recorded repository commit.

`common-assembly.txt` contains every byte of canonical source commit
`a7d8db433fb3c4187fbeab4dcec4e6d69a4f70ca`, blob
`1da86de15c6def505aa57e212154e4d5ee5d6042`, SHA-256
`8f92029eec9610f6f83afe6f86352557f268b1abd8e2a241f16d86f5f0eaada9`,
81451 bytes. This source commit was created before this pin migration; it is
an exact local immutable ancestor pending the delivery's upstream push, not an
observation that upstream main already contains these bytes.

`common-assembly.diff` is the complete incremental delta from reviewed commit
`300e7e1c459c08f5e271627e4ca7d2486bdf5e1f`: one hunk, four removed and four
added lines. Both complete documents and that delta were reviewed. Exactly five
current Get Modular repository commands change from `pnpm` to `bun run`:
`assembly:test`, `resources:check`, `conformance:check`, `assembly:build` and
`observation:check`. Those root scripts already exist. This changes executable
repository guidance, not the Assembly composition contract, consumer manager
choices, lifecycle ownership, accepted ADRs or adoption status.

`previous-review.json` preserves the complete preceding review bytes. Its
composition and observation contract delta remains historical and true. The
previous full CMS snapshot at `cms-guidance-20261020/common-assembly.txt` and
historical P0 document at `cms-guidance-20261020/previous-common-assembly.txt`
remain unchanged; the current review records their exact repository paths.
The original `669a750d` pin, P0 feasibility source/hash and four outstanding
external-proof blockers remain unchanged. SDK growth stays `pending` with
activation `hold`; this command correction provides no authority transport,
trusted candidate/base binding, released source binding or observation custody.

The existing SDK guard separately authenticates current, previous and P0
snapshots, current source bytes, the incremental delta and the prior review.
It also reads and authenticates the original `cms-guidance-20261020` delta and
P0 review files against their fixed historical hashes; retaining reference
strings in a later review never substitutes for authenticating those bytes.
Tests reject a stale current pin, substituted inputs, rewritten historical
composition review, erased debt, fabricated activation and relabeled P0.
The new snapshot does not certify installed Foundation, dependency locks,
clean Bun or Node installations, full gates, native CI or runtime qualification.
Those delivery checks still require actual published dependencies and evidence.
