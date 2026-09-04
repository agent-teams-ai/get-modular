import { assertTrackedWorkspaceMatchesHead } from "./tracked-file-custody.mjs";

await assertTrackedWorkspaceMatchesHead(process.cwd());
console.log("Tracked workspace integrity: passed");
