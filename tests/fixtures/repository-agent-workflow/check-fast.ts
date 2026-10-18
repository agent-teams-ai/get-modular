import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

assert.equal(process.argv.length, 2, "check:fast must not receive changed paths");
const compiler = process.env.GET_MODULAR_TEST_COMPILER;
assert.ok(compiler, "the fixture must receive its owning TypeScript compiler");
const result = spawnSync(process.execPath, [compiler, "-p", "tsconfig.base.json", "--noEmit"], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
