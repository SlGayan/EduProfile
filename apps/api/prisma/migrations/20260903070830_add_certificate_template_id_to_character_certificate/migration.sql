-- AlterTable
ALTER TABLE "CharacterCertificate" ADD COLUMN     "templateId" INTEGER;

-- CreateIndex
CREATE INDEX "CharacterCertificate_templateId_idx" ON "CharacterCertificate"("templateId");

-- AddForeignKey
ALTER TABLE "CharacterCertificate" ADD CONSTRAINT "CharacterCertificate_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CertificateTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
