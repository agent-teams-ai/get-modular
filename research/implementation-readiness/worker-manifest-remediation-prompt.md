# Worker manifest remediation

Work from the exact commit supplied by the coordinator in a clean standalone
workspace. Record that exact commit in generated metadata; do not substitute a
branch name or mutable reference.

You own only:

- `research/implementation-readiness/worker-manifest.json`
- `research/implementation-readiness/evidence/worker-index.json`
- optionally one deterministic generator or schema beside those files if it materially prevents drift

Do not change reports, documentation, fixtures, production source, accepted ADRs, or historical raw result bytes.

Build one canonical machine-readable execution inventory from:

- `evidence/combined-workers.json`;
- `evidence/raw/**/*.result.json`;
- `evidence/reconciliation.json`;
- `evidence/host-preflight.json`;
- the four retained completion-audit results at exact `ae1a138...`.

Each canonical worker/attempt record must contain:

- worker ID and run ID;
- logical role and track when recoverable;
- model, reasoning effort and service tier;
- exact base/reviewed subject SHA;
- worktree path;
- ownership;
- sources;
- result with separate wrapper execution status and retained evidence status;
- commands;
- changed files;
- confidence;
- unresolved questions;
- network requested/enforced;
- canonical/attempt/duplicate classification;
- per-field provenance or a compact provenance map.

Rules:

- never fabricate a historical value;
- unrecoverable values are literal `null` with reason `not-retained`, `unstructured-only`, or another precise provenance reason;
- global campaign defaults may populate a field only when the launch contract actually applies, and provenance must say so;
- distinguish `done` wrapper status from `positive`, `partial`, `blocked`, `source-unavailable`, and `review-only` evidence status;
- preserve the B1 partial and B3 blocked reconciliation;
- identify byte-identical aliases using `duplicateOf` without double-counting canonical work;
- distinguish planned roles from attempts/retries;
- correct the proposed-decision set to ADR-0009 through ADR-0014 plus ADR-0016; ADR-0015 is accepted;
- explain the external-review self-reference boundary: final exact-head review records belong in external PR/CI custody, not inside the commit they review;
- include counts that are mechanically derivable and validated;
- keep historical raw result files immutable.

Keep the inventory compact and reviewable:

- target no more than 2,500 changed lines across the inventory, index, and
  optional generator;
- store one concise record per canonical worker/attempt and reference raw
  evidence by path and digest instead of embedding summaries, commands, or
  provenance repeatedly;
- represent repeated campaign defaults once and reference them from records;
- use a compact per-field provenance map only for fields whose source differs
  from the record's default provenance;
- do not enumerate workers that were launched after the supplied exact commit;
- if every required field cannot fit within this bound without losing evidence,
  stop with a precise blocker instead of expanding the files.

Add executable validation using repository-available Node only if useful. At minimum verify unique canonical IDs, referenced raw files, required field presence, status vocabulary, duplicate targets, SHA shapes and count reconciliation. Return a patch plus focused command output. This is evidence normalization, not a new production attestation protocol.
