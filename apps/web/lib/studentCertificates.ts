/**
 * Types and pure helpers for the student-added certificates feature (course
 * and competition certificates the student self-reports, distinct from the
 * principal-issued Character Certificate shown elsewhere on the same page).
 *
 * Mirrors lib/activities.ts: same review workflow (PENDING / APPROVED /
 * NEEDS_CORRECTION / REJECTED), same `id`-is-a-string contract (the API
 * serializes ids via `String(c.id)`).
 */
import { apiFetch } from "@/lib/apiFetch"

export interface StudentCertificate {
  id: string
  title: string
  issuingOrganization: string
  category: string | null
  issueDate: string
  description: string | null
  evidenceUrl: string | null
  fileUrl: string | null
  fileType: string | null
  status?: "PENDING" | "APPROVED" | "NEEDS_CORRECTION" | "REJECTED"
  teacherNote?: string | null
  reviewedByName?: string | null
  reviewedAt?: string | null
  studentName?: string
  admissionNumber?: string | null
}

/** Mirrors toDateInputValue in lib/activities.ts. */
export function toDateInputValue(iso: string | null): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toISOString().slice(0, 10)
}

/**
 * fileUrl carries the blob storage key with its real extension (e.g.
 * `student-certificates/student-3-<uuid>.pdf`) — used client-side only to
 * pick a download filename extension, matching extensionFromFileUrl in
 * student/materials/page.tsx.
 */
export function extensionFromFileUrl(fileUrl: string): string {
  const match = /\.[^./\\]+$/.exec(fileUrl)
  return match ? match[0] : ""
}

/**
 * Shared with the teacher dashboard's pending-approvals stat card: both use
 * the query key "pending-student-certificates" so the count and the full
 * review table read from the same cache entry instead of issuing duplicate
 * requests.
 */
export async function fetchPendingStudentCertificates(): Promise<StudentCertificate[]> {
  const response = await apiFetch("/api/teachers/me/pending-student-certificates")
  if (!response.ok) {
    throw new Error("Failed to load pending certificates")
  }
  return response.json()
}

/** The caller's own self-added certificates, shown on the student Activities page. */
export async function fetchMyStudentCertificates(): Promise<StudentCertificate[]> {
  const response = await apiFetch("/api/students/me/student-certificates")
  if (!response.ok) {
    let message = "Failed to load your certificates"
    try {
      const data = await response.json()
      if (typeof data?.error === "string") message = data.error
    } catch {
      // no JSON body
    }
    throw new Error(message)
  }
  const data = await response.json()
  if (!Array.isArray(data)) {
    throw new Error("Unexpected response from server")
  }
  return data as StudentCertificate[]
}
