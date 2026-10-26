import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface RetainedHistory { readonly commit: string; readonly tree: string; readonly ref: string }
export const retainedObservation: RetainedHistory = Object.freeze({
  commit: "2cd561688bb223f944425718cc093e55ff4bc20d",
  tree: "f04c469d8070a16a6b81c787eab72f2fd483c56b",
  ref: "refs/qualification/retained-observation-0.1.0",
});
const origin = "https://github.com/agent-teams-ai/get-modular.git";
function git(root: string, ...args: string[]): string {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  return execFileSync("git", ["--no-replace-objects", "--literal-pathspecs", "-C", root, ...args], {
    encoding: "utf8", timeout: 60_000,
    env: { ...env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
  }).trim();
}
export function assertRetainedHistory(root: string, pin: RetainedHistory = retainedObservation): void {
  assert.equal(git(root, "cat-file", "-t", pin.commit), "commit", "runtime.history.commit");
  assert.equal(git(root, "rev-parse", `${pin.commit}^{tree}`), pin.tree, "runtime.history.tree");
  assert.equal(git(root, "rev-parse", pin.ref), pin.commit, "runtime.history.ref");
}
/** Explicit setup only. Offline callers must provision these exact authenticated objects/ref first;
 * policy tests and runtime execution never fetch missing history implicitly. */
export function retainHistory(root: string, source: string, pin: RetainedHistory = retainedObservation): void {
  assert.match(pin.commit, /^[a-f0-9]{40}$/u);
  assert.match(pin.tree, /^[a-f0-9]{40}$/u);
  assert.match(pin.ref, /^refs\/qualification\/[a-z0-9.-]+$/u);
  git(root, "fetch", "--no-tags", "--no-write-fetch-head", source, `${pin.commit}:${pin.ref}`);
  assertRetainedHistory(root, pin);
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, "runtime.history.arguments");
  retainHistory(process.cwd(), origin);
}
