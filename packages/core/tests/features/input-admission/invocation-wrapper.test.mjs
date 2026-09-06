import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { inspectInvocation } from "../../../dist-test/features/input-admission/invocation-wrapper.js";

function expectAdmitted(result, values, profile) {
  assert.equal(result.kind, "admitted");
  assert.notEqual(result.declarations, values);
  assert.equal(Object.getPrototypeOf(result.declarations), Array.prototype);
  assert.equal(result.declarations.length, values.length);
  for (let ordinal = 0; ordinal < values.length; ordinal += 1) {
    assert.equal(result.declarations[ordinal], values[ordinal]);
  }
  assert.equal(result.profile, profile);
}

for (const entry of ["object", "raw"]) {
  test(`${entry}: primitive wrappers and array lookalikes fail without coercion`, () => {
    for (const input of [null, undefined, false, true, 0, "", "wrapper", 1n, Symbol("wrapper"), () => {}]) {
      assert.deepEqual(inspectInvocation(input, entry), {
        kind: "invalid-wrapper", roots: ["declarations", "profile"],
      });
    }
    let calls = 0;
    const fake = {
      length: 0,
      get [Symbol.iterator]() { calls += 1; throw new Error("iterator must not run"); },
      [Symbol.toPrimitive]() { calls += 1; throw new Error("coercion must not run"); },
    };
    for (const declarations of [undefined, null, "", {}, fake, Object.create(Array.prototype),
      new Uint8Array(), new Set(), () => {}]) {
      assert.deepEqual(inspectInvocation({ declarations, profile: undefined }, entry), {
        kind: "invalid-wrapper", roots: ["declarations"],
      });
    }
    assert.equal(calls, 0);
  });

  test(`${entry}: cooperative wrappers retain own-field behavior across object categories`, () => {
    let calls = 0;
    const callable = () => { calls += 1; throw new Error("wrapper must not run"); };
    class Wrapper {}
    const wrappers = [{}, Object.create(null), Object.create({ inherited: true }),
      [], new Date(0), new Wrapper(), callable];
    for (const input of wrappers) {
      const declarations = [undefined];
      Object.defineProperties(input, {
        declarations: { value: declarations },
        profile: { value: undefined },
        ignored: { get() { calls += 1; throw new Error("extra field must not run"); } },
      });
      expectAdmitted(inspectInvocation(input, entry), declarations, undefined);
    }
    assert.equal(calls, 0);
  });

  test(`${entry}: missing, inherited and accessor fields report exact ordered roots`, () => {
    let calls = 0;
    const getter = () => { calls += 1; throw new Error("wrapper getter must not run"); };
    for (const field of ["declarations", "profile"]) {
      for (const shape of ["missing", "inherited", "accessor"]) {
        const input = { declarations: [], profile: undefined };
        const value = input[field];
        delete input[field];
        if (shape === "inherited") Object.setPrototypeOf(input, { [field]: value });
        if (shape === "accessor") Object.defineProperty(input, field, { get: getter });
        assert.deepEqual(inspectInvocation(input, entry), {
          kind: "invalid-wrapper", roots: [field],
        });
      }
    }
    const both = {};
    // Deliberately define profile first: failures still use declarations first.
    Object.defineProperty(both, "profile", { get: getter });
    Object.defineProperty(both, "declarations", { get: getter });
    for (const input of [both, {}, { declarations: { length: 0 } },
      Object.create({ declarations: [], profile: undefined })]) {
      assert.deepEqual(inspectInvocation(input, entry), {
        kind: "invalid-wrapper", roots: ["declarations", "profile"],
      });
    }
    assert.equal(calls, 0);
  });

  test(`${entry}: list extras and nonenumerable data indices are accepted without hooks`, () => {
    let calls = 0;
    const getter = () => { calls += 1; throw new Error("list hook must not run"); };
    const declarations = [undefined, null, "value"];
    Object.defineProperty(declarations, "1", { enumerable: false });
    for (const key of ["extra", "slice", "constructor", "01", "-1", Symbol.iterator, Symbol.toStringTag]) {
      Object.defineProperty(declarations, key, { get: getter });
    }
    Object.freeze(declarations);
    const input = Object.create(null);
    Object.defineProperties(input, {
      declarations: { value: declarations },
      profile: { value: undefined },
      extra: { get: getter },
    });
    Object.defineProperty(input, Symbol("extra"), { get: getter });
    Object.freeze(input);
    const result = inspectInvocation(input, entry);
    expectAdmitted(result, declarations, undefined);
    assert.deepEqual(Reflect.ownKeys(result.declarations), ["0", "1", "2", "length"]);
    assert.equal(calls, 0);
  });

  test(`${entry}: projection owns list positions while leaving document values untouched`, () => {
    const declaration = { state: "before" };
    declaration.self = declaration;
    const profile = { state: "profile" };
    const declarations = [declaration, undefined];
    const input = { declarations, profile };
    const result = inspectInvocation(input, entry);
    expectAdmitted(result, declarations, profile);
    assert.equal(Object.isFrozen(declaration), false);
    assert.equal(Object.isFrozen(profile), false);

    declarations[0] = "replacement";
    declarations.length = 0;
    input.declarations = ["new list"];
    input.profile = "new profile";
    assert.equal(result.declarations.length, 2);
    assert.equal(result.declarations[0], declaration);
    assert.equal(result.declarations[1], undefined);
    assert.equal(result.profile, profile);
    declaration.state = "after";
    profile.state = "after";
    assert.equal(result.declarations[0].state, "after");
    assert.equal(result.profile.state, "after");

    const next = inspectInvocation(input, entry);
    expectAdmitted(next, input.declarations, "new profile");
    assert.notEqual(next.declarations, result.declarations);
  });

  test(`${entry}: 4096 is admitted and every larger count has one saturated classification`, () => {
    const bounded = Array.from({ length: 4096 }, (_, ordinal) => ordinal);
    expectAdmitted(inspectInvocation({ declarations: bounded, profile: undefined }, entry), bounded, undefined);
    let calls = 0;
    for (const count of [4097, 65536, 4294967295]) {
      const declarations = [];
      declarations.length = count;
      const getter = () => { calls += 1; throw new Error("overflow index must not run"); };
      Object.defineProperty(declarations, "0", { get: getter });
      Object.defineProperty(declarations, `${count - 1}`, { get: getter });
      assert.deepEqual(inspectInvocation({ declarations, profile: undefined }, entry), {
        kind: "declarations-limit",
      });
      assert.deepEqual(inspectInvocation({ declarations }, entry), {
        kind: "invalid-wrapper", roots: ["profile"],
      });
      const accessorProfile = { declarations };
      Object.defineProperty(accessorProfile, "profile", { get: getter });
      assert.deepEqual(inspectInvocation(accessorProfile, entry), {
        kind: "invalid-wrapper", roots: ["profile"],
      });
    }
    assert.equal(calls, 0);
  });

  test(`${entry}: missing and accessor indices reject the whole bounded list, including its last index`, () => {
    let calls = 0;
    for (const ordinal of [0, 2048, 4095]) {
      for (const shape of ["missing", "accessor"]) {
        const declarations = Array.from({ length: 4096 }, (_, index) => index);
        delete declarations[ordinal];
        if (shape === "accessor") Object.defineProperty(declarations, `${ordinal}`, {
          get() { calls += 1; throw new Error("index getter must not run"); },
        });
        assert.deepEqual(inspectInvocation({ declarations, profile: { present: true } }, entry), {
          kind: "invalid-wrapper", roots: ["declarations"],
        });
      }
    }
    assert.equal(calls, 0);
  });

  test(`${entry}: field admission precedes length and count overflow precedes index reflection`, () => {
    // These cooperative observation proxies measure ordering only; this is not
    // an assertion of controlled behavior for arbitrary hostile Proxy traps.
    const events = [];
    const actual = [];
    actual.length = 4097;
    const declarations = new Proxy(actual, {
      getOwnPropertyDescriptor(target, key) {
        events.push(key);
        assert.equal(key, "length", "no index descriptor is eligible");
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
      get() { events.push("list-get"); assert.fail("list property access"); },
      ownKeys() { events.push("list-keys"); assert.fail("list key enumeration"); },
    });
    const target = { declarations, profile: undefined };
    const input = new Proxy(target, {
      getOwnPropertyDescriptor(value, key) {
        events.push(key);
        return Reflect.getOwnPropertyDescriptor(value, key);
      },
      get() { events.push("wrapper-get"); assert.fail("wrapper property access"); },
      ownKeys() { events.push("wrapper-keys"); assert.fail("wrapper key enumeration"); },
    });
    assert.deepEqual(inspectInvocation(input, entry), { kind: "declarations-limit" });
    assert.deepEqual(events, ["declarations", "profile", "length"]);

    Object.defineProperty(target, "profile", {
      get() { events.push("profile-get"); assert.fail("profile getter"); },
    });
    for (const count of [4097, 2]) {
      actual.length = count;
      events.length = 0;
      assert.deepEqual(inspectInvocation(input, entry), {
        kind: "invalid-wrapper", roots: ["profile"],
      });
      assert.deepEqual(events, ["declarations", "profile"]);
    }
  });

  test(`${entry}: mixed oversized and opaque values remain untouched beside late wrapper failure`, () => {
    let calls = 0;
    const reject = () => { calls += 1; throw new Error("document must not be inspected"); };
    const valid = new Uint8Array([123]);
    const oversized = new Uint8Array(1_048_577);
    const profile = new Uint8Array(8_388_609);
    for (const value of [valid, oversized, profile]) {
      for (const key of ["buffer", "length", "byteLength", "constructor", "slice", Symbol.iterator]) {
        Object.defineProperty(value, key, { get: reject });
      }
    }
    const opaque = new Proxy({}, {
      get: reject, getPrototypeOf: reject, getOwnPropertyDescriptor: reject, ownKeys: reject,
    });
    const declarations = [valid, oversized, opaque, undefined];
    expectAdmitted(inspectInvocation({ declarations, profile }, entry), declarations, profile);
    declarations.length = 5;
    assert.deepEqual(inspectInvocation({ declarations, profile }, entry), {
      kind: "invalid-wrapper", roots: ["declarations"],
    });
    Object.defineProperty(declarations, "4", { get: reject });
    assert.deepEqual(inspectInvocation({ declarations, profile }, entry), {
      kind: "invalid-wrapper", roots: ["declarations"],
    });
    assert.equal(calls, 0);
  });
}

test("raw lists admit foreign realms while object lists require the observed intrinsic prototype", () => {
  const foreign = runInNewContext("({ declarations: [1, undefined], profile: { present: true } })");
  expectAdmitted(inspectInvocation(foreign, "raw"), foreign.declarations, foreign.profile);
  assert.deepEqual(inspectInvocation(foreign, "object"), {
    kind: "invalid-wrapper", roots: ["declarations"],
  });

  const localList = [1, undefined];
  const foreignWrapper = runInNewContext("({ declarations, profile: undefined })", { declarations: localList });
  for (const entry of ["object", "raw"]) {
    expectAdmitted(inspectInvocation(foreignWrapper, entry), localList, undefined);
  }

  // Array provenance is not inferred after its observed prototype is replaced.
  Object.setPrototypeOf(foreign.declarations, Array.prototype);
  expectAdmitted(inspectInvocation(foreign, "object"), foreign.declarations, foreign.profile);
});

test("raw array branding accepts subclasses and altered prototypes without broadening object lists", () => {
  class DeclarationList extends Array {}
  const custom = [1];
  Object.setPrototypeOf(custom, Object.create(Array.prototype));
  const nullPrototype = [2];
  Object.setPrototypeOf(nullPrototype, null);
  const foreignSubclass = runInNewContext("new (class extends Array {})(3, 4)");
  for (const declarations of [new DeclarationList(1, 2), custom, nullPrototype, foreignSubclass]) {
    expectAdmitted(inspectInvocation({ declarations, profile: undefined }, "raw"), declarations, undefined);
    assert.deepEqual(inspectInvocation({ declarations, profile: undefined }, "object"), {
      kind: "invalid-wrapper", roots: ["declarations"],
    });
    assert.deepEqual(inspectInvocation({ declarations }, "object"), {
      kind: "invalid-wrapper", roots: ["declarations", "profile"],
    });
  }
});

test("inherited-only late indices cannot satisfy either entry's own data requirement", () => {
  const declarations = Array.from({ length: 4096 }, (_, ordinal) => ordinal);
  delete declarations[4095];
  const previousIndex = Object.getOwnPropertyDescriptor(Array.prototype, "4095");
  const previousLength = Object.getOwnPropertyDescriptor(Array.prototype, "length");
  let objectResult;
  let rawResult;
  try {
    Object.defineProperty(Array.prototype, "4095", {
      value: "inherited", configurable: true, writable: true,
    });
    objectResult = inspectInvocation({ declarations, profile: undefined }, "object");
    rawResult = inspectInvocation({ declarations, profile: undefined }, "raw");
  } finally {
    if (previousIndex === undefined) delete Array.prototype[4095];
    else Object.defineProperty(Array.prototype, "4095", previousIndex);
    Object.defineProperty(Array.prototype, "length", previousLength);
  }
  assert.deepEqual(objectResult, { kind: "invalid-wrapper", roots: ["declarations"] });
  assert.deepEqual(rawResult, { kind: "invalid-wrapper", roots: ["declarations"] });
});

test("wrapper reflection and owned list construction use intrinsics captured at module evaluation", () => {
  const rawInput = runInNewContext("({ declarations: [1, undefined], profile: undefined })");
  const objectInput = { declarations: [2], profile: undefined };
  const oversized = [];
  oversized.length = 4294967295;
  const limitInput = { declarations: oversized, profile: undefined };
  const properties = [
    [Object, "getOwnPropertyDescriptor"], [Object, "hasOwn"], [Object, "getPrototypeOf"],
    [Object, "defineProperty"], [Object, "freeze"], [Array, "isArray"], [Number, "isInteger"],
  ];
  const saved = properties.map(([owner, key]) => [owner, key, Object.getOwnPropertyDescriptor(owner, key)]);
  const restore = Object.defineProperty;
  let calls = 0;
  const reject = () => { calls += 1; throw new Error("replacement intrinsic must not run"); };
  let rawResult;
  let objectResult;
  let invalidResult;
  let limitResult;
  try {
    for (const [owner, key] of properties) {
      restore(owner, key, { value: reject, configurable: true, writable: true });
    }
    rawResult = inspectInvocation(rawInput, "raw");
    objectResult = inspectInvocation(objectInput, "object");
    invalidResult = inspectInvocation({}, "raw");
    limitResult = inspectInvocation(limitInput, "raw");
  } finally {
    for (const [owner, key, descriptor] of saved) restore(owner, key, descriptor);
  }
  assert.equal(calls, 0);
  expectAdmitted(rawResult, rawInput.declarations, undefined);
  expectAdmitted(objectResult, objectInput.declarations, undefined);
  assert.deepEqual(invalidResult, { kind: "invalid-wrapper", roots: ["declarations", "profile"] });
  assert.deepEqual(limitResult, { kind: "declarations-limit" });
});
