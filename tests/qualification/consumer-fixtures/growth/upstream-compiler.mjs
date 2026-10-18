// Optional compiler-owner experiment. It never installs or changes the supported compiler pin.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { arch, cpus, freemem, platform, release, totalmem } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ownPath = fileURLToPath(import.meta.url);
const buildCapMs = 600000;
export const upstreamSelection = Object.freeze({
  repository: "microsoft/TypeScript",
  commit: "3200b90a617bcf9ad26543b347cabad8ff0dad14",
  archiveSha256: "034bb7bb88f1354b416f9c617a82b88af7f2344f279e9a697a73bf4276638858",
});
const goSelection = Object.freeze({
  version: "go1.27.2",
  archiveSha256: "ecbadb99091a3f46e31f5f934b068b1864eafa7995211b39eaddf76996045fe5",
});
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const save = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);

/** A build manifest is input identity, not a released package or a promotion attestation. */
export async function readUpstreamCandidate(path) {
  assert.ok(isAbsolute(path), "fixture.growth.candidate-manifest-path");
  const bytes = await readFile(path);
  const candidate = JSON.parse(bytes);
  assert.equal(candidate.kind, "unreleased-upstream-native-candidate");
  assert.deepEqual(candidate.source, upstreamSelection);
  assert.deepEqual(candidate.go, goSelection);
  assert.equal(candidate.version, "7.1.0-dev");
  assert.ok(isAbsolute(candidate.cli), "fixture.growth.candidate-binary-path");
  assert.equal(hash(await readFile(candidate.cli)), candidate.binarySha256, "fixture.growth.candidate-binary-drift");
  return { ...candidate, manifestSha256: hash(bytes) };
}

async function run(command, args, cwd, env = process.env, capture = false) {
  const child = spawn(command, args, { cwd, env, stdio: ["ignore", capture ? "pipe" : "inherit", "inherit"] });
  let stdout = "";
  if (capture) child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
  const result = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolveExit({ code, signal }));
  });
  assert.equal(result.signal, null, `${command}: ${result.signal}`);
  assert.equal(result.code, 0, `${command}: exit ${result.code}`);
  return stdout;
}

async function download(directory, name, url, expectedSha256) {
  const started = performance.now();
  const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
  assert.equal(response.ok, true, `${url}: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const sha256 = hash(bytes);
  assert.equal(sha256, expectedSha256, `${name}: archive integrity`);
  await writeFile(join(directory, name), bytes);
  return { name, url, sha256, bytes: bytes.byteLength, wallMs: performance.now() - started };
}

async function buildWorker(directory) {
  assert.equal(typeof process.send, "function", "fixture.growth.external-build-supervisor-required");
  assert.equal(process.version, "v26.11.1");
  const pnpm = (await run("pnpm", ["--version"], directory, process.env, true)).trim();
  assert.equal(pnpm, "11.20.0");
  await save(join(directory, "runtime-identity.json"), { node: process.version, pnpm,
    nodeBinarySha256: hash(await readFile(process.execPath)) });
  const downloads = [];
  downloads.push(await download(directory, "go.tar.gz", "https://go.dev/dl/go1.27.2.linux-amd64.tar.gz", goSelection.archiveSha256));
  downloads.push(await download(directory, "upstream.tar.gz",
    `https://api.github.com/repos/${upstreamSelection.repository}/tarball/${upstreamSelection.commit}`, upstreamSelection.archiveSha256));
  await save(join(directory, "downloads.json"), downloads);
  await mkdir(join(directory, "go-toolchain"));
  await mkdir(join(directory, "source"));
  await run("tar", ["-xzf", join(directory, "go.tar.gz"), "-C", join(directory, "go-toolchain")], directory);
  await run("tar", ["-xzf", join(directory, "upstream.tar.gz"), "-C", join(directory, "source")], directory);
  const go = join(directory, "go-toolchain/go/bin/go");
  const source = join(directory, "source/microsoft-TypeScript-3200b90/tsc");
  const env = { ...process.env, GOCACHE: join(directory, "go-cache"), GOPATH: join(directory, "go-path"),
    GOTOOLCHAIN: "local", GOWORK: "off", GOMAXPROCS: "4" };
  assert.equal((await run(go, ["version"], source, env, true)).trim(), "go version go1.27.2 linux/amd64");
  const cli = join(directory, "tsc");
  const command = [go, "build", "-buildvcs=false", "-p", "4", "-o", cli, "./cmd/tsc"];
  await save(join(directory, "build-command.json"), { command, cwd: source, environment: {
    GOTOOLCHAIN: env.GOTOOLCHAIN, GOWORK: env.GOWORK, GOMAXPROCS: env.GOMAXPROCS,
  } });
  await run(go, command.slice(1), source, env);
  const version = (await run(cli, ["--version"], source, env, true)).trim();
  assert.equal(version, "Version 7.1.0-dev");
  await writeFile(join(directory, "go-build-info.txt"), await run(go, ["version", "-m", cli], source, env, true));
  await save(join(directory, "candidate.json"), { kind: "unreleased-upstream-native-candidate", source: upstreamSelection,
    go: goSelection, cli, version: version.slice("Version ".length), binarySha256: hash(await readFile(cli)) });
}

async function buildCandidate(directory) {
  const stdout = await open(join(directory, "build.stdout.log"), "w");
  const stderr = await open(join(directory, "build.stderr.log"), "w");
  const started = performance.now();
  let expired = false;
  let error;
  const child = spawn(process.execPath, [ownPath, "--build-worker", directory], {
    detached: true, stdio: ["ignore", stdout.fd, stderr.fd, "ipc"],
  });
  const timer = setTimeout(() => {
    expired = true;
    if (child.pid !== undefined) {
      try { process.kill(-child.pid, "SIGKILL"); }
      catch (failure) { if (failure.code !== "ESRCH") error = failure.message; }
    }
  }, buildCapMs);
  let result;
  try {
    result = await new Promise(resolveExit => {
      child.once("error", failure => { error = failure.message; });
      child.once("close", (code, signal) => resolveExit({ code, signal }));
    });
  } finally {
    clearTimeout(timer);
    await stdout.close();
    await stderr.close();
  }
  const observation = { capMs: buildCapMs, wallMs: performance.now() - started, expired, error, ...result };
  await save(join(directory, "build-supervision.json"), observation);
  assert.ok(!expired && error === undefined && result.code === 0, "fixture.growth.candidate-build-failed");
}

async function hostIdentity() {
  const cgroup = {};
  for (const name of ["memory.max", "memory.current", "memory.peak", "memory.events"]) {
    try { cgroup[name] = (await readFile(`/sys/fs/cgroup/${name}`, "utf8")).trim(); }
    catch (error) { if (error.code !== "ENOENT") throw error; cgroup[name] = "not-collected"; }
  }
  return { node: process.version, platform: platform(), arch: arch(), release: release(), cpus: cpus().length,
    totalMemoryBytes: totalmem(), freeMemoryBytes: freemem(), availableMemoryBytes: process.availableMemory(), cgroup,
    compilerEnvironment: Object.fromEntries(["GOGC", "GOMEMLIMIT", "GOMAXPROCS"].map(name => [name, process.env[name] ?? "unset"])) };
}

async function experiment(directory) {
  assert.equal(process.version, "v26.11.1");
  assert.equal(platform(), "linux");
  assert.equal(arch(), "x64");
  await mkdir(directory, { recursive: false });
  const host = await hostIdentity();
  await save(join(directory, "host-before.json"), host);
  const finiteCgroup = /^\d+$/u.test(host.cgroup["memory.max"]) ? Number(host.cgroup["memory.max"]) : Infinity;
  assert.ok(Math.min(host.totalMemoryBytes, finiteCgroup) > 8 * 1024 ** 3, "fixture.growth.larger-disposable-host-required");
  const result = { status: "running", claim: "unreleased candidate diagnostic only; no supported-pin adoption or conformance promotion",
    selectedSize: 1000, precedingSize: "N500 exact-source candidate E2E retained by the delivery owner; not rerun here",
    buildCapMs, fixtureCapsMs: { compiler: 180000, runtime: 120000, aggregate: 600000 } };
  await save(join(directory, "experiment.json"), result);
  try {
    await buildCandidate(directory);
    const compilerCandidate = join(directory, "candidate.json");
    result.compiler = await readUpstreamCandidate(compilerCandidate);
    const { measureGrowth } = await import("./run.mjs");
    const measured = await measureGrowth({ size: 1000, compilerCandidate, directoryParent: directory });
    result.status = measured.status;
    result.directory = measured.directory;
    result.source = measured.identities.generatedSource;
    result.graph = measured.runtime.graph;
    result.smoke = { attempts: measured.runtime.smoke.attempts, factoryCalls: measured.runtime.smoke.factoryCalls,
      dependencyPortReads: measured.runtime.smoke.dependencyPortReads };
  } catch (error) {
    result.status = "failed";
    result.failure = { name: error.name, message: error.message };
    throw error;
  } finally {
    await save(join(directory, "host-after.json"), await hostIdentity());
    await save(join(directory, "experiment.json"), result);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === ownPath) {
  try {
    assert.equal(process.argv.length, 4, "Usage: node upstream-compiler.mjs --directory <new-absolute-directory>");
    const directory = resolve(process.argv[3]);
    if (process.argv[2] === "--build-worker") {
      try { await buildWorker(directory); }
      finally { process.disconnect?.(); }
    } else {
      assert.equal(process.argv[2], "--directory");
      await experiment(directory);
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
