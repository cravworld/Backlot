-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateTable
CREATE TABLE "notification_template" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "language" TEXT NOT NULL,
    "subject" TEXT,
    "bodyTemplate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_message" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "filmId" TEXT,
    "templateId" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "recipientPersonId" TEXT,
    "recipientContact" TEXT NOT NULL,
    "bodyRendered" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_template_orgId_key_channel_language_key" ON "notification_template"("orgId", "key", "channel", "language");

-- CreateIndex
CREATE INDEX "notification_message_orgId_createdAt_idx" ON "notification_message"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "notification_message_providerMessageId_idx" ON "notification_message"("providerMessageId");

-- AddForeignKey
ALTER TABLE "notification_template" ADD CONSTRAINT "notification_template_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_message" ADD CONSTRAINT "notification_message_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_message" ADD CONSTRAINT "notification_message_filmId_fkey" FOREIGN KEY ("filmId") REFERENCES "film"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_message" ADD CONSTRAINT "notification_message_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "notification_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_message" ADD CONSTRAINT "notification_message_recipientPersonId_fkey" FOREIGN KEY ("recipientPersonId") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
