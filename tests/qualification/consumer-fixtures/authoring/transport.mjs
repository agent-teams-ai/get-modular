import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";

export async function checkHeldStartupController(directory) {
  const child = spawn(process.execPath, [join(directory, "out/tests/support/held-startup-controller.js")], {
    cwd: directory, stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, NODE_PATH: "", NODE_OPTIONS: "", NODE_TEST_CONTEXT: undefined },
  });
  let stdout = "", stderr = "", pending = "";
  let released = false, timedOut = false, failure, exit;
  const observations = [];
  const closed = new Promise(resolve => child.once("close", (code, signal) => resolve({ code, signal })));
  child.once("error", cause => { failure = cause; });
  child.once("exit", (code, signal) => { exit = { code, signal }; });
  child.stdin.once("error", cause => { failure = cause; });
  child.stderr.on("data", bytes => { stderr += bytes; });
  child.stdout.on("data", bytes => {
    stdout += bytes;
    pending += bytes;
    let boundary;
    while ((boundary = pending.indexOf("\n")) !== -1) {
      const line = pending.slice(0, boundary);
      pending = pending.slice(boundary + 1);
      try {
        const observation = JSON.parse(line);
        observations.push(observation);
        if (observation.kind === "pending") {
          assert.equal(released, false);
          assert.deepEqual(observation, { kind: "pending", startupState: "pending",
            cancellationRequested: true, identity: "held-startup-controller", phase: "stopping",
            ingressOpen: false, publications: 0, activeWork: 0 });
          child.stdin.write("release\n");
          released = true;
        }
      } catch (cause) { failure = cause; child.kill(); }
    }
  });
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, 60000);
  try {
    const close = await closed;
    assert.ifError(failure);
    assert.equal(timedOut, false, `controller did not exit naturally: ${stdout}\n${stderr}`);
    assert.deepEqual(exit, { code: 0, signal: null }, stderr);
    assert.deepEqual(close, exit);
    assert.equal(released, true);
    // Do not end the parent's writer: EOF would hide an unclosed input handle.
    assert.equal(child.stdin.writableEnded, false);
    assert.equal(stderr, "");
    assert.equal(pending, "");
    assert.deepEqual(observations.map(value => value.kind), ["pending", "complete"]);
    const complete = observations[1];
    assert.deepEqual(complete, { kind: "complete", outcome: "cancelled", ready: false,
      snapshot: { identity: "held-startup-controller", phase: "closed", ingressOpen: false,
        publications: 0, activeWork: 0, lastReport: { complete: true, settled: true, debts: [] } },
      report: { complete: true, settled: true, debts: [] }, effects: 0, releases: 1,
      resourceProbe: "EBADF", journalProbe: "EBADF" });
    return { scenario: "H-03", exit, close, parentWriterEnded: false, ...complete };
  } finally {
    clearTimeout(timer);
    child.stdin.destroy();
  }
}
