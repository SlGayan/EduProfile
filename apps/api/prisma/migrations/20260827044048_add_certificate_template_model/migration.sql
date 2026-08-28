-- CreateTable
CREATE TABLE "CertificateTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "layoutData" JSONB NOT NULL,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificateTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CertificateTemplate_createdById_idx" ON "CertificateTemplate"("createdById");

-- AddForeignKey
ALTER TABLE "CertificateTemplate" ADD CONSTRAINT "CertificateTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
