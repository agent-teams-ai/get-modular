import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { defects } from "./mutations/defects.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const semanticFiles = ["store", "subscriptions", "load", "guards", "testing-entry", "processes"]
  .map(name => `tests/${name}.test.mjs`);

async function copySubject(parent, name) {
  const directory = join(parent, name, "observation");
  await mkdir(directory, { recursive: true });
  for (const item of ["package.json", "dist", "tests"]) {
    await cp(join(packageRoot, item), join(directory, item), {
      recursive: true, filter: source => !source.includes(`${join("tests", "writer-tasks")}`),
    });
  }
  const modules = join(directory, "node_modules/@get-modular");
  await mkdir(modules, { recursive: true });
  await symlink(resolve(packageRoot, "../resources"), join(modules, "resources"), "junction");
  return directory;
}

function runProbes(cwd) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, ["--test", "--test-concurrency=1", "--test-reporter=tap", ...semanticFiles], {
      cwd, env: { ...process.env, NODE_OPTIONS: "" }, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let timedOut = false;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { output += chunk; });
    const deadline = setTimeout(() => { timedOut = true; child.kill(); }, 120_000);
    child.on("error", error => { clearTimeout(deadline); reject(error); });
    child.on("close", (status, signal) => { clearTimeout(deadline); resolveRun({ status, signal, output, timedOut }); });
  });
}

function detection(defect, result) {
  assert.doesNotMatch(result.output, /SyntaxError|ERR_MODULE_NOT_FOUND|ERR_PACKAGE_PATH_NOT_EXPORTED|Cannot find module/u,
    `broken mutation ${defect.id}: ${result.output}`);
  const failed = [...result.output.matchAll(/^\s*not ok \d+ - (T\d+[^\r\n]*)/gmu)].map(match => match[1]);
  if (result.timedOut) {
    assert.equal(defect.mayHang, true, `undesignated hang for ${defect.id}: ${result.output}`);
    return ["designated bounded semantic hang (120 s watchdog)"];
  }
  assert.equal(result.signal, null, `mutation process terminated: ${defect.id}: ${result.signal}`);
  assert.notEqual(result.status, 0, `NOT CAUGHT ${defect.id}`);
  assert.ok(failed.length > 0, `no attributed semantic failure for ${defect.id}: ${result.output}`);
  return [...new Set(failed)];
}

test("T107 all eighteen archived defects fail semantic probes in isolated patched builds", { timeout: 1_320_000 }, async context => {
  assert.equal(defects.length, 18);
  assert.equal(new Set(defects.map(defect => defect.id)).size, 18);
  const temporary = await mkdtemp(join(tmpdir(), "observation-mutations-"));
  try {
    const baseline = await runProbes(await copySubject(temporary, "baseline"));
    assert.equal(baseline.timedOut, false, baseline.output);
    assert.equal(baseline.status, 0, `unmodified mutation subject must pass: ${baseline.output}`);
    const queue = [...defects];
    const workers = Array.from({ length: Math.max(1, Math.min(2, availableParallelism() - 1)) }, async () => {
      while (queue.length > 0) {
        const defect = queue.shift();
        const directory = await copySubject(temporary, defect.id);
        const target = join(directory, "dist", defect.file);
        const original = await readFile(target, "utf8");
        assert.equal(original.split(defect.find).length - 1, 1, `mutation anchor ${defect.id} must occur exactly once`);
        await writeFile(target, original.replace(defect.find, defect.replace));
        const failures = detection(defect, await runProbes(directory));
        context.diagnostic(`${defect.id}: caught by ${failures.join("; ")}`);
      }
    });
    await Promise.all(workers);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
