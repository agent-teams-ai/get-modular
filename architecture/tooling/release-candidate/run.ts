import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareRelease, releaseBranch, repository, verifyRelease, versionPreparedRelease, type PreparedRelease } from "./host.ts";
import { assertNodeQualification, git, record, text } from "./io.ts";

const root = fileURLToPath(new URL("../../..", import.meta.url));
function processedMain(prepared: PreparedRelease): void {
  if (process.env.GITHUB_ACTIONS !== "true") {return;}
  assert.equal(process.env.GITHUB_REPOSITORY, repository, "candidate.repository");
  assert.equal(process.env.GITHUB_REF, "refs/heads/main", "candidate.processed-ref");
  assert.equal(prepared.execution.source, process.env.GITHUB_SHA, "candidate.processed-main-drift");
}
export function releaseCandidateMain(command: string | undefined): void {
  if (command === "status" || command === "version") { assertNodeQualification(root); }
  if (command === "status") {
    const prepared = prepareRelease(root);
    processedMain(prepared);
    const ready = String(prepared.hasRelease);
    if (process.env.GITHUB_OUTPUT !== undefined && process.env.GITHUB_OUTPUT !== "") {appendFileSync(process.env.GITHUB_OUTPUT, `has-release=${ready}\n`);}
    console.log(JSON.stringify({ source: prepared.execution.source, hasRelease: prepared.hasRelease, plan: prepared.expected.plan }));
    return;
  }
  if (command === "version") {
    const prepared = prepareRelease(root);
    processedMain(prepared);
    console.log(JSON.stringify(versionPreparedRelease(prepared).report)); return;
  }
  if (command === "check-pr") {
    if (process.env.GITHUB_EVENT_NAME !== "pull_request" || process.env.GITHUB_HEAD_REF !== releaseBranch) {return;}
    assert.equal(process.env.GITHUB_REPOSITORY, repository, "candidate.repository");
    const eventPath = process.env.GITHUB_EVENT_PATH; assert(eventPath !== undefined && eventPath !== "", "candidate.pr-event-required");
    const event = record(JSON.parse(readFileSync(eventPath, "utf8")));
    const pull = record(event["pull_request"]); const base = record(pull["base"]); const head = record(pull["head"]);
    assert.equal(record(base["repo"])["full_name"], repository, "candidate.base-repository");
    assert.equal(record(head["repo"])["full_name"], repository, "candidate.head-repository");
    assert.equal(base["ref"], "main", "candidate.base-branch"); assert.equal(head["ref"], releaseBranch, "candidate.head-branch");
    const baseSha = text(base["sha"]); const headSha = text(head["sha"]);
    assert.equal(git(root, "rev-parse", "refs/remotes/origin/main").trim(), baseSha, "candidate.stale-event-base");
    console.log(JSON.stringify(verifyRelease(root, baseSha, headSha).report));
    return;
  }
  throw new Error("Usage: node architecture/tooling/release-candidate/run.ts status | version | check-pr");
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { releaseCandidateMain(process.argv[2]); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
