import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SHA = /^[a-f0-9]{40}$/u;

/** Only maintained prose guides are outside executable architecture inputs. */
function isOrdinaryGuide(path) {
  return /^docs\/guides\/[a-z0-9][a-z0-9-]*\.md$/u.test(path);
}

/** Unknown files and noncanonical paths always require the native matrix. */
export function classifyChangedPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return "full";
  for (const path of paths) {
    if (
      typeof path !== "string" ||
      !path ||
      path.startsWith("/") ||
      path.includes("\\") ||
      path.includes("\uFFFD") ||
      path.split("/").some((segment) => !segment || segment === "." || segment === "..") ||
      !isOrdinaryGuide(path)
    ) return "full";
  }
  return "docs";
}

function git(args, cwd) {
  const result = spawnSync("git", args, {
    cwd, encoding: null, maxBuffer: 32 * 1024 * 1024,
  });
  return result.error || result.status !== 0 ? null : result.stdout;
}

/** Both sides of a light doc change must be non-executable regular files. */
function regularAt(ref, path, cwd) {
  const entry = git(["ls-tree", "-z", ref, "--", path], cwd);
  if (entry === null) return false;
  if (entry.length === 0) return true;
  const rows = entry.toString("utf8").split("\0");
  return rows.length === 2 && rows[1] === "" &&
    /^100644 blob [a-f0-9]{40}\t/u.test(rows[0]) &&
    rows[0].endsWith("\t" + path);
}

/** Validate exact merge SHA and inspect both sides of any cross-scope rename. */
export function changedPaths(base, head, cwd = process.cwd()) {
  if (!SHA.test(base) || !SHA.test(head)) return null;
  const actual = git(["rev-parse", "HEAD"], cwd);
  if (actual === null || actual.toString("utf8").trim() !== head) return null;
  if (git(["merge-base", "--is-ancestor", base, head], cwd) === null) return null;
  const buffer = git(["diff", "--name-only", "--no-renames", "-z", base, head], cwd);
  if (buffer === null) return null;
  const output = buffer.toString("utf8");
  if (output.includes("\uFFFD")) return null;
  const paths = output.split("\0");
  if (paths.at(-1) === "") paths.pop();
  if (paths.length > 100) return null;
  // Never grant docs-only status for symlink/gitlink/executable mode changes.
  if (classifyChangedPaths(paths) === "docs" &&
      paths.some((path) => !regularAt(base, path, cwd) || !regularAt(head, path, cwd)))
    return null;
  return paths;
}

function main() {
  const event = process.env.GITHUB_EVENT_NAME;
  const paths = event === "pull_request"
    ? changedPaths(process.env.CI_BASE_SHA, process.env.GITHUB_SHA)
    : null;
  const tier = event === "pull_request" && paths !== null
    ? classifyChangedPaths(paths)
    : "full";
  const reason = event !== "pull_request"
    ? "main/merge queue/manual full CI"
    : paths === null ? "invalid or unavailable trusted diff" : "reviewed merge diff";
  process.stdout.write(`CI impact: ${tier} (${reason})\n`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tier=${tier}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Impact **${tier}**: ${reason}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
