// Independent recipe construction for ADR-0020. No Core imports or output-derived expectations.
const declaration = id => ({ kind: "get-modular.module-declaration", schemaVersion: 1,
  moduleId: `x/${id}`, implementationId: `x/${id}/i`, owner: { authority: "x", path: [id] }, provides: [], slots: [] });
const profile = () => ({ kind: "get-modular.composition-profile", schemaVersion: 1,
  profileId: "x/main", roots: ["x/app"], selections: [{ moduleId: "x/app", implementationId: "x/app/i" }], bindings: [] });
const chain = count => { let value = null; for (let i = 0; i < count; i += 1) value = [value]; return value; };
const hugeString = () => "x".repeat(8_388_609);
const hugeArray = () => new Array(2_097_153);

export function coverageInput(id, variant) {
  const input = { declarations: [declaration("app")], profile: profile() };
  switch (id) {
    case "key-order": {
      const string = hugeString(), values = hugeArray();
      input.profile = variant === "string-first"
        ? { ...input.profile, aa: string, bb: values } : { ...input.profile, bb: values, aa: string };
      break;
    }
    case "depth-string-order": {
      const fields = { ...input.declarations[0], owner: chain(32), moduleId: hugeString() };
      input.declarations[0] = variant === "depth-first" ? { owner: fields.owner, ...fields } : { moduleId: fields.moduleId, ...fields };
      break;
    }
    case "binding-order": {
      // Both arrays obey the per-row length; all IDs obey ASCII grammar/byte bounds.
      // Short providers alone supply 2048 * 1024 > J minus the profile overhead;
      // long providers alone supply 64 * 1024 * 128 == S plus keys/IDs overhead.
      const short = Array.from({ length: 2048 }, (_, i) => ({ consumerImplementationId: `x/short-${i}`, slotId: "s",
        providerImplementationIds: new Array(1024).fill("x/p") }));
      const long = Array.from({ length: 64 }, (_, i) => ({ consumerImplementationId: `x/long-${i}`, slotId: "s",
        providerImplementationIds: new Array(1024).fill(`x/${"p".repeat(126)}`) }));
      input.profile.bindings = variant === "short-first" ? [...short, ...long] : [...long, ...short];
      break;
    }
    case "oversized-array-hidden-tail": {
      const values = hugeArray();
      values[variant.endsWith("first") ? 0 : values.length - 1] = variant.startsWith("string") ? hugeString() : chain(33);
      input.profile.unknown = values;
      break;
    }
    case "multiple-depth-documents": input.declarations.unshift(chain(33), chain(33)); break;
    case "prior-depth-then-batch":
      input.declarations.unshift(chain(33));
      input.profile.unknown = variant === "string" ? hugeString() : hugeArray();
      break;
    case "shallow-then-batch":
      input.declarations.push({ provides: new Array(65537), slots: new Array(65537) });
      input.profile.unknown = variant === "string" ? hugeString() : hugeArray();
      break;
    case "in-envelope-malformed":
      input.declarations[0] = variant === "unknown-first"
        ? { unknown: true, ...input.declarations[0] } : { ...input.declarations[0], unknown: true };
      break;
    case "cycle-beside-shared-dag": {
      const shared = { value: "data" }; const cycle = {}; cycle.self = cycle;
      input.declarations.unshift(variant === "cycle-first"
        ? { cycle, a: shared, b: shared } : { a: shared, b: shared, cycle });
      break;
    }
    default: throw new Error(`Missing resource coverage recipe ${id}`);
  }
  return input;
}
