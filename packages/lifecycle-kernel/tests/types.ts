import {
  createLifecycleKernel,
  type CallLease,
  type CustodyLease,
  type Generation,
  type Lease,
  type Result,
} from "../dist/index.js";

const kernel = createLifecycleKernel();
const generation: Generation = kernel.stage();
const callResult: Result<CallLease> = kernel.beginCall(generation);
const custodyResult: Result<CustodyLease> = kernel.retainCustody(generation);
if (callResult.ok && custodyResult.ok) {
  const call: CallLease = callResult.value;
  const custody: CustodyLease = custodyResult.value;
  const either: Lease = call;
  kernel.checkCall(call);
  kernel.release(either);
  kernel.release(custody);
  // @ts-expect-error custody never grants executable call authority
  kernel.checkCall(custody);
  // @ts-expect-error generation is not a lease
  kernel.release(generation);
  // @ts-expect-error call is not a generation
  kernel.activate(call);
}
// @ts-expect-error a copied structural object cannot carry the private brand
const forgedGeneration: Generation = {};
void forgedGeneration;
