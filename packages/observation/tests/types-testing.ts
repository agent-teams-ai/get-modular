// T13 T71 T103: every testing export and the owner/facet boundary.
import type { Resources } from "@get-modular/resources";
import {
  createStore, type Key, type Keys, type Frozen, type FixedKeys, type SnapshotOf,
  type LoadContext, type Subscription, type WatchSpec, type LoadSpec, type StoreOptions,
  type ObservationErrorCode,
} from "../dist/index.js";
import { liveSubscriptions, delivered, settled, asyncDetection, type WaitOptions } from "../dist/testing.js";
declare const resources: Resources;
declare const options: StoreOptions;
const owner = createStore({ count: 0 }, options);
const facet = owner.readonly();
const count: number = liveSubscriptions(facet, resources);
const detection: boolean = asyncDetection;
const waits: WaitOptions = { stores: [facet], signal: resources.signal, timeoutMs: Infinity };
const delivery: Promise<void> = delivered(waits);
const settlement: Promise<void> = settled(waits);
// @ts-expect-error owner Store is not the testing facet contract
liveSubscriptions(owner);
// @ts-expect-error waits take facets
settled({ stores: [owner] });
type PublicTypes = [Key<{ count: number }>, Keys<{ count: number }>, Frozen<{ count: number }>,
  FixedKeys<{ count: number }>, SnapshotOf<{ count: number }>, LoadContext, Subscription,
  WatchSpec<unknown>, LoadSpec<unknown, number>, ObservationErrorCode];
declare const publicTypes: PublicTypes;
void [count, detection, delivery, settlement, publicTypes];
