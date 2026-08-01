-- CreateTable
CREATE TABLE "ExtracurricularActivity" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "activityName" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "achievements" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtracurricularActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExtracurricularActivity_studentId_idx" ON "ExtracurricularActivity"("studentId");

-- AddForeignKey
ALTER TABLE "ExtracurricularActivity" ADD CONSTRAINT "ExtracurricularActivity_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
