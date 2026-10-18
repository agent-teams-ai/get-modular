import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);

/** Resolve only the committed aliases; inspecting a below-floor manifest never launches it. */
export async function supportedCompilers() {
  const versions = new Map();
  for (const name of ["typescript-minimum", "typescript"]) {
    const manifestPath = require.resolve(`${name}/package.json`);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(manifest.version);
    assert.ok(match, `${name} must be a pinned stable compiler: ${manifest.version}`);
    const [major, minor, patch] = match.slice(1).map(Number);
    assert.ok(major > 7 || (major === 7 && (minor > 0 || patch >= 2)),
      `${name} ${manifest.version} is below the authorized 7.0.2 floor; migrate the active pin first`);
    if (!versions.has(manifest.version)) versions.set(manifest.version, {
      version: manifest.version, path: join(dirname(manifestPath), "bin/tsc"),
    });
  }
  return [...versions.values()];
}

export const resolutions = ["NodeNext", "Bundler"];

export function parseDiagnostics(output, cwd) {
  const diagnostics = [];
  for (const line of output.split(/\r?\n/u)) {
    const located = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/u.exec(line);
    if (located) {
      diagnostics.push({ file: resolve(cwd, located[1]), line: Number(located[2]),
        column: Number(located[3]), code: located[4], message: located[5] });
    } else if (/error TS\d+:/u.test(line)) {
      diagnostics.push({ file: undefined, line: 0, code: /TS\d+/u.exec(line)[0], message: line });
    }
  }
  return diagnostics;
}

export function compile(compiler, cwd, project = "tsconfig.json") {
  const result = spawnSync(process.execPath, [compiler.path, "-p", project, "--pretty", "false"], {
    cwd, encoding: "utf8", timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, `compiler process failed: ${result.error?.message}`);
  assert.equal(result.signal, null, `compiler process terminated: ${result.signal}`);
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const diagnostics = parseDiagnostics(output, cwd);
  assert.ok(result.status === 0 || diagnostics.length > 0, `compiler failure without diagnostics: ${output}`);
  return { status: result.status, diagnostics, output };
}

export async function writeProject(directory, files, resolution, options = {}) {
  await writeFile(join(directory, "tsconfig.json"), JSON.stringify({ compilerOptions: {
    strict: true, exactOptionalPropertyTypes: true, noUncheckedIndexedAccess: true,
    noImplicitReturns: true, noImplicitOverride: true, noFallthroughCasesInSwitch: true,
    useUnknownInCatchVariables: true, verbatimModuleSyntax: true, isolatedModules: true,
    moduleDetection: "force", module: resolution === "NodeNext" ? "NodeNext" : "ESNext",
    moduleResolution: resolution, target: "ES2024", lib: ["ES2024", "ESNext.Disposable", "DOM"],
    types: [], skipLibCheck: false, noEmit: true, ...options,
  }, files }, null, 2) + "\n");
}
