-- CreateEnum
CREATE TYPE "DripType" AS ENUM ('NONE', 'BY_DATE', 'AFTER_DAYS', 'SEQUENTIAL', 'PREREQUISITES');

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "dripType" "DripType" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "modules" ADD COLUMN     "unlockAfterDays" INTEGER,
ADD COLUMN     "unlockAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "module_prerequisites" (
    "moduleId" INTEGER NOT NULL,
    "requiredModuleId" INTEGER NOT NULL,

    CONSTRAINT "module_prerequisites_pkey" PRIMARY KEY ("moduleId","requiredModuleId")
);

-- AddForeignKey
ALTER TABLE "module_prerequisites" ADD CONSTRAINT "module_prerequisites_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_prerequisites" ADD CONSTRAINT "module_prerequisites_requiredModuleId_fkey" FOREIGN KEY ("requiredModuleId") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
