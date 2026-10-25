# Module communication study and observation API design, 2026-10

<!-- cspell:words microtask microtasks -->

The original contents are research and design evidence. The production follow-through is now recorded in
[implementation-port.md](implementation-port.md), with current status in [HANDOFF.md](HANDOFF.md).
The research prototypes remain separate from the implemented package; historical results are not refreshed.

The [2026-10-25 delivery responsibility review](delivery-review-2026-10-25.md)
compares existing stream mechanisms with the payments consumer, retains three
independent research and three critique reports for all six proposed concerns,
and selects a narrow subscription-recipe correction instead of a new runtime.

## What this directory is

A study of how modules in Get Modular communicate:

- parent to child: configuration, data and changes;
- child to parent: intent, contributions and failures;
- siblings and distant modules: calls, commands, state and facts;
- plugins and extension points;
- lifecycle, resources and memory;
- errors, ordering and observability.

It has two parts. The practices catalog collects proven and failed patterns from real projects, with sources. The
API design work turns the catalog into a candidate API for `@get-modular/observation` and tests it with type
probes, a runtime prototype, writer agents and adversarial reviews.

## Owner direction (2026-10-15 and 2026-10-16)

- Communication between modules is predictable and stays observable with hundreds of modules.
- No anti-patterns. Proven patterns come first.
- Names are ones that a broad JavaScript and TypeScript audience already knows.
- Reliability beats brevity, because AI agents will write most modules.
- Everything is typed and deterministic, and resources and memory are managed correctly.

## Decisions taken

- One owner and one writer per value. Other modules only read.
- The API uses `createStore`, `read`, `set`, `readonly`, `watch`, `load` and `close`.
- A subscription lives in the subscriber's scope: `watch` and `load` take a mandatory `resources`.
- No hub and no participants.
- Any module may own a store.
- Slices come through area contracts: the owner publishes a few area contracts (for example theme, logging and
  region) and hands out the same read-only facet under each; a consumer narrows it further in its own port type.
- `many()` is used only for extension points.
- Events come later, as `createEvent`, `emit` and `subscribe`.
- Variant B, "watch what you read", is the chosen API shape. Variant A (keys and `changesAfter`) stays as the
  documented alternative. Variant C (an atomic watch that returns the snapshot) was dropped after round 1.

## Status

This is the original research checkpoint, before the production port. See the
[current implementation review](implementation-port.md#current-implementation-review-2026-10-19)
and [handoff](HANDOFF.md) for the subsequent implementation and qualification work.

- Research and design evidence only; nothing is implemented.
- The rewritten observation design is proposed in ADR-0034, pending in [pull request #154](https://github.com/agent-teams-ai/get-modular/pull/154).
  The implementation brief here replaces the earlier hub-design execution briefs of pull request #153. Package
  admission still requires the governed ADR.
- [OD-007](../../docs/open-decisions/OD-007-module-change-observation-package.md) stays the governed open decision
  until then. This directory is evidence, not authority.
- The earlier observation research is in [observation-hooks-2026-10](../observation-hooks-2026-10/README.md).

## Files

| Path | What it is |
| --- | --- |
| [findings.md](findings.md) | Everything the study concluded in one place: owner decisions in order, the module communication rules, why the API has its shape, what each review found, writer results per round, open items and process lessons |
| [implementation-brief.md](implementation-brief.md) | The brief for implementing `@get-modular/observation` 0.1.0 under ADR-0034; it replaces the observation execution briefs of pull request #153 |
| [raw/practices/practices-catalog-v2.md](raw/practices/practices-catalog-v2.md) | Practices catalog v2 (2026-10-16): best and worst practices for each direction, lessons from what projects dropped, disagreements between sources, verification notes. A draft for a future guide, not a standard |
| [raw/practices/practices-catalog-v1.md](raw/practices/practices-catalog-v1.md) | The first, interim catalog (2026-10-15) |
| [raw/surveys/](raw/surveys/) | Seven survey reports: industry patterns, modular backends, hierarchical runtimes and actors, micro front ends and anti-patterns (2026-10-15), and three project-level studies of plugin platforms, application backends, games and native applications (2026-10-16) |
| [raw/critiques/](raw/critiques/) | The architecture critique, the naming and syntax critique, synthesis A, synthesis B with its two probes (`synth-b-probe/`), and the notes behind catalog v2 |
| [raw/api-design/b-snapshot/](raw/api-design/b-snapshot/) | Variant B, the chosen shape: `README.md` for module writers, `api.d.ts`, `testing.d.ts`, `type-tests.ts`, `RATIONALE.txt` (why each name and parameter exists, evidence, open points, known items with owner and trigger in section 13) and `CMS-RULE5-DRAFT.txt` (the Consumer Module Standard change that must land with the package) |
| [raw/api-design/a-keys/](raw/api-design/a-keys/) | Variant A, the documented alternative |
| [raw/api-design/tasks/](raw/api-design/tasks/) | The writer tasks: task text, fixed types, skeletons, acceptance files, fakes, behavior scenarios, and the writer prompt template in `README.md` |
| [raw/api-design/tools/](raw/api-design/tools/), `check.sh` | The behavior gate (static rules, compile on two compilers, behavior scenario), mutation scripts and `run-all.sh` |
| [raw/api-design/reference/](raw/api-design/reference/) | Reference solutions for both variants, an alternative correct design, and wrong solutions that must fail the gate |
| [raw/api-design/runtime/](raw/api-design/runtime/), [raw/api-design/runtime-b/](raw/api-design/runtime-b/) | The runtime prototype: a stub engine for both variants with its probes, and variant B probes on the real `@get-modular/resources` |
| [raw/api-design/probes/](raw/api-design/probes/), [raw/api-design/controls/](raw/api-design/controls/) | Type probes and controls that each remove one design element |
| [raw/api-design/results/](raw/api-design/results/) | Original 43-step run outputs, summarized in `raw/api-design/.run-all-final.txt`; `raw/api-design/.mutations.txt` is an older mutation summary from before the second review |
| [raw/api-design/corrections-2026-10-17/](raw/api-design/corrections-2026-10-17/README.md) | Corrections after the independent review of pull request #182, with regression cases and separately retained verification results |
| [raw/api-design/runs/](raw/api-design/runs/) | Writer outputs of rounds 1 to 5 with the gate results (`first-check.txt` and `final-check.txt` in round 1, `blind-check.txt` later) |
| [raw/api-design/archive/](raw/api-design/archive/) | Earlier revisions: dropped variant C, round 1 tasks, earlier stub cores |
| [raw/api-design/GRADING.md](raw/api-design/GRADING.md) | Hand grading of the twelve round 1 solutions |
| [raw/api-design/ADVERSARIAL.txt](raw/api-design/ADVERSARIAL.txt) to `ADVERSARIAL-4.txt` | The four adversarial review passes |
| [raw/api-design/reviews/](raw/api-design/reviews/) | Probe files written by the reviewers (`critic-adv/`) and by the grader (`grading-probe/`) |
| `raw/api-design/.toolchain/`, `package.json`, `tsconfig.base.json` | Toolchain manifest and lockfile, root package file and compiler settings |
| [raw/api-design/renamed-files.txt](raw/api-design/renamed-files.txt) | Every file under `raw/api-design/` that carries an extra `.txt`, by its original name |

The reports cite paths of the original working directories. Read them like this:

- `scratchpad/api-shape/` is `raw/api-design/`;
- `scratchpad/critic-adv/` and `scratchpad/grading-probe/` are under `raw/api-design/reviews/`;
- `PRACTICES.md` and `PRACTICES.v2.md` are `raw/practices/practices-catalog-v2.md`;
- `raw/<report>.md` is the same file under `raw/surveys/` or `raw/critiques/`;
- code and configuration files have an extra `.txt` (see [Changes to the files](#changes-to-the-files)).

Raw reports keep their original language; several are in Russian. They are evidence, not normative text.

## How the API checks were run

1. Type probes. The public types of variants A and B, their type tests, traps and controls compile on TypeScript
   7.0.2 and TypeScript 5.8.3. Every expected compile error is pinned to its own line. Controls remove one design
   element each and must fail. Some probes run against the published Get Modular 0.4.0 packages, and one runs against
   the Assembly and resources sources of `main` at `bcd4c9a`.
2. Runtime prototype. A stub engine (`runtime/`) implements both variants. `runtime-b/` runs variant B on the real
   `@get-modular/resources`, built from `main` at `ca879f7`. The `node:test` probes check lifetime, memory,
   ordering, limits, error reports, and the echo and cascade guards. Mutation checks put one deliberate defect at a
   time into the stub; each defect must make at least one probe fail.
3. Writer tests. Writer agents (a smaller and a larger model) received only the variant's README and types, the
   resources README, and the task. They wrote nine modules: a logger, a catalog that loads data, a derived pricing
   context, a read-only greeter, an asynchronous factory, a watch and a load in one module, a parent and a child,
   per-request tickers, and error reporting. A behavior gate graded each module: static rules, compile on both
   compilers, and a behavior scenario on the stub. Round 1 compared variants A, B and C on four tasks with a compile
   gate and was graded by hand (`GRADING.md`). Rounds 2 to 5 were blind: the writers ran no checker.
4. Adversarial reviews. Four review passes attacked the design with their own probes: `ADVERSARIAL.txt` (F1 to F13),
   `ADVERSARIAL-2.txt` (N1 to N11), `ADVERSARIAL-3.txt` (M1 to M6) and `ADVERSARIAL-4.txt` (L1 to L4). Fixes and owner
   decisions followed each pass.

`tools/run-all.sh` repeats every measurement except the writer runs.

## Results in short

- Original `tools/run-all.sh`: all 43 steps as expected. On 2026-10-17 this archive was restored with the steps below and
  run again: all 43 steps as expected, and only timing numbers differ in four result files.
- Mutation checks: every deliberate defect is caught, 15 by the stub probes and 16 by the probes on the real
  resources package.
- Writer tests. The `blind-check.txt` files are the gate results at the time of each run, as recorded (modules that
  passed, out of nine):

  | Round | Variant | Smaller model | Larger model |
  | --- | --- | --- | --- |
  | 2 | A | 9/9 | 9/9 |
  | 2 | B | 8/9 | 9/9 |
  | 3 | B | 8/9 and 9/9 (two runs) | 9/9 |
  | 4 | B | 9/9 | 9/9 |
  | 5 | B | 9/9 | none |

  Both 8/9 results are task h (per-request tickers), and both were gate calibration, not writer errors:
  - Round 2, `runs/r2-b-snapshot-small-1`: the gate required a child scope per ticker and counted subscriptions, so
    it failed one module-level subscription that fans out to the screens. That design is correct and does not leak.
    The gate was calibrated again; re-checked with the gate as of the first review, its task h passes.
  - Round 3, `runs/r3-b-snapshot-small-1`: the module threw the screen failures again as one `AggregateError`, which is
    correct; the gate recognized only the raw error. After a later calibration it passes 9/9 on the final gate,
    and its design is kept as `reference/alternative/b-snapshot-2/h-requests.ts`.

  The final gate is stricter (F11 of the first review: two throwing screens, and every failure must be reported).
  Under it, `runs/r3-b-snapshot-small-2` reports only the first screen failure in task h, a real semantic shortfall.
  The round 2 smaller-model run has the same shortfall in task h (its design is kept as
  `archive/round3-alternative-first-error-only/h-requests.ts`). The round 2 runs also fail tasks e and i on the
  final gate, only because the contract changed later on purpose: `openAuditLog` now takes a signal and is closed
  with the module's scope, and `ListenerError` is branded, so a hand-built report no longer compiles. These are
  contract changes, not writer errors.

  Rounds 4 and 5 (three runs) and `runs/r3-b-snapshot-large-1` pass 9/9 on the final gate. Rounds 4 and 5 ran before
  the third and fourth reviews, which changed mostly the README and doc comments and a few types; their outputs pass
  the final gate unchanged.
- The fourth review reported no blockers. The later independent review of pull request #182 found four additional
  gaps in the prototype and types; their corrections are recorded below. Earlier known items remain in
  `b-snapshot/RATIONALE.txt`, section 13.

## Corrections after the independent review (2026-10-17)

The independent review of pull request #182 at `b43ef11468ec3fe8b46e9e09f3d667d7aad96ca8` reproduced the original
43-step run and found four cases that it did not cover:

| Gap | Corrected behavior and regression |
| --- | --- |
| `onResult` and `onError` lost echo and cascade context before their queued microtasks ran | Each callback has a delivery task whose context includes its complete microtask checkpoint; publication checks that the result is current immediately before the callback |
| A fake global clock installed before import disabled the real testing deadline | `./testing` captures the `node:perf_hooks` clock through `process.getBuiltinModule` where available; the fake-clock environment probe waits for an actual timeout |
| A fixed property hid an infinite template index signature from `FixedKeys` | Every key constituent is checked; mixed open-key records are rejected on both compilers, alongside finite-key positive cases |
| Without `AsyncLocalStorage`, the internal startup await also lost synchronous loader context | The direct loader call enters the context after that await; the simulated non-Node probe checks an echo before the loader's first await |

The corrected `tools/run-all.sh` completes all 45 steps with the expected outcomes, including 19 new runtime
regressions. The mutation probes still reject all 15 stub-engine defects and all 16 real-resources defects. The
stale-result probes also cover a commit between queuing a result and delivering its callback.

The runtime regressions are in `runtime-b/review-regressions.test.ts`, the environment cases in
`runtime-b/env-probe.ts`, and the type cases in `probes/p9-traps.b.ts` (each stored with the extra `.txt` suffix).
The [dated correction record](raw/api-design/corrections-2026-10-17/README.md) gives the executed commands, results
and limits. Original run logs and writer outputs remain unchanged; these corrections do not constitute a new writer
round or package admission.

## Supported environments

From `RATIONALE.txt`, section 5: "Supported environments: Node 24 and 26 fully (asynchronous detection, setImmediate
ordering); Bun verified by the reviewer (getBuiltinModule and AsyncLocalStorage propagation present). Elsewhere:
synchronous detection only, and no ordering guarantee beyond "a later task"."

## Reproducing the API checks

You need Node 26 (the runs used 26.11.0), npm, pnpm 11.20.0, git, a clone of this repository (`<get-modular>`
below) and a `tsc7` command that runs TypeScript 7.0.2. `run-all.sh` calls `tsc7` directly; `check.sh` also accepts
`TSC7=/path/to/tsc`. One way to get `tsc7`:

```sh
npm install --prefix <scratch>/tsc7 typescript@7.0.2
mkdir -p <scratch>/bin
printf '#!/bin/sh\nexec node <scratch>/tsc7/node_modules/typescript/bin/tsc "$@"\n' > <scratch>/bin/tsc7
chmod +x <scratch>/bin/tsc7
export PATH="<scratch>/bin:$PATH"
```

Then restore the directory outside the repository and run it. `runtime-b` needs `@get-modular/resources` built
from `main` at `ca879f7`, so step 4 builds it.

```sh
# 1. Copy the evidence and restore the file names (the loop variable is not `path`: zsh ties it to PATH).
cp -R <get-modular>/research/module-communication-2026-10/raw/api-design <scratch>/api-shape
cd <scratch>/api-shape
while IFS= read -r f; do mv "$f.txt" "$f"; done < renamed-files.txt
chmod +x check.sh tools/*.sh

# 2. TypeScript 5.8.3, Get Modular 0.4.0 and resources 0.1.0 from npm.
(cd .toolchain && npm ci)
ln -s .toolchain/node_modules node_modules

# 3. Assembly and resources sources of main at bcd4c9a, for the --gm-main probe.
mkdir .gm-main
git -C <get-modular> archive bcd4c9ad0fe47e58dccdfa172f1cb58e6a501ac3 packages/assembly/src packages/resources/src | tar -x -C .gm-main
echo bcd4c9ad0fe47e58dccdfa172f1cb58e6a501ac3 > .gm-main/SOURCE_COMMIT

# 4. @get-modular/resources built from main at ca879f7, for runtime-b. Copy it, do not link it:
#    a probe checks that the package resolves inside .gm-resources-main.
mkdir <scratch>/gm-ca879f7
git -C <get-modular> archive ca879f773fbbf8977bba8a348cc5a34660603067 | tar -x -C <scratch>/gm-ca879f7
(cd <scratch>/gm-ca879f7 && pnpm install --frozen-lockfile --ignore-scripts && pnpm --filter @get-modular/resources build)
mkdir -p .gm-resources-main/packages
cp -R <scratch>/gm-ca879f7/packages/resources .gm-resources-main/packages/resources
rm -rf .gm-resources-main/packages/resources/node_modules
echo ca879f773fbbf8977bba8a348cc5a34660603067 > .gm-resources-main/SOURCE_COMMIT
mkdir -p runtime-b/node_modules/@get-modular
ln -s ../../../.gm-resources-main/packages/resources runtime-b/node_modules/@get-modular/resources

# 5. Run every measurement (about 4 minutes); raw outputs go to results/.
bash tools/run-all.sh
```

The resources build of step 4 was byte-identical to the one the measurements used. To grade a writer run, use
`./check.sh b-snapshot runs/r5-b-snapshot-small-1`. The two synthesis B probes in `raw/critiques/synth-b-probe/` only
need the `.txt` removed.

## Changes to the files

This copy differs from the working originals as follows.

- File names: every code and configuration file under `raw/` carries an extra `.txt`, so repository tooling does not
  treat research code as source. The list is `raw/api-design/renamed-files.txt`, plus the two files in
  `raw/critiques/synth-b-probe/`. `reviews/critic-adv/sig/structural-members.ts.txt` had its `.txt` already and is
  not in the list. The shell scripts lost their executable bit.
- Layout: the reports moved into `practices/`, `surveys/` and `critiques/`; the catalog files were renamed as listed
  above; `.toolchain/` holds only `package.json` and `package-lock.json`.
- Neutral names: absolute local paths became `scratchpad/` or `<workspace>/`. Model names of the writer agents became
  "smaller model" and "larger model", also in run directory names (`-small-`, `-large-`). Agent names in the reports
  became role names, such as "architecture critic", "naming critic" and "synthesis B". A reference to a private
  instructions file and one mention of a model setting became neutral words. No finding, number or verdict changed.
- Added: one dated archive note in `b-snapshot/RATIONALE.txt`, section 3.3, that adds the later F11 result to its
  summary of the round 2 and 3 writer runs.
- Corrected after the independent review: the selected B types, prototype, regression cases and their current
  documentation. `corrections-2026-10-17/` records this successor separately from the original measurements.
- Left out: the reviewers' full copies of the API directory, copies of Get Modular sources, `node_modules`, build
  output, and the generated `.gm-main` and `.gm-resources-main` (step 3 and 4 rebuild them). Some reviewer files that
  the reports cite are not here: `critic-adv/gm05/`, the `critic-variants/` and `critic-msg/` directories, the
  modified stub copies (`runtime-als`, `runtime-bounded`, `runtime-signal`), `critic-adv/node/`, the reviewers' own
  run logs, and the grader's copies of solutions and of the stub. The `critic*` test files of all passes are kept in
  their latest form, under `reviews/critic-adv/api4/runtime-b/`.
