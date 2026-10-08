import type { CloseReport } from "./types.js";

/** Acquisition after a close was requested. */
export class ScopeClosedError extends Error {
  readonly code = "resources.scope.closed" as const;
  readonly path: readonly string[];
  constructor(path: readonly string[]) {
    super(`scope ${path.join("/")} is closing`);
    this.name = "ScopeClosedError";
    this.path = path;
  }
}

/** Thrown by `await using` / Symbol.asyncDispose when the report is not complete. */
export class CloseIncompleteError extends AggregateError {
  readonly code = "resources.close.incomplete" as const;
  readonly report: CloseReport;
  constructor(report: CloseReport) {
    const causes = report.debts.flatMap(debt => (debt.state === "failed" ? [debt.cause] : []));
    super(causes, `scope close incomplete: ${String(report.debts.length)} debt(s)`);
    this.name = "CloseIncompleteError";
    this.report = report;
  }
}

/** A programming error in a call; thrown synchronously before any state change. */
export class InvalidArgumentError extends TypeError {
  readonly code: "resources.argument.invalid" | "resources.scoped.invalid-run-scope";
  constructor(code: "resources.argument.invalid" | "resources.scoped.invalid-run-scope", message: string) {
    super(message);
    this.name = "InvalidArgumentError";
    this.code = code;
  }
}
