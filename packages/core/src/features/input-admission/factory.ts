import { admitObjectInput } from "./object-admission.js";
import { admitRawInput } from "./raw-admission.js";
import type { InputAdmissionDeps, InputAdmissionPort } from "./ports.js";

export function createInputAdmission({ scanner }: InputAdmissionDeps): InputAdmissionPort {
  return Object.freeze<InputAdmissionPort>({
    admitObjectInput,
    admitRawInput: (input, collector) => admitRawInput(input, collector, scanner),
  });
}
