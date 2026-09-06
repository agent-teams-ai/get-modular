import assert from "node:assert/strict";
import test from "node:test";
import { objectDocument } from "../../../dist-test/features/input-admission/document-reader.js";
import { validateProfileView } from "../../../dist-test/features/input-admission/document-shape.js";
import { ownValue, profileResourceFacts, profileResourceFactsView } from "../../../dist-test/features/input-admission/profile-resource-facts.js";
import { rawDocumentView, scanRawDocument } from "../../../dist-test/features/input-admission/raw-document.js";
import { createOwnedRawScanner } from "../../../dist-test/features/raw-scanner/owned-iterative/factory.js";

const scanner = createOwnedRawScanner({});
const encoder = new TextEncoder();
const budget = Object.freeze({ valuesRemaining: 2_097_152, stringBytesRemaining: 8_388_608 });
const selection = (moduleId = "x/m", implementationId = "x/i") => ({ moduleId, implementationId });
const binding = (overrides = {}) => ({ consumerImplementationId: "x/i", slotId: "s",
  providerImplementationIds: [], ...overrides });
const profile = (overrides = {}) => ({ kind: "get-modular.composition-profile", schemaVersion: 1,
  profileId: "x/p", roots: ["x/m"], selections: [selection()], bindings: [], ...overrides });
const emptyFacts = (selectionCensusComplete = false) => ({ selections: [], selectionCensusComplete, bindings: [] });
const invalidIds = [null, false, 17, [], {}, "", "local", "X/y", "x/y-", "x//y", "x/y!",
  "x/é", "x/\ud800", "x/" + "a".repeat(127)];

function rawView(value, port = scanner) {
  const bytes = encoder.encode(JSON.stringify(value));
  assert.ok(bytes.byteLength <= 8_388_608);
  const scanned = scanRawDocument(bytes, port, budget, () => assert.fail("unexpected duplicate key"));
  assert.equal(scanned.decoded, true);
  return rawDocumentView(bytes, port);
}

// Observe actual readers, preserving their handles and delegating every access.
function observe(view, observer = {}) {
  const real = view.reader;
  return {
    root: view.root,
    reader: {
      ...real,
      own(value, key) {
        assert.equal(real.kind(value), "record", "own requires a record");
        const member = real.own(value, key);
        observer.own?.(value, key, member);
        return member;
      },
      length(value) {
        assert.equal(real.kind(value), "array", "length requires an array");
        const length = real.length(value);
        observer.length?.(value, length);
        return length;
      },
      item(value, index) {
        assert.equal(real.kind(value), "array", "item requires an array");
        observer.item?.(value, index);
        return real.item(value, index);
      },
      text(value) {
        assert.equal(real.kind(value), "string", "text requires a string");
        const text = real.text(value);
        observer.text?.(value, text);
        return text;
      },
    },
  };
}

function assertFrozenFacts(facts) {
  assert.equal(Object.getPrototypeOf(facts), Object.prototype);
  assert.equal(Object.isFrozen(facts), true);
  for (const rows of [facts.selections, facts.bindings]) {
    assert.equal(Object.getPrototypeOf(rows), Array.prototype);
    assert.equal(Object.isFrozen(rows), true);
    for (const row of rows) {
      assert.equal(Object.getPrototypeOf(row), Object.prototype);
      assert.equal(Object.isFrozen(row), true);
    }
  }
}

function assertFacts(value, expected) {
  const results = [profileResourceFacts(value),
    profileResourceFactsView(observe(objectDocument(value))),
    profileResourceFactsView(observe(rawView(value)))];
  for (const actual of results) {
    assert.deepEqual(actual, expected);
    assertFrozenFacts(actual);
  }
  return results;
}

test("object and raw readers preserve selection occurrences and every positive binding ordinal", () => {
  const input = profile({
    selections: [selection("x/b", "x/b-i"), selection(), selection("x/b", "x/b-i")],
    bindings: [binding({ providerImplementationIds: ["x/b-i", "x/a-i", "x/b-i"] }), binding(),
      binding({ consumerImplementationId: "x/unselected", slotId: "items", providerImplementationIds: ["x/b-i"] }),
      binding({ providerImplementationIds: ["x/a-i"] })],
  });
  assertFacts(input, {
    selections: [selection("x/b", "x/b-i"), selection(), selection("x/b", "x/b-i")],
    selectionCensusComplete: true,
    bindings: [
      { ordinal: 0, consumerImplementationId: "x/i", slotId: "s", providerOccurrences: 3 },
      { ordinal: 1, consumerImplementationId: "x/i", slotId: "s", providerOccurrences: 0 },
      { ordinal: 2, consumerImplementationId: "x/unselected", slotId: "items", providerOccurrences: 1 },
      { ordinal: 3, consumerImplementationId: "x/i", slotId: "s", providerOccurrences: 1 },
    ],
  });
});

test("decoded shape-invalid profiles retain independent positive resource facts", () => {
  const counted = binding({ providerImplementationIds: [null, "INVALID"] });
  for (const input of [
    profile({ bindings: [counted] }),
    profile({ roots: [], bindings: [counted] }),
    profile({ profileId: 17, bindings: [counted] }),
    profile({ kind: "wrong", unknown: { nested: [true] }, bindings: [counted] }),
    { selections: [{ ...selection(), unknown: true }], bindings: [{ ...counted, unknown: true }] },
  ]) {
    assert.equal(validateProfileView(rawView(input), () => {}), false);
    assertFacts(input, { selections: [selection()], selectionCensusComplete: true,
      bindings: [{ ordinal: 0, consumerImplementationId: "x/i", slotId: "s", providerOccurrences: 2 }] });
  }
});

test("root and list kinds are guarded and only a present empty selection array is complete", () => {
  for (const input of [null, [], [{}], true, false, 0, 1.5, "profile"]) assertFacts(input, emptyFacts());
  for (const selections of [undefined, null, true, 17, "rows", {}]) {
    assertFacts({ selections, bindings: [] }, emptyFacts());
  }
  for (const bindings of [undefined, null, true, 17, "rows", {}, []]) {
    assertFacts({ selections: [], bindings }, emptyFacts(true));
  }
});

test("malformed selection rows and identities withhold completeness without erasing other rows", () => {
  const malformed = [null, [], false, 17, "x/i", {}, { moduleId: "x/m" }, { implementationId: "x/i" },
    ...invalidIds.flatMap(id => [selection(id, "x/i"), selection("x/m", id)])];
  for (const row of malformed) {
    for (const position of [0, 1, 2]) {
      const rows = [selection(), selection("x/other", "x/other-i")];
      rows.splice(position, 0, row);
      assertFacts(profile({ selections: rows }), {
        selections: [selection(), selection("x/other", "x/other-i")],
        selectionCensusComplete: false, bindings: [],
      });
    }
  }
});

test("malformed binding rows, consumers and provider containers preserve surviving locators", () => {
  const malformed = [null, [], false, 17, "x/i", {},
    { slotId: "s", providerImplementationIds: [] }, { consumerImplementationId: "x/i", slotId: "s" },
    ...invalidIds.map(consumerImplementationId => binding({ consumerImplementationId })),
    ...[null, false, 17, "x/i", {}].map(providerImplementationIds => binding({ providerImplementationIds }))];
  const input = profile({ bindings: [binding({ providerImplementationIds: ["x/a"] }), ...malformed,
    binding({ providerImplementationIds: [null, "INVALID", { hidden: ["do/not/read"] }] })] });
  assertFacts(input, { selections: [selection()], selectionCensusComplete: true,
    bindings: [
      { ordinal: 0, consumerImplementationId: "x/i", slotId: "s", providerOccurrences: 1 },
      { ordinal: malformed.length + 1, consumerImplementationId: "x/i", slotId: "s", providerOccurrences: 3 },
    ] });
});

test("missing and invalid local slots become null while their consumer counts survive", () => {
  const invalidSlots = [null, false, 17, [], {}, "", "INVALID", "x/y", "a-", "é", "\ud800", "s".repeat(65)];
  const input = profile({ bindings: [
    { consumerImplementationId: "x/i", providerImplementationIds: [null, "INVALID"] },
    ...invalidSlots.map(slotId => binding({ slotId, providerImplementationIds: [null, "INVALID"] })),
    binding({ slotId: "s".repeat(64) }),
  ] });
  assertFacts(input, { selections: [selection()], selectionCensusComplete: true,
    bindings: [
      ...Array.from({ length: invalidSlots.length + 1 }, (_, ordinal) => ({ ordinal,
        consumerImplementationId: "x/i", slotId: null, providerOccurrences: 2 })),
      { ordinal: invalidSlots.length + 1, consumerImplementationId: "x/i", slotId: "s".repeat(64), providerOccurrences: 0 },
    ] });
});

test("portable identities and local slots retain their inclusive length boundaries", () => {
  const id = "a/" + "b".repeat(126);
  const slotId = "s".repeat(64);
  assertFacts(profile({ selections: [selection(id, id)], bindings: [binding({ consumerImplementationId: id, slotId })] }),
    { selections: [selection(id, id)], selectionCensusComplete: true,
      bindings: [{ ordinal: 0, consumerImplementationId: id, slotId, providerOccurrences: 0 }] });
});

test("bounded row lists are traversed once and oversized lists withhold all their evidence", () => {
  for (const [key, limit] of [["selections", 4096], ["bindings", 65_536]]) {
    for (const extra of [0, 1]) {
      const length = limit + extra;
      const rows = key === "selections" ? Array.from({ length }, () => selection()) : new Array(length).fill(null);
      if (key === "bindings") {
        rows[0] = binding({ providerImplementationIds: ["x/i"] });
        rows[length - 1] = binding();
      }
      const input = profile({ bindings: [binding()], [key]: rows });
      const expected = {
        selections: key === "selections" ? (extra ? [] : Array.from({ length: limit }, () => selection())) : [selection()],
        selectionCensusComplete: key !== "selections" || extra === 0,
        bindings: key !== "bindings"
          ? [{ ordinal: 0, consumerImplementationId: "x/i", slotId: "s", providerOccurrences: 0 }]
          : extra ? [] : [
            { ordinal: 0, consumerImplementationId: "x/i", slotId: "s", providerOccurrences: 1 },
            { ordinal: limit - 1, consumerImplementationId: "x/i", slotId: "s", providerOccurrences: 0 },
          ],
      };
      assert.deepEqual(profileResourceFacts(input), expected);
      for (const view of [objectDocument(input), rawView(input)]) {
        let target;
        let visited = 0;
        const actual = profileResourceFactsView(observe(view, {
          own(value, name, member) {
            if (value === view.root && name === key) {
              assert.equal(member.present, true);
              target = member.value;
            }
          },
          item(value, index) {
            if (value === target) {
              assert.equal(extra, 0, "an oversized list was traversed");
              assert.equal(index, visited, "row traversal must preserve each original position");
              visited += 1;
            }
          },
        }));
        assert.deepEqual(actual, expected);
        assert.equal(visited, extra ? 0 : length);
        assertFrozenFacts(actual);
      }
    }
  }
});

test("oversized providers expose exact length without element access or decoding through the real raw reader", () => {
  const count = 65_537;
  const provider = "do/not/decode";
  const input = profile({ bindings: [binding({ providerImplementationIds: new Array(count).fill(provider) })] });
  const expected = { selections: [selection()], selectionCensusComplete: true,
    bindings: [{ ordinal: 0, consumerImplementationId: "x/i", slotId: "s", providerOccurrences: count }] };
  const realScanner = createOwnedRawScanner({});
  const observedScanner = {
    open(bytes) {
      const cursor = realScanner.open(bytes);
      return {
        next: () => cursor.next(),
        decodeString(token) {
          const value = cursor.decodeString(token);
          assert.notEqual(value, provider, "a provider element was decoded");
          return value;
        },
      };
    },
  };
  assert.deepEqual(profileResourceFacts(input), expected);
  for (const view of [objectDocument(input), rawView(input, observedScanner)]) {
    const providers = new Set();
    let lengthReads = 0;
    const actual = profileResourceFactsView(observe(view, {
      own(value, key, member) {
        if (key === "providerImplementationIds" && member.present) providers.add(member.value);
      },
      length(value, length) {
        if (providers.has(value)) {
          assert.equal(length, count);
          lengthReads += 1;
        }
      },
      item(value) {
        assert.equal(providers.has(value), false, "a provider element was accessed");
      },
      text(value, text) {
        assert.notEqual(text, provider, "a provider element was read as text");
      },
    }));
    assert.equal(providers.size, 1);
    assert.ok(lengthReads > 0);
    assert.deepEqual(actual, expected);
    assertFrozenFacts(actual);
  }
});

test("resource facts own their plain frozen containers and survive caller mutation", () => {
  const input = profile({ bindings: [binding({ providerImplementationIds: ["x/a", "x/b"] })] });
  const expected = { selections: [selection()], selectionCensusComplete: true,
    bindings: [{ ordinal: 0, consumerImplementationId: "x/i", slotId: "s", providerOccurrences: 2 }] };
  const results = assertFacts(input, expected);
  for (const actual of results) {
    assert.notEqual(actual.selections, input.selections);
    assert.notEqual(actual.selections[0], input.selections[0]);
    assert.notEqual(actual.bindings, input.bindings);
    assert.notEqual(actual.bindings[0], input.bindings[0]);
  }
  for (const value of [input, input.selections, input.selections[0], input.bindings,
    input.bindings[0], input.bindings[0].providerImplementationIds]) assert.equal(Object.isFrozen(value), false);
  input.selections[0].moduleId = "x/changed";
  input.bindings[0].slotId = "changed";
  input.bindings[0].providerImplementationIds.length = 0;
  input.selections.length = 0;
  input.bindings.length = 0;
  for (const actual of results) assert.deepEqual(actual, expected);
});

test("object descriptor access ignores inherited fields, array members and accessors", () => {
  let getterCalls = 0;
  const getter = () => { getterCalls += 1; throw Error("getter invoked"); };
  const inherited = Object.create(selection());
  const arrayRow = Object.assign([], selection(), binding());
  const accessorSelection = Object.defineProperty({ implementationId: "x/i" }, "moduleId", { get: getter });
  const accessorBinding = Object.defineProperty(binding(), "slotId", { get: getter });
  const input = profile({ selections: [inherited, arrayRow, accessorSelection, selection()],
    bindings: [arrayRow, accessorBinding] });
  const expected = { selections: [selection()], selectionCensusComplete: false,
    bindings: [{ ordinal: 1, consumerImplementationId: "x/i", slotId: null, providerOccurrences: 0 }] };
  for (const actual of [profileResourceFacts(input), profileResourceFactsView(observe(objectDocument(input)))]) {
    assert.deepEqual(actual, expected);
    assertFrozenFacts(actual);
  }
  const arrayRoot = Object.assign([], { selections: [selection()], bindings: [binding()] });
  assert.deepEqual(profileResourceFacts(arrayRoot), emptyFacts());
  assert.deepEqual(profileResourceFactsView(observe(objectDocument(arrayRoot))), emptyFacts());
  assert.equal(ownValue(inherited, "moduleId"), undefined);
  assert.equal(ownValue(arrayRow, "moduleId"), undefined);
  assert.equal(ownValue(accessorSelection, "moduleId"), undefined);
  assert.equal(ownValue(selection(), "moduleId"), "x/m");
  assert.equal(getterCalls, 0);
});
