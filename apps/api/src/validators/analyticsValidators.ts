import { z } from 'zod';
import { POSTGRES_INT4_MAX } from './materialValidators.js';

export { POSTGRES_INT4_MAX };

/**
 * Express 5 types `req.params[k]` as `string | string[] | undefined`.
 *
 * Deliberately stricter than the `parseInt` + `isNaN` idiom used elsewhere in
 * this codebase: `parseInt` prefix-parses, so `"5.9"`, `"5abc"` and `"1e5"` all
 * yield a valid-looking id and would aggregate over a real but *different*
 * class. Requiring the whole string to be digits removes that entirely.
 *
 * Values above int4 do not come back as a missing row — they throw inside the
 * Prisma connector with no `code`, surfacing as a 500 instead of a 400.
 *
 * Mirrors `parseId` in modules/activities/activities.controller.ts.
 */
export function parseId(raw: unknown): number | null {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1 || id > POSTGRES_INT4_MAX) return null;
  return id;
}

/**
 * Query-string values arrive as strings, and repeated keys arrive as arrays.
 * `z.coerce.number()` alone would turn `''` into `0` and `'5abc'` into `NaN`,
 * so the raw string is shape-checked with a digits-only regex first — the same
 * approach as `materialValidators`'s `optionalNumericId`.
 *
 * (Story task 3.2 prescribed `z.coerce.number().int()`. It is not used, for the
 * reason above — the story's own Known Defect Patterns section argues against
 * loose coercion, and `z.coerce.number()` would silently accept `''` as `0`.)
 */
const optionalNumericQuery = (label: string) =>
  z
    .string()
    .optional()
    .transform((val) => (val === undefined || val === '' ? undefined : val))
    .refine((val) => val === undefined || /^\d+$/.test(val), `${label} must be a whole number`)
    .transform((val) => (val === undefined ? undefined : parseInt(val, 10)))
    .refine(
      (val) => val === undefined || (val >= 1 && val <= POSTGRES_INT4_MAX),
      `${label} is out of range`
    );

/** Matches the bounds already used by marks.controller's my-marks year filter. */
const optionalYearQuery = z
  .string()
  .optional()
  .transform((val) => (val === undefined || val === '' ? undefined : val))
  .refine((val) => val === undefined || /^\d{4}$/.test(val), 'year must be a 4-digit year')
  .transform((val) => (val === undefined ? undefined : parseInt(val, 10)))
  .refine(
    (val) => val === undefined || (val >= 2000 && val <= 2100),
    'year must be between 2000 and 2100'
  );

/** Terms are 1..3 school-wide — the same bound marks.controller enforces on import. */
const optionalTermQuery = z
  .string()
  .optional()
  .transform((val) => (val === undefined || val === '' ? undefined : val))
  .refine((val) => val === undefined || /^\d$/.test(val), 'term must be a single digit')
  .transform((val) => (val === undefined ? undefined : parseInt(val, 10)))
  .refine((val) => val === undefined || (val >= 1 && val <= 3), 'term must be between 1 and 3');

/**
 * `.strict()` so an unrecognised filter is a 400 rather than being silently
 * ignored — a caller asking for `?grade=10` must not receive unfiltered
 * school-wide data that looks like it was filtered. There is no `grade` column
 * on `Class`; per the Story 10.1 review decision, per-class is the supported
 * granularity and Story 10.2's scope is pinned to match.
 *
 * Consequence to be aware of on the client: any unknown key (including a
 * cache-buster such as `?_=1699…`) is a 400, by design.
 */
export const schoolAnalyticsQuerySchema = z
  .object({
    classId: optionalNumericQuery('classId'),
    year: optionalYearQuery,
  })
  .strict();

export type SchoolAnalyticsQuery = z.infer<typeof schoolAnalyticsQuerySchema>;

/**
 * `GET /api/analytics/class/:classId` filters.
 *
 * `TermMark` has no `classId`, so a class average is scoped through *current*
 * enrollment and otherwise spans every year the student has marks for. These
 * filters are what let a caller pin the report to one year/term and get a
 * reproducible number. See the Story 10.1 review decision on class scope.
 */
export const classAnalyticsQuerySchema = z
  .object({
    year: optionalYearQuery,
    term: optionalTermQuery,
  })
  .strict();

export type ClassAnalyticsQuery = z.infer<typeof classAnalyticsQuerySchema>;
