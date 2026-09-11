import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { glob, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { parse, stringify } from "yaml";

const execute = promisify(execFile);
const require = createRequire(import.meta.url);
// Resolve the exported manifest and its public bin contract, not a private dist layout.
const foundationManifestPath = require.resolve("@agent-teams/engineering-foundation/package.json");
const foundationManifest = JSON.parse(await readFile(foundationManifestPath, "utf8"));
const foundationBin = foundationManifest.bin?.["agent-teams-foundation"];
assert.equal(typeof foundationBin, "string", "Foundation must expose its public CLI bin");
const cli = join(dirname(foundationManifestPath), foundationBin);
const policyPath = "architecture/foundation/source-dependencies.yaml";
const policy = parse(await readFile(policyPath, "utf8"));
const sourcePaths = [];
// Hostile fixtures exercise the production Core/Assembly graph. Full-repo
// generated and test trees stay on the live check, not this disposable copy.
for (const root of ["packages/core/src", "packages/assembly/src"]) {
  for await (const path of glob(`${root}/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}`)) {
    sourcePaths.push(path.replaceAll("\\", "/"));
  }
}
// Standalone execution requires pnpm assembly:build, as do the aggregate gates.
const source = new Map(await Promise.all(sourcePaths.map(async path => [path, await readFile(path, "utf8")])));
const coreManifest = await readFile("packages/core/package.json", "utf8");
const assemblyManifest = await readFile("packages/assembly/package.json", "utf8");
const canonicalRoot = "packages/core/src/features/canonicalization";
const implementationRoot = `${canonicalRoot}/owned-jcs`;
const consumerPath = "packages/core/src/features/consumer/factory.ts";
const assemblyFactoryPath = "packages/assembly/src/features/construction/factory.ts";

// Fixtures invoke the installed Foundation CLI. This harness neither parses
// source nor reproduces its classifier, dependency rules, or cycle algorithm.
async function checkFixture(change = () => {}) {
  const directory = await mkdtemp(join(tmpdir(), "gm-source-policy-"));
  try {
    const files = new Map(source);
    const configuration = structuredClone(policy);
    configuration.schemaVersion = 3;
    configuration.packageRoots = ["packages/core", "packages/assembly"];
    delete configuration.rootPackage;
    configuration.governedRoots = ["packages/core/src", "packages/assembly/src"];
    configuration.boundaries = configuration.boundaries.filter(boundary =>
      (boundary.roots ?? []).every(root =>
        root.startsWith("packages/core/src") || root.startsWith("packages/assembly/src")));
    change(files, configuration);
    files.set("package.json", JSON.stringify({ name: "source-policy-fixture", private: true, type: "module" }));
    files.set("pnpm-workspace.yaml", 'packages:\n  - "packages/*"\n');
    files.set("packages/core/package.json", coreManifest);
    files.set("packages/assembly/package.json", assemblyManifest);
    files.set("foundation.config.yaml", stringify({ schemaVersion: 1, project: { id: "source-policy-fixture" }, capabilities: { "architecture.source-dependencies": { configPath: policyPath } } }));
    files.set(policyPath, stringify(configuration));
    for (const [path, contents] of files) {
      const target = join(directory, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, contents);
    }
    let result;
    try {
      result = await execute(process.execPath, [cli, "check", "architecture.source-dependencies", "--consumer", directory, "--format", "json"], { timeout: 30_000, maxBuffer: 2_000_000 });
    } catch (error) {
      assert.ok(error.code === 1 || error.code === 2, error.stderr ?? String(error));
      result = error;
    }
    return JSON.parse(result.stdout);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function rules(report) {
  assert.equal(report.capabilities.length, 1);
  assert.equal(report.capabilities[0].capabilityId, "architecture.source-dependencies");
  return report.capabilities[0].diagnostics.map(item => item.ruleId).join("\n");
}

function addConsumer(files, configuration, target = "../canonicalization/ports.js") {
  files.set(consumerPath, `import type { CanonicalBytesPort } from ${JSON.stringify(target)};\nexport type Consumer = CanonicalBytesPort;\n`);
  configuration.boundaries.push({
    id: "fixture-consumer", roots: [consumerPath], entrypoints: [consumerPath],
    allow: { boundaries: ["core-canonicalization-contract"], packages: [], builtins: [], runtimeReferences: [] },
  });
}

test("Foundation accepts all materialized feature roles", async () => {
  const report = await checkFixture();
  assert.equal(report.outcome, "passed", JSON.stringify(report));
  assert.equal(rules(report), "");
});

test("Foundation admits consumer-owned port and provider identity imports", async () => {
  const report = await checkFixture((files, configuration) => {
    addConsumer(files, configuration);
    files.set(consumerPath, files.get(consumerPath) + 'export { canonicalBytesCapabilityId } from "../canonicalization/identity.js";\n');
  });
  assert.equal(report.outcome, "passed", JSON.stringify(report));
  assert.equal(rules(report), "");
});

test("Foundation admits the authoring library only through its curated entrypoint", async () => {
  const admitted = await checkFixture((files, configuration) => {
    addConsumer(files, configuration);
    configuration.boundaries.find(boundary => boundary.id === "fixture-consumer").allow.boundaries.push("core-authoring");
    files.set(consumerPath, 'export { required } from "../authoring/internal.js";\n');
  });
  assert.equal(admitted.outcome, "passed", JSON.stringify(admitted));
  const rejected = await checkFixture((files, configuration) => {
    addConsumer(files, configuration);
    configuration.boundaries.find(boundary => boundary.id === "fixture-consumer").allow.boundaries.push("core-authoring");
    files.set(consumerPath, 'export { required } from "../authoring/helpers.js";\n');
  });
  assert.match(rules(rejected), /architecture\.source-dependencies\.cross-boundary-local-import-not-entrypoint/u);
});

test("Foundation admits diagnostics only through its curated library entrypoint", async () => {
  const admitted = await checkFixture((files, configuration) => {
    addConsumer(files, configuration);
    configuration.boundaries.find(boundary => boundary.id === "fixture-consumer").allow.boundaries.push("core-diagnostics");
    files.set(consumerPath, 'export { createDiagnosticCollector } from "../diagnostics/internal.js";\n');
  });
  assert.equal(admitted.outcome, "passed", JSON.stringify(admitted));
  const rejected = await checkFixture((files, configuration) => {
    addConsumer(files, configuration);
    configuration.boundaries.find(boundary => boundary.id === "fixture-consumer").allow.boundaries.push("core-diagnostics");
    files.set(consumerPath, 'export { createDiagnosticCollector } from "../diagnostics/collector.js";\n');
  });
  assert.match(rules(rejected), /architecture\.source-dependencies\.cross-boundary-local-import-not-entrypoint/u);
});

test("Foundation prevents diagnostics from selecting a concrete canonicalizer", async () => {
  const report = await checkFixture(files => {
    const path = "packages/core/src/features/diagnostics/order.ts";
    files.set(path, files.get(path) + '\nimport { createOwnedJcs } from "../canonicalization/owned-jcs/factory.js";\n');
  });
  assert.match(rules(report), /architecture\.source-dependencies\.forbidden-boundary-dependency/u);
});

test("Foundation keeps the admission resource pass private to its owner", async () => {
  const report = await checkFixture((files, configuration) => {
    addConsumer(files, configuration);
    configuration.boundaries.find(boundary => boundary.id === "fixture-consumer").allow.boundaries.push("core-input-admission");
    files.set(consumerPath, 'export { createObjectResourceMeter } from "../input-admission/object-resource-meter.js";\n');
  });
  assert.match(rules(report), /architecture\.source-dependencies\.cross-boundary-local-import-not-entrypoint/u);
});

test("Foundation rejects a concrete canonicalizer inside admission", async () => {
  const report = await checkFixture(files => {
    const path = "packages/core/src/features/input-admission/object-admission.ts";
    files.set(path, files.get(path) + '\nimport { createOwnedJcs } from "../canonicalization/owned-jcs/factory.js";\n');
  });
  assert.match(rules(report), /architecture\.source-dependencies\.forbidden-boundary-dependency/u);
});

test("Foundation keeps the graph kernel private and independent from admission", async () => {
  const privateEntry = await checkFixture((files, configuration) => {
    addConsumer(files, configuration);
    configuration.boundaries.find(boundary => boundary.id === "fixture-consumer").allow.boundaries.push("core-composition-semantics");
    files.set(consumerPath, 'export { analyzeSelectedGraph } from "../composition-semantics/selected-graph.js";\n');
  });
  assert.match(rules(privateEntry), /architecture\.source-dependencies\.cross-boundary-local-import-not-entrypoint/u);
  const forbiddenEdge = await checkFixture(files => {
    const path = "packages/core/src/features/composition-semantics/selected-graph.ts";
    files.set(path, files.get(path) + '\nimport { admitObjectInput } from "../input-admission/object-admission.js";\n');
  });
  assert.match(rules(forbiddenEdge), /architecture\.source-dependencies\.forbidden-boundary-dependency/u);
});

for (const [feature, symbol, privateFile, privateSymbol] of [
  ["input-admission", "InputAdmissionPort", "object-admission", "admitObjectInput"],
  ["composition-semantics", "CompositionSemanticsPort", "semantic-analysis", "analyzeCompositionSemantics"],
]) {
  test(`Foundation admits ${feature} contracts without opening factories or private algorithms`, async () => {
    const configure = (files, configuration, contents) => {
      addConsumer(files, configuration);
      configuration.boundaries.find(boundary => boundary.id === "fixture-consumer").allow.boundaries.push(`core-${feature}-contract`);
      files.set(consumerPath, contents);
    };
    const admitted = await checkFixture((files, configuration) => configure(files, configuration,
      `export type { ${symbol} } from "../${feature}/ports.js";\n`));
    assert.equal(admitted.outcome, "passed", JSON.stringify(admitted));
    const factory = await checkFixture((files, configuration) => configure(files, configuration,
      `import "../${feature}/factory.js";\n`));
    assert.match(rules(factory), /architecture\.source-dependencies\.forbidden-boundary-dependency/u);
    const algorithm = await checkFixture((files, configuration) => {
      configure(files, configuration, `export { ${privateSymbol} } from "../${feature}/${privateFile}.js";\n`);
      configuration.boundaries.find(boundary => boundary.id === "fixture-consumer").allow.boundaries.push(`core-${feature}`);
    });
    assert.match(rules(algorithm), /architecture\.source-dependencies\.cross-boundary-local-import-not-entrypoint/u);
  });
}

for (const [name, path, contents] of [
  ["behavior outside a feature", "packages/core/src/helpers.ts", "export function hiddenRule() { return 1; }\n"],
  ["undeclared feature ownership", "packages/core/src/features/unowned/factory.ts", "export const hidden = 1;\n"],
  ["empty ceremonial layer", `${implementationRoot}/domain/index.ts`, "export {};\n"],
]) {
  test(`Foundation rejects ${name}`, async () => {
    const report = await checkFixture(files => files.set(path, contents));
    assert.match(rules(report), /architecture\.source-dependencies\.unclassified-source-file/u);
  });
}

test("Foundation rejects consumer imports of a concrete provider", async () => {
  const report = await checkFixture((files, configuration) => {
    addConsumer(files, configuration);
    files.set(consumerPath, 'export { createOwnedJcs } from "../canonicalization/owned-jcs/factory.js";\n');
  });
  assert.match(rules(report), /architecture\.source-dependencies\.forbidden-boundary-dependency/u);
});

test("Foundation rejects a concrete canonicalizer fallback inside plan output", async () => {
  const report = await checkFixture(files => {
    const path = "packages/core/src/features/plan-output/factory.ts";
    files.set(path, files.get(path) + '\nimport { createOwnedJcs } from "../canonicalization/owned-jcs/factory.js";\n');
  });
  assert.match(rules(report), /architecture\.source-dependencies\.forbidden-boundary-dependency/u);
});

test("Foundation keeps facade providers injected and the public barrel closed", async () => {
  const facade = await checkFixture(files => {
    const path = "packages/core/src/features/compiler-facade/factory.ts";
    files.set(path, files.get(path) + '\nimport { createInputAdmission } from "../input-admission/factory.js";\n');
  });
  assert.match(rules(facade), /architecture\.source-dependencies\.forbidden-boundary-dependency/u);
  const barrel = await checkFixture(files => {
    const path = "packages/core/src/index.ts";
    files.set(path, files.get(path) + '\nexport { createCompilerFacade } from "./features/compiler-facade/factory.js";\n');
  });
  assert.match(rules(barrel), /architecture\.source-dependencies\.forbidden-boundary-dependency/u);
});

test("Foundation rejects private deep imports even across an allowed edge", async () => {
  const report = await checkFixture((files, configuration) => {
    addConsumer(files, configuration);
    const hidden = `${canonicalRoot}/hidden.ts`;
    configuration.boundaries.find(boundary => boundary.id === "core-canonicalization-contract").roots.push(hidden);
    files.set(hidden, "export type Hidden = string;\n");
    files.set(consumerPath, 'export type { Hidden } from "../canonicalization/hidden.js";\n');
  });
  assert.match(rules(report), /architecture\.source-dependencies\.cross-boundary-local-import-not-entrypoint/u);
});

for (const [name, statement, rule] of [
  ["Node builtin", 'import "node:fs";', "forbidden-builtin-dependency"],
  ["development package", 'import "@agent-teams/engineering-foundation";', "forbidden-package-dependency"],
  ["hidden dynamic import", 'const target = "somewhere"; void import(target);', "unresolved-runtime-reference"],
]) {
  test(`Foundation rejects ${name} in portable production`, async () => {
    const report = await checkFixture(files => files.set(`${implementationRoot}/factory.ts`, statement + "\n"));
    assert.ok(rules(report).includes(`architecture.source-dependencies.${rule}`), rules(report));
  });
}

for (const typeOnly of [false, true]) {
  test(`Foundation rejects an allowed-edge ${typeOnly ? "type-only" : "runtime"} cycle`, async () => {
    const report = await checkFixture((files, configuration) => {
      addConsumer(files, configuration);
      configuration.boundaries.find(boundary => boundary.id === "core-canonicalization-contract").allow.boundaries.push("fixture-consumer");
      if (typeOnly) {
        files.set(`${canonicalRoot}/ports.ts`, files.get(`${canonicalRoot}/ports.ts`) + '\nexport type { Consumer } from "../consumer/factory.js";\n');
      } else {
        files.set(consumerPath, 'export { canonicalBytesToken } from "../canonicalization/identity.js";\n');
        files.set(`${canonicalRoot}/identity.ts`, files.get(`${canonicalRoot}/identity.ts`) + '\nexport { canonicalBytesToken as loop } from "../consumer/factory.js";\n');
      }
    });
    assert.ok(rules(report).includes(`architecture.source-dependencies.boundary-${typeOnly ? "type-only" : "runtime"}-cycle`), rules(report));
  });
}

test("Foundation rejects public fallback to the direct qualification root", async () => {
  const report = await checkFixture(files => {
    const path = "packages/core/src/index.ts";
    const original = files.get(path);
    assert.ok(original.includes("./composition/generated/stage1.js"));
    files.set(path, original.replace("./composition/generated/stage1.js", "./composition/stage0.js"));
  });
  assert.match(rules(report), /architecture\.source-dependencies\.forbidden-boundary-dependency/u);
});

test("Foundation rejects a feature dependency on generated construction", async () => {
  const report = await checkFixture(files => {
    const path = "packages/core/src/features/compiler-facade/factory.ts";
    files.set(path, files.get(path) + '\nimport { root } from "../../composition/generated/stage1.js";\n');
  });
  assert.match(rules(report), /architecture\.source-dependencies\.forbidden-boundary-dependency/u);
});

for (const [name, target, specifier] of [
  ["tooling", "packages/core/self-composition/fixture.ts", "../../../self-composition/fixture.js"],
  ["tests", "packages/core/tests/fixture.ts", "../../../tests/fixture.js"],
]) {
  test(`Foundation rejects generated imports into ${name}`, async () => {
    const report = await checkFixture(files => {
      const path = "packages/core/src/composition/generated/stage1.ts";
      files.set(target, "export const fixture = 1;\n");
      files.set(path, files.get(path) + `\nimport { fixture } from "${specifier}";\n`);
    });
    assert.equal(report.outcome, "violations", JSON.stringify(report));
    assert.ok(rules(report).includes("architecture.source-dependencies."), rules(report));
  });
}

test("Foundation leaves generated siblings unclassified", async () => {
  const report = await checkFixture(files => {
    files.set("packages/core/src/composition/generated/extra.ts", "export {};\n");
  });
  assert.match(rules(report), /architecture\.source-dependencies\.unclassified-source-file/u);
});

test("Foundation admits Assembly construction through the public Core root", async () => {
  const report = await checkFixture(files => {
    files.set(assemblyFactoryPath, files.get(assemblyFactoryPath)
      + '\nimport "@get-modular/core";\n');
  });
  assert.equal(report.outcome, "passed", JSON.stringify(report));
  assert.equal(rules(report), "");
});

for (const specifier of ["@get-modular/assembly", "../../assembly/src/index.js"]) {
  test(`Foundation rejects Core importing Assembly through ${specifier}`, async () => {
    const report = await checkFixture(files => {
      const path = "packages/core/src/index.ts";
      files.set(path, files.get(path) + `\nimport ${JSON.stringify(specifier)};\n`);
    });
    assert.equal(report.outcome, "violations", JSON.stringify(report));
    assert.match(rules(report),
      /architecture\.source-dependencies\.(?:forbidden-package-dependency|forbidden-boundary-dependency|cross-package-relative-import)/u);
  });
}

for (const specifier of [
  "@get-modular/core/src/features/authoring/helpers.js",
  "@get-modular/core/dist/index.js",
  "../../../../core/src/index.js",
  "../../../../core/src/features/authoring/helpers.js",
]) {
  test(`Foundation rejects Assembly bypassing the Core public root with ${specifier}`, async () => {
    const report = await checkFixture(files => {
      files.set(assemblyFactoryPath, files.get(assemblyFactoryPath)
        + `\nimport ${JSON.stringify(specifier)};\n`);
    });
    assert.equal(report.outcome, "violations", JSON.stringify(report));
    assert.match(rules(report), /architecture\.source-dependencies\./u);
  });
}

test("Foundation keeps private construction files behind the feature entrypoints", async () => {
  const report = await checkFixture(files => {
    files.set("packages/assembly/src/features/construction/hidden.ts",
      "export const hidden = 1;\n");
    const path = "packages/assembly/src/composition/root.ts";
    files.set(path, files.get(path)
      + '\nimport { hidden } from "../features/construction/hidden.js";\n');
  });
  assert.equal(report.outcome, "violations", JSON.stringify(report));
  assert.match(rules(report),
    /architecture\.source-dependencies\.cross-boundary-local-import-not-entrypoint/u);
});

for (const [name, statement, rule] of [
  ["Node builtin", 'import "node:fs";', "forbidden-builtin-dependency"],
  ["development package", 'import "@agent-teams/engineering-foundation";', "forbidden-package-dependency"],
  ["dynamic import", 'const target = "somewhere"; void import(target);', "unresolved-runtime-reference"],
]) {
  test(`Foundation rejects ${name} in Assembly construction`, async () => {
    const report = await checkFixture(files => {
      files.set(assemblyFactoryPath, files.get(assemblyFactoryPath) + `\n${statement}\n`);
    });
    assert.equal(report.outcome, "violations", JSON.stringify(report));
    assert.ok(rules(report).includes(`architecture.source-dependencies.${rule}`), rules(report));
  });
}

for (const path of [
  "packages/assembly/src/helpers.ts",
  "packages/assembly/src/features/unowned/factory.ts",
  "packages/assembly/src/composition/extra.ts",
]) {
  test(`Foundation rejects unowned Assembly source at ${path}`, async () => {
    const report = await checkFixture(files => {
      files.set(path, "export const hidden = 1;\n");
    });
    assert.match(rules(report), /architecture.source-dependencies\.unclassified-source-file/u);
  });
}

test("source v3 rejects includeRootPackage as an unknown public field", async () => {
  const report = await checkFixture((_files, configuration) => {
    configuration.includeRootPackage = true;
  });
  assert.notEqual(report.outcome, "passed", JSON.stringify(report));
  assert.match(JSON.stringify(report), /includeRootPackage|unknown property|invalid-input/iu);
});
