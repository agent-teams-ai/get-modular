import { declareModule, defineContract, implement, type CapabilitiesOf } from "@get-modular/assembly";
import { required } from "@get-modular/core";
import { scoped } from "@get-modular/resources";
import { createOrderInbox, type EventSource, type OrderInbox } from "./portable-inbox.ts";

export const Events = defineContract<EventSource>()({ id: "adapter-fixture/events", revision: 1 });
export const Inbox = defineContract<OrderInbox>()({ id: "adapter-fixture/inbox", revision: 1 });
export type EventContracts = typeof Events | typeof Inbox;
export interface EventCapabilities extends CapabilitiesOf<EventContracts> {}

export const inboxDeclaration = declareModule({
  moduleId: "adapter-fixture/inbox", implementationId: "adapter-fixture/inbox/default",
  owner: { authority: "adapter-fixture", path: ["inbox"] },
  provides: [Inbox.provide()], slots: [Events.slot("events", required())],
});

// This optional outer adapter owns subscription custody, not the portable behavior.
export const inboxModule = implement<EventCapabilities>()(inboxDeclaration, async (deps, { resources }) => {
  const inbox = createOrderInbox();
  await resources.setup({
    name: "order-events",
    setup: ({ signal }) => {
      signal.throwIfAborted();
      return deps.events.subscribe((event) => {
        if (!signal.aborted) inbox.record(event);
      });
    },
    cleanup: (unsubscribe) => unsubscribe(),
  });
  return { instance: inbox.port, capabilities: { [Inbox.id]: inbox.port } };
}, scoped);
