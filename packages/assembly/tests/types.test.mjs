import assert from "node:assert/strict";
import test from "node:test";
import { testAssemblyTypes } from "../../../architecture/tooling/test-assembly-types.mjs";

test("minimum and build compilers check positive and negative NodeNext and Bundler fixtures", () => {
  const observations = testAssemblyTypes();
  assert.deepEqual(observations.map(({ resolution }) => resolution), ["NodeNext", "Bundler", "NodeNext", "Bundler"]);
});
