import { transformExtras, transformImports } from "./shared.ts";

/** @param {import("../project.ts").CodemodFile} file  @param {(message: string) => void} manual */
export default async function transform(file, manual) {
  const edits = await transformImports(file);
  await transformExtras(file, manual);
  return edits;
}
