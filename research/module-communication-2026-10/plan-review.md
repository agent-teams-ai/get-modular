<!-- cspell:ignore builtins microtask microtasks nodenext oxlint subpaths -->

# Independent review of the observation implementation plan

Date: 2026-10-17. This is a non-normative review record for
[implementation-plan.md](implementation-plan.md), not another contract or an implementation approval.
The reviewer did not edit the plan, package source, accepted decisions or parallel PR branches.

## Inputs and verdict

| Input | Exact reviewed identity |
| --- | --- |
| Get Modular main | `a3a079baca2c6af48c9d45bc08992825be1c2bbd` |
| ADR-0034, PR #154 | `945e9a151a516ce4ce6e73b6e18893d4e5b27cfe` |
| Research corrections, PR #183 | `cfdaa18f152aac614194be710a474f4d4b06f59a` |
| Supplied research checkout | `b43ef11468ec3fe8b46e9e09f3d667d7aad96ca8` |
| Tree shared by that checkout and main | `fbb9a1e2e1af373c49f2253f93dca6efc74db87d` |
| Revised plan Git blob | `3bf5ec6b6cfdc5aed4c0106687a1df58a7068a82` |

The full original plan and handoff were reviewed against the exact ADR, selected API and prototype sources,
repository checks, the pinned organization Feature Module Standard v1 and the current Engineering Quality Standard.
The final pass reviewed the revised plan and its 281 added / 93 removed lines. No unresolved critical finding
remains in that planning diff. The original T01 through T112 rows remain; T113 explicitly maps the accepted private
queue requirement. These rows specify future evidence, not passed tests.

At review, #154 and #183 remained open. Phase 0 still stops without ADR-0034 on main. Before Phase 1b, #183 must be
merged or supplied as a coordinated reviewed predecessor. PR #184 owns the separate fixture/scale plan, and #186
owns the CMS maintenance instruction; this review changes neither branch or scope.

## Disposition of the eight handoff findings

| Finding | Final disposition |
| --- | --- |
| Stale ADR digests | Closed in section 2: read the merged ADR and registry from the same fetched main; compare with the reviewed ADR, compute current digests and stop if the ADR is absent. No accepted registry rewrite. |
| Frozen CMS SDK-growth evidence | Closed in Q3, Phase 2b and T90: preserve the entire evidence file; update the separate current CMS pin and record consumer migration or outstanding work. The current ADR already resolves the old conflict. |
| Alleged missing Hand-off link | Not reproduced in the supplied original plan. New section 18 supplies useful navigation and explicitly records that distinction. |
| Short probe paths and ambiguous p5 | Closed by section 9.0: exact files and destinations; p5 B is selected and the old A form is excluded. |
| Node selection and machine paths | Closed by section 2.1: separate package/tooling floors, explicit executable selection, pinned pnpm and direct CLI invocation when a launcher selects another Node. Original machine paths are examples. |
| Authoring surface declaration | Source confirmed, retained as a release-note convention. Historical conformance changeset `a01a129d39fe6574dba39e6187bb03ef6bcf9945` contains the declaration; this adds no Changesets schema field or checker. |
| Ownership test overlap with #154 | Closed in Phase 2b: preserve the ADR assertion and historical CMS pins; change only the current CMS successor assertion after predecessor integration. |
| Nine store source files | Closed in section 11.4: all nine files are listed and the actual YAML paths expand the stated prefix. |

## Additional findings closed by the revision

- The #183 loader/publication correction is explicit: result/error callbacks own later delivery tasks and complete
  microtask windows, currentness is checked at actual publication, and queued publication counts for testing waits
  without keeping a settled loader active for drain. R16/R17 and strengthened stale/close oracles are required.
- The clock comes from the builtin performance facility where available. The fake-clock case and source allowlist
  include it. The existing limit on mocks of the builtin method itself is preserved.
- `FixedKeys` checks each key constituent; mixed open-key negatives and finite-key controls are carried forward.
  The synchronous loader call enters its context after the startup await, with explicit no-ALS environment cases.
- T40 covers all four callback hooks, reporting and later deliveries. T35 separately checks that watch registers no
  resource entry. T43 does not rely on handler registration order. T21/T54 cover failed ownership transfer.
- The private FIFO has one owner in `delivery/context.ts`, removes each node before invocation and clears its links.
  It registers one native task immediately for each node, retains per-store coalescing and consecutive context-close
  pairs, and does not batch callbacks. Result/error publication has separate pairs. No public scheduler, queue API
  or new package is added. Multi-store ordering and the drained closed-store GC control remain implementation gates.
- Bootstrap installs locked dependencies and builds resources before compiling observation. Assembly cancellation
  follows the existing failed outcome instead of expecting `run()` to reject. TEST receives all five exact archives,
  and the static-rules fixture path now points into the package.
- Source-shape tests retain independent literals, existing diagnostics and condition ordering. Mutation detection
  requires a semantic failure or its designated bounded hang, not a broken import or fixture setup. Concurrency is
  bounded. The GC design checks specific retention with controls; it claims no absolute heap or timing bound.

## Path inventory checked against main

These 32 existing files were checked in the checkout whose tree equals main. Future observation source/test files
listed by the plan were reviewed as proposed outputs, not reported as existing files.

```text
architecture/checks/leaf-packages.mjs
architecture/checks/leaf-package-admission.mjs
architecture/checks/production-artifacts.mjs
architecture/tooling/build-leaf-package.mjs
tests/leaf-package-admission.test.mjs
tests/governance.test.mjs
tests/ownership-checkpoint.test.mjs
tests/ci-check-lanes.test.mjs
tests/node-runtime-compatibility.test.mjs
architecture/feature-module-standard-profile.json
architecture/foundation/source-dependencies.yaml
architecture/foundation/quality-source-coverage.yaml
architecture/foundation/suppression-governance.yaml
architecture/foundation/repository-agent-workflow.yaml
packages/resources/tsconfig.json
packages/resources/tsconfig.types.json
packages/resources/src/features/scope/types.ts
packages/resources/README.md
packages/conformance/tests/packed-root.test.mjs
tests/assembly/consumer-standard-examples.test.mjs
architecture/tooling/test-assembly-types.mjs
research/module-communication-2026-10/raw/api-design/b-snapshot/api.d.ts.txt
research/module-communication-2026-10/raw/api-design/b-snapshot/testing.d.ts.txt
research/module-communication-2026-10/raw/api-design/runtime/core.ts.txt
research/module-communication-2026-10/raw/api-design/runtime-b/probes.test.ts.txt
research/module-communication-2026-10/raw/api-design/probes/p3-variance-controls.ts.txt
research/module-communication-2026-10/raw/api-design/probes/p5-gm-contracts.b.ts.txt
research/module-communication-2026-10/raw/api-design/probes/p5-gm-contracts.a.ts.txt
research/module-communication-2026-10/raw/api-design/probes/p10-gm-main-implement.b.ts.txt
research/module-communication-2026-10/raw/api-design/tools/tsc-both.mjs.txt
research/module-communication-2026-10/raw/api-design/tools/readme-check.mjs.txt
research/releases/0.5.0-train/release-intent.md
```

## Commands, observed results and limits

The following 19 root script definitions were inspected; this list does not claim they were all executed:

```text
docs:info
governance:check
governance:test
release-owned-files:check
foundation:check
lint:typed
sdk-growth:check
architecture:feature-module-profile
architecture:feature-module-profile:test
resources:build
resources:check
assembly:test
docs:protocol:check
docs:quality
ownership:checkpoint:test
release:version
check:changed
check:fast
check
```

Executed during this review: Git tree comparison and clean-checkout inspection, historical changeset reads,
`docs:info`, both compiler version commands, installed manifest reads and a current CMS SHA-256 calculation.
Observed: TypeScript 7.0.2 / 5.8.3, oxlint 1.83.0, Foundation 1.7.4, Changesets 3.0.2; CMS digest
`e5cb510c5ea83e54a6833cc40b6ad31fc5cf8c70d9838e4e0c6923edc6f70919`.
`docs:info` succeeded using the explicit Node 26.11.1 executable and pinned pnpm CLI; the default Node 24.19.0
launcher was rejected by the existing tooling engine policy. The policy was not relaxed.

This reviewer did not run the future observation package tests, implement or benchmark the FIFO, produce release
archives, complete TEST, merge a PR or publish a package. Full repository/CI results from the delivery track are
separate evidence. The archive results read from #183 belong to their recorded sources and environments. This
review establishes plan reconciliation only; package admission, platform behavior and release readiness remain
subject to the plan's implementation and release gates.
