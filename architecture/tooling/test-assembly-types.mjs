import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const assembly = join(workspace, "packages/assembly");
const require = createRequire(join(workspace, "package.json"));

function invoke(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd, encoding: "utf8", timeout: 180000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, NODE_PATH: "", NODE_OPTIONS: "" },
  });
  if (result.error) throw result.error;
  assert.equal(result.signal, null, `${command} terminated by ${result.signal}`);
  return result;
}
function passed(result, label) {
  assert.equal(result.status, 0, `${label}\n${result.stdout}\n${result.stderr}`);
}

/** Resolve the exact minimum/current compiler manifests; equal versions run once. */
export function supportedCompilers() {
  const { devDependencies } = require("./package.json");
  const minimum = ["typescript-consumer-minimum", "typescript-minimum"]
    .find((name) => Object.hasOwn(devDependencies, name));
  assert.ok(minimum, "The repository must declare its minimum consumer compiler alias");
  const compilers = [];
  for (const compilerName of ["typescript", minimum]) {
    const manifestPath = require.resolve(`${compilerName}/package.json`);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    assert.equal(manifest.name, "typescript");
    if (compilerName === minimum) assert.equal(manifest.version, "7.0.2");
    const version = manifest.version.split(".").map(Number);
    assert(version.length === 3 && version.every(Number.isSafeInteger)
      && (version[0] > 7 || version[0] === 7 && (version[1] > 0 || version[1] === 0 && version[2] >= 2)),
    `${compilerName} must meet the TypeScript 7.0.2 floor`);
    if (!compilers.some(compiler => compiler.version === manifest.version)) {
      compilers.push({ compilerName, version: manifest.version, path: join(dirname(manifestPath), "bin/tsc") });
    }
  }
  return compilers;
}

export function testTypeScriptProjects(projects) {
  assert(projects.length > 0 && projects.every(project => typeof project === "string"
    && project.endsWith(".json") && !project.startsWith("-")), "Explicit project files are required");
  for (const { path: compiler, version } of supportedCompilers()) {
    for (const project of projects) {
      passed(invoke(process.execPath, [compiler, "--project", resolve(project),
        "--noEmit", "--skipLibCheck", "false", "--pretty", "false"], workspace),
      `TypeScript ${version}: ${project}`);
    }
  }
}

export function testAssemblyTypes({
  directory = assembly,
  project = join(directory, "tsconfig.types.json"),
  runtimeProject,
  negativeProject,
} = {}) {
  const observations = [];
  for (const { compilerName, version, path: compiler } of supportedCompilers()) {
    for (const [module, resolution] of [["NodeNext", "NodeNext"], ["ESNext", "Bundler"]]) {
      const flags = ["--module", module, "--moduleResolution", resolution, "--skipLibCheck", "false",
        "--erasableSyntaxOnly", "false", "--isolatedDeclarations", "false", "--pretty", "false"];
      const label = `${compilerName}@${version} ${resolution}`;
      passed(invoke(process.execPath, [compiler, "--project", project, ...flags], directory), label);
      if (negativeProject) {
        const result = invoke(process.execPath, [compiler, "--project", negativeProject, ...flags], directory);
        assert.notEqual(result.status, 0, `${label}: closed imports unexpectedly compiled`);
        const diagnostics = [...`${result.stdout}\n${result.stderr}`.matchAll(/error TS(\d+):/gu)].map((match) => Number(match[1]));
        assert.deepEqual(diagnostics, Array(8).fill(2307), `${label}\n${result.stdout}\n${result.stderr}`);
      }
      if (runtimeProject) {
        const output = join(directory, "emitted", `${compilerName}-${resolution}`);
        passed(invoke(process.execPath, [compiler, "--project", runtimeProject, ...flags,
          "--noEmit", "false", "--declaration", "false", "--outDir", output], directory), label);
        passed(invoke(process.execPath, [join(output, "types-positive.js")], directory), label);
      }
      observations.push({ compilerName, version, resolution });
    }
  }
  return observations;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length === 2) testAssemblyTypes();
  else if (process.argv[2] === "--projects") testTypeScriptProjects(process.argv.slice(3));
  else throw new Error("assembly.types.unsupported-options");
}
