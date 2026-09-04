import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { configuration, inputSnapshot, lab, sha256, verifyCapture } from "./execution-capture.mjs";

test("capture verifier detects source, manifest, command and result drift", (t) => {
  const root = mkdtempSync(join(tmpdir(), "gm-execution-verifier-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "pipe" }).toString().trim();
  git("init");
  mkdirSync(join(root, lab), { recursive: true });
  for (const path of [...configuration, `${lab}/run.mjs`]) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), "fixture\n");
  }
  const commit = () => { git("add", "."); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "test fixture"); return git("rev-parse", "HEAD"); };
  const sourceCommit = commit();
  const result = Buffer.from(JSON.stringify({ status: "pass", executionCount: 90, scenarioCount: 30, emittedDeclarations: { "fixture.d.ts": sha256("fixture") } }));
  const envelope = { kind: "api-authoring-execution", status: "pass", sourceCommit, inputs: inputSnapshot(root, sourceCommit), commands: [{ args: [`${lab}/run.mjs`], exitCode: 0 }], resultSha256: sha256(result), emittedDeclarations: JSON.parse(result).emittedDeclarations };
  assert.doesNotThrow(() => verifyCapture(root, envelope, result));
  assert.throws(() => verifyCapture(root, envelope, Buffer.from("{}")), /result digest/);
  const missing = structuredClone(envelope); delete missing.inputs[`${lab}/run.mjs`];
  assert.throws(() => verifyCapture(root, missing, result), /input manifest/);
  const failed = structuredClone(envelope); failed.commands[0].exitCode = 1;
  assert.throws(() => verifyCapture(root, failed, result));
  writeFileSync(join(root, lab, "run.mjs"), "changed");
  assert.throws(() => verifyCapture(root, envelope, result), /source drift/);
  writeFileSync(join(root, lab, "run.mjs"), "fixture\n");
  writeFileSync(join(root, lab, "new.ts"), "new");
  assert.throws(() => verifyCapture(root, envelope, result), /input set differs/);
  writeFileSync(join(root, ".gitignore"), "new.ts\n");
  assert.throws(() => verifyCapture(root, envelope, result), /input set differs/);
  rmSync(join(root, ".gitignore"));
  rmSync(join(root, lab, "new.ts"));
  writeFileSync(join(root, "report.md"), "evidence-only follow-up"); commit();
  assert.doesNotThrow(() => verifyCapture(root, envelope, result));
  writeFileSync(join(root, lab, "new.ts"), "new"); commit();
  assert.throws(() => verifyCapture(root, envelope, result), /input set differs/);
});
