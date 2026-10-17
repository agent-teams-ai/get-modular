# Get Modular 0.5.0 train: retained release archives (R-1a)

Status: packed and retained; not yet published. Publication to the dist-tag `next` (Core 0.5.0, Assembly 0.5.0, conformance 0.3.0) is an owner step with the passkey. Resources 0.1.0 is unchanged and stays `latest`.

## Source

- Repository: `agent-teams-ai/get-modular`.
- Source commit `74ce8cf14695660926fdc5575d8f4d957535213a` (REL head at packing time, PR #178), tree `8fbcefe9b8a39f20c76876be04a1e9d3c21dd55b`; merged as `99816e452630715558306db2370baa2af49575e6` (squash, single parent `a6fb86398c7112b8b4da59676f5d1b658e365b25`, tree `8fbcefe9b8a39f20c76876be04a1e9d3c21dd55b`, equal to the source tree). REL base: main `a6fb86398c7112b8b4da59676f5d1b658e365b25` (with #179).
- Review: an independent re-review of `74ce8cf` was clean (APPROVE) before the merge.
- Source check (6.4) on the merged commit `99816e452630715558306db2370baa2af49575e6`: a fresh pack of the four packages produced bytes identical to `SHA256SUMS` for all four archives (this time the conformance pack was byte-identical too; its normalized content digest equals the value below). The four package trees equal those at the source commit.
- Package trees: `packages/core` `a26b522cc90921abe4785d0d296831c281c12e40`, `packages/assembly` `89a80a95c492383eacc9002bc8245d84ccc6864c`, `packages/resources` `754d4b109508f9ede194d9a383596ecda4a552dc`, `packages/conformance` `c5fcc68763ae5dd7a1d02f169bddaf510b552af9`.
- Toolchain: Node 26.11.1 (`.node-version`), pnpm 11.20.0 (`packageManager`). The 0.4.0 train packed on Node 24.21.0; `.node-version` moved to 26.11.1 in between (#168).
- CI on the exact source: [run 38965526787](https://github.com/agent-teams-ai/get-modular/actions/runs/38965526787) (all required checks, the Node 24 lanes and `Node 24 package root compatibility` passed).
- Resources 0.1.0 is not part of this release. Its archive is a byte copy of the retained `research/releases/0.4.0-train/get-modular-resources-0.1.0.tgz` (the package tree is unchanged).

## Archives

| Archive | Bytes | SHA-256 | SHA-512 integrity | Normalized content digest |
| --- | --- | --- | --- | --- |
| `get-modular-core-0.5.0.tgz` | 50256 | `7943f054427282b68cd57e3f790acca62e14cbae67ea62b227f363a8d2614328` | `sha512-B7DuUnplex2C67g5OUj5e/AbgrVndH+cEPb74foNMaVWw4qdMmUt8c9pcvlrHVpcTvHBMraA0JIXYO2NI2Q+wA==` | `b257bd619e75e10d29f667f47dd0d22b73416eabcaf4ca700c701264bf2684a1` |
| `get-modular-assembly-0.5.0.tgz` | 28311 | `6112f57755ff9cf3f7b3379b8f932421499cf5db3320b7e4c3aefd998ec36862` | `sha512-9huRWsDE7TZAWA4AV5D2kbC3eWjoyQrKGi0DTum9LcmuFrjDd4XR9hOYEDaq4H/9OCcOByyiJCmxCtd4DTqM5w==` | `1eb1baa7854a8d86853fe21c147bddad110431fbd46f2d2c3572544a295427a5` |
| `get-modular-resources-0.1.0.tgz` | 13816 | `1172c89d9f863d0e1763293eb6153d0835c609fc01ea730004fcee293872cc7a` | `sha512-sIC+ZYI196qK11Dmz9s9U/Va4UAOU5G8m9beCp3zIIbEK0fKLAWGssd4l72aS0ycRBi5AhsbKFysKS9EVVax8g==` | `33639ca033d7f98ff43729834419972cd43556f2d0d3c822dc2b8def69c91609` |
| `get-modular-conformance-0.3.0.tgz` | 32835 | `6063497db4d4aabdae82e94bd689140ff080d96b5ff13c817f8385900c3249bf` | `sha512-IyWvkkIhIbWtDyiL4OIHcO3hSEh4Uz2SVnI3vaeEeh46dM9bFYhwyIa1B0MxIwC5Jkm01FDB1MgGGUnLqv5UuQ==` | `11796242f0dbf69807727d7f335833931fb843fe84b4cc7f20fc2b7817391f00` |

Machine-readable copies: `SHA256SUMS` and `INTEGRITY` in this directory.

pnpm 11.20.0 can pack the conformance archive non-deterministically (the order of its three `peerDependencies` keys varied in the 0.4.0 train), so compare other conformance packs by the normalized content digest. These retained bytes are the reference. Never re-pack to verify.

## Core 0.5.0 against the published 0.4.0

Core 0.5.0 is the exact-pair alignment with Assembly 0.5.0 (ADR-0027, ADR-0036). Every file under `dist/` is byte-identical to the retained Core 0.4.0 archive; only `package.json` (version), `CHANGELOG.md` and `README.md` (the Node 26 default toolchain wording from #168) differ. The public API baseline `architecture/public-api/core.json` changes only `packageVersion`.

## Packed manifests

- Assembly `dependencies` are exactly `{"@get-modular/core": "0.5.0"}`.
- Conformance `peerDependencies` are exactly `@get-modular/assembly` `^0.5.0`, `@get-modular/core` `^0.5.0` and `@get-modular/resources` `^0.1.0`.
- Resources and conformance have no `dependencies`; core has none either.
- `engines.node` is `>=24.18.0 <25 || >=26.10.0 <27` in all four.
- No `workspace:`, `link:`, `file:` or `catalog:` specifier in any manifest.
- Outside `dist/`, each archive holds exactly `package/LICENSE`, `package/package.json`, `package/CHANGELOG.md` and `package/README.md`.

## Registry state before publication (read 2026-10-17)

- `@get-modular/core`: versions `0.1.0` to `0.4.0`; dist-tags `latest=0.4.0`, `next=0.4.0`, `candidate-0-1-0=0.1.0`, `candidate-0-2-0=0.2.0`, `candidate-0-3-0=0.3.0`.
- `@get-modular/assembly`: the same versions and dist-tags as core.
- `@get-modular/resources`: versions `0.0.0-stage`, `0.1.0`; dist-tags `latest=0.1.0`, `candidate-0-3-0=0.1.0`.
- `@get-modular/conformance`: versions `0.0.0-stage`, `0.1.0`, `0.2.0`; dist-tags `latest=0.2.0`, `next=0.2.0`, `candidate-0-3-0=0.1.0`.
- No 0.5.0 (core, assembly) or 0.3.0 (conformance) version exists, and no unexpected tag (ADR-0027).

## Proposed publication (owner only)

From a directory holding the retained archives, in this order, with web authentication and the passkey:

```sh
npm publish ./get-modular-core-0.5.0.tgz --tag next --access public
npm publish ./get-modular-assembly-0.5.0.tgz --tag next --access public
npm publish ./get-modular-conformance-0.3.0.tgz --tag next --access public
```

Resources is not published. Read-back afterwards, for core, assembly and conformance:

1. `npm view @get-modular/<package>@<version> dist.integrity` equals its `INTEGRITY` line.
2. `npm pack @get-modular/<package>@<version> --pack-destination <empty dir>` for each of the three, then `grep -v resources SHA256SUMS | (cd <empty dir> && shasum -a 256 -c -)` passes (the conformance bytes match exactly, not only by the normalized digest). Resources is not published, so its line is left out.

An uncertain result is reconciled read-only, never retried blindly. Stop after a failed publish: do not publish the next package until the state is reconciled. Promotion to `latest` is a separate owner step after the TEST migration (P6) merges.

## Consumer checks on these bytes

Pending. They run in a TEST branch of modularity-host-test on the retained archives; the result is recorded here by the record PR after publication. Publication waits for the TEST consumer check on these bytes.

## Owner publication approval

Pending.
