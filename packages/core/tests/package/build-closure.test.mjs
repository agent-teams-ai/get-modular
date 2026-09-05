import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
test("clean production build follows only the public entry while checking unselected source separately", async t => {
  const sandbox = await mkdtemp(join(tmpdir(), "gm-build-closure-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const files = ["package.json", "tsconfig.base.json", "architecture/tooling/build-core.mjs",
    "packages/core/package.json", "packages/core/tsconfig.json", "packages/core/tsconfig.typecheck.json",
    "packages/core/tsconfig.test.json", "packages/core/tsconfig.stage0.json", "packages/core/src",
    "packages/core/self-composition"];
  for (const path of files) {
    await mkdir(dirname(join(sandbox, path)), { recursive: true });
    await cp(join(root, path), join(sandbox, path), { recursive: true });
  }
  await symlink(join(root, "node_modules"), join(sandbox, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  const core = join(sandbox, "packages/core");
  const unselected = "src/features/unselected/probe.ts";
  await mkdir(dirname(join(core, unselected)), { recursive: true });
  await writeFile(join(core, unselected), "export const probe: number = 1;\n");
  await mkdir(join(core, "dist"), { recursive: true });
  await writeFile(join(core, "dist/stale.js"), "throw new Error('stale output');\n");
  const build = () => spawnSync(process.execPath, [join(sandbox, "architecture/tooling/build-core.mjs")], {
    cwd: sandbox, encoding: "utf8", timeout: 30_000,
  });
  const good = build();
  assert.ifError(good.error);
  assert.equal(good.status, 0, good.stdout + good.stderr);
  for (const path of ["dist/stale.js", "dist/features/unselected/probe.js", "dist/self-composition/stage0-entry.js",
    "dist/features/compiler-facade/declaration.js"]) {
    await assert.rejects(readFile(join(core, path)), { code: "ENOENT" });
  }
  assert.match(await readFile(join(core, "dist-test/features/unselected/probe.js"), "utf8"), /probe = 1/u);
  assert.match(await readFile(join(core, "dist-stage0/self-composition/stage0-entry.js"), "utf8"), /compileComposition/u);
  const declaration = await readFile(join(core, "dist/composition/stage0.d.ts"), "utf8");
  assert.match(declaration, /Promise<CompileCompositionResult>/u);
  assert.doesNotMatch(declaration, /CompilerFacadePort|compiler-facade|input-admission|composition-semantics/u);
  // Unselected implementations still fail the full source check, rather than
  // disappearing from validation when production switches to one entrypoint.
  await writeFile(join(core, unselected), 'export const probe: number = "wrong";\n');
  const invalid = build();
  assert.ifError(invalid.error);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stdout + invalid.stderr, /TS2322/u);
});
