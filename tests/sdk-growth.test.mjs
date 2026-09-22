import assert from "node:assert/strict";
import test from "node:test";

import { loadSdkGrowthModel, validateSdkGrowth } from "../architecture/checks/sdk-growth.mjs";

async function rejects(change, pattern) {
  const model = await loadSdkGrowthModel();
  await change(model);
  await assert.rejects(() => validateSdkGrowth(model), pattern);
}

test("G1 remains on explicit HOLD without external authority or released custody", async () => {
  assert.deepEqual(await validateSdkGrowth(await loadSdkGrowthModel()), {
    packages: 2,
    releasedPackages: 2,
    compatibility: "v1-retained",
    growthQualification: "v2",
    activation: "pending",
    status: "hold",
  });
});

test("rejects activation or qualification claims while authority is unavailable", async t => {
  await t.test("active", () => rejects(model => { model.status.status = "active"; }, /pending status/u));
  await t.test("qualified", () => rejects(model => { model.status.qualified = true; }, /pending status/u));
  await t.test("admitted claim", () => rejects(model => { model.status.claims.activation = true; }, /pending status/u));
});

test("rejects candidate-authored evidence masquerading as active authority", async t => {
  for (const path of [
    "architecture/sdk-growth/activation.json",
    "architecture/sdk-growth/evidence/grant.json",
    "architecture/sdk-growth/evidence/receipt.json",
  ]) {
    await t.test(path, () => rejects(model => { model.tracked.push(path); }, /obsolete self-authored active evidence/u));
  }
});

test("retains v1 compatibility while v2 admission is only a qualification profile", async t => {
  await t.test("active config cannot silently select v2", () => rejects(model => {
    model.foundationConfig.capabilities["package.public-api-compatibility"].configPath = model.profile.qualificationPolicyPath;
  }, /v1 compatibility retention/u));
  await t.test("v2 profile cannot be downgraded", () => rejects(model => {
    model.qualificationPolicy.schemaVersion = 1;
  }, /v2 qualification policy/u));
});

test("published packages cannot be reclassified as initial-unreleased", async t => {
  await t.test("policy", () => rejects(model => {
    model.qualificationPolicy.sdkGrowth.comparison.released[0] = {
      packageName: "@get-modular/assembly",
      kind: "initial-unreleased",
      trustedHistoryPath: "architecture/sdk-growth/evidence/history-assembly.json",
    };
  }, /published release classification|initial-unreleased/u));
  await t.test("history", () => rejects(model => {
    model.histories["@get-modular/core"].kind = "initial-unreleased-history";
  }, /release history classification/u));
});

test("unverified released bytes cannot be promoted into growth observations", () => rejects(model => {
  model.histories["@get-modular/core"].growthObservation = { status: "available", value: {} };
}, /unverified release evidence was promoted/u));

test("rejects package-scope narrowing and entrypoint replacement", async t => {
  await t.test("package omitted", () => rejects(model => {
    model.qualificationPolicy.packages.pop();
  }, /v2 package scope/u));
  await t.test("entrypoint replaced at the same count", () => rejects(model => {
    model.qualificationPolicy.packages[0].entrypoints[0] = {
      exportPath: "./replacement",
      declarationEntryPoint: "packages/assembly/dist/replacement.d.ts",
    };
  }, /policy scope drifted/u));
  await t.test("packed package scope emptied", () => rejects(model => {
    model.profile.packages = [];
  }, /packed profile package\/export scope/u));
  await t.test("packed exports emptied", () => rejects(model => {
    model.profile.packages[0].exports = [];
  }, /packed profile package\/export scope/u));
  await t.test("packed export replaced at the same count", () => rejects(model => {
    model.profile.packages[0].exports[0] = {
      exportPath: "./replacement",
      declarationPath: "packages/assembly/dist/replacement.d.ts",
      runtimePath: "packages/assembly/dist/replacement.js",
    };
  }, /packed profile package\/export scope/u));
});

test("rejects missing command and Foundation identity drift", async t => {
  await t.test("no-op command", () => rejects(model => {
    model.packageJson.scripts["sdk-growth:check"] = "node -e ''";
  }, /missing or a no-op/u));
  await t.test("version range", () => rejects(model => {
    model.packageJson.devDependencies["@agent-teams/engineering-foundation"] = "^1.5.1";
  }, /exact dev dependency/u));
  await t.test("registry integrity", () => rejects(model => {
    model.lockText = model.lockText.replace(model.profile.foundation.integrity, "sha512-forged");
  }, /registry identity/u));
});

test("rejects tracked ownership work outside G1", () => rejects(model => {
  model.tracked.push("packages/ownership/package.json");
}, /ownership package surface/u));
