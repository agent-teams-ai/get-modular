# Review budget note 09: horizon

This note is part of the review-request-budget validation fixture. It documents how
the horizon concern behaves when a single review execution covers many changed files.

## Scope

- one execution per review run, admitted once at the start;
- model transport requests are counted against the admitted run budget;
- horizon decisions must stay stable while batches stream in.

## Behavior

The horizon path reads the admitted limits once and never widens them mid-run. When a
later batch arrives, the run continues in the same execution, so the remaining
budget is the admitted budget minus the requests already claimed.

## Failure handling

If the budget is exhausted the run reports incomplete coverage instead of silently
dropping files. The summary then lists reviewed and unreviewed paths so the next
run can pick up exactly the missing work.

## Notes

- keep horizon state per execution, never per batch;
- never refund claimed requests after a provider error;
- treat upstream transport errors as retryable only within the attempt budget.
