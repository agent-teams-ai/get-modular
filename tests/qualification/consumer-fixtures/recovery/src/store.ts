import { open, readFile, rename, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { bytes, caps, failure, freshToken, snapshot, type Snapshot } from "./schema.js";

export type StoreStage = "write" | "sync" | "close" | "rename" | "after-rename";
export type Transition = "initialize" | "submit" | "claim" | "cancel" | "recordResult" | "reconcile";
export type StoreSeam = (stage: StoreStage, transition: Transition) => void | Promise<void>;

export class SnapshotStore implements AsyncDisposable {
  readonly canonical: string;
  private readonly handles = new Set<FileHandle>();

  constructor(readonly directory: string, private readonly seam: StoreSeam = () => {}) {
    this.canonical = join(directory, "snapshot.json");
  }

  async read(): Promise<Snapshot> {
    // A missing expected canonical file is an error; temp files have no authority.
    const contents = await readFile(this.canonical);
    if (contents.byteLength > caps.canonical) throw failure("fixture.store.canonical-bytes");
    const decoded: unknown = JSON.parse(contents.toString("utf8"));
    return snapshot(decoded);
  }

  async replace(next: Snapshot, transition: Transition): Promise<void> {
    const canonical = snapshot(next);
    if (bytes(canonical) > caps.canonical) throw failure("fixture.store.canonical-bytes");
    const temporary = join(this.directory, `snapshot-${freshToken()}.tmp`);
    const handle = await open(temporary, "wx");
    this.handles.add(handle);
    try {
      await this.seam("write", transition);
      await handle.writeFile(JSON.stringify(canonical), "utf8");
      await this.seam("sync", transition);
      await handle.sync();
      await this.seam("close", transition);
      await handle.close();
      this.handles.delete(handle);
      // This is also the crash barrier after real sync/close and before replacement.
      await this.seam("rename", transition);
      await rename(temporary, this.canonical);
      await this.seam("after-rename", transition);
    } finally {
      if (this.handles.has(handle)) {
        await handle.close();
        this.handles.delete(handle);
      }
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    for (const handle of this.handles) {
      await handle.close();
      this.handles.delete(handle);
    }
  }
}
