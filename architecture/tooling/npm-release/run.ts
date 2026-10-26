import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFile, copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  archiveHashes, assertArchive, assertQualifiedCi, assertRegistryReceipt, assertRetainedBuildInputs, expectedCiJobNames,
  json, list, manifestFrom, packageIds, record, repository, requiresRelease, retainedBuildPaths, retainedPackage, retainedSource, text,
  type ReleasePackage,
} from "./policy.ts";

import { registryVersion } from "./registry.ts";
import { assertCurrentArchiveSource, currentArchivesFor, prepareCurrentArchive } from "./current-archives.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
function run(command: string, args: string[], cwd = root, extraEnv: NodeJS.ProcessEnv = {}): string {
  return execFileSync(command, args, { cwd, encoding: "utf8", timeout: 600000,
    maxBuffer: 20 * 1024 * 1024, env: { ...process.env, NODE_OPTIONS: "", ...extraEnv } });
}
function git(...args: string[]): string { return run("git", args).trim(); }
function api(endpoint: string): unknown { return json(run("gh", ["api", endpoint])); }
async function output(name: string, value: string): Promise<void> {
  const destination = process.env.GITHUB_OUTPUT;
  assert(destination, "release.output-required");
  await appendFile(destination, `${name}=${value}\n`);
}
function environment(name: string): string {
  const value = process.env[name];
  assert(value, `release.missing-environment:${name}`);
  return value;
}
async function selectQualifiedCi(source: string, event: Record<string, unknown>): Promise<void> {
  const eventRun = event.workflow_run;
  const runValue = eventRun ?? list(record(api(`repos/${repository}/actions/workflows/ci.yml/runs?head_sha=${source}&branch=main&status=completed&per_page=100`)).workflow_runs)
    .find(value => { const candidate = record(value); return candidate.conclusion === "success" && ["push", "workflow_dispatch"].includes(text(candidate.event)); });
  assert(runValue, "release.no-qualified-ci");
  const observed = record(runValue);
  assert(Number.isSafeInteger(observed.id) && Number.isSafeInteger(observed.run_attempt), "release.ci-run-identity");
  const runId = String(observed.id);
  const attempt = String(observed.run_attempt);
  const freshRun = api(`repos/${repository}/actions/runs/${runId}/attempts/${attempt}`);
  const pages = list(json(run("gh", ["api", "--paginate", "--slurp", `repos/${repository}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`])));
  const jobs = pages.flatMap(page => list(record(page).jobs));
  assertQualifiedCi(freshRun, jobs, expectedCiJobNames(await readFile(join(root, ".github/workflows/ci.yml"), "utf8")), source);
  console.log(`CI qualified: ${runId}, attempt ${attempt}, source ${source}, ${jobs.length} successful jobs`);
}
async function sourcePackages(): Promise<{ id: string; name: string; version: string; tree: string }[]> {
  const packages = [];
  for (const id of packageIds) {
    const manifest = record(json(await readFile(join(root, "packages", id, "package.json"), "utf8")));
    assert.notEqual(manifest.private, true, "release.private-package");
    assert.equal(manifest.name, `@get-modular/${id}`, "release.package-name");
    packages.push({ id, name: text(manifest.name), version: text(manifest.version), tree: git("rev-parse", `HEAD:packages/${id}`) });
  }
  const allPackageDirs = await readdir(join(root, "packages"));
  for (const id of allPackageDirs.filter(id => !packageIds.some(publicId => publicId === id))) {
    const candidate = record(json(await readFile(join(root, "packages", id, "package.json"), "utf8")));
    assert.equal(candidate.private, true, "release.unclassified-public-package");
  }
  return packages;
}
async function prepare(destination: string): Promise<void> {
  await output("ready", "false");
  const source = environment("GITHUB_SHA");
  assert.equal(environment("GITHUB_REPOSITORY"), repository, "release.repository");
  assert.equal(environment("GITHUB_REF"), "refs/heads/main", "release.ref");
  assert.match(source, /^[a-f0-9]{40}$/u);
  assert.equal(git("rev-parse", "HEAD"), source, "release.checkout-source");
  assert.equal(git("status", "--porcelain", "--untracked-files=no"), "", "release.dirty-source");
  const event = record(json(await readFile(environment("GITHUB_EVENT_PATH"), "utf8")));
  const eventName = environment("GITHUB_EVENT_NAME");
  assert(["workflow_run", "workflow_dispatch"].includes(eventName), "release.event");
  const main = text(record(record(api(`repos/${repository}/git/ref/heads/main`)).object).sha);
  // A workflow_run uses today's default-branch SHA, which can differ from its CI subject.
  if (source !== main || (eventName === "workflow_run" && record(event.workflow_run).head_sha !== source)) {
    console.log("Skipped stale source; no artifact or publication was prepared");
    return;
  }
  if (eventName === "workflow_run") assert.equal(record(event.workflow_run).event, "push", "release.upstream-ci-event");
  await selectQualifiedCi(source, event);
  const packages = await sourcePackages();
  const registryStates = await Promise.all(packages.map(async item => {
    const [exact, latest] = await Promise.all([registryVersion(item.name, item.version), registryVersion(item.name, "latest")]);
    return requiresRelease(item.version, exact, latest);
  }));
  if (eventName === "workflow_run" && registryStates.every(required => !required)) {
    console.log("Every current public version is already published on latest; manual dispatch remains available for reconciliation");
    return;
  }
  await mkdir(destination, { recursive: false });
  const currentArchives = currentArchivesFor(packages);
  const currentEvidence = `${destination}-current-archive-evidence`;
  if (currentArchives.length > 0) {
    assertCurrentArchiveSource(root, source, packages);
    await mkdir(currentEvidence, { recursive: false });
  }
  const candidates = packages.map(item => ({ ...item, retained: retainedPackage(item.name, item.version, item.tree) }));
  if (candidates.some(item => item.retained)) {
    const currentInputs: Record<string, string> = {};
    const qualifiedInputs: Record<string, string> = {};
    for (const path of retainedBuildPaths) {
      currentInputs[path] = git("rev-parse", `HEAD:${path}`);
      qualifiedInputs[path] = git("rev-parse", `${retainedSource}:${path}`);
    }
    const currentPolicy = json(await readFile(join(root, "package.json"), "utf8"));
    const qualifiedPolicy = json(git("show", `${retainedSource}:package.json`));
    const hasReleaseChecks = record(record(currentPolicy).devDependencies)["@agent-teams/release-checks"] !== undefined;
    assertRetainedBuildInputs(currentInputs, qualifiedInputs, currentPolicy, qualifiedPolicy, hasReleaseChecks ? {
      admission: json(await readFile(join(root, "architecture/tooling/npm-release/release-checks-adoption.json"), "utf8")),
      currentWorkspace: await readFile(join(root, "pnpm-workspace.yaml"), "utf8"),
      qualifiedWorkspace: run("git", ["show", `${retainedSource}:pnpm-workspace.yaml`]),
      currentLock: await readFile(join(root, "pnpm-lock.yaml"), "utf8"),
      qualifiedLock: run("git", ["show", `${retainedSource}:pnpm-lock.yaml`]),
    } : undefined);
  }
  if (candidates.some(item => !item.retained)) {
    for (const script of ["assembly:build", "resources:build", "conformance:build", "observation:build"]) run("pnpm", ["--pm-on-fail=ignore", "run", script]);
  }
  const entries: ReleasePackage[] = [];
  for (const item of candidates) {
    const file = `get-modular-${item.id}-${item.version}.tgz`;
    if (item.retained) {
      const archive = join(root, "research/releases/observation-0.1.0", file);
      assertArchive(item.retained, await readFile(archive));
      await copyFile(archive, join(destination, file));
      console.log(`Retained qualified bytes: ${item.name}@${item.version}, package tree ${item.tree}`);
    } else {
      run("pnpm", ["--pm-on-fail=ignore", "--dir", `packages/${item.id}`, "pack", "--pack-destination", destination]);
      if (currentArchives.some(pin => pin.name === item.name)) {
        const proof = await prepareCurrentArchive(root, source, packages, item.name, join(destination, file), currentEvidence);
        console.log(JSON.stringify({ package: item.name, source, selected: proof.selected, containerBytesEqual: proof.containerBytesEqual }));
      }
    }
    entries.push({ name: item.name, version: item.version, file, ...archiveHashes(await readFile(join(destination, file))) });
  }
  const manifest = manifestFrom({ schemaVersion: 1, repository, source, packages: entries }, source);
  await writeFile(join(destination, "release.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  await output("ready", "true");
}
async function verify(original: string, registry: string): Promise<void> {
  const source = environment("GITHUB_SHA");
  const manifest = manifestFrom(json(await readFile(join(original, "release.json"), "utf8")), source);
  assert.deepEqual(manifestFrom(json(await readFile(join(registry, "release.json"), "utf8")), source), manifest, "release.registry-manifest");
  assertRegistryReceipt(json(await readFile(join(registry, "receipt.json"), "utf8")), manifest, environment("GITHUB_RUN_ID"));
  for (const entry of manifest.packages) {
    assertArchive(entry, await readFile(join(original, entry.file)));
    assertArchive(entry, await readFile(join(registry, entry.file)));
    const id = entry.name.slice("@get-modular/".length);
    const sourceManifest = record(json(await readFile(join(root, "packages", id, "package.json"), "utf8")));
    assert.equal(sourceManifest.version, entry.version, "release.registry-version");
  }
  // This existing independent fixture checks actual installed exports, Core compilation,
  // Assembly behavior, scoped cleanup, Conformance isolation, Observation delivery and leaks.
  console.log(run(process.execPath, ["--test", "--test-name-pattern=disposable installed public roots", "tests/node-runtime-compatibility.test.mjs"], root,
    { GET_MODULAR_COMPAT_ARCHIVE_DIR: registry }));
  const consumer = await mkdtemp(join(tmpdir(), "get-modular-registry-types-"));
  try {
    await writeFile(join(consumer, "package.json"), JSON.stringify({ name: "registry-type-consumer", private: true, type: "module",
      dependencies: Object.fromEntries(manifest.packages.map(entry => [entry.name, `file:${join(registry, entry.file)}`])) }));
    run("npm", ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false"], consumer,
      { npm_config_cache: join(consumer, "cache"), npm_config_engine_strict: "true" });
    await copyFile(join(root, "tests/npm-release-consumer.ts"), join(consumer, "consumer.ts"));
    run(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "--strict", "--noUncheckedIndexedAccess", "--exactOptionalPropertyTypes", "--skipLibCheck", "false",
      "--target", "ES2024", "--lib", "ES2024,DOM,ESNext.Disposable", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--noEmit", "consumer.ts"], consumer);
    run(process.execPath, ["consumer.ts"], consumer);
    console.log("Downloaded registry archives: installed consumer runtime and strict public types passed");
  } finally { await rm(consumer, { recursive: true, force: true }); }
}
const [command, first, second] = process.argv.slice(2);
if (command === "prepare" && first) await prepare(resolve(first));
else if (command === "verify" && first && second) await verify(resolve(first), resolve(second));
else throw new Error("Usage: node architecture/tooling/npm-release/run.ts prepare OUTPUT | verify ORIGINAL REGISTRY");
