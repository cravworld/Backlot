-- CreateTable
CREATE TABLE "film_settings" (
    "id" TEXT NOT NULL,
    "filmId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "film_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "film_settings_filmId_key_key" ON "film_settings"("filmId", "key");

-- AddForeignKey
ALTER TABLE "film_settings" ADD CONSTRAINT "film_settings_filmId_fkey" FOREIGN KEY ("filmId") REFERENCES "film"("id") ON DELETE CASCADE ON UPDATE CASCADE;
