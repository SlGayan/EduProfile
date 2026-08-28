-- Story 13.1 — Structured Class Identity (Epic 13 AD-8, AD-9)
--
-- Replaces the free-text `Class.name` with the structured identity triple
-- (gradeLevel, section, year).
--
-- AD-8: the backfill parses existing names deterministically. Anything it
-- cannot resolve — an unparseable name, a missing year, or two names that
-- collapse onto the same identity — raises, which rolls the whole migration
-- back (Prisma runs each PostgreSQL migration file in a single transaction).
-- There is deliberately NO heuristic fallback and NO nearest-match: a failed
-- migration that needs manual data cleanup is the correct outcome.

-- 1. Expand — add the identity columns, nullable for the duration of the backfill.
ALTER TABLE "Class" ADD COLUMN "gradeLevel" INTEGER;
ALTER TABLE "Class" ADD COLUMN "section" TEXT;

-- 2. Backfill — strict, anchored parse of `Grade {1-13}-{section}` only.
--    The section must be a single alphanumeric token: anything else (a trailing
--    annotation such as " (Test)", extra words, punctuation) is NOT
--    deterministically resolvable and is left NULL for step 3 to report.
UPDATE "Class"
SET "gradeLevel" = (substring("name" from '^Grade[[:space:]]+(1[0-3]|[1-9])-[A-Za-z0-9]+$'))::INTEGER,
    "section"    = substring("name" from '^Grade[[:space:]]+(?:1[0-3]|[1-9])-([A-Za-z0-9]+)$')
WHERE "name" ~ '^Grade[[:space:]]+(1[0-3]|[1-9])-[A-Za-z0-9]+$';

-- 3. Halt on ambiguity — report every row the parse could not resolve.
DO $$
DECLARE
  unresolved TEXT;
  unresolved_count INTEGER;
BEGIN
  SELECT count(*),
         string_agg(format('  id=%s name=%L year=%s', "id", "name", coalesce("year"::text, 'NULL')), E'\n' ORDER BY "id")
    INTO unresolved_count, unresolved
    FROM "Class"
   WHERE "gradeLevel" IS NULL OR "section" IS NULL OR "year" IS NULL;

  IF unresolved_count > 0 THEN
    RAISE EXCEPTION E'Story 13.1 backfill aborted: % class row(s) could not be resolved to (gradeLevel, section, year).\n%\nExpected name format "Grade {1-13}-{section}" with a non-empty alphanumeric section, and a non-null year. Fix these rows by hand, then re-run the migration. No rows were changed.',
      unresolved_count, unresolved;
  END IF;
END $$;

-- 4. Halt on collision — two distinct names that parse to the same identity.
DO $$
DECLARE
  collisions TEXT;
  collision_count INTEGER;
BEGIN
  SELECT count(*),
         string_agg(format('  (gradeLevel=%s, section=%L, year=%s) <- %s', "gradeLevel", "section", "year", names), E'\n')
    INTO collision_count, collisions
    FROM (
      SELECT "gradeLevel", "section", "year",
             string_agg(format('id=%s name=%L', "id", "name"), ', ' ORDER BY "id") AS names
        FROM "Class"
       GROUP BY "gradeLevel", "section", "year"
      HAVING count(*) > 1
    ) AS dupes;

  IF collision_count > 0 THEN
    RAISE EXCEPTION E'Story 13.1 backfill aborted: % identity collision(s) — distinct class rows parsed to the same (gradeLevel, section, year).\n%\nGive the duplicates distinct sections by hand, then re-run the migration. No rows were changed.',
      collision_count, collisions;
  END IF;
END $$;

-- 5. Contract — enforce the structure and drop the stored name (AD-9).
ALTER TABLE "Class" ALTER COLUMN "gradeLevel" SET NOT NULL;
ALTER TABLE "Class" ALTER COLUMN "section" SET NOT NULL;
ALTER TABLE "Class" ALTER COLUMN "year" SET NOT NULL;
ALTER TABLE "Class" DROP COLUMN "name";

CREATE UNIQUE INDEX "Class_gradeLevel_section_year_key" ON "Class"("gradeLevel", "section", "year");
