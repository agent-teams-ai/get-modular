import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
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

const LOCK_FAILED_PREFIX = "LOCK_FAILED ";
const LOCK_ACQUISITION_FAILED_EXIT = 3;

// A failed exclusive open is an acknowledged terminal outcome of the child
// protocol, distinct from a missing or late LOCK_READY, which stays a rejection.
class LockAcquisitionError extends Error {
  constructor(failure, status) {
    super(`Windows lock acquisition failed: ${JSON.stringify(failure)}; ${status}`);
    this.name = "LockAcquisitionError";
    this.failure = failure;
  }
}

function parseLockFailure(line) {
  try {
    return JSON.parse(line.slice(LOCK_FAILED_PREFIX.length));
  } catch (error) {
    return { unparsed: line, parseError: String(error) };
  }
}

// Both fixture-owned paths travel through the environment, never script text.
// FileShare.None denies deletion while the child owns the open handle. A failed
// open is reported on stdout as LOCK_FAILED and exits with a dedicated code,
// strictly before any LOCK_READY.
const windowsLockScript = `
    $ErrorActionPreference = 'Stop'
    # Refs #148: distinguish shell startup from an exclusive-open stall.
    [Console]::Error.WriteLine('LOCK_OPENING')
    [Console]::Error.Flush()
    try {
      $stream = [System.IO.File]::Open(
        $env:GM_CLEANUP_LOCK_PATH,
        [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::ReadWrite,
        [System.IO.FileShare]::None
      )
    } catch {
      $failure = $_.Exception
      if ($null -ne $failure.InnerException) { $failure = $failure.InnerException }
      $detail = @{
        type = $failure.GetType().FullName
        hresult = [int]$failure.HResult
        message = $failure.Message
      } | ConvertTo-Json -Compress
      [Console]::Out.WriteLine("${LOCK_FAILED_PREFIX}$detail")
      [Console]::Out.Flush()
      exit ${LOCK_ACQUISITION_FAILED_EXIT}
    }
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
      [Console]::Error.WriteLine('LOCK_RELEASED')
      [Console]::Error.Flush()
    }
  `;

const spawnPowerShellLock = env => spawn("powershell.exe", [
  "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", windowsLockScript,
], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
  timeout: 30_000,
});

// spawnLock is replaceable only so the host-side protocol can be exercised
// without Windows; the physical lock behavior is covered by the real child.
async function withWindowsFileLock(path, action, spawnLock = spawnPowerShellLock) {
  const started = performance.now();
  const releasePath = `${path}.${randomUUID()}.release`;
  const child = spawnLock({
    ...process.env, GM_CLEANUP_LOCK_PATH: path, GM_CLEANUP_RELEASE_PATH: releasePath,
  });
  let output = "";
  let diagnostics = "";
  let childError;
  let spawnedAt;
  let exitedAt;
  let closedAt;
  let didClose = false;
  let markerCreated = false;
  const errors = [];
  const elapsed = () => Math.round(performance.now() - started);
  // Spawn confirms OS process creation, not PowerShell script execution or a
  // file lock. Only the existing stdout acknowledgment authorizes the action.
  child.once("spawn", () => { spawnedAt = elapsed(); });
  child.once("exit", () => { exitedAt = elapsed(); });
  const status = () => `elapsedMs=${elapsed()}, spawnedAtMs=${spawnedAt ?? "absent"}, ` +
    `exitedAtMs=${exitedAt ?? "absent"}, closedAtMs=${closedAt ?? "absent"}; ` +
    `exitCode=${child.exitCode}, signalCode=${child.signalCode}; ` +
    `stdoutEnded=${child.stdout.readableEnded}, stderrEnded=${child.stderr.readableEnded}; ` +
    `stdout=${JSON.stringify(output)}; stderr=${JSON.stringify(diagnostics)}`;
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", chunk => {
    diagnostics = (diagnostics + chunk).slice(-8_192);
  });
  const closed = new Promise(resolve => {
    child.once("close", (code, signal) => {
      closedAt = elapsed();
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
      // Only complete lines count; the unterminated tail may be a partial record.
      const lines = output.split(/\r?\n/u).slice(0, -1);
      const failedLine = lines.find(line => line.startsWith(LOCK_FAILED_PREFIX));
      const isReady = lines.includes("LOCK_READY");
      if (isReady && failedLine !== undefined) {
        reject(new Error(`lock child reported both readiness and failure: ${status()}`));
      } else if (isReady) {
        resolve({ acquired: true });
      } else if (failedLine !== undefined) {
        resolve({ acquired: false, failure: parseLockFailure(failedLine) });
      }
    });
    child.once("close", () => {
      reject(new Error(`lock child exited before readiness: ${status()}`));
    });
  });
  let acquisitionFailure;
  try {
    const outcome = await bounded(ready, 10_000, () => `Windows lock child readiness timed out: ${status()}`);
    if (outcome.acquired) {
      assert.equal(child.exitCode, null);
      assert.equal(child.signalCode, null);
      await action();
    } else {
      // The child owns no handle and never waits for the marker; the action stays unrun.
      acquisitionFailure = outcome.failure;
    }
  } catch (error) {
    errors.push(error);
  } finally {
    try {
      if (acquisitionFailure === undefined) {
        await writeFile(releasePath, "", { flag: "wx" });
        markerCreated = true;
      }
      const result = await bounded(closed, 5_000, () => `Windows lock child release timed out: ${status()}`);
      assert.ifError(childError);
      assert.equal(result.signal, null, status());
      assert.equal(result.code,
        acquisitionFailure === undefined ? 0 : LOCK_ACQUISITION_FAILED_EXIT, status());
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
  // A clean, acknowledged failed acquisition is the only expected rejection; any
  // teardown failure beside it is reported together with it.
  if (acquisitionFailure !== undefined) {
    errors.unshift(new LockAcquisitionError(acquisitionFailure, status()));
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    // Inner messages are inlined because assertion output stringifies only the wrapper.
    throw new AggregateError(errors, "Windows file lock action/readiness and teardown failed: " +
      errors.map(error => error.message).join(" | "));
  }
}

test("Windows lock helper reports failed acquisition and settles without running the action", {
  skip: process.platform !== "win32",
}, async t => {
  const directory = await mkdtemp(join(tmpdir(), "gm-lock-acquisition-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let called = false;
  await assert.rejects(withWindowsFileLock(join(directory, "missing.ts"), async () => {
    called = true;
  }), error => {
    // A timeout, early exit or teardown failure is an AggregateError or another
    // type and fails here with its nested messages in the assertion output.
    assert.ok(error instanceof LockAcquisitionError, `${error}\n${error.stack}`);
    assert.match(error.failure.type, /^System\.IO\.FileNotFoundException$/u, String(error));
    assert.match(error.message, /LOCK_OPENING/u);
    assert.doesNotMatch(error.message, /LOCK_READY/u);
    return true;
  });
  assert.equal(called, false);
  assert.deepEqual(await readdir(directory), []);
});

// Platform-neutral host protocol checks; the child below only emits the lines
// under test and holds no file lock.
const nodeLockChild = source => env => spawn(process.execPath, ["-e", source], {
  env, stdio: ["ignore", "pipe", "pipe"], timeout: 30_000,
});

test("lock host treats an acknowledged failed open as the one expected rejection", async t => {
  const directory = await mkdtemp(join(tmpdir(), "gm-lock-protocol-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let called = false;
  await assert.rejects(withWindowsFileLock(join(directory, "missing.ts"), async () => {
    called = true;
  }, nodeLockChild(`
    console.error("LOCK_OPENING");
    console.log('${LOCK_FAILED_PREFIX}' + JSON.stringify({ type: "Probe.Failure", hresult: 1, message: "nested" }));
    process.exitCode = ${LOCK_ACQUISITION_FAILED_EXIT};
  `)), error => {
    assert.ok(error instanceof LockAcquisitionError, String(error));
    assert.deepEqual(error.failure, { type: "Probe.Failure", hresult: 1, message: "nested" });
    return true;
  });
  assert.equal(called, false);
  assert.deepEqual(await readdir(directory), []);
});

test("lock host still rejects a child that exits before any acknowledgment", async t => {
  const directory = await mkdtemp(join(tmpdir(), "gm-lock-protocol-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let called = false;
  await assert.rejects(withWindowsFileLock(join(directory, "missing.ts"), async () => {
    called = true;
  }, nodeLockChild(`
    console.error("LOCK_OPENING");
    process.exitCode = ${LOCK_ACQUISITION_FAILED_EXIT};
  `)), error => {
    assert.equal(error instanceof LockAcquisitionError, false);
    assert.match(String(error.message), /lock child exited before readiness:/u);
    return true;
  });
  assert.equal(called, false);
  assert.deepEqual(await readdir(directory), []);
});

test("lock host rejects a failed-open acknowledgment with an unexpected exit code", async t => {
  const directory = await mkdtemp(join(tmpdir(), "gm-lock-protocol-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await assert.rejects(withWindowsFileLock(join(directory, "missing.ts"), async () => {},
    nodeLockChild(`
      console.log('${LOCK_FAILED_PREFIX}' + JSON.stringify({ type: "Probe.Failure" }));
      process.exitCode = 0;
    `)), error => {
    assert.ok(error instanceof AggregateError, String(error));
    assert.ok(error.errors[0] instanceof LockAcquisitionError);
    assert.match(error.message, /exitCode=0/u);
    return true;
  });
  assert.deepEqual(await readdir(directory), []);
});

test("Windows lock helper releases its real handle and marker after an action failure", {
  skip: process.platform !== "win32",
}, async t => {
  const directory = await mkdtemp(join(tmpdir(), "gm-lock-release-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "owned.ts");
  await writeFile(path, "owned fixture\n");
  const actionError = new Error("owned action failure");
  await assert.rejects(withWindowsFileLock(path, async () => {
    await assert.rejects(rm(path), error => {
      assert.ok(["EPERM", "EACCES", "EBUSY"].includes(error.code), String(error));
      return true;
    });
    throw actionError;
  }), error => error === actionError);
  assert.equal(await readFile(path, "utf8"), "owned fixture\n");
  await rm(path);
  assert.deepEqual(await readdir(directory), []);
});

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
