import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Deferred, Effect, Exit, Fiber, Stream } from "effect";
import { prepareProgressGraph, ProgressRoots } from "./native-session.ts";

function summarizeLatency(samples: readonly number[]) {
  assert.ok(samples.length > 0 && samples.every(value => Number.isFinite(value) && value >= 0));
  const sorted = [...samples].sort((left, right) => left - right);
  // Nearest-rank percentiles describe this finite run, not a latency guarantee.
  return { samples: sorted.length, p50Ms: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1], maxMs: sorted.at(-1) };
}

test("communication: bounded native traffic survives slow-reader retirement and subscription churn", { timeout: 30000 }, async context => {
  const capacity = 32, publisherCount = 4, steadyCount = 8, epochs = 32, perPublisherEpoch = 32;
  const normalCount = publisherCount * epochs * perPublisherEpoch;
  const pressureCount = capacity + publisherCount;
  const totalCount = pressureCount + normalCount;
  const publishers = Array.from({ length: publisherCount }, (_, index) => index);
  const expected = new Map<string, number>(publishers.flatMap(publisher => [
    [`pressure/${publisher}`, 9], [`normal/${publisher}`, 1024],
  ]));
  const startedAt = new Map<string, number[]>([...expected.keys()].map(id => [id, []]));
  const admission: Record<"pressure" | "normal", number[]> = { pressure: [], normal: [] };
  const delivery: Record<"pressure" | "normal", number[]> = { pressure: [], normal: [] };
  const memory: Array<{ phase: string; rssBytes: number; heapUsedBytes: number; externalBytes: number }> = [];
  const sampleMemory = (phase: string): void => {
    const { rss, heapUsed, external } = process.memoryUsage();
    memory.push({ phase, rssBytes: rss, heapUsedBytes: heapUsed, externalBytes: external });
  };
  const installedEffect: unknown = JSON.parse(await readFile(new URL(import.meta.resolve("effect/package.json")), "utf8"));
  assert.ok(installedEffect !== null && typeof installedEffect === "object" && "version" in installedEffect);
  assert.equal(installedEffect.version, "4.1.4");
  let liveConsumers = 0, maxConsumers = 0, acquired = 0, released = 0;
  let activePublishers = 0, maxPublishers = 0, admitted = 0;
  let publishAfterClose: Effect.Effect<boolean> | undefined;
  const start = performance.now();
  sampleMemory("before-preparation");
  const graph = await prepareProgressGraph(capacity);
  const readerCounts = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const roots = yield* ProgressRoots;
    assert.equal(roots.left, roots.right, "GM selects one shared reader capability");
    publishAfterClose = roots.source.publisher.publish({ jobId: "after-close", completed: 1 });
    // Instrument our consumer scopes, not Effect's private subscription storage.
    // Joining their scoped fibers waits for native unsubscription as well.
    const subscribe = Effect.gen(function* () {
      const events = yield* roots.left.subscribe;
      yield* Effect.acquireRelease(Effect.sync(() => {
        acquired += 1;
        liveConsumers += 1;
        maxConsumers = Math.max(maxConsumers, liveConsumers);
      }), () => Effect.sync(() => { released += 1; liveConsumers -= 1; }));
      return events;
    });
    const publish = (phase: "pressure" | "normal", publisher: number, sequence: number) => Effect.acquireUseRelease(
      Effect.sync(() => {
        activePublishers += 1;
        maxPublishers = Math.max(maxPublishers, activePublishers);
        const id = `${phase}/${publisher}`;
        const starts = startedAt.get(id);
        assert.ok(starts);
        const attempt = performance.now();
        starts[sequence - 1] = attempt;
        return { attempt, event: Object.freeze({ jobId: id, completed: sequence }) };
      }),
      ({ attempt, event }) => Effect.map(roots.source.publisher.publish(event), accepted => {
        assert.equal(accepted, true);
        admitted += 1;
        admission[phase].push(performance.now() - attempt);
      }),
      () => Effect.sync(() => { activePublishers -= 1; }),
    );

    const readers = [];
    for (let index = 0; index < steadyCount; index += 1) {
      const ready = yield* Deferred.make<void>();
      const reader = yield* Effect.forkScoped(Effect.scoped(Effect.gen(function* () {
        const events = yield* subscribe;
        const counts = new Map([...expected.keys()].map(id => [id, 0]));
        yield* Deferred.succeed(ready, undefined);
        yield* Stream.runForEach(Stream.take(events, totalCount), value => Effect.sync(() => {
          const previous = counts.get(value.jobId);
          assert.ok(previous !== undefined, "only the configured producer identities may deliver");
          assert.equal(value.completed, previous + 1, "each producer delivers every sequence exactly once and in order");
          counts.set(value.jobId, value.completed);
          if (index === 0) {
            const attempt = startedAt.get(value.jobId)?.[value.completed - 1];
            assert.ok(attempt !== undefined);
            const phase = value.jobId.startsWith("pressure/") ? "pressure" : "normal";
            delivery[phase].push(performance.now() - attempt);
          }
        }));
        assert.deepEqual(counts, expected);
        return Object.fromEntries(counts);
      })));
      readers.push(reader);
      yield* Effect.raceFirst(Deferred.await(ready), Fiber.join(reader));
    }

    const heldReady = yield* Deferred.make<void>();
    const held = yield* Effect.forkScoped(Effect.scoped(Effect.gen(function* () {
      yield* subscribe;
      yield* Deferred.succeed(heldReady, undefined);
      yield* Effect.never;
    })));
    yield* Effect.raceFirst(Deferred.await(heldReady), Fiber.join(held));
    assert.equal(liveConsumers, 9);
    // Separate control traffic: 32 admitted items, then four genuinely waiting calls.
    for (let sequence = 1; sequence <= 8; sequence += 1) {
      for (const publisher of publishers) yield* publish("pressure", publisher, sequence);
    }
    const blocked = [];
    for (const publisher of publishers) {
      blocked.push(yield* Effect.forkScoped(publish("pressure", publisher, 9), { startImmediately: true }));
    }
    assert.equal(admitted, capacity);
    assert.equal(activePublishers, publisherCount);
    for (const pending of blocked) assert.equal(pending.pollUnsafe(), undefined, "the held subscriber really blocks publication");
    sampleMemory("pressure-held");
    yield* Fiber.interrupt(held);
    assert.ok(Exit.hasInterrupts(yield* Fiber.await(held)));
    assert.equal(liveConsumers, steadyCount);
    yield* Fiber.joinAll(blocked);
    assert.equal(admitted, pressureCount);
    assert.equal(activePublishers, 0);

    for (let epoch = 0; epoch < epochs; epoch += 1) {
      const ready = yield* Deferred.make<void>();
      let transientDeliveries = 0;
      const transient = yield* Effect.forkScoped(Effect.scoped(Effect.gen(function* () {
        const events = yield* subscribe;
        yield* Deferred.succeed(ready, undefined);
        yield* Stream.runForEach(Stream.take(events, 1), () => Effect.sync(() => { transientDeliveries += 1; }));
      })));
      yield* Effect.raceFirst(Deferred.await(ready), Fiber.join(transient));
      assert.equal(liveConsumers, steadyCount + 1);
      const first = epoch * perPublisherEpoch + 1;
      yield* publish("normal", 0, first);
      yield* Fiber.join(transient);
      assert.equal(transientDeliveries, 1);
      assert.equal(liveConsumers, steadyCount);
      // Four bounded worker branches per epoch, not a detached fiber per event.
      // The following 127 publications exceed capacity after the transient closes:
      // a retained unread subscription would stall this same source.
      yield* Effect.forEach(publishers, publisher => Effect.gen(function* () {
        for (let sequence = first + (publisher === 0 ? 1 : 0); sequence < first + perPublisherEpoch; sequence += 1) {
          yield* publish("normal", publisher, sequence);
        }
      }), { concurrency: publisherCount, discard: true });
      assert.equal(transientDeliveries, 1, "retired consumers receive no further work");
      assert.equal(activePublishers, 0, "all publisher work in this epoch is joined");
    }
    const counts = yield* Fiber.joinAll(readers);
    assert.equal(admitted, totalCount);
    assert.equal(liveConsumers, 0);
    assert.equal(acquired, steadyCount + 1 + epochs);
    assert.equal(released, acquired);
    sampleMemory("after-traffic-before-source-close");
    return counts;
  })).pipe(Effect.provide(graph.layer(ProgressRoots))));
  assert.ok(publishAfterClose);
  assert.equal(await Effect.runPromise(publishAfterClose), false);
  assert.equal(activePublishers, 0);
  assert.equal(maxPublishers, publisherCount);
  assert.ok(maxConsumers <= steadyCount + 1 + 1);
  assert.equal(readerCounts.length, steadyCount);
  const steadyDeliveries = readerCounts.reduce((total, counts) =>
    total + Object.values(counts).reduce((sum, count) => sum + count, 0), 0);
  assert.equal(steadyDeliveries, totalCount * steadyCount);
  assert.equal(admission.pressure.length, pressureCount);
  assert.equal(admission.normal.length, normalCount);
  assert.equal(delivery.pressure.length, pressureCount);
  assert.equal(delivery.normal.length, normalCount);
  sampleMemory("after-source-close");
  context.diagnostic(`communication-workload ${JSON.stringify({
    profile: { capacity, publisherConcurrency: publisherCount, steadyConsumers: steadyCount, heldConsumers: 1,
      concurrentTransientConsumers: 1, transientAcquisitions: epochs, epochs, normalOccurrences: normalCount,
      controlOccurrences: pressureCount, payload: "frozen { jobId: phase/producer, completed: integer sequence }" },
    runtime: { node: process.version, platform: process.platform, architecture: process.arch, effect: installedEffect.version },
    observed: { admitted, steadyDeliveries, readerCounts,
      perProducerSequenceChecks: true, acquired, released, liveConsumers, maxConcurrentConsumers: maxConsumers,
      activePublishers, maxConcurrentPublishers: maxPublishers, postClosePublication: false },
    elapsedMs: performance.now() - start,
    latencyDefinition: { admission: "publication attempt to successful admission",
      delivery: "publication attempt to handler entry of designated steady consumer 0", percentiles: "nearest rank" },
    latency: { control: { admission: summarizeLatency(admission.pressure), delivery: summarizeLatency(delivery.pressure) },
      normal: { admission: summarizeLatency(admission.normal), delivery: summarizeLatency(delivery.normal) } },
    memory, sampledMaxRssBytes: Math.max(...memory.map(sample => sample.rssBytes)),
    sampledMaxHeapUsedBytes: Math.max(...memory.map(sample => sample.heapUsedBytes)),
    limits: "finite in-process correctness profile; timing and sampled memory are observations, not SLOs or a leak proof",
  })}`);
});
