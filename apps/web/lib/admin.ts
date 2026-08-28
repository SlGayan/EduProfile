/**
 * Types and fetchers for the Admin Dashboard (`GET /api/admin/dashboard`),
 * role ADMINISTRATOR only. A single system-wide snapshot — no year/term/grade
 * scope picker like the Principal Dashboard has, since its purpose is "what
 * does the school look like right now", not a per-term drill-down.
 */
import { apiFetch } from "./apiFetch"
import { extractApiError } from "./utils"

export interface AdminDashboardTotals {
  totalUsers: number
  totalStudents: number
  totalTeachers: number
  totalClasses: number
}

export interface AdminDashboardAttention {
  pendingActivities: number
  unassignedClasses: number
  /** e.g. "Grade 7-B" — the first unassigned class found, or null if none. */
  unassignedClassExample: string | null
  unassignedSubjects: number
}

export interface AdminGenderDistribution {
  male: number
  female: number
  other: number
  /** Students with no `gender` recorded yet. */
  unspecified: number
}

export interface AdminGradeDistributionRow {
  gradeLevel: number
  studentCount: number
}

export interface AdminDashboard {
  totals: AdminDashboardTotals
  attentionRequired: AdminDashboardAttention
  genderDistribution: AdminGenderDistribution
  gradeDistribution: AdminGradeDistributionRow[]
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    return extractApiError(await response.json(), fallback)
  } catch {
    return fallback
  }
}

/** `GET /api/admin/dashboard` — role ADMINISTRATOR. */
export async function fetchAdminDashboard(): Promise<AdminDashboard> {
  const response = await apiFetch("/api/admin/dashboard")
  if (!response.ok) {
    throw new Error(await readError(response, "Failed to load the admin dashboard"))
  }
  return (await response.json()) as AdminDashboard
}

/** `POST /api/subjects` — role ADMINISTRATOR. */
export async function createSubject(name: string): Promise<{ id: string; name: string }> {
  const response = await apiFetch("/api/subjects", {
    method: "POST",
    body: JSON.stringify({ name }),
  })
  if (!response.ok) {
    throw new Error(await readError(response, "Failed to create subject"))
  }
  return (await response.json()) as { id: string; name: string }
}
