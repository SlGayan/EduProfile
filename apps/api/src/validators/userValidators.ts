import { z } from 'zod';

const userRoles = ['STUDENT', 'TEACHER', 'PRINCIPAL', 'ADMINISTRATOR'] as const;

export const createUserSchema = z.object({
  email: z.string().email('Invalid email address').endsWith('@edu.com', 'Email must be @edu.com'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .regex(
      /^(?=.*[A-Za-z])(?=.*\d)/,
      'Password must contain at least one letter and one number'
    ),
  role: z.enum(userRoles, {
    message: 'Role must be one of: STUDENT, TEACHER, PRINCIPAL, ADMINISTRATOR',
  }),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
});

export const updateUserSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .endsWith('@edu.com', 'Email must be @edu.com')
    .optional(),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .regex(
      /^(?=.*[A-Za-z])(?=.*\d)/,
      'Password must contain at least one letter and one number'
    )
    .optional(),
  role: z
    .enum(userRoles, {
      message: 'Role must be one of: STUDENT, TEACHER, PRINCIPAL, ADMINISTRATOR',
    })
    .optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
