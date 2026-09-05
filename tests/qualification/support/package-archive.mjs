import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { isUint8Array } from "node:util/types";
import { gunzipSync } from "node:zlib";
import { Header } from "tar";

// Private qualification input budgets, not Core limits or package guarantees.
const MAX_COMPRESSED = 16 * 1024 * 1024;
const MAX_TAR = 64 * 1024 * 1024;
const MAX_FILE = 8 * 1024 * 1024;
const MAX_FILES = 512;
const BLOCK = 512;
const MAX_PATH = 240;
const MAX_SEGMENT = 100;
const USTAR = Buffer.from([117, 115, 116, 97, 114, 0, 48, 48]);

class InvalidArchive extends Error {
  constructor(reason) {
    super("Invalid package archive.");
    this.code = "archive.invalid";
    this.context = { reason };
  }
}

function fail(reason) {
  throw new InvalidArchive(reason);
}

function zero(bytes, start = 0, end = bytes.length) {
  for (let index = start; index < end; index++) {
    if (bytes[index] !== 0) return false;
  }
  return true;
}

function expectedRecord(value) {
  let descriptors;
  try {
    if (value === null || typeof value !== "object") fail("identity-shape");
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail("identity-shape");
    const keys = Reflect.ownKeys(value);
    if (keys.length !== 2 || !keys.includes("sha256") || !keys.includes("integrity")) {
      fail("identity-shape");
    }
    descriptors = Object.getOwnPropertyDescriptors(value);
    if (!Object.hasOwn(descriptors.sha256, "value") || !Object.hasOwn(descriptors.integrity, "value")) {
      fail("identity-shape");
    }
  } catch {
    fail("identity-shape");
  }
  const sha256 = descriptors.sha256.value;
  const integrity = descriptors.integrity.value;
  if (typeof sha256 !== "string" || sha256.length !== 64 || !/^[a-f0-9]{64}$/u.test(sha256)) {
    fail("identity-sha256-format");
  }
  if (typeof integrity !== "string" || integrity.length !== 95
    || !/^sha512-[A-Za-z0-9+/]{86}==$/u.test(integrity)
    || Buffer.from(integrity.slice(7), "base64").toString("base64") !== integrity.slice(7)) {
    fail("identity-integrity-format");
  }
  return { sha256, integrity };
}

// Check field spelling only. Header owns all octal/base-256 interpretation and
// checksum calculation. Its permissive parseInt must not accept numeric junk.
function numericField(block, offset, width, required = false) {
  const field = block.subarray(offset, offset + width);
  if (field[0] & 0x80) {
    if (offset === 148) fail("header-numeric");
    return;
  }
  if (field.every(byte => byte === 0 || byte === 32)) {
    if (required) fail("header-numeric");
    return;
  }
  const spelling = field.toString("latin1");
  const match = /^ *[0-7]+[ \0]*$/u.exec(spelling);
  if (!match || match[0].length !== spelling.length) fail("header-numeric");
}

function textField(block, offset, width, isPath = false) {
  let ended = false;
  for (let index = offset; index < offset + width; index++) {
    const byte = block[index];
    if (byte === 0) ended = true;
    else {
      if (ended) fail(isPath ? "path-header" : "header-fields");
      if (byte < 32 || byte > 126) fail(isPath ? "path-characters" : "header-fields");
    }
  }
}

function nonnegativeInteger(value, optional = false) {
  if (optional && value === undefined) return;
  if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) fail("header-numeric");
}

function canonicalPath(raw) {
  if (typeof raw !== "string" || !raw.startsWith("package/")) fail("path-root");
  const path = raw.slice(8);
  if (!path || path.startsWith("package/")) fail("path-root");
  if (path.length > MAX_PATH) fail("path-length");
  for (const segment of path.split("/")) {
    if (!segment || segment === "." || segment === ".." || /[. ]$/u.test(segment)) {
      fail("path-segment");
    }
    if (segment.length > MAX_SEGMENT) fail("path-length");
    if (/[^A-Za-z0-9_.-]/u.test(segment)) fail("path-characters");
    const base = segment.split(".", 1)[0];
    if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(base)) fail("path-device");
  }
  return path;
}

function readHeader(block) {
  if (!block.subarray(257, 265).equals(USTAR)) fail("header-format");
  numericField(block, 100, 8, true);
  numericField(block, 108, 8);
  numericField(block, 116, 8);
  numericField(block, 124, 12, true);
  numericField(block, 136, 12);
  numericField(block, 148, 8, true);
  numericField(block, 329, 8);
  numericField(block, 337, 8);
  // Match Header's documented implementation of the USTAR prefix field and
  // its optional time fields; do not assemble or normalize the path ourselves.
  const prefixWidth = block[475] === 0 ? 130 : 155;
  if (prefixWidth === 130) {
    numericField(block, 476, 12);
    numericField(block, 488, 12);
  }
  let header;
  try {
    header = new Header(block);
  } catch {
    // A complete block with bounded numeric spelling can still contain an
    // invalid/overflowing binary number. Never retain the decoder's exception.
    fail("header-numeric");
  }
  if (!header.cksumValid) fail("header-checksum");
  // Inspect the physical flag, before Header's legacy trailing-slash handling.
  // No PAX/global/GNU metadata is applied, skipped, or carried to another row.
  if (block[156] !== 0 && block[156] !== 48) fail("header-type");
  textField(block, 0, 100, true);
  textField(block, 345, prefixWidth, true);
  const path = canonicalPath(header.path);
  if (header.type !== "File") fail("header-type");
  if (!zero(block, 157, 257) || !zero(block, 500, 512)) fail("header-fields");
  textField(block, 265, 32);
  textField(block, 297, 32);
  nonnegativeInteger(header.size);
  nonnegativeInteger(header.mode);
  for (const value of [header.uid, header.gid, header.devmaj, header.devmin]) {
    nonnegativeInteger(value, true);
  }
  for (const date of [header.mtime, header.atime, header.ctime]) {
    if (date !== undefined) nonnegativeInteger(date.getTime());
  }
  return { path, size: header.size, mode: header.mode };
}

function reservePath(path, files, destinations, prefixes) {
  if (files.has(path)) fail("duplicate-path");
  const folded = path.toLowerCase();
  if (destinations.has(folded)) fail("case-collision");
  if (prefixes.has(folded)) fail("prefix-collision");
  let slash = folded.indexOf("/");
  while (slash !== -1) {
    const prefix = folded.slice(0, slash);
    if (destinations.has(prefix)) fail("prefix-collision");
    const spelling = path.slice(0, slash);
    if (prefixes.has(prefix) && prefixes.get(prefix) !== spelling) fail("case-collision");
    prefixes.set(prefix, spelling);
    slash = folded.indexOf("/", slash + 1);
  }
  destinations.add(folded);
}

function read(archiveBytes, expectedIdentity) {
  if (!isUint8Array(archiveBytes)) fail("input-type");
  const expected = expectedRecord(expectedIdentity);
  if (archiveBytes.byteLength > MAX_COMPRESSED) fail("compressed-limit");
  const bytes = Buffer.from(archiveBytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  if (sha256 !== expected.sha256) fail("identity-sha256-mismatch");
  if (integrity !== expected.integrity) fail("identity-integrity-mismatch");

  let inflated;
  try {
    inflated = gunzipSync(bytes, { info: true, maxOutputLength: MAX_TAR });
  } catch (error) {
    if (error?.code === "ERR_BUFFER_TOO_LARGE") fail("tar-limit");
    if (error?.code === "Z_BUF_ERROR") fail("gzip-truncated");
    fail("gzip-invalid");
  }
  if (inflated.engine.bytesWritten !== bytes.length) fail("gzip-trailing");
  const tar = inflated.buffer;
  if (tar.length > MAX_TAR) fail("tar-limit");
  const files = new Map();
  const inventory = [];
  const destinations = new Set();
  const prefixes = new Map();
  let offset = 0;
  while (true) {
    const remaining = tar.length - offset;
    if (remaining === 0) fail("tar-missing-terminator");
    if (remaining < BLOCK) fail("tar-partial-block");
    if (zero(tar, offset, offset + BLOCK)) {
      if (remaining === BLOCK) fail("tar-missing-terminator");
      if (remaining < 2 * BLOCK) fail("tar-partial-block");
      if (!zero(tar, offset + BLOCK, offset + 2 * BLOCK)) fail("tar-invalid-terminator");
      offset += 2 * BLOCK;
      if ((tar.length - offset) % BLOCK !== 0) fail("tar-partial-block");
      if (!zero(tar, offset)) fail("tar-trailing-data");
      if (files.size === 0) fail("archive-empty");
      inventory.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
      return { sha256, integrity, compressedBytes: bytes.length, tarBytes: tar.length, files, inventory };
    }
    const { path, size, mode } = readHeader(tar.subarray(offset, offset + BLOCK));
    if (size > MAX_FILE) fail("file-limit");
    if (files.size >= MAX_FILES) fail("entry-limit");
    reservePath(path, files, destinations, prefixes);
    const start = offset + BLOCK;
    const available = tar.length - start;
    if (size > available) fail("payload-truncated");
    const paddedSize = Math.ceil(size / BLOCK) * BLOCK;
    if (paddedSize > available) fail("padding-truncated");
    const end = start + size;
    if (!zero(tar, end, start + paddedSize)) fail("padding-nonzero");
    const content = Buffer.from(tar.subarray(start, end));
    files.set(path, content);
    inventory.push({ path, size, mode, sha256: createHash("sha256").update(content).digest("hex") });
    offset = start + paddedSize;
  }
}

// Reads inert bytes synchronously. It performs no extraction, writes, loading,
// or policy evaluation. Multiple gzip members may form one strictly framed tar;
// the full compressed byte identity binds every member and its compression data.
export function readPackageArchive(archiveBytes, expectedIdentity) {
  try {
    return read(archiveBytes, expectedIdentity);
  } catch (error) {
    if (error instanceof InvalidArchive) throw error;
    fail("reader-failed");
  }
}
