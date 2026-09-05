import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  checkImplementationClarifications,
  projectRawNumber,
} from "../architecture/checks/implementation-clarifications.mjs";

const LEDGER = "architecture/authority/implementation-clarifications-ledger.json";
const ADR = "docs/decisions/0018-close-implementation-readiness-rules.md";
const DIRECTORY = "architecture/qualification/implementation-clarifications";
const CONTRACT = `${DIRECTORY}/contract.json`;
const CASES = `${DIRECTORY}/cases.json`;
const PATHS = [CONTRACT, CASES];
const root = new URL("../", import.meta.url);
const load = path => readFile(new URL(path, root));
const digest = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

async function acceptedInputs() {
  const paths = [
    LEDGER, ADR, CONTRACT, CASES,
    "architecture/contracts/v1/composition.schema.json",
    "architecture/contracts/v1/diagnostic-catalog.json",
    "architecture/qualification/v1/diagnostic-contract.json",
  ];
  return new Map(await Promise.all(paths.map(async path => [path, await load(path)])));
}

async function run(files, listedPaths = PATHS) {
  return checkImplementationClarifications({
    readBytes: async path => {
      const bytes = files.get(path);
      if (bytes === undefined) throw new Error(`unexpected read ${path}`);
      return bytes;
    },
    listedPaths,
  });
}

async function semanticMutant(mutateContract, mutateCases) {
  const files = await acceptedInputs();
  const contract = JSON.parse(files.get(CONTRACT));
  const cases = JSON.parse(files.get(CASES));
  mutateContract?.(contract);
  mutateCases?.(cases);
  files.set(CONTRACT, Buffer.from(`${JSON.stringify(contract, null, 2)}\n`));
  files.set(CASES, Buffer.from(`${JSON.stringify(cases, null, 2)}\n`));
  const ledger = JSON.parse(files.get(LEDGER));
  for (const artifact of ledger.artifacts) artifact.immutableDigest = digest(files.get(artifact.path));
  const ledgerBytes = Buffer.from(`${JSON.stringify(ledger, null, 2)}\n`);
  files.set(LEDGER, ledgerBytes);
  const decision = files.get(ADR).toString("utf8").replace(
    /The implementation clarification ledger `[^`]+` is anchored as `sha256:[a-f0-9]{64}`\./u,
    `The implementation clarification ledger \`${LEDGER}\` is anchored as \`${digest(ledgerBytes)}\`.`,
  );
  files.set(ADR, Buffer.from(decision));
  return files;
}

const graphCase = (cases, id) => cases.graphCases.find(entry => entry.id === id);

test("accepted implementation clarification custody and fixtures are coherent", async () => {
  await assert.doesNotReject(run(await acceptedInputs()));
});

test("custody rejects byte drift, undeclared JSON, duplicate listings, and an absent anchor", async () => {
  const drift = await acceptedInputs();
  drift.set(CASES, Buffer.concat([drift.get(CASES), Buffer.from(" ")]));
  await assert.rejects(run(drift), /differs from the clarification ledger/u);

  const files = await acceptedInputs();
  await assert.rejects(run(files, [...PATHS, `${DIRECTORY}/extra.json`]), /exactly the declared/u);
  await assert.rejects(run(files, [CONTRACT, CONTRACT, CASES]), /unique paths/u);

  const noAnchor = await acceptedInputs();
  noAnchor.set(ADR, Buffer.from(noAnchor.get(ADR).toString("utf8").replace(
    /The implementation clarification ledger[^\n]+\n?/u,
    "",
  )));
  await assert.rejects(run(noAnchor), /missing the exact clarification ledger anchor/u);
});

test("graph oracle retains independent and attached residual depth beside cycles", async () => {
  for (const id of ["independent-over", "attached-over", "tail-over"]) {
    const files = await semanticMutant(undefined, cases => {
      graphCase(cases, id).expected.diagnostics = graphCase(cases, id).expected.diagnostics
        .filter(diagnostic => diagnostic.code !== "input.limit-exceeded");
    });
    await assert.rejects(run(files), new RegExp(`${id} expected graph result is wrong`, "u"));
  }
});

test("graph oracle rejects lost pair/self cycles, wrong saturation, and diagnostic order", async () => {
  for (const id of ["cycle-only", "self-cycle-only"]) {
    const files = await semanticMutant(undefined, cases => {
      graphCase(cases, id).expected.diagnostics = [];
    });
    await assert.rejects(run(files), /expected graph result is wrong/u);
  }

  const wrongActual = await semanticMutant(undefined, cases => {
    graphCase(cases, "independent-over").expected.diagnostics[0].details.actual = 2048;
  });
  await assert.rejects(run(wrongActual), /expected graph result is wrong/u);

  const wrongOrder = await semanticMutant(undefined, cases => {
    graphCase(cases, "independent-over").expected.diagnostics.reverse();
  });
  await assert.rejects(run(wrongOrder), /expected graph result is wrong|contract order/u);
});

test("graph evidence set and bounded recipe shapes are closed", async () => {
  const missingCase = await semanticMutant(undefined, cases => { cases.graphCases.pop(); });
  await assert.rejects(run(missingCase), /fixed ordered evidence set/u);

  const invalidShape = await semanticMutant(undefined, cases => {
    graphCase(cases, "attached-over").recipe.chainLength = 2050;
  });
  await assert.rejects(run(invalidShape), /invalid bounded graph recipe/u);

  const absentEndpoint = await semanticMutant(undefined, cases => {
    graphCase(cases, "cycle-only").recipe.attachment = "cycle-consumes-chain";
  });
  await assert.rejects(run(absentEndpoint), /attachment endpoints do not exist/u);
});

test("bounded exact-number oracle covers zeros, exponents, underflow, and safe boundaries", () => {
  assert.deepEqual(projectRawNumber("0e999999999999999999999999"), { admitted: true, value: 0 });
  assert.deepEqual(projectRawNumber("-0e999999999999999999999999"), {
    admitted: false, code: "schema.invalid-value", reason: "invalid-format",
  });
  assert.deepEqual(projectRawNumber("10e-1"), { admitted: true, value: 1 });
  assert.deepEqual(projectRawNumber("1e-400"), {
    admitted: false, code: "schema.invalid-value", reason: "invalid-type",
  });
  assert.deepEqual(projectRawNumber("9007199254740991"), {
    admitted: true, value: 9007199254740991,
  });
  assert.deepEqual(projectRawNumber("9007199254740992"), {
    admitted: false, code: "schema.invalid-value", reason: "invalid-format",
  });
});

test("raw fixture cannot accept a value only because Number rounds it", async () => {
  const files = await semanticMutant(undefined, cases => {
    cases.rawNumberCases.find(entry => entry.lexeme === "1.0000000000000001").expected = {
      admitted: true,
      value: 1,
    };
  });
  await assert.rejects(run(files), /wrong projection/u);
});

test("closed choices reject reserved public codes and weakened trust or post-M3 gates", async () => {
  const mutations = [
    contract => { contract.diagnosticTypes.members = "all-catalog-codes"; },
    contract => { contract.diagnosticTypes.reserved = "included"; },
    contract => { contract.diagnosticTypes.internalFailure = "resolved-diagnostic"; },
    contract => { contract.carrierTrust.objectGraph = "arbitrary-hostile-proxy"; },
    contract => { contract.carrierTrust.ownedSnapshot = "eventually-copied"; },
    contract => { contract.publication.M3 = contract.publication.M3.filter(gate => gate !== "W0-W1"); },
    contract => { contract.publication.postM3 = "packed-Node-TypeScript-only"; },
  ];
  for (const mutate of mutations) {
    await assert.rejects(run(await semanticMutant(mutate)), /closed choice changed/u);
  }
});

test("supplement stays linked to immutable graph prerequisites and code disposition", async () => {
  const prerequisites = await acceptedInputs();
  const diagnosticContract = JSON.parse(prerequisites.get(
    "architecture/qualification/v1/diagnostic-contract.json",
  ));
  diagnosticContract.prerequisiteCatalog.limits
    .find(limit => limit.limitName === "graphDepth").prerequisites.pop();
  prerequisites.set(
    "architecture/qualification/v1/diagnostic-contract.json",
    Buffer.from(JSON.stringify(diagnosticContract)),
  );
  await assert.rejects(run(prerequisites), /prerequisites differ/u);

  const disposition = await acceptedInputs();
  const changed = JSON.parse(disposition.get(
    "architecture/qualification/v1/diagnostic-contract.json",
  ));
  changed.codeDisposition.emittable.push("output.canonicalization-failed");
  disposition.set(
    "architecture/qualification/v1/diagnostic-contract.json",
    Buffer.from(JSON.stringify(changed)),
  );
  await assert.rejects(run(disposition), /immutable catalog partition/u);
});
