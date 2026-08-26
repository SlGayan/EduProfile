-- CreateTable
CREATE TABLE "TeacherSubjectAssignment" (
    "id" SERIAL NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherSubjectAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeacherSubjectAssignment_teacherId_idx" ON "TeacherSubjectAssignment"("teacherId");

-- CreateIndex
CREATE INDEX "TeacherSubjectAssignment_subjectId_idx" ON "TeacherSubjectAssignment"("subjectId");

-- CreateIndex
CREATE INDEX "TeacherSubjectAssignment_classId_idx" ON "TeacherSubjectAssignment"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherSubjectAssignment_teacherId_subjectId_classId_key" ON "TeacherSubjectAssignment"("teacherId", "subjectId", "classId");

-- AddForeignKey
ALTER TABLE "TeacherSubjectAssignment" ADD CONSTRAINT "TeacherSubjectAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherSubjectAssignment" ADD CONSTRAINT "TeacherSubjectAssignment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherSubjectAssignment" ADD CONSTRAINT "TeacherSubjectAssignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
