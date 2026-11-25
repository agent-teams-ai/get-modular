import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  materializeRawDocumentInput,
  rawDocumentCases,
} from "../qualification-support/m2-candidate/raw-document-cases.mjs";

// Exercise the actual generated public API, not a replacement compiler or a
// second hash provider. The existing raw corpus owns semantic expectations.
const prefix = "od005.raw-document.v1/";
const positiveId = prefix + "baseline";
const negativeId = prefix + "unsupported-version/profile";

function rawInput(id: string) {
  const input = materializeRawDocumentInput(id);
  const declarations: unknown = input.declarations;
  const profile: unknown = input.profile;
  assert.ok(Array.isArray(declarations));
  assert.ok(declarations.every((value: unknown): value is Uint8Array => value instanceof Uint8Array));
  assert.ok(profile instanceof Uint8Array);
  return { declarations, profile };
}

async function expectedCanonicalBytes(): Promise<Uint8Array> {
  // The corpus producer above already authenticates this exact vector file.
  // Reuse its first normalization case, including the independent wire bytes.
  const url = new URL("../../../../architecture/qualification/v1/normalization-vectors.json", import.meta.url);
  const document: unknown = JSON.parse(await readFile(url, "utf8"));
  assert.ok(typeof document === "object" && document !== null && "cases" in document);
  assert.ok(Array.isArray(document.cases));
  const first: unknown = document.cases[0];
  assert.ok(typeof first === "object" && first !== null && "canonicalUtf8" in first);
  assert.equal("name" in first ? first.name : undefined, "branching-multi-root-many-order-and-input-permutations");
  assert.ok(typeof first.canonicalUtf8 === "string");
  return new TextEncoder().encode(first.canonicalUtf8);
}

test("public Core separates runtime primitive failure from input rejection and recovers", async () => {
  const fixtures = [...rawDocumentCases()];
  const positive = fixtures.find(row => row.caseId === positiveId);
  const negative = fixtures.find(row => row.caseId === negativeId);
  assert.ok(positive && negative);
  assert.equal(positive.expected.ok, true);
  assert.equal(negative.expected.ok, false);
  const canonical = await expectedCanonicalBytes();
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  assert.ok(original?.configurable, "isolated test must be able to restore the actual runtime descriptor");
  const setCrypto = (value: unknown) => Object.defineProperty(globalThis, "crypto", {
    value, configurable: true, enumerable: original.enumerable ?? false,
  });

  try {
    // An unavailable hashing primitive must not prevent import or turn invalid
    // input into an environmental error. No supported no-WebCrypto claim.
    setCrypto(undefined);
    const core = await import("../../dist/index.js");
    const objectInput = () => structuredClone(positive.schemaValidCompanion);
    assert.deepEqual(await core.compileCompositionJson(rawInput(negativeId)), negative.expected);
    await assert.rejects(core.compileComposition(objectInput()), TypeError);
    await assert.rejects(core.compileCompositionJson(rawInput(positiveId)), TypeError);

    // A controlled failing primitive receives exactly the canonical bytes.
    // It may reject execution, but cannot manufacture a compiler diagnostic.
    const failure = new Error("qualification-only hash failure");
    let calls = 0;
    setCrypto({ subtle: { digest(algorithm: unknown, bytes: unknown) {
      calls += 1;
      assert.equal(algorithm, "SHA-256");
      assert.deepEqual(bytes, canonical);
      return Promise.reject(failure);
    } } });
    assert.deepEqual(await core.compileCompositionJson(rawInput(negativeId)), negative.expected);
    assert.equal(calls, 0, "input rejection must not request hashing");
    await assert.rejects(core.compileComposition(objectInput()), error => error === failure);
    await assert.rejects(core.compileCompositionJson(rawInput(positiveId)), error => error === failure);
    assert.equal(calls, 2, "each admitted invocation requests exactly one digest");

    // Restore the real host primitive in the same loaded module. A failed call
    // must not poison future requests or select a hidden fallback provider.
    Object.defineProperty(globalThis, "crypto", original);
    assert.deepEqual(await core.compileComposition(objectInput()), positive.expected);
    assert.deepEqual(await core.compileCompositionJson(rawInput(positiveId)), positive.expected);
    assert.deepEqual(await core.compileCompositionJson(rawInput(negativeId)), negative.expected);
  } finally {
    Object.defineProperty(globalThis, "crypto", original);
  }
});
