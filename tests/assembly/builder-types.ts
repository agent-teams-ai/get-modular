// ADR-0032: descriptor-built declarations and handles invariant only in the capabilities they use.
import { required } from "@get-modular/core";
import { assemblyFor, declareModule, defineContract } from "@get-modular/assembly";
import type {
  AnyContract, AssemblyPrepareInput, CapabilitiesOf, CapabilityContract, Contract, DeclarationSpec, FactoryContext, ModuleFactory, SuccessfulComposition,
} from "@get-modular/assembly";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type DbPort = { readonly query: (q: string) => number };
type OrdersPort = { readonly list: () => number };
type BillingPort = { readonly charge: (amount: number) => void };
const Db = defineContract<DbPort>()({ id: "acme/db", revision: 3 });
const Orders = defineContract<OrdersPort>()({ id: "acme/orders", revision: 1 });
const Billing = defineContract<BillingPort>()({ id: "acme/billing", revision: 2 });
const SessionId = defineContract<string>()({ id: "acme/session-id", revision: 1 });
const DbOld = defineContract<DbPort>()({ id: "acme/db", revision: 2 });

// A team fragment: its own map, declarations and factory type.
type OrdersCapabilities = CapabilitiesOf<typeof Db | typeof Orders>;
const ordersDeclaration = declareModule({
  moduleId: "acme/orders", implementationId: "acme/orders/default", owner: { authority: "acme", path: ["orders"] },
  provides: [Orders.provide()], slots: [Db.slot("db", required())],
});
const createOrders: ModuleFactory<OrdersCapabilities, typeof ordersDeclaration, { readonly n: number }> =
  async (deps, context: FactoryContext) => {
    const n = deps.db.query(String(context.scope));
    return { instance: { n }, capabilities: { "acme/orders": { list: () => n } } };
  };
const ordersHandle = assemblyFor<OrdersCapabilities>().bindFactory(ordersDeclaration, createOrders);
const billingDeclaration = declareModule({
  moduleId: "acme/billing", implementationId: "acme/billing/default", owner: { authority: "acme", path: ["billing"] },
  provides: [Billing.provide()], slots: [],
});
const billingHandle = assemblyFor<CapabilitiesOf<typeof Billing>>().bindFactory(billingDeclaration, async () => ({
  instance: 0, capabilities: { "acme/billing": { charge: (amount: number) => { void amount; } } },
}));

// The Host derives its map from descriptors and prepares fragments it never re-binds.
interface HostCapabilities extends CapabilitiesOf<typeof Db | typeof Orders | typeof Billing | typeof SessionId> {}
const host = assemblyFor<HostCapabilities>();
const dbDeclaration = declareModule({
  moduleId: "acme/db", implementationId: "acme/db/pg", owner: { authority: "acme", path: ["db"] }, provides: [Db.provide()], slots: [],
});
const dbHandle = host.bindFactory(dbDeclaration, async () => ({ instance: 0, capabilities: { "acme/db": { query: () => 1 } } }));
const sessionDeclaration = declareModule({
  moduleId: "acme/session", implementationId: "acme/session/input", owner: { authority: "acme", path: ["session"] },
  provides: [SessionId.provide()], slots: [],
});
const session = host.bindInput(sessionDeclaration);
declare const composition: SuccessfulComposition;
declare const maybe: AbortSignal | undefined;
export async function assemble(): Promise<number> {
  const ready = await host.prepare({
    composition, factories: [dbHandle, ordersHandle, billingHandle], roots: { orders: ordersHandle }, inputs: { session },
  });
  if (ready.status !== "prepared") return 0;
  const outcome = await ready.prepared.run({ signal: maybe, scope: undefined, inputs: { session: { "acme/session-id": "s1" } } });
  return outcome.status === "succeeded" ? outcome.roots.orders.n : 0;
}
// The 0.2.0 spelling of the prepare input still names a valid input.
const legacyInput: AssemblyPrepareInput<HostCapabilities, { readonly orders: typeof ordersHandle }> = {
  composition, factories: [dbHandle, ordersHandle], roots: { orders: ordersHandle },
};
void host.prepare(legacyInput);
// The 0.2.0 explicit type argument still compiles: prepare keeps R as its first parameter.
void host.prepare<{ readonly orders: typeof ordersHandle }>({
  composition, factories: [dbHandle, ordersHandle], roots: { orders: ordersHandle },
});
// A custom factory context type is honored by ModuleFactory.
type RequestContext = FactoryContext & { readonly requestId: string };
const contextual: ModuleFactory<OrdersCapabilities, typeof ordersDeclaration, string, RequestContext> =
  async (_deps, context) => ({ instance: context.requestId, capabilities: { "acme/orders": { list: () => 1 } } });
void contextual;
// A hand-written map equals the derived one, so both kinds of map meet in one Host.
type Manual = { readonly "acme/db": CapabilityContract<DbPort, "acme/db/r3"> };
const derived: Equal<Manual, CapabilitiesOf<typeof Db>> = true;
void derived;
// Key remapping keeps the result of the former per-key distribution, also for one id at two revisions.
type DistributedCapabilities<T extends AnyContract> = {
  readonly [Id in T["id"]]: T extends Contract<Id, infer V, infer Rev> ? CapabilityContract<V, `${Id}/r${Rev}`> : never;
};
const singleUnchanged: Equal<DistributedCapabilities<typeof Db>, CapabilitiesOf<typeof Db>> = true;
const duplicateIdUnchanged: Equal<DistributedCapabilities<typeof Db | typeof DbOld>, CapabilitiesOf<typeof Db | typeof DbOld>> = true;
const mixedUnchanged: Equal<DistributedCapabilities<typeof Db | typeof DbOld | typeof Orders>, CapabilitiesOf<typeof Db | typeof DbOld | typeof Orders>> = true;
const duplicateIdUnion: Equal<CapabilitiesOf<typeof Db | typeof DbOld>, {
  readonly "acme/db": CapabilityContract<DbPort, "acme/db/r3"> | CapabilityContract<DbPort, "acme/db/r2">;
}> = true;
void duplicateIdUnion; void singleUnchanged; void duplicateIdUnchanged; void mixedUnchanged;

// Rejections.
const staleDeclaration = declareModule({
  moduleId: "acme/orders", implementationId: "acme/orders/stale", owner: { authority: "acme", path: ["orders"] },
  provides: [Orders.provide()], slots: [DbOld.slot("db", required())],
});
const staleHandle = assemblyFor<CapabilitiesOf<typeof DbOld | typeof Orders>>().bindFactory(staleDeclaration,
  async () => ({ instance: 0, capabilities: { "acme/orders": { list: () => 1 } } }));
// @ts-expect-error A used capability bound under an older revision differs from the Host contract.
void host.prepare({ composition, factories: [dbHandle, staleHandle], roots: { orders: staleHandle } });
// A copy of the Db descriptor that promises more than the Host contract under the same id and revision.
const DbWider = defineContract<DbPort & { readonly close: () => void }>()({ id: "acme/db", revision: 3 });
const widerHandle = assemblyFor<CapabilitiesOf<typeof DbWider | typeof Orders>>().bindFactory(declareModule({
  moduleId: "acme/orders", implementationId: "acme/orders/wider", owner: { authority: "acme", path: ["orders"] },
  provides: [Orders.provide()], slots: [DbWider.slot("db", required())],
}), async ({ db }) => ({ instance: 0, capabilities: { "acme/orders": { list: () => { db.close(); return 1; } } } }));
// @ts-expect-error A consumer expecting more of a used capability than the Host contract is rejected.
void host.prepare({ composition, factories: [dbHandle, widerHandle], roots: { orders: widerHandle } });
const Audit = defineContract<{ readonly write: (line: string) => void }>()({ id: "acme/audit", revision: 1 });
const auditDeclaration = declareModule({
  moduleId: "acme/audit", implementationId: "acme/audit/file", owner: { authority: "acme", path: ["audit"] },
  provides: [Audit.provide()], slots: [],
});
const auditHandle = assemblyFor<CapabilitiesOf<typeof Audit>>().bindFactory(auditDeclaration,
  async () => ({ instance: 0, capabilities: { "acme/audit": { write: () => {} } } }));
// @ts-expect-error Every capability a handle uses must be part of the preparing map.
void host.prepare({ composition, factories: [dbHandle, auditHandle], roots: { audit: auditHandle } });
const mixedDeclaration = declareModule({
  moduleId: "acme/audited", implementationId: "acme/audited/default", owner: { authority: "acme", path: ["audit"] },
  provides: [Audit.provide()], slots: [Db.slot("db", required())],
});
const mixedHandle = assemblyFor<CapabilitiesOf<typeof Audit | typeof Db>>().bindFactory(mixedDeclaration,
  async () => ({ instance: 0, capabilities: { "acme/audit": { write: () => {} } } }));
// @ts-expect-error One known and one unknown used capability is still rejected.
void host.prepare({ composition, factories: [dbHandle, mixedHandle], roots: { db: dbHandle } });
const auditedSession = assemblyFor<CapabilitiesOf<typeof Audit | typeof SessionId>>().bindInput(declareModule({
  moduleId: "acme/audited-session", implementationId: "acme/audited-session/input", owner: { authority: "acme", path: ["session"] },
  provides: [SessionId.provide(), Audit.provide()], slots: [],
}));
// @ts-expect-error An input handle with one known and one unknown capability is rejected too.
void host.prepare({ composition, factories: [dbHandle], roots: { db: dbHandle }, inputs: { session: auditedSession } });
// @ts-expect-error Authors never write wire compatibility by hand.
declareModule({ moduleId: "x/y", implementationId: "x/y", owner: { authority: "x", path: ["x"] }, provides: [{ capabilityId: "acme/db", compatibility: { family: "exact", familyVersion: 1, token: "acme/db/r3" } }], slots: [] });
// @ts-expect-error declareModule supplies kind and schemaVersion.
declareModule({ kind: "get-modular.module-declaration", moduleId: "x/y", implementationId: "x/y", owner: { authority: "x", path: ["x"] }, provides: [], slots: [] });
// @ts-expect-error A slot built from another revision does not match the binding map.
host.bindFactory(staleDeclaration, async () => ({ instance: 0, capabilities: { "acme/orders": { list: () => 1 } } }));
// @ts-expect-error Capability values follow the contract owner's type.
host.bindFactory(dbDeclaration, async () => ({ instance: 0, capabilities: { "acme/db": { query: () => "no" } } }));
// @ts-expect-error A module factory is typed by its own map, not widened by the Host.
const wrongFactory: ModuleFactory<OrdersCapabilities, typeof ordersDeclaration, number> = async (deps) => ({ instance: deps.db.missing, capabilities: { "acme/orders": { list: () => 1 } } });
void wrongFactory;
// @ts-expect-error A property missing on the custom context type is rejected.
const missingContext: ModuleFactory<OrdersCapabilities, typeof ordersDeclaration, string, RequestContext> = async (_deps, context) => ({ instance: context.missing, capabilities: { "acme/orders": { list: () => 1 } } });
void missingContext;
// @ts-expect-error schemaVersion is supplied by declareModule, never written by the author.
declareModule({ schemaVersion: 1, moduleId: "x/y", implementationId: "x/y", owner: { authority: "x", path: ["x"] }, provides: [], slots: [] });
// @ts-expect-error A hand-written slot entry is not accepted; only descriptor-made entries are.
declareModule({ moduleId: "x/y", implementationId: "x/y", owner: { authority: "x", path: ["x"] }, provides: [], slots: [{ slotId: "db", capabilityId: "acme/db", compatibility: { family: "exact", familyVersion: 1, token: "acme/db/r3" }, cardinality: required() }] });
// A spec typed as the plain DeclarationSpec keeps declareModule typed, so a wrong factory is still rejected.
declare const widenedSpec: DeclarationSpec;
// @ts-expect-error A widened spec must not turn the bound declaration into never and disable checking.
void host.bindFactory(declareModule(widenedSpec), async () => ({ instance: 0, capabilities: { "acme/whatever": 42 } }));
