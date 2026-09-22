import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { parse, stringify } from "yaml";

const execute = promisify(execFile);
const rootRequire = createRequire(resolve("package.json"));
const manifestPath = rootRequire.resolve("@agent-teams/engineering-foundation/package.json");
const foundationPackage = JSON.parse(await readFile(manifestPath, "utf8"));
assert.equal(typeof foundationPackage.bin?.["agent-teams-foundation"], "string");
const cli = join(dirname(manifestPath), foundationPackage.bin["agent-teams-foundation"]);
const workspace = parse(await readFile("pnpm-workspace.yaml", "utf8"));
const oxlintPackage = JSON.parse(await readFile("node_modules/oxlint/package.json", "utf8"));
const typedPackage = JSON.parse(await readFile("node_modules/oxlint-tsgolint/package.json", "utf8"));
const typescriptPackage = JSON.parse(await readFile("node_modules/typescript/package.json", "utf8"));

async function writeFixtureFile(root, path, contents) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents);
}

async function copyInstalledPackage(root, name, requireFrom = rootRequire) {
  const manifestPath = requireFrom.resolve(`${name}/package.json`);
  await cp(dirname(manifestPath), join(root, "node_modules", name), {
    dereference: true, recursive: true,
  });
  return manifestPath;
}

async function copyQualityToolchain(root) {
  for (const name of ["oxlint", "typescript", "oxlint-tsgolint"]) {
    const manifestPath = await copyInstalledPackage(root, name);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const requireFrom = createRequire(manifestPath);
    // Copy installed native optional dependencies, not a hard-coded Linux carrier.
    let installed = 0;
    for (const nativeName of Object.keys(manifest.optionalDependencies ?? {})) {
      try { requireFrom.resolve(`${nativeName}/package.json`); }
      catch (error) {
        if (error.code === "MODULE_NOT_FOUND") continue;
        throw error;
      }
      await copyInstalledPackage(root, nativeName, requireFrom);
      installed += 1;
    }
    assert.ok(installed > 0, `${name} needs its installed native carrier`);
  }
}

async function createFixture(mutator = () => {}) {
  const root = await mkdtemp(join(tmpdir(), "gm-quality-activation-"));
  try {
  const files = new Map([
    ["package.json", JSON.stringify({
      name: "quality-activation-fixture",
      private: true,
      type: "module",
      scripts: {
        check: "pnpm lint:typed",
        "check:fast": "pnpm quality:coverage:scope",
        "quality:coverage:scope": "agent-teams-foundation quality check --consumer . --scope-only",
        "lint:typed": "agent-teams-foundation quality check --consumer .",
      },
      devDependencies: {
        "@agent-teams/engineering-foundation": "1.5.1",
        oxlint: "1.83.0",
        "oxlint-tsgolint": "7.0.2001",
        typescript: "7.0.2",
      },
    }, null, 2)],
    ["pnpm-workspace.yaml", 'packages:\n  - "packages/*"\n'],
    [".gitignore", "packages/core/src/generated.ts\n"],
    ["foundation.config.yaml", stringify({
      schemaVersion: 2,
      project: { id: "quality-activation-fixture" },
      capabilities: {
        "quality.source-coverage": {
          configPath: "architecture/foundation/quality-source-coverage.yaml",
        },
        "quality.suppression-governance": {
          configPath: "architecture/foundation/suppression-governance.yaml",
        },
      },
    })],
    ["architecture/foundation/quality-source-coverage.yaml", stringify({
      schemaVersion: 1,
      sourcePolicyPath: "architecture/foundation/source-dependencies.yaml",
      suppressionPolicyPath: "architecture/foundation/suppression-governance.yaml",
      featureProfilePath: "architecture/feature-module-standard-profile.json",
      lintConfigPath: ".oxlintrc.json",
      compilerProjects: ["packages/core/tsconfig.json", "packages/assembly/tsconfig.json"],
      scripts: {
        fast: "check:fast",
        full: "check",
        scope: "quality:coverage:scope",
        typed: "lint:typed",
      },
    })],
    ["architecture/foundation/suppression-governance.yaml", stringify({
      schemaVersion: 1,
      governedRoots: ["packages/core/src", "packages/assembly/src"],
      nonWaivableRulePrefixes: [],
      waivers: [],
    })],
    ["architecture/foundation/source-dependencies.yaml", stringify({
      schemaVersion: 3,
      workspace: { kind: "pnpm", manifest: "pnpm-workspace.yaml" },
      packageRoots: ["packages/assembly", "packages/core"],
      rootPackage: true,
      governedRoots: ["packages/assembly/src", "packages/core/src"],
      boundaries: [
        {
          id: "core-source",
          roots: ["packages/core/src"],
          entrypoints: ["packages/core/src/index.ts"],
          allow: { boundaries: [], packages: [], builtins: [], runtimeReferences: [] },
        },
        {
          id: "assembly-source",
          roots: ["packages/assembly/src/index.ts"],
          entrypoints: ["packages/assembly/src/index.ts"],
          allow: { boundaries: [], packages: [], builtins: [], runtimeReferences: [] },
        },
      ],
    })],
    ["architecture/feature-module-standard-profile.json", JSON.stringify({
      schemaVersion: 1,
      authority: { id: "agent-teams.feature-module-standard", version: "v1" },
      scope: {
        workspaceContainers: ["packages"],
        productionRoots: ["packages/core/src", "packages/assembly/src"],
        productionModules: [
          { moduleRoot: "packages/core", sourceRoot: "packages/core/src" },
          { moduleRoot: "packages/assembly", sourceRoot: "packages/assembly/src" },
        ],
      },
      adoption: {
        applicationRoots: [],
        excludedRoots: ["architecture", "docs", "tests"],
        abstractLayout: {
          modules: [
            { moduleRoot: "packages/core", sourceRoot: "packages/core/src", testRoot: "packages/core/tests" },
            { moduleRoot: "packages/assembly", sourceRoot: "packages/assembly/src", testRoot: "packages/assembly/tests" },
          ],
        },
      },
    }, null, 2)],
    [".oxlintrc.json", JSON.stringify({
      extends: [
        "./node_modules/@agent-teams/engineering-foundation/presets/oxlint/type-aware.json",
        "./node_modules/@agent-teams/engineering-foundation/presets/oxlint/maintainability.json",
      ],
      options: {
        respectEslintDisableDirectives: false,
        reportUnusedDisableDirectives: "error",
      },
    }, null, 2)],
    ["packages/core/package.json", JSON.stringify({ name: "@get-modular/core", version: "0.0.0", type: "module" })],
    ["packages/assembly/package.json", JSON.stringify({ name: "@get-modular/assembly", version: "0.0.0", type: "module" })],
    ["packages/core/tsconfig.json", JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
      },
      files: ["src/index.ts", "src/generated.ts"],
    })],
    ["packages/assembly/tsconfig.json", JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
      },
      files: ["src/index.ts"],
    })],
    ["packages/core/src/index.ts", "export const core = 1;\n"],
    ["packages/core/src/generated.ts", "export const generated = 1;\n"],
    ["packages/assembly/src/index.ts", "export const assembly = 1;\n"],
    [
      "node_modules/@agent-teams/engineering-foundation/package.json",
      JSON.stringify({ name: "@agent-teams/engineering-foundation", version: "1.5.1" }),
    ],
    [
      "node_modules/@agent-teams/engineering-foundation/presets/oxlint/base.json",
      await readFile("node_modules/@agent-teams/engineering-foundation/presets/oxlint/base.json", "utf8"),
    ],
    [
      "node_modules/@agent-teams/engineering-foundation/presets/oxlint/type-aware.json",
      await readFile("node_modules/@agent-teams/engineering-foundation/presets/oxlint/type-aware.json", "utf8"),
    ],
    [
      "node_modules/@agent-teams/engineering-foundation/presets/oxlint/node.json",
      await readFile("node_modules/@agent-teams/engineering-foundation/presets/oxlint/node.json", "utf8"),
    ],
    [
      "node_modules/@agent-teams/engineering-foundation/presets/oxlint/maintainability.json",
      await readFile("node_modules/@agent-teams/engineering-foundation/presets/oxlint/maintainability.json", "utf8"),
    ],
  ]);
  await mutator(files);
  for (const [path, contents] of files) await writeFixtureFile(root, path, contents);
  return root;
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

function commandFailureDetails(error) {
  return [error.stderr, error.stdout].filter(Boolean).join("\n") || String(error);
}

async function foundationCheck(root, capability) {
  try {
    const result = await execute(process.execPath, [
      cli,
      "check",
      capability,
      "--consumer",
      root,
      "--format",
      "json",
    ], { timeout: 90_000, maxBuffer: 2_000_000 });
    return JSON.parse(result.stdout);
  } catch (error) {
    assert.ok([1, 2, 3].includes(error.code), commandFailureDetails(error));
    return JSON.parse(error.stdout);
  }
}

async function fullQualityCheck(root) {
  try {
    const result = await execute(process.execPath, [
      cli,
      "quality",
      "check",
      "--consumer",
      root,
      "--format",
      "json",
    ], { timeout: 90_000, maxBuffer: 2_000_000 });
    return JSON.parse(result.stdout);
  } catch (error) {
    assert.ok([1, 2, 3].includes(error.code), commandFailureDetails(error));
    return JSON.parse(error.stdout);
  }
}

function ruleIds(report) {
  assert.equal(report.capabilities.length, 1);
  return report.capabilities[0].diagnostics.map(diagnostic => diagnostic.ruleId);
}

test("activates exact published Foundation quality pins", () => {
  assert.equal(foundationPackage.version, "1.5.1");
  assert.equal(oxlintPackage.version, "1.83.0");
  assert.equal(typedPackage.version, "7.0.2001");
  assert.equal(typescriptPackage.version, "7.0.2");
  assert.equal(workspace.patchedDependencies, undefined);
});

test("Foundation accepts the quality activation route and rejects route drift", async () => {
  const valid = await createFixture();
  const missingRoute = await createFixture(files => {
    const manifest = JSON.parse(files.get("package.json"));
    manifest.scripts["check:fast"] = "pnpm docs:check";
    files.set("package.json", JSON.stringify(manifest, null, 2));
  });
  try {
    const validReport = await foundationCheck(valid, "quality.source-coverage");
    assert.equal(validReport.outcome, "passed", JSON.stringify(validReport));
    assert.ok(ruleIds(await foundationCheck(missingRoute, "quality.source-coverage"))
      .includes("quality.source-coverage.required-route"));
  } finally {
    await rm(valid, { recursive: true, force: true });
    await rm(missingRoute, { recursive: true, force: true });
  }
});

test("Foundation rejects source coverage scope drift", async () => {
  const missingSourceBoundary = await createFixture(files => {
    const policy = parse(files.get("architecture/foundation/suppression-governance.yaml"));
    policy.governedRoots = ["packages/core/src"];
    files.set("architecture/foundation/suppression-governance.yaml", stringify(policy));
  });
  try {
    assert.ok(ruleIds(await foundationCheck(missingSourceBoundary, "quality.source-coverage"))
      .includes("quality.source-coverage.suppression-coverage"));
  } finally {
    await rm(missingSourceBoundary, { recursive: true, force: true });
  }
});

test("Foundation rejects weakened protected typed lint configuration", async () => {
  const disabled = await createFixture(files => {
    const config = JSON.parse(files.get(".oxlintrc.json"));
    config.rules = { "typescript/no-floating-promises": "off" };
    files.set(".oxlintrc.json", JSON.stringify(config, null, 2));
  });
  try {
    const report = await foundationCheck(disabled, "quality.source-coverage");
    assert.ok(ruleIds(report).includes("quality.source-coverage.protected-setting"),
      JSON.stringify(report));
  } finally {
    await rm(disabled, { recursive: true, force: true });
  }
});

test("Foundation selects gitignored generated production sources", async () => {
  const generated = await createFixture();
  try {
    await copyQualityToolchain(generated);
    const report = await fullQualityCheck(generated);
    assert.equal(report.outcome, "passed", JSON.stringify(report));
  } finally {
    await rm(generated, { recursive: true, force: true });
  }
});

test("Foundation rejects a real typed lint violation through the public route", async () => {
  const floatingPromise = await createFixture(files => {
    files.set("packages/core/src/index.ts", [
      "async function prepare(): Promise<void> {}",
      "prepare();",
      "export const core = 1;",
      "",
    ].join("\n"));
  });
  try {
    await copyQualityToolchain(floatingPromise);
    const report = await fullQualityCheck(floatingPromise);
    assert.equal(report.outcome, "violations", JSON.stringify(report));
    assert.ok(report.capabilities[0].diagnostics.some(diagnostic =>
      diagnostic.ruleId === "quality.source-coverage.lint-violation" &&
      JSON.stringify(diagnostic).includes("packages/core/src/index.ts") &&
      diagnostic.evidence.some(evidence =>
        evidence.kind === "tool-rule" &&
        evidence.value === "typescript(no-floating-promises)",
      )), JSON.stringify(report));
    await writeFixtureFile(floatingPromise, "packages/core/src/index.ts",
      "async function prepare(): Promise<void> {}\nawait prepare();\nexport const core = 1;\n");
    const corrected = await fullQualityCheck(floatingPromise);
    assert.equal(corrected.outcome, "passed", JSON.stringify(corrected));
  } finally {
    await rm(floatingPromise, { recursive: true, force: true });
  }
});

test("Foundation rejects hidden production suppressions", async () => {
  const suppressed = await createFixture(files => {
    files.set("packages/core/src/index.ts",
      "// eslint-disable-next-line no-alert\nexport const core = 1;\n");
  });
  try {
    assert.ok(ruleIds(await foundationCheck(suppressed, "quality.suppression-governance"))
      .includes("quality.suppression-governance.legacy-suppression"));
  } finally {
    await rm(suppressed, { recursive: true, force: true });
  }
});
