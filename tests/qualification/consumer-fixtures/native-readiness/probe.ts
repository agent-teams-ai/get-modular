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
  const encoder = new TextEncoder();
  for (const item of cases) {
    const result = await compileCompositionJson({
      declarations: item.declarations.map((declaration) => encoder.encode(declaration)),
      profile: profileBytes(item.profile, encoder),
    });
    console.log(JSON.stringify({ name: item.name, result }));
  }
}
