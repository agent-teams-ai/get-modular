// Development-only replay of frozen fixtures against their historical witnesses.
// Current Core tests still execute current builds; no historical Core is built.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { gunzipSync } from "node:zlib";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
const root = new URL("../../", import.meta.url);
const archivePath = "architecture/qualification/generation-two/retained-object-descriptor-source.json.gz";
const archiveDigest = "49913af1d06f5c24afdeb72c8b434a31d3c718073d404344765ba54f2b0192b6";
const ledgerPath = "architecture/authority/diagnostic-generation-two-ledger.json";
const ledgerDigest = "3781993b5714d8f8928ca2a2082353f93bc42b0e69a3373bd9cfaa41963f7f61";
const paths = [
  "tests/qualification/m2-candidate/object-descriptor-cases.test.mjs",
  "tests/qualification/m2-candidate/object-descriptor-cases.mjs",
  "architecture/qualification/v1/normalization-vectors.json",
  "docs/decisions/0013-close-trusted-object-and-raw-carrier-semantics.md",
  "docs/decisions/0018-close-implementation-readiness-rules.md",
  "docs/decisions/0020-define-diagnostic-coverage-outside-object-resource-admission.md",
  "architecture/contracts/v1/composition.schema.json",
  "architecture/qualification/v1/diagnostic-contract.json",
  "packages/core/tests/features/input-admission/object-resource-meter.test.mjs",
  "packages/core/tests/features/input-admission/document-shape.test.mjs",
  "packages/core/tests/features/input-admission/document-snapshot.test.mjs",
  "packages/core/tests/features/input-admission/object-admission.test.mjs"
];
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

export function unpackDescriptorSource(bytes) {
  assert.equal(digest(bytes), archiveDigest, "historical descriptor source archive identity");
  const source = JSON.parse(gunzipSync(bytes, { maxOutputLength: 2 * 1024 * 1024 }).toString("utf8"));
  assert.equal(source.source, "0b20ee7227644d098ae59c5b6f27cba8f0a4a5fb");
  assert.equal(source.tree, "1abcc0b870d90bdb3156980afaa72040c2b593ca");
  assert.deepEqual(source.files.map(row => row.path), paths);
  const files = new Map();
  for (const row of source.files) {
    const content = Buffer.from(row.bytesBase64, "base64");
    assert.equal(content.toString("base64"), row.bytesBase64);
    files.set(row.path, content);
  }
  return files;
}

export async function replayDescriptorFixture(readBytes = path => readFile(new URL(path, root))) {
  const files = unpackDescriptorSource(await readBytes(archivePath));
  const ledgerBytes = await readBytes(ledgerPath);
  assert.equal(digest(ledgerBytes), ledgerDigest, "accepted generation-two ledger identity");
  const ledger = JSON.parse(ledgerBytes.toString("utf8"));
  // Never silently replace a changed current immutable recipe/runner. The live
  // ownership tests are deliberately not read here: their historical versions
  // are input evidence for this frozen oracle, not current Core execution.
  for (const path of paths.slice(0, 2)) {
    const entry = ledger.artifacts.find(row => row.path === path);
    assert.ok(entry, path);
    const current = await readBytes(path);
    assert.equal(`sha256:${digest(current)}`, entry.immutableDigest, path);
    assert.deepEqual(files.get(path), current, path);
  }
  const directory = await mkdtemp(join(tmpdir(), "gm-retained-descriptor-"));
  try {
    for (const [path, bytes] of files) {
      const target = join(directory, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes, { flag: "wx" });
    }
    const environment = { ...process.env };
    delete environment.NODE_OPTIONS;
    delete environment.NODE_TEST_CONTEXT;
    const result = await execute(process.execPath, ["--test", paths[0]], {
      cwd: directory, env: environment, timeout: 30_000, maxBuffer: 16 * 1024 * 1024,
    });
    return { scope: "fresh-replay-of-historical-fixture", coreExecuted: false, stdout: result.stdout };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
