import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";
import { parse } from "yaml";
import { validateFeatureModuleStandardProfile } from "../architecture/checks/feature-module-standard-profile.mjs";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const workflow = parse(await read(".github/workflows/ci.yml"));
const packageJson = JSON.parse(await read("package.json"));
const clone = value => JSON.parse(JSON.stringify(value));
const hosts = {
  ubuntu: "ubuntu-24.04",
  macos: "macos-15",
  windows: "windows-2025",
  "node26-ubuntu": "ubuntu-24.04",
  "node26-macos": "macos-15",
  "node26-windows": "windows-2025",
};

// Independent oracle retains every check/precheck obligation at 0a81957c
// and adds the explicit root peer and runtime policy gates. Never derive it
// from the matrix or the profile checker's command definitions.
const baseline = [
  "runtime:preflight", "lockfile:peers:check", "runtime:policy:typecheck",
  "runtime:policy:test", "governance:check", "release-owned-files:check",
  "assembly:build", "lifecycle:check", "resources:check", "conformance:check", "foundation:check", "sdk-growth:check",
  "lint:typed", "docs:protocol:check", "architecture:feature-module-profile",
  "architecture:feature-module-profile:test", "core:typecheck:prepared", "core:test",
  "assembly:typecheck", "assembly:test", "contracts:check", "contracts:test",
  "qualification:resource-profile", "qualification:v1-diagnostics-protocol",
  "qualification:v1-graph-semantics", "qualification:self-composition-templates",
  "governance:test",
];
const primary = {
  core: ["core:typecheck:prepared", "core:test"],
  assembly: ["assembly:typecheck", "assembly:test"],
  packaging: ["lifecycle:check", "resources:check", "conformance:check", "foundation:check", "sdk-growth:check", "lint:typed"],
  governance: [
    "ownership:checkpoint:test", "runtime:policy:typecheck", "runtime:policy:test",
    "governance:check", "release-owned-files:check", "governance:test",
  ],
  static: [
    "docs:protocol:check", "architecture:feature-module-profile",
    "architecture:feature-module-profile:test", "contracts:check", "contracts:test",
    "qualification:resource-profile", "qualification:v1-diagnostics-protocol",
    "qualification:v1-graph-semantics", "qualification:self-composition-templates",
  ],
};
const scriptsOf = row => row.scripts.trim().split(/\s+/u);
const laneJob = (value, host) => value.jobs[`lanes-${host}`];
const aggregate = (value, host) => value.jobs[`check-${host}`];
const runner = job => job.steps.find(step => step.env?.LANE_SCRIPTS);

function validateLanes(value, manifest = packageJson) {
  assert.equal(value.defaults?.run?.shell, undefined, "payload needs the platform default shell");
  assert.equal(manifest.scripts.precheck, "pnpm ownership:checkpoint:test", "precheck drift");
  assert.equal(manifest.scripts.check, baseline.map(script => `pnpm ${script}`).join(" && "), "check chain drift");
  assert.equal(manifest.scripts["runtime:preflight"],
    "node architecture/checks/node-version.mjs", "dependency-free preflight drift");
  assert.equal(manifest.scripts["precheck:changed"], "pnpm runtime:preflight", "changed precheck drift");
  assert.equal(manifest.scripts["lockfile:peers:check"], "pnpm peers check --lockfile-only", "peer gate drift");
  assert.equal(manifest.scripts["runtime:policy:typecheck"],
    "node node_modules/typescript/bin/tsc -p tests/tsconfig.tooling-node-policy.json --noEmit", "policy compiler drift");
  assert.equal(manifest.scripts["runtime:policy:test"],
    "node --test tests/tooling-node-policy.test.mts", "policy test drift");
  // Every independent checkout validates peers before its lane payload.
  assert.deepEqual([...Object.values(primary).flat(), "lockfile:peers:check"].sort(),
    ["ownership:checkpoint:test", ...baseline.filter(script => !["runtime:preflight", "assembly:build"].includes(script))].sort());
  for (const [host, os] of Object.entries(hosts)) {
    const node26 = host.startsWith("node26-");
    const job = laneJob(value, host);
    assert(job, `${host}: missing lane job`);
    assert.equal(job.name, `check lane (${os}, `
      + (node26 ? "Node 26, " : "") + "${{ matrix.lane }})");
    assert.deepEqual(job.env, node26 ? { ROOT_CI_NODE_VERSION: "26.10.0" } : undefined,
      "default runtime or candidate selection drift");
    assert.equal(job["runs-on"], os);
    assert.equal(job["timeout-minutes"], 15);
    assert.equal(job.strategy["fail-fast"], false);
    assert.equal(job.needs, undefined, "lane must have an independent checkout");
    assert.equal(job.if, undefined, "lane must not be skipped");
    assert.equal(job["continue-on-error"], undefined);
    assert.equal(job.defaults?.run?.shell, undefined, "payload needs the platform default shell");
    assert.deepEqual(Object.keys(job.strategy.matrix), ["include"]);
    const rows = job.strategy.matrix.include;
    assert.deepEqual(rows.map(row => row.lane).sort(), Object.keys(primary).sort(), "lane inventory");
    assert.match(job.steps[0].uses, /^actions\/checkout@[a-f0-9]{40}$/u);
    assert.equal(job.steps[0].with["fetch-depth"], 0);
    assert.equal(job.steps[0].with["persist-credentials"], false);
    assert.deepEqual(job.steps[2].with, {
      "node-version": "${{ env.ROOT_CI_NODE_VERSION }}",
      "node-version-file": ".node-version",
      cache: "pnpm",
    }, "runtime selection must retain the Node 24 default and explicit Node 26 override");
    assert.equal(job.steps.length, 8, "checkout, provisioning, install, peers, payload, integrity and failure evidence");
    assert.equal(job.steps[3].run,
      "pnpm install --frozen-lockfile --ignore-scripts --engine-strict --strict-peer-dependencies");
    assert.equal(job.steps[4].run, "pnpm lockfile:peers:check",
      "committed peer validation must follow frozen installation");
    for (const step of job.steps.slice(0, -1)) {
      assert.equal(step.if, undefined, "lane step must not be skipped");
      assert.equal(step["continue-on-error"], undefined);
    }
    const execution = runner(job);
    assert.equal(execution.shell, undefined, "payload needs the platform default shell");
    assert.equal(execution.env.LANE_SCRIPTS, "${{ matrix.scripts }}");
    assert.equal(execution.env.FOUNDATION_PR_HEAD_REPOSITORY,
      "${{ github.event.pull_request.head.repo.full_name }}");
    assert.equal(execution.env.SDK_GROWTH_FAILURE_ARTIFACT, "${{ runner.temp }}/sdk-growth-failure.json");
    assert.equal(execution.env.SDK_GROWTH_CHECKOUT_SHA, "${{ github.sha }}");
    const upload = job.steps.at(-1);
    assert.equal(upload.if, "failure() && matrix.lane == 'packaging'");
    assert.equal(upload.uses, "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a");
    assert.equal(upload["continue-on-error"], undefined);
    assert.deepEqual(upload.with, {
      name: "sdk-growth-${{ runner.os }}-${{ env.ROOT_CI_NODE_VERSION || '24.21.0' }}-${{ github.run_id }}-${{ github.run_attempt }}",
      path: "${{ runner.temp }}/sdk-growth-failure.json", "if-no-files-found": "ignore",
    });
    const integrity = job.steps.at(-2);
    assert.equal(integrity.run, "node architecture/checks/tracked-workspace-integrity.mjs");
    assert.equal(integrity.env.EXPECTED_HEAD_SHA, "${{ github.sha }}");
    assert.equal(job.steps.indexOf(execution), job.steps.length - 3, "integrity must follow payload");
    for (const row of rows) {
      const scripts = scriptsOf(row);
      assert.equal(new Set(scripts).size, scripts.length, `${host}/${row.lane}: duplicate script`);
      assert(scripts.every(script =>
        [...baseline, "ownership:checkpoint:test", "lifecycle:build", "resources:build", "conformance:build"].includes(script)), "unknown script");
      assert(scripts.every(script => typeof manifest.scripts[script] === "string"), "undefined script");
      // Shared preparation is repeated per checkout, not counted as extra obligations.
      const setup = ["runtime:preflight", "assembly:build"];
      // Packaging already builds every leaf package through its primary leaf checks.
      if (row.lane !== "packaging") setup.push("lifecycle:build", "resources:build", "conformance:build");
      if (row.lane !== "governance") setup.push("governance:check");
      assert.deepEqual(scripts.filter(script => !setup.includes(script)),
        primary[row.lane], `${host}/${row.lane}: obligations`);
      const position = script => scripts.indexOf(script);
      assert.equal(position("runtime:preflight"), row.lane === "governance" ? 1 : 0,
        "runtime preflight must precede installed lane gates after any ownership checkpoint");
      assert(position("runtime:preflight") >= 0 && position("runtime:preflight") < position("governance:check"), "runtime prerequisite");
      assert(position("governance:check") < position("assembly:build"), "governance must precede builds");
      const lifecycle = position(row.lane === "packaging" ? "lifecycle:check" : "lifecycle:build");
      assert(position("assembly:build") >= 0 && lifecycle > position("assembly:build"), "build prerequisites");
      if (row.lane !== "packaging") {
        assert.equal(position("resources:build"), lifecycle + 1, "resources build follows lifecycle build");
        assert.equal(position("conformance:build"), lifecycle + 2, "conformance build follows resources build");
      }
      for (const script of baseline.slice(baseline.indexOf("lifecycle:check") + 1)) {
        if (scripts.includes(script)) assert(position(script) > lifecycle, `${script}: lifecycle prerequisite`);
      }
      if (row.lane === "governance") {
        assert.equal(position("ownership:checkpoint:test"), 0, "ownership precheck must run first");
        assert.equal(position("runtime:policy:typecheck"), position("runtime:preflight") + 1,
          "strict policy typecheck must follow pure preflight");
        assert.equal(position("runtime:policy:test"), position("runtime:policy:typecheck") + 1,
          "policy tests must follow their compiler gate");
        assert.equal(position("governance:check"), position("runtime:policy:test") + 1,
          "policy gates must precede governance preparation");
        assert(position("release-owned-files:check") < position("assembly:build"), "release check ordering");
      }
    }
    const gate = aggregate(value, host);
    assert(gate, `${host}: missing aggregate`);
    assert.equal(gate.name, node26 ? `check (${os}, Node 26)` : `check (${os})`, "required context");
    assert.equal(gate["runs-on"], os);
    assert.deepEqual(gate.needs, [`lanes-${host}`], "aggregate dependency omission");
    assert.equal(gate.if, "always()", "aggregate must run after failures/skips");
    assert.equal(gate["continue-on-error"], undefined);
    assert.equal(gate.steps.length, 1);
    assert.equal(gate.steps[0].shell, "bash");
    assert.equal(gate.steps[0].env.NEEDS_JSON, "${{ toJSON(needs) }}");
    assert.equal(gate.steps[0].if, undefined);
    assert.equal(gate.steps[0]["continue-on-error"], undefined);
  }
}

async function fixture(run) {
  const cwd = await mkdtemp(join(tmpdir(), "get-modular-ci-TEST-"));
  try { await run(cwd); } finally { await rm(cwd, { recursive: true, force: true }); }
}

function shell(command, cwd, environment) {
  const bash = process.platform === "win32"
    ? join(process.env.ProgramFiles, "Git", "bin", "bash.exe") : "bash";
  const result = spawnSync(bash, ["--noprofile", "--norc", "-e", "-c", command], {
    cwd, encoding: "utf8", timeout: 15_000,
    env: { ...process.env, ...environment },
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  return result.status;
}

function lane(step, cwd, environment) {
  const [command, ...args] = step.run.trim().split(/\s+/u);
  assert.equal(command, "node");
  const result = spawnSync(process.execPath, args, {
    cwd, encoding: "utf8", timeout: 15_000,
    env: { ...process.env, ...environment },
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  return result.status;
}

async function prepareLane(cwd) {
  await writeFile(join(cwd, "package.json"),
    JSON.stringify({ private: true, type: "commonjs" }) + "\n");
  await mkdir(join(cwd, "architecture", "tooling"), { recursive: true });
  await copyFile(new URL("architecture/tooling/run-ci-check-lane.mjs", root),
    join(cwd, "architecture", "tooling", "run-ci-check-lane.mjs"));
  const fake = [
    'const { appendFileSync } = require("node:fs");',
    'appendFileSync("calls.txt", JSON.stringify(process.argv.slice(2)) + "\\n");',
    'if (process.env.FAIL_SIGNAL) process.kill(process.pid, "SIGTERM");',
    'process.exit(process.argv[3] === process.env.FAIL_SCRIPT ? 37 : 0);',
    "",
  ].join("\n");
  await writeFile(join(cwd, "pnpm.cjs"), fake);
  await writeFile(join(cwd, process.platform === "win32" ? "pnpm.cmd" : "pnpm"),
    process.platform === "win32"
      ? `@"${process.execPath}" "%~dp0pnpm.cjs" %*\r\n@exit /b %errorlevel%\r\n`
      : `#!/usr/bin/env node\n${fake}`, { mode: 0o755 });
}

function assertAggregate(step, cwd, dependency) {
  assert.equal(shell(step.run, cwd, { NEEDS_JSON: JSON.stringify({ [dependency]: { result: "success" } }) }), 0);
  for (const result of ["failure", "cancelled", "skipped", "unknown", null]) {
    assert.notEqual(shell(step.run, cwd, { NEEDS_JSON: JSON.stringify({ [dependency]: { result } }) }), 0, `must reject ${result}`);
  }
  for (const needs of [{}, { [dependency]: {} }, { [dependency]: { result: "success" }, extra: { result: "skipped" } }]) {
    assert.notEqual(shell(step.run, cwd, { NEEDS_JSON: JSON.stringify(needs) }), 0, "must reject incomplete/mixed needs");
  }
  assert.notEqual(shell(step.run, cwd, { NEEDS_JSON: "invalid JSON" }), 0);
}

test("every OS executes the independent baseline obligations with their prerequisites", () => validateLanes(workflow));

test("rejects missing, duplicate, unknown and reordered obligations on any OS", () => {
  for (const host of Object.keys(hosts)) {
    const mutate = change => {
      const value = clone(workflow);
      change(laneJob(value, host));
      assert.throws(() => validateLanes(value));
    };
    for (const row of laneJob(workflow, host).strategy.matrix.include) {
      for (const script of scriptsOf(row)) {
        mutate(job => {
          const candidate = job.strategy.matrix.include.find(item => item.lane === row.lane);
          candidate.scripts = scriptsOf(row).filter(item => item !== script).join(" ");
        });
      }
    }
    mutate(job => { job.strategy.matrix.include[0].scripts += " core:test"; });
    mutate(job => { job.strategy.matrix.include[0].scripts += " unknown:check"; });
    mutate(job => { job.strategy.matrix.include.pop(); });
    mutate(job => { job.strategy.matrix.include.push(clone(job.strategy.matrix.include[0])); });
    mutate(job => { job.strategy.matrix.include[0].lane = "unknown"; });
    mutate(job => {
      job.strategy.matrix.include[0].scripts = job.strategy.matrix.include[0].scripts
        .replace("governance:check assembly:build", "assembly:build governance:check");
    });
    mutate(job => { job.steps[4].if = "false"; });
    mutate(job => { job.steps[3].run = "pnpm install --frozen-lockfile --ignore-scripts"; });
    mutate(job => { job.steps[4].run = "pnpm peers check"; });
    mutate(job => { job.steps.splice(4, 1); });
    mutate(job => { job.env = { ROOT_CI_NODE_VERSION: "26.9.9" }; });
    mutate(job => { job.steps[2].with["node-version"] = "26.9.9"; });
    mutate(job => { delete job.steps[2].with["node-version-file"]; });
    mutate(job => {
      const row = job.strategy.matrix.include.find(item => item.lane === "governance");
      row.scripts = row.scripts.replace(
        "runtime:policy:typecheck runtime:policy:test",
        "runtime:policy:test runtime:policy:typecheck",
      );
    });
    mutate(job => {
      const row = job.strategy.matrix.include.find(item => item.lane === "governance");
      row.scripts = row.scripts.replace(
        "runtime:preflight runtime:policy:typecheck",
        "runtime:policy:typecheck runtime:preflight",
      );
    });
    mutate(job => { job["continue-on-error"] = true; });
    mutate(job => { job.strategy["fail-fast"] = true; });
    mutate(job => { runner(job).shell = "bash"; });
    mutate(job => { job.defaults = { run: { shell: "bash" } }; });
    mutate(job => { delete runner(job).env.FOUNDATION_PR_HEAD_REPOSITORY; });
    mutate(job => { job.steps.pop(); });
    mutate(job => { delete job.steps.at(-2).env.EXPECTED_HEAD_SHA; });
    // Regression: broad upload paths or conditions would retain unrelated packaging data.
    mutate(job => { job.steps.at(-1).with.path = "${{ runner.temp }}/**"; });
    mutate(job => { job.steps.at(-1).if = "failure()"; });
    mutate(job => { job.steps.at(-1).with.name = "sdk-growth"; });
    mutate(job => { job.steps.at(-1).uses = "actions/upload-artifact@v7"; });
    mutate(job => { delete runner(job).env.SDK_GROWTH_FAILURE_ARTIFACT; });
    mutate(job => { delete runner(job).env.SDK_GROWTH_CHECKOUT_SHA; });
  }
  const drift = clone(packageJson);
  drift.scripts.check += " && pnpm new:check";
  assert.throws(() => validateLanes(workflow, drift), /check chain drift/u);
});

test("rejects an unexpected packaging build before governance", () => {
  for (const host of Object.keys(hosts)) {
    const value = clone(workflow);
    const row = laneJob(value, host).strategy.matrix.include
      .find(item => item.lane === "packaging");
    row.scripts = `lifecycle:build ${row.scripts}`;
    assert.throws(() => validateLanes(value), /obligations/u);
  }
});

test("rejects an omitted dependency, skipped aggregate or renamed required context", () => {
  for (const host of Object.keys(hosts)) {
    for (const change of [
      gate => { gate.needs = []; },
      gate => { gate.needs = ["lanes-ubuntu", "lanes-macos"]; },
      gate => { gate.if = "success()"; },
      gate => { gate.name = "other"; },
      gate => { gate.steps[0].if = "false"; },
    ]) {
      const value = clone(workflow);
      change(aggregate(value, host));
      assert.throws(() => validateLanes(value));
    }
  }
});

test("the actual aggregate shell fails closed for failure, cancellation, skips and empty needs", async () => {
  await fixture(async cwd => {
    for (const host of Object.keys(hosts)) assertAggregate(aggregate(workflow, host).steps[0], cwd, `lanes-${host}`);
    // Demonstrates rejection of the credible regression: treating skipped as green.
    const permissive = {
      run: aggregate(workflow, "ubuntu").steps[0].run
        .replace('== "success"', '== "success" or .value.result == "skipped"'),
    };
    assert.throws(() => assertAggregate(permissive, cwd, "lanes-ubuntu"), /must reject skipped/u);
  });
});

// The prior Bash payload changed Windows tar selection, coerced child exits to 1,
// and accepted empty lanes. Native .cmd fixtures and these boundaries catch that regression.
test("the actual native lane runner passes argv in order and preserves the first failed exit", async () => {
  await fixture(async cwd => {
    await prepareLane(cwd);
    const host = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "ubuntu";
    const job = laneJob(workflow, host);
    for (const row of job.strategy.matrix.include) {
      const scripts = scriptsOf(row);
      for (const failure of [undefined, scripts[1], scripts.at(-2)]) {
        await rm(join(cwd, "calls.txt"), { force: true });
        const status = lane(runner(job), cwd, {
          PATH: `${cwd}${delimiter}${process.env.PATH}`, LANE_SCRIPTS: row.scripts, FAIL_SCRIPT: failure ?? "",
        });
        assert.equal(status, failure ? 37 : 0, `${row.lane}: failure propagation`);
        const calls = (await readFile(join(cwd, "calls.txt"), "utf8")).trim().split(/\r?\n/u).map(line => JSON.parse(line));
        const expected = failure ? scripts.slice(0, scripts.indexOf(failure) + 1) : scripts;
        assert.deepEqual(calls, expected.map(script => ["run", script]));
      }
    }
  });
});

test("the native lane rejects empty or unsafe input before invoking any script", async () => {
  await fixture(async cwd => {
    await prepareLane(cwd);
    const step = runner(laneJob(workflow, "ubuntu"));
    for (const scripts of [undefined, "", " \n\t ", "safe bad&name", "safe bad;name",
      "safe bad|name", "safe %PATH%", "safe !PATH!", "safe $(node)", 'safe "quoted"', "safe ../path", "-flag"]) {
      assert.notEqual(lane(step, cwd, {
        PATH: `${cwd}${delimiter}${process.env.PATH}`, LANE_SCRIPTS: scripts,
      }), 0);
      await assert.rejects(readFile(join(cwd, "calls.txt")), { code: "ENOENT" });
    }
  });
});

test("the native lane fails for a terminated child or unavailable native tool", async () => {
  await fixture(async cwd => {
    await prepareLane(cwd);
    const step = runner(laneJob(workflow, "ubuntu"));
    const env = { PATH: `${cwd}${delimiter}${process.env.PATH}`, LANE_SCRIPTS: "first later" };
    assert.notEqual(lane(step, cwd, { ...env, FAIL_SIGNAL: "1" }), 0);
    assert.deepEqual((await readFile(join(cwd, "calls.txt"), "utf8")).trim().split(/\r?\n/u).map(line => JSON.parse(line)),
      [["run", "first"]]);
    await rm(join(cwd, "pnpm"), { force: true });
    await rm(join(cwd, "pnpm.cmd"), { force: true });
    assert.notEqual(lane(step, cwd, { ...env, PATH: cwd }), 0);
  });
});

test("the feature profile rejects removing parity tests from the complete gate", async () => {
  const inputs = {
    profile: JSON.parse(await read("architecture/feature-module-standard-profile.json")),
    document: await read("docs/architecture/feature-module-standard.md"),
    docsIndex: await read("docs/README.md"), agentInstructions: await read("AGENTS.md"), packageJson,
  };
  assert.doesNotThrow(() => validateFeatureModuleStandardProfile(inputs));
  const omitted = clone(packageJson);
  omitted.scripts["governance:test"] = omitted.scripts["governance:test"].replace(" tests/ci-check-lanes.test.mjs", "");
  assert.throws(() => validateFeatureModuleStandardProfile({ ...inputs, packageJson: omitted }), /governance:test/u);
});
