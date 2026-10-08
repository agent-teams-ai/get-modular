import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDirectExecution } from "./node-version.mjs";

// The installed runner protects identities in selected entries. This consumer
// binds both the reviewed identity inventory and the complete entry selection.
export const REQUIRED_QUALITY_COMMAND = "node architecture/checks/required-quality-tests.mjs && node node_modules/typescript/bin/tsc -p tests/tsconfig.repository-agent-workflow.json --noEmit && agent-teams-node-test --contract architecture/foundation/required-quality-tests.json -- tests/source-dependencies.test.mjs tests/quality-activation.test.mjs tests/repository-agent-workflow.test.mts";
export const REQUIRED_QUALITY_CONTRACT = "architecture/foundation/required-quality-tests.json";
const CONTRACT_SHA256 = "0b69a38756c846ad72fd7e739d676d9cbda26fd41ab692298670744b5ec71d1c";

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
