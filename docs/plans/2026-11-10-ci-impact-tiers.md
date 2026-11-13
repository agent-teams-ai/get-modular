---
id: ARCH-CI-IMPACT-20261110
type: architecture
status: proposed
owner: architecture
summary: Bounded trusted-base scope selection for native CI while preserving release qualification.
---

# Get Modular — CI impact tiers (2026-11-10)

## Goal and measurement

The existing 3-OS × Node 22/24/26 rollback qualification suite cost 352 total runner-minutes on PR #231 (run #42536676117). #231 edits `AGENTS.md` and Copilot instructions, so it **must not** be treated as docs-only. Preserve all existing coverage on code and tooling changes.

## Narrow first iteration

- `docs`: only a top-level maintained `docs/guides/[a-z0-9-]+.md` file that does not change executable architecture inputs. New plans, decisions, agent instructions, metadata and all other paths trigger `full`. Run dedicated documentation quality and required status gates; skip runtime matrix on ordinary prose-only PRs.
- `full`: everything else, including `AGENTS.md`, `.github/`, root package manifests, `research/` containing saved raw code/evidence, source, tests, changed/renamed symlinks, unknown files, mixed changes or unresolvable Git refs.
- Main push/release qualification is always full, including the docs protocol and exact authoritative CI job roster; unchanged 3-OS × Node 22/24/26 native matrix on full.
- The new selector may only execute trusted-base policy from PR base. Git diff is complete and NUL-safe. No new deps, migrations, CI bypasses, release or default-branch edits before E2E acceptance.

## Verification and reviews

- R1: scope and unsafe documentation consumed by tests/scripts; all unexpected paths full.
- R2: fail-closed Git range, renames, missing trusted classifier, forks, mutation of workflows.
- R3: do not alter public required check identity, enforce exact lane status in always-running aggregate.
- R4: run targeted Node classifier tests and disposable documentation PR; confirm full PR and full post-merge `main`; compare runner minutes only from completed executed jobs, not skipped ones.
- Measure baseline and prove the actual narrowed scope; if no safe docs set, ship only analysis rather than weakening checks.

## Risk

Complexity 4/10, risk 4/10, expected ~140–250 lines (classifier/tests/workflow), plus this plan. Stop on failed contract or missing full evidence. No direct production publishing.
