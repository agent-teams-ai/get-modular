import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, open, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { copyReadyPackages, fixtureCompiler, treeIdentity } from "../support/materialize.mjs";
import { generateGrowthSource } from "./generate.ts";
import { expectedInventory, expectedSourcePaths } from "./oracle.mjs";
import { applyLeafEdit, applySharedContractEdit, restoreEdit } from "./patches.mjs";
import { readUpstreamCandidate } from "./upstream-compiler.ts";

const ownDirectory = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(ownDirectory, "../../../..");
const size = Number(process.argv[2]);
const directory = resolve(process.argv[3]);
const incremental = process.argv[4] === "measurement";
assert.ok(["measurement", "correctness"].includes(process.argv[4]));
const budgetsMs = { compiler: 180000, runtime: 120000, scanner: 0, aggregate: 600000 };
const report = {
  size, status: "running", scenarios: [size === 8 ? "G-01" : "G-02", ...(incremental ? ["G-03"] : [])], budgetsMs,
  sourceCoverage: "incomplete; source scanner not selected", scanner: "not-collected", rss: "not-collected",
  incrementalEdits: incremental ? "fixed G-03 patches; one sample per stage" : "G-03 not selected",
  stages: [], identities: { node: process.version, platform: process.platform, arch: process.arch },
};
const saveReport = () => writeFile(join(directory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
const hash = contents => createHash("sha256").update(contents).digest("hex");

function exchangeStage(type, expected, stage, kind) {
  assert.equal(typeof process.send, "function", "fixture.growth.external-supervisor-required");
  return new Promise((resolveMessage, reject) => {
    const cleanup = () => { process.off("message", received); process.off("disconnect", disconnected); };
    const received = message => {
      cleanup();
      if (message?.type !== expected || message.stage !== stage) {
        reject(new Error("fixture.growth.invalid-supervisor-acknowledgement"));
      } else { resolveMessage(message); }
    };
    const disconnected = () => { cleanup(); reject(new Error("fixture.growth.supervisor-disconnected")); };
    process.once("message", received);
    process.once("disconnect", disconnected);
    process.send({ type, stage, kind }, error => { if (error) { cleanup(); reject(error); } });
  });
}

async function invoke(stage, args, cap, setup = false, executable = process.execPath) {
  const observation = { stage, setup, command: [executable, ...args], cwd: directory, capMs: cap,
    status: "running", wallMs: null, exit: null, signal: null, error: null };
  report.stages.push(observation);
  await saveReport();
  const stdoutPath = join(directory, `${stage}.stdout.log`);
  const stderrPath = join(directory, `${stage}.stderr.log`);
  const stdout = await open(stdoutPath, "w");
  const stderr = await open(stderrPath, "w");
  let result;
  let wallMs;
  try {
    const armed = await exchangeStage("stage-begin", "stage-armed", stage, cap === budgetsMs.compiler ? "compiler" : "runtime");
    assert.equal(armed.capMs, cap);
    const started = performance.now();
    // Only the parent enforces deadlines: killing a Windows wrapper here would orphan its native child.
    // File-backed logs survive a parent kill and cannot trigger spawnSync's maxBuffer wrapper termination.
    result = spawnSync(executable, args, { cwd: directory, stdio: ["ignore", stdout.fd, stderr.fd],
      env: { ...process.env, NODE_PATH: "", NODE_OPTIONS: "", NODE_TEST_CONTEXT: undefined } });
    wallMs = performance.now() - started;
    await exchangeStage("stage-end", "stage-ended", stage);
  } finally {
    await stdout.close();
    await stderr.close();
  }
  const output = await readFile(stdoutPath, "utf8");
  const errors = await readFile(stderrPath, "utf8");
  Object.assign(observation, { wallMs, exit: result.status, signal: result.signal, error: result.error?.code ?? null,
    status: result.error || result.signal || result.status !== 0 ? "failed" : "passed" });
  observation.diagnostics = Object.fromEntries(output.split("\n")
    .filter(line => /^[\w ]+:\s*\S/u.test(line))
    .map(line => { const colon = line.indexOf(":"); return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()]; }));
  await saveReport();
  assert.equal(result.error, undefined, `${stage}: ${result.error?.message}`);
  assert.equal(result.signal, null, `${stage}: ${result.signal}`);
  assert.equal(result.status, 0, `${stage}: ${output}\n${errors}`);
  return observation;
}

async function sourceInventory(sourceDirectory) {
  const files = [];
  let bytes = 0;
  let importOccurrences = 0;
  async function visit(relative) {
    for (const entry of await readdir(join(sourceDirectory, relative), { withFileTypes: true })) {
      const name = `${relative}/${entry.name}`;
      if (entry.isDirectory()) { await visit(name); }
      else {
        assert.ok(entry.isFile() && name.endsWith(".ts"));
        const source = await readFile(join(sourceDirectory, name));
        files.push(name); bytes += source.byteLength;
        importOccurrences += [...source.toString("utf8").matchAll(/^import\s/gmu)].length;
      }
    }
  }
  await visit("src");
  return { files: files.toSorted(), count: files.length, bytes, importOccurrences,
    importCountingMethod: "one top-level static import per generated import line; not a source conformance scanner" };
}

try {
  await mkdir(directory, { recursive: true });
  await saveReport();
  report.identities.packageOutputs = await copyReadyPackages(directory);
  await writeFile(join(directory, "package.json"), '{"private":true,"type":"module"}\n');
  await generateGrowthSource(directory, size);
  await mkdir(join(directory, "tests"), { recursive: true });
  if (size === 8) {
    await mkdir(join(directory, "tests/features/f003"), { recursive: true });
    await cp(join(ownDirectory, "test-source/wrong-provider.ts.txt"), join(directory, "tests/features/f003/wrong-provider.ts"));
    await cp(join(ownDirectory, "test-source/aggregate-types.ts.txt"), join(directory, "tests/aggregate-types.ts"));
  }
  await cp(join(ownDirectory, "test-source/runtime.mjs.txt"), join(directory, "tests/runtime.mjs"));
  if (incremental) {
    await cp(join(ownDirectory, "test-source/incremental-runtime.mjs.txt"), join(directory, "tests/incremental-runtime.mjs"));
  }
  await cp(join(ownDirectory, "oracle.mjs"), join(directory, "tests/oracle.mjs"));
  const config = { compilerOptions: {
    target: "ES2024", module: "NodeNext", moduleResolution: "NodeNext", lib: ["ES2024", "ESNext.Disposable", "DOM"],
    strict: true, skipLibCheck: false, types: [], rootDir: ".", outDir: "out", declaration: true, noEmitOnError: true,
  }, include: ["src/**/*.ts", "tests/**/*.ts"] };
  await writeFile(join(directory, "tsconfig.json"), `${JSON.stringify(config, null, 2)}\n`);
  report.inventory = await sourceInventory(directory);
  assert.equal(report.inventory.count, expectedInventory(size).sourceFiles);
  assert.deepEqual(report.inventory.files, expectedSourcePaths(size));
  report.identities.generatedSource = await treeIdentity(join(directory, "src"));
  report.identities.testSource = await treeIdentity(join(directory, "tests"));
  report.identities.generator = hash(await readFile(join(ownDirectory, "generate.ts")));
  report.identities.oracle = hash(await readFile(join(ownDirectory, "oracle.mjs")));
  report.identities.patches = hash(await readFile(join(ownDirectory, "patches.mjs")));
  report.identities.config = hash(await readFile(join(directory, "tsconfig.json")));
  report.identities.lockfile = hash(await readFile(join(workspace, "pnpm-lock.yaml")));
  report.identities.fixtureSource = await treeIdentity(ownDirectory);
  const revision = spawnSync("git", ["rev-parse", "HEAD"], { cwd: workspace, encoding: "utf8", timeout: 10000 });
  assert.equal(revision.status, 0, revision.stderr);
  report.identities.sourceHead = revision.stdout.trim();
  const candidate = process.argv[5] === undefined ? undefined : await readUpstreamCandidate(process.argv[5]);
  const compiler = candidate ?? await fixtureCompiler("typescript");
  report.identities.compiler = candidate ?? { ...compiler, cliSha256: hash(await readFile(compiler.cli)),
    package: await treeIdentity(resolve(dirname(compiler.cli), "..")) };
  const buildInfo = join(directory, "build-info/current.tsbuildinfo");
  if (incremental) { await mkdir(dirname(buildInfo), { recursive: true }); }
  const compilerArgs = [...(candidate === undefined ? [compiler.cli] : []), "-p", "tsconfig.json", "--singleThreaded", "--extendedDiagnostics", "--pretty", "false",
    ...(incremental ? ["--incremental", "--tsBuildInfoFile", buildInfo] : [])];
  report.identities.compilerArguments = compilerArgs;
  report.identities.buildInfo = incremental ? buildInfo : "not-selected";
  async function compile(stage, setup = false) {
    const observation = await invoke(stage, compilerArgs, budgetsMs.compiler, setup,
      candidate === undefined ? process.execPath : compiler.cli);
    observation.source = await treeIdentity(join(directory, "src"));
    observation.output = await treeIdentity(join(directory, "out"));
    if (incremental) { observation.buildInfoSha256 = hash(await readFile(buildInfo)); }
    await saveReport();
    return observation;
  }
  async function verifyEdit(variant) {
    await invoke(`verify-${variant}`, [join(directory, "tests/incremental-runtime.mjs"), String(size), variant], budgetsMs.runtime);
    return JSON.parse(await readFile(join(directory, `verification-${variant}.json`), "utf8"));
  }
  await saveReport();
  const cold = await compile("cold");
  report.compilerDiagnostics = cold.diagnostics;
  await invoke("runtime", [join(directory, "tests/runtime.mjs"), String(size)], budgetsMs.runtime);
  report.runtime = JSON.parse(await readFile(join(directory, "runtime.json"), "utf8"));
  report.runtime.scenarios = [size === 8 ? "G-01" : "G-02"];
  await saveReport();
  if (incremental) {
    const unchanged = await compile("unchanged-incremental");
    assert.deepEqual(unchanged.source, cold.source);
    assert.deepEqual(unchanged.output, cold.output);
    const leaf = await applyLeafEdit(directory, size);
    report.edits = { leaf };
    await saveReport();
    await compile("leaf-edit");
    report.leaf = await verifyEdit("leaf");
    await restoreEdit(directory, leaf);
    assert.deepEqual(await treeIdentity(join(directory, "src")), report.identities.generatedSource);
    const rewarm = await compile("baseline-rewarm", true);
    assert.deepEqual(rewarm.output, cold.output);
    report.edits.sharedContract = await applySharedContractEdit(directory);
    await saveReport();
    await compile("shared-contract-edit");
    report.sharedContract = await verifyEdit("shared-contract");
  }
  report.status = "passed";
  await saveReport();
} catch (error) {
  report.status = "failed";
  report.failure = { name: error.name, message: error.message };
  await saveReport();
  console.error(error);
  process.exitCode = 1;
}
