import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import { packageIds, record, text } from "./policy.ts";

type RegistryRequest = (url: string, options: { signal: AbortSignal; redirect: "error" }) => Promise<Response>;
export async function registryMetadata(name: string, selector: string, options: {
  request?: RegistryRequest;
  pause?: (milliseconds: number) => Promise<void>;
} = {}): Promise<Record<string, unknown> | undefined> {
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
    text(metadata.version);
    return metadata;
  }
  throw new Error("release.registry-read-unavailable");
}

export async function registryVersion(name: string, selector: string, options: {
  request?: RegistryRequest;
  pause?: (milliseconds: number) => Promise<void>;
} = {}): Promise<string | undefined> {
  const metadata = await registryMetadata(name, selector, options);
  return metadata === undefined ? undefined : text(metadata.version);
}

/** Bind an existing immutable version to the canonical npm tarball and SRI. */
export function registryIdentity(name: string, version: string, metadata: Record<string, unknown>): { url: string; integrity: string } {
  const id = name.slice("@get-modular/".length);
  assert(packageIds.some(value => value === id) && name === `@get-modular/${id}`, "release.registry-package");
  assert.match(version, /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u, "release.registry-version");
  assert.equal(metadata.name, name, "release.registry-package");
  assert.equal(metadata.version, version, "release.registry-version-mismatch");
  const dist = record(metadata.dist);
  const url = `https://registry.npmjs.org/@get-modular/${id}/-/${id}-${version}.tgz`;
  assert.equal(dist.tarball, url, "release.registry-archive-url");
  const integrity = text(dist.integrity);
  assert.match(integrity, /^sha512-[A-Za-z0-9+/]{86}==$/u, "release.registry-integrity");
  return { url, integrity };
}

/** Read-only public archive retrieval with the metadata reader's bounded retries. */
export async function registryArchive(url: string, options: {
  request?: RegistryRequest;
  pause?: (milliseconds: number) => Promise<void>;
} = {}): Promise<Buffer> {
  const request = options.request ?? fetch; const pause = options.pause ?? setTimeout;
  const maximum = 16 * 1024 * 1024;
  const match = /^https:\/\/registry\.npmjs\.org\/@get-modular\/([a-z]+)\/-\/([a-z]+)-((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))\.tgz$/u.exec(url);
  assert(match && match[1] === match[2] && packageIds.some(id => id === match[1]), "release.registry-archive-url");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response;
    try { response = await request(url, { signal: AbortSignal.timeout(20000), redirect: "error" }); }
    catch (error) {
      if (attempt === 2) {throw new Error("release.registry-archive-read-unavailable", { cause: error });}
      await pause(1000 * (attempt + 1)); continue;
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await response.body?.cancel(); await pause(1000 * (attempt + 1)); continue;
    }
    if (!response.ok) {await response.body?.cancel(); throw new Error(`release.registry-archive-http:${response.status}`);}
    const length = response.headers.get("content-length");
    if (length !== null && (!/^[0-9]+$/u.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) > maximum)) {
      await response.body?.cancel(); throw new Error("release.registry-archive-size");
    }
    const reader = response.body?.getReader(); assert(reader, "release.registry-archive-body");
    const chunks: Buffer[] = []; let size = 0;
    try {
      while (true) {
        const next = await reader.read(); if (next.done) {break;}
        size += next.value.byteLength;
        if (size > maximum) {await reader.cancel(); throw new Error("release.registry-archive-size");}
        chunks.push(Buffer.from(next.value));
      }
    } catch (error) {await reader.cancel().catch(() => undefined); throw error;}
    finally {reader.releaseLock();}
    assert(size > 0 && (length === null || Number(length) === size), "release.registry-archive-size");
    return Buffer.concat(chunks, size);
  }
  throw new Error("release.registry-archive-read-unavailable");
}
