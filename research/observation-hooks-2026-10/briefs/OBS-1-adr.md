# OBS-1 brief: accept the observation ADR and resolve OD-007

PR title: `docs(architecture): accept ADR-NNNN for module change observation`.
Documentation, decision registry and the open-decision record only. NNNN is the
next free ADR number at creation time.

## Re-verify before start

1. `git fetch origin`; record `origin/main`. `ls docs/decisions/` and
   `gh pr list --repo agent-teams-ai/get-modular --state open` (read the titles
   for "ADR"): take the next free four-digit number that no file and no open PR
   uses. Train 2 takes "the next free number" too (its T2-1 brief); whichever PR
   is created first owns the number, the other one re-checks. Write the number
   everywhere below in place of `NNNN`.
2. OD-007 is active on `main`: `docs/open-decisions/OD-007-module-change-observation-package.md`
   has `status: open`, `docs/traceability/module-system-v1.yaml` has
   `implementationBlockers: [OD-007]` and `publicationBlockers: []`. Anything
   else: stop and report.
3. Accepted ADRs that this ADR cites are still accepted and unchanged in meaning:
   0003, 0009, 0012, 0015, 0017, 0019, 0025, 0026, 0029, 0030, 0031, 0033. If
   one was superseded: stop and report.
4. The owner decisions below match `research/observation-hooks-2026-10/briefs/README.md`
   section "Owner decisions". Any difference: stop.
5. Node per `.node-version`; `pnpm install --frozen-lockfile` in your own
   worktree. `pnpm docs:info` lists type `adr` with identity `adr-four-digits`.
   (`pnpm docs:new --help` exits 2 by design.)
6. This PR is documentation and may land before train 1 is released. It adds no
   package root, leaf row or changeset.

## Owner decisions (facts)

- 2026-10-01: a Get Modular package, library-first; one hub per event family
  with opaque, data-only participants (`sync` and `derived`) and a
  module-owned subscription as an escape hatch; modules stay factories, not
  classes; first proof on a TEST consumer, with no production consumer in the
  same delivery (an explicit owner exception); public `0.x` from the first
  release.
- 2026-10-08: OD-007 is not a publication blocker; the package depends on
  `@get-modular/resources` as a declared peer (as conformance does under
  ADR-0033), not through a structural port; 0.1.0 contains `sync`, `derived`
  and the escape hatch; the track runs in parallel with train 2 after train 1
  is released, and 0.1.0 is released together with train 2 (REL-2).

The ADR text is approved by the owner in this PR before acceptance. Anything
this brief does not cover: stop and ask.

## Scope

- Create the ADR with `pnpm docs:new` and insert the body below.
- After the owner approves the text: acceptance metadata, registry entry, index
  line, ownership checkpoint pin (precedent: PR #140), and the resolution of
  OD-007 (precedent: OD-006 resolved by ADR-0021).

Non-goals: no package source, leaf row, changeset, gate, CI or CMS edit; no
edit to any accepted ADR.

## Steps

### 1. Create (status proposed)

```sh
pnpm docs:new --type adr --id ADR-NNNN --title "Admit the module change observation package" \
  --owner architecture \
  --summary "Admits @get-modular/observation as an optional public package for in-process settings sources and opt-in change participants, with resources as its only peer, and resolves OD-007." \
  --dry-run
```

Review the destination
(`docs/decisions/NNNN-admit-the-module-change-observation-package.md`), the
metadata and the diagnostics, then repeat with
`--apply --expect sha256:<digest from the dry run>` and identical other
arguments. Replace the template body with the text in "ADR body" (everything
from `# ADR-NNNN` on). Set `related:` to OD-007, ADR-0003, ADR-0009, ADR-0012,
ADR-0015, ADR-0017, ADR-0019, ADR-0025, ADR-0026, ADR-0029, ADR-0030, ADR-0031,
ADR-0033. Keep every other front matter field the tool wrote.

Commit 1: `docs(architecture): propose ADR-NNNN for module change observation`.
Gates, each exit 0: `pnpm docs:protocol:check` (fix cspell by rewording or by
adding real words to `.cspell.json`), `pnpm governance:check`.

Open the PR as a draft and ask the owner to approve the text. Changes the owner
asks for go in new commits.

### 2. Accept and resolve OD-007 (only after the owner's explicit approval in the PR)

1. ADR front matter: `status: accepted`, `approved_by: product-owner`,
   `accepted_at: <YYYY-MM-DD of approval>` (same key order as ADR-0033).
2. `pnpm exec agent-teams-foundation architecture-decisions-promote-baseline --consumer .`
   appends the registry entry to `architecture/decisions/accepted-decisions.json`
   (never edit that file by hand). The diff is one appended object
   `{ id, path, immutableDigest }`.
3. `docs/decisions/README.md`: add
   `- [ADR-NNNN: Admit the module change observation package](NNNN-admit-the-module-change-observation-package.md)`
   as the first item under "## Accepted decisions".
4. `tests/ownership-checkpoint.test.mjs`: append
   `{ id: "ADR-NNNN", path: "docs/decisions/NNNN-admit-the-module-change-observation-package.md", immutableDigest: "<value from the registry>" }`
   to the array of decisions after the checkpoint base (the block that ends
   with the last accepted ADR).
5. OD-007 (`docs/open-decisions/OD-007-module-change-observation-package.md`):
   front matter `status: resolved`, add `resolved_by: ADR-NNNN` right after
   `status` (as in OD-006), add `ADR-NNNN` to `related`. Replace the body of
   "## Resolution" with:

   ```markdown
   Resolved by accepted [ADR-NNNN](../decisions/NNNN-admit-the-module-change-observation-package.md)
   on <YYYY-MM-DD>. It selects option A with the owner decisions of 2026-10-01
   and 2026-10-08: resources is a declared peer instead of a structural port,
   0.1.0 contains `sync`, `derived` and the escape hatch, and the package is
   released with train 2. OD-007 never blocked publication.
   ```

   Leave every other section of OD-007 unchanged.
6. `docs/open-decisions/README.md`: move the OD-007 line from "## Active" to
   the top of "## Resolved", and restore the Active text to
   `None. The separate proposed dependency and custody ADRs retain their own gates.`
7. `docs/traceability/module-system-v1.yaml`: `implementationBlockers: []`.
   `decisionCatalog` keeps OD-007; `publicationBlockers` stays `[]`;
   `architecture/decisions/open-decision-history.json` is unchanged.

Commit 2: `docs(architecture): accept ADR-NNNN for module change observation`.
Gates, each exit 0: `pnpm docs:protocol:check`, `pnpm foundation:check`,
`pnpm ownership:checkpoint:test`, `pnpm governance:check`,
`pnpm governance:test`, then after the commit
`GIT_CONFIG_GLOBAL=<file with only a [user] section> pnpm check` (create it with
`printf '[user]\n\tname = %s\n\temail = %s\n' "$(git config user.name)" "$(git config user.email)" > <tmp>/gitconfig-nohooks`;
a global git hook breaks the fixture tests that create repositories).

Mark the PR ready. Body (English, plain): what the decision admits, that it
resolves OD-007, "implementation follows in OBS-2 (package) and OBS-3 (Consumer
Module Standard)", and the owner approval reference.

## ADR body

````markdown
# ADR-NNNN: Admit the module change observation package

## Context

Modules read settings when they are constructed and some of them must react
when a setting changes. Get Modular gives them no shared way to do either, so
every module that needs it invents its own subscription, and every Host its own
fan-out, with different rules for errors, ordering, stale results and shutdown.
Studied systems show where that leads: subscribers that silence each other,
asynchronous results that overwrite newer ones, readiness flags that mean
different things, listeners that accumulate, and notifications that run before
the new state is consistent.

OD-007 recorded the owner's direction on 2026-10-01: an optional public Get
Modular package; one hub per event family with opaque, data-only participants
and a module-owned subscription as an escape hatch; modules stay factories, not
classes; a disposable TEST consumer as the first proof; public `0.x` from the
first release. On 2026-10-08 the owner classified OD-007 as no publication
blocker, chose a declared peer on `@get-modular/resources`, kept `sync`,
`derived` and the escape hatch in 0.1.0, and placed the package next to train 2.
The research, its evidence, errata and the known defects of the last sketch are
archived in `research/observation-hooks-2026-10/`.

## Decision

### Package admission

Admit one optional runtime package, `@get-modular/observation` at
`packages/observation`, as an additive exception to the ADR-0003 topology, like
ADR-0030 and ADR-0033. The package owns substantive behavior: in-process keyed
sources and the delivery of their changes to opted-in participants.

- `@get-modular/resources` is its only peer and its only dependency. It imports
  resources by root name only; it imports neither Core, Assembly, the lifecycle
  kernel, Node built-in modules nor product or tooling packages. Core and
  Assembly do not import it.
- It exposes one root-only ESM export (ADR-0012) and one current unversioned
  API (ADR-0009). Its engines equal the supported Node range of the other
  packages.
- Participants are recognized through a registry of the package copy that
  created them. A Host installs one copy of this package; a participant from
  another copy is reported as foreign.

### Contract

The root exports the values `createKeyedSource`, `participantsFor`, `startHub`,
`createLatestDerivation` and `ObservationError`, and the types that belong to
them. The package README and its rejecting tests own the exact invariants. In
summary:

- A keyed source holds one immutable record. Every key exists in the initial
  record; a type with optional properties is rejected. Values are plain data
  (primitives, plain objects, arrays); accessors, class instances, functions,
  `Date`, `Map` and `Set` are rejected, because they could change without a
  commit. `commit` takes ownership of what it receives and freezes it.
- The source has three facets: `reader.read(keys)` returns a snapshot with a
  revision; `port.observe(keys, recordDesired, options)` registers interest;
  `commit` and `seal` stay with the Host. A revision is a commit number, not
  proof that a value changed; delivering A, then B, then A again delivers
  again, so participants apply idempotently.
- A registration and its first snapshot are atomic. A caller that holds a
  snapshot passes it as `since` and receives one catch-up through the same
  path as every other delivery.
- Delivery runs in a later task, at most once per commit per registration, and
  may coalesce revisions. A non-newer revision is ignored. Nothing is delivered
  and nothing new is observed after the Host seals the source. Order between
  registrations is deterministic but not part of the contract.
- Callbacks are synchronous and typed to return `undefined`. Each callback runs
  isolated: a throw or a returned value goes to the caller's `reportError` and
  never stops another delivery. `reportError` must be synchronous and must not
  throw; a throwing reporter is surfaced as an uncaught error.
- Participants are opaque values created only by `participantsFor<V>()`:
  `sync({ initial, apply })` or `derived({ keys, derive, apply, fail })`. A
  module opts in by providing one participant as a capability value; it gains
  no subscription authority. Only the hub subscribes.
- A derived participant has one active run and one latest pending input. A
  result publishes only while the registration is attached and its revision is
  current; a failure calls `fail` instead of `apply`; a superseded or closed run
  is aborted cooperatively through its `AbortSignal`.
- `startHub` receives the port, the participants, their identifiers and a
  `Resources` facet. Before any subscription it rejects mismatched counts,
  duplicate identifiers, a participant listed twice and foreign participants.
  It registers drain entries first and subscriptions second, so a scope's
  reverse order unsubscribes every participant before it drains. A drain that
  is still running when the Host escalates fails as a debt naming the
  participant, so release continues past it. Each participant's first outcome
  is an input to the Host's readiness decision.
- `createLatestDerivation` is the same one-active-run kit for a module-owned
  subscription (escape hatch). Its settlement is reported by the module itself.
- Every error the package throws or rejects with carries a stable `code` of the
  form `observation.<area>.<reason>`. `resources.scope.closed` passes through
  unwrapped. Consumers compare codes, never classes.
- Record type parameters are invariant (`in out`), so a port for one record
  type is never accepted as a port for another.

### Signals and scheduling

The package aborts a derivation through an `AbortController` it owns. A listener
that module code adds to that signal must not throw: the platform reports such
an exception as an uncaught error and the package cannot isolate it. The same
holds for every signal that Get Modular packages hand to module code.

Unlike resources, the package schedules work: a delivery runs in a later task
(`setImmediate` where it exists, otherwise a zero-delay timer), and after an
escalation a drain waits one task for a cooperative abort to settle. Deferred
delivery is the contract that keeps `commit` non-reentrant and lets one commit
reach many registrations once. The package owns no deadlines, retries, clocks
or process control, and it starts no work that a commit, an observation, an
offer or a close did not ask for.

### Mechanism and authority

Get Modular provides the mechanism. A module decides what to do with a value.
The Host decides what to commit and when, when to seal, how long to wait, when
to escalate or abandon, how to read the first outcomes, and whether a change
that a module does not observe needs a reconstruction with a new identity.

`docs/architecture/system-boundary.md` stays unchanged. The package runs
participant callbacks and derivations only as a library call by the holder of a
source or a hub, as Assembly runs Host-supplied factories only when the Host
calls `run()` and resources runs cleanups only on `close()`. Get Modular decides
no product lifecycle and holds no lifecycle authority; a participant is data,
not a lifecycle method, and nothing is discovered by reflection. This decision
and the Consumer Module Standard record that split.

The owner direction recorded in OD-007 is the demonstrated need that the
Consumer Module Standard asks for before a module takes part in an
independently managed lifecycle. The first proof is a disposable TEST consumer;
the owner accepted that no production consumer lands in the same delivery. A
production adoption follows the Consumer Module Standard of its consumer.

### Configuration rule

The Consumer Module Standard gains one rule for modules that consume an
in-process keyed source, in the delivery that follows the package: read the
values at construction; opt in to changes with one participant; modules that do
not opt in keep their construction values, and a change that must reach them is
a Host reconstruction. Reading durable authority per operation stays valid.

### Dependencies and leaf admission

`@get-modular/resources` is a peer declared with the workspace caret range, so a
packed archive names exactly one 0.x minor of resources. Every minor release of
resources is accompanied by a minor release of observation, as ADR-0033 requires
for conformance. Admission extends the existing leaf-package checks: the row
declares resources as its only peer and lists after the resources row. The
admission entry arrives in the same change as the package root and its
implementation. No entry, stub or pending root precedes them; until then the
existing checks keep rejecting `packages/observation`.

### Publication and versioning

The package is public from 0.1.0 and is released with train 2. Versions come
from Changesets in a release pull request. Uploads follow the release rules that
ADR-0030 applies to resources; no unattended publisher is created. Pre-1.0
breaking changes ship as minor releases with a CHANGELOG entry and a migration
note, without compatibility aliases (ADR-0009). Version 1.0.0 needs a separate
decision. While G1 is on hold, the package is not enrolled in
`package.public-api-compatibility` or G1 SDK growth.

### Admission evidence

Rejecting tests cover the invariants above, every defect listed in
`research/observation-hooks-2026-10/sketch-v4-known-defects.md`, a seeded
model-based test of delivery, and subprocess tests for a throwing reporter and a
throwing abort listener. Typed fixtures, including negative fixtures for
variance and optional keys, cover TypeScript 7.0.2 and 5.8.3 with NodeNext and
Bundler resolution. A packed-root test installs the exact archive together with
the resources archive, and the Node 26 job installs it on the supported Node 26
line.

### Resolution of OD-007

This decision resolves OD-007 with its option A.

### Non-goals

Lifecycle methods or base types on modules, a notification context in every
factory, reflective hook discovery, a source status or health contract, a
readiness protocol beyond first outcomes, in-place dependency replacement,
cross-source transactions, per-subscriber equality or selectors, adapters to
signals, observables or stores, a computed graph, pluggable schedulers, history
or replay logs, a testing subpath, dual CommonJS builds and compatibility shims.

## Consequences

- Modules get one way to read settings and one opt-in way to follow changes;
  modules that do not opt in are untouched.
- Stale asynchronous results, subscribers that silence each other, phantom
  readiness and listener leaks are excluded by the mechanism instead of by
  review.
- A participant that ignores its abort signal can keep running after its
  providers closed; escalation reports it as a debt, it does not stop it.
- A revision is not a value comparison; feeders keep the identity of unchanged
  values or compare before `commit`, and participants apply idempotently.
- A resources minor release forces an observation minor release.
- The first public API is shaped by TEST evidence; deliberate 0.x breaks are
  expected once production consumers arrive.
- A new public package adds release and admission maintenance.

## Rejected alternatives

- The same mechanism inside one product Host: every consumer would grow its
  own variant, which is the state this package ends.
- Module-owned subscriptions everywhere: settlement is only self-reported and
  every module repeats about twenty lines of subscription code; kept as the
  escape hatch.
- A structural resources port with zero dependencies: a second copy of the
  resources types had already drifted from the delivered package.
- A source status or health contract: studied configuration systems redesigned
  theirs repeatedly; adapter health stays Host policy.
- `sync` only in 0.1.0: asynchronous derivation is where studied systems
  publish stale results, and leaving it to each module repeats that mistake.
- Lifecycle methods or classes for modules: they couple every module to a hook
  set and force migrations when a hook is added.
````

Copy the text between the four-backtick fences exactly; it contains no inner
fences.

## Risks and stop conditions

| Risk | Stop / action |
| --- | --- |
| `docs:new` writes a different path or rejects the id | stop; never create the file by hand |
| cspell or markdownlint fails on the text | reword or add a real word; never disable a rule for `docs/` |
| governance rejects the OD-007 resolution | read `validateDecisionResolutions` in `architecture/checks/governance.mjs`; the ADR must be accepted and list OD-007 in `related`, OD-007 must list the ADR; fix the metadata, never the check |
| the owner changes the text after acceptance metadata is set | regenerate the registry entry and the checkpoint digest in the same commit; never amend an accepted file on `main` |
| any accepted ADR byte changes (`ownership:checkpoint:test` fails on an existing ADR) | stop; revert your edit to that file |
| owner approval not explicit | the PR stays draft |

## Must not

- Edit any accepted ADR, the CMS, code, gates or CI. Hand-edit
  `accepted-decisions.json`. Remove OD-007 from `decisionCatalog` or the
  open-decision history.
- Set `status: accepted` before the owner approves in the PR.
- Merge, request reviewers or comment outside the own PR. Override the git
  identity, add co-author trailers or tool attribution anywhere.

## Done

ADR accepted and registered, index and checkpoint pin updated, OD-007 resolved
and listed under "Resolved", `implementationBlockers: []`, all gates green
locally and in CI, owner approval linked in the PR.

## Review checklist

- `git diff --stat origin/main...HEAD`: exactly the ADR file,
  `accepted-decisions.json` (one appended entry), `docs/decisions/README.md`
  (one line), `tests/ownership-checkpoint.test.mjs` (one object), OD-007,
  `docs/open-decisions/README.md`, `docs/traceability/module-system-v1.yaml`,
  `.cspell.json` only if needed.
- The ADR body equals this brief's text except the number and approved edits.
- `rg -n "structural port" docs/decisions/NNNN-*` hits only the rejected
  alternative; `rg -n "peer" docs/decisions/NNNN-*` names only
  `@get-modular/resources`.
- The registry digest comes from the Foundation promote command:
  `pnpm foundation:check` and `pnpm ownership:checkpoint:test` exit 0 on the PR
  head.
- Mutation spot-checks (locally, then revert): change one word in the accepted
  ADR body -> `pnpm foundation:check` or `pnpm ownership:checkpoint:test` fails;
  drop `OD-007` from the ADR `related` -> `pnpm governance:check` fails; put
  OD-007 back into `implementationBlockers` -> `pnpm governance:check` fails.
- Every ADR the text cites says what the text attributes to it (open 0003,
  0009, 0012, 0030, 0033 and find the passage).
