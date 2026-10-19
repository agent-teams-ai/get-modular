import assert from "node:assert/strict";
import { retainSdkGrowthFailure } from "../../sdk-growth-failure-retention.ts";

const [directory, artifact, checkoutSha, producerVersion] = process.argv.slice(2);
assert.ok(producerVersion, "the fixture must receive its producer version");
await retainSdkGrowthFailure({ code: 3 }, { directory, artifact, checkoutSha, producerVersion });
