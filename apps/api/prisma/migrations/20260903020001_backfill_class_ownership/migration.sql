-- Story 13.4 — Time-Bounded Class Ownership (Epic 13 AD, expand→backfill,
-- mirroring 13.1/13.2/13.3's shape). This is the backfill step: seed one
-- open ClassOwnership row per class that already has a teacher, so
-- lib/temporal/classOwnership.ts's resolver has ownership history from day
-- one. `fromDate` is the class's own `createdAt` -- the earliest point at
-- which that class (and therefore its ownership) could have existed.
--
-- No heuristic fallback: any class with a teacher that doesn't end up with
-- exactly one open ClassOwnership row after the insert below halts the
-- whole migration and lists the offending class ids (mirrors 13.1's/13.3's
-- halt-and-report convention). A class with no teacher (`teacherId IS NULL`)
-- deliberately gets no row.

-- 1. Backfill — one open row per class with a non-null teacherId.
INSERT INTO "ClassOwnership" ("classId", "teacherId", "fromDate", "toDate", "createdAt", "updatedAt")
SELECT c."id", c."teacherId", c."createdAt", NULL, NOW(), NOW()
FROM "Class" c
WHERE c."teacherId" IS NOT NULL;

-- 2. Halt on any unresolved row — parity assertion against Class.teacherId.
DO $$
DECLARE
  unresolved TEXT;
  unresolved_count INTEGER;
BEGIN
  SELECT count(*),
         string_agg(format('  id=%s teacherId=%s', c."id", c."teacherId"), E'\n' ORDER BY c."id")
    INTO unresolved_count, unresolved
    FROM "Class" c
   WHERE c."teacherId" IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM "ClassOwnership" co
        WHERE co."classId" = c."id"
          AND co."teacherId" = c."teacherId"
          AND co."toDate" IS NULL
     );

  IF unresolved_count > 0 THEN
    RAISE EXCEPTION E'Story 13.4 backfill aborted: % class row(s) with a teacher could not be resolved to an open ClassOwnership row.\n%\nFix these rows by hand, then re-run the migration. No rows were changed.',
      unresolved_count, unresolved;
  END IF;
END $$;
