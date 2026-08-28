-- CreateEnum
CREATE TYPE "StudentCertificateStatus" AS ENUM ('PENDING', 'APPROVED', 'NEEDS_CORRECTION', 'REJECTED');

-- CreateTable
CREATE TABLE "StudentCertificate" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "issuingOrganization" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "evidenceUrl" TEXT,
    "fileUrl" TEXT,
    "fileType" TEXT,
    "status" "StudentCertificateStatus" NOT NULL DEFAULT 'PENDING',
    "teacherNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentCertificate_studentId_idx" ON "StudentCertificate"("studentId");

-- AddForeignKey
ALTER TABLE "StudentCertificate" ADD CONSTRAINT "StudentCertificate_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

