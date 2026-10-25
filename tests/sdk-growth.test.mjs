import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./qualification/sdk-growth-failure-retention.test.ts";

import { loadSdkGrowthModel, validateCmsGuidance, validateSdkGrowth } from "../architecture/checks/sdk-growth.mjs";

// Regression: Node stripping alone would admit a helper/test with invalid types.
test("SDK retention helper and IO tests pass strict typechecking", () => {
  const result = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc",
    "-p", "tests/qualification/tsconfig.sdk-growth-retention.json", "--noEmit"], {
    cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 60_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

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

// These mutations would make a feasibility note look like a completed qualification
// or bind a release to the wrong source. The P0 gate must reject each one.
test("P0 feasibility cannot promote historical release leads", async t => {
  await t.test("fabricated source binding", () => rejects(model => {
    model.feasibility.releases.find(row => row.packageName === "@get-modular/assembly").sourceBinding = "available";
  }, /cannot promote release evidence/u));
  await t.test("fabricated publisher custody", () => rejects(model => {
    model.feasibility.releases.find(row => row.packageName === "@get-modular/core").publisherCustody = "available";
  }, /cannot promote release evidence/u));
  await t.test("false completed disposition", () => rejects(model => {
    model.feasibility.disposition = "qualified";
  }, /P0 disposition/u));
});

test("P0 rejects drifted CMS, artifact and gate identities", async t => {
  await t.test("wrong current CMS hash", () => rejects(model => {
    model.cmsReview.acceptedCurrent.sha256 = "0".repeat(64);
  }, /current CMS pin/u));
  await t.test("changed CMS bytes", () => rejects(model => {
    model.cmsBytes = Buffer.from("substituted document");
  }, /CMS document bytes/u));
  await t.test("wrong Core ZIP", () => rejects(model => {
    model.feasibility.releases.find(row => row.packageName === "@get-modular/core").sourceLead.zipSha256 = "0".repeat(64);
  }, /Core recovery lead/u));
  await t.test("wrong Core lead kind", () => rejects(model => {
    model.feasibility.releases.find(row => row.packageName === "@get-modular/core").sourceLead.kind = "registry-upload-proof";
  }, /Core recovery lead/u));
  await t.test("wrong Core contained file", () => rejects(model => {
    model.feasibility.releases.find(row => row.packageName === "@get-modular/core").sourceLead.containedFile = "other.tgz";
  }, /Core recovery lead/u));
  await t.test("Assembly artifact falsely retained", () => rejects(model => {
    model.feasibility.releases.find(row => row.packageName === "@get-modular/assembly").sourceLead.retainedArtifactCount = 1;
  }, /Assembly recovery lead/u));
  await t.test("wrong Assembly lead kind", () => rejects(model => {
    model.feasibility.releases.find(row => row.packageName === "@get-modular/assembly").sourceLead.kind = "actions-build-artifact";
  }, /Assembly recovery lead/u));
  await t.test("gate marked complete", () => rejects(model => {
    model.feasibility.checks.futureGrowthQualification = "package.public-api-compatibility/v2";
  }, /P0 gate or deployment claim/u));
});

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
  await t.test("SDK check loses full-scan coverage", () => rejects(model => {
    const path = "architecture/checks/sdk-growth.mjs";
    model.workflow.fullScanPaths = model.workflow.fullScanPaths.filter(entry =>
      path !== entry && !path.startsWith(`${entry}/`));
    // A sibling with the same textual prefix does not cover the required file.
    model.workflow.fullScanPaths.push(`${path}-backup`);
  }, /changed-file routing omits architecture\/checks\/sdk-growth\.mjs/u));
  await t.test("version range", () => rejects(model => {
    model.packageJson.devDependencies["@agent-teams/engineering-foundation"] = "^1.5.1";
  }, /exact dev dependency/u));
  await t.test("stale exact 1.7.2 literal", () => rejects(model => {
    model.packageJson.devDependencies["@agent-teams/engineering-foundation"] = "1.7.2";
  }, /exact dev dependency/u));
  await t.test("stale exact 1.10.0 literal", () => rejects(model => {
    model.packageJson.devDependencies["@agent-teams/engineering-foundation"] = "1.10.0";
  }, /exact dev dependency/u));
  await t.test("stale exact 2.1.0 literal", () => rejects(model => {
    model.packageJson.devDependencies["@agent-teams/engineering-foundation"] = "2.1.0";
  }, /exact dev dependency/u));
  await t.test("registry integrity", () => rejects(model => {
    model.lockText = model.lockText.replace(model.profile.foundation.integrity, "sha512-forged");
  }, /registry identity/u));
});

// Versions outside any release keep these mutations real on feature and release branches.
test("retained baseline describes the current manifest version", async t => {
  await t.test("baseline behind its manifest", () => rejects(model => {
    model.baselines["@get-modular/assembly"].packageVersion = "0.0.1";
  }, /retained v1 baseline drifted/u));
  await t.test("manifest ahead of its baseline", () => rejects(model => {
    model.manifests["@get-modular/core"].version = "99.0.0";
  }, /retained v1 baseline drifted/u));
});

test("rejects tracked ownership work outside G1", () => rejects(model => {
  model.tracked.push("packages/ownership/package.json");
}, /ownership package surface/u));

// Current guidance must not be confused with the independently frozen P0 review.
test("CMS guidance authenticates migrated inputs without promoting pending adoption", async t => {
  const original = await loadSdkGrowthModel();
  assert.doesNotThrow(() => validateCmsGuidance(original));
  async function rejectCms(change, pattern) {
    const model = await loadSdkGrowthModel();
    change(model);
    assert.throws(() => validateCmsGuidance(model), pattern);
  }
  await t.test("previous current pin is stale", () => rejectCms(model => {
    model.cmsReview.acceptedCurrent = { ...model.cmsReview.delta.fromAcceptedCurrent };
  }, /current CMS pin/u));
  await t.test("descriptor-union successor cannot be mislabeled command-only", () => rejectCms(model => {
    model.cmsReview.delta.changesGetModularCompositionContract = false;
  }, /CMS delta review/u));
  for (const field of ["cmsBytes", "cmsPreviousBytes", "cmsP0Bytes", "cmsSourceBytes", "cmsDeltaBytes", "cmsPreviousReviewBytes",
    "cmsHistoricalDeltaBytes", "cmsP0ReviewBytes", "cms300eBytes", "cmsBunDeltaBytes", "cmsBunReviewBytes",
    "cmsGrowthPreviousBytes", "cmsGrowthDeltaBytes", "cmsGrowthReviewBytes",
    "cmsDrainPreviousBytes", "cmsDrainDeltaBytes", "cmsDrainReviewBytes", "cmsDrainGrowthPreviousBytes",
    "cmsDrainGrowthDeltaBytes", "cmsDrainGrowthReviewBytes", "cmsAuthoringDecisionBytes"]) {
    await t.test(field, () => rejectCms(model => {
      model[field] = Buffer.from("substituted input");
    }, /CMS .*bytes/u));
  }
  // These mutations would admit a selected-only map, hide a conflict, or erase custom-map guarantees.
  for (const [field, value] of [
    ["descriptorUnion", "directly-selected-descriptors-only"],
    ["capabilityBases", "one-combined-imported-union"],
    ["sourceLists", "independent-lists-with-omissions"],
    ["parity", "keys-only"],
    ["conflicts", "checked-only-after-host-selection"],
    ["upwardReferences", "ancestor-aggregate"],
    ["customMaps", "silently-project-descriptor-properties"],
    ["qualification", "qualified-by-historical-timings"],
  ]) {
    await t.test(field, () => rejectCms(model => {
      model.cmsReview.authoringReview[field] = value;
    }, /CMS authoring contract review/u));
  }
  await t.test("accepted authoring ADR identity cannot drift", () => rejectCms(model => {
    model.cmsReview.authoringReview.decision.sha256 = "0".repeat(64);
  }, /CMS authoring contract review/u));
  await t.test("review cannot omit a semantic change", () => rejectCms(model => {
    model.cmsReview.delta.semanticChanges.pop();
  }, /CMS delta review/u));
  await t.test("growth lifecycle adoption cannot expand", () => rejectCms(model => {
    model.cmsReview.growthScopeReview.observation = "selected";
  }, /growth CMS scope review/u));
  await t.test("growth old pin cannot become current", () => rejectCms(model => {
    model.cmsReview.acceptedCurrent = { ...model.cmsReview.growthScopeReview.previousCurrent };
  }, /current CMS pin/u));
  await t.test("outstanding evidence cannot disappear", () => rejectCms(model => {
    model.cmsReview.scopeReview.outstanding = [];
  }, /CMS scope review/u));
  await t.test("guidance cannot activate adoption", () => rejectCms(model => {
    model.cmsReview.scopeReview.activation = "active";
  }, /CMS scope review/u));
  await t.test("previous composition review cannot be rewritten", () => rejectCms(model => {
    const previous = JSON.parse(model.cmsPreviousReviewBytes.toString("utf8"));
    previous.delta.changesGetModularCompositionContract = false;
    model.cmsPreviousReviewBytes = Buffer.from(JSON.stringify(previous));
  }, /CMS retained delta or previous review bytes/u));
  await t.test("current review cannot rewrite historical P0", () => rejectCms(model => {
    model.feasibility.sourceCommit = model.cmsReview.acceptedCurrent.commit;
    model.feasibility.standard.currentSha256 = model.cmsReview.acceptedCurrent.sha256;
  }, /P0 disposition or standard/u));
});

// Missing retained bytes must fail during loading, before any qualification or activation decision.
test("CMS evidence loading rejects absent current and historical inputs", async t => {
  const root = await mkdtemp(join(tmpdir(), "gm-cms-retained-inputs-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = spawnSync("git", ["init", "--quiet", root], { encoding: "utf8" });
  assert.equal(git.status, 0, git.stderr);
  await cp("architecture", join(root, "architecture"), { recursive: true });
  for (const path of ["package.json", "pnpm-lock.yaml", "foundation.config.yaml", "docs/architecture/common-assembly.md",
    "packages/assembly/package.json", "packages/core/package.json",
    "docs/decisions/0041-preserve-complete-feature-maps-with-descriptor-unions.md"]) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await cp(path, join(root, path));
  }
  validateCmsGuidance(await loadSdkGrowthModel(root));
  const review = JSON.parse(await readFile("architecture/sdk-growth/evidence/consumer-module-standard.json", "utf8"));
  for (const path of [review.retainedEvidence.currentDocumentPath, review.retainedEvidence.deltaPath,
    review.retainedEvidence.previousReviewPath, review.retainedEvidence.growthPreviousDocumentPath,
    review.retainedEvidence.growthDeltaPath, review.retainedEvidence.growthPreviousReviewPath,
    "architecture/sdk-growth/evidence/cms-guidance-bun-20261020/common-assembly.diff",
    "architecture/sdk-growth/evidence/cms-guidance-20261020/previous-review.json",
    "architecture/sdk-growth/evidence/cms-guidance-drain-bun-20261022/common-assembly.diff",
    "architecture/sdk-growth/evidence/cms-guidance-drain-bun-20261022/previous-review.json",
    "architecture/sdk-growth/evidence/cms-guidance-drain-bun-20261022/growth-common-assembly.diff",
    "docs/decisions/0041-preserve-complete-feature-maps-with-descriptor-unions.md"]) {
    await t.test(path, async () => {
      const target = join(root, path);
      const bytes = await readFile(target);
      try {
        await rm(target);
        await assert.rejects(loadSdkGrowthModel(root), { code: "ENOENT" });
      } finally { await writeFile(target, bytes); }
    });
  }
});
