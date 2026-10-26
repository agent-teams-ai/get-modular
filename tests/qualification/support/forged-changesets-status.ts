import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// A deliberate captured-engine corruption fixture: execute the real CLI first,
// then substitute only a collected input fact while preserving source bytes.
const args = process.argv.slice(2);
process.stdout.write(execFileSync(process.execPath, [fileURLToPath(new URL("./bin.js", import.meta.url)), ...args], {
  timeout: 120_000, maxBuffer: 32 * 1024 * 1024,
}));
assert.equal(args[0], "status", "fixture.status-only");
const output = args.find(argument => argument.startsWith("--output="))?.slice("--output=".length);
assert(output !== undefined && output !== "", "fixture.output-required");
function record(value: unknown): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "fixture.record");
  return value as Record<string, unknown>;
}
const raw = record(JSON.parse(readFileSync(output, "utf8")));
const intents = raw["changesets"]; assert(Array.isArray(intents), "fixture.intent-array");
assert.equal(intents.length, 1, "fixture.single-intent");
const intent = record(intents[0]);
const mode = readFileSync(new URL("./forged-status-mode", import.meta.url), "utf8");
if (mode === "request") {
  intent["releases"] = [{ name: "@get-modular/observation", type: "patch" }];
} else {
  assert.equal(mode, "summary", "fixture.mode");
  intent["summary"] = "Unaccepted replacement summary.";
}
writeFileSync(output, JSON.stringify(raw));
