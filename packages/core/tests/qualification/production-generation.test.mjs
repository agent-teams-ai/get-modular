import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const repository = fileURLToPath(new URL("../../../../", import.meta.url));
const generated = "src/composition/generated/stage1.ts";

async function fixture(t) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "gm-production-generation-")));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const path of [
    "package.json", "tsconfig.base.json",
    "architecture/tooling/build-core.mjs", "architecture/tooling/generate-core.mjs",
    "tests/qualification/support/construction-witness.mjs",
    "packages/core/package.json", "packages/core/tsconfig.json",
    "packages/core/tsconfig.typecheck.json", "packages/core/tsconfig.test.json",
    "packages/core/tsconfig.stage0.json", "packages/core/tsconfig.seed.json",
    "packages/core/src", "packages/core/self-composition",
    "packages/core/tests/features/canonicalization/witness-variant",
  ]) {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await cp(join(repository, path), join(directory, path), { recursive: true });
  }
  // Includes the emitter's compiler and the independent witness's TypeScript
  // scanner and canonicalize dependency. No fixture imports workspace Core.
  await symlink(join(repository, "node_modules"), join(directory, "node_modules"),
    process.platform === "win32" ? "junction" : "dir");
  const core = join(directory, "packages/core");
  await rm(join(core, "src/composition/generated"), { recursive: true, force: true });
  const run = args => spawnSync(process.execPath, args, {
    cwd: directory, encoding: "utf8", timeout: 120_000, maxBuffer: 4_000_000,
  });
  const build = () => run(["architecture/tooling/build-core.mjs"]);
  const generate = () => run(["architecture/tooling/generate-core.mjs"]);
  const typecheck = () => run(["architecture/tooling/generate-core.mjs", "--typecheck"]);
  const put = async (path, text) => {
    await mkdir(dirname(join(core, path)), { recursive: true });
    await writeFile(join(core, path), text);
  };
  const absent = async () => {
    for (const path of [generated, "dist/index.js", "dist/composition/generated/stage1.js"]) {
      await assert.rejects(readFile(join(core, path)), { code: "ENOENT" });
    }
  };
  const poison = async () => {
    await put(generated, "invalid stale generated source !!!\n");
    await put("dist/index.js", "export const stale = true;\n");
    await put("dist-stage0/self-composition/stage0-entry.js", "throw new Error('stale seed');\n");
  };
  return { directory, core, run, build, generate, typecheck, put, absent, poison };
}

function succeeds(result) {
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stdout + result.stderr);
}

function fails(result, expected) {
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, expected);
}

test("generated cleanup failure still removes stale production output", async t => {
  const f = await fixture(t);
  const { cleanProduction } = await import(
    pathToFileURL(join(f.directory, "architecture/tooling/generate-core.mjs")).href
  );
  // A regular-file ancestor produces a real filesystem rejection, including
  // when running as root, without changing permissions in the source checkout.
  const blocker = "src/composition/generated";
  await f.put(blocker, "not a directory\n");
  await f.put("dist/index.js", "export const stale = true;\n");
  await assert.rejects(cleanProduction(), error => {
    assert.equal(error.code, "ENOTDIR");
    assert.equal(error instanceof AggregateError, false);
    return true;
  });
  await assert.rejects(readFile(join(f.core, "dist/index.js")), { code: "ENOENT" });
  assert.equal(await readFile(join(f.core, blocker), "utf8"), "not a directory\n");
  await rm(join(f.core, blocker));
  await f.poison();
  await cleanProduction();
  await f.absent();
  await cleanProduction();
});

test("permission failures attempt both removals and retain every cleanup error", {
  // POSIX permission denial is not evidence on Windows or under root.
  // The ENOTDIR regression above runs independently without this restriction.
  skip: process.platform === "win32" || process.getuid?.() === 0
    ? "requires POSIX permissions and a non-root process; permission cases are unproven here"
    : false,
}, async t => {
  const f = await fixture(t);
  const { cleanProduction } = await import(
    pathToFileURL(join(f.directory, "architecture/tooling/generate-core.mjs")).href
  );
  const generatedDirectory = dirname(join(f.core, generated));
  const dist = join(f.core, "dist");
  const denied = error => {
    assert.ok(["EACCES", "EPERM"].includes(error.code), String(error));
    return true;
  };
  for (const blockGenerated of [false, true]) {
    await f.poison();
    // An empty dist isolates the failing operation to removal of the directory
    // entry from its unwritable parent, rather than removal of its children.
    await rm(dist, { recursive: true, force: true });
    await mkdir(dist);
    try {
      if (blockGenerated) await chmod(generatedDirectory, 0o555);
      await chmod(f.core, 0o555);
      await assert.rejects(cleanProduction(), error => {
        if (!blockGenerated) {
          assert.equal(error instanceof AggregateError, false);
          return denied(error);
        }
        assert.ok(error instanceof AggregateError);
        assert.equal(error.errors.length, 2);
        error.errors.forEach(denied);
        assert.equal(error.errors[0].path, join(f.core, generated));
        assert.equal(error.errors[1].path, dist);
        assert.ok(error.message.includes(join(f.core, generated)));
        assert.ok(error.message.includes(dist));
        return true;
      });
      if (blockGenerated) {
        assert.equal(await readFile(join(f.core, generated), "utf8"),
          "invalid stale generated source !!!\n");
      } else {
        await assert.rejects(readFile(join(f.core, generated)), { code: "ENOENT" });
      }
    } finally {
      await chmod(f.core, 0o755);
      await chmod(generatedDirectory, 0o755);
    }
    await cleanProduction();
    await f.absent();
  }
});

test("cold production executes generated M2 and retains direct qualification", async t => {
  const f = await fixture(t);
  // Component and all-source checks must ignore a materialized variant, while
  // the direct seed remains independent of both generated roots.
  await f.put("src/composition/generated/stage1.variant.ts", "invalid variant syntax !!!\n");
  succeeds(f.build());
  const first = await readFile(join(f.core, generated), "utf8");
  assert.match(first, /^\/\/ generated by the self-composition emitter/u);
  await assert.rejects(readFile(join(f.core, "dist/composition/stage0.js")), { code: "ENOENT" });
  succeeds(f.run(["--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import * as production from "./packages/core/dist/index.js";
    import * as direct from "./packages/core/dist-stage0/self-composition/stage0-entry.js";
    import { ownDeclarations, ownProfile } from "./packages/core/dist-stage0/self-composition/own-profile.js";
    const input = { declarations: ownDeclarations, profile: ownProfile };
    const result = await production.compileComposition(input);
    assert.equal(result.ok, true);
    assert.equal(result.plan.selections.length, 6);
    assert.equal(result.plan.bindings.length, 6);
    assert.deepEqual(result.plan.dependencyOrder, [
      "get-modular/canonicalization/owned-jcs",
      "get-modular/composition-semantics/default",
      "get-modular/plan-output/default",
      "get-modular/raw-scanner/owned-iterative",
      "get-modular/input-admission/default",
      "get-modular/compiler-facade/default",
    ]);
    assert.deepEqual(result, await direct.compileComposition(input));
    const encode = value => new TextEncoder().encode(JSON.stringify(value));
    const raw = { declarations: ownDeclarations.map(encode), profile: encode(ownProfile) };
    assert.deepEqual(await production.compileCompositionJson(raw), result);
    assert.deepEqual(await direct.compileCompositionJson(raw), result);
    assert.notEqual(production.compileComposition, direct.compileComposition);
  `]));
  await f.poison();
  succeeds(f.build());
  assert.equal(await readFile(join(f.core, generated), "utf8"), first);
});

test("standalone typecheck prepares cold wiring and rejects unselected source", async t => {
  const f = await fixture(t);
  succeeds(f.typecheck());
  assert.match(await readFile(join(f.core, generated), "utf8"), /createOwnedRawScanner/u);
  await assert.rejects(readFile(join(f.core, "dist/index.js")), { code: "ENOENT" });
  await f.poison();
  succeeds(f.typecheck());
  await f.put("src/features/unselected/probe.ts", 'export const probe: number = "wrong";\n');
  fails(f.typecheck(), /TS2322/u);
  await f.absent();
});

test("correspondence fails before rendering or publishing and recovers in a fresh process", async t => {
  const f = await fixture(t);
  succeeds(f.generate());
  const path = "self-composition/allowlist.ts";
  const original = await readFile(join(f.core, path), "utf8");
  const changed = original.replace('factoryExport: "createOwnedJcs"', 'factoryExport: "createWrongJcs"');
  assert.notEqual(changed, original);
  await f.put(path, changed);
  // If rendering precedes full correspondence this sentinel wins instead.
  const emitterPath = "self-composition/emit.ts";
  const emitter = await readFile(join(f.core, emitterPath), "utf8");
  const marker = "  const qualification = options.qualification === true;";
  assert.ok(emitter.includes(marker));
  await f.put(emitterPath, emitter.replace(marker,
    '  if (Object.is(1, 1)) throw new Error("renderer-ran-before-correspondence");\n' + marker));
  await f.poison();
  fails(f.generate(), /witness\.allowlist-correspondence/u);
  await f.absent();
  await f.put(path, original);
  await f.put(emitterPath, emitter);
  succeeds(f.generate());
});

test("rendered wrong construction fails before designated publication", async t => {
  const f = await fixture(t);
  const path = "self-composition/emit.ts";
  const original = await readFile(join(f.core, path), "utf8");
  const marker = '  return lines.join("\\n");';
  assert.ok(original.includes(marker));
  await f.put(path, original.replace(marker,
    '  return lines.join("\\n").replace("scanner: scanner", "scanner: canonicalizer");'));
  await f.poison();
  fails(f.build(), /witness\.invalid-construction/u);
  await f.absent();
});

test("production compilation failure removes verified wiring and every production output", async t => {
  const f = await fixture(t);
  const path = "src/index.ts";
  const original = await readFile(join(f.core, path), "utf8");
  await f.put(path, original + '\nexport const broken: number = "wrong";\n');
  await f.poison();
  fails(f.build(), /TS2322/u);
  await f.absent();
  await f.put(path, original);
  succeeds(f.build());
});
