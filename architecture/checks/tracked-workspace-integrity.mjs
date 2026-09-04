import { assertTrackedWorkspaceMatchesHead } from "./tracked-file-custody.mjs";

await assertTrackedWorkspaceMatchesHead(process.cwd(), {
  expectedHeadCommit: process.env.EXPECTED_HEAD_SHA,
});
console.log("Tracked workspace integrity: passed");
