import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageNames = ["core", "assembly"];

function run(executable, args, cwd, environment = {}) {
  const result = spawnSync(executable, args, {
    cwd, encoding: "utf8", timeout: 180000,
    env: { ...process.env, NODE_OPTIONS: "", ...environment },
  });
  if (result.error) throw result.error;
  return result;
}

async function archivesIn(directory) {
  const archives = {};
  for (const name of packageNames) {
    const manifest = JSON.parse(await readFile(join(repository, "packages", name, "package.json"), "utf8"));
    archives[manifest.name] = join(directory, `get-modular-${name}-${manifest.version}.tgz`);
    await readFile(archives[manifest.name]);
  }
  return archives;
}

const consumerSource = `
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as core from "@get-modular/core";
import * as assembly from "@get-modular/assembly";

const require = createRequire(import.meta.url);
for (const [name, namespace, expected] of [
  ["core", core, ["compileComposition", "compileCompositionJson", "defineModule", "many", "optional", "required"]],
  ["assembly", assembly, ["AssemblyBindingError", "assemblyFor"]],
]) {
  const specifier = "@get-modular/" + name;
  assert.deepEqual(Object.keys(namespace).sort(), expected.sort());
  assert.equal(require(specifier), namespace);
  assert.equal(import.meta.resolve(specifier), new URL("./node_modules/" + specifier + "/dist/index.js", import.meta.url).href);
  for (const subpath of ["dist/index.js", "package.json", "unknown"]) {
    await assert.rejects(() => import(specifier + "/" + subpath), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
  }
}

const compatibility = { family: "exact", familyVersion: 1, token: "smoke/value/v1" };
const provider = core.defineModule({
  kind: "get-modular.module-declaration", schemaVersion: 1,
  moduleId: "smoke/provider", implementationId: "smoke/provider/default",
  owner: { authority: "smoke", path: ["provider"] },
  provides: [{ capabilityId: "smoke/value", compatibility }], slots: [],
});
const consumer = core.defineModule({
  kind: "get-modular.module-declaration", schemaVersion: 1,
  moduleId: "smoke/consumer", implementationId: "smoke/consumer/default",
  owner: { authority: "smoke", path: ["consumer"] }, provides: [],
  slots: [{ slotId: "value", capabilityId: "smoke/value", compatibility,
    cardinality: { kind: "required" } }],
});
const composition = await core.compileComposition({
  declarations: [provider, consumer],
  profile: {
    kind: "get-modular.composition-profile", schemaVersion: 1,
    profileId: "smoke/profile", roots: [consumer.moduleId],
    selections: [provider, consumer].map(({ moduleId, implementationId }) => ({ moduleId, implementationId })),
    bindings: [{ consumerImplementationId: consumer.implementationId,
      slotId: "value", providerImplementationIds: [provider.implementationId] }],
  },
});
assert.equal(composition.ok, true, JSON.stringify(composition.diagnostics));
assert.match(composition.digest, /^gm-plan:v1:sha-256:/u);
const api = assembly.assemblyFor();
const providerFactory = api.bindFactory(provider, async () => ({
  instance: { provider: true }, capabilities: { "smoke/value": 42 },
}));
const consumerFactory = api.bindFactory(consumer, async (dependencies) => ({
  instance: dependencies.value, capabilities: {},
}));
const preparation = await api.prepare({ composition,
  factories: [providerFactory, consumerFactory], roots: { consumer: consumerFactory } });
assert.equal(preparation.status, "prepared", JSON.stringify(preparation));
const outcome = await preparation.prepared.run();
assert.equal(outcome.status, "succeeded", JSON.stringify(outcome));
assert.equal(outcome.roots.consumer, 42);
console.log("public-consumer:passed");
`;

test("disposable installed public roots compile and assemble on the selected Node runtime", { timeout: 300000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "get-modular-node-runtime-"));
  try {
    let archiveDirectory = process.env.GET_MODULAR_COMPAT_ARCHIVE_DIR;
    if (!archiveDirectory) {
      assert.equal(process.versions.node.split(".")[0], "24",
        "Node 26 requires archives built and packed under the qualified Node 24 toolchain");
      archiveDirectory = join(root, "archives");
      await mkdir(archiveDirectory);
      for (const name of packageNames) {
        const result = run("pnpm", ["pack", "--pack-destination", archiveDirectory],
          join(repository, "packages", name));
        assert.equal(result.status, 0, `${name} pack: ${result.stdout}\n${result.stderr}`);
      }
    }
    const archives = await archivesIn(archiveDirectory);
    const consumer = join(root, "consumer");
    await mkdir(consumer);
    await writeFile(join(consumer, "package.json"), JSON.stringify({
      name: "get-modular-node-compatibility-consumer", private: true, type: "module",
      dependencies: Object.fromEntries(Object.entries(archives).map(([name, archive]) => [name, `file:${archive}`])),
    }));
    const npm = join(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js");
    const install = run(process.execPath, [npm, "install", "--offline", "--ignore-scripts",
      "--no-audit", "--no-fund", "--package-lock=false"], consumer, {
      npm_config_cache: join(root, "npm-cache"), npm_config_engine_strict: "true",
    });
    assert.equal(install.status, 0, `disposable install: ${install.stdout}\n${install.stderr}`);
    for (const name of packageNames) {
      const manifest = JSON.parse(await readFile(join(consumer, "node_modules/@get-modular", name, "package.json"), "utf8"));
      assert.deepEqual(manifest.exports, { ".": {
        import: { types: "./dist/index.d.ts", default: "./dist/index.js" },
        default: "./dist/index.js",
      } });
    }
    await writeFile(join(consumer, "run.mjs"), consumerSource);
    const good = run(process.execPath, ["run.mjs"], consumer);
    assert.equal(good.status, 0, `public consumer: ${good.stdout}\n${good.stderr}`);
    assert.match(good.stdout, /public-consumer:passed/u);

    // Independent red case: the same consumer must reject a broken installed public entry.
    await writeFile(join(consumer, "node_modules/@get-modular/core/dist/index.js"),
      "export const brokenPublicEntry = true;\n");
    const broken = run(process.execPath, ["run.mjs"], consumer);
    assert.notEqual(broken.status, 0, "consumer accepted a broken Core public entry");
    assert.match(broken.stderr, /does not provide an export named 'compileComposition'/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
