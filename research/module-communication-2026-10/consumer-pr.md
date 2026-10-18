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

- Prepared package source: `106e3b0adca10e83d7a87ba57cb73baa9ee7ca6d`.
- Executed consumer source: `4d10a1fb7041e44c61766400d6f1262e84c397e7`.
- Evidence-only successor: `4b33245c2b454e44aac4ea6f3bb241c02f7b9c59`.
- Offline strict install and frozen-lockfile reproduction passed.
- TypeScript 7.0.2 NodeNext/Bundler passed with `skipLibCheck: false`.
- Node 24.21.0 and 26.11.1 each passed all five connected/runtime predicates
  and all 33 writer outcomes: eleven positives and 22 intended negatives.
- One smoke passed eleven baseline/injection rows, with complete closes.
- An independent critic verified all 25 executed-source hashes, five tarballs,
  176 installed files, 78 original writer inputs, lock/pins and actual outcomes.

[Accepted record](https://github.com/agent-teams-ai/modularity-host-test/blob/4b33245c2b454e44aac4ea6f3bb241c02f7b9c59/observation-0.1.0/evidence/accepted-4d10a1f/RECORD.md) and
[machine-readable result](https://github.com/agent-teams-ai/modularity-host-test/blob/4b33245c2b454e44aac4ea6f3bb241c02f7b9c59/observation-0.1.0/evidence/accepted-4d10a1f/result.json)
retain the command logs and the complete three-substitution harness diff.

The earlier qualification corrected two fixture defects without modifying its archives: an ignored CMS
fixture location, and an overly strict abort-outcome count. The final smoke
pins all targets and accepts the existing conformance cancellation contract.

The additional GPT-6.1 xhigh review corrected loader Promise-constructor
inspection in the production package. This PR retains the regenerated candidate
and a complete rerun, with no consumer executable, semantic oracle or writer
expectation changes. Four archives remain byte-identical; the new observation
archive SHA-256 is
`2a72ad3080ecf72277ab707581633391b6af28cbed36a98f8eff2306563f5c91`.
The current refresh also incorporates the TypeScript test-command correction;
compared with the preceding installed set, only observation's manifest bytes
changed. Both earlier accepted records remain unchanged. A clean comparison
pack confirms the plan's existing conformance peer-key-order exception; its
original pinned tested archive remains the subject.

Local AGENTS, Claude and Copilot routes adopt the requested TypeScript-first
rule and link to [organization policy PR #368](https://github.com/agent-teams-ai/.github/pull/368).

## Scope

This proves the named archive consumer on two Linux runtime rows. It does not
claim a full source-architecture certification, Windows/macOS result, scale
measurement, npm publication or completed Get Modular release eligibility.
The separate Foundation/API Extractor TypeScript 5.9.3 blocker remains open.
