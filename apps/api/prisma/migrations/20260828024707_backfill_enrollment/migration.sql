-- Story 13.2 - AD-1 Phase 2: copy _ClassToStudent rows into Enrollment.
--
-- Copies every _ClassToStudent row into Enrollment with:
--   enrolledAt = Jan 1 of the class year (AD-10: when membership began)
--   leftAt     = NULL  (currently open)
--   status     = ACTIVE
-- Asserts exact row parity after copy; any discrepancy rolls back (AD-8).
-- Reversible before Phase 3: DELETE FROM "Enrollment"; undoes this.

DO $$
DECLARE
  v_source_count    BIGINT;
  v_dest_count      BIGINT;
  v_null_year_count BIGINT;
BEGIN
  -- Guard: abort if any class referenced by _ClassToStudent has NULL year.
  SELECT COUNT(*) INTO v_null_year_count
  FROM   "_ClassToStudent" cs
  JOIN   "Class" c ON c.id = cs."B"
  WHERE  c.year IS NULL;

  IF v_null_year_count > 0 THEN
    RAISE EXCEPTION
      'Backfill aborted: % row(s) reference a class with NULL year.',
      v_null_year_count;
  END IF;

  -- Copy rows. _ClassToStudent Prisma convention: "A"=classId, "B"=studentId.
  INSERT INTO "Enrollment" ("studentId", "classId", "enrolledAt", "leftAt", "status", "createdAt", "updatedAt")
  SELECT
    cs."B"                             AS "studentId",
    cs."A"                             AS "classId",
    make_date(c.year, 1, 1)::TIMESTAMP  AS "enrolledAt",
    NULL                                AS "leftAt",
    'ACTIVE'::"EnrollmentStatus"        AS "status",
    NOW()                               AS "createdAt",
    NOW()                               AS "updatedAt"
  FROM   "_ClassToStudent" cs
  JOIN   "Class" c ON c.id = cs."A"
  ON CONFLICT ("studentId", "classId", "enrolledAt") DO NOTHING;

  -- Parity assertion (AD-8): counts must match exactly.
  SELECT COUNT(*) INTO v_source_count FROM "_ClassToStudent";
  SELECT COUNT(*) INTO v_dest_count   FROM "Enrollment";

  IF v_dest_count <> v_source_count THEN
    RAISE EXCEPTION
      'Parity FAILED: _ClassToStudent=% Enrollment=%. Rolling back.',
      v_source_count, v_dest_count;
  END IF;

  RAISE NOTICE 'Backfill complete: % rows copied and verified.', v_dest_count;
END $$;
