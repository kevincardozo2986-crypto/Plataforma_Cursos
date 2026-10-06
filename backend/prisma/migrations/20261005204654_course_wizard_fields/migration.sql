-- CreateEnum
CREATE TYPE "CourseVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'PASSWORD');

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "accessPassword" TEXT,
ADD COLUMN     "audience" TEXT,
ADD COLUMN     "durationMinutes" INTEGER,
ADD COLUMN     "introVideoUrl" TEXT,
ADD COLUMN     "materials" TEXT,
ADD COLUMN     "maxStudents" INTEGER,
ADD COLUMN     "publicContent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "qaEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "requirements" TEXT,
ADD COLUMN     "visibility" "CourseVisibility" NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN     "whatYouWillLearn" TEXT;

-- CreateTable
CREATE TABLE "course_prerequisites" (
    "courseId" INTEGER NOT NULL,
    "prerequisiteId" INTEGER NOT NULL,

    CONSTRAINT "course_prerequisites_pkey" PRIMARY KEY ("courseId","prerequisiteId")
);

-- AddForeignKey
ALTER TABLE "course_prerequisites" ADD CONSTRAINT "course_prerequisites_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_prerequisites" ADD CONSTRAINT "course_prerequisites_prerequisiteId_fkey" FOREIGN KEY ("prerequisiteId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
