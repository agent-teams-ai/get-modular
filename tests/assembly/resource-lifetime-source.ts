// This probe is materialized beside the exact documentation sources, then strictly compiled and executed.
// Keeping it as generated fixture source avoids unresolved imports in the repository source graph.
export const resourceLifetimeSource = String.raw`/// <reference types="node" />
// Materialized beside the exact module-authoring resource example and strictly compiled with it.
// The documented factory is the subject; these fakes only observe its external effects.
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { isolate } from "@get-modular/conformance";
import { createScope } from "@get-modular/resources";
import type { EventsPort } from "./src/features/infra/contracts/events.js";
import { PgOrders } from "./src/features/orders/adapters/outbound/pg-orders.js";
import { orderStoreModule } from "./src/features/orders/composition/order-store.module.js";

type Listener = Parameters<EventsPort["subscribe"]>[0];
type Client = { readonly seen: string[]; closes: number };

function observeClients(context: TestContext, afterOpen: (signal: AbortSignal) => void = () => {}) {
  const observations: Client[] = [];
  const original = PgOrders.create;
  context.after(() => { PgOrders.create = original; });
  PgOrders.create = async (url, signal) => {
    const client = await original(url, signal);
    const observation: Client = { seen: [], closes: 0 };
    observations.push(observation);
    const forget = client.forget;
    const close = client.close;
    Object.defineProperties(client, {
      forget: { value: (id: string): void => { observation.seen.push(id); forget(id); } },
      close: { value: async (): Promise<void> => { observation.closes += 1; await close(); } },
    });
    afterOpen(signal);
    return client;
  };
  return observations;
}

function eventSource(duringSubscribe: (listener: Listener) => void = () => {}) {
  const listeners = new Set<Listener>();
  let subscriptions = 0;
  let releases = 0;
  let providerCloses = 0;
  let cleanupFailure: Error | undefined;
  const port: EventsPort & { readonly close: () => void } = {
    subscribe: listener => {
      subscriptions += 1;
      listeners.add(listener);
      try { duringSubscribe(listener); }
      catch (cause) {
        // A source that fails before returning a handle owns its partial acquisition.
        listeners.delete(listener);
        throw cause;
      }
      return () => {
        releases += 1;
        if (cleanupFailure !== undefined) {
          const failure = cleanupFailure;
          cleanupFailure = undefined;
          throw failure;
        }
        listeners.delete(listener);
      };
    },
    close: () => { providerCloses += 1; },
  };
  return {
    port,
    emit: (id: string): void => { for (const listener of listeners) listener(id); },
    failCleanup: (cause: Error): void => { cleanupFailure = cause; },
    inspect: () => ({ live: listeners.size, subscriptions, releases, providerCloses }),
  };
}

test("identical occurrences are delivered and closing one subscriber preserves its sibling", async context => {
  const clients = observeClients(context);
  const source = eventSource();
  const first = await isolate(orderStoreModule, { dependencies: { events: source.port } });
  context.after(async () => { await first.close(); });
  const second = await isolate(orderStoreModule, { dependencies: { events: source.port } });
  context.after(async () => { await second.close(); });
  source.emit("same-order");
  source.emit("same-order");
  assert.deepEqual(clients.map(client => client.seen), [["same-order", "same-order"], ["same-order", "same-order"]]);
  assert.equal((await first.close()).complete, true);
  source.emit("later-order");
  assert.deepEqual(clients.map(client => client.seen), [["same-order", "same-order"], ["same-order", "same-order", "later-order"]]);
  assert.deepEqual(source.inspect(), { live: 1, subscriptions: 2, releases: 1, providerCloses: 0 });
  assert.deepEqual(clients.map(client => client.closes), [1, 0]);
  assert.equal((await second.close()).complete, true);
  assert.deepEqual(source.inspect(), { live: 0, subscriptions: 2, releases: 2, providerCloses: 0 });
});

test("closing during synchronous subscribe still owns the returned disposer", async context => {
  const clients = observeClients(context);
  const host = createScope({ name: "reentrant-host" });
  context.after(async () => { await host.control.close(); });
  const source = eventSource(listener => {
    listener("before-close");
    void host.control.close();
    listener("after-close");
  });
  await assert.rejects(isolate(orderStoreModule, {
    dependencies: { events: source.port }, within: host.resources,
  }), { code: "conformance.isolate.construction-failed" });
  assert.equal((await host.control.close()).complete, true);
  assert.deepEqual(source.inspect(), { live: 0, subscriptions: 1, releases: 1, providerCloses: 0 });
  assert.deepEqual(clients.map(client => client.seen), [["before-close"]]);
  assert.deepEqual(clients.map(client => client.closes), [1]);
});

test("failed unsubscribe remains debt and the closed listener performs no later work", async context => {
  const clients = observeClients(context);
  const source = eventSource();
  const subscriber = await isolate(orderStoreModule, { dependencies: { events: source.port } });
  context.after(async () => { await subscriber.close(); });
  source.emit("before-close");
  const failure = new Error("subscription still attached");
  source.failCleanup(failure);
  const first = await subscriber.close();
  assert.equal(first.complete, false);
  assert.equal(first.settled, true);
  assert.deepEqual(first.debts.map(debt => ({ name: debt.path.at(-1), state: debt.state,
    cause: debt.state === "failed" ? debt.cause : undefined })), [
    { name: "events", state: "failed", cause: failure },
  ]);
  assert.equal(source.inspect().live, 1);
  source.emit("after-failed-cleanup");
  assert.deepEqual(clients.map(client => client.seen), [["before-close"]]);
  assert.deepEqual(clients.map(client => client.closes), [1]);
  assert.equal((await subscriber.close()).complete, true);
  assert.deepEqual(source.inspect(), { live: 0, subscriptions: 1, releases: 2, providerCloses: 0 });
  assert.deepEqual(clients.map(client => client.closes), [1]);
});

test("construction cancellation before subscription prevents its acquisition", async context => {
  const cancelled = new AbortController();
  const reason = new Error("construction cancelled after opening the client");
  const clients = observeClients(context, signal => {
    cancelled.abort(reason);
    assert.equal(signal.aborted, true);
  });
  const source = eventSource();
  await assert.rejects(isolate(orderStoreModule, {
    dependencies: { events: source.port }, signal: cancelled.signal,
  }), { code: "conformance.isolate.construction-failed", cause: reason });
  assert.deepEqual(source.inspect(), { live: 0, subscriptions: 0, releases: 0, providerCloses: 0 });
  assert.deepEqual(clients.map(client => client.closes), [1]);
});

test("a failed subscribe rolls back its own attachment and the module releases its client", async context => {
  const clients = observeClients(context);
  const failure = new Error("source failed before returning a disposer");
  const source = eventSource(() => { throw failure; });
  await assert.rejects(isolate(orderStoreModule, { dependencies: { events: source.port } }),
    { code: "conformance.isolate.construction-failed", cause: failure });
  assert.deepEqual(source.inspect(), { live: 0, subscriptions: 1, releases: 0, providerCloses: 0 });
  assert.deepEqual(clients.map(client => client.closes), [1]);
});
`;
