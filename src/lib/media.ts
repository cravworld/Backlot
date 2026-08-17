import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

// Envelope encryption for the document/media store, per sign-off on
// phase-0-findings.md open question 4: "real, not placeholder" encryption
// at rest, identical regardless of storage backend (local disk or S3)
// rather than leaning on a backend's own server-side encryption.
//
// Every file gets a fresh random 32-byte data-encryption key (DEK). The
// file is encrypted with the DEK (AES-256-GCM); the DEK itself is then
// encrypted ("wrapped") with a single org-wide master key from
// MEDIA_MASTER_KEY. Only the wrapped DEK is persisted (MediaAssetVersion
// .encryptionKeyRef) — the raw DEK never touches the database, and the
// plaintext file bytes never touch disk or the network.
//
// AES-256-GCM needs both the IV and the 16-byte auth tag back at decrypt
// time — both are framed alongside the ciphertext (iv || authTag ||
// ciphertext) rather than added as separate schema columns, so decryption
// is self-contained given just the stored blob and the unwrapped key.
//
// Phase 1: added the S3 branch (StorageProvider.S3), pointed at Supabase
// Storage's S3-compatible endpoint per phase-1-findings.md — same
// encrypt-then-upload flow, Supabase (or any S3-compatible provider) only
// ever sees ciphertext. Which provider a new upload uses is decided once,
// by whether S3 env vars are configured (see resolveUploadProvider) —
// reads always honor whatever storageProvider is already on the row, so a
// mixed fleet of LOCAL (dev) and S3 (deployed) versions is fine.

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

export type StorageProviderKind = "LOCAL" | "S3";

export type StoredMediaFile = {
  storageProvider: StorageProviderKind;
  storageKey: string;
  byteSize: number;
  checksumSha256: string;
  encryptionKeyRef: string;
};

// --- S3 (Supabase Storage) ---------------------------------------------

function getS3Config() {
  const endpoint = process.env.SUPABASE_S3_ENDPOINT;
  const accessKeyId = process.env.SUPABASE_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.SUPABASE_S3_SECRET_ACCESS_KEY;
  const bucket = process.env.SUPABASE_S3_BUCKET;
  const region = process.env.SUPABASE_S3_REGION || "us-east-1"; // Supabase Storage ignores region but the SDK requires one
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { endpoint, accessKeyId, secretAccessKey, bucket, region };
}

let s3Client: S3Client | null = null;
function getS3Client(config: NonNullable<ReturnType<typeof getS3Config>>): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      forcePathStyle: true, // required by Supabase Storage's S3-compatible endpoint
    });
  }
  return s3Client;
}

/**
 * Which backend a *new* upload should use — S3 if fully configured
 * (Supabase Storage in any real deployment), local disk otherwise (so dev
 * without those env vars set keeps working exactly as before). Existing
 * rows are unaffected — reads always dispatch on the storageProvider
 * already recorded, never on this.
 */
function resolveUploadProvider(): StorageProviderKind {
  return getS3Config() ? "S3" : "LOCAL";
}

async function streamToBuffer(stream: unknown): Promise<Buffer> {
  // AWS SDK v3's GetObjectCommand Body is a Node Readable in this runtime
  // (not a web ReadableStream) — Next.js API routes here run on the
  // Node.js runtime, not edge.
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Encrypts `plaintext` under a fresh per-file DEK and writes the ciphertext
 * to whichever backend resolveUploadProvider() selects — Supabase Storage
 * (S3-compatible) when configured, local disk under storage/media/
 * (gitignored, outside /public — never directly web-servable) otherwise.
 * Returns everything a MediaAssetVersion row needs; the caller is
 * responsible for the Prisma write.
 */
export async function storeMediaFile(plaintext: Buffer): Promise<StoredMediaFile> {
  const masterKey = getMasterKey();
  const dek = randomBytes(32);
  const framed = aesGcmEncrypt(plaintext, dek);
  const storageKey = `${randomBytes(16).toString("hex")}.bin`;
  const storageProvider = resolveUploadProvider();

  if (storageProvider === "S3") {
    const config = getS3Config()!;
    await getS3Client(config).send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: storageKey,
        Body: framed,
        ContentType: "application/octet-stream",
      })
    );
  } else {
    await fs.mkdir(STORAGE_ROOT, { recursive: true });
    await fs.writeFile(path.join(STORAGE_ROOT, storageKey), framed);
  }

  return {
    storageProvider,
    storageKey,
    byteSize: plaintext.byteLength,
    checksumSha256: createHash("sha256").update(plaintext).digest("hex"),
    encryptionKeyRef: wrapKey(dek, masterKey),
  };
}

/** Reads a stored file back (from whichever backend it was written to) and decrypts it to its original plaintext bytes. */
export async function readMediaFile(
  storageProvider: StorageProviderKind,
  storageKey: string,
  encryptionKeyRef: string
): Promise<Buffer> {
  const masterKey = getMasterKey();
  const dek = unwrapKey(encryptionKeyRef, masterKey);

  let framed: Buffer;
  if (storageProvider === "S3") {
    const config = getS3Config();
    if (!config) {
      throw new Error(
        "This file was stored on S3 (Supabase Storage) but SUPABASE_S3_* env vars are not set."
      );
    }
    const result = await getS3Client(config).send(
      new GetObjectCommand({ Bucket: config.bucket, Key: storageKey })
    );
    framed = await streamToBuffer(result.Body);
  } else {
    framed = await fs.readFile(path.join(STORAGE_ROOT, storageKey));
  }

  return aesGcmDecrypt(framed, dek);
}

/** Removes a stored ciphertext blob. Best-effort on a missing file (already gone). */
export async function deleteMediaFile(
  storageProvider: StorageProviderKind,
  storageKey: string
): Promise<void> {
  if (storageProvider === "S3") {
    const config = getS3Config();
    if (!config) return; // nothing we can do without credentials; not fatal for a delete
    await getS3Client(config)
      .send(new DeleteObjectCommand({ Bucket: config.bucket, Key: storageKey }))
      .catch(() => {});
  } else {
    await fs.rm(path.join(STORAGE_ROOT, storageKey), { force: true });
  }
}
