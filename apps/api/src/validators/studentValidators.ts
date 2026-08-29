import { z } from 'zod';

export const EXPECTED_IMPORT_COLUMNS = [
  'email',
  'fullName',
  'indexNumber',
  'dateOfBirth',
  'address',
  'nicNumber',
  'gender',
  'olYear',
  'alYear',
] as const;

const optionalInt = z
  .string()
  .optional()
  .transform((val) => (val === undefined || val === '' ? undefined : val))
  .refine((val) => val === undefined || /^\d+$/.test(val), 'Must be a whole number')
  .transform((val) => (val === undefined ? undefined : parseInt(val, 10)));

const optionalTrimmedString = z
  .string()
  .max(255, 'Must be 255 characters or fewer')
  .optional()
  .transform((val) => (val === undefined || val.trim() === '' ? undefined : val.trim()));

/**
 * Shared factories for search-only numeric query params: whole-number strings,
 * always bounded. Kept separate from `optionalInt` above since that one is also
 * used by the CSV import schema and changing its bounds would affect bulk-import
 * behavior outside this endpoint's scope. Split into "optional" (no default,
 * stays optional) and "with default" (always resolves to a number) so each
 * keeps a precise inferred type rather than a shared `number | undefined`.
 */
function optionalBoundedInt(config: { min: number; max: number; label: string }) {
  const { min, max, label } = config;
  return z
    .string()
    .optional()
    .transform((val) => (val === undefined || val === '' ? undefined : val))
    .refine((val) => val === undefined || /^\d+$/.test(val), `${label} must be a whole number`)
    .transform((val) => (val === undefined ? undefined : parseInt(val, 10)))
    .refine((val) => val === undefined || (val >= min && val <= max), `${label} must be between ${min} and ${max}`);
}

function boundedIntWithDefault(config: { defaultValue: number; min: number; max: number; label: string }) {
  const { defaultValue, min, max, label } = config;
  return z
    .string()
    .optional()
    .transform((val) => (val === undefined || val === '' ? String(defaultValue) : val))
    .refine((val) => /^\d+$/.test(val), `${label} must be a whole number`)
    .transform((val) => parseInt(val, 10))
    .refine((val) => val >= min && val <= max, `${label} must be between ${min} and ${max}`);
}

const searchOlYearSchema = optionalBoundedInt({ min: 1900, max: 2100, label: 'olYear' });
const searchAlYearSchema = optionalBoundedInt({ min: 1900, max: 2100, label: 'alYear' });
const pageSchema = boundedIntWithDefault({ defaultValue: 1, min: 1, max: 100_000, label: 'page' });
const pageSizeSchema = boundedIntWithDefault({ defaultValue: 20, min: 1, max: 100, label: 'pageSize' });

export const studentSearchQuerySchema = z
  .object({
    fullName: optionalTrimmedString,
    studentId: optionalTrimmedString,
    nicNumber: optionalTrimmedString,
    olYear: searchOlYearSchema,
    alYear: searchAlYearSchema,
    page: pageSchema,
    pageSize: pageSizeSchema,
  })
  .strict()
  .refine(
    (data) =>
      data.fullName !== undefined ||
      data.studentId !== undefined ||
      data.nicNumber !== undefined ||
      data.olYear !== undefined ||
      data.alYear !== undefined,
    { message: 'At least one search filter (fullName, studentId, nicNumber, olYear, alYear) is required' }
  );

export type StudentSearchQuery = z.infer<typeof studentSearchQuerySchema>;

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
  gender: z
    .string()
    .optional()
    .transform((val) => (val === undefined || val.trim() === '' ? undefined : val.trim().toUpperCase()))
    .refine(
      (val) => val === undefined || ['MALE', 'FEMALE', 'OTHER'].includes(val),
      'gender must be MALE, FEMALE, or OTHER'
    )
    .transform((val) => val as 'MALE' | 'FEMALE' | 'OTHER' | undefined),
  olYear: optionalInt,
  alYear: optionalInt,
});

export type StudentImportRow = z.infer<typeof studentImportRowSchema>;

// Self-service edits (Personal Information card, PATCH /api/students/me).
// Identity/administrative fields (fullName, indexNumber, dateOfBirth,
// olYear, alYear, assignedClass) are intentionally excluded — those stay
// staff-managed, matching the CSV import / search flows above.
export const updateMyProfileSchema = z
  .object({
    address: z.string().trim().min(1, 'Address is required').max(500).optional(),
    nicNumber: z
      .string()
      .trim()
      .max(20)
      .optional()
      .transform((val) => (val === '' ? null : val)),
    email: z.string().email().endsWith('@edu.com', 'Email must end with @edu.com').optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' });

export type UpdateMyProfileInput = z.infer<typeof updateMyProfileSchema>;

export const upsertGuardianSchema = z
  .object({
    guardianName: z.string().trim().min(1, 'Guardian name is required').max(255),
    primaryPhone: z.string().trim().min(1, 'Primary phone number is required').max(30),
    emergencyContactPhone: z
      .string()
      .trim()
      .max(30)
      .optional()
      .transform((val) => (val === undefined || val === '' ? null : val)),
  })
  .strict();

export type UpsertGuardianInput = z.infer<typeof upsertGuardianSchema>;

/**
 * Single-record equivalent of `studentImportRowSchema` for `POST /api/students`.
 * Same field rules (including the `@edu.com` email domain restriction), but
 * shaped for a JSON body — `olYear`/`alYear` arrive as numbers, not CSV
 * strings, and `classId` lets a caller enroll the new student immediately.
 */
export const createStudentSchema = z.object({
  email: z.string().trim().toLowerCase().email().endsWith('@edu.com', 'Email must end with @edu.com'),
  fullName: z.string().trim().min(1, 'fullName is required'),
  indexNumber: z.string().trim().min(1, 'indexNumber is required'),
  dateOfBirth: z
    .string()
    .min(1, 'dateOfBirth is required')
    .refine((val) => !isNaN(Date.parse(val)), 'dateOfBirth must be a valid date'),
  address: z.string().trim().min(1, 'address is required'),
  nicNumber: z
    .string()
    .trim()
    .optional()
    .transform((val) => (val === undefined || val === '' ? undefined : val)),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  olYear: z.coerce.number().int().min(1900).max(2100).optional(),
  alYear: z.coerce.number().int().min(1900).max(2100).optional(),
  classId: z.coerce.number().int().positive().optional(),
});

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
