import { transformExtras, transformImports } from "./shared.ts";

/** @param {import("../project.ts").CodemodFile} file  @param {(message: string) => void} manual */
export default function transform(file, manual) {
  const edits = transformImports(file);
  transformExtras(file, manual);
  return edits;
}
