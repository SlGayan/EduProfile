import { z } from 'zod';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Dates arrive as strings over JSON and are accepted only as `YYYY-MM-DD`.
 *
 * A bare `Date.parse` refinement is not a validator: it accepts `"5"`,
 * `"2026"`, and `"2026-02-30"`, silently rewriting them to real but wrong
 * dates. Anchoring the format and then round-tripping through `Date.UTC`
 * rejects impossible calendar days instead of rolling them over.
 *
 * Restricting to the date-only ISO form also pins the timezone: ECMAScript
 * parses `YYYY-MM-DD` as UTC midnight, while `"2026-1-15"` or
 * `"2026-01-15T00:00:00"` parse as *local* midnight — which would shift the
 * stored day depending on the server's TZ.
 */
function isCalendarDate(value: string): boolean {
  if (!DATE_ONLY.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function dateString(label: string) {
  return z
    .string()
    .trim()
    .refine(isCalendarDate, `${label} must be a valid date in YYYY-MM-DD format`);
}

/**
 * Free-text fields that may legitimately be absent. Empty and whitespace-only
 * input collapses to `undefined` so it is stored as NULL rather than `""`,
 * matching `optionalTrimmedString` in studentValidators.ts — consumers check
 * for null to render the empty state.
 */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .optional()
    .transform((val) => (val === undefined || val === '' ? undefined : val));
}

/**
 * `activityName` reuses the 255-char ceiling from `optionalTrimmedString`;
 * `activityType` is held tighter at 100. `description` and `achievements` are
 * the deliberate exception at 2000 — they are free-text notes.
 *
 * `activityType` stays free text: no enum is defined in the PRD or the
 * architecture docs, and inventing one here would create a contract the
 * Story 8.3 UI has nothing to build against.
 */
const activityFields = {
  activityName: z
    .string()
    .trim()
    .min(1, 'activityName is required')
    .max(255, 'Must be 255 characters or fewer'),
  activityType: z
    .string()
    .trim()
    .min(1, 'activityType is required')
    .max(100, 'Must be 100 characters or fewer'),
  description: optionalText(2000),
  startDate: dateString('startDate'),
  endDate: dateString('endDate').optional(),
  achievements: optionalText(2000),
  evidenceUrl: optionalText(2000),
};

// Built fresh per use — Zod's refine options type requires a mutable `path`.
function endBeforeStart() {
  return { message: 'endDate must be on or after startDate', path: ['endDate'] };
}

export const createActivitySchema = z
  .object(activityFields)
  .strict()
  .refine(
    (data) => data.endDate === undefined || Date.parse(data.endDate) >= Date.parse(data.startDate),
    endBeforeStart()
  );

/**
 * Update accepts a partial payload. The date-order rule can only be fully
 * checked once the payload is merged with the stored row (a request may send
 * only `endDate`), so `updateActivity` re-checks the merged pair via
 * `mergedActivityDatesSchema`. This refinement still catches the
 * both-dates-supplied case early.
 */
export const updateActivitySchema = z
  .object(activityFields)
  .partial()
  .strict()
  .refine(
    (data) =>
      data.startDate === undefined ||
      data.endDate === undefined ||
      Date.parse(data.endDate) >= Date.parse(data.startDate),
    endBeforeStart()
  )
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

/**
 * Validates the post-merge date pair for a partial update, so the resulting
 * 400 carries genuine `error.issues` rather than a hand-built lookalike —
 * every other 400 in this codebase returns real Zod issues.
 */
export const mergedActivityDatesSchema = z
  .object({ startDate: z.date(), endDate: z.date().nullable() })
  .refine(
    (data) => data.endDate === null || data.endDate.getTime() >= data.startDate.getTime(),
    endBeforeStart()
  );

export type CreateActivityInput = z.infer<typeof createActivitySchema>;
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;
