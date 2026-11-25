import { assemblyFor, declareModule, implement } from "@get-modular/assembly";
import { createScope } from "@get-modular/resources";
import { Events, inboxModule, type EventCapabilities } from "./inbox.module.ts";
import type { EventSource, OrderNotice } from "./portable-inbox.ts";

function isOrderNotice(value: unknown): value is OrderNotice {
  return typeof value === "object" && value !== null && "kind" in value && value.kind === "order"
    && "id" in value && typeof value.id === "string";
}

export const eventTargetDeclaration = declareModule({
  moduleId: "adapter-fixture/native", implementationId: "adapter-fixture/native/default",
  owner: { authority: "adapter-fixture", path: ["native"] },
  provides: [Events.provide()], slots: [],
});

export function eventTargetProvider(target: EventTarget, onConstruct: () => void) {
  return implement<EventCapabilities>()(eventTargetDeclaration, async () => {
    onConstruct();
    const port: EventSource = {
      subscribe: (listener) => {
        const onOrder = (event: Event): void => {
          if (event instanceof CustomEvent && isOrderNotice(event.detail)) listener(event.detail);
        };
        target.addEventListener("order", onOrder);
        return () => target.removeEventListener("order", onOrder);
      },
    };
    return { instance: {}, capabilities: { [Events.id]: port } };
  });
}

// A separately wired session Host: explicit ownership is handed to its caller.
// It runs on Node EventTarget in this fixture, not a browser or an isolation boundary.
export async function openEventTargetHost(target: EventTarget, onConstruct: () => void) {
  const owner = createScope({ name: "event-target-session" });
  try {
    const provider = eventTargetProvider(target, onConstruct);
    const prepared = await assemblyFor<EventCapabilities>().prepare({
      profileId: "adapter-fixture/event-target-host",
      modules: [inboxModule, provider], roots: { inbox: inboxModule },
    });
    if (prepared.status !== "prepared") throw new Error("native preparation failed", { cause: prepared });
    const outcome = await prepared.prepared.run({ scope: owner.resources });
    if (outcome.status !== "succeeded") throw new Error("native construction failed", { cause: outcome });
    return { inbox: outcome.roots.inbox, control: owner.control };
  } catch (failure) {
    const report = await owner.control.close();
    if (!report.complete || !report.settled) {
      throw new AggregateError([failure, report], "native construction and cleanup failed");
    }
    throw failure;
  }
}
