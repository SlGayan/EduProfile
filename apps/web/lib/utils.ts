import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Extracts a human-readable message from an API error body. Zod failures
 * return `{ error: 'Invalid input', details: [...] }` — surface the first
 * issue's message when present, since "Invalid input" alone is not useful.
 *
 * Lives here because three features need it (materials, activities, analytics).
 * `lib/materials.ts` re-exports it so its callers and tests are unaffected.
 */
export function extractApiError(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>
    if (Array.isArray(record.details) && record.details.length > 0) {
      const first = record.details[0] as { message?: unknown }
      if (typeof first?.message === "string") {
        return first.message
      }
    }
    if (typeof record.error === "string") {
      return record.error
    }
  }
  return fallback
}
