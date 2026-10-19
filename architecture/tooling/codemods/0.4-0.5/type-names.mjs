import { transformTypes } from "./shared.ts";

/** @param {import("../project.ts").CodemodFile} file  @param {(message: string) => void} manual */
export default function transform(file, manual) {
  return transformTypes(file, manual);
}
