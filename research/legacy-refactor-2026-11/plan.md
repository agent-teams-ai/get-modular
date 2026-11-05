# Bounded legacy refactoring plan: Get Modular (2026-11-06)

> **Status:** Working implementation plan and review record. Not an ADR, API authorization, release admission, or assertion that verification has passed.
>
> **Base:** `5fb83478dd7b95216be92c4d3077eddf2774eef8` on `main` (2026-11-06 audit).
> **Delivery rule:** Preserve proven behavior. A 10–20k changed-line request is a risk **ceiling/scale estimate**, never a mandatory churn quota. The first proof slice is much smaller. Stop at the smallest complete fix.

## 1. Goal and verified baseline

Remove demonstrable legacy in maintainable code, strengthen narrow ownership, respect Clean Architecture/SOLID/DRY, apply DDD only to actual domain contexts, and avoid unapproved additions. Public Get Modular composition semantics remain separate from Host lifecycle and from Extension Foundation.

Read before change: root `AGENTS.md`, [engineering quality standard](https://github.com/agent-teams-ai/.github/blob/main/docs/engineering-quality-standard.md), `docs/architecture/{system-boundary,current-contract,mvp-implementation-roadmap,self-composition-implementation-guide,feature-module-standard,common-assembly}.md`, accepted ADR index and requirements, and repository codemod fixtures.

The audited tree contains about **2,603 blobs / 35.67 MiB**; most large bytes are qualification/research evidence rather than maintained runtime. Six published/candidate package owners already exist: Core, Assembly, Resources, Observation, Conformance, Lifecycle Kernel. The contemporary **foundational runtime** and **typed build custody** refactors already have dedicated November 2026 records in `docs/qualification/`; do **not** duplicate them.

Current `main` already has a successful full multi-platform `Push on main` workflow for this base (run 42077928808). Separate Dependabot checks failed on the same SHA; their failures are not evidence of a source regression in this refactor. Fresh PR checks must still qualify the delivered SHA.

## 2. Inventory and ownership decisions

| Area | Observation | Disposition |
| --- | --- | --- |
| `packages/core/src/features/**` | Explicit admission/graph/output owners, retained qualification and generator contracts | **Freeze semantics**; no speculative rewrite |
| `packages/assembly/src/features/construction/**` | Existing boundary and recent preparation fixes | **Out of this PR**; no overlapping API work |
| `packages/resources/**`, `packages/observation/**` | Existing cleanup, concurrency, deep-graph and drain corrections recorded in November plan | **Out of this PR**; do not consolidate different lifetime authorities |
| `packages/conformance/src/features/layout/check.ts` (335 lines), `wiring/check.ts` (344 lines) | Similar own-value argument validation, but different contracts and diagnostics | Candidate for a **separate** focused future PR only after comparing exact invalid-input behavior |
| `architecture/checks/v1-qualification.mjs` (3,886 lines) | Large historical qualification checker with independent oracles and retained evidence | **Do not mass-migrate** without explicit proof, compiler/runner coverage and independent oracle parity |
| `architecture/tooling/codemods/0.4-0.5/shared.ts` (916 lines) | Combines syntax analysis, lexical collision detection, inspection, rewrite coordination and import lifecycle | **Selected** bounded internal decomposition; preserve old migrations as maintained compatibility tooling |
| `tests/codemods/**` | Exact input/output/manual fixtures, idempotence, CLI integration and compilation tests | Keep all fixture bytes and strengthen only gaps exposed by refactor |
| `docs/decisions/**`, `architecture/qualification/**`, `research/**/raw/**` | Accepted authority, historical or independent evidence | **No delete, rewrite, or relabel** |

This is a **tooling ownership refactor**, not adoption of a new framework, module graph, or product integration. The Consumer Module Standard remains authoritative and unchanged; no new runtime composition boundary or consumer pin is introduced.

## 3. Alternatives and choice

Ratings are **engineering judgments** on the 10-point scale (higher reliability and cohesion better; higher complexity/risk worse). They do not use popularity or stars.

| Alternative | Reliability | Cohesion | Complexity burden | Regression risk | Decision |
| --- | ---: | ---: | ---: | ---: | --- |
| A. Split by proven private responsibility; keep caller/CLI semantics intact | 9 | 9 | 3 | 3 | **Selected** |
| B. Rewrite codemod engine or replace parser/TS service | 5 | 6 | 9 | 9 | Reject; no evidence of a needed runtime replacement |
| C. Keep the 916-line file and only add comments | 8 | 4 | 1 | 1 | Safe fallback if tests cannot prove a split |

Prefer a few cohesive private helpers to a new generic AST framework. The key value is **stable migration diagnostics and idempotent rewrites**, not shorter files per se.

## 4. First implementation slice (only authorized code scope)

1. Extract **lexical name-collision analysis** from `0.4-0.5/shared.ts` into an owning `.ts` helper under the same migration folder. This preserves binding patterns, local/import shadowing, ignored nodes, nested blocks, catch and function parameters; preserve the exported `nameWouldCollide` facade signature used by callers.
2. If the first slice passes targeted fixtures and strict TypeScript, extract the **import liveness/cleanup bookkeeping** into a second private helper. Do not introduce cycles; either keep constants owned by one leaf or do not extract. Preserve comments, CRLF, default/namespace imports, type-only imports and pre-rewrite-use tracking.
3. Keep `entries.mjs`, `prepare.mjs`, `isolate.mjs`, `type-names.mjs`, `imports.mjs` and `run.mjs` as existing host/format boundaries for this delivery. Do **not** convert their syntax merely to meet a metric.
4. All new maintained implementation goes into `.ts` (TypeScript >=7.0.2). Include it in the existing strict `tests/tsconfig.native-tooling.json` gate explicitly or through a checked import, with no compiler weakening.
5. Keep `shared.ts` as the existing narrow compatibility entry for the legacy migration step. No new published export, package, dependency, global registry, config toggle, feature flag, or change in codemod version routes.

Estimated first slice: **150–500 added/deleted lines** counting mechanical moves, **0–120** targeted test lines, no new production library lines. This estimate is not a reason to touch additional code.

## 5. Conditional later slices (not approval to change them now)

- **Conformance validation DRY:** Only if byte-exact invalid-input contracts are first recorded and at least three call sites share a genuinely identical rule. A small private own-data validator may be justified; leave layout and wiring as separate owned features. Estimate 200–600 diff lines, tests 100–250.
- **Qualification/tooling debt:** Only after a separate baseline and a proved defect. Large `v1-qualification.mjs` and `governance.mjs` are not automatically legacy; independent oracle implementation and historical case identities are safety mechanisms. Split only separable maintained responsibilities with exact-regression tests. Estimate 2,000–7,000 diff lines if selected; otherwise **zero**.
- **Codemod deeper decomposition:** If necessary after the first extraction and full CI, examine entry/prepare/isolate/type inspection ownership individually. Resist breaking the single-file scope for its own sake. Estimate 700–2,500 diff lines.
- **Cross-repository/published API:** Out of scope. Any later public break needs an accepted contract and a same-release consumer migration under AGENTS.

The larger 10–20k change-envelope cannot be claimed as implemented by a plan, a moved-file diff, or passing tests on old code. The actual changed-line budget may reasonably be far below it.

## 6. Non-goals and safety invariants

- No `Core` semantic, canonical plan/digest, graph ordering, diagnostics, admission, trusted carrier or resource budget changes.
- No `Assembly` public API, Host permission/lifecycle, loading, readiness, publication, dynamic generation or plugin ownership changes.
- No deletion of old codemods, fixture archives, historical evidence, passed qualification or legacy aliases whose live consumers have not been ruled out.
- No new DDD entity for a tooling script. The migration phase is the bounded context; syntax analysis and rewriting are internal collaborators.
- No broad replacement of handwritten JavaScript, new package or dependency, new source exclusion or downscoped CI.
- Do not modify accepted ADRs, pinned Consumer Module Standard, external consumer revisions, baseline snapshots, policies or permissions.
- Do not merge on partial success, report a skipped test as passed or infer one runner profile from another.

## 7. Proof and validation matrix

| Gate | What must be observed on delivered code |
| --- | --- |
| Static | Exact paths, no new imports across source boundaries, TypeScript 7.0.2 strict project, no new `.mjs` implementation |
| Codemod fixtures | Every `tests/codemods/0.4-0.5/**` expected output and manual report unchanged; second pass has zero edits |
| CLI | `--dry`, `--check`, `--write`, dirty-tree/own-checkout refusal, CRLF/comment retention and typechecking of emitted outputs |
| Local | `bun run check:changed` during edit, `bun run check:fast` before handoff, `bun run check` as full gate; exact exit codes only |
| Hosted CI | Required GitHub Actions on current head; Bun + Node 24/26 rollback; Linux, macOS and Windows including package checks and governance |
| Review | At least two rounds: architecture/scope/ownership, then precise regression/compatibility/security review; fix confirmed observations |
| PR | Draft until valid verification/reviews; commit and push each coherent edit immediately, record SHA, do not bypass identity/protection checks |
| Merge | Only if branch is mergeable, all required checks green on exact head, reviewed and no outstanding blockers; verify postmerge `main` |

Environment limitation: this Chat environment has GitHub connector writes and hosted CI, but **no local `gh` authentication, local remote clone, independent subagent runner, or selectable xhigh critic model**. Do not present internal perspectives as independent agents or hosted CI as a local run. If independent review is available via actual GitHub PR/ReviewRouter, report its exact status separately.

## 8. Plan critique log (adversarial analytical perspectives, NOT independent subagents)

### Round 1 — ownership / anti-overengineering / evidence integrity

1. **Clean Architecture critic:** A cross-package rewiring of Core + Resources + Observation + tooling conflates unrelated owners. **Accepted:** first PR is codemod tooling only; future conformance would be a separate PR.
2. **Minimalism critic:** A fixed 10–20k churn requirement rewards moving good code. **Accepted:** numerical budget became an upper envelope, with stop-on-smallest-correct-fix.
3. **Qualification critic:** A 3,886-line historical checker may be long because it holds independent oracles. **Accepted:** no split without proof of a defect and retained case parity.

### Round 2 — compatibility / TypeScript / tests

1. **Migration critic:** Removing outdated 0.x codemods would break consumers upgrading older installs. **Accepted:** retain all migration versions and public CLI behavior.
2. **Compiler critic:** Adding a `.ts` file not included in the strict owned project silently defeats TS7 policy. **Accepted:** verify compiler-project closure, no weakened options and an exact CI typecheck.
3. **Reliability critic:** Splitting lexical/import logic can change stale-reference detection and comment retention. **Accepted:** require exact fixture, idempotence, CRLF, typecheck and CLI matrix; pure moves before behavior changes.

### Round 3 — PR safety / claims / execution discipline

1. **Release critic:** `Push on main` success on the old SHA does not qualify a new PR SHA. **Accepted:** only exact-head results count.
2. **Reviewer-integrity critic:** One session cannot claim multiple independent xhigh model reviews. **Accepted:** these are labeled analytical perspectives; seek separately executed review results when available.
3. **Security critic:** Refactor must not disable commit author identity, production gates or branch protection to produce a green PR. **Accepted:** stop at an explicit blocker and leave draft rather than bypass controls.

### Disposition

No critical plan disagreement remains for the **first, intentionally narrow refactor slice**. A proposed widening of the code scope must receive another scoped critique and tests, not simply reuse this approval.

## 9. Execution checkpoint ledger

- [x] Read target repo and organization engineering guidance; inspect current `main`, tree and open PRs.
- [x] Identify already-refactored runtime/build paths and retained historical evidence.
- [x] Three adversarial analytic review rounds of this plan; not independent agent executions.
- [ ] Establish first implementation diff and immediately publish its commit.
- [ ] Run targeted codemod/strict TS checks through connected CI.
- [ ] Inspect any failing job logs, correct only regressions confirmed on the current SHA.
- [ ] Review final diff, including external review results if executed.
- [ ] Complete required exact-head matrix and merge verification, or record genuine remaining blocker.
