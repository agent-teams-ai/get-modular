import type { AnyContract } from "@get-modular/assembly";
import { CloseIncompleteError, createScope } from "@get-modular/resources";
import { ConformanceError, invalid } from "../errors/errors.js";
import type { CaseContext, ContractCase, ContractSubject, ContractSuite, ContractValue, TestFn } from "./types.js";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

/** Structural equality of JSON-like data, so a suite does not depend on how a wire generation spells a token. */
function sameData(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (!isRecord(left) || !isRecord(right) || Array.isArray(left) !== Array.isArray(right)) {
    return false;
  }
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length
    && keys.every(key => Object.hasOwn(right, key) && sameData(left[key], right[key]));
}

/** Freezes the contract descriptor and its cases; the owner of the contract publishes the result. */
export function contractSuite<const T extends AnyContract>(
  contract: T,
  cases: Readonly<Record<string, ContractCase<ContractValue<NoInfer<T>>>>>,
): ContractSuite<T> {
  if (!isRecord(contract) || typeof contract.provide !== "function" || typeof contract.id !== "string") {
    throw invalid("contractSuite() requires a contract descriptor");
  }
  if (!isRecord(cases) || Object.keys(cases).length === 0
    || !Object.values(cases).every(entry => typeof entry === "function")) {
    throw invalid("contractSuite() requires a non-empty record of case functions");
  }
  return Object.freeze({ contract, cases: Object.freeze({ ...cases }) });
}

/**
 * Registers one test per case with the caller's runner. Each case runs against a subject made in a fresh
 * scope, and that scope is always closed afterwards.
 */
export function runContractSuite<T extends AnyContract>(
  suite: ContractSuite<T>,
  subject: ContractSubject<T>,
  test: TestFn,
): void {
  if (!isRecord(suite) || !isRecord(suite.contract) || !isRecord(suite.cases)
    || !isRecord(subject) || typeof subject.name !== "string" || subject.name.length === 0
    || typeof subject.create !== "function" || !isRecord(subject.declaration)
    || !Array.isArray(subject.declaration.provides) || typeof test !== "function") {
    throw invalid("runContractSuite() requires a suite, a named subject with a declaration and create, and a test function");
  }
  const { contract } = suite;
  const expected = contract.provide();
  const provides: readonly unknown[] = subject.declaration.provides;
  const provided = provides
    .find(entry => isRecord(entry) && entry["capabilityId"] === expected.capabilityId);
  if (!provides.some(entry => sameData(entry, expected))) {
    const token = (entry: unknown): string => String(isRecord(entry) && isRecord(entry["compatibility"])
      ? entry["compatibility"]["token"] : undefined);
    throw new ConformanceError("conformance.suite.revision-mismatch", provided === undefined
      ? `${subject.name} does not provide ${contract.id}; the suite checks ${token(expected)}`
      : `${subject.name} provides ${contract.id} as ${token(provided)}; the suite checks ${token(expected)}`);
  }
  for (const [name, body] of Object.entries(suite.cases)) {
    test(`${contract.id} r${String(contract.revision)}: ${name} [${subject.name}]`, async () => {
      const scope = createScope({ name: subject.name });
      const context: CaseContext = Object.freeze({ signal: scope.resources.signal, resources: scope.resources });
      let failure: { readonly error: unknown } | undefined;
      try {
        await body(await subject.create(context), context);
      } catch (error) {
        failure = { error };
      }
      const report = await scope.control.close();
      if (failure !== undefined && !report.complete) {
        throw new ConformanceError("conformance.suite.case-failed",
          `${name} of ${contract.id} failed and its scope closed with ${String(report.debts.length)} debt(s)`,
          { cause: failure.error, details: { report } });
      }
      if (failure !== undefined) {
        throw failure.error;
      }
      if (!report.complete) {
        throw new CloseIncompleteError(report);
      }
    });
  }
}
