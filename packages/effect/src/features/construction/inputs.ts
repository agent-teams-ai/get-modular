import { captureWiringInputs } from "@get-modular/assembly";
import type { CreatedEntry, Wiring } from "@get-modular/assembly";
import type { EffectEntryFactory } from "./types.js";

/** Invalid invocation data fails the returned Layer before any selected factory. */
export class InvalidInputs extends Error {
  readonly _tag = "InvalidInputs" as const;
  constructor(cause: unknown) {
    super("effect.layer.invalid-inputs", { cause });
    this.name = "InvalidInputs";
  }
}

function inputsOption(options: unknown): unknown {
  if (options === undefined) { return undefined; }
  if (options === null || typeof options !== "object") { throw new TypeError("Expected Layer options"); }
  const prototype: unknown = Object.getPrototypeOf(options);
  if (prototype !== Object.prototype && prototype !== null) { throw new TypeError("Expected a plain options record"); }
  const keys = Reflect.ownKeys(options);
  if (keys.length === 0) { return undefined; }
  if (keys.length !== 1 || keys[0] !== "inputs") { throw new TypeError("Layer options contain only inputs"); }
  const descriptor = Object.getOwnPropertyDescriptor(options, "inputs");
  if (!descriptor || !("value" in descriptor)) { throw new TypeError("Inputs must be an own data property"); }
  return descriptor.value;
}

export function captureInputs(wiring: Wiring<EffectEntryFactory>, options: unknown): ReadonlyMap<string, CreatedEntry> | InvalidInputs {
  try {
    return captureWiringInputs(wiring, inputsOption(options));
  } catch (cause) {
    return new InvalidInputs(cause);
  }
}
