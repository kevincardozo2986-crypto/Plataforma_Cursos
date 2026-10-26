-- CreateTable
CREATE TABLE "course_files" (
    "id" SERIAL NOT NULL,
    "storedName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "courseId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "course_files_storedName_key" ON "course_files"("storedName");

-- CreateIndex
CREATE INDEX "course_files_courseId_position_idx" ON "course_files"("courseId", "position");

-- AddForeignKey
ALTER TABLE "course_files" ADD CONSTRAINT "course_files_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
