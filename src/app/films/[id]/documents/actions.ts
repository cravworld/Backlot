"use server";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOrgAdmin } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { storeMediaFile, deleteMediaFile } from "@/lib/media";
import { ActionError } from "@/lib/action-error";

// Same org-admin gating as crew/assignments management (per
// phase-0-findings.md's People registry notes): who can upload/replace/
// delete a film's documents is an org-admin decision for Phase 0. Viewing
// and downloading is open to anyone with an assignment on the film — see
// the page and the /api/media/[versionId] route, which re-check that
// independently rather than trusting this file's gate.
//
// Each action wraps its body in try/catch: an ActionError redirects back
// to the documents page with the message in the query string (rendered
// by <ErrorBanner>) instead of crashing to a raw dev overlay.

async function requireFilmAdminSession(filmId: string) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const admin = await isOrgAdmin(session.user.id, session.user.orgId);
  if (!admin) throw new ActionError("Org admin access required.");

  const film = await prisma.film.findFirst({ where: { id: filmId, orgId: session.user.orgId } });
  if (!film) throw new ActionError("Film not found in this org.");

  return { session, film };
}

function readUploadedFile(formData: FormData): File {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new ActionError("Choose a file to upload.");
  }
  return file;
}

export async function uploadDocument(filmId: string, formData: FormData) {
  try {
    const { session } = await requireFilmAdminSession(filmId);
    const file = readUploadedFile(formData);
    const changeNote = String(formData.get("changeNote") ?? "").trim() || null;

    const plaintext = Buffer.from(await file.arrayBuffer());
    const stored = await storeMediaFile(plaintext);

    const asset = await prisma.mediaAsset.create({
      data: {
        orgId: session.user.orgId,
        filmId,
        uploadedByUserId: session.user.id,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        versions: {
          create: {
            versionNumber: 1,
            storageProvider: "LOCAL",
            storageKey: stored.storageKey,
            byteSize: stored.byteSize,
            checksumSha256: stored.checksumSha256,
            encryptionKeyRef: stored.encryptionKeyRef,
            originalFilename: file.name,
            uploadedByUserId: session.user.id,
            changeNote,
          },
        },
      },
      include: { versions: true },
    });

    await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { currentVersionId: asset.versions[0].id },
    });

    await recordAuditEvent({
      orgId: session.user.orgId,
      filmId,
      actorUserId: session.user.id,
      action: "create",
      entityType: "media_asset",
      entityId: asset.id,
      after: {
        filename: asset.filename,
        mimeType: asset.mimeType,
        versionNumber: 1,
        byteSize: stored.byteSize,
        checksumSha256: stored.checksumSha256,
        changeNote,
      },
    });

    revalidatePath(`/films/${filmId}/documents`);
    redirect(`/films/${filmId}/documents?saved=1`);
  } catch (err) {
    if (err instanceof ActionError) {
      redirect(`/films/${filmId}/documents?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }
}

export async function uploadNewVersion(assetId: string, filmId: string, formData: FormData) {
  try {
    const { session } = await requireFilmAdminSession(filmId);
    const file = readUploadedFile(formData);
    const changeNote = String(formData.get("changeNote") ?? "").trim() || null;

    const asset = await prisma.mediaAsset.findFirst({
      where: { id: assetId, orgId: session.user.orgId, filmId },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    });
    if (!asset) throw new ActionError("Document not found.");

    const previousVersionNumber = asset.versions[0]?.versionNumber ?? 0;
    const nextVersionNumber = previousVersionNumber + 1;

    const plaintext = Buffer.from(await file.arrayBuffer());
    const stored = await storeMediaFile(plaintext);

    const version = await prisma.mediaAssetVersion.create({
      data: {
        mediaAssetId: asset.id,
        versionNumber: nextVersionNumber,
        storageProvider: "LOCAL",
        storageKey: stored.storageKey,
        byteSize: stored.byteSize,
        checksumSha256: stored.checksumSha256,
        encryptionKeyRef: stored.encryptionKeyRef,
        originalFilename: file.name,
        uploadedByUserId: session.user.id,
        changeNote,
      },
    });

    await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { currentVersionId: version.id, mimeType: file.type || asset.mimeType },
    });

    await recordAuditEvent({
      orgId: session.user.orgId,
      filmId,
      actorUserId: session.user.id,
      action: "update",
      entityType: "media_asset",
      entityId: asset.id,
      before: { currentVersionNumber: previousVersionNumber || null },
      after: {
        currentVersionNumber: nextVersionNumber,
        filename: file.name,
        byteSize: stored.byteSize,
        checksumSha256: stored.checksumSha256,
        changeNote,
      },
    });

    revalidatePath(`/films/${filmId}/documents`);
    redirect(`/films/${filmId}/documents?saved=1`);
  } catch (err) {
    if (err instanceof ActionError) {
      redirect(`/films/${filmId}/documents?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }
}

export async function deleteDocument(assetId: string, filmId: string) {
  try {
    const { session } = await requireFilmAdminSession(filmId);

    const asset = await prisma.mediaAsset.findFirst({
      where: { id: assetId, orgId: session.user.orgId, filmId },
      include: { versions: true },
    });
    if (!asset) return;

    // Clear currentVersionId before deleting the asset so the DB never has to
    // reason about which FK direction wins — then cascade-delete the version
    // rows via the asset delete itself.
    await prisma.mediaAsset.update({ where: { id: asset.id }, data: { currentVersionId: null } });

    // Remove ciphertext blobs from disk first — if this partially fails,
    // we'd rather retry a delete than leave a decryptable orphan file behind
    // after the DB row is already gone.
    await Promise.all(asset.versions.map((v) => deleteMediaFile(v.storageKey)));

    await prisma.mediaAsset.delete({ where: { id: asset.id } });

    await recordAuditEvent({
      orgId: session.user.orgId,
      filmId,
      actorUserId: session.user.id,
      action: "delete",
      entityType: "media_asset",
      entityId: assetId,
      before: { filename: asset.filename, versionCount: asset.versions.length },
    });

    revalidatePath(`/films/${filmId}/documents`);
  } catch (err) {
    if (err instanceof ActionError) {
      redirect(`/films/${filmId}/documents?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }
}
