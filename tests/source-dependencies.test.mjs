import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { parse, stringify } from "yaml";

const execute = promisify(execFile);
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve("@agent-teams/engineering-foundation/package.json")), "dist/cli.js");
const policyPath = "architecture/foundation/source-dependencies.yaml";
const policy = parse(await readFile(policyPath, "utf8"));
const sourcePaths = policy.boundaries.flatMap(boundary => boundary.roots);
const source = new Map(await Promise.all(sourcePaths.map(async path => [path, await readFile(path, "utf8")])));
const coreManifest = await readFile("packages/core/package.json", "utf8");
const canonicalRoot = "packages/core/src/features/canonicalization";
const implementationRoot = `${canonicalRoot}/owned-jcs`;
const consumerPath = "packages/core/src/features/consumer/factory.ts";

// Fixtures invoke the installed Foundation CLI. This harness neither parses
// source nor reproduces its classifier, dependency rules, or cycle algorithm.
async function checkFixture(change = () => {}) {
  const directory = await mkdtemp(join(tmpdir(), "gm-source-policy-"));
  try {
    const files = new Map(source);
    const configuration = structuredClone(policy);
    change(files, configuration);
    files.set("package.json", JSON.stringify({ name: "source-policy-fixture", private: true, type: "module" }));
    files.set("pnpm-workspace.yaml", 'packages:\n  - "packages/*"\n');
    files.set("packages/core/package.json", coreManifest);
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
      assert.equal(error.code, 1, error.stderr ?? String(error));
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
