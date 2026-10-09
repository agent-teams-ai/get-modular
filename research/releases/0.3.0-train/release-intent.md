# Get Modular 0.3.0 train: retained release archives (R-1a)

Status: retained, awaiting owner review. Nothing is published.

## Source

- Repository: `agent-teams-ai/get-modular`.
- Source commit `9e529d69150c1738c29d56a05de7cada60547808` (final head of REL PR #150), tree `af44844998d44e5d6ce3477c5bbae12ec1cf4bce`; merged as `<40 hex>` (filled in after the merge).
- Source check (6.4) on later REL heads: `87cb92324f1de7a0b5fd5631ac46f1f58002fde2` passed (Core, Assembly and resources byte-identical to `SHA256SUMS`; all four normalized content digests equal).
- Package trees: `packages/core` `9fb434c6f1b00959ec607bcd753fac2d11ce425f`, `packages/assembly` `3a941f9f3ede53e97f24707e2e8c443eb854846e`, `packages/resources` `33ce8d44e61856c1748f3ded62d632324d2cc149`, `packages/conformance` `c6fcc28e8491235fbac1cecfd15667e1b66b847f`.
- Toolchain: Node 24.21.0, pnpm 11.20.0.
- CI on the exact source: [run 37809117234](https://github.com/agent-teams-ai/get-modular/actions/runs/37809117234) (attempt 2; all required checks and `node-26-compatibility` passed; attempt 1 had one infrastructure timeout in `check lane (windows-2025, packaging)`, see PR #150).

## Archives

| Archive | Bytes | SHA-256 | SHA-512 integrity | Normalized content digest |
| --- | --- | --- | --- | --- |
| `get-modular-core-0.3.0.tgz` | 50039 | `bd84c087c7d6842907d08a1a2f6dc0afd250e297f9456e0f77b87630e0f5093e` | `sha512-we9Sr1pU+mK7MPDF1tZc9b9SC+wBp0bzIeahmaESXFplILfgE16avp+j2e3Zl7mYd9LyCeQk1c21UyGkd0p8RQ==` | `166101ba08bb0582e51f81691b4ee49f12d3cc475a7454dfcee977341481f982` |
| `get-modular-assembly-0.3.0.tgz` | 20633 | `3a4312465485269971db08efb10759fb3a3d4d23266c7f5d9fe8069b4bb411c8` | `sha512-41GrHEavrA6BHeVassm5H/Nx3Av8nNIui5ShfiiTYxios100/Fj2bXI9ZiSyz8FiLT5VMv3SEVmoiO6UcRudeA==` | `6a9a6bf91e21a7c309abecf7eedcad6c41bf7352c4db32f51c9c80b8648c55c8` |
| `get-modular-resources-0.1.0.tgz` | 13816 | `1172c89d9f863d0e1763293eb6153d0835c609fc01ea730004fcee293872cc7a` | `sha512-sIC+ZYI196qK11Dmz9s9U/Va4UAOU5G8m9beCp3zIIbEK0fKLAWGssd4l72aS0ycRBi5AhsbKFysKS9EVVax8g==` | `33639ca033d7f98ff43729834419972cd43556f2d0d3c822dc2b8def69c91609` |
| `get-modular-conformance-0.1.0.tgz` | 16412 | `7923297944b83ee7a800742aac8474aae42e8708d8ca166fa7ce3f80fe6e0039` | `sha512-yIxQqJd/RRIxtO3uoo3MQXNdfeMk96qjzzW3ggfxTyfg9/UDUl7qfB3nOTWVkDN+Zg/gLFY+24grd1zGUQSWmw==` | `12e038529fdd4441d901bbf58448ee60e43760e0cd3ea823f22e61d703eff356` |

Machine-readable copies: `SHA256SUMS` and `INTEGRITY` in this directory.

pnpm 11.20.0 packs the conformance archive non-deterministically (the order of its three `peerDependencies` keys varies), so its SHA-256 and integrity differ between packs of the same tree. These retained bytes are the reference. Never re-pack to verify; compare other conformance packs only by the normalized content digest. Core, Assembly and resources pack byte-identically.

## Packed manifests

- Assembly `dependencies` are exactly `{"@get-modular/core": "0.3.0"}`.
- Conformance `peerDependencies` are exactly `@get-modular/assembly` `^0.3.0`, `@get-modular/core` `^0.3.0` and `@get-modular/resources` `^0.1.0`.
- Resources and conformance have no `dependencies`; core has none either.
- `engines.node` is `>=24.18.0 <25 || >=26.10.0 <27` in all four.
- No `workspace:`, `link:`, `file:` or `catalog:` specifier in any manifest.
- Outside `dist/`, each archive holds exactly `package/LICENSE`, `package/package.json`, `package/CHANGELOG.md` and `package/README.md`.
- All four normalized content digests equal the values in the PR #150 description, and core, assembly and resources also equal its SHA-256 values.

## Registry state (read 2026-10-08)

- `@get-modular/core`: versions `0.1.0`, `0.2.0`; dist-tags `latest=0.2.0`, `candidate-0-1-0=0.1.0`, `candidate-0-2-0=0.2.0`.
- `@get-modular/assembly`: versions `0.1.0`, `0.2.0`; dist-tags `latest=0.2.0`, `candidate-0-1-0=0.1.0`, `candidate-0-2-0=0.2.0`.
- `@get-modular/resources`: E404 (not published).
- `@get-modular/conformance`: E404 (not published).

## Proposed publication (owner only)

Order Core, Assembly, resources, conformance; `npm publish ./<archive> --tag candidate-0-3-0 --access public`;
read-back of `dist.integrity` and a byte comparison of the downloaded tarball; `latest` only after all four.
An uncertain result is reconciled read-only, never retried blindly.

## Consumer checks on these bytes

| Check | Result | Evidence |
| --- | --- | --- |
| TEST-1 | passed | [modularity-host-test PR #16](https://github.com/agent-teams-ai/modularity-host-test/pull/16), reviewed head `822988b05580b03c62486fabfd28a7214859817a`: independent review clean on 2026-10-09, CI green; Linux evidence archive SHA-256 `dee2029d575212ef8fa257a3f0116b8244afed031b4057d011d290d9d358e877`; 184 of 184 tests; mutants M1-M9 as expected; tested on the four retained archives of source `9e529d69150c1738c29d56a05de7cada60547808` |
| agent-runtime draft branch (all four archives, including conformance) | not run | The owner decided on 2026-10-09 that TEST-1 and the Node 26.10+ check are sufficient for publication; the Agent Runtime migration lands as AR-1a to AR-2 on the published versions |
| Node 26.10+ consumer | passed | `tests/node-runtime-compatibility.test.mjs` at source `9e529d6` with the retained archives: Node v26.11.0, pnpm 11.20.0, 3 of 3 tests passed, exit 0 (2026-10-09) |

## Owner publication approval

Approved by the owner on 2026-10-09 (publish after TEST-1 and Node 26.10+); npm publication requires the owner's interactive confirmation.
