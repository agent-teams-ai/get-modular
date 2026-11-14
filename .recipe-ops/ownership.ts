import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
assert.equal(git("rev-parse", "HEAD"), "7b7187c6dbf096f645d26ae9bbdf4fe49ea0ca2c");
assert.equal(git("status", "--porcelain"), "");
const files = new Map<string, string>();
async function read(path: string): Promise<string> {
  const value = files.get(path) ?? await readFile(join(root, path), "utf8");
  files.set(path, value);
  return value;
}
async function replace(path: string, old: string, next: string): Promise<void> {
  const source = await read(path);
  assert.equal(source.split(old).length - 1, 1, `unexpected edit: ${path}: ${old}`);
  files.set(path, source.replace(old, next));
}
const testPath = "packages/effect/tests/communication.test.ts";
const source = await read(testPath);
const start = source.indexOf("const Events ="), end = source.indexOf('test("communication: callback consumers');
assert.ok(start > 0 && end > start);
const preface = source.slice(0, start);
let native = preface;
for (const line of [
  'import { createStore, type ListenerError } from "@get-modular/observation";\n',
  'import { delivered, liveSubscriptions } from "@get-modular/observation/testing";\n',
  'import { createScope } from "@get-modular/resources";\n',
  'import { callbackProgress } from "./communication/callback.ts";\n',
  'import { progressFixture, type ProgressEvent } from "./communication/progress.ts";\n',
  'import { closeWatchScope, observedProgress } from "./communication/state.ts";\n',
]) { assert.ok(native.includes(line)); native = native.replace(line, ""); }
native = native.replace("Cause, Context, Deferred", "Cause, Context")
  .replace('from "./communication/native.ts";', 'from "../../../tests/qualification/effect-communication/native.ts";\nimport type { ProgressEvent } from "../../../tests/qualification/effect-communication/progress.ts";');
files.set(testPath, (native + source.slice(start, end)).trimEnd() + "\n");
let consumer = preface;
for (const line of [
  'import { declareModule, defineContract, type CapabilitiesOf } from "@get-modular/assembly";\n',
  'import { required } from "@get-modular/core";\n',
  'import { effectFor, implement } from "../dist/index.js";\n',
  'import { nativeProgress, type NativeProgressOwner, type ProgressEvents, type ProgressPublisher } from "./communication/native.ts";\n',
]) { assert.ok(consumer.includes(line)); consumer = consumer.replace(line, ""); }
consumer = consumer.replace("Cause, Context, Deferred", "Cause, Deferred")
  .replaceAll('"./communication/', '"./qualification/effect-communication/');
files.set("tests/effect-communication.test.ts", consumer + source.slice(end));
for (const path of ["package.json", "architecture/checks/leaf-packages.ts"]) {
  await replace(path, "packages/effect/tests/communication.test.ts tests/effect-admission.test.ts",
    "packages/effect/tests/communication.test.ts tests/effect-communication.test.ts tests/effect-admission.test.ts");
}
await replace("packages/effect/tsconfig.test-tooling.json", '"include": ["tests/**/*.ts"],',
  '"include": ["tests/**/*.ts", "../../tests/effect-communication.test.ts", "../../tests/qualification/effect-communication/**/*.ts"],');
const packed = "packages/effect/tests/packed-root.test.ts";
await replace(packed, 'join(packageRoot, "tests/communication")', 'join(workspace, "tests/qualification/effect-communication")');
await replace(packed, 'source.replace(publicCarrier, \'from "@get-modular/effect"\')',
  'source.replace(publicCarrier, \'from "@get-modular/effect"\')\n        .replaceAll(\'"../../../tests/qualification/effect-communication/\', \'"./communication/\')');
await replace(packed, '    const output = run(process.execPath, ["--test", "--test-reporter=tap",',
  '    const communication = await readFile(join(workspace, "tests/effect-communication.test.ts"), "utf8");\n    await writeFile(join(consumer, "consumer-communication.test.ts"),\n      communication.replaceAll(\'"./qualification/effect-communication/\', \'"./communication/\'));\n    const output = run(process.execPath, ["--test", "--test-reporter=tap",');
await replace(packed, '"lifecycle.test.ts", "communication.test.ts"], consumer);',
  '"lifecycle.test.ts", "communication.test.ts", "consumer-communication.test.ts"], consumer);');
const policy = "architecture/foundation/source-dependencies.yaml";
const original = await read(policy), position = original.indexOf("  - id: repository.development\n");
assert.ok(position > 0);
let development = original.slice(position);
assert.equal(development.split("        - canonicalize\n").length, 2);
assert.equal(development.split("      - tests/effect-carrier.types.ts\n").length, 2);
development = development.replace("        - canonicalize\n", "        - canonicalize\n        - effect\n")
  .replace("      - tests/effect-carrier.types.ts\n", "      - tests/effect-carrier.types.ts\n      - tests/qualification/effect-communication/native.ts\n      - tests/qualification/effect-communication/progress.ts\n");
files.set(policy, original.slice(0, position) + development);
const guidePath = "packages/effect/docs/practices.md";
let guide = await read(guidePath);
guide = guide.replaceAll("packages/effect/tests/communication/", "tests/qualification/effect-communication/")
  .replace("packages/effect/tests/communication.test.ts", "tests/effect-communication.test.ts")
  .replace("the same cases execute from matched installed public archives. See the",
    "the same cases execute from matched installed public archives. These shared\nconsumer fixtures belong to the repository qualification owner, not to the\nEffect package's runtime dependency set. See the")
  .replace("The GM test wires that reader through an ordinary required slot into two modules.",
    "The [native composition test](https://github.com/agent-teams-ai/get-modular/blob/main/packages/effect/tests/communication.test.ts)\nwires that reader through an ordinary required slot into two modules.");
files.set(guidePath, guide);
const plan = "research/effect-integration-2026-11/communication-recipes-plan-2026-11-14.md";
files.set(plan, await read(plan) + `
## Complete-gate review: shared qualification owner

The first complete local gate rejected the Observation/Resources imports placed
inside the Effect package's development boundary. They are cross-package
consumer qualification, not dependencies of the native Effect leaf. Move the
recipes to \`tests/qualification/effect-communication\` and their scenario suite to
\`tests/effect-communication.test.ts\`. Native mapper tests stay with the Effect
package and consume the two explicitly exposed qualification helpers. The root
consumer scenarios import Effect itself, not the native GM mapper, so the
existing package-to-root archive harness cannot form a runtime package cycle.
The root already declares all selected
packages as development dependencies; record its exact Effect import edges in
the existing source-dependency policy. Keep the Effect package's peer set and
production boundary unchanged. Extend its existing test-tooling project to
check these root-owned fixtures, and keep execution/archive checks mandatory.
Do not solve this rejection by adding Observation as an Effect peer, excluding
the examples from checking, or weakening the dependency rule.

Execution also rejected two incorrect test expectations: a shut-down native
PubSub returns \`false\` on publication; combined processing and finalizer errors
retain their identities as native defects in the qualified peer. The recipes
now document and test those outcomes, including the typed processing failure
when cleanup succeeds. These are corrections to the new qualification, not
changes to Effect or to a Get Modular public API.
`);
await mkdir(join(root, "tests/qualification/effect-communication"), { recursive: true });
for (const name of ["callback.ts", "native.ts", "neutral.ts", "progress.ts", "state.ts"]) {
  await rename(join(root, "packages/effect/tests/communication", name), join(root, "tests/qualification/effect-communication", name));
}
for (const [path, content] of files) await writeFile(join(root, path), content);
git("add", "-A");
assert.equal(git("write-tree"), "8113f9fe6aa297dfed7862f356679219283c948d", "generated source differs from reviewed local tree");
git("diff", "--cached", "--check");
console.log("Reviewed ownership tree verified");
