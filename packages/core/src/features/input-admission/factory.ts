import { admitObjectInput } from "./object-admission.js";
import type { InputAdmissionDeps, InputAdmissionPort } from "./ports.js";

export function createInputAdmission(_deps: InputAdmissionDeps): InputAdmissionPort {
  return Object.freeze({ admitObjectInput });
}
