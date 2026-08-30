import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

export const PROFILE_PATH = "architecture/feature-module-standard-profile.json";
export const PROFILE_DOCUMENT_PATH = "docs/architecture/feature-module-standard.md";
export const SOURCE_DEPENDENCY_POLICY_PATH =
  "architecture/foundation/source-dependencies.yaml";

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
]);

const EXPECTED_ENFORCEMENT = Object.freeze([
  { command: "architecture:feature-module-profile", evidence: "profile-binding" },
  { command: "governance:check", evidence: "pre-production-artifact-guard" },
]);

const EXPECTED_TRIGGERS = Object.freeze([
  "the first production module is materialized",
  "the packed production package passes every required evidence gate",
]);

const EXPECTED_EVIDENCE = Object.freeze([
  "source-dependency policy and deterministic validator",
  "one valid fixture for every materialized module role",
  "rejection of production behavior outside a feature",
  "rejection of cross-feature deep imports",
  "rejection of undeclared dependency edges and cycles",
  "rejection of empty ceremonial layers",
  "rejection of undeclared module ownership exceptions",
  "packed artifact conformance on the supported runtime matrix",
]);

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

async function pathsBelow(repositoryRoot, relativeDirectory) {
  let entries;
  try {
    entries = await readdir(resolve(repositoryRoot, relativeDirectory), { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const paths = [];
  for (const entry of entries) {
    const path = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) paths.push(...await pathsBelow(repositoryRoot, path));
    else paths.push(path);
  }
  return paths;
}

export async function productionPackagePaths(repositoryRoot = process.cwd()) {
  return (await pathsBelow(repositoryRoot, "packages")).toSorted();
}

export function validateFirstProductionPackageAdmission({
  productionPaths,
  foundationConfig,
  packageJson,
  sourceDependencyPolicyPresent,
}) {
  assert(Array.isArray(productionPaths)
    && productionPaths.every(path => safeRelativePath(path) && path.startsWith("packages/")),
  "production package paths must be safe paths below packages");
  if (productionPaths.length === 0) return undefined;

  const capability = foundationConfig?.capabilities?.["architecture.source-dependencies"];
  exactKeys(capability, ["configPath"], "architecture.source-dependencies capability");
  assert(capability.configPath === SOURCE_DEPENDENCY_POLICY_PATH,
    `architecture.source-dependencies must use ${SOURCE_DEPENDENCY_POLICY_PATH}`);
  assert(sourceDependencyPolicyPresent,
    `first production package requires ${SOURCE_DEPENDENCY_POLICY_PATH}`);

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

  exactKeys(adoption.conformance,
    ["status", "rationale", "activation_triggers", "required_evidence"],
    "conformance");
  assert(adoption.conformance.status === "not-claimed",
    "conformance status must remain not-claimed before packed evidence exists");
  assert(typeof adoption.conformance.rationale === "string"
    && adoption.conformance.rationale.length > 0, "conformance rationale must be non-empty");
  equalJson(adoption.conformance.activation_triggers, EXPECTED_TRIGGERS,
    "conformance activation triggers");
  equalJson(adoption.conformance.required_evidence, EXPECTED_EVIDENCE,
    "conformance evidence");

  const canonicalUrl = `https://github.com/${EXPECTED_STANDARD.repository}/blob/`
    + `eef92e7fd40f538b4e9ba03e01bbd4e2d23f12f2/${EXPECTED_STANDARD.path}`;
  for (const marker of [
    "id: ARCH-FEATURE-MODULE-STANDARD",
    "# Get Modular Feature Module Standard Profile",
    "## Scope mapping",
    "## Local extensions",
    "## Conformance is not claimed",
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
    productionPaths,
  ] = await Promise.all([
    readFile(resolve(repositoryRoot, PROFILE_PATH), "utf8"),
    readFile(resolve(repositoryRoot, PROFILE_DOCUMENT_PATH), "utf8"),
    readFile(resolve(repositoryRoot, "docs/README.md"), "utf8"),
    readFile(resolve(repositoryRoot, "AGENTS.md"), "utf8"),
    readFile(resolve(repositoryRoot, "package.json"), "utf8"),
    readFile(resolve(repositoryRoot, "foundation.config.yaml"), "utf8"),
    productionPackagePaths(repositoryRoot),
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
    productionPaths,
    foundationConfig: parse(foundationConfigSource),
    packageJson,
    sourceDependencyPolicyPresent: policyPresent,
  });
  await Promise.all(authorities.map(authority => access(resolve(repositoryRoot, authority))));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkFeatureModuleStandardProfile();
  process.stdout.write("Get Modular Feature Module Standard v1 profile is valid.\n");
}
