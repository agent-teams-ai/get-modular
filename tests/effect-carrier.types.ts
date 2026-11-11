import type { isolate } from "@get-modular/conformance";

/** Test-only signature bridge: the native package has no Conformance dependency. */
export type PromiseIsolate = typeof isolate;
