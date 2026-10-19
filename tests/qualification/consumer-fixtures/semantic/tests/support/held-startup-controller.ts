import assert from "node:assert/strict";
import { assemblyFor, group } from "@get-modular/assembly";
import type { SemanticCapabilities } from "../../src/composition/semantic.root.js";
import { sessionGroup } from "../../src/features/session/composition/session.group.js";
import { identityInput, journalInput } from "../../src/features/session/composition/session.inputs.js";
import { sessionModule } from "../../src/features/session/composition/session.module.js";
import { lifetimeControls, lifetimeRunner } from "../features/runner/lifetime.js";
import { createAttempt } from "./attempt-owner.js";
import { barrier } from "./barriers.js";
import { createFileJournal } from "./journal.js";

const hold = barrier();
const controls = lifetimeControls({ holdReturn: hold });
const prepared = await assemblyFor<SemanticCapabilities>().prepare({
  profileId: "fixture/semantic/held-startup-controller",
  modules: [group("runner", [lifetimeRunner(controls)]), sessionGroup],
  roots: { session: sessionModule },
  inputs: { identity: identityInput, journal: journalInput },
});
assert.equal(prepared.status, "prepared");
if (prepared.status !== "prepared") throw new Error("fixture.preparation.failed");
const journal = await createFileJournal();
await using attempt = createAttempt(prepared.prepared, "held-startup-controller", journal);
let startupState = "pending";
void attempt.startup.then(outcome => { startupState = outcome.status; });
await controls.acquired.reached;
const stopping = attempt.stop();
try {
  console.log(JSON.stringify({ kind: "pending", startupState,
    cancellationRequested: attempt.signal.aborted, ...attempt.snapshot() }));
  await new Promise<void>((resolve, reject) => {
    process.stdin.once("error", reject);
    process.stdin.once("end", () => reject(new Error("fixture.controller.release-missing")));
    process.stdin.once("data", () => {
      // The accepted release is the only input. Close its transport so an open
      // parent writer cannot retain the process after the actual attempt closes.
      process.stdin.destroy();
      resolve();
    });
  });
} finally {
  hold.release();
  const outcome = await attempt.startup;
  const ready = await attempt.ready;
  const report = await stopping;
  assert.equal(outcome.status, "cancelled");
  assert.equal(ready, false);
  assert.deepEqual(report, { complete: true, settled: true, debts: [] });
  assert.equal(attempt.snapshot().phase, "closed");
  assert.equal(attempt.snapshot().ingressOpen, false);
  assert.equal(attempt.snapshot().publications, 0);
  assert.equal(attempt.snapshot().activeWork, 0);
  assert.deepEqual(controls.enteredIds, []);
  const records = await journal.read();
  assert.deepEqual(records, [
    { kind: "resource-acquired", scope: "runner", id: "A", value: "A" },
    { kind: "cleanup-attempt", scope: "runner", id: "A", value: "1" },
    { kind: "resource-released", scope: "runner", id: "A", value: "A" },
  ]);
  assert.ok(controls.resource);
  await assert.rejects(controls.resource.probe(), { code: "EBADF" });
  await assert.rejects(journal.probe(), { code: "EBADF" });
  console.log(JSON.stringify({ kind: "complete", outcome: outcome.status, ready,
    snapshot: attempt.snapshot(), report, effects: 0, releases: 1,
    resourceProbe: "EBADF", journalProbe: "EBADF" }));
}
