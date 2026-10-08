import {
  createScope, scoped,
  type CloseOptions, type CloseReport, type Debt, type ModuleContext, type Resources,
  type ResourcesErrorCode, type Scope, type ScopeControl,
} from "../dist/index.js";

// A stand-in for Assembly 0.3.0 bindFactory: the context carries signal and the opaque run scope.
declare function bindCurrent<D>(
  factory: (deps: D, context: { readonly signal: AbortSignal; readonly scope: unknown }) => Promise<number>,
): void;
bindCurrent<{ readonly db: number }>(scoped("m", async (deps, context) => {
  const db: number = deps.db;
  const module: ModuleContext = context;
  const five = await context.resources.setup({
    name: "five",
    setup: ({ signal }) => { void signal; return 5 as const; },
    cleanup: (value: 5, { escalate }) => { void value; void escalate; },
  });
  // @ts-expect-error a wrapped module never reads the run scope
  void context.scope;
  // @ts-expect-error Resources registers; it has no closing authority
  void context.resources.close;
  // @ts-expect-error Resources never exposes the control facet
  void context.resources.control;
  return db + five + (module.signal.aborted ? 0 : 1);
}));
// A wrapped factory needs FactoryContext.scope: Assembly 0.2.0 cannot bind it.
declare function bindLegacy<D>(factory: (deps: D, context: { readonly signal: AbortSignal }) => Promise<unknown>): void;
// @ts-expect-error the run context of Assembly 0.2.0 has no scope
bindLegacy(scoped("m", async () => 1));
// A future context field reaches wrapped modules without a resources release.
declare function bindFuture(factory: (deps: { readonly db: number }, context: {
  readonly signal: AbortSignal; readonly scope: unknown; readonly attempt: number;
}) => number): void;
bindFuture(scoped("m", (deps, context) => deps.db + context.attempt));

const sessions: Scope = createScope({ name: "sessions", order: "concurrent" });
const control: ScopeControl = sessions.control;
// @ts-expect-error ScopeControl is not Resources
const resources: Resources = sessions.control;
// @ts-expect-error an invalid release order
createScope({ name: "x", order: "parallel" });
// @ts-expect-error a scope needs a name
createScope({});
// @ts-expect-error a child needs a name
sessions.resources.child({});
// @ts-expect-error no scope option whose abort does not close the scope
sessions.resources.child({ name: "c", signal: new AbortController().signal });
// @ts-expect-error an entry needs a name
void sessions.resources.setup({ setup: () => 5, cleanup: () => {} });
// @ts-expect-error an entry needs a name
sessions.resources.use({ [Symbol.dispose]() {} });
// @ts-expect-error cleanup receives the setup value type
void sessions.resources.setup({ name: "n", setup: () => 5, cleanup: (value: string) => { void value; } });
// @ts-expect-error cleanup gets { escalate }, never the setup signal
void sessions.resources.setup({ name: "n", setup: () => 5, cleanup: (_value, { signal }) => { void signal; } });
// @ts-expect-error use() needs a disposable
sessions.resources.use({ close() {} }, "x");
// exactOptionalPropertyTypes: a wrapper may forward an optional signal without conditional spreads.
declare const maybe: AbortSignal | undefined;
const options: CloseOptions = { escalate: maybe, abandon: maybe };
const report: Promise<CloseReport> = control.close(options);
declare const debt: Debt;
if (debt.state === "failed") { void debt.cause; } else {
  // @ts-expect-error only a failed debt carries a cause
  void debt.cause;
}
declare const error: { readonly code: ResourcesErrorCode };
switch (error.code) {
  case "resources.scope.closed":
  case "resources.close.incomplete":
  case "resources.argument.invalid":
  case "resources.scoped.invalid-run-scope":
    break;
  default: {
    const exhaustive: never = error.code;
    void exhaustive;
  }
}
void resources;
void report;
