import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const source = readFileSync(new URL("./fixture.ts", import.meta.url), "utf8");
assert.match(source, /defineModule/);
for (const key of ["__proto__", "constructor", "then", "é", "\u0301"]) {
  const record = Object.create(null);
  record[key] = 1;
  assert.equal(record[key], 1);
}

console.log(JSON.stringify({
  scenarios: 17,
  serializability: "not-executed",
  evidenceStatus: "source-probe-only",
  executableImports: 0,
}));
