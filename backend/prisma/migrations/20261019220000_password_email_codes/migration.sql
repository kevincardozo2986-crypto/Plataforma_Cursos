ALTER TABLE "users"
ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "passwordResetHash" TEXT,
ADD COLUMN "passwordResetExpiresAt" TIMESTAMP(3),
ADD COLUMN "passwordResetRequestedAt" TIMESTAMP(3),
ADD COLUMN "passwordResetAttempts" INTEGER NOT NULL DEFAULT 0;
