import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { parse } from "yaml";
import {
  archiveHashes, assertArchive, assertQualifiedCi, assertRegistryReceipt, assertRetainedBuildInputs, expectedCiJobNames,
  json, manifestFrom, packageIds, record, repository, requiresRelease, retainedBuildPaths, retainedPackage, retainedSource, type ReleaseManifest,
} from "../architecture/tooling/npm-release/policy.ts";

import { registryVersion } from "../architecture/tooling/npm-release/registry.ts";

const source = "a".repeat(40);
const workflow = await readFile(resolve(".github/workflows/ci.yml"), "utf8");
const expected = expectedCiJobNames(workflow);
function ciRun(): Record<string, unknown> {
  return { head_sha: source, head_branch: "main", path: ".github/workflows/ci.yml", event: "push",
    repository: { full_name: repository }, head_repository: { full_name: repository }, status: "completed", conclusion: "success" };
}
function jobs(): Record<string, unknown>[] {
  return expected.map(name => ({ name, head_sha: source, status: "completed", conclusion: "success" }));
}
function manifest(): ReleaseManifest {
  return { schemaVersion: 1, repository, source, packages: packageIds.map(id => ({
    name: `@get-modular/${id}`, version: "1.2.3", file: `get-modular-${id}-1.2.3.tgz`, ...archiveHashes(Buffer.from(id)),
  })) };
}

test("release qualification requires the complete actual CI matrix and successful exact-source jobs", () => {
  const independentNames = ["ubuntu-24.04", "macos-15", "windows-2025"].flatMap(host =>
    ["", ", Node 24", ", Node 26 rollback"].flatMap(runtime => [
      `check (${host}${runtime})`,
      ...["core", "assembly", "packaging", "governance", "static", "observation"].map(lane => `check lane (${host}${runtime}, ${lane})`),
    ]));
  independentNames.push("Node 24 package root compatibility");
  assert.equal(independentNames.length, 64);
  assert.deepEqual(expected, independentNames.sort());
  assertQualifiedCi(ciRun(), jobs(), expected, source);
  for (const name of independentNames.filter(name => name.includes("Node 26 rollback"))) {
    assert.throws(() => assertQualifiedCi(ciRun(), jobs().filter(row => row.name !== name), expected, source),
      /release\.ci-/u, `missing rollback job: ${name}`);
  }
  for (const mutate of [
    (rows: Record<string, unknown>[]) => { rows.pop(); },
    (rows: Record<string, unknown>[]) => { rows.push({ ...rows[0] }); },
    (rows: Record<string, unknown>[]) => { rows[0] = { ...rows[0], conclusion: "skipped" }; },
    (rows: Record<string, unknown>[]) => { rows[0] = { ...rows[0], head_sha: "b".repeat(40) }; },
    (rows: Record<string, unknown>[]) => { rows[0] = { ...rows[0], conclusion: "cancelled" }; },
  ]) {
    const rows = jobs(); mutate(rows);
    assert.throws(() => assertQualifiedCi(ciRun(), rows, expected, source), /release\.ci-/u);
  }
  for (const mutation of [{ event: "pull_request" }, { head_sha: "b".repeat(40) }, { head_branch: "release" },
    { path: ".github/workflows/other.yml" }, { conclusion: "failure" }, { head_repository: { full_name: "foreign/fork" } }]) {
    assert.throws(() => assertQualifiedCi({ ...ciRun(), ...mutation }, jobs(), expected, source), /release\.ci-/u);
  }
  const expanded = expectedCiJobNames(workflow.replace("lane: observation\n", "lane: new-lane\n"));
  assert(expanded.some(name => name.includes("new-lane")), "roster did not follow actual matrix");
});

test("automatic release finds pending versions after newer source CI and refuses tag regression", () => {
  assert.equal(requiresRelease("0.6.0", "0.6.0", "0.6.0"), false);
  assert.equal(requiresRelease("0.7.0", undefined, "0.6.0"), true, "superseding docs CI must still publish the pending version");
  assert.equal(requiresRelease("0.7.0", "0.7.0", "0.6.0"), true, "an already uploaded candidate still needs verification and promotion");
  assert.equal(requiresRelease("0.7.0", "0.7.0", undefined), true);
  assert.equal(requiresRelease("0.1.0", undefined, undefined), true);
  for (const newer of ["0.6.1", "0.7.0", "1.0.0"]) {
    assert.throws(() => requiresRelease("0.6.0", "0.6.0", newer), /release.version-regression/u);
  }
  assert.throws(() => requiresRelease("0.6.0", "0.5.0", "0.5.0"), /release.registry-version-mismatch/u);
});

test("registry reads distinguish 404 absence from bounded transient and network failures", async () => {
  const name = "@get-modular/core";
  let calls = 0;
  const pauses: number[] = [];
  const pause = async (milliseconds: number): Promise<void> => { pauses.push(milliseconds); };
  assert.equal(await registryVersion(name, "0.7.0", { request: async (url, options) => {
    calls += 1;
    assert.equal(url, "https://registry.npmjs.org/%40get-modular%2Fcore/0.7.0");
    assert.equal(options.redirect, "error"); assert(options.signal instanceof AbortSignal);
    return new Response("absent", { status: 404 });
  }, pause }), undefined);
  assert.equal(calls, 1); assert.deepEqual(pauses, []);
  calls = 0;
  await assert.rejects(() => registryVersion(name, "latest", { request: async () => {
    calls += 1; throw new Error("offline");
  }, pause }), /release.registry-read-unavailable/u);
  assert.equal(calls, 3); assert.deepEqual(pauses, [1000, 2000]);
  calls = 0; pauses.length = 0;
  assert.equal(await registryVersion(name, "latest", { request: async () => {
    calls += 1;
    return calls === 1 ? new Response("busy", { status: 503 })
      : Response.json({ name, version: "0.7.0" });
  }, pause }), "0.7.0");
  assert.equal(calls, 2); assert.deepEqual(pauses, [1000]);
  await assert.rejects(() => registryVersion(name, "latest", {
    request: async () => new Response("denied", { status: 403 }), pause,
  }), /release.registry-http:403/u);
});

test("release manifest and registry receipt reject package, source, run and archive substitution", () => {
  const valid = manifestFrom(manifest(), source);
  for (const mutation of [
    { ...valid, source: "b".repeat(40) },
    { ...valid, candidateTag: "candidate" },
    { ...valid, packages: valid.packages.slice(1) },
    { ...valid, packages: [...valid.packages.slice(1), { ...valid.packages[0], name: "@get-modular/lifecycle-kernel" }] },
    { ...valid, packages: valid.packages.map((entry, i) => i === 0 ? { ...entry, file: "../archive.tgz" } : entry) },
  ]) assert.throws(() => manifestFrom(mutation, source), /release\./u);
  const receipt = { ...valid, complete: true, runId: "123", candidateTag: "candidate-run-123" };
  assertRegistryReceipt(receipt, valid, "123");
  assert.throws(() => assertRegistryReceipt({ ...receipt, complete: false }, valid, "123"), /release.receipt-incomplete/u);
  assert.throws(() => assertRegistryReceipt({ ...receipt, candidateTag: "candidate-run-124" }, valid, "123"), /release.candidate-tag/u);
  assert.throws(() => assertRegistryReceipt(receipt, valid, "124"), /release.receipt-run/u);
  assert.throws(() => assertRegistryReceipt({ ...receipt, source: "b".repeat(40) }, valid, "123"), /release.source-mismatch/u);
  for (const [index, id] of packageIds.entries()) {
    const entry = valid.packages[index]; assert(entry);
    assertArchive(entry, Buffer.from(id));
    assert.throws(() => assertArchive(entry, Buffer.from(`${id}-changed`)), /release.archive-mismatch/u);
  }
});

test("qualified retained archives require their exact package trees, versions and both byte hashes", async () => {
  const qualifiedInputs: Record<string, string> = {};
  for (const path of retainedBuildPaths) {
    qualifiedInputs[path] = execFileSync("git", ["rev-parse", `${retainedSource}:${path}`], { encoding: "utf8" }).trim();
  }
  const qualifiedPolicy = json(execFileSync("git", ["show", `${retainedSource}:package.json`], { encoding: "utf8" }));
  assertRetainedBuildInputs({ ...qualifiedInputs }, qualifiedInputs, qualifiedPolicy, qualifiedPolicy);
  assert.throws(() => assertRetainedBuildInputs({ ...qualifiedInputs, "tsconfig.base.json": "changed" }, qualifiedInputs, qualifiedPolicy, qualifiedPolicy), /release.retained-build-input-drift/u);
  assert.throws(() => assertRetainedBuildInputs(qualifiedInputs, qualifiedInputs, { ...record(qualifiedPolicy), packageManager: "pnpm@1.0.0" }, qualifiedPolicy), /release.retained-build-policy-drift/u);
  const checksums = await readFile("research/releases/observation-0.1.0/SHA256SUMS", "utf8");
  const integrities = await readFile("research/releases/observation-0.1.0/INTEGRITY", "utf8");
  for (const id of packageIds) {
    const tree = { core: "07c13c9fdd7b69282f5b46aabc7c7f410894c70b", assembly: "cd42707e48907a231c46895d247d243579dbc3f6", resources: "44aab0974d2f88e30d362f609a5095bd4bbc78bb", conformance: "8edceba6669c4202bdb796f7c77bc26c9d20201b", observation: "2c5f9124db7d5f3874994a06d5d9aa883a987c42" }[id];
    const version = { core: "0.6.0", assembly: "0.6.0", resources: "0.2.0", conformance: "0.4.0", observation: "0.1.0" }[id];
    const retained = retainedPackage(`@get-modular/${id}`, version, tree); assert(retained);
    assert(checksums.includes(`${retained.sha256}  ${retained.file}\n`));
    assert(integrities.includes(`${retained.file} ${retained.integrity}\n`));
    const bytes = await readFile(resolve("research/releases/observation-0.1.0", retained.file));
    assertArchive(retained, bytes);
    assert.throws(() => retainedPackage(retained.name, retained.version, "b".repeat(40)), /release.retained-source-drift/u);
    assert.throws(() => assertArchive(retained, Buffer.concat([bytes, Buffer.from("drift")])), /release.archive-mismatch/u);
    assert.throws(() => manifestFrom({ ...manifest(), packages: manifest().packages.map(entry => entry.name === retained.name ? { name: retained.name, version: "9.9.9", file: retained.file, sha256: retained.sha256, integrity: retained.integrity } : entry) }, source), /release\./u);
    assert.equal(retainedPackage(retained.name, "9.9.9", tree), undefined);

  }
});

test("OIDC effects are isolated behind downloaded-byte consumer verification", async () => {
  const release = record(parse(await readFile(".github/workflows/npm-release.yml", "utf8")));
  assert.deepEqual(record(release.concurrency), { group: "npm-release-main", "cancel-in-progress": false });
  const releaseJobs = record(release.jobs);
  assert.deepEqual(Object.keys(releaseJobs), ["prepare", "publish", "verify", "promote"]);
  for (const name of ["prepare", "verify"]) {
    const job = record(releaseJobs[name]);
    assert.equal(record(job.permissions)["id-token"], undefined);
  }
  for (const name of ["publish", "promote"]) {
    const job = record(releaseJobs[name]);
    assert.deepEqual(record(job.permissions), { contents: "read", actions: "write", "id-token": "write" });
    assert.equal(record(job.with).phase, name);
    assert.equal(record(job.with)["artifact-name"], "npm-release-${{ github.run_id }}-${{ github.run_attempt }}");
    assert.equal(record(job.with).environment, "npm");
    assert.match(String(job.uses), /^agent-teams-ai\/\.github\/\.github\/workflows\/npm-publish\.yml@[a-f0-9]{40}$/u);
  }
  assert.deepEqual(record(releaseJobs.publish).needs, "prepare");
  assert.deepEqual(record(releaseJobs.verify).needs, ["prepare", "publish"]);
  assert.deepEqual(record(releaseJobs.promote).needs, ["prepare", "verify"]);
});
