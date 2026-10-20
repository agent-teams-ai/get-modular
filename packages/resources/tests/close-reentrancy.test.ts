import test from "node:test";
import * as resources from "../dist/index.js";
import { runCloseReentrancySuite } from "./close-reentrancy-suite.ts";

test("resource close remains correct during synchronous abort reentry", { timeout: 30_000 }, async context => {
  await runCloseReentrancySuite(resources, context);
});
