-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "attachments" JSONB NOT NULL DEFAULT '[]';
