export type SortField = "indexNumber" | "fullName" | "dateOfBirth" | "olYear" | "alYear"
export type SortOrder = "asc" | "desc"

export interface SortableStudent {
  indexNumber: string
  fullName: string
  dateOfBirth: string
  olYear: number | null
  alYear: number | null
}

/**
 * Client-side sort for the currently-fetched page of search results.
 * Mirrors the comparator already used in teacher/class-marks/page.tsx —
 * numeric fields sort numerically, everything else sorts as a string
 * (including nulls, which stringify to "null" and sort accordingly).
 */
export function sortStudents<T extends SortableStudent>(students: T[], field: SortField, order: SortOrder): T[] {
  return [...students].sort((a, b) => {
    let aValue: string | number | null = a[field]
    let bValue: string | number | null = b[field]

    if (typeof aValue === "number" && typeof bValue === "number") {
      return order === "asc" ? aValue - bValue : bValue - aValue
    }

    aValue = String(aValue)
    bValue = String(bValue)
    if (aValue < bValue) return order === "asc" ? -1 : 1
    if (aValue > bValue) return order === "asc" ? 1 : -1
    return 0
  })
}

/** Formats an ISO datetime string (as returned by the API) as a plain YYYY-MM-DD date. */
export function formatDate(isoString: string): string {
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return isoString
  return date.toISOString().slice(0, 10)
}
