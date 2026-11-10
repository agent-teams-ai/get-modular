import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SHA = /^[0-9a-f]{40}$/u;

/** Narrow reviewed prose only; contracts, agent instructions and raw research always run full. */
export function classifyChangedPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return "full";
  for (const path of paths) {
    if (
      typeof path !== "string" ||
      !path ||
      path.startsWith("/") ||
      path.includes("\\") ||
      path.includes("\uFFFD") ||
      path.split("/").some((s) => !s || s === "." || s === "..")
    ) return "full";
    if (!/^docs\/plans\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.md$/u.test(path))
      return "full";
  }
  return "docs";
}

function git(args, cwd) {
  const response = spawnSync("git", args, {
    cwd,
    encoding: null,
    maxBuffer: 32 * 1024 * 1024,
  });
  return response.error || response.status !== 0 ? null : response.stdout;
}

/** Compare complete reviewed merge-ref range without rename detection or lossy path parsing. */
export function changedPaths(base, head, cwd = process.cwd()) {
  if (!SHA.test(base) || !SHA.test(head)) return null;
  const actual = git(["rev-parse", "HEAD"], cwd);
  if (!actual || actual.toString("utf8").trim() !== head) return null;
  if (!git(["merge-base", "--is-ancestor", base, head], cwd)) return null;
  const bytes = git(["diff", "--name-only", "--no-renames", "-z", base, head], cwd);
  if (bytes === null) return null;
  const paths = bytes.toString("utf8");
  if (paths.includes("\uFFFD")) return null;
  const list = paths.split("\0");
  if (list.at(-1) === "") list.pop();
  return list;
}

function main() {
  const event = process.env.GITHUB_EVENT_NAME;
  const paths =
    event === "pull_request"
      ? changedPaths(process.env.CI_BASE_SHA, process.env.GITHUB_SHA)
      : null;
  const tier = event === "pull_request" && paths !== null
    ? classifyChangedPaths(paths)
    : "full";
  process.stdout.write(`CI impact: ${tier}\n`);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `tier=${tier}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `CI impact: **${tier}**\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
