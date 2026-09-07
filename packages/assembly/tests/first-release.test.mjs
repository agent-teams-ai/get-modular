import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { publishFirstAssemblyRelease, publishFirstCoreRelease } from "../../../architecture/tooling/first-core-release.mjs";

function fixture() {
  const archive = Buffer.from("retained Assembly fixture");
  const identity = { name: "@get-modular/assembly", version: "0.1.0", archive,
    sha256: createHash("sha256").update(archive).digest("hex"),
    integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
    provisionalTag: "assembly-first-0-1-0", intendedTag: "latest",
    previousTags: { provisional: null, intended: null } };
  const calls = [], saved = [], state = { bytes: null, tags: {}, hidden: false };
  const effects = {
    async readVersion({ name, version }) {
      calls.push("read");
      assert.equal(name, identity.name);
      return state.bytes === null || state.hidden ? null
        : { name, version, integrity: identity.integrity, tarball: "fixture:assembly" };
    },
    async download() { calls.push("download"); return Buffer.from(state.bytes); },
    async upload(request) {
      calls.push("upload");
      assert.equal(saved.at(-1).stage, "upload-intent");
      assert.equal(saved.at(-1).uploadAttempted, true);
      assert.equal(request.name, identity.name);
      assert.deepEqual(request.archive, archive);
      state.bytes = Buffer.from(request.archive);
      state.tags[request.tag] = request.version;
    },
    async consumer(request) {
      calls.push("consumer");
      assert.equal(request.name, identity.name);
      assert.deepEqual(request.archive, archive);
      return true;
    },
    async readTags() { calls.push("tags"); return { ...state.tags }; },
    async setTag(request) {
      calls.push("promote");
      assert.equal(saved.at(-1).stage, "promotion-intent");
      assert(saved.at(-1).evidence.some(item => item.operation === "consumer" && item.ok));
      state.tags[request.tag] = request.version;
    },
  };
  const checkpoint = { async save(record) { saved.push(structuredClone(record)); } };
  return { identity, effects, checkpoint, calls, saved, state,
    run: resume => publishFirstAssemblyRelease({ identity, effects, checkpoint: { ...checkpoint, resume } }) };
}

test("Assembly wrapper preserves retained identity and durable upload/consumer/promotion order", async () => {
  const f = fixture();
  const result = await f.run();
  assert.equal(result.status, "completed");
  assert.deepEqual(f.calls, ["read", "tags", "upload", "read", "download", "consumer", "tags", "promote", "tags"]);
  assert.equal(result.checkpoint.identity.name, "@get-modular/assembly");
  assert.equal(f.state.tags.latest, "0.1.0");
});

test("package-specific wrappers reject the other package before effects", async () => {
  for (const [run, name] of [[publishFirstAssemblyRelease, "@get-modular/core"],
    [publishFirstCoreRelease, "@get-modular/assembly"], [publishFirstAssemblyRelease, "@rogue/package"]]) {
    const f = fixture();
    f.identity.name = name;
    const result = await run(f);
    assert.equal(result.reason, "invalid-input");
    assert.deepEqual(f.calls, []);
  }
});

test("uncertain Assembly upload resumes with reconciliation and no second upload", async () => {
  const f = fixture();
  const upload = f.effects.upload;
  f.effects.upload = async request => {
    await upload(request);
    f.state.hidden = true;
    throw new Error("lost response");
  };
  const first = await f.run();
  assert.equal(first.status, "incomplete");
  assert.equal(first.reason, "version-readback-unconfirmed");
  assert.equal(f.calls.filter(call => call === "read").length, 4);
  assert.equal(first.checkpoint.uploadAttempted, true);
  f.state.hidden = false;
  const resumed = await f.run(first.checkpoint);
  assert.equal(resumed.status, "completed");
  assert.equal(f.calls.filter(call => call === "upload").length, 1);
  assert.equal(f.calls.filter(call => call === "promote").length, 1);
});
