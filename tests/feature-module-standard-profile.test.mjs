import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PROFILE_DOCUMENT_PATH,
  PROFILE_PATH,
  validateFeatureModuleStandardProfile,
  validatePreConformanceArtifacts,
} from "../architecture/checks/feature-module-standard-profile.mjs";

const profile = JSON.parse(await readFile(PROFILE_PATH, "utf8"));
const document = await readFile(PROFILE_DOCUMENT_PATH, "utf8");
const docsIndex = await readFile("docs/README.md", "utf8");
const agentInstructions = await readFile("AGENTS.md", "utf8");
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const clone = value => structuredClone(value);

function validate(overrides = {}) {
  return validateFeatureModuleStandardProfile({
    profile,
    document,
    docsIndex,
    agentInstructions,
    packageJson,
    ...overrides,
  });
}

test("accepts the checked-in Get Modular adoption profile", () => {
  assert.doesNotThrow(() => validate());
});

test("rejects central identity and digest drift", () => {
  for (const [key, value] of [
    ["version", "v2"],
    ["repository", "agent-teams-ai/other"],
    ["git_blob_sha", "0".repeat(40)],
    ["sha256", "0".repeat(64)],
  ]) {
    const changed = clone(profile);
    changed.standard[key] = value;
    assert.throws(() => validate({ profile: changed }), /standard binding does not match/u);
  }
});

test("rejects silent scope, mapping, and authority drift", () => {
  const changedScope = clone(profile);
  changedScope.adoption.scope.production_roots = ["src"];
  assert.throws(() => validate({ profile: changedScope }), /scope does not match/u);

  const changedMapping = clone(profile);
  changedMapping.adoption.mapping.feature_root = "src/modules/*";
  assert.throws(() => validate({ profile: changedMapping }), /mapping does not match/u);

  const changedAuthority = clone(profile);
  changedAuthority.adoption.extensions[0].authority = "../outside.md";
  assert.throws(() => validate({ profile: changedAuthority }), /extensions does not match/u);
});

test("rejects premature conformance claims and weakened evidence", () => {
  const claimed = clone(profile);
  claimed.adoption.conformance.status = "conformant";
  assert.throws(() => validate({ profile: claimed }), /must remain not-claimed/u);

  const missingEvidence = clone(profile);
  missingEvidence.adoption.conformance.required_evidence.pop();
  assert.throws(() => validate({ profile: missingEvidence }), /conformance evidence does not match/u);
});

test("blocks production artifacts until structural conformance is activated", () => {
  assert.doesNotThrow(() => validatePreConformanceArtifacts({
    conformanceStatus: "not-claimed",
    productionArtifacts: [],
  }));
  assert.throws(() => validatePreConformanceArtifacts({
    conformanceStatus: "not-claimed",
    productionArtifacts: ["packages/core/src/index.ts"],
  }), /production artifacts require structural conformance/u);
});

test("requires explicit owned deviation records", () => {
  const changed = clone(profile);
  changed.adoption.deviations.push({
    clause: "universal-feature-ownership",
    scope: "packages/example",
    rationale: "",
    owner: "architecture",
    decision: "ADR-0003",
    review_trigger: "first production module",
  });
  assert.throws(() => validate({ profile: changed }), /deviation rationale must be non-empty/u);

  changed.adoption.deviations[0].rationale = "Temporary migration boundary";
  changed.adoption.deviations[0].decision = "issue-3";
  assert.throws(() => validate({ profile: changed }), /must reference an ADR/u);
});

test("requires profile enforcement in complete and fast gates", () => {
  const missingComplete = clone(packageJson);
  missingComplete.scripts.check = missingComplete.scripts.check.replace(
    " && pnpm architecture:feature-module-profile",
    "",
  );
  assert.throws(() => validate({ packageJson: missingComplete }),
    /complete gate must include architecture:feature-module-profile/u);

  const missingFast = clone(packageJson);
  missingFast.scripts["check:fast"] = "pnpm foundation:check && pnpm docs:check";
  assert.throws(() => validate({ packageJson: missingFast }),
    /fast gate must include profile binding/u);
});

test("keeps the profile reachable for humans and agents", () => {
  assert.throws(() => validate({
    docsIndex: docsIndex.replace("architecture/feature-module-standard.md", "architecture/other.md"),
  }), /documentation index must route/u);
  assert.throws(() => validate({
    agentInstructions: agentInstructions.replace(
      "docs/architecture/feature-module-standard.md",
      "docs/architecture/other.md",
    ),
  }), /agent navigation must route/u);
});
