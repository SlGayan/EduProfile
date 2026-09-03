-- Story 13.3 — Anchor Term Marks to the Enrollment They Were Earned In
-- (Epic 13 AD, expand→backfill→halt→contract, mirroring 13.1's shape).
--
-- 1. Expand — add the anchor column, nullable for the duration of the
--    backfill in the next migration. The original
--    (studentId, subjectId, term, year) unique index is left untouched.

ALTER TABLE "TermMark" ADD COLUMN "enrollmentId" INTEGER;

-- CreateIndex
CREATE INDEX "TermMark_enrollmentId_idx" ON "TermMark"("enrollmentId");

-- AddForeignKey
ALTER TABLE "TermMark" ADD CONSTRAINT "TermMark_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
