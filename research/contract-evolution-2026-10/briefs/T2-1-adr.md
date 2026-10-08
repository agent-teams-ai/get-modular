# T2-1 brief: accept the train 2 ADR (contract revision windows)

PR title: `docs(architecture): accept ADR-NNNN for contract revision windows`. Documentation and decision registry
only. NNNN is the next free ADR number at creation time.

## Re-verify before start

1. `git fetch origin`; record `origin/main`. `ls docs/decisions/` and
   `gh pr list --repo agent-teams-ai/get-modular --state open` (also look at titles for "ADR"): take the next free
   four-digit number that no file and no open PR uses (0034 on 2026-10-04 unless the observation track took it).
   Write it everywhere below in place of `NNNN`.
2. Accepted ADRs on `main` that this ADR cites must still be accepted and unchanged in meaning: 0004, 0005, 0009,
   0021, 0026, 0027, 0031, 0032, 0033. If any of them was superseded since 2026-10-04: stop and report.
3. The decisions recorded in `research/contract-evolution-2026-10/README.md` (T2-0) must match this brief's
   "Owner decisions" section (Q1: owner decision 2026-10-08, schema 1 is refused). Any difference: stop.
4. Node per `.node-version`, `pnpm install --frozen-lockfile` in your own worktree.
5. The tool syntax: `pnpm docs:info` lists type `adr` with identity `adr-four-digits`; the step 1 `--dry-run`
   command prints the destination and `Plan: sha256:...`. (`pnpm docs:new --help` exits 2 by design: it requires
   `--dry-run` or `--apply`.) If either check fails: stop and report.
6. T2-0 and T2-1 are documentation and may land before train 1 is released; every later PR of train 2 stops unless
   train 1 (0.3.0) is released.

## Owner decisions (facts)

Those of the plan README section "Owner decisions", plus Q1 (owner decision 2026-10-08): Core, Assembly and the
conformance kit accept only declaration schema 2; a declaration with `schemaVersion: 1` is
`schema.unsupported-version` in Core and `assembly.bind.invalid-declaration` in Assembly; the historical qualification
corpus replays through a test-side lift; the ADR withdraws decision 5 (Core reads the previous declaration schema) and
ADR-0032's promise of a Core decoder for the previous schema, with the reason; plugins are postponed, not cancelled, and
a short "Plugin readiness" note lists the declaration compatibility policy for plugins as an open item of the plugins
track. The ADR text is approved by the owner in this PR before acceptance; no other text change after approval.

Why B (record): the schema 1 format is the project's own pre-release declaration format, and at this MVP stage the
packages are being built now, so the owner chose to do it right once instead of carrying legacy versions (no
compatibility shims, ADR-0009). A schema-2-only Core prototype (17 files, about 180 changed lines) plus a test-side
lift reproduced the M2 corpus (818 of 818 object and 123 of 123 raw-document outcomes, nothing that could not be
lifted), so replaying history does not need N-1. Reading schema 1 inside the shape check (A) or also in Assembly (C)
would add admission forms nobody produces; a separate upgrade step (D) was prototyped (about 400 changed lines,
feasible, invalid schema 1 documents kept their schema 1 diagnostics) and rejected by the owner for the same no-legacy
reason.

## Scope

- Create the ADR with `pnpm docs:new` and insert the body below.
- After the owner approves the text in the PR: set acceptance metadata, register the decision, add it to the index
  and pin its digest in the ownership checkpoint test (precedent: PR #140, files
  `architecture/decisions/accepted-decisions.json`, `docs/decisions/NNNN-*.md`, `docs/decisions/README.md`,
  `tests/ownership-checkpoint.test.mjs`).

Non-goals: no code, no gate edits (pair admission is T2-4), no CMS edits (T2-5), no edits to any accepted ADR.

## Steps

### 1. Create (status proposed)

```sh
pnpm docs:new --type adr --id ADR-NNNN --title "Replace exact compatibility tokens with revision windows" \
  --owner architecture \
  --summary "Replaces exact compatibility tokens with per-capability revision windows in one wire generation for Core and Assembly 0.4.0, keeps every diagnostic code and refuses declarations of the previous schema." \
  --dry-run
```

Review destination (`docs/decisions/NNNN-replace-exact-compatibility-tokens-with-revision-windows.md`), metadata and
diagnostics, then repeat with `--apply --expect sha256:<digest from the dry run>` and identical other arguments.
Replace the template body with the text in "ADR body" (everything from `# ADR-NNNN` on). Set `related:` to
ADR-0004, ADR-0005, ADR-0009, ADR-0021, ADR-0026, ADR-0027, ADR-0031, ADR-0032, ADR-0033, GM-REQ-V1. Keep every
other front matter field the tool wrote.

Commit 1: `docs(architecture): propose ADR-NNNN for contract revision windows`. Gates: `pnpm docs:protocol:check`
exit 0 (fix cspell by rewording or adding real words to `.cspell.json`), `pnpm governance:check` exit 0.

Open the PR as a draft and ask the owner to approve the text. Text changes the owner asks for go in new commits.

### 2. Accept (only after the owner's explicit approval in the PR)

1. Front matter: `status: accepted`, `approved_by: product-owner`, `accepted_at: <YYYY-MM-DD of approval>`
   (same order of keys as ADR-0033).
2. `pnpm exec agent-teams-foundation architecture-decisions-promote-baseline --consumer .` adds the registry entry
   to `architecture/decisions/accepted-decisions.json` (never edit that file by hand). Check that the diff is one
   appended object `{ id, path, immutableDigest }`.
3. `docs/decisions/README.md`: add `- [ADR-NNNN: Replace exact compatibility tokens with revision windows](NNNN-replace-exact-compatibility-tokens-with-revision-windows.md)`
   as the first item under "## Accepted decisions".
4. `tests/ownership-checkpoint.test.mjs`: append to the array of decisions after the checkpoint base (the block that
   ends with ADR-0033) `{ id: "ADR-NNNN", path: "docs/decisions/NNNN-...md", immutableDigest: "<value from the registry>" }`.

Commit 2: `docs(architecture): accept ADR-NNNN for contract revision windows`. Gates, each exit 0:
`pnpm docs:protocol:check`, `pnpm foundation:check`, `pnpm ownership:checkpoint:test`, `pnpm governance:check`,
then after the commit `GIT_CONFIG_GLOBAL=<file with only a [user] section> pnpm check` (create the file with
`printf '[user]\n\tname = %s\n\temail = %s\n' "$(git config user.name)" "$(git config user.email)" > <tmp>/gitconfig-nohooks`;
a global git hook breaks fixture tests that create repositories).

Mark the PR ready. Body (English, plain): what the decision changes, the precedence list, "implementation follows in
T2-2..T2-5", and the owner approval reference.

## ADR body

````markdown
# ADR-NNNN: Replace exact compatibility tokens with revision windows

## Context

Core 0.3.0 accepts one compatibility family. Every provided capability and
every slot carries `{ family: "exact", familyVersion: 1, token }`, and a
provider is compatible only when both tokens are byte-equal. Since ADR-0032
the authoring builder encodes a contract revision as the token
`<id>/r<revision>`. Any change to a contract, additive or not, therefore
forces every provider and every consumer of that capability to move in the
same release.

Module packages and contract packages are released independently (Consumer
Module Standard, "Module packages and contracts"). A provider built against a
newer revision must keep serving consumers built against older revisions it
still supports, and an unsupported pair must fail before any factory runs,
with a diagnostic that names the side to update. TypeScript cannot be the only
guard: packages are built separately, and a Host may combine builds that never
met in one compilation.

On 2026-10-01 and 2026-10-02 the owner decided:

- one monotonic line per contract and no versioned capability ids;
- a provider declares `revision` and `compatibleFrom`, the oldest consumer
  revision it still supports; a consumer's revision is fixed by the version of
  the contract package it depends on;
- binding is allowed iff `compatibleFrom <= consumer revision <= provider
  revision`; a breaking change raises both numbers in place and ships
  migration notes;
- any change of `revision` or `compatibleFrom` releases a contract package
  version that a caret range does not accept;
- raising a contract revision keeps every `implementationId` that uses it;
- catalog codes are not renamed.

The owner first decided that Core reads the previous declaration schema. On
2026-10-08 the owner withdrew that decision: schema 1 is this project's own
pre-release declaration format, the packages are being built now, and the
project carries no compatibility shims at this stage (ADR-0009). Third-party
plugins are postponed, not cancelled; the architecture accounts for them
without designing the plugin system now.

A wire generation is expensive: ADR-0021 bound 941 static case recipes to a
pinned ledger. This decision closes the known wire questions in one
generation and qualifies it as a delta over the immutable generation-two
corpus.

## Decision

### Wire generation

Module declarations and composition plans move to `schemaVersion: 2`.
Composition profiles do not change and stay at `schemaVersion: 1`.

```text
ModuleDeclaration (2)  provides[]: { capabilityId, revision, compatibleFrom }
                       slots[]:    { slotId, capabilityId, revision, cardinality }
CompositionPlan (2)    bindings[]: { consumerImplementationId, slotId,
                                     providerImplementationIds, capabilityId, revision }
CompositionProfile (1) unchanged
```

- `revision` and `compatibleFrom` are integers from 1 to 2147483647. The raw
  entry uses the existing exact safe-integer admission. A non-integer is
  `schema.invalid-value` with reason `invalid-type`; an integer out of range
  is `schema.invalid-value` with reason `invalid-format`.
- `compatibleFrom > revision` is `schema.invalid-value`, reason
  `invalid-format`, at the provided entry, as `many.min > many.max` is at its
  cardinality record.
- Records stay closed. A `compatibility` member in schema 2 is
  `schema.unknown-field`. Core never parses capability ids.

### Compatibility rule

A provider entry with the slot's `capabilityId` is compatible iff
`provider.compatibleFrom <= slot.revision <= provider.revision`. Lookup by
capability id, `binding.capability-missing`, explicit bindings and the absence
of provider selection are unchanged. There are no ranges, no "highest
satisfying" choice, no conversion and no warnings.

### Diagnostics

The catalog keeps its 33 codes, 32 emittable codes, ranks, phases,
prerequisites, ordering and bounded collector. `DiagnosticCode` is unchanged.
Only the details of `binding.compatibility-mismatch` change:

```ts
{
  readonly capabilityId: string;
  readonly reason: "consumer-too-old" | "provider-too-old";
  readonly consumerRevision: number;       // the slot revision
  readonly providerRevision: number;
  readonly providerCompatibleFrom: number;
}
```

`consumer-too-old` means `consumerRevision < providerCompatibleFrom`.
`provider-too-old` means `consumerRevision > providerRevision`. Exactly one
holds for an incompatible pair. Row-local deduplication keeps its rule: the
slot fixes the consumer revision and a resolved provider fixes its window. An
unsupported schema version stays `schema.unsupported-version`.

### Schema 1 declarations

- Core, Assembly and the conformance kit admit only declaration schema 2. A
  declaration with `schemaVersion: 1` is `schema.unsupported-version` in Core,
  like any version but 2, and Assembly refuses it at binding with
  `assembly.bind.invalid-declaration`. A declaration whose `schemaVersion` is
  missing or not an integer is reported as such and checked against schema 2.
- Diagnostic paths are projected through the field names of schema 2.
- The immutable qualification corpus is replayed through a test-side
  transform that lifts its declarations to schema 2; Core gains no decoder.

### Plugin readiness

- Third-party plugins are postponed, not cancelled. This decision fixes only
  what Get Modular defines: a declaration names its schema in
  `schemaVersion`, and Core refuses a schema it does not admit with a located
  diagnostic.
- Open for the plugins track, not decided here: the declaration compatibility
  policy for plugins (for example upgrade steps between declaration schema
  generations, or a commitment at Get Modular 1.0) and the stability of the
  plugin-facing authoring API under 0.x caret peer ranges, where a plugin
  built for 0.3.x does not install against 0.4.x.

### Plan and digest

- A plan binding records the consumer revision. Provider revisions are
  checked and not recorded, as provider tokens were never recorded.
- Every plan and every digest changes once with this generation. The digest
  protocol, its envelope with `protocolVersion: 1`, RFC 8785, SHA-256 and the
  `gm-plan:v1:sha-256:` spelling are unchanged; `schemaVersion` inside the
  hashed plan separates the generations.
- Core never reads plans. Assembly accepts only plan schema 2. A Host that kept
  a digest as evidence compiles again and records the new digest once.

### Assembly builder and types

- `defineContract<Value, Earlier = {}>()({ id, revision, compatibleFrom })`.
  `compatibleFrom` is optional and defaults to `revision`. At run time
  `1 <= compatibleFrom <= revision <= 2147483647`, otherwise
  `assembly.bind.invalid-declaration`. `Earlier` is a type literal that maps
  exactly the revisions from `compatibleFrom` to `revision - 1` to their value
  types; `compatibleFrom` must be `revision` or a key of `Earlier`. The 0.3.0
  call form is unchanged and means a window of one revision.
- `provide()` emits `{ capabilityId, revision, compatibleFrom }`; `slot()`
  emits `{ slotId, capabilityId, revision, cardinality }`; `declareModule`
  supplies `schemaVersion: 2`. The revision a slot declares is the revision of
  the descriptor copy its module package loads.
- A capability map has one key per capability revision,
  `` `${id}@${revision}` ``. The key exists only in types; `@` is outside the
  identifier grammar. `CapabilitiesOf` derives a key for the descriptor's
  revision and for each key of `Earlier`. `CapabilityContract<Value>` loses its
  token parameter.
- `FactoryDependencies` gives a slot the value type of its revision.
  `FactoryCapabilities` requires a provided value that satisfies every
  revision in the provider's window, their intersection. `ValidDeclaration`
  accepts only entries produced by a descriptor and requires every key they
  use to be in the map. `UsedCapability` returns those keys.
- The handle brand, `KnownCapabilities`, `AnyFactoryHandle` and `prepare` of
  ADR-0032 do not change. A handle is invariant only in the capability
  revisions it uses, so modules built against different contract package
  versions meet in one Host when their shared revisions have identical value
  types.
- Assembly's root also exports, as types, the helpers that its public builder
  types reference, so the declared surface is complete: `ContractSpec`,
  `ValuesOf`, `RevisionPairs`, `EntryKeys`, `ValueAt` and `ValuesAll`. No
  other name is added.
- A contract package may keep exporting the descriptor of an earlier revision
  with the same id. An adapter module slots the new revision and provides the
  earlier one; Core accepts it as an ordinary module.

### Conformance

- `runContractSuite` accepts a subject whose provided entry for the suite's
  capability satisfies `compatibleFrom <= suite revision <= revision`.
  Otherwise it throws `conformance.suite.revision-mismatch` before any test
  registers, and the message names the three numbers. A provider passes the
  suite of every revision in its window.
- `isolate` builds its fake providers with `defineContract` and
  `declareModule` and no longer spells the wire.
- The conformance kit releases a minor together with Core and Assembly 0.4.0
  (ADR-0033).

### Contract packages and evolution

- One descriptor per capability, owned and published by the contract owner.
  Maps come only from `CapabilitiesOf`. Nobody writes wire records, maps or
  `CapabilityContract` by hand or indexes a map by capability id; port types
  are imported from the contract package.
- A module package lists its contract packages in `dependencies`, never in
  `peerDependencies`, and never re-exports another package's descriptor.
  Every change of `revision` or `compatibleFrom` releases a contract package
  version that a caret range does not accept, so a package manager never
  shares one copy between modules built against different revisions.
- Contract value types are structural: no `#private` members, no
  `unique symbol` brands, no classes. Members use property-function syntax,
  because method syntax is checked bivariantly and hides breaking changes.
- Additive member: `revision + 1`, `compatibleFrom` unchanged; providers
  implement every revision in their window, which the types enforce.
- Removal, rename or type change: add the replacement first and keep the old
  member while `compatibleFrom` admits consumers that use it, then raise
  `compatibleFrom`. A change in place sets `compatibleFrom = revision` and
  ships migration notes; old consumers receive `consumer-too-old`.
- A contract owner raises `compatibleFrom`; a Host upgrades a provider to a
  contract version with a higher `compatibleFrom` only when its inventory of
  `plan.bindings[]` `(capabilityId, revision)` shows no plan that binds a lower
  revision. Upgrade providers before consumers; the other order fails closed
  with `provider-too-old`.
- A contract package lists Get Modular packages in `peerDependencies` like a
  module package. When a Get Modular minor changes the authoring surface, the
  contract owner re-releases every contract line that consumers still use
  with the new peer range; revisions and value types do not change in that
  release.
- An input declaration uses the same descriptor copy as the parent slot that
  supplies its value.

### Closed with this generation

- Core plans never mark inputs. Assembly bindings remain the only place that
  knows them (ADR-0031). Reopening needs a consumer and a new generation.
- `owner.authority` stays a navigation label. Namespace rules stay in the
  Consumer Module Standard section "Identity and namespaces"; Core gains no
  namespace check.
- No ranges, provider selection, conversion, deprecation metadata on the wire
  or warnings in Core.

### Qualification

- Accepted v1 and generation-two artifacts stay byte-identical and remain the
  authority for the schema 1 contract; `contracts:test` keeps checking them.
- `architecture/qualification/revision-windows/` adds `schema.json`
  (declaration 2, plan 2, profile 1 and the diagnostic union), `catalog.json` (the generation-two
  catalog with only the `binding.compatibility-mismatch` detail policy
  replaced), `contract.json` (the generation-two diagnostic contract with only
  that variant replaced) and `cases.json`. The private transform
  `tests/qualification/support/revision-window-transform.mjs` rewrites
  historical cases. `architecture/authority/revision-window-ledger.json` pins
  these files and reuses the generation-two resource profile by digest.
  `architecture/checks/revision-windows.mjs` authenticates the ledger and
  validates the cases; its rejecting tests run in `contracts:test`.
- The transform is a closed pure function over historical cases. It lifts
  each historical declaration to schema 2: each compatibility record becomes
  the revision fields of its entry, an admitted version 1 becomes 2 and an
  admitted version 2 becomes 3. It rewrites
  mismatch details and turns expected plans into schema 2, with digests from
  an independent canonicalizer and SHA-256. Cases whose outcome depends on the
  bytes of a compatibility record are retired by id, with a reason, and
  replaced by schema 2 cases; tests whose subject is a schema 1 field are
  replaced by schema 2 field tests.
- Core replays the historical categories through the transform, with object
  and raw entries and with production and direct subjects. Measured on the
  M2 corpus before this decision: 818 object and 123 raw-document outcomes
  replay unchanged after the lift.
- No retained execution capture. The expected results are the pinned
  generation-two outcomes through the pinned transform plus the authored
  cases, a deterministic and reproducible derivation.

### Release

Core and Assembly 0.4.0 form the exact pair of ADR-0027; Assembly admission
authenticates the 0.4.0 pair by this decision's bytes. Both packages ship a
minor changeset, an approved public API break and migration notes. The
conformance kit ships 0.2.0. `@get-modular/resources` and the lifecycle
kernel are unaffected. Core's export set of ADR-0009 is unchanged.

### Precedence

- Supersedes ADR-0005 "Exact compatibility only" in full, including
  separately named compatibility families.
- Supersedes ADR-0004 where provided capabilities carry exact compatibility
  data, a provider needs the exact required token and the identity grammar
  covers compatibility tokens. Plan bindings record the consumer revision.
- Supersedes ADR-0009 only in its sentence on product-owned compatibility
  tokens. The declaration `schemaVersion` changes from 1 to 2 with no second
  admitted value; its exhaustive export set, its naming rule and its ban on
  parallel APIs stand.
- Supersedes ADR-0032 in the token encoding of revisions, its rejection of
  `compatibleFrom`, "identical value and compatibility type" (now: identical
  value type per used revision), hand-written `CapabilityContract<Value,
  Token>` maps and, for Assembly's typed binding, the statement that
  declarations written with Core's helpers remain accepted. It withdraws
  ADR-0032's consequence that the next generation ships a Core decoder for
  the previous schema: schema 1 is the project's own pre-release format and
  is not carried as legacy.
- Refines ADR-0021: the revision-window successor is the current diagnostic
  authority for Core 0.4.0; generation two stays the authority for schema 1.
- Confirms ADR-0031: plans do not mark inputs.
- GM-REQ-V1 and the accepted v1 and generation-two artifacts keep recording
  the schema 1 contract and are not rewritten.
- For 0.4.0 this decision takes precedence over the Consumer Module Standard
  until its revision for this release.

## Consequences

- An additive contract change reaches old consumers without a coordinated
  release; providers serve a window and the types make them implement every
  revision in it.
- An independently built module package is checked by Core before any
  factory runs. The diagnostic names the capability, the revisions and the
  side to update.
- Declarations and Hosts written with the builder do not change. Code that
  reads `binding.compatibility-mismatch` details, writes maps or
  `CapabilityContract` by hand, indexes a map by capability id or binds
  literal Core declarations through Assembly changes once.
- Every plan digest changes once. Hosts that keep digests re-record them.
- Declarations from the 0.3.0 builder, and any persisted schema 1 document,
  fail closed with `schema.unsupported-version`; rebuild them with the 0.4.0
  builder. No consumer is known to persist declarations.
- A revision is a claim, not a proof. The contract owner's suite for each
  revision in a window remains the behavioral guard.
- A module package that takes its contract package as a peer, or a contract
  owner who ships a revision change as a patch, can make a slot claim a
  revision it was not built against. The standard forbids both; Core cannot
  detect them.
- Contract packages carry earlier-revision types while windows are open. A
  revision missing from `Earlier` fails closed when a Host prepares a module
  built against it.
- Windows let consumers lag providers within one Get Modular minor; a minor
  that changes the authoring surface requires re-releases of contract and
  module packages.

## Rejected alternatives

- Versioned capability ids such as `/v2`: parallel lines and duplicated
  providers accumulate; rejected by the owner.
- Keeping the `family`/`familyVersion` envelope as a seam: `schemaVersion`
  already versions the record.
- Removing compatibility and keeping only the id: no runtime guard for
  independently built packages.
- Semantic version ranges, provider selection or conversion in Core:
  selection under ranges is NP-complete, choices become hidden and callbacks
  break determinism.
- New diagnostic codes for revision failures: they break every Host's total
  translation map; the existing code with richer details suffices.
- Reading schema 1 in Core inside the shape check: a second admission form
  in the most hardened layer for the project's own pre-release format; a
  test-side lift replays the M2 corpus (818 object and 123 raw-document
  outcomes, measured) without it, and tests whose subject is a schema 1 field
  are replaced by schema 2 field tests.
- A separate Core upgrade step from schema 1 to schema 2 before admission:
  feasible (prototyped), but it carries a legacy format the project does not
  need at this stage; an upgrade policy for plugin declarations belongs to the
  plugins track.
- Reading schema 1 in Assembly's binding as well: with one installed copy of
  each Get Modular package no supported setup produces it.
- Recording provider revisions in plans: no consumer and more digest churn.
- A nested revision record per capability in maps: it would rewrite the
  handle brand of ADR-0032; flat keys reuse it unchanged.
- Earlier revisions passed as descriptors (`earlier: [Db3, Db4]`): more
  runtime surface and about three times the type-check time at 1000 handles.
- `defineContract<{ 2: V2; 3: V3 }>()`: it changes the meaning of the first
  type parameter and breaks every 0.3.0 descriptor.
- An explicit `builtAgainst` revision per slot or generated declarations: more
  author burden; the dependency rule is the owner's choice.
- A full successor capture like ADR-0021: weeks of work and megabytes of
  evidence for a deterministic derivation.
````

Copy the text between the four-backtick fences exactly; the inner `text` and `ts` fences belong to the ADR.

## Risks and stop conditions

| Risk | Stop / action |
| --- | --- |
| `docs:new` writes a different path or rejects the id | stop; never create the file by hand |
| cspell or markdownlint fails on the text | reword or add a real word; never disable a rule for `docs/` |
| the owner changes the text after acceptance metadata is set | regenerate the registry entry and the checkpoint digest in the same commit; no amend of an accepted file on `main` ever |
| any accepted ADR byte changes (`ownership:checkpoint:test` fails on an existing ADR) | stop; revert your edit to that file |
| owner approval not explicit | the PR stays draft |

## Must not

- Edit any accepted ADR, the CMS, code or gates. Hand-edit `accepted-decisions.json`.
- Set `status: accepted` before the owner approves in the PR.
- Merge, request reviewers or comment outside the own PR. Override the git identity, add co-author trailers or tool
  attribution anywhere.

## Done

ADR accepted and registered, index and checkpoint pin updated, all gates green locally and in CI, owner approval
linked in the PR.

## Review checklist

- `git diff --stat origin/main...HEAD`: exactly the ADR file, `accepted-decisions.json` (one appended entry),
  `docs/decisions/README.md` (one line), `tests/ownership-checkpoint.test.mjs` (one object), `.cspell.json` only if
  needed.
- The ADR body equals this brief's text except the number and approved edits; `rg -n 'checkNamespaces' docs/decisions/NNNN-*`
  returns nothing, and `rg -n -i 'plugin' docs/decisions/NNNN-*` hits only the context paragraph on the withdrawn
  decision, the "Plugin readiness" section and the rejected alternative on a separate upgrade step.
- `rg -n -i 'upgrade step|decoder' docs/decisions/NNNN-*` hits only "Schema 1 declarations", "Plugin readiness", the
  withdrawal in "Precedence" and the rejected alternatives.
- The six exported helper type names in "Assembly builder and types" match the T2-4 brief.
- The registry digest is produced by the Foundation promote command, never typed by hand: `pnpm foundation:check`
  and `pnpm ownership:checkpoint:test` exit 0 on the PR head.
- Mutation spot-checks (locally, then revert): change one word in the accepted ADR body -> `pnpm foundation:check`
  or `pnpm ownership:checkpoint:test` must fail; change `approved_by` -> must fail; remove the README index line ->
  `pnpm docs:protocol:check` must fail (if it does not, note it; not a blocker).
- Every precedence bullet names a passage that exists in the cited ADR (open ADR-0004, 0005, 0009, 0032 and find it).
