-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('GRADED', 'PENDING_REVIEW');

-- AlterEnum
ALTER TYPE "QuestionType" ADD VALUE 'ESSAY';

-- AlterTable
ALTER TABLE "evaluation_attempts" ADD COLUMN     "feedback" TEXT,
ADD COLUMN     "gradedAt" TIMESTAMP(3),
ADD COLUMN     "gradedById" INTEGER,
ADD COLUMN     "results" JSONB,
ADD COLUMN     "status" "AttemptStatus" NOT NULL DEFAULT 'GRADED';

-- CreateIndex
CREATE INDEX "evaluation_attempts_status_idx" ON "evaluation_attempts"("status");
