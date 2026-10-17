import { optional, required } from "@get-modular/core";
import { declareModule, defineContract, group, implement } from "@get-modular/assembly";
import type { CapabilitiesOf } from "@get-modular/assembly";
import { scoped } from "@get-modular/resources";

export const Clock = defineContract<{ readonly now: () => number }>()({ id: "types/clock", revision: 1 });
export const Orders = defineContract<{ readonly count: () => number }>()({ id: "types/orders", revision: 1 });
export const Audit = defineContract<{ readonly note: (text: string) => void }>()({ id: "types/audit", revision: 1 });
export const ClockV2 = defineContract<{ readonly now: () => number }>()({ id: "types/clock", revision: 2 });
const owner = { authority: "types", path: ["shared"] };

export interface TimeMap extends CapabilitiesOf<typeof Clock> {}
export interface OrdersMap extends CapabilitiesOf<typeof Clock | typeof Orders | typeof Audit> {}
export interface HostMap extends CapabilitiesOf<typeof Clock | typeof Orders | typeof Audit> {}

export const clockDeclaration = declareModule({
  moduleId: "types/clock", implementationId: "types/clock/system", owner,
  provides: [Clock.provide()], slots: [],
});
export const ordersDeclaration = declareModule({
  moduleId: "types/orders", implementationId: "types/orders/default", owner,
  provides: [Orders.provide()],
  slots: [Clock.slot("clock", required()), Audit.slot("audit", optional())],
});

export const clockEntry = implement<TimeMap>()(clockDeclaration, async () => ({
  instance: { now: () => 1 }, capabilities: { "types/clock": { now: () => 1 } },
}));
export const ordersEntry = implement<OrdersMap>()(ordersDeclaration, async (dependencies, context) => ({
  instance: { total: dependencies.clock.now() + (context.resources === undefined ? 0 : 1) },
  capabilities: { "types/orders": { count: () => 2 } },
}), scoped);
export const timeGroup = group("time", [clockEntry]);
export const ordersGroup = group("orders", [ordersEntry]);
