# Module resource contract critique evidence

Retained, non-authoritative research inputs and four read-only hosted results.
These copies do not replace the canonical Consumer Module Standard or admit a runtime package.

Requested profile for each job: `gpt-6.1-sol`, `max`, `priority` (fast).
Host: `workers-fsn1-01`. Workstream: `agent-runtime/architecture-research-20260928`.
All four jobs completed; source changes are empty. No runtime/build/test execution.

| Lane | Result | Original remote result SHA-256 | Retained export SHA-256 |
| --- | --- | --- | --- |
| hierarchy | [ar-research-module-hierarchy-maxfast-20261001](hierarchy.json) | `203d8a86bc949787d7fd27b1e7468d1872f74cfefb48563f3844539da564abdb` | `a757f7cae69b7fb2fccaef7ac5bc056cea8464376aeb32bc4fda90047184d528` |
| ergonomics | [ar-research-module-ergonomics-maxfast-20261001](ergonomics.json) | `cb510f7ffe67b7ae88095b704846490d935bdd9c4202fdd09f87e24c41451f14` | `424fa446c58b324a148f21b0576d5ae33ef1d47ff55e2c2d3ea1593e30d6d6b4` |
| async | [ar-research-module-async-maxfast-20261001](async.json) | `1cc0d8853f0cb692ab9c319969c6e476a829a01a7662dc7dcd59494e90ce4dd1` | `2b845911302f08b010ffa5b6b8b88d6026940754cea85850029e35a528b83d82` |
| industry | [ar-research-module-industry-maxfast-20261001](industry.json) | `0619d0885e492c58bb2ccd01ff9090727d99bb2dff2bd3dca418052e14f2040e` | `8da1a5fee149e2d670951049521165f34ac31b827eb6281b23f8b9739e1036f3` |

Each result file is a serialized export wrapper containing `result`, the original remote
result hash and requested profile. Its own hash differs from the remote raw result bytes.
Remote raw hashes are retained identity observations, not reconstructed byte equality.

[Source identities](source-identities.json) fix all eight retained input hashes.
The `inputs/` copies match those hashes. Earlier research and ADR copies retain their
historical wording; the current proposed API is in the [synthesis](../../shared-module-resource-contract-2026-10-01.md).

Workers used retained primary-source excerpts because their network allowlist blocked
fresh external browsing. The primary agent supplemented primary sources as recorded
in the synthesis. Neither source comparison nor four critiques proves implementation
correctness, absence of native resource leaks, production adoption or release readiness.
