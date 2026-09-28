import assert from "node:assert/strict";

const good = (result) => {
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
};
const denied = (result, reason) => assert.deepEqual(result, { ok: false, reason });

export async function runSemanticSuite(createLifecycleKernel, context) {
  await context.test("opaque identities reject forged, copied, and cross-kernel tokens without changing counts", () => {
    const owner = createLifecycleKernel();
    const other = createLifecycleKernel();
    const generation = owner.stage();
    const forged = Object.freeze(Object.create(null));
    const copied = { ...generation };
    for (const token of [forged, copied, Object.create(generation), other.stage(), null, "id"]) {
      denied(owner.activate(token), "foreign-generation");
      denied(owner.beginCall(token), "foreign-generation");
      denied(owner.snapshot(token), "foreign-generation");
    }
    good(owner.activate(generation));
    const call = good(owner.beginCall(generation));
    const custody = good(owner.retainCustody(generation));
    const otherGeneration = other.stage();
    good(other.activate(otherGeneration));
    const otherCall = good(other.beginCall(otherGeneration));
    for (const token of [forged, { ...call }, Object.create(call), otherCall]) {
      denied(owner.checkCall(token), "foreign-lease");
      denied(owner.release(token), "foreign-lease");
    }
    denied(owner.checkCall(custody), "wrong-lease-kind");
    assert.deepEqual(good(owner.snapshot(generation)), { phase: "active", calls: 1, custody: 1 });
    assert.equal(good(owner.release(call)), "released");
    assert.equal(good(owner.release(call)), "already-released");
    denied(owner.checkCall(call), "released-lease");
    assert.equal(good(owner.release(custody)), "released");
    assert.deepEqual(good(owner.snapshot(generation)), { phase: "active", calls: 0, custody: 0 });
  });

  await context.test("quiesce closes new admission while retaining a held call; retirement revokes that call", () => {
    const kernel = createLifecycleKernel();
    const generation = kernel.stage();
    denied(kernel.beginCall(generation), "admission-closed");
    const construction = good(kernel.retainCustody(generation));
    denied(kernel.quiesce(generation), "invalid-phase");
    good(kernel.activate(generation));
    const call = good(kernel.beginCall(generation));
    good(kernel.quiesce(generation));
    good(kernel.quiesce(generation));
    denied(kernel.beginCall(generation), "admission-closed");
    denied(kernel.retainCustody(generation), "admission-closed");
    assert.equal(good(kernel.checkCall(call)), "admitted");
    good(kernel.resume(generation));
    assert.equal(good(kernel.checkCall(call)), "admitted");
    const lateCall = good(kernel.beginCall(generation));
    good(kernel.retire(generation));
    denied(kernel.checkCall(call), "revoked");
    denied(kernel.checkCall(lateCall), "revoked");
    denied(kernel.beginCall(generation), "admission-closed");
    denied(kernel.retainCustody(generation), "admission-closed");
    denied(kernel.resume(generation), "invalid-phase");
    assert.equal(good(kernel.release(construction)), "released");
    assert.equal(good(kernel.release(call)), "released");
    assert.equal(good(kernel.release(lateCall)), "released");
  });

  await context.test("retirement retains call and custody until explicit release, including across generations", () => {
    const kernel = createLifecycleKernel();
    const old = kernel.stage();
    const newer = kernel.stage();
    good(kernel.activate(old));
    good(kernel.activate(newer));
    const oldCall = good(kernel.beginCall(old));
    const oldCustody = good(kernel.retainCustody(old));
    const newCall = good(kernel.beginCall(newer));
    denied(kernel.finishRetirement(old), "invalid-phase");
    assert.equal(good(kernel.retire(old)), "retiring");
    assert.equal(good(kernel.retire(old)), "retiring");
    denied(kernel.finishRetirement(old), "retained-work");
    good(kernel.release(oldCall));
    denied(kernel.checkCall(oldCall), "released-lease");
    denied(kernel.finishRetirement(old), "retained-work");
    assert.deepEqual(good(kernel.snapshot(old)), { phase: "retiring", calls: 0, custody: 1 });
    assert.equal(good(kernel.checkCall(newCall)), "admitted");
    good(kernel.release(oldCustody));
    assert.equal(good(kernel.finishRetirement(old)), "retired");
    assert.equal(good(kernel.finishRetirement(old)), "retired");
    assert.equal(good(kernel.retire(old)), "retired");
    denied(kernel.activate(old), "invalid-phase");
    denied(kernel.resume(old), "invalid-phase");
    denied(kernel.beginCall(old), "admission-closed");
    assert.deepEqual(good(kernel.snapshot(newer)), { phase: "active", calls: 1, custody: 0 });
    good(kernel.release(newCall));
  });

  await context.test("snapshots are detached and frozen; foreign inputs are never inspected or invoked", () => {
    const kernel = createLifecycleKernel();
    const generation = kernel.stage();
    const before = good(kernel.snapshot(generation));
    assert.equal(Object.isFrozen(before), true);
    assert.equal(Object.isFrozen(generation), true);
    let traps = 0;
    const hostile = new Proxy({}, {
      get() { traps++; throw Error("get trap"); },
      getPrototypeOf() { traps++; throw Error("prototype trap"); },
      ownKeys() { traps++; throw Error("keys trap"); },
    });
    denied(kernel.activate(hostile), "foreign-generation");
    denied(kernel.checkCall(hostile), "foreign-lease");
    denied(kernel.release(hostile), "foreign-lease");
    assert.equal(traps, 0);
    good(kernel.activate(generation));
    assert.deepEqual(before, { phase: "staged", calls: 0, custody: 0 });
    assert.deepEqual(good(kernel.snapshot(generation)), { phase: "active", calls: 0, custody: 0 });
  });
}
