import type { EffectsPort } from "../ports/effects.js";

interface Dependencies {
  readonly effects: EffectsPort;
  readonly tag: string;
}

interface Request {
  readonly scope: string;
  readonly id: string;
  readonly payload: string;
  readonly signal: AbortSignal;
}

export async function runJob(dependencies: Dependencies, request: Request): Promise<string> {
  if (request.signal.aborted) {
    throw Object.assign(new Error("Operation cancelled before its effect."), { code: "fixture.operation.cancelled" });
  }
  if (request.payload === "!fail") {
    throw Object.assign(new Error("Requested runner failure."), { code: "fixture.runner.failed" });
  }
  const value = `${request.scope}:${dependencies.tag}:${request.payload}`;
  await dependencies.effects.record({ scope: request.scope, id: request.id, value, signal: request.signal });
  return value;
}
