> Historical PR handoff, imported on 2026-09-04 at commit `584b952`.
> Its start blockers and decision statuses describe the reviewed subjects,
> not current implementation authority. Use the
> [current contract](../../docs/architecture/current-contract.md) and
> [MVP roadmap and owner-start record](../../docs/architecture/mvp-implementation-roadmap.md)
> for the admitted M1 scope. Retained evidence is unchanged.

## Scope

This Draft PR records the Get Modular implementation-readiness audit and API
authoring lab. It contains no production Core, public API, runtime engine,
plugin host, product integration, package publication or accepted-ADR change.

## Exact evidence

- initial base: `0f7d2fc64ae7258781e6c2676ca1e0ccc377f418`;
- frozen four-integrator subject:
  `72d140da7975d0ca2b5f4180885c6fc4b2c05cd8`;
- report synthesis input:
  `c40d016c13c5a5ff3fbb5c27d5d668229755bec2`;
- canonical inventory: 110 raw files, 97 byte-unique results, 88 canonical
  roles and 9 attempts;
- dispute review: 32 closed topic-role cells, aggregate
  `ccd13b6652a45a6e4d80a4ca5b2ff80a95fdc7a624d3f30695d181e61e233838`;
- four read-only integrators, aggregate
  `4b53d31b981ee0a4ea8d6a6329148453d925fdff2fd0aee40225ad22dd2957ba`;
- API lab: the same 30 scenarios across three candidates, 90 executions,
  corpus digest
  `3f09cc2c6ad801e36594be02e2b99ca691ca149241495ec65d73978de19b860c`;
- retained API lab result:
  `research/implementation-readiness/evidence/api-authoring-exact-run.json`,
  SHA-256
  `9b1f45f35076cffc32a686e79afe2f3811475f877e3d58aa5017ffcd4fdbd11f`;
- execution envelope: `research/implementation-readiness/evidence/api-authoring-execution.json`,
  source `abe96cd7dbdd2597f3e46711fc1ad5c3373f312f`, complete committed input
  hashes, toolchain hashes, command outcome and emitted declarations.

The shared laboratory now permits alternate implementations, rejects duplicate
profile selections, uses accepted semantic code names and keeps desired state
in an explicit test-Host. Six additional selection probes cover both alternatives
for all three candidates. The normalized lab still does not claim complete wire,
diagnostic, resource or SCC conformance.

O1-O5 source access was incomplete in the historical campaign. A separate
verified offline source pack now provides 24 original source/license files at
five pinned upstream commits. `evidence/oss-source-inputs.json` records custody.
Five new source inspections and the fifth T2 critic have now completed against
exact `fe9611590dae25cdc22887148d685889daa0f7c6`; their independent raw reports,
launch/input records, clean-workspace checks and cleanup are indexed in
`evidence/follow-up/raw/sources-fe96115/index.json`. Source inspection is not
runtime compatibility or adoption. T2 preserves accepted ordinary inherited
reads; own-data restrictions require a successor and are not adopted.

All new jobs use `gpt-5.6-sol`, `xhigh`, fast. The rejected ordinary goal launch
remains historical evidence. Successful jobs use the runtime's supported
bounded file-tool profile, with no worker shell/web/write/delegation tools or
fallback and with hosted sandbox controls retained. Provider control-plane
connectivity remains; OS-wide egress isolation is not claimed. No runtime guard,
source or shared account/controller policy was changed.

Worker count is not treated as proof. Partial, blocked, retried and
source-unavailable results remain explicitly classified.

Four fresh integrators completed on exact
`3014239a0d22b21a3d2994fcc5f5b2da4e7e8236`, indexed separately in
`evidence/follow-up/raw/integrators-3014239/index.json`. Their raw results are
unchanged; confirmed corrections clarify M3 authority, support-share metrics,
duplicate profile selections, owner-token grammar and emitted-example coverage.
The corrected source was executed afterward: 90 same-corpus outcomes, 48
owner-token probes and 36 compiled edit trees passed. The report separates
ten-module edit measurements from unmeasured human navigation at 100/1000.

## Verdict

No P0 was reproduced. The result is **NO-GO now** for the first tracked private
Core source because the product-owner start record is absent and unenforced.
This patch resolves the earlier M1 callable/packing contradiction without
admitting either carrier.

After one bounded Phase 0 authority/admission repair, the result becomes
**CONDITIONAL** for a private normalized-value semantic slice. It remains
**NO-GO** for Phase 3/4 qualification, public packaging, raw carriers,
self-composition, runtime conformance and release claims.

The preferred private authoring direction is inert descriptor data plus a
zero-behavior typed `defineModule` facade and separate product-owned factories
with Pure DI. This is a recommendation, not public API acceptance. The report
keeps observable accessor order, public typing, carriers and the ADR-0016
witness as product decisions.

## Verification

- exact API lab compile and runner: passed on Node `24.18.0` with TypeScript
  `7.0.2`;
- inventory and evidence digests: independently recomputed;
- full `pnpm check`: passed at the previous integrated checkpoint; repeat on
  the final corrected subject before handoff;
- six hosted reviewers completed against `523f8e7`; confirmed report and lab
  findings were corrected after that review;
- source/result drift tests pass, including ignored/untracked input, changed
  source, incomplete manifest, failed command and changed result;
- latest GitHub CI and affected-area exact-head re-review remain required.

Edit counts now come from six before/after source experiments per candidate:
36 compiled trees, identical semantic changes, source hashes, Git line counts
and binding-record coordinates. These are synthetic layout measurements, not
product edits, runtime loader costs or developer time. Candidate support
counts include helpers/translation, and split factory association is exercised
in both host probes. ADR-0007 inherited lookup and full ADR-0008 construction and
behavior evidence remain accepted; no product decision was silently changed.

This PR stays Draft and must not be merged automatically. The final reviewed
head and external reviewer digests belong in the live PR body/comment after the
six-reviewer gate, avoiding self-referential evidence in the reviewed tree.

See `research/implementation-readiness/report.md` for the Phase 0-4 matrix,
quantitative API comparison, security matrix, contradictions, decision packet,
claim/evidence ledger and exact Core start conditions.
