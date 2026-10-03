import assert from "node:assert/strict";
import { getEventListeners } from "node:events";

const coded = expected => error => error?.code === expected;
const tick = () => new Promise(resolve => { setImmediate(resolve); });
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}
const shape = report => report.debts.map(debt => [debt.path.join("/"), debt.state]);

/**
 * Risky invariants of ADR-0030, run against any copy of the public API: the
 * local build and the installed archive. Each test names the regression it
 * rejects.
 */
export async function runSemanticSuite({ createScope, CloseIncompleteError }, context) {
  await context.test("R1 a value takes its LIFO slot when its setup fulfils", async () => {
    const { resources, control } = createScope({ name: "m" });
    const log = [];
    await resources.setup({
      name: "subscription",
      setup: async () => {
        await resources.setup({ name: "conn", setup: async () => "c", cleanup: () => { log.push("conn"); } });
        return "s";
      },
      cleanup: () => { log.push("subscription"); },
    });
    assert.equal((await control.close()).complete, true);
    assert.deepEqual(log, ["subscription", "conn"]);
  });

  await context.test("R2 a failed cleanup keeps its cause, release continues, a later close retries only it", async () => {
    const { resources, control } = createScope({ name: "m" });
    const log = [];
    const boom = new Error("boom");
    let bCalls = 0;
    resources.use({ [Symbol.dispose]: () => { log.push("a"); } }, "a");
    resources.use({ [Symbol.dispose]: () => {
      bCalls += 1;
      if (bCalls === 1) throw boom;
      log.push("b");
    } }, "b");
    resources.use({ [Symbol.asyncDispose]: async () => { log.push("c"); } }, "c");
    const first = await control.close();
    assert.deepEqual(log, ["c", "a"]);
    assert.deepEqual(first.debts, [{ path: ["m", "b"], state: "failed", cause: boom }]);
    assert.equal(first.debts[0].cause, boom);
    const second = await control.close();
    assert.equal(second.complete, true);
    assert.equal(bCalls, 2);
    assert.deepEqual(log, ["c", "a", "b"]);
  });

  await context.test("R3 close and asyncDispose join one flight; neither resolves early", async () => {
    const { resources, control } = createScope({ name: "m" });
    const gate = deferred();
    let calls = 0;
    resources.use({ [Symbol.asyncDispose]: async () => { calls += 1; await gate.promise; } }, "slow");
    const order = [];
    const first = control.close().then(() => order.push("close"));
    const second = control[Symbol.asyncDispose]().then(() => order.push("dispose"));
    await tick();
    assert.deepEqual(order, []);
    gate.resolve();
    await Promise.all([first, second]);
    assert.equal(calls, 1);
  });

  await context.test("R4 close() inside a synchronous cleanup returns the running flight", async () => {
    const { resources, control } = createScope({ name: "m" });
    let inner;
    let calls = 0;
    resources.use({ [Symbol.dispose]: () => { calls += 1; inner = control.close(); } }, "self");
    const outer = control.close();
    assert.equal(inner, outer);
    await outer;
    assert.equal(calls, 1);
  });

  await context.test("R5 close waits for a started setup and releases its late value", async () => {
    const unhandled = [];
    const onUnhandled = reason => { unhandled.push(reason); };
    process.on("unhandledRejection", onUnhandled);
    try {
      const { resources, control } = createScope({ name: "m" });
      const gate = deferred();
      const log = [];
      const author = resources.setup({ name: "late", setup: () => gate.promise, cleanup: value => { log.push(`clean:${value}`); } });
      const closing = control.close();
      gate.resolve("v");
      const report = await closing;
      assert.deepEqual(log, ["clean:v"]);
      assert.equal(report.complete, true);
      await tick();
      await tick();
      assert.deepEqual(unhandled, []);
      await assert.rejects(author, coded("resources.scope.closed"));
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  await context.test("R6 after a close request nothing new is accepted and a refused value stays with the caller", async () => {
    for (const state of ["detached", "closing", "closed-with-debt"]) {
      const { resources, control } = createScope({ name: "m" });
      const gate = deferred();
      if (state === "closing") resources.use({ [Symbol.asyncDispose]: () => gate.promise }, "slow");
      if (state === "closed-with-debt") resources.use({ [Symbol.dispose]: () => { throw new Error("x"); } }, "bad");
      const closing = control.close();
      if (state !== "closing") await closing;
      let invoked = false;
      await assert.rejects(resources.setup({ name: "late", setup: () => { invoked = true; }, cleanup: () => {} }),
        coded("resources.scope.closed"));
      assert.equal(invoked, false, state);
      let released = 0;
      assert.throws(() => resources.use({ [Symbol.dispose]: () => { released += 1; } }, "late"),
        coded("resources.scope.closed"));
      assert.throws(() => resources.child({ name: "late" }), coded("resources.scope.closed"));
      gate.resolve();
      await closing;
      await control.close();
      await tick();
      assert.equal(released, 0, `${state}: refused value must stay with the caller`);
    }
  });

  await context.test("R7 cleanup sees escalate only for the current flight; a retry is soft again", async () => {
    const { resources, control } = createScope({ name: "m" });
    const seen = [];
    const gate = deferred();
    let first = true;
    await resources.setup({ name: "slow", setup: () => 1, cleanup: async (_value, { escalate }) => {
      seen.push(escalate.aborted);
      if (first) {
        first = false;
        await gate.promise;
        seen.push(escalate.aborted);
        throw new Error("retry me");
      }
    } });
    const escalate = new AbortController();
    const closing = control.close({ escalate: escalate.signal });
    await tick();
    escalate.abort();
    gate.resolve();
    assert.equal((await closing).complete, false);
    assert.equal((await control.close()).complete, true);
    assert.deepEqual(seen, [false, true, false]);
    assert.equal(resources.signal.aborted, true);
  });

  await context.test("R8 abandon ends only its caller's wait; the flight continues in order", async () => {
    const { resources, control } = createScope({ name: "m" });
    const log = [];
    const gate = deferred();
    let running = 0;
    let maxRunning = 0;
    const enter = () => { running += 1; maxRunning = Math.max(maxRunning, running); };
    resources.use({ [Symbol.dispose]: () => { enter(); log.push("a"); running -= 1; } }, "a");
    resources.use({ [Symbol.asyncDispose]: async () => {
      enter(); log.push("b:start"); await gate.promise; log.push("b:end"); running -= 1;
    } }, "b");
    const patient = control.close();
    const abandon = new AbortController();
    const hurried = control.close({ abandon: abandon.signal });
    await tick();
    abandon.abort();
    const snapshot = await hurried;
    assert.equal(snapshot.settled, false);
    assert.deepEqual(shape(snapshot), [["m/b", "pending"], ["m/a", "not-run"]]);
    await tick();
    assert.deepEqual(log, ["b:start"], "nothing starts while b runs");
    gate.resolve();
    const full = await patient;
    assert.equal(full.complete, true);
    assert.equal(full.settled, true);
    assert.deepEqual(log, ["b:start", "b:end", "a"]);
    assert.equal(maxRunning, 1);
  });

  await context.test("R9 the parent never passes a child whose cleanup still runs", async () => {
    const parent = createScope({ name: "p" });
    const log = [];
    const gate = deferred();
    parent.resources.use({ [Symbol.dispose]: () => { log.push("conn"); } }, "conn");
    const session = parent.resources.child({ name: "session" });
    session.resources.use({ [Symbol.asyncDispose]: async () => {
      log.push("drain:start"); await gate.promise; log.push("drain:end");
    } }, "drain");
    const deadline = new AbortController();
    const sessionClosing = session.control.close({ abandon: deadline.signal });
    const parentClosing = parent.control.close();
    await tick();
    deadline.abort();
    assert.equal((await sessionClosing).complete, false);
    await tick();
    await tick();
    assert.deepEqual(log, ["drain:start"]);
    gate.resolve();
    assert.equal((await parentClosing).complete, true);
    assert.deepEqual(log, ["drain:start", "drain:end", "conn"]);
  });

  await context.test("R10 escalate reaches a self-closing grandchild through an idle child", async () => {
    const root = createScope({ name: "r" });
    const child = root.resources.child({ name: "c" });
    const grandchild = child.resources.child({ name: "g" });
    const gate = deferred();
    const seen = [];
    grandchild.resources.use({ [Symbol.dispose]: () => {} }, "early");
    await grandchild.resources.setup({ name: "slow", setup: () => 1, cleanup: async (_value, { escalate }) => {
      seen.push(escalate.aborted); await gate.promise; seen.push(escalate.aborted);
    } });
    const grandchildClosing = grandchild.control.close();
    const top = deferred();
    root.resources.use({ [Symbol.asyncDispose]: () => top.promise }, "top");
    await tick();
    const escalate = new AbortController();
    const abandon = new AbortController();
    const rootClosing = root.control.close({ escalate: escalate.signal, abandon: abandon.signal });
    escalate.abort();
    abandon.abort();
    const snapshot = await rootClosing;
    assert.equal(snapshot.complete, false);
    assert.deepEqual(shape(snapshot), [["r/top", "pending"], ["r/c/g/slow", "pending"], ["r/c/g/early", "not-run"]]);
    gate.resolve();
    top.resolve();
    assert.equal((await grandchildClosing).complete, true);
    assert.equal((await root.control.close()).complete, true);
    assert.deepEqual(seen, [false, true]);
  });

  await context.test("R11 children never subscribe to parent signals; a detached child keeps no slot but its debt stays", async () => {
    const parent = createScope({ name: "p" });
    const live = Array.from({ length: 2000 }, (_, index) => parent.resources.child({ name: `s${index}` }));
    assert.equal(getEventListeners(parent.resources.signal, "abort").length, 0);
    for (const child of live) {
      child.resources.use({ [Symbol.dispose]: () => {} }, "r");
      await child.control.close();
    }
    const bad = parent.resources.child({ name: "bad" });
    bad.resources.use({ [Symbol.dispose]: () => { throw new Error("leak"); } }, "y");
    assert.equal((await bad.control.close()).complete, false);
    assert.deepEqual(shape(await parent.control.close()), [["p/bad/y", "failed"]]);
  });

  await context.test("R12 escalate listeners do not accumulate across Host retries", async () => {
    const hostEscalate = new AbortController();
    const scope = createScope({ name: "m" });
    scope.resources.use({ [Symbol.dispose]: () => { throw new Error("stuck"); } }, "stuck");
    for (let index = 0; index < 200; index += 1) await scope.control.close({ escalate: hostEscalate.signal });
    assert.equal(getEventListeners(hostEscalate.signal, "abort").length, 0);
  });

  await context.test("R13 asyncDispose rejects with CloseIncompleteError carrying the report", async () => {
    const scope = createScope({ name: "m" });
    const cause = new Error("x");
    scope.resources.use({ [Symbol.dispose]: () => { throw cause; } }, "bad");
    await assert.rejects(scope.control[Symbol.asyncDispose](), error =>
      error instanceof CloseIncompleteError && error.code === "resources.close.incomplete"
        && error.report.debts[0].state === "failed" && error.report.debts[0].cause === cause
        && error.errors[0] === cause);
  });

  await context.test("R14 order concurrent releases peers together and still records failures", async () => {
    const sessions = createScope({ name: "sessions", order: "concurrent" });
    const gate = deferred();
    let running = 0;
    let maxRunning = 0;
    const escalated = [];
    for (let index = 0; index < 5; index += 1) {
      const session = sessions.resources.child({ name: `s${index}` });
      void session.resources.setup({ name: "work", setup: () => index, cleanup: async (value, { escalate }) => {
        running += 1; maxRunning = Math.max(maxRunning, running);
        await gate.promise;
        escalated.push(escalate.aborted);
        running -= 1;
        if (value === 3) throw new Error("s3");
      } });
    }
    await tick();
    const escalate = new AbortController();
    const closing = sessions.control.close({ escalate: escalate.signal });
    await tick();
    assert.equal(maxRunning, 5);
    escalate.abort();
    gate.resolve();
    assert.deepEqual(shape(await closing), [["sessions/s3/work", "failed"]]);
    assert.deepEqual(escalated, [true, true, true, true, true]);
  });

  await context.test("R15 invalid arguments throw a coded TypeError before any state change", async () => {
    const scope = createScope({ name: "m" });
    const invalid = error => error instanceof TypeError && error.code === "resources.argument.invalid";
    assert.throws(() => scope.control.close({ escalate: new AbortController() }), invalid);
    assert.throws(() => scope.resources.use({ [Symbol.dispose]: () => {} }, undefined), invalid);
    assert.throws(() => scope.resources.setup({ setup: () => 1, cleanup: () => {} }), invalid);
    assert.throws(() => scope.resources.child({}), invalid);
    assert.throws(() => createScope({ name: "" }), invalid);
    assert.equal(scope.resources.signal.aborted, false);
    scope.resources.use({ [Symbol.dispose]: () => {} }, "still-open");
    assert.equal((await scope.control.close()).complete, true);
  });

  await context.test("R16 one resource never reports two debts between fulfil and pending removal", async () => {
    for (let delay = 0; delay < 6; delay += 1) {
      const scope = createScope({ name: "m" });
      const setup = deferred();
      scope.resources.setup({ name: "conn", setup: () => setup.promise, cleanup: () => {} }).catch(() => {});
      const abandon = new AbortController();
      const closing = scope.control.close({ abandon: abandon.signal });
      setup.resolve("v");
      let remaining = delay;
      const fire = () => {
        if (remaining === 0) abandon.abort();
        else { remaining -= 1; queueMicrotask(fire); }
      };
      queueMicrotask(fire);
      const report = await closing;
      assert.ok(report.debts.length <= 1, `delay ${delay}: ${JSON.stringify(report.debts.map(debt => debt.state))}`);
      await scope.control.close();
    }
  });

  await context.test("R17 a close request reaches the whole subtree synchronously", async () => {
    const root = createScope({ name: "r" });
    const child = root.resources.child({ name: "c" });
    const grandchild = child.resources.child({ name: "g" });
    const gate = deferred();
    root.resources.use({ [Symbol.asyncDispose]: () => gate.promise }, "slow"); // released before c
    const closing = root.control.close();
    assert.equal(grandchild.resources.signal.aborted, true);
    let invoked = false;
    await assert.rejects(grandchild.resources.setup({ name: "late", setup: () => { invoked = true; }, cleanup: () => {} }),
      coded("resources.scope.closed"));
    assert.equal(invoked, false);
    assert.throws(() => child.resources.child({ name: "late" }), coded("resources.scope.closed"));
    gate.resolve();
    assert.equal((await closing).complete, true);
  });
}
