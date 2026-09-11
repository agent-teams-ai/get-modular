import { pathToFileURL } from "node:url";
import { compileComposition, defineModule, required } from "@get-modular/core";
import { assemblyFor } from "@get-modular/assembly";

const exact = (token) => ({ family: "exact", familyVersion: 1, token });
const capability = (capabilityId, token) => ({
  capabilityId,
  compatibility: exact(token),
});

const configuration = defineModule({
  kind: "get-modular.module-declaration",
  schemaVersion: 1,
  moduleId: "example/configuration",
  implementationId: "example/configuration/environment",
  owner: { authority: "example", path: ["configuration"] },
  provides: [capability("example/configuration", "example/configuration/v1")],
  slots: [],
});

const greeting = defineModule({
  kind: "get-modular.module-declaration",
  schemaVersion: 1,
  moduleId: "example/greeting",
  implementationId: "example/greeting/default",
  owner: { authority: "example", path: ["greeting"] },
  provides: [capability("example/greeting", "example/greeting/v1")],
  slots: [{
    slotId: "configuration",
    ...capability("example/configuration", "example/configuration/v1"),
    cardinality: required(),
  }],
});

const application = defineModule({
  kind: "get-modular.module-declaration",
  schemaVersion: 1,
  moduleId: "example/application",
  implementationId: "example/application/default",
  owner: { authority: "example", path: ["application"] },
  provides: [],
  slots: [{
    slotId: "greeting",
    ...capability("example/greeting", "example/greeting/v1"),
    cardinality: required(),
  }],
});

const declarations = [configuration, greeting, application];
const profile = {
  kind: "get-modular.composition-profile",
  schemaVersion: 1,
  profileId: "example/basic-host",
  roots: [application.moduleId],
  selections: declarations.map(({ moduleId, implementationId }) => ({
    moduleId,
    implementationId,
  })),
  bindings: [
    {
      consumerImplementationId: greeting.implementationId,
      slotId: "configuration",
      providerImplementationIds: [configuration.implementationId],
    },
    {
      consumerImplementationId: application.implementationId,
      slotId: "greeting",
      providerImplementationIds: [greeting.implementationId],
    },
  ],
};

async function disposeCreated(created) {
  await using resources = new AsyncDisposableStack();
  const registered = new Set();
  for (const entry of created) {
    for (const value of [entry.instance, ...Object.values(entry.capabilities)]) {
      if (registered.has(value)) continue;
      if (value && typeof value[Symbol.asyncDispose] === "function") {
        registered.add(value);
        resources.use(value);
      } else if (value && typeof value[Symbol.dispose] === "function") {
        registered.add(value);
        resources.use(value);
      }
    }
  }
}

export async function runBasicHost({ signal, onConfigurationDisposed } = {}) {
  const composition = await compileComposition({ declarations, profile });
  if (!composition.ok) {
    throw new Error(`Invalid composition: ${composition.diagnostics.map(({ code }) => code).join(", ")}`);
  }

  const api = assemblyFor();
  const configurationHandle = api.bindFactory(configuration, async () => {
    const value = {
      audience: "consumer",
      [Symbol.asyncDispose]: async () => onConfigurationDisposed?.(),
    };
    return { instance: value, capabilities: { "example/configuration": value } };
  });
  const greetingHandle = api.bindFactory(greeting, async ({ configuration }) => ({
    instance: {},
    capabilities: {
      "example/greeting": {
        greet: (name) => `Hello ${name}, from ${configuration.audience}`,
      },
    },
  }));
  const applicationHandle = api.bindFactory(application, async ({ greeting }) => ({
    instance: { run: (name) => greeting.greet(name) },
    capabilities: {},
  }));

  const preparation = await api.prepare({
    composition,
    factories: [configurationHandle, greetingHandle, applicationHandle],
    roots: { application: applicationHandle },
  });
  if (preparation.status === "failed") throw preparation.error;

  const outcome = await preparation.prepared.run({ signal });
  try {
    if (outcome.status !== "succeeded") return outcome;
    return { ...outcome, message: outcome.roots.application.run("modules") };
  } finally {
    await disposeCreated(outcome.created);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outcome = await runBasicHost();
  if (outcome.status !== "succeeded") {
    process.exitCode = 1;
  } else {
    console.log(outcome.message);
  }
}
