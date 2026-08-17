import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOrgAdmin } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";
import { readMediaFile } from "@/lib/media";

// Streams decrypted bytes for a specific document version. This is a
// dedicated concern precisely because it's the one place in the module
// that does NOT inherit /films/[id]/documents's page-level guard — a route
// handler is a separate entry point, so it re-checks session + film
// access itself. A correctly-guarded page next to an ungated download
// route is exactly the kind of gap this file exists to close.
//
// Every successful download is a "view" AuditEvent on media_asset, per
// sign-off open question 5 (media access folds into the shared audit log
// rather than a bespoke one) — no other route in this module needs that
// because the page reads don't expose file contents, only metadata.

export async function GET(
  _req: Request,
  { params }: { params: { versionId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const version = await prisma.mediaAssetVersion.findFirst({
    where: { id: params.versionId, mediaAsset: { orgId: session.user.orgId } },
    include: { mediaAsset: true },
  });
  if (!version) {
    return new Response("Not found", { status: 404 });
  }

  const asset = version.mediaAsset;

  if (asset.filmId) {
    const [admin, assignment] = await Promise.all([
      isOrgAdmin(session.user.id, session.user.orgId),
      prisma.filmAssignment.findFirst({
        where: { filmId: asset.filmId, userId: session.user.id, status: "ACTIVE" },
      }),
    ]);
    if (!admin && !assignment) {
      return new Response("Forbidden", { status: 403 });
    }
  } else {
    // Org-wide (film-less) documents have no upload surface yet, but the
    // schema allows them — org-admin only if one ever shows up.
    const admin = await isOrgAdmin(session.user.id, session.user.orgId);
    if (!admin) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  let plaintext: Buffer;
  try {
    plaintext = await readMediaFile(version.storageProvider, version.storageKey, version.encryptionKeyRef);
  } catch (err) {
    // Surface as 500, not a silent empty download — a decrypt/read failure
    // here means the blob or key material is missing or corrupt.
    console.error(`Failed to read media version ${version.id}:`, err);
    return new Response("Failed to read file", { status: 500 });
  }

  await recordAuditEvent({
    orgId: session.user.orgId,
    filmId: asset.filmId,
    actorUserId: session.user.id,
    action: "view",
    entityType: "media_asset",
    entityId: asset.id,
    after: { versionNumber: version.versionNumber, filename: version.originalFilename },
  });

  const asciiFallback = version.originalFilename.replace(/[^\x20-\x7E]/g, "_");
  const encodedName = encodeURIComponent(version.originalFilename);

  return new Response(new Uint8Array(plaintext), {
    headers: {
      "Content-Type": asset.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`,
      "Content-Length": String(plaintext.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}
