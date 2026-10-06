-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('TRUE_FALSE', 'SINGLE', 'MULTIPLE', 'FILL_BLANK');

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "type" "QuestionType" NOT NULL DEFAULT 'SINGLE';
