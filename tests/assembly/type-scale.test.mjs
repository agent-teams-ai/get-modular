import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { testAssemblyTypes } from "../../architecture/tooling/test-assembly-types.mjs";
import { fragmentSource } from "./type-scale.mjs";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// ADR-0032: 500 handles bound by 20 team maps prepare under one Host interface map. Both compilers and
// both resolutions must accept them without TS2589. Time is reported, never asserted. The fixture checks
// the workspace build, so packed-root and its repeated runs stay free of it.
test("500 fragment handles prepare under one interface map on both compilers", { timeout: 600000 }, async (t) => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "get-modular-type-scale-")));
  try {
    await mkdir(join(directory, "node_modules/@get-modular"), { recursive: true });
    for (const name of ["core", "assembly"]) {
      await symlink(join(workspace, "packages", name), join(directory, "node_modules/@get-modular", name), "junction");
    }
    await writeFile(join(directory, "package.json"), JSON.stringify({ name: "type-scale", private: true, type: "module" }));
    await writeFile(join(directory, "fragment-scale.ts"), fragmentSource(500));
    const project = join(directory, "tsconfig.json");
    await writeFile(project, JSON.stringify({ compilerOptions: {
      target: "ES2022", lib: ["ES2023", "DOM"], strict: true, noEmit: true,
      skipLibCheck: false, types: [], isolatedDeclarations: false, erasableSyntaxOnly: false,
    }, files: ["fragment-scale.ts"] }));
    const started = performance.now();
    const observations = testAssemblyTypes({ directory, project });
    t.diagnostic(JSON.stringify({ handles: 500, observations, elapsedMs: Math.round(performance.now() - started) }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

// Type-check cost budget. TypeScript 7 counters depend on the number of checkers, so the build runs
// --singleThreaded; the counters are then deterministic. Instantiations and Types are gated at 500
// handles, other sizes and the check time are only printed. TypeScript 5.8.3 is not gated.
const budgetTolerance = 1.05;
const budgetFile = join(workspace, "tests/assembly/type-scale-budget.json");

function measure(directory, handles, compiler) {
  const result = spawnSync(process.execPath, [compiler, "--project", join(directory, "tsconfig.json"),
    "--module", "NodeNext", "--moduleResolution", "NodeNext", "--extendedDiagnostics", "--singleThreaded",
    "--pretty", "false"], {
    cwd: directory, encoding: "utf8", timeout: 180000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, NODE_PATH: "", NODE_OPTIONS: "" },
  });
  assert.equal(result.status, 0, `${handles} handles\n${result.stdout}\n${result.stderr}`);
  const read = (label) => {
    const match = new RegExp(`^${label}:\\s+([\\d.,]+)\\s*(\\S*)$`, "mu").exec(result.stdout);
    assert.ok(match, `tsc did not report ${label}\n${result.stdout}`);
    return match[1] + match[2];
  };
  return {
    instantiations: Number(read("Instantiations")),
    types: Number(read("Types")),
    checkTime: read("Check time"),
    memoryUsed: read("Memory used"),
  };
}

test("type-check cost at 500 handles stays within the recorded budget", { timeout: 600000 }, async (t) => {
  const require = createRequire(join(workspace, "package.json"));
  const manifestPath = require.resolve("typescript/package.json");
  const { version } = JSON.parse(await readFile(manifestPath, "utf8"));
  const compiler = join(dirname(manifestPath), "bin/tsc");
  const budget = JSON.parse(await readFile(budgetFile, "utf8"));
  const directory = await realpath(await mkdtemp(join(tmpdir(), "get-modular-type-budget-")));
  try {
    await mkdir(join(directory, "node_modules/@get-modular"), { recursive: true });
    for (const name of ["core", "assembly"]) {
      await symlink(join(workspace, "packages", name), join(directory, "node_modules/@get-modular", name), "junction");
    }
    await writeFile(join(directory, "package.json"), JSON.stringify({ name: "type-budget", private: true, type: "module" }));
    await writeFile(join(directory, "tsconfig.json"), JSON.stringify({ compilerOptions: {
      target: "ES2022", lib: ["ES2023", "DOM"], strict: true, noEmit: true,
      skipLibCheck: false, types: [], isolatedDeclarations: false, erasableSyntaxOnly: false,
    }, files: ["fragment-scale.ts"] }));
    const measured = {};
    for (const handles of [100, 200, 500, 1000]) {
      await writeFile(join(directory, "fragment-scale.ts"), fragmentSource(handles));
      measured[handles] = measure(directory, handles, compiler);
    }
    t.diagnostic(JSON.stringify({ compiler: version, measured }));
    const [major, minor] = version.split(".");
    assert.equal(`${major}.${minor}`, budget.compiler,
      `Compiler ${version} differs from the budget compiler ${budget.compiler}; measured rows to record: ${JSON.stringify(measured)}`);
    const gated = budget.gated?.[500];
    if (!gated) return;
    for (const metric of ["instantiations", "types"]) {
      const limit = Math.floor(gated[metric] * budgetTolerance);
      assert.ok(measured[500][metric] <= limit,
        `500 handles: ${metric} ${measured[500][metric]} exceeds budget ${gated[metric]} +5% (${limit})`);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
