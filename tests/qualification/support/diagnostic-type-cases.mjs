import { readFile } from "node:fs/promises";

const root = new URL("../../../", import.meta.url);
const diagnostics = JSON.parse(await readFile(new URL("architecture/qualification/v1/diagnostic-contract.json", root), "utf8"));
const snapshots = JSON.parse(await readFile(new URL("architecture/qualification/v1/diagnostic-snapshots.json", root), "utf8"));
const catalog = JSON.parse(await readFile(new URL("architecture/contracts/v1/diagnostic-catalog.json", root), "utf8"));

// Independent accepted vectors, shared by source and installed-root consumers.
export function diagnosticTypeCase(importSpecifier) {
  const codes = diagnostics.codeDisposition.emittable;
  const expected = codes.map(JSON.stringify).join(" | ");
  const records = snapshots.snapshots.map(item => item.diagnostic);
  const snapshotAssertions = records.map((record, index) => `const snapshot${index} = ${JSON.stringify(record)} satisfies Diagnostic;`).join("\n");
  const malformedAssertions = records.map((record, index) => {
    const malformed = { ...record, details: { unexpected: true } };
    return `// @ts-expect-error accepted variant requires its own closed details\nconst malformed${index} = ${JSON.stringify(malformed)} satisfies Diagnostic;`;
  }).join("\n");
  const text = `import type { Diagnostic, DiagnosticCode, CompileCompositionResult } from ${JSON.stringify(importSpecifier)};
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
${snapshotAssertions}
${malformedAssertions}
const exact: Equal<DiagnosticCode, ${expected}> = true;
const derived: Equal<DiagnosticCode, Diagnostic['code']> = true;
const complete: Record<DiagnosticCode, string> = ${JSON.stringify(Object.fromEntries(codes.map(code => [code, code])))};
// @ts-expect-error missing real code
const incomplete: Record<DiagnosticCode, string> = ${JSON.stringify(Object.fromEntries(codes.slice(1).map(code => [code, code])))};
// @ts-expect-error reserved failure is never emittable
const reserved: DiagnosticCode = 'output.canonicalization-failed';
function exhaustive(diagnostic: Diagnostic) {
  switch (diagnostic.code) {
    ${codes.map(code => `case ${JSON.stringify(code)}: { const keys: Equal<keyof typeof diagnostic.details, ${catalog.detailPolicy[code].map(JSON.stringify).join(" | ")}> = true; break; }`).join("\n")}
    default: { const absent: never = diagnostic; return absent; }
  }
}
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
  return text;
}
