# 04. Explicit adapters between exact contract revisions

Status: proposed design; no runtime or type API is changed by this plan.
Priority: after resource preflight and authoring checks; qualify one actual
consumer migration before admitting the public type change.
Apply this slice after plan 02's reviewed construction metadata/type shape;
do not redesign the same Assembly generics concurrently. Plan 03's current-policy
checks and their expectations advance atomically with this successor.

## Baseline and demonstrated limit

Reviewed Get Modular revision:
`5fb83478dd7b95216be92c4d3077eddf2774eef8`.

- `CapabilitiesOf` and entry used-key brands currently key a map by capability
  ID. A module's value and compatibility types must equal the preparing map.
- Core indexes provided capabilities per implementation and checks exact tokens
  for each selected provider-to-slot edge. Its wire format already represents
  separate providers of one ID at different exact revisions.
- The earlier investigative source-Core probe built a four-module graph:
  native provider r2, adapter consuming r2/providing r1, old consumer r1 and new
  consumer r2, with explicit bindings. It succeeded. This was a source execution
  probe, not strict typechecking, packed-package or consumer qualification.
- CMS currently requires one revision across providers/consumers. ADR-0041 also
  preserves early conflicts between unused transitive revisions. Allowing two
  revisions changes that guarantee deliberately; it is not merely new syntax.

Sources: [Assembly types][types], [Core census][census], [Core bindings][bindings],
[CMS][cms] and [ADR-0041][adr41].

## Goal and boundary

Let independently updated static modules coexist through ordinary exact
contracts and explicit adapter modules. The adapter translates behavior and data;
the library never presumes r2 implements r1.

Included: Assembly type identity, complete feature maps, public type consumers,
Conformance types, migration tooling, CMS guidance and qualification.
Excluded: new Core wire/schema/digest, compatibility windows, semver resolution,
provider priority, automatic adaptation, runtime discovery, plugin generations,
lease retention, new DI containers and a second authoring API.

Core remains the graph/compatibility owner. Assembly owns the typed authoring
surface; contract owners own adapter behavior and their contract suites.
The plugin workstream needs notice of the shared identity change, but contributes
no implementation or lifecycle requirements to this slice.

## Selected design

1. Key descriptor-derived maps by the existing exact token
   `<capabilityId>/r<revision>`, using one key-remapped mapped type. Avoid recursive
   intersections or a per-key search across the full descriptor union.
2. Derive entry/group used keys from the tokens a declaration provides/consumes.
   Keep their existing invariant brands: covariance alone would allow a consumer
   expecting a wider value under the same token.
3. Resolve factory value types by the declaration's exact token. Runtime product
   records remain keyed by capability ID; dependency records remain keyed by
   slot ID. No runtime token-to-service registry is introduced.
4. Validate literal declaration IDs/tokens and exact map-token correspondence.
   Widened IDs, token unions, widened declarations and callback inference must
   not manufacture a precise dependency type or erase a failed check.
5. Preserve `KnownCapabilities`, tuple requirements and precomputed group keys.
   A single-revision Host rejects an entry using an absent revision. Erasing
   entries into an annotated array must not bypass the `profileId` checks.
   The existing weaker static guarantee of the dynamic `composition` form
   remains documented; runtime Core validation still applies.
6. Keep one capability ID per implementation's provides record. The r2 provider
   and the r1 adapter are separate implementations. An adapter may consume r2
   and provide r1 under the same capability ID.
7. Keep profile completion unchanged. Several providers of one capability ID
   require explicit bindings even if their tokens differ; no revision-aware
   auto-selection is smuggled into this type change.
8. Preserve complete descriptor unions and separate imported
   `CapabilitiesOf<SourceContracts>` bases. Conflicting values for the same
   `(id, revision)` still reject at aggregate definition, including unused and
   private-child contracts. Identical overlaps remain valid.

### The deliberate contract change

Different revisions of the same ID become distinct type keys and may coexist
in a complete aggregate. The old unused-revision-conflict assertion must become
a positive coexistence assertion, paired with negative tests for an absent token,
wrong exact binding and conflicting values of the same token. Do not claim that
the old global same-ID revision conflict was preserved.

Separate bases remain necessary: combining imported descriptors into one mapped
base can still union conflicting values of the same exact token. The authoring
check plan must retain that distinction. An arbitrary hand-written union-valued
map is not proof that its values satisfy a behavioral contract.

## Delivery steps and affected files

1. Pin the current package inventory and one consumer source revision. Use the
   accepted passive setup/ordinary-session scope of Agent Runtime as the primary
   candidate, with its existing adoption profile. CMS records that adoption in
   [Agent Runtime PR #168](https://github.com/agent-teams-ai/agent-runtime/pull/168),
   merge `3cd722f607e1643b809f6946ee303a5a94469171`; this historical adoption is
   not a claim that its current source needs two revisions. Select an actual contract
   migration; if none benefits from staged coexistence, retain the proposal.
2. Create a scoped successor ADR through the existing Docs Protocol. Explicitly
   supersede the ID-only identity/unused revision collision parts of ADR-0032,
   ADR-0035/0036 and ADR-0041 as applicable. Preserve their accepted bytes and all
   unaffected guarantees. Do not add compatibility windows.
3. Update `packages/assembly/src/features/construction/types.ts` and affected
   public-root exports only when declarations require them. Cover
   `CapabilitiesOf`, `UsedCapability`, brands, `ValidDeclaration`, factory
   projections, inputs, groups and `KnownCapabilities` together.
4. Update existing type fixtures, Conformance type consumers and the current
   descriptor-aggregate/growth recipe. Keep declaration builders, runtime
   capability lookup, profile completion and Core production source unchanged.
5. Deliver one public-package migration slice with the four-module adapter graph,
   independent binding oracle and the contract owner's r1 suite applied to the
   adapter. Demonstrate both roots' useful results, not only successful prepare.
6. Update canonical CMS/guide examples, affected profiles and pins, the codemod,
   release metadata and evidence together. Production consumer migration stays
   within the selected passive scope; it does not adopt dynamic plugins.

Likely files: Assembly construction types; Conformance harness/type fixtures;
`tests/assembly/builder-types.ts`, `types*.ts`,
`descriptor-aggregate-types.ts`; existing consumer fixtures/growth sources;
`architecture/tooling/codemods/` and `tests/codemods/`; CMS and authoring guide.
Do not invent another scale or packed-consumer harness.

## Required proof matrix

| Boundary | Independent expectation |
| --- | --- |
| Exact adapter E2E | Old root uses r1 adapter; new root uses r2; both useful results match manually stated expectations |
| Same-token conflict | Wider/different values at identical ID/revision reject, including unused/private-child sources |
| Different revisions | Complete aggregate retains both exact keys and value types; neither becomes a union-valued substitute |
| Missing Host key | A used r1 entry/input/group fails against a Host with only r2, including one known plus one missing token |
| Widening | Broad/union declarations, callback inference and annotated arrays cannot erase the check |
| Factory shapes | Required/optional/ordered-many values remain exact; runtime records retain existing keys and order |
| Provider choice | Omitted ambiguous row refuses; explicit r2-to-r1 mismatch refuses before any factory |
| Runtime identity | Both revisions can expose distinct objects; shared aliases remain borrowed and are not disposed twice |
| Contract behavior | Adapter passes the old contract suite, including errors/cancellation; casting does not count |
| Package carrier | Public roots only, compatible exact Core/Assembly pair, strict supported NodeNext/Bundler projects |
| Scale | N100/500/1000 complete maps retain parity and pass the current workload under unchanged experiment caps |
| Consumer | Preliminary disposable-copy proof, followed by the bounded real-consumer migration patch/adopted head and its own required adoption checks and smoke |

Use existing `bun run assembly:build`, `bun run assembly:typecheck`,
`bun run assembly:test`, `bun run conformance:check` and the existing packed
consumer hook. Focused checks include
`node --test tests/assembly/types.test.mjs tests/assembly/types-focused.test.mjs`
and `node --test tests/assembly/type-scale.test.mjs`, after required build output.
Reuse the current growth driver and its documented fixed edits/caps; retain new
source identities. The earlier N1000 success is baseline evidence, not a pass
for the new map. Do not execute historical unsupported TypeScript versions.

Run `bun run check:changed` while editing, `bun run check:fast` before handoff
and `bun run check` plus required exact-head CI for final delivery. TypeScript
must be at least 7.0.2; new maintained tests/tooling use `.ts` and strict projects.

## Breaking release and migration

Descriptor-derived maps mostly migrate through the new `CapabilitiesOf`.
Explicit maps and indexed type accesses need exact token keys. A codemod may
rewrite only statically proven map rows/accesses; it must not rename runtime
capability keys, choose a revision for ambiguous indexing or erase extra manual
map properties/call/construct/index signatures or polymorphic `this`.
Unsupported semantic cases are printed for hand migration.

Ship the mechanical codemod and rejecting fixtures with the eventual breaking
minor. The changeset has the required Better/Codemod/By hand/Check block.
Preserve one public authoring path; do not retain an ID-keyed compatibility API.
The owner has already authorized deliberate breaking changes; this adds no new
personal approval step. Record their precise scope in the successor using
`bun run docs:new` and the accepted-decision registry workflow. The installed
`package.public-api-compatibility` check supplies the actual released-to-current
change fingerprints for `architecture/foundation/public-api-compatibility.yaml`;
bind the exact breaking entries to that successor and truthful Changeset intent.
Do not use historical audit fingerprints or relax governed entrypoints.

Follow [the checked release-candidate route][release]: refresh the registry,
observe the installed Changesets plan, admit its exact Core/Assembly pair and
affected leaf cohort in a bounded successor, then qualify the candidate. API
baselines remain unchanged on the feature branch and are promoted only by the
installed public producer on trusted `changeset-release/main`. No versioning or
publication is part of this plan PR. Consumer pins/peer ranges advance only with
the corresponding reviewed artifacts, CMS delta and adoption evidence.

## Acceptance and stop criteria

Accept after the full typed/packed/consumer matrix proves staged migration and
retained same-token invariance, with an accepted successor and fresh scale data.
Once a useful contract migration is selected and this candidate is admitted,
completion requires the actual consumer patch/adopted source head, reviewed CMS
and package/archive identities, and consumer-owned check results. A modified
disposable copy alone proves compatibility, not completed product adoption.
Stop and revise if token widening weakens a negative case, two revisions require
Core semantics changes, measured type cost exceeds the retained budget, or the
consumer cannot show a real migration benefit. Do not raise budgets merely to
green the change. Benchmark evidence must name compiler, graph and source bytes.

## Cost and risk

Type implementation: approximately 200–500 production lines; migration and
integration: another 100–250 lines. Tests/fixtures: approximately 600–1,200 lines,
excluding mechanically generated scale files and external consumer churn.
Confidence 8/10; achievable reliability within this scope 8/10; complexity 6/10.
These are design estimates, not measured availability.

Main risks are losing invariant entry checks, silently changing unused-revision
diagnostics, type-instantiation growth and unsafe codemod rewrites. The proposed
checks target those risks directly.

[types]: https://github.com/agent-teams-ai/get-modular/blob/5fb83478dd7b95216be92c4d3077eddf2774eef8/packages/assembly/src/features/construction/types.ts
[census]: https://github.com/agent-teams-ai/get-modular/blob/5fb83478dd7b95216be92c4d3077eddf2774eef8/packages/core/src/features/composition-semantics/declaration-census.ts
[bindings]: https://github.com/agent-teams-ai/get-modular/blob/5fb83478dd7b95216be92c4d3077eddf2774eef8/packages/core/src/features/composition-semantics/binding-record.ts
[cms]: https://github.com/agent-teams-ai/get-modular/blob/5fb83478dd7b95216be92c4d3077eddf2774eef8/docs/architecture/common-assembly.md
[adr41]: https://github.com/agent-teams-ai/get-modular/blob/5fb83478dd7b95216be92c4d3077eddf2774eef8/docs/decisions/0041-preserve-complete-feature-maps-with-descriptor-unions.md
[release]: https://github.com/agent-teams-ai/get-modular/blob/5fb83478dd7b95216be92c4d3077eddf2774eef8/architecture/tooling/release-candidate/README.md
