-- CreateEnum
CREATE TYPE "CertificateFont" AS ENUM ('SANS', 'SERIF');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CertificateLayout" ADD VALUE 'ELEGANT';
ALTER TYPE "CertificateLayout" ADD VALUE 'BOLD';
ALTER TYPE "CertificateLayout" ADD VALUE 'MINIMAL';
ALTER TYPE "CertificateLayout" ADD VALUE 'SEAL';
ALTER TYPE "CertificateLayout" ADD VALUE 'GEOMETRIC';
ALTER TYPE "CertificateLayout" ADD VALUE 'SIDEBAR';
ALTER TYPE "CertificateLayout" ADD VALUE 'FRAME';
ALTER TYPE "CertificateLayout" ADD VALUE 'DARK';
ALTER TYPE "CertificateLayout" ADD VALUE 'WAVES';
ALTER TYPE "CertificateLayout" ADD VALUE 'RIBBON';

-- AlterTable
ALTER TABLE "certificate_templates" ADD COLUMN     "font" "CertificateFont" NOT NULL DEFAULT 'SANS';
