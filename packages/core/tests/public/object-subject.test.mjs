import test from "node:test";
import { compileComposition } from "../../dist/index.js";
import { compileComposition as direct } from "../../dist-stage0/self-composition/stage0-entry.js";
import { objectSubjectCases } from "../../../../tests/qualification/support/object-subject-cases.mjs";

for (const [name, compile] of [["production", compileComposition], ["direct", direct]]) {
  for (const fixture of objectSubjectCases) test(`public M1 ${name} ${fixture.id}`, async () => {
    await fixture.run(compile);
  });
}
