import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createScope, type Resources } from "@get-modular/resources";
import { createStore, ObservationError } from "../dist/index.js";
import { delivered, liveSubscriptions, settled } from "../dist/testing.js";
import { supportedCompilers } from "./support/compilers.mjs";

function uncheckedCreate(initial: unknown, configuration: unknown): unknown {
  const value: unknown = Reflect.apply(createStore, undefined, [initial, configuration]);
  return value;
}
function uncheckedSet(set: (patch: never) => unknown, patch: unknown): unknown {
  const value: unknown = Reflect.apply(set, undefined, [patch]);
  return value;
}
function options(resources: Resources) {
  return { name: "review", resources, reportError: (): undefined => {} };
}

void test("T14 T38 explicit null limits reject while omitted and undefined limits keep defaults", async context => {
  const host = createScope({ name: "limit-validation" });
  context.after(() => host.control.close());
  for (const field of ["maxSubscriptions", "maxSubscriptionsPerScope"]) {
    const value = { nested: {} };
    assert.throws(() => uncheckedCreate({ value }, { ...options(host.resources), [field]: null }),
      { code: "observation.argument.invalid" });
    assert.equal(Object.isFrozen(value), false);
    assert.doesNotThrow(() => uncheckedCreate({ value: 0 }, { ...options(host.resources), [field]: undefined }));
  }
  assert.doesNotThrow(() => createStore({ value: 0 }, options(host.resources)));
});

void test("T38 total-limit diagnostics retain actual scope and maximum counts", async context => {
  const host = createScope({ name: "limit-diagnostic" });
  context.after(() => host.control.close());
  const one = host.resources.child({ name: "one" }), two = host.resources.child({ name: "two" });
  const store = createStore({ value: 0 }, { ...options(host.resources), maxSubscriptions: 3 });
  const facet = store.readonly(), snapshot = facet.read(["value"]);
  for (const [name, resources] of [["one/a", one.resources], ["one/b", one.resources], ["two/a", two.resources]] as const) {
    facet.watch(snapshot, { resources, name, onChange: () => {} });
  }
  assert.throws(() => { facet.watch(snapshot, { resources: two.resources, name: "two/b", onChange: () => {} }); },
    error => error instanceof ObservationError && error.code === "observation.subscriptions.limit"
      && /in 2 scopes, at most 2 in one/u.test(error.message));
  assert.equal(liveSubscriptions(facet), 3);
});

void test("T37 an empty watch name rejects without registering a subscription", async context => {
  const host = createScope({ name: "empty-watch-name" });
  context.after(() => host.control.close());
  const store = createStore({ value: 0 }, options(host.resources)), facet = store.readonly();
  assert.throws(() => { facet.watch(facet.read(["value"]), {
    resources: host.resources, name: "", onChange: () => {},
  }); }, { code: "observation.argument.invalid" });
  assert.equal(liveSubscriptions(facet), 0);
});

void test("T71 T72 quiet waits honor an aborted signal and reject explicit null timeout", async () => {
  const cause = new Error("wait cancelled");
  for (const wait of [delivered, settled]) {
    await assert.rejects(wait({ stores: [], timeoutMs: Infinity, signal: AbortSignal.abort(cause) }),
      error => error instanceof ObservationError && error.code === "observation.testing.timeout" && error.cause === cause);
    const invalid: unknown = Reflect.apply(wait, undefined, [{ stores: [], timeoutMs: null }]);
    assert.ok(invalid instanceof Promise);
    await assert.rejects(invalid, { code: "observation.argument.invalid" });
    await wait({ stores: [] });
    let reads = 0;
    await wait({ stores: [], get timeoutMs() {
      reads += 1;
      assert.equal(reads, 1, "a provided timeout accessor is captured once");
      return Infinity;
    } });
    assert.equal(reads, 1);
  }
});

function countedProxy(target: object, revoked: boolean) {
  let traps = 0;
  const trap = (): never => { traps += 1; throw new Error("the native guard must run before Proxy traps"); };
  const value = Proxy.revocable(target, {
    getPrototypeOf: trap, ownKeys: trap, getOwnPropertyDescriptor: trap, get: trap,
    preventExtensions: trap, defineProperty: trap,
  });
  if (revoked) {value.revoke();}
  return { proxy: value.proxy, trapCount: () => traps };
}

void test("T16 T21 native Proxy admission rejects root and nested graphs before traps or ownership", async context => {
  const host = createScope({ name: "proxy-admission" });
  context.after(() => host.control.close());
  const reports: unknown[] = [];
  const store = createStore({ good: { value: 0 }, bad: {} }, {
    ...options(host.resources), reportError: report => { reports.push(report); },
  });
  const facet = store.readonly();
  let deliveries = 0;
  facet.watch(facet.read(["good", "bad"]), {
    resources: host.resources, name: "observer", onChange: () => { deliveries += 1; },
  });
  for (const target of [{ value: 1 }, [1], Object.freeze({ value: 1 })]) {
    for (const revoked of [false, true]) {
      const candidate = countedProxy(target, revoked);
      const fresh = { value: 2 };
      assert.throws(() => uncheckedCreate(candidate.proxy, options(host.resources)), { code: "observation.values.not-plain" });
      assert.throws(() => uncheckedCreate({ good: fresh, bad: [{ nested: candidate.proxy }] }, options(host.resources)),
        { code: "observation.values.not-plain" });
      assert.throws(() => uncheckedSet(store.set, candidate.proxy), { code: "observation.values.not-plain" });
      assert.throws(() => uncheckedSet(store.set, { good: fresh, bad: [{ nested: candidate.proxy }] }),
        { code: "observation.values.not-plain" });
      assert.equal(candidate.trapCount(), 0);
      assert.equal(Object.isFrozen(fresh), false);
      assert.equal(store.read(["good", "bad"]).revision, 0);
    }
  }
  await delivered({ stores: [facet] });
  assert.equal(deliveries, 0);
  assert.deepEqual(reports, []);
  assert.deepEqual(store.read(["good", "bad"]).values, { good: { value: 0 }, bad: {} });
});

void test("T19 T26 Frozen unknown retains nullable values through public read and set", async context => {
  const host = createScope({ name: "unknown-value" });
  context.after(() => host.control.close());
  const store = createStore<{ readonly value: unknown }>({ value: null }, options(host.resources));
  assert.equal(store.read(["value"]).values.value, null);
  assert.equal(store.set({ value: null }), 0);
  assert.equal(store.set({ value: undefined }), 1);
  assert.equal(store.read(["value"]).values.value, undefined);
});

for (const mode of ["deadline", "missing-detector", "missing-util", "throwing-util", "no-builtin"]) {
  void test(`T16 T21 T71 T72 structural platform boundary ${mode}`, () => {
    const { NODE_PATH: _path, NODE_OPTIONS: _options, NODE_TEST_CONTEXT: _context, ...environment } = process.env;
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("review-environment-probe.ts", import.meta.url)), mode], {
      env: environment, encoding: "utf8", timeout: 30_000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout.trim(), `ok ${mode}`);
  });
}

interface CompilerMetadataAdapter {
  supportedCompilers(): Promise<readonly {
    readonly compilerName: string;
    readonly version: string;
    readonly path: string;
  }[]>;
}

void test("T24 T103 standalone compiler admission checks canonical metadata before implementation dispatch", async () => {
  assert.deepEqual((await supportedCompilers()).map(compiler => compiler.version), ["7.0.2"]);
  const temporary = await mkdtemp(join(tmpdir(), "observation-compiler-metadata-"));
  try {
    const target = join(temporary, "support/compilers.mjs");
    await mkdir(dirname(target), { recursive: true });
    await copyFile(new URL("support/compilers.mjs", import.meta.url), target);
    const probe = join(temporary, "compiler-metadata-probe.ts");
    await copyFile(new URL("compiler-metadata-probe.ts", import.meta.url), probe);
    await writeFile(join(temporary, "package.json"), '{"private":true,"type":"module"}\n');
    const sentinel = join(temporary, "compiler-executed");
    const poison = `require("node:fs").writeFileSync(${JSON.stringify(sentinel)}, "executed"); throw new Error("COMPILER_IMPLEMENTATION_MUST_NOT_RUN");\n`;
    const metadata = async (name: string, version: string) => {
      await writeFile(join(temporary, "node_modules", name, "package.json"), JSON.stringify({
        name: "typescript", version, main: "implementation.cjs",
      }));
    };
    for (const name of ["typescript", "typescript-minimum"]) {
      await mkdir(join(temporary, "node_modules", name, "bin"), { recursive: true });
      await metadata(name, "7.0.2");
      await writeFile(join(temporary, "node_modules", name, "bin/tsc"), poison);
      await writeFile(join(temporary, "node_modules", name, "implementation.cjs"), poison);
    }
    const { NODE_PATH: _path, NODE_OPTIONS: _options, NODE_TEST_CONTEXT: _context, ...environment } = process.env;
    const adapter: CompilerMetadataAdapter = { supportedCompilers: async () => {
      const result = spawnSync(process.execPath, [probe], { cwd: temporary, env: environment,
        encoding: "utf8", timeout: 10_000 });
      if (result.error !== undefined || result.signal !== null || result.status !== 0 || result.stderr !== "") {
        throw new Error("compiler metadata probe failed before classification", { cause: result });
      }
      let response: unknown;
      try { response = JSON.parse(result.stdout); }
      catch (cause) { throw new Error("compiler metadata probe did not emit JSON", { cause }); }
      if (typeof response !== "object" || response === null) {throw new Error("invalid compiler metadata probe result");}
      const value = response as { outcome?: unknown; message?: unknown; compilers?: unknown };
      if (value.outcome === "refused" && typeof value.message === "string") {throw new Error(value.message);}
      if (value.outcome !== "passed" || !Array.isArray(value.compilers)) {throw new Error("unclassified compiler metadata probe result");}
      return value.compilers as Awaited<ReturnType<CompilerMetadataAdapter["supportedCompilers"]>>;
    } };
    for (const version of ["7.00.2", "07.0.2", "7.0.02", "8.-1.0", "7.0.2-rc.1", "7.0.2+build", "7.0.2\n", "7.0.2\r\n"]) {
      await metadata("typescript", version);
      await assert.rejects(adapter.supportedCompilers(), /must be a pinned stable compiler/u);
      await assert.rejects(readFile(sentinel), { code: "ENOENT" });
    }
    for (const version of ["7.0.2", "7.0.3", "7.1.0", "8.0.0"]) {
      await metadata("typescript", version);
      assert.deepEqual((await adapter.supportedCompilers()).map(compiler => compiler.version),
        version === "7.0.2" ? [version] : [version, "7.0.2"]);
    }
    for (const version of ["7.0.1", "9007199254740992.0.0"]) {
      await metadata("typescript", version);
      await assert.rejects(adapter.supportedCompilers(), /7\.0\.2 floor/u);
    }
    await metadata("typescript", "7.0.2");
    await metadata("typescript-minimum", "7.0.3");
    await assert.rejects(adapter.supportedCompilers(), /7\.0\.2/u);
    await assert.rejects(readFile(sentinel), { code: "ENOENT" });
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
