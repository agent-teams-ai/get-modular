import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readPackageArchive } from "../qualification/support/package-archive.mjs";
import { spawnSync } from "node:child_process";
import { access, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CORE_DEVELOPMENT_DEPENDENCIES } from "../../architecture/checks/assembly-admission.mjs";
import { testAssemblyTypes } from "../../architecture/tooling/test-assembly-types.mjs";
import { largeLiteralSource } from "./type-scale.mjs";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixtures = join(workspace, "tests/assembly");

function assertAssemblyPackedManifest(packed, source) {
  assert.deepEqual(packed, { ...source, dependencies: { "@get-modular/core": "0.1.0" } },
    "Assembly packed manifest must equal source with only the exact Core dependency rewritten");
}

test("retained Assembly manifest rejects metadata drift beyond dependency rewriting", async () => {
  const source = JSON.parse(await readFile(join(workspace, "packages/assembly/package.json"), "utf8"));
  const packed = { ...source, dependencies: { "@get-modular/core": "0.1.0" } };
  assertAssemblyPackedManifest(packed, source);
  for (const change of [
    { repository: undefined }, { repository: { ...source.repository, directory: "wrong" } },
    { engines: { node: ">=18" } }, { files: ["dist"] }, { private: true },
    { dependencies: { "@get-modular/core": "workspace:*" } },
    { dependencies: { "@get-modular/core": "^0.1.0" } },
    { publishConfig: { access: "restricted" } }, { extra: true },
  ]) assert.throws(() => assertAssemblyPackedManifest({ ...packed, ...change }, source));
});

async function packageManagerCli(name) {
  const node = await realpath(process.execPath);
  const candidates = name === "npm" ? [
    join(dirname(node), "node_modules/npm/bin/npm-cli.js"),
    join(dirname(dirname(node)), "lib/node_modules/npm/bin/npm-cli.js"),
  ] : [];
  const inherited = process.env.npm_execpath;
  if (inherited && (name === "pnpm" ? /pnpm\.(?:c?js|mjs)$/u : /npm-cli\.js$/u).test(inherited)) {
    candidates.unshift(inherited);
  }
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    try {
      const target = await realpath(join(directory, name));
      if (/\.(?:c?js|mjs)$/u.test(target)) candidates.push(target);
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    }
  }
  for (const candidate of candidates) {
    try { await access(candidate); return await realpath(candidate); } catch {}
  }
  throw new Error(`Pinned ${name} JavaScript CLI is required; no shell/download fallback`);
}

function command(executable, args, cwd, environment = {}) {
  const result = spawnSync(executable, args, {
    cwd, encoding: "utf8", timeout: 180000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, ...environment, NODE_PATH: "", NODE_OPTIONS: "", npm_config_ignore_scripts: "true" },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${executable} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    assert.equal(entry.isSymbolicLink(), false, path);
    if (entry.isDirectory()) files.push(...(await filesBelow(path)).map((file) => `${entry.name}/${file}`));
    else { assert.equal(entry.isFile(), true, path); files.push(entry.name); }
  }
  return files.sort();
}
async function installedPackage(consumer, name) {
  const directory = join(consumer, "node_modules", name);
  assert.equal((await lstat(directory)).isSymbolicLink(), false);
  assert.equal(await realpath(directory), directory);
  const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  assert.equal(manifest.name, name);
  assert.equal(manifest.type, "module");
  assert.equal(JSON.stringify(manifest.exports), JSON.stringify({
    ".": { import: { types: "./dist/index.d.ts", default: "./dist/index.js" }, default: "./dist/index.js" },
  }));
  for (const field of ["main", "module", "types", "typings", "typesVersions", "browser"]) {
    assert.equal(Object.hasOwn(manifest, field), false, `${name}: ${field}`);
  }
  for (const script of ["preinstall", "install", "postinstall", "prepare", "prepack", "postpack", "prepublish", "prepublishOnly", "publish", "postpublish"]) {
    assert.equal(Object.hasOwn(manifest.scripts ?? {}, script), false, `${name}: ${script}`);
  }
  const inventory = await filesBelow(directory);
  for (const file of inventory) {
    assert.ok(["package.json", "README.md", "LICENSE", "CHANGELOG.md"].includes(file)
      || manifest.files.includes(file)
      || (manifest.files.includes("dist") && /^dist\/(?:[^/]+\/)*[^/]+(?:\.js|\.d\.ts)$/u.test(file)),
    `${name}: unsupported installed file ${file}`);
  }
  for (const file of ["dist/index.js", "dist/index.d.ts"]) assert.ok(inventory.includes(file));
  return manifest;
}

test("disposable packed consumer checks closed roots, synthetic wiring and both TypeScript compilers", { timeout: 900000 }, async t => {
  const temporary = await realpath(await mkdtemp(join(tmpdir(), "get-modular-assembly-consumer-")));
  try {
    const archives = join(temporary, "archives");
    const consumer = join(temporary, "consumer");
    await mkdir(archives);
    await mkdir(consumer);
    const archivePaths = {};
    const retained = process.env.GET_MODULAR_ASSEMBLY_ARCHIVE;
    const publishedCore = process.env.GET_MODULAR_PUBLISHED_CORE_ARCHIVE;
    assert.equal(Boolean(retained), Boolean(publishedCore), "supply both retained archives or neither");
    const archiveBytes = new Map();
    const pnpm = await packageManagerCli("pnpm"), npm = await packageManagerCli("npm");
    for (const name of ["core", "assembly"]) {
      const directory = join(workspace, "packages", name);
      const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
      if (!retained) command(process.execPath, [pnpm, "pack", "--pack-destination", archives], directory);
      const archive = retained ? await realpath(name === "assembly" ? retained : publishedCore)
        : join(archives, `${manifest.name.replace("@", "").replace("/", "-")}-${manifest.version}.tgz`);
      assert.equal((await lstat(archive)).isFile(), true);
      const bytes = await readFile(archive);
      const identity = {
        sha256: createHash("sha256").update(bytes).digest("hex"),
        integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
      };
      if (retained) {
        const prefix = name === "assembly" ? "GET_MODULAR_ASSEMBLY" : "GET_MODULAR_PUBLISHED_CORE";
        assert.equal(identity.sha256, process.env[`${prefix}_SHA256`], `${name}: retained SHA-256`);
        assert.equal(identity.integrity, process.env[`${prefix}_INTEGRITY`], `${name}: retained integrity`);
      }
      const audited = readPackageArchive(bytes, identity);
      const packedManifest = JSON.parse(audited.files.get("package.json"));
      assert.equal(packedManifest.name, manifest.name);
      assert.equal(packedManifest.version, "0.1.0");
      if (name === "assembly") assertAssemblyPackedManifest(packedManifest, manifest);
      archiveBytes.set(archive, { bytes, files: audited.files });
      t.diagnostic(JSON.stringify({ package: manifest.name, archive, ...identity,
        inventory: [...audited.files.keys()].sort(), retained: Boolean(retained) }));
      archivePaths[manifest.name] = archive;
    }
    assert.equal((await readdir(archives)).length, retained ? 0 : 2);
    await writeFile(join(consumer, "package.json"), JSON.stringify({
      name: "assembly-disposable-consumer", private: true, type: "module",
      dependencies: Object.fromEntries(Object.entries(archivePaths).map(([name, archive]) => [name, `file:${archive}`])),
    }));
    command(process.execPath, [npm, "install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false"], consumer, {
      npm_config_cache: join(temporary, "npm-cache"),
    });
    assert.deepEqual((await readdir(join(consumer, "node_modules"))).filter((name) => name !== ".package-lock.json").sort(), ["@get-modular"]);
    assert.deepEqual((await readdir(join(consumer, "node_modules/@get-modular"))).sort(), ["assembly", "core"]);
    const core = await installedPackage(consumer, "@get-modular/core");
    const assembly = await installedPackage(consumer, "@get-modular/assembly");
    for (const [name, archive] of Object.entries(archivePaths)) {
      const { bytes, files } = archiveBytes.get(archive);
      assert.deepEqual(await readFile(archive), bytes, `${name}: archive unchanged after install`);
      const installed = join(consumer, "node_modules", name);
      assert.deepEqual(await filesBelow(installed), [...files.keys()].sort());
      for (const [path, expected] of files) assert.deepEqual(await readFile(join(installed, path)), expected);
    }
    assert.equal(Object.hasOwn(assembly, "private"), false);
    assert.deepEqual(assembly.publishConfig, { access: "public", registry: "https://registry.npmjs.org/" });
    assert.equal(core.version, "0.1.0");
    assert.equal(assembly.version, "0.1.0");
    assert.deepEqual(core.dependencies ?? {}, {});
    assert.deepEqual(assembly.dependencies, { "@get-modular/core": core.version });
    assert.deepEqual(Object.keys(core.devDependencies ?? {}).sort(),
      Object.keys(CORE_DEVELOPMENT_DEPENDENCIES).sort());
    for (const specifier of Object.values(core.devDependencies ?? {})) {
      assert.equal(typeof specifier, "string");
      assert.notEqual(specifier, "");
      assert.equal(specifier.includes("workspace:"), false);
      assert.equal(specifier.startsWith("file:"), false);
    }
    assert.deepEqual(assembly.devDependencies ?? {}, {});
    for (const manifest of [core, assembly]) {
      for (const field of ["optionalDependencies", "peerDependencies"]) assert.deepEqual(manifest[field] ?? {}, {});
    }
    for (const file of ["fixture.mjs", "runtime.test.mjs", "preparation.test.mjs", "packed-consumer.mjs"]) {
      await writeFile(join(consumer, file), await readFile(join(fixtures, file)));
    }
    const secondConsumer = join(temporary, "consumer-copy");
    await mkdir(secondConsumer);
    await writeFile(join(secondConsumer, "package.json"), await readFile(join(consumer, "package.json")));
    command(process.execPath, [npm, "install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false"], secondConsumer, {
      npm_config_cache: join(temporary, "npm-cache"),
    });
    for (const name of ["@get-modular/core", "@get-modular/assembly"]) {
      assert.deepEqual(await installedPackage(secondConsumer, name), await installedPackage(consumer, name));
      for (const [path, expected] of archiveBytes.get(archivePaths[name]).files) {
        assert.deepEqual(await readFile(join(secondConsumer, "node_modules", name, path)), expected);
      }
    }
    for (const file of ["package-copy-consumer.mjs", "mixed-runtime.mjs"]) {
      await writeFile(join(consumer, file), await readFile(join(fixtures, file)));
    }
    const runtimeChecks = [];
    runtimeChecks.push(command(process.execPath, ["package-copy-consumer.mjs", secondConsumer], consumer).trim());
    command(process.execPath, ["packed-consumer.mjs"], consumer);
    command(process.execPath, ["--conditions=browser", "--conditions=development", "packed-consumer.mjs"], consumer);
    command(process.execPath, ["--test", "runtime.test.mjs", "preparation.test.mjs"], consumer);
    await mkdir(join(consumer, "tests"));
    for (const file of ["types.ts", "types-positive.ts", "mixed-graph.ts"]) await writeFile(join(consumer, "tests", file), await readFile(join(fixtures, file)));
    await writeFile(join(consumer, "tests/type-scale.ts"), largeLiteralSource());
    const closedSpecifiers = ["@get-modular/core", "@get-modular/assembly"].flatMap((name) =>
      ["dist/index.js", "src/index.js", "package.json", "unknown"].map((subpath) => `${name}/${subpath}`));
    await writeFile(join(consumer, "tests/closed-imports.ts"), closedSpecifiers.map((specifier, index) =>
      `import { hidden as hidden${index} } from ${JSON.stringify(specifier)}; void hidden${index};`).join("\n"));
    const config = { compilerOptions: {
      target: "ES2022", lib: ["ES2023", "DOM"], strict: true, noEmit: true,
      skipLibCheck: false, resolveJsonModule: true, types: [], isolatedDeclarations: false, erasableSyntaxOnly: false,
    }, files: ["tests/types.ts", "tests/types-positive.ts", "tests/type-scale.ts", "tests/mixed-graph.ts"] };
    const project = join(consumer, "tsconfig.types.json");
    await writeFile(project, JSON.stringify(config));
    const runtimeProject = join(consumer, "tsconfig.runtime.json");
    await writeFile(runtimeProject, JSON.stringify({ extends: "./tsconfig.types.json",
      compilerOptions: { rootDir: "tests", noEmit: false, declaration: false }, files: ["tests/types-positive.ts", "tests/mixed-graph.ts"] }));
    const negativeProject = join(consumer, "tsconfig.negative.json");
    await writeFile(negativeProject, JSON.stringify({
      extends: "./tsconfig.types.json", files: ["tests/closed-imports.ts"],
    }));
    const observations = testAssemblyTypes({ directory: consumer, project, runtimeProject, negativeProject });
    for (const { compilerName, resolution } of observations) {
      runtimeChecks.push(command(process.execPath, ["mixed-runtime.mjs",
        join(consumer, "emitted", `${compilerName}-${resolution}`, "mixed-graph.js")], consumer).trim());
    }
    assert.equal(observations.length, 4);
    assert.deepEqual(runtimeChecks, ["package-copy:passed", ...Array(4).fill("mixed-runtime:passed")],
      "packed runtime runner completion");
    for (const [archive, { bytes }] of archiveBytes) assert.deepEqual(await readFile(archive), bytes);
    t.diagnostic(JSON.stringify({ consumerChecks: "passed", compilers: observations,
      retained: Boolean(retained), registryOriginAuthenticatedByHarness: false }));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
