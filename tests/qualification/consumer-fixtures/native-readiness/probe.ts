import { compileCompositionJson } from "@get-modular/core";

export type ProbeCase = {
  readonly name: string;
  readonly declarations: readonly string[];
  readonly profile:
    | { readonly kind: "text"; readonly text: string }
    | { readonly kind: "bytes"; readonly bytes: readonly number[] }
    | { readonly kind: "zeroes"; readonly size: number };
};

function profileBytes(value: ProbeCase["profile"], encoder: TextEncoder): Uint8Array {
  if (value.kind === "text") return encoder.encode(value.text);
  if (value.kind === "zeroes") return new Uint8Array(value.size);
  return new Uint8Array(value.bytes);
}

/** The same packed public API and raw inputs execute on both targets. */
export async function runCases(cases: readonly ProbeCase[]): Promise<void> {
  console.error("[core-aot] cases:start");
  const encoder = new TextEncoder();
  for (const item of cases) {
    console.error(`[core-aot] ${item.name}:encode`);
    const declarations = item.declarations.map((declaration) => encoder.encode(declaration));
    const profile = profileBytes(item.profile, encoder);
    console.error(`[core-aot] ${item.name}:invoke`);
    const result = await compileCompositionJson({ declarations, profile });
    console.error(`[core-aot] ${item.name}:serialize`);
    console.log(JSON.stringify({ name: item.name, result }));
    console.error(`[core-aot] ${item.name}:complete`);
  }
  console.error("[core-aot] cases:complete");
}
