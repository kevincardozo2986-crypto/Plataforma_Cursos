-- CreateEnum
CREATE TYPE "CertificateProvider" AS ENUM ('PLATFORM', 'POK');

-- AlterTable
ALTER TABLE "certificates" ADD COLUMN     "pokTemplateId" TEXT,
ADD COLUMN     "provider" "CertificateProvider" NOT NULL DEFAULT 'PLATFORM';
