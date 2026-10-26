import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertRetainedHistory, retainHistory } from "./retained-history.ts";
import { prepareNode } from "./dev.ts";

if (process.env.ROOT_CI_RUNTIME_PROFILE === "node") {
  const temporary = process.env.RUNNER_TEMP;
  const environment = process.env.GITHUB_ENV;
  if (!temporary || !environment) throw new Error("runtime.ci.missing-environment");
  const root = resolve(temporary, "get-modular-node-profile");
  assertRetainedHistory(process.cwd());
  prepareNode(root);
  retainHistory(root, process.cwd());
  appendFileSync(environment, `GM_RUNTIME_CHECKOUT=${root}\n`);
}
