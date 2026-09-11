import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function findRepoRoot(from = import.meta.url) {
  let directory = dirname(fileURLToPath(from));
  while (!existsSync(join(directory, "pnpm-workspace.yaml"))) {
    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error("Get Modular repository root was not found from qualification-support.");
    }
    directory = parent;
  }
  return directory;
}

export async function loadRepoJson(relativePath, from = import.meta.url) {
  return JSON.parse(await readFile(join(findRepoRoot(from), relativePath), "utf8"));
}

export function loadRepoJsonSync(relativePath, from = import.meta.url) {
  return JSON.parse(readFileSync(join(findRepoRoot(from), relativePath), "utf8"));
}

export function repoFileUrl(relativePath, from = import.meta.url) {
  return new URL(relativePath, `file://${findRepoRoot(from)}/`);
}
