import type { CanonicalBytesPort, JsonValue, OwnedJcsDeps } from "../ports.js";

type ContainerFrame = {
  readonly kind: "container";
  readonly value: object;
  readonly keys: readonly string[];
  readonly array: boolean;
  index: number;
};
type Frame = { readonly kind: "value"; readonly value: unknown } | ContainerFrame;

function invalidValue(): never {
  throw new TypeError("Canonicalization requires an acyclic JSON value with well-formed Unicode and finite numbers.");
}

function quote(value: string): string {
  // TextEncoder would replace lone surrogates, silently changing content identity.
  if (!value.isWellFormed()) invalidValue();
  return JSON.stringify(value);
}

function member(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) {
    invalidValue();
  }
  return descriptor.value;
}

function container(value: object): ContainerFrame {
  const array = Array.isArray(value);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== null && prototype !== Object.prototype) {
    invalidValue();
  }
  const ownKeys = Reflect.ownKeys(value);
  const keys: string[] = [];
  for (const key of ownKeys) {
    if (typeof key !== "string") invalidValue();
    if (array && key === "length") continue;
    keys.push(key);
  }
  if (array) {
    // Array-index own keys are returned in index order. Extra keys and holes
    // must fail instead of being dropped or converted to null.
    const length: unknown = Object.getOwnPropertyDescriptor(value, "length")?.value;
    if (keys.length !== length || keys.some((key, index) => key !== String(index))) invalidValue();
  } else {
    // Default sort compares UTF-16 code units, including numeric-looking keys.
    keys.sort();
  }
  return { kind: "container", value, keys, array, index: 0 };
}

function canonicalize(value: JsonValue): Uint8Array {
  const chunks: string[] = [];
  const stack: Frame[] = [{ kind: "value", value }];
  const ancestors = new WeakSet<object>();
  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) break;
    if (frame.kind === "container") {
      const key = frame.keys[frame.index];
      if (key === undefined) {
        chunks.push(frame.array ? "]" : "}");
        ancestors.delete(frame.value);
        continue;
      }
      if (frame.index > 0) chunks.push(",");
      if (!frame.array) chunks.push(quote(key), ":");
      frame.index += 1;
      stack.push(frame, { kind: "value", value: member(frame.value, key) });
      continue;
    }
    const current = frame.value;
    if (current === null) {
      chunks.push("null");
    } else if (typeof current === "string") {
      chunks.push(quote(current));
    } else if (typeof current === "boolean") {
      chunks.push(current ? "true" : "false");
    } else if (typeof current === "number") {
      if (!Number.isFinite(current)) invalidValue();
      // JCS follows ECMAScript number serialization, including -0 -> 0.
      // The compiler's narrower numeric admission is owned by input-admission.
      chunks.push(JSON.stringify(current));
    } else if (typeof current === "object") {
      if (ancestors.has(current)) invalidValue();
      ancestors.add(current);
      const next = container(current);
      chunks.push(next.array ? "[" : "{");
      stack.push(next);
    } else {
      invalidValue();
    }
  }
  return new TextEncoder().encode(chunks.join(""));
}

/** Pure construction; hashing and domain separation belong to plan-output. */
export function createOwnedJcs(_deps: OwnedJcsDeps): CanonicalBytesPort {
  return Object.freeze({ canonicalize });
}
