import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolveNpmCli, resolvePnpmCli } from "./qualification/support/npm-cli.mjs";
import { assertSupportedToolingNodeVersion } from "../architecture/checks/node-version.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageNames = ["core", "assembly", "resources", "conformance"];

// The Node 26 CI consumer is outside the source workspace. Its package manager
// must be the physically provisioned source pin, not a shim selected by cwd.
async function fixturePnpmCli() {
  return process.env.GET_MODULAR_COMPAT_PNPM_CLI || await resolvePnpmCli();
}

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
import * as resources from "@get-modular/resources";
import * as conformance from "@get-modular/conformance";

const require = createRequire(import.meta.url);
for (const [name, namespace, expected] of [
  ["core", core, ["compileComposition", "compileCompositionJson", "defineModule", "many", "optional", "required"]],
  ["assembly", assembly, ["AssemblyBindingError", "assemblyFor", "declareModule", "defineContract"]],
  ["resources", resources, ["CloseIncompleteError", "InvalidArgumentError", "ScopeClosedError", "createScope", "scoped"]],
  ["conformance", conformance, ["ConformanceError", "checkNamespaces", "contractSuite", "guardHandles", "isolate", "runContractSuite", "smoke"]],
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
const released = [];
const consumerFactory = api.bindFactory(consumer, resources.scoped(consumer.implementationId,
  async (dependencies, { resources: scope }) => {
    await scope.setup({ name: "value", setup: () => dependencies.value, cleanup: (value) => { released.push(value); } });
    return { instance: dependencies.value, capabilities: {} };
  }));
const preparation = await api.prepare({ composition,
  factories: [providerFactory, consumerFactory], roots: { consumer: consumerFactory } });
assert.equal(preparation.status, "prepared", JSON.stringify(preparation));
const attempt = resources.createScope({ name: "attempt" });
const outcome = await preparation.prepared.run({ scope: attempt.resources });
assert.equal(outcome.status, "succeeded", JSON.stringify(outcome));
assert.equal(outcome.roots.consumer, 42);
assert.deepEqual(await attempt.control.close(), { complete: true, settled: true, debts: [] });
assert.deepEqual(released, [42]);
const isolated = await conformance.isolate(api, {
  declaration: consumer, dependencies: { value: 42 },
  factory: async (dependencies) => ({ instance: dependencies.value, capabilities: {} }),
});
assert.equal(isolated.instance, 42);
assert.equal((await isolated.close()).complete, true);
console.log("public-consumer:passed");
`;

test("disposable installed public roots compile and assemble on the selected Node runtime", { timeout: 300000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "get-modular-node-runtime-"));
  try {
    let archiveDirectory = process.env.GET_MODULAR_COMPAT_ARCHIVE_DIR;
    if (!archiveDirectory) {
      // Actual root lanes pack their fresh build on the runtime being qualified.
      assertSupportedToolingNodeVersion();
      archiveDirectory = join(root, "archives");
      await mkdir(archiveDirectory);
      const pnpm = await fixturePnpmCli();
      for (const name of packageNames) {
        const result = run(process.execPath, [pnpm, "pack", "--pack-destination", archiveDirectory],
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
    const npm = await resolveNpmCli();
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

test("pinned pnpm rejects fresh and locked invalid peer graphs", { timeout: 180000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "get-modular-node-peer-"));
  try {
    // This marker must precede every pnpm invocation in the fixture, including pack.
    await writeFile(join(root, "pnpm-workspace.yaml"),
      "packages: []\nstrictPeerDependencies: true\nautoInstallPeers: false\n");
    const expectedPnpm = JSON.parse(await readFile(join(repository, "package.json"), "utf8")).packageManager;
    assert.equal(expectedPnpm, "pnpm@11.20.0");
    const pnpm = await fixturePnpmCli();
    const version = run(process.execPath, [pnpm, "--version"], root);
    assert.equal(version.status, 0, version.stderr);
    assert.equal(`pnpm@${version.stdout.trim()}`, expectedPnpm);

    for (const [name, manifest] of [
      ["peer-api", { name: "peer-api", version: "1.0.0" }],
      ["peer-consumer", { name: "peer-consumer", version: "1.0.0",
        peerDependencies: { "peer-api": "^2.0.0" } }],
    ]) {
      const source = join(root, "sources", name);
      await mkdir(source, { recursive: true });
      await writeFile(join(source, "package.json"), JSON.stringify(manifest));
      const packed = run(process.execPath, [pnpm, "pack", "--pack-destination", root], source);
      assert.equal(packed.status, 0, `${name} pack: ${packed.stdout}\n${packed.stderr}`);
    }
    await writeFile(join(root, "package.json"), JSON.stringify({
      name: "invalid-peer-graph-fixture", private: true, packageManager: expectedPnpm,
      dependencies: {
        "peer-api": "file:peer-api-1.0.0.tgz",
        "peer-consumer": "file:peer-consumer-1.0.0.tgz",
      },
    }));
    const invoke = (...args) => run(process.execPath, [pnpm, ...args], root);
    const fresh = invoke("install", "--lockfile-only", "--offline", "--ignore-scripts");
    assert.notEqual(fresh.status, 0, "fresh resolution accepted an invalid peer graph");
    assert.match(fresh.stdout + fresh.stderr, /ERR_PNPM_PEER_DEP_ISSUES/u);

    // Reproduce a lockfile generated under relaxed policy, then test the actual frozen gate.
    const relaxed = invoke("install", "--lockfile-only", "--offline", "--ignore-scripts",
      "--config.strict-peer-dependencies=false");
    assert.equal(relaxed.status, 0, `relaxed lock creation: ${relaxed.stdout}\n${relaxed.stderr}`);
    const frozen = invoke("install", "--frozen-lockfile", "--offline", "--ignore-scripts");
    assert.equal(frozen.status, 0, `frozen install: ${frozen.stdout}\n${frozen.stderr}`);
    const checked = invoke("peers", "check", "--lockfile-only");
    assert.notEqual(checked.status, 0, "lock graph check accepted an invalid peer graph");
    assert.match(checked.stdout + checked.stderr, /unmet peer peer-api/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("pinned pnpm enforces dependency engines on fresh and frozen installs", { timeout: 180000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "get-modular-node-engine-"));
  try {
    const workspace = await readFile(join(repository, "pnpm-workspace.yaml"), "utf8");
    const formerWorkspace = workspace.replace(/^engineStrict: true\n/mu, "");
    assert.notEqual(formerWorkspace, workspace, "workspace must enable pnpm's supported engineStrict setting");
    // Every pnpm invocation in this fixture has its own workspace configuration.
    await writeFile(join(root, "pnpm-workspace.yaml"), formerWorkspace);
    await writeFile(join(root, ".npmrc"), await readFile(join(repository, ".npmrc")));

    const expectedPnpm = JSON.parse(await readFile(join(repository, "package.json"), "utf8")).packageManager;
    assert.equal(expectedPnpm, "pnpm@11.20.0");
    assert.match(process.version, /^v(?:24|26)\./u);
    const pnpm = await fixturePnpmCli();
    const invoke = (...args) => run(process.execPath, [pnpm, ...args], root);
    const version = invoke("--version");
    assert.equal(version.status, 0, version.stderr);
    assert.equal(`pnpm@${version.stdout.trim()}`, expectedPnpm);

    for (const [name, engine] of [["bad-engine", "<1"], ["good-engine", ">=24 <27"]]) {
      const source = join(root, "sources", name);
      await mkdir(source, { recursive: true });
      await writeFile(join(source, "package.json"), JSON.stringify({
        name, version: "1.0.0", engines: { node: engine },
      }));
      const packed = run(process.execPath, [pnpm, "pack", "--pack-destination", root], source);
      assert.equal(packed.status, 0, `${name} pack: ${packed.stdout}\n${packed.stderr}`);
    }

    const manifest = (name) => JSON.stringify({
      name: "engine-enforcement-fixture", private: true, packageManager: expectedPnpm,
      dependencies: { [name]: `file:${name}-1.0.0.tgz` },
    });
    await writeFile(join(root, "package.json"), manifest("bad-engine"));
    const baselineFresh = invoke("install", "--offline", "--ignore-scripts");
    assert.equal(baselineFresh.status, 0, `former fresh install: ${baselineFresh.stdout}\n${baselineFresh.stderr}`);
    await rm(join(root, "node_modules"), { recursive: true, force: true });
    const baselineFrozen = invoke("install", "--frozen-lockfile", "--offline", "--ignore-scripts");
    assert.equal(baselineFrozen.status, 0, `former frozen install: ${baselineFrozen.stdout}\n${baselineFrozen.stderr}`);

    await writeFile(join(root, "pnpm-workspace.yaml"), workspace);
    const setting = invoke("config", "get", "engineStrict");
    assert.equal(setting.status, 0, setting.stderr);
    assert.equal(setting.stdout.trim(), "true");
    const frozen = invoke("install", "--frozen-lockfile", "--offline", "--ignore-scripts");
    assert.notEqual(frozen.status, 0, "frozen install accepted an incompatible dependency engine");
    assert.match(frozen.stdout + frozen.stderr, /ERR_PNPM_UNSUPPORTED_ENGINE/u);

    await rm(join(root, "pnpm-lock.yaml"), { force: true });
    await rm(join(root, "node_modules"), { recursive: true, force: true });
    const fresh = invoke("install", "--offline", "--ignore-scripts");
    assert.notEqual(fresh.status, 0, "fresh install accepted an incompatible dependency engine");
    assert.match(fresh.stdout + fresh.stderr, /ERR_PNPM_UNSUPPORTED_ENGINE/u);

    await writeFile(join(root, "package.json"), manifest("good-engine"));
    const validFresh = invoke("install", "--offline", "--ignore-scripts");
    assert.equal(validFresh.status, 0, `valid fresh install: ${validFresh.stdout}\n${validFresh.stderr}`);
    await rm(join(root, "node_modules"), { recursive: true, force: true });
    const validFrozen = invoke("install", "--frozen-lockfile", "--offline", "--ignore-scripts");
    assert.equal(validFrozen.status, 0, `valid frozen install: ${validFrozen.stdout}\n${validFrozen.stderr}`);
    t.diagnostic(`Node ${process.version} (${process.execPath}), ${expectedPnpm}: former bad fresh/frozen accepted; ` +
      "workspace engineStrict rejected bad fresh/frozen with ERR_PNPM_UNSUPPORTED_ENGINE; " +
      "good fresh/frozen accepted");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
