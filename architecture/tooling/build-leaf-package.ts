import { access, realpath, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { leafBuildOutputs, leafPackageById } from "../checks/leaf-packages.ts";
import type { LeafPackage } from "../checks/leaf-packages.ts";
import { buildTypeScriptProject } from "./typescript-build.ts";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export async function buildLeafPackage(leaf: LeafPackage): Promise<void> {
  const packageRoot = join(workspace, leaf.root);
  const output = join(packageRoot, "dist");
  await rm(output, { recursive: true, force: true });
  try {
    buildTypeScriptProject({
      repositoryRoot: workspace,
      project: join(packageRoot, "tsconfig.json"),
      failure: result => new Error(`${leaf.id}.build.compiler-failed:${result.status ?? result.signal}`),
    });
    for (const artifact of leafBuildOutputs(leaf)) await access(join(packageRoot, artifact));
  } catch (cause) {
    await rm(output, { recursive: true, force: true });
    throw cause;
  }
}

if (process.argv[1]
  && await realpath(resolve(process.argv[1])) === await realpath(fileURLToPath(import.meta.url))) {
  if (process.argv.length !== 3 || process.argv[2] === undefined) throw new Error("leaf-package.build.unsupported-options");
  await buildLeafPackage(leafPackageById(process.argv[2]));
}
