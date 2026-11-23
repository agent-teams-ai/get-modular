---
id: QUAL-DEPENDENCY-SECURITY-2026-11
type: qualification
status: reviewed
owner: architecture/tooling
summary: Bounded plan for the documentation parser security update and the Bun security-update support limit.
related:
  - ARCH-FEATURE-MODULE-STANDARD
---

# Documentation dependency security, November 2026

## Goal, authority and completion boundary

Starting main: `42e4731351b360fdeb0fac2c6df5648593c02392`, observed on
2026-11-23. This is the reviewed implementation plan. The `reviewed` document
status records the plan review only; it does not certify implementation,
deployment or automation. Current implementation, validation and merge outcomes
are recorded separately in [PR #249](https://github.com/agent-teams-ai/get-modular/pull/249).

Remove the affected documentation development dependency from both current
manager graphs, preserve the supported runtime profiles, and document the real
security-maintenance path. The owner authorized a reviewed plan, early Draft PR,
implementation, checks, external review and protected merge.

The [repository runtime profiles](../architecture/feature-module-standard.md#repository-runtime-profiles)
and [organization security ownership](https://github.com/agent-teams-ai/.github/blob/main/GOVERNANCE.md#organization-security-defaults)
remain authoritative. This change has no module, lifecycle or public API scope.

## Confirmed problem and limits

Both current lockfiles contain `markdown-it@14.3.0`, pinned by
`markdownlint-cli2@0.23.2`. The root owns this documentation development tool;
published `@get-modular/*` packages do not declare it as a runtime dependency.
[The GitHub advisory](https://github.com/advisories/GHSA-gfr2-rv44-r23c)
affects `>=14.1.0 <14.3.3` and `>=15.0.0 <15.0.3`. The advisory concerns excessive
CPU work while parsing malformed reference definitions. The current built-in
lint rules use the other parser or no parser, and no custom rules are configured.
This finding proves an affected installed dependency, not a demonstrated
exploit in the current docs command or a module-events runtime defect.

The [failed security update](https://github.com/agent-teams-ai/get-modular/actions/runs/45072866613/job/137363530472)
used `npm_and_yarn` and rejected the Bun-managed root as misconfigured tooling.
[GitHub's support table](https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories)
supports Bun version updates but not Bun security updates as of this observation.
The retained pnpm lockfile does not change the root's Bun manager declaration.

Accordingly, dependency remediation and automatic security PR support have
different completion conditions. This PR can remove the affected closure and
prove the manual owner PR route. Automatic security PR generation remains an
explicit platform-support gap. A Bun configuration with version PRs disabled
cannot establish that capability. No new service, shadow manifest, manager
switch, custom updater or organization policy change is authorized by this plan.

## Bounded implementation

1. Select exact [`markdownlint-cli2@0.24.2`](https://github.com/DavidAnson/markdownlint-cli2/blob/v0.24.2/package.json),
   which pins `markdown-it@15.0.3` and includes the line's lint and declaration
   fixes. `0.24.0` is the first patched release, but its subsequent patch fixes
   are relevant maintenance; `0.23.3`, the last 0.23 release, remains affected.
   Keep the exact root catalog and its
   `pnpm-workspace.yaml` authority synchronized. Do not introduce an override.
2. Regenerate `bun.lock` with Bun 1.4.3. Regenerate the retained pnpm lock with
   pnpm 11.20.0 in an external, manifest-only manager root using the existing
   Node manifest projection. Keep installation scripts disabled. Copy back only
   the genuine generated lockfile and review every changed package. Preserve
   unrelated pins, integrity records and historical fixtures.
3. Add a concise maintenance note beside the runtime instructions. The existing
   owner PR flow handles alerts and reported advisories while automatic Bun
   security updates are unsupported. It requires updating both graphs,
   independent frozen installations, review and the normal protected merge.
   Keep existing security settings and the organization update owner unchanged.
4. Retain this plan and a navigation link. Record observed validation and the
   unresolved automation limitation in the PR, with links to actual runs.

No new maintained executable code or tests are planned. This updates an upstream
implementation; the existing full documentation lint is the relevant real
consumer test. Add a small regression only if a concrete local defect is found.
Do not add a test that merely duplicates a version pin or a large hostile-input
benchmark. Existing module E2E remains in the required matrix.

## Verification and acceptance

1. Inspect the installed dependency chain and both generated lockfiles. No
   current resolved `markdown-it` may remain in the advisory's affected ranges.
   Do not rewrite immutable historical lockfiles or release evidence.
2. Run the Bun frozen install through `dev.ts install`, the runtime projection
   check, the committed peer graph check and the complete docs protocol/quality
   gate. The new linter must process the real documentation corpus without
   disabling a rule. Fix only attributable documentation findings, if any.
3. After committing the candidate, prepare a fresh isolated Node profile with
   `dev.ts prepare-node`, install its frozen pnpm graph, run the same docs gate,
   inspect the installed parser version and verify projected workspace custody.
   Never interpret a Bun installation as pnpm evidence or mix managers.
4. Use `check:changed`, `check:fast` and the full required checks. Preserve the
   existing OS/runtime matrix and installed-public-package qualification.
   Record failures and environmental limits honestly; exact-head hosted gates
   must pass. Do not weaken a check to admit the dependency update.
5. Obtain independent diff review and actual external review on the candidate.
   Fix confirmed findings and repeat the affected checks/review. A queued,
   skipped or unavailable reviewer is not a completed review.
6. Re-read the live owner, source identities, exact head/base, required checks
   and review threads. Squash the reviewed head without changing protection.
   Verify the final commit and wait for successful main CI. Read the updater or
   alert outcome if the authorized interface exposes it; absence of another
   failed run does not prove security automation or alert closure.

No npm publication or product deployment is required for a root development
dependency. A future E2E in a named consuming product requires that product's
explicit adoption scope; no product is selected by this maintenance change.

## Plan review and delivery sequence

Review this plan in two bounded rounds before implementation, first for support
and ownership, then for dependency and verification details. Record confirmed
corrections here. Push the reviewed plan and open Draft immediately; push each
coherent implementation or fix to that PR. Final delivery evidence belongs in
the PR so merging does not require a self-referential evidence commit.

Initial estimate: zero production/integration lines, zero new executable test
lines, two catalog value edits, roughly 80-200 generated lockfile lines and
120-170 documentation lines. Actual lockfile resolution may differ and must be
reviewed. Engineering judgments: complexity 2/10, confidence in the bounded
dependency fix 9/10, achievable reliability of that fix 8/10 before execution.
These are not availability measurements or a score for unsupported automation.

Reversal restores the previous tooling closure, including its known advisory;
it must not be described as a security fix. No persisted user data or package
API migration is involved. Prefer a corrected forward dependency update if
qualification finds an incompatibility.

Review record:

- Round 1, support/ownership: no confirmed finding. Keep the distinction between
  removing this advisory and unsupported automatic Bun security PR generation.
  GitHub's [manual remediation instructions](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/viewing-and-updating-dependabot-alerts)
  explicitly support creating and merging an owner fix PR.
- Round 1, dependency/qualification: no confirmed finding. Prefer `0.24.2` over
  the first fixed minor because its patches fix known lint/declaration defects.
  The temporary manifest-only directory generates a lockfile; it is never
  reported as qualification. A later committed, isolated projection owns that
  evidence. No custody marker or verification rule needs to change.
- Round 2, both independent reviewers: no remaining confirmed finding. The final
  plan preserves the automation limitation, separates lock generation from
  isolated qualification and requires the Draft before implementation.
