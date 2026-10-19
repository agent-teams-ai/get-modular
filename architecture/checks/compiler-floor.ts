import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDirectExecution } from "./node-version.mjs";

export const TYPESCRIPT_COMPILER_FLOOR = "7.0.2";
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

interface FloorFailure {
  readonly role: string;
  readonly manifestPath: string | null;
  readonly reason: string;
  readonly [detail: string]: unknown;
}
interface PackageManifest {
  readonly name: string;
  readonly version: string;
  readonly dependencies?: Readonly<Record<string, unknown>>;
  readonly optionalDependencies?: Readonly<Record<string, unknown>>;
}
interface PackageIdentity {
  readonly role: string;
  readonly manifestPath: string;
  readonly manifest: PackageManifest;
}
interface CompilerIdentity {
  readonly role: string;
  readonly manifestPath: string;
  readonly version: string;
}
export class CompilerFloorError extends Error {
  readonly diagnostic;
  constructor(details: FloorFailure) {
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

function blocked(role: string, manifestPath: string | null, reason: string, details: Readonly<Record<string, unknown>> = {}): never {
  throw new CompilerFloorError({ role, manifestPath, reason, ...details });
}

function readPackage(require: NodeJS.Require, name: string, role: string, identity = name): PackageIdentity {
  const kind = identity === "typescript" ? "compiler" : "package";
  let manifestPath: string | undefined;
  let manifest: unknown;
  try {
    manifestPath = realpathSync(require.resolve(`${name}/package.json`));
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    blocked(role, manifestPath ?? null, `${kind}-manifest-unavailable`, {
      packageName: name, resolutionError: error instanceof Error ? ("code" in error ? error.code : error.name) : String(error),
    });
  }
  const value = manifest as Partial<PackageManifest> | null;
  if (value?.name !== identity || typeof value.version !== "string" || !stableVersion.test(value.version)) {
    blocked(role, manifestPath, `${kind}-identity-invalid`, { packageName: name, observedVersion: value?.version ?? null });
  }
  return { role, manifestPath, manifest: value as PackageManifest };
}

function compiler(require: NodeJS.Require, name: string, role: string): CompilerIdentity {
  // Aliases retain the actual package identity "typescript". Read JSON only;
  // never import a compiler or Foundation module while deciding whether to run it.
  const { manifestPath, manifest } = readPackage(require, name, role, "typescript");
  const version = manifest.version.split(".").map(Number);
  const [major = 0, minor = 0, patch = 0] = version;
  if (!version.every(Number.isSafeInteger) || !(major > 7 || major === 7 && (minor > 0 || patch >= 2))) {
    blocked(role, manifestPath, "compiler-below-floor", { observedVersion: manifest.version });
  }
  return { role, manifestPath, version: manifest.version };
}

function assertDependencyPin(owner: PackageIdentity, name: string, actualVersion: string): void {
  const declaredVersion = owner.manifest.dependencies?.[name];
  if (typeof declaredVersion !== "string" || !stableVersion.test(declaredVersion) || declaredVersion !== actualVersion) {
    blocked(owner.role, owner.manifestPath, "dependency-pin-mismatch", {
      packageName: name, declaredVersion: declaredVersion ?? null, observedVersion: actualVersion,
    });
  }
}

function foundationCompilers(repository: NodeJS.Require): readonly [CompilerIdentity, CompilerIdentity] {
  const foundation = readPackage(repository, "@agent-teams/engineering-foundation", "foundation");
  const foundationRequire = createRequire(foundation.manifestPath);
  const foundationCompiler = compiler(foundationRequire, "typescript", "foundation.compiler");
  if (Object.hasOwn(foundation.manifest.dependencies ?? {}, "typescript")) {
    assertDependencyPin(foundation, "typescript", foundationCompiler.version);
  }
  if (Object.hasOwn(foundation.manifest.dependencies ?? {}, "@microsoft/api-extractor")) {
    // Retained registry subjects must still expose the actual legacy compiler
    // refusal. A fabricated floor-compatible legacy dependency is not native.
    const extractor = readPackage(foundationRequire, "@microsoft/api-extractor", "foundation.api-extractor");
    assertDependencyPin(foundation, "@microsoft/api-extractor", extractor.manifest.version);
    const extractorCompiler = compiler(createRequire(extractor.manifestPath), "typescript", "foundation.api-extractor.compiler");
    assertDependencyPin(extractor, "typescript", extractorCompiler.version);
    blocked("foundation.api-extractor", extractor.manifestPath, "legacy-extractor-dependency");
  }
  assertDependencyPin(foundation, "typescript", foundationCompiler.version);
  const launcher = readPackage(foundationRequire, "typescript", "foundation.compiler", "typescript");
  const nativeName = `@typescript/typescript-${process.platform}-${process.arch}`;
  const native = readPackage(createRequire(launcher.manifestPath), nativeName, "foundation.native.compiler");
  if (launcher.manifest.optionalDependencies?.[nativeName] !== foundationCompiler.version
    || native.manifest.version !== foundationCompiler.version) {
    blocked(native.role, native.manifestPath, "native-compiler-pin-mismatch", {
      declaredVersion: launcher.manifest.optionalDependencies?.[nativeName] ?? null,
      observedVersion: native.manifest.version,
    });
  }
  for (const entry of ["typescript/unstable/sync", "typescript/unstable/ast"]) {
    try { realpathSync(foundationRequire.resolve(entry)); }
    catch { blocked("foundation.compiler", launcher.manifestPath, "native-compiler-api-unavailable", { entry }); }
  }
  for (const name of ["@microsoft/api-extractor-model", "@microsoft/tsdoc"]) {
    const model = readPackage(foundationRequire, name, "foundation.api-model");
    assertDependencyPin(foundation, name, model.manifest.version);
    if (["typescript", "@microsoft/api-extractor"].some(key => Object.hasOwn(model.manifest.dependencies ?? {}, key))) {
      blocked(model.role, model.manifestPath, "mixed-model-compiler-dependency");
    }
  }
  return [foundationCompiler, { role: native.role, manifestPath: native.manifestPath, version: native.manifest.version }];
}

export function assertFoundationCompilerFloor(workspace = repositoryRoot) {
  const repository = createRequire(join(resolve(workspace), "package.json"));
  const compilers = foundationCompilers(repository);
  return {
    outcome: "passed", minimumVersion: TYPESCRIPT_COMPILER_FLOOR,
    extractorVersion: `typescript-native/${compilers[0].version}`, compilers,
  };
}

export function assertCompilerFloor(workspace = repositoryRoot) {
  const repository = createRequire(join(resolve(workspace), "package.json"));
  const compilers = [
    compiler(repository, "typescript", "repository.current"),
    compiler(repository, "typescript-minimum", "repository.minimum"),
    ...foundationCompilers(repository),
  ] as const;
  return { outcome: "passed", minimumVersion: TYPESCRIPT_COMPILER_FLOOR, compilers };
}

if (isDirectExecution(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(assertCompilerFloor())}\n`);
  } catch (error) {
    if (!(error instanceof CompilerFloorError)) { throw error; }
    process.stderr.write(`${JSON.stringify(error.diagnostic)}\n`);
    process.exitCode = 1;
  }
}
