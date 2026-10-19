# Observation 0.1.0: retained release archives

This record retains the five exact archives qualified for Observation 0.1.0,
their checksums, completed source/review/CI and external TEST evidence, the
successful separate post-merge comparison, and the owner's publication handoff.
Npm publication and registry tag promotion have not been performed.

## Scope and authority

This release implements the accepted Observation 0.1 scope: one owner writer,
read-only state facets, authentic snapshots, deferred latest-state observation,
resource-owned subscription lifetimes, serialized latest-only asynchronous loads
and isolated error reporting. Commands and queries use explicit consumer-owned
ports. Host effects, lifecycle policy and cleanup deadlines remain with the Host.

`watch` coalesces changes to current state. This release does not provide lossless
events, replay, actors, network transport, cross-store transactions or a reactive
selector graph. Loader cancellation is cooperative: the returned promise must
include the physical work and cleanup that a successor needs to wait for.

The controlling documents are ADR-0034, the narrowly superseding accepted
ADR-0038 and `research/module-communication-2026-10/implementation-plan.md`,
including its bounded external TEST and Phase 3c owner publication boundary.
Historical evidence and G1 HOLD retain their original scope.

ADR-0038 raises the supported consumer compiler floor to TypeScript 7.0.2 and
coordinates Core/Assembly 0.6.0, resources 0.2.0 and conformance 0.4.0 as support
minors. Observation enters at 0.1.0 and names the resources 0.2 peer. The private
lifecycle candidate remains private at 0.1.0.

## Source, review and required qualification

Implementation [PR #195](https://github.com/agent-teams-ai/get-modular/pull/195)
was normally squash-merged as
`3e595957424ebc8b0211da7ec5926688f0dd41de`, with single parent
`16ad9ca5503d81a0527e8f0a3f5934db6950ceb9` and tree
`72895df33c892182897231e5c4d2e212cc0879cd`. The reviewed source head
`aeeb71fe1c89e0ac390ddcb768cbaffc5d39d74a` has the same tree.

The prerequisite ADR and implementation plan are admitted through
[PR #154](https://github.com/agent-teams-ai/get-modular/pull/154) and
[PR #185](https://github.com/agent-teams-ai/get-modular/pull/185).
ADR-0038 is included in the implementation admission.

Implementation qualification completed the actual `check:changed` route,
which selected the whole `check:fast`, followed by one complete `pnpm check`.
[CI run 39307386426, attempt 1](https://github.com/agent-teams-ai/get-modular/actions/runs/39307386426)
passed all 43 jobs. Each of the six Observation OS/Node cells passed 171 runtime
tests, four evidence tests and one packed-consumer test, with no skipped tests in
those groups. The six cells include actual Node 24.21.0 and 26.11.1 and native
TypeScript 7.0.2 NodeNext/Bundler checks. Existing skips in unrelated suites are
not represented as executed tests.

Independent GPT-6.1 reviews examined the implementation, the plan traceability
and subsequent integration fixes. All actionable findings were addressed before
admission. The final source review covers all 18 production TypeScript files and
the T01-T119 obligations. The final automated Review Router result was explicitly
incomplete (0 of 231 changed files reviewed); it is not an approval. All 36
historical review threads had recorded dispositions and were resolved. Only
Codex Review was excluded under the owner's instruction.

The final release candidate in
[PR #199](https://github.com/agent-teams-ai/get-modular/pull/199) is
`2cd561688bb223f944425718cc093e55ff4bc20d`, with tree
`f04c469d8070a16a6b81c787eab72f2fd483c56b`. Its two parents are the original
generated candidate `9cabbd3892d2015056e8a83e6886674edb4ac298` and the corrected
main `f1a81300881eed64ac1d18e2f36423a24e6ecc34`. The latter is the PR base.
Independent review found no actionable source issue and confirmed the exact
15-path generated diff, whose SHA-256 is
`3b127f0fc39b366e11810dcfba24369da8ce0f4e7e7db7f0d34f6f0edbb8d3bf`.

| Package | Version | Release package tree |
| --- | --- | --- |
| Core | `0.6.0` | `07c13c9fdd7b69282f5b46aabc7c7f410894c70b` |
| Assembly | `0.6.0` | `cd42707e48907a231c46895d247d243579dbc3f6` |
| resources | `0.2.0` | `44aab0974d2f88e30d362f609a5095bd4bbc78bb` |
| conformance | `0.4.0` | `8edceba6669c4202bdb796f7c77bc26c9d20201b` |
| Observation | `0.1.0` | `2c5f9124db7d5f3874994a06d5d9aa883a987c42` |

The fresh frozen installation on that head completed with Node 26.11.1,
pnpm 11.20.0, public Foundation 1.10.0 and native TypeScript 7.0.2.
The installed Foundation manifest SHA-256 is
`24031508a1c4763fbdc6f607538c939af01ee2d12ed325d859144e2f46941215`,
and its public CLI SHA-256 is
`5216fc07dc7c2fe86c1438b43f7d87386c20bcc3b246ee1cc072656ee4b66b0b`.
Both are unchanged from the actual release producer. The required native entry
preflight observed all four compiler/parser/oracle roles at 7.0.2.

The actual `pnpm check:changed` route on this release head selected the complete
`check:fast` and passed with exit 0. It observed 15 committed paths and no staged,
unstaged or untracked source changes; the source stayed clean. The raw route log
SHA-256 is
`2134fa0439fccbfb0ad0c95f28d0ef65ce2563cea32927f180091510bf0ddac1`.
Its visible final Assembly group passed 104/104, without failures, cancellations
or skips. The workflow adapter bounds its stdout tail; earlier individual group
counts are not reconstructed from omitted output.

[CI run 39326807523, attempt 1](https://github.com/agent-teams-ai/get-modular/actions/runs/39326807523)
completed successfully with all 43 jobs. It ran from 21:21:18 UTC to the terminal
run update at 21:48:10 UTC on 2026-10-19. All 37 checkout-bearing jobs used
`6494e139c614ffbc4086ff4b261746012b143a68`, whose parents are the stated base
and head and whose tree equals the release tree. Each of the six packaging cells
passed its strict migration project, all 26 migration tests and an actual
ordinary Foundation exit 0. Each of the six Observation cells passed 171 runtime,
four evidence and one packed-consumer test, with no failures, skips or
cancellations in those groups, on actual Node 24.21.0 or 26.11.1.

The official 549-member log archive SHA-256 is
`3709b75482e75572ba5a2d3dff537257824003a0819ba232a8bd7343037bc689`.
All 43 full-job member hashes and the actual checkout messages were independently
verified. Six Assembly logs retain error-prefixed informational JSON with
selected-source outcome `passed`; their owning suites each passed 104/104.
There is no claim that every raw log lacks error markers.

The current
[Review Router result](https://github.com/agent-teams-ai/get-modular/pull/199#issuecomment-6277725235)
is complete under its policy: 7/15 files reviewed, eight policy-excluded,
zero not reviewed, provider 1/1 and no findings. The complete independent source
review covers all 15 paths. A separate independent closeout verified the current
ordinary result, public producer bytes and required local route without findings.

The normal owner squash of [REL #199](https://github.com/agent-teams-ai/get-modular/pull/199)
completed at `2026-10-19T22:14:37Z`: merge
`10bb2de2880e38398c836f6660244fd4cb665822`, sole parent
`f1a81300881eed64ac1d18e2f36423a24e6ecc34`. Its tree is exactly
`f04c469d8070a16a6b81c787eab72f2fd483c56b`, equal to the reviewed and tested
REL tree. Raw GitHub commit, PR state and main ref were independently read.
The final reviewed PR body SHA-256 is
`c310a54d93d1f86eb57a8f412e340eea9c169bfa4c04d7e1862f8c3d7799966e`.
The natural post-body identity check
[39333304247](https://github.com/agent-teams-ai/get-modular/actions/runs/39333304247)
passed. All 51 current check runs were successful; complete paginated review,
inline comments and review threads contained no outstanding findings. The
complete Router's limited coverage remains stated separately above.

The native public API promotion must retain its physical baseline preimages,
authenticated data request and actual promoted result. Its subsequent complete
ordinary qualification must pass; the promotion result alone is not that pass.
Only the normal public release promoter applies the Core/Assembly baseline
transition on the genuine release branch.

The actual public Foundation 1.10.0 release promoter completed with exit 0,
`outcome: promoted`, `migrationApplied: true` and exactly two replacement writes
on the genuine `changeset-release/main` branch. Its raw result SHA-256 is
`2bf5c54d032a08cebc01595f7ee03874dab7feb74319fe69bfd6796acdcf76ac`;
stderr was empty. The request SHA-256 is
`77f09eccc2bf1f3bedefd34f0def62743e1fd863edbfd71770b1d5ae991aeb0d`,
the 20-asset/four-fixed-file pins SHA-256 is
`e0847814cda59d8ebe3389fcec93e418b4c2975dd29e295b0abc736cf2b593fa`,
and the review digest is
`sha256:7cfd6f58e843fd040525e8d947e06c8aafa19ec0d0d050ef0afd94b8101e2a19`.
The installed producer manifest and public CLI bytes were independently matched
to the authenticated public Foundation 1.10.0 archive.

| Released baseline | Physical preimage SHA-256 | Promoted postimage SHA-256 |
| --- | --- | --- |
| `architecture/public-api/core.json` | `7c9b6fdce722a2ab79243cfd6e9ac22f73b291d776abfcf0b698f292e0578d52` | `b15da5aa6e6400f3ed66578eb9dfa60b58e9646baa0e8dd1aa219f386d589e38` |
| `architecture/public-api/assembly.json` | `6a4a9b02faa93b837e797bbbeeaaa8b0ec968cd7ab968353c4d82a17e3b74c93` | `1373635766498477ac70ba44fcbce83e0e31845c4e9b5c3a826676537649f70e` |

Native historical and release-candidate surfaces are equal except for the
package version: 13 Core items and 65 Assembly items. The retained pre-promotion
observation contains exactly the two expected 0.5.0-to-0.6.0 baseline-version
diagnostics and no artifact diagnostics. Historical Foundation 1.7.4 and its
original preset members were authenticated data inputs only; its runtime graph
was not installed or executed.

The subsequent ordinary qualification on `2cd5616` completed with actual exit 0,
`coverage: full`, all eight capabilities passed and zero errors, warnings, infos
or diagnostics. Its complete report SHA-256 is
`20d86b35f79ae803e2dbbe50332ff14ecbc09d4ae77abe660ef0e03e7443bf8a`;
stderr was empty. The wrapper reported `ordinary-passed` and
`migrationApplied: false`, bound to the same installed public producer, with
SHA-256 `e00dc7fb5f982de765a59696fbc073e60236a1dbb62417b76018bfe54da45e9c`.
This successful ordinary operation did not acquire historical inputs or invoke
the public promoter. It is distinct from the genuine earlier promotion and from
the original failed candidate.

The first genuine release candidate
`9cabbd3892d2015056e8a83e6886674edb4ac298` did not pass qualification.
Its local changed-selected fast route and
[CI run 39316668811, attempt 1](https://github.com/agent-teams-ai/get-modular/actions/runs/39316668811)
exposed two maintained migration tests that incorrectly combined synthetic
historical mismatch reports with the legitimately promoted current baselines.
The ordinary post-promotion capability check was not reached in that local run.
The obsolete hosted attempt ended cancelled after its concrete failures were
retained and the four remaining macOS jobs were normally cancelled: 28 jobs
succeeded, 11 failed and four were cancelled. It is not a successful run or a
qualification of the successor head.
The main-first correction is
[PR #200](https://github.com/agent-teams-ai/get-modular/pull/200): one test file
uses an explicit historical reader for exactly two baseline paths, materializes
those authenticated bytes for the physical drift test and requires each of the
eight existing corruption controls to reject its own intended path. Production
admission, pins and current baselines are unchanged. The failed candidate and
run remain historical failures. During correction qualification,
[PR #198](https://github.com/agent-teams-ai/get-modular/pull/198) independently
advanced main as `eef13520a0c7908ba6c764f8aac8a13862df671a`. Its 24 paths add
consumer-fixture qualification and exact development-only FMS 0.1.1, changing
root manifest, lock and tooling policy without changing the five package trees.
The correction was ordinarily aligned and independently reviewed on that base.
PR #200 was normally squash-merged as
`f1a81300881eed64ac1d18e2f36423a24e6ecc34`, with parent
`eef13520a0c7908ba6c764f8aac8a13862df671a` and tree
`7ff10c78ff70634609e611331b38500a035a8121`. Its reviewed head
`9f96b3edcd34bd310e01ff3c420e5f1c14665440` has the same tree. Its fresh
changed-selected complete fast route passed, and
[CI run 39323144835, attempt 1](https://github.com/agent-teams-ai/get-modular/actions/runs/39323144835)
passed all 43 jobs. All six packaging cells independently passed the 26 migration
tests and all six Observation cells passed their 171/4/1 groups. No such group
had failures, skips or cancellations. The six Assembly logs retain an
error-prefixed informational JSON diagnostic with selected-source outcome
`passed`; each owning suite passed 104/104. The current automated Review Router
was incomplete (0/1), separately from the clean independent source review.

The release continuation preserves the 15 genuinely generated paths and their
original Changesets/public-promoter provenance while integrating the new root
development inputs. Two independent reviews and the delivery owner verified
that Observation's ordinary-main-merge route applies. The old 0.3 train's broad
regeneration predicate is not an imported Observation obligation; this is not
claimed as its narrower "no release input changed" case. The original writer
receipt remains tied to its actual invocation. The final head received its own
required qualification with the new root dependencies before retained packing.

## Retained archives

These five archives were packed once from the clean, reviewed and qualified
`2cd561688bb223f944425718cc093e55ff4bc20d` source on 2026-10-19. Each pack
completed with exit 0. Their SHA-256 and SHA-512 values were independently
verified before the external consumer installation.

| Archive | Bytes | SHA-256 | SHA-512 integrity | Normalized content digest |
| --- | --- | --- | --- | --- |
| `get-modular-core-0.6.0.tgz` | 50852 | `a1a64aeaadf5ae0f9143cf26038853cf42d90b060e083f5ff2f4acf7e2e8d1b0` | `sha512-s7HmZAkQtioOAbUxBbeVgLCpmplDB7J36GdugMU0XkGWOEmNvUeSaLhKZWJ0uB49QDqCPPiXjcDf6EGlSFSXDA==` | `f56b7acf7d6446ee6adae84153850a10a4d003f7c57682e72cde7e8c9167e58a` |
| `get-modular-assembly-0.6.0.tgz` | 28893 | `3330afe53ab9615a1dc81273cf9c45b8b9fb68b1d95571af060971e58a9be606` | `sha512-y7H5RQpwQnKPXoqj/SnUIiOnWMbg/CI4USIUIlL+arkl3+eJncDyLUSikBG0k85vNuv9QuKt3XztpUJK1GvF9Q==` | `5c96d9e9c695fe7e140f2e3950f9344e6e94f42c00ea0e4be81309c82d052a1e` |
| `get-modular-resources-0.2.0.tgz` | 14662 | `2d1aaab67b0002a426fda69b01bda9f7697662ea9685a990b33a12d18658f46b` | `sha512-G8PYU8o/DJTFBQcs9N12CgwxC9PJ+gOqFjariwYCbw+w7vGE+11lU2JiX2QrHBog6VpchKIenIinb7mBJtu/4g==` | `34ba2a0bc918e0441b9654a0a0c753b3e23c421178a034e5cb8b46e04706b0ee` |
| `get-modular-conformance-0.4.0.tgz` | 33467 | `2182cf9702879b2ab78928646db59d91d8a7b128ee870c4b0a2283f51e0d352a` | `sha512-Ienld3tq0+XASpCGnd3fwvZbNxLTrViYspGzYGyu9mJAKnvBQLLoopyj2uumDeo4SJVzTI8Sl2oSFotr+BDslg==` | `810348294d71f8a5dca6bf5ac9a3e74a2d352c3ecd6d6e670c774588c870c28d` |
| `get-modular-observation-0.1.0.tgz` | 33611 | `083bed3ca61e586d6ce91c272be4b4d07c3c68ae00aa9b414febee20e60f1915` | `sha512-df9ki8A5Yi8rKR3SCpNeFwpnXLzSzEeawld8J24IYmxy98xVVr8a7xJCDyV37PBuOJJ10JltyVpmRJDJVsZhyg==` | `c18dd850ed2be412d739ca92f8e2fb1b3b8e80b8a30676c0817306d086285ed0` |

`SHA256SUMS` and `INTEGRITY` contain the same identities in filename order.
Assembly's packed dependency is exactly `@get-modular/core: 0.6.0`.
Conformance's peers are `@get-modular/assembly: ^0.6.0`,
`@get-modular/core: ^0.6.0` and `@get-modular/resources: ^0.2.0`.
Observation's sole peer is `@get-modular/resources: ^0.2.0`. Core and resources
have no runtime dependencies or peers; conformance and Observation have no
runtime dependencies.

All five manifests declare `engines.node` as
`>=24.18.0 <25 || >=26.10.0 <27` and public package identities. They contain no
`workspace:`, `file:`, `link:` or `catalog:` dependency specifiers. Their public
root exports resolve to the packed `dist/index.js` and `dist/index.d.ts`;
Observation additionally exposes the separate `./testing` entry. Outside `dist/`,
each archive contains exactly `LICENSE`, `package.json`, `CHANGELOG.md` and
`README.md`. The regular file counts are Core 52, Assembly 28, resources 16,
conformance 40 and Observation 40.

The TEST input archives are retained unchanged. A fresh post-merge pack is a
comparison subject. Core, Assembly, resources and Observation require identical
archive bytes. All five require identical normalized content. Only the known
conformance peer-key ordering variation may explain a different conformance
archive; an unexplained difference is a failure. Registry read-back after
publication must match the retained bytes for all five packages, including
conformance.

Normalized content sorts all object keys recursively in `package/package.json`,
preserves array order, and serializes with two-space indentation plus one newline.
It then hashes each regular `package/...` file, sorts the relative paths in C
locale, and hashes the concatenated `sha256  relative-path\n` records.

## External TEST and post-merge comparison

Commit the exact five archives and the consumer/writer source inputs in TEST
before running the qualification stages; record that input commit separately
from the resulting observations.

The fresh external input commit is
`44ccd45d952367c9d57a8060f28a65d543dc5f90`, tree
`2ea8638db9294df7c4a68c4be0ee4fbdd71c77f7`, parent
`838f65aa7ac2f7438e827b181c211340107a1987`. It contains the exact five retained
archives above and the pin to REL source `2cd5616`. All 78 copied inputs match
that committed source. The prepared inputs were committed before execution;
a fresh offline frozen install reproduced the exact lock without policy changes.

The unchanged ten-stage route ran once, from `2026-10-19T22:01:28Z` to
`2026-10-19T22:01:41Z`, and all ten stages exited 0 without signals. Node
24.21.0 and 26.11.1 matched; native TypeScript 7.0.2 passed strict NodeNext and
Bundler checks with `skipLibCheck: false`, followed by emit. On each Node,
runtime passed 5/5 and writer/control tests passed 3/3. Each writer run matched
33 expected outcomes: 11 positive and 22 intended negative, with four attributed
diagnostics per resolver. Failures, skips, cancellations and todo counts in
those owning suites were zero. The single unchanged-root smoke passed its
outer test and all 11 expected baseline/injection rows, each complete, settled
and debt-free. Its established projection-abort row remains `failed` as expected.

The connected scenario verifies acquisition-time catch-up, superseded-load
physical cleanup before the successor starts, current-result publication,
independent sibling closure and an exactly attributed callback sentinel.
Independent provider/input/root expectations remain handwritten, separately
from the completed wiring plan. All 176 installed files match the retained
tarballs; related peers resolve to the same physical copies. This evidence is
limited to the named Linux x64 external-consumer rows and the narrow CMS
testing-import source predicate. Production, scale, measurement and complete
source-architecture conformance are not claimed.

The [accepted TEST record](https://github.com/agent-teams-ai/modularity-host-test/blob/83ddc3799180996b24f42cf1abd01f1a034391bf/observation-0.1.0/evidence/accepted-44ccd45/RECORD.md)
and its raw observations are committed as
`83ddc3799180996b24f42cf1abd01f1a034391bf`, tree
`f4fbf32307cc821c626925c08aae4baee7017c8d`, whose parent is the executed input
commit. Result SHA-256 is
`f8151ccd5bc88464718b48226b468e90d79082b9f770017d00a585ab3b4a0ac0`;
lock SHA-256 is
`f0e8345c586db118c1977e374104dc1f99e99d3f31ed1838ac6fe20d9a21854f`.
Independent GPT-6.1 review approved the exact inputs, all 29 new evidence files,
actual runtime results and the complete 30-file result-record delta without
findings. All 25 executed source/config hashes remained unchanged after the
run; all 139 prior evidence files retain their dated historical subjects.

[TEST #20](https://github.com/agent-teams-ai/modularity-host-test/pull/20)
subsequently merged normally at `2026-10-19T22:17:03Z` as
`d0ccb3ee5ceee0f6657c68a68ee39fb87ae5c8cc`, sole parent
`695b91f527b1aa1bea8835a2fdf7e486ff222034`, with the exact evidence tree above.
Six current hosted checks passed, including the final post-ready identity run
[39333352710](https://github.com/agent-teams-ai/modularity-host-test/actions/runs/39333352710).
Cubic's separate check was neutral because its monthly review quota was
exhausted; it supplied no current review and is not counted as approval.
Complete paginated feedback contained no outstanding findings. The passing
committed Phase 3b record existed before REL merge; the TEST PR's subsequent
merge was not an additional prerequisite for REL.

A separate fresh clone of merged source `10bb2de` completed post-merge
comparison at `2026-10-19T22:19:59Z`. Frozen scripts-disabled installation,
four actual native TypeScript 7.0.2 metadata roles, and the existing build
commands passed on Node 26.11.1 / pnpm 11.20.0. `assembly:build` built Core
and Assembly; `resources:build`, `conformance:build` and `observation:build`
completed the five packages. Each package was then packed once into a separate
comparison directory. No versioning, promoter or external TEST was repeated.

| Package | Archive bytes | Exact retained bytes | Normalized content |
| --- | ---: | --- | --- |
| Core 0.6.0 | 50852 | Identical | Identical |
| Assembly 0.6.0 | 28893 | Identical | Identical |
| Resources 0.2.0 | 14662 | Identical | Identical |
| Conformance 0.4.0 | 33467 | Identical | Identical |
| Observation 0.1.0 | 33611 | Identical | Identical |

All five comparison SHA-256, SHA-512 SRI and normalized digests equal the
retained values above. All five package trees match the recorded release
trees. All 176 regular packed files, modes and raw manifests are identical;
per-file differences are zero. The 212 fresh built-inventory hash records
match the retained inventory, including 156 shipped dist payloads checked
against actual archive bytes. The remaining 56 unshipped Core build-output
records are operator evidence, not additional shipped files or an independent
reviewer rebuild. The Conformance peer-key ordering exception was not used.

The comparison operator report SHA-256 is
`419ddd44d455d4cf8460b2ccac1e66cf43b821c63f9a523f73dee916910c0199`.
Independent GPT-6.1 review checked immutable source, both actual archive sets,
normalized records, manifests and the recorded build/pack logs without findings;
its receipt SHA-256 is
`37198f7048ab8445397859ea1e93253dfd0f2180dc7078cc0be80178c8c0315e`.
Fresh clone origin and cleanliness are operator observations; source and
archive equality were independently verified. The original TEST archives,
checksum files and retained handoff remained unchanged. Only those original
TEST bytes are included in this record for the owner's publication.

## Registry state before publication

Read-only npm registry observation: `2026-10-19T22:23:08Z`.

| Package | Complete version inventory | Dist-tags at observation |
| --- | --- | --- |
| Core | 0.1.0, 0.2.0, 0.3.0, 0.4.0, 0.5.0 | `candidate-0-1-0=0.1.0`, `candidate-0-2-0=0.2.0`, `candidate-0-3-0=0.3.0`, `latest=0.4.0`, `next=0.5.0` |
| Assembly | 0.1.0, 0.2.0, 0.3.0, 0.4.0, 0.5.0 | `candidate-0-1-0=0.1.0`, `candidate-0-2-0=0.2.0`, `candidate-0-3-0=0.3.0`, `latest=0.4.0`, `next=0.5.0` |
| Resources | 0.0.0-stage, 0.1.0 | `candidate-0-3-0=0.1.0`, `latest=0.1.0` |
| Conformance | 0.0.0-stage, 0.1.0, 0.2.0, 0.3.0 | `candidate-0-3-0=0.1.0`, `latest=0.2.0`, `next=0.3.0` |
| Observation | Package absent, HTTP 404 | None |

All five proposed versions and the temporary `candidate-observation-0-1-0` tag
were absent. The complete dated snapshot SHA-256 is
`42e43a1b179445750f26b0b4334b9540f2ab6239930bb125782728812ed2d196`.
Check the exact candidate versions immediately before the owner's first upload.
This prior absence is not a reservation or proof of later absence.

## Proposed owner publication

Owner approval and npm publication are pending. Phase 3c ends with this handoff.
From a directory containing the retained archives, verify `SHA256SUMS` and
`INTEGRITY`, then publish with owner authentication in the following order:

```sh
npm publish ./get-modular-core-0.6.0.tgz --tag candidate-observation-0-1-0 --access public
npm publish ./get-modular-assembly-0.6.0.tgz --tag candidate-observation-0-1-0 --access public
npm publish ./get-modular-resources-0.2.0.tgz --tag candidate-observation-0-1-0 --access public
npm publish ./get-modular-conformance-0.4.0.tgz --tag candidate-observation-0-1-0 --access public
npm publish ./get-modular-observation-0.1.0.tgz --tag candidate-observation-0-1-0 --access public
```

An uncertain upload result must be reconciled read-only before any retry or next
upload. Do not replace a retained archive, blindly retry or continue after a
failed publication.

After upload, read each exact version's `dist.integrity` and download the registry
archive into an empty directory. Match its recorded SHA-512 integrity and exact
SHA-256 bytes, including conformance. Retain the result before promoting any tag.
Run and record the applicable final consumer check using those downloaded
registry archives; a failure leaves publication incomplete and blocks promotion.

After complete read-back, the final downloaded-byte consumer check and an
explicit durable owner promotion intent, the proposed tags are
Core/Assembly/resources/conformance on
`next` and Observation on `latest`. Resources 0.2.0 is a support minor, so the old
resources 0.1.1 patch's publication authority does not authorize replacing
resources `latest`. `next` is a registry alias; it is not a quarantine or a
qualification claim.
Record previous and intended tag targets in the durable owner intent and
reconcile the observed targets after promotion.

## Owner publication approval

Pending. No npm upload, dist-tag change, Git release tag or GitHub release is
performed by this record.
