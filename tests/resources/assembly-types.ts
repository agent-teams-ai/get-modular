import { required } from "@get-modular/core";
import {
  assemblyFor, declareModule, defineContract,
  type CapabilitiesOf, type FactoryContext, type ModuleFactory,
} from "@get-modular/assembly";
import { scoped, type ModuleContext } from "@get-modular/resources";

// ADR-0030 with ADR-0031 and ADR-0032: scoped() infers the Assembly context and
// the typed dependency record through the real bindFactory.
type Query = { query(text: string): number };
type List = { list(): number };
const Db = defineContract<Query>()({ id: "acme/db", revision: 1 });
const Orders = defineContract<List>()({ id: "acme/orders", revision: 1 });
interface Capabilities extends CapabilitiesOf<typeof Db | typeof Orders> {}
const orders = declareModule({
  moduleId: "acme/orders", implementationId: "acme/orders/default",
  owner: { authority: "acme", path: ["orders"] },
  provides: [Orders.provide()], slots: [Db.slot("db", required())],
});
const api = assemblyFor<Capabilities>();

api.bindFactory(orders, scoped(orders.implementationId, async (deps, context) => {
  const rows: number = deps.db.query("select 1");
  const module: ModuleContext = context;
  const connection = await context.resources.setup({
    name: "conn", setup: ({ signal }) => ({ signal, rows }), cleanup: (value, { escalate }) => { void value.rows; void escalate; },
  });
  // @ts-expect-error the run scope is stripped from the module context
  void context.scope;
  // @ts-expect-error a slot the declaration does not have
  void deps.cache;
  return { instance: connection, capabilities: { "acme/orders": { list: () => rows + (module.signal.aborted ? 0 : 1) } } };
}));

// A module package types its unbound factory with its own map and ModuleContext.
export const createOrders: ModuleFactory<CapabilitiesOf<typeof Db | typeof Orders>, typeof orders, number, ModuleContext> =
  async (deps, { resources }) => {
    const rows = await resources.setup({ name: "conn", setup: () => deps.db.query("x"), cleanup: () => {} });
    return { instance: rows, capabilities: { "acme/orders": { list: () => rows } } };
  };
api.bindFactory(orders, scoped(orders.implementationId, createOrders));
// @ts-expect-error an unwrapped ModuleContext factory cannot bind: FactoryContext has no resources
api.bindFactory(orders, createOrders);
const context: FactoryContext = { signal: new AbortController().signal, scope: undefined };
void context;
