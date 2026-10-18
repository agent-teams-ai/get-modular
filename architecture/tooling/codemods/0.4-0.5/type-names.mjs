import { transformTypes } from "./shared.mjs";

/** @param {import("../project.mjs").CodemodFile} file  @param {(message: string) => void} manual */
export default function transform(file, manual) {
  return transformTypes(file, manual);
}
