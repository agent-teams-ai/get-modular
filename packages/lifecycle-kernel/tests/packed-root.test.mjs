import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
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

test("candidate archive exposes the full lifecycle semantics through its public ESM root", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "lifecycle-kernel-pack-"));
  try {
    const filename = run("pnpm", ["pack", "--pack-destination", temporary], packageRoot)
      .split("\n").at(-1);
    assert.match(filename, /\.tgz$/);
    const installed = join(temporary, "consumer/node_modules/@get-modular/lifecycle-kernel");
    await mkdir(installed, { recursive: true });
    run("tar", ["-xzf", resolve(temporary, filename), "--strip-components=1", "-C", installed], temporary);
    const manifest = JSON.parse(await readFile(join(installed, "package.json"), "utf8"));
    assert.deepEqual(Object.keys(manifest.exports), ["."]);
    assert.equal(manifest.type, "module");
    assert.equal(manifest.private, true);
    await readFile(join(installed, "dist/index.js"));
    await readFile(join(installed, "dist/index.d.ts"));
    await writeFile(join(temporary, "consumer/package.json"), '{"type":"module"}\n');
    const suiteURL = pathToFileURL(join(packageRoot, "tests/semantic-suite.mjs")).href;
    await writeFile(join(temporary, "consumer/semantic-packed.test.mjs"), `
      import test from 'node:test';
      import { createLifecycleKernel } from '@get-modular/lifecycle-kernel';
      import { runSemanticSuite } from ${JSON.stringify(suiteURL)};
      test('packed lifecycle semantics', async (context) => {
        await runSemanticSuite(createLifecycleKernel, context);
      });
    `);
    run(process.execPath, ["--test", "semantic-packed.test.mjs"], join(temporary, "consumer"));
    await writeFile(join(temporary, "consumer/check.mjs"), `
      import { createLifecycleKernel } from '@get-modular/lifecycle-kernel';
      const kernel = createLifecycleKernel();
      const generation = kernel.stage();
      if (kernel.activate(generation).value !== 'active') throw Error('public root failed');
      try {
        await import('@get-modular/lifecycle-kernel/dist/index.js');
        throw Error('deep import succeeded');
      } catch (error) {
        if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error;
      }
    `);
    run(process.execPath, ["check.mjs"], join(temporary, "consumer"));
    await writeFile(join(temporary, "consumer/check.ts"), `
      import { createLifecycleKernel } from '@get-modular/lifecycle-kernel';
      const kernel = createLifecycleKernel();
      const generation = kernel.stage();
      // @ts-expect-error packed declaration must preserve the private identity
      const copiedGeneration: typeof generation = { ...generation };
      void copiedGeneration;
      const call = kernel.beginCall(generation);
      const custody = kernel.retainCustody(generation);
      if (call.ok) kernel.checkCall(call.value);
      if (custody.ok) {
        // @ts-expect-error custody has no call authority
        kernel.checkCall(custody.value);
      }
      // @ts-expect-error a generation is not a lease
      kernel.release(generation);
    `);
    for (const packageName of ["typescript", "typescript-minimum"]) {
      const compiler = join(dirname(require.resolve(`${packageName}/package.json`)), "bin/tsc");
      for (const resolution of ["NodeNext", "Bundler"]) {
        await writeFile(join(temporary, "consumer/tsconfig.json"), JSON.stringify({
          compilerOptions: {
            strict: true, noEmit: true, skipLibCheck: false, target: "ES2024",
            module: resolution === "NodeNext" ? "NodeNext" : "ESNext",
            moduleResolution: resolution,
          },
          files: ["check.ts"],
        }));
        run(process.execPath, [compiler, "-p", "tsconfig.json"], join(temporary, "consumer"));
      }
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
