import { transformIsolate } from "./shared.mjs";

/** @param {import("../project.mjs").CodemodFile} file  @param {(message: string) => void} manual */
export default function transform(file, manual) {
  return transformIsolate(file, manual);
}
