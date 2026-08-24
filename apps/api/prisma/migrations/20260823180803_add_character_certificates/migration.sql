-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('PENDING', 'APPROVED', 'NEEDS_CORRECTION', 'REJECTED');

-- CreateEnum
CREATE TYPE "CharacterGrade" AS ENUM ('GOOD', 'VERY_GOOD', 'EXCELLENT');

-- AlterTable
ALTER TABLE "ExtracurricularActivity" ADD COLUMN     "evidenceUrl" TEXT,
ADD COLUMN     "status" "ActivityStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "teacherNote" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "admissionGrade" TEXT,
ADD COLUMN     "admissionNumber" TEXT,
ADD COLUMN     "attendancePercentage" DOUBLE PRECISION,
ADD COLUMN     "dateOfAdmission" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CharacterCertificate" (
    "id" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "principalId" INTEGER NOT NULL,
    "selectedActivities" TEXT[],
    "reasonForLeaving" TEXT,
    "characterGrade" "CharacterGrade",
    "studentAttributes" TEXT,
    "academicSummary" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contentSnapshot" JSONB NOT NULL,

    CONSTRAINT "CharacterCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CharacterCertificate_studentId_idx" ON "CharacterCertificate"("studentId");

-- CreateIndex
CREATE INDEX "CharacterCertificate_principalId_idx" ON "CharacterCertificate"("principalId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_admissionNumber_key" ON "Student"("admissionNumber");

-- AddForeignKey
ALTER TABLE "CharacterCertificate" ADD CONSTRAINT "CharacterCertificate_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterCertificate" ADD CONSTRAINT "CharacterCertificate_principalId_fkey" FOREIGN KEY ("principalId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

