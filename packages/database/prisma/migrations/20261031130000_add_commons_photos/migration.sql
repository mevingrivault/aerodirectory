-- Main photo of each aerodrome, copied from Wikimedia Commons with its credit.
CREATE TABLE "public"."commons_photos" (
    "id" TEXT NOT NULL,
    "aerodromeId" TEXT NOT NULL,
    "wikidataId" TEXT NOT NULL,
    "fileTitle" TEXT NOT NULL,
    "pageUrl" TEXT NOT NULL,
    "sourceSha1" TEXT NOT NULL,
    "author" TEXT,
    "license" TEXT NOT NULL,
    "licenseUrl" TEXT,
    "storedKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commons_photos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "commons_photos_aerodromeId_key" ON "public"."commons_photos"("aerodromeId");

ALTER TABLE "public"."commons_photos" ADD CONSTRAINT "commons_photos_aerodromeId_fkey" FOREIGN KEY ("aerodromeId") REFERENCES "public"."aerodromes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
