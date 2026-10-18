# Observation 0.1.0: retained candidate archives and external TEST evidence

Status: packed and externally tested candidate; release admission and publication are pending.
These are the exact five archives that passed the bounded Phase 3b consumer. They are retained for the
Phase 3c record route. This preparation does not mark Phase 3a or Phase 3c complete and grants no upload authority.

## Source and preparation

- Repository: `agent-teams-ai/get-modular`.
- Candidate source commit: `3b42d2641055c36c13ff0e2b7fae6cc02a945514` on `release/observation-native-final`.
- Candidate source tree: `790b3eeab17373cede189c185977d23bb03dba1b`.
- Parents: already versioned candidate `34bb4fae3d6a613f13cdbab9ca50b0bfdf4054e7` and fixed implementation
  `3f5f3b303e99e4b8f919486d91d954f7f78e204d`.
- Production source for all five packages is byte-identical to the fixed implementation. The prepared package
  versions and changelogs come from the existing release preparation. No second `release:version` ran.
- The three consumed changesets are `add-observation-package.md`, `require-typescript-seven.md`, and
  `resources-signal-documentation.md`. Their combined preparation is observation 0.1.0, Core/Assembly 0.6.0,
  resources 0.2.0 and conformance 0.4.0. All five are changed release versions; supporting peers are not bumped
  again merely because they are included as TEST inputs.
- Source checkout: `/workspace/scratch/e04865d5cacb/get-modular-release-native`, initially clean, with no
  unrelated primary-checkout files copied into it.
- Toolchain: Node 26.11.1, pnpm 11.20.0, actual TypeScript 7.0.2 for both installed compiler aliases.
  The external runtime rows also use exact Node 24.21.0.
- An offline frozen install passed with strict engine/peer checks and lifecycle scripts disabled.
  The existing `assembly:build`, `resources:build`, `conformance:build`, and `observation:build` commands ran
  sequentially. Each of the five packages was then packed once from that committed head into an empty scratch
  directory. The checkout remained clean after packing. The logs are under [preparation/](preparation/).
- No Foundation CLI or embedded old compiler ran. The isolated source checkout retains the published old
  development dependency as installed data; complete source qualification awaits the separately owned native
  Foundation integration. The external fixture has no Foundation or API Extractor dependency.

Package trees at the packing source commit:

- `packages/core`: `440d8493f2751a2a7130d2fa7f1b9698899cca9e`.
- `packages/assembly`: `d8f7cbf787d516ab27f35a82fc899553e16e83df`.
- `packages/resources`: `781efc2db0e3bbc512f188b8dd5d07edaf5e09ff`.
- `packages/conformance`: `282ae08e56c4a8b1250e0a1e59c7ca43da2a723a`.
- `packages/observation`: `8ea110e7e7c685c9645a0521c02514f45623e89b`.

## Exact retained archives

| Archive | Bytes | SHA-256 | SHA-512 integrity |
| --- | --- | --- | --- |
| `get-modular-core-0.6.0.tgz` | 50850 | `bac6f9e899b235124faf9d8eea9842eaaba5bb1ba543adb626fe21d6e3a5870f` | `sha512-vlctirmR707rIxvPwusOl2NbIQJAFuwOsP0pPnsKPpWgX5u4H3lcydiz2XXhrnnclhcmQDh3y62a4UzqynQ4cw==` |
| `get-modular-assembly-0.6.0.tgz` | 28890 | `ac96072e21d7a6a4264685c25e8c5ee487cbe0302ede58ec384d34ad4ddf8f63` | `sha512-5AplYi/c21aDOwEYCtepl0cd/0xcg2rgz4ALIv5oLtE7DGi0LRvukE3Kst90XDKRaTdhYPHUiS0WWJl0KAhSlA==` |
| `get-modular-resources-0.2.0.tgz` | 14651 | `d9f6363d9c848be90c15e5d20acf07226e3b29ed55ae8af3d6ee0274e5a123d5` | `sha512-kAxL3w1GFIJ3R/IQtlk+OPmDKIcimdB+wWPlntuMLi9XKGaT0hCWLMAvi+B8xbx5dRzFRkc7VhF7zzqKLRtn5Q==` |
| `get-modular-conformance-0.4.0.tgz` | 33463 | `9b0b7c3bd1f64ebed48ddf6ac51782aab0cf70d72a1fb9fac99b591b3ade888b` | `sha512-pmqpUCjX4CqOGYTNRnSD4LX4vAkMVvLw3P1lc1W45kNFIABpbkJa9XcsWgbUQX+JDMHzCryAlGN4ZMIZWd06xg==` |
| `get-modular-observation-0.1.0.tgz` | 32513 | `c06879bcaefcf1b6120f99347502ccd461bd2aa67e93d9c98995cb34fd81b9e1` | `sha512-H3BCrXREaXnYE/MLj87XBuSobg/f8kA3N2sKtfo6NeWVSxIRkI7DA9y9/bTQF46uNzTMzVew6707yNHATRbv2A==` |

Machine-readable identities are in [archive-metadata.json](archive-metadata.json), [SHA256SUMS](SHA256SUMS)
and [INTEGRITY](INTEGRITY). These files describe the retained tested bytes, including the complete support set.

Against candidate `34bb4fa`, Core, Assembly, resources and conformance reproduce their tarballs byte for byte.
Observation changes only `package/dist/features/store/engine.js`; all other 39 members, including all declarations
and its manifest, are identical. This is the reviewed snapshot of live close-report obligations before invoking
an external synchronous reporter. No archive members were added or removed. See
[archive-refresh-comparison.json](archive-refresh-comparison.json).

The established conformance peer-dependency key-order exception was not needed for these five packs.
For a later post-merge comparison, the implementation plan permits that existing exception only for conformance's
known peer-key ordering, with every other member exact. It permits no other unexplained difference or replacement
of the tested bytes by an untested pack.

## Packed manifests

- Assembly depends on exact `@get-modular/core` `0.6.0`.
- Conformance peers are Assembly `^0.6.0`, Core `^0.6.0` and resources `^0.2.0`.
- Observation's sole peer is resources `^0.2.0`.
- Core and resources have no runtime dependencies. The leaves have no runtime dependency additions.
- Every package declares Node `>=24.18.0 <25 || >=26.10.0 <27`.
- Every packed dependency specifier is resolved: no `workspace:`, `link:`, `file:` or `catalog:` remains.
- Every archive contains only its declared `dist` output, license, manifest, changelog and README.

## External consumer on these bytes

The executed consumer commit is `a32f628a11a8cd9e871d985ab09bcfbcaa708b1b`, tree
`2e2f172830c13b4154d825eac4c74d0d0fa0e778`, on `test/observation-native-final` in
`agent-teams-ai/modularity-host-test`. Its input-only commit preceded execution.
The append-only record is `observation-0.1.0/evidence/accepted-a32f628/RECORD.md` in that repository.
The unchanged runner result is copied here as [consumer-result.json](consumer-result.json), SHA-256
`c101422b7e9cd73cff0316cf2aed5ddf5ad998bcdaa6e450daafee6b11fba65e`.

Both Node versions reproduced the committed lock offline with strict engines/peers and scripts disabled.
The unchanged ten-stage route passed on Linux x64, kernel `6.18.55`, with these actual outcomes:

| Gate | Result |
| --- | --- |
| TypeScript 7.0.2, NodeNext | Strict consumer project, `skipLibCheck: false`, passed |
| TypeScript 7.0.2, Bundler | Strict consumer project, `skipLibCheck: false`, passed |
| Runtime emission | Actual pinned TypeScript 7.0.2 passed |
| Node 24.21.0 runtime | Five tests passed, zero failures/skips/cancellations/todo cases |
| Node 26.11.1 runtime | Five tests passed, zero failures/skips/cancellations/todo cases |
| Node 24 writer route | All 33 original outcomes matched: 11 positives, 22 intended negatives |
| Node 26 writer route | All 33 original outcomes matched: 11 positives, 22 intended negatives |
| One unchanged-root smoke on Node 26 | 11 construction/injection rows, all closes complete, settled and debt-free |
| Installed-byte custody | All 176 archive members verified; related peers have physical identity |

The connected experiment observes the independent exact provider/input/root wiring oracle, separate identities
and resource scopes, read-before-await catch-up, an obsolete query that drains separately held cleanup before its
successor, current-result publication, independent closure, suppressed late completion, successful sibling work,
and one attributed callback error with healthy subsequent delivery. Both rows assert asynchronous detection and
pass the installed fire-and-forget echo and CMS testing-import lint predicates. The writer route retains its
original assertions and exact gates, including the unrestricted sessions `rules` plus `behaviour` negative.

Consumer executable source, test oracles, writer manifest, expectations and 78 copied input hashes are unchanged.
Only the observation archive, its lock integrity and the two source-commit references changed before execution.
All 103 files in four older accepted records remain byte-identical. Equal minimum/current compiler aliases are
qualified once per resolver; they are not reported as two distinct compiler versions.

## Owning source qualification retained separately

[owning-source-qualification/observation-native-close-evidence.json](owning-source-qualification/observation-native-close-evidence.json)
binds the actual complete affected route to implementation `3f5f3b303e99e4b8f919486d91d954f7f78e204d`.
Its SHA-256 is `b21ce13535c19071788fa0f8c7a75f749c2f55873da2a4b5a21c4428b724e518`.
The copied original logs retain, on each named Node, 159 runtime tests, 18 assertion-attributed mutations with
zero watchdog detections, all 33 writer outcomes, strict type controls and the packed checks. The same built
outputs were reused on Node 24. This source evidence was not rerun or relabeled as candidate release CI.

## Remaining admission and record steps

These named candidate checks establish Phase 3b evidence. Phase 3a's green exact-head CI and Phase 3c's merge
requirements remain pending. Before upload admission, the release coordinator must finish:

1. Accepted predecessor/main integration and the final native Foundation/toolchain route without weakening the
   existing SDK-growth, CMS, baseline identity or release-owned-file gates.
2. The actual release pull request on the established release branch and green required CI on its exact head.
   This record's local archival branch is not asserted to be that admitted release head.
3. Independent review of the retained evidence, release merge and record pull request/merge on
   `docs/release-archives-observation-0.1.0` through the established route.
4. A fresh post-merge comparison pack against the retained tested archives, respecting only the existing
   conformance peer-key ordering exception. Keep these tested archives as the publication subject.
5. Current registry/version/tag observations, publisher authority, recorded provisional/intended tags and their
   previous targets, and explicit owner upload admission under ADR-0019/ADR-0025/ADR-0030/ADR-0034.

No current registry absence, tag state, full source-architecture verdict, whole CI result, Windows/macOS result,
scale measurement, production adoption or release eligibility is claimed. No main baseline was written.
No npm publication, tag mutation, remote push or main-branch merge occurred during this preparation.

## Owner publication commands after admission

The following commands are preparation for the owner's later admitted release operation. Run them from this
retained archive directory only after the steps above pass. The owner records a release-specific provisional
tag and the intended tag with their prior targets; `GM_PROVISIONAL_TAG` is that recorded provisional tag.
This record does not select or promote `latest` or authorize an unattended publisher.

```sh
shasum -a 256 -c SHA256SUMS
: "${GM_PROVISIONAL_TAG:?set the owner-recorded release-specific provisional tag}"
npm publish ./get-modular-core-0.6.0.tgz --tag "$GM_PROVISIONAL_TAG" --access public
npm publish ./get-modular-assembly-0.6.0.tgz --tag "$GM_PROVISIONAL_TAG" --access public
npm publish ./get-modular-resources-0.2.0.tgz --tag "$GM_PROVISIONAL_TAG" --access public
npm publish ./get-modular-conformance-0.4.0.tgz --tag "$GM_PROVISIONAL_TAG" --access public
npm publish ./get-modular-observation-0.1.0.tgz --tag "$GM_PROVISIONAL_TAG" --access public
```

These five packages have changes in the consumed changesets. No unchanged package outside this set is published.
Before each upload recheck its SHA-256 and recorded SRI. After each upload, the owner verifies registry
`dist.integrity` against `INTEGRITY`, downloads that exact version into an empty directory and verifies archive
SHA-256 and bytes against this record. Stop and reconcile an uncertain or mismatching outcome read-only before
another upload; do not repack, change versions or retry blindly. Intended-tag promotion follows successful
publication completion and the existing owner route, with previous/new targets recorded.

Owner upload admission and publication completion: pending.
