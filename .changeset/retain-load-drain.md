---
"@get-modular/observation": minor
---

Keep load cleanup pending until its loader settles after escalation. Report
`observation.load.still-running` through the owner error sink with the active
run's revision instead of finishing cleanup with a failed debt. Earlier resources
remain held while that loader, including its finally work, is still running.

Migration (0.1 -> 0.2)

Better: escalation cannot release the dependencies of a still-running load.

Codemod: none - choosing shutdown deadlines and retained ownership is semantic.

By hand: observe the error sink for still-running reports; use Resources abandon
for bounded waiting and retain the original close promise and dependencies.
Do not await an escalated close expecting a terminal failed debt or automatically
retry cleanup to observe late completion.

Check: typecheck, then composition smoke and held-loader shutdown tests through
the installed public packages.
