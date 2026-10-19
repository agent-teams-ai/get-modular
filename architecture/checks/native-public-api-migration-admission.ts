import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

export const inputDirectory = "architecture/tooling/native-public-api-migration";
export const inputPinsDigest = "sha256:e0847814cda59d8ebe3389fcec93e418b4c2975dd29e295b0abc736cf2b593fa";
export const packageNames = ["@get-modular/assembly", "@get-modular/core"];
export const capabilityInventory = [
  ["architecture.source-dependencies", 3], ["documentation.local-references", 1],
  ["governance.architecture-decisions", 1], ["package.public-api-compatibility", 1],
  ["quality.source-coverage", 1], ["quality.suppression-governance", 1],
  ["repository.agent-workflow", 1], ["workspace.dependency-declarations", 1],
];
export interface InvocationResult { readonly stdout: string; readonly stderr: string; readonly exitCode: number }
export interface InputPins {
  readonly kind: "get-modular:public-api-native-migration-inputs:1";
  readonly assets: Readonly<Record<string, string>>;
  readonly fixedFiles: Readonly<Record<string, string>>;
}
export function fail(message: string): never { throw new Error(`Get Modular native API qualification: ${message}`); }
export function digest(bytes: Uint8Array): string { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
export function jsonBytes(value: unknown): Buffer { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`); }
export function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {fail("expected a JSON object");}
  return value as Record<string, unknown>;
}
function zero(value: unknown): boolean { return isDeepStrictEqual(value, { errors: 0, warnings: 0, infos: 0 }); }
function sortedInventory(rows: readonly Record<string, unknown>[]) {
  return rows.map(row => [row["capabilityId"], row["capabilityConfigSchemaVersion"]])
    .toSorted((a, b) => String(a[0]).localeCompare(String(b[0])));
}
function capabilities(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {fail("missing full capability inventory");}
  const rows = value.map(record);
  if (!isDeepStrictEqual(sortedInventory(rows), capabilityInventory)) {fail("full eight-capability inventory differs");}
  return rows;
}
/** Called only after the installed public report schema accepts the full JSON. */
export function admitOrdinary(result: InvocationResult, reportValue: unknown): "ordinary-passed" | "migration-required" {
  const report = record(reportValue);
  const rows = capabilities(report["capabilities"]);
  if (report["coverage"] !== "full" || report["problem"] !== undefined) {fail("ordinary coverage or execution failed");}
  if (result.exitCode === 0) {
    if (report["outcome"] !== "passed" || !zero(report["summary"])
      || rows.some(row => row["outcome"] !== "passed" || row["problem"] !== undefined
        || !zero(row["summary"]) || !isDeepStrictEqual(row["diagnostics"], []))) {fail("zero exit lacks a complete ordinary pass");}
    return "ordinary-passed";
  }
  if (result.exitCode !== 1 || report["outcome"] !== "violations"
    || !isDeepStrictEqual(report["summary"], { errors: 2, warnings: 0, infos: 0 })) {fail("ordinary result is not the exact two-mismatch case");}
  const expected = packageNames.map(packageName => ({
    ruleId: "package.public-api-compatibility.baseline-tool-mismatch", severity: "error", subject: packageName,
    message: "Released baseline uses API Extractor 7.58.12; current adapter uses typescript-native/7.0.2.",
    location: { path: `architecture/public-api/${packageName.split("/")[1]}.json` }, relatedLocations: [], evidence: [],
    remediation: "Regenerate the released baseline only through the release workflow after reviewing the tool upgrade.",
    requiresArchitectureReview: true,
  }));
  for (const row of rows) {
    if (row["problem"] !== undefined) {fail("ordinary capability has an execution problem");}
    if (row["capabilityId"] === "package.public-api-compatibility") {
      if (!Array.isArray(row["diagnostics"]) || row["outcome"] !== "violations"
        || !isDeepStrictEqual(row["summary"], report["summary"])
        || !isDeepStrictEqual(row["diagnostics"].map(record).toSorted((a, b) => String(a["subject"]).localeCompare(String(b["subject"]))), expected)) {fail("ordinary mismatch diagnostics differ");}
    } else if (row["outcome"] !== "passed" || !zero(row["summary"]) || !isDeepStrictEqual(row["diagnostics"], [])) {fail("unrelated ordinary diagnostic remains");}
  }
  return "migration-required";
}
export async function snapshotPinnedInputs(read: (path: string) => Promise<Buffer>): Promise<Map<string, string>> {
  const pinsBytes = await read(`${inputDirectory}/pins.json`);
  if (digest(pinsBytes) !== inputPinsDigest) {fail("source-owned input pins differ");}
  const pins = JSON.parse(pinsBytes.toString("utf8")) as InputPins;
  const snapshot = new Map<string, string>([[`${inputDirectory}/pins.json`, digest(pinsBytes)]]);
  for (const [path, expected] of [...Object.entries(pins.fixedFiles), ...Object.entries(pins.assets).map(([assetPath, hash]) => [`${inputDirectory}/${assetPath}`, hash] as const)]) {
    const actual = digest(await read(path));
    if (actual !== expected) {fail(`reviewed input differs: ${path}`);}
    snapshot.set(path, actual);
  }
  for (const path of ["package.json", "pnpm-lock.yaml"]) {snapshot.set(path, digest(await read(path)));}
  return snapshot;
}
export async function assertSnapshotUnchanged(before: ReadonlyMap<string, string>, read: (path: string) => Promise<Buffer>): Promise<void> {
  for (const [path, expected] of before) {
    if (digest(await read(path)) !== expected) { fail(`input changed during qualification: ${path}`); }
  }
}
function assertObservedPackages(observation: Record<string, unknown>, review: Record<string, unknown>): void {
  if (!Array.isArray(observation["packages"]) || !Array.isArray(review["packages"])) {fail("public package inventory is absent");}
  const rows = observation["packages"].map(record), pins = review["packages"].map(record);
  if (!isDeepStrictEqual(rows.map(row => row["packageName"]).toSorted((a, b) => String(a).localeCompare(String(b))), packageNames)) {fail("public package inventory differs");}
  for (const row of rows) {
    const pin = pins.find(candidate => candidate["packageName"] === row["packageName"]);
    if (pin === undefined) {fail("public package is outside the review");}
    for (const key of ["baselineDigest", "archiveDigest", "archiveIntegrity", "configDigest", "releasedInputsDigest", "nativeReleasedDigest"]) {
      if (row[key] !== pin[key]) {fail(`public ${key} differs from review`);}
    }
    if (row["nativeReleasedDigest"] !== digest(jsonBytes(row["nativeReleased"]))
      || record(row["nativeCandidate"])["extractorVersion"] !== "typescript-native/7.0.2") {fail("public snapshot identity differs");}
  }
}
/** Public output is content evidence. It never supplies release authority. */
export function assertPublicQualification(result: InvocationResult, value: unknown, requestValue: unknown): void {
  const output = record(value), request = record(requestValue), review = record(request["review"]);
  if (result.exitCode !== 0 || output["schemaVersion"] !== 1 || output["kind"] !== "foundation:public-api-native-transition:result:1"
    || output["outcome"] !== "qualified" || output["migrationApplied"] !== false || !isDeepStrictEqual(output["writes"], [])
    || output["reviewDigest"] !== digest(jsonBytes(review))) {fail("public operation did not return read-only qualification");}
  const observation = record(output["observation"]);
  const tool = record(JSON.parse(String(observation["toolchainIdentity"])) as unknown);
  if (tool["extractor"] !== "typescript-native/7.0.2" || tool["compiler"] !== "7.0.2") {fail("public compiler identity differs");}
  if (output["observationDigest"] !== digest(jsonBytes(observation))
    || observation["kind"] !== "foundation:public-api-native-migration:observation:1"
    || observation["policyDigest"] !== review["policyDigest"] || observation["toolDiffDigest"] !== review["toolDiffDigest"]
    || digest(jsonBytes(observation["toolDiff"])) !== review["toolDiffDigest"]
    || !isDeepStrictEqual(observation["typedDiagnostics"], []) || !isDeepStrictEqual(observation["artifactDiagnostics"], [])) {fail("public native observation differs from reviewed content");}
  assertObservedPackages(observation, review);
}
export async function qualifyOrdinaryResult(options: {
  readonly result: InvocationResult; readonly report: unknown;
  readonly read: (path: string) => Promise<Buffer>;
  readonly observe: () => Promise<InvocationResult>;
}) {
  const result = { ...options.result };
  const read = options.read, observe = options.observe;
  const admission = admitOrdinary(result, structuredClone(options.report));
  if (admission === "ordinary-passed") {return { outcome: admission, ordinary: result };}
  const before = await snapshotPinnedInputs(read);
  const request = JSON.parse((await read(`${inputDirectory}/request.json`)).toString("utf8")) as unknown;
  const observation = await observe();
  assertPublicQualification(observation, JSON.parse(observation.stdout) as unknown, request);
  await assertSnapshotUnchanged(before, read);
  return { outcome: "named-migration-qualified" as const, ordinary: result, observation };
}
