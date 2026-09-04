import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const lab = "tests/qualification/implementation-readiness/api-authoring/common";
export const configuration = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "architecture/contracts/v1/composition.schema.json", "architecture/contracts/v1/diagnostic-catalog.json"];
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (root, ...args) => execFileSync("git", args, { cwd: root });
const relevant = (path) => configuration.includes(path) || (path.startsWith(`${lab}/`) && /\.(ts|mjs|json)$/.test(path) && !path.includes("/dist/"));

export function inputSnapshot(root, commit) {
  assert.match(commit, /^[0-9a-f]{40}$/);
  const paths = git(root, "ls-tree", "-r", "--name-only", "-z", commit).toString().split("\0").filter(relevant).sort();
  for (const path of configuration) assert(paths.includes(path), `missing configuration: ${path}`);
  assert(paths.includes(`${lab}/run.mjs`), "missing runner");
  const onDisk = [];
  const visit = (directory) => {
    for (const item of readdirSync(join(root, directory), { withFileTypes: true })) {
      const path = `${directory}/${item.name}`;
      if (path === `${lab}/dist`) continue;
      if (item.isDirectory()) visit(path);
      else if (relevant(path)) onDisk.push(path);
    }
  };
  visit(lab);
  assert.deepEqual(onDisk.sort(), paths.filter((path) => path.startsWith(`${lab}/`)), "lab input set differs from committed source");
  const untracked = git(root, "ls-files", "--others", "--exclude-standard", "-z", "--", lab).toString().split("\0").filter(relevant);
  assert.deepEqual(untracked, [], "untracked executable lab input");
  return Object.fromEntries(paths.map((path) => {
    const digest = sha256(git(root, "show", `${commit}:${path}`));
    assert.equal(sha256(readFileSync(join(root, path))), digest, `source drift: ${path}`);
    return [path, digest];
  }));
}

export function verifyCapture(root, envelope, resultBytes) {
  assert.equal(envelope.kind, "api-authoring-execution");
  assert.equal(envelope.status, "pass");
  assert.deepEqual(inputSnapshot(root, envelope.sourceCommit), envelope.inputs, "input manifest mismatch");
  const current = git(root, "rev-parse", "HEAD").toString().trim();
  assert.deepEqual(inputSnapshot(root, current), envelope.inputs, "current input set differs");
  assert.equal(sha256(resultBytes), envelope.resultSha256, "result digest mismatch");
  assert.equal(envelope.commands.length, 1);
  assert.deepEqual(envelope.commands[0].args, [`${lab}/run.mjs`]);
  assert.equal(envelope.commands[0].exitCode, 0);
  const result = JSON.parse(resultBytes);
  assert.equal(result.status, "pass");
  assert.equal(result.executionCount, 90);
  assert.equal(result.scenarioCount, 30);
  assert.deepEqual(result.emittedDeclarations, envelope.emittedDeclarations);
  assert(Object.keys(result.emittedDeclarations).length > 0);
}

function treeIdentity(root) {
  const entries = [];
  function visit(relative) {
    for (const item of readdirSync(join(root, relative), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
      const path = relative ? `${relative}/${item.name}` : item.name;
      if (item.isDirectory()) visit(path);
      else { assert(item.isFile(), `non-file toolchain entry: ${path}`); entries.push([path, sha256(readFileSync(join(root, path)))]); }
    }
  }
  visit("");
  return { files: entries.length, sha256: sha256(JSON.stringify(entries)) };
}

function toolchain(root) {
  const typescript = realpathSync(join(root, "node_modules/typescript"));
  const pkg = JSON.parse(readFileSync(join(typescript, "package.json")));
  const require = createRequire(join(typescript, "package.json"));
  const platformPackage = dirname(require.resolve(`@typescript/typescript-${process.platform}-${process.arch}/package.json`));
  return {
    node: { version: process.version, executableSha256: sha256(readFileSync(process.execPath)) },
    typescript: { version: pkg.version, packageTree: treeIdentity(typescript), platformPackageTree: treeIdentity(platformPackage) },
    platform: process.platform, architecture: process.arch,
  };
}

function capture(root, output) {
  const sourceCommit = git(root, "rev-parse", "HEAD").toString().trim();
  const inputs = inputSnapshot(root, sourceCommit);
  const tools = toolchain(root);
  const startedAt = new Date().toISOString();
  const args = [`${lab}/run.mjs`];
  const command = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  assert.equal(command.status, 0, command.stderr || command.error?.message || "lab command failed");
  const resultBytes = readFileSync(join(root, lab, "dist/result-summary.json"));
  assert.deepEqual(inputSnapshot(root, sourceCommit), inputs, "inputs changed during run");
  assert.deepEqual(toolchain(root), tools, "toolchain changed during run");
  const result = JSON.parse(resultBytes);
  const envelope = {
    kind: "api-authoring-execution", status: "pass", sourceCommit, inputs, toolchain: tools,
    startedAt, finishedAt: new Date().toISOString(),
    commands: [{ executable: "recorded Node executable", args, exitCode: command.status }],
    resultSha256: sha256(resultBytes), emittedDeclarations: result.emittedDeclarations,
    scope: "Coordinator observation, not a signed attestation or proof of accepted-contract conformance. Timings are machine-specific. Toolchain hashes describe the capture machine, not a cross-platform verifier requirement.",
  };
  verifyCapture(root, envelope, resultBytes);
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, "api-authoring-exact-run.json"), resultBytes, { flag: "wx" });
  writeFileSync(join(output, "api-authoring-execution.json"), `${JSON.stringify(envelope, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ sourceCommit, resultSha256: envelope.resultSha256, output }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode, first, second] = process.argv.slice(2);
  if (mode === "--capture" && first && !second) capture(process.cwd(), resolve(first));
  else if (mode === "--verify" && first && second) {
    verifyCapture(process.cwd(), JSON.parse(readFileSync(first)), readFileSync(second));
    console.log("api-authoring execution inputs and retained result match");
  } else throw new Error("usage: execution-capture.mjs --capture <new output dir> | --verify <envelope> <result>");
}
