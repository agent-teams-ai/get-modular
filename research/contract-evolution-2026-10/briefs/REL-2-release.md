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

Work in your own disposable clone of `agent-teams-ai/get-modular`, never a shared checkout: Changesets needs a local
`main` branch, and moving it is safe only there.

```sh
git fetch origin main changeset-release/main
REL1=$(git rev-parse origin/changeset-release/main)   # must equal the head checked in re-verify step 2
git checkout --detach origin/main                      # a fresh clone has main checked out; leave it first
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

Before every push:

```sh
git ls-remote origin refs/heads/changeset-release/main   # must equal $REL1 (or the current REL-2 head on updates)
git merge-base --is-ancestor "$REL1" HEAD && echo fast-forward   # use the current REL-2 head instead of $REL1 on updates
```

Push: `git push origin HEAD:refs/heads/changeset-release/main`, a plain fast-forward of the branch. A rejected push
means stop; never `--force`, never delete the branch. An uncertain push result: run `git ls-remote` and reconcile; no
blind retry.

When `main` moves before the merge (the required checks are strict), follow the same procedure as REL-1:

- Decide with
  `git diff --quiet <REL base> origin/main -- .changeset packages architecture package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json .node-version`,
  where `<REL base>` is the `main` commit the current release head was generated from. Exit 0 (no release input
  changed): update by merging `origin/main` into the release head, check
  that the result's tree equals the tree a fresh regeneration from the new `main` produces, run the gates again and
  push plainly.
- Exit 1: regenerate from scratch on the new `main` (the whole build above in a fresh detached checkout; call its
  release commit `FRESH`), then put that tree on top of the published head `OLD` with one tree-replacement commit:
  `NEW=$(git commit-tree "${FRESH}^{tree}" -p "${OLD}" -p origin/main -F <message file>)`; verify
  `git diff --stat "$FRESH" "$NEW"` is empty, `git rev-parse "$NEW^1"` is `OLD` and `"$NEW^2"` is `origin/main`, run the
  gates on `NEW` and push `NEW` plainly. Never rebase the generated commit.

Verify the packed manifests: assembly `dependencies` exactly `{ "@get-modular/core": "0.4.0" }`; conformance peers
`@get-modular/core` and `@get-modular/assembly` `^0.4.0`, `@get-modular/resources` the current minor; no `workspace:`,
`link:` or `file:`; files outside `dist/` exactly `LICENSE`, `package.json`, `CHANGELOG.md`, `README.md`. Record
SHA-256 and SHA-512 of each archive (conformance packs may differ only in peer key order; compare normalized content).

## PR

`gh pr create --repo agent-teams-ai/get-modular --base main --head changeset-release/main --title "chore(release): prepare Core and Assembly 0.4.0 and conformance 0.2.0" --body-file <file>`.

Body (English, plain): versions table; the generated paths; promote delta per package (Core: the wire types and
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
| `main` moves before merge | merge update when no release input changed, otherwise a verified tree-replacement commit; plain push |
| promote fails or reports a delta outside T2-3/T2-4 | stop; never edit baselines or approvals to get past it |
| packed manifest differs from the expected shape | stop |
| a TEST-2 or AR-3 finding needs an API change | stop; owner decides (fix on `main` and regenerate, or ship) |

## Must not

- `npm publish`, `pnpm publish`, `changeset publish`, tags, dist-tags, GitHub releases.
- Edit any path outside the list; hand-edit `architecture/public-api/*.json` or CHANGELOGs.
- Merge without the owner's explicit command, which comes after the owner signs off TEST-2 and AR-3. The merge is
  `gh pr merge <N> --repo agent-teams-ai/get-modular --squash --match-head-commit <head-sha> --subject "<title> (#<N>)" --body "<commit body>"`,
  without `--delete-branch`; afterwards `git rev-parse 'origin/main^{tree}'` equals `<head-sha>^{tree}`, the new main
  commit has exactly one parent (`git rev-list --parents -n 1 origin/main` prints two hashes), and the branch stays at
  the final REL-2 head.
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
