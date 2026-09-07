import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  core, cleanProductionAfterFailure, generateCore, runTypeScript,
} from "./generate-core.mjs";

export async function buildCore({ snapshot } = {}) {
  // Generation owns initial cleanup and rejects indexed generated source first.
  const capability = await generateCore({ snapshot });
  try {
    for (const directory of ["dist-test", "dist-seed"]) {
      await rm(join(core, directory), { recursive: true, force: true });
    }
    for (const configuration of ["tsconfig.json", "tsconfig.test.json", "tsconfig.seed.json"]) {
      await capability.verifyInputs();
      runTypeScript(configuration);
      await capability.verifyInputs();
    }
    return capability;
  } catch (error) {
    await cleanProductionAfterFailure(error);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 3
    || process.argv[2] !== undefined && process.argv[2] !== "--governance") {
    throw new Error("build.unsupported-options");
  }
  if (process.argv[2] === "--governance") {
    const { runGovernance } = await import("../checks/governance.mjs");
    await runGovernance();
  } else {
    await buildCore();
  }
}
