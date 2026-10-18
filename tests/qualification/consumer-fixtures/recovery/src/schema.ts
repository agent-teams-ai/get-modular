import { createHash, randomBytes } from "node:crypto";

export type Profile = "record-only" | "restart-pending";
export const SUCCESS = "recovery:A:hello";
export const CANCELLED = "fixture.operation.cancelled";
export const BOUNDARY_RESULT = `bound:${'"'.repeat(92)}`;
export type FixtureResult = typeof SUCCESS | typeof CANCELLED | typeof BOUNDARY_RESULT;
export const caps = { records: 32, record: 1792, envelope: 4096, canonical: 64 * 1024 } as const;
// The complete catalog is fixed and checked before an owner can admit any work.
for (const value of [SUCCESS, CANCELLED, BOUNDARY_RESULT]) {
  if (bytes(value) > 192) throw failure("fixture.store.result-catalog");
}

export interface Identity { readonly scope: string; readonly id: string }
export interface Submission extends Identity { readonly input: string; readonly fingerprint: string }
export interface StoredChild {
  readonly pid: number;
  readonly started: boolean;
  readonly exited: boolean;
  readonly code: number | null;
  readonly signal: "SIGTERM" | "SIGKILL" | null;
}
export interface StoredRecord extends Submission {
  readonly state: "pending" | "claimed" | "terminal" | "quarantined";
  readonly claim: string | null;
  readonly cancel: boolean;
  readonly cleanupDebt: boolean;
  readonly child: StoredChild | null;
  readonly result: FixtureResult | null;
}
export interface Snapshot {
  readonly format: 1;
  readonly profile: Profile;
  readonly generation: string;
  readonly records: readonly StoredRecord[];
}
export interface ChildWitness {
  readonly child: StoredChild;
  readonly cleanupDebt: boolean;
  readonly result: FixtureResult | null;
}

export function failure(code: string): Error & { readonly code: string } {
  return Object.assign(new Error(code), { code });
}
export function errorCode(cause: unknown): string {
  return typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string"
    ? cause.code : "fixture.unexpected";
}
export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function closed(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!object(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    throw failure("fixture.store.schema");
  }
}
export function bytes(value: unknown): number {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw failure("fixture.store.schema");
  return Buffer.byteLength(encoded, "utf8");
}
function boundedString(value: unknown, limit: number): string {
  if (typeof value !== "string" || bytes(value) > limit) throw failure("fixture.store.schema");
  return value;
}
export function token(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{32}$/.test(value)) throw failure("fixture.store.schema");
  return value;
}
export function freshToken(): string { return randomBytes(16).toString("hex"); }
export function profile(value: unknown): Profile {
  if (value !== "record-only" && value !== "restart-pending") throw failure("fixture.store.schema");
  return value;
}
export function identity(value: unknown): Identity {
  closed(value, ["scope", "id"]);
  return { scope: boundedString(value.scope, 64), id: boundedString(value.id, 64) };
}
export function submission(value: unknown): Submission {
  closed(value, ["scope", "id", "input", "fingerprint"]);
  return {
    scope: boundedString(value.scope, 64), id: boundedString(value.id, 64),
    input: boundedString(value.input, 896), fingerprint: boundedString(value.fingerprint, 128),
  };
}
export function makeSubmission(id = "operation", input = " hello ", scope = "recovery"): Submission {
  return submission({ scope, id, input, fingerprint: createHash("sha256").update(input).digest("hex") });
}
// Live execution has one successful result; the wider storage schema also serves capacity evidence.
export function requireLiveResult(scope: string, normalizedInput: string): void {
  if (scope !== "recovery" || normalizedInput !== "hello") throw failure("fixture.operation.unsupported-input");
}
export function key(value: Identity): string { return JSON.stringify([value.scope, value.id]); }
export function child(value: unknown): StoredChild {
  closed(value, ["pid", "started", "exited", "code", "signal"]);
  if (typeof value.pid !== "number" || !Number.isSafeInteger(value.pid) || value.pid < 1 ||
    typeof value.started !== "boolean" || typeof value.exited !== "boolean" ||
    !(value.code === null || typeof value.code === "number" && Number.isInteger(value.code) &&
      value.code >= -2147483648 && value.code <= 2147483647) ||
    !(value.signal === null || value.signal === "SIGTERM" || value.signal === "SIGKILL")) {
    throw failure("fixture.store.schema");
  }
  return { pid: value.pid, started: value.started, exited: value.exited, code: value.code, signal: value.signal };
}
export function result(value: unknown): FixtureResult {
  if ((value !== SUCCESS && value !== CANCELLED && value !== BOUNDARY_RESULT) || bytes(value) > 192) {
    throw failure("fixture.store.schema");
  }
  return value;
}
export function record(value: unknown): StoredRecord {
  closed(value, ["scope", "id", "input", "fingerprint", "state", "claim", "cancel", "cleanupDebt", "child", "result"]);
  if (value.state !== "pending" && value.state !== "claimed" && value.state !== "terminal" && value.state !== "quarantined" ||
    typeof value.cancel !== "boolean" || typeof value.cleanupDebt !== "boolean") throw failure("fixture.store.schema");
  const reconstructed: StoredRecord = {
    scope: boundedString(value.scope, 64), id: boundedString(value.id, 64),
    input: boundedString(value.input, 896), fingerprint: boundedString(value.fingerprint, 128), state: value.state,
    claim: value.claim === null ? null : token(value.claim), cancel: value.cancel, cleanupDebt: value.cleanupDebt,
    child: value.child === null ? null : child(value.child), result: value.result === null ? null : result(value.result),
  };
  if (bytes(reconstructed) > caps.record) throw failure("fixture.store.record-bytes");
  return reconstructed;
}
export function snapshot(value: unknown): Snapshot {
  closed(value, ["format", "profile", "generation", "records"]);
  if (value.format !== 1 || !Array.isArray(value.records)) throw failure("fixture.store.schema");
  if (value.records.length > caps.records) throw failure("fixture.store.record-cap");
  const records = value.records.map(record);
  if (new Set(records.map(key)).size !== records.length) throw failure("fixture.store.schema");
  const reconstructed: Snapshot = { format: 1, profile: profile(value.profile), generation: token(value.generation), records };
  if (bytes({ ...reconstructed, records: [] }) + Math.max(0, records.length - 1) > caps.envelope ||
    bytes(reconstructed) > caps.canonical) throw failure("fixture.store.canonical-bytes");
  return reconstructed;
}
export function emptySnapshot(selected: Profile): Snapshot {
  return snapshot({ format: 1, profile: selected, generation: freshToken(), records: [] });
}
export function witness(value: unknown): ChildWitness {
  closed(value, ["child", "cleanupDebt", "result"]);
  if (typeof value.cleanupDebt !== "boolean") throw failure("fixture.ipc.invalid");
  return { child: child(value.child), cleanupDebt: value.cleanupDebt, result: value.result === null ? null : result(value.result) };
}
