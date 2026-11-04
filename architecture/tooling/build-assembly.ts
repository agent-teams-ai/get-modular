import { access, realpath, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTypeScriptProject } from "./typescript-build.ts";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const assembly = join(workspace, "packages/assembly");

export async function buildAssembly(): Promise<void> {
  // The integrating command runs core:build first.
  await access(join(workspace, "packages/core/dist/index.js"));
  await access(join(workspace, "packages/core/dist/index.d.ts"));
  const output = join(assembly, "dist");
  await rm(output, { recursive: true, force: true });
  try {
    buildTypeScriptProject({
      repositoryRoot: workspace,
      project: join(assembly, "tsconfig.json"),
      failure: result => new Error(`assembly.build.compiler-failed:${result.status ?? result.signal}`),
    });
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
