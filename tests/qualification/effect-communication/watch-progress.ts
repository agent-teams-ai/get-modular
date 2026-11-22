import type { ReadonlyStore, Snapshot, WatchSpec } from "@get-modular/observation";

export type ProgressState = { readonly completed: number };
export type ProgressSnapshot = Snapshot<ProgressState>;
export type ProgressSubscriptionLimit = {
  readonly _tag: "ProgressSubscriptionLimit";
  readonly cause: unknown;
};
export type ProgressWatchAdmission =
  | { readonly status: "subscribed"; readonly initial: ProgressSnapshot }
  | { readonly status: "refused"; readonly failure: ProgressSubscriptionLimit };

/**
 * Concrete consumer composition adapter. The caller owns the supplied scope.
 * Only exhausted watch capacity is recoverable; other failures and cancellation throw.
 */
export function watchProgress(
  source: ReadonlyStore<ProgressState>,
  spec: WatchSpec<ProgressSnapshot>,
): ProgressWatchAdmission {
  const initial = source.read(["completed"]);
  try {
    source.watch(initial, spec);
  } catch (cause) {
    let budgetRefused = false;
    try {
      // An aborted scope rethrows its owner's arbitrary reason without inspecting it.
      budgetRefused = !spec.resources.signal.aborted && typeof cause === "object" && cause !== null && "code" in cause
        && cause.code === "observation.subscriptions.limit";
    } catch {
      // A malformed spec or unknown error getter must not replace the original failure.
    }
    if (budgetRefused) {
      return { status: "refused", failure: { _tag: "ProgressSubscriptionLimit", cause } };
    }
    throw cause;
  }
  return { status: "subscribed", initial };
}
