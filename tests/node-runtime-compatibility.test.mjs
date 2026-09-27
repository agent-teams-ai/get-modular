import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function materializeTypeScript(sourceRoot, outputRoot) {
  async function visit(path) {
    const target = join(outputRoot, relative(sourceRoot, path).replace(/\.ts$/u, ".js"));
    await mkdir(dirname(target), { recursive: true });
    const source = await readFile(path, "utf8");
    await writeFile(target, stripTypeScriptTypes(source, { mode: "strip" }));
  }

  async function walk(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).toSorted(
      (left, right) => left.name.localeCompare(right.name),
    )) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith(".ts")) await visit(path);
    }
  }

  await walk(sourceRoot);
}

async function createRuntimeFixture() {
  const root = await mkdtemp(join(tmpdir(), "get-modular-node-runtime-"));
  try {
    await materializeTypeScript(join(repository, "packages/core/src"), join(root, "core"));
    await materializeTypeScript(join(repository, "packages/assembly/src"), join(root, "assembly"));

    const packageRoot = join(root, "node_modules/@get-modular/core");
    await mkdir(packageRoot, { recursive: true });
    await writeFile(join(packageRoot, "package.json"), JSON.stringify({
      name: "@get-modular/core",
      type: "module",
      exports: { ".": "./index.js" },
    }));
    await writeFile(join(packageRoot, "index.js"), [
      'import { root } from "../../../core/composition/stage0.js";',
      "export const compileComposition = root.compileComposition;",
      "export const compileCompositionJson = root.compileCompositionJson;",
      'export { defineModule } from "../../../core/features/authoring/internal.js";',
    ].join("\n"));

    return {
      root,
      core: await import(pathToFileURL(join(root, "core/composition/stage0.js"))),
      assembly: await import(pathToFileURL(join(root, "assembly/index.js"))),
    };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

test("production source uses the current Node runtime surface without generated output", async () => {
  const fixture = await createRuntimeFixture();
  try {
    const { defineModule } = await import(
      pathToFileURL(join(fixture.root, "node_modules/@get-modular/core/index.js"))
    );
    const compatibility = Object.freeze({
      family: "exact",
      familyVersion: 1,
      token: "smoke/value/v1",
    });
    const provider = defineModule({
      kind: "get-modular.module-declaration",
      schemaVersion: 1,
      moduleId: "smoke/provider",
      implementationId: "smoke/provider/default",
      owner: { authority: "smoke", path: ["provider"] },
      provides: [{ capabilityId: "smoke/value", compatibility }],
      slots: [],
    });
    const consumer = defineModule({
      kind: "get-modular.module-declaration",
      schemaVersion: 1,
      moduleId: "smoke/consumer",
      implementationId: "smoke/consumer/default",
      owner: { authority: "smoke", path: ["consumer"] },
      provides: [],
      slots: [{
        slotId: "value",
        capabilityId: "smoke/value",
        compatibility,
        cardinality: { kind: "required" },
      }],
    });
    const composition = await fixture.core.root.compileComposition({
      declarations: [provider, consumer],
      profile: {
        kind: "get-modular.composition-profile",
        schemaVersion: 1,
        profileId: "smoke/profile",
        roots: [consumer.moduleId],
        selections: [provider, consumer].map(({ moduleId, implementationId }) => ({
          moduleId,
          implementationId,
        })),
        bindings: [{
          consumerImplementationId: consumer.implementationId,
          slotId: "value",
          providerImplementationIds: [provider.implementationId],
        }],
      },
    });
    assert.equal(composition.ok, true, JSON.stringify(composition.diagnostics));
    assert.match(composition.digest, /^gm-plan:v1:sha-256:/u);

    const api = fixture.assembly.assemblyFor();
    const providerFactory = api.bindFactory(provider, async () => ({
      instance: { provider: true },
      capabilities: { "smoke/value": 42 },
    }));
    const consumerFactory = api.bindFactory(consumer, async (dependencies) => ({
      instance: dependencies.value,
      capabilities: {},
    }));
    const preparation = await api.prepare({
      composition,
      factories: [providerFactory, consumerFactory],
      roots: { consumer: consumerFactory },
    });
    assert.equal(preparation.status, "prepared");
    const outcome = await preparation.prepared.run();
    assert.equal(outcome.status, "succeeded");
    assert.equal(outcome.roots.consumer, 42);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
