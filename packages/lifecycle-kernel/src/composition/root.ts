import { createLifecycleKernel as createFeatureKernel } from "../features/lifecycle/kernel.js";
import type { LifecycleKernel } from "../features/lifecycle/types.js";

/** Public assembly seam for the package's one owned lifecycle feature. */
export function createLifecycleKernel(): LifecycleKernel {
  return createFeatureKernel();
}
