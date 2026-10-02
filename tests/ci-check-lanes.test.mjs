import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
const hosts = { ubuntu: "ubuntu-24.04", macos: "macos-15", windows: "windows-2025" };

// Independent oracle copied from check/precheck at 0a81957c, not from the matrix.
const baseline = [
  "runtime:preflight", "governance:check", "release-owned-files:check",
  "assembly:build", "lifecycle:check", "foundation:check", "sdk-growth:check",
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
  packaging: ["lifecycle:check", "foundation:check", "sdk-growth:check", "lint:typed"],
  governance: ["ownership:checkpoint:test", "governance:check", "release-owned-files:check", "governance:test"],
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
  assert.equal(manifest.scripts.precheck, "pnpm ownership:checkpoint:test", "precheck drift");
  assert.equal(manifest.scripts.check, baseline.map(script => `pnpm ${script}`).join(" && "), "check chain drift");
  assert.deepEqual(Object.values(primary).flat().sort(),
    ["ownership:checkpoint:test", ...baseline.filter(script => !["runtime:preflight", "assembly:build"].includes(script))].sort());
  for (const [host, os] of Object.entries(hosts)) {
    const job = laneJob(value, host);
    assert(job, `${host}: missing lane job`);
    assert.equal(job["runs-on"], os);
    assert.equal(job["timeout-minutes"], 15);
    assert.equal(job.strategy["fail-fast"], false);
    assert.equal(job.needs, undefined, "lane must have an independent checkout");
    assert.equal(job.if, undefined, "lane must not be skipped");
    assert.equal(job["continue-on-error"], undefined);
    assert.deepEqual(Object.keys(job.strategy.matrix), ["include"]);
    const rows = job.strategy.matrix.include;
    assert.deepEqual(rows.map(row => row.lane).sort(), Object.keys(primary).sort(), "lane inventory");
    assert.match(job.steps[0].uses, /^actions\/checkout@[a-f0-9]{40}$/u);
    assert.equal(job.steps[0].with["fetch-depth"], 0);
    assert.equal(job.steps[0].with["persist-credentials"], false);
    assert.equal(job.steps[3].run, "pnpm install --frozen-lockfile --ignore-scripts");
    for (const step of job.steps) {
      assert.equal(step.if, undefined, "lane step must not be skipped");
      assert.equal(step["continue-on-error"], undefined);
    }
    const execution = runner(job);
    assert.equal(execution.shell, "bash");
    assert.equal(execution.env.LANE_SCRIPTS, "${{ matrix.scripts }}");
    assert.equal(execution.env.FOUNDATION_PR_HEAD_REPOSITORY,
      "${{ github.event.pull_request.head.repo.full_name }}");
    const integrity = job.steps.at(-1);
    assert.equal(integrity.run, "node architecture/checks/tracked-workspace-integrity.mjs");
    assert.equal(integrity.env.EXPECTED_HEAD_SHA, "${{ github.sha }}");
    assert.equal(job.steps.indexOf(execution), job.steps.length - 2, "integrity must follow payload");
    for (const row of rows) {
      const scripts = scriptsOf(row);
      assert.equal(new Set(scripts).size, scripts.length, `${host}/${row.lane}: duplicate script`);
      assert(scripts.every(script =>
        [...baseline, "ownership:checkpoint:test", "lifecycle:build"].includes(script)), "unknown script");
      assert(scripts.every(script => typeof manifest.scripts[script] === "string"), "undefined script");
      // Shared preparation is repeated per checkout, not counted as extra obligations.
      const setup = ["runtime:preflight", "assembly:build"];
      // Packaging already builds lifecycle through its primary lifecycle:check.
      if (row.lane !== "packaging") setup.push("lifecycle:build");
      if (row.lane !== "governance") setup.push("governance:check");
      assert.deepEqual(scripts.filter(script => !setup.includes(script)),
        primary[row.lane], `${host}/${row.lane}: obligations`);
      const position = script => scripts.indexOf(script);
      assert(position("runtime:preflight") >= 0 && position("runtime:preflight") < position("governance:check"), "runtime prerequisite");
      assert(position("governance:check") < position("assembly:build"), "governance must precede builds");
      const lifecycle = position(row.lane === "packaging" ? "lifecycle:check" : "lifecycle:build");
      assert(position("assembly:build") >= 0 && lifecycle > position("assembly:build"), "build prerequisites");
      for (const script of baseline.slice(baseline.indexOf("lifecycle:check") + 1)) {
        if (scripts.includes(script)) assert(position(script) > lifecycle, `${script}: lifecycle prerequisite`);
      }
      if (row.lane === "governance") {
        assert.equal(position("ownership:checkpoint:test"), 0, "ownership precheck must run first");
        assert(position("release-owned-files:check") < position("assembly:build"), "release check ordering");
      }
    }
    const gate = aggregate(value, host);
    assert(gate, `${host}: missing aggregate`);
    assert.equal(gate.name, `check (${os})`, "required context");
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
    mutate(job => { job["continue-on-error"] = true; });
    mutate(job => { job.strategy["fail-fast"] = true; });
    mutate(job => { delete runner(job).env.FOUNDATION_PR_HEAD_REPOSITORY; });
    mutate(job => { job.steps.pop(); });
    mutate(job => { delete job.steps.at(-1).env.EXPECTED_HEAD_SHA; });
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

test("the actual lane shell runs in order and stops at the first failed script", async () => {
  await fixture(async cwd => {
    await writeFile(join(cwd, "pnpm"), [
      "#!/usr/bin/env bash",
      'printf "%s\\n" "$2" >> calls.txt',
      '[[ "$1" == "run" && "$2" != "$FAIL_SCRIPT" ]]',
      "",
    ].join("\n"), { mode: 0o755 });
    const job = laneJob(workflow, "ubuntu");
    for (const row of job.strategy.matrix.include) {
      const scripts = scriptsOf(row);
      for (const failure of [undefined, scripts[1], scripts.at(-2)]) {
        await rm(join(cwd, "calls.txt"), { force: true });
        const status = shell(runner(job).run, cwd, {
          PATH: `${cwd}${delimiter}${process.env.PATH}`, LANE_SCRIPTS: row.scripts, FAIL_SCRIPT: failure ?? "",
        });
        assert.equal(status, failure ? 1 : 0, `${row.lane}: failure propagation`);
        const calls = (await readFile(join(cwd, "calls.txt"), "utf8")).trim().split(/\r?\n/u);
        assert.deepEqual(calls, failure ? scripts.slice(0, scripts.indexOf(failure) + 1) : scripts);
      }
    }
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
