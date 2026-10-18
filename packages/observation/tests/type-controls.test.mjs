import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { compile, resolutions, supportedCompilers, writeProject } from "./support/compilers.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureNames = ["types.ts", "types-structural.ts", "types-traps.ts", "types-runtime-only.ts",
  "types-loose-optional.ts", "types-testing.ts"];

async function project(directory) {
  const modules = join(directory, "node_modules/@get-modular");
  const installed = join(modules, "observation");
  await mkdir(installed, { recursive: true });
  await cp(join(packageRoot, "package.json"), join(installed, "package.json"));
  await cp(join(packageRoot, "dist"), join(installed, "dist"), {
    recursive: true, filter: source => !source.endsWith(".js"),
  });
  for (const peer of ["resources", "core", "assembly"]) {
    await symlink(resolve(packageRoot, "..", peer), join(modules, peer), "junction");
  }
  await writeFile(join(directory, "package.json"), '{"type":"module"}\n');
  for (const name of fixtureNames) {
    const source = await readFile(join(packageRoot, "tests", name), "utf8");
    await writeFile(join(directory, name), source
      .replaceAll("../dist/index.js", "@get-modular/observation")
      .replaceAll("../dist/testing.js", "@get-modular/observation/testing"));
  }
  for (const name of ["assembly-contracts-types.ts", "assembly-implement-types.ts"]) {
    const source = await readFile(resolve(packageRoot, "../../tests/observation", name), "utf8");
    await writeFile(join(directory, name), source);
  }
  return join(installed, "dist/features/store/types.d.ts");
}

async function checkDirectives(directory, compiler, resolution) {
  const files = [...fixtureNames, "assembly-contracts-types.ts", "assembly-implement-types.ts"];
  const expected = [];
  for (const file of files) {
    const lines = (await readFile(join(directory, file), "utf8")).split("\n");
    lines.forEach((line, index) => {
      const match = /^(\s*)\/\/ @ts-expect-error\s*(.*)$/u.exec(line);
      if (match) {
        expected.push({ file, line: index + 2, label: match[2] });
        lines[index] = `${match[1]}// expected error: ${match[2]}`;
      }
    });
    await writeFile(join(directory, file), lines.join("\n"));
  }
  await writeProject(directory, files, resolution);
  const result = compile(compiler, directory);
  assert.ok(expected.length > 80, "the full archived and corrective negative groups must be present");
  const stray = result.diagnostics.filter(diagnostic => !expected.some(row =>
    diagnostic.file === join(directory, row.file) && diagnostic.line === row.line));
  assert.deepEqual(stray, [], result.output);
  for (const row of expected) {
    const own = result.diagnostics.filter(diagnostic => diagnostic.file === join(directory, row.file) && diagnostic.line === row.line);
    assert.ok(own.length > 0, `missing own diagnostic for ${row.file}:${row.line} ${row.label}`);
    if (row.label.startsWith("T117 TS2322")) assert.deepEqual([...new Set(own.map(item => item.code))], ["TS2322"]);
  }
  assert.equal(expected.filter(row => row.label.startsWith("T117 TS2322")).length, 2);
  return expected.length;
}

function replaceOnce(source, find, replace) {
  assert.equal(source.split(find).length - 1, 1, `control anchor: ${find}`);
  return source.replace(find, replace);
}

test("T24 T25 T49 T103 T117 emitted declarations retain exact negative attribution and variance controls", { timeout: 240_000 }, async context => {
  const temporary = await mkdtemp(join(tmpdir(), "observation-types-"));
  try {
    for (const compiler of await supportedCompilers()) {
      for (const resolution of resolutions) {
        const directory = join(temporary, `${compiler.version}-${resolution}`);
        const declaration = await project(directory);
        const original = await readFile(declaration, "utf8");
        const allFiles = [...fixtureNames, "assembly-contracts-types.ts", "assembly-implement-types.ts"];
        await writeProject(directory, allFiles, resolution);
        let result = compile(compiler, directory);
        assert.equal(result.status, 0, result.output);
        await writeFile(declaration, replaceOnce(original, "ReadonlyStore<out V>", "ReadonlyStore<V>"));
        await writeProject(directory, ["types-structural.ts"], resolution);
        result = compile(compiler, directory);
        assert.equal(result.status, 0, result.output);
        const watch = "readonly watch: <S extends SnapshotOf<V>>(snapshot: S, spec: WatchSpec<FutureSnapshot<V, S>>) => undefined;";
        await writeFile(declaration, replaceOnce(original, watch,
          "readonly watch: <K extends Key<V>>(snapshot: Snapshot<V, K>, spec: WatchSpec<Snapshot<V, K>>) => undefined;"));
        await writeProject(directory, ["types.ts"], resolution);
        result = compile(compiler, directory);
        assert.notEqual(result.status, 0, result.output);
        assert.ok(result.diagnostics.length > 0, result.output);
        assert.ok(result.diagnostics.every(error => error.code === "TS2636" && error.file === declaration), result.output);
        await writeFile(declaration, original);
        await writeProject(directory, ["types-loose-optional.ts"], resolution, { exactOptionalPropertyTypes: false });
        result = compile(compiler, directory);
        assert.equal(result.status, 0, result.output);
        const count = await checkDirectives(directory, compiler, resolution);
        context.diagnostic(`TypeScript ${compiler.version} ${resolution}: clean baseline; variance controls; loose optional; ${count} independently attributed negatives`);
      }
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
