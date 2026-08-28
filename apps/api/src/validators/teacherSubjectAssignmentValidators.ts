import { z } from 'zod';

export const createAssignmentSchema = z.object({
    teacherId: z.number().int().positive(),
    subjectId: z.number().int().positive(),
    classId: z.number().int().positive(),
});

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
