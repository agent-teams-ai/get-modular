import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import test from "node:test";
import { unpackDescriptorSource, replayDescriptorFixture } from "../../../architecture/checks/retained-descriptor-source.mjs";

const root = new URL("../../../", import.meta.url);
const read = path => readFile(new URL(path, root));
const archivePath = "architecture/qualification/generation-two/retained-object-descriptor-source.json.gz";

test("unchanged descriptor oracle runs on authenticated historical witnesses, independently of live Core test bytes", async () => {
  const reads = [];
  const result = await replayDescriptorFixture(path => {
    reads.push(path);
    assert.equal(path.startsWith("packages/core/"), false, "historical oracle must not inspect evolving Core witnesses");
    return read(path);
  });
  assert.equal(result.scope, "fresh-replay-of-historical-fixture");
  assert.equal(result.coreExecuted, false);
  assert.match(result.stdout, /proposed-only\/object-descriptor-observation-retention/u);
  assert.equal(reads.length, 4);
});

test("changed archive, witness, membership and path are rejected before historical execution", async () => {
  const original = await read(archivePath);
  assert.equal(unpackDescriptorSource(original).size, 12);
  for (const mutation of ["witness", "runner", "missing", "duplicate", "unsafe"]) {
    const payload = JSON.parse(gunzipSync(original).toString("utf8"));
    if (mutation === "witness") payload.files.at(-1).bytesBase64 = Buffer.from("changed live test").toString("base64");
    if (mutation === "runner") payload.files[0].bytesBase64 = Buffer.from("throw Error('substitution')").toString("base64");
    if (mutation === "missing") payload.files.pop();
    if (mutation === "duplicate") payload.files[1] = payload.files[0];
    if (mutation === "unsafe") payload.files[0].path = "../escape.mjs";
    assert.throws(() => unpackDescriptorSource(gzipSync(JSON.stringify(payload))), /archive identity/u, mutation);
  }
});

test("historical replay cannot hide drift in current immutable recipes, runner or accepted ledger", async () => {
  for (const target of [
    "tests/qualification/m2-candidate/object-descriptor-cases.mjs",
    "tests/qualification/m2-candidate/object-descriptor-cases.test.mjs",
    "architecture/authority/diagnostic-generation-two-ledger.json",
  ]) {
    await assert.rejects(replayDescriptorFixture(async path => {
      const bytes = await read(path);
      return path === target ? Buffer.concat([bytes, Buffer.from(" ")]) : bytes;
    }), undefined, target);
  }
});
