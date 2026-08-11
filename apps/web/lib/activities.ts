/**
 * Types and pure helpers for the extracurricular activities feature.
 *
 * Kept separate from the component (as `studentSearch.ts` is from
 * `student-search.tsx`) so the date and error-shaping logic is unit-testable
 * without rendering anything.
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
 * Converts the API's ISO datetime (`2026-01-15T00:00:00.000Z`) to the
 * `YYYY-MM-DD` value an `<input type="date">` requires — which is also the only
 * date format the API accepts back.
 *
 * Mirrors `formatDate` in studentSearch.ts, but returns "" rather than echoing
 * the input on failure, because an invalid value in a date input silently
 * blanks the field anyway.
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

/**
 * Whether a role may use the activities UI.
 *
 * The search screen is shared by the teacher, admin AND principal routes, but
 * the activities endpoints admit only TEACHER and ADMINISTRATOR — a principal
 * who clicked through would get a 403 with no recourse, so the control is
 * hidden for them. Roles are stored lowercase (see lib/types.ts), and
 * ADMINISTRATOR is normalized to "admin".
 */
export function canManageActivities(role: string | undefined | null): boolean {
  return role === "teacher" || role === "admin"
}

interface ZodIssueLike {
  path?: unknown
  message?: unknown
}

/**
 * Turns an API error body into something worth showing a teacher.
 *
 * Validation failures come back as `{ error: 'Invalid input', details: [...] }`.
 * "Invalid input" on its own tells the user nothing, so the first Zod issue's
 * message is preferred, prefixed with its field unless the message already
 * names it (avoiding "endDate: endDate must be on or after startDate").
 */
export function extractApiError(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback

  const data = body as { error?: unknown; details?: unknown }

  if (Array.isArray(data.details) && data.details.length > 0) {
    const issue = data.details[0] as ZodIssueLike
    if (typeof issue?.message === "string" && issue.message.length > 0) {
      const field = Array.isArray(issue.path) ? String(issue.path[0] ?? "") : ""
      if (field && !issue.message.includes(field)) {
        return `${field}: ${issue.message}`
      }
      return issue.message
    }
  }

  if (typeof data.error === "string" && data.error.length > 0) return data.error

  return fallback
}
