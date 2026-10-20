import { readFileSync, existsSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repository = fileURLToPath(new URL("../../../", import.meta.url));
export const BUN_VERSION = "1.4.3";
export const PNPM_VERSION = "11.20.0";
export const markerPath = ".get-modular-node-profile.json";
export type Profile = "bun" | "node";
export const projectionPaths = ["package.json", "architecture/foundation/repository-agent-workflow.yaml",
  "architecture/foundation/dependency-declarations.yaml"] as const;

// These are development Host choices. Tests, compilers, packed qualification and
// release tools retain their literal Node commands in package.json.
export const runtimeEntries = new Set([
  "architecture/checks/v1-contract.mjs",
  "architecture/checks/feature-module-standard-profile.mjs",
  "architecture/checks/release-owned-files.mjs",
  "architecture/checks/required-quality-tests.mjs",
]);
export const runtimeBins: Readonly<Record<string, string>> = {
  "agent-teams-foundation": "@agent-teams/engineering-foundation",
  "agent-teams-docs": "@agent-teams/docs-protocol",
};

export function git(root: string, ...args: string[]): string {
  // Never inherit Git path overrides from an invoking qualification fixture.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", env }).trimEnd();
}
export function project(path: typeof projectionPaths[number], source: string): string {
  if (path === "package.json") {
    const manifest = JSON.parse(source);
    if (manifest.packageManager !== `bun@${BUN_VERSION}`) throw new Error("runtime.projection.source-manager");
    manifest.packageManager = `pnpm@${PNPM_VERSION}`;
    delete manifest.engines.bun;
    delete manifest.trustedDependencies;
    delete manifest.workspaces;
    return JSON.stringify(manifest, null, 2) + "\n";
  }
  const from = path.endsWith("repository-agent-workflow.yaml") ? "packageManager: bun\n" : "  kind: bun\n";
  const to = from.replace("bun", "pnpm");
  if (!source.startsWith("schemaVersion: 2\n") || source.split(from).length !== 2) {
    throw new Error("runtime.projection.source-policy");
  }
  return source.replace(from, to);
}
interface NodeMarker { readonly source: string; readonly root: string; readonly commit: string }
export function nodeMarker(root = repository): NodeMarker {
  const marker: unknown = JSON.parse(readFileSync(resolve(root, markerPath), "utf8"));
  if (typeof marker !== "object" || marker === null || !("source" in marker) || !("root" in marker) || !("commit" in marker)
    || typeof marker.source !== "string" || typeof marker.root !== "string" || typeof marker.commit !== "string") {
    throw new Error("runtime.projection.invalid-marker");
  }
  if (realpathSync(root) !== marker.root || marker.root === marker.source
    || git(root, "rev-parse", "HEAD") !== marker.commit) throw new Error("runtime.projection.wrong-root");
  return { source: marker.source, root: marker.root, commit: marker.commit };
}
export function selectedProfile(root = repository): Profile {
  const requested = process.env.GET_MODULAR_RUNTIME_PROFILE;
  if (requested !== undefined && requested !== "bun" && requested !== "node") throw new Error("runtime.profile.unknown");
  const projected = existsSync(resolve(root, markerPath));
  if (projected) {
    if (requested === "bun") throw new Error("runtime.profile.mixed-install");
    assertProjection(root);
    return "node";
  }
  if (requested === "node") throw new Error("runtime.profile.node-requires-isolated-checkout");
  return "bun";
}
export function assertProjection(root = repository): void {
  const marker = nodeMarker(root);
  for (const path of projectionPaths) {
    const original = execFileSync("git", ["-C", root, "show", `${marker.commit}:${path}`], { encoding: "utf8" });
    if (readFileSync(resolve(root, path), "utf8") !== project(path, original)) throw new Error(`runtime.projection.drift:${path}`);
  }
}
export function toolRuntime(profile: Profile, entry: string): "bun" | "node" {
  if (!runtimeEntries.has(entry) && !Object.hasOwn(runtimeBins, entry)) throw new Error("runtime.tool.unknown");
  return profile === "bun" ? "bun" : "node";
}
