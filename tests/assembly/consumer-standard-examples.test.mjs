import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { supportedCompilers, testAssemblyTypes } from "../../architecture/tooling/test-assembly-types.mjs";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const standard = await readFile(join(workspace, "docs/architecture/common-assembly.md"), "utf8");
const guide = await readFile(join(workspace, "docs/guides/module-authoring.md"), "utf8");

// The names the examples assume a consumer already has.
const placeholders = {
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

function exampleFiles(markdown, kind, name) {
  const marker = `<!-- ${kind}: ${name} -->`;
  const files = new Map();
  let from = markdown.indexOf(marker);
  assert.notEqual(from, -1, `${kind} must carry ${marker}`);
  for (; from !== -1; from = markdown.indexOf(marker, from + marker.length)) {
    markers.lastIndex = from + marker.length;
    const end = markers.exec(markdown)?.index ?? markdown.length;
    for (const [, body] of markdown.slice(from + marker.length, end).matchAll(/```ts\n([\s\S]*?)\n```/gu)) {
      const path = body.match(/^\/\/ ([\w./-]+\/[\w.-]+\.ts)\n/u)?.[1] ?? `${name}.ts`;
      assert.ok(!files.has(path), `${marker} writes ${path} twice`);
      files.set(path, body);
    }
  }
  assert.ok(files.size > 0, `no ts block follows ${marker}`);
  return files;
}

const standardExamples = ["host", "instances", "template"];
const guideExamples = ["project", "resources", "bind", "inputs"];
const roots = [];
after(async () => { await Promise.all(roots.map((directory) => rm(directory, { recursive: true, force: true }))); });

// Compiles the examples of the Consumer Module Standard and of the module authoring guide against the workspace
// build, so the documents cannot drift from the public API of Core, Assembly, resources and conformance. Both
// compilers and both resolutions must accept them.
async function compileExample(markdown, kind, name) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "get-modular-standard-examples-")));
  roots.push(root);
  await mkdir(join(root, "node_modules/@get-modular"), { recursive: true });
  for (const library of ["core", "assembly", "resources", "conformance"]) {
    await symlink(join(workspace, "packages", library), join(root, "node_modules/@get-modular", library), "junction");
  }
  // Test blocks run on node:test.
  await mkdir(join(root, "node_modules/@types"), { recursive: true });
  await symlink(join(workspace, "node_modules/@types/node"), join(root, "node_modules/@types/node"), "junction");
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "standard-examples", private: true, type: "module" }));
  const directory = join(root, name);
  const files = exampleFiles(markdown, kind, name);
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
