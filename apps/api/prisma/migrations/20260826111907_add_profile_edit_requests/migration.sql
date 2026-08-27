-- CreateEnum
CREATE TYPE "ProfileRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "phoneNumber" TEXT;

-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN     "address" TEXT,
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "phoneNumber" TEXT;

-- CreateTable
CREATE TABLE "ProfileEditRequest" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "requestedPhoneNumber" TEXT,
    "requestedAddress" TEXT,
    "status" "ProfileRequestStatus" NOT NULL DEFAULT 'PENDING',
    "teacherNote" TEXT,
    "reviewedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileEditRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfileEditRequest_studentId_idx" ON "ProfileEditRequest"("studentId");

-- CreateIndex
CREATE INDEX "ProfileEditRequest_reviewedById_idx" ON "ProfileEditRequest"("reviewedById");

-- AddForeignKey
ALTER TABLE "ProfileEditRequest" ADD CONSTRAINT "ProfileEditRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileEditRequest" ADD CONSTRAINT "ProfileEditRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
