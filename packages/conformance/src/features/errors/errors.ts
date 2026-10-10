/** Every error this package throws or rejects with carries one of these codes; compare `code`, never `instanceof`. */
export type ConformanceErrorCode =
  | "conformance.argument.invalid"
  | "conformance.isolate.construction-failed"
  | "conformance.smoke.failed"
  | "conformance.namespaces.violation"
  | "conformance.suite.revision-mismatch"
  | "conformance.suite.case-failed"
  | "conformance.handles.leaked"
  | "conformance.handles.unsupported-runtime";

/** `cause` is the underlying error when there is one; `details` is structured data for the failure, never for matching. */
export class ConformanceError extends Error {
  readonly code: ConformanceErrorCode;
  readonly details: unknown;
  constructor(
    code: ConformanceErrorCode,
    message: string,
    options?: { readonly cause?: unknown; readonly details?: unknown },
  ) {
    super(message, options !== undefined && Object.hasOwn(options, "cause") ? { cause: options.cause } : undefined);
    this.name = "ConformanceError";
    this.code = code;
    this.details = options?.details;
  }
}

/** A programming error in a call, raised before any state change. */
export function invalid(message: string): ConformanceError {
  return new ConformanceError("conformance.argument.invalid", message);
}
