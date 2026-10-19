import assert from "node:assert/strict";
import { supportedCompilers } from "./support/compilers.mjs";

try {
  const compilers = await supportedCompilers();
  process.stdout.write(`${JSON.stringify({ outcome: "passed", compilers })}\n`);
} catch (error) {
  assert.ok(error instanceof assert.AssertionError);
  process.stdout.write(`${JSON.stringify({ outcome: "refused", message: error.message })}\n`);
}
