-- CreateEnum
CREATE TYPE "ShootingDayStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "DprSceneStatus" AS ENUM ('COMPLETED', 'PARTIAL', 'DROPPED');

-- CreateTable
CREATE TABLE "shooting_day" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "filmId" TEXT NOT NULL,
    "shootDate" TIMESTAMP(3) NOT NULL,
    "unitCallTime" TIMESTAMP(3),
    "locationLabel" TEXT,
    "locationNote" TEXT,
    "sunriseTime" TIMESTAMP(3),
    "sunsetTime" TIMESTAMP(3),
    "weatherNote" TEXT,
    "hospitalContact" TEXT,
    "safetyNote" TEXT,
    "status" "ShootingDayStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shooting_day_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shooting_day_scene" (
    "id" TEXT NOT NULL,
    "shootingDayId" TEXT NOT NULL,
    "sceneSpineId" TEXT,
    "sceneLabel" TEXT NOT NULL,
    "plannedEighths" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shooting_day_scene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shooting_day_call_time" (
    "id" TEXT NOT NULL,
    "shootingDayId" TEXT NOT NULL,
    "personId" TEXT,
    "departmentLabel" TEXT,
    "callTime" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shooting_day_call_time_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_sheet_version" (
    "id" TEXT NOT NULL,
    "shootingDayId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "pdfMediaAssetId" TEXT NOT NULL,
    "changeNote" TEXT,
    "publishedByUserId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_sheet_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_sheet_dispatch" (
    "id" TEXT NOT NULL,
    "callSheetVersionId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "notificationMessageId" TEXT,
    "ackToken" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_sheet_dispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_production_report" (
    "id" TEXT NOT NULL,
    "shootingDayId" TEXT NOT NULL,
    "submittedByUserId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualCallTime" TIMESTAMP(3),
    "actualWrapTime" TIMESTAMP(3),
    "cateringBreakfast" INTEGER,
    "cateringLunch" INTEGER,
    "cateringDinner" INTEGER,
    "juniorArtistPlanned" INTEGER,
    "juniorArtistActual" INTEGER,
    "incidentsNote" TEXT,
    "equipmentIssuesNote" TEXT,

    CONSTRAINT "daily_production_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dpr_scene_result" (
    "id" TEXT NOT NULL,
    "dprId" TEXT NOT NULL,
    "shootingDaySceneId" TEXT NOT NULL,
    "status" "DprSceneStatus" NOT NULL,
    "pagesShotEighths" INTEGER,

    CONSTRAINT "dpr_scene_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dpr_overtime_entry" (
    "id" TEXT NOT NULL,
    "dprId" TEXT NOT NULL,
    "departmentLabel" TEXT NOT NULL,
    "overtimeMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dpr_overtime_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shooting_day_filmId_shootDate_key" ON "shooting_day"("filmId", "shootDate");

-- CreateIndex
CREATE UNIQUE INDEX "call_sheet_version_shootingDayId_versionNumber_key" ON "call_sheet_version"("shootingDayId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "call_sheet_dispatch_notificationMessageId_key" ON "call_sheet_dispatch"("notificationMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "call_sheet_dispatch_ackToken_key" ON "call_sheet_dispatch"("ackToken");

-- CreateIndex
CREATE UNIQUE INDEX "call_sheet_dispatch_callSheetVersionId_personId_key" ON "call_sheet_dispatch"("callSheetVersionId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_production_report_shootingDayId_key" ON "daily_production_report"("shootingDayId");

-- CreateIndex
CREATE UNIQUE INDEX "dpr_scene_result_dprId_shootingDaySceneId_key" ON "dpr_scene_result"("dprId", "shootingDaySceneId");

-- AddForeignKey
ALTER TABLE "shooting_day" ADD CONSTRAINT "shooting_day_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shooting_day" ADD CONSTRAINT "shooting_day_filmId_fkey" FOREIGN KEY ("filmId") REFERENCES "film"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shooting_day" ADD CONSTRAINT "shooting_day_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shooting_day_scene" ADD CONSTRAINT "shooting_day_scene_shootingDayId_fkey" FOREIGN KEY ("shootingDayId") REFERENCES "shooting_day"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shooting_day_call_time" ADD CONSTRAINT "shooting_day_call_time_shootingDayId_fkey" FOREIGN KEY ("shootingDayId") REFERENCES "shooting_day"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shooting_day_call_time" ADD CONSTRAINT "shooting_day_call_time_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_sheet_version" ADD CONSTRAINT "call_sheet_version_shootingDayId_fkey" FOREIGN KEY ("shootingDayId") REFERENCES "shooting_day"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_sheet_version" ADD CONSTRAINT "call_sheet_version_pdfMediaAssetId_fkey" FOREIGN KEY ("pdfMediaAssetId") REFERENCES "media_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_sheet_version" ADD CONSTRAINT "call_sheet_version_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_sheet_dispatch" ADD CONSTRAINT "call_sheet_dispatch_callSheetVersionId_fkey" FOREIGN KEY ("callSheetVersionId") REFERENCES "call_sheet_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_sheet_dispatch" ADD CONSTRAINT "call_sheet_dispatch_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_sheet_dispatch" ADD CONSTRAINT "call_sheet_dispatch_notificationMessageId_fkey" FOREIGN KEY ("notificationMessageId") REFERENCES "notification_message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_production_report" ADD CONSTRAINT "daily_production_report_shootingDayId_fkey" FOREIGN KEY ("shootingDayId") REFERENCES "shooting_day"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_production_report" ADD CONSTRAINT "daily_production_report_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dpr_scene_result" ADD CONSTRAINT "dpr_scene_result_dprId_fkey" FOREIGN KEY ("dprId") REFERENCES "daily_production_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dpr_scene_result" ADD CONSTRAINT "dpr_scene_result_shootingDaySceneId_fkey" FOREIGN KEY ("shootingDaySceneId") REFERENCES "shooting_day_scene"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dpr_overtime_entry" ADD CONSTRAINT "dpr_overtime_entry_dprId_fkey" FOREIGN KEY ("dprId") REFERENCES "daily_production_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
