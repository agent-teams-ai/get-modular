/** Every error this package throws or rejects with carries one of these codes; compare `code`, never `instanceof`. */
export type ResourcesErrorCode =
  | "resources.scope.closed"
  | "resources.close.incomplete"
  | "resources.argument.invalid"
  | "resources.scoped.invalid-run-scope";
/** escalate: "release faster" for the current close of the subtree. abandon: "this caller stops waiting". Neither means released. */
export type CloseOptions = {
  readonly escalate?: AbortSignal | undefined;
  readonly abandon?: AbortSignal | undefined;
};
export type Debt =
  | { readonly path: readonly string[]; readonly state: "failed"; readonly cause: unknown }
  | { readonly path: readonly string[]; readonly state: "pending" | "not-run" };
/** settled: false only for the snapshot an abandoning caller receives while the close still runs. */
export type CloseReport = { readonly complete: boolean; readonly settled: boolean; readonly debts: readonly Debt[] };
/** Given to setup: aborted when acquisition must stop (close requested, or the run that constructs the module was cancelled). */
export type SetupContext = { readonly signal: AbortSignal };
/** Given to cleanup: aborted when the Host asks this close to release faster. It never means "skip the release". */
export type CleanupContext = { readonly escalate: AbortSignal };
export type SetupSpec<T> = {
  readonly name: string;
  readonly setup: (context: SetupContext) => T | PromiseLike<T>;
  readonly cleanup: (value: T, context: CleanupContext) => void | PromiseLike<void>;
};
export type ScopeOptions = {
  readonly name: string;
  /** "reverse" (default): one cleanup at a time, LIFO. "concurrent": independent peers are released together. */
  readonly order?: "reverse" | "concurrent" | undefined;
};
export interface Resources {
  /** Aborted when this scope or an ancestor starts closing; stops acquisition, never closes anything. */
  readonly signal: AbortSignal;
  setup<T>(spec: SetupSpec<T>): Promise<T>;
  use<T extends AsyncDisposable | Disposable>(value: T, name: string): T;
  child(options: ScopeOptions): Scope;
}
export interface ScopeControl extends AsyncDisposable {
  close(options?: CloseOptions): Promise<CloseReport>;
}
export type Scope = { readonly resources: Resources; readonly control: ScopeControl };
/** What a module wrapped by scoped() receives from Assembly 0.3.0: no run scope, no service lookup. */
export type ModuleContext = { readonly signal: AbortSignal; readonly resources: Resources };
