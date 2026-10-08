# Agent Runtime: is there a first consumer for settings-change hooks? (2026-10-01)

Read-only scan by an explore subagent against agent-runtime
`origin/main` `b0bcb265` (local checkout `6b12fbd` was 410 commits behind, so
`git show`/`git grep` on `origin/main` were used; nothing fetched or modified).

**Verdict: no fitting consumer now.** No long-lived, already-constructed module
needs a changed value pushed into it while it keeps running.

Candidates found (verified in code):

| # | What changes | Consumed today | Fit |
| --- | --- | --- | --- |
| A | Provider Access binding revision/credential generation/availability (`revalidate-contained-turn-provider-access.ts:57-69`) | Pulled once per operation; any change rejects the operation fail-closed | No: durable Postgres CAS head is the authority |
| B | Route-selection endorsement (`route-selection-owner.ts:27-29`) | `readCurrent()` per operation | No |
| C | Runtime Security egress policy / dispatch authority (`current-egress-owner.ts:38-43`) | Re-read on every call, overlap fails closed | No |
| D | Contained-turn provider selection (`contained-turn-provider-selection.ts:31-75`) | Captured once; `assertStable()` throws on change | No: must not change |
| E | Ordinary Host options/policy (`ordinary-agent-runtime-host.ts:34-42,76`) | Frozen at construction; change = new Host | No |
| F | Codex/Claude config files (`inspect-claude-code-configuration.ts:353-366`) | Re-read per inspect call, stateless | Smallest blast radius, but nothing derived is kept |
| G-K | Cancellation polling, abort subscriptions, Docker disconnect, qualification registry, capacity policy (planned only) | Per operation / static / not implemented | No |

Constraints quoted by the scan: ADR-0015 "No universal resource manager,
reflective cleanup, or new lifecycle abstraction is admitted" and "L2-L5 remain
no-go"; `docs/architecture/get-modular-adoption.md` "Only default embedded passive
setup is admitted"; ADR-0090 "Runtime Configuration owns immutable launch
configuration"; ADR-0001 hard-blocks ambiguous payloads at one owner revision
instead of field-level last-write-wins. An in-memory hub revision over A-C would
duplicate durable authority (close to the "second policy plane" anti-pattern).

Possible future trigger (assumption): a capacity/admission slice with an
immutable policy revision per admission - still a snapshot at admission, not a
value pushed into a running module. Adoption in AR would need a new accepted
product decision admitting a runtime-dynamic scope.
