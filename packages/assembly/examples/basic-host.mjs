import { pathToFileURL } from "node:url";
import { compileComposition, defineModule, required } from "@get-modular/core";
import { assemblyFor } from "../dist/index.js";

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

// The caller retains ownership of this borrowed work port.
const defaultGreetingPort = {
  greet: (name, audience) => `Hello ${name}, from ${audience}`,
};

export function basicHostExitCode(outcome) {
  return outcome.status === "succeeded" && !Object.hasOwn(outcome, "cleanupFailure") ? 0 : 1;
}

export async function runBasicHost({
  signal, onConfigurationDisposed, greetingPort = defaultGreetingPort,
} = {}) {
  const composition = await compileComposition({ declarations, profile });
  if (!composition.ok) {
    throw new Error(`Invalid composition: ${composition.diagnostics.map(({ code }) => code).join(", ")}`);
  }

  const resources = new AsyncDisposableStack();
  const api = assemblyFor();
  const configurationHandle = api.bindFactory(configuration, async () => {
    const resource = { audience: "consumer" };
    resources.defer(async () => onConfigurationDisposed?.());
    // Distinct wrappers share one resource; neither receives cleanup authority.
    const value = { get audience() { return resource.audience; } };
    return { instance: { configuration: value }, capabilities: { "example/configuration": value } };
  });
  const greetingHandle = api.bindFactory(greeting, async ({ configuration }) => {
    const greet = greetingPort.greet;
    return {
      instance: {},
      capabilities: {
        "example/greeting": {
          greet: (name) => greet.call(greetingPort, name, configuration.audience),
        },
      },
    };
  });
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

  let result;
  let phase = "run";
  let createdImplementationIds = [];
  let cleanupFailure;
  try {
    const outcome = await preparation.prepared.run({ signal });
    createdImplementationIds = outcome.created.map(({ implementationId }) => implementationId);
    if (outcome.status === "succeeded") {
      phase = "use";
      const message = await outcome.roots.application.run("modules");
      result = { status: "succeeded", message, createdImplementationIds };
    } else if (outcome.status === "cancelled") {
      result = { status: "cancelled", reason: outcome.reason, createdImplementationIds };
    } else {
      result = {
        status: "failed", phase: outcome.phase, code: outcome.code,
        implementationId: outcome.implementationId, cause: outcome.cause,
        cancellation: outcome.cancellation, createdImplementationIds,
      };
    }
  } catch (cause) {
    result = { status: "failed", phase, cause, createdImplementationIds };
  } finally {
    try {
      await resources.disposeAsync();
    } catch (cause) {
      cleanupFailure = { cause };
    }
  }
  if (cleanupFailure) result.cleanupFailure = cleanupFailure;
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outcome = await runBasicHost();
  process.exitCode = basicHostExitCode(outcome);
  if (process.exitCode === 0) console.log(outcome.message);
}
