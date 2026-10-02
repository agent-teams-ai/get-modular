import { access, realpath, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { leafPackageById } from "../checks/leaf-packages.mjs";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(join(workspace, "package.json"));

export async function buildLeafPackage(leaf) {
  const packageRoot = join(workspace, leaf.root);
  const compiler = join(dirname(require.resolve("typescript/package.json")), "bin/tsc");
  const output = join(packageRoot, "dist");
  await rm(output, { recursive: true, force: true });
  try {
    const result = spawnSync(process.execPath, [
      compiler, "--project", join(packageRoot, "tsconfig.json"),
    ], { cwd: workspace, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`${leaf.id}.build.compiler-failed:${result.status ?? result.signal}`);
    }
    await access(join(output, "index.js"));
    await access(join(output, "index.d.ts"));
  } catch (cause) {
    await rm(output, { recursive: true, force: true });
    throw cause;
  }
}

if (process.argv[1]
  && await realpath(resolve(process.argv[1])) === await realpath(fileURLToPath(import.meta.url))) {
  if (process.argv.length !== 3) throw new Error("leaf-package.build.unsupported-options");
  await buildLeafPackage(leafPackageById(process.argv[2]));
}
