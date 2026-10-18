import assert from "node:assert/strict";
import test from "node:test";
import { supportedCompilers, testAssemblyTypes } from "../../architecture/tooling/test-assembly-types.mjs";

test("distinct supported compilers check positive and negative NodeNext and Bundler fixtures", () => {
  const observations = testAssemblyTypes();
  assert.deepEqual(observations.map(({ resolution }) => resolution), supportedCompilers().flatMap(() => ["NodeNext", "Bundler"]));
});
