/**
 * Types and fetchers for the Principal Dashboard (`GET /api/principals/me/dashboard`)
 * and the "View Pending Marks" page (`GET /api/principals/me/pending-marks`).
 *
 * Both endpoints share one query-string contract: `year`, `term`, `gradeLevel`,
 * `classId` are all optional and independently omittable. `classId` is the most
 * specific filter — when set, the API pins `year`/`gradeLevel` to that class's
 * own values and echoes them back in `scope`, so the client should always
 * render the returned `scope`, not the locally-held filter state, as the
 * source of truth for what is actually being shown.
 */
import { apiFetch } from "./apiFetch"
import { buildAnalyticsQuery } from "./analytics"
import { extractApiError } from "./utils"

export interface PrincipalDashboardScope {
  year: number | null
  term: number | null
  gradeLevel: number | null
  classId: number | null
  subjectId: number | null
}

export interface SubjectOption {
  id: number
  name: string
}

export interface PrincipalDashboardClassOption {
  id: number
  name: string
  gradeLevel: number
}

export interface PrincipalDashboardFilters {
  years: number[]
  grades: number[]
  classes: PrincipalDashboardClassOption[]
}

export interface PrincipalDashboardTotals {
  studentCount: number
  activeStudentCount: number
}

export interface MarksCompletion {
  percent: number | null
  classesPending: number
  classCount: number
}

export interface SchoolAverageSummary {
  current: number | null
  previousTerm: number | null
  deltaPercent: number | null
}

export interface GradePerformanceRow {
  gradeLevel: number
  average: number | null
  studentCount: number
  markCount: number
}

export interface PrincipalDashboard {
  scope: PrincipalDashboardScope
  filters: PrincipalDashboardFilters
  totals: PrincipalDashboardTotals
  marksCompletion: MarksCompletion
  reportsPending: number
  schoolAverage: SchoolAverageSummary
  gradePerformance: GradePerformanceRow[]
}

export interface PendingMarksClassRow {
  classId: number
  className: string
  gradeLevel: number
  teacherName: string | null
  studentCount: number
  expectedMarks: number
  actualMarks: number
  completionPercent: number | null
}

export interface PendingMarksResponse {
  scope: PrincipalDashboardScope
  filters: { years: number[]; grades: number[] }
  classes: PendingMarksClassRow[]
}

export interface PrincipalDashboardQuery {
  year?: number | null
  term?: number | null
  gradeLevel?: number | null
  classId?: number | null
  subjectId?: number | null
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    return extractApiError(await response.json(), fallback)
  } catch {
    return fallback
  }
}

/** `GET /api/principals/me/dashboard` — role PRINCIPAL, ADMINISTRATOR. */
export async function fetchPrincipalDashboard(
  filters: PrincipalDashboardQuery = {}
): Promise<PrincipalDashboard> {
  const query = buildAnalyticsQuery({
    year: filters.year,
    term: filters.term,
    gradeLevel: filters.gradeLevel,
    classId: filters.classId,
    subjectId: filters.subjectId,
  })
  const response = await apiFetch(`/api/principals/me/dashboard${query}`)
  if (!response.ok) {
    throw new Error(await readError(response, "Failed to load the principal dashboard"))
  }
  return (await response.json()) as PrincipalDashboard
}

/** `GET /api/principals/me/pending-marks` — role PRINCIPAL, ADMINISTRATOR. */
export async function fetchPendingMarksClasses(
  filters: PrincipalDashboardQuery = {}
): Promise<PendingMarksResponse> {
  const query = buildAnalyticsQuery({
    year: filters.year,
    term: filters.term,
    gradeLevel: filters.gradeLevel,
    classId: filters.classId,
  })
  const response = await apiFetch(`/api/principals/me/pending-marks${query}`)
  if (!response.ok) {
    throw new Error(await readError(response, "Failed to load pending marks"))
  }
  return (await response.json()) as PendingMarksResponse
}

/**
 * `GET /api/subjects` — roles TEACHER, ADMINISTRATOR, PRINCIPAL. Returns a
 * bare array of `{ id: string, name: string }`; ids are normalized to
 * numbers here to match the numeric `subjectId` the dashboard endpoints
 * expect (see `normalizeClassId` in lib/analytics.ts for the same pattern).
 */
export async function fetchSubjects(): Promise<SubjectOption[]> {
  const response = await apiFetch("/api/subjects")
  if (!response.ok) {
    throw new Error(await readError(response, "Failed to load subjects"))
  }
  const data = (await response.json()) as Array<{ id: string; name: string }>
  return data
    .map((s) => {
      const id = Number(s.id)
      return Number.isSafeInteger(id) && id > 0 ? { id, name: s.name } : null
    })
    .filter((s): s is SubjectOption => s !== null)
}

/** Renders a percentage for display. `null` becomes an em dash. */
export function formatPercent(value: number | null): string {
  if (value === null) return "—"
  return `${value}%`
}
