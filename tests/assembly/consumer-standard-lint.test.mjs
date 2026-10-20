import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const workspace = resolve(import.meta.dirname, "../..");
const standard = await readFile(join(workspace, "docs/architecture/common-assembly.md"), "utf8");
const snippet = [...standard.matchAll(/```json\n([\s\S]*?)\n```/gu)]
  .map(([, body]) => JSON.parse(body)).find(value => Array.isArray(value.overrides));
assert.ok(snippet, "the standard must publish its executable lint overrides");

test("T76 T86 the actual CMS lint snippet reserves observation/testing for tests", async t => {
  const directory = await mkdtemp(join(tmpdir(), "get-modular-observation-lint-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = join(directory, "oxlint.json");
  await writeFile(config, JSON.stringify(snippet));
  const cases = [
    ["src/composition/host.ts", "@get-modular/observation/testing", false],
    ["src/features/view/composition/view.module.ts", "@get-modular/observation/testing", false],
    ["src/features/view/composition/view.declaration.ts", "@get-modular/observation/testing", false],
    ...["contracts", "domain", "application", "adapters"].map(layer =>
      [`src/features/view/${layer}/view.ts`, "@get-modular/observation/testing", false]),
    ["src/features/view/composition/view.test.ts", "@get-modular/observation/testing", true],
    ["src/host.test.ts", "@get-modular/observation/testing", true],
    ["src/features/view/composition/create-view.ts", "@get-modular/observation", true],
  ];
  for (const [path, specifier, accepted] of cases) {
    const file = join(directory, path);
    await mkdir(dirname(file), { recursive: true });
    const member = specifier.endsWith("/testing") ? "delivered" : "createStore";
    await writeFile(file, `import { ${member} } from "${specifier}";\nvoid ${member};\n`);
    const result = spawnSync(process.execPath, [join(workspace, "node_modules/oxlint/bin/oxlint"),
      "--config", config, "--format", "json", file], { cwd: directory, encoding: "utf8" });
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    const output = `${result.stdout}${result.stderr}`;
    assert.equal(result.status, accepted ? 0 : 1, `${path}: ${output}`);
    if (!accepted) assert.match(output, /no-restricted-imports/u, path);
  }
});
