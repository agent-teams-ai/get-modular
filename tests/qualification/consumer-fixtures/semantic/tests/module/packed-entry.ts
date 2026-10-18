import assert from "node:assert/strict";
import { assemblyFor } from "@get-modular/assembly";
import { composeSemantic, type SemanticCapabilities } from "../../src/composition/semantic.root.js";
import { createAttempt } from "../support/attempt-owner.js";
import { createFileJournal } from "../support/journal.js";

const resolvedPackagePaths = {
  core: import.meta.resolve("@get-modular/core"),
  assembly: import.meta.resolve("@get-modular/assembly"),
  resources: import.meta.resolve("@get-modular/resources"),
  conformance: import.meta.resolve("@get-modular/conformance"),
};
const forbiddenSpecifier = "@get-modular/core/dist/index.js";
await assert.rejects(import(forbiddenSpecifier), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });

const preparation = await composeSemantic(assemblyFor<SemanticCapabilities>());
assert.equal(preparation.status, "prepared");
if (preparation.status !== "prepared") throw new Error("fixture.preparation.failed");
const journal = await createFileJournal();
await using attempt = createAttempt(preparation.prepared, "packed", journal);
const outcome = await attempt.startup;
assert.equal(outcome.status, "succeeded");
if (outcome.status !== "succeeded") throw new Error("fixture.construction.failed");
const result = await outcome.roots.session.run({ id: "packed-1", payload: " hello ", signal: attempt.signal });
assert.equal(result, "packed:A:hello");
const report = await attempt.close();
assert.deepEqual(report, { complete: true, settled: true, debts: [] });
assert.deepEqual(await journal.read(), [
  { kind: "resource-acquired", scope: "runner", id: "A", value: "A" },
  { kind: "effect", scope: "packed", id: "packed-1", value: "packed:A:hello" },
  { kind: "terminal", scope: "packed", id: "packed-1", value: "packed:A:hello" },
  { kind: "resource-released", scope: "runner", id: "A", value: "A" },
]);
await assert.rejects(journal.probe(), { code: "EBADF" });
process.stdout.write(`${JSON.stringify({ scenario: "C-05", result, complete: report.complete, resolvedPackagePaths })}\n`);
