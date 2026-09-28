import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  LIFECYCLE_DECISION_PATH,
  LIFECYCLE_MANIFEST_PATH,
  validateLifecycleCandidateAdmission,
} from "../architecture/checks/lifecycle-candidate-admission.mjs";

const decision = await readFile(LIFECYCLE_DECISION_PATH);
const registry = await readFile("architecture/decisions/accepted-decisions.json");
const sdkGrowthStatus = JSON.parse(await readFile("architecture/sdk-growth/status.json"));
const sourcePath = "packages/lifecycle-kernel/src/index.ts";
const testPaths = [
  "packages/lifecycle-kernel/tests/kernel.test.mjs",
  "packages/lifecycle-kernel/tests/packed-root.test.mjs",
];
const substantiveSource = "export function createKernel() { return { generation: 1 }; }\n";
const candidateScripts = {
  "lifecycle:build": "node architecture/tooling/build-lifecycle-kernel.mjs",
  "lifecycle:typecheck":
    "node node_modules/typescript/bin/tsc -p packages/lifecycle-kernel/tsconfig.json --noEmit"
    + " && node node_modules/typescript/bin/tsc -p packages/lifecycle-kernel/tsconfig.types.json --noEmit"
    + " && node node_modules/typescript/bin/tsc -p packages/lifecycle-kernel/tsconfig.types.bundler.json --noEmit",
  "lifecycle:test": "node --test packages/lifecycle-kernel/tests/kernel.test.mjs",
  "lifecycle:pack": "node --test packages/lifecycle-kernel/tests/packed-root.test.mjs",
  "lifecycle:check":
    "pnpm lifecycle:build && pnpm lifecycle:typecheck && pnpm lifecycle:test && pnpm lifecycle:pack",
  check: "pnpm lifecycle:check",
  "check:fast": "pnpm lifecycle:check",
};

function fixture() {
  const files = new Map([
    [LIFECYCLE_DECISION_PATH, decision],
    ["architecture/decisions/accepted-decisions.json", registry],
  ]);
  const sources = new Map([[sourcePath, substantiveSource]]);
  const input = {
    productionArtifacts: ["packages/core/package.json", LIFECYCLE_MANIFEST_PATH,
      sourcePath, ...testPaths],
    readBytes: async path => files.get(path),
    readPackageManifest: async () => ({
      name: "@get-modular/lifecycle-kernel", private: true, type: "module",
      exports: { ".": { import: { types: "./dist/index.d.ts", default: "./dist/index.js" },
        default: "./dist/index.js" } },
      files: ["dist", "README.md", "LICENSE"],
    }),
    readProductionSource: async path => sources.get(path),
    packageJson: { scripts: structuredClone(candidateScripts) },
    sdkGrowthStatus: structuredClone(sdkGrowthStatus),
  };
  return { files, sources, input };
}

test("L0 authenticates ADR-0029 while no lifecycle root exists", async () => {
  const { input } = fixture();
  input.productionArtifacts = ["packages/core/package.json"];
  assert.deepEqual(await validateLifecycleCandidateAdmission(input), []);
});

test("the exact decision and registry cannot independently authorize a different policy", async () => {
  const { files, input } = fixture();
  files.set(LIFECYCLE_DECISION_PATH, Buffer.from(decision.toString("utf8") + "\n"));
  await assert.rejects(validateLifecycleCandidateAdmission(input), /exact accepted ADR-0029 bytes/u);
  files.set(LIFECYCLE_DECISION_PATH, decision);
  const changed = JSON.parse(registry);
  changed.decisions.find(entry => entry.id === "ADR-0029").immutableDigest =
    "sha256:" + "0".repeat(64);
  files.set("architecture/decisions/accepted-decisions.json", Buffer.from(JSON.stringify(changed)));
  await assert.rejects(validateLifecycleCandidateAdmission(input), /exact registered ADR-0029/u);
});

test("the candidate root, manifest and executable source are required together", async () => {
  const { input, sources } = fixture();
  assert.deepEqual(await validateLifecycleCandidateAdmission(input),
    [LIFECYCLE_MANIFEST_PATH, sourcePath, ...testPaths]);
  const missingManifest = { ...input, productionArtifacts: [sourcePath] };
  await assert.rejects(validateLifecycleCandidateAdmission(missingManifest), /package root manifest/u);
  const missingSource = { ...input, productionArtifacts: [LIFECYCLE_MANIFEST_PATH] };
  await assert.rejects(validateLifecycleCandidateAdmission(missingSource), /src\/index.ts/u);
  const missingPackTest = { ...input, productionArtifacts: input.productionArtifacts.filter(
    path => path !== testPaths[1],
  ) };
  await assert.rejects(validateLifecycleCandidateAdmission(missingPackTest), /requires a real test/u);
  sources.set(sourcePath, "export {};\n");
  await assert.rejects(validateLifecycleCandidateAdmission(input), /substantive executable source/u);
  sources.set(sourcePath, "export function createKernel() { ; debugger; }\n");
  await assert.rejects(validateLifecycleCandidateAdmission(input), /substantive executable source/u);
  sources.set(sourcePath, "export const createKernel = function () { return {}; };\n");
  assert.deepEqual(await validateLifecycleCandidateAdmission(input),
    [LIFECYCLE_MANIFEST_PATH, sourcePath, ...testPaths]);
  sources.set(sourcePath, "  \n");
  await assert.rejects(validateLifecycleCandidateAdmission(input), /cannot be empty/u);
});

test("unknown, differently named and nested package roots remain rejected", async () => {
  const { input } = fixture();
  input.productionArtifacts.push("packages/lifecycle-copy/src/index.ts");
  await assert.rejects(validateLifecycleCandidateAdmission(input), /unknown or differently named/u);
  input.productionArtifacts.pop();
  input.productionArtifacts.push("packages/lifecycle-kernel/src/nested/package.json");
  await assert.rejects(validateLifecycleCandidateAdmission(input), /nested manifests/u);
  input.productionArtifacts.pop();
  input.readPackageManifest = async () => ({
    name: "@get-modular/lifecycle-copy", private: true, type: "module",
  });
  await assert.rejects(validateLifecycleCandidateAdmission(input), /exact package identity/u);
});

test("untracked build output and Core or Assembly imports cannot become candidate edges", async () => {
  const { input, sources } = fixture();
  input.productionArtifacts.push("packages/lifecycle-kernel/dist/index.js");
  await assert.rejects(validateLifecycleCandidateAdmission(input), /ungoverned development output/u);
  input.productionArtifacts.pop();
  for (const path of ["packages/core/src/consumer.ts", "packages/assembly/src/consumer.ts"]) {
    input.productionArtifacts.push(path);
    for (const source of [
      'import type { Lease } from "@get-modular/lifecycle-kernel";\n',
      'void import(`@get-modular/lifecycle-kernel`);\n',
    ]) {
      sources.set(path, source);
      await assert.rejects(validateLifecycleCandidateAdmission(input),
        /must not import the lifecycle candidate/u);
    }
    sources.set(path, 'void import(candidatePath);\n');
    await assert.rejects(validateLifecycleCandidateAdmission(input),
      /unresolved dynamic import/u);
    input.productionArtifacts.pop();
  }
});

test("candidate manifest cannot run install hooks, depend on runtime packages or claim publication", async () => {
  const { input } = fixture();
  const manifest = {
    name: "@get-modular/lifecycle-kernel", private: true, type: "module",
    exports: { ".": { import: { types: "./dist/index.d.ts", default: "./dist/index.js" },
      default: "./dist/index.js" } },
    files: ["dist", "README.md", "LICENSE"],
  };
  input.readPackageManifest = async () => manifest;
  for (const change of [
    { scripts: { postinstall: "node install.mjs" } },
    { dependencies: { "@get-modular/core": "workspace:*" } },
    { publishConfig: { access: "public" } },
    { exports: { ".": "./dist/index.js", "./internal": "./dist/internal.js" } },
    { files: ["**"] },
    { private: false },
  ]) {
    Object.assign(manifest, change);
    await assert.rejects(validateLifecycleCandidateAdmission(input));
    for (const key of Object.keys(change)) {
      if (key === "private") manifest.private = true;
      else if (key === "exports") manifest.exports = {
        ".": { import: { types: "./dist/index.d.ts", default: "./dist/index.js" },
          default: "./dist/index.js" },
      };
      else if (key === "files") manifest.files = ["dist", "README.md", "LICENSE"];
      else delete manifest[key];
    }
  }
});

test("type-only, runtime and deep imports cannot pierce the candidate boundary", async () => {
  const { input, sources } = fixture();
  for (const edge of [
    'import type { Core } from "@get-modular/core";',
    'import "node:fs";',
    'export type { Secret } from "../../core/src/secret.js";',
    'type Secret = import("@get-modular/assembly").Secret;',
    'void import("./internal.js");',
  ]) {
    sources.set(sourcePath, `${substantiveSource}${edge}\n`);
    await assert.rejects(validateLifecycleCandidateAdmission(input),
      /forbidden|outside lifecycle source|dynamic import/u, edge);
  }
});

test("no-op or disconnected candidate command chain cannot satisfy source admission", async () => {
  const { input } = fixture();
  input.packageJson.scripts["lifecycle:test"] = "echo ok";
  await assert.rejects(validateLifecycleCandidateAdmission(input), /non-no-op lifecycle:test/u);
  input.packageJson.scripts["lifecycle:test"] = candidateScripts["lifecycle:test"];
  for (const command of ["check", "check:fast"]) {
    input.packageJson.scripts[command] = "echo pnpm lifecycle:check";
    await assert.rejects(validateLifecycleCandidateAdmission(input),
      /must execute lifecycle:check/u);
    input.packageJson.scripts[command] = 'echo "prefix && pnpm lifecycle:check && suffix"';
    await assert.rejects(validateLifecycleCandidateAdmission(input),
      /must execute lifecycle:check/u);
    input.packageJson.scripts[command] = candidateScripts[command];
  }
});

test("candidate admission leaves G1 on hold even with no package", async () => {
  const { input } = fixture();
  input.productionArtifacts = ["packages/core/package.json"];
  input.sdkGrowthStatus.activation = "active";
  await assert.rejects(validateLifecycleCandidateAdmission(input), /must not promote G1/u);
});
