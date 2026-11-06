-- CreateEnum
CREATE TYPE "PokStatus" AS ENUM ('NONE', 'PENDING', 'EMITTED', 'ACCEPTED', 'FAILED');

-- AlterTable
ALTER TABLE "certificates" ADD COLUMN     "pokCredentialId" TEXT,
ADD COLUMN     "pokError" TEXT,
ADD COLUMN     "pokState" TEXT,
ADD COLUMN     "pokStatus" "PokStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "pokSyncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "certificates_pokCredentialId_key" ON "certificates"("pokCredentialId");
