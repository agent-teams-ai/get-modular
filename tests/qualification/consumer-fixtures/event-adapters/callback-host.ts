import { assemblyFor, declareModule, implement } from "@get-modular/assembly";
import { createScope } from "@get-modular/resources";
import { Events, inboxModule, type EventCapabilities } from "./inbox.module.ts";
import type { EventSource, OrderInbox, OrderNotice } from "./portable-inbox.ts";

export type Subscribable = {
  readonly subscribe: (next: (event: OrderNotice) => void) => { readonly unsubscribe: () => void };
};

export const callbackDeclaration = declareModule({
  moduleId: "adapter-fixture/callback", implementationId: "adapter-fixture/callback/default",
  owner: { authority: "adapter-fixture", path: ["callback"] },
  provides: [Events.provide()], slots: [],
});

export function callbackProvider(source: Subscribable, onConstruct: () => void) {
  return implement<EventCapabilities>()(callbackDeclaration, async () => {
    onConstruct();
    const port: EventSource = {
      subscribe: (listener) => {
        const subscription = source.subscribe((event) => { listener(event); });
        return () => subscription.unsubscribe();
      },
    };
    return { instance: {}, capabilities: { [Events.id]: port } };
  });
}

// A bounded request/CLI-style Host: it returns only copied observations after cleanup.
// The callback source is borrowed. This live-only port does not model error/completion.
export async function runCallbackHost(
  source: Subscribable,
  onConstruct: () => void,
  operation: (inbox: OrderInbox) => Promise<readonly string[]>,
) {
  const provider = callbackProvider(source, onConstruct);
  const preparation = await assemblyFor<EventCapabilities>().prepare({
    profileId: "adapter-fixture/callback-host",
    modules: [provider, inboxModule], roots: { inbox: inboxModule },
  });
  if (preparation.status !== "prepared") throw new Error("callback preparation failed", { cause: preparation });
  const scope = createScope({ name: "callback-request" });
  // Language-level disposal preserves both body and cleanup failures.
  await using lifetime = scope.control;
  const outcome = await preparation.prepared.run({ scope: scope.resources });
  if (outcome.status !== "succeeded") throw new Error("callback construction failed", { cause: outcome });
  return [...await operation(outcome.roots.inbox)];
}
