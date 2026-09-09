-- Story 13.4 — Time-Bounded Class Ownership (Epic 13 AD, expand→backfill,
-- mirroring 13.1/13.2/13.3's shape). This is the expand step: add the
-- ClassOwnership table. `Class.teacherId` is left untouched and remains the
-- live, write-authoritative column -- only reads move to this table's
-- resolver (apps/api/src/lib/temporal/classOwnership.ts).

-- CreateTable
CREATE TABLE "ClassOwnership" (
    "id" SERIAL NOT NULL,
    "classId" INTEGER NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassOwnership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassOwnership_classId_idx" ON "ClassOwnership"("classId");

-- CreateIndex
CREATE INDEX "ClassOwnership_teacherId_idx" ON "ClassOwnership"("teacherId");

-- AddForeignKey
ALTER TABLE "ClassOwnership" ADD CONSTRAINT "ClassOwnership_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassOwnership" ADD CONSTRAINT "ClassOwnership_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
