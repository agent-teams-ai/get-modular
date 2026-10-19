import assert from "node:assert/strict";
import { retainSdkGrowthFailure } from "../../sdk-growth-failure-retention.ts";

const [directory, artifact, checkoutSha, producerVersion, stdout] = process.argv.slice(2);
assert.ok(producerVersion, "the fixture must receive its producer version");
let primary: unknown;
try { assert.equal(3, 2); } catch (error) { primary = error; }
await retainSdkGrowthFailure({ code: 3, stdout }, { directory, artifact, checkoutSha, producerVersion });
try { throw primary; } catch (error) { assert.equal(error, primary); }
