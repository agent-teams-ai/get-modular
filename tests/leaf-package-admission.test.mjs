import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateLeafPackageAdmission } from "../architecture/checks/leaf-package-admission.mjs";
import {
  assertLeafPackageTable, LEAF_PACKAGES, leafManifestPath, leafPackageById, PRIVATE_CANDIDATE, PUBLIC,
  PUBLIC_FILES, PUBLIC_PUBLISH_CONFIG, publicRepository,
} from "../architecture/checks/leaf-packages.mjs";

const registryPath = "architecture/decisions/accepted-decisions.json";
const sha256 = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const sdkGrowthStatus = JSON.parse(await readFile("architecture/sdk-growth/status.json"));
const substantiveSource = "export function createKernel() { return { generation: 1 }; }\n";

// A synthetic second row proves that every rule below follows the table rather
// than one package name. Its decision exists only in this fixture.
const exampleDecision = Buffer.from("# ADR-9999: Admit an example leaf\n");
const exampleLeaf = Object.freeze({
  id: "example-leaf",
  name: "@get-modular/example-leaf",
  root: "packages/example-leaf",
  publication: "private-candidate",
  version: /^0\.1\.0$/u,
  decision: Object.freeze({
    id: "ADR-9999",
    path: "docs/decisions/9999-admit-an-example-leaf.md",
    fileDigest: sha256(exampleDecision),
    immutableDigest: `sha256:${"a".repeat(64)}`,
  }),
  extension: Object.freeze({ id: "example", authority: "docs/decisions/9999-admit-an-example-leaf.md" }),
  requiredTests: Object.freeze(["packages/example-leaf/tests/example.test.mjs"]),
  commands: Object.freeze({
    "example:test": "node --test packages/example-leaf/tests/example.test.mjs",
    "example:check": "pnpm example:test",
  }),
  gate: "example:check",
});
// A synthetic public row keeps the public class rules table-driven as well.
const examplePublicDecision = Buffer.from("# ADR-9998: Admit an example public leaf\n");
const examplePublic = Object.freeze({
  ...exampleLeaf,
  id: "example-public",
  name: "@get-modular/example-public",
  root: "packages/example-public",
  publication: PUBLIC,
  version: /^0\.\d+\.\d+$/u,
  decision: Object.freeze({
    id: "ADR-9998",
    path: "docs/decisions/9998-admit-an-example-public-leaf.md",
    fileDigest: sha256(examplePublicDecision),
    immutableDigest: `sha256:${"b".repeat(64)}`,
  }),
  extension: Object.freeze({ id: "example-public", authority: "docs/decisions/9998-admit-an-example-public-leaf.md" }),
  requiredTests: Object.freeze(["packages/example-public/tests/example.test.mjs"]),
  commands: Object.freeze({
    "example-public:test": "node --test packages/example-public/tests/example.test.mjs",
    "example-public:check": "pnpm example-public:test",
  }),
  gate: "example-public:check",
});
const ROWS = Object.freeze([...LEAF_PACKAGES, exampleLeaf, examplePublic]);

const realRegistry = JSON.parse(await readFile(registryPath));
const registry = Buffer.from(JSON.stringify({ ...realRegistry, decisions: [
  ...realRegistry.decisions,
  { id: "ADR-9999", path: exampleLeaf.decision.path, immutableDigest: exampleLeaf.decision.immutableDigest },
  { id: "ADR-9998", path: examplePublic.decision.path, immutableDigest: examplePublic.decision.immutableDigest },
] }));
const decisions = new Map([
  ...await Promise.all(LEAF_PACKAGES.map(async leaf =>
    [leaf.decision.path, await readFile(leaf.decision.path)])),
  [exampleLeaf.decision.path, exampleDecision],
  [examplePublic.decision.path, examplePublicDecision],
]);
const rootExport = () => ({ ".": {
  import: { types: "./dist/index.d.ts", default: "./dist/index.js" },
  default: "./dist/index.js",
} });
// The valid manifest of each publication class.
const manifestFor = leaf => leaf.publication === PUBLIC
  ? {
    name: leaf.name, type: "module", exports: rootExport(), files: [...PUBLIC_FILES],
    publishConfig: { ...PUBLIC_PUBLISH_CONFIG }, repository: publicRepository(leaf),
  }
  : { name: leaf.name, private: true, type: "module", exports: rootExport(), files: ["dist", "README.md", "LICENSE"] };

function fixture(leaf) {
  const files = new Map([[registryPath, registry], ...decisions]);
  const sourcePath = `${leaf.root}/src/index.ts`;
  const sources = new Map([[sourcePath, substantiveSource]]);
  const admitted = [leafManifestPath(leaf), sourcePath, ...leaf.requiredTests];
  const input = {
    productionArtifacts: ["packages/core/package.json", ...admitted],
    readBytes: async path => files.get(path),
    readPackageManifest: async () => manifestFor(leaf),
    readProductionSource: async path => sources.get(path),
    packageJson: { scripts: {
      ...leaf.commands, check: `pnpm ${leaf.gate}`, "check:fast": `pnpm ${leaf.gate}`,
    } },
    sdkGrowthStatus: structuredClone(sdkGrowthStatus),
    leaves: ROWS,
  };
  return { files, sources, input, sourcePath, admitted };
}

// The table carries the reviewed candidate chain, so editing a row is the
// only way to change it and that edit has to change this pin too.
test("the lifecycle-kernel row keeps its reviewed tests and command chain", () => {
  const kernel = leafPackageById("lifecycle-kernel");
  assert.equal(kernel.publication, "private-candidate");
  assert.equal(String(kernel.version), "/^0\\.1\\.0$/u");
  assert.deepEqual(kernel.requiredTests, [
    "packages/lifecycle-kernel/tests/kernel.test.mjs",
    "packages/lifecycle-kernel/tests/packed-root.test.mjs",
  ]);
  assert.deepEqual(kernel.commands, {
    "lifecycle:build": "node architecture/tooling/build-leaf-package.mjs lifecycle-kernel",
    "lifecycle:typecheck":
      "node node_modules/typescript/bin/tsc -p packages/lifecycle-kernel/tsconfig.json --noEmit"
      + " && node node_modules/typescript/bin/tsc -p packages/lifecycle-kernel/tsconfig.types.json --noEmit"
      + " && node node_modules/typescript/bin/tsc -p packages/lifecycle-kernel/tsconfig.types.bundler.json --noEmit",
    "lifecycle:test": "node --test packages/lifecycle-kernel/tests/kernel.test.mjs",
    "lifecycle:pack": "node --test packages/lifecycle-kernel/tests/packed-root.test.mjs",
    "lifecycle:check":
      "pnpm lifecycle:build && pnpm lifecycle:typecheck && pnpm lifecycle:test && pnpm lifecycle:pack",
  });
  assert.equal(kernel.gate, "lifecycle:check");
});

test("a root outside the table stays rejected", async () => {
  const { input } = fixture(exampleLeaf);
  await assert.rejects(validateLeafPackageAdmission({ ...input, leaves: LEAF_PACKAGES }),
    /unknown or differently named production root: packages\/example-leaf\//u);
});

// A malformed row would weaken every check that reads the table, so the table
// rejects it on load and admission rejects it when rows are supplied directly.
test("the table rejects rows that would admit less than their decision requires", async () => {
  assert.doesNotThrow(() => assertLeafPackageTable(ROWS));
  for (const [problem, change] of [
    ["id", { id: "core", root: "packages/core", name: "@get-modular/core" }],
    ["id", { id: "lifecycle-kernel" }],
    ["root", { root: "packages/example-copy" }],
    ["root", { name: "@get-modular/example-copy" }],
    ["publication", { publication: "internal" }],
    ["publication", { publication: undefined }],
    ["version", { version: /.*/u }],
    ["version", { version: /0\.1\.0/u }],
    ["version", { version: /^0\.1\.0$/gu }],
    ["version", { version: /^0\.1\.0$/mu }],
    ["version", { version: "0.1.0" }],
    ["decision", { decision: LEAF_PACKAGES[0].decision }],
    ["decision", { decision: { ...exampleLeaf.decision, path: LEAF_PACKAGES[0].decision.path } }],
    ["extension", { extension: { id: "example", authority: "docs/decisions/0001-other.md" } }],
    ["commands", { commands: { "example:check": "node -e 0" } }],
    ["commands", { gate: "governance:check",
      commands: { "governance:check": "node architecture/checks/governance.mjs" } }],
    ["commands", { commands: { ...exampleLeaf.commands, "example:check": "pnpm example:test && echo ok" } }],
    ["commands", { commands: { "example:test": exampleLeaf.commands["example:test"],
      "governance:test": "node --test tests/governance.test.mjs",
      "example:check": "pnpm example:test && pnpm governance:test" } }],
    ["requiredTests", { requiredTests: [] }],
    ["requiredTests", { requiredTests: [...exampleLeaf.requiredTests, `${exampleLeaf.root}/tests/other.test.mjs`] }],
    ...[LEAF_PACKAGES[0].requiredTests[0], `${exampleLeaf.root}/tests/../../core/tests/x.test.mjs`]
      .map(path => ["requiredTests", { requiredTests: [path], commands: {
        "example:test": `node --test ${path}`, "example:check": "pnpm example:test",
      } }]),
  ]) {
    const row = { ...exampleLeaf, ...change };
    const pattern = new RegExp(`LEAF_PACKAGE_TABLE_INVALID: ${row.id}: ${problem}$`, "u");
    assert.throws(() => assertLeafPackageTable([...LEAF_PACKAGES, row]), pattern,
      `${problem}: ${JSON.stringify(change)}`);
    await assert.rejects(validateLeafPackageAdmission({
      ...fixture(exampleLeaf).input, leaves: [...LEAF_PACKAGES, row],
    }), pattern);
  }
});

// Two implemented rows are each validated, and Core cannot import the second.
test("every implemented row is admitted and guarded at once", async () => {
  const rows = ROWS.map(leaf => fixture(leaf));
  const sources = new Map(ROWS.map(leaf => [`${leaf.root}/src/index.ts`, substantiveSource]));
  const input = {
    ...rows[0].input,
    productionArtifacts: ["packages/core/package.json", ...rows.flatMap(row => row.admitted)],
    readPackageManifest: async path => {
      const leaf = ROWS.find(row => leafManifestPath(row) === path);
      return manifestFor(leaf);
    },
    readProductionSource: async path => sources.get(path),
    packageJson: { scripts: Object.assign({}, ...ROWS.map(leaf => leaf.commands), {
      check: ROWS.map(leaf => `pnpm ${leaf.gate}`).join(" && "),
      "check:fast": ROWS.map(leaf => `pnpm ${leaf.gate}`).join(" && "),
    }) },
  };
  assert.deepEqual(await validateLeafPackageAdmission(input), rows.flatMap(row => row.admitted));
  for (const leaf of ROWS) {
    input.productionArtifacts.push("packages/core/src/consumer.ts");
    sources.set("packages/core/src/consumer.ts", `import type { Lease } from "${leaf.name}";\n`);
    await assert.rejects(validateLeafPackageAdmission(input),
      new RegExp(`must not import the leaf package ${leaf.name}`, "u"));
    input.productionArtifacts.pop();
    const { scripts } = input.packageJson;
    const gate = scripts[leaf.gate];
    scripts[leaf.gate] = "echo ok";
    await assert.rejects(validateLeafPackageAdmission(input), new RegExp(`non-no-op ${leaf.gate}`, "u"));
    scripts[leaf.gate] = gate;
  }
});

for (const leaf of ROWS) {
  const decisionId = leaf.decision.id;

  test(`${leaf.id}: the decision is authenticated while no root exists`, async () => {
    const { input } = fixture(leaf);
    input.productionArtifacts = ["packages/core/package.json"];
    assert.deepEqual(await validateLeafPackageAdmission(input), []);
  });

  test(`${leaf.id}: the exact decision and registry cannot independently authorize a different policy`, async () => {
    const { files, input } = fixture(leaf);
    const decision = files.get(leaf.decision.path);
    files.set(leaf.decision.path, Buffer.from(decision.toString("utf8") + "\n"));
    await assert.rejects(validateLeafPackageAdmission(input),
      new RegExp(`exact accepted ${decisionId} bytes`, "u"));
    files.set(leaf.decision.path, decision);
    const changed = JSON.parse(registry);
    changed.decisions.find(entry => entry.id === decisionId).immutableDigest =
      "sha256:" + "0".repeat(64);
    files.set(registryPath, Buffer.from(JSON.stringify(changed)));
    await assert.rejects(validateLeafPackageAdmission(input),
      new RegExp(`exact registered ${decisionId}`, "u"));
  });

  test(`${leaf.id}: the root, manifest and executable source are required together`, async () => {
    const { input, sources, sourcePath, admitted } = fixture(leaf);
    assert.deepEqual(await validateLeafPackageAdmission(input), admitted);
    const missingManifest = { ...input, productionArtifacts: [sourcePath] };
    await assert.rejects(validateLeafPackageAdmission(missingManifest), /package root manifest/u);
    const missingSource = { ...input, productionArtifacts: [leafManifestPath(leaf)] };
    await assert.rejects(validateLeafPackageAdmission(missingSource), /src\/index.ts/u);
    for (const required of leaf.requiredTests) {
      const missingTest = { ...input, productionArtifacts: input.productionArtifacts.filter(
        path => path !== required,
      ) };
      await assert.rejects(validateLeafPackageAdmission(missingTest), /requires a real test/u);
    }
    sources.set(sourcePath, "export {};\n");
    await assert.rejects(validateLeafPackageAdmission(input), /substantive executable source/u);
    sources.set(sourcePath, "export function createKernel() { ; debugger; }\n");
    await assert.rejects(validateLeafPackageAdmission(input), /substantive executable source/u);
    sources.set(sourcePath, "export const createKernel = function () { return {}; };\n");
    assert.deepEqual(await validateLeafPackageAdmission(input), admitted);
    sources.set(sourcePath, "  \n");
    await assert.rejects(validateLeafPackageAdmission(input), /cannot be empty/u);
  });

  test(`${leaf.id}: unknown, differently named and nested package roots remain rejected`, async () => {
    const { input } = fixture(leaf);
    input.productionArtifacts.push(`packages/${leaf.id}-copy/src/index.ts`);
    await assert.rejects(validateLeafPackageAdmission(input), /unknown or differently named/u);
    input.productionArtifacts.pop();
    input.productionArtifacts.push(`${leaf.root}/src/nested/package.json`);
    await assert.rejects(validateLeafPackageAdmission(input), /nested manifests/u);
    input.productionArtifacts.pop();
    input.readPackageManifest = async () => ({ ...manifestFor(leaf), name: `${leaf.name}-copy` });
    await assert.rejects(validateLeafPackageAdmission(input), /exact package identity/u);
  });

  test(`${leaf.id}: untracked build output and Core or Assembly imports cannot become edges`, async () => {
    const { input, sources } = fixture(leaf);
    input.productionArtifacts.push(`${leaf.root}/dist/index.js`);
    await assert.rejects(validateLeafPackageAdmission(input), /ungoverned development output/u);
    input.productionArtifacts.pop();
    for (const path of ["packages/core/src/consumer.ts", "packages/assembly/src/consumer.ts"]) {
      input.productionArtifacts.push(path);
      for (const source of [
        `import type { Lease } from "${leaf.name}";\n`,
        `void import(\`${leaf.name}\`);\n`,
      ]) {
        sources.set(path, source);
        await assert.rejects(validateLeafPackageAdmission(input),
          /must not import the leaf package/u);
      }
      sources.set(path, "void import(candidatePath);\n");
      await assert.rejects(validateLeafPackageAdmission(input),
        /unresolved dynamic import/u);
      input.productionArtifacts.pop();
    }
  });

  test(`${leaf.id}: the Core generated output is checked by its own custody gate, not the authored-source reader`, async () => {
    const { input, admitted } = fixture(leaf);
    input.productionArtifacts.push("packages/core/src/composition/generated/stage1.ts");
    assert.deepEqual(await validateLeafPackageAdmission(input), admitted);
  });

  test(`${leaf.id}: the manifest cannot run install hooks, depend on runtime packages or claim publication`, async () => {
    const { input } = fixture(leaf);
    const classChanges = leaf.publication === PUBLIC
      ? [{ private: true }, { publishConfig: undefined }, { repository: undefined },
        { repository: { ...publicRepository(leaf), directory: "packages/core" } },
        { files: ["dist"] }, { main: "./dist/index.js" }]
      : [{ publishConfig: { access: "public" } }, { private: false }];
    for (const change of [
      { scripts: { postinstall: "node install.mjs" } },
      { dependencies: { "@get-modular/core": "workspace:*" } },
      { publishConfig: { access: "public" } },
      { exports: { ".": "./dist/index.js", "./internal": "./dist/internal.js" } },
      { files: ["**"] },
      ...classChanges,
    ]) {
      input.readPackageManifest = async () => ({ ...manifestFor(leaf), ...change });
      await assert.rejects(validateLeafPackageAdmission(input), undefined, JSON.stringify(change));
    }
  });

  test(`${leaf.id}: type-only, runtime and deep imports cannot pierce the package boundary`, async () => {
    const { input, sources, sourcePath } = fixture(leaf);
    for (const edge of [
      'import type { Core } from "@get-modular/core";',
      'import "node:fs";',
      'export type { Secret } from "../../core/src/secret.js";',
      'type Secret = import("@get-modular/assembly").Secret;',
      'void import("./internal.js");',
    ]) {
      sources.set(sourcePath, `${substantiveSource}${edge}\n`);
      await assert.rejects(validateLeafPackageAdmission(input),
        new RegExp(`forbidden|outside ${leaf.id} source|dynamic import`, "u"), edge);
    }
  });

  test(`${leaf.id}: no-op or disconnected command chain cannot satisfy source admission`, async () => {
    const { input } = fixture(leaf);
    for (const [name, command] of Object.entries(leaf.commands)) {
      input.packageJson.scripts[name] = "echo ok";
      await assert.rejects(validateLeafPackageAdmission(input), new RegExp(`non-no-op ${name}`, "u"));
      input.packageJson.scripts[name] = command;
    }
    for (const command of ["check", "check:fast"]) {
      const original = input.packageJson.scripts[command];
      input.packageJson.scripts[command] = `echo pnpm ${leaf.gate}`;
      await assert.rejects(validateLeafPackageAdmission(input),
        new RegExp(`must execute ${leaf.gate}`, "u"));
      input.packageJson.scripts[command] = `echo "prefix && pnpm ${leaf.gate} && suffix"`;
      await assert.rejects(validateLeafPackageAdmission(input),
        new RegExp(`must execute ${leaf.gate}`, "u"));
      input.packageJson.scripts[command] = original;
    }
  });

  if (leaf.publication === PRIVATE_CANDIDATE) test(`${leaf.id}: the row leaves G1 on hold even with no package`, async () => {
    const { input } = fixture(leaf);
    input.productionArtifacts = ["packages/core/package.json"];
    input.sdkGrowthStatus.activation = "active";
    await assert.rejects(validateLeafPackageAdmission(input), /must not promote G1/u);
  });
}
