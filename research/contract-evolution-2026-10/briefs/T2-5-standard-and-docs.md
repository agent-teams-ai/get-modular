# T2-5 brief: Consumer Module Standard and contract docs for the 0.4.0 train

<!-- cspell:ignore compatib -->

PR title: `docs(architecture): revise the consumer standard for the 0.4.0 train`. Documentation plus the CMS digest
literal in one test. Includes release rehearsal #1 of train 2 (nothing pushed from it).

## Re-verify before start

1. `git fetch origin`. T2-3 with T2-4 is squash-merged on `main`; `git log --oneline -3 origin/main` shows it.
   Pending changesets: `core-revision-windows`, `assembly-revision-windows`, `conformance-revision-windows` (plus any
   others: list them).
2. CMS digest literal: `git grep -n "sha256:[0-9a-f]\{64\}" -- tests/ownership-checkpoint.test.mjs` and the current
   `shasum -a 256 docs/architecture/common-assembly.md`; the literal next to "the current CMS successor must match"
   must equal the file. `git grep -n "<that digest>"` across the repository: if any other file pins it, stop and report
   (on 2026-10-04 only `tests/ownership-checkpoint.test.mjs:156`).
3. Line numbers below are from `81063ad`; locate every edit by its quoted text, compared with whitespace and line
   breaks normalized (several quotes wrap across lines in the file). If a quoted text is missing: stop.
4. Train 1 is released (0.3.0 published, no train 1 changeset left); otherwise stop.
5. `rg -n "checkNamespaces|plugin" docs/architecture/common-assembly.md` and note pre-existing hits (they stay).
6. Node per `.node-version`; `pnpm install --frozen-lockfile`; branch `docs/consumer-standard-040`.

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

## Scope and non-goals

Edit `docs/architecture/common-assembly.md`, `docs/architecture/current-contract.md`,
`docs/architecture/mvp-implementation-roadmap.md`, `docs/architecture/self-composition-implementation-guide.md`,
`docs/guides/consumer-quickstart.md`, `docs/templates/consumer-module-profile.md`, and the CMS literal in
`tests/ownership-checkpoint.test.mjs`. Non-goals: code, package READMEs (done in T2-3/T2-4), accepted ADRs,
`architecture/sdk-growth/**` (retained pins read from an accepted commit), AR and TEST pins (their own repositories),
observation or plugin wording, the byte-pinned `private-core-start` block of the roadmap.

## Edits: Consumer Module Standard (`docs/architecture/common-assembly.md`)

1. Front matter `related`: add `ADR-NNNN` after `ADR-0033`.
2. `:63` "package SemVer, compatibility tokens, profile schema versions and document content pins are different
   identities" -> "package SemVer, contract revisions, profile schema versions and document content pins are different
   identities".
3. `:95-99` "Keep capability IDs and revisions in contract descriptors owned by the contract owner
   ([ADR-0032](...)); declarations reference descriptors and never spell compatibility." -> "... owner
   ([ADR-0032](...), [ADR-NNNN](../decisions/NNNN-replace-exact-compatibility-tokens-with-revision-windows.md));
   declarations reference descriptors and never spell revisions." and "to hide capability, token or slot mismatches"
   -> "to hide capability, revision or slot mismatches".
4. `:150` table row: "Hand-written compatibility literals" -> "Hand-written wire records, maps or `CapabilityContract`".
5. "Module packages and contracts", the "Contracts:" list (`:403-422`) becomes:

   ```markdown
   Contracts:

   - A contract owner publishes one descriptor per capability with
     `defineContract<Value, Earlier>()({ id, revision, compatibleFrom })` from a
     contract package that holds descriptors and port types, not
     implementations. `compatibleFrom` defaults to `revision`. `Earlier` is a
     type literal, not an interface, and maps exactly the revisions from
     `compatibleFrom` to `revision - 1` to their value types; drop a key when
     `compatibleFrom` passes it. For example
     `defineContract<DbR5, { 3: DbR3; 4: DbR4 }>()({ id: "acme/db", revision: 5, compatibleFrom: 3 })`.
   - Raise `revision` with every change of the value type, additive changes
     included, and never change what a published revision means. A capability ID
     is permanent: do not start a parallel line such as an ID ending in `/v2`.
   - Core binds a slot to a provider when `compatibleFrom <= slot revision <=
     provider revision` and otherwise reports `binding.compatibility-mismatch`
     with `reason` `consumer-too-old` or `provider-too-old`
     ([ADR-NNNN](../decisions/NNNN-replace-exact-compatibility-tokens-with-revision-windows.md)).
     A provider implements every revision in its window; its value type is
     their intersection.
   - Additive change: raise `revision` and keep `compatibleFrom`. Removal,
     rename or type change: add the replacement first, keep the old member
     while `compatibleFrom` still admits consumers that use it, then raise
     `compatibleFrom`. A change in place sets `compatibleFrom = revision` and
     ships migration notes. Upgrade providers before consumers.
   - The contract owner raises `compatibleFrom`. A Host upgrades a provider to a
     contract version with a higher `compatibleFrom` only when its inventory of
     `capabilityId` and `revision` in `plan.bindings[]` of every plan it compiles
     shows no plan that binds a lower revision.
   - Keep exporting the descriptor of an earlier revision while its suite or an
     adapter module still needs it.
   - A module package lists the contract packages it provides or consumes as
     ordinary dependencies; that version fixes the revision the module was built
     against. Whenever a contract package changes `revision` or
     `compatibleFrom`, it releases a version that a caret range does not
     accept: a new minor while it is 0.x, a new major from 1.0.
   - A contract package lists Get Modular packages in `peerDependencies` like a
     module package. When a Get Modular minor changes the authoring surface,
     the contract owner re-releases every contract line that consumers still
     use with the new peer range; revisions and value types do not change in
     that release. Windows let consumers lag providers within one Get Modular
     minor.
   - Declare port members as function-typed properties, not methods: TypeScript
     checks method parameters bivariantly and accepts a breaking change silently.
     Keep value types structural: no `#private` members, `unique symbol` brands
     or classes.
   ```

6. "Module packages:" list:
   - `:428-429` "Never write `kind`, `schemaVersion` or a `compatibility` literal by hand" -> "Never write `kind`,
     `schemaVersion`, `revision` or `compatibleFrom` by hand".
   - after the `ModuleFactory` bullet add: "- Import port types from the contract package. Never index a capability
     map by capability ID, and never write a map or `CapabilityContract` by hand."
   - "A Host prepares with a map that contains every capability any handle uses, with the identical contract." ->
     "A Host prepares with a map that contains every capability revision any handle uses, with the identical value
     type."
   - `:440` "such as `^0.3.0`" -> "such as `^0.4.0`".
7. "Testing modules" item 3, after "...the fake included.": add "A provider that serves a window passes the suite of
   every revision in it; the contract owner keeps the suite of each revision that some provider still serves."
8. `:545` "typed rejection of wrong capability/token/slot" -> "typed rejection of wrong capability/revision/slot".
9. `:583-584` "selects capability value and compatibility identities at type level" -> "selects capability value
   types per revision at type level".
10. `:605-607` "preparation accepts it only when each of them has the identical value and compatibility type in the
    preparing map" -> "preparation accepts it only when each capability revision it uses has the identical value type
    in the preparing map".
11. `:640-641` "including every ordering, capability and compatibility field" -> "including every ordering,
    capability and revision field".
12. `:760` "reject wrong capability/compatibility" -> "reject wrong capability/revision".
13. `:794-796` "Public 0.2.0 and 0.3.0 pair admission additionally authenticates [ADR-0027](...) and [ADR-0031](...)
    respectively." -> "Public 0.2.0, 0.3.0 and 0.4.0 pair admission additionally authenticates [ADR-0027](...),
    [ADR-0031](...) and [ADR-NNNN](...) respectively."

The two compiled examples (`<!-- consumer-standard-example: host -->`, `instances`) stay unchanged; their compile test
proves the ADR's promise that builder users change nothing.

## Edits: other documents

- `current-contract.md` "What the version labels mean" table: row `schemaVersion: 1` -> "`schemaVersion` | Inert
  persisted data-format discriminator: declarations and plans 2, profiles 1; schema 1 declarations are refused | No"; row `familyVersion: 1` -> "`revision`, `compatibleFrom` | Contract revisions of one capability line and the
  oldest consumer revision a provider serves | No". `:153` "selection, capabilities and exact compatibility" ->
  "selection, capabilities and revision windows". Add ADR-NNNN to `related`.
- `mvp-implementation-roadmap.md` "Capability evolution and namespace admission": the sentence ending "the decision
  for the next wire generation replaces items 2-4." -> "[ADR-NNNN](../decisions/NNNN-replace-exact-compatibility-tokens-with-revision-windows.md)
  replaces items 2-4 and the exact-token wording of item 1." Nothing else in the roadmap.
- `self-composition-implementation-guide.md` (T2-3 deletes the `*Token` constants, so every passage about tokens
  changes):
  - `:98-99` "Compatibility uses the accepted `exact` family, version `1`, with a token of the form
    `<capabilityId>/v1`." -> "A provided capability declares `revision: 1, compatibleFrom: 1` and a slot
    `revision: 1`."
  - `:335` "the one owner of moduleId, capabilityId and token constants" -> "the one owner of moduleId and
    capabilityId constants"; `:346`, `:356` and `:372` "`capabilityId`, and compatibility token constants" /
    "`capabilityId` and compatibility token constants" -> "`capabilityId` constants".
  - "Example declaration" (`:273-310`): `"schemaVersion": 2`; each slot `"revision": 1` instead of the
    `compatibility` object. `:425` (the `plan-output` example): `schemaVersion: 2`. The profile at `:197` stays at 1.
  - Then `rg -n "token|compatib" docs/architecture/self-composition-implementation-guide.md` hits only `localToken`
    grammar text (`:92-93`, `:446`) and the unrelated "compatible implementation" passages (`:767`, `:1002`).
- `consumer-quickstart.md:20`: `@0.4.0` for core and assembly; `:23-24` `@get-modular/conformance@0.1.0` ->
  `@0.2.0` (resources stays `0.1.0`); `:145` "capability/token mismatch" -> "capability/revision mismatch"; any
  other `0.3` or conformance `0.1` mention found by `rg -n "0\.3|conformance@0\.1" docs/guides`.
- `docs/templates/consumer-module-profile.md:21-24`: core and assembly `0.4.0`, conformance `0.2.0`, resources
  unchanged.
- `tests/ownership-checkpoint.test.mjs`: the current CMS digest literal becomes the new `sha256` of
  `common-assembly.md`, in the same commit as the CMS text, and again in every later commit that changes the CMS.

## Commits and gates

1. `docs(architecture): revise the consumer standard for the 0.4.0 train` - CMS edits and the digest literal.
   Gates: `pnpm ownership:checkpoint:test`, `pnpm docs:protocol:check`,
   `node --test tests/assembly/consumer-standard-examples.test.mjs` (after `pnpm assembly:build`), each exit 0.
2. `docs(architecture): describe revision windows in the contract docs` - the other documents.
   Gates: `pnpm docs:protocol:check`, `pnpm qualification:self-composition-templates`, `pnpm governance:check`,
   `pnpm governance:test`.
3. After the last commit: `GIT_CONFIG_GLOBAL=<file with only a [user] section> pnpm check`, exit 0 (create the file
   with `printf '[user]\n\tname = %s\n\temail = %s\n' "$(git config user.name)" "$(git config user.email)" > <tmp>/gitconfig-nohooks`).

## Release rehearsal #1 (disposable clone of this PR's head; nothing is pushed)

1. `pnpm install --frozen-lockfile`.
2. `pnpm exec changeset status --verbose`: expect core 0.4.0, assembly 0.4.0, conformance 0.2.0 (minor each);
   resources and lifecycle-kernel unchanged.
3. `pnpm release:version`, then `pnpm assembly:build && pnpm resources:build && pnpm conformance:build`.
4. `pnpm exec agent-teams-foundation public-api-promote-release --consumer . --json > <tmp>/promote.json`, then remove
   the ADR-NNNN approvals from `architecture/foundation/public-api-compatibility.yaml`;
   `pnpm foundation:check && pnpm docs:quality`.
5. Commit locally with the message `chore(release): rehearse the 0.4.0 train` (never pushed), then run the complete
   gate in release mode:
   `GIT_CONFIG_GLOBAL=<nohooks file> GITHUB_EVENT_NAME=pull_request GITHUB_BASE_REF=main GITHUB_HEAD_REF=changeset-release/main GITHUB_REPOSITORY=agent-teams-ai/get-modular FOUNDATION_PR_HEAD_REPOSITORY=agent-teams-ai/get-modular pnpm check`.
6. `pnpm --dir packages/<p> pack --pack-destination <tmp>/rehearsal` for core, assembly and conformance.

Record in the PR body: `changeset status`, the promote delta (names added, changed, removed per package), `pnpm check`
time and exit code, the packed manifests (assembly `dependencies` exactly `@get-modular/core` `0.4.0`; conformance
peers `^0.4.0`, `^0.4.0` and the then-current resources minor). Delete the clone afterwards.

## Risks and stop conditions

| Risk | Stop / action |
| --- | --- |
| a quoted passage is missing or reads differently | stop; never guess a replacement |
| the CMS compile test fails | stop: T2-4 promised builder users no change |
| the rehearsal shows a version other than the three minors, or a gate fails in release mode | stop and report; do not fix on this PR without the owner |
| a frozen assertion elsewhere pins CMS bytes | stop and report its path |

## Must not

- Change code, ADRs, the compiled CMS examples, `architecture/sdk-growth/**`, or the private-core-start block.
- Push the rehearsal commit or any `changeset-release/*` branch.
- Merge, request reviewers or comment outside the own PR. Override the git identity, add co-author trailers or tool
  attribution.

## Done

CMS and docs describe the 0.4.0 train; digest literal current; all gates green; rehearsal recorded.

## Review checklist

- Every edit above present, nothing else: `git diff --stat origin/main...HEAD`.
- `rg -n "token" docs/architecture/self-composition-implementation-guide.md` hits only the `localToken` grammar text.
- `rg -n "DbV[0-9]" docs` returns nothing.
- `rg -n "compatibility token|familyVersion|\^0\.3\.0" docs/architecture/common-assembly.md docs/guides` returns only
  historical passages that the brief kept on purpose (list them).
- `shasum -a 256 docs/architecture/common-assembly.md` equals the test literal.
- Read the new "Contracts:" list against ADR-NNNN "Contract packages and evolution"; no rule beyond the ADR.
- Mutation spot-check: change one character of the CMS locally -> `pnpm ownership:checkpoint:test` fails; revert.
- Rehearsal numbers in the body are plausible (three minors; Core API delta limited to the wire types and
  `Diagnostic`; Assembly delta limited to the types listed in T2-4).
