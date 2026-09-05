import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { authoringScale } from "../../../../../tests/qualification/support/type-scale.mjs";

const require = createRequire(import.meta.url);
const tsc = join(dirname(require.resolve("typescript/package.json")), "bin/tsc");
const subject = fileURLToPath(new URL("../../../dist-test/features/authoring/internal.js", import.meta.url));
const importPath = JSON.stringify(subject.replaceAll("\\", "/"));
const canonicalPortPath = JSON.stringify(fileURLToPath(new URL("../../../dist-test/features/canonicalization/ports.js", import.meta.url)).replaceAll("\\", "/"));
const root = new URL("../../../../../", import.meta.url);
const diagnostics = JSON.parse(await readFile(new URL("architecture/qualification/v1/diagnostic-contract.json", root), "utf8"));
const snapshots = JSON.parse(await readFile(new URL("architecture/qualification/v1/diagnostic-snapshots.json", root), "utf8"));

async function compile(t, files, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), "gm-authoring-types-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "package.json"), '{"type":"module","private":true}\n');
  for (const [path, text] of Object.entries(files)) await writeFile(join(directory, path), text);
  await writeFile(join(directory, "tsconfig.json"), JSON.stringify({
    compilerOptions: { target: "ES2024", module: "NodeNext", moduleResolution: "NodeNext", strict: true, exactOptionalPropertyTypes: true, noEmit: true, skipLibCheck: false, types: [], ...options },
    files: Object.keys(files),
  }));
  const result = spawnSync(process.execPath, [tsc, "-p", join(directory, "tsconfig.json"), "--pretty", "false"], { encoding: "utf8", timeout: 30_000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
}

const world = `
const declaration = defineModule({
  kind: "get-modular.module-declaration", schemaVersion: 1,
  moduleId: "example/consumer", implementationId: "example/consumer/default",
  owner: { authority: "example", path: ["consumer"] }, provides: [],
  slots: [{ slotId: "items", capabilityId: "example/item", compatibility: { family: "exact", familyVersion: 1, token: "example/item/v1" }, cardinality: many({ min: 0, max: 3 }) }],
});
const identity: "example/consumer" = declaration.moduleId;
const slot: "items" = declaration.slots[0].slotId;
const declared: ModuleDeclaration = declaration;
declare const canonicalizer: import(${canonicalPortPath}).CanonicalBytesPort;
canonicalizer.canonicalize(declared);
const profile = {
  kind: "get-modular.composition-profile", schemaVersion: 1, profileId: "example/default",
  roots: ["example/consumer"], selections: [{ moduleId: declaration.moduleId, implementationId: declaration.implementationId }],
  bindings: [{ consumerImplementationId: declaration.implementationId, slotId: "items", providerImplementationIds: [] }],
} satisfies CompositionProfile;
canonicalizer.canonicalize(profile);
const duplicateProviders: CompositionProfile = { ...profile, bindings: [{ ...profile.bindings[0], providerImplementationIds: ["example/item/a", "example/item/a"] }] };
const requiredRecord = required(); requiredRecord.kind = "required";
const optionalRecord = optional(); optionalRecord.kind = "optional";
const manyRecord = many({ min: 0, max: 0 }); manyRecord.max = 4;
// @ts-expect-error required takes no options
required({});
// @ts-expect-error optional takes no options
optional(1);
// @ts-expect-error many requires one min/max record
many(0, 1);
// @ts-expect-error no default max
many({ min: 0 });
// @ts-expect-error bound must be numeric
many({ min: "0", max: 1 });
// @ts-expect-error no additional helper option
many({ min: 0, max: 1, mode: "hidden" });
// @ts-expect-error wire version must be the accepted literal
defineModule({ ...declaration, schemaVersion: 2 });
// @ts-expect-error satisfies catches a fresh excess field
const excess = { ...declaration, unknown: true } satisfies ModuleDeclaration;
// Structural typing intentionally permits pre-existing extra fields; the compiler validates them.
const extended = { ...declaration, unknown: true };
const structurallyAssignable: ModuleDeclaration = extended;
const preservedExtra: true = defineModule({ ...declaration, unknown: true }).unknown;
`;

for (const mode of ["NodeNext", "Bundler"]) {
  test(`built authoring declarations preserve literals and reject invalid shapes in ${mode}`, async t => {
    await compile(t, { "case.ts": `import { defineModule, required, optional, many, type ModuleDeclaration, type CompositionProfile } from ${importPath};\n${world}` }, mode === "Bundler" ? { module: "ESNext", moduleResolution: "Bundler" } : {});
  });
}

test("diagnostics match accepted snapshots, emittable codes and code-specific details", async t => {
  const codes = diagnostics.codeDisposition.emittable;
  const expected = codes.map(JSON.stringify).join(" | ");
  const records = snapshots.snapshots.map(item => item.diagnostic);
  const snapshotAssertions = records.map((record, index) => `const snapshot${index} = ${JSON.stringify(record)} satisfies Diagnostic;`).join("\n");
  const malformedAssertions = records.map((record, index) => {
    const malformed = { ...record, details: { unexpected: true } };
    return `// @ts-expect-error accepted variant requires its own closed details\nconst malformed${index} = ${JSON.stringify(malformed)} satisfies Diagnostic;`;
  }).join("\n");
  const text = `import type { Diagnostic, DiagnosticCode, CompileCompositionResult } from ${importPath};
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
${snapshotAssertions}
${malformedAssertions}
const exact: Equal<DiagnosticCode, ${expected}> = true;
const derived: Equal<DiagnosticCode, Diagnostic['code']> = true;
const complete: Record<DiagnosticCode, string> = ${JSON.stringify(Object.fromEntries(codes.map(code => [code, code])))};
// @ts-expect-error missing real code
const incomplete: Record<DiagnosticCode, string> = {};
// @ts-expect-error reserved failure is never emittable
const reserved: DiagnosticCode = 'output.canonicalization-failed';
function narrow(diagnostic: Diagnostic) {
  if (diagnostic.code === 'binding.compatibility-mismatch') {
    const token: string = diagnostic.details.expectedCompatibility.token;
    const provider: string = diagnostic.coordinate.providerImplementationId;
    // @ts-expect-error this variant has no reason
    diagnostic.details.reason;
  }
  if (diagnostic.code === 'graph.cycle') {
    const component: readonly string[] = diagnostic.details.component;
    // @ts-expect-error graph.cycle has no omitted counter
    diagnostic.details.omitted;
  }
}
function result(value: CompileCompositionResult) {
  if (value.ok) {
    const digest: string = value.digest;
    // @ts-expect-error success has no diagnostics
    value.diagnostics;
  } else {
    const errors: readonly Diagnostic[] = value.diagnostics;
    // @ts-expect-error failure has no plan
    value.plan;
  }
}
`;
  await compile(t, { "case.ts": text });
});

test("1000 distinct authored declarations preserve their literal identities", async t => {
  await compile(t, { "case.ts": `import { defineModule, type ModuleDeclaration } from ${importPath};\n${authoringScale}` });
});

test("JavaScript checkJs callers retain mutable helper types", async t => {
  await compile(t, { "case.js": `// @ts-check\nimport { required, optional, many } from ${importPath};
/** @type {'required'} */ const r = required().kind;
/** @type {'optional'} */ const o = optional().kind;
const cardinality = many({ min: 0, max: 2 }); cardinality.max = 3;
// @ts-expect-error numeric bounds only
many({ min: '0', max: 2 });
// @ts-expect-error required has no arguments
required({});
` }, { allowJs: true, checkJs: true });
});
