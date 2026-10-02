import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDirectExecution } from "./node-version.mjs";

// The installed runner protects identities in selected entries. This consumer
// binds both the reviewed identity inventory and the complete entry selection.
export const REQUIRED_QUALITY_COMMAND = "node architecture/checks/required-quality-tests.mjs && agent-teams-node-test --contract architecture/foundation/required-quality-tests.json -- tests/source-dependencies.test.mjs tests/quality-activation.test.mjs";
export const REQUIRED_QUALITY_CONTRACT = "architecture/foundation/required-quality-tests.json";
const CONTRACT_SHA256 = "d353019e90b04d516d32867cbe4c2248de75513c57effe28e3bb43aac70b5865";

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
