import { transformTypes } from "./shared.mjs";

/** @param {import("ts-morph").SourceFile} file  @param {(message: string) => void} manual */
export default function transform(file, manual) {
  return transformTypes(file, manual);
}
