import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  assertGitIndexSnapshotCurrent, assertTrackedWorkspaceMatchesHead, captureGitIndexSnapshot,
  historicalFileVersions, inspectIndexSnapshotFile, readIndexSnapshotFile,
  inspectAcceptedAuthorityFile, readAcceptedAuthorityFile, parseBlobBatchOutput, readBlobBatch,
} from "../architecture/checks/tracked-file-custody.ts";

const execFileAsync = promisify(execFile);
const git = (cwd: string, ...args: string[]) => execFileAsync("git", args, { cwd });
async function initFixtureRepository(fixture: string): Promise<void> {
  await git(fixture, "init", "--quiet", "--initial-branch=main");
  await git(fixture, "config", "user.email", "fixture@example.invalid");
  await git(fixture, "config", "user.name", "Fixture");
  await git(fixture, "config", "commit.gpgsign", "false");
}

test("index snapshot custody rejects staged file-mode changes for an empty file", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "get-modular-index-mode-"));
  try {
    await initFixtureRepository(fixture);
    await writeFile(join(fixture, "tracked.txt"), "");
    await git(fixture, "add", "--", "tracked.txt");
    const snapshot = await captureGitIndexSnapshot(fixture);

    await git(fixture, "update-index", "--chmod=+x", "--", "tracked.txt");
    await assert.rejects(
      assertGitIndexSnapshotCurrent(snapshot),
      /TRACKED_FILE_CUSTODY_FAILED: Git index changed after snapshot/u,
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("historical file custody rejects a shallow repository witness", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "get-modular-shallow-history-"));
  const clonePath = join(fixture, "clone");
  try {
    await execFileAsync("git", [
      "clone",
      "--quiet",
      "--depth=1",
      "--no-local",
      resolve("."),
      clonePath,
    ]);
    await assert.rejects(
      historicalFileVersions("AGENTS.md", clonePath),
      /complete non-shallow Git history/u,
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("accepted authority custody rejects intent-to-add index entries", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "get-modular-intent-to-add-"));
  try {
    await execFileAsync("git", ["init", "--quiet"], { cwd: fixture });
    await writeFile(join(fixture, "intent [1].json"), "unstaged intent bytes\n");
    await execFileAsync("git", ["add", "--intent-to-add", "--", "intent [1].json"], {
      cwd: fixture,
    });

    assert.deepEqual(await inspectAcceptedAuthorityFile("intent [1].json", fixture), {
      kind: "intent-to-add",
    });
    await assert.rejects(
      readAcceptedAuthorityFile("intent [1].json", fixture, "accepted artifact"),
      /TRACKED_FILE_CUSTODY_FAILED.*intent-to-add/u,
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("index snapshot custody distinguishes intent-to-add from staged empty files", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "get-modular-snapshot-intent-"));
  try {
    await initFixtureRepository(fixture);
    await writeFile(join(fixture, "regular.txt"), "regular index bytes\n");
    await writeFile(join(fixture, "intent.txt"), "unstaged intent bytes\n");
    await writeFile(join(fixture, "empty.txt"), "");
    await git(fixture, "add", "--", "regular.txt", "empty.txt");
    await git(fixture, "add", "--intent-to-add", "--", "intent.txt");

    const snapshot = await captureGitIndexSnapshot(fixture);
    assert.equal((await inspectIndexSnapshotFile(snapshot, "regular.txt")).kind, "regular");
    assert.deepEqual(await inspectIndexSnapshotFile(snapshot, "intent.txt"), {
      kind: "intent-to-add",
    });
    assert.equal((await inspectIndexSnapshotFile(snapshot, "empty.txt")).kind, "regular");
    assert.equal((await readIndexSnapshotFile(snapshot, "empty.txt", "governed input")).length, 0);
    await assert.rejects(
      readIndexSnapshotFile(snapshot, "intent.txt", "governed input"),
      /TRACKED_FILE_CUSTODY_FAILED.*intent-to-add/u,
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("index snapshot custody rejects intent-to-add becoming fully staged", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "get-modular-index-intent-transition-"));
  try {
    await initFixtureRepository(fixture);
    await writeFile(join(fixture, "intent.txt"), "");
    await git(fixture, "add", "--intent-to-add", "--", "intent.txt");
    const snapshot = await captureGitIndexSnapshot(fixture);

    await git(fixture, "add", "--", "intent.txt");
    await assert.rejects(
      assertGitIndexSnapshotCurrent(snapshot),
      /TRACKED_FILE_CUSTODY_FAILED: Git index changed after snapshot/u,
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("index snapshot custody ignores GIT_* overrides and enforces the repository top level", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "get-modular-hermetic-git-"));
  const foreign = await mkdtemp(join(tmpdir(), "get-modular-foreign-git-"));
  const savedEnvironment = Object.fromEntries(
    ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"].map(name => [name, process.env[name]]),
  );
  try {
    await initFixtureRepository(fixture);
    await initFixtureRepository(foreign);
    await writeFile(join(fixture, "own.txt"), "own index bytes\n");
    await git(fixture, "add", "--", "own.txt");
    await writeFile(join(foreign, "foreign.txt"), "foreign index bytes\n");
    await git(foreign, "add", "--", "foreign.txt");

    process.env.GIT_DIR = join(foreign, ".git");
    process.env.GIT_WORK_TREE = foreign;
    process.env.GIT_INDEX_FILE = join(foreign, ".git", "index");
    const snapshot = await captureGitIndexSnapshot(fixture);
    assert.deepEqual([...snapshot.entries.keys()], ["own.txt"]);

    await mkdir(join(fixture, "nested"), { recursive: true });
    await assert.rejects(
      captureGitIndexSnapshot(join(fixture, "nested")),
      /TRACKED_FILE_CUSTODY_FAILED: Git top level .* is not the repository root/u,
    );
  } finally {
    for (const [name, value] of Object.entries(savedEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(fixture, { recursive: true, force: true });
    await rm(foreign, { recursive: true, force: true });
  }
});

test("accepted authority custody supports SHA-256 Git object IDs", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "get-modular-sha256-custody-"));
  try {
    await execFileAsync("git", ["init", "--quiet", "--object-format=sha256"], {
      cwd: fixture,
    });
    await writeFile(join(fixture, "authority.json"), "sha256 index bytes\n");
    await execFileAsync("git", ["add", "--", "authority.json"], { cwd: fixture });

    const accepted = await inspectAcceptedAuthorityFile("authority.json", fixture);
    assert.equal(accepted.kind, "regular");
    assert.match(accepted.oid, /^[a-f0-9]{64}$/u);
    assert.deepEqual(accepted.bytes, Buffer.from("sha256 index bytes\n"));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("accepted authority bytes survive a deterministic leaf replacement race", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "get-modular-custody-race-"));
  const external = await mkdtemp(join(tmpdir(), "get-modular-custody-external-"));
  try {
    const relativePath = "evidence/authority.json";
    const authorityPath = join(fixture, relativePath);
    const externalPath = join(external, "replacement.json");
    await execFileAsync("git", ["init", "--quiet"], { cwd: fixture });
    await mkdir(join(fixture, "evidence"), { recursive: true });
    await writeFile(authorityPath, "accepted index bytes\n");
    await writeFile(externalPath, "external replacement bytes\n");
    await execFileAsync("git", ["add", "--", relativePath], { cwd: fixture });

    const accepted = await inspectAcceptedAuthorityFile(relativePath, fixture, {
      afterIndexLookup: async () => {
        await rm(authorityPath);
        await symlink(externalPath, authorityPath, "file");
      },
    });
    assert.equal(accepted.kind, "regular");
    assert.deepEqual(accepted.bytes, Buffer.from("accepted index bytes\n"));
  } finally {
    await rm(fixture, { recursive: true, force: true });
    await rm(external, { recursive: true, force: true });
  }
});

test("tracked workspace integrity ignores mutable Git metadata", async () => {
  for (const indexFlag of ["--assume-unchanged", "--skip-worktree"]) {
    const fixture = await mkdtemp(join(tmpdir(), "get-modular-workspace-integrity-"));
    try {
      await initFixtureRepository(fixture);
      await writeFile(join(fixture, "tracked.txt"), "original\n");
      await git(fixture, "add", "--", "tracked.txt");
      await git(fixture, "commit", "--quiet", "-m", "fixture");
      await assertTrackedWorkspaceMatchesHead(fixture);

      await git(fixture, "update-index", indexFlag, "--", "tracked.txt");
      await writeFile(join(fixture, "tracked.txt"), "modified\n");
      await assert.rejects(
        assertTrackedWorkspaceMatchesHead(fixture),
        /TRACKED_FILE_CUSTODY_FAILED: working-tree bytes or mode differ from HEAD/u,
      );
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  }
});

test("tracked workspace integrity disables Git replacement objects", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "get-modular-workspace-replacement-"));
  try {
    await initFixtureRepository(fixture);
    await writeFile(join(fixture, "tracked.txt"), "original\n");
    await git(fixture, "add", "--", "tracked.txt");
    await git(fixture, "commit", "--quiet", "-m", "fixture");

    await writeFile(join(fixture, "tracked.txt"), "modified\n");
    await git(fixture, "add", "--", "tracked.txt");
    const { stdout: oldTree } = await git(fixture, "rev-parse", "HEAD^{tree}");
    const { stdout: newTree } = await git(fixture, "write-tree");
    await git(fixture, "replace", oldTree.trim(), newTree.trim());
    await assert.rejects(
      assertTrackedWorkspaceMatchesHead(fixture),
      /TRACKED_FILE_CUSTODY_FAILED: tracked path differs from HEAD/u,
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("tracked workspace integrity rejects mode and mid-scan changes", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "get-modular-workspace-stability-"));
  try {
    await initFixtureRepository(fixture);
    await writeFile(join(fixture, "a.txt"), "a\n");
    await writeFile(join(fixture, "b.txt"), "b\n");
    await git(fixture, "add", "--", "a.txt", "b.txt");
    await git(fixture, "commit", "--quiet", "-m", "fixture");
    const { stdout: head } = await git(fixture, "rev-parse", "HEAD");
    await assert.rejects(
      assertTrackedWorkspaceMatchesHead(fixture, { expectedHeadCommit: "0".repeat(40) }),
      /does not match expected commit/u,
    );

    await assert.rejects(
      assertTrackedWorkspaceMatchesHead(fixture, {
        expectedHeadCommit: head.trim(),
        afterFirstPass: () => writeFile(join(fixture, "a.txt"), "changed\n"),
      }),
      /working-tree bytes or mode differ from HEAD/u,
    );
    await writeFile(join(fixture, "a.txt"), "a\n");

    if (process.platform !== "win32") {
      await chmod(join(fixture, "a.txt"), 0o755);
      await assert.rejects(
        assertTrackedWorkspaceMatchesHead(fixture),
        /working-tree bytes or mode differ from HEAD/u,
      );
      await chmod(join(fixture, "a.txt"), 0o644);
    }

    await assert.rejects(
      assertTrackedWorkspaceMatchesHead(fixture, {
        afterFirstPass: async () => {
          await writeFile(join(fixture, "b.txt"), "staged\n");
          await git(fixture, "add", "--", "b.txt");
          await writeFile(join(fixture, "b.txt"), "b\n");
        },
      }),
      /Git index changed after snapshot/u,
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

const MIB = 1024 * 1024;
const gitSync = (cwd: string, args: readonly string[], input?: Buffer) => execFileSync("git", args, {
  cwd,
  input,
  env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" },
}).toString("utf8").trim();

async function repositoryWithBlobs(sizes: readonly number[]) {
  const root = await mkdtemp(join(tmpdir(), "get-modular-blob-batch-"));
  gitSync(root, ["init", "-q"]);
  const blobs = sizes.map((size, index) => {
    const bytes = Buffer.alloc(size, 0x61 + index);
    return { bytes, oid: gitSync(root, ["hash-object", "-w", "--stdin"], bytes) };
  });
  return { root, blobs };
}

// Regression: the batch reader used execFile with a 16 MiB maxBuffer. A larger stream was cut short
// or killed git, and the check failed on a truncated stream or a killed child instead of reading the blobs.
test("readBlobBatch reads a stream above the former 16 MiB buffer", async () => {
  const { root, blobs } = await repositoryWithBlobs([8 * MIB, 9 * MIB, 1024, 0]);
  try {
    const versions = await readBlobBatch(root, blobs.map(blob => blob.oid));
    assert.equal(versions.length, blobs.length);
    versions.forEach((bytes, index) => {
      const expected = blobs[index];
      assert(expected);
      assert.ok(bytes.equals(expected.bytes));
    });
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("readBlobBatch fails with the byte totals when the stream passes its explicit limit", async () => {
  const { root, blobs } = await repositoryWithBlobs([4096, 4096]);
  try {
    await assert.rejects(
      readBlobBatch(root, blobs.map(blob => blob.oid), { maxOutputBytes: 1024 }),
      /exceeds the 1024-byte limit \(received at least \d+ bytes for 2 objects\)/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("parseBlobBatchOutput rejects truncated and trailing streams with byte totals", () => {
  const oid = "a".repeat(40);
  const complete = Buffer.concat([Buffer.from(`${oid} blob 5\n`), Buffer.from("hello\n")]);
  assert.deepEqual(parseBlobBatchOutput(complete, [oid]).map(bytes => bytes.toString()), ["hello"]);
  assert.throws(
    () => parseBlobBatchOutput(complete.subarray(0, complete.length - 3), [oid]),
    /truncated in a{40}: \d+ bytes received, at least \d+ expected/u,
  );
  assert.throws(
    () => parseBlobBatchOutput(Buffer.from(`${oid} blob 5`), [oid]),
    /ended before the header of a{40} \(\d+ bytes received, 0 of 1 objects read\)/u,
  );
  assert.throws(
    () => parseBlobBatchOutput(Buffer.concat([complete, Buffer.from("x")]), [oid]),
    /1 unexpected trailing bytes/u,
  );
  assert.throws(
    () => parseBlobBatchOutput(Buffer.from(`${oid} blob 5\nhelloX`), [oid]),
    /not followed by a line feed/u,
  );
  assert.throws(
    () => parseBlobBatchOutput(Buffer.from(`${oid} missing\n`), [oid]),
    /missing or not a blob/u,
  );
});
