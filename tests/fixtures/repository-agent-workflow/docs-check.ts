import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

assert.match(await readFile("README.md", "utf8"), /^# /u);
