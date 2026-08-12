-- CreateTable
CREATE TABLE "person" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "preferredName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "whatsappNumber" TEXT,
    "languages" TEXT[],
    "isMinor" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_film_role" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "filmId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "department" TEXT,
    "contactChannelPref" TEXT,
    "languagePref" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_film_role_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "person_userId_key" ON "person"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "person_film_role_personId_filmId_roleId_key" ON "person_film_role"("personId", "filmId", "roleId");

-- AddForeignKey
ALTER TABLE "person" ADD CONSTRAINT "person_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person" ADD CONSTRAINT "person_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_film_role" ADD CONSTRAINT "person_film_role_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_film_role" ADD CONSTRAINT "person_film_role_filmId_fkey" FOREIGN KEY ("filmId") REFERENCES "film"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_film_role" ADD CONSTRAINT "person_film_role_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
