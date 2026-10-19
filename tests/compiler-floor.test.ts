import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { assertCompilerFloor, assertFoundationCompilerFloor, CompilerFloorError } from "../architecture/checks/compiler-floor.ts";

const repository = resolve(import.meta.dirname, "..");
const guard = "architecture/checks/compiler-floor.ts";
const admission = "tests/qualification/sdk-growth-admission.mjs";

interface FixturePaths {
  readonly current: string;
  readonly minimum: string;
  readonly foundation: string;
  readonly extractor: string;
  readonly foundationPackage: string;
  readonly extractorPackage: string;
  readonly native: string;
  readonly model: string;
  readonly tsdoc: string;
}
type MetadataDelta = Readonly<Record<string, unknown>>;
type RejectionCase = readonly [string, keyof FixturePaths, MetadataDelta, string, string];

async function put(root: string, path: string, value: unknown) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), typeof value === "string" ? value : JSON.stringify(value));
}

async function fixture(body: (root: string, paths: FixturePaths) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "gm-compiler-floor-")));
  const foundation = "node_modules/@agent-teams/engineering-foundation";
  const extractor = `${foundation}/node_modules/@microsoft/api-extractor`;
  const paths = {
    current: "node_modules/typescript/package.json",
    minimum: "node_modules/typescript-minimum/package.json",
    foundation: `${foundation}/node_modules/typescript/package.json`,
    extractor: `${extractor}/node_modules/typescript/package.json`,
    foundationPackage: `${foundation}/package.json`,
    extractorPackage: `${extractor}/package.json`,
    native: `${foundation}/node_modules/typescript/node_modules/@typescript/typescript-${process.platform}-${process.arch}/package.json`,
    model: `${foundation}/node_modules/@microsoft/api-extractor-model/package.json`,
    tsdoc: `${foundation}/node_modules/@microsoft/tsdoc/package.json`,
  };
  try {
    await put(root, "package.json", { name: "fixture", private: true, type: "module" });
    for (const path of [paths.current, paths.minimum, paths.foundation, paths.extractor]) {
      await put(root, path, { name: "typescript", version: "7.0.2", main: "index.cjs" });
    }
    await put(root, paths.foundationPackage, {
      name: "@agent-teams/engineering-foundation", version: "1.7.4", main: "index.cjs",
      dependencies: { "@microsoft/api-extractor": "7.58.12" },
    });
    await put(root, paths.extractorPackage, {
      name: "@microsoft/api-extractor", version: "7.58.12", main: "index.cjs",
      dependencies: { typescript: "7.0.2" },
    });
    // These are inert metadata fixtures. Loading any package implementation is
    // a distinct failure, including when all manifest versions satisfy the floor.
    for (const path of [paths.current, paths.minimum, paths.foundation, paths.extractor, paths.foundationPackage, paths.extractorPackage]) {
      await put(root, `${dirname(path)}/index.cjs`, "throw new Error('PACKAGE_IMPLEMENTATION_MUST_NOT_LOAD');\n");
    }
    await body(root, paths);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function change(root: string, path: string, delta: MetadataDelta) {
  const value = JSON.parse(await readFile(join(root, path), "utf8")) as Record<string, unknown>;
  await put(root, path, { ...value, ...delta });
}

async function nativeFixture(root: string, paths: FixturePaths) {
  const compiler = dirname(paths.foundation);
  await change(root, paths.foundationPackage, { dependencies: {
    typescript: "7.0.2", "@microsoft/api-extractor-model": "7.33.10", "@microsoft/tsdoc": "0.16.0",
  } });
  await change(root, paths.foundation, { optionalDependencies: {
    [`@typescript/typescript-${process.platform}-${process.arch}`]: "7.0.2",
  } });
  await put(root, paths.native, { name: `@typescript/typescript-${process.platform}-${process.arch}`, version: "7.0.2" });
  await put(root, paths.model, { name: "@microsoft/api-extractor-model", version: "7.33.10" });
  await put(root, paths.tsdoc, { name: "@microsoft/tsdoc", version: "0.16.0" });
  for (const path of [`${compiler}/unstable/sync.js`, `${compiler}/unstable/ast.js`]) {
    await put(root, path, "throw new Error('PACKAGE_IMPLEMENTATION_MUST_NOT_LOAD');\n");
  }
}

function rejects(root: string, role: string, reason: string) {
  assert.throws(() => assertCompilerFloor(root), error => {
    assert.ok(error instanceof CompilerFloorError);
    assert.equal(error.diagnostic.code, "TYPESCRIPT_COMPILER_FLOOR_BLOCKED");
    assert.equal(error.diagnostic.outcome, "blocked");
    assert.equal(error.diagnostic.role, role);
    assert.equal(error.diagnostic.reason, reason);
    return true;
  });
}

test("compiler floor inspects each resolved owner without loading package implementations", async () => {
  await fixture(async (root, paths) => {
    await nativeFixture(root, paths);
    const report = assertCompilerFloor(root);
    assert.equal(report.outcome, "passed");
    assert.deepEqual(report.compilers.map(row => row.role), [
      "repository.current", "repository.minimum", "foundation.compiler", "foundation.native.compiler",
    ]);
    assert.ok(report.compilers.every(row => row.version === "7.0.2"));
    assert.equal(report.compilers.at(-1)!.manifestPath, join(root, paths.native));
    await change(root, paths.current, { version: "7.1.0" });
    assert.equal(assertCompilerFloor(root).compilers[0].version, "7.1.0");
  });
});

test("minimum and current may resolve to the same exact compiler manifest", async () => {
  await fixture(async (root, paths) => {
    await nativeFixture(root, paths);
    await rm(join(root, dirname(paths.minimum)), { recursive: true });
    await symlink(join(root, dirname(paths.current)), join(root, dirname(paths.minimum)), "junction");
    const [current, minimum] = assertCompilerFloor(root).compilers;
    assert.equal(current.manifestPath, minimum.manifestPath);
    assert.equal(current.version, minimum.version);
  });
});

test("an installed SDK subject checks its own Foundation closure without repository compiler aliases", async () => {
  await fixture(async (root, paths) => {
    await nativeFixture(root, paths);
    await rm(join(root, "node_modules/typescript"), { recursive: true });
    await rm(join(root, "node_modules/typescript-minimum"), { recursive: true });
    const report = assertFoundationCompilerFloor(root);
    assert.equal(report.outcome, "passed");
    assert.equal(report.extractorVersion, "typescript-native/7.0.2");
    assert.deepEqual(report.compilers.map(row => row.role), ["foundation.compiler", "foundation.native.compiler"]);
    await change(root, paths.foundation, { version: "5.9.3" });
    assert.throws(() => assertFoundationCompilerFloor(root), error => {
      assert.ok(error instanceof CompilerFloorError);
      assert.equal(error.diagnostic.role, "foundation.compiler");
      assert.equal(error.diagnostic.reason, "compiler-below-floor");
      return true;
    });
  });
});

test("native compiler/model closure rejects mixed, aliased, stale and incomplete metadata", async context => {
  const cases: readonly RejectionCase[] = [
    ["native platform mismatch", "native", { version: "7.1.0" }, "foundation.native.compiler", "native-compiler-pin-mismatch"],
    ["native platform alias", "native", { name: "typescript" }, "foundation.native.compiler", "package-identity-invalid"],
    ["compiler alias", "foundationPackage", { dependencies: { typescript: "npm:typescript@7.0.2" } }, "foundation", "dependency-pin-mismatch"],
    ["model alias", "model", { name: "other" }, "foundation.api-model", "package-identity-invalid"],
    ["overridden model", "model", { version: "7.34.0" }, "foundation", "dependency-pin-mismatch"],
    ["mixed model compiler", "model", { dependencies: { typescript: "5.9.3" } }, "foundation.api-model", "mixed-model-compiler-dependency"],
  ];
  for (const [label, key, delta, role, reason] of cases) {
    await context.test(label, async () => fixture(async (root, paths) => {
      await nativeFixture(root, paths);
      await change(root, paths[key], delta);
      rejects(root, role, reason);
    }));
  }
  await context.test("missing native API", async () => fixture(async (root, paths) => {
    await nativeFixture(root, paths);
    await rm(join(root, dirname(paths.foundation), "unstable/ast.js"));
    rejects(root, "foundation.compiler", "native-compiler-api-unavailable");
  }));
  await context.test("floor-compatible legacy wrapper is still refused", async () => fixture(async root => {
    rejects(root, "foundation.api-extractor", "legacy-extractor-dependency");
  }));
});

test("every compiler ownership path rejects below-floor metadata before execution", async context => {
  for (const [key, role] of [
    ["current", "repository.current"], ["minimum", "repository.minimum"],
    ["foundation", "foundation.compiler"], ["extractor", "foundation.api-extractor.compiler"],
  ] as const) {
    await context.test(role, async () => fixture(async (root, paths) => {
      await change(root, paths[key], { version: "5.9.3" });
      rejects(root, role, "compiler-below-floor");
    }));
  }
});

test("invalid identity, unstable versions, missing files and dependency overrides fail closed", async context => {
  const cases: readonly RejectionCase[] = [
    ["wrong compiler", "extractor", { name: "other" }, "foundation.api-extractor.compiler", "compiler-identity-invalid"],
    ["prerelease", "current", { version: "7.0.2-rc.1" }, "repository.current", "compiler-identity-invalid"],
    ["malformed version", "minimum", { version: "7.00.2" }, "repository.minimum", "compiler-identity-invalid"],
    ["wrong Foundation", "foundationPackage", { name: "other" }, "foundation", "package-identity-invalid"],
    ["wrong extractor", "extractorPackage", { name: "other" }, "foundation.api-extractor", "package-identity-invalid"],
    ["overridden Foundation compiler", "foundationPackage", { dependencies: { "@microsoft/api-extractor": "7.58.12", typescript: "5.9.3" } }, "foundation", "dependency-pin-mismatch"],
    ["overridden extractor", "extractorPackage", { version: "7.59.4" }, "foundation", "dependency-pin-mismatch"],
    ["overridden compiler", "extractor", { version: "7.1.0" }, "foundation.api-extractor", "dependency-pin-mismatch"],
  ];
  for (const [label, key, delta, role, reason] of cases) {
    await context.test(label, async () => fixture(async (root, paths) => {
      await change(root, paths[key], delta);
      rejects(root, role, reason);
    }));
  }
  await context.test("missing compiler", async () => fixture(async (root, paths) => {
    await rm(join(root, paths.minimum));
    rejects(root, "repository.minimum", "compiler-manifest-unavailable");
  }));
  await context.test("missing Foundation", async () => fixture(async (root, paths) => {
    await rm(join(root, paths.foundationPackage));
    rejects(root, "foundation", "package-manifest-unavailable");
  }));
});

test("CLI and direct SDK admission stop before loading the incompatible extractor", async () => {
  await fixture(async (root, paths) => {
    await nativeFixture(root, paths);
    const registry = "tests/qualification/sdk-growth-registry-consumer.ts";
    const publicImport = "tests/qualification/sdk-growth-public-import.ts";
    for (const path of [guard, "architecture/checks/node-version.mjs", admission, registry, publicImport,
      "tests/qualification/support/npm-cli.mjs", "tests/qualification/sdk-growth-failure-retention.ts",
      "tests/qualification/sdk-growth-synthetic-predecessor.ts"]) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await cp(join(repository, path), join(root, path));
    }
    const compatible = spawnSync(process.execPath, [join(root, guard)], { cwd: root, encoding: "utf8", timeout: 10_000 });
    assert.equal(compatible.error, undefined);
    assert.equal(compatible.status, 0, compatible.stderr);
    assert.equal(JSON.parse(compatible.stdout).outcome, "passed");
    await change(root, paths.foundationPackage, { dependencies: { "@microsoft/api-extractor": "7.58.12" } });
    await change(root, paths.extractor, { version: "5.9.3" });
    for (const path of [guard, admission, registry, publicImport]) {
      const result = spawnSync(process.execPath, [join(root, path)], { cwd: root, encoding: "utf8", timeout: 10_000 });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /TYPESCRIPT_COMPILER_FLOOR_BLOCKED/u);
      assert.match(result.stderr, /foundation\.api-extractor\.compiler/u);
      assert.match(result.stderr, /5\.9\.3/u);
      assert.doesNotMatch(result.stderr, /PACKAGE_IMPLEMENTATION_MUST_NOT_LOAD|ERR_MODULE_NOT_FOUND/u);
    }
  });
});

test("Foundation CLI, mandatory runner and SDK scripts retain their commands after the blocking preflight", async () => {
  const { scripts } = JSON.parse(await readFile(join(repository, "package.json"), "utf8")) as { readonly scripts: Readonly<Record<string, string>> };
  for (const [name, next] of [
    ["foundation:check", "pnpm foundation:migration:typecheck && pnpm foundation:migration:test && node architecture/checks/native-public-api-migration.ts"],
    ["check:changed", "agent-teams-foundation agent-workflow changed --consumer ."],
    ["ownership:checkpoint:test", "node --test tests/ownership-checkpoint.test.mjs"],
    ["foundation:assert-dev-only", "agent-teams-foundation assert-dev-only"],
    ["foundation:assert-registry", "agent-teams-foundation assert-registry"],
    ["foundation:status", "agent-teams-foundation status"],
    ["quality:coverage:scope", "agent-teams-foundation quality check --consumer . --scope-only"],
    ["lint:typed", "agent-teams-foundation quality check --consumer ."],
    ["quality:critical:test", "node architecture/checks/required-quality-tests.mjs"],
    ["sdk-growth:check", "pnpm sdk-growth:typecheck && node architecture/checks/sdk-growth.mjs"],
    ["sdk-growth:test", "node --test tests/sdk-growth.test.mjs"],
    ["sdk-growth:admission", "pnpm sdk-growth:typecheck && node tests/qualification/sdk-growth-admission.mjs"],
    ["sdk-growth:registry", "pnpm sdk-growth:typecheck && node tests/qualification/sdk-growth-registry-consumer.ts"],
  ] as const) {
    assert.ok(scripts[name]?.startsWith(`node ${guard} && ${next}`), name);
  }
  assert.equal(scripts["precheck:changed"], "pnpm runtime:preflight");
  assert.ok(scripts["architecture:feature-module-profile:test"]?.includes("tests/compiler-floor.test.ts"));
});
