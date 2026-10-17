<!-- cspell:ignore Akka coalescable cpuhp Lumino microtask Modulith recalibrated rethrowing Ruecker -->

# Findings and decisions: module communication and observation (2026-10-15 to 2026-10-17)

One place for everything this study concluded, so that later work does not have to rebuild it from the raw reports.
ADR-0034 is the normative decision; this file is the record behind it. Sections:

1. Owner decisions, in order
2. The module communication rules
3. The observation API and why it has this shape
4. What the adversarial reviews and the independent PR review found, and their corrections
5. Writer test results, round by round
6. Open items, proposals for other tracks, and decisions still pending
7. Lessons about the process

## 1. Owner decisions, in order

- 2026-10-01: a public Get Modular package for change observation, library-first, TEST consumer first, public 0.x
  from the first release (OD-007). The first design used a hub per event family with opaque participants.
- 2026-10-08: resources is a declared peer; OD-007 is no publication blocker; 0.1.0 includes asynchronous
  derivation.
- 2026-10-15: names must be recognizable to a broad audience ("participant", `sync`, `derived`, "hub" were rejected
  as unclear or misleading). Communication must be predictable and observable at hundreds of modules, follow proven
  industry patterns, and contain no anti-patterns. Do not anchor on one framework: survey the whole industry.
- 2026-10-16: the model is accepted. A subscription lives in the subscriber's scope (`watch` with a mandatory
  `resources`); there is no hub and there are no participants; any module may own a store as its only writer;
  each module depends on its own settings slice. The vocabulary is `createStore`, `read`, `set`, `readonly`,
  `watch`, `load`, `close`; events come later as `createEvent`, `emit`, `subscribe`.
- 2026-10-16: reliability beats brevity, because AI agents will write most modules. The API must be typed,
  deterministic, verifiable, and correct about resources and memory. Think the syntax through carefully, because
  many modules will be written against it.
- 2026-10-16: the design of observation (ADR, briefs) belongs to the design track; implementation belongs to the
  implementing track, which builds from `implementation-brief.md`.

## 2. The module communication rules

These rules are the short form of the practices catalog (`raw/practices/practices-catalog-v2.md`). Each rule names
industry precedents; the catalog gives the sources.

1. **One owner, one writer per value.** Only the owner calls `set`; everyone else gets `readonly()` through a contract
   and a `required` slot. What crosses a module boundary is immutable plain data or an ID, frozen by the mechanism, not
   by convention. Precedents: React "single source of truth", Kubernetes `spec`/`status`, LibreOffice UNO "one owner
   per object", Forge `MonitorAware`.
2. **A dependency that is not declared does not exist.** Every link is a typed contract plus a slot, visible in the
   composition plan. Routes, command IDs and storage keys of another module are constants of its contract and count as
   edges. Forbidden: a global or string-topic bus, wildcard subscriptions, a mediator or service locator, ambient
   registries, monkey-patching and override by ID. Precedents: GitLab modular monolith, Guava "We recommend against
   using EventBus", Kibana #66682, Discourse `modifyClass` "last resort".
3. **Data goes from provider to consumer; a request goes back as a call.** The child calls the owner's command port,
   the command returns a typed result such as accepted or rejected, and the confirmed change returns as new state. A
   child never writes a parent's state and has no implicit `parent`. Two-way binding is only sugar over that pair. In
   FMS terms, a child that reads its parent's contract uses an upward edge. Precedents: Akka "There is no parent in
   Typed", Godot (a signal responds, a method starts), Temporal Update.
4. **A parent may pass changed data to its children** by owning a store as its only writer. One meaning travels one
   path: no child watches both the raw and the derived value, and no input is both watched and rebuilt. Precedent:
   Home Assistant, "reload twice and/or create a race condition".
5. **Prefer a call; choose the mechanism by the kind of fact.** Read the current value by default; `watch` only when
   you react to the change itself. A coalescable fact is state. A fact that cannot be coalesced and has several
   independent reactors is an event (later). One reactor means a call or a slot, never an event, and a command is never
   disguised as an event. A process that writes to several owners runs in an orchestrator in a common ancestor or in a
   bridge module. Precedents: Kibana RFC 0007, Fabric "only one subscriber", GitLab "callbacks hide the coupling",
   Medusa workflows, Ruecker.
6. **A subscription lives in the subscriber's scope.** `resources` is a required argument, never inferred and never
   optional, and the subscription detaches before drain (CMS rule 5). Contributions that come and go register on the
   owner's registry with the contributor's `resources`; `many()` stays static. Precedents: GNOME `connectObject`, Godot
   C# lambdas, VS Code `Disposable`, Theia #10877.
7. **Delivery is deferred, isolated and bounded.**
   - One listener's failure never stops the others and is reported under that listener's name.
   - Handlers are synchronous and never write what they were notified about, directly or through a command. No echo.
   - Changes made during delivery are queued in order; a runaway cascade fails with a coded error.
   - A removed subscription is never called again, even in the middle of a delivery.
   - Async reactions are latest-only, cancel through `AbortSignal` and never apply stale results.

   Precedents: Home Assistant nested-event queue, Lumino signals, VS Code `fire`, Flux, Angular `resource`.
8. **An extension point is the owner's contract plus `many()` with an explicit ordered row.** The owner declares its
   kind (collect, first, transform, wrap) and its error policy, and keeps decision points apart from notifications. One
   point per kind of contribution: split a point before you order inside it. A contribution never stops another; the
   owner may aggregate pure answers by its declared policy. No numeric priorities. Precedents: Fabric
   Allow/Before/After, Grafana per-kind registries, Linux cpuhp, Drupal `Order`.
9. **The module graph is acyclic and construction does not wait on the world.** A two-way need goes through a common
   ancestor, or the state owner and the consumer of children become separate modules. A factory awaits only its own
   acquisitions under `signal`, reads a snapshot and subscribes; it never awaits another module's future and never
   emits. Readiness is state. What must survive a sibling's failure runs as a separate run. Precedents: Martin's
   Acyclic Dependencies Principle, Kibana RFC 0007, Android's mediating module.
10. **`optional` means "may be absent in this composition", never "failed quietly".** Default to `required`. A failing
    provider fails construction. Precedents: Lumino `resolveOptionalService` (counterexample), AWS Kinesis 2020,
    ADR-0035.
11. **Plugin- and instance-ready.** Plugins and instances receive only read/watch facets, event sources and command
    ports, all through inputs; across an isolation boundary only validated plain-data messages, one method per message.
    Their registrations live in their generation scope. A plugin never edits the Host's list: the plugin Host generates
    rows from the manifest and checks them against what the plugin provides. Precedents: Backstage, Electron, Grafana
    `plugin.json`, Paper plugin isolation.
12. **Observable by construction.** Name every store, event, subscription and contribution, and use the revision as the
    correlation ID. Who watches, listens and contributes must be readable from the plan. Frequent chatter between two
    modules points to a wrong boundary, not to a missing channel. Precedents: Spring Modulith Documenter, GitLab "Avoid
    chatty domains", single-spa "consider merging them".
13. **Names are mainstream and unambiguous:** `createStore`, `read`, `set`, `readonly`, `watch`, `load`, `close`; later
    `createEvent`, `emit`, `subscribe`; "extension point", "contribution", "command port". Avoid "participant", "hub",
    `sync` (two-way binding, synchronous execution or external sync), `derived` or `computed` for side effects, "hook"
    (read as React Hooks) and `seal` (read as the opposite of `Object.seal`).
14. **Libraries give patterns and vocabulary.** One becomes a runtime dependency only if it isolates listener errors,
    cancels stale async work and fits a leaf package. None qualified on 2026-10-15 (mitt, EventEmitter, alien-signals,
    signal-polyfill, RxJS).
15. **Reliability beats brevity, because agents write most of this code.** Every call is explicit and fully typed.
    Misuse must fail to compile or fail fast with a coded error. A caller never repeats information that must stay
    consistent. No magic shortcuts. Every escape hatch is declared, named as debt and listed, and violation lists only
    shrink. Validate API shapes with negative type probes on the minimum and pinned TypeScript, and with a test in
    which agents write modules from the types alone.
16. **Leaks and misuse fail tests.** Every module test closes its scopes and fails on a debt or on a subscription still
    alive; use after close throws a coded error. Precedents: VS Code `ensureNoDisposablesAreLeakedInTestSuite`, VS Code
    "The added object will be leaked!".

## 3. The observation API and why it has this shape

Exact types: `raw/api-design/b-snapshot/api.d.ts.txt`; the reason for every name and parameter:
`raw/api-design/b-snapshot/RATIONALE.txt`.

- Variant B, "watch what you read": `watch(snapshot, spec)` takes the snapshot the module read. Keys and the start
  revision come from it, so keys are written once and the "read, then subscribe" race is closed by construction.
  Variant A (keys plus a mandatory `changesAfter` snapshot) works but repeats information; variant C (`watch`
  returns the snapshot) lost a change silently across one `await` and was dropped.
- `load` is a separate member, not a branch of `watch`, because a combined spec gave misleading compiler errors.
  `onLoading` is required: without it, two of three writers and all three reference solutions showed the old
  region's data while the new region loaded (the pattern Angular `resource` status `loading` and TanStack Query
  `pending` solve). Results are dropped by store revision, not by "last offered run".
- `resources` and `name` are required. A watch binds to `resources.signal` (about 1 KB per live watch, nothing kept
  per closed source); a child scope per watch cost three times as much, one scope entry per watch kept about 511
  bytes per closed source.
- A type-only marker of the record type on the facet and on snapshots makes slices safe through `Pick`, `Readonly`,
  intersections and hand-written ports; `out V` alone protected only alias-to-alias comparisons. A port made of
  `watch` alone still compiles; type dependencies only as `ReadonlyStore<Slice>`.
- `Frozen<T>` keeps primitives (branded IDs survive) and maps tuples element by element. `FixedKeys` rejects index
  signatures with a readable message, because the key set is fixed at creation.
- `set` validates everything first, then takes ownership of the objects and freezes them in place, walking only new
  nodes (appending one row to 50 000 went from 20 ms to 7-9 ms).
- `close()` detaches every subscription, reports `observation.source.closed` once per subscription and makes the
  facet throw `observation.store.closed`; the owner's own `read` keeps working, so a "save on close" cleanup that
  runs later in LIFO order still sees the last values (an earlier version lost the last change there).
- Limits: 64 live subscriptions per store per subscriber scope (a leak fails where it happens) and 8192 per store as
  a safety net. A first version with one per-store limit of 1024 made an innocent module's factory fail.
- Echo and cascade guards: a commit from a delivery that changes a key the delivering subscription follows fails at
  once (`observation.delivery.echo`); other chains fail after 64 steps (`observation.delivery.cascade`). The failing
  commit is reported, then thrown (fail fast). The delivery context reaches through `await` via `AsyncLocalStorage`,
  obtained through `process.getBuiltinModule` without a static import, and is bounded: a handler's context ends with
  its delivery task, a loader's with its run. The unbounded first version crashed healthy processes through timers
  and servers started in a handler.
- `./testing` gives `liveSubscriptions`, `delivered`, `settled` and `asyncDetection`. Waits have a deadline that is on
  by default; the built-in task scheduler and monotonic clock are captured at load where available, so fake global
  timers do not hang tests. It is a second export, admitted by
  ADR-0034 as the successor decision that ADR-0012 requires.
- Supported environments: Node 24 and 26 fully. Bun 1.3 behaves the same except that an unhandled rejection does not
  end the process. Elsewhere only synchronous detection, checked with a simulated runtime, not in a browser.
- Slices: the owner publishes a few area contracts (theme, logging, region) and hands out the same facet under each.
  One wide settings contract would make every new key a breaking revision; a slice contract per consumer would put
  a central list at the owner.

## 4. Adversarial reviews: findings and fixes

- Pass 1 (F1-F13): structural slice hole (fixed by the marker); README advice contradicting rule 7 and no cascade
  guard (fixed); no way for tests to see live subscriptions (testing entry point); per-store limit hitting innocent
  modules (per-scope limit); slices through contracts not scaling (area contracts); closed stores retained by live
  subscribers (release on close); in-place freezing cost and surprise (ownership transfer, new nodes only); names
  that would break with events (renamed to `source`, `subscription.*`, `maxSubscriptions`); index signatures and
  shallow readonly (FixedKeys, Frozen); two codes for one closing state (rethrow the signal reason); first-error-only
  fan-out accepted by the gate (two throwing receivers); CMS rule 5 out of date (draft in `CMS-RULE5-DRAFT.txt`).
- Pass 2 (N1-N11): `Frozen` broke branded IDs and tuples; the cascade guard missed asynchronous chains; echoes were
  caught only after 64 rounds (pagination test passed at 10 pages and failed at 65); "read after close throws" lost
  data in save-on-close; 515 bytes kept per closed source; test waits global and without a deadline; small message
  and atomicity issues. All fixed.
- Pass 3 (M1-M6): the delivery context leaked into timers and servers created in a handler (false echoes, a crashed
  process, creeping depth); fixed by bounding the context. Fail fast documented; the cheaper signal binding taken;
  deadline always on with captured timers; save on close made asynchronous.
- Pass 4: no blockers. Four text fixes (loader must not start long-lived work, fake global timers before import,
  import without `setImmediate`, one stale sentence) were applied.
- Two reviews of the ADR text then aligned it with the API and with the repository rules (ADR-0012 subpath, leaf
  manifest without `devDependencies`, no shipped oxlint preset, rule 11 against the lint snippet, call order not part
  of the contract, the throwing `reportError` invariant).

### Independent review of pull request #182 (2026-10-17)

The original 43-step suite passed again, but four new probes exposed missing coverage:

- A synchronous `onResult` or `onError` could queue a microtask that wrote back to its observed key after the
  loader's context had closed. This bypassed echo detection and reset cascade depth. Result and error callbacks
  now have their own delivery task and microtask checkpoint; the result is checked for freshness at publication.
  Queued callbacks remain visible to testing waits without keeping a settled loader in drain. Re-review caught
  and corrected that distinction: cancelling a queued callback must not create a false still-running load debt.
- A fake global `performance.now` installed before import could freeze the testing deadline. The testing entry
  captures the built-in `node:perf_hooks` clock where available. The fallback outside that environment still
  captures the global clock and retains the documented limitation for mocks installed before import.
- `FixedKeys` rejected a pure index signature but admitted an infinite template index signature alongside a named
  property. The check now examines each key constituent, with mixed-signature negative fixtures and finite-key
  positive fixtures on TypeScript 5.8.3 and 7.0.2.
- Without `AsyncLocalStorage`, the loader ran after an internal await outside the synchronous context, so even a
  write before its first user await escaped the echo guard. Entering the context at the direct loader call fixes
  this case; the environment probe now checks both synchronous watch and synchronous loader echoes.

The [dated correction evidence](raw/api-design/corrections-2026-10-17/README.md) records the updated regressions and
their verification. The original measurements and writer histories stay unchanged. These are corrections to the
research prototype and selected public types; the real package still requires its admission tests.

## 5. Writer tests, round by round

Writers got only the README and the types, wrote modules blind (no compiler, no checker), and a gate of rules,
compilation on TypeScript 7 and 5.8.3, and runtime behavior graded them.

- Round 1 (4 tasks, variants A, B, C, one smaller-model writer each): all compiled; semantic grading found C's
  `let x | undefined` workaround and a lost update across `await`, and a gap shared by all variants (no loading
  state). C was dropped and `onLoading` added.
- Round 2 (9 tasks, A and B, smaller and larger models): A larger 9/9, B larger 9/9, A smaller 9/9; B smaller
  failed `h-requests` in the recorded gate, but the solution (one subscription fanning out to a set) was correct and
  the gate was recalibrated; it passed that re-check. Under the final, stricter gate it reports only the first of
  two receiver failures in `h-requests`, and `e` and `i` fail only because the contract changed later on purpose.
- Round 3 (final B before the reviews' changes): larger 9/9; smaller-1 failed `h-requests` in the recorded gate for
  rethrowing an `AggregateError`, which was correct, and passes after recalibration; smaller-2 passes, but under the
  later, stricter gate (every receiver failure must be reported) it reports only the first of two failures.
- Rounds 4 and 5 (B after the first and the second review fixes; later changes touched the README, doc comments
  and a few types such as `Frozen`, `FixedKeys`, error codes and `testing.d.ts`): three runs, 9/9 each, and their
  solutions pass the final gate unchanged.
- Some early runs fail later re-checks only because the contract changed on purpose (`openAuditLog` signal and
  release, branded `ListenerError`).

## 6. Open items, proposals and pending decisions

- Known items of ADR-0034, each with owner and trigger: echoes through timers or I/O; `Resources.path` for reports;
  runtimes without `AsyncLocalStorage`; the loader rule; abort-listener isolation; the chosen bounds.
- For the Get Modular module DX track: inside a sub-feature, a `many` slot, an `optional` slot or a module that only
  listens cannot exist without naming its private implementation id in the app root (rows live only in the root;
  the nested-features draft wires only top-level features; Core rejects unreachable modules). Group-level binding
  rows and group-level roots (F-4) close this; both syntheses recommend doing it before the first sub-feature that
  needs it.
- Proposal for Assembly (not decided): an optional synchronous observer of factory start and settle in `run`, so a
  Host can time factories and name a hung one, as Kibana, VS Code and Theia do.
- Later, with the first real consumer: events (`createEvent`, `emit`, `subscribe`, reusing the guards and
  `ListenerError`) and a registry for contributions that come and go (the owner stays the only writer of the list;
  an entry lives in the contributor's scope).
- Pending owner choice: whether to report the TypeScript 7 variance divergence upstream
  (`raw/api-design/probes/standalone-sig/`). It no longer affects this API.
- To verify during implementation: whether the pinned oxlint supports `no-restricted-imports` with paths and
  messages for the `./testing` rule.

## 7. Lessons about the process

- Compilation alone does not separate API variants; a behavior gate and semantic grading do.
- The gate itself was wrong three times (it required one design, it did not recognize a wrapped error, it counted
  subscriptions instead of checking the requirement). Grade the requirement, not a design, and keep the recorded
  results next to any later re-check.
- Every review pass found something real; one fix (the unbounded delivery context) introduced a P0 that only the
  next pass caught. Re-review fixes, not only the original findings.
- Claims about results are written per round from the recorded gate files, never as a single summary number.
- An unmerged ADR can be rewritten before its first merge. The decisions registry refuses to change a recorded
  digest, so the entry is removed and promoted again; the ownership checkpoint test takes the new digest.
