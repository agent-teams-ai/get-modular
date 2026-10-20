import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { testAssemblyTypes } from "../../architecture/tooling/test-assembly-types.mjs";
import {
  fixtureCompiler, invokeFixtureNode, withSemanticConsumer,
} from "../qualification/consumer-fixtures/support/materialize.mjs";
import { runInstalledSourcePolicyScenarios } from "../qualification/consumer-fixtures/source/policy.ts";
import { runInstalledSourceScenarios } from "../qualification/consumer-fixtures/source/installed.ts";
import { checkHeldStartupController } from "../qualification/consumer-fixtures/authoring/transport.ts";

test("consumer fixtures qualify their selected flat source through installed public owners", { timeout: 600000 }, async (t) => {
  await withSemanticConsumer(async ({ directory, evidence }) => {
    const sourcePolicy = await runInstalledSourcePolicyScenarios(directory, evidence.packageOutputs);
    const source = await runInstalledSourceScenarios(directory);
    t.diagnostic(JSON.stringify({ source, sourcePolicy, ...evidence }));
  });
});

test("consumer fixtures compile through public packages and preserve C/L/W/H behavior", { timeout: 600000 }, async (t) => {
  await withSemanticConsumer(async ({ directory, evidence }) => {
    const compatibility = testAssemblyTypes({ directory, project: join(directory, "tsconfig.types.json") });
    for (const name of new Set(compatibility.map(item => item.compilerName))) {
      const compiler = await fixtureCompiler(name);
      const negative = invokeFixtureNode([
        compiler.cli, "--project", "tsconfig.negative.json", "--pretty", "false",
      ], directory, `${name} C-04b`);
      const output = `${negative.stdout}\n${negative.stderr}`;
      assert.notEqual(negative.status, 0, `${name}: empty RunnerPort compiled`);
      assert.deepEqual([...output.matchAll(/error TS(\d+):/gu)].map(match => Number(match[1])), [2741], output);
      assert.match(output, /tests[\\/]negative[\\/]empty-runner\.ts\(\d+,\d+\): error TS2741:/u);
      assert.match(output, /Property 'run' is missing in type '\{\}'/u);
    }

    const compiler = await fixtureCompiler("typescript");
    const compiled = invokeFixtureNode([
      compiler.cli, "--project", "tsconfig.runtime.json", "--pretty", "false",
    ], directory, "semantic runtime emit");
    assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`);
    for (const entry of ["semantic", "lifetime", "workload"]) {
      const runtime = invokeFixtureNode([
        "--test", "--test-isolation=none", "--test-reporter=tap", `out/tests/module/${entry}.test.js`,
      ], directory, `${entry} consumer`, 60000);
      assert.equal(runtime.status, 0, `${runtime.stdout}\n${runtime.stderr}`);
      assert.match(runtime.stdout, /^# tests [1-9]\d*$/mu, `${entry} scenarios must actually execute`);
      assert.match(runtime.stdout, /^# fail 0$/mu, runtime.stdout);
      assert.match(runtime.stdout, /^# skipped 0$/mu, runtime.stdout);
      assert.match(runtime.stdout, /^# todo 0$/mu, runtime.stdout);
      if (entry === "workload") {
        for (const row of ["W-01", "W-02", "W-03"]) {
          assert.match(runtime.stdout, new RegExp(`^ok \\d+ - [^\\r\\n]*\\b${row}\\b`, "mu"),
            `${row} must appear in a successful workload test`);
        }
      }
      t.diagnostic(runtime.stdout.trim());
    }
    await t.test("H-03: held startup closes its one-shot input and exits after actual cleanup", async () => {
      t.diagnostic(JSON.stringify(await checkHeldStartupController(directory)));
    });
    t.diagnostic(JSON.stringify({ scenarios: ["C-01", "C-02", "C-03", "C-04a", "C-04b"],
      lifetime: ["L-01", "L-02", "L-03", "L-04", "L-05", "L-06", "L-07", "L-08", "L-09", "L-10"],
      workload: ["W-01", "W-02", "W-03"],
      runtime: "passed", packed: "owned-by-conformance-pack", source: "owned-by-installed-source-test",
      measurement: "not-selected", compatibility, ...evidence }));
  });
});
