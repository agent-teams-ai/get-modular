# Worker manifest remediation

Work from exact commit `e7da43ecb22c692d5e5833261568cc6a52da25b4` in a clean standalone workspace.

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

Add executable validation using repository-available Node only if useful. At minimum verify unique canonical IDs, referenced raw files, required field presence, status vocabulary, duplicate targets, SHA shapes and count reconciliation. Return a patch plus focused command output. This is evidence normalization, not a new production attestation protocol.
