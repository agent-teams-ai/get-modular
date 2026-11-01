import assert from "node:assert/strict";
import test from "node:test";
import { assemblyFor, declareModule, defineContract, implement, type CapabilitiesOf } from "@get-modular/assembly";
import { required } from "@get-modular/core";
import { createScope, scoped } from "@get-modular/resources";

type OrderNotice = { readonly kind: "order"; readonly id: string };
type EventSource = { readonly subscribe: (listener: (event: OrderNotice) => undefined) => () => void };
type OrderInbox = { readonly received: () => readonly string[] };

// The domain owns these contracts. No Get Modular event runtime is required.
const Events = defineContract<EventSource>()({ id: "demo/events", revision: 1 });
const Inbox = defineContract<OrderInbox>()({ id: "demo/inbox", revision: 1 });
type EventContracts = typeof Events | typeof Inbox;
interface EventCapabilities extends CapabilitiesOf<EventContracts> {}

type Subscription = { readonly unsubscribe: () => void };
type Subscribable<T> = { readonly subscribe: (next: (value: T) => void) => Subscription };

// Matches sources with subscribe(next) -> { unsubscribe }, including RxJS-style sources.
// Source errors and completion are NOT modeled by this deliberately live-only port.
function fromSubscribable(source: Subscribable<OrderNotice>): EventSource {
  return {
    subscribe: (listener) => {
      const subscription = source.subscribe((event) => { listener(event); });
      return () => subscription.unsubscribe();
    },
  };
}

function isOrderNotice(value: unknown): value is OrderNotice {
  return typeof value === "object" && value !== null && "kind" in value && value.kind === "order"
    && "id" in value && typeof value.id === "string";
}

// A second, independent adapter using only the standard platform event API.
function fromEventTarget(target: EventTarget): EventSource {
  return {
    subscribe: (listener) => {
      const onOrder = (event: Event): void => {
        if (event instanceof CustomEvent && isOrderNotice(event.detail)) listener(event.detail);
      };
      target.addEventListener("order", onOrder);
      return () => target.removeEventListener("order", onOrder);
    },
  };
}

const libraryDeclaration = declareModule({
  moduleId: "demo/events/library", implementationId: "demo/events/library/default",
  owner: { authority: "demo", path: ["events"] }, provides: [Events.provide()], slots: [],
});
const nativeDeclaration = declareModule({
  moduleId: "demo/events/native", implementationId: "demo/events/native/default",
  owner: { authority: "demo", path: ["events"] }, provides: [Events.provide()], slots: [],
});
const inboxDeclaration = declareModule({
  moduleId: "demo/inbox", implementationId: "demo/inbox/default",
  owner: { authority: "demo", path: ["inbox"] },
  provides: [Inbox.provide()], slots: [Events.slot("events", required())],
});
const inboxModule = implement<EventCapabilities>()(inboxDeclaration, async (deps, { resources }) => {
  const received: string[] = [];
  await resources.setup({
    name: "order-events",
    setup: ({ signal }) => {
      signal.throwIfAborted();
      return deps.events.subscribe((event) => {
        if (!signal.aborted) received.push(event.id);
      });
    },
    cleanup: (unsubscribe) => unsubscribe(),
  });
  const port: OrderInbox = { received: () => [...received] };
  return { instance: port, capabilities: { "demo/inbox": port } };
}, scoped);

function makeLibrarySource() {
  const listeners = new Set<(event: OrderNotice) => void>();
  let released = 0;
  const source: Subscribable<OrderNotice> = {
    subscribe: (next) => {
      listeners.add(next);
      return { unsubscribe: () => { released += 1; listeners.delete(next); } };
    },
  };
  return {
    source,
    emit: (id: string): void => { for (const listener of listeners) listener({ kind: "order", id }); },
    live: () => listeners.size,
    released: () => released,
  };
}

test("Host selects interchangeable event adapters without an event runtime dependency", async () => {
  const library = makeLibrarySource();
  const native = new EventTarget();
  let libraryCreations = 0, nativeCreations = 0;
  const libraryModule = implement<EventCapabilities>()(libraryDeclaration, async () => {
    libraryCreations += 1;
    return { instance: {}, capabilities: { "demo/events": fromSubscribable(library.source) } };
  });
  const nativeModule = implement<EventCapabilities>()(nativeDeclaration, async () => {
    nativeCreations += 1;
    return { instance: {}, capabilities: { "demo/events": fromEventTarget(native) } };
  });
  const allModules = [libraryModule, nativeModule, inboxModule] as const;
  // Each selected root includes only its chosen provider; an unused library need not be installed or imported.
  const libraryPreparation = await assemblyFor<EventCapabilities>().prepare({
    profileId: "demo/library", modules: [libraryModule, inboxModule] as const,
    roots: { inbox: inboxModule },
  });
  const nativePreparation = await assemblyFor<EventCapabilities>().prepare({
    profileId: "demo/native", modules: [nativeModule, inboxModule] as const,
    roots: { inbox: inboxModule },
  });
  assert.equal(libraryPreparation.status, "prepared");
  assert.equal(nativePreparation.status, "prepared");
  if (libraryPreparation.status !== "prepared" || nativePreparation.status !== "prepared") {
    throw new Error("preparation failed");
  }

  // Two candidates need an explicit binding; the compiler never guesses one.
  const ambiguous = await assemblyFor<EventCapabilities>().prepare({
    profileId: "demo/ambiguous", modules: allModules, roots: { inbox: inboxModule },
  });
  assert.equal(ambiguous.status, "failed");
  if (ambiguous.status === "failed") assert.equal(ambiguous.error.code, "assembly.prepare.unresolved-binding");
  assert.equal(library.live(), 0);

  // When several providers are deliberately installed, the Host must choose one explicitly.
  const bound = await assemblyFor<EventCapabilities>().prepare({
    profileId: "demo/explicit", modules: allModules,
    bindings: [{
      consumerImplementationId: inboxDeclaration.implementationId, slotId: "events",
      providerImplementationIds: [libraryDeclaration.implementationId],
    }],
    roots: { inbox: inboxModule },
  });
  assert.equal(bound.status, "prepared");
  assert.equal(libraryCreations, 0);
  assert.equal(nativeCreations, 0);


  const host = createScope({ name: "event-host" });
  try {
    const libraryRun = host.resources.child({ name: "library-run" });
    const nativeRun = host.resources.child({ name: "native-run" });
    const first = await libraryPreparation.prepared.run({ scope: libraryRun.resources });
    const second = await nativePreparation.prepared.run({ scope: nativeRun.resources });
    assert.equal(libraryCreations, 1);
    assert.equal(nativeCreations, 1);
    assert.equal(first.status, "succeeded");
    assert.equal(second.status, "succeeded");
    if (first.status !== "succeeded" || second.status !== "succeeded") throw new Error("run failed");
    const left = first.roots.inbox, right = second.roots.inbox;
    library.emit("same");
    library.emit("same");
    native.dispatchEvent(new CustomEvent("order", { detail: { kind: "order", id: "native" } }));
    assert.deepEqual(left.received(), ["same", "same"]);
    assert.deepEqual(right.received(), ["native"]);
    assert.equal(library.live(), 1);

    assert.equal((await libraryRun.control.close()).complete, true);
    assert.equal(library.live(), 0);
    assert.equal(library.released(), 1);
    library.emit("after-close");
    native.dispatchEvent(new CustomEvent("order", { detail: { kind: "order", id: "still-active" } }));
    assert.deepEqual(left.received(), ["same", "same"]);
    assert.deepEqual(right.received(), ["native", "still-active"]);
    assert.equal((await nativeRun.control.close()).complete, true);
    native.dispatchEvent(new CustomEvent("order", { detail: { kind: "order", id: "after-close" } }));
    assert.deepEqual(right.received(), ["native", "still-active"]);
    assert.equal((await host.control.close()).complete, true);
  } finally {
    await host.control.close();
  }
});
