ALTER TYPE "NotificationType" ADD VALUE 'NEW_COURSE';
ALTER TYPE "NotificationType" ADD VALUE 'PASSWORD_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE 'COURSE_REMINDER';
ALTER TABLE "notifications" ADD COLUMN "eventKey" TEXT;
CREATE UNIQUE INDEX "notifications_eventKey_key" ON "notifications"("eventKey");
