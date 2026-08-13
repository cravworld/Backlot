-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('LOCAL', 'S3');

-- AlterTable
ALTER TABLE "person" ADD COLUMN     "photoMediaId" TEXT;

-- CreateTable
CREATE TABLE "media_asset" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "filmId" TEXT,
    "uploadedByUserId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_asset_version" (
    "id" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "storageProvider" "StorageProvider" NOT NULL DEFAULT 'LOCAL',
    "storageKey" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "encryptionKeyRef" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "changeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_asset_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_asset_currentVersionId_key" ON "media_asset"("currentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "media_asset_version_mediaAssetId_versionNumber_key" ON "media_asset_version"("mediaAssetId", "versionNumber");

-- AddForeignKey
ALTER TABLE "person" ADD CONSTRAINT "person_photoMediaId_fkey" FOREIGN KEY ("photoMediaId") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_filmId_fkey" FOREIGN KEY ("filmId") REFERENCES "film"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "media_asset_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_asset_version" ADD CONSTRAINT "media_asset_version_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "media_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_asset_version" ADD CONSTRAINT "media_asset_version_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
