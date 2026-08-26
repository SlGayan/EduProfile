export interface StudyMaterial {
  id: string
  title: string
  description: string | null
  fileUrl: string
  fileType: string
  classId: string | null
  subjectId: string | null
  uploadedBy: { id: string; name: string | null }
  createdAt: string
}

export interface ClassOption {
  id: string
  name: string
}

export interface SubjectOption {
  id: string
  name: string
}

export interface SubjectAssignment {
  classId: string
  className: string
  subjectId: string
  subjectName: string
}

/**
 * Mirrors apps/api's ALLOWED_MATERIAL_MIME_TYPES exactly (materialValidators.ts)
 * so the file input and any client-side pre-check never accept something the
 * server will reject.
 */
export const ALLOWED_MATERIAL_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const

/**
 * Display-only — the real limit is server-side and configurable via
 * MAX_MATERIAL_UPLOAD_MB in apps/api/.env. If that env var changes, this
 * constant silently drifts; there is no endpoint to fetch the real value.
 */
export const MAX_MATERIAL_UPLOAD_MB = 10

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Moved to `lib/utils.ts` during Story 10.2 — a third feature needed it and the
 * story forbade a third copy. Re-exported so every existing caller and
 * `lib/__tests__/materials.test.ts` keep working against `../materials`.
 */
export { extractApiError } from "./utils"
