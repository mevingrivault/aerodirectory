-- AlterTable
ALTER TABLE "users" ADD COLUMN     "homeAerodromeId" TEXT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_homeAerodromeId_fkey" FOREIGN KEY ("homeAerodromeId") REFERENCES "aerodromes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
