# Proposed PR: qualify observation 0.1.0 through exact release archives

Target: `agent-teams-ai/modularity-host-test`, base `main`,
head `test/observation-0.1.0`. Create as a draft while Get Modular's upstream
admission and compiler-extraction gates remain blocked.

## Why

The observation package needs evidence from an independent connected consumer
using the exact coordinated release archives, in addition to its package tests.

## Changes

Add the isolated `observation-0.1.0/` workspace, with five retained archives,
exact pins and lockfile, ordinary public module contracts, controlled query
completion, independent handwritten wiring expectations, the original writer
inputs and a bounded public-statistics adaptation. Other fixtures are unchanged.

The connected experiment covers acquisition-time catch-up, distinct instance
identities, stale-query abort and physical cleanup, current result publication,
independent sibling lifetime and attributed callback failures. One separate
conformance smoke covers the same root and every failure/abort injection target.

## Actual results

- Prepared package source: `b2815314182221baac6b08750f86ef2644d2cdb8`.
- Executed consumer source: `972dc2b9dfe9470a5e34ed4f28d75ecfc0fbec73`.
- Evidence-only successor: `c2872eb9b89fbde8cc162e152c2cab5f813237cd`.
- Offline strict install and frozen-lockfile reproduction passed.
- TypeScript 7.0.2 NodeNext/Bundler passed with `skipLibCheck: false`.
- Node 24.21.0 and 26.11.1 each passed all five connected/runtime predicates
  and all 33 writer outcomes: eleven positives and 22 intended negatives.
- One smoke passed eleven baseline/injection rows, with complete closes.
- An independent critic verified all 25 executed-source hashes, five tarballs,
  176 installed files, 78 original writer inputs, lock/pins and actual outcomes.

[Accepted record](https://github.com/agent-teams-ai/modularity-host-test/blob/c2872eb9b89fbde8cc162e152c2cab5f813237cd/observation-0.1.0/evidence/accepted-972dc2b/RECORD.md) and
[machine-readable result](https://github.com/agent-teams-ai/modularity-host-test/blob/c2872eb9b89fbde8cc162e152c2cab5f813237cd/observation-0.1.0/evidence/accepted-972dc2b/result.json)
retain the command logs and the complete three-substitution harness diff.

Two fixture defects were corrected without modifying archives: an ignored CMS
fixture location, and an overly strict abort-outcome count. The final smoke
pins all targets and accepts the existing conformance cancellation contract.

## Scope

This proves the named archive consumer on two Linux runtime rows. It does not
claim a full source-architecture certification, Windows/macOS result, scale
measurement, npm publication or completed Get Modular release eligibility.
The separate Foundation/API Extractor TypeScript 5.9.3 blocker remains open.
