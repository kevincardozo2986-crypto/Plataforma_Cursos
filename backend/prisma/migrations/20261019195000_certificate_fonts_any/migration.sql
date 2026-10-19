-- La tipografía pasa de un enum (SANS o SERIF) a un texto: la clave de una tipografía de la
-- biblioteca ("playfair-display"), "SANS", "SERIF" o "custom:<id>" (una que subió el docente).
-- Los valores que ya existían se conservan.
ALTER TABLE "certificate_templates"
  ALTER COLUMN "font" DROP DEFAULT,
  ALTER COLUMN "font" TYPE TEXT USING "font"::text,
  ALTER COLUMN "font" SET DEFAULT 'SANS',
  ADD COLUMN "bodyFont" TEXT NOT NULL DEFAULT 'SANS';

-- Hasta ahora una sola tipografía servía para todo: el texto conserva la que ya tenía la plantilla.
UPDATE "certificate_templates" SET "bodyFont" = "font";

-- DropEnum
DROP TYPE "CertificateFont";

-- CreateTable
CREATE TABLE "certificate_custom_fonts" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificate_custom_fonts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "certificate_custom_fonts_fileName_key" ON "certificate_custom_fonts"("fileName");

-- CreateIndex
CREATE INDEX "certificate_custom_fonts_ownerId_idx" ON "certificate_custom_fonts"("ownerId");

-- AddForeignKey
ALTER TABLE "certificate_custom_fonts" ADD CONSTRAINT "certificate_custom_fonts_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
