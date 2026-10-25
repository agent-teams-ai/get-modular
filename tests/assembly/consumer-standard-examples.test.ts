import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { supportedCompilers, testAssemblyTypes } from "../../architecture/tooling/test-assembly-types.mjs";
import { resourceLifetimeSource } from "./resource-lifetime-source.ts";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const standard = await readFile(join(workspace, "docs/architecture/common-assembly.md"), "utf8");
const guide = await readFile(join(workspace, "docs/guides/module-authoring.md"), "utf8");

// The names the examples assume a consumer already has.
const placeholders: Readonly<Partial<Record<string, string>>> = {
  host: `type DbPort = { readonly query: (q: string) => number };
type OrdersPort = { readonly list: () => number };
type Connection = { readonly close: () => Promise<void> };
declare const url: string;
declare function connect(url: string, options: { readonly signal: AbortSignal }): Promise<Connection>;
declare function createOrdersPort(db: DbPort, conn: Connection): OrdersPort;
declare class ConstructionFailed extends Error { constructor(...details: readonly unknown[]); }
`,
  instances: `import type { CloseReport, ScopeControl } from "@get-modular/resources";
type ChatPort = { readonly send: (text: string) => Promise<void> };
type Lease = { readonly release: () => Promise<void> };
declare function acquireLease(sessionId: string): Promise<Lease>;
declare function createChatPort(lease: Lease): ChatPort;
declare class ConstructionFailed extends Error { constructor(...details: readonly unknown[]); }
declare function closeWithin(control: ScopeControl, graceMs: number, abandonMs: number): Promise<CloseReport>;
`,
};

// Every fenced `ts` block after a marker, up to the next marker or heading, belongs to the example. Markers
// with one name may repeat; their blocks add up to one project. A block whose first line is `// <path>/<file>.ts`
// is written to that path, any other single block to `<name>.ts`.
const markers = /<!-- (?:consumer-standard-example|module-authoring-example): [\w-]+ -->|\n#{1,6} /gu;

function exampleFiles(markdown: string, kind: string, name: string): Map<string, string> {
  const marker = `<!-- ${kind}: ${name} -->`;
  const files = new Map<string, string>();
  let from = markdown.indexOf(marker);
  assert.notEqual(from, -1, `${kind} must carry ${marker}`);
  for (; from !== -1; from = markdown.indexOf(marker, from + marker.length)) {
    markers.lastIndex = from + marker.length;
    const end = markers.exec(markdown)?.index ?? markdown.length;
    for (const [, body] of markdown.slice(from + marker.length, end).matchAll(/```ts\n([\s\S]*?)\n```/gu)) {
      assert.ok(body !== undefined);
      const path = body.match(/^\/\/ ([\w./-]+\/[\w.-]+\.ts)\n/u)?.[1] ?? `${name}.ts`;
      assert.ok(!files.has(path), `${marker} writes ${path} twice`);
      files.set(path, body);
    }
  }
  assert.ok(files.size > 0, `no ts block follows ${marker}`);
  return files;
}

const standardExamples = ["host", "instances", "template"];
const guideExamples = ["project", "resources", "bind", "inputs", "communication"];
// A successful child exit alone is insufficient: Node can skip recursive test execution.
const resourceCases = [
  "identical occurrences are delivered and closing one subscriber preserves its sibling",
  "closing during synchronous subscribe still owns the returned disposer",
  "failed unsubscribe remains debt and the closed listener performs no later work",
  "construction cancellation before subscription prevents its acquisition",
  "a failed subscribe rolls back its own attachment and the module releases its client",
];
const roots: string[] = [];
after(async () => { await Promise.all(roots.map((directory) => rm(directory, { recursive: true, force: true }))); });

// Compiles the examples of the Consumer Module Standard and of the module authoring guide against the workspace
// build, so the documents cannot drift from the public API of Core, Assembly, resources and conformance. Both
// compilers and both resolutions must accept them.
async function compileExample(markdown: string, kind: string, name: string): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "get-modular-standard-examples-")));
  roots.push(root);
  await mkdir(join(root, "node_modules/@get-modular"), { recursive: true });
  for (const library of ["core", "assembly", "resources", "conformance", "observation"]) {
    await symlink(join(workspace, "packages", library), join(root, "node_modules/@get-modular", library), "junction");
  }
  // Test blocks run on node:test.
  await mkdir(join(root, "node_modules/@types"), { recursive: true });
  await symlink(join(workspace, "node_modules/@types/node"), join(root, "node_modules/@types/node"), "junction");
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "standard-examples", private: true, type: "module" }));
  const directory = join(root, name);
  const files = exampleFiles(markdown, kind, name);
  if (name === "resources") {
    files.set("resource-lifetime.test.ts", resourceLifetimeSource);
  }
  for (const [path, body] of files) {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    const prefix = `${/from "node:/u.test(body) ? "/// <reference types=\"node\" />\n" : ""}${placeholders[name] ?? ""}`;
    await writeFile(join(directory, path), `${prefix}${body}\n`);
  }
  const project = join(directory, "tsconfig.json");
  await writeFile(project, JSON.stringify({ compilerOptions: {
    target: "ES2022", lib: ["ES2024", "ESNext.Disposable", "ESNext.Promise", "DOM"], types: [],
    strict: true, exactOptionalPropertyTypes: true, noUncheckedIndexedAccess: true,
    noEmit: true, skipLibCheck: false,
  }, files: [...files.keys()] }));
  assert.equal(testAssemblyTypes({ directory, project }).length, supportedCompilers().length * 2);
  if (name === "resources") {
    // Execute the same extracted sources. A copied recipe would not catch documentation regressions.
    for (const { path: compiler, compilerName } of supportedCompilers()) {
      const output = join(directory, "emitted", compilerName);
      runNode([compiler, "--project", project, "--module", "NodeNext", "--moduleResolution", "NodeNext",
        "--noEmit", "false", "--outDir", output], directory);
      const report = runNode(["--test", "--test-reporter=tap", join(output, "resource-lifetime.test.js")], directory);
      assert.deepEqual([...report.matchAll(/^ok \d+ - (.+)$/gmu)].map(match => match[1]), resourceCases,
        `The resource recipe must execute every named scenario.\n${report}`);
      for (const [field, count] of [["tests", 5], ["pass", 5], ["fail", 0], ["cancelled", 0], ["skipped", 0], ["todo", 0]]) {
        assert.ok(report.split("\n").includes(`# ${field} ${count}`), `Missing complete resource test summary.\n${report}`);
      }
    }
  }
}

function runNode(args: readonly string[], directory: string): string {
  const environment: NodeJS.ProcessEnv = { ...process.env, NODE_PATH: "", NODE_OPTIONS: "" };
  // A nested --test invocation otherwise exits successfully without running its files.
  delete environment.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, args, {
    cwd: directory, encoding: "utf8", timeout: 180_000, maxBuffer: 4 * 1024 * 1024,
    env: environment,
  });
  if (result.error) throw result.error;
  assert.equal(result.signal, null, `example process terminated by ${result.signal}`);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

for (const name of standardExamples) {
  test(`the Consumer Module Standard example ${name} compiles on supported compilers`, { timeout: 600000 }, async () => {
    await compileExample(standard, "consumer-standard-example", name);
  });
}
for (const name of guideExamples) {
  test(`the module authoring guide example ${name} compiles on supported compilers`, { timeout: 600000 }, async () => {
    await compileExample(guide, "module-authoring-example", name);
  });
}
