import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

import {
  PRIVATE_IMPLEMENTATION_PACKAGE_NAMES,
  PUBLICATION_FIELDS,
  productionArtifactPaths,
  productionArtifactSymlinkPaths,
  productionArtifactsOutsidePackages,
} from "./production-artifacts.mjs";

export const PROFILE_PATH = "architecture/feature-module-standard-profile.json";
export const PROFILE_DOCUMENT_PATH = "docs/architecture/feature-module-standard.md";
export const SOURCE_DEPENDENCY_POLICY_PATH =
  "architecture/foundation/source-dependencies.yaml";

const FOUNDATION_ADMISSION = Object.freeze({
  package: "@agent-teams/engineering-foundation",
  version: "0.21.0",
  command: "agent-teams-foundation check",
  capability: "architecture.source-dependencies",
  policy: SOURCE_DEPENDENCY_POLICY_PATH,
});

const PACKAGE_MANIFEST = /^packages\/[^/]+\/package\.json$/u;

const EXPECTED_STANDARD = Object.freeze({
  id: "agent-teams.feature-module-standard",
  version: "v1",
  repository: "agent-teams-ai/.github",
  path: "docs/architecture/feature-module-standard/v1.md",
  git_blob_sha: "d0bfff2033faf544fe65268c1dcdfd524d093015",
  sha256: "851653f96643cf0466b67ab22963661976b00de44840fa3144a48a8c054f95fa",
});

const EXPECTED_SCOPE = Object.freeze({
  production_roots: ["packages"],
  module_roots: ["packages"],
  application_roots: [],
  excluded_roots: ["architecture", "docs", "tests"],
});

const EXPECTED_MAPPING = Object.freeze({
  production_module: "packages/*",
  source_root: "packages/*/src",
  feature_root: "packages/*/src/features/*",
  module_composition: "packages/*/src/composition",
  public_entrypoint: "packages/*/src/index.ts",
  test_root: "packages/*/tests",
  application_roots: [],
});

const EXPECTED_EXTENSIONS = Object.freeze([
  {
    id: "typescript-module-composition",
    authority: "docs/requirements/module-system-v1.md",
  },
  {
    id: "package-identity-and-topology",
    authority: "docs/decisions/0003-select-public-package-identity-and-initial-topology.md",
  },
  {
    id: "repository-dependency-policy",
    authority: "architecture/foundation/dependency-declarations.yaml",
  },
  {
    id: "internal-self-composition",
    authority: "docs/decisions/0008-bounded-internal-engine-self-composition.md",
  },
]);

const EXPECTED_ENFORCEMENT = Object.freeze([
  { command: "architecture:feature-module-profile", evidence: "profile-binding" },
  { command: "governance:check", evidence: "pre-production-artifact-guard" },
]);

const EXPECTED_STRUCTURAL_EVIDENCE = Object.freeze([
  "source-dependency policy and deterministic validator",
  "one valid fixture for every materialized module role",
  "rejection of production behavior outside a feature",
  "rejection of cross-feature deep imports",
  "rejection of undeclared dependency edges and cycles",
  "rejection of empty ceremonial layers",
  "rejection of undeclared module ownership exceptions",
  "accepted promotion decision binding the production subject and structural evidence",
]);

const EXPECTED_RUNTIME_EVIDENCE = Object.freeze([
  "packed artifact conformance on the supported runtime matrix",
  "accepted promotion decision binding the packed subject and runtime evidence",
]);

const CONFORMANCE_STATUSES = Object.freeze({
  structural: Object.freeze(["not-claimed", "structural-conformant"]),
  runtime: Object.freeze(["not-claimed", "runtime-conformant"]),
});

function assert(condition, message) {
  if (!condition) throw new Error(`FEATURE_MODULE_PROFILE_INVALID: ${message}`);
}

function exactKeys(value, expectedKeys, label) {
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`);
  assert(
    JSON.stringify(Object.keys(value).toSorted()) === JSON.stringify([...expectedKeys].toSorted()),
    `${label} must contain exactly: ${expectedKeys.join(", ")}`,
  );
}

function equalJson(actual, expected, label) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} does not match`);
}

function safeRelativePath(value) {
  return typeof value === "string"
    && value.length > 0
    && !value.startsWith("/")
    && !value.includes("\\")
    && !value.split("/").includes("..");
}

function scriptCommands(script) {
  if (typeof script !== "string") return [];
  return script.split("&&")
    .map(command => command.trim().replace(/^pnpm\s+/u, ""));
}

export function validateFirstProductionPackageAdmission({
  productionArtifacts,
  admission,
  foundationConfig,
  packageJson,
  sourceDependencyPolicyPresent,
  productionArtifactSymlinks = [],
  productionPackageManifests = new Map(),
}) {
  assert(Array.isArray(productionArtifacts)
    && productionArtifacts.every(path => safeRelativePath(path)),
  "production artifacts must be safe repository-relative paths");
  assert(Array.isArray(productionArtifactSymlinks)
    && productionArtifactSymlinks.length === 0,
  `production artifacts must not be symlinks: ${productionArtifactSymlinks.join(", ")}`);
  const misplacedArtifacts = productionArtifactsOutsidePackages(productionArtifacts);
  assert(misplacedArtifacts.length === 0,
    `production artifacts must be below packages: ${misplacedArtifacts.join(", ")}`);
  if (productionArtifacts.length === 0) {
    assert(admission?.status === "pre-production",
      "an empty production inventory must remain pre-production");
    return undefined;
  }

  assert(admission?.status === "source-admitted",
    "the first production package must declare source-admitted status");
  equalJson(admission.foundation, FOUNDATION_ADMISSION, "Foundation admission binding");

  const capability = foundationConfig?.capabilities?.[FOUNDATION_ADMISSION.capability];
  exactKeys(capability, ["configPath"], `${FOUNDATION_ADMISSION.capability} capability`);
  assert(capability.configPath === SOURCE_DEPENDENCY_POLICY_PATH,
    `${FOUNDATION_ADMISSION.capability} must use ${SOURCE_DEPENDENCY_POLICY_PATH}`);
  assert(sourceDependencyPolicyPresent,
    `first production package requires ${SOURCE_DEPENDENCY_POLICY_PATH}`);

  const manifestPaths = productionArtifacts.filter(path => PACKAGE_MANIFEST.test(path));
  assert(manifestPaths.length > 0,
    "first production package requires a package.json manifest");
  assert(productionPackageManifests instanceof Map,
    "production package manifests must be supplied as a map");
  for (const manifestPath of manifestPaths) {
    const manifest = productionPackageManifests.get(manifestPath);
    assert(manifest !== undefined,
      `missing production package manifest: ${manifestPath}`);
    assert(PRIVATE_IMPLEMENTATION_PACKAGE_NAMES.has(manifest?.name),
      `${manifestPath} must use an accepted private package identity`);
    assert(manifest.private === true,
      `${manifestPath} must remain private before publication approval`);
    const publicationFields = PUBLICATION_FIELDS.filter(field => manifest?.[field] !== undefined);
    assert(publicationFields.length === 0,
      `${manifestPath} must not declare publication fields: ${publicationFields.join(", ")}`);
  }

  assert(packageJson.devDependencies?.[FOUNDATION_ADMISSION.package]
    === FOUNDATION_ADMISSION.version,
  `${FOUNDATION_ADMISSION.package} must remain pinned to ${FOUNDATION_ADMISSION.version}`);
  const foundationCommands = scriptCommands(packageJson.scripts?.["foundation:check"]);
  assert(foundationCommands.includes(FOUNDATION_ADMISSION.command),
    `foundation:check must execute ${FOUNDATION_ADMISSION.command}`);

  const completeCommands = scriptCommands(packageJson.scripts?.check);
  const fastCommands = scriptCommands(packageJson.scripts?.["check:fast"]);
  assert(completeCommands.includes("foundation:check"),
    "complete gate must execute the Foundation source-dependency capability");
  assert(fastCommands.includes("foundation:check"),
    "fast gate must execute the Foundation source-dependency capability");
  return capability.configPath;
}

export function validateFeatureModuleStandardProfile({
  profile,
  document,
  docsIndex,
  agentInstructions,
  packageJson,
}) {
  exactKeys(profile, ["schema_version", "standard", "adoption"], "profile");
  assert(profile.schema_version === 1, "schema_version must be 1");
  exactKeys(profile.standard, Object.keys(EXPECTED_STANDARD), "standard");
  equalJson(profile.standard, EXPECTED_STANDARD, "standard binding");

  const adoption = profile.adoption;
  exactKeys(adoption, [
    "status",
    "owner",
    "profile_document",
    "decision",
    "scope",
    "mapping",
    "extensions",
    "deviations",
    "enforcement",
    "admission",
    "conformance",
  ], "adoption");
  assert(adoption.status === "adopted", "adoption status must be adopted");
  assert(adoption.owner === "architecture", "adoption owner must be architecture");
  assert(adoption.profile_document === "ARCH-FEATURE-MODULE-STANDARD",
    "profile document must be ARCH-FEATURE-MODULE-STANDARD");
  assert(adoption.decision === "ADR-0002", "decision must be ADR-0002");

  exactKeys(adoption.scope, Object.keys(EXPECTED_SCOPE), "scope");
  equalJson(adoption.scope, EXPECTED_SCOPE, "scope");
  exactKeys(adoption.mapping, Object.keys(EXPECTED_MAPPING), "mapping");
  equalJson(adoption.mapping, EXPECTED_MAPPING, "mapping");

  equalJson(adoption.extensions, EXPECTED_EXTENSIONS, "extensions");
  for (const extension of adoption.extensions) {
    exactKeys(extension, ["id", "authority"], `extension ${extension?.id ?? "<unknown>"}`);
    assert(/^[a-z][a-z0-9-]+$/u.test(extension.id), `invalid extension ID ${extension.id}`);
    assert(safeRelativePath(extension.authority), `${extension.id} has an unsafe authority path`);
  }

  assert(Array.isArray(adoption.deviations), "deviations must be an array");
  for (const deviation of adoption.deviations) {
    exactKeys(deviation, [
      "clause", "scope", "rationale", "owner", "decision", "review_trigger",
    ], `deviation ${deviation?.clause ?? "<unknown>"}`);
    for (const key of ["clause", "scope", "rationale", "owner", "decision", "review_trigger"]) {
      assert(typeof deviation[key] === "string" && deviation[key].length > 0,
        `deviation ${key} must be non-empty`);
    }
    assert(/^ADR-[0-9]{4}$/u.test(deviation.decision),
      "deviation decision must reference an ADR");
  }

  equalJson(adoption.enforcement, EXPECTED_ENFORCEMENT, "enforcement");
  const completeCommands = scriptCommands(packageJson.scripts?.check);
  const fastCommands = scriptCommands(packageJson.scripts?.["check:fast"]);
  for (const gate of adoption.enforcement) {
    exactKeys(gate, ["command", "evidence"], `enforcement ${gate?.command ?? "<unknown>"}`);
    assert(typeof packageJson.scripts?.[gate.command] === "string",
      `package.json is missing ${gate.command}`);
    assert(completeCommands.includes(gate.command),
      `complete gate must include ${gate.command}`);
  }
  assert(completeCommands.includes("architecture:feature-module-profile:test"),
    "complete gate must include profile tests");
  assert(fastCommands.includes("architecture:feature-module-profile"),
    "fast gate must include profile binding");

  exactKeys(adoption.admission, ["status", "production_root", "foundation"], "admission");
  assert(["pre-production", "source-admitted"].includes(adoption.admission.status),
    "admission status must be pre-production or source-admitted");
  assert(adoption.admission.production_root === "packages",
    "admission production root must be packages");
  exactKeys(adoption.admission.foundation, Object.keys(FOUNDATION_ADMISSION),
    "Foundation admission binding");
  equalJson(adoption.admission.foundation, FOUNDATION_ADMISSION, "Foundation admission binding");

  exactKeys(adoption.conformance, ["structural", "runtime"], "conformance");
  for (const [claim, expectedEvidence] of [
    ["structural", EXPECTED_STRUCTURAL_EVIDENCE],
    ["runtime", EXPECTED_RUNTIME_EVIDENCE],
  ]) {
    const state = adoption.conformance[claim];
    exactKeys(state, ["status", "rationale", "required_evidence"], `${claim} conformance`);
    assert(CONFORMANCE_STATUSES[claim].includes(state.status),
      `${claim} conformance has an unsupported status: ${state.status}`);
    assert(typeof state.rationale === "string" && state.rationale.length > 0,
      `${claim} conformance rationale must be non-empty`);
    equalJson(state.required_evidence, expectedEvidence, `${claim} conformance evidence`);
  }
  assert(adoption.conformance.runtime.status !== "runtime-conformant"
    || adoption.conformance.structural.status === "structural-conformant",
  "runtime conformance requires structural conformance state");
  assert(adoption.conformance.structural.status !== "structural-conformant"
    || adoption.admission.status === "source-admitted",
  "structural conformance requires source-admitted status");

  const canonicalUrl = `https://github.com/${EXPECTED_STANDARD.repository}/blob/`
    + `eef92e7fd40f538b4e9ba03e01bbd4e2d23f12f2/${EXPECTED_STANDARD.path}`;
  for (const marker of [
    "id: ARCH-FEATURE-MODULE-STANDARD",
    "# Get Modular Feature Module Standard Profile",
    "## Scope mapping",
    "## Local extensions",
    "## Qualification states",
    EXPECTED_STANDARD.id,
    EXPECTED_STANDARD.sha256,
    canonicalUrl,
    "ADR-0002",
    "OD-001",
  ]) {
    assert(document.includes(marker), `profile document is missing marker: ${marker}`);
  }
  assert(docsIndex.includes("architecture/feature-module-standard.md"),
    "documentation index must route to the local profile");
  assert(agentInstructions.includes("docs/architecture/feature-module-standard.md"),
    "agent navigation must route to the local profile");

  return adoption.extensions.map(({ authority }) => authority);
}

export async function checkFeatureModuleStandardProfile(repositoryRoot = process.cwd()) {
  const [
    profileSource,
    document,
    docsIndex,
    agentInstructions,
    packageSource,
    foundationConfigSource,
    productionArtifacts,
    productionArtifactSymlinks,
  ] = await Promise.all([
    readFile(resolve(repositoryRoot, PROFILE_PATH), "utf8"),
    readFile(resolve(repositoryRoot, PROFILE_DOCUMENT_PATH), "utf8"),
    readFile(resolve(repositoryRoot, "docs/README.md"), "utf8"),
    readFile(resolve(repositoryRoot, "AGENTS.md"), "utf8"),
    readFile(resolve(repositoryRoot, "package.json"), "utf8"),
    readFile(resolve(repositoryRoot, "foundation.config.yaml"), "utf8"),
    productionArtifactPaths(repositoryRoot),
    productionArtifactSymlinkPaths(repositoryRoot),
  ]);
  const profile = JSON.parse(profileSource);
  const packageJson = JSON.parse(packageSource);
  const authorities = validateFeatureModuleStandardProfile({
    profile,
    document,
    docsIndex,
    agentInstructions,
    packageJson,
  });
  const policyPresent = await access(resolve(repositoryRoot, SOURCE_DEPENDENCY_POLICY_PATH))
    .then(() => true, error => {
      if (error?.code === "ENOENT") return false;
      throw error;
    });
  validateFirstProductionPackageAdmission({
    productionArtifacts,
    admission: profile.adoption.admission,
    foundationConfig: parse(foundationConfigSource),
    packageJson,
    sourceDependencyPolicyPresent: policyPresent,
    productionArtifactSymlinks,
    productionPackageManifests: new Map(await Promise.all(
      productionArtifacts
        .filter(path => PACKAGE_MANIFEST.test(path))
        .map(async path => [path, JSON.parse(await readFile(resolve(repositoryRoot, path), "utf8"))]),
    )),
  });
  await Promise.all(authorities.map(authority => access(resolve(repositoryRoot, authority))));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkFeatureModuleStandardProfile();
  process.stdout.write("Get Modular Feature Module Standard v1 profile is valid.\n");
}
