# Module entries spike (S0), 2026-10

Research only. This directory holds the results and the scripts of phase 0 of the Get Modular 0.5.0 train (plan:
`research/module-dx-2026-10/0.5.0-train.md`, "Phase 0: spike"). It changes no package: the prototype of entries and
groups is a patch (`prototype.patch`) that the scripts apply to a disposable checkout, and P1a rewrites it.

Base: `bfb7cff`. Toolchain: Node 26.11.1, pnpm 11.20.0, TypeScript 7.0.2 (`typescript`) and 5.8.3 (`typescript-minimum`),
oxlint 1.83.0 and 1.88.0 (latest stable on 2026-10-15), git 2.38.1 and Apple Git 2.39.5.

## Re-verified before start (2026-10-15)

- npm `latest` and `next`: core and assembly 0.4.0, conformance 0.2.0; resources `latest` 0.1.0 with no `next`;
  `@agent-teams/feature-module-standard` is not on npm (404).
- `main` was `7d6535d`, then `bfb7cff` (the plan filing, documents only); no changeset of another track. Open pull
  requests: #153 and #154 only. ADR-0036 and ADR-0037 are free.
- Budget row: running today's `fragmentSource` at 500 modules gives exactly 542,562 instantiations and 104,500 types
  (tsc 7.0.2). TS 5.8.3 baseline, measured first: 715,455 instantiations and 96,060 types.
- oxlint latest stable is 1.88.0. Resources `scoped` has the signature the plan cites.

## 0A Runtime and types

Prototype in `prototype.patch` (assembly: `implement`, `input`, `group`, `entriesOf`, `prepare({ modules })`; conformance:
`smoke` rebuild, `isolate(entry)`). `prepare-workspace.mjs` builds a checkout with and without it.

Type cost, 20 groups, declarations in files separate from the entries, `--singleThreaded` on tsc 7
(`type-cost.mjs`; NodeNext and Bundler give identical counters):

| Compiler | Modules | Today (one file) | Today (split files) | Entries and groups (split files) | Delta vs gated or baseline |
| --- | --- | --- | --- | --- | --- |
| tsc 7.0.2 | 500 | 542,562 inst / 104,500 types (gated) | 553,682 / 108,748 | 533,687 / 106,654 | -1.6% inst, +2.1% types |
| TS 5.8.3 | 500 | 715,455 / 96,060 (baseline) | 686,352 / 96,230 | 682,144 / 94,136 | -4.7% inst, -2.0% types |
| tsc 7.0.2 | 1,000 | 1,051,998 / 177,956 | 1,075,118 / 186,229 | 1,034,123 / 181,660 | -1.7% inst |
| TS 5.8.3 | 1,000 | 1,420,303 / 173,516 | 1,362,700 / 173,711 | 1,352,992 / 169,142 | -4.7% inst |

Growth from 500 to 1,000 is linear. The tuple rule for `members` and `modules` is inside these numbers (the plan allowed 1%).

Finding that changes the API text: the first formulation, where `prepare` re-derived the used keys from the union of all
entries (`EntriesOf` over the group types), measured 569,475 instantiations (+4.96%) on tsc 7 and 755,455 (+5.59%, over
budget) on TS 5.8.3. Giving `ModuleGroup` a phantom second parameter `K`, the union of the keys its entries use,
computed once when `group` is called, removed the cost. P1a keeps `ModuleGroup<E, K>`. An entry also carries the used part
of its map in its brand detail, which `isolate` reads; that costs nothing measurable.

Positive and negative type cases (`negatives/`, run by `negatives.mjs` on both compilers and both resolutions; every case
gives the same codes in all four runs):

| Case | Result |
| --- | --- |
| `positive.ts`: tuple of groups in the `profileId` form; `composition` form with an annotated array; nested groups; `scoped` as adapter; `isolate(entry)` deps typed; literal module ids readable from a group type (`EntriesOf<G>["declaration"]["moduleId"]`) | compiles |
| n01 factory reads `resources` without the adapter | TS2339 in the module file (today TS2345 in the root) |
| n02 two feature maps disagree on a contract | TS2320 |
| n03, n14 module list shares no key with the Host map (flat and nested group) | TS2322 from the weak-type check, not the named `KnownCapabilities` error (follow-up F-5) |
| n04, n13 contract revision differs from the Host map (flat and two groups deep) | TS2322 at the `modules` argument |
| n05 annotated list in the `profileId` form | TS2322 (rejected); n12 annotated array in the `composition` form compiles |
| n06 input entry in `modules` | TS2322 |
| n07, n08 annotated members, junk member in `group` | TS2345 ("parameter of type 'never'": the message is poor) |
| n09 wrong `isolate` dependencies | TS2322 |
| n10 declaration uses a contract its feature map lacks | TS2345 |
| n11 third argument that is not a `ContextAdapter` | TS2345 |

Runtime (`converted/entries.test.mjs`, 14 tests, all pass): frozen null-prototype entries and groups, a copied entry is not
authentic, snapshot at `implement`, adapter called once with the implementation id, `scoped` as adapter, name, member,
kind and depth validation (16 levels pass, the 17th throws), order and nesting do not change profile, plan or digest,
duplicates list every occurrence, forged group, input entry in `modules` and root outside `modules` keep
`handles`, `input-handles` and `roots`, `groupPath` on unresolved bindings, the 4096 ceiling counts group nodes, a revision
mismatch is rejected through Core.

Hand-converted `tests/assembly/preparation.test.mjs` and its fixture (`converted/`): all seven tests pass with the same data.
Deliberate differences, marked "S0:" in the file: an entry reached twice or two entries with one implementation id now fail
with `assembly.prepare.duplicate-module` (the original only asserted failure); one input entry under two aliases is a
duplicate module (was `input-handles`). No other drift.

`smoke`: the rebuild is 25 lines of code plus a 4-line check that `compose` returned a preparation its api produced, about
30 in total (limit 60). It uses only `implement`, `group` and the public fields of entries and groups; Assembly has no
hook. The real `prepare` runs first, so a forged entry fails exactly as in production (tested); a root that prepares through
another api fails with `conformance.smoke.failed` (tested). `isolate(entry, { dependencies })` needs no `api` and no
`scoped`. Conformance now imports `implement`, `group` and `assemblyFor` as values, so one copy of Assembly must resolve.

Open for P1a: `group` wider than 4096 throws `assembly.bind.invalid-group` in the prototype (the plan names only depth);
`entriesOf` is generic in the prototype; the path reported for an input entry in `duplicate-module` is `["(inputs)", alias]`.

## 0B Codegen of group lists against hand-written groups

`merge-experiment.mjs`: disposable Git repository per run, feature `orders` with 12 modules in the decision-1 layout, K
branches from one base, 10 seeds per K, variants M1, M2, G2, G3 as the plan fixes them, plus M4 (informational, outside the
rule: M1 with a blank line between lines). Conflicts are resolved the only mechanical way (keep both sides); a result
that differs from the intended state is "invalid" and repaired by hand in the model. After every merge the verifier's
verdict was cross-checked with `tsc`: no disagreement (pins in the oracle part are strings, so only the group and the
contracts are visible to the compiler).

Merges with a textual conflict (conflicted / merges), any file counted:

| Variant | K=3 | K=6 | K=10 | Where the conflicts are (K=10) | Keep-both result invalid (K=10) | Invalid after a clean merge (K=10) |
| --- | --- | --- | --- | --- | --- | --- |
| M1 hand-written | 7/30 (0.23) | 28/60 (0.47) | 55/100 (0.55) | group 55, oracle 51, contracts 16 | 22 of 55 | 0 |
| M2 M1 + `merge=union` | 0/30 | 0/60 | 0/100 | none reported | n/a | 22 of 100 (7 at K=6, 2 at K=3) |
| G2 group generated | 4/30 (0.13) | 25/60 (0.42) | 51/100 (0.51) | oracle 51, contracts 16 | 18 of 51 | 0 |
| G3 group and oracle generated | 0/30 | 6/60 (0.10) | 16/100 (0.16) | contracts 16 | 0 of 16 | 0 |
| M4 spaced lines (informational) | 7/30 | 27/60 (0.45) | 50/100 (0.50) | as M1 | 25 of 50 | 0 |

Invalid cases are removed or renamed modules whose line comes back, duplicate lines and imports of deleted files. Files per
module add (K=3): M1 2 new and 2.4 edited; G2 2 new, 1.4 edited; G3 3 new, 0.4 edited, plus one generator run before every
typecheck, test and editor session, one build step and one CI step. A branch that adds a module but forgets the group line:
the orphan check detects it in M1, M2 and M4 (tested in every run); it cannot happen in G2 and G3.

The run is deterministic: git 2.38.1 (with tsc cross-check) and Apple Git 2.39.5 produce the same digest of all runs
(`dbd8806bc1f5294b`). No second machine was available; a second operating system would be a CI job (the scripts
need only node and git).

Verdict by the rule written before the run:

- (a) Best hand-written variant with zero invalid merges is M1 (M2 has silent invalid merges, 22% at K=10, so it is not
  recommended). G2 does not reach half of M1's share (0.42 against 0.47 at K=6, 0.51 against 0.55 at K=10). G3 does
  (0.10 against 0.47 and 0.16 against 0.55, about a fifth to a third) with zero invalid merges.
- (b) is a cost judgment the measurement does not make. The cost: a generator step before every typecheck, test and editor
  session in every consumer, a vendored script or a new CLI package (a new admission; a leaf package may not carry `bin`).
  G3's gain comes from two generated files together (group and oracle aggregation); G2 alone gains nothing.
- My recommendation, labeled as my judgment: do not select codegen for 0.5.0. Ten agents adding to one 12-module feature in
  parallel is beyond the split signal (about 12 modules), where the guide already says to split; at K=3 M1 conflicts in 23%
  of merges and 60% of conflicts are resolved by keeping both sides. Hand-written groups plus the orphan check, and no
  `merge=union` recommendation (22% silent invalid merges). If the owner weighs the 0.16 against 0.55 at K=10 more
  heavily, the decision selects G3 and the plan's "If 0B selects codegen" section applies.

## 0C Own-property port check

`port-check/port-check.mjs` (34 lines): walks the prototype chain of an object-valued capability, stops at intrinsic
containers of this realm and at a foreign `Object.prototype`, reports function-valued data properties and accessors other
than `constructor`, reads descriptors only. `Array.isArray` is checked first because it holds across realms.
`port-check.test.mjs` covers the cases the plan names, including that no getter runs and that a Proxy trap runs. Known
limit found: a Map or Date of another realm (a `vm` context) is flagged, because only this realm's prototypes are captured.

Counts (`hook-loader.mjs` wraps `assemblyFor` through Node module hooks and reports what runs create; nothing under
`node_modules` is edited):

| Consumer | Distinct capability values | Objects | Hits | Class |
| --- | --- | --- | --- | --- |
| Get Modular fixtures (assembly, conformance, resources tests) | 30 | 21 | 0 | n/a |
| TEST at `695b91f` (`node --test`, 189 tests pass) | 10 | 10 | 0 | n/a |
| agent-runtime at `4d8a5ff30`, both roots (`ordinary-runtime-assembly` and `runtime-setup-assembly` tests) | 20 | 17 | 1 | class port |
| Observation sketch v3 of #153 (`observation-sketch.mjs`: reader, port, sync and derived participant, snapshot) | 5 | 5 | 0 | n/a |

The one hit is `PostgresOrdinaryOperationStore` (`agent-runtime/ordinary/store/postgres`), a class port with eight
prototype methods; the module must wrap it in a port object (P7b). No legitimate data-valued capability was flagged, so the
stop condition does not apply. The agent-runtime checkout is at `4d8a5ff30` (a commit with a built `dist`), not at `main`;
two of its tests that need pnpm tooling fail for reasons unrelated to the probe. The module instance may stay a class
(`new Greeter()` in the sketch is the `instance`; only the plain object over it is a capability).

## 0D ADR drafts

`adr-drafts.md`: ADR-0036 and ADR-0037 with the phase 2 deltas applied, the measured numbers in place of the lost
prototype's, and the points left open for P1a. Drafts only.

## 0E oxlint probes

`oxlint-probe.mjs`, results in `oxlint-results.json`, on 1.83.0 and 1.88.0 with identical outcomes. 136 files per run (the
declaration allow-list, the `@get-modular/*` ban in the four non-composition roles, the size overrides, at feature depths 1
to 4, plus a file outside `src/features`): 0 mismatches. Exit code 1 with errors; the warning-level rule exits 0 and with
`--deny-warnings` exits 1.

- Allow-list with the basename negation `!*.contracts.js` and `!*.contracts.ts` admits: `@get-modular/assembly` for
  `declareModule`, `@get-modular/core` for `required`, `optional`, `many`, own, sibling, child, parent descriptor files and
  seven levels up, at depths 1 to 4. It rejects `./checkout.module.js`, `node:fs`, a use case, `implement`,
  `compileComposition`, `@get-modular/resources`, a port type and another module's declaration file, with
  `eslint(no-restricted-imports)` and messages such as `'implement' import from '@get-modular/assembly' is restricted
  because only declareModule import(s) is/are allowed.` The known holes pass (`../adapters/outbound/evil.contracts.ts`,
  `some-pkg/thing.contracts.js`); `checkModuleLayout` closes them.
- Size: a module file of 80 counted lines passes with 40 blank and comment lines added, 81 fails; other files 300 and 301;
  functions 60 and 61 lines; four and five parameters; a 400-line `*.test.ts` is excluded.
- QN6: override globs of a preset that a consumer `extends` from `./node_modules/@get-modular/conformance/oxlint.json`
  match the consumer's own paths, on both versions, also through a pnpm-style symlinked package. Globs are matched against
  the consumer's root config, so the preset must use `**/features/**/...`: `src/features/**/...` matches the consumer's
  `src/` but not `packages/x/src/features/...`. The preset can ship in P1b, written with `**/features/**` globs.
- The declaration allow-list works on the latest stable, so the stop condition does not apply, and TEST need not pin an
  older oxlint.

## Gates and scripts

The repository gate keeps executable files below `packages/`, so the scripts are stored with a `.txt` suffix, as the other
research directories do. Materialize a runnable copy first:

```text
cp -R research/module-entries-2026-10 /tmp/s0 && cd /tmp/s0
find . -name '*.txt' | while read f; do mv "$f" "${f%.txt}"; done
```

All scripts take `--workspace` or `--oxlint` and write only to temporary directories (`prepare-workspace.mjs` finds the
repository through the directory of the materialized copy, so pass `--repo <checkout>` there). Run, in this order:
`node prepare-workspace.mjs --dir D0` and `--dir D1 --prototype`; `type-cost.mjs --workspace D0 --variant today`
(and `today-split`) then `--workspace D1 --variant entries`; `negatives.mjs --workspace D1`;
`run-prototype-tests.mjs --workspace D1`; `merge-experiment.mjs --tsc D1`; `oxlint-probe.mjs --oxlint <binary>`;
`node --test port-check/port-check.test.mjs`.

## Questions for the coordinator

1. 0B: accept "no codegen in 0.5.0" or select G3 (see the verdict).
2. P1a: the three open points of 0A (group width code, generic `entriesOf`, input path in `duplicate-module`).
3. P1b: the preset ships (0E); AR's `PostgresOrdinaryOperationStore` needs a port wrapper in P7b.
