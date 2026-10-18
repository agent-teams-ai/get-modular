# Proposed PR: implement scoped module observation and TypeScript 7 qualification

Target: `agent-teams-ai/get-modular`, base `main`, head `feat/observation-0-1-e2e`.
Create as a draft: package/E2E qualification passes, while the explicit upstream
compiler and predecessor admission gates remain blocked.

## Why

The reviewed module-observation plan previously had no production package.
Modules need explicit read-only state contracts, subscriber-owned lifetimes and
asynchronous work that cannot publish stale results or overlap physical cleanup.
The owner also requires TypeScript 7.0.2 or newer for every executed compiler.

## Where the implementation lives

The working package is in
[`packages/observation/src`](https://github.com/agent-teams-ai/get-modular/tree/feat/observation-0-1-e2e/packages/observation/src),
with 18 TypeScript source files. The public API is `src/index.ts`; state ownership
is implemented in `features/store/store.ts` and `engine.ts`, subscriptions in
`watch.ts`, and serialized asynchronous work in `load.ts`. The package README
contains compiled module-authoring examples.

The [companion PR](https://github.com/agent-teams-ai/modularity-host-test/pull/20)
installs this implementation's exact archives and checks a separate consumer.
The package and the consumer are separate review subjects.

## Changes

- Implement `@get-modular/observation`: one owner writer, read-only facets,
  deferred `watch`, serialized `load`, scoped close/drain, attributed errors and
  echo/cascade guards, with exactly the root and testing entry points.
- Retain sound future snapshots, dynamic-key optionality and structural writer
  invariance. Port the runtime, declaration, writer and mutation gates.
- Add complete package admission and six CI lanes without removing obligations.
  Update the maintained CMS and authoring guide with compiled examples and an
  actual testing-import lint control. Frozen CMS/API evidence stays unchanged.
- Migrate current compiler readers and codemods to the native TypeScript 7 API.
  ADR-0038 records the authorized support floor and coordinated minor release.
  Historical 97/282 evidence remains intact; current deduplicated schedules
  are 87/272 with all non-compiler cases retained.
- Guard all identified current Foundation CLI, Node runner and affected SDK
  entrypoints before their eager legacy compiler initialization. Every original
  downstream command and rejecting assertion remains present.

## TypeScript authoring and first CI corrections

All production observation source is TypeScript. The owning declaration-control
test now also uses `.mts` and receives a strict typecheck in the normal gate.
Its Windows fix canonicalizes the temporary-directory alias before checking
exact diagnostic paths; none of its variance/negative assertions is weakened.
Two stale Core/Assembly fixture counts now match the distinct TS7 compiler
schedule while retaining historical transport evidence and all runtime receipts.

Local agent instructions adopt TypeScript 7.0.2+ for new maintained source,
tests and tooling, with the shared rule in
[organization policy PR #368](https://github.com/agent-teams-ai/.github/pull/368).
The two localized legacy JavaScript count fixes add no new responsibility;
their harnesses remain explicitly outside strict TypeScript coverage.

## Validation and review

- Complete observation gate after the final runtime correction: native build,
  both TS7 resolvers, **157 actual tests**, **18 attributed mutations**, all
  **33 writer outcomes**, and installed packed qualification. No skipped test.
- Independent follow-up on each Node 24.21.0 and 26.11.1: 45 guard tests,
  31 load tests, both no-ALS modes and three GC modes. Publication checkpoints,
  physical drain and currentness controls remain unchanged.
- Exact unpublished candidate `106e3b0adca10e83d7a87ba57cb73baa9ee7ca6d`: five
  coordinated archives; external consumer passes both Node rows and TS7
  resolvers, 33 writer outcomes per runtime and one eleven-row smoke.
- Three initial Astra xhigh critics and three additional **GPT-6.1 xhigh**
  critics reviewed the complete vision and implementation. The additional
  native Promise constructor escape and incomplete compiler guard coverage
  were fixed, then independently verified against their original evidence.
- The guard author passed 70 focused guard/CI/profile tests per Node; the
  independent reviewer passed 21 inert controls per Node. Real root changed,
  full, critical-quality and SDK-registry commands now explicitly stop before
  loading the prohibited compiler.

The implementation record contains exact subjects, findings, corrections, logs
and archive hashes:
[implementation-port.md](https://github.com/agent-teams-ai/get-modular/blob/feat/observation-0-1-e2e/research/module-communication-2026-10/implementation-port.md).
External tested source is `4d10a1fb7041e44c61766400d6f1262e84c397e7`; its
[evidence record](https://github.com/agent-teams-ai/modularity-host-test/blob/4b33245c2b454e44aac4ea6f3bb241c02f7b9c59/observation-0.1.0/evidence/accepted-4d10a1f/RECORD.md)
is retained at evidence-only commit `4b33245c2b454e44aac4ea6f3bb241c02f7b9c59`.
The consumer executable and semantic oracles were unchanged for this rerun.

The first CI run passed observation on Linux/macOS for both Node lines and
Node 24 package compatibility. Every failure was classified: three fixture
integration defects above were fixed; 18 Foundation lanes correctly blocked
its old compiler. Fresh CI after the corrections must be assessed separately.
Locally, the integrated strict typecheck and all 157 observation tests pass,
and the affected Core/Assembly selection passes 24 tests on each Node line.

The current archive refresh changes only observation's package manifest scripts;
all production JavaScript and public declarations match the preceding installed
set. Its fresh offline install and complete external E2E passed. A clean repack
retains only the plan's existing conformance peer-key-order exception, with the
original pinned tested bytes kept as the subject.

## Blocks to merge and release

- PR #154 and planning PR #185 remain open predecessors. This branch includes
  their reviewed bytes and latest main `47a02a9`; this does not satisfy their
  separate main-admission condition.
- Installed Foundation/API Extractor resolves TS5.9.3. Every current guarded
  route stops with `TYPESCRIPT_COMPILER_FLOOR_BLOCKED`. Upstream native migration
  and extractor-provenance qualification are required, including the pinned
  historical SDK subject; no override, skipped gate or baseline refresh is used.
- **Evidence correction:** earlier non-extractor Foundation CLI successes also
  initialized TS5.9.3 and its scanners before dispatch. Original logs are
  preserved, but are not exclusive-TS7 qualification. Source inspection does
  not prove project parsing/extraction in those non-extractor commands.
- Linux evidence does not replace macOS/Windows CI or Windows lane timing.
  Required full aggregates are not claimed green.
- Prepared versions are unpublished. Merge and npm publication remain owner
  actions. Codex Review is ignored per owner instruction.
