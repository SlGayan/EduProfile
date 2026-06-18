import { z } from 'zod';

export const createClassSchema = z.object({
    name: z.string().min(1, 'Class name is required'),
    teacherId: z.number().int().positive().optional(),
});

export const updateClassSchema = z.object({
    name: z.string().min(1, 'Class name is required').optional(),
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
