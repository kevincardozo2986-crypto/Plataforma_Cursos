-- AlterEnum
ALTER TYPE "CertificateLayout" ADD VALUE 'IMAGE';

-- AlterTable
ALTER TABLE "certificate_templates" ADD COLUMN     "backgroundUrl" TEXT;
