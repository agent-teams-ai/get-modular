import {
  CANCELLED, caps, failure, freshToken, key, record, snapshot, submission,
  type ChildWitness, type Identity, type Profile, type Snapshot, type StoredRecord, type Submission,
} from "./schema.js";
import { SnapshotStore, type Transition } from "./store.js";

interface Controls {
  readonly reserve?: (value: Submission) => Promise<void>;
  readonly cancel?: (value: Identity) => void;
  readonly freeze?: () => void;
}

// The sole transition queue is finite fixture policy. It never owns a child lifetime.
export class OperationOwner {
  private tail: Promise<void> = Promise.resolve();
  private frozen = false;

  private constructor(private readonly store: SnapshotStore, private current: Snapshot, private readonly controls: Controls) {}

  static async open(store: SnapshotStore, selected: Profile, controls: Controls = {}): Promise<OperationOwner> {
    const current = await store.read();
    if (current.profile !== selected) throw failure("fixture.store.profile");
    return new OperationOwner(store, current, controls);
  }

  status(): { readonly frozen: boolean; readonly snapshot: Snapshot } {
    return { frozen: this.frozen, snapshot: snapshot(this.current) };
  }
  query(value: Identity): StoredRecord | undefined {
    const found = this.current.records.find(candidate => key(candidate) === key(value));
    return found === undefined ? undefined : record(found);
  }

  private serialize<T>(body: () => Promise<T>, ordinary = true): Promise<T> {
    const command = this.tail.then(() => {
      if (ordinary && this.frozen) throw failure("fixture.store.frozen");
      return body();
    });
    this.tail = command.then(() => {}, () => {});
    return command;
  }
  private freeze(): void {
    this.frozen = true;
    this.controls.freeze?.();
  }
  private async replace(records: readonly StoredRecord[], transition: Transition): Promise<void> {
    const next = snapshot({ ...this.current, records });
    try { await this.store.replace(next, transition); }
    catch (cause) { this.freeze(); throw cause; }
    this.current = next;
  }
  private change(previous: StoredRecord, next: StoredRecord, transition: Transition): Promise<void> {
    return this.replace(this.current.records.map(candidate => key(candidate) === key(previous) ? next : candidate), transition);
  }

  submit(input: Submission): Promise<{ readonly created: boolean; readonly record: StoredRecord }> {
    const value = submission(input);
    return this.serialize(async () => {
      const existing = this.query(value);
      // Identity lookup and conflict detection precede both storage and live admission.
      if (existing !== undefined) {
        if (existing.fingerprint !== value.fingerprint || existing.input !== value.input) throw failure("fixture.operation.conflict");
        return { created: false, record: existing };
      }
      if (this.current.records.length === caps.records) throw failure("fixture.store.record-cap");
      await this.controls.reserve?.(value);
      const accepted = record({ ...value, state: "pending", claim: null, cancel: false, cleanupDebt: false, child: null, result: null });
      await this.replace([...this.current.records, accepted], "submit");
      return { created: true, record: accepted };
    });
  }

  claim(value: Identity): Promise<StoredRecord | undefined> {
    return this.serialize(async () => {
      const existing = this.query(value);
      if (existing?.state !== "pending" || existing.cancel) return undefined;
      const claimed = record({ ...existing, state: "claimed", claim: freshToken() });
      await this.change(existing, claimed, "claim");
      return claimed;
    });
  }

  cancel(value: Identity): Promise<StoredRecord> {
    // Revocation and participant stop must remain usable through a blocked or frozen store.
    this.controls.cancel?.(value);
    return this.serialize(async () => {
      const existing = this.query(value);
      if (existing === undefined) throw failure("fixture.operation.missing");
      if (existing.state === "terminal") return existing;
      const cancelled = record({ ...existing, state: "terminal", cancel: true, result: CANCELLED });
      await this.change(existing, cancelled, "cancel");
      return cancelled;
    });
  }

  recordResult(value: Identity, observed: ChildWitness): Promise<StoredRecord> {
    return this.serialize(async () => {
      const existing = this.query(value);
      if (existing === undefined) throw failure("fixture.operation.missing");
      const chosen = existing.state === "terminal" ? existing.result : observed.result;
      const next = record({ ...existing, child: observed.child, cleanupDebt: observed.cleanupDebt, result: chosen,
        state: chosen === null ? existing.state : "terminal" });
      await this.change(existing, next, "recordResult");
      return next;
    });
  }

  reconcile(observe: (value: Identity) => Promise<ChildWitness | undefined> = async () => undefined): Promise<Snapshot> {
    return this.serialize(async () => {
      let actual: Snapshot;
      try {
        actual = await this.store.read();
        if (actual.profile !== this.current.profile) throw failure("fixture.store.profile");
      } catch (cause) { this.freeze(); throw cause; }
      this.current = actual;
      try {
        const records: StoredRecord[] = [];
        for (const existing of actual.records) {
          const observed = await observe(existing);
          // Retained custody supplies only facts; an unresolved claim never authorizes a retry.
          records.push(record({ ...existing,
            state: existing.state === "claimed" ? "quarantined" : existing.state,
            child: observed?.child ?? existing.child, cleanupDebt: observed?.cleanupDebt ?? existing.cleanupDebt,
          }));
        }
        if (JSON.stringify(records) !== JSON.stringify(actual.records)) await this.replace(records, "reconcile");
        this.frozen = false;
        return snapshot(this.current);
      } catch (cause) { this.freeze(); throw cause; }
    }, false);
  }
}

// Deliberately has no submit/claim/launch surface and acquires no writer grant.
export async function readReconcileOnly(store: SnapshotStore): Promise<Snapshot> {
  const actual = await store.read();
  return snapshot({ ...actual, records: actual.records.map(value => record({ ...value,
    state: value.state === "claimed" ? "quarantined" : value.state,
  })) });
}
