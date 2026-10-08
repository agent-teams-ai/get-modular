# T2-2 brief: revision-window successor evidence

PR title: `feat(qualification): add the revision-window successor evidence`. Adds pinned evidence, a pure transform,
a checker and its rejecting tests. Core, Assembly and conformance are not touched; `main` stays green.

The train 2 ADR (ADR-NNNN, "Replace exact compatibility tokens with revision windows", accepted in T2-1) is the
authority. Read it completely before starting; where this brief and the ADR differ, the ADR wins and you stop and
report.

## Re-verify before start

1. `git fetch origin`; record `origin/main`. ADR-NNNN is accepted on `main` (`docs/decisions/` and
   `architecture/decisions/accepted-decisions.json`). If not: stop.
2. Q1 is an owner decision (2026-10-08): schema 1 is refused everywhere, and the historical corpus replays through
   the test-side lift this brief defines. Train 1 is released: core and assembly `package.json` at
   0.3.0, no train 1 changeset in `.changeset/`, `npm view @get-modular/core version` prints `0.3.0`; otherwise stop.
3. Read and record the digests of: `architecture/qualification/generation-two/{schema,catalog,contract}.json`,
   `architecture/qualification/v1/resource-profile-v2.json`, `architecture/contracts/v1/{composition.schema,diagnostic-catalog,canonical-vectors}.json`.
   They are immutable; if any differs from what `architecture/authority/diagnostic-generation-two-ledger.json` and
   `v1-qualification-ledger.json` pin, stop.
4. Study the closest precedents before writing code:
   - small successor: `architecture/checks/implementation-clarifications.mjs`,
     `architecture/authority/implementation-clarifications-ledger.json`,
     `architecture/qualification/implementation-clarifications/{contract,cases}.json`,
     `tests/implementation-clarifications.test.mjs` (pattern for ledger, checker API `check...({ readBytes, listedPaths })`,
     rejecting tests);
   - adapter over immutable recipes: ADR-0022 and `tests/qualification/support/m2-resource-outcomes.mjs`;
   - historical categories replayed by Core: classes R and V of the T2-3 brief (table "Test migration classes"),
     above all `packages/core/tests/public/m2-successor.test.mjs` (818 object outcomes, 123 raw documents, 62 raw
     invocations); the checker reads the root mirrors of the same generators under `tests/qualification/` (never
     `packages/core/tests`). On `81063ad` the mirrors of the duplicate-record, raw invocation and M3 descriptor,
     invocation, semantic and runtime fixtures are byte-identical to the Core copies; the mirrors of
     `raw-document-cases`, `object-descriptor-cases`, `m2-resource-outcomes`, `object-subject-cases`,
     `m3-p500-runtime-fixtures` and `resource-profile-v2` differ only in how they locate the repository root and
     import `materialize`. Any other difference: stop;
   - independent oracles: `createDiagnosticComparator`, `createSchemaValidators` in
     `architecture/checks/v1-qualification.mjs` (immutable; import, never edit).
5. `architecture/foundation/source-dependencies.yaml` lists every `architecture/checks/*.mjs` entrypoint of the
   `repository.development` boundary. The new checker must be added there (step 5). If the file's shape changed, follow
   the new shape.
6. Node per `.node-version`; `pnpm install --frozen-lockfile` in your own worktree.

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

## Scope

New files:

| Path | Content |
| --- | --- |
| `architecture/qualification/revision-windows/schema.json` | complete successor JSON schema |
| `architecture/qualification/revision-windows/catalog.json` | gen-2 catalog with one detail policy replaced |
| `architecture/qualification/revision-windows/contract.json` | gen-2 diagnostic contract with one variant replaced |
| `architecture/qualification/revision-windows/cases.json` | authored schema 2 cases, schema 1 refusal cases and the retired list |
| `tests/qualification/support/revision-window-transform.mjs` | the pure transform (no imports) |
| `architecture/authority/revision-window-ledger.json` | pins the five files above and the reused resource profile |
| `architecture/checks/revision-windows.mjs` | checker: ledger, schema, catalog, contract, cases, transform self-checks |
| `tests/revision-windows.test.mjs` | accepted inputs pass; each mutation is rejected |

Edits: `package.json` script `contracts:test` (append `tests/revision-windows.test.mjs`),
`architecture/foundation/source-dependencies.yaml` (checker entrypoint), `.cspell.json` only for real words.

Non-goals: no Core, Assembly or conformance change; no replay of cases against Core (T2-3 does that); no edit of any
immutable artifact, ledger or checker; no CI workflow or lane change.

## Specifications

### 1. `schema.json`

Copy `architecture/qualification/generation-two/schema.json` and change only:

- `$id`: `urn:get-modular:private:revision-windows:composition-schema`.
- `$defs.revision`: `{ "type": "integer", "minimum": 1, "maximum": 2147483647 }`.
- `$defs.providedCapability`: properties `capabilityId` (`portableId`), `revision`, `compatibleFrom` (both
  `#/$defs/revision`); required all three; `additionalProperties: false`.
- `$defs.dependencySlot`: `slotId`, `capabilityId`, `revision`, `cardinality`; required all four.
- `$defs.planBinding`: replace `compatibility` by `revision`.
- `$defs.compositionPlan.properties.schemaVersion`: `{ "const": 2 }`.
- `$defs.moduleDeclaration.properties.schemaVersion`: `{ "const": 2 }`.
- Diagnostic union (`$defs.diagnostic`): the `binding.compatibility-mismatch` details become the five fields of the
  ADR with `reason` enum `["consumer-too-old", "provider-too-old"]` and the three numbers as `#/$defs/revision`.
- `compatibleFrom <= revision` cannot be expressed either; the checker enforces it.

### 2. `catalog.json`

Copy `architecture/qualification/generation-two/catalog.json`; set `catalogVersion` to 3 and
`detailPolicy["binding.compatibility-mismatch"]` to
`["capabilityId", "reason", "consumerRevision", "providerRevision", "providerCompatibleFrom"]`. Nothing else changes:
`ordering.codes` (33 codes) and `ordering.phases` stay byte-identical as JSON values.

### 3. `contract.json`

Copy `architecture/qualification/generation-two/contract.json`; set `contractVersion` to 3; in `variants` replace the
`binding.compatibility-mismatch` entry's `details` by
`{ "required": ["capabilityId", "reason", "consumerRevision", "providerRevision", "providerCompatibleFrom"], "reasonValues": ["consumer-too-old", "provider-too-old"] }`.
Nothing else changes (coordinate, phases, comparator, prerequisites, protocols). The checker proves this by
comparing with the gen-2 file (section 6).

### 4. The transform (`tests/qualification/support/revision-window-transform.mjs`)

A closed pure ESM module with **no imports**. Every dependency it needs is a parameter:

```js
// Lifts historical schema 1 cases to the revision-window generation (ADR-NNNN).
export const transformIdentity = Object.freeze({ id: "gm-revision-window-transform", version: 1 });
export function allocateRevisions(declarations, { isPortableId }) {}       // Map<capabilityId, Map<token, N>>
export function liftDeclaration(declaration, allocation) {}                // one schema 1 JSON declaration -> schema 2
export function liftDeclarations(declarations, { isPortableId }) {}        // templates: allocate, then lift each
export function transformExpected(expected, declarations, { isPortableId, digestPlan, compareDiagnostics }) {}
export function transformObjectCase(row, { isPortableId, digestPlan, compareDiagnostics }) {}
export function transformRawCase(row, { isPortableId, digestPlan, compareDiagnostics }) {}
```

`row` is `{ caseId, input, expected }` exactly as the row-form generators produce it (object input
`{ declarations, profile }`; raw input as the raw generators define it). The result is
`{ caseId, status: "replay", input, expected }` or `{ caseId, status: "retired", reason }`. The transform works on plain
JSON only: it deep-copies a row and never mutates it. It never receives a materialized input (accessors, frozen,
sealed or non-extensible records, foreign-realm or null-prototype objects, array `length` attributes): T2-3 lifts the
JSON templates before materialization with `liftDeclarations` and maps the expectation with `transformExpected`.

Rules (each one gets a rejecting test, section 7):

1. **Eligible entries.** A `provides` or `slots` entry of a declaration whose `compatibility` is a record with
   `family: "exact"`, `familyVersion: 1` and a `token`, and whose `capabilityId` and `token` both pass `isPortableId`,
   defined as: a string of 3 to 128 UTF-16 code units that matches the `portableId` pattern of
   `architecture/contracts/v1/composition.schema.json` (Core's identity check); the caller builds it from
   `minLength`, `maxLength` and `pattern`.
2. **Allocation, per case and per capability id.** Visit declarations in array order; inside each, `provides` in order,
   then `slots` in order. Collect distinct tokens per capability in first-occurrence order. Candidate N of a token: a
   token ending in `/v<k>` (canonical decimal `k >= 1`) gives k; a token equal to the capability id gives 1; otherwise
   none. Pass 1 gives each token its candidate if no earlier token of the same capability took it. Pass 2 gives every
   remaining token the smallest unused positive integer, in first-occurrence order. Equal tokens get equal N, distinct
   tokens distinct N.
3. **Lift.** `liftDeclaration` replaces the `compatibility` member of each eligible entry, in place of that member,
   by `revision: N` (slots) or `revision: N, compatibleFrom: N` (provides). The version: an admitted value 1 becomes 2;
   every other member stays as it was.
4. **Unliftable entries stop with evidence.** An entry that has a `compatibility` member but is not eligible cannot
   be lifted (its subject is a schema 1 field); an entry without a compatibility record (missing, or not a record) is
   unliftable as well. The transform throws `unliftable entry` with the case id and the entry
   path; it never drops, guesses or keeps it silently. Measured on `81063ad`: 0 such entries in the M2 corpus
   (`notLiftable: 0`). Any occurrence in a row-form category: stop and report the list; T2-3 replaces such a test by
   a schema 2 field test only after the owner's go.
5. **Expected plan.** If `expected` has a plan: `schemaVersion: 2`; each binding drops `compatibility` and gains
   `revision`, the N of the consumer slot's token for that `capabilityId`. `digest = digestPlan(plan)`.
6. **Expected mismatch details.** For every `binding.compatibility-mismatch`: find the consumer slot from the
   coordinate (`implementationId`, `slotId`) and the provider entry from `providerImplementationId` and the slot's
   capability id in the case input; details become `{ capabilityId, reason, consumerRevision, providerRevision,
   providerCompatibleFrom }` with `providerCompatibleFrom = providerRevision` (lifted windows have one revision) and
   `reason = consumerRevision < providerRevision ? "consumer-too-old" : "provider-too-old"`. Every other diagnostic is
   unchanged. Re-sort the list with `compareDiagnostics` (built by the caller from `createDiagnosticComparator` over
   the successor catalog and contract) and assert that the sort changed nothing except mismatch positions; anything
   else: throw.
7. **Version lexemes.** Historically `schemaVersion: 2` always meant "unsupported" and 1 meant "current". A
   declaration whose version is the admitted value 2 gets 3 (unsupported again); a lifted declaration's admitted 1 gets
   2. In raw text the one significant digit of the lexeme changes (`2` -> `3`, `2.0` -> `3.0`, `20e-1` -> `30e-1`;
   `1` -> `2`, `1.0` -> `2.0`, `1e0` -> `2e0`, `10e-1` -> `20e-1`, `1.0000000000000000` -> `2.0000000000000000`), same
   byte length, and the new lexeme must parse to the new value; otherwise throw. A version that is missing or not an
   admitted integer stays as it was (Core checks such a document against schema 2 and reports the version).
8. **Retire, with these exact reasons:**
   - `"lift bytes reach a resource limit"`: the lift changed the UTF-8 byte length of any document and either the
     expected outcome contains `input.limit-exceeded` with `limitName` `declarationRawDocumentBytes`,
     `profileRawDocumentBytes`, `aggregateRawBytes`, `aggregateStringBytes` or `identifierBytes`, or the case is a
     byte-limit boundary recipe (its recipe names `rawDocumentBytes`, `aggregateRawBytes`, `aggregateStringBytes` or
     `identifierBytes`). Count limits (`providersPerManySlot`, `bindings`, ...) never retire a case.
   - `"raw compatibility is escaped"`: a raw document spells an eligible compatibility record with a JSON escape, so
     the structural edit of rule 9 cannot keep every other byte.
   Never retire for any other reason; an unexpected situation throws with the case id.
   Expected result (measured on `81063ad` with a schema-2-only Core prototype, see the plan index section 1a):
   nothing retires; 818 of 818 object rows and 123 of 123 raw documents equal their transformed expectations; the 62
   raw invocations carry no declarations with tokens. A non-empty `retired` list: stop and report before committing it.
9. **Raw cases.** Edit only documents whose bytes decode as strict UTF-8 (keep a BOM) and parse as JSON; leave
   carriers (detached, shared, invalid UTF-8) and unparseable bytes untouched. Replace each eligible
   `"compatibility":{...}` member by its revision members and apply rule 7 to the version lexeme, scanning
   string-aware (never a global text replace) and keeping every other byte. After the edit, parsing the new text must
   equal `liftDeclaration` applied to the parsed old text; otherwise throw.

### 5. `cases.json`

```json
{ "kind": "get-modular.revision-window-cases", "authority": "ADR-NNNN", "transform": "gm-revision-window-transform@1",
  "cases": [ ... ], "retired": [ { "caseId": "...", "reason": "..." } ] }
```

- `retired` is generated once by running the transform over the row-form categories only: the nine object
  generators of `m2-successor` (`duplicateRecordBaseCases`, `duplicateRecordRowFailureCases`,
  `duplicateRecordOverlapCases`, `duplicateRecordPermutationCases`, `duplicateRecordOrderingCases`,
  `duplicateRecordShuffledOrderingCases`, `duplicateRecordCollectorCases`, `duplicateRecordExtendedOverlapCases`,
  `m2ResourceOutcomeCases`), `rawDocumentCases`, the raw invocation fixtures, the object descriptor `CASES` (through
  their JSON templates, never a materialized input) and the v1 vectors in row form:
  `architecture/qualification/v1/qualification-case-manifest.json` `staticConformanceProtocol.cases` (rows with
  `caseId`, `input`, `expected`) and the `normalization-vectors.json` case through a row adapter; diagnostic
  snapshots and implementation-clarification graph recipes are not rows. Run-style suites
  (`objectSubjectCases`, `executeM2RawCase`, the M3 runtime fixtures) have no rows; T2-3 transforms them at their
  comparison site, and they never retire a case: one that cannot be transformed is a stop. Commit `retired` sorted by
  `caseId`. The checker re-derives it from the root mirrors (section 6).
- `cases`: authored by hand from the ADR, each `{ caseId, entry: "object" | "raw", input, expected }`. Raw inputs are
  JSON text strings (`rawDeclarations: [string]`, `rawProfile: string`). Expected plans carry digests computed by the
  test oracle (`json-canonicalize` + SHA-256 over the envelope
  `{ kind: "get-modular.plan-content", protocolVersion: 1, canonicalization: "RFC8785", hashAlgorithm: "SHA-256", plan }`,
  spelled `gm-plan:v1:sha-256:<hex>`). Expected diagnostics are written by hand and ordered with the comparator.
  Never compute an expected value by calling Core.
- Minimum coverage (case ids under `rw.<group>/<name>`), about 45-60 cases:
  - `rw.field/*`: provided `revision` and `compatibleFrom` missing, `0`, `2147483648`, `1.5`, `"1"`; slot `revision`
    missing and invalid; `compatibleFrom > revision` (path = provided entry); `compatibility` member in schema 2
    (`schema.unknown-field`); declaration `schemaVersion: 3` and profile `schemaVersion: 2`
    (`schema.unsupported-version`); a declaration with entries and a missing `schemaVersion` (checked against
    schema 2: only the version diagnostic for schema 2 entries; `schema.unknown-field` and the missing `revision`
    for schema 1 entries).
  - `rw.raw/*`: `1.0` and `1e0` admitted; `1.5` invalid-type; `-0` and `9007199254740993` per the existing
    safe-integer rules; duplicate `revision` key (`decode.duplicate-key`).
  - `rw.window/*`: provider window 3..5 with consumers 3, 4, 5 (plan), 2 (`consumer-too-old`), 6 (`provider-too-old`);
    a many slot with two providers failing for different reasons; a duplicated provider occurrence in one row (one
    mismatch, plus `binding.duplicate`).
  - `rw.schema1/*`: a schema 1 declaration with builder tokens, one with hand tokens and one in raw form are each
    `schema.unsupported-version` at their `schemaVersion` (object and raw entry); a graph that mixes a schema 1 and a
    schema 2 declaration reports the schema 1 document and admits nothing.
  - `rw.adapter/*`: an adapter declaration that slots `acme/db` revision 5 and provides `acme/db` revision 3; old
    consumers bind to it, it binds to the new provider; plan and digest.
  - `rw.plan/*`: three canonical plan 2 vectors (no bindings, required, ordered many) with digests.

### 6. Ledger and checker

`architecture/authority/revision-window-ledger.json`, same shape as the implementation-clarifications ledger
(`schemaVersion`, `algorithm: "sha256-bytes"`, `artifacts[]` of `{ id, path, immutableDigest }`), ids
`GM-REVISION-WINDOW-SCHEMA`, `-CATALOG`, `-CONTRACT`, `-CASES`, `-TRANSFORM` and `GM-RESOURCE-PROFILE-V2-REUSED` for
`architecture/qualification/v1/resource-profile-v2.json` (its current digest).

`architecture/checks/revision-windows.mjs` exports `checkRevisionWindows({ readBytes, listedPaths, loadTransform })`
and a CLI guard like the precedent. It fails closed (throws with a message naming the rule) unless:

1. the ledger bytes equal the constant `REVISION_WINDOW_LEDGER_DIGEST` in the checker, and every artifact's bytes
   equal its pinned digest; `listedPaths` equals the ledger paths;
2. `accepted-decisions.json` lists ADR-NNNN with the path of the accepted ADR file;
3. `catalog.json` equals gen-2 `catalog.json` except `catalogVersion` and that one detail policy (deep compare);
   `contract.json` equals gen-2 `contract.json` except `contractVersion` and that one variant's `details`;
4. every case input validates against `schema.json` where the case expects admission, no admitted case contains a
   schema 1 declaration, and every provided entry of an admitted schema 2 declaration has
   `compatibleFrom <= revision`;
5. every expected diagnostic validates against the successor diagnostic union and appears in comparator order, and
   every expected plan's digest equals the oracle digest;
6. the transform: its digest oracle reproduces the pinned positive vector digest of
   `architecture/contracts/v1/canonical-vectors.json` before computing any new digest; re-running it over the
   historical categories reproduces `retired` exactly; it is deterministic (two runs, equal JSON).

### 7. Tests (`tests/revision-windows.test.mjs`)

One passing run over the accepted inputs, then one rejecting test per rule, each a single targeted mutation of an
in-memory copy (pattern of `tests/implementation-clarifications.test.mjs`):

- ledger digest, artifact digest, extra and missing listed path, ADR entry missing;
- catalog: an extra change anywhere besides the detail policy; contract: an extra change in another variant;
- case input with `compatibleFrom > revision` marked admissible; a schema 1 declaration in an admitted case;
- an unordered diagnostic list; a wrong expected digest;
- transform: allocation collision (two tokens to one N), `/v2` before `/v1` order, equal tokens across declarations,
  token equal to id, an unliftable entry (throws with case id and path), each retire reason, a count limit that must
  not retire, a raw document with a compatibility-like string inside another member, an escaped raw compatibility
  record, the version lexeme rules (`1`, `1.0`, `1e0`, `10e-1` -> 2; `2`, `2.0`, `20e-1` -> 3; a missing version
  unchanged), the immutability of the input row (deep-freeze it first);
- the retired list edited (one id removed, one added).

## Commits and gates

1. `feat(qualification): add the revision-window schema, catalog and contract` - sections 1-3 and their checker
   parts. Gates: `node --test tests/revision-windows.test.mjs`, `pnpm contracts:test`, `pnpm docs:protocol:check`.
2. `feat(qualification): add the revision-window transform` - section 4 with its tests.
3. `feat(qualification): add the authored revision-window cases and ledger` - sections 5-6, the
   `contracts:test` script line, the source-dependencies entrypoint.
4. After the last commit: `pnpm contracts:check`, `pnpm contracts:test`, `pnpm governance:check`,
   `pnpm governance:test`, `pnpm foundation:check`, `pnpm docs:protocol:check`, then
   `GIT_CONFIG_GLOBAL=<file with only a [user] section> pnpm check`. Each exit 0. Record the time of
   `pnpm contracts:test` before and after.

PR body: the measurements (number of replayed cases per category, retired count per reason, authored case count),
the list of categories, the static-lane times of all six OS and runtime combinations from CI.

## Risks and stop conditions

| Risk | Stop / action |
| --- | --- |
| the retired set is not empty (measured expectation, rule 8), any reason outside the two, or any unliftable entry (rule 4) | stop and report the list; the owner decides |
| a historical case needs a rule the transform does not have | stop; never special-case by case id |
| the checker would need to import Core, Assembly or a package under test | stop; independence rule (ADR-0006, ADR-0033) |
| a gate rejects the new checker as an unknown boundary | fix the source-dependencies entry; never narrow governed roots |
| `contracts:test` adds more than 90 s on any OS lane, or the static lane passes 810 s | stop and report |
| an immutable artifact or ledger would need an edit | stop |

## Must not

- Edit any file pinned by an existing ledger, any accepted ADR, Core, Assembly, conformance or CI.
- Compute expected values with Core. Add a case id special case to the transform.
- Merge, request reviewers or comment outside the own PR. Override the git identity, add co-author trailers or tool
  attribution.

## Done

All new files pinned and checked; `contracts:test` green on all six OS and runtime combinations; PR body has the measurements; the
retired list is short, explained and reproducible.

## Review checklist

- Diff: only the listed files and edits. `git diff origin/main -- architecture/qualification/generation-two architecture/qualification/v1 architecture/contracts` is empty.
- `node -e` a deep diff of successor vs gen-2 `catalog.json` and `contract.json`: exactly the documented differences.
- Read the transform end to end against rules 1-9; it has no `import`.
- Re-derive three authored digests by hand with `json-canonicalize` and `node:crypto`.
- Pick five authored cases and check their expected diagnostics against the ADR text (code, reason, path, order).
- Mutation spot-checks (local, then revert), each must make `node --test tests/revision-windows.test.mjs` fail:
  1. in the transform, give a `/vK` token N = K + 1 when K is taken (should be the smallest unused);
  2. in the transform, swap the two `reason` strings;
  3. in the checker, skip rule 6's canonical-vector self-check;
  4. in `catalog.json`, change one ordering code;
  5. in `cases.json`, swap two expected diagnostics of one case.
