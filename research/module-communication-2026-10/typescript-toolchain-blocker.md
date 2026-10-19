# TypeScript compiler dependency blocker

Investigation date: 2026-10-18. This is implementation evidence, not a change to
compiler support, capability scope, release baselines, or accepted decisions.
No TypeScript compiler or parser below 7.0.2 was executed in this investigation.

## Finding

The repository-owned current compiler and structural parser paths now use exact
TypeScript 7.0.2. The unchanged Foundation public API extraction dependency still
executes TypeScript 5.9.3. There is no published stable upgrade that removes this
conflict with the selected compiler floor.

| Package | Installed pin | Official latest stable | Compiler consequence |
| --- | --- | --- | --- |
| `@agent-teams/engineering-foundation` | `1.7.4` | `1.7.4`, published 2026-10-11 | Depends on API Extractor `7.58.12` |
| `@microsoft/api-extractor` | `7.58.12` | `7.59.4`, published 2026-10-06 | Both versions depend on exact TypeScript `5.9.3` |
| `@microsoft/api-extractor-model` | `7.33.10` | `7.33.15`, published 2026-10-06 | A model upgrade does not replace the extractor compiler |

Primary metadata was read from the official npm registry:

- [Foundation metadata](https://registry.npmjs.org/@agent-teams%2fengineering-foundation).
- [API Extractor metadata](https://registry.npmjs.org/@microsoft%2fapi-extractor).
- [API Extractor Model metadata](https://registry.npmjs.org/@microsoft%2fapi-extractor-model).

The [Foundation changelog](https://github.com/agent-teams-ai/engineering-foundation/blob/43dbe80844ac639573019312a72393156549714d/packages/engineering-foundation/CHANGELOG.md)
ends at 1.7.4; that source snapshot still catalogs Extractor 7.58.12. The
[API Extractor changelog](https://github.com/microsoft/rushstack/blob/main/apps/api-extractor/CHANGELOG.md)
records the compiler upgrade to 5.9.3 in 7.58.0; the inspected exact 7.59.4 registry
archive still pins 5.9.3. Its `typescriptCompilerFolder` option changes standard
library declarations, not the compiler engine. These observations do not
establish compatibility for a future release.

## Active execution paths

Paths beginning `dist/` below belong to installed Foundation 1.7.4.

1. Root `foundation:check` invokes `agent-teams-foundation check`. The active
   `foundation.config.yaml` declares `package.public-api-compatibility`; its
   existing consumer policy has schema version 1 and retains Core and Assembly.
   `dist/features/foundation-check/application/run-foundation-check.js` selects
   all declared capabilities. The public API capability in
   `dist/capabilities/public-api-compatibility/module.js` calls
   `analyzePublicApiCompatibility(input, dependencies)` after the independent
   artifact analysis. The use case calls `dependencies.extractor.extract(...)`.
2. `MicrosoftPublicApiExtractor.extract` stages the package inputs, then its
   `extractEntrypoint` calls `CompilerState.create(config)` in
   `dist/capabilities/public-api-compatibility/adapters/outbound/api-extractor/microsoft-public-api-extractor.js`.
   API Extractor's `lib-commonjs/api/CompilerState.js` imports its own
   `typescript`, calls `parseJsonConfigFileContent`, `createCompilerHost`, and
   `createProgram`, and supplies that program to `Extractor.invoke`. Resolution
   follows the exact transitive 5.9.3 dependency; the repository's 7.0.2 pin does
   not replace it.
3. Root `sdk-growth:admission` runs
   `tests/qualification/sdk-growth-admission.mjs`. Its `runGrowth` fixture invokes
   the public API capability with a schema version 2 policy. Independently,
   `observeTypedSurface` supplies `createPublicApiExtractor()` to
   `createGrowthObservation`; `observer.observe(...)` reaches the same real typed
   extractor through the retained compatibility observation. This is an actual
   extraction fixture, not an unused dependency in the lockfile.
4. Foundation's separate public API audit route constructs
   `MicrosoftPublicApiObserver`. `load-pinned-audit-sdk.js` resolves TypeScript
   relative to API Extractor; the observer explicitly requires Extractor
   7.58.12, compiler 5.9.3, and model 7.33.10. It builds a closed declaration host
   and calls that compiler's `createProgram`. This is a separate optional route;
   it is not needed to establish the active aggregate blocker above.

### Follow-up: eager compiler initialization before command selection

The additional GPT-6.1 xhigh review traced both installed public binaries,
`dist/cli.js` and `dist/node-test-cli.js`. Each statically imports
`composition/command-host.js`, which reaches `foundation-check.js`,
`capability-registry.js` and `capability-modules.js`. That last module imports
the public API capability and its API Extractor adapters before any command
or positional capability is selected. API Extractor's `lib-commonjs/index.js:15`
requires `api/CompilerState.js`; line 40 of that module requires its own
TypeScript 5.9.3. That compiler constructs parser/service scanners at module
initialization, including lines 33096, 139377, 180480 and 180486.

The public `./sdk-growth-authority` entry also reaches the public API authority
module and extractor adapters through static imports. Its independent
`growth-invocation.js` adapter imports API Extractor too. This was established
by source and manifest reads, without importing the legacy implementation.

Consequently, earlier successful non-extractor Foundation commands initialized
the below-floor compiler and scanners. Their logs remain actual observations,
but they do not qualify as execution exclusively under TypeScript 7.0.2+.
This corrects the initial investigation's assumption about import-only paths.
It does not establish that those non-extractor commands parsed a project or
performed API extraction. Observation package tests, native compiler readers
and the isolated exact-archive consumer are separate execution paths.

## Commands affected and bounded checks available

Successful completion of these existing commands necessarily requires the
blocked extraction paths once their prerequisites pass:

- `pnpm foundation:check`.
- `pnpm sdk-growth:admission` and its parent `pnpm sdk-growth:check`.
- `pnpm check:fast` and `pnpm check`, which include the commands above.
- The existing CI packaging lane on every native OS/Node row, which includes
  `foundation:check` and `sdk-growth:check`.

`pnpm check:changed` also reaches `check:fast` for this implementation's code and
full-scan path changes under the unchanged repository agent workflow policy.
A documentation-only changed invocation can have a different selected plan.
A failure before extraction is not completion of the blocked gate.

Positional capability selection invokes only the selected capability's `run`
method, but cannot undo eager initialization. All repository-owned Foundation
CLI and Node runner launch paths now have the manifest-only preflight, including
`check:changed`, ownership precheck, quality commands and direct CLI fixtures.
The direct SDK checker and admission paths guard their imports. Registry
reproduction checks its initial closure before network work and each independently
installed subject's own dependency closure before importing that subject's SDK.
The historical registry subject remains blocked if its pinned compiler is below
the floor, even after the current Foundation dependency is upgraded.

The preflight uses only standard-library modules and JSON manifests. It preserves
every downstream command, negative assertion, required identity and capability.
Guards precede broad expected-failure catches, so an unavailable compiler cannot
be counted as a passing policy rejection. `precheck:changed` stays runtime-only;
the compiler guard is the first command in `check:changed` itself.

An individually selected capability would also need this preflight:

```sh
node architecture/checks/compiler-floor.mjs && \
  pnpm exec agent-teams-foundation check architecture.source-dependencies
```

With the current dependency this command is blocked before Foundation starts.
The same restriction covers local references, architecture decisions, agent
workflow, dependency declarations, source coverage and suppression governance.
Those adapters' own use of Oxc or a separate quality compiler does not make the
eagerly loaded extractor compiler permissible. Their previously retained passes,
typed-quality pass and mandatory-runner pass are historical results with this
known limitation, not current compiler-floor qualification.

The additional boundary controls passed 21 tests independently on each of
Node 24.21.0 and 26.11.1. The author also passed the 70-test guard/CI/profile
selection on both Nodes. Actual root `pnpm check:changed`, `pnpm check`,
`pnpm quality:critical:test` and `pnpm sdk-growth:registry` now exit 1 with
`TYPESCRIPT_COMPILER_FLOOR_BLOCKED`, observed version `5.9.3`, before their
Foundation entrypoint. A required red gate stays red.

## Bounded native feasibility probe

A separate temporary probe used only the migrated closed virtual TypeScript
7.0.2 helper. Its declarations included a re-exported overloaded function using
a hidden local type, an exported generic interface, and a namespace re-export.
It proved native alias and namespace resolution, both overload declarations,
hidden type symbol binding, and native declaration printing. Syntax and semantic
diagnostics were empty. Replacing the hidden type with undeclared `MissingType`
produced two TS2304 diagnostics. No legacy extractor was executed as an oracle.

This proves useful native primitives, not extractor equivalence. The inspected
7.59.4 extractor contains 23 modules importing TypeScript and uses undocumented
compiler internals, including symbol parent/local-symbol state, resolved-module
caches, and the emit resolver. Its canonical references, overload indices,
container excerpts, forgotten-export diagnostics, release tags, and reference
bindings require independent qualification. A package override or a replacement
`CompilerState` object is not a supported migration.

## Required owner route

The bounded implementation owner is Foundation's existing
`public-api-compatibility` outbound adapters, behind its `PublicApiExtractor` and
`PublicApiObserver` ports. A native migration must preserve input custody,
closed filesystem observation, compiler diagnostics, API item identities,
comparison policies, and all adverse controls. It must publish an exact supported
Foundation release through that repository's own review and release process.

The consumer also needs an explicit tool-upgrade evidence route. Foundation's
`evaluate-public-api-compatibility` rejects differing `extractorVersion` values;
`promote-public-api-baselines` rejects cross-extractor promotion; audit and SDK
growth evidence bind the extractor identity independently. Existing Core and
Assembly snapshots record 7.58.12. A native implementation cannot claim that
identity or silently refresh immutable snapshots to pass those checks.

This observation task does not fork Foundation, rewrite its adapter, install
local overrides, weaken those provenance checks, or change the historical
baselines. Until a supported owner route exists, the aggregate extraction gates
remain unqualified under the selected TypeScript floor. The compiler-floor
successor decision remains owned by the repository's accepted decision process.
