# Release brief: Get Modular train 1 (Core and Assembly 0.3.0, resources and conformance 0.1.0)

<!-- cspell:ignore oneline ETIMEDOUT dgst SHASUMS ENOSPC mktemp refspec -->

Location in the repository: `research/releases/0.3.0-train/release-plan.md` (the same directory the bundle PR of
6.6 later fills).

Status: planning brief, written 2026-10-04 and updated 2026-10-08 against `origin/main` `8fe924d` (#145). It covers
three things:

1. release rehearsal #3 (run by the planner on 2026-10-08 with the final branch procedure, section 4);
2. the release PR "REL" from `changeset-release/main`, which versions the packages and promotes the public API
   baselines (section 5);
3. the retained archive bundle "R-1a", which the downstream TEST-1 and agent-runtime draft-branch work installs
   from (section 6).

npm publication ("R-1b") is owner-only and outside this brief.

All owner decisions are recorded in section 3; no open question remains. If anything here does not match what you
see, or is ambiguous: stop and ask. Do not guess.

The release branch is never force-pushed and never deleted. Every push in this brief is a plain fast-forward
(sections 5.1, 5.6, 5.8).

Placeholders: `<gm>` is a get-modular checkout used only for `git fetch` and `git worktree add` (do not edit or
check out anything in it); `<rel>` is the release worktree; `<fresh>` is a temporary worktree for a regeneration
(5.8); `<evidence>` is the worktree of the bundle PR (6.6); `<tmp>` is an absolute path to a disposable directory
outside every repository, deleted at the end (pnpm resolves a relative `--pack-destination` from the
package directory); `<N>` is the REL PR number; `<head>` is the current REL head SHA; `<REL base>` is the `main`
commit the current release commit was generated from.

Shell note: in zsh (the macOS default), `$VAR:r...` is a history modifier. Always write `${VAR}:refs/...` with
braces, and write path lists literally (zsh does not split an unquoted variable into words).

---

## 1. Re-verify before start

`main` moves within days. Run every check and compare it with the value seen on 2026-10-08. If a value differs,
follow the right-hand column. Commands assume `cd <gm>` after `git fetch origin`; `S=origin/main`.

| # | Check | Command | Expected (2026-10-08) | If different |
| --- | --- | --- | --- | --- |
| 1 | main head | `git log --oneline -1 $S` | `8fe924d` | `git log --oneline 8fe924d..$S`. If any commit touches `.changeset/`, `packages/{core,assembly,resources,conformance}/`, `architecture/`, `pnpm-lock.yaml`, `package.json` or `.github/workflows/`, redo the rehearsal (section 4) and refresh every expected value in this brief before REL. Anything you cannot explain: stop |
| 2 | Node | `git show $S:.node-version` | `24.21.0` (`engines.node` `>=24.21.0 <25 \|\| >=26.10.0 <27`) | use the new version for every step; record it |
| 3 | pnpm | `git show $S:package.json \| grep -e packageManager -e '"lockfile:peers:check"'` | `pnpm@11.20.0`; script `lockfile:peers:check` = `pnpm peers check --lockfile-only` (first steps of `check`: `runtime:preflight`, `lockfile:peers:check`, `runtime:policy:typecheck`, `runtime:policy:test`) | a newer global pnpm switches to this version by itself; confirm `pnpm --version` inside `<rel>` |
| 4 | Engineering Foundation | `git show $S:package.json \| grep engineering-foundation` | `1.7.2` | redo the rehearsal; re-check M6 of section 11 and the "approvals" row of section 4 |
| 5 | pending changesets | `git ls-tree --name-only $S .changeset/` | `add-conformance-package.md`, `add-resources-package.md`, `assembly-authoring-builder.md`, `assembly-run-scope.md`, `config.json`, `core-0-3-0-pair.md`, `node-26-compatibility.md` (empty) | stop and ask: a new or removed changeset changes the release |
| 6 | approvals | `git show $S:architecture/foundation/public-api-compatibility.yaml` | Core `approvedBreakingChanges: []`; Assembly exactly two entries: `sha256:42266e521b2fb7b3892bda9aae536962986eca082a6917508b5a7143057ef75a` (ADR-0031) and `sha256:ab0c54428e4fb681a6326466eaffe12f1ba004e0a7b81382a4ad7a99e8fe428c` (ADR-0032) | stop and ask |
| 7 | version admission | `git grep -n -e 'PUBLIC_ASSEMBLY_VERSIONS = ' -e '"0.3.0": Object.freeze' $S -- architecture/checks/` | `production-artifacts.mjs`: `["0.2.0", "0.3.0"]`; `assembly-admission.mjs`: a `"0.3.0"` entry in `ASSEMBLY_PAIR_DECISIONS` | stop and ask |
| 8 | release branch rule | `git grep -n 'RELEASE_BRANCH = ' $S -- architecture/checks/release-owned-files.mjs` | `"changeset-release/main"` | stop and ask |
| 9 | release branch on origin | `git ls-remote origin refs/heads/changeset-release/main` | `f29200dc47f59c30f77dfcbb223d317ea76a6e67` (the merged 0.2.0 release PR #112) | before the first push: stop, someone else wrote it. After the first push it must equal the current REL head (5.8) |
| 10 | git tags | `git ls-remote --tags origin` | empty | stop and ask |
| 11 | registry | `npm view @get-modular/<p> versions dist-tags --json` for `core`, `assembly`, `resources`, `conformance` | core and assembly: versions `0.1.0`, `0.2.0`; tags `latest=0.2.0`, `candidate-0-1-0=0.1.0`, `candidate-0-2-0=0.2.0`. resources and conformance: `E404` | stop: ADR-0027 requires a new decision for any intervening release |
| 12 | CI lanes | `git show $S:.github/workflows/ci.yml` | 30 lane jobs, 15 min each: lanes `core`, `assembly`, `packaging`, `governance`, `static` on ubuntu-24.04, macos-15 and windows-2025, on Node `.node-version` (aggregates `check (<os>)`) and again on Node 26.10.0 (aggregates `check (<os>, Node 26)`); the governance lane also runs `runtime:policy:typecheck` and `runtime:policy:test`; install `pnpm install --frozen-lockfile --ignore-scripts --engine-strict --strict-peer-dependencies`, then `pnpm lockfile:peers:check`; job `Node 26 package root compatibility` (10 min); the governance lane runs `release-owned-files:check` | update the CI expectations of sections 7 and 11 |
| 13 | rulesets | `gh api repos/agent-teams-ai/get-modular/rules/branches/main` and `.../rules/branches/changeset-release/main` | main: squash only, linear history, thread resolution required, 0 required approvals, strict required checks `check (ubuntu-24.04)`, `check (macos-15)`, `check (windows-2025)` and `commit-author-identity`; release branch: `[]` | update sections 5.8 and 10; stop if the release branch gets a ruleset |
| 14 | open PRs | `gh pr list --repo agent-teams-ai/get-modular --state open` | #127 and #128 (documentation only) | an open PR that adds a changeset or touches `packages/`: ask the owner whether it lands before REL |
| 15 | standard bytes (for consumers) | `git show $S:docs/architecture/common-assembly.md \| shasum -a 256` | `49d08b6d1762e94308157fb59b3aa82ac1630c91f529f6efcd4915dfffee7ba7` | tell the consumer work; REL never changes this file |
| 16 | git identity | `git config --local user.name; git config --local user.email` | both non-empty | stop: identity must come from the repository's local config |
| 17 | local `main` branch | `git rev-parse --verify --quiet main` | prints a commit (any; `changeset status` needs a branch named `main`) | in `<gm>` never create or move it; in a disposable clone run `git branch main origin/main` |

---

## 2. Scope and non-goals

In scope:

- rehearsal #3 (repeat it only if check 1 requires it);
- one release PR from `changeset-release/main` with exactly the 17 generated paths of section 5.3;
- intended archive hashes in the PR body;
- creating the R-1a bundle from the final REL head after review and CI, following section 6 exactly, and its
  bundle PR (6.6).

Not in scope: npm login, publication or dist-tags; git tags or GitHub releases; TEST-1; the agent-runtime draft
branch; consumer standard pins in other repositories; any code, gate, ADR, documentation, lockfile or changeset
change in get-modular beyond the 17 REL paths and the bundle PR of 6.6; observation or plugin work.

---

## 3. Decisions already taken (facts, not questions)

- Train 1 publishes `@get-modular/core` and `@get-modular/assembly` 0.3.0 (an exact pair, ADR-0027 and ADR-0031),
  and the new public leaf packages `@get-modular/resources` 0.1.0 (ADR-0030) and `@get-modular/conformance` 0.1.0
  (ADR-0033). All packages stay on 0.x; a breaking change ships as a minor with changelog and migration notes.
- Public API baselines (`architecture/public-api/*.json`) are written only by
  `pnpm exec agent-teams-foundation public-api-promote-release --consumer . --json` on the trusted same-repository
  branch `changeset-release/main` (`AGENTS.md`, ADR-0027). Promote runs while the ADR-0031 and ADR-0032 approvals
  are still present; REL removes them afterwards (accepted plan
  `research/module-resources-2026-10/raw/module-resource-scopes-implementation-plan-2026-10-01.md`, section 8.8).
- The registry inventory is read before versioning (ADR-0027).
- Publication is separately authorized and owner-only (ADR-0019, ADR-0027). It uploads exactly the retained
  archives, in the order Core, Assembly, resources, conformance, to the provisional tag `candidate-0-3-0`, with
  read-back of integrity and bytes. `latest` moves only after all four packages (accepted plan 8.9).
- Conformance needs its own minor changeset whenever a peer gets a minor (ADR-0033). Changesets 3.0.2
  (`@changesets/assemble-release-plan` 7.0.0) gives an out-of-range peer dependent only a patch. In this train,
  conformance has its own minor.
- The owner runs independent review and merge. Merge is squash only, with `--match-head-commit` on the reviewed
  head.
- The agent-runtime draft branch may be a draft PR on GitHub. That repository is public, so the archives it carries
  become public before npm publication.
- The 0.3.0 type-check measurements are recorded in PR #137. Core and Assembly sources have not changed since
  (`git diff --stat 345bad1 origin/main -- packages/core/src packages/assembly/src` is empty), and the compilers are
  the same (TypeScript 7.0.2 and 5.8.3). REL carries the #137 table over instead of re-measuring.
- Owner decision (2026-10-08), release branch: no force push and no deletion. The branch `changeset-release/main`
  still points to `f29200dc` (merged #112). REL continues it as a plain fast-forward:
  1. an `-s ours` merge of `f29200dc` on top of `origin/main` (tree exactly main's, second parent the old branch
     head);
  2. the release commit on top;
  3. a plain push.
  Later updates are a normal merge of `main`, or a tree-replacement commit on top of the current head (5.8). The
  owner squash-merges with an explicit subject and body (5.9).
- Standing rule for later releases (for example REL-2 of train 2): the next release starts the same way, with an
  `-s ours` merge of the then-current `changeset-release/main` head (the final REL head of the previous release)
  onto `origin/main`. Never force, never delete.
- Owner decision (2026-10-08), timing: REL stays open after a clean review and green CI. R-1a is packed from that
  final head (section 6). The owner merges REL only after signing off the consumer checks (TEST-1 and the
  agent-runtime draft branch).
- Planning decision (2026-10-04): TEST-1 and agent-runtime pin the Consumer Module Standard at its accepting commit
  `81063ad` (#142). REL changes no standard byte.
- The repository has no git tags and no release workflow. Changesets `publish` and `tag` are not used.
- Decision (2026-10-04): the R-1a bundle, archives included, lives in get-modular `research/releases/0.3.0-train/`,
  with one `.gitignore` line `!research/releases/*/*.tgz`, added by a docs PR (6.6). A test commit of this shape
  passed the whole `pnpm check` chain in the PR environment with a feature head, and the tracked-workspace integrity
  check. The archives become public before npm publication; the same is already accepted for the agent-runtime
  draft PR.

---

## 4. Rehearsal #3 (2026-10-04 on `81063ad`, repeated 2026-10-08 on `8fe924d` with the final branch procedure)

Run in disposable clones, never pushed to GitHub, deleted afterwards. Node 24.21.0, pnpm 11.20.0. Same commands as
sections 5.1 to 5.8. On 2026-10-08 the remote was a local bare repository with `main` at `8fe924d` and
`changeset-release/main` at `f29200dc`. It refused non-fast-forward updates and deletions
(`receive.denyNonFastForwards`, `receive.denyDeletes`), so every push had to be a plain fast-forward.

| Branch procedure (2026-10-08) | Result |
| --- | --- |
| continuation merge (5.1) | tree equal to `origin/main`'s; parents `8fe924d`, `f29200dc` |
| release commit and push (5.3, 5.6) | `git diff --name-status origin/main...HEAD` lists exactly the 17 paths; plain push `f29200d..<head>` accepted |
| refusal | with the remote branch moved by another writer, the plain push was rejected (`non-fast-forward`, exit 1) |
| full `pnpm check`, PR environment, head with the merge in its history | exit 0 in 1342 s on a heavily loaded machine; tracked-workspace integrity passed; tree clean |
| strict CI install, `pnpm lockfile:peers:check` | exit 0 |
| merge update (5.8 step 2): `main` gained a docs-only commit | input check exit 0; merge, still 17 paths; plain push accepted; `release-owned-files:check` exit 0 |
| regeneration (5.8 step 3): `main` gained a new changeset | input check exit 1; fresh tree built; `commit-tree` commit has a tree equal to the fresh commit's and descends from the old head; plain push accepted; the diff against the new `main` lists 18 paths (7 changesets deleted); full `pnpm check` on it in the PR environment: exit 0 in 863 s; tracked-workspace integrity passed |
| squash (5.9), simulated with `git merge --squash` | resulting tree equals the REL head tree; one parent |

| Release content (unchanged between `81063ad` and `8fe924d`) | Result |
| --- | --- |

| Item | Result |
| --- | --- |
| `changeset status --verbose` | core minor -> 0.3.0 (`core-0-3-0-pair.md`); assembly minor -> 0.3.0 (`assembly-run-scope.md`, `assembly-authoring-builder.md`); resources minor -> 0.1.0; conformance minor -> 0.1.0. Nothing else; `lifecycle-kernel` stays 0.1.0 |
| `release:version` | 14 paths: 6 changesets deleted, 4 `package.json` (version only), 4 `CHANGELOG.md` |
| promote | `core.json`: only `packageVersion` 0.2.0 -> 0.3.0. `assembly.json`: `packageVersion` plus 18 added, 12 changed, 0 removed |
| added | `AnyContract`, `AnyInputHandle`, `CapabilitiesOf`, `CapabilityBrand`, `Cardinality`, `Contract`, `DeclarationSpec`, `Declared`, `InputHandle`, `InputHandles`, `KnownCapabilities`, `ModuleFactory`, `ProvidedEntry`, `RunInputs`, `SlotEntry`, `UsedCapability`, `declareModule`, `defineContract` |
| changed | `AnyFactoryHandle`, `Assembly`, `AssemblyOutcome`, `AssemblyPreparationResult`, `AssemblyPrepareInput`, `FactoryContext`, `FactoryHandle`, `PreparationErrorCode`, `PreparedAssembly`, `RootInstances`, `RunErrorCode`, `RunOptions` |
| approvals | after removal `foundation:check` passes; with them it passes too (Foundation 1.7.2 does not flag unused approvals) |
| `docs:quality` | 0 issues |
| full `pnpm check`, PR environment, head `changeset-release/main` (2026-10-04, without the merge) | exit 0 in 933 s |
| reverse case | head `feat/not-a-release`, or a fork head repository, makes `release-owned-files:check` exit 1 with `Release-owned or accepted-ADR history policy failed: architecture/public-api/assembly.json, architecture/public-api/core.json.` |
| lockfile | the version bumps do not change `pnpm-lock.yaml`; frozen installs pass |
| packed manifests | assembly `dependencies` exactly `{"@get-modular/core": "0.3.0"}`; conformance `peerDependencies` exactly `^0.3.0` (assembly), `^0.3.0` (core), `^0.1.0` (resources); resources and conformance have no `dependencies`; engines `>=24.18.0 <25 \|\| >=26.10.0 <27`; no `workspace:`, `link:`, `file:` or `catalog:` specifier; `tar -tzf <tgz> \| grep -v '^package/dist/'` prints exactly `package/LICENSE`, `package/package.json`, `package/CHANGELOG.md`, `package/README.md` |

Archives packed from the rehearsal commit; identical on `81063ad` and `8fe924d`. If check 1 shows no relevant change,
the REL archives must have the same normalized content digest (6.4), and Core, Assembly and resources also the same
SHA-256. A difference is a finding to report before continuing:

| Archive | Bytes | SHA-256 | Normalized content digest |
| --- | --- | --- | --- |
| `get-modular-core-0.3.0.tgz` | 50039 | `bd84c087c7d6842907d08a1a2f6dc0afd250e297f9456e0f77b87630e0f5093e` | `166101ba08bb0582e51f81691b4ee49f12d3cc475a7454dfcee977341481f982` |
| `get-modular-assembly-0.3.0.tgz` | 20633 | `3a4312465485269971db08efb10759fb3a3d4d23266c7f5d9fe8069b4bb411c8` | `6a9a6bf91e21a7c309abecf7eedcad6c41bf7352c4db32f51c9c80b8648c55c8` |
| `get-modular-resources-0.1.0.tgz` | 13816 | `1172c89d9f863d0e1763293eb6153d0835c609fc01ea730004fcee293872cc7a` | `33639ca033d7f98ff43729834419972cd43556f2d0d3c822dc2b8def69c91609` |
| `get-modular-conformance-0.1.0.tgz` | about 16410 (varies with key order) | not reproducible (see below) | `12e038529fdd4441d901bbf58448ee60e43760e0cd3ea823f22e61d703eff356` |

**pnpm 11.20.0 packs conformance non-deterministically.** The order of the three packed `peerDependencies` keys
varies. Independent runs of 10 packs of one tree gave up to 4 different orders and 4 different SHA-256 values, and up
to 6 are possible. Core, Assembly and resources pack byte-identically (3 packs, including a clean rebuild). Never
re-pack a retained archive to "verify" it. Compare conformance archives only by the normalized content digest
(6.4), which is the same for every key order (verified on 10 packs).

Expected `CHANGELOG.md` additions (keep the generated bytes; never hand-edit):

- core: `## 0.3.0` / `### Minor Changes` / `- fcb3a32: Align Core with Assembly 0.3.0 under the exact-pair rule
  (ADR-0027, ADR-0031). No API or behavior change.` with `Authoring surface changed: no`.
- assembly: `## 0.3.0` / `### Minor Changes` with `- 345bad1:` (builder) and `- fcb3a32:` (run scope), each the full
  changeset body; then `### Patch Changes` / `- Updated dependencies [fcb3a32]` / `- @get-modular/core@0.3.0`.
- resources: `## 0.1.0` / `### Minor Changes` / `- 3c28a02: Add @get-modular/resources (ADR-0030): ...`.
- conformance: `## 0.1.0` / `### Minor Changes` / `- a01a129: Add @get-modular/conformance (ADR-0033): ...`; then
  `### Patch Changes` with `Updated dependencies` for `[3c28a02]`, `[345bad1]` and `[fcb3a32]`, the last one listed
  twice, and `@get-modular/resources@0.1.0`, `@get-modular/assembly@0.3.0`, `@get-modular/core@0.3.0`. The
  duplicate line is a Changesets artifact: two changesets were added by one commit. Leave it.

---

## 5. REL: steps and commands

### 5.1 Environment, worktree and the continuation merge

```sh
export PATH=<directory of an official Node build matching .node-version>:$PATH   # never upgrade a shared system Node
node --version                                                                   # must equal .node-version
mkdir -p <tmp>
printf '[user]\n\tname = %s\n\temail = %s\n' "$(git -C <gm> config --local user.name)" \
  "$(git -C <gm> config --local user.email)" > <tmp>/gitconfig-user-only
# Local full checks use GIT_CONFIG_GLOBAL=<tmp>/gitconfig-user-only: a global git hook on the owner's machine
# (core.hooksPath) breaks fixture tests that make commits. CI is not affected.
git -C <gm> fetch origin
git -C <gm> ls-remote origin refs/heads/changeset-release/main     # must print f29200dc...; anything else: stop
git -C <gm> worktree add --detach <rel> origin/main                # no local branch; pushes name the ref explicitly
cd <rel> && git rev-parse origin/main                               # record it as <REL base>
git merge -s ours --no-edit -m "chore(release): continue changeset-release/main from main" \
  f29200dc47f59c30f77dfcbb223d317ea76a6e67
test "$(git rev-parse HEAD^{tree})" = "$(git rev-parse origin/main^{tree})" && echo "merge keeps main's tree"
test "$(git rev-parse HEAD^2)" = "f29200dc47f59c30f77dfcbb223d317ea76a6e67" && echo "second parent is the old head"
```

Why: `release-owned-files:check` accepts release-owned edits only from a head named `changeset-release/main`. That
branch still points to the merged 0.2.0 release (`f29200dc`). The `-s ours` merge makes the new history descend
from it without taking any of its content: the tree stays exactly `main`'s, and the first parent is `main`. A
plain push then fast-forwards the branch. Both `test` lines must print; otherwise stop. Commit messages use
Conventional Commits, because a local commit-message hook may require them.

### 5.2 Version, build, promote, remove approvals

```sh
pnpm install --frozen-lockfile
for p in core assembly resources conformance; do npm view @get-modular/$p versions dist-tags --json; done   # = check 11
pnpm exec changeset status --verbose                  # = section 4, first row
pnpm release:version
pnpm assembly:build                                   # promote reads packages/*/dist/index.d.ts
pnpm exec agent-teams-foundation public-api-promote-release --consumer . --json > <tmp>/promote.json   # exit 0
```

Only after promote succeeds, edit `architecture/foundation/public-api-compatibility.yaml`. In the Assembly entry,
replace

```yaml
    approvedBreakingChanges:
      - fingerprint: "sha256:42266e521b2fb7b3892bda9aae536962986eca082a6917508b5a7143057ef75a"
        decisionId: ADR-0031
      - fingerprint: "sha256:ab0c54428e4fb681a6326466eaffe12f1ba004e0a7b81382a4ad7a99e8fe428c"
        decisionId: ADR-0032
```

with

```yaml
    approvedBreakingChanges: []
```

Nothing else in that file changes. If promote fails (for example `PUBLIC_API_BASELINE_PROMOTION_UNAPPROVED_BREAK`,
exit 2), stop. Never edit baselines or approvals to get past it.

### 5.3 Commit

`git status --short` must list exactly these 17 paths:

- `D` `.changeset/add-conformance-package.md`, `.changeset/add-resources-package.md`,
  `.changeset/assembly-authoring-builder.md`, `.changeset/assembly-run-scope.md`, `.changeset/core-0-3-0-pair.md`,
  `.changeset/node-26-compatibility.md`;
- `M` `packages/core/package.json`, `packages/assembly/package.json`, `packages/resources/package.json`,
  `packages/conformance/package.json` (the `version` line only);
- `M` `packages/core/CHANGELOG.md`, `packages/assembly/CHANGELOG.md`, `packages/resources/CHANGELOG.md`,
  `packages/conformance/CHANGELOG.md`;
- `M` `architecture/public-api/core.json`, `architecture/public-api/assembly.json` (written by promote only);
- `M` `architecture/foundation/public-api-compatibility.yaml` (the two approvals removed).

Commit once, on top of the continuation merge, with the repository's local identity (never `-c user.*`, no
`Co-Authored-By`). `git diff --name-status origin/main...HEAD` must list the same 17 paths: the merge adds nothing.

```text
chore(release): prepare Core and Assembly 0.3.0, resources and conformance 0.1.0

Version the train 1 packages through pinned Changesets and promote the Core and
Assembly API baselines through the supported release writer. The ADR-0031 and
ADR-0032 approvals are removed after promotion. Publication remains separately
authorized.
```

### 5.4 Local gates (after the commit; every exit code recorded)

```sh
pnpm foundation:check                                  # exit 0
pnpm docs:quality                                      # exit 0, 0 issues
git fetch origin main
GIT_CONFIG_GLOBAL=<tmp>/gitconfig-user-only GITHUB_EVENT_NAME=pull_request GITHUB_BASE_REF=main \
  GITHUB_HEAD_REF=changeset-release/main GITHUB_REPOSITORY=agent-teams-ai/get-modular \
  FOUNDATION_PR_HEAD_REPOSITORY=agent-teams-ai/get-modular pnpm check      # exit 0 (about 15 min locally)
GIT_CONFIG_GLOBAL=<tmp>/gitconfig-user-only GITHUB_EVENT_NAME=pull_request GITHUB_BASE_REF=main \
  GITHUB_HEAD_REF=feat/not-a-release GITHUB_REPOSITORY=agent-teams-ai/get-modular \
  FOUNDATION_PR_HEAD_REPOSITORY=agent-teams-ai/get-modular pnpm release-owned-files:check   # exit 1, names both json files
pnpm install --frozen-lockfile --ignore-scripts --engine-strict --strict-peer-dependencies   # exit 0 (as in CI)
pnpm lockfile:peers:check                              # exit 0 (as in CI)
git status --short                                     # empty
```

A red gate: stop and report the output. No gate edits. One exception: a step killed by an environmental error
(`SIGTERM` or the timeout of a child process, `spawnSync ... ETIMEDOUT`) while the machine is heavily loaded. Re-run
that script alone once. If it passes, re-run the full `pnpm check` once, preferably when the load average is below
the CPU count, and require exit 0. `pnpm check` is one `&&` chain, so nothing after the failed step has run yet.
Record both runs in the PR body. A second failure, or any assertion failure: stop.

### 5.5 Intended archives (for the PR body)

```sh
pnpm resources:build && pnpm conformance:build          # Core and Assembly were built in 5.2
mkdir -p <tmp>/intended
for p in core assembly resources conformance; do pnpm --dir packages/$p pack --pack-destination <tmp>/intended; done
cd <tmp>/intended && shasum -a 256 *.tgz && ls -l *.tgz
for f in *.tgz; do printf '%s sha512-%s\n' "$f" "$(openssl dgst -sha512 -binary "$f" | openssl base64 -A)"; done
for f in *.tgz; do echo "$f $(norm_digest "$f")"; done        # norm_digest is defined in 6.4
for f in *.tgz; do tar -xzOf "$f" package/package.json; tar -tzf "$f" | grep -v '^package/dist/'; done   # section 4 row
```

These archives only feed the PR body and later comparisons. They are never R-1a: R-1a is created only by 6.3, from
a fresh clone at the final REL head (6.2). Keep `<tmp>/intended` until the R-1a bundle has been compared with it (6.4),
then delete it.

### 5.6 Push (plain fast-forward only)

```sh
git ls-remote origin refs/heads/changeset-release/main     # must still print f29200dc...
git merge-base --is-ancestor f29200dc47f59c30f77dfcbb223d317ea76a6e67 HEAD && echo "fast-forward"
git push origin HEAD:refs/heads/changeset-release/main     # plain push
```

Never use `--force`, `--force-with-lease`, a `+` refspec or a branch deletion. If the push is rejected
(`non-fast-forward` or `fetch first`), someone else moved the branch: stop and report. An uncertain push result:
run `git ls-remote origin refs/heads/changeset-release/main` and reconcile. No blind retry.

### 5.7 PR

`gh pr create --repo agent-teams-ai/get-modular --base main --head changeset-release/main --title "chore(release):
prepare Core and Assembly 0.3.0, resources and conformance 0.1.0" --body-file <tmp>/pr-body.md`. English, plain and
friendly, regular dashes and quotes only. The body contains:

- what the PR does: Changesets 3.0.2 versioning and promote; the only manual edit is removing the two approvals; a
  versions table; the 17 paths;
- API delta: `core.json` moves only `packageVersion`; `assembly.json` adds 18 and changes 12 items (names as in
  section 4), removes none, the same delta as #137; both removed fingerprints, quoted;
- rehearsal and gates: base SHA, `changeset status` output, registry inventory with its date, each 5.4 command with
  exit code and the `pnpm check` duration, the reverse case;
- type-check measurements: "carried over from #137; Core and Assembly sources and compilers unchanged", with the
  empty diff command;
- intended local archives, not published: per archive bytes, SHA-256, SHA-512 and normalized content digest, plus
  one sentence on the conformance key-order behavior (its SHA-256 is not reproducible; compare the digest);
- CI: per-OS lane durations, filled in once CI finishes;
- "This PR does not publish packages, create git tags or move npm dist-tags.";
- outstanding work: R-1a (section 6), TEST-1, the agent-runtime draft branch, the Node 26.10 consumer proof, owner
  publication. TEST-1 pins the bundle source commit and its tree, and after the REL merge records the merge SHA
  and either the tree equality or the passed 6.4 source check in its evidence. TEST-1 and AR-1a both pin the
  Consumer Module Standard at its accepting commit 81063ad (#142); the release changes no standard byte, so neither
  pin depends on the release commit. Until then adoption of the 0.3.0 train is pending. After publication, a follow-up updates the root `README.md` install
  section, which still says "Core and Assembly `0.1.0` are available from npm" (REL leaves it alone because nothing
  is published yet);
- links: #136, #137, #138, #140, #141, #142, and predecessor release #112;
- a first line: "Do not merge before the R-1a consumer checks are signed off by the owner.";
- history: "The branch continues the merged 0.2.0 release head without force: an `-s ours` merge of `f29200dc` keeps
  `main`'s tree exactly, and the release commit follows. The commit list therefore also shows the old 0.2.0 release
  commit. The squash merge gives `main` one commit." Note for reviewers: a squash never makes release commits
  ancestors of `main`, so every later release PR again lists the earlier release commits from `f29200d` on. This is
  harmless: the identity check accepts them, and the limit of 250 commits is far away.

### 5.8 Main moved before the merge

Required checks are strict, so the branch must be up to date with `main`. Never rebase, never force, never delete.

1. `git -C <gm> fetch origin && git -C <gm> ls-remote origin refs/heads/changeset-release/main` must print the
   current REL head `<head>`, and `<rel>` must be at it (`git -C <rel> rev-parse HEAD`). Anything else: stop.
2. Check whether `main` changed a release input since `<REL base>` (write the path list literally):

   ```sh
   CHECKED="$(git -C <gm> rev-parse origin/main)"      # the exact main commit checked and merged below
   git -C <gm> diff --quiet <REL base> "${CHECKED}" -- .changeset packages architecture package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json .node-version
   ```

   Exit 0 means `main` moved only outside the release inputs. Update with a normal merge of exactly that commit and
   keep `<REL base>`:

   ```sh
   cd <rel>
   git merge --no-edit -m "chore(release): merge main into changeset-release/main" "${CHECKED}"
   git diff --quiet HEAD^1 HEAD -- .changeset packages architecture package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json .node-version && echo "merge brought no release input"
   git diff --name-status "${CHECKED}...HEAD"           # still exactly the 17 paths of 5.3
   ```

   Rerun 5.4 in full, then push as in 5.6, with the current head instead of `f29200dc`
   (`git merge-base --is-ancestor <head> HEAD` must succeed). The generated files stay byte-identical. If R-1a
   exists, run its source check (6.4).
3. Exit 1 means a release input changed: regenerate the release tree on the new `main`, then put that exact tree on
   top of the current REL head as a tree-replacement commit:

   ```sh
   git -C <gm> worktree add --detach <fresh> origin/main
   cd <fresh> && FRESH_BASE="$(git rev-parse HEAD)"    # the new <REL base>
   # here: 5.2 including the yaml edit, then commit as in 5.3 (no continuation merge in <fresh>)
   FRESH="$(git rev-parse HEAD)"
   test "$(git rev-parse "${FRESH}^")" = "${FRESH_BASE}" && echo "fresh commit sits on its base"
   cd <rel>
   OLD="$(git rev-parse HEAD)"                         # must equal the current REL head (step 1)
   NEW="$(git commit-tree "${FRESH}^{tree}" -p "${OLD}" -p "${FRESH_BASE}" \
     -m "chore(release): regenerate the release on main $(git rev-parse --short "${FRESH_BASE}")")"
   git diff --quiet "${FRESH}" "${NEW}" && echo "tree equals the fresh release tree"
   git merge-base --is-ancestor "${OLD}" "${NEW}" && echo "fast-forward"
   git checkout --detach "${NEW}" && pnpm install --frozen-lockfile
   git diff --name-status "${FRESH_BASE}...HEAD"       # only .changeset/, packages/ and architecture/ paths
   ```

   The second parent is always the exact `main` commit the fresh tree was generated from (`FRESH_BASE`), never a later
   `origin/main`. A later parent would make the squash merge silently revert the newer `main` commits. If `main` moved
   again meanwhile, push `NEW` first, then repeat 5.8 from step 1.

   `<fresh>` is used only to build the tree. Its commit is never pushed; delete the worktree with
   `git -C <gm> worktree remove <fresh>` once `NEW` is pushed. In `<rel>`, rerun 5.4 in full and 5.5, then push as in
   5.6 with `OLD` instead of `f29200dc`. Record the new base SHA as `<REL base>` (5.1, last line) and update the PR
   body (5.7) with the new 5.4 results and the new intended hashes and digests. If R-1a exists, create it again
   (6.3) and repeat the consumer checks.
4. Ask for review again. The reviewer's checks of 11.1 and 11.13 stay mandatory after every update.

### 5.9 Merge (owner only, after the consumer checks are signed off)

The PR shows several commits (the old 0.2.0 release commit, the continuation merge, the release commit and any
update commits). The squash merge needs an explicit subject and body:

```sh
gh pr merge <N> --repo agent-teams-ai/get-modular --squash --match-head-commit <head> \
  --subject "chore(release): prepare Core and Assembly 0.3.0, resources and conformance 0.1.0 (#<N>)" \
  --body "Version the train 1 packages through pinned Changesets and promote the Core and Assembly API baselines through the supported release writer. The ADR-0031 and ADR-0032 approvals are removed after promotion. Publication remains separately authorized."
```

Do not pass `--delete-branch`. Afterwards run `git fetch origin main`; then `git rev-parse origin/main^{tree}` must
equal `<head>^{tree}`, and the new
`main` commit has exactly one parent. The branch stays at `<head>`, and the next release continues from it
(section 3, standing rule).

---

## 6. R-1a retained archive bundle (canonical; consumer work depends on these exact names)

### 6.1 Contents

Bundle name `get-modular-0.3.0-train-r1a`. One directory with exactly these files:

| File | Content |
| --- | --- |
| `get-modular-core-0.3.0.tgz` | `pnpm pack` of `packages/core` |
| `get-modular-assembly-0.3.0.tgz` | `pnpm pack` of `packages/assembly` |
| `get-modular-resources-0.1.0.tgz` | `pnpm pack` of `packages/resources` |
| `get-modular-conformance-0.1.0.tgz` | `pnpm pack` of `packages/conformance` |
| `SHA256SUMS` | `shasum -a 256 *.tgz` output (`<64 hex>  <file>`, sorted by file name) |
| `INTEGRITY` | one line per archive, `<file> sha512-<base64>`, sorted by file name; the same SRI string npm and pnpm use |
| `release-intent.md` | the intent record (6.5) |

The agent-runtime draft branch and TEST-1 use all four. agent-runtime adds conformance as a development-only
dependency (`smoke` and `isolate`) and installs its peers under strict peer dependencies.

### 6.2 Source and timing

Source = the final REL head `<head>`, packed only after the review is clean and every required CI check is green
on that exact head, before the merge. Never pack earlier.

The record names the source commit, its tree (`git rev-parse <commit>^{tree}`) and the tree of each package
directory (`git rev-parse <commit>:packages/<name>`).

### 6.3 Creation (once; never re-pack afterwards)

```sh
git clone --no-checkout <gm> <tmp>/r1a-src && cd <tmp>/r1a-src
git remote set-url origin https://github.com/agent-teams-ai/get-modular.git && git fetch origin
git fetch origin pull/<N>/head && git checkout --detach <head>
pnpm install --frozen-lockfile
pnpm assembly:build && pnpm resources:build && pnpm conformance:build
mkdir -p <tmp>/get-modular-0.3.0-train-r1a
for p in core assembly resources conformance; do
  pnpm --dir packages/$p pack --pack-destination <tmp>/get-modular-0.3.0-train-r1a
done
cd <tmp>/get-modular-0.3.0-train-r1a
shasum -a 256 *.tgz > SHA256SUMS
for f in *.tgz; do printf '%s sha512-%s\n' "$f" "$(openssl dgst -sha512 -binary "$f" | openssl base64 -A)"; done > INTEGRITY
```

Then check every packed manifest and file list against section 4 ("packed manifests" row), compute the normalized
content digests (6.4) and require them equal to the PR body's. Record all values in `release-intent.md`. Any
deviation: stop.

### 6.4 Verification by consumers and before publication

- Bytes: `shasum -a 256 -c SHA256SUMS` passes. For each archive,
  `printf 'sha512-%s\n' "$(openssl dgst -sha512 -binary <f> | openssl base64 -A)"` equals its `INTEGRITY` line, the pnpm lock
  `integrity` of the installed `file:` archive, and after publication
  `npm view @get-modular/<p>@<v> dist.integrity`. Use `openssl base64 -A` (or Node); GNU `base64` wraps lines on
  Linux and breaks the 88-character SRI string.
- Content equivalence, whenever two packs of the same package must be compared (the PR body's intended archives
  against R-1a, or R-1a against the merged commit): compare normalized content digests. The digest sorts the keys of
  `package/package.json` at every level and hashes the sorted list of per-file SHA-256 values:

  ```sh
  norm_digest() { d="$(mktemp -d)"; tar -xzf "$1" -C "$d"
    node -e 'const fs=require("fs"),f=process.argv[1],s=v=>Array.isArray(v)?v.map(s):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,s(v[k])])):v;fs.writeFileSync(f,JSON.stringify(s(JSON.parse(fs.readFileSync(f,"utf8"))),null,2)+"\n")' "$d/package/package.json"
    (cd "$d" && find package -type f | LC_ALL=C sort | xargs shasum -a 256) | shasum -a 256 | cut -d' ' -f1; rm -rf "$d"; }
  norm_digest get-modular-conformance-0.1.0.tgz
  ```

  Values at `81063ad` and `8fe924d` (identical): section 4 table.
- Source still valid after a REL update or merge: in a fresh clone at the merged REL commit (or the new
  head), build and pack the four packages into a separate comparison directory, never into the bundle. Every
  normalized content digest must equal the bundle's; Core, Assembly and resources must also match `SHA256SUMS`
  byte-for-byte. Otherwise create a new bundle and repeat the consumer checks.
- Node 26.10 or newer, on the retained bytes. Provide pnpm 11.20.0 for the fixture the same way CI does:
  `npm install --prefix <tmp>/node26-pnpm --no-save --ignore-scripts --no-audit --no-fund pnpm@11.20.0`, then
  `node <tmp>/node26-pnpm/node_modules/pnpm/bin/pnpm.mjs --version` must print `11.20.0`. Then
  `GET_MODULAR_COMPAT_ARCHIVE_DIR=<bundle dir> GET_MODULAR_COMPAT_PNPM_CLI=<tmp>/node26-pnpm/node_modules/pnpm/bin/pnpm.mjs <node 26.10+>/bin/node --no-warnings --test tests/node-runtime-compatibility.test.mjs`,
  run from a get-modular checkout at the bundle source. The test accepts external archives when
  `GET_MODULAR_COMPAT_ARCHIVE_DIR` is set. Node 26.10+ was not installed on the owner's machine on 2026-10-04 (only
  26.9.0). Use a hosted worker, or an official Node 26.10.x tarball checked against its `SHASUMS256.txt`. CI job
  `node-26-compatibility` covers the same content from its own packs, not these exact bytes.

### 6.5 `release-intent.md` template

```markdown
# Get Modular 0.3.0 train: retained release archives (R-1a)

Status: retained, awaiting owner review. Nothing is published.

## Source

- Repository: `agent-teams-ai/get-modular`.
- Source commit `<40 hex>` (final head of REL PR #N), tree `<40 hex>`; merged as `<40 hex>` (filled in after the merge).
- Package trees: `packages/core` `<id>`, `packages/assembly` `<id>`, `packages/resources` `<id>`,
  `packages/conformance` `<id>`.
- Toolchain: Node `<.node-version>`, pnpm `<packageManager>`.
- CI on the exact source: `<run URL>` (all required checks and `node-26-compatibility` passed).

## Archives

| Archive | Bytes | SHA-256 | SHA-512 integrity | Normalized content digest |
| --- | --- | --- | --- | --- |
| `get-modular-core-0.3.0.tgz` | | | | |
| `get-modular-assembly-0.3.0.tgz` | | | | |
| `get-modular-resources-0.1.0.tgz` | | | | |
| `get-modular-conformance-0.1.0.tgz` | | | | |

Machine-readable copies: `SHA256SUMS` and `INTEGRITY` in this directory.

## Packed manifests

<the section 4 "packed manifests" facts, re-checked on these bytes>

## Registry state (read <date>)

<npm view output for the four names>

## Proposed publication (owner only)

Order Core, Assembly, resources, conformance; `npm publish ./<archive> --tag candidate-0-3-0 --access public`;
read-back of `dist.integrity` and a byte comparison of the downloaded tarball; `latest` only after all four.
An uncertain result is reconciled read-only, never retried blindly.

## Consumer checks on these bytes

| Check | Result | Evidence |
| --- | --- | --- |
| TEST-1 | pending | |
| agent-runtime draft branch (all four archives, including conformance) | pending | |
| Node 26.10+ consumer | pending | |

## Owner publication approval

Pending.
```

The record must contain no local paths, host names, machine identifiers or e-mail addresses.

### 6.6 Location and bundle PR

Consumers refer to the bundle by name, file names and `SHA256SUMS`/`INTEGRITY`, never by a machine path. Each
consumer keeps its own byte-identical copy and proves it with `shasum -a 256 -c`. Planned consumer copies:
modularity-host-test under `third_party/archives/train-0.3/` (its earlier candidates live under
`third_party/archives/candidate-0.2/` with `.gitignore` negations); agent-runtime under
`architecture/get-modular/evidence/`.

The bundle lives in get-modular `research/releases/0.3.0-train/`. get-modular's `.gitignore` ignores `*.tgz` (no
archive is tracked there today), so the bundle PR adds one negation line after it.

```sh
git -C <gm> fetch origin
git -C <gm> worktree add --detach <evidence> origin/main
cd <evidence>
mkdir -p research/releases/0.3.0-train
cp <tmp>/get-modular-0.3.0-train-r1a/* research/releases/0.3.0-train/
printf '!research/releases/*/*.tgz\n' >> .gitignore           # appended after the existing *.tgz line
(cd research/releases/0.3.0-train && shasum -a 256 -c SHA256SUMS)
git add .gitignore research/releases/0.3.0-train
git status --short          # exactly .gitignore and the 7 bundle files of 6.1
git commit -m "docs(research): retain the 0.3.0 train release archives"   # repository-local identity
pnpm install --frozen-lockfile
GIT_CONFIG_GLOBAL=<tmp>/gitconfig-user-only GITHUB_EVENT_NAME=pull_request GITHUB_BASE_REF=main \
  GITHUB_HEAD_REF=docs/release-archives-0.3.0-train GITHUB_REPOSITORY=agent-teams-ai/get-modular \
  FOUNDATION_PR_HEAD_REPOSITORY=agent-teams-ai/get-modular pnpm check      # exit 0
git push origin HEAD:refs/heads/docs/release-archives-0.3.0-train
gh pr create --repo agent-teams-ai/get-modular --base main --head docs/release-archives-0.3.0-train \
  --title "docs(research): retain the 0.3.0 train release archives" --body-file <tmp>/bundle-pr-body.md
```

The body states the source commit, the archive table of `release-intent.md`, "Not published; do not merge before
REL" and the redaction check (no local paths, host names, machine identifiers or e-mail addresses).

Timing: open the bundle PR right after 6.3. The owner merges it right after REL. Until then, consumers fetch the
files from the PR head by SHA (`git fetch origin pull/<bundle PR>/head`, then
`git show <sha>:research/releases/0.3.0-train/<file> > <file>`) and verify them with `shasum -a 256 -c SHA256SUMS`.
Required checks are strict, so after the REL merge the bundle PR is behind `main`. Before the owner merges it, run
`git merge --no-edit origin/main` in `<evidence>`, push plainly and wait for CI again.

`release-intent.md` changes after the first merge with the consumer-check results and the publication checkpoints
of R-1b. Make one follow-up docs PR after the owner signs off the consumer checks, and one after the publication
read-back. The archives, `SHA256SUMS` and `INTEGRITY` never change after the first merge. A new bundle (5.8 step 3)
replaces all three files in one PR and says why.

---

## 7. Gates and exit codes (summary)

| When | Command | Expected |
| --- | --- | --- |
| 5.2 | `pnpm exec changeset status --verbose` | exit 0, exactly the four bumps |
| 5.2 | promote | exit 0 |
| 5.4 | `pnpm foundation:check`, `pnpm docs:quality` | exit 0 |
| 5.4 | full `pnpm check` (PR environment, release head) | exit 0 |
| 5.4 | `release-owned-files:check` with a feature head | exit 1 |
| 5.1 | tree of the continuation merge equals `origin/main`'s; second parent `f29200dc` | both `test` lines print |
| 5.4 | strict frozen install, `pnpm lockfile:peers:check` | exit 0 |
| 5.6 | plain push | fast-forward accepted; rejected: stop |
| 5.8 | tree of a regeneration commit equals the fresh release tree; new head descends from the old one | both checks print |
| CI | required: `check (ubuntu-24.04)`, `check (macos-15)`, `check (windows-2025)`, `commit-author-identity`; also expected green: `check (<os>, Node 26)` and `Node 26 package root compatibility` | success on `<head>`; every lane under 13.5 min (90% of 15); the Node 26 package job under 9 min (its timeout is 10) |
| 6.3/6.4 | `shasum -a 256 -c SHA256SUMS`; normalized digests equal the PR body's | exit 0; equal |
| 6.6 | full `pnpm check` on the bundle PR head (PR environment, its own head ref); CI required checks | exit 0; success |

---

## 8. Risks and stop conditions

| Risk | Action |
| --- | --- |
| `changeset-release/main` on origin is not `f29200dc` before the first push, or not the current REL head at a later update | stop |
| `main` moved | 5.8 (merge update or tree-replacement regeneration); `changeset status` differs from section 4: stop |
| a plain push is rejected (`non-fast-forward`, `fetch first`) | stop; never retry with force |
| the continuation merge or a regeneration commit has an unexpected tree | stop |
| `changeset status` fails with `Failed to find where HEAD diverged from "main"` | no local `main` branch; check 17 of section 1 |
| the registry shows a target version or new dist-tags | stop (ADR-0027) |
| promote fails | stop; never remove the approvals first, never edit baselines |
| API delta is not 18/12/0, or `core.json` changes beyond `packageVersion` | stop |
| any gate red, locally or in CI | stop and report; never edit or narrow a gate |
| a CI lane above 13.5 min | stop and report |
| a packed manifest deviates from section 4 | stop |
| conformance SHA-256 differs from the intended one | expected; compare normalized content digests (6.4); a digest difference: stop |
| a Core or Assembly defect found by the consumer checks while REL is open | stop and report to the owner. The fix lands on `main` as a normal feature PR (for an API-shape fix with a new cumulative approval); then REL is regenerated (5.8 step 3) and R-1a is created again. Keeping REL open exists for this: after the merge, an API-shape fix would need 0.3.1 or 0.4.0, a new pair decision and gate edits |
| an uncertain push, PR or merge result | read-only reconcile (`git ls-remote`, `gh pr view`); no blind retry |
| disk full (ENOSPC) | stop; delete only your own disposable copies |
| any ambiguity or mismatch with this brief | stop and ask |

---

## 9. Must not

- No `npm login`, `npm publish`, `pnpm publish`, `npm dist-tag`, `changeset publish` or `changeset tag`. No git tags,
  no GitHub releases.
- No change outside the 17 paths in REL. No hand edits to generated `CHANGELOG.md` or `architecture/public-api/*.json`.
  No new changesets.
- Do not remove the approvals before promote.
- Never force-push (`--force`, `--force-with-lease`, `+` refspec), delete or rebase `changeset-release/main`. Every
  push is a plain fast-forward. Do not touch other branches, the main checkout or other worktrees.
- No destructive git commands (`checkout --`, `restore`, `reset --hard`, `clean -f`, `stash drop`, `branch -D`) in
  shared checkouts.
- No GitHub comments, labels, reviewer requests or merges. Review and merge belong to the owner.
- Never replace or re-pack the retained bundle. Packs made only for comparison go to a separate directory.

---

## 10. Done criteria

- A PR from `changeset-release/main` whose diff against `main` is exactly the release paths of 5.3, reached only by
  plain fast-forward pushes; every 5.4 gate as expected;
  CI green within the lane limit; the PR body complete (5.7).
- The owner's reviewer has signed off the checklist of section 11.
- R-1a bundle created from the final `<head>` after review and green CI (section 6), consumer checks handed off.
  The owner merges REL (5.9) after signing off the consumer checks. The 6.4 source check passes for the merged
  commit.
- The bundle PR (6.6) is open with green CI, and the owner merges it after REL.
- The merged commit's tree equals the reviewed head's tree (`git rev-parse <merged>^{tree}` against
  `<head>^{tree}`). The branch was never force-pushed or deleted. No package is published and no tag exists.

---

## 11. Independent review checklist (for the owner's reviewer)

Work in your own disposable clone at the PR head (`git fetch origin pull/<N>/head && git checkout --detach FETCH_HEAD`).

1. **Reproduce.** In a second disposable clone at the PR's base (`git merge-base origin/main <head>`), run 5.2
   including the yaml edit, then `git fetch origin pull/<N>/head && git diff --exit-code --stat FETCH_HEAD`. It must
   exit 0: your regenerated files equal the PR head.
2. **File set.** `git diff --name-status origin/main...<head>` lists exactly the 5.3 paths.
3. **Versions.** `git show <head>:packages/<p>/package.json | grep '"version"'` gives 0.3.0, 0.3.0, 0.1.0, 0.1.0.
   `lifecycle-kernel` is unchanged.
4. **Changelog text.** For every deleted changeset, its body (`git show origin/main:.changeset/<file>`) appears
   verbatim in the matching `CHANGELOG.md`.
5. **Baselines.** `git diff origin/main <head> -- architecture/public-api/core.json` changes only `packageVersion`.
   For Assembly, compare items:
   `node -e 'const [a,b]=process.argv.slice(1).map(f=>new Map(JSON.parse(require("fs").readFileSync(f)).entrypoints[0].items.map(i=>[i.canonicalReference,JSON.stringify(i)])));console.log("added",[...b.keys()].filter(k=>!a.has(k)).length,"changed",[...b.keys()].filter(k=>a.has(k)&&a.get(k)!==b.get(k)).length,"removed",[...a.keys()].filter(k=>!b.has(k)).length)' <base assembly.json> <head assembly.json>`
   prints `added 18 changed 12 removed 0`.
6. **Approvals.** The yaml diff only replaces the two Assembly approvals with `[]`.
7. **Gates.** Full `pnpm check` in the PR environment (5.4) exits 0; the reverse case exits 1.
8. **CI.** On the exact head:

   - every required check is green (`check (ubuntu-24.04)`, `check (macos-15)`, `check (windows-2025)`,
     `commit-author-identity`);
   - the Node 26 aggregates `check (<os>, Node 26)` and `Node 26 package root compatibility` are green too;
   - all 30 lane jobs finished under 13.5 min, and the Node 26 package job under 9 min.
9. **Archives.** Pack `<head>` into your own directory. Core, Assembly and resources match the PR body's SHA-256;
   all four match the PR body's normalized content digests (6.4); conformance is compared by digest only. The packed
   manifests and file lists match section 4.
10. **Nothing published.** `git ls-remote --tags origin` is empty; `npm view` is unchanged from check 11.
11. **Text and identity.** Commit author from the repository's local config; no `Co-Authored-By` trailer; plain
    English PR text with regular dashes and quotes.
12. **Mutation spot-checks.** In a disposable clone at `<head>`, run `pnpm install --frozen-lockfile && pnpm
    assembly:build && pnpm resources:build && pnpm conformance:build` first. Then make a control run of every command
    below on the unchanged head; each must exit 0, otherwise a later exit 1 proves nothing. Make each mutation as a
    commit on a detached HEAD: gates compare the working tree with the index, so uncommitted edits fail for the wrong
    reason. Start each mutation again from `git switch --detach <head>`. pnpm's dependency check may rewrite
    `pnpm-lock.yaml` after a manifest mutation; throw the clone away afterwards. Verified on 2026-10-04 against the
    rehearsal commit:

    | # | Mutation | Command | Expected |
    | --- | --- | --- | --- |
    | M1 | drop the `defineContract` item from `architecture/public-api/assembly.json` | `pnpm foundation:check` | exit 1, `package.public-api-compatibility` violation on `packages/assembly/dist/index.d.ts` |
    | M2 | set `packageVersion` in `architecture/public-api/core.json` back to `0.2.0` | `pnpm foundation:check`; `pnpm sdk-growth:check` | both exit 1: the first with `baseline-version-mismatch`, the second with `SDK_GROWTH_PENDING_INVALID: @get-modular/core retained v1 baseline drifted` |
    | M3 | set `packages/core/package.json` version to `0.3.1` | `pnpm governance:check` | exit 1, `Assembly admission requires an exact Core/Assembly pair` |
    | M4 | change the conformance peer `@get-modular/core` to `workspace:*` | `pnpm governance:check` | exit 1, `@get-modular/conformance must declare exactly its row peers with the workspace caret range` |
    | M5 | none; run 5.4's reverse case | `pnpm release-owned-files:check` with `GITHUB_HEAD_REF=feat/x` | exit 1 |
    | M6 | at `origin/main`: `release:version`, `assembly:build`, remove the approvals, then promote | promote | exit 2, `PUBLIC_API_BASELINE_PROMOTION_UNAPPROVED_BREAK`, no baseline written |

    If a mutation passes, the gate does not protect the release state. That is a finding (P1) to report.

13. **History, no force, no deletion.** List the PR commits:
    `git log --format='%h %p | %an <%ae> | %cn <%ce> | %s' origin/main..<head>`.

    - Expected commits: the old 0.2.0 release commit `f29200d`, the continuation merge `M`, the release commit, and
      only 5.8 update commits after them.
    - Every commit has the owner identity as both author and committer. The organization identity check requires
      exactly that.
    - `M` keeps `main`'s tree and joins the old head: `test "$(git rev-parse M^{tree})" = "$(git rev-parse M^1^{tree})"`,
      and `git rev-parse M^2` prints `f29200dc47f59c30f77dfcbb223d317ea76a6e67`.
    - Each 5.8 step 2 merge `U` brings nothing into the release inputs:
      `git diff --quiet U^1 U -- .changeset packages architecture package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json .node-version`
      exits 0.
    - Each 5.8 step 3 commit `R` has the regeneration base as `R^2`. Regenerate yourself at `R^2` (5.2 with the yaml
      edit, in a disposable clone); `git diff --quiet <your commit> R` exits 0.
    - No force push and no deletion ever happened on the branch, including before the PR existed:
      `gh api 'repos/agent-teams-ai/get-modular/activity?ref=refs/heads/changeset-release/main' --paginate --jq '.[] | select(.activity_type == "force_push" or .activity_type == "branch_deletion") | .activity_type'`
      prints nothing.
    - No force push and no deletion happened while the PR was open:
      `gh api repos/agent-teams-ai/get-modular/issues/<N>/timeline --paginate --jq '.[] | select(.event == "head_ref_force_pushed" or .event == "head_ref_deleted") | .event'`
      prints nothing.
    - `git merge-base --is-ancestor f29200dc47f59c30f77dfcbb223d317ea76a6e67 <head>` succeeds, and so does the same
      check for every earlier head SHA recorded in the PR body.
