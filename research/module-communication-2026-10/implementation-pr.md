# Proposed PR: implement scoped module observation and checked TypeScript 7 tooling

Target: `agent-teams-ai/get-modular`, base `main`, head `feat/observation-0-1-e2e`.
The package and exact-archive consumer pass their scoped qualification. Keep the
PR draft while the upstream compiler and predecessor admission gates remain blocked.

## Why and implementation

Modules need explicit read-only state contracts, subscriber-owned lifetimes and
asynchronous work that cannot publish stale results or overlap physical cleanup.
The reviewed plan now has a working implementation in
[`packages/observation/src`](https://github.com/agent-teams-ai/get-modular/tree/feat/observation-0-1-e2e/packages/observation/src):
18 TypeScript source files, with `createStore`, `watch`, `load` and the testing entry.

The public root is `src/index.ts`; store behavior is in `features/store/store.ts`
and `engine.ts`, subscriptions in `watch.ts`, and serial asynchronous work in
`load.ts`. The README has compiled authoring examples. The
[external consumer PR #20](https://github.com/agent-teams-ai/modularity-host-test/pull/20)
installs the exact archives and exercises those public contracts.

## Changes

- Implement the optional `@get-modular/observation` leaf: one owner writer,
  read-only facets, revision catch-up, deferred/coalesced `watch`, serial `load`,
  physical drain, scoped close, attributed errors and echo/cascade guards.
- Preserve sound future snapshots, dynamic-key optionality and structural writer
  invariance. Port the independent runtime, declaration, writer and mutation controls.
- Add package admission and six CI lanes, update the maintained CMS and authoring
  guide, and check an actual testing-import restriction. Frozen CMS/API evidence
  and independent rejecting expectations remain unchanged.
- Migrate current compiler/parser owners to TypeScript 7.0.2 under ADR-0038.
  Minimum/current aliases are deduplicated by actual version while both resolvers
  and all non-compiler cases remain. Historical 97/282 evidence is preserved.
- Stop current Foundation CLI, Node runner and affected SDK routes before eager
  below-floor compiler initialization. Original downstream commands and identities
  remain required.
- Use ordinary `.ts` for the five active migrated tests/helpers, with ESM through
  `type: module`. Update imports, commands, strict compiler inputs, source routes
  and all eleven required identities together.
- Adopt the same checked-`.ts` direction in local agent routes and the
  [shared policy PR #368](https://github.com/agent-teams-ai/.github/pull/368);
  [platform-infra #484](https://github.com/777genius/platform-infra/pull/484)
  also has complete local AGENTS/Claude/Copilot instructions.

## Independent review and corrections

Initial API/watch/plan reviews and implementation reviews used the full owner
vision: deterministic composition, explicit module boundaries, one state writer,
read-only consumers, predictable subscription lifetime and host-owned effects.
The implemented 0.1.0 is state observation plus explicit command ports; a separate
durable event bus was outside the accepted scope.

The latest **GPT-6.1 xhigh** wave reviewed integration, strict compiler/admission
coverage and cross-repository policy. Two P2 findings were corrected and
independently verified to **zero actionable findings**:

1. Four handwritten fixture programs were only strings outside strict coverage.
   They are now actual `.ts` sources included in the two existing owning projects
   and copied unchanged. Each critic's original wrong-type counterexample now
   fails with TS2322 in the exact fixture source; independent runtime/rejection
   oracles still pass.
2. Organization source admission could accept a new `.ts` helper/test outside its
   strict inventory. Its existing checker now binds both, with the two original
   counterexamples rejected. No parallel checker framework was added.

Earlier follow-up review also closed the loader Promise-constructor context escape
and incomplete compiler guard coverage. First-CI fixes retained exact Windows
diagnostic attribution and corrected two stale Core/Assembly fixture counts.

The reviewed ordinary-`.ts` source is `5102438e70a618a342c93fe003bcfc3f057a1041`.
Its production runtime and declarations match the preceding package qualification.
The later Core test-only correction is `0edaea195399998f8f22d12b86e2c28e523589a4`:
a bounded native lock acknowledgment allowance, independently reviewed by a
GPT-6.1 xhigh critic with zero actionable findings. Package and writer inputs
remain unchanged.

## Validation

- Four existing strict tooling projects pass on Node **24.21.0** and **26.11.1**
  with actual **TypeScript 7.0.2**. The two corrected fixture projects and their
  TS2322 counterexamples were independently repeated on both Nodes.
- The affected harness selection has **21 passes and two existing Foundation
  blocks per Node**. Both copied retention driver scenarios and independent
  valid/invalid workflow source/docs controls pass. No blocked test is relabeled.
- Earlier exact CI [39122863587](https://github.com/agent-teams-ai/get-modular/actions/runs/39122863587)
  on `e5999805` passed all six Core, Assembly and Observation lanes, plus Node 24
  package compatibility. Each Observation lane passed **157 runtime tests with
  zero skips, 18 attributed mutations, 33 writer outcomes and the packed check**.
  Windows took 7:54 / 8:20, below the unchanged 13-minute target.
- First ordinary-`.ts` CI [39131898704](https://github.com/agent-teams-ai/get-modular/actions/runs/39131898704)
  on `bba50796` passed all six Observation and Assembly lanes and five Core lanes.
  Its 43 jobs comprise 18 successes, 18 exact Foundation compiler-floor blocks,
  one Windows Node 24 Core readiness failure and six aggregate failures. Every
  Observation lane retains 157 runtime passes without skips, 18 attributed
  mutations, 33 writer outcomes and packed checks; Windows took 7:40 / 8:20.
- The Windows log exceeded the old 10-second first-acknowledgment budget; it
  does not isolate PowerShell startup from first exception formatting. The
  correction allows 30 seconds for acknowledgment and 65 seconds overall,
  preserving the 25-second held-lock watchdog, both five-second close phases,
  exact protocol, mandatory acknowledgment, exit code 3 and cleanup assertions.
  Each pinned Node passes all five host protocol controls independently and
  11 owning-file tests, with three existing Linux/root conditional skips.
  This is a bounded maintenance exception in the existing
  `packages/core/tests/qualification/production-generation.test.mjs`; no new
  helper or legacy strict-coverage claim is introduced.
- A fresh native Windows CI result is required on the corrected exact head.
  Its results are recorded in the live PR checks; Linux protocol controls and
  the prior runs do not replace that check.

## Fresh exact-archive external E2E

Prepared candidate **`34bb4fae3d6a613f13cdbab9ca50b0bfdf4054e7`** merges the
reviewed source into the already-versioned candidate without rerunning
`release:version`. Executed consumer **`a145931ec4522d3a4a5cd1e06a342814a876801e`**
was committed before the fresh install and unchanged check. Evidence-only
successor **`5de8e039cbde6c4277e6220073ab7b57d3718078`** retains the
[complete record](https://github.com/agent-teams-ai/modularity-host-test/blob/5de8e039cbde6c4277e6220073ab7b57d3718078/observation-0.1.0/evidence/accepted-a145931/RECORD.md).

The fresh offline/frozen strict installation passed. All ten runner stages
passed: exact Node version checks, TS7 NodeNext and Bundler with
`skipLibCheck: false`, emission, **five runtime predicates and
33 writer outcomes on each Node**, and **one eleven-row smoke** with exact
failure/abort targets and complete settled closes.

An independent GPT-6.1 xhigh critic verified all five archives, **176 installed
file hashes, 78 copied writer inputs, 25 executed source/config hashes**, actual
outcomes and the evidence-only successor. Zero actionable findings remain.
The executable consumer, literal semantic oracles, writer expectations and
three-substitution harness patch are unchanged. All three prior accepted
evidence directories remain byte-identical.

Observation archive SHA-256:
`a0685247e9e00ec02c2abaeab1d4aceb2041468e5317d8bf5e786edf99ec02e5`.
Only its manifest test glob changes from `.mts` to `.ts`; runtime and declarations
are identical. The other four pinned archives remain unchanged. The fresh
conformance comparison uses only the established peer-key-order exception;
the original pinned tested archive remains the qualification subject.

## Remaining merge and release blocks

- ADR PR #154 and reviewed-plan PR #185 remain open. The branch includes their
  reviewed bytes and main `47a02a9`; inclusion does not satisfy main admission.
- Foundation/API Extractor still owns TS5.9.3. Guarded full/fast/changed,
  critical-quality and SDK routes stop before initialization. A supported upstream
  native compiler migration and provenance qualification remain necessary,
  including separately pinned historical SDK subjects.
- Earlier Foundation success logs initialized TS5.9.3 before dispatch; they remain
  historical evidence and are not exclusive-TS7 qualification.
- Source/architecture aggregates remain blocked. No dependency override, old
  compiler execution, skipped gate, frozen baseline rewrite or release-eligibility
  claim is used to make the delivery appear green.
- Merge and npm publication have not been performed. Codex Review is ignored
  per owner instruction.

Exact findings, corrections, ownership boundaries and evidence are in
[implementation-port.md](https://github.com/agent-teams-ai/get-modular/blob/feat/observation-0-1-e2e/research/module-communication-2026-10/implementation-port.md)
and [HANDOFF.md](https://github.com/agent-teams-ai/get-modular/blob/feat/observation-0-1-e2e/research/module-communication-2026-10/HANDOFF.md).
