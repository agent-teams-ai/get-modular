import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { Header } from "tar";
import { readPackageArchive } from "../../../../tests/qualification/support/package-archive.mjs";

const BLOCK = 512;
const MIB = 1024 * 1024;
const EMPTY = Buffer.alloc(0);
const EOF = Buffer.alloc(2 * BLOCK);
const EMPTY_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const ABC_HASH = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const identity = bytes => ({
  sha256: digest(bytes),
  integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
});
const padding = size => (BLOCK - size % BLOCK) % BLOCK;

function header(path = "package/ok", size = 0, fields = {}) {
  const encoder = new Header({ path, type: "File", mode: 0o644, uid: 0, gid: 0,
    mtime: new Date(0), ...fields });
  // Assign directly so negative-size fixtures survive Header's constructor
  // filtering; Header.encode still owns their binary encoding and checksum.
  encoder.size = size;
  const block = Buffer.alloc(BLOCK);
  encoder.encode(block);
  return block;
}

function record(block, content = EMPTY) {
  const body = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return Buffer.concat([block, body, Buffer.alloc(padding(body.length))]);
}

function entry(path = "package/ok", content = EMPTY, fields = {}) {
  const body = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return record(header(path, body.length, fields), body);
}

function archive(records = [entry()], tail = EOF) {
  return Buffer.concat([...records, tail]);
}

function acceptTar(tar) {
  const bytes = gzipSync(tar);
  return readPackageArchive(bytes, identity(bytes));
}

function rejectBytes(bytes, reason, expected) {
  if (arguments.length < 3) expected = identity(bytes);
  assert.throws(() => readPackageArchive(bytes, expected), error => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "Invalid package archive.");
    assert.equal(error.code, "archive.invalid");
    assert.deepEqual(error.context, { reason });
    assert.deepEqual(Object.keys(error).sort(), ["code", "context"]);
    assert.equal(error.cause, undefined);
    return true;
  });
}

function rejectTar(tar, reason) {
  // Every format/path/resource mutant receives its own correct byte identity.
  rejectBytes(gzipSync(tar), reason);
}

function numericMutation(offset, width, spelling) {
  const block = header();
  block.fill(0, offset, offset + width);
  Buffer.from(spelling, "latin1").copy(block, offset, 0, width);
  // Undefined numeric properties preserve the mutated field. The public
  // encoder recomputes the checksum; no test checksum implementation exists.
  const encoder = new Header({ path: "package/ok", type: "File" });
  encoder.devmaj = undefined;
  encoder.devmin = undefined;
  encoder.encode(block);
  return block;
}

function physicalType(code, content = EMPTY, fields = {}) {
  const body = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const block = header("package/member", body.length, { ...fields, uname: code });
  // Swap two checksummed bytes. This preserves Header.encode's checksum while
  // permitting even unknown physical flags without another checksum encoder.
  [block[156], block[265]] = [block[265], block[156]];
  assert.equal(new Header(block).cksumValid, true);
  return record(block, body);
}

const controlTar = archive([entry("package/ok", "abc")]);
const controlBytes = gzipSync(controlTar);

// These are reader fixtures only. Actual npm pack integration is separately owned.
test("regular files produce exact identities, copied bytes and ASCII inventory", () => {
  const declaration = Buffer.from("export {};\n");
  const tar = archive([
    entry("package/z.txt", "abc", { mode: 0o755 }),
    entry("package/Dir/Mixed.d.ts", declaration),
    entry("package/empty"),
    entry("package/.hidden"),
  ], Buffer.alloc(4 * BLOCK));
  const bytes = gzipSync(tar);
  const expected = identity(bytes);
  const result = readPackageArchive(bytes, Object.freeze(expected));
  assert.deepEqual(Object.keys(result).sort(), ["compressedBytes", "files", "integrity", "inventory", "sha256", "tarBytes"]);
  assert.equal(result.sha256, digest(bytes));
  assert.equal(result.integrity, expected.integrity);
  assert.equal(result.compressedBytes, bytes.length);
  assert.equal(result.tarBytes, tar.length);
  assert.ok(result.files instanceof Map);
  assert.deepEqual([...result.files.keys()], ["z.txt", "Dir/Mixed.d.ts", "empty", ".hidden"]);
  assert.ok([...result.files.values()].every(Buffer.isBuffer));
  assert.deepEqual(result.files.get("z.txt"), Buffer.from("abc"));
  assert.deepEqual(result.files.get("Dir/Mixed.d.ts"), declaration);
  assert.deepEqual(result.files.get("empty"), EMPTY);
  assert.deepEqual(result.inventory, [
    { path: ".hidden", size: 0, mode: 0o644, sha256: EMPTY_HASH },
    { path: "Dir/Mixed.d.ts", size: declaration.length, mode: 0o644, sha256: digest(declaration) },
    { path: "empty", size: 0, mode: 0o644, sha256: EMPTY_HASH },
    { path: "z.txt", size: 3, mode: 0o755, sha256: ABC_HASH },
  ]);
  const storage = Buffer.alloc(bytes.length + 31, 0xa5);
  bytes.copy(storage, 9);
  const view = new Uint8Array(storage.buffer, storage.byteOffset + 9, bytes.length);
  const viewed = readPackageArchive(view, expected);
  assert.deepEqual(viewed.inventory, result.inventory);
  assert.equal(viewed.compressedBytes, bytes.length);
});

test("returned files, invocations and compressed input do not alias content", () => {
  const bytes = gzipSync(archive([entry("package/a", "abc"), entry("package/b", "abc")]));
  const expected = identity(bytes);
  const first = readPackageArchive(bytes, expected);
  const second = readPackageArchive(bytes, expected);
  assert.notEqual(first.files.get("a"), first.files.get("b"));
  first.files.get("a")[0] = 0x78;
  assert.equal(first.files.get("b").toString(), "abc");
  assert.equal(second.files.get("a").toString(), "abc");
  assert.equal(digest(bytes), expected.sha256);
  bytes.fill(0);
  assert.equal(first.files.get("a").toString(), "xbc");
  assert.equal(second.files.get("b").toString(), "abc");
  assert.equal(first.inventory[0].sha256, ABC_HASH);
});

test("safe short and full USTAR prefixes preserve the effective path", () => {
  const paths = [
    `package/${"a".repeat(55)}/${"b".repeat(55)}/Leaf.js`,
    `package/${"c".repeat(70)}/${"d".repeat(70)}/Leaf.js`,
  ];
  const blocks = paths.map(path => header(path));
  assert.notEqual(blocks[0][345], 0);
  assert.equal(blocks[0][475], 0);
  assert.notEqual(blocks[1][475], 0);
  for (let index = 0; index < blocks.length; index++) {
    assert.equal(new Header(blocks[index]).path, paths[index]);
  }
  const result = acceptTar(archive(blocks));
  assert.deepEqual([...result.files.keys()], paths.map(path => path.slice(8)));
});

test("prototype spellings and inert content remain Map data", () => {
  const names = ["__proto__", "constructor", "prototype", "then", "toString", "node/fs"];
  const result = acceptTar(archive(names.map(name => entry(`package/${name}`, "throw new Error('inert');"))));
  for (const name of names) assert.equal(result.files.get(name).toString(), "throw new Error('inert');");
  assert.equal(result.files.size, names.length);
});

test("both identities are required and validated before gzip parsing", async t => {
  const expected = identity(controlBytes);
  const wrongSha = `${expected.sha256[0] === "0" ? "1" : "0"}${expected.sha256.slice(1)}`;
  const wrongIntegrity = `sha512-${expected.integrity[7] === "A" ? "B" : "A"}${expected.integrity.slice(8)}`;
  for (const [label, value] of [
    ["missing", undefined], ["null", null], ["array", []], ["inherited", Object.create(expected)],
    ["extra field", { ...expected, version: "0.1.0" }], ["missing integrity", { sha256: expected.sha256 }],
    ["symbol field", { ...expected, [Symbol("extra")]: true }],
  ]) await t.test(label, () => rejectBytes(controlBytes, "identity-shape", value));
  for (const sha256 of ["A".repeat(64), "0".repeat(63), `${expected.sha256}\n`, 1]) {
    await t.test(`sha format ${typeof sha256}:${String(sha256).length}`, () => {
      rejectBytes(controlBytes, "identity-sha256-format", { ...expected, sha256 });
    });
  }
  for (const [label, integrity] of [
    ["algorithm", expected.integrity.replace("sha512-", "sha256-")],
    ["multiple tokens", `${expected.integrity} ${expected.integrity}`],
    ["missing padding", expected.integrity.slice(0, -1)],
    ["noncanonical padding bits", `${expected.integrity.slice(0, -3)}B==`],
    ["newline", `${expected.integrity}\n`], ["nonstring", 1],
  ]) await t.test(label, () => rejectBytes(controlBytes, "identity-integrity-format", { ...expected, integrity }));
  let accessed = 0;
  const accessor = { get sha256() { accessed++; return expected.sha256; }, integrity: expected.integrity };
  rejectBytes(controlBytes, "identity-shape", accessor);
  assert.equal(accessed, 0);
  rejectBytes(controlBytes, "identity-sha256-mismatch", { ...expected, sha256: wrongSha });
  rejectBytes(controlBytes, "identity-integrity-mismatch", { ...expected, integrity: wrongIntegrity });
  const garbage = Buffer.from("not a gzip stream");
  rejectBytes(garbage, "identity-sha256-mismatch", expected);
  rejectBytes(garbage, "identity-integrity-mismatch", { sha256: digest(garbage), integrity: expected.integrity });
});

test("a different archive with the same package name and version is not interchangeable", () => {
  const manifest = '{"name":"@get-modular/core","version":"0.1.0"}\n';
  const make = content => gzipSync(archive([entry("package/package.json", manifest), entry("package/a.js", content)]));
  const original = make("export const value = 1;");
  const changed = make("export const value = 2;");
  rejectBytes(changed, "identity-sha256-mismatch", identity(original));
  assert.equal(readPackageArchive(changed, identity(changed)).files.get("package.json").toString(), manifest);
  const compressionChanged = Buffer.from(original);
  compressionChanged[4] ^= 1; // gzip mtime changes; the tar and file bytes do not.
  rejectBytes(compressionChanged, "identity-sha256-mismatch", identity(original));
  rejectBytes(compressionChanged, "identity-integrity-mismatch", {
    sha256: digest(compressionChanged), integrity: identity(original).integrity,
  });
  assert.deepEqual(readPackageArchive(compressionChanged, identity(compressionChanged)).inventory,
    readPackageArchive(original, identity(original)).inventory);
});

test("only Uint8Array and Buffer inputs enter the reader", () => {
  for (const value of [null, "bytes", [], new Uint16Array(2), new ArrayBuffer(4), new DataView(new ArrayBuffer(4))]) {
    assert.throws(() => readPackageArchive(value, identity(controlBytes)), {
      code: "archive.invalid", context: { reason: "input-type" },
    });
  }
});

test("gzip errors and ignored compressed tails have exact private reasons", async t => {
  const badTrailer = Buffer.from(controlBytes);
  badTrailer[badTrailer.length - 8] ^= 1;
  const cases = [
    ["garbage", Buffer.from("not gzip"), "gzip-invalid"],
    ["truncated trailer", controlBytes.subarray(0, -1), "gzip-truncated"],
    ["truncated body", controlBytes.subarray(0, 12), "gzip-truncated"],
    ["bad checksum", badTrailer, "gzip-invalid"],
    ["truncated next member", Buffer.concat([controlBytes, Buffer.from([255])]), "gzip-truncated"],
    ["nonzero garbage", Buffer.concat([controlBytes, Buffer.from([255, 255])]), "gzip-invalid"],
    ["ignored zero byte", Buffer.concat([controlBytes, Buffer.alloc(1)]), "gzip-trailing"],
    ["ignored zero blocks", Buffer.concat([controlBytes, Buffer.alloc(BLOCK)]), "gzip-trailing"],
  ];
  for (const [label, bytes, reason] of cases) await t.test(label, () => rejectBytes(bytes, reason));
});

test("gzip members may compose one tar but cannot conceal a second archive", () => {
  const split = Buffer.concat([gzipSync(controlTar.subarray(0, 137)), gzipSync(controlTar.subarray(137))]);
  assert.equal(readPackageArchive(split, identity(split)).files.get("ok").toString(), "abc");
  const withEmptyMember = Buffer.concat([controlBytes, gzipSync(EMPTY)]);
  assert.equal(readPackageArchive(withEmptyMember, identity(withEmptyMember)).files.size, 1);
  const secondArchive = Buffer.concat([controlBytes, gzipSync(archive([entry("package/hidden")]))]);
  rejectBytes(secondArchive, "tar-trailing-data");
});

test("tar framing requires full payload, zero padding and a complete final terminator", async t => {
  const row = entry("package/ok", "abc");
  const nonzeroPadding = Buffer.from(controlTar);
  nonzeroPadding[BLOCK + 3] = 1;
  const hiddenBlock = Buffer.alloc(BLOCK);
  hiddenBlock[19] = 1;
  const cases = [
    ["no tar blocks", EMPTY, "tar-missing-terminator"],
    ["empty archive", EOF, "archive-empty"],
    ["partial header", header().subarray(0, BLOCK - 1), "tar-partial-block"],
    ["missing terminator", archive([row], EMPTY), "tar-missing-terminator"],
    ["one null block", archive([row], Buffer.alloc(BLOCK)), "tar-missing-terminator"],
    ["partial first terminator", archive([row], Buffer.alloc(BLOCK - 1)), "tar-partial-block"],
    ["partial second terminator", archive([row], Buffer.alloc(2 * BLOCK - 1)), "tar-partial-block"],
    ["nonconsecutive terminator", archive([row, Buffer.alloc(BLOCK), entry("package/next")]), "tar-invalid-terminator"],
    ["truncated payload", Buffer.concat([header("package/ok", BLOCK + 1), Buffer.alloc(BLOCK)]), "payload-truncated"],
    ["truncated padding", Buffer.concat([header("package/ok", 3), Buffer.from("abc"), Buffer.alloc(BLOCK - 4)]), "padding-truncated"],
    ["nonzero payload padding", nonzeroPadding, "padding-nonzero"],
    ["nonzero block after EOF", Buffer.concat([controlTar, hiddenBlock]), "tar-trailing-data"],
    ["file after EOF", Buffer.concat([controlTar, archive([entry("package/hidden", "secret")])]), "tar-trailing-data"],
    ["partial zero tail", Buffer.concat([controlTar, Buffer.alloc(1)]), "tar-partial-block"],
    ["partial nonzero tail", Buffer.concat([controlTar, Buffer.from("hidden")]), "tar-partial-block"],
  ];
  for (const [label, tar, reason] of cases) await t.test(label, () => rejectTar(tar, reason));
});

test("Header checksums, numeric decoding and finite field spelling are enforced", async t => {
  const badChecksum = header();
  badChecksum[0] ^= 1;
  rejectTar(archive([badChecksum]), "header-checksum");
  const badMagic = header();
  [badMagic[257], badMagic[258]] = [badMagic[258], badMagic[257]];
  assert.equal(new Header(badMagic).cksumValid, true);
  rejectTar(archive([badMagic]), "header-format");
  const badVersion = header();
  [badVersion[263], badVersion[262]] = [badVersion[262], badVersion[263]];
  assert.equal(new Header(badVersion).cksumValid, true);
  rejectTar(archive([badVersion]), "header-format");
  const hugeBinary = Buffer.alloc(12, 255);
  hugeBinary[0] = 128;
  const cases = [
    ["negative size", header("package/ok", -1)],
    ["negative mode", header("package/ok", 0, { mode: -1 })],
    ["negative uid", header("package/ok", 0, { uid: -1 })],
    ["negative time", header("package/ok", 0, { mtime: new Date(-1000) })],
    ["unsafe binary size", numericMutation(124, 12, hugeBinary)],
    ["size with junk suffix", numericMutation(124, 12, "00000000001x")],
    ["size with digit nine", numericMutation(124, 12, "00000000009\0")],
    ["size with hidden digits", numericMutation(124, 12, "0\0" + "1")],
    ["size with negative spelling", numericMutation(124, 12, "-1\0")],
    ["size with fractional spelling", numericMutation(124, 12, "1.5\0")],
    ["size with newline", numericMutation(124, 12, "00000000000\n")],
    ["missing size", numericMutation(124, 12, EMPTY)],
    ["missing mode", numericMutation(100, 8, EMPTY)],
    ["invalid mode", numericMutation(100, 8, "000064x\0")],
    ["invalid uid", numericMutation(108, 8, "000000x\0")],
    ["invalid gid", numericMutation(116, 8, "000000x\0")],
    ["invalid time", numericMutation(136, 12, "0000000000x\0")],
    ["invalid device number", numericMutation(329, 8, "000000x\0")],
  ];
  for (const [label, block] of cases) await t.test(label, () => rejectTar(archive([block]), "header-numeric"));
  const badChecksumField = header();
  badChecksumField[148] = 120;
  rejectTar(archive([badChecksumField]), "header-numeric");
  const binaryOne = Buffer.alloc(12);
  binaryOne[0] = 128;
  binaryOne[11] = 1;
  const binaryControl = numericMutation(124, 12, binaryOne);
  assert.equal(new Header(binaryControl).size, 1);
  assert.equal(acceptTar(archive([record(binaryControl, "a")])).files.get("ok").toString(), "a");
  rejectTar(archive([header("package/ok", Number.MAX_SAFE_INTEGER)]), "file-limit");
  rejectTar(archive([entry("package/ok", EMPTY, { linkpath: "package/other" })]), "header-fields");
  const unusedBytes = header("package/ok", 0, { uname: "x" });
  [unusedBytes[265], unusedBytes[500]] = [unusedBytes[500], unusedBytes[265]];
  assert.equal(new Header(unusedBytes).cksumValid, true);
  rejectTar(archive([unusedBytes]), "header-fields");
});

test("every non-File physical type fails without metadata normalization", async t => {
  const types = [
    ["hard link", "1"], ["symlink", "2"], ["character device", "3"], ["block device", "4"],
    ["directory", "5"], ["FIFO", "6"], ["contiguous file", "7"], ["global PAX", "g"],
    ["local PAX", "x"], ["old extended header", "X"], ["GNU long name", "L"],
    ["GNU long link", "K"], ["old GNU long name", "N"], ["sparse", "S"],
    ["dump directory", "D"], ["continuation", "M"], ["volume", "V"],
    ["ACL", "A"], ["inode", "I"], ["unknown", "Z"],
  ];
  for (const [label, code] of types) await t.test(label, () => {
    const payload = ["x", "g", "X"].includes(code) ? "22 path=../../outside\n"
      : ["L", "K", "N"].includes(code) ? "/outside\0" : EMPTY;
    rejectTar(archive([physicalType(code, payload), entry("package/ordinary")]), "header-type");
  });
  for (const code of ["1", "2"]) for (const target of ["package/inside", "../../outside", "/absolute"]) {
    await t.test(`link ${code} to ${target}`, () => {
      rejectTar(archive([physicalType(code, EMPTY, { linkpath: target })]), "header-type");
    });
  }
  assert.equal(acceptTar(archive([physicalType("\0", "abc")])).files.get("member").toString(), "abc");
});

test("noncanonical paths and Windows aliases fail with exact reasons", async t => {
  const cases = [
    ["missing root", "ok", "path-root"], ["bare root", "package", "path-root"],
    ["empty root", "package/", "path-root"], ["case changed root", "Package/ok", "path-root"],
    ["repeated root", "package/package/ok", "path-root"],
    ["absolute", "/package/ok", "path-root"], ["drive", "C:/package/ok", "path-root"],
    ["UNC", "//server/share/ok", "path-root"], ["backslash UNC", "\\\\server\\share\\ok", "path-root"],
    ["parent traversal", "package/../ok", "path-segment"],
    ["nested traversal", "package/a/../../ok", "path-segment"],
    ["dot component", "package/./ok", "path-segment"],
    ["empty component", "package/a//ok", "path-segment"],
    ["trailing slash", "package/ok/", "path-segment"],
    ["trailing dot", "package/a./ok", "path-segment"],
    ["trailing space", "package/a /ok", "path-segment"],
    ["backslash", "package/a\\ok", "path-characters"],
    ["embedded drive", "package/C:/ok", "path-characters"],
    ["alternate data stream", "package/ok:stream", "path-characters"],
    ["space", "package/a b", "path-characters"], ["percent", "package/%2e%2e/ok", "path-characters"],
    ["newline", "package/a\nb", "path-characters"], ["tab", "package/a\tb", "path-characters"],
    ["DEL", "package/a\u007fb", "path-characters"], ["non-ASCII", "package/caf\u00e9", "path-characters"],
    ["hidden name after NUL", "package/ok\0hidden", "path-header"],
    ["long segment", `package/${"a".repeat(101)}/ok`, "path-length"],
    ["long effective path", `package/${"a".repeat(70)}/${"b".repeat(70)}/${"c".repeat(99)}`, "path-length"],
    ["escaping prefix", `package/${"a".repeat(70)}/../${"b".repeat(40)}/ok`, "path-segment"],
    ["outside prefix", `outside/${"a".repeat(100)}/ok`, "path-root"],
    ["hidden prefix", `package/${"a".repeat(60)}\0hidden/${"b".repeat(40)}/ok`, "path-header"],
  ];
  for (const name of ["CON", "con.txt", "PrN.md", "AUX", "nul.dat", "COM1", "com9.js", "LPT1", "lpt9.txt"]) {
    cases.push([`device ${name}`, `package/${name}`, "path-device"]);
  }
  for (const name of ["CLOCK$", "CONIN$", "CONOUT$"]) {
    cases.push([`device punctuation ${name}`, `package/${name}`, "path-characters"]);
  }
  for (const [label, path, reason] of cases) await t.test(label, () => rejectTar(archive([entry(path)]), reason));
  const segmentLimit = `package/${"x".repeat(100)}`;
  const pathLimit = `package/${"a".repeat(70)}/${"b".repeat(70)}/${"c".repeat(98)}`;
  const result = acceptTar(archive([entry(segmentLimit), entry(pathLimit)]));
  assert.ok(result.files.has(segmentLimit.slice(8)));
  assert.ok(result.files.has(pathLimit.slice(8)));
});

test("duplicates and file-prefix collisions never choose a winning entry", async t => {
  const long = `package/${"a".repeat(70)}/${"b".repeat(70)}/same.js`;
  const cases = [
    ["identical duplicate", [entry("package/a", "same"), entry("package/a", "same")], "duplicate-path"],
    ["different duplicate", [entry("package/a", "first"), entry("package/a", "last")], "duplicate-path"],
    ["case collision", [entry("package/Dir/File.js"), entry("package/dir/file.js")], "case-collision"],
    ["implicit directory case", [entry("package/Dir/a.js"), entry("package/dir/b.js")], "case-collision"],
    ["implicit directory reverse case", [entry("package/dir/b.js"), entry("package/Dir/a.js")], "case-collision"],
    ["nested directory case", [entry("package/Dir/Sub/a.js"), entry("package/Dir/sub/b.js")], "case-collision"],
    ["nested directory reverse case", [entry("package/Dir/sub/b.js"), entry("package/Dir/Sub/a.js")], "case-collision"],
    ["file before child", [entry("package/a"), entry("package/a/b")], "prefix-collision"],
    ["child before file", [entry("package/a/b"), entry("package/a")], "prefix-collision"],
    ["folded file before child", [entry("package/A"), entry("package/a/b")], "prefix-collision"],
    ["folded child before file", [entry("package/A/b"), entry("package/a")], "prefix-collision"],
    ["header prefix duplicate", [entry(long), entry(long)], "duplicate-path"],
    ["header prefix file conflict", [entry(`package/${"a".repeat(70)}`), entry(long)], "prefix-collision"],
  ];
  for (const [label, records, reason] of cases) await t.test(label, () => rejectTar(archive(records), reason));
  assert.equal(acceptTar(archive([entry("package/a/b"), entry("package/a/c")])).files.size, 2);
  assert.equal(acceptTar(archive([entry("package/Dir/Sub/a"), entry("package/Dir/Sub/b")])).files.size, 2);
});

function gzipWithComment(length) {
  const extra = length - controlBytes.length;
  assert.ok(extra >= 1);
  const result = Buffer.alloc(length, 97);
  controlBytes.copy(result, 0, 0, 10);
  result[3] |= 16; // RFC 1952 FCOMMENT, terminated before the original deflate data.
  result[10 + extra - 1] = 0;
  controlBytes.copy(result, 10 + extra, 10);
  return result;
}

function sizedFile(size) {
  // Separate gzip members avoid building several copies of a large tar fixture.
  return Buffer.concat([
    gzipSync(header("package/large", size)),
    gzipSync(Buffer.alloc(size, 97), { level: 1 }),
    gzipSync(Buffer.alloc(padding(size) + EOF.length)),
  ]);
}

function tarAtOutputLimit() {
  // One empty file followed by complete zero blocks. No 64 MiB source fixture
  // is allocated: gzip members compose the single bounded tar byte stream.
  const zeroChunk = gzipSync(Buffer.alloc(MIB), { level: 1 });
  return Buffer.concat([
    gzipSync(header("package/empty")),
    ...Array(63).fill(zeroChunk),
    gzipSync(Buffer.alloc(MIB - BLOCK), { level: 1 }),
  ]);
}

test("all four qualification input budgets include their exact limit", { concurrency: false }, async t => {
  await t.test("compressed bytes at 16 MiB", () => {
    const bytes = gzipWithComment(16 * MIB);
    const result = readPackageArchive(bytes, identity(bytes));
    assert.equal(result.compressedBytes, 16 * MIB);
    assert.equal(result.files.get("ok").toString(), "abc");
  });
  await t.test("compressed bytes plus one", () => {
    rejectBytes(gzipWithComment(16 * MIB + 1), "compressed-limit");
  });
  await t.test("file bytes at 8 MiB", () => {
    const bytes = sizedFile(8 * MIB);
    const result = readPackageArchive(bytes, identity(bytes));
    assert.equal(result.files.get("large").length, 8 * MIB);
    assert.equal(result.files.get("large")[0], 97);
    assert.equal(result.files.get("large").at(-1), 97);
    assert.equal(result.inventory[0].size, 8 * MIB);
    assert.equal(result.inventory[0].sha256, digest(Buffer.alloc(8 * MIB, 97)));
  });
  await t.test("file bytes plus one with a complete declared payload", () => {
    rejectBytes(sizedFile(8 * MIB + 1), "file-limit");
  });
  await t.test("512 regular entries", () => {
    const rows = Array.from({ length: 512 }, (_, index) => entry(`package/f${String(index).padStart(3, "0")}`));
    const result = acceptTar(archive(rows));
    assert.equal(result.files.size, 512);
    assert.equal(result.inventory.length, 512);
    assert.equal(result.inventory[0].path, "f000");
    assert.equal(result.inventory.at(-1).path, "f511");
  });
  await t.test("regular entry count plus one", () => {
    const rows = Array.from({ length: 513 }, (_, index) => entry(`package/f${String(index).padStart(3, "0")}`));
    rejectTar(archive(rows), "entry-limit");
  });
  const boundedOutput = tarAtOutputLimit();
  await t.test("decompressed bytes at 64 MiB", () => {
    const result = readPackageArchive(boundedOutput, identity(boundedOutput));
    assert.equal(result.tarBytes, 64 * MIB);
    assert.equal(result.files.size, 1);
    assert.deepEqual(result.files.get("empty"), EMPTY);
  });
  await t.test("decompressed bytes plus one before framing", () => {
    // The extra byte would also make tar framing partial; decompression must
    // reject the output budget first, before parsing any of that output.
    rejectBytes(Buffer.concat([boundedOutput, gzipSync(Buffer.from([0]))]), "tar-limit");
  });
});
