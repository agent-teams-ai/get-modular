import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  PROFILE_DOCUMENT_PATH,
  PROFILE_PATH,
  SOURCE_DEPENDENCY_POLICY_PATH,
  productionPackagePaths,
  validateFeatureModuleStandardProfile,
  validateFirstProductionPackageAdmission,
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

test("keeps an empty pre-production repository honestly not-claimed", () => {
  assert.equal(validateFirstProductionPackageAdmission({
    productionPaths: [],
    foundationConfig: { schemaVersion: 1 },
    packageJson,
    sourceDependencyPolicyPresent: false,
  }), undefined);
});

test("first production package requires the Foundation source-dependency gate", () => {
  const input = {
    productionPaths: ["packages/core/src/index.ts"],
    foundationConfig: { schemaVersion: 1 },
    packageJson,
    sourceDependencyPolicyPresent: false,
  };
  assert.throws(() => validateFirstProductionPackageAdmission(input),
    /architecture\.source-dependencies capability/u);

  const configured = clone(input);
  configured.foundationConfig.capabilities = {
    "architecture.source-dependencies": { configPath: SOURCE_DEPENDENCY_POLICY_PATH },
  };
  assert.throws(() => validateFirstProductionPackageAdmission(configured),
    /first production package requires/u);

  configured.sourceDependencyPolicyPresent = true;
  assert.equal(
    validateFirstProductionPackageAdmission(configured),
    SOURCE_DEPENDENCY_POLICY_PATH,
  );

  const missingFastGate = clone(configured);
  missingFastGate.packageJson.scripts["check:fast"] = "pnpm docs:check";
  assert.throws(() => validateFirstProductionPackageAdmission(missingFastGate),
    /fast gate must execute/u);
});

test("production package discovery is deterministic and does not require packages to exist",
  async () => {
    const fixture = await mkdtemp(join(tmpdir(), "get-modular-profile-"));
    try {
      assert.deepEqual(await productionPackagePaths(fixture), []);
      await mkdir(join(fixture, "packages", "core", "src"), { recursive: true });
      await writeFile(join(fixture, "packages", "core", "package.json"), "{}\n");
      await writeFile(join(fixture, "packages", "core", "src", "index.ts"), "export {};\n");
      assert.deepEqual(await productionPackagePaths(fixture), [
        "packages/core/package.json",
        "packages/core/src/index.ts",
      ]);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });
