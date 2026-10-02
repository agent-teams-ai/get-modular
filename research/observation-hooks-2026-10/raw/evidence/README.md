# Lifecycle hooks research: independent critique evidence

Status: **four read-only hosted critiques complete; research revised to
revision 2, then to revision 3 after owner decisions and code-validated critiques,
then to revision 4 after research round 4.** Experimental research only. No implementation, ADR acceptance,
consumer migration, G1/K1 change, production adoption or release follows.

- Revised document: [lifecycle-hooks-research-2026-10-01.md](../../design.md).
- Revision 1, byte-identical: [revision-1.md](../revisions/revision-1.md),
  SHA-256 `3709c3a7e46d6696a419716736f014e528a69f07bdc0cfb5ce81128270c1f337`.
- Revision 2 (redacted copy, see the archive README): [revision-2.md](../revisions/revision-2.md),
  original SHA-256 `eee3f3428de5dba960e051d6475c3894cf847d2aca0d801807fff3240b57e009`.
- Revision 3 (redacted copy, see the archive README): [revision-3.md](../revisions/revision-3.md),
  original SHA-256 `9754799bd225a86c796f3af4439f641fecdc2d0f385864668655d182e55dfbf4`; it added
  owner decisions, executable code sketches and independent xhigh code critiques
  ([code-sketch/](code-sketch/README.md)).
- Revision 4 (current document) adds research round 4 ([research-r4/](research-r4/))
  and sketch v4; the package is public from the first 0.x release.
- Original five research reports and their relay stay unchanged in
  [original-reports](../original-reports/) (the rest of that workspace evidence moves with the resource planning archive).
- Resource plan checked for conflicts at SHA-256
  `46e869cefe261dab667f87f6249c63bfb301f3b1581e52f87cf42f270dc0eea7`; it was not edited.

## Hosted critics

Requested profile for every job: `gpt-6.1-sol`, reasoning `xhigh`,
`serviceTier: fast`, read-only reviewer role, `networkAccess: restricted`.
These are manifest requests, not attested backend tiers. Every result has
`status: done` and `changedFiles: []`.

| Lane | Report | Job | Account | Raw result SHA-256 |
| --- | --- | --- | --- | --- |
| API ergonomics | [critic-api.md](critic-api.md) | `ar-research-hooks-critic-api-fast-20261001` | (slot redacted) | `1c277fbdbd0d0837a5bdfd9464bf5c46ece8a07d829bf8072e336b4535de37c3` |
| Async and errors | [critic-async.md](critic-async.md) | `ar-research-hooks-critic-async-fast-20261001` | (slot redacted) | `ac1140db0036ba82da0043dad3cc8a639ac12b98fc0456a7e996b62f86eafbd6` |
| Hierarchy and scale | [critic-hierarchy.md](critic-hierarchy.md) | `ar-research-hooks-critic-hierarchy-fast-20261001` | (slot redacted) | `5f26cf9bd1f55d694bb240d7f73ec53dbd4b97a812c00966f29bfc3a6bb2590f` |
| Architecture | [critic-arch.md](critic-arch.md) | `ar-research-hooks-critic-arch-fast-20261001` | (slot redacted) | `c22be8ed3d960be00f90366b395648e42045dcc56223b02981e934af9c5265c9` |

`critic-*.result.json` are exact raw runtime bytes; `critic-*.md` remove only the
`output_summary:` wrapper; `critic-*.identity.json` record hashes and requested
fields. Exact prompts and requested profiles are in [requests/](requests/README.md), the shared
task in [critique-scope.md](critique-scope.md) and the actual per-job input
manifest in [critic-input-hashes.json](critic-input-hashes.json) (identical for
all four jobs). [flow.json](flow.json) records the run, including a safe
pre-turn start failure caused by a shared workspace lock.

## Source access

The installed hosted runtime cannot provide an admitted research network
profile: its app-server thread config sets `web_search: "disabled"`, the job API
exposes no override, and `networkAccess: "unrestricted"` requires a
danger-full-access sandbox, which is not allowed
([runtime-capability-check.md](runtime-capability-check.md)). The critics
therefore analyzed **root-supplied packets**, not independent online research.

Root obtained fresh primary sources directly online through three root-session
subagents and its own `gh` checks on 2026-10-01:
[root-verified-online/](root-verified-online/README.md). Topics A-C were given to
the critics; topic D (TypeScript `void` callbacks, plus a local TS 5.8.3/7.0.2
compile check) was added afterwards for the root synthesis. The original relay
from the five earlier workers was also included. Every file in
`root-verified-online/` is byte-identical to the critic input except the two
root additions: `topic-d-typescript-void-callbacks.md` and
`topic-b-async-errors.final-root-copy.md` (three sentences shortened, same facts).

## Root verification

Root read every critique, checked each confirmed defect against the cited
packet, kept only defects it agreed with, and recorded corrections with IDs
`H2-1`…`H2-12` in the revised document. No critic and no root check found a
conflict with the resource plan. An independent read-only
review of the first revision-2 draft
([root-review-of-revision-2.md](root-review-of-revision-2.md)) found no P1, five
P2 and seven P3 issues; root verified and applied all twelve (R2-1…R2-12),
including one hooks-side gap against the resource plan's drain rule.

Limits: hashes prove retained bytes, not remote authenticity; no code, build,
test or runtime flow ran; scores and LOC are design judgments.
