import assert from "node:assert/strict";
import { measureGrowth } from "./run.mjs";

assert.equal(process.argv.length, 4, "Usage: node measure.mjs --size <8|100|500|1000>");
assert.equal(process.argv[2], "--size", "fixture.growth.unsupported-option");
const size = Number(process.argv[3]);
assert.ok([8, 100, 500, 1000].includes(size), "fixture.growth.unsupported-size");
console.log(JSON.stringify({ size, budgetsMs: { compiler: 180000, runtime: 120000, scanner: 0, aggregate: 600000 },
  sourceCoverage: "incomplete", stages: ["generation", "cold current/NodeNext emit", "runtime and full smoke",
    ...(size === 8 ? [] : ["unchanged incremental", "leaf edit and checksum", "baseline rewarm (setup)", "shared-contract edit and checksum"])],
  incrementalEdits: size === 8 ? "not-selected for G-01" : "fixed G-03 patches; one sample per stage" }));
const result = await measureGrowth({ size });
console.log(JSON.stringify({ status: result.status, size, directory: result.directory, graph: result.runtime.graph,
  roots: result.runtime.seeds.map(({ seed, root }) => ({ seed, root })), smoke: {
    attempts: result.runtime.smoke.attempts, factoryCalls: result.runtime.smoke.factoryCalls,
  }, sourceCoverage: result.sourceCoverage, stages: result.stages, supervision: result.supervision }));
