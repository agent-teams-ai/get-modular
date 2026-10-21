import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertGitIndexSnapshotCurrent, assertTrackedWorkspaceMatchesHead, captureGitIndexSnapshot,
  readIndexSnapshotBlob, readIndexSnapshotFile, readWorkingTreeRegularFile,
} from "../../checks/tracked-file-custody.mjs";
import { git, markerPath, nodeMarker, project, projectionPaths } from "./policy.ts";

type Snapshot = Awaited<ReturnType<typeof captureGitIndexSnapshot>>;
interface Projection {
  readonly path: string;
  readonly sourceOid: string;
  readonly sourceBytes: Buffer;
  readonly projectedBytes: Buffer;
}

// Manager metadata is a Host representation, never a replacement index/authority.
async function projections(snapshot: Snapshot): Promise<readonly Projection[]> {
  const root = snapshot.repositoryRoot;
  const markerBefore = await readWorkingTreeRegularFile(markerPath, root);
  if (markerBefore.kind !== "regular" || !("bytes" in markerBefore) || !Buffer.isBuffer(markerBefore.bytes)) {
    throw new Error("runtime.projection.marker-not-regular");
  }
  const marker = nodeMarker(root);
  if (snapshot.headTreeOid !== git(root, "rev-parse", `${marker.commit}^{tree}`)) {
    throw new Error("runtime.projection.snapshot-head-drift");
  }
  await assertGitIndexSnapshotCurrent(snapshot);
  const records: Projection[] = [];
  for (const path of projectionPaths) {
    const entry = snapshot.entries.get(path);
    const committed = /^([0-7]{6}) blob ([a-f0-9]{40})\t(.+)$/u.exec(git(root, "ls-tree", marker.commit, "--", path));
    const oid = committed?.[2];
    if (entry?.kind !== "regular" || typeof oid !== "string" || committed?.[3] !== path
      || entry.mode !== committed[1] || entry.oid !== oid) {
      throw new Error(`runtime.projection.source-index-drift:${path}`);
    }
    const sourceBytes = await readIndexSnapshotBlob(snapshot, path);
    const projectedBytes = Buffer.from(project(path, sourceBytes.toString("utf8")));
    const working = await readWorkingTreeRegularFile(path, root);
    if (working.kind !== "regular" || !("bytes" in working) || !Buffer.isBuffer(working.bytes)
      || !working.bytes.equals(projectedBytes) || !("executable" in working)
      || working.executable !== (entry.mode === "100755")) {
      throw new Error(`runtime.projection.drift:${path}`);
    }
    records.push({ path, sourceOid: oid, sourceBytes, projectedBytes });
  }
  const markerAfter = await readWorkingTreeRegularFile(markerPath, root);
  if (markerAfter.kind !== "regular" || !("bytes" in markerAfter) || !Buffer.isBuffer(markerAfter.bytes)
    || !markerBefore.bytes.equals(markerAfter.bytes)) {
    throw new Error("runtime.projection.marker-changed");
  }
  await assertGitIndexSnapshotCurrent(snapshot);
  return records;
}

export async function readRuntimeIndexSnapshotFile(snapshot: Snapshot, path: string, label: string): Promise<Buffer> {
  if (!existsSync(resolve(snapshot.repositoryRoot, markerPath)) || !projectionPaths.some(candidate => candidate === path)) {
    return readIndexSnapshotFile(snapshot, path, label);
  }
  const record = (await projections(snapshot)).find(candidate => candidate.path === path);
  if (!record) { throw new Error("runtime.projection.path-not-admitted"); }
  return Buffer.from(record.projectedBytes);
}

export async function verifyRuntimeWorkspace(root: string, expectedHeadCommit?: string): Promise<void> {
  if (!existsSync(resolve(root, markerPath))) {
    await assertTrackedWorkspaceMatchesHead(root, { ...(expectedHeadCommit === undefined ? {} : { expectedHeadCommit }) });
    return;
  }
  const snapshot = await captureGitIndexSnapshot(root);
  const records = await projections(snapshot);
  await assertTrackedWorkspaceMatchesHead(root, {
    ...(expectedHeadCommit === undefined ? {} : { expectedHeadCommit }), workingTreeProjections: records,
  });
  // Revalidate Host derivation after both generic working-tree passes.
  await projections(snapshot);
}
