import { z } from 'zod';

/**
 * Same field rules as the bulk CSV importer's per-row schema
 * (marks.controller.ts `markRowSchema`) — a single mark is just a one-row
 * import, so it must accept/reject exactly what the CSV path does.
 */
export const createMarkSchema = z
  .object({
    studentIndexNumber: z.string().trim().min(1, 'studentIndexNumber is required'),
    subjectName: z.string().trim().min(1, 'subjectName is required'),
    term: z.coerce.number().int().min(1).max(3),
    year: z.coerce.number().int().min(2000).max(2100),
    marks: z.coerce.number().int().min(0).max(100),
  })
  .strict();

export type CreateMarkInput = z.infer<typeof createMarkSchema>;
