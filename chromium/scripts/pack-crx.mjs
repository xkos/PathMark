import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const [, , zipPath, outputPath] = process.argv;
const encodedKey = process.env.CRX_PRIVATE_KEY_B64;
const keyPath = process.env.CRX_PRIVATE_KEY_PATH;

if (!zipPath || !outputPath) {
  throw new Error("Usage: node scripts/pack-crx.mjs <extension.zip> <extension.crx>");
}
if (!encodedKey && !keyPath) {
  throw new Error("CRX_PRIVATE_KEY_B64 or CRX_PRIVATE_KEY_PATH is required");
}

const privateKey = createPrivateKey(encodedKey ? Buffer.from(encodedKey, "base64") : await readFile(keyPath));
if (privateKey.asymmetricKeyType !== "rsa") {
  throw new Error("CRX signing key must be an RSA private key");
}

const zip = await readFile(zipPath);
const publicKey = createPublicKey(privateKey).export({ format: "der", type: "spki" });
const crxId = createHash("sha256").update(publicKey).digest().subarray(0, 16);
const signedHeaderData = field(1, crxId);
const signedPayload = Buffer.concat([
  Buffer.from("CRX3 SignedData\0", "ascii"),
  uint32le(signedHeaderData.length),
  signedHeaderData,
  zip,
]);
const signature = sign("sha256", signedPayload, privateKey);
if (!verify("sha256", signedPayload, createPublicKey(privateKey), signature)) {
  throw new Error("Generated CRX signature could not be verified");
}
const proof = Buffer.concat([field(1, publicKey), field(2, signature)]);
const header = Buffer.concat([field(2, proof), field(10_000, signedHeaderData)]);
const crx = Buffer.concat([
  Buffer.from("Cr24", "ascii"),
  uint32le(3),
  uint32le(header.length),
  header,
  zip,
]);

await writeFile(outputPath, crx);
console.log(`Created ${outputPath} (${crx.length} bytes)`);

function field(number, value) {
  return Buffer.concat([varint((number << 3) | 2), varint(value.length), value]);
}

function varint(value) {
  const bytes = [];
  let remaining = value;
  while (remaining > 0x7f) {
    bytes.push((remaining & 0x7f) | 0x80);
    remaining = Math.floor(remaining / 128);
  }
  bytes.push(remaining);
  return Buffer.from(bytes);
}

function uint32le(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}
