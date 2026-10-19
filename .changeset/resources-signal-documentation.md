---
"@get-modular/resources": patch
---

Document that `Resources.signal` also aborts when the run that constructs the module is cancelled before its factory
settles, and that subscriptions bound to the signal detach then. No API or behavior change.

Authoring surface changed: no
