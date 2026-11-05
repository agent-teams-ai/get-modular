import assert from "node:assert/strict";
import test from "node:test";
import { assemblyFor, declareModule, defineContract, implement, type CapabilitiesOf } from "@get-modular/assembly";

const Value = defineContract<number>()({ id: "census/value", revision: 1 });
type Capabilities = CapabilitiesOf<typeof Value>;

test("repeated implementation IDs are sorted by ID, preserve every occurrence and invoke no factories", async () => {
  let calls = 0;
  const make = (name: string) => {
    const declaration = declareModule({
      moduleId: `census/${name}`,
      implementationId: `census/${name}`,
      owner: { authority: "census", path: [name] },
      provides: [Value.provide()],
      slots: [],
    });
    return implement<Capabilities>()(declaration, async () => {
      calls += 1;
      return { instance: name, capabilities: { [Value.id]: 1 } };
    });
  };

  const z = make("z");
  const a = make("a");
  const result = await assemblyFor<Capabilities>().prepare({
    profileId: "census/profile",
    modules: [z, a, z, a] as const,
    roots: { root: z },
  });
  assert.equal(result.status, "failed");
  if (result.status !== "failed") throw new Error("duplicate implementations unexpectedly prepared");
  assert.equal(result.error.code, "assembly.prepare.duplicate-module");
  assert.deepEqual(result.error.cause, [
    { implementationId: "census/a", paths: [[], []], inputs: [] },
    { implementationId: "census/z", paths: [[], []], inputs: [] },
  ]);
  assert.equal(calls, 0);
});
