import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { compileComposition } from "../../../dist/index.js";
import { createDeclarationCensus } from "../../../dist-test/features/composition-semantics/declaration-census.js";
import { createProfileCensus } from "../../../dist-test/features/composition-semantics/profile-census.js";
import { validateSelectedBindings } from "../../../dist-test/features/composition-semantics/selected-bindings.js";
import { createDiagnosticCollector } from "../../../dist-test/features/diagnostics/internal.js";
import { createOwnedJcs } from "../../../dist-test/features/canonicalization/owned-jcs/factory.js";
import { duplicateRecordBaseCases, duplicateRecordRowFailureCases, duplicateRecordOverlapCases } from "../../qualification-support/m2-candidate/duplicate-record-cases.mjs";
import { materializeDuplicateRecordExtendedOverlap }
  from "../../qualification-support/m2-candidate/duplicate-record-extended-overlaps.mjs";

// Focused component invariants and ordinary-entry mutation controls.
function freezeTree(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}
async function replay(fixture, subject = compileComposition) {
  const expected = freezeTree(fixture.expected);
  const actual = await subject(freezeTree(fixture.input));
  assert.deepEqual(actual, expected, fixture.caseId);
  return actual;
}
const extended = suffix => materializeDuplicateRecordExtendedOverlap(`od006.extended-overlap.v1/${suffix}`);

// The complete frozen inventory is replayed once by qualification/m2-duplicate-records.test.mjs.
function inspectBindings(input) {
  freezeTree(input);
  const collector = createDiagnosticCollector(createOwnedJcs().canonicalize);
  const declarations = createDeclarationCensus(input.declarations, true, collector);
  const selected = createProfileCensus(input.profile, declarations, collector);
  const bindings = validateSelectedBindings(input.profile, declarations, selected, collector);
  return { bindings, collector };
}

test("every row-local failure normalizes once even when repeated beyond the collector cap", async () => {
  let faults = 0;
  for (const fixture of duplicateRecordRowFailureCases()) {
    if (fixture.parameters.recordCount !== 2 || fixture.parameters.faultPosition !== 0) continue;
    const faulty = fixture.input.profile.bindings[0];
    fixture.input.profile.bindings = Array.from({ length: 300 }, () => structuredClone(faulty));
    // The independent source expectation still applies: repeated equal failures
    // contribute one row-local candidate and one duplicate-record candidate.
    await replay(fixture);
    const { bindings, collector } = inspectBindings(fixture.input);
    assert.deepEqual(bindings.validBindings, []);
    assert.equal(bindings.frontierComplete(faulty.consumerImplementationId), false);
    assert.equal(bindings.hasErrors, true);
    assert.equal(collector.statistics().saturatedFailureCount, 2);
    assert.deepEqual(collector.finish(), fixture.expected.diagnostics);
    faults += 1;
  }
  assert.equal(faults, 7);
});

test("row-local candidate deduplication is scoped to one consumer and slot", async () => {
  const fixture = extended("many-row-dedup");
  const consumer = fixture.input.declarations[0];
  consumer.slots.push({ ...structuredClone(consumer.slots[0]), slotId: "second" });
  const rows = fixture.input.profile.bindings;
  rows.push(...rows.map(row => ({ ...structuredClone(row), slotId: "second" })));
  const at = (index, slotId) => {
    const diagnostic = structuredClone(fixture.expected.diagnostics[index]);
    diagnostic.coordinate.slotId = slotId;
    return diagnostic;
  };
  // Literal code/coordinate/detail ordering, without the production comparator.
  const expected = freezeTree({ ok: false, diagnostics: [
    at(0, "dependency"), at(0, "second"),
    at(1, "dependency"), at(1, "second"),
    at(2, "dependency"), at(3, "dependency"),
    at(2, "second"), at(3, "second"),
  ] });
  assert.deepEqual(await compileComposition(freezeTree(fixture.input)), expected);
  const { collector } = inspectBindings(fixture.input);
  assert.equal(collector.statistics().saturatedFailureCount, 8);
  assert.deepEqual(collector.finish(), expected.diagnostics);
});

test("the complete coordinate census precedes one normalized unknown-consumer failure", async () => {
  const fixture = [...duplicateRecordOverlapCases()].find(row => row.parameters.fault === "unknown-consumer");
  assert.ok(fixture);
  const rows = fixture.input.profile.bindings;
  rows.push(...rows.map(row => ({ ...structuredClone(row), slotId: "second" })));
  const second = structuredClone(fixture.expected.diagnostics[0]);
  second.coordinate.slotId = "second";
  const expected = freezeTree({ ok: false, diagnostics: [
    fixture.expected.diagnostics[0], second, fixture.expected.diagnostics[1],
  ] });
  assert.deepEqual(await compileComposition(freezeTree(fixture.input)), expected);
});

test("invalid groups supply zero binding rows while another slot of that consumer retains its edges", () => {
  const fixture = extended("same-consumer-second-slot");
  const { bindings, collector } = inspectBindings(fixture.input);
  assert.deepEqual(bindings.validBindings.map(({ binding }) => [
    binding.consumerImplementationId, binding.slotId, binding.providerImplementationIds,
  ]), [
    ["example/c/default", "second", ["example/q/default"]],
    ["example/p/default", "back", ["example/c/default"]],
    ["example/q/default", "back", ["example/c/default"]],
  ]);
  assert.equal(bindings.frontierComplete("example/c/default"), false);
  assert.equal(bindings.frontierComplete("example/p/default"), true);
  assert.equal(bindings.frontierComplete("example/q/default"), true);
  assert.equal(bindings.hasErrors, true);
  assert.deepEqual(collector.finish(), [fixture.expected.diagnostics[0]]);
  for (const { binding } of bindings.validBindings) {
    assert.ok(fixture.input.profile.bindings.includes(binding), "valid singleton rows remain borrowed");
  }
});

test("unselected repeated coordinates fail without providing a binding or damaging the selected frontier", () => {
  const fixture = [...duplicateRecordOverlapCases()].find(row => row.parameters.fault === "unselected-consumer");
  assert.ok(fixture);
  const { bindings, collector } = inspectBindings(fixture.input);
  assert.deepEqual(bindings.validBindings, []);
  assert.equal(bindings.hasErrors, true);
  assert.equal(bindings.frontierComplete("example/provider-one/default"), true);
  assert.deepEqual(collector.finish(), fixture.expected.diagnostics);
});

// Mutate only disposable copies of the actual production build. Each mutant
// still runs through its ordinary index export, including admission and output.
async function mutantCompiler(t, mutation) {
  const directory = await mkdtemp(join(tmpdir(), "gm-duplicate-record-mutant-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "package.json"), '{"type":"module","private":true}\n');
  await cp(new URL("../../../dist/", import.meta.url), join(directory, "dist"), { recursive: true });
  const target = join(directory, "dist", "features", "composition-semantics", mutation.file);
  const source = await readFile(target, "utf8");
  assert.equal([...source.matchAll(mutation.pattern)].length, 1, `${mutation.name}: unique mutation site`);
  await writeFile(target, source.replace(mutation.pattern, mutation.replacement));
  const subject = await import(pathToFileURL(join(directory, "dist", "index.js")).href);
  return subject.compileComposition;
}
const cardinalityControl = () => [...duplicateRecordBaseCases()].find(row =>
  row.parameters.cardinality === "required" && row.parameters.recordCount === 2
  && row.parameters.recipe === "valid-conflicting");
const edgeControl = () => [...duplicateRecordOverlapCases()].find(row =>
  row.parameters.fault === "reached-incomplete-independent-scc");
const mutations = [
  {
    name: "missing duplicate-record diagnostic",
    file: "selected-bindings.js",
    pattern: /\badd\(\s*Object\.freeze\(\{\s*code:\s*"binding\.duplicate-record"/gu,
    replacement: 'void(Object.freeze({ code: "binding.duplicate-record"',
    fixture: cardinalityControl,
  },
  {
    name: "merged provider rows",
    file: "binding-record.js",
    pattern: /for\s*\(const binding of bindings\)/gu,
    replacement: "for (const binding of [{ ...bindings[0], providerImplementationIds: bindings.flatMap(row => row.providerImplementationIds) }])",
    fixture: cardinalityControl,
  },
  {
    name: "invalid-group edge leakage",
    file: "binding-record.js",
    pattern: /\blet\s+valid\s*=\s*bindings\.length\s*===\s*1;/gu,
    replacement: "let valid = true;",
    fixture: edgeControl,
  },
  {
    name: "repeated provider failure candidates",
    file: "binding-record.js",
    pattern: /if\s*\(seen\.has\(providerImplementationId\)\)\s*return;/gu,
    replacement: "if (false && seen.has(providerImplementationId)) return;",
    fixture: () => extended("many-row-dedup"),
  },
  {
    name: "repeated cardinality failure candidates",
    file: "binding-record.js",
    pattern: /if\s*\(cardinalities\.has\(count\)\)\s*return;/gu,
    replacement: "if (false && cardinalities.has(count)) return;",
    fixture: () => extended("many-row-dedup"),
  },
];

test("complete ordinary-entry expectations reject focused implementation mutants", async t => {
  for (const mutation of mutations) {
    await t.test(mutation.name, async t => {
      const fixture = mutation.fixture();
      assert.ok(fixture);
      await replay(fixture);
      const subject = await mutantCompiler(t, mutation);
      // Import failures and compiler exceptions do not count as detected output
      // mutations: require an actual result that fails the complete comparison.
      const actual = await subject(fixture.input);
      assert.throws(() => assert.deepEqual(actual, fixture.expected), { code: "ERR_ASSERTION" });
    });
  }
});
