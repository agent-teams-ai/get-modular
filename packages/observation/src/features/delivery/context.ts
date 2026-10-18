import { createContextStorage, scheduleTask, type ContextStorage } from "./platform.js";

export type Live = { open: boolean };
/** An empty engine identity has no reverse link to an engine, scope or callback. */
export type DeliveryOrigin = { readonly engine: object; readonly keys: readonly string[]; readonly name: string };
export type DeliveryContext = { readonly depth: number; readonly origin: DeliveryOrigin; readonly live: Live };
export const MAX_CASCADE_DEPTH: number = 64;
export const reportedByStore: WeakSet<object> = new WeakSet();
const storage: ContextStorage<DeliveryContext> | undefined = createContextStorage<DeliveryContext>();
export const asyncDetection: boolean = storage !== undefined;
let syncContext: DeliveryContext | undefined;
export function currentContext(): DeliveryContext | undefined {
  const context = syncContext ?? storage?.getStore();
  return context?.live.open === true ? context : undefined;
}
export function runInContext<R>(context: DeliveryContext, callback: () => R): R {
  const outer = syncContext;
  syncContext = context;
  try { return storage === undefined ? callback() : storage.run(context, callback); }
  finally { syncContext = outer; }
}

type Node = { readonly run: () => void; next: Node | undefined };
let head: Node | undefined;
let tail: Node | undefined;
function runNext(): void {
  const node = head;
  if (node === undefined) return;
  head = node.next;
  node.next = undefined;
  if (head === undefined) tail = undefined;
  node.run();
}
/** Exactly one native callback per queue node, scheduled at enqueue time. */
export function later(run: () => void): void {
  const node: Node = { run, next: undefined };
  if (tail === undefined) head = node;
  else tail.next = node;
  tail = node;
  if (storage === undefined) scheduleTask(runNext);
  else storage.exit(() => { scheduleTask(runNext); });
}
export function deliveryTask(run: (live: Live) => void, complete: () => void): void {
  const live: Live = { open: true };
  later(() => { run(live); });
  later(() => { live.open = false; complete(); });
}
