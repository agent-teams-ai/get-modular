import assert from "node:assert/strict";
import test from "node:test";
import { runGrowthCorrectness } from "../qualification/consumer-fixtures/growth/run.mjs";

// Let the existing 600-second supervisor retain its failure report before this outer guard.
test("G-01: the real eight-feature tree passes independent oracles and complete smoke", { timeout: 660000 }, async t => {
  const report = await runGrowthCorrectness();
  assert.equal(report.size, 8);
  assert.deepEqual(report.scenarios, ["G-01"]);
  t.diagnostic(JSON.stringify(report));
});
