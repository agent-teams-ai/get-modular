import assert from "node:assert/strict";
import test from "node:test";
import { assemblyFor, declareModule, defineContract, implement, input, type CapabilitiesOf } from "@get-modular/assembly";
import { required } from "@get-modular/core";
import { createScope, scoped } from "@get-modular/resources";

type Listener = (value: number) => undefined;
type EventsPort = { readonly subscribe: (listener: Listener) => () => void };
type ReceiverPort = { readonly seen: () => readonly number[] };

const Events = defineContract<EventsPort>()({ id: "scale/events", revision: 1 });
const Receiver = defineContract<ReceiverPort>()({ id: "scale/receiver", revision: 1 });
interface Capabilities extends CapabilitiesOf<typeof Events | typeof Receiver> {}

const sourceDeclaration = declareModule({
  moduleId: "scale/source", implementationId: "scale/source/input",
  owner: { authority: "scale", path: ["source"] },
  provides: [Events.provide()], slots: [],
});
const receiverDeclaration = declareModule({
  moduleId: "scale/receiver", implementationId: "scale/receiver/default",
  owner: { authority: "scale", path: ["receiver"] },
  provides: [Receiver.provide()], slots: [Events.slot("events", required())],
});

const sourceInput = input<Capabilities>()(sourceDeclaration);
const receiverModule = implement<Capabilities>()(receiverDeclaration, async (deps, { resources }) => {
  const seen: number[] = [];
  await resources.setup({
    name: "events",
    setup: ({ signal }) => {
      signal.throwIfAborted();
      return deps.events.subscribe((value) => {
        if (!signal.aborted) seen.push(value);
      });
    },
    cleanup: (unsubscribe) => unsubscribe(),
  });
  const port: ReceiverPort = { seen: () => [...seen] };
  return { instance: port, capabilities: { "scale/receiver": port } };
}, scoped);

function createSource() {
  const listeners = new Set<Listener>();
  let subscriptions = 0;
  let unsubscriptions = 0;
  const port: EventsPort = {
    subscribe: (listener) => {
      subscriptions += 1;
      listeners.add(listener);
      let released = false;
      return () => {
        if (released) throw new Error("subscription disposed twice");
        released = true;
        unsubscriptions += 1;
        listeners.delete(listener);
      };
    },
  };
  return {
    port,
    emit: (value: number): void => { for (const listener of listeners) listener(value); },
    inspect: () => ({ live: listeners.size, subscriptions, unsubscriptions }),
  };
}

test("1024 live scoped Assembly consumers keep borrowed event channels and cleanup isolated", { timeout: 120000 }, async () => {
  const prepared = await assemblyFor<Capabilities>().prepare({
    profileId: "scale/live-receivers",
    modules: [receiverModule] as const,
    roots: { receiver: receiverModule },
    inputs: { source: sourceInput },
  });
  assert.equal(prepared.status, "prepared");
  if (prepared.status !== "prepared") throw new Error("Assembly preparation failed");

  const sourceA = createSource(), sourceB = createSource();
  const sessions = Array.from({ length: 1024 }, (_, index) => ({
    index,
    scope: createScope({ name: "session-" + index }),
    source: index % 2 === 0 ? sourceA : sourceB,
  }));

  try {
    // Reserve every scope before awaiting a factory; the input remains borrowed.
    const outcomes = await Promise.all(sessions.map(({ scope, source }) =>
      prepared.prepared.run({
        scope: scope.resources,
        inputs: { source: { [Events.id]: source.port } },
      }),
    ));
    const receivers = outcomes.map((outcome, index) => {
      assert.equal(outcome.status, "succeeded", "run " + index);
      if (outcome.status !== "succeeded") throw new Error("run " + index + " failed");
      assert.equal(outcome.created.length, 1, "the borrowed source must not be constructed");
      return outcome.roots.receiver;
    });
    assert.deepEqual(sourceA.inspect(), { live: 512, subscriptions: 512, unsubscriptions: 0 });
    assert.deepEqual(sourceB.inspect(), { live: 512, subscriptions: 512, unsubscriptions: 0 });
    assert.equal(new Set(receivers).size, 1024, "each run owns its distinct instance");

    sourceA.emit(3);
    sourceA.emit(3);
    sourceB.emit(8);
    for (const { index } of sessions) {
      assert.deepEqual(receivers[index]?.seen(), index % 2 === 0 ? [3, 3] : [8],
        "isolated first delivery for run " + index);
    }

    // Closing half the consumers must leave their siblings alive.
    const closed = sessions.filter(({ index }) => index % 4 < 2);
    const stillOpen = sessions.filter(({ index }) => index % 4 >= 2);
    const reports = await Promise.all(closed.map(({ scope }) => scope.control.close()));
    for (const report of reports) {
      assert.equal(report.complete, true);
      assert.equal(report.settled, true);
      assert.deepEqual(report.debts, []);
    }
    assert.deepEqual(sourceA.inspect(), { live: 256, subscriptions: 512, unsubscriptions: 256 });
    assert.deepEqual(sourceB.inspect(), { live: 256, subscriptions: 512, unsubscriptions: 256 });

    sourceA.emit(5);
    sourceB.emit(9);
    for (const { index } of sessions) {
      const initial = index % 2 === 0 ? [3, 3] : [8];
      const expected = index % 4 < 2 ? initial : [...initial, index % 2 === 0 ? 5 : 9];
      assert.deepEqual(receivers[index]?.seen(), expected, "post-close delivery for run " + index);
    }

    const finalReports = await Promise.all(stillOpen.map(({ scope }) => scope.control.close()));
    assert.ok(finalReports.every((report) => report.complete && report.settled && report.debts.length === 0));
    assert.deepEqual(sourceA.inspect(), { live: 0, subscriptions: 512, unsubscriptions: 512 });
    assert.deepEqual(sourceB.inspect(), { live: 0, subscriptions: 512, unsubscriptions: 512 });
    const snapshots = receivers.map((receiver) => receiver.seen());
    sourceA.emit(20);
    sourceB.emit(21);
    for (const { index } of sessions) {
      assert.deepEqual(receivers[index]?.seen(), snapshots[index], "closed run " + index);
    }
    assert.equal((await sessions[0]!.scope.control.close()).complete, true);
    assert.equal(sourceA.inspect().unsubscriptions, 512, "repeated close must not dispose twice");

    // Reusing the same prepared template must not revive a previous subscriber.
    const fresh = createScope({ name: "fresh" });
    try {
      const outcome = await prepared.prepared.run({
        scope: fresh.resources, inputs: { source: { [Events.id]: sourceA.port } },
      });
      assert.equal(outcome.status, "succeeded");
      if (outcome.status !== "succeeded") throw new Error("fresh run failed");
      assert.deepEqual(outcome.roots.receiver.seen(), []);
      assert.equal(sourceA.inspect().live, 1);
      sourceA.emit(77);
      assert.deepEqual(outcome.roots.receiver.seen(), [77]);
      assert.deepEqual(receivers[0]?.seen(), snapshots[0], "closed instance must remain closed");
    } finally {
      const report = await fresh.control.close();
      assert.equal(report.complete, true);
    }
    assert.deepEqual(sourceA.inspect(), { live: 0, subscriptions: 513, unsubscriptions: 513 });
    assert.deepEqual(sourceB.inspect(), { live: 0, subscriptions: 512, unsubscriptions: 512 });
  } finally {
    // Release any remaining scopes even if an earlier assertion fails.
    await Promise.all(sessions.map(({ scope }) => scope.control.close()));
  }
});
