import assert from "node:assert/strict";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { CodemodProject, typeOnly } from "../architecture/tooling/codemods/project.ts";

test("the native codemod adapter distinguishes type imports from runtime imports", async () => {
  const source = [
    'import type { Assembly } from "@get-modular/assembly";',
    'import { assemblyFor } from "@get-modular/assembly";',
    'export type { Assembly } from "@get-modular/assembly";',
    'export { assemblyFor } from "@get-modular/assembly";',
  ].join("\n");
  const project = await CodemodProject.create([[resolve(tmpdir(), "codemod/type-imports.ts"), source]], { isolated: true });
  try {
    const [file] = project.files;
    assert(file);
    assert.deepEqual(file.diagnostics, []);
    assert.deepEqual(file.imports.map(typeOnly), [true, false]);
    assert.deepEqual(file.exports.map(typeOnly), [true, false]);
    assert.equal(file.text, source);
  } finally { await project.close(); }
});
