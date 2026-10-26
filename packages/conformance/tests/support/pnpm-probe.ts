import { pinnedPnpmCli } from "./pinned-pnpm.ts";

const [root, ...extra] = process.argv.slice(2);
if (!root || extra.length !== 0) throw new Error("packed.pnpm.probe-arguments");
console.log(await pinnedPnpmCli(root));
