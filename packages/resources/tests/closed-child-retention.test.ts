import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("successfully detached children release parent references while live and failed children retain them", context => {
  const environment: NodeJS.ProcessEnv = { ...process.env, NODE_OPTIONS: "" };
  delete environment.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--expose-gc", fileURLToPath(new URL("./closed-child-retention-probe.ts", import.meta.url))], {
    env: environment, encoding: "utf8", timeout: 60_000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /"retainedByControls":48/u, "the child process executed its retention controls");
  context.diagnostic(result.stdout.trim());
});
