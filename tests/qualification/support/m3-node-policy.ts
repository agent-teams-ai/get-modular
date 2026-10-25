import { isSupportedToolingNodeVersion } from "../../../architecture/checks/node-version.mjs";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function m3NodePinPath(action: string): ".node-version" | ".node-compat-version" {
  if (action === "node") return ".node-compat-version";
  if (["pack", "native", "collect"].includes(action)) return ".node-version";
  throw new Error("m3.node.unknown-action");
}

export function assertM3NodePin(working: string, committed: string, actual: string): string {
  if (working !== committed) throw new Error("m3.node.pin-source-drift");
  const pin = committed.trim();
  if (!isSupportedToolingNodeVersion(pin) || actual !== `v${pin}`) {
    throw new Error("m3.node.runtime-pin-mismatch");
  }
  return pin;
}

export function assertM3NativeController(repository: string, sourceCommit: string, actual: string): string {
  if (!/^[a-f0-9]{40}$/u.test(sourceCommit)) throw new Error("m3.node.invalid-source-commit");
  const path = m3NodePinPath("native");
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  const committed = execFileSync("git", ["--no-replace-objects", "--literal-pathspecs", "-C", repository,
    "show", `${sourceCommit}:${path}`], { encoding: "utf8", timeout: 30_000, maxBuffer: 64 * 1024, env: { ...environment,
    GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } });
  return assertM3NodePin(readFileSync(resolve(repository, path), "utf8"), committed, actual);
}
