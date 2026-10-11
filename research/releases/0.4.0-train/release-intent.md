# Get Modular 0.4.0 train: retained release archives (R-1a)

Status: retained, awaiting owner review. Nothing is published.

## Source

- Repository: `agent-teams-ai/get-modular`.
- Source commit `269f02c67aa0091d12c3f47a3cec4cb52bb2720d` (REL head at packing time, PR #165), tree `0db42a5187f2d228cc71e714c6dc610fb12ad9d5`; merged as (filled in after the merge). REL base: main `d9f6277ad97090a8f7f3823b3877f457d7032d35`.
- Source check (6.4) on later REL heads: none yet.
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

## Packed manifests

- Assembly `dependencies` are exactly `{"@get-modular/core": "0.4.0"}`.
- Conformance `peerDependencies` are exactly `@get-modular/assembly` `^0.4.0`, `@get-modular/core` `^0.4.0` and `@get-modular/resources` `^0.1.0`.
- Resources and conformance have no `dependencies`; core has none either.
- `engines.node` is `>=24.18.0 <25 || >=26.10.0 <27` in all four.
- No `workspace:`, `link:`, `file:` or `catalog:` specifier in any manifest.
- Outside `dist/`, each archive holds exactly `package/LICENSE`, `package/package.json`, `package/CHANGELOG.md` and `package/README.md`.

## Registry state (read 2026-10-11)

- `@get-modular/core`: versions `0.1.0`, `0.2.0`, `0.3.0`; dist-tags `latest=0.3.0`, `candidate-0-1-0=0.1.0`, `candidate-0-2-0=0.2.0`, `candidate-0-3-0=0.3.0`.
- `@get-modular/assembly`: the same versions and dist-tags as core.
- `@get-modular/resources`: versions `0.0.0-stage`, `0.1.0`; dist-tags `latest=0.1.0`, `candidate-0-3-0=0.1.0`.
- `@get-modular/conformance`: versions `0.0.0-stage`, `0.1.0`; dist-tags `latest=0.1.0`, `candidate-0-3-0=0.1.0`.

## Proposed publication (owner only)

Publish Core, Assembly and conformance in this order: `npm publish ./<archive> --tag candidate-0-4-0 --access public`. Resources is not published (0.1.0 stays). Then a read-back of `dist.integrity` and a byte comparison of the downloaded tarball; `latest` only after all three.
An uncertain result is reconciled read-only, never retried blindly.

## Consumer checks on these bytes

| Check | Result | Evidence |
| --- | --- | --- |
| TEST project | pending | |
| agent-runtime draft branch | pending | |
| Node 26.10+ consumer | pending | |

## Owner publication approval

Pending.
