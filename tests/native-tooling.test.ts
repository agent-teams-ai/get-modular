import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { CodemodProject, typeOnly } from "../architecture/tooling/codemods/project.ts";

const repository = resolve(import.meta.dirname, "..");
const compilerAdapters = [
  "architecture/tooling/test-assembly-types.mjs",
  "packages/lifecycle-kernel/tests/support/compilers.ts",
  "packages/resources/tests/support/compilers.ts",
  "packages/conformance/tests/support/compilers.ts",
] as const;
interface CompilerIdentity {
  readonly compilerName: string;
  readonly version: string;
  readonly path: string;
}
interface CompilerAdapter {
  supportedCompilers(): readonly CompilerIdentity[] | Promise<readonly CompilerIdentity[]>;
  testTypeScriptProjects?(projects: readonly string[]): void;
}

async function compilerAdapter(path: string): Promise<CompilerAdapter> {
  return await import(pathToFileURL(path).href) as CompilerAdapter;
}

async function compilerMetadata(root: string, name: string, version: string) {
  await writeFile(join(root, "node_modules", name, "package.json"), JSON.stringify({
    name: "typescript", version, main: "implementation.cjs",
  }));
}

async function withCompilerMetadata(path: string, run: (root: string, adapter: CompilerAdapter, sentinel: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "get-modular-compiler-metadata-"));
  try {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(repository, path), target);
    await writeFile(join(root, "package.json"), JSON.stringify({
      private: true, type: "module", devDependencies: { "typescript-minimum": "7.0.2" },
    }));
    const sentinel = join(root, "compiler-executed");
    const poison = `require("node:fs").writeFileSync(${JSON.stringify(sentinel)}, "executed"); throw new Error("COMPILER_IMPLEMENTATION_MUST_NOT_RUN");\n`;
    for (const name of ["typescript", "typescript-minimum"]) {
      await mkdir(join(root, "node_modules", name, "bin"), { recursive: true });
      await compilerMetadata(root, name, "7.0.2");
      await writeFile(join(root, "node_modules", name, "bin", "tsc"), poison);
      await writeFile(join(root, "node_modules", name, "implementation.cjs"), poison);
    }
    await writeFile(join(root, "tsconfig.json"), '{"files":[]}\n');
    await run(root, await compilerAdapter(target), sentinel);
    await assert.rejects(readFile(sentinel), { code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
}

test("standalone compiler adapters retain the actual exact pin and version deduplication", async () => {
  for (const path of compilerAdapters) {
    const adapter = await compilerAdapter(join(repository, path));
    const observations = await adapter.supportedCompilers();
    assert.deepEqual(observations.map(compiler => compiler.version), ["7.0.2"], path);
    assert.equal(observations[0]?.compilerName, "typescript", path);
  }
});

for (const path of compilerAdapters) {
  test(`${path} admits only canonical stable compiler metadata before dispatch`, async context => {
    await withCompilerMetadata(path, async (root, adapter, sentinel) => {
      for (const version of ["7.00.2", "07.0.2", "7.0.02", "8.-1.0", "7.0.2-rc.1", "7.0.2+build", "7.0.2\n"]) {
        await context.test(JSON.stringify(version), async () => {
          await compilerMetadata(root, "typescript", version);
          await assert.rejects(async () => {
            if (adapter.testTypeScriptProjects) adapter.testTypeScriptProjects([join(root, "tsconfig.json")]);
            else await adapter.supportedCompilers();
          }, /must be a pinned stable compiler/u);
          await assert.rejects(readFile(sentinel), { code: "ENOENT" });
        });
      }
      for (const version of ["7.0.2", "7.0.3", "7.1.0", "8.0.0"]) {
        await compilerMetadata(root, "typescript", version);
        const observations = await adapter.supportedCompilers();
        assert.deepEqual(observations.map(compiler => compiler.version),
          version === "7.0.2" ? [version] : [version, "7.0.2"]);
      }
      await compilerMetadata(root, "typescript", "7.0.1");
      await assert.rejects(async () => await adapter.supportedCompilers(), /7\.0\.2 floor/u);
      await compilerMetadata(root, "typescript", "7.0.2");
      await compilerMetadata(root, "typescript-minimum", "7.0.3");
      await assert.rejects(async () => await adapter.supportedCompilers(), /7\.0\.2/u);
    });
  });
}

test("the native codemod adapter distinguishes type imports from runtime imports", async () => {
  const source = [
    'import type { Assembly } from "@get-modular/assembly";',
    'import { assemblyFor } from "@get-modular/assembly";',
    'export type { Assembly } from "@get-modular/assembly";',
    'export { assemblyFor } from "@get-modular/assembly";',
  ].join("\n");
  const project = await CodemodProject.create([[resolve(tmpdir(), "codemod/type-imports.ts"), source]], { isolated: true });
  try {
    const [file] = project.files;
    assert(file);
    assert.deepEqual(file.diagnostics, []);
    assert.deepEqual(file.imports.map(typeOnly), [true, false]);
    assert.deepEqual(file.exports.map(typeOnly), [true, false]);
    assert.equal(file.text, source);
  } finally { await project.close(); }
});
