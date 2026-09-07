import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  createGeneratedProductionReader,
  GENERATED_PRODUCTION_PATH,
  verifySnapshotInputs,
} from "../architecture/checks/generated-production-source.mjs";
import { captureGitIndexSnapshot } from "../architecture/checks/tracked-file-custody.mjs";

const source = Buffer.from("// digest: exact\nexport const root = {};\n");

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "gm-generated-source-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, GENERATED_PRODUCTION_PATH);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, source);
  return { root, path };
}

test("reader admits only fresh exact bytes and retains no mutable aliases", async t => {
  const { root, path } = await fixture(t);
  const expected = Buffer.from(source);
  const read = createGeneratedProductionReader(root, expected);
  expected.fill(0);
  const first = await read(GENERATED_PRODUCTION_PATH);
  assert.deepEqual(first, source);
  first.fill(0);
  assert.deepEqual(await read(GENERATED_PRODUCTION_PATH), source);
  for (const candidate of [
    path, "../stage1.ts", `${GENERATED_PRODUCTION_PATH}.variant`,
    "packages/core/src/composition/stage0.ts",
  ]) await assert.rejects(read(candidate), /path is not/u);
  await writeFile(path, source.toString().replace("exact", "other"));
  await assert.rejects(read(GENERATED_PRODUCTION_PATH), /bytes differ/u);
  await rm(path);
  await assert.rejects(read(GENERATED_PRODUCTION_PATH), { code: "ENOENT" });
  await mkdir(path);
  await assert.rejects(read(GENERATED_PRODUCTION_PATH), /regular file/u);
});

test("reader rejects leaf and ancestor symlinks even with identical bytes", async t => {
  const { root, path } = await fixture(t);
  const read = createGeneratedProductionReader(root, source);
  const target = join(root, "target.ts");
  await writeFile(target, source);
  await rm(path);
  await symlink(target, path);
  await assert.rejects(read(GENERATED_PRODUCTION_PATH), /regular file/u);
  await rm(path);
  const directory = dirname(path);
  const moved = `${directory}-moved`;
  await rename(directory, moved);
  await writeFile(join(moved, "stage1.ts"), source);
  await symlink(moved, directory, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(read(GENERATED_PRODUCTION_PATH), /regular file/u);
});

test("snapshot verification rejects authored bytes, authority and index drift", async t => {
  const { root } = await fixture(t);
  const environment = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => !key.startsWith("GIT_")));
  const git = (...args) => execFileSync("git", args, {
    cwd: root,
    env: {
      ...environment,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    },
    stdio: "pipe",
  });
  git("init");
  const authority = "authority.json";
  await writeFile(join(root, authority), '{"accepted":true}\n');
  git("add", "--", authority);
  const snapshot = await captureGitIndexSnapshot(root);
  await verifySnapshotInputs(snapshot, [authority]);
  await writeFile(join(root, authority), '{"accepted":false}\n');
  await assert.rejects(verifySnapshotInputs(snapshot, [authority]), /working-tree-diverged/u);
  git("add", "--", authority);
  await assert.rejects(verifySnapshotInputs(snapshot, [authority]), /index changed/u);
  const current = await captureGitIndexSnapshot(root);
  await writeFile(join(root, "untracked.ts"), "export {};\n");
  await assert.rejects(verifySnapshotInputs(current, ["untracked.ts"]), /untracked/u);
  git("add", "--", GENERATED_PRODUCTION_PATH);
  const indexedGenerated = await captureGitIndexSnapshot(root);
  await assert.rejects(verifySnapshotInputs(indexedGenerated, []), /must not have an index entry/u);
});

test("importing the build module does not start generation", async () => {
  const module = await import("../architecture/tooling/build-core.mjs");
  assert.equal(typeof module.buildCore, "function");
});
