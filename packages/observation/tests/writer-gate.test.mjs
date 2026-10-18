import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { compile, resolutions, supportedCompilers, writeProject } from "./support/compilers.mjs";
import { staticRules } from "./support/static-rules.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = join(packageRoot, "tests/writer-tasks");

async function prepare(temporary, sets) {
  const nodeModules = join(temporary, "node_modules/@get-modular");
  await mkdir(nodeModules, { recursive: true });
  await symlink(packageRoot, join(nodeModules, "observation"), "junction");
  await symlink(resolve(packageRoot, "../resources"), join(nodeModules, "resources"), "junction");
  await writeFile(join(temporary, "package.json"), '{"type":"module"}\n');
  const rows = [];
  for (const set of sets) {
    const directory = join(temporary, set.dir);
    await mkdir(directory);
    await copyFile(join(fixtures, "harness.mjs.txt"), join(directory, "harness.mjs"));
    for (const task of set.tasks ?? Object.keys(set.gates)) {
      for (const suffix of ["types.ts", "accept.ts"]) {
        await copyFile(join(fixtures, "tasks", `${task}.${suffix}.txt`), join(directory, `${task}.${suffix}`));
      }
      await copyFile(join(fixtures, "fakes", `${task}.types.js.txt`), join(directory, `${task}.types.js`));
      await copyFile(join(fixtures, "scenarios", `${task}.scenario.mjs.txt`), join(directory, `${task}.scenario.mjs`));
      const source = await readFile(join(fixtures, "solutions", set.dir, `${task}.ts.txt`), "utf8");
      await writeFile(join(directory, `${task}.ts`), source);
      rows.push({ set, task, directory, rules: staticRules(task, source), errors: [] });
    }
  }
  return rows;
}

function rowForDiagnostic(rows, diagnostic) {
  if (!diagnostic.file) return undefined;
  return rows.find(row => {
    const file = relative(row.directory, diagnostic.file).replaceAll("\\", "/");
    return [`${row.task}.ts`, `${row.task}.types.ts`, `${row.task}.accept.ts`].includes(file);
  });
}

async function checkCompilation(temporary, rows, context) {
  const files = rows.flatMap(row => ["ts", "types.ts", "accept.ts"].map(suffix =>
    relative(temporary, join(row.directory, `${row.task}.${suffix}`))));
  for (const compiler of await supportedCompilers()) {
    for (const resolution of resolutions) {
      await writeProject(temporary, files, resolution);
      const result = compile(compiler, temporary);
      for (const diagnostic of result.diagnostics) {
        const row = rowForDiagnostic(rows, diagnostic);
        assert.ok(row, `unattributable writer diagnostic: ${result.output}`);
        row.errors.push({ compiler: compiler.version, resolution, ...diagnostic });
      }
      context.diagnostic(`writer compile TypeScript ${compiler.version} ${resolution}: ${result.diagnostics.length} attributed diagnostics`);
    }
  }
}

function behavior(row) {
  const result = spawnSync(process.execPath, ["--expose-gc", `${row.task}.scenario.mjs`], {
    cwd: row.directory, encoding: "utf8", timeout: 30_000, env: { ...process.env, NODE_OPTIONS: "" },
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.error?.code === "ETIMEDOUT") return { failed: true, output: "scenario exceeded its archived 30 s deadline" };
  assert.equal(result.error, undefined, output);
  // A crash is a broken run, never a passing negative-control observation.
  assert.ok(result.status === 0 || /behaviour failure/u.test(output), `writer scenario crashed: ${output}`);
  return { failed: result.status !== 0, output };
}

test("T29 T75 T103 T108 archived writer references pass and every negative fails its exact gates", { timeout: 240_000 }, async context => {
  const temporary = await mkdtemp(join(tmpdir(), "observation-writers-"));
  try {
    const { sets } = JSON.parse(await readFile(join(fixtures, "manifest.json"), "utf8"));
    assert.equal(sets.length, 10);
    const rows = await prepare(temporary, sets);
    assert.equal(rows.length, 33);
    await checkCompilation(temporary, rows, context);
    const failures = [];
    for (const row of rows) {
      const gates = [];
      if (row.rules.length > 0) gates.push("rules");
      if (row.errors.length > 0) gates.push("compile");
      let observed;
      if (row.errors.length === 0) {
        observed = behavior(row);
        if (observed.failed) gates.push("behaviour");
      }
      context.diagnostic(`${row.set.dir}/${row.task}: ${gates.length === 0 ? "PASS" : `FAIL (${gates.join(", ")})`}`);
      const expected = row.set.expect === "pass" ? [] : row.set.gates[row.task];
      if (expected === null ? gates.length === 0 : JSON.stringify(gates) !== JSON.stringify(expected)) {
        failures.push({ set: row.set.dir, task: row.task, expected, actual: gates, rules: row.rules,
          errors: row.errors, behavior: observed?.output });
      }
    }
    assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
