import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFile, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  archiveHashes, assertArchive, assertQualifiedCi, assertRegistryReceipt, assertRetainedBuildInputs, expectedCiJobNames,
  json, list, manifestFrom, record, repository, requiresRelease, retainedBuildPaths, retainedPackage, retainedSource, text,
  type ReleasePackage,
} from "./policy.ts";

import { registryArchive, registryIdentity, registryMetadata, registryVersion } from "./registry.ts";
import { assertCurrentArchiveSource, currentArchivesFor, prepareCurrentArchive, qualifyRegistryArchive } from "./current-archives.ts";
import { sourcePackages } from "./source-packages.ts";

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
  // Bound each response; pagination still collects the complete attempt roster.
  const pages = list(json(run("gh", ["api", "--paginate", "--slurp", `repos/${repository}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=30`])));
  const jobs = pages.flatMap(page => list(record(page).jobs));
  assertQualifiedCi(freshRun, jobs, expectedCiJobNames(await readFile(join(root, ".github/workflows/ci.yml"), "utf8")), source);
  console.log(`CI qualified: ${runId}, attempt ${attempt}, source ${source}, ${jobs.length} successful jobs`);
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
  const { packages, pendingAdmission } = await sourcePackages(root);
  if (pendingAdmission) {
    const message = "@get-modular/effect@0.0.0 is a source candidate; the coordinated version change must merge before publication. No archives or publication were prepared.";
    console.warn(`::warning title=Release admission pending::${message}`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `### npm release deferred: pending admission\n\n${message}\n`);
    }
    return;
  }
  const registryStates = await Promise.all(packages.map(async item => {
    const [metadata, latest] = await Promise.all([registryMetadata(item.name, item.version), registryVersion(item.name, "latest")]);
    const exact = metadata === undefined ? undefined : text(metadata.version);
    return { metadata, required: requiresRelease(item.version, exact, latest) };
  }));
  if (eventName === "workflow_run" && registryStates.every(state => !state.required)) {
    console.log("Every current public version is already published on latest; manual dispatch remains available for reconciliation");
    return;
  }
  await mkdir(destination, { recursive: false });
  const currentArchives = currentArchivesFor(packages);
  const currentEvidence = `${destination}-current-archive-evidence`;
  if (currentArchives.length > 0) assertCurrentArchiveSource(root, source, packages);
  if (currentArchives.length > 0 || registryStates.some(state => state.metadata !== undefined)) {
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
    for (const script of ["assembly:build", "resources:build", "conformance:build", "observation:build", "effect:build"]) run("pnpm", ["--pm-on-fail=ignore", "run", script]);
  }
  const entries: ReleasePackage[] = [];
  for (const [index, item] of candidates.entries()) {
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
      } else {
        const state = registryStates[index]; assert(state, "release.registry-state");
        if (state.metadata !== undefined) {
          const identity = registryIdentity(item.name, item.version, state.metadata);
          const packedFile = join(destination, file);
          const fresh = await readFile(packedFile);
          await writeFile(join(currentEvidence, `fresh-${file}`), fresh, { flag: "wx" });
          try {
            const original = await registryArchive(identity.url);
            await writeFile(join(currentEvidence, `registry-${file}`), original, { flag: "wx" });
            const selection = qualifyRegistryArchive(item.name, item.version, identity.integrity, fresh, original);
            await writeFile(join(currentEvidence, `${item.id}-selection.json`), JSON.stringify({ source, ...selection.proof }, null, 2) + "\n", { flag: "wx" });
            await writeFile(packedFile, selection.bytes);
          } catch (error) {
            await writeFile(join(currentEvidence, `${item.id}-failure.json`), JSON.stringify({ source, package: item.name,
              version: item.version, fresh: archiveHashes(fresh), identity, error: String(error) }, null, 2) + "\n", { flag: "wx" });
            throw error;
          }
        }
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
    const effectPeerPath = join(root, "node_modules/effect");
    const peer = record(json(await readFile(join(effectPeerPath, "package.json"), "utf8")));
    assert.equal(peer.version, "4.1.4", "release.effect-peer-version");
    for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      assert.deepEqual(peer[field] ?? {}, {}, "release.effect-peer-closure");
    }
    await writeFile(join(consumer, "package.json"), JSON.stringify({ name: "registry-type-consumer", private: true, type: "module",
      dependencies: { ...Object.fromEntries(manifest.packages.map(entry => [entry.name, `file:${join(registry, entry.file)}`])),
        effect: pathToFileURL(effectPeerPath).href } }));
    run("npm", ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false"], consumer,
      { npm_config_cache: join(consumer, "cache"), npm_config_engine_strict: "true" });
    await copyFile(join(root, "tests/npm-release-consumer.ts"), join(consumer, "consumer.ts"));
    // The fixture typechecks against this package's built public carrier in its own
    // boundary; the isolated consumer must resolve the downloaded package root.
    const effectFixture = await readFile(join(root, "packages/effect/tests/installed-release.ts"), "utf8");
    const localCarrier = 'from "../dist/index.js"';
    assert.equal(effectFixture.split(localCarrier).length, 2, "release.effect-fixture-carrier");
    await writeFile(join(consumer, "effect-consumer.ts"), effectFixture.replace(localCarrier, 'from "@get-modular/effect"'));
    run(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "--strict", "--noUncheckedIndexedAccess", "--exactOptionalPropertyTypes", "--skipLibCheck", "false",
      "--target", "ES2024", "--lib", "ES2024,DOM,ESNext.Disposable,ESNext.Promise", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--noEmit", "consumer.ts", "effect-consumer.ts"], consumer);
    run(process.execPath, ["consumer.ts"], consumer);
    run(process.execPath, ["effect-consumer.ts"], consumer);
    console.log("Downloaded registry archives: installed consumer runtime and strict public types passed");
  } finally { await rm(consumer, { recursive: true, force: true }); }
}
const [command, first, second] = process.argv.slice(2);
if (command === "prepare" && first) await prepare(resolve(first));
else if (command === "verify" && first && second) await verify(resolve(first), resolve(second));
else throw new Error("Usage: node architecture/tooling/npm-release/run.ts prepare OUTPUT | verify ORIGINAL REGISTRY");
