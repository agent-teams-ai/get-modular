import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUN_VERSION, repository } from "./policy.ts";

declare const Bun: { readonly version: string; readonly YAML: { readonly parse: (source: string) => unknown } };
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function assertBunWorkspace(parse: (source: string) => unknown, root = repository): void {
  const manifest: unknown = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const workspace = parse(readFileSync(resolve(root, "pnpm-workspace.yaml"), "utf8"));
  if (!record(manifest) || !record(manifest.engines) || !record(workspace)
    || manifest.packageManager !== `bun@${BUN_VERSION}` || manifest.engines.bun !== BUN_VERSION
    || readFileSync(resolve(root, ".bun-version"), "utf8").trim() !== BUN_VERSION
    || JSON.stringify(manifest.trustedDependencies) !== "[]"
    || !isDeepStrictEqual(manifest.workspaces, { packages: workspace.packages, catalog: workspace.catalog })) {
    throw new Error("runtime.bun.workspace-projection-drift");
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (typeof Bun === "undefined" || Bun.version !== BUN_VERSION) throw new Error("runtime.admission.requires-pinned-bun");
  assertBunWorkspace(Bun.YAML.parse);
}
