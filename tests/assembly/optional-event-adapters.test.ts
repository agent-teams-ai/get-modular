import assert from "node:assert/strict";
import test from "node:test";
import { assemblyFor } from "@get-modular/assembly";
import { createScope } from "@get-modular/resources";
import { callbackDeclaration, callbackProvider, runCallbackHost, type Subscribable } from "../qualification/consumer-fixtures/event-adapters/callback-host.ts";
import { eventTargetProvider, openEventTargetHost } from "../qualification/consumer-fixtures/event-adapters/event-target-host.ts";
import { inboxDeclaration, inboxModule, type EventCapabilities } from "../qualification/consumer-fixtures/event-adapters/inbox.module.ts";
import type { OrderNotice } from "../qualification/consumer-fixtures/event-adapters/portable-inbox.ts";

function createCallbackSource() {
  const listeners = new Set<(event: OrderNotice) => void>();
  let subscriptions = 0, releases = 0;
  const source: Subscribable = {
    subscribe: (next) => {
      subscriptions += 1;
      listeners.add(next);
      return {
        unsubscribe: () => {
          assert.equal(listeners.delete(next), true, "each subscription releases exactly once");
          releases += 1;
        },
      };
    },
  };
  return {
    source,
    emit: (id: string): void => { for (const listener of listeners) listener({ kind: "order", id }); },
    inspect: () => ({ live: listeners.size, subscriptions, releases }),
  };
}

// Records public registration/removal calls while retaining actual EventTarget delivery.
class RecordedTarget extends EventTarget {
  readonly listeners = new Set<EventListenerOrEventListenerObject>();
  removed = 0;
  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) {
    super.addEventListener(type, listener, options);
    if (type === "order" && listener !== null) this.listeners.add(listener);
  }
  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean) {
    super.removeEventListener(type, listener, options);
    if (type === "order" && listener !== null && this.listeners.delete(listener)) this.removed += 1;
  }
  publish(detail: unknown): void { this.dispatchEvent(new CustomEvent("order", { detail })); }
}

test("independent callback-request and EventTarget-session Hosts reuse portable behavior and retain separate custody", async () => {
  const callbacks = createCallbackSource(), target = new RecordedTarget();
  let callbackCreations = 0, nativeCreations = 0;
  const session = await openEventTargetHost(target, () => { nativeCreations += 1; });
  try {
    assert.equal(callbackCreations, 0, "opening the native Host does not construct a callback provider");
    assert.equal(nativeCreations, 1);
    const first = await runCallbackHost(callbacks.source, () => { callbackCreations += 1; }, async (inbox) => {
      callbacks.emit("same");
      callbacks.emit("same");
      target.publish({ kind: "order", id: "native" });
      target.publish({ kind: "order", id: 7 });
      target.publish({ kind: "unrelated", id: "ignored" });
      assert.deepEqual(inbox.received(), ["same", "same"]);
      assert.deepEqual(session.inbox.received(), ["native"]);
      assert.equal(target.listeners.size, 1);
      return inbox.received();
    });
    assert.deepEqual(first, ["same", "same"]);
    assert.deepEqual(callbacks.inspect(), { live: 0, subscriptions: 1, releases: 1 });
    assert.equal(nativeCreations, 1, "callback requests do not reconstruct the native provider");
    callbacks.emit("after-request");
    target.publish({ kind: "order", id: "still-active" });
    assert.deepEqual(session.inbox.received(), ["native", "still-active"]);

    const fresh = await runCallbackHost(callbacks.source, () => { callbackCreations += 1; }, async (inbox) => {
      assert.deepEqual(inbox.received(), [], "the fresh request has no prior state");
      callbacks.emit("fresh");
      return inbox.received();
    });
    assert.deepEqual(fresh, ["fresh"]);
    assert.equal(callbackCreations, 2);
    assert.deepEqual(callbacks.inspect(), { live: 0, subscriptions: 2, releases: 2 });
    const report = await session.control.close();
    assert.equal(report.complete && report.settled, true);
    assert.deepEqual(report.debts, []);
    assert.equal(target.listeners.size, 0, "native cleanup removes the actual listener");
    assert.equal(target.removed, 1);
    target.publish({ kind: "order", id: "after-session" });
    assert.deepEqual(session.inbox.received(), ["native", "still-active"]);
    assert.equal((await session.control.close()).complete, true);
    assert.equal(target.removed, 1, "repeated close does not remove twice");
  } finally {
    const report = await session.control.close();
    assert.equal(report.complete && report.settled, true);
  }
});

test("closing and reopening the native Host preserves an active callback request and a borrowed listener", async () => {
  const callbacks = createCallbackSource(), target = new RecordedTarget();
  const borrowed: string[] = [];
  const borrowedListener = (): void => { borrowed.push("observed"); };
  target.addEventListener("order", borrowedListener);
  let nativeCreations = 0;
  const first = await openEventTargetHost(target, () => { nativeCreations += 1; });
  try {
    const observed = await runCallbackHost(callbacks.source, () => undefined, async (inbox) => {
      callbacks.emit("before-native-close");
      target.publish({ kind: "order", id: "old-session" });
      assert.deepEqual(first.inbox.received(), ["old-session"]);
      assert.equal(target.listeners.size, 2);

      const report = await first.control.close();
      assert.equal(report.complete && report.settled, true);
      assert.deepEqual(report.debts, []);
      assert.equal(target.listeners.size, 1, "the borrowed listener must survive Host cleanup");
      target.publish({ kind: "order", id: "after-native-close" });
      callbacks.emit("after-native-close");
      assert.deepEqual(first.inbox.received(), ["old-session"]);
      assert.deepEqual(inbox.received(), ["before-native-close", "after-native-close"]);

      const fresh = await openEventTargetHost(target, () => { nativeCreations += 1; });
      try {
        assert.deepEqual(fresh.inbox.received(), [], "the replacement Host starts with independent state");
        target.publish({ kind: "order", id: "fresh-session" });
        callbacks.emit("during-fresh-native");
        assert.deepEqual(fresh.inbox.received(), ["fresh-session"]);
        assert.deepEqual(first.inbox.received(), ["old-session"]);
      } finally {
        const freshReport = await fresh.control.close();
        assert.equal(freshReport.complete && freshReport.settled, true);
        assert.deepEqual(freshReport.debts, []);
      }
      assert.equal(target.listeners.size, 1);
      assert.equal(nativeCreations, 2);
      assert.equal(target.removed, 2, "each Host removes exactly its own listener");
      assert.deepEqual(borrowed, ["observed", "observed", "observed"]);
      return inbox.received();
    });
    assert.deepEqual(observed, ["before-native-close", "after-native-close", "during-fresh-native"]);
    assert.deepEqual(callbacks.inspect(), { live: 0, subscriptions: 1, releases: 1 });
  } finally {
    await first.control.close();
    target.removeEventListener("order", borrowedListener);
  }
  assert.equal(target.listeners.size, 0);
});

test("ambiguous adapters reject before effects; an explicit binding selects actual occurrence delivery", async () => {
  const callbacks = createCallbackSource(), target = new RecordedTarget();
  let callbackCreations = 0, nativeCreations = 0;
  const callback = callbackProvider(callbacks.source, () => { callbackCreations += 1; });
  const native = eventTargetProvider(target, () => { nativeCreations += 1; });
  const modules = [callback, native, inboxModule] as const;
  const roots = { inbox: inboxModule, callback, native };
  const ambiguous = await assemblyFor<EventCapabilities>().prepare({
    profileId: "adapter-fixture/ambiguous", modules, roots,
  });
  assert.equal(ambiguous.status, "failed");
  if (ambiguous.status !== "failed") throw new Error("ambiguous providers unexpectedly prepared");
  assert.equal(ambiguous.error.code, "assembly.prepare.unresolved-binding");
  assert.equal(callbackCreations + nativeCreations, 0);
  assert.equal(callbacks.inspect().live + target.listeners.size, 0);

  const bound = await assemblyFor<EventCapabilities>().prepare({
    profileId: "adapter-fixture/explicit", modules, roots,
    bindings: [{ consumerImplementationId: inboxDeclaration.implementationId, slotId: "events",
      providerImplementationIds: [callbackDeclaration.implementationId] }],
  });
  assert.equal(bound.status, "prepared");
  if (bound.status !== "prepared") throw new Error("explicit binding failed", { cause: bound });
  assert.equal(callbackCreations + nativeCreations, 0);
  const scope = createScope({ name: "explicit-provider-test" });
  try {
    const outcome = await bound.prepared.run({ scope: scope.resources });
    assert.equal(outcome.status, "succeeded");
    if (outcome.status !== "succeeded") throw new Error("bound construction failed", { cause: outcome });
    assert.equal(callbackCreations, 1);
    assert.equal(nativeCreations, 1, "both deliberately exposed provider roots are constructed");
    assert.equal(target.listeners.size, 0, "the unbound native source has no subscriber");
    target.publish({ kind: "order", id: "wrong-provider" });
    callbacks.emit("selected");
    callbacks.emit("selected");
    assert.deepEqual(outcome.roots.inbox.received(), ["selected", "selected"]);
  } finally {
    const report = await scope.control.close();
    assert.equal(report.complete && report.settled, true);
    assert.deepEqual(report.debts, []);
  }
  assert.deepEqual(callbacks.inspect(), { live: 0, subscriptions: 1, releases: 1 });
  assert.equal(target.listeners.size, 0);
});
