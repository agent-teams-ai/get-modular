import { realpath, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  core, cleanProductionAfterFailure, generateCore, runTypeScript,
} from "./generate-core.ts";
import type { GeneratedCore, GenerationOptions } from "./generate-core.ts";

export async function buildCore({ snapshot }: GenerationOptions = {}): Promise<GeneratedCore> {
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
    return cleanProductionAfterFailure(error);
  }
}

if (process.argv[1]
  && await realpath(resolve(process.argv[1])) === await realpath(fileURLToPath(import.meta.url))) {
  if (process.argv.length !== 2) throw new Error("build.unsupported-options");
  await buildCore();
}
