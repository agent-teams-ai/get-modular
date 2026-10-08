import { lstat, open, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { isSupportedToolingNodeVersion } from "../../architecture/checks/node-version.mjs";

const capabilityId = "package.public-api-compatibility";
const limit = 32 * 1024;
const producer = {
  package: "@agent-teams/engineering-foundation", version: "1.7.2",
  integrity: "sha512-2wmq4g8rWgXQ2qBVY2Tb7HVP9LFsuBAUMcDhgCqixLA0RA9H3OrwXy7b7jK2gS6SggK9XCplNb03mVLR2EyzRg==",
};
interface Destination {
  readonly artifact: string | undefined;
  readonly directory: string | undefined;
  readonly checkoutSha: string | undefined;
  readonly producerVersion: string;
}
// Only own data properties: process observations must never execute a getter.
function own(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}
function numericExit(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}
interface PublicSelection {
  readonly reportStatus: "missing" | "oversized" | "malformed" | "selected";
  readonly publicCapability?: {
    readonly outcome?: "passed" | "violations" | "invalid-input" | "failed";
    readonly code?: "UNEXPECTED_PROCESS_FAILURE" | "SDK_GROWTH_EVIDENCE_INCOMPLETE";
    readonly retryable: boolean;
  };
}
function publicSelection(stdout: unknown): PublicSelection {
  if (typeof stdout !== "string" || stdout.length === 0) return { reportStatus: "missing" };
  if (stdout.length > limit || Buffer.byteLength(stdout, "utf8") > limit) return { reportStatus: "oversized" };
  try {
    const report: unknown = JSON.parse(stdout);
    const rows = own(report, "capabilities");
    if (own(report, "schemaVersion") !== 1 || !Array.isArray(rows) || rows.length !== 1
      || own(rows[0], "capabilityId") !== capabilityId) return { reportStatus: "malformed" };
    const problem = own(rows[0], "problem");
    if (typeof problem !== "object" || problem === null || Array.isArray(problem)) return { reportStatus: "malformed" };
    const code = own(problem, "code"), retryable = own(problem, "retryable");
    const outcome = own(rows[0], "outcome");
    if (typeof code !== "string" || typeof retryable !== "boolean"
      || (outcome !== undefined && typeof outcome !== "string")) {
      return { reportStatus: "malformed" };
    }
    return {
      reportStatus: "selected",
      publicCapability: {
        ...(outcome === "passed" || outcome === "violations" || outcome === "invalid-input" || outcome === "failed" ? { outcome } : {}),
        ...(code === "UNEXPECTED_PROCESS_FAILURE" || code === "SDK_GROWTH_EVIDENCE_INCOMPLETE" ? { code } : {}),
        retryable,
      },
    };
  } catch { return { reportStatus: "malformed" }; }
}

/** Best-effort evidence only. The caller keeps its original assertion and cleanup. */
export async function retainSdkGrowthFailure(result: unknown, destination: Destination): Promise<void> {
  if (!destination.artifact) return;
  try {
    const exit = own(result, "code") ?? own(result, "status");
    if (exit === 2) return;
    const { artifact, directory, checkoutSha, producerVersion } = destination;
    if (!directory || !isAbsolute(directory) || !isAbsolute(artifact)
      || relative(resolve(directory), dirname(resolve(artifact))) !== ""
      || basename(artifact) !== "sdk-growth-failure.json"
      || !checkoutSha || !/^[a-f0-9]{40}$/u.test(checkoutSha) || producerVersion !== producer.version
      || !/^v(?:24|26)\.[0-9]{1,3}\.[0-9]{1,3}$/u.test(process.version)
      || !isSupportedToolingNodeVersion(process.version)) throw new Error();
    if (!(await lstat(directory)).isDirectory()
      || relative(await realpath(directory), resolve(directory)) !== "") throw new Error();
    const signal = own(result, "signal");
    const transportStatus = exit === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" ? "buffer-limit"
      : own(result, "killed") === true ? "timeout"
      : typeof signal === "string" && signal.length > 0 ? "signal"
      : numericExit(exit) ? "exit" : "unavailable";
    const bytes = JSON.stringify({
      checkoutSha, nodeVersion: process.version, capabilityId, producer,
      ...(transportStatus === "exit" && numericExit(exit) ? { exit } : {}), transportStatus,
      messageOmission: "producer-safety-not-admitted",
      ...(transportStatus === "exit" ? publicSelection(own(result, "stdout")) : { reportStatus: "unavailable" }),
    }) + "\n";
    if (Buffer.byteLength(bytes, "utf8") > limit) throw new Error();
    const file = await open(resolve(artifact), "wx", 0o600);
    try {
      if (!(await file.stat()).isFile()) throw new Error();
      await file.writeFile(bytes, "utf8");
    } finally { await file.close(); }
  } catch { process.stderr.write("sdk-growth-retention-failed\n"); }
}
