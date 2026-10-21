import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { captureGitIndexSnapshot, readIndexSnapshotFile, assertTrackedWorkspaceMatchesHead } from "../architecture/checks/tracked-file-custody.mjs";
import { productionArtifactPaths } from "../architecture/checks/production-artifacts.mjs";
import { readRuntimeIndexSnapshotFile, verifyRuntimeWorkspace } from "../architecture/tooling/runtime/projection-custody.ts";
import { markerPath, project, projectionPaths } from "../architecture/tooling/runtime/policy.ts";

const repository = resolve(import.meta.dirname, "..");
const environment = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
  GIT_AUTHOR_NAME: "iliya", GIT_AUTHOR_EMAIL: "iliyazelenkog@gmail.com",
  GIT_COMMITTER_NAME: "iliya", GIT_COMMITTER_EMAIL: "iliyazelenkog@gmail.com" };
function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { env: environment, encoding: "utf8" }).trimEnd();
}
async function put(root: string, path: string, value: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), value);
}
async function fixture(body: (root: string) => Promise<void>): Promise<void> {
  const temporary = await mkdtemp(join(tmpdir(), "gm-projection-custody-TEST-"));
  const source = join(temporary, "source"), target = join(temporary, "node");
  try {
    await put(source, "package.json", JSON.stringify({ private: true, type: "module", packageManager: "bun@1.4.3",
      engines: { bun: "1.4.3" }, trustedDependencies: [], workspaces: { packages: [], catalog: {} } }) + "\n");
    await put(source, ".gitignore", "node_modules/\n.get-modular-node-profile.json\n");
    await put(source, "ordinary.txt", "owned\n");
    await put(source, "architecture/foundation/repository-agent-workflow.yaml", "schemaVersion: 2\npackageManager: bun\n");
    await put(source, "architecture/foundation/dependency-declarations.yaml", "schemaVersion: 2\npackageManager:\n  kind: bun\n");
    for (const path of ["architecture/tooling/runtime/policy.ts", "architecture/tooling/runtime/dev.ts",
      "architecture/tooling/runtime/command.ts", "architecture/tooling/runtime/projection-custody.ts",
      "architecture/checks/tracked-file-custody.mjs", "architecture/checks/node-version.mjs"]) {
      await mkdir(dirname(join(source, path)), { recursive: true });
      await copyFile(join(repository, path), join(source, path));
    }
    git(source, "init", "--initial-branch=main"); git(source, "add", "--all"); git(source, "commit", "-m", "test: projection custody source");
    execFileSync(process.execPath, ["architecture/tooling/runtime/dev.ts", "prepare-node", target], { cwd: source, env: environment });
    await body(target);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

test("Node profile reads authenticate the exact three projections while default custody stays strict", async () => {
  await fixture(async root => {
    const snapshot = await captureGitIndexSnapshot(root);
    const source = JSON.parse(await readFile(join(root, markerPath), "utf8")).source as string;
    const sourceSnapshot = await captureGitIndexSnapshot(source);
    assert.deepEqual(await readRuntimeIndexSnapshotFile(sourceSnapshot, "package.json", "ordinary source"),
      await readIndexSnapshotFile(sourceSnapshot, "package.json", "strict source"));
    await verifyRuntimeWorkspace(source);
    const before = await Promise.all(projectionPaths.map(path => readFile(join(root, path))));
    await assert.rejects(readIndexSnapshotFile(snapshot, "package.json", "strict manifest"), /working-tree-diverged/u);
    await assert.rejects(assertTrackedWorkspaceMatchesHead(root), /working-tree bytes/u);
    for (const [index, path] of projectionPaths.entries()) {
      assert.deepEqual(await readRuntimeIndexSnapshotFile(snapshot, path, "Host representation"), before[index]);
    }
    await productionArtifactPaths(root, snapshot);
    await verifyRuntimeWorkspace(root, git(root, "rev-parse", "HEAD"));
    assert.deepEqual(await Promise.all(projectionPaths.map(path => readFile(join(root, path)))), before);
    assert.equal(git(root, "diff", "--cached", "--name-only"), "", "the real index is never rewritten");
    await writeFile(join(root, "ordinary.txt"), "drift\n");
    await assert.rejects(readRuntimeIndexSnapshotFile(snapshot, "ordinary.txt", "ordinary authority"), /working-tree-diverged/u);
    await assert.rejects(verifyRuntimeWorkspace(root), /working-tree bytes/u);
  });
});

test("Node profile custody rejects forged marker, HEAD, index and derivation inputs", async () => {
  await fixture(async root => {
    const snapshot = await captureGitIndexSnapshot(root);
    const marker = await readFile(join(root, markerPath), "utf8");
    const original = JSON.parse(marker);
    await assert.rejects(readRuntimeIndexSnapshotFile({ ...snapshot, headTreeOid: "0".repeat(40) },
      "package.json", "forged snapshot"), /snapshot-head-drift/u);
    for (const mutation of [{ ...original, root: original.source }, { ...original, source: join(root, "absent") },
      { ...original, commit: "0".repeat(40) },
      { ...original, extraProjection: "ordinary.txt" }]) {
      await writeFile(join(root, markerPath), JSON.stringify(mutation));
      await assert.rejects(readRuntimeIndexSnapshotFile(snapshot, "package.json", "forged marker"));
    }
    await writeFile(join(root, markerPath), marker);
    if (process.platform !== "win32") {
      await rm(join(root, markerPath));
      await put(root, "marker-target.json", marker);
      await symlink("marker-target.json", join(root, markerPath));
      await assert.rejects(readRuntimeIndexSnapshotFile(snapshot, "package.json", "marker symlink"), /marker-not-regular/u);
      await rm(join(root, markerPath)); await writeFile(join(root, markerPath), marker);
    }
    for (const path of projectionPaths) {
      const bytes = await readFile(join(root, path));
      await writeFile(join(root, path), Buffer.concat([bytes, Buffer.from(" ")]));
      await assert.rejects(readRuntimeIndexSnapshotFile(snapshot, "package.json", "derived drift"), /runtime.projection.drift/u);
      await writeFile(join(root, path), bytes);
    }
    git(root, "add", "package.json");
    await assert.rejects(readRuntimeIndexSnapshotFile(snapshot, "package.json", "index changed"), /Git index changed/u);
    const staged = await captureGitIndexSnapshot(root);
    await assert.rejects(readRuntimeIndexSnapshotFile(staged, "package.json", "staged projection"), /source-index-drift/u);
    git(root, "reset", "--mixed", "HEAD");
    git(root, "commit", "--allow-empty", "-m", "test: unexpected HEAD");
    await assert.rejects(readRuntimeIndexSnapshotFile(snapshot, "package.json", "HEAD changed"), /wrong-root/u);
  });
});

test("authenticated projection verification retains two-pass race and duplicate-record rejection", async () => {
  await fixture(async root => {
    const records = projectionPaths.map(path => {
      const sourceBytes = execFileSync("git", ["-C", root, "show", `HEAD:${path}`], { env: environment });
      return { path, sourceOid: git(root, "rev-parse", `HEAD:${path}`), sourceBytes,
        projectedBytes: Buffer.from(project(path, sourceBytes.toString("utf8"))) };
    });
    await assert.rejects(assertTrackedWorkspaceMatchesHead(root, {
      workingTreeProjections: [...records, records[0]!],
    }), /invalid source projection/u);
    await assert.rejects(assertTrackedWorkspaceMatchesHead(root, {
      workingTreeProjections: records,
      afterFirstPass: () => { git(root, "add", "package.json"); },
    }), /Git index changed/u);
    git(root, "reset", "--mixed", "HEAD");
    await assert.rejects(assertTrackedWorkspaceMatchesHead(root, {
      workingTreeProjections: records,
      afterFirstPass: () => writeFile(join(root, "ordinary.txt"), "changed between passes\n"),
    }), /working-tree bytes/u);
  });
});

test("Node profile custody rejects nonregular paths, mode changes and generic forged projections", async () => {
  await fixture(async root => {
    const snapshot = await captureGitIndexSnapshot(root);
    const path = join(root, "package.json"), bytes = await readFile(path);
    await rm(path); await mkdir(path);
    await assert.rejects(readRuntimeIndexSnapshotFile(snapshot, "package.json", "directory"), /runtime.projection.drift/u);
    await rm(path, { recursive: true }); await writeFile(path, bytes);
    if (process.platform !== "win32") {
      await chmod(path, 0o755);
      await assert.rejects(readRuntimeIndexSnapshotFile(snapshot, "package.json", "mode"), /runtime.projection.drift/u);
      git(root, "update-index", "--chmod=+x", "package.json");
      const stagedMode = await captureGitIndexSnapshot(root);
      await assert.rejects(readRuntimeIndexSnapshotFile(stagedMode, "package.json", "staged mode"), /source-index-drift/u);
      git(root, "reset", "--mixed", "HEAD");
      await chmod(path, 0o644);
      await rm(path); await symlink("ordinary.txt", path);
      await assert.rejects(readRuntimeIndexSnapshotFile(snapshot, "package.json", "symlink"), /runtime.projection.drift/u);
      await rm(path); await writeFile(path, bytes);
    }
    await assert.rejects(assertTrackedWorkspaceMatchesHead(root, { workingTreeProjections: [{
      path: "ordinary.txt", sourceOid: "0".repeat(40), sourceBytes: Buffer.from("owned\n"), projectedBytes: Buffer.from("drift\n"),
    }] }), /invalid source projection/u);
  });
});
