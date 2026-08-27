/**
 * Types and pure helpers for the extracurricular activities feature.
 */

import { apiFetch } from "@/lib/apiFetch"

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
  status?: "PENDING" | "APPROVED" | "NEEDS_CORRECTION" | "REJECTED"
  evidenceUrl?: string | null
  teacherNote?: string | null
  reviewedByName?: string | null
  reviewedAt?: string | null
  studentName?: string
  admissionNumber?: string | null
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

/**
 * Shared with the teacher dashboard's pending-activities stat card: both use
 * the query key "pending-activities" so the count and the full review table
 * read from the same cache entry instead of issuing duplicate requests.
 */
export async function fetchPendingActivities(): Promise<Activity[]> {
  const response = await apiFetch("/api/teachers/me/pending-activities")
  if (!response.ok) {
    throw new Error("Failed to load pending activities")
  }
  return response.json()
}
