import { many, optional, required } from "@get-modular/core";
import {
  assemblyFor, declareModule, defineContract,
  type CapabilitiesOf, type FactoryContext, type ModuleFactory,
} from "@get-modular/assembly";
import type { ModuleContext } from "@get-modular/resources";
import {
  contractSuite, guardHandles, isolate, runContractSuite, smoke,
  type CaseContext, type ConformanceError, type ConformanceErrorCode, type ContractSubject, type ContractValue,
  type HandleGuard, type Isolated, type SmokeInjection, type SmokeStep, type TestFn,
} from "../dist/index.js";

// ADR-0033: the signatures keep the capability types of the caller's own map.
type Query = { query(text: string): number };
type List = { list(): number };
type Audit = { record(event: string): void };
const Db = defineContract<Query>()({ id: "acme/db", revision: 1 });
const Orders = defineContract<List>()({ id: "acme/orders", revision: 1 });
const AuditLog = defineContract<Audit>()({ id: "acme/audit", revision: 1 });
interface Capabilities extends CapabilitiesOf<typeof Db | typeof Orders | typeof AuditLog> {}
const orders = declareModule({
  moduleId: "acme/orders", implementationId: "acme/orders/default", owner: { authority: "acme", path: ["orders"] },
  provides: [Orders.provide()],
  slots: [Db.slot("db", required()), AuditLog.slot("audit", optional()), Db.slot("replicas", many({ min: 0, max: 2 }))],
});
const api = assemblyFor<Capabilities>();
const createOrders: ModuleFactory<Capabilities, typeof orders, number, ModuleContext> = async (deps, { resources }) => {
  const rows = await resources.setup({ name: "rows", setup: () => deps.db.query("x") + deps.replicas.length, cleanup: () => {} });
  void deps.audit?.record("created");
  return { instance: rows, capabilities: { "acme/orders": { list: () => rows } } };
};
const db: Query = { query: () => 1 };

// A module is built with typed fakes and its instance and capabilities keep their types.
const built: Promise<Isolated<number, { readonly "acme/orders": List }>> = isolate(api, {
  declaration: orders, factory: createOrders, dependencies: { db, audit: undefined, replicas: [db] },
});
void built.then(async isolated => {
  const instance: number = isolated.instance;
  const rows: number = isolated.capabilities["acme/orders"].list();
  const report: Promise<{ readonly complete: boolean }> = isolated.close();
  await using _disposable: AsyncDisposable = isolated;
  void instance; void rows; void report;
});
void isolate(api, {
  declaration: orders, factory: createOrders, dependencies: { db, audit: undefined, replicas: [] },
  signal: new AbortController().signal,
});
// @ts-expect-error a fake with a renamed method is not the contract's port
void isolate(api, { declaration: orders, factory: createOrders, dependencies: { db: { qurey: () => 1 }, audit: undefined, replicas: [] } });
// @ts-expect-error a required slot needs a fake
void isolate(api, { declaration: orders, factory: createOrders, dependencies: { audit: undefined, replicas: [] } });
void isolate(api, {
  declaration: orders,
  // @ts-expect-error a module that reads the run scope cannot be built here: its context is a ModuleContext
  factory: async (_deps: unknown, context: FactoryContext) => ({ instance: 1, capabilities: { "acme/orders": { list: () => context.scope === undefined ? 1 : 2 } } }),
  dependencies: { db, audit: undefined, replicas: [] },
});

// A contract owner publishes a suite whose cases see the contract's value type.
const suite = contractSuite(Orders, {
  "lists rows": async (subject, context: CaseContext) => {
    const rows: number = subject.list();
    void context.resources.signal; void rows;
  },
  // @ts-expect-error the case sees the contract's value type, not any
  "reads a member the port lacks": (subject: ContractValue<typeof Orders>) => { void subject.lisst(); },
});
const subject: ContractSubject<typeof Orders> = {
  name: "default", declaration: orders, create: async ({ resources }) => ({ list: () => resources.signal.aborted ? 0 : 1 }),
};
const test: TestFn = (name, body) => { void name; void body; };
runContractSuite(suite, subject, test);
runContractSuite(suite, {
  name: "wrong",
  declaration: orders,
  // @ts-expect-error create must return the contract's value type
  create: () => ({ wrong: 1 }),
}, test);

// smoke needs inputs exactly when the root declares them.
const Session = defineContract<{ readonly id: string }>()({ id: "acme/session", revision: 1 });
const sessionInput = declareModule({
  moduleId: "acme/session-input", implementationId: "acme/session-input", owner: { authority: "acme", path: ["session"] },
  provides: [Session.provide()], slots: [],
});
interface SessionCapabilities extends CapabilitiesOf<typeof Session | typeof Orders> {}
declare const sessionApi: ReturnType<typeof assemblyFor<SessionCapabilities>>;
const session = sessionApi.bindInput(sessionInput);
declare const withInputs: (api: typeof sessionApi) => ReturnType<typeof sessionApi.prepare<{ readonly root: never }, { readonly session: typeof session }>>;
declare const withoutInputs: (api: typeof sessionApi) => ReturnType<typeof sessionApi.prepare<{ readonly root: never }>>;
const steps: Promise<readonly SmokeStep[]> = smoke({
  api: sessionApi, compose: withInputs, inputs: { session: { "acme/session": { id: "s1" } } }, inject: ["fail"] satisfies readonly SmokeInjection[],
});
void smoke({ api: sessionApi, compose: withoutInputs });
// @ts-expect-error a root with declared inputs needs them
void smoke({ api: sessionApi, compose: withInputs });
void steps;

const guard: HandleGuard = guardHandles({ allow: ["TCPServerWrap"] });
void guard.check();

declare const error: ConformanceError;
const reason: ConformanceErrorCode = error.code;
switch (reason) {
  case "conformance.argument.invalid":
  case "conformance.isolate.construction-failed":
  case "conformance.smoke.failed":
  case "conformance.suite.revision-mismatch":
  case "conformance.suite.case-failed":
  case "conformance.handles.leaked":
  case "conformance.handles.unsupported-runtime":
    break;
  default: {
    const exhaustive: never = reason;
    void exhaustive;
  }
}
