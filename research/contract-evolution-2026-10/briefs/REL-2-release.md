# REL-2 brief: release PR for Core and Assembly 0.4.0 and conformance 0.2.0

PR title: `chore(release): prepare Core and Assembly 0.4.0 and conformance 0.2.0`. Generated content only. Publication
is a separate, owner-only step.

## Re-verify before start

1. `git fetch origin`. T2-5 is merged; record `origin/main`. `ls .changeset/`: expect `core-revision-windows.md`,
   `assembly-revision-windows.md`, `conformance-revision-windows.md` and `config.json`; any other changeset: list it
   and stop if it is not explained by a merged PR.
2. Standing release rule (owner, 2026-10-08), used for REL-1 and binding here: the head is
   `changeset-release/main` (`architecture/checks/release-owned-files.mjs` exempts only that head); no force push and
   no deletion of that branch. After REL-1's squash merge the branch stays at REL-1's final head: record
   `git ls-remote origin refs/heads/changeset-release/main` and compare it with the final head recorded in the REL-1
   PR (or in the last merged release PR); any other head: stop. A release workflow that now exists replaces this
   section: stop and ask. Train 1 itself is published: `npm view @get-modular/core version` prints `0.3.0` and
   resources/conformance `0.1.0`.
3. `npm view @get-modular/<p> versions dist-tags --json` for core, assembly, resources, conformance: 0.4.0 and
   conformance 0.2.0 must not exist; record the inventory with its date.
4. `pnpm exec changeset status --verbose`: core minor 0.4.0, assembly minor 0.4.0, conformance minor 0.2.0, nothing
   else. Different: stop.
5. `architecture/foundation/public-api-compatibility.yaml` holds exactly the ADR-NNNN approvals of Core and Assembly
   (from T2-4). Anything else: stop.
6. Node per `.node-version`; pnpm per `packageManager`.

## Owner decisions (facts) and open questions

One monotonic line per contract id, no `/v2` ids; a provider declares `revision` and `compatibleFrom`; binding iff
`compatibleFrom <= consumer revision <= provider revision`; the consumer's revision is fixed by the version of its
contract package (an ordinary dependency); any change of `revision` or `compatibleFrom` releases a version a caret
range does not accept; raising a revision keeps every `implementationId`; Core, Assembly and conformance accept only
declaration schema 2, schema 1 is refused (`schema.unsupported-version` in Core, `assembly.bind.invalid-declaration`
in Assembly) and the historical corpus replays through a test-side lift (owner decision 2026-10-08); T2-3 and T2-4 are
stacked PRs with separate reviews that land in `main` as one squash, and train 2 lands only after train 1 is released
(decided on 2026-10-04 during planning); all `@get-modular/*` stay 0.x and a break ships as a minor with migration
notes; plugins and observation are out of scope. Open questions: none. Anything this brief does not cover: stop and
ask.

## Build (own disposable clone, plain fast-forward history)

Work in your own disposable clone `<clone>` of `agent-teams-ai/get-modular`, never a shared checkout: Changesets needs
a local `main` branch, and moving it is safe only there.

```sh
git fetch origin main changeset-release/main
REL1=$(git rev-parse origin/changeset-release/main)   # must equal the head checked in re-verify step 2
git checkout --detach origin/main                      # a fresh clone has main checked out; leave it first
git rev-parse HEAD                                     # the <REL base>; record it in the PR body
git branch -f main origin/main                         # `changeset status` compares with a local main
git merge -s ours -m "chore(release): continue changeset-release/main from main" "$REL1"
test "$(git rev-parse 'HEAD^{tree}')" = "$(git rev-parse 'origin/main^{tree}')"   # the merge keeps main's tree
test "$(git rev-parse 'HEAD^2')" = "$REL1"                                         # and records REL-1's head
pnpm install --frozen-lockfile
pnpm exec changeset status --verbose                   # must equal re-verify step 4
pnpm release:version
pnpm assembly:build && pnpm resources:build && pnpm conformance:build
pnpm exec agent-teams-foundation public-api-promote-release --consumer . --json > <tmp>/rel-promote.json
```

Only after promote succeeds: remove the two ADR-NNNN entries from `approvedBreakingChanges` (Core becomes `[]`,
Assembly `[]` unless re-verify step 5 listed others). Then `pnpm foundation:check && pnpm docs:quality`.

Expected paths of the release commit (the merge commit before it changes no file), nothing else:

- `D` the three changesets;
- `M` `packages/{core,assembly,conformance}/package.json` (version only) and their `CHANGELOG.md`;
- `M` `architecture/public-api/core.json`, `architecture/public-api/assembly.json` (written only by promote);
- `M` `architecture/foundation/public-api-compatibility.yaml` (the approvals removed).

Release commit on top of the merge. Commit message: `chore(release): prepare Core and Assembly 0.4.0 and conformance
0.2.0`, body: "Version the train 2
packages through Changesets and promote the Core and Assembly API baselines through the supported release writer.
The ADR-NNNN approvals are removed after promotion. Publication remains separately authorized." Then:

```sh
GIT_CONFIG_GLOBAL=<file with only a [user] section> GITHUB_EVENT_NAME=pull_request GITHUB_BASE_REF=main \
  GITHUB_HEAD_REF=changeset-release/main GITHUB_REPOSITORY=agent-teams-ai/get-modular \
  FOUNDATION_PR_HEAD_REPOSITORY=agent-teams-ai/get-modular pnpm check
pnpm install --frozen-lockfile --ignore-scripts --engine-strict --strict-peer-dependencies && pnpm lockfile:peers:check
for p in core assembly conformance; do pnpm --dir packages/$p pack --pack-destination <tmp>/rel2; done
```

Verify the packed manifests: assembly `dependencies` exactly `{ "@get-modular/core": "0.4.0" }`; conformance peers
`@get-modular/core` and `@get-modular/assembly` `^0.4.0`, `@get-modular/resources` the current minor; no `workspace:`,
`link:` or `file:`; files outside `dist/` exactly `LICENSE`, `package.json`, `CHANGELOG.md`, `README.md`. Record
SHA-256 and SHA-512 of each archive (conformance packs may differ only in peer key order; compare normalized content).

Before every push:

```sh
git ls-remote origin refs/heads/changeset-release/main   # must equal $REL1 (or the current REL-2 head on updates)
git merge-base --is-ancestor "$REL1" HEAD && echo fast-forward   # use the current REL-2 head instead of $REL1 on updates
```

Push: `git push origin HEAD:refs/heads/changeset-release/main`, a plain fast-forward of the branch. A rejected push
means stop; never `--force`, never delete the branch. An uncertain push result: run `git ls-remote` and reconcile; no
blind retry.

### When `main` moves before the merge

The required checks are strict, so the branch must be up to date with `main`. Never rebase, never force, never delete.
`<REL base>` is the `main` commit the current release head was generated from; `<head>` is the current REL-2 head.

1. `git fetch origin && git ls-remote origin refs/heads/changeset-release/main` must print `<head>`, and `<clone>` must
   be at it (`git rev-parse HEAD`). Anything else: stop.
2. Pin the `main` commit you check and check whether it changed a release input since `<REL base>`:

   ```sh
   CHECKED="$(git rev-parse origin/main)"              # the exact main commit checked and merged below
   git diff --quiet <REL base> "${CHECKED}" -- .changeset packages architecture package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json .node-version
   ```

   Exit 0 means `main` moved only outside the release inputs. Update with a normal merge of exactly that commit and
   keep `<REL base>`:

   ```sh
   git merge --no-edit -m "chore(release): merge main into changeset-release/main" "${CHECKED}"
   git diff --quiet HEAD^1 HEAD -- .changeset packages architecture package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json .node-version && echo "merge brought no release input"
   git diff --name-status "${CHECKED}...HEAD"           # still exactly the release paths listed above
   ```

   Run the gates above in full again, then push as above with `<head>` instead of `$REL1`. The generated files stay
   byte-identical.
3. Exit 1 means a release input changed: regenerate the release tree on the new `main`, then put that exact tree on
   top of `<head>` as a tree-replacement commit:

   ```sh
   git worktree add --detach <fresh> origin/main
   cd <fresh> && FRESH_BASE="$(git rev-parse HEAD)"    # the new <REL base>
   git branch -f main "${FRESH_BASE}"                  # `changeset status` compares with a local main
   # here: the build above from `pnpm install --frozen-lockfile` on, including the approvals removal, then the
   # release commit (no continuation merge in <fresh>)
   FRESH="$(git rev-parse HEAD)"
   test "$(git rev-parse "${FRESH}^")" = "${FRESH_BASE}" && echo "fresh commit sits on its base"
   cd <clone>
   OLD="$(git rev-parse HEAD)"                         # must equal <head> (step 1)
   NEW="$(git commit-tree "${FRESH}^{tree}" -p "${OLD}" -p "${FRESH_BASE}" \
     -m "chore(release): regenerate the release on main $(git rev-parse --short "${FRESH_BASE}")")"
   git diff --quiet "${FRESH}" "${NEW}" && echo "tree equals the fresh release tree"
   git merge-base --is-ancestor "${OLD}" "${NEW}" && echo "fast-forward"
   git checkout --detach "${NEW}" && pnpm install --frozen-lockfile
   git diff --name-status "${FRESH_BASE}...HEAD"       # exactly the release paths listed above
   ```

   The second parent is always the exact `main` commit the fresh tree was generated from (`FRESH_BASE`), never a later
   `origin/main`. A later parent would make the squash merge silently revert the newer `main` commits. If `main` moved
   again meanwhile, push `NEW` first, then repeat from step 1.

   `<fresh>` is used only to build the tree. Its commit is never pushed; remove the worktree with
   `git worktree remove <fresh>` once `NEW` is pushed. In `<clone>`, run the gates above in full again, pack again,
   then push `NEW` as above with `OLD` instead of `$REL1`. Never rebase the generated commit. Record `FRESH_BASE` as
   the new `<REL base>` and update the PR body with the new gate results and archive hashes.
4. Ask for review again; the history checks of the review checklist stay mandatory after every update.

## PR

`gh pr create --repo agent-teams-ai/get-modular --base main --head changeset-release/main --title "chore(release): prepare Core and Assembly 0.4.0 and conformance 0.2.0" --body-file <file>`.

Body (English, plain): versions table; the `<REL base>` SHA (and, after updates, every earlier REL-2 head); the
generated paths; promote delta per package (Core: the wire types and
`Diagnostic`; Assembly: the types of T2-4, including the six added helper types `ContractSpec`, `ValuesOf`,
`RevisionPairs`, `EntryKeys`, `ValueAt`, `ValuesAll`) with names; the removed fingerprints quoted; registry inventory with date;
`pnpm check` time; packed manifests and archive hashes; CI lane durations (stop above 810 s); "This PR does not
publish packages, create tags or move dist-tags"; outstanding work: TEST-2 and the Agent Runtime draft (AR-3) run on
these archives, AR and TEST move their CMS pins to the T2-5 commit, owner publication; and the line "Do not merge
before the owner signs off TEST-2 and AR-3; the consumer archives are packed from the final head after review and CI".

## Risks and stop conditions

| Risk | Stop / action |
| --- | --- |
| the release branch on origin is not REL-1's final head (or the last merged release head) | stop |
| a push is rejected | stop; never force, never delete the branch |
| `main` moves before merge | merge update of the checked `main` commit when no release input changed, otherwise a tree-replacement commit whose second parent is the fresh tree's base; plain push |
| promote fails or reports a delta outside T2-3/T2-4 | stop; never edit baselines or approvals to get past it |
| packed manifest differs from the expected shape | stop |
| a TEST-2 or AR-3 finding needs an API change | stop; owner decides (fix on `main` and regenerate, or ship) |

## Must not

- `npm publish`, `pnpm publish`, `changeset publish`, tags, dist-tags, GitHub releases.
- Edit any path outside the list; hand-edit `architecture/public-api/*.json` or CHANGELOGs.
- Merge without the owner's explicit command, which comes after the owner signs off TEST-2 and AR-3. The merge is
  `gh pr merge <N> --repo agent-teams-ai/get-modular --squash --match-head-commit <head-sha> --subject "<title> (#<N>)" --body "<commit body>"`,
  without `--delete-branch`; afterwards run `git fetch origin main`, then `git rev-parse 'origin/main^{tree}'` equals
  `<head-sha>^{tree}`, the new main commit has exactly one parent (`git rev-list --parents -n 1 origin/main` prints two
  hashes), and the branch stays at the final REL-2 head.
- Override the git identity, add co-author trailers or tool attribution.

## Done

REL-2 PR open, reproducible, CI green; archives recorded for TEST-2 and AR-3.

## Review checklist

- Reproduce the build in an own disposable clone at the same base up to the commit; `git diff` against the PR head is
  empty.
- The CHANGELOG sections equal the deleted changeset texts.
- Packed manifests and hashes as stated.
- Mutation spot-check: with `GITHUB_HEAD_REF=feat/not-a-release`, `pnpm release-owned-files:check` must fail naming
  both `architecture/public-api` files.
- History, no force, no deletion. `git log --format='%h %p | %an <%ae> | %cn <%ce> | %s' origin/main..<head>` lists
  only the earlier release commits, the continuation merge `M`, the release commit and update commits; every commit
  has the repository's local identity as author and committer.
  - `M` keeps `main`'s tree and joins REL-1's final head:
    `test "$(git rev-parse 'M^{tree}')" = "$(git rev-parse 'M^1^{tree}')"`, and `git rev-parse M^2` prints that head.
  - Each merge update `U` brings no release input:
    `git diff --quiet U^1 U -- .changeset packages architecture package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json .node-version` exits 0.
  - Each regeneration commit `R` has its regeneration base as `R^2`: regenerate yourself at `R^2` in a disposable
    clone; `git diff --quiet <your commit> R` exits 0.
  - No force push and no deletion ever happened on the branch, including before the PR existed:
    `gh api 'repos/agent-teams-ai/get-modular/activity?ref=refs/heads/changeset-release/main' --paginate --jq '.[] | select(.activity_type == "force_push" or .activity_type == "branch_deletion") | .activity_type'`
    prints nothing.
  - No force push and no deletion while the PR was open:
    `gh api repos/agent-teams-ai/get-modular/issues/<N>/timeline --paginate --jq '.[] | select(.event == "head_ref_force_pushed" or .event == "head_ref_deleted") | .event'`
    prints nothing.
  - `git merge-base --is-ancestor <REL-1 final head> <head>` succeeds, and so does the same check for every earlier
    REL-2 head recorded in the PR body.
