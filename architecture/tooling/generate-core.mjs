import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repository = fileURLToPath(new URL("../../", import.meta.url));
export const core = join(repository, "packages/core");
const generated = join(core, "src/composition/generated/stage1.ts");
const buildRoot = join(core, "dist-stage0");
const require = createRequire(import.meta.url);
let invoked = false;

function failure(code) {
  return Object.assign(new Error(code), { code });
}

export async function cleanProduction() {
  const paths = [generated, join(core, "dist")];
  const results = await Promise.allSettled(
    paths.map(path => rm(path, { recursive: true, force: true })),
  );
  const failures = results.flatMap((result, index) =>
    result.status === "rejected" ? [{ path: paths[index], error: result.reason }] : []);
  if (failures.length === 1) throw failures[0].error;
  if (failures.length > 1) {
    throw new AggregateError(failures.map(({ error }) => error),
      `build.production-cleanup-failed: ${failures.map(({ path }) => path).join(", ")}`);
  }
}

export function runTypeScript(configuration, noEmit = false) {
  const tsc = join(dirname(require.resolve("typescript/package.json")), "bin/tsc");
  const result = spawnSync(process.execPath, [
    tsc, "-p", join(core, configuration), "--incremental", "false",
    ...(noEmit ? ["--noEmit"] : []),
  ], { cwd: repository, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw failure("build.typescript-failed");
}

// A local change detector, not a retained SourceManifest or a custody claim.
// Include unselected sources and tooling; only the two disposable generated
// roots are omitted. Every invocation rebuilds and reads fresh namespaces.
async function inputs() {
  const entries = [];
  async function visit(path) {
    if (path === "packages/core/src/composition/generated/stage1.ts"
      || path === "packages/core/src/composition/generated/stage1.variant.ts") return;
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
  for (const path of [
    "packages/core/src", "packages/core/self-composition",
    "packages/core/tests/features/canonicalization/witness-variant",
    "packages/core/package.json", "packages/core/tsconfig.json",
    "packages/core/tsconfig.stage0.json", "packages/core/tsconfig.seed.json",
    "packages/core/tsconfig.test.json", "packages/core/tsconfig.typecheck.json",
    "tsconfig.base.json", "package.json",
    "architecture/tooling/build-core.mjs", "architecture/tooling/generate-core.mjs",
    "tests/qualification/support/construction-witness.mjs",
  ]) await visit(path);
  return JSON.stringify(entries);
}

export async function generateCore() {
  // Reusing this operation in one process would reuse transitive ESM imports.
  // Build and standalone typecheck each invoke it once in a fresh process.
  if (invoked) {
    await cleanProduction();
    throw failure("build.fresh-process-required");
  }
  invoked = true;
  try {
    await cleanProduction();
    await rm(buildRoot, { recursive: true, force: true });
    const before = await inputs();
    const unchanged = async () => {
      if (await inputs() !== before) throw failure("build.source-changed");
    };
    runTypeScript("tsconfig.stage0.json");
    await unchanged();
    const { verifyConstruction, verifyGeneratedConstruction } = await import(
      "../../tests/qualification/support/construction-witness.mjs"
    );
    const load = path => import(pathToFileURL(join(buildRoot, "self-composition", path)).href);
    const { compileComposition } = await load("stage0-entry.js");
    const { ownDeclarations, ownProfile } = await load("own-profile.js");
    const { allowlist } = await load("allowlist.js");
    const { emitComposition } = await load("emit.js");
    const result = await compileComposition({ declarations: ownDeclarations, profile: ownProfile });
    if (result?.ok !== true) throw failure("emitter.invalid-result");
    const mapping = {
      packageRoot: core, buildRoot,
      allowlistPath: "self-composition/allowlist.ts", plan: result.plan,
    };
    await unchanged();
    // This first proof checks the entire allowlist before the renderer runs.
    await verifyConstruction({ ...mapping, compositionPath: "src/composition/stage0.ts" });
    const sourceText = emitComposition(result, allowlist);
    await verifyGeneratedConstruction({ ...mapping, sourceText });
    await unchanged();
    await mkdir(dirname(generated), { recursive: true });
    await writeFile(generated, sourceText, { encoding: "utf8", flag: "wx" });
    const verifyInputs = async () => {
      await unchanged();
      if (await readFile(generated, "utf8") !== sourceText) {
        throw failure("build.generated-source-changed");
      }
    };
    await verifyInputs();
    return verifyInputs;
  } catch (error) {
    await cleanProduction();
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 3
      || process.argv[2] !== undefined && process.argv[2] !== "--typecheck") {
      throw failure("build.unsupported-options");
    }
    const verifyInputs = await generateCore();
    if (process.argv[2] === "--typecheck") {
      await verifyInputs();
      runTypeScript("tsconfig.typecheck.json", true);
      await verifyInputs();
    }
  } catch (error) {
    await cleanProduction();
    throw error;
  }
}
