import { z } from 'zod';

export const createSubjectSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(255, 'name must be 255 characters or fewer'),
});

export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
