### Choose the contract before choosing the primitive

GM abstracts declared dependencies and provider selection, not the semantics of
all communication. A typed slot can carry a neutral callback port or a deliberate
Effect-native technical port. Calling the latter an interface does not make it
independent of Effect. Share plain subject data; do not invent a common
Task/Stream/Scope facade or make every native module cross a Promise boundary.

| Need | Suitable boundary | Guarantee not implied |
| --- | --- | --- |
| Read the authoritative current answer | A subject-specific query port | A state projection is not necessarily the authority |
| Follow replaceable state | Observation or a chosen native state projection | Every intermediate revision, or a processing acknowledgement |
| Receive live occurrences | A typed notification port; native PubSub/Stream in an Effect implementation | Replay to future subscribers or durable delivery |
| Distribute work among handlers | An admitted-work port with a selected queue | Broadcast to every subscriber |
| Ask an owner to perform work | A command port with an explicit result | Successful event publication is not command completion |
| Retain obligations across restart | A domain/Host-owned durable protocol | An in-memory PubSub or Stream is not that protocol |

State the applicable guarantees in the port's documentation: hot versus cold
source, subscription readiness, duplicate handling, ordering, completion/errors,
ownership, buffering and overflow. This is a review checklist, not a new options
object with a switch for every possible behavior. An ordered source does not make
concurrently processed results globally ordered. A readonly type is not a sandbox.

The complete maintained recipes below are consumer examples, not new exports from
`@get-modular/effect`. Their source is strictly checked with the selected peer and
the same cases execute from matched installed public archives. See the
[recipe tests](https://github.com/agent-teams-ai/get-modular/blob/main/packages/effect/tests/communication.test.ts).
The [plain progress contract and test source](https://github.com/agent-teams-ai/get-modular/blob/main/packages/effect/tests/communication/progress.ts)
have no Effect imports. The test source illustrates the stated contract; do not
copy it as a new product-wide event bus.

### Native notifications: explicit readiness, separate reader and publisher

Use the [complete native recipe](https://github.com/agent-teams-ai/get-modular/blob/main/packages/effect/tests/communication/native.ts)
inside an Effect-native provider. The provider owns one bounded PubSub and gives
consumers only its `ProgressEvents` facet. Publication stays with its owning
module or authorized Host; subscribers cannot publish or shut down the source.
The GM test wires that reader through an ordinary required slot into two modules.

```ts
// Inside the operation retained by the graph's owning Effect Scope:
const events = yield* roots.reader.subscribe;
// The subscription is registered now, before the first publication.
yield* roots.publisher.publish({ jobId: "example", completed: 1 });
const first = yield* Stream.runCollect(Stream.take(events, 1));
```

The sketch uses names from its Host; the linked fixture supplies full declarations,
composition and root keys. `subscribe` has an honest native Scope requirement.
Each consumer acquires its own subscription and consumes the returned stream
inside that same lifetime. Do not cache that acquired stream and run it from
multiple consumers: that would share one subscription rather than create a new
multicast subscriber. Merely obtaining a lazy Stream does not prove readiness.

There is no replay in this recipe. Two identical payloads are two occurrences.
A bounded source can wait for a slow subscriber; publication confirms admission,
not that every handler finished. Subscriber cancellation releases only its own
subscription. Source shutdown interrupts this recipe's pending reads; it does
not pretend to be a graceful business-completion event. The Host separately
chooses whether one consumer failure ends the application or is handled locally.
The tests exercise both early successful exit and locally handled failure while
a sibling remains active, and verify that the source stops with its graph.

### Neutral callback source: one owned adapter, explicit overflow

Use the [complete callback adapter](https://github.com/agent-teams-ai/get-modular/blob/main/packages/effect/tests/communication/callback.ts)
when the source's complete public contract must remain independent of Effect.
Keep the plain `ProgressSource` at that replaceable boundary; the selected adapter
returns a native Stream for native consumers. No mandatory Effect peer is added
to Core, Assembly, Resources or Observation.

```ts
const stream = callbackProgress(borrowedSource, 16);
const program = Stream.runForEach(stream, handleProgress);
// Run program inside its owning application/session Scope, not per callback.
```

Every consumption acquires its own foreign subscription through
`Effect.acquireRelease`. Synchronous emissions during `subscribe` enter an already
created queue. If subscribe throws before returning a disposer, the source must
roll back its own partial acquisition; no adapter can recover an undisclosed
handle. A returned disposer remains owned through early completion, processing
failure and interruption. A throwing disposer remains a native defect. No second
GM Resources disposer is installed for that same subscription.

This source cannot wait for backpressure. The recipe uses a bounded queue and
turns a refused offer into `ProgressOverflow`, closes admission, and discards its
queued prefix rather than continuing after a known gap. Work already processed
is not rolled back. It neither silently drops occurrences nor starts a detached
fiber for each callback. A consumer needing recovery must query/reconcile through
its actual owner; retrying the subscription does not replay lost facts. For a
pausable source use its real pause/resume contract instead. For replaceable state,
a deliberately latest-only projection is a different valid contract.

The capacity bounds this adapter's pending items, not arbitrary payload bytes,
waiting producers elsewhere or all application work. The source is borrowed and
must outlive consumption. This callback contract has no terminal notification;
the adapter invents neither source completion nor a source-close authority.
Tests cover duplicate synchronous emissions, two subscribers, late callbacks,
acquisition rollback, overflow, handler/teardown failures and interruption.

### Existing Observation: one-way latest-state projection

Use the [complete state bridge](https://github.com/agent-teams-ai/get-modular/blob/main/packages/effect/tests/communication/state.ts)
only when an existing module already owns the required Observation contract.
For a new entirely native subsystem, choose its native state mechanism directly
when that meets its contract; adding Observation is not a requirement of GM.

The bridge reads a real snapshot, registers `watch` from that revision, and
publishes snapshots into a capacity-one sliding Stream queue. Both Observation
and this projection may combine intermediate states. It follows only the selected
keys and preserves the source's snapshot/revision instead of creating a second
state authority. It is not an event log or an adapter for `load`'s physical drain.

```ts
const snapshots = observedProgress(borrowedReadonlyStore);
const program = Stream.runForEach(snapshots, snapshot =>
  renderProgress(snapshot.values.completed));
```

One native acquisition owns one small GM Resources scope for the watch. Native
finalization closes only that scope and inspects its complete/settled report;
failed cleanup is preserved as a defect with the report, not changed to success
or silently retried. The source store belongs to its original owner. Independent
stream consumers receive distinct watch scopes, and stopping one leaves the other
and the source alive. This is one explicit ownership bridge, not two independent
owners of the same resource or an interchangeable Scope abstraction.

**Precondition:** the source owner outlives the stream consumers.
`ReadonlyStore.watch` has no terminal callback. Unexpected source closure detaches
the watch and reports to the source owner's error port; it does not complete this
Stream. The Host must stop the consumers when retiring that source. A port needing
terminal signaling must specify it explicitly rather than infer it from silence.
Using an already-closed source remains a lifecycle defect.

Do not synchronize writable Observation and SubscriptionRef instances in both
directions. Keep one authority and a one-way projection. Neither the bridge nor a
valid composition DAG proves that all feedback loops are impossible; native
scheduling is not a promise to preserve every Observation async echo guard.
Do not write the watched state back from this projection. Test any deliberate
command/reconciliation feedback in the product that owns it.

The maintained tests check initial/latest values, irrelevant-key updates,
independent watch closure, source lifetime, unexpected source close and failed
bridge cleanup. These are Node qualification cases, not browser parity or a
thousand-agent workload claim. SubscriptionRef and Observation are not drop-in
replacements: choose intentionally rather than renaming methods during migration.

