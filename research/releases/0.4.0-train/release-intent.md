# Get Modular 0.4.0 train: retained release archives (R-1a)

Status: published to npm on 2026-10-11 under dist-tag `next` (Core 0.4.0, Assembly 0.4.0, conformance 0.2.0) and promoted to `latest` the same day (about 13:05 UTC). Resources 0.1.0 is unchanged and stays `latest`.

## Source

- Repository: `agent-teams-ai/get-modular`.
- Source commit `269f02c67aa0091d12c3f47a3cec4cb52bb2720d` (REL head at packing time, PR #165), tree `0db42a5187f2d228cc71e714c6dc610fb12ad9d5`; merged as `ab288b2f800a8082aa39b6daef6037df550147e1` (squash, single parent, tree `0db42a5187f2d228cc71e714c6dc610fb12ad9d5`, equal to the source tree). REL base: main `d9f6277ad97090a8f7f3823b3877f457d7032d35`.
- Review: An independent delta review of `269f02c` ran before packing and was clean: it reproduced the regeneration byte for byte, all 27 `pnpm check` steps passed, and CI run 38124380389 was green. The 6.2 precondition (clean review and green CI on the exact head) was met.
- Source check (6.4) on the merged commit `ab288b2f800a8082aa39b6daef6037df550147e1` passed (Node 24.21.0, pnpm 11.20.0, `.node-version` and `packageManager` unchanged): Core and Assembly packs are byte-identical to `SHA256SUMS`; the resources pack equals the retained 0.3.0 bytes; the conformance normalized content digest equals `95ff4d6a3965dae2a0d86fa10fffc254bb17f5bfecaa2527b5eea4491c3d4d0d`. All four package trees equal those listed below.
- Package trees: `packages/core` `4de51f6b5e943cf45e4873710a9c4483de73b739`, `packages/assembly` `3ca9976dba8613a5541e3506388e43a5153e585c`, `packages/resources` `33ce8d44e61856c1748f3ded62d632324d2cc149`, `packages/conformance` `c4ec60aed7971aef4082d108a888b43fe425cf4f`.
- Toolchain: Node 24.21.0, pnpm 11.20.0.
- CI on the exact source: [run 38124380389](https://github.com/agent-teams-ai/get-modular/actions/runs/38124380389) (all required checks and `Node 26 package root compatibility` passed).
- Resources 0.1.0 is not part of this release. Its archive is a byte copy of the retained `research/releases/0.3.0-train/get-modular-resources-0.1.0.tgz` (the package tree is unchanged since that train).

## Archives

| Archive | Bytes | SHA-256 | SHA-512 integrity | Normalized content digest |
| --- | --- | --- | --- | --- |
| `get-modular-core-0.4.0.tgz` | 50257 | `b986c8f1e8b7e08da695e6991016a6eda8587dfff6835a96da8af26aa86bc358` | `sha512-AzQWfqj/lHZz7C391hQo5ruM/1B8m7YnW+VQ6V4cAsnTANhw2VDKvHz4oLRcptT12LyMsvEY29OJbJqkrc3YGg==` | `8b45d85eb1a972887fef5e7b49bf1f75e7b6510ef5a8b72cd61285f46158bc02` |
| `get-modular-assembly-0.4.0.tgz` | 23856 | `8aaa5810a2a5ac11b6f63bcd1d81c38c8f1cb06a3b58379ca1471ccdf985b3dd` | `sha512-8gCPsPPy1uv3fngKTMmy5BEDDW2S9Afn1hzBs8ICtEOn8Oc1bJ9XTQiuSopH23TGN1W369ez9396jEa+KXaLzw==` | `13eaaceaf1d074cbd6c85430c1f95b38ba98963743d4e1064c6babaed26330fe` |
| `get-modular-resources-0.1.0.tgz` | 13816 | `1172c89d9f863d0e1763293eb6153d0835c609fc01ea730004fcee293872cc7a` | `sha512-sIC+ZYI196qK11Dmz9s9U/Va4UAOU5G8m9beCp3zIIbEK0fKLAWGssd4l72aS0ycRBi5AhsbKFysKS9EVVax8g==` | `33639ca033d7f98ff43729834419972cd43556f2d0d3c822dc2b8def69c91609` |
| `get-modular-conformance-0.2.0.tgz` | 18523 | `0708bc299d1015d9c6d2c14ca827b2fd27f47cc749e11cbb847c0190780eda61` | `sha512-2DFUfAVsNc/VlDKeAt7iTtkQZopDeu5eiKl9EESr35nvfduIwwd0bdmKuOm3u3Iodeiv74kOv69InrEbfmQ9FA==` | `95ff4d6a3965dae2a0d86fa10fffc254bb17f5bfecaa2527b5eea4491c3d4d0d` |

Machine-readable copies: `SHA256SUMS` and `INTEGRITY` in this directory.

pnpm 11.20.0 packs the conformance archive non-deterministically (the order of its three `peerDependencies` keys varies), so its SHA-256 and integrity differ between packs of the same tree (an earlier pack of this tree had 18525 bytes and SHA-256 `b52b20ef...`). These retained bytes are the reference. Never re-pack to verify; compare other conformance packs only by the normalized content digest. Core, Assembly and resources pack byte-identically.

The four normalized content digests equal the values in the PR #165 description; Core, Assembly and resources also equal its SHA-256 values.

## Core 0.4.0 against the published 0.3.0

Core 0.4.0 carries internal hardening from the Node 26 qualification (#149). Three `dist` files differ from the published 0.3.0 archive: `features/composition-semantics/graph-components.js`, `features/composition-semantics/selected-graph.js` and `features/raw-scanner/owned-iterative/scanner.js`. Every `.d.ts` is byte-identical, and the public API baseline `architecture/public-api/core.json` changes only `packageVersion`.

## Core changesets (restore verbatim on a regeneration)

These two files were created in the release worktree and consumed by the version step; they are not in git. Each file ends with one newline.

`.changeset/core-0-4-0-pair.md`:

````markdown
---
"@get-modular/core": minor
---

Align Core with Assembly 0.4.0 under the exact-pair rule (ADR-0027, ADR-0035). No API or behavior change.

Authoring surface changed: no
````

`.changeset/core-internal-hardening.md`:

````markdown
---
"@get-modular/core": patch
---

Internal hardening carried from the Node 26 qualification (#149): the composition-semantics graph and selected-graph checks compare their `Uint8Array` marks explicitly with 1, and the owned raw scanner returns an invalid token when asked to read past the input. Observable behavior, declarations and the public API are unchanged.

Authoring surface changed: no
````

## Packed manifests

- Assembly `dependencies` are exactly `{"@get-modular/core": "0.4.0"}`.
- Conformance `peerDependencies` are exactly `@get-modular/assembly` `^0.4.0`, `@get-modular/core` `^0.4.0` and `@get-modular/resources` `^0.1.0`.
- Resources and conformance have no `dependencies`; core has none either.
- `engines.node` is `>=24.18.0 <25 || >=26.10.0 <27` in all four.
- No `workspace:`, `link:`, `file:` or `catalog:` specifier in any manifest.
- Outside `dist/`, each archive holds exactly `package/LICENSE`, `package/package.json`, `package/CHANGELOG.md` and `package/README.md`.

## Registry state before publication (read 2026-10-11)

- `@get-modular/core`: versions `0.1.0`, `0.2.0`, `0.3.0`; dist-tags `latest=0.3.0`, `candidate-0-1-0=0.1.0`, `candidate-0-2-0=0.2.0`, `candidate-0-3-0=0.3.0`.
- `@get-modular/assembly`: the same versions and dist-tags as core.
- `@get-modular/resources`: versions `0.0.0-stage`, `0.1.0`; dist-tags `latest=0.1.0`, `candidate-0-3-0=0.1.0`.
- `@get-modular/conformance`: versions `0.0.0-stage`, `0.1.0`; dist-tags `latest=0.1.0`, `candidate-0-3-0=0.1.0`.

## Publication

The owner published the retained archives on 2026-10-11 with `npm publish ./<archive> --tag next --access public`, in the order Core, Assembly, conformance (web authentication with a passkey). Resources was not published; 0.1.0 stays. Registry publish times:

| Package | Version | Published (UTC) | Registry `dist.integrity` |
| --- | --- | --- | --- |
| `@get-modular/core` | 0.4.0 | 2026-10-11 12:15:02 | `sha512-AzQWfqj/lHZz7C391hQo5ruM/1B8m7YnW+VQ6V4cAsnTANhw2VDKvHz4oLRcptT12LyMsvEY29OJbJqkrc3YGg==` |
| `@get-modular/assembly` | 0.4.0 | 2026-10-11 12:15:57 | `sha512-8gCPsPPy1uv3fngKTMmy5BEDDW2S9Afn1hzBs8ICtEOn8Oc1bJ9XTQiuSopH23TGN1W369ez9396jEa+KXaLzw==` |
| `@get-modular/conformance` | 0.2.0 | 2026-10-11 12:17:32 | `sha512-2DFUfAVsNc/VlDKeAt7iTtkQZopDeu5eiKl9EESr35nvfduIwwd0bdmKuOm3u3Iodeiv74kOv69InrEbfmQ9FA==` |

Read-back (2026-10-11, read-only): each registry `dist.integrity` equals its line in the `INTEGRITY` file. The tarballs downloaded with `npm pack @get-modular/<package>@<version>` are byte-identical to the retained archives (`shasum -a 256 -c SHA256SUMS` passed for Core, Assembly and conformance; the conformance bytes also match exactly, not only by the normalized digest). Resources is not on the registry at a new version (`0.0.0-stage`, `0.1.0`).

Dist-tags right after publication:

- `@get-modular/core` and `@get-modular/assembly`: `latest=0.3.0`, `next=0.4.0`, plus the older `candidate-*` tags.
- `@get-modular/conformance`: `latest=0.1.0`, `next=0.2.0`, `candidate-0-3-0=0.1.0`.
- `@get-modular/resources`: `latest=0.1.0`, `candidate-0-3-0=0.1.0`.

## Promotion to `latest`

The condition was met first: modularity-host-test #17 (consuming the published bytes) merged as `695b91f5`. Then the owner promoted `latest` for Core, Assembly and conformance together on 2026-10-11, at about 13:05 UTC (web authentication with a passkey). Read back from the registry afterwards:

- `@get-modular/core`: `latest=0.4.0`, `next=0.4.0`, `candidate-0-3-0=0.3.0`.
- `@get-modular/assembly`: `latest=0.4.0`, `next=0.4.0`, `candidate-0-3-0=0.3.0`.
- `@get-modular/conformance`: `latest=0.2.0`, `next=0.2.0`, `candidate-0-3-0=0.1.0`.
- `@get-modular/resources`: `latest=0.1.0`, unchanged.

## Consumer checks on these bytes

| Check | Result | Evidence |
| --- | --- | --- |
| TEST (modularity-host-test #17) | passed | Installed the exact R-1a archives from #167 and `pnpm evidence` was accepted: at head `5e8b1b7` on Node 24.21.0 and pnpm 11.20.0 (189 of 189 tests), and again at head `933bf9b` on Node 26.11.1 after the TEST default Node moved. Signed off on 2026-10-11 under the owner's delegation, as recorded in the PR #165 description. |
| agent-runtime draft branch | not applicable | By owner decision (2026-10-11) agent-runtime skips 0.4.0 and adopts Get Modular 0.5.0 directly from 0.3.0. |
| Node 26.10+ consumer | passed | The TEST run at `933bf9b` on Node 26.11.1 (see the TEST row). |

TEST stays on the retained archives by design (its evidence signs archive bytes, as in the 0.3.0 train). Those archives are byte-identical to the published packages (same integrity, see Publication), so the check holds for the published bytes.

## Owner publication approval

Publication of the three archives under `next` and the promotion to `latest` were done by the owner on 2026-10-11.
