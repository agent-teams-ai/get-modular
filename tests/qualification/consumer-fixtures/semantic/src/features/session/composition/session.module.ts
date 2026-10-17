import { implement } from "@get-modular/assembly";
import { runJob } from "../application/use-cases/run-job.js";
import type { SessionPort } from "../contracts/session.js";
import type { SessionCapabilities } from "./session.contracts.js";
import { sessionDeclaration } from "./session.declaration.js";

export const sessionModule = implement<SessionCapabilities>()(sessionDeclaration, async dependencies => {
  const port: SessionPort = { run: request => runJob(dependencies, request) };
  return { instance: port, capabilities: { "fixture/session/session": port } };
});
