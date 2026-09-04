import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { corpus, descriptorAdapter, defineModuleAdapter, qualify, splitAdapter } from "./dist/index.js";

const here = resolve("tests/qualification/implementation-readiness/api-authoring/common");
const adapters = [descriptorAdapter, defineModuleAdapter, splitAdapter];
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const canonical = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort(compare).map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
};
const digest = (value) => createHash("sha256").update(canonical(value)).digest("hex");
const reverse = (items) => [...items].reverse();
const permute = (world) => ({
  ...world,
  declarations: reverse(world.declarations),
  profile: { ...world.profile, roots: reverse(world.profile.roots), selections: reverse(world.profile.selections), bindings: reverse(world.profile.bindings) },
});
const executablePath = (value, path = "$", seen = new Set()) => {
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint" || value === undefined) return path;
  if (value === null || typeof value !== "object") return null;
  if (seen.has(value)) return `${path}:cycle`;
  if (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value)) return `${path}:non-plain`;
  seen.add(value);
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.get || descriptor?.set) return `${path}.${key}:accessor`;
    const found = executablePath(value[key], `${path}.${key}`, seen);
    if (found) return found;
  }
  seen.delete(value);
  return null;
};
const expectedMatches = (observed, expected) => observed.ok === expected.ok
  && canonical(observed.diagnostics.map(({ code }) => code)) === canonical(expected.codes)
  && (!expected.inventory || canonical(observed.inventory) === canonical(expected.inventory))
  && (!expected.dependencyOrder || canonical(observed.dependencyOrder) === canonical(expected.dependencyOrder));

assert(corpus.length === 30, `expected 30 scenarios, got ${corpus.length}`);
assert(new Set(corpus.map(({ id }) => id)).size === 30, "scenario IDs are not unique");
assert(corpus.every(({ id }, index) => id === `S${String(index + 1).padStart(2, "0")}`), "scenario IDs are not exact S01..S30");
assert(Object.isFrozen(corpus) && corpus.every(Object.isFrozen), "corpus is not immutable");
for (const scenario of corpus) assert(!executablePath(scenario.input), `${scenario.id} input is not inert JSON-compatible data`);

const candidateSources = adapters.map((adapter) => ({
  adapter,
  sourcePath: join(here, `candidate-${adapter.id === "descriptor-object" ? "descriptor" : adapter.id === "define-module" ? "define" : "split"}.ts`),
}));
for (const { adapter, sourcePath } of candidateSources) {
  const source = readFileSync(sourcePath, "utf8");
  assert(!source.includes("factories"), `${adapter.id} imports executable implementation code during discovery`);
  assert(!source.includes(".expected") && !source.includes("expected:"), `${adapter.id} can manufacture observations from expectations`);
  assert(!/(decorator|reflect-metadata|awilix|cordis|service.locator|filesystem|register\()/i.test(source), `${adapter.id} leaks a framework or discovery mechanism`);
}
const oracleSource = readFileSync(join(here, "oracle.ts"), "utf8");
assert(!oracleSource.includes("packages/core") && !oracleSource.includes(".expected"), "oracle imports Core or reads expectations");

const executions = [];
const corpusDigests = {};
let factoryScenarioUses = 0;
for (const adapter of adapters) {
  const decoded = [];
  for (const scenario of corpus) {
    const encoded = adapter.encode(scenario.input);
    assert(!executablePath(encoded.declaration), `${adapter.id}/${scenario.id} declaration contains executable data`);
    assert(!executablePath(encoded.profile), `${adapter.id}/${scenario.id} profile contains executable data`);
    const input = adapter.decode(encoded);
    assert(digest(input) === digest(scenario.input), `${adapter.id}/${scenario.id} changes corpus semantics`);
    decoded.push(input);
    const observed = qualify(input);
    assert(observed && observed !== scenario.expected, `${adapter.id}/${scenario.id} observed outcome absent or manufactured`);
    assert(expectedMatches(observed, scenario.expected), `${adapter.id}/${scenario.id} mismatch: ${canonical(observed)}`);
    const permuted = qualify(adapter.decode(adapter.encode(permute(input))));
    assert(canonical(observed) === canonical(permuted), `${adapter.id}/${scenario.id} diagnostics or inventory depend on input order`);
    if (scenario.id === "S25") {
      for (const key of ["__proto__", "constructor", "then", "é", "é"]) assert(own(input.hostile, key), `${adapter.id} lost hostile own key ${key}`);
      assert(input.hostile["é"] !== input.hostile["é"], `${adapter.id} collapsed Unicode forms`);
    }
    if (scenario.hostProbe) {
      factoryScenarioUses++;
      const { consumerFactory, serviceFactory } = await import("./dist/factories.js");
      let result;
      if (scenario.hostProbe === "direct-pure-di") result = consumerFactory({ service: serviceFactory() }).read();
      else {
        const loaders = new Map([["lab/provider-a/default", serviceFactory], ["lab/consumer/default", consumerFactory]]);
        const service = loaders.get(observed.dependencyOrder[0])?.();
        const consumer = loaders.get(observed.dependencyOrder[1])?.({ service });
        result = consumer?.read();
      }
      assert(result === "selected-service", `${adapter.id}/${scenario.id} host probe failed`);
    }
    executions.push({ candidateId: adapter.id, scenarioId: scenario.id, evidenceClass: scenario.evidenceClass, ok: observed.ok, diagnosticCodes: observed.diagnostics.map(({ code }) => code) });
  }
  corpusDigests[adapter.id] = digest(decoded);
  const noBinding = adapter.decode(adapter.encode({ ...decoded[0], profile: { ...decoded[0].profile, bindings: [] } }));
  assert(!qualify(noBinding).ok && qualify(noBinding).diagnostics.some(({ code }) => code === "binding.missing"), `${adapter.id} has a hidden fallback`);
}
assert(executions.length === 90, `expected 90 executions, got ${executions.length}`);
for (const adapter of adapters) assert(executions.filter(({ candidateId }) => candidateId === adapter.id).length === 30, `${adapter.id} did not execute all 30`);
assert(new Set(Object.values(corpusDigests)).size === 1, "candidate corpus digests differ");
assert(factoryScenarioUses === 6, `factories used outside the two host probes per candidate: ${factoryScenarioUses}`);

const countRegion = (source, region) => {
  const body = source.split(`// candidate:${region}:start`)[1]?.split(`// candidate:${region}:end`)[0] ?? "";
  return body.split("\n").filter((line) => line.trim() && !line.trim().startsWith("//")).length;
};
const scaleRoot = mkdtempSync(join(tmpdir(), "gm-api-authoring-scale-"));
const scale = {};
try {
  for (const { adapter } of candidateSources) {
    scale[adapter.id] = {};
    for (const size of [10, 100, 1000]) {
      const directory = join(scaleRoot, `${adapter.id}-${size}`);
      execFileSync("mkdir", ["-p", directory]);
      const declarations = Array.from({ length: size }, (_, index) => {
        const value = `{moduleId:"scale/m${index}",implementationId:"scale/m${index}/default",owner:{authority:"scale",feature:"m${index}"},provides:[],slots:[]}`;
        return adapter.id === "define-module" ? `export const m${index}=defineModule(${value});` : `export const m${index}=${value} as const satisfies Declaration;`;
      }).join("\n");
      const prelude = adapter.id === "define-module"
        ? "type Declaration={readonly moduleId:string;readonly implementationId:string;readonly owner:{readonly authority:string;readonly feature:string};readonly provides:readonly unknown[];readonly slots:readonly unknown[]};function defineModule<const T extends Declaration>(x:T):T{return x;}"
        : "type Declaration={readonly moduleId:string;readonly implementationId:string;readonly owner:{readonly authority:string;readonly feature:string};readonly provides:readonly unknown[];readonly slots:readonly unknown[]};";
      writeFileSync(join(directory, "scale.ts"), `${prelude}\n${declarations}\n`);
      writeFileSync(join(directory, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, declaration: true, emitDeclarationOnly: true, skipLibCheck: true, types: [], outDir: "dist" }, include: ["scale.ts"] }));
      const started = performance.now();
      execFileSync(process.execPath, [resolve("node_modules/typescript/bin/tsc"), "-p", join(directory, "tsconfig.json")], { stdio: "pipe" });
      scale[adapter.id][size] = { declarations: size, compileDurationMs: Math.round((performance.now() - started) * 100) / 100 };
    }
  }
} finally { rmSync(scaleRoot, { recursive: true, force: true }); }

const metrics = {};
for (const { adapter, sourcePath } of candidateSources) {
  const source = readFileSync(sourcePath, "utf8");
  const declaration = readFileSync(join(here, "dist", sourcePath.split("/").at(-1).replace(".ts", ".d.ts")), "utf8");
  const authoringLoc = countRegion(source, "authoring");
  const genericGlueLoc = countRegion(source, "glue");
  metrics[adapter.id] = {
    authoringLoc, genericGlueLoc, genericGlueRatio: genericGlueLoc / (authoringLoc + genericGlueLoc), filesPerModule: adapter.id === "split-declaration-factory" ? 2 : 1,
    bindingLoci: 1, explicitAnnotations: (source.match(/satisfies Declaration|: CandidateAdapter|ActivationFactory/g) ?? []).length,
    declarationLines: declaration.trimEnd().split("\n").length, declarationBytes: Buffer.byteLength(declaration), declarationExports: (declaration.match(/^export /gm) ?? []).length,
    serializedBytes: Buffer.byteLength(canonical(corpus.map(({ input }) => adapter.encode(input)))), importCounters: {
      sourceImports: (source.match(/^import /gm) ?? []).length,
      typeOnlyImports: (source.match(/^import type /gm) ?? []).length,
      executableImplementationImports: (source.match(/from ["'].*factories|from ["'].*packages\/core/gm) ?? []).length,
      frameworkImports: (source.match(/from ["'](?:awilix|cordis|reflect-metadata)/gm) ?? []).length,
    },
    removalEdits: 2, disableEdits: 1, compileDuration: scale[adapter.id], treeShaking: "not-measured", runtimePerformance: "not-measured",
  };
}
const summary = {
  schemaVersion: 1, status: "pass", authority: "non-authoritative qualification-only; not production", scenarioCount: corpus.length,
  executionCount: executions.length, candidateCorpusDigests: corpusDigests,
  scenarioMatrix: corpus.map(({ id, title, evidenceClass, expected, hostProbe }) => ({ id, title, evidenceClass, expected, ...(hostProbe ? { hostProbe } : {}) })),
  executions, metrics,
  guards: { immutablePlainData: true, noExpectationManufacture: true, noExecutableDiscoveryImports: true, noFallback: true, noRegistrationOrderSemantics: true, permutationStable: true, hostileOwnKeys: true, factoriesRestrictedToHostProbes: true },
};
writeFileSync(join(here, "dist", "result-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(summary)}\n`);
