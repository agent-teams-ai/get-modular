import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { GitIndexSnapshot } from "../checks/tracked-file-custody.ts";
import type { GeneratedProductionReader } from "../checks/generated-production-source.ts";
import { buildTypeScriptProject } from "./typescript-build.ts";

const repository = fileURLToPath(new URL("../../", import.meta.url));
export const core = join(repository, "packages/core");
const generated = join(core, "src/composition/generated/stage1.ts");
const buildRoot = join(core, "dist-stage0");
let invoked = false;

export interface GenerationOptions {
  readonly snapshot?: GitIndexSnapshot | undefined;
}

export interface GeneratedCore {
  readonly verifyInputs: () => Promise<void>;
  readonly generatedReader: GeneratedProductionReader | undefined;
}

function failure(code: string): Error & { readonly code: string } {
  return Object.assign(new Error(code), { code });
}

export async function cleanProduction(): Promise<void> {
  const paths = [generated, join(core, "dist")];
  const results = await Promise.allSettled(
    paths.map(path => rm(path, { recursive: true, force: true })),
  );
  const failures: { readonly path: string | undefined; readonly error: unknown }[] = results.flatMap((result, index) =>
    result.status === "rejected" ? [{ path: paths[index], error: result.reason }] : []);
  const first = failures[0];
  if (failures.length === 1 && first !== undefined) throw first.error;
  if (failures.length > 1) {
    throw new AggregateError(failures.map(({ error }) => error),
      `build.production-cleanup-failed: ${failures.map(({ path }) => path).join(", ")}`);
  }
}

export async function cleanProductionAfterFailure(error: unknown): Promise<never> {
  try {
    await cleanProduction();
  } catch (cleanupError) {
    const cleanupErrors: readonly unknown[] = cleanupError instanceof AggregateError ? cleanupError.errors : [cleanupError];
    throw new AggregateError([
      error,
      ...cleanupErrors,
    ], "build.failed-and-production-cleanup-failed");
  }
  throw error;
}

export function runTypeScript(configuration: string, noEmit = false): void {
  buildTypeScriptProject({
    repositoryRoot: repository,
    project: join(core, configuration),
    arguments: ["--incremental", "false", ...(noEmit ? ["--noEmit"] : [])],
    failure: () => failure("build.typescript-failed"),
  });
}

// A local change detector, not a retained SourceManifest or a custody claim.
// Include unselected sources and tooling; only the two disposable generated
// roots are omitted. Every invocation rebuilds and reads fresh namespaces.
async function inputs(snapshot: GitIndexSnapshot | undefined): Promise<string> {
  const entries: [path: string, executable: number, digest: string][] = [];
  const discovered = new Set<string>();
  async function visit(path: string): Promise<void> {
    if (path === "packages/core/src/composition/generated/stage1.ts"
      || path === "packages/core/src/composition/generated/stage1.variant.ts") return;
    if (discovered.has(path)) return;
    discovered.add(path);
    const absolute = join(repository, path);
    const info = await lstat(absolute);
    if (info.isDirectory()) {
      for (const name of (await readdir(absolute)).sort()) await visit(`${path}/${name}`);
      return;
    }
    if (!info.isFile()) throw failure("build.unsupported-source-input");
    entries.push([path, info.mode & 0o111,
      createHash("sha256").update(await readFile(absolute)).digest("hex")]);
  }
  const scopes = [
    "packages/core/src", "packages/core/self-composition",
    "packages/core/tests/features/canonicalization/witness-variant",
    "packages/core/package.json", "packages/core/tsconfig.json",
    "packages/core/tsconfig.stage0.json", "packages/core/tsconfig.seed.json",
    "packages/core/tsconfig.test.json", "packages/core/tsconfig.typecheck.json",
    "tsconfig.base.json", "package.json",
    "architecture/tooling/build-core.ts", "architecture/tooling/generate-core.ts",
    "architecture/tooling/typescript-build.ts",
    "tests/qualification/support/construction-witness.ts",
  ];
  if (snapshot) {
    // Installed packages retain the pinned-install trust assumption. Local
    // imports, inherited configuration and dependency selection are captured.
    scopes.push(
      "architecture/checks", "architecture/tooling",
      "tests/qualification/support",
      "pnpm-lock.yaml", "pnpm-workspace.yaml", ".npmrc",
    );
    for (const name of await readdir(repository)) {
      if (/^tsconfig.*\.json$/u.test(name)) scopes.push(name);
    }
    for (const path of snapshot.entries.keys()) {
      if (/^tsconfig[^/]*\.json$/u.test(path)) scopes.push(path);
    }
  }
  for (const path of new Set(scopes)) await visit(path);
  if (snapshot) {
    const paths = new Set(entries.map(([path]) => path));
    for (const path of snapshot.entries.keys()) {
      if (scopes.some(scope => path === scope || path.startsWith(`${scope}/`))) {
        // Indexed generated files are not disposable authored-input exceptions.
        paths.add(path);
      }
    }
    const { verifySnapshotInputs } = await import("../checks/generated-production-source.ts");
    await verifySnapshotInputs(snapshot, [...paths].sort());
  }
  return JSON.stringify(entries);
}

// Freshly compiled seed exports are an execution boundary, not inferred `any`.
// The witness remains the independent authority for the plan and construction.
function invokeSeed(value: unknown, arguments_: readonly unknown[]): unknown {
  if (typeof value !== "function") throw failure("build.invalid-seed-export");
  const result: unknown = Reflect.apply(value, undefined, arguments_);
  return result;
}

async function seedExport(path: string, name: string): Promise<unknown> {
  const namespace: unknown = await import(pathToFileURL(join(buildRoot, "self-composition", path)).href);
  if (typeof namespace !== "object" || namespace === null || !(name in namespace)) {
    throw failure("build.invalid-seed-export");
  }
  const value: unknown = Reflect.get(namespace, name);
  return value;
}

export async function generateCore({ snapshot }: GenerationOptions = {}): Promise<GeneratedCore> {
  // Reject indexed generated source before any destructive cleanup.
  if (snapshot) {
    if (resolve(snapshot.repositoryRoot) !== resolve(repository)) {
      throw failure("build.snapshot-repository-mismatch");
    }
    const { verifySnapshotInputs } = await import("../checks/generated-production-source.ts");
    await verifySnapshotInputs(snapshot, []);
  }
  // Reusing this operation in one process would reuse transitive ESM imports.
  // Build and standalone typecheck each invoke it once in a fresh process.
  if (invoked) {
    await cleanProductionAfterFailure(failure("build.fresh-process-required"));
  }
  invoked = true;
  try {
    await cleanProduction();
    await rm(buildRoot, { recursive: true, force: true });
    const before = await inputs(snapshot);
    const unchanged = async () => {
      if (await inputs(snapshot) !== before) throw failure("build.source-changed");
    };
    runTypeScript("tsconfig.stage0.json");
    await unchanged();
    const { verifyConstruction, verifyGeneratedConstruction } = await import(
      "../../tests/qualification/support/construction-witness.ts"
    );
    const compileComposition = await seedExport("stage0-entry.js", "compileComposition");
    const ownDeclarations = await seedExport("own-profile.js", "ownDeclarations");
    const ownProfile = await seedExport("own-profile.js", "ownProfile");
    const allowlist = await seedExport("allowlist.js", "allowlist");
    const emitComposition = await seedExport("emit.js", "emitComposition");
    const result = await invokeSeed(compileComposition, [{ declarations: ownDeclarations, profile: ownProfile }]);
    if (typeof result !== "object" || result === null || !("ok" in result)
      || result.ok !== true || !("plan" in result)) throw failure("emitter.invalid-result");
    const mapping = {
      packageRoot: core, buildRoot,
      allowlistPath: "self-composition/allowlist.ts", plan: result.plan,
    };
    await unchanged();
    // This first proof checks the entire allowlist before the renderer runs.
    await verifyConstruction({ ...mapping, compositionPath: "src/composition/stage0.ts" });
    const sourceText = invokeSeed(emitComposition, [result, allowlist]);
    await verifyGeneratedConstruction({ ...mapping, sourceText });
    // Successful generated-witness validation requires text. Keep the boundary
    // checked locally too instead of asserting the dynamic emitter's return type.
    if (typeof sourceText !== "string") throw failure("build.invalid-generated-text");
    await unchanged();
    await mkdir(dirname(generated), { recursive: true });
    await writeFile(generated, sourceText, { encoding: "utf8", flag: "wx" });
    const generatedReader = snapshot
      ? (await import("../checks/generated-production-source.ts"))
        .createGeneratedProductionReader(repository, Buffer.from(sourceText, "utf8"))
      : undefined;
    const verifyInputs = async () => {
      await unchanged();
      if (generatedReader) {
        await generatedReader("packages/core/src/composition/generated/stage1.ts");
      } else if (await readFile(generated, "utf8") !== sourceText) {
        throw failure("build.generated-source-changed");
      }
    };
    await verifyInputs();
    return Object.freeze({ verifyInputs, generatedReader });
  } catch (error) {
    return cleanProductionAfterFailure(error);
  }
}

if (process.argv[1]
  && await realpath(resolve(process.argv[1])) === await realpath(fileURLToPath(import.meta.url))) {
  try {
    if (process.argv.length > 3
      || process.argv[2] !== undefined && process.argv[2] !== "--typecheck") {
      throw failure("build.unsupported-options");
    }
    const { verifyInputs } = await generateCore();
    if (process.argv[2] === "--typecheck") {
      await verifyInputs();
      runTypeScript("tsconfig.typecheck.json", true);
      await verifyInputs();
    }
  } catch (error) {
    await cleanProductionAfterFailure(error);
  }
}
