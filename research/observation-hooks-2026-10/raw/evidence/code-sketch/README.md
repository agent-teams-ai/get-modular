# Lifecycle hooks: executable code sketches (2026-10-01)

TEST-only design sketches, not implementation. Built against the real
`@get-modular/core` and `@get-modular/assembly` from get-modular@9c722ce
(Assembly compiled from source into a scratch `node_modules`), with a STAND-IN
for the not-yet-admitted `@get-modular/ownership` resource owner.

- `hooks-sketch/` (v1): three options side by side. 17 checks passed, but three
  independent xhigh critics found P1 defects (see `critic-reports/`).
- `hooks-sketch-v2/` (v2): fixes. Settings Published Language split into read /
  observation / data-only participant; one hub per event family owns all
  participant subscriptions (sync and derived), derived fail-closed binding,
  two-phase cleanup, attribution, per-participant outcomes; option 2 kept as an
  escape hatch (`ownObservation`); Host seals the source, budgets construction
  and cleanup. 30 checks pass (`node src/main.ts`, Node 26.9); typecheck clean
  on TypeScript 5.8.3 and 7.0.2.
- `hooks-sketch-v3/` (v3, basis of research revision 3): the mechanism as a
  generic library (`src/lib/observation`, working name `@get-modular/observation`)
  over any record type, integrated with a stand-in of the owner-accepted
  `@get-modular/resources` scope design (attempt scope, `scoped()`, drain-then-
  subscribe LIFO, Host `abandon` with a ref'd timer, isolated seal-aware catch-up).
  25 checks pass on Node 24.18.0 and 26.9, including a second record type and an
  `interface` record; typecheck clean on TypeScript 5.8.3 and 7.0.2.

Reproduce: create `node_modules/@get-modular/core` (symlink to
get-modular/packages/core with its dist), compile get-modular/packages/assembly/src
into `node_modules/@get-modular/assembly/dist` with its package.json, symlink
`@types/node`, then run `tsc -p tsconfig.json` and `node src/main.ts`.

Critic reports (all independent, xhigh, read-only): `async-correctness.md`,
`arch-solid-dry.md`, `scale-dx.md` (on v1) and `rereview-v2.md` (summary of the
re-review of v2; its findings N1-N5, N7-N9 were then fixed and regression-checked)
`agent-runtime-consumer-scan.md` (no fitting first consumer in Agent Runtime today)
and `final-review-rev3.md` (independent xhigh review of research revision 3; F-1..F-9 applied).
- `hooks-sketch-v4/` (v4, basis of research revision 4): research round 4 fixes -
  declared key set and deep freeze, verified `since`, `observe`/`commit` after seal
  rejected, opaque participants via `participantsFor<V>()`, structural
  `HubResources` (zero package deps), `ObservationError` codes, `in out V` with
  negative type fixtures, escalate turning a stuck drain into a named debt so LIFO
  continues; then hardened by the final review of revision 4 (G-1..G-13). 30 checks
  pass on Node 24.18.0 and 26.9; TS 5.8.3 and 7.0.2 clean incl. negative type fixtures.
Remaining known limits: TypeScript TS2590 near ~1,150 declarations in one array
literal; Core/Assembly ceilings (1,024 providers per many-row, 1,024 roots);
option-2 settlement is self-reported; readiness is diagnostic per participant,
the Host decides.
