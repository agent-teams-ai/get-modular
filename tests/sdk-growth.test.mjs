import assert from "node:assert/strict";
import test from "node:test";

import { loadSdkGrowthModel, validateSdkGrowth } from "../architecture/checks/sdk-growth.mjs";

async function rejects(change, pattern) {
  const model = await loadSdkGrowthModel();
  await change(model);
  await assert.rejects(() => validateSdkGrowth(model), pattern);
}

test("active G1 profile covers two packages, two exports and the metadata root", async () => {
  assert.deepEqual(await validateSdkGrowth(await loadSdkGrowthModel()), {
    packages: 2, exports: 2, metadataRoots: 1, phases: 7, activation: "active",
  });
});

test("rejects an omitted package", () => rejects(model => { model.profile.packages.pop(); }, /package surfaces/u));
test("rejects an omitted declared export", () => rejects(model => {
  model.profile.packages[0].exports = [];
}, /package surfaces/u));
test("rejects a package export absent from the growth profile", () => rejects(model => {
  model.manifests["@get-modular/core"].exports["./leak"] = "./dist/index.js";
}, /exports drifted/u));
test("rejects source path leakage", () => rejects(model => {
  model.profile.packages[0].exports[0].runtimePath = "packages/assembly/src/index.ts";
}, /package surfaces/u));
test("rejects export condition and path order drift", () => rejects(model => {
  const target = model.manifests["@get-modular/core"].exports["."];
  model.manifests["@get-modular/core"].exports["."] = { default: target.default, import: target.import };
}, /root condition order/u));
test("rejects a missing or no-op required command", () => rejects(model => {
  model.packageJson.scripts["sdk-growth:check"] = "node -e ''";
}, /missing or a no-op/u));
test("rejects trusted-base drift", () => rejects(model => {
  model.records.grant.value.trustedBaseDigest = `sha256:${"0".repeat(64)}`;
}, /grant evidence drifted/u));
test("rejects decision drift", () => rejects(model => {
  model.records.grant.value.decisionsDigest = `sha256:${"0".repeat(64)}`;
}, /grant evidence drifted/u));
test("rejects workflow bypass", () => rejects(model => {
  model.workflow.fullScanPaths = model.workflow.fullScanPaths.filter(path => path !== "architecture/sdk-growth");
}, /routing omits/u));
test("rejects forged package identity", () => rejects(model => {
  model.manifests["@get-modular/core"].name = "@get-modular/forged";
}, /manifest identity/u));
test("rejects candidate-controlled authority", () => rejects(model => {
  model.records.grant.value.authority.candidateControlled = true;
}, /candidate-independent/u));
test("rejects authority boundary substitution", () => rejects(model => {
  model.records.grant.value.authority.boundary = "./candidate-authority.mjs";
}, /external and candidate-independent/u));
test("rejects completion or receipt forgery", async t => {
  await t.test("completion", () => rejects(model => {
    model.records.completion.value.grantDigest = `sha256:${"0".repeat(64)}`;
  }, /completion does not bind/u));
  await t.test("receipt", () => rejects(model => {
    model.records.receipt.value.qualification = "not-qualified";
  }, /receipt is not qualified/u));
});
test("rejects Foundation version and registry integrity drift", async t => {
  await t.test("version", () => rejects(model => {
    model.packageJson.devDependencies["@agent-teams/engineering-foundation"] = "^1.5.1";
  }, /exact dev dependency/u));
  await t.test("integrity", () => rejects(model => {
    model.lockBytes = Buffer.from(model.lockBytes.toString("utf8").replace(model.profile.foundation.integrity, "sha512-forged"));
  }, /registry identity/u));
});
test("rejects Consumer Module Standard pin or delta drift", async t => {
  await t.test("pin", () => rejects(model => { model.standard.pinned.commit = "main"; }, /Command failed|standard bytes/u));
  await t.test("delta", () => rejects(model => { model.standard.delta.changedHunks = 0; }, /standard delta/u));
});
test("rejects a production Engineering Foundation import", () => rejects(model => {
  model.tracked["packages/core/src/forged.ts"] = Buffer.from('import "@agent-teams/engineering-foundation";\n');
}, /production Foundation import/u));
test("rejects tracked local dependencies and ownership surfaces", async t => {
  await t.test("local dependency", () => rejects(model => {
    model.tracked["packages/forged/package.json"] = Buffer.from(JSON.stringify({ dependency: ["file", ":../candidate"].join("") }));
  }, /tracked local dependency/u));
  await t.test("ownership", () => rejects(model => {
    model.tracked["packages/ownership/package.json"] = Buffer.from("{}");
  }, /ownership package surface/u));
});
