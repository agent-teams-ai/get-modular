import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { supportedCompilers } from "../../architecture/tooling/test-assembly-types.mjs";
import { copyReadyPackages } from "../qualification/consumer-fixtures/support/materialize.mjs";
import { generateGrowthSource } from "../qualification/consumer-fixtures/growth/generate.ts";

test("complete generated descriptor aggregates reject lost unused transitive metadata", { timeout: 180000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "gm-descriptor-aggregate-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await copyReadyPackages(directory);
  await writeFile(join(directory, "package.json"), '{"private":true,"type":"module"}\n');
  await generateGrowthSource(directory, 8);
  await mkdir(join(directory, "tests"));
  await cp(new URL("../qualification/consumer-fixtures/growth/test-source/aggregate-types.ts.txt", import.meta.url),
    join(directory, "tests/aggregate-types.ts"));
  await writeFile(join(directory, "tsconfig.json"), JSON.stringify({ compilerOptions: {
    target: "ES2024", lib: ["ES2024", "ESNext.Disposable", "DOM"], strict: true,
    noEmit: true, skipLibCheck: false, types: [],
  }, include: ["src/**/*.ts", "tests/**/*.ts"] }));
  const firstPath = join(directory, "src/features/f000/composition/f000.contracts.ts");
  const lastPath = join(directory, "src/features/f007/composition/f007.contracts.ts");
  const first = await readFile(firstPath, "utf8");
  const last = await readFile(lastPath, "utf8");
  for (const compiler of supportedCompilers()) {
    for (const [module, resolution] of [["NodeNext", "NodeNext"], ["ESNext", "Bundler"]] as const) {
      const compile = () => {
        const result = spawnSync(process.execPath, [compiler.path, "-p", "tsconfig.json", "--module", module,
          "--moduleResolution", resolution, "--pretty", "false"], {
          cwd: directory, encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024,
          env: { ...process.env, NODE_PATH: "", NODE_OPTIONS: "" },
        });
        assert.equal(result.error, undefined);
        assert.equal(result.signal, null);
        return result;
      };
      const positive = compile();
      assert.equal(positive.status, 0, positive.stdout + positive.stderr);
      const mutations = [
        { path: firstPath, original: first, label: "union omits unused transitive seed",
          source: first.replace("export type FeatureContracts = typeof ValueContract | typeof SeedContract;",
            "export type FeatureContracts = typeof ValueContract;") },
        { path: lastPath, original: last, label: "map omits unused transitive seed",
          source: last.replace(/CapabilitiesOf<C(\d+)>/gu, 'Omit<CapabilitiesOf<C$1>, "fixture/growth/seed">') },
        { path: lastPath, original: last, label: "union omits own descriptor",
          source: last.replace("export type FeatureContracts = typeof ValueContract | ", "export type FeatureContracts = ") },
      ];
      for (const mutation of mutations) {
        assert.notEqual(mutation.source, mutation.original, mutation.label);
        try {
          await writeFile(mutation.path, mutation.source);
          const rejected = compile();
          assert.notEqual(rejected.status, 0, mutation.label);
          assert.match(rejected.stdout, /tests[/\\]aggregate-types\.ts\(\d+,\d+\): error TS2344:/u,
            `${mutation.label}: ${rejected.stdout}${rejected.stderr}`);
          const codes = [...`${rejected.stdout}${rejected.stderr}`.matchAll(/error TS(\d+):/gu)]
            .map(match => Number(match[1]));
          assert(codes.every(code => code === 2344), `${mutation.label}: ${rejected.stdout}${rejected.stderr}`);
        } finally { await writeFile(mutation.path, mutation.original); }
      }
      const restored = compile();
      assert.equal(restored.status, 0, restored.stdout + restored.stderr);
    }
  }
});
