import { ConformanceError, invalid } from "../errors/errors.js";

/** `check` rejects with `conformance.handles.leaked` when handles opened after `guardHandles` are still active. */
export type HandleGuard = { readonly check: () => Promise<void> };

// Node reaches us structurally: this package imports no builtin, so it also loads where Node is absent.
type NodeGlobals = {
  readonly process?: { readonly getActiveResourcesInfo?: () => readonly string[] } | undefined;
  readonly setImmediate?: ((callback: () => void) => unknown) | undefined;
};

const counts = (types: readonly string[]): Map<string, number> => {
  const result = new Map<string, number>();
  for (const type of types) {
    result.set(type, (result.get(type) ?? 0) + 1);
  }
  return result;
};

/**
 * A before/after count of active handle types. It is a diagnostic for handles nobody owns, not proof that
 * anything was released.
 */
export function guardHandles(options?: { readonly allow?: readonly string[] | undefined }): HandleGuard {
  const allow = options?.allow ?? [];
  if (!Array.isArray(allow) || !allow.every(type => typeof type === "string")) {
    throw invalid("guardHandles() requires allow to be an array of handle type names");
  }
  const host = globalThis as NodeGlobals;
  const info = host.process?.getActiveResourcesInfo?.bind(host.process);
  const defer = host.setImmediate;
  if (info === undefined || defer === undefined) {
    throw new ConformanceError("conformance.handles.unsupported-runtime",
      "guardHandles() needs process.getActiveResourcesInfo() and setImmediate()");
  }
  const before = counts(info());
  const turn = (): Promise<void> => new Promise<void>(resolve => { defer(resolve); });
  return {
    check: async () => {
      // One turn gave false positives right after `await server.close()`; two did not.
      await turn();
      await turn();
      const leaked: Record<string, number> = {};
      for (const [type, count] of counts(info())) {
        const grown = count - (before.get(type) ?? 0);
        if (grown > 0 && !allow.includes(type)) {
          leaked[type] = grown;
        }
      }
      const types = Object.entries(leaked);
      if (types.length === 0) {
        return;
      }
      const total = types.reduce((sum, [, grown]) => sum + grown, 0);
      throw new ConformanceError("conformance.handles.leaked",
        `${String(total)} handle${total === 1 ? "" : "s"} opened and not released: ${
          types.map(([type, grown]) => `${type} ×${String(grown)}`).join(", ")}`,
        { details: { leaked } });
    },
  };
}
