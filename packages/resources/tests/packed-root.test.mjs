import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(packageRoot, "../../package.json"));

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

test("the public archive installs one root-only ESM package with the full scope semantics", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "resources-pack-"));
  try {
    const filename = run(process.execPath,
      [await pinnedPnpmCli(), "pack", "--pack-destination", temporary], packageRoot)
      .split(/\r?\n/u).at(-1);
    assert.match(filename, /\.tgz$/u);
    const archive = resolve(temporary, filename);
    const entries = run("tar", ["-tzf", archive], temporary).split(/\r?\n/u).map(entry => entry.replace(/^package\//u, ""));
    assert.deepEqual(entries.filter(entry => !entry.startsWith("dist/")).sort(),
      ["CHANGELOG.md", "LICENSE", "README.md", "package.json"]);
    assert.ok(entries.includes("dist/index.js") && entries.includes("dist/index.d.ts"));
    assert.ok(entries.every(entry => !entry.startsWith("dist/") || /\.(?:js|d\.ts)$/u.test(entry)), entries.join(", "));

    const consumer = join(temporary, "consumer");
    const installed = join(consumer, "node_modules/@get-modular/resources");
    await mkdir(installed, { recursive: true });
    run("tar", ["-xzf", archive, "--strip-components=1", "-C", installed], temporary);
    const manifest = JSON.parse(await readFile(join(installed, "package.json"), "utf8"));
    assert.deepEqual(Object.keys(manifest.exports), ["."]);
    assert.equal(manifest.type, "module");
    assert.equal(Object.hasOwn(manifest, "private"), false);
    assert.deepEqual(manifest.publishConfig, { access: "public", registry: "https://registry.npmjs.org/" });
    // governance:test binds the source range to SUPPORTED_NODE_RANGE; the archive must keep it.
    const source = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
    assert.deepEqual(manifest.engines, source.engines);
    for (const field of ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"]) assert.equal(manifest[field], undefined, field);

    await writeFile(join(consumer, "package.json"), '{"type":"module"}\n');
    const suiteURL = pathToFileURL(join(packageRoot, "tests/semantic-suite.mjs")).href;
    await writeFile(join(consumer, "semantic-packed.test.mjs"), `
      import test from 'node:test';
      import * as resources from '@get-modular/resources';
      import { runSemanticSuite } from ${JSON.stringify(suiteURL)};
      test('packed scope semantics', async (context) => { await runSemanticSuite(resources, context); });
    `);
    run(process.execPath, ["--test", "semantic-packed.test.mjs"], consumer);
    await writeFile(join(consumer, "check.mjs"), `
      import * as resources from '@get-modular/resources';
      const names = Object.keys(resources).sort().join(',');
      if (names !== 'CloseIncompleteError,InvalidArgumentError,ScopeClosedError,createScope,scoped') throw Error(names);
      try {
        await import('@get-modular/resources/dist/index.js');
        throw Error('deep import succeeded');
      } catch (error) {
        if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error;
      }
    `);
    run(process.execPath, ["check.mjs"], consumer);

    // The published declarations compile with exactly the libraries the README requires.
    await writeFile(join(consumer, "check.ts"), `
      import { createScope, scoped, type CloseReport, type ModuleContext } from '@get-modular/resources';
      const { resources, control } = createScope({ name: 'host' });
      const value: Promise<number> = resources.setup({ name: 'n', setup: ({ signal }) => (signal.aborted ? 0 : 1), cleanup: (_n, { escalate }) => { void escalate; } });
      const report: Promise<CloseReport> = control.close({ escalate: undefined });
      declare function bind(factory: (deps: { readonly db: number }, context: { readonly signal: AbortSignal; readonly scope: unknown }) => Promise<number>): void;
      bind(scoped('m', async (deps, context: ModuleContext) => deps.db + (context.signal.aborted ? 0 : 1)));
      // @ts-expect-error cleanup never receives the setup signal
      void resources.setup({ name: 'x', setup: () => 1, cleanup: (_n, { signal }) => { void signal; } });
      void value; void report;
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
