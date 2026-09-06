/** Byte offsets are half-open; string spans include both quotation marks. */
export type RawToken =
  | {
      readonly kind: "string";
      readonly start: number;
      readonly end: number;
      /** Decoded UTF-8 length, charging three bytes for each lone surrogate. */
      readonly decodedUtf8Bytes: number;
      readonly wellFormedUtf16: boolean;
    }
  | {
      readonly kind:
        | "object-start"
        | "object-end"
        | "array-start"
        | "array-end"
        | "colon"
        | "comma"
        | "true"
        | "false"
        | "null"
        | "number"
        | "end"
        | "invalid";
      readonly start: number;
      readonly end: number;
    };

export interface RawTokenCursor {
  /** Lexical failure emits one invalid token; subsequent calls return end. */
  readonly next: () => RawToken;
  /**
   * Lazily decode a string token returned by this cursor. Tokens remain usable
   * after later next calls, including end or invalid. Lone escaped surrogates
   * are preserved as UTF-16 code units for the consumer's schema checks.
   */
  readonly decodeString: (token: Extract<RawToken, { readonly kind: "string" }>) => string;
}

export interface RawScannerPort {
  /**
   * The consumer supplies owned, fixed bytes and keeps them unchanged for the
   * cursor's lifetime. Carrier admission, copying and resource policy belong
   * to the consumer. Each open call creates independent synchronous state.
   */
  readonly open: (ownedBytes: Uint8Array) => RawTokenCursor;
}

export type OwnedRawScannerDeps = Readonly<Record<string, never>>;
