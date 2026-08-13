-- CreateTable
CREATE TABLE "llm_provider" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "zeroRetention" BOOLEAN NOT NULL DEFAULT false,
    "allowedFor" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_request_log" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "filmId" TEXT,
    "requestedByUserId" TEXT,
    "moduleKey" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "responseHash" TEXT,
    "tokenCountIn" INTEGER,
    "tokenCountOut" INTEGER,
    "zeroRetentionUsed" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL,
    "failedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_request_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "llm_provider_key_key" ON "llm_provider"("key");

-- CreateIndex
CREATE INDEX "llm_request_log_orgId_createdAt_idx" ON "llm_request_log"("orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "llm_request_log" ADD CONSTRAINT "llm_request_log_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_request_log" ADD CONSTRAINT "llm_request_log_filmId_fkey" FOREIGN KEY ("filmId") REFERENCES "film"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_request_log" ADD CONSTRAINT "llm_request_log_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
