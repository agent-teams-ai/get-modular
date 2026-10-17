import assert from "node:assert/strict";
import test from "node:test";
import { assemblyFor, declareModule, defineContract, group, type FactoryDependencies } from "@get-modular/assembly";
import { checkNamespaces, checkWiring, isolate, runContractSuite, smoke, type WiringOracle } from "@get-modular/conformance";
import type { CloseReport } from "@get-modular/resources";
import { composeSemantic, type SemanticCapabilities } from "../../src/composition/semantic.root.js";
import { runnerADeclaration } from "../../src/features/runner/composition/runner-a.declaration.js";
import { runnerAModule } from "../../src/features/runner/composition/runner-a.module.js";
import type { RunnerCapabilities } from "../../src/features/runner/composition/runner.contracts.js";
import { identityDeclaration } from "../../src/features/session/composition/identity.declaration.js";
import { journalDeclaration } from "../../src/features/session/composition/journal.declaration.js";
import type { SessionCapabilities } from "../../src/features/session/composition/session.contracts.js";
import { sessionDeclaration } from "../../src/features/session/composition/session.declaration.js";
import { sessionGroup } from "../../src/features/session/composition/session.group.js";
import { identityInput, journalInput } from "../../src/features/session/composition/session.inputs.js";
import { sessionModule } from "../../src/features/session/composition/session.module.js";
import type { RunnerPort } from "../../src/features/session/contracts/session.js";
import { runnerBDeclaration } from "../features/runner/runner-b.declaration.js";
import { runnerBModule } from "../features/runner/runner-b.module.js";
import { sessionWiring } from "../features/session/session.wiring.js";
import { createFake, fakeDeclaration, ownerSuite } from "../features/session/testing.js";
import { createAttempt, makeInputs } from "../support/attempt-owner.js";
import { createFileJournal, type FileJournal } from "../support/journal.js";

const api = assemblyFor<SemanticCapabilities>();
const preparation = await composeSemantic(api);
assert.equal(preparation.status, "prepared");
if (preparation.status !== "prepared") throw new Error("fixture.preparation.failed");
const prepared = preparation.prepared;
const composition = preparation.composition;
const complete = { complete: true, settled: true, debts: [] };
const declarations = [runnerADeclaration, sessionDeclaration, identityDeclaration, journalDeclaration];
const rootWiring: WiringOracle = { providers: {}, roots: ["fixture/session/session/default"] };

test("C-01: the prepared A consumer preserves two independent operations and closes its borrowed journal last", async () => {
  checkWiring(composition, [sessionWiring, rootWiring], { declarations });
  checkNamespaces({ namespace: "fixture", declarations: [...declarations, runnerBDeclaration, fakeDeclaration] });
  const journal = await createFileJournal();
  await using attempt = createAttempt(prepared, "left", journal);
  const outcome = await attempt.startup;
  assert.equal(outcome.status, "succeeded");
  if (outcome.status !== "succeeded") throw new Error("fixture.construction.failed");

  assert.equal(await outcome.roots.session.run({ id: "hello", payload: " hello ", signal: attempt.signal }), "left:A:hello");
  assert.equal(await outcome.roots.session.run({ id: "world", payload: " world ", signal: attempt.signal }), "left:A:world");
  assert.deepEqual(await attempt.close(), complete);
  assert.deepEqual(await journal.read(), [
    { kind: "resource-acquired", scope: "runner", id: "A", value: "A" },
    { kind: "effect", scope: "left", id: "hello", value: "left:A:hello" },
    { kind: "terminal", scope: "left", id: "hello", value: "left:A:hello" },
    { kind: "effect", scope: "left", id: "world", value: "left:A:world" },
    { kind: "terminal", scope: "left", id: "world", value: "left:A:world" },
    { kind: "resource-released", scope: "runner", id: "A", value: "A" },
  ]);
  await assert.rejects(journal.probe(), { code: "EBADF" });
});

test("C-01: the actual session module forwards the runner's opaque return value", async () => {
  await using journal = await createFileJournal();
  const requests: unknown[] = [];
  const dependencies: FactoryDependencies<SessionCapabilities, typeof sessionDeclaration> = {
    identity: { read: () => "left" },
    journal: journal.port,
    runner: {
      run: async request => {
        requests.push({ scope: request.scope, id: request.id, payload: request.payload });
        return "runner-result-7";
      },
    },
  };
  await using subject = await isolate(sessionModule, { dependencies });
  const signal = new AbortController().signal;
  assert.equal(await subject.capabilities["fixture/session/session"].run({ id: "opaque", payload: " hello ", signal }), "runner-result-7");
  assert.deepEqual(requests, [{ scope: "left", id: "opaque", payload: "hello" }]);
  assert.deepEqual(await journal.read(), [
    { kind: "terminal", scope: "left", id: "opaque", value: "runner-result-7" },
  ]);
});

test("C-01/C-02: one owner contract suite qualifies the typed fake and isolated A/B, including physical release", async () => {
  for (const tag of ["fake", "A", "B"] as const) {
    let journal: FileJournal | undefined;
    let probe: (() => Promise<void>) | undefined;
    let closeSubject: (() => Promise<CloseReport>) | undefined;
    const suite = ownerSuite(tag, async () => {
      assert.ok(journal);
      return journal.read();
    });
    const cases: { readonly name: string; readonly body: () => Promise<void> }[] = [];
    runContractSuite(suite, {
      name: tag,
      declaration: tag === "fake" ? fakeDeclaration : tag === "A" ? runnerADeclaration : runnerBDeclaration,
      create: async context => {
        // The suite's automatic close may retain child debt; it must not own this borrowed journal.
        journal = await createFileJournal();
        probe = undefined;
        closeSubject = undefined;
        if (tag === "fake") return createFake(journal.port);
        const dependencies: FactoryDependencies<RunnerCapabilities, typeof runnerADeclaration> = { journal: journal.port };
        const subjectScope = context.resources.child({ name: "runner-subject" });
        // Retain cleanup authority even if isolate rejects during construction.
        closeSubject = () => subjectScope.control.close();
        const subject = await isolate(tag === "A" ? runnerAModule : runnerBModule, {
          dependencies, within: subjectScope.resources, signal: context.signal,
        });
        closeSubject = subject.close;
        probe = subject.instance.probe;
        await probe();
        return subject.capabilities["fixture/session/runner"];
      },
    }, (name, body) => cases.push({ name, body }));
    assert.equal(cases.length, 3);
    for (const scenario of cases) {
      let report: CloseReport | undefined;
      let failure: unknown;
      try {
        await scenario.body();
        assert.ok(journal, scenario.name);
        report = closeSubject ? await closeSubject() : complete;
        assert.deepEqual(report, complete);
        const releases = (await journal.read()).filter(record => record.kind === "resource-released");
        assert.deepEqual(releases, tag === "fake" ? [] : [
          { kind: "resource-released", scope: "runner", id: tag, value: tag },
        ]);
        if (probe) await assert.rejects(probe(), { code: "EBADF" });
        await journal.probe();
        await journal.close();
        await assert.rejects(journal.probe(), { code: "EBADF" });
      } catch (cause) {
        failure = cause;
        throw cause;
      } finally {
        if (journal) {
          report ??= closeSubject ? await closeSubject() : complete;
          if (!report.complete) {
            throw Object.assign(new Error("Subject cleanup retained debt and its open journal.", { cause: failure }), {
              code: "fixture.suite.close-incomplete", report, retained: { journal, close: closeSubject },
            });
          }
          await journal[Symbol.asyncDispose]();
        }
        journal = undefined;
        closeSubject = undefined;
      }
    }
  }
});

test("C-02: a compatible B provider is rejected by the independent A wiring oracle", async () => {
  const wrong = await api.prepare({
    profileId: "fixture/semantic/wrong-provider-mutation",
    modules: [group("runner", [runnerBModule]), sessionGroup],
    roots: { session: sessionModule },
    inputs: { identity: identityInput, journal: journalInput },
  });
  assert.equal(wrong.status, "prepared");
  if (wrong.status !== "prepared") throw new Error("fixture.mutation.invalid");
  assert.throws(() => checkWiring(wrong.composition, [sessionWiring, rootWiring], {
    declarations: [runnerBDeclaration, sessionDeclaration, identityDeclaration, journalDeclaration],
  }), (error: unknown) => {
    assert.ok(typeof error === "object" && error !== null && "code" in error && "details" in error);
    assert.equal(error.code, "conformance.wiring.mismatch");
    const details = error.details;
    assert.ok(typeof details === "object" && details !== null && "differences" in details);
    assert.ok(Array.isArray(details.differences));
    assert.ok(details.differences.some((difference: unknown) => {
      if (typeof difference !== "object" || difference === null ||
        !("rule" in difference) || !("subject" in difference) ||
        !("expected" in difference) || !("actual" in difference)) return false;
      if (difference.rule !== "provided-capability" || difference.subject !== "fixture/session/runner") return false;
      assert.deepEqual(difference.expected, ["fixture/runner/runner-a/default"]);
      assert.deepEqual(difference.actual, ["fixture/runner/runner-b/default"]);
      return true;
    }));
    return true;
  });
});

test("C-03: two runs share one preparation while owning separate identities, journals and resources", async () => {
  const leftJournal = await createFileJournal();
  await using leftAttempt = createAttempt(prepared, "left", leftJournal);
  const rightJournal = await createFileJournal();
  await using rightAttempt = createAttempt(prepared, "right", rightJournal);
  const [left, right] = await Promise.all([leftAttempt.startup, rightAttempt.startup]);
  assert.equal(left.status, "succeeded");
  assert.equal(right.status, "succeeded");
  if (left.status !== "succeeded" || right.status !== "succeeded") throw new Error("fixture.construction.failed");
  const results = await Promise.all([
    left.roots.session.run({ id: "left-1", payload: " hello ", signal: leftAttempt.signal }),
    right.roots.session.run({ id: "right-1", payload: " hello ", signal: rightAttempt.signal }),
  ]);
  assert.deepEqual(results, ["left:A:hello", "right:A:hello"]);
  assert.deepEqual(await leftAttempt.close(), complete);
  assert.deepEqual((await rightJournal.read()).filter(record => record.kind === "resource-released"), []);
  assert.equal(await right.roots.session.run({ id: "right-2", payload: " world ", signal: rightAttempt.signal }), "right:A:world");
  assert.deepEqual(await rightAttempt.close(), complete);
  assert.deepEqual((await leftJournal.read()).filter(record => record.kind === "effect"), [
    { kind: "effect", scope: "left", id: "left-1", value: "left:A:hello" },
  ]);
  assert.deepEqual((await rightJournal.read()).filter(record => record.kind === "effect"), [
    { kind: "effect", scope: "right", id: "right-1", value: "right:A:hello" },
    { kind: "effect", scope: "right", id: "right-2", value: "right:A:world" },
  ]);
  for (const journal of [leftJournal, rightJournal]) {
    assert.equal((await journal.read()).filter(record => record.kind === "resource-released").length, 1);
    await assert.rejects(journal.probe(), { code: "EBADF" });
  }
});

test("C-04a: descriptor revision mismatch is synchronous and precedes registration and creation", () => {
  const revision2 = defineContract<RunnerPort>()({ id: "fixture/session/runner", revision: 2 });
  const revision2Declaration = declareModule({
    moduleId: "fixture/runner/revision-2",
    implementationId: "fixture/runner/revision-2/default",
    owner: { authority: "fixture", path: ["runner"] },
    provides: [revision2.provide()],
    slots: [],
  });
  let registrations = 0;
  let creates = 0;
  assert.throws(() => runContractSuite(ownerSuite("fake", async () => []), {
    name: "revision-2",
    declaration: revision2Declaration,
    create: () => {
      creates += 1;
      return createFake({ append: async () => {} });
    },
  }, () => { registrations += 1; }), { code: "conformance.suite.revision-mismatch" });
  assert.equal(registrations, 0);
  assert.equal(creates, 0);
});

test("the complete A smoke closes all five attempts, including failure and abort after each factory", async () => {
  await using journal = await createFileJournal();
  const steps = await smoke({ api, compose: composeSemantic, inputs: makeInputs("smoke", journal) });
  assert.deepEqual(steps.map(step => ({ inject: step.inject, at: step.at, outcome: step.outcome })), [
    { inject: "none", at: undefined, outcome: "succeeded" },
    { inject: "fail", at: "fixture/runner/runner-a/default", outcome: "failed" },
    { inject: "abort", at: "fixture/runner/runner-a/default", outcome: "cancelled" },
    { inject: "fail", at: "fixture/session/session/default", outcome: "failed" },
    { inject: "abort", at: "fixture/session/session/default", outcome: "cancelled" },
  ]);
  for (const step of steps) {
    assert.deepEqual(step.report, complete);
    assert.equal(step.problem, undefined);
  }
  const records = await journal.read();
  assert.equal(records.filter(record => record.kind === "resource-acquired").length, 5);
  assert.equal(records.filter(record => record.kind === "resource-released").length, 5);
  await journal.probe();
});
