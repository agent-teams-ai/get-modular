---
id: ADR-0024
type: adr
status: accepted
owner: architecture
summary: Separates the immutable M2 oracle lock witness from current development dependency custody.
approved_by: product-owner-delegated-orchestrator
accepted_at: 2026-09-07
related:
  - ADR-0007
  - ADR-0021
  - ADR-0022
  - ADR-0023
---

# ADR-0024: Separate historical M2 lock custody from current dependencies

## Context

ADR-0021 binds the dependency lock of its retained private Node oracle source.
Reading that obligation from the current development lock prevents independent
updates to tooling, even when every semantic artifact remains unchanged.
ADR-0007 requires additive successor authority and forbids refreshing accepted
hashes to certify changed evidence.

## Decision

The product owner delegated this bounded architecture decision to the
orchestrator in `solo_owner` mode on 2026-09-07. Accept this narrow supplement
to ADR-0021: only its literal ledger key `pnpm-lock.yaml` is discharged by
[historical-pnpm-lock.yaml](../../architecture/qualification/generation-two/historical-pnpm-lock.yaml).
All other ledger paths still authenticate current indexed bytes through the
unchanged M2 checker. No caller-selected mapping or fallback is authorized.

The witness is the single regular member `source/pnpm-lock.yaml` from the
retained `source.tar`, extracted once without requiring historical Git objects.
The exact derivation identities are:

- Outer ledger: `sha256:3781993b5714d8f8928ca2a2082353f93bc42b0e69a3373bd9cfaa41963f7f61`.
- Retained container: `sha256:bc955c87d08941d83436278ddfc0324c9589ae750d898c580eb812de7c2c139f`.
- Retained ledger: `sha256:a75f5e079611211f7be525d9e864490d3a0dcabc1ab8ee306bf19ecba1d8c8cf`.
- Source tar: `sha256:a7cdb15b12ad13df20b67a3876ab52853a6f260ae9e06e91f9bceacced688df3`.
- Witness: 99,505 bytes, `sha256:7420fcef084e65d3a61eba8e907a17bba9efbd255d1e9fe72b8370d216bdec99`.
- Original source/tree: `0b20ee7227644d098ae59c5b6f27cba8f0a4a5fb` / `1abcc0b870d90bdb3156980afaa72040c2b593ca`.

The current adapter authenticates this accepted supplement, the unchanged
ADR-0021, original ledger and witness. Current `package.json`,
`pnpm-workspace.yaml` and `pnpm-lock.yaml` are separately read through the same
captured Git index and retained for governance's completion reread. Their exact
byte digests identify current tooling inputs; this decision pins no future
current lock. A prior full-gate receipt is not required inside governance,
which is the first stage of the full gate.

Both unchanged frozen suites execute explicitly in an exclusive disposable
fixture containing the 57 outer-ledger artifacts, original ledger and required
accepted-source documents. Only the historical lock is substituted. Current
indexed private-Core authorization, Assembly admission, production inventory
and tracked-file custody modules are separately identified current test dependencies. The
fixture supplies only the prepared dependency closure of those imports. It
performs no install, Core build, Git fabrication or runtime interception.

### Current Assembly admission

This decision explicitly supersedes the historical Assembly root-lock coupling
introduced with ADR-0023's admission adapter: current admission no longer
requires removal of an exact six-line importer to leave the old oracle lock.
ADR-0023's accepted bytes, registry identity, package contract and A0-A3 gates
remain unchanged. Only that historical-full-lock remainder assertion is replaced.

Before subtracting Assembly paths from private-Core scope, governance reads
current manifests, workspace and lock through the same captured index. It
requires the exact Assembly identity, private 0.1.0 package, sole Core dependency
at `workspace:*`, existing carrier and lifecycle restrictions, and Core's
identity and dependency-free carrier. Workspace package scope remains exactly
`packages/*`. The lock must have precisely root, Core and Assembly importers;
Core is empty and Assembly contains only the Core `workspace:*` dependency
resolved as `link:../core`. Malformed, missing, duplicate or additional importer
and dependency fields fail closed. Root tooling resolutions, catalogs, package
snapshots and integrity bytes may evolve under the current dependency policy
and fresh frozen-install gates; they are not compared with historical bytes.
No current dependency versions or lock bytes change in this successor.

The legacy Assembly historical reader keeps its original strict derivation for
old direct callers. Current governance and retained Assembly replay compose it
with the authenticated witness reader, so it receives historical bytes without
constraining current tooling upgrades. The fixture's explicit copied and hashed
module closure includes `assembly-admission.mjs`; missing or changed closure
members fail before child execution. Both unchanged suites still execute their
seven actual tests, with per-file and terminal results and same-index rereads.

## Consequences

All original ADRs, ledgers, recipes, frozen tests, checker and retained archive
remain byte-identical. This supplement changes no generation-two semantics,
outcomes, case membership, M2/M3 scope, publication authority or product API.
ADR-0022 retains its separate, narrowly defined outcome correction.

Fresh frozen-suite results mean execution of historical fixture inputs with
current tooling. Historical proposed/pending and non-Core labels remain true.
They establish neither current installation readiness nor Core qualification.
Current private-Core/M3 authorization tests and all unrelated current tests
continue against the current subject. Existing frozen-install, registry,
dependency, build and full `pnpm check` gates remain mandatory. Independent
exact-patch review and current full-gate receipts are required for integration.

## Rejected alternatives

- Refresh old ledgers or rewrite the current lock: destroys evidence custody.
- Skip frozen suites or treat retained PASS as current execution: omits proof.
- Parse the archive on every admission: adds unnecessary runtime parsing.
- Pin every future development lock here: repeats the historical coupling.
