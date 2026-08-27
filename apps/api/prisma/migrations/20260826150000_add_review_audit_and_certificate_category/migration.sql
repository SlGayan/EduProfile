-- AlterTable
ALTER TABLE "ExtracurricularActivity" ADD COLUMN     "reviewedById" INTEGER,
ADD COLUMN     "reviewedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StudentCertificate" ADD COLUMN     "category" TEXT,
ADD COLUMN     "reviewedById" INTEGER,
ADD COLUMN     "reviewedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "ExtracurricularActivity" ADD CONSTRAINT "ExtracurricularActivity_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCertificate" ADD CONSTRAINT "StudentCertificate_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
