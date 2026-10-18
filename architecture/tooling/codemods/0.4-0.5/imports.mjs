import { transformExtras, transformImports } from "./shared.mjs";

/** @param {import("../project.mjs").CodemodFile} file  @param {(message: string) => void} manual */
export default function transform(file, manual) {
  const edits = transformImports(file);
  transformExtras(file, manual);
  return edits;
}
