CREATE TABLE "video_watch_progress" (
  "id" SERIAL PRIMARY KEY,
  "enrollmentId" INTEGER NOT NULL REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "lessonId" INTEGER NOT NULL REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "source" TEXT NOT NULL,
  "duration" DOUBLE PRECISION NOT NULL,
  "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "playing" BOOLEAN NOT NULL DEFAULT false,
  "ranges" JSONB NOT NULL DEFAULT '[]',
  "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "video_watch_progress_enrollmentId_lessonId_key" ON "video_watch_progress"("enrollmentId", "lessonId");
