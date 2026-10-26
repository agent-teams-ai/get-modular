# npm publication

The owner authorized automatic publication and promotion of the five public
packages on 2026-10-20. `latest` is the intended tag for each package. The
private lifecycle kernel stays excluded. This workflow changes release delivery;
it does not change package versions, APIs, accepted ADRs or conformance claims.

The repository owns version selection, exact-source CI qualification, archive
preparation and the installed consumer. The organization owns the reusable
[publisher](https://github.com/agent-teams-ai/.github/blob/main/.github/workflows/npm-publish.yml),
pinned by commit in [the caller](../../../.github/workflows/npm-release.yml).
The shared mechanism validates the artifact protocol, uses npm Trusted
Publishing, reconciles uncertain uploads, downloads registry bytes and promotes
tags. It has no dependency on Get Modular tooling or package policy. This
keeps the common npm invariant reusable while package qualification remains local.

## Normal release

1. Use the Changesets version branch and the
   [checked version route](../release-candidate/README.md). Changesets 3.0.2 is
   the sole version and dependent propagation engine. The wrapper qualifies its
   actual candidate before the action can commit or push. The separate existing
   public API baseline procedure retains its owner and scope. Merge the reviewed
   version change through the normal required CI gates. Do not raise versions
   on every main commit or publish the private candidate.
2. A completed `CI` run on main wakes `npm release`. Preparation requires the
   exact current main source, the actual `.github/workflows/ci.yml`, and every
   expected job from that run attempt to have succeeded. Matrix job names are
   expanded from the checked-in workflow. Currently this is 64 jobs; the accepted Bun/Node runtime matrix retains all lanes,
   nine aggregates and one installed Node 24 compatibility job. Missing, skipped,
   cancelled, duplicate or foreign-source jobs fail admission. An older
   `workflow_run` is skipped when its source differs from `github.sha` or live main.
3. Automatic runs compare current public versions with live npm version and
   `latest` metadata after exact-source CI. A missing version or candidate awaiting
   promotion needs release; all current versions already on `latest` skip. This
   also catches a pending version when a newer documentation commit superseded
   its original CI. Read-only requests have three bounded attempts and distinguish
   a permanent HTTP 404 from network failure. A registry `latest` newer than the
   source version fails closed to prevent accidental regression. An explicit
   main-branch workflow dispatch can reconcile the same versions without a bump,
   still requiring exact-source CI and no version regression. CI has no retained
   all-five package artifact, so new candidates use the existing build commands
   and are packed once.
4. Preparation uploads `npm-release-<run_id>-<run_attempt>`. The shared `publish`
   phase publishes or reconciles candidate versions, verifies downloaded bytes
   and uploads the same manifest, downloaded archives and receipt as
   `npm-release-<run_id>-<run_attempt>-registry`.
5. The credential-free `verify` job validates both manifests, hashes and the
   receipt's source and run ID, then installs the registry archives outside the
   source workspace. It runs the existing installed public-root consumer and a
   strict TypeScript 7 consumer using Core, Assembly, resources, conformance and
   observation. The latter also executes typed Assembly wiring, observation,
   module scope closure and a Conformance-isolated module. No consumer repacks.
6. Only successful consumer verification allows the shared `promote` phase to
   set every intended `latest` tag. A failed upload/read-back, hash mismatch or
   consumer check leaves promotion blocked. Repository concurrency serializes
   these runs without cancelling an active publication.

Preparation and verification have `contents: read` and `actions: read`, with no
OIDC grant. Only calls to the protected reusable publisher have `id-token: write`
and `actions: write`; the latter permits retiring its own bounded intent artifact
after successful registry reconciliation and receipt retention.
The protected `npm` environment and each package's npm Trusted Publisher must
admit this caller and the reviewed reusable workflow. No npm write token belongs
in repository secrets. npm interactive authentication is only needed for initial
publisher configuration or a provider-required bootstrap.

## Existing qualified bytes

[The retained Observation release](../../../research/releases/observation-0.1.0/release-intent.md)
qualified Core/Assembly 0.6.0, resources 0.2.0, conformance 0.4.0 and observation
0.1.0. That historical record retains its original pending-publication wording.
The owner's 2026-10-20 delivery instruction authorizes this automation and all
five `latest` targets; the archived intent is not rewritten.

`policy.ts` binds each retained version to its qualified package Git tree,
SHA-256 and SHA-512 integrity. Preparation reuses those exact archives only if
that version and current package tree match, then verifies both hashes before
copying. Package metadata, README, changelog and license are inside those trees.
Root build scripts, compiler/pack configuration, lockfile, toolchain selection
and root license must also match the qualified release source; root development
scripts unrelated to package construction may evolve independently. Input drift
fails closed and requires a reviewed new release or retained-evidence binding.
Reuse claims only the earlier qualified package bytes, not qualification of a new
production implementation. New repository tooling and workflow changes still
require exact current-source CI. Same-version package source drift fails with
`release.retained-source-drift`; changing a tree never silently repacks an
already published version. New versions build from the qualified current source.

Future release archives without this explicit retained binding are packed once.
If the registry already has different bytes for that version, reconciliation
fails. Preserve the original artifact and registry observation, inspect the
mismatch and repair the version/release evidence. Never normalize, replace or
re-upload a published version to hide a mismatch. A future retained release can
extend this narrow binding only with its own reviewed qualification evidence.

### Accepted Resources validation input successor

The accepted Resources fix `ddf1e0b0053f546f12ca70190b237b4f7e78d09d`
changes only three validation declarations in `architecture/checks/leaf-packages.mjs`:
its required close-reentrancy test, its strict test-tooling project and its test
command. The release policy admits only this exact whole-file successor:

| Input | Git blob | SHA-256 |
| --- | --- | --- |
| Historical `2cd561688bb223f944425718cc093e55ff4bc20d` | `d998b031c65e7f5065e618552f429588569c094f` | `99a674571bf715046fe6867c3d0f4caefa4ef3142f73c4747fe2cbbc34800573` |
| Accepted `ddf1e0b0053f546f12ca70190b237b4f7e78d09d` | `5c450cb84c9a077d7203313eb18e2eee8d24faf7` | `d697d331dcff6a70884e83f4d7e47303249c8b5b83dae9316b3a7e455638ff26` |

The builder reads the selected row's `root` directly and derives outputs from
`subpaths` through `leafBuildOutputs`; those fields, build commands and all executable helpers are
unchanged. Independently stated replacements on the real historical Git bytes
must reproduce the complete accepted file. Any further validation, row, root,
subpath, build or helper edit fails the whole-file identity check. The relation
applies with or without the development dependency successor below; every other
compiler, build and dependency input retains its existing guard.

This preserves `retainedSource`, the original package-tree catalog, all retained
archives and historical qualification records. At the original preparation
checkpoint, the changed Resources source rejected reuse at `0.2.0` and required
its genuine Changesets patch release. The owning release below subsequently
published that correction as `0.2.1`.
The focused regression first failed against the previous policy with
`release.retained-build-input-drift`. The corrected policy then passed all seven
npm-release tests. An isolated TEST checkout installed the previously qualified
`@agent-teams/release-checks@0.0.0` archive with its actual pnpm resolution and SRI:
`sha256:d5e6eb3a48ea65f900ec18060dc1bfdb46fa2c3b694d2db1b239c698329318fe`.
Strict TypeScript 7.0.2, all seven npm-release tests, all fifteen release-candidate
tests and the complete docs protocol gate passed. The qualification owner checked
all seventeen copied source files before and after each command; each binding
remained exact throughout that run. This repeated an earlier run whose individual
commands passed but whose final source-binding assertion failed; that earlier run
is not a qualified source receipt.

This is preparatory candidate evidence. Exact current-source full CI and the
existing public registry archive/receipt/installed-consumer qualification remain
required after the published `0.1.0` dependency is admitted. The production
admission integrity stays null until that actual registry evidence exists.

### Release checks development dependency successor

The independent `@agent-teams/release-checks` adoption permits one bounded
addition to the retained release-tooling inputs. It preserves the five source
tree, archive and checksum records above. The complete root build commands,
toolchain inputs and all other development dependencies remain equal to
`2cd561688bb223f944425718cc093e55ff4bc20d`.

The root development dependency must be `catalog:` and its workspace catalog
must select exactly `0.1.0`. The lock must add exactly the matching default
catalog record, root development importer record, package resolution and empty
snapshot. The package resolution has only its approved SHA-512 integrity and
exact engines. Runtime, peer and optional edges, resolution aliases, extra
importers and unrelated graph changes reject. The checker validates these exact
records before removing only those records for comparison of the remaining
complete parsed workspace and lock. Git blob identities bind both supplied
texts to the current and retained source; copied historical text cannot hide a
different current lock.

The [admission record](release-checks-adoption.json) records
the independently qualified public version `0.1.0` integrity. Its installed-package,
strict TypeScript 7.0.2, conformance and signature/provenance checks passed on
2026-10-26. Retained archive admission remains bounded by its original source
and cohort policy; current installation is pending until the owner managers
generate the authoritative Bun and pnpm locks. Candidate `0.0.0` installation in a disposable
TEST checkout proves the API integration only. The production lock has no
invented package resolution, and this adoption must remain unmerged while its
actual manager installations and final native CI are not yet qualified in this checkout.

The original Resources-only preparation retained four unchanged package trees.
Those observations remain bound to that earlier source; the released base below
has five new versions outside the historical retained-version catalog. After
adoption, run the existing manual current-main publication dispatch and verify
downloaded archives and consumers; an automatic same-version skip is not
reconciliation proof.

## Released base for prepared adoption

[The owning release PR #208](https://github.com/agent-teams-ai/get-modular/pull/208)
merged as `7131d0d7a6bb5dd4c3e8906ccac065c0be0e0333`. Its exact-source
[CI run](https://github.com/agent-teams-ai/get-modular/actions/runs/39610900906)
and [publication run](https://github.com/agent-teams-ai/get-modular/actions/runs/39612969025)
completed successfully. Publication executed prepare, publish, installed-consumer
verification and promotion. Its source-bound registry evidence records all five
uploads; independent npm reads on 2026-10-21 confirmed each exact version,
matching integrity and intended `latest`:

| Package | Published version and `latest` |
| --- | --- |
| Core and Assembly | `0.7.0` |
| Resources | `0.2.1` |
| Conformance | `0.5.0` |
| Observation | `0.2.0` |

The preparation branch incorporates this released source, including the promoted
API baselines, accepted decisions, package versions/changelogs and Assembly
tooling checks. Its release-checks Host permissions remain unchanged. The
historical archive catalog, archive bytes and checksums also remain unchanged;
this synchronization adds no retained binding for the new versions.

The released tree has only `config.json` in `.changeset/`. After the real public
leaf installation and lock/SRI qualification, collect the official current
Changesets plan. If it still has no releases, use the existing no-release path;
do not create an artificial intent or reproduce the already published release.

This owning publication qualifies source `7131d0d7`, not the future adoption
source. The dependency admission remains pending. Reconcile the eventual
adopting main through the existing manual publication route: all five current
versions use current-source packing rather than the old retained catalog. Any
registry-byte mismatch remains a failure; do not substitute an old manifest,
invent integrity or broaden retained archive admission to hide it.

## Artifact protocol and recovery

The original artifact contains only `release.json` and the five package archives.
The manifest has `schemaVersion: 1`, `repository`, `source` equal to the caller's
`github.sha`, and `packages`. Each entry has `name`, `version`, `file` (a safe
`.tgz` basename), `sha256` and `integrity` (`sha512-...`). It contains no token,
provisional tag or run ID. The shared receipt adds `complete: true`, `runId` and
`candidateTag` equal to `candidate-run-<runId>`, and binds the exact same package
entries. Downloads come from the same workflow run;
artifact names include the attempt so reruns cannot replace earlier artifacts.

On uncertainty, retain the Actions artifacts and job logs. The shared publisher
performs one candidate upload attempt and bounded registry reconciliation. A
fresh main-branch dispatch starts a new serialized reconciliation run and uses
the same qualified retained bytes where available. It never automatically bumps
a version or retries an uncertain upload as if it had definitely failed. Inspect
both publish and verify before considering publication complete; a green prepare
job or npm metadata alone is insufficient. After a main advance, use exact-source
CI for that new main rather than replaying an older source.

Focused development checks are `pnpm tooling:native:typecheck` and
`node --test tests/npm-release.test.ts tests/release-candidate.test.ts`. They are included in the normal runtime
policy gates and closed root script roster. `assembly:typecheck` also checks the
public consumer fixture. The full repository gates and genuine Actions execution
remain required delivery evidence; local fixtures alone do not prove npm OIDC.

## Scoped standard review

The release tooling and installed consumer are development-only, within the
existing `repository.development` boundary and outside the production scope of
the adopted Feature Module Standard v1 profile. This delivery extends its real
strict compiler/test gates without changing module contracts, lifecycle ownership
or a consumer adoption profile.

Reviewed on 2026-10-20: canonical main
`077434e34d75506a610bc9271f8b5b9d5718c876` has the same complete Consumer Module
Standard bytes as the implementation base: Git blob
`ae6792543bd19acc948e177e8d55632c9d51134e`, SHA-256
`c2fe582a14ff6e79620b232ca7ffc914afb0474ec21fd43f208251dd7252f4a3`.
No standard semantic delta is introduced here. The disposable consumer follows
explicit contracts, a single writer, read-only facets and subscriber-owned
resources; it is a publication smoke test, not production adoption or a new
conformance claim.

The separate pending SDK growth review retains its historical reviewed-current
pin `24d6557a1b04b01a3a73c64b1d9a9afd83d89c8f` (blob
`63540f7b0420134ba685002d01770da2f213c65a`). Its delta to current guidance includes
module resource scopes, run inputs, contract descriptors, entries/groups,
profile completion and observation, with 984 added and 44 removed lines.
That record belongs to the existing SDK growth HOLD, not this development
boundary; its pin and frozen evidence are preserved. Full current-standard
migration and external SDK authority remain pending in that owner track. This
release workflow does not activate it or use its historical pin as current
production guidance.

## Current cohort integration

The prepared Host intentionally incorporates accepted main `081ae02b` (PR #206
and #212), preserving Bun 1.4.3, Foundation 3.0.0, FMS 0.3.0, Stack 0.1.1
and the unchanged shared publisher `ff94f771`. The standard's current document
is Git blob `df4eff7235ac781ec574903c6b2aec13bcd7bfaa`, SHA-256
`3c5814ebf1ab1bd17688e49955aa0baa2ee91dd3a369adcea4d38aaccd53ba86`.
Its reviewed delta from the prepared branch changes five repository verification
commands to Bun; the owning SDK evidence migration is retained unchanged.
The earlier review observations above remain historical. SDK activation remains
on HOLD. This tooling integration changes no production composition boundary.

## Coordinated metadata patch

ADR-0042 admits only Core/Assembly 0.7.1 with Conformance 0.5.1, Resources 0.2.1
and Observation 0.2.0. The checked version route uses the ordinary installed
public Foundation promoter in a private trusted release workspace, and its
independent replay authenticates the exact two Core/Assembly baseline outputs.
Preparation feature changes do not write those baselines. Public package versions,
changelogs and peer minimums come from Changesets. Exact-source CI, archive
identity, installed consumers and publication reconciliation remain separate
requirements; this admission is not a release completion claim.
