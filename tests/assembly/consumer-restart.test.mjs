import assert from "node:assert/strict";
import test from "node:test";
import {
  fixtureCompiler, invokeFixtureNode, withRecoveryConsumer,
} from "../qualification/consumer-fixtures/support/materialize.mjs";

test("consumer restart profiles preserve durable boundaries and real process custody", { timeout: 240000 }, async context => {
  await withRecoveryConsumer(async ({ directory, evidence }) => {
    const compiler = await fixtureCompiler("typescript");
    const compiled = invokeFixtureNode([
      compiler.cli, "--project", "tsconfig.runtime.json", "--pretty", "false",
    ], directory, "recovery runtime emit");
    assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`);
    const runtime = invokeFixtureNode([
      "--test", "--test-isolation=none", "--test-reporter=tap", "out/recovery/tests/recovery.test.js",
    ], directory, "recovery consumer", 60000);
    assert.equal(runtime.status, 0, `${runtime.stdout}\n${runtime.stderr}`);
    assert.match(runtime.stdout, /^# tests [1-9]\d*$/mu, "Recovery scenarios must actually execute.");
    assert.match(runtime.stdout, /^# fail 0$/mu, runtime.stdout);
    assert.match(runtime.stdout, /^# skipped 0$/mu, runtime.stdout);
    assert.match(runtime.stdout, /^# todo 0$/mu, runtime.stdout);
    context.diagnostic(runtime.stdout.trim());
    context.diagnostic(JSON.stringify({ profiles: ["record-only", "restart-pending"], runtime: "passed",
      compiler: { version: compiler.version, resolution: "NodeNext" }, source: "incomplete",
      custody: "live-supervisor", powerLossDurability: "not-selected", ...evidence }));
  });
});
