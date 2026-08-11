import { z } from 'zod';

export const ALLOWED_MATERIAL_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

const optionalTrimmedText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .optional()
    .transform((val) => (val === undefined || val === '' ? undefined : val));

// Postgres `Int` (int4) columns cap at 2147483647; anything above that must
// be rejected as invalid input rather than reaching Prisma, which throws an
// unhandled error and surfaces as a 500 instead of a 400. Exported for reuse
// against raw route params (e.g. `:id`) that aren't parsed through a Zod
// object schema.
export const POSTGRES_INT4_MAX = 2147483647;

/**
 * Multipart text fields arrive as strings even for numeric values, and an
 * omitted field arrives as `undefined`. `z.coerce.number()` alone would
 * coerce an empty string to `0`, not `undefined`, so the string is checked
 * and transformed explicitly, matching `studentValidators.ts`'s `optionalInt`.
 */
const optionalNumericId = (label: string) =>
  z
    .string()
    .optional()
    .transform((val) => (val === undefined || val === '' ? undefined : val))
    .refine((val) => val === undefined || /^\d+$/.test(val), `${label} must be a whole number`)
    .transform((val) => (val === undefined ? undefined : parseInt(val, 10)))
    .refine((val) => val === undefined || val <= POSTGRES_INT4_MAX, `${label} is too large`);

export const createMaterialSchema = z
  .object({
    title: z.string().trim().min(1, 'title is required').max(255, 'Must be 255 characters or fewer'),
    description: optionalTrimmedText(2000),
    classId: optionalNumericId('classId'),
    subjectId: optionalNumericId('subjectId'),
  })
  .strict()
  .refine((data) => data.classId !== undefined || data.subjectId !== undefined, {
    message: 'At least one of classId or subjectId is required',
    path: ['classId'],
  });

export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;

/**
 * AC4 reads "?classId= or ?subjectId=" — treated as exclusive-or: a request
 * supplying both is invalid input rather than silently picking one.
 */
export const materialListQuerySchema = z
  .object({
    classId: optionalNumericId('classId'),
    subjectId: optionalNumericId('subjectId'),
  })
  .strict()
  .refine((data) => (data.classId !== undefined) !== (data.subjectId !== undefined), {
    message: 'Exactly one of classId or subjectId is required',
    path: ['classId'],
  });

export type MaterialListQuery = z.infer<typeof materialListQuerySchema>;
