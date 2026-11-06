-- CreateTable
CREATE TABLE "pok_course_templates" (
    "courseId" INTEGER NOT NULL,
    "pokTemplateId" TEXT NOT NULL,
    "pokTemplateName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pok_course_templates_pkey" PRIMARY KEY ("courseId")
);

-- AddForeignKey
ALTER TABLE "pok_course_templates" ADD CONSTRAINT "pok_course_templates_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
