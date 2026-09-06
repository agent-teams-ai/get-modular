import assert from "node:assert/strict";
import test from "node:test";
import { scanRawDocument } from "../../../dist-test/features/input-admission/raw-document.js";
import { documentPath } from "../../../dist-test/features/input-admission/document-path.js";
import { visitRawDuplicatePaths } from "../../../dist-test/features/input-admission/raw-duplicate-replay.js";
import { admissionLimits } from "../../../dist-test/features/input-admission/resource-limits.js";
import { openOwnedRawTokenCursor } from "../../../dist-test/features/raw-scanner/owned-iterative/scanner.js";

const encoder = new TextEncoder();
const scanner = Object.freeze({ open: openOwnedRawTokenCursor });
const fullBudget = Object.freeze({
  valuesRemaining: admissionLimits.jsonValueOccurrences,
  stringBytesRemaining: admissionLimits.aggregateStringBytes,
});

function comparePaths(left, right) {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === b) continue;
    if (typeof a !== typeof b) return typeof a === "string" ? -1 : 1;
    return a < b ? -1 : 1;
  }
  return left.length - right.length;
}

function assertPaths(result, expected) {
  // Complete producer results: extra repetitions fail the comparison too.
  assert.deepEqual([...result.paths].sort(comparePaths), [...expected].sort(comparePaths));
}

function assertFinalPaths(result, locator, expected) {
  const actual = result.paths.map(path => documentPath(locator, path));
  actual.sort((left, right) => comparePaths(
    left.map(segment => segment.value), right.map(segment => segment.value),
  ));
  // Expected complete addresses come from the fixture, never the projector or
  // documentPath. Do not deduplicate either side of this comparison.
  const tagged = [...expected].sort(comparePaths).map(path => path.map(value =>
    typeof value === "string" ? { kind: "field", value } : { kind: "index", value }));
  assert.deepEqual(actual, tagged);
}

function replay(source, { kind = "profile", budget = fullBudget } = {}) {
  const ownedBytes = typeof source === "string" ? encoder.encode(source) : source;
  const before = new Uint8Array(ownedBytes);
  let observedEnd = -1;
  let boundaryCalls = 0;
  let preflightReads = 0;
  const physical = [];
  const preflightScanner = {
    open(view) {
      const cursor = openOwnedRawTokenCursor(view);
      return {
        next() { preflightReads += 1; return cursor.next(); },
        decodeString(current) { return cursor.decodeString(current); },
      };
    },
  };
  const scan = scanRawDocument(ownedBytes, preflightScanner, budget,
    path => physical.push([...path]),
    end => { boundaryCalls += 1; observedEnd = end; });
  assert.equal(boundaryCalls, 1);
  assert.ok(observedEnd >= 0 && observedEnd <= ownedBytes.length);

  let replayReads = 0;
  let replayByteWork = 0;
  const measuredScanner = {
    open(view) {
      // Every replay scanner receives only a view inside the observed prefix.
      assert.equal(view.buffer, ownedBytes.buffer);
      assert.ok(view.byteOffset >= ownedBytes.byteOffset);
      assert.ok(view.byteOffset + view.byteLength <= ownedBytes.byteOffset + observedEnd);
      const cursor = openOwnedRawTokenCursor(view);
      let previousEnd = 0;
      return {
        next() {
          replayReads += 1;
          const current = cursor.next();
          replayByteWork += current.end - previousEnd;
          previousEnd = current.end;
          return current;
        },
        decodeString(current) {
          replayByteWork += current.end - current.start;
          return cursor.decodeString(current);
        },
      };
    },
  };
  const localCapacity = kind === "declaration" ? 30 : 31;
  const paths = [];
  const stats = visitRawDuplicatePaths(ownedBytes, measuredScanner, observedEnd, kind, path => {
    assert.equal(Object.isFrozen(path), true);
    assert.ok(path.length <= localCapacity);
    paths.push(path);
  });
  assert.deepEqual(ownedBytes, before);
  assert.equal(stats.tokenVisits, replayReads);
  const height = Math.min(scan.maximumDepth, localCapacity);
  const workFactor = 2 * (height + 1);
  assert.ok(stats.tokenVisits <= workFactor * preflightReads + 32);
  assert.ok(replayByteWork <= workFactor * Math.max(1, observedEnd));
  assert.ok(stats.arrayCursorSteps <= scan.valueOccurrences);
  assert.ok(stats.peakGroupDepth <= Math.min(scan.maximumDepth + 1, localCapacity + 1));
  assert.ok(stats.peakLiveSpans <= scan.valueOccurrences + 1);
  assert.ok(stats.peakLiveCursors <= scan.valueOccurrences + 1);
  return { scan, observedEnd, paths, physical, stats, preflightReads, replayByteWork };
}

function rawArray(length, entries) {
  const values = Array(length).fill("0");
  for (const [index, value] of entries) values[index] = value;
  return `[${values.join(",")}]`;
}

function nestedArrays(depth, value) {
  return "[".repeat(depth) + value + "]".repeat(depth);
}

test("the optional fifth callback preserves four-argument observations and seven result fields", () => {
  const bytes = encoder.encode('{"kind":0,"kind":1,"kind":2}');
  const fourPaths = [];
  const fivePaths = [];
  const events = [];
  let observedEnd = -1;
  const four = scanRawDocument(bytes, scanner, fullBudget, path => fourPaths.push([...path]));
  const five = scanRawDocument(bytes, scanner, fullBudget, path => {
    fivePaths.push([...path]);
    events.push("duplicate");
  }, end => {
    observedEnd = end;
    events.push("boundary");
  });
  assert.deepEqual(four, {
    decoded: false, invalidJson: false, duplicateKey: true, stoppedBy: null,
    valueOccurrences: 4, stringBytes: 12, maximumDepth: 1,
  });
  assert.deepEqual(five, four);
  assert.deepEqual(Object.keys(five), [
    "decoded", "invalidJson", "duplicateKey", "stoppedBy",
    "valueOccurrences", "stringBytes", "maximumDepth",
  ]);
  assert.deepEqual(fourPaths, [["kind"], ["kind"]]);
  assert.deepEqual(fivePaths, fourPaths);
  assert.deepEqual(events, ["duplicate", "duplicate", "boundary"]);
  assert.equal(observedEnd, bytes.length);
  assertPaths(replay(bytes), [["kind"]]);
});

test("unknown ancestors share one owner and projection never resumes", () => {
  const fixtures = [
    ['{"privateA":{"privateKey":0,"privateKey":1},"privateB":{"privateKey":2,"privateKey":3}}', [[]]],
    ['{"privateA":{"selections":[{"moduleId":0,"moduleId":1}]},"privateB":{"bindings":[{"slotId":0,"slotId":1}]}}', [[]]],
    ['{"privateA":0,"privateA":1,"privateA":2}', [[]]],
    ['{"selections":{"moduleId":{"kind":0,"kind":1},"moduleId":0},"roots":[{"kind":0,"kind":1}],"profileId":[{"kind":0,"kind":1}]}', [["selections"], ["roots", 0], ["profileId", 0]]],
  ];
  for (const [source, expected] of fixtures) assertPaths(replay(source), expected);
});

test("root arrays and numeric fallback preserve current candidates and complete addresses", () => {
  const fixtures = [
    { kind: "declaration", source: String.raw`[{"moduleId":0,"\u006doduleId":1}]`, paths: [[0, "moduleId"]] },
    { kind: "profile", source: String.raw`[{"profileId":0,"\u0070rofileId":1}]`, paths: [[0, "profileId"]] },
    { kind: "profile", source: '[{"selections":[{"moduleId":0,"moduleId":1}]}]', paths: [[0, "selections", 0, "moduleId"]] },
    { kind: "declaration", source: String.raw`{"owner":[{"authority":0,"\u0061uthority":1}]}`, paths: [["owner", 0, "authority"]] },
    { kind: "declaration", source: '{"slots":[[{"cardinality":[{"kind":0,"kind":1,"min":0,"min":1,"max":0,"max":1}]}]]}', paths: [
      ["slots", 0, 0, "cardinality", 0, "kind"],
      ["slots", 0, 0, "cardinality", 0, "min"],
      ["slots", 0, 0, "cardinality", 0, "max"],
    ] },
    { kind: "declaration", source: '{"moduleId":[[{"owner":0,"owner":1}]]}', paths: [["moduleId", 0, 0]] },
    { kind: "declaration", source: '{"owner":{"path":[[{"authority":0,"authority":1}]]}}', paths: [["owner", "path", 0, 0]] },
    { kind: "profile", source: '{"bindings":{"0":{"slotId":0,"slotId":1}}}', paths: [["bindings"]] },
    { kind: "declaration", source: '[{"secret":[{"moduleId":0,"moduleId":1}]}]', paths: [[0]] },
    { kind: "profile", source: '[{"secret":[{"profileId":0,"profileId":1}]}]', paths: [[0]] },
    { kind: "declaration", source: '[{"moduleId":0},{"moduleId":1}]', paths: [] },
    { kind: "profile", source: '[{"profileId":0},{"profileId":1}]', paths: [] },
  ];
  for (const { kind, source, paths } of fixtures) {
    const result = replay(source, { kind });
    const locator = kind === "declaration" ? { kind, ordinal: 7 } : { kind };
    const prefix = kind === "declaration" ? ["declarations", 7] : ["profile"];
    assert.equal(result.scan.invalidJson, false);
    assert.equal(result.scan.stoppedBy, null);
    assertPaths(result, paths);
    assertFinalPaths(result, locator, paths.map(path => [...prefix, ...path]));
  }
});

test("decoded escaped-equal keys and cardinality variant fields use the existing projector", () => {
  assertPaths(replay(String.raw`{"kind":0,"\u006bind":1,"kind":2}`), [["kind"]]);
  assertPaths(replay(String.raw`{"privateA":0,"\u0070rivateA":1}`), [[]]);
  assertPaths(replay(String.raw`{"\ud800":0,"\ud800":1}`), [[]]);
  assertPaths(replay('{"slots":[{"cardinality":{"kind":"required","min":0,"min":1,"max":2,"max":3}}]}', {
    kind: "declaration",
  }), [["slots", 0, "cardinality", "min"], ["slots", 0, "cardinality", "max"]]);
});

test("repeated selections merge by index without merging physical key sets", () => {
  const repeated = replay('{"selections":[{"moduleId":0,"moduleId":1},{"moduleId":0,"moduleId":1}],"selections":[{"moduleId":2,"moduleId":3}],"selections":[]}');
  assertPaths(repeated, [["selections"], ["selections", 0, "moduleId"], ["selections", 1, "moduleId"]]);
  assert.equal(repeated.stats.arrayCursorSteps, 3);
  assertPaths(replay('{"selections":[{"moduleId":0}],"selections":[{"moduleId":1}],"selections":[{"implementationId":2}]}'), [["selections"]]);
});

test("bindings and provider occurrences merge across both array axes", () => {
  const result = replay('{"bindings":[{"slotId":0,"slotId":1,"providerImplementationIds":[{"kind":0,"kind":1},{"moduleId":0,"moduleId":1}],"providerImplementationIds":[{"kind":2,"kind":3}]},{"providerImplementationIds":[{"kind":4,"kind":5}]}],"bindings":[{"providerImplementationIds":[{"kind":6,"kind":7},{"kind":8,"kind":9},{"kind":10,"kind":11}],"providerImplementationIds":[]}]}');
  assertPaths(result, [
    ["bindings"],
    ["bindings", 0, "slotId"],
    ["bindings", 0, "providerImplementationIds"],
    ["bindings", 0, "providerImplementationIds", 0],
    ["bindings", 0, "providerImplementationIds", 1],
    ["bindings", 0, "providerImplementationIds", 2],
    ["bindings", 1, "providerImplementationIds", 0],
  ]);
  assert.equal(result.stats.arrayCursorSteps, 10);
});

test("syntax failures preserve charged keys and exclude every unparsed suffix", () => {
  const fixtures = [
    ['{"kind":0,"kind"', '{"kind":0,"kind"', [["kind"]]],
    ['{"kind":0,"kind" 0,"privateA":0,"privateA":1}', '{"kind":0,"kind"', [["kind"]]],
    ['{"kind":0,"kind":', '{"kind":0,"kind":', [["kind"]]],
    ['{"kind":0,"kind":?,"privateA":0,"privateA":1}', '{"kind":0,"kind":', [["kind"]]],
    ['{"kind":0,"kind":1} {"privateA":0,"privateA":1}', '{"kind":0,"kind":1}', [["kind"]]],
    ['{"kind":0,"kind":1,}', '{"kind":0,"kind":1,', [["kind"]]],
    ['{"privateA":0,"privateA"', '{"privateA":0,"privateA"', [[]]],
    ['{"privateA":{"kind":0,"kind"', '{"privateA":{"kind":0,"kind"', [[]]],
    ['{"selections":[{"moduleId":0}],"selections":[{"moduleId":1,"moduleId"', '{"selections":[{"moduleId":0}],"selections":[{"moduleId":1,"moduleId"', [["selections"], ["selections", 0, "moduleId"]]],
    ['0 {"kind":0,"kind":1}', '0', []],
    ['?', '', []],
    ['', '', []],
  ];
  for (const [source, prefix, expected] of fixtures) {
    const result = replay(source);
    assert.equal(result.scan.invalidJson, true);
    assert.equal(result.scan.decoded, false);
    assert.equal(result.scan.stoppedBy, null);
    assert.equal(result.observedEnd, encoder.encode(prefix).length);
    assertPaths(result, expected);
  }
});

test("a failed key charge is excluded but a failed following value preserves its duplicate", () => {
  const source = '{"kind":0,"kind":"tail","privateA":0,"privateA":1}';
  const keyFailure = replay(source, { budget: { ...fullBudget, stringBytesRemaining: 7 } });
  assert.deepEqual(keyFailure.scan, {
    decoded: false, invalidJson: false, duplicateKey: false, stoppedBy: "aggregateStringBytes",
    valueOccurrences: 2, stringBytes: 8, maximumDepth: 1,
  });
  assert.equal(keyFailure.observedEnd, encoder.encode('{"kind":0,').length);
  assert.deepEqual(keyFailure.physical, []);
  assertPaths(keyFailure, []);

  const stringFailure = replay(source, { budget: { ...fullBudget, stringBytesRemaining: 8 } });
  assert.deepEqual(stringFailure.scan, {
    decoded: false, invalidJson: false, duplicateKey: true, stoppedBy: "aggregateStringBytes",
    valueOccurrences: 3, stringBytes: 9, maximumDepth: 1,
  });
  assert.equal(stringFailure.observedEnd, encoder.encode('{"kind":0,"kind":').length);
  assert.deepEqual(stringFailure.physical, [["kind"]]);
  assertPaths(stringFailure, [["kind"]]);

  const valueFailure = replay(source, { budget: { ...fullBudget, valuesRemaining: 2 } });
  assert.deepEqual(valueFailure.scan, {
    decoded: false, invalidJson: false, duplicateKey: true, stoppedBy: "jsonValueOccurrences",
    valueOccurrences: 3, stringBytes: 8, maximumDepth: 1,
  });
  assert.equal(valueFailure.observedEnd, encoder.encode('{"kind":0,"kind":').length);
  assertPaths(valueFailure, [["kind"]]);

  const rootFailure = replay(source, { budget: { ...fullBudget, valuesRemaining: 0 } });
  assert.deepEqual(rootFailure.scan, {
    decoded: false, invalidJson: false, duplicateKey: false, stoppedBy: "jsonValueOccurrences",
    valueOccurrences: 1, stringBytes: 0, maximumDepth: 0,
  });
  assert.equal(rootFailure.observedEnd, 0);
  assert.deepEqual(rootFailure.stats, {
    tokenVisits: 0, arrayCursorSteps: 0, peakGroupDepth: 0, peakLiveSpans: 0, peakLiveCursors: 0,
  });
  assertPaths(rootFailure, []);
});

test("a depth-rejected opening is outside the replay prefix", () => {
  const prefix = '{"kind":0,"kind":1,"privateA":' + '['.repeat(31);
  const source = prefix + '{"moduleId":0,"moduleId":1}' + ']'.repeat(31) + '}';
  const result = replay(source);
  assert.deepEqual(result.scan, {
    decoded: false, invalidJson: false, duplicateKey: true, stoppedBy: "jsonDepth",
    valueOccurrences: 35, stringBytes: 16, maximumDepth: 33,
  });
  assert.equal(result.observedEnd, encoder.encode(prefix).length);
  assert.deepEqual(result.physical, [["kind"]]);
  assertPaths(result, [["kind"]]);
});

for (const [kind, capacity] of [["declaration", 30], ["profile", 31]]) {
  const locator = kind === "declaration" ? { kind, ordinal: 7 } : { kind };
  const prefix = kind === "declaration" ? ["declarations", 7] : ["profile"];

  test(`${kind} clipping merges different local lengths and distinguishes final segment 32`, () => {
    const zeros = Array(capacity).fill(0);
    const leaf = kind === "declaration"
      ? '{"privateA":0,"privateA":1,"moduleId":0,"moduleId":1,"owner":{"authority":0,"authority":1}}'
      : '{"privateA":0,"privateA":1,"profileId":0,"profileId":1,"kind":0,"kind":1}';
    const result = replay(nestedArrays(capacity, leaf), { kind });
    assert.equal(result.scan.maximumDepth, 32);
    assert.equal(result.scan.stoppedBy, null);
    assert.equal(result.scan.invalidJson, false);
    assert.equal(result.physical.length, 3);
    assertPaths(result, [zeros]);
    assertFinalPaths(result, locator, [[...prefix, ...zeros]]);
    assert.equal(result.stats.peakGroupDepth, capacity + 1);
    assert.equal(result.stats.arrayCursorSteps, capacity);
    assert.equal(result.stats.peakLiveSpans, 1);
    assert.equal(result.stats.peakLiveCursors, 1);

    const stem = Array(capacity - 1).fill(0);
    const branched = replay(nestedArrays(capacity - 1,
      '[{"kind":0,"kind":1},{"kind":2,"kind":3}]'), { kind });
    const owners = [[...stem, 0], [...stem, 1]];
    assert.deepEqual(branched.paths, owners);
    assertFinalPaths(branched, locator, owners.map(path => [...prefix, ...path]));
  });

  test(`${kind} clipping keeps separate physical object key sets`, () => {
    const field = kind === "declaration" ? "slots" : "selections";
    const key = kind === "declaration" ? "slotId" : "moduleId";
    const owner = [...Array(capacity - 2).fill(0), field];
    const result = replay(nestedArrays(capacity - 2,
      `{"${field}":[{"${key}":0}],"${field}":[{"${key}":1}]}`), { kind });
    assert.deepEqual(result.physical, [owner]);
    assertPaths(result, [owner]);
    assertFinalPaths(result, locator, [[...prefix, ...owner]]);
    assert.equal(result.stats.arrayCursorSteps, capacity);
  });

  test(`${kind} clipping preserves pending keys and the exact committed prefix`, () => {
    const tails = [
      ["", ""],
      [' 0,"privateA":0,"privateA":1}', ""],
      [":", ":"],
      [':?,"privateA":0,"privateA":1}', ":"],
    ];
    // The first form carries the group's existing key flag into the terminal
    // branch. The second discovers the pending duplicate inside its fold.
    for (const depth of [capacity - 1, capacity]) {
      const base = "[".repeat(depth) + '{"kind":0,"kind"';
      const owner = depth === capacity
        ? Array(capacity).fill(0) : [...Array(depth).fill(0), "kind"];
      for (const [tail, committed] of tails) {
        const result = replay(base + tail, { kind });
        assert.equal(result.scan.invalidJson, true);
        assert.equal(result.scan.stoppedBy, null);
        assert.equal(result.observedEnd, encoder.encode(base + committed).length);
        assert.deepEqual(result.physical, [[...Array(depth).fill(0), "kind"]]);
        assertPaths(result, [owner]);
        assertFinalPaths(result, locator, [[...prefix, ...owner]]);
      }
    }

    const depth = capacity - 1;
    const base = "[".repeat(depth) + '{"kind":0,"kind"';
    const owner = [...Array(depth).fill(0), "kind"];
    const source = base + ':"tail"}' + "]".repeat(depth);
    const rejectedKey = replay(source, {
      kind, budget: { ...fullBudget, stringBytesRemaining: 7 },
    });
    assert.equal(rejectedKey.scan.stoppedBy, "aggregateStringBytes");
    assert.equal(rejectedKey.observedEnd, encoder.encode("[".repeat(depth) + '{"kind":0,').length);
    assert.deepEqual(rejectedKey.physical, []);
    assertPaths(rejectedKey, []);
    assertFinalPaths(rejectedKey, locator, []);

    for (const [budget, limit] of [
      [{ ...fullBudget, stringBytesRemaining: 8 }, "aggregateStringBytes"],
      [{ ...fullBudget, valuesRemaining: capacity + 1 }, "jsonValueOccurrences"],
    ]) {
      const result = replay(source, { kind, budget });
      assert.equal(result.scan.stoppedBy, limit);
      assert.equal(result.observedEnd, encoder.encode(base + ":").length);
      assertPaths(result, [owner]);
      assertFinalPaths(result, locator, [[...prefix, ...owner]]);
    }

    const rejectedOpening = replay(base + ":" + nestedArrays(34, "0") + "}" + "]".repeat(depth), { kind });
    assert.equal(rejectedOpening.scan.stoppedBy, "jsonDepth");
    assert.equal(rejectedOpening.scan.maximumDepth, 33);
    assert.equal(rejectedOpening.observedEnd, encoder.encode(base + ":" + "[".repeat(32 - capacity)).length);
    assertPaths(rejectedOpening, [owner]);
    assertFinalPaths(rejectedOpening, locator, [[...prefix, ...owner]]);
  });
}

test("indices 65535 remain representable and overflow observations fold once", () => {
  const row = '{"moduleId":0,"moduleId":1}';
  const first = rawArray(65538, [[65535, row], [65536, row], [65537, row]]);
  const second = rawArray(65536, [[65535, row]]);
  const result = replay(`{"selections":${first},"selections":${second}}`);
  assertPaths(result, [["selections"], ["selections", 65535, "moduleId"]]);
  assert.equal(result.stats.arrayCursorSteps, 131074);
  assert.ok(result.stats.peakLiveSpans <= 8);
  assert.ok(result.stats.peakLiveCursors <= 4);
});

test("both binding axes project 65535 and permanently fold 65536 and later", () => {
  const item = '{"kind":0,"kind":1}';
  const providersA = rawArray(65538, [[65535, item], [65536, item], [65537, item]]);
  const providersB = rawArray(65536, [[65535, item]]);
  const row = `{"providerImplementationIds":${providersA},"providerImplementationIds":${providersB}}`;
  const bindings = rawArray(65538, [
    [65535, row],
    [65536, '{"slotId":0,"slotId":1}'],
    [65537, '{"slotId":2,"slotId":3}'],
  ]);
  const result = replay(`{"bindings":${bindings}}`);
  assertPaths(result, [
    ["bindings"],
    ["bindings", 65535, "providerImplementationIds"],
    ["bindings", 65535, "providerImplementationIds", 65535],
  ]);
  assert.equal(result.stats.arrayCursorSteps, 196612);
  assert.ok(result.stats.peakLiveSpans <= 8);
  assert.ok(result.stats.peakLiveCursors <= 5);
});

for (const [kind, capacity] of [["declaration", 30], ["profile", 31]]) {
  const locator = kind === "declaration" ? { kind, ordinal: 7 } : { kind };
  const prefix = kind === "declaration" ? ["declarations", 7] : ["profile"];

  test(`${kind} depth-32 root arrays reach exactly the bounded group depth`, () => {
    const result = replay(nestedArrays(31, '{"kind":0,"kind":1}'), { kind });
    assert.equal(result.scan.maximumDepth, 32);
    assert.equal(result.scan.invalidJson, false);
    assert.equal(result.scan.stoppedBy, null);
    assert.deepEqual(result.physical, [[...Array(31).fill(0), "kind"]]);
    assertPaths(result, [Array(capacity).fill(0)]);
    assertFinalPaths(result, locator, [[...prefix, ...Array(capacity).fill(0)]]);
    assert.equal(result.stats.peakGroupDepth, capacity + 1);
    assert.equal(result.stats.arrayCursorSteps, capacity);
  });

  test(`${kind} unknown subtrees stay iterative through depth 32`, () => {
    const source = nestedArrays(2,
      '{"privateA":' + nestedArrays(28, '{"kind":0,"kind":1}') + '}');
    const result = replay(source, { kind });
    assert.equal(result.scan.maximumDepth, 32);
    assert.equal(result.scan.stoppedBy, null);
    assertPaths(result, [[0, 0]]);
    assertFinalPaths(result, locator, [[...prefix, 0, 0]]);
    assert.equal(result.stats.peakGroupDepth, 3);
    assert.equal(result.stats.arrayCursorSteps, 2);
    assert.ok(result.stats.tokenVisits <= 8 * result.preflightReads + 32);
    assert.ok(result.replayByteWork <= 8 * result.observedEnd);
  });

  test(`${kind} deep scalar fallback consumes actual ragged array elements`, () => {
    const depth = capacity - 4;
    const longLength = 512;
    const shortCount = 256;
    const row = '[{"privateKey":0,"privateKey":1}]';
    const long = `[${Array(longLength).fill(row).join(",")}]`;
    const fields = [`"kind":${long}`, ...Array(shortCount).fill(`"kind":[${row}]`)];
    const result = replay(nestedArrays(depth, `{${fields.join(",")}}`), { kind });
    const owner = [...Array(depth).fill(0), "kind"];
    const expected = [owner, ...Array.from({ length: longLength }, (_, index) => [...owner, index, 0])];
    assert.equal(result.scan.stoppedBy, null);
    assert.equal(result.scan.maximumDepth, capacity);
    assertPaths(result, expected);
    assertFinalPaths(result, locator, expected.map(path => [...prefix, ...path]));
    assert.equal(result.stats.peakGroupDepth, capacity);
    assert.equal(result.stats.arrayCursorSteps, depth + 2 * (longLength + shortCount));
    assert.ok(result.stats.peakLiveSpans <= 3 * (shortCount + 1) + 8);
    assert.ok(result.stats.peakLiveCursors <= 2 * (shortCount + 1) + 8);
  });
}

test("strongly unequal selection arrays discard exhausted cursors immediately", () => {
  const longLength = 4096;
  const shortCount = 2048;
  const row = '{"moduleId":0,"moduleId":1,"moduleId":2}';
  const long = `[${Array(longLength).fill(row).join(",")}]`;
  const fields = [`"selections":${long}`, ...Array(shortCount).fill(`"selections":[${row}]`)];
  const result = replay(`{${fields.join(",")}}`);
  const expected = [["selections"], ...Array.from({ length: longLength }, (_, index) => ["selections", index, "moduleId"])];
  assertPaths(result, expected);
  assert.equal(result.stats.arrayCursorSteps, longLength + shortCount);
  assert.ok(result.stats.peakLiveSpans <= 3 * (shortCount + 1) + 8);
  assert.ok(result.stats.peakLiveCursors <= shortCount + 4);
});

test("strongly unequal provider arrays remain linear inside a merged binding group", () => {
  const longLength = 4096;
  const shortCount = 1024;
  const item = '{"kind":0,"kind":1}';
  const long = `[${Array(longLength).fill(item).join(",")}]`;
  const fields = [`"providerImplementationIds":${long}`, ...Array(shortCount).fill(`"providerImplementationIds":[${item}]`)];
  const source = `{"bindings":[{${fields.join(",")}}],"bindings":[{"providerImplementationIds":[${item}]}]}`;
  const result = replay(source);
  assertPaths(result, [
    ["bindings"], ["bindings", 0, "providerImplementationIds"],
    ...Array.from({ length: longLength }, (_, index) => ["bindings", 0, "providerImplementationIds", index]),
  ]);
  assert.equal(result.stats.arrayCursorSteps, 2 + longLength + shortCount + 1);
  assert.ok(result.stats.peakLiveSpans <= shortCount + 8);
  assert.ok(result.stats.peakLiveCursors <= shortCount + 8);
});

for (const uniqueCount of [256, 257, 258]) {
  test(`${uniqueCount} unique paths survive heavy repetition and a late smaller parent`, () => {
    const repetitions = 12;
    const rowCount = uniqueCount - 1;
    const row = '{"moduleId":0,"moduleId":1,"moduleId":2}';
    const rows = `[${Array(rowCount).fill(row).join(",")}]`;
    const source = `{${Array(repetitions).fill(`"selections":${rows}`).join(",")}}`;
    const result = replay(source);
    const expected = [["selections"], ...Array.from({ length: rowCount }, (_, index) => ["selections", index, "moduleId"])];
    assertPaths(result, expected);
    assert.equal(result.paths.length, uniqueCount);
    assert.equal(result.physical.length, repetitions * rowCount * 2 + repetitions - 1);
    assert.equal(result.stats.arrayCursorSteps, repetitions * rowCount);
    // At 258 this smaller candidate arrives after 257 distinct descendants;
    // a caller must still compare it after entering truncation.
    assert.deepEqual(result.paths.at(-1), ["selections"]);
    for (const path of result.paths.slice(0, -1)) assert.ok(comparePaths(["selections"], path) < 0);
  });
}

for (const [kind, capacity] of [["declaration", 30], ["profile", 31]]) {
  test(`${kind} emits 257 final addresses despite thousands of clipping collisions`, () => {
    const repetitions = 12;
    const rowCount = 256;
    const field = kind === "declaration" ? "slots" : "selections";
    const key = kind === "declaration" ? "slotId" : "moduleId";
    const row = `{"${key}":0,"${key}":1,"${key}":2,"privateA":0,"privateA":1}`;
    const rows = `[${Array(rowCount).fill(row).join(",")}]`;
    const source = nestedArrays(capacity - 2,
      `{${Array(repetitions).fill(`"${field}":${rows}`).join(",")}}`);
    const result = replay(source, { kind });
    const owner = [...Array(capacity - 2).fill(0), field];
    const expected = [owner, ...Array.from({ length: rowCount }, (_, index) => [...owner, index])];
    const locator = kind === "declaration" ? { kind, ordinal: 7 } : { kind };
    const prefix = kind === "declaration" ? ["declarations", 7] : ["profile"];
    assert.equal(result.scan.stoppedBy, null);
    assert.equal(result.scan.invalidJson, false);
    assertPaths(result, expected);
    assertFinalPaths(result, locator, expected.map(path => [...prefix, ...path]));
    assert.equal(result.paths.length, 257);
    assert.equal(result.physical.length, repetitions * rowCount * 3 + repetitions - 1);
    assert.equal(result.stats.arrayCursorSteps, capacity - 2 + repetitions * rowCount);
    assert.equal(result.stats.peakGroupDepth, capacity + 1);
    assert.ok(result.stats.peakLiveSpans <= repetitions + 1);
    assert.ok(result.stats.peakLiveCursors <= repetitions + 1);
    // The smaller containing address arrives after all 256 clipped row owners.
    assert.deepEqual(result.paths.at(-1), owner);
    for (const path of result.paths.slice(0, -1)) assert.ok(comparePaths(owner, path) < 0);
  });
}

test("independent declaration calls retain their separate invocation prefixes", () => {
  const source = '{"kind":0,"kind":1}';
  const first = replay(source, { kind: "declaration" });
  const second = replay(source, { kind: "declaration" });
  assertPaths(first, [["kind"]]);
  assertPaths(second, [["kind"]]);
  assert.deepEqual([
    ...first.paths.map(path => ["declarations", 0, ...path]),
    ...second.paths.map(path => ["declarations", 1, ...path]),
  ], [["declarations", 0, "kind"], ["declarations", 1, "kind"]]);
});

test("replay preserves fixed owned bytes, offsets and the last structural end", () => {
  const document = '{"kind":"é","kind":"after"}';
  const encoded = encoder.encode(document + ' \n\t');
  const storage = new Uint8Array(encoded.length + 10).fill(0x61);
  storage.set(encoded, 5);
  const before = new Uint8Array(storage);
  const ownedBytes = new Uint8Array(storage.buffer, 5, encoded.length);
  const result = replay(ownedBytes);
  assertPaths(result, [["kind"]]);
  assert.equal(result.scan.invalidJson, false);
  assert.equal(result.observedEnd, encoder.encode(document).length);
  assert.equal(storage.buffer.resizable, false);
  assert.deepEqual(storage, before);
});
