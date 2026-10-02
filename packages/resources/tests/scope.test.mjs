import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as resources from "../dist/index.js";
import { runSemanticSuite } from "./semantic-suite.mjs";

const tests = dirname(fileURLToPath(import.meta.url));
const distURL = pathToFileURL(join(tests, "../dist/index.js")).href;
const node = (args, input) => spawnSync(process.execPath, args,
  { encoding: "utf8", input, timeout: 60000, env: { ...process.env, NODE_OPTIONS: "" } });

test("local build scope semantics", async (context) => {
  await runSemanticSuite(resources, context);
});

test("R5 only the late refusal is pre-handled: a setup that throws without await still crashes", () => {
  const result = node(["--input-type=module", "-"], `
    import { createScope } from ${JSON.stringify(distURL)};
    void createScope({ name: "m" }).resources.setup({ name: "x", setup: () => { throw new Error("setup-boom"); }, cleanup: () => {} });
  `);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /setup-boom/u);
});
