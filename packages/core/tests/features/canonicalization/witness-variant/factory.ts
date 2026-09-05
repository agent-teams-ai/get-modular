import type { CanonicalBytesPort, JsonValue } from "../../../../src/features/canonicalization/ports.js";
import { createOwnedJcs } from "../../../../src/features/canonicalization/owned-jcs/factory.js";

// Qualification-only counterfactual encoding, deliberately not an RFC8785 claim.
// Plan output still owns the envelope and hashing. Production never imports this.
export function createWitnessVariant(_deps: Readonly<Record<string, never>>): CanonicalBytesPort {
  const owned = createOwnedJcs({});
  const prefix = new TextEncoder().encode("get-modular/witness-variant/v1\0");
  return Object.freeze({
    canonicalize(value: JsonValue): Uint8Array {
      const bytes = owned.canonicalize(value);
      const text = new TextDecoder().decode(bytes);
      // These two accepted private comparator operands must reverse. A uniform
      // prefix alone would prove digest use, but could not prove diagnostic use.
      const decisive = text === '{"actual":10,"limit":1,"limitName":"aggregateRawBytes"}' ? 1
        : text === '{"actual":2,"limit":1,"limitName":"aggregateRawBytes"}' ? 0 : undefined;
      const lead = decisive === undefined ? prefix : Uint8Array.of(decisive);
      const result = new Uint8Array(lead.length + bytes.length);
      result.set(lead);
      result.set(bytes, lead.length);
      return result;
    },
  });
}
