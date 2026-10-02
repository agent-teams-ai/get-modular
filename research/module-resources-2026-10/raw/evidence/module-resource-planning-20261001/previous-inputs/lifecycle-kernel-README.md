# @get-modular/lifecycle-kernel

An optional, synchronous generation and lease bookkeeping candidate for product
Hosts. It records admission and retention for one JavaScript execution agent. It
does not load executables, grant permissions, run callbacks, supervise async work,
or dispose resources.

For a resource already owned by a Host, retain its record across async work and
cleanup failure. Acquisition with an unknown outcome needs its own retained
attempt owner before this example begins.

```ts
import { createLifecycleKernel, type Result } from "@get-modular/lifecycle-kernel";

type HostOwner = {
  resource: { write(message: string): void; close(): Promise<void> };
  nextMessage(): Promise<string>;
  keepForRecovery(record: object): void; // Synchronous, no-throw Host bookkeeping.
  forgetRecovery(record: object): void;
};

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

async function deliver(owner: HostOwner): Promise<void> {
  const kernel = createLifecycleKernel();
  const generation = kernel.stage();
  const custody = value(kernel.retainCustody(generation));
  const record = { kernel, generation, custody };
  owner.keepForRecovery(record); // Host retains this before any await.
  try {
    // Host has proved readiness and commits routing in this synchronous turn.
    value(kernel.activate(generation));
    const call = value(kernel.beginCall(generation));
    try {
      const message = await owner.nextMessage();
      if (!kernel.checkCall(call).ok) return; // Recheck after await.
      owner.resource.write(message); // Ordinary Host-mediated effect.
    } finally {
      value(kernel.release(call));
    }
  } finally {
    value(kernel.retire(generation));
    await owner.resource.close(); // Physical cleanup is Host-owned.
    value(kernel.release(custody)); // Release only after successful physical close.
    value(kernel.finishRetirement(generation));
    owner.forgetRecovery(record);
  }
}
```

`quiesce` closes new call and custody admission while existing calls can finish.
`retire` revokes existing call authority immediately, but held leases still count
until explicit `release`. `finishRetirement` records only completed kernel
bookkeeping; the Host calls it after separately proving physical cleanup.
Snapshots contain frozen, detached counts and phase facts. A token is valid only
in the kernel instance that issued it.

This candidate has no release or product adoption claim. The Host owns artifact
trust, authorization, readiness, routing, effects, cleanup, recovery and the
meaning of a public `released` outcome.
