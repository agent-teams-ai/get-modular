# Final review of research revision 3 (independent reviewer, xhigh, read-only)

Returned in the agent's final message (its rules forbid writing files); saved by
root. Reviewed revision 3 at SHA-256 `9ee00782…` against the sketches, critic
reports, sources and the resources design. Reproduced 17/30/22 checks and
typecheck on TS 7.0.2 and 5.8.3; reran v3 on Node 24.18.0 (22/22).

Findings (all applied by root):

- F-1 P1 (reproduced): v3 sync catch-up `setTimeout(... apply(...))` bypassed
  isolation and sealing (throwing apply exited the process; applied after seal).
  Fixed in code: `observe(..., { since })` schedules the catch-up through the
  normal isolated, seal-aware flush; regression checks added (25/25).
- F-2 P1: "real consumer in the same delivery" deviation must be recorded as an
  explicit owner exception to AGENTS.md:49,53 and resources design §1/§14.7.
- F-3 P1: limit the configuration standard to in-process keyed sources; the
  admitting ADR must reconcile system-boundary.md:15,69 and CMS 73-75.
- F-4 P2: rules 4 and 7 assigned Host/participant duties to the package.
- F-5 P2: "escalate before abandon" only helps if the hub drain honours the
  cleanup signal; not implemented or measured.
- F-6 P2: experiment arithmetic (600 = 1+1+12+1+1+584), stand-in vs real
  package rerun, Node range (26.9 is outside >=26.10), action on failure.
- F-7 P3: API mismatches (startHub returns Promise; V constraint rejected
  interfaces -> relaxed to `object`; TEST probes not API; source ownership row).
- F-8 P3: measurement wording (v1-only scale data; 11 ms rows; commit vs fail
  crash; exit code 13 vs 0; .NET 11 Preview 7).
- F-9 P3: factories do get `resources` and an attributed `reportError`.

Verified correct: framework quotes and versions, AR quotes and verdict, SHA
values, debt path, TS `=> undefined` behaviour, LOC and per-module cost.
