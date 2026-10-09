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
   0003, 0009, 0012, 0015, 0017, 0019, 0023, 0025, 0026, 0029, 0030, 0031, 0033. If
   one was superseded: stop and report.
4. The owner decisions below match `research/observation-hooks-2026-10/briefs/README.md`
   section "Owner decisions". Any difference: stop.
5. Node per `.node-version`; `pnpm install --frozen-lockfile` in your own
   worktree. `pnpm docs:info` lists type `adr` with identity `adr-four-digits`.
   (`pnpm docs:new --help` exits 2 by design.)
6. This PR is documentation and may land before train 1 is released. It adds no
   package root, leaf row or changeset. It changes
   `architecture/decisions/accepted-decisions.json`, a release input, so it is
   merged only while no release PR is open:
   `gh pr list --repo agent-teams-ai/get-modular --state open --head changeset-release/main`
   prints nothing. Otherwise wait.
7. If an ADR with a higher number than NNNN was accepted first (for example
   train 2's T2-1), run the promote command of step 2 in a scratch checkout first
   and check that it accepts an out-of-order id. If it does not: stop and report.

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
- 2026-10-09: train 2 does not wait for observation; if the package is not
  ready when REL-2 opens or the TEST experiment fails, REL-2 ships without it
  and 0.1.0 follows in its own release pull request.

- 2026-10-09: the owner delegates the approval of the ADR text to the
  planning side, after an independent review of this PR; only a point that the
  review cannot settle goes to the owner.

The ADR text is approved in this PR before acceptance, under that delegation;
`approved_by: product-owner` records the owner's authority. Anything this brief
does not cover: stop and ask.

## Scope

- Create the ADR with `pnpm docs:new` and insert the body below.
- After the text is approved: acceptance metadata, registry entry, index
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
ADR-0015, ADR-0017, ADR-0019, ADR-0023, ADR-0025, ADR-0026, ADR-0029, ADR-0030,
ADR-0031, ADR-0033. Keep every other front matter field the tool wrote.

`docs/decisions/README.md`: add
`- [ADR-NNNN: Admit the module change observation package](NNNN-admit-the-module-change-observation-package.md)`
as the last item under "## Proposed decisions" (Foundation requires every
proposed ADR there exactly once).

Commit 1: `docs(architecture): propose ADR-NNNN for module change observation`.
Gates, each exit 0: `pnpm docs:protocol:check` (fix cspell by rewording or by
adding real words to `.cspell.json`), `pnpm governance:check`,
`pnpm foundation:check`.

Open the PR as a draft. Run an independent review of the ADR text against the
cited ADRs, `system-boundary.md`, `AGENTS.md` and the research archive; changes
go in new commits. When the review is clean, record the approval in the PR
(delegated approval of 2026-10-09 and the review result).

### 2. Accept and resolve OD-007 (only after the approval is recorded in the PR)

1. ADR front matter: `status: accepted`, `approved_by: product-owner`,
   `accepted_at: <YYYY-MM-DD of approval>` (same key order as ADR-0033).
2. `pnpm exec agent-teams-foundation architecture-decisions-promote-baseline --consumer .`
   appends the registry entry to `architecture/decisions/accepted-decisions.json`
   (never edit that file by hand). The diff is one appended object
   `{ id, path, immutableDigest }`.
3. `docs/decisions/README.md`: move the ADR-NNNN line from "## Proposed
   decisions" to the first item under "## Accepted decisions".
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
   planned for release with train 2, which does not wait for it. OD-007 never
   blocked publication.

   The acceptance criteria above move with the owner's sequencing of
   2026-10-08: the Consumer Module Standard rule lands before the release pull
   request opens, and the bounded TEST experiment runs on the release archives
   and must pass before the release pull request is merged. A failure stops the
   release of those archives; the fix lands on `main` and the experiment runs
   again on regenerated archives. A successor decision is needed only if the
   decision itself changes.
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
Module Standard)", and the approval reference (the delegation and the
review).

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
ADR-0023, ADR-0029 and ADR-0030. The package owns substantive behavior:
in-process keyed sources and the delivery of their changes to opted-in
participants.

- `@get-modular/resources` is its only peer and its only dependency. It imports
  resources by root name only; it imports neither Core, Assembly, the lifecycle
  kernel, Node built-in modules nor product or tooling packages. Core and
  Assembly do not import it.
- It exposes one root-only ESM export (ADR-0012) and one current unversioned
  API (ADR-0009). Its engines equal the supported Node range of the other
  packages.
- Participants are recognized through a registry of the package copy that
  created them. A Host installs one copy of this package; a participant from
  another copy is rejected as foreign.

### Contract

The root exports the values `createKeyedSource`, `participantsFor`, `startHub`,
`createLatestDerivation` and `ObservationError`, and the types `Values`, `Key`,
`Keys`, `SourceId`, `Snapshot`, `SnapshotRef`, `Reader`, `View`, `Observation`,
`ObserveOptions`, `ObservationPort`, `KeyedSource`, `Participant`,
`ParticipantFactory`, `ParticipantOutcome`, `Hub`, `LatestDerivation` and
`ObservationErrorCode`. The package README and its rejecting tests own the exact
invariants. In summary:

- A keyed source holds one immutable record. Every key exists in the initial
  record; a type with optional properties is rejected. Values are plain data
  (primitives, plain objects, arrays); accessors, class instances, functions,
  `Date`, `Map` and `Set` are rejected, because they could change without a
  commit. `commit` takes ownership of what it receives and freezes it.
- The source has three facets: `reader.read(keys)` returns a snapshot with a
  revision; `port.observe(keys, callback, options)` registers interest;
  `commit` and `seal` stay with the Host. A revision is a commit number, not
  proof that a value changed; delivering A, then B, then A again delivers
  again, so participants apply idempotently.
- A registration and its first snapshot are atomic. A caller that holds a
  snapshot passes it as `since` and receives one catch-up through the same
  path as every other delivery.
- Delivery runs in a later task, at most once per commit per registration, and
  may coalesce revisions. A non-newer revision is ignored. Nothing is delivered
  and nothing new is observed after the Host seals the source; a derivation
  offered before the seal, running or pending, may still publish until its
  registration is detached. Order between registrations is deterministic but
  not part of the contract.
- The observe callback, `apply` and `fail` are synchronous and typed to
  return `undefined`; `derive` returns a promise. Each synchronous callback
  runs isolated: a throw or a returned value goes to the caller's
  `reportError` and never stops another delivery. A `derive` that throws or
  rejects is a failure and reaches `fail` under the same publication rule as a
  result. `reportError` must be synchronous and must not throw; a throwing
  reporter is surfaced as an uncaught error.
- Participants are opaque values created only by `participantsFor<V>()`:
  `sync({ initial, apply })` or `derived({ keys, derive, apply, fail })`. A
  module opts in by providing one participant as a capability value; it gains
  no subscription authority. Only the hub subscribes on its behalf.
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
- Every error the package throws or rejects with, and every error the hub
  reports for a participant, carries a stable `code` of the form
  `observation.<area>.<reason>`; the hub's report names the participant and
  keeps the original cause. Two errors are excepted:
  `resources.scope.closed`, which passes through unwrapped, and the uncaught
  error that surfaces a throwing `reportError`. Consumers compare codes, never
  classes.
- The record type parameters of `Reader`, `ObservationPort` and `Participant`
  are invariant (`in out`), so a reader, port or participant for one record
  type is not accepted for another.

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
participant callbacks and derivations only in response to a library call
(`commit`, `observe`, `startHub`, `offer` or a `close()`), as Assembly runs
Host-supplied factories only when the Host calls `run()` and resources runs
cleanups only on `close()`. Get Modular decides no product lifecycle and holds
no lifecycle authority; a participant is data, not a lifecycle method, and
nothing is discovered by reflection. Three words of the boundary need a
precise reading:

- **Drain.** The hub's drain is a cleanup entry in a resources scope that the
  Host closes. It waits only for the package's own derivations; it never
  drains product traffic or routes.
- **Fencing.** Publishing a derived result only for the current revision is a
  data check on one source, not fencing of routes or generations.
- **Readiness.** A participant's first outcome is data. Whether the product is
  ready stays the Host's decision.

This decision records that split; the Consumer Module Standard records it for
module authors with the configuration rule.

The Consumer Module Standard asks for an explicit demonstrated need before a
consumer adopts a runtime mechanism for independently managed lifecycle. For
this package and its disposable TEST consumer, the owner direction recorded in
OD-007 is that need, and the owner accepted that no production consumer lands
in the same delivery. A production consumer that adopts a source, a hub or a
participant demonstrates its own need under the Consumer Module Standard it
pins.

### Trust

A source, a hub and their participants run trusted in-process module code. The
package cannot stop a `derive` that ignores its signal or revoke a value a
module kept. Third-party or untrusted code runs in a runtime the Host can
terminate, as ADR-0030 requires for cleanup. Participants are not a plugin SPI.

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
for conformance; the release that bumps resources carries its own minor
changeset for observation, because Changesets
(`@changesets/assemble-release-plan` 7.0.0) gives an out-of-range peer
dependent only a patch. Admission extends the existing leaf-package checks:
the row declares resources as its only peer and lists after the resources
row. The admission entry arrives in the same change as the package root and
its implementation. No entry, stub or pending root precedes them; until then
the existing checks keep rejecting `packages/observation`.

### Publication and versioning

The package is public from 0.1.0. Versions come from Changesets in a release
pull request. 0.1.0 is planned for the release pull request of train 2, which
does not wait for it (owner decision of 2026-10-09); otherwise 0.1.0 follows in
its own release pull request. Uploads follow the release rules that ADR-0030
applies to resources; no unattended publisher is created. Pre-1.0
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
line. The bounded TEST experiment of the research archive runs on the release
archives and must pass before the release pull request is merged. A failure
stops the release of those archives; the fix lands on `main` and the experiment
runs again on regenerated archives. A successor decision is needed only if this
decision itself changes.

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
| the text changes after acceptance metadata is set | regenerate the registry entry and the checkpoint digest in the same commit; never amend an accepted file on `main` |
| any accepted ADR byte changes (`ownership:checkpoint:test` fails on an existing ADR) | stop; revert your edit to that file |
| the approval is not recorded in the PR, or the review leaves a point open | the PR stays draft; an open point goes to the owner |

## Must not

- Edit any accepted ADR, the CMS, code, gates or CI. Hand-edit
  `accepted-decisions.json`. Remove OD-007 from `decisionCatalog` or the
  open-decision history.
- Set `status: accepted` before the approval is recorded in the PR.
- Merge, request reviewers or comment outside the own PR. Override the git
  identity, add co-author trailers or tool attribution anywhere.

## Done

ADR accepted and registered, index and checkpoint pin updated, OD-007 resolved
and listed under "Resolved", `implementationBlockers: []`, all gates green
locally and in CI, the approval and its review linked in the PR.

## Review checklist

- `git diff --stat origin/main...HEAD`: exactly the ADR file,
  `accepted-decisions.json` (one appended entry), `docs/decisions/README.md`
  (one line), `tests/ownership-checkpoint.test.mjs` (one object), OD-007,
  `docs/open-decisions/README.md`, `docs/traceability/module-system-v1.yaml`,
  `.cspell.json` only if needed.
- The ADR body equals this brief's text except the number and approved edits.
- `rg -n "structural" docs/decisions/NNNN-*` hits only the rejected
  alternative "A structural resources port"; `rg -n "peer" docs/decisions/NNNN-*` names only
  `@get-modular/resources`.
- The registry digest comes from the Foundation promote command:
  `pnpm foundation:check` and `pnpm ownership:checkpoint:test` exit 0 on the PR
  head.
- Mutation spot-checks (locally, then revert): change one word in the accepted
  ADR body -> `pnpm foundation:check` or `pnpm ownership:checkpoint:test` fails;
  drop `OD-007` from the ADR `related` -> `pnpm governance:check` fails; put
  OD-007 back into `implementationBlockers` -> `pnpm governance:check` fails.
- Every ADR the text cites says what the text attributes to it (open 0003,
  0009, 0012, 0023, 0029, 0030, 0033 and find the passage).
