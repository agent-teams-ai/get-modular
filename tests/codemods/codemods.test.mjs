import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Project } from "ts-morph";
import { testAssemblyTypes } from "../../architecture/tooling/test-assembly-types.mjs";
import factoryHandle from "../../architecture/tooling/codemods/0.2-0.3/factory-handle.mjs";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const runner = join(workspace, "architecture/tooling/codemods/run.mjs");
const fixtures = join(workspace, "tests/codemods/0.2-0.3");
const cases = readdirSync(fixtures).sort();
const read = (case_, name) => readFileSync(join(fixtures, case_, name), "utf8");

function apply(text) {
  const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
  const file = project.createSourceFile("input.ts", text);
  const findings = [];
  const edits = factoryHandle(file, (message) => findings.push(message));
  return { text: file.getFullText(), edits, findings };
}

for (const case_ of cases) {
  test(`0.2-0.3 ${case_}: output matches and a second run changes nothing`, () => {
    const result = apply(read(case_, "input.ts.txt"));
    assert.equal(result.text, read(case_, "output.ts.txt"));
    const manual = existsSync(join(fixtures, case_, "manual.txt")) ? read(case_, "manual.txt").trimEnd().split("\n") : [];
    assert.deepEqual(result.findings, manual);
    const again = apply(result.text);
    assert.equal(again.text, result.text);
    assert.equal(again.edits, 0);
  });
}

// The outputs compile against the workspace Assembly on both compilers. Each gets the names the fixtures leave free.
test("0.2-0.3 outputs type-check against the workspace Assembly", { timeout: 600000 }, () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "get-modular-codemod-types-")));
  try {
    mkdirSync(join(directory, "node_modules/@get-modular"), { recursive: true });
    for (const name of ["core", "assembly"]) {
      symlinkSync(join(workspace, "packages", name), join(directory, "node_modules/@get-modular", name), "junction");
    }
    writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "codemod-types", private: true, type: "module" }));
    const prelude = 'type HostCapabilities = Record<never, never>;\ntype Instance = unknown;\n'
      + 'declare const declaration: import("@get-modular/core").ModuleDeclaration;\n';
    const files = [];
    for (const case_ of cases.filter((name) => !["local-type", "other-package", "import-type", "reexport", "reexport-star"].includes(name))) {
      files.push(`${case_}.ts`);
      writeFileSync(join(directory, `${case_}.ts`), prelude + read(case_, "output.ts.txt"));
    }
    writeFileSync(join(directory, "tsconfig.json"), JSON.stringify({ compilerOptions: {
      target: "ES2022", lib: ["ES2023", "DOM"], strict: true, noEmit: true, skipLibCheck: false, types: [],
      isolatedDeclarations: false, erasableSyntaxOnly: false,
    }, files }));
    testAssemblyTypes({ directory, project: join(directory, "tsconfig.json") });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function run(...args) {
  return runIn({}, ...args);
}

function runIn({ cwd, initCwd }, ...args) {
  const { INIT_CWD: _inherited, ...env } = process.env;
  const result = spawnSync(process.execPath, [runner, ...args], {
    encoding: "utf8", cwd, env: initCwd === undefined ? env : { ...env, INIT_CWD: initCwd },
  });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

function git(directory, ...args) {
  // An empty hooks directory keeps machine-wide commit hooks out of the throwaway repository.
  const hooks = join(directory, "..", "no-hooks");
  mkdirSync(hooks, { recursive: true });
  const result = spawnSync("git", ["-c", `core.hooksPath=${hooks}`, "-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid",
    "-c", "commit.gpgsign=false", "-C", directory, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

function consumer(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "get-modular-codemod-run-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = join(root, "consumer");
  mkdirSync(join(directory, "src"), { recursive: true });
  mkdirSync(join(directory, "node_modules/dep"), { recursive: true });
  cpSync(join(fixtures, "plain/input.ts.txt"), join(directory, "src/index.ts"));
  cpSync(join(fixtures, "plain/input.ts.txt"), join(directory, "node_modules/dep/index.ts"));
  return directory;
}

test("runner: --dry is the default and leaves files unchanged, node_modules is skipped", (t) => {
  const directory = consumer(t);
  const before = readFileSync(join(directory, "src/index.ts"), "utf8");
  const result = run("0.2-0.3", directory);
  assert.equal(result.status, 0, result.err);
  assert.match(result.out, /src[\\/]index\.ts: 2 edits/u);
  assert.doesNotMatch(result.out, /node_modules/u);
  assert.equal(readFileSync(join(directory, "src/index.ts"), "utf8"), before);
});

test("runner: --check exits 1 while changes are pending and 0 after --write", (t) => {
  const directory = consumer(t);
  assert.equal(run("0.2-0.3", directory, "--check").status, 1);
  const written = run("0.2-0.3", directory, "--write", "--allow-dirty");
  assert.equal(written.status, 0, written.err);
  assert.match(written.out, /run your typecheck/u);
  assert.equal(readFileSync(join(directory, "src/index.ts"), "utf8"), read("plain", "output.ts.txt"));
  assert.equal(run("0.2-0.3", directory, "--check").status, 0);
});

test("runner: --write refuses a dirty tree and writes on a clean one", (t) => {
  const directory = consumer(t);
  const file = join(directory, "src/index.ts");
  const before = readFileSync(file, "utf8");
  git(directory, "init", "-q");
  const refused = run("0.2-0.3", directory, "--write");
  assert.equal(refused.status, 2);
  assert.match(refused.err, /refusing to write/u);
  assert.equal(readFileSync(file, "utf8"), before);
  writeFileSync(join(directory, ".gitignore"), "node_modules\n");
  git(directory, "add", ".");
  git(directory, "commit", "-q", "-m", "init");
  const written = run("0.2-0.3", directory, "--write");
  assert.equal(written.status, 0, written.err);
  assert.equal(readFileSync(file, "utf8"), read("plain", "output.ts.txt"));
});

test("runner: unknown codemod exits 2 with the known list; a file that does not parse is skipped and fails the run", (t) => {
  const directory = consumer(t);
  const unknown = run("9.9-9.10", directory);
  assert.equal(unknown.status, 2);
  assert.match(unknown.err, /known: 0\.2-0\.3/u);
  writeFileSync(join(directory, "src/broken.ts"), "export const = ;\n");
  const result = run("0.2-0.3", directory);
  assert.equal(result.status, 1);
  assert.match(result.err, /skipped, does not parse: src[\\/]broken\.ts/u);
  assert.match(result.out, /src[\\/]index\.ts: 2 edits/u);
});

test("runner: a relative target resolves against the invoking directory (INIT_CWD under pnpm --dir), never the checkout", (t) => {
  const directory = consumer(t);
  const parent = dirname(directory);
  // pnpm --dir <checkout> sets cwd to the checkout and INIT_CWD to the directory the command was typed in.
  const viaPnpm = runIn({ cwd: workspace, initCwd: parent }, "0.2-0.3", "consumer", "--check");
  assert.equal(viaPnpm.status, 1, viaPnpm.err);
  assert.match(viaPnpm.out, /src[\\/]index\.ts: 2 edits/u);
  const plain = runIn({ cwd: parent }, "0.2-0.3", "consumer", "--check");
  assert.equal(plain.status, 1, plain.err);
});

test("runner: refuses to run inside the Get Modular checkout", () => {
  const result = runIn({ cwd: workspace, initCwd: workspace }, "0.2-0.3", ".", "--check");
  assert.equal(result.status, 2);
  assert.match(result.err, /Get Modular checkout itself/u);
  assert.equal(runIn({ cwd: workspace }, "0.2-0.3", "tests", "--dry").status, 2);
});

test("runner: a symlink to the Get Modular checkout is refused too", (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "get-modular-codemod-link-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  symlinkSync(workspace, join(root, "checkout"), "junction");
  const result = runIn({ cwd: root }, "0.2-0.3", "checkout", "--check");
  assert.equal(result.status, 2);
  assert.match(result.err, /Get Modular checkout itself/u);
});

test("runner: tsx files are included", (t) => {
  const directory = consumer(t);
  cpSync(join(fixtures, "plain/input.ts.txt"), join(directory, "src/view.tsx"));
  assert.match(run("0.2-0.3", directory).out, /src[\\/]view\.tsx: 2 edits/u);
});
