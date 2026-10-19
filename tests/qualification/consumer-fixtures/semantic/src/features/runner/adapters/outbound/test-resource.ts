import { mkdtemp, open, rm, type FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EffectsPort } from "../../application/ports/effects.js";
import type { ReleaseJournalPort } from "../../application/ports/release-journal.js";

export interface TestResource extends EffectsPort {
  readonly probe: () => Promise<void>;
  readonly release: () => Promise<void>;
}

export async function acquireTestResource(
  journal: ReleaseJournalPort,
  tag: string,
  signal: AbortSignal,
): Promise<TestResource> {
  if (signal.aborted) throw Object.assign(new Error("Acquisition cancelled."), { code: "fixture.operation.cancelled" });
  const directory = await mkdtemp(join(tmpdir(), "gm-fixture-runner-"));
  let handle: FileHandle | undefined;
  try {
    handle = await open(join(directory, "effects.jsonl"), "wx+");
    await journal.append({ kind: "resource-acquired", scope: "runner", id: tag, value: tag });
  } catch (cause) {
    await handle?.close();
    await rm(directory, { recursive: true, force: true });
    throw cause;
  }
  const file = handle;
  let released = false;
  return {
    record: async effect => {
      if (effect.signal.aborted) {
        throw Object.assign(new Error("Operation cancelled before its effect."), { code: "fixture.operation.cancelled" });
      }
      const record = { kind: "effect", scope: effect.scope, id: effect.id, value: effect.value } as const;
      await file.appendFile(`${JSON.stringify(record)}\n`, "utf8");
      await journal.append(record);
    },
    probe: async () => { await file.stat(); },
    release: async () => {
      if (released) return;
      await file.close();
      await rm(directory, { recursive: true, force: true });
      await journal.append({ kind: "resource-released", scope: "runner", id: tag, value: tag });
      released = true;
    },
  };
}
