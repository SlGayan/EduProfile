-- Story 13.3 — Anchor Term Marks to the Enrollment They Were Earned In
-- (Epic 13 AD, expand→backfill→halt→contract, mirroring 13.1's shape).
--
-- Backfill: match each TermMark to the one Enrollment where the enrolled
-- student is the mark's student and the enrollment's class year equals the
-- mark's year. There is deliberately NO heuristic fallback and NO
-- nearest-match: a TermMark with zero or multiple candidate enrollments
-- halts the whole migration (rolls back, per the 13.1 precedent) and must
-- be resolved by hand before re-running.

-- 2. Backfill — only touches rows with exactly one matching Enrollment.
UPDATE "TermMark" tm
SET "enrollmentId" = matched."enrollmentId"
FROM (
  SELECT candidates."termMarkId", candidates."enrollmentId"
  FROM (
    SELECT tm2.id AS "termMarkId",
           e.id AS "enrollmentId",
           COUNT(*) OVER (PARTITION BY tm2.id) AS candidate_count
    FROM "TermMark" tm2
    JOIN "Enrollment" e ON e."studentId" = tm2."studentId"
    JOIN "Class" c ON c.id = e."classId" AND c."year" = tm2."year"
  ) candidates
  WHERE candidates.candidate_count = 1
) AS matched
WHERE tm.id = matched."termMarkId";

-- 3. Halt on ambiguity/absence — report every unresolved row by id, along
--    with how many candidate enrollments it actually had (0 or 2+).
DO $$
DECLARE
  unresolved TEXT;
  unresolved_count INTEGER;
BEGIN
  SELECT count(*),
         string_agg(
           format('  id=%s studentId=%s year=%s candidateEnrollments=%s',
             tm.id, tm."studentId", tm."year",
             (SELECT count(*)
                FROM "Enrollment" e
                JOIN "Class" c ON c.id = e."classId"
               WHERE e."studentId" = tm."studentId" AND c."year" = tm."year")
           ), E'\n' ORDER BY tm.id
         )
    INTO unresolved_count, unresolved
    FROM "TermMark" tm
   WHERE tm."enrollmentId" IS NULL;

  IF unresolved_count > 0 THEN
    RAISE EXCEPTION E'Story 13.3 backfill aborted: % TermMark row(s) could not be resolved to exactly one Enrollment matching (studentId, year).\n%\nEach row needs exactly one Enrollment for its student in that year. Fix the data by hand (add the missing Enrollment, or remove/merge the duplicate), then re-run the migration. No rows were changed.',
      unresolved_count, unresolved;
  END IF;
END $$;

-- 4. Contract — enforce NOT NULL and add the enrollment-anchored unique
--    index. The original (studentId, subjectId, term, year) unique index
--    (TermMark_studentId_subjectId_term_year_key, created in migration
--    20260706070917_add_subject_and_term_mark) is intentionally NOT
--    dropped: it is the natural-key guard against two different same-year
--    enrollments (e.g. either side of a mid-year transfer) each holding a
--    mark for the same student/subject/term/year, a case the new
--    enrollment-anchored key alone would permit. See schema.prisma's
--    `TermMark_natural_key_guard` for the Prisma-side declaration.
ALTER TABLE "TermMark" ALTER COLUMN "enrollmentId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "TermMark_enrollmentId_subjectId_term_key" ON "TermMark"("enrollmentId", "subjectId", "term");
