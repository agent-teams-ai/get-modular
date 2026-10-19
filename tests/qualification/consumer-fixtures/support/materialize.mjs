import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const require = createRequire(join(workspace, "package.json"));
const packageNames = ["core", "assembly", "resources", "conformance"];
const projects = ["tsconfig.types.json", "tsconfig.runtime.json", "tsconfig.negative.json"];

export async function treeIdentity(directory) {
  const digest = createHash("sha256");
  let files = 0;
  let bytes = 0;
  async function visit(relative = "") {
    const entries = await readdir(join(directory, relative), { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(name);
      else {
        assert.ok(entry.isFile(), `fixture.materialize.non-file: ${name}`);
        const contents = await readFile(join(directory, name));
        digest.update(name).update("\0").update(contents).update("\0");
        files += 1;
        bytes += contents.byteLength;
      }
    }
  }
  await visit();
  return { sha256: digest.digest("hex"), files, bytes };
}

export async function fixtureCompiler(name) {
  const manifestPath = require.resolve(`${name}/package.json`);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(manifest.name, "typescript");
  return { name, version: manifest.version, cli: join(dirname(manifestPath), "bin/tsc") };
}

export function invokeFixtureNode(args, directory, label, timeout = 180000) {
  const result = spawnSync(process.execPath, args, {
    cwd: directory, encoding: "utf8", timeout, killSignal: "SIGKILL", maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, NODE_PATH: "", NODE_OPTIONS: "", NODE_TEST_CONTEXT: undefined },
  });
  if (result.error) throw result.error;
  assert.equal(result.signal, null, `${label}: terminated by ${result.signal}`);
  return result;
}

export async function copyReadyPackages(consumer) {
  const packageOutputs = {};
  for (const name of packageNames) {
    const source = join(workspace, "packages", name);
    const installed = join(consumer, "node_modules/@get-modular", name);
    try {
      await readFile(join(source, "dist/index.js"));
      await readFile(join(source, "dist/index.d.ts"));
    } catch (cause) {
      throw new Error(`fixture.materialize.missing-output: ${name}; prepare Assembly, resources and conformance`, { cause });
    }
    await mkdir(installed, { recursive: true });
    await cp(join(source, "package.json"), join(installed, "package.json"));
    await cp(join(source, "dist"), join(installed, "dist"), { recursive: true });
    const manifest = JSON.parse(await readFile(join(installed, "package.json"), "utf8"));
    packageOutputs[name] = { version: manifest.version, ...await treeIdentity(installed) };
  }
  return packageOutputs;
}

export async function withSemanticConsumer(body) {
  const temporary = await mkdtemp(join(tmpdir(), "gm-consumer-fixture-"));
  try {
    const consumer = join(temporary, "consumer");
    const directory = join(consumer, "semantic");
    const packageOutputs = await copyReadyPackages(consumer);
    await writeFile(join(consumer, "package.json"), '{"private":true,"type":"module"}\n');
    await cp(join(workspace, "tests/qualification/consumer-fixtures/semantic"), directory, { recursive: true });
    const sourceTree = await treeIdentity(directory);
    const nodeManifest = require.resolve("@types/node/package.json");
    const nodeTypes = {
      version: JSON.parse(await readFile(nodeManifest, "utf8")).version,
      typeRoots: dirname(dirname(nodeManifest)),
    };
    for (const name of projects) {
      const path = join(directory, name);
      const config = JSON.parse(await readFile(path, "utf8"));
      assert.equal(Object.hasOwn(config, "extends"), false, name);
      config.compilerOptions.typeRoots = [nodeTypes.typeRoots];
      await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
    }
    const lockfile = createHash("sha256")
      .update(await readFile(join(workspace, "pnpm-lock.yaml"))).digest("hex");
    return await body({ directory, consumer, evidence: {
      node: process.version, sourceTree, packageOutputs, nodeTypes, lockfile,
    } });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function withRecoveryConsumer(body) {
  return withSemanticConsumer(async ({ consumer, evidence }) => {
    const directory = join(consumer, "recovery");
    await cp(join(workspace, "tests/qualification/consumer-fixtures/recovery"), directory, { recursive: true });
    const recoverySourceTree = await treeIdentity(directory);
    const path = join(directory, "tsconfig.runtime.json");
    const config = JSON.parse(await readFile(path, "utf8"));
    assert.equal(Object.hasOwn(config, "extends"), false);
    config.compilerOptions.typeRoots = [evidence.nodeTypes.typeRoots];
    await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
    return body({ directory, consumer, evidence: { ...evidence, recoverySourceTree } });
  });
}
