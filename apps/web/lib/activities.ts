/**
 * Types and pure helpers for the extracurricular activities feature.
 *
 * NOTE: this is a deliberate STRICT SUBSET of the same file on the Story 8.3
 * branch (`feat/web/extracurricular-activity-ui`), which additionally exports
 * `canManageActivities` and `extractApiError` for the teacher-facing UI.
 * Story 8.4 needs neither — it has no form and no role gate — so they are
 * omitted here. Everything below is byte-identical to 8.3's version, so when
 * that branch merges, resolving the conflict is "take theirs" with no loss.
 */

/**
 * An activity as returned by the API.
 *
 * `id` is a STRING — the API serializes ids via `String(a.id)`. Typing it as a
 * number and interpolating the result into a URL is how you end up requesting
 * a different record.
 */
export interface Activity {
  id: string
  activityName: string
  activityType: string
  description: string | null
  startDate: string
  endDate: string | null
  achievements: string | null
}

/**
 * Converts the API's ISO datetime (`2026-01-15T00:00:00.000Z`) to a plain
 * `YYYY-MM-DD` calendar date.
 *
 * Mirrors `formatDate` in studentSearch.ts, but returns "" rather than echoing
 * the input on failure.
 */
export function toDateInputValue(iso: string | null): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toISOString().slice(0, 10)
}

/** Renders an activity's date span for the list view. */
export function formatDateRange(startDate: string, endDate: string | null): string {
  const start = toDateInputValue(startDate)
  const end = endDate ? toDateInputValue(endDate) : ""
  return `${start} – ${end || "Ongoing"}`
}
