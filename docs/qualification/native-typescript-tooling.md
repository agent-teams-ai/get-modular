---
id: QUAL-NATIVE-TYPESCRIPT-TOOLING
type: qualification
status: reviewed
owner: architecture/tooling
summary: Records current TypeScript tooling, native Foundation qualification, historical inputs and the release handoff.
related:
  - ADR-0027
  - ARCH-CURRENT-CONTRACT
  - ARCH-FEATURE-MODULE-STANDARD
---

# Current TypeScript tooling qualification

## Scope and authority

The repository owner's explicit instruction requires every executed TypeScript
compiler, parser and comparison oracle to be version 7.0.2 or newer. New
maintained JavaScript-runtime source, tooling and tests use ordinary `.ts` files
and a required strict typecheck. The package's `"type": "module"` supplies ESM
semantics; Node's type stripping only supplies execution.

This tooling predecessor starts at main
`3dd68a6b26f42159714a4640b613534a55c2c6aa`. It prepares current checks for the
separate hooks and observation delivery. Its scope is the current compiler,
native Foundation admission, development helpers, codemods and their existing
verification routes. Accepted decisions and implementation scope continue to
come from the [current contract](../architecture/current-contract.md) and
[Feature Module Standard profile](../architecture/feature-module-standard.md).

Public package versions, production APIs, published support declarations,
accepted-decision bytes and released API baselines remain at their main values
in this predecessor. The implementation's public compiler support change and
minor release stay with that implementation's separate decision and Changesets.

## Current compilers and maintained source

Both current compiler aliases select exact TypeScript 7.0.2. The
`typescript-minimum` name is retained as a qualification alias, so existing
consumer harnesses keep their command interface. It describes the current
supported test compiler. Older published minimum-version evidence remains
historical evidence and is not reported as freshly rerun.

When the two aliases resolve to the same compiler version, a consumer harness
executes that version once. This removes ten duplicate compiler executions from
the M3 matrix while retaining every one of its 185 raw cases. The current
required matrix has 272 cases. Independent declaration, JavaScript, package,
runtime and compiler observations retain their own coverage.

The new compiler guard, codemod project adapter and transformations, declaration
and JavaScript closure auditors, and leaf compiler helpers use ordinary `.ts`.
Their owning strict project is
`tests/tsconfig.native-tooling.json`. Its required route is
`tooling:native:typecheck` through `runtime:policy:typecheck`, which is already
part of the existing fast, full and changed paths and the CI governance lane.
The project enables `strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes` and `skipLibCheck: false`.

The actual native AST distinguishes a type-only import using
`ImportClause.phaseModifier`. The codemod adapter maps that field explicitly;
its focused control distinguishes type imports and exports from runtime imports
and exports while preserving the source text. Existing codemod output and
idempotence cases remain required.

## Installed Foundation boundary

Before loading Foundation, the compiler guard reads the actual installed
package and dependency-owner metadata. It validates the native wrapper,
compiler version, platform package, API Extractor model and TSDoc pins. A
legacy or mixed compiler dependency fails before implementation initialization.

The maintained SDK qualification imports the actual whole public SDK entry
after this guard. Historical registry packages still have their archive,
integrity, source and publication-time evidence checked as data with lifecycle
scripts disabled. Their unsupported compiler implementations are refused rather
than used as current comparison oracles.

The synthetic SDK admission fixture keeps two explicit inputs. Its original
legacy snapshot remains an active public-command provenance refusal control.
A separate native predecessor is produced by the real native extractor over
the fixture's explicit empty 0.1.0 declarations; the fixture then restores its
exact 0.2.0 candidate files. The original five typed observations and four
transitions retain their incomplete-evidence, HOLD and unverified-authority
expectations. This fixture supplies no release authority or G1 activation.

The actual published native Foundation version and integrity must be adopted
before the final current-tooling qualification. A local packed development
candidate proves its recorded behavior and bytes; it does not establish a
registry publication.

## Released API transition

The existing public API policy still governs Core and Assembly. The bounded
[input packet](../../architecture/tooling/native-public-api-migration/README.md)
records their original 0.5.0 archives, B baselines, compiler configurations,
source custody and reviewed native re-observation environment.

`foundation:check` first runs the real complete ordinary Foundation check and
retains its stdout, stderr and numeric exit. An ordinary pass requires no
transition inputs. Only the exact complete eight-capability report containing
the two reviewed tool-mismatch diagnostics can enter the separate native
qualification. Every unrelated diagnostic or execution failure remains a
failure.

The consumer calls the installed manifest-declared public command:

```text
agent-teams-foundation public-api-promote-release
  --consumer ROOT --native-transition REQUEST --qualification-only --json
```

The request supplies content evidence. The shared operation recomputes original
B, native historical A and actual current C, checks the complete reviewed B-to-A
tool difference and applies the normal A-to-C compatibility policy. The consumer
requires empty typed and artifact diagnostics, no writes and
`migrationApplied: false`.

The qualifier snapshots actual physical baselines, policy, manifest, lock and
pinned input files before and after observation. Reports and historical archive,
declaration and configuration staging remain in temporary storage outside the
checkout. The owning strict project and bounded negative tests are
required by `foundation:check`; no additional release workflow is introduced.

## Verification and merge sequence

The existing five CI lane groups, all six operating-system/Node combinations,
three optional leaf admissions, public entrypoint inventories and release-owned
file checks retain their scope. Current source changes must pass the existing
fast and full gates with the actual installed native registry package.

The sequence is:

1. Qualify and publish the shared native Foundation through its owner workflow.
2. Pin and qualify this main-based tooling predecessor with that actual archive.
3. Refresh and independently admit the hooks decision, implementation plan and
   implementation through their separate PRs.
4. In the existing trusted `changeset-release/main` workspace, version the
   implementation, rebuild and invoke the same public release promoter.
5. Qualify the resulting exact archives and affected external-consumer inputs
   before the existing release publication route.

[ADR-0027](../decisions/0027-admit-the-core-and-assembly-0-2-0-correction-pair.md)
continues to own baseline write authority. A successful read-only transition
does not replace the versioned release preflight or authorize an extra baseline
release. The planned implementation minor provides the actual release context.

This reviewed scope record leaves actual native registry adoption and final
head/base CI pending. Exact results belong to the final PR and release
evidence; earlier candidate checks retain their original source and artifact
bindings.
