import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const ownDirectory = dirname(fileURLToPath(import.meta.url));
const aggregateMs = 600000;
const stageCapsMs = Object.freeze({ compiler: 180000, runtime: 120000 });

function terminateFamily(child) {
  if (child.pid === undefined) { return; }
  if (process.platform === "win32") {
    const result = spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { encoding: "utf8", timeout: 10000 });
    return { method: "taskkill-tree", exit: result.status, signal: result.signal, error: result.error?.code ?? null,
      stderr: result.stderr ?? "" };
  } else {
    try { process.kill(-child.pid, "SIGKILL"); return { method: "process-group", signal: "SIGKILL", sent: true }; }
    catch (error) {
      if (error.code !== "ESRCH") { throw error; }
      return { method: "process-group", signal: "SIGKILL", sent: false, absent: true };
    }
  }
}

/** One selected size; its parent watchdog encloses all generation and child work. */
export async function measureGrowth({ size, retain = true, incremental = size !== 8,
  compilerCandidate, directoryParent = tmpdir() }) {
  assert.ok([8, 100, 500, 1000].includes(size), "fixture.growth.unsupported-size");
  assert.ok(!incremental || size !== 8, "G-01 owns the small correctness run; G-03 starts at 100");
  assert.ok(compilerCandidate === undefined || isAbsolute(compilerCandidate), "fixture.growth.candidate-manifest-path");
  assert.ok(isAbsolute(directoryParent), "fixture.growth.directory-parent-path");
  const started = performance.now();
  const directory = await mkdtemp(join(directoryParent, `gm-growth-${size}-`));
  const stdout = await open(join(directory, "worker.stdout.log"), "w");
  const stderr = await open(join(directory, "worker.stderr.log"), "w");
  let expired = false;
  let deadline;
  let termination;
  let protocolFailure;
  let activeStage;
  let stageTimer;
  const observedStages = [];
  const child = spawn(process.execPath, [join(ownDirectory, "worker.mjs"), String(size), directory,
    incremental ? "measurement" : "correctness", ...(compilerCandidate === undefined ? [] : [compilerCandidate])], {
    detached: process.platform !== "win32", stdio: ["ignore", stdout.fd, stderr.fd, "ipc"],
    env: { ...process.env, NODE_PATH: "", NODE_OPTIONS: "", NODE_TEST_CONTEXT: undefined },
  });
  const expire = (scope, stage, capMs, began) => {
    if (expired) { return; }
    expired = true;
    deadline = { scope, stage, capMs, wallMs: performance.now() - began };
    // Kill while the worker and synchronous wrapper still own their descendants.
    termination = terminateFamily(child);
  };
  const protocolError = message => {
    protocolFailure ??= message;
    termination ??= terminateFamily(child);
  };
  child.on("message", message => {
    if (expired || protocolFailure) { return; }
    if (message?.type === "stage-begin" && activeStage === undefined &&
        typeof message.stage === "string" && Object.hasOwn(stageCapsMs, message.kind)) {
      const capMs = stageCapsMs[message.kind];
      activeStage = { stage: message.stage, kind: message.kind, capMs, started: performance.now() };
      const armed = activeStage;
      stageTimer = setTimeout(() => expire("stage", armed.stage, capMs, armed.started), capMs);
      child.send({ type: "stage-armed", stage: armed.stage, capMs }, error => {
        if (error) { protocolError(`stage acknowledgement failed: ${error.message}`); }
      });
    } else if (message?.type === "stage-end" && activeStage !== undefined && activeStage.stage === message.stage) {
      clearTimeout(stageTimer);
      observedStages.push({ stage: activeStage.stage, kind: activeStage.kind, capMs: activeStage.capMs,
        wallMs: performance.now() - activeStage.started, status: "ended" });
      activeStage = undefined;
      child.send({ type: "stage-ended", stage: message.stage }, error => {
        if (error) { protocolError(`stage completion acknowledgement failed: ${error.message}`); }
      });
    } else {
      protocolError("invalid or out-of-order stage supervision message");
    }
  });
  const timer = setTimeout(() => expire("aggregate", activeStage?.stage, aggregateMs, started),
    Math.max(1, aggregateMs - (performance.now() - started)));
  let completion;
  let workerError;
  try {
    completion = await new Promise(resolve => {
      child.once("error", error => {
        workerError = { name: error.name, code: error.code ?? null, message: error.message };
        termination ??= terminateFamily(child);
      });
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
  } finally {
    clearTimeout(timer);
    clearTimeout(stageTimer);
    // Once exit is observed, its numeric PID is no longer authority for another tree kill.
    const cleanup = child.pid === undefined ? { method: "worker-not-started" }
      : child.exitCode === null && child.signalCode === null
        ? terminateFamily(child) : { method: "observed-worker-exit", treeKillAfterExit: false };
    termination ??= cleanup;
    await stdout.close();
    await stderr.close();
  }
  const supervision = { aggregateMs, stageCapsMs, wallMs: performance.now() - started, expired,
    deadline, protocolFailure, workerError, termination, observedStages, ...completion };
  await writeFile(join(directory, "supervision.json"), `${JSON.stringify(supervision, null, 2)}\n`);
  let report;
  try { report = JSON.parse(await readFile(join(directory, "report.json"), "utf8")); }
  catch { report = { status: "failed", failure: { message: "worker did not finish a report" } }; }
  report.supervision = supervision;
  if (workerError) {
    report.status = "failed";
    report.failure = workerError;
  }
  if (expired || protocolFailure || activeStage !== undefined) {
    report.status = "failed";
    report.failure = { message: expired ? `${deadline.scope} deadline reached${deadline.stage ? ` during ${deadline.stage}` : ""}`
      : protocolFailure ?? "worker exited while a stage was still armed" };
    const interrupted = report.stages?.find(stage => stage.stage === deadline?.stage && stage.status === "running");
    if (interrupted) {
      Object.assign(interrupted, { status: "failed", error: "ETIMEDOUT", wallMs: deadline.wallMs,
        wallTimeOwner: "external supervisor, including stage arm acknowledgement", termination: "owned process tree" });
    }
  }
  await writeFile(join(directory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  if (expired || protocolFailure || workerError || completion.code !== 0 || report.status !== "passed") {
    throw new Error(`fixture.growth.failed: retained ${directory}; ${report.failure?.message ?? "aggregate watchdog or worker exit"}`);
  }
  if (!retain) { await rm(directory, { recursive: true, force: true }); }
  return { directory: retain ? directory : undefined, ...report };
}

/** Callable G-01 entry for the existing Assembly test; one current compiler/run. */
export async function runGrowthCorrectness() {
  return measureGrowth({ size: 8, retain: false });
}
