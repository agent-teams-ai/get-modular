import assert from "node:assert/strict";
import { resolve } from "node:path";
import { assertFoundationCompilerFloor } from "../../architecture/checks/compiler-floor.ts";

const floor = assertFoundationCompilerFloor(resolve(import.meta.dirname, "../.."));
const sdk = await import("@agent-teams/engineering-foundation/sdk-growth-authority");
assert.equal(typeof sdk.createSdkGrowthAuthorityVerifier, "function");
process.stdout.write(`${JSON.stringify({ outcome: "passed", publicEntry: "@agent-teams/engineering-foundation/sdk-growth-authority",
  imports: 1, extractorVersion: floor.extractorVersion })}\n`);
