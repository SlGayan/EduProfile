import { z } from 'zod';

// Story 13.1 — a class is identified by (gradeLevel, section, year), not by
// free text. `name` is no longer accepted on the wire: it is derived from these
// fields on the way out (Epic 13 AD-9).
const gradeLevelSchema = z
    .number({ error: 'Grade level is required' })
    .int('Grade level must be a whole number')
    .min(1, 'Grade level must be between 1 and 13')
    .max(13, 'Grade level must be between 1 and 13');

const sectionSchema = z
    .string({ error: 'Section is required' })
    .trim()
    .min(1, 'Section is required')
    .max(50, 'Section must be 50 characters or fewer');

const yearSchema = z
    .number({ error: 'Academic year is required' })
    .int('Academic year must be a whole number')
    .min(2000, 'Year must be 2000 or later')
    .max(2100, 'Year must be 2100 or earlier');

export const createClassSchema = z.object({
    gradeLevel: gradeLevelSchema,
    section: sectionSchema,
    // Required, not optional: a class with no year silently disabled the
    // cross-class duplicate-enrolment guard before Story 13.1.
    year: yearSchema,
    teacherId: z.number().int().positive().optional(),
});

export const updateClassSchema = z.object({
    gradeLevel: gradeLevelSchema.optional(),
    section: sectionSchema.optional(),
    // Deliberately not `.nullable()` — `year` is NOT NULL on the model now, so
    // there is no longer a way to clear it.
    year: yearSchema.optional(),
    teacherId: z.number().int().positive().nullable().optional(),
});

export const addStudentSchema = z.object({
    studentId: z.number().int().positive(),
});

export const assignTeacherSchema = z.object({
    teacherId: z.number().int().positive(),
});

export type CreateClassInput = z.infer<typeof createClassSchema>;
export type UpdateClassInput = z.infer<typeof updateClassSchema>;
