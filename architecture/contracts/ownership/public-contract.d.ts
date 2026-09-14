// ADR-0028 C0 pseudo-contract: declaration evidence only, never a runtime entry.
// Brands are private; runtime membership must be authenticated by the scope.
declare const ticketBrand: unique symbol;
declare const claimBrand: unique symbol;
export interface OwnershipTicket { readonly [ticketBrand]: true }
export interface CleanupClaim { readonly [claimBrand]: true }
export type OwnershipState =
  | "pending" | "rejected-empty" | "owned" | "transferred"
  | "cleanup-in-flight" | "cleanup-incomplete" | "released";
// Unresolved keeps the current claim refinable; released/retry-safe close the attempt.
export type CleanupSettlement = "released" | "retry-safe" | "unresolved";
export type OwnershipRefusal =
  | "sealed" | "foreign-ticket" | "foreign-claim" | "stale-claim"
  | "invalid-state" | "already-in-flight" | "unresolved";
export type OwnershipResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: OwnershipRefusal };
export interface OwnershipSnapshot {
  readonly admission: "open" | "sealed";
  readonly counts: Readonly<Record<OwnershipState, number>>;
}
export interface OwnershipScope {
  reserve(): OwnershipResult<OwnershipTicket>;
  fulfill(ticket: OwnershipTicket): OwnershipResult<"owned">;
  reject(ticket: OwnershipTicket): OwnershipResult<"rejected-empty">;
  transfer(ticket: OwnershipTicket): OwnershipResult<"transferred">;
  seal(): void;
  beginCleanup(ticket: OwnershipTicket): OwnershipResult<CleanupClaim>;
  settleCleanup(claim: CleanupClaim, outcome: CleanupSettlement): OwnershipResult<"released" | "cleanup-incomplete">;
  snapshot(): OwnershipSnapshot;
}
export declare function createOwnershipScope(): OwnershipScope;
