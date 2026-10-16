/// <reference types="node" />
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(join(workspace, "package.json"));
const sources = {
  "shared.ts": `
import { required } from "@get-modular/core";
import { declareModule, defineContract, implement } from "@get-modular/assembly";
import type { CapabilitiesOf } from "@get-modular/assembly";
import { scoped } from "@get-modular/resources";
export const Clock = defineContract<{ readonly now: () => number }>()({ id: "focused/clock", revision: 1 });
export const Orders = defineContract<{ readonly count: () => number }>()({ id: "focused/orders", revision: 1 });
export const ClockV2 = defineContract<{ readonly now: () => number }>()({ id: "focused/clock", revision: 2 });
export interface HostMap extends CapabilitiesOf<typeof Clock | typeof Orders> {}
export interface OrdersMap extends CapabilitiesOf<typeof Clock | typeof Orders> {}
export const ordersDeclaration = declareModule({
  moduleId: "focused/orders", implementationId: "focused/orders/default",
  owner: { authority: "focused", path: ["orders"] }, provides: [Orders.provide()],
  slots: [Clock.slot("clock", required())],
});
export const ordersEntry = implement<OrdersMap>()(ordersDeclaration, async (dependencies, context) => ({
  instance: { total: dependencies.clock.now() + (context.resources === undefined ? 0 : 1) },
  capabilities: { "focused/orders": { count: () => 2 } },
}), scoped);
`,
  "module.ts": `
import { implement } from "@get-modular/assembly";
import { ordersDeclaration, type OrdersMap } from "./shared.js";
export const broken = implement<OrdersMap>()(ordersDeclaration, async (dependencies, context) => ({
  instance: { total: dependencies.clock.now() + context.resources },
  capabilities: { "focused/orders": { count: () => 2 } },
}));
`,
  "feature-maps.ts": `
import type { CapabilitiesOf } from "@get-modular/assembly";
import { Clock, ClockV2 } from "./shared.js";
interface One extends CapabilitiesOf<typeof Clock> {}
interface Two extends CapabilitiesOf<typeof ClockV2> {}
export interface Both extends One, Two {}
`,
  "annotated-profile.ts": `
import { assemblyFor } from "@get-modular/assembly";
import type { AnyModuleEntry, ModuleGroup } from "@get-modular/assembly";
import { ordersEntry } from "./shared.js";
import type { HostMap } from "./shared.js";
const list: readonly (AnyModuleEntry<HostMap> | ModuleGroup<AnyModuleEntry<HostMap>>)[] = [ordersEntry];
export const result = assemblyFor<HostMap>().prepare({ profileId: "focused/profile", modules: list, roots: { orders: ordersEntry } });
`,
  "annotated-composition.ts": `
import { assemblyFor } from "@get-modular/assembly";
import type { AnyModuleEntry, SuccessfulComposition } from "@get-modular/assembly";
import { ordersEntry } from "./shared.js";
import type { HostMap } from "./shared.js";
declare const composition: SuccessfulComposition;
const list: readonly AnyModuleEntry<HostMap>[] = [ordersEntry];
export const result = assemblyFor<HostMap>().prepare({ composition, modules: list, roots: { orders: ordersEntry } });
`,
};

void test("focused group type failures report their codes and files on both compilers", { timeout: 600000 }, async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "get-modular-types-focused-")));
  try {
    await mkdir(join(directory, "node_modules/@get-modular"), { recursive: true });
    for (const name of ["core", "assembly", "resources", "conformance"]) {
      await symlink(join(workspace, "packages", name), join(directory, "node_modules/@get-modular", name), "junction");
    }
    await writeFile(join(directory, "package.json"), JSON.stringify({ name: "types-focused", private: true, type: "module" }));
    await writeFile(join(directory, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        target: "ES2022", lib: ["ES2023", "ESNext.Disposable", "DOM"], strict: true, noEmit: true,
        skipLibCheck: false, types: [], isolatedDeclarations: false, erasableSyntaxOnly: false,
      },
      files: Object.keys(sources),
    }));
    for (const [name, source] of Object.entries(sources)) { await writeFile(join(directory, name), source); }

    for (const compilerName of ["typescript-minimum", "typescript"]) {
      const manifestPath = require.resolve(`${compilerName}/package.json`);
      const manifestSource = await readFile(manifestPath, "utf8");
      const version = /"version":\s*"([^"]+)"/u.exec(manifestSource)?.[1];
      if (version === undefined || version.length === 0) { throw new Error(`${compilerName} must declare its version`); }
      const compiler = join(dirname(manifestPath), "bin/tsc");
      for (const [module, resolution] of [["NodeNext", "NodeNext"], ["ESNext", "Bundler"]]) {
        const run = spawnSync(process.execPath, [
          compiler, "--project", join(directory, "tsconfig.json"), "--module", module,
          "--moduleResolution", resolution, "--pretty", "false",
        ], { cwd: directory, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, env: { ...process.env, NODE_PATH: "", NODE_OPTIONS: "" } });
        const label = `${version} ${resolution}`;
        const byFile = new Map(Object.keys(sources).map((name) => [name, []]));
        for (const match of `${run.stdout}\n${run.stderr}`.matchAll(/^(\S+?\.ts)\(\d+,\d+\): error (TS\d+):/gmu)) {
          byFile.get(match[1]).push(match[2]);
        }
        assert.deepEqual(byFile.get("module.ts"), ["TS2339"], `${label}\n${run.stdout}\n${run.stderr}`);
        assert.deepEqual(byFile.get("feature-maps.ts"), ["TS2320"], `${label}\n${run.stdout}\n${run.stderr}`);
        assert.deepEqual(byFile.get("annotated-profile.ts"), ["TS2322"], `${label}\n${run.stdout}\n${run.stderr}`);
        assert.deepEqual(byFile.get("annotated-composition.ts"), [], `${label}\n${run.stdout}\n${run.stderr}`);
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
