import type { Resources } from "@get-modular/resources";
import { invalidArgument, ObservationError } from "../errors/errors.js";

export type RawReport = { readonly source: string; readonly subscription: string; readonly revision: number; readonly cause: unknown };
export type EngineOptions = {
  readonly name: string; readonly resources: Resources; readonly reportError: (report: RawReport) => void;
  readonly maxSubscriptionsPerScope: number; readonly maxSubscriptions: number;
};
export type RawSpec = Readonly<Record<string, unknown>>;
export function isResources(value: unknown): value is Resources {
  if (typeof value !== "object" || value === null) {return false;}
  const candidate = value as Partial<Resources>;
  return candidate.signal instanceof AbortSignal && typeof candidate.use === "function"
    && typeof candidate.child === "function" && typeof candidate.setup === "function";
}
export function checkedSpec(spec: unknown): RawSpec {
  if (typeof spec !== "object" || spec === null) {throw invalidArgument("a subscription requires an object spec");}
  return spec as RawSpec;
}
export function callbackOf(spec: RawSpec, name: string): (...args: unknown[]) => unknown {
  const callback = spec[name];
  if (typeof callback !== "function") {throw invalidArgument(`${name} must be a function`);}
  return (...args): unknown => { const result: unknown = Reflect.apply(callback, undefined, args); return result; };
}
function limit(value: unknown, fallback: number, name: string): number {
  const result = value ?? fallback;
  if (typeof result !== "number" || !Number.isSafeInteger(result) || result < 1) {
    throw invalidArgument(`${name} must be a positive safe integer`);
  }
  return result;
}
export function checkedOptions(value: unknown): EngineOptions {
  if (typeof value !== "object" || value === null) {throw invalidArgument("options must be { name, resources, reportError }");}
  const options = value as RawSpec;
  const { name, resources } = options;
  if (typeof name !== "string" || name.length === 0) {throw invalidArgument("a store requires a non-empty name");}
  if (!isResources(resources)) {throw invalidArgument("a store requires resources");}
  const reporter = callbackOf(options, "reportError");
  return {
    name, resources, reportError: (report) => { reporter(report); },
    maxSubscriptionsPerScope: limit(options.maxSubscriptionsPerScope, 64, "maxSubscriptionsPerScope"),
    maxSubscriptions: limit(options.maxSubscriptions, 8192, "maxSubscriptions"),
  };
}
export function checkedKeys(value: unknown, known: ReadonlySet<string>): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {throw new ObservationError("observation.keys.empty", "at least one key is required");}
  const keys: string[] = [];
  for (const key of new Set<unknown>(value)) {
    if (typeof key !== "string" || !known.has(key)) {throw new ObservationError("observation.keys.unknown", `unknown key: ${String(key)}`);}
    keys.push(key);
  }
  return Object.freeze(keys);
}
