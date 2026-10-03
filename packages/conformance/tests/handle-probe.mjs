import { createServer } from "node:net";
import { guardHandles } from "../dist/index.js";

// A subprocess, so the handles of the test runner never reach the guard.
const [scenario, runs] = process.argv.slice(2);
const listening = server => new Promise(resolve => { server.listen(0, resolve); });
const closed = server => new Promise(resolve => { server.close(resolve); });
const outcome = async guard => guard.check().then(() => undefined, error => error);

if (scenario === "clean") {
  let leaked = 0;
  for (let run = 0; run < Number(runs); run += 1) {
    const guard = guardHandles();
    const server = createServer();
    await listening(server);
    await closed(server);
    if (await outcome(guard) !== undefined) leaked += 1;
  }
  console.log(JSON.stringify({ runs: Number(runs), leaked }));
} else {
  const guard = guardHandles(scenario === "allow" ? { allow: ["TCPServerWrap"] } : undefined);
  const server = createServer();
  await listening(server);
  const error = await outcome(guard);
  console.log(JSON.stringify(scenario === "allow" ? { code: error?.code ?? null } : { code: error?.code, leaked: error?.details.leaked }));
  server.close();
}
