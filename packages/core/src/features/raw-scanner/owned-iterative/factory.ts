import type { OwnedRawScannerDeps, RawScannerPort } from "../ports.js";
import { openOwnedRawTokenCursor } from "./scanner.js";

/** Pure construction; all mutable scanning state belongs to open calls. */
export function createOwnedRawScanner(_deps: OwnedRawScannerDeps): RawScannerPort {
  return Object.freeze({ open: openOwnedRawTokenCursor });
}
