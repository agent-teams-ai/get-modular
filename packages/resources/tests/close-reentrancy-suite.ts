import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type * as ResourcesApi from "../dist/index.js";

export async function runCloseReentrancySuite(api: typeof ResourcesApi, context: TestContext): Promise<void> {
  await context.test("a reentrant close joins the pre-escalated flight before the first cleanup", async () => {
    const scope = api.createScope({ name: "host" });
    const reason = new Error("shutdown budget exhausted");
    const observed: unknown[] = [];
    let joined: Promise<ResourcesApi.CloseReport> | undefined;
    await scope.resources.setup({
      name: "connection", setup: () => undefined,
      cleanup: (_value, { escalate }) => { observed.push(escalate.reason); },
    });
    scope.resources.signal.addEventListener("abort", () => { joined = scope.control.close(); }, { once: true });
    const closing = scope.control.close({ escalate: AbortSignal.abort(reason) });
    assert.equal(joined, closing);
    assert.equal((await closing).complete, true);
    assert.deepEqual(observed, [reason]);
  });

  await context.test("a child closing from its abort listener inherits the parent's pre-escalation", async () => {
    const host = api.createScope({ name: "host" });
    const child = host.resources.child({ name: "child" });
    const reason = new Error("parent budget exhausted");
    const observed: unknown[] = [];
    let joined: Promise<ResourcesApi.CloseReport> | undefined;
    await child.resources.setup({
      name: "connection", setup: () => undefined,
      cleanup: (_value, { escalate }) => { observed.push(escalate.reason); },
    });
    child.resources.signal.addEventListener("abort", () => { joined = child.control.close(); }, { once: true });
    assert.equal((await host.control.close({ escalate: AbortSignal.abort(reason) })).complete, true);
    assert.equal((await joined)?.complete, true);
    assert.deepEqual(observed, [reason]);
  });

  await context.test("all descendants refuse registration before the first parent abort listener", async () => {
    const host = api.createScope({ name: "host" });
    const child = host.resources.child({ name: "child" });
    const refusals: unknown[] = [];
    let setupRefusal: Promise<unknown> | undefined;
    let acquired = false;
    let disposed = false;
    host.resources.signal.addEventListener("abort", () => {
      try { child.resources.child({ name: "too-late" }); } catch (cause) { refusals.push(cause); }
      try {
        child.resources.use({ [Symbol.dispose](): void { disposed = true; } }, "too-late");
      } catch (cause) { refusals.push(cause); }
      setupRefusal = child.resources.setup({
        name: "too-late", setup: () => { acquired = true; }, cleanup: () => undefined,
      }).then(() => undefined, (cause: unknown) => cause);
    }, { once: true });
    assert.equal((await host.control.close()).complete, true);
    refusals.push(await setupRefusal);
    assert.equal(refusals.length, 3);
    for (const cause of refusals) {
      assert.ok(typeof cause === "object" && cause !== null && "code" in cause);
      assert.equal(cause.code, "resources.scope.closed");
    }
    assert.equal(acquired, false);
    assert.equal(disposed, false, "a refused value remains with its caller");
  });

  await context.test("ancestor cleanup waits for all child abort listeners and descendant notification", async () => {
    const host = api.createScope({ name: "host" });
    const child = host.resources.child({ name: "child" });
    const grandchild = child.resources.child({ name: "grandchild" });
    const trace: string[] = [];
    let parentClosing: Promise<ResourcesApi.CloseReport> | undefined;
    child.resources.signal.addEventListener("abort", () => { parentClosing = host.control.close(); }, { once: true });
    child.resources.signal.addEventListener("abort", () => { trace.push("child-detached"); }, { once: true });
    grandchild.resources.signal.addEventListener("abort", () => { trace.push("grandchild-detached"); }, { once: true });
    host.resources.use({ [Symbol.dispose](): void { trace.push("parent-cleanup"); } }, "provider");
    assert.equal((await child.control.close()).complete, true);
    assert.ok(parentClosing);
    assert.equal((await parentClosing).complete, true);
    assert.deepEqual(trace.toSorted(), ["child-detached", "grandchild-detached", "parent-cleanup"]);
    assert.ok(trace.indexOf("child-detached") < trace.indexOf("parent-cleanup"), JSON.stringify(trace));
    assert.ok(trace.indexOf("grandchild-detached") < trace.indexOf("parent-cleanup"), JSON.stringify(trace));
  });

  await context.test("run cancellation also finishes abort listeners before a reentrant ancestor cleanup", async () => {
    const host = api.createScope({ name: "host" });
    const run = new AbortController();
    const finish = Promise.withResolvers<void>();
    const trace: string[] = [];
    let parentClosing: Promise<ResourcesApi.CloseReport> | undefined;
    const factory = api.scoped("module", (_deps: object, { resources }: ResourcesApi.ModuleContext) => {
      const child = resources.child({ name: "child" });
      resources.signal.addEventListener("abort", () => { parentClosing = host.control.close(); }, { once: true });
      resources.signal.addEventListener("abort", () => { trace.push("module-detached"); }, { once: true });
      child.resources.signal.addEventListener("abort", () => { trace.push("child-detached"); }, { once: true });
      return finish.promise;
    });
    const constructing = factory({}, { scope: host.resources, signal: run.signal });
    host.resources.use({ [Symbol.dispose](): void { trace.push("parent-cleanup"); } }, "provider");
    run.abort();
    finish.resolve();
    await constructing;
    assert.ok(parentClosing);
    assert.equal((await parentClosing).complete, true);
    assert.deepEqual(trace.toSorted(), ["child-detached", "module-detached", "parent-cleanup"]);
    assert.ok(trace.indexOf("module-detached") < trace.indexOf("parent-cleanup"), JSON.stringify(trace));
    assert.ok(trace.indexOf("child-detached") < trace.indexOf("parent-cleanup"), JSON.stringify(trace));
  });

  await context.test("flat child reentry does not recursively restart the ancestor notification walk", async () => {
    const host = api.createScope({ name: "host" });
    const joined: Promise<ResourcesApi.CloseReport>[] = [];
    let cleanups = 0;
    for (let index = 0; index < 4096; index += 1) {
      const child = host.resources.child({ name: `child-${index}` });
      child.resources.use({ [Symbol.dispose](): void { cleanups += 1; } }, "entry");
      child.resources.signal.addEventListener("abort", () => { joined.push(host.control.close()); }, { once: true });
    }
    const closing = host.control.close();
    assert.equal(joined.length, 4096);
    assert.ok(joined.every(report => report === closing));
    assert.equal((await closing).complete, true);
    assert.equal(cleanups, 4096);
  });

  await context.test("independent Host roots keep their synchronous close behavior during another root's abort", async () => {
    const first = api.createScope({ name: "first" });
    const second = api.createScope({ name: "second" });
    const trace: string[] = [];
    let secondClosing: Promise<ResourcesApi.CloseReport> | undefined;
    second.resources.use({ [Symbol.dispose](): void { trace.push("second-cleanup"); } }, "entry");
    first.resources.signal.addEventListener("abort", () => {
      trace.push("first-listener-start");
      secondClosing = second.control.close();
      trace.push("first-listener-end");
    }, { once: true });
    assert.equal((await first.control.close()).complete, true);
    assert.equal((await secondClosing)?.complete, true);
    assert.deepEqual(trace, ["first-listener-start", "second-cleanup", "first-listener-end"]);
  });
}
