import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

// Private compiled Core component mutations against the a4fff3b checkpoint.
// These are neither public invocation tests nor retained M2 qualification.
const build = new URL('../../dist-stage0/src/features/input-admission/', import.meta.url);
const meterName = 'object-resource-meter.js';
const limitsName = 'resource-limits.js';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const cycleAnchor = [
  'if (active.has(item)) {',
  '                nonPlain(segment);',
  '                return;',
  '            }',
].join('\n');
const deleteAnchor = 'active.delete(frame.value);';
const depthAnchor = 'if (depth > depthLimit) {';
const expectedLimits = {
  declarationRawDocumentBytes: 1_048_576,
  profileRawDocumentBytes: 8_388_608,
  aggregateRawBytes: 16_777_216,
  jsonValueOccurrences: 2_097_152,
  jsonDepth: 32,
  aggregateStringBytes: 8_388_608,
  identifierBytes: 128,
  ownerPathSegments: 8,
  declarations: 4096,
  capabilitiesPerDeclaration: 64,
  slotsPerDeclaration: 128,
  totalCapabilities: 65_536,
  totalSlots: 65_536,
  roots: 1024,
  selections: 4096,
  bindings: 65_536,
};

function unique(source, anchor) {
  assert.equal(source.split(anchor).length, 2, `unique compiled anchor: ${anchor}`);
}

function replaceOnce(source, before, after) {
  unique(source, before);
  assert.notEqual(before, after);
  return source.replace(before, () => after);
}

async function observe(root, phase, meterHash, limitsHash, witness) {
  const target = join(root, meterName);
  assert.equal(hash(await readFile(target)), meterHash);
  assert.equal(hash(await readFile(join(root, limitsName))), limitsHash);
  const url = pathToFileURL(target);
  url.searchParams.set('phase', phase);
  url.searchParams.set('sha256', meterHash);
  // Import/syntax errors and execution throws fail the test, never detect a fault.
  const subject = await import(url.href);
  assert.equal(typeof subject.createObjectResourceMeter, 'function');
  const dependency = await import(pathToFileURL(join(root, limitsName)).href);
  assert.deepEqual(dependency.admissionLimits, expectedLimits);
  const meter = subject.createObjectResourceMeter();
  const scan = meter.scanDocument(witness());
  const statistics = meter.statistics();
  assert.equal(hash(await readFile(target)), meterHash);
  assert.equal(hash(await readFile(join(root, limitsName))), limitsHash);
  return { scan, statistics };
}

function detects(check, name, operator) {
  assert.throws(check, error => error instanceof assert.AssertionError
    && error.code === 'ERR_ASSERTION' && error.operator === operator
    && error.message.includes(name), `must reject the named observation: ${name}`);
}

const cases = [
  {
    name: 'adr13.deduplicate-dag-references',
    witness: () => {
      const shared = { key: 'v' };
      return { a: shared, b: shared };
    },
    normal: {
      scan: { jsonDepth: 2, nonPlainValue: false, stoppedBy: null },
      statistics: {
        jsonValueOccurrences: 5, aggregateStringBytes: 10,
        peakOpenContainers: 2, ownKeyVisits: 4, arrayIndexCodeUnits: 0,
      },
    },
    // Root + two shared occurrences + only the first scalar = four values.
    // Keys a,b,key and scalar v contribute 1+1+3+1 bytes and three visits.
    changed: {
      scan: { jsonDepth: 2, nonPlainValue: false, stoppedBy: null },
      statistics: {
        jsonValueOccurrences: 4, aggregateStringBytes: 6,
        peakOpenContainers: 2, ownKeyVisits: 3, arrayIndexCodeUnits: 0,
      },
    },
    edits: [
      [cycleAnchor, 'if (active.has(item)) { return; }'],
      [deleteAnchor, '/* Fault: retain every visited container identity. */'],
    ],
  },
  {
    name: 'adr13.missed-object-cycle',
    witness: () => {
      const value = {};
      value.self = value;
      return value;
    },
    normal: {
      scan: { jsonDepth: 1, nonPlainValue: true, stoppedBy: null },
      statistics: {
        jsonValueOccurrences: 2, aggregateStringBytes: 4,
        peakOpenContainers: 1, ownKeyVisits: 1, arrayIndexCodeUnits: 0,
      },
    },
    // The unchanged depth guard opens 32 frames and rejects entry 33.
    // Each open frame visits "self" once: 32 visits and 32 * 4 bytes.
    changed: {
      scan: { jsonDepth: 33, nonPlainValue: false, stoppedBy: 'jsonDepth' },
      statistics: {
        jsonValueOccurrences: 33, aggregateStringBytes: 128,
        peakOpenContainers: 32, ownKeyVisits: 32, arrayIndexCodeUnits: 0,
      },
    },
    edits: [['if (active.has(item)) {', 'if (false) {']],
  },
];

for (const specimen of cases) {
  test(specimen.name, async t => {
    const originalBytes = await readFile(new URL(meterName, build));
    const limitsBytes = await readFile(new URL(limitsName, build));
    const originalHash = hash(originalBytes);
    const limitsHash = hash(limitsBytes);
    const root = await mkdtemp(join(tmpdir(), 'gm-m2-object-meter-mutation-'));
    try {
      await writeFile(join(root, 'package.json'), '{"type":"module"}\n');
      await writeFile(join(root, meterName), originalBytes);
      await writeFile(join(root, limitsName), limitsBytes);
      const source = originalBytes.toString('utf8');
      unique(source, 'import { admissionLimits } from "./resource-limits.js";');
      unique(source, 'const depthLimit = admissionLimits.jsonDepth;');
      unique(source, depthAnchor);
      unique(source, cycleAnchor);
      unique(source, deleteAnchor);
      const scanName = `${specimen.name}: complete independent scan`;
      const statsName = `${specimen.name}: complete independent statistics`;
      const factName = `${specimen.name}: cycle nonPlainValue fact`;
      const checkScan = report => assert.deepEqual(report.scan, specimen.normal.scan, scanName);
      const checkStats = report => assert.deepEqual(report.statistics, specimen.normal.statistics, statsName);
      const checkFact = report => assert.equal(report.scan.nonPlainValue, true, factName);
      const normal = await observe(root, 'normal', originalHash, limitsHash, specimen.witness);
      checkScan(normal);
      checkStats(normal);
      if (specimen.name === 'adr13.missed-object-cycle') checkFact(normal);
      // The unmodified actual module must pass before any mutant is written.
      let mutated = source;
      for (const [before, after] of specimen.edits) mutated = replaceOnce(mutated, before, after);
      unique(mutated, depthAnchor);
      unique(mutated, 'const depthLimit = admissionLimits.jsonDepth;');
      const mutatedHash = hash(mutated);
      assert.notEqual(mutatedHash, originalHash);
      await writeFile(join(root, meterName), mutated);
      const changed = await observe(root, 'mutant', mutatedHash, limitsHash, specimen.witness);
      // Exact independently derived deviations are required before recognition.
      assert.deepEqual(changed, specimen.changed, 'complete expected mutant observation');
      detects(() => checkStats(changed), statsName, 'deepStrictEqual');
      if (specimen.name === 'adr13.missed-object-cycle') {
        detects(() => checkFact(changed), factName, 'strictEqual');
        detects(() => checkScan(changed), scanName, 'deepStrictEqual');
      } else {
        checkScan(changed);
      }
      t.diagnostic(JSON.stringify({
        mutant: specimen.name, component: meterName,
        originalHash, mutatedHash, limitsHash, normal, changed,
      }));
    } finally {
      try {
        assert.deepEqual(await readFile(new URL(meterName, build)), originalBytes,
          'original compiled meter remains unchanged');
        assert.deepEqual(await readFile(new URL(limitsName, build)), limitsBytes,
          'original resource bounds remain unchanged');
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });
}
