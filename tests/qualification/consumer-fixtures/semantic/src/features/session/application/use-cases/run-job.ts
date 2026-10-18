import type { IdentityPort } from "../ports/identity.js";
import type { JournalPort } from "../ports/journal.js";
import type { RunnerPort } from "../ports/runner.js";

interface Dependencies {
  readonly identity: IdentityPort;
  readonly journal: JournalPort;
  readonly runner: RunnerPort;
}

interface Request {
  readonly id: string;
  readonly payload: string;
  readonly signal: AbortSignal;
}

export async function runJob(dependencies: Dependencies, request: Request): Promise<string> {
  const scope = dependencies.identity.read();
  let value: string;
  try {
    value = await dependencies.runner.run({ ...request, scope, payload: request.payload.trim() });
  } catch (cause) {
    const code = typeof cause === "object" && cause !== null && "code" in cause &&
      typeof cause.code === "string" ? cause.code : "fixture.operation.failed";
    try {
      await dependencies.journal.append({ kind: "terminal", scope, id: request.id, value: code });
    } catch (journalCause) {
      // Preserve both failures without mutating the runner's possibly frozen thrown value.
      throw Object.assign(new AggregateError([cause, journalCause], "Runner and terminal recording both failed.", { cause }), {
        code: "fixture.terminal.failed",
      });
    }
    throw cause;
  }
  await dependencies.journal.append({ kind: "terminal", scope, id: request.id, value });
  return value;
}
