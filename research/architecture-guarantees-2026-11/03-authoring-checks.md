# 03 — Enforce the existing CMS authoring rules from observed source

Status: proposed implementation plan; no new checker or consumer adoption is delivered by this document.
Baseline: Get Modular `5fb83478dd7b95216be92c4d3077eddf2774eef8` (2026-11-06 observation).

## Problem and existing protections

- `checkModuleLayout` receives `files`, `imports`, and `useCaseExports`. It infers module ownership from value imports; it cannot see which entries a `group()` contains or which list a root passes to `prepare`.
- The prior source probe gave the same successful layout report for conditional `[a, b]` versus `[a]` membership. This demonstrates insufficient records, not a failure of Core or a proven pass of the complete installed Foundation/FMS pipeline.
- ADR-0041 already provides complete descriptor unions and separate `CapabilitiesOf` bases. Their source lists must match; the current layout records cannot establish that invariant in handwritten consumers.
- Foundation already owns source reading/parsing/resolution, FMS owns architectural import rules, and Conformance owns CMS rules. The installed qualification route already combines their public APIs and checks observation completeness.
- GM pins Foundation 3.0.0 and FMS 0.3.0. Foundation's public source-graph API at the released source `23b5a885ba46a2b43b5715ce82db28fcf04f2175` exposes imports and runtime exports, not an AST, binding/type facts, or a public visitor hook. The observed newer upstream source has the same limitation; a floating-main dependency is not a solution.

Sources: [layout records][layout-types], [layout implementation][layout-check], [installed qualification][installed], [ADR-0041][adr41], [released source API][foundation-api], [released graph producer][foundation-producer].

## Scope and ownership

Deliver two vertical slices through the same source observation path:

1. Actual group ownership and static root module lists.
2. Descriptor-union/separate-base parity for the canonical descriptor-derived recipe.

The result is a development-time check of an explicitly adopted authoring recipe. It does not prove arbitrary TypeScript programs safe or change runtime composition semantics.

| Owner | Change |
| --- | --- |
| Engineering Foundation | Extend its existing OXC parse with a bounded, architecture-neutral syntax-fact projection and expose that projection through the existing public source-graph entry. |
| Get Modular Conformance | Interpret the observed facts under CMS rules; retain pure checks and no filesystem, parser, Node or Foundation dependency. |
| Existing consumer check command | Supply actual-disk inventory and public producer output to the public pure checks, then execute the existing FMS checks and strict typecheck. |
| Consumer profile | Select the reviewed CMS revision, governed roots and supported syntax; retain existing broader import enforcement. |

Choose the upstream projection over a GM-local parser: the current public producer has no parser hook, and a local scanner or Foundation deep import would duplicate or bypass the established owner. This is a future upstream implementation/release dependency; the planning PR remains one GM PR.

**Excluded:** a generic AST framework/evaluator, another parser or resolver, a new tool package, discovery by executing modules, generated groups, a second manual module/contract catalog, runtime DI namespaces, plugin lifecycle, automatic fixes of semantic choices, whole-repository FMS migration, and any Core/Assembly behavior change.

## Small public seam, before the semantic checks

Add closed facts, not raw AST objects or executable callbacks:

- Named binding provenance: import/export names, aliases, module specifier, resolved relative target, lexical binding identity and source location; finite named re-export chains retain origin.
- List/call shape: the literal list associated with a direct call argument or named object property, references to its members, same-file constant references, and an unconditional returned call. Preserve order and duplicates.
- Type shape: type-alias union terms, `typeof` references, interface bases and their type arguments, plus explicit additional/manual members.
- Coverage for every requested file: complete, parse failure, or unsupported relevant expression; never substitute an empty list for missing facts.

Reuse the existing parse and resolver. Preserve all existing import/export/unresolved records. Do not add a generalized query language, callback registry, semantic type engine, or unbounded recursive expansion. Use the producer's existing file/input bounds; report bounded failure for cycles or unsupported shapes.

Conformance defines the narrow structural input port it needs. Consumer wiring passes the corresponding public facts; semantic recognition stays in Conformance, not in copied per-consumer scripts. No production package imports Foundation, OXC or TypeScript.

The existing `records.mjs` fact-coverage gate rejects `binding`/`reexport` rows before FMS or Conformance. Evolve that gate explicitly: retain the truthful legacy export observations, and accept a covered named composition binding only when the new public authoring-origin fact identifies the same file/export occurrence and proves its complete supported origin. An unmatched row remains incomplete. The exception applies only to the admitted entry/group surface; it does not relax `module-format`, unknown/star/cyclic origins, or use-case runtime-export completeness. No per-consumer origin catalog or blanket deletion of the old guard is allowed.

Evolve the current `ModuleLayoutRecords`/`checkModuleLayout` contract to require the needed authoring coverage for adopted module/group/root files and canonical contract maps. Do not add optional fields whose absence silently reports stronger checks as passed. Preserve the existing layout checks and metrics; module-file count still means source inventory count. New diagnostic names are finalized with rejecting fixtures, under the existing Conformance error/report mechanism.

## Slice A — Group and root membership

### Supported syntax

- Named imports (including `as` aliases), direct named exports, and finite named re-exports with retained origin. Resolve identity by binding, not by spelling `group` or a filename alone.
- `const` groups created by imported `group("segment", [members...])`; members are imported entries/direct child groups or calls to declared composition-adapter functions.
- The existing `createFeatureGroup(values)` recipe: one unconditional returned `group` with a fixed member list. Each selected `createEntry(values)` resolves to a named composition-adapter function whose single unconditional return is the direct `implement<Map>()(declarationBinding, factory[, scoped])` form. Its declaration resolves to one fixed imported declaration binding, never a parameter, computed value or condition; Host values may be captured only by the factory. Support this bounded source shape, not arbitrary interprocedural analysis. A fixed group call list alone is insufficient evidence that declaration selection is fixed.
- Root `modules` is an inline literal tuple or an unmodified same-file `const` literal list. A typed Assembly parameter may be used by a function or returned arrow exactly as the documented `createSessionsRoot` recipe does.
- Parentheses, `as const` and `satisfies` do not change identity. Read only the selected structural expressions; arbitrary logic inside the user factory is outside this syntax check.

Reject selected lists containing conditional/logical selection, spreads, computed members, array-building helpers, mutable aliases, reassignment, ambiguous/shadowed bindings, unsupported barrels, unresolved paths, or a composition adapter whose fixed return shape cannot be established. Namespace imports and `export *` are outside the initial supported subset. Bare package/path-alias resolution is not invented locally: use an existing qualified public resolver or report the selected target unsupported. Unrelated source syntax does not become an authoring violation merely because it is not in this grammar.

### Checks

1. Compare the independent source-file census with actual group members. An imported-but-unlisted module is missing; an unimported/unknown member cannot become valid through guessed naming.
2. A feature group lists its own entries and only its direct children's groups. Enforce the existing segment label and static membership rules.
3. Root module lists contain top-level feature groups, Host groups and root-owned Host entries. Importing an entry only for a root alias is not another owner.
4. Shared Host groups may be used by multiple roots; an ungrouped Host entry has one owning root. Preserve the existing distinction between ownership and selection.
5. Preserve duplicates and multiple ownership as violations; never repair them by deduplication. A dynamic low-level Assembly `composition` API remains supported outside the static CMS recipe; do not claim it conforms to this recipe.

Prove the canonical guide examples, including Host values and root aliases, before broadening syntax. The checker must not force the documented factory-capture recipe into a new runtime abstraction.

## Slice B — Contract-source parity

For each canonical feature contracts file, identify its exported descriptor union and descriptor-derived capability interface from observed declarations. Ambiguous pairings are unsupported; do not introduce a handwritten pairing registry. The canonical recipe contains one feature aggregate; helper port interfaces are not mistaken for capability maps.

Compare normalized binding-origin sets: each imported complete union and each own/explicit upward descriptor must occur in both representations. Expand only bounded same-file type aliases. Each imported union remains in a **separate** `CapabilitiesOf` base; own descriptors may share their own base. Aliased imports and identical repeated underlying contracts must not create false conflicts.

Keep typechecking responsible for exact value/revision compatibility. The source check neither infers behavioral compatibility nor replaces the checks in each source interface. Existing manual maps with extra properties, index/call/construct signatures or polymorphic `this` retain their accepted contract and are explicitly classified outside descriptor-recipe parity; they are not narrowed or silently labeled parity-checked. An unsupported expression inside a selected descriptor recipe is a failure, not such an exemption.

Negative proofs retain transitive, unused and private-child contracts. Never "fix" a disagreement by replacing separate bases with `CapabilitiesOf<AContracts | BContracts>`.

This slice qualifies the currently accepted identity/revision rule. If plan 04 later adopts token-keyed maps, its successor updates the relevant CMS rule, profile, examples and type-negative cases together: different exact revisions may coexist, while inconsistent values for the same `(id, revision)` still fail. Foundation's projection carries syntax and binding identity only; it never embeds either compatibility policy. One adopted policy applies to a consumer, without a feature flag or competing checker.

## Delivery sequence and target files

1. Freeze the bounded syntax/proof cases above against current guide examples and the selected real consumer. Record one scoped successor/amendment for the stronger development-check contract; preserve accepted ADR-0033/0036/0041 bytes. No new runtime authority is created.
2. In Foundation's own delivery, extend the source-dependencies OXC adapter/model/projection and `src/source-graph.ts`; add public packed tests and API documentation. Publish through its ordinary release route. The shared producer exposes facts only; it never knows GM group/module naming rules.
3. Review the exact released Foundation delta and FMS peer compatibility, then update GM's development pin and both real locks through the normal install route. A local archive may support labeled research, never completed installed qualification. No main dependency points at an unpublished checkout.
4. In GM, change `packages/conformance/src/features/layout/{types,check}.ts` and only small private helpers in that feature; update the root exports and README where the public type/report contract changes.
5. Extend the existing `tests/qualification/consumer-fixtures/source/` route and its installed producer/checker integration, including the exact fact-coverage transition above. Prove the named consumer surface through producer, coverage admission, FMS and Conformance together; calling only the pure checker with hand-built facts is insufficient. New maintained helpers/tests are `.ts`, strictly checked with TypeScript 7.0.2+. If `records.mjs`/`scenarios.mjs` receive substantial new responsibilities, migrate those changed files and their callers together; retain frozen syntax/evidence files.
6. Update current CMS/guide instructions, the fixture handoff, exact consumer pins and rejecting checks. Do not rewrite old source receipts or call a fixture-only pass a production adoption.

Only necessary config changes belong here: declared pins/locks, strict source inclusion, changed-file routing and the existing gate call sites. No new top-level quality framework or duplicated CI lane.

## Proof and acceptance

All semantic assertions use fixed independent expectations; generated observed records cannot be their own oracle.

| Proof | Required result |
| --- | --- |
| Public producer → pure checker on disk files | Valid flat groups, root aliases, Host groups and Host-value recipe pass without importing/executing subjects. A sentinel top-level effect remains unexecuted. |
| Conditional member; missing group member; bypassed parent | Each fails at the intended source-check stage/code, even when `prepare` can construct the selected runtime graph. Include a fixed `createEntry(values)` group call whose adapter selects between two declarations from `values`; it must not pass as static. |
| Alias/re-export provenance | Renamed named imports and finite public named re-exports preserve identity; shadowing, private bypass, ambiguous or star exports never become false green. |
| Installed coverage transition | The selected named composition re-export passes producer → coverage → FMS → Conformance; removing its complete origin fact, using a star export, or leaving a use-case export incomplete still rejects. |
| Coverage | Missing file/root, parse failure, unsupported selected form, missing syntax-fact row or cycle fails closed. The independent census and observed file identity must agree. |
| Contract parity | Lost union member, lost base, combined imported base and missing private-child/transitive source fail. Identical overlap and a supported manual map retain their intended status. |
| Type controls | Conflicting unused value/revision still fails before module selection; expected-valid code passes the repository's `typescript` and `typescript-minimum` aliases (both pinned to 7.0.2 at this baseline), including Conformance NodeNext/Bundler fixtures. No historical TS 5.x execution is selected. |
| Large current recipe | Reuse current N100/N500/N1000 subjects; measure added observation and ensure no omitted facts. Keep existing bounds and distinguish new results from ADR-0041 receipts. |
| Consumer smoke | Valid composition still produces its useful result with independent binding expectations; source-only success is insufficient. |

Use `node architecture/tooling/runtime/dev.ts install`, then the existing `bun run check:changed` route during edits. Focused GM checks are `bun run conformance:check`, `bun run assembly:typecheck`, and `node --test tests/assembly/consumer-fixtures.test.mjs tests/assembly/consumer-standard-examples.test.mjs` after their normal package builds. Update `tests/tsconfig.consumer-fixtures.json` for new helper coverage. Before handoff run `bun run check:fast` and `bun run check` on the final relevant source; retain required OS/Node CI lanes. Foundation runs its own published-package, strict type and normal required gates in its delivery.

### Real consumer route

Use an isolated checkout of Agent Runtime's interactive-session-runtime composition as the first real-source subject, observed at `f990acc26e1b8071ae22d0b87a2ddd3672be8e2e`. Its [group][ar-group] is static; its [root][ar-root] uses a named `internal.ts` re-export surface, and its [feature map][ar-contracts] currently lacks a complete exported descriptor union. Its [profile][ar-profile] pins CMS `b70ba39304ac71964175c42a77309406a7c30ca2`.

Review that pinned-standard delta first. Exercise the existing source unchanged to expose compatibility requirements; then qualify the smallest explicit authoring/profile migration with the existing Host test and typecheck, using local fakes and no provider subscription. An isolated copy proves only preliminary real-source compatibility. The future delivery also needs an actual bounded Agent Runtime consumer patch with the reviewed CMS pin, effective check command, rejecting fixture and consumer-owned required checks; retain its exact head and result. Enabling that check is a coordinated consumer change, not implicit permission to refactor its runtime. Older accepted syntax is not retroactively described as violating an unadopted revision. This planning PR does not activate any consumer gate. No contained-turn or plugin scope is selected.

## Migration, limits and effort

The stricter required records are a Conformance development-API break if the current public shape changes: ship a 0.x minor, the required `Better` / `Codemod` / `By hand` / `Check` migration block, and a codemod in the same delivery for any mechanical call-shape/import edits. Source selection and semantic membership repairs remain explicit hand edits. No dual old/new checker mode or feature flag. Released API baselines change only through the trusted release process.

Stop broadening when the canonical examples and selected consumer are covered. If implementation requires a general evaluator, duplicate resolver, parser callbacks or weakening complete-map conflicts, narrow/defer that extension. Missing upstream release or consumer evidence leaves this slice pending; do not report it as enforced.

| Area | Implementation LOC | Tests/fixtures LOC |
| --- | ---: | ---: |
| Foundation bounded public projection (both slices) | 350–650 | 450–800 |
| GM pure semantic checks and existing route integration | 450–750 | 550–1,000 |
| Selected real-consumer adoption | 80–200 | Included in its existing integration route; exact extra cases chosen after baseline |

Totals are estimates, not a quota; docs, locks and release coordination are separate. The earlier 450–900-line estimate omitted part of the required published producer seam. Confidence **7/10**, achievable reliability **8/10 within the declared syntax**, complexity **7/10**, value **9/10**. Slice A comes first; Slice B adds type facts and parity to the same seam, not a second tool.

[layout-types]: https://github.com/agent-teams-ai/get-modular/blob/5fb83478dd7b95216be92c4d3077eddf2774eef8/packages/conformance/src/features/layout/types.ts
[layout-check]: https://github.com/agent-teams-ai/get-modular/blob/5fb83478dd7b95216be92c4d3077eddf2774eef8/packages/conformance/src/features/layout/check.ts
[installed]: https://github.com/agent-teams-ai/get-modular/blob/5fb83478dd7b95216be92c4d3077eddf2774eef8/tests/qualification/consumer-fixtures/source/installed.ts
[adr41]: https://github.com/agent-teams-ai/get-modular/blob/5fb83478dd7b95216be92c4d3077eddf2774eef8/docs/decisions/0041-preserve-complete-feature-maps-with-descriptor-unions.md
[foundation-api]: https://github.com/agent-teams-ai/engineering-foundation/blob/23b5a885ba46a2b43b5715ce82db28fcf04f2175/packages/engineering-foundation/src/source-graph.ts
[foundation-producer]: https://github.com/agent-teams-ai/engineering-foundation/blob/23b5a885ba46a2b43b5715ce82db28fcf04f2175/packages/engineering-foundation/src/capabilities/source-dependencies/application/use-cases/observe-source-graph.ts
[ar-group]: https://github.com/agent-teams-ai/agent-runtime/blob/f990acc26e1b8071ae22d0b87a2ddd3672be8e2e/packages/apps/embedded-runtime/src/features/interactive-session-runtime/composition/interactive-session-runtime.group.ts
[ar-root]: https://github.com/agent-teams-ai/agent-runtime/blob/f990acc26e1b8071ae22d0b87a2ddd3672be8e2e/packages/apps/embedded-runtime/src/composition/interactive-session-host.root.ts
[ar-contracts]: https://github.com/agent-teams-ai/agent-runtime/blob/f990acc26e1b8071ae22d0b87a2ddd3672be8e2e/packages/apps/embedded-runtime/src/features/interactive-session-runtime/composition/interactive-session-runtime.contracts.ts
[ar-profile]: https://github.com/agent-teams-ai/agent-runtime/blob/f990acc26e1b8071ae22d0b87a2ddd3672be8e2e/architecture/get-modular/consumer-profile.json
