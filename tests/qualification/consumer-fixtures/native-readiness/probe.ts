import { compileCompositionJson } from "@get-modular/core";

export type ProbeCase = {
  readonly name: string;
  readonly declarations: readonly string[];
  readonly profile: string | readonly number[] | { readonly zeroBytes: number };
};

function profileBytes(value: ProbeCase["profile"], encoder: TextEncoder): Uint8Array {
  if (typeof value === "string") return encoder.encode(value);
  if ("zeroBytes" in value) return new Uint8Array(value.zeroBytes);
  return new Uint8Array(value);
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
