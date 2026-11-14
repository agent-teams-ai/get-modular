import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { pinnedPnpmCli } from "../../../tests/qualification/support/pinned-pnpm.ts";
import { supportedCompilers } from "../../../architecture/tooling/test-assembly-types.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspace = resolve(packageRoot, "../..");
const require = createRequire(join(workspace, "package.json"));

function run(command: string, args: readonly string[], cwd: string): string {
  const env = { ...process.env };
  delete env.NODE_PATH;
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8", timeout: 60000, maxBuffer: 8 * 1024 * 1024, shell: false });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, `${command}: ${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
}

test("matched public archives preserve native execution, portable types and neutral optionality", async context => {
  const temporary = await mkdtemp(join(tmpdir(), "effect-pack-"));
  try {
    const pnpm = await pinnedPnpmCli(workspace);
    const consumer = join(temporary, "consumer");
    const versions: Record<string, string> = {};
    const digests: Record<string, string> = {};
    let readmeExample = "";
    for (const name of ["core", "assembly", "resources", "observation", "effect"]) {
      const root = join(workspace, "packages", name);
      const filename = run(process.execPath, [pnpm, "--pm-on-fail=ignore", "pack", "--pack-destination", temporary], root).split(/\r?\n/u).at(-1);
      assert.ok(filename && /\.tgz$/u.test(filename));
      const archive = resolve(temporary, filename);
      digests[name] = Buffer.from(await globalThis.crypto.subtle.digest("SHA-256", await readFile(archive))).toString("hex");
      const installed = join(consumer, "node_modules/@get-modular", name);
      await mkdir(installed, { recursive: true });
      run("tar", ["-xzf", archive, "--strip-components=1", "-C", installed], temporary);
      const manifest = JSON.parse(await readFile(join(installed, "package.json"), "utf8"));
      versions[name] = manifest.version;
      assert.deepEqual(Object.keys(manifest.exports), name === "observation" ? [".", "./testing"] : ["."]);
      assert.equal(manifest.type, "module");
      if (name !== "effect") {
        for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
          assert.equal(manifest[field]?.effect, undefined, `${name}.${field}.effect`);
        }
      } else {
        assert.deepEqual(manifest.peerDependencies, {
          "@get-modular/assembly": `^${versions.assembly}`, "@get-modular/core": `^${versions.core}`, effect: "4.1.4",
        });
        const entries = run("tar", ["-tzf", archive], temporary).split(/\r?\n/u).map(entry => entry.replace(/^package\//u, ""));
        assert.deepEqual(entries.filter(entry => !entry.startsWith("dist/")).sort(),
          ["CHANGELOG.md", "LICENSE", "README.md", "docs/practices.md", "package.json"]);
        assert.ok(entries.includes("dist/index.js") && entries.includes("dist/index.d.ts"));
        const readme = await readFile(join(installed, "README.md"), "utf8");
        assert.ok(readme.includes("(docs/practices.md)"));
        const example = /```ts\n([\s\S]*?)\n```/u.exec(readme)?.[1];
        assert.ok(example, "the complete public README example is present");
        readmeExample = example;
        const guide = await readFile(join(installed, "docs/practices.md"), "utf8");
        assert.ok(guide.includes("# Effect integration practices"));
        assert.equal(/\]\((?:\.\.\/|\.\/)/u.test(guide), false, "the installed guide must not require repository-relative files");
      }
    }
    await writeFile(join(consumer, "package.json"), '{"type":"module"}\n');
    await cp(join(workspace, "tests/qualification/effect-communication"), join(consumer, "communication"), { recursive: true });
    // No Effect installation yet: ordinary public imports and construction work independently.
    await writeFile(join(consumer, "neutral.ts"), `
      import assert from "node:assert/strict";
      import { assemblyFor, declareModule, implement } from "@get-modular/assembly";
      import { required } from "@get-modular/core";
      assert.equal(required().kind, "required");
      assert.throws(() => import.meta.resolve("effect"), { code: "ERR_MODULE_NOT_FOUND" });
      const app = implement()(declareModule({ moduleId: "neutral/app", implementationId: "neutral/app",
        owner: { authority: "neutral", path: ["app"] }, provides: [], slots: [] }), async () => ({ instance: 42, capabilities: {} }));
      const result = await assemblyFor().prepare({ profileId: "neutral/test", modules: [app], roots: { app } });
      assert.equal(result.status, "prepared");
      if (result.status !== "prepared") throw Error("neutral preparation");
      const run = await result.prepared.run();
      assert.equal(run.status, "succeeded");
      assert.equal(run.roots.app, 42);
    `);
    run(process.execPath, ["neutral.ts"], consumer);
    run(process.execPath, ["communication/neutral.ts"], consumer);

    // Copy the exact frozen-install peer closure; this Effect release has no runtime dependencies.
    const effectRoot = dirname(require.resolve("effect/package.json"));
    const effect = JSON.parse(await readFile(join(effectRoot, "package.json"), "utf8"));
    assert.equal(effect.version, "4.1.4");
    for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) assert.deepEqual(effect[field] ?? {}, {});
    await cp(effectRoot, join(consumer, "node_modules/effect"), { recursive: true });
    await writeFile(join(consumer, "readme.ts"), readmeExample);
    for (const name of ["support.ts", "construction.test.ts", "consumer.test.ts", "lifecycle.test.ts", "communication.test.ts", "portable.ts"]) {
      const source = await readFile(join(packageRoot, "tests", name), "utf8");
      const publicCarrier = 'from "../dist/index.js"';
      assert.equal(source.split(publicCarrier).length, 2, `${name} must import exactly one public carrier`);
      await writeFile(join(consumer, name), source.replace(publicCarrier, 'from "@get-modular/effect"')
        .replaceAll('"../../../tests/qualification/effect-communication/', '"./communication/'));
    }
    const communication = await readFile(join(workspace, "tests/effect-communication.test.ts"), "utf8");
    await writeFile(join(consumer, "consumer-communication.test.ts"),
      communication.replaceAll('"./qualification/effect-communication/', '"./communication/'));
    const output = run(process.execPath, ["--test", "--test-reporter=tap", "construction.test.ts", "consumer.test.ts", "lifecycle.test.ts", "communication.test.ts", "consumer-communication.test.ts"], consumer);
    for (const summary of ["# tests 35", "# pass 35", "# fail 0", "# cancelled 0", "# skipped 0"]) {
      assert.ok(output.split(/\r?\n/u).includes(summary), `packed suite lacks ${summary}\n${output}`);
    }
    await writeFile(join(consumer, "public.ts"), `
      import assert from "node:assert/strict";
      import * as adapter from "@get-modular/effect";
      import { runPortable } from "./portable.ts";
      import "./readme.ts";
      assert.deepEqual(Object.keys(adapter).sort(), ["InvalidInputs", "effectFor", "entriesOf", "group", "implement", "input"]);
      assert.equal(await runPortable(), "packed/value");
      await assert.rejects(import("@get-modular/effect/dist/index.js"), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
      for (const name of ["core", "assembly", "resources", "observation", "effect"]) {
        assert.ok(import.meta.resolve("@get-modular/" + name).includes("/consumer/node_modules/@get-modular/" + name + "/"));
      }
    `);
    run(process.execPath, ["public.ts"], consumer);
    for (const { path: compiler } of supportedCompilers()) {
      for (const resolution of ["NodeNext", "Bundler"]) {
        await writeFile(join(consumer, "tsconfig.json"), JSON.stringify({ compilerOptions: {
          strict: true, noEmit: true, skipLibCheck: false, target: "ES2024", types: [], allowImportingTsExtensions: true,
          lib: ["ES2024", "ESNext.Disposable", "ESNext.Promise", "DOM"],
          module: resolution === "NodeNext" ? "NodeNext" : "ESNext", moduleResolution: resolution,
        }, files: ["portable.ts", "readme.ts", "communication/native.ts", "communication/callback.ts", "communication/state.ts"] }));
        run(process.execPath, [compiler, "-p", "tsconfig.json"], consumer);
      }
    }
    context.diagnostic(JSON.stringify({ versions, effect: effect.version, archiveDigests: digests, runtimeTests: 35,
      publicTypeResolutions: ["NodeNext", "Bundler"], neutralEffectDependency: false }));
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
