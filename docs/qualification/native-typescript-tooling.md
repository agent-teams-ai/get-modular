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

## Published Foundation 3 checkpoint, 2026-10-25

Current exact development dependencies are Foundation 3.0.0, Feature Module
Standard 0.3.0, Stack Toolchain 0.1.1 and Docs Protocol 0.6.6.
[OIDC release 40187728694, attempt 1](https://github.com/agent-teams-ai/engineering-foundation/actions/runs/40187728694/attempts/1)
published them from source `23b5a885ba46a2b43b5715ce82db28fcf04f2175`.
The FMS peer accepts Foundation 3; the adopted immutable FMS v1 authority,
SDK pending/HOLD and historical package observations stay distinct.

Stack owns the public TypeScript and Oxlint presets. Foundation quality policy
v4 selects the consumer's explicit toolchain configuration and preserves all
six production projects. Stack CLI executes under a physical supported Node
controller even when Bun manages the repository. The Bun default and isolated
Node 24 compatibility and Node 26 rollback retain separate installations and
genuine manager lockfiles. This source migration does not establish the final
native CI matrix, shared M3 archive qualification or production adoption.

Earlier dated checkpoints below retain their original package coordinates,
archive evidence and qualification limits.

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

## Current asynchronous SDK checkpoint

The 35-file tooling successor to
`c3ee89a287c61304a99d8aba355ceb23380cf046` corrects the observed native SDK
shutdown race through the supported `typescript/unstable/async` entry. The
internal compiler queries, closure auditors, parsers, codemods and current M3
callers await results in their original order. Callbacks remain live until their
result completes, followed by awaited snapshot disposal and public session
close. Closed virtual filesystems, finite grammars, budgets, diagnostics and
source custody checks retain their existing scope.

The source checkpoint is bound by the independent integration review
`sha256:a7ec12df37e27a51bd55786a92afe557f7a61a66fb304a7620aa1e4eff3cc8f0`.
The helper, declaration and parser scope has a separate independent approval,
`sha256:49fb00747c9b7d9db0d2bdcc36667b7bd1c868ffc3648417be318ab211004b48`;
the JavaScript and codemod scopes also received independent review.

| Local qualification | Recorded result |
| --- | --- |
| Declaration and JavaScript closure controls | All 441 pass on Node 24 and Node 26. |
| Codemod fixtures and runner controls | All 50 fixture cases retain exact output and idempotence; the suite has 66 passes and one unchanged platform skip on each Node. |
| Compiler ownership and floor controls | All 31 pass on each Node, including separate missing asynchronous-entry and missing AST-entry refusals. |
| Required native tooling strict project | Passes with TypeScript 7.0.2 on both Nodes. |
| Mixed current consumers | Both initial runs have 310 passes and five skips among 315 controls. Node 26 retains five Node-24-only skips. On Node 24, an unchanged six-control controller rerun without inherited `NODE_PATH` or `NODE_OPTIONS` covers all five initial skips, so all 315 distinct controls are covered. |

The original 185 raw matrix cases and earlier synchronous-run logs remain
historical inputs and evidence. This checkpoint does not claim a fresh retained
historical qualification. Fixed-two transition data, original registry subjects,
SDK predecessor inputs, HOLD and unverified-authority expectations are unchanged.
The earlier 1.7.4 installation was refused by the compiler preflight. The
current candidate binds the verified published Foundation 2.0.1 archive below. Earlier local results keep their original source identities; they do
not claim an aggregate gate or final head/base CI for this candidate.

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

### Published tooling checkpoint, 2026-10-21

Current exact development pins are Foundation 2.0.1, FMS 0.2.1 and unchanged
Docs 0.6.3. The FMS optional peer remains `^1.8.0 || ^2.0.0`; adopted FMS v1,
SDK pending/HOLD and mutable workflow feedback remain unchanged.

[Protected release run 39511720000, attempt 1](https://github.com/agent-teams-ai/engineering-foundation/actions/runs/39511720000/attempts/1)
published Foundation 2.0.1 and FMS 0.2.1 from exact source
`1218dbb53369d3beb3ee5b1b7544c261bf93136c`. Foundation's actual archive binds
SHA-256 `911978aab96560997035e2d09fdffc1fb428ffdb04817747f6af4e9bd5bf4d48`
and SRI `sha512-Nh7jjvGz0XQXXXjDALD024a88N86digBhJIeyAkOHTGpV6O+eNJtjg+bF+J77khLxCyB4c7gB8GqwN8HxX+pkg==`.
Docs 0.6.3 and its dependency closure remain the published artifacts from
`4ca4ad30b1efc5e3b43a2c012348ea8afea21864`.

Independent eight-package cohort reconciliation returned GO;
`ef201-published-cohort-review/independent-final-review.json` has SHA-256
`406dca7764dd01827a27be8bff88a94307dba0ef545aeccf1b9451e52c497d6d`.
The separate complete published Foundation verifier passed 2,780 file checks,
four quality CLI controls and six workflow controls across Node/Bun profiles;
`foundation-2.0.1-postpublication-built-source/verification.json` has SHA-256
`1c58c0590dad3510663c24deeb06c5be05be5154f517b000497808993f33b036`.

Both genuine GM locks were regenerated with pinned pnpm 11.20.0 and Bun 1.4.3.
Strict frozen pnpm lock-only admission and Bun's frozen dry run passed, with
workspace/catalog bytes preserved. The managers retain their own peer and
optional dependency graphs. `gm-ef201-dual-lock-generation-receipt.json` has
SHA-256 `feb5e45ac3111a6f068e4d87b8fe3aba5c8d01c646cafaa6ec409f41e05759c5`.
These upstream and lock-admission proofs do not qualify the new GM checkout.
Clean Bun/Node installations, focused installed checks, full CI, M3 and packed
qualification remain pending. The current failure-retention producer binds
Foundation 2.0.1 and its actual SRI; captured historical CLI bytes stay exact.

### Published tooling checkpoint, 2026-10-20

This dated checkpoint retains its original 2.0.0 cohort and receipts below;
its current-state wording refers to that earlier checkpoint.

Current exact development pins are Foundation 2.0.0, FMS 0.2.0 and Docs 0.6.3.
FMS's optional Foundation peer is `^1.8.0 || ^2.0.0`; GM's adopted FMS v1
identity remains unchanged. Foundation's actual archive binds:

- SHA-256: `855227b2383f7a69358142ccec2bc88b601d97428104504d775524a6fdc856d3`.
- SRI: `sha512-n12TlBVEyR0p9JL+3cjvCn+YukOu5wmKV2AK5Q1F44S+ULusTTNR9EyCplENsHrtAHFL3CeDhUYw/NpJmxVc9g==`.
- Source: `18bc5d1c1310b9837f26ac43b16dab63a087154f`.

[Protected release run 39473703985, attempt 1](https://github.com/agent-teams-ai/engineering-foundation/actions/runs/39473703985/attempts/1)
succeeded. Independent cohort reconciliation returned GO, including the actual
Docs 0.6.3 archive from its earlier release source; `cohort-verdict.json` has
SHA-256 `293f074e95c22ff8425fc5ad937c50aa9b6a8af3e7b9e678da19b08242997b73`.
The separate Foundation installed verifier passed 2,776 file checks, four CLI
controls and six workflow controls across Node/Bun profiles; `verification.json`
has SHA-256 `016514224f6112f21ba2f2fde305fe6db8a47fa91f7cbc7ab27a1184328d9bd7`.

Both actual GM locks were generated with these pins. Pnpm 11.20.0 passed strict
generation and frozen strict lock-only admission; Bun 1.4.3 passed generation
and a frozen dry run with the manifest projection preserved. Receipt
`gm-dual-lock-generation-receipt.json` has SHA-256
`d8756838f51d1f534d4d6932275ef31158d5446dea6cb6aa60bdab8794ba2403`.
These are Foundation verification and GM lock-admission proofs. Clean GM
Bun/Node installations, compiler/native checks, full CI, M3 and packed
qualification remain pending. The current failure-retention producer binds
Foundation 2.0.0 and its actual SRI; historical CLI bytes remain unchanged.
SDK growth stays pending/HOLD with its external proof requirements intact.

### Historical 1.10.0 native artifact and local candidate

The following record retains its original wording and receipt bytes. References
to the current candidate or producer in this record mean its earlier 1.10.0
checkpoint, not the current pins and qualification state above.

The current local candidate pins the public registry package
`@agent-teams/engineering-foundation@1.10.0` with this exact archive identity:

- SHA-256: `0b9fcd6a674cc98f718ce57ee9d7c114981078a0d3a5cd0a6eaada28a3810ad8`.
- SHA-512 SRI:
  `sha512-k1mI8y/bm6GQtge+QCkANrufyLKi0f6YZlHXCMKr4QpGb97/86j9WdYVhgG2//C2cAtSRmmHmhOtnrpdaksRpw==`.
- Verified source commit: `aed890a6ac09762d9f487ed2624e64a873935868`.

The artifact is byte-identical to the Foundation archive that passed the real
protected eight-package registry-install qualification in
[Release run 39272926879](https://github.com/agent-teams-ai/engineering-foundation/actions/runs/39272926879),
attempt 1. That attempt failed while waiting for registry visibility, before
Foundation signature verification. It is not recorded as a successful release
wave. The public version became visible afterwards; the retained failed
observation remains a failure, not evidence of absence.

A separate read-only npm 11.19.0 audit installed the actual public dependency
closure with scripts disabled, verified npm signature and source provenance with
no invalid or missing entries, and bound the verified statement to that exact
source commit and archive SRI. The local audit evidence is retained for review;
its receipt digest is
`sha256:c0a08500b52ca2c270c6f0d7bacd31ef366fb357d70f10551fad190b30bcf437`.
The installed 41-package closure includes TypeScript and its Linux native
carrier at 7.0.2, with no legacy API Extractor. The current pnpm installation
must independently pass the repository compiler guard before loading tooling.

This evidence permits the authorized reversible local candidate preparation.
Protected release completion and final Get Modular head/base qualification
remain separate requirements before merge or release admission. No local
Foundation archive is substituted for the public package. Historical 1.7.2 and
1.7.4 CLI report literals and their exact hashes remain data-only inputs; the
failure-retention producer now names the actual 1.10.0 pin and SRI.

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

The current CI matrix has six roles on each of Ubuntu, macOS and Windows for
default Bun, projected Node 24 compatibility and projected Node 26 rollback.
Node 26.11.1 remains the default controller; explicit Node qualification and
packed routes retain their separate guards. Existing leaf admissions, public
entrypoint inventories and release-owned file checks retain their scope. The
current cohort still needs clean Get Modular installation, fast/full and native
CI/M3 evidence; the published Foundation verifier does not provide it.

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

This local candidate records the actual native registry artifact and its
separate cryptographic verification. Foundation protected release completion is independently verified above; Get
Modular aggregate qualification and final head/base CI are not inferred from
that artifact record. Exact results belong to the final PR and release evidence;
earlier candidate checks retain their original source and artifact bindings.
