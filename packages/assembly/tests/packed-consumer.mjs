import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as assembly from "@get-modular/assembly";
import * as core from "@get-modular/core";

const require = createRequire(import.meta.url);
assert.deepEqual(Object.keys(assembly).sort(), ["AssemblyBindingError", "assemblyFor"]);
assert.deepEqual(Object.keys(core).sort(), ["compileComposition", "compileCompositionJson", "defineModule", "many", "optional", "required"]);
for (const [name, namespace] of [["@get-modular/assembly", assembly], ["@get-modular/core", core]]) {
  assert.equal(require(name), namespace);
  assert.equal(fileURLToPath(import.meta.resolve(name)), join(import.meta.dirname, "node_modules", name, "dist/index.js"));
  assert.equal(require.resolve(name), fileURLToPath(import.meta.resolve(name)));
  for (const subpath of ["dist/index.js", "src/index.js", "package.json", "unknown"]) {
    const specifier = `${name}/${subpath}`;
    await assert.rejects(() => import(specifier), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
    assert.throws(() => require(specifier), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
  }
}
