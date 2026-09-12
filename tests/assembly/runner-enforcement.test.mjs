import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const workspace = resolve(import.meta.dirname, "../..");

// Execute the real packed runner in a disposable shell of the repository.
// Packages/tooling are unchanged; only the two new invocation sites are varied.
test("packed runner rejects removed and successful no-op runtime links", { timeout: 2700000 }, async t => {
  const temporary = await mkdtemp(join(tmpdir(), "assembly-runner-enforcement-"));
  try {
    await mkdir(join(temporary, "tests"));
    for (const name of ["packages", "architecture", "node_modules", "package.json", "pnpm-workspace.yaml"]) {
      await symlink(join(workspace, name), join(temporary, name));
    }
    await symlink(join(workspace, "tests/qualification"), join(temporary, "tests/qualification"));
    await cp(join(workspace, "tests/assembly"), join(temporary, "tests/assembly"), { recursive: true });
    const runner = join(temporary, "tests/assembly/packed-root.test.mjs");
    const original = await readFile(runner, "utf8");
    const copyLink = 'runtimeChecks.push(command(process.execPath, ["package-copy-consumer.mjs", secondConsumer], consumer).trim());';
    const mixedLink = 'runtimeChecks.push(command(process.execPath, ["mixed-runtime.mjs",\n        join(consumer, "emitted", `${compilerName}-${resolution}`, "mixed-graph.js")], consumer).trim());';
    const noop = 'runtimeChecks.push(command(process.execPath, ["--eval", ""], consumer).trim());';
    for (const [name, link, replacement] of [
      ["positive", null, null],
      ["package-copy removal", copyLink, ""],
      ["package-copy no-op", copyLink, noop],
      ["mixed-runtime removal", mixedLink, ""],
      ["mixed-runtime no-op", mixedLink, noop],
    ]) {
      await t.test(name, () => run(name, link, replacement));
    }
    async function run(name, link, replacement) {
      if (link !== null) assert.equal(original.split(link).length, 2, `${name}: unique invocation site`);
      await writeFile(runner, link === null ? original : original.replace(link, replacement));
      const result = spawnSync(process.execPath, ["--test", runner], {
        cwd: temporary, encoding: "utf8", timeout: 900000, maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "", NODE_TEST_CONTEXT: undefined },
      });
      assert.ifError(result.error);
      assert.equal(result.signal, null);
      const output = `${result.stdout}\n${result.stderr}`;
      if (link === null) {
        assert.equal(result.status, 0, output);
        assert.match(output, /consumerChecks.*passed/u, output);
      }
      else {
        assert.equal(result.status, 1, output);
        assert.match(output, /packed runtime runner completion/u, output);
        assert.match(output, /ERR_ASSERTION/u, output);
      }
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
