# Worker inventory finalization

Work from the exact commit supplied by the coordinator in a clean standalone
workspace. Record that exact commit and the supplied Git-bundle digest. Do not
use a branch name or mutable remote as evidence.

You own only:

- `research/implementation-readiness/worker-manifest.json`;
- `research/implementation-readiness/evidence/worker-index.json`;
- `tests/qualification/implementation-readiness/generate-worker-inventory.mjs`.

Do not change raw evidence, reports, documentation, fixtures, accepted ADRs,
production source, or any other file.

Extend the existing compact inventory to include, without embedding their full
summaries:

- all 32 immutable wrappers and their bundle manifest below
  `evidence/raw/dispute-critics-2bef472/`;
- `evidence/raw/remediation-workers/manifest-compact.latest-result.json`;
- `evidence/raw/remediation-workers/manifest-oversized-partial.latest-result.json`.

Requirements:

- retain all existing 63 historical records and 13 byte-identical aliases;
- include exactly eight dispute topics by four roles from the critic protocol;
- derive topic and role from the closed `t1..t8` and `r1..r4` assignment in the
  task ID and protocol, not by parsing free-form nested output;
- verify every critic wrapper is `done`, read-only, network-disabled, and bound
  to `2bef472612dea7c6a89199a47dd8ca7ed552e630`;
- classify critic conclusions as `review-only`, regardless of finding count;
- classify the oversized manifest result as a partial attempt and the compact
  result as its canonical successful successor;
- preserve exact wrapper status separately from evidence status;
- add execution profiles only when their values are proven by the retained
  launch contract or result wrapper; use `{ "value": null, "reason": ... }`
  otherwise;
- retain path and digest provenance for every source;
- do not claim that the inventory-building worker, future integrators, or final
  exact-head reviewers are contained in the commit they produce or review;
- keep generated artifacts plus generator below 2,500 lines;
- keep the generator in the test/qualification boundary so it cannot trigger
  production package admission;
- use repository-available Node only and no network.

Validation must fail on missing/duplicate topic-role cells, changed wrapper
bytes, wrong subject SHA, non-empty changed files for critics, unexpected
network mode, unsupported status, stale generated output, or count drift. Run
the generator, `--check`, `git diff --check`, and any focused repository checks
available without dependency installation. Return a bounded patch and exact
command output.
