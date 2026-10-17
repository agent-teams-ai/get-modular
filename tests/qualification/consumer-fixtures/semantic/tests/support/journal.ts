import { mkdtemp, open, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JournalPort, JournalRecord } from "../../src/features/session/contracts/session.js";

export interface FileJournal extends AsyncDisposable {
  readonly port: JournalPort;
  readonly read: () => Promise<readonly JournalRecord[]>;
  readonly probe: () => Promise<void>;
  readonly close: () => Promise<void>;
}

function decodeRecord(line: string): JournalRecord {
  const record: unknown = JSON.parse(line);
  if (typeof record !== "object" || record === null ||
    !("kind" in record) || !("scope" in record) || !("id" in record) || !("value" in record) ||
    (record.kind !== "effect" && record.kind !== "terminal" &&
      record.kind !== "resource-acquired" && record.kind !== "resource-released" && record.kind !== "cleanup-attempt") ||
    typeof record.scope !== "string" || typeof record.id !== "string" || typeof record.value !== "string") {
    throw new Error("fixture.journal.invalid-record");
  }
  return { kind: record.kind, scope: record.scope, id: record.id, value: record.value };
}

export async function createFileJournal(): Promise<FileJournal> {
  const directory = await mkdtemp(join(tmpdir(), "gm-fixture-journal-"));
  const path = join(directory, "journal.jsonl");
  const file = await open(path, "wx+").catch(async cause => {
    await rm(directory, { recursive: true, force: true });
    throw cause;
  });
  let tail: Promise<void> = Promise.resolve();
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closing ??= tail.finally(() => file.close());
    return closing;
  };
  return {
    port: {
      append: record => {
        const line = `${JSON.stringify(record)}\n`;
        tail = tail.then(() => file.appendFile(line, "utf8"));
        return tail;
      },
    },
    read: async () => {
      await tail;
      return (await readFile(path, "utf8")).split("\n").filter(Boolean).map(decodeRecord);
    },
    probe: async () => { await file.stat(); },
    close,
    [Symbol.asyncDispose]: async () => {
      try { await close(); }
      finally { await rm(directory, { recursive: true, force: true }); }
    },
  };
}
