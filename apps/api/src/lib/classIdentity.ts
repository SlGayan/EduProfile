/**
 * Story 13.1 — the single definition of a class's human-readable name.
 *
 * Epic 13 AD-9: `Class.name` is NOT a stored column. It is derived from the
 * structured identity (`gradeLevel`, `section`) at read time and returned by
 * every endpoint that used to return the stored column, so read-only consumers
 * — the web display pages, `lib/report-export.ts` and its tests — keep working
 * untouched.
 *
 * Every call site MUST go through here. Interpolating the format inline is the
 * failure mode AD-9 exists to prevent: the moment two places spell it out, they
 * drift.
 */

/** The structural identity fields the display name is computed from. */
export interface ClassIdentity {
  gradeLevel: number;
  section: string;
}

/** `{ gradeLevel: 12, section: 'Science' }` -> `'Grade 12-Science'`. */
export function deriveClassName({ gradeLevel, section }: ClassIdentity): string {
  return `Grade ${gradeLevel}-${section}`;
}

/**
 * Convenience wrapper for response shaping: returns the row with the derived
 * `name` attached, so a handler can hand a Prisma `Class` straight to
 * `res.json()` and keep the pre-13.1 response shape.
 */
export function withClassName<T extends ClassIdentity>(cls: T): T & { name: string } {
  return { ...cls, name: deriveClassName(cls) };
}
