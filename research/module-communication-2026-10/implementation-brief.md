# Implementation brief: `@get-modular/observation` 0.1.0

<!-- cspell:words microtasks -->

This brief is for the implementer of the package. It replaces the observation execution briefs of pull request #153,
which describe the earlier hub design.

## Sources of truth

1. ADR-0034, "Admit the module change observation package". It holds the normative decision, the admission
   evidence and the known items.
2. `raw/api-design/b-snapshot/`:
   - `api.d.ts.txt` and `testing.d.ts.txt` are the exact public types;
   - `README.md` is the package README to start from;
   - `RATIONALE.txt` explains each name and parameter;
   - `CMS-RULE5-DRAFT.txt` holds the Consumer Module Standard wording.
3. `raw/api-design/runtime/` and `raw/api-design/runtime-b/` hold the prototype engine and its probes. The prototype
   is evidence, not code to copy as is.
4. `raw/api-design/tasks/`, `raw/api-design/reference/` and `raw/api-design/tools/` hold the writer tasks, the
   reference and negative solutions, and the behavior gate.

If an ADR sentence and the types disagree, the ADR wins. Report the difference.

## Deliverables, in one pull request

1. `packages/observation`:
   - root export and `./testing`, with the ADR-0012 carrier shape for both;
   - peer `@get-modular/resources` only, and no `dependencies`, `optionalDependencies` or `devDependencies`;
   - no static import of a Node built-in. `AsyncLocalStorage`, `setImmediate` and the `./testing` monotonic clock are
     reached through `process.getBuiltinModule` at load, with the fallbacks in the ADR.
2. Leaf admission:
   - a row in `architecture/checks/leaf-packages.mjs` after resources;
   - the export-map checks admit exactly the root and `./testing` for this row only;
   - the leaf build requires `dist/testing.js` and `dist/testing.d.ts`.
3. Tests, as listed under "Admission evidence" in the ADR:
   - the type probes on 5.8.3 and 7.0.2, NodeNext and Bundler;
   - the runtime probes on every supported Node line in the Linux, macOS and Windows lanes;
   - the mutation check: one patched copy per defect, never a switch in shipped code;
   - the writer task references and negative controls against the package build;
   - subprocess tests for fail-fast exits, a throwing abort listener and a throwing `reportError`;
   - a packed-root test that also checks that the root and `./testing` share one internal module instance.
4. Consumer Module Standard, in the same pull request:
   - rules 5, 6 and 11 as worded in the ADR;
   - the `observation.<area>.<reason>` code namespace;
   - the `./testing` import rule in the oxlint snippet, with a fixture it rejects;
   - update the existing live pins to the reviewed Standard bytes; preserve the frozen SDK-growth observation at
     `architecture/sdk-growth/evidence/consumer-module-standard.json`, as the rewritten ADR requires.
5. The `Resources.signal` documentation in resources states that it also aborts when the constructing run is
   cancelled before the factory settles, and that subscriptions bound to it detach then.
6. A module communication section in `docs/guides/module-authoring.md`, built from
   `raw/practices/practices-catalog-v2.md` and linked from the Standard.
7. A changeset for `@get-modular/observation` 0.1.0 (minor).

## Regression cases to carry into the package

The independent review of pull request #182 found four gaps after the original suite passed. The corrected
prototype and selected B types include these cases; retain them when implementing the package:

- Echo and cascade detection through nested microtasks started by `onResult` and `onError`, with result freshness
  checked when the callback is delivered, and no false echo from work after that delivery task. Queued callbacks
  count as pending deliveries; cancelling them after the loader settled must not create a still-running load debt.
- A real testing deadline when fake global timers and the global clock are installed before import.
- Rejection of a named property combined with an infinite template index signature, on both supported compilers.
- Synchronous echo detection at the start of a loader when `AsyncLocalStorage` is unavailable.

See [the dated correction record](raw/api-design/corrections-2026-10-17/README.md) for the executable cases and
verification. Prototype evidence does not replace the package and packed-artifact admission gates above.

## Remaining implementation notes

- Carry over the abort-listener rule from the first observation research
  (`research/observation-hooks-2026-10/sketch-v4-known-defects.md`) where it still applies.

## Acceptance

- Every item of "Admission evidence" in the ADR passes, and `pnpm check` is green on the final commit.
- An independent review of the pull request passes.
- The bounded TEST consumer runs on the release archives before the release pull request merges, as the ADR
  requires.

## Out of scope

Events, a contribution registry, selectors, a multi-store watch, the `readonly(keys)` projection and
`Resources.path`. These are known items or later additions, each with an owner and a trigger in the ADR.
