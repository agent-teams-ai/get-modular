---
"@get-modular/resources": patch
---

Preserve escalation and subscription detachment during reentrant scope close.
Reserve the close flight and apply escalation before notifying abort listeners;
finish synchronous abort notifications before starting cleanup, including when
a listener closes an ancestor during close or construction cancellation.
Registration is refused throughout the requested subtree before callbacks run.
Independent scope trees keep their existing synchronous close behavior.
