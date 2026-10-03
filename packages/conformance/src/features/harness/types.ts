import type { CreatedEntry, FactoryContext } from "@get-modular/assembly";
import type { ModuleDeclaration } from "@get-modular/core";
import type { CloseReport } from "@get-modular/resources";

/** One module built exactly as a production run builds it; dispose it, or close it and read the report. */
export type Isolated<I, P> = AsyncDisposable & {
  readonly instance: I;
  readonly capabilities: P;
  /** Never rejects; `[Symbol.asyncDispose]` throws `resources.close.incomplete` on debt. */
  readonly close: () => Promise<CloseReport>;
};

export type SmokeInjection = "fail" | "abort";

export type SmokeStep = {
  readonly inject: "none" | SmokeInjection;
  /** The `implementationId` the injection targets; absent for the run without injection. */
  readonly at?: string | undefined;
  readonly outcome: "succeeded" | "failed" | "cancelled";
  readonly report: CloseReport;
  /** Set when the step violated an expectation. */
  readonly problem?: string | undefined;
};

// Assembly derives its handle and outcome types from the capability map of one caller. The harness
// builds declarations at run time, so it talks to Assembly through these map-free views of the same
// shapes; the public signatures keep the caller's types.
export type LooseFactory = (dependencies: unknown, context: FactoryContext) => Promise<unknown>;
export type LooseOutcome =
  | { readonly status: "succeeded"; readonly roots: Readonly<Record<string, unknown>>; readonly created: readonly CreatedEntry[] }
  | { readonly status: "cancelled"; readonly reason: unknown; readonly created: readonly CreatedEntry[] }
  | {
    readonly status: "failed";
    readonly phase: string;
    readonly code: string;
    readonly implementationId: string | undefined;
    readonly cause: unknown;
    readonly created: readonly CreatedEntry[];
    readonly returned: unknown;
    readonly cancellation: unknown;
  };
export type LooseRunOptions = {
  readonly signal?: AbortSignal | undefined;
  readonly scope?: unknown;
  readonly inputs?: unknown;
};
export type LoosePrepared = { readonly run: (options?: LooseRunOptions) => Promise<LooseOutcome> };
export type LoosePreparation =
  | { readonly status: "prepared"; readonly prepared: LoosePrepared }
  | { readonly status: "failed"; readonly error: { readonly code: string; readonly cause: unknown }; readonly diagnostics: readonly unknown[] };
export type LooseAssembly = {
  readonly bindFactory: (declaration: ModuleDeclaration, factory: LooseFactory) => unknown;
  readonly bindInput: (declaration: ModuleDeclaration) => unknown;
  readonly prepare: (input: {
    readonly composition: unknown;
    readonly factories: readonly unknown[];
    readonly roots: Readonly<Record<string, unknown>>;
    readonly inputs?: Readonly<Record<string, unknown>> | undefined;
  }) => Promise<LoosePreparation>;
};
