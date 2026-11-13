import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const directory = process.argv[2], guidePath = process.argv[3];
assert.ok(directory && guidePath, "repository and guide paths required");
const root = resolve(directory);
const expected = new Map([
  ["package.json", "ae716b453cdb1c8dd4a54f5e14a94f538f46e6c6"],
  ["packages/effect/package.json", "b0a6e6b9ecdcc9efcce2672f258a3e097bed89ec"],
  ["packages/effect/tests/packed-root.test.ts", "ba30cf0645c35000321dd9338be0b8e3f8f5e4c6"],
  ["packages/effect/docs/practices.md", "d1ed12a062997807a08e4161b930e8bec3411846"],
  ["packages/observation/README.md", "5f1d5c08e43d734bd64e9a0a92448c814b31f84f"],
  ["research/effect-integration-2026-11/README.md", "2a89eb0eeb123c30a5a1127a9a8596fcfddac311"],
]);
const files = new Map<string, string>();
for (const [path, sha] of expected) {
  const bytes = await readFile(join(root, path));
  const actual = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  assert.equal(actual, sha, `stale source: ${path}`);
  files.set(path, bytes.toString("utf8"));
}
function replace(path: string, before: string, after: string, count = 1): void {
  const source = files.get(path);
  assert.ok(source !== undefined, path);
  assert.equal(source.split(before).length - 1, count, `unexpected replacement count: ${path}: ${before}`);
  files.set(path, source.split(before).join(after));
}
replace("package.json", "packages/effect/tests/lifecycle.test.ts tests/effect-admission.test.ts",
  "packages/effect/tests/lifecycle.test.ts packages/effect/tests/communication.test.ts tests/effect-admission.test.ts");
replace("packages/effect/package.json", "tests/lifecycle.test.ts tests/packed-root.test.ts",
  "tests/lifecycle.test.ts tests/communication.test.ts tests/packed-root.test.ts");
const pack = "packages/effect/tests/packed-root.test.ts";
replace(pack, '["core", "assembly", "effect"]', '["core", "assembly", "resources", "observation", "effect"]', 2);
replace(pack, 'assert.deepEqual(Object.keys(manifest.exports), ["."]);',
  'assert.deepEqual(Object.keys(manifest.exports), name === "observation" ? [".", "./testing"] : ["."]);');
replace(pack, '    // No Effect installation yet: ordinary public imports and construction work independently.',
  '    await cp(join(packageRoot, "tests/communication"), join(consumer, "communication"), { recursive: true });\n    // No Effect installation yet: ordinary public imports and construction work independently.');
replace(pack, '    run(process.execPath, ["neutral.ts"], consumer);',
  '    run(process.execPath, ["neutral.ts"], consumer);\n    run(process.execPath, ["communication/neutral.ts"], consumer);');
replace(pack, '"consumer.test.ts", "lifecycle.test.ts", "portable.ts"',
  '"consumer.test.ts", "lifecycle.test.ts", "communication.test.ts", "portable.ts"');
replace(pack, '"consumer.test.ts", "lifecycle.test.ts"], consumer)',
  '"consumer.test.ts", "lifecycle.test.ts", "communication.test.ts"], consumer)');
replace(pack, '"# tests 23", "# pass 23"', '"# tests 35", "# pass 35"');
replace(pack, 'runtimeTests: 23', 'runtimeTests: 35');
replace(pack, 'strict: true, noEmit: true, skipLibCheck: false, target: "ES2024", types: [],',
  'strict: true, noEmit: true, skipLibCheck: false, target: "ES2024", types: [], allowImportingTsExtensions: true,');
replace(pack, 'files: ["portable.ts", "readme.ts"]',
  'files: ["portable.ts", "readme.ts", "communication/native.ts", "communication/callback.ts", "communication/state.ts"]');
const guide = await readFile(guidePath, "utf8");
assert.ok(guide.startsWith("### Choose the contract"));
replace("packages/effect/docs/practices.md", 'updated 2026-11-13.', 'updated 2026-11-14.');
replace("packages/effect/docs/practices.md",
  'Do not equate GM Observation with Effect PubSub or add a second generic event bus.\n\n',
  'Do not equate GM Observation with Effect PubSub or add a second generic event bus.\n\n' + guide);
replace("packages/effect/docs/practices.md",
  'From the repository root, `bun run effect:check` runs the focused build, strict',
  'On a clean checkout, first build the public prerequisites with `bun run assembly:build`,\n`bun run resources:build` and `bun run observation:build`. Then, from the repository\nroot, `bun run effect:check` runs the focused build, strict');
replace("packages/observation/README.md",
  'change. A one-off fact that must not be lost (an order was placed) is an event; events come later as\n`createEvent`/`emit`/`subscribe`. Never encode an event as a store key.',
  'change. A one-off fact that must not be lost (an order was placed) needs an explicit occurrence or durable\ndelivery contract, not a store key. No general `createEvent`/`emit`/`subscribe` API is promised here.\nAn Effect-native consumer can use a native event source or the one-way state bridge in the\n[optional integration practices](https://github.com/agent-teams-ai/get-modular/blob/main/packages/effect/docs/practices.md#7-own-streams-through-consumption-and-finalization);\nObservation itself has no Effect dependency.');
replace("research/effect-integration-2026-11/README.md", '## Architecture follow-up, 2026-11-12',
  '## Communication recipes, 2026-11-14\n\nThe [boundary review and delivery plan](communication-recipes-plan-2026-11-14.md)\nqualifies native notifications, a neutral callback adapter and one-way Observation\nprojection. The existing packaged practices guide owns usage rules; the recipes\nand their rejecting tests do not add a public event API, a runtime dependency or\na product adoption claim. [PR #242](https://github.com/agent-teams-ai/get-modular/pull/242)\nrecords exact-source execution and review evidence.\n\n## Architecture follow-up, 2026-11-12');
// All guards ran before the first write; no baseline or accepted ADR is touched.
for (const [path, source] of files) await writeFile(join(root, path), source);
console.log(JSON.stringify({ changed: [...files.keys()] }));
