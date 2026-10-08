# OBS-2 brief: add `@get-modular/observation`

PR title: `feat(observation): add @get-modular/observation`. One PR: package root,
implementation, tests, leaf admission row, gates, CI lanes, README, changeset
and the REL-2 amendment. Base: `main`.

Authority: ADR-NNNN (OBS-1), all sections. Reference implementation: sketch v4
in `research/observation-hooks-2026-10/raw/evidence/code-sketch/hooks-sketch-v4/src/lib/observation/`
(files end in `.ts.txt`; restore names in a scratch copy, never inside the
repository). Defects that sketch v4 still has:
`research/observation-hooks-2026-10/sketch-v4-known-defects.md`. Template for
every admission and gate edit: PR #141 (`@get-modular/conformance`, a public leaf
with peers), read with `gh pr diff 141 --repo agent-teams-ai/get-modular`.

## Re-verify before start

1. `git fetch origin`; record `origin/main`. OBS-1 is merged: ADR-NNNN is
   accepted, OD-007 is resolved, `implementationBlockers: []`. Otherwise stop.
2. Train 1 is released: `packages/resources/package.json` is at 0.1.0 or later,
   `.changeset/` holds no train 1 changeset, and
   `npm view @get-modular/resources version` prints the same version. Otherwise
   stop: the new changeset would fold into the train 1 release.
3. `ls .changeset/` and `gh pr list --repo agent-teams-ai/get-modular --state open`:
   note every open train 2 PR (T2-2 to T2-5, REL-2). If REL-2 is already open:
   stop and ask (the package then needs its own release PR).
4. `git log --oneline 9e09e90..origin/main -- architecture/checks/leaf-packages.mjs architecture/checks/leaf-package-admission.mjs package.json .github/workflows/ci.yml architecture/foundation tests/leaf-package-admission.test.mjs tests/ci-check-lanes.test.mjs`:
   read every change since this brief was written; the rule "a leaf may peer
   only on Core, Assembly or an earlier public row" must still hold
   (`peerProblem` in `leaf-packages.mjs`).
5. The resources API on `main` still matches the drift table in
   `sketch-v4-known-defects.md`: `CleanupContext` is `{ escalate }`, the closed
   code is `resources.scope.closed`, `Resources.setup(spec)` returns
   `Promise<T>`. Otherwise stop and report the difference.
6. Node per `.node-version`; `pnpm install --frozen-lockfile`; free disk space
   of at least 5 GB (the full gate packs and installs archives). Record
   `pnpm conformance:check` time as a baseline.

## Owner decisions (facts) and open questions

See OBS-1 "Owner decisions". In short: public 0.1.0 released with train 2;
resources is the only peer; 0.1.0 contains `sync`, `derived` and the escape
hatch; no production consumer in this delivery (TEST first). Open questions:
none. Anything this brief does not cover: stop and ask.

## Scope and non-goals

Scope: `packages/observation/**`; the leaf row; root scripts and gate chains;
CI lanes; the Foundation, FMS and agent-workflow configuration that #141 touched
for conformance; the tests #141 touched for admission; the root devDependency
and lockfile; `README.md` package list; `.changeset/add-observation-package.md`;
the REL-2 amendment (A7).

Non-goals: Core, Assembly, resources or conformance source; the Consumer Module
Standard (OBS-3); the TEST consumer (OBS-T, in modularity-host-test);
`public-api-compatibility.yaml` (not enrolled while G1 is on hold); any change
to an accepted ADR.

## A1. Package root and manifest

Create `packages/observation/` with the same files as `packages/conformance/`:
`package.json`, `tsconfig.json`, `tsconfig.types.json`,
`tsconfig.types.bundler.json`, `README.md`, `CHANGELOG.md` (`# Changelog` only),
`LICENSE` (copy of conformance's), `src/`, `tests/`.

`package.json`: copy conformance's and change `name`
(`@get-modular/observation`), `description` ("In-process settings sources and
opt-in change participants for Get Modular modules."), `repository.directory`
(`packages/observation`), the `build` script argument (`observation`), and
`peerDependencies` to exactly `{ "@get-modular/resources": "workspace:^" }`.
Keep `version: "0.0.0"`, `sideEffects: false`, `engines`, `exports`, `files`,
`publishConfig`, `license`, `type`. No `dependencies`, `devDependencies`,
`peerDependenciesMeta` or install scripts.

The three tsconfig files: copy conformance's and adjust paths only.

## A2. Source

Layout (one feature per folder, imports with `.js` suffixes as in conformance):

| File | Content (from sketch v4) |
| --- | --- |
| `src/features/errors/errors.ts` | `ObservationError`, `ObservationErrorCode` (from `contract.ts`) |
| `src/features/isolation/isolation.ts` | `invokeIsolated`, `safeReport`, `Report` (from `callback-isolation.ts`) |
| `src/features/source/types.ts` | `Values`, `Key`, `Keys`, `SourceId`, `Snapshot`, `SnapshotRef`, `Reader`, `View`, `Observation`, `ObserveOptions`, `ObservationPort` |
| `src/features/source/keyed-source.ts` | `createKeyedSource`, `KeyedSource` |
| `src/features/source/diagnostics.ts` | internal diagnostics (from `internal-diagnostics.ts`); never exported from the root |
| `src/features/derivation/latest-derivation.ts` | `createLatestDerivation`, `LatestDerivation` |
| `src/features/participants/participants.ts` | `participantsFor`, `Participant`, `ParticipantFactory`, `ParticipantOutcome`, internal `planOf`/`Plan`/`Running` |
| `src/features/hub/hub.ts` | `startHub`, `Hub` |
| `src/composition/root.ts` | re-exports the four factories (as conformance does) |
| `src/index.ts` | the public root (A2.1) |

Allowed edges (declare them as boundaries in A5): `isolation -> errors`;
`source -> errors, isolation`; `derivation -> errors, isolation`;
`participants -> source (types), isolation, derivation`;
`hub -> errors, source (types), participants, @get-modular/resources (types and
the closed code only)`; `composition -> all features`. No other edge. Only `hub`
imports resources.

### A2.1 Public root

```ts
export { createKeyedSource, participantsFor, startHub, createLatestDerivation } from "./composition/root.js";
export { ObservationError } from "./features/errors/errors.js";
export type { ObservationErrorCode } from "./features/errors/errors.js";
export type {
  Key, Keys, Observation, ObservationPort, ObserveOptions, Reader, Snapshot, SnapshotRef, SourceId, Values, View,
} from "./features/source/types.js";
export type { KeyedSource } from "./features/source/keyed-source.js";
export type { Participant, ParticipantFactory, ParticipantOutcome } from "./features/participants/participants.js";
export type { Hub } from "./features/hub/hub.js";
export type { LatestDerivation } from "./features/derivation/latest-derivation.js";
```

`HubResources` is gone (C1). Nothing else is exported.

### A2.2 Changes against sketch v4 (each is a review item)

- **C1 resources peer.** Delete `HubResources`. `startHub`'s context is
  `Readonly<{ resources: Resources; participantIds: readonly string[]; reportError: Report }>`
  with `import type { Resources } from "@get-modular/resources"`. The drain
  entry's cleanup reads `(cell, { escalate }) => cell.running?.closeAndDrain?.(escalate)`.
  Give every entry a non-empty name (`drain:<id>`, `subscription:<id>`) as
  resources requires.
- **C2 closed code.** `isScopeClosed` compares
  `code === "resources.scope.closed"`. Import no class for it.
- **C3 start race** (known defect "Hub start"). Record the started `Running` in
  the participant's drain cell inside the subscription's `setup` callback,
  before it returns, so a scope that closes during start still drains the
  derivation. Test: close the hub's scope while the second participant starts;
  the report must not be `complete` while the first derivation runs, and the
  derivation's abort must be observed.
- **C4 seal during delivery** (known defect "Delivery"). The flush loop checks
  `sealed` before each registration. Test: the first registration's callback
  seals the source; no later registration receives that batch.
- **C5 accessors** (known defect "Value ownership"). The plain-data check reads
  property descriptors (`Object.getOwnPropertyDescriptors`) and rejects any
  accessor with `observation.values.not-plain`, at every depth and on the
  top-level `initial` and `patch` records. `commit` and `createKeyedSource`
  validate once and merge only the values captured during validation (no second
  read through spread). Tests: a getter on the patch record, on `initial`, and
  nested; each throws and leaves the source unchanged.
- **C6 `__proto__` keys** (known defect "Projections"). Projections and merged
  records are built with `Object.defineProperty` (or null-prototype objects
  frozen afterwards) so every key, including `__proto__`, is an own data
  property. Test: a source with key `__proto__` reads, observes and commits it.
- **C7 revisions** (known defect "Revisions"). `LatestDerivation.offer` throws
  `ObservationError("observation.derivation.invalid-revision")` unless the
  revision is a non-negative safe integer. Add the code to
  `ObservationErrorCode`. Tests: `NaN`, `Infinity`, `-1`, `1.5`.
- **C8 abort listeners** (known defect "Cancellation isolation"). Call
  `controller.abort()` directly; delete the `invokeIsolated` wrapper around it.
  The README states the policy of ADR-NNNN "Signals and scheduling". Test in a
  child process (`node:child_process` `spawnSync` of a small script, as resources'
  probes do): a `derive` adds an `abort` listener that throws; the child counts
  `uncaughtException` events and checks that a later `offer` still publishes;
  exit code 0 and one counted event.
- **C9 optional keys** (known defect "Key types"). Reject record types with
  optional properties at the type level. Start with
  `export type Values = object;` plus the constraint
  `V extends Values & { [K in keyof V]-?: V[K] }` on `createKeyedSource` and
  `participantsFor`. Negative fixture: `{ a?: string }` fails on TypeScript
  7.0.2 and 5.8.3; positive fixture: `{ a: string | undefined }` passes, and an
  `interface` record passes. If the constraint does not hold on both compilers,
  stop and report the measured result; do not ship a partial rule.
- **C10 stale results** (known defect "Stale-result check"). The A->B->A test
  records every publication and asserts that the stale result never publishes;
  hold the newest run while releasing the stale one. Mutation: force `isCurrent`
  to `true` -> the test must fail.
- **C11 diagnostics.** Keep `registerDiagnostics`/`inspectSource` internal.
  Package tests import them from `../dist/features/source/diagnostics.js`;
  nothing else does.
- **C12 comments.** Port the sketch comments that state contract rules; drop
  comments that refer to the sketch, TEST stand-ins or review rounds.

Everything else follows sketch v4 behavior. When the sketch and ADR-NNNN
differ, the ADR wins; when the ADR is silent and the sketch looks wrong: stop
and ask.

## A3. Tests

`packages/observation/tests/observation.test.mjs` (`node:test`, imports
`../dist/index.js` and resources from its package name):

1. Every check of sketch v4 `main.ts` that concerns the package (30 checks;
   skip the Greeter, price-table and tax-table fixture assertions, which belong
   to OBS-T), rewritten as `test(...)` cases against the real resources
   package.
2. C3 to C10 above.
3. A seeded model-based test: 200 seeds x 200 steps of random `commit`,
   `observe`, `unsubscribe`, `seal` and `tick`; after each quiescent point
   assert: the last delivered snapshot equals `read(keys)`; revisions strictly
   increase per registration; deliveries never exceed the commits that touched
   the keys; nothing after `seal` or `unsubscribe`; listener counts return to
   baseline after every unsubscribe. Use `mock.timers` with `tick(0)`; never
   `runAll()` (it throws `ERR_INVALID_ARG_VALUE` with a pending `setImmediate`
   on Node 24 and 26).
4. Dispatch cost: 10,000 registrations on an unrelated key do not change the
   registration visits of a commit to key `K` (internal diagnostics).
5. A throwing `reportError` surfaces as one uncaught error in a child process
   and does not stop other deliveries.
6. Resources integration: closing the hub's scope unsubscribes everything before
   draining; an escalated stuck drain yields the debt
   `observation.derivation.still-running` with a path that names the
   participant, and the scope continues past it; `resources.scope.closed`
   passes through `startHub` unwrapped.

`packages/observation/tests/types.ts`: positive and negative type fixtures
(variance `in out`, async callback rejected for `=> undefined`, C9), compiled by
the typecheck command on both compilers with NodeNext and Bundler.

`packages/observation/tests/packed-root.test.mjs`: copy conformance's packed-root
test; install the observation archive together with the resources archive and
assert the manifest (`peerDependencies` exactly resources with a `^0.` range, no
`workspace:`), the root exports and one sync participant round trip.

## A4. Leaf row, scripts and lanes

- `architecture/checks/leaf-packages.mjs`: append a row after conformance, same
  shape: `id: "observation"`, `name`, `root`, `publication: PUBLIC`, the same
  0.x version regex with the comment `// ADR-NNNN: public 0.x; ...`,
  `peers: ["@get-modular/resources"]`, `decision` (`id`, `path`, `fileDigest` =
  `sha256:` of the ADR file bytes, `immutableDigest` from
  `accepted-decisions.json`), `extension` (`id: "module-change-observation"`,
  `authority`: the ADR path), `requiredTests` (`observation.test.mjs`,
  `packed-root.test.mjs`), `commands` (the five `observation:*` commands built
  like conformance's), `gate: "observation:check"`.
- Root `package.json`: the five `observation:*` scripts byte-equal to the row;
  `pnpm observation:check` right after `pnpm conformance:check` in `check` and
  `check:fast`; devDependency `"@get-modular/observation": "workspace:*"`.
  `pnpm install` updates the lockfile importer; nothing else in the lock may
  change.
- `.github/workflows/ci.yml`: `observation:build` right after
  `conformance:build` in the core, assembly, governance and static lanes;
  `observation:check` right after `conformance:check` in the packaging lane;
  in the Node 26 job `pnpm observation:build` and
  `pnpm --dir packages/observation pack` after conformance.

## A5. Admission configuration and tests (follow #141 file by file)

Make for observation exactly the kind of edit #141 made for conformance in:
`architecture/foundation/source-dependencies.yaml` (`packageRoots`,
`governedRoots` src and tests, one boundary per feature with the edges of A2,
the composition and public-entrypoint boundaries, the `-development` boundary,
`allow.packages` with `@get-modular/resources` only where A2 allows it);
`architecture/foundation/quality-source-coverage.yaml`;
`architecture/foundation/suppression-governance.yaml`;
`architecture/feature-module-standard-profile.json`;
`architecture/foundation/repository-agent-workflow.yaml` (`fullScanPaths`, added
by #145 after #141: add the four observation paths like the other leaves) and
its test list in `tests/repository-agent-workflow.test.mts`;
`tests/leaf-package-admission.test.mjs` (pin test for the row);
`tests/assembly-admission.test.mjs`; `tests/feature-module-standard-profile.test.mjs`;
`tests/ci-check-lanes.test.mjs`; `tests/node-runtime-compatibility.test.mjs`;
`tests/governance.test.mjs` and `tests/ownership-checkpoint.test.mjs` where
PR #141 added conformance; `README.md` and `docs/architecture/feature-module-standard.md`
package lists.

A failing admission check is fixed in the source or the configuration listed
here, never by narrowing a gate or skipping a root (AGENTS.md).

## A6. README and changeset

`packages/observation/README.md` (English): purpose; install (one copy, peer
resources); the three facets of a source; `sync` and `derived` participants
with the module usage example of `research/observation-hooks-2026-10/design.md`
section "Minimal public API v0.1"; Host wiring (participant identifiers from the
declarations that provide the participant capability, one scope per hub, shutdown
= `seal()` then the scope's `close({ escalate, abandon })` with timers that keep
the process alive); the escape hatch; delivery rules; signals and scheduling
policy; the error code table (every `ObservationErrorCode`); what the package
does not do (the ADR non-goals).

`.changeset/add-observation-package.md`:

```markdown
---
"@get-modular/observation": minor
---

Add `@get-modular/observation` 0.1.0: in-process keyed sources and opt-in
`sync` and `derived` participants for Get Modular modules, with
`@get-modular/resources` as its only peer.

Authoring surface changed: yes
```

## A7. REL-2 amendment

Train 2's `research/contract-evolution-2026-10/briefs/REL-2-release.md` stops
on any changeset it does not list. In this PR, amend it so the observation
release is explained:

- title and commit subject: "... conformance 0.2.0 and observation 0.1.0";
- re-verify 1: expect also `add-observation-package.md`;
- re-verify 3: add `observation` to the `npm view` inventory; 0.1.0 must not
  exist;
- re-verify 4: add "observation minor 0.1.0";
- build: `pnpm observation:build` after conformance;
- expected paths: `D` the observation changeset, `M`
  `packages/observation/package.json` (version only) and its `CHANGELOG.md`;
- pack loop and manifest checks: observation peers `@get-modular/resources` with
  the current resources minor; record its SHA-256 and SHA-512;
- publication order: observation last.

Also amend `research/contract-evolution-2026-10/README.md` section 3.1 item 9
("Out of scope: ... hooks/observation") to "hooks/observation are a separate
track (`research/observation-hooks-2026-10/briefs/`); its package is released
with REL-2". If a train 2 PR has these files open: coordinate with its author
instead of editing them.

## Landing

Full `pnpm check` locally after the last commit (with the no-hooks git config of
OBS-1), then CI: all 30 lanes and six aggregates green, every lane under 810 s.
PR body: what the package is, the ADR, the C1-C12 list with test names, the
admission files, the REL-2 amendment, measured gate times.

## Risks and stop conditions

| Risk | Stop / action |
| --- | --- |
| train 1 not released, or REL-2 already open | stop (re-verify 2, 3) |
| a T2-3/T2-4 PR lands first and touches the same gate files | rebase, re-run every gate; never drop their edits |
| C9 type rule does not hold on both compilers | stop and report measurements |
| the peer rule rejects resources | stop; never change `peerProblem` in this PR |
| a lane exceeds 810 s | stop and report the lane and time |
| a gate fails in a way this brief does not explain | stop; never weaken it |
| sketch behavior contradicts ADR-NNNN | the ADR wins; unclear: stop and ask |

## Must not

- Import Core, Assembly, Node built-in modules or anything but resources from
  package source; export diagnostics; add a subpath export.
- Edit resources, conformance, Core or Assembly source, an accepted ADR or
  `public-api-compatibility.yaml`.
- Copy sketch files into the repository with a `.ts` suffix outside
  `packages/observation/src`.
- Merge, request reviewers or comment outside the own PR. Override the git
  identity, add co-author trailers or tool attribution.

## Done

Package admitted with its row, implementation and tests in one PR; C1-C12
covered by named tests; every gate green locally and in CI; REL-2 brief amended;
README and changeset present.

## Review checklist

- `git diff --stat origin/main...HEAD` touches only the files of A1-A7.
- `git grep -n "HubResources\|scope-closed\"" packages/observation` returns
  nothing; `git grep -n "@get-modular/resources" packages/observation/src` hits
  only `hub.ts`.
- `git grep -n "invokeIsolated(() => { controller.abort" packages/observation`
  returns nothing (C8).
- Every C-item has a test whose name says which item it covers.
- Mutations (locally, then revert), each must make a test fail: remove the
  per-registration `sealed` check (C4); read a patch value twice (C5); assign
  projection keys with `=` (C6); accept `NaN` in `offer` (C7); force
  `isCurrent` to `true` (C10); record the drain cell after `setup` resolves
  (C3); swap the drain and subscription registration order (LIFO test).
- The packed manifest names exactly one peer, `@get-modular/resources`, with a
  caret range of the current resources minor.
- The REL-2 amendment lists exactly the observation additions and nothing else.
