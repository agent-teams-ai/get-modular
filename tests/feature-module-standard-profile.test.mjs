import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  PROFILE_DOCUMENT_PATH,
  PROFILE_PATH,
  SOURCE_DEPENDENCY_POLICY_PATH,
  validateFeatureModuleStandardProfile,
  validateFirstProductionPackageAdmission,
} from "../architecture/checks/feature-module-standard-profile.mjs";
import { productionArtifactPaths } from "../architecture/checks/production-artifacts.mjs";

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
  for (const [claim, status] of [
    ["structural", "structural-conformant"],
    ["runtime", "runtime-conformant"],
  ]) {
    const claimed = clone(profile);
    claimed.adoption.conformance[claim].status = status;
    assert.throws(() => validate({ profile: claimed }),
      new RegExp(`${claim} conformance must remain not-claimed`, "u"));
  }

  const missingEvidence = clone(profile);
  missingEvidence.adoption.conformance.structural.required_evidence.pop();
  assert.throws(() => validate({ profile: missingEvidence }),
    /structural conformance evidence does not match/u);
});

test("keeps source admission distinct from structural and runtime conformance", () => {
  const changed = clone(profile);
  changed.adoption.admission.status = "source-admitted";
  assert.doesNotThrow(() => validate({ profile: changed }));
  assert.equal(changed.adoption.conformance.structural.status, "not-claimed");
  assert.equal(changed.adoption.conformance.runtime.status, "not-claimed");

  changed.adoption.admission.foundation.command = "node -e 'process.exit(0)'";
  assert.throws(() => validate({ profile: changed }), /Foundation admission binding/u);
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
    productionArtifacts: [],
    admission: profile.adoption.admission,
    foundationConfig: { schemaVersion: 1 },
    packageJson,
    sourceDependencyPolicyPresent: false,
  }), undefined);
});

test("first production package requires the Foundation source-dependency gate", () => {
  const input = {
    productionArtifacts: ["packages/core/src/index.ts"],
    admission: {
      ...profile.adoption.admission,
      status: "source-admitted",
    },
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

test("first production package cannot use a no-op Foundation alias", () => {
  const packageWithNoOp = clone(packageJson);
  packageWithNoOp.scripts["foundation:check"] = "node -e 'process.exit(0)'";
  assert.throws(() => validateFirstProductionPackageAdmission({
    productionArtifacts: ["packages/core/src/index.ts"],
    admission: { ...profile.adoption.admission, status: "source-admitted" },
    foundationConfig: {
      capabilities: {
        "architecture.source-dependencies": { configPath: SOURCE_DEPENDENCY_POLICY_PATH },
      },
    },
    packageJson: packageWithNoOp,
    sourceDependencyPolicyPresent: true,
  }), /foundation:check must execute agent-teams-foundation check/u);
});

test("production source outside packages cannot bypass first-package admission", () => {
  assert.throws(() => validateFirstProductionPackageAdmission({
    productionArtifacts: ["src/compiler.ts"],
    admission: { ...profile.adoption.admission, status: "source-admitted" },
    foundationConfig: { schemaVersion: 1 },
    packageJson,
    sourceDependencyPolicyPresent: false,
  }), /production artifacts must be below packages: src\/compiler\.ts/u);
});

test("production artifact discovery is repository-wide and deterministic",
  async () => {
    const fixture = await mkdtemp(join(tmpdir(), "get-modular-profile-"));
    try {
      await writeFile(join(fixture, "package.json"), "{\"private\":true}\n");
      assert.deepEqual(await productionArtifactPaths(fixture), []);
      await mkdir(join(fixture, "packages", "core", "src"), { recursive: true });
      await writeFile(join(fixture, "packages", "core", "package.json"), "{}\n");
      await writeFile(join(fixture, "packages", "core", "src", "index.ts"), "export {};\n");
      await mkdir(join(fixture, "src"));
      await writeFile(join(fixture, "src", "compiler.ts"), "export {};\n");
      assert.deepEqual(await productionArtifactPaths(fixture), [
        "packages/core/package.json",
        "packages/core/src/index.ts",
        "src/compiler.ts",
      ]);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });
