import test from "node:test";
import { createLifecycleKernel } from "../dist/index.js";
import { runSemanticSuite } from "./semantic-suite.mjs";

test("local build lifecycle semantics", async (context) => {
  await runSemanticSuite(createLifecycleKernel, context);
});
