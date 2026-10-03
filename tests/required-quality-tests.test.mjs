import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execute = promisify(execFile);
// Inherit the real test parent context; the public CLI owns standalone startup.
const require = createRequire(import.meta.url);
const manifestPath = require.resolve("@agent-teams/engineering-foundation/package.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
assert.equal(typeof manifest.bin["agent-teams-node-test"], "string");
const cli = join(dirname(manifestPath), manifest.bin["agent-teams-node-test"]);
const checker = resolve("architecture/checks/required-quality-tests.mjs");
const identity = { file: "critical.test.mjs", names: ["required completion"], kind: "test" };
const ordinary = 'import test from "node:test"; import assert from "node:assert/strict";\ntest("required completion", async () => { assert.equal(await Promise.resolve(42), 42); });\n';

async function run(executable, args, cwd) {
  try {
    const result = await execute(executable, args, { cwd, env: process.env, timeout: 30000, maxBuffer: 2000000 });
    return { exit: 0, text: result.stdout + result.stderr };
  } catch (error) {
    assert.equal(error.killed, false, String(error));
    assert.equal(typeof error.code, "number", String(error));
    return { exit: error.code, text: error.stdout + error.stderr };
  }
}

async function withFixture(body) {
  const root = await mkdtemp(join(tmpdir(), "gm-required-node-test-"));
  try {
    await writeFile(join(root, "package.json"), '{"type":"module"}\n');
    const contract = { schemaVersion: 1, required: [identity], exceptions: [] };
    const invoke = async (source = ordinary, exception = undefined) => {
      await writeFile(join(root, identity.file), source);
      await writeFile(join(root, "contract.json"), JSON.stringify({ ...contract,
        exceptions: exception === undefined ? [] : [exception] }));
      return run(process.execPath, [cli, "--contract", "contract.json", "--", identity.file], root);
    };
    await body({ root, invoke });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("installed mandatory Node runner requires actual identity completion", async () => {
  await withFixture(async ({ invoke }) => {
    const completed = await invoke();
    assert.equal(completed.exit, 0, completed.text);
    assert.match(completed.text, /1 required identities completed/u);
    for (const [status, source] of [
      ["omitted", 'import test from "node:test"; test("different identity", () => {});'],
      ["skipped", 'import test from "node:test"; test("required completion", { skip: true }, () => {});'],
      ["todo", 'import test from "node:test"; test("required completion", { todo: true }, () => {});'],
    ]) {
      const rejected = await invoke(source);
      assert.notEqual(rejected.exit, 0, rejected.text);
      assert.match(rejected.text, new RegExp(`required execution failed:.*${status}`, "u"));
    }
    const lateFailure = await invoke('import test from "node:test"; import assert from "node:assert/strict"; test("required completion", async () => { await Promise.resolve(); assert.fail("late failure"); });');
    assert.notEqual(lateFailure.exit, 0, lateFailure.text);
  });
});

test("installed mandatory Node runner permits only the exact OS exception", async () => {
  await withFixture(async ({ invoke }) => {
    // This fixture exercises a Windows-only test entry; POSIX cannot qualify
    // its Windows precondition. The real consumer inventory has no exceptions.
    const source = 'import test from "node:test"; import assert from "node:assert/strict"; import { stat } from "node:fs/promises"; import { win32 } from "node:path"; test("required completion", { skip: process.platform !== "win32" }, async () => { assert.ok(win32.parse(process.execPath).root.length > 1); assert.ok((await stat(process.execPath)).isFile()); });';
    const exception = { ...identity, status: "skipped", reason: "The native Windows executable root needs Win32 filesystem semantics.",
      applicability: { platforms: ["linux", "darwin"] } };
    const accepted = await invoke(source, exception);
    assert.equal(accepted.exit, 0, accepted.text);
    const wrongStatus = await invoke(source, { ...exception, status: "omitted" });
    if (process.platform !== "win32") assert.notEqual(wrongStatus.exit, 0, wrongStatus.text);
    const wrongOs = await invoke(source, { ...exception, applicability: { platforms: ["win32"] } });
    if (process.platform !== "win32") assert.notEqual(wrongOs.exit, 0, wrongOs.text);
    const blanket = await invoke(source, { ...exception, applicability: { platforms: ["linux", "darwin", "win32"] } });
    assert.notEqual(blanket.exit, 0, blanket.text);
    const wrongIdentity = await invoke(source, { ...exception, names: ["unrelated test"] });
    assert.notEqual(wrongIdentity.exit, 0, wrongIdentity.text);
  });
});

test("consumer rejects dropping an entire selected file or required identity", async () => {
  await withFixture(async ({ root }) => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8"));
    const contractPath = "architecture/foundation/required-quality-tests.json";
    const contract = await readFile(contractPath, "utf8");
    await mkdir(join(root, dirname(contractPath)), { recursive: true });
    await writeFile(join(root, contractPath), contract);
    await writeFile(join(root, "package.json"), JSON.stringify(packageJson));
    const bound = await run(process.execPath, [checker], root);
    assert.equal(bound.exit, 0, bound.text);
    packageJson.scripts["quality:critical:test"] = packageJson.scripts["quality:critical:test"]
      .replace(" tests/quality-activation.test.mjs", "");
    await writeFile(join(root, "package.json"), JSON.stringify(packageJson));
    const removedFile = await run(process.execPath, [checker], root);
    assert.notEqual(removedFile.exit, 0, removedFile.text);
    assert.match(removedFile.text, /mandatory file selection/u);
    packageJson.scripts["quality:critical:test"] = JSON.parse(await readFile("package.json", "utf8")).scripts["quality:critical:test"];
    await writeFile(join(root, "package.json"), JSON.stringify(packageJson));
    const narrowed = JSON.parse(contract);
    narrowed.required.pop();
    await writeFile(join(root, contractPath), JSON.stringify(narrowed));
    const removedIdentity = await run(process.execPath, [checker], root);
    assert.notEqual(removedIdentity.exit, 0, removedIdentity.text);
    assert.match(removedIdentity.text, /reviewed required identities/u);
  });
});
