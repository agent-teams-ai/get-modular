import type { Cardinality, Contract, DeclarationSpec, Declared, ProvidedEntry, SlotEntry } from "./types.js";
import { AssemblyBindingError } from "./bind.js";

// The only place that spells the wire generation (ADR-0032). The next generation changes
// these bodies, not the declarations that call them.
const KIND = "get-modular.module-declaration" as const;
const SCHEMA_VERSION = 1 as const;
// Revisions stay within the signed 32-bit range, so every revision written now remains
// representable when the next wire generation carries revisions as numbers.
const MAXIMUM_REVISION = 2147483647;

function refuse(message: string): never {
  throw new AssemblyBindingError("assembly.bind.invalid-declaration", new TypeError(message));
}

/** Contract owner: `export const Db = defineContract<DbPort>()({ id: "acme/db", revision: 1 })`. */
export function defineContract<V>(): <const Id extends string, const Rev extends number>(
  spec: { readonly id: Id; readonly revision: Rev },
) => Contract<Id, V, Rev> {
  return <const Id extends string, const Rev extends number>(spec: { readonly id: Id; readonly revision: Rev }) => {
    const candidate: unknown = spec;
    if (typeof candidate !== "object" || candidate === null) {
      refuse("defineContract() requires a contract spec");
    }
    const { id, revision } = spec;
    if (typeof id !== "string" || id.length === 0) {
      refuse("A contract needs a capability id");
    }
    if (!Number.isInteger(revision) || revision < 1 || revision > MAXIMUM_REVISION) {
      refuse("A contract revision is an integer from 1 to 2147483647");
    }
    // Current wire generation: one exact token per revision. Core validates the identity grammar.
    const token = `${id}/r${String(revision)}` as `${Id}/r${Rev}`;
    // Every entry is a fresh frozen record, so declarations never share one record.
    const compatibility = () => Object.freeze({ family: "exact", familyVersion: 1, token } as const);
    return Object.freeze({
      id,
      revision,
      provide: (): ProvidedEntry<Id, Rev> =>
        Object.freeze({ capabilityId: id, compatibility: compatibility() }) as ProvidedEntry<Id, Rev>,
      slot: <const S extends string, const K extends Cardinality>(slotId: S, cardinality: K): SlotEntry<Id, Rev, S, K> =>
        Object.freeze({ slotId, capabilityId: id, compatibility: compatibility(), cardinality }) as SlotEntry<Id, Rev, S, K>,
    });
  };
}

/** Module author: identities, owner and descriptor entries; never `kind`, `schemaVersion` or `compatibility`. */
export function declareModule<const T extends DeclarationSpec>(
  // `declareModule` supplies the wire discriminators; a spec never carries them.
  spec: T & { readonly kind?: never; readonly schemaVersion?: never },
): Declared<T> {
  const candidate: unknown = spec;
  if (typeof candidate !== "object" || candidate === null) {
    refuse("declareModule() requires a declaration spec");
  }
  if (Object.hasOwn(candidate, "kind") || Object.hasOwn(candidate, "schemaVersion")) {
    refuse("declareModule() supplies kind and schemaVersion");
  }
  return Object.freeze({ ...spec, kind: KIND, schemaVersion: SCHEMA_VERSION });
}
