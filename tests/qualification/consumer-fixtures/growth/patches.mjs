import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const hash = value => createHash("sha256").update(value).digest("hex");

async function replace(directory, path, beforeText, afterText) {
  const before = await readFile(join(directory, path), "utf8");
  assert.equal(before.split(beforeText).length, 2, `fixture.growth.patch.unique: ${path}`);
  const after = before.replace(beforeText, afterText);
  await writeFile(join(directory, path), after);
  return { path, before, after, beforeSha256: hash(before), afterSha256: hash(after) };
}

/** Fixed G-03 leaf patch; the independently checked root advances by one modulo M. */
export async function applyLeafEdit(directory, size) {
  const feature = `f${String(size - 1).padStart(3, "0")}`;
  return [await replace(directory, `src/features/${feature}/application/use-cases/read-value.ts`,
    `17 * ${size} + `, `17 * ${size} + 1 + `)];
}

/** Fixed G-03 six-file contract patch; consumer application ports remain unchanged. */
export async function applySharedContractEdit(directory) {
  const patches = [];
  patches.push(await replace(directory, "src/features/f003/contracts/value.ts", "readonly read:", "readonly readValue:"));
  patches.push(await replace(directory, "src/features/f003/composition/f003.contracts.ts", "revision: 1", "revision: 2"));
  patches.push(await replace(directory, "src/features/f003/composition/value.module.ts", "const port: Value = { read:", "const port: Value = { readValue:"));
  for (const feature of ["f004", "f006", "f007"]) {
    patches.push(await replace(directory, `src/features/${feature}/composition/value.module.ts`,
      "deps.p3.read()", "deps.p3.readValue()"));
  }
  assert.equal(patches.length, 6);
  return patches;
}

export async function restoreEdit(directory, patches) {
  for (const patch of patches) {
    assert.equal(await readFile(join(directory, patch.path), "utf8"), patch.after);
    await writeFile(join(directory, patch.path), patch.before);
  }
}
