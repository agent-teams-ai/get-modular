import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { compileComposition, many, optional, required } from "@get-modular/core";
import { assemblyFor, declareModule, defineContract, implement, input } from "@get-modular/assembly";
import { createScope, scoped } from "@get-modular/resources";
import {
  ConformanceError, checkModuleLayout, checkNamespaces, checkWiring, contractSuite, describeWiring, guardHandles,
  isolate, runContractSuite, smoke,
} from "../dist/index.js";

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
const entryFor = (declaration, factory) => implement()(declaration, factory, scoped);

const Port = defineContract()({ id: "t/port", revision: 1 });
const portName = name => name.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
const portDeclaration = (name = "port") => declareModule({
  moduleId: `t/${portName(name)}`, implementationId: `t/${portName(name)}/default`, owner, provides: [Port.provide()], slots: [],
});
const portEntry = (value, name = "port", setup = async () => {}) => {
  const declaration = portDeclaration(name);
  return entryFor(declaration, async (_deps, { resources }) => {
    await setup(resources);
    return { instance: 0, capabilities: { "t/port": value } };
  });
};
const portViolation = (implementationId, members) => ({
  implementationId, capabilityId: "t/port", members,
});
const rejection = promise => promise.then(() => null, caught => caught);

test("P1 ports whose members are own properties build and close completely", async () => {
  class ArrowFields { static marker = true; constructor() { this.read = () => 1; } }
  const values = [
    ["class arrow fields", new ArrowFields()],
    ["own method using this", { read() { return this; } }],
    ["Map", new Map()],
    ["array", []],
    ["Buffer", Buffer.from("x")],
    ["SharedArrayBuffer", new SharedArrayBuffer(8)],
    ["typed array", new Uint8Array(1)],
    ["Date", new Date()],
    ["null prototype", Object.create(null)],
    ["function", () => 1],
    ["number", 1],
    ["cross-realm object", vm.runInNewContext("({ read: () => 1 })")],
    ["cross-realm array", vm.runInNewContext("[1]")],
  ];
  for (const [name, value] of values) {
    const isolated = await isolate(portEntry(value, `p1-${name.replaceAll(" ", "-")}`), { dependencies: {} });
    const report = await isolated.close();
    assert.equal(report.complete, true, name);
  }
});

test("P2 prototype members fail with exact violations", async () => {
  class Method { read() { return 1; } }
  class Accessor { get size() { return 1; } set size(value) { void value; } }
  class Base { base() {} other() {} }
  class Derived extends Base { own() {} }
  class MapSub extends Map { read() {} }
  const symbol = Symbol("call");
  const symbolPrototype = {};
  Object.defineProperty(symbolPrototype, symbol, { value() {} });
  const cases = [
    ["class method", new Method(), ["read"]],
    ["Object.create method", Object.create({ read() {} }), ["read"]],
    ["prototype accessor", new Accessor(), ["size"]],
    ["EventEmitter", new EventEmitter(), "emit"],
    ["URL", new URL("https://example.invalid/"), "href"],
    ["Map subclass", new MapSub(), ["read"]],
    ["derived class", new Derived(), ["own", "base", "other"]],
    ["symbol method", Object.create(symbolPrototype), [String(symbol)]],
  ];
  for (const [name, value, members] of cases) {
    const error = await rejection(isolate(portEntry(value, `p2-${name.replaceAll(" ", "-")}`), { dependencies: {} }));
    assert.equal(code(error), "conformance.ports.prototype-member", name);
    const [found, ...rest] = error.details.violations;
    assert.equal(rest.length, 0, name);
    assert.equal(found.implementationId, `t/${portName(`p2-${name}`)}/default`, name);
    assert.equal(found.capabilityId, "t/port", name);
    if (typeof members === "string") {
      assert.ok(found.members.includes(members), name);
    } else {
      assert.deepEqual(found.members, members, name);
    }
    assert.equal(error.details.report.complete, true, name);
  }
});

test("P2b a prototype that is a function and carries a method is walked", async () => {
  const prototype = function carrier() {};
  prototype.read = () => 1;
  const error = await rejection(isolate(portEntry(Object.setPrototypeOf({}, prototype), "p2b-function"), { dependencies: {} }));
  assert.equal(code(error), "conformance.ports.prototype-member");
  assert.ok(error.details.violations[0].members.includes("read"));
});

test("P3 a prototype getter is reported without being called, and an own getter is not", async () => {
  let calls = 0;
  const withPrototypeGetter = Object.create({
    get read() { calls += 1; return () => 1; },
  });
  const error = await rejection(isolate(portEntry(withPrototypeGetter, "p3-prototype"), { dependencies: {} }));
  assert.equal(code(error), "conformance.ports.prototype-member");
  assert.deepEqual(error.details.violations, [portViolation("t/p3-prototype/default", ["read"])]);
  const ownGetter = {};
  Object.defineProperty(ownGetter, "read", {
    enumerable: true,
    get() { calls += 1; return () => 1; },
  });
  const isolated = await isolate(portEntry(ownGetter, "p3-own"), { dependencies: {} });
  assert.equal((await isolated.close()).complete, true);
  assert.equal(calls, 0);
});

test("P4 isolate closes its scope before a ports error and a walk error", async () => {
  class Method { read() {} }
  let cleanup = 0;
  const parent = createScope({ name: "parent" });
  const error = await rejection(isolate(
    portEntry(new Method(), "p4-violation", async resources => {
      await resources.setup({ name: "cleanup", setup: () => 1, cleanup: () => { cleanup += 1; } });
    }),
    { dependencies: {}, within: parent.resources },
  ));
  assert.equal(code(error), "conformance.ports.prototype-member");
  assert.equal(error.details.report.complete, true);
  assert.equal(cleanup, 1);
  const parentReport = await parent.control.close();
  assert.equal(parentReport.complete, true);
  assert.deepEqual(parentReport.debts, []);

  const trap = new Error("getPrototypeOf trap");
  const proxy = new Proxy({}, { getPrototypeOf() { throw trap; } });
  let proxyCleanup = 0;
  const walkError = await rejection(isolate(
    portEntry(proxy, "p4-proxy", async resources => {
      await resources.setup({ name: "cleanup", setup: () => 1, cleanup: () => { proxyCleanup += 1; } });
    }),
    { dependencies: {} },
  ));
  assert.equal(walkError, trap);
  assert.equal(proxyCleanup, 1);
});

test("P5 smoke reports the first run's ports before any injected run", async () => {
  class Method { read() {} }
  const run = async values => {
    const calls = [0, 0];
    const compose = async api => {
      const declarations = values.map((_, index) => portDeclaration(`p5-${String(index)}`));
      const handles = declarations.map((declaration, index) => entryFor(declaration, async () => {
        calls[index] += 1;
        return { instance: 0, capabilities: { "t/port": values[index] } };
      }));
      const composition = await compileComposition({
        declarations,
        profile: {
          kind: "get-modular.composition-profile", schemaVersion: 1, profileId: "t/p5",
          roots: declarations.map(declaration => declaration.moduleId),
          selections: declarations.map(({ moduleId, implementationId }) => ({ moduleId, implementationId })),
          bindings: [],
        },
      });
      assert.equal(composition.ok, true);
      return api.prepare({
        composition, modules: handles, roots: { first: handles[0], second: handles[1] },
      });
    };
    const error = await rejection(smoke({ api: assemblyFor(), compose }));
    return { calls, error };
  };
  const one = await run([new Method(), {}]);
  assert.equal(code(one.error), "conformance.ports.prototype-member");
  assert.deepEqual(one.calls, [1, 1]);
  assert.deepEqual(one.error.details.violations, [portViolation("t/p5-0/default", ["read"])]);
  assert.equal(one.error.details.steps.length, 1);
  assert.equal(one.error.details.steps[0].report.complete, true);

  const two = await run([new Method(), Object.create({ read() {} })]);
  assert.deepEqual(two.error.details.violations.map(violation => violation.implementationId),
    ["t/p5-0/default", "t/p5-1/default"]);
});

test("P6 a Map from another realm is reported as the known container limit", async () => {
  const error = await rejection(isolate(portEntry(vm.runInNewContext("new Map()"), "p6"), { dependencies: {} }));
  assert.equal(code(error), "conformance.ports.prototype-member");
  assert.ok(error.details.violations[0].members.includes("get"));
});

test("H1 the module sees the records and context of a production run", async () => {
  const seen = [];
  await using isolated = await isolate(entryFor(ordersDeclaration, async (deps, context) => {
      seen.push(Object.isFrozen(deps.logs), Object.getPrototypeOf(deps), Object.hasOwn(deps, "audit"),
        Object.keys(context).sort());
      return product(deps.db.query() + deps.logs.length);
    }), { dependencies: dependencies() });
  assert.deepEqual(seen, [true, null, true, ["resources", "signal"]]);
  assert.equal(isolated.instance, 9);
  assert.equal(isolated.capabilities["t/orders"].list(), 9);
});

test("H1 a supplied optional dependency and a many array of the declared size are wired in order", async () => {
  let observed;
  await using _isolated = await isolate(entryFor(ordersDeclaration, async deps => { observed = [deps.audit.who, deps.logs.map(log => log.id)]; return product(0); }), { dependencies: { ...dependencies(), audit: { who: "me" } } });
  assert.deepEqual(observed, ["me", [1, 2]]);
});

test("H2 a wrong product and a mutated dependency fail as they do in production", async () => {
  const wrong = await isolate(entryFor(ordersDeclaration, async () => ({ instance: 1, capabilities: {} })), { dependencies: dependencies() }).then(() => undefined, error => error);
  assert.equal(code(wrong), "conformance.isolate.construction-failed");
  assert.equal(wrong.details.outcome.code, "assembly.run.invalid-product");
  assert.equal(wrong.details.report.complete, true);
  const mutating = await isolate(entryFor(ordersDeclaration, async deps => { deps.logs.push({ id: 3 }); return product(0); }), { dependencies: dependencies() }).then(() => undefined, error => error);
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
    const error = await isolate(entryFor(ordersDeclaration, factory), { dependencies: bad })
      .then(() => undefined, caught => caught);
    assert.equal(code(error), "conformance.argument.invalid");
  }
  const reserved = declareModule({ ...ordersSpec, moduleId: "conformance/orders" });
  const error = await isolate(entryFor(reserved, factory), { dependencies: dependencies() })
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
  const isolated = await isolate(entryFor(declaration, async (_deps, { resources }) => {
      await resources.setup({ name: "a", setup: () => 1, cleanup: () => { journal.push("a"); } });
      await resources.setup({
        name: "b", setup: () => 2,
        cleanup: () => { journal.push("b"); if (failures-- > 0) throw new Error("b is stuck"); },
      });
      return product(0);
    }), { dependencies: {} });
  const failure = await isolated[Symbol.asyncDispose]().then(() => undefined, error => error);
  assert.equal(code(failure), "resources.close.incomplete");
  assert.deepEqual(journal, ["b", "a"]);
  assert.equal((await isolated.close()).complete, true);
});

function chainDeclarations() {
  return [1, 2, 3, 4, 5].map(index => declareModule({
    moduleId: `t/m${String(index)}`, implementationId: `t/m${String(index)}`, owner,
    provides: [defineContract()({ id: `t/c${String(index)}`, revision: 1 }).provide()],
    slots: index === 1 ? [] : [defineContract()({ id: `t/c${String(index - 1)}`, revision: 1 }).slot("dep", required())],
  }));
}
// Five modules in a chain, each owning one resource whose release is recorded.
function chain({ onCleanup = () => {}, onStart = () => {}, onDone = () => {}, wait = () => undefined, carrier, throws } = {}) {
  const declarations = chainDeclarations();
  const calls = { compose: 0 };
  const compose = async api => {
    calls.compose += 1;
    const handles = declarations.map((declaration, position) => implement()(declaration,
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
    return api.prepare({ composition: await compileChain(declarations), modules: handles, roots: { root: handles[4] } });
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

test("S1b smoke runs a profileId root whose bindings Assembly completes", async () => {
  const calls = { compose: 0 };
  const compose = async api => {
    calls.compose += 1;
    const handles = chainDeclarations().map(declaration => implement()(declaration, async () => ({
      instance: declaration.implementationId, capabilities: Object.fromEntries(declaration.provides.map(({ capabilityId }) => [capabilityId, {}])),
    })));
    return api.prepare({ profileId: "t/chain", modules: handles, roots: { root: handles[4] } });
  };
  const steps = await smoke({ api: assemblyFor(), compose });
  assert.equal(calls.compose, 1);
  assert.equal(steps.length, 11);
  assert.ok(steps.every(step => step.problem === undefined && step.report.complete));
});

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

test("S2 modules bound outside the api given to compose fail smoke", async () => {
  const separate = assemblyFor();
  const outside = chain();
  // The root binds with its own Assembly and only returns the preparation.
  const compose = async () => outside.compose(separate);
  const error = await smoke({ api: assemblyFor(), compose }).then(() => undefined, caught => caught);
  assert.equal(code(error), "conformance.smoke.failed");
  assert.match(error.message, /did not produce/u);
});

test("S2 smoke rejects a missing input record", async () => {
  const error = await smoke(undefined).then(() => undefined, caught => caught);
  assert.equal(code(error), "conformance.argument.invalid");
});

// A scripted Assembly: it runs the bound modules in order, so smoke's own expectations can be broken at will.
function scripted(tweak) {
  const ids = ["t/a", "t/b", "t/c"];
  const declarations = ids.map(id => declareModule({
    moduleId: id, implementationId: id, owner, provides: [], slots: [],
  }));
  const api = {
    prepare: async ({ modules }) => ({
      status: "prepared",
      prepared: {
        run: async ({ signal }) => {
          const created = [];
          for (const { declaration, factory } of modules) {
            try {
              await factory({}, { signal, scope: undefined });
            } catch (cause) {
              return tweak({ status: "failed", phase: "factory", code: "assembly.run.factory-rejected",
                implementationId: declaration.implementationId, cause, created: [...created], returned: undefined, cancellation: undefined });
            }
            created.push({ moduleId: declaration.moduleId, implementationId: declaration.implementationId, instance: 1, capabilities: {} });
            if (signal.aborted) return { status: "cancelled", reason: signal.reason, created: [...created] };
          }
          return { status: "succeeded", roots: {}, created };
        },
      },
    }),
  };
  const compose = async given => given.prepare({ composition: undefined, roots: {}, modules: declarations.map(declaration =>
    implement()(declaration, async () => ({ instance: 1, capabilities: {} }))) });
  return { api, compose };
}

test("S1 smoke checks the cause and the created prefix of an injected failure", async () => {
  const honest = scripted(outcome => outcome);
  assert.equal((await smoke({ api: honest.api, compose: honest.compose })).length, 7);
  for (const [tweak, pattern] of [
    [outcome => ({ ...outcome, cause: new Error("another failure") }), /expected the injected failure/u],
    [outcome => ({ ...outcome, created: [...outcome.created, { implementationId: "extra" }] }), /expected created/u],
  ]) {
    const { api, compose } = scripted(tweak);
    const error = await smoke({ api, compose, inject: ["fail"] }).then(() => undefined, caught => caught);
    assert.equal(code(error), "conformance.smoke.failed");
    const problems = error.details.steps.filter(step => step.inject === "fail").map(step => step.problem);
    assert.equal(problems.length, 3);
    assert.ok(problems.every(problem => pattern.test(problem)), String(problems));
  }
});

test("H2 an id that only starts with the reserved prefix is accepted", async () => {
  const declaration = declareModule({ ...ordersSpec, moduleId: "conformancex/orders", implementationId: "conformancex/orders/default" });
  await using isolated = await isolate(entryFor(declaration, async () => product(1)), { dependencies: dependencies() });
  assert.equal(isolated.instance, 1);
});

test("H3 within puts the module scope under the caller's scope, and the signal reaches the run", async () => {
  const declaration = declareModule({
    moduleId: "t/within", implementationId: "t/within/default", owner, provides: [Orders.provide()], slots: [],
  });
  const registered = [];
  const subject = { name: "within-subject", declaration, create: () => ({ list: () => 0 }) };
  runContractSuite(contractSuite(Orders, {
    "builds inside the case scope": async (_value, context) => {
      await isolate(entryFor(declaration, async (_deps, { resources }) => {
          await resources.setup({ name: "conn", setup: () => 1, cleanup: () => { throw new Error("stuck"); } });
          return product(0);
        }), { dependencies: {}, within: context.resources });
    },
  }), subject, (name, body) => registered.push({ name, body }));
  const failure = await registered[0].body().then(() => undefined, error => error);
  assert.equal(code(failure), "resources.close.incomplete");
  assert.deepEqual(failure.report.debts.map(debt => debt.path), [["within-subject", "isolate", "t/within/default", "conn"]]);

  const cancelled = await isolate(entryFor(declaration, async () => product(0)), { dependencies: {}, signal: AbortSignal.abort() }).then(() => undefined, error => error);
  assert.equal(code(cancelled), "conformance.isolate.construction-failed");
  assert.equal(cancelled.details.outcome.status, "cancelled");
});

test("G1 a runtime without process diagnostics is reported, not guessed", () => {
  const original = process.getActiveResourcesInfo;
  process.getActiveResourcesInfo = undefined;
  try {
    assert.throws(() => guardHandles(), { code: "conformance.handles.unsupported-runtime" });
  } finally {
    process.getActiveResourcesInfo = original;
  }
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
    const inputEntry = input()(sessionModule);
    const handle = implement()(store, scoped("t/store", async deps => product(deps.session)));
    return api.prepare({ composition, modules: [handle], roots: { store: handle }, inputs: { session: inputEntry } });
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

const declared = (moduleId, implementationId, authority = moduleId.split("/")[0]) =>
  declareModule({ moduleId, implementationId, owner: { authority, path: ["m"] }, provides: [], slots: [] });
const violations = (input) => {
  try {
    checkNamespaces(input);
  } catch (error) {
    assert.equal(code(error), "conformance.namespaces.violation");
    return error.details.violations;
  }
  return [];
};

test("N1 declarations inside the namespace with the matching authority pass", () => {
  checkNamespaces({ namespace: "acme", declarations: [declared("acme/a", "acme/a/default"), declared("acme", "acme/b")] });
  checkNamespaces({ namespace: "acme/orders", declarations: [declared("acme/orders/x", "acme/orders/x/default", "acme")] });
  checkNamespaces({ namespace: "acme", declarations: [] });
});

test("N2 membership holds only at a segment boundary", () => {
  assert.deepEqual(violations({ namespace: "agent", declarations: [declared("agent-runtime/x", "agent/x")] }), [
    { implementationId: "agent/x", rule: "module-id", value: "agent-runtime/x", expected: "agent" },
  ]);
  // A multi-segment namespace does not cover its sibling or its own prefix.
  assert.equal(violations({ namespace: "acme/orders", declarations: [declared("acme/orders-x/m", "acme/orders/m")] }).length, 1);
  assert.equal(violations({ namespace: "acme/orders", declarations: [declared("acme/orders", "acme")] })[0].rule, "implementation-id");
});

test("N3 owner.authority must equal the first segment of moduleId", () => {
  assert.deepEqual(violations({ namespace: "acme", declarations: [declared("acme/a", "acme/a/default", "other")] }), [
    { implementationId: "acme/a/default", rule: "owner-authority", value: "other", expected: "acme" },
  ]);
});

test("N4 one throw lists every violation of a mixed set", () => {
  const found = violations({
    namespace: "acme",
    declarations: [declared("acme/ok", "acme/ok/default"), declared("x/a", "y/a", "z"), declared("acme/b", "acme/b/default", "q")],
  });
  assert.deepEqual(found.map(entry => `${entry.implementationId}:${entry.rule}`),
    ["y/a:module-id", "y/a:implementation-id", "y/a:owner-authority", "acme/b/default:owner-authority"]);
});

test("N5 a malformed call is an argument error and reads own data only", () => {
  const good = declared("acme/a", "acme/a/default");
  for (const bad of [undefined, { namespace: "", declarations: [] }, { namespace: "/acme", declarations: [] },
    { namespace: "acme/", declarations: [] }, { namespace: "acme//x", declarations: [] }, { namespace: "acme", declarations: good },
    { namespace: "acme", declarations: [null] }, { namespace: "acme", declarations: [{ ...good, moduleId: 1 }] },
    { namespace: "acme", declarations: [{ ...good, owner: undefined }] },
    { namespace: "acme", declarations: [,] },
    { namespace: Object.create({ x: 1 }), declarations: [] }]) {
    assert.throws(() => checkNamespaces(bad), error => code(error) === "conformance.argument.invalid");
  }
  let calls = 0;
  const getter = { namespace: "acme" };
  Object.defineProperty(getter, "declarations", { enumerable: true, get() { calls += 1; return []; } });
  assert.throws(() => checkNamespaces(getter), error => code(error) === "conformance.argument.invalid");
  assert.equal(calls, 0);
});

const provides = descriptor => [descriptor.provide()];
const wiringDeclaration = (id, capability, slots = []) => declareModule({
  moduleId: `t/${id}`, implementationId: `t/${id}/default`, owner,
  provides: provides(capability), slots,
});
const DECLARATIONS = Symbol("declarations");
const declarationsOf = composition => composition[DECLARATIONS];
const check = (composition, oracles, declarations = declarationsOf(composition)) =>
  checkWiring(composition, oracles, { declarations });
const wiringComposition = async (declarations, roots, bindings) => {
  const result = await compileComposition({
    declarations,
    profile: {
      kind: "get-modular.composition-profile", schemaVersion: 1, profileId: "t/wiring",
      roots,
      selections: declarations.map(declaration => ({
        moduleId: declaration.moduleId, implementationId: declaration.implementationId,
      })),
      bindings,
    },
  });
  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.diagnostics));
  return { ...result, [DECLARATIONS]: declarations };
};
const binding = (declaration, slot, capability, providers) => {
  void capability;
  return {
    consumerImplementationId: declaration.implementationId, slotId: slot,
    providerImplementationIds: providers,
  };
};
const changedPlan = (composition, change) => ({ ...composition, plan: { ...composition.plan, ...change(composition.plan) } });
const differences = input => {
  try {
    check(input.composition, input.oracles, input.declarations ?? declarationsOf(input.composition));
  } catch (error) {
    assert.equal(code(error), "conformance.wiring.mismatch");
    return error.details.differences;
  }
  return [];
};
const failure = (body, expected) => {
  try {
    body();
  } catch (error) {
    assert.equal(code(error), expected);
    return error;
  }
  assert.fail(`expected ${expected}`);
};

test("W1 provider pins and one root pass, and selection and root changes name their differences", async () => {
  const logs = wiringDeclaration("logs", Logs);
  const db = wiringDeclaration("db", Db);
  const orders = wiringDeclaration("wiring-orders", Orders, [Logs.slot("logs", required()), Db.slot("db", required())]);
  const composition = await wiringComposition([logs, db, orders], ["t/wiring-orders"], [
    binding(orders, "logs", Logs, [logs.implementationId]), binding(orders, "db", Db, [db.implementationId]),
  ]);
  const oracle = {
    providers: { "t/logs": logs.implementationId, "t/db": db.implementationId, "t/orders": orders.implementationId },
    roots: [orders.implementationId],
  };
  check(composition, [oracle]);

  const replacement = changedPlan(composition, plan => ({
    selections: plan.selections.map(entry => entry.implementationId === logs.implementationId
      ? { ...entry, implementationId: "t/logs/replaced" } : entry),
  }));
  assert.deepEqual(differences({ composition: replacement, oracles: [oracle] }).map(entry => entry.rule),
    ["selection", "capability-provider", "declaration-selection"]);
  const removed = changedPlan(composition, plan => ({
    selections: plan.selections.filter(entry => entry.implementationId !== logs.implementationId),
  }));
  assert.deepEqual(differences({ composition: removed, oracles: [oracle] }).map(entry => entry.rule),
    ["selection", "capability-provider", "declaration-selection"]);
  const added = changedPlan(composition, plan => ({
    selections: [...plan.selections, { moduleId: "t/extra", implementationId: "t/extra/default" }],
  }));
  assert.deepEqual(differences({ composition: added, oracles: [oracle] }).map(entry => entry.rule),
    ["selection", "declaration-selection"]);
  const changedRoot = changedPlan(composition, () => ({ roots: ["t/extra"] }));
  assert.deepEqual(differences({ composition: changedRoot, oracles: [oracle] }).map(entry => entry.rule), ["root"]);
});

test("W2 optional, many and several-provider rows are listed exactly, including provider order", async () => {
  const logs1 = wiringDeclaration("logs-1", Logs);
  const logs2 = wiringDeclaration("logs-2", Logs);
  const db1 = wiringDeclaration("db-1", Db);
  const db2 = wiringDeclaration("db-2", Db);
  const consumer = wiringDeclaration("row-consumer", Orders, [
    Audit.slot("audit", optional()), Logs.slot("logs", many({ min: 0, max: 2 })),
    Db.slot("copies", many({ min: 0, max: 2 })),
  ]);
  const rows = [
    binding(consumer, "audit", Audit, []),
    binding(consumer, "logs", Logs, [logs2.implementationId, logs1.implementationId]),
    binding(consumer, "copies", Db, [db2.implementationId, db1.implementationId]),
  ];
  const composition = await wiringComposition(
    [logs1, logs2, db1, db2, consumer], [consumer.moduleId], rows,
  );
  const oracle = {
    providers: {
      "t/logs": [logs1.implementationId, logs2.implementationId],
      "t/db": [db1.implementationId, db2.implementationId],
      "t/orders": consumer.implementationId,
    },
    roots: [consumer.implementationId],
    rows: rows.map(row => ({
      consumer: row.consumerImplementationId, slot: row.slotId, providers: row.providerImplementationIds,
    })),
  };
  check(composition, [oracle]);
  assert.equal(differences({ composition, oracles: [{ ...oracle, rows: [] }] }).filter(entry =>
    entry.rule === "unlisted-row").length, 3);
  const reordered = changedPlan(composition, plan => ({
    bindings: plan.bindings.map(row => row.slotId === "logs"
      ? { ...row, providerImplementationIds: [logs1.implementationId, logs2.implementationId] } : row),
  }));
  assert.deepEqual(differences({ composition: reordered, oracles: [oracle] }).map(entry => entry.rule), ["row-order"]);
  const replaced = changedPlan(composition, plan => ({
    bindings: plan.bindings.map(row => row.slotId === "logs"
      ? { ...row, providerImplementationIds: [logs2.implementationId, "t/logs-3/default"] } : row),
  }));
  assert.deepEqual(differences({ composition: replaced, oracles: [oracle] }).map(entry => entry.rule), ["row"]);
});

test("W3 equal oracle parts pass, pins compare as sets and one throw lists every conflict", async () => {
  const logs = wiringDeclaration("conflict-logs", Logs);
  const db = wiringDeclaration("conflict-db", Db);
  const orders = wiringDeclaration("conflict-orders", Orders, [Logs.slot("logs", required()), Db.slot("db", required())]);
  const composition = await wiringComposition([logs, db, orders], ["t/conflict-orders"], [
    binding(orders, "logs", Logs, [logs.implementationId]), binding(orders, "db", Db, [db.implementationId]),
  ]);
  const first = {
    providers: { "t/logs": logs.implementationId, "t/db": db.implementationId, "t/orders": orders.implementationId },
    roots: [orders.implementationId],
    rows: [{ consumer: orders.implementationId, slot: "db", providers: [db.implementationId] }],
  };
  check(composition, [first, structuredClone(first)]);
  const conflicting = {
    providers: { ...first.providers, "t/logs": "t/logs/other" },
    roots: [orders.implementationId],
    rows: [{ consumer: orders.implementationId, slot: "db", providers: [logs.implementationId] }],
  };
  const found = differences({ composition, oracles: [first, conflicting] });
  assert.deepEqual(found.map(entry => entry.rule), ["oracle-provider-conflict", "oracle-row-conflict"]);
  const reorderedPin = { providers: { "t/many": ["a", "b"] } };
  const sameSet = { providers: { "t/many": ["b", "a"] } };
  assert.equal(differences({ composition, oracles: [reorderedPin, sameSet] })
    .some(entry => entry.rule === "oracle-provider-conflict"), false);
  const sparse = ["t/f1/default"];
  sparse.length = 2;
  assert.throws(() => check(composition, [{ providers: { "t/f1": sparse } }]), {
    code: "conformance.argument.invalid",
  });
});

test("W4 a new required row bound to its single pinned provider is the accepted weakening", async () => {
  const logs = wiringDeclaration("weakening-logs", Logs);
  const consumer = wiringDeclaration("weakening-consumer", Orders, [Logs.slot("logs", required())]);
  const composition = await wiringComposition([logs, consumer], ["t/weakening-consumer"],
    [binding(consumer, "logs", Logs, [logs.implementationId])]);
  check(composition, [{
    providers: { "t/logs": logs.implementationId, "t/orders": consumer.implementationId },
    roots: [consumer.implementationId],
  }]);
});

test("W4b a required slot moved to another capability passes with the same oracle", async () => {
  const logs = wiringDeclaration("moved-logs", Logs);
  const db = wiringDeclaration("moved-db", Db);
  const keeper = wiringDeclaration("moved-keeper", Audit, [Logs.slot("a", required()), Db.slot("b", required())]);
  const before = wiringDeclaration("moved-consumer", Orders, [Logs.slot("store", required())]);
  const after = wiringDeclaration("moved-consumer", Orders, [Db.slot("store", required())]);
  const oracle = {
    providers: {
      "t/logs": logs.implementationId, "t/db": db.implementationId, "t/audit": keeper.implementationId,
      "t/orders": before.implementationId,
    },
    roots: [keeper.implementationId, before.implementationId],
  };
  const keeperRows = [
    binding(keeper, "a", Logs, [logs.implementationId]), binding(keeper, "b", Db, [db.implementationId]),
  ];
  check(await wiringComposition([logs, db, keeper, before], [keeper.moduleId, before.moduleId],
    [...keeperRows, binding(before, "store", Logs, [logs.implementationId])]), [oracle]);
  check(await wiringComposition([logs, db, keeper, after], [keeper.moduleId, after.moduleId],
    [...keeperRows, binding(after, "store", Db, [db.implementationId])]), [oracle]);
});

test("W9 a pinned implementation must provide its pinned capability in its declaration", async () => {
  const logs = wiringDeclaration("w9-logs", Logs);
  const consumer = wiringDeclaration("w9-consumer", Orders, [Logs.slot("logs", required())]);
  const composition = await wiringComposition([logs, consumer], [consumer.moduleId],
    [binding(consumer, "logs", Logs, [logs.implementationId])]);
  const oracle = {
    providers: { "t/logs": logs.implementationId, "t/orders": consumer.implementationId },
    roots: [consumer.implementationId],
  };
  check(composition, [oracle]);
  const wrong = differences({
    composition, oracles: [{ ...oracle, providers: { ...oracle.providers, "t/db": logs.implementationId } }],
  });
  assert.deepEqual(wrong.map(entry => `${entry.rule} ${entry.subject}`), ["pinned-provider t/db"]);
});

test("W5 describeWiring prints roots, selections and rows in its debug format", async () => {
  const logs = wiringDeclaration("describe-logs", Logs);
  const consumer = wiringDeclaration("describe-consumer", Orders, [Logs.slot("logs", required())]);
  const composition = await wiringComposition([logs, consumer], ["t/describe-consumer"],
    [binding(consumer, "logs", Logs, [logs.implementationId])]);
  assert.equal(describeWiring(composition), [
    "roots:",
    "  t/describe-consumer/default",
    "selections:",
    "  t/describe-consumer <- t/describe-consumer/default",
    "  t/describe-logs <- t/describe-logs/default",
    "rows:",
    "  t/describe-consumer/default.logs <- t/describe-logs/default [t/logs r1]",
  ].join("\n"));
});

test("W6 an unlisted optional or many row is a difference, and a listed one equal to the plan passes", async () => {
  const logs = wiringDeclaration("w6-logs", Logs);
  const audit = wiringDeclaration("w6-audit", Audit);
  const consumer = wiringDeclaration("w6-consumer", Orders, [
    Audit.slot("audit", optional()), Logs.slot("logs", many({ min: 0, max: 2 })),
  ]);
  const rows = [
    binding(consumer, "audit", Audit, [audit.implementationId]),
    binding(consumer, "logs", Logs, [logs.implementationId]),
  ];
  const composition = await wiringComposition([logs, audit, consumer], [consumer.moduleId], rows);
  const oracle = {
    providers: {
      "t/logs": logs.implementationId, "t/audit": audit.implementationId, "t/orders": consumer.implementationId,
    },
    roots: [consumer.implementationId],
    rows: rows.map(row => ({
      consumer: row.consumerImplementationId, slot: row.slotId, providers: row.providerImplementationIds,
    })),
  };
  check(composition, [oracle]);
  const unlisted = differences({ composition, oracles: [{ ...oracle, rows: [] }] });
  assert.deepEqual(unlisted.map(entry => `${entry.rule} ${entry.subject}`), [
    `unlisted-row ${consumer.implementationId}.audit`, `unlisted-row ${consumer.implementationId}.logs`,
  ]);
  assert.match(unlisted[0].message, /is optional/u);
  assert.match(unlisted[1].message, /is many/u);
});

test("W7 declarations must cover the plan selections and every provided capability must be pinned", async () => {
  const logs = wiringDeclaration("w7-logs", Logs);
  const consumer = wiringDeclaration("w7-consumer", Orders, [Logs.slot("logs", required())]);
  const both = declareModule({
    moduleId: "t/w7-both", implementationId: "t/w7-both/default", owner,
    provides: [Audit.provide(), Db.provide()], slots: [],
  });
  const composition = await wiringComposition([logs, consumer, both], [consumer.moduleId, both.moduleId],
    [binding(consumer, "logs", Logs, [logs.implementationId])]);
  const oracle = {
    providers: {
      "t/logs": logs.implementationId, "t/orders": consumer.implementationId, "t/audit": both.implementationId,
      "t/db": both.implementationId,
    },
    roots: [consumer.implementationId, both.implementationId],
  };
  check(composition, [oracle]);
  const unpinned = differences({
    composition, oracles: [{ ...oracle, providers: { ...oracle.providers, "t/db": "t/elsewhere" } }],
  });
  assert.ok(unpinned.some(entry => entry.rule === "provided-capability" && entry.subject === "t/db"
    && entry.actual[0] === both.implementationId));
  assert.ok(unpinned.every(entry => entry.rule !== "provided-capability" || entry.subject === "t/db"));
  assert.deepEqual(differences({ composition, oracles: [oracle], declarations: [logs, consumer] })
    .map(entry => `${entry.rule} ${entry.expected.join()}|${entry.actual.join()}`), [
    `declaration-selection ${[both.implementationId, consumer.implementationId, logs.implementationId].toSorted().join()}`
    + `|${[consumer.implementationId, logs.implementationId].toSorted().join()}`,
  ]);
  const extra = wiringDeclaration("w7-extra", Audit);
  assert.deepEqual(differences({ composition, oracles: [oracle], declarations: [logs, consumer, both, extra] })
    .map(entry => entry.rule), ["declaration-selection"]);
  assert.throws(() => check(composition, [oracle], [logs, logs, consumer, both]), {
    code: "conformance.argument.invalid",
  });
  assert.throws(() => checkWiring(composition, [oracle], {}), { code: "conformance.argument.invalid" });
});

test("W8 a plan row must use the capability and the slot its consumer's declaration states", async () => {
  const logs = wiringDeclaration("w8-logs", Logs);
  const consumer = wiringDeclaration("w8-consumer", Orders, [Logs.slot("logs", required())]);
  const composition = await wiringComposition([logs, consumer], [consumer.moduleId],
    [binding(consumer, "logs", Logs, [logs.implementationId])]);
  const oracle = {
    providers: { "t/logs": logs.implementationId, "t/orders": consumer.implementationId },
    roots: [consumer.implementationId],
  };
  const moved = changedPlan(composition, plan => ({
    bindings: plan.bindings.map(row => ({ ...row, capabilityId: "t/db" })),
  }));
  const found = differences({ composition: moved, oracles: [oracle], declarations: declarationsOf(composition) });
  assert.deepEqual(found.map(entry => entry.rule), ["capability-provider", "row-capability", "unlisted-row"]);
  const ghost = changedPlan(composition, plan => ({
    bindings: plan.bindings.map(row => ({ ...row, slotId: "ghost" })),
  }));
  assert.deepEqual(differences({ composition: ghost, oracles: [oracle], declarations: declarationsOf(composition) })
    .map(entry => entry.rule), ["row-slot", "unlisted-row"]);
});

const layoutFile = (path, imports = [], useCaseExports = undefined) => ({ path, imports, useCaseExports });
const layoutRecords = rows => ({
  files: rows.map(row => row.path),
  imports: rows.flatMap(row => row.imports.map(edge => ({ from: row.path, ...edge }))),
  useCaseExports: Object.fromEntries(rows.filter(row => row.useCaseExports !== undefined)
    .map(row => [row.path, row.useCaseExports])),
});
const edge = (to, mode = "value") => ({ to, mode });
const pairs = error => error.details.violations.map(entry => [entry.code, entry.path]);

const orders = "src/features/orders";
const payments = "src/features/orders/features/payments";
const testShapedTree = () => [
  layoutFile(`${orders}/composition/orders.contracts.ts`),
  layoutFile(`${orders}/composition/orders.declaration.ts`, [
    edge(`${orders}/composition/orders.contracts.ts`, "type"), edge("src/composition/shared.contracts.ts", "type"),
  ]),
  layoutFile(`${orders}/composition/orders.module.ts`, [edge(`${orders}/composition/orders.declaration.ts`)]),
  layoutFile(`${orders}/composition/orders.session.declaration.ts`),
  layoutFile(`${orders}/composition/orders.inputs.ts`, [edge(`${orders}/composition/orders.session.declaration.ts`)]),
  layoutFile(`${orders}/composition/orders.group.ts`, [
    edge(`${orders}/composition/orders.module.ts`), edge(`${payments}/composition/payments.group.ts`),
  ]),
  layoutFile(`${payments}/composition/payments.contracts.ts`),
  layoutFile(`${payments}/composition/payments.declaration.ts`, [edge(`${payments}/composition/payments.contracts.ts`, "type")]),
  layoutFile(`${payments}/composition/payments.module.ts`, [edge(`${payments}/composition/payments.declaration.ts`)]),
  layoutFile(`${payments}/composition/payments.group.ts`, [edge(`${payments}/composition/payments.module.ts`)]),
  layoutFile(`${orders}/application/use-cases/create-order.ts`, [], [{ name: "createOrder", kind: "function" }]),
  layoutFile("src/composition/shared.contracts.ts"),
  layoutFile("src/composition/shared.declaration.ts", [edge("src/composition/shared.contracts.ts", "type")]),
  layoutFile("src/composition/shared.module.ts", [edge("src/composition/shared.declaration.ts")]),
  layoutFile("src/composition/app.root.ts", [edge(`${orders}/composition/orders.group.ts`), edge("src/composition/shared.module.ts")]),
];

test("L1 checkModuleLayout passes a TEST-shaped tree with a sub-feature, inputs and Host-level files", () => {
  assert.deepEqual(checkModuleLayout(layoutRecords(testShapedTree())), {
    featureCount: 2, moduleCount: 3, violations: [],
    modulesPerFeature: { [orders]: 1, [payments]: 1 },
  });
});

test("L1b a root may import its root module and the group of that module without owning it", () => {
  const o = `${orders}/composition`;
  const rows = testShapedTree().map(row => row.path === "src/composition/app.root.ts"
    ? layoutFile(row.path, [edge(`${o}/orders.group.ts`), edge(`${o}/orders.module.ts`), edge("src/composition/shared.module.ts")])
    : row);
  assert.deepEqual(checkModuleLayout(layoutRecords(rows)).violations, []);
});

test("L1c a module imported only by a root is still an orphan", () => {
  const o = `${orders}/composition`;
  const rows = [
    layoutFile(`${o}/orders.declaration.ts`),
    layoutFile(`${o}/orders.module.ts`, [edge(`${o}/orders.declaration.ts`)]),
    layoutFile("src/composition/app.root.ts", [edge(`${o}/orders.module.ts`)]),
  ];
  const error = failure(() => checkModuleLayout(layoutRecords(rows)), "conformance.layout.violation");
  assert.deepEqual(pairs(error), [["orphan-module", `${o}/orders.module.ts`]]);
});

test("L1d two roots importing one Host-level module without a group is a group-count violation", () => {
  const rows = testShapedTree();
  rows.push(layoutFile("src/composition/other.root.ts", [edge("src/composition/shared.module.ts")]));
  const error = failure(() => checkModuleLayout(layoutRecords(rows)), "conformance.layout.violation");
  assert.deepEqual(pairs(error), [["group-count", "src/composition/shared.module.ts"]]);
});

test("L1e a Host-level group listed by two roots owns its modules and passes", () => {
  const rows = testShapedTree().filter(row => row.path !== "src/composition/app.root.ts");
  rows.push(
    layoutFile("src/composition/runtime.group.ts", [edge("src/composition/shared.module.ts")]),
    layoutFile("src/composition/app.root.ts", [edge(`${orders}/composition/orders.group.ts`), edge("src/composition/runtime.group.ts")]),
    layoutFile("src/composition/other.root.ts", [edge("src/composition/runtime.group.ts")]));
  assert.deepEqual(checkModuleLayout(layoutRecords(rows)).violations, []);
});

test("L2 one throw lists every Get Modular layout violation kind with its code and path", () => {
  const o = `${orders}/composition`;
  const rows = [
    layoutFile(`${o}/orders.contracts.ts`),
    layoutFile(`${o}/orders.declaration.ts`, [edge(`${o}/orders.contracts.ts`, "type")]),
    layoutFile(`${o}/orders.module.ts`, [edge(`${o}/orders.declaration.ts`)]),
    layoutFile(`${o}/orders.group.ts`, [edge(`${o}/orders.module.ts`)]),
    layoutFile(`${o}/orphan.module.ts`, [edge(`${o}/orphan.declaration.ts`)]),
    layoutFile(`${o}/orphan.declaration.ts`),
    layoutFile(`${o}/unowned.declaration.ts`),
    layoutFile(`${o}/bare.module.ts`),
    layoutFile(`${o}/shared.module.ts`, [edge(`${o}/shared.declaration.ts`)]),
    layoutFile(`${o}/shared.declaration.ts`, [edge(`${orders}/contracts/orders.contracts.ts`, "type")]),
    layoutFile(`${o}/orders-extra.group.ts`, [edge(`${o}/shared.module.ts`)]),
    layoutFile(`${payments}/composition/payments.group.ts`),
    layoutFile(`src/features/other/composition/other.group.ts`, [edge(`${payments}/composition/payments.group.ts`)]),
    layoutFile(`${payments}/composition/nested/late.ts`),
    layoutFile(`${orders}/contracts/orders.contracts.ts`),
    layoutFile(`${orders}/application/use-cases/two.ts`, [], [
      { name: "one", kind: "function" }, { name: "two", kind: "function" },
    ]),
    layoutFile(`${orders}/application/stray.ts`),
    layoutFile("src/composition/app.root.ts", [
      edge(`${o}/orders.group.ts`), edge(`${payments}/composition/payments.group.ts`),
    ]),
  ];
  const error = failure(() => checkModuleLayout(layoutRecords(rows)), "conformance.layout.violation");
  assert.deepEqual(pairs(error).toSorted((a, b) => (a.join() < b.join() ? -1 : 1)), [
    ["application-file", `${orders}/application/stray.ts`],
    ["child-group-outside-parent", "src/features/other/composition/other.group.ts"],
    ["descriptor-path", `${o}/shared.declaration.ts`],
    ["descriptor-path", `${orders}/contracts/orders.contracts.ts`],
    ["group-count", `${o}/shared.module.ts`],
    ["module-declaration", `${o}/bare.module.ts`],
    ["nested-composition", `${payments}/composition/nested/late.ts`],
    ["orphan-declaration", `${o}/unowned.declaration.ts`],
    ["orphan-module", `${o}/bare.module.ts`],
    ["orphan-module", `${o}/orphan.module.ts`],
    ["root-imports-sub-feature-group", "src/composition/app.root.ts"],
    ["use-case-export", `${orders}/application/use-cases/two.ts`],
  ].toSorted((a, b) => (a.join() < b.join() ? -1 : 1)));
});

test("L4 a group file that shares its feature with another group is still checked", () => {
  const rows = testShapedTree();
  rows.push(layoutFile(`${orders}/composition/zz.group.ts`));
  rows.push(layoutFile("src/composition/other.root.ts", [edge(`${payments}/composition/payments.group.ts`)]));
  const error = failure(() => checkModuleLayout(layoutRecords(rows)), "conformance.layout.violation");
  assert.deepEqual(pairs(error), [["root-imports-sub-feature-group", "src/composition/other.root.ts"]]);
});

test("L5 type-only imports own and place nothing, and the same feature name under two roots stays apart", () => {
  const rows = testShapedTree().map(row => row.path === `${orders}/composition/orders.group.ts`
    ? layoutFile(row.path, [edge(`${orders}/composition/orders.module.ts`, "type"), edge(`${payments}/composition/payments.group.ts`)])
    : row);
  const error = failure(() => checkModuleLayout(layoutRecords(rows)), "conformance.layout.violation");
  assert.deepEqual(pairs(error), [["orphan-module", `${orders}/composition/orders.module.ts`]]);
  const twin = [
    layoutFile("packages/a/src/features/orders/composition/orders.module.ts", [
      edge("packages/a/src/features/orders/composition/orders.declaration.ts"),
    ]),
    layoutFile("packages/a/src/features/orders/composition/orders.declaration.ts"),
    layoutFile("packages/b/src/features/orders/composition/orders.group.ts", [
      edge("packages/a/src/features/orders/composition/orders.module.ts"),
    ]),
    layoutFile("packages/a/src/composition/a.root.ts"),
  ];
  const twinError = failure(() => checkModuleLayout(layoutRecords(twin)), "conformance.layout.violation");
  assert.deepEqual(pairs(twinError), [["group-count", "packages/a/src/features/orders/composition/orders.module.ts"]]);
  assert.deepEqual(Object.keys(twinError.details.modulesPerFeature), [
    "packages/a/src/features/orders", "packages/b/src/features/orders",
  ]);
});

test("L6 a Windows-style path and a file directly in features/ are read as written", () => {
  const report = checkModuleLayout({
    files: ["src\\features\\orders\\composition\\orders.group.ts", "src/features/readme.ts"],
    imports: [], useCaseExports: {},
  });
  assert.deepEqual(report.modulesPerFeature, { [orders]: 0 });
});

test("L3 malformed layout records are argument errors and an import source must be a collected file", () => {
  assert.throws(() => checkModuleLayout({ files: "bad", imports: [], useCaseExports: {} }), {
    code: "conformance.argument.invalid",
  });
  assert.throws(() => checkModuleLayout({
    files: ["src/features/orders/composition/orders.module.ts"],
    imports: [{ from: "missing.ts", to: "src/features/orders/composition/orders.module.ts", mode: "value" }],
    useCaseExports: {},
  }), { code: "conformance.argument.invalid" });
  assert.throws(() => checkModuleLayout({
    files: ["src/a.ts"], imports: [{ from: "src/a.ts", to: "src/b.ts", mode: "other" }], useCaseExports: {},
  }), { code: "conformance.argument.invalid" });
});

test("L7 a declaration import of a contracts file outside the collected files is a descriptor violation", () => {
  const o = `${orders}/composition`;
  const rows = [
    layoutFile(`${o}/orders.declaration.ts`, [edge("some-pkg/thing.contracts.js", "type"), edge("zod", "value")]),
    layoutFile(`${o}/orders.module.ts`, [edge(`${o}/orders.declaration.ts`)]),
    layoutFile(`${o}/orders.group.ts`, [edge(`${o}/orders.module.ts`)]),
    layoutFile("src/composition/app.root.ts", [edge(`${o}/orders.group.ts`)]),
  ];
  const error = failure(() => checkModuleLayout(layoutRecords(rows)), "conformance.layout.violation");
  assert.deepEqual(pairs(error), [["descriptor-path", `${o}/orders.declaration.ts`]]);
  assert.equal(error.details.violations[0].relatedPath, "some-pkg/thing.contracts.js");
});
