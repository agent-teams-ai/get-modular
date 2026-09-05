/** Owned JSON values supplied by admission, plan output, or diagnostic rules. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface CanonicalBytesPort {
  /** RFC 8785 bytes. Internal defects throw; this port does not emit diagnostics. */
  readonly canonicalize: (value: JsonValue) => Uint8Array;
}

export type OwnedJcsDeps = Readonly<Record<string, never>>;
