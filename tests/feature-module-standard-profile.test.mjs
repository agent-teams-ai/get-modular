import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  PROFILE_DOCUMENT_PATH,
  PROFILE_PATH,
  SOURCE_DEPENDENCY_POLICY_PATH,
  validateFeatureModuleStandardProfile,
  publicationBlockers,
  validateFirstProductionPackageAdmission,
} from "../architecture/checks/feature-module-standard-profile.mjs";
import {
  manifestCarrierViolations,
  packageIdentityViolations,
  packageManifestInventory,
  productionArtifactPaths,
  productionArtifactSymlinkPaths,
} from "../architecture/checks/production-artifacts.mjs";

const profile = JSON.parse(await readFile(PROFILE_PATH, "utf8"));
const document = await readFile(PROFILE_DOCUMENT_PATH, "utf8");
const docsIndex = await readFile("docs/README.md", "utf8");
const agentInstructions = await readFile("AGENTS.md", "utf8");
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const clone = value => structuredClone(value);
const coreManifest = new Map([
  ["packages/core/package.json", { name: "@get-modular/core", private: true }],
]);

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

test("accepts ordered conformance states and rejects unsupported status values", () => {
  const premature = clone(profile);
  premature.adoption.admission.status = "pre-production";
  premature.adoption.conformance.structural.status = "structural-conformant";
  assert.throws(() => validate({ profile: premature }), /requires source-admitted status/u);

  const structural = clone(profile);
  structural.adoption.admission.status = "source-admitted";
  structural.adoption.conformance.structural.status = "structural-conformant";
  assert.doesNotThrow(() => validate({ profile: structural }));

  const runtime = clone(structural);
  runtime.adoption.conformance.runtime.status = "runtime-conformant";
  assert.doesNotThrow(() => validate({ profile: runtime }));

  for (const claim of ["structural", "runtime"]) {
    const invalid = clone(profile);
    invalid.adoption.conformance[claim].status = "promoted-without-evidence";
    assert.throws(() => validate({ profile: invalid }),
      new RegExp(`${claim} conformance has an unsupported status`, "u"));
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
    /check must use its exact closed pnpm command chain/u);

  const missingFast = clone(packageJson);
  missingFast.scripts["check:fast"] = "pnpm foundation:check && pnpm docs:check";
  assert.throws(() => validate({ packageJson: missingFast }),
    /check:fast must use its exact closed pnpm command chain/u);

  for (const scriptName of ["check", "check:fast"]) {
    for (const prefix of [": # && ", ":; ", ": || ", ": | ", ":\n"]) {
      const bypass = clone(packageJson);
      bypass.scripts[scriptName] = `${prefix}${bypass.scripts[scriptName]}`;
      assert.throws(() => validate({ packageJson: bypass }),
        /must use its exact closed pnpm command chain/u);
    }
    const commands = packageJson.scripts[scriptName].split(" && ");
    for (const removed of commands) {
      const incomplete = clone(packageJson);
      incomplete.scripts[scriptName] = commands
        .filter(command => command !== removed)
        .join(" && ");
      assert.throws(() => validate({ packageJson: incomplete }),
        /must use its exact closed pnpm command chain/u);
    }
  }

  for (const scriptName of [
    "core:build",
    "core:typecheck",
    "core:typecheck:prepared",
    "core:test",
    "assembly:build",
    "assembly:typecheck",
    "assembly:test",
    "architecture:feature-module-profile",
    "architecture:feature-module-profile:test",
    "contracts:check",
    "contracts:test",
    "docs:check",
    "docs:protocol:check",
    "docs:quality",
    "foundation:check",
    "foundation:assert-dev-only",
    "foundation:assert-registry",
    "governance:check",
    "governance:test",
    "qualification:resource-profile",
    "qualification:v1-diagnostics-protocol",
    "qualification:v1-graph-semantics",
    "qualification:self-composition-templates",
    "runtime:preflight",
  ]) {
    const noOp = clone(packageJson);
    noOp.scripts[scriptName] = ":";
    assert.throws(() => validate({ packageJson: noOp }),
      new RegExp(`${scriptName} must use its closed command definition`, "u"));
  }
});

test("rejects Foundation before generation and redundant aggregate preparation", () => {
  for (const scriptName of ["check", "check:fast"]) {
    const reordered = clone(packageJson);
    const commands = reordered.scripts[scriptName].split(" && ");
    const preparation = scriptName === "check" ? "governance:check" : "assembly:build";
    const build = commands.indexOf(`pnpm ${preparation}`);
    assert.notEqual(build, -1);
    const foundation = commands.indexOf("pnpm foundation:check");
    [commands[build], commands[foundation]] = [commands[foundation], commands[build]];
    reordered.scripts[scriptName] = commands.join(" && ");
    assert.throws(() => validate({ packageJson: reordered }),
      /must use its exact closed pnpm command chain/u);
    const redundant = clone(packageJson);
    redundant.scripts[scriptName] = redundant.scripts[scriptName].replace(
      "pnpm core:typecheck:prepared", "pnpm core:typecheck",
    );
    assert.throws(() => validate({ packageJson: redundant }),
      /must use its exact closed pnpm command chain/u);
  }
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
    publicationBlockerIds: new Set(["OD-005"]),
    productionArtifacts: [],
    admission: { ...profile.adoption.admission, status: "pre-production" },
    foundationConfig: { schemaVersion: 1 },
    packageJson,
    sourceDependencyPolicyPresent: false,
  }), undefined);

  for (const scriptName of [
    "foundation:check",
    "foundation:assert-dev-only",
    "foundation:assert-registry",
  ]) {
    const noOp = clone(packageJson);
    noOp.scripts[scriptName] = ":";
    assert.throws(() => validateFirstProductionPackageAdmission({
      publicationBlockerIds: new Set(["OD-005"]),
      productionArtifacts: [],
      admission: profile.adoption.admission,
      foundationConfig: { schemaVersion: 1 },
      packageJson: noOp,
      sourceDependencyPolicyPresent: false,
    }), /closed/u);
  }
});

test("first production package requires the Foundation source-dependency gate", () => {
  const input = {
    publicationBlockerIds: new Set(["OD-005"]),
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

  for (const path of [
    "/packages/core/src/index.ts",
    "packages\\core\\src\\index.ts",
    "C:/packages/core/src/index.ts",
    "packages//core/src/index.ts",
    "packages/./core/src/index.ts",
    "packages/core/../core/src/index.ts",
    "packages/core:/src/index.ts",
    "packages/core./src/index.ts",
    "packages/con/src/index.ts",
    "packages/core /src/index.ts",
    "packages/core/src/index\n.ts",
    "packages/COM¹/src/index.ts",
    "packages/LPT².txt/src/index.ts",
    "packages/core\u007f/src/index.ts",
    "packages/core\u0085/src/index.ts",
    "packages/core\u200e/src/index.ts",
    "packages/core\u202e/src/index.ts",
    "packages/core\u2066/src/index.ts",
    "packages/core\u2069/src/index.ts",
    "packages/CONIN$/src/index.ts",
    "packages/CONOUT$/src/index.ts",
  ]) {
    assert.throws(() => validateFirstProductionPackageAdmission({
      ...input,
      productionArtifacts: [path],
    }), /portable repository-relative paths/u);
  }

  const configured = clone(input);
  configured.foundationConfig.capabilities = {
    "architecture.source-dependencies": { configPath: SOURCE_DEPENDENCY_POLICY_PATH },
  };
  assert.throws(() => validateFirstProductionPackageAdmission(configured),
    /first production package requires/u);

  configured.sourceDependencyPolicyPresent = true;
  configured.productionArtifacts = ["packages/core/package.json"];
  configured.productionPackageManifests = coreManifest;
  assert.throws(() => validateFirstProductionPackageAdmission(configured),
    /requires substantive source below packages\/core\/src/u);
  configured.productionArtifacts = ["packages/core/package.json", "packages/core/README.md"];
  assert.throws(() => validateFirstProductionPackageAdmission(configured),
    /requires substantive source below packages\/core\/src/u);
  for (const extension of ["cjsx", "mjsx", "ctsx", "mtsx"]) {
    configured.productionArtifacts = [
      "packages/core/package.json",
      `packages/core/src/not-source.${extension}`,
    ];
    assert.throws(() => validateFirstProductionPackageAdmission(configured),
      /requires substantive source below packages\/core\/src/u);
  }
  configured.productionArtifacts = [
    "packages/core/package.json",
    "packages/core/tests/smoke.test.ts",
  ];
  assert.throws(() => validateFirstProductionPackageAdmission(configured),
    /requires substantive source below packages\/core\/src/u);
  configured.productionArtifacts = [
    "packages/core/package.json",
    "packages/core/src/index.ts",
    "packages/conformance/package.json",
  ];
  configured.productionPackageManifests = new Map([
    ...coreManifest,
    ["packages/conformance/package.json", {
      name: "@get-modular/conformance",
      private: true,
    }],
  ]);
  assert.throws(() => validateFirstProductionPackageAdmission(configured),
    /requires substantive source below packages\/conformance\/src/u);

  configured.productionArtifacts = ["packages/core/package.json", "packages/core/src/index.ts"];
  configured.productionPackageManifests = coreManifest;
  assert.equal(
    validateFirstProductionPackageAdmission(configured),
    SOURCE_DEPENDENCY_POLICY_PATH,
  );

  const missingFastGate = clone(configured);
  missingFastGate.packageJson.scripts["check:fast"] = "pnpm docs:check";
  assert.throws(() => validateFirstProductionPackageAdmission(missingFastGate),
    /check:fast must use its exact closed pnpm command chain/u);
});

test("first production package cannot use a no-op Foundation alias", () => {
  const packageWithNoOp = clone(packageJson);
  packageWithNoOp.scripts["foundation:check"] = "node -e 'process.exit(0)'";
  assert.throws(() => validateFirstProductionPackageAdmission({
    publicationBlockerIds: new Set(["OD-005"]),
    productionArtifacts: ["packages/core/package.json", "packages/core/src/index.ts"],
    admission: { ...profile.adoption.admission, status: "source-admitted" },
    foundationConfig: {
      capabilities: {
        "architecture.source-dependencies": { configPath: SOURCE_DEPENDENCY_POLICY_PATH },
      },
    },
    packageJson: packageWithNoOp,
    sourceDependencyPolicyPresent: true,
    productionPackageManifests: coreManifest,
  }), /foundation:check must use its closed command definition/u);

  const commented = clone(packageJson);
  commented.scripts["foundation:check"] = ": # && agent-teams-foundation check";
  assert.throws(() => validateFirstProductionPackageAdmission({
    publicationBlockerIds: new Set(["OD-005"]),
    productionArtifacts: ["packages/core/package.json", "packages/core/src/index.ts"],
    admission: { ...profile.adoption.admission, status: "source-admitted" },
    foundationConfig: {
      capabilities: {
        "architecture.source-dependencies": { configPath: SOURCE_DEPENDENCY_POLICY_PATH },
      },
    },
    packageJson: commented,
    sourceDependencyPolicyPresent: true,
    productionPackageManifests: coreManifest,
  }), /foundation:check must use its closed command definition/u);

  for (const scriptName of ["foundation:assert-dev-only", "foundation:assert-registry"]) {
    const noOp = clone(packageJson);
    noOp.scripts[scriptName] = ":";
    assert.throws(() => validateFirstProductionPackageAdmission({
      publicationBlockerIds: new Set(["OD-005"]),
      productionArtifacts: ["packages/core/package.json", "packages/core/src/index.ts"],
      admission: { ...profile.adoption.admission, status: "source-admitted" },
      foundationConfig: {
        capabilities: {
          "architecture.source-dependencies": { configPath: SOURCE_DEPENDENCY_POLICY_PATH },
        },
      },
      packageJson: noOp,
      sourceDependencyPolicyPresent: true,
      productionPackageManifests: coreManifest,
    }), new RegExp(`${scriptName} must use its closed command definition`, "u"));
  }
});

test("rejects unknown package identities even with no active publication blockers", () => {
  assert.throws(() => validateFirstProductionPackageAdmission({
    publicationBlockerIds: new Set(["OD-005"]),
    productionArtifacts: ["packages/rogue/package.json", "packages/rogue/src/index.ts"],
    productionPackageManifests: new Map([
      ["packages/rogue/package.json", { name: "@example/rogue", private: true }],
    ]),
    admission: { ...profile.adoption.admission, status: "source-admitted" },
    foundationConfig: {
      capabilities: {
        "architecture.source-dependencies": { configPath: SOURCE_DEPENDENCY_POLICY_PATH },
      },
    },
    packageJson,
    sourceDependencyPolicyPresent: true,
  }), /must use an accepted package identity/u);
});

test("rejects publication fields on an otherwise accepted private package", () => {
  assert.throws(() => validateFirstProductionPackageAdmission({
    publicationBlockerIds: new Set(["OD-005"]),
    productionArtifacts: ["packages/core/package.json", "packages/core/src/index.ts"],
    productionPackageManifests: new Map([
      ["packages/core/package.json", {
        name: "@get-modular/core", private: true, exports: { ".": "./src/index.js" },
      }],
    ]),
    admission: { ...profile.adoption.admission, status: "source-admitted" },
    foundationConfig: {
      capabilities: {
        "architecture.source-dependencies": { configPath: SOURCE_DEPENDENCY_POLICY_PATH },
      },
    },
    packageJson,
    sourceDependencyPolicyPresent: true,
  }), /must not declare publication fields/u);
});

test("rejects an unmanifested or nested production package root", () => {
  const baseInput = {
    publicationBlockerIds: new Set(["OD-005"]),
    admission: { ...profile.adoption.admission, status: "source-admitted" },
    foundationConfig: {
      capabilities: {
        "architecture.source-dependencies": { configPath: SOURCE_DEPENDENCY_POLICY_PATH },
      },
    },
    packageJson,
    sourceDependencyPolicyPresent: true,
    productionPackageManifests: coreManifest,
  };
  assert.throws(() => validateFirstProductionPackageAdmission({
    ...baseInput,
    productionArtifacts: ["packages/core/package.json", "packages/core/src/index.ts", "packages/other/src/index.ts"],
  }), /every production package root requires a manifest/u);
  assert.throws(() => validateFirstProductionPackageAdmission({
    ...baseInput,
    productionArtifacts: ["packages/group/core/package.json", "packages/group/core/src/index.ts"],
    productionPackageManifests: new Map([
      ["packages/group/core/package.json", { name: "@get-modular/core", private: true }],
    ]),
  }), /production package manifests must be direct package roots/u);
});

test("first production package rejects a package symlink", () => {
  assert.throws(() => validateFirstProductionPackageAdmission({
    publicationBlockerIds: new Set(["OD-005"]),
    productionArtifacts: ["packages/core/linked"],
    productionArtifactSymlinks: ["packages/core/linked"],
    admission: { ...profile.adoption.admission, status: "source-admitted" },
    foundationConfig: { schemaVersion: 1 },
    packageJson,
    sourceDependencyPolicyPresent: true,
  }), /must not be symlinks/u);
});

test("production source outside packages cannot bypass first-package admission", () => {
  assert.throws(() => validateFirstProductionPackageAdmission({
    publicationBlockerIds: new Set(["OD-005"]),
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
      await writeFile(join(fixture, "packages", "core", "src", "not-source.mtsx"), "ignored\n");
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

test("production package symlink discovery does not follow targets", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "get-modular-profile-symlink-"));
  try {
    await writeFile(join(fixture, "package.json"), "{\"private\":true}\n");
    await mkdir(join(fixture, "packages", "core"), { recursive: true });
    await mkdir(join(fixture, "docs", "target"), { recursive: true });
    await writeFile(join(fixture, "docs", "target", "index.ts"), "export {};\n");
    await symlink("../../docs/target", join(fixture, "packages", "core", "linked"), "dir");
    assert.deepEqual(await productionArtifactSymlinkPaths(fixture), ["packages/core/linked"]);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("admits the accepted export map once no publication blocker remains", () => {
  const publicManifest = new Map([
    ["packages/core/package.json", {
      name: "@get-modular/core",
      type: "module",
      exports: {
        ".": {
          import: { types: "./dist/index.d.ts", default: "./dist/index.js" },
          default: "./dist/index.js",
        },
      },
    }],
  ]);
  const input = {
    productionArtifacts: ["packages/core/package.json", "packages/core/src/index.ts"],
    productionPackageManifests: publicManifest,
    admission: { ...profile.adoption.admission, status: "source-admitted" },
    foundationConfig: {
      schemaVersion: 1,
      capabilities: {
        "architecture.source-dependencies": { configPath: SOURCE_DEPENDENCY_POLICY_PATH },
      },
    },
    packageJson,
    sourceDependencyPolicyPresent: true,
  };

  assert.equal(
    validateFirstProductionPackageAdmission({ ...input, publicationBlockerIds: new Set() }),
    SOURCE_DEPENDENCY_POLICY_PATH,
  );

  assert.throws(() => validateFirstProductionPackageAdmission({
    ...input,
    publicationBlockerIds: new Set(["OD-005"]),
  }), /must remain private while publication is blocked: OD-005/u);

  assert.throws(() => validateFirstProductionPackageAdmission({
    ...input,
    productionPackageManifests: new Map([
      ["packages/core/package.json", { name: "@evil/thing", private: true }],
    ]),
    publicationBlockerIds: new Set(),
  }), /must use an accepted package identity/u);

  assert.throws(() => validateFirstProductionPackageAdmission({ ...input }),
    /publication blockers must be supplied as a set/u);
});

test("publication blockers come from the traceability catalog", () => {
  assert.deepEqual(publicationBlockers({ publicationBlockers: [] }), []);
  assert.deepEqual(publicationBlockers({ publicationBlockers: ["OD-005"] }), ["OD-005"]);
  for (const traceability of [
    {},
    { publicationBlockers: null },
    { publicationBlockers: "OD-005" },
    { publicationBlockers: [""] },
    { publicationBlockers: [5] },
  ]) {
    assert.throws(() => publicationBlockers(traceability),
      /must declare publicationBlockers as an array of open-decision ids/u);
  }
});

test("requires the Assembly gates in dependency order in both root commands", () => {
  const required = ["pnpm assembly:build", "pnpm assembly:typecheck", "pnpm assembly:test"];
  for (const scriptName of ["check", "check:fast"]) {
    const commands = packageJson.scripts[scriptName].split(" && ");
    assert.deepEqual(commands.filter(command => required.includes(command)), required);
    for (const removed of required) {
      const changed = clone(packageJson);
      changed.scripts[scriptName] = commands.filter(command => command !== removed).join(" && ");
      assert.throws(() => validate({ packageJson: changed }),
        /must use its exact closed pnpm command chain/u);
    }
    const reordered = clone(packageJson);
    const build = commands.indexOf(required[0]);
    const typecheck = commands.indexOf(required[1]);
    [commands[build], commands[typecheck]] = [commands[typecheck], commands[build]];
    reordered.scripts[scriptName] = commands.join(" && ");
    assert.throws(() => validate({ packageJson: reordered }),
      /must use its exact closed pnpm command chain/u);
  }
});

test("ADR-0023 admits only private Assembly 0.1.0 with its sole Core workspace dependency", async () => {
  const manifestPath = "packages/assembly/package.json";
  const manifest = {
    name: "@get-modular/assembly",
    version: "0.1.0",
    private: true,
    type: "module",
    dependencies: { "@get-modular/core": "workspace:*" },
  };
  const input = {
    publicationBlockerIds: new Set(),
    productionArtifacts: [
      "packages/core/package.json", "packages/core/src/index.ts",
      manifestPath, "packages/assembly/src/index.ts",
      "packages/assembly/src/composition/root.ts",
      "packages/assembly/src/features/construction/types.ts",
      "packages/assembly/src/features/construction/factory.ts",
    ],
    productionPackageManifests: new Map([...coreManifest, [manifestPath, manifest]]),
    admission: { ...profile.adoption.admission, status: "source-admitted" },
    foundationConfig: {
      capabilities: {
        "architecture.source-dependencies": { configPath: SOURCE_DEPENDENCY_POLICY_PATH },
      },
    },
    packageJson,
    sourceDependencyPolicyPresent: true,
  };
  const inventory = async (value, path = manifestPath) => packageManifestInventory([path], {
    readPackageManifest: async () => value,
  });
  assert.equal(validateFirstProductionPackageAdmission(input), SOURCE_DEPENDENCY_POLICY_PATH);
  assert.deepEqual(packageIdentityViolations(await inventory(manifest)), []);
  assert.deepEqual(manifestCarrierViolations(await inventory(manifest)), []);

  for (const [change, message] of [
    [{ private: false }, /must remain private/u],
    [{ version: "0.2.0" }, /version must remain 0\.1\.0/u],
    [{ dependencies: {} }, /dependencies must contain only/u],
    [{ dependencies: { "@get-modular/core": "^0.1.0" } }, /dependencies must contain only/u],
    [{ dependencies: { ...manifest.dependencies, "@example/extra": "1.0.0" } },
      /dependencies must contain only/u],
    [{ devDependencies: { typescript: "catalog:" } }, /devDependencies must be absent or empty/u],
    [{ optionalDependencies: { "@example/extra": "1.0.0" } },
      /optionalDependencies must be absent or empty/u],
    [{ peerDependencies: { "@get-modular/core": "*" } },
      /peerDependencies must be absent or empty/u],
  ]) {
    const changed = { ...manifest, ...change };
    assert.throws(() => validateFirstProductionPackageAdmission({
      ...input,
      productionPackageManifests: new Map([...coreManifest, [manifestPath, changed]]),
    }), message);
    const violations = manifestCarrierViolations(await inventory(changed));
    assert.equal(violations.length, 1);
    assert.match(violations[0].scripts.join("\n"), message);
  }

  const unknown = { ...manifest, name: "@get-modular/arbitrary" };
  assert.deepEqual(packageIdentityViolations(await inventory(unknown)), [manifestPath]);
  const nested = "packages/assembly/nested/package.json";
  assert.deepEqual(packageIdentityViolations(await inventory(manifest, nested)), [nested]);

  assert.throws(() => validateFirstProductionPackageAdmission({
    ...input,
    publicationBlockerIds: new Set(["OD-005"]),
    productionPackageManifests: new Map([...coreManifest, [manifestPath, {
      ...manifest, exports: { ".": "./dist/index.js" },
    }]]),
  }), /must not declare publication fields while publication is blocked/u);
  const lifecycle = manifestCarrierViolations(await inventory({
    ...manifest, scripts: { install: "node install.mjs" },
  }));
  assert.deepEqual(lifecycle[0].scripts, ["scripts.install"]);
});

test("requires exactly one historical M2 replay in the contracts gate", () => {
  const wrapper = "tests/m2-lock-witness.test.mjs";
  const command = packageJson.scripts["contracts:test"];
  assert.equal(command.split(wrapper).length - 1, 1);
  for (const replacement of [
    "tests/qualification/m2-candidate/retained-acceptance.test.mjs tests/m2-start.test.mjs",
    "",
    `${wrapper} ${wrapper}`,
  ]) {
    const changed = clone(packageJson);
    changed.scripts["contracts:test"] = command.replace(wrapper, replacement);
    assert.throws(() => validate({ packageJson: changed }),
      /contracts:test must use its closed command definition/u);
  }
});
