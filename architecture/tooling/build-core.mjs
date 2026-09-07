import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  core, cleanProduction, generateCore, runTypeScript,
} from "./generate-core.mjs";

try {
  await cleanProduction();
  for (const directory of ["dist-test", "dist-seed"]) {
    await rm(join(core, directory), { recursive: true, force: true });
  }
  const verifyInputs = await generateCore();
  for (const configuration of ["tsconfig.json", "tsconfig.test.json", "tsconfig.seed.json"]) {
    await verifyInputs();
    runTypeScript(configuration);
    await verifyInputs();
  }
} catch (error) {
  await cleanProduction();
  throw error;
}
