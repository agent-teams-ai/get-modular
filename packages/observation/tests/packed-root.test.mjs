import { pinnedPnpmCli } from "./support/pinned-pnpm.ts";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { compile, resolutions, supportedCompilers, writeProject } from "./support/compilers.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, cwd) {
  const { NODE_TEST_CONTEXT: _testContext, ...environment } = process.env;
  const result = spawnSync(command, args, { cwd, env: environment, encoding: "utf8", timeout: 120_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `${command}: ${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
}

async function javascriptFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await javascriptFiles(file));
    else if (entry.name.endsWith(".js")) files.push(file);
  }
  return files;
}

async function assertSourceRules(installed) {
  const sources = new Map();
  for (const file of await javascriptFiles(join(installed, "dist"))) {
    const source = await readFile(file, "utf8");
    sources.set(file, source);
    assert.doesNotMatch(source, /process\s*(?:\.\s*env|\[\s*["']env["']\s*\])/u, file);
    assert.doesNotMatch(source, /(?:from\s*|import\s*(?:\(\s*)?|require\s*\(\s*)["']node:/u, file);
    for (const match of source.matchAll(/["'](node:[^"']+)["']/gu)) {
      assert.ok(["node:timers", "node:async_hooks", "node:perf_hooks", "node:util"].includes(match[1]), `${file}: ${match[1]}`);
    }
  }
  const visited = new Set();
  const visit = file => {
    if (visited.has(file)) return;
    visited.add(file);
    const source = sources.get(file);
    assert.equal(typeof source, "string", `missing testing closure member ${file}`);
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)["']([^"']+)["']/gu)) {
      assert.ok(match[1].startsWith("."), `testing runtime dependency ${match[1]}`);
      const dependency = resolve(dirname(file), match[1]);
      assert.ok(!relative(join(installed, "dist"), dependency).startsWith(".."), dependency);
      visit(dependency);
    }
  };
  visit(join(installed, "dist/testing.js"));
  assert.ok(visited.size > 1, "testing entry must use its owned implementation");
}

async function checkTypes(consumer, context) {
  const files = ["types.ts", "types-structural.ts", "types-traps.ts", "types-runtime-only.ts", "types-loose-optional.ts", "types-testing.ts"];
  for (const file of files) {
    const source = await readFile(join(packageRoot, "tests", file), "utf8");
    await writeFile(join(consumer, file), source.replaceAll("../dist/index.js", "@get-modular/observation")
      .replaceAll("../dist/testing.js", "@get-modular/observation/testing"));
  }
  for (const compiler of await supportedCompilers()) {
    for (const resolution of resolutions) {
      await writeProject(consumer, files, resolution);
      const result = compile(compiler, consumer);
      assert.equal(result.status, 0, result.output);
      context.diagnostic(`packed declarations TypeScript ${compiler.version} ${resolution}: all six fixture groups passed`);
    }
  }
}

test("T02 T05 T07 T08 T09 T11 T13 T92 T97 T104 T110 T113 T117 exact archives expose two ESM entries sharing one copy", { timeout: 240_000 }, async context => {
  const temporary = await mkdtemp(join(tmpdir(), "observation-pack-"));
  try {
    const pnpm = await pinnedPnpmCli(resolve(packageRoot, "../.."));
    const consumer = join(temporary, "consumer");
    const sources = {};
    const archives = {};
    for (const name of ["resources", "observation"]) {
      const root = resolve(packageRoot, "..", name);
      const filename = run(process.execPath, [pnpm, "--pm-on-fail=ignore", "pack", "--pack-destination", temporary], root).split(/\r?\n/u).at(-1);
      assert.match(filename, /\.tgz$/u);
      const archive = resolve(temporary, filename);
      archives[name] = archive;
      const installed = join(consumer, "node_modules/@get-modular", name);
      await mkdir(installed, { recursive: true });
      run("tar", ["-xzf", archive, "--strip-components=1", "-C", installed], temporary);
      sources[name] = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    }
    const entries = run("tar", ["-tzf", archives.observation], temporary).split(/\r?\n/u).map(entry => entry.replace(/^package\//u, ""));
    assert.deepEqual(entries.filter(entry => !entry.startsWith("dist/")).sort(), ["CHANGELOG.md", "LICENSE", "README.md", "package.json"]);
    for (const name of ["index.js", "index.d.ts", "testing.js", "testing.d.ts"]) assert.ok(entries.includes(`dist/${name}`));
    assert.ok(entries.every(entry => !entry.startsWith("dist/") || /\.(?:js|d\.ts)$/u.test(entry)), entries.join(", "));
    const installed = join(consumer, "node_modules/@get-modular/observation");
    const manifest = JSON.parse(await readFile(join(installed, "package.json"), "utf8"));
    assert.deepEqual(manifest.exports, {
      ".": { import: { types: "./dist/index.d.ts", default: "./dist/index.js" }, default: "./dist/index.js" },
      "./testing": { import: { types: "./dist/testing.d.ts", default: "./dist/testing.js" }, default: "./dist/testing.js" },
    });
    assert.deepEqual(Object.keys(manifest.exports), [".", "./testing"]);
    assert.equal(manifest.type, "module");
    assert.equal(Object.hasOwn(manifest, "private"), false);
    assert.deepEqual(manifest.publishConfig, { access: "public", registry: "https://registry.npmjs.org/" });
    assert.deepEqual(manifest.engines, sources.observation.engines);
    assert.deepEqual(manifest.peerDependencies, { "@get-modular/resources": `^${sources.resources.version}` });
    for (const field of ["dependencies", "optionalDependencies", "devDependencies", "peerDependenciesMeta"]) assert.equal(manifest[field], undefined, field);
    await writeFile(join(consumer, "package.json"), '{"type":"module"}\n');
    const copy = join(consumer, "copy");
    await mkdir(copy);
    run("tar", ["-xzf", archives.observation, "--strip-components=1", "-C", copy], temporary);
    await writeFile(join(consumer, "check.mjs"), `
      import assert from 'node:assert/strict';
      import { createRequire } from 'node:module';
      import { createScope } from '@get-modular/resources';
      import * as observation from '@get-modular/observation';
      import * as testing from '@get-modular/observation/testing';
      import * as second from './copy/dist/index.js';
      const require = createRequire(import.meta.url);
      assert.deepEqual(Object.keys(observation).sort(), ['ObservationError', 'createStore']);
      assert.deepEqual(Object.keys(testing).sort(), ['asyncDetection', 'delivered', 'liveSubscriptions', 'settled']);
      assert.equal(require('@get-modular/observation'), observation);
      assert.equal(require('@get-modular/observation/testing'), testing);
      const host = createScope({ name: 'packed' });
      const options = { name: 'one', resources: host.resources, reportError: () => undefined };
      const first = observation.createStore({ count: 0 }, options);
      const facet = first.readonly();
      let observed;
      facet.watch(facet.read(['count']), { resources: host.resources, name: 'watch', onChange: next => { observed = next.values.count; } });
      assert.equal(testing.liveSubscriptions(facet), 1);
      first.set({ count: 1 });
      await testing.delivered({ stores: [facet] });
      assert.equal(observed, 1);
      const other = second.createStore({ count: 0 }, { ...options, name: 'two' }).readonly();
      assert.throws(() => other.watch(facet.read(['count']), { resources: host.resources, name: 'foreign', onChange: () => undefined }),
        error => error.code === 'observation.snapshot.foreign');
      for (const entry of ['@get-modular/observation', '@get-modular/observation/testing', '@get-modular/resources']) {
        assert.ok(import.meta.resolve(entry).includes('/consumer/node_modules/'), import.meta.resolve(entry));
      }
      for (const suffix of ['dist/index.js', 'dist/testing.js', 'package.json', 'unknown']) {
        await assert.rejects(import('@get-modular/observation/' + suffix), error => error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED');
        assert.throws(() => require('@get-modular/observation/' + suffix), error => error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED');
      }
      await host.control.close();
      assert.equal(testing.liveSubscriptions(facet), 0);
    `);
    run(process.execPath, ["check.mjs"], consumer);
    await writeFile(join(consumer, "semantic-suite.mjs"), await readFile(join(packageRoot, "tests/semantic-suite.mjs"), "utf8"));
    await writeFile(join(consumer, "semantic-packed.test.mjs"), `
      import test from 'node:test';
      import * as observation from '@get-modular/observation';
      import * as testing from '@get-modular/observation/testing';
      import { runSemanticSuite } from './semantic-suite.mjs';
      test('packed observation semantics', async context => { await runSemanticSuite(observation, testing, context); });
    `);
    const semantics = run(process.execPath, ["--test", "--test-reporter=tap", "semantic-packed.test.mjs"], consumer);
    assert.match(semantics, /ok \d+ - T\d+/u, "packed archive must execute attributed semantic probes");
    const closeReporting = (await readFile(join(packageRoot, "tests/close-reporting.test.ts"), "utf8"))
      .replaceAll("../dist/index.js", "@get-modular/observation")
      .replaceAll("../dist/testing.js", "@get-modular/observation/testing");
    await writeFile(join(consumer, "close-reporting.test.ts"), closeReporting);
    run(process.execPath, ["--test", "close-reporting.test.ts"], consumer);
    await assertSourceRules(installed);
    await checkTypes(consumer, context);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
