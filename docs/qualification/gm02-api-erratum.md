---
id: QUAL-GM02-API-ERRATUM
type: qualification
status: reviewed
owner: architecture
summary: Retains the bounded historical API discrepancy and the release-owned correction prerequisites.
related:
  - ADR-0027
---

# GM-02 API evidence erratum and versioned correction route

Retained erratum, 2026-09-13. No baseline was changed.
GM-02a has complete bounded structural comparisons; release preparation and
GM-02b acceptance remain pending for the concrete prerequisites below.

## Retained identities and authority

Paths below are relative to the retained `ef-api-observation-20260912` snapshot.
`ABC` means `worktrees/gm-actual-audit-r1/audit/gm-actual-abc`.
`GM` means `inputs/gm-c-source-669a750`; `EF` means `source`.
These aliases identify evidence locations, not executable environment variables.

- C and B source: GM `669a750d8db451e04f075cdeb36576c6606fba6e`.
- A Core 0.1.0 archive SHA-256:
  `50803ea69e2fb4078013a897f858908b4d73d26296336ab155a6118809dfb8ba`.
- A Assembly 0.1.0 archive SHA-256:
  `e89207171e44afd5e813aa5e7a0db8abc999b42338559d38b44b4db71da228ab`.
- B Core SHA-256:
  `ab5404e6985d168e1fd32dd6d798aa2bd8b981f2de1d6da44f9f722285724760`.
- B Assembly SHA-256:
  `e0edae72043f54ac6694eb5e808c78d175f7ae83e1be039e8a960809d1dc3781`.
- `ABC/retained/report.json` SHA-256:
  `848d8939c5c407a595582ffd95333631caf10208caef08f469cd43173b844219`.
- `ABC/retained/request.json` SHA-256:
  `f92464d5b13cb217827daa62bb5124f063352ae977ac884d30618bf191cafd40`.
- Audit CLI SHA-256:
  `5216fc07dc7c2fe86c1438b43f7d87386c20bcc3b246ee1cc072656ee4b66b0b`.
- Audit recorded EF Git HEAD: `c6e4cebdf1b1cc374c4714c3a4cb3eb0bd6f5ea3`.
  This is source-public-CLI evidence, not qualification of the released EF binary.
- Extractor 7.58.12, model 7.33.10, TypeScript 5.9.3; module hashes and explicit
  subject-local compiler closure are retained in the request/report/provenance.

`inputs/gm-registry-version-discovery-20260913.json` records only 0.1.0 for
both packages at 07:22Z. `inputs/gm-registry-archive-integrity-20260913.json`
records both archive SRI matches and matching Agent Runtime lock evidence at
`d2910c9cba81da24d1bce8ad38c28d5ae4ef44a6` (`pnpm-lock.yaml`).
No registry gitHead, tags or GitHub releases were returned. That leaves source
publication provenance unresolved; it does not prove historical publication was
impossible or unauthorized. Registry state needs refreshing before publication.

## Correction to the historical claim

B names package version 0.1.0 but does not describe the retained published 0.1.0
surface. The discrepancy affects both packages and exceeds two Assembly names.
The following are structural classifications, not TypeScript compatibility claims.

| Package | A to B stored surface | B to C stored surface | A to C graph |
| --- | --- | --- | --- |
| Core | 7 changed, breaking | none | 12 changed, breaking |
| Assembly | 2 added, 2 changed, breaking | none | 2 added, 13 changed, breaking |

All six comparisons have `eligibility.eligible: true`, no eligibility reasons,
and `evidenceComplete: true`. Every A/C export map exposes only `.`; no export
paths or declarations were removed and no export paths were added.
`exitCode: 2` remains authoritative. Audit `releaseEligible: false` is a constant
operation contract, even for complete successful audits; it is not an independent
release blocker or a failed release-gate result.
Extractor error counts are A Core 21, A Assembly 33, C Assembly 5, C Core 0;
they are not total diagnostic-array lengths. Failed invocations stay failed.

Core stored changes: `CompositionPlan`, `CompositionProfile`, `Diagnostic`,
`ModuleDeclaration`, `many`, `optional`, `required`. Its reachable graph also
changes `CompileCompositionResult`, `DiagnosticCode`, `compileComposition`,
`compileCompositionJson`, `defineModule`.
Assembly adds `IsUnion`, `ValidDeclaration`; stored changes affect
`FactoryCapabilities`, `FactoryDependencies`. Its reachable graph also changes
`AnyFactoryHandle`, `Assembly`, `AssemblyOutcome`, `AssemblyPreparationResult`,
`AssemblyPrepareInput`, `FactoryHandle`, `PreparedAssembly`, `RootHandles`,
`RootInstances`, `SuccessfulComposition`, `assemblyFor`.
Full signatures, ordered references and graph projections remain in the report.

B cannot reconstruct hidden declarations, original visibility or compiler closure.
Therefore B-to-C none cannot certify A-to-C compatibility. Historical bytes stay
retained; the next promoted baseline describes its own new release only.
Keep `IsUnion` and `ValidDeclaration` intentional public type API, preserving
named-alias inference. Future incompatible changes follow the compatibility gate.
`IsUnion<T>` detects ambiguous type alternatives; `ValidDeclaration<C, D>` rejects
ambiguous/non-literal declarations and incompatible capability declarations at
the authoring boundary. Consumers normally receive this validation through
`bindFactory`; the aliases remain importable from `@get-modular/assembly`.
For example, `type Ambiguous = IsUnion<"left" | "right">` yields `true`.
This type-level example is illustrative; the existing rejecting fixtures are
the acceptance authority and must run on the required compiler/resolver matrix.

## Supported route and exact blockers

The reviewed EF source policy `evaluate-public-api-compatibility.ts` uses minor
for pre-1.0 breaking changes, major after 1.0, and minor for additions.
Promotion in `promote-public-api-baselines.ts` lines 137-212 requires matching
extractor versions, rejects same-version drift, and checks the actual version
advance plus accepted decision evidence for the production breaking fingerprint.
Its required bump is patch for none, minor for additive or pre-1.0 breaking,
and major otherwise. This establishes a policy floor, not release eligibility.
The observed A-to-C structural changes justify planning a minor advance for both
packages (0.2.0 only if the refreshed inventory still has no intervening release).
The production B-to-C result must be generated separately; never reuse audit
fingerprints in `approvedBreakingChanges` or lower the A-based release intent.

GM pins EF 1.2.0; the observation candidate also labels itself 1.2.0. A version
string does not bind their bytes. The separately downloaded registry EF 1.2.0
archive was SRI-verified and its public production gate passed on exact C, with
both original baselines and policy unchanged (`production-check/C-check.json`).
Its actual promotion implementation confirms the pre-1.0 minor rule above.
This is an isolated published-package replay, not a claim about the real local
checkout, which currently resolves EF 0.21.0. No extractor migration is needed
for this passing production extraction.

GM `AGENTS.md` and `architecture/checks/release-owned-files.mjs` permit subsequent
baseline writes only on trusted same-repository `changeset-release/main`.
A local guard invocation outside `pull_request` exits without performing that
trust check; it cannot substitute for genuine PR metadata and merge-base evidence.
Do not fabricate environment variables to authorize a feature baseline edit.

GM exact source has `.changeset/config.json`, but no Changesets CLI/changelog
dependency, `release:version` script or release/publication workflow. EF's own
`pnpm release:version` is not a GM command. An owner-controlled versioning route
must first be supplied and validated; do not use an unpinned npx/dlx fallback.
No executable Changeset is included while that route and decision are unresolved.

The actual current admission rejects Assembly 0.2.0: `production-artifacts.mjs`
lines 239-240 requires 0.1.0 under ADR-0023. ADR-0025 explicitly says future
versions require their own admission change. A successor accepted decision and
bounded rejecting guard migration are necessary; preserve accepted ADR bytes.
Current version-sensitive checks also block an uncoordinated version bump:
`tests/assembly/packed-root.test.mjs` lines 18, 24 and 139 hardcode 0.1.0.
The release checkpoint must migrate current-artifact expectations while retaining
rejecting manifest/dependency checks. Historical first-release fixtures may keep
0.1.0; do not bulk-replace history. Packed and union regressions stay required.

## Release-owner command sequence after prerequisites

The following commands are supported by GM scripts or the EF public CLI. They
are instructions for the future disposable release workspace, not executed here.
First select the intended source SHA, retain artifact/build identities, validate
versioning/dependency rewrites, and complete the accepted breaking decision.
Read `pnpm docs:info`; create any governed record using the existing docs-authoring
find/new dry-run/apply workflow with its returned owner, type and plan digest.
Do not hand-invent ADR metadata or rewrite accepted decision bytes.

```sh
pnpm runtime:preflight
pnpm assembly:build
pnpm exec agent-teams-foundation check package.public-api-compatibility --format json
node --test tests/assembly/types.test.mjs tests/assembly/packed-root.test.mjs
```

The exact C production B-to-C check passes with zero diagnostics. A separate
package-resolution replay reduced C Assembly audit errors from five to zero,
confirming they do not justify source export changes. Recheck the production
result if implementation changes. After the supported versioning
step on trusted `changeset-release/main`, rebuild exact intended declarations:

```sh
pnpm assembly:build
pnpm exec agent-teams-foundation public-api-promote-release --consumer . --json
pnpm release-owned-files:check
pnpm check
```

The full check must pass in real trusted PR CI, including its existing OS matrix.
The positive/negative compiler matrix remains TS 5.8.3 plus pinned build compiler,
NodeNext and Bundler. The existing unchanged `types.ts`, `types-positive.ts`, and `mixed-graph.ts`
passed against retained A and exact C in all eight compiler/resolver cells with
`skipLibCheck:false`. This includes positive inference and rejecting directives.
It is finite regression evidence, not universal assignability or a packed runtime
proof; publication still needs exact intended-archive consumer qualification.
After separately authorized publication, reconcile registry version/SRI, consumer
pin and promoted baseline against the exact intended artifacts before closing
GM-02b. Uncertain publication requires registry reconciliation, never replacement
bytes at an existing version. Roll back consumer pins or deliver a forward fix.

## Remaining acceptance evidence

The text-custody revision under `worktrees/gm-text-custody-r2` is not independently
approved; its 259-file handoff exceeded the agreed budget. Do not elevate that
revision's self-reported closure into approval of the retained evidence bundle.
Outstanding: reviewed compact custody handoff; historical source provenance;
versioning route and version-admission successor; version-sensitive checks;
accepted production decision where needed; exact intended-artifact packed/runtime
consumer qualification; exact-release CI and authorized publication evidence.
This is a bounded erratum and concrete prerequisite route, not a new comparator,
release framework, same-version correction mechanism or release eligibility override.

## Preparation checkpoint

[ADR-0027](../decisions/0027-admit-the-core-and-assembly-0-2-0-correction-pair.md)
accepts the exact next admission. Pinned Changesets tooling with a local Git
changelog and an ordinary minor Changeset are now prepared. This supersedes the
historical missing-tooling and missing-Changeset observations above. Those
observations describe the retained exact C;
new release qualification and baseline promotion remain pending.

## Prepared 0.2.0 correction

Following [PR #111](https://github.com/agent-teams-ai/get-modular/pull/111), merged
as `f4e6137d39594349eb763d470151b94b1f54a597`, the release-owned
`changeset-release/main` checkout advances both packages to 0.2.0 through pinned
Changesets. The supported EF 1.2.0 promotion updates each baseline's package
version only; declaration entries and production source are unchanged. The
post-promotion production API check passes with zero errors or warnings.

Each intended archive was packed once and retained with its complete physical
inventory, exact manifest and SHA-512 integrity. SHA-256 identities are:

| Intended package | Archive SHA-256 |
| --- | --- |
| Core 0.2.0 | `0c231cca08e7381df454afdb876b0f2536cc6499450e77f54cd3654cbbf33fe5` |
| Assembly 0.2.0 | `ecbca91c7980ccbae81e726383c161c5e6cfc2f3ac5967453f36dbfd5dd75dc2` |

The existing retained-archive harness passes closed-root, synthetic runtime and
TypeScript 5.8.3/7.0.2 NodeNext/Bundler checks against this exact pair. Assembly's
packed Core dependency is exactly 0.2.0. These are intended local artifacts,
not downloaded published 0.2.0 packages.

Independent read-only custody review verified the original A/B/C manifests,
archive members and six report comparisons without altering or rerunning them.
This supersedes the pending data-integrity review above, not the unresolved
historical source-to-publication provenance or that packet's other claims.
The release PR still needs independent review and exact-head CI using real
trusted PR metadata. Publication and registry/downstream reconciliation remain
separate; no upload or tag operation was performed here.
