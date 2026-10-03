import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { testAssemblyTypes } from "../../architecture/tooling/test-assembly-types.mjs";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const standard = await readFile(join(workspace, "docs/architecture/common-assembly.md"), "utf8");

// The names the examples assume a consumer already has.
const placeholders = {
  host: `import type { SuccessfulComposition } from "@get-modular/assembly";
type DbPort = { readonly query: (q: string) => number };
type OrdersPort = { readonly list: () => number };
type Connection = { readonly close: () => Promise<void> };
declare const url: string;
declare function connect(url: string, options: { readonly signal: AbortSignal }): Promise<Connection>;
declare function createOrdersPort(db: DbPort, conn: Connection): OrdersPort;
declare const composition: SuccessfulComposition;
declare class ConstructionFailed extends Error { constructor(...details: readonly unknown[]); }
`,
  instances: `import type { SuccessfulComposition } from "@get-modular/assembly";
import type { CloseReport, ScopeControl } from "@get-modular/resources";
type ChatPort = { readonly send: (text: string) => Promise<void> };
type Lease = { readonly release: () => Promise<void> };
declare function acquireLease(sessionId: string): Promise<Lease>;
declare function createChatPort(lease: Lease): ChatPort;
declare const composition: SuccessfulComposition;
declare class ConstructionFailed extends Error { constructor(...details: readonly unknown[]); }
declare function closeWithin(control: ScopeControl, graceMs: number, abandonMs: number): Promise<CloseReport>;
`,
};

function example(name) {
  const marker = `<!-- consumer-standard-example: ${name} -->`;
  assert.equal(standard.split(marker).length, 2, `the standard must carry exactly one ${marker}`);
  const body = standard.slice(standard.indexOf(marker) + marker.length).match(/^\s*```ts\n([\s\S]*?)\n```/u)?.[1];
  assert.ok(body, `no ts block follows ${marker}`);
  return body;
}

// Compiles the examples of the Consumer Module Standard against the workspace build, so the document cannot
// drift from the public API of Core, Assembly and resources. Both compilers and both resolutions must accept them.
test("the Consumer Module Standard examples compile on both compilers", { timeout: 600000 }, async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "get-modular-standard-examples-")));
  try {
    await mkdir(join(directory, "node_modules/@get-modular"), { recursive: true });
    for (const name of ["core", "assembly", "resources"]) {
      await symlink(join(workspace, "packages", name), join(directory, "node_modules/@get-modular", name), "junction");
    }
    await writeFile(join(directory, "package.json"), JSON.stringify({ name: "standard-examples", private: true, type: "module" }));
    const files = Object.keys(placeholders).map((name) => `${name}.ts`);
    for (const name of Object.keys(placeholders)) {
      await writeFile(join(directory, `${name}.ts`), `${placeholders[name]}${example(name)}\n`);
    }
    const project = join(directory, "tsconfig.json");
    await writeFile(project, JSON.stringify({ compilerOptions: {
      target: "ES2022", lib: ["ES2024", "ESNext.Disposable", "ESNext.Promise", "DOM"], types: [],
      strict: true, exactOptionalPropertyTypes: true, noUncheckedIndexedAccess: true,
      noEmit: true, skipLibCheck: false,
    }, files }));
    assert.equal(testAssemblyTypes({ directory, project }).length, 4);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
