import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { testAssemblyTypes } from "../../architecture/tooling/test-assembly-types.mjs";
import { fragmentSource } from "./type-scale.mjs";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// ADR-0032: 500 handles bound by 20 team maps prepare under one Host interface map. Both compilers and
// both resolutions must accept them without TS2589. Time is reported, never asserted. The fixture checks
// the workspace build, so packed-root and its repeated runs stay free of it.
test("500 fragment handles prepare under one interface map on both compilers", { timeout: 600000 }, async (t) => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "get-modular-type-scale-")));
  try {
    await mkdir(join(directory, "node_modules/@get-modular"), { recursive: true });
    for (const name of ["core", "assembly"]) {
      await symlink(join(workspace, "packages", name), join(directory, "node_modules/@get-modular", name), "junction");
    }
    await writeFile(join(directory, "package.json"), JSON.stringify({ name: "type-scale", private: true, type: "module" }));
    await writeFile(join(directory, "fragment-scale.ts"), fragmentSource(500));
    const project = join(directory, "tsconfig.json");
    await writeFile(project, JSON.stringify({ compilerOptions: {
      target: "ES2022", lib: ["ES2023", "DOM"], strict: true, noEmit: true,
      skipLibCheck: false, types: [], isolatedDeclarations: false, erasableSyntaxOnly: false,
    }, files: ["fragment-scale.ts"] }));
    const started = performance.now();
    const observations = testAssemblyTypes({ directory, project });
    t.diagnostic(JSON.stringify({ handles: 500, observations, elapsedMs: Math.round(performance.now() - started) }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
