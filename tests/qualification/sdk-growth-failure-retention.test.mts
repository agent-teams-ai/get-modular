import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { retainSdkGrowthFailure } from "./sdk-growth-failure-retention.mts";

const execute = promisify(execFile);
const sha = "8fc8242049442a6c8838146b92dc1cb029ff8280";
const secret = "SYNTHETIC-SECRET-never-retain";
const report = { schemaVersion: 1, capabilities: [{ capabilityId: "package.public-api-compatibility",
  outcome: "failed", problem: { code: "UNEXPECTED_PROCESS_FAILURE", retryable: false, message: secret },
  evidence: { grant: secret }, diagnostics: [secret] }], env: secret };
async function fixture(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "sdk-retention-TEST-"));
  try { await run(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}
const destination = (directory: string) => ({ directory, artifact: join(directory, "sdk-growth-failure.json"),
  checkoutSha: sha, producerVersion: "1.7.2" });
const bytes = (directory: string) => readFile(destination(directory).artifact, "utf8");
async function invocation(directory: string, stdout: string, exit: number): Promise<unknown> {
  await writeFile(join(directory, "command.mjs"),
    `process.stdout.write(${JSON.stringify(stdout)}); process.stderr.write(${JSON.stringify(secret)}); process.exit(${exit});`);
  try { return await execute(process.execPath, [join(directory, "command.mjs")]); }
  catch (error) { return error; }
}

// Regression: cleanup used to erase the only report after the real child exit 3.
test("unexpected invocation retains exact selected bytes before fixture removal; no message admission", async () => {
  await fixture(async directory => {
    const invocationRoot = join(directory, "fixture");
    await mkdir(invocationRoot);
    const result = await invocation(invocationRoot, JSON.stringify(report), 3);
    await retainSdkGrowthFailure(result, destination(directory));
    await rm(invocationRoot, { recursive: true, force: true });
    assert.equal(await bytes(directory), JSON.stringify({ checkoutSha: sha, nodeVersion: process.version,
      capabilityId: "package.public-api-compatibility", producer: {
        package: "@agent-teams/engineering-foundation", version: "1.7.2",
        integrity: "sha512-2wmq4g8rWgXQ2qBVY2Tb7HVP9LFsuBAUMcDhgCqixLA0RA9H3OrwXy7b7jK2gS6SggK9XCplNb03mVLR2EyzRg==",
      }, exit: 3, transportStatus: "exit", messageOmission: "producer-safety-not-admitted",
      reportStatus: "selected", publicCapability: { outcome: "failed", code: "UNEXPECTED_PROCESS_FAILURE", retryable: false },
    }) + "\n");
  });
});
// Regression: retaining every captured report would create artifacts for expected exit 2.
test("expected invocation and disabled destination leave no artifact", async () => {
  await fixture(async directory => {
    await retainSdkGrowthFailure(await invocation(directory, JSON.stringify(report), 2), destination(directory));
    await retainSdkGrowthFailure({ code: 3, stdout: JSON.stringify(report) }, { ...destination(directory), artifact: undefined });
    await assert.rejects(bytes(directory), { code: "ENOENT" });
  });
});
// Regression: raw stdout, unknown codes, fields or huge arrays could leak arbitrary text.
test("malformed, oversized, spoofed and unknown-field reports remain bounded", async () => {
  const spoofed = structuredClone(report);
  spoofed.capabilities[0]!.problem.code = secret;
  spoofed.capabilities[0]!.outcome = secret;
  for (const [stdout, status] of [[secret, "malformed"], [secret.repeat(2000), "oversized"],
    ["", "missing"], [JSON.stringify({ ...report, capabilities: Array(2000).fill(secret) }), "oversized"],
    [JSON.stringify({ ...report, capabilities: [report.capabilities[0], report.capabilities[0]] }), "malformed"],
    [JSON.stringify({ ...report, capabilities: [{ ...report.capabilities[0], problem: { code: secret, retryable: secret } }] }), "malformed"],
    [JSON.stringify({ ...report, schemaVersion: 2 }), "malformed"], [JSON.stringify(spoofed), "selected"]] as const) {
    await fixture(async directory => {
      await retainSdkGrowthFailure(await invocation(directory, stdout, 3), destination(directory));
      const retained = await bytes(directory);
      assert.equal(JSON.parse(retained).reportStatus, status);
      assert(!retained.includes(secret));
      assert(Buffer.byteLength(retained) <= 32 * 1024);
      if (status === "selected") assert.deepEqual(JSON.parse(retained).publicCapability, { retryable: false });
      else assert.equal(JSON.parse(retained).publicCapability, undefined);
    });
  }
});
// Regression: inferring a numeric exit from signal/timeout or reading stdout getters fabricates facts.
test("metadata fallbacks never fabricate exits or execute observation getters", async () => {
  await fixture(async directory => {
    for (const [source, options, status] of [
      ["setInterval(() => {}, 1000)", { timeout: 100 }, "timeout"],
      ['process.kill(process.pid, "SIGTERM")', {}, process.platform === "win32" ? "exit" : "signal"],
      ['process.stdout.write("x".repeat(4096)); setInterval(() => {}, 1000)', { maxBuffer: 8 }, "buffer-limit"],
    ] as const) {
      await writeFile(join(directory, "transport.mjs"), source);
      let observed: unknown;
      try { observed = await execute(process.execPath, [join(directory, "transport.mjs")], options); }
      catch (error) { observed = error; }
      await retainSdkGrowthFailure(observed, destination(directory));
      const retained = JSON.parse(await bytes(directory));
      assert.equal(retained.transportStatus, status);
      assert.equal(retained.exit, status === "exit" ? 1 : undefined);
      assert.equal(retained.publicCapability, undefined);
      await rm(destination(directory).artifact);
    }
  });
  for (const [result, status] of [[{ killed: true, signal: "SIGTERM" }, "timeout"],
    [{ signal: "SIGTERM" }, "signal"], [{ code: "ENOENT" }, "unavailable"], [{ code: NaN }, "unavailable"]] as const) {
    await fixture(async directory => {
      let calls = 0;
      const observed = { ...result, get stdout() { calls++; throw new Error(secret); } };
      await retainSdkGrowthFailure(observed, destination(directory));
      const retained = JSON.parse(await bytes(directory));
      assert.equal(retained.transportStatus, status);
      assert.equal(retained.exit, undefined);
      assert.equal(calls, 0);
      await rm(destination(directory).artifact);
      await retainSdkGrowthFailure({ ...result, stdout: JSON.stringify(report) }, destination(directory));
      assert.equal(JSON.parse(await bytes(directory)).publicCapability, undefined);
    });
  }
});
// Regression: overwrite, link following, escaping the directory or IO rejection could replace the primary failure.
test("exclusive creation and invalid destinations preserve the primary assertion object", async () => {
  for (const mode of ["collision", "symlink", "missing-directory", "outside", "bad-sha", "wrong-producer"] as const) {
    await fixture(async directory => {
      const target = destination(directory);
      const sentinel = join(directory, "sentinel.json");
      await writeFile(sentinel, "untouched");
      if (mode === "collision") await writeFile(target.artifact, "untouched");
      if (mode === "symlink") await symlink(sentinel, target.artifact);
      if (mode === "missing-directory") target.directory = join(directory, "absent");
      if (mode === "outside") target.artifact = join(directory, "..", "sdk-growth-failure.json");
      if (mode === "bad-sha") target.checkoutSha = secret;
      if (mode === "wrong-producer") target.producerVersion = "9.0.0";
      const result = await invocation(directory, JSON.stringify(report), 3);
      let primary: unknown;
      try { assert.equal(3, 2); } catch (error) { primary = error; }
      await assert.rejects(async () => { await retainSdkGrowthFailure(result, target); throw primary; },
        error => error === primary);
      const driver = join(directory, "retention.mts");
      await writeFile(driver, `import assert from "node:assert/strict";
import { retainSdkGrowthFailure } from ${JSON.stringify(new URL("./sdk-growth-failure-retention.mts", import.meta.url).href)};
let primary; try { assert.equal(3, 2); } catch (error) { primary = error; }
await retainSdkGrowthFailure({ code: 3, stdout: ${JSON.stringify(JSON.stringify(report))} }, ${JSON.stringify(target)});
try { throw primary; } catch (error) { assert.equal(error, primary); }
`);
      const captured = await execute(process.execPath, [driver]);
      assert.equal(captured.stderr, "sdk-growth-retention-failed\n");
      assert.equal(captured.stdout, "");
      assert.equal(await readFile(sentinel, "utf8"), "untouched");
      if (mode === "collision" || mode === "symlink") assert.equal(await bytes(directory), "untouched");
      else await assert.rejects(bytes(directory), { code: "ENOENT" });
    });
  }
});
