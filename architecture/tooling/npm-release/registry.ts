import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import { record, text } from "./policy.ts";

type RegistryRequest = (url: string, options: { signal: AbortSignal; redirect: "error" }) => Promise<Response>;
export async function registryVersion(name: string, selector: string, options: {
  request?: RegistryRequest;
  pause?: (milliseconds: number) => Promise<void>;
} = {}): Promise<string | undefined> {
  const request = options.request ?? fetch;
  const pause = options.pause ?? setTimeout;
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(selector)}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response;
    try { response = await request(url, { signal: AbortSignal.timeout(20000), redirect: "error" }); }
    catch (error) {
      if (attempt === 2) throw new Error("release.registry-read-unavailable", { cause: error });
      await pause(1000 * (attempt + 1)); continue;
    }
    if (response.status === 404) { await response.body?.cancel(); return undefined; }
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await response.body?.cancel(); await pause(1000 * (attempt + 1)); continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`release.registry-http:${response.status}`); }
    const value: unknown = await response.json();
    const metadata = record(value);
    assert.equal(metadata.name, name, "release.registry-package");
    return text(metadata.version);
  }
  throw new Error("release.registry-read-unavailable");
}
