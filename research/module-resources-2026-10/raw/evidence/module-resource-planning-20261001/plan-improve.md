---
name: plan-improve
description: Turn an implementation plan into a precise, unambiguous, implementation-ready specification with clear scope boundaries, detailed hard parts, and explicit edge-case handling. Use when the user writes /plan-improve or asks to strengthen a plan before implementation.
---

# Plan Improve Workflow

Use this workflow to review, strengthen, and rewrite a plan before implementation.

## Core mandate

Make the scope explicit and unambiguous, with clear in-scope and out-of-scope boundaries. Improve the plan by adding concrete implementation details, especially for the small but difficult parts, so the implementing agent understands exactly how the work should be done and has no room for ambiguity. Identify the relevant edge cases and specify how each one should be handled. Avoid overengineering, but do not oversimplify areas where correctness, reliability, or maintainability requires a robust solution.

## Required behavior

- Read the referenced plan or infer the current plan from the conversation if no file is provided.
- State the goal, non-goals, in-scope work, out-of-scope work, constraints, dependencies, and acceptance boundaries explicitly.
- Replace vague steps with concrete decisions, data flows, interfaces, state transitions, and expected behavior wherever the implementation could otherwise be interpreted in multiple ways.
- Expand the smallest difficult details that are likely to cause mistakes, while keeping routine details concise.
- Identify weak assumptions, high-risk areas, missing tests, hidden dependencies, and edge cases.
- For every relevant edge case, specify the expected behavior, fallback or failure path, and the evidence that will verify it.
- Study the least-confident areas using local code/files when available.
- Do not implement the plan unless the user explicitly asks to implement.
- If the plan references current or unstable external facts, browse or use official docs as required by the global browsing rules.
- Preserve the user's intended goal, but challenge unsafe sequencing or overly broad changes.

## Review checklist

Evaluate the plan across these dimensions:

- Correct root cause: does the plan optimize the actual bottleneck or just a symptom?
- Blast radius: which modules, IPC contracts, stores, watchers, or persistence paths can regress?
- Data ownership: which files/state are canonical, cached, derived, or legacy?
- Ordering: which async events, timers, race conditions, stale runs, or retries can interleave?
- Backward compatibility: what happens for legacy configs, missing ids, partial state, and old projects?
- Failure modes: what happens on IPC failure, parse failure, missing files, permissions, cancelled work, app restart?
- Observability: how will we know it worked without adding noisy logs or expensive scans?
- Rollback: is there a kill switch or narrow revert point for risky behavior changes?
- Tests: what focused unit/regression tests prove the important contracts?
- Verification: what minimal commands should be run, and which broad commands should be avoided?

## Output structure

When rewriting a plan, prefer this structure:

```markdown
# Phase N - Title

## Summary

## Current understanding

## Scope and boundaries

### In scope

### Out of scope

### Constraints and dependencies

## Risks and weak spots

## Proposed approach

## Detailed implementation steps

## Edge cases

## Tests

## Verification commands

## Rollback / kill switch

## Acceptance criteria
```

## Code examples

Include code examples only where they clarify a fragile interface or guard condition. Keep examples small and explicitly mark them as illustrative if exact APIs may differ.

## Decision options

When there are multiple viable approaches, present top 3 options and score each:

```text
🎯 confidence / 10   🛡️ reliability / 10   🧠 complexity / 10
Approx changes: N-M lines
```

Recommend one option and explain why.

## Safety rules

- Prefer phased plans over mixed large changes.
- Keep diagnostics/readout phases separate from behavior-changing optimization phases when the area is fragile.
- Do not claim certainty where the code has not been inspected.
- Explicitly mark assumptions and how to validate them.
- If the plan could create stale UI, data loss, broad filesystem watching, or hidden performance regressions, call that out as high priority.
