# OBS-3 brief: the configuration rule in the Consumer Module Standard

PR title: `docs(architecture): add the settings and change observation rule to the consumer standard`.
Documentation, one compiled example and one pinned digest. Base: `main`.

Authority: ADR-NNNN sections "Configuration rule", "Contract", "Signals and
scheduling" and "Mechanism and authority".

## Re-verify before start

1. `git fetch origin`; record `origin/main`. OBS-2 is merged
   (`packages/observation` exists and `pnpm observation:check` passes) and
   train 2's T2-5 is merged (the standard is revised for 0.4.0). Either
   missing: stop. Writing this rule against the 0.3.0 text would make every
   consumer review the standard twice.
2. REL-2 is not merged yet. The AR-3 and TEST-2 follow-ups of train 2 move
   consumer pins to "the T2-5 commit"; if they have not started, ask the owner
   to point them at this PR's merge commit instead, so consumers review the
   standard once. If they already moved their pins: note it in the PR body; the
   consumers move again in their next pin review.
3. Read the current standard (`docs/architecture/common-assembly.md`): the
   section "Module resource scopes", the section "Module packages and
   contracts" (the paragraph that lists error code prefixes) and the section
   "Executable examples". Note their current line ranges.
4. `tests/assembly/consumer-standard-examples.test.mjs` still compiles the
   examples marked `<!-- consumer-standard-example: <name> -->` with
   placeholders and symlinked workspace packages; the current CMS digest
   literal is pinned in `tests/ownership-checkpoint.test.mjs`. Otherwise stop
   and report.
5. Node per `.node-version`; `pnpm install --frozen-lockfile`.

## Scope and non-goals

Scope: one new section of the standard, one line in the error code paragraph,
one example and its placeholder, the digest literal, the observation README link
back to the standard. Non-goals: package source, gates, ADRs, any rewording of
other sections.

## Steps

### 1. New section

Insert `### Settings and change observation` directly after the section
"Module resource scopes" (before "Dynamic instances"). Text:

````markdown
### Settings and change observation

[ADR-NNNN](../decisions/NNNN-admit-the-module-change-observation-package.md)
admits `@get-modular/observation` for modules that consume an in-process keyed
source. Reading durable authority per operation, as a database or an
append-only store gives it, stays valid and needs none of this.

1. **Read at construction.** A module receives the source's `Reader` as an
   ordinary dependency and calls `read(keys)` in its factory. The snapshot is
   immutable and carries a revision. A module that never needs changes stops
   here.
2. **Opt in with one participant.** A module that must follow changes provides
   one participant capability, built with `sync({ initial, apply })` or
   `derived({ keys, derive, apply, fail })` from the product's
   `participantsFor<Record>()`. Pass the construction snapshot as `initial`;
   a commit between the read and the subscription arrives as one catch-up.
   `apply` is synchronous, returns `undefined` and is idempotent: a revision is
   a commit number, not proof that a value changed.
3. **Modules that do not opt in are untouched.** They keep their construction
   values. A change that must reach them is a Host reconstruction with a new
   identity, never an in-place mutation.

Rules for module code:

- Participants are data. No lifecycle methods, base classes or discovered
  hooks; the hub is the only subscriber.
- Callbacks never throw on purpose and never return a value. A listener added
  to the `AbortSignal` that `derive` receives must not throw; the platform
  reports it as an uncaught error.
- `derive` honours its signal. A run that ignores it keeps running after the
  module's providers closed; escalation reports it as a debt, nothing stops it.
- The module-owned subscription (`createLatestDerivation`) is an escape hatch
  for a module that cannot express its work as a participant. Its settlement is
  reported by the module.

Rules for the Host:

- The Host owns `commit` and `seal`. Feeders keep the identity of unchanged
  values or compare before `commit`.
- One hub per source and event family. Participant identifiers are the
  implementation ids of the declarations that provide the participant
  capability, in the order of the composition's binding for that slot.
- The hub takes a `Resources` facet. Shutdown is `seal()`, then the close of
  the hub's scope with `escalate` and `abandon` driven by timers that keep the
  process alive (`AbortSignal.timeout()` does not).
- Each participant's first outcome is an input to readiness; the Host decides
  readiness.
- Install one copy of `@get-modular/observation` and of its peer
  `@get-modular/resources`.

<!-- consumer-standard-example: observation -->
```ts
// Product, once:
export const settings = participantsFor<AppSettings>();

// Module factory:
export function greeterFactory(deps: { readonly settings: Reader<AppSettings> }) {
  const initial = deps.settings.read(["locale", "greetingStyle"]);
  const greeter = new Greeter(initial.values.locale, initial.values.greetingStyle);
  return {
    instance: greeter,
    capabilities: {
      "greeting/greeter": { greet: (name: string) => greeter.greet(name) },
      "settings/participant": settings.sync({
        initial,
        apply: ({ values }) => greeter.configure(values.locale, values.greetingStyle),
      }),
    },
  };
}
```
````

Copy the text between the four-backtick fences exactly (the inner `ts` fence
belongs to the standard). If train 2 changed how factories return capabilities
(T2-4/T2-5), adapt only the example's return shape to the current standard's
other examples and say so in the PR body.

### 2. Error codes

In "Module packages and contracts", the paragraph that lists
`assembly.<area>.<reason>`, `resources.<area>.<reason>` and the conformance
codes: add `observation.<area>.<reason>` in the same style.

### 3. Example placeholder

`tests/assembly/consumer-standard-examples.test.mjs`: add `"observation"` to the
symlinked package names and a placeholder:

```js
  observation: `import { participantsFor } from "@get-modular/observation";
import type { Reader } from "@get-modular/observation";
type AppSettings = { readonly locale: string; readonly greetingStyle: "plain" | "formal" };
declare class Greeter {
  constructor(locale: string, style: "plain" | "formal");
  greet(name: string): string;
  configure(locale: string, style: "plain" | "formal"): undefined;
}
`,
```

### 4. Digest and links

- `tests/ownership-checkpoint.test.mjs`: replace the CMS digest literal with
  `sha256sum docs/architecture/common-assembly.md` of the new file.
- `packages/observation/README.md`: link the new section.

Commit: `docs(architecture): add the settings and change observation rule to the consumer standard`.
Gates, each exit 0: `pnpm docs:protocol:check`,
`node --test tests/assembly/consumer-standard-examples.test.mjs`,
`pnpm ownership:checkpoint:test`, `pnpm governance:check`, then after the
commit the full `pnpm check` with the no-hooks git config of OBS-1.

## Risks and stop conditions

| Risk | Stop / action |
| --- | --- |
| T2-5 not merged | stop (re-verify 1) |
| the example does not compile on one compiler | fix the example or the placeholder; never exclude the example |
| `sdk-growth` or another check pins the CMS bytes besides the checkpoint literal | stop and report; T2-5 recorded only the checkpoint literal as following the working tree |
| a consumer pin review is already running against the T2-5 commit | note it in the PR body; no change to consumer repositories here |

## Must not

- Reword other sections, change package source or gates, edit an accepted ADR.
- Merge, request reviewers or comment outside the own PR. Override the git
  identity, add co-author trailers or tool attribution.

## Done

The section, the error code line, the compiled example, the new digest and the
README link are on `main`; all gates green locally and in CI.

## Review checklist

- `git diff --stat origin/main...HEAD`: the standard, the example test, the
  checkpoint test, the observation README; nothing else.
- The section text equals this brief's text except approved edits; every rule
  matches ADR-NNNN (open both).
- Mutation: rename `read` to `get` in the example -> the example test fails.
