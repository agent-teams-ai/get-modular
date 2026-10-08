import { InvalidArgumentError } from "./errors.js";
import type { CleanupContext, CloseOptions, ScopeOptions } from "./types.js";

/** Release order of one scope after defaults are applied. */
export type Order = NonNullable<ScopeOptions["order"]>;

export const noop = (): void => {};

export function invalid(message: string): InvalidArgumentError {
  return new InvalidArgumentError("resources.argument.invalid", message);
}
export function isSignal(value: unknown): value is AbortSignal {
  return value instanceof AbortSignal;
}
export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}
export function checkName(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw invalid(`${what} requires a non-empty name`);
  }
  return value;
}
export function checkScopeOptions(options: unknown): { readonly name: string; readonly order: Order } {
  if (!isRecord(options)) {
    throw invalid("scope options must be an object with a name");
  }
  const name = checkName(options.name, "a scope");
  const order = options.order;
  if (order === undefined) {
    return { name, order: "reverse" };
  }
  if (order !== "reverse" && order !== "concurrent") {
    throw invalid('scope order must be "reverse" or "concurrent"');
  }
  return { name, order };
}
export function checkCloseOptions(options: unknown): CloseOptions {
  if (options === undefined) {
    return {};
  }
  if (!isRecord(options)) {
    throw invalid("close() options must be an object");
  }
  const { escalate, abandon } = options;
  if ((escalate !== undefined && !isSignal(escalate)) || (abandon !== undefined && !isSignal(abandon))) {
    throw invalid("close() options must be { escalate?: AbortSignal, abandon?: AbortSignal }");
  }
  return { escalate, abandon };
}
export function follow(signal: AbortSignal, onAbort: () => void): () => void {
  if (signal.aborted) {
    onAbort();
    return noop;
  }
  signal.addEventListener("abort", onAbort, { once: true });
  return () => {
    signal.removeEventListener("abort", onAbort);
  };
}
export function disposer(value: unknown): (context: CleanupContext) => unknown {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    throw invalid("use() requires a disposable object");
  }
  const asyncDispose: unknown = Reflect.get(value, Symbol.asyncDispose); // read once; `then` is never touched
  if (typeof asyncDispose === "function") {
    return (): unknown => {
      const pending: unknown = Reflect.apply(asyncDispose, value, []);
      return pending;
    };
  }
  const dispose: unknown = Reflect.get(value, Symbol.dispose);
  if (typeof dispose === "function") {
    return () => {
      Reflect.apply(dispose, value, []); // result ignored, as in TC39
    };
  }
  throw invalid("use() requires Symbol.asyncDispose or Symbol.dispose");
}
