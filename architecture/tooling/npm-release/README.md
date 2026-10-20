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

1. Use the existing Changesets release branch and public API baseline promotion
   process. `pnpm release:version` retains its existing behavior. Merge the
   reviewed version change through the normal required CI gates. Do not raise
   versions on every main commit or publish the private candidate.
2. A completed `CI` run on main wakes `npm release`. Preparation requires the
   exact current main source, the actual `.github/workflows/ci.yml`, and every
   expected job from that run attempt to have succeeded. Matrix job names are
   expanded from the checked-in workflow. Currently this is 43 jobs: 36 lanes,
   six aggregates and one installed Node 24 compatibility job. Missing, skipped,
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
`node --test tests/npm-release.test.ts`. They are included in the normal runtime
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
