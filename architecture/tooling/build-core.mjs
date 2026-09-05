import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const tsc = join(dirname(require.resolve("typescript/package.json")), "bin/tsc");
// Each build has its own tree. Clean before emit so narrowing the entrypoint
// never leaves an old unselected implementation in the production archive.
for (const directory of ["dist", "dist-test", "dist-stage0", "dist-seed"]) {
  await rm(join(root, "packages/core", directory), { recursive: true, force: true });
}
for (const configuration of ["tsconfig.test.json", "tsconfig.stage0.json", "tsconfig.seed.json", "tsconfig.json"]) {
  const result = spawnSync(process.execPath, [tsc, "-p", join(root, "packages/core", configuration)], {
    cwd: root, stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
