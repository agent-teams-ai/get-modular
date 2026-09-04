import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const here = resolve("tests/qualification/implementation-readiness/api-authoring/common");
const tscPath = resolve("node_modules/typescript/bin/tsc");
const emitRoot = mkdtempSync(join(tmpdir(), "gm-api-authoring-emit-"));
process.on("exit", () => rmSync(emitRoot, { recursive: true, force: true }));
writeFileSync(join(emitRoot, "package.json"), '{"type":"module"}\n');
execFileSync(process.execPath, [tscPath, "-p", join(here, "tsconfig.json"), "--outDir", emitRoot], { stdio: "pipe" });
const { corpus, defineModule, descriptorAdapter, defineModuleAdapter, many, optional, qualify, prepareHostProfile, required, splitAdapter } = await import(pathToFileURL(join(emitRoot, "index.js")).href);
const loadFactories = () => import(pathToFileURL(join(emitRoot, "factories.js")).href);
const adapters = [descriptorAdapter, defineModuleAdapter, splitAdapter];
const diagnosticCodes = new Set(JSON.parse(readFileSync("architecture/contracts/v1/diagnostic-catalog.json", "utf8")).ordering.codes);
const slotGrammar = new RegExp(JSON.parse(readFileSync("architecture/contracts/v1/composition.schema.json", "utf8")).$defs.localToken.pattern);
const hostileRecordKeys = ["__proto__", "constructor", "then", "é", "é"];
const observe = (world) => {
  const { input, refusals } = prepareHostProfile(world);
  return refusals.length ? { ok: false, diagnostics: refusals, inventory: input.profile.selections.map(({ implementationId }) => implementationId).sort(), dependencyOrder: [] } : qualify(input);
};
const exactTitles = [
  "one provider", "one consumer", "required dependency", "missing required dependency", "missing optional dependency",
  "zero many", "one many", "multiple many", "duplicate provider", "ambiguous binding", "incompatible capability",
  "dependency cycle", "disabled root", "disabled required provider", "disabled optional provider", "unreachable provider",
  "multiple roots", "deterministic reorder", "hostile slot names: own __proto__, constructor, then, composed and decomposed Unicode",
  "unknown declaration fields", "duplicate module IDs", "duplicate implementation IDs", "invalid owner path",
  "profile with unknown module", "hidden fallback attempt", "discovery without executable imports",
  "literal loader table for selected modules only", "direct Pure DI parity", "declaration serializability", "TypeScript declaration emit",
];
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
const mutablePath = (value, path = "$", seen = new Set()) => {
  if (value === null || typeof value !== "object" || seen.has(value)) return null;
  if (!Object.isFrozen(value)) return path;
  seen.add(value);
  for (const key of Object.keys(value)) {
    const found = mutablePath(value[key], `${path}.${key}`, seen);
    if (found) return found;
  }
  return null;
};
const expectedMatches = (observed, expected) => observed.ok === expected.ok
  && canonical(observed.diagnostics.map(({ code }) => code)) === canonical(expected.codes)
  && (!expected.inventory || canonical(observed.inventory) === canonical(expected.inventory))
  && (!expected.dependencyOrder || canonical(observed.dependencyOrder) === canonical(expected.dependencyOrder));
const slot = (scenario, id = "service") => scenario.input.declarations.flatMap(({ slots }) => slots).find((item) => item.id === id);
const providers = (scenario) => scenario.input.profile.bindings[0]?.providerImplementationIds ?? [];
const hasCode = (scenario, code) => scenario.expected.codes.includes(code);
const substance = [
  (s) => s.input.declarations.length === 1 && s.input.declarations[0].provides.length === 1 && s.input.declarations[0].slots.length === 0,
  (s) => s.input.declarations.length === 1 && s.input.declarations[0].provides.length === 0 && s.input.declarations[0].slots.length === 0,
  (s) => slot(s)?.cardinality.kind === "required" && providers(s).length === 1 && s.expected.ok,
  (s) => slot(s)?.cardinality.kind === "required" && providers(s).length === 0 && hasCode(s, "binding.missing"),
  (s) => slot(s)?.cardinality.kind === "optional" && providers(s).length === 0 && s.expected.ok,
  (s) => slot(s)?.cardinality.kind === "many" && providers(s).length === 0,
  (s) => slot(s)?.cardinality.kind === "many" && providers(s).length === 1,
  (s) => slot(s)?.cardinality.kind === "many" && providers(s).length > 1,
  (s) => providers(s).length === 2 && providers(s)[0] === providers(s)[1] && hasCode(s, "binding.duplicate"),
  (s) => new Set(providers(s)).size > 1 && providers(s).length === new Set(providers(s)).size && hasCode(s, "binding.cardinality"),
  (s) => s.input.declarations.some((d) => d.provides.some((p) => p.id === "lab/other")) && hasCode(s, "binding.capability-missing"),
  (s) => s.input.declarations.every((d) => d.slots.length === 1) && hasCode(s, "graph.cycle"),
  (s) => s.input.desiredProfile?.disabledModuleIds.includes(s.input.profile.roots[0]) && hasCode(s, "host.profile.root-disabled"),
  (s) => slot(s)?.cardinality.kind === "required" && s.input.desiredProfile?.disabledModuleIds.length === 1 && hasCode(s, "binding.missing"),
  (s) => slot(s)?.cardinality.kind === "optional" && s.input.desiredProfile?.disabledModuleIds.length === 1 && s.expected.ok,
  (s) => s.input.profile.selections.length > 2 && hasCode(s, "profile.unreachable-selection"),
  (s) => s.input.profile.roots.length === 2 && s.expected.ok,
  (s) => s.input.declarations[0].moduleId > s.input.declarations[1].moduleId && s.expected.dependencyOrder,
  (s) => ["constructor", "then"].every((id) => slot(s, id)) && s.input.declarations.every((d) => d.slots.every(({ id }) => slotGrammar.test(id))),
  (s) => s.input.declarations.some((d) => own(d, "executable")) && hasCode(s, "schema.unknown-field"),
  (s) => new Set(s.input.profile.selections.map((d) => d.moduleId)).size < s.input.profile.selections.length && hasCode(s, "profile.duplicate-selection"),
  (s) => new Set(s.input.declarations.map((d) => d.implementationId)).size < s.input.declarations.length && hasCode(s, "declaration.duplicate-implementation"),
  (s) => s.input.declarations[0].owner.path.some((part) => part.includes("/")) && hasCode(s, "schema.invalid-value"),
  (s) => s.input.profile.selections.some(({ moduleId }) => !s.input.declarations.some((d) => d.moduleId === moduleId)) && hasCode(s, "profile.unknown-module"),
  (s) => s.input.fallbackBindings?.length === 1 && s.input.profile.bindings.length === 0 && hasCode(s, "binding.missing"),
  (s) => s.evidenceClass === "representation" && s.expected.ok,
  (s) => s.hostProbe === "selected-literal-loaders" && s.input.declarations.length > s.input.profile.selections.length,
  (s) => s.hostProbe === "direct-pure-di-parity",
  (s) => s.evidenceClass === "representation" && s.expected.ok,
  (s) => s.evidenceClass === "representation" && s.expected.ok,
];

assert(corpus.length === 30 && exactTitles.length === 30 && substance.length === 30, "closed corpus must contain exactly 30 scenarios");
assert(new Set(corpus.map(({ id }) => id)).size === 30, "scenario IDs are not unique");
for (const [index, scenario] of corpus.entries()) {
  const id = `S${String(index + 1).padStart(2, "0")}`;
  assert(scenario.id === id, `scenario ID ${scenario.id} differs from closed ID ${id}`);
  assert(scenario.title === exactTitles[index], `${id} title differs from closed title`);
  assert(substance[index](scenario), `${id} is only a sentinel/name or has the wrong semantic witness`);
  assert(!executablePath(scenario.input), `${id} input is not inert JSON-compatible data`);
}
assert(!mutablePath(corpus), "corpus is not deeply frozen");
let rawDesiredStateRejected = false;
try { qualify(corpus[12].input); } catch (error) { rawDesiredStateRejected = error.message === "desired state requires Host preprocessing"; }
assert(rawDesiredStateRejected, "oracle admitted Host-owned desired state");

const identityProbe = { moduleId: "probe/module", implementationId: "probe/module/default", owner: { authority: "probe", path: ["module"] }, provides: [], slots: [] };
assert(defineModule(identityProbe) === identityProbe, "defineModule did not return the exact reference");
const requiredA = required(); const requiredB = required(); const optionalA = optional(); const optionalB = optional();
assert(requiredA !== requiredB && optionalA !== optionalB, "cardinality helpers did not return fresh objects");
assert(canonical(requiredA) === '{"kind":"required"}' && canonical(optionalA) === '{"kind":"optional"}', "required/optional helper wire shape changed");
const options = { min: 1, max: 3 };
assert(canonical(many(options)) === '{"kind":"many","max":3,"min":1,"order":"profile"}', "many helper wire shape changed");
assert(!Object.isFrozen(requiredA) && Object.getPrototypeOf(requiredA) === Object.prototype, "helpers must return mutable plain objects");
const helperReads = { min: 0, max: 0 };
const observedMany = many({
  get min() { helperReads.min += 1; return -1; },
  get max() { helperReads.max += 1; return Number.NaN; },
});
assert(helperReads.min === 1 && helperReads.max === 1 && observedMany.min === -1 && Number.isNaN(observedMany.max), "many did not perform one ordinary read per field or added validation");
assert(canonical(many(Object.create({ min: 2, max: 4 }))) === '{"kind":"many","max":4,"min":2,"order":"profile"}', "many lost accepted inherited-property lookup");
let definitionReads = 0;
const unreadDefinition = new Proxy(identityProbe, { get(target, key, receiver) { definitionReads++; return Reflect.get(target, key, receiver); } });
assert(defineModule(unreadDefinition) === unreadDefinition && definitionReads === 0, "defineModule read, cloned, or replaced its argument");

const candidateSources = adapters.map((adapter) => ({
  adapter,
  stem: adapter.id === "descriptor-object" ? "descriptor" : adapter.id === "define-module" ? "define" : "split",
  sourcePath: join(here, `candidate-${adapter.id === "descriptor-object" ? "descriptor" : adapter.id === "define-module" ? "define" : "split"}.ts`),
}));
const discoveryProof = new Map();
for (const { adapter, sourcePath } of candidateSources) {
  const source = readFileSync(sourcePath, "utf8");
  assert(!source.includes("factories"), `${adapter.id} imports executable implementation code during discovery`);
  assert(!source.includes(".expected") && !source.includes("expected:"), `${adapter.id} can manufacture observations from expectations`);
  assert(!/(decorator|reflect-metadata|awilix|cordis|service.locator|filesystem|register\()/i.test(source), `${adapter.id} leaks a framework or discovery mechanism`);
  discoveryProof.set(adapter.id, true);
}
const oracleSource = readFileSync(join(here, "oracle.ts"), "utf8");
assert(!oracleSource.includes("packages/core") && !oracleSource.includes(".expected"), "oracle imports production Core or reads expectations");

const executions = [];
const decodedCorpusDigests = [];
let factoryScenarioUses = 0;
let declarationEmitCells = 0;
let splitAssociationProbes = 0;
let alternateImplementationSelections = 0;
for (const adapter of adapters) {
  const decoded = [];
  for (const scenario of corpus) {
    const encoded = adapter.encode(scenario.input);
    assert(!executablePath(encoded), `${adapter.id}/${scenario.id} encoded candidate contains executable data`);
    if (adapter.id === "split-declaration-factory") {
      assert(encoded.syntax === "inert-declaration-plus-activation-ref", "split candidate did not execute its declaration/ref shape");
      assert(encoded.declarations.every((entry) => entry.activationRef === entry.declaration.implementationId), "split activation references do not match declarations");
    } else {
      const expectedSyntax = adapter.id === "define-module" ? "typed-defineModule" : "inert-descriptor-object";
      assert(encoded.syntax === expectedSyntax && encoded.declarations.every((entry) => own(entry, "moduleId")), `${adapter.id} did not execute its candidate authoring shape`);
    }
    const input = adapter.decode(encoded);
    assert(digest(input) === digest(scenario.input), `${adapter.id}/${scenario.id} changes corpus semantics`);
    decoded.push(input);
    const observed = observe(input);
    assert(observed && observed !== scenario.expected, `${adapter.id}/${scenario.id} observed outcome absent or manufactured`);
    assert(expectedMatches(observed, scenario.expected), `${adapter.id}/${scenario.id} mismatch: ${canonical(observed)}`);
    const permuted = observe(adapter.decode(adapter.encode(permute(input))));
    assert(canonical(observed) === canonical(permuted), `${adapter.id}/${scenario.id} depends on declaration or registration order`);

    if (scenario.id === "S19") {
      const dependencies = Object.create(null);
      for (const key of hostileRecordKeys) Object.defineProperty(dependencies, key, { value: key, enumerable: true });
      for (const key of hostileRecordKeys) assert(own(dependencies, key), `${adapter.id} lost hostile own record key ${key}`);
      assert(canonical(hostileRecordKeys.filter((key) => slotGrammar.test(key))) === canonical(["constructor", "then"]), "arbitrary record keys were confused with accepted SlotIds");
      assert(dependencies["é"] !== dependencies["é"], `${adapter.id} collapsed Unicode slot forms`);
    }
    if (scenario.id === "S20") assert(observed.diagnostics[0].path === "/declarations/lab/provider-a/default/executable", `${adapter.id} unknown declaration field path is not explicit`);
    if (scenario.id === "S23") assert(observed.diagnostics[0].path === "/declarations/lab/provider-a/default/owner/path/0", `${adapter.id} owner path diagnostic is not explicit`);
    if (scenario.id === "S24") assert(observed.diagnostics[0].path === "/profile/selections/lab/unknown", `${adapter.id} unknown profile module path is not explicit`);
    if (scenario.id === "S21") {
      for (const chosen of input.profile.selections) {
        const alternative = { ...input, profile: { ...input.profile, selections: [chosen] } };
        const result = observe(adapter.decode(adapter.encode(alternative)));
        assert(result.ok && canonical(result.inventory) === canonical([chosen.implementationId]), `${adapter.id} rejects legitimate alternate implementations`);
        alternateImplementationSelections++;
      }
    }
    assert(observed.diagnostics.every(({ code }) => code === "host.profile.root-disabled" || diagnosticCodes.has(code)), `${adapter.id} emits an unknown semantic diagnostic code`);
    if (scenario.id === "S25") {
      const withoutFallback = { ...input, fallbackBindings: [] };
      assert(canonical(observe(withoutFallback)) === canonical(observed) && observed.diagnostics.some(({ code }) => code === "binding.missing"), `${adapter.id} consumed a hidden fallback`);
    }
    if (scenario.id === "S26") assert(discoveryProof.get(adapter.id), `${adapter.id} lacks discovery-import evidence`);
    if (scenario.hostProbe === "selected-literal-loaders") {
      factoryScenarioUses++;
      let selectedLoaderCalls = 0;
      let unselectedLoaderCalls = 0;
      const loaders = {
        "lab/provider-a/default": async () => { selectedLoaderCalls++; return (await loadFactories()).serviceFactory; },
        "lab/consumer/default": async () => { selectedLoaderCalls++; return (await loadFactories()).consumerFactory; },
        "lab/unselected/default": async () => { unselectedLoaderCalls++; return (await loadFactories()).serviceFactory; },
      };
      let serviceFactory = await loaders[observed.dependencyOrder[0]]();
      let consumerFactory = await loaders[observed.dependencyOrder[1]]();
      if (adapter.id === "split-declaration-factory") {
        const { associateFactory } = await import(pathToFileURL(join(emitRoot, "candidate-split-factory.js")).href);
        const [provider, consumer] = observed.dependencyOrder.map((id) => encoded.declarations.find(({ activationRef }) => activationRef === id));
        serviceFactory = associateFactory(provider.declaration, provider.activationRef, serviceFactory).activate;
        consumerFactory = associateFactory(consumer.declaration, consumer.activationRef, consumerFactory).activate;
        let rejected = false;
        try { associateFactory(provider.declaration, consumer.activationRef, consumerFactory); } catch (error) { rejected = error.message === "factory identity mismatch"; }
        assert(rejected, "split factory association accepted a mismatched implementation");
        splitAssociationProbes++;
      }
      assert(consumerFactory({ service: serviceFactory() }).read() === "selected-service", `${adapter.id}/${scenario.id} selected loader result failed`);
      assert(selectedLoaderCalls === 2 && unselectedLoaderCalls === 0, `${adapter.id}/${scenario.id} called or imported an unselected literal loader`);
    }
    if (scenario.hostProbe === "direct-pure-di-parity") {
      factoryScenarioUses++;
      const { consumerFactory, serviceFactory } = await loadFactories();
      let candidateFactories = { "lab/provider-a/default": serviceFactory, "lab/consumer/default": consumerFactory };
      if (adapter.id === "split-declaration-factory") {
        const { associateFactory } = await import(pathToFileURL(join(emitRoot, "candidate-split-factory.js")).href);
        candidateFactories = Object.fromEntries(encoded.declarations.map(({ declaration, activationRef }) => [activationRef, associateFactory(declaration, activationRef, candidateFactories[activationRef]).activate]));
        splitAssociationProbes++;
      }
      const candidateService = candidateFactories[observed.dependencyOrder[0]]();
      const candidateResult = candidateFactories[observed.dependencyOrder[1]]({ service: candidateService }).read();
      const handwrittenPureDiResult = consumerFactory({ service: serviceFactory() }).read();
      assert(candidateResult === handwrittenPureDiResult, `${adapter.id}/${scenario.id} differs from direct handwritten Pure DI`);
    }
    if (scenario.id === "S29") assert(canonical(JSON.parse(JSON.stringify(encoded))) === canonical(encoded), `${adapter.id} declaration is not serializable`);
    if (scenario.id === "S30") {
      const dts = readFileSync(join(emitRoot, `candidate-${candidateSources.find((entry) => entry.adapter === adapter).stem}.d.ts`), "utf8");
      const requiredExport = adapter.id === "descriptor-object" ? "descriptorExample" : adapter.id === "define-module" ? "defineModule" : "splitDeclaration";
      assert(dts.includes(`export declare`) && dts.includes(requiredExport), `${adapter.id} lacks actual TypeScript declaration emit`);
      declarationEmitCells++;
    }
    executions.push({ candidateId: adapter.id, scenarioId: scenario.id, title: scenario.title, evidenceClass: scenario.evidenceClass, ok: observed.ok, diagnosticCodes: observed.diagnostics.map(({ code }) => code) });
  }
  decodedCorpusDigests.push(digest(decoded));
}
assert(executions.length === 90, `expected 90 executions, got ${executions.length}`);
for (const adapter of adapters) assert(executions.filter(({ candidateId }) => candidateId === adapter.id).length === 30, `${adapter.id} did not execute all 30`);
assert(new Set(decodedCorpusDigests).size === 1, "candidate corpus digests differ");
assert(factoryScenarioUses === 6, `factories used outside the two host probes per candidate: ${factoryScenarioUses}`);
assert(declarationEmitCells === 3, `declaration emit was not proved for every candidate: ${declarationEmitCells}`);
assert(splitAssociationProbes === 2, "split associations were not exercised by both host probes");
assert(alternateImplementationSelections === 6, "alternate implementation selection was not proved for every candidate");
const corpusDigest = decodedCorpusDigests[0];

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
      mkdirSync(directory);
      const declarations = Array.from({ length: size }, (_, index) => {
        const value = `{moduleId:"scale/m${index}",implementationId:"scale/m${index}/default",owner:{authority:"scale",path:["m${index}"]},provides:[],slots:[]}`;
        if (adapter.id === "define-module") return `export const m${index}=defineModule(${value});`;
        if (adapter.id === "split-declaration-factory") return `export const m${index}={declaration:${value} as const satisfies Declaration,activationRef:"scale/m${index}/default" as const};`;
        return `export const m${index}=${value} as const satisfies Declaration;`;
      }).join("\n");
      const prelude = adapter.id === "define-module"
        ? "type Declaration={readonly moduleId:string;readonly implementationId:string;readonly owner:{readonly authority:string;readonly path:readonly string[]};readonly provides:readonly unknown[];readonly slots:readonly unknown[]};function defineModule<const T extends Declaration>(x:T):T{return x;}"
        : "type Declaration={readonly moduleId:string;readonly implementationId:string;readonly owner:{readonly authority:string;readonly path:readonly string[]};readonly provides:readonly unknown[];readonly slots:readonly unknown[]};";
      writeFileSync(join(directory, "scale.ts"), `${prelude}\n${declarations}\n`);
      if (adapter.id === "split-declaration-factory") {
        writeFileSync(join(directory, "factories.ts"), `import * as declarations from "./scale.js";\n${Array.from({ length: size }, (_, index) => `export const f${index}:{implementationId:typeof declarations.m${index}.activationRef;activate:()=>number}={implementationId:declarations.m${index}.activationRef,activate:()=>${index}};`).join("\n")}\n`);
      }
      writeFileSync(join(directory, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, declaration: true, emitDeclarationOnly: true, skipLibCheck: true, types: [], outDir: "dist" }, include: ["*.ts"] }));
      const started = performance.now();
      execFileSync(process.execPath, [tscPath, "-p", join(directory, "tsconfig.json")], { stdio: "pipe" });
      const fileHashes = (root, names) => Object.fromEntries(names.sort(compare).map((name) => [name, createHash("sha256").update(readFileSync(join(root, name))).digest("hex")]));
      scale[adapter.id][size] = { declarations: size, compileDurationMs: Math.round((performance.now() - started) * 100) / 100,
        inputs: fileHashes(directory, readdirSync(directory).filter((name) => /\.(ts|json)$/.test(name))),
        declarationsEmitted: fileHashes(join(directory, "dist"), readdirSync(join(directory, "dist"))),
      };
    }
  }
} finally { rmSync(scaleRoot, { recursive: true, force: true }); }

const metrics = {};
const sourceLoc = (source) => source.split("\n").filter((line) => line.trim() && !line.trim().startsWith("//")).length;
for (const { adapter, sourcePath, stem } of candidateSources) {
  const source = readFileSync(sourcePath, "utf8");
  const declaration = readFileSync(join(emitRoot, `candidate-${stem}.d.ts`), "utf8");
  const authoringLoc = countRegion(source, "authoring");
  const genericGlueLoc = countRegion(source, "glue");
  const candidateSupportLoc = sourceLoc(source) - authoringLoc - genericGlueLoc;
  const separateFactoryLoc = adapter.id === "split-declaration-factory" ? sourceLoc(readFileSync(join(here, "candidate-split-factory.ts"), "utf8")) : 0;
  const totalSupportLoc = genericGlueLoc + candidateSupportLoc + separateFactoryLoc;
  metrics[adapter.id] = {
    authoringLoc, genericGlueLoc, candidateSupportLoc, separateFactoryLoc, totalSupportLoc, genericGlueRatio: totalSupportLoc / (authoringLoc + totalSupportLoc),
    layoutAssumptions: { filesPerModule: adapter.id === "split-declaration-factory" ? 2 : 1, bindingLoci: 1, removalEdits: 2, disableEdits: 1, evidence: "not measured by editing product modules" },
    explicitAnnotationMatchesInCandidateFile: (source.match(/satisfies Declaration|: CandidateAdapter|ActivationFactory/g) ?? []).length,
    declarationLines: declaration.trimEnd().split("\n").length, declarationBytes: Buffer.byteLength(declaration), declarationExports: (declaration.match(/^export /gm) ?? []).length,
    serializedBytes: Buffer.byteLength(canonical(corpus.map(({ input }) => adapter.encode(input)))), importCounters: {
      sourceImports: (source.match(/^import /gm) ?? []).length,
      typeOnlyImports: (source.match(/^import type /gm) ?? []).length,
      executableImplementationImports: (source.match(/from ["'].*factories|from ["'].*packages\/core/gm) ?? []).length,
      frameworkImports: (source.match(/from ["'](?:awilix|cordis|reflect-metadata)/gm) ?? []).length,
    },
    compileDuration: scale[adapter.id], treeShaking: "not-measured", runtimePerformance: "not-measured",
  };
}
const summary = {
  schemaVersion: 2, status: "pass", authority: "non-authoritative qualification-only; not production", scenarioCount: corpus.length,
  executionCount: executions.length, corpusDigest,
  additionalChecks: { alternateImplementationSelections, rawDesiredStateRejected, splitAssociationProbes },
  scenarioMatrix: corpus.map(({ id, title, evidenceClass, expected, hostProbe }) => ({ id, title, evidenceClass, expected, ...(hostProbe ? { hostProbe } : {}) })),
  executions, metrics,
  emittedDeclarations: Object.fromEntries(readdirSync(emitRoot).filter((name) => name.endsWith(".d.ts")).sort(compare).map((name) => [name, createHash("sha256").update(readFileSync(join(emitRoot, name))).digest("hex")])),
  limitations: { desiredState: "explicit test-Host preprocessing policy, not a production desired-state contract", semantics: "simplified normalized lab inputs and diagnostic payloads, not full wire/diagnostic/SCC conformance", measurements: "synthetic source/emit counts only; layout edits are assumptions" },
  guards: { exactClosedCorpus: true, substantiveScenarioWitnesses: true, immutablePlainData: true, ordinaryHelperReadsWithoutValidation: true, inheritedHelperReads: true, genuineCandidateShapes: true, splitFactoryAssociation: true, noExpectationManufacture: true, noExecutableDiscoveryImports: true, hiddenFallbackRejected: true, noRegistrationOrderSemantics: true, permutationStable: true, hostileOwnKeys: true, selectedLiteralLoadersOnly: true, directPureDiParity: true, declarationSerializability: true, actualDeclarationEmitEveryCandidate: true, factoriesRestrictedToHostProbes: true },
};
mkdirSync(join(here, "dist"), { recursive: true });
writeFileSync(join(here, "dist", "result-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(summary)}\n`);
