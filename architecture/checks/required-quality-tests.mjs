import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDirectExecution } from "./node-version.mjs";

// The installed runner protects identities in selected entries. This consumer
// binds both the reviewed identity inventory and the complete entry selection.
export const REQUIRED_QUALITY_COMMAND = "node architecture/checks/required-quality-tests.mjs && agent-teams-node-test --contract architecture/foundation/required-quality-tests.json -- tests/source-dependencies.test.mjs tests/quality-activation.test.mjs";
export const REQUIRED_QUALITY_CONTRACT = "architecture/foundation/required-quality-tests.json";
const CONTRACT_SHA256 = "e1dbfd834143095f023e141d2130508be1f37b5f5e6cf12d826259a9be8b9c7f";

export async function validateRequiredQualityTests(root = process.cwd()) {
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  if (manifest.scripts?.["quality:critical:test"] !== REQUIRED_QUALITY_COMMAND) {
    throw new Error("REQUIRED_QUALITY_TESTS_INVALID: mandatory file selection or runner command drifted");
  }
  const bytes = await readFile(join(root, REQUIRED_QUALITY_CONTRACT));
  if (createHash("sha256").update(bytes).digest("hex") !== CONTRACT_SHA256) {
    throw new Error("REQUIRED_QUALITY_TESTS_INVALID: reviewed required identities or exceptions drifted");
  }
}

if (isDirectExecution(import.meta.url)) {
  await validateRequiredQualityTests();
  process.stdout.write("Required quality test selection and identity contract are bound.\n");
}
