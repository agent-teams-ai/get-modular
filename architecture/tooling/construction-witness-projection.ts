import { copyFile, mkdir, readFile, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const canonical = "tests/qualification/support/construction-witness.ts";
const projection = "packages/core/tests/qualification-support/support/construction-witness.ts";

// The checked-in Core copy crosses no executable package boundary. Root owns
// the authored implementation; builds verify this exact two-file projection.
export async function assertConstructionWitnessProjection(repositoryRoot: string): Promise<void> {
  const [authored, generated] = await Promise.all([
    readFile(join(repositoryRoot, canonical)),
    readFile(join(repositoryRoot, projection)),
  ]);
  if (!authored.equals(generated)) throw new Error("build.construction-witness-projection-drift");
}

if (process.argv[1]
  && await realpath(resolve(process.argv[1])) === await realpath(fileURLToPath(import.meta.url))) {
  if (process.argv.length !== 3 || !["--check", "--write"].includes(process.argv[2] ?? "")) {
    throw new Error("construction-witness-projection.unsupported-options");
  }
  const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
  if (process.argv[2] === "--write") {
    const destination = join(repositoryRoot, projection);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(repositoryRoot, canonical), destination);
  }
  await assertConstructionWitnessProjection(repositoryRoot);
}
