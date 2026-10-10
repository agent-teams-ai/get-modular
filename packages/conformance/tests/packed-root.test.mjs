import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspace = resolve(packageRoot, "../..");
const require = createRequire(join(workspace, "package.json"));
const PEERS = ["assembly", "core", "resources"];

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `${command}: ${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
}

async function pinnedPnpmCli() {
  const candidates = [];
  if (process.env.npm_execpath && /pnpm\.(?:c?js|mjs)$/u.test(process.env.npm_execpath)) {
    candidates.push(process.env.npm_execpath);
  }
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    try {
      const target = await realpath(join(directory, "pnpm"));
      if (/\.(?:c?js|mjs)$/u.test(target)) candidates.push(target);
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    }
  }
  for (const candidate of candidates) {
    try { await access(candidate); return await realpath(candidate); } catch {}
  }
  throw new Error("Pinned pnpm JavaScript CLI is required; no shell/download fallback");
}

test("the archive installs beside its peer archives as one root-only ESM package", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "conformance-pack-"));
  try {
    const pnpm = await pinnedPnpmCli();
    const consumer = join(temporary, "consumer");
    const sources = {};
    for (const name of ["conformance", ...PEERS]) {
      const root = join(workspace, "packages", name);
      const filename = run(process.execPath, [pnpm, "pack", "--pack-destination", temporary], root)
        .split(/\r?\n/u).at(-1);
      assert.match(filename, /\.tgz$/u);
      const archive = resolve(temporary, filename);
      if (name === "conformance") {
        const entries = run("tar", ["-tzf", archive], temporary).split(/\r?\n/u).map(entry => entry.replace(/^package\//u, ""));
        assert.deepEqual(entries.filter(entry => !entry.startsWith("dist/")).sort(),
          ["CHANGELOG.md", "LICENSE", "README.md", "package.json"]);
        assert.ok(entries.includes("dist/index.js") && entries.includes("dist/index.d.ts"));
        assert.ok(entries.every(entry => !entry.startsWith("dist/") || /\.(?:js|d\.ts)$/u.test(entry)), entries.join(", "));
      }
      const installed = join(consumer, "node_modules/@get-modular", name);
      await mkdir(installed, { recursive: true });
      run("tar", ["-xzf", archive, "--strip-components=1", "-C", installed], temporary);
      sources[name] = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    }

    const manifest = JSON.parse(await readFile(join(consumer, "node_modules/@get-modular/conformance/package.json"), "utf8"));
    assert.deepEqual(Object.keys(manifest.exports), ["."]);
    assert.equal(manifest.type, "module");
    assert.equal(Object.hasOwn(manifest, "private"), false);
    assert.deepEqual(manifest.publishConfig, { access: "public", registry: "https://registry.npmjs.org/" });
    // governance:test binds the source range to SUPPORTED_NODE_RANGE; the archive must keep it.
    assert.deepEqual(manifest.engines, sources.conformance.engines);
    // pnpm turns each workspace:^ peer into the caret range of the one 0.x minor in this workspace.
    assert.deepEqual(manifest.peerDependencies, Object.fromEntries(PEERS.map(name =>
      [`@get-modular/${name}`, `^${sources[name].version}`])));
    for (const field of ["dependencies", "optionalDependencies", "devDependencies", "peerDependenciesMeta"]) {
      assert.equal(manifest[field], undefined, field);
    }

    await writeFile(join(consumer, "package.json"), '{"type":"module"}\n');
    // The suite lives outside the repository: only installed archives are imported.
    await writeFile(join(consumer, "suite.mjs"), `
      import { declareModule, defineContract } from '@get-modular/assembly';
      import { contractSuite, runContractSuite } from '@get-modular/conformance';
      const owner = { authority: 'acme', path: ['orders'] };
      const contract = revision => defineContract()({ id: 'acme/orders', revision });
      const declare = revision => declareModule({
        moduleId: 'acme/orders-fake', implementationId: 'acme/orders-fake/default', owner,
        provides: [contract(revision).provide()], slots: [],
      });
      const suite = contractSuite(contract(1), { 'lists orders': async orders => { if (orders.list().length !== 1) throw Error('no order'); } });
      const registered = [];
      runContractSuite(suite, { name: 'fake', declaration: declare(1), create: () => ({ list: () => ['o1'] }) },
        (name, body) => registered.push({ name, body }));
      if (registered.length !== 1) throw Error('registered ' + registered.length);
      await registered[0].body();
      try {
        runContractSuite(suite, { name: 'fake', declaration: declare(2), create: () => ({}) }, () => { throw Error('registered'); });
        throw Error('revision mismatch accepted');
      } catch (error) {
        if (error.code !== 'conformance.suite.revision-mismatch') throw error;
      }
      for (const entry of [import.meta.resolve('@get-modular/conformance'), import.meta.resolve('@get-modular/assembly')]) {
        if (!entry.includes('/consumer/node_modules/')) throw Error(entry);
      }
    `);
    run(process.execPath, ["suite.mjs"], consumer);
    await writeFile(join(consumer, "check.mjs"), `
      import * as conformance from '@get-modular/conformance';
      const names = Object.keys(conformance).sort().join(',');
      if (names !== 'ConformanceError,checkNamespaces,contractSuite,guardHandles,isolate,runContractSuite,smoke') throw Error(names);
      try {
        await import('@get-modular/conformance/dist/index.js');
        throw Error('deep import succeeded');
      } catch (error) {
        if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error;
      }
    `);
    run(process.execPath, ["check.mjs"], consumer);

    // The published declarations compile with exactly the libraries the README requires.
    await writeFile(join(consumer, "check.ts"), `
      import { assemblyFor, declareModule, defineContract, type CapabilitiesOf } from '@get-modular/assembly';
      import { required } from '@get-modular/core';
      import { contractSuite, isolate, type Isolated } from '@get-modular/conformance';
      type Port = { read(): number };
      const Db = defineContract<Port>()({ id: 'acme/db', revision: 1 });
      const Reader = defineContract<Port>()({ id: 'acme/reader', revision: 1 });
      interface Capabilities extends CapabilitiesOf<typeof Db | typeof Reader> {}
      const reader = declareModule({
        moduleId: 'acme/reader', implementationId: 'acme/reader/default', owner: { authority: 'acme', path: ['reader'] },
        provides: [Reader.provide()], slots: [Db.slot('db', required())],
      });
      const built: Promise<Isolated<number, { readonly 'acme/reader': Port }>> = isolate(assemblyFor<Capabilities>(), {
        declaration: reader,
        factory: async deps => ({ instance: deps.db.read(), capabilities: { 'acme/reader': deps.db } }),
        dependencies: { db: { read: () => 1 } },
      });
      contractSuite(Reader, { reads: port => { const value: number = port.read(); void value; } });
      // @ts-expect-error a fake with a renamed method is not the contract's port
      void isolate(assemblyFor<Capabilities>(), { declaration: reader, factory: async () => ({ instance: 1, capabilities: { 'acme/reader': { read: () => 1 } } }), dependencies: { db: { red: () => 1 } } });
      void built;
    `);
    for (const packageName of ["typescript", "typescript-minimum"]) {
      const compiler = join(dirname(require.resolve(`${packageName}/package.json`)), "bin/tsc");
      for (const resolution of ["NodeNext", "Bundler"]) {
        await writeFile(join(consumer, "tsconfig.json"), JSON.stringify({
          compilerOptions: {
            strict: true, noEmit: true, skipLibCheck: false, target: "ES2024", types: [],
            lib: ["ES2024", "ESNext.Disposable", "DOM"],
            module: resolution === "NodeNext" ? "NodeNext" : "ESNext",
            moduleResolution: resolution,
          },
          files: ["check.ts"],
        }));
        run(process.execPath, [compiler, "-p", "tsconfig.json"], consumer);
      }
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
