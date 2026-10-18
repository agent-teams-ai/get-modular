# Proposed PR: implement scoped module observation and TypeScript 7 qualification

Target: `agent-teams-ai/get-modular`, base `main`, head `feat/observation-0-1-e2e`.
Create as a draft. The implementation is qualified locally; aggregate and main
admission requirements remain blocked below.

## Why

The reviewed module-observation plan previously had no production package.
Modules need explicit read-only state contracts, subscriber-owned lifetimes and
asynchronous work that cannot publish stale results or overlap physical cleanup.
The owner also requires TypeScript 7.0.2 or newer for every executed compiler.

## Changes

- Implement `@get-modular/observation`: one owner writer, read-only facets,
  deferred `watch`, serialized `load`, scoped close/drain, attributed errors and
  echo/cascade guards, with exactly the root and testing entry points.
- Retain sound future snapshots, dynamic-key optionality and structural writer
  invariance. Port the archived runtime, declaration, writer and mutation gates.
- Add complete package admission and six CI lanes without removing obligations.
  Update the maintained CMS and authoring guide with compiled examples and an
  actual testing-import lint control. Frozen CMS/API evidence stays unchanged.
- Migrate current compiler readers and codemods to the native TypeScript 7 API.
  ADR-0038 records the authorized support floor and coordinated minor release.
  Existing historical 97/282 evidence remains intact; current deduplicated
  schedules are 87/272 with all non-compiler cases retained.
- Fail before the known below-floor Foundation extractor executes. This guard
  retains the blocked status and the complete downstream command obligations.

## Validation and review

- Complete observation package gate: native build, both TS7 resolvers, 154
  runtime/type/Assembly/README tests, 18 attributed mutations, all 33 writer
  outcomes and installed packed qualification.
- Runtime/process matrix: 149 tests on Node 24.21.0 and 26.11.1, no skips.
- Exact external candidate `b2815314182221baac6b08750f86ef2644d2cdb8`: five
  archives; both Node rows and TS7 resolvers; 33 writer outcomes per runtime;
  one smoke with eleven baseline/injection rows.
- Three independent Astra xhigh critics reviewed runtime, declarations/tooling
  and integration/E2E. Concrete findings were fixed and their original
  counterexamples independently rerun. Final guard also independently reviewed.
- Seven selected Foundation capabilities, typed quality, governance, profile,
  docs, peer lock and all eleven mandatory quality identities pass. Final
  guard/SDK/CI/profile selection: 135 passed, no skips.

The complete findings, dispositions, test subjects, raw logs, archive hashes
and consumer pin obligations are in
[implementation-port.md](https://github.com/agent-teams-ai/get-modular/blob/feat/observation-0-1-e2e/research/module-communication-2026-10/implementation-port.md).
External accepted source is `972dc2b9dfe9470a5e34ed4f28d75ecfc0fbec73`, with
retained evidence at `c2872eb9b89fbde8cc162e152c2cab5f813237cd` in the companion
`modularity-host-test` repository.

## Blocks to merge and release

- PR #154 and planning PR #185 remain predecessors; this branch contains their
  reviewed bytes. ADR-0034 is still absent from recorded main `ccd815e`.
- Installed Foundation/API Extractor resolves TypeScript 5.9.3. The real
  Foundation command now exits with `TYPESCRIPT_COMPILER_FLOOR_BLOCKED` before
  extraction. A separate upstream migration and extractor-provenance upgrade
  are required; no dependency override, skipped gate or baseline refresh is used.
- macOS/Windows matrix results and Windows lane duration are not supplied by
  the local Linux qualification. Full aggregates are not claimed green.
- Prepared package versions are unpublished. Merge and npm publication remain
  owner-controlled actions. Codex Review is ignored per owner instruction.
