import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { many, optional, required } from "@get-modular/core";
import { assemblyFor, declareModule, defineContract } from "@get-modular/assembly";
import { createScope, scoped } from "@get-modular/resources";
import { ConformanceError, contractSuite, isolate, runContractSuite, smoke } from "../dist/index.js";

// ADR-0033: the real Core, Assembly and resources of this workspace build every module here.
const tests = dirname(fileURLToPath(import.meta.url));
const owner = { authority: "t", path: ["t"] };
const Logs = defineContract()({ id: "t/logs", revision: 1 });
const Audit = defineContract()({ id: "t/audit", revision: 1 });
const Db = defineContract()({ id: "t/db", revision: 1 });
const Orders = defineContract()({ id: "t/orders", revision: 1 });
const ordersSpec = {
  moduleId: "t/orders", implementationId: "t/orders/default", owner,
  provides: [Orders.provide()],
  slots: [Logs.slot("logs", many({ min: 0, max: 4 })), Audit.slot("audit", optional()), Db.slot("db", required())],
};
const ordersDeclaration = declareModule(ordersSpec);
const dependencies = () => ({ logs: [{ id: 1 }, { id: 2 }], audit: undefined, db: { query: () => 7 } });
const product = value => ({ instance: value, capabilities: { "t/orders": { list: () => value } } });
const code = error => error?.code;

test("H1 the module sees the records and context of a production run", async () => {
  const seen = [];
  await using isolated = await isolate(assemblyFor(), {
    declaration: ordersDeclaration, dependencies: dependencies(),
    factory: async (deps, context) => {
      seen.push(Object.isFrozen(deps.logs), Object.getPrototypeOf(deps), Object.hasOwn(deps, "audit"),
        Object.keys(context).sort());
      return product(deps.db.query() + deps.logs.length);
    },
  });
  assert.deepEqual(seen, [true, null, true, ["resources", "signal"]]);
  assert.equal(isolated.instance, 9);
  assert.equal(isolated.capabilities["t/orders"].list(), 9);
});

test("H1 a supplied optional dependency and a many array of the declared size are wired in order", async () => {
  let observed;
  await using _isolated = await isolate(assemblyFor(), {
    declaration: ordersDeclaration, dependencies: { ...dependencies(), audit: { who: "me" } },
    factory: async deps => { observed = [deps.audit.who, deps.logs.map(log => log.id)]; return product(0); },
  });
  assert.deepEqual(observed, ["me", [1, 2]]);
});

test("H2 a wrong product and a mutated dependency fail as they do in production", async () => {
  const wrong = await isolate(assemblyFor(), {
    declaration: ordersDeclaration, dependencies: dependencies(),
    factory: async () => ({ instance: 1, capabilities: {} }),
  }).then(() => undefined, error => error);
  assert.equal(code(wrong), "conformance.isolate.construction-failed");
  assert.equal(wrong.details.outcome.code, "assembly.run.invalid-product");
  assert.equal(wrong.details.report.complete, true);
  const mutating = await isolate(assemblyFor(), {
    declaration: ordersDeclaration, dependencies: dependencies(),
    factory: async deps => { deps.logs.push({ id: 3 }); return product(0); },
  }).then(() => undefined, error => error);
  assert.equal(code(mutating), "conformance.isolate.construction-failed");
  assert.ok(mutating.cause instanceof TypeError);
});

test("H2 an invalid or untrusted dependency record is refused before anything runs", async () => {
  let calls = 0;
  const factory = async () => { calls += 1; return product(0); };
  const getter = { ...dependencies() };
  Object.defineProperty(getter, "db", { enumerable: true, get() { calls += 1; return {}; } });
  const { db: _db, ...missing } = dependencies();
  for (const bad of [getter, missing, { ...dependencies(), logs: { length: 0 } },
    { ...dependencies(), logs: [, 1] }, { ...dependencies(), logs: Object.defineProperty([], 0, { get() { calls += 1; return 1; } }) }]) {
    const error = await isolate(assemblyFor(), { declaration: ordersDeclaration, dependencies: bad, factory })
      .then(() => undefined, caught => caught);
    assert.equal(code(error), "conformance.argument.invalid");
  }
  const reserved = declareModule({ ...ordersSpec, moduleId: "conformance/orders" });
  const error = await isolate(assemblyFor(), { declaration: reserved, dependencies: dependencies(), factory })
    .then(() => undefined, caught => caught);
  assert.equal(code(error), "conformance.argument.invalid");
  assert.equal(calls, 0);
});

test("H3 dispose reports the debt, and a later close retries it", async () => {
  const journal = [];
  let failures = 1;
  const declaration = declareModule({
    moduleId: "t/resources", implementationId: "t/resources/default", owner, provides: [Orders.provide()], slots: [],
  });
  const isolated = await isolate(assemblyFor(), {
    declaration, dependencies: {},
    factory: async (_deps, { resources }) => {
      await resources.setup({ name: "a", setup: () => 1, cleanup: () => { journal.push("a"); } });
      await resources.setup({
        name: "b", setup: () => 2,
        cleanup: () => { journal.push("b"); if (failures-- > 0) throw new Error("b is stuck"); },
      });
      return product(0);
    },
  });
  const failure = await isolated[Symbol.asyncDispose]().then(() => undefined, error => error);
  assert.equal(code(failure), "resources.close.incomplete");
  assert.deepEqual(journal, ["b", "a"]);
  assert.equal((await isolated.close()).complete, true);
});

// Five modules in a chain, each owning one resource whose release is recorded.
function chain({ onCleanup = () => {}, onStart = () => {}, onDone = () => {}, wait = () => undefined, carrier, throws } = {}) {
  const declarations = [1, 2, 3, 4, 5].map(index => declareModule({
    moduleId: `t/m${String(index)}`, implementationId: `t/m${String(index)}`, owner,
    provides: [defineContract()({ id: `t/c${String(index)}`, revision: 1 }).provide()],
    slots: index === 1 ? [] : [defineContract()({ id: `t/c${String(index - 1)}`, revision: 1 }).slot("dep", required())],
  }));
  const calls = { compose: 0 };
  const compose = async api => {
    calls.compose += 1;
    const handles = declarations.map((declaration, position) => api.bindFactory(declaration,
      scoped(declaration.implementationId, (_deps, { resources, signal }) => {
        if (throws && position === 2) { throw new Error("synchronous failure"); }
        const body = (async () => {
          onStart(declaration.implementationId);
          await resources.setup({
            name: "conn", setup: ({ signal: setupSignal }) => wait(declaration.implementationId, setupSignal),
            cleanup: () => { onCleanup(declaration.implementationId); },
          });
          onDone(declaration.implementationId, signal);
          return { instance: position, capabilities: { [`t/c${String(position + 1)}`]: position } };
        })();
        return carrier && position === 2 ? carrier(body) : body;
      })));
    return api.prepare({ composition: await compileChain(declarations), factories: handles, roots: { root: handles[4] } });
  };
  return { calls, compose };
}
async function compileChain(declarations) {
  const { compileComposition } = await import("@get-modular/core");
  const result = await compileComposition({
    declarations,
    profile: {
      kind: "get-modular.composition-profile", schemaVersion: 1, profileId: "t/chain", roots: ["t/m5"],
      selections: declarations.map(({ moduleId, implementationId }) => ({ moduleId, implementationId })),
      bindings: declarations.slice(1).map((declaration, index) => ({
        consumerImplementationId: declaration.implementationId, slotId: "dep",
        providerImplementationIds: [declarations[index].implementationId],
      })),
    },
  });
  assert.equal(result.ok, true);
  return result;
}

test("S1 one composition root, a failure injected at every module, every attempt released", async () => {
  const everything = chain();
  const steps = await smoke({ api: assemblyFor(), compose: everything.compose });
  assert.equal(everything.calls.compose, 1);
  assert.equal(steps.length, 11);
  assert.deepEqual(steps.map(step => `${step.inject}:${step.at ?? ""}`), [
    "none:", ...[1, 2, 3, 4, 5].flatMap(index => [`fail:t/m${String(index)}`, `abort:t/m${String(index)}`])]);
  assert.ok(steps.every(step => step.problem === undefined && step.report.complete));

  const log = [];
  const failing = chain({ onCleanup: id => { log.push(id); } });
  const failures = await smoke({ api: assemblyFor(), compose: failing.compose, inject: ["fail"] });
  assert.equal(failures.length, 6);
  const released = from => ["t/m1", "t/m2", "t/m3", "t/m4", "t/m5"].slice(0, from).reverse();
  assert.deepEqual(log, [5, 1, 2, 3, 4, 5].flatMap(released));
});

test("S2 a cleanup debt of a partial attempt fails the smoke run with its path", async () => {
  let rootCreated = false;
  const leaky = chain({
    onStart: id => { if (id === "t/m1") rootCreated = false; },
    onDone: id => { if (id === "t/m5") rootCreated = true; },
    onCleanup: id => { if (id === "t/m2" && !rootCreated) throw new Error("m2 leaks unless the root was created"); },
  });
  const error = await smoke({ api: assemblyFor(), compose: leaky.compose }).then(() => undefined, caught => caught);
  assert.equal(code(error), "conformance.smoke.failed");
  // Exactly the attempts that stop at a module after t/m1 and before the root leave the debt of t/m2.
  const key = step => `${step.inject}:${step.at ?? ""}`;
  const expected = new Map();
  for (const mode of ["fail", "abort"]) {
    for (const id of ["t/m2", "t/m3", "t/m4"]) expected.set(`${mode}:${id}`, [["smoke", "t/m2", "conn"]]);
  }
  assert.equal(error.details.steps.length, 11);
  for (const step of error.details.steps) {
    const paths = step.report.debts.map(debt => debt.path);
    assert.deepEqual(paths, expected.get(key(step)) ?? [], key(step));
    assert.equal(step.problem === undefined, !expected.has(key(step)), key(step));
  }
});

test("S2 a Promise subclass or a synchronous throw fails smoke as it fails production", async () => {
  class Sub extends Promise {}
  const production = async compose => {
    const preparation = await compose(assemblyFor());
    const scope = createScope({ name: "production" });
    const outcome = await preparation.prepared.run({ scope: scope.resources });
    await scope.control.close();
    return outcome;
  };
  for (const [variant, expectedCode] of [
    [{ carrier: promise => Sub.resolve(promise) }, "assembly.run.unsupported-carrier"],
    [{ throws: true }, "assembly.run.factory-threw"],
  ]) {
    const { compose } = chain(variant);
    const outcome = await production(compose);
    assert.equal(outcome.status, "failed");
    assert.equal(outcome.code, expectedCode);
    const error = await smoke({ api: assemblyFor(), compose }).then(() => undefined, caught => caught);
    assert.equal(code(error), "conformance.smoke.failed");
    assert.equal(error.details.steps.length, 1);
    assert.match(error.details.steps[0].problem, new RegExp(expectedCode.replaceAll(".", "\\."), "u"));
  }
});

test("S2 a debt in the first run does not hide an unknown at id", async () => {
  const stuck = chain({ onCleanup: id => { if (id === "t/m1") throw new Error("always stuck"); } });
  const error = await smoke({ api: assemblyFor(), compose: stuck.compose, at: ["t/missing"] })
    .then(() => undefined, caught => caught);
  assert.equal(code(error), "conformance.argument.invalid");
  // The first run succeeded with a debt: every injection step still runs and is reported.
  const all = await smoke({ api: assemblyFor(), compose: stuck.compose }).then(() => undefined, caught => caught);
  assert.equal(code(all), "conformance.smoke.failed");
  assert.equal(all.details.steps.length, 11);
  assert.equal(all.details.steps[0].outcome, "succeeded");
  assert.match(all.details.steps[0].problem, /debt/u);
});

test("S3 an abort injected right after a module is called reaches its setup", { timeout: 20000 }, async () => {
  let run = 0;
  let sawAbort;
  const waiting = chain({
    onStart: id => { if (id === "t/m1") run += 1; },
    wait: (id, signal) => {
      if (id !== "t/m2" || run < 2) return undefined;
      return new Promise(resolve => {
        signal.addEventListener("abort", () => { sawAbort = signal.aborted; resolve(undefined); }, { once: true });
      });
    },
  });
  const steps = await smoke({ api: assemblyFor(), compose: waiting.compose, inject: ["abort"], at: ["t/m2"] });
  assert.equal(sawAbort, true);
  assert.equal(steps.length, 2);
  assert.ok(["cancelled", "failed"].includes(steps[1].outcome));
});

test("S4 run inputs are passed to every attempt, and a root that needs them fails without them", async () => {
  const Session = defineContract()({ id: "t/session", revision: 1 });
  const sessionModule = declareModule({
    moduleId: "t/session-input", implementationId: "t/session-input", owner, provides: [Session.provide()], slots: [],
  });
  const store = declareModule({
    moduleId: "t/store", implementationId: "t/store", owner,
    provides: [Orders.provide()], slots: [Session.slot("session", required())],
  });
  const { compileComposition } = await import("@get-modular/core");
  const composition = await compileComposition({
    declarations: [sessionModule, store],
    profile: {
      kind: "get-modular.composition-profile", schemaVersion: 1, profileId: "t/s4", roots: ["t/store"],
      selections: [sessionModule, store].map(({ moduleId, implementationId }) => ({ moduleId, implementationId })),
      bindings: [{ consumerImplementationId: "t/store", slotId: "session", providerImplementationIds: ["t/session-input"] }],
    },
  });
  const compose = async api => {
    const input = api.bindInput(sessionModule);
    const handle = api.bindFactory(store, scoped("t/store", async deps => product(deps.session)));
    return api.prepare({ composition, factories: [handle], roots: { store: handle }, inputs: { session: input } });
  };
  const steps = await smoke({ api: assemblyFor(), compose, inputs: { session: { "t/session": "s1" } } });
  assert.equal(steps.length, 3);
  const error = await smoke({ api: assemblyFor(), compose }).then(() => undefined, caught => caught);
  assert.equal(code(error), "conformance.smoke.failed");
});

const contract = revision => defineContract()({ id: "t/db", revision });
const subjectFor = (revision, create) => ({
  name: "fake", create,
  declaration: declareModule({
    moduleId: "t/fake", implementationId: "t/fake/default", owner, provides: [contract(revision).provide()], slots: [],
  }),
});

test("CS1 a suite written against another revision is refused before any test registers", () => {
  const suite = contractSuite(contract(3), { reads: () => {} });
  let registered = 0;
  const error = (() => {
    try { runContractSuite(suite, subjectFor(2, () => ({})), () => { registered += 1; }); } catch (caught) { return caught; }
    return undefined;
  })();
  assert.ok(error instanceof ConformanceError);
  assert.equal(error.code, "conformance.suite.revision-mismatch");
  assert.match(error.message, /fake provides t\/db as t\/db\/r2; the suite checks t\/db\/r3/u);
  assert.equal(registered, 0);
  runContractSuite(suite, subjectFor(3, () => ({})), () => { registered += 1; });
  assert.equal(registered, 1);
});

test("CS2 every case gets a fresh scope that is closed before the next case", async () => {
  const journal = [];
  const scopes = [];
  const suite = contractSuite(contract(1), {
    "registers a resource": async (_value, { resources }) => {
      scopes.push(resources);
      await resources.setup({ name: "r", setup: () => 1, cleanup: () => { journal.push("released 1"); } });
    },
    "sees a new scope": async (_value, { resources, signal }) => {
      journal.push("case 2");
      assert.notEqual(resources, scopes[0]);
      assert.equal(signal.aborted, false);
    },
  });
  const registered = [];
  runContractSuite(suite, subjectFor(1, () => ({})), (name, body) => registered.push({ name, body }));
  assert.deepEqual(registered.map(entry => entry.name), [
    "t/db r1: registers a resource [fake]", "t/db r1: sees a new scope [fake]"]);
  for (const entry of registered) await entry.body();
  assert.deepEqual(journal, ["released 1", "case 2"]);
  assert.equal(scopes[0].signal.aborted, true);
});

test("CS3 a case failure keeps the cleanup debt, and a debt alone is reported as itself", async () => {
  const boom = new Error("case failed");
  const stuck = new Error("cleanup failed");
  const registered = [];
  const stick = async resources => resources.setup({ name: "r", setup: () => 1, cleanup: () => { throw stuck; } });
  runContractSuite(contractSuite(contract(1), {
    both: async (_value, { resources }) => { await stick(resources); throw boom; },
    debt: async (_value, { resources }) => { await stick(resources); },
    plain: async () => { throw boom; },
  }), subjectFor(1, () => ({})), (name, body) => registered.push({ name, body }));
  const [both, debt, plain] = await Promise.all(registered.map(entry => entry.body().then(() => undefined, error => error)));
  assert.equal(both.code, "conformance.suite.case-failed");
  assert.equal(both.cause, boom);
  assert.equal(both.details.report.debts[0].cause, stuck);
  assert.equal(debt.code, "resources.close.incomplete");
  assert.equal(plain, boom);
});

const probe = (scenario, ...rest) => spawnSync(process.execPath, [join(tests, "handle-probe.mjs"), scenario, ...rest],
  { encoding: "utf8", timeout: 60000, env: { ...process.env, NODE_OPTIONS: "" } });

test("G1 a handle opened and never closed is reported; a closed one never is, run after run", () => {
  const leaked = probe("leak");
  assert.equal(leaked.status, 0, leaked.stderr);
  assert.deepEqual(JSON.parse(leaked.stdout), { code: "conformance.handles.leaked", leaked: { TCPServerWrap: 1 } });
  const clean = probe("clean", "20");
  assert.equal(clean.status, 0, clean.stderr);
  assert.deepEqual(JSON.parse(clean.stdout), { runs: 20, leaked: 0 });
  const allowed = probe("allow");
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.deepEqual(JSON.parse(allowed.stdout), { code: null });
});
