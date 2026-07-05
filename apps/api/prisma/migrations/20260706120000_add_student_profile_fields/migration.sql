-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "fullName" TEXT NOT NULL,
ADD COLUMN     "indexNumber" TEXT NOT NULL,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "address" TEXT NOT NULL,
ADD COLUMN     "nicNumber" TEXT,
ADD COLUMN     "olYear" INTEGER,
ADD COLUMN     "alYear" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Student_indexNumber_key" ON "Student"("indexNumber");
