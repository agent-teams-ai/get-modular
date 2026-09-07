import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { cp, lstat, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
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

test("governance cleans successful build outputs when completion detects source drift", async t => {
  const exec = promisify(execFile);
  const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
  const directory = await mkdtemp(join(tmpdir(), "gm-governance-completion-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, "repository");
  const environment = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => !key.startsWith("GIT_")));
  const env = {
    ...environment,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_SYSTEM: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
  };
  await exec("git", ["clone", "--quiet", "--no-hardlinks", repositoryRoot, root], { env });
  // Exercise current checkers and build tooling, including uncommitted fixes.
  for (const path of ["architecture/checks", "architecture/tooling"]) {
    await cp(join(repositoryRoot, path), join(root, path), {
      recursive: true,
      force: true,
    });
  }
  await symlink(join(repositoryRoot, "node_modules"), join(root, "node_modules"), "junction");
  const governancePath = join(root, "architecture/checks/governance.mjs");
  const governance = await readFile(governancePath, "utf8");
  const completionLoop = "for (const path of observedInputs) {";
  assert.equal(governance.split(completionLoop).length, 2);
  const driftPath = "packages/core/self-composition/own-profile.ts";
  const marker = "fixture: successful build before completion drift";
  // This hook exists only in the staged disposable copy. Reading both outputs
  // proves the failure follows a successful build without a background race.
  const hook = [
    'const fixtureFs = await import("node:fs/promises");',
    `await fixtureFs.readFile(resolve(root, ${JSON.stringify(GENERATED_PRODUCTION_PATH)}));`,
    'await fixtureFs.readFile(resolve(root, "packages/core/dist/index.js"));',
    `await fixtureFs.appendFile(resolve(root, ${JSON.stringify(driftPath)}), "\\n// completion drift\\n");`,
    `process.stdout.write(${JSON.stringify(`${marker}\n`)});`,
    completionLoop,
  ].join("\n");
  await writeFile(governancePath, governance.replace(completionLoop, hook));
  await exec("git", ["add", "--", "architecture/checks", "architecture/tooling"], {
    cwd: root, env,
  });
  await assert.rejects(
    exec(process.execPath, ["architecture/checks/governance.mjs"], {
      cwd: root, env, maxBuffer: 4 * 1024 * 1024,
    }),
    error => {
      assert.equal(error.code, 1);
      assert.ok(error.stdout.includes(marker), error.stdout);
      assert.match(error.stderr, /TRACKED_FILE_CUSTODY_FAILED/u);
      assert.ok(error.stderr.includes(`${driftPath} (working-tree-diverged)`), error.stderr);
      return true;
    },
  );
  for (const path of [GENERATED_PRODUCTION_PATH, "packages/core/dist/index.js"]) {
    await assert.rejects(lstat(join(root, path)), { code: "ENOENT" });
  }
});
