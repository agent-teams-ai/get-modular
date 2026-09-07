import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
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

async function bounded(promise, milliseconds, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message())), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function withWindowsFileLock(path, action) {
  const releasePath = `${path}.${randomUUID()}.release`;
  // Both fixture-owned paths travel through the environment, never script text.
  // FileShare.None denies deletion while the child owns the open handle.
  const script = `
    $ErrorActionPreference = 'Stop'
    $stream = [System.IO.File]::Open(
      $env:GM_CLEANUP_LOCK_PATH,
      [System.IO.FileMode]::Open,
      [System.IO.FileAccess]::ReadWrite,
      [System.IO.FileShare]::None
    )
    try {
      [Console]::Out.WriteLine('LOCK_READY')
      [Console]::Out.Flush()
      $watchdog = [System.Diagnostics.Stopwatch]::StartNew()
      while (-not [System.IO.File]::Exists($env:GM_CLEANUP_RELEASE_PATH)) {
        if ($watchdog.ElapsedMilliseconds -ge 25000) {
          throw 'Windows lock release marker watchdog expired'
        }
        Start-Sleep -Milliseconds 50
      }
    } finally {
      $stream.Dispose()
    }
  `;
  const child = spawn("powershell.exe", [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script,
  ], {
    env: { ...process.env, GM_CLEANUP_LOCK_PATH: path, GM_CLEANUP_RELEASE_PATH: releasePath },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    timeout: 30_000,
  });
  let output = "";
  let diagnostics = "";
  let childError;
  let didClose = false;
  let markerCreated = false;
  const errors = [];
  const status = () => `exitCode=${child.exitCode}, signalCode=${child.signalCode}; ` +
    `stdout=${JSON.stringify(output)}; stderr=${JSON.stringify(diagnostics)}`;
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", chunk => {
    diagnostics = (diagnostics + chunk).slice(-8_192);
  });
  const closed = new Promise(resolve => {
    child.once("close", (code, signal) => {
      didClose = true;
      resolve({ code, signal });
    });
  });
  const ready = new Promise((resolve, reject) => {
    child.once("error", error => {
      childError = error;
      reject(error);
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => {
      output = (output + chunk).slice(-8_192);
      if (output.split(/\r?\n/u).includes("LOCK_READY")) resolve();
    });
    child.once("close", () => {
      reject(new Error(`lock child exited before readiness: ${status()}`));
    });
  });
  try {
    await bounded(ready, 10_000, () => `Windows lock child readiness timed out: ${status()}`);
    assert.equal(child.exitCode, null);
    assert.equal(child.signalCode, null);
    await action();
  } catch (error) {
    errors.push(error);
  } finally {
    try {
      await writeFile(releasePath, "", { flag: "wx" });
      markerCreated = true;
      const result = await bounded(closed, 5_000, () => `Windows lock child release timed out: ${status()}`);
      assert.ifError(childError);
      assert.equal(result.signal, null, status());
      assert.equal(result.code, 0, status());
    } catch (error) {
      errors.push(error);
      if (!didClose) {
        try {
          child.kill();
          await bounded(closed, 5_000, () => `Windows lock child termination timed out: ${status()}`);
        } catch (terminationError) {
          errors.push(terminationError);
        }
      }
    } finally {
      if (didClose && markerCreated) {
        try {
          await rm(releasePath);
        } catch (markerError) {
          errors.push(markerError);
        }
      }
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, "Windows file lock action/readiness and teardown failed");
}

test("generated cleanup failure still removes stale production output", async t => {
  const f = await fixture(t);
  const { cleanProduction } = await import(
    pathToFileURL(join(f.directory, "architecture/tooling/generate-core.mjs")).href
  );
  if (process.platform === "win32") {
    await f.poison();
    await withWindowsFileLock(join(f.core, generated), async () => {
      await assert.rejects(cleanProduction(), error => {
        assert.ok(["EPERM", "EACCES", "EBUSY"].includes(error.code), String(error));
        assert.equal(error instanceof AggregateError, false);
        return true;
      });
      await assert.rejects(readFile(join(f.core, "dist/index.js")), { code: "ENOENT" });
    });
    assert.equal(await readFile(join(f.core, generated), "utf8"),
      "invalid stale generated source !!!\n");
  } else {
    // A regular-file ancestor produces ENOTDIR on POSIX, including under root.
    // Windows rm(force) can treat this path as missing, so it uses a real lock.
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
  }
  await f.poison();
  await cleanProduction();
  await f.absent();
  await cleanProduction();
});

test("permission failures attempt both removals and retain every cleanup error", {
  // The cleanup regression above uses a real failure backend on both platforms.
  skip: process.platform === "win32"
    ? "POSIX permission fixture is not applicable on Windows; exclusive-lock cleanup is tested separately"
    : process.getuid?.() === 0
      ? "requires a non-root process; POSIX permission cases are unproven under root"
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
