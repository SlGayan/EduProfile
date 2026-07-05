import { z } from 'zod';

export const EXPECTED_IMPORT_COLUMNS = [
  'email',
  'fullName',
  'indexNumber',
  'dateOfBirth',
  'address',
  'nicNumber',
  'olYear',
  'alYear',
] as const;

const optionalInt = z
  .string()
  .optional()
  .transform((val) => (val === undefined || val === '' ? undefined : val))
  .refine((val) => val === undefined || /^\d+$/.test(val), 'Must be a whole number')
  .transform((val) => (val === undefined ? undefined : parseInt(val, 10)));

export const studentImportRowSchema = z.object({
  email: z.string().email().endsWith('@edu.com', 'Email must end with @edu.com'),
  fullName: z.string().min(1, 'fullName is required'),
  indexNumber: z.string().min(1, 'indexNumber is required'),
  dateOfBirth: z
    .string()
    .min(1, 'dateOfBirth is required')
    .refine((val) => !isNaN(Date.parse(val)), 'dateOfBirth must be a valid date'),
  address: z.string().min(1, 'address is required'),
  nicNumber: z
    .string()
    .optional()
    .transform((val) => (val === undefined || val === '' ? undefined : val)),
  olYear: optionalInt,
  alYear: optionalInt,
});

export type StudentImportRow = z.infer<typeof studentImportRowSchema>;
