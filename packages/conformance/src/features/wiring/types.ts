import type { SuccessfulComposition } from "@get-modular/assembly";

/** One hand-written part of a root's provider oracle. Keep parts in test code, never in production source. */
export type WiringOracle = {
  /** Capability id -> the implementation id(s) providing it. Every capability a selected module provides is pinned. */
  readonly providers: Readonly<Record<string, string | readonly string[]>>;
  /** Implementation ids of the roots this part owns. */
  readonly roots?: readonly string[];
  /** Rows completion does not produce (optional, many, several providers), exactly as written. */
  readonly rows?: readonly WiringRow[];
};

export type WiringRow = {
  readonly consumer: string;
  readonly slot: string;
  readonly providers: readonly string[];
};

export type WiringDifferenceRule =
  | "capability-provider"
  | "oracle-provider-conflict"
  | "oracle-root-conflict"
  | "oracle-row-conflict"
  | "root"
  | "row"
  | "row-order"
  | "selection"
  | "unlisted-row";

/** One named difference between a compiled plan and the union of the hand-written oracle parts. */
export type WiringDifference = {
  readonly rule: WiringDifferenceRule;
  readonly subject: string;
  readonly expected: readonly string[];
  readonly actual: readonly string[];
  readonly message: string;
};

export type WiringInput = SuccessfulComposition;
