import { admissionLimits } from "./resource-limits.js";

export type WrapperProjection =
  | {
    readonly kind: "admitted";
    readonly declarations: readonly unknown[];
    readonly profile: unknown;
  }
  | {
    readonly kind: "invalid-wrapper";
    readonly roots: readonly ("declarations" | "profile")[];
  }
  | { readonly kind: "declarations-limit" };

// Capture the intrinsics used by the wrapper procedure at module evaluation.
// Reflection still assumes cooperative Host data; Proxy execution is outside
// that boundary and reflection failures are not converted to document facts.
const getOwnDescriptor = Object.getOwnPropertyDescriptor;
const hasOwn = Object.hasOwn;
const isArray = Array.isArray;
const getPrototypeOf = Object.getPrototypeOf;
const arrayPrototype = Array.prototype;
const isInteger = Number.isInteger;
const defineProperty = Object.defineProperty;
const freeze = Object.freeze;

type OwnData = { readonly value: unknown };

function ownData(value: object, key: string): OwnData | undefined {
  const descriptor = getOwnDescriptor(value, key);
  if (descriptor === undefined || !hasOwn(descriptor, "value")) return undefined;
  return descriptor as OwnData;
}

function invalidWrapper(roots: readonly ("declarations" | "profile")[]): WrapperProjection {
  return freeze({ kind: "invalid-wrapper", roots: freeze(roots) });
}

/**
 * Projects the cooperative invocation wrapper and its bounded declaration list.
 * Only the list container is owned here. Its values and the profile remain
 * temporary borrowed values for admission to consume synchronously before any
 * continuation. Rejection exposes neither values nor a partial projection.
 */
export function inspectInvocation(input: unknown, entry: "object" | "raw"): WrapperProjection {
  // The wrapper is not itself a document: callable and custom-prototype
  // wrappers retain the existing object-entry behavior when their fields pass.
  if (input === null || (typeof input !== "object" && typeof input !== "function")) {
    return invalidWrapper(["declarations", "profile"]);
  }

  const declarationsField = ownData(input, "declarations");
  const profileField = ownData(input, "profile");
  const list = declarationsField?.value;
  if (!isArray(list) || (entry === "object" && getPrototypeOf(list) !== arrayPrototype)) {
    return invalidWrapper(profileField === undefined ? ["declarations", "profile"] : ["declarations"]);
  }
  if (profileField === undefined) return invalidWrapper(["profile"]);

  // Both own wrapper fields must pass before length establishes count evidence.
  // Ordinary genuine arrays always supply an own integer data length.
  const count = ownData(list, "length")?.value;
  if (typeof count !== "number" || !isInteger(count) || count < 0 || count > 4_294_967_295) {
    return invalidWrapper(["declarations"]);
  }
  if (count > admissionLimits.declarations) return freeze({ kind: "declarations-limit" });

  // Allocate only after count admission. Read canonical own data indices,
  // ignoring enumerability, additional keys and every iterable hook.
  const declarations: unknown[] = [];
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    const key = `${ordinal}`;
    const item = ownData(list, key);
    if (item === undefined) return invalidWrapper(["declarations"]);
    defineProperty(declarations, key, {
      value: item.value, enumerable: true, configurable: true, writable: true,
    });
  }

  return freeze({
    kind: "admitted",
    declarations: freeze(declarations),
    profile: profileField.value,
  });
}
