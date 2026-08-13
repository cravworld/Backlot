import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";

// Envelope encryption for the document/media store, per sign-off on
// phase-0-findings.md open question 4: "real, not placeholder" encryption
// at rest, identical regardless of storage backend (local disk today, S3
// later) rather than leaning on a backend's own server-side encryption.
//
// Every file gets a fresh random 32-byte data-encryption key (DEK). The
// file is encrypted with the DEK (AES-256-GCM); the DEK itself is then
// encrypted ("wrapped") with a single org-wide master key from
// MEDIA_MASTER_KEY. Only the wrapped DEK is persisted (MediaAssetVersion
// .encryptionKeyRef) — the raw DEK never touches the database, and the
// plaintext file bytes never touch disk.
//
// AES-256-GCM needs both the IV and the 16-byte auth tag back at decrypt
// time — both are framed alongside the ciphertext (iv || authTag ||
// ciphertext) rather than added as separate schema columns, so decryption
// is self-contained given just the stored blob and the unwrapped key.

const IV_LENGTH = 12; // GCM-standard 96-bit IV
const AUTH_TAG_LENGTH = 16;
const STORAGE_ROOT = path.join(process.cwd(), "storage", "media");

function getMasterKey(): Buffer {
  const raw = process.env.MEDIA_MASTER_KEY;
  if (!raw) {
    throw new Error(
      "MEDIA_MASTER_KEY is not set. Refusing to store or read media without a real " +
        "encryption key — there is no plaintext-storage fallback. Generate one with " +
        `"node -e \\"console.log(require('crypto').randomBytes(32).toString('base64'))\\"" ` +
        "and set it in .env (see .env.example)."
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `MEDIA_MASTER_KEY must decode (base64) to exactly 32 bytes for AES-256 — got ${key.length}.`
    );
  }
  return key;
}

function aesGcmEncrypt(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

function aesGcmDecrypt(framed: Buffer, key: Buffer): Buffer {
  const iv = framed.subarray(0, IV_LENGTH);
  const authTag = framed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = framed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Wraps a raw DEK under the org master key. Returns a self-contained base64 blob. */
function wrapKey(dek: Buffer, masterKey: Buffer): string {
  return aesGcmEncrypt(dek, masterKey).toString("base64");
}

/** Reverses wrapKey — recovers the raw DEK, or throws if the ref/key don't match (tampered or wrong key). */
function unwrapKey(encryptionKeyRef: string, masterKey: Buffer): Buffer {
  return aesGcmDecrypt(Buffer.from(encryptionKeyRef, "base64"), masterKey);
}

export type StoredMediaFile = {
  storageKey: string;
  byteSize: number;
  checksumSha256: string;
  encryptionKeyRef: string;
};

/**
 * Encrypts `plaintext` under a fresh per-file DEK and writes the ciphertext
 * to local disk under storage/media/ (gitignored, outside /public — never
 * directly web-servable). Returns everything a MediaAssetVersion row needs;
 * the caller is responsible for the Prisma write.
 */
export async function storeMediaFile(plaintext: Buffer): Promise<StoredMediaFile> {
  const masterKey = getMasterKey();
  const dek = randomBytes(32);
  const framed = aesGcmEncrypt(plaintext, dek);

  const storageKey = `${randomBytes(16).toString("hex")}.bin`;
  await fs.mkdir(STORAGE_ROOT, { recursive: true });
  await fs.writeFile(path.join(STORAGE_ROOT, storageKey), framed);

  return {
    storageKey,
    byteSize: plaintext.byteLength,
    checksumSha256: createHash("sha256").update(plaintext).digest("hex"),
    encryptionKeyRef: wrapKey(dek, masterKey),
  };
}

/** Reads a stored file back and decrypts it to its original plaintext bytes. */
export async function readMediaFile(
  storageKey: string,
  encryptionKeyRef: string
): Promise<Buffer> {
  const masterKey = getMasterKey();
  const dek = unwrapKey(encryptionKeyRef, masterKey);
  const framed = await fs.readFile(path.join(STORAGE_ROOT, storageKey));
  return aesGcmDecrypt(framed, dek);
}

/** Removes a stored ciphertext blob. Best-effort on a missing file (already gone). */
export async function deleteMediaFile(storageKey: string): Promise<void> {
  await fs.rm(path.join(STORAGE_ROOT, storageKey), { force: true });
}
