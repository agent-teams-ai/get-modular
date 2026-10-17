import { input } from "@get-modular/assembly";
import { identityDeclaration } from "./identity.declaration.js";
import { journalDeclaration } from "./journal.declaration.js";
import type { SessionCapabilities } from "./session.contracts.js";

export const identityInput = input<SessionCapabilities>()(identityDeclaration);
export const journalInput = input<SessionCapabilities>()(journalDeclaration);
