export type OrderNotice = { readonly kind: "order"; readonly id: string };
export type EventSource = {
  readonly subscribe: (listener: (event: OrderNotice) => undefined) => () => void;
};
export type OrderInbox = { readonly received: () => readonly string[] };

// Plain behavior and consumer-owned ports: no GM, UI, platform or Host imports.
// Occurrences are retained individually; an equal value is not a duplicate command.
export function createOrderInbox() {
  const received: string[] = [];
  const port: OrderInbox = { received: () => [...received] };
  return {
    port,
    record: (event: OrderNotice): undefined => { received.push(event.id); },
  };
}
