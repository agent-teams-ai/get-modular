import type { Resources } from "@get-modular/resources";
import { invalidArgument, ObservationError } from "../errors/errors.js";
import { isResources, type RawSpec } from "./arguments.js";
import type { StoreEngine } from "./engine.js";
import { originOf, type Origin } from "./registry.js";

export type Admission = {
  readonly origin: Origin; readonly resources: Resources; readonly name: string; readonly names: Set<string>;
};
export function admit(engine: StoreEngine, snapshot: unknown, spec: RawSpec): Admission {
  const origin = originOf(snapshot, engine.token);
  engine.assertOpen();
  const { resources, name } = spec;
  if (!isResources(resources)) {throw invalidArgument("watch and load require resources");}
  if (typeof name !== "string" || name.length === 0) {throw invalidArgument("watch and load require a non-empty name");}
  resources.signal.throwIfAborted();
  const names = engine.scopeNames(resources);
  if (names.has(name)) {
    throw new ObservationError("observation.subscription.duplicate-name",
      `${name} is already subscribed to ${engine.options.name} in this scope; use a distinct name or a child scope per piece of work`);
  }
  if (names.size >= engine.options.maxSubscriptionsPerScope) {
    throw new ObservationError("observation.subscriptions.limit",
      `this scope already holds ${engine.options.maxSubscriptionsPerScope} live subscriptions on ${engine.options.name} (maxSubscriptionsPerScope)`);
  }
  if (engine.size >= engine.options.maxSubscriptions) {
    const counts = engine.scopeCounts();
    throw new ObservationError("observation.subscriptions.limit",
      `${engine.options.name} already has ${engine.options.maxSubscriptions} live subscriptions (maxSubscriptions) in ${counts.size} scopes, at most ${Math.max(...counts.values())} in one; refused for this scope. A module that opens a child scope per piece of work and never closes it leaks one subscription per piece.`);
  }
  return { origin, resources, name, names };
}
