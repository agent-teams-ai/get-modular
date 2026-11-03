import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type * as ResourcesApi from "../dist/index.js";

// Deeper than the native call stack reached by the former recursive close and report walks.
const DEPTH = 5000;

function descend(parent: ResourcesApi.Scope): ResourcesApi.Scope[] {
  const scopes: ResourcesApi.Scope[] = [];
  for (let index = 0; index < DEPTH; index += 1) {
    parent = parent.resources.child({ name: "child" });
    scopes.push(parent);
  }
  return scopes;
}

export async function runDeepScopeSuite(api: typeof ResourcesApi, context: TestContext): Promise<void> {
  await context.test("deep close preserves sealing, pending debt, escalation and failed cleanup retry", async () => {
    const host = api.createScope({ name: "host" });
    const released: string[] = [];
    host.resources.use({ [Symbol.dispose](): void { released.push("provider"); } }, "provider");
    const scopes = descend(host);
    const leaf = scopes.at(-1);
    assert.ok(leaf);
    const finish = Promise.withResolvers<void>();
    const reason = new Error("escalate the deep cleanup");
    const failure = new Error("physical cleanup needs another attempt");
    let attempts = 0;
    let escalation: AbortSignal | undefined;
    await leaf.resources.setup({
      name: "resource",
      setup: () => undefined,
      cleanup: async (_value, { escalate }) => {
        attempts += 1;
        escalation = escalate;
        if (attempts === 1) {
          released.push("leaf-start");
          await finish.promise;
          throw failure;
        }
        released.push("leaf-retried");
      },
    });
    let sealedBeforeNotification = false;
    host.resources.signal.addEventListener("abort", () => {
      assert.throws(() => leaf.resources.child({ name: "too-late" }), { code: "resources.scope.closed" });
      sealedBeforeNotification = true;
    }, { once: true });
    const escalate = new AbortController();
    const closing = host.control.close({ escalate: escalate.signal });
    assert.equal(sealedBeforeNotification, true);
    assert.ok(scopes.every(scope => scope.resources.signal.aborted));
    assert.deepEqual(released, ["leaf-start"], "the first descendant cleanup still starts in the close call");
    assert.equal(host.control.close(), closing, "a repeated close joins the original flight");
    const abandoned = await host.control.close({ abandon: AbortSignal.abort() });
    const path = ["host", ...Array<string>(DEPTH).fill("child"), "resource"];
    assert.deepEqual(abandoned, {
      complete: false, settled: false,
      debts: [{ path, state: "pending" }, { path: ["host", "provider"], state: "not-run" }],
    });
    assert.ok(Object.isFrozen(abandoned) && Object.isFrozen(abandoned.debts));
    assert.ok(abandoned.debts.every(debt => Object.isFrozen(debt) && Object.isFrozen(debt.path)));
    escalate.abort(reason);
    assert.equal(escalation?.reason, reason);
    assert.deepEqual(released, ["leaf-start"], "abandon and escalation do not release the provider");
    finish.resolve();
    const failed = await closing;
    assert.deepEqual(failed, { complete: false, settled: true, debts: [{ path, state: "failed", cause: failure }] });
    assert.deepEqual(released, ["leaf-start", "provider"], "genuinely failed cleanup retains the existing continue rule");
    assert.equal((await host.control.close()).complete, true);
    assert.equal(attempts, 2);
    assert.deepEqual(released, ["leaf-start", "provider", "leaf-retried"]);
    assert.equal(abandoned.debts[0]?.state, "pending", "the old abandoned snapshot remains detached");
    assert.equal((await leaf.control.close()).complete, true);
  });

  await context.test("deep construction cancellation finishes native listeners before a reentrant ancestor cleanup", async () => {
    const host = api.createScope({ name: "host" });
    const run = new AbortController();
    const finish = Promise.withResolvers<void>();
    const trace: string[] = [];
    let ancestorClosing: Promise<ResourcesApi.CloseReport> | undefined;
    let descendants: ResourcesApi.Scope[] = [];
    const factory = api.scoped("module", (_deps: object, { resources }: ResourcesApi.ModuleContext) => {
      descendants = descend(resources.child({ name: "work" }));
      resources.signal.addEventListener("abort", () => { ancestorClosing = host.control.close(); }, { once: true });
      resources.signal.addEventListener("abort", () => { trace.push("module-aborted"); }, { once: true });
      descendants.at(-1)?.resources.signal.addEventListener("abort", () => { trace.push("leaf-aborted"); }, { once: true });
      return finish.promise;
    });
    const constructing = factory({}, { scope: host.resources, signal: run.signal });
    host.resources.use({ [Symbol.dispose](): void { trace.push("ancestor-cleanup"); } }, "provider");
    run.abort();
    assert.ok(descendants.every(scope => scope.resources.signal.aborted));
    assert.deepEqual(trace.toSorted(), ["ancestor-cleanup", "leaf-aborted", "module-aborted"]);
    assert.ok(trace.indexOf("module-aborted") < trace.indexOf("ancestor-cleanup"));
    assert.ok(trace.indexOf("leaf-aborted") < trace.indexOf("ancestor-cleanup"));
    finish.resolve();
    await constructing;
    assert.ok(ancestorClosing);
    assert.equal((await ancestorClosing).complete, true);
  });

  await context.test("a cleanup can start a sibling close without duplicating either flight", async () => {
    const host = api.createScope({ name: "host" });
    const sibling = host.resources.child({ name: "sibling" });
    const finish = Promise.withResolvers<void>();
    let attempts = 0;
    let siblingClosing: Promise<ResourcesApi.CloseReport> | undefined;
    sibling.resources.use({ async [Symbol.asyncDispose](): Promise<void> { attempts += 1; await finish.promise; } }, "resource");
    host.resources.use({ [Symbol.dispose](): void { siblingClosing = sibling.control.close(); } }, "start-sibling-close");
    const closing = host.control.close();
    assert.ok(siblingClosing);
    assert.equal(sibling.control.close(), siblingClosing);
    assert.equal(attempts, 1);
    finish.resolve();
    assert.equal((await siblingClosing).complete, true);
    assert.equal((await closing).complete, true);
    assert.equal(attempts, 1);
  });
}
