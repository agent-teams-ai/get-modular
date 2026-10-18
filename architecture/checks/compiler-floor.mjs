import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDirectExecution } from "./node-version.mjs";

export const TYPESCRIPT_COMPILER_FLOOR = "7.0.2";
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

export class CompilerFloorError extends Error {
  constructor(details) {
    const diagnostic = {
      code: "TYPESCRIPT_COMPILER_FLOOR_BLOCKED", outcome: "blocked",
      minimumVersion: TYPESCRIPT_COMPILER_FLOOR, ...details,
      remediation: details.reason === "compiler-below-floor" && details.role.startsWith("foundation")
        ? "A supported upstream compiler migration is required; retain the existing gates and extraction identities."
        : "Restore compatible exact dependency metadata before running the existing gates.",
    };
    super(JSON.stringify(diagnostic));
    this.name = "CompilerFloorError";
    this.diagnostic = diagnostic;
  }
}

function blocked(role, manifestPath, reason, details = {}) {
  throw new CompilerFloorError({ role, manifestPath, reason, ...details });
}

function readPackage(require, name, role, identity = name) {
  const kind = identity === "typescript" ? "compiler" : "package";
  let manifestPath;
  let manifest;
  try {
    manifestPath = realpathSync(require.resolve(`${name}/package.json`));
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    blocked(role, manifestPath ?? null, `${kind}-manifest-unavailable`, {
      packageName: name, resolutionError: error.code ?? error.name,
    });
  }
  if (manifest?.name !== identity || typeof manifest.version !== "string" || !stableVersion.test(manifest.version)) {
    blocked(role, manifestPath, `${kind}-identity-invalid`, { packageName: name, observedVersion: manifest?.version ?? null });
  }
  return { role, manifestPath, manifest };
}

function compiler(require, name, role) {
  // Aliases retain the actual package identity "typescript". Read JSON only;
  // never import a compiler or Foundation module while deciding whether to run it.
  const { manifestPath, manifest } = readPackage(require, name, role, "typescript");
  const version = manifest.version.split(".").map(Number);
  const [major, minor, patch] = version;
  if (!version.every(Number.isSafeInteger) || !(major > 7 || major === 7 && (minor > 0 || patch >= 2))) {
    blocked(role, manifestPath, "compiler-below-floor", { observedVersion: manifest.version });
  }
  return { role, manifestPath, version: manifest.version };
}

function assertDependencyPin(owner, name, actualVersion) {
  const declaredVersion = owner.manifest.dependencies?.[name];
  if (typeof declaredVersion !== "string" || !stableVersion.test(declaredVersion) || declaredVersion !== actualVersion) {
    blocked(owner.role, owner.manifestPath, "dependency-pin-mismatch", {
      packageName: name, declaredVersion: declaredVersion ?? null, observedVersion: actualVersion,
    });
  }
}

export function assertCompilerFloor(workspace = repositoryRoot) {
  const repository = createRequire(join(resolve(workspace), "package.json"));
  const compilers = [
    compiler(repository, "typescript", "repository.current"),
    compiler(repository, "typescript-minimum", "repository.minimum"),
  ];
  const foundation = readPackage(repository, "@agent-teams/engineering-foundation", "foundation");
  const foundationRequire = createRequire(foundation.manifestPath);
  const foundationCompiler = compiler(foundationRequire, "typescript", "foundation.compiler");
  if (Object.hasOwn(foundation.manifest.dependencies ?? {}, "typescript")) {
    assertDependencyPin(foundation, "typescript", foundationCompiler.version);
  }
  compilers.push(foundationCompiler);
  const extractor = readPackage(foundationRequire, "@microsoft/api-extractor", "foundation.api-extractor");
  assertDependencyPin(foundation, "@microsoft/api-extractor", extractor.manifest.version);
  const extractorCompiler = compiler(createRequire(extractor.manifestPath), "typescript", "foundation.api-extractor.compiler");
  assertDependencyPin(extractor, "typescript", extractorCompiler.version);
  compilers.push(extractorCompiler);
  return { outcome: "passed", minimumVersion: TYPESCRIPT_COMPILER_FLOOR, compilers };
}

if (isDirectExecution(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(assertCompilerFloor())}\n`);
  } catch (error) {
    if (!(error instanceof CompilerFloorError)) throw error;
    process.stderr.write(`${JSON.stringify(error.diagnostic)}\n`);
    process.exitCode = 1;
  }
}
