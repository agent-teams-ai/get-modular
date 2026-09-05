import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const tsc = join(dirname(require.resolve("typescript/package.json")), "bin/tsc");
const subject = path => JSON.stringify(fileURLToPath(new URL(`../../../dist/features/${path}.js`, import.meta.url)).replaceAll("\\", "/"));

test("built module contracts join structurally and enforce their exact dependency keys", async t => {
  const directory = await mkdtemp(join(tmpdir(), "gm-module-contracts-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "package.json"), '{"type":"module","private":true}\n');
  await writeFile(join(directory, "case.ts"), `
import { createInputAdmission } from ${subject("input-admission/factory")};
import { createCompositionSemantics } from ${subject("composition-semantics/factory")};
import type { SemanticInput, CanonicalBytesPort as ConsumerCanonicalizer } from ${subject("composition-semantics/ports")};
import type { CanonicalBytesPort as ProviderCanonicalizer } from ${subject("canonicalization/ports")};
declare const provider: ProviderCanonicalizer;
const consumed: ConsumerCanonicalizer = provider;
const admission = createInputAdmission({});
const semantics = createCompositionSemantics({ canonicalizer: consumed });
const collector = semantics.newCollector();
const admitted: SemanticInput = admission.admitObjectInput({ declarations: [], profile: null }, collector);
semantics.analyze(admitted, collector);
// @ts-expect-error M1 admission has no scanner dependency
createInputAdmission({ scanner: provider });
// @ts-expect-error canonicalizer is a required dependency
createCompositionSemantics({});
// @ts-expect-error dependencies have no additional arbitrary keys
createCompositionSemantics({ canonicalizer: provider, fallback: provider });
// @ts-expect-error driven port requires canonical bytes, not a string
createCompositionSemantics({ canonicalizer: { canonicalize: () => "bytes" } });
// @ts-expect-error admitted semantic data is readonly
admitted.profile = null;
`);
  await writeFile(join(directory, "tsconfig.json"), JSON.stringify({
    compilerOptions: { target: "ES2024", module: "NodeNext", moduleResolution: "NodeNext", strict: true,
      exactOptionalPropertyTypes: true, noEmit: true, skipLibCheck: false, types: [] }, files: ["case.ts"],
  }));
  const result = spawnSync(process.execPath, [tsc, "-p", join(directory, "tsconfig.json"), "--pretty", "false"], {
    encoding: "utf8", timeout: 30_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
