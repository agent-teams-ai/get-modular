# Checked Changesets candidate

This repository Host uses the independent public
`@agent-teams/release-checks` development API to compare accepted source, the
complete official Changesets 3.0.2 plan and the independently observed candidate.
Changesets selects every version and dependent release. The leaf owns normalized
pure comparisons; this Host owns Git, files, installed engine custody,
configuration, changelog history and the version workflow.

The implementation is prepared for exact registry version `0.1.0`. That public
version is not yet available at this preparation checkpoint. The production
catalog expresses the intended version, the existing lock has no fabricated
resolution, and the
[retained-input admission](../npm-release/release-checks-adoption.json) remains
unqualified with `integrity: null`. The owner keeps this adoption unmerged until
the supported archive is published and its actual registry installation,
integrity, authoritative pnpm lock and final native CI are qualified.

## Version and review route

`pnpm release:version` runs the checked Host. The
[version workflow](../../../.github/workflows/release-version.yml) uses pinned
Changesets action 1.9.0 without a publish command or OIDC permission. It captures
the actual processed main after the action's admitted reset. The
[npm publisher](../npm-release/README.md) retains its separate workflow and
existing shared publisher pin.

1. Require clean source and bind the actual resolved repository root, Git
   directory, source commit, installed CLI entrypoint, all installed runtime
   dependencies of that CLI, configuration and accepted file contents.
2. Run the exact installed `changeset status` collector and freeze its complete
   plan before versioning. Retain direct and dependent records, explicit `none`
   and absent versions, private workspace members and the complete intent
   inventory. Intent eligibility follows the qualified configuration; the Host
   takes parsed requests from that custody-bound official collector, including
   ordinary empty frontmatter (`---` immediately followed by its closing `---`
   on the next line), and does not maintain a second frontmatter parser. The Host
   does not compute dependency ranges or replacement versions. The pinned
   reader's exact basename rule applies in `.changeset` and `.changeset/pre`:
   case-insensitive `README.md`, exact `AGENTS.md`, `CLAUDE.md` and `GEMINI.md`,
   dot-prefixed files and extensions other than lowercase `.md` are not intents.
   These files remain protected by the complete source snapshot and diff check.
   Active prerelease state remains outside the qualified route.
3. End a real no-release state without running `version`, consuming an empty
   housekeeping intent or waiting for a branch or PR. A real release can consume
   its empty housekeeping intents; ignored and private intents without versioning
   remain retained.
4. Re-observe the same execution custody and input tree, run the same installed
   engine, enumerate the whole tracked tree and generated files, including
   ignored outputs outside installed package-manager directories,
   and check all manifest observations and the complete diff. Only exact planned
   version edits, qualified intent deletions and corresponding changelogs have
   permissions. Full manifest content, including scripts, exports and dependency
   fields, is protected by the leaf. An unsupported engine range rewrite rejects.
5. Require each generated changelog's exact new version heading and unchanged
   historical content. The action can commit and push only after the checks
   pass. A failure retains generated source for inspection; the Host does not
   reset a user checkout or commit a rejected candidate.
6. Inspect the generated `changeset-release/main` branch through the existing
   owner-agent protocol. Actions PR creation/approval remains **false**. The
   action may push its branch and then fail to create a PR under that setting;
   the assigned owner opens the reviewed owner PR with `gh`, then reruns the
   current-input workflow as needed. No custom token or release manager is used.
7. The existing governance CI lane executes `runtime:policy:test`, including the
   Host tests and independent release PR check. The check binds the same-repository
   PR's actual head and current event base, then replays the official engine in an
   owned disposable source worktree with its own authenticated main ref, even
   when a PR checkout has no local main. Candidate versions never provide expected
   plan facts. It compares the actual candidate against the accepted plan and
   exact generated output, including new changelog content. Later branch edits
   and stale bases reject. The existing 43 required product jobs remain intact.
8. The owner obtains independent review and exact head/base CI, then uses the
   [canonical owner merge guard](https://github.com/agent-teams-ai/.github/blob/main/scripts/merge-owner-pr.mjs).
   After the reviewed adoption and real version merge, run the existing manual
   exact-main npm publication/reconciliation path and verify the actual registry
   archives, installed consumer and intended tags.

The portable comparison binds source and content identities across legitimate
checkouts. Physical roots, Git directories and installed entrypoints are
separately re-observed within each execution; a foreign root or substituted
engine cannot replace an already bound version execution. Intended output
mutations are related to their authenticated original source blobs. All other
original inputs are read from the actual resulting tree, so an equal historical
commit alone cannot hide source, config or inventory drift.

## API baseline boundary

The Resources patch was published by the separate owning release described in
[the released adoption base](../npm-release/README.md#released-base-for-prepared-adoption).
That source also includes its own qualified Core/Assembly API promotion. The
preparation branch preserves those upstream outputs; this checked route still
admits no `architecture/public-api/` or contract baseline change.
[ADR-0027](../../../docs/decisions/0027-admit-the-core-and-assembly-0-2-0-correction-pair.md)
and the existing
[native API transition procedure](../../../docs/qualification/native-typescript-tooling.md#released-api-transition)
retain their separate authority. A future Core/Assembly release requiring that
promotion must qualify its concrete owning operation before it can use this
route's complete-diff check. It currently fails closed rather than silently
allowing arbitrary baseline edits. The native migration packet and eight-capability
configuration are unchanged. Preparation incorporates the separate upstream tooling
migration to Foundation 2.1.1 and FMS 0.2.3. That migration preserves the immutable
adoption identities and does not expand the release-checks-only retained-input
exception or qualify current-source archives against previously published bytes.

## Qualification

`pnpm tooling:native:typecheck` checks every new maintained TypeScript source and
test with strict TypeScript 7.0.2. `node --test tests/release-candidate.test.ts`
runs the installed public conformance corpus and actual Changesets fixtures for
direct/dependent propagation, symbolic ranges, the Resources patch, no-release
handling, ignored/private/empty intents, rejected numeric range rewrites,
source and engine substitution, foreign roots, complete observation, protected
manifest fields, history preservation and later PR tampering. The same owner
also tests the narrow retained-input successor and its dependency graph,
compiler, build and integrity rejection cases. The normal native runtime policy
gates include these commands; type stripping alone is not typechecking.

The original disposable TEST qualification installed the corrected packed `0.0.0`
candidate with SHA-256
`4c46ed8e2aa0cdd24e2b6b3d45acdf22f0614a777f9baccdf687f0630a55a027`
through its public root and `/conformance` export. Actual-engine release and
no-release fixtures accept the reader's documentation names and reject hidden
documentation edits before and after generation. Those results retain their
original source bindings; synchronizing to a later released main does not
establish new qualification. This does not certify
an unpublished `0.1.0` registry installation, hosted workflow execution, owner PR,
publication, promotion or retained-archive reconciliation. Those checkpoints
remain separate in the accepted delivery plan.

This development concern stays within `repository.development`. It introduces
no product capability, Foundation capability, production module, runtime
dependency or CMS/FMS adoption change. The original package-source and retained
build-input policy still owns the exact archive reuse decision.
