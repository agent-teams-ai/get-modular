import { open } from "node:fs/promises";
import { CANCELLED, errorCode, failure, object } from "./schema.js";

const path = process.argv[2];
const scope = process.argv[3];
const id = process.argv[4];
const payload = process.argv[5];
if (path === undefined || scope === undefined || id === undefined || payload === undefined || process.send === undefined) {
  throw failure("fixture.effect.arguments");
}
const file = await open(path, "wx+");
let chosen = false;
function send(value: object): Promise<void> {
  return new Promise((resolve, reject) => {
    if (process.send === undefined) { reject(failure("fixture.effect.disconnected")); return; }
    process.send(value, cause => cause ? reject(cause) : resolve());
  });
}
process.on("message", (message: unknown) => {
  if (!object(message) || (message.type !== "complete" && message.type !== "stop") || chosen) return;
  chosen = true;
  const success = message.type === "complete";
  void (async () => {
    const value = success ? `${scope}:A:${payload}` : CANCELLED;
    if (success) {
      await file.appendFile(`${JSON.stringify({ scope, id, value })}\n`, "utf8");
      await file.sync();
    }
    await file.close();
    await send({ type: "result", value });
    process.disconnect();
  })().catch(async cause => {
    await file.close().catch(() => {});
    await send({ type: "fatal", code: errorCode(cause) }).catch(() => {});
    if (process.connected) process.disconnect();
    process.exitCode = 1;
  });
});
// Handshake follows actual acquisition. A send callback is never counted as physical spawn or exit.
await send({ type: "held", pid: process.pid });
// One producer-side fault tests decoding before a worker has necessarily installed its result waiter.
// The real child remains held with its file open until the supervisor's cooperative stop arrives.
if (process.argv[6] === "invalid-result") await send({ type: "result", value: "recovery:A:world" });
