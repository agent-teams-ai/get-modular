import { access, realpath, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const assembly = join(workspace, "packages/assembly");
const require = createRequire(join(workspace, "package.json"));

export async function buildAssembly() {
  // The integrating command runs core:build first.
  await access(join(workspace, "packages/core/dist/index.js"));
  await access(join(workspace, "packages/core/dist/index.d.ts"));
  const compiler = join(dirname(require.resolve("typescript/package.json")), "bin/tsc");
  const output = join(assembly, "dist");
  await rm(output, { recursive: true, force: true });
  try {
    const result = spawnSync(process.execPath, [
      compiler, "--project", join(assembly, "tsconfig.json"),
    ], { cwd: workspace, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`assembly.build.compiler-failed:${result.status ?? result.signal}`);
    }
  } catch (cause) {
    await rm(output, { recursive: true, force: true });
    throw cause;
  }
}

if (process.argv[1]
  && await realpath(resolve(process.argv[1])) === await realpath(fileURLToPath(import.meta.url))) {
  if (process.argv.length !== 2) throw new Error("assembly.build.unsupported-options");
  await buildAssembly();
}
