/** Stable codes for errors created by observation. Compare codes, never classes. */
export type ObservationErrorCode =
  | "observation.argument.invalid"
  | "observation.keys.empty"
  | "observation.keys.unknown"
  | "observation.values.not-plain"
  | "observation.store.closed"
  | "observation.snapshot.foreign"
  | "observation.subscription.duplicate-name"
  | "observation.subscriptions.limit"
  | "observation.delivery.echo"
  | "observation.delivery.cascade"
  | "observation.callback.returned-value"
  | "observation.source.closed"
  | "observation.load.still-running"
  | "observation.testing.timeout";

export class ObservationError extends Error {
  readonly code: ObservationErrorCode;
  constructor(code: ObservationErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ObservationError";
    this.code = code;
  }
}

export function invalidArgument(message: string): ObservationError {
  return new ObservationError("observation.argument.invalid", message);
}
