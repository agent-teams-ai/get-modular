/** Presentation limits, independent from Core's diagnostic retention policy. */
export const maximumItems = 32;
export const maximumMembers = 8;
const maximumText = 16_384;
const shortened = "[Display shortened.]";

export function own(value: unknown, key: PropertyKey): unknown {
  if (typeof value !== "object" || value === null) {return undefined;}
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

export function arrayLength(value: unknown, maximum: number): number | undefined {
  if (!Array.isArray(value)) {return undefined;}
  const length = own(value, "length");
  return typeof length === "number" && Number.isSafeInteger(length) && length >= 0 && length <= maximum
    ? length : undefined;
}

export function count(value: unknown): string | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? String(value) : undefined;
}

/** Escape labels as data, including directional controls and lone surrogates. */
export function quoted(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 128) {return undefined;}
  let text = '"';
  for (const point of value) {
    const code = point.codePointAt(0) ?? 0;
    if (point === '"' || point === "\\") {text += `\\${point}`;}
    else if (code < 32 || code >= 0x7f && code <= 0x9f || code === 0x61c
      || code >= 0x200e && code <= 0x200f || code >= 0x2028 && code <= 0x202e
      || code >= 0x2066 && code <= 0x2069 || code === 0xfeff || code >= 0xd800 && code <= 0xdfff) {
      text += `\\u${code.toString(16).padStart(4, "0")}`;
    } else {text += point;}
  }
  return `${text}"`;
}

export function members(value: unknown, maximum: number): string | undefined {
  const length = arrayLength(value, maximum);
  if (length === undefined) {return undefined;}
  const visible: string[] = [];
  for (let index = 0; index < Math.min(length, maximumMembers); index++) {
    const member = quoted(own(value, String(index)));
    if (member === undefined) {return undefined;}
    visible.push(member);
  }
  return `[${visible.join(", ")}]${length > maximumMembers ? ` (${length - maximumMembers} members omitted)` : ""}`;
}

export type FailureText = {
  readonly add: (line: string) => void;
  readonly finish: () => string;
};

/** Retain complete lines only; reserve room for the fixed shortening notice. */
export function failureText(): FailureText {
  const lines: string[] = [];
  let length = 0;
  let full = false;
  return {
    add(line) {
      if (full) {return;}
      const next = length + line.length + (lines.length > 0 ? 1 : 0);
      if (next > maximumText - shortened.length - 1) {full = true; return;}
      lines.push(line);
      length = next;
    },
    finish: () => [...lines, ...full ? [shortened] : []].join("\n"),
  };
}
